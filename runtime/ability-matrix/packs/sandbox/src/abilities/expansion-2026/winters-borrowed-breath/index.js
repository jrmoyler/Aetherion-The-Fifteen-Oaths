import {
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
} from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { routeExpansionTransparency } from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { createPlateGeometry, createPlumeGeometry, createQuad, createRibbonGeometry } from './geometry.js';
import {
  createFieldMaterial,
  createIceMaterial,
  createLensMaterial,
  createPlumeMaterial,
  createRibbonMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
export const UID = 'matrix-expansion/winters-borrowed-breath';

const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const outCubic = (x) => 1 - Math.pow(1 - clamp01(x), 3);

/**
 * The carapace's rows, foot to crown. Counts fall with the circumference so
 * every plate is about as wide as it is long; the crown is left open (an
 * oculus) so the bodies hanging inside stay readable.
 */
const ROW_COUNTS = [22, 19, 16, 13, 9];
const ROWS = ROW_COUNTS.length;
/** Every lamella one cast can mint. Plates are minted in index order: foot row first. */
const MAX_PLATES = ROW_COUNTS.reduce((a, b) => a + b, 0);
/** Elevation of the lowest row's seat and the step between rows (radians). */
const ROW_BASE = 0.2;
const ROW_STEP = 0.255;
/** Bodies one cast can hold in its breath. */
const MAX_HELD = 12;
/** Enemies one strike (exhale or return) may affect. */
const MAX_TARGETS = 16;

/* Per-plate layout (constants of the design, not per-cast state). */
const PLATE_ROW = new Uint8Array(MAX_PLATES);
const PLATE_COL = new Float32Array(MAX_PLATES); // 0..1 round the row, staggered
const PLATE_SEED = new Float32Array(MAX_PLATES);
{
  let i = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let k = 0; k < ROW_COUNTS[r]; k++, i++) {
      PLATE_ROW[i] = r;
      PLATE_COL[i] = (k + (r % 2) * 0.5) / ROW_COUNTS[r];
      const h = Math.sin(i * 91.345 + 7.13) * 43758.5453;
      PLATE_SEED[i] = h - Math.floor(h);
    }
  }
}

/* Module-level scratch: nothing below allocates per frame. */
const _pos = new Vector3();
const _hand = new Vector3();
const _seat = new Vector3();
const _n = new Vector3();
const _up = new Vector3();
const _side = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();
const _s = new Vector3();
const UP = new Vector3(0, 1, 0);
/** Reused particle option bag (the engine destructures it, never retains it). */
const _emit = {
  position: null, radius: 0, direction: null, speed: 0, speedVariance: 0.35, spread: 0.5,
  anchor: null, size: 0.1, sizeVariance: 0.4, life: 1, lifeVariance: 0.3, spin: 0, time: 0,
};
/** The rime the breath leaves on a held body (colours refreshed from settings). */
const _rimeLook = { color: '#bfe8ff', rimColor: '#f4fbff', rimEmissive: 0.6, edgeColor: '#9fd8ff', edgeEmissive: 1.2 };

