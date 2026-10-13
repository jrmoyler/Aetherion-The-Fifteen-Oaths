/**
 * The sandbox's one caster.
 *
 * It is the Linear Ext pack's CharacterController, unchanged, because that
 * version is a superset of the others: it dresses the rig from the authored
 * material library, measures the skeleton into bone segments, and carries the
 * fresnel aura its three self buffs write into — and the aura's uniforms live
 * in that module, so the buffs and the body have to share it.
 *
 * Two additions:
 *
 * - `handsPoint`, from the Ability Casting pack's version, which its lance
 *   reads to leave from between the caster's hands.
 * - **a procedural gait.** The rig ships an idle and three cast clips and no
 *   walk, so walking is built here: `Locomotion` writes its intent into
 *   `this.gait` (how much of a stride, where in the cycle, which way, how much
 *   of a run, whether it is dashing), and after the mixer has posed the idle
 *   this swings the thighs, bends the knees, swings the arms against the legs,
 *   twists the shoulders, rolls and bobs the pelvis and leans the torso. Every
 *   rotation is made about a *world* axis (the line of travel, or up) and
 *   converted into each bone's parent frame, so it does not matter how the rig's
 *   bones happen to be oriented. A cast clip plays over the top: the legs keep
 *   walking and the arm swing gets out of its way.
 */
import { MathUtils, Quaternion, Vector3 } from 'three';
import { CharacterController } from '../vendor/linear-ext/animation/CharacterController.js';
import { settings } from '../config/settings.js';

const _other = new Vector3();
const _up = new Vector3(0, 1, 0);
const _swingAxis = new Vector3();
const _local = new Vector3();
const _pq = new Quaternion();
const _q = new Quaternion();
const _scale = new Vector3();
const _ppos = new Vector3();

/** Mixamo short names of every joint the gait touches. */
const GAIT_BONES = [
  'Hips', 'Spine', 'Spine1', 'Spine2',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot',
  'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm'
];

const shortBoneName = (name) => name.split(':').pop().replace(/^mixamorig/i, '');

export class SandboxCharacter extends CharacterController {
  constructor(environment) {
    super(environment);
    /** Written by `Locomotion` every frame; read in `update`. */
    this.gait = { weight: 0, phase: 0, run: 0, dash: 0, dir: new Vector3(0, 0, 1) };
    /** short name → bone, once the rig has loaded (null until then). */
    this._gaitBones = null;
    /** The pose each touched bone had before the gait was laid on, last frame. */
    this._gaitRest = [];
    this._gaitApplied = false;
  }

  /** Midpoint of the two hands in world space, or null before the rig loads. */
  handsPoint(out) {
    if (!this._hands) {
      let left = null;
      let right = null;
      this.root.traverse((node) => {
        if (/LeftHand$/.test(node.name)) left = node;
        else if (/RightHand$/.test(node.name)) right = node;
      });
      if (!left || !right) return null;
      this._hands = [left, right];
    }
    this._hands[0].getWorldPosition(out);
    this._hands[1].getWorldPosition(_other);
    return out.add(_other).multiplyScalar(0.5);
  }

  update(dt) {
    // Put back what the gait added last frame before the mixer runs: a bone the
    // idle clip carries no track for would otherwise keep every frame's offset.
    this._restoreGait();
    super.update(dt);
    if (this._applyGait()) this.root.updateMatrixWorld(true);
  }

  _findGaitBones() {
    if (this._gaitBones || !this.model) return this._gaitBones;
    const bones = {};
    this.model.traverse((node) => {
      if (!node.isBone) return;
      const short = shortBoneName(node.name);
      if (GAIT_BONES.includes(short) && !bones[short]) bones[short] = node;
    });
    if (!bones.LeftUpLeg || !bones.RightUpLeg) return null;
    this._gaitBones = bones;
    this._gaitRest = Object.values(bones).map((bone) => ({ bone, q: new Quaternion(), p: new Vector3() }));
    return bones;
  }

  _restoreGait() {
    if (!this._gaitApplied) return;
    for (const rest of this._gaitRest) {
      rest.bone.quaternion.copy(rest.q);
      rest.bone.position.copy(rest.p);
    }
    this._gaitApplied = false;
  }

