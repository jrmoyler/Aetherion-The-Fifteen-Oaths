import { InstancedMesh, Mesh, Object3D, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createUmbraHandMaterial,
  createUmbraHazeMaterial,
  createUmbraPoolMaterial,
  createUmbraSleeveMaterial,
  createUmbraWarpMaterial
} from '../../materials/matrix-new/UmbraGraspMaterials.js';
import { createUmbraBoneGeometry, createUmbraSleeveGeometry } from '../../assets/matrix-new/UmbraGraspGeometry.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing, randRange } from '../../utils/math.js';

export const ID = 'umbra';

const TAU = Math.PI * 2;

/** Forearm, four metacarpals, twelve phalanges, three thumb bones. */
const BONES = 20;
const MAX_BONES = 24;
/** Bodies one fist can hold. More than the stage ever crowds into one. */
const MAX_GRIPS = 6;

/** Per-finger proportions, index → little finger. Shape, not tuning. */
const FINGER_LENGTH = [0.92, 1.0, 0.96, 0.78];
const KNUCKLE_HEIGHT = [0.97, 1.0, 0.97, 0.88];
/** Phalanx share of a finger's length: proximal, middle, distal. */
const PHALANX = [0.44, 0.31, 0.25];

const _emit = {};
const _pos = new Vector3();
const _floor = new Vector3();
const _dir = new Vector3();
const _at = new Vector3();
const _up = new Vector3(0, 1, 0);
const _node = new Object3D();
/* the hand's frame, rebuilt every frame */
const _W = new Vector3();
const _U = new Vector3();
const _F = new Vector3();
const _S = new Vector3();
const _Uh = new Vector3();
const _Fh = new Vector3();
const _K = new Vector3();
const _M = new Vector3();
const _u0 = new Vector3();
const _b0 = new Vector3();
const _p = new Vector3();
const _d = new Vector3();
const _open = new Vector3();
const _shut = new Vector3();

/**
 * UMBRA GRASP — a hand of shadow that closes on its target and drags it under.
 *
 * A puddle of darkness is flung along the floor to the circle. Where it stops,
 * the grasp plays out on one clock:
 *
 *   1. **the pool of living dark** spreads from the landing point — not a decal
 *      but ink: a slow polar swirl of near-blacks with faint violet veins, a
 *      violet rim light along its edge so it reads on a dark floor, and a ring
 *      of tendrils that writhe as they reach out past it. Wherever the hand is
 *      coming up the ink deepens to a true black hole.
 *   2. **the hand** rises out of it — a forearm, palm, four three-jointed
 *      fingers and a thumb, every one a capsule laid out each frame from the
 *      live settings (`UmbraGraspGeometry`). It surges up behind whatever stands
 *      there with its fingers raised in a claw, flexes them *open* for a beat of
 *      anticipation, then closes them over the body and folds at the wrist. The
 *      body of the hand is opaque, near-black smoke whose silhouette is eaten by
 *      rising fbm; a soft haze shell is drawn round it so twenty capsules read
 *      as one volumetric mass; a thin violet rim and embers deep in the smoke
 *      are the only light it has.
 *   3. **the grip** — `handlesOwnHits`. When the fingers shut, everything in
 *      the circle is seized: the living are felled toward the fist
 *      (`Dummy#kill`), and from then every body is carried *into* the fist by a
 *      velocity field (`Dummy#carry`) with the hand taking its weight, stained
 *      with shadow (`Dummy#corrode`). Then the hand sinks back into the pool:
 *      the stage floor is opened under each body in step with the fist
 *      (`Dummy#sink`, monotonic, so nothing is spat back up), and as a body goes
 *      under it is eaten (`Dummy#consume`). Nothing that was taken comes back.
 *   4. **smoke & motes** — dark SMOKE wisps pour off the hand and the pool's
 *      rim the whole time (non-additive: they darken the air), violet motes rise
 *      out of the ink, and streaks of violet rush into the fist as it closes.
 *   4b. **the ink sleeves** — one per held body: when the drag starts, the
 *      pool surges up round the body as a ragged, flared collar of ink
 *      (`createUmbraSleeveGeometry`, `createUmbraSleeveMaterial`), climbs its
 *      legs to `sleeveReach`, pours downward and follows it under; when the
 *      body is gone it closes over the place. Presentation only — it reads the
 *      held body's position and never moves it — but it is what makes the
 *      drag-under read at play distance: the body is seen going *into* the
 *      pool, not just lower.
 *   5. **the sinking warp** — a LAYER.DISTORTION proxy pours the frame slowly
 *      downward into the pool, harder while the hand drags.
 *   6. **beats** — a ripple and a knock on landing; a pressure shell, shockwave,
 *      flash, light punch and shake as the fingers shut; a rumble as it drags.
 *
 * Then it ends: whatever is left of the hand burns to smoke along a violet
 * edge (its haze thickening as it goes, so it turns *into* smoke rather than
 * vanishing), the tendrils withdraw, the pool drains inward, and a dark stain
 * is handed to a SCORCH decal.
 *
 * ## The editor rule
 *
 * The cast records nothing but a seed, its clocks, and which bodies it holds.
 * Every bone's length and radius, every joint angle and every beat's timing is
 * resolved from `settings.umbra` every frame — dragging `curlAmount` while the
 * fist is shut opens it.
 */
