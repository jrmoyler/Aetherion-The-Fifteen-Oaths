import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(id, context, next) {
  return next(id.startsWith('@shared/') ? new URL('../shared/' + id.slice(8), import.meta.url).href : id, context);
} });
const { CollisionWorld } = await import('../game/src/core/collision.js');
const { PlayerController, TUNING } = await import('../game/src/actors/controller.js');
const near = (actual, expected) => assert.ok(Math.abs(actual-expected) < 1e-6, `${actual} vs ${expected}`);

test('capsule contacts cross a spatial cell edge and clear the exact center of a cylinder', () => {
  const world = new CollisionWorld();
  world.addCircle(16.5, 8, 0.45, 0, 3);
  near(world.resolve({ x: 15.9, z: 8, y: 0 }, 0.4).x, 15.65);
  const center = world.resolve({ x: 16.5, z: 8, y: 0 }, 0.4);
  near(Math.hypot(center.x - 16.5, center.z - 8), 0.85);
});

test('box corners resolve radially and embedded centers escape', () => {
  const world = new CollisionWorld();
  world.addBox(0, 0, 1, 1, 0, 0, 3);
  const corner = world.resolve({ x: 1.2, z: 1.2, y: 0 }, 0.4);
  near(corner.x, 1 + 0.4 / Math.sqrt(2)); near(corner.x, corner.z);
  const center = world.resolve({ x: 0, z: 0, y: 0 }, 0.4);
  near(Math.max(Math.abs(center.x), Math.abs(center.z)), 1.4);
});

test('camera sweep clips by height, padding, sloped ramp tops, and thin rotated walls', () => {
  const world = new CollisionWorld();
  world.addBox(0, 0, 0.02, 2, Math.PI/4, 0, 2);
  assert.equal(world.blocked(-0.3, 0, 0.3, 0, 1), true);
  assert.equal(world.segmentHit(-1, 3, 0, 1, 3, 0), 1);
  const circle = world.addCircle(0, 5, 1, 2, 4);
  near(world.segmentHit(-4, 3, circle.cz, 4, 3, circle.cz, 0.2), 0.35);
  near(world.segmentHit(0, 8, circle.cz, 0, 0, circle.cz), 0.5);
  world.addRamp(10, 0, 2, 2, 0, 0, 4);
  near(world.segmentHit(10, 2, -3, 10, 2, 3), 0.5);
  assert.equal(world.segmentHit(10, 3, -3, 10, 3, 0), 1);
});

function player(collision, yaw = 0) {
  const position = { x: 0, y: 0, z: 0, set(x,y,z) { Object.assign(this, {x,y,z}); } };
  const events = [];
  const state = { moveX: 0, moveY: 0, jump: false };
  const actions = new Set();
  if (collision) collision.groundAt = () => 0;
  const controller = new PlayerController({
    collision, input: { state, consume: key => actions.delete(key) },
    world: { heightAt: () => 0, normalAt: () => ({x:0,y:1,z:0}) },
    bus: { emit: type => events.push(type) }
  }, { cls: 'ninja', root: { isObject3D: true, position, rotation: { y: 0 } } }, () => yaw);
  return { controller, position, state, actions, events };
}

test('a low-frame-rate dodge stops against a thin wall', () => {
  const world = new CollisionWorld();
  world.addBox(0, 0.72, 3, 0.01, 0, 0, 3);
  const { controller, position, actions } = player(world);
  actions.add('dodge');
  controller.update(0.1);
  near(position.z, 0.72 - 0.01 - TUNING.radius);
});

test('jump height agrees across frame rates and a ceiling arrests a rising jump', () => {
  const heights = [30,60,120].map(rate => {
    const { controller, position, actions } = player();
    actions.add('jump');
    for (let i=0;i<rate/6;i++) controller.update(1/rate);
    return position.y;
  });
  near(heights[0], heights[1]); near(heights[1], heights[2]);
  const world = new CollisionWorld();
  world.addBox(0, 0, 4, 4, 0, 2, 2.4, {walkable:true});
  const { controller, position, actions } = player(world);
  actions.add('jump');
  let highest = 0;
  for (let i=0;i<60;i++) { controller.update(1/60); highest = Math.max(highest,position.y); }
  near(highest, 2 - 1.8*0.95); near(position.y,0); near(position.x,0); near(position.z,0);
});

test('teleport cancels buffered jumps, swimming, and coyote time on an airborne arrival', () => {
  const { controller, actions, events } = player();
  controller.swimming = true; controller.jumpReq = 0; controller.airT = 1;
  controller.teleport(3, 5, 3, 0);
  actions.add('jump'); controller.update(1/60);
  assert.equal(controller.grounded, false); assert.equal(controller.swimming, false);
  assert.equal(events.includes('player:jump'), false);
});

test('right input projects to screen right at cardinal and oblique camera angles', () => {
  for (const yaw of [0, Math.PI/2, -Math.PI/3, Math.PI]) {
    const { controller, position, state } = player(null, yaw);
    state.moveX = 1;
    controller.update(1/30);
    const forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const screenX = -forward.z * position.x + forward.x * position.z;
    const screenDepth = forward.x * position.x + forward.z * position.z;
    assert.ok(screenX > 0);
    near(screenDepth, 0);
  }
});
