import { Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createZephyrDiscMaterial,
  createZephyrScuffMaterial,
  createZephyrCycloneMaterial
} from '../../materials/codex/ZephyrShurikenMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'zephyr';

const TAU = Math.PI * 2;
/** The braid is three strands. Everything per-disc is sized off this. */
const DISCS = 3;
/** Bodies the discs (and the cyclone) can be whirling at once. */
const MAX_SPUN = 12;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _t = new Vector3();
const _bn = new Vector3();
const _right = new Vector3();
const _floor = new Vector3();
const _end = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * ZEPHYR SHURIKEN — three discs of compressed air braided down the line.
 *
 * A line cast. Three four-bladed shuriken of air leave the hand together and
 * weave down the line on a three-strand braid — each strand a sine round the
 * centre line, 120° out of phase with the next, with a vertical cosine so that
 * where two cross one passes over the other. Everything they cross is cut in
 * two and whirled; at the end the three close in and burst into a small
 * cyclone that lifts what is left and dies away.
 *
 * Seven layers, each a folder in the editor:
 *
 *   1. **the discs** — three flat quads placed in the vertex stage from a
 *      centre, an axis (banked into the braid, tipped `faceTilt` back toward
 *      the thrower so the shuriken shows its face rather than its edge, and
 *      rocking) and a heading; the shuriken itself is a polar SDF in the
 *      fragment stage (swept, tapered blades, a hub, a hole). Drawn twice: a
 *      normal-blended, sun-lit **body** — the blades filled and bevelled from
 *      deep jade to the body colour, with a smoked spin-blur disc — and over it
 *      the additive bright pass: cutting edges (the leading edge brighter), the
 *      spin blur and a three-colour fringe made of the blade a moment ago.
 *      1.15 m across each, so the three read at play distance.
 *   2. **the lens** — each disc again on `LAYER.DISTORTION`, wider, bending the
 *      world radially and *round* the disc, so it twists the air.
 *   3. **the scuffs** — one ground strip: under each disc's analytic braid
 *      line a filled, combed furrow in the ramp's deep tone, and over it a
 *      coil of thin open loops, the trace of a spinning rim carried forward.
 *      Only behind each disc; fresh-glowing; erodes. At the end the cyclone
 *      scours a spiral **eye** into the same strip (`eyeRadius`), heaped with a
 *      pale rim of dust, that stays for the whole linger.
 *   4. **wind streaks** — STREAKs flung off each rim tangent to its spin, with
 *      a share of the disc's own speed, so each disc sheds a spiral of lines.
 *   5. **leaves and dust** — LEAF debris and SMOKE dust sucked off the floor
 *      in each disc's wake and curled about it (`swirl`).
 *   6. **the cyclone** — the three discs converge, shrink and fold into a
 *      5 m funnel (`createZephyrCycloneMaterial`, a banded additive core and a
 *      lit dust sheath) whose spine leans, precesses round the foot and
 *      snakes, so its silhouette changes all through the linger; it lifts off
 *      and unravels from the foot up. An AIR shell, shockwave, dust ring,
 *      leaves thrown up the funnel, a knock on the camera, a flash, a punch of
 *      light.
 *   7. **the slice and the spin** — `handlesOwnHits`. Every frame each disc
 *      cuts what is within its rim (`dummy.kill(…, true)`) along its flight
 *      plus the tangent of its spin at the point of contact, then a short
 *      vortex (`dummy.carry`) whirls the halves round the cut. The cyclone
 *      knocks down what it reaches and lifts and whirls the bodies in it.
 *
 * ## The editor rule
 *
 * A cast captures a seed, a braid phase and per-disc integrated spin and rock
 * phases. Everything with a unit is resolved from `settings.zephyr` every
 * frame — braid width, pitch, blade count, the cyclone's flare — so dragging
 * it re-shapes discs already in the air, and no rate slider ever snaps.
 */
