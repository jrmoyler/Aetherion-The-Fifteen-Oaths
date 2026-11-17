import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { addContactShadow } from './contactShadow.js';

test('contact shadow remains on the inclined receiver during a jump and fades with altitude', () => {
  const scene = new Group(), root = new Group();
  scene.add(root); root.scale.setScalar(2);
  const actor = { root, visible: true };
  const shadow = addContactShadow(actor), { mesh } = shadow;
  const floor = (x, z) => 5 + .25 * x - .1 * z;
  const dry = () => 0;
  root.position.set(2, floor(2, 4), 4);
  shadow.update(floor, dry, 0);
  assert.equal(mesh.visible, true); assert.equal(mesh.parent, scene);
  assert.ok(new Vector3(0, 1, 0).applyQuaternion(mesh.quaternion)
    .distanceTo(new Vector3(-.25, 1, .1).normalize()) < 1e-8);
  const baseline = mesh.material.uniforms.opacity.value;
  const groundY = mesh.position.y;
  root.position.y += 2;
  shadow.update(floor, dry, .02);
  assert.equal(mesh.position.y, groundY);
  assert.ok(mesh.material.uniforms.opacity.value > 0 && mesh.material.uniforms.opacity.value < baseline);
  root.position.y += 4;
  shadow.update(floor, dry, .04);
  assert.equal(mesh.visible, false);
  shadow.dispose(); assert.equal(mesh.parent, null);
});

test('shadow chooses an accessible platform above water and skips culled actors and idle queries', () => {
  const scene = new Group(), root = new Group(); scene.add(root);
  const actor = { root, visible: true };
  const shadow = addContactShadow(actor);
  let calls = 0;
  const platform = (x, z, y, tolerance) => { calls++; return y + tolerance >= 3 ? 3 : -1; };
  const water = () => 0;
  root.position.y = 1; shadow.update(platform, water, 0);
  assert.equal(shadow.mesh.visible, false);
  root.position.y = 3; shadow.update(platform, water, .02);
  assert.equal(shadow.mesh.position.y, 3.03); assert.equal(shadow.mesh.visible, true);
  const afterLanding = calls;
  shadow.update(platform, water, .03);
  assert.equal(calls, afterLanding);
  actor.visible = false; root.position.x = 10; shadow.update(platform, water, 1);
  assert.equal(calls, afterLanding); assert.equal(shadow.mesh.visible, false);
  shadow.dispose();
});
