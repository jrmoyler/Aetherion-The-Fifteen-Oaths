// Sim tests for the social systems: parties (XP split, quest credit, kick/leave/lead, cap, timeout),
// duels (countdown, ring forfeit, 1-HP end), PvP rules (flag + cooldown, safe zone, party immunity,
// war zones, damage multiplier, CC diminishing returns, honor) and trading (lock/confirm, change
// unlocks, anti-dupe re-validation, distance cancel), plus AI adventurers answering invitations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../shared/sim/index.js';
import { dealDamage, applyStatus, hasStatus, hostile } from '../../shared/sim/combat.js';
import { createMob } from '../../shared/sim/mobs.js';
import { WAR_ZONES, inSafeZone } from '../../shared/sim/world.js';
import { PVP_DAMAGE_MUL, DUEL_RING } from '../../shared/sim/social.js';
import { makeGear, makeConsumable } from '../../shared/sim/items.js';
import { spawnBot } from '../../shared/sim/bots.js';
import { validate } from '../lib/validate.js';

const DT = 0.05;
const mkSim = (opts = {}) => createSim({ seed: 11, bots: 0, campsPerRegion: 4, firstEventMs: 1e9, ...opts });
const join = (sim, id, name, oath = 'oath-09', cls = 'ninja') => { sim.addPlayer(id, { t: 'hello', name, oath, cls }); return sim._S.players.get(id); };
const run = (sim, seconds) => { const out = []; for (let i = 0; i < Math.round(seconds / DT); i++) out.push(...sim.tick(DT)); return out; };
const evs = (out, type, to) => out.filter((o) => o.msg.t === 'ev' && o.msg.e.type === type && (!to || o.to === to || o.to === '*')).map((o) => o.msg.e);
const sys = (out, to) => evs(out, 'system', to).map((e) => e.text).join(' | ');
const fixRng = (S) => { S.rng = Object.assign(() => 0.5, { pick: (a) => a[0] }); };

/** A free spot on land outside every sanctuary and war zone, away from camps. */
function wildSpot(S, oath = 'oath-09', dist = 200) {
  const s = S.sanctuaries.find((x) => x.oathId === oath);
  for (let a = 0; a < Math.PI * 2; a += 0.07) {
    const x = s.center[0] + Math.cos(a) * dist, z = s.center[1] + Math.sin(a) * dist;
    if (S.groundY(x, z) < 1 || inSafeZone(x, z)) continue;
    if (S.mobs.some((m) => Math.hypot(m.x - x, m.z - z) < 50)) continue;
    return { x, z };
  }
  throw new Error('no free spot');
}
function put(S, p, x, z) { p.x = x; p.z = z; p.y = S.groundY(x, z); S.grid.move(p); S.pgrid.move(p); }
function putBoth(sim, a, b, gap = 3, oath = 'oath-09') {
  const S = sim._S; const sp = wildSpot(S, oath);
  put(S, a, sp.x, sp.z); put(S, b, sp.x + gap, sp.z);
  sim.tick(DT); sim.tick(DT); sim.tick(DT); sim.tick(DT); // refresh pvp zone state
  return sp;
}
function party(sim, leader, ...others) {
  for (const o of others) {
    sim.handle(leader.id, { t: 'party', op: 'invite', target: o.name });
    sim.handle(o.id, { t: 'party', op: 'accept', from: leader.id });
  }
}

