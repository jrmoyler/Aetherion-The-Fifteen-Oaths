import { Group, InstancedMesh, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { routeExpansionTransparency } from '../ExpansionFX.js';
import { Ability as BaseAbility, AbilityPhase } from '../../Ability.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import {
  coilPoint,
  createBrandGeometry,
  createCoilGeometry,
  createPlumeGeometry,
  createQuad,
  createSlugGeometry,
  writeCoil,
} from './geometry.js';
import {
  createBrandMaterial,
  createCoilMaterial,
  createHazeMaterial,
  createHobMaterial,
  createPlumeMaterial,
  createSlugMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
export const UID = 'matrix-expansion/combustion-debt';

const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** Enemies that can carry heat debt at once (UCSM event budget is 24/tick). */
export const MAX_DEBTORS = 8;
/** Points the embers are split between each frame (one origin reads as a hose). */
const EMBER_BATCHES = 4;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _up = new Vector3(0, 1, 0);
const _q = new Quaternion();
const _p = { x: 0, y: 0, z: 0 };
const _o3 = new Object3D();
const _scaled = { hitImpulse: 0, hitLift: 0, hitSpin: 0 };

/**
 * COMBUSTION DEBT — Fire, zone cast.
 *
 * Heat is not dealt, it is *lent*, and the interest is paid all at once.
 *
 * **Anticipation.** A slug of molten iron gathers at the caster's hand for
 * `chargeTime`, white-hot inside a crust of slag, embers drawn up round it.
 * **Travel.** It is lobbed in a high arc onto the target, trailing sparks.
 * **Landing.** It strikes the floor and an iron heating coil *screws up out
 * of the ground* round it — a conical dome-spring of forged, beaded iron whose
 * outer turn lies on the rim of the zone and whose tip stands over the centre.
 * The floor scorches outward from the landing.
 * **The debt accrues.** Every `tickInterval` the coil takes on one more
 * segment of heat: the glow crawls inward from the buried outer end toward
 * the tip, white-hot at its leading edge, the iron behind it red to orange
 * with hot spots crawling along it; the spring *winds down and twists* as it
 * loads; the floor glows under the hot length and its cracks open; and every
 * enemy standing inside is branded with one more stack of heat debt — a tally
 * ring under its feet with a notch lit per stack, its body charred further.
 * **Impact — the call.** When the coil is hot to the tip (or the zone's total
 * debt reaches `debtCap`: foreclosure) the debt is called in on one frame:
 * the spring lets go and overshoots, a combustion plume erupts through the
 * dome, a fire ring runs out over the floor, a fire shell, scorch and crack
 * decals, slag and sparks fly, the screen flashes and the camera knocks — and
 * every debtor carrying `igniteThreshold` stacks is hit for what it owes.
 * **Linger.** The spring rings and settles, the tip whips and recovers, the
 * plume is eaten from the foot upward, smoke climbs, and the iron cools from
 * white through orange to dull red while the floor's embers die.
 * **Exit.** The coil sinks back into the floor it came from, still faintly
 * red, and the scorch dissolves through noise.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the coil** (`createCoilMaterial` — lit iron, `LAYER.WORLD`, casts
 *      shadows) — the hero; buffers rewritten in place each frame
 *      (`writeCoil`) so the spring can wind, ring and sink.
 *   2. **the hob** (`createHobMaterial`) — scorched floor disc, heat pooled
 *      along the coil's spiral, cracks, the fire ring at the call.
 *   3. **the plume** (`createPlumeMaterial`) — the lathed combustion column.
 *   4. **the slug** (`createSlugMaterial`) — the molten bead in flight.
 *   5. **the brands** (`createBrandMaterial`) — instanced tally rings, one
 *      per debtor, one notch per stack.
 *   6. **particles** — embers (SOFT, curl) off the hot length, sparks
 *      (STREAK) on ticks / flight / call, smoke (SMOKE) and slag (CHIP, lit).
 *   7. **the impact** — FIRE shell, SCORCH + CRACK + SHOCKWAVE decals,
 *      flash, camera knock, light punch; light guttering with the heat.
 *   8. **the haze** (`createHazeMaterial` on `LAYER.DISTORTION`) — shimmer
 *      that grows with the debt, pressure ring at the call.
 *
 * ## Gameplay (`handlesOwnHits`)
 *
 * Deterministic and bounded: `ticks` heat ticks at fixed times after the
 * landing; each adds one stack to every enemy within `zoneRadius` (at most
 * `MAX_DEBTORS`), as a UCSM `burning` status through the combat binding or
 * a char on the sandbox dummy. The call hits each debtor with ≥
 * `igniteThreshold` stacks exactly once — damage `stacks × damagePerStack`
 * (≤ `maxDamage`), knockback scaled by stacks — and leaves a burning region
 * (UCSM). Debtors below the threshold are forgiven. Debt follows the debtor:
 * leaving the zone after being branded does not clear it.
 *
 * ## The editor rule
 *
 * Records hold dice (a seed) and event timestamps (landing, ticks, the call)
 * plus the debt ledger itself; every dimension, colour, count and timing is
 * resolved from `settings.combustionDebt` every frame.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return MAX_DEBTORS + 5;
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every beat × global lifetime                               */
  /* ------------------------------------------------------------------ */

  get _L() {
    return Math.max(0.05, settings.global.lifetime);
  }

  /** Impact-phase time of tick `k` (1-based). */
  _tickAt(k) {
    const c = this.config;
    return this._L * (c.riseTime + (k - 1 + c.tickPhase) * c.tickInterval);
  }

  /** Impact-phase time the debt is (or will be) called in. */
  get _payAt() {
    const c = this.config;
    if (this._paid) return this._paidAt;
    if (this._foreclosedAt >= 0) return this._foreclosedAt + c.foreclosureDelay * this._L;
    return this._L * (c.riseTime + Math.max(1, Math.round(c.ticks)) * c.tickInterval);
  }

  get impactDuration() {
    return Math.max(0.2, this._payAt + this.config.payLinger * this._L);
  }

  get fadeDuration() {
    return Math.max(0.05, this.config.exitTime * this._L);
  }

  /** Coals gutter; the light follows the heat. */
  lightShimmer() {
    const heat = this._heatLevel ?? 0.5;
    if (this._calm) return 0.5 + 0.7 * heat;
    const gutter = 0.84 + 0.1 * Math.sin(this.age * 13.7) * Math.sin(this.age * 5.3) + 0.06 * Math.sin(this.age * 31.1);
    return gutter * (0.4 + 0.8 * heat);
  }

  /** The front holds at the hand while the slug charges. */
  advance(dt) {
    if (this.age < this.config.chargeTime * this._L) {
      this.position.copy(this.origin);
      return false;
    }
    return super.advance(dt);
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
    const quad = own(createQuad());

    // 1 · the coil — solid iron on the world layer, shadows on.
    this.coilGeometry = own(createCoilGeometry());
    this.coilMat = own(createCoilMaterial());
    this.coil = new Mesh(this.coilGeometry, this.coilMat);
    this.coil.castShadow = true;
    this.coil.receiveShadow = true;
    this.coil.frustumCulled = false; // buffers move every frame
    this.coil.layers.set(LAYER.WORLD);
    this.root.add(this.coil);

    // 2 · the hob
    this.hobMat = own(createHobMaterial());
    this.hob = new Mesh(quad, this.hobMat);
    this.hob.rotation.x = -Math.PI / 2;
    this.hob.position.y = 0.025;
    this.hob.renderOrder = 1;
    this.root.add(this.hob);

    // 3 · the plume
    this.plumeMat = own(createPlumeMaterial());
    this.plume = new Mesh(own(createPlumeGeometry()), this.plumeMat);
    this.plume.renderOrder = 6;
    this.plume.visible = false;
    this.root.add(this.plume);

    // 4 · the slug (world-placed, not under the root, which sits at the target)
    this.slugMat = own(createSlugMaterial());
    this.slug = new Mesh(own(createSlugGeometry()), this.slugMat);
    this.slug.renderOrder = 7;
    this.group.add(this.slug);

    // 5 · the brands (world-placed under each debtor)
    this.brandGeometry = own(createBrandGeometry(MAX_DEBTORS));
    this.brandMat = own(createBrandMaterial());
    this.brands = new InstancedMesh(this.brandGeometry, this.brandMat, MAX_DEBTORS);
    this.brands.frustumCulled = false;
    this.brands.renderOrder = 3;
    this.group.add(this.brands);

    // 8 · the haze
    this.hazeMat = own(createHazeMaterial());
    this.haze = new Mesh(quad, this.hazeMat);
    this.haze.rotation.x = -Math.PI / 2;
    this.haze.visible = false;
    this.root.add(this.haze);

    routeExpansionTransparency(this.group);
    this.coil.layers.set(LAYER.WORLD);
    this.haze.layers.set(LAYER.DISTORTION);

    // The debt ledger: fixed records, reset on spawn.
    this._debtors = [];
    for (let i = 0; i < MAX_DEBTORS; i++) {
      this._debtors.push({ used: false, dummy: null, id: null, stacks: 0, x: 0, z: 0 });
    }
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0.05 };
    this._k = {
      rOuter: 1, rInner: 0.1, height: 1, turns: 3, profile: 1.8, thick: 0.1, spin: 0, yOffset: 0,
      whipX: 0, whipZ: 0, beadFreq: 70, beadDepth: 0.16,
    };
    this._embers = new RateEmitter();
    this._trail = new RateEmitter();
    this._clock = 0;
    this._calm = false;
    this._heatLevel = 0;
    this._coilState = { front: 0, temp: 0, pulse: 0, clock: 0 };
    this._hobState = { reveal: 0, heat: 0, front: 0, temp: 0, release: -1, dissolve: 0, fade: 1, discR: 1, outer: 1, inner: 0.1, spin: 0, clock: 0 };
    this._plumeState = { clock: 0, burn: 0, power: 0 };
    this._slugState = { clock: 0, fade: 1 };
    this._brandState = { clock: 0, fade: 1 };
    this._hazeState = { shimmer: 0, shock: 0, wave: 0, clock: 0 };
    this._resetCast();
    this._disposed = false;
  }

  createParticles() {
    const p = this.ctx.particles;
    if (!p?.get) {
      this.embers = this.sparks = this.smoke = this.slag = null;
      return;
    }
    this.embers = p.get(`${ID}.embers`, { capacity: 900, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.3 });
    this.sparks = p.get(`${ID}.sparks`, { capacity: 700, shape: ParticleShape.STREAK, additive: true, stretch: true });
    this.smoke = p.get(`${ID}.smoke`, { capacity: 200, shape: ParticleShape.SMOKE, additive: false, curl: true, softFade: 0.6 });
    this.slag = p.get(`${ID}.slag`, { capacity: 240, shape: ParticleShape.CHIP, additive: false, lit: true });
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  _resetCast() {
    this._landed = false;
    this._ticksDone = 0;
    this._lastTickAt = -1;
    this._foreclosedAt = -1;
    this._paid = false;
    this._paidAt = -1;
    this._seed = 0;
    for (const d of this._debtors) {
      d.used = false; d.dummy = null; d.id = null; d.stacks = 0; d.x = 0; d.z = 0;
    }
  }

  onSpawn() {
    this._resetCast();
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this._seed = Math.random(); // the only die this cast rolls
    this._clock = 0;
    this._calm = prefersReducedMotion();
    this._embers.reset();
    this._trail.reset();
    this.root.visible = false;
    this.slug.visible = true;
    this.brands.visible = false;
    this._sync(0);
  }

  onTravel(dt) {
    const c = this.config;
    // Sparks trail the slug once it is thrown; embers gather while it charges.
    const charging = this.age < c.chargeTime * this._L;
    const n = this._trail.tick(dt, charging ? 40 : 160);
    if (n > 0) {
      this._slugPoint(_pos);
      if (charging) this._emitEmbers(_pos, n, 0.45, 0.6);
      else this._emitSparks(_pos, n, null, 0.2, 0.35);
    }
    this._sync(dt);
  }

  onImpact() {
    const c = this.config;
    const g = settings.global;
    this.position.y = 0;
    this._landed = true;
    this.root.visible = true;
    this.slug.visible = false;
    _pos.copy(this.position).setY(0.05);
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _pos, {
      radius: c.zoneRadius * 0.35, life: c.decalLife, intensity: 0.8,
      colorA: getColor(c.colorBody), colorB: getColor(c.colorDeep),
    });
    _pos.setY(0.2);
    this._emitSparks(_pos, Math.round(c.tickSparks * 1.5), _up, 0.9, 0.3);
    if (c.landShake > 0) this.ctx.shake?.add?.(c.landShake * g.cameraShake, c.shakeDecay, c.shakeFrequency);
    this.lightBoost = c.tickLight;
    this._sync(0);
  }

  onFade(dt) {
    const c = this.config;
    if (!this._paid) {
      const ticks = Math.max(1, Math.round(c.ticks));
      while (this._foreclosedAt < 0 && this._ticksDone < ticks && this.impactTime >= this._tickAt(this._ticksDone + 1)) {
        this._tick();
      }
      if (this.impactTime >= this._payAt || this.phase === AbilityPhase.FADE) this._pay();
    }
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The debt — gameplay                                                 */
  /* ------------------------------------------------------------------ */

  /** The ledger record for a dummy or an actor id, opening one if there is room. */
  _debtor(dummy, id) {
    let free = null;
    for (const d of this._debtors) {
      if (d.used && ((dummy && d.dummy === dummy) || (id !== null && d.id === id))) return d;
      if (!d.used && !free) free = d;
    }
    if (!free) return null; // bounded: the ledger is full
    free.used = true;
    free.dummy = dummy;
    free.id = id;
    free.stacks = 0;
    return free;
  }

  get totalDebt() {
    let total = 0;
    for (const d of this._debtors) if (d.used) total += d.stacks;
    return total;
  }

  _syncLook() {
    const c = this.config;
    const look = this._look;
    look.color = c.charColor;
    look.rimColor = c.colorBody;
    look.rimEmissive = c.charRimGlow;
    look.edgeColor = c.colorTint;
    look.edgeEmissive = c.charEdgeGlow;
    look.edgeWidth = settings.dummies?.look?.edgeWidth ?? 0.05;
    return look;
  }

  /** One heat tick: every enemy in the zone takes one more stack of debt. */
  _tick() {
    const c = this.config;
    const g = settings.global;
    const R = c.zoneRadius;
    const x = this.position.x;
    const z = this.position.z;
    this._ticksDone++;
    this._lastTickAt = this.impactTime;
    if (this._scope) {
      const found = this._scope.queryActors({ position: [x, 0, z], radius: R, relation: 'enemy' });
      if (!found.ok) this.failure = found.reason;
      else {
        for (const actor of found.actors) {
          if (actor.alive === false) continue;
          const d = this._debtor(null, actor.id);
          if (!d) break;
          d.stacks++;
          d.x = actor.position[0];
          d.z = actor.position[2];
          const sent = this._scope.emit({
            type: 'status', element: 'fire', targetIds: [actor.id], position: actor.position,
            sourcePosition: [x, 0, z], intensity: Math.min(3, c.burnIntensity * d.stacks),
            tags: ['combustion-debt', 'heat-debt'],
          });
          // The standalone fallback has no statuses — the ledger still counts.
          if (!sent.ok && !this._scope.standalone) this.failure = sent.reason;
        }
      }
    } else if (this.ctx.dummies?.findTargets) {
      const found = this.ctx.dummies.findTargets(x, z, R, this._found);
      const look = this._syncLook();
      for (const dummy of found) {
        const dx = dummy.position.x - x;
        const dz = dummy.position.z - z;
        if (dx * dx + dz * dz > R * R) continue;
        const d = this._debtor(dummy, null);
        if (!d) break;
        d.stacks++;
        d.x = dummy.position.x;
        d.z = dummy.position.z;
        dummy.corrode?.(Math.min(1, d.stacks * c.charPerStack), look);
      }
    }
    // Foreclosure: enough debt in the zone calls it in early.
    if (this.totalDebt >= c.debtCap && this._ticksDone < Math.max(1, Math.round(c.ticks))) {
      this._foreclosedAt = this.impactTime;
    }
    // Presentation of the tick: sparks off the leading edge, a knock, a punch.
    this._shape();
    coilPoint(this._k, Math.min(1, this._ticksDone / Math.max(1, Math.round(c.ticks))), _p);
    _pos.set(this.position.x + _p.x, _p.y, this.position.z + _p.z);
    this._emitSparks(_pos, c.tickSparks, _up, 1, 0.15);
    this._emitEmbers(_pos, Math.round(c.tickSparks * 0.6), 0.25, 1);
    if (c.tickShake > 0) this.ctx.shake?.add?.(c.tickShake * g.cameraShake, c.shakeDecay, c.shakeFrequency);
    this.lightBoost = Math.max(this.lightBoost, c.tickLight);
  }

  /** The call: debtors past the threshold pay, once. */
  _pay() {
    if (this._paid) return;
    this._paid = true;
    this._paidAt = this.impactTime;
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = c.zoneRadius;
    const x = this.position.x;
    const z = this.position.z;
    const ticks = Math.max(1, Math.round(c.ticks));
    for (const d of this._debtors) {
      if (!d.used || d.stacks < c.igniteThreshold) continue;
      const owed = Math.min(1, d.stacks / ticks);
      const scale = 1 - c.stackForce + c.stackForce * owed;
      if (this._scope) {
        _scaled.hitImpulse = c.hitImpulse * scale;
        _scaled.hitLift = c.hitLift * scale;
        _scaled.hitSpin = c.hitSpin;
        const sent = this._scope.emit({
          type: 'hit', element: 'fire', targetIds: [d.id], position: [d.x, 0, d.z], sourcePosition: [x, 0, z],
          damage: Math.min(c.maxDamage, d.stacks * c.damagePerStack),
          hitForce: impactForce(_scaled, power), tags: ['combustion-debt', 'debt-called'],
        });
        if (!sent.ok) this.failure = sent.reason;
      } else if (d.dummy && d.dummy.alive !== false) {
        _dir.set(d.dummy.position.x - x, 0, d.dummy.position.z - z);
        if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction);
        else _dir.normalize();
        this._force.impulse = c.hitImpulse * scale * power;
        this._force.lift = c.hitLift * scale * power;
        this._force.spin = c.hitSpin;
        d.dummy.corrode?.(Math.min(1, d.stacks * c.charPerStack + 0.25), this._syncLook());
        d.dummy.kill(_dir.x, _dir.z, this._force);
      }
    }
    if (this._scope) {
      const sent = this._scope.emit({
        type: 'terrain-impact', element: 'fire', position: [x, 0, z],
        shape: { kind: 'disc', x, z, r: R },
        durationTicks: Math.max(1, Math.round(c.groundBurn * (this._scope.tickRate || 30))),
        intensity: 1, tags: ['combustion-debt'],
      });
      if (!sent.ok && !this._scope.standalone) this.failure = sent.reason;
    }
    this._callFx();
  }

  /** Shell, decals, slag, sparks, smoke, flash, knock and light at the call. */
  _callFx() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = c.zoneRadius;
    this.lightBoost = c.payLight * power;
    _pos.copy(this.position).setY(0.05);
    this.ctx.bursts?.spawn?.(BurstMode.FIRE, _pos, {
      radius: R * 0.15, endRadius: R * c.burstScale * power, life: c.burstLife * this._L,
      intensity: c.burstIntensity, opacity: c.burstOpacity * g.opacity, fresnel: g.fresnel,
      colorA: getColor(c.colorCore), colorB: getColor(c.colorBody), colorC: getColor(c.colorDeep), squash: 0.7,
    });
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _pos, {
      radius: R * 1.05, life: c.decalLife, intensity: 1,
      colorA: getColor(c.colorBody), colorB: getColor(c.charColor),
    });
    this.ctx.decals?.spawn?.(DecalType.CRACK, _pos, {
      radius: R * 0.9, life: c.decalLife, intensity: 1,
      colorA: getColor(c.colorTint), colorB: getColor(c.colorDeep),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: R * 1.4 * power, life: c.decalLife * 0.2, width: c.shockwaveWidth, intensity: 1,
      colorA: getColor(c.colorCore), colorB: getColor(c.colorBody),
    });
    // Out of the tip: sparks and slag radially, smoke climbing.
    this._shape();
    coilPoint(this._k, 1, _p);
    _pos.set(this.position.x, Math.max(0.4, _p.y), this.position.z);
    this._emitSparks(_pos, c.paySparks, _up, 1, 0.6);
    if (this.slag) {
      this._resetEmit(_pos);
      _emit.radius = R * 0.3;
      _emit.direction = _up;
      _emit.spread = 0.85;
      _emit.speed = c.slagSpeed;
      _emit.speedVariance = 0.5;
      _emit.size = c.slagSize;
      _emit.life = c.slagLife;
      _emit.spin = 6;
      this.slag.emit(Math.round(c.slagCount * g.particleCount), _emit);
    }
    if (this.smoke) {
      this._resetEmit(_pos);
      _emit.radius = R * 0.45;
      _emit.direction = _up;
      _emit.spread = 0.35;
      _emit.speed = c.smokeSpeed;
      _emit.size = c.smokeSize;
      _emit.life = c.smokeLife;
      _emit.spin = 0.6;
      this.smoke.emit(Math.round(c.smokeCount * g.particleCount), _emit);
    }
    if (c.payShake > 0) this.ctx.shake?.add?.(c.payShake * power * g.cameraShake, c.shakeDecay, c.shakeFrequency);
    if (c.payFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorTint), c.payFlash * power);
  }

  /* ------------------------------------------------------------------ */
  /* Particles                                                           */
  /* ------------------------------------------------------------------ */

  _resetEmit(position) {
    _emit.position = position;
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 1;
    _emit.speedVariance = 0.35;
    _emit.spread = 0.5;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.4;
    _emit.life = 1;
    _emit.lifeVariance = 0.3;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
  }

  _emitSparks(position, count, direction, spread, radius) {
    if (!this.sparks || count <= 0) return;
    const c = this.config;
    const g = settings.global;
    this._resetEmit(position);
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.spread = spread;
    _emit.speed = c.sparkSpeed * (direction ? 1 : 0.25);
    _emit.speedVariance = 0.5;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    this.sparks.emit(Math.round(count * g.particleCount), _emit);
  }

  _emitEmbers(position, count, radius, speedScale) {
    if (!this.embers || count <= 0) return;
    const c = this.config;
    const g = settings.global;
    this._resetEmit(position);
    _emit.radius = radius;
    _emit.direction = _up;
    _emit.spread = 0.45;
    _emit.speed = c.emberSpeed * speedScale;
    _emit.size = c.emberSize;
    _emit.life = c.emberLife;
    this.embers.emit(Math.round(count * g.particleCount), _emit);
  }

  /** Shared particle systems take their look from settings every frame. */
  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    const set = (sys, glow, gravity, drag, endSize, a, b, cc, d) => {
      if (!sys?.uniforms) return;
      sys.setGradient?.(getColor(a), getColor(b), getColor(cc), getColor(d));
      const u = sys.uniforms;
      if (u.uGlow) u.uGlow.value = glow * g.glow;
      if (u.uOpacity) u.uOpacity.value = g.opacity;
      if (u.uGravity) u.uGravity.value.set(0, gravity, 0);
      if (u.uDrag) u.uDrag.value = drag;
      if (u.uEndSize) u.uEndSize.value = endSize;
      if (u.uTurbulence) u.uTurbulence.value = 0.6 * g.turbulence;
      if (u.uSizeScale) u.uSizeScale.value = g.particleSize;
      if (u.uSpeedScale) u.uSpeedScale.value = g.particleSpeed;
      if (u.uLifeScale) u.uLifeScale.value = g.particleLifetime;
    };
    set(this.embers, c.emberGlow, 0.8, 0.6, 0.3, c.colorCore, c.colorTint, c.colorBody, c.colorDeep);
    set(this.sparks, c.sparkGlow, -6, 0.4, 0.2, c.colorCore, c.colorCore, c.colorTint, c.colorBody);
    set(this.smoke, 1, 0.6, 1.4, 2.6, c.smokeColorA, c.smokeColorB, c.smokeColorB, c.smokeColorB);
    set(this.slag, 1.4, -9.8, 0.2, 0.7, c.colorTint, c.colorBody, c.colorDeep, c.charColor);
    if (this.smoke?.uniforms?.uOpacity) this.smoke.uniforms.uOpacity.value = c.smokeOpacity * g.opacity;
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  /** Where the slug is: gathering at the hand, then on its lob. */
  _slugPoint(out) {
    const c = this.config;
    const u = this.u;
    out.copy(this.position);
    // Gathered off the casting hand, beside the body so it reads over the shoulder.
    if (u <= 0) out.addScaledVector(this.direction, 0.35).addScaledVector(this.side, -0.55);
    out.y = c.handHeight * (1 - u) + c.arcHeight * 4 * u * (1 - u) + 0.2 * u;
    return out;
  }

  /** Seconds since the call (−1 before it), through the impact and the fade. */
  get _since() {
    if (!this._paid) return -1;
    return this.impactTime - this._paidAt + (this.phase === AbilityPhase.FADE ? this.fadeTime : 0);
  }

  /** The heat front along the coil (0 = floor end, 1 = tip). */
  _front() {
    const ticks = Math.max(1, Math.round(this.config.ticks));
    if (this._paid) return 1;
    if (this._ticksDone <= 0) return 0;
    const ramp = smooth((this.impactTime - this._lastTickAt) / (0.14 * this._L));
    return Math.min(1, (this._ticksDone - 1 + ramp) / ticks);
  }

  /** Resolve the coil's shape from settings + the cast's clock. */
  _shape() {
    const c = this.config;
    const k = this._k;
    const R = c.zoneRadius;
    const L = this._L;
    const H = R * c.coilHeight;
    const front = this._front();
    const rise = this._landed ? Easing.outBack(clamp01(this.impactTime / Math.max(0.01, c.riseTime * L))) : 0;
    const since = this._since;
    k.rOuter = R * c.coilOuter;
    k.rInner = R * c.coilInner;
    k.turns = c.coilTurns;
    k.profile = c.coilProfile;
    k.thick = R * c.coilThickness;
    k.beadFreq = c.beadFreq;
    k.beadDepth = c.beadDepth;
    // Winds down and twists as the debt loads; springs back and rings after the call.
    const loaded = 1 - (1 - c.compress) * Easing.inOutQuad(front);
    let hs = loaded;
    let whip = 0;
    if (since >= 0) {
      const env = Math.exp(-c.springDamp * since);
      const ring = this._calm ? 0 : env;
      hs = 1 - (1 - c.compress) * ring * Math.cos(c.springFreq * since) + c.springOvershoot * ring * Math.sin(c.springFreq * since);
      if (this._calm) hs = 1 - (1 - c.compress) * env;
      whip = this._calm ? 0 : c.whip * env * Math.sin(c.springFreq * 0.7 * since);
    }
    k.height = H * Math.max(0.15, hs);
    const yaw = this._seed * TAU;
    k.whipX = Math.cos(yaw) * whip;
    k.whipZ = Math.sin(yaw) * whip;
    const wind = c.windTurn * (since >= 0 ? Math.exp(-c.springDamp * since) * (this._calm ? 1 : Math.cos(c.springFreq * 0.5 * since)) : Easing.inOutQuad(front));
    k.spin = yaw + this._clock * c.spinSpeed - wind + (1 - Math.min(1, rise)) * 2.4;
    // Screws up out of the floor; sinks back into it on the exit.
    const fadeT = this.phase === AbilityPhase.FADE ? clamp01(this.fadeTime / this.fadeDuration) : 0;
    k.yOffset = -(1 - rise) * (H * 1.1 + k.thick * 2) - Easing.inCubic(fadeT) * H * c.sinkDepth;
    return k;
  }

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const R = c.zoneRadius;
    const L = this._L;
    if (!this._calm) this._clock += dt * g.animationSpeed;
    const clock = this._clock;
    const since = this._since;
    const fading = this.phase === AbilityPhase.FADE;
    const fadeT = fading ? clamp01(this.fadeTime / this.fadeDuration) : 0;
    const front = this._front();

    // Temperature: loading heat, the white flash of the call, then cooling.
    let temp = this._landed ? 0.8 + 0.2 * front : 0;
    if (since >= 0) {
      const cool = clamp01(since / Math.max(0.05, c.coolTime * L));
      temp = (0.22 + 1.03 * Math.pow(1 - cool, 1.4)) * (1 + 0.3 * Math.exp(-since * 7));
    }
    temp *= 1 - fadeT * 0.85;
    const pulse = this._ticksDone > 0 && !this._paid ? Math.exp(-(this.impactTime - this._lastTickAt) * 9) : 0;
    this._heatLevel = this._landed ? Math.min(1.3, front * temp + pulse * 0.3) : 0.6;

    this.root.position.set(this.position.x, 0, this.position.z);

    // 4 · the slug
    if (this.phase === AbilityPhase.TRAVEL) {
      const charge = clamp01(this.age / Math.max(0.01, c.chargeTime * L));
      this._slugPoint(_pos);
      this.slug.position.copy(_pos);
      // Nose along the flight path.
      const u = this.u;
      _vel.copy(this.direction).multiplyScalar(Math.max(0.05, u > 0 ? 1 : 0.05));
      _vel.y = (c.arcHeight * 4 * (1 - 2 * u) - c.handHeight + 0.2) / Math.max(1, this.length);
      if (u <= 0) _vel.set(0, 1, 0);
      _q.setFromUnitVectors(_up, _vel.normalize());
      this.slug.quaternion.copy(_q);
      const wobble = this._calm ? 1 : 1 + 0.08 * Math.sin(this.age * 31);
      this.slug.scale.set(c.slugSize * wobble, c.slugSize * (u > 0 ? 1.5 : 1), c.slugSize * wobble).multiplyScalar(Easing.outBack(charge));
      this.slug.updateMatrix();
      this._slugState.clock = clock;
      this._slugState.fade = 1;
      this.slugMat.userData.sync(this._slugState);
    }

    if (this._landed) {
      // 1 · the coil
      writeCoil(this.coilGeometry, this._shape());
      const cs = this._coilState;
      cs.front = front;
      cs.temp = temp;
      cs.pulse = pulse;
      cs.clock = clock;
      this.coilMat.userData.sync(cs);

      // 2 · the hob
      this.hob.scale.set(R * c.hobScale * 2, R * c.hobScale * 2, 1);
      const hs = this._hobState;
      hs.reveal = smooth(this.impactTime / Math.max(0.02, c.hobRevealTime * L)) * (0.3 + 0.7 * smooth(0.3 + front));
      hs.heat = this._paid ? Math.max(0, 1 - clamp01(since / Math.max(0.05, c.coolTime * L * 1.6))) : front;
      hs.front = front;
      hs.temp = temp;
      const rel = since >= 0 ? since / Math.max(0.05, c.hobReleaseTime * L) : -1;
      hs.release = rel >= 0 && rel < 1 ? rel : -1;
      hs.dissolve = fadeT;
      hs.fade = 1;
      hs.discR = R * c.hobScale;
      hs.outer = this._k.rOuter;
      hs.inner = this._k.rInner;
      hs.spin = this._k.spin;
      hs.clock = clock;
      this.hobMat.userData.sync(hs);

      // 3 · the plume
      const plumeT = since >= 0 ? since / Math.max(0.05, c.plumeLife * L) : 2;
      this.plume.visible = plumeT < 1;
      if (this.plume.visible) {
        const up = Easing.outCubic(clamp01(since / Math.max(0.02, c.plumeRise * L)));
        this.plume.scale.set(R * c.plumeWidth * (0.7 + 0.3 * up), c.plumeHeight * (0.3 + 0.7 * up), R * c.plumeWidth * (0.7 + 0.3 * up));
        this.plume.position.set(this._k.whipX * 0.5, 0, this._k.whipZ * 0.5);
        const ps = this._plumeState;
        ps.clock = clock;
        ps.burn = Easing.inQuad(plumeT);
        ps.power = up * (1 - smooth((plumeT - 0.55) / 0.45));
        this.plumeMat.userData.sync(ps);
      }

      // 6 · embers off the hot length
      if (this.embers && !fading) {
        const rate = c.emberRate * front * Math.min(1, temp);
        const n = this._embers.tick(dt, rate);
        if (n > 0) {
          const per = Math.ceil(n / EMBER_BATCHES);
          for (let b = 0, left = n; b < EMBER_BATCHES && left > 0; b++, left -= per) {
            coilPoint(this._k, Math.random() * front, _p);
            _pos.set(this.position.x + _p.x, _p.y + this._k.thick, this.position.z + _p.z);
            this._emitEmbers(_pos, Math.min(per, left), this._k.thick * 1.5, 1);
          }
        }
      }

      // 8 · the haze
      const shock = since >= 0 ? Math.max(0, 1 - since / Math.max(0.05, 0.6 * L)) : 0;
      const hz = this._hazeState;
      hz.shimmer = front * temp * (1 - fadeT);
      hz.shock = shock;
      hz.wave = Easing.outCubic(1 - shock);
      hz.clock = clock;
      this.haze.visible = !this._calm && (hz.shimmer * c.hazeStrength + hz.shock * c.hazeShock) * g.distortion > 0.002;
      if (this.haze.visible) {
        this.haze.position.y = R * c.coilHeight * c.hazeHeight;
        this.haze.scale.set(R * 2.4, R * 2.4, 1);
        this.hazeMat.userData.sync(hz);
      }
    }

    // 5 · the brands follow their debtors
    this._syncBrands(fadeT, since);
    this._syncParticles();
  }

  _syncBrands(fadeT, since) {
    const c = this.config;
    let any = false;
    const flareT = since >= 0 ? since / Math.max(0.05, 0.45 * this._L) : -1;
    const attr = this.brandGeometry.attributes.aStack;
    for (let i = 0; i < MAX_DEBTORS; i++) {
      const d = this._debtors[i];
      const show = d.used && d.stacks > 0 && flareT < 1;
      if (show) {
        any = true;
        const px = d.dummy ? d.dummy.position.x : d.x;
        const pz = d.dummy ? d.dummy.position.z : d.z;
        const flare = flareT >= 0 ? 1 - flareT : 0;
        _o3.position.set(px, 0.04, pz);
        _o3.rotation.set(-Math.PI / 2, 0, this._calm ? 0 : this._clock * 0.6);
        _o3.scale.setScalar(c.brandSize * (1 + 0.6 * (flareT >= 0 ? Easing.outCubic(clamp01(flareT)) : 0)));
        _o3.updateMatrix();
        this.brands.setMatrixAt(i, _o3.matrix);
        attr.array[i * 2] = d.stacks;
        attr.array[i * 2 + 1] = flare;
      } else {
        _o3.position.set(0, -50, 0);
        _o3.scale.setScalar(0);
        _o3.rotation.set(0, 0, 0);
        _o3.updateMatrix();
        this.brands.setMatrixAt(i, _o3.matrix);
        attr.array[i * 2] = 0;
        attr.array[i * 2 + 1] = 0;
      }
    }
    attr.needsUpdate = true;
    this.brands.instanceMatrix.needsUpdate = true;
    this.brands.visible = any;
    this._brandState.clock = this._clock;
    this._brandState.fade = 1 - fadeT;
    this.brandMat.userData.sync(this._brandState);
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._scope = null;
    this.root.visible = false;
    this.slug.visible = false;
    this.plume.visible = false;
    this.haze.visible = false;
    this.brands.visible = false;
    this._resetCast();
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
  const castAnim = (f, c) => (Editor?.castAnimation ? Editor.castAnimation(f, c) : f.add(c, 'castAnim', CAST_ANIMATIONS));
  return { R, sub, color, castAnim };
}

