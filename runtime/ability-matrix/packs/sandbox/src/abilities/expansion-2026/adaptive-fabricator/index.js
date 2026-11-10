import { Group, Mesh, Vector3 } from 'three';
import { Ability as BaseAbility, AbilityPhase } from '../../Ability.js';
import { settings } from '../../../config/settings.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { getColor } from '../../../utils/color.js';
import { Easing, saturate } from '../../../utils/math.js';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../AuthoredImpactForce.js';
import {
  createExpansionFX,
  expansionImpact,
  routeExpansionTransparency,
  ParticleShape,
} from '../ExpansionFX.js';
import {
  createBeamGeometry,
  createBillboardGeometry,
  createCoreGeometry,
  createCradleGeometry,
  createDiscGeometry,
  createEmitterGeometry,
  createFootGeometry,
  createHaloGeometry,
  createMastGeometry,
  createPlinthGeometry,
  createReticleGeometry,
  createSeedGeometry,
  createVaneGeometry,
} from './FabricatorGeometry.js';
import {
  createBeamMaterial,
  createFloorMaterial,
  createHousingMaterial,
  createPadMaterial,
  createRingMaterial,
  createSeedMaterial,
  createWarpMaterial,
} from './FabricatorMaterials.js';
import { castAnimation, gradient, rangeOf, subFolder } from './EditorKit.js';
import config from './config.js';

export { config };
export const ID = config.id;

const UID = 'matrix-expansion/adaptive-fabricator';
const TAU = Math.PI * 2;
/** Emitter vanes on the head. One per scan-floor spoke. */
const VANES = 6;
/** Head height above the plinth, metres at `housingScale` 1. */
const HEAD_Y = 1.52;
/** Height the fabrication front climbs, metres at `housingScale` 1. */
const BUILD_HEIGHT = 2.25;
/** Feet bracing the plinth. */
const FEET = 3;
/** Struck bodies are hit about chest height; the beam aims there. */
const BODY_Y = 0.9;

/** Which settings key colours the beam for each counter element. */
const COUNTER_COLOR_KEYS = Object.freeze({ storm: 'stormColor', frost: 'frostColor', fire: 'fireColor' });

const _up = new Vector3(0, 1, 0);
const _aim = new Vector3();
const _pos = new Vector3();
const _dir = new Vector3();
const _emit = {};
const _muzzle = new Vector3();
/** Scratch query point: the scope reads it immediately and never retains it. */
const _queryPos = [0, 0, 0];

/**
 * The status → counter-element table. Combat statuses are read off the real
 * actor snapshot; with combat disabled there are no statuses and it fires
 * neutral tech.
 */
function choose(statuses) {
  // One pass over the statuses, no intermediate tag array. Priority is fixed
  // regardless of order: wet, then burning, then chilled / frozen.
  let wet = false;
  let burning = false;
  let cold = false;
  if (statuses) {
    for (let i = 0; i < statuses.length; i++) {
      const tag = statuses[i]?.tag;
      if (tag === 'wet') wet = true;
      else if (tag === 'burning') burning = true;
      else if (tag === 'chilled' || tag === 'frozen') cold = true;
    }
  }
  if (wet) return 'storm';
  if (burning) return 'frost';
  if (cold) return 'fire';
  return 'tech';
}

/** Shortest signed angle from `a` to `b`. */
function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * One pooled particle emission with the globals applied, reusing `_emit`.
 * `system` may be null (no particle engine in headless hosts).
 */
function emitParticles(system, count, position, radius, direction, speed, spread, size, life, spin, tint = null) {
  if (!system || count <= 0) return;
  const g = settings.global;
  const n = Math.min(128, Math.round(count * g.particleCount));
  if (n <= 0) return;
  _emit.position = position;
  _emit.radius = radius;
  _emit.direction = direction;
  _emit.speed = speed * g.particleSpeed;
  _emit.speedVariance = 0.45;
  _emit.spread = spread;
  _emit.inherit = null;
  _emit.anchor = null;
  _emit.size = size * g.particleSize;
  _emit.sizeVariance = 0.45;
  _emit.life = life * g.particleLifetime;
  _emit.lifeVariance = 0.35;
  _emit.spin = spin;
  _emit.tint = tint;
  _emit.time = frame.uTime.value;
  system.emit(n, _emit);
}

/** Push a settings gradient and a few behaviour uniforms into a shared system. */
function tuneSystem(system, c, prefix, gravityY, drag, glow) {
  if (!system) return;
  system.setGradient?.(getColor(c[`${prefix}A`]), getColor(c[`${prefix}B`]), getColor(c[`${prefix}C`]), getColor(c[`${prefix}D`]));
  const u = system.uniforms;
  if (!u) return;
  const g = settings.global;
  u.uGravity?.value.set(0, gravityY, 0);
  if (u.uDrag) u.uDrag.value = drag;
  if (u.uGlow) u.uGlow.value = glow * g.glow;
  if (u.uOpacity) u.uOpacity.value = g.opacity;
  if (u.uTurbulence) u.uTurbulence.value = 0.4 * g.turbulence;
}

