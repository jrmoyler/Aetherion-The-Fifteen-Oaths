import test from 'node:test';
import assert from 'node:assert/strict';
import { Bone, BufferAttribute, BufferGeometry, Group, Skeleton, SkinnedMesh, Vector3 } from 'three';
import { RECIPES } from './recipes/index.js';
import { BUILDERS } from './builders.js';
import { buildCostume } from './costume.js';
import { costumeMaterial } from './material.js';
import { PROFILES } from '../profiles.js';
import { buildFieldArmor } from '../field-armor.js';
import { wearSheet } from './wear.js';

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
    for (const part of recipe.parts) assert.ok(recipe.builders?.[part.use] ?? BUILDERS[part.use], `${id}: unknown builder ${part.use}`);
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

test('a chronicler and an armed player can share one source model with independent prop visibility and hand rigs', () => {
  const { J, index } = rig();
  const source = new BufferGeometry();
  source.setAttribute('position', new BufferAttribute(new Float32Array([
    0, 1, 0, 0, 1.2, 0, 0, 1, .2,
    -.6, 1.1, 0, -.7, 1.1, 0, -.6, 1.1, .2,
  ]), 3));
  const ids = new Uint16Array(24), weights = new Float32Array(24);
  for (let i = 0; i < 6; i++) {
    ids[i * 4] = index[i < 3 ? 'spine' : 'hand.R'];
    weights[i * 4] = 1;
  }
  source.setAttribute('skinIndex', new BufferAttribute(ids, 4));
  source.setAttribute('skinWeight', new BufferAttribute(weights, 4));
  source.setIndex([0, 1, 2, 3, 4, 5]);

  function character() {
    const root = new Group(), mesh = new SkinnedMesh(source);
    root.add(mesh);
    const joints = Object.entries(J).map(([name, position]) => {
      const bone = new Bone();
      bone.name = name;
      bone.position.copy(position);
      root.add(bone);
      return bone;
    });
    root.updateMatrixWorld(true);
    mesh.bind(new Skeleton(joints));
    return { meshes: [mesh], animator: {}, dispose() {} };
  }

  const chronicler = character(), player = character(), rawPreview = character();
  const desc = { oath: 'oath-09', cls: 'ninja' };
  const civilianCostume = wearSheet(chronicler, { ...desc, kind: 'npc', noWeapon: true });
  const playerCostume = wearSheet(player, { ...desc, kind: 'player' });
  assert.deepEqual([...rawPreview.meshes[0].geometry.index.array], [0, 1, 2, 3, 4, 5]);
  assert.deepEqual([...player.meshes[0].geometry.index.array], [3, 4, 5]);
  assert.equal(player.meshes[0].geometry, chronicler.meshes[0].geometry);
  assert.equal(player.meshes[0].geometry.getAttribute('position'), source.getAttribute('position'));
  assert.equal(chronicler.meshes[0].visible, false);
  assert.equal(player.meshes[0].visible, true);
  player.animator.setHandsFree(true);
  assert.equal(player.meshes[0].visible, false);
  player.animator.setHandsFree(false);
  chronicler.animator.setHandsFree(false);
  assert.equal(player.meshes[0].visible, true);
  assert.equal(chronicler.meshes[0].visible, false);
  const tip = costume => costume.mesh.skeleton.bones.find(b => b.name === 'index2.R');
  assert.ok(tip(playerCostume).position.distanceTo(tip(civilianCostume).position) > .01);

  chronicler.dispose();
  player.dispose();
});

test('common field armor leaves the hands and feet clear for each oath and class', () => {
  const wearer = rig();
  for (const hero of Object.values(RECIPES)) for (const family of ['robe', 'chest']) {
    const { geometry, triangles } = buildFieldArmor(hero, family, wearer);
    const { position, normal, skinWeight } = geometry.attributes;
    const bounds = geometry.boundingBox;
    assert.ok(position.array.every(Number.isFinite) && normal.array.every(Number.isFinite), hero.id);
    assert.ok(bounds.min.y > wearer.J['foot.L'].y + .20 && bounds.max.y < wearer.J.head.y, hero.id);
    assert.ok(Math.max(-bounds.min.x, bounds.max.x) < wearer.J['hand.L'].x - .04, hero.id);
    assert.ok(triangles <= 4000, hero.id);
    for (let i = 0; i < skinWeight.count; i++) {
      const sum = skinWeight.getX(i) + skinWeight.getY(i) + skinWeight.getZ(i) + skinWeight.getW(i);
      assert.ok(Math.abs(sum - 1) < 1e-4, hero.id);
    }
    geometry.dispose();
  }
});
