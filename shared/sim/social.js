// Social systems: parties, invitations, duels, the opt-in PvP flag + border war zones, honor and
// player-to-player trading. Everything is server-authoritative and every request is re-validated
// here (the offline LocalServer calls the sim without server/lib/validate.js). Functions take the
// simulation instance `S` (see index.js) as their first argument. See shared/protocol.js "SOCIAL".
import { warZoneAt, inSafeZone, WAR_ZONES } from './world.js';
import { addItem } from './items.js';
import { q2 } from './util.js';

export const PARTY_MAX = 5;
export const INVITE_MS = 30000;
export const PARTY_RANGE = 110;          // shared XP / quest credit radius (m)
export const DUEL_RANGE = 30;            // challenge / accept distance (m)
export const DUEL_RING = 35;             // ring radius around the duel centre (m)
export const DUEL_COUNTDOWN_MS = 3000;
export const DUEL_MAX_MS = 180000;
export const PVP_TOGGLE_CD_MS = 10000;
export const PVP_COMBAT_MS = 15000;      // PvP combat lock (no flag-off, no trades)
export const PVP_DAMAGE_MUL = 0.6;
export const DR_WINDOW_MS = 15000;
export const DR_STEPS = [1, 0.5, 0.25];  // 4th application within the window: immune
export const TRADE_RANGE = 12;
export const TRADE_MAX_ITEMS = 6;
export const BAG_SLOTS = 40;
export const HONOR_REPEAT_MS = 600000;   // killing the same player again within 10 min gives no honor

const isStr = (v, max = 48) => typeof v === 'string' && v.length > 0 && v.length <= max;
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

export function initSocial(S) {
  S.social = { parties: new Map(), duels: new Map(), trades: new Map(), n: 0, trades_done: 0, log: S.opts.log ?? null };
}

/** Per-player social fields (called from addPlayer). */
export function initPlayerSocial(p, saved) {
  p.party = null; p.pvp = false; p.pvpAt = -1e9; p.pvpCombatUntil = 0; p.pvpEff = 0; p.war = null;
  p.duel = null; p.duelLive = false; p.trade = null; p.invites = [];
  p.honor = saved?.honor ?? 0; p.pvpKills = saved?.pvpKills ?? 0; p.honorLog = new Map();
  p.socTokens = 8; p.socT = 0; p.dr = null; p.lastPvpAttacker = null; p.partySig = '';
}

// ------------------------------------------------------------------------------------------------ helpers
function sid(S, prefix) { return `${prefix}${(++S.social.n).toString(36)}`; }

/** Token bucket for social requests (8 burst, 2/s). Bots are exempt. */
function allowed(S, p) {
  if (p.bot) return true;
  p.socTokens = Math.min(8, p.socTokens + ((S.t - p.socT) / 1000) * 2);
  p.socT = S.t;
  if (p.socTokens < 1) { S.sysTo(p, 'You are doing that too quickly.'); return false; }
  p.socTokens -= 1;
  return true;
}

/** Resolve a player by entity id or (case-insensitive) name. */
export function findPlayer(S, ref) {
  if (!isStr(ref, 48)) return null;
  const byId = S.players.get(ref);
  if (byId) return byId;
  const n = ref.trim().toLowerCase();
  for (const q of S.players.values()) if (q.name.toLowerCase() === n) return q;
  return null;
}

function invite(S, from, to, kind, extra = {}) {
  to.invites = to.invites.filter((i) => !(i.kind === kind && i.from === from.id));
  if (to.invites.length >= 6) to.invites.shift();
  const inv = { kind, from: from.id, until: S.t + INVITE_MS, ...extra };
  to.invites.push(inv);
  S.evTo(to, { type: 'invite', kind, from: from.id, name: from.name, until: Math.round(S.wall0 + inv.until), state: 'open', lvl: from.lvl, oath: from.oath });
  if (to.bot) S.botInvited?.(to, inv);
  return inv;
}

function takeInvite(S, p, kind, from) {
  const i = p.invites.findIndex((x) => x.kind === kind && (from == null || x.from === from) && x.until > S.t);
  if (i < 0) return null;
  const inv = p.invites[i];
  p.invites.splice(i, 1);
  S.evTo(p, { type: 'invite', kind, from: inv.from, state: 'closed' });
  return inv;
}

/** Expire invitations (called every 10 ticks). */
function expireInvites(S, p) {
  if (!p.invites.length) return;
  for (let i = p.invites.length - 1; i >= 0; i--) {
    const inv = p.invites[i];
    if (inv.until > S.t && S.players.has(inv.from)) continue;
    p.invites.splice(i, 1);
    S.evTo(p, { type: 'invite', kind: inv.kind, from: inv.from, state: 'closed', reason: 'expired' });
    const from = S.players.get(inv.from);
    if (from) S.sysTo(from, `Your ${inv.kind === 'party' ? 'party invitation' : inv.kind === 'duel' ? 'duel challenge' : 'trade request'} to ${p.name} expired.`);
  }
}