  /** Rotate a bone by `angle` about a world-space axis through its own joint. */
  _turn(bone, axis, angle) {
    if (!bone || Math.abs(angle) < 1e-5) return;
    bone.parent.matrixWorld.decompose(_ppos, _pq, _scale);
    _local.copy(axis).applyQuaternion(_pq.invert());
    _q.setFromAxisAngle(_local, angle);
    bone.quaternion.premultiply(_q);
  }

  _applyGait() {
    const g = this.gait;
    const w = g.weight;
    const dash = g.dash;
    if (w < 1e-3 && dash < 1e-3) return false;
    const b = this._findGaitBones();
    if (!b) return false;

    for (const rest of this._gaitRest) {
      rest.q.copy(rest.bone.quaternion);
      rest.p.copy(rest.bone.position);
    }
    this._gaitApplied = true;

    const c = settings.move;
    const run = g.run;
    const lerp = MathUtils.lerp;
    const legSwing = lerp(c.legSwing, c.runLegSwing, run) * w;
    const kneeBend = lerp(c.kneeBend, c.runKneeBend, run) * w;
    const kneeStance = c.kneeStance * w;
    // The arms get out of a cast clip's way.
    const armScale = this.isCasting ? 0.2 : 1;
    const armSwing = lerp(c.armSwing, c.runArmSwing, run) * w * armScale;
    const elbow = lerp(c.elbowBend, c.runElbowBend, run) * w * armScale;
    const lean = lerp(c.lean, c.runLean, run) * w + dash * c.dashLean;
    const bob = lerp(c.hipBob, c.runHipBob, run) * w;

    const s = Math.sin(g.phase);
    const co = Math.cos(g.phase);

    // Positive turns about up × travel send a hanging limb *backwards*.
    _swingAxis.crossVectors(_up, g.dir);
    if (_swingAxis.lengthSq() < 1e-6) return true;
    _swingAxis.normalize();

    /* pelvis: roll over the stance foot, bob at every step */
    this._turn(b.Hips, g.dir, c.hipSway * w * s);
    if (b.Hips && b.Hips.parent) {
      // Highest as the legs pass each other, lowest with them spread.
      const lift = bob * (0.5 - s * s) - 0.04 * run * w - 0.06 * dash;
      b.Hips.parent.matrixWorld.decompose(_ppos, _pq, _scale);
      _local.set(0, lift, 0).applyQuaternion(_pq.invert()).divideScalar(Math.max(1e-6, _scale.y));
      b.Hips.position.add(_local);
    }

    /* torso: lean into the travel, shoulders against the hips */
    this._turn(b.Spine, _swingAxis, lean);
    this._turn(b.Spine1, _up, -c.spineTwist * w * s);

    /* legs: thigh swing, and the knee folds through the swing */
    const tuck = dash * 0.9;
    this._turn(b.LeftUpLeg, _swingAxis, -legSwing * s - tuck * 0.5);
    this._turn(b.RightUpLeg, _swingAxis, legSwing * s - tuck * 0.2);
    const kneeL = kneeStance + kneeBend * Math.max(0, co) + tuck;
    const kneeR = kneeStance + kneeBend * Math.max(0, -co) + tuck * 0.6;
    this._turn(b.LeftLeg, _swingAxis, kneeL);
    this._turn(b.RightLeg, _swingAxis, kneeR);
    // Toes up a little through the swing, so the foot clears the floor.
    this._turn(b.LeftFoot, _swingAxis, -kneeL * 0.35);
    this._turn(b.RightFoot, _swingAxis, -kneeR * 0.35);

    /* arms: opposite the legs, the forearm bent most on the forward swing */
    this._turn(b.LeftArm, _swingAxis, armSwing * s);
    this._turn(b.RightArm, _swingAxis, -armSwing * s);
    this._turn(b.LeftForeArm, _swingAxis, -elbow * (0.55 + 0.45 * Math.max(0, -s)));
    this._turn(b.RightForeArm, _swingAxis, -elbow * (0.55 + 0.45 * Math.max(0, s)));
    return true;
  }
}
