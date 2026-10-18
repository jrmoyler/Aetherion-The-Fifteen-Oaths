import test from 'node:test';
import assert from 'node:assert/strict';
import { StatusVisuals } from './feedback.js';

test('authoritative status snapshots preserve live effects and renew expired ones', () => {
  let created = 0, stopped = 0;
  const actor = { alive: true };
  const statuses = new StatusVisuals({ actors: { get: () => actor }, vfx: {
    status() { created++; return { done: false, stop() { stopped++; } }; },
  } });
  statuses.sync('a', ['burn']);
  const entry = statuses.map.get('a|burning');
  // Emulate a later snapshot by moving stored expiry back, without waiting.
  entry.until -= 5;
  statuses.sync('a', ['burn']);
  assert.equal(created, 1); assert.equal(stopped, 0);
  entry.h.done = true; statuses.sync('a', ['burn']);
  assert.equal(created, 2);
  statuses.clear('a'); assert.equal(stopped, 1); assert.equal(statuses.map.size, 0);
});
