import test from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from './core.js';

test('effect interruption stops and disposes primitives exactly once', () => {
  let starts = 0, stops = 0, disposals = 0, releases = 0, events = 0;
  const fx = new Effect({ lightPool: { release() { releases++; } } }, { id: 'test' });
  fx.at(0, 1, { start() { starts++; }, stop() { stops++; }, dispose() { disposals++; } });
  fx.call(0.8, () => events++);
  fx.update(0.2); fx.dispose(); fx.dispose(); fx.update(2);
  assert.deepEqual([starts, stops, disposals, releases, events], [1, 1, 1, 1, 0]);
});
