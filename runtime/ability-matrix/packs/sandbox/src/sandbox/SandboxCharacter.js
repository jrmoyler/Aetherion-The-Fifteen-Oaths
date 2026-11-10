/**
 * The sandbox's one caster: the Vanguard soldier, a PBR glTF with its own
 * skeletal Idle, Walk and Run.
 *
 * It still extends the Linear Ext pack's CharacterController, because that
 * class owns everything the 150 castables read off the body: the fresnel aura
 * its three self buffs write into (whose uniforms live in that module, so the
 * buffs and the body have to share it), the bone segments body effects hang
 * on, the heading, the cast lunge. Only the body and how it is animated are
 * replaced here.
 *
 * - **The body** is `Soldier.glb`, dressed in its own authored PBR materials
 *   (base colour and normal map), normalised to the same 1.78 m the abilities
 *   were tuned against, and patched with the aura like the old rig was.
 * - **Locomotion** is the model's own clips. `Locomotion` writes its intent into
 *   `this.gait` (how much of a stride, where in the cycle, how much of a run,
 *   whether it is dashing); Idle, Walk and Run are blended by those weights and
 *   Walk and Run are scrubbed by the gait phase, so the feet stay matched to
 *   the ground speed and the two cycles stay in step with each other.
 * - **The three cast gestures** are the Mixamo `cast1–3.fbx` clips every pack
 *   was authored with. That rig binds its bones differently from this one, so
 *   each clip is retargeted once at load (`retargetClip`): sampled on its own
 *   skeleton, turned into world-space rotations relative to its own rest pose,
 *   and re-expressed on this skeleton's rest pose.
 * - **Layers.** Every clip is split into a lower body (hips and legs) and an
 *   upper body. A cast always owns the upper body; it owns the legs only while
 *   the caster is standing, so casting on the move keeps the legs walking.
 *
 * Also `handsPoint`, from the Ability Casting pack's version, which its lance
 * reads to leave from between the caster's hands. A rig with no Walk clip falls
 * back to the procedural gait the sandbox used before (`_applyGait`).
 */
import {
  AnimationClip,
  AnimationMixer,
  Box3,
  LoopOnce,
  LoopRepeat,
  MathUtils,
  Matrix4,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack
} from 'three';
import { CharacterController } from '../vendor/linear-ext/animation/CharacterController.js';
import { CAST_ANIMATIONS } from '../vendor/linear-ext/config/settings.js';
import { applyFresnelAura } from '../vendor/linear-ext/materials/FresnelAura.js';
import { LAYER } from '../vendor/linear-ext/core/Layers.js';
import { disposeObject } from '../vendor/linear-ext/utils/dispose.js';
import { settings } from '../config/settings.js';

const CHARACTER_URL = './models/Soldier.glb';
/** The cast gestures, as Mixamo FBX exports of another rig. */
const castUrl = (name) => `./models/${name}.fbx`;
const TARGET_HEIGHT = 1.78;
/** Frames per second the retargeted cast clips are baked at. */
const RETARGET_FPS = 30;

const _other = new Vector3();
const _up = new Vector3(0, 1, 0);
const _swingAxis = new Vector3();
const _local = new Vector3();
const _pq = new Quaternion();
const _q = new Quaternion();
const _scale = new Vector3();
const _ppos = new Vector3();

/** Mixamo short names of every joint the procedural gait touches. */
const GAIT_BONES = [
  'Hips', 'Spine', 'Spine1', 'Spine2',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot',
  'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm'
];

/** The joints a cast leaves to the legs while walking. Everything else is upper body. */
const LOWER_BODY = /^(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Toe_End))$/;

const shortBoneName = (name) => name.split(':').pop().replace(/^mixamorig/i, '');
const trackBone = (track) => shortBoneName(track.name.split('.')[0]);

/** Split a clip into its lower-body and upper-body tracks. */
function splitClip(clip) {
  const lower = clip.tracks.filter((t) => LOWER_BODY.test(trackBone(t)));
  const upper = clip.tracks.filter((t) => !LOWER_BODY.test(trackBone(t)));
  return {
    lower: new AnimationClip(`${clip.name}.lower`, clip.duration, lower),
    upper: new AnimationClip(`${clip.name}.upper`, clip.duration, upper)
  };
}

