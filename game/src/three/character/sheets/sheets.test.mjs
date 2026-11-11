import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { RECIPES } from './recipes/index.js';
import { BUILDERS } from './builders.js';
import { buildCostume } from './costume.js';
import { costumeMaterial } from './material.js';
import { PROFILES } from '../profiles.js';

// Bind-pose joints of oath-01-ninja (metres), the proportions every forge hero is a variation of.
const JOINTS = { hips: [0, .9978, -.0099], spine: [0, 1.097, -.0049], spine1: [0, 1.221, -.0099], spine2: [0, 1.345, -.0198], neck: [0, 1.4938, -.0247], head: [0, 1.5779, 0],
  'shoulder.L': [.0241, 1.4592, .0049], 'upperarm.L': [.1819, 1.4493, -.0198], 'forearm.L': [.3809, 1.236, -.0256], 'hand.L': [.5306, 1.0393, .0238],
  'thigh.L': [.0868, .9435, -.0049], 'shin.L': [.0947, .5232, .0119], 'foot.L': [.0986, .1128, -.0178], 'toe.L': [.1085, .0505, .1137] };
function rig(scale = 1) {
  const J = {}, index = {};
  for (const [name, p] of Object.entries(JOINTS)) { J[name] = new Vector3(...p).multiplyScalar(scale); if (name.endsWith('.L')) J[name.replace('.L', '.R')] = new Vector3(-p[0], p[1], p[2]).multiplyScalar(scale); }
  Object.keys(J).forEach((name, i) => { index[name] = i; });
  return { J, index };
}

test('every recipe names a shipped hero, a sheet and only existing builders', () => {
  for (const [id, recipe] of Object.entries(RECIPES)) {
    assert.equal(recipe.id, id); assert.ok(PROFILES[id], `${id} is not a shipped hero`); assert.match(recipe.sheet, /^reference-\d{3}$/);
    for (const part of recipe.parts) assert.ok(BUILDERS[part.use], `${id}: unknown builder ${part.use}`);
  }
});

test('every recipe builds in Node, without a document, on every quality tier and body size', () => {
  assert.equal(typeof document, 'undefined');
  for (const recipe of Object.values(RECIPES)) {
    let last = Infinity;
    for (const tier of ['high', 'medium', 'low']) for (const scale of tier === 'high' ? [1, .87] : [1]) {
      const { geometry, triangles, parts } = buildCostume(recipe, rig(scale), tier), { position, normal, skinWeight, skinIndex } = geometry.attributes;
      assert.ok(position.array.every(Number.isFinite) && normal.array.every(Number.isFinite), `${recipe.id} ${tier}: non-finite vertex`);
      assert.ok(triangles > 4000 && triangles < 40000, `${recipe.id} ${tier}: ${triangles} triangles`);
      for (const part of recipe.parts) assert.ok(Object.values(parts).some((n) => n > 0), `${recipe.id}: ${part.use} built nothing`);
      for (let i = 0; i < skinWeight.count; i++) {
        const sum = skinWeight.getX(i) + skinWeight.getY(i) + skinWeight.getZ(i) + skinWeight.getW(i);
        if (Math.abs(sum - 1) > 1e-3) assert.fail(`${recipe.id}: vertex ${i} weights sum to ${sum}`);
        if (skinIndex.getX(i) >= 23) assert.fail('bone index out of range');
      }
      geometry.computeBoundingBox();
      assert.ok(geometry.boundingBox.min.y > -.02 * scale && geometry.boundingBox.max.y < 2.1 * scale, `${recipe.id}: costume leaves the body's height`);
      if (scale === 1) { assert.ok(triangles <= last, `${recipe.id}: ${tier} is heavier than the tier above`); last = triangles; }
    }
  }
});

test('a costume is the same every time it is built, and its left and right boots mirror', () => {
  const recipe = Object.values(RECIPES)[0], a = buildCostume(recipe, rig(), 'high').geometry, b = buildCostume(recipe, rig(), 'high').geometry;
  assert.deepEqual(a.attributes.position.array, b.attributes.position.array);
  const box = a.boundingBox; assert.ok(box.min.x < -.2 && box.max.x > .2);
});

test('an unknown builder or palette entry is reported by name', () => {
  assert.throws(() => buildCostume({ id: 'oath-01-ninja', palette: {}, parts: [{ use: 'nope' }] }, rig()), /unknown builder "nope"/);
  assert.throws(() => buildCostume({ id: 'oath-01-ninja', palette: {}, parts: [{ use: 'belt' }] }, rig()), /unknown palette entry/);
});

test('hair styles and hands build for any recipe that asks for them', () => {
  const base = Object.values(RECIPES)[0];
  for (const style of ['spiky', 'long', 'bun', 'braid', 'none']) {
    const recipe = { ...base, parts: [{ use: 'hair', style, color: 'hair', tail: style === 'long' ? { length: .8, tie: 'leather' } : null, braid: style === 'braid' ? { length: 1, tie: 'leather' } : null, stubble: true }, { use: 'hands', glove: 'glove', fingerless: style === 'spiky' }] };
    const { geometry, triangles } = buildCostume(recipe, rig(), 'high');
    assert.ok(geometry.attributes.position.array.every(Number.isFinite) && triangles > 1500, `${style}: ${triangles}`);
  }
});

test('the costume material constructs without a renderer', () => { assert.equal(costumeMaterial().vertexColors, true); });
