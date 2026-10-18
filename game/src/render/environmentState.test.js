import test from 'node:test';
import assert from 'node:assert/strict';
import { copyGrade, approach, approachHue, particleCapacity } from './environmentState.js';
import { NEUTRAL_GRADE } from './grades.js';

test('travelling between region grades cannot permanently tint the neutral palette', () => {
  const baseline = structuredClone(NEUTRAL_GRADE);
  const current = copyGrade(NEUTRAL_GRADE), target = copyGrade(NEUTRAL_GRADE);
  current.tint[0] = 0.2;
  current.amb[1] = 0.4;
  assert.deepEqual(NEUTRAL_GRADE, baseline);
  assert.deepEqual(target, baseline);
});

test('weather transitions are equivalent at 30 and 120 frames per second', () => {
  function simulate(fps) {
    let emission = 0;
    for (let frame = 0; frame < fps * 3; frame++) emission = approach(emission, 1, 0.8, 1 / fps);
    return emission;
  }
  assert.ok(Math.abs(simulate(30) - simulate(120)) < 1e-12);
  assert.equal(approach(0.5, 1, 0.8, NaN), 0.5);
  assert.equal(approach(0.5, 1, 0.8, -1), 0.5);
});

test('region hue crosses the seam without passing through the opposite colour', () => {
  const midpoint = approachHue(350, 10, 1, Math.log(2));
  assert.ok(midpoint < 1e-10 || midpoint > 360 - 1e-10);
});

test('CPU fallback emission budget follows actual capacity and respects disabled particles', () => {
  assert.equal(particleCapacity(9000, 1, false), 3000);
  assert.equal(particleCapacity(9000, 0, true), 0);
  assert.equal(particleCapacity(9000, -1, false), 0);
  assert.equal(particleCapacity(9000, 1, true), 9000);
});