function decline(S, p, kind, fromId) {
  const inv = takeInvite(S, p, kind, fromId ?? null);
  if (!inv) return;
  const from = S.players.get(inv.from);
  if (from) S.sysTo(from, `${p.name} declines your ${kind === 'party' ? 'party invitation' : kind === 'duel' ? 'duel challenge' : 'trade request'}.`);
}

// ------------------------------------------------------------------------------------------------ PvP rules
/** Live PvP state of a player: 0 none, 1 flagged, 2 war zone (auto-flag). Never inside a sanctuary. */
export function updatePvpZone(S, p) {
  const w = warZoneAt(p.x, p.z);
  const safe = inSafeZone(p.x, p.z);
  const eff = safe ? 0 : w ? 2 : p.pvp ? 1 : 0;
  if (eff !== p.pvpEff) { p.pvpEff = eff; p.youDirty = true; }
  const wid = w ? w.id : null;
  if (wid !== p.war) {
    p.war = wid;
    S.evTo(p, { type: 'warzone', id: p.id, zone: w ? { id: w.id, name: w.name, x: w.x, z: w.z, r: w.r } : null });
    if (w && !p.bot) S.sysTo(p, `You enter ${w.name}, a contested border. Everyone here may attack you.`);
  }
}

const ownerOf = (e) => (e.k === 'p' ? e : e.ownerEnt ?? null);

/**
 * Player-vs-player hostility (both sides TEAM_PLAYER). Duel partners may always fight each other
 * (a consensual exception to the party / sanctuary rules); otherwise both must be effectively
 * flagged (flag or war zone), outside every sanctuary, and not in the same party.
 */
export function pvpHostile(a, b) {
  const pa = ownerOf(a), pb = ownerOf(b);
  if (!pa || !pb || pa === pb || !pa.alive || !pb.alive) return false;
  if (pa.duelLive && pb.duelLive && pa.duel === pb.duel) return true;
  if (!pa.pvpEff || !pb.pvpEff) return false;
  if (pa.party != null && pa.party === pb.party) return false;
  if (inSafeZone(pa.x, pa.z) || inSafeZone(pb.x, pb.z)) return false;
  return true;
}

/** True when this damage is player-vs-player (attacker credit and victim are different players). */
export const isPvp = (credit, dst) => !!credit && credit.k === 'p' && dst.k === 'p' && credit !== dst;

/** Crowd-control diminishing returns for PvP: returns the duration multiplier, 0 = immune. */
export function diminish(S, dst, kind) {
  if (kind !== 'stun' && kind !== 'root' && kind !== 'slow') return 1;
  dst.dr ??= {};
  let d = dst.dr[kind];
  if (!d || S.t >= d.reset) d = dst.dr[kind] = { n: 0, reset: 0 };
  const f = d.n < DR_STEPS.length ? DR_STEPS[d.n] : 0;
  d.n++; d.reset = S.t + DR_WINDOW_MS;
  return f;
}

export function onPvpDamage(S, credit, dst) {
  credit.pvpCombatUntil = dst.pvpCombatUntil = S.t + PVP_COMBAT_MS;
  dst.lastPvpAttacker = credit.id;
}

/** A player killed another player outside a duel: kill credit + honor (anti-farm). */
export function onPvpKill(S, killer, victim) {
  killer.pvpKills++;
  const last = killer.honorLog.get(victim.id) ?? -1e12;
  let gain = 0;
  if (S.t - last >= HONOR_REPEAT_MS && victim.lvl >= killer.lvl - 10) gain = Math.max(1, Math.round(10 + (victim.lvl - killer.lvl) * 1.5));
  killer.honorLog.set(victim.id, S.t);
  if (killer.honorLog.size > 64) killer.honorLog.delete(killer.honorLog.keys().next().value);
  killer.honor += gain;
  killer.youDirty = true; killer.saveDirty = true;
  S.evTo(killer, { type: 'honor', id: killer.id, victim: victim.id, name: victim.name, honor: gain, total: killer.honor, kills: killer.pvpKills });
  S.sysTo(killer, gain ? `You defeated ${victim.name} (+${gain} honor).` : `You defeated ${victim.name} (no honor: defeated recently or far below your level).`);
  S.system(`${killer.name} has slain ${victim.name} in open combat.`, victim.x, victim.z, 120);
}

