// Unit tests for shared/sim: combat math, cooldowns, leveling, movement validation, quests,
// mob AI leash, snapshot deltas, chat sanitising, persistence round trip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim, sanitizeText } from '../../shared/sim/index.js';
import { dealDamage, applyStatus, hasStatus, resolveAbility } from '../../shared/sim/combat.js';
import { createMob } from '../../shared/sim/mobs.js';
import { OATHS, CLASSES, xpForLevel, OATH_BY_ID } from '../../shared/oaths.js';
import { hotbarFor } from '../../shared/abilities.js';
import { CREATURES } from '../../shared/creatures.js';

const DT = 0.05;
function mkSim(opts = {}) { return createSim({ seed: 7, bots: 0, campsPerRegion: 6, firstEventMs: 1e9, ...opts }); }
function join(sim, id = 'c1', oath = 'oath-04', cls = 'ninja') { const w = sim.addPlayer(id, { t: 'hello', name: 'Tester', oath, cls }); return { w, p: sim._S.players.get(id) }; }
function run(sim, seconds) { const out = []; for (let i = 0; i < seconds / DT; i++) out.push(...sim.tick(DT)); return out; }
const evs = (out, type, to) => out.filter((o) => o.msg.t === 'ev' && o.msg.e.type === type && (!to || o.to === to || o.to === '*')).map((o) => o.msg.e);
/** Move the player just outside the sanctuary, away from camps (attacks from inside the city reset mobs). */
function outside(sim, p) {
  const S = sim._S;
  const s = S.sanctuaries.find((x) => x.oathId === p.oath);
  for (let a = 0; a < Math.PI * 2; a += 0.1) {
    const x = s.center[0] + Math.cos(a) * 175, z = s.center[1] + Math.sin(a) * 175;
    if (S.groundY(x, z) < 1) continue;
    if (S.mobs.some((m) => Math.hypot(m.x - x, m.z - z) < 45)) continue;
    p.x = x; p.z = z; p.y = S.groundY(x, z); S.grid.move(p); S.pgrid.move(p);
    p.invuln = true; p.invulnUntil = Infinity; // dummies fight back; keep the subject alive
    return p;
  }
  throw new Error('no free spot');
}
/** A mob placed next to the player. */
function dummy(sim, p, def = 'reef-serpent', lvl = 1, dist = 3) {
  const m = createMob(sim._S, def, p.x + dist, p.z, lvl, { fields: { respawnMs: 0, temp: true } });
  return m;
}

test('welcome carries player state, token, world data and starter quest', () => {
  const sim = mkSim();
  const { w, p } = join(sim);
  assert.equal(w.t, 'welcome');
  assert.equal(w.id, 'c1');
  assert.match(w.token, /^[a-f0-9]{32}$/);
  assert.equal(w.you.oath, 'oath-04');
  assert.equal(w.you.mhp, CLASSES.ninja.hp + p.equipment.chest.stats.hp);
  assert.equal(w.world.sanctuaries.length, 15);
  assert.equal(w.world.sanctuaries[0].npcs.length, 6);
  assert.ok(w.you.quests.some((q) => q.id === 'chain-oath-04-1'));
  assert.ok(sim.stats().mobs > 15 * 6 * 2, 'every region populated');
});

test('every region has camps of its own creatures outside the sanctuary, and a boss lair', () => {
  const sim = createSim({ seed: 3, bots: 0 });
  const S = sim._S;
  for (const o of OATHS) {
    const mobs = S.mobs.filter((m) => m.oath === o.id && !m.own);
    assert.ok(mobs.length >= 20, `${o.id} has ${mobs.length} mobs`);
    for (const m of mobs) {
      assert.ok(Math.hypot(m.x - o.center[0], m.z - o.center[1]) > 150, 'outside sanctuary radius');
      assert.ok(m.y > 0, 'on land');
    }
    assert.equal(mobs.filter((m) => m.role === 'boss').length, 1);
    const near = mobs.filter((m) => Math.hypot(m.x - o.center[0], m.z - o.center[1]) < 300 && m.role !== 'boss');
    if (near.length) assert.ok(Math.min(...near.map((m) => m.lvl)) <= 6, 'low levels near the city');
  }
  assert.ok(Math.max(...S.mobs.map((m) => m.lvl)) >= 25, 'high levels in the wilds');
});

