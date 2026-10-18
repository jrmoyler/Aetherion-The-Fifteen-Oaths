import {
  CapsuleGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  Vector3
} from 'three';
import { Ability } from '../Ability.js';
import { createStripGeometry, createQuadGeometry } from '../../assets/codex/SecondSelfGeometry.js';
import {
  createFigureMaterial,
  createRunMaterial,
  createBraidMaterial,
  createWakeMaterial
} from '../../materials/codex/SecondSelfMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'secondself';

const TAU = Math.PI * 2;
/** Capsules per figure: torso, shoulders, head, hips, two arms ×2, two legs ×2, two feet. */
const SEGS = 14;
/** The double and up to three afterimages behind it. */
const MAX_ECHOES = 3;
const FIGURES = MAX_ECHOES + 1;
/** The capsule geometry's cylinder runs y ∈ [−HALF, HALF]. */
const HALF = 0.5;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _root = new Vector3();
const _f = new Vector3();
const _s = new Vector3();
const _torso = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _up = new Vector3(0, 1, 0);
const _force = { impulse: 0, lift: 0, spin: 0 };
const _targets = [];

/**
 * The joints of one pose, reused. Named so the pose reads like anatomy.
 * Indices into `_J`.
 */
const J = {
  pelvis: 0, chest: 1, neck: 2, head: 3, shL: 4, shR: 5, hipL: 6, hipR: 7,
  elbowL: 8, elbowR: 9, handL: 10, handR: 11, kneeL: 12, kneeR: 13,
  footL: 14, footR: 15, toeL: 16, toeR: 17
};
const _J = [];
for (let i = 0; i < 18; i++) _J.push(new Vector3());

/** [joint A, joint B, radius at figure height 1.85 m] per capsule. */
const BONES = [
  [J.pelvis, J.chest, 0.15],
  [J.shL, J.shR, 0.075],
  [J.neck, J.head, 0.115],
  [J.hipL, J.hipR, 0.105],
  [J.shL, J.elbowL, 0.062],
  [J.shR, J.elbowR, 0.062],
  [J.elbowL, J.handL, 0.05],
  [J.elbowR, J.handR, 0.05],
  [J.hipL, J.kneeL, 0.088],
  [J.hipR, J.kneeR, 0.088],
  [J.kneeL, J.footL, 0.066],
  [J.kneeR, J.footR, 0.066],
  [J.footL, J.toeL, 0.046],
  [J.footR, J.toeR, 0.046]
];

function syncSystem(p, c, prefix, glow, turb) {
  const g = settings.global;
  p.setGradient(getColor(c[`${prefix}A`]), getColor(c[`${prefix}B`]), getColor(c[`${prefix}C`]), getColor(c[`${prefix}D`]));
  p.uniforms.uSizeScale.value = g.particleSize;
  p.uniforms.uLifeScale.value = g.particleLifetime;
  p.uniforms.uSpeedScale.value = g.particleSpeed;
  p.uniforms.uOpacity.value = g.opacity;
  p.uniforms.uGlow.value = glow * g.glow;
  p.uniforms.uTurbulence.value = turb * g.turbulence;
}

/**
 * SECOND SELF — Time, line cast.
 *
 * A golden double of the caster **peels out of them** — a translucent figure
 * of light, a step to one side — and runs the line. But it runs *late*: a
 * heartbeat ahead of it, a gold thread races down the floor and lays down the
 * footprints it is going to step in, glowing; bodies the heartbeat passes are
 * marked gold. A beat later the double arrives and lands in every one of them
 * — each print flaring white as the foot comes down — weaving across the line
 * with two ribbons of light **braided** round its path behind it and a trail
 * of afterimages, each an instant older and more forgotten than the last.
 * Whatever was marked, it runs straight through. At the end it plants, the
 * afterimages catch up and fold into it, and it goes up in one last heartbeat
 * — lub, dub — two shock rings, a gold shell, and everything near thrown.
 *
 * The caster is never moved. The double is not a copy of the rig either: it
 * is a procedural mannequin of fourteen capsules posed by a run cycle in code,
 * so it reads as *a person made of time* rather than as the hero's mesh.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the figure** (`createFigureMaterial`) — instanced swept capsules,
 *      one per limb, for the double and up to three afterimages. Additive
 *      hollow light: a gold fresnel rim, a dim core, falling time-bands, the
 *      heartbeat in its glow, afterimages eaten by noise.
 *   2. **the run** (`createRunMaterial`) — the floor: the heartbeat's gold
 *      thread and the footprints, analytic off the same path the double runs.
 *   3. **the braid** (`createBraidMaterial`) — two camera-facing ribbons
 *      twisting round the path behind the double.
 *   4. **particles** — gold motes shed off the figure (they barely drift:
 *      spent time), dust off each footfall (SMOKE), a RING off its chest on
 *      every heartbeat, STREAK sparks on the finale.
 *   5. **the wake** — `LAYER.DISTORTION`: ripples running off the double in
 *      time with its heart, and the finale's shock ring.
 *   6. **the finale** — two SHOCKWAVEs a heartbeat apart, an AIR shell, flash,
 *      shake, a light punch; the figure rises and burns away.
 *   7. **the hit** — `handlesOwnHits`. Marked by the heartbeat, struck by the
 *      double as it runs through; the last heartbeat throws what is near.
 *
 * ## The editor rule
 *
 * Nothing is baked but a seed. The pose is a pure function of how far along
 * the path a figure is, so the gait, proportions and path sliders all move a
 * double already running. The path itself is shared, as a function, between
 * the CPU (`_pathLat`) and the floor and braid shaders (`PATH_GLSL`).
 */
