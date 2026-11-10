import {
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  Vector3,
} from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { routeExpansionTransparency } from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { frame } from '../../../core/FrameUniforms.js';
import { LAYER } from '../../../core/Layers.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import {
  createCoinGeometry,
  createFinGeometry,
  createQuad,
  createVortexGeometry,
  createWellGeometry,
  wellHeightAt,
  wellSlopeAt,
  writeWell,
} from './geometry.js';
import {
  createCoinMaterial,
  createFieldMaterial,
  createFinMaterial,
  createLensMaterial,
  createVortexMaterial,
  createWellMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
export const UID = 'matrix-expansion/existence-tax';

const TAU = Math.PI * 2;
const GOLDEN = 2.399963;
/** Tithe coins alive at once (zone coins + levied coins). */
const MAX_COINS = 48;
/** Enemies one cast can assess. The combat bridge takes ≤ 8 targets per event. */
const MAX_PAYERS = 8;
/** Constructs one cast can consume (`maxConsume` is clamped to this). */
const MAX_CONSUME = 3;
/** Ledger fins round the outer wall. */
const MAX_FINS = 16;

const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};

/* Module scratch — nothing below allocates per frame. */
const _p = new Vector3();
const _q = new Vector3();
const _dir = new Vector3();
const _bx = new Vector3();
const _by = new Vector3();
const _bz = new Vector3();
const _up = new Vector3(0, 1, 0);
const _m = new Matrix4();
const _obj = new Object3D();
const _at = new Vector3();
const _emit = {
  position: new Vector3(), radius: 0, direction: new Vector3(0, 1, 0), speed: 1, speedVariance: 0.35,
  spread: 0.5, size: 0.1, sizeVariance: 0.4, life: 1, lifeVariance: 0.3, spin: 0, time: 0,
};
const _source = [0, 0, 0];
const _target = [0, 0, 0];
const _ranked = [];

