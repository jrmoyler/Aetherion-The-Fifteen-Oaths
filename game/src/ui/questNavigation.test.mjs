import test from 'node:test';
import assert from 'node:assert/strict';
import { objectiveGuidance, routedWaypoint, trackedObjective } from './questNavigation.js';
const origin = {x:0,z:0};
test('quest guidance follows camera yaw including wrapped rotations', () => {
  assert.equal(objectiveGuidance(origin,0,{x:0,z:100}).label,'Ahead · 100 m');
  assert.equal(objectiveGuidance(origin,0,{x:100,z:0}).label,'Turn left · 100 m');
  assert.equal(objectiveGuidance(origin,0,{x:-100,z:0}).label,'Turn right · 100 m');
  assert.equal(objectiveGuidance(origin,Math.PI,{x:0,z:100}).label,'Behind you · 100 m');
  assert.equal(objectiveGuidance(origin,Math.PI*8,{x:0,z:100}).label,'Ahead · 100 m');
});
test('arrival and unavailable waypoints are explicit', () => {
  assert.equal(objectiveGuidance(origin,0,{x:3,z:4}).label,'Destination reached');
  assert.equal(objectiveGuidance(origin,0,null),null);
  assert.equal(objectiveGuidance(origin,NaN,{x:1,z:2}),null);
});

test('campaign takes priority over available side objectives', () => {
  const side = { id: 'side', waypoint: { x: 1, z: 0 } };
  const story = { id: 'story', chapter: 'The Broken Ward', waypoint: { x: 2, z: 0 } };
  const quests = new Map([[side.id, side], [story.id, story]]);
  assert.equal(trackedObjective(quests), story);
  story.done = true;
  assert.equal(trackedObjective(quests), side);
});
test('the sanctuary route carries the player through the gate in both directions', () => {
  const approach = { origin, inner: { x: 0, z: 44 }, gate: { x: 0, z: 155 } };
  const fight = { x: 10, z: 210, approach };
  assert.equal(routedWaypoint({ x: 25, z: 0 }, fight), approach.inner);
  assert.equal(routedWaypoint({ x: 11, z: 30 }, fight), approach.inner);
  assert.equal(routedWaypoint({ x: 1, z: 40 }, fight), approach.gate);
  assert.equal(routedWaypoint({ x: 0, z: 50 }, fight), approach.gate);
  assert.equal(routedWaypoint({ x: 0, z: 152 }, fight), fight);
  const home = { x: 30, z: 16, approach, returning: true };
  assert.equal(routedWaypoint({ x: 10, z: 190 }, home), approach.gate);
  assert.equal(routedWaypoint({ x: 0, z: 152 }, home), approach.inner);
  assert.equal(routedWaypoint({ x: 0, z: 43 }, home), home);
});

test('travel across realms guides through the departure and destination gates', () => {
  const approach = { origin, inner: { x: 0, z: 44 }, gate: { x: 0, z: 155 } };
  const arrival = { origin: { x: 0, z: 1000 }, inner: { x: 0, z: 956 }, gate: { x: 0, z: 845 } };
  const shrine = { x: 10, z: 990, approach, arrival };
  assert.equal(routedWaypoint({ x: 0, z: 50 }, shrine), approach.gate);
  assert.equal(routedWaypoint({ x: 0, z: 500 }, shrine), arrival.gate);
  assert.equal(routedWaypoint({ x: 0, z: 846 }, shrine), arrival.inner);
  assert.equal(routedWaypoint({ x: 0, z: 961 }, shrine), shrine);
});