function setPvp(S, p, on) {
  on = !!on;
  if (on === p.pvp) return;
  const wait = p.pvpAt + PVP_TOGGLE_CD_MS - S.t;
  if (wait > 0) return S.sysTo(p, `You can change your PvP flag again in ${Math.ceil(wait / 1000)} s.`);
  if (!on && p.pvpCombatUntil > S.t) return S.sysTo(p, 'You cannot lower your banner during player combat.');
  p.pvp = on; p.pvpAt = S.t;
  updatePvpZone(S, p);
  p.youDirty = true;
  S.evTo(p, { type: 'pvp', id: p.id, on, cd: Math.round(S.wall0 + p.pvpAt + PVP_TOGGLE_CD_MS) });
  if (!p.bot) S.sysTo(p, on ? 'You raise the PvP banner: other flagged players may attack you in the wilds (never in a sanctuary).' : 'You lower the PvP banner.');
}

// ------------------------------------------------------------------------------------------------ parties
export const partyOf = (S, p) => (p.party ? S.social.parties.get(p.party) ?? null : null);
export function partyMembers(S, p) {
  const pt = partyOf(S, p);
  if (!pt) return [];
  const out = [];
  for (const id of pt.members) { const m = S.players.get(id); if (m) out.push(m); }
  return out;
}

function memberView(S, m) {
  return { id: m.id, name: m.name, oath: m.oath, cls: m.cls, lvl: m.lvl, hp: Math.ceil(m.hp), mhp: m.mhp, mp: Math.floor(m.mp), mmp: m.mmp, alive: m.alive, x: Math.round(m.x), z: Math.round(m.z), pvp: m.pvpEff, tgt: m.tgt ?? null };
}

function partyView(S, pt) {
  return { id: pt.id, leader: pt.leader, members: pt.members.map((id) => S.players.get(id)).filter(Boolean).map((m) => memberView(S, m)) };
}

function broadcastParty(S, pt, force = true) {
  const view = partyView(S, pt);
  const sig = JSON.stringify(view);
  if (!force && sig === pt.sig) return;
  pt.sig = sig;
  for (const id of pt.members) { const m = S.players.get(id); if (m) S.evTo(m, { type: 'party', id: m.id, party: view }); }
}

function partyInvite(S, p, ref) {
  const q = findPlayer(S, ref);
  if (!q || q === p) return S.sysTo(p, 'No such adventurer is abroad.');
  const pt = partyOf(S, p);
  if (pt && pt.leader !== p.id) return S.sysTo(p, 'Only the party leader can invite.');
  if (pt && pt.members.length >= PARTY_MAX) return S.sysTo(p, `Your party is full (${PARTY_MAX}).`);
  if (q.party && q.party === p.party) return S.sysTo(p, `${q.name} is already in your party.`);
  if (q.party) return S.sysTo(p, `${q.name} is already in a party.`);
  invite(S, p, q, 'party');
  S.sysTo(p, `You invite ${q.name} to your party.`);
}

function partyAccept(S, p, fromId) {
  if (p.party) { takeInvite(S, p, 'party', fromId); return S.sysTo(p, 'Leave your current party first.'); }
  const inv = takeInvite(S, p, 'party', fromId);
  if (!inv) return S.sysTo(p, 'That invitation is no longer open.');
  const from = S.players.get(inv.from);
  if (!from) return S.sysTo(p, 'That invitation is no longer open.');
  let pt = partyOf(S, from);
  if (pt && pt.leader !== from.id) return S.sysTo(p, `${from.name} is no longer leading a party.`);
  if (!pt) {
    pt = { id: sid(S, 'pt'), leader: from.id, members: [from.id], sig: '' };
    S.social.parties.set(pt.id, pt);
    from.party = pt.id;
  }
  if (pt.members.length >= PARTY_MAX) return S.sysTo(p, 'That party is full.');
  pt.members.push(p.id);
  p.party = pt.id;
  for (const m of partyMembers(S, p)) S.sysTo(m, m === p ? `You join ${from.name}'s party.` : `${p.name} joins the party.`);
  broadcastParty(S, pt);
}

export function partyLeave(S, p, reason = 'left') {
  const pt = partyOf(S, p);
  if (!pt) return;
  pt.members = pt.members.filter((id) => id !== p.id);
  p.party = null;
  S.evTo(p, { type: 'party', id: p.id, party: null });
  if (reason !== 'silent') S.sysTo(p, reason === 'kicked' ? 'You were removed from the party.' : 'You leave the party.');
  if (pt.members.length <= 1) {
    for (const id of pt.members) { const m = S.players.get(id); if (m) { m.party = null; S.evTo(m, { type: 'party', id: m.id, party: null }); S.sysTo(m, 'Your party has disbanded.'); } }
    S.social.parties.delete(pt.id);
    return;
  }
  if (pt.leader === p.id) pt.leader = pt.members[0];
  for (const id of pt.members) {
    const m = S.players.get(id);
    if (m) S.sysTo(m, `${p.name} ${reason === 'kicked' ? 'was removed from' : 'left'} the party.${pt.leader === m.id && reason !== 'kicked' && pt.leader !== p.id ? ' You now lead.' : ''}`);
  }
  broadcastParty(S, pt);
}

