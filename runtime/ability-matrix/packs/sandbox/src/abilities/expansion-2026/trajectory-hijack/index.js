import {
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion, syncParticleGlobals } from '../ExpansionAtmosphere.js';
import { createExpansionFX, routeExpansionTransparency, ParticleShape } from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import {
  createDartGeometry,
  createGimbalGeometry,
  createNeedleGeometry,
  createNeedleTipGeometry,
  createQuad,
  createTrailGeometry,
  createVaneGeometry,
} from './geometry.js';
import {
  createFieldMaterial,
  createGlowMaterial,
  createLensMaterial,
  createTrailMaterial,
  createVaneEdgeMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
const UID = 'matrix-expansion/trajectory-hijack';

const TAU = Math.PI * 2;
/** Darts in the volley — the hard hit cap. */
const MAX_DARTS = 12;
/** Stator vanes in the ring. */
const MAX_VANES = 16;
/** Samples of remembered flight per ribbon. */
const SAMPLES = 40;

const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => {
  const t = sat(x);
  return t * t * (3 - 2 * t);
};
/** outBack with an authored overshoot. */
const outBack = (x, s) => {
  const t = sat(x) - 1;
  return 1 + (s + 1) * t * t * t + s * t * t;
};
const wrap = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);
const mod = (a, m) => a - m * Math.floor(a / m);

const _Z = new Vector3(0, 0, 1);
const _UP = new Vector3(0, 1, 0);
const _p = new Vector3();
const _t = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _q = new Quaternion();
const _roll = new Quaternion();
const _o = new Object3D();
/** Reused particle option bag (ParticleSystem.emit destructures, never retains). */
const _emit = {
  position: null, radius: 0, direction: null, speed: 1, speedVariance: 0.35, spread: 0.5,
  size: 0.1, sizeVariance: 0.4, life: 1, lifeVariance: 0.3, spin: 2, time: 0,
};

