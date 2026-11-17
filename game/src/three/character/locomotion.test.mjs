import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { AnimationMixer, Box3, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GAIT_SPEED, groundClip, setTravelDirection } from './locomotion.js';
import { waterClips } from './water-motion.js';

registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('@shared/')) return next(new URL('../../../../shared/' + specifier.slice(8), import.meta.url).href, context);
  return next(specifier, context);
} });
const { PlayerController } = await import('../../actors/controller.js');
const { heightAt, waterLevelAt, normalAt } = await import('@shared/terrain.js');

function surfaceOffsets(height) {
  return [[-929.911924, -359.768403], [-105.9454, 1122.3418]].map(([x, z]) => {
    const position = new Vector3(x, heightAt(x, z), z);
    const actor = { root: { position, rotation: { y: 0 } }, cls: 'ninja', alive: true,
      body: { height, animator: { setState() {}, yawVel: 0 } } };
    const controller = new PlayerController({ world: { heightAt, waterLevelAt, normalAt },
      input: { state: {}, consume: () => false } }, actor, () => 0);
    for (let i = 0; i < 120; i++) controller.update(1 / 30);
    assert.equal(controller.swimming, true);
    return position.y - waterLevelAt(x, z);
  });
}

test('lateral and reverse steps follow actual travel in character space', () => {
  const animator = { speed: 5 }, actions = new Set(Object.keys(GAIT_SPEED));
  for (const yaw of [0, .75, -1.2, Math.PI]) {
    setTravelDirection(animator, Math.cos(yaw), -Math.sin(yaw), yaw);
    assert.equal(groundClip(animator, actions), 'strafe_l');
    setTravelDirection(animator, -Math.cos(yaw), Math.sin(yaw), yaw);
    assert.equal(groundClip(animator, actions), 'strafe_r');
    setTravelDirection(animator, -Math.sin(yaw), -Math.cos(yaw), yaw);
    assert.equal(groundClip(animator, actions), 'backpedal');
    setTravelDirection(animator, Math.sin(yaw), Math.cos(yaw), yaw);
    assert.equal(groundClip(animator, actions), 'run');
  }
  setTravelDirection(animator, 0, 0, 0);
  assert.equal(animator.lateral, 0);
  assert.equal(animator.backwards, false);
  // A quadruped without strafe clips keeps its available forward gait.
  animator.lateral = 1;
  assert.equal(groundClip(animator, new Set(['run'])), 'run');
});

test('both water cycles close cleanly and bind to every shipped playable rig', async () => {
  globalThis.self ??= globalThis;
  globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
  const dir = new URL('../../../public/assets/characters/', import.meta.url);
  // The manifest owns the roster. A future rig with new bone names must supply
  // equivalent native clips or explicitly support the runtime authoring path.
  const manifest = JSON.parse(await readFile(new URL('manifest.json', dir), 'utf8'));
  for (const { file } of manifest) {
    const bytes = await readFile(new URL(file, dir));
    const { scene, animations } = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const height = new Box3().setFromObject(scene).getSize(new Vector3()).y;
    const offsets = surfaceOffsets(height);
    const authored = waterClips(scene, height);
    assert.equal(waterClips(scene), authored);
    for (const name of ['swim', 'tread_water']) {
      const clip = [...animations, ...authored].find(c => c.name === name);
      assert.ok(clip, file + ' ' + name);
      const mixer = new AnimationMixer(scene);
      mixer.clipAction(clip).play();
      const skull = scene.getObjectByName('sockethead'), position = new Vector3();
      for (let frame = 0; frame < 32; frame++) {
        mixer.setTime(clip.duration * frame / 32);
        const y = skull.getWorldPosition(position).y;
        for (const offset of offsets) {
          const clearance = y + offset;
          assert.ok(clearance > .1 && clearance < .4, file + ' ' + name + ' head clearance ' + clearance);
        }
      }
      mixer.stopAllAction();
      for (const track of clip.tracks.filter(t => t.name.endsWith('.quaternion'))) {
        assert.ok(scene.getObjectByName(track.name.split('.')[0]), track.name);
        const values = track.values;
        const first = new Quaternion().fromArray(values);
        const last = new Quaternion().fromArray(values, values.length - 4);
        assert.ok(first.angleTo(last) < .002, file + ' ' + name + ' loop seam');
        const previous = first.clone(), next = new Quaternion();
        for (let i = 4; i < values.length; i += 4) {
          next.fromArray(values, i);
          assert.ok(Math.abs(next.length() - 1) < .001);
          assert.ok(previous.angleTo(next) < 1, file + ' ' + track.name + ' rotation jump');
          previous.copy(next);
        }
      }
    }
  }
});