function partyKick(S, p, ref) {
  const pt = partyOf(S, p);
  if (!pt || pt.leader !== p.id) return S.sysTo(p, 'Only the party leader can remove members.');
  const q = findPlayer(S, ref);
  if (!q || q === p || q.party !== pt.id) return S.sysTo(p, 'They are not in your party.');
  partyLeave(S, q, 'kicked');
}

function partyLead(S, p, ref) {
  const pt = partyOf(S, p);
  if (!pt || pt.leader !== p.id) return S.sysTo(p, 'Only the party leader can pass leadership.');
  const q = findPlayer(S, ref);
  if (!q || q === p || q.party !== pt.id) return S.sysTo(p, 'They are not in your party.');
  pt.leader = q.id;
  for (const m of partyMembers(S, p)) S.sysTo(m, `${q.name} now leads the party.`);
  broadcastParty(S, pt);
}

function partyDisband(S, p) {
  const pt = partyOf(S, p);
  if (!pt || pt.leader !== p.id) return S.sysTo(p, 'Only the party leader can disband the party.');
  for (const m of partyMembers(S, p)) { m.party = null; S.evTo(m, { type: 'party', id: m.id, party: null }); S.sysTo(m, 'The party has been disbanded.'); }
  S.social.parties.delete(pt.id);
}

/** Recipients of kill rewards: contributors plus their party members alive within PARTY_RANGE of the kill. */
export function rewardRecipients(S, contributors, dst) {
  const out = new Set(contributors);
  for (const c of contributors) {
    if (!c.party) continue;
    for (const m of partyMembers(S, c)) if (m.alive && dist2(m, dst) < PARTY_RANGE * PARTY_RANGE) out.add(m);
  }
  return [...out];
}

// ------------------------------------------------------------------------------------------------ duels
function duelChallenge(S, p, ref) {
  const q = findPlayer(S, ref);
  if (!q || q === p) return S.sysTo(p, 'No such adventurer is abroad.');
  if (!p.alive || !q.alive) return S.sysTo(p, 'Both duellists must be standing.');
  if (p.duel || q.duel) return S.sysTo(p, p.duel ? 'You are already duelling.' : `${q.name} is already duelling.`);
  if (dist2(p, q) > DUEL_RANGE * DUEL_RANGE) return S.sysTo(p, `${q.name} is too far away to challenge.`);
  invite(S, p, q, 'duel');
  S.sysTo(p, `You challenge ${q.name} to a duel.`);
}

function duelEvent(S, d, e, spectators = true) {
  const a = S.players.get(d.a), b = S.players.get(d.b);
  const ev = { type: 'duel', id: d.id, a: d.a, b: d.b, an: d.an, bn: d.bn, x: q2(d.x), z: q2(d.z), r: d.r, ...e };
  if (a) S.evTo(a, ev);
  if (b) S.evTo(b, ev);
  if (spectators) S.pgrid.forEachNear(d.x, d.z, 120, (q) => { if (q !== a && q !== b) S.evTo(q, ev); });
}

function duelAccept(S, p, fromId) {
  const inv = takeInvite(S, p, 'duel', fromId);
  if (!inv) return S.sysTo(p, 'That challenge is no longer open.');
  const q = S.players.get(inv.from);
  if (!q || !q.alive || !p.alive || q.duel || p.duel) return S.sysTo(p, 'The duel cannot begin.');
  if (dist2(p, q) > DUEL_RANGE * DUEL_RANGE) return S.sysTo(p, `${q.name} is too far away.`);
  const d = { id: sid(S, 'du'), a: q.id, b: p.id, an: q.name, bn: p.name, x: (p.x + q.x) / 2, z: (p.z + q.z) / 2, r: DUEL_RING, state: 'countdown', at: S.t + DUEL_COUNTDOWN_MS, until: S.t + DUEL_COUNTDOWN_MS + DUEL_MAX_MS };
  S.social.duels.set(d.id, d);
  p.duel = q.duel = d.id; p.duelLive = q.duelLive = false;
  if (p.trade) cancelTrade(S, S.social.trades.get(p.trade), 'duel');
  if (q.trade) cancelTrade(S, S.social.trades.get(q.trade), 'duel');
  duelEvent(S, d, { state: 'countdown', at: Math.round(S.wall0 + d.at) });
}

