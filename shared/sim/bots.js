// AI adventurers: player-like bots that travel the roads between sanctuaries, hunt nearby
// creatures with their real hotbar (through the same cast validation as humans), rest, die,
// respawn and chat occasionally. Names come from the canon character registry.
import { OATHS, OATH_BY_ID, CLASSES } from '../oaths.js';
import { CREATURE_BY_ID } from '../creatures.js';
import { CANON_NAMES, BOT_CHAT, SEATS, RESOURCES } from './data.js';
import { moveMul, isStunned, hostile, TEAM_MOB } from './combat.js';
import { handleSocial, partyOf, cancelTrade } from './social.js';

export function pickBotName(S) {
  const used = new Set([...S.players.values()].map((p) => p.name));
  const free = CANON_NAMES.filter((n) => !used.has(n));
  if (free.length) return S.rng.pick(free);
  for (let i = 0; i < 50; i++) {
    const a = S.rng.pick(CANON_NAMES).split(' ')[0], b = S.rng.pick(CANON_NAMES).split(' ')[1];
    if (!used.has(`${a} ${b}`)) return `${a} ${b}`;
  }
  return `Wanderer ${S.nextId('')}`;
}

export function spawnBot(S, nearOath) {
  const oath = nearOath && S.rng() < 0.6 ? nearOath : S.rng.pick(OATHS).id;
  const cls = S.rng() < 0.5 ? 'ninja' : 'sorcerer';
  const id = S.nextId('p');
  const lvl = 1 + Math.floor(Math.pow(S.rng(), 1.6) * 16);
  const welcome = S.addPlayer(id, { t: 'hello', name: pickBotName(S), oath: S.rng() < 0.5 ? oath : S.rng.pick(OATHS).id, cls }, null, { bot: true, lvl, home: oath });
  const b = S.players.get(id);
  b.brain = { mode: 'travel', dest: null, next: 0, chatAt: S.t + 20000 + S.rng() * 120000, restUntil: 0, from: oath, wp: [] };
  // scatter a little around the plaza so they don't stack
  b.x += (S.rng() - 0.5) * 30; b.z += (S.rng() - 0.5) * 30; b.y = S.groundY(b.x, b.z);
  S.grid.move(b); S.pgrid.move(b);
  return welcome;
}

function chooseDest(S, b) {
  const here = S.regionOf(b.x, b.z);
  const s = S.sanctuaries[OATH_BY_ID[here].index - 1];
  const r = S.rng();
  // half the time head out to a camp near the current sanctuary at a suitable level, otherwise travel the road
  if (r < 0.55) {
    const camps = S.camps.filter((c) => c.oath === here && c.level <= b.lvl + 2 && c.level >= b.lvl - 8);
    if (camps.length) { const c = S.rng.pick(camps); return { x: c.x, z: c.z, kind: 'camp' }; }
  }
  const nb = S.rng.pick(s.neighbours);
  const o = OATH_BY_ID[nb];
  return { x: o.center[0] + (S.rng() - 0.5) * 40, z: o.center[1] + (S.rng() - 0.5) * 40, kind: 'city', oath: nb };
}

function findPrey(S, b, r) {
  let best = null, bd = r * r;
  S.grid.forEachNear(b.x, b.z, r, (e) => {
    if (e.k !== 'm' || !e.alive || e.team !== TEAM_MOB || e.state === 'return') return;
    if (e.role === 'boss' || (e.role === 'elite' && b.lvl < e.lvl + 3) || e.lvl > b.lvl + 3) return;
    const d = (e.x - b.x) ** 2 + (e.z - b.z) ** 2;
    if (d < bd) { bd = d; best = e; }
  });
  return best;
}

function walk(S, b, tx, tz, dt, stop = 0.5, sprint = false) {
  const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
  if (d <= stop) { b.anim = 'idle'; return d; }
  const sp = CLASSES[b.cls].moveSpeed * (sprint ? 1.35 : 1) * moveMul(b);
  const step = Math.min(d - stop, sp * dt);
  b.x += (dx / d) * step; b.z += (dz / d) * step;
  b.ry = Math.atan2(dx, dz);
  b.y = S.groundY(b.x, b.z);
  b.anim = step > 0 ? (sprint ? 'sprint' : 'run') : 'idle';
  S.grid.move(b); S.pgrid.move(b);
  return d - step;
}

