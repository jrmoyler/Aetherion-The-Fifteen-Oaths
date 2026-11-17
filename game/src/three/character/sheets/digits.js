// Extend only the costume palette. Baked body and equipment keep their original
// skin indices and inverse binds, while each actor owns its finger joints.
import { Bone, Matrix4, Quaternion, Skeleton } from 'three';

const jointName = (digit, joint, side) => `${digit}${joint}.${side}`;

export function registerDigits(rig) {
  const digits = [];
  const baseCount = rig.mesh.skeleton.bones.length;
  rig.digit = (side, digit, joint, point, axis, closed) => {
    const name = jointName(digit, joint, side);
    const position = point.clone(), curlAxis = axis.clone().normalize();
    if (side === 'R') {
      position.x *= -1;
      // A rotation axis is an axial vector under reflection.
      curlAxis.y *= -1;
      curlAxis.z *= -1;
    }
    const parent = joint ? jointName(digit, joint - 1, side) : `hand.${side}`;
    const parentIndex = rig.index[parent];
    if (parentIndex === undefined) throw new Error(`Missing parent ${parent} for ${name}`);
    rig.index[name] = baseCount + digits.length;
    digits.push({ name, parentIndex, position, curlAxis, closed, digit, joint });
    // Bag mirrors the bone name along with the point when drawing the right side.
    return [[jointName(digit, joint, 'L'), 1]];
  };
  return digits;
}

const CURL = { thumb: .46, index: .78, middle: .92, ring: 1, little: 1.08 };
const RELEASE = { thumb: -.12, index: -.27, middle: -.31, ring: -.23, little: -.14 };
const FLEX = { thumb: .18, index: .48, middle: .56, ring: .63, little: .67 };

export function bindDigits(mesh, digits) {
  const bones = [...mesh.skeleton.bones], inverses = [...mesh.skeleton.boneInverses];
  const local = new Matrix4(), delta = new Quaternion();
  const joints = digits.map(def => {
    const bind = new Matrix4().makeTranslation(def.position.x, def.position.y, def.position.z)
      .premultiply(mesh.bindMatrix);
    const bone = new Bone();
    bone.name = def.name;
    local.multiplyMatrices(inverses[def.parentIndex], bind)
      .decompose(bone.position, bone.quaternion, bone.scale);
    bones[def.parentIndex].add(bone);
    bones.push(bone);
    inverses.push(bind.invert());
    return { def, bone, rest: bone.quaternion.clone(), angle: 0 };
  });
  const skeleton = new Skeleton(bones, inverses);
  return {
    skeleton,
    pose(dt, clip = '') {
      const swimming = clip === 'swim' || clip === 'tread_water' || clip === 'tread';
      const cast = clip.startsWith('cast_');
      const release = clip === 'cast_release' || clip === 'cast_aoe';
      const brace = clip.startsWith('attack') || clip.startsWith('dodge') || clip === 'hit';
      const run = clip === 'sprint' || clip === 'run';
      const blend = 1 - Math.exp(-dt * (release ? 22 : 12));
      for (const joint of joints) {
        const { def } = joint;
        // The weapon hand is sculpted around its grip. The free hand shapes the spell.
        let target = 0;
        if (swimming && def.closed) target = -.55 * CURL[def.digit];
        else if (def.closed) target = brace ? .045 * CURL[def.digit] : 0;
        else if (release) target = RELEASE[def.digit];
        else if (cast) target = def.digit === 'index' ? -.13 : FLEX[def.digit] * .75;
        else if (brace || run) target = FLEX[def.digit] * (brace ? 1 : .62);
        target *= def.joint === 2 ? .67 : 1;
        joint.angle += (target - joint.angle) * blend;
        joint.bone.quaternion.copy(joint.rest).multiply(delta.setFromAxisAngle(def.curlAxis, joint.angle));
      }
    },
    dispose() {
      for (const { bone } of joints) bone.removeFromParent();
      skeleton.dispose();
    },
  };
}