// ------------------------------------------------------------------------------------------ parties
test('party: invite by name, accept, roster events, shared XP split and quest kill credit in range', () => {
  const sim = mkSim(); const S = sim._S; fixRng(S);
  const a = join(sim, 'a', 'Alpha'), b = join(sim, 'b', 'Beta'), c = join(sim, 'c', 'Gamma');
  sim.handle('a', { t: 'party', op: 'invite', target: 'beta' }); // case-insensitive name
  let out = run(sim, 0.1);
  const inv = evs(out, 'invite', 'b')[0];
  assert.equal(inv.kind, 'party'); assert.equal(inv.from, 'a'); assert.equal(inv.state, 'open');
  sim.handle('b', { t: 'party', op: 'accept', from: 'a' });
  out = run(sim, 0.1);
  assert.ok(a.party && a.party === b.party, 'same party');
  const roster = evs(out, 'party', 'b').pop().party;
  assert.equal(roster.leader, 'a');
  assert.deepEqual(roster.members.map((m) => m.id).sort(), ['a', 'b']);
  assert.ok(roster.members.every((m) => Number.isFinite(m.x) && Number.isFinite(m.hp) && m.oath), 'member positions/hp for frames + map');

  // XP: a kills a mob; b (party, in range) shares; c (no party) does not
  const sp = putBoth(sim, a, b, 4); put(S, c, sp.x - 4, sp.z);
  for (const p of [a, b, c]) { p.invuln = true; p.invulnUntil = Infinity; }
  b.quests.clear();
  b.quests.set('q-kill', { id: 'q-kill', title: 'cull', text: '', kind: 'kill', targets: ['ember-hound'], goal: 5, progress: 0, done: false });
  const m = createMob(S, 'ember-hound', a.x + 2, a.z, a.lvl, { fields: { respawnMs: 0, temp: true } });
  const xa = a.xp, xb = b.xp, xc = c.xp;
  dealDamage(S, a, m, 1e6, null, 'test', { noStatus: true });
  assert.equal(m.alive, false);
  assert.ok(a.xp > xa && b.xp > xb, 'killer and party member both gain xp');
  assert.equal(c.xp, xc, 'non-member gains nothing');
  assert.ok(Math.abs((a.xp - xa) - (b.xp - xb)) <= 1, 'split evenly between same-level members');
  assert.equal(b.quests.get('q-kill').progress, 1, 'party quest kill credit');

  // out of range: no share
  put(S, b, a.x + 400, a.z);
  const m2 = createMob(S, 'ember-hound', a.x + 2, a.z, a.lvl, { fields: { respawnMs: 0, temp: true } });
  const xb2 = b.xp;
  dealDamage(S, a, m2, 1e6, null, 'test', { noStatus: true });
  assert.equal(b.xp, xb2, 'members beyond 110 m get no share');
  assert.equal(b.quests.get('q-kill').progress, 1);
});

test('party: kick, leave, leader transfer, disband, cap of 5, invite timeout and decline', () => {
  const sim = mkSim(); const S = sim._S;
  const ps = ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => join(sim, n.toLowerCase(), `Hero ${n}`));
  const [a, b, c, d, e, f] = ps;
  party(sim, a, b, c, d, e);
  assert.equal(S.social.parties.get(a.party).members.length, 5);
  S.t += 10000; // refill the social rate limiter
  sim.handle('a', { t: 'party', op: 'invite', target: 'Hero F' });
  let out = run(sim, 0.1);
  assert.match(sys(out, 'a'), /full/);
  assert.equal(f.invites.length, 0);
  // non-leader cannot kick
  sim.handle('b', { t: 'party', op: 'kick', target: 'c' });
  assert.equal(c.party, a.party);
  // leader kicks
  sim.handle('a', { t: 'party', op: 'kick', target: 'e' });
  assert.equal(e.party, null);
  out = run(sim, 0.1);
  assert.ok(evs(out, 'party', 'e').some((x) => x.party === null), 'kicked member gets an empty roster');
  // leader transfer, then old leader leaves
  sim.handle('a', { t: 'party', op: 'lead', target: 'Hero B' });
  assert.equal(S.social.parties.get(a.party).leader, 'b');
  sim.handle('a', { t: 'party', op: 'leave' });
  assert.equal(a.party, null);
  assert.equal(S.social.parties.get(b.party).members.length, 3);
  // leader leaving passes the lead on
  sim.handle('b', { t: 'party', op: 'leave' });
  const pt = S.social.parties.get(c.party);
  assert.equal(pt.leader, 'c');
  // down to one member -> disbanded
  sim.handle('c', { t: 'party', op: 'kick', target: 'd' });
  assert.equal(c.party, null); assert.equal(S.social.parties.size, 0);
  // decline + timeout
  S.t += 10000;
  sim.handle('a', { t: 'party', op: 'invite', target: 'f' });
  sim.handle('f', { t: 'party', op: 'decline', from: 'a' });
  out = run(sim, 0.1);
  assert.match(sys(out, 'a'), /declines/);
  sim.handle('a', { t: 'party', op: 'invite', target: 'f' });
  out = run(sim, 31);
  assert.equal(f.invites.length, 0);
  assert.ok(evs(out, 'invite', 'f').some((x) => x.state === 'closed' && x.reason === 'expired'));
  assert.match(sys(out, 'a'), /expired/);
  sim.handle('f', { t: 'party', op: 'accept', from: 'a' });
  assert.equal(f.party, null, 'expired invitation cannot be accepted');
});