export class UmbraGraspAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /** The hand chooses who it takes, holds them, and decides when they die. */
  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this.hand.visible ? this.hand.count * 2 : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the pool ---- */
    this.groundGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.poolMaterial = createUmbraPoolMaterial();
    this.pool = new Mesh(this.groundGeometry, this.poolMaterial);
    this.pool.name = 'UmbraPool';
    this.pool.layers.set(LAYER.VFX);
    this.pool.renderOrder = 5;
    this.pool.frustumCulled = false;
    this.pool.visible = false;
    this.group.add(this.pool);

    /* ---- layer 2: the hand — solid smoke, then its haze ---- */
    this.boneGeometry = createUmbraBoneGeometry({ radial: 14, rings: 6, capRings: 4, maxBones: MAX_BONES });
    this.boneAttribute = this.boneGeometry.getAttribute('aBone');

    this.handMaterial = createUmbraHandMaterial();
    this.hand = new InstancedMesh(this.boneGeometry, this.handMaterial, MAX_BONES);
    this.hand.name = 'UmbraHand';
    // VFX, not WORLD: the vertex stage builds every capsule from its shape
    // code, so the depth prepass's override material would draw unit rings.
    // It still writes depth in the main pass, so the haze, the smoke and the
    // pool sort against it correctly.
    this.hand.layers.set(LAYER.VFX);
    this.hand.renderOrder = 6;
    this.hand.frustumCulled = false;
    this.hand.count = 0;
    this.hand.visible = false;
    this.group.add(this.hand);

    this.hazeMaterial = createUmbraHazeMaterial();
    this.haze = new InstancedMesh(this.boneGeometry, this.hazeMaterial, MAX_BONES);
    // One placement for both: the haze reads the hand's own instance matrices.
    this.haze.instanceMatrix = this.hand.instanceMatrix;
    this.haze.name = 'UmbraHaze';
    this.haze.layers.set(LAYER.VFX);
    this.haze.renderOrder = 7;
    this.haze.frustumCulled = false;
    this.haze.count = 0;
    this.haze.visible = false;
    this.group.add(this.haze);

    /* ---- layer 4b: the ink sleeves that take held bodies under ---- */
    this.sleeveGeometry = createUmbraSleeveGeometry({ maxSleeves: MAX_GRIPS });
    this.sleeveAttribute = this.sleeveGeometry.getAttribute('aSleeve');
    this.sleeveMaterial = createUmbraSleeveMaterial();
    this.sleeves = new InstancedMesh(this.sleeveGeometry, this.sleeveMaterial, MAX_GRIPS);
    this.sleeves.name = 'UmbraSleeves';
    this.sleeves.layers.set(LAYER.VFX); // shaped in the vertex stage, like the hand
    this.sleeves.renderOrder = 6;
    this.sleeves.frustumCulled = false;
    this.sleeves.count = 0;
    this.sleeves.visible = false;
    this.group.add(this.sleeves);
    this._sleeves = [];
    for (let i = 0; i < MAX_GRIPS; i++) {
      this._sleeves.push({ active: false, dummy: null, x: 0, z: 0, hips: 0, eaten: 0, grow: 0, close: 0, seed: 0 });
    }
    this._sleeveState = { time: 0 };

    /* ---- layer 5: the sinking warp ---- */
    this.warpGeometry = new PlaneGeometry(1, 1);
    this.warpMaterial = createUmbraWarpMaterial();
    this.warp = new Mesh(this.warpGeometry, this.warpMaterial);
    this.warp.name = 'UmbraWarp';
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.warp.visible = false;
    this.group.add(this.warp);

    /** Where each bone was laid this frame — the smoke is emitted off them. */
    this._boneRoot = new Float32Array(MAX_BONES * 3);
    this._boneDir = new Float32Array(MAX_BONES * 3);
    this._boneLen = new Float32Array(MAX_BONES);
    this._boneRad = new Float32Array(MAX_BONES);
    this._boneCount = 0;

    /** Per-cast state. Clocks, a seed, and who is held — never a metre. */
    this._seed = 0;
    this._clock = 0; // seconds since the puddle landed
    this._dry = 0; // 0..1 through the fade
    this._spin = 0; // the ink's integrated turn
    this._seized = false;
    this._dragFired = false;
    this._stained = false;
    this._target = null; // the body the hand rises under, if any
    this._fist = new Vector3();
    this._handBase = new Vector3();

    this._grips = [];
    for (let i = 0; i < MAX_GRIPS; i++) {
      this._grips.push({ dummy: null, time: 0, depth: 0, eaten: 0, under: false, at: new Vector3() });
    }
    this._gripCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };

    /** The current that hauls a body into the fist. Bound once; allocates nothing. */
    this._field = (x, y, z, out) => {
      const c = settings.umbra;
      const pull = c.gripPull;
      out.set((this._fist.x - x) * pull, (this._fist.y - y) * pull, (this._fist.z - z) * pull);
      // Capped, so a body flung far away is reeled in rather than teleported.
      const max = 14;
      const l = out.length();
      if (l > max) out.multiplyScalar(max / l);
    };

    this._poolState = { quadSize: 8, grown: 0, tendril: 0, spin: 0, holeX: 0, holeZ: 0, holeR: 0, fade: 1, seed: 0 };
    this._handState = { dissolve: 0, seed: 0 };
    this._warpState = { width: 4, strength: 0, seed: 0 };
  }

  createParticles() {
    const particles = this.ctx.particles;

    // Dark smoke. Non-additive so it stains the air instead of lighting it.
    this.smoke = particles.get('umbra.smoke', {
      capacity: 1600,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.9
    });
    this.smoke.uniforms.uDrag.value = 1.3;
    this.smoke.uniforms.uEndSize.value = 1.9;
    this.smoke.uniforms.uSizeIn.value = 0.2;
    this.smoke.uniforms.uFadeIn.value = 0.2;
    this.smoke.uniforms.uFadeOut.value = 0.5;

    // Violet motes rising out of the ink.
    this.motes = particles.get('umbra.motes', {
      capacity: 1400,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.3
    });
    this.motes.uniforms.uDrag.value = 0.9;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uSizeIn.value = 0.1;
    this.motes.uniforms.uFadeIn.value = 0.15;
    this.motes.uniforms.uFadeOut.value = 0.45;

    // Streaks of violet rushing into the fist as it closes.
    this.streaks = particles.get('umbra.streaks', {
      capacity: 600,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.25
    });
    this.streaks.uniforms.uDrag.value = 0.2;
    this.streaks.uniforms.uEndSize.value = 0.2;
    this.streaks.uniforms.uSizeIn.value = 0.05;
    this.streaks.uniforms.uFadeIn.value = 0.05;
    this.streaks.uniforms.uFadeOut.value = 0.4;
    this.streaks.uniforms.uStretch.value = 0.12;
    this.streaks.uniforms.uGravity.value.set(0, 0, 0);
    this.streaks.uniforms.uTurbulence.value = 0;

    this.trailEmitter = new RateEmitter();
    this.smokeEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get impactDuration() {
    return Math.max(0.2, settings.umbra.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings.umbra.fadeTime * settings.global.lifetime);
  }

  /** The light gutters like something seen through smoke. */
  lightShimmer() {
    return 0.8 + 0.2 * Math.sin(this.age * 5.1) * Math.sin(this.age * 1.9 + 1.3);
  }

  /** 0..1 how far a beat has run. Seconds are × the global lifetime. */
  _beat(delay, length) {
    const g = settings.global;
    return saturate((this._clock - delay * g.lifetime) / Math.max(0.02, length * g.lifetime));
  }

  /* ------------------------------------------------------------------ */
  /* Geometry — every metre from live settings                           */
  /* ------------------------------------------------------------------ */

  get radius() {
    return Math.max(0.2, settings.umbra.zoneRadius);
  }

  get poolRadius() {
    return Math.max(0.1, this.radius * settings.umbra.poolRadius);
  }

  _floorPoint(out) {
    this.pointAt(1, out);
    out.y = 0;
    return out;
  }

  /** How far up the hand is: 0 buried, 1 risen, past 1 in the surge. */
  _rise() {
    const c = settings.umbra;
    const k = this._beat(c.riseDelay, c.riseTime);
    if (k <= 0) return 0;
    // Surges past its height and settles back, like something heavy breaching.
    const up = Easing.outCubic(saturate(k / 0.7)) * (1 + c.riseOvershoot);
    return lerp(up, 1, Easing.inOutQuad(saturate((k - 0.7) / 0.3)));
  }

  /** 0..1 how shut the fingers are. */
  _close() {
    const c = settings.umbra;
    return Easing.inOutCubic(this._beat(c.closeDelay, c.closeTime));
  }

  /** 0..1 how far the hand has been dragged under. */
  _drag() {
    const c = settings.umbra;
    return this._beat(c.dragDelay, c.dragTime);
  }

  /** The anticipation flex: peaks just before the fingers start to close. */
  _flex() {
    const c = settings.umbra;
    const g = settings.global;
    const lead = 0.28 * g.lifetime;
    const t = (this._clock - c.closeDelay * g.lifetime + lead) / lead;
    if (t <= 0) return 0;
    if (t < 1) return Easing.outQuad(t);
    return 1 - Easing.outCubic(saturate((t - 1) * lead / Math.max(0.02, c.closeTime * g.lifetime * 0.5)));
  }

  /** 0..1 how far the hand has gone to smoke. */
  _dissolve() {
    const c = settings.umbra;
    const start = saturate(c.dissolveStart);
    const k = saturate((this._drag() - start) / Math.max(0.02, 1 - start));
    const during = c.dragDissolve * Easing.inQuad(k);
    if (this._dry <= 0) return during;
    return lerp(during, 1, Easing.outQuad(saturate(this._dry / 0.6)));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.trailEmitter.reset();
    this.smokeEmitter.reset();
    this.moteEmitter.reset();
    this._releaseGrips();
    this._seed = Math.random() * 100;
    this._clock = 0;
    this._dry = 0;
    this._spin = Math.random() * TAU;
    this._seized = false;
    this._dragFired = false;
    this._stained = false;
    this._target = null;
    this._boneCount = 0;
    for (const sleeve of this._sleeves) {
      sleeve.active = false;
      sleeve.dummy = null;
    }
    this.sleeves.count = 0;
    this.sleeves.visible = false;
    this._sync(0);
  }

  /* ------------------------------------------------------------------ */
  /* The hand                                                            */
  /* ------------------------------------------------------------------ */

  /** Write one bone into the instance buffers and the CPU mirror. */
  _setBone(i, root, dir, length, r0, r1) {
    _node.position.copy(root);
    _node.quaternion.setFromUnitVectors(_up, dir);
    _node.scale.set(1, 1, 1);
    _node.updateMatrix();
    this.hand.setMatrixAt(i, _node.matrix);

    const a = this.boneAttribute.array;
    a[i * 4 + 0] = Math.max(0.005, r0);
    a[i * 4 + 1] = Math.max(0.005, r1);
    a[i * 4 + 2] = Math.max(0.01, length);
    a[i * 4 + 3] = (i * 7.31 + this._seed) % 10;

    this._boneRoot[i * 3 + 0] = root.x;
    this._boneRoot[i * 3 + 1] = root.y;
    this._boneRoot[i * 3 + 2] = root.z;
    this._boneDir[i * 3 + 0] = dir.x;
    this._boneDir[i * 3 + 1] = dir.y;
    this._boneDir[i * 3 + 2] = dir.z;
    this._boneLen[i] = length;
    this._boneRad[i] = Math.max(r0, r1);
  }

  /**
   * Lay out the whole hand from the clock and the live settings.
   *
   * The frame: `_U` up the forearm (leaning toward the caster and swaying),
   * `_F` the way the palm faces (toward the caster — the fingers come down
   * *over* the body standing between them), `_S` across the knuckles. The wrist
   * folds the hand's own frame (`_Uh`, `_Fh`) forward as it closes; every
   * finger is a chain of three angles in its own up/forward plane.
   */
  _layHand(rise, close, flex, drag) {
    const c = settings.umbra;
    const g = settings.global;
    const k = Math.max(0.05, c.handScale);
    const time = this.age;

    /* ---- where it stands ---- */
    this._floorPoint(_floor);
    _pos.copy(_floor);
    if (this._target && this._target.alive) {
      // Rise under the body, not merely in the circle.
      _pos.x = lerp(_floor.x, this._target.position.x, c.seekTarget);
      _pos.z = lerp(_floor.z, this._target.position.z, c.seekTarget);
    } else if (this._seized) {
      _pos.copy(this._handBase);
    }
    if (!this._seized) this._handBase.copy(_pos);
    else _pos.copy(this._handBase);

    // Palm stands beyond the body, so the fingers come over it.
    _W.copy(_pos).addScaledVector(this.direction, c.handBack * k);
    const buried = (c.palmLength + c.fingerLength) * k + 0.3;
    _W.y = lerp(-buried, c.wristHeight * k, rise) - c.dragDepth * k * Easing.inCubic(drag);

    /* ---- the frame ---- */
    const swayA = Math.sin(time * c.handSwayRate * TAU * 0.5 + this._seed) * c.handSway * g.randomness;
    const swayB = Math.sin(time * c.handSwayRate * TAU * 0.37 + this._seed * 2.3) * c.handSway * g.randomness;
    _F.copy(this.direction).multiplyScalar(-1);
    _S.crossVectors(_up, _F).normalize();
    _U.copy(_up)
      .addScaledVector(_F, Math.sin(c.handLean + swayA))
      .addScaledVector(_S, Math.sin(swayB))
      .normalize();
    // Re-orthogonalise the palm direction against the leaning forearm.
    _F.addScaledVector(_U, -_F.dot(_U)).normalize();
    _S.crossVectors(_U, _F).normalize();

    const wrist = c.wristCurl * close;
    _Uh.copy(_U).multiplyScalar(Math.cos(wrist)).addScaledVector(_F, Math.sin(wrist));
    _Fh.copy(_F).multiplyScalar(Math.cos(wrist)).addScaledVector(_U, -Math.sin(wrist));

    let b = 0;

    /* ---- forearm ---- */
    const foreLen = c.forearmLength * k;
    _p.copy(_W).addScaledVector(_U, -foreLen);
    this._setBone(b++, _p, _U, foreLen, c.forearmRadius * k * 1.08, c.forearmRadius * k * 0.82);

    /* ---- the fingers ---- */
    // Fingers first break the surface half-curled and unfurl as the hand rises.
    const emerge = c.emergeCurl * (1 - saturate(rise));
    const shut = Math.max(close, emerge) * c.curlAmount;
    const palmLen = c.palmLength * k;
    const palmW = c.palmWidth * k;
    const thick = c.palmThickness * k;

    for (let f = 0; f < 4; f++) {
      const x = (f - 1.5) / 1.5; // −1 index (thumb side) .. +1 little finger

      // Metacarpal: from the heel of the palm out to the knuckle.
      _M.copy(_W).addScaledVector(_S, palmW * 0.5 * x * 0.38);
      _K.copy(_W).addScaledVector(_Uh, palmLen * KNUCKLE_HEIGHT[f]).addScaledVector(_S, palmW * 0.5 * x * 0.8);
      _d.subVectors(_K, _M);
      const metaLen = _d.length();
      _d.multiplyScalar(1 / Math.max(metaLen, 1e-4));
      this._setBone(b++, _M, _d, metaLen, thick * 0.5, thick * 0.46);

      // The finger's own plane: splayed about the palm normal, closing up.
      const splay = c.fingerSpread * x * (1 - 0.8 * close);
      _u0.copy(_Uh).multiplyScalar(Math.cos(splay)).addScaledVector(_S, Math.sin(splay));

      // Joint angles: an open claw (knuckle bent back, tips hooked) toward a fist.
      const j1 = lerp(-c.openReach - c.anticipation * flex, c.curlJoint1, shut);
      const j2 = lerp(c.openReach * 0.35 + 0.12, c.curlJoint2, shut);
      const j3 = lerp(0.22, c.curlJoint3, shut);

      const length = c.fingerLength * k * FINGER_LENGTH[f];
      const r0 = c.fingerRadius * k * (f === 3 ? 0.85 : 1);
      _p.copy(_K);
      let theta = 0;
      let along = 0;
      for (let j = 0; j < 3; j++) {
        theta += j === 0 ? j1 : j === 1 ? j2 : j3;
        _d.copy(_u0).multiplyScalar(Math.cos(theta)).addScaledVector(_Fh, Math.sin(theta));
        const len = length * PHALANX[j];
        const ra = r0 * lerp(1, c.fingerTaper, along);
        along += PHALANX[j];
        const rb = r0 * lerp(1, c.fingerTaper, along);
        this._setBone(b++, _p, _d, len, ra, rb);
        _p.addScaledVector(_d, len);
      }
    }

    /* ---- the thumb ---- */
    _p.copy(_W).addScaledVector(_Uh, palmLen * 0.16).addScaledVector(_S, -palmW * 0.4).addScaledVector(_Fh, thick * 0.3);
    _open.copy(_S).multiplyScalar(-0.75).addScaledVector(_Uh, 0.55).addScaledVector(_Fh, 0.35).normalize();
    _shut.copy(_S).multiplyScalar(-0.12).addScaledVector(_Uh, 0.42).addScaledVector(_Fh, 0.9).normalize();
    _u0.lerpVectors(_open, _shut, shut).normalize();
    // The thumb bends across the palm.
    _b0.copy(_S).multiplyScalar(0.75).addScaledVector(_Fh, 0.3);
    _b0.addScaledVector(_u0, -_b0.dot(_u0)).normalize();
    const thumbLen = c.thumbLength * k;
    const tr = c.fingerRadius * k;
    const thumbSeg = [0.42, 0.32, 0.26];
    const thumbBend = [0, lerp(0.12, 0.75, shut), lerp(0.1, 0.95, shut)];
    const thumbRad = [1.55, 1.2, 1.02];
    let thumbTheta = 0;
    for (let j = 0; j < 3; j++) {
      thumbTheta += thumbBend[j];
      _d.copy(_u0).multiplyScalar(Math.cos(thumbTheta)).addScaledVector(_b0, Math.sin(thumbTheta));
      const len = thumbLen * thumbSeg[j];
      const rb = j === 2 ? tr * c.fingerTaper : tr * thumbRad[j + 1];
      this._setBone(b++, _p, _d, len, tr * thumbRad[j], rb);
      _p.addScaledVector(_d, len);
    }

    this._boneCount = b;
    this.hand.count = b;
    this.haze.count = b;
    this.hand.instanceMatrix.needsUpdate = true;
    this.boneAttribute.needsUpdate = true;

    /* ---- where a held body is kept: inside the curl ---- */
    this._fist
      .copy(_W)
      .addScaledVector(_Uh, palmLen * lerp(1.15, 0.95, close))
      .addScaledVector(_Fh, thick * 0.5 + c.fingerLength * k * 0.38 * Math.max(0.3, close));
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _sync(dt) {
    const c = settings.umbra;
    const g = settings.global;
    const travelling = this.phase === AbilityPhase.TRAVEL;
    const dry = this._dry;
    const k = Math.max(0.05, c.handScale);

    /* ---- the pool ---- */
    // In flight the pool *is* the racing puddle; afterwards it is the circle.
    if (travelling) _floor.copy(this.position).setY(0);
    else this._floorPoint(_floor);

    const poolR = this.poolRadius;
    const spread = travelling ? 0 : Easing.outCubic(this._beat(0, c.poolTime));
    const drain = Easing.inCubic(saturate(dry / Math.max(0.05, c.drainTime)));
    let grown = travelling ? c.travelPool : lerp(c.travelPool, poolR, spread);
    grown *= 1 - drain;
    // The tendrils withdraw ahead of the drain.
    const tendril = poolR * c.poolTendrilLength * (travelling ? 0.25 : spread) * (1 - saturate(drain * 1.6));
    const quad = (grown * (1 + c.poolEdgeNoise) + tendril + c.poolFeather + 0.6) * 2;

    const rise = travelling ? 0 : this._rise();
    const close = travelling ? 0 : this._close();
    const drag = travelling ? 0 : this._drag();
    const flex = travelling ? 0 : this._flex();

    if (!travelling && rise > 0) this._layHand(rise, close, flex, drag);

    const poolState = this._poolState;
    poolState.quadSize = quad;
    poolState.grown = grown;
    poolState.tendril = tendril;
    poolState.spin = this._spin;
    // The hole: where the forearm meets the surface, opening as it breaches.
    const breaching = !travelling && this._boneCount > 0 ? saturate(rise * 3) * (1 - this._dissolve()) : 0;
    poolState.holeX = this._handBase.x + this.direction.x * c.handBack * k - _floor.x;
    poolState.holeZ = this._handBase.z + this.direction.z * c.handBack * k - _floor.z;
    poolState.holeR = c.forearmRadius * k * 2.2 * breaching;
    poolState.fade = 1 - Easing.inQuad(saturate((dry - 0.75) / 0.25));
    poolState.seed = this._seed;
    this.poolMaterial.userData.sync(poolState);
    this.pool.visible = grown > 0.01 && poolState.fade > 0.004;
    this.pool.position.set(_floor.x, c.poolHeight, _floor.z);
    this.pool.scale.set(quad, 1, quad);

    /* ---- the hand ---- */
    const dissolve = travelling ? 0 : this._dissolve();
    const handState = this._handState;
    handState.dissolve = dissolve;
    handState.seed = this._seed;
    this.handMaterial.userData.sync(handState);
    this.hazeMaterial.userData.sync(handState);
    const handUp = !travelling && rise > 0.001 && dissolve < 0.999 && this._boneCount > 0;
    this.hand.visible = handUp;
    this.haze.visible = handUp;

    /* ---- the warp ---- */
    const warpState = this._warpState;
    warpState.width = Math.max(grown, 0.3) * 2 * c.warpWidth;
    warpState.strength = travelling ? 0.25 : (0.35 + 0.65 * Easing.inOutQuad(drag) + 0.3 * close) * (1 - drain);
    warpState.seed = this._seed;
    this.warpMaterial.userData.sync(warpState);
    this.warp.visible = warpState.strength > 0.004 && grown > 0.05;
    this.warp.position.set(_floor.x, c.poolHeight, _floor.z);

    /* ---- particles ---- */
    this.smoke.setGradient(getColor(c.colorSmokeA), getColor(c.colorSmokeB), getColor(c.colorSmokeC), getColor(c.colorSmokeD));
    this.smoke.uniforms.uGravity.value.set(0, c.smokeRise, 0);
    this.smoke.uniforms.uSizeScale.value = g.particleSize;
    this.smoke.uniforms.uLifeScale.value = g.particleLifetime;
    this.smoke.uniforms.uSpeedScale.value = g.particleSpeed;
    this.smoke.uniforms.uOpacity.value = c.smokeOpacity * g.opacity;
    this.smoke.uniforms.uTurbulence.value = c.smokeTurbulence * g.turbulence;

    // In flight the motes shed by the puddle take the cast's own two colours.
    if (travelling) this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorB), getColor(c.colorA), getColor(c.colorMoteD));
    else this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    this.motes.uniforms.uGravity.value.set(0, c.moteRise, 0);
    this.motes.uniforms.uSizeScale.value = g.particleSize;
    this.motes.uniforms.uLifeScale.value = g.particleLifetime;
    this.motes.uniforms.uSpeedScale.value = g.particleSpeed;
    this.motes.uniforms.uOpacity.value = g.opacity;
    this.motes.uniforms.uGlow.value = g.glow;
    this.motes.uniforms.uTurbulence.value = 0.35 * g.turbulence;

    this.streaks.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    this.streaks.uniforms.uSizeScale.value = g.particleSize;
    this.streaks.uniforms.uLifeScale.value = g.particleLifetime;
    this.streaks.uniforms.uSpeedScale.value = g.particleSpeed;
    this.streaks.uniforms.uOpacity.value = g.opacity;
    this.streaks.uniforms.uGlow.value = g.glow;
  }

  /* ------------------------------------------------------------------ */
  /* The grip                                                            */
  /* ------------------------------------------------------------------ */

  _gripOf(dummy) {
    for (let i = 0; i < this._gripCount; i++) {
      if (this._grips[i].dummy === dummy) return this._grips[i];
    }
    return null;
  }

  /** Drop slot `index`, keeping the live slots packed at the front. */
  _dropGrip(index) {
    const last = this._gripCount - 1;
    const slot = this._grips[index];
    slot.dummy?.release();
    slot.dummy = null;
    this._grips[index] = this._grips[last];
    this._grips[last] = slot;
    this._gripCount = last;
  }

  _releaseGrips() {
    for (let i = 0; i < this._gripCount; i++) {
      this._grips[i].dummy?.release();
      this._grips[i].dummy = null;
    }
    this._gripCount = 0;
  }

  /** As the hand breaches, pick the body it is rising for: the nearest one standing. */
  _chooseTarget() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    this._floorPoint(_floor);
    const found = field.findTargets(_floor.x, _floor.z, this.radius * settings.umbra.grabReach, this._found);
    this._target = found.length > 0 ? found[0] : null;
  }

  /** The fingers have shut: everything in the circle is taken. */
  _seize() {
    const field = this.ctx.dummies;
    this._seized = true;
    if (!field?.findBodies) return;
    const c = settings.umbra;
    const g = settings.global;
    this._floorPoint(_floor);
    const found = field.findBodies(_floor.x, _floor.z, this.radius * c.grabReach, this._found);

    this._force.impulse = c.holdImpulse * g.explosionIntensity;
    this._force.lift = c.holdLift * g.explosionIntensity;
    this._force.spin = c.holdSpin;

    for (const dummy of found) {
      if (this._gripCount >= MAX_GRIPS) break;
      if (this._gripOf(dummy)) continue;
      if (dummy.alive) {
        // Folded toward the fist, not thrown.
        _dir.set(this._fist.x - dummy.position.x, 0, this._fist.z - dummy.position.z);
        if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
        else _dir.normalize();
        if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      }
      // A corpse with no solver has nothing to carry.
      if (!dummy.bodyPoint(_at)) continue;
      const slot = this._grips[this._gripCount++];
      slot.dummy = dummy;
      slot.time = 0;
      slot.depth = 0;
      slot.eaten = 0;
      slot.under = false;
      slot.at.copy(_at);
      this._openSleeve(dummy, _at);
    }
  }

  /** Give a newly held body its ink sleeve (it stays down until the drag). */
  _openSleeve(dummy, at) {
    for (let i = 0; i < this._sleeves.length; i++) {
      const sleeve = this._sleeves[i];
      if (sleeve.active) continue;
      sleeve.active = true;
      sleeve.dummy = dummy;
      sleeve.x = at.x;
      sleeve.z = at.z;
      sleeve.hips = at.y;
      sleeve.eaten = 0;
      sleeve.grow = 0;
      sleeve.close = 0;
      sleeve.seed = (this._seed + i * 3.7) % 10;
      return;
    }
  }

  /**
   * The ink sleeves: each follows its body's hips, surges up round it once the
   * drag starts, and closes over the place when the body has gone. Reads the
   * grip, never writes it.
   */
  _laySleeves(dt) {
    const c = settings.umbra;
    const g = settings.global;
    const life = Math.max(0.1, g.lifetime);
    const dragging = this._drag() > 0 || this._dry > 0;
    const attr = this.sleeveAttribute.array;
    let n = 0;
    for (let i = 0; i < this._sleeves.length; i++) {
      const sleeve = this._sleeves[i];
      if (!sleeve.active) continue;
      const slot = sleeve.dummy ? this._gripOf(sleeve.dummy) : null;
      if (slot) {
        sleeve.x = slot.at.x;
        sleeve.z = slot.at.z;
        sleeve.hips = slot.at.y;
        sleeve.eaten = slot.eaten;
      } else {
        sleeve.dummy = null;
        sleeve.eaten = 1;
        if (sleeve.grow <= 0) sleeve.close = 1;
        sleeve.close = Math.min(1, sleeve.close + dt / Math.max(0.02, c.sleeveClose * life));
      }
      if (dragging) sleeve.grow = Math.min(1, sleeve.grow + dt / Math.max(0.02, c.sleeveRise * life));
      if (sleeve.close >= 1) {
        sleeve.active = false;
        continue;
      }
      if (sleeve.grow <= 0) continue;
      const surge = Easing.outCubic(sleeve.grow);
      const reach = Math.min(Math.max(c.sleeveMin, sleeve.hips + c.sleeveOverlap), Math.max(c.sleeveMin, c.sleeveReach));
      const height = reach * surge * (1 - Easing.inQuad(sleeve.close));
      const radius = c.sleeveRadius * (1 - 0.35 * sleeve.eaten) * (1 - 0.5 * sleeve.close);
      _node.position.set(sleeve.x, c.poolHeight, sleeve.z);
      _node.quaternion.identity();
      _node.scale.set(1, 1, 1);
      _node.updateMatrix();
      this.sleeves.setMatrixAt(n, _node.matrix);
      attr[n * 4 + 0] = Math.max(0.02, radius);
      attr[n * 4 + 1] = Math.max(0.05, height);
      attr[n * 4 + 2] = sleeve.seed;
      attr[n * 4 + 3] = surge * (1 - sleeve.close);
      n++;
    }
    this.sleeves.count = n;
    this.sleeves.visible = n > 0;
    if (n > 0) {
      this.sleeves.instanceMatrix.needsUpdate = true;
      this.sleeveAttribute.needsUpdate = true;
      this._sleeveState.time = this.age;
      this.sleeveMaterial.userData.sync(this._sleeveState);
    }
  }

  /** Carry every held body into the fist, and down with it. */
  _hold(dt) {
    if (dt <= 0) return;
    const c = settings.umbra;
    const drag = this._drag();

    for (let i = this._gripCount - 1; i >= 0; i--) {
      const slot = this._grips[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished || dummy.alive || !dummy.bodyPoint(_at)) {
        this._dropGrip(i);
        continue;
      }
      slot.time += dt;
      const wound = Easing.outCubic(saturate(slot.time / 0.25));
      const grab = saturate(c.gripStrength * dt) * wound;
      dummy.carry(this._field, grab, grab, saturate(c.gripBuoyancy * wound));
      slot.at.copy(_at);

      // Stained with shadow while it is held. Pushed every frame: this is also
      // what carries the live editor colours onto the body.
      dummy.corrode(saturate(slot.time * c.stain), c.look);

      // The floor opens under it in step with the fist, never ahead of it, and
      // only ever downward (see `Dummy#sink`).
      if (drag > 0) {
        const want = Math.min(c.dragDepth * c.handScale + 1, Math.max(0, -this._fist.y) + 0.9);
        slot.depth = Math.max(slot.depth, want);
        dummy.sink(slot.depth);
      }

      // Under the surface — and only once the hand is going down: eaten.
      if (drag > 0 && _at.y < 0.1) {
        if (!slot.under) {
          slot.under = true;
          this._swallowFx(_at);
        }
        slot.eaten = Math.max(slot.eaten, saturate(-_at.y / Math.max(0.05, c.consumeDepth)));
        dummy.consume(slot.eaten);
      }
      if (slot.eaten >= 1) this._dropGrip(i);
    }
  }

  /** The fade: whatever is still held is taken, wherever it got to. */
  _finish(dt) {
    for (let i = this._gripCount - 1; i >= 0; i--) {
      const slot = this._grips[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) {
        this._dropGrip(i);
        continue;
      }
      slot.eaten = Math.min(1, slot.eaten + dt * 2.5);
      dummy.consume(slot.eaten);
      if (slot.eaten >= 1) this._dropGrip(i);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  _resetEmit(time) {
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.4;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.sizeVariance = 0.5;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  /** A random point on the hand's surface, and its outward normal into `_dir`. */
  _handPoint(out) {
    const i = (Math.random() * this._boneCount) | 0;
    const t = Math.random();
    const a = Math.random() * TAU;
    const dx = this._boneDir[i * 3];
    const dy = this._boneDir[i * 3 + 1];
    const dz = this._boneDir[i * 3 + 2];
    _d.set(dx, dy, dz);
    // Any perpendicular: cross with whichever axis is least parallel.
    _b0.set(Math.abs(dy) < 0.9 ? 0 : 1, Math.abs(dy) < 0.9 ? 1 : 0, 0).cross(_d).normalize();
    _u0.crossVectors(_d, _b0);
    _dir.copy(_b0).multiplyScalar(Math.cos(a)).addScaledVector(_u0, Math.sin(a));
    const r = this._boneRad[i];
    out.set(this._boneRoot[i * 3], this._boneRoot[i * 3 + 1], this._boneRoot[i * 3 + 2])
      .addScaledVector(_d, t * this._boneLen[i])
      .addScaledVector(_dir, r);
    return out;
  }

  /** The puddle racing along the floor: smoke shed behind it. */
  _travelFx(dt) {
    const c = settings.umbra;
    const g = settings.global;
    const n = this.trailEmitter.tick(dt, c.trailRate * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _pos.copy(this.position).setY(0.15);
    _emit.position = _pos;
    _emit.radius = c.travelPool * 0.8;
    _emit.direction = _up;
    _emit.speed = c.smokeSpeed * 0.6;
    _emit.spread = 0.6;
    _emit.size = c.trailSize;
    _emit.life = c.trailLife;
    _emit.spin = 0.5;
    this.smoke.emit(n, _emit);
    _emit.size = c.moteSize;
    _emit.speed = c.moteSpeed;
    _emit.life = c.moteLifetime * 0.6;
    this.motes.emit(Math.max(1, Math.round(n * 0.3)), _emit);
  }

  /** The puddle lands: a dark ripple and a knock. */
  _landFx() {
    const c = settings.umbra;
    const g = settings.global;
    this._floorPoint(_floor);
    this.ctx.decals.spawn(DecalType.RIPPLE, _floor, {
      radius: this.poolRadius * 1.1,
      life: 0.9,
      intensity: 0.7,
      colorA: getColor(c.colorPoolRim),
      colorB: getColor(c.colorPoolInk)
    });
    this.ctx.shake.add(c.landShake * g.explosionIntensity, 5, 14);
    this.lightBoost = c.lightIntensity * 0.4;
  }

  /** The fingers shut: a pressure shell, a shockwave, a flash, streaks rushing in. */
  _gripFx() {
    const c = settings.umbra;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._floorPoint(_floor);

    this.ctx.bursts.spawn(BurstMode.AIR, this._fist, {
      radius: 0.3,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 0.9,
      opacity: 0.7,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC),
      squash: 0.8
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: this.poolRadius * 1.5,
      life: 0.55,
      width: 0.05,
      intensity: 0.8,
      colorA: getColor(c.colorPoolRim),
      colorB: getColor(c.colorBurstB)
    });
    this.ctx.flash.trigger(getColor(c.colorFlash), c.gripFlash * power);
    this.ctx.shake.add(c.gripShake * power, 4, 18);
    this.lightBoost = c.gripLight * power;

    // Streaks of violet converging on the fist: emitted on a shell, flying in.
    const n = Math.round(60 * g.particleCount);
    for (let i = 0; i < n; i += 6) {
      this._resetEmit(time);
      const a = Math.random() * TAU;
      const e = randRange(-0.3, 0.9);
      const r = randRange(1.2, 2.2) * c.handScale;
      _dir.set(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
      _pos.copy(this._fist).addScaledVector(_dir, r);
      _emit.position = _pos;
      _emit.radius = 0.15;
      _emit.direction = _dir.multiplyScalar(-1);
      _emit.speed = r / 0.32;
      _emit.speedVariance = 0.15;
      _emit.size = c.moteSize * 1.4;
      _emit.life = 0.32;
      _emit.lifeVariance = 0.15;
      this.streaks.emit(Math.min(6, n - i), _emit);
    }
  }

  /** A body going under: a gout of smoke and a ripple where it went. */
  _swallowFx(at) {
    const c = settings.umbra;
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _pos.set(at.x, 0.2, at.z);
    _emit.position = _pos;
    _emit.radius = 0.4;
    _emit.direction = _up;
    _emit.speed = c.smokeSpeed * 2;
    _emit.spread = 0.8;
    _emit.size = c.smokeSize * 1.2;
    _emit.life = c.smokeLifetime;
    _emit.spin = 0.6;
    this.smoke.emit(Math.round(14 * g.particleCount), _emit);
    this.ctx.decals.spawn(DecalType.RIPPLE, _pos.setY(0), {
      radius: 1.0,
      life: 0.7,
      intensity: 0.6,
      colorA: getColor(c.colorPoolRim),
      colorB: getColor(c.colorPoolInk)
    });
  }

  /** Everything the shadow keeps doing while it stands. */
  _holdFx(dt) {
    const c = settings.umbra;
    const g = settings.global;
    const time = frame.uTime.value;
    this._floorPoint(_floor);
    const grown = this._poolState.grown;
    const dissolve = this._dissolve();
    const handUp = this.hand.visible;

    /* smoke off the hand (more while it burns away) and the pool's rim */
    const rate = (c.smokeRate + (dissolve > 0 && dissolve < 1 ? c.dissolveSmoke : 0)) * g.particleCount;
    const smoke = this.smokeEmitter.tick(dt, grown > 0.05 ? rate : 0);
    for (let n = 0; n < smoke; n++) {
      this._resetEmit(time);
      if (handUp && Math.random() < 0.65) {
        this._handPoint(_pos);
        if (_pos.y < c.poolHeight) continue;
        _emit.direction = _dir.setY(_dir.y + 0.6).normalize();
      } else {
        const a = Math.random() * TAU;
        const r = grown * randRange(0.75, 1.05);
        _pos.set(_floor.x + Math.cos(a) * r, 0.08, _floor.z + Math.sin(a) * r);
        _emit.direction = _dir.set(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3).normalize();
      }
      _emit.position = _pos;
      _emit.radius = 0.08;
      _emit.speed = c.smokeSpeed;
      _emit.spread = 0.4;
      _emit.size = c.smokeSize * (handUp ? 0.8 : 1);
      _emit.life = c.smokeLifetime;
      _emit.spin = 0.5;
      this.smoke.emit(1, _emit);
    }

    /* violet motes rising out of the ink — and sucked back down as it drags */
    const motes = this.moteEmitter.tick(dt, grown > 0.05 ? c.moteRate * g.particleCount : 0);
    if (motes > 0) {
      const sucking = this._drag() > 0 && this._dry <= 0;
      for (let n = 0; n < motes; n += 4) {
        this._resetEmit(time);
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random()) * grown;
        if (sucking) {
          _pos.set(_floor.x + Math.cos(a) * r * 0.8, randRange(0.6, 2.0), _floor.z + Math.sin(a) * r * 0.8);
          _emit.direction = _dir.set(-Math.cos(a) * 0.3, -1, -Math.sin(a) * 0.3).normalize();
          _emit.speed = c.moteSpeed * 2.2;
        } else {
          _pos.set(_floor.x + Math.cos(a) * r, 0.05, _floor.z + Math.sin(a) * r);
          _emit.direction = _up;
          _emit.speed = c.moteSpeed;
        }
        _emit.position = _pos;
        _emit.radius = 0.1;
        _emit.spread = 0.3;
        _emit.size = c.moteSize;
        _emit.life = c.moteLifetime;
        this.motes.emit(Math.min(4, motes - n), _emit);
      }
    }
  }

  /** The pool drains: leave a dark stain behind on the floor. */
  _stainFx() {
    const c = settings.umbra;
    this._floorPoint(_floor);
    this.ctx.decals.spawn(DecalType.SCORCH, _floor, {
      radius: this.poolRadius * 1.05,
      life: c.stainLife,
      intensity: c.stainIntensity,
      colorA: getColor(c.colorStain),
      colorB: getColor(c.colorPoolDeep),
      height: 0.011
    });
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._spin += settings.umbra.poolSpin * settings.global.animationSpeed * dt * 2;
    this._sync(dt);
    this._travelFx(dt);
  }

  onImpact() {
    this._clock = 0;
    this._dry = 0;
    this._landFx();
    this._chooseTarget();
  }

  onFade(dt, t) {
    const c = settings.umbra;
    const g = settings.global;
    this._clock += dt;
    this._dry = t <= 1 ? 0 : saturate(t - 1);
    this._spin += c.poolSpin * g.animationSpeed * dt * (1 + this._drag() * 2);

    // Keep the target fresh until the fingers shut: a body that steps aside is
    // followed, one that walks in is caught.
    if (!this._seized && (!this._target || !this._target.alive)) this._chooseTarget();

    this._sync(dt);

    if (!this._seized && this._close() >= 0.85) {
      this._seize();
      this._gripFx();
    }
    if (this._seized) {
      if (this._dry <= 0) this._hold(dt);
      else this._finish(dt);
    }

    const drag = this._drag();
    if (drag > 0 && !this._dragFired) {
      this._dragFired = true;
      this.ctx.shake.add(c.dragShake * g.explosionIntensity, 3, 10);
    }
    if (drag > 0 && drag < 1) this.ctx.shake.rumble(c.dragRumble, dt);

    this._holdFx(dt);
    this._laySleeves(dt);

    if (!this._stained && this._dry >= 0.6) {
      this._stained = true;
      this._stainFx();
    }

    // The light hangs at the fist while there is one, low over the pool after.
    this._floorPoint(this.position);
    this.position.y = this.hand.visible ? Math.max(0.6, this._fist.y) : 0.8;
  }

  onDestroy() {
    this._releaseGrips();
    this._target = null;
    this._boneCount = 0;
    this.pool.visible = false;
    this.hand.visible = false;
    this.haze.visible = false;
    this.hand.count = 0;
    this.haze.count = 0;
    this.warp.visible = false;
    for (const sleeve of this._sleeves) {
      sleeve.active = false;
      sleeve.dummy = null;
    }
    this.sleeves.count = 0;
    this.sleeves.visible = false;
  }

  dispose() {
    this.groundGeometry.dispose();
    this.boneGeometry.dispose();
    this.warpGeometry.dispose();
    this.poolMaterial.dispose();
    this.handMaterial.dispose();
    this.hazeMaterial.dispose();
    this.warpMaterial.dispose();
    this.sleeveGeometry.dispose();
    this.sleeveMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('✋  Umbra Grasp');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'puddle speed (m/s)');
  R(cast, c, 'lifetime', 0.5, 8, 0.05, 'grasp lasts (s)');
  R(cast, c, 'fadeTime', 0.2, 5, 0.05, 'dissolves & drains over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 0.5, 8, 0.05, 'zone radius (m)');
  Editor.castAnimation(cast, c);
  R(cast, c, 'travelPool', 0.05, 2, 0.01, 'puddle radius (m)');
  R(cast, c, 'trailRate', 0, 400, 1, 'trail smoke / s');
  R(cast, c, 'trailSize', 0.05, 3, 0.01, 'trail size');
  R(cast, c, 'trailLife', 0.1, 4, 0.05, 'trail life (s)');
  cast.addColor(c, 'colorA').name('puddle core');
  cast.addColor(c, 'colorB').name('puddle glow');

  const beats = folder.addFolder('Beats of the grasp');
  R(beats, c, 'poolTime', 0.05, 3, 0.01, 'pool spreads over (s)');
  R(beats, c, 'riseDelay', 0, 3, 0.01, 'hand breaks surface at (s)');
  R(beats, c, 'riseTime', 0.05, 3, 0.01, 'rises over (s)');
  R(beats, c, 'riseOvershoot', 0, 0.6, 0.01, 'surge (× height)');
  R(beats, c, 'closeDelay', 0, 5, 0.01, 'fingers close at (s)');
  R(beats, c, 'closeTime', 0.05, 2, 0.01, 'close over (s)');
  R(beats, c, 'anticipation', 0, 1, 0.01, 'flex open before (rad)');
  R(beats, c, 'dragDelay', 0, 6, 0.01, 'drag under at (s)');
  R(beats, c, 'dragTime', 0.05, 3, 0.01, 'drag over (s)');
  R(beats, c, 'dragDepth', 0.5, 6, 0.05, 'sinks by (m)');
  R(beats, c, 'dissolveStart', 0, 1, 0.01, 'smokes from (× drag)');
  R(beats, c, 'dragDissolve', 0, 1, 0.01, 'gone to smoke by drag end');

  const pool = folder.addFolder('1 · Pool of living dark');
  R(pool, c, 'poolRadius', 0.2, 2.5, 0.01, 'radius (× zone)');
  R(pool, c, 'poolEdgeNoise', 0, 0.8, 0.01, 'edge raggedness');
  R(pool, c, 'poolEdgeScale', 0.2, 8, 0.05, 'edge lobes');
  R(pool, c, 'poolFeather', 0.005, 0.3, 0.001, 'edge feather (m)');
  R(pool, c, 'poolTendrils', 0, 2, 0.01, 'tendrils');
  R(pool, c, 'poolTendrilCount', 1, 32, 1, 'tendril count');
  R(pool, c, 'poolTendrilLength', 0, 2, 0.01, 'tendril reach (× radius)');
  R(pool, c, 'poolTendrilWidth', 0.01, 0.5, 0.005, 'tendril width (m)');
  R(pool, c, 'poolWrithe', 0, 3, 0.01, 'writhe');
  R(pool, c, 'poolSwirl', -3, 3, 0.01, 'swirl (rad/m)');
  R(pool, c, 'poolSwirlScale', 0.2, 6, 0.05, 'swirl scale');
  R(pool, c, 'poolSpin', -3, 3, 0.01, 'spin (rad/s)');
  R(pool, c, 'poolRim', 0, 10, 0.05, 'rim glow');
  R(pool, c, 'poolRimWidth', 0.005, 0.5, 0.005, 'rim width (m)');
  R(pool, c, 'poolVeins', 0, 4, 0.01, 'veins');
  R(pool, c, 'poolVeinScale', 0.2, 8, 0.05, 'vein scale');
  R(pool, c, 'poolDepth', 0, 1, 0.01, 'depth');
  R(pool, c, 'poolOpacity', 0, 1, 0.01, 'opacity');
  R(pool, c, 'poolHeight', 0, 0.1, 0.001, 'height (m)');
  R(pool, c, 'drainTime', 0.05, 1, 0.01, 'drains over (× fade)');
  pool.addColor(c, 'colorPoolInk').name('ink');
  pool.addColor(c, 'colorPoolDeep').name('swirl');
  pool.addColor(c, 'colorPoolRim').name('rim');
  pool.addColor(c, 'colorPoolVein').name('veins');

  const hand = folder.addFolder('2 · The hand');
  const shape = hand.addFolder('Shape');
  R(shape, c, 'handScale', 0.3, 3, 0.01, 'scale');
  R(shape, c, 'wristHeight', -0.5, 2.5, 0.01, 'wrist height (m)');
  R(shape, c, 'forearmLength', 0.5, 5, 0.05, 'forearm length (m)');
  R(shape, c, 'forearmRadius', 0.05, 1, 0.01, 'forearm radius (m)');
  R(shape, c, 'palmLength', 0.2, 2, 0.01, 'palm length (m)');
  R(shape, c, 'palmWidth', 0.2, 2, 0.01, 'palm width (m)');
  R(shape, c, 'palmThickness', 0.05, 0.8, 0.01, 'palm thickness (m)');
  R(shape, c, 'fingerLength', 0.2, 2.5, 0.01, 'finger length (m)');
  R(shape, c, 'fingerRadius', 0.02, 0.4, 0.005, 'finger radius (m)');
  R(shape, c, 'fingerTaper', 0.2, 1.2, 0.01, 'finger taper');
  R(shape, c, 'fingerSpread', 0, 0.8, 0.01, 'splay (rad)');
  R(shape, c, 'thumbLength', 0.1, 2, 0.01, 'thumb length (m)');
  const pose = hand.addFolder('Pose');
  R(pose, c, 'openReach', -0.5, 1.2, 0.01, 'open claw bend-back (rad)');
  R(pose, c, 'emergeCurl', 0, 1, 0.01, 'curled as it breaches');
  R(pose, c, 'curlAmount', 0, 1.3, 0.01, 'fist');
  R(pose, c, 'curlJoint1', 0, 2, 0.01, 'knuckle (rad)');
  R(pose, c, 'curlJoint2', 0, 2, 0.01, 'middle joint (rad)');
  R(pose, c, 'curlJoint3', 0, 2, 0.01, 'last joint (rad)');
  R(pose, c, 'wristCurl', -1, 1.5, 0.01, 'wrist folds (rad)');
  R(pose, c, 'handBack', -1, 2, 0.01, 'stands beyond target (m)');
  R(pose, c, 'handLean', -1, 1, 0.01, 'lean toward caster (rad)');
  R(pose, c, 'handSway', 0, 0.4, 0.005, 'sway (rad)');
  R(pose, c, 'handSwayRate', 0, 5, 0.05, 'sway rate');
  R(pose, c, 'seekTarget', 0, 1, 0.01, 'rises under the body');
  const look = hand.addFolder('Smoke shader');
  R(look, c, 'handOpacity', 0, 1, 0.01, 'density');
  R(look, c, 'handErode', 0, 1.2, 0.01, 'silhouette erosion');
  R(look, c, 'handErodeScale', 0.2, 8, 0.05, 'erosion scale');
  R(look, c, 'handFlow', 0, 3, 0.01, 'smoke climbs (m/s)');
  R(look, c, 'handBillow', 0, 0.3, 0.005, 'surface boil (m)');
  R(look, c, 'handSoftness', 0.02, 1, 0.01, 'solid core');
  R(look, c, 'handRim', 0, 10, 0.05, 'rim glow');
  R(look, c, 'handRimPower', 0.5, 8, 0.05, 'rim thinness');
  R(look, c, 'handInnerGlow', 0, 6, 0.05, 'inner embers');
  R(look, c, 'handVeinScale', 0.2, 10, 0.05, 'ember scale');
  R(look, c, 'hazeInflate', 0, 0.5, 0.005, 'haze shell (m)');
  R(look, c, 'hazeDensity', 0, 1.5, 0.01, 'haze density');
  R(look, c, 'hazeSoftFade', 0.01, 1, 0.01, 'haze soft fade (m)');
  R(look, c, 'handDissolveEdge', 0.01, 0.5, 0.005, 'dissolve edge');
  R(look, c, 'handEdgeGlow', 0, 12, 0.05, 'dissolve edge glow');
  look.addColor(c, 'colorHandBody').name('body');
  look.addColor(c, 'colorHandDeep').name('swirl');
  look.addColor(c, 'colorHandGlow').name('rim & embers');
  look.addColor(c, 'colorHandEdge').name('dissolve edge');

  const grip = folder.addFolder('3 · The grip');
  R(grip, c, 'grabReach', 0.2, 2, 0.01, 'reach (× zone)');
  R(grip, c, 'gripPull', 0, 30, 0.1, 'haul (1/s)');
  R(grip, c, 'gripStrength', 0, 30, 0.1, 'hold');
  R(grip, c, 'gripBuoyancy', 0, 1, 0.01, 'carries its weight');
  R(grip, c, 'consumeDepth', 0.05, 3, 0.01, 'gone at depth (m)');
  R(grip, c, 'stain', 0, 10, 0.05, 'stain / s');
  R(grip, c, 'holdImpulse', 0, 10, 0.05, 'seized impulse');
  R(grip, c, 'holdLift', 0, 10, 0.05, 'seized lift');
  R(grip, c, 'holdSpin', 0, 4, 0.01, 'seized torque');
  grip.addColor(c.look, 'color').name('flesh');
  grip.addColor(c.look, 'rimColor').name('rim');
  R(grip, c.look, 'rimEmissive', 0, 6, 0.05, 'rim emissive');
  grip.addColor(c.look, 'edgeColor').name('burn edge');
  R(grip, c.look, 'edgeEmissive', 0, 10, 0.05, 'edge emissive');
  R(grip, c.look, 'edgeWidth', 0.005, 0.3, 0.001, 'edge width');

  const sleeve = folder.addFolder('4b · Ink sleeves (the drag-under)');
  R(sleeve, c, 'sleeveRadius', 0.05, 1.5, 0.01, 'throat radius (m)');
  R(sleeve, c, 'sleeveFlare', 0, 4, 0.01, 'base flare (× radius)');
  R(sleeve, c, 'sleeveReach', 0.1, 4, 0.01, 'climbs at most (m)');
  R(sleeve, c, 'sleeveMin', 0.05, 2, 0.01, 'collar height (m)');
  R(sleeve, c, 'sleeveOverlap', -1, 2, 0.01, 'climbs past hips (m)');
  R(sleeve, c, 'sleeveRise', 0.02, 2, 0.01, 'surges up over (s)');
  R(sleeve, c, 'sleeveClose', 0.02, 3, 0.01, 'closes over (s)');
  R(sleeve, c, 'sleeveRagged', 0, 0.9, 0.01, 'ragged top');
  R(sleeve, c, 'sleeveTendrils', 1, 16, 1, 'tongues');
  R(sleeve, c, 'sleeveWrithe', 0, 1.5, 0.01, 'writhe');
  R(sleeve, c, 'sleeveFlow', 0, 4, 0.01, 'ink pours (speed)');
  R(sleeve, c, 'sleeveRim', 0, 8, 0.05, 'rim glow');
  R(sleeve, c, 'sleeveLip', 0, 8, 0.05, 'lip glow');
  sleeve.addColor(c, 'colorSleeveInk').name('ink');
  sleeve.addColor(c, 'colorSleeveDeep').name('swirl');
  sleeve.addColor(c, 'colorSleeveRim').name('rim & lip');

  const fx = folder.addFolder('4 · Smoke & motes');
  R(fx, c, 'smokeRate', 0, 300, 1, 'smoke / s');
  R(fx, c, 'smokeSize', 0.05, 4, 0.01, 'smoke size');
  R(fx, c, 'smokeLifetime', 0.1, 5, 0.05, 'smoke life (s)');
  R(fx, c, 'smokeRise', -1, 3, 0.01, 'smoke rise');
  R(fx, c, 'smokeSpeed', 0, 4, 0.01, 'smoke speed');
  R(fx, c, 'smokeOpacity', 0, 1, 0.01, 'smoke opacity');
  R(fx, c, 'smokeTurbulence', 0, 3, 0.01, 'smoke turbulence');
  R(fx, c, 'dissolveSmoke', 0, 600, 1, 'dissolve smoke / s');
  Editor.gradient(fx, c, 'colorSmoke', 'smoke colour');
  R(fx, c, 'moteRate', 0, 300, 1, 'motes / s');
  R(fx, c, 'moteSize', 0.01, 0.5, 0.005, 'mote size');
  R(fx, c, 'moteLifetime', 0.1, 4, 0.05, 'mote life (s)');
  R(fx, c, 'moteSpeed', 0, 5, 0.01, 'mote speed');
  R(fx, c, 'moteRise', -2, 4, 0.01, 'mote rise');
  Editor.gradient(fx, c, 'colorMote', 'mote colour');

  const warp = folder.addFolder('5 · Sinking warp');
  R(warp, c, 'warpStrength', 0, 4, 0.01, 'strength');
  R(warp, c, 'warpScale', 0.1, 6, 0.05, 'scale');
  R(warp, c, 'warpSpeed', 0, 4, 0.01, 'pour speed');
  R(warp, c, 'warpSink', 0, 3, 0.01, 'downward share');
  R(warp, c, 'warpHeight', 0.5, 10, 0.05, 'height (m)');
  R(warp, c, 'warpWidth', 0.2, 3, 0.01, 'width (× pool)');

  const beatsFx = folder.addFolder('6 · Beats');
  R(beatsFx, c, 'landShake', 0, 1, 0.01, 'land shake');
  R(beatsFx, c, 'gripShake', 0, 2, 0.01, 'grip shake');
  R(beatsFx, c, 'dragShake', 0, 2, 0.01, 'drag shake');
  R(beatsFx, c, 'dragRumble', 0, 2, 0.01, 'drag rumble');
  R(beatsFx, c, 'gripFlash', 0, 2, 0.01, 'grip flash');
  beatsFx.addColor(c, 'colorFlash').name('flash');
  R(beatsFx, c, 'burstRadius', 0.2, 8, 0.05, 'burst radius (m)');
  R(beatsFx, c, 'burstLife', 0.1, 2, 0.01, 'burst life (s)');
  beatsFx.addColor(c, 'colorBurstA').name('burst A');
  beatsFx.addColor(c, 'colorBurstB').name('burst B');
  beatsFx.addColor(c, 'colorBurstC').name('burst C');
  R(beatsFx, c, 'stainLife', 0.5, 30, 0.1, 'stain lingers (s)');
  R(beatsFx, c, 'stainIntensity', 0, 1.5, 0.01, 'stain strength');
  beatsFx.addColor(c, 'colorStain').name('stain');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 30, 0.1, 'radius');
  R(light, c, 'gripLight', 0, 40, 0.1, 'grip punch');

  folder.close();
  return folder;
}