export function endDuel(S, d, winner, loser, reason) {
  if (!d || d.state === 'end') return;
  d.state = 'end';
  S.social.duels.delete(d.id);
  for (const id of [d.a, d.b]) {
    const m = S.players.get(id);
    if (!m) continue;
    m.duel = null; m.duelLive = false;
    if (m.alive) {
      // the bout is over: lift the opponent's lingering effects and let both recover
      const opp = id === d.a ? d.b : d.a;
      const before = m.st.length;
      m.st = m.st.filter((s) => s.src !== opp);
      if (m.st.length !== before) m.fxVer++;
      if (m.hp < 1) m.hp = 1;
      m.combatUntil = Math.min(m.combatUntil, S.t);
    }
    if (m.bot && m.tgt === (id === d.a ? d.b : d.a)) m.tgt = null;
    m.youDirty = true;
  }
  duelEvent(S, d, { state: 'end', winner: winner?.id ?? null, loser: loser?.id ?? null, reason });
  const text = !winner ? `The duel between ${d.an} and ${d.bn} ends in a draw.` : reason === 'fled' ? `${loser.name} fled the ring - ${winner.name} wins the duel.`
    : reason === 'forfeit' || reason === 'logout' ? `${loser.name} forfeits - ${winner.name} wins the duel.` : `${winner.name} has defeated ${loser.name} in a duel.`;
  S.system(text, d.x, d.z, 120);
}

/** Called by combat when a duellist would drop below 1 HP from the opponent. */
export function duelDefeat(S, loser, winner) {
  const d = S.social.duels.get(loser.duel);
  if (d) endDuel(S, d, winner, loser, 'defeat');
}

function tickDuels(S) {
  for (const d of [...S.social.duels.values()]) {
    const a = S.players.get(d.a), b = S.players.get(d.b);
    if (!a || !b) { endDuel(S, d, a ?? b ?? null, a ? b : a, 'logout'); continue; }
    if (d.state === 'countdown') {
      if (!a.alive || !b.alive) { endDuel(S, d, null, null, 'cancelled'); continue; }
      if (S.t >= d.at) { d.state = 'fight'; a.duelLive = b.duelLive = true; duelEvent(S, d, { state: 'fight' }); if (a.bot) a.tgt = b.id; if (b.bot) b.tgt = a.id; }
      continue;
    }
    if (!a.alive) { endDuel(S, d, b, a, 'death'); continue; }
    if (!b.alive) { endDuel(S, d, a, b, 'death'); continue; }
    const ra = (a.x - d.x) ** 2 + (a.z - d.z) ** 2, rb = (b.x - d.x) ** 2 + (b.z - d.z) ** 2, R = d.r * d.r;
    if (ra > R) { endDuel(S, d, b, a, 'fled'); continue; }
    if (rb > R) { endDuel(S, d, a, b, 'fled'); continue; }
    if (S.t >= d.until) endDuel(S, d, null, null, 'timeout');
  }
}

function duelForfeit(S, p) {
  const d = p.duel ? S.social.duels.get(p.duel) : null;
  if (!d) return;
  const opp = S.players.get(d.a === p.id ? d.b : d.a);
  endDuel(S, d, opp ?? null, p, 'forfeit');
}

// ------------------------------------------------------------------------------------------------ trading
function tradeRequest(S, p, ref) {
  const q = findPlayer(S, ref);
  if (!q || q === p) return S.sysTo(p, 'No such adventurer is abroad.');
  const why = tradeBlock(S, p, q);
  if (why) return S.sysTo(p, why);
  invite(S, p, q, 'trade');
  S.sysTo(p, `You ask ${q.name} to trade.`);
}

function tradeBlock(S, p, q) {
  if (!p.alive || !q.alive) return 'Both traders must be alive.';
  if (p.trade || q.trade) return p.trade ? 'You are already trading.' : `${q.name} is busy trading.`;
  if (p.duel || q.duel) return 'Not during a duel.';
  if (p.combatUntil > S.t || q.combatUntil > S.t) return 'Not while in combat.';
  if (dist2(p, q) > TRADE_RANGE * TRADE_RANGE) return `${q.name} is too far away to trade (${TRADE_RANGE} m).`;
  return null;
}

const emptyOffer = () => ({ items: [], gold: 0, locked: false, confirmed: false, sig: '' });

function tradeAccept(S, p, fromId) {
  const inv = takeInvite(S, p, 'trade', fromId);
  if (!inv) return S.sysTo(p, 'That trade request is no longer open.');
  const q = S.players.get(inv.from);
  if (!q) return S.sysTo(p, 'That trade request is no longer open.');
  const why = tradeBlock(S, q, p);
  if (why) { S.sysTo(p, why); S.sysTo(q, why); return; }
  const tr = { id: sid(S, 'tr'), a: q.id, b: p.id, offers: { [q.id]: emptyOffer(), [p.id]: emptyOffer() }, ver: 0, state: 'open' };
  S.social.trades.set(tr.id, tr);
  p.trade = q.trade = tr.id;
  sendTrade(S, tr, 'open');
}

