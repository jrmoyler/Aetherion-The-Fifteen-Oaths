import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionBuffer } from './timing.js';

test('buffer preserves early input, then releases exactly once', () => {
  const b = new ActionBuffer(); b.push(0, 100);
  assert.equal(b.take(140, () => false), null);
  assert.equal(b.take(180, () => true), 0);
  assert.equal(b.take(181, () => true), null);
});
test('new input replaces old input; expired and cancelled taps cannot fire', () => {
  const b = new ActionBuffer(); b.push(1, 0); b.push(4, 40);
  assert.equal(b.take(100, () => true), 4);
  b.push(2, 100); assert.equal(b.take(281, () => true), null);
  b.push(5, 300); b.clear(); assert.equal(b.take(301, () => true), null);
});

test('authoritative cooldown reductions and resets reach the hotbar', async () => {
  const { reconcileCooldown } = await import('./timing.js');
  assert.equal(reconcileCooldown(12000, 10000, 500, 9000), 2500);
  assert.equal(reconcileCooldown(0, 10000, 500, 9000), 0);
  assert.equal(reconcileCooldown(9000, 10000, 500, 9000), 0);
  assert.equal(reconcileCooldown(0, 10000, 500, 9000, true), 9000);
  assert.equal(reconcileCooldown(NaN, 10000, 500, 9000), 9000);
});
