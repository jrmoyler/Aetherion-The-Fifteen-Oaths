import test from 'node:test';
import assert from 'node:assert/strict';
import { OATHS, ROUTES } from '../../shared/oaths.js';
import { TICK_HZ } from '../../shared/protocol.js';
import { heightAt, waterLevelAt } from '../../shared/terrain.js';
import { createSim } from '../../shared/sim/index.js';
import { buildStoryEncounters, SAFE_RADIUS } from '../../shared/sim/world.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function assertDryWalk(a, b, message) {
  const steps = Math.ceil(distance(a, b) / 2);
  let previous = heightAt(a.x, a.z);
  for (let i = 0; i <= steps; i++) {
    const x = a.x + (b.x - a.x) * i / steps, z = a.z + (b.z - a.z) * i / steps;
    const y = heightAt(x, z);
    assert.ok(y > waterLevelAt(x, z) + .4 && Math.abs(y - previous) < 2, message);
    previous = y;
  }
}

test('all Oaths have two distinct story fights connected to the same dry sanctuary road', () => {
  const sites = buildStoryEncounters();
  assert.equal(sites.length, 30);
  for (const oath of OATHS) {
    const [ambush, breach] = sites.filter((site) => site.oath === oath.id);
    assert.equal(ambush.storyEncounter, 'ambush');
    assert.equal(breach.storyEncounter, 'breach');
    assert.equal(ambush.roadTo, breach.roadTo);
    assert.ok(ROUTES.some((route) => route.includes(oath.id) && route.includes(ambush.roadTo)));
    assert.ok(distance(ambush, breach) >= 70);
    for (const site of [ambush, breach]) {
      assert.ok(distance(site.approach.origin, site) >= SAFE_RADIUS + 30);
      assertDryWalk(site.approach.inner, site.approach.gate, `${oath.id} sanctuary exit`);
      assertDryWalk(site.approach.gate, site, `${oath.id} ${site.storyEncounter} access`);
    }
  }
});

test('campaign encounter enemies are isolated from regular camps and the champion telegraphs a dodgeable attack', () => {
  const sim = createSim({ seed: 15015, campaign: true, campsPerRegion: 5, firstEventMs: 1e9, allowSpawnParam: true });
  const S = sim._S;
  const [ambush, breach] = S.storyEncounters.filter((site) => site.oath === 'oath-09');
  assert.deepEqual(ambush.mobs.map((mob) => [mob.lvl, mob.storyMember]), [[1, 0], [1, 1]]);
  assert.ok(S.camps.every((camp) => S.storyEncounters.every((site) => distance(site, camp) >= 48)));
  const [champion] = breach.mobs;
  const hello = { oath: 'oath-09', cls: 'ninja', name: 'Tester', spawn: { x: breach.x + 10, z: breach.z } };
  const welcome = sim.addPlayer('tester', hello);
  assert.equal(welcome.world.storySites.length, 30);
  assert.equal(createSim({ campsPerRegion: 1 })._S.storyEncounters.length, 0);
  let telegraph = null;
  for (let i = 0; i < TICK_HZ * 4 && !telegraph; i++) {
    const out = sim.tick(1 / TICK_HZ);
    telegraph = out.find(({ msg }) => msg.e?.src === champion.id && msg.e.telegraph)?.msg.e;
  }
  assert.ok(telegraph, 'champion shows its area attack shortly after engagement');
  assert.equal(telegraph.castTime, 1.8);
  const player = S.players.get('tester');
  const hp = player.hp;
  player.x = telegraph.aim.x + telegraph.radius + 2;
  player.y = S.groundY(player.x, player.z);
  S.grid.move(player); S.pgrid.move(player);
  for (let i = 0; i < TICK_HZ * telegraph.castTime + 2; i++) sim.tick(1 / TICK_HZ);
  assert.ok(player.hp >= hp, 'moving clear of the painted area escapes the hit');
});

test('players can observe the first road fight before initiating it', () => {
  const sim = createSim({ campaign: true, seed: 15015, campsPerRegion: 0, firstEventMs: Infinity, allowSpawnParam: true });
  const S = sim._S;
  const site = S.storyEncounters.find(entry => entry.oath === 'oath-09' && entry.storyEncounter === 'ambush');
  const spawn = { x: site.x - site.direction.x * 16, z: site.z - site.direction.z * 16 };
  const id = 'traveler';
  const welcome = sim.addPlayer(id, { oath: 'oath-09', cls: 'sorcerer', name: 'Traveler', spawn });
  for (let i = 0; i < TICK_HZ * 20; i++) sim.tick(1 / TICK_HZ);
  const player = S.players.get(id);
  assert.equal(player.hp, welcome.you.hp);
  assert.ok(site.mobs.every(mob => mob.state === 'idle'));
  const target = site.mobs[0];
  sim.handle(id, { t: 'cast', slot: 0, target: target.id, aim: { x: target.x, y: target.y, z: target.z } });
  for (let i = 0; i < TICK_HZ * 3; i++) sim.tick(1 / TICK_HZ);
  assert.ok(target.hp < target.mhp, 'the first basic cast reaches a visible defender');
  assert.ok(site.mobs.every(mob => mob.threat.has(id)), 'both defenders engage after a hit');
});
