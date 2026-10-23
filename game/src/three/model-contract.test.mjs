import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Group, Bone, Mesh, BoxGeometry, SkinnedMesh, Skeleton, BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute, MeshStandardMaterial, AnimationClip, NumberKeyframeTrack } from 'three';
registerHooks({ resolve(specifier, context, nextResolve) { if (specifier.startsWith('@shared/')) return nextResolve(new URL(`../../../shared/${specifier.slice(8)}`, import.meta.url).href, context); return nextResolve(specifier, context); } });
const { createModelBody } = await import('./models.js');
test('cloned characters isolate skeleton poses, action mixers and mutable materials', () => {
  const scene = new Group(), bone = new Bone(); bone.name = 'hips';
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute([0,0,0, 0,1.8,0, .4,1,0], 3));
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Array(12).fill(0),4)); geometry.setAttribute('skinWeight', new Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial()); mesh.add(bone); mesh.bind(new Skeleton([bone])); scene.add(mesh);
  const gltf = {scene, animations:[new AnimationClip('idle',1,[new NumberKeyframeTrack('hips.position[y]',[0,1],[0,.05])]),new AnimationClip('run',1,[new NumberKeyframeTrack('hips.rotation[x]',[0,1],[0,.3])])]};
  const parent = new Group(), a = createModelBody(gltf,parent), b = createModelBody(gltf,parent);
  assert.notEqual(a.meshes[0].skeleton,b.meshes[0].skeleton); assert.notEqual(a.meshes[0].material,b.meshes[0].material);
  a.animator.speed = 5; a.animator.update(.25); b.animator.update(.25);
  assert.notEqual(a.sockets.hips.rotation.x,b.sockets.hips.rotation.x);
  a.setFade(.3); assert.equal(b.meshes[0].material.opacity,1);
  a.dispose(); assert.equal(parent.children.length,1); b.animator.update(.1); b.dispose(); assert.equal(parent.children.length,0);
});
test('sanitized GLTF bone and socket names preserve the public attachment API', () => {
  const scene = new Group();
  for (const name of ['upperarmR', 'handL', 'sockethandR', 'sockethead']) { const n = new Bone(); n.name = name; scene.add(n); }
  const body = createModelBody({ scene, animations: [] }, new Group());
  assert.equal(body.sockets['upperarm.R'].name, 'upperarmR');
  assert.equal(body.sockets['hand.L'].name, 'handL');
  assert.equal(body.sockets['socket.hand.R'].name, 'sockethandR');
  assert.equal(body.sockets['socket.head'].name, 'sockethead');
  body.dispose();
});
test('animation LOD skips pose evaluation without dropping elapsed time', () => {
  const scene = new Group(), bone = new Bone(); bone.name = 'hips'; scene.add(bone);
  const gltf = { scene, animations: [new AnimationClip('idle', 2, [new NumberKeyframeTrack('hips.position[y]', [0, 2], [0, 2])])] };
  const body = createModelBody(gltf, new Group()), reference = createModelBody(gltf, new Group());
  body.animator.interval = 1 / 8;
  for (let i = 0; i < 7; i++) assert.equal(body.animator.update(1 / 60), false);
  assert.equal(body.sockets.hips.position.y, 0);
  assert.equal(body.animator.update(1 / 60), true);
  reference.animator.update(8 / 60);
  assert.ok(Math.abs(body.sockets.hips.position.y - reference.sockets.hips.position.y) < 1e-6);
  body.animator.update(1 / 60);
  body.animator.interval = 0;
  assert.equal(body.animator.update(1 / 60), true);
  reference.animator.update(2 / 60);
  assert.ok(Math.abs(body.sockets.hips.position.y - reference.sockets.hips.position.y) < 1e-6);
  assert.equal(body.animator.update(NaN), false);
  body.dispose(); reference.dispose();
});
test('multi-primitive authored characters retain their own costume and weapon', async () => {
  const { equipArmor } = await import('./actor-armor.js');
  const { attachWeapon } = await import('./actor-weapons.js');
  const head = new Bone(); head.name='head'; const spine = new Bone(); spine.name='spine2'; const hand=new Bone();
  const mesh=new SkinnedMesh(new BufferGeometry(),new MeshStandardMaterial());mesh.name='oath-01-sorcerer_1';
  const body={meshes:[mesh],sockets:{head,spine2:spine,'socket.hand.R':hand},dispose(){}};
  equipArmor(body,{oath:'oath-01',cls:'sorcerer'});attachWeapon(body,{oath:'oath-01',cls:'sorcerer'});
  assert.equal(spine.children.length,0);assert.equal(hand.children.length,0);
  mesh.geometry.dispose();mesh.material.dispose();
});

