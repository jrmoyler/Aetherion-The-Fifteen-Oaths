import { Matrix3, Matrix4, Mesh, Vector3, Vector4 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createOrbGeometry,
  createTrackGeometry,
  createQuadGeometry,
  BoltRibbons,
  BOLT_SLOTS,
  BOLT_POINTS
} from '../../assets/codex/BallLightningGeometry.js';
import {
  createOrbMaterial,
  createCoreMaterial,
  createBoltMaterial,
  createTrackMaterial,
  createWarpMaterial,
  TRACK_STRIKES
} from '../../materials/codex/BallLightningMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing, hash11 } from '../../utils/math.js';

export const ID = 'balllightning';

/** Bolt kinds. */
const NONE = 0;
const FLOOR = 1;
const BODY = 2;
const FORK = 3;
const ORBIT = 4;
const RING = 5;

const MAX_FLOOR = 4;
const MAX_FORKS = 2;
const MAX_BODIES = 4;
const MAX_ORBIT = 6;
const MAX_RING = 12;
/** Bodies one orb can be jolting at once. */
const MAX_ZAPPED = 8;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _d = new Vector3();
const _e1 = new Vector3();
const _e2 = new Vector3();
const _orb = new Vector3();
const _body = new Vector3();
const _up = new Vector3(0, 1, 0);
const _side = new Vector3(1, 0, 0);
const _m4 = new Matrix4();
/** One polyline, written then handed to the ribbons. */
const _pts = new Float32Array(BOLT_POINTS * 3);
/** No current: `carry` with zero grab only sets the buoyancy. */
const NO_FIELD = (_x, _y, _z, out) => out.set(0, 0, 0);

/**
 * BALL LIGHTNING — Storm (lightning), line cast.
 *
 * A crackling sphere of plasma swells out of the hand and drifts down the line
 * just above the floor, slowly, rolling. It scorches a charred track as it
 * goes and is never still: several times a second it throws a fresh set of
 * branching arcs to the floor around it and to every body within reach, and
 * short arcs crawl round its own skin. A body it reaches is jolted off its
 * feet — lifted, twitching on every re-roll of the arcs, charred — and dropped.
 * At the end of the line it stops, swells and destabilises, and bursts: a
 * STORM shell, a ring of arcs thrown out across the floor, a crater burned
 * into the track, a flash, and every body in the blast thrown.
 *
 * ## Layers
 *
 *   - **the orb** (`createOrbMaterial`) — a dense sphere, noise-displaced so its
 *     silhouette roils, the noise turned by a roll matrix so its surface rolls
 *     with the distance travelled; white core, blue-violet fresnel rim,
 *     electric filaments (the zero set of 3D noise), strobing. Inside it a
 *     white-hot **core sprite** (`createCoreMaterial`) with star spikes, which
 *     is also the burst's flash.
 *   - **bolts** (`BoltRibbons` + `createBoltMaterial`) — one buffer of 40
 *     camera-facing ribbons, rewritten every frame from records that hold only
 *     dice (knot offsets, target, seed): floor strikes, body strikes, their
 *     forks, orbiting skin arcs and, at the end, the burst's ring. Because the
 *     shape is *dice relative to the orb*, a bolt stays attached to the orb as
 *     it rolls between re-rolls; re-rolling simply re-throws the dice.
 *   - **the track** (`createTrackMaterial`) — one floor quad along the whole
 *     line, premultiplied: a ragged char scar drawn up to the orb, heat right
 *     under it, branching burn veins cooling behind it, embers, a flare of
 *     arcs at every floor strike, and the burst's crater. Plus engine SCORCH
 *     decals dropped every `scorchSpacing` metres and at some strikes.
 *   - **particles** — plasma motes shed off the orb, sparks thrown by every
 *     strike and by the burst, smoke rising off the fresh track.
 *   - **distortion** (`createWarpMaterial`) — ionised air shimmering at the
 *     orb's skin and the burst's pressure ring.
 *   - **feedback** — a travel rumble, a guttering light, a shake / flash /
 *     light punch on the burst, all scaled by the globals.
 *
 * ## The struck (`handlesOwnHits`)
 *
 * Every re-roll, the nearest bodies within `bodyReach` (`findBodies` — the
 * living and the fallen) are each given a strike and a fork. A standing body
 * is knocked down by its first strike with a strong lift and spin, and joins
 * the zapped list: for `zapTime` its ragdoll is made light (`carry` with zero
 * grab only sets buoyancy), every re-roll kicks it with a random twitch, and it
 * is charred (`corrode`) toward `charAmount`. Then it is released and falls.
 * The burst throws every body inside `burstRadius` outward.
 *
 * ## The editor rule
 *
 * Records hold dice and latched events only. The orb's size, height, bob and
 * look, every bolt's reach, jag, width and timing, the track and every colour
 * come from `settings.balllightning` every frame.
 */
