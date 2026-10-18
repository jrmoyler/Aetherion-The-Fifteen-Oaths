import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../lib/validate.js';
import { ABILITIES_BY_OATH } from '../../shared/abilities.js';
import { createSim } from '../../shared/sim/index.js';
import { createMob, resetMob } from '../../shared/sim/mobs.js';
import { schedule, processDelayed, TEAM_MOB } from '../../shared/sim/combat.js';
import { chainStep, addQuest, onKill, onTalk } from '../../shared/sim/quests.js';

function setup() {
  const sim = createSim({ seed: 17, bots: 0, campsPerRegion: 1, firstEventMs: 1e9 });
  sim.addPlayer('tester', { name: 'Tester', oath: 'oath-04', cls: 'ninja' });
  return { sim, S: sim._S, p: sim._S.players.get('tester') };
}

test('enemy melee windup can be escaped and reset enemies cannot land delayed attacks', () => {
  const { S, p } = setup();
  const m = createMob(S, 'reef-serpent', p.x + 2, p.z, 1);
  const hp = p.hp;
  const hit = () => schedule(S, 0, { kind: 'hit', team: TEAM_MOB, src: m.id, dst: p.id, reach: 3, amount: 10 });
  hit(); p.x += 10; processDelayed(S); assert.equal(p.hp, hp, 'escaped swing misses');
  p.x = m.x; hit(); m.state = 'return'; processDelayed(S); assert.equal(p.hp, hp, 'leashed swing misses');
  m.state = 'chase'; hit(); m.alive = false; processDelayed(S); assert.equal(p.hp, hp, 'dead attacker cannot hit');
  m.alive = true; hit(); processDelayed(S); assert.ok(p.hp < hp, 'remaining in reach takes damage');
});

test('early shrine exploration satisfies later quest and partial progress is durable', () => {
  const { S, p } = setup();
  p.quests.clear();
  const q = chainStep(S, p.oath, 3); p.discovered.add(q.shrine);
  addQuest(S, p, q);
  assert.equal(p.chainStep, 4); assert.ok(p.quests.has(`chain-${p.oath}-4`));
  p.quests.clear(); addQuest(S, p, chainStep(S, p.oath, 6)); p.saveDirty = false;
  const elite = [...p.quests.values()][0]; onKill(S, p, { def: { id: elite.targets[0] } });
  assert.equal(elite.progress, 1); assert.equal(p.saveDirty, true);
});

test('initiation continues through elite and boss hunts to a final report', () => {
  const { S, p } = setup(); p.quests.clear();
  addQuest(S, p, chainStep(S, p.oath, 6));
  let q = [...p.quests.values()][0];
  onKill(S, p, { def: { id: q.targets[0] } }); onKill(S, p, { def: { id: q.targets[0] } });
  assert.equal(p.chainStep, 7); q = [...p.quests.values()][0];
  onKill(S, p, { def: { id: q.targets[0] } });
  assert.equal(p.chainStep, 8); assert.ok(p.inventory.some((i) => i.rarity === 'epic'));
  onTalk(S, p, { role: 'oathkeeper', oath: p.oath });
  assert.equal(p.chainStep, 9); assert.equal(p.quests.size, 0);
});

test('camp reward occurs on final defender only and respawn re-arms it', () => {
  const { S, p } = setup();
  const mobs = [createMob(S, 'reef-serpent', p.x, p.z, 1), createMob(S, 'reef-serpent', p.x + 1, p.z, 1)];
  const camp = { level: 1, mobs }; mobs.forEach((m) => { m.camp = camp; });
  S.kill(mobs[0], p); assert.ok(!camp.cleared);
  S.kill(mobs[1], p); assert.equal(camp.cleared, true);
  assert.equal(S.out.filter((o) => o.msg.e?.text?.startsWith('Camp secured!')).length, 1);
  S.kill(mobs[1], p);
  assert.equal(S.out.filter((o) => o.msg.e?.text?.startsWith('Camp secured!')).length, 1);
  S.respawnMob(mobs[0]); assert.equal(camp.cleared, false);
});


