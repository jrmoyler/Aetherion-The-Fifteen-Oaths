import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainEvictions, TERRAIN_CACHE_LIMITS } from '../src/world/residency.js';
const node = (k, props = {}) => ({ k, size: 128, shown: false, used: 1, lastUsed: 9000, ...props });
const policy = { frame: 2, now: 10000, limit: 2, rootSize: 1024 };
const map = values => new Map(values.map(v => [v.k, v]));
test('pressure evicts least recently used without losing current coverage or roots', () => {
  const nodes = map([node('root', { size: 1024 }), node('visible', { shown: true }), node('desired', { used: 2 }), node('warm'), node('cold', { lastUsed: 1000 })]);
  assert.deepEqual(terrainEvictions(nodes, policy).map(n => n.k), ['cold', 'warm']);
});
test('recently visited cache remains under target; expiry also reclaims below target', () => {
  assert.equal(terrainEvictions(map([node('warm')]), policy).length, 0);
  assert.deepEqual(terrainEvictions(map([node('old', { lastUsed: -10000 })]), policy).map(n => n.k), ['old']);
});
test('retirement work is bounded even after teleporting across the continent', () => {
  const nodes = map(Array.from({ length: 100 }, (_, i) => node(String(i))));
  assert.equal(terrainEvictions(nodes, policy).length, 8);
});
test('cache targets grow with quality', () => {
  const limits = Object.values(TERRAIN_CACHE_LIMITS);
  assert.ok(limits.every((n, i) => i === 0 || n > limits[i - 1]));
});
