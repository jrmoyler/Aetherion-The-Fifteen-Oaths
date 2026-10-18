import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Group, Bone, SkinnedMesh, Skeleton, BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute, MeshStandardMaterial, AnimationClip, NumberKeyframeTrack } from 'three';
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