// ------------------------------------------------------------------------------------------ duels
test('duel: challenge, 3-2-1 countdown, no damage before the bell, ends at 1 HP with no death', () => {
  const sim = mkSim(); const S = sim._S; fixRng(S);
  const a = join(sim, 'a', 'Alpha'), b = join(sim, 'b', 'Beta');
  putBoth(sim, a, b, 4);
  party(sim, a, b); // duels are the consensual exception: party members may duel
  sim.handle('a', { t: 'duel', op: 'challenge', target: 'b' });
  sim.handle('b', { t: 'duel', op: 'accept', from: 'a' });
  let out = run(sim, 0.1);
  const cd = evs(out, 'duel', 'a')[0];
  assert.equal(cd.state, 'countdown'); assert.equal(cd.r, DUEL_RING);
  assert.ok(cd.at > S.serverTime() + 2500, 'countdown carries the start time');
  assert.equal(a.duel, b.duel);
  assert.equal(dealDamage(S, a, b, 50, null, 'test'), 0, 'no damage during the countdown');
  out = run(sim, 3.1);
  assert.ok(evs(out, 'duel', 'b').some((e) => e.state === 'fight'));
  assert.ok(hostile(a, b), 'duellists are hostile once the fight starts');
  b.hp = 30;
  const dmg = dealDamage(S, a, b, 5000, null, 'test', { noStatus: true });
  assert.equal(b.hp, 1, 'left at 1 HP'); assert.equal(b.alive, true, 'no death');
  assert.equal(dmg, 29);
  assert.equal(a.duel, null); assert.equal(b.duel, null);
  assert.equal(hostile(a, b), false, 'no longer hostile afterwards');
  out = run(sim, 0.1);
  const end = evs(out, 'duel', 'a').find((e) => e.state === 'end');
  assert.equal(end.winner, 'a'); assert.equal(end.loser, 'b'); assert.equal(end.reason, 'defeat');
  assert.ok(evs(out, 'system').some((e) => /defeated Beta in a duel/.test(e.text)), 'result announced');
  assert.equal(S.stats.deaths, 0);
});

test('duel: leaving the ring forfeits; forfeit and logout end it too', () => {
  const sim = mkSim(); const S = sim._S;
  const a = join(sim, 'a', 'Alpha'), b = join(sim, 'b', 'Beta');
  putBoth(sim, a, b, 4);
  sim.handle('a', { t: 'duel', op: 'challenge', target: 'Beta' });
  sim.handle('b', { t: 'duel', op: 'accept' });
  run(sim, 3.2);
  assert.ok(a.duelLive);
  const d = S.social.duels.get(a.duel);
  put(S, b, d.x + DUEL_RING + 2, d.z);
  let out = run(sim, 0.1);
  const end = evs(out, 'duel', 'a').find((e) => e.state === 'end');
  assert.equal(end.reason, 'fled'); assert.equal(end.winner, 'a');
  // explicit forfeit
  put(S, b, a.x + 3, a.z);
  sim.handle('b', { t: 'duel', op: 'challenge', target: 'a' });
  sim.handle('a', { t: 'duel', op: 'accept', from: 'b' });
  run(sim, 3.2);
  sim.handle('a', { t: 'duel', op: 'forfeit' });
  out = run(sim, 0.1);
  assert.equal(evs(out, 'duel', 'b').find((e) => e.state === 'end').winner, 'b');
  // too far to challenge
  put(S, b, a.x + 60, a.z);
  sim.handle('a', { t: 'duel', op: 'challenge', target: 'b' });
  out = run(sim, 0.1);
  assert.match(sys(out, 'a'), /too far/);
  // logout
  put(S, b, a.x + 3, a.z);
  sim.handle('a', { t: 'duel', op: 'challenge', target: 'b' });
  sim.handle('b', { t: 'duel', op: 'accept', from: 'a' });
  run(sim, 3.2);
  sim.disconnected('b');
  out = run(sim, 0.1);
  assert.equal(evs(out, 'duel', 'a').find((e) => e.state === 'end').reason, 'logout');
});