test('combat math: armor, element modifiers, crits and death', () => {
  const sim = mkSim();
  const S = sim._S;
  const { p } = join(sim);
  outside(sim, p);
  S.rng = Object.assign(() => 0.5, S.rng); // deterministic: no crit (crit chance < 0.5), variance x1.0
  const water = dummy(sim, p, 'reef-serpent', 30);       // water element
  const fire = dummy(sim, p, 'ember-hound', 30);         // fire element
  fire.lvl = water.lvl = p.lvl; fire.armor = water.armor = 0;
  const a = dealDamage(S, p, water, 100, 'storm', 'test', { noStatus: true });
  const b = dealDamage(S, p, fire, 100, 'storm', 'test', { noStatus: true });
  assert.equal(a, Math.round(100 * p.stats.power * 1.2), 'storm vs water +20%');
  assert.equal(b, Math.round(100 * p.stats.power), 'storm vs fire neutral');
  fire.armor = 100; fire.hp = fire.mhp;
  const c = dealDamage(S, p, fire, 100, null, 'test', { noStatus: true });
  assert.equal(c, Math.round(100 * p.stats.power * 0.5), 'armor 100 halves damage');
  // crit
  S.rng = Object.assign(() => 0.01, S.rng);
  fire.armor = 0; fire.hp = fire.mhp;
  const d = dealDamage(S, p, fire, 10, null, 'test', { noStatus: true });
  assert.equal(d, Math.round(10 * p.stats.power * 1.75 * 0.902), 'crit x1.75 (with low variance roll)');
  // reaction: frost on soaked target -> flash freeze stun
  S.rng = Object.assign(() => 0.5, S.rng);
  water.hp = water.mhp;
  applyStatus(S, water, 'soak', 5, 0.15, p);
  dealDamage(S, p, water, 10, 'frost', 'test', { noStatus: true });
  assert.ok(hasStatus(water, 'freeze'), 'flash freeze applied');
  assert.ok(!hasStatus(water, 'soak'), 'soak consumed');
  // kill
  water.hp = 5;
  const out = [];
  dealDamage(S, p, water, 500, null, 'test');
  out.push(...sim.tick(DT));
  assert.equal(water.alive, false);
  assert.ok(evs(out, 'death').some((e) => e.id === water.id && e.killer === 'c1'));
  assert.ok(evs(out, 'xp', 'c1').length === 1);
  assert.ok(evs(out, 'loot', 'c1').length === 1);
});

test('DoT statuses tick and expire', () => {
  const sim = mkSim();
  const S = sim._S;
  const { p } = join(sim);
  outside(sim, p);
  const m = dummy(sim, p, 'ember-hound', 30);
  const hp0 = m.hp;
  applyStatus(S, m, 'poison', 3, 0.1, p, 20);
  run(sim, 3.2);
  assert.ok(m.hp < hp0, 'poison dealt damage');
  assert.ok(!hasStatus(m, 'poison'), 'poison expired');
});