function animatedFixture() {
  const scene = new Group(), bone = new Bone(); bone.name = 'hips'; scene.add(bone);
  const clip = (name, duration, start, end) => new AnimationClip(name, duration, [new NumberKeyframeTrack('hips.position[y]', [0, duration], [start, end])]);
  return createModelBody({ scene, animations: [clip('idle', 2, 0, 0), clip('attack_1', 1.2, 0, 12), clip('death', .8, 0, -8), clip('land', .4, -2, 0)] }, new Group());
}

test('same authored attack replays immediately without fading itself out', () => {
  const body = animatedFixture();
  body.animator.playAnim('attack_1', { blend: 0 }); body.animator.update(.5);
  assert.ok(Math.abs(body.sockets.hips.position.y - 5) < 1e-5);
  body.animator.playAnim('attack_1', { blend: 0 }); body.animator.update(.1);
  assert.ok(Math.abs(body.sockets.hips.position.y - 1) < 1e-5);
  body.dispose();
});

test('action lifetime respects clip duration and speed instead of cutting at .65 seconds', () => {
  const body = animatedFixture();
  body.animator.playAnim('attack_1', { blend: 0 }); body.animator.update(.8);
  assert.equal(body.animator.action, 'attack_1');
  assert.ok(Math.abs(body.sockets.hips.position.y - 8) < 1e-5);
  body.animator.playAnim('attack_1', { speed: 2, blend: 0 }); body.animator.update(.3);
  assert.ok(Math.abs(body.sockets.hips.position.y - 6) < 1e-5);
  body.animator.update(.31); assert.equal(body.animator.action, null);
  body.dispose();
});

test('death interrupts actions, clamps its final pose and blocks late hit callbacks until respawn', () => {
  const body = animatedFixture();
  body.animator.playAnim('attack_1'); body.animator.update(.2);
  body.animator.setState('dead'); body.animator.update(1);
  assert.ok(Math.abs(body.sockets.hips.position.y + 8) < 1e-5);
  body.animator.playAnim('attack_1'); body.animator.update(1);
  assert.ok(Math.abs(body.sockets.hips.position.y + 8) < 1e-5);
  body.animator.setState('loco'); body.animator.update(.3);
  assert.equal(body.sockets.hips.position.y, 0);
  body.dispose();
});

test('landing pose persists for the authored clip instead of a single rendered frame', () => {
  const body = animatedFixture();
  body.animator.setState('land'); body.animator.update(.2);
  body.animator.setState('loco'); // grounded controller requests locomotion each frame
  assert.equal(body.animator.state, 'land');
  body.animator.update(.21); assert.equal(body.animator.state, 'loco');
  body.dispose();
});

test('spawn fade restores authored translucent materials and depth-write intent', () => {
  const scene = new Group();
  const material = new MeshStandardMaterial({ transparent: true, opacity: .55, depthWrite: false });
  const mesh = new Mesh(new BoxGeometry(1, 2, 1), material); scene.add(mesh);
  const body = createModelBody({ scene, animations: [] }, new Group());
  body.setFade(.5); assert.equal(body.meshes[0].material.opacity, .275);
  body.setFade(1); assert.equal(body.meshes[0].material.opacity, .55);
  assert.equal(body.meshes[0].material.transparent, true);
  assert.equal(body.meshes[0].material.depthWrite, false);
  body.dispose();
});