// ------------------------------------------------------------------------------------------ PvP rules
test('pvp: unflagged players are immune; flag with cooldown; 0.6 damage multiplier; honor on kill, no item loss', () => {
  const sim = mkSim(); const S = sim._S; fixRng(S);
  const a = join(sim, 'a', 'Alpha'), b = join(sim, 'b', 'Beta');
  putBoth(sim, a, b, 3);
  assert.equal(dealDamage(S, a, b, 100, null, 'test'), 0, 'not flagged: no damage');
  sim.handle('a', { t: 'pvp', on: true });
  assert.equal(a.pvp, true);
  assert.equal(dealDamage(S, a, b, 100, null, 'test'), 0, 'only one side flagged: no damage');
  sim.handle('b', { t: 'pvp', on: true });
  run(sim, 0.25);
  assert.ok(a.pvpEff === 1 && b.pvpEff === 1);
  // cooldown: cannot lower immediately
  sim.handle('a', { t: 'pvp', on: false });
  let out = run(sim, 0.1);
  assert.equal(a.pvp, true); assert.match(sys(out, 'a'), /again in/);
  // damage with the PvP multiplier (vs. the same hit on an identical mob)
  const m = createMob(S, 'ember-hound', b.x + 1, b.z, b.lvl, { fields: { respawnMs: 0, temp: true } });
  m.armor = b.stats.armor; m.element = b.element;
  const ref = dealDamage(S, a, m, 200, null, 'test', { noStatus: true, noCrit: true });
  const hp0 = b.hp;
  const pv = dealDamage(S, a, b, 200, null, 'test', { noStatus: true, noCrit: true });
  assert.ok(pv > 0 && b.hp === hp0 - pv);
  assert.ok(Math.abs(pv - ref * PVP_DAMAGE_MUL) <= 1, `pvp ${pv} ~ ${ref} x ${PVP_DAMAGE_MUL}`);
  // in PvP combat: cannot lower the flag even after the toggle cooldown
  S.t += 10500;
  sim.handle('a', { t: 'pvp', on: false });
  assert.equal(a.pvp, true, 'PvP combat lock');
  // kill: honor + kill credit, inventory intact, respawn at shrine
  const inv = JSON.stringify(b.inventory), eq = JSON.stringify(b.equipment);
  b.hp = 5; b.invuln = false;
  dealDamage(S, a, b, 5000, null, 'test', { noStatus: true });
  assert.equal(b.alive, false);
  out = run(sim, 0.1);
  const hon = evs(out, 'honor', 'a')[0];
  assert.ok(hon.honor > 0); assert.equal(a.honor, hon.total); assert.equal(a.pvpKills, 1);
  assert.equal(evs(out, 'death').find((e) => e.id === 'b').killer, 'a');
  sim.handle('b', { t: 'respawn' }); run(sim, 1.6); sim.handle('b', { t: 'respawn' });
  assert.equal(b.alive, true);
  assert.equal(JSON.stringify(b.inventory), inv, 'no item loss'); assert.equal(JSON.stringify(b.equipment), eq);
  // anti-farm: killing the same player again soon gives no honor
  put(S, b, a.x + 3, a.z); run(sim, 0.3); b.invuln = false; b.hp = 5;
  dealDamage(S, a, b, 5000, null, 'test', { noStatus: true });
  out = run(sim, 0.1);
  assert.equal(evs(out, 'honor', 'a')[0].honor, 0);
  assert.equal(sim.serialize('a').honor, a.honor, 'honor persisted');
});