test('cooldowns, mana and cast times are enforced', () => {
  const sim = mkSim();
  const S = sim._S;
  const { p } = join(sim, 'c1', 'oath-02', 'sorcerer');
  const m = dummy(sim, p, 'rime-wolf', 30, 6);
  sim.handle('c1', { t: 'cast', slot: 1, target: m.id });
  let out = sim.tick(DT);
  const casts = evs(out, 'cast').filter((e) => e.src === 'c1');
  assert.equal(casts.length, 1);
  assert.ok(casts[0].castTime > 0, 'slot 1 has a cast time');
  assert.ok(p.casting, 'casting in progress');
  sim.handle('c1', { t: 'cast', slot: 2, target: m.id });
  out = sim.tick(DT);
  assert.ok(evs(out, 'fail').some((e) => e.reason === 'casting'));
  out = run(sim, 1);
  assert.ok(!p.casting, 'cast finished');
  assert.ok(evs(out, 'cast').some((e) => e.src === 'c1' && e.release));
  assert.ok(evs(out, 'hit').some((e) => e.src === 'c1' && e.dst === m.id), 'zone hit the target');
  sim.handle('c1', { t: 'cast', slot: 1, target: m.id });
  out = sim.tick(DT);
  assert.ok(evs(out, 'fail').some((e) => e.reason === 'cooldown'));
  // mana
  p.mp = 0;
  sim.handle('c1', { t: 'cast', slot: 3, target: m.id });
  out = sim.tick(DT);
  assert.ok(evs(out, 'fail').some((e) => e.reason === 'mana'));
  // cooldown expires
  p.mp = p.mmp;
  run(sim, hotbarFor('oath-02', 'sorcerer')[1].cooldown + 0.5);
  sim.handle('c1', { t: 'cast', slot: 1, target: m.id });
  out = sim.tick(DT);
  assert.ok(evs(out, 'cast').some((e) => e.src === 'c1' && e.slot === 1));
});

test('casting is interrupted by movement for long casts', () => {
  const sim = mkSim();
  const { p } = join(sim, 'c1', 'oath-02', 'sorcerer');
  const ab = hotbarFor('oath-02', 'sorcerer')[5];
  assert.ok(ab.castTime >= 0.5);
  sim.handle('c1', { t: 'cast', slot: 5, aim: { x: p.x + 5, y: p.y, z: p.z } });
  sim.tick(DT);
  const mp = p.mp;
  sim.handle('c1', { t: 'move', x: p.x + 2.5, y: p.y, z: p.z, ry: 0, anim: 'run', seq: 1 });
  const out = sim.tick(DT);
  assert.ok(evs(out, 'interrupt').some((e) => e.id === 'c1'));
  assert.ok(!p.casting);
  assert.equal(p.mp, Math.min(p.mmp, mp + ab.mana), 'mana refunded');
});

test('every hotbar ability of every oath and class resolves', () => {
  const sim = mkSim();
  const S = sim._S;
  for (const o of OATHS) {
    for (const cls of ['ninja', 'sorcerer']) {
      const id = `t-${o.id}-${cls}`;
      join(sim, id, o.id, cls);
      const p = outside(sim, S.players.get(id));
      const m = dummy(sim, p, CREATURES.find((c) => c.oath === o.id && c.role === 'elite').id, 30, 4);
      p.hotbar.forEach((ab, slot) => {
        resolveAbility(S, p, ab, slot, { x: m.x, y: m.y, z: m.z }, null, m);
      });
      run(sim, 1.2);
      assert.ok(m.hp < m.mhp, `${o.id}/${cls} abilities damaged the target`);
      S.despawnMob(m);
      sim.removePlayer(id);
    }
  }
});

test('summons create pets that fight, self abilities buff', () => {
  const sim = mkSim();
  const S = sim._S;
  const { p } = join(sim, 'c1', 'oath-15', 'sorcerer');
  outside(sim, p);
  const slot = p.hotbar.findIndex((a) => a.shape === 'summon');
  assert.ok(slot > 0, 'tech sorcerer has a summon');
  const m = dummy(sim, p, 'rail-hound', 1, 5);
  m.mhp = m.hp = 5000;
  p.tgt = m.id;
  sim.handle('c1', { t: 'cast', slot, target: m.id });
  run(sim, 3);
  const pets = S.mobs.filter((x) => x.own === 'c1');
  assert.equal(pets.length, 1);
  assert.ok(m.hp < m.mhp, 'pet attacked');
  const { p: q } = join(sim, 'c2', 'oath-01', 'ninja');
  const self = q.hotbar.find((a) => a.shape === 'self');
  if (self) { resolveAbility(S, q, self, 1, null, null, null); assert.ok(hasStatus(q, 'empower')); }
});