/** short name → bone, first match wins. */
function boneMap(root) {
  const map = new Map();
  root.traverse((node) => {
    if (!node.isBone) return;
    const short = shortBoneName(node.name);
    if (!map.has(short)) map.set(short, node);
  });
  return map;
}

/** Yaw of the rig's forward (heel → toe of the left foot), in `root`'s space. */
function rigYaw(root, bones) {
  const foot = bones.get('LeftFoot');
  const toe = bones.get('LeftToeBase');
  if (!foot || !toe) return 0;
  root.updateMatrixWorld(true);
  const inv = new Matrix4().copy(root.matrixWorld).invert();
  const heel = foot.getWorldPosition(new Vector3()).applyMatrix4(inv);
  const tip = toe.getWorldPosition(new Vector3()).applyMatrix4(inv).sub(heel);
  return Math.atan2(tip.x, tip.z);
}

/**
 * Re-express `clip`, authored on `source`, on the skeleton under `target`.
 *
 * Both rigs are Mixamo skeletons in a T-pose at rest, but their bones carry
 * different local axes, so copying the quaternions across would twist every
 * limb. Instead, for every frame, each source bone's rotation is taken in world
 * space *relative to its own rest*, that delta is applied to the matching
 * target bone's world rest, and the result is converted back into the target
 * bone's parent frame. The hips' travel is carried across scaled by the ratio
 * of the two hip heights. Bones either side lacks are left out.
 *
 * Everything is measured relative to each rig's root, with the two rigs'
 * facings lined up, so neither has to be in the scene or at the origin.
 *
 * @param {import('three').Object3D} source rig the clip was authored on, at rest
 * @param {import('three').AnimationClip} clip
 * @param {import('three').Object3D} target rig to bake for, at rest
 */
export function retargetClip(source, clip, target) {
  const sBones = boneMap(source);
  const tBones = boneMap(target);
  const names = [...tBones.keys()].filter((n) => sBones.has(n));
  if (!names.includes('Hips')) return null;

  source.updateMatrixWorld(true);
  target.updateMatrixWorld(true);
  const sInv = new Matrix4().copy(source.matrixWorld).invert();
  const tInv = new Matrix4().copy(target.matrixWorld).invert();

  // Line the source's facing up with the target's.
  const align = new Quaternion().setFromAxisAngle(_up, rigYaw(target, tBones) - rigYaw(source, sBones));
  const alignInv = align.clone().invert();

  const worldQ = (bone, inv, out) => {
    const m = new Matrix4().multiplyMatrices(inv, bone.matrixWorld);
    m.decompose(new Vector3(), out, new Vector3());
    return out.normalize();
  };
  const worldP = (bone, inv) => new Vector3().setFromMatrixPosition(bone.matrixWorld).applyMatrix4(inv);

  // Rest poses, in each rig's own root space.
  const sRest = new Map(names.map((n) => [n, worldQ(sBones.get(n), sInv, new Quaternion())]));
  const tRest = new Map(names.map((n) => [n, worldQ(tBones.get(n), tInv, new Quaternion())]));
  const sHipRest = worldP(sBones.get('Hips'), sInv);
  const tHipRest = worldP(tBones.get('Hips'), tInv);
  const hipScale = tHipRest.y / Math.max(1e-6, sHipRest.y);

  // Target bones in hierarchy order, so a parent's new world rotation is known
  // before its children need it. Unmapped ancestors (the armature node) keep
  // their rest rotation.
  const order = [];
  target.traverse((node) => {
    if (node.isBone && names.includes(shortBoneName(node.name)) && tBones.get(shortBoneName(node.name)) === node) {
      order.push(node);
    }
  });
  const restWorld = (node) => worldQ(node, tInv, new Quaternion());

  const hips = tBones.get('Hips');
  const hipParentInv = new Matrix4().multiplyMatrices(tInv, hips.parent.matrixWorld).invert();

  const frames = Math.max(2, Math.round(clip.duration * RETARGET_FPS) + 1);
  const times = new Float32Array(frames);
  const values = new Map(order.map((b) => [b, new Float32Array(frames * 4)]));
  const hipValues = new Float32Array(frames * 3);

  // Sample the clip on a copy of its own rig, leaving the caller's untouched.
  const mixer = new AnimationMixer(source);
  const action = mixer.clipAction(clip);
  action.play();

  const delta = new Quaternion();
  const sNow = new Quaternion();
  const world = new Map();
  for (let f = 0; f < frames; f++) {
    const t = Math.min(clip.duration, f / RETARGET_FPS);
    times[f] = t;
    mixer.setTime(t);
    source.updateMatrixWorld(true);
    world.clear();

    for (const bone of order) {
      const name = shortBoneName(bone.name);
      worldQ(sBones.get(name), sInv, sNow);
      // delta = sNow · sRest⁻¹, carried into the target's facing.
      delta.copy(sNow).multiply(_q.copy(sRest.get(name)).invert());
      delta.premultiply(align).multiply(alignInv);
      const w = delta.clone().multiply(tRest.get(name));
      world.set(bone, w);

      const parentWorld = world.get(bone.parent) ?? restWorld(bone.parent);
      const local = _q.copy(parentWorld).invert().multiply(w).normalize();
      local.toArray(values.get(bone), f * 4);
    }

    // Hips travel: the source's offset from rest, scaled, in the target's space.
    const offset = worldP(sBones.get('Hips'), sInv).sub(sHipRest).multiplyScalar(hipScale).applyQuaternion(align);
    const p = tHipRest.clone().add(offset).applyMatrix4(hipParentInv);
    p.toArray(hipValues, f * 3);
  }
  action.stop();
  mixer.uncacheRoot(source);

  const tracks = order.map((bone) => new QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values.get(bone)));
  tracks.push(new VectorKeyframeTrack(`${hips.name}.position`, times, hipValues));
  return new AnimationClip(clip.name, clip.duration, tracks);
}