// ---------- social responses (so parties, duels and trades are testable solo / offline) ----------
const later = (S, b, ms, fn) => { (b.brain.todo ??= []).push({ at: S.t + ms, fn }); };
const say = (S, b, text) => S.chat(b, text, 'say');
const chance = (S, key, def) => S.rng() < (S.opts.botSocial?.[key] ?? def);

/** A bot received an invitation: answer after a human-ish pause. */
export function botInvited(S, b, inv) {
  later(S, b, 1200 + S.rng() * 1600, () => {
    if (!b.invites.some((i) => i.kind === inv.kind && i.from === inv.from)) return;
    const from = S.players.get(inv.from);
    let yes;
    if (inv.kind === 'party') yes = !b.party && chance(S, 'party', 0.85);
    else if (inv.kind === 'duel') yes = !b.duel && b.alive && b.hp > b.mhp * 0.6 && chance(S, 'duel', 0.7);
    else yes = !b.trade && b.combatUntil <= S.t && chance(S, 'trade', 0.8);
    handleSocial(S, b, { t: inv.kind, op: yes ? 'accept' : 'decline', from: inv.from });
    if (from) {
      const line = inv.kind === 'party' ? (yes ? `Gladly, ${from.name}. Lead on.` : 'I travel alone for now.')
        : inv.kind === 'duel' ? (yes ? 'A bout, then. Mind the ring.' : 'Not today - my blade needs mending.')
          : (yes ? 'Let us see what you have.' : 'I have nothing to trade.');
      say(S, b, line);
    }
  });
}

/** Trade window driver for bots: offer something modest, lock when the partner locks, confirm when both are locked. */
export function botTrade(S, b, tr, state) {
  if (state === 'open') {
    later(S, b, 1500 + S.rng() * 1000, () => {
      if (b.trade !== tr.id) return;
      const goods = b.inventory.filter((i) => i.kind !== 'gear' || i.rarity === 'common').slice(0, 2);
      handleSocial(S, b, { t: 'trade', op: 'offer', items: goods.map((i) => i.id), gold: goods.length ? 0 : Math.min(b.gold, 5 + Math.floor(S.rng() * 15)) });
    });
    return;
  }
  if (state !== 'update') return;
  later(S, b, 900 + S.rng() * 900, () => {
    if (b.trade !== tr.id || !S.social.trades.has(tr.id)) return;
    const mine = tr.offers[b.id], other = tr.offers[b.id === tr.a ? tr.b : tr.a];
    if (!mine || !other) return;
    if (other.locked && !mine.locked) handleSocial(S, b, { t: 'trade', op: 'lock' });
    else if (other.locked && mine.locked && !mine.confirmed) handleSocial(S, b, { t: 'trade', op: 'confirm' });
  });
  // never hold a human hostage in a stale window
  later(S, b, 90000, () => { if (b.trade === tr.id) cancelTrade(S, S.social.trades.get(tr.id), 'cancelled', b.id); });
}

export function botWhispered(S, b, from, text) {
  later(S, b, 1500 + S.rng() * 2000, () => {
    if (!S.players.has(from.id)) return;
    const lines = ['Safe roads to you.', 'Ask the warden for a bounty if you need coin.', `I am headed for ${S.rng.pick(['the shrine', 'the next sanctuary', 'the camps'])}.`, 'Invite me if you want company.'];
    if (/\b(party|group|join)\b/i.test(text) && !b.party) { handleSocial(S, b, { t: 'party', op: 'invite', target: from.id }); return; }
    S.handle(b.id, { t: 'chat', channel: 'whisper', to: from.id, text: S.rng.pick(lines) });
  });
}

function runTodo(S, b) {
  const td = b.brain.todo;
  if (!td || !td.length) return;
  for (let i = td.length - 1; i >= 0; i--) {
    if (td[i].at > S.t) continue;
    const it = td[i]; td.splice(i, 1);
    try { it.fn(); } catch (e) { /* a stale social action must never break the bot */ }
  }
}

