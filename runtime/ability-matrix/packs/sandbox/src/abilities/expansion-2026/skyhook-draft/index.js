import { Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { routeExpansionTransparency, ParticleShape } from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { frame } from '../../../core/FrameUniforms.js';
import { LAYER } from '../../../core/Layers.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import { createBraidGeometry, createHookGeometry, createLaneQuad, createPlateGeometry, hookPoint } from './geometry.js';
import {
  createBraidMaterial,
  createHookCoreMaterial,
  createHookSheathMaterial,
  createLensMaterial,
  createScourMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
export const UID = 'matrix-expansion/skyhook-draft';

const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
/** Ribbons allocated per pool member. */
const MAX_RIBBONS = 12;
/** Floor plates allocated per pool member. */
const MAX_PLATES = 18;
/** Bodies one draft may catch (hits) and carry. */
const MAX_CAUGHT = 8;

const scratch = new Object3D();
const _up = new Vector3(0, 1, 0);
const _pos = new Vector3();
const _dir = new Vector3();
const _at = new Vector3();
const _tip = new Vector3();
/** Reused emit bag (ParticleSystem.emit destructures, never retains). */
const _emit = {
  position: _pos, radius: 0, direction: _dir, speed: 1, speedVariance: 0.35, spread: 0.3,
  inherit: null, anchor: null, size: 0.2, sizeVariance: 0.4, life: 1, lifeVariance: 0.3, spin: 0, tint: null, time: 0,
};
/** Per-plate dice: fixed hashes of the plate index (no state, no allocation). */
const hash = (i, k) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * SKYHOOK DRAFT — Wind, line cast. *The navigable draft.*
 *
 * A current with a heading and a destination, rather than one more gust.
 *
 *  1. **Anticipation** (`windup`): air coils at the hand into a small hook of
 *     wind — the crook *draws itself* from foot to barb while streaks are
 *     sucked in round it and the braid knots at the caster's feet.
 *  2. **Travel**: the seed hook is thrown and rides the front of the draft
 *     down the line, low over the floor; behind it the braid of streamlines
 *     is laid along the lane and the floor is combed dark, dust kicked up at
 *     the front.
 *  3. **Impact**: at the end of the line the seed dives into the floor and the
 *     **Skyhook** erupts out of it — a four-metre shepherd's crook of storm
 *     air whose curl bends back over the lane. AIR shell, dust ring and shock
 *     decals, floor plates heaved up, flash, camera knock, light punch, and
 *     everything standing in the lane is knocked off its feet *downstream*.
 *  4. **Linger** (`draftTime`): the draft *navigates*. The braid converges
 *     and winds up the stem; the floor vortex turns at the hook's foot; torn
 *     plates orbit and climb; and every downed body in the lane — the ones it
 *     struck and any already lying there — is drawn onto the centreline,
 *     conveyed to the hook and hoisted up the stem onto the curl. Meanwhile
 *     the whole hook *climbs into the sky* (`hookHoist`) with its catch
 *     swinging under the barb.
 *  5. **Exit** (`exitTime`): the hook unravels from the foot up along a
 *     burning edge, lets go of what it holds, the plates drop back into the
 *     floor, the braid and the scour dissolve.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the skyhook** — `createHookCoreMaterial` (additive streamlines,
 *      fresnel, growth head, unravel burn) over `createHookSheathMaterial`
 *      (normal-blended, sun-lit storm dust: the mass that reads on the dark
 *      floor). Both on one parameter-space tube; the crook is *built in the
 *      vertex shader* from the live settings, its curl radius derived from
 *      the lane width so the barb always hangs over the lane.
 *   2. **the draft** — `createBraidMaterial`: up to 12 ribbons placed in the
 *      vertex shader along the lane, converging and winding up the stem.
 *   3. **the scour** — `createScourMaterial`: dark combed groove, chevrons,
 *      and the foot's vortex, written onto the floor for the linger.
 *   4. **torn plates** — lit solid rock (`MeshStandardMaterial`, world layer,
 *      casting shadows), 18 instanced bevelled slabs heaved out of the floor.
 *   5. **particles** — SMOKE dust down the lane, STREAK air streaming down the
 *      lane and up the stem, lit CHIP grit thrown and drawn up.
 *   6. **the eruption** — AIR shell, DUSTRING + SHOCKWAVE decals, flash,
 *      knock, light punch.
 *   7. **the lens** — `createLensMaterial` on `LAYER.DISTORTION`: the draft
 *      shimmering downstream, a pressure ring at the eruption.
 *
 * ## Gameplay (`handlesOwnHits`)
 *
 * At the eruption, every enemy inside the lane (a capsule `laneWidth` wide
 * from the caster to the hook's foot) is caught — at most `maxCaught`, those
 * nearest the hook first — and struck exactly once, knocked downstream.
 * Through the combat binding that is one attributed `hit` per enemy plus a
 * `buffeted` status for the draft's duration when combat is live; without a
 * binding it is `dummy.kill`. Then, for the linger only, the draft carries
 * every downed body in the lane (bounded to the same cap) with
 * `dummy.carry`: downstream at `draftSpeed`, onto the centreline, held
 * `draftRise` up, and once within `catchRadius` of the stem, hoisted onto the
 * barb. Everything carried is released when the hook unravels.
 *
 * ## The editor rule
 *
 * A cast keeps only its clocks, whether it erupted, and who it holds; every
 * dimension, colour, count and timing is read from `settings.skyhookDraft`
 * every frame.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return MAX_PLATES + MAX_RIBBONS + 2;
  }

  /* ------------------------------------------------------------------ */
  /* Timing (× global lifetime)                                          */
  /* ------------------------------------------------------------------ */

  get _windup() {
    return Math.max(0, this.config.windup) * settings.global.lifetime;
  }

  get _rise() {
    return Math.max(0.05, this.config.hookRise) * settings.global.lifetime;
  }

  /** The eruption plus the draft — the linger. */
  get impactDuration() {
    const c = this.config;
    return Math.max(0.3, (Math.max(0.05, c.hookRise) + Math.max(0.2, c.draftTime)) * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.15, this.config.exitTime * settings.global.lifetime);
  }

  /**
   * The front waits at the hand for the windup, then runs at `speed`. Same
   * contract as the base `advance` (true on the frame it reaches the end).
   */
  advance(dt) {
    const w = this._windup;
    if (this.age < w) {
      this.front = 0;
      this.u = 0;
      this.pointAt(0, this.position);
      return false;
    }
    const speed = this.config.speed * settings.global.speed;
    const easeIn = Easing.outQuad(clamp((this.age - w) / 0.08));
    this.front += speed * easeIn * dt;
    const previous = this.u;
    this.u = clamp(this.front / this.length);
    this.pointAt(this.u, this.position);
    return this.u >= 1 && previous < 1;
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
    // The root carries the lane frame: local +x downstream, +z the cast's side.
    this.root = new Group();
    this.group.add(this.root);
    const lane = own(createLaneQuad());

    // 3 · the scour
    this.scourMat = own(createScourMaterial());
    this.scour = new Mesh(lane, this.scourMat);
    this.scour.position.y = 0.03;
    this.scour.renderOrder = 2;
    this.scour.frustumCulled = false;
    this.root.add(this.scour);

    // 2 · the draft
    this.braidMat = own(createBraidMaterial());
    this.braid = new Mesh(own(createBraidGeometry(MAX_RIBBONS)), this.braidMat);
    this.braid.frustumCulled = false;
    this.braid.renderOrder = 6;
    this.root.add(this.braid);

    // 1 · the skyhook: a pivot at the stem's foot (moved to the front while
    // it travels), the sheath drawn before the core.
    this.hook = new Group();
    this.root.add(this.hook);
    const tube = own(createHookGeometry());
    this.sheathMat = own(createHookSheathMaterial());
    this.sheath = new Mesh(tube, this.sheathMat);
    this.sheath.frustumCulled = false;
    this.sheath.renderOrder = 4;
    this.hook.add(this.sheath);
    this.coreMat = own(createHookCoreMaterial());
    this.core = new Mesh(tube, this.coreMat);
    this.core.frustumCulled = false;
    this.core.renderOrder = 5;
    this.hook.add(this.core);

    // 4 · torn plates — solid, lit, shadowed (world layer).
    this.plateMat = own(new MeshStandardMaterial({ color: 0x4b5866, roughness: 0.88, metalness: 0.05, flatShading: true }));
    this.plates = new InstancedMesh(own(createPlateGeometry()), this.plateMat, MAX_PLATES);
    this.plates.castShadow = true;
    this.plates.receiveShadow = true;
    this.plates.frustumCulled = false;
    this.root.add(this.plates);

    // 7 · the lens
    this.lensMat = own(createLensMaterial());
    this.lens = new Mesh(lane, this.lensMat);
    this.lens.position.y = 0.4;
    this.lens.frustumCulled = false;
    this.lens.visible = false;
    this.root.add(this.lens);

    routeExpansionTransparency(this.group);
    this.plates.layers.set(LAYER.WORLD);
    this.lens.layers.set(LAYER.DISTORTION);

    // Per-frame state bags (reused, never reallocated).
    this._hookState = { height: 4, curl: 1, drop: 0.7, bow: 0.2, wobble: 1, clock: 0, grow: 1, unravel: 0, fade: 1 };
    this._hookParams = { height: 4, curl: 1, drop: 0.7, bow: 0.2 };
    this._braidState = { length: 10, reach: 0, travel: 1, clock: 0, hoist: 0, climb: 0, fade: 1, dissolve: 0, capacity: MAX_RIBBONS };
    this._scourState = { start: -0.6, span: 12, width: 6, length: 10, reach: 0, clock: 0, erupt: 0, fade: 1, dissolve: 0 };
    this._lensState = { start: -0.6, span: 12, width: 6, length: 10, reach: 0, clock: 0, strength: 0, shock: 0, wave: 0 };

    // The draft's hold on bodies: fixed slots, cleared in place.
    this._slots = [];
    for (let i = 0; i < MAX_CAUGHT; i++) this._slots.push({ dummy: null, time: 0, hoisted: false });
    this._held = 0;
    this._found = [];
    this._bodies = [];
    this._mode = 0;
    this._hang = new Vector3();
    this._foot = new Vector3();
    this._field = (x, y, z, out) => this._sampleDraft(x, y, z, out);
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._clock = 0;
    this._calm = false;
    this._disposed = false;
  }

  createParticles() {
    const p = this.ctx.particles;
    this.dust = p?.get?.('skyhookDraft.dust', { capacity: 320, shape: ParticleShape.SMOKE, additive: false, curl: true, softFade: 0.5 }) ?? null;
    this.streaks = p?.get?.('skyhookDraft.streak', { capacity: 420, shape: ParticleShape.STREAK, additive: true, stretch: true }) ?? null;
    this.grit = p?.get?.('skyhookDraft.grit', { capacity: 200, shape: ParticleShape.CHIP, additive: false, lit: true }) ?? null;
    this._gatherRate = new RateEmitter();
    this._frontRate = new RateEmitter();
    this._dustRate = new RateEmitter();
    this._streakRate = new RateEmitter();
    this._debrisRate = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this.statusFailure = null;
    this.hits = 0;
    this._erupted = false;
    this._letGo = false;
    this._clock = 0;
    this._calm = prefersReducedMotion();
    this._dropAll(false);
    this._gatherRate.reset();
    this._frontRate.reset();
    this._dustRate.reset();
    this._streakRate.reset();
    this._debrisRate.reset();
    this.root.visible = true;
    this.root.position.copy(this.origin);
    this.root.rotation.set(0, Math.atan2(-this.direction.z, this.direction.x), 0);
    this._sync(0);
  }

  onTravel(dt) {
    this._sync(dt);
    this._emitTravel(dt);
  }

  onImpact() {
    this.position.y = 0;
    this._erupted = true;
    this._sync(0);
    this._erupt();
    this._strike();
  }

  onFade(dt) {
    this._sync(dt);
    if (this.phase === 'impact') {
      this._carry(dt, true);
    } else if (!this._letGo) {
      // The hook keeps hold through the first third of its unravel, takes no
      // one new, then lets go of everything it carries.
      if (this.fadeTime >= this.fadeDuration * 0.3) {
        this._letGo = true;
        this._dropAll(true);
      } else {
        this._carry(dt, false);
      }
    }
    this._emitDraft(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The lane — gameplay                                                 */
  /* ------------------------------------------------------------------ */

  /** Metres along the lane and across it for a flat world point. */
  _laneCoords(x, z, out) {
    const ox = x - this.origin.x, oz = z - this.origin.z;
    out.x = ox * this.direction.x + oz * this.direction.z;
    out.z = ox * this.side.x + oz * this.side.z;
    return out;
  }

  /** Whether a flat point is inside the lane capsule (caster → hook foot). */
  _inLane(x, z) {
    const c = this.config;
    this._laneCoords(x, z, _at);
    const half = c.laneWidth * 0.5;
    const along = Math.max(0, Math.min(this.length, _at.x));
    const dx = _at.x - along;
    return dx * dx + _at.z * _at.z <= half * half;
  }

  /** The eruption's strike: every enemy in the lane, once, nearest the hook first. */
  _strike() {
    const c = this.config;
    const cap = Math.max(0, Math.min(MAX_CAUGHT, Math.round(c.maxCaught)));
    const mx = this.origin.x + this.direction.x * this.length * 0.5;
    const mz = this.origin.z + this.direction.z * this.length * 0.5;
    const reach = Math.min(48, this.length * 0.5 + c.laneWidth * 0.5 + 0.5);
    if (this._scope) {
      const source = [this.origin.x, 0, this.origin.z];
      const found = this._scope.queryActors({ position: [mx, 0, mz], radius: reach, relation: 'enemy' });
      if (!found.ok) { this.failure = found.reason; return; }
      // Nearest the hook first; ties keep the bridge's id order (deterministic).
      const list = this._found;
      list.length = 0;
      for (const actor of found.actors) if (this._inLane(actor.position[0], actor.position[2])) list.push(actor);
      list.sort((a, b) => this._hookDistance(a.position[0], a.position[2]) - this._hookDistance(b.position[0], b.position[2]));
      const force = impactForce(c, settings.global.explosionIntensity);
      const ticks = Math.round(Math.max(0.2, c.draftTime) * settings.global.lifetime * (this._scope.tickRate || 30));
      for (let i = 0; i < list.length && i < cap; i++) {
        const actor = list[i];
        const sent = this._scope.emit({
          type: 'hit', element: 'wind', targetIds: [actor.id], position: actor.position,
          sourcePosition: source, damage: 1, hitForce: force, tags: ['skyhook-draft', 'draft'],
        });
        if (!sent.ok) { this.failure = sent.reason; continue; }
        this.hits++;
        if (!this._scope.standalone) {
          const status = this._scope.emit({
            type: 'status', element: 'wind', targetIds: [actor.id], position: actor.position,
            durationTicks: ticks, tags: ['skyhook-draft', 'buffeted'],
          });
          if (!status.ok) this.statusFailure = status.reason;
        }
      }
      list.length = 0;
      return;
    }
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(mx, mz, reach, this._found);
    const power = settings.global.explosionIntensity;
    this._force.impulse = c.hitImpulse * power;
    this._force.lift = c.hitLift * power;
    this._force.spin = c.hitSpin;
    let caught = 0;
    for (let i = 0; i < found.length && caught < cap; i++) {
      const dummy = found[i];
      if (!dummy?.position || !this._inLane(dummy.position.x, dummy.position.z)) continue;
      // Knocked downstream, toward the hook — the draft takes them from here.
      if (!dummy.kill(this.direction.x, this.direction.z, this._force)) continue;
      caught++;
      this.hits++;
      this._hold(dummy);
    }
    found.length = 0;
  }

  _hookDistance(x, z) {
    const fx = this.origin.x + this.direction.x * this.length;
    const fz = this.origin.z + this.direction.z * this.length;
    return Math.hypot(x - fx, z - fz);
  }

  _holding(dummy) {
    for (let i = 0; i < this._held; i++) if (this._slots[i].dummy === dummy) return true;
    return false;
  }

  _hold(dummy) {
    const cap = Math.max(0, Math.min(MAX_CAUGHT, Math.round(this.config.maxCaught)));
    if (this._held >= cap || this._holding(dummy)) return false;
    const slot = this._slots[this._held++];
    slot.dummy = dummy;
    slot.time = 0;
    slot.hoisted = false;
    return true;
  }

  _drop(i, release) {
    const slot = this._slots[i];
    if (release) slot.dummy?.release?.();
    const last = this._slots[--this._held];
    slot.dummy = last.dummy;
    slot.time = last.time;
    slot.hoisted = last.hoisted;
    last.dummy = null;
    last.time = 0;
    last.hoisted = false;
  }

  _dropAll(release) {
    while (this._held > 0) this._drop(this._held - 1, release);
    for (const slot of this._slots) {
      slot.dummy = null;
      slot.time = 0;
      slot.hoisted = false;
    }
  }

  /**
   * The draft's current at a point (sampled per joint by `Dummy#carry`).
   * Mode 0 conveys: downstream, onto the centreline, held `draftRise` up.
   * Mode 1 hoists: a spring onto the hanging point under the barb.
   */
  _sampleDraft(x, y, z, out) {
    const c = this.config;
    if (this._mode === 1) {
      out.set(this._hang.x - x, this._hang.y - y, this._hang.z - z).multiplyScalar(c.hoistPull);
      const v = out.length();
      if (v > c.hoistSpeed) out.multiplyScalar(c.hoistSpeed / v);
      return out;
    }
    this._laneCoords(x, z, _tip);
    const flow = _tip.x < this.length ? c.draftSpeed : c.draftSpeed * 0.2;
    const across = -_tip.z * c.draftConverge;
    out.set(
      this.direction.x * flow + this.side.x * across,
      (c.draftRise - y) * 2.5,
      this.direction.z * flow + this.side.z * across,
    );
    return out;
  }

  /** Take hold of downed bodies in the lane and steer every one held. */
  _carry(dt, scan) {
    const c = this.config;
    const field = this.ctx.dummies;
    if (scan && dt > 0 && field?.findBodies) {
      const mx = this.origin.x + this.direction.x * this.length * 0.5;
      const mz = this.origin.z + this.direction.z * this.length * 0.5;
      const bodies = field.findBodies(mx, mz, this.length * 0.5 + c.laneWidth, this._bodies);
      for (let i = 0; i < bodies.length; i++) {
        const dummy = bodies[i];
        if (dummy.alive || dummy.finished || this._holding(dummy)) continue;
        if (!dummy.bodyPoint?.(_at) || !this._inLane(_at.x, _at.z)) continue;
        if (!this._hold(dummy)) break;
      }
      bodies.length = 0;
    }
    const grab = clamp(c.draftGrab * Math.max(dt, 1 / 60));
    const catchSq = c.catchRadius * c.catchRadius;
    for (let i = this._held - 1; i >= 0; i--) {
      const slot = this._slots[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished || (dummy.bodyPoint && !dummy.bodyPoint(_at))) {
        this._drop(i, false);
        continue;
      }
      slot.time += dt;
      if (!slot.hoisted && dummy.bodyPoint) {
        const dx = _at.x - this._foot.x, dz = _at.z - this._foot.z;
        if (dx * dx + dz * dz <= catchSq) slot.hoisted = true;
      }
      // Eased in: a body snapped onto the current the frame it is caught reads
      // as one dropped onto a conveyor.
      const wound = Easing.outCubic(clamp(slot.time / 0.4));
      this._mode = slot.hoisted ? 1 : 0;
      dummy.carry?.(this._field, grab * wound, grab * wound, clamp(c.draftBuoyancy * wound));
    }
    this._mode = 0;
  }

  /* ------------------------------------------------------------------ */
  /* The eruption                                                        */
  /* ------------------------------------------------------------------ */

  _erupt() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const flare = c.hookFlare;
    _pos.copy(this._foot).setY(0.05);
    this.lightBoost = c.eruptLight * power;
    this.ctx.bursts?.spawn?.(BurstMode.AIR, _pos, {
      radius: flare * 0.3,
      endRadius: flare * c.burstRadius * 2 * power,
      life: c.burstLife,
      intensity: c.burstIntensity,
      opacity: c.burstOpacity * g.opacity,
      fresnel: c.burstFresnel,
      squash: c.burstSquash,
      colorA: getColor(c.coreColor),
      colorB: getColor(c.bodyColor),
      colorC: getColor(c.deepColor),
    });
    this.ctx.decals?.spawn?.(DecalType.DUSTRING, _pos, {
      radius: flare * c.dustRingRadius, life: c.decalLife, intensity: 1,
      colorA: getColor(c.colorDustB), colorB: getColor(c.colorDustD),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: flare * c.shockRadius * power, life: c.decalLife * 0.5, width: 0.07, intensity: 1,
      colorA: getColor(c.coreColor), colorB: getColor(c.bodyColor),
    });
    if (c.eruptShake > 0) this.ctx.shake?.add?.(c.eruptShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.eruptFlash > 0) this.ctx.flash?.trigger?.(getColor(c.tintColor), c.eruptFlash * power);
    // Grit thrown up out of the torn floor.
    if (this.grit) {
      this._emitBase(c.debrisSize, 1.1, c.debrisSpeed, 0.55);
      _emit.position = _pos.copy(this._foot).setY(0.2);
      _emit.radius = flare * 0.8;
      _emit.direction = _dir.set(0, 1, 0);
      _emit.spin = 9;
      this.grit.emit(this._count(c.debrisCount), _emit);
    }
    if (this.dust) {
      this._emitBase(c.dustSize * 1.3, c.dustLife, 3.5, 0.9);
      _emit.position = _pos.copy(this._foot).setY(0.3);
      _emit.radius = flare;
      _emit.direction = _dir.set(0, 0.35, 0);
      this.dust.emit(this._count(22), _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Particles                                                           */
  /* ------------------------------------------------------------------ */

  _count(n) {
    return Math.max(0, Math.min(128, Math.round(n * settings.global.particleCount)));
  }

  _emitBase(size, life, speed, spread) {
    const g = settings.global;
    _emit.size = size * g.particleSize;
    _emit.life = life * g.particleLifetime;
    _emit.speed = speed * g.particleSpeed;
    _emit.spread = spread;
    _emit.speedVariance = 0.35;
    _emit.sizeVariance = 0.4;
    _emit.lifeVariance = 0.3;
    _emit.spin = 1;
    _emit.radius = 0;
    _emit.time = frame.uTime.value;
  }

  _emitTravel(dt) {
    const c = this.config;
    if (this.age < this._windup) {
      // Streaks sucked into the coiling hook at the hand.
      if (!this.streaks) return;
      const n = Math.min(24, this._gatherRate.tick(dt, c.gatherRate));
      this._emitBase(c.gatherSize, 0.35, 3.4, 0.08);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const ox = Math.cos(a) * 1.3, oy = (Math.random() - 0.3) * 1.1, oz = Math.sin(a) * 1.3;
        _emit.position = _pos.copy(this.origin).addScaledVector(this.direction, 0.6);
        _pos.x += ox;
        _pos.y = c.handHeight + oy;
        _pos.z += oz;
        _emit.direction = _dir.set(-ox, -oy, -oz).normalize();
        this.streaks.emit(1, _emit);
      }
      return;
    }
    // Dust kicked up behind the front; air streaking after the seed.
    if (this.dust) {
      const n = Math.min(12, this._frontRate.tick(dt, c.frontDust));
      if (n > 0) {
        this._emitBase(c.dustSize * 0.7, c.dustLife * 0.8, 1.6, 0.5);
        _emit.position = _pos.copy(this.position).setY(0.25);
        _emit.radius = c.laneWidth * 0.3;
        _emit.direction = _dir.copy(this.direction).multiplyScalar(-0.4).add(_up);
        this.dust.emit(n, _emit);
      }
    }
    if (this.streaks) {
      const n = Math.min(12, this._streakRate.tick(dt, c.streakRate));
      if (n > 0) {
        this._emitBase(c.streakSize, c.streakLife * 0.6, c.streakSpeed, 0.12);
        _emit.position = _pos.copy(this.position).setY(c.ribbonHeight + 0.2);
        _emit.radius = c.laneWidth * 0.35;
        _emit.direction = _dir.copy(this.direction);
        this.streaks.emit(n, _emit);
      }
    }
  }

  _emitDraft(dt) {
    const c = this.config;
    if (this.phase === 'fade' || dt <= 0) return;
    const half = c.laneWidth * 0.5;
    if (this.dust) {
      const n = Math.min(12, this._dustRate.tick(dt, c.dustRate));
      this._emitBase(c.dustSize, c.dustLife, c.draftSpeed * 0.8, 0.25);
      for (let i = 0; i < n; i++) {
        const s = Math.random() * 0.9, l = (Math.random() * 2 - 1) * half * 0.8;
        _emit.position = _pos.copy(this.origin).addScaledVector(this.direction, s * this.length).addScaledVector(this.side, l);
        _pos.y = 0.2;
        _emit.direction = _dir.copy(this.direction).addScaledVector(this.side, -l * 0.3).addScaledVector(_up, 0.2);
        this.dust.emit(1, _emit);
      }
    }
    if (this.streaks) {
      const n = Math.min(16, this._streakRate.tick(dt, c.streakRate));
      this._emitBase(c.streakSize, c.streakLife, c.streakSpeed, 0.08);
      for (let i = 0; i < n; i++) {
        if (i % 2 === 0) {
          // Down the lane.
          const s = Math.random() * 0.8, l = (Math.random() * 2 - 1) * half * 0.7;
          _emit.position = _pos.copy(this.origin).addScaledVector(this.direction, s * this.length).addScaledVector(this.side, l);
          _pos.y = c.ribbonHeight + Math.random() * c.ribbonLayer;
          _emit.direction = _dir.copy(this.direction);
        } else {
          // Up the stem, wound round it.
          const a = Math.random() * Math.PI * 2, r = c.hookFlare * 0.7;
          _emit.position = _pos.copy(this._foot);
          _pos.x += Math.cos(a) * r;
          _pos.z += Math.sin(a) * r;
          _pos.y = 0.3 + Math.random() * 1.2;
          _emit.direction = _dir.set(-Math.sin(a) * 0.6, 1, Math.cos(a) * 0.6);
        }
        this.streaks.emit(1, _emit);
      }
    }
    if (this.grit) {
      const n = Math.min(6, this._debrisRate.tick(dt, c.debrisRate));
      if (n > 0) {
        this._emitBase(c.debrisSize * 0.8, 1.2, c.debrisSpeed * 0.7, 0.3);
        _emit.position = _pos.copy(this._foot).setY(0.15);
        _emit.radius = c.hookFlare * 1.3;
        _emit.direction = _dir.set(0, 1, 0);
        _emit.spin = 6;
        this.grit.emit(n, _emit);
      }
    }
  }

  /** Mirror the particle look from settings every frame. */
  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    const set = (system, a, b, cc, d, glow, opacity, gravity, drag) => {
      if (!system?.uniforms) return;
      system.setGradient?.(getColor(c[a]), getColor(c[b]), getColor(c[cc]), getColor(c[d]));
      const u = system.uniforms;
      u.uGlow.value = glow * g.glow;
      u.uOpacity.value = opacity * g.opacity;
      u.uTurbulence.value = 0.6 * g.turbulence;
      u.uSizeScale.value = 1;
      u.uLifeScale.value = 1;
      u.uSpeedScale.value = 1;
      u.uGravity.value.set(0, gravity, 0);
      u.uDrag.value = drag;
    };
    set(this.dust, 'colorDustA', 'colorDustB', 'colorDustC', 'colorDustD', 1, c.dustOpacity, 0.3, 1.2);
    set(this.streaks, 'colorStreakA', 'colorStreakB', 'colorStreakC', 'colorStreakD', c.streakGlow, 1, 0, 0.4);
    set(this.grit, 'plateColor', 'colorDustC', 'colorDustD', 'deepColor', 1, 1, -7, 0.3);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const L = this.length;
    const lt = g.lifetime;
    if (!this._calm) this._clock += dt * g.animationSpeed;
    const clock = this._clock;
    const flare = c.hookFlare;

    const windup = this._windup;
    const gather = this.phase === 'travel' ? (windup > 0 ? clamp(this.age / windup) : 1) : 1;
    const travelling = this.phase === 'travel' && this.age >= windup;
    // Seconds since the eruption, through the linger and the exit.
    const since = this.phase === 'travel' ? -1 : this.phase === 'impact' ? this.impactTime : this.impactDuration + this.fadeTime;
    const rise = since < 0 ? 0 : clamp(since / this._rise);
    const linger = since < 0 ? 0 : clamp((since - this._rise) / Math.max(0.2, c.draftTime * lt));
    const fadeT = this.phase === 'fade' ? clamp(this.fadeTime / this.fadeDuration) : 0;
    const reach = this.phase === 'travel' ? (travelling ? this.front : 0.5 * gather) : L;

    this.root.position.copy(this.origin);
    this.root.rotation.set(0, Math.atan2(-this.direction.z, this.direction.x), 0);
    this._foot.copy(this.origin).addScaledVector(this.direction, L);

    // 1 · the skyhook — the crook from the settings, curl derived from the lane
    const hp = this._hookParams;
    hp.height = c.hookHeight;
    hp.curl = Math.max(0.15, c.hookCurl * c.laneWidth);
    hp.drop = c.hookDrop;
    hp.bow = c.hookHeight * 0.05;
    const hs = this._hookState;
    hs.height = hp.height;
    hs.curl = hp.curl;
    hs.drop = hp.drop;
    hs.bow = hp.bow;
    hs.clock = clock;
    let hoist = 0, sway = 0;
    if (since < 0) {
      // The seed: coils at the hand, then rides the front.
      const seed = c.seedSize;
      if (!travelling) {
        this.hook.position.set(0.6, c.handHeight - c.hookHeight * seed * 0.5, 0);
        this.hook.scale.setScalar(Math.max(0.001, seed * (0.4 + 0.6 * Easing.outBack(gather))));
        hs.grow = 0.08 + 0.92 * Easing.outCubic(gather);
      } else {
        const u = this.u;
        this.hook.position.set(this.front, (c.handHeight - c.hookHeight * seed * 0.5) * (1 - u) + 0.15 * u, 0);
        this.hook.scale.setScalar(Math.max(0.001, seed * (1 + u * 0.6)));
        hs.grow = 1;
      }
      this.hook.rotation.set(0, this._calm ? 0 : clock * 7, 0);
      hs.unravel = 0;
      hs.wobble = 1.6;
      hs.fade = gather;
    } else {
      hoist = c.hookHoist * (Easing.inOutCubic(linger) + fadeT * 0.4);
      sway = c.hookYaw + (this._calm ? 0 : c.hookSway * Math.sin(clock * c.hookSwayRate) * Math.min(1, linger * 3 + rise * 0.3));
      this.hook.position.set(L, hoist, 0);
      this.hook.scale.setScalar(1);
      this.hook.rotation.set(0, sway, 0);
      hs.grow = Easing.outCubic(rise);
      hs.unravel = Easing.inQuad(fadeT);
      hs.wobble = 1;
      hs.fade = 1 - smooth((fadeT - 0.6) / 0.4);
    }
    this.hook.visible = hs.fade > 0.001;
    this.coreMat.userData.sync(hs);
    this.sheathMat.userData.sync(hs);
    // The point the hoisted bodies hang from: just under the barb, in the
    // world, following the hook's hoist and swing.
    hookPoint(1, hp, _tip);
    const tipX = _tip.x * Math.cos(sway), tipZ = -_tip.x * Math.sin(sway);
    this._hang.copy(this._foot).addScaledVector(this.direction, tipX).addScaledVector(this.side, tipZ);
    this._hang.y = hoist + _tip.y - 0.35;

    // 2 · the draft
    const bs = this._braidState;
    bs.length = L;
    bs.reach = reach;
    bs.travel = this.phase === 'travel' ? 1 : 1 - rise;
    bs.clock = clock;
    bs.hoist = hoist;
    bs.climb = c.ribbonClimb * c.hookHeight * Easing.outCubic(rise);
    bs.fade = this.phase === 'travel' ? (travelling ? 1 : 0) : 1;
    bs.dissolve = smooth(fadeT * 1.1);
    this.braidMat.userData.sync(bs);

    // 3 · the scour, spanning the lane and the foot's vortex
    const span = L + flare * 2.8 + 0.6;
    const width = Math.max(c.laneWidth * 1.2, flare * 5.6);
    const ss = this._scourState;
    ss.start = -0.6;
    ss.span = span;
    ss.width = width;
    ss.length = L;
    ss.reach = this.phase === 'travel' ? reach : L + flare * 3;
    ss.clock = clock;
    ss.erupt = Easing.outCubic(rise);
    ss.fade = this.phase === 'travel' ? 0.6 + 0.4 * this.u : 1;
    ss.dissolve = clamp(fadeT / Math.max(0.05, c.scourDissolve));
    this.scour.position.x = ss.start;
    this.scour.scale.set(span, 1, width);
    this.scourMat.userData.sync(ss);

    // 4 · torn plates
    const count = Math.max(0, Math.min(MAX_PLATES, Math.round(c.plateCount)));
    this.plateMat.color.copy(getColor(c.plateColor));
    this.plateMat.roughness = c.plateRoughness;
    this.plateMat.metalness = c.plateMetalness;
    this.plates.visible = since >= 0 && count > 0;
    if (this.plates.visible) {
      const heave = Easing.outBack(clamp(since / (0.3 * lt)));
      const climb = Easing.inOutCubic(linger);
      const fall = Easing.inQuad(fadeT);
      const orbitTime = this._calm ? 0 : Math.max(0, since);
      for (let i = 0; i < MAX_PLATES; i++) {
        if (i >= count) {
          scratch.position.set(L, -5, 0);
          scratch.scale.setScalar(0.0001);
        } else {
          const h1 = hash(i, 1), h2 = hash(i, 2), h3 = hash(i, 3);
          const a = i * 2.399963 + h1 + c.plateOrbit * orbitTime * (0.6 + 0.4 * h2);
          const rr = flare * c.plateRing * (0.75 + 0.5 * h2) * (1 - 0.35 * climb);
          const y = (c.plateHeave * heave * (0.5 + 0.5 * h3) + c.plateClimb * climb * (0.4 + 0.6 * h1)) * (1 - fall) - fall * 0.25;
          scratch.position.set(L + Math.cos(a) * rr, y, Math.sin(a) * rr);
          const tumble = c.plateTumble * orbitTime * (h3 - 0.5) * 2;
          // Tilted up and outward by the heave, then tumbling in the draft.
          scratch.rotation.set(0.9 * heave * Math.cos(a) * (0.6 + h1 * 0.4) + tumble, -a, 0.9 * heave * Math.sin(a) * (0.6 + h2 * 0.4) + tumble * 0.6);
          scratch.scale.setScalar(c.plateSize * (0.7 + 0.6 * h1) * (1 - fall * 0.4));
        }
        scratch.updateMatrix();
        this.plates.setMatrixAt(i, scratch.matrix);
      }
      this.plates.instanceMatrix.needsUpdate = true;
    }

    // 7 · the lens
    const ls = this._lensState;
    ls.start = ss.start;
    ls.span = span;
    ls.width = width;
    ls.length = L;
    ls.reach = ss.reach;
    ls.clock = clock;
    ls.strength = travelling ? 0.6 : since >= 0 ? 1 - fadeT : 0;
    const shockT = since < 0 ? 1 : clamp(since / 0.6);
    ls.shock = 1 - shockT;
    ls.wave = flare * (0.5 + 3 * Easing.outCubic(shockT));
    this.lens.visible = !this._calm && (ls.strength * c.lensStrength + ls.shock * c.lensShock) * g.distortion > 0.002;
    if (this.lens.visible) {
      this.lens.position.x = ss.start;
      this.lens.scale.set(span, 1, width);
      this.lensMat.userData.sync(ls);
    }

    this._syncParticles();
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._dropAll(true);
    this._scope = null;
    this.root.visible = false;
    this.lens.visible = false;
    this.plates.visible = false;
    this._erupted = false;
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
  const folder = gui.addFolder('⤴  Skyhook Draft');

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 3, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 80, 0.5, 'draft front speed (m/s)');
  R(cast, c, 'cooldown', 0, 15, 0.05, 'cooldown');
  R(cast, c, 'lifetime', 0.5, 8, 0.05, 'nominal lifetime (s)');
  castAnim(cast, c);
  R(cast, c, 'windup', 0, 1.2, 0.01, 'coil at the hand (s)');
  R(cast, c, 'hookRise', 0.05, 1.5, 0.01, 'hook erupts over (s)');
  R(cast, c, 'draftTime', 0.2, 6, 0.05, 'draft carries for (s)');
  R(cast, c, 'exitTime', 0.15, 3, 0.01, 'hook unravels over (s)');

  const lane = sub(folder, 'The lane (gameplay)');
  R(lane, c, 'laneWidth', 0.6, 6, 0.05, 'lane width (m)');
  R(lane, c, 'hitImpulse', 0, 24, 0.1, 'knock-down impulse');
  R(lane, c, 'hitLift', 0, 20, 0.1, 'knock-down lift');
  R(lane, c, 'hitSpin', 0, 8, 0.05, 'knock-down tumble');
  R(lane, c, 'maxCaught', 0, MAX_CAUGHT, 1, 'bodies caught');
  R(lane, c, 'draftSpeed', 0, 12, 0.1, 'conveys at (m/s)');
  R(lane, c, 'draftConverge', 0, 8, 0.05, 'draws to the centreline');
  R(lane, c, 'draftRise', 0, 3, 0.05, 'carried height (m)');
  R(lane, c, 'draftGrab', 0, 20, 0.1, 'grip of the current');
  R(lane, c, 'draftBuoyancy', 0, 1, 0.01, 'weight borne');
  R(lane, c, 'hoistPull', 0, 12, 0.05, 'hoist spring');
  R(lane, c, 'hoistSpeed', 0, 20, 0.1, 'hoist speed cap (m/s)');
  R(lane, c, 'catchRadius', 0.2, 4, 0.05, 'hoisted within (m)');

  const hook = sub(folder, '1 · The skyhook');
  R(hook, c, 'hookHeight', 1, 9, 0.05, 'stem height (m)');
  R(hook, c, 'hookCurl', 0.1, 1, 0.01, 'curl (× lane width)');
  R(hook, c, 'hookDrop', 0, 2.5, 0.01, 'barb drop (m)');
  R(hook, c, 'hookThickness', 0.05, 1.2, 0.01, 'thickness (m)');
  R(hook, c, 'hookTaper', 0.1, 1.5, 0.01, 'tip taper');
  R(hook, c, 'hookFlare', 0, 3, 0.01, 'foot flare (m)');
  R(hook, c, 'hookHoist', 0, 5, 0.05, 'climbs into the sky (m)');
  R(hook, c, 'hookYaw', -1.6, 1.6, 0.01, 'curl turned off the lane (rad)');
  R(hook, c, 'hookSway', 0, 1.2, 0.01, 'curl swing (rad)');
  R(hook, c, 'hookSwayRate', 0, 6, 0.05, 'swing rate');
  R(hook, c, 'seedSize', 0.05, 0.6, 0.01, 'hook at the hand (×)');
  R(hook, c, 'handHeight', 0.3, 2.5, 0.01, 'hand height (m)');
  R(hook, c, 'streamTwist', -10, 10, 0.1, 'streamline twist');
  R(hook, c, 'streamSpeed', 0, 8, 0.05, 'streamline flow');
  R(hook, c, 'streamCount', 1, 16, 1, 'streamlines');
  R(hook, c, 'coreGlow', 0, 6, 0.05, 'core glow');
  R(hook, c, 'sheathOpacity', 0, 1, 0.01, 'dust sheath opacity');
  R(hook, c, 'sheathScale', 1, 2.5, 0.01, 'dust sheath width (×)');
  R(hook, c, 'hookFresnel', 0.5, 6, 0.05, 'rim sharpness');

  const draft = sub(folder, '2 · The draft');
  R(draft, c, 'ribbonCount', 0, MAX_RIBBONS, 1, 'streamlines');
  R(draft, c, 'ribbonWidth', 0.02, 0.6, 0.005, 'width (m)');
  R(draft, c, 'ribbonHeight', 0, 2, 0.01, 'rides at (m)');
  R(draft, c, 'ribbonLayer', 0, 2, 0.01, 'height spread (m)');
  R(draft, c, 'ribbonWave', 0, 1, 0.01, 'wave (m)');
  R(draft, c, 'ribbonWaveLength', 0.5, 10, 0.05, 'wavelength (m)');
  R(draft, c, 'ribbonFlow', 0, 20, 0.1, 'flow (m/s)');
  R(draft, c, 'ribbonDash', 0.2, 5, 0.05, 'dash spacing (m)');
  R(draft, c, 'ribbonGlow', 0, 6, 0.05, 'glow');
  R(draft, c, 'ribbonClimb', 0, 1.2, 0.01, 'climbs the stem (× height)');

  const scour = sub(folder, '3 · The scour');
  R(scour, c, 'scourGlow', 0, 4, 0.05, 'streak glow');
  R(scour, c, 'scourDark', 0, 1, 0.01, 'groove darkness');
  R(scour, c, 'scourStreaks', 0.2, 4, 0.05, 'streak density');
  R(scour, c, 'scourFlow', 0, 6, 0.05, 'streak crawl (m/s)');
  R(scour, c, 'vortexGlow', 0, 4, 0.05, 'vortex glow');
  R(scour, c, 'vortexTwist', 0, 8, 0.05, 'vortex twist');
  R(scour, c, 'scourDissolve', 0.05, 1, 0.01, 'dissolves over (× exit)');

  const plates = sub(folder, '4 · Torn plates');
  R(plates, c, 'plateCount', 0, MAX_PLATES, 1, 'plates');
  R(plates, c, 'plateSize', 0.1, 1.5, 0.01, 'size (m)');
  R(plates, c, 'plateRing', 0.5, 3, 0.01, 'ring (× flare)');
  R(plates, c, 'plateHeave', 0, 2, 0.01, 'heaved up (m)');
  R(plates, c, 'plateClimb', 0, 4, 0.05, 'drawn up (m)');
  R(plates, c, 'plateOrbit', -4, 4, 0.05, 'orbit (rad/s)');
  R(plates, c, 'plateTumble', 0, 6, 0.05, 'tumble (rad/s)');
  color(plates, c, 'plateColor', 'rock');
  R(plates, c, 'plateRoughness', 0, 1, 0.01, 'roughness');
  R(plates, c, 'plateMetalness', 0, 1, 0.01, 'metalness');

  const light = sub(folder, 'Light & palette');
  color(light, c, 'lightColor', 'light colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'eruptLight', 0, 20, 0.1, 'punch at the eruption');
  color(light, c, 'coreColor', 'ramp · core');
  color(light, c, 'tintColor', 'ramp · tint');
  color(light, c, 'bodyColor', 'ramp · body');
  color(light, c, 'deepColor', 'ramp · deep');

  const fx = sub(folder, '5 · Particles');
  R(fx, c, 'gatherRate', 0, 200, 1, 'gather streaks /s');
  R(fx, c, 'gatherSize', 0.01, 0.3, 0.005, 'gather streak size');
  R(fx, c, 'frontDust', 0, 120, 1, 'front dust /s');
  R(fx, c, 'dustRate', 0, 120, 1, 'lane dust /s');
  R(fx, c, 'dustSize', 0.1, 3, 0.01, 'dust size');
  R(fx, c, 'dustLife', 0.1, 4, 0.05, 'dust life (s)');
  R(fx, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  gradient(fx, c, 'colorDust', 'dust gradient');
  R(fx, c, 'streakRate', 0, 200, 1, 'streaks /s');
  R(fx, c, 'streakSize', 0.01, 0.4, 0.005, 'streak size');
  R(fx, c, 'streakLife', 0.05, 3, 0.01, 'streak life (s)');
  R(fx, c, 'streakSpeed', 0, 30, 0.1, 'streak speed');
  R(fx, c, 'streakGlow', 0, 6, 0.05, 'streak glow');
  gradient(fx, c, 'colorStreak', 'streak gradient');
  R(fx, c, 'debrisCount', 0, 128, 1, 'grit at the eruption');
  R(fx, c, 'debrisRate', 0, 60, 1, 'grit drawn up /s');
  R(fx, c, 'debrisSize', 0.02, 0.5, 0.005, 'grit size');
  R(fx, c, 'debrisSpeed', 0, 20, 0.1, 'grit speed');

  const erupt = sub(folder, '6 · The eruption');
  R(erupt, c, 'burstRadius', 0, 4, 0.01, 'shell reach (× flare)');
  R(erupt, c, 'burstLife', 0.05, 3, 0.01, 'shell life (s)');
  R(erupt, c, 'burstIntensity', 0, 3, 0.01, 'shell brightness');
  R(erupt, c, 'burstOpacity', 0, 1, 0.01, 'shell opacity');
  R(erupt, c, 'burstFresnel', 0, 6, 0.05, 'shell rim');
  R(erupt, c, 'burstSquash', 0.05, 1.5, 0.01, 'shell squash');
  R(erupt, c, 'dustRingRadius', 0, 6, 0.05, 'dust ring (× flare)');
  R(erupt, c, 'shockRadius', 0, 6, 0.05, 'shockwave (× flare)');
  R(erupt, c, 'decalLife', 0.1, 5, 0.05, 'decals last (s)');
  R(erupt, c, 'eruptShake', 0, 1, 0.01, 'camera knock');
  R(erupt, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(erupt, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(erupt, c, 'eruptFlash', 0, 1, 0.01, 'flash');

  const lens = sub(folder, '7 · The lens');
  R(lens, c, 'lensStrength', 0, 3, 0.01, 'draft shimmer');
  R(lens, c, 'lensShock', 0, 3, 0.01, 'eruption ring');

  return folder;
}
