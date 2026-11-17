import test from 'node:test';
import assert from 'node:assert/strict';
import { Bone, BufferAttribute, BufferGeometry, Group, Matrix4, Skeleton, SkinnedMesh, Vector3 } from 'three';
import { bindDigits, registerDigits } from './digits.js';
import { heldWeaponIndices } from './weapon-islands.js';

function actor() {
  const mesh = new SkinnedMesh();
  const bones = ['hand.L', 'hand.R'].map((name, i) => {
    const bone = new Bone(); bone.name = name;
    bone.position.set(i ? -.55 : .55, 1.03, .04);
    bone.rotation.z = i ? -.4 : .4;
    mesh.add(bone); return bone;
  });
  mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton(bones));
  return mesh;
}

test('finger skin matrices preserve bind space, mirror flexion and stay independent at distant spawns', () => {
  const mesh = actor(), other = actor();
  const rig = { mesh, index: { 'hand.L': 0, 'hand.R': 1 } };
  const digits = registerDigits(rig);
  for (const side of ['L', 'R']) for (let j = 0; j < 3; j++) {
    rig.digit(side, 'index', j, new Vector3(.55, .98 - j * .023, .04), new Vector3(.4, 0, .92).normalize(), false);
  }
  const parent = new Group();
  parent.position.set(143, 31, -278); parent.rotation.y = .85;
  parent.add(mesh);
  parent.updateMatrixWorld(true);
  const first = bindDigits(mesh, digits), second = bindDigits(other, digits);
  const localTip = side => new Vector3(side === 'L' ? .55 : -.55, .91, .04);
  function deform(side) {
    parent.updateMatrixWorld(true);
    const index = rig.index[`index2.${side}`];
    const matrix = new Matrix4().multiplyMatrices(first.skeleton.bones[index].matrixWorld, first.skeleton.boneInverses[index]);
    return parent.worldToLocal(localTip(side).applyMatrix4(matrix));
  }
  for (const s of ['L', 'R']) assert.ok(deform(s).distanceTo(localTip(s)) < 1e-10);
  const untouched = second.skeleton.bones.map(b => b.quaternion.toArray());
  first.pose(.33, 'attack_1');
  const left = deform('L'), right = deform('R');
  assert.ok(left.distanceTo(localTip('L')) > .018);
  assert.ok(left.distanceTo(right.multiply(new Vector3(-1, 1, 1))) < 1e-10);
  assert.deepEqual(second.skeleton.bones.map(b => b.quaternion.toArray()), untouched);
  first.pose(2, 'idle');
  assert.ok(deform('L').distanceTo(localTip('L')) < 1e-8);
  first.dispose(); second.dispose();
  assert.equal(mesh.skeleton.bones[0].children.length, 0);
});

test('complete props survive skinning across seams while body and hand geometry is removed', () => {
  const geo = new BufferGeometry();
  // Two triangles of the body share a split seam at (0,0,0). One is entirely hand weighted.
  geo.setAttribute('position', new BufferAttribute(new Float32Array([
    0,0,0, 0,.1,0, .1,0,0, 0,0,0, 0,-.1,0, -.1,0,0,
    .01,0,0, .011,0,0, .02,0,.41, .2,.5,0, .3,.6,0, .41,.4,0,
  ]), 3));
  const index = new Uint16Array(48), weights = new Float32Array(48);
  for (let i = 0; i < 12; i++) {
    index[i * 4] = i === 4 ? 0 : i >= 9 ? 2 : 1;
    weights[i * 4] = 1;
  }
  geo.setAttribute('skinIndex', new BufferAttribute(index, 4));
  geo.setAttribute('skinWeight', new BufferAttribute(weights, 4));
  geo.setIndex([0,1,2,3,4,5,6,7,8,9,10,11]);
  const bones = ['spine', 'hand.R', 'forearm.L'];
  assert.deepEqual([...heldWeaponIndices(geo, bones)], [6,7,8]);
  assert.deepEqual([...heldWeaponIndices(geo, bones, 'forearm.L')], [6,7,8,9,10,11]);
});