export class BallLightningAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Live bolts. HUD readout only. */
  get instanceCount() {
    let n = 0;
    for (let i = 0; i < BOLT_SLOTS; i++) if (this.bolts[i].kind !== NONE) n++;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.trackGeometry = createTrackGeometry();
    this.trackMaterial = createTrackMaterial();
    this.track = this._mesh(this.trackGeometry, this.trackMaterial, 3);

    this.orbGeometry = createOrbGeometry();
    this.orbMaterial = createOrbMaterial();
    this.orb = this._mesh(this.orbGeometry, this.orbMaterial, 12);

    this.quadGeometry = createQuadGeometry();
    this.coreMaterial = createCoreMaterial();
    this.core = this._mesh(this.quadGeometry, this.coreMaterial, 13);

    this.ribbons = new BoltRibbons();
    this.boltMaterial = createBoltMaterial();
    this.boltMesh = this._mesh(this.ribbons.geometry, this.boltMaterial, 14);

    this.warpMaterial = createWarpMaterial();
    this.warp = new Mesh(this.quadGeometry, this.warpMaterial);
    this.warp.frustumCulled = false;
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.visible = false;
    this.group.add(this.warp);

    /** Bolt records: dice only (see the class comment). */
    this.bolts = [];
    for (let i = 0; i < BOLT_SLOTS; i++) {
      this.bolts.push({
        kind: NONE,
        born: 0,
        life: 0.1,
        seed: 0,
        dummy: null,
        end: new Vector3(), // latched world end (floor, ring)
        axis: new Vector3(0, 1, 0), // orbit arcs
        start: 0, // orbit start angle
        parent: -1, // forks
        at: 0, // fork: point index on the parent
        turn: new Vector3(), // fork: dice for its heading
        reach: 1, // fork: × forkLength
        o1: new Float32Array(BOLT_POINTS),
        o2: new Float32Array(BOLT_POINTS)
      });
    }
    /** Every slot's polyline this frame, so a fork can read its parent. */
    this._poly = new Float32Array(BOLT_SLOTS * BOLT_POINTS * 3);

    this.zapped = [];
    for (let i = 0; i < MAX_ZAPPED; i++) this.zapped.push({ dummy: null, time: 0, released: false });
    this._zapCount = 0;

    this._roll = new Matrix3();
    this._orbState = { roll: this._roll, unstable: 0, level: 1, seed: 0 };
    this._coreState = { size: 1, level: 1, seed: 0 };
    this._trackState = { length: 1, half: 4, front: 0, speed: 5, after: 0, fade: 1, seed: 0, crater: new Vector4() };
    this._warpState = { size: 2, skin: 0.3, level: 0, ring: -1 };
    this._strikeCursor = 0;

    /** The look a struck body is charred with, refreshed from settings each frame. */
    this._charLook = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0.1 };

    this._targets = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._rollTimer = 0;
    this._rolled = 0; // metres rolled — turns the surface
    this._nextScorch = 0;
    this._burst = false;
    this._burstAt = 0;
    this._scale = 0;
    this._seed = 0;
    this._craterHeat = 0;
    this._burstCentre = new Vector3();
  }

  _mesh(geometry, material, order) {
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.layers.set(LAYER.VFX);
    mesh.renderOrder = order;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.plasma = particles.get('balllightning.plasma', { capacity: 1400, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.2 });
    this.plasma.uniforms.uDrag.value = 2.2;
    this.plasma.uniforms.uEndSize.value = 0.2;
    this.plasma.uniforms.uSizeIn.value = 0.04;
    this.plasma.uniforms.uFadeIn.value = 0.03;
    this.plasma.uniforms.uFadeOut.value = 0.5;

    this.sparks = particles.get('balllightning.spark', { capacity: 1800, shape: ParticleShape.STREAK, additive: true, stretch: true, softFade: 0.15 });
    this.sparks.uniforms.uDrag.value = 2.4;
    this.sparks.uniforms.uEndSize.value = 0.2;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.01;
    this.sparks.uniforms.uFadeOut.value = 0.6;

    this.smoke = particles.get('balllightning.smoke', { capacity: 700, shape: ParticleShape.SMOKE, additive: false, curl: true, softFade: 0.5 });
    this.smoke.uniforms.uDrag.value = 1.2;
    this.smoke.uniforms.uEndSize.value = 2.4;
    this.smoke.uniforms.uSizeIn.value = 0.15;
    this.smoke.uniforms.uFadeIn.value = 0.12;
    this.smoke.uniforms.uFadeOut.value = 0.6;

    this.plasmaEmitter = new RateEmitter();
    this.smokeEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _swellTime() {
    return Math.max(0.05, settings.balllightning.swellTime * settings.global.lifetime);
  }

  get impactDuration() {
    return this._swellTime() + Math.max(0.05, settings.balllightning.burstLinger * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings.balllightning.lifetime * settings.global.lifetime);
  }

  /** Lightning gutters: a hard, stepped flicker, worse as it destabilises. */
  lightShimmer() {
    const c = settings.balllightning;
    const step = hash11(Math.floor(this.age * 24) + this._seed);
    const k = c.lightFlicker * (1 + this._orbState.unstable);
    return Math.max(0.05, 1 - k * 0.6 * step + (step > 0.85 ? k * 0.8 : 0));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    this._rollTimer = 0;
    this._rolled = 0;
    this._nextScorch = settings.balllightning.trackStart + 0.5;
    this._burst = false;
    this._burstAt = 0;
    this._scale = 0;
    this._craterHeat = 0;
    this._strikeCursor = 0;
    this._orbState.unstable = 0;
    this._orbState.level = 1;
    this._orbState.seed = Math.random() * 10;
    this._coreState.seed = Math.random();
    this._trackState.seed = Math.random() * 50;
    this._trackState.after = 0;
    this._trackState.front = 0;
    this._trackState.crater.set(0, 0, 0, 0);
    this._releaseZapped();
    this.plasmaEmitter.reset();
    this.smokeEmitter.reset();
    for (let i = 0; i < BOLT_SLOTS; i++) {
      this.bolts[i].kind = NONE;
      this.bolts[i].dummy = null;
      this.ribbons.clear(i);
    }
    this.ribbons.commit();
    for (const s of this.trackMaterial.userData.strikes) s.set(0, 0, 0, 0);
    this._roll.identity();

    // Sparks off the hand as it is thrown.
    const c = settings.balllightning;
    const g = settings.global;
    this._orbCentre(c, 0, _orb);
    this._sparkBurst(_orb, Math.round(c.castSparks * g.particleCount), c.strikeSparkSpeed, _up);
  }

  /* ------------------------------------------------------------------ */
  /* The orb                                                             */
  /* ------------------------------------------------------------------ */

  /** Live radius, metres. */
  _radius(c) {
    return Math.max(0.02, c.orbRadius * this._scale);
  }

  /** The orb's centre for a front at `this.position`; `rise` 0..1 off the hand. */
  _orbCentre(c, rise, out) {
    out.copy(this.position);
    const bob = Math.sin(this.age * c.orbBobSpeed * settings.global.animationSpeed) * c.orbBob;
    // Thrown from hand height, settling to its rolling height.
    out.y = lerp(1.35, c.orbHeight, rise) + bob;
    return out;
  }

  _updateOrb(c, unstable, visible) {
    const r = this._radius(c);
    const os = this._orbState;
    os.unstable = unstable;
    // The surface rolls: the noise is sampled through a turn about `side`.
    _m4.makeRotationAxis(this.side, -this._rolled * c.orbRoll);
    this._roll.setFromMatrix4(_m4);
    this.orbMaterial.userData.sync(os);
    this.orb.position.copy(_orb);
    this.orb.scale.setScalar(r);
    this.orb.visible = visible && r > 0.021;

    const cs = this._coreState;
    cs.size = c.coreSize * this._scale * (1 + unstable * 0.8);
    this.coreMaterial.userData.sync(cs);
    this.core.position.copy(_orb);
    this.core.visible = cs.level > 0.001 && cs.size > 0.01;

    const ws = this._warpState;
    const warp = Math.max(1.2, c.warpSize);
    ws.size = 2 * Math.max(r, c.orbRadius) * warp;
    ws.skin = Math.min(0.95, (r / Math.max(r, c.orbRadius)) / warp);
    this.warpMaterial.userData.sync(ws);
    this.warp.position.copy(_orb);
    this.warp.visible = (ws.level > 0.001 || ws.ring >= 0) && c.warpStrength + c.warpBurst > 0;
  }

  /* ------------------------------------------------------------------ */
  /* Bolts                                                               */
  /* ------------------------------------------------------------------ */

  _freeSlot() {
    for (let i = 0; i < BOLT_SLOTS; i++) if (this.bolts[i].kind === NONE) return i;
    return -1;
  }

  /** Jagged knots: a coarse wander plus fine jitter, ±1. */
  _rollKnots(b) {
    const n = BOLT_POINTS;
    const r = settings.global.randomness;
    for (let j = 0; j < n; j++) {
      b.o1[j] = (Math.random() * 2 - 1) * r;
      b.o2[j] = (Math.random() * 2 - 1) * r;
    }
  }

  _newBolt(kind, life) {
    const i = this._freeSlot();
    if (i < 0) return -1;
    const b = this.bolts[i];
    b.kind = kind;
    b.born = this.age;
    b.life = life;
    b.seed = Math.random();
    b.dummy = null;
    b.parent = -1;
    this._rollKnots(b);
    return i;
  }

  /** Throw a fresh set of arcs. Ring bolts (the burst's) are left alone. */
  _reroll(c, g) {
    for (let i = 0; i < BOLT_SLOTS; i++) {
      const b = this.bolts[i];
      if (b.kind !== RING) {
        b.kind = NONE;
        b.dummy = null;
      }
    }
    if (this._burst) return;
    const life = Math.max(0.02, c.boltLife);
    const r = this._radius(c);
    const forks = Math.min(MAX_FORKS, Math.max(0, Math.round(c.boltForks)));

    /* ---- the floor ---- */
    const floors = Math.min(MAX_FLOOR, Math.max(0, Math.round(c.floorBolts)));
    for (let k = 0; k < floors; k++) {
      const i = this._newBolt(FLOOR, life);
      if (i < 0) break;
      const b = this.bolts[i];
      const angle = Math.random() * TAU;
      const reach = c.boltReach * (0.3 + 0.7 * Math.random());
      b.end.set(_orb.x + Math.cos(angle) * reach, 0, _orb.z + Math.sin(angle) * reach);
      this._strikeFloor(c, g, b.end);
      for (let f = 0; f < forks; f++) this._newFork(i, life);
    }

    /* ---- every body in reach ---- */
    const field = this.ctx.dummies;
    if (field?.findBodies) {
      const found = field.findBodies(_orb.x, _orb.z, c.bodyReach, this._targets);
      const n = Math.min(MAX_BODIES, found.length);
      for (let k = 0; k < n; k++) {
        const dummy = found[k];
        const i = this._newBolt(BODY, life * 1.4);
        if (i < 0) break;
        this.bolts[i].dummy = dummy;
        this._newFork(i, life);
        this._zap(dummy, c);
      }
      this._targets.length = 0;
    }

    /* ---- arcs crawling round the skin ---- */
    const orbits = Math.min(MAX_ORBIT, Math.max(0, Math.round(c.orbitArcs * (1 + this._orbState.unstable))));
    for (let k = 0; k < orbits; k++) {
      const i = this._newBolt(ORBIT, life * 1.6);
      if (i < 0) break;
      const b = this.bolts[i];
      b.axis.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      if (b.axis.lengthSq() < 1e-4) b.axis.set(0, 1, 0);
      b.axis.normalize();
      b.start = Math.random() * TAU;
    }

    // The plasma sheds harder on every crack.
    _emit.position = _orb;
    _emit.radius = r;
    _emit.direction = _up;
    _emit.speed = c.plasmaSpeed * 1.5;
    _emit.speedVariance = 0.6;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.08;
    _emit.sizeVariance = 0.6;
    _emit.life = c.plasmaLifetime;
    _emit.lifeVariance = 0.5;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.plasma.emit(Math.round(6 * g.particleCount), _emit);
  }

  _newFork(parent, life) {
    const i = this._newBolt(FORK, life * 0.8);
    if (i < 0) return -1;
    const b = this.bolts[i];
    b.parent = parent;
    b.at = 3 + Math.floor(Math.random() * (BOLT_POINTS - 8));
    b.turn.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    b.reach = 0.55 + Math.random() * 0.45;
    return i;
  }

  /** Where a bolt ends this frame. */
  _boltEnd(b, out) {
    if (b.kind === BODY && b.dummy) {
      if (b.dummy.alive) return out.set(b.dummy.position.x, 1.15, b.dummy.position.z);
      if (b.dummy.bodyPoint(out)) return out;
      return out.set(b.dummy.position.x, 0.3, b.dummy.position.z);
    }
    return out.copy(b.end);
  }

  /**
   * A straight run from a to b, kinked at `segments` knots by the bolt's dice,
   * displaced across the run in two axes, pinned at both ends.
   */
  _jagged(b, a, end, jag, out) {
    const c = settings.balllightning;
    const n = BOLT_POINTS;
    _d.subVectors(end, a);
    const len = Math.max(1e-3, _d.length());
    _d.divideScalar(len);
    _e1.crossVectors(_d, Math.abs(_d.y) < 0.95 ? _up : _side).normalize();
    _e2.crossVectors(_d, _e1);
    const knots = Math.min(n, Math.max(3, Math.round(c.boltSegments)));
    for (let j = 0; j < n; j++) {
      const t = j / (n - 1);
      // Kinked at knots: linear between them, so a bolt is straight runs.
      const kt = t * (knots - 1);
      const k0 = Math.floor(kt);
      const k1 = Math.min(knots - 1, k0 + 1);
      const f = kt - k0;
      const o1 = lerp(b.o1[k0], b.o1[k1], f) + b.o1[(j * 7) % n] * 0.18;
      const o2 = lerp(b.o2[k0], b.o2[k1], f) + b.o2[(j * 5) % n] * 0.18;
      const env = Math.pow(Math.sin(Math.PI * t), 0.75) * len * jag;
      out[j * 3] = a.x + _d.x * len * t + (_e1.x * o1 + _e2.x * o2) * env;
      out[j * 3 + 1] = Math.max(0.02, a.y + _d.y * len * t + (_e1.y * o1 + _e2.y * o2) * env);
      out[j * 3 + 2] = a.z + _d.z * len * t + (_e1.z * o1 + _e2.z * o2) * env;
    }
    return len;
  }

  /** Every bolt's polyline for this frame, written to the ribbons. */
  _updateBolts(c) {
    this.boltMaterial.userData.sync();
    const r = this._radius(c);
    const grow = Math.max(0.005, c.boltGrowTime);
    const n = BOLT_POINTS;
    let live = 0;

    for (let i = 0; i < BOLT_SLOTS; i++) {
      const b = this.bolts[i];
      const age = this.age - b.born;
      if (b.kind === NONE || age > b.life * 2.5) {
        b.kind = NONE;
        this.ribbons.clear(i);
        continue;
      }
      let width = 1;
      let taper = 0.55;
      let bright = 1;
      const base = i * n * 3;

      if (b.kind === FLOOR || b.kind === BODY || b.kind === RING) {
        this._boltEnd(b, _b);
        if (b.kind === RING) {
          _a.set(this._burstCentre.x, Math.max(0.3, this._burstCentre.y * 0.6), this._burstCentre.z);
          width = 1.3;
          taper = 0.7;
        } else {
          // Leaves the orb's skin on the side facing its target.
          _d.subVectors(_b, _orb).normalize();
          _a.copy(_orb).addScaledVector(_d, r * 0.85);
          width = b.kind === BODY ? 1.1 : 1;
        }
        this._jagged(b, _a, _b, c.boltJag, _pts);
      } else if (b.kind === FORK) {
        const p = this.bolts[b.parent];
        if (!p || p.kind === NONE) {
          b.kind = NONE;
          this.ribbons.clear(i);
          continue;
        }
        const pi = (b.parent * n + b.at) * 3;
        const pj = (b.parent * n + b.at + 1) * 3;
        _a.set(this._poly[pi], this._poly[pi + 1], this._poly[pi + 2]);
        _d.set(this._poly[pj] - _a.x, this._poly[pj + 1] - _a.y, this._poly[pj + 2] - _a.z);
        if (_d.lengthSq() < 1e-8) _d.set(0, -1, 0);
        _d.normalize().addScaledVector(b.turn, c.forkSpread).normalize();
        // A fork is a share of what is left of its parent.
        _e1.set(this._poly[(b.parent * n + n - 1) * 3], 0, this._poly[(b.parent * n + n - 1) * 3 + 2]);
        const parentLeft = Math.max(0.3, _e1.distanceTo(_a));
        _b.copy(_a).addScaledVector(_d, parentLeft * c.forkLength * b.reach);
        _b.y = Math.max(0.02, _b.y);
        this._jagged(b, _a, _b, c.boltJag * 1.2, _pts);
        width = 0.6;
        taper = 0.8;
        bright = 0.8;
      } else if (b.kind === ORBIT) {
        // An arc round the skin about a random axis.
        _e1.crossVectors(b.axis, Math.abs(b.axis.y) < 0.95 ? _up : _side).normalize();
        _e2.crossVectors(b.axis, _e1);
        const R = r * c.orbitRadius;
        const jag = r * c.orbitJag;
        for (let j = 0; j < n; j++) {
          const t = j / (n - 1);
          const ang = b.start + t * c.orbitSpan + this.age * 3;
          const rr = R + b.o1[j] * jag;
          _pts[j * 3] = _orb.x + (_e1.x * Math.cos(ang) + _e2.x * Math.sin(ang)) * rr + b.axis.x * b.o2[j] * jag;
          _pts[j * 3 + 1] = _orb.y + (_e1.y * Math.cos(ang) + _e2.y * Math.sin(ang)) * rr + b.axis.y * b.o2[j] * jag;
          _pts[j * 3 + 2] = _orb.z + (_e1.z * Math.cos(ang) + _e2.z * Math.sin(ang)) * rr + b.axis.z * b.o2[j] * jag;
        }
        width = c.orbitWidth;
        taper = 0;
        bright = 0.9;
      }

      for (let k = 0; k < n * 3; k++) this._poly[base + k] = _pts[k];
      // A flash: full on the strike, gone over its life.
      const k = saturate(age / b.life);
      const level = (1 - k * k) * bright * (b.kind === RING ? 1.4 : 1);
      if (level <= 0.001) {
        this.ribbons.clear(i);
        continue;
      }
      const g2 = b.kind === ORBIT ? 1 : saturate(age / (b.kind === RING ? grow * 4 : grow));
      this.ribbons.writeBolt(i, _pts, width, level, taper, g2, b.seed);
      live++;
    }
    this.ribbons.commit();
    this.boltMesh.visible = live > 0;
  }

  /* ------------------------------------------------------------------ */
  /* What the bolts do                                                   */
  /* ------------------------------------------------------------------ */

  /** A strike on the floor: sparks, a flare on the track, sometimes a scorch. */
  _strikeFloor(c, g, at) {
    this._sparkBurst(_pos.copy(at).setY(0.05), Math.round(c.strikeSparks * g.particleCount), c.strikeSparkSpeed, _up);
    this._trackStrike(at, 1, c.strikeRadius);
    if (Math.random() < c.strikeScorchChance) {
      this.ctx.decals.spawn(DecalType.SCORCH, at, {
        radius: c.strikeScorchRadius,
        life: c.scorchLife * g.lifetime,
        intensity: 0.7,
        colorA: getColor(c.colorTrackChar),
        colorB: getColor(c.colorTrackEmber),
        height: 0.02
      });
    }
  }

  /** Register a flare in the track's ring buffer, in track coordinates. */
  _trackStrike(at, heat, radius) {
    const s = this.trackMaterial.userData.strikes[this._strikeCursor];
    this._strikeCursor = (this._strikeCursor + 1) % TRACK_STRIKES;
    _d.subVectors(at, this.origin);
    s.set(_d.dot(this.direction), _d.dot(this.side), heat, radius);
  }

  _sparkBurst(at, count, speed, dir) {
    const c = settings.balllightning;
    if (count <= 0) return;
    _emit.position = at;
    _emit.radius = 0.05;
    _emit.direction = dir;
    _emit.speed = speed;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.9;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.06;
    _emit.sizeVariance = 0.5;
    _emit.life = c.sparkLifetime;
    _emit.lifeVariance = 0.5;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.sparks.emit(count, _emit);
  }

  /** A strike on a body: knock it off its feet the first time, twitch it after. */
  _zap(dummy, c) {
    const g = settings.global;
    _d.set(dummy.position.x - _orb.x, 0, dummy.position.z - _orb.z);
    if (_d.lengthSq() < 1e-6) _d.copy(this.direction);
    _d.normalize();

    if (dummy.alive) {
      this._force.impulse = c.zapImpulse;
      this._force.lift = c.zapLift;
      this._force.spin = c.zapSpin;
      if (!dummy.kill(_d.x, _d.z, this._force)) return;
      if (this._zapCount < MAX_ZAPPED) {
        const slot = this.zapped[this._zapCount++];
        slot.dummy = dummy;
        slot.time = 0;
        slot.released = false;
      }
      this.ctx.shake.add(0.08 * g.cameraShake, 8, 30);
      this.lightBoost = Math.min(this.lightBoost + c.lightIntensity * 0.8, c.lightIntensity * 3);
      if (dummy.bodyPoint(_body)) this._sparkBurst(_body, Math.round(c.strikeSparks * 2 * g.particleCount), c.strikeSparkSpeed, _up);
      return;
    }

    // Already down: every crack makes it jump.
    let fresh = 1;
    for (let i = 0; i < this._zapCount; i++) {
      const slot = this.zapped[i];
      if (slot.dummy === dummy) fresh = slot.released ? 0.35 : 1 - saturate(slot.time / Math.max(0.05, c.zapTime)) * 0.6;
    }
    const tw = c.zapTwitch * fresh * g.randomness;
    dummy.shove((Math.random() * 2 - 1) * tw + _d.x * tw * 0.3, Math.random() * tw * 0.7, (Math.random() * 2 - 1) * tw + _d.z * tw * 0.3);
    if (dummy.bodyPoint(_body)) this._sparkBurst(_body, Math.round(c.strikeSparks * g.particleCount), c.strikeSparkSpeed * 0.6, _up);
  }

  /** Keep the jolted light, charred, held off the burn; then let them fall. */
  _updateZapped(c, dt) {
    const zapTime = Math.max(0.05, c.zapTime);
    const look = this._charLook;
    look.color = c.colorCharBody;
    look.rimColor = c.colorCharRim;
    look.rimEmissive = c.charRimGlow;
    look.edgeColor = c.colorCharEdge;
    look.edgeEmissive = c.charEdgeGlow;
    look.edgeWidth = c.charEdgeWidth;
    for (let i = 0; i < this._zapCount; i++) {
      const slot = this.zapped[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) continue;
      slot.time += dt;
      dummy.corrode(c.charAmount * saturate(slot.time / Math.max(0.05, c.charTime)), look);
      if (slot.released) continue;
      if (slot.time < zapTime) {
        // The current carries part of its weight: it hangs in the arcs.
        dummy.carry(NO_FIELD, 0, 0, saturate(c.zapFloat * (1 - slot.time / zapTime)));
        dummy.hold();
      } else {
        slot.released = true;
        dummy.release();
      }
    }
  }

  _releaseZapped() {
    for (let i = 0; i < this._zapCount; i++) {
      const slot = this.zapped[i];
      if (slot.dummy && !slot.dummy.finished && !slot.released) slot.dummy.release();
      slot.dummy = null;
      slot.released = true;
    }
    this._zapCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Particles and the track                                             */
  /* ------------------------------------------------------------------ */

  _syncParticles(c, g) {
    const p = this.plasma;
    p.setGradient(getColor(c.colorPlasmaA), getColor(c.colorPlasmaB), getColor(c.colorPlasmaC), getColor(c.colorPlasmaD));
    p.uniforms.uGravity.value.set(0, 0.4, 0);
    p.uniforms.uSizeScale.value = c.plasmaSize * g.particleSize * 7;
    p.uniforms.uLifeScale.value = g.particleLifetime;
    p.uniforms.uSpeedScale.value = g.particleSpeed;
    p.uniforms.uOpacity.value = g.opacity;
    p.uniforms.uGlow.value = c.plasmaGlow * g.glow;
    p.uniforms.uTurbulence.value = 0.8 * g.turbulence;

    const s = this.sparks;
    s.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    s.uniforms.uGravity.value.set(0, -8, 0);
    s.uniforms.uSizeScale.value = c.sparkSize * g.particleSize * 7;
    s.uniforms.uLifeScale.value = g.particleLifetime;
    s.uniforms.uSpeedScale.value = g.particleSpeed;
    s.uniforms.uOpacity.value = g.opacity;
    s.uniforms.uGlow.value = c.sparkGlow * g.glow;
    s.uniforms.uStretch.value = c.sparkStretch;
    s.uniforms.uTurbulence.value = 0.15 * g.turbulence;

    const m = this.smoke;
    m.setGradient(getColor(c.colorSmokeA), getColor(c.colorSmokeB), getColor(c.colorSmokeC), getColor(c.colorSmokeD));
    m.uniforms.uGravity.value.set(0, c.smokeRise, 0);
    m.uniforms.uSizeScale.value = c.smokeSize * g.particleSize * 7;
    m.uniforms.uLifeScale.value = g.particleLifetime;
    m.uniforms.uSpeedScale.value = g.particleSpeed;
    m.uniforms.uOpacity.value = c.smokeOpacity * g.opacity;
    m.uniforms.uGlow.value = 1;
    m.uniforms.uTurbulence.value = 0.6 * g.turbulence;
  }

  _updateTrack(c, g, dt, fade) {
    const ts = this._trackState;
    ts.length = this.length;
    ts.half = Math.max(c.boltReach, c.burstCrater * 1.3, c.trackWidth * 2) + 0.6;
    ts.front = this.front;
    ts.speed = Math.max(0.1, c.speed * g.speed);
    ts.fade = fade;
    this._craterHeat *= Math.exp(-1.3 * dt);
    if (this._burst) ts.crater.set(this.length, c.burstCrater * g.explosionIntensity, this._craterHeat, 1);
    for (const s of this.trackMaterial.userData.strikes) s.z *= Math.exp(-6 * dt);
    this.trackMaterial.userData.sync(ts);

    this.track.position.copy(this.origin).addScaledVector(this.direction, this.length * 0.5);
    this.track.position.y = 0.03;
    this.track.rotation.set(0, Math.atan2(-this.direction.x, -this.direction.z), 0);
    this.track.scale.set(ts.half * 2, 1, this.length);
    this.track.visible = fade > 0.001;
  }

  /** While it rolls: plasma off the skin, smoke off the fresh char, scorch decals. */
  _rollFx(c, g, dt) {
    if (dt <= 0) return;
    const time = frame.uTime.value;
    const r = this._radius(c);
    const count = Math.round(this.plasmaEmitter.tick(dt, c.plasmaRate * g.emissionRate) * g.particleCount);
    if (count > 0) {
      _emit.position = _orb;
      _emit.radius = r * 0.9;
      _emit.direction = _d.copy(this.direction).negate().addScaledVector(_up, 0.6);
      _emit.speed = c.plasmaSpeed;
      _emit.speedVariance = 0.6;
      _emit.spread = 1;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.08;
      _emit.sizeVariance = 0.6;
      _emit.life = c.plasmaLifetime;
      _emit.lifeVariance = 0.5;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = time;
      this.plasma.emit(count, _emit);
    }

    if (this.front > c.trackStart) {
      const smoke = Math.round(this.smokeEmitter.tick(dt, c.smokeRate * g.emissionRate) * g.particleCount);
      if (smoke > 0) {
        this.pointAt(saturate((this.front - 0.6) / this.length), _pos);
        _pos.y = 0.15;
        _emit.position = _pos;
        _emit.radius = c.trackWidth * 0.6;
        _emit.direction = _up;
        _emit.speed = c.smokeRise;
        _emit.speedVariance = 0.5;
        _emit.spread = 0.4;
        _emit.inherit = null;
        _emit.anchor = null;
        _emit.size = 0.5;
        _emit.sizeVariance = 0.5;
        _emit.life = c.smokeLifetime;
        _emit.lifeVariance = 0.4;
        _emit.spin = 0.6;
        _emit.tint = null;
        _emit.time = time;
        this.smoke.emit(smoke, _emit);
      }
    }

    const spacing = Math.max(0.2, c.scorchSpacing);
    while (this.front >= this._nextScorch && this._nextScorch <= this.length) {
      this.pointAt(this._nextScorch / this.length, _pos);
      this.ctx.decals.spawn(DecalType.SCORCH, _pos, {
        radius: c.scorchRadius,
        life: c.scorchLife * g.lifetime,
        intensity: 0.8,
        colorA: getColor(c.colorTrackChar),
        colorB: getColor(c.colorTrackEmber),
        height: 0.02
      });
      this._nextScorch += spacing;
    }
  }

  /* ------------------------------------------------------------------ */
  /* The burst                                                           */
  /* ------------------------------------------------------------------ */

  _doBurst(c, g) {
    this._burst = true;
    this._burstAt = this.age;
    this._craterHeat = 1;
    this._burstCentre.copy(_orb);
    const time = frame.uTime.value;
    const r = this._radius(c);

    this.ctx.bursts.spawn(BurstMode.STORM, _orb, {
      radius: r,
      endRadius: c.burstShell * g.explosionIntensity,
      life: c.burstLife,
      intensity: 2.4,
      opacity: 0.9 * g.opacity,
      turbulence: 1,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    _pos.set(_orb.x, 0, _orb.z);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.shockRadius * g.explosionIntensity,
      life: c.shockLife,
      width: 0.07,
      intensity: 1.2,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.04
    });
    this.ctx.decals.spawn(DecalType.SCORCH, _pos, {
      radius: c.burstScorch * g.explosionIntensity,
      life: c.scorchLife * g.lifetime * 1.5,
      intensity: 1,
      colorA: getColor(c.colorTrackChar),
      colorB: getColor(c.colorTrackEmber),
      height: 0.02
    });

    // The ring of arcs: every other bolt is gone, these are thrown out flat.
    for (let i = 0; i < BOLT_SLOTS; i++) {
      this.bolts[i].kind = NONE;
      this.bolts[i].dummy = null;
    }
    const ring = Math.min(MAX_RING, Math.max(0, Math.round(c.burstRingBolts)));
    const turn = Math.random() * TAU;
    for (let k = 0; k < ring; k++) {
      const i = this._newBolt(RING, Math.max(0.05, c.burstRingLife));
      if (i < 0) break;
      const b = this.bolts[i];
      const angle = turn + (k / Math.max(1, ring)) * TAU + (Math.random() - 0.5) * 0.4;
      const reach = c.burstRingReach * (0.7 + 0.3 * Math.random()) * g.explosionIntensity;
      b.end.set(_orb.x + Math.cos(angle) * reach, 0, _orb.z + Math.sin(angle) * reach);
      if (k < TRACK_STRIKES) this._trackStrike(b.end, 1.5, c.strikeRadius * 1.4);
      this._sparkBurst(_a.copy(b.end).setY(0.05), Math.round(c.strikeSparks * g.particleCount), c.strikeSparkSpeed, _up);
    }

    this._sparkBurst(_orb, Math.round(c.burstSparks * g.particleCount), c.burstSparkSpeed, _up);
    _emit.position = _orb;
    _emit.radius = r;
    _emit.direction = _up;
    _emit.speed = c.plasmaSpeed * 5;
    _emit.speedVariance = 0.6;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.6;
    _emit.life = c.plasmaLifetime * 1.5;
    _emit.lifeVariance = 0.5;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
    this.plasma.emit(Math.round(140 * g.particleCount), _emit);

    _pos.set(_orb.x, 0.2, _orb.z);
    _emit.position = _pos;
    _emit.radius = c.burstScorch * 0.5;
    _emit.speed = c.smokeRise * 2;
    _emit.size = 0.7;
    _emit.life = c.smokeLifetime * 1.3;
    _emit.spin = 0.6;
    this.smoke.emit(Math.round(30 * g.particleCount), _emit);

    this.ctx.shake.add(c.burstShake * g.cameraShake, 4, 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.burstFlash * g.explosionIntensity);
    this.lightBoost = c.burstLight * g.explosionIntensity;

    this._blast(c, g);
  }

  /** Everything in the blast is thrown outward; the jolted are let go. */
  _blast(c, g) {
    const field = this.ctx.dummies;
    this._releaseZapped();
    if (!field?.findBodies) return;
    const found = field.findBodies(_orb.x, _orb.z, c.burstRadius * g.explosionIntensity, this._targets);
    this._force.impulse = c.burstImpulse * g.explosionIntensity;
    this._force.lift = c.burstLift;
    this._force.spin = c.burstSpin;
    for (let i = 0; i < found.length; i++) {
      const dummy = found[i];
      const at = dummy.alive ? dummy.position : dummy.bodyPoint(_body) ?? dummy.position;
      _d.set(at.x - _orb.x, 0, at.z - _orb.z);
      const dist = _d.length();
      if (dist < 1e-4) _d.copy(this.direction);
      else _d.divideScalar(dist);
      if (dummy.alive) {
        dummy.kill(_d.x, _d.z, this._force);
      } else {
        const k = 1 - saturate(dist / Math.max(0.1, c.burstRadius));
        dummy.shove(_d.x * c.burstImpulse * k, c.burstLift * 0.6 * k, _d.z * c.burstImpulse * k);
      }
      dummy.corrode(c.charAmount, this._charLook);
    }
    this._targets.length = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  /** Shared per-frame work for every phase. */
  _frame(dt, unstable, orbVisible) {
    const c = settings.balllightning;
    const g = settings.global;
    this._syncParticles(c, g);

    // Re-roll the arcs on their own clock — faster as it destabilises.
    const rate = Math.max(0.5, c.boltRate * (1 + unstable * (c.swellRate - 1)));
    this._rollTimer -= dt;
    if (orbVisible && this._rollTimer <= 0) {
      this._rollTimer = 1 / rate;
      this._reroll(c, g);
    }

    this._updateOrb(c, unstable, orbVisible);
    this._updateBolts(c);
    this._updateZapped(c, dt);
  }

  onTravel(dt) {
    const c = settings.balllightning;
    const g = settings.global;
    this._rolled = this.front;
    // Swells out of the hand, then settles to its rolling height.
    this._scale = Easing.outBack(saturate(this.age / Math.max(0.02, c.orbSpawnTime)));
    this._orbCentre(c, Easing.outCubic(saturate(this.age / 0.5)), _orb);
    this.position.copy(_orb);
    this._orbState.level = 1;
    this._coreState.level = 1;
    this._warpState.level = 1;
    this._warpState.ring = -1;
    this._frame(dt, 0, true);
    this._trackState.after = 0;
    this._updateTrack(c, g, dt, 1);
    this._rollFx(c, g, dt);
    if (dt > 0) this.ctx.shake.rumble(c.travelRumble * g.cameraShake, dt);
  }

  onImpact() {
    // The orb stops at the end of the line; the swell starts now.
    this._burstCentre.copy(this.position);
  }

  onFade(dt) {
    const c = settings.balllightning;
    const g = settings.global;
    const swell = this._swellTime();

    let unstable = 0;
    let visible = !this._burst;
    if (this.phase === AbilityPhase.IMPACT && !this._burst) {
      const k = saturate(this.impactTime / swell);
      unstable = k;
      this._scale = lerp(1, c.swellScale, Easing.inQuad(k)) * (1 + (Math.random() - 0.5) * 0.08 * k * g.randomness);
      if (dt > 0) this.ctx.shake.rumble((c.travelRumble + 0.15 * k) * g.cameraShake, dt);
    }
    this._orbCentre(c, 1, _orb);
    this.position.copy(_orb);

    if (!this._burst && this.impactTime >= swell) {
      this._doBurst(c, g);
      visible = false;
    }

    // After the burst: the core is the flash, and dies fast.
    if (this._burst) {
      const since = this.age - this._burstAt;
      const flash = Math.exp(-since * 7);
      this._coreState.level = 4 * flash;
      this._scale = c.swellScale * (1 + since * 6);
      this._orbState.level = 0;
      this._warpState.level = 0;
      const ringTime = Math.max(0.05, c.warpRingTime);
      this._warpState.ring = since < ringTime ? Easing.outQuad(since / ringTime) : -1;
      this._trackState.after += dt;
    } else {
      this._orbState.level = 1 + unstable * 0.5;
      this._coreState.level = 1 + unstable * 1.5;
      this._warpState.level = 1 + unstable;
      this._warpState.ring = -1;
    }

    this._frame(dt, unstable, visible);
    let fade = 1;
    if (this.phase === AbilityPhase.FADE) fade = 1 - Easing.inQuad(saturate(this.fadeTime / this.fadeDuration));
    this._updateTrack(c, g, dt, fade);
    if (!this._burst) this._rollFx(c, g, dt);
  }

  onDestroy() {
    this._releaseZapped();
    for (let i = 0; i < BOLT_SLOTS; i++) {
      this.bolts[i].kind = NONE;
      this.bolts[i].dummy = null;
    }
    this.orb.visible = false;
    this.core.visible = false;
    this.boltMesh.visible = false;
    this.track.visible = false;
    this.warp.visible = false;
  }

  dispose() {
    this.trackGeometry.dispose();
    this.orbGeometry.dispose();
    this.quadGeometry.dispose();
    this.ribbons.dispose();
    for (const material of [this.trackMaterial, this.orbMaterial, this.coreMaterial, this.boltMaterial, this.warpMaterial]) {
      material.dispose();
    }
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('ϟ  Ball Lightning');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 0.5, 30, 0.1, 'roll speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 8, 0.05, 'track cools over');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'travelRumble', 0, 0.3, 0.005, 'rolling rumble');
  R(cast, c, 'castSparks', 0, 200, 1, 'sparks off the hand');
  cast.addColor(c, 'colorA').name('accent');
  cast.addColor(c, 'colorB').name('accent, hot');
  Editor.castAnimation(cast, c);

  const orb = folder.addFolder('1 · The orb');
  R(orb, c, 'orbRadius', 0.1, 2, 0.01, 'radius (m)');
  R(orb, c, 'orbHeight', 0.2, 3, 0.01, 'rolls at height (m)');
  R(orb, c, 'orbBob', 0, 0.5, 0.005, 'bob (m)');
  R(orb, c, 'orbBobSpeed', 0, 20, 0.1, 'bob speed');
  R(orb, c, 'orbSpawnTime', 0.02, 1.5, 0.01, 'swells out over');
  R(orb, c, 'orbRoll', 0, 6, 0.05, 'roll (rad/m)');
  R(orb, c, 'orbDisplace', 0, 0.6, 0.005, 'roil (× radius)');
  R(orb, c, 'orbDisplaceScale', 0.3, 8, 0.05, 'roil scale');
  R(orb, c, 'orbBoil', 0, 8, 0.05, 'roil speed');
  R(orb, c, 'orbFresnel', 0.3, 8, 0.05, 'rim tightness');
  R(orb, c, 'orbRim', 0, 10, 0.05, 'rim glow');
  R(orb, c, 'orbCore', 0, 10, 0.05, 'core glow');
  R(orb, c, 'orbCoreSize', 0.2, 8, 0.05, 'core falloff');
  R(orb, c, 'filamentGlow', 0, 10, 0.05, 'filament glow');
  R(orb, c, 'filamentScale', 0.3, 10, 0.05, 'filament scale');
  R(orb, c, 'filamentSharp', 1, 40, 0.5, 'filament thinness');
  R(orb, c, 'filamentSpeed', 0, 10, 0.05, 'filament speed');
  R(orb, c, 'orbFlicker', 0, 1, 0.01, 'strobe');
  R(orb, c, 'orbFlickerRate', 0, 60, 0.5, 'strobe rate');
  R(orb, c, 'orbOpacity', 0, 1, 0.01, 'opacity');
  R(orb, c, 'orbIntensity', 0, 6, 0.05, 'intensity');
  orb.addColor(c, 'colorOrbCore').name('core');
  orb.addColor(c, 'colorOrbInner').name('inner');
  orb.addColor(c, 'colorOrbRim').name('rim');
  orb.addColor(c, 'colorFilament').name('filaments');
  const core = orb.addFolder('Hot core & skin arcs');
  R(core, c, 'coreGlow', 0, 8, 0.05, 'core sprite glow');
  R(core, c, 'coreSize', 0.1, 6, 0.05, 'core sprite size (m)');
  R(core, c, 'coreSpikes', 0, 3, 0.01, 'core spikes');
  R(core, c, 'orbitArcs', 0, MAX_ORBIT, 1, 'skin arcs');
  R(core, c, 'orbitRadius', 0.8, 3, 0.01, 'arc radius (× orb)');
  R(core, c, 'orbitSpan', 0.2, 6, 0.05, 'arc span (rad)');
  R(core, c, 'orbitJag', 0, 1, 0.01, 'arc jag (× orb)');
  R(core, c, 'orbitWidth', 0.1, 2, 0.01, 'arc width');

  const bolt = folder.addFolder('2 · Bolts');
  R(bolt, c, 'boltRate', 0.5, 40, 0.5, 're-rolls / s');
  R(bolt, c, 'boltLife', 0.02, 0.6, 0.005, 'flash life');
  R(bolt, c, 'boltGrowTime', 0.005, 0.3, 0.005, 'races out over');
  R(bolt, c, 'floorBolts', 0, MAX_FLOOR, 1, 'floor strikes');
  R(bolt, c, 'boltReach', 0.5, 8, 0.05, 'floor reach (m)');
  R(bolt, c, 'bodyReach', 0, 10, 0.05, 'body reach (m)');
  R(bolt, c, 'boltSegments', 3, BOLT_POINTS, 1, 'kinks');
  R(bolt, c, 'boltJag', 0, 0.6, 0.005, 'jag (× length)');
  R(bolt, c, 'boltForks', 0, MAX_FORKS, 1, 'forks');
  R(bolt, c, 'forkLength', 0.05, 1, 0.01, 'fork length');
  R(bolt, c, 'forkSpread', 0, 3, 0.01, 'fork spread');
  R(bolt, c, 'boltWidth', 0.01, 0.8, 0.005, 'glow width (m)');
  R(bolt, c, 'boltCore', 0.002, 0.2, 0.001, 'core width (m)');
  R(bolt, c, 'boltFalloff', 0.3, 8, 0.05, 'falloff');
  R(bolt, c, 'boltIntensity', 0, 15, 0.05, 'intensity');
  R(bolt, c, 'boltOpacity', 0, 1, 0.01, 'opacity');
  R(bolt, c, 'boltCrawl', 0, 1.5, 0.01, 'plasma crawl');
  R(bolt, c, 'boltCrawlScale', 0.5, 40, 0.5, 'crawl scale');
  R(bolt, c, 'boltCrawlSpeed', 0, 40, 0.5, 'crawl speed');
  R(bolt, c, 'boltFlicker', 0, 1, 0.01, 'flicker');
  bolt.addColor(c, 'colorBoltCore').name('core');
  bolt.addColor(c, 'colorBoltGlow').name('glow');
  bolt.addColor(c, 'colorBoltEdge').name('edge');
  const strike = bolt.addFolder('Floor strikes');
  R(strike, c, 'strikeRadius', 0.05, 3, 0.01, 'flare radius (m)');
  R(strike, c, 'strikeGlow', 0, 10, 0.05, 'flare glow');
  R(strike, c, 'strikeSparks', 0, 60, 1, 'sparks');
  R(strike, c, 'strikeSparkSpeed', 0, 25, 0.1, 'spark speed');
  R(strike, c, 'strikeScorchChance', 0, 1, 0.01, 'scorch chance');
  R(strike, c, 'strikeScorchRadius', 0.05, 3, 0.01, 'scorch radius (m)');

  const track = folder.addFolder('3 · Scorched track');
  R(track, c, 'trackWidth', 0.05, 3, 0.01, 'half-width (m)');
  R(track, c, 'trackStart', 0, 5, 0.05, 'starts at (m)');
  R(track, c, 'trackChar', 0, 1, 0.01, 'char');
  R(track, c, 'trackEdgeNoise', 0, 1, 0.01, 'ragged edge');
  R(track, c, 'trackEdgeScale', 0.1, 8, 0.05, 'edge scale');
  R(track, c, 'trackHeat', 0, 12, 0.05, 'heat under orb');
  R(track, c, 'trackHeatLength', 0.1, 8, 0.05, 'heat trail (m)');
  R(track, c, 'trackCool', 0.05, 6, 0.05, 'veins cool over');
  R(track, c, 'trackVeins', 0, 8, 0.05, 'burn veins');
  R(track, c, 'trackVeinScale', 0.2, 10, 0.05, 'vein scale');
  R(track, c, 'trackVeinSharp', 1, 40, 0.5, 'vein thinness');
  R(track, c, 'trackEmbers', 0, 5, 0.05, 'embers');
  track.addColor(c, 'colorTrackChar').name('char');
  track.addColor(c, 'colorTrackHot').name('hot');
  track.addColor(c, 'colorTrackEmber').name('embers');
  R(track, c, 'scorchSpacing', 0.2, 6, 0.05, 'scorch every (m)');
  R(track, c, 'scorchRadius', 0.1, 4, 0.05, 'scorch radius (m)');
  R(track, c, 'scorchLife', 0.2, 12, 0.1, 'scorch life');

  const parts = folder.addFolder('4 · Plasma, sparks & smoke');
  R(parts, c, 'plasmaRate', 0, 500, 1, 'plasma / s');
  R(parts, c, 'plasmaSize', 0.01, 0.4, 0.005, 'plasma size');
  R(parts, c, 'plasmaLifetime', 0.05, 3, 0.01, 'plasma lifetime');
  R(parts, c, 'plasmaSpeed', 0, 8, 0.05, 'plasma speed');
  R(parts, c, 'plasmaGlow', 0, 8, 0.05, 'plasma glow');
  Editor.gradient(parts, c, 'colorPlasma', 'plasma colour');
  R(parts, c, 'sparkSize', 0.005, 0.3, 0.005, 'spark size');
  R(parts, c, 'sparkLifetime', 0.05, 2, 0.01, 'spark lifetime');
  R(parts, c, 'sparkStretch', 0, 2, 0.01, 'spark stretch');
  R(parts, c, 'sparkGlow', 0, 8, 0.05, 'spark glow');
  Editor.gradient(parts, c, 'colorSpark', 'spark colour');
  R(parts, c, 'smokeRate', 0, 200, 1, 'smoke / s');
  R(parts, c, 'smokeSize', 0.05, 2, 0.01, 'smoke size');
  R(parts, c, 'smokeLifetime', 0.1, 6, 0.05, 'smoke lifetime');
  R(parts, c, 'smokeRise', 0, 3, 0.05, 'smoke rise (m/s)');
  R(parts, c, 'smokeOpacity', 0, 1, 0.01, 'smoke opacity');
  Editor.gradient(parts, c, 'colorSmoke', 'smoke colour');

  const zap = folder.addFolder('5 · The struck');
  R(zap, c, 'zapTime', 0.05, 4, 0.05, 'jolts for');
  R(zap, c, 'zapImpulse', 0, 10, 0.1, 'first strike impulse');
  R(zap, c, 'zapLift', 0, 12, 0.1, 'first strike lift');
  R(zap, c, 'zapSpin', 0, 6, 0.05, 'first strike spin');
  R(zap, c, 'zapTwitch', 0, 8, 0.05, 'twitch (m/s)');
  R(zap, c, 'zapFloat', 0, 1, 0.01, 'held up by the current');
  R(zap, c, 'charAmount', 0, 1, 0.01, 'charred');
  R(zap, c, 'charTime', 0.05, 3, 0.05, 'chars over');
  zap.addColor(c, 'colorCharBody').name('charred body');
  zap.addColor(c, 'colorCharRim').name('charred rim');
  R(zap, c, 'charRimGlow', 0, 8, 0.05, 'rim glow');
  zap.addColor(c, 'colorCharEdge').name('charred edge');
  R(zap, c, 'charEdgeGlow', 0, 10, 0.05, 'edge glow');
  R(zap, c, 'charEdgeWidth', 0.01, 0.5, 0.005, 'edge width');

  const burst = folder.addFolder('6 · The burst');
  R(burst, c, 'swellTime', 0.05, 3, 0.01, 'swells for');
  R(burst, c, 'swellScale', 1, 4, 0.01, 'swells to (× radius)');
  R(burst, c, 'swellBoil', 1, 6, 0.05, 'destabilises (× roil)');
  R(burst, c, 'swellRate', 1, 5, 0.05, 'arcs faster (×)');
  R(burst, c, 'burstLinger', 0.05, 3, 0.05, 'linger after');
  R(burst, c, 'burstRadius', 0, 12, 0.05, 'blast radius (m)');
  R(burst, c, 'burstShell', 0, 14, 0.05, 'storm shell (m)');
  R(burst, c, 'burstLife', 0.05, 3, 0.01, 'shell life');
  R(burst, c, 'burstRingBolts', 0, MAX_RING, 1, 'ring arcs');
  R(burst, c, 'burstRingReach', 0.5, 12, 0.05, 'ring reach (m)');
  R(burst, c, 'burstRingLife', 0.05, 2, 0.01, 'ring life');
  R(burst, c, 'burstFlash', 0, 1, 0.01, 'flash');
  R(burst, c, 'burstShake', 0, 1.5, 0.01, 'shake');
  R(burst, c, 'burstLight', 0, 80, 0.5, 'light punch');
  R(burst, c, 'burstSparks', 0, 400, 1, 'sparks');
  R(burst, c, 'burstSparkSpeed', 0, 40, 0.5, 'spark speed');
  R(burst, c, 'burstImpulse', 0, 25, 0.1, 'impulse');
  R(burst, c, 'burstLift', 0, 15, 0.1, 'lift');
  R(burst, c, 'burstSpin', 0, 8, 0.05, 'spin');
  R(burst, c, 'burstScorch', 0, 10, 0.05, 'scorch (m)');
  R(burst, c, 'burstCrater', 0, 8, 0.05, 'crater (m)');
  R(burst, c, 'shockRadius', 0, 16, 0.05, 'shock ring (m)');
  R(burst, c, 'shockLife', 0.05, 3, 0.01, 'shock life');
  burst.addColor(c, 'colorFlash').name('flash');
  burst.addColor(c, 'colorShockA').name('shock');
  burst.addColor(c, 'colorShockB').name('shock, hot');
  burst.addColor(c, 'colorBurstA').name('shell, hot');
  burst.addColor(c, 'colorBurstB').name('shell');
  burst.addColor(c, 'colorBurstC').name('shell, edge');
  const warp = burst.addFolder('Distortion');
  R(warp, c, 'warpStrength', 0, 3, 0.01, 'skin shimmer');
  R(warp, c, 'warpSize', 1.2, 12, 0.05, 'size (× radius)');
  R(warp, c, 'warpScale', 0.1, 8, 0.05, 'noise scale');
  R(warp, c, 'warpSpeed', 0, 10, 0.05, 'noise speed');
  R(warp, c, 'warpBurst', 0, 4, 0.05, 'burst ring');
  R(warp, c, 'warpRingTime', 0.05, 2, 0.01, 'ring crosses in');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
}