export class SandboxCharacter extends CharacterController {
  constructor(environment) {
    super(environment);
    /** Written by `Locomotion` every frame; read in `update`. */
    this.gait = { weight: 0, phase: 0, run: 0, dash: 0, dir: new Vector3(0, 0, 1) };
    /** Idle/Walk/Run, each as a { lower, upper } pair of looping actions. */
    this.loco = null;
    /** name → { lower, upper } one-shot cast actions. */
    this.castLayers = new Map();
    /** The cast being thrown: { name, layers, time, duration } or null. */
    this._throw = null;
    /** 0..1 how much of the body the cast currently owns. */
    this._castWeight = 0;
    /** short name → bone for the procedural fallback gait (null until needed). */
    this._gaitBones = null;
    this._gaitRest = [];
    this._gaitApplied = false;
  }

  /**
   * @param {import('../vendor/linear-ext/loaders/AssetLoader.js').AssetLoader} assets
   */
  async load(assets) {
    const [gltf, ...castFiles] = await Promise.all([
      assets.loadGLTF(CHARACTER_URL),
      ...CAST_ANIMATIONS.map((name) => assets.loadFBX(castUrl(name)).catch(() => null))
    ]);
    await assets.settled();

    const model = gltf.scene;
    const clips = new Map((gltf.animations ?? []).map((clip) => [clip.name, clip]));

    // Measure in the rest pose, not the bind data's first frame.
    model.updateMatrixWorld(true);
    const box = new Box3().setFromObject(model, true);
    const size = box.getSize(new Vector3());
    model.scale.multiplyScalar(TARGET_HEIGHT / Math.max(0.001, size.y));
    model.updateMatrixWorld(true);
    box.setFromObject(model, true);
    box.getSize(size);
    const center = box.getCenter(new Vector3());
    this.height = size.y;
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;
    model.updateMatrixWorld(true);

    this._prepareSoldier(model);
    this._measureFacing(model);
    this._measureSkeleton(model);

    // Bake the cast gestures against the rest pose, before anything animates it.
    const casts = [];
    CAST_ANIMATIONS.forEach((name, index) => {
      const file = castFiles[index];
      const clip = (file?.animations ?? [])[0];
      if (!clip) {
        console.warn(`[SandboxCharacter] "${name}.fbx" carries no animation`);
      } else {
        clip.name = name;
        const baked = retargetClip(file, clip, model);
        if (baked) casts.push(baked);
        else console.warn(`[SandboxCharacter] "${name}.fbx" does not match this skeleton`);
      }
      if (file) disposeObject(file);
    });

    this.tilt.add(model);
    this.model = model;
    this.headPosition.set(0, size.y * 0.86, 0);

    this.mixer = new AnimationMixer(model);

    // The whole idle, never played: what a clone of the body (Mirage Construct)
    // breathes with.
    const idleClip = clips.get('Idle') ?? [...clips.values()][0];
    if (idleClip) this.idle = this.mixer.clipAction(idleClip);

    const walk = clips.get('Walk');
    const run = clips.get('Run');
    if (idleClip && walk && run) {
      this.loco = {
        idle: this._loopLayers(idleClip),
        walk: this._loopLayers(walk),
        run: this._loopLayers(run)
      };
      // Walk and Run are scrubbed by the gait phase, so one clip is one cycle
      // of `Locomotion`'s phase; set the strides that cycle covers off the
      // clips' own cadence at the configured speeds.
      const m = settings.move;
      if (m) {
        m.stride = m.walkSpeed * walk.duration;
        m.runStride = m.runSpeed * run.duration;
      }
    } else if (this.idle) {
      this.idle.setLoop(LoopRepeat, Infinity).play();
    }

    for (const clip of casts) {
      const { lower, upper } = splitClip(clip);
      const layers = { lower: this.mixer.clipAction(lower), upper: this.mixer.clipAction(upper), duration: clip.duration };
      for (const action of [layers.lower, layers.upper]) {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
        action.setEffectiveWeight(0);
      }
      this.castLayers.set(clip.name, layers);
    }
    // The parent's API reads `casts` for what can be thrown.
    this.casts = new Map([...this.castLayers.keys()].map((name) => [name, this.castLayers.get(name).upper]));

    this.root.updateMatrixWorld(true);
    return this;
  }