export function buildEditor(gui, c, Editor) {
  const { R, sub, color, castAnim } = editorKit(Editor);
  const folder = gui.addFolder('♨  Combustion Debt');

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 80, 0.5, 'slug flies at (m/s)');
  R(cast, c, 'zoneRadius', 1, 8, 0.05, 'zone radius (m)');
  R(cast, c, 'lifetime', 0.2, 10, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'cooldown', 0, 20, 0.05, 'cooldown');
  castAnim(cast, c);

  const debt = sub(folder, 'The debt');
  R(debt, c, 'ticks', 1, 8, 1, 'heat ticks');
  R(debt, c, 'tickInterval', 0.08, 1.5, 0.01, 'tick every (s)');
  R(debt, c, 'tickPhase', 0, 1, 0.01, 'first tick at (× interval)');
  R(debt, c, 'igniteThreshold', 1, 8, 1, 'stacks to ignite');
  R(debt, c, 'debtCap', 1, 64, 1, 'foreclosure at total stacks');
  R(debt, c, 'foreclosureDelay', 0, 1, 0.01, 'foreclosure call beat (s)');
  R(debt, c, 'damagePerStack', 0, 4, 0.05, 'damage per stack');
  R(debt, c, 'maxDamage', 0, 10, 0.1, 'max damage');
  R(debt, c, 'burnIntensity', 0, 3, 0.05, 'burning per stack');
  R(debt, c, 'groundBurn', 0, 10, 0.1, 'burning ground (s)');
  R(debt, c, 'hitImpulse', 0, 24, 0.1, 'impulse at full debt');
  R(debt, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(debt, c, 'hitSpin', 0, 8, 0.05, 'tumble');
  R(debt, c, 'stackForce', 0, 1, 0.01, 'force scales with stacks');
  R(debt, c, 'charPerStack', 0, 1, 0.01, 'char per stack');
  R(debt, c, 'charRimGlow', 0, 4, 0.05, 'char rim glow');
  R(debt, c, 'charEdgeGlow', 0, 4, 0.05, 'char edge glow');

  const beats = sub(folder, 'Beats');
  R(beats, c, 'chargeTime', 0.05, 1, 0.01, 'charge at hand (s)');
  R(beats, c, 'handHeight', 0.2, 3, 0.01, 'hand height (m)');
  R(beats, c, 'arcHeight', 0, 6, 0.05, 'lob height (m)');
  R(beats, c, 'riseTime', 0.05, 1.5, 0.01, 'coil rises over (s)');
  R(beats, c, 'payLinger', 0.2, 4, 0.05, 'linger after the call (s)');
  R(beats, c, 'coolTime', 0.1, 4, 0.05, 'cools over (s)');
  R(beats, c, 'exitTime', 0.1, 2, 0.05, 'sinks over (s)');

  const light = sub(folder, 'Light');
  color(light, c, 'lightColor', 'colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'tickLight', 0, 20, 0.1, 'punch per tick');
  R(light, c, 'payLight', 0, 40, 0.1, 'punch at the call');

  const pal = sub(folder, 'Palette');
  color(pal, c, 'colorCore', 'white-hot');
  color(pal, c, 'colorTint', 'yellow-orange');
  color(pal, c, 'colorBody', 'flame');
  color(pal, c, 'colorDeep', 'dull red');
  color(pal, c, 'ironColor', 'cold iron');
  color(pal, c, 'charColor', 'scorch');

  const coil = sub(folder, '1 · The coil');
  R(coil, c, 'coilOuter', 0.3, 1.3, 0.01, 'outer turn (× radius)');
  R(coil, c, 'coilInner', 0, 0.6, 0.01, 'tip radius (× radius)');
  R(coil, c, 'coilHeight', 0.1, 2, 0.01, 'height (× radius)');
  R(coil, c, 'coilTurns', 0.5, 8, 0.05, 'turns');
  R(coil, c, 'coilProfile', 0.5, 4, 0.05, 'dome curvature');
  R(coil, c, 'coilThickness', 0.01, 0.15, 0.001, 'tube radius (× radius)');
  R(coil, c, 'beadFreq', 0, 200, 1, 'forged beads');
  R(coil, c, 'beadDepth', 0, 0.6, 0.01, 'bead swell');
  R(coil, c, 'ironMetalness', 0, 1, 0.01, 'metalness');
  R(coil, c, 'ironRoughness', 0, 1, 0.01, 'roughness');
  R(coil, c, 'heatGlow', 0, 8, 0.05, 'heat glow');
  R(coil, c, 'frontGlow', 0, 10, 0.05, 'leading edge glow');
  R(coil, c, 'heatCrawl', 0, 6, 0.05, 'hot spots crawl');
  R(coil, c, 'heatGrain', 0.5, 20, 0.1, 'hot spot density');
  R(coil, c, 'tickFlash', 0, 4, 0.05, 'tick flare');
  R(coil, c, 'compress', 0.1, 1, 0.01, 'wound to (× height)');
  R(coil, c, 'windTurn', -3, 3, 0.05, 'twist when wound (rad)');
  R(coil, c, 'spinSpeed', -2, 2, 0.01, 'slow turn (rad/s)');
  R(coil, c, 'springOvershoot', 0, 2, 0.01, 'spring overshoot');
  R(coil, c, 'springFreq', 0, 40, 0.1, 'ringing rate');
  R(coil, c, 'springDamp', 0.2, 20, 0.1, 'ringing decay');
  R(coil, c, 'whip', 0, 2, 0.01, 'tip whip (m)');
  R(coil, c, 'sinkDepth', 0.2, 2, 0.01, 'sinks (× height)');

  const hob = sub(folder, '2 · The hob');
  R(hob, c, 'hobScale', 0.5, 2, 0.01, 'disc (× radius)');
  R(hob, c, 'hobOpacity', 0, 1, 0.01, 'scorch darkness');
  R(hob, c, 'hobGlow', 0, 6, 0.05, 'pooled heat glow');
  R(hob, c, 'hobSpiralWidth', 0.02, 1.5, 0.01, 'pooled heat width (m)');
  R(hob, c, 'hobCracks', 0.2, 8, 0.05, 'crack density');
  R(hob, c, 'hobCrackGlow', 0, 6, 0.05, 'crack glow');
  R(hob, c, 'hobRevealTime', 0.02, 2, 0.01, 'scorch spreads over (s)');
  R(hob, c, 'hobReleaseTime', 0.05, 2, 0.01, 'fire ring runs over (s)');

  const plume = sub(folder, '3 · The plume');
  R(plume, c, 'plumeHeight', 0.5, 14, 0.05, 'height (m)');
  R(plume, c, 'plumeWidth', 0.05, 1.5, 0.01, 'width (× radius)');
  R(plume, c, 'plumeGlow', 0, 8, 0.05, 'glow');
  R(plume, c, 'plumeLife', 0.1, 4, 0.05, 'lives (s)');
  R(plume, c, 'plumeRise', 0.02, 1, 0.01, 'rises over (s)');
  R(plume, c, 'plumeNoise', 0, 1.5, 0.01, 'turbulent swell');
  R(plume, c, 'plumeScroll', 0, 8, 0.05, 'flame climb');
  R(plume, c, 'plumeOpacity', 0, 1, 0.01, 'opacity');

  const slug = sub(folder, '4 · The slug');
  R(slug, c, 'slugSize', 0.05, 1.5, 0.01, 'size (m)');
  R(slug, c, 'slugGlow', 0, 8, 0.05, 'glow');

  const brand = sub(folder, '5 · Debt brands');
  R(brand, c, 'brandSize', 0.1, 2, 0.01, 'ring radius (m)');
  R(brand, c, 'brandGlow', 0, 6, 0.05, 'glow');
  R(brand, c, 'brandOpacity', 0, 1, 0.01, 'opacity');

  const fx = sub(folder, '6 · Particles');
  R(fx, c, 'emberRate', 0, 400, 1, 'embers / s');
  R(fx, c, 'emberSize', 0.01, 0.4, 0.005, 'ember size');
  R(fx, c, 'emberLife', 0.1, 4, 0.05, 'ember life (s)');
  R(fx, c, 'emberSpeed', 0, 6, 0.05, 'ember rise');
  R(fx, c, 'emberGlow', 0, 6, 0.05, 'ember glow');
  R(fx, c, 'tickSparks', 0, 80, 1, 'sparks per tick');
  R(fx, c, 'paySparks', 0, 300, 1, 'sparks at the call');
  R(fx, c, 'sparkSize', 0.005, 0.3, 0.005, 'spark size');
  R(fx, c, 'sparkLife', 0.05, 3, 0.01, 'spark life (s)');
  R(fx, c, 'sparkSpeed', 0, 20, 0.1, 'spark speed');
  R(fx, c, 'sparkGlow', 0, 6, 0.05, 'spark glow');
  R(fx, c, 'smokeCount', 0, 120, 1, 'smoke puffs');
  R(fx, c, 'smokeSize', 0.1, 4, 0.05, 'smoke size');
  R(fx, c, 'smokeLife', 0.2, 6, 0.05, 'smoke life (s)');
  R(fx, c, 'smokeSpeed', 0, 5, 0.05, 'smoke rise');
  R(fx, c, 'smokeOpacity', 0, 1, 0.01, 'smoke opacity');
  color(fx, c, 'smokeColorA', 'smoke lit');
  color(fx, c, 'smokeColorB', 'soot');
  R(fx, c, 'slagCount', 0, 120, 1, 'slag chips');
  R(fx, c, 'slagSize', 0.02, 0.6, 0.005, 'slag size');
  R(fx, c, 'slagLife', 0.1, 4, 0.05, 'slag life (s)');
  R(fx, c, 'slagSpeed', 0, 20, 0.1, 'slag speed');

  const hit = sub(folder, '7 · The impact');
  R(hit, c, 'burstScale', 0, 2, 0.01, 'fire shell (× radius)');
  R(hit, c, 'burstLife', 0.05, 3, 0.01, 'shell life (s)');
  R(hit, c, 'burstIntensity', 0, 4, 0.05, 'shell brightness');
  R(hit, c, 'burstOpacity', 0, 1, 0.01, 'shell opacity');
  R(hit, c, 'decalLife', 0.1, 10, 0.1, 'decals last (s)');
  R(hit, c, 'shockwaveWidth', 0.01, 0.4, 0.005, 'shockwave width');
  R(hit, c, 'landShake', 0, 1, 0.01, 'landing knock');
  R(hit, c, 'tickShake', 0, 1, 0.01, 'tick knock');
  R(hit, c, 'payShake', 0, 2, 0.01, 'call knock');
  R(hit, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(hit, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(hit, c, 'payFlash', 0, 1, 0.01, 'flash');

  const haze = sub(folder, '8 · The haze');
  R(haze, c, 'hazeStrength', 0, 3, 0.01, 'shimmer');
  R(haze, c, 'hazeShock', 0, 3, 0.01, 'pressure ring');
  R(haze, c, 'hazeHeight', 0, 2, 0.01, 'height (× coil)');

  return folder;
}