test('pvp: never inside a sanctuary, never against party members; war zones auto-flag everyone', () => {
  const sim = mkSim(); const S = sim._S; fixRng(S);
  const a = join(sim, 'a', 'Alpha'), b = join(sim, 'b', 'Beta');
  putBoth(sim, a, b, 3);
  sim.handle('a', { t: 'pvp', on: true }); sim.handle('b', { t: 'pvp', on: true });
  run(sim, 0.25);
  assert.ok(hostile(a, b));
  // safe zone: victim (or attacker) inside the 150 m radius
  const s = S.sanctuaries.find((x) => x.oathId === 'oath-09');
  put(S, b, s.center[0] + 20, s.center[1]);
  assert.equal(dealDamage(S, a, b, 100, null, 'test'), 0, 'victim in sanctuary');
  put(S, a, s.center[0] + 22, s.center[1]);
  assert.equal(dealDamage(S, b, a, 100, null, 'test'), 0, 'both in sanctuary');
  run(sim, 0.25);
  assert.equal(a.pvpEff, 0, 'flag inactive in the sanctuary');
  // party immunity
  putBoth(sim, a, b, 3);
  party(sim, a, b);
  assert.equal(hostile(a, b), false);
  assert.equal(dealDamage(S, a, b, 100, null, 'test'), 0, 'party members are immune');
  sim.handle('b', { t: 'party', op: 'leave' });
  assert.ok(dealDamage(S, a, b, 100, null, 'test', { noStatus: true }) > 0, 'after leaving the party');
  // pets follow their owner's rules
  const pet = S.spawnPet(a, { name: 'Wisp', id: 'test/wisp', damage: 10, element: null }, { x: 1, z: 0 });
  assert.ok(hostile(pet, b));
  party(sim, a, b);
  assert.equal(hostile(pet, b), false);
  // war zone: two unflagged players become hostile
  const c = join(sim, 'c', 'Gamma'), d = join(sim, 'd', 'Delta');
  const wz = WAR_ZONES[0];
  put(S, c, wz.x, wz.z); put(S, d, wz.x + 3, wz.z);
  let out = run(sim, 0.25);
  assert.equal(c.pvp, false);
  assert.equal(c.pvpEff, 2);
  assert.ok(hostile(c, d));
  assert.ok(evs(out, 'warzone', 'c').some((e) => e.zone && e.zone.id === wz.id), 'war zone banner event');
  assert.ok(dealDamage(S, c, d, 100, null, 'test', { noStatus: true }) > 0);
  put(S, d, wz.x + wz.r + 40, wz.z);
  out = run(sim, 0.25);
  assert.equal(d.pvpEff, 0);
  assert.ok(evs(out, 'warzone', 'd').some((e) => e.zone === null), 'leaving the zone');
  assert.equal(hostile(c, d), false);
  // entity field for clients
  c.known.clear();
  const snap = S.snapshotFor(c);
  assert.equal(snap.ents.find((e) => e.id === 'c').pvp, 2);
});

test('pvp: crowd-control diminishing returns (x1, x0.5, x0.25, immune) only from players', () => {
  const sim = mkSim(); const S = sim._S;
  const a = join(sim, 'a', 'Alpha'), b = join(sim, 'b', 'Beta');
  putBoth(sim, a, b, 3);
  const durs = [];
  for (let i = 0; i < 4; i++) {
    b.st.length = 0;
    applyStatus(S, b, 'root', 4, 1, a);
    const s = hasStatus(b, 'root');
    durs.push(s ? Math.round((s.until - S.t) / 100) / 10 : 0);
  }
  assert.deepEqual(durs, [4, 2, 1, 0]);
  // window resets after 15 s
  S.t += 15100; b.st.length = 0;
  applyStatus(S, b, 'root', 4, 1, a);
  assert.equal(Math.round((hasStatus(b, 'root').until - S.t) / 1000), 4);
  // creatures are not diminished
  const m = createMob(S, 'ember-hound', b.x + 1, b.z, 1, { fields: { respawnMs: 0, temp: true } });
  for (let i = 0; i < 4; i++) { b.st.length = 0; applyStatus(S, b, 'slow', 3, 0.3, m); assert.ok(hasStatus(b, 'slow'), 'mob slows always land'); }
});

// ------------------------------------------------------------------------------------------ trading
function tradePair(sim) {
  const S = sim._S;
  const a = join(sim, 'a', 'Alpha'), b = join(sim, 'b', 'Beta');
  putBoth(sim, a, b, 3);
  a.combatUntil = b.combatUntil = 0;
  const sword = makeGear(S.rng, { oath: 'oath-09', lvl: 5, slot: 'weapon', rarity: 'rare' });
  a.inventory.push(sword);
  a.gold = 100; b.gold = 50;
  sim.handle('a', { t: 'trade', op: 'request', target: 'Beta' });
  sim.handle('b', { t: 'trade', op: 'accept', from: 'a' });
  return { S, a, b, sword };
}