test('leveling: xp curve, stat growth, level events, MAX_LEVEL cap', () => {
  const sim = mkSim();
  const S = sim._S;
  const { p } = join(sim);
  const hp1 = p.mhp;
  S.giveXp(p, xpForLevel(1) + xpForLevel(2) + 5);
  assert.equal(p.lvl, 3);
  assert.equal(p.xp, 5);
  assert.equal(p.mhp, hp1 + 2 * CLASSES.ninja.hpPerLevel);
  assert.equal(p.hp, p.mhp, 'full heal on level');
  const out = sim.tick(DT);
  assert.ok(evs(out, 'level').some((e) => e.level === 3));
  S.giveXp(p, 1e9);
  assert.equal(p.lvl, 30);
  assert.equal(p.xp, 0);
});

test('equipment changes stats', () => {
  const sim = mkSim();
  const { p } = join(sim);
  const S = sim._S;
  const power0 = p.stats.power;
  const it = { id: 'itest', kind: 'gear', slot: 'weapon', name: 'Test Blade', rarity: 'epic', lvl: 1, stats: { power: 50 }, qty: 1, value: 1 };
  p.inventory.push(it);
  sim.handle('c1', { t: 'equip', item: 'itest' });
  assert.equal(p.equipment.weapon.id, 'itest');
  assert.ok(p.stats.power > power0);
  sim.handle('c1', { t: 'unequip', slot: 'weapon' });
  assert.equal(p.equipment.weapon, undefined);
  assert.ok(p.inventory.some((i) => i.id === 'itest'));
  assert.ok(S.players.get('c1').stats.power < power0 + 0.5);
});

test('movement validation: accepts walking, corrects speed hacks, teleports and under-ground', () => {
  const sim = mkSim();
  const { p } = join(sim);
  run(sim, 1);
  const x0 = p.x, z0 = p.z;
  // legit: 6.4 m/s for 1 s in 12 steps
  let out = [];
  for (let i = 1; i <= 12; i++) {
    sim.handle('c1', { t: 'move', x: x0 + i * 0.53, y: p.y, z: z0, ry: 1.57, anim: 'run', seq: i });
    out.push(...sim.tick(1 / 12));
  }
  assert.ok(Math.abs(p.x - (x0 + 12 * 0.53)) < 1e-6, 'walking accepted');
  assert.equal(evs(out, 'teleport').length, 0);
  // teleport hack
  sim.handle('c1', { t: 'move', x: p.x + 200, y: p.y, z: p.z, seq: 20 });
  out = sim.tick(DT);
  assert.ok(evs(out, 'teleport').some((e) => e.id === 'c1' && e.reason === 'teleport'));
  assert.ok(Math.abs(p.x - (x0 + 6.36)) < 1e-6, 'position unchanged');
  run(sim, 1);
  // speed hack: 30 m/s sustained
  let corrected = 0;
  for (let i = 0; i < 40; i++) {
    sim.handle('c1', { t: 'move', x: p.x + 2.5, y: p.y, z: p.z, seq: 100 + i });
    corrected += evs(sim.tick(1 / 12), 'teleport').filter((e) => e.reason === 'speed').length;
  }
  assert.ok(corrected >= 1, 'speed hack corrected');
  assert.ok(sim._S.stats.corrections >= 2);
  // under ground -> clamped to terrain
  run(sim, 1);
  sim.handle('c1', { t: 'move', x: p.x + 0.3, y: -500, z: p.z, seq: 500 });
  assert.ok(p.y > -10, 'y clamped to ground');
  // stale sequence numbers ignored
  const xs = p.x;
  sim.handle('c1', { t: 'move', x: p.x + 0.5, y: p.y, z: p.z, seq: 5 });
  assert.equal(p.x, xs);
});