/**
 * WINTER'S BORROWED BREATH — Frost, zone cast. The second-wave frost castable;
 * the Unified Combat Spec's note is *velocity-to-armor*.
 *
 * Winter borrows a breath and pays it back as armour. The caster's hand
 * gathers cold — frost motes spiral into it and the breath's mouth swells —
 * then **exhales**: a coiling plume of frost vapour runs down the aimed line
 * and arcs onto the zone. It lands as a **gust**: a FROST shell, rime racing
 * out across the floor, a knock — and every standing enemy in the circle is
 * thrown up and out. Then winter **inhales**. The gust curls into a cyclone of
 * two breath ribbons wound round the zone, spinning hard — and decelerating,
 * and every metre-per-second it loses is minted into armour: faceted ice
 * lamellae peel off the ribbons, spiral in with the spin and lock into their
 * seats, foot row first, flashing white as each one seats, until a scaled
 * carapace of cut ice stands over the zone. The bodies the gust threw are
 * borrowed too: their flight is braked in mid-air, they hang rimed inside the
 * carapace, and the speed taken from them mints extra plates. The cyclone
 * stops; cracks run up the armour from the foot; and the breath is **given
 * back** — the carapace bursts outward, every plate thrown and tumbling to the
 * floor, the hanging bodies are flung, and every enemy inside is struck with a
 * blow scaled by how much armour the velocity bought. The plates dissolve, the
 * rime breaks up, and the floor is left cracked.
 *
 * ## Beats
 *
 *   - **anticipation** (`windup`) — motes spiral into the hand, the plume's
 *     mouth swells; the floor telegraphs the zone's edge.
 *   - **travel** — the plume runs down the line at `speed`, coiling.
 *   - **impact** — the gust: FROST shell + decal, chips, rime front, light
 *     punch, knock, flash; standing enemies thrown (the *exhale* hit).
 *   - **linger** — the cyclone decelerates over `inhaleTime` while plates fly
 *     in and seat; bodies hang; then `holdTime` of a complete carapace that
 *     breathes while cracks climb it.
 *   - **exit** (`exitTime`) — the return: plates burst out, tumble, fall,
 *     dissolve; CRACK + SHOCKWAVE decals, a second shell, the rime dissolves.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the plume** (`createPlumeMaterial`) — the exhale tube, coiled in the
 *      vertex shader, fbm vapour; its tail is drawn in after the gust.
 *   2. **the cyclone** (`createRibbonMaterial`) — two helical breath ribbons;
 *      streaks scroll at the *integrated* spin so the deceleration reads.
 *   3. **the carapace** (hero, `createIceMaterial` on authored faceted
 *      lamellae) — opaque lit ice on `LAYER.WORLD`, casting shadows; plate
 *      size, seat and row spacing are all derived from `zoneRadius` and
 *      `domeHeight` every frame, so the armour re-forms around a dragged radius.
 *   4. **the return** — plates thrown on ballistic arcs with tumble; a second
 *      FROST shell; CRACK + SHOCKWAVE decals.
 *   5. **the floor** (`createFieldMaterial`) — rime plates, hoarfrost, spiral
 *      breath streaks over a deep-blue stain, plus the engine's FROST decal.
 *   6. **particles** — cold vapour (SMOKE, swirling in), ice needles (STREAK,
 *      spiralling in at the cyclone's speed), ice chips (lit CHIP, at the gust
 *      and the return), frost motes at the hand (SOFT).
 *   7. **bursts, shake, flash, light** — on the gust and on the return.
 *   8. **the lens** (`createLensMaterial`, `LAYER.DISTORTION`) — cold swirl
 *      in proportion to the cyclone's speed; a pressure ring on the return.
 *
 * ## The rule (`handlesOwnHits`)
 *
 * Velocity → armour, bounded and deterministic. The cyclone's speed falls as
 * `(1 − τ)^1.3` over `inhaleTime`; the share it has lost × `breathArmor` ×
 * the plate count is minted. Each held body (any body down inside the zone,
 * up to `MAX_HELD`) has `brake` of its velocity taken per 1/60 s; the speed
 * taken accrues in the armour bank and every `velocityPerPlate` m/s mints a
 * further plate (never more than `MAX_PLATES`). Armour `A` = plates / max.
 * Hits: the exhale strikes each enemy inside `zoneRadius` once at the gust
 * (in live combat a frost hit also lays UCSM `chilled`); the return strikes each enemy
 * inside once more with force × (0.5 + A). Two strikes per enemy per cast,
 * each capped at `MAX_TARGETS`.
 *
 * ## The editor rule
 *
 * A cast records only events (when each plate was minted, whether it has
 * exhaled and returned), the integrated spin and the armour bank; every
 * dimension, colour, count and timing is read from settings every frame.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this.plates ? this.plates.count + this._heldCount : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get _life() {
    return Math.max(0.05, settings.global.lifetime);
  }

  get impactDuration() {
    const c = this.config;
    return Math.max(0.2, (c.inhaleTime + c.holdTime) * this._life);
  }

  get fadeDuration() {
    return Math.max(0.1, this.config.exitTime * this._life);
  }

  /** Hold the front at the hand while the breath gathers (anticipation). */
  advance(dt) {
    if (this.age < this.config.windup * this._life) {
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
    // The zone parts live under `root`, placed at the target every frame.
    this.root = new Group();
    this.group.add(this.root);
    const quad = own(createQuad());

    // 1 · the plume — lives in the caster's frame, not the zone's.
    this.plumeMat = own(createPlumeMaterial());
    this.plume = new Mesh(own(createPlumeGeometry()), this.plumeMat);
    this.plume.frustumCulled = false;
    this.plume.renderOrder = 6;
    this.group.add(this.plume);

    // 5 · the floor
    this.fieldMat = own(createFieldMaterial());
    this.field = new Mesh(quad, this.fieldMat);
    this.field.rotation.x = -Math.PI / 2;
    this.field.position.y = 0.03;
    this.field.renderOrder = 2;
    this.root.add(this.field);

    // 2 · the cyclone
    this.ribbonMat = own(createRibbonMaterial());
    this.ribbon = new Mesh(own(createRibbonGeometry()), this.ribbonMat);
    this.ribbon.frustumCulled = false;
    this.ribbon.renderOrder = 7;
    this.root.add(this.ribbon);

    // 3 · the carapace — solid, lit, shadowing ice.
    this.iceMat = own(createIceMaterial());
    const plateGeometry = own(createPlateGeometry());
    this.plateState = new InstancedBufferAttribute(new Float32Array(MAX_PLATES * 3), 3);
    plateGeometry.setAttribute('aState', this.plateState);
    this.plates = new InstancedMesh(plateGeometry, this.iceMat, MAX_PLATES);
    this.plates.frustumCulled = false;
    this.plates.castShadow = true;
    this.plates.receiveShadow = false;
    this.plates.count = 0;
    this.plates.renderOrder = 3;
    this.root.add(this.plates);

    // 8 · the lens
    this.lensMat = own(createLensMaterial());
    this.lens = new Mesh(quad, this.lensMat);
    this.lens.rotation.x = -Math.PI / 2;
    this.lens.position.y = 0.4;
    this.lens.visible = false;
    this.root.add(this.lens);

    /** When each plate was minted (impact-phase seconds), −1 = not yet. Events only. */
    this._mintedAt = new Float32Array(MAX_PLATES).fill(-1);
    /** Bodies currently held in the breath. */
    this._held = new Array(MAX_HELD).fill(null);
    this._heldCount = 0;
    this._found = [];
    this._bodies = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._target = new Vector3();
    this._moteEmitter = new RateEmitter();
    this._vapourEmitter = new RateEmitter();
    this._needleEmitter = new RateEmitter();
    this._needleTurn = 0;
    // The current that holds a body: a slow orbit, drawn to `holdHeight`,
    // pulled back inside the zone. Bound once so carrying allocates nothing.
    this._field = (x, y, z, out) => {
      const c = this.config;
      const dx = x - this._target.x;
      const dz = z - this._target.z;
      const r = Math.hypot(dx, dz) || 1e-4;
      const tip = this._omega * r * c.holdSwirl;
      const keep = Math.min(0, c.zoneRadius * 0.7 - r) * 1.6;
      out.set((-dz / r) * tip + (dx / r) * keep, (c.holdHeight - y) * 2.2, (dx / r) * tip + (dz / r) * keep);
      return out;
    };

    this._plumeState = { length: 1, endY: 0.6, head: 0, tail: 0, clock: 0, fade: 1, swell: 0 };
    this._ribbonState = { r0: 1, r1: 0.4, top: 2, phase: 0, clock: 0, speed: 1, fade: 0 };
    this._iceState = { dissolve: 0 };
    this._fieldState = { grow: 0, zone: 0.8, telegraph: 0, spin: 0, speed: 0, armor: 0, ret: -1, dissolve: 0, fade: 1 };
    this._lensState = { swirl: 0, shock: 0, wave: 0, clock: 0 };

    routeExpansionTransparency(this.group);
    this.plates.layers.set(LAYER.WORLD);
    this.lens.layers.set(LAYER.DISTORTION);
    this._disposed = false;
  }

  createParticles() {
    const get = (name, opts) => this.ctx.particles?.get?.(`${ID}.${name}`, opts) ?? null;
    this.vapour = get('vapour', { capacity: 600, shape: ParticleShape.SMOKE, additive: true, swirl: true, curl: true, softFade: 0.5 });
    this.needles = get('needles', { capacity: 600, shape: ParticleShape.STREAK, additive: true, stretch: true, softFade: 0.3 });
    this.chips = get('chips', { capacity: 400, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.2 });
    this.motes = get('motes', { capacity: 300, shape: ParticleShape.SOFT, additive: true, swirl: true, softFade: 0.4 });
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this._exhaled = false;
    this._returned = false;
    this._phase = 0;
    this._omega = 0;
    this._clock = 0;
    this._armorBank = 0;
    this._minted = 0;
    this._armor = 0;
    this._exhaleHits = 0;
    this._returnHits = 0;
    this._mintedAt.fill(-1);
    this._releaseHeld();
    this._moteEmitter.reset();
    this._vapourEmitter.reset();
    this._needleEmitter.reset();
    this._needleTurn = 0;
    this._calm = prefersReducedMotion();
    this.pointAt(1, this._target);
    this.plates.count = 0;
    this.root.visible = true;
    this.plume.visible = true;
    this._sync(0);
  }

  onTravel(dt) {
    this._sync(dt);
  }

  onImpact() {
    this.position.y = 0;
    this._exhaled = true;
    this._exhale();
    this._sync(0);
  }

  onFade(dt) {
    if (this.phase === 'fade' && !this._returned) {
      this._returned = true;
      this._return();
    }
    if (this.phase === 'impact') this._inhale(dt);
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The rule                                                            */
  /* ------------------------------------------------------------------ */

  /** 0..1 velocity left in the cyclone. */
  _speedLeft() {
    if (!this._exhaled) return 1;
    const tau = clamp01(this.impactTime / Math.max(0.05, this.config.inhaleTime * this._life));
    return Math.pow(1 - tau, 1.3);
  }

  /** The gust: throw every standing enemy in the zone up and out, once. */
  _exhale() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const r = c.zoneRadius;
    this._strike(impactForce(c, power), 'exhale', 1);
    _pos.copy(this._target).setY(0.05);
    this.ctx.bursts?.spawn?.(BurstMode.FROST, _pos, {
      radius: r * 0.1, endRadius: r * c.burstReach, life: c.burstLife, intensity: c.burstIntensity,
      opacity: c.burstOpacity * g.opacity, fresnel: c.burstFresnel * g.fresnel, squash: c.burstSquash,
      colorA: getColor(c.colorBurstA), colorB: getColor(c.colorBurstB), colorC: getColor(c.colorBurstC),
    });
    this.ctx.decals?.spawn?.(DecalType.FROST, _pos, {
      radius: r * 1.1, life: c.frostDecalLife * this._life, intensity: c.frostDecalIntensity,
      colorA: getColor(c.tintColor), colorB: getColor(c.deepColor),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: r * 1.05, life: 0.6, width: c.shockwaveWidth, intensity: c.shockwaveIntensity,
      colorA: getColor(c.coreColor), colorB: getColor(c.bodyColor),
    });
    this._chipBurst(_pos.setY(0.3), r * 0.3, 0.55, c.chipCount * 0.6);
    this.lightBoost = c.impactLight * power;
    if (c.impactShake > 0) this.ctx.shake?.add?.(c.impactShake * power * g.cameraShake, c.shakeDecay, c.shakeFrequency);
    if (c.impactFlash > 0) this.ctx.flash?.trigger?.(getColor(c.tintColor), c.impactFlash * power);
  }

  /** The return: release the held, burst the armour, strike with force × (0.5 + A). */
  _return() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const r = c.zoneRadius;
    const scale = (0.5 + this._armor) * power;
    this._force.impulse = Math.min(24, c.returnImpulse * scale);
    this._force.lift = Math.min(20, c.returnLift * scale);
    this._force.spin = Math.min(8, c.returnSpin);
    // Bodies already down are thrown by hand; standing enemies through the strike.
    for (let i = 0; i < MAX_HELD; i++) {
      const body = this._held[i];
      if (!body) continue;
      body.release?.();
      const at = body.bodyPoint?.(_pos);
      if (at) {
        _dir.set(at.x - this._target.x, 0, at.z - this._target.z);
        if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
        _dir.normalize();
        body.shove?.(_dir.x * this._force.impulse * 0.7, this._force.lift * 0.5, _dir.z * this._force.impulse * 0.7);
      }
      this._held[i] = null;
    }
    this._heldCount = 0;
    this._strike(this._force, 'return', 1 + this._armor);

    _pos.copy(this._target).setY(0.05);
    this.ctx.bursts?.spawn?.(BurstMode.FROST, _pos, {
      radius: r * 0.3, endRadius: r * c.burstReach * 1.3, life: c.burstLife * 1.2, intensity: c.burstIntensity * (0.6 + this._armor),
      opacity: c.burstOpacity * g.opacity, fresnel: c.burstFresnel * g.fresnel, squash: c.burstSquash * 1.2,
      colorA: getColor(c.colorBurstA), colorB: getColor(c.colorBurstB), colorC: getColor(c.colorBurstC),
    });
    this.ctx.decals?.spawn?.(DecalType.CRACK, _pos, {
      radius: r * 1.05, life: c.crackDecalLife * this._life, intensity: c.crackDecalIntensity,
      colorA: getColor(c.tintColor), colorB: getColor(c.deepColor),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: r * 1.5, life: 0.7, width: c.shockwaveWidth * 1.3, intensity: c.shockwaveIntensity,
      colorA: getColor(c.coreColor), colorB: getColor(c.bodyColor),
    });
    // Chips thrown off the carapace all round.
    const H = r * c.domeHeight;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      _seat.set(this._target.x + Math.cos(a) * r * 0.85, H * 0.45, this._target.z + Math.sin(a) * r * 0.85);
      _dir.set(Math.cos(a), 0.55, Math.sin(a)).normalize();
      this._chipBurst(_seat, r * 0.25, 0.45, (c.chipCount * (0.5 + this._armor)) / 6, _dir);
    }
    this.lightBoost = c.returnLight * power;
    if (c.returnShake > 0) this.ctx.shake?.add?.(c.returnShake * power * g.cameraShake, c.shakeDecay, c.shakeFrequency);
    if (c.returnFlash > 0) this.ctx.flash?.trigger?.(getColor(c.coreColor), c.returnFlash * power);
  }

  /**
   * One bounded strike on every enemy inside the zone: through the combat
   * binding when present, else straight on the dummy field.
   */
  _strike(force, tag, intensity) {
    const c = this.config;
    const r = c.zoneRadius;
    let struck = 0;
    if (this._scope) {
      const source = [this._target.x, 0, this._target.z];
      const found = this._scope.queryActors({ position: source, radius: r, relation: 'enemy' });
      if (!found.ok) {
        this.failure = found.reason;
        return 0;
      }
      const actors = found.actors;
      for (let i = 0; i < actors.length && i < MAX_TARGETS; i++) {
        const actor = actors[i];
        const sent = this._scope.emit({
          type: 'hit', element: 'frost', targetIds: [actor.id], position: actor.position, sourcePosition: source,
          damage: 1, hitForce: force, intensity: Math.min(2, intensity), tags: ['winters-borrowed-breath', tag],
        });
        if (!sent.ok) this.failure = sent.reason;
        else struck++;
      }
    } else {
      const field = this.ctx.dummies;
      if (field?.findTargets) {
        const found = field.findTargets(this._target.x, this._target.z, r, this._found);
        for (let i = 0; i < found.length; i++) {
          const dummy = found[i];
          _dir.set(dummy.position.x - this._target.x, 0, dummy.position.z - this._target.z);
          if (_dir.lengthSq() > r * r) continue;
          if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction);
          else _dir.normalize();
          if (dummy.kill(_dir.x, _dir.z, force) && ++struck >= MAX_TARGETS) break;
        }
      }
    }
    if (tag === 'exhale') this._exhaleHits += struck;
    else this._returnHits += struck;
    return struck;
  }

  /** Winter inhales: brake held bodies, bank the speed, mint plates. */
  _inhale(dt) {
    const c = this.config;
    const v = this._speedLeft();
    this._omega = c.vortexSpin * v;
    const field = this.ctx.dummies;
    if (field?.findBodies && dt > 0) {
      const bodies = field.findBodies(this._target.x, this._target.z, c.zoneRadius * 1.15, this._bodies);
      for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        if (body.alive || body.state === 'frozen' || body.state === 'gone') continue;
        if (this._held.includes(body)) continue;
        const slot = this._held.indexOf(null);
        if (slot < 0) break;
        this._held[slot] = body;
        this._heldCount++;
      }
      const grab = 1 - Math.pow(1 - clamp01(c.brake), dt * 60);
      _rimeLook.color = c.tintColor;
      _rimeLook.rimColor = c.coreColor;
      _rimeLook.edgeColor = c.bodyColor;
      const stain = clamp01(c.frostStain) * clamp01(this.impactTime / Math.max(0.05, c.inhaleTime * this._life));
      const cap = c.velocityPerPlate * MAX_PLATES;
      for (let i = 0; i < MAX_HELD; i++) {
        const body = this._held[i];
        if (!body) continue;
        const velocity = body.bodyVelocity?.(_vel);
        const point = body.bodyPoint?.(_pos);
        if (!velocity || !point) continue;
        // Speed above the holding current is what winter takes.
        const before = velocity.length();
        this._field(point.x, point.y, point.z, _seat);
        const stolen = Math.max(0, before - _seat.length()) * grab;
        this._armorBank = Math.min(cap, this._armorBank + stolen);
        body.carry?.(this._field, grab, grab, 1);
        body.hold?.();
        body.corrode?.(stain, _rimeLook);
      }
    }
    // Mint: the cyclone's own lost speed plus the speed borrowed from bodies.
    const fromBreath = Math.floor(clamp01(c.breathArmor) * MAX_PLATES * (1 - v));
    const fromBodies = Math.floor(this._armorBank / Math.max(0.05, c.velocityPerPlate));
    const minted = Math.min(MAX_PLATES, fromBreath + fromBodies);
    for (let i = this._minted; i < minted; i++) this._mintedAt[i] = this.impactTime;
    if (minted > this._minted) this._minted = minted;
    this._armor = this._minted / MAX_PLATES;
  }

  _releaseHeld() {
    for (let i = 0; i < MAX_HELD; i++) {
      this._held[i]?.release?.();
      this._held[i] = null;
    }
    this._heldCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Particles                                                           */
  /* ------------------------------------------------------------------ */

  _syncSystem(sys, A, B, C, D, glow, drag, gravity, endSize) {
    if (!sys?.uniforms) return;
    const g = settings.global;
    sys.setGradient?.(getColor(A), getColor(B), getColor(C), getColor(D));
    const u = sys.uniforms;
    if (u.uGlow) u.uGlow.value = glow * g.glow;
    if (u.uOpacity) u.uOpacity.value = g.opacity;
    if (u.uTurbulence) u.uTurbulence.value = 0.5 * g.turbulence;
    if (u.uSizeScale) u.uSizeScale.value = g.particleSize;
    if (u.uSpeedScale) u.uSpeedScale.value = g.particleSpeed;
    if (u.uLifeScale) u.uLifeScale.value = g.particleLifetime;
    if (u.uDrag) u.uDrag.value = drag;
    if (u.uGravity) u.uGravity.value.set(0, gravity, 0);
    if (u.uEndSize) u.uEndSize.value = endSize;
  }

  _emitInto(sys, count, position, radius, direction, speed, spread, size, life, anchor = null) {
    if (!sys || count <= 0) return;
    const g = settings.global;
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = speed * g.particleSpeed;
    _emit.spread = spread;
    _emit.size = size * g.particleSize;
    _emit.life = life * g.particleLifetime;
    _emit.anchor = anchor;
    _emit.spin = 2;
    _emit.time = frame.uTime.value;
    sys.emit(Math.min(128, count), _emit);
  }

  _chipBurst(position, radius, spread, count, direction = UP) {
    const c = this.config;
    this._emitInto(this.chips, Math.round(count * settings.global.particleCount), position, radius, direction,
      c.chipSpeed, spread, c.chipSize, c.chipLife);
  }

  _particles(dt) {
    const c = this.config;
    const g = settings.global;
    const r = c.zoneRadius;
    const v = this._speedLeft();
    this._syncSystem(this.vapour, c.colorBreathA, c.colorBreathB, c.colorBreathC, c.colorBreathD, c.vapourGlow, 1.2, 0.15, 1.6);
    this._syncSystem(this.needles, c.colorBreathA, c.colorBreathB, c.colorBreathC, c.colorBreathD, c.needleGlow, 1.6, -0.5, 0.3);
    this._syncSystem(this.chips, c.colorIceA, c.colorIceB, c.colorIceC, c.colorIceD, 1, 0.6, -c.shatterGravity, 0.6);
    this._syncSystem(this.motes, c.colorBreathA, c.colorBreathB, c.colorBreathC, c.colorBreathD, 1.4, 1, 0, 0.2);
    // The swirling systems inhale: their orbit shrinks over each particle's life.
    if (this.vapour?.uniforms?.uSwirl) {
      this.vapour.uniforms.uSwirl.value = this._calm ? 0 : Math.max(0.6, this._omega * 0.55);
      this.vapour.uniforms.uSwirlExpand.value = -0.55;
    }
    if (this.motes?.uniforms?.uSwirl) {
      this.motes.uniforms.uSwirl.value = this._calm ? 0 : 7;
      this.motes.uniforms.uSwirlExpand.value = -0.9;
    }
    if (dt <= 0) return;
    const rate = g.particleCount * g.emissionRate;
    if (this.phase === 'travel' && this.age < c.windup * this._life) {
      // Anticipation: motes spiral into the hand.
      const n = this._moteEmitter.tick(dt, c.moteRate * rate);
      this._emitInto(this.motes, n, _hand, 0.55, UP, 0.05, 1, c.moteSize, 0.45, _hand);
    }
    if (this.phase === 'impact' && v > 0.02) {
      // The cyclone sheds vapour on its rim and drives needles inward.
      _seat.copy(this._target).setY(r * c.domeHeight * 0.45);
      const nv = this._vapourEmitter.tick(dt, c.vapourRate * v * rate);
      _pos.copy(this._target).setY(0.9);
      this._emitInto(this.vapour, nv, _pos, r * 0.95, UP, 0.25, 0.4, c.vapourSize, c.vapourLife, _seat);
      const nn = this._needleEmitter.tick(dt, c.needleRate * v * rate);
      if (nn > 0) {
        // Three emission points round the rim per batch, each aimed along the spin and inward.
        for (let k = 0; k < 3; k++) {
          const a = this._phase + (this._needleTurn++ * 2.399963) % TAU;
          _pos.set(this._target.x + Math.cos(a) * r * 1.05, 0.25 + (k * 0.6), this._target.z + Math.sin(a) * r * 1.05);
          _dir.set(-Math.sin(a) - Math.cos(a) * 0.6, 0.15, Math.cos(a) - Math.sin(a) * 0.6).normalize();
          this._emitInto(this.needles, Math.ceil(nn / 3), _pos, 0.3, _dir, c.needleSpeed * (0.4 + 0.6 * v), 0.25, c.needleSize, c.needleLife);
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const L = this._life;
    const r = c.zoneRadius;
    const H = r * c.domeHeight;
    const motion = this._calm ? 0.2 : 1;
    if (dt > 0) this._clock += dt * motion;
    const clock = this._clock;
    this.pointAt(1, this._target);
    this._target.y = 0;
    this.root.position.copy(this._target);
    _hand.copy(this.origin).addScaledVector(this.direction, 0.45).setY(c.plumeHeight);

    const travel = this.phase === 'travel';
    const windup = Math.max(0.01, c.windup * L);
    const gather = travel ? clamp01(this.age / windup) : 1;
    const inhaleT = Math.max(0.05, c.inhaleTime * L);
    const holdT = Math.max(0.01, c.holdTime * L);
    const tau = this._exhaled ? clamp01(this.impactTime / inhaleT) : 0;
    const v = this._speedLeft();
    if (this.phase !== 'impact') this._omega = this._exhaled ? 0 : c.vortexSpin;
    if (this._exhaled && dt > 0) this._phase += this._omega * dt * motion;
    const fadeT = this.phase === 'fade' ? clamp01(this.fadeTime / this.fadeDuration) : 0;
    const exitT = this.phase === 'fade' ? this.fadeTime : 0;
    const holdP = this._exhaled ? clamp01((this.impactTime - inhaleT) / holdT) : 0;

    // 1 · the plume: gathers at the hand, runs the line, is drawn in after.
    const ps = this._plumeState;
    ps.length = Math.max(0.5, this.length);
    ps.endY = 0.55;
    ps.swell = travel ? 1.4 * smooth(gather) : 0;
    ps.head = travel ? Math.max(0.03 * gather, this.u) : 1;
    ps.tail = this._exhaled ? smooth(this.impactTime / Math.max(0.05, c.plumeSwallow * L)) : 0;
    ps.clock = clock;
    ps.fade = this._exhaled ? 1 - ps.tail * 0.5 : 1;
    this.plume.visible = ps.tail < 0.999;
    if (this.plume.visible) {
      this.plume.position.set(this.origin.x, 0, this.origin.z);
      this.plume.rotation.set(0, Math.atan2(this.direction.x, this.direction.z), 0);
      this.plumeMat.userData.sync(ps);
    }

    // 5 · the floor
    const fieldR = r * Math.max(1, c.fieldScale);
    this.field.scale.set(fieldR * 2, fieldR * 2, 1);
    const fs = this._fieldState;
    fs.zone = r / fieldR;
    fs.telegraph = travel ? smooth(this.age / windup) : Math.max(0, 1 - this.impactTime / 0.35) * (this.phase === 'impact' ? 1 : 0);
    fs.grow = this._exhaled ? outCubic(this.impactTime / Math.max(0.05, c.fieldGrowTime * L)) : 0;
    if (this.phase === 'fade') fs.grow = 1;
    fs.spin = this._phase;
    fs.speed = this._exhaled ? v : 0;
    fs.armor = this._armor;
    fs.ret = this._returned && exitT < 0.6 * L ? exitT / (0.6 * L) : -1;
    const fd = Math.max(0.05, c.fieldDissolve);
    fs.dissolve = clamp01((fadeT - (1 - fd)) / fd);
    fs.fade = 1;
    this.fieldMat.userData.sync(fs);

    // 2 · the cyclone: unrolls at the gust, is drawn in as it slows, then thins out.
    const rs = this._ribbonState;
    const unroll = smooth(this.impactTime / 0.22);
    const drawIn = smooth(tau);
    rs.r0 = r * (0.3 + (c.vortexRadius - 0.3) * unroll + (c.vortexDraw - c.vortexRadius) * drawIn);
    rs.r1 = rs.r0 * 0.38;
    rs.top = H * c.vortexHeight;
    rs.phase = this._phase;
    rs.clock = clock;
    rs.speed = v;
    rs.fade = this.phase === 'impact' ? unroll * (0.2 + 0.8 * v) * (1 - holdP) : 0;
    this.ribbon.visible = rs.fade > 0.003;
    if (this.ribbon.visible) this.ribbonMat.userData.sync(rs);

    // 3 · the carapace
    this._syncPlates(r, H, inhaleT, holdP, exitT, fadeT, motion);

    // 8 · the lens
    const ls = this._lensState;
    ls.swirl = this.phase === 'impact' ? v * unroll : 0;
    const shockT = this._returned ? clamp01(exitT / Math.max(0.05, 0.55 * L)) : 1;
    ls.shock = this._returned ? 1 - shockT : 0;
    ls.wave = outCubic(shockT);
    ls.clock = clock;
    this.lens.visible = !this._calm && (ls.swirl * c.lensSwirl + ls.shock * c.lensShock) * g.distortion > 0.002;
    if (this.lens.visible) {
      this.lens.scale.set(r * 2.6, r * 2.6, 1);
      this.lensMat.userData.sync(ls);
    }

    this._particles(dt);
  }

  /** Place every minted lamella: in flight, seated, cracking, or thrown. */
  _syncPlates(r, H, inhaleT, holdP, exitT, fadeT, motion) {
    const c = this.config;
    const count = this._minted;
    this.plates.count = count;
    this.plates.visible = count > 0;
    const dd = Math.max(0.05, c.plateDissolve);
    this._iceState.dissolve = clamp01((fadeT - (1 - dd)) / dd);
    this.iceMat.userData.sync(this._iceState);
    if (!count) return;
    const flight = Math.max(0.02, c.plateFlight * this._life);
    const state = this.plateState.array;
    const ribbonR = this._ribbonState.r0;
    const breathe = this._calm ? 0 : c.plateBreathe;
    for (let i = 0; i < count; i++) {
      const row = PLATE_ROW[i];
      const seed = PLATE_SEED[i];
      const theta = ROW_BASE + row * ROW_STEP;
      const phi = PLATE_COL[i] * TAU;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      // Seat on the ellipsoid (R across, H tall) and its frame — all from settings.
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      _n.set((ct * cp) / r, st / H, (ct * sp) / r).normalize();
      _up.set(-r * st * cp, H * ct, -r * st * sp);
      const rowArc = _up.length() * ROW_STEP;
      _up.normalize();
      const width = ((TAU * r * ct) / ROW_COUNTS[row]) * c.plateOverlap;
      const length = rowArc * c.plateLength;
      const thick = c.plateThickness;
      // Upper rows sit a little proud so their feet lap over the heads below.
      _seat.set(r * ct * cp, H * st, r * ct * sp).addScaledVector(_n, thick * 0.55 * row).addScaledVector(_up, -length * 0.5);

      const since = this.impactTime - this._mintedAt[i];
      const f = this.phase === 'impact' ? clamp01(since / flight) : 1;
      const ef = outCubic(f);
      let size = 0.35 + 0.65 * ef;
      let flash = f < 1 ? 0.35 * f : Math.exp(-Math.max(0, since - flight) * 5);
      // Cracks climb the armour row by row while it holds; the return completes them.
      const crack = this._returned ? 1 : clamp01(holdP * 1.6 - row * 0.12 - seed * 0.2);

      if (f < 1) {
        // In flight: shed from the ribbon behind the plate's azimuth, spiralling in with the spin.
        const lag = (1 - ef) * 2.2 * motion;
        const a = phi - lag;
        const rr = ribbonR + (r * ct - ribbonR) * ef;
        const y = 0.3 + (H * st - 0.3) * ef + Math.sin(Math.PI * f) * 0.6;
        _pos.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
        _seat.add(_pos).sub(_s.set(r * ct * cp, H * st, r * ct * sp));
      } else if (!this._returned) {
        // Seated: the armour breathes in a wave round and up the carapace.
        size *= 1 + breathe * Math.sin(this.age * 5 - phi * 2 - row * 0.9);
      }

      _side.crossVectors(_up, _n).normalize();
      _m.makeBasis(_side, _up, _n);
      _q.setFromRotationMatrix(_m);
      if (f < 1) {
        _e.set((1 - ef) * (seed - 0.5) * 5, 0, (1 - ef) * (seed * 6 - 3));
        _q2.setFromEuler(_e);
        _q.multiply(_q2);
      }
      if (this._returned) {
        // The return: thrown out along the seat normal, up, and down to the floor, tumbling.
        const t = exitT;
        const out = c.shatterSpeed * (0.7 + 0.6 * seed);
        _dir.set(_n.x, 0, _n.z).normalize();
        _seat.addScaledVector(_dir, out * t);
        _seat.y += (c.shatterLift * (0.6 + 0.8 * seed)) * t - 0.5 * c.shatterGravity * t * t;
        if (_seat.y < 0.05) _seat.y = 0.05;
        _e.set(t * c.shatterSpin * (seed - 0.5) * 2, t * c.shatterSpin * 0.5 * seed, t * c.shatterSpin * (0.5 - seed));
        _q2.setFromEuler(_e);
        _q.multiply(_q2);
        size *= 1 - 0.35 * fadeT;
        flash = Math.max(0, 0.6 - exitT * 3);
      }
      _s.set(width * size, length * size, thick * size);
      _m.compose(_seat, _q, _s);
      this.plates.setMatrixAt(i, _m);
      state[i * 3] = seed;
      state[i * 3 + 1] = flash;
      state[i * 3 + 2] = crack;
    }
    this.plates.instanceMatrix.needsUpdate = true;
    this.plateState.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._releaseHeld();
    this._scope = null;
    this.root.visible = false;
    this.plume.visible = false;
    this.lens.visible = false;
    this.plates.count = 0;
    this._exhaled = false;
    this._returned = false;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._releaseHeld();
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
  const folder = gui.addFolder("❄  Winter's Borrowed Breath");

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'breath runs at (m/s)');
  R(cast, c, 'zoneRadius', 1, 8, 0.05, 'zone radius (m)');
  R(cast, c, 'lifetime', 0.5, 8, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'cooldown', 0, 20, 0.05, 'cooldown');
  R(cast, c, 'windup', 0, 1.2, 0.01, 'gathers for (s)');
  castAnim(cast, c);

  const rule = sub(folder, 'Velocity → armour');
  R(rule, c, 'hitImpulse', 0, 24, 0.1, 'gust impulse');
  R(rule, c, 'hitLift', 0, 20, 0.1, 'gust lift');
  R(rule, c, 'hitSpin', 0, 8, 0.05, 'gust tumble');
  R(rule, c, 'inhaleTime', 0.2, 4, 0.01, 'cyclone slows over (s)');
  R(rule, c, 'holdTime', 0, 3, 0.01, 'armour holds (s)');
  R(rule, c, 'exitTime', 0.1, 3, 0.01, 'return & exit (s)');
  R(rule, c, 'breathArmor', 0, 1, 0.01, 'plates from the spin');
  R(rule, c, 'velocityPerPlate', 0.1, 10, 0.05, 'm/s per borrowed plate');
  R(rule, c, 'brake', 0, 1, 0.005, 'brake per 1/60 s');
  R(rule, c, 'holdHeight', 0, 4, 0.05, 'bodies hang at (m)');
  R(rule, c, 'holdSwirl', 0, 2, 0.01, 'bodies orbit (× tip speed)');
  R(rule, c, 'frostStain', 0, 1, 0.01, 'rime on held bodies');
  R(rule, c, 'returnImpulse', 0, 24, 0.1, 'return impulse');
  R(rule, c, 'returnLift', 0, 20, 0.1, 'return lift');
  R(rule, c, 'returnSpin', 0, 8, 0.05, 'return tumble');

  const light = sub(folder, 'Light & palette');
  color(light, c, 'lightColor', 'light');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'impactLight', 0, 20, 0.1, 'punch at the gust');
  R(light, c, 'returnLight', 0, 20, 0.1, 'punch at the return');
  color(light, c, 'coreColor', 'core');
  color(light, c, 'tintColor', 'tint');
  color(light, c, 'bodyColor', 'body');
  color(light, c, 'deepColor', 'deep');

  const plume = sub(folder, '1 · The plume');
  R(plume, c, 'plumeMouth', 0.02, 1, 0.01, 'mouth radius (m)');
  R(plume, c, 'plumeHead', 0.05, 2, 0.01, 'head radius (m)');
  R(plume, c, 'plumeHeight', 0.3, 3, 0.01, 'leaves the hand at (m)');
  R(plume, c, 'plumeTwist', 0, 10, 0.1, 'coil turns');
  R(plume, c, 'plumeGlow', 0, 6, 0.05, 'glow');
  R(plume, c, 'plumeOpacity', 0, 1, 0.01, 'opacity');
  R(plume, c, 'plumeSwallow', 0.05, 2, 0.01, 'drawn in over (s)');

  const vortex = sub(folder, '2 · The cyclone');
  R(vortex, c, 'vortexSpin', 0, 30, 0.1, 'spin at the gust (rad/s)');
  R(vortex, c, 'vortexTurns', 0.5, 5, 0.05, 'turns');
  R(vortex, c, 'vortexRadius', 0.3, 2, 0.01, 'starts at (× radius)');
  R(vortex, c, 'vortexDraw', 0.1, 2, 0.01, 'drawn in to (× radius)');
  R(vortex, c, 'vortexHeight', 0.2, 3, 0.01, 'top (× carapace height)');
  R(vortex, c, 'vortexWidth', 0.05, 2, 0.01, 'band (m)');
  R(vortex, c, 'vortexGlow', 0, 6, 0.05, 'glow');
  R(vortex, c, 'vortexOpacity', 0, 1, 0.01, 'opacity');
  R(vortex, c, 'vortexStreaks', 0, 20, 0.5, 'streaks');
  R(vortex, c, 'vortexNoise', 0, 3, 0.05, 'erosion');

  const dome = sub(folder, '3 · The carapace');
  R(dome, c, 'domeHeight', 0.2, 1.6, 0.01, 'height (× radius)');
  R(dome, c, 'plateOverlap', 0.5, 2.5, 0.01, 'plate width (× share)');
  R(dome, c, 'plateLength', 0.5, 3, 0.01, 'plate length (× row)');
  R(dome, c, 'plateThickness', 0.01, 0.5, 0.005, 'thickness (m)');
  R(dome, c, 'plateFlight', 0.05, 1.5, 0.01, 'flies to its seat in (s)');
  R(dome, c, 'plateBreathe', 0, 0.2, 0.005, 'breathes by');
  R(dome, c, 'plateGlow', 0, 4, 0.05, 'inner frost');
  R(dome, c, 'plateFresnel', 0.2, 8, 0.05, 'rim power');
  R(dome, c, 'plateSpecular', 0, 4, 0.05, 'glint');
  R(dome, c, 'crackGlow', 0, 8, 0.05, 'cracks');
  R(dome, c, 'plateDissolve', 0.05, 1, 0.01, 'dissolves over (× exit)');
  color(dome, c, 'plateColor', 'ice');
  color(dome, c, 'plateDeep', 'ice depth');
  color(dome, c, 'plateRim', 'rim & glints');

  const ret = sub(folder, '4 · The return');
  R(ret, c, 'shatterSpeed', 0, 20, 0.1, 'thrown out (m/s)');
  R(ret, c, 'shatterLift', 0, 12, 0.1, 'thrown up (m/s)');
  R(ret, c, 'shatterGravity', 0, 30, 0.1, 'gravity');
  R(ret, c, 'shatterSpin', 0, 20, 0.1, 'tumble (rad/s)');

  const floor = sub(folder, '5 · The floor');
  R(floor, c, 'fieldScale', 1, 2, 0.01, 'rime radius (× zone)');
  R(floor, c, 'fieldGrowTime', 0.05, 2, 0.01, 'runs out in (s)');
  R(floor, c, 'fieldGlow', 0, 4, 0.05, 'glow');
  R(floor, c, 'fieldOpacity', 0, 1, 0.01, 'opacity');
  R(floor, c, 'fieldCrystals', 0.2, 4, 0.05, 'frost plates');
  R(floor, c, 'fieldStreaks', 0, 3, 0.05, 'breath streaks');
  R(floor, c, 'fieldDissolve', 0.05, 1, 0.01, 'dissolves over (× exit)');
  R(floor, c, 'frostDecalLife', 0.1, 8, 0.05, 'frost decal (s)');
  R(floor, c, 'frostDecalIntensity', 0, 3, 0.01, 'frost decal brightness');
  R(floor, c, 'crackDecalLife', 0.1, 8, 0.05, 'crack decal (s)');
  R(floor, c, 'crackDecalIntensity', 0, 3, 0.01, 'crack decal brightness');
  R(floor, c, 'shockwaveWidth', 0.01, 0.4, 0.005, 'shockwave width');
  R(floor, c, 'shockwaveIntensity', 0, 3, 0.01, 'shockwave brightness');

  const fx = sub(folder, '6 · Particles');
  R(fx, c, 'moteRate', 0, 200, 1, 'hand motes (/s)');
  R(fx, c, 'moteSize', 0.01, 0.4, 0.005, 'mote size');
  R(fx, c, 'vapourRate', 0, 200, 1, 'vapour (/s)');
  R(fx, c, 'vapourSize', 0.05, 2, 0.01, 'vapour size');
  R(fx, c, 'vapourLife', 0.1, 4, 0.01, 'vapour life (s)');
  R(fx, c, 'vapourGlow', 0, 4, 0.05, 'vapour glow');
  R(fx, c, 'needleRate', 0, 300, 1, 'needles (/s)');
  R(fx, c, 'needleSize', 0.01, 0.4, 0.005, 'needle size');
  R(fx, c, 'needleLife', 0.05, 3, 0.01, 'needle life (s)');
  R(fx, c, 'needleSpeed', 0, 20, 0.1, 'needle speed');
  R(fx, c, 'needleGlow', 0, 6, 0.05, 'needle glow');
  R(fx, c, 'chipCount', 0, 256, 1, 'chips');
  R(fx, c, 'chipSize', 0.01, 0.6, 0.005, 'chip size');
  R(fx, c, 'chipLife', 0.1, 4, 0.01, 'chip life (s)');
  R(fx, c, 'chipSpeed', 0, 20, 0.1, 'chip speed');
  gradient(fx, c, 'colorBreath', 'breath gradient');
  gradient(fx, c, 'colorIce', 'chip gradient');

  const burst = sub(folder, '7 · Bursts, shake, flash');
  R(burst, c, 'burstReach', 0, 2.5, 0.01, 'shell grows to (× radius)');
  R(burst, c, 'burstIntensity', 0, 3, 0.01, 'shell brightness');
  R(burst, c, 'burstLife', 0.05, 3, 0.01, 'shell lives (s)');
  R(burst, c, 'burstOpacity', 0, 1, 0.01, 'shell opacity');
  R(burst, c, 'burstFresnel', 0, 6, 0.05, 'shell rim');
  R(burst, c, 'burstSquash', 0.05, 1.5, 0.01, 'shell squash');
  color(burst, c, 'colorBurstA', 'shell inner');
  color(burst, c, 'colorBurstB', 'shell mid');
  color(burst, c, 'colorBurstC', 'shell outer');
  R(burst, c, 'impactShake', 0, 1, 0.01, 'gust knock');
  R(burst, c, 'returnShake', 0, 1, 0.01, 'return knock');
  R(burst, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(burst, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(burst, c, 'impactFlash', 0, 1, 0.01, 'gust flash');
  R(burst, c, 'returnFlash', 0, 1, 0.01, 'return flash');

  const lens = sub(folder, '8 · The lens');
  R(lens, c, 'lensSwirl', 0, 3, 0.01, 'cold swirl');
  R(lens, c, 'lensShock', 0, 3, 0.01, 'return pressure ring');

  return folder;
}
