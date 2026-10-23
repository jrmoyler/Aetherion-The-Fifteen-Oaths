import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3, Group } from 'three';
import { OrbitCamera } from './camera.js';

function setup() {
  const ctx = { camera: new PerspectiveCamera(), quality: { drawDistance: 1500 }, scene: {}, input: { gameplayEnabled: true, state: { moveX: 0, moveY: 0 } }, params: new URLSearchParams(), world: { heightAt: () => -100 } };
  const camera = new OrbitCamera(ctx), root = new Group(); root.scaling = root.scale;
  const actor = { root, body: { height: 1.8 }, controller: { groundSpeed: 0 } };
  camera.follow(actor); camera.startIntro();
  return { ctx, camera, actor };
}

test('first movement cancels intro and returns control to player framing', () => {
  const { ctx, camera } = setup(); assert.ok(camera.intro);
  ctx.input.state.moveY = 1; camera.update(1 / 60);
  assert.equal(camera.intro, null); assert.ok(camera.cam.position.distanceTo(camera.pivot) < 7);
});

test('captured mouse look and zoom cannot change orbit', () => {
  const { ctx, camera } = setup(); camera.intro = null;
  ctx.input.gameplayEnabled = false; ctx.input.state.lookDX = 100; ctx.input.state.zoom = 1;
  camera.update(1 / 60); assert.equal(camera.yaw, 0); assert.equal(camera.dist, 6.2);
});

test('obstruction pulls camera in immediately and recovery is smooth', () => {
  const { ctx, camera } = setup(); camera.intro = null;
  ctx.collision = { blocked: () => true }; camera.update(1 / 60);
  const near = camera.curDist; assert.ok(near < camera.dist);
  ctx.collision.blocked = () => false; camera.update(1 / 60);
  assert.ok(camera.curDist > near); assert.ok(camera.curDist < camera.dist);
  assert.ok(camera.cam.position instanceof Vector3);
});
