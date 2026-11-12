import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { RECIPES } from './recipes/index.js';
import { buildCostume } from './costume.js';
import { costumeDepthMaterial, costumeMaterial } from './material.js';
import { depthInLegs, settle, MOTION_VERTEX } from './clearance.js';

const JOINTS = { hips: [0, .9978, -.0099], spine: [0, 1.097, -.0049], spine1: [0, 1.221, -.0099], spine2: [0, 1.345, -.0198], neck: [0, 1.4938, -.0247], head: [0, 1.5779, 0],
  'shoulder.L': [.0241, 1.4592, .0049], 'upperarm.L': [.1819, 1.4493, -.0198], 'forearm.L': [.3809, 1.236, -.0256], 'hand.L': [.5306, 1.0393, .0238],
  'thigh.L': [.0868, .9435, -.0049], 'shin.L': [.0947, .5232, .0119], 'foot.L': [.0986, .1128, -.0178], 'toe.L': [.1085, .0505, .1137] };
function rig() {
  const J = {}, index = {};
  for (const [name, p] of Object.entries(JOINTS)) { J[name] = new Vector3(...p); if (name.endsWith('.L')) J[name.replace('.L', '.R')] = new Vector3(-p[0], p[1], p[2]); }
  Object.keys(J).forEach((name, i) => { index[name] = i; });
  return { J, index };
}
const about = (pivot, axis, angle) => new Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z).multiply(new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromAxisAngle(axis, angle))).multiply(new Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
/** A stride: left thigh swung forward with the knee bent, right thigh back with the shin kicked up. */
function stride(R) {
  const X = new Vector3(1, 0, 0), M = {}; for (const name of Object.keys(R.index)) M[name] = new Matrix4();
  M['thigh.L'] = about(R.J['thigh.L'], X, -1.0); M['shin.L'] = M['thigh.L'].clone().multiply(about(R.J['shin.L'], X, 1.1)); M['foot.L'] = M['shin.L']; M['toe.L'] = M['shin.L'];
  M['thigh.R'] = about(R.J['thigh.R'], X, .5); M['shin.R'] = M['thigh.R'].clone().multiply(about(R.J['shin.R'], X, 1.3)); M['foot.R'] = M['shin.R']; M['toe.R'] = M['shin.R'];
  return Object.keys(R.index).map((name) => M[name]);
}
function pose(geometry, mats, each) {
  const { position, skinIndex, skinWeight, hg, sv } = geometry.attributes, motion = geometry.userData.motion, blend = new Matrix4(), p = new Vector3(), q = new Vector3();
  const posed = motion.bones.map((b, i) => new Vector3(motion.joints[i * 3], motion.joints[i * 3 + 1], motion.joints[i * 3 + 2]).applyMatrix4(mats[b]));
  for (let i = 0; i < position.count; i++) {
    blend.elements.fill(0); for (let k = 0; k < 4; k++) { const w = skinWeight.getComponent(i, k); if (w) { const E = mats[skinIndex.getComponent(i, k)].elements; for (let x = 0; x < 16; x++) blend.elements[x] += E[x] * w; } }
    p.fromBufferAttribute(position, i).applyMatrix4(blend); q.copy(p);
    settle(p, blend, posed, hg.array.subarray(i * 4, i * 4 + 4), sv.array.subarray(i * 3, i * 3 + 3), motion);
    each(i, q, p, posed, motion);
  }
}

test('hanging cloth keeps off the legs in a stride and does not move in the bind pose', () => {
  let heroesWithCloth = 0;
  for (const recipe of Object.values(RECIPES)) {
    const R = rig(), { geometry, hanging } = buildCostume(recipe, R, 'medium'), { hg, sv } = geometry.attributes;
    assert.ok(hg && sv && geometry.userData.motion.radii.every((r) => r > .02 && r < .3), `${recipe.id}: motion data`);
    if (!hanging) continue; heroesWithCloth++;
    // Bind pose: nothing may move (so the idle look is exactly what the recipe built).
    let moved = 0; pose(geometry, Object.keys(R.index).map(() => new Matrix4()), (i, before, after) => { if (Math.hypot(hg.getX(i), hg.getZ(i)) > 0) moved = Math.max(moved, before.distanceTo(after)); });
    assert.ok(moved < 1e-4, `${recipe.id}: hanging cloth moved ${moved} m in the bind pose`);
    // Stride: cloth that hangs free and was clear of the legs when built stays out of them.
    let inside = 0, was = 0, free = 0;
    pose(geometry, stride(R), (i, before, after, posed, motion) => {
      if (Math.hypot(hg.getX(i), hg.getZ(i)) < .95 || hg.getW(i) < 0) return; free++;
      if (depthInLegs(before, posed, motion) > .02) was++; if (depthInLegs(after, posed, motion) > .02) inside++;
      assert.ok(Number.isFinite(after.x + after.y + after.z));
    });
    assert.ok(inside <= free * .02 && inside <= was * .25, `${recipe.id}: ${inside} of ${free} hanging vertices still inside a leg (${was} before the pass)`);
  }
  assert.ok(heroesWithCloth >= 12, `only ${heroesWithCloth} heroes have hanging cloth`);
});

test('loose sleeves hang toward the ground when the arm is raised; fitted ones are untouched', () => {
  const R = rig(), X = new Vector3(0, 0, 1), up = Object.keys(R.index).map((name) => (/^(upperarm|forearm|hand)\.L$/.test(name) ? about(R.J['upperarm.L'], X, 1.9) : new Matrix4()));
  const loose = buildCostume(RECIPES['oath-11-sorcerer'], R, 'medium'), fitted = buildCostume(RECIPES['oath-04-ninja'], R, 'medium');
  assert.ok(loose.loose > 50, `bell sleeves were not recognised (${loose.loose})`); assert.equal(fitted.loose, 0);
  let lowered = 0, raised = 0;
  pose(loose.geometry, up, (i, before, after) => { const s = loose.geometry.attributes.sv; if (Math.hypot(s.getX(i), s.getY(i), s.getZ(i)) < .02 || before.x < 0) return; if (after.y < before.y - .005) lowered++; else if (after.y > before.y + .005) raised++; });
  assert.ok(lowered > raised * 3 && lowered > 10, `sleeve mouth: ${lowered} lowered, ${raised} raised`);
});

test('the motion pass compiles into both materials and stays in step with its JS twin', () => {
  for (const make of [costumeMaterial, costumeDepthMaterial]) {
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n#include <skinning_vertex>\n', fragmentShader: '#include <common>\n#include <metalnessmap_fragment>\n#include <normal_fragment_maps>\n#include <emissivemap_fragment>\n' };
    make({ joints: new Array(18).fill(0), bones: [1, 2, 3, 4, 5, 6], radii: [.1, .07, .05] }).onBeforeCompile(shader);
    assert.ok(shader.vertexShader.includes('csJoint') && shader.vertexShader.indexOf('csHang') > shader.vertexShader.indexOf('#include <skinning_vertex>'));
    assert.deepEqual(shader.uniforms.csBone.value, [1, 2, 3, 4, 5, 6]); assert.equal(shader.uniforms.csJoint.value.length, 6);
  }
  assert.equal((MOTION_VERTEX.match(/it < 3/g) ?? []).length, 1);
});

test('fold weights reach cloth and soft leather only: skin, hair, metal and stone stay smooth', () => {
  let cloth = 0;
  for (const recipe of Object.values(RECIPES)) {
    const { geometry } = buildCostume(recipe, rig(), 'low'), { sm, ff, fd } = geometry.attributes;
    assert.ok(ff && fd && ff.array.every(Number.isFinite) && fd.array.every(Number.isFinite), `${recipe.id}: fold attributes`);
    for (let i = 0; i < sm.count; i++) { const kind = sm.getZ(i), on = ff.getX(i) + ff.getY(i) > 0; if (kind !== 0 && kind !== 2) assert.ok(!on, `${recipe.id}: folds on surface kind ${kind}`); else if (on) cloth++; assert.ok(ff.getX(i) <= 1.21 && ff.getY(i) <= 1.21); }
  }
  assert.ok(cloth > 50000, `only ${cloth} cloth vertices carry folds`);
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n#include <skinning_vertex>\n', fragmentShader: '#include <common>\n#include <metalnessmap_fragment>\n#include <normal_fragment_maps>\n#include <emissivemap_fragment>\n' };
  costumeMaterial().onBeforeCompile(shader);
  assert.ok(shader.vertexShader.includes('vFd = fd') && shader.fragmentShader.includes('vFf.x * ring'));
});