export class SecondSelfAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Figures drawn. HUD readout only. */
  get instanceCount() {
    return this._figures;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- 1: the figure — swept capsules, instanced ---- */
    const capsule = new CapsuleGeometry(1, HALF * 2, 5, 12, 1);
    const geo = new InstancedBufferGeometry();
    geo.setIndex(capsule.getIndex());
    geo.setAttribute('position', capsule.getAttribute('position'));
    geo.setAttribute('normal', capsule.getAttribute('normal'));
    const n = FIGURES * SEGS;
    this._aA = new InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(DynamicDrawUsage);
    this._aB = new InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(DynamicDrawUsage);
    this._aR = new InstancedBufferAttribute(new Float32Array(n), 1).setUsage(DynamicDrawUsage);
    this._aFade = new InstancedBufferAttribute(new Float32Array(n), 1).setUsage(DynamicDrawUsage);
    const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) seeds[i] = Math.floor(i / SEGS) * 7.31 + (i % SEGS) * 0.37;
    geo.setAttribute('aA', this._aA);
    geo.setAttribute('aB', this._aB);
    geo.setAttribute('aR', this._aR);
    geo.setAttribute('aFade', this._aFade);
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
    geo.instanceCount = n;
    this.figureGeometry = geo;
    this._capsule = capsule;
    this.figureMaterial = createFigureMaterial(HALF);
    this.figure = this._mesh(geo, this.figureMaterial, LAYER.VFX, 14);

    /* ---- 2: the run on the floor ---- */
    this.stripGeometry = createStripGeometry(220, 10);
    this.runMaterial = createRunMaterial();
    this.run = this._mesh(this.stripGeometry, this.runMaterial, LAYER.VFX, 2);

    /* ---- 3: the braid ---- */
    this.ribbonGeometry = createStripGeometry(160, 1);
    this.braidMaterials = [createBraidMaterial(), createBraidMaterial()];
    this.braids = this.braidMaterials.map((m) => this._mesh(this.ribbonGeometry, m, LAYER.VFX, 12));

    /* ---- 5: the wake ---- */
    this.quadGeometry = createQuadGeometry();
    this.wakeMaterial = createWakeMaterial();
    this.wake = this._mesh(this.quadGeometry, this.wakeMaterial, LAYER.DISTORTION, 0);

    this._path = { origin: new Vector3(), dir: new Vector3(), side: new Vector3(), length: 1 };
    this._runState = { origin: null, dir: null, side: null, length: 1, front: 0, double: 0, speed: 10, beat: 0, fade: 1, seed: 0 };
    this._braidState = { origin: null, dir: null, side: null, length: 1, head: 0, phase: 0, beat: 0, fade: 1, seed: 0 };
    this._wakeState = { center: new Vector3(), size: 1.6, ripple: 0, shock: 0, beat: 0 };
    this._figureState = { beat: 0, flare: 0 };
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0.05 };

    this._chest = new Vector3();
    this._fwd = new Vector3(0, 0, 1);
    this._end = new Vector3();
    this._front = new Vector3();

    this._seed = 0;
    this._raw = 0;
    this._along = 0;
    this._arrived = false;
    this._finaleT = 0;
    this._lub = false;
    this._dub = false;
    this._beat = 0;
    this._beatIndex = -1;
    this._stepIndex = 0;
    this._figures = 0;
    this._shockT = -1;
    this._fadeK = 0;
  }

  _mesh(geometry, material, layer, order) {
    const mesh = new Mesh(geometry, material);
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.motes = particles.get('secondself.motes', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.25
    });
    this.motes.uniforms.uSizeIn.value = 0.15;
    this.motes.uniforms.uFadeIn.value = 0.12;
    this.motes.uniforms.uFadeOut.value = 0.55;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uDrag.value = 3.2;
    this.motes.uniforms.uTurbFrequency.value = 0.8;
    this.motes.uniforms.uTurbSpeed.value = 0.3;

    this.dust = particles.get('secondself.dust', {
      capacity: 400,
      shape: ParticleShape.SMOKE,
      additive: false,
      softFade: 0.8
    });
    this.dust.uniforms.uSizeIn.value = 0.2;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.6;
    this.dust.uniforms.uEndSize.value = 2.2;
    this.dust.uniforms.uDrag.value = 2.5;

    this.rings = particles.get('secondself.rings', {
      capacity: 64,
      shape: ParticleShape.RING,
      additive: true,
      softFade: 0.2
    });
    this.rings.uniforms.uSizeIn.value = 0.02;
    this.rings.uniforms.uFadeIn.value = 0.02;
    this.rings.uniforms.uFadeOut.value = 0.7;
    this.rings.uniforms.uEndSize.value = 2.2;
    this.rings.uniforms.uDrag.value = 0;

    this.sparks = particles.get('secondself.sparks', {
      capacity: 700,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.5;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uDrag.value = 1.4;

    this.moteEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the double catching up, then the finale. */
  get impactDuration() {
    const c = settings[ID];
    return Math.max(0.1, c.lag + c.finaleTime * settings.global.lifetime + 0.05);
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  /** The light beats with the heart. */
  lightShimmer() {
    return 1 - settings[ID].lightFlicker * (1 - saturate(this._beat));
  }

  /* ------------------------------------------------------------------ */
  /* The path and the pose                                               */
  /* ------------------------------------------------------------------ */

  /** Lateral offset of the run at `a` metres along. CPU twin of `pathLat` (PATH_GLSL). */
  _pathLat(a) {
    const c = settings[ID];
    const L = this.length;
    const env = smoothstep(0, 1.6, a) * (1 - smoothstep(L - 1.4, L, a));
    const stepOut = c.stepOut * (1 - smoothstep(0, 1.6, a));
    return c.braidWidth * settings.global.randomness * Math.sin((TAU * a) / Math.max(c.braidPitch, 0.1)) * env + stepOut;
  }

  _pathPoint(a, out) {
    return out.copy(this.origin).addScaledVector(this.direction, a).addScaledVector(this.side, this._pathLat(a));
  }

  /** The heartbeat: a sharp lub and a softer dub, `bpm` times a minute. */
  _beatAt(t) {
    const c = settings[ID];
    const T = 60 / Math.max(10, c.bpm);
    const x = t - Math.floor(t / T) * T;
    const lub = Math.exp(-x * 16);
    const y = x - c.dubDelay;
    const dub = y >= 0 ? c.dubShare * Math.exp(-y * 16) : 0;
    return lub + dub;
  }

  /**
   * Pose one figure at `along` metres down its path into `_J`.
   *
   * A run cycle in code: the phase is the distance run over the stride, so
   * the feet land where the floor shader drew the footprints. `run` 0..1
   * blends from standing to running; `rise` lifts the whole figure.
   */
  _pose(along, run, rise, lateral) {
    const c = settings[ID];
    const s = c.figureHeight / 1.85;
    this._pathPoint(along, _root);
    _root.addScaledVector(this.side, lateral);
    this._pathPoint(along + 0.05, _a);
    this._pathPoint(Math.max(0, along - 0.05), _b);
    _f.subVectors(_a, _b).setY(0);
    if (_f.lengthSq() < 1e-6) _f.copy(this.direction);
    _f.normalize();
    _s.crossVectors(_f, _up).normalize();

    const phase = (along / Math.max(0.2, c.stride * s)) * TAU;
    const lean = c.lean * run;
    _torso.copy(_up).multiplyScalar(Math.cos(lean)).addScaledVector(_f, Math.sin(lean));

    const P = _J[J.pelvis].copy(_root).addScaledVector(_up, (0.98 + c.bob * run * Math.cos(phase * 2)) * s);
    _J[J.chest].copy(P).addScaledVector(_torso, 0.5 * s);
    _J[J.neck].copy(P).addScaledVector(_torso, 0.64 * s);
    _J[J.head].copy(P).addScaledVector(_torso, 0.8 * s);
    _J[J.shL].copy(_J[J.chest]).addScaledVector(_s, 0.2 * s).addScaledVector(_torso, 0.05 * s);
    _J[J.shR].copy(_J[J.chest]).addScaledVector(_s, -0.2 * s).addScaledVector(_torso, 0.05 * s);
    _J[J.hipL].copy(P).addScaledVector(_s, 0.1 * s);
    _J[J.hipR].copy(P).addScaledVector(_s, -0.1 * s);

    for (let side = 0; side < 2; side++) {
      const ph = phase + side * Math.PI;
      const hip = _J[side ? J.hipR : J.hipL];
      // The thigh swings; the knee folds as the leg comes through.
      const th = c.legSwing * run * Math.sin(ph);
      const kb = c.kneeBend * run * (0.12 + 0.88 * Math.max(0, Math.cos(ph))) + 0.06;
      const knee = _J[side ? J.kneeR : J.kneeL].copy(hip)
        .addScaledVector(_up, -Math.cos(th) * 0.46 * s)
        .addScaledVector(_f, Math.sin(th) * 0.46 * s);
      const sh = th - kb;
      const foot = _J[side ? J.footR : J.footL].copy(knee)
        .addScaledVector(_up, -Math.cos(sh) * 0.45 * s)
        .addScaledVector(_f, Math.sin(sh) * 0.45 * s);
      _J[side ? J.toeR : J.toeL].copy(foot).addScaledVector(_f, 0.17 * s).addScaledVector(_up, -0.02 * s);

      // The arm on this side swings with the *other* leg.
      const shoulder = _J[side ? J.shR : J.shL];
      const al = c.armSwing * run * Math.sin(ph + Math.PI);
      const sideSign = side ? -1 : 1;
      const elbow = _J[side ? J.elbowR : J.elbowL].copy(shoulder)
        .addScaledVector(_up, -Math.cos(al) * 0.29 * s)
        .addScaledVector(_f, Math.sin(al) * 0.29 * s)
        .addScaledVector(_s, sideSign * 0.04 * s);
      const be = al + c.elbowBend * (0.35 + 0.65 * run);
      _J[side ? J.handR : J.handL].copy(elbow)
        .addScaledVector(_up, -Math.cos(be) * 0.27 * s)
        .addScaledVector(_f, Math.sin(be) * 0.27 * s);
    }

    // Plant the lower foot on the floor: the whole figure rides on it.
    const low = Math.min(_J[J.footL].y, _J[J.footR].y, _J[J.toeL].y, _J[J.toeR].y);
    const lift = 0.05 * s - low + rise;
    for (let i = 0; i < _J.length; i++) _J[i].y += lift;
  }

  /** Write the posed `_J` into figure slot `fig` with opacity `fade`. */
  _writeFigure(fig, fade, swell) {
    const c = settings[ID];
    const s = (c.figureHeight / 1.85) * c.figureBulk * swell;
    const A = this._aA.array;
    const B = this._aB.array;
    const R = this._aR.array;
    const F = this._aFade.array;
    for (let i = 0; i < SEGS; i++) {
      const k = fig * SEGS + i;
      const bone = BONES[i];
      const ja = _J[bone[0]];
      const jb = _J[bone[1]];
      A[k * 3] = ja.x; A[k * 3 + 1] = ja.y; A[k * 3 + 2] = ja.z;
      B[k * 3] = jb.x; B[k * 3 + 1] = jb.y; B[k * 3 + 2] = jb.z;
      R[k] = bone[2] * s;
      F[k] = fade;
    }
  }

  _hideFigure(fig) {
    const F = this._aFade.array;
    for (let i = 0; i < SEGS; i++) F[fig * SEGS + i] = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.moteEmitter.reset();
    this._seed = Math.random() * 100;
    this._raw = 0;
    this._along = 0;
    this._arrived = false;
    this._finaleT = 0;
    this._lub = false;
    this._dub = false;
    this._beat = 0;
    this._beatIndex = -1;
    this._stepIndex = 0;
    this._shockT = -1;
    this._fadeK = 0;

    const p = this._path;
    p.origin.copy(this.origin);
    p.dir.copy(this.direction);
    p.side.copy(this.side);
    p.length = this.length;
    for (const st of [this._runState, this._braidState]) {
      st.origin = p.origin;
      st.dir = p.dir;
      st.side = p.side;
      st.length = p.length;
      st.seed = this._seed;
    }
    this.pointAt(1, this._end);

    for (let f = 0; f < FIGURES; f++) this._hideFigure(f);
    this.figure.visible = true;
    this.run.visible = true;
    this.braids[0].visible = true;
    this.braids[1].visible = true;
    this.wake.visible = true;
    this._update(0);
  }

  _resetEmit() {
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.35;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.45;
    _emit.life = 1;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
  }

  onTravel(dt) {
    this._update(dt);
  }

  onImpact() {
    // The heartbeat has reached the end. The double is still a beat behind.
  }

  onFade(dt, t) {
    this._fadeK = t > 1 ? saturate(t - 1) : 0;
    this._update(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The frame                                                           */
  /* ------------------------------------------------------------------ */

  _update(dt) {
    const c = settings[ID];
    const g = settings.global;
    const speed = c.speed * g.speed;
    const L = this.length;

    /* the heart */
    this._beat = this._beatAt(this.age);
    const T = 60 / Math.max(10, c.bpm);
    const beatIndex = Math.floor(this.age / T);

    /* the double runs `lag` seconds behind the heartbeat */
    if (this.age > c.lag && dt > 0) this._raw += speed * dt;
    const prevAlong = this._along;
    this._along = Math.min(L, this._raw);
    if (!this._arrived && this._raw >= L) {
      this._arrived = true;
      this._finaleT = 0;
    }
    if (this._arrived) this._finaleT += dt;

    /* how the double looks right now */
    const emerge = Easing.outCubic(saturate(this.age / Math.max(0.02, c.emergeTime)));
    const finaleLen = Math.max(0.05, c.finaleTime * g.lifetime);
    const fk = this._arrived ? saturate(this._finaleT / finaleLen) : 0;
    const plant = this._arrived ? 1 - smoothstep(0, 0.15, this._finaleT) : 1;
    const run = smoothstep(0, 0.8, this._along) * plant;
    const dissolve = smoothstep(0.35, 1, fk);
    const fade = emerge * (1 - dissolve) * (1 - this._fadeK);
    const rise = c.finaleRise * Easing.inQuad(fk);
    const flare = this._arrived ? Math.exp(-this._finaleT * 6) + smoothstep(0.2, 1, fk) : 0;

    // At the start it is still inside the caster, sliding out to the side.
    const emergeLat = -c.stepOut * (1 - emerge);
    this._pose(this._along, run, rise, emergeLat);
    this._writeFigure(0, fade, 1 + 0.25 * fk);
    this._chest.copy(_J[J.chest]);
    this._fwd.copy(_f);
    this._figures = fade > 0.01 ? 1 : 0;

    /* the afterimages: the same figure, earlier — they catch up once it stops */
    const echoes = Math.min(MAX_ECHOES, Math.max(0, Math.round(c.echoes)));
    for (let e = 1; e <= MAX_ECHOES; e++) {
      const raw = this._raw - speed * c.echoGap * e;
      if (e > echoes || raw <= 0.05) {
        this._hideFigure(e);
        continue;
      }
      const a = Math.min(L, raw);
      const caught = raw >= L ? 1 - smoothstep(0, 0.2, raw - L) : 1;
      const ef = Math.pow(saturate(c.echoFade), e) * smoothstep(0.05, 0.6, raw) * caught * fade;
      const er = smoothstep(0, 0.8, a) * (raw >= L ? 0 : 1);
      this._pose(a, er, rise * 0.8, 0);
      this._writeFigure(e, ef, 1);
      if (ef > 0.01) this._figures++;
    }
    this._aA.needsUpdate = true;
    this._aB.needsUpdate = true;
    this._aR.needsUpdate = true;
    this._aFade.needsUpdate = true;

    /* materials */
    const fs = this._figureState;
    fs.beat = this._beat;
    fs.flare = flare;
    this.figureMaterial.userData.sync(fs);

    const front = Math.min(L, this.front);
    const rs = this._runState;
    rs.length = L;
    rs.front = this.front >= L ? L + 2 : front;
    rs.double = this._raw > 0 ? this._along : -10;
    rs.speed = speed;
    rs.beat = this._beat;
    rs.fade = 1 - smoothstep(0.3, 1, this._fadeK);
    this.runMaterial.userData.sync(rs);

    const bs = this._braidState;
    bs.length = L;
    bs.head = this._along;
    bs.beat = this._beat;
    bs.fade = saturate(this._raw / 1.5) * (1 - smoothstep(0.1, 0.8, fk + this._fadeK));
    const strands = Math.max(1, Math.min(2, Math.round(c.braidStrands)));
    for (let i = 0; i < 2; i++) {
      bs.phase = i * Math.PI;
      this.braidMaterials[i].userData.sync(bs);
      this.braids[i].visible = i < strands && bs.fade > 0.01;
    }

    const ws = this._wakeState;
    if (this._shockT >= 0) {
      this._shockT += dt;
      ws.center.copy(this._end).setY(1);
      ws.size = c.finaleRadius * 0.9;
      ws.shock = saturate(this._shockT / 0.5);
      ws.ripple = 0;
      if (ws.shock >= 1) this._shockT = -1;
    } else {
      ws.center.copy(this._chest);
      ws.size = 1.4 * (c.figureHeight / 1.85);
      ws.shock = 0;
      ws.ripple = fade * (0.3 + 0.7 * run);
    }
    ws.beat = this._beat;
    this.wakeMaterial.userData.sync(ws);
    this.wake.visible = ws.ripple > 0.01 || ws.shock > 0;

    syncSystem(this.motes, c, 'colorMote', c.moteGlow, 0.5);
    this.motes.uniforms.uGravity.value.set(0, 0.15, 0);
    syncSystem(this.dust, c, 'colorDust', 1, 0.5);
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    this.dust.uniforms.uGravity.value.set(0, 0.3, 0);
    syncSystem(this.rings, c, 'colorRing', c.ringGlow, 0);
    this.rings.uniforms.uGravity.value.set(0, 0, 0);
    syncSystem(this.sparks, c, 'colorSpark', c.sparkGlow, 0.2);
    this.sparks.uniforms.uGravity.value.set(0, -9, 0);
    this.sparks.uniforms.uStretch.value = 0.4;

    if (dt <= 0) {
      this.position.copy(this._chest);
      return;
    }

    /* effects off the double */
    if (fade > 0.05) {
      this._moteFx(dt, fade);
      if (beatIndex !== this._beatIndex && !this._arrived) this._ringFx(fade);
      this._footfall(prevAlong, run);
    }
    this._beatIndex = beatIndex;

    /* the heartbeat marks; the double strikes */
    this._mark(front);
    if (!this._arrived && this._raw > 0.3) this._strike(c.hitRadius, c.hitImpulse, c.hitLift, false);

    /* the finale: lub, then dub */
    if (this._arrived && !this._lub) {
      this._lub = true;
      this._finaleLub();
    }
    if (this._arrived && !this._dub && this._finaleT >= c.dubDelay) {
      this._dub = true;
      this._finaleDub();
    }

    this.position.copy(this._chest);
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  _moteFx(dt, fade) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * fade) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit();
    _emit.size = c.moteSize;
    _emit.life = c.moteLife;
    _emit.speed = c.moteSpeed;
    _emit.spread = 1;
    _emit.direction = _up;
    const A = this._aA.array;
    const B = this._aB.array;
    const R = this._aR.array;
    for (let i = 0; i < n; i++) {
      const k = Math.floor(Math.random() * SEGS);
      const t = Math.random();
      _pos.set(
        lerp(A[k * 3], B[k * 3], t),
        lerp(A[k * 3 + 1], B[k * 3 + 1], t),
        lerp(A[k * 3 + 2], B[k * 3 + 2], t)
      );
      _emit.position = _pos;
      _emit.radius = R[k];
      this.motes.emit(1, _emit);
    }
  }

  /** A ring of light off the chest on every lub. */
  _ringFx(fade) {
    const c = settings[ID];
    this._resetEmit();
    _emit.position = this._chest;
    _emit.size = c.ringSize * (c.figureHeight / 1.85);
    _emit.sizeVariance = 0;
    _emit.life = c.ringLife;
    _emit.lifeVariance = 0;
    _emit.speed = 0;
    this.rings.emit(1, _emit);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.5 * fade);
  }

  /** Dust off every foot that lands. */
  _footfall(prevAlong, run) {
    const c = settings[ID];
    const g = settings.global;
    const step = Math.max(0.1, c.stride * 0.5 * (c.figureHeight / 1.85));
    const index = Math.floor(this._along / step);
    if (index === this._stepIndex) return;
    this._stepIndex = index;
    if (run < 0.3 || this._along <= prevAlong) return;
    const foot = _J[J.footL].y < _J[J.footR].y ? _J[J.footL] : _J[J.footR];
    this._resetEmit();
    _pos.copy(foot).setY(0.05);
    _emit.position = _pos;
    _emit.anchor = _pos;
    _emit.radius = 0.12;
    _emit.direction = _up;
    _emit.speed = 0.8;
    _emit.spread = 1.3;
    _emit.size = c.dustSize;
    _emit.life = c.dustLife;
    _emit.spin = 0.4;
    this.dust.emit(Math.round(c.stepDust * g.particleCount), _emit);
    _emit.size = c.moteSize * 1.2;
    _emit.life = c.moteLife * 0.6;
    _emit.speed = c.moteSpeed * 3;
    this.motes.emit(Math.round(6 * g.particleCount), _emit);
  }

  /** Bodies the heartbeat passes are marked gold, a beat before they are struck. */
  _mark(front) {
    const field = this.ctx.dummies;
    if (!field?.findTargets || this.front > this.length + 0.01) return;
    const c = settings[ID];
    this._pathPoint(front, this._front);
    const found = field.findTargets(this._front.x, this._front.z, c.hitRadius + 0.4, _targets);
    const look = this._look;
    look.color = c.colorMark;
    look.rimColor = c.colorMark;
    look.rimEmissive = 2.5 * c.markGlow;
    look.edgeColor = c.colorMark;
    look.edgeEmissive = 3 * c.markGlow;
    look.edgeWidth = 0.06;
    for (let i = 0; i < found.length; i++) found[i].corrode(c.markGlow, look);
    _targets.length = 0;
  }

  /** Knock down whatever is within `radius` of the double. */
  _strike(radius, impulse, lift, outward) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const at = outward ? this._end : _root.copy(this._chest).setY(0);
    const found = field.findTargets(at.x, at.z, radius, _targets);
    if (found.length === 0) return;
    const power = g.explosionIntensity;
    _force.impulse = impulse * power;
    _force.lift = lift * power;
    _force.spin = c.hitSpin;
    for (let i = 0; i < found.length; i++) {
      const dummy = found[i];
      if (outward) {
        _dir.set(dummy.position.x - at.x, 0, dummy.position.z - at.z);
        if (_dir.lengthSq() < 1e-4) _dir.copy(this.direction);
        _dir.normalize();
      } else {
        _dir.copy(this._fwd).addScaledVector(this.side, Math.sign((dummy.position.x - at.x) * this.side.x + (dummy.position.z - at.z) * this.side.z) * 0.6).normalize();
      }
      if (!dummy.kill(_dir.x, _dir.z, _force)) continue;
      this._resetEmit();
      _pos.copy(dummy.position).setY(1.1);
      _emit.position = _pos;
      _emit.radius = 0.25;
      _emit.direction = _dir;
      _emit.speed = c.sparkSpeed * 0.6;
      _emit.spread = 0.8;
      _emit.size = c.sparkSize;
      _emit.life = c.sparkLife * 0.6;
      this.sparks.emit(Math.round(24 * g.particleCount), _emit);
      _emit.size = c.moteSize * 1.4;
      _emit.life = c.moteLife;
      _emit.speed = c.moteSpeed * 4;
      _emit.spread = 1;
      this.motes.emit(Math.round(24 * g.particleCount), _emit);
      this.ctx.shake.add(0.18 * g.cameraShake, 8, 18);
      this.lightBoost = Math.max(this.lightBoost, c.lightIntensity);
    }
    _targets.length = 0;
  }

  /** Lub: the double plants and the first ring goes out. */
  _finaleLub() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    _pos.copy(this._end).setY(0);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.shockRadius * 0.6 * power,
      life: 0.5,
      width: 0.06,
      intensity: 1,
      colorA: getColor(c.colorShock),
      colorB: getColor(c.colorBurstA)
    });
    this._resetEmit();
    _emit.position = this._chest;
    _emit.size = c.ringSize * 2;
    _emit.sizeVariance = 0;
    _emit.life = c.ringLife * 1.3;
    _emit.lifeVariance = 0;
    this.rings.emit(1, _emit);
    this.ctx.shake.add(c.finaleShake * 0.5 * power * g.cameraShake, 8, 16);
    this.lightBoost = c.lightIntensity * c.finaleLight * 0.5 * power;
  }

  /** Dub: the double goes up in light and everything near is thrown. */
  _finaleDub() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    _pos.copy(this._end).setY(1.0);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: c.burstSize * 0.15,
      endRadius: c.burstSize * power,
      life: 0.6,
      intensity: c.burstIntensity,
      opacity: 0.7,
      fresnel: 2,
      displace: 0.25,
      turbulence: 0.8,
      squash: 0.7,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    _pos.setY(0);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.shockRadius * power,
      life: 0.65,
      width: 0.08,
      intensity: 1.3,
      colorA: getColor(c.colorShock),
      colorB: getColor(c.colorBurstA)
    });
    this._shockT = 0;

    this._resetEmit();
    _emit.position = this._chest;
    _emit.radius = 0.4;
    _emit.direction = _up;
    _emit.speed = c.sparkSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 1.6;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    this.sparks.emit(Math.round(c.finaleSparks * g.particleCount), _emit);
    _emit.radius = 0.7;
    _emit.speed = c.moteSpeed * 5;
    _emit.size = c.moteSize * 1.5;
    _emit.life = c.moteLife * 1.4;
    this.motes.emit(Math.round(c.finaleSparks * 0.8 * g.particleCount), _emit);
    _emit.speed = 0;
    _emit.radius = 0;
    _emit.size = c.ringSize * 3;
    _emit.sizeVariance = 0;
    _emit.life = c.ringLife * 1.6;
    this.rings.emit(1, _emit);

    this._strike(c.finaleRadius, c.finaleImpulse, c.finaleLift, true);

    this.ctx.shake.add(c.finaleShake * power * g.cameraShake, 6, 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.finaleFlash * power);
    this.lightBoost = c.lightIntensity * c.finaleLight * power;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.figure.visible = false;
    this.run.visible = false;
    this.braids[0].visible = false;
    this.braids[1].visible = false;
    this.wake.visible = false;
    for (let f = 0; f < FIGURES; f++) this._hideFigure(f);
    this._aFade.needsUpdate = true;
    this._figures = 0;
    this._shockT = -1;
  }

  dispose() {
    this.figureGeometry.dispose();
    this._capsule.dispose();
    this.stripGeometry.dispose();
    this.ribbonGeometry.dispose();
    this.quadGeometry.dispose();
    this.figureMaterial.dispose();
    this.runMaterial.dispose();
    this.braidMaterials.forEach((m) => m.dispose());
    this.wakeMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('♊  Second Self');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 1, 40, 0.1, 'run speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 6, 0.05, 'prints fade over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'beats with the heart');

  const beat = folder.addFolder('1 · Heartbeat');
  R(beat, c, 'lag', 0, 2, 0.01, 'runs behind by (s)');
  R(beat, c, 'bpm', 20, 240, 1, 'beats per minute');
  R(beat, c, 'beatGlow', 0, 5, 0.05, 'beat brightens');
  R(beat, c, 'dubDelay', 0.05, 0.6, 0.005, 'lub → dub (s)');
  R(beat, c, 'dubShare', 0, 1.5, 0.01, 'dub strength');

  const body = folder.addFolder('2 · Figure');
  R(body, c, 'figureHeight', 0.5, 5, 0.01, 'height (m)');
  R(body, c, 'figureBulk', 0.3, 3, 0.01, 'bulk');
  R(body, c, 'stepOut', -2, 2, 0.01, 'steps out to the side (m)');
  R(body, c, 'emergeTime', 0.02, 2, 0.01, 'peels out over (s)');
  R(body, c, 'lean', 0, 1, 0.01, 'lean');
  R(body, c, 'stride', 0.5, 6, 0.01, 'stride (m)');
  R(body, c, 'legSwing', 0, 1.6, 0.01, 'leg swing');
  R(body, c, 'kneeBend', 0, 2.5, 0.01, 'knee bend');
  R(body, c, 'armSwing', 0, 2, 0.01, 'arm swing');
  R(body, c, 'elbowBend', 0, 2.5, 0.01, 'elbow bend');
  R(body, c, 'bob', 0, 0.4, 0.005, 'bounce (m)');

  const look = folder.addFolder('3 · Figure look');
  R(look, c, 'bodyGlow', 0, 6, 0.05, 'inner light');
  R(look, c, 'rimGlow', 0, 12, 0.05, 'rim glow');
  R(look, c, 'rimPower', 0.3, 8, 0.05, 'rim thinness');
  R(look, c, 'bandScale', 0.5, 30, 0.1, 'time-bands per m');
  R(look, c, 'bandSpeed', -8, 8, 0.05, 'band fall (m/s)');
  R(look, c, 'bandGlow', 0, 4, 0.05, 'band glow');
  R(look, c, 'flicker', 0, 1, 0.01, 'flicker');
  R(look, c, 'opacity', 0, 1, 0.01, 'opacity');
  look.addColor(c, 'colorCore').name('core');
  look.addColor(c, 'colorBody').name('body');
  look.addColor(c, 'colorRim').name('rim');
  look.addColor(c, 'colorDeep').name('deep');

  const echo = folder.addFolder('4 · Afterimages');
  R(echo, c, 'echoes', 0, MAX_ECHOES, 1, 'count');
  R(echo, c, 'echoGap', 0.01, 0.4, 0.005, 'apart (s)');
  R(echo, c, 'echoFade', 0, 1, 0.01, 'each fades to (×)');

  const braid = folder.addFolder('5 · Path & braid');
  R(braid, c, 'braidWidth', 0, 3, 0.01, 'weave (m)');
  R(braid, c, 'braidPitch', 0.5, 12, 0.05, 'weave length (m)');
  R(braid, c, 'braidStrands', 1, 2, 1, 'ribbons');
  R(braid, c, 'braidRadius', 0, 1.5, 0.01, 'twist radius (m)');
  R(braid, c, 'braidTwist', 0, 8, 0.05, 'twists per m');
  R(braid, c, 'braidHeight', 0, 2, 0.01, 'height (m)');
  R(braid, c, 'braidWidthRibbon', 0.005, 0.4, 0.005, 'ribbon width (m)');
  R(braid, c, 'braidLength', 0.2, 20, 0.1, 'length (m)');
  R(braid, c, 'braidGlow', 0, 10, 0.05, 'glow');
  braid.addColor(c, 'colorBraidA').name('near');
  braid.addColor(c, 'colorBraidB').name('far');

  const prints = folder.addFolder('6 · Footprints');
  R(prints, c, 'footSize', 0.05, 1, 0.01, 'size (m)');
  R(prints, c, 'footSide', 0, 0.6, 0.005, 'apart (m)');
  R(prints, c, 'footGlow', 0, 12, 0.05, 'laid glow');
  R(prints, c, 'footStepGlow', 0, 20, 0.05, 'trodden glow');
  R(prints, c, 'footCool', 0.05, 5, 0.05, 'cools over (s)');
  R(prints, c, 'threadGlow', 0, 6, 0.05, 'thread glow');
  R(prints, c, 'threadWidth', 0.005, 0.3, 0.005, 'thread width (m)');
  prints.addColor(c, 'colorFootHot').name('trodden');
  prints.addColor(c, 'colorFootWarm').name('laid');
  prints.addColor(c, 'colorFootCold').name('ember');
  prints.addColor(c, 'colorThread').name('thread');

  const fx = folder.addFolder('7 · Particles');
  R(fx, c, 'moteRate', 0, 500, 1, 'motes/second');
  R(fx, c, 'moteSize', 0.005, 0.4, 0.001, 'mote size');
  R(fx, c, 'moteLife', 0.1, 5, 0.05, 'mote lifetime');
  R(fx, c, 'moteSpeed', 0, 4, 0.01, 'mote drift');
  R(fx, c, 'moteGlow', 0, 10, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorMote', 'mote gradient');
  R(fx, c, 'stepDust', 0, 30, 1, 'dust per footfall');
  R(fx, c, 'dustSize', 0.02, 2, 0.01, 'dust size');
  R(fx, c, 'dustLife', 0.1, 4, 0.05, 'dust lifetime');
  R(fx, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(fx, c, 'colorDust', 'dust gradient');
  R(fx, c, 'ringSize', 0.05, 4, 0.01, 'heartbeat ring');
  R(fx, c, 'ringLife', 0.05, 2, 0.01, 'ring lifetime');
  R(fx, c, 'ringGlow', 0, 8, 0.05, 'ring glow');
  Editor.gradient(fx, c, 'colorRing', 'ring gradient');

  const fin = folder.addFolder('8 · Finale');
  R(fin, c, 'finaleTime', 0.1, 3, 0.01, 'comes apart over (s)');
  R(fin, c, 'finaleRadius', 0, 12, 0.05, 'throws within (m)');
  R(fin, c, 'finaleRise', 0, 6, 0.05, 'rises (m)');
  R(fin, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(fin, c, 'burstSize', 0, 10, 0.05, 'air shell (m)');
  R(fin, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(fin, c, 'finaleSparks', 0, 600, 1, 'sparks');
  R(fin, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(fin, c, 'sparkSize', 0.005, 0.2, 0.001, 'spark size');
  R(fin, c, 'sparkLife', 0.05, 3, 0.01, 'spark lifetime');
  R(fin, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  Editor.gradient(fin, c, 'colorSpark', 'spark gradient');
  R(fin, c, 'warp', 0, 4, 0.01, 'ripple distortion');
  R(fin, c, 'ringWarp', 0, 4, 0.01, 'shock distortion');
  R(fin, c, 'finaleFlash', 0, 1, 0.01, 'flash');
  R(fin, c, 'finaleShake', 0, 2, 0.01, 'camera knock');
  R(fin, c, 'finaleLight', 0, 10, 0.05, 'light punch (× intensity)');
  fin.addColor(c, 'colorBurstA').name('shell inner');
  fin.addColor(c, 'colorBurstB').name('shell mid');
  fin.addColor(c, 'colorBurstC').name('shell outer');
  fin.addColor(c, 'colorShock').name('shockwave');
  fin.addColor(c, 'colorFlash').name('flash');

  const hit = folder.addFolder('9 · Hit');
  R(hit, c, 'markGlow', 0, 1, 0.01, 'mark');
  hit.addColor(c, 'colorMark').name('mark colour');
  R(hit, c, 'hitRadius', 0.1, 3, 0.01, 'runs through within (m)');
  R(hit, c, 'hitImpulse', 0, 30, 0.1, 'thrown (m/s)');
  R(hit, c, 'hitLift', 0, 15, 0.05, 'lift (m/s)');
  R(hit, c, 'hitSpin', 0, 8, 0.01, 'tumble');
  R(hit, c, 'finaleImpulse', 0, 40, 0.1, 'finale throw (m/s)');
  R(hit, c, 'finaleLift', 0, 20, 0.05, 'finale lift (m/s)');

  folder.close();
  return folder;
}