/**
 * ADAPTIVE FABRICATOR — a sentry that reads the room and answers in kind.
 *
 * A zone cast in three acts. The **travel** is a faceted fabrication seed
 * lobbed in an arc to the circle, trailing streaks, while the landing circle
 * telegraphs on the floor. The **impact** is the seed planting itself: a
 * shockwave and dust ring, and a sentry *fabricated* in place — a glowing,
 * noise-jagged cut climbing from the floor to the emitter tips over
 * `buildTime`. The **linger** is the sentry scanning: the head turns, its six
 * vanes breathe, a radar sweep circles the floor, and every `shotInterval` it
 * locks onto the nearest visible enemy, reads its statuses, and fires the
 * counter-element (the beam, reticle and sparks take that element's colour).
 * When `life` is spent the cut runs back down and the sentry is un-made.
 *
 * Layers, each a folder in the editor:
 *
 *   1. **fabrication seed** — a fresnel bipyramid with fins, tumbling along
 *      its arc, with a streak trail at a fixed rate.
 *   2. **scan floor** — one disc shader: telegraph rim during travel, then a
 *      hex grid with blinking cells, spokes, sweep and outward pulses.
 *   3. **the sentry** — authored faceted lathes (plinth, mast, cradle, core),
 *      extruded slotted vanes and lathe emitters, all under one bespoke lit
 *      shader carrying the fabrication front. On `LAYER.SHAPED`.
 *   4. **the shot** — crossed-ribbon beam, a chevron reticle closing at the
 *      target, sparks, an arc decal, a light punch, shake and flash.
 *   5. **deploy beat** — shockwave + dust-ring decals, a storm burst shell,
 *      a throw of fabrication debris, shake/flash/light on the landing.
 *   6. **motes** — data motes rising off the scan field while it stands.
 *
 * The four particle layers share one pooled streak system (the Batch C
 * contract allows one per cast) and are told apart by per-emit tint, size,
 * speed and life: the trail and motes in their own tints, the sparks in the
 * counter-element's colour, the debris in the housing's.
 *   7. **distortion** — heat shimmer above the emitters, kicked on each shot.
 *
 * ## Gameplay is the contract
 *
 * Targeting, the element table, cover checks, the emitted UCSM event and its
 * timing are exactly the candidate's: shots only fire in the impact phase on
 * `shotInterval`, at the nearest unobstructed live actor inside `zoneRadius`,
 * with contact `position` at the struck actor and `sourcePosition` at the
 * sentry. Everything visual here reads from that, never the reverse.
 *
 * ## Live editing
 *
 * Spin, sweep, pulse and vane phases are *integrated* from their rates, so a
 * slider moved mid-deploy changes speed without snapping the pose. Colours
 * and dimensions are resolved from `settings.adaptiveFabricator` every frame.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** It picks its own target every shot. */
  get handlesOwnHits() {
    return true;
  }

  get impactDuration() {
    return this.config.life;
  }

  get fadeDuration() {
    return Math.max(0.05, this.config.fadeTime ?? 0.7);
  }

  /** Shots fired this deploy. HUD readout only. */
  get instanceCount() {
    return this._shots;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.resources = [];
    const own = (x) => (this.resources.push(x), x);

    this.root = new Group();
    this.group.add(this.root);

    /* ---- layer 2: the pad and the scan floor ---- */
    const disc = own(createDiscGeometry());
    this.padMat = own(createPadMaterial());
    this.pad = new Mesh(disc, this.padMat);
    this.pad.position.y = 0.03;
    this.pad.renderOrder = 1;
    this.root.add(this.pad);
    this.floorMat = own(createFloorMaterial());
    this.floor = new Mesh(disc, this.floorMat);
    this.floor.position.y = 0.04;
    this.floor.renderOrder = 2;
    this.root.add(this.floor);

    /* ---- layer 3: the sentry ---- */
    // The body carries `housingScale`; the floor, beam and reticle stay in
    // root space so their metres are never scaled by the sentry's size.
    this.body = new Group();
    this.root.add(this.body);
    this.housingMat = own(createHousingMaterial('housing'));
    this.coreMat = own(createHousingMaterial('core'));
    this._shaped = [];
    const solid = (geometry, material, parent) => {
      const mesh = new Mesh(geometry, material);
      // Lit, shadow-casting machine: the shadow pass draws it with a depth
      // material that honours the fabrication front.
      mesh.customDepthMaterial = material.userData.depth;
      mesh.castShadow = true;
      parent.add(mesh);
      this._shaped.push(mesh);
      return mesh;
    };

    solid(own(createPlinthGeometry()), this.housingMat, this.body);
    const footGeo = own(createFootGeometry());
    for (let i = 0; i < FEET; i++) {
      const foot = solid(footGeo, this.housingMat, this.body);
      const a = (i / FEET) * TAU + Math.PI / 6;
      foot.position.set(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62);
      foot.rotation.y = -a;
    }
    const mast = solid(own(createMastGeometry()), this.housingMat, this.body);
    mast.position.y = 0.4;

    this.head = new Group();
    this.head.position.y = HEAD_Y;
    this.body.add(this.head);
    solid(own(createCradleGeometry()), this.housingMat, this.head);
    this.coreMesh = solid(own(createCoreGeometry()), this.coreMat, this.head);

    const vaneGeo = own(createVaneGeometry());
    const emitterGeo = own(createEmitterGeometry());
    /** One arm per vane; each carries exactly one emitter barrel. */
    this.arms = [];
    for (let i = 0; i < VANES; i++) {
      const mount = new Group();
      mount.rotation.y = (i * TAU) / VANES;
      this.head.add(mount);
      const arm = solid(vaneGeo, this.housingMat, mount);
      // The vane faces outward: its blade plane is tangent to the head.
      arm.position.set(0.35, -0.2, 0);
      arm.rotation.set(0, Math.PI / 2, -0.35);
      const emitter = solid(emitterGeo, this.coreMat, arm);
      emitter.position.set(0.02, 0.93, 0);
      this.arms.push(arm);
    }

    this.haloMat = own(createRingMaterial(12));
    this.halo = new Mesh(own(createHaloGeometry(0.62, 0.035, 12)), this.haloMat);
    this.halo.position.y = 0.05;
    this.head.add(this.halo);

    /* ---- layer 4: the shot ---- */
    this.beamMat = own(createBeamMaterial());
    this.beam = new Mesh(own(createBeamGeometry()), this.beamMat);
    this.beam.visible = false;
    this.beam.frustumCulled = false;
    this.root.add(this.beam);

    // The lock-on: a thin laser sight from the head to the body the next shot
    // will take, drawn for `lockTime` before each shot. Same crossed ribbon,
    // its own material instance in the lock colour.
    this.lockMat = own(createBeamMaterial());
    this.lock = new Mesh(this.beam.geometry, this.lockMat);
    this.lock.visible = false;
    this.lock.frustumCulled = false;
    this.root.add(this.lock);

    this.impactMaterial = own(createRingMaterial(8));
    const reticle = own(createReticleGeometry());
    this.impactGroup = new Group();
    this.impactGroup.visible = false;
    this.impactRings = [];
    for (let i = 0; i < 2; i++) {
      const ring = new Mesh(reticle, this.impactMaterial);
      ring.position.y = 0.04 + i * 0.04;
      this.impactGroup.add(ring);
      this.impactRings.push(ring);
    }
    this.root.add(this.impactGroup);

    /* ---- layer 1: the seed (world space, not under root) ---- */
    this.seedMat = own(createSeedMaterial());
    this.seed = new Mesh(own(createSeedGeometry()), this.seedMat);
    this.seed.visible = false;
    this.group.add(this.seed);

    /* ---- layer 7: the warp ---- */
    this.warpMat = own(createWarpMaterial());
    this.warp = new Mesh(own(createBillboardGeometry()), this.warpMat);
    this.warp.frustumCulled = false;
    this.warp.position.y = HEAD_Y - 0.2;
    this.root.add(this.warp);

    // Transparent meshes onto VFX first, then pin the two special layers —
    // routing would otherwise move the (transparent) warp onto VFX too.
    routeExpansionTransparency(this.group);
    for (const mesh of this._shaped) mesh.layers.set(LAYER.SHAPED);
    this.warp.layers.set(LAYER.DISTORTION);

    /* ---- per-cast state (reset in onSpawn) ---- */
    this._point = new Vector3();
    this._targetPoint = new Vector3();
    this._lockPoint = new Vector3();
    this._locked = false;
    this._hasLock = false;
    this._fxPoint = new Vector3();
    this._hasTarget = false;
    this._lastElement = null;
    this._shots = 0;
    this._beamAge = 999;
    this._timer = 0;
    this._scope = null;
    this._buildAge = 0;
    this._headYaw = 0;
    this._vanePhase = 0;
    this._sweepPhase = 0;
    this._ringPhase = 0;
    this._haloPhase = 0;
    this._seedSpin = 0;
    this._warpKick = 0;
    this._heat = 0;
    this._unfold = 0;

    /** Scratch handed to the materials each frame — one apiece, reused. */
    this._housingState = { build: 0, baseY: 0, height: BUILD_HEIGHT, flare: 0 };
    this._coreState = { build: 0, baseY: 0, height: BUILD_HEIGHT, flare: 0 };
    this._floorState = { fade: 1, telegraph: 1, opacity: 1, sweep: 0, rings: 0 };
    this._padState = { fade: 1, build: 0, heat: 0 };
    this._beamState = { fade: 0, color: config.settings.beamColor, arc: 0, bow: new Vector3() };
    this._lockState = { fade: 0, color: config.settings.lockColor, arc: 0, bow: new Vector3() };
    this._haloState = { fade: 1, color: config.settings.beamColor, glow: 1.6 };
    this._ringState = { fade: 0, color: config.settings.beamColor, glow: 2 };
    this._seedState = { fade: 1 };
    this._warpState = { strength: 0 };
    this._disposed = false;
  }

  createParticles() {
    // One shared, pooled streak system owned by the ParticleEngine (the
    // candidate contract allows a Batch C cast exactly one). The four
    // particle layers — seed trail, shot sparks, landing debris, motes — are
    // told apart by per-emit tint, size, speed and life over its gradient.
    this.fx = createExpansionFX(this.ctx, 'adaptiveFabricator', { shape: ParticleShape.STREAK });
    this.trailEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._point.copy(this.origin).addScaledVector(this.direction, this.length);
    this._shots = 0;
    this._timer = 0;
    this._beamAge = 999;
    this._hasTarget = false;
    this._lastElement = null;
    this._locked = false;
    this._hasLock = false;
    this._buildAge = 0;
    this._headYaw = Math.atan2(this.direction.x, this.direction.z);
    this._vanePhase = 0;
    this._sweepPhase = 0;
    this._ringPhase = 0;
    this._haloPhase = 0;
    this._seedSpin = 0;
    this._warpKick = 0;
    this._heat = 0;
    this._unfold = 0;
    this.trailEmitter.reset();
    this.moteEmitter.reset();

    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = !this._scope
      ? 'combat bridge unavailable'
      : this._scope.standalone
        ? 'combat disabled: exposure unavailable; firing neutral tech'
        : null;

    this.root.visible = true;
    this.seed.visible = true;
    this.beam.visible = false;
    this.lock.visible = false;
    this.impactGroup.visible = false;
    this._sync();
  }

  onTravel(dt) {
    this._beamAge += dt;
    this._flySeed(dt);
    this._sync(dt);
  }

  onImpact() {
    this._timer = 0;
    this._buildAge = 0;
    this.seed.visible = false;
    this._land();
    this._sync();
  }

  onFade(dt) {
    this._beamAge += dt;
    if (this.phase === AbilityPhase.IMPACT) {
      this._buildAge += dt;
      // The attack: one attributed shot per `shotInterval`, at most four on a
      // long frame. Timing is the candidate's own and is not presentation.
      this._timer += dt;
      let n = 0;
      while (this._timer >= this.config.shotInterval && n++ < 4) {
        this._timer -= this.config.shotInterval;
        this._fire();
      }
      // Presentation only: the lock-on reads the same target choice a beat
      // early. It never emits and never changes when the shot fires.
      const lockTime = this._lockWindow();
      if (lockTime > 0 && !this._locked && this._timer >= this.config.shotInterval - lockTime) {
        this._locked = true;
        const target = this._nearest();
        if (target) {
          this._lockPoint.fromArray(target.position);
          this._hasLock = true;
        }
      }
      this._emitMotes(dt);
    }
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the seed                                                   */
  /* ------------------------------------------------------------------ */

  _flySeed(dt) {
    const c = this.config;
    const g = settings.global;
    this._seedSpin += c.seedSpin * dt * g.animationSpeed;
    // A lob: the base class moves the front along the floor; the seed rides
    // an arc over it and lands exactly on the circle at u = 1.
    const arc = 4 * c.seedArc * this.u * (1 - this.u);
    this.seed.position.copy(this.position).setY(c.seedSize + arc);
    this.seed.scale.setScalar(c.seedSize);
    this.seed.rotation.set(this._seedSpin * 0.37, this._seedSpin, 0);
    this.position.y = this.seed.position.y; // the light rides the seed

    this._syncParticles();
    const count = this.trailEmitter.tick(dt, c.trailRate);
    if (count > 0) {
      _dir.copy(this.direction).multiplyScalar(-1).setY(0.25).normalize();
      emitParticles(this.fx, count, this.seed.position, c.seedSize * 0.4, _dir,
        c.trailSpeed, 0.35, c.trailSize, c.trailLife, 0, getColor(c.trailColor));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the landing beat                                           */
  /* ------------------------------------------------------------------ */

  _land() {
    const c = this.config;
    const g = settings.global;
    this._syncParticles();
    _pos.copy(this._point).setY(0);

    this.ctx.decals?.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.shockRadius * g.explosionIntensity,
      life: 0.6,
      width: 0.06,
      intensity: 1,
      colorA: getColor(c.coreColor),
      colorB: getColor(c.beamColor),
    });
    this.ctx.decals?.spawn(DecalType.DUSTRING, _pos, {
      radius: c.shockRadius * 0.6,
      life: 1.2,
      intensity: 0.8,
      colorA: getColor(c.metalColor),
      colorB: getColor(c.debrisColor),
    });
    _pos.y = 0.35;
    this.ctx.bursts?.spawn(BurstMode.STORM, _pos, {
      radius: 0.15,
      endRadius: 1.4 * g.explosionIntensity,
      life: 0.45,
      intensity: 0.8,
      opacity: 0.55,
      squash: 0.4,
      colorA: getColor(c.beamColor),
      colorB: getColor(c.coreColor),
      colorC: getColor(c.metalColor),
    });
    emitParticles(this.fx, c.debrisCount, _pos, 0.6, _up, c.debrisSpeed, 1, c.debrisSize, c.debrisLife, 2, getColor(c.debrisColor));

    expansionImpact(this.ctx, c.coreColor, c.deployShake * g.explosionIntensity, c.deployFlash * g.explosionIntensity);
    this.lightBoost = c.deployLight * g.explosionIntensity;
    this._heat = 1.2;
  }

  /* ------------------------------------------------------------------ */
  /* The shot (combat-bound)                                             */
  /* ------------------------------------------------------------------ */

  /**
   * The nearest unobstructed live enemy inside the scan, or null. Shared by
   * the shot and the lock-on telegraph so both always agree on the target.
   * Sets `failure` on a refused query (the shot's own semantics).
   */
  _nearest() {
    const c = this.config;
    const s = this._scope;
    if (!s) return null;
    _queryPos[0] = this._point.x;
    _queryPos[1] = 0;
    _queryPos[2] = this._point.z;
    const near = s.queryActors({ position: _queryPos, radius: c.zoneRadius, relation: 'enemy' });
    if (!near?.ok) {
      this.failure = near?.reason ?? 'target query refused';
      return null;
    }
    // Query order is stable by actor ID, not proximity. Keep that order only
    // as the tie-breaker while selecting the nearest unobstructed live actor.
    let target = null;
    let bestDistance = Infinity;
    for (const actor of near.actors) {
      if (!actor.alive) continue;
      const dx = actor.position[0] - _queryPos[0];
      const dz = actor.position[2] - _queryPos[2];
      const distance = dx * dx + dz * dz;
      if (distance >= bestDistance) continue;
      const check = s.isBlocked(_queryPos, actor.position);
      if (!check?.ok || check.blocked) continue;
      target = actor;
      bestDistance = distance;
    }
    return target;
  }

  _fire() {
    const c = this.config;
    const s = this._scope;
    if (!s) return;
    const target = this._nearest();
    this._locked = false;
    this._hasLock = false;
    if (!target) return;
    const detail = s.getActor(target.id);
    if (!detail?.ok) {
      this.failure = detail?.reason ?? 'target unavailable';
      return;
    }
    const element = choose(detail.actor.statuses);
    const sent = s.emit({
      type: 'hit',
      element,
      targetIds: [target.id],
      // Combat hit positions describe contact, so reactions and hit-centred
      // effects resolve at the struck actor rather than at the deployable.
      position: target.position,
      // The bridge queues the event, so it owns its own array.
      sourcePosition: [this._point.x, 0, this._point.z],
      hitForce: impactForce(c),
      damage: c.damage,
      tags: ['adaptive-fabricator'],
    });
    if (!sent?.ok) {
      this.failure = sent?.reason ?? 'shot refused';
      return;
    }
    this._shots++;
    this._hasTarget = true;
    this._targetPoint.fromArray(target.position);
    this._lastElement = element;
    this._beamAge = 0;
    this._warpKick = 1;
    this._shotFx();
  }

  /** Everything the player sees of an accepted shot, at the struck body. */
  _shotFx() {
    const c = this.config;
    const g = settings.global;
    const color = this._counterColor();
    this._syncParticles();

    this._fxPoint.copy(this._targetPoint).setY(BODY_Y);
    _dir.copy(this._targetPoint).sub(this._point).setY(0);
    if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction);
    _dir.normalize().setY(0.5).normalize();
    // Sparks take the counter-element's colour, so the read is "fire answered".
    emitParticles(this.fx, c.sparkCount, this._fxPoint, 0.2, _dir, c.sparkSpeed, 0.8, c.sparkSize, c.sparkLife, 2, getColor(color));

    _pos.copy(this._targetPoint).setY(0);
    this.ctx.decals?.spawn(DecalType.ARC, _pos, {
      radius: c.hitDecalRadius,
      life: c.hitDecalLife,
      intensity: 0.9,
      colorA: getColor(color),
      colorB: getColor(c.beamColor),
    });
    // The floor keeps the shot: a scorch that outlives the deploy.
    if (c.scorchRadius > 0) {
      this.ctx.decals?.spawn(DecalType.SCORCH, _pos, {
        radius: c.scorchRadius,
        life: c.scorchLife,
        intensity: 0.85,
        colorA: getColor(c.deepColor),
        colorB: getColor(color),
      });
    }
    // An ionised shell where it lands, and a flash shell at the emitter.
    _pos.copy(this._targetPoint).setY(BODY_Y);
    if (c.shotBurst > 0) {
      this.ctx.bursts?.spawn(BurstMode.STORM, _pos, {
        radius: 0.1,
        endRadius: c.shotBurst * g.explosionIntensity,
        life: c.shotBurstLife,
        intensity: 1,
        opacity: 0.6,
        squash: 0.8,
        colorA: getColor('#ffffff'),
        colorB: getColor(color),
        colorC: getColor(c.deepColor),
      });
    }
    if (c.muzzleSize > 0) {
      _pos.copy(this._muzzleLocal(_muzzle, this._targetPoint, 0)).add(this._point);
      this.ctx.bursts?.spawn(BurstMode.STORM, _pos, {
        radius: 0.05,
        endRadius: c.muzzleSize,
        life: c.muzzleLife,
        intensity: 1.2,
        opacity: 0.7,
        squash: 1,
        colorA: getColor('#ffffff'),
        colorB: getColor(color),
        colorC: getColor(c.colorSparkC),
      });
    }
    this._heat = Math.max(this._heat, 0.8);

    // Scaled like the deploy beat: strike power drives knock, flash and light.
    this.lightBoost = c.shotLight * g.explosionIntensity;
    expansionImpact(this.ctx, color, c.impactShake * g.explosionIntensity, c.impactFlash * g.explosionIntensity);
  }

  /**
   * Where the bolt leaves the sentry, in root-local metres: out on the
   * emitter ring on the side facing `target` and up at the emitter tips, so
   * the bolt always clears the mast — a body standing against the plinth
   * still gets a long, plunging bolt that reads instead of one hidden inside
   * the housing.
   */
  _muzzleLocal(out, target, recoil) {
    const c = this.config;
    const scale = Math.max(0.05, c.housingScale);
    out.copy(target).sub(this._point).setY(0);
    if (out.lengthSq() < 1e-8) out.copy(this.direction).setY(0);
    if (out.lengthSq() < 1e-8) out.set(0, 0, 1);
    out.normalize().multiplyScalar(c.muzzleReach * scale);
    out.y = (HEAD_Y + c.muzzleHeight - recoil * c.recoilDepth) * scale;
    return out;
  }

  /**
   * The bolt's bow at its apex (world metres): `arc` up, `beamSwing` to one
   * side of the line from the sentry to the body — alternating side shot to
   * shot (deterministic from the shot index) — and `beamThrow` outward.
   * The sight for the next shot uses the next shot's side, so it traces the
   * very curve the bolt will take.
   */
  _bow(out, target, arc, shot) {
    const c = this.config;
    _dir.copy(target).sub(this._point).setY(0);
    if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction).setY(0);
    if (_dir.lengthSq() < 1e-8) _dir.set(0, 0, 1);
    _dir.normalize();
    const side = c.beamAlternate > 0.5 && (shot & 1) ? -1 : 1;
    // lateral = up × outward
    out.set(_dir.z, 0, -_dir.x).multiplyScalar(c.beamSwing * side);
    out.addScaledVector(_dir, c.beamThrow);
    out.y = arc;
    return out;
  }

  /** Seconds the lock-on is drawn before a shot; never more than most of the interval. */
  _lockWindow() {
    const c = this.config;
    return Math.min(Math.max(0, c.lockTime), c.shotInterval * 0.8);
  }

  _counterColor() {
    const c = this.config;
    const key = COUNTER_COLOR_KEYS[this._lastElement];
    return (key && c[key]) || c.beamColor;
  }

  /* ------------------------------------------------------------------ */
  /* Linger — ambient                                                    */
  /* ------------------------------------------------------------------ */

  _emitMotes(dt) {
    const c = this.config;
    const build = this._housingState.build;
    if (build <= 0.05) return;
    const count = this.moteEmitter.tick(dt, c.moteRate * build);
    if (count <= 0) return;
    // Spread over the field, low: they read as the scan lifting data off it.
    _pos.copy(this._point).setY(0.15);
    emitParticles(this.fx, count, _pos, c.zoneRadius * 0.7, _up, c.moteRise, 0.2, c.moteSize, c.moteLife, 0, getColor(c.moteColor));
  }

  _syncParticles() {
    const c = this.config;
    tuneSystem(this.fx, c, 'colorSpark', c.particleGravity, c.particleDrag, 2);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame resolve                                                   */
  /* ------------------------------------------------------------------ */

  /** 0..1 assembled. Eased in on deploy, eased out over the fade. */
  _buildAmount() {
    const c = this.config;
    if (this.phase === AbilityPhase.TRAVEL || this.phase === AbilityPhase.IDLE) return 0;
    if (this.phase === AbilityPhase.FADE) return 1 - Easing.inOutQuad(saturate(this.fadeTime / this.fadeDuration));
    return Easing.outCubic(saturate(this._buildAge / Math.max(0.01, c.buildTime)));
  }

  /** @param {number} dt seconds since last frame; 0 renders without advancing */
  _sync(dt = 0) {
    const c = this.config;
    const g = settings.global;
    const travelling = this.phase === AbilityPhase.TRAVEL;
    const fading = this.phase === AbilityPhase.FADE;
    const fade = fading ? 1 - saturate(this.fadeTime / this.fadeDuration) : 1;
    const build = this._buildAmount();
    const scale = Math.max(0.05, c.housingScale);
    const spin = dt * g.animationSpeed;

    // Integrated phases: a slider move changes the rate, never the pose.
    this._vanePhase += c.vaneSpeed * spin;
    this._sweepPhase += c.sweepSpeed * spin;
    this._ringPhase += c.ringSpeed * spin;
    this._haloPhase += c.haloSpin * spin;
    this._warpKick = Math.max(0, this._warpKick - dt * 4);
    this._heat *= Math.exp(-dt * 2.2);

    this.root.position.copy(this._point);
    this.body.scale.setScalar(scale);
    if (!travelling) this.position.set(this._point.x, c.lightHeight, this._point.z);

    /* ---- the floor ---- */
    const telegraph = travelling ? 1 : saturate(1 - build * 1.5);
    this.floor.scale.set(c.zoneRadius, 1, c.zoneRadius);
    const fs = this._floorState;
    fs.fade = fade;
    fs.telegraph = telegraph;
    // During travel the circle ramps in as the seed closes on it.
    fs.opacity = travelling ? c.telegraphOpacity * Easing.outQuad(saturate(this.u * 1.4)) : c.floorOpacity;
    fs.sweep = this._sweepPhase;
    fs.rings = this._ringPhase;
    this.floorMat.userData.sync(fs);
    this.pad.scale.set(c.zoneRadius, 1, c.zoneRadius);
    const pd = this._padState;
    pd.fade = fade;
    pd.build = build;
    pd.heat = this._heat;
    this.padMat.userData.sync(pd);

    /* ---- the sentry ---- */
    const hs = this._housingState;
    hs.build = build;
    hs.baseY = 0;
    hs.height = BUILD_HEIGHT * scale;
    // The deploy recoils on each attributed shot, then settles into its scan.
    const recoilTime = Math.max(0.01, c.recoilTime);
    const recoil = this._beamAge < recoilTime ? 1 - this._beamAge / recoilTime : 0;
    hs.flare = recoil;
    this.housingMat.userData.sync(hs);
    const cs = this._coreState;
    cs.build = build;
    cs.baseY = 0;
    cs.height = hs.height;
    cs.flare = recoil;
    this.coreMat.userData.sync(cs);

    this.head.position.y = HEAD_Y - recoil * c.recoilDepth;
    // The vanes arrive folded flat against the mast and swing open once the
    // cut has passed the head; they fold back as it is un-made.
    if (this.phase === AbilityPhase.IMPACT) {
      this._unfold = saturate((this._buildAge - c.buildTime * 0.75) / Math.max(0.02, c.unfoldTime));
    } else if (travelling) {
      this._unfold = 0;
    }
    const fold = c.unfoldFold * (1 - Easing.outBack(this._unfold));
    const refold = fading ? c.unfoldFold * Easing.inQuad(1 - fade) : 0;
    for (let i = 0; i < this.arms.length; i++) {
      this.arms[i].rotation.z = -0.35 + fold + refold - c.vaneSway * this._unfold * Math.sin(this._vanePhase + (i * TAU) / VANES) - recoil * 0.2;
    }
    const shadows = c.shadows >= 0.5;
    for (let i = 0; i < this._shaped.length; i++) this._shaped[i].castShadow = shadows;

    // Track the last target for a beat after a shot, otherwise keep scanning.
    if (this._hasLock && this.phase === AbilityPhase.IMPACT) {
      // Slew onto the locked body before the shot.
      const want = Math.atan2(this._lockPoint.x - this._point.x, this._lockPoint.z - this._point.z);
      this._headYaw += angleDelta(this._headYaw, want) * Math.min(1, dt * 12);
    } else if (this._hasTarget && this._beamAge < recoilTime * 2) {
      const want = Math.atan2(this._targetPoint.x - this._point.x, this._targetPoint.z - this._point.z);
      this._headYaw += angleDelta(this._headYaw, want) * Math.min(1, dt * 18);
    } else {
      this._headYaw += c.headSpin * spin;
    }
    this.head.rotation.y = this._headYaw;

    this.halo.rotation.y = this._haloPhase;
    const color = this._counterColor();
    const ha = this._haloState;
    ha.fade = c.haloOpacity * build;
    ha.color = color;
    ha.glow = 1.6 + recoil * 1.5;
    this.haloMat.userData.sync(ha);

    /* ---- the seed ---- */
    this._seedState.fade = travelling ? 1 : 0;
    this.seedMat.userData.sync(this._seedState);

    /* ---- arrival reticle at the struck target ---- */
    const impactTime = Math.max(0.05, c.impactDuration ?? 0.45);
    this.impactGroup.visible = this._hasTarget && this._beamAge < impactTime;
    if (this.impactGroup.visible) {
      const progress = saturate(this._beamAge / impactTime);
      this.impactGroup.position.set(this._targetPoint.x - this._point.x, 0, this._targetPoint.z - this._point.z);
      const rs = this._ringState;
      rs.fade = 0.8 * (1 - progress) * fade;
      rs.color = color;
      rs.glow = 2.2;
      this.impactMaterial.userData.sync(rs);
      for (let i = 0; i < this.impactRings.length; i++) {
        this.impactRings[i].scale.setScalar((c.impactRadius ?? 0.8) * (0.2 + progress * (i ? 1 : 1.5)));
        this.impactRings[i].rotation.y = this.age * (i ? -2 : 2);
      }
    }

    /* ---- the beam: emitter head → struck body ---- */
    const beamTime = Math.max(0.01, c.beamTime);
    this.beam.visible = this._hasTarget && this._beamAge < beamTime;
    if (this.beam.visible) {
      this._muzzleLocal(_muzzle, this._targetPoint, recoil);
      _aim.copy(this._targetPoint).sub(this._point).setY(BODY_Y).sub(_muzzle);
      const length = _aim.length();
      if (length > 1e-5) {
        this.beam.position.copy(_muzzle);
        this.beam.quaternion.setFromUnitVectors(_up, _aim.multiplyScalar(1 / length));
        this.beam.scale.set(c.beamWidth, length, c.beamWidth);
      }
      const bs = this._beamState;
      bs.fade = (1 - this._beamAge / beamTime) * fade;
      bs.color = color;
      bs.arc = c.beamArc;
      this._bow(bs.bow, this._targetPoint, c.beamArc, this._shots - 1);
      this.beamMat.userData.sync(bs);
    }

    /* ---- the lock-on sight: head → the body the next shot takes ---- */
    const lockTime = this._lockWindow();
    this.lock.visible = this._hasLock && lockTime > 0 && this.phase === AbilityPhase.IMPACT && c.lockOpacity > 0;
    if (this.lock.visible) {
      const k = saturate((this._timer - (c.shotInterval - lockTime)) / lockTime);
      this._muzzleLocal(_muzzle, this._lockPoint, recoil);
      _aim.copy(this._lockPoint).sub(this._point).setY(BODY_Y).sub(_muzzle);
      const length = _aim.length();
      if (length > 1e-5) {
        this.lock.position.copy(_muzzle);
        this.lock.quaternion.setFromUnitVectors(_up, _aim.multiplyScalar(1 / length));
        // Starts wide and faint, tightens and brightens as the shot comes due.
        this.lock.scale.set(c.lockWidth * (1.8 - 0.8 * k), length, c.lockWidth * (1.8 - 0.8 * k));
      }
      const ls = this._lockState;
      // A stutter while acquiring, steady once locked.
      const blink = k < 0.6 ? 0.55 + 0.45 * Math.sign(Math.sin(this.age * 60)) : 1;
      ls.fade = c.lockOpacity * (0.35 + 0.65 * k) * blink * fade;
      ls.color = c.lockColor;
      ls.arc = c.lockArc;
      this._bow(ls.bow, this._lockPoint, c.lockArc, this._shots);
      this.lockMat.userData.sync(ls);
    }

    /* ---- the warp above the emitters ---- */
    this.warp.position.y = (HEAD_Y - 0.2) * scale;
    this._warpState.strength = (c.warpStrength * build + this._warpKick * c.warpShot) * fade;
    this.warpMat.userData.sync(this._warpState);
    this.warp.visible = this._warpState.strength > 0.001;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.root.visible = false;
    this.seed.visible = false;
    this._heat = 0;
    this.beam.visible = false;
    this.lock.visible = false;
    this._locked = false;
    this._hasLock = false;
    this.impactGroup.visible = false;
    this.warp.visible = false;
    this._scope = null;
    this._hasTarget = false;
    this._lastElement = null;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.onDestroy();
    for (const r of this.resources) {
      r.userData?.depth?.dispose?.();
      r.dispose();
    }
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⬡  Adaptive Fabricator');
  const R = rangeOf(Editor);

  const cast = subFolder(folder, 'The cast');
  R(cast, c, 'range', 2, 48, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'seed speed (m/s)');
  R(cast, c, 'cooldown', 0, 30, 0.1, 'cooldown');
  R(cast, c, 'life', 1, 20, 0.5, 'deploy duration');
  R(cast, c, 'fadeTime', 0.1, 3, 0.05, 'un-fabricate time');
  R(cast, c, 'lifetime', 0.5, 20, 0.5, 'contract lifetime (unused)');
  R(cast, c, 'zoneRadius', 2, 12, 0.1, 'scan radius (m)');
  castAnimation(cast, c, Editor);

  const attack = subFolder(folder, 'Attack');
  R(attack, c, 'shotInterval', 0.2, 2, 0.05, 'shot interval');
  R(attack, c, 'damage', 0, 2, 0.05, 'damage');
  R(attack, c, 'hitImpulse', 0, 24, 0.1, 'impact impulse');
  R(attack, c, 'hitLift', 0, 20, 0.1, 'impact lift');
  R(attack, c, 'hitSpin', 0, 8, 0.1, 'impact spin');

  const light = subFolder(folder, 'Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0, 4, 0.05, 'height (m)');
  R(light, c, 'shotLight', 0, 10, 0.1, 'punch per shot');
  R(light, c, 'deployLight', 0, 20, 0.1, 'punch on landing');

  const seed = subFolder(folder, '1 · Fabrication seed');
  R(seed, c, 'seedSize', 0.05, 1, 0.01, 'size (m)');
  R(seed, c, 'seedSpin', 0, 30, 0.1, 'tumble (rad/s)');
  R(seed, c, 'seedArc', 0, 6, 0.05, 'arc height (m)');
  R(seed, c, 'seedGlow', 0, 6, 0.05, 'glow');
  R(seed, c, 'trailRate', 0, 240, 1, 'trail streaks/second');
  R(seed, c, 'trailSize', 0.01, 0.4, 0.005, 'trail size');
  R(seed, c, 'trailLife', 0.05, 2, 0.01, 'trail lifetime');
  R(seed, c, 'trailSpeed', 0, 10, 0.05, 'trail speed');
  seed.addColor(c, 'trailColor').name('trail tint');

  const floor = subFolder(folder, '2 · Scan floor');
  R(floor, c, 'telegraphOpacity', 0, 1, 0.01, 'landing telegraph');
  R(floor, c, 'floorOpacity', 0, 2, 0.01, 'opacity');
  R(floor, c, 'floorGlow', 0, 6, 0.05, 'glow');
  floor.addColor(c, 'floorColor').name('field colour');
  R(floor, c, 'gridScale', 0.5, 10, 0.05, 'hex grid density');
  R(floor, c, 'gridOpacity', 0, 1, 0.01, 'hex grid weight');
  R(floor, c, 'spokes', 1, 12, 1, 'spokes');
  R(floor, c, 'sweepSpeed', -8, 8, 0.05, 'sweep (rad/s)');
  R(floor, c, 'ringSpeed', 0, 12, 0.05, 'pulse speed');
  R(floor, c, 'floorNoise', 0, 1, 0.01, 'noise breakup');
  const pad = subFolder(floor, 'Pad');
  pad.addColor(c, 'deepColor').name('deep tone');
  R(pad, c, 'padReach', 0.05, 1, 0.01, 'pad radius (× scan)');
  R(pad, c, 'padDarkness', 0, 1, 0.01, 'darkness');
  R(pad, c, 'padSeams', 0.2, 4, 0.05, 'plate seams');
  R(pad, c, 'padSeamGlow', 0, 6, 0.05, 'seam heat glow');
  R(pad, c, 'padScorch', 0, 1, 0.01, 'scorch past the pad');

  const sentry = subFolder(folder, '3 · Sentry');
  const build = subFolder(sentry, 'Fabrication');
  R(build, c, 'housingScale', 0.3, 2.5, 0.01, 'scale');
  R(build, c, 'buildTime', 0.05, 3, 0.01, 'assemble time (s)');
  R(build, c, 'buildEdge', 0.01, 0.4, 0.005, 'cut edge height');
  R(build, c, 'buildNoise', 0, 0.6, 0.01, 'cut raggedness');
  R(build, c, 'buildGlow', 0, 8, 0.05, 'cut glow');
  const plates = subFolder(sentry, 'Plates');
  plates.addColor(c, 'metalColor').name('housing');
  plates.addColor(c, 'trimColor').name('seams + rim');
  R(plates, c, 'panelScale', 1, 20, 0.1, 'seams per metre');
  R(plates, c, 'panelGlow', 0, 3, 0.01, 'seam glow');
  R(plates, c, 'rimPower', 0.3, 8, 0.05, 'rim falloff');
  R(plates, c, 'rimStrength', 0, 2, 0.01, 'rim strength');
  R(plates, c, 'shine', 0, 3, 0.01, 'specular');
  R(plates, c, 'grime', 0, 1, 0.01, 'grime');
  const head = subFolder(sentry, 'Head');
  R(head, c, 'headSpin', -6, 6, 0.05, 'scan turn (rad/s)');
  R(head, c, 'vaneSway', 0, 0.6, 0.005, 'vane breathing');
  R(head, c, 'vaneSpeed', 0, 8, 0.05, 'breathing rate');
  R(head, c, 'recoilTime', 0.02, 1, 0.01, 'recoil settle (s)');
  R(head, c, 'recoilDepth', 0, 0.5, 0.005, 'recoil depth (m)');
  head.addColor(c, 'coreColor').name('core');
  R(head, c, 'coreGlow', 0, 6, 0.05, 'core glow');
  R(head, c, 'coreFlare', 0, 6, 0.05, 'core flare per shot');
  R(head, c, 'haloSpin', -8, 8, 0.05, 'halo turn (rad/s)');
  R(head, c, 'haloOpacity', 0, 1, 0.01, 'halo opacity');
  R(head, c, 'unfoldTime', 0.02, 2, 0.01, 'vanes unfold over (s)');
  R(head, c, 'unfoldFold', 0, 2.5, 0.01, 'vanes folded by (rad)');
  R(build, c, 'shadows', 0, 1, 1, 'casts shadows');

  const shot = subFolder(folder, '4 · The shot');
  const beam = subFolder(shot, 'Beam');
  beam.addColor(c, 'beamColor').name('neutral (tech)');
  beam.addColor(c, 'stormColor').name('vs wet → storm');
  beam.addColor(c, 'frostColor').name('vs burning → frost');
  beam.addColor(c, 'fireColor').name('vs chilled → fire');
  R(beam, c, 'beamTime', 0.02, 1, 0.01, 'beam time (s)');
  R(beam, c, 'beamWidth', 0.01, 0.4, 0.005, 'beam width (m)');
  R(beam, c, 'beamArc', 0, 4, 0.05, 'bolt arcs up by (m)');
  R(beam, c, 'beamSwing', 0, 4, 0.05, 'bolt swings out sideways by (m)');
  R(beam, c, 'beamThrow', -2, 3, 0.05, 'bolt bows outward by (m)');
  R(beam, c, 'beamAlternate', 0, 1, 1, 'alternate side each shot');
  R(beam, c, 'beamGlow', 0, 8, 0.05, 'beam glow');
  R(beam, c, 'beamNoise', 0, 2, 0.01, 'beam noise');
  const lock = subFolder(shot, 'Lock-on sight');
  lock.addColor(c, 'lockColor').name('sight colour');
  R(lock, c, 'lockTime', 0, 1, 0.01, 'drawn before a shot (s)');
  R(lock, c, 'lockWidth', 0.005, 0.2, 0.005, 'width (m)');
  R(lock, c, 'lockArc', 0, 4, 0.05, 'sight arcs up by (m)');
  R(lock, c, 'lockOpacity', 0, 1.5, 0.01, 'brightness');
  const arrival = subFolder(shot, 'Arrival');
  R(arrival, c, 'impactRadius', 0.2, 3, 0.05, 'reticle size (m)');
  R(arrival, c, 'impactDuration', 0.1, 1, 0.05, 'reticle time (s)');
  R(arrival, c, 'impactShake', 0, 1, 0.01, 'camera knock');
  R(arrival, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(arrival, c, 'hitDecalRadius', 0, 4, 0.05, 'arc decal (m)');
  R(arrival, c, 'hitDecalLife', 0.1, 3, 0.05, 'arc decal life');
  R(arrival, c, 'muzzleSize', 0, 3, 0.05, 'muzzle flash (m)');
  R(arrival, c, 'muzzleHeight', -1, 1.5, 0.01, 'bolt leaves at (m above head × scale)');
  R(arrival, c, 'muzzleReach', 0, 1.5, 0.01, 'bolt leaves at (m out × scale)');
  R(arrival, c, 'muzzleLife', 0.02, 1, 0.01, 'muzzle flash life');
  R(arrival, c, 'shotBurst', 0, 4, 0.05, 'impact shell (m)');
  R(arrival, c, 'shotBurstLife', 0.05, 1.5, 0.01, 'impact shell life');
  R(arrival, c, 'scorchRadius', 0, 3, 0.05, 'scorch left (m)');
  R(arrival, c, 'scorchLife', 0.2, 12, 0.1, 'scorch life (s)');
  const sparks = subFolder(shot, 'Sparks');
  R(sparks, c, 'sparkCount', 0, 96, 1, 'count');
  R(sparks, c, 'sparkSize', 0.01, 0.4, 0.005, 'size');
  R(sparks, c, 'sparkLife', 0.05, 2, 0.01, 'lifetime');
  R(sparks, c, 'sparkSpeed', 0, 20, 0.1, 'speed');
  R(sparks, c, 'particleGravity', -20, 5, 0.1, 'particle gravity');
  R(sparks, c, 'particleDrag', 0, 4, 0.01, 'particle drag');
  gradient(sparks, c, 'colorSpark', 'particle gradient (all layers)');

  const deploy = subFolder(folder, '5 · Deploy beat');
  R(deploy, c, 'deployShake', 0, 1, 0.01, 'camera knock');
  R(deploy, c, 'deployFlash', 0, 1, 0.01, 'flash');
  R(deploy, c, 'shockRadius', 0, 10, 0.05, 'shockwave (m)');
  R(deploy, c, 'debrisCount', 0, 96, 1, 'debris count');
  R(deploy, c, 'debrisSize', 0.02, 0.6, 0.005, 'debris size');
  R(deploy, c, 'debrisLife', 0.1, 4, 0.05, 'debris lifetime');
  R(deploy, c, 'debrisSpeed', 0, 16, 0.1, 'debris speed');
  deploy.addColor(c, 'debrisColor').name('debris tint');

  const motes = subFolder(folder, '6 · Motes');
  R(motes, c, 'moteRate', 0, 120, 1, 'per second');
  R(motes, c, 'moteSize', 0.01, 0.3, 0.005, 'size');
  R(motes, c, 'moteLife', 0.1, 4, 0.05, 'lifetime');
  R(motes, c, 'moteRise', 0, 4, 0.05, 'rise (m/s)');
  motes.addColor(c, 'moteColor').name('mote tint');

  const warp = subFolder(folder, '7 · Distortion');
  R(warp, c, 'warpStrength', 0, 2, 0.01, 'idle shimmer');
  R(warp, c, 'warpShot', 0, 4, 0.01, 'shimmer per shot');
  R(warp, c, 'warpWidth', 0.2, 6, 0.05, 'width (m)');
  R(warp, c, 'warpHeight', 0.2, 6, 0.05, 'height (m)');
  R(warp, c, 'warpScale', 0.1, 8, 0.05, 'noise scale');
  R(warp, c, 'warpSpeed', 0, 8, 0.05, 'noise speed');

  return folder;
}