test('quest chain: talk -> kill N -> discover neighbour shrine -> veteran -> report', () => {
  const sim = mkSim();
  const S = sim._S;
  const { p } = join(sim, 'c1', 'oath-04', 'ninja');
  const keeper = S.npcs.find((n) => n.oath === 'oath-04' && n.role === 'oathkeeper');
  // too far
  let out = [];
  sim.handle('c1', { t: 'interact', id: keeper.id });
  // walk next to the oathkeeper (direct placement for the test)
  p.x = keeper.x + 1; p.z = keeper.z; S.grid.move(p); S.pgrid.move(p);
  sim.handle('c1', { t: 'interact', id: keeper.id });
  out = sim.tick(DT);
  assert.ok(evs(out, 'npc', 'c1').some((e) => e.role === 'oathkeeper' && e.options.length >= 1));
  assert.ok(p.quests.has('chain-oath-04-2'), 'step 2 active');
  const q2 = p.quests.get('chain-oath-04-2');
  for (let i = 0; i < q2.goal; i++) { const m = dummy(sim, p, 'reef-serpent', 1); m.hp = 1; dealDamage(S, p, m, 999, null, 't'); }
  assert.ok(p.quests.has('chain-oath-04-3'), 'step 3 active after kills');
  const q3 = p.quests.get('chain-oath-04-3');
  const s = S.sanctuaries[OATH_BY_ID[q3.shrine].index - 1];
  sim.handle('c1', { t: 'travel', shrine: q3.shrine });
  out = sim.tick(DT);
  assert.ok(evs(out, 'system', 'c1').some((e) => /not attuned/.test(e.text)), 'cannot travel to undiscovered shrine');
  p.x = s.shrine.x + 3; p.z = s.shrine.z; S.grid.move(p); S.pgrid.move(p);
  out = run(sim, 1.1);
  assert.ok(evs(out, 'discover', 'c1').some((e) => e.shrine === q3.shrine));
  assert.ok(p.quests.has('chain-oath-04-4'));
  const vet = dummy(sim, p, 'tideshell-skitterer', 1); vet.hp = 1; dealDamage(S, p, vet, 999, null, 't');
  assert.ok(p.quests.has('chain-oath-04-5'));
  // fast travel home now works (discovered), then report back
  p.combatUntil = 0;
  sim.handle('c1', { t: 'travel', shrine: 'oath-04' });
  out = sim.tick(DT);
  assert.ok(evs(out, 'teleport').some((e) => e.id === 'c1' && e.reason === 'travel'));
  p.x = keeper.x + 1; p.z = keeper.z; S.grid.move(p); S.pgrid.move(p);
  const gold = p.gold;
  sim.handle('c1', { t: 'interact', id: keeper.id });
  assert.equal(p.quests.size, 0, 'chain complete');
  assert.ok(p.gold > gold);
  assert.ok(p.inventory.some((i) => i.rarity === 'rare' && i.slot === 'weapon'), 'reward item');
  // bounty from the warden
  const warden = S.npcs.find((n) => n.oath === 'oath-04' && n.role === 'warden');
  p.x = warden.x + 1; p.z = warden.z; S.grid.move(p); S.pgrid.move(p);
  sim.handle('c1', { t: 'dialog', npc: warden.id, option: 'bounty' });
  assert.ok(p.quests.has('bounty-oath-04'));
});