export function thinkBot(S, b, dt) {
  const br = b.brain;
  runTodo(S, b);
  if (!b.alive) {
    if (S.t - b.deadAt > 7000) S.respawn(b);
    return;
  }
  if (b.casting || isStunned(b)) return;
  if (b.duel && !b.duelLive) { b.anim = 'idle'; return; } // duel countdown: wait in the ring
  // chatter
  if (S.t >= br.chatAt) {
    br.chatAt = S.t + 60000 + S.rng() * 180000;
    const o = OATH_BY_ID[S.regionOf(b.x, b.z)];
    const nb = br.dest?.oath ? OATH_BY_ID[br.dest.oath].name : o.name;
    const mobs = Object.values(CREATURE_BY_ID).filter((c) => c.oath === o.id);
    const line = S.rng.pick(BOT_CHAT).replace('{next}', nb).replace('{mob}', S.rng.pick(mobs).name).replace('{seat}', SEATS[o.index - 1])
      .replace('{res}', RESOURCES[o.index - 1]).replace('{lvl}', String(b.lvl));
    S.chat(b, line, S.rng() < 0.12 ? 'world' : 'say');
  }
  // keep current target while it lives
  let t = b.tgt ? S.ents.get(b.tgt) : null;
  if (t && (!t.alive || !hostile(b, t) || Math.hypot(t.x - b.x, t.z - b.z) > 45)) { t = null; b.tgt = null; }
  const pt = partyOf(S, b);
  const leader = pt && pt.leader !== b.id ? S.players.get(pt.leader) : null;
  if (!t && S.t >= br.next) {
    br.next = S.t + 600 + S.rng() * 400;
    // being attacked? fight back (creatures, or a hostile player in a war zone / flagged)
    S.grid.forEachNear(b.x, b.z, 18, (e) => { if (!t && e.k === 'm' && e.alive && e.tgt === b.id) t = e; });
    if (!t && b.lastPvpAttacker) { const a = S.players.get(b.lastPvpAttacker); if (a && a.alive && hostile(b, a) && Math.hypot(a.x - b.x, a.z - b.z) < 30) t = a; else b.lastPvpAttacker = null; }
    // in a party: assist the leader's target
    if (!t && leader && leader.tgt) { const lt = S.ents.get(leader.tgt); if (lt && lt.alive && hostile(b, lt) && Math.hypot(lt.x - b.x, lt.z - b.z) < 40) t = lt; }
    if (!t && b.hp > b.mhp * 0.55) t = findPrey(S, b, br.dest?.kind === 'camp' ? 30 : 18);
    if (t) b.tgt = t.id;
  }
  if (t) {
    const want = b.cls === 'ninja' ? 2.4 : 15;
    const d = Math.hypot(t.x - b.x, t.z - b.z);
    if (d > want) walk(S, b, t.x, t.z, dt, want * 0.85);
    else {
      b.anim = 'idle';
      b.ry = Math.atan2(t.x - b.x, t.z - b.z);
      if ((S.tickN + b.idn) % 4 === 0) {
        // highest ready slot with mana, else basic
        let slot = 0;
        for (let s = 5; s >= 1; s--) {
          const ab = b.hotbar[s];
          if (!ab || b.cds[s] > S.t || b.mp < ab.mana) continue;
          if (ab.range && d > ab.range + 1 && ab.shape !== 'self' && ab.shape !== 'summon') continue;
          if (s === 5 && t.role === 'common' && t.hp < t.mhp * 0.5) continue;
          slot = s; break;
        }
        if (slot === 0 && b.cds[0] > S.t) return;
        S.castFor(b, { t: 'cast', slot, target: t.id, aim: { x: t.x, y: t.y, z: t.z } });
      }
    }
    return;
  }
  // low health: rest until recovered
  if (b.hp < b.mhp * 0.5 || (b.mp < b.mmp * 0.25)) {
    b.anim = 'idle';
    if (b.hp < b.mhp * 0.3 && b.inventory.some((i) => i.key === 'potion')) S.useItem(b, b.inventory.find((i) => i.key === 'potion').id);
    return;
  }
  // in a party: follow the leader instead of wandering
  if (leader && leader.alive) {
    const d = Math.hypot(leader.x - b.x, leader.z - b.z);
    if (d > 300) { S.place(b, leader.x + (S.rng() - 0.5) * 6, leader.z + (S.rng() - 0.5) * 6, 'travel'); return; }
    if (d > 7) walk(S, b, leader.x, leader.z, dt, 4, d > 25);
    else b.anim = 'idle';
    return;
  }
  if (!br.dest) br.dest = chooseDest(S, b);
  const left = walk(S, b, br.dest.x, br.dest.z, dt, 3, br.dest.kind === 'city' && b.lvl > 3 && S.rng() < 0.002);
  if (left <= 3) {
    if (br.dest.kind === 'camp') { br.dest = S.rng() < 0.5 ? chooseDest(S, b) : { ...br.dest, x: br.dest.x + (S.rng() - 0.5) * 40, z: br.dest.z + (S.rng() - 0.5) * 40 }; }
    else br.dest = chooseDest(S, b);
  }
}
