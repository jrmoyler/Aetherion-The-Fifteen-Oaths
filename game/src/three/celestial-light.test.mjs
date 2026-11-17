import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectionalLight, Vector3 } from 'three';
import { createShadowTracker, updateCelestialKey } from './celestial-light.js';

test('noon and midnight have distinct keys aligned to the visible celestial bodies', () => {
  const light = new DirectionalLight(), offset = new Vector3();
  const direction = new Vector3(.4, .8, .2).normalize();
  updateCelestialKey(light, offset, direction, 0);
  const sunny = light.intensity;
  assert.ok(offset.clone().normalize().distanceTo(direction) < 1e-8);
  updateCelestialKey(light, offset, direction.negate(), 0);
  const moon = new Vector3(-direction.x, Math.max(.35, -direction.y), -direction.z).normalize();
  assert.ok(offset.clone().normalize().distanceTo(moon) < 1e-8);
  assert.ok(light.intensity > 0 && light.intensity < sunny);
  assert.ok(light.color.b > light.color.r);
  const clearNight = light.intensity;
  updateCelestialKey(light, offset, direction, 1);
  assert.ok(light.intensity < clearNight);
  for (const elevation of [-1e-5, 0, 1e-5]) {
    updateCelestialKey(light, offset, new Vector3(1, elevation, 0).normalize(), 0);
    assert.ok(light.intensity < .0001);
  }
});

test('subtexel tracking keeps a fixed world point on the same shadow pixel', () => {
  const light = new DirectionalLight(), focus = new Vector3();
  light.castShadow = true;
  const offset = new Vector3(3, 4, 0).normalize().multiplyScalar(180);
  const tracker = createShadowTracker(light);
  const { camera, mapSize } = light.shadow;
  const texel = (camera.right - camera.left) / mapSize.x;
  const sample = new Vector3(4, 1, 3);
  function projectedX() {
    tracker(focus, offset);
    light.updateMatrixWorld();
    light.shadow.updateMatrices(light);
    return sample.clone().project(camera).x * mapSize.x / 2;
  }
  const start = projectedX();
  focus.z += texel * .2;
  assert.ok(Math.abs(projectedX() - start) < 1e-8);
  focus.z += texel;
  assert.ok(Math.abs(Math.abs(projectedX() - start) - 1) < 1e-8);
  assert.ok(light.position.clone().sub(light.target.position).distanceTo(offset) < 1e-8);
});

test('vertical lights remain finite and shadowless tiers track the focus exactly', () => {
  const light = new DirectionalLight(), focus = new Vector3(8.37, 13.58, -4.22);
  const offset = new Vector3(0, 180, 0);
  const tracker = createShadowTracker(light);
  light.castShadow = true;
  tracker(focus, offset);
  assert.ok(light.target.position.toArray().every(Number.isFinite));
  light.castShadow = false;
  tracker(focus, offset);
  assert.ok(light.target.position.equals(focus));
});
