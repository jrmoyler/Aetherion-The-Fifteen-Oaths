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