test('encounter adds leave on boss reset or defeat without awarding farmable kills', () => {
  const { S, p } = setup();
  const boss = S.mobs.find((m) => m.role === 'boss');
  const spawn = () => createMob(S, 'reef-serpent', boss.x, boss.z, 1, { fields: { temp: true, encounterOwner: boss.id } });
  const a = spawn(); const kills = S.stats.kills;
  resetMob(S, boss);
  assert.equal(S.ents.has(a.id), false); assert.equal(S.stats.kills, kills);
  const b = spawn(); S.kill(boss, p);
  assert.equal(S.ents.has(b.id), false); assert.equal(S.stats.kills, kills + 1);
});

test('authoritative loadout accepts atomic swaps, persists and rejects combat, spam and wrong Oaths', () => {
  const { sim, S, p } = setup();
  const old = p.hotbar.map((a) => a.id);
  const ids = old.slice(1); [ids[0], ids[1]] = [ids[1], ids[0]];
  sim.handle(p.id, { t: 'loadout', ids });
  assert.deepEqual(p.hotbar.slice(1).map((a) => a.id), ids);
  assert.equal(p.hotbar[0].id, old[0]);
  assert.deepEqual(S.youState(p).loadout, ids);
  assert.deepEqual(S.serialize(p).loadout, ids);
  sim.handle(p.id, { t: 'loadout', ids: old.slice(1) });
  assert.deepEqual(p.hotbar.slice(1).map((a) => a.id), ids, 'spam ignored');
  S.t += 300; p.combatUntil = S.t + 1000;
  sim.handle(p.id, { t: 'loadout', ids: old.slice(1) });
  assert.deepEqual(p.hotbar.slice(1).map((a) => a.id), ids, 'combat locked');
  S.t += 1100; p.cds[2] = S.t + 1000;
  sim.handle(p.id, { t: 'loadout', ids: old.slice(1) });
  assert.deepEqual(p.hotbar.slice(1).map((a) => a.id), ids, 'cooldown cannot be bypassed');
  S.t += 1100;
  sim.handle(p.id, { t: 'loadout', ids: ['basic/ninja', ...ids.slice(1)] });
  assert.deepEqual(p.hotbar.slice(1).map((a) => a.id), ids, 'basic is not a selectable spell');
  S.t += 300;
  sim.handle(p.id, { t: 'loadout', ids: Array(5).fill(ids[0]) });
  assert.deepEqual(p.hotbar.slice(1).map((a) => a.id), ids, 'duplicates rejected');
  S.t += 300;
  sim.handle(p.id, { t: 'loadout', ids: [ABILITIES_BY_OATH['oath-01'][0].id, ...ids.slice(1)] });
  assert.deepEqual(p.hotbar.slice(1).map((a) => a.id), ids, 'other Oath rejected');
  const saved = S.serialize(p);
  sim.removePlayer(p.id); sim.addPlayer(p.id, { name: 'Tester', oath: p.oath, cls: p.cls, token: p.token }, saved);
  assert.deepEqual(S.players.get(p.id).hotbar.slice(1).map((a) => a.id), ids, 'restored on reconnect');
});


test('loadout protocol whitelists fields and rejects malformed input', () => {
  assert.equal(validate({ t: 'loadout', slot: 0, ability: 'x' }), null);
  assert.equal(validate({ t: 'loadout', slot: 1.5, ability: 'x' }), null);
  assert.equal(validate({ t: 'loadout', ids: ['x'] }), null);
  assert.equal(validate({ t: 'loadout', ids: Array(5).fill({ id: 'x' }) }), null);
  assert.deepEqual(validate({ t: 'loadout', slot: 1, ability: 'x', damage: 999 }), { t: 'loadout', slot: 1, ability: 'x' });
});