export class ZephyrShurikenAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The discs decide what they cut. */
  get handlesOwnHits() {
    return true;
  }

  /** Bodies cut this cast. HUD readout only. */
  get instanceCount() {
    return this._sliced;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layers 1 + 2: one quad, six meshes (a disc and a lens apiece) ---- */
    this.discGeometry = new PlaneGeometry(2, 2, 1, 1);
    this._discs = [];
    for (let k = 0; k < DISCS; k++) {
      const material = createZephyrDiscMaterial(false);
      const warpMaterial = createZephyrDiscMaterial(true);
      const bodyMaterial = createZephyrDiscMaterial('body');
      const body = this._mesh(this.discGeometry, bodyMaterial, `ZephyrDiscBody${k}`, LAYER.VFX, 11 + k);
      const mesh = this._mesh(this.discGeometry, material, `ZephyrDisc${k}`, LAYER.VFX, 14 + k);
      const warp = this._mesh(this.discGeometry, warpMaterial, `ZephyrLens${k}`, LAYER.DISTORTION, 0);
      this._discs.push({
        mesh,
        warp,
        body,
        material,
        warpMaterial,
        bodyMaterial,
        /** Handed to both materials each frame. */
        state: {
          centre: new Vector3(),
          axis: new Vector3(0, 1, 0),
          heading: new Vector3(0, 0, 1),
          radius: 0,
          spin: 0,
          spinDir: k === 1 ? -1 : 1, // the middle strand turns the other way
          fade: 1,
          seed: 0,
          strength: 1
        },
        along: 0,
        prevAlong: 0,
        startAlong: 0,
        phase: 0,
        wobble: 0,
        form: 0,
        live: true,
        streakEmitter: null,
        leafEmitter: null,
        dustEmitter: null
      });
    }

    /* ---- layer 3: the scuffs ---- */
    this.scuffGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.scuffMaterial = createZephyrScuffMaterial();
    this.scuff = this._mesh(this.scuffGeometry, this.scuffMaterial, 'ZephyrScuffs', LAYER.VFX, 2);

    /* ---- layer 6: the cyclone ---- */
    // uv.x round the funnel, uv.y up it.
    this.cycloneGeometry = new PlaneGeometry(1, 1, 48, 28);
    this.cycloneMaterial = createZephyrCycloneMaterial(false);
    this.cyclone = this._mesh(this.cycloneGeometry, this.cycloneMaterial, 'ZephyrCyclone', LAYER.VFX, 13);
    this.cycloneSheathMaterial = createZephyrCycloneMaterial(true);
    this.cycloneSheath = this._mesh(this.cycloneGeometry, this.cycloneSheathMaterial, 'ZephyrCycloneDust', LAYER.VFX, 12);

    this._scuffState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      length: 1,
      width: 1,
      amp: 1,
      k: 1,
      phase: new Vector3(),
      lineLen: 1,
      spreadIn: 1,
      converge: 1,
      discAt: new Vector3(),
      hot: 1,
      fadeT: 0,
      seed: 0,
      eyeAt: 0,
      eyeR: 0,
      eyeSpin: 0
    };
    this._cycloneState = { centre: new Vector3(), grow: 0, rise: 0, spin: 0, precess: 0, fade: 1, dissolve: 0, seed: 0 };

    this._seed = 0;
    this._braidPhase = 0;
    this._sliced = 0;
    this._hot = 1;
    this._burst = false;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };

    /* the bodies being whirled — fixed records, swapped out when done */
    this._spun = [];
    for (let i = 0; i < MAX_SPUN; i++) this._spun.push({ dummy: null, x: 0, z: 0, t: 0, sign: 1, mode: 0 });
    this._spunCount = 0;
    /** The record the field below is being sampled for. */
    this._fieldEntry = this._spun[0];
    // The velocity field `dummy.carry` samples per joint: a vortex round the
    // record's centre — tangential, a little inward, a little up. Bound once.
    this._vortexField = (x, y, z, out) => {
      const c = settings.zephyr;
      const e = this._fieldEntry;
      const dx = x - e.x;
      const dz = z - e.z;
      const d = Math.max(0.15, Math.hypot(dx, dz));
      const puff = e.mode === 1;
      const swirl = (puff ? c.puffPull : c.spinSpeed2) * e.sign;
      const inward = puff ? 1.5 : 0.8;
      out.set(
        (-dz / d) * swirl - (dx / d) * inward + this.direction.x * (puff ? 0 : 1.5),
        puff ? c.puffLift * Math.max(0, 1 - y / Math.max(0.5, c.puffHeight)) : 0.4,
        (dx / d) * swirl - (dz / d) * inward + this.direction.z * (puff ? 0 : 1.5)
      );
    };
  }

  _mesh(geometry, material, name, layer, order) {
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false; // placed in the vertex stage
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 4: wind streaks flung off the rims ---- */
    this.streaks = particles.get('zephyr.streaks', {
      capacity: 2400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.3
    });
    this.streaks.uniforms.uSizeIn.value = 0.04;
    this.streaks.uniforms.uFadeIn.value = 0.1;
    this.streaks.uniforms.uFadeOut.value = 0.5;
    this.streaks.uniforms.uEndSize.value = 0.4;
    this.streaks.uniforms.uDrag.value = 2.2;
    this.streaks.uniforms.uGravity.value.set(0, 0, 0);

    /* ---- layer 5: leaves and dust, curled about their anchors ---- */
    this.leaves = particles.get('zephyr.leaves', {
      capacity: 900,
      shape: ParticleShape.LEAF,
      additive: false,
      swirl: true,
      lit: true,
      softFade: 0.3
    });
    this.leaves.uniforms.uSizeIn.value = 0.08;
    this.leaves.uniforms.uFadeIn.value = 0.08;
    this.leaves.uniforms.uFadeOut.value = 0.3;
    this.leaves.uniforms.uEndSize.value = 0.9;

    this.dust = particles.get('zephyr.dust', {
      capacity: 2000,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 1.0
    });
    this.dust.uniforms.uSizeIn.value = 0.12;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.45;
    this.dust.uniforms.uEndSize.value = 2.2;

    for (const disc of this._discs) {
      disc.streakEmitter = new RateEmitter();
      disc.leafEmitter = new RateEmitter();
      disc.dustEmitter = new RateEmitter();
    }
    this.puffLeafEmitter = new RateEmitter();
    this.puffDustEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the discs folding into the cyclone and its life. */
  get impactDuration() {
    return Math.max(0.1, settings.zephyr.puffTime * settings.global.lifetime);
  }

  /** The fade is the dust settling and the scuffs wearing away. */
  get fadeDuration() {
    return Math.max(0.1, settings.zephyr.lifetime * settings.global.lifetime);
  }

  /** Gusting: quick and irregular. */
  lightShimmer() {
    const f = settings.zephyr.lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 15.3) * Math.sin(this.age * 6.1 + 0.4));
  }

  /* ------------------------------------------------------------------ */
  /* The braid on the CPU                                                */
  /* ------------------------------------------------------------------ */

  /** Metres the discs take to reach full swing, clamped to the cast. */
  _spreadIn() {
    return Math.min(Math.max(0.05, settings.zephyr.spreadIn), this.length * 0.45);
  }

  /** Metres over which they close in at the end, clamped to the cast. */
  _converge() {
    return Math.min(Math.max(0.05, settings.zephyr.convergeLength), this.length * 0.5);
  }

  /** 0 at the hand, 1 in full swing, 0 again where they meet. CPU twin of `envelope`. */
  _env(a) {
    const L = this.length;
    return smoothstep(0, this._spreadIn(), a) * (1 - smoothstep(L - this._converge(), L, a));
  }

  /** Braid wavenumber, radians per metre. */
  _k() {
    return TAU / Math.max(0.3, settings.zephyr.braidPitch);
  }

  /** Disc `disc`'s centre at `a` metres down the line. */
  _discPoint(disc, a, out) {
    const c = settings.zephyr;
    const env = this._env(a);
    const ph = a * this._k() + disc.phase;
    const lat = c.braidWidth * env * Math.sin(ph);
    const lift = c.braidLift * env * Math.cos(ph);
    const y = c.flightHeight + (c.launchHeight - c.flightHeight) * Math.exp(-Math.max(a, 0) / Math.max(0.05, c.launchDrop)) + lift;
    return out.copy(this.origin).addScaledVector(this.direction, a).addScaledVector(_right, lat).setY(y);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.zephyr;
    const g = settings.global;

    this._releaseAll();
    _right.set(this.direction.z, 0, -this.direction.x);

    this._seed = Math.random() * 100;
    this._braidPhase = Math.random() * TAU;
    this._sliced = 0;
    this._hot = 1;
    this._burst = false;
    this.puffLeafEmitter.reset();
    this.puffDustEmitter.reset();

    for (let k = 0; k < DISCS; k++) {
      const disc = this._discs[k];
      disc.phase = this._braidPhase + (k * TAU) / DISCS;
      disc.along = 0;
      disc.prevAlong = 0;
      disc.startAlong = 0;
      disc.wobble = Math.random() * TAU;
      disc.form = 0;
      disc.live = true;
      disc.state.spin = Math.random() * TAU;
      disc.state.seed = this._seed + k * 13.7;
      disc.state.fade = 1;
      disc.state.radius = 0;
      disc.streakEmitter.reset();
      disc.leafEmitter.reset();
      disc.dustEmitter.reset();
      disc.mesh.visible = true;
      disc.warp.visible = true;
      disc.body.visible = true;
    }

    const ss = this._scuffState;
    ss.seed = this._seed;
    ss.fadeT = 0;
    ss.hot = 1;
    ss.eyeR = 0;
    this.scuff.visible = true;
    this.cyclone.visible = false;
    this.cycloneSheath.visible = false;
    const cs = this._cycloneState;
    cs.seed = this._seed;
    cs.grow = 0;
    cs.rise = 0;
    cs.spin = 0;
    cs.precess = Math.random() * TAU;
    cs.fade = 1;
    cs.dissolve = 0;

    /* the gust off the caster's feet as the three are thrown */
    this._resetEmit(frame.uTime.value);
    _pos.copy(this.origin).addScaledVector(this.direction, 0.4).setY(0.15);
    _emit.position = _pos;
    _emit.anchor = _pos;
    _emit.radius = 0.5;
    _emit.direction = _dir.copy(this.direction).setY(0.3).normalize();
    _emit.speed = c.dustSpeed;
    _emit.spread = 0.9;
    _emit.size = c.dustSize;
    _emit.life = c.dustLifetime * 0.7;
    _emit.spin = 0.6;
    this.dust.emit(Math.round(c.castGust * g.particleCount), _emit);

    this._sync(0);
  }

  _resetEmit(time) {
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
    _emit.time = time;
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  /** Advance each disc's integrated spin and rock. */
  _advance(dt, spinBoost) {
    const c = settings.zephyr;
    const g = settings.global;
    for (const disc of this._discs) {
      disc.state.spin += c.spinSpeed * spinBoost * dt * g.animationSpeed;
      disc.wobble += c.wobbleSpeed * dt * g.animationSpeed;
    }
    this._cycloneState.spin += c.puffSpin * dt * g.animationSpeed;
    this._cycloneState.precess += c.puffPrecess * dt * g.animationSpeed;
  }

  /**
   * Place every disc and resolve every material from settings.
   * @param {number} merge 0 flying .. 1 folded into the cyclone
   */
  _sync(merge) {
    const c = settings.zephyr;
    const g = settings.global;
    const shrink = 1 - Easing.inQuad(merge);

    for (let k = 0; k < DISCS; k++) {
      const disc = this._discs[k];
      const s = disc.state;
      const a = disc.along;
      this._discPoint(disc, a, s.centre);
      // Heading: down the braid. Lateral slope of the strand → bank into it.
      this._discPoint(disc, a + 0.05, _a);
      _t.copy(_a).sub(s.centre);
      if (_t.lengthSq() < 1e-8) _t.copy(this.direction);
      _t.normalize();
      const ph = a * this._k() + disc.phase;
      const latN = this._env(a) * Math.sin(ph); // -1..1 across the braid
      const rock = c.wobble * g.randomness;
      s.axis.copy(_up)
        .addScaledVector(_right, -latN * c.bank + Math.sin(disc.wobble) * rock)
        .addScaledVector(this.direction, Math.cos(disc.wobble * 0.73) * rock - Math.tan(Math.min(1.4, Math.max(-1.4, c.faceTilt))))
        .normalize();
      s.heading.copy(_t);
      // Converging, the three pull onto one point at the end of the line.
      if (merge > 0) s.centre.lerp(_end.copy(this.origin).addScaledVector(this.direction, this.length).setY(c.flightHeight), Easing.outCubic(merge));
      s.radius = Math.max(0, c.discRadius * disc.form * shrink);
      s.fade = shrink;
      s.strength = Math.min(1, disc.form) * shrink;
      disc.material.userData.sync(s);
      disc.warpMaterial.userData.sync(s);
      disc.bodyMaterial.userData.sync(s);
    }

    /* the scuffs */
    const ss = this._scuffState;
    ss.start.copy(this.origin);
    ss.dir.copy(this.direction);
    ss.side.copy(_right);
    const eyeR = Math.max(0, c.eyeRadius * c.puffTopRadius);
    ss.length = this.length + 1 + eyeR;
    ss.width = 2 * Math.max(Math.abs(c.braidWidth) + Math.max(c.scuffLoop + c.scuffDust, c.scuffFurrow), eyeR) + 0.6;
    ss.eyeAt = this.length;
    ss.eyeR = eyeR * Math.min(1, this._cycloneState.grow);
    ss.eyeSpin = this._cycloneState.spin * c.eyeSpin;
    ss.amp = c.braidWidth;
    ss.k = this._k();
    ss.phase.set(this._discs[0].phase, this._discs[1].phase, this._discs[2].phase);
    ss.lineLen = this.length;
    ss.spreadIn = this._spreadIn();
    ss.converge = this._converge();
    ss.discAt.set(this._discs[0].along, this._discs[1].along, this._discs[2].along);
    ss.hot = this._hot;
    this.scuffMaterial.userData.sync(ss);

    /* the cyclone */
    const cs = this._cycloneState;
    cs.centre.copy(this.origin).addScaledVector(this.direction, this.length);
    cs.centre.y = 0;
    this.cycloneMaterial.userData.sync(cs);
    this.cycloneSheathMaterial.userData.sync(cs);

    /* the particles' looks */
    this.streaks.setGradient(getColor(c.colorStreakA), getColor(c.colorStreakB), getColor(c.colorStreakC), getColor(c.colorStreakD));
    const st = this.streaks.uniforms;
    st.uStretch.value = c.streakStretch;
    st.uSizeScale.value = g.particleSize;
    st.uLifeScale.value = g.particleLifetime;
    st.uSpeedScale.value = g.particleSpeed;
    st.uOpacity.value = g.opacity;
    st.uGlow.value = c.streakGlow * g.glow;
    st.uTurbulence.value = 0.2 * g.turbulence;

    this.leaves.setGradient(getColor(c.colorLeafA), getColor(c.colorLeafB), getColor(c.colorLeafC), getColor(c.colorLeafD));
    const l = this.leaves.uniforms;
    l.uDrag.value = 1.4;
    l.uGravity.value.set(0, -1.6, 0);
    l.uSwirl.value = c.leafSwirl;
    l.uSwirlExpand.value = 0.8;
    l.uSizeScale.value = g.particleSize;
    l.uLifeScale.value = g.particleLifetime;
    l.uSpeedScale.value = g.particleSpeed;
    l.uOpacity.value = g.opacity;
    l.uTurbulence.value = 0.6 * g.turbulence;

    this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
    const d = this.dust.uniforms;
    d.uDrag.value = 1.8;
    d.uGravity.value.set(0, 0.1, 0);
    d.uSwirl.value = c.dustSwirl;
    d.uSwirlExpand.value = 1.0;
    d.uSizeScale.value = g.particleSize;
    d.uLifeScale.value = g.particleLifetime;
    d.uSpeedScale.value = g.particleSpeed;
    d.uOpacity.value = c.dustOpacity * g.opacity;
    d.uTurbulence.value = 0.7 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.zephyr;
    const g = settings.global;
    this._advance(dt, 1);
    const speed = Math.max(0.1, c.speed * g.speed);
    for (let k = 0; k < DISCS; k++) {
      const disc = this._discs[k];
      disc.prevAlong = disc.along;
      // Thrown together, each a hair behind the last.
      disc.along = Math.max(0, this.front - k * c.stagger);
      const born = this.age - (k * c.stagger) / speed;
      disc.form = Math.max(0, Easing.outBack(saturate(born / Math.max(0.01, c.formTime))));
    }
    this._sync(0);

    for (const disc of this._discs) {
      this._discFx(disc, dt, 1);
      this._slice(disc);
    }
    this._updateSpun(dt);
    this.ctx.shake.rumble(c.travelRumble, dt);
    this._lightAtDiscs();
  }

  _lightAtDiscs() {
    this.position.set(0, 0, 0);
    for (const disc of this._discs) this.position.add(disc.state.centre);
    this.position.multiplyScalar(1 / DISCS);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the three close in and burst into a cyclone                */
  /* ------------------------------------------------------------------ */

  onImpact() {
    for (const disc of this._discs) {
      disc.startAlong = disc.along;
      disc.prevAlong = disc.along;
    }
  }

  onFade(dt, t) {
    const c = settings.zephyr;
    const g = settings.global;

    if (t <= 1) {
      const mergeEnd = Math.min(0.9, Math.max(0.02, c.mergeTime));
      const merge = saturate(t / mergeEnd);
      this._advance(dt, 1 + merge * 2); // they spin up as they fold together
      for (const disc of this._discs) {
        disc.prevAlong = disc.along;
        disc.along = lerp(disc.startAlong, this.length, Easing.outCubic(merge));
      }
      this._sync(merge);
      const discsOn = merge < 1;
      for (const disc of this._discs) {
        disc.mesh.visible = discsOn;
        disc.warp.visible = discsOn;
        disc.body.visible = discsOn;
        if (discsOn) {
          this._discFx(disc, dt, 1 - merge);
          this._slice(disc);
        }
      }
      if (!this._burst && merge >= 1) this._doBurst();

      /* the cyclone: forms over the merge, lives, rises and comes apart */
      const cs = this._cycloneState;
      const born = mergeEnd * 0.5;
      const life = saturate((t - born) / Math.max(0.05, 1 - born));
      const formT = Math.max(0.02, c.puffFormTime) / Math.max(0.05, this.impactDuration);
      cs.grow = Easing.outBack(saturate((t - born) / formT));
      const unravelAt = Math.min(0.95, Math.max(0.1, c.puffUnravelStart));
      cs.rise = c.puffRise * smoothstep(unravelAt - 0.15, 1, life);
      cs.dissolve = smoothstep(unravelAt, 1, life);
      cs.fade = 1 - smoothstep(0.9, 1, life);
      this.cyclone.visible = t >= born;
      this.cycloneSheath.visible = t >= born;
      this.cycloneMaterial.userData.sync(cs);
      this.cycloneSheathMaterial.userData.sync(cs);
      this._sync(merge);
      if (this.cyclone.visible) this._cycloneFx(dt, 1 - cs.dissolve);
      if (this._burst && life < 0.85) this._puffHits(dt);

      this._updateSpun(dt);
      this.position.copy(cs.centre).setY(1.2 + cs.rise);
      return;
    }

    /* the fade: everything is gone but the marks and the settling dust */
    const ft = saturate(t - 1);
    this._advance(dt, 1);
    for (const disc of this._discs) {
      disc.mesh.visible = false;
      disc.warp.visible = false;
      disc.body.visible = false;
    }
    this.cyclone.visible = false;
    this.cycloneSheath.visible = false;
    this._hot = Math.max(0, this._hot - dt / 0.6);
    this._cycloneState.grow = 1;
    this._sync(1);
    this._scuffState.fadeT = smoothstep(0.3, 1, ft);
    this.scuffMaterial.userData.sync(this._scuffState);
    this._updateSpun(dt);
    if (ft >= 0.999) this._releaseAll();
    this.position.copy(this._cycloneState.centre).setY(1.2);
  }

  /** The three meet: a pressure shell, a ring of dust, a knock. */
  _doBurst() {
    const c = settings.zephyr;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._burst = true;

    _floor.copy(this.origin).addScaledVector(this.direction, this.length);
    _floor.y = 0;
    _pos.copy(_floor).setY(c.flightHeight);

    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: c.burstSize * 0.15,
      endRadius: c.burstSize * power,
      life: 0.5,
      intensity: c.burstIntensity,
      opacity: 0.5,
      fresnel: 2.4,
      displace: 0.35,
      squash: 0.6,
      colorA: getColor(c.colorPuffA),
      colorB: getColor(c.colorPuffB),
      colorC: getColor(c.colorPuffC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.55,
      width: 0.06,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _floor, {
      radius: c.puffTopRadius * 1.3,
      life: 1.4,
      intensity: 0.8,
      colorA: getColor(c.colorRingA),
      colorB: getColor(c.colorRingB)
    });

    /* leaves and dust thrown up and round the funnel */
    this._resetEmit(time);
    _emit.anchor = _floor;
    _emit.spin = 1;
    _emit.size = c.leafSize;
    _emit.life = c.leafLifetime;
    _emit.speedVariance = 0.4;
    const leaves = Math.round(c.puffLeaves * g.particleCount);
    for (let n = 0; n < leaves; n++) {
      const a = Math.random() * TAU;
      const r = c.puffRadius * (0.5 + 0.7 * Math.random());
      _a.copy(_floor).set(_floor.x + Math.cos(a) * r, 0.1 + Math.random() * 0.6, _floor.z + Math.sin(a) * r);
      _emit.position = _a;
      _emit.direction = _dir.set(Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4).normalize();
      _emit.speed = c.leafLift * 1.6;
      this.leaves.emit(1, _emit);
    }
    _emit.position = _pos.copy(_floor).setY(0.3);
    _emit.radius = c.puffRadius;
    _emit.direction = _up;
    _emit.speed = c.dustSpeed;
    _emit.spread = 1;
    _emit.size = c.dustSize * 1.4;
    _emit.life = c.dustLifetime * 1.2;
    _emit.spin = 0.5;
    this.dust.emit(Math.round(c.puffDust * g.particleCount), _emit);

    /* a ring of streaks spun off tangentially */
    this._resetEmit(time);
    _emit.size = c.streakSize * 1.3;
    _emit.life = c.streakLifetime * 1.6;
    const lines = Math.round(c.puffStreaks * g.particleCount);
    for (let n = 0; n < lines; n++) {
      const a = Math.random() * TAU;
      const r = c.puffRadius * (0.6 + 0.6 * Math.random());
      _a.set(_floor.x + Math.cos(a) * r, 0.3 + Math.random() * c.puffHeight * 0.6, _floor.z + Math.sin(a) * r);
      _dir.set(-Math.sin(a), 0.35, Math.cos(a)).normalize();
      _emit.position = _a;
      _emit.direction = _dir;
      _emit.speed = c.streakFling * 1.4;
      this.streaks.emit(1, _emit);
    }

    this.ctx.shake.add(c.impactShake * power, 1 / Math.max(0.05, c.shakeDuration), 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.lightIntensity * c.impactLight * power;
  }

  /** Leaves spiralling up the funnel and dust skirting its base. */
  _cycloneFx(dt, strength) {
    const c = settings.zephyr;
    const g = settings.global;
    const cs = this._cycloneState;
    const time = frame.uTime.value;
    const leaves = Math.round(this.puffLeafEmitter.tick(dt, c.leafRate * 2 * strength) * g.particleCount);
    if (leaves > 0) {
      this._resetEmit(time);
      _emit.anchor = cs.centre;
      _emit.size = c.leafSize;
      _emit.life = c.leafLifetime * 0.8;
      _emit.spin = 1;
      _emit.speed = c.leafLift;
      _emit.direction = _up;
      _emit.spread = 0.25;
      for (let n = 0; n < leaves; n++) {
        const a = Math.random() * TAU;
        const r = c.puffRadius * cs.grow * (0.6 + 0.5 * Math.random());
        _a.set(cs.centre.x + Math.cos(a) * r, 0.1 + cs.rise, cs.centre.z + Math.sin(a) * r);
        _emit.position = _a;
        this.leaves.emit(1, _emit);
      }
    }
    const dust = Math.round(this.puffDustEmitter.tick(dt, c.dustRate * 1.5 * strength) * g.particleCount);
    if (dust > 0) {
      this._resetEmit(time);
      _emit.anchor = cs.centre;
      _emit.size = c.dustSize;
      _emit.life = c.dustLifetime;
      _emit.speed = c.dustSpeed * 0.5;
      _emit.spread = 0.6;
      _emit.direction = _up;
      _emit.spin = 0.5;
      for (let n = 0; n < dust; n++) {
        const a = Math.random() * TAU;
        const r = c.puffRadius * (0.8 + 0.6 * Math.random());
        _a.set(cs.centre.x + Math.cos(a) * r, 0.12, cs.centre.z + Math.sin(a) * r);
        _emit.position = _a;
        this.dust.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Effects in flight                                                   */
  /* ------------------------------------------------------------------ */

  /** One disc's streaks, leaves and dust, scaled by `strength`. */
  _discFx(disc, dt, strength) {
    const c = settings.zephyr;
    const g = settings.global;
    const time = frame.uTime.value;
    const s = disc.state;
    if (s.radius <= 0.01) return;
    const flight = c.speed * g.speed;

    // The disc's own in-plane frame.
    _t.copy(s.heading).addScaledVector(s.axis, -s.heading.dot(s.axis)).normalize();
    _bn.crossVectors(s.axis, _t);

    /* streaks flung off the rim, tangent to the spin */
    const lines = Math.round(disc.streakEmitter.tick(dt, c.streakRate * strength) * g.particleCount);
    if (lines > 0) {
      this._resetEmit(time);
      _emit.size = c.streakSize;
      _emit.life = c.streakLifetime;
      _emit.speedVariance = 0.2;
      for (let n = 0; n < lines; n++) {
        const a = Math.random() * TAU;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        _pos.copy(s.centre).addScaledVector(_t, ca * s.radius).addScaledVector(_bn, sa * s.radius);
        // Tangent of the spin at that point, plus a share of the flight.
        _vel.copy(_t).multiplyScalar(-sa * s.spinDir).addScaledVector(_bn, ca * s.spinDir).multiplyScalar(c.streakFling)
          .addScaledVector(s.heading, flight * c.streakTrail);
        const speed = _vel.length();
        _emit.position = _pos;
        _emit.direction = speed > 1e-4 ? _dir.copy(_vel).divideScalar(speed) : s.heading;
        _emit.speed = speed;
        this.streaks.emit(1, _emit);
      }
    }

    /* leaves sucked up off the floor in its wake, curling round it */
    const leaves = Math.round(disc.leafEmitter.tick(dt, c.leafRate * strength) * g.particleCount);
    if (leaves > 0) {
      this._resetEmit(time);
      _emit.size = c.leafSize;
      _emit.life = c.leafLifetime;
      _emit.spin = c.leafSpin;
      _emit.speedVariance = 0.4;
      _floor.copy(s.centre).setY(0.05);
      for (let n = 0; n < leaves; n++) {
        _pos.copy(_floor)
          .addScaledVector(_right, (Math.random() * 2 - 1) * s.radius)
          .addScaledVector(this.direction, -Math.random() * 0.8);
        _dir.copy(_up).multiplyScalar(c.leafLift).addScaledVector(s.heading, c.leafSpeed)
          .addScaledVector(_right, (Math.random() - 0.5) * c.leafSpeed);
        const speed = _dir.length();
        _dir.divideScalar(Math.max(speed, 1e-4));
        _emit.position = _pos;
        _emit.anchor = _floor;
        _emit.direction = _dir;
        _emit.speed = speed;
        this.leaves.emit(1, _emit);
      }
    }

    /* dust kicked off the floor under it */
    const dust = Math.round(disc.dustEmitter.tick(dt, c.dustRate * strength) * g.particleCount);
    if (dust > 0) {
      this._resetEmit(time);
      _emit.size = c.dustSize;
      _emit.life = c.dustLifetime;
      _emit.spin = 0.5;
      _emit.spread = 0.5;
      _emit.speed = c.dustSpeed;
      _floor.copy(s.centre).setY(0.1);
      for (let n = 0; n < dust; n++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        _pos.copy(_floor).addScaledVector(_right, side * s.radius * Math.random());
        _dir.copy(_right).multiplyScalar(side).addScaledVector(_up, 0.4).addScaledVector(this.direction, -0.4).normalize();
        _emit.position = _pos;
        _emit.anchor = _floor;
        _emit.direction = _dir;
        this.dust.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* The slice and the spin                                              */
  /* ------------------------------------------------------------------ */

  /** Cut whatever is inside this disc's rim right now. */
  _slice(disc) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings.zephyr;
    const g = settings.global;
    const s = disc.state;
    if (disc.form < 0.5 || s.radius < 0.05) return;
    const reach = s.radius + c.sliceReach;
    const found = field.findTargets(s.centre.x, s.centre.z, reach, this._found);
    if (found.length === 0) return;

    this._force.impulse = c.sliceImpulse * g.explosionIntensity;
    this._force.lift = c.sliceLift * g.explosionIntensity;
    this._force.spin = c.sliceSpin;

    for (const dummy of found) {
      const dx = dummy.position.x - s.centre.x;
      const dz = dummy.position.z - s.centre.z;
      const d = Math.max(0.05, Math.hypot(dx, dz));
      // Along the flight, plus the spin's tangent where the rim met the body.
      _dir.set(s.heading.x, 0, s.heading.z).normalize()
        .addScaledVector(_vel.set((-dz / d) * s.spinDir, 0, (dx / d) * s.spinDir), 0.6)
        .normalize();
      if (!dummy.kill(_dir.x, _dir.z, this._force, true)) continue;
      this._sliced++;
      this._spin(dummy, s.centre.x, s.centre.z, s.spinDir, 0);
      this._hitFx(dummy.position, _dir);
    }
  }

  /** Bodies in the cyclone: standing ones are knocked down; all are whirled up. */
  _puffHits(dt) {
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    const c = settings.zephyr;
    const g = settings.global;
    const cs = this._cycloneState;
    const reach = Math.max(c.puffRadius, c.puffTopRadius * 0.7) * cs.grow;
    const found = field.findBodies(cs.centre.x, cs.centre.z, reach, this._found);
    this._force.impulse = c.puffPull * g.explosionIntensity;
    this._force.lift = c.puffLift * g.explosionIntensity;
    this._force.spin = c.sliceSpin;
    for (const dummy of found) {
      if (dummy.alive) {
        const dx = dummy.position.x - cs.centre.x;
        const dz = dummy.position.z - cs.centre.z;
        const d = Math.max(0.05, Math.hypot(dx, dz));
        if (!dummy.kill(-dz / d, dx / d, this._force, false)) continue;
        this._sliced++;
      }
      this._spin(dummy, cs.centre.x, cs.centre.z, 1, 1);
    }
  }

  /** Start (or refresh) whirling a body round (x, z). mode 0 a disc's cut, 1 the cyclone. */
  _spin(dummy, x, z, sign, mode) {
    let entry = null;
    for (let i = 0; i < this._spunCount; i++) if (this._spun[i].dummy === dummy) entry = this._spun[i];
    if (!entry) {
      if (this._spunCount >= MAX_SPUN) return;
      entry = this._spun[this._spunCount++];
      entry.dummy = dummy;
      entry.t = 0;
    }
    if (mode === 1 && entry.mode !== 1) entry.t = 0;
    entry.x = x;
    entry.z = z;
    entry.sign = sign;
    entry.mode = mode;
  }

  /** Carry every whirled body through its vortex; let go when its time is up. */
  _updateSpun(dt) {
    const c = settings.zephyr;
    const spinTime = Math.max(0.02, c.spinTime);
    const puffTime = this.impactDuration;
    const grab = 1 - Math.exp(-c.spinGrab * dt);
    for (let i = 0; i < this._spunCount; ) {
      const e = this._spun[i];
      e.t += dt;
      const limit = e.mode === 1 ? puffTime : spinTime;
      if (e.t > limit || !e.dummy) {
        e.dummy?.release?.();
        // Swap the last live record into this slot.
        const last = this._spun[--this._spunCount];
        this._spun[this._spunCount] = e;
        this._spun[i] = last;
        e.dummy = null;
        continue;
      }
      this._fieldEntry = e;
      e.dummy.carry(this._vortexField, grab, grab * (e.mode === 1 ? 0.6 : 0.2), 0);
      i++;
    }
  }

  _releaseAll() {
    for (let i = 0; i < this._spunCount; i++) {
      this._spun[i].dummy?.release?.();
      this._spun[i].dummy = null;
    }
    this._spunCount = 0;
  }

  /** Dust and a spray of wind where a body was cut. */
  _hitFx(at, dir) {
    const c = settings.zephyr;
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _pos.copy(at).setY(c.flightHeight);
    _emit.position = _pos;
    _emit.anchor = _pos;
    _emit.radius = 0.25;
    _emit.direction = dir;
    _emit.speed = c.dustSpeed;
    _emit.spread = 0.7;
    _emit.size = c.dustSize * 0.8;
    _emit.life = c.dustLifetime * 0.7;
    _emit.spin = 0.6;
    this.dust.emit(Math.round(c.hitDust * g.particleCount), _emit);
    _emit.anchor = null;
    _emit.radius = 0.1;
    _emit.speed = c.streakFling * 1.5;
    _emit.spread = 0.6;
    _emit.size = c.streakSize;
    _emit.life = c.streakLifetime;
    this.streaks.emit(Math.round(c.hitDust * 0.8 * g.particleCount), _emit);
    _emit.anchor = _pos;
    _emit.size = c.leafSize;
    _emit.speed = c.leafSpeed;
    _emit.life = c.leafLifetime * 0.7;
    _emit.spin = c.leafSpin;
    this.leaves.emit(Math.round(c.hitDust * 0.3 * g.particleCount), _emit);
    this.ctx.shake.add(c.impactShake * 0.3, 7, 22);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.6);
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._releaseAll();
    for (const disc of this._discs) {
      disc.mesh.visible = false;
      disc.warp.visible = false;
      disc.body.visible = false;
    }
    this.scuff.visible = false;
    this.cyclone.visible = false;
    this.cycloneSheath.visible = false;
  }

  dispose() {
    this.discGeometry.dispose();
    this.scuffGeometry.dispose();
    this.cycloneGeometry.dispose();
    for (const disc of this._discs) {
      disc.material.dispose();
      disc.warpMaterial.dispose();
      disc.bodyMaterial.dispose();
    }
    this.scuffMaterial.dispose();
    this.cycloneMaterial.dispose();
    this.cycloneSheathMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1F4A8}  Zephyr Shuriken');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'disc speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 8, 0.05, 'scuffs + dust linger (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'gusting');

  const discs = folder.addFolder('1 · Discs');
  const flight = discs.addFolder('Flight');
  R(flight, c, 'discRadius', 0.1, 2.5, 0.01, 'radius (m)');
  R(flight, c, 'flightHeight', 0.1, 3, 0.01, 'braid height (m)');
  R(flight, c, 'launchHeight', 0.1, 3, 0.01, 'leaves the hand at (m)');
  R(flight, c, 'launchDrop', 0.05, 6, 0.05, 'settles over (m)');
  R(flight, c, 'braidWidth', 0, 4, 0.01, 'braid swing (m)');
  R(flight, c, 'braidLift', 0, 1.5, 0.01, 'over/under (m)');
  R(flight, c, 'braidPitch', 0.3, 20, 0.05, 'braid pitch (m)');
  R(flight, c, 'spreadIn', 0.05, 10, 0.05, 'spreads over (m)');
  R(flight, c, 'convergeLength', 0.05, 10, 0.05, 'closes in over (m)');
  R(flight, c, 'stagger', 0, 2, 0.01, 'stagger (m)');
  R(flight, c, 'bank', 0, 1.5, 0.01, 'bank into the braid');
  R(flight, c, 'faceTilt', -1.2, 1.2, 0.01, 'tipped toward the thrower (rad)');
  R(flight, c, 'wobble', 0, 0.6, 0.005, 'rock (rad)');
  R(flight, c, 'wobbleSpeed', 0, 40, 0.1, 'rock speed');
  R(flight, c, 'spinSpeed', -120, 120, 0.5, 'spin (rad/s)');
  R(flight, c, 'formTime', 0.01, 1, 0.005, 'snaps open over (s)');

  const shape = discs.addFolder('Silhouette');
  R(shape, c, 'blades', 2, 8, 1, 'blades');
  R(shape, c, 'bladeWidth', 0.05, 1, 0.01, 'blade width');
  R(shape, c, 'bladeTaper', 0.1, 5, 0.01, 'blade taper');
  R(shape, c, 'bladeCurve', -4, 4, 0.01, 'blade sweep (rad)');
  R(shape, c, 'hubRadius', 0, 0.8, 0.005, 'hub (× radius)');
  R(shape, c, 'holeRadius', 0, 0.6, 0.005, 'hole (× radius)');

  const look = discs.addFolder('Shading');
  R(look, c, 'edgeWidth', 0.005, 0.3, 0.001, 'edge width');
  R(look, c, 'edgeGlow', 0, 15, 0.05, 'edge glow');
  R(look, c, 'bodyOpacity', 0, 1, 0.01, 'body opacity');
  R(look, c, 'blurAmount', 0, 1, 0.01, 'spin blur');
  R(look, c, 'swirlLines', 0, 16, 1, 'wind lines');
  R(look, c, 'swirlGlow', 0, 4, 0.01, 'wind line glow');
  R(look, c, 'fringe', 0, 4, 0.01, 'chromatic fringe');
  R(look, c, 'fringeSpread', 0, 0.6, 0.001, 'fringe spread (rad)');
  R(look, c, 'rimGlow', 0, 6, 0.01, 'edge-on glow');
  R(look, c, 'softFade', 0.01, 2, 0.01, 'soft intersection (m)');
  look.addColor(c, 'colorA').name('body');
  look.addColor(c, 'colorB').name('cutting edge');
  look.addColor(c, 'colorFringeR').name('fringe 1');
  look.addColor(c, 'colorFringeG').name('fringe 2');
  look.addColor(c, 'colorFringeB').name('fringe 3');
  R(look, c, 'bodyFill', 0, 1, 0.01, 'blade mass (lit body)');
  R(look, c, 'bodyBevel', 0.01, 0.6, 0.005, 'body bevel');
  look.addColor(c, 'colorDiscBody').name('body lit');
  look.addColor(c, 'colorDiscDeep').name('body deep');

  const warp = folder.addFolder('2 · Distortion');
  R(warp, c, 'warpStrength', 0, 4, 0.01, 'strength');
  R(warp, c, 'warpRadius', 0.5, 4, 0.01, 'lens radius (× disc)');
  R(warp, c, 'warpSwirl', 0, 1, 0.01, 'lens → vortex');
  R(warp, c, 'warpNoise', 0, 1, 0.01, 'turbulence share');

  const scuff = folder.addFolder('3 · Spiral scuffs');
  R(scuff, c, 'scuffStart', 0, 4, 0.01, 'starts after (m)');
  R(scuff, c, 'scuffLoop', 0.02, 1.5, 0.005, 'loop radius (m)');
  R(scuff, c, 'scuffPitch', 0.02, 2, 0.005, 'loop pitch (m)');
  R(scuff, c, 'scuffWidth', 0.002, 0.2, 0.001, 'line width (m)');
  R(scuff, c, 'scuffArc', 0.05, 1, 0.01, 'arc of each loop');
  R(scuff, c, 'scuffDust', 0.01, 2, 0.01, 'dust band (m)');
  R(scuff, c, 'scuffOpacity', 0, 1, 0.01, 'line opacity');
  R(scuff, c, 'scuffDustOpacity', 0, 1, 0.01, 'dust opacity');
  R(scuff, c, 'scuffGlow', 0, 8, 0.05, 'fresh glow');
  R(scuff, c, 'scuffGlowLength', 0.1, 12, 0.05, 'glow length (m)');
  R(scuff, c, 'scuffErode', 0, 1, 0.01, 'ragged fade');
  R(scuff, c, 'scuffFurrow', 0.01, 2, 0.01, 'furrow half-width (m)');
  R(scuff, c, 'scuffFurrowOpacity', 0, 1, 0.01, 'furrow opacity');
  R(scuff, c, 'eyeRadius', 0, 3, 0.01, 'cyclone eye (× top radius)');
  R(scuff, c, 'eyeArms', 1, 8, 1, 'eye spiral arms');
  R(scuff, c, 'eyeSpin', 0, 2, 0.01, 'eye turn (× cyclone spin)');
  R(scuff, c, 'eyeOpacity', 0, 1, 0.01, 'eye opacity');
  scuff.addColor(c, 'colorScuffDeep').name('furrow + eye deep');
  scuff.addColor(c, 'colorScuff').name('line');
  scuff.addColor(c, 'colorScuffDust').name('dust');
  scuff.addColor(c, 'colorScuffGlow').name('glow');

  const streaks = folder.addFolder('4 · Wind streaks');
  R(streaks, c, 'streakRate', 0, 800, 1, 'per second, per disc');
  R(streaks, c, 'streakSize', 0.005, 0.3, 0.001, 'width');
  R(streaks, c, 'streakFling', 0, 30, 0.1, 'flung off the rim (m/s)');
  R(streaks, c, 'streakTrail', 0, 1.5, 0.01, 'keep (× disc speed)');
  R(streaks, c, 'streakStretch', 0, 1, 0.005, 'stretch');
  R(streaks, c, 'streakLifetime', 0.05, 2, 0.01, 'lifetime');
  R(streaks, c, 'streakGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(streaks, c, 'colorStreak', 'streak gradient');

  const debris = folder.addFolder('5 · Leaves + dust');
  R(debris, c, 'leafRate', 0, 200, 1, 'leaves/second, per disc');
  R(debris, c, 'leafSize', 0.02, 0.6, 0.005, 'leaf size');
  R(debris, c, 'leafSpeed', 0, 12, 0.05, 'leaf speed');
  R(debris, c, 'leafLift', 0, 10, 0.05, 'leaf lift');
  R(debris, c, 'leafSpin', 0, 20, 0.1, 'leaf tumble');
  R(debris, c, 'leafSwirl', -12, 12, 0.05, 'leaf curl (rad/s)');
  R(debris, c, 'leafLifetime', 0.1, 5, 0.05, 'leaf lifetime');
  Editor.gradient(debris, c, 'colorLeaf', 'leaf gradient');
  R(debris, c, 'dustRate', 0, 400, 1, 'dust/second, per disc');
  R(debris, c, 'dustSize', 0.05, 2, 0.01, 'dust size');
  R(debris, c, 'dustSpeed', 0, 10, 0.05, 'dust speed');
  R(debris, c, 'dustLifetime', 0.1, 5, 0.05, 'dust lifetime');
  R(debris, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  R(debris, c, 'dustSwirl', -10, 10, 0.05, 'dust curl (rad/s)');
  Editor.gradient(debris, c, 'colorDust', 'dust gradient');

  const puff = folder.addFolder('6 · Cyclone');
  R(puff, c, 'puffTime', 0.1, 4, 0.01, 'lasts (s)');
  R(puff, c, 'mergeTime', 0.02, 0.9, 0.01, 'discs fold in by');
  R(puff, c, 'puffRadius', 0.1, 5, 0.01, 'base radius (m)');
  R(puff, c, 'puffTopRadius', 0.1, 8, 0.01, 'top radius (m)');
  R(puff, c, 'puffHeight', 0.2, 10, 0.05, 'height (m)');
  R(puff, c, 'puffFlare', 0.1, 5, 0.01, 'flare');
  R(puff, c, 'puffSpin', -40, 40, 0.1, 'spin (rad/s)');
  R(puff, c, 'puffTwist', -8, 8, 0.05, 'band twist (rad/m)');
  R(puff, c, 'puffBands', 1, 16, 1, 'bands');
  R(puff, c, 'puffRise', 0, 6, 0.05, 'rises (m)');
  R(puff, c, 'puffOpacity', 0, 1, 0.01, 'opacity');
  R(puff, c, 'puffGlow', 0, 8, 0.05, 'glow');
  R(puff, c, 'puffNoise', 0, 2, 0.01, 'turbulence');
  R(puff, c, 'puffFormTime', 0.02, 1.5, 0.01, 'forms over (s)');
  R(puff, c, 'puffUnravelStart', 0.1, 0.95, 0.01, 'unravels from (fraction)');
  R(puff, c, 'puffLean', -1, 1, 0.01, 'lean (m per m)');
  R(puff, c, 'puffPrecess', -6, 6, 0.01, 'lean precession (rad/s)');
  R(puff, c, 'puffWobble', 0, 2, 0.01, 'snaking (m)');
  R(puff, c, 'puffSheathOpacity', 0, 1, 0.01, 'dust sheath opacity');
  R(puff, c, 'puffSheathScale', 0.5, 3, 0.01, 'dust sheath width');
  R(puff, c, 'puffFresnel', 0.2, 8, 0.05, 'sheath rim power');
  puff.addColor(c, 'colorPuffTint').name('sheath lit');
  puff.addColor(c, 'colorPuffBody').name('sheath body');
  puff.addColor(c, 'colorPuffDeep').name('sheath deep');
  R(puff, c, 'burstSize', 0, 14, 0.05, 'pressure shell (m)');
  R(puff, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(puff, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(puff, c, 'puffLeaves', 0, 300, 1, 'leaves thrown');
  R(puff, c, 'puffDust', 0, 300, 1, 'dust thrown');
  R(puff, c, 'puffStreaks', 0, 400, 1, 'streaks thrown');
  R(puff, c, 'impactShake', 0, 1.5, 0.01, 'camera knock');
  R(puff, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(puff, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(puff, c, 'impactLight', 0, 6, 0.01, 'light punch (× intensity)');
  R(puff, c, 'travelRumble', 0, 1, 0.01, 'rumble in flight');
  R(puff, c, 'castGust', 0, 120, 1, 'gust at the hand');
  puff.addColor(c, 'colorPuffA').name('cyclone bright');
  puff.addColor(c, 'colorPuffB').name('cyclone mid');
  puff.addColor(c, 'colorPuffC').name('cyclone deep');
  puff.addColor(c, 'colorShockA').name('shockwave');
  puff.addColor(c, 'colorShockB').name('shockwave hot');
  puff.addColor(c, 'colorRingA').name('dust ring dark');
  puff.addColor(c, 'colorRingB').name('dust ring light');
  puff.addColor(c, 'colorFlash').name('flash');

  const slice = folder.addFolder('7 · Slice + spin');
  R(slice, c, 'sliceReach', 0, 2, 0.01, 'reach past the rim (m)');
  R(slice, c, 'sliceImpulse', 0, 20, 0.1, 'halves thrown (m/s)');
  R(slice, c, 'sliceLift', 0, 12, 0.05, 'lift (m/s)');
  R(slice, c, 'sliceSpin', 0, 5, 0.01, 'tumble');
  R(slice, c, 'spinSpeed2', 0, 30, 0.1, 'whirled round (m/s)');
  R(slice, c, 'spinTime', 0.02, 3, 0.01, 'whirled for (s)');
  R(slice, c, 'spinGrab', 0, 20, 0.05, 'vortex grip');
  R(slice, c, 'puffPull', 0, 20, 0.1, 'cyclone whirl (m/s)');
  R(slice, c, 'puffLift', 0, 12, 0.05, 'cyclone lift (m/s)');
  R(slice, c, 'hitDust', 0, 120, 1, 'debris per cut');

  folder.close();
  return folder;
}