/**
 * TRAJECTORY HIJACK — Motion, zone cast.
 *
 * *Redirect projectile heading*, as a rule you can watch. The sandbox has no
 * enemy projectiles the cast could steal, so it hijacks its own: a volley of
 * steel darts.
 *
 * ## Beats
 *
 *  1. **Anticipation** (`chargeTime`) — the darts fan out on an arc over the
 *     caster's hand, spinning, sparks drawn in; at the target the deflection
 *     field powers up and nine cambered **stator vanes** heave out of the
 *     floor, nearest the caster first, springing past full height.
 *  2. **Travel** — the darts leave one by one (`launchGap`) straight down the
 *     aim line, each dragging a white-hot ribbon of its own remembered path.
 *  3. **Impact (the seize)** — the frame the lead dart reaches the orbit, the
 *     vanes *snap* from radial to swirl pitch (`seizePitch`), the field's
 *     stream lines wind into a spiral, a pressure shell and shock ring run
 *     out, the camera knocks, the light punches — and every body inside
 *     `lockReach × zoneRadius` is assigned a dart.
 *  4. **Linger (the hijack)** — each dart is bent into an orbit round the
 *     compass-needle hub (a climbing helix at `orbitSeat × R`, braked to
 *     `orbitSpeed`), circles at least `minTurn`, and leaves on the tangent
 *     that points at its target, hooked through a curve onto the body: the
 *     body is flung along that *new* heading. The needle swings to each next
 *     heading before the dart goes; the vane a dart leaves past flicks and
 *     rings; the ring of vanes turns with the volley. Releases roll, so the
 *     silhouette never holds still while darts are held.
 *  5. **Exit** — the vanes feather back to radial and sink into the floor,
 *     the needle drops, the field burns away through noise.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the volley** — instanced turned-steel darts (`MeshStandardMaterial`,
 *      world layer, shadows), hot emissive.
 *   2. **the ribbons** (`createTrailMaterial`) — every dart's flight sampled
 *      *back in time* from its closed-form path, so trails bend exactly where
 *      the dart did, collapse into the body it hit, and follow any slider.
 *   3. **the stator vanes** (hero) — 9 lofted airfoil blades
 *      (`createVaneGeometry`), lit gunmetal on the world layer, 2.7 m tall
 *      on a 3.8 m ring; and their **edges** (`createVaneEdgeMaterial`),
 *      chevrons climbing a hot leading edge, flared by each release.
 *   4. **the hub** — a turned compass needle with a glowing north tip
 *      (`createGlowMaterial`) inside a turning gimbal ring.
 *   5. **the deflection field** (`createFieldMaterial`) — the floor: a dark
 *      disc of spiral stream lines whose twist is the vane pitch.
 *   6. **particles** — STREAK sparks (charge, seize, capture, release, hit),
 *      CHIP steel at each hit, SMOKE dust off the moving vanes.
 *   7. **the seize and the hits** — AIR shell, SHOCKWAVE + DUSTRING at the
 *      seize, SCORCH + SHOCKWAVE under every hit (they outlive the cast),
 *      flash, knocks, light punches.
 *   8. **the lens** (`createLensMaterial` on `LAYER.DISTORTION`) — the air
 *      dragged round the orbit band, a pressure ring on the seize.
 *
 * ## The editor rule
 *
 * A dart record holds dice (seat, height, spare-turn) and event flags
 * (captured / released / hit) plus the body it was assigned. Every time and
 * position — launch, capture, release angle, the hook, the hit — is solved
 * in closed form from `settings.trajectoryHijack` every frame (`_plan`), so
 * dragging the radius, the orbit or the speeds mid-cast re-routes the volley
 * that is already flying and the darts still land on their bodies.
 *
 * ## Hits (`handlesOwnHits`)
 *
 * At the seize, up to `dartCount` bodies inside `lockReach × zoneRadius`
 * are assigned one dart each, nearest first. A dart hits its body once, when
 * its hook arrives, with knockback along the dart's final heading — through
 * the expansion combat binding when present, else `dummy.kill`. Untargeted
 * darts never hit. Hits ≤ min(darts, bodies).
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._n + this._nv;
  }

  get impactDuration() {
    return Math.max(0.6, this._lingerEnd - this._impactAge);
  }

  get fadeDuration() {
    return Math.max(0.1, this.config.exitTime * settings.global.lifetime);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.resources = [];
    const own = (x) => {
      this.resources.push(x);
      return x;
    };
    this.root = new Group();
    this.group.add(this.root);
    this.center = new Vector3();

    // 5 · the deflection field
    const quad = own(createQuad());
    this.fieldMat = own(createFieldMaterial());
    this.field = new Mesh(quad, this.fieldMat);
    this.field.rotation.x = -Math.PI / 2;
    this.field.renderOrder = 2;
    this.root.add(this.field);

    // 3 · the stator vanes: lit steel, plus the light along their edges
    const c = config.settings;
    this.vaneGeo = own(createVaneGeometry({
      thickness: c.vaneThickness, camber: c.vaneCamber, twist: c.vaneTwist, sweep: c.vaneSweep, taper: c.vaneTaper,
    }));
    this._vaneShape = { thickness: c.vaneThickness, camber: c.vaneCamber, twist: c.vaneTwist, sweep: c.vaneSweep, taper: c.vaneTaper };
    this.steel = own(new MeshStandardMaterial({
      color: 0x3b3330, metalness: 0.82, roughness: 0.34, emissive: 0x2a0c05, emissiveIntensity: 0.35, side: DoubleSide,
    }));
    this.vanes = new InstancedMesh(this.vaneGeo, this.steel, MAX_VANES);
    this.vanes.castShadow = true;
    this.vanes.receiveShadow = true;
    this.vanes.frustumCulled = false;
    this.root.add(this.vanes);
    this.edgeMat = own(createVaneEdgeMaterial());
    this.kick = new InstancedBufferAttribute(new Float32Array(MAX_VANES), 1);
    this.vaneGeo.setAttribute('aKick', this.kick);
    this.edges = new InstancedMesh(this.vaneGeo, this.edgeMat, MAX_VANES);
    this.edges.frustumCulled = false;
    this.edges.renderOrder = 4;
    this.root.add(this.edges);

    // 1 · the volley
    this.dartMat = own(new MeshStandardMaterial({
      color: 0x5a5450, metalness: 0.9, roughness: 0.28, emissive: 0xff6a2c, emissiveIntensity: 2,
    }));
    this.darts = new InstancedMesh(own(createDartGeometry()), this.dartMat, MAX_DARTS);
    this.darts.castShadow = true;
    this.darts.frustumCulled = false;
    this.root.add(this.darts);

    // 2 · the ribbons
    this.trailGeo = own(createTrailGeometry(MAX_DARTS, SAMPLES));
    this.trailMat = own(createTrailMaterial());
    this.trails = new Mesh(this.trailGeo, this.trailMat);
    this.trails.frustumCulled = false;
    this.trails.renderOrder = 6;
    this.root.add(this.trails);

    // 4 · the hub
    this.hub = new Group();
    this.hubSteel = own(new MeshStandardMaterial({
      color: 0x4a4440, metalness: 0.88, roughness: 0.3, emissive: 0x2a0c05, emissiveIntensity: 0.5,
    }));
    this.needle = new Group();
    this.needleBody = new Mesh(own(createNeedleGeometry()), this.hubSteel);
    this.needleBody.castShadow = true;
    this.glowMat = own(createGlowMaterial());
    this.needleTip = new Mesh(own(createNeedleTipGeometry()), this.glowMat);
    this.needleTip.renderOrder = 5;
    this.needle.add(this.needleBody, this.needleTip);
    this.gimbal = new Mesh(own(createGimbalGeometry()), this.hubSteel);
    this.gimbal.castShadow = true;
    this.hub.add(this.needle, this.gimbal);
    this.root.add(this.hub);

    // 8 · the lens
    this.lensMat = own(createLensMaterial());
    this.lens = new Mesh(quad, this.lensMat);
    this.lens.rotation.x = -Math.PI / 2;
    this.lens.position.y = 0.4;
    this.lens.visible = false;
    this.root.add(this.lens);

    // Dart records: dice + event flags + the assigned body. The plan fields
    // below them are rewritten from settings every frame.
    this._darts = [];
    for (let i = 0; i < MAX_DARTS; i++) {
      this._darts.push({
        dSeat: 0, dHeight: 0, dFree: 0, dRoll: 0,
        captured: false, released: false, hit: false,
        hasTarget: false, dummy: null, targetId: null, aim: new Vector3(),
        seat: 1, h: 1, tLaunch: 0, tCap: 0, tRel: 0, tEnd: 0, dur: 1, omega: 1, theta0: 0, thetaR: 0, delta: 0,
        hand: new Vector3(), cap: new Vector3(), p0: new Vector3(), p1: new Vector3(), p2: new Vector3(),
      });
    }
    this._order = new Int8Array(MAX_DARTS);
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._n = 0;
    this._nv = 0;
    this._lingerEnd = 1;
    this._impactAge = 0;
    this._tImp = -1;
    this._calm = false;
    this._clock = 0;
    this.hits = 0;
    this.failure = null;
    this._fieldState = {
      center: this.center, radius: 1, frame: 0, spin: 1, pitch: 0, socket0: 0, vanes: 9, vaneSeat: 0.8, seat: 0.5,
      grip: 0, flow: 0, shock: -1, energy: 0, fade: 1, dissolve: 0,
    };
    this._edgeState = { flow: 0, grip: 0, fade: 1 };
    this._trailState = { fade: 1, clock: 0 };
    this._glowState = { pulse: 0, fade: 1 };
    this._lensState = { swirl: 0, shock: 0, wave: 0, seat: 0.5, spin: 1, clock: 0 };
    this._chargeEmitter = new RateEmitter();
    this._dustEmitter = new RateEmitter();
    this._dustCursor = 0;

    routeExpansionTransparency(this.group);
    // Solid steel stays on the world layer (depth prepass, shadows).
    this.vanes.layers.set(LAYER.WORLD);
    this.darts.layers.set(LAYER.WORLD);
    this.needleBody.layers.set(LAYER.WORLD);
    this.gimbal.layers.set(LAYER.WORLD);
    this.lens.layers.set(LAYER.DISTORTION);
    this._disposed = false;
  }

  createParticles() {
    this.sparks = createExpansionFX(this.ctx, `${ID}.sparks`, { shape: ParticleShape.STREAK });
    this.chips = createExpansionFX(this.ctx, `${ID}.chips`, { shape: ParticleShape.CHIP });
    this.dust = createExpansionFX(this.ctx, `${ID}.dust`, { shape: ParticleShape.SMOKE, additive: false });
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this.hits = 0;
    this._tImp = -1;
    this._impactAge = 0;
    this._clock = 0;
    this._calm = prefersReducedMotion();
    this._chargeEmitter.reset();
    this._dustEmitter.reset();
    this.center.copy(this.origin).addScaledVector(this.direction, this.length);
    const rnd = settings.global.randomness;
    for (let i = 0; i < MAX_DARTS; i++) {
      const d = this._darts[i];
      d.dSeat = 0.5 + (Math.random() - 0.5) * rnd;
      d.dHeight = 0.5 + (Math.random() - 0.5) * rnd;
      d.dFree = Math.random();
      d.dRoll = Math.random() * TAU;
      d.captured = d.released = d.hit = false;
      d.hasTarget = false;
      d.dummy = null;
      d.targetId = null;
    }
    this.root.visible = true;
    this._plan();
    this._sync(0);
  }

  /** The front is the lead dart: the cast "arrives" when it is seized. */
  advance() {
    this._plan();
    const d0 = this._darts[0];
    this.u = sat((this.age - d0.tLaunch) / Math.max(1e-3, d0.tCap - d0.tLaunch));
    this._pathAt(d0, this.age, this.position, _t);
    return this.age >= d0.tCap;
  }

  onTravel(dt) {
    this._events(dt);
    this._sync(dt);
  }

  onImpact() {
    this._tImp = this.age;
    this._impactAge = this.age;
    this._lock();
    this._plan();
    this._seize();
    this._sync(0);
  }

  onFade(dt) {
    this._plan();
    this._events(dt);
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The plan — closed form, from settings, every frame                  */
  /* ------------------------------------------------------------------ */

  _plan() {
    const c = this.config;
    const g = settings.global;
    const L = Math.max(0.05, g.lifetime);
    const R = Math.max(0.5, c.zoneRadius);
    const n = (this._n = Math.max(1, Math.min(MAX_DARTS, Math.round(c.dartCount))));
    const s = c.entrySide >= 0 ? 1 : -1;
    const v = Math.max(1, c.speed * g.speed);
    const dir = this.direction;
    const side = this.side;
    const cx = this.center.x;
    const cz = this.center.z;
    let end = 0;
    for (let i = 0; i < n; i++) {
      const d = this._darts[i];
      d.seat = Math.max(0.3, R * c.orbitSeat * (1 + (d.dSeat - 0.5) * c.seatJitter * 2));
      d.h = Math.max(0.3, c.orbitHeight + (d.dHeight - 0.5) * c.heightJitter * 2);
      d.tLaunch = (c.chargeTime + i * c.launchGap) * L;
      // The fan at the hand: an arc standing over the caster.
      const phi = n > 1 ? (i / (n - 1) - 0.5) * c.fanSpread : 0;
      d.hand.copy(this.origin).addScaledVector(dir, c.handForward).addScaledVector(side, Math.sin(phi) * c.fanRadius);
      d.hand.y = c.handHeight + (Math.cos(phi) - 0.5) * c.fanRadius * 0.6;
      // Captured where the orbit runs parallel to the aim line, so the swing-in is tangent.
      d.theta0 = -s * Math.PI * 0.5;
      d.cap.set(cx - side.x * s * d.seat, d.h, cz - side.z * s * d.seat);
      d.tCap = d.tLaunch + d.hand.distanceTo(d.cap) / v;
      d.omega = Math.max(0.05, c.orbitSpeed) / (L * d.seat);
      const minTurn = Math.max(0, c.minTurn) * TAU;
      if (d.hasTarget) {
        const ax = d.aim.x - cx;
        const az = d.aim.z - cz;
        const a = ax * dir.x + az * dir.z;
        const b = ax * side.x + az * side.z;
        const dist = Math.max(1e-3, Math.hypot(a, b));
        const alpha = Math.acos(Math.min(1, d.seat / dist));
        const thetaT = Math.atan2(b, a) - s * alpha;
        d.delta = minTurn + mod(s * (thetaT - d.theta0) - minTurn, TAU);
      } else {
        d.delta = minTurn + (0.3 + 0.7 * d.dFree) * Math.PI * c.freeTurn;
      }
      d.tRel = d.tCap + d.delta / d.omega;
      d.thetaR = d.theta0 + s * d.delta;
      const cr = Math.cos(d.thetaR);
      const sr = Math.sin(d.thetaR);
      d.p0.set(cx + (dir.x * cr + side.x * sr) * d.seat, d.h + (c.orbitClimb * d.delta) / TAU, cz + (dir.z * cr + side.z * sr) * d.seat);
      // Release tangent.
      _t.set(s * (-sr * dir.x + cr * side.x), 0, s * (-sr * dir.z + cr * side.z));
      let len;
      if (d.hasTarget) {
        d.p2.set(d.aim.x, c.hitHeight, d.aim.z);
        const chord = d.p0.distanceTo(d.p2);
        d.p1.copy(d.p0).addScaledVector(_t, chord * c.bendReach);
        len = (d.p0.distanceTo(d.p1) + d.p1.distanceTo(d.p2) + chord) * 0.5;
      } else {
        len = Math.max(0.5, c.freeReach * R);
        d.p1.copy(d.p0).addScaledVector(_t, len * 0.5);
        d.p2.copy(d.p0).addScaledVector(_t, len);
        d.p2.y = d.p0.y + 0.6;
      }
      d.dur = Math.max(0.02, len / Math.max(1, c.releaseSpeed));
      d.tEnd = d.tRel + d.dur;
      if (d.tEnd > end) end = d.tEnd;
    }
    this._lingerEnd = end + c.trailTime * L;
  }

  /** Where dart `d` is at cast time `t`, and which way it is heading. */
  _pathAt(d, t, out, tan) {
    const c = this.config;
    if (t <= d.tLaunch) {
      out.copy(d.hand);
      // Poised: nocked nose-up on the fan, so the volley reads side-on.
      tan.copy(this.direction).addScaledVector(_UP, 1.4);
      return out;
    }
    if (t < d.tCap) {
      const k = (t - d.tLaunch) / Math.max(1e-4, d.tCap - d.tLaunch);
      out.copy(d.hand).lerp(d.cap, k);
      tan.subVectors(d.cap, d.hand);
      return out;
    }
    if (t < d.tRel) {
      const s = c.entrySide >= 0 ? 1 : -1;
      const swept = d.omega * (t - d.tCap);
      const th = d.theta0 + s * swept;
      const co = Math.cos(th);
      const si = Math.sin(th);
      const dir = this.direction;
      const side = this.side;
      out.set(
        this.center.x + (dir.x * co + side.x * si) * d.seat,
        d.h + (c.orbitClimb * swept) / TAU,
        this.center.z + (dir.z * co + side.z * si) * d.seat,
      );
      tan.set(s * (-si * dir.x + co * side.x), c.orbitClimb / (TAU * d.seat), s * (-si * dir.z + co * side.z));
      return out;
    }
    const u = sat((t - d.tRel) / d.dur);
    const w = 1 - u;
    out.copy(d.p0).multiplyScalar(w * w).addScaledVector(d.p1, 2 * w * u).addScaledVector(d.p2, u * u);
    _a.subVectors(d.p1, d.p0).multiplyScalar(2 * w);
    _b.subVectors(d.p2, d.p1).multiplyScalar(2 * u);
    tan.addVectors(_a, _b);
    if (tan.lengthSq() < 1e-8) tan.subVectors(d.p2, d.p0);
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Gameplay                                                            */
  /* ------------------------------------------------------------------ */

  /** Assign one body to each dart, nearest first, at the seize. */
  _lock() {
    const c = this.config;
    const n = this._n;
    const reach = Math.max(0.1, c.zoneRadius * c.lockReach);
    const cx = this.center.x;
    const cz = this.center.z;
    if (this._scope) {
      const res = this._scope.queryActors({ position: [cx, 0, cz], radius: Math.min(48, reach), relation: 'enemy' });
      if (!res.ok) {
        this.failure = res.reason;
        return;
      }
      const actors = res.actors
        .filter((a) => Math.hypot(a.position[0] - cx, a.position[2] - cz) <= reach)
        .sort((a, b) => Math.hypot(a.position[0] - cx, a.position[2] - cz) - Math.hypot(b.position[0] - cx, b.position[2] - cz));
      for (let i = 0; i < Math.min(n, actors.length); i++) {
        const d = this._darts[i];
        d.hasTarget = true;
        d.targetId = actors[i].id;
        d.aim.set(actors[i].position[0], 0, actors[i].position[2]);
      }
      return;
    }
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(cx, cz, reach, this._found);
    // Keep only bodies truly inside, nearest first (no allocation: in place).
    let m = 0;
    for (let i = 0; i < found.length; i++) {
      const b = found[i];
      if (!b || !b.alive && b.alive !== undefined) continue;
      if (Math.hypot(b.position.x - cx, b.position.z - cz) > reach) continue;
      found[m++] = b;
    }
    found.length = m;
    found.sort((a, b) => Math.hypot(a.position.x - cx, a.position.z - cz) - Math.hypot(b.position.x - cx, b.position.z - cz));
    for (let i = 0; i < Math.min(n, m); i++) {
      const d = this._darts[i];
      d.hasTarget = true;
      d.dummy = found[i];
      d.aim.set(found[i].position.x, 0, found[i].position.z);
    }
  }

  _hit(d) {
    const c = this.config;
    // The blow lands along the hijacked heading: the hook's final tangent.
    let dx = d.p2.x - d.p1.x;
    let dz = d.p2.z - d.p1.z;
    const l = Math.hypot(dx, dz);
    if (l < 1e-6) {
      dx = this.direction.x;
      dz = this.direction.z;
    } else {
      dx /= l;
      dz /= l;
    }
    if (this._scope) {
      const sent = this._scope.emit({
        type: 'hit', element: 'motion', targetIds: [d.targetId],
        position: [d.aim.x, 0, d.aim.z], sourcePosition: [d.aim.x - dx, 0, d.aim.z - dz], damage: 1,
        hitForce: impactForce(c), tags: ['trajectory-hijack'],
      });
      if (sent.ok) this.hits++;
      else this.failure = sent.reason;
    } else if (d.dummy && d.dummy.alive !== false) {
      const power = settings.global.explosionIntensity;
      this._force.impulse = c.hitImpulse * power;
      this._force.lift = c.hitLift * power;
      this._force.spin = c.hitSpin;
      if (d.dummy.kill(dx, dz, this._force)) this.hits++;
    }
    // The hit's world answer.
    _p.set(d.aim.x, c.hitHeight, d.aim.z);
    _t.set(dx, 0.35, dz).normalize();
    this._puff(this.sparks, c.sparkHit, _p, _t, c.sparkSpeed, 0.7, c.sparkSize, c.sparkLife, 0.2);
    this._puff(this.chips, c.chipHit, _p, _t, c.chipSpeed, 0.8, c.chipSize, c.chipLife, 0.25);
    _p.y = 0.04;
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _p, {
      radius: c.scorchSize, life: c.decalLife, intensity: 0.8, colorA: getColor(c.colorBody), colorB: getColor(c.colorDeep),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _p, {
      radius: c.scorchSize * 2, life: 0.5, width: 0.08, intensity: 1, colorA: getColor(c.colorCore), colorB: getColor(c.colorBody),
    });
    const power = settings.global.explosionIntensity;
    if (c.hitShake > 0) this.ctx.shake?.add?.(c.hitShake * power, c.shakeDecay, c.shakeFrequency);
    this.lightBoost += c.hitLight * power;
  }

  /** The seize: impact beat. */
  _seize() {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    const R = c.zoneRadius;
    _p.copy(this.center).setY(0.05);
    this.ctx.bursts?.spawn?.(BurstMode.AIR, _p, {
      radius: R * 0.15, endRadius: R * c.burstReach * power, life: c.burstLife, intensity: 0.8,
      opacity: c.burstOpacity * settings.global.opacity, fresnel: 2.2, squash: c.burstSquash,
      colorA: getColor(c.colorCore), colorB: getColor(c.colorTint), colorC: getColor(c.colorBody),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _p, {
      radius: R * c.shockReach * power, life: 0.7, width: 0.06, intensity: 1.2, colorA: getColor(c.colorCore), colorB: getColor(c.colorBody),
    });
    this.ctx.decals?.spawn?.(DecalType.DUSTRING, _p, {
      radius: R, life: 1.2, intensity: 0.7, colorA: getColor(c.dustColor), colorB: getColor(c.colorDeep),
    });
    _p.y = c.orbitHeight;
    this._puff(this.sparks, c.seizeSparks, _p, _UP, c.sparkSpeed * 1.2, 1, c.sparkSize, c.sparkLife, R * 0.5);
    if (c.impactShake > 0) this.ctx.shake?.add?.(c.impactShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.impactFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorTint), c.impactFlash * power);
    this.lightBoost = c.impactLight * power;
  }

  /** Captures, releases and hits fire on the frame their solved time passes. */
  _events(dt) {
    const c = this.config;
    const n = this._n;
    for (let i = 0; i < n; i++) {
      const d = this._darts[i];
      if (d.hasTarget && d.dummy && !d.released && d.dummy.alive !== false) d.aim.set(d.dummy.position.x, 0, d.dummy.position.z);
      if (this._tImp < 0) continue; // nothing is seized before the seize
      if (!d.captured && this.age >= d.tCap) {
        d.captured = true;
        _t.set(-this.direction.x, 0.3, -this.direction.z).normalize();
        this._puff(this.sparks, c.sparkCapture, d.cap, _t, c.sparkSpeed * 0.6, 0.6, c.sparkSize, c.sparkLife, 0.1);
      }
      if (d.captured && !d.released && this.age >= d.tRel) {
        d.released = true;
        this._pathAt(d, d.tRel + 1e-4, _p, _t);
        _t.normalize();
        this._puff(this.sparks, c.sparkRelease, _p, _t, c.sparkSpeed, 0.35, c.sparkSize, c.sparkLife, 0.1);
      }
      if (d.released && d.hasTarget && !d.hit && this.age >= d.tEnd) {
        d.hit = true;
        this._hit(d);
      }
    }
    // Sparks drawn into the fan while the volley charges.
    if (dt > 0 && this.age < this._darts[n - 1].tLaunch) {
      const k = this._chargeEmitter.tick(dt, c.chargeSparks * settings.global.particleCount);
      if (k) {
        _p.copy(this._darts[n >> 1].hand);
        _t.copy(this.direction).negate();
        this._puff(this.sparks, k, _p, _t, 1.5, 1, c.sparkSize * 0.8, c.sparkLife * 0.8, c.fanRadius, true);
      }
    }
  }

  _puff(system, count, position, direction, speed, spread, size, life, radius, raw = false) {
    if (!system || !(count > 0)) return;
    const k = raw ? count : Math.max(0, Math.min(128, Math.round(count * settings.global.particleCount)));
    if (!k) return;
    _emit.position = position;
    _emit.direction = direction;
    _emit.speed = speed;
    _emit.spread = spread;
    _emit.size = size;
    _emit.life = life;
    _emit.radius = radius;
    _emit.time = frame.uTime.value;
    system.emit(k, _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    const sp = this.sparks;
    if (sp?.uniforms) {
      syncParticleGlobals(sp);
      sp.setGradient?.(getColor(c.colorCore), getColor(c.colorTint), getColor(c.colorBody), getColor(c.colorDeep));
      sp.uniforms.uGlow && (sp.uniforms.uGlow.value = c.sparkGlow * g.glow);
      sp.uniforms.uOpacity && (sp.uniforms.uOpacity.value = g.opacity);
      sp.uniforms.uDrag && (sp.uniforms.uDrag.value = 1.6);
      sp.uniforms.uTurbulence && (sp.uniforms.uTurbulence.value = 0.3 * g.turbulence);
    }
    const ch = this.chips;
    if (ch?.uniforms) {
      syncParticleGlobals(ch);
      ch.setGradient?.(getColor(c.colorTint), getColor(c.colorBody), getColor(c.dartColor), getColor(c.colorDeep));
      ch.uniforms.uGravity && ch.uniforms.uGravity.value.set(0, -9, 0);
      ch.uniforms.uOpacity && (ch.uniforms.uOpacity.value = g.opacity);
    }
    const du = this.dust;
    if (du?.uniforms) {
      syncParticleGlobals(du);
      du.setGradient?.(getColor(c.dustColor), getColor(c.dustColor), getColor(c.colorDeep), getColor(c.colorDeep));
      du.uniforms.uGravity && du.uniforms.uGravity.value.set(0, 0.15, 0);
      du.uniforms.uOpacity && (du.uniforms.uOpacity.value = 0.55 * g.opacity);
      du.uniforms.uEndSize && (du.uniforms.uEndSize.value = 2.2);
      du.uniforms.uTurbulence && (du.uniforms.uTurbulence.value = 0.6 * g.turbulence);
    }
  }

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const L = Math.max(0.05, g.lifetime);
    const R = Math.max(0.5, c.zoneRadius);
    const n = this._n;
    const s = c.entrySide >= 0 ? 1 : -1;
    const age = this.age;
    if (!this._calm) this._clock += dt;
    const clock = this._clock;
    const dir = this.direction;
    const side = this.side;
    const fadeT = this.phase === 'fade' ? sat(this.fadeTime / this.fadeDuration) : 0;
    const fade = 1 - smooth(fadeT);
    const seized = this._tImp >= 0;
    const sinceImp = seized ? age - this._tImp : -1;
    this.center.copy(this.origin).addScaledVector(dir, this.length);
    if (seized) this.position.set(this.center.x, c.lightHeight, this.center.z);

    // The grip: one envelope for every layer — how many darts are held now.
    let held = 0;
    for (let i = 0; i < n; i++) {
      const d = this._darts[i];
      held += sat((age - d.tCap) / 0.12) * (1 - sat((age - d.tRel) / 0.2));
    }
    const grip = Math.min(1, held / 3);

    // 3 · the stator: rise, seize pitch, ring turn, kicks, feather and sink.
    const nv = (this._nv = Math.max(3, Math.min(MAX_VANES, Math.round(c.vaneCount))));
    this._reshapeVanes();
    const seize = seized ? outBack(sinceImp / Math.max(0.02, c.snapTime * L), 1.7) * c.seizePitch : 0;
    const feather = smooth(fadeT * 1.6);
    const sink = smooth((fadeT - 0.25) / 0.75);
    const pitch = seize * (1 - feather);
    const ring = this._calm || !seized ? 0 : s * c.ringSpin * sinceImp;
    const H = c.vaneHeight;
    let moving = 0;
    for (let k = 0; k < nv; k++) {
      const base = ((k + 0.5) * TAU) / nv;
      const gamma = base + ring;
      const start = (c.riseDelay + (Math.abs(wrap(base - Math.PI)) / Math.PI) * c.sweepTime) * L;
      const e = (age - start) / Math.max(0.02, c.riseTime * L);
      const rise = e <= 0 ? 0 : outBack(e, c.riseOvershoot);
      if (e > 0 && e < 1) moving++;
      let kick = 0;
      for (let i = 0; i < n; i++) {
        const d = this._darts[i];
        if (!d.released) continue;
        const t = age - d.tRel;
        const prox = Math.pow(Math.max(0, Math.cos(wrap(gamma - d.thetaR))), 8);
        kick += Math.exp(-c.kickDecay * t) * Math.sin(c.kickRate * t + 1.2) * prox;
      }
      const flash = seized ? Math.exp(-sinceImp * 6) : 0;
      this.kick.array[k] = Math.min(2, Math.abs(kick) + flash) * fade;
      const beta = pitch + kick * c.kickPitch;
      const yawLocal = gamma + s * beta;
      const wx = dir.x * Math.cos(yawLocal) + side.x * Math.sin(yawLocal);
      const wz = dir.z * Math.cos(yawLocal) + side.z * Math.sin(yawLocal);
      const rx = dir.x * Math.cos(gamma) + side.x * Math.sin(gamma);
      const rz = dir.z * Math.cos(gamma) + side.z * Math.sin(gamma);
      const seat = c.vaneSeat * R;
      _o.position.set(this.center.x + rx * seat, -H * (1 - Math.min(rise, 1.2)) - H * 1.08 * sink, this.center.z + rz * seat);
      if (rise > 1) _o.position.y = H * (rise - 1) * 0.15;
      _o.rotation.set(c.vaneLean * sat(rise), Math.atan2(wx, wz), 0, 'YXZ');
      const vis = rise > 0 ? 1 : 0;
      _o.scale.set(c.vaneChord * vis, H * vis, c.vaneChord * vis);
      _o.updateMatrix();
      this.vanes.setMatrixAt(k, _o.matrix);
      this.edges.setMatrixAt(k, _o.matrix);
      if (sink > 0 && sink < 1) moving++;
    }
    this.vanes.count = nv;
    this.edges.count = nv;
    this.vanes.instanceMatrix.needsUpdate = true;
    this.edges.instanceMatrix.needsUpdate = true;
    this.kick.needsUpdate = true;
    this.steel.color.copy(getColor(c.vaneColor));
    this.steel.emissive.copy(getColor(c.colorBody));
    this.steel.emissiveIntensity = c.vaneEmissive * g.glow * (0.4 + 0.6 * grip);
    this.steel.metalness = c.vaneMetalness;
    this.steel.roughness = c.vaneRoughness;
    const es = this._edgeState;
    es.flow = this._calm ? 0 : clock * c.edgeFlow * (0.5 + grip);
    es.grip = grip;
    es.fade = fade;
    this.edgeMat.userData.sync(es);

    // Dust off the vanes while they heave up and while they sink.
    if (dt > 0 && moving > 0 && this.dust) {
      const k = this._dustEmitter.tick(dt, c.dustRate * moving * 0.25 * g.particleCount);
      for (let j = 0; j < k; j++) {
        const v = (this._dustCursor = (this._dustCursor + 1) % nv);
        const gamma = ((v + 0.5) * TAU) / nv + ring;
        _p.set(
          this.center.x + (dir.x * Math.cos(gamma) + side.x * Math.sin(gamma)) * c.vaneSeat * R,
          0.1,
          this.center.z + (dir.z * Math.cos(gamma) + side.z * Math.sin(gamma)) * c.vaneSeat * R,
        );
        this._puff(this.dust, 1, _p, _UP, 0.6, 0.9, c.dustSize, c.dustLife, 0.35, true);
      }
    }

    // 1 · the volley, and 2 · the ribbons.
    const charge = smooth(age / Math.max(0.02, c.chargeTime * L));
    const pos = this.trailGeo.attributes.position.array;
    const tans = this.trailGeo.attributes.aTangent.array;
    const alpha = this.trailGeo.attributes.aAlpha.array;
    const span = c.trailTime * L;
    for (let i = 0; i < MAX_DARTS; i++) {
      const d = this._darts[i];
      const live = i < n && age < d.tEnd + (d.hasTarget ? 0 : 0.05);
      if (live) {
        this._pathAt(d, age, _p, _t);
        _t.normalize();
        const spin = age <= d.tLaunch ? c.fanSpin : c.dartRoll;
        _q.setFromUnitVectors(_Z, _t);
        _q.multiply(_roll.setFromAxisAngle(_Z, d.dRoll + (this._calm ? 0 : age * spin)));
        const burn = d.hasTarget ? 1 : 1 - 0.8 * sat((age - d.tRel) / d.dur);
        const size = c.dartSize * charge * burn;
        _o.position.copy(_p).addScaledVector(_t, -c.dartSize * 0.85);
        _o.quaternion.copy(_q);
        _o.scale.set(size * c.dartGirth, size * c.dartGirth, size);
      } else {
        _o.position.copy(this.center);
        _o.scale.set(0, 0, 0);
        _o.quaternion.identity();
      }
      _o.updateMatrix();
      this.darts.setMatrixAt(i, _o.matrix);

      // Ribbon: the path sampled back in time, clamped to launch and arrival.
      const after = age - d.tEnd;
      let vis = i < n && age > d.tLaunch && after < span ? 1 - sat(after / Math.max(1e-3, span)) : 0;
      if (vis > 0 && !d.hasTarget && age > d.tRel) vis *= 1 - 0.7 * sat((age - d.tRel) / d.dur);
      for (let k = 0; k < SAMPLES; k++) {
        const v = (i * SAMPLES + k) * 2;
        if (vis <= 0) {
          alpha[v] = alpha[v + 1] = 0;
          continue;
        }
        let t = age - (k * span) / (SAMPLES - 1);
        if (t < d.tLaunch) t = d.tLaunch;
        if (t > d.tEnd) t = d.tEnd;
        this._pathAt(d, t, _a, _b);
        for (let side2 = 0; side2 < 2; side2++) {
          const o = (v + side2) * 3;
          pos[o] = _a.x;
          pos[o + 1] = _a.y;
          pos[o + 2] = _a.z;
          tans[o] = _b.x;
          tans[o + 1] = _b.y;
          tans[o + 2] = _b.z;
          alpha[v + side2] = vis;
        }
      }
    }
    this.darts.count = MAX_DARTS;
    this.darts.instanceMatrix.needsUpdate = true;
    this.trailGeo.attributes.position.needsUpdate = true;
    this.trailGeo.attributes.aTangent.needsUpdate = true;
    this.trailGeo.attributes.aAlpha.needsUpdate = true;
    this.dartMat.color.copy(getColor(c.dartColor));
    this.dartMat.emissive.copy(getColor(c.colorBody));
    this.dartMat.emissiveIntensity = c.dartGlow * g.glow;
    this.dartMat.metalness = c.dartMetalness;
    this.dartMat.roughness = c.dartRoughness;
    this._trailState.fade = fade;
    this._trailState.clock = clock;
    this.trailMat.userData.sync(this._trailState);

    // 4 · the hub: the needle points the next heading.
    const hubRise = smooth((age - c.riseDelay * L) / Math.max(0.05, (c.riseTime + c.sweepTime) * L));
    let yaw;
    if (!seized) {
      yaw = this._calm ? 0 : age * c.needleSearch;
    } else {
      let prev = -1;
      let next = -1;
      for (let i = 0; i < n; i++) {
        const d = this._darts[i];
        if (!d.hasTarget) continue;
        if (d.tRel <= age) {
          if (prev < 0 || d.tRel > this._darts[prev].tRel) prev = i;
        } else if (next < 0 || d.tRel < this._darts[next].tRel) next = i;
      }
      const head = (i) => Math.atan2(this._darts[i].aim.x - this.center.x, this._darts[i].aim.z - this.center.z);
      if (prev >= 0 && next >= 0) {
        const a0 = head(prev);
        const u = smooth((age - this._darts[prev].tRel) / Math.max(1e-3, this._darts[next].tRel - this._darts[prev].tRel) * 1.6);
        yaw = a0 + wrap(head(next) - a0) * u;
      } else if (next >= 0) yaw = head(next);
      else if (prev >= 0) yaw = head(prev);
      else yaw = this._calm ? 0 : this._tImp * c.needleSearch + sinceImp * c.needleSearch * 0.3;
    }
    const hubScale = Math.max(0.001, hubRise * (1 - sink));
    this.hub.position.set(this.center.x, c.hubHeight * (1 - 0.8 * sink) * (0.4 + 0.6 * hubRise), this.center.z);
    this.needle.rotation.set(seized ? c.needleDip : 0, yaw, 0, 'YXZ');
    const nl = c.needleLength * R;
    this.needle.scale.set(nl * 0.25 * c.needleGirth * hubScale, nl * 0.25 * c.needleGirth * hubScale, nl * hubScale);
    this.gimbal.rotation.set(0, yaw + (this._calm ? 0 : clock * c.gimbalSpin), 0);
    this.gimbal.scale.setScalar(c.gimbalSize * R * hubScale);
    this.hubSteel.color.copy(getColor(c.vaneColor));
    this.hubSteel.emissive.copy(getColor(c.colorBody));
    this.hubSteel.emissiveIntensity = c.vaneEmissive * g.glow * (0.6 + grip);
    this.hubSteel.metalness = c.vaneMetalness;
    this.hubSteel.roughness = c.vaneRoughness;
    this._glowState.pulse = this._calm ? 0.5 : 0.5 + 0.5 * Math.sin(clock * 9);
    this._glowState.fade = fade * hubRise;
    this.glowMat.userData.sync(this._glowState);

    // 5 · the field
    const fr = R * c.fieldScale;
    this.field.position.set(this.center.x, 0.03, this.center.z);
    this.field.scale.set(fr * 2, fr * 2, 1);
    const fs = this._fieldState;
    fs.radius = fr;
    fs.frame = Math.atan2(dir.z, dir.x);
    fs.spin = s;
    fs.pitch = pitch;
    fs.socket0 = Math.PI / nv + ring;
    fs.vanes = nv;
    fs.vaneSeat = c.vaneSeat / c.fieldScale;
    fs.seat = c.orbitSeat / c.fieldScale;
    fs.grip = grip;
    fs.flow = this._calm ? 0 : clock * c.streamFlow * (0.3 + grip);
    fs.shock = seized && sinceImp < 0.55 ? 0.1 + 0.9 * smooth(sinceImp / 0.55) : -1;
    fs.energy = smooth(age / Math.max(0.05, (c.riseDelay + c.riseTime) * L));
    fs.fade = 1;
    fs.dissolve = smooth(fadeT);
    this.fieldMat.userData.sync(fs);

    // 8 · the lens
    const ls = this._lensState;
    ls.swirl = grip;
    ls.shock = seized && sinceImp < 0.55 ? 1 - sinceImp / 0.55 : 0;
    ls.wave = seized ? smooth(sinceImp / 0.55) : 0;
    ls.seat = c.orbitSeat / 1.1;
    ls.spin = s;
    ls.clock = clock;
    this.lens.visible = !this._calm && (ls.swirl * c.lensSwirl + ls.shock * c.lensShock) * g.distortion * fade > 0.002;
    if (this.lens.visible) {
      this.lens.position.set(this.center.x, 0.4, this.center.z);
      this.lens.scale.set(R * 2.2, R * 2.2, 1);
      this.lensMat.userData.sync(ls);
    }
    this._syncParticles();
  }

  /** Rebuild the airfoil only when its shape sliders change. */
  _reshapeVanes() {
    const c = this.config;
    const v = this._vaneShape;
    if (v.thickness === c.vaneThickness && v.camber === c.vaneCamber && v.twist === c.vaneTwist && v.sweep === c.vaneSweep && v.taper === c.vaneTaper) return;
    v.thickness = c.vaneThickness;
    v.camber = c.vaneCamber;
    v.twist = c.vaneTwist;
    v.sweep = c.vaneSweep;
    v.taper = c.vaneTaper;
    const fresh = createVaneGeometry(v);
    this.vaneGeo.attributes.position.copy(fresh.attributes.position);
    this.vaneGeo.attributes.normal.copy(fresh.attributes.normal);
    this.vaneGeo.attributes.position.needsUpdate = true;
    this.vaneGeo.attributes.normal.needsUpdate = true;
    fresh.dispose();
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._scope = null;
    this.root.visible = false;
    this.lens.visible = false;
    this._tImp = -1;
    for (const d of this._darts) {
      d.dummy = null;
      d.hasTarget = false;
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    for (const r of this.resources) r.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

/** [key, min, max, step, label] per folder; any key left over is added at the end. */
const FOLDERS = [
  ['The cast', [['range', 2, 40, 0.1], ['minRange', 0, 12, 0.1], ['speed', 4, 80, 0.5, 'darts fly at (m/s)'], ['cooldown', 0, 15, 0.05], ['zoneRadius', 1.5, 9, 0.1, 'ring radius (m)'], ['lifetime', 0.5, 8, 0.05, 'nominal lifetime (s)']]],
  ['The hijack', [['dartCount', 1, MAX_DARTS, 1, 'darts (hit cap)'], ['lockReach', 0.2, 2, 0.01, 'lock reach (× radius)'], ['minTurn', 0, 2, 0.01, 'min turn before release'], ['orbitSpeed', 2, 40, 0.1, 'orbit speed (m/s)'], ['releaseSpeed', 4, 80, 0.5, 'release speed (m/s)'], ['bendReach', 0, 1.5, 0.01, 'hook bend'], ['hitHeight', 0.2, 2.5, 0.01], ['freeReach', 0.2, 3, 0.01, 'untargeted flight (× radius)'], ['freeTurn', 0, 2, 0.01], ['hitImpulse', 0, 24, 0.1], ['hitLift', 0, 20, 0.1], ['hitSpin', 0, 8, 0.05]]],
  ['Timing', [['chargeTime', 0.05, 1, 0.01], ['launchGap', 0, 0.4, 0.005], ['trailTime', 0.05, 1.5, 0.01], ['exitTime', 0.1, 2, 0.01]]],
  ['Light', [['lightIntensity', 0, 30, 0.1], ['lightRadius', 1, 40, 0.1], ['lightHeight', 0, 4, 0.05], ['impactLight', 0, 20, 0.1], ['hitLight', 0, 10, 0.1]]],
  ['1 · Volley at the hand', [['handForward', -1, 3, 0.01], ['handHeight', 0.3, 3, 0.01], ['fanRadius', 0, 2, 0.01], ['fanSpread', 0, 3.2, 0.01], ['fanSpin', 0, 40, 0.5]]],
  ['2 · Darts', [['dartSize', 0.2, 3, 0.01], ['dartGirth', 0.3, 3, 0.01], ['dartRoll', 0, 40, 0.5], ['dartMetalness', 0, 1, 0.01], ['dartRoughness', 0, 1, 0.01], ['dartGlow', 0, 8, 0.05]]],
  ['3 · Ribbons', [['trailWidth', 0.01, 0.8, 0.005], ['trailTaper', 0.2, 4, 0.05], ['trailGlow', 0, 8, 0.05], ['trailOpacity', 0, 1, 0.01], ['trailStreak', 0, 1, 0.01]]],
  ['4 · Orbit', [['orbitSeat', 0.15, 1, 0.01, 'seat (× radius)'], ['seatJitter', 0, 0.6, 0.01], ['orbitHeight', 0.3, 4, 0.01], ['heightJitter', 0, 1.5, 0.01], ['orbitClimb', -1, 2, 0.01], ['entrySide', -1, 1, 2, 'entry side (±1)']]],
  ['5 · Stator vanes', [['vaneCount', 3, MAX_VANES, 1], ['vaneSeat', 0.4, 1.4, 0.01], ['vaneHeight', 0.5, 6, 0.05], ['vaneChord', 0.2, 3, 0.01], ['vaneThickness', 0.04, 0.4, 0.01], ['vaneCamber', 0, 0.3, 0.01], ['vaneTwist', -1.5, 1.5, 0.01], ['vaneSweep', -1, 1, 0.01], ['vaneTaper', 0, 0.9, 0.01], ['vaneLean', -0.6, 0.6, 0.01], ['vaneMetalness', 0, 1, 0.01], ['vaneRoughness', 0, 1, 0.01], ['vaneEmissive', 0, 4, 0.05], ['riseDelay', 0, 1, 0.01], ['riseTime', 0.05, 1.5, 0.01], ['riseOvershoot', 0, 4, 0.05], ['sweepTime', 0, 1.5, 0.01], ['seizePitch', 0, 1.5, 0.01], ['snapTime', 0.02, 0.8, 0.01], ['ringSpin', -2, 2, 0.01], ['kickPitch', 0, 1.2, 0.01], ['kickDecay', 0.5, 20, 0.1], ['kickRate', 1, 60, 0.5]]],
  ['6 · Vane edges', [['edgeGlow', 0, 8, 0.05], ['edgeWidth', 0.01, 0.5, 0.005], ['edgeFlow', -4, 4, 0.05], ['edgeChevrons', 0, 16, 0.5]]],
  ['7 · Hub', [['hubHeight', 0.3, 4, 0.01], ['needleLength', 0.1, 1, 0.01], ['needleGirth', 0.3, 3, 0.01], ['needleSearch', 0, 20, 0.1], ['needleDip', -0.6, 0.6, 0.01], ['gimbalSize', 0.05, 0.8, 0.01], ['gimbalSpin', -8, 8, 0.05], ['needleGlow', 0, 8, 0.05]]],
  ['8 · Deflection field', [['fieldScale', 0.6, 1.6, 0.01], ['fieldDeep', 0, 1, 0.01], ['fieldGlow', 0, 6, 0.05], ['streamArms', 1, 48, 1], ['streamFlow', -2, 2, 0.01], ['streamTwist', 0, 8, 0.05], ['rimTicks', 4, 96, 1], ['bandGlow', 0, 4, 0.05], ['fieldNoise', 0, 2, 0.01], ['dissolveEdge', 0.005, 0.3, 0.005]]],
  ['9 · Particles', [['sparkCapture', 0, 64, 1], ['sparkRelease', 0, 64, 1], ['sparkHit', 0, 96, 1], ['sparkSize', 0.01, 0.4, 0.005], ['sparkLife', 0.05, 2, 0.01], ['sparkSpeed', 0, 20, 0.1], ['sparkGlow', 0, 6, 0.05], ['chargeSparks', 0, 120, 1], ['chipHit', 0, 64, 1], ['chipSize', 0.01, 0.4, 0.005], ['chipLife', 0.05, 3, 0.01], ['chipSpeed', 0, 12, 0.1], ['dustRate', 0, 120, 1], ['dustSize', 0.05, 2, 0.01], ['dustLife', 0.1, 4, 0.01], ['seizeSparks', 0, 128, 1]]],
  ['10 · Seize and hits', [['impactShake', 0, 2, 0.01], ['hitShake', 0, 1, 0.01], ['shakeDecay', 0.5, 20, 0.1], ['shakeFrequency', 1, 40, 0.5], ['impactFlash', 0, 1, 0.01], ['burstReach', 0, 2.5, 0.01], ['burstLife', 0.05, 2, 0.01], ['burstOpacity', 0, 1, 0.01], ['burstSquash', 0.05, 1.5, 0.01], ['shockReach', 0, 3, 0.01], ['scorchSize', 0.1, 3, 0.01], ['decalLife', 0.2, 10, 0.1]]],
  ['11 · Lens', [['lensSwirl', 0, 3, 0.01], ['lensShock', 0, 3, 0.01]]],
];

export function buildEditor(gui, c, Editor) {
  const R = Editor?.range ?? ((f, cfg, k, min, max, step, label) => f.add(cfg, k, min, max, step).name?.(label ?? k));
  const sub = (parent, title) => (typeof parent.addFolder === 'function' ? parent.addFolder(title) : parent);
  const folder = gui.addFolder('↻  Trajectory Hijack');
  const seen = new Set(['castAnim']);
  for (const [title, keys] of FOLDERS) {
    const f = sub(folder, title);
    if (title === 'The cast') {
      if (Editor?.castAnimation) Editor.castAnimation(f, c);
      else f.add(c, 'castAnim', CAST_ANIMATIONS);
    }
    for (const [key, min, max, step, label] of keys) {
      if (typeof c[key] !== 'number') continue;
      R(f, c, key, min, max, step, label ?? key);
      seen.add(key);
    }
  }
  const colours = sub(folder, 'Colours');
  for (const [key, value] of Object.entries(c)) {
    if (seen.has(key)) continue;
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) colours.addColor(c, key);
    else if (typeof value === 'number') R(folder, c, key, 0, Math.max(1, Math.abs(value) * 4), 0.01, key);
  }
  return folder;
}