function offerView(S, owner, o) {
  const items = [];
  for (const it of o.items) { const real = owner?.inventory.find((x) => x.id === it.id); if (real) items.push({ ...real }); }
  return { items, gold: o.gold, locked: o.locked, confirmed: o.confirmed };
}

function sendTrade(S, tr, state, extra = {}) {
  for (const id of [tr.a, tr.b]) {
    const me = S.players.get(id); if (!me) continue;
    const otherId = id === tr.a ? tr.b : tr.a;
    const other = S.players.get(otherId);
    S.evTo(me, { type: 'trade', id: tr.id, state, with: otherId, name: other?.name ?? '?', ver: tr.ver, you: offerView(S, me, tr.offers[id]), them: offerView(S, other, tr.offers[otherId]), ...extra });
    if (me.bot) S.botTrade?.(me, tr, state);
  }
}

function unlockAll(tr) { for (const k in tr.offers) { tr.offers[k].locked = false; tr.offers[k].confirmed = false; } }

function tradeOffer(S, p, msg) {
  const tr = p.trade ? S.social.trades.get(p.trade) : null;
  if (!tr) return;
  const ids = Array.isArray(msg.items) ? msg.items : [];
  if (ids.length > TRADE_MAX_ITEMS) return S.sysTo(p, `You can offer at most ${TRADE_MAX_ITEMS} items.`);
  const items = [];
  const seen = new Set();
  for (const id of ids) {
    if (!isStr(id) || seen.has(id)) return;
    seen.add(id);
    const it = p.inventory.find((x) => x.id === id);
    if (!it) return S.sysTo(p, 'You do not have that item.');
    items.push({ id, qty: it.qty ?? 1 });
  }
  const gold = Number.isInteger(msg.gold) && msg.gold >= 0 ? msg.gold : 0;
  if (gold > p.gold) return S.sysTo(p, 'You do not have that much gold.');
  const o = tr.offers[p.id];
  o.items = items; o.gold = gold; o.sig = S.invSig(p);
  unlockAll(tr); // any change unlocks both sides
  tr.ver++;
  sendTrade(S, tr, 'update');
}

function tradeLock(S, p, on) {
  const tr = p.trade ? S.social.trades.get(p.trade) : null;
  if (!tr) return;
  const o = tr.offers[p.id];
  if (on) { o.locked = true; }
  else { unlockAll(tr); }
  tr.ver++;
  sendTrade(S, tr, 'update');
}

function tradeConfirm(S, p) {
  const tr = p.trade ? S.social.trades.get(p.trade) : null;
  if (!tr) return;
  const oa = tr.offers[tr.a], ob = tr.offers[tr.b];
  if (!oa.locked || !ob.locked) return S.sysTo(p, 'Both sides must lock their offers first.');
  tr.offers[p.id].confirmed = true;
  if (oa.confirmed && ob.confirmed) return commitTrade(S, tr);
  tr.ver++;
  sendTrade(S, tr, 'update');
}

export function cancelTrade(S, tr, reason = 'cancelled', by = null) {
  if (!tr || tr.state !== 'open') return;
  tr.state = 'closed';
  S.social.trades.delete(tr.id);
  for (const id of [tr.a, tr.b]) { const m = S.players.get(id); if (m && m.trade === tr.id) m.trade = null; }
  const why = { cancelled: 'was cancelled', distance: 'was cancelled: you moved too far apart', combat: 'was cancelled by combat', death: 'was cancelled: a trader fell', logout: 'was cancelled: your partner left', invalid: 'failed: an offer changed (nothing was exchanged)', duel: 'was cancelled by a duel', full: 'failed: not enough bag space (nothing was exchanged)' }[reason] ?? 'was cancelled';
  for (const id of [tr.a, tr.b]) {
    const m = S.players.get(id); if (!m) continue;
    S.evTo(m, { type: 'trade', id: tr.id, state: 'cancelled', reason, by });
    S.sysTo(m, `The trade ${why}.`);
  }
}