/**
 * EXISTENCE TAX — void, zone cast.
 *
 * The void does not destroy; it *collects*. The cast is a levy, told in five
 * beats round one hero form: a solid obsidian **gravity well** — a coin funnel
 * the width of the zone.
 *
 *  1. **Anticipation — the writ.** A thick, square-holed coin of black metal is
 *     minted in the caster's hand (`chargeTime`): it swells out of nothing with
 *     an overshoot and spins on its edge, its engraved rim lighting, motes drawn
 *     into it. The front refuses to leave the hand until it is minted. On the
 *     floor at the target the ledger is already faintly written — the telegraph.
 *  2. **Travel.** The writ is lobbed down the line end over end (`writArc`,
 *     `writFlips`), trailing violet streaks.
 *  3. **Impact.** It lands on its edge in the middle and slots into the floor —
 *     and the floor tears up round it into the well (`riseTime`, the lip
 *     punching past its height): a flared outer wall ribbed with twelve notched
 *     ledger fins, a rolled lip, and an inner wall that is a true `1/r` gravity
 *     well falling into a throat that drops through the floor. The ground is
 *     excised outward from the throat (the field goes black and veined), a
 *     pressure ring runs out through the lens, a thin dark shell, shockwave,
 *     dim flash and a knock.
 *  4. **Linger — the assessment.** One clock (`since landing`) and thresholds
 *     on it. Four times (`taxTicks`, `taxInterval`) the ledger on the rim lights
 *     another quarter and the **whole well ratchets round** (`ratchetAngle`,
 *     an outBack snap), the fins flare, the camera ticks. Every enemy inside
 *     pays: a coin is struck out of it, flies to the rim and *rolls the spiral
 *     down the well*, leaning in, accelerating as it falls, and is eaten by the
 *     throat; the zone itself pays `coinsPerTick` more from the lip. Above the
 *     throat an inverted funnel cloud is drawn *down* into the hole, the floor
 *     veins are dragged round it by differential rotation, motes and ash sink
 *     in. Then the call: the **eligible construct** is seized — knocked inward,
 *     carried round the well, consumed by the throat — and the well clenches,
 *     the throat flares white, the vortex is drained, the light punches.
 *  5. **Exit.** The well folds back into the hole it came out of (radius and
 *     height to the throat, sinking), the field dissolves through noise with a
 *     burning lip, and a dark scar outlives the cast.
 *
 * ## Layers (each a folder in the editor)
 *   1. **the well** — `createWellGeometry`/`writeWell` (lathe profile rewritten
 *      in place from settings every frame) + `createWellMaterial` (lit
 *      obsidian, patched emission: grooves, ledger, throat lip); `LAYER.WORLD`,
 *      shadows. Fins: instanced extruded blades, `createFinMaterial`.
 *   2. **the coins** — 48 instanced extruded cash coins + the writ,
 *      `createCoinMaterial` (lit metal, engraved glow, throat dissolve).
 *   3. **the vortex** — reshaped open cylinder, `createVortexMaterial`.
 *   4. **the field** — excised floor disc, `createFieldMaterial`.
 *   5. **particles** — motes (SOFT), sparks (STREAK), ash (SMOKE), chips (CHIP).
 *   6. **impact** — AIR shell, SHOCKWAVE/SCORCH/CRACK decals, flash, shake,
 *      light punch; the light gutters while the throat feeds.
 *   7. **the lens** — `LAYER.DISTORTION` pinch + landing ring.
 *
 * ## Gameplay (`handlesOwnHits`)
 * Each assessment levies every enemy inside `zoneRadius` (≤ 8): through the
 * combat binding a UCSM `status` (void → `hollowed`), on sandbox dummies a
 * `corrode` step. A construct is **eligible** once it has paid at least
 * `eligibleLevies` assessments; at the call the eligible construct that paid
 * the most (then: nearest the throat, then: first assessed) is consumed — one
 * UCSM `hit` of `consumeDamage`, or `Dummy.kill` with a gentle inward knock —
 * up to `maxConsume`. Everyone else has only paid the tax. With no eligible
 * construct the throat snaps shut on nothing.
 *
 * ## The editor rule
 * Records hold dice (bearings, seeds, a mint time, a payer's position at the
 * moment it paid) and event times; every metre and second is resolved from
 * `settings.existenceTax` each frame, so dragging `zoneRadius` mid-cast
 * reshapes the well, the fins, the coin spirals and the field together.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    let n = 0;
    for (const coin of this._coins) if (coin.used) n++;
    return n + this.fins.count + 1;
  }

  /** Global lifetime scale, guarded. */
  get _L() {
    const l = settings.global?.lifetime;
    return Number.isFinite(l) && l > 0 ? l : 1;
  }

  _ticks() {
    return Math.max(1, Math.min(8, Math.round(this.config.taxTicks)));
  }

  /** Seconds after landing of assessment `k`. */
  _tickTime(k) {
    const c = this.config;
    return (c.assessDelay + k * c.taxInterval) * this._L;
  }

  /** Seconds after landing of the call (the consumption). */
  _callTime() {
    return this._tickTime(this._ticks() - 1) + this.config.consumeDelay * this._L;
  }

  get impactDuration() {
    return this._callTime() + this.config.consumeHold * this._L;
  }

  get fadeDuration() {
    return Math.max(0.2, this.config.exitTime * this._L);
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

    // 4 · the field (under everything)
    this.fieldMat = own(createFieldMaterial());
    this.field = new Mesh(quad, this.fieldMat);
    this.field.rotation.x = -Math.PI / 2;
    this.field.position.y = 0.03;
    this.field.renderOrder = 1;
    this.root.add(this.field);

    // 1 · the well: it turns (ratchet) as one body with its fins
    this.spinner = new Group();
    this.root.add(this.spinner);
    this.wellGeo = own(createWellGeometry());
    this.wellMat = own(createWellMaterial());
    this.well = new Mesh(this.wellGeo, this.wellMat);
    this.well.castShadow = true;
    this.well.receiveShadow = true;
    this.well.frustumCulled = false;
    this.spinner.add(this.well);
    this.finMat = own(createFinMaterial());
    this.fins = new InstancedMesh(own(createFinGeometry()), this.finMat, MAX_FINS);
    this.fins.castShadow = true;
    this.fins.receiveShadow = true;
    this.fins.frustumCulled = false;
    this.spinner.add(this.fins);

    // 2 · the coins, and the writ (an instanced mesh of one, same material)
    this.coinGeo = own(createCoinGeometry());
    this.coinMat = own(createCoinMaterial());
    this.coins = new InstancedMesh(this.coinGeo, this.coinMat, MAX_COINS);
    this.coinAttr = new InstancedBufferAttribute(new Float32Array(MAX_COINS * 2), 2);
    this.coinGeo.setAttribute('aCoin', this.coinAttr);
    this.coins.castShadow = true;
    this.coins.frustumCulled = false;
    this.root.add(this.coins);
    // The writ needs its own per-instance attribute, so it gets its own
    // geometry instance of the same shape.
    this.writGeo = own(createCoinGeometry());
    this.writAttr = new InstancedBufferAttribute(new Float32Array(2), 2);
    this.writGeo.setAttribute('aCoin', this.writAttr);
    this.writ = new InstancedMesh(this.writGeo, this.coinMat, 1);
    this.writ.castShadow = true;
    this.writ.frustumCulled = false;
    this.group.add(this.writ); // world-space: it flies from the hand

    // 3 · the vortex
    this.vortexMat = own(createVortexMaterial());
    this.vortex = new Mesh(own(createVortexGeometry()), this.vortexMat);
    this.vortex.frustumCulled = false;
    this.vortex.renderOrder = 6;
    this.root.add(this.vortex);

    // 7 · the lens
    this.lensMat = own(createLensMaterial());
    this.lens = new Mesh(quad, this.lensMat);
    this.lens.rotation.x = -Math.PI / 2;
    this.lens.position.y = 0.4;
    this.lens.visible = false;
    this.root.add(this.lens);

    // Solid things on the world layer (depth prepass, shadows); the rest VFX.
    for (const solid of [this.well, this.fins, this.coins, this.writ]) solid.layers.set(LAYER.WORLD);
    routeExpansionTransparency(this.group);
    this.lens.layers.set(LAYER.DISTORTION);

    /* Pools: records hold dice and event times only. */
    this._coins = [];
    for (let i = 0; i < MAX_COINS; i++) {
      this._coins.push({ used: false, kind: 0, born: 0, bearing: 0, sx: 0, sy: 0, sz: 0, seed: 0, dir: 1 });
    }
    this._payers = [];
    for (let i = 0; i < MAX_PAYERS; i++) {
      this._payers.push({
        used: false, id: null, dummy: null, levies: 0, order: 0, x: 0, z: 0,
        consumed: false, seizedAt: -1, body: null, eaten: 0, gone: false,
      });
    }
    this._found = [];
    this._bodies = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._shape = { rim: 3, foot: 2.4, height: 1.3, lip: 0.15, throat: 0.4, throatY: 0.1, curve: 1 };
    this._look = { color: '#140a26', rimColor: '#5b2bd6', rimEmissive: 1, edgeColor: '#b58cff', edgeEmissive: 2, edgeWidth: 0.05 };
    this._wellState = { clock: 0, levied: 0, ticks: 4, flash: 0, swallow: 0, fade: 1 };
    this._coinState = { fade: 1, glow: 1 };
    this._finState = { flash: 0, fill: 0, fade: 1 };
    this._fieldState = { radius: 4, rim: 3, foot: 2.4, throat: 0.4, front: 0, levied: 0, ticks: 4, flash: 0, telegraph: 0, dissolve: 0, clock: 0, fade: 1, swallow: 0 };
    this._vortexState = { height: 4, base: 0.4, top: 1.5, clock: 0, drain: 0, baseY: 0, fade: 1 };
    this._lensState = { pinch: 0, shock: 0, wave: 0, clock: 0 };
    this._flow = { cx: 0, cz: 0, pull: 0, swirl: 0 };
    /** Bound once: `Dummy#carry` is handed this for every body, every frame. */
    this._field = (x, y, z, out) => this._sampleFlow(x, y, z, out);
    this._moteEmitter = new RateEmitter();
    this._ashEmitter = new RateEmitter();
    this._hand = new Vector3();
    this._centre = new Vector3();
    this._disposed = false;
    this.root.visible = false;
    this.writ.visible = false;
  }

  createParticles() {
    const get = (layer, opts) => this.ctx.particles?.get?.(`existence-tax.${layer}`, opts) ?? null;
    this.motes = get('motes', { capacity: 600, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.3 });
    this.sparks = get('sparks', { capacity: 500, shape: ParticleShape.STREAK, additive: true, stretch: true, softFade: 0.2 });
    this.ash = get('ash', { capacity: 300, shape: ParticleShape.SMOKE, additive: false, curl: true, softFade: 0.5 });
    this.chips = get('chips', { capacity: 200, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.2 });
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this._seed = Math.random() * 1000;
    this._calm = prefersReducedMotion();
    this._clock = 0;
    this._ticksDone = 0;
    this._lastTick = -10;
    this._called = false;
    this._calledAt = -10;
    this._consumedCount = 0;
    this._order = 0;
    this._landed = false;
    this._scarred = false;
    for (const coin of this._coins) coin.used = false;
    for (const p of this._payers) this._clearPayer(p);
    this._moteEmitter.reset();
    this._ashEmitter.reset();
    this.root.visible = false;
    this.writ.visible = true;
    this.lens.visible = false;
    this._sync(0);
  }

  /** The writ is minted before the front may leave the hand. */
  advance(dt) {
    if (this.age < this.config.chargeTime * this._L) {
      this.position.copy(this.origin);
      return false;
    }
    return super.advance(dt);
  }

  onTravel(dt) {
    const c = this.config;
    // A streak trail behind the writ once it is in the air.
    if (this.age >= c.chargeTime * this._L && this.sparks) {
      this._writPoint(_p);
      this._burst(this.sparks, _p, 2, 0.15, c.sparkSize, c.sparkLife * 0.6, c.sparkSpeed * 0.15, 1, null);
    }
    this._sync(dt);
  }

  onImpact() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = c.zoneRadius;
    this._landed = true;
    this._centre.set(this.position.x, 0, this.position.z);
    this.root.visible = true;
    this.lightBoost = c.impactLight * power;
    _p.copy(this._centre).setY(0.06);
    this.ctx.bursts?.spawn?.(BurstMode.AIR, _p, {
      radius: R * 0.12, endRadius: R * c.burstReach * power, life: c.burstLife * this._L,
      intensity: 0.7, opacity: c.burstOpacity * g.opacity, fresnel: g.fresnel * 2, squash: 0.35,
      colorA: getColor(c.colorTint), colorB: getColor(c.colorBody), colorC: getColor(c.colorDeep),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _p, {
      radius: R * 1.25 * power, life: 0.8, width: 0.07, intensity: 1.1,
      colorA: getColor(c.colorTint), colorB: getColor(c.colorBody),
    });
    if (c.impactShake > 0) this.ctx.shake?.add?.(c.impactShake * power * g.cameraShake, c.shakeDecay, c.shakeFrequency);
    if (c.impactFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorBody), c.impactFlash * power);
    _p.copy(this._centre).setY(0.4);
    this._burst(this.sparks, _p, c.sparkCount * 2, 0.4, c.sparkSize * 1.3, c.sparkLife, c.sparkSpeed, 0.9, _up);
    this._burst(this.chips, _p, 18, 0.6, c.chipSize, c.chipLife, 3.2, 0.8, _up);
    this._sync(0);
  }

  onFade(dt) {
    const T = this._since();
    const ticks = this._ticks();
    while (this._ticksDone < ticks && T >= this._tickTime(this._ticksDone)) this._assess();
    if (!this._called && this._ticksDone >= ticks && T >= this._callTime()) this._call();
    this._grip(dt);
    this._emitLinger(dt);
    this._sync(dt);
  }

  /** Seconds since landing, through the impact and the fade. */
  _since() {
    if (!this._landed) return -1;
    return this.impactTime + (this.phase === 'fade' ? this.fadeTime : 0);
  }

  /* ------------------------------------------------------------------ */
  /* Gameplay — the assessment and the call                              */
  /* ------------------------------------------------------------------ */

  _clearPayer(p) {
    p.used = false; p.id = null; p.dummy = null; p.levies = 0; p.order = 0; p.x = 0; p.z = 0;
    p.consumed = false; p.seizedAt = -1; p.body = null; p.eaten = 0; p.gone = false;
  }

  _payer(dummy, id) {
    let free = null;
    for (const p of this._payers) {
      if (p.used && ((dummy && p.dummy === dummy) || (id !== null && p.id === id))) return p;
      if (!p.used && !free) free = p;
    }
    if (!free) return null;
    free.used = true;
    free.dummy = dummy;
    free.id = id;
    free.levies = 0;
    free.order = this._order++;
    return free;
  }

  _syncLook() {
    const c = this.config;
    const look = this._look;
    look.color = c.corrodeColor;
    look.rimColor = c.colorBody;
    look.rimEmissive = 1.2;
    look.edgeColor = c.colorTint;
    look.edgeEmissive = 2.2;
    look.edgeWidth = settings.dummies?.look?.edgeWidth ?? 0.05;
    return look;
  }

  /** The nearest sandbox body to (x, z) — presentation only (stain, grip). */
  _bodyNear(x, z, radius, wantDown) {
    const field = this.ctx.dummies;
    const list = wantDown ? field?.findBodies?.(x, z, radius, this._bodies) : field?.findTargets?.(x, z, radius, this._bodies);
    if (!list) return null;
    for (const body of list) if (!wantDown || body.alive === false) return body;
    return null;
  }

  /** One assessment: everyone inside pays, the zone pays, the well ratchets. */
  _assess() {
    const c = this.config;
    const g = settings.global;
    const R = c.zoneRadius;
    const x = this._centre.x;
    const z = this._centre.z;
    const k = this._ticksDone++;
    this._lastTick = this._tickTime(k);
    const look = this._syncLook();
    if (this._scope) {
      _source[0] = x; _source[1] = 0; _source[2] = z;
      const found = this._scope.queryActors({ position: _source, radius: R, relation: 'enemy' });
      if (!found.ok) this.failure = found.reason;
      else {
        for (const actor of found.actors) {
          if (actor.alive === false) continue;
          const p = this._payer(null, actor.id);
          if (!p) break; // the payer table is the bound (≤ MAX_PAYERS)
          p.levies++;
          p.x = actor.position[0];
          p.z = actor.position[2];
          const sent = this._scope.emit({
            type: 'status', element: 'void', targetIds: [actor.id], position: actor.position, sourcePosition: [x, 0, z],
            intensity: Math.min(3, Math.max(0, c.taxStatus) * p.levies),
            durationTicks: Math.max(1, Math.round(c.taxDuration * (this._scope.tickRate || 30))),
            tags: ['existence-tax', 'levy'],
          });
          // The standalone fallback has no statuses — the ledger still counts.
          if (!sent.ok && !this._scope.standalone) this.failure = sent.reason;
          const body = this._bodyNear(p.x, p.z, 0.6, false);
          body?.corrode?.(Math.min(1, p.levies * c.taxCorrode), look);
          this._mintLevy(p.x, p.z, k);
        }
      }
    } else if (this.ctx.dummies?.findTargets) {
      const found = this.ctx.dummies.findTargets(x, z, R, this._found);
      for (const dummy of found) {
        const dx = dummy.position.x - x;
        const dz = dummy.position.z - z;
        if (dx * dx + dz * dz > R * R || dummy.alive === false) continue;
        const p = this._payer(dummy, null);
        if (!p) break;
        p.levies++;
        p.x = dummy.position.x;
        p.z = dummy.position.z;
        dummy.corrode?.(Math.min(1, p.levies * c.taxCorrode), look);
        this._mintLevy(p.x, p.z, k);
      }
    }
    // The zone itself pays a ring of coins from the lip.
    const n = Math.max(0, Math.min(12, Math.round(c.coinsPerTick)));
    for (let i = 0; i < n; i++) this._mint(0, (i / Math.max(1, n)) * TAU + k * GOLDEN + this._seed, 0, 0, 0);
    // Presentation of the tick.
    const rim = R * c.rimSeat;
    for (let i = 0; i < 3; i++) {
      const a = k * GOLDEN + i * 2.1 + this._seed;
      _p.set(x + Math.cos(a) * rim, c.rimHeight, z + Math.sin(a) * rim);
      this._burst(this.sparks, _p, Math.round(c.sparkCount / 3), 0.15, c.sparkSize, c.sparkLife, c.sparkSpeed * 0.6, 0.6, _up);
    }
    if (c.tickShake > 0) this.ctx.shake?.add?.(c.tickShake * g.cameraShake, c.shakeDecay, c.shakeFrequency);
    this.lightBoost = Math.max(this.lightBoost, c.impactLight * 0.35);
  }

  /**
   * The call: the eligible construct is consumed. Eligible = alive and has
   * paid ≥ `eligibleLevies`. Ranked by levies paid (most first), then by
   * distance to the throat at its last assessment, then by who paid first.
   */
  _call() {
    if (this._called) return;
    this._called = true;
    this._calledAt = this._since();
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const x = this._centre.x;
    const z = this._centre.z;
    _ranked.length = 0;
    for (const p of this._payers) {
      if (!p.used || p.consumed || p.levies < c.eligibleLevies) continue;
      if (p.dummy && p.dummy.alive === false) continue;
      if (!p.dummy && this._scope) {
        const got = this._scope.getActor(p.id);
        if (!got.ok || got.actor.alive === false) continue;
      }
      // Insertion into the ranking (≤ 8 entries, no allocation).
      let i = _ranked.length;
      _ranked.push(p);
      while (i > 0 && this._outranks(p, _ranked[i - 1])) {
        _ranked[i] = _ranked[i - 1];
        _ranked[i - 1] = p;
        i--;
      }
    }
    const take = Math.min(_ranked.length, Math.max(0, Math.min(MAX_CONSUME, Math.round(c.maxConsume))));
    for (let i = 0; i < take; i++) {
      const p = _ranked[i];
      // Inward: the blow comes from beyond the body, toward the throat.
      _dir.set(p.x - x, 0, p.z - z);
      if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction);
      else _dir.normalize();
      let accepted = false;
      if (this._scope) {
        _target[0] = p.x; _target[1] = 0; _target[2] = p.z;
        const sent = this._scope.emit({
          type: 'hit', element: 'void', targetIds: [p.id], position: [p.x, 0, p.z],
          sourcePosition: [p.x + _dir.x, 0, p.z + _dir.z],
          damage: Math.min(10, Math.max(0, c.consumeDamage)),
          hitForce: impactForce(c, power), tags: ['existence-tax', 'consumed'],
        });
        if (!sent.ok) this.failure = sent.reason;
        accepted = sent.ok;
      } else if (p.dummy) {
        this._force.impulse = c.hitImpulse * power;
        this._force.lift = c.hitLift * power;
        this._force.spin = c.hitSpin;
        p.dummy.corrode?.(1, this._syncLook());
        accepted = p.dummy.kill(-_dir.x, -_dir.z, this._force);
        if (accepted) p.body = p.dummy;
      }
      if (accepted) {
        p.consumed = true;
        p.seizedAt = this._calledAt;
        this._consumedCount++;
      }
    }
    this._callFx(this._consumedCount > 0);
  }

  _outranks(a, b) {
    if (a.levies !== b.levies) return a.levies > b.levies;
    const x = this._centre.x;
    const z = this._centre.z;
    const da = (a.x - x) ** 2 + (a.z - z) ** 2;
    const db = (b.x - x) ** 2 + (b.z - z) ** 2;
    if (Math.abs(da - db) > 1e-6) return da < db;
    return a.order < b.order;
  }

  /** The throat flares and the well clenches — loud if it fed, quiet if not. */
  _callFx(fed) {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = c.zoneRadius;
    const k = fed ? 1 : 0.4;
    this.lightBoost = c.consumeLight * power * k;
    _p.copy(this._centre).setY(0.05);
    this.ctx.decals?.spawn?.(DecalType.CRACK, _p, {
      radius: R * 0.75, life: c.decalLife, intensity: 0.9 * k,
      colorA: getColor(c.colorBody), colorB: getColor(c.colorDeep),
    });
    this.ctx.bursts?.spawn?.(BurstMode.AIR, _p, {
      radius: R * 0.9, endRadius: c.throatRadius, life: 0.35 * this._L,
      intensity: 0.9 * k, opacity: c.burstOpacity * g.opacity, fresnel: g.fresnel * 2.5, squash: 0.3,
      colorA: getColor(c.colorCore), colorB: getColor(c.colorTint), colorC: getColor(c.colorDeep),
    });
    if (c.consumeShake > 0) this.ctx.shake?.add?.(c.consumeShake * power * g.cameraShake * k, c.shakeDecay, c.shakeFrequency);
    if (c.consumeFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorTint), c.consumeFlash * power * k);
    _p.copy(this._centre).setY(c.throatHeight + 0.2);
    this._burst(this.sparks, _p, Math.round(c.sparkCount * 2 * k), 0.2, c.sparkSize * 1.4, c.sparkLife * 1.2, c.sparkSpeed * 1.4, 0.35, _up);
  }

  /** Bodies being consumed: carried round the well and eaten by the throat. */
  _grip(dt) {
    if (!this._called || dt <= 0) return;
    const c = this.config;
    const T = this._since();
    const hold = Math.max(0.1, c.consumeHold * this._L);
    for (const p of this._payers) {
      if (!p.consumed || p.gone) continue;
      // Through the combat bridge the knockdown lands on the next combat tick;
      // look for the fallen body until the hold runs out.
      if (!p.body) {
        if (T - p.seizedAt > hold) continue;
        p.body = this._bodyNear(p.x, p.z, 1.2, true);
        if (!p.body) continue;
      }
      const body = p.body;
      if (body.finished || body.state === 'gone') {
        p.gone = true;
        continue;
      }
      const at = body.bodyPoint?.(_at);
      if (!at) continue;
      const t = T - p.seizedAt;
      const wound = Easing.outCubic(clamp(t / 0.25));
      const f = this._flow;
      f.cx = this._centre.x;
      f.cz = this._centre.z;
      f.pull = c.pullSpeed * wound;
      f.swirl = c.pullSwirl * wound;
      const grab = clamp(4 * dt) * wound;
      body.carry?.(this._field, grab, grab, clamp(0.85 * wound));
      const dist = Math.hypot(at.x - f.cx, at.z - f.cz);
      const mouth = c.throatRadius * 2.2;
      const bite = clamp((mouth - dist) / Math.max(0.2, mouth));
      const late = clamp((t - hold * 0.45) / (hold * 0.4));
      const eating = Math.max(bite, late);
      if (eating > 0) {
        const before = p.eaten;
        p.eaten = Math.min(1, p.eaten + eating * c.devour * dt);
        body.consume?.(p.eaten);
        body.sink?.(p.eaten * 1.2);
        if (before < 0.05 && p.eaten >= 0.05) this._burst(this.chips, at, Math.round(c.chipCount * 0.5), 0.35, c.chipSize, c.chipLife, 2.4, 0.9, _up);
        if (p.eaten >= 1) {
          this._burst(this.chips, at, c.chipCount, 0.4, c.chipSize, c.chipLife, 3.5, 1, _up);
          body.release?.();
          p.gone = true;
        }
      }
    }
  }

  /** Velocity of the well's current at a joint: in, round, and down the slope. */
  _sampleFlow(x, y, z, out) {
    const f = this._flow;
    const dx = f.cx - x;
    const dz = f.cz - z;
    const d = Math.max(0.05, Math.hypot(dx, dz));
    const s = this._shape;
    const surface = wellHeightAt(d, s) + 0.35;
    const vy = d < s.throat * 1.4 ? -2.5 : (surface - y) * 3;
    out.x = (dx / d) * f.pull + (-dz / d) * f.swirl;
    out.y = vy;
    out.z = (dz / d) * f.pull + (dx / d) * f.swirl;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Coins                                                               */
  /* ------------------------------------------------------------------ */

  _mint(kind, bearing, sx, sy, sz) {
    for (const coin of this._coins) {
      if (coin.used) continue;
      coin.used = true;
      coin.kind = kind;
      coin.born = Math.max(0, this._since());
      coin.bearing = bearing;
      coin.sx = sx;
      coin.sy = sy;
      coin.sz = sz;
      coin.seed = Math.random();
      coin.dir = 1;
      return coin;
    }
    return null;
  }

  /** A levied coin is struck out of its payer and flies straight in to the rim. */
  _mintLevy(px, pz, k) {
    const c = this.config;
    const bearing = Math.atan2(pz - this._centre.z, px - this._centre.x);
    this._mint(1, bearing + 0.15 * (k % 2 ? 1 : -1), px, 1.15, pz);
    _p.set(px, 1.15, pz);
    this._burst(this.sparks, _p, Math.round(c.sparkCount * 0.6), 0.25, c.sparkSize, c.sparkLife, c.sparkSpeed * 0.5, 0.8, _up);
  }

  /**
   * Place every live coin from its dice and the current settings. Closed form:
   * levied coins fly a parabola to the rim; all coins then roll a spiral down
   * the well (log-radius, so they accelerate toward the throat), leaning in,
   * and drop through the throat dissolving.
   */
  _placeCoins() {
    const c = this.config;
    const T = this._since();
    const L = this._L;
    const s = this._shape;
    const size = c.coinSize;
    const rc = size * 0.5;
    const flight = Math.max(0.05, c.coinFlight * L);
    const hop = 0.28 * L;
    const spiral = Math.max(0.1, c.spiralTime * L);
    const drop = 0.22 * L;
    const inner = Math.max(s.throat + 0.05, s.rim - s.lip - rc * 0.6);
    const cx = this._centre.x;
    const cz = this._centre.z;
    let n = 0;
    for (const coin of this._coins) {
      if (!coin.used) continue;
      const age = T - coin.born;
      const lead = coin.kind === 1 ? flight : hop;
      const end = lead + spiral + drop;
      if (age > end) {
        coin.used = false;
        continue;
      }
      let heat = 0;
      let dissolve = 0;
      const b0 = coin.bearing;
      if (age < lead) {
        // Flight (levied) or a hop off the lip (zone coin), tumbling.
        const e = Easing.outQuad(clamp(age / lead));
        const rimX = cx + Math.cos(b0) * inner;
        const rimZ = cz + Math.sin(b0) * inner;
        const rimY = wellHeightAt(inner, s) + rc;
        let ax = rimX;
        let ay = s.height + 0.15;
        let az = rimZ;
        let arc = 0.5;
        if (coin.kind === 1) {
          ax = coin.sx;
          ay = coin.sy;
          az = coin.sz;
          arc = c.coinArc;
        }
        _p.set(ax + (rimX - ax) * e, ay + (rimY - ay) * e + arc * 4 * e * (1 - e), az + (rimZ - az) * e);
        _obj.position.copy(_p);
        _obj.rotation.set(age * 11 + coin.seed * 6, b0 + coin.seed, age * 5);
        _obj.scale.setScalar(size * smooth(age / 0.08 + 0.2));
        _obj.updateMatrix();
        _m.copy(_obj.matrix);
        heat = 0.15;
      } else {
        const sp = clamp((age - lead) / spiral);
        const u = Math.pow(sp, 1.45);
        const r = inner * Math.pow(s.throat / inner, u);
        const a = b0 + coin.dir * c.spiralTurns * TAU * Math.pow(u, 0.85);
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const fall = clamp((age - lead - spiral) / drop);
        // On its edge: centre one coin-radius above the surface.
        _p.set(cx + ca * r, wellHeightAt(r, s) + rc * 0.95 - fall * 0.9, cz + sa * r);
        // Basis: z = face normal (radial, leaning in), x = rolling direction.
        const slope = Math.atan(wellSlopeAt(r, s));
        const lean = c.coinLean + slope * 0.5;
        _bz.set(-ca * Math.cos(lean), Math.sin(lean), -sa * Math.cos(lean));
        _bx.set(-sa * coin.dir, 0, ca * coin.dir);
        _by.crossVectors(_bz, _bx).normalize();
        _bx.crossVectors(_by, _bz).normalize();
        // Roll: distance travelled over the coin's radius.
        const roll = (c.spiralTurns * TAU * Math.pow(u, 0.85) * (r + inner) * 0.5) / Math.max(0.05, rc) + coin.seed * TAU;
        const cr = Math.cos(roll);
        const sr = Math.sin(roll);
        _q.copy(_bx).multiplyScalar(cr).addScaledVector(_by, sr);
        _by.multiplyScalar(cr).addScaledVector(_bx, -sr);
        _m.makeBasis(_q, _by, _bz);
        const sc = size * (1 - 0.35 * fall);
        _m.scale(_dir.set(sc, sc, sc));
        _m.setPosition(_p);
        heat = 0.25 + 0.75 * sp;
        dissolve = fall;
      }
      this.coins.setMatrixAt(n, _m);
      this.coinAttr.array[n * 2] = heat;
      this.coinAttr.array[n * 2 + 1] = dissolve;
      n++;
    }
    this.coins.count = n;
    this.coins.instanceMatrix.needsUpdate = true;
    this.coinAttr.needsUpdate = true;
  }

  /** Where the writ is now (hand → lob → slot). */
  _writPoint(out) {
    const c = this.config;
    this._hand.copy(this.origin).addScaledVector(this.side, 0.38).addScaledVector(this.direction, 0.35);
    this._hand.y = c.writHeight;
    if (this.phase === 'travel') {
      const u = this.u;
      out.copy(this._hand).lerp(this.position, u);
      out.y = c.writHeight * (1 - u) + c.writSize * 0.5 * u + c.writArc * 4 * u * (1 - u);
      return out;
    }
    out.copy(this._centre);
    out.y = c.writSize * 0.5;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Particles                                                           */
  /* ------------------------------------------------------------------ */

  _burst(system, position, count, radius, size, life, speed, spread, direction) {
    if (!system || count <= 0) return;
    const g = settings.global;
    const n = Math.min(128, Math.max(0, Math.round(count * g.particleCount)));
    if (!n) return;
    _emit.position.copy(position);
    _emit.radius = radius;
    _emit.direction.copy(direction ?? _up);
    _emit.speed = speed * g.particleSpeed;
    _emit.spread = spread;
    _emit.size = size * g.particleSize;
    _emit.life = life * g.particleLifetime;
    _emit.spin = 2;
    _emit.time = frame.uTime.value;
    system.emit(n, _emit);
  }

  /** Motes and ash drawn down into the well while it stands. */
  _emitLinger(dt) {
    if (dt <= 0 || this.phase === 'fade') return;
    const c = this.config;
    const g = settings.global;
    const R = c.zoneRadius * c.rimSeat;
    if (this.motes) {
      const n = this._moteEmitter.tick(dt, Math.min(100, c.moteRate * g.particleCount));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const r = R * (0.75 + Math.random() * 0.5);
        _p.set(this._centre.x + Math.cos(a) * r, c.rimHeight * (0.8 + Math.random() * 0.9), this._centre.z + Math.sin(a) * r);
        _dir.set(-Math.cos(a) - Math.sin(a) * 0.6, -0.55, -Math.sin(a) + Math.cos(a) * 0.6).normalize();
        this._burst(this.motes, _p, 1, 0.05, c.moteSize, c.moteLife, c.moteSpeed, 0.15, _dir);
      }
    }
    if (this.ash) {
      const n = this._ashEmitter.tick(dt, Math.min(60, c.ashRate * g.particleCount));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const r = c.vortexTop * (0.4 + Math.random() * 0.6);
        _p.set(this._centre.x + Math.cos(a) * r, c.vortexHeight * (0.45 + Math.random() * 0.45), this._centre.z + Math.sin(a) * r);
        _dir.set(-Math.cos(a) * 0.4, -1, -Math.sin(a) * 0.4).normalize();
        this._burst(this.ash, _p, 1, 0.1, c.ashSize, c.ashLife, c.moteSpeed * 1.6, 0.2, _dir);
      }
    }
  }

  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    const A = getColor(c.colorMoteA);
    const sets = [this.motes, this.sparks, this.chips];
    for (const sys of sets) {
      if (!sys?.uniforms) continue;
      sys.setGradient?.(A, getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
      const u = sys.uniforms;
      if (u.uGlow) u.uGlow.value = c.particleGlow * g.glow;
      if (u.uOpacity) u.uOpacity.value = g.opacity;
      if (u.uTurbulence) u.uTurbulence.value = 0.5 * g.turbulence;
      if (u.uSizeScale) u.uSizeScale.value = 1;
      if (u.uSpeedScale) u.uSpeedScale.value = 1;
      if (u.uLifeScale) u.uLifeScale.value = 1;
    }
    if (this.motes?.uniforms?.uGravity) this.motes.uniforms.uGravity.value.set(0, -0.6, 0);
    if (this.sparks?.uniforms?.uGravity) this.sparks.uniforms.uGravity.value.set(0, -6, 0);
    if (this.chips?.uniforms?.uGravity) this.chips.uniforms.uGravity.value.set(0, -9, 0);
    if (this.ash?.uniforms) {
      this.ash.setGradient?.(getColor(c.colorMoteC), getColor(c.colorDeep), getColor(c.colorDeep), getColor(c.colorDeep));
      const u = this.ash.uniforms;
      if (u.uOpacity) u.uOpacity.value = 0.7 * g.opacity;
      if (u.uGlow) u.uGlow.value = 0.4 * g.glow;
      if (u.uGravity) u.uGravity.value.set(0, -0.8, 0);
      if (u.uTurbulence) u.uTurbulence.value = 0.6 * g.turbulence;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const L = this._L;
    const R = c.zoneRadius;
    if (!this._calm) this._clock += dt * g.animationSpeed;
    const clock = this._clock;
    const T = this._since();
    const ticks = this._ticks();
    const fadeT = this.phase === 'fade' ? clamp(this.fadeTime / this.fadeDuration) : 0;
    const fold = Easing.inCubic(fadeT);
    const sinceTick = T - this._lastTick;
    const flash = this._ticksDone > 0 ? Math.exp(-Math.max(0, sinceTick) * 6) : 0;
    const sinceCall = this._called ? T - this._calledAt : -1;
    const fed = this._consumedCount > 0 ? 1 : 0.45;
    const swallow = sinceCall >= 0 ? Math.exp(-sinceCall * 3.2) * fed : 0;

    /* 0 · the writ */
    const charge = clamp(this.age / Math.max(0.01, c.chargeTime * L));
    const slot = this._landed ? clamp(T / Math.max(0.05, c.riseTime * L)) : 0;
    this.writ.visible = !this._landed || slot < 1;
    if (this.writ.visible) {
      this._writPoint(_p);
      const grown = this.phase === 'travel' ? Easing.outBack(charge) : 1;
      const size = c.writSize * Math.max(0.001, grown);
      if (this.phase === 'travel' && this.u <= 0) {
        // Minting: spin on its edge at the hand.
        _obj.rotation.set(0, this.age * 9, 0);
      } else if (this.phase === 'travel') {
        // End over end about the side axis.
        _obj.rotation.set(0, Math.atan2(this.direction.x, this.direction.z), 0);
        _obj.rotateX(this.u * c.writFlips * TAU);
      } else {
        // Slotting into the floor.
        _obj.rotation.set(0, Math.atan2(this.direction.x, this.direction.z), 0);
        _p.y -= slot * c.writSize * 0.9;
      }
      _obj.position.copy(_p);
      _obj.scale.setScalar(size);
      _obj.updateMatrix();
      this.writ.setMatrixAt(0, _obj.matrix);
      this.writ.instanceMatrix.needsUpdate = true;
      this.writAttr.array[0] = this.phase === 'travel' ? 0.4 + 0.6 * charge : 1;
      this.writAttr.array[1] = this._landed ? slot : 0;
      this.writAttr.needsUpdate = true;
    }
    this._coinState.fade = 1 - fadeT;
    this._coinState.glow = c.coinGlow * (this.phase === 'travel' ? c.writGlow / Math.max(0.01, c.coinGlow) : 1);
    this.coinMat.userData.sync(this._coinState);

    /* 4 · the field — telegraph while the writ is in the air */
    const fieldR = R * c.fieldSeat;
    this.root.position.copy(this._landed ? this._centre : this.position);
    this.root.position.y = 0;
    if (!this._landed) {
      // The ledger is written on the target before the writ arrives.
      this.root.position.copy(this.origin).addScaledVector(this.direction, this.length);
      this.root.visible = true;
    }
    this.field.scale.set(fieldR * 2, fieldR * 2, 1);

    /* 1 · the well's shape: rise, breathe, clench, fold */
    const rise = slot;
    const radial = Easing.outCubic(rise);
    const lift = Easing.outCubic(rise) + c.riseOvershoot * Math.sin(Math.PI * rise);
    const breathe = 1 + 0.035 * flash;
    let clench = 0;
    if (sinceCall >= 0) {
      const t = sinceCall;
      clench = c.swallowSquash * fed * (t < 0.12 ? t / 0.12 : Math.exp(-(t - 0.12) * 3.5) * Math.cos((t - 0.12) * 14));
    }
    const grow = radial * (1 - fold);
    const s = this._shape;
    const throat = Math.max(0.12, c.throatRadius);
    s.throat = throat;
    s.rim = throat + (R * c.rimSeat * breathe * (1 - clench) - throat) * grow;
    s.foot = throat * 1.2 + (R * c.footSeat * (1 - clench * 0.5) - throat * 1.2) * grow;
    s.lip = Math.max(0.02, c.lipRadius * Math.min(1, grow * 1.5));
    s.height = Math.max(s.lip * 2 + 0.02, c.rimHeight * lift * (1 - fold) * (1 + clench * 0.8));
    s.throatY = c.throatHeight * Math.min(1, grow * 2);
    s.curve = c.wellCurve;
    if (s.rim < s.throat + s.lip + 0.05) s.rim = s.throat + s.lip + 0.05;
    if (s.foot > s.rim) s.foot = s.rim;
    const showWell = this._landed && grow > 0.003;
    this.spinner.visible = showWell;
    this.coins.visible = showWell;
    if (showWell) writeWell(this.wellGeo, s);
    this.spinner.position.y = -c.rimHeight * 0.6 * fold;

    // Ratchet: thresholds on the one clock, each snap an outBack.
    let yaw = clock * c.spinSpeed;
    for (let k = 0; k < this._ticksDone; k++) {
      const t = clamp((T - this._tickTime(k)) / Math.max(0.02, c.ratchetTime * L));
      yaw += c.ratchetAngle * (this._calm ? t : Easing.outBack(t));
    }
    if (sinceCall >= 0) yaw += c.ratchetAngle * 1.5 * Easing.outCubic(clamp(sinceCall / 0.5));
    this.spinner.rotation.y = -yaw;

    const ws = this._wellState;
    ws.clock = clock;
    ws.levied = this._ticksDone;
    ws.ticks = ticks;
    ws.flash = flash;
    ws.swallow = swallow;
    ws.fade = 1 - fadeT * 0.6;
    this.wellMat.userData.sync(ws);

    // Fins hug the outer wall, tilted to its flare.
    const finN = Math.max(0, Math.min(MAX_FINS, Math.round(c.finCount)));
    const outerR = s.rim + s.lip;
    const top = s.height - s.lip;
    const alpha = Math.atan2(outerR - s.foot, top + 0.06);
    const wall = Math.hypot(outerR - s.foot, top + 0.06);
    for (let i = 0; i < finN; i++) {
      const a = (i / Math.max(1, finN)) * TAU;
      _obj.position.set(Math.cos(a) * s.foot * 0.985, -0.06, Math.sin(a) * s.foot * 0.985);
      _obj.rotation.set(0, -a, -alpha);
      _obj.scale.set(c.finReach * grow + 0.001, wall * c.finHeight + 0.001, 1);
      _obj.updateMatrix();
      this.fins.setMatrixAt(i, _obj.matrix);
    }
    this.fins.count = finN;
    this.fins.instanceMatrix.needsUpdate = true;
    const fs = this._finState;
    fs.flash = flash;
    fs.fill = this._ticksDone / ticks;
    fs.fade = 1 - fadeT;
    this.finMat.userData.sync(fs);

    /* 2 · coins */
    if (showWell) this._placeCoins();
    else this.coins.count = 0;

    /* 4 · field */
    const fd = this._fieldState;
    fd.radius = fieldR;
    fd.rim = s.rim;
    fd.foot = Math.max(s.foot, R * c.footSeat * 0.6);
    fd.throat = throat;
    fd.front = this._landed ? Easing.outCubic(clamp(T / Math.max(0.05, c.riseTime * 1.4 * L))) : 0;
    fd.levied = this._ticksDone;
    fd.ticks = ticks;
    fd.flash = flash;
    fd.telegraph = this._landed ? 0 : smooth(this.u * 1.4 + charge * 0.3);
    fd.dissolve = clamp(fadeT / Math.max(0.05, c.dissolveTime));
    fd.clock = clock;
    fd.fade = 1;
    fd.swallow = swallow;
    this.fieldMat.userData.sync(fd);

    /* 3 · the vortex: gathers with the assessment, drained at the call */
    const assess = this._landed ? smooth((T - c.assessDelay * L * 0.3) / Math.max(0.1, (c.assessDelay + c.taxInterval) * L)) : 0;
    const drain = sinceCall >= 0 ? smooth(sinceCall / Math.max(0.1, c.consumeHold * L * 0.55)) : 0;
    this.vortex.visible = this._landed && assess > 0.01 && fadeT < 1;
    const vs = this._vortexState;
    vs.height = c.vortexHeight * (0.35 + 0.65 * assess);
    vs.base = throat * 0.85;
    vs.top = c.vortexTop * (0.4 + 0.6 * assess) * (1 + 0.08 * flash);
    vs.clock = clock;
    vs.drain = Math.max(drain, fold);
    vs.baseY = s.throatY * 0.5;
    vs.fade = assess * (1 - fadeT);
    this.vortexMat.userData.sync(vs);

    /* 7 · the lens */
    const ls = this._lensState;
    const wave = this._landed ? clamp(T / 0.55) : 0;
    ls.pinch = this._landed ? (0.25 + 0.75 * (this._ticksDone / ticks)) * (1 - fadeT) + swallow : 0;
    ls.shock = this._landed && wave < 1 ? 1 - wave : 0;
    ls.wave = Easing.outCubic(wave);
    ls.clock = clock;
    this.lens.visible = !this._calm && this._landed && (ls.pinch * c.lensPinch + ls.shock * c.lensShock) * g.distortion > 0.002;
    if (this.lens.visible) {
      this.lens.scale.set(R * 2.4, R * 2.4, 1);
      this.lensMat.userData.sync(ls);
    }

    // Exit: the scar outlives the cast.
    if (this.phase === 'fade' && !this._scarred) {
      this._scarred = true;
      _p.copy(this._centre).setY(0.04);
      this.ctx.decals?.spawn?.(DecalType.SCORCH, _p, {
        radius: R * c.footSeat, life: c.decalLife, intensity: 0.8,
        colorA: getColor(c.colorDeep), colorB: getColor(c.colorBody),
      });
    }

    this._syncParticles();
  }

  /** The void gutters while the throat feeds. */
  lightShimmer() {
    const f = this._called ? Math.exp(-Math.max(0, this._since() - this._calledAt) * 2) : 0;
    return 0.85 + 0.12 * Math.sin(this.age * 7.1) * Math.sin(this.age * 2.3) - 0.25 * f;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    for (const p of this._payers) {
      if (p.body && !p.gone) p.body.release?.();
      this._clearPayer(p);
    }
    for (const coin of this._coins) coin.used = false;
    this._scope = null;
    this._called = false;
    this._landed = false;
    this._ticksDone = 0;
    this.root.visible = false;
    this.writ.visible = false;
    this.lens.visible = false;
    this.vortex.visible = false;
    this.coins.count = 0;
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
  const folder = gui.addFolder('⊚  Existence Tax');

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 60, 0.5, 'writ flies at (m/s)');
  R(cast, c, 'zoneRadius', 1, 8, 0.05, 'assessed radius (m)');
  R(cast, c, 'lifetime', 0.5, 8, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'exitTime', 0.1, 3, 0.05, 'folds away over (s)');
  R(cast, c, 'cooldown', 0, 20, 0.05, 'cooldown');
  castAnim(cast, c);

  const tax = sub(folder, 'The assessment (gameplay)');
  R(tax, c, 'assessDelay', 0, 2, 0.01, 'first levy after landing (s)');
  R(tax, c, 'taxTicks', 1, 8, 1, 'assessments');
  R(tax, c, 'taxInterval', 0.1, 1.5, 0.01, 'between assessments (s)');
  R(tax, c, 'eligibleLevies', 1, 8, 1, 'levies to be eligible');
  R(tax, c, 'maxConsume', 0, MAX_CONSUME, 1, 'constructs consumed');
  R(tax, c, 'taxCorrode', 0, 0.5, 0.01, 'stain per levy');
  R(tax, c, 'taxStatus', 0, 3, 0.05, 'hollowed per levy');
  R(tax, c, 'taxDuration', 0.1, 8, 0.05, 'hollowed lasts (s)');
  R(tax, c, 'consumeDelay', 0, 1.5, 0.01, 'the call after the last levy (s)');
  R(tax, c, 'consumeHold', 0.2, 3, 0.05, 'consumed over (s)');
  R(tax, c, 'consumeDamage', 0, 10, 0.1, 'consumption damage');
  R(tax, c, 'hitImpulse', 0, 24, 0.1, 'inward knock');
  R(tax, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(tax, c, 'hitSpin', 0, 8, 0.05, 'tumble');
  R(tax, c, 'pullSpeed', 0, 12, 0.05, 'carried in at (m/s)');
  R(tax, c, 'pullSwirl', 0, 12, 0.05, 'carried round at (m/s)');
  R(tax, c, 'devour', 0.1, 6, 0.05, 'throat eats at (/s)');

  const light = sub(folder, 'Light');
  color(light, c, 'lightColor', 'colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'impactLight', 0, 30, 0.1, 'punch on landing');
  R(light, c, 'consumeLight', 0, 40, 0.1, 'punch at the swallow');

  const palette = sub(folder, 'Palette');
  color(palette, c, 'colorCore', 'core (white-violet)');
  color(palette, c, 'colorTint', 'tint');
  color(palette, c, 'colorBody', 'body');
  color(palette, c, 'colorDeep', 'deep');
  color(palette, c, 'corrodeColor', 'taxed stain');

  const writ = sub(folder, '0 · The writ');
  R(writ, c, 'chargeTime', 0.05, 1, 0.01, 'minted over (s)');
  R(writ, c, 'writSize', 0.2, 2, 0.01, 'diameter (m)');
  R(writ, c, 'writHeight', 0.5, 2.5, 0.01, 'held at (m)');
  R(writ, c, 'writArc', 0, 6, 0.05, 'lob height (m)');
  R(writ, c, 'writFlips', 0, 12, 0.5, 'flips in flight');
  R(writ, c, 'writGlow', 0, 6, 0.05, 'rim glow');

  const well = sub(folder, '1 · The well');
  R(well, c, 'rimSeat', 0.4, 1.3, 0.01, 'rim (× radius)');
  R(well, c, 'footSeat', 0.3, 1.2, 0.01, 'foot (× radius)');
  R(well, c, 'rimHeight', 0.3, 4, 0.01, 'lip height (m)');
  R(well, c, 'lipRadius', 0.03, 0.5, 0.005, 'lip thickness (m)');
  R(well, c, 'throatRadius', 0.12, 1.5, 0.01, 'throat (m)');
  R(well, c, 'throatHeight', 0, 0.6, 0.01, 'throat height (m)');
  R(well, c, 'wellCurve', 0.4, 3, 0.01, 'well steepness');
  R(well, c, 'riseTime', 0.05, 1.5, 0.01, 'tears up over (s)');
  R(well, c, 'riseOvershoot', 0, 0.6, 0.01, 'lip overshoot');
  R(well, c, 'spinSpeed', -2, 2, 0.01, 'turn (rad/s)');
  R(well, c, 'ratchetAngle', 0, 2, 0.01, 'ratchet per levy (rad)');
  R(well, c, 'ratchetTime', 0.02, 1, 0.01, 'ratchet settles over (s)');
  R(well, c, 'swallowSquash', 0, 0.4, 0.01, 'clench at the swallow');
  color(well, c, 'obsidianColor', 'obsidian');
  R(well, c, 'obsidianMetalness', 0, 1, 0.01, 'metalness');
  R(well, c, 'obsidianRoughness', 0, 1, 0.01, 'roughness');
  R(well, c, 'grooveArms', 1, 8, 1, 'groove arms');
  R(well, c, 'grooveTwist', 0, 8, 0.05, 'groove twist');
  R(well, c, 'grooveFlow', -3, 3, 0.05, 'groove flow');
  R(well, c, 'grooveGlow', 0, 6, 0.05, 'groove glow');
  R(well, c, 'ledgerGlow', 0, 8, 0.05, 'ledger glow');
  R(well, c, 'throatGlow', 0, 8, 0.05, 'throat lip glow');
  R(well, c, 'rimFresnel', 0, 4, 0.05, 'rim fresnel');
  R(well, c, 'finCount', 0, MAX_FINS, 1, 'ledger fins');
  R(well, c, 'finHeight', 0.2, 1.2, 0.01, 'fin height (× wall)');
  R(well, c, 'finReach', 0.05, 1.2, 0.01, 'fin reach (m)');

  const coins = sub(folder, '2 · The tithe coins');
  R(coins, c, 'coinSize', 0.1, 1.2, 0.01, 'diameter (m)');
  R(coins, c, 'coinsPerTick', 0, 12, 1, 'zone coins per levy');
  R(coins, c, 'coinFlight', 0.05, 1.5, 0.01, 'flight to the rim (s)');
  R(coins, c, 'coinArc', 0, 4, 0.05, 'flight arc (m)');
  R(coins, c, 'spiralTime', 0.2, 4, 0.05, 'rim → throat (s)');
  R(coins, c, 'spiralTurns', 0, 4, 0.05, 'turns down the well');
  R(coins, c, 'coinLean', -0.5, 1.2, 0.01, 'lean into the well (rad)');
  R(coins, c, 'coinGlow', 0, 6, 0.05, 'engraving glow');

  const vortex = sub(folder, '3 · The vortex');
  R(vortex, c, 'vortexHeight', 0.5, 10, 0.05, 'height (m)');
  R(vortex, c, 'vortexTop', 0.2, 4, 0.05, 'top radius (m)');
  R(vortex, c, 'vortexTwist', 0, 6, 0.05, 'twist');
  R(vortex, c, 'vortexFlow', -4, 4, 0.05, 'flow down');
  R(vortex, c, 'vortexOpacity', 0, 1, 0.01, 'opacity');
  R(vortex, c, 'vortexGlow', 0, 6, 0.05, 'seam glow');

  const field = sub(folder, '4 · The field');
  R(field, c, 'fieldSeat', 0.8, 2, 0.01, 'radius (× zone)');
  R(field, c, 'fieldDarkness', 0, 1, 0.01, 'darkness');
  R(field, c, 'fieldGlow', 0, 6, 0.05, 'veins & ledger glow');
  R(field, c, 'crackScale', 0.3, 6, 0.05, 'vein scale');
  R(field, c, 'telegraph', 0, 1, 0.01, 'telegraph strength');
  R(field, c, 'dissolveTime', 0.05, 1, 0.01, 'dissolves over (× exit)');
  R(field, c, 'decalLife', 0.5, 15, 0.1, 'scar lasts (s)');

  const fx = sub(folder, '5 · Particles');
  R(fx, c, 'moteRate', 0, 100, 1, 'motes (/s)');
  R(fx, c, 'moteSize', 0.01, 0.4, 0.005, 'mote size');
  R(fx, c, 'moteLife', 0.1, 4, 0.05, 'mote life');
  R(fx, c, 'moteSpeed', 0, 4, 0.05, 'mote speed');
  R(fx, c, 'sparkCount', 0, 64, 1, 'sparks per beat');
  R(fx, c, 'sparkSize', 0.01, 0.3, 0.005, 'spark size');
  R(fx, c, 'sparkLife', 0.05, 2, 0.01, 'spark life');
  R(fx, c, 'sparkSpeed', 0, 12, 0.1, 'spark speed');
  R(fx, c, 'ashRate', 0, 60, 1, 'ash (/s)');
  R(fx, c, 'ashSize', 0.05, 1.5, 0.01, 'ash size');
  R(fx, c, 'ashLife', 0.1, 4, 0.05, 'ash life');
  R(fx, c, 'chipCount', 0, 96, 1, 'fragments of the consumed');
  R(fx, c, 'chipSize', 0.02, 0.4, 0.005, 'fragment size');
  R(fx, c, 'chipLife', 0.1, 3, 0.05, 'fragment life');
  R(fx, c, 'particleGlow', 0, 6, 0.05, 'glow');
  gradient(fx, c, 'colorMote', 'particle gradient');

  const hit = sub(folder, '6 · Impact & swallow');
  R(hit, c, 'impactShake', 0, 1, 0.01, 'landing knock');
  R(hit, c, 'tickShake', 0, 0.5, 0.005, 'levy tick');
  R(hit, c, 'consumeShake', 0, 1, 0.01, 'swallow knock');
  R(hit, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(hit, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(hit, c, 'impactFlash', 0, 1, 0.01, 'landing flash');
  R(hit, c, 'consumeFlash', 0, 1, 0.01, 'swallow flash');
  R(hit, c, 'burstReach', 0, 2, 0.01, 'shell grows to (× radius)');
  R(hit, c, 'burstLife', 0.05, 2, 0.01, 'shell lives (s)');
  R(hit, c, 'burstOpacity', 0, 1, 0.01, 'shell opacity');

  const lens = sub(folder, '7 · The lens');
  R(lens, c, 'lensPinch', 0, 3, 0.01, 'throat pinch');
  R(lens, c, 'lensShock', 0, 3, 0.01, 'landing ring');

  return folder;
}
