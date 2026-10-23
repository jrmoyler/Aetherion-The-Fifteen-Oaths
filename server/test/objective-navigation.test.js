import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../shared/sim/index.js';
import { chainStep, questWaypoint, onTalk } from '../../shared/sim/quests.js';
import { OATHS } from '../../shared/oaths.js';

test('all 120 initiation steps have destinations in the production world', () => {
  const S = createSim({ seed: 15015, bots: 0 })._S;
  for (const oath of OATHS) for (let step = 1; step <= 8; step++) {
    const waypoint = questWaypoint(S, {x: oath.center[0], z: oath.center[1], lvl: 1}, chainStep(S, oath.id, step));
    assert.ok(waypoint && Number.isFinite(waypoint.x) && Number.isFinite(waypoint.z), `${oath.id} step ${step}`);
    assert.ok(waypoint.label.length > 0);
  }
});

test('welcome and quest advancement expose the current objective to the HUD', () => {
  const sim = createSim({ seed: 15015, bots: 0 });
  const welcome = sim.addPlayer('wayfinder', {name:'Wayfinder', oath:'oath-09', cls:'ninja'});
  const S = sim._S, p = S.players.get('wayfinder');
  assert.ok(welcome.you.quests[0].waypoint);
  const initial = welcome.you.quests[0].waypoint;
  onTalk(S,p,{role:'oathkeeper',oath:p.oath});
  const next = S.youState(p).quests[0];
  assert.equal(next.kind,'kill');
  assert.ok(next.waypoint);
  assert.notDeepEqual(next.waypoint, initial);
  assert.ok(S.out.some((m) => m.msg.e?.type === 'quest' && m.msg.e.quest.kind === 'kill' && m.msg.e.quest.waypoint));
});
