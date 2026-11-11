import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) { if (specifier.startsWith('@shared/')) return nextResolve(new URL(`../../../shared/${specifier.slice(8)}`, import.meta.url).href, context); return nextResolve(specifier, context); } });
const THREE = await import('three');
const { heightAt, sampleTerrain } = await import('@shared/terrain.js');
const { OATHS, SANCTUARY } = await import('@shared/oaths.js');
const { planAll, planRealm, createRealmLandmarks, cityDistance, roadDistance, waterLevelAt } = await import('./realmLandmarks.js');
const BT = await import('./biome-landmarks.generated.js');

test('the generated module is stamped with its source commit and imports without a canvas', () => {
  assert.match(BT.BIOME_LANDMARKS_COMMIT, /^[0-9a-f]{40}$/);
  assert.equal(typeof document, 'undefined');
  assert.equal(typeof BT.RECIPES.havenArchipelago, 'function');
});

test('every realm but the industrial one has landmarks, and planning is repeatable', async () => {
  const plans = planAll();
  for (const plan of plans) if (plan.biome !== 'industrial') assert.ok(plan.items.length >= (plan.biome === 'crimson' ? 1 : 2), `${plan.biome} has ${plan.items.length} landmarks`);
  // A fresh module instance (no cache) must plan exactly the same things.
  const fresh = await import('./realmLandmarks.js?again');
  assert.notEqual(fresh.planRealm, planRealm);
  const strip = (list) => JSON.stringify(list.map((plan) => ({ items: plan.items, solids: plan.solids })));
  assert.equal(strip(fresh.planAll()), strip(plans));
});

test('nothing stands in a city ring, on a road, or under water unless it floats or stands in water', () => {
  for (const plan of planAll()) for (const item of plan.items) {
    const where = `${plan.biome} ${item.kind} at ${item.x.toFixed(0)},${item.z.toFixed(0)}`;
    if (item.sky) { for (const [x, z, r] of item.spots) assert.ok(cityDistance(x, z) - r > SANCTUARY.cityRadius, `${where}: an island hangs over a city`); continue; }
    assert.ok(cityDistance(item.x, item.z) > SANCTUARY.cityRadius + 10, `${where} is inside a city ring`);
    assert.ok(roadDistance(item.x, item.z) > 14, `${where} is on a road (${roadDistance(item.x, item.z).toFixed(1)} m)`);
    const sample = sampleTerrain(item.x, item.z, {});
    assert.ok(sample.road > 14 && sample.plaza < .35, `${where}: road ${sample.road}, plaza ${sample.plaza}`);
    if (!item.floats) assert.ok(heightAt(item.x, item.z) > waterLevelAt(item.x, item.z), `${where} is under water`);
    else if (!['stilthut', 'punt', 'marshsnag', 'knee'].includes(item.kind)) assert.ok(heightAt(item.x, item.z) < waterLevelAt(item.x, item.z), `${where} floats on dry land`);
  }
});

test('solid footprints keep clear of city rings and roads too', () => {
  for (const plan of planAll()) for (const solid of plan.solids) {
    const reach = solid.type === 'circle' ? solid.r : Math.hypot(solid.hw, solid.hd);
    assert.ok(cityDistance(solid.x, solid.z) - reach > SANCTUARY.cityRadius, `${plan.biome} solid reaches into a city`);
    assert.ok(roadDistance(solid.x, solid.z) - reach > 9, `${plan.biome} ${solid.type} solid reaches a road (${(roadDistance(solid.x, solid.z) - reach).toFixed(1)} m)`);
    assert.ok(solid.y1 > solid.y0 || solid.type === 'ramp');
  }
});

test('near a realm its footprints become solid, and without a canvas nothing is drawn', () => {
  const added = []; const collision = { addCircle: (...a) => added.push(['circle', ...a]), addBox: (...a) => added.push(['box', ...a]), addRamp: (...a) => added.push(['ramp', ...a]) };
  const scene = new THREE.Scene(), landmarks = createRealmLandmarks({ scene, collision, quality: { name: 'low' } });
  const egypt = OATHS.find((oath) => oath.biome === 'badlands');
  landmarks.update(.016, egypt.center[0] + 200, egypt.center[1]);
  assert.ok(added.length >= planRealm(egypt.id).solids.length && added.length > 20);
  assert.equal(scene.children.length, 0);
  assert.equal(landmarks.stats().built, 0);
  landmarks.dispose();
});

test('with a canvas every realm builds its meshes from the copied builders', () => {
  const context2d = new Proxy({}, { get: (_, key) => /ImageData$/.test(String(key)) ? (...args) => ({ data: new Uint8ClampedArray(Math.max(4, (args.at(-2) | 0) * (args.at(-1) | 0) * 4)) }) : () => context2d, set: () => true });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context2d, style: {} }) };
  const errors = [], original = console.error; console.error = (...args) => errors.push(args.join(' '));
  try {
    for (const oath of OATHS) {
      const scene = new THREE.Scene(), landmarks = createRealmLandmarks({ scene, collision: null, quality: { name: 'high' } }, { planRange: 300, buildRange: 300 });
      landmarks.update(.016, ...oath.center);
      for (let i = 0; i < 80 && landmarks.stats().pending; i++) landmarks.update(.016, ...oath.center);
      const plan = planRealm(oath.id);
      if (!plan.items.length) continue;
      let meshes = 0, vertices = 0; scene.traverse((node) => { if (node.isMesh) { meshes++; vertices += node.geometry.attributes.position.count; assert.ok(Number.isFinite(node.geometry.attributes.position.array[0])); } });
      assert.ok(meshes >= 1 && vertices > 500, `${oath.biome}: ${meshes} meshes, ${vertices} vertices`);
      landmarks.dispose();
    }
  } finally { console.error = original; delete globalThis.document; }
  assert.deepEqual(errors, []);
});