/** Atomic swap with full re-validation at commit time (anti-dupe): ownership, quantities, gold, bag space, range, combat. */
function commitTrade(S, tr) {
  const A = S.players.get(tr.a), B = S.players.get(tr.b);
  if (!A || !B) return cancelTrade(S, tr, 'logout');
  if (!A.alive || !B.alive) return cancelTrade(S, tr, 'death');
  if (dist2(A, B) > TRADE_RANGE * TRADE_RANGE) return cancelTrade(S, tr, 'distance');
  if (A.combatUntil > S.t || B.combatUntil > S.t) return cancelTrade(S, tr, 'combat');
  const pick = (owner, offer) => {
    const out = [];
    for (const o of offer.items) {
      const it = owner.inventory.find((x) => x.id === o.id);
      if (!it || (it.qty ?? 1) !== o.qty) return null;
      out.push(it);
    }
    return out;
  };
  const oa = tr.offers[A.id], ob = tr.offers[B.id];
  const ia = pick(A, oa), ib = pick(B, ob);
  if (!ia || !ib || oa.gold > A.gold || ob.gold > B.gold || !Number.isInteger(oa.gold) || !Number.isInteger(ob.gold)) return cancelTrade(S, tr, 'invalid');
  // bag space (conservative: incoming stackables may merge, but never count on it)
  if (A.inventory.length - ia.length + ib.length > BAG_SLOTS || B.inventory.length - ib.length + ia.length > BAG_SLOTS) return cancelTrade(S, tr, 'full');
  // swap: remove first, then add (all checks done above, nothing below can fail)
  A.inventory = A.inventory.filter((x) => !ia.includes(x));
  B.inventory = B.inventory.filter((x) => !ib.includes(x));
  for (const it of ib) addItem(A, it, BAG_SLOTS + TRADE_MAX_ITEMS);
  for (const it of ia) addItem(B, it, BAG_SLOTS + TRADE_MAX_ITEMS);
  A.gold += ob.gold - oa.gold; B.gold += oa.gold - ob.gold;
  tr.state = 'closed';
  S.social.trades.delete(tr.id);
  A.trade = B.trade = null;
  S.social.trades_done++;
  const names = (l) => (l.length ? l.map((i) => `${i.name}${(i.qty ?? 1) > 1 ? ` x${i.qty}` : ''}`).join(', ') : 'nothing');
  for (const [me, gave, got, gg, gr] of [[A, ia, ib, oa.gold, ob.gold], [B, ib, ia, ob.gold, oa.gold]]) {
    me.youDirty = true; me.saveDirty = true;
    S.persist(me);
    S.evTo(me, { type: 'trade', id: tr.id, state: 'done', gave: gave.map((i) => ({ id: i.id, name: i.name, rarity: i.rarity, qty: i.qty })), got: got.map((i) => ({ id: i.id, name: i.name, rarity: i.rarity, qty: i.qty })), goldGave: gg, goldGot: gr });
    S.sysTo(me, `Trade complete with ${me === A ? B.name : A.name}: you gave ${names(gave)}${gg ? ` and ${gg} gold` : ''}; you received ${names(got)}${gr ? ` and ${gr} gold` : ''}.`);
  }
  S.social.log?.(`trade ${tr.id}: ${A.name}(${A.id}) gave [${ia.map((i) => i.id).join(',')}]+${oa.gold}g <-> ${B.name}(${B.id}) gave [${ib.map((i) => i.id).join(',')}]+${ob.gold}g`);
}

function tickTrades(S) {
  for (const tr of [...S.social.trades.values()]) {
    const A = S.players.get(tr.a), B = S.players.get(tr.b);
    if (!A || !B) { cancelTrade(S, tr, 'logout'); continue; }
    if (!A.alive || !B.alive) { cancelTrade(S, tr, 'death'); continue; }
    if (dist2(A, B) > TRADE_RANGE * TRADE_RANGE) { cancelTrade(S, tr, 'distance'); continue; }
    if (A.combatUntil > S.t || B.combatUntil > S.t) { cancelTrade(S, tr, 'combat'); continue; }
    // an offered item moved (used, dropped, equipped) or gold dropped: unlock both so nobody confirms a stale offer
    let stale = false;
    for (const P of [A, B]) {
      const o = tr.offers[P.id];
      if ((o.items.length || o.gold) && (o.sig !== S.invSig(P) || o.gold > P.gold)) {
        o.items = o.items.filter((x) => P.inventory.some((i) => i.id === x.id && (i.qty ?? 1) === x.qty));
        o.gold = Math.min(o.gold, P.gold); o.sig = S.invSig(P); stale = true;
      }
    }
    if (stale) { unlockAll(tr); tr.ver++; sendTrade(S, tr, 'update'); }
  }
}

