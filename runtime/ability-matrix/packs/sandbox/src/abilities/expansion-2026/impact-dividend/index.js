import { Group, InstancedMesh, Mesh, Object3D, Vector3 } from 'three';
import { Ability as BaseAbility, AbilityPhase } from '../../Ability.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { validImpactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { createExpansionFX, routeExpansionTransparency, ParticleShape } from '../ExpansionFX.js';
import { createCoreGeometry, createPetalGeometry, createQuad } from './geometry.js';
import {
  createCoreMaterial,
  createCraterMaterial,
  createLensMaterial,
  createPetalMaterial,
  createRingMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;

const UID = 'matrix-expansion/impact-dividend';
const TAU = Math.PI * 2;
/** Petals allocated per pool member (`petalCount` is clamped to this). */
const MAX_PETALS = 8;
/** Bodies one bank may hold. Each is paid exactly once. */
const MAX_DEPOSITS = 8;
/** Compound beats the clock may schedule. */
const MAX_BEATS = 6;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const _obj = new Object3D();
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _up = new Vector3(0, 1, 0);
const _emit = {};
const _force = { impulse: 0, lift: 0, spin: 0 };
const _query = [0, 0, 0];
const _source = [0, 0, 0];
const _found = [];

function angleDelta(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** One pooled particle emission with the globals applied, reusing `_emit`. */
function emitParticles(system, count, position, radius, direction, speed, spread, size, life) {
  if (!system || !(count > 0)) return;
  const g = settings.global;
  const n = Math.min(128, Math.round(count * g.particleCount));
  if (n <= 0) return;
  _emit.position = position;
  _emit.radius = radius;
  _emit.direction = direction;
  _emit.speed = speed * g.particleSpeed;
  _emit.speedVariance = 0.4;
  _emit.spread = spread;
  _emit.size = size * g.particleSize;
  _emit.sizeVariance = 0.45;
  _emit.life = life * g.particleLifetime;
  _emit.lifeVariance = 0.35;
  _emit.spin = 3;
  _emit.time = frame.uTime.value;
  system.emit(n, _emit);
}

function tuneSystem(system, c, prefix, gravityY, drag) {
  if (!system) return;
  system.setGradient?.(getColor(c[`${prefix}A`]), getColor(c[`${prefix}B`]), getColor(c[`${prefix}C`]), getColor(c[`${prefix}D`]));
  const u = system.uniforms;
  if (!u) return;
  const g = settings.global;
  u.uGravity?.value?.set?.(0, gravityY, 0);
  if (u.uDrag) u.uDrag.value = drag;
  if (u.uGlow) u.uGlow.value = g.glow;
  if (u.uOpacity) u.uOpacity.value = g.opacity;
  if (u.uTurbulence) u.uTurbulence.value = 0.4 * g.turbulence;
  if (u.uSizeScale) u.uSizeScale.value = g.particleSize;
  if (u.uSpeedScale) u.uSpeedScale.value = g.particleSpeed;
  if (u.uLifeScale) u.uLifeScale.value = g.particleLifetime;
}

/**
 * IMPACT DIVIDEND — Force, zone cast. "Bank blocked impulse."
 *
 * A blow that is not spent but **banked**, and paid back with interest.
 *
 * 1. **Anticipation.** A forged pressure slug swells at the hand over
 *    `chargeTime`; at the target a dark crater is already being pressed
 *    into the floor (the telegraph), its terraces faintly lit.
 * 2. **Travel.** The slug is lobbed in a high arc (`travelArc`), tumbling,
 *    shedding hot streaks.
 * 3. **Impact — the block.** It lands; the floor cracks, chips heave, and
 *    six lamellar **bulwark petals** of dark forged bronze tear up out of
 *    the floor round it — nearest the caster first, sweeping round both
 *    sides — and slam shut over it with an inward overshoot. The landing's
 *    shock ring runs out to the rim and is then *reeled back in* to the slug:
 *    the blow is blocked and banked. Every enemy inside is **deposited** —
 *    held where it stands, unharmed for now. The camera knock is short.
 * 4. **Linger — compounding.** `compoundBeats` times, each `compoundInterval`
 *    seconds, the bank compounds: the petals **ratchet** a notch tighter and
 *    are pressed into the floor with a ring-out click, one more band of
 *    lamellae lights from the root up (the balance is readable on the
 *    metal), sparks spit from the seams, a deposit ring runs *inward* over
 *    the crater, the slug compresses and its cracks run hotter. Dust is drawn
 *    in off the rim the whole time and the air pinches inward (lens).
 * 5. **Payout.** The petals blow open and fall flat outward like a burst
 *    bud, the slug detonates (a pressure shell, chips, a ring to
 *    `ringPayoutReach × R`, scorch), and every depositor is thrown outward
 *    with the banked impulse. **Exit:** the open petals lie on the cooling
 *    crater, then sink into it as the crater dissolves.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **bulwark petals** — hero: `createPetalGeometry` (cupped lamellar
 *      shell) instanced, `createPetalMaterial` (lit forged bronze, world
 *      layer, shadows; seams and the ledger bands glow).
 *   2. **the core / slug** — `createCoreMaterial`, an opaque forged knot.
 *   3. **the crater** — `createCraterMaterial`, the pressed floor.
 *   4. **the ledger ring** — `createRingMaterial`: out, reeled in, in per
 *      beat, out at the payout.
 *   5. **particles** — seam sparks + flight trail (`STREAK`), heaved and
 *      thrown chips (`CHIP`), inflowing dust (`SMOKE`).
 *   6. **impact / payout** — CRACK, DUSTRING, SCORCH, SHOCKWAVE decals, an
 *      AIR pressure shell, shake, flash, light punches.
 *   7. **the lens** — `LAYER.DISTORTION` pull while banking, ring at payout.
 *
 * ## Gameplay (`handlesOwnHits`)
 *
 * Deposits are taken at the landing (and, with `lateDeposits`, on every
 * beat) from everything alive within `zoneRadius`: UCSM enemies through the
 * expansion combat binding, else the dummy field. At most `MAX_DEPOSITS`;
 * nothing is struck at the landing. At the payout each depositor is struck
 * exactly once, outward from the centre, with
 * `mult = min(maxMultiplier, (1 + depositBonus·(n−1))·(1 + interestRate)^beats)`
 * applied to impulse (≤ 24), lift (≤ 20) and UCSM damage. Deterministic: the
 * schedule is a pure function of the time since landing.
 *
 * ## Live editing
 *
 * Records are the deposit list, beat count and event times; every metre,
 * angle and colour is resolved from `settings.impactDividend` each frame, so
 * dragging `zoneRadius` re-seats the petals, crater and rings mid-cast.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this.petals.count;
  }

  /* ------------------------------------------------------------------ */
  /* The schedule — gameplay                                             */
  /* ------------------------------------------------------------------ */

  _beatsTotal() {
    return Math.max(1, Math.min(MAX_BEATS, Math.round(this.config.compoundBeats)));
  }

  /** Seconds after landing of beat k (1-based). */
  _beatTime(k) {
    const c = this.config;
    const L = settings.global.lifetime;
    return (c.compoundStart + (k - 1) * c.compoundInterval) * L;
  }

  _payoutTime() {
    return this._beatTime(this._beatsTotal()) + this.config.payoutDelay * settings.global.lifetime;
  }

  get impactDuration() {
    return this._payoutTime() + this.config.afterPayout * settings.global.lifetime;
  }

  get fadeDuration() {
    return Math.max(0.3, this.config.sinkTime * settings.global.lifetime);
  }

  /** The banked multiplier for the current deposits and beats. */
  get multiplier() {
    const c = this.config;
    const n = Math.max(1, this._depCount);
    const m = (1 + c.depositBonus * (n - 1)) * Math.pow(1 + c.interestRate, this._beatsDone);
    return Math.max(0, Math.min(c.maxMultiplier, m));
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.resources = [];
    const own = (x) => (this.resources.push(x), x);

    /** Everything seated at the landing site. */
    this.root = new Group();
    this.group.add(this.root);
    const quad = own(createQuad());

    // 1 · bulwark petals — solid, lit, shadowing (world layer).
    this.petalMat = own(createPetalMaterial());
    this.petals = new InstancedMesh(own(createPetalGeometry()), this.petalMat, MAX_PETALS);
    this.petals.castShadow = true;
    this.petals.receiveShadow = true;
    this.petals.frustumCulled = false;
    this.root.add(this.petals);

    // 2 · the core — opaque, in world space (it flies before the site exists).
    this.coreMat = own(createCoreMaterial());
    this.core = new Mesh(own(createCoreGeometry()), this.coreMat);
    this.core.castShadow = true;
    this.core.frustumCulled = false;
    this.group.add(this.core);

    // 3 · the crater
    this.craterMat = own(createCraterMaterial());
    this.crater = new Mesh(quad, this.craterMat);
    this.crater.rotation.x = -Math.PI / 2;
    this.crater.position.y = 0.025;
    this.crater.renderOrder = 1;
    this.root.add(this.crater);

    // 4 · the ledger ring
    this.ringMat = own(createRingMaterial());
    this.ring = new Mesh(quad, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.ring.renderOrder = 3;
    this.root.add(this.ring);

    // 7 · the lens
    this.lensMat = own(createLensMaterial());
    this.lens = new Mesh(quad, this.lensMat);
    this.lens.rotation.x = -Math.PI / 2;
    this.lens.position.y = 0.4;
    this.root.add(this.lens);

    routeExpansionTransparency(this.group);
    this.lens.layers.set(LAYER.DISTORTION);
    this.petals.layers.set(LAYER.WORLD);
    this.core.layers.set(LAYER.WORLD);

    this._inflow = new RateEmitter();
    this._trail = new RateEmitter();
    this._depDummies = new Array(MAX_DEPOSITS).fill(null);
    this._depIds = new Array(MAX_DEPOSITS).fill(null);
    this._depCount = 0;
    this._beatsDone = 0;
    this._beatAt = new Float32Array(MAX_BEATS);
    this._paid = false;
    this._hitCount = 0;
    this._clock = 0;
    this._inflowAngle = 0;
    this._site = new Vector3();
    this._petalState = { heat: 0, lit: 0, inner: 0, pulse: 0, fade: 1 };
    this._coreState = { clock: 0, heat: 0, squash: 1, dissolve: 0 };
    this._craterState = { clock: 0, energy: 0, beat: -1, payout: -1, cool: 0, dissolve: 0, fade: 1 };
    this._ringState = { radius: 0, width: 0.05, power: 0, inward: 0, clock: 0 };
    this._lensState = { pull: 0, shock: 0, wave: 0, clock: 0 };
    this._disposed = false;
  }

  createParticles() {
    this.sparks = createExpansionFX(this.ctx, 'impact-dividend.sparks', { shape: ParticleShape.STREAK, capacity: 480 });
    this.chips = createExpansionFX(this.ctx, 'impact-dividend.chips', { shape: ParticleShape.CHIP, capacity: 480, additive: false });
    this.dust = createExpansionFX(this.ctx, 'impact-dividend.dust', { shape: ParticleShape.SMOKE, capacity: 480, additive: false });
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this._depDummies.fill(null);
    this._depIds.fill(null);
    this._depCount = 0;
    this._beatsDone = 0;
    this._beatAt.fill(0);
    this._paid = false;
    this._hitCount = 0;
    this._clock = 0;
    this._inflowAngle = 0;
    this._calm = prefersReducedMotion();
    this._inflow.reset();
    this._trail.reset();
    this.pointAt(1, this._site);
    this.root.visible = true;
    this.core.visible = true;
    this.petals.visible = false;
    this._sync(0);
  }

  onTravel(dt) {
    this._sync(dt);
  }

  onImpact() {
    this.position.copy(this._site);
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = c.zoneRadius;
    _pos.copy(this._site).setY(0.05);
    this.ctx.decals?.spawn?.(DecalType.CRACK, _pos, {
      radius: R * 0.95, life: c.decalLife, intensity: 1, colorA: getColor(c.bodyColor), colorB: getColor(c.deepColor),
    });
    this.ctx.decals?.spawn?.(DecalType.DUSTRING, _pos, {
      radius: R * 1.2, life: c.decalLife * 0.5, intensity: 0.8, colorA: getColor(c.colorDustB), colorB: getColor(c.colorDustD),
    });
    _pos.setY(0.2);
    emitParticles(this.chips, c.debrisCount, _pos, R * 0.55, _up, c.debrisSpeed, 0.75, c.debrisSize, c.debrisLife);
    this.lightBoost = c.landLight * power;
    if (c.landShake > 0) this.ctx.shake?.add?.(c.landShake * power * g.cameraShake, c.shakeDecay * 1.6, c.shakeFrequency);
    if (c.landFlash > 0) this.ctx.flash?.trigger?.(getColor(c.tintColor), c.landFlash * power);
    this._deposit();
    this._sync(0);
  }

  onFade(dt) {
    const t = this.impactTime + (this.phase === AbilityPhase.FADE ? this.fadeTime : 0);
    const total = this._beatsTotal();
    while (!this._paid && this._beatsDone < total && t >= this._beatTime(this._beatsDone + 1)) {
      this._beatAt[this._beatsDone] = this._beatTime(this._beatsDone + 1);
      this._beatsDone++;
      if (this.config.lateDeposits) this._deposit();
      this._beatFx();
    }
    if (!this._paid && t >= this._payoutTime()) {
      this._paid = true;
      this._payout();
    }
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The bank — gameplay                                                 */
  /* ------------------------------------------------------------------ */

  /** Bank every live enemy inside the circle that is not banked yet. */
  _deposit() {
    const c = this.config;
    const R = c.zoneRadius;
    if (this._depCount >= MAX_DEPOSITS) return;
    if (this._scope) {
      _query[0] = this._site.x; _query[1] = 0; _query[2] = this._site.z;
      const found = this._scope.queryActors({ position: _query, radius: R, relation: 'enemy' });
      if (!found.ok) { this.failure = found.reason; return; }
      for (const actor of found.actors) {
        if (this._depCount >= MAX_DEPOSITS) break;
        if (!actor.alive || this._depIds.includes(actor.id)) continue;
        this._depIds[this._depCount++] = actor.id;
        this._markDeposit(actor.position[0], actor.position[2]);
      }
      return;
    }
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const list = field.findTargets(this._site.x, this._site.z, R, _found);
    for (const dummy of list) {
      if (this._depCount >= MAX_DEPOSITS) break;
      if (!dummy || dummy.alive === false || this._depDummies.includes(dummy)) continue;
      const dx = dummy.position.x - this._site.x;
      const dz = dummy.position.z - this._site.z;
      if (dx * dx + dz * dz > R * R) continue;
      this._depDummies[this._depCount++] = dummy;
      this._markDeposit(dummy.position.x, dummy.position.z);
    }
    _found.length = 0;
  }

  _markDeposit(x, z) {
    const c = this.config;
    _pos.set(x, 0.05, z);
    this.ctx.decals?.spawn?.(DecalType.RIPPLE, _pos, {
      radius: 0.7, life: 1.2, intensity: 0.9, colorA: getColor(c.tintColor), colorB: getColor(c.bodyColor),
    });
    _pos.y = 0.3;
    emitParticles(this.sparks, 8, _pos, 0.3, _up, 2.5, 0.5, c.sparkSize, c.sparkLife * 0.7);
  }

  /** Pay every deposit once, outward from the centre, with the banked force. */
  _payout() {
    const c = this.config;
    const g = settings.global;
    const mult = this.multiplier;
    const intensity = Math.max(0, Math.min(3, g.explosionIntensity));
    _force.impulse = Math.min(24, Math.max(0, c.hitImpulse * mult * intensity));
    _force.lift = Math.min(20, Math.max(0, c.hitLift * mult * intensity));
    _force.spin = Math.min(8, Math.max(0, c.hitSpin));
    this._payoutFx(mult);
    if (this._scope) {
      _source[0] = this._site.x; _source[1] = 0; _source[2] = this._site.z;
      const hitForce = validImpactForce(_force) ? { impulse: _force.impulse, lift: _force.lift, spin: _force.spin } : undefined;
      const damage = Math.min(10, Math.round(c.baseDamage * mult * 100) / 100);
      for (let i = 0; i < this._depCount; i++) {
        const id = this._depIds[i];
        const actor = this._scope.getActor(id);
        if (!actor.ok || actor.actor.alive === false) continue;
        const sent = this._scope.emit({
          type: 'hit', element: 'force', targetIds: [id],
          position: actor.actor.position, sourcePosition: _source, damage,
          hitForce, tags: ['impact-dividend', 'payout'],
        });
        if (sent.ok) this._hitCount++;
        else this.failure = sent.reason;
      }
      return;
    }
    for (let i = 0; i < this._depCount; i++) {
      const dummy = this._depDummies[i];
      if (!dummy || dummy.alive === false) continue;
      _dir.set(dummy.position.x - this._site.x, 0, dummy.position.z - this._site.z);
      if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction);
      else _dir.normalize();
      if (dummy.kill(_dir.x, _dir.z, _force)) this._hitCount++;
    }
  }

  _beatFx() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    this.lightBoost = Math.max(this.lightBoost, c.beatLight * power);
    if (c.beatShake > 0) this.ctx.shake?.add?.(c.beatShake * power * g.cameraShake, c.shakeDecay * 2, c.shakeFrequency);
    // Sparks spit from the lit seams of every petal.
    const n = this._petalCount();
    const H = c.petalHeight * c.zoneRadius;
    const per = Math.max(1, Math.round(c.sparkCount / n));
    const lit = this._beatsDone / this._beatsTotal();
    for (let i = 0; i < n; i++) {
      const b = this._bearing(i, n);
      const seat = c.petalSeat * c.zoneRadius * 0.92;
      _pos.set(this._site.x + Math.cos(b) * seat, H * (0.15 + 0.55 * lit), this._site.z + Math.sin(b) * seat);
      _vel.set(Math.cos(b), 0.9, Math.sin(b)).normalize();
      emitParticles(this.sparks, per, _pos, 0.35, _vel, c.sparkSpeed, 0.6, c.sparkSize, c.sparkLife);
    }
  }

  _payoutFx(mult) {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = c.zoneRadius;
    const scale = 0.7 + 0.3 * mult;
    _pos.copy(this._site).setY(c.coreHeight);
    this.ctx.bursts?.spawn?.(BurstMode.AIR, _pos, {
      radius: R * 0.15, endRadius: R * c.burstReach * power, life: c.burstLife, intensity: c.burstIntensity,
      opacity: c.burstOpacity * g.opacity, fresnel: 2.5 * g.fresnel, squash: 0.55,
      colorA: getColor(c.coreColor), colorB: getColor(c.tintColor), colorC: getColor(c.bodyColor),
    });
    _pos.setY(0.05);
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _pos, {
      radius: R * 1.1, life: c.decalLife, intensity: 0.9, colorA: getColor(c.bodyColor), colorB: getColor(c.deepColor),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: R * c.ringPayoutReach * power, life: 0.7, width: 0.08, intensity: 1.2,
      colorA: getColor(c.coreColor), colorB: getColor(c.tintColor),
    });
    _pos.setY(c.coreHeight * 0.8);
    emitParticles(this.chips, c.payoutDebris * scale, _pos, 0.6, _up, c.debrisSpeed * 1.4 * scale, 0.95, c.debrisSize, c.debrisLife);
    emitParticles(this.sparks, c.sparkCount * 2.5, _pos, 0.4, _up, c.sparkSpeed * 1.8, 1, c.sparkSize * 1.3, c.sparkLife);
    this.lightBoost = c.payoutLight * power * scale;
    if (c.payoutShake > 0) this.ctx.shake?.add?.(c.payoutShake * power * g.cameraShake * scale, c.shakeDecay, c.shakeFrequency);
    if (c.payoutFlash > 0) this.ctx.flash?.trigger?.(getColor(c.tintColor), c.payoutFlash * power);
  }

  /* ------------------------------------------------------------------ */
  /* Presentation                                                        */
  /* ------------------------------------------------------------------ */

  _petalCount() {
    return Math.max(3, Math.min(MAX_PETALS, Math.round(this.config.petalCount)));
  }

  /** Bearing of petal i; a gap faces the caster so the core is seen. */
  _bearing(i, n) {
    const back = Math.atan2(-this.direction.z, -this.direction.x);
    return back + ((i + 0.5) / n) * TAU;
  }

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const R = c.zoneRadius;
    const L = g.lifetime;
    if (!this._calm) this._clock += dt * g.animationSpeed;
    const clock = this._clock;
    const travelling = this.phase === AbilityPhase.TRAVEL;
    const fading = this.phase === AbilityPhase.FADE;
    const t = travelling ? -1 : this.impactTime + (fading ? this.fadeTime : 0);
    const fadeT = fading ? clamp01(this.fadeTime / this.fadeDuration) : 0;
    const total = this._beatsTotal();
    const payoutAt = this._payoutTime();
    const sincePay = this._paid ? t - payoutAt : -1;
    const sinceBeat = this._beatsDone > 0 && !this._paid ? t - this._beatAt[this._beatsDone - 1] : 99;
    const beatPulse = this._calm ? 0 : Math.exp(-Math.max(0, sinceBeat) * 9);
    const banked = this._beatsDone / total;

    this.root.position.copy(this._site);

    /* ---- 1 · petals ---- */
    const n = this._petalCount();
    const H = c.petalHeight * R;
    const seat = c.petalSeat * R;
    const W = c.petalWidth * (TAU * seat) / n;
    const depth = H * Math.pow(Math.max(0.05, c.petalThick) / 0.16, 0.35);
    this.petals.visible = !travelling;
    this.petals.count = n;
    if (!travelling) {
      const entry = Math.atan2(-this.direction.z, -this.direction.x);
      const open = this._paid ? clamp01(sincePay / Math.max(0.05, c.openTime * L)) : 0;
      const sink = fadeT;
      for (let i = 0; i < n; i++) {
        const b = this._bearing(i, n);
        const delay = (Math.abs(angleDelta(b, entry)) / Math.PI) * 0.12 * L;
        const rise = clamp01((t - delay) / Math.max(0.05, c.riseTime * L));
        // Born leaning out, slammed shut past closed, springing back.
        const shut = Easing.outCubic(rise);
        const over = rise < 1 ? Math.sin(Math.PI * rise) * c.riseOvershoot : 0;
        let lean = -0.3 + (c.closedLean + 0.3) * shut + over;
        lean += c.ratchetStep * this._beatsDone;
        if (!this._calm && sinceBeat < 1) {
          lean += c.ratchetStep * 0.7 * Math.exp(-sinceBeat * 7) * Math.cos(TAU * c.ratchetSpring * sinceBeat);
        }
        let y = -H * (1 - Easing.outQuad(rise)) - c.ratchetDrop * H * 0.1 * (this._beatsDone + beatPulse * 0.6);
        let r = seat;
        if (this._paid) {
          const blow = Easing.outBack(open);
          lean = lean + (c.openLean - lean) * blow;
          r += R * 0.18 * Easing.outCubic(open);
          y += c.petalThick * 0.5 * open;
        }
        y -= sink * (0.35 + 0.25 * H);
        _obj.position.set(Math.cos(b) * r, y, Math.sin(b) * r);
        _obj.rotation.set(lean, Math.atan2(-Math.cos(b), -Math.sin(b)), 0, 'YXZ');
        _obj.scale.set(W, H, depth);
        _obj.updateMatrix();
        this.petals.setMatrixAt(i, _obj.matrix);
      }
      this.petals.instanceMatrix.needsUpdate = true;
    }
    const ps = this._petalState;
    ps.heat = travelling ? 0 : this._paid ? Math.max(0, 1 - sincePay / 1.2) : 0.4 + 0.6 * banked;
    ps.lit = this._paid ? 6 * Math.max(0, 1 - sincePay / 0.8) : 6 * banked;
    ps.inner = this._paid ? Math.max(0, 1 - sincePay * 3) : travelling ? 0 : 0.6 + 0.8 * banked + beatPulse;
    ps.pulse = beatPulse;
    ps.fade = 1 - fadeT;
    this.petalMat.userData.sync(ps);

    /* ---- 2 · the core / slug ---- */
    const cs = this._coreState;
    cs.clock = clock;
    cs.dissolve = 0;
    if (travelling) {
      const u = this.u;
      this.pointAt(u, _pos);
      _pos.y = c.handHeight + (c.slugSize - c.handHeight) * u + 4 * c.travelArc * u * (1 - u);
      this.core.position.copy(_pos);
      const swell = Easing.outBack(clamp01(this.age / Math.max(0.02, c.chargeTime * L)));
      this.core.scale.setScalar(Math.max(0.001, c.slugSize * swell));
      this.core.rotation.set(this.age * c.slugSpin * 0.7, this.age * c.slugSpin, 0);
      cs.heat = 0.3 + 0.25 * swell;
      cs.squash = 1;
      // Trail off the slug.
      if (dt > 0) {
        const k = this._trail.tick(dt, c.trailRate * g.particleCount);
        if (k > 0) {
          _vel.set(-this.direction.x, 0.4, -this.direction.z).normalize();
          emitParticles(this.sparks, k / Math.max(0.01, g.particleCount), _pos, c.slugSize * 0.6, _vel, 2, 0.5, c.sparkSize, c.sparkLife * 0.6);
        }
      }
    } else {
      const lift = Easing.outCubic(clamp01(t / Math.max(0.05, c.riseTime * L * 1.4)));
      const size = c.coreSize * (1 - c.coreCompress * (this._beatsDone + beatPulse * 0.5));
      let scale = c.slugSize + (size - c.slugSize) * lift;
      cs.heat = Math.min(1, 0.5 + 0.5 * banked + beatPulse * 0.4);
      cs.squash = 1 - 0.28 * beatPulse;
      if (this._paid) {
        const pop = clamp01(sincePay / 0.28);
        scale *= 1 + 1.4 * Easing.outCubic(pop);
        cs.dissolve = pop;
        cs.heat = 1;
        this.core.visible = pop < 1;
      }
      this.core.position.set(this._site.x, c.slugSize + (c.coreHeight - c.slugSize) * lift, this._site.z);
      this.core.scale.setScalar(Math.max(0.001, scale));
      this.core.rotation.set(0, clock * 0.6 + this._beatsDone * 0.5, 0);
    }
    this.coreMat.userData.sync(cs);

    /* ---- 3 · the crater ---- */
    this.crater.scale.set(R * 2, R * 2, 1);
    const cr = this._craterState;
    cr.clock = clock;
    cr.energy = travelling ? 0.15 * this.u : this._paid ? 1 : 0.4 + 0.6 * banked;
    cr.beat = sinceBeat < c.ringBeatTime * L ? clamp01(sinceBeat / Math.max(0.02, c.ringBeatTime * L)) : -1;
    cr.payout = this._paid && sincePay < c.ringPayoutTime * L ? clamp01(sincePay / Math.max(0.02, c.ringPayoutTime * L)) : -1;
    cr.cool = this._paid ? clamp01(sincePay / Math.max(0.1, c.afterPayout * L)) : 0;
    cr.dissolve = clamp01(fadeT / Math.max(0.05, c.dissolveTime));
    cr.fade = travelling ? 0.25 + 0.75 * this.u : 1;
    this.craterMat.userData.sync(cr);

    /* ---- 4 · the ledger ring ---- */
    const reach = Math.max(1, c.ringPayoutReach);
    const span = R * reach;
    this.ring.scale.set(span * 2, span * 2, 1);
    const rs = this._ringState;
    rs.clock = clock;
    rs.width = c.ringWidth / reach;
    rs.power = 0;
    rs.inward = 0;
    rs.radius = 0;
    if (!travelling) {
      const out = Math.max(0.02, c.ringOutTime * L);
      const reel = Math.max(0.02, c.ringReelTime * L);
      if (this._paid) {
        const k = clamp01(sincePay / Math.max(0.02, c.ringPayoutTime * L));
        rs.radius = Easing.outCubic(k);
        rs.power = (1 - k) * 1.4;
      } else if (t < out) {
        rs.radius = Easing.outCubic(t / out) / reach;
        rs.power = 1;
      } else if (t < out + reel) {
        const k = (t - out) / reel;
        rs.radius = (1 - Easing.inCubic(k)) / reach;
        rs.power = 1 - 0.4 * k;
        rs.inward = 1;
      } else if (sinceBeat < c.ringBeatTime * L) {
        const k = sinceBeat / Math.max(0.02, c.ringBeatTime * L);
        rs.radius = (1 - Easing.inQuad(k)) / reach;
        rs.power = 0.85 * (1 - 0.5 * k);
        rs.inward = 1;
      }
    }
    this.ring.visible = rs.power > 0.003;
    this.ringMat.userData.sync(rs);

    /* ---- 5 · inflowing dust while banking ---- */
    tuneSystem(this.sparks, c, 'colorSpark', c.particleGravity, 0.9);
    tuneSystem(this.chips, c, 'colorSpark', c.particleGravity, 0.5);
    tuneSystem(this.dust, c, 'colorDust', 0.15, 1.4);
    if (!travelling && !this._paid && dt > 0 && t > 0.1) {
      const k = this._inflow.tick(dt, c.inflowRate * g.particleCount);
      for (let i = 0; i < k && i < 12; i++) {
        this._inflowAngle += 2.399963;
        const a = this._inflowAngle;
        _pos.set(this._site.x + Math.cos(a) * R * 1.05, 0.25, this._site.z + Math.sin(a) * R * 1.05);
        _vel.set(-Math.cos(a), 0.12, -Math.sin(a));
        emitParticles(this.dust, 1 / Math.max(0.01, g.particleCount), _pos, 0.3, _vel, R / Math.max(0.1, c.inflowLife), 0.2, c.inflowSize, c.inflowLife);
      }
    }

    /* ---- 7 · the lens ---- */
    this.lens.scale.set(span * 2.1, span * 2.1, 1);
    const ls = this._lensState;
    ls.clock = clock;
    ls.pull = travelling || this._paid || this._calm ? 0 : 0.5 + 0.5 * banked;
    const shockK = this._paid ? clamp01(sincePay / Math.max(0.02, c.ringPayoutTime * L)) : 1;
    ls.shock = this._paid ? 1 - shockK : 0;
    ls.wave = Easing.outCubic(shockK);
    this.lens.visible = (ls.pull * c.lensPull + ls.shock * c.lensShock) * g.distortion > 0.002;
    this.lensMat.userData.sync(ls);
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._scope = null;
    this.root.visible = false;
    this.core.visible = false;
    this.petals.visible = false;
    this.lens.visible = false;
    this.ring.visible = false;
    this._depDummies.fill(null);
    this._depIds.fill(null);
    this._depCount = 0;
    this._paid = false;
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

const FOLDERS = [
  ['The cast', [['range', 2, 40, 0.1], ['minRange', 0, 12, 0.1], ['speed', 4, 60, 0.5], ['cooldown', 0, 20, 0.1], ['lifetime', 0.5, 8, 0.05], ['zoneRadius', 1, 8, 0.05]]],
  ['Light', [['lightIntensity', 0, 30, 0.1], ['lightRadius', 1, 40, 0.1], ['landLight', 0, 30, 0.1], ['beatLight', 0, 30, 0.1], ['payoutLight', 0, 40, 0.1]]],
  ['The bank (gameplay)', [['compoundStart', 0.05, 2, 0.01], ['compoundBeats', 1, MAX_BEATS, 1], ['compoundInterval', 0.1, 1.5, 0.01], ['payoutDelay', 0, 1, 0.01], ['afterPayout', 0.2, 3, 0.01], ['interestRate', 0, 1, 0.01], ['depositBonus', 0, 0.5, 0.01], ['maxMultiplier', 1, 4, 0.05], ['hitImpulse', 0, 24, 0.1], ['hitLift', 0, 20, 0.1], ['hitSpin', 0, 8, 0.05], ['baseDamage', 0, 5, 0.05]]],
  ['0 · The slug', [['handHeight', 0.3, 3, 0.01], ['travelArc', 0, 8, 0.05], ['slugSize', 0.1, 1.2, 0.01], ['slugSpin', 0, 30, 0.1], ['trailRate', 0, 200, 1], ['chargeTime', 0.02, 0.6, 0.01]]],
  ['1 · Bulwark petals', [['petalCount', 3, MAX_PETALS, 1], ['petalSeat', 0.4, 1.3, 0.01], ['petalHeight', 0.3, 2, 0.01], ['petalWidth', 0.3, 1.4, 0.01], ['petalThick', 0.04, 0.5, 0.01], ['riseTime', 0.05, 1, 0.01], ['riseOvershoot', 0, 0.6, 0.01], ['closedLean', -0.2, 1.2, 0.01], ['ratchetStep', 0, 0.3, 0.005], ['ratchetDrop', 0, 0.3, 0.005], ['ratchetSpring', 1, 40, 0.5], ['openTime', 0.05, 1.5, 0.01], ['openLean', -1.6, 0, 0.01], ['sinkTime', 0.1, 2, 0.01], ['bronzeMetalness', 0, 1, 0.01], ['bronzeRoughness', 0, 1, 0.01], ['seamGlow', 0, 10, 0.05], ['innerGlow', 0, 6, 0.05], ['hammerGrain', 0, 1.5, 0.01]]],
  ['2 · The core', [['coreSize', 0.1, 2, 0.01], ['coreHeight', 0.2, 4, 0.01], ['coreCompress', 0, 0.3, 0.005], ['coreGlow', 0, 8, 0.05], ['coreFresnel', 0, 5, 0.05], ['coreCrackScale', 0.5, 10, 0.05], ['coreChurn', 0, 5, 0.05]]],
  ['3 · The crater', [['craterGlow', 0, 6, 0.05], ['craterDark', 0, 1, 0.01], ['craterTerraces', 1, 12, 1], ['craterCracks', 0, 3, 0.01], ['dissolveTime', 0.05, 1, 0.01]]],
  ['4 · The ledger ring', [['ringOutTime', 0.02, 0.6, 0.01], ['ringReelTime', 0.02, 0.8, 0.01], ['ringBeatTime', 0.05, 0.8, 0.01], ['ringPayoutTime', 0.05, 1.5, 0.01], ['ringPayoutReach', 1, 3, 0.01], ['ringWidth', 0.01, 0.4, 0.005], ['ringGlow', 0, 8, 0.05]]],
  ['5 · Particles', [['sparkCount', 0, 120, 1], ['sparkSize', 0.01, 0.4, 0.005], ['sparkLife', 0.05, 2, 0.01], ['sparkSpeed', 0, 15, 0.1], ['debrisCount', 0, 128, 1], ['debrisSize', 0.02, 0.6, 0.005], ['debrisLife', 0.1, 3, 0.01], ['debrisSpeed', 0, 15, 0.1], ['payoutDebris', 0, 128, 1], ['inflowRate', 0, 200, 1], ['inflowSize', 0.05, 1.5, 0.01], ['inflowLife', 0.1, 3, 0.01], ['particleGravity', -20, 5, 0.1]]],
  ['6 · Impact + payout', [['landShake', 0, 2, 0.01], ['beatShake', 0, 1, 0.01], ['payoutShake', 0, 2, 0.01], ['shakeDecay', 0.5, 20, 0.1], ['shakeFrequency', 1, 40, 0.5], ['landFlash', 0, 1, 0.01], ['payoutFlash', 0, 1, 0.01], ['burstReach', 0, 3, 0.01], ['burstLife', 0.05, 2, 0.01], ['burstIntensity', 0, 3, 0.01], ['burstOpacity', 0, 1, 0.01], ['decalLife', 0.2, 10, 0.1]]],
  ['7 · Distortion', [['lensPull', 0, 2, 0.01], ['lensShock', 0, 3, 0.01]]],
];

export function buildEditor(gui, c, Editor) {
  const R = Editor?.range ?? ((f, cc, k, min, max, step, label) => f.add(cc, k, min, max, step).name?.(label ?? k));
  const sub = (parent, title) => (typeof parent.addFolder === 'function' ? parent.addFolder(title) : parent);
  const folder = gui.addFolder('⬣  Impact Dividend');
  const seen = new Set(['castAnim', 'lateDeposits']);
  for (const [title, keys] of FOLDERS) {
    const f = sub(folder, title);
    for (const [key, min, max, step] of keys) {
      if (typeof c[key] !== 'number') continue;
      R(f, c, key, min, max, step, key);
      seen.add(key);
    }
    if (title === 'The cast') {
      if (Editor?.castAnimation) Editor.castAnimation(f, c);
      else f.add(c, 'castAnim', CAST_ANIMATIONS);
    }
    if (title === 'The bank (gameplay)') f.add(c, 'lateDeposits');
  }
  const colours = sub(folder, 'Colours');
  for (const prefix of ['colorSpark', 'colorDust']) {
    if (Editor?.gradient && typeof colours.addFolder === 'function') Editor.gradient(colours, c, prefix, prefix);
    else for (const s of ['A', 'B', 'C', 'D']) colours.addColor(c, prefix + s);
    for (const s of ['A', 'B', 'C', 'D']) seen.add(prefix + s);
  }
  for (const [key, value] of Object.entries(c)) {
    if (seen.has(key)) continue;
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) colours.addColor(c, key);
    else if (typeof value === 'number') R(folder, c, key, 0, Math.max(1, value * 4), 0.01, key);
  }
  return folder;
}
