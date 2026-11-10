import { DoubleSide, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { createExpansionFX, routeExpansionTransparency, ParticleShape } from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { frame } from '../../../core/FrameUniforms.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { LAYER } from '../../../core/Layers.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import {
  createArborGeometry,
  createKeyGeometry,
  createPawlGeometry,
  createQuad,
  createRatchetGeometry,
  createSmearGeometry,
  createSpringGeometry,
  writeSpring,
} from './geometry.js';
import { createBandSteelMaterial, createLedgerMaterial, createLensMaterial, createSmearMaterial, createStressMaterial } from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
const UID = 'matrix-expansion/temporal-mortgage';

const TAU = Math.PI * 2;
const clamp = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Angle wrapped into [0, 2π). */
const wrap = (a) => ((a % TAU) + TAU) % TAU;

/** Bodies the lash may strike in one cast. */
const MAX_TARGETS = 16;
/** Ids carried by the debt status (the bridge accepts ≤ 8 targets per event). */
const MAX_STATUS = 8;

const _pos = new Vector3();
const _dir = new Vector3();
const _up = new Vector3(0, 1, 0);
/** Reused emit bag (ParticleSystem.emit destructures, never retains). */
const _emit = { position: _pos, direction: _dir, radius: 0, speed: 1, spread: 0.5, size: 0.1, life: 0.5, spin: 2, time: 0 };
/** Reused spring parameters for `writeSpring`. */
const _spring = { r0: 0.4, rOut: 1, phi: 20, psi: 0, height: 1, thick: 0.1, wave: 0, wavePhase: 0, hookCurl: 0.5, hookShare: 0.05, taper: 0, ribbon: 0 };

/**
 * TEMPORAL MORTGAGE — Time, zone cast. *Borrowed speed with recovery debt.*
 *
 * A loan of speed, taken against the cast's own future and repaid to the
 * last tick. The cast keeps one clock, τ, that is allowed to disagree with
 * real time t — and the whole spell is the story of that disagreement:
 *
 *   - **Anticipation** (`chargeTime`): a mainspring winds itself tight in the
 *     hand — a small coil of blued steel, stress light running hot along it.
 *   - **Travel**: the wound coil is thrown, spinning, in an arc to the target.
 *   - **Impact** (landing): it hits the floor and lets go. Shell, crack and
 *     shock decals, knock, flash, light punch, dust — and the spring is full
 *     size, 4½ turns of steel band standing 1.4 m on edge round an iron arbor.
 *   - **Linger 1 — the borrow** (`borrowTime`): τ runs at `borrowRate` ×.
 *     The spring uncoils and its outer limb **lashes once round the whole
 *     circle**, from the caster's side, a wedge of streaked speed-smear behind
 *     it, sparks off the tip, the floor lit behind it. Every enemy it passes
 *     is struck along the lash.
 *   - **Linger 2 — the repayment**: the loan falls due. τ runs at
 *     `repayRate` ×, for exactly `R = (k − 1)·B / (1 − ρ)` seconds, so that τ
 *     stands level with t on the last frame. The winding key on the arbor
 *     turns the spring back up in `repayTicks` ratchet clicks — the pawl
 *     drops, filings spit, the lit ledger on the floor is inked back sector
 *     by sector, motes hang almost still in the slowed air.
 *   - **Exit** (`exitTime`): the loan is paid. A cold flash, a ripple, and
 *     the tight-wound spring sinks into its ledger, which dissolves.
 *
 * How far the spring stands open is, on every frame, the outstanding balance
 * `U = (τ − t) / ((k − 1)·B)` — it opens while the debt is drawn and closes
 * as it is paid, and it is shut tight exactly when τ = t again. Nothing in the
 * choreography has its own timer.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the mainspring** — `createSpringGeometry` / `writeSpring`: a closed
 *      box ribbon on an Archimedean spiral, rewritten each frame from
 *      (r0, rOut, turn, start angle, height); lit blued steel
 *      (`MeshStandardMaterial`, `LAYER.WORLD`, casts shadows).
 *   2. **the stress light** (`createStressMaterial`) — the same vertices again,
 *      additive: pulses running out along the band while borrowing and back in
 *      while repaying, hot top edge, all × the balance.
 *   3. **the iron** — turned arbor, saw-tooth ratchet (turns with the inner
 *      coil), a world-fixed pawl that kicks on every click, a butterfly key.
 *   4. **the ledger** (`createLedgerMaterial`) — floor field welded to the
 *      spring's spiral: deep bed, coil groove, debt-lit sector, inked repaid
 *      sector, white tip line; noise dissolve on exit.
 *   5. **the smear** (`createSmearMaterial`) — streaked light trailing the tip.
 *   6. **particles** — STREAK sparks off the tip, CHIP filings on each click and
 *      each hit, SOFT time motes emitted and rising at the clock's rate.
 *   7. **impact & settlement** — AIR shell, CRACK + SHOCKWAVE + DUSTRING on
 *      landing, a knock per body, RIPPLE + flash when the loan is paid.
 *   8. **the lens** (`createLensMaterial`, `LAYER.DISTORTION`) — shear signed
 *      by the clock's rate; pressure ring on landing.
 *
 * ## Hits (`handlesOwnHits`)
 *
 * Targets inside `zoneRadius` are recorded on landing (≤ 16, nearest first)
 * with their bearing from the centre. While borrowing, the lash's swept angle
 * is `2π · sweepTurns · U`; a target is struck once, on the frame the sweep
 * passes its bearing (measured from the caster's side), knocked along the
 * lash. Through the combat binding each strike is one `hit` (damage 1), and
 * at the turn of the loan the survivors receive one `status` event carrying
 * the time status for the length of the repayment. No hits during the
 * repayment or exit.
 *
 * ## The editor rule
 *
 * A cast keeps only dice and event flags (landing bearing, recorded target
 * bearings, which were struck, the last ratchet click). Every dimension,
 * rate, colour and count is read from `settings.temporalMortgage` per frame.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return 6 + this._targetCount;
  }

  /* ------------------------------------------------------------------ */
  /* The loan — gameplay timing                                          */
  /* ------------------------------------------------------------------ */

  /** Live loan terms: { B, k, rho, R } in real seconds. */
  _terms() {
    const c = this.config;
    const L = Math.max(0.05, settings.global.lifetime);
    const T = this._termsOut;
    T.B = Math.max(0.05, c.borrowTime) * L;
    T.k = Math.max(1.01, c.borrowRate);
    T.rho = Math.max(0.02, Math.min(0.95, c.repayRate));
    T.R = ((T.k - 1) * T.B) / (1 - T.rho);
    return T;
  }

  get impactDuration() {
    const T = this._terms();
    return T.B + T.R;
  }

  get fadeDuration() {
    return Math.max(0.1, this.config.exitTime) * Math.max(0.05, settings.global.lifetime);
  }

  /** The cast clock τ at real time t since landing (exact, piecewise). */
  _tauAt(t, T) {
    if (t <= T.B) return T.k * t;
    if (t <= T.B + T.R) return T.k * T.B + T.rho * (t - T.B);
    return t;
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
    this._termsOut = { B: 1, k: 2, rho: 0.5, R: 1 };
    this.root = new Group();
    this.group.add(this.root);
    // Everything that sinks on the exit and flies in the throw.
    this.body = new Group();
    this.root.add(this.body);
    const quad = own(createQuad());

    // 4 · the ledger (floor)
    this.ledgerMat = own(createLedgerMaterial());
    this.ledger = new Mesh(quad, this.ledgerMat);
    this.ledger.rotation.x = -Math.PI / 2;
    this.ledger.position.y = 0.03;
    this.ledger.renderOrder = 2;
    this.root.add(this.ledger);

    // 1 · the mainspring: solid, lit blued steel
    this.springGeom = own(createSpringGeometry());
    this.steel = own(new MeshStandardMaterial({
      color: 0x2b4f86, metalness: 0.9, roughness: 0.28, emissive: 0x0d3a70, emissiveIntensity: 0.3, side: DoubleSide,
    }));
    // The band itself is tempered: the ramp's deep stop is on the metal (dark
    // at the foot and on the inner coils), the glow lives only in the stress
    // light's edge line and stress slashes.
    this.bandSteel = own(createBandSteelMaterial());
    this.spring = new Mesh(this.springGeom, this.bandSteel);
    this.spring.castShadow = true;
    // No self-shadowing: on a thin curved band it reads as striped acne.
    this.spring.receiveShadow = false;
    this.spring.frustumCulled = false;
    this.body.add(this.spring);

    // 2 · the stress light on the same vertices
    this.stressMat = own(createStressMaterial());
    this.stress = new Mesh(this.springGeom, this.stressMat);
    this.stress.frustumCulled = false;
    this.stress.renderOrder = 4;
    this.body.add(this.stress);

    // 3 · the iron
    this.iron = own(new MeshStandardMaterial({
      color: 0x1a2233, metalness: 0.75, roughness: 0.42, emissive: 0x0a1a33, emissiveIntensity: 0.4,
    }));
    this.arbor = new Mesh(own(createArborGeometry()), this.iron);
    this.arbor.castShadow = true;
    this.body.add(this.arbor);
    this._ratchetTeeth = Math.round(config.settings.ratchetTeeth);
    this.ratchetGeom = createRatchetGeometry(this._ratchetTeeth);
    this.ratchet = new Mesh(this.ratchetGeom, this.steel);
    this.ratchet.castShadow = true;
    this.body.add(this.ratchet);
    this.pawlPivot = new Group();
    this.pawl = new Mesh(own(createPawlGeometry()), this.iron);
    this.pawl.castShadow = true;
    this.pawlPivot.add(this.pawl);
    this.body.add(this.pawlPivot);
    this.keyPivot = new Group();
    this.key = new Mesh(own(createKeyGeometry()), this.steel);
    this.key.castShadow = true;
    this.keyPivot.add(this.key);
    this.body.add(this.keyPivot);

    // 5 · the smear
    this.smearMat = own(createSmearMaterial());
    this.smear = new Mesh(own(createSmearGeometry()), this.smearMat);
    this.smear.frustumCulled = false;
    this.smear.renderOrder = 5;
    this.root.add(this.smear);

    // 8 · the lens (opaque proxy on the warp layer)
    this.lensMat = own(createLensMaterial());
    this.lens = new Mesh(quad, this.lensMat);
    this.lens.rotation.x = -Math.PI / 2;
    this.lens.position.y = 0.4;
    this.lens.visible = false;
    this.root.add(this.lens);

    // Pooled per-cast records: dice and flags only.
    this._targets = new Array(MAX_TARGETS).fill(null);
    this._targetIds = new Array(MAX_TARGETS).fill('');
    this._targetX = new Float32Array(MAX_TARGETS);
    this._targetZ = new Float32Array(MAX_TARGETS);
    this._targetRel = new Float32Array(MAX_TARGETS);
    this._targetHit = new Uint8Array(MAX_TARGETS);
    this._statusIds = [];
    this._targetCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._sparkEmitter = new RateEmitter();
    this._moteEmitter = new RateEmitter();

    this._stressState = { debt: 0, flow: 0, fade: 1, flash: 0 };
    this._ledgerState = { radius: 1, r0: 0.4, rOut: 1, phi: 20, psi: 0, theta0: 0, sweep: 0, sweepMax: 0, debt: 0, clock: 0, fade: 1, dissolve: 0 };
    this._smearState = { tip: 0, len: 1, dir: 1, power: 0, clock: 0 };
    this._lensState = { shear: 0, shock: 0, wave: 0, clock: 0 };

    routeExpansionTransparency(this.group);
    this.lens.layers.set(LAYER.DISTORTION);
    for (const solid of [this.spring, this.arbor, this.ratchet, this.pawl, this.key]) solid.layers.set(LAYER.WORLD);
    this._disposed = false;
    this._resetCast();
  }

  createParticles() {
    const ramp = [config.settings.colorSparkA, config.settings.colorSparkB, config.settings.colorSparkC, config.settings.colorSparkD];
    this.sparks = createExpansionFX(this.ctx, 'time-mortgage-sparks', { shape: ParticleShape.STREAK, colors: ramp });
    this.chips = createExpansionFX(this.ctx, 'time-mortgage-filings', { shape: ParticleShape.CHIP, colors: ramp });
    this.motes = createExpansionFX(this.ctx, 'time-mortgage-motes', { shape: ParticleShape.SOFT, colors: ramp });
  }

  /** Clear every per-cast flag (spawn and construction). */
  _resetCast() {
    this._landed = false;
    this._repaying = false;
    this._settled = false;
    this._targetCount = 0;
    this._targetHit.fill(0);
    for (let i = 0; i < MAX_TARGETS; i++) {
      this._targets[i] = null;
      this._targetIds[i] = '';
    }
    this._statusIds.length = 0;
    this.struck = 0;
    this.clicks = 0;
    this.balance = 0;
    this.clockDebt = 0;
    this._tau = 0;
    this._sweepMax = 0;
    this._lastInstalment = -1;
    this._clickAge = 99;
    this._hitAge = 99;
    this._theta0 = 0;
    this._trailT = 0;
    this._sparkEmitter.reset();
    this._moteEmitter.reset();
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._resetCast();
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this._calm = prefersReducedMotion();
    this.root.visible = true;
    // The lash starts on the caster's side of the circle.
    this._theta0 = Math.atan2(-this.direction.z, -this.direction.x);
    this._sync(0);
  }

  /** Anticipation: the spring winds in the hand before it leaves it. */
  advance(dt) {
    const hold = Math.max(0, this.config.chargeTime) * Math.max(0.05, settings.global.lifetime);
    if (this.age < hold) {
      this.pointAt(0, this.position);
      return false;
    }
    const speed = this.config.speed * settings.global.speed;
    const easeIn = Easing.outQuad(clamp((this.age - hold) / 0.08));
    this.front += speed * Math.max(0.15, easeIn) * dt;
    const previousU = this.u;
    this.u = clamp(this.front / this.length);
    this.pointAt(this.u, this.position);
    return this.u >= 1 && previousU < 1;
  }

  onTravel(dt) {
    this._sync(dt);
  }

  onImpact() {
    this._landed = true;
    this.position.y = 0;
    this._recordTargets();
    this._land();
    this._sync(0);
  }

  onFade(dt) {
    const T = this._terms();
    const t = this.phase === 'fade' ? T.B + T.R + this.fadeTime : this.impactTime;
    // The lash: strike what the sweep has passed.
    if (!this._repaying) this._sweepHits(t, T);
    if (!this._repaying && t >= T.B) {
      this._repaying = true;
      this._chargeDebt(T);
    }
    if (this.phase === 'fade' && !this._settled) {
      this._settled = true;
      this._settle();
    }
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Gameplay                                                            */
  /* ------------------------------------------------------------------ */

  /** Snapshot targets inside the circle on landing, with their bearings. */
  _recordTargets() {
    const c = this.config;
    const r = c.zoneRadius;
    const cx = this.position.x, cz = this.position.z;
    let n = 0;
    if (this._scope) {
      const found = this._scope.queryActors({ position: [cx, 0, cz], radius: r, relation: 'enemy' });
      if (!found.ok) {
        this.failure = found.reason;
      } else {
        for (const actor of found.actors) {
          if (n >= MAX_TARGETS) break;
          this._targetIds[n] = actor.id;
          this._targetX[n] = actor.position[0];
          this._targetZ[n] = actor.position[2];
          n++;
        }
      }
    } else if (this.ctx.dummies?.findTargets) {
      const found = this.ctx.dummies.findTargets(cx, cz, r, this._found);
      for (const dummy of found) {
        if (n >= MAX_TARGETS) break;
        const dx = dummy.position.x - cx, dz = dummy.position.z - cz;
        if (dx * dx + dz * dz > r * r) continue;
        this._targets[n] = dummy;
        this._targetX[n] = dummy.position.x;
        this._targetZ[n] = dummy.position.z;
        n++;
      }
      this._found.length = 0;
    }
    for (let i = 0; i < n; i++) {
      const dx = this._targetX[i] - cx, dz = this._targetZ[i] - cz;
      // A body standing on the arbor is struck first.
      this._targetRel[i] = dx * dx + dz * dz < 1e-6 ? 0 : wrap(Math.atan2(dz, dx) - this._theta0);
    }
    this._targetCount = n;
  }

  /** Strike every recorded target whose bearing the lash has passed. */
  _sweepHits(t, T) {
    const turns = Math.max(1, this.config.sweepTurns);
    const swept = t >= T.B ? TAU * turns : TAU * turns * clamp(t / T.B);
    for (let i = 0; i < this._targetCount; i++) {
      if (this._targetHit[i] || this._targetRel[i] > swept) continue;
      this._targetHit[i] = 1;
      this._strike(i);
    }
  }

  _strike(i) {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    const cx = this.position.x, cz = this.position.z;
    const bearing = this._theta0 + this._targetRel[i];
    // Knocked along the lash (the sweep's tangent), and out of the circle.
    const share = clamp(c.tangentPush);
    let kx = -Math.sin(bearing) * share + Math.cos(bearing) * (1 - share);
    let kz = Math.cos(bearing) * share + Math.sin(bearing) * (1 - share);
    const kl = Math.hypot(kx, kz) || 1;
    kx /= kl;
    kz /= kl;
    let landed = false;
    if (this._scope) {
      const id = this._targetIds[i];
      const sent = this._scope.emit({
        type: 'hit', element: 'time', targetIds: [id],
        position: [this._targetX[i], 0, this._targetZ[i]],
        sourcePosition: [this._targetX[i] - kx, 0, this._targetZ[i] - kz],
        damage: 1, hitForce: impactForce(c, power), tags: ['temporal-mortgage', 'borrowed-speed'],
      });
      if (!sent.ok) this.failure = sent.reason;
      else {
        landed = true;
        if (this._statusIds.length < MAX_STATUS) this._statusIds.push(id);
      }
    } else {
      const dummy = this._targets[i];
      if (dummy && dummy.alive !== false) {
        this._force.impulse = c.hitImpulse * power;
        this._force.lift = c.hitLift * power;
        this._force.spin = c.hitSpin;
        landed = !!dummy.kill(kx, kz, this._force);
      }
    }
    if (!landed) return;
    this.struck++;
    this._hitAge = 0;
    _pos.set(this._targetX[i], 0.9, this._targetZ[i]);
    _dir.set(kx, 0.4, kz).normalize();
    this._emitTo(this.sparks, c.hitCount, 0.25, c.sparkSpeed * 1.4, 0.5, c.sparkSize * 1.3, c.sparkLife);
    this._emitTo(this.chips, Math.round(c.hitCount * 0.5), 0.2, c.sparkSpeed * 0.7, 0.7, c.clickSize * 1.4, c.clickLife);
    if (c.hitShake > 0) this.ctx.shake?.add?.(c.hitShake * power, c.shakeDecay, c.shakeFrequency);
  }

  /** The loan falls due: struck survivors carry the time status for the repayment. */
  _chargeDebt(T) {
    const scope = this._scope;
    if (!scope || scope.standalone || !this._statusIds.length || this.config.debtStatus < 0.5) return;
    const ticks = Math.max(1, Math.round(T.R * (scope.tickRate ?? 30)));
    const sent = scope.emit({
      type: 'status', element: 'time', targetIds: this._statusIds,
      durationTicks: ticks, tags: ['temporal-mortgage', 'recovery-debt'],
    });
    if (!sent.ok) this.statusFailure = sent.reason;
  }

  /* ------------------------------------------------------------------ */
  /* Beats                                                               */
  /* ------------------------------------------------------------------ */

  _emitTo(system, count, radius, speed, spread, size, life) {
    if (!system || count <= 0) return;
    const g = settings.global;
    const n = Math.min(128, Math.max(0, Math.round(count * g.particleCount)));
    if (!n) return;
    _emit.radius = radius;
    _emit.speed = speed * g.particleSpeed;
    _emit.spread = spread;
    _emit.size = size * g.particleSize;
    _emit.life = life * g.particleLifetime;
    _emit.time = frame.uTime.value;
    system.emit(n, _emit);
  }

  /** Landing: the spring hits the floor and lets go. */
  _land() {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    const r = c.zoneRadius;
    this.lightBoost = c.landLight * power;
    _pos.copy(this.position).setY(0.05);
    this.ctx.bursts?.spawn?.(BurstMode.AIR, _pos, {
      radius: r * 0.08, endRadius: r * c.burstReach * power, life: c.burstLife, intensity: c.burstIntensity,
      opacity: c.burstOpacity * settings.global.opacity, fresnel: c.burstFresnel, squash: c.burstSquash,
      colorA: getColor(c.colorBurstA), colorB: getColor(c.colorBurstB), colorC: getColor(c.colorBurstC),
    });
    this.ctx.decals?.spawn?.(DecalType.CRACK, _pos, {
      radius: r * 0.55, life: c.decalLife, intensity: c.crackIntensity,
      colorA: getColor(c.tintColor), colorB: getColor(c.deepColor),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: r * 1.3 * power, life: c.decalLife * 0.3, width: c.shockwaveWidth, intensity: c.shockwaveIntensity,
      colorA: getColor(c.coreColor), colorB: getColor(c.bodyColor),
    });
    this.ctx.decals?.spawn?.(DecalType.DUSTRING, _pos, {
      radius: r * 0.9, life: c.decalLife * 0.5, intensity: 0.6,
      colorA: getColor(c.tintColor), colorB: getColor(c.deepColor),
    });
    _dir.copy(_up);
    _pos.setY(0.2);
    this._emitTo(this.motes, c.landCount, r * 0.35, c.sparkSpeed * 0.6, 0.9, c.moteSize * 1.6, c.moteLife * 0.6);
    this._emitTo(this.chips, Math.round(c.landCount * 0.5), r * 0.2, c.sparkSpeed, 0.8, c.clickSize, c.clickLife);
    if (c.landShake > 0) this.ctx.shake?.add?.(c.landShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.landFlash > 0) this.ctx.flash?.trigger?.(getColor(c.tintColor), c.landFlash * power);
  }

  /** One instalment: the ratchet clicks a tooth back. */
  _click(hubY) {
    const c = this.config;
    this.clicks++;
    this._clickAge = 0;
    const r = c.zoneRadius;
    const rr = r * c.ratchetSize;
    _pos.set(this.position.x + this.side.x * rr, hubY, this.position.z + this.side.z * rr);
    _dir.set(this.side.x, 0.8, this.side.z).normalize();
    this._emitTo(this.chips, c.clickCount, 0.08, c.sparkSpeed * 0.45, 0.6, c.clickSize, c.clickLife);
    this._emitTo(this.sparks, Math.round(c.clickCount * 0.6), 0.05, c.sparkSpeed * 0.6, 0.5, c.sparkSize * 0.7, c.sparkLife * 0.6);
    if (c.clickShake > 0) this.ctx.shake?.add?.(c.clickShake * settings.global.explosionIntensity, c.shakeDecay * 1.5, c.shakeFrequency);
  }

  /** The loan is paid: cold flash and a ripple. */
  _settle() {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    this.lightBoost = c.settleLight * power;
    _pos.copy(this.position).setY(0.05);
    this.ctx.decals?.spawn?.(DecalType.RIPPLE, _pos, {
      radius: c.zoneRadius, life: c.decalLife * 0.5, intensity: c.rippleIntensity,
      colorA: getColor(c.coreColor), colorB: getColor(c.bodyColor),
    });
    if (c.settleFlash > 0) this.ctx.flash?.trigger?.(getColor(c.coreColor), c.settleFlash * power);
    _dir.copy(_up);
    _pos.setY(0.3);
    this._emitTo(this.motes, Math.round(c.landCount * 0.5), c.zoneRadius * 0.3, c.moteRise, 0.6, c.moteSize, c.moteLife);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    for (const fx of [this.sparks, this.chips, this.motes]) {
      if (!fx?.uniforms) continue;
      fx.setGradient?.(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
      const u = fx.uniforms;
      if (u.uGlow) u.uGlow.value = c.sparkGlow * g.glow;
      if (u.uOpacity) u.uOpacity.value = g.opacity;
      if (u.uTurbulence) u.uTurbulence.value = 0.4 * g.turbulence;
      if (u.uSizeScale) u.uSizeScale.value = g.particleSize;
      if (u.uSpeedScale) u.uSpeedScale.value = g.particleSpeed;
      if (u.uLifeScale) u.uLifeScale.value = g.particleLifetime;
    }
  }

  lightShimmer() {
    // The light flickers at the cast's own clock: fast, then slow.
    return 0.88 + 0.12 * Math.sin(this._tau * 9.1) * Math.sin(this._tau * 3.3);
  }

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const T = this._terms();
    const R = c.zoneRadius;
    const L = Math.max(0.05, g.lifetime);
    const travelling = this.phase === 'travel';
    const fading = this.phase === 'fade';
    const fadeT = fading ? clamp(this.fadeTime / this.fadeDuration) : 0;
    const fade = 1 - fadeT;

    // --- the loan: real time t since landing, cast clock τ, balance U ---
    const t = travelling ? 0 : fading ? T.B + T.R + this.fadeTime : this.impactTime;
    const tau = travelling ? this.age : this._tauAt(t, T);
    this._tau = tau;
    this.clockDebt = travelling ? 0 : tau - t;
    const balance = travelling ? 0 : t < T.B ? clamp(t / T.B) : t < T.B + T.R ? 1 - clamp((t - T.B) / T.R) : 0;
    this.balance = balance;
    const rate = travelling ? 1 : t < T.B ? T.k : t < T.B + T.R ? T.rho : 1;
    const ambient = this._calm ? 0 : tau;

    // The spring's visible openness: smooth while borrowing, ratchet steps while repaying.
    let open = balance;
    if (this._repaying && !travelling) {
      const n = Math.max(1, Math.round(c.repayTicks));
      const q = balance * n;
      const inst = Math.min(n - 1, Math.floor(q));
      const snap = clamp(c.tickSnap);
      const f = q - Math.floor(q);
      open = balance <= 0 ? 0 : (Math.floor(q) + (snap > 0 ? smoothstep(1 - snap, 1, f) : 1)) / n;
      if (this._lastInstalment < 0) this._lastInstalment = n;
      if (balance > 0 && inst < this._lastInstalment) {
        this._lastInstalment = inst;
        this._click(R * c.bandHeight + 0.1);
      }
    }
    if (dt > 0) {
      this._clickAge += dt;
      this._hitAge += dt;
    }

    // --- placement of the body: hand → arc → floor → sunk ---
    const hold = Math.max(0, c.chargeTime) * L;
    const H = R * c.bandHeight;
    let scale = 1;
    let tilt = 0;
    let spin = 0;
    this.root.position.set(this.position.x, 0, this.position.z);
    if (travelling) {
      const charge = hold > 0 ? clamp(this.age / hold) : 1;
      const handX = this.origin.x + this.direction.x * c.handForward;
      const handZ = this.origin.z + this.direction.z * c.handForward;
      const k = this.u;
      const y = lerp(c.handHeight, 0.15, k) + Math.sin(Math.PI * k) * c.travelArc;
      this.root.position.set(lerp(handX, this.position.x, k), 0, lerp(handZ, this.position.z, k));
      this.body.position.y = y - H * c.travelScale * 0.5;
      this.position.y = y;
      scale = c.travelScale * Easing.outBack(charge);
      tilt = 1.1;
      spin = this.age * c.travelSpin * (0.3 + 0.7 * charge * charge);
      // Winding: the hand lights up as the coil is wound tight.
      if (this.age < hold) this.lightBoost = Math.max(this.lightBoost, c.chargeLight * charge * settings.global.explosionIntensity);
      // Sparks and soft time motes shed along the throw: the path stays drawn.
      if (dt > 0) {
        this._trailT += dt;
        if (this._trailT >= 0.03) {
          this._trailT = 0;
          _pos.set(this.root.position.x, y, this.root.position.z);
          _dir.copy(this.direction).multiplyScalar(-1).add(_up).normalize();
          if (this.age >= hold) this._emitTo(this.sparks, c.trailCount, 0.1, c.sparkSpeed * 0.4, 0.6, c.sparkSize, c.sparkLife * 0.7);
          // Winding in the hand: a glow of motes at the coil; in flight: they hang behind it.
          this._emitTo(this.motes, c.trailGlow, this.age < hold ? 0.35 : 0.12, this.age < hold ? 0.6 : 0.15, 0.8, c.trailGlowSize, c.moteLife * 0.6);
        }
      }
    } else {
      const land = clamp(t / Math.max(0.02, c.landTime * L));
      scale = lerp(c.travelScale, 1, Easing.outBack(land));
      tilt = 1.1 * (1 - Easing.outCubic(land));
      this.body.position.y = -Easing.inCubic(fadeT) * c.sinkDepth * H;
      this.position.y = c.lightHeight;
    }
    this.body.scale.setScalar(Math.max(0.001, scale));
    this.body.rotation.set(tilt, -spin, 0, 'YXZ');

    // --- 1 · the mainspring ---
    const turns = Math.max(1, c.sweepTurns);
    const tipAngle = this._theta0 + TAU * turns * open;
    const phi = TAU * lerp(c.tightTurns, c.openTurns, open);
    const psi = tipAngle - phi;
    _spring.r0 = R * c.arborShare;
    _spring.rOut = Math.max(_spring.r0 + 0.1, R * lerp(c.tightOuter, c.openOuter, open));
    _spring.phi = phi;
    _spring.psi = psi;
    _spring.height = H;
    _spring.thick = c.bandThickness;
    _spring.wave = this._calm ? 0 : c.bandWave * (balance > 0 && !this._repaying ? 1 : 0.25);
    _spring.wavePhase = ambient * 6;
    _spring.hookCurl = c.hookCurl;
    _spring.hookShare = c.hookShare;
    _spring.taper = Math.max(0, Math.min(0.9, c.bandTaper));
    // One coiled band, not concentric walls: the foot lifts toward the arbor
    // so the coil climbs as a conical helix (0 = every coil stands on the floor).
    _spring.ribbon = c.bandRibbon > 0 ? c.bandRibbon * H : 0;
    writeSpring(this.springGeom, _spring);
    this.steel.color.copy(getColor(c.steelColor));
    this.steel.emissive.copy(getColor(c.steelEmissive));
    this.steel.emissiveIntensity = c.steelGlow * g.glow * (0.4 + balance + (travelling ? 1 : 0));
    this.steel.metalness = c.steelMetalness;
    this.steel.roughness = c.steelRoughness;
    this.steel.envMapIntensity = c.steelEnv;
    const bs = this.bandSteel;
    bs.color.copy(this.steel.color);
    bs.emissive.copy(this.steel.emissive);
    bs.emissiveIntensity = this.steel.emissiveIntensity;
    bs.metalness = c.steelMetalness;
    bs.roughness = c.steelRoughness;
    bs.envMapIntensity = c.steelEnv;
    const tu = bs.userData.uniforms;
    tu.uTemperColor.value.copy(getColor(c.temperColor));
    tu.uTemperStrength.value = c.temperStrength;
    tu.uTemperHeight.value = c.temperHeight;
    tu.uTemperInner.value = c.temperInner;
    tu.uTemperSheen.value = c.temperSheen * g.shaderIntensity;
    tu.uSheenColor.value.copy(getColor(c.sheenColor));
    this.iron.color.copy(getColor(c.ironColor));
    this.iron.roughness = c.ironRoughness;

    // --- 2 · the stress light ---
    const ss = this._stressState;
    ss.debt = travelling ? 1 : balance;
    // Pulses run out while borrowing, back in while repaying.
    ss.flow = this._calm ? 0 : (this._repaying ? -1 : 1) * tau * c.stressSpeed * 0.25;
    ss.fade = fade;
    ss.flash = Math.exp(-this._clickAge * 10) + Math.exp(-this._hitAge * 8) * 0.6;
    this.stressMat.userData.sync(ss);

    // --- 3 · the iron: arbor, ratchet (turns with the inner coil), pawl, key ---
    const arborH = R * c.arborHeight;
    this.arbor.scale.set(R * 0.6 * c.arborWidth, arborH, R * 0.6 * c.arborWidth);
    const teeth = Math.round(c.ratchetTeeth);
    if (teeth !== this._ratchetTeeth) {
      this._ratchetTeeth = teeth;
      this.ratchetGeom.dispose();
      this.ratchetGeom = createRatchetGeometry(teeth);
      this.ratchet.geometry = this.ratchetGeom;
    }
    const rr = R * c.ratchetSize;
    this.ratchet.position.y = H + 0.04;
    this.ratchet.scale.set(rr, 1, rr);
    this.ratchet.rotation.y = -psi;
    // The pawl sits on the caster's right, fixed to the frame, nose on the teeth.
    const pawlKick = c.pawlKick * Math.exp(-this._clickAge * 12) * (this._repaying ? 1 : 0);
    const sideAngle = Math.atan2(this.side.z, this.side.x);
    this.pawlPivot.position.set(Math.cos(sideAngle) * rr * 1.35, H + 0.08, Math.sin(sideAngle) * rr * 1.35);
    this.pawlPivot.rotation.set(0, -(sideAngle + Math.PI * 0.62), 0);
    this.pawl.rotation.set(pawlKick, 0, 0);
    this.pawl.scale.setScalar(rr * 0.9);
    this.keyPivot.position.y = arborH + Math.exp(-this._clickAge * 9) * c.keyLift * (this._repaying ? 1 : 0);
    this.keyPivot.rotation.y = -psi;
    this.key.scale.setScalar(R * c.keySize);

    // --- 4 · the ledger ---
    this.ledger.visible = !travelling;
    this.ledger.scale.set(R * 2, R * 2, 1);
    const sweepNow = TAU * Math.min(1, turns * open);
    if (!travelling) this._sweepMax = Math.max(this._sweepMax, sweepNow);
    const ls = this._ledgerState;
    ls.radius = R;
    ls.r0 = _spring.r0;
    ls.rOut = _spring.rOut;
    ls.phi = phi;
    ls.psi = psi;
    ls.theta0 = this._theta0;
    ls.sweep = sweepNow;
    ls.sweepMax = this._sweepMax;
    ls.debt = balance;
    ls.clock = ambient;
    ls.fade = fade * clamp(t / 0.06 + (travelling ? 0 : 0.2));
    ls.dissolve = clamp(fadeT / Math.max(0.05, c.dissolveTime));
    this.ledgerMat.userData.sync(ls);

    // --- 5 · the smear: long and hard while borrowing, a twitch per click while repaying ---
    const borrowing = !travelling && !this._repaying && balance > 0;
    const sm = this._smearState;
    sm.tip = tipAngle;
    sm.dir = this._repaying ? -1 : 1;
    // Longer the faster the tip really turns (2π·turns / B rad/s; 9 rad/s at the defaults).
    sm.len = borrowing ? c.smearLength * Math.max(0.3, Math.min(1.5, (TAU * turns) / (T.B * 9))) : c.smearLength * 0.18;
    sm.power = travelling ? 0 : borrowing ? smoothstep(0, 0.05, t) : 0.5 * Math.exp(-this._clickAge * 7) * fade;
    sm.clock = ambient;
    this.smear.visible = sm.power > 0.003;
    this.smear.scale.set(_spring.rOut, H * c.smearHeight, _spring.rOut);
    this.smear.position.y = this.body.position.y;
    this.smearMat.userData.sync(sm);

    // --- 6 · particles: sparks off the tip, motes at the clock's rate ---
    if (dt > 0 && borrowing) {
      const n = this._sparkEmitter.tick(dt, c.sparkRate);
      if (n) {
        const rTip = _spring.rOut;
        _pos.set(this.position.x + Math.cos(tipAngle) * rTip, H * (1 - _spring.taper) * 0.85, this.position.z + Math.sin(tipAngle) * rTip);
        _dir.set(-Math.sin(tipAngle), 0.35, Math.cos(tipAngle)).normalize();
        this._emitTo(this.sparks, n, 0.15, c.sparkSpeed, 0.35, c.sparkSize, c.sparkLife);
      }
    }
    if (dt > 0 && !travelling && !fading) {
      const n = this._moteEmitter.tick(dt, c.moteRate * rate);
      if (n) {
        _pos.set(this.position.x, 0.35, this.position.z);
        _dir.copy(_up);
        this._emitTo(this.motes, n, R * 0.75, c.moteRise * rate, 0.25, c.moteSize, c.moteLife);
      }
    }
    this._syncParticles();

    // --- 8 · the lens: shear signed by the clock's rate ---
    const lens = this._lensState;
    lens.shear = travelling || this._calm ? 0 : (rate - 1) * 0.6 * fade;
    lens.shock = travelling ? 0 : Math.max(0, 1 - t / 0.5) * fade;
    lens.wave = Easing.outCubic(clamp(t / 0.5));
    lens.clock = ambient;
    this.lens.visible = !this._calm && !travelling &&
      (Math.abs(lens.shear) * c.lensStrength + lens.shock * c.lensShock) * g.distortion > 0.002;
    if (this.lens.visible) {
      this.lens.scale.set(R * 2.3, R * 2.3, 1);
      this.lensMat.userData.sync(lens);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._scope = null;
    this.root.visible = false;
    this.lens.visible = false;
    this.smear.visible = false;
    this._resetCast();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    for (const r of this.resources) r.dispose();
    this.ratchetGeom.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

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
  const folder = gui.addFolder('⟲  Temporal Mortgage');

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 80, 0.5, 'spring flies at (m/s)');
  R(cast, c, 'zoneRadius', 1, 8, 0.1, 'lash reach (m)');
  R(cast, c, 'lifetime', 0.5, 8, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'cooldown', 0, 15, 0.05, 'cooldown');
  castAnim(cast, c);

  const loan = sub(folder, 'The loan');
  R(loan, c, 'borrowTime', 0.1, 2, 0.01, 'borrow for (s)');
  R(loan, c, 'borrowRate', 1.05, 5, 0.05, 'borrowed speed (×)');
  R(loan, c, 'repayRate', 0.05, 0.9, 0.01, 'repayment speed (×)');
  R(loan, c, 'sweepTurns', 1, 3, 0.05, 'lash turns');
  R(loan, c, 'hitImpulse', 0, 24, 0.5, 'impact impulse');
  R(loan, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(loan, c, 'hitSpin', 0, 8, 0.05, 'tumble');
  R(loan, c, 'tangentPush', 0, 1, 0.01, 'knock along the lash');
  R(loan, c, 'debtStatus', 0, 1, 1, 'debt status on survivors');

  const throwF = sub(folder, 'Anticipation & throw');
  R(throwF, c, 'chargeTime', 0, 1, 0.01, 'winds in the hand (s)');
  R(throwF, c, 'handHeight', 0.3, 2.5, 0.01, 'hand height (m)');
  R(throwF, c, 'handForward', 0, 1.5, 0.01, 'hand forward (m)');
  R(throwF, c, 'travelScale', 0.03, 0.6, 0.01, 'size in flight');
  R(throwF, c, 'travelArc', 0, 5, 0.05, 'arc height (m)');
  R(throwF, c, 'travelSpin', 0, 40, 0.5, 'spin in flight (rad/s)');
  R(throwF, c, 'trailCount', 0, 12, 1, 'trail sparks');
  R(throwF, c, 'trailGlow', 0, 12, 1, 'trail motes');
  R(throwF, c, 'trailGlowSize', 0.02, 0.6, 0.005, 'trail mote size (m)');
  R(throwF, c, 'chargeLight', 0, 20, 0.1, 'hand light while winding');
  R(throwF, c, 'landTime', 0.02, 0.6, 0.01, 'grows on landing (s)');

  const spring = sub(folder, '1 · The mainspring');
  R(spring, c, 'bandHeight', 0.1, 1, 0.01, 'band height (× radius)');
  R(spring, c, 'bandThickness', 0.02, 0.4, 0.005, 'band thickness (m)');
  R(spring, c, 'bandTaper', 0, 0.9, 0.01, 'outer coils stand lower by');
  R(spring, c, 'bandRibbon', 0, 1, 0.01, 'band width (× height; < 1 lifts the inner coils into a helix)');
  R(spring, c, 'arborShare', 0.04, 0.3, 0.005, 'inner end (× radius)');
  R(spring, c, 'tightOuter', 0.15, 0.6, 0.01, 'wound outer radius (× radius)');
  R(spring, c, 'openOuter', 0.5, 1.2, 0.01, 'let-go outer radius (× radius)');
  R(spring, c, 'tightTurns', 1.5, 8, 0.05, 'coils when wound');
  R(spring, c, 'openTurns', 0.6, 4, 0.05, 'coils when let go');
  R(spring, c, 'hookCurl', 0, 2, 0.01, 'end hook curl');
  R(spring, c, 'hookShare', 0.01, 0.2, 0.005, 'end hook length');
  R(spring, c, 'bandWave', 0, 0.3, 0.005, 'band ripple');
  color(spring, c, 'steelColor', 'blued steel');
  R(spring, c, 'steelMetalness', 0, 1, 0.01, 'metalness');
  R(spring, c, 'steelRoughness', 0, 1, 0.01, 'roughness');
  R(spring, c, 'steelEnv', 0, 2, 0.01, 'reflection strength');
  color(spring, c, 'steelEmissive', 'stress emissive');
  R(spring, c, 'steelGlow', 0, 3, 0.01, 'stress emissive strength');
  color(spring, c, 'temperColor', 'tempered deep (foot / inner coils)');
  R(spring, c, 'temperStrength', 0, 1, 0.01, 'temper darkening');
  R(spring, c, 'temperHeight', 0.05, 1, 0.01, 'temper height (share of band)');
  R(spring, c, 'temperInner', 0, 1, 0.01, 'inner coils darker');
  R(spring, c, 'temperSheen', 0, 2, 0.01, 'temper streak');
  color(spring, c, 'sheenColor', 'temper streak colour');

  const stress = sub(folder, '2 · Stress light');
  R(stress, c, 'stressGlow', 0, 6, 0.05, 'glow');
  R(stress, c, 'stressFresnel', 0.5, 6, 0.05, 'rim sharpness');
  R(stress, c, 'stressPulses', 0, 20, 0.5, 'pulses along the band');
  R(stress, c, 'stressSpeed', 0, 12, 0.1, 'pulse speed (× clock)');
  R(stress, c, 'edgeGlow', 0, 6, 0.05, 'hot top edge');
  R(stress, c, 'edgeWidth', 0.01, 0.6, 0.005, 'edge line width (share of height)');
  R(stress, c, 'edgeTop', 0, 1, 0.01, 'edge light on the flat top');
  R(stress, c, 'edgeInner', 0, 1, 0.01, 'edge line left on the inner coils');
  R(stress, c, 'tipGlow', 0, 6, 0.05, 'free end glow');
  R(stress, c, 'stressFill', 0, 1, 0.01, 'stress wash over the face');
  R(stress, c, 'stressRim', 0, 1, 0.01, 'fresnel rim');
  R(stress, c, 'stressSharp', 1, 160, 1, 'stress line sharpness');
  R(stress, c, 'stressInflate', 0, 0.05, 0.001, 'skin offset (m)');

  const iron = sub(folder, '3 · Arbor, ratchet & key');
  R(iron, c, 'arborHeight', 0.2, 1.2, 0.01, 'arbor height (× radius)');
  R(iron, c, 'arborWidth', 0.3, 3, 0.05, 'arbor thickness');
  R(iron, c, 'ratchetTeeth', 6, 64, 1, 'ratchet teeth');
  R(iron, c, 'ratchetSize', 0.05, 0.5, 0.005, 'ratchet radius (× radius)');
  R(iron, c, 'keySize', 0.05, 0.6, 0.005, 'key size (× radius)');
  R(iron, c, 'keyLift', 0, 0.4, 0.005, 'key bob per click (m)');
  R(iron, c, 'repayTicks', 1, 24, 1, 'instalments (clicks)');
  R(iron, c, 'tickSnap', 0, 1, 0.01, 'click snap share');
  R(iron, c, 'pawlKick', 0, 1.2, 0.01, 'pawl kick (rad)');
  color(iron, c, 'ironColor', 'iron');
  R(iron, c, 'ironRoughness', 0, 1, 0.01, 'iron roughness');

  const ledger = sub(folder, '4 · The ledger');
  R(ledger, c, 'floorGlow', 0, 5, 0.05, 'glow');
  R(ledger, c, 'floorOpacity', 0, 1, 0.01, 'opacity');
  R(ledger, c, 'groovePitch', 0.2, 4, 0.05, 'fine grooves');
  R(ledger, c, 'sweptGlow', 0, 4, 0.05, 'debt sector glow');
  R(ledger, c, 'debtInk', 0, 1, 0.01, 'repaid ink');
  R(ledger, c, 'floorGrain', 0, 3, 0.05, 'grain');
  R(ledger, c, 'ledgerRim', 0, 3, 0.05, 'outer rim line');
  R(ledger, c, 'ledgerCoil', 0, 3, 0.05, 'lit groove under the steel');
  R(ledger, c, 'floorFlow', 0, 4, 0.05, 'groove flow (× clock)');
  R(ledger, c, 'dissolveTime', 0.05, 1, 0.01, 'dissolves over (× exit)');

  const smear = sub(folder, '5 · The speed smear');
  R(smear, c, 'smearGlow', 0, 6, 0.05, 'glow');
  R(smear, c, 'smearOpacity', 0, 1, 0.01, 'opacity');
  R(smear, c, 'smearLength', 0.1, 5, 0.05, 'length (rad)');
  R(smear, c, 'smearHeight', 0.2, 3, 0.05, 'height (× band)');
  R(smear, c, 'smearStreaks', 2, 60, 1, 'streaks');

  const fx = sub(folder, '6 · Particles');
  R(fx, c, 'sparkRate', 0, 400, 1, 'tip sparks /s');
  R(fx, c, 'sparkSize', 0.01, 0.4, 0.005, 'spark size');
  R(fx, c, 'sparkLife', 0.05, 2, 0.01, 'spark life (s)');
  R(fx, c, 'sparkSpeed', 0, 12, 0.05, 'spark speed');
  R(fx, c, 'sparkGlow', 0, 6, 0.05, 'particle glow');
  gradient(fx, c, 'colorSpark', 'particle gradient');
  R(fx, c, 'hitCount', 0, 96, 1, 'sparks per body struck');
  R(fx, c, 'clickCount', 0, 48, 1, 'filings per click');
  R(fx, c, 'clickSize', 0.01, 0.3, 0.005, 'filing size');
  R(fx, c, 'clickLife', 0.05, 2, 0.01, 'filing life (s)');
  R(fx, c, 'moteRate', 0, 200, 1, 'time motes /s (× clock)');
  R(fx, c, 'moteSize', 0.01, 0.4, 0.005, 'mote size');
  R(fx, c, 'moteLife', 0.1, 4, 0.05, 'mote life (s)');
  R(fx, c, 'moteRise', 0, 3, 0.05, 'mote rise (m/s × clock)');
  R(fx, c, 'landCount', 0, 128, 1, 'landing dust');

  const beat = sub(folder, '7 · Impact & settlement');
  R(beat, c, 'landShake', 0, 1, 0.01, 'landing knock');
  R(beat, c, 'landFlash', 0, 1, 0.01, 'landing flash');
  R(beat, c, 'landLight', 0, 20, 0.1, 'landing light punch');
  R(beat, c, 'hitShake', 0, 0.5, 0.005, 'knock per body');
  R(beat, c, 'clickShake', 0, 0.2, 0.005, 'tick per click');
  R(beat, c, 'settleFlash', 0, 1, 0.01, 'paid-off flash');
  R(beat, c, 'settleLight', 0, 20, 0.1, 'paid-off light');
  R(beat, c, 'burstReach', 0, 2, 0.01, 'shell grows to (× radius)');
  R(beat, c, 'burstLife', 0.05, 2, 0.01, 'shell life (s)');
  R(beat, c, 'burstIntensity', 0, 3, 0.01, 'shell brightness');
  R(beat, c, 'burstOpacity', 0, 1, 0.01, 'shell opacity');
  R(beat, c, 'burstFresnel', 0, 6, 0.05, 'shell rim');
  R(beat, c, 'burstSquash', 0.05, 1.5, 0.01, 'shell squash');
  // The burst shell takes three stops (BurstSystem colorA–C), not a four-stop gradient.
  for (const k of ['A', 'B', 'C']) color(beat, c, `colorBurst${k}`, `shell ${k}`);
  R(beat, c, 'decalLife', 0.1, 8, 0.05, 'decals last (s)');
  R(beat, c, 'crackIntensity', 0, 3, 0.01, 'crack brightness');
  R(beat, c, 'shockwaveWidth', 0.01, 0.4, 0.005, 'shockwave width');
  R(beat, c, 'shockwaveIntensity', 0, 3, 0.01, 'shockwave brightness');
  R(beat, c, 'rippleIntensity', 0, 3, 0.01, 'paid-off ripple');
  R(beat, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(beat, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');

  const exit = sub(folder, '8 · Exit');
  R(exit, c, 'exitTime', 0.1, 2, 0.01, 'sinks over (s)');
  R(exit, c, 'sinkDepth', 0, 2, 0.01, 'sinks (× band)');

  const lens = sub(folder, '9 · The lens');
  R(lens, c, 'lensStrength', 0, 3, 0.01, 'time shear');
  R(lens, c, 'lensShock', 0, 3, 0.01, 'landing pressure ring');

  const light = sub(folder, 'Light & palette');
  color(light, c, 'lightColor', 'light');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0, 4, 0.05, 'height (m)');
  color(light, c, 'coreColor', 'core');
  color(light, c, 'tintColor', 'tint');
  color(light, c, 'bodyColor', 'body');
  color(light, c, 'deepColor', 'deep');

  return folder;
}