test('mob AI: aggro, chase, attack, leash and reset', () => {
  const sim = mkSim();
  const S = sim._S;
  const { p } = join(sim);
  const camp = S.camps.find((c) => c.oath === 'oath-04' && c.level <= 5);
  const m = camp.mobs[0];
  // stand next to the camp
  p.x = m.x + 6; p.z = m.z; p.y = S.groundY(p.x, p.z); S.grid.move(p); S.pgrid.move(p);
  let out = run(sim, 2);
  assert.equal(m.state, 'chase', 'aggro on proximity');
  assert.ok(camp.mobs.filter((x) => x.state === 'chase').length >= 2, 'social aggro');
  out = run(sim, 3);
  assert.ok(evs(out, 'hit').some((e) => e.src === m.id && e.dst === 'c1'), 'mob attacked the player');
  // run away far beyond the leash
  m.x = m.home.x + 30; S.grid.move(m); // as if dragged away from its camp
  p.x = m.home.x + 300; p.z = m.home.z; p.y = S.groundY(p.x, p.z); S.grid.move(p); S.pgrid.move(p);
  m.hp = m.mhp * 0.5;
  run(sim, 0.5);
  assert.equal(m.state, 'return');
  assert.ok(m.invuln, 'invulnerable while resetting');
  assert.equal(m.threat.size, 0);
  run(sim, 15);
  assert.equal(m.state, 'idle');
  assert.equal(m.hp, m.mhp, 'reset to full health');
  assert.ok(Math.hypot(m.x - m.home.x, m.z - m.home.z) < 2);
});

test('player death and respawn at nearest discovered shrine', () => {
  const sim = mkSim();
  const S = sim._S;
  const { p } = join(sim);
  p.x += 400; S.grid.move(p); S.pgrid.move(p);
  const m = dummy(sim, p, 'reef-serpent', 1);
  p.hp = 1;
  dealDamage(S, m, p, 999, null, 'x');
  assert.equal(p.alive, false);
  run(sim, 2);
  sim.handle('c1', { t: 'respawn' });
  const out = sim.tick(DT);
  assert.ok(p.alive);
  const home = S.sanctuaries[OATH_BY_ID['oath-04'].index - 1];
  assert.ok(Math.hypot(p.x - home.spawn.x, p.z - home.spawn.z) < 10);
  assert.ok(evs(out, 'teleport').some((e) => e.reason === 'respawn'));
});

test('snapshots: interest management and per-client deltas', () => {
  const sim = mkSim();
  const S = sim._S;
  const { p } = join(sim);
  let snaps = [];
  for (let i = 0; i < 4; i++) snaps.push(...sim.tick(DT).filter((o) => o.to === 'c1' && o.msg.t === 'snap').map((o) => o.msg));
  assert.equal(snaps.length, 2, '10 Hz snapshots at 20 Hz ticks');
  const first = snaps[0];
  assert.ok(first.ents.some((e) => e.id === 'c1' && e.k === 'p' && e.name === 'Tester'), 'self included, full state');
  assert.ok(first.ents.some((e) => e.k === 'n' && e.role === 'oathkeeper'), 'NPCs included');
  for (const e of first.ents) assert.ok(Math.hypot(e.x - p.x, e.z - p.z) <= 220, 'within interest radius');
  assert.ok(!snaps[1].ents.some((e) => e.k === 'n'), 'unchanged NPCs not resent');
  sim.handle('c1', { t: 'move', x: p.x + 0.5, y: p.y, z: p.z, ry: 0, anim: 'walk', seq: 1 });
  snaps = []; for (let i = 0; i < 2; i++) snaps.push(...sim.tick(DT).filter((o) => o.to === 'c1' && o.msg.t === 'snap').map((o) => o.msg));
  const self = snaps[0].ents.find((e) => e.id === 'c1');
  assert.ok(self && !self.k && self.x !== undefined && self.anim === 'walk' && self.name === undefined, 'delta has only changed fields');
  // moving far away drops entities via gone
  p.x += 1000; S.grid.move(p); S.pgrid.move(p);
  snaps = []; for (let i = 0; i < 2; i++) snaps.push(...sim.tick(DT).filter((o) => o.to === 'c1' && o.msg.t === 'snap').map((o) => o.msg));
  assert.ok(snaps[0].gone.some((id) => id.startsWith('n-oath-04')));
});

