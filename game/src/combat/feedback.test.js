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

import { Group, Mesh, MeshStandardMaterial, BoxGeometry, Color } from 'three';
import { HitFlashes } from './feedback.js';
test('hit flashes isolate shared GLTF materials and restore exact originals', () => {
  const shared = new MeshStandardMaterial({ emissive: '#112233' });
  const root = new Group(); const hit = new Mesh(new BoxGeometry(), shared), other = new Mesh(new BoxGeometry(), shared);
  root.add(hit); const flashes = new HitFlashes(); flashes.flash({root},new Color('#ff0000'));
  assert.notEqual(hit.material, shared); assert.equal(other.material, shared);
  flashes.update(.04); assert.notEqual(hit.material.emissive.getHex(),shared.emissive.getHex());
  flashes.flash({root}); assert.equal(flashes.list.length,1);
  flashes.update(1); assert.equal(hit.material,shared); assert.equal(flashes.list.length,0);
  shared.dispose(); hit.geometry.dispose(); other.geometry.dispose();
});
