import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) { if (specifier.startsWith('@shared/')) return nextResolve(new URL(`../../../shared/${specifier.slice(8)}`, import.meta.url).href, context); return nextResolve(specifier, context); } });
const THREE = await import('three');
const { initWorld } = await import('./world.js');

test('tree trunks stop a walking body and report where a camera ray meets them', async () => {
  const scene = new THREE.Scene();
  const world = await initWorld({ scene, quality: { name: 'low' }, addUpdate: () => () => {}, collision: null });
  try {
    // Forest realm, outside the city ring: streamed tiles carry trunks.
    world.focus(-1440 + 320, -540 + 40); await world.ready();
    const tile = scene.children.find((child) => child.userData?.trunks?.length);
    assert.ok(tile, 'a streamed tile lists its trunks');
    const [x, z, radius] = tile.userData.trunks[0];
    assert.ok(radius > .25 && radius < .9);
    const body = { x: x + .05, z: z + .02 };
    assert.equal(world.resolveTrunks(body, .36), true);
    assert.ok(Math.hypot(body.x - x, body.z - z) >= radius + .36 - 1e-6, 'pushed clear of the trunk');
    assert.equal(world.resolveTrunks(body, .36), false, 'already clear');
    const k = world.trunkHit(x - 6, z, x + 6, z);
    assert.ok(k > .3 && k < .5, `ray from 6 m out meets the near side (${k})`);
    assert.equal(world.trunkHit(x - 6, z + 40, x + 6, z + 40) <= 1, true);
  } finally { world.dispose(); }
});
