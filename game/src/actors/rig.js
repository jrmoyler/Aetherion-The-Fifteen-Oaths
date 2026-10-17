// Skeleton layouts + per-instance rigs. Each bone is a TransformNode (named per the rig
// contract) linked to a Babylon Bone, so procedural animation writes node rotations and
// GLB/procedural bodies expose identical sockets.
import { Skeleton } from '@babylonjs/core/Bones/skeleton.js';
import { Bone } from '@babylonjs/core/Bones/bone.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';

/** Humanoid bone order (indices are baked into geometry). */
export const HB = {
  root: 0, hips: 1, spine: 2, spine1: 3, spine2: 4, neck: 5, head: 6,
  shL: 7, uaL: 8, faL: 9, hL: 10, shR: 11, uaR: 12, faR: 13, hR: 14,
  thL: 15, snL: 16, ftL: 17, toL: 18, thR: 19, snR: 20, ftR: 21, toR: 22,
  cape1: 23, cape2: 24, cape3: 25,
};
const HB_NAMES = ['root', 'hips', 'spine', 'spine1', 'spine2', 'neck', 'head',
  'shoulder.L', 'upperarm.L', 'forearm.L', 'hand.L', 'shoulder.R', 'upperarm.R', 'forearm.R', 'hand.R',
  'thigh.L', 'shin.L', 'foot.L', 'toe.L', 'thigh.R', 'shin.R', 'foot.R', 'toe.R', 'cape.1', 'cape.2', 'cape.3'];
const HB_PARENT = [-1, 0, 1, 2, 3, 4, 5, 4, 7, 8, 9, 4, 11, 12, 13, 1, 15, 16, 17, 1, 19, 20, 21, 4, 23, 24];

/**
 * Body proportions → absolute bind positions. Character faces +Z, right side = +X.
 * b: {h height m, sw shoulder half-width scale, hw hip scale, legs leg-length ratio, arms}
 */
export function humanoidLayout(b = {}) {
  const s = (b.h ?? 1.8) / 1.8;
  const sw = 0.185 * (b.sw ?? 1), hw = 0.092 * (b.hw ?? 1);
  const L = b.legs ?? 1; // leg length multiplier (shifts hips)
  const hipY = 0.98 * L, kneeY = 0.5 * L, ankY = 0.085;
  const torso = (y) => hipY + (y - 0.98); // torso keeps its length; legs scale
  const P = [
    [0, 0, 0],
    [0, hipY, 0],
    [0, torso(1.06), -0.01],
    [0, torso(1.19), -0.012],
    [0, torso(1.33), -0.005],
    [0, torso(1.505), -0.012],
    [0, torso(1.59), 0.008],
    [-0.035, torso(1.455), 0.0], [-sw, torso(1.44), -0.012], [-sw - 0.018, torso(1.155), -0.02], [-sw - 0.026, torso(0.9), 0.0],
    [0.035, torso(1.455), 0.0], [sw, torso(1.44), -0.012], [sw + 0.018, torso(1.155), -0.02], [sw + 0.026, torso(0.9), 0.0],
    [-hw, hipY - 0.05, 0.0], [-hw - 0.004, kneeY, 0.012], [-hw - 0.006, ankY, -0.012], [-hw - 0.008, 0.018, 0.125],
    [hw, hipY - 0.05, 0.0], [hw + 0.004, kneeY, 0.012], [hw + 0.006, ankY, -0.012], [hw + 0.008, 0.018, 0.125],
    [0, torso(1.44), -0.15], [0, torso(1.05), -0.2], [0, torso(0.6), -0.24],
  ];
  const bones = P.map((p, i) => ({ name: HB_NAMES[i], parent: HB_PARENT[i], pos: [p[0] * s, p[1] * s, p[2] * s] }));
  const at = (name) => bones[HB_NAMES.indexOf(name)].pos;
  return {
    kind: 'humanoid', bones, s, height: (b.h ?? 1.8),
    sockets: {
      'socket.hand.R': { bone: 'hand.R', off: [0.012 * s, -0.085 * s, 0.018 * s] },
      'socket.hand.L': { bone: 'hand.L', off: [-0.012 * s, -0.085 * s, 0.018 * s] },
      'socket.back': { bone: 'spine2', off: [0, 0.04 * s, -0.17 * s] },
      'socket.head': { bone: 'head', off: [0, 0.13 * s, 0.01 * s] },
      'socket.chest': { bone: 'spine2', off: [0, 0.03 * s, 0.14 * s] },
      'socket.hip.L': { bone: 'hips', off: [-0.17 * s, -0.02 * s, 0] },
      'socket.hip.R': { bone: 'hips', off: [0.17 * s, -0.02 * s, 0] },
    },
    at,
  };
}

/** Generic layout from {name, parent(name|null), pos(abs)} list. */
export function genericLayout(kind, list, sockets = {}, height = 1) {
  const names = list.map((b) => b.name);
  const bones = list.map((b) => ({ name: b.name, parent: b.parent == null ? -1 : names.indexOf(b.parent), pos: b.pos }));
  return { kind, bones, sockets, height, s: 1, at: (n) => bones[names.indexOf(n)].pos, index: Object.fromEntries(names.map((n, i) => [n, i])) };
}

/**
 * Instantiate a rig under `parent`. Returns {skeleton, nodes[], byName, sockets, rest[]}.
 */
export function createRig(scene, layout, parent, tag = 'rig') {
  const skeleton = new Skeleton(`${tag}:skel`, `${tag}:skel`, scene);
  const nodes = [], bones = [], rest = [];
  for (let i = 0; i < layout.bones.length; i++) {
    const b = layout.bones[i];
    const pp = b.parent >= 0 ? layout.bones[b.parent].pos : [0, 0, 0];
    const local = new Vector3(b.pos[0] - pp[0], b.pos[1] - pp[1], b.pos[2] - pp[2]);
    const node = new TransformNode(b.name, scene);
    node.parent = b.parent >= 0 ? nodes[b.parent] : parent;
    node.position.copyFrom(local);
    node.rotationQuaternion = Quaternion.Identity();
    const bone = new Bone(b.name, skeleton, b.parent >= 0 ? bones[b.parent] : null, Matrix.Translation(local.x, local.y, local.z));
    bone.linkTransformNode(node);
    nodes.push(node); bones.push(bone); rest.push(local.clone());
  }
  const byName = Object.fromEntries(layout.bones.map((b, i) => [b.name, nodes[i]]));
  const sockets = {};
  for (const [name, s] of Object.entries(layout.sockets ?? {})) {
    const n = new TransformNode(name, scene);
    n.parent = byName[s.bone];
    n.position.set(s.off[0], s.off[1], s.off[2]);
    if (s.rot) n.rotationQuaternion = Quaternion.FromEulerAngles(s.rot[0], s.rot[1], s.rot[2]);
    sockets[name] = n;
  }
  return { skeleton, nodes, bones, byName, sockets, rest, layout };
}

export function disposeRig(rig) {
  rig.skeleton.dispose();
  for (const s of Object.values(rig.sockets)) s.dispose();
  for (let i = rig.nodes.length - 1; i >= 0; i--) rig.nodes[i].dispose();
}
