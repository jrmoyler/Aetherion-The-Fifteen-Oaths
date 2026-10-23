import test from 'node:test';
import assert from 'node:assert/strict';
import { objectiveGuidance } from './questNavigation.js';
const origin = {x:0,z:0};
test('quest guidance follows camera yaw including wrapped rotations', () => {
  assert.equal(objectiveGuidance(origin,0,{x:0,z:100}).label,'Ahead · 100 m');
  assert.equal(objectiveGuidance(origin,0,{x:100,z:0}).label,'Turn right · 100 m');
  assert.equal(objectiveGuidance(origin,0,{x:-100,z:0}).label,'Turn left · 100 m');
  assert.equal(objectiveGuidance(origin,Math.PI,{x:0,z:100}).label,'Behind you · 100 m');
  assert.equal(objectiveGuidance(origin,Math.PI*8,{x:0,z:100}).label,'Ahead · 100 m');
});
test('arrival and unavailable waypoints are explicit', () => {
  assert.equal(objectiveGuidance(origin,0,{x:3,z:4}).label,'Destination reached');
  assert.equal(objectiveGuidance(origin,0,null),null);
  assert.equal(objectiveGuidance(origin,NaN,{x:1,z:2}),null);
});