// ------------------------------------------------------------------------------------------------ message entry points
/** {t:'party'|'duel'|'trade'|'pvp', ...} */
export function handleSocial(S, p, msg) {
  const op = typeof msg.op === 'string' ? msg.op : '';
  const target = isStr(msg.target, 48) ? msg.target : null;
  const from = isStr(msg.from, 48) ? msg.from : null;
  if (msg.t === 'pvp') { if (allowed(S, p)) setPvp(S, p, msg.on === true); return; }
  if (!allowed(S, p)) return;
  if (msg.t === 'party') {
    switch (op) {
      case 'invite': return target && partyInvite(S, p, target);
      case 'accept': return partyAccept(S, p, from);
      case 'decline': return decline(S, p, 'party', from);
      case 'leave': return partyLeave(S, p);
      case 'kick': return target && partyKick(S, p, target);
      case 'lead': return target && partyLead(S, p, target);
      case 'disband': return partyDisband(S, p);
      default: return;
    }
  }
  if (msg.t === 'duel') {
    switch (op) {
      case 'challenge': return target && duelChallenge(S, p, target);
      case 'accept': return duelAccept(S, p, from);
      case 'decline': return decline(S, p, 'duel', from);
      case 'forfeit': return duelForfeit(S, p);
      default: return;
    }
  }
  if (msg.t === 'trade') {
    switch (op) {
      case 'request': return target && tradeRequest(S, p, target);
      case 'accept': return tradeAccept(S, p, from);
      case 'decline': return decline(S, p, 'trade', from);
      case 'offer': return tradeOffer(S, p, msg);
      case 'lock': return tradeLock(S, p, true);
      case 'unlock': return tradeLock(S, p, false);
      case 'confirm': return tradeConfirm(S, p);
      case 'cancel': { const tr = p.trade ? S.social.trades.get(p.trade) : null; return cancelTrade(S, tr, 'cancelled', p.id); }
      default: return;
    }
  }
}

/** Party chat / whispers (chat channels 'party' and 'whisper'). Returns true when handled. */
export function socialChat(S, p, text, channel, to) {
  if (channel === 'party') {
    const ms = partyMembers(S, p);
    if (!ms.length) { S.sysTo(p, 'You are not in a party.'); return true; }
    const e = { type: 'chat', from: p.id, name: p.name, text, channel: 'party', oath: p.oath };
    for (const m of ms) S.evTo(m, e);
    return true;
  }
  if (channel === 'whisper') {
    const q = findPlayer(S, to);
    if (!q || q === p) { S.sysTo(p, 'No such adventurer is abroad.'); return true; }
    const e = { type: 'chat', from: p.id, name: p.name, text, channel: 'whisper', oath: p.oath, to: q.id, toName: q.name };
    S.evTo(q, e); S.evTo(p, e);
    if (q.bot) S.botWhispered?.(q, p, text);
    return true;
  }
  return false;
}

/** Per-tick social upkeep. */
export function tickSocial(S) {
  const n = S.tickN;
  if (S.social.duels.size) tickDuels(S);
  if (n % 5 === 0 && S.social.trades.size) tickTrades(S);
  for (const p of S.players.values()) {
    if ((p.idn + n) % 4 === 0) updatePvpZone(S, p);
    if (n % 10 === 0 && p.invites.length) expireInvites(S, p);
  }
  if (n % 10 === 0) for (const pt of S.social.parties.values()) broadcastParty(S, pt, false); // 2 Hz roster (positions, hp) when changed
}

/** Re-send the private social state after a (re)join. */
export function resyncSocial(S, p) {
  const pt = partyOf(S, p);
  if (pt) S.evTo(p, { type: 'party', id: p.id, party: partyView(S, pt) });
  const d = p.duel ? S.social.duels.get(p.duel) : null;
  if (d) duelEvent(S, d, { state: d.state, at: Math.round(S.wall0 + d.at) }, false);
  const tr = p.trade ? S.social.trades.get(p.trade) : null;
  if (tr) sendTrade(S, tr, 'update');
  for (const inv of p.invites) { const f = S.players.get(inv.from); if (f) S.evTo(p, { type: 'invite', kind: inv.kind, from: f.id, name: f.name, until: Math.round(S.wall0 + inv.until), state: 'open', lvl: f.lvl, oath: f.oath }); }
  p.war = null; updatePvpZone(S, p);
}

/** Disconnect (the character may linger for token resume): cancel the trade, forfeit a duel. */
export function onDisconnect(S, p) {
  if (p.trade) cancelTrade(S, S.social.trades.get(p.trade), 'logout', p.id);
  if (p.duel) { const d = S.social.duels.get(p.duel); if (d) endDuel(S, d, S.players.get(d.a === p.id ? d.b : d.a) ?? null, p, 'logout'); }
}

/** Final removal: everything above plus leaving the party and dropping invitations. */
export function removeSocial(S, p) {
  onDisconnect(S, p);
  if (p.party) partyLeave(S, p, 'silent');
  for (const q of S.players.values()) if (q.invites.length) { const before = q.invites.length; q.invites = q.invites.filter((i) => i.from !== p.id); if (q.invites.length !== before) S.evTo(q, { type: 'invite', kind: 'any', from: p.id, state: 'closed', reason: 'logout' }); }
}

export { WAR_ZONES };
