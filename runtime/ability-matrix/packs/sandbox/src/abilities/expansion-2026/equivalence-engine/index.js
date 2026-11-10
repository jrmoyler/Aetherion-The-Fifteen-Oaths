import { Group, Mesh, MeshStandardMaterial, Points, Vector3, DoubleSide } from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import {
  createExpansionFX,
  routeExpansionTransparency,
  expansionBurst,
  ParticleShape,
} from '../ExpansionFX.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { frame } from '../../../core/FrameUniforms.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { LAYER } from '../../../core/Layers.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import {
  WEIGHT_BOTTOM,
  createBeamGeometry,
  createBearingGeometry,
  createFulcrumGeometry,
  createMoteGeometry,
  createQuad,
  createWeightGeometry,
  updateBeamGeometry,
} from './geometry.js';
import {
  createFieldMaterial,
  createLensMaterial,
  createMoteMaterial,
  createShellMaterial,
  createStreamMaterial,
  createWellMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
export const UID = 'matrix-expansion/equivalence-engine';

const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

/** Most slams one cast may make. */
export const MAX_TIPS = 6;
/** Bodies one slam may strike. */
const MAX_TARGETS = 8;
/** GPU mass grains allocated per pool member. */
const MAX_MOTES = 256;

const _pos = new Vector3();
const _dir = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _burst = { count: 0, size: 0, life: 0, speed: 0, spread: 0, radius: 0 };
const _emit = {
  position: new Vector3(), radius: 0, direction: new Vector3(0, 1, 0), speed: 0, speedVariance: 0.4,
  spread: 0.6, size: 0, sizeVariance: 0.4, life: 0, lifeVariance: 0.3, spin: 1, time: 0,
};
const _query = { position: [0, 0, 0], radius: 0, relation: 'enemy' };

/**
 * The engine's pose at one moment — a pure function of settings and time, so
 * the slam the player sees and the slam that strikes are the same numbers.
 * Written into `out` (no allocation).
 *
 *   massA    — A's share of the one unit of mass (B holds 1 − massA)
 *   tilt     — beam tilt (rad); positive puts A's end down
 *   turn     — beam yaw relative to the cast's lateral axis (rad)
 *   flow     — signed pour rate: + mass flowing into A
 *
 * @param {object} c     the settings block
 * @param {number} tau   seconds since the impact (−1 while in flight)
 * @param {number} u     flight progress 0..1
 * @param {number} period  effective tip period (s)
 * @param {number} tiltMax derived slam tilt (rad)
 */
export function enginePose(c, tau, u, period, tiltMax, out) {
  const n = Math.max(1, Math.min(MAX_TIPS, Math.round(c.tips)));
  const sw = Math.min(0.9, Math.max(0.05, c.swingFraction));
  if (tau < 0) {
    // In flight: the mass pours into A, then the beam swings A down — landing
    // exactly as the pair docks (u = 1): the impact frame is the first slam.
    const pour = smooth((u - 0.25) / 0.35);
    out.massA = 0.5 + 0.5 * pour;
    out.flow = pour > 0 && pour < 1 ? 1 : 0;
    out.tilt = tiltMax * Easing.inCubic(clamp((u - (1 - sw * 1.2)) / (sw * 1.2)));
    out.turn = 0;
    out.tip = -1;
    out.phase = 0;
    return out;
  }
  const k = Math.min(n - 1, Math.floor(tau / period));
  const heavyA = k % 2 === 0;
  const sign = heavyA ? 1 : -1;
  if (k >= n - 1) {
    out.massA = heavyA ? 1 : 0;
    out.tilt = tiltMax * sign;
    out.turn = c.tipTurn * k;
    out.flow = 0;
    out.tip = k;
    out.phase = 1;
    return out;
  }
  const f = clamp(tau / period - k);
  const fc = 1 - sw;
  // Pour: the old side drains to equality by the crossing, then the new side
  // fills while the beam swings over.
  const h0 = heavyA ? 1 : 0;
  const pour = f < fc ? 0.5 * smooth(f / fc) : 0.5 + 0.5 * smooth((f - fc) / sw);
  out.massA = lerp(h0, 1 - h0, pour);
  out.flow = (heavyA ? -1 : 1) * (f < fc ? 0.6 : 1);
  const swing = f < fc ? 0 : Easing.inCubic((f - fc) / sw);
  out.tilt = tiltMax * lerp(sign, -sign, swing);
  out.turn = c.tipTurn * (k + (f < fc ? 0 : Easing.inOutCubic((f - fc) / sw)));
  out.tip = k;
  out.phase = f;
  return out;
}

/** Counterweight radius for a given share of the mass. */
export function weightRadius(c, m) {
  return c.weightSize * Math.max(0.2, 1 + c.massSwell * (m - 0.5));
}

/** Slam tilt derived from the fulcrum, the beam and the heavy weight: its point lands on the floor. */
export function slamTilt(c) {
  const half = c.zoneRadius * c.armReach;
  const drop = c.pivotHeight - weightRadius(c, 1) * WEIGHT_BOTTOM;
  return Math.asin(Math.max(0, Math.min(0.95, drop / Math.max(0.05, half))));
}

/**
 * EQUIVALENCE ENGINE — Gravity, zone cast.
 *
 * The engine holds exactly **one unit of mass**, shared between two
 * counterweights: whatever one gains, the other loses. A **bound pair** of
 * small weights flies from the caster's hand, circling each other, while a
 * turned iron fulcrum heaves up out of the floor at the target and the
 * floor's equipotential lines gather. In the last of the flight the mass
 * pours into weight A and the beam swings: the pair docks as A's point
 * **slams** into the floor — the impact frame. From then on the engine
 * *pours*: grains of mass leave the heavy weight, arc over the beam and
 * gather on the light one; the heavy weight cools and shrinks, the light one
 * swells and heats; at equality the balance trembles, then swings over,
 * turning `tipTurn` round the fulcrum as it goes, and the other weight slams
 * the other half of the circle. `tips` slams in all. Then the two masses are
 * poured equal — the *equivalence* — the beam levels, and the whole engine
 * sinks back into its own well as the floor dissolves.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the engine** — the turned fulcrum (`createFulcrumGeometry`), the
 *      bearing and the lofted arched beam (`createBeamGeometry`), lit
 *      iron-stone (`MeshStandardMaterial`, `LAYER.WORLD`, shadows).
 *   2. **the counterweights** — plumb spindles (`createWeightGeometry`) in
 *      the lit `createShellMaterial`: opaque stone whose seams run hot with
 *      the weight's share of the mass. Their size *is* the mass.
 *   3. **the mass stream** (`createStreamMaterial`) — a flow sheath on the
 *      beam, pulses running toward the gaining end.
 *   4. **the motes** (`createMoteMaterial`) — 256 GPU grains, each a fixed
 *      share of the mass: the grains being poured ride an arc over the beam.
 *   5. **the floor** — `createFieldMaterial` draws the two-body equipotential
 *      lines and each slam's shock front; `createWellMaterial` darkens a
 *      basin under the heavy weight. CRACK + DUSTRING + SHOCKWAVE decals
 *      torn under every slam stay through the linger.
 *   6. **the slam** — CHIP shrapnel, dark lit SMOKE dust, an EARTH dust ball,
 *      flash, camera knock, light punch.
 *   7. **the flight** — the bound pair and a SOFT grain trail.
 *   8. **the exit** — masses poured equal, beam levelled, sink and dissolve.
 *   9. **the lens** (`createLensMaterial`, `LAYER.DISTORTION`) — a pinch
 *      round the heavy weight, a pressure ring on each slam.
 *
 * ## The rule (`handlesOwnHits`)
 *
 * Inverse linked mass: mA + mB = 1 at every frame. Slam *j* happens at
 * `j × tipPeriod` after the impact (j = 0 is the impact frame); the heavy
 * end is A for even *j* and B for odd. A slam strikes only the enemies in
 * the **heavy half** of the circle — the half-disc on the heavy end's side
 * of the line through the fulcrum, square to the beam, out to
 * `strikeReach × zoneRadius` — throwing them outward from the fulcrum. The beam turns `tipTurn` per swing, so successive slams cover
 * different sectors. At most `MAX_TIPS × MAX_TARGETS` hits per cast; routed
 * through the expansion combat binding, or the dummy field without one.
 *
 * ## The editor rule
 *
 * A cast keeps only its yaw, how many slams it has fired and when the last
 * one landed; every dimension, colour, count and timing is read from
 * `settings.equivalenceEngine` every frame.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return 8;
  }

  /** Effective seconds between slams. */
  get period() {
    return Math.max(0.15, this.config.tipPeriod * settings.global.lifetime);
  }

  get tipCount() {
    return Math.max(1, Math.min(MAX_TIPS, Math.round(this.config.tips)));
  }

  get impactDuration() {
    return (this.tipCount - 1) * this.period + Math.max(0.2, this.config.settleTime) * settings.global.lifetime;
  }

  get fadeDuration() {
    return 0.9 * settings.global.lifetime;
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
    const quad = own(createQuad());

    // The engine root sits at the target, and rises / sinks through the floor.
    this.root = new Group();
    this.group.add(this.root);
    // The floor and lens do not turn with the beam: they are world-aligned.
    this.floor = new Group();
    this.group.add(this.floor);

    // 5 · the floor
    this.wellMat = own(createWellMaterial());
    this.well = new Mesh(quad, this.wellMat);
    this.well.rotation.x = -Math.PI / 2;
    this.well.position.y = 0.02;
    this.well.renderOrder = 1;
    this.floor.add(this.well);
    this.fieldMat = own(createFieldMaterial());
    this.field = new Mesh(quad, this.fieldMat);
    this.field.rotation.x = -Math.PI / 2;
    this.field.position.y = 0.035;
    this.field.renderOrder = 2;
    this.floor.add(this.field);

    // 1 · the engine: lit, solid, shadowed
    this.turntable = new Group();
    this.root.add(this.turntable);
    this.iron = own(new MeshStandardMaterial({
      color: 0x2a2236, metalness: 0.55, roughness: 0.42, emissive: 0x1c0d3a, emissiveIntensity: 0.6,
      side: DoubleSide,
    }));
    this.fulcrum = new Mesh(own(createFulcrumGeometry()), this.iron);
    this.fulcrum.castShadow = true;
    this.fulcrum.receiveShadow = true;
    this.turntable.add(this.fulcrum);
    this.pivot = new Group();
    this.turntable.add(this.pivot);
    this.beamGeometry = own(createBeamGeometry());
    this.beam = new Mesh(this.beamGeometry, this.iron);
    this.beam.castShadow = true;
    this.beam.receiveShadow = true;
    this.beam.frustumCulled = false;
    this.pivot.add(this.beam);
    this.bearing = new Mesh(own(createBearingGeometry()), this.iron);
    this.bearing.rotation.x = Math.PI / 2;
    this.bearing.castShadow = true;
    this.pivot.add(this.bearing);

    // 3 · the mass stream shares the beam's geometry
    this.streamMat = own(createStreamMaterial());
    this.stream = new Mesh(this.beamGeometry, this.streamMat);
    this.stream.frustumCulled = false;
    this.stream.renderOrder = 5;
    this.pivot.add(this.stream);

    // 2 · the counterweights (and 7 · the bound pair in flight)
    const spindle = own(createWeightGeometry());
    this.shellA = own(createShellMaterial());
    this.shellB = own(createShellMaterial());
    this.weightA = new Mesh(spindle, this.shellA);
    this.weightB = new Mesh(spindle, this.shellB);
    this.pairA = new Mesh(spindle, this.shellA);
    this.pairB = new Mesh(spindle, this.shellB);
    for (const m of [this.weightA, this.weightB, this.pairA, this.pairB]) {
      m.castShadow = true;
      m.frustumCulled = false;
    }
    this.turntable.add(this.weightA, this.weightB);
    this.group.add(this.pairA, this.pairB);

    // 4 · the motes
    this.moteMat = own(createMoteMaterial());
    this.motes = new Points(own(createMoteGeometry(MAX_MOTES)), this.moteMat);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 6;
    this.turntable.add(this.motes);

    // 9 · the lens
    this.lensMat = own(createLensMaterial());
    this.lens = new Mesh(quad, this.lensMat);
    this.lens.rotation.x = -Math.PI / 2;
    this.lens.position.y = 0.4;
    this.lens.visible = false;
    this.floor.add(this.lens);

    routeExpansionTransparency(this.group);
    this.lens.layers.set(LAYER.DISTORTION);

    this._pose = { massA: 0.5, tilt: 0, turn: 0, flow: 0, tip: -1, phase: 0 };
    this._fieldState = { ax: 0, az: 0, bx: 0, bz: 0, massA: 0.5, clock: 0, energy: 0, fade: 1, dissolve: 0, slamX: 0, slamZ: 0, slam: -1 };
    this._shellA = { mass: 0.5, heat: 0, dissolve: 0, clock: 0 };
    this._shellB = { mass: 0.5, heat: 0, dissolve: 0, clock: 0 };
    this._streamState = { clock: 0, flow: 0, imbalance: 0, fade: 1 };
    this._moteState = { a: new Vector3(), b: new Vector3(), massA: 0.5, orbitA: 1, orbitB: 1, clock: 0, fade: 1, capacity: MAX_MOTES };
    this._lensState = { hx: 0, hz: 0, pinch: 0, shock: 0, wave: 0, slamX: 0, slamZ: 0, clock: 0 };
    this._target = new Vector3();
    this._slamPoint = new Vector3();
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._found = [];
    this._trail = new RateEmitter();
    this._disposed = false;
    /** Strike log for tests/telemetry: { tip, heavy: 'A'|'B', count } per slam (bounded). */
    this.slams = [];
  }

  createParticles() {
    this.fx = createExpansionFX(this.ctx, 'equivalence-engine', {
      shape: ParticleShape.CHIP,
      colors: ['#f6f1ff', '#c4b2ff', '#6a3fd6', '#150a2c'],
    });
    this.dust = this.ctx.particles?.get?.('expansion.equivalence-engine.dust', {
      capacity: 160, shape: ParticleShape.SMOKE, additive: false, lit: true, curl: true, softFade: 0.4,
    }) ?? null;
    this.grains = this.ctx.particles?.get?.('expansion.equivalence-engine.grains', {
      capacity: 320, shape: ParticleShape.SOFT, additive: true, softFade: 0.3,
    }) ?? null;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this._tipsFired = 0;
    this._lastSlam = -10;
    this._clock = 0;
    this._calm = prefersReducedMotion();
    this._trail.reset();
    this.slams.length = 0;
    this.pointAt(1, this._target);
    // The beam's rest axis is the cast's lateral, so the seesaw reads side-on.
    this._yaw0 = Math.atan2(-this.side.z, this.side.x);
    this.root.visible = true;
    this.floor.visible = true;
    this._sync(0);
  }

  onTravel(dt) {
    this._emitTrail(dt);
    this._sync(dt);
  }

  onImpact() {
    this.position.copy(this._target);
    this._fireDue();
    this._sync(0);
  }

  onFade(dt) {
    this._fireDue();
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The rule                                                            */
  /* ------------------------------------------------------------------ */

  /** Fire every slam whose time has come (deterministic, frame-rate independent). */
  _fireDue() {
    if (this.phase !== 'impact') return;
    const n = this.tipCount;
    while (this._tipsFired < n && this.impactTime >= this._tipsFired * this.period - 1e-9) {
      this._slam(this._tipsFired);
      this._tipsFired++;
    }
  }

  /** World direction from the fulcrum toward the heavy end at slam `j`. */
  heavyDirection(j, out) {
    const yaw = this._yaw0 + this.config.tipTurn * j;
    // Local −x is A, local +x is B; a Y-rotation maps local x to (cos, 0, −sin).
    const s = j % 2 === 0 ? -1 : 1;
    return out.set(Math.cos(yaw) * s, 0, -Math.sin(yaw) * s);
  }

  _slam(j) {
    const c = this.config;
    const g = settings.global;
    const r = c.zoneRadius;
    const reach = r * c.strikeReach;
    const tilt = slamTilt(c);
    this.heavyDirection(j, _dir);
    // Where the heavy weight's point lands.
    this._slamPoint.copy(this._target).addScaledVector(_dir, r * c.armReach * Math.cos(tilt)).setY(0.04);
    this._lastSlam = this.impactTime;
    const struck = this._strike(_dir, reach);
    if (this.slams.length < MAX_TIPS) this.slams.push({ tip: j, heavy: j % 2 === 0 ? 'A' : 'B', count: struck });
    this._slamFX();
  }

  /** Strike the heavy half-disc. Returns how many targets were struck. */
  _strike(heavy, reach) {
    const c = this.config;
    const cx = this._target.x, cz = this._target.z;
    let struck = 0;
    if (this._scope) {
      _query.position[0] = cx; _query.position[1] = 0; _query.position[2] = cz;
      _query.radius = reach;
      const targets = this._scope.queryActors(_query);
      if (!targets.ok) { this.failure = targets.reason; return 0; }
      for (const actor of targets.actors) {
        const dx = actor.position[0] - cx, dz = actor.position[2] - cz;
        if (dx * heavy.x + dz * heavy.z <= 0) continue; // the light half is spared
        const sent = this._scope.emit({
          type: 'hit', element: 'gravity', targetIds: [actor.id],
          position: actor.position, sourcePosition: [cx, 0, cz], damage: c.hitDamage,
          hitForce: impactForce(c, settings.global.explosionIntensity), tags: ['equivalence-engine'],
        });
        if (!sent.ok) this.failure = sent.reason;
        else struck++;
        if (struck >= MAX_TARGETS) break;
      }
      return struck;
    }
    const field = this.ctx.dummies;
    if (!field?.findTargets) return 0;
    const found = field.findTargets(cx, cz, reach, this._found);
    const power = settings.global.explosionIntensity;
    this._force.impulse = c.hitImpulse * power;
    this._force.lift = c.hitLift * power;
    this._force.spin = c.hitSpin;
    for (const dummy of found) {
      const dx = dummy.position.x - cx, dz = dummy.position.z - cz;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (dx * heavy.x + dz * heavy.z <= 0) continue;
      // Thrown outward from the fulcrum, away across the heavy half.
      _pos.set(dx, 0, dz);
      if (_pos.lengthSq() < 1e-8) _pos.copy(heavy);
      else _pos.normalize();
      if (dummy.kill(_pos.x, _pos.z, this._force) && ++struck >= MAX_TARGETS) break;
    }
    return struck;
  }

  /** Shrapnel, dust, dust ball, decals, flash, knock and light on a slam. */
  _slamFX() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const r = c.zoneRadius;
    const p = this._slamPoint;
    this.lightBoost = c.slamLight * power;
    _burst.count = c.chipCount;
    _burst.size = c.chipSize;
    _burst.life = c.chipLife;
    _burst.speed = c.chipSpeed;
    _burst.spread = 0.75;
    _burst.radius = 0.35;
    expansionBurst(this.fx, p, _burst);
    if (this.dust) {
      _emit.position.copy(p);
      _emit.radius = r * 0.25;
      _emit.direction.set(0, 1, 0);
      _emit.speed = c.dustSpeed * g.particleSpeed;
      _emit.spread = 0.9;
      _emit.size = c.dustSize * g.particleSize;
      _emit.life = c.dustLife * g.particleLifetime;
      _emit.time = frame.uTime.value;
      this.dust.emit(Math.min(48, Math.round(c.dustCount * g.particleCount)), _emit);
    }
    this.ctx.bursts?.spawn?.(BurstMode.EARTH, p, {
      radius: r * 0.08, endRadius: r * c.burstReach * power, life: c.burstLife,
      intensity: c.burstIntensity, opacity: c.burstOpacity * g.opacity, squash: 0.45,
      colorA: getColor(c.colorB), colorB: getColor(c.colorC), colorC: getColor(c.colorD),
    });
    this.ctx.decals?.spawn?.(DecalType.CRACK, p, {
      radius: r * c.crackRadius, life: c.crackLife, intensity: 1,
      colorA: getColor(c.colorB), colorB: getColor(c.colorD),
    });
    this.ctx.decals?.spawn?.(DecalType.DUSTRING, p, {
      radius: r * c.crackRadius * 1.3, life: c.crackLife * 0.5, intensity: 0.7,
      colorA: getColor(c.colorC), colorB: getColor(c.colorD),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, p, {
      radius: r * power, life: c.shockwaveLife, width: c.shockwaveWidth, intensity: 1,
      colorA: getColor(c.colorA), colorB: getColor(c.colorC),
    });
    if (c.slamShake > 0) this.ctx.shake?.add?.(c.slamShake * power * g.cameraShake, c.shakeDecay, c.shakeFrequency);
    if (c.slamFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorB), c.slamFlash * power);
  }

  /** A trail of grains behind the bound pair. */
  _emitTrail(dt) {
    const c = this.config;
    const g = settings.global;
    if (!this.grains) return;
    const n = this._trail.tick(dt, Math.min(200, c.trailRate * g.particleCount));
    if (!n) return;
    _emit.position.copy(this.position).setY(c.flightHeight);
    _emit.radius = c.pairOrbit;
    _emit.direction.set(0, 1, 0);
    _emit.speed = 0.25 * g.particleSpeed;
    _emit.spread = 1;
    _emit.size = c.trailSize * g.particleSize;
    _emit.life = c.trailLife * g.particleLifetime;
    _emit.time = frame.uTime.value;
    this.grains.emit(n, _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    for (const sys of [this.fx, this.dust, this.grains]) {
      const u = sys?.uniforms;
      if (!u) continue;
      sys.setGradient?.(getColor(c.colorA), getColor(c.colorB), getColor(c.colorC), getColor(c.colorD));
      if (u.uGlow) u.uGlow.value = (sys === this.dust ? 0.4 : 1.4) * g.glow;
      if (u.uOpacity) u.uOpacity.value = g.opacity;
      if (u.uTurbulence) u.uTurbulence.value = 0.6 * g.turbulence;
      if (u.uSizeScale) u.uSizeScale.value = g.particleSize;
      if (u.uSpeedScale) u.uSpeedScale.value = g.particleSpeed;
      if (u.uLifeScale) u.uLifeScale.value = g.particleLifetime;
    }
    this.dust?.uniforms?.uGravity?.value?.set?.(0, 0.35, 0); // dust drifts up, slowly
  }

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const r = c.zoneRadius;
    if (!this._calm) this._clock += dt * g.animationSpeed;
    const clock = this._clock;
    const travel = this.phase === 'travel';
    const fadeT = this.phase === 'fade' ? clamp(this.fadeTime / Math.max(0.01, this.fadeDuration)) : 0;
    const eq = Math.min(0.95, Math.max(0.05, c.equalizeFraction));
    const equalize = smooth(fadeT / eq);
    const sink = Easing.inCubic(clamp((fadeT - eq) / (1 - eq)));
    const tiltMax = slamTilt(c);
    const half = r * c.armReach;

    // The pose, from time alone.
    const pose = enginePose(c, travel ? -1 : this.impactTime + (this.phase === 'fade' ? 1e6 : 0), this.u, this.period, tiltMax, this._pose);
    if (this.phase === 'fade') {
      // The equivalence: pour the masses equal and level the beam.
      pose.massA = lerp(pose.massA, 0.5, equalize);
      // A balance settles: level with a small overshoot.
      pose.tilt *= 1 - Easing.outBack(equalize);
      pose.flow = equalize < 1 ? (pose.massA > 0.5 ? -0.5 : 0.5) : 0;
    }
    const sinceSlam = this.phase === 'travel' ? 10 : this.impactTime + (this.phase === 'fade' ? this.fadeTime : 0) - this._lastSlam;
    const slamFresh = this._tipsFired > 0 ? Math.exp(-sinceSlam * 5) : 0;
    // A tremble as the masses near equality, before each swing (cosmetic).
    const near = 1 - Math.min(1, Math.abs(pose.massA * 2 - 1) * 3);
    const tremble = this._calm ? 0 : c.trembleAmount * near * Math.sin(this.age * 41) * (travel ? 0 : 1);

    // Root: rise out of the floor in flight, sink back on the exit.
    const rise = travel ? smooth(this.u / Math.max(0.05, c.riseTime)) : 1;
    this.root.position.set(this._target.x, -c.pivotHeight * 1.1 * (1 - rise) - c.sinkDepth * sink, this._target.z);
    this.root.rotation.y = this._yaw0 + pose.turn;
    this.floor.position.set(this._target.x, 0, this._target.z);

    // 1 · the engine
    this.iron.color.copy(getColor(c.stoneColor));
    this.iron.emissive.copy(getColor(c.stoneEmissive));
    this.iron.emissiveIntensity = c.stoneGlow * g.glow * (1 + slamFresh * 2);
    this.iron.metalness = c.stoneMetalness;
    this.iron.roughness = c.stoneRoughness;
    this.fulcrum.scale.set(c.fulcrumWidth, c.pivotHeight, c.fulcrumWidth);
    this.pivot.position.y = c.pivotHeight;
    this.pivot.rotation.z = pose.tilt + tremble;
    updateBeamGeometry(this.beamGeometry, half, c.beamThickness, c.beamArch);
    this.bearing.scale.setScalar(c.beamThickness * 1.1);

    // 2 · the counterweights, hung upright at the beam ends
    const tilt = pose.tilt + tremble;
    const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
    const mA = pose.massA, mB = 1 - mA;
    const rA = weightRadius(c, mA), rB = weightRadius(c, mB);
    const grow = travel ? smooth((this.u - 0.55) / 0.4) : 1;
    _a.set(-half * cosT, c.pivotHeight - half * sinT + c.lightLift * Math.max(0, 0.5 - mA) * 2, 0);
    _b.set(half * cosT, c.pivotHeight + half * sinT + c.lightLift * Math.max(0, 0.5 - mB) * 2, 0);
    this.weightA.position.copy(_a);
    this.weightB.position.copy(_b);
    this.weightA.scale.setScalar(Math.max(0.001, rA * grow));
    this.weightB.scale.setScalar(Math.max(0.001, rB * grow));
    this.weightA.rotation.y = clock * 0.35;
    this.weightB.rotation.y = -clock * 0.35;
    const heavyIsA = mA >= 0.5;
    const dissolve = smooth((fadeT - eq) / (1 - eq));
    const sA = this._shellA, sB = this._shellB;
    sA.mass = mA; sB.mass = mB;
    sA.heat = heavyIsA ? slamFresh : 0;
    sB.heat = heavyIsA ? 0 : slamFresh;
    sA.dissolve = sB.dissolve = dissolve * 0.85;
    sA.clock = sB.clock = clock;
    this.shellA.userData.sync(sA);
    this.shellB.userData.sync(sB);

    // 7 · the bound pair in flight
    const pairOn = travel && this.u < 1;
    this.pairA.visible = this.pairB.visible = pairOn;
    if (pairOn) {
      const shrink = 1 - smooth((this.u - 0.75) / 0.25);
      const s = c.pairSize * c.weightSize * Math.min(1, this.age / 0.15) * shrink;
      const spin = this._calm ? 0 : this.age * c.pairSpin;
      const orbit = c.pairOrbit * shrink;
      this.pairA.position.set(this.position.x + Math.cos(spin) * orbit, c.flightHeight + Math.sin(spin * 0.5) * 0.15, this.position.z + Math.sin(spin) * orbit);
      this.pairB.position.set(this.position.x - Math.cos(spin) * orbit, c.flightHeight - Math.sin(spin * 0.5) * 0.15, this.position.z - Math.sin(spin) * orbit);
      this.pairA.scale.setScalar(Math.max(0.001, s * (0.8 + 0.4 * mA)));
      this.pairB.scale.setScalar(Math.max(0.001, s * (0.8 + 0.4 * mB)));
      this.pairA.rotation.y = this.pairB.rotation.y = spin;
    }

    // 3 · the mass stream
    const fade = 1 - dissolve;
    const st = this._streamState;
    st.clock = clock;
    st.flow = pose.flow;
    st.imbalance = mA - mB;
    st.fade = fade * grow;
    this.streamMat.userData.sync(st);

    // 4 · the motes
    const ms = this._moteState;
    ms.a.copy(_a);
    ms.b.copy(_b);
    ms.massA = mA;
    ms.orbitA = rA * c.moteOrbit;
    ms.orbitB = rB * c.moteOrbit;
    ms.clock = clock;
    ms.fade = fade * grow;
    this.moteMat.userData.sync(ms);

    // 5 · the floor — weights in world-aligned field space (−1..1 = the zone)
    const yaw = this.root.rotation.y;
    const ax = -Math.cos(yaw) * half * cosT, az = Math.sin(yaw) * half * cosT;
    const fs = this._fieldState;
    this.well.scale.set(r * 2, r * 2, 1);
    this.field.scale.set(r * 2, r * 2, 1);
    fs.ax = ax / r; fs.az = -az / r;
    fs.bx = -ax / r; fs.bz = az / r;
    fs.massA = mA;
    fs.clock = clock;
    fs.energy = travel ? 0.25 + 0.75 * smooth(this.u) : 1;
    fs.fade = 1;
    const dt0 = Math.min(1, Math.max(0.05, c.dissolveTime));
    fs.dissolve = clamp((fadeT - (1 - dt0)) / dt0);
    const slamT = this._tipsFired > 0 ? sinceSlam / Math.max(0.05, c.shockwaveLife) : 2;
    fs.slam = slamT < 1 ? slamT : -1;
    fs.slamX = (this._slamPoint.x - this._target.x) / r;
    fs.slamZ = -(this._slamPoint.z - this._target.z) / r;
    this.fieldMat.userData.sync(fs);
    this.wellMat.userData.sync(fs);

    // 9 · the lens
    const ls = this._lensState;
    ls.hx = heavyIsA ? fs.ax : fs.bx;
    ls.hz = heavyIsA ? fs.az : fs.bz;
    ls.pinch = (travel ? 0.3 * smooth(this.u) : 0.6 + 0.4 * Math.abs(mA - mB)) * fade;
    ls.shock = slamT < 1 ? 1 - slamT : 0;
    ls.wave = Easing.outCubic(clamp(slamT)) * 1.1;
    ls.slamX = fs.slamX;
    ls.slamZ = fs.slamZ;
    ls.clock = clock;
    const lensSize = r * 2.4;
    this.lens.scale.set(lensSize, lensSize, 1);
    // Lens space spans ±1.2 zone radii: rescale the points into it.
    ls.hx /= 1.2; ls.hz /= 1.2; ls.slamX /= 1.2; ls.slamZ /= 1.2; ls.wave /= 1.2;
    this.lens.visible = !this._calm && (ls.pinch * c.lensStrength + ls.shock * c.lensShock) * g.distortion > 0.002;
    if (this.lens.visible) this.lensMat.userData.sync(ls);

    this._syncParticles();
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._scope = null;
    this.root.visible = false;
    this.floor.visible = false;
    this.pairA.visible = this.pairB.visible = false;
    this.lens.visible = false;
    this._tipsFired = 0;
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

/** Editor helpers that degrade to the dev harness's minimal shim. */
function editorKit(Editor) {
  const R = Editor?.range ?? ((f, c, k, min, max, step, label) => f.add(c, k, min, max, step).name?.(label ?? k));
  const sub = (parent, title) => (typeof parent.addFolder === 'function' ? parent.addFolder(title) : parent);
  const color = (f, c, k, label) => f.addColor(c, k).name?.(label ?? k);
  const gradient = (f, c, prefix, title) => {
    if (Editor?.gradient && typeof f.addFolder === 'function') return Editor.gradient(f, c, prefix, title);
    for (const s of ['A', 'B', 'C', 'D']) color(f, c, prefix + s, `${title} ${s}`);
    return f;
  };
  const castAnim = (f, c) => (Editor?.castAnimation ? Editor.castAnimation(f, c) : f.add(c, 'castAnim', CAST_ANIMATIONS));
  return { R, sub, color, gradient, castAnim };
}

export function buildEditor(gui, c, Editor) {
  const { R, sub, color, gradient, castAnim } = editorKit(Editor);
  const folder = gui.addFolder('⚖  Equivalence Engine');

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 80, 0.5, 'pair flies at (m/s)');
  R(cast, c, 'zoneRadius', 1.5, 8, 0.1, 'engine radius (m)');
  R(cast, c, 'lifetime', 0.2, 8, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'cooldown', 0, 15, 0.05, 'cooldown');
  castAnim(cast, c);

  const rule = sub(folder, 'The rule');
  R(rule, c, 'tips', 1, MAX_TIPS, 1, 'slams');
  R(rule, c, 'tipPeriod', 0.2, 2, 0.01, 'between slams (s)');
  R(rule, c, 'swingFraction', 0.05, 0.9, 0.01, 'swing share of a period');
  R(rule, c, 'tipTurn', -1.6, 1.6, 0.01, 'turn per swing (rad)');
  R(rule, c, 'strikeReach', 0.3, 1.5, 0.01, 'heavy half reach (× radius)');
  R(rule, c, 'hitDamage', 0, 5, 0.1, 'damage per slam');
  R(rule, c, 'hitImpulse', 0, 24, 0.1, 'impulse');
  R(rule, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(rule, c, 'hitSpin', 0, 8, 0.05, 'tumble');
  R(rule, c, 'settleTime', 0.2, 3, 0.01, 'linger after last slam (s)');

  const light = sub(folder, 'Light');
  color(light, c, 'lightColor', 'colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'slamLight', 0, 20, 0.1, 'punch per slam');

  const pal = sub(folder, 'Palette');
  gradient(pal, c, 'color', 'mass ramp (core → deep)');

  const engine = sub(folder, '1 · The engine');
  R(engine, c, 'pivotHeight', 0.6, 4, 0.01, 'fulcrum height (m)');
  R(engine, c, 'armReach', 0.3, 1, 0.01, 'beam half-length (× radius)');
  R(engine, c, 'beamThickness', 0.05, 0.8, 0.01, 'beam section (m)');
  R(engine, c, 'beamArch', -0.5, 0.8, 0.01, 'beam arch (m)');
  R(engine, c, 'fulcrumWidth', 0.15, 1.5, 0.01, 'fulcrum base (m)');
  R(engine, c, 'riseTime', 0.05, 1, 0.01, 'rises over (× flight)');
  color(engine, c, 'stoneColor', 'iron-stone');
  R(engine, c, 'stoneMetalness', 0, 1, 0.01, 'metalness');
  R(engine, c, 'stoneRoughness', 0, 1, 0.01, 'roughness');
  color(engine, c, 'stoneEmissive', 'emissive');
  R(engine, c, 'stoneGlow', 0, 4, 0.05, 'emissive intensity');

  const weights = sub(folder, '2 · The counterweights');
  R(weights, c, 'weightSize', 0.15, 1.5, 0.01, 'radius at half mass (m)');
  R(weights, c, 'massSwell', 0, 1.5, 0.01, 'swell with mass');
  R(weights, c, 'seamGlow', 0, 8, 0.05, 'seam glow');
  R(weights, c, 'seamScale', 0.3, 8, 0.05, 'seam scale');
  R(weights, c, 'rimGlow', 0, 4, 0.05, 'rim');
  R(weights, c, 'weightGloss', 0, 2, 0.01, 'gloss');
  R(weights, c, 'lightLift', 0, 1.5, 0.01, 'light weight lifts (m)');
  R(weights, c, 'trembleAmount', 0, 0.2, 0.005, 'tremble at equality (rad)');

  const stream = sub(folder, '3 · The mass stream');
  R(stream, c, 'streamGlow', 0, 6, 0.05, 'glow');
  R(stream, c, 'streamSpeed', 0, 10, 0.05, 'pulse speed');
  R(stream, c, 'streamWidth', 1, 3, 0.01, 'sheath (× beam)');

  const motes = sub(folder, '4 · The motes');
  R(motes, c, 'moteCount', 0, MAX_MOTES, 1, 'grains');
  R(motes, c, 'moteSize', 0.01, 0.3, 0.005, 'grain size');
  R(motes, c, 'moteGlow', 0, 6, 0.05, 'glow');
  R(motes, c, 'moteOrbit', 0.5, 4, 0.01, 'orbit (× weight)');
  R(motes, c, 'moteArc', 0, 4, 0.01, 'transit arc (m)');
  R(motes, c, 'moteSpin', 0, 6, 0.05, 'orbit speed');

  const floor = sub(folder, '5 · The floor');
  R(floor, c, 'fieldGlow', 0, 6, 0.05, 'contour glow');
  R(floor, c, 'contourCount', 1, 16, 0.1, 'contours');
  R(floor, c, 'contourWidth', 0.01, 0.25, 0.005, 'contour width');
  R(floor, c, 'wellDepth', 0, 1, 0.01, 'well darkness');
  R(floor, c, 'fieldNoise', 0, 3, 0.01, 'contour wobble');
  R(floor, c, 'dissolveTime', 0.05, 1, 0.01, 'dissolves over (× exit)');

  const slam = sub(folder, '6 · The slam');
  R(slam, c, 'chipCount', 0, 128, 1, 'chips');
  R(slam, c, 'chipSize', 0.01, 0.5, 0.005, 'chip size');
  R(slam, c, 'chipLife', 0.05, 3, 0.01, 'chip life (s)');
  R(slam, c, 'chipSpeed', 0, 12, 0.05, 'chip speed');
  R(slam, c, 'dustCount', 0, 48, 1, 'dust puffs');
  R(slam, c, 'dustSize', 0.05, 3, 0.01, 'dust size');
  R(slam, c, 'dustLife', 0.1, 4, 0.01, 'dust life (s)');
  R(slam, c, 'dustSpeed', 0, 5, 0.01, 'dust speed');
  R(slam, c, 'burstReach', 0, 2, 0.01, 'dust ball (× radius)');
  R(slam, c, 'burstIntensity', 0, 3, 0.01, 'dust ball brightness');
  R(slam, c, 'burstLife', 0.05, 3, 0.01, 'dust ball life (s)');
  R(slam, c, 'burstOpacity', 0, 1, 0.01, 'dust ball opacity');
  R(slam, c, 'crackRadius', 0.1, 1.5, 0.01, 'crater (× radius)');
  R(slam, c, 'crackLife', 0.1, 6, 0.05, 'crater lasts (s)');
  R(slam, c, 'shockwaveWidth', 0.01, 0.4, 0.005, 'shockwave width');
  R(slam, c, 'shockwaveLife', 0.05, 3, 0.01, 'shockwave life (s)');
  R(slam, c, 'slamShake', 0, 1, 0.01, 'camera knock');
  R(slam, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(slam, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(slam, c, 'slamFlash', 0, 1, 0.01, 'flash');

  const flight = sub(folder, '7 · The flight');
  R(flight, c, 'pairOrbit', 0, 1.5, 0.01, 'pair orbit (m)');
  R(flight, c, 'pairSpin', 0, 30, 0.1, 'pair spin (rad/s)');
  R(flight, c, 'pairSize', 0.1, 1.5, 0.01, 'pair size (× weight)');
  R(flight, c, 'flightHeight', 0.2, 4, 0.01, 'flight height (m)');
  R(flight, c, 'trailRate', 0, 200, 1, 'trail grains/s');
  R(flight, c, 'trailSize', 0.01, 0.4, 0.005, 'trail size');
  R(flight, c, 'trailLife', 0.05, 2, 0.01, 'trail life (s)');

  const exit = sub(folder, '8 · The exit');
  R(exit, c, 'equalizeFraction', 0.05, 0.95, 0.01, 'equalize share of exit');
  R(exit, c, 'sinkDepth', 0, 5, 0.05, 'sinks (m)');

  const lens = sub(folder, '9 · The lens');
  R(lens, c, 'lensStrength', 0, 3, 0.01, 'pinch');
  R(lens, c, 'lensShock', 0, 3, 0.01, 'slam pressure ring');

  return folder;
}