  /** A looping clip as a lower/upper pair of actions, both playing. */
  _loopLayers(clip) {
    const { lower, upper } = splitClip(clip);
    const pair = { lower: this.mixer.clipAction(lower), upper: this.mixer.clipAction(upper), duration: clip.duration };
    for (const action of [pair.lower, pair.upper]) action.setLoop(LoopRepeat, Infinity).play();
    return pair;
  }

  /** Shadows, layers and the self-buff aura on the soldier's own PBR materials. */
  _prepareSoldier(root) {
    root.traverse((node) => {
      if (!node.isMesh && !node.isSkinnedMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
      node.layers.set(LAYER.WORLD);
      node.layers.enable(LAYER.CONTACT);
      const list = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of list) {
        if (!material || this._patched.has(material)) continue;
        // The export ships roughness 1 everywhere, which reads as chalk under the
        // HDR probe; a little sheen on the armour and a glossy visor sell the PBR.
        if (/visor/i.test(material.name)) {
          material.roughness = 0.28;
          material.metalness = 0.55;
        } else {
          material.roughness = 0.62;
          material.metalness = 0.15;
        }
        for (const map of [material.map, material.normalMap]) if (map) map.anisotropy = 4;
        this._patched.add(material);
        applyFresnelAura(material, this.environment);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* casts                                                               */
  /* ------------------------------------------------------------------ */

  playCast(name) {
    if (!this.castLayers.size) return;
    const layers = this.castLayers.get(name) ?? this.castLayers.get(CAST_ANIMATIONS[0]) ?? [...this.castLayers.values()][0];
    const previous = this._throw;
    if (previous && previous.layers !== layers) {
      previous.layers.lower.stop();
      previous.layers.upper.stop();
    }
    for (const action of [layers.lower, layers.upper]) {
      action.reset();
      action.play();
    }
    this._throw = { layers, time: 0, duration: layers.duration };
  }

  get isCasting() {
    return this._throw !== null;
  }

  /** Cast envelope: in fast, out soft, so the throw lands on the frame you clicked. */
  _updateCast(dt) {
    const c = settings.character;
    const cast = this._throw;
    if (!cast) {
      this._castWeight = Math.max(0, this._castWeight - dt / Math.max(0.01, c.castBlendOut));
      return;
    }
    cast.time += dt;
    const remaining = cast.duration - cast.time;
    if (remaining <= 0) {
      this._throw = null;
      this._fading = cast.layers;
      return;
    }
    const fadeIn = Math.min(1, cast.time / Math.max(0.01, c.castBlendIn));
    const fadeOut = Math.min(1, remaining / Math.max(0.01, c.castBlendOut));
    this._castWeight = Math.min(fadeIn, fadeOut);
  }

  /** Set every layer's weight from the gait and the cast envelope. */
  _weighLayers(dt) {
    const g = this.gait;
    const moving = MathUtils.clamp(Math.max(g.weight, g.dash), 0, 1);
    const run = MathUtils.clamp(Math.max(g.run, g.dash), 0, 1);
    const cast = this._castWeight;
    const layers = this._throw?.layers ?? this._fading;
    // A cast owns the arms always, the legs only while standing still.
    const castUpper = layers ? cast : 0;
    const castLower = layers ? cast * (1 - moving) : 0;

    if (this.loco) {
      const w = { idle: 1 - moving, walk: moving * (1 - run), run: moving * run };
      for (const key of ['idle', 'walk', 'run']) {
        this.loco[key].lower.setEffectiveWeight(w[key] * (1 - castLower));
        this.loco[key].upper.setEffectiveWeight(w[key] * (1 - castUpper));
      }
      // One clip is one gait cycle; scrub both so they never drift apart.
      const cycle = MathUtils.euclideanModulo(g.phase / (Math.PI * 2), 1);
      for (const key of ['walk', 'run']) {
        const pair = this.loco[key];
        pair.lower.time = pair.upper.time = cycle * pair.duration;
        pair.lower.timeScale = pair.upper.timeScale = 0;
      }
    }
    if (layers) {
      layers.upper.setEffectiveWeight(castUpper);
      layers.lower.setEffectiveWeight(castLower);
      if (!this._throw && cast <= 0) {
        layers.lower.stop();
        layers.upper.stop();
        this._fading = null;
      }
    }
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
    // Put back what the fallback gait added last frame before the mixer runs.
    this._restoreGait();
    this._applyLunge(dt);
    if (!this.mixer) return;

    const scaled = dt * settings.global.animationSpeed;
    this._updateCast(scaled);
    this._weighLayers(scaled);
    this.mixer.timeScale = settings.global.animationSpeed;
    this.mixer.update(dt);

    if (this.loco) this._applyDash();
    else this._applyGait();
    // Resolve the pose now: the buffs read bone matrices before the render.
    this.root.updateMatrixWorld(true);
  }

  /** The clips have no dash: lean the run into it and drop the hips. */
  _applyDash() {
    const g = this.gait;
    if (g.dash < 1e-3) return;
    const b = this._findGaitBones();
    if (!b) return;
    this._snapshotGait();
    _swingAxis.crossVectors(_up, g.dir);
    if (_swingAxis.lengthSq() < 1e-6) return;
    _swingAxis.normalize();
    this._turn(b.Spine, _swingAxis, g.dash * settings.move.dashLean);
    if (b.Hips?.parent) {
      b.Hips.parent.matrixWorld.decompose(_ppos, _pq, _scale);
      _local.set(0, -0.06 * g.dash, 0).applyQuaternion(_pq.invert()).divideScalar(Math.max(1e-6, _scale.y));
      b.Hips.position.add(_local);
    }
  }

  dispose() {
    this.castLayers.clear();
    this.loco = null;
    this._throw = null;
    this._fading = null;
    super.dispose();
  }

  /* ------------------------------------------------------------------ */
  /* procedural gait: the fallback for a rig with no Walk/Run clips       */
  /* ------------------------------------------------------------------ */

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

  _snapshotGait() {
    for (const rest of this._gaitRest) {
      rest.q.copy(rest.bone.quaternion);
      rest.p.copy(rest.bone.position);
    }
    this._gaitApplied = true;
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
    bone.parent.updateMatrixWorld(true);
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
    this.root.updateMatrixWorld(true);
    this._snapshotGait();

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