test('chat: sanitising, channels, rate limiting', () => {
  assert.equal(sanitizeText('<b>hi</b>\u0007 there <script>x</script>'), 'hi there x');
  assert.equal(sanitizeText('a'.repeat(500)).length, 200);
  const sim = mkSim();
  const S = sim._S;
  const { p } = join(sim, 'c1');
  const { p: q } = join(sim, 'c2');
  const { p: far } = join(sim, 'c3');
  far.x += 500; S.pgrid.move(far); S.grid.move(far);
  sim.handle('c1', { t: 'chat', text: 'hello <i>all</i>', channel: 'say' });
  let out = sim.tick(DT);
  const chats = evs(out, 'chat');
  assert.ok(out.some((o) => o.to === 'c2' && o.msg.e?.type === 'chat' && o.msg.e.text === 'hello all'));
  assert.ok(!out.some((o) => o.to === 'c3' && o.msg.e?.type === 'chat'), 'say is local');
  assert.ok(chats.length >= 1);
  sim.handle('c1', { t: 'chat', text: 'world!', channel: 'world' });
  out = sim.tick(DT);
  assert.ok(out.some((o) => o.to === '*' && o.msg.e?.type === 'chat'));
  for (let i = 0; i < 10; i++) sim.handle('c1', { t: 'chat', text: `spam ${i}` });
  out = sim.tick(DT);
  assert.ok(evs(out, 'system', 'c1').some((e) => /too quickly/.test(e.text)));
  void q; void p;
});

test('persistence: remove + rejoin with token restores the character', () => {
  const saves = new Map();
  const persistence = { load: (t) => (saves.has(t) ? JSON.parse(saves.get(t)) : null), save: (t, d) => saves.set(t, JSON.stringify(d)) };
  const sim = mkSim({ persistence });
  const S = sim._S;
  const { w, p } = join(sim);
  S.giveXp(p, xpForLevel(1) * 3);
  p.gold = 777;
  const lvl = p.lvl;
  sim.removePlayer('c1');
  assert.ok(saves.has(w.token));
  const w2 = sim.addPlayer('c9', { t: 'hello', name: 'Other', oath: 'oath-04', cls: 'ninja', token: w.token });
  assert.equal(w2.token, w.token);
  assert.equal(w2.you.lvl, lvl);
  assert.equal(w2.you.gold, 777);
  assert.equal(w2.you.name, 'Tester');
  // a different class with the same token is a new character
  const w3 = sim.addPlayer('c10', { t: 'hello', name: 'X', oath: 'oath-04', cls: 'sorcerer', token: w.token });
  assert.notEqual(w3.token, w.token);
  assert.equal(w3.you.lvl, 1);
});

test('world events and AI adventurers', () => {
  const sim = createSim({ seed: 5, bots: 12, campsPerRegion: 6, firstEventMs: 1e9 });
  outside(sim, join(sim).p);
  let out = run(sim, 10);
  assert.equal(sim.stats().bots, 11, 'bots fill up to target minus humans');
  const ev = sim.startEvent('worldboss', 'oath-04');
  assert.ok(sim._S.ents.get(ev.mob).name.startsWith('Herald'));
  sim.startEvent('meteors', 'oath-04');
  out = run(sim, 6);
  assert.ok(out.some((o) => o.to === '*' && o.msg.e?.type === 'world'));
  assert.ok(out.some((o) => o.msg.e?.type === 'cast' && o.msg.e.ability === 'world/meteor'));
  out = run(sim, 60);
  const botsMoved = [...sim._S.players.values()].filter((b) => b.bot && b.anim !== 'idle').length;
  assert.ok(botsMoved >= 1, 'bots are active');
  assert.ok(sim._S.stats.hits > 0, 'combat happened');
});
