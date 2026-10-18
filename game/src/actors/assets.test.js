import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Animation } from '@babylonjs/core/Animations/animation.js';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup.js';
import { AssetContainer } from '@babylonjs/core/assetContainer.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { AssetLibrary, GltfAnimator, instantiateGltf } from './assets.js';

function fixture() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const node = new TransformNode('spine1', scene);
  const groups = new Map();
  for (const name of ['idle', 'walk', 'run', 'death', 'land', 'cast_channel', 'cast_release', 'jump_start', 'jump_loop']) {
    const anim = new Animation(name, 'position.y', 60, Animation.ANIMATIONTYPE_FLOAT);
    anim.setKeys([{ frame: 0, value: 0 }, { frame: 60, value: name === 'death' ? -1 : 1 }]);
    const group = new AnimationGroup(name, scene); group.addTargetedAnimation(anim, node); groups.set(name, group);
  }
  return { engine, scene, groups, animator: new GltfAnimator({ groups }), dispose() { scene.dispose(); engine.dispose(); } };
}

test('GLB death remains at final pose until revived and cancels casting', () => {
  const f = fixture(), a = f.animator, death = f.groups.get('death');
  a.playAnim('cast_channel'); a.playAnim('cast_release'); a.setState('dead'); a.update(0.1);
  assert.equal(a.channel, false); assert.equal(a.action, null);
  death.stop(); // engine completion of the non-looping clip
  a.update(0.1);
  assert.equal(death.isPlaying, false);
  assert.equal(death.animatables[0].masterFrame, death.to);
  const animation = death.animatables[0];
  for (let i = 0; i < 20; i++) a.update(0.1);
  assert.equal(death.animatables[0], animation, 'corpse pose must not repeatedly restart animatables');
  a.setState('loco'); a.update(0.1); a.setState('dead'); a.update(0.1);
  assert.equal(death.isPlaying, true, 'second death starts a new death clip');
  f.dispose();
});

test('landing timer resets on entry; repeated state drive does not reset it', () => {
  const f = fixture(), a = f.animator;
  a.update(5); a.setState('land'); a.update(0.1); a.setState('land'); a.update(0.1);
  assert.equal(a.state, 'land'); a.update(0.11); assert.equal(a.state, 'loco'); f.dispose();
});

test('cast release clears channel and jump transitions from takeoff into loop', () => {
  const f = fixture(), a = f.animator;
  a.playAnim('cast_channel'); a.playAnim('cast_release'); assert.equal(a.channel, false);
  a.action = null; a.setState('jump'); a.update(0.05);
  assert.equal(a.target.get(f.groups.get('jump_start')), 1);
  a.update(0.2); assert.equal(a.target.get(f.groups.get('jump_loop')), 1); f.dispose();
});

test('despawning one imported actor preserves materials for the other actor and template', () => {
  const f = fixture();
  const container = new AssetContainer(f.scene);
  const mesh = MeshBuilder.CreateBox('body', {}, f.scene);
  const material = new StandardMaterial('body', f.scene); mesh.material = material;
  container.meshes.push(mesh); container.materials.push(material); container.rootNodes.push(mesh);
  container.removeAllFromScene();
  const first = instantiateGltf(f.scene, container, new TransformNode('first', f.scene));
  const second = instantiateGltf(f.scene, container, new TransformNode('second', f.scene));
  let disposed = false; material.onDisposeObservable.add(() => { disposed = true; });
  first.dispose();
  assert.equal(disposed, false); assert.equal(second.meshes[0].material, material);
  second.dispose(); container.dispose(); assert.equal(disposed, true); f.dispose();
});

test('asset URL bases are per library and offline probes use GET', async () => {
  const f = fixture();
  const a = new AssetLibrary({ scene: f.scene, assetBase: '/one/' });
  const b = new AssetLibrary({ scene: f.scene, assetBase: '/two/' });
  assert.equal(a.charDir, '/one/characters/'); assert.equal(b.charDir, '/two/characters/');
  const fetchBefore = globalThis.fetch; let options;
  globalThis.fetch = async (_url, opts) => { options = opts; return new Response(new Uint8Array([1]), { headers: { 'content-type': 'model/gltf-binary' } }); };
  try { assert.equal(await a.probe('/cached.glb'), true); assert.equal(options.method ?? 'GET', 'GET'); }
  finally { globalThis.fetch = fetchBefore; a.dispose(); b.dispose(); f.dispose(); }
  assert.equal(a.abort.signal.aborted, true); assert.equal(await a.load('/unused.glb'), null);
});


test('regional creature is usable without a generic file or manifest', async () => {
  const f = fixture();
  const library = new AssetLibrary({ scene: f.scene });
  library._firstPollDone();
  library.probe = async (url) => url.endsWith('hound-oath-04.glb');
  assert.equal(await library.creatureUrl('hound', 'oath-04'), './assets/creatures/hound-oath-04.glb');
  library.dispose(); f.dispose();
});