test('trade: offers, both lock then confirm, any change unlocks both, atomic swap + log line', () => {
  const lines = [];
  const sim = mkSim({ log: (l) => lines.push(l) });
  const { S, a, b, sword } = tradePair(sim);
  assert.ok(a.trade && a.trade === b.trade);
  let out = run(sim, 0.1);
  assert.equal(evs(out, 'trade', 'a')[0].state, 'open');
  const potion = b.inventory.find((i) => i.key === 'potion');
  sim.handle('a', { t: 'trade', op: 'offer', items: [sword.id], gold: 30 });
  sim.handle('b', { t: 'trade', op: 'offer', items: [potion.id], gold: 0 });
  // confirm before locking is refused
  sim.handle('a', { t: 'trade', op: 'confirm' });
  const tr = S.social.trades.get(a.trade);
  assert.equal(tr.offers.a.confirmed, false);
  sim.handle('a', { t: 'trade', op: 'lock' }); sim.handle('b', { t: 'trade', op: 'lock' });
  assert.ok(tr.offers.a.locked && tr.offers.b.locked);
  // change unlocks both
  sim.handle('b', { t: 'trade', op: 'offer', items: [potion.id], gold: 5 });
  assert.equal(tr.offers.a.locked, false); assert.equal(tr.offers.b.locked, false);
  out = run(sim, 0.1);
  const upd = evs(out, 'trade', 'a').pop();
  assert.equal(upd.them.gold, 5); assert.equal(upd.them.items[0].id, potion.id);
  sim.handle('a', { t: 'trade', op: 'lock' }); sim.handle('b', { t: 'trade', op: 'lock' });
  sim.handle('a', { t: 'trade', op: 'confirm' });
  assert.ok(S.social.trades.has(tr.id), 'waits for both confirmations');
  const potQty = potion.qty;
  sim.handle('b', { t: 'trade', op: 'confirm' });
  assert.equal(S.social.trades.size, 0);
  assert.ok(b.inventory.some((i) => i.id === sword.id), 'sword moved to Beta');
  assert.ok(!a.inventory.some((i) => i.id === sword.id));
  assert.equal(a.inventory.find((i) => i.key === 'potion').qty, 3 + potQty, 'potions stacked onto Alpha');
  assert.equal(a.gold, 100 - 30 + 5); assert.equal(b.gold, 50 + 30 - 5);
  out = run(sim, 0.1);
  assert.equal(evs(out, 'trade', 'b').pop().state, 'done');
  assert.match(sys(out, 'a'), /Trade complete with Beta/);
  assert.ok(lines.some((l) => /^trade tr\w+: Alpha\(a\) gave \[/.test(l)), 'server trade log line');
});

test('trade: dupe attempts are rejected at commit; stale offers unlock; distance / combat / death cancel', () => {
  const sim = mkSim();
  let { S, a, b, sword } = tradePair(sim);
  sim.handle('a', { t: 'trade', op: 'offer', items: [sword.id] });
  sim.handle('b', { t: 'trade', op: 'offer', gold: 40 });
  sim.handle('a', { t: 'trade', op: 'lock' }); sim.handle('b', { t: 'trade', op: 'lock' });
  sim.handle('a', { t: 'trade', op: 'confirm' });
  // Alpha moves the sword out of the bag between confirmations (no tick in between) and Beta confirms
  sim.handle('a', { t: 'drop', item: sword.id });
  sim.handle('b', { t: 'trade', op: 'confirm' });
  assert.equal(S.social.trades.size, 0);
  assert.equal(b.gold, 50, 'Beta keeps the gold'); assert.equal(a.gold, 100);
  assert.ok(!b.inventory.some((i) => i.id === sword.id));
  let out = run(sim, 0.1);
  assert.equal(evs(out, 'trade', 'b').pop().reason, 'invalid');
  // gold dupe: offer more than you will have
  sim.handle('a', { t: 'trade', op: 'request', target: 'b' }); sim.handle('b', { t: 'trade', op: 'accept', from: 'a' });
  sim.handle('a', { t: 'trade', op: 'offer', gold: 1000 });
  assert.equal(S.social.trades.get(a.trade).offers.a.gold, 0, 'cannot offer gold you do not have');
  sim.handle('a', { t: 'trade', op: 'offer', gold: 90 });
  sim.handle('a', { t: 'trade', op: 'lock' }); sim.handle('b', { t: 'trade', op: 'lock' }); sim.handle('a', { t: 'trade', op: 'confirm' });
  a.gold = 10; // spent elsewhere (e.g. a vendor) before the commit
  sim.handle('b', { t: 'trade', op: 'confirm' });
  assert.equal(b.gold, 50); assert.equal(a.gold, 10);
  // offered stack changes while open -> both unlocked by the upkeep tick
  sim.handle('a', { t: 'trade', op: 'request', target: 'b' }); sim.handle('b', { t: 'trade', op: 'accept', from: 'a' });
  const pot = a.inventory.find((i) => i.key === 'potion');
  sim.handle('a', { t: 'trade', op: 'offer', items: [pot.id] });
  sim.handle('a', { t: 'trade', op: 'lock' }); sim.handle('b', { t: 'trade', op: 'lock' });
  sim.handle('a', { t: 'use', item: pot.id });
  run(sim, 0.3);
  const tr = S.social.trades.get(a.trade);
  assert.ok(tr && !tr.offers.a.locked && !tr.offers.b.locked, 'stale offer unlocked both sides');
  // the item may not be offered twice
  sim.handle('a', { t: 'trade', op: 'offer', items: [pot.id, pot.id] });
  // distance
  put(S, b, a.x + 20, a.z);
  out = run(sim, 0.3);
  assert.equal(S.social.trades.size, 0);
  assert.equal(evs(out, 'trade', 'a').pop().reason, 'distance');
  // combat
  put(S, b, a.x + 3, a.z);
  sim.handle('a', { t: 'trade', op: 'request', target: 'b' }); sim.handle('b', { t: 'trade', op: 'accept', from: 'a' });
  assert.ok(a.trade);
  const m = createMob(S, 'ember-hound', a.x + 1, a.z, 1, { fields: { respawnMs: 0, temp: true } });
  dealDamage(S, m, b, 1, null, 'test', { noStatus: true });
  out = run(sim, 0.3);
  assert.equal(evs(out, 'trade', 'a').pop().reason, 'combat');
  // cannot even open a trade in combat
  sim.handle('a', { t: 'trade', op: 'request', target: 'b' });
  out = run(sim, 0.1);
  assert.match(sys(out, 'a'), /combat/);
  // logout
  S.t += 7000;
  sim.handle('a', { t: 'trade', op: 'request', target: 'b' }); sim.handle('b', { t: 'trade', op: 'accept', from: 'a' });
  assert.ok(a.trade);
  sim.removePlayer('b');
  out = run(sim, 0.1);
  assert.equal(a.trade, null);
  assert.equal(evs(out, 'trade', 'a').pop().reason, 'logout');
});

test('trade: bag space is re-checked at commit', () => {
  const sim = mkSim();
  const { S, a, b, sword } = tradePair(sim);
  while (b.inventory.length < 40) b.inventory.push(makeGear(S.rng, { oath: 'oath-09', lvl: 1, slot: 'head' }));
  sim.handle('a', { t: 'trade', op: 'offer', items: [sword.id] });
  sim.handle('a', { t: 'trade', op: 'lock' }); sim.handle('b', { t: 'trade', op: 'lock' });
  sim.handle('a', { t: 'trade', op: 'confirm' }); sim.handle('b', { t: 'trade', op: 'confirm' });
  assert.ok(a.inventory.some((i) => i.id === sword.id), 'nothing exchanged');
  assert.equal(b.inventory.length, 40);
  const out = run(sim, 0.1);
  assert.equal(evs(out, 'trade', 'a').pop().reason, 'full');
});

// ------------------------------------------------------------------------------------------ AI adventurers + protocol
test('AI adventurers answer party invites, duel, trade and follow their leader', () => {
  const sim = mkSim({ botSocial: { party: 1, duel: 1, trade: 1 } }); const S = sim._S;
  const p = join(sim, 'c1', 'Human');
  const sp = wildSpot(S); put(S, p, sp.x, sp.z);
  spawnBot(S, 'oath-09');
  S.nextBotCheck = Infinity; // keep the adventurer (bots:0 would retire it)
  const bot = [...S.players.values()].find((q) => q.bot);
  put(S, bot, p.x + 4, p.z); bot.hp = bot.mhp; bot.combatUntil = 0;
  bot.inventory.push(makeConsumable(S.rng, 'ether', 1));
  sim.handle('c1', { t: 'party', op: 'invite', target: bot.name });
  run(sim, 3.5);
  assert.equal(bot.party, p.party, 'bot joined the party');
  // follows the leader
  put(S, p, p.x + 30, p.z);
  run(sim, 3);
  assert.ok(Math.hypot(bot.x - p.x, bot.z - p.z) < 15, 'bot follows its party leader');
  // duel: bot accepts, fights after the countdown, the bout ends without a death
  bot.hp = bot.mhp;
  sim.handle('c1', { t: 'duel', op: 'challenge', target: bot.id });
  let out = run(sim, 3.5);
  assert.ok(bot.duel, 'bot accepted the duel');
  p.hp = 3; p.mhp = Math.max(p.mhp, 3);
  out = run(sim, 12);
  const end = evs(out, 'duel', 'c1').find((e) => e.state === 'end');
  assert.ok(end, 'duel finished');
  assert.equal(p.alive, true);
  // trade: bot accepts, offers, locks after the human locks, confirms
  S.t += 8000; p.combatUntil = bot.combatUntil = 0; p.hp = p.mhp; put(S, bot, p.x + 3, p.z);
  sim.handle('c1', { t: 'trade', op: 'request', target: bot.name });
  out = run(sim, 6);
  assert.ok(p.trade, 'bot accepted the trade');
  assert.ok(evs(out, 'trade', 'c1').some((e) => e.state === 'update' && (e.them.items.length || e.them.gold)), 'bot made an offer');
  sim.handle('c1', { t: 'trade', op: 'lock' });
  run(sim, 2.5);
  sim.handle('c1', { t: 'trade', op: 'confirm' });
  out = run(sim, 2.5);
  assert.ok(evs(out, 'trade', 'c1').some((e) => e.state === 'done'), 'trade completed with the AI');
});

test('protocol validation for social messages', () => {
  assert.deepEqual(validate({ t: 'party', op: 'invite', target: 'Beta', junk: 1 }), { t: 'party', op: 'invite', target: 'Beta', from: undefined });
  assert.equal(validate({ t: 'party', op: 'nuke' }), null);
  assert.equal(validate({ t: 'trade', op: 'offer', items: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }), null, 'max 6 items');
  assert.equal(validate({ t: 'trade', op: 'offer', gold: -5 }), null);
  assert.equal(validate({ t: 'trade', op: 'offer', gold: 1.5 }), null);
  assert.ok(validate({ t: 'trade', op: 'offer', items: ['x'], gold: 3 }));
  assert.equal(validate({ t: 'pvp', on: 'yes' }), null);
  assert.ok(validate({ t: 'pvp', on: true }));
  assert.equal(validate({ t: 'chat', text: 'hi', channel: 'whisper' }), null, 'whisper needs a recipient');
  assert.ok(validate({ t: 'chat', text: 'hi', channel: 'party' }));
  assert.equal(validate({ t: 'duel', op: 'challenge', target: 'x'.repeat(100) }), null);
});

test('social rate limiting and chat commands', () => {
  const sim = mkSim(); const S = sim._S;
  const a = join(sim, 'a', 'Alpha'), b = join(sim, 'b', 'Beta');
  for (let i = 0; i < 30; i++) sim.handle('a', { t: 'party', op: 'invite', target: 'b' });
  const out = run(sim, 0.1);
  assert.match(sys(out, 'a'), /too quickly/);
  S.t += 10000;
  sim.handle('a', { t: 'chat', text: '/invite Beta' });
  sim.handle('b', { t: 'chat', text: '/p hello?' });
  assert.equal(b.invites.length, 1);
  sim.handle('b', { t: 'party', op: 'accept', from: 'a' });
  sim.handle('b', { t: 'chat', text: 'to the party', channel: 'party' });
  sim.handle('a', { t: 'chat', text: 'psst', channel: 'whisper', to: 'Beta' });
  const o2 = run(sim, 0.1);
  assert.ok(evs(o2, 'chat', 'a').some((e) => e.channel === 'party' && e.text === 'to the party'));
  assert.ok(evs(o2, 'chat', 'b').some((e) => e.channel === 'whisper' && e.text === 'psst' && e.toName === 'Beta'));
  sim.handle('a', { t: 'chat', text: '/pvp on' });
  assert.equal(a.pvp, true);
});
