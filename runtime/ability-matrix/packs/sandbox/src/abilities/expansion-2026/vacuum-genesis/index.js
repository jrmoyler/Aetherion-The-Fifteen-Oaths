import { Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { createExpansionFX, routeExpansionTransparency, expansionBurst, ParticleShape } from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import {
  createKnotGeometry,
  createPlateGeometry,
  createPocketGeometry,
  createQuad,
  createSeedGeometry,
  createWebGeometry,
  createWebNodes,
  domePoint,
  domeT,
  domeWobble,
} from './geometry.js';
import {
  createFloorMaterial,
  createHaloMaterial,
  createKnotMaterial,
  createLensMaterial,
  createSeedMaterial,
  createSkinMaterial,
  createVoidMaterial,
  createWebMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
export const UID = 'matrix-expansion/vacuum-genesis';

const TAU = Math.PI * 2;
/** Condensation knots on the dome (the web's graph is built once from them). */
const WEB_NODES = 34;
/** Shell plates of new rock, at most. */
const MAX_PLATES = 40;
/** Bodies one pocket can hold, at most (`maxTargets` clamps to this). */
const MAX_TARGETS = 8;
/** Batches the birth's dust ring is thrown in, round the lip. */
const DUST_BATCHES = 12;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

const _obj = new Object3D();
const _p = new Vector3();
const _n = new Vector3();
const _q = new Vector3();
const _dir = new Vector3();
const _pos = new Vector3();
const _up = new Vector3(0, 1, 0);
/** Reused option bags: emitters read them, never keep them. */
const _emit = {};
const _burst = { count: 0, size: 0, life: 0, speed: 0, spread: 0, radius: 0 };
/** Scratch query point for the combat binding (read synchronously, kept by nobody). */
const _source = [0, 0, 0];

/** Particle look from the ramp and the globals; a stub system without uniforms is skipped. */
function particleLook(system, glow, a, b, c, d) {
  const u = system?.uniforms;
  if (!u) return;
  const g = settings.global;
  system.setGradient?.(getColor(a), getColor(b), getColor(c), getColor(d));
  if (u.uGlow) u.uGlow.value = glow * g.glow;
  if (u.uOpacity) u.uOpacity.value = g.opacity;
  if (u.uTurbulence) u.uTurbulence.value = 0.5 * g.turbulence;
  if (u.uSizeScale) u.uSizeScale.value = g.particleSize;
  if (u.uSpeedScale) u.uSpeedScale.value = g.particleSpeed;
  if (u.uLifeScale) u.uLifeScale.value = g.particleLifetime;
}

/**
 * VACUUM GENESIS — cosmic, zone cast. The design note is *vacuum pocket*.
 *
 * Every other cosmic cast in the matrix is about something heavy arriving —
 * a meteor, an orrery of planets, a singularity that pulls. This one is about
 * **nothing** arriving, and then something being *made* out of it.
 *
 *   1. **anticipation / travel** — a faceted seed with a black heart buds at
 *      the hand and is lobbed on a high arc, an accretion swirl turning round
 *      it and a trail of violet streaks behind. The floor under the target
 *      dims to the pocket's size while it falls: the telegraph.
 *   2. **impact — the birth** — the seed touches down and a bubble of true
 *      vacuum blows out over the circle in a third of a second, overshooting
 *      and ringing back. The air is thrown out of it: a ring of dust blasted
 *      off the lip, an AIR shell, shockwave, dust ring and crack decals, the
 *      floor stripped dark with streaks dragged outward and a burning tear at
 *      the lip. Light punch, flash, camera knock. Everything standing inside
 *      loses its footing.
 *   3. **linger — the pocket** — for `holdTime` the bodies float weightless
 *      at `floatHeight`, turning slowly round the middle. The skin breathes
 *      and its standing waves ring down; the inside is a hole in the world
 *      with a nebula and stars being born in it. A **cosmic web** crawls up
 *      the skin from the floor — white-hot tips, then pulses — and where the
 *      threads meet, knots condense and **plates of new rock** accrete on
 *      them. Crystal cracks spread across the floor under it; in the last
 *      quarter fractures open across the skin.
 *   4. **exit — genesis** — the web closes over the crown and the shell is
 *      born: the threads flare, the skin dissolves crown-down through a
 *      burning edge, the plates are thrown outward (lit, solid, shadowed)
 *      and fall, the floating bodies are hurled clear with them, a STORM
 *      shell and a scorch mark are left; the plates settle and shrink into
 *      the floor as the stain fades.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the seed** — faceted spindle (`createSeedMaterial`, opaque) and its
 *      accretion halo (`createHaloMaterial`).
 *   2. **the skin** — the hero: a superellipse bubble on a meniscus lip,
 *      placed and rippled in the vertex shader (`createSkinMaterial`).
 *   3. **the void** — the bubble's inside, normal-blended dark with newborn
 *      stars (`createVoidMaterial`).
 *   4. **the cosmic web** — tubes on great arcs between Fibonacci knots
 *      (`createWebMaterial`) and the instanced knots (`createKnotMaterial`).
 *   5. **the new rock** — instanced bevelled plates, `MeshStandardMaterial`
 *      on `LAYER.WORLD`, casting shadows: the only solid thing in the cast,
 *      because it is the thing the vacuum *made*.
 *   6. **the floor** — the stripped-floor field (`createFloorMaterial`) and
 *      CRACK / SHOCKWAVE / DUSTRING / SCORCH decals.
 *   7. **particles** — SMOKE dust ring, STREAK seed trail and web sparks,
 *      SOFT newborn motes, CHIP rock at the rupture.
 *   8. **bursts** — AIR shell at the birth, STORM shell at the rupture.
 *   9. **the lens** — the skin on `LAYER.DISTORTION` (`createLensMaterial`).
 *  10. **the light** — the base light, punched at the birth and the rupture.
 *
 * ## Gameplay (`handlesOwnHits`)
 *
 * With UCSM combat live: at the birth every enemy inside `zoneRadius` (up to
 * `maxTargets`) takes `birthDamage` and the cosmic status (`starmarked`) for
 * the hold; at the rupture each held enemy still alive and still within the
 * pocket takes `ruptureDamage` with an outward blow. Without it (sandbox
 * dummies): the birth knocks the dummies inside off their feet with a soft
 * lift, the pocket carries them weightless (`Dummy#carry`, buoyancy) for the
 * hold, and the rupture shoves them outward and gives their weight back.
 * Every count is bounded; nothing is random in the rule.
 *
 * ## The editor rule
 *
 * Records keep dice (plate bearings, sizes, spins) and event clocks only;
 * every dimension is resolved from `settings.vacuumGenesis` every frame, so
 * dragging `zoneRadius` mid-cast moves the skin, the web, the knots, the
 * plates, the floor and the held bodies' orbit together.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return WEB_NODES + MAX_PLATES;
  }

  get lifetimeScale() {
    return Math.max(0.1, settings.global.lifetime);
  }

  /** The hold: the pocket lingers, then the shell is born when the impact phase ends. */
  get impactDuration() {
    return Math.max(0.2, this.config.holdTime) * this.lifetimeScale;
  }

  get fadeDuration() {
    return Math.max(0.1, this.config.exitTime) * this.lifetimeScale;
  }

  /** Seconds since the birth on the staging clock the settings are authored in. */
  get stagedTime() {
    return (this.impactTime + (this.phase === 'fade' ? this.fadeTime : 0)) / this.lifetimeScale;
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

    // The seed flies on its own: it is not part of the pocket.
    this.seed = new Group();
    this.group.add(this.seed);
    this.seedMat = own(createSeedMaterial());
    this.seedMesh = new Mesh(own(createSeedGeometry()), this.seedMat);
    this.seed.add(this.seedMesh);
    const quad = own(createQuad());
    this.haloMat = own(createHaloMaterial());
    this.halo = new Mesh(quad, this.haloMat);
    this.halo.renderOrder = 9;
    this.seed.add(this.halo);

    // The pocket: everything centred on the landing point.
    this.root = new Group();
    this.group.add(this.root);
    const pocket = own(createPocketGeometry());

    this.voidMat = own(createVoidMaterial());
    this.voidMesh = new Mesh(pocket, this.voidMat);
    this.voidMesh.renderOrder = 3;
    this.voidMesh.frustumCulled = false;
    this.root.add(this.voidMesh);

    this.skinMat = own(createSkinMaterial());
    this.skin = new Mesh(pocket, this.skinMat);
    this.skin.renderOrder = 5;
    this.skin.frustumCulled = false;
    this.root.add(this.skin);

    this.nodes = createWebNodes(WEB_NODES);
    this.webMat = own(createWebMaterial());
    this.web = new Mesh(own(createWebGeometry(this.nodes)), this.webMat);
    this.web.renderOrder = 6;
    this.web.frustumCulled = false;
    this.root.add(this.web);

    this.knotMat = own(createKnotMaterial());
    this.knots = new InstancedMesh(own(createKnotGeometry()), this.knotMat, WEB_NODES);
    this.knots.renderOrder = 7;
    this.knots.frustumCulled = false;
    this.root.add(this.knots);

    // The new rock is solid, lit by the sun and shadowed: world layer.
    this.rock = own(new MeshStandardMaterial({ color: 0x2a2140, roughness: 0.55, metalness: 0.35, emissive: 0x7b3dff, emissiveIntensity: 1 }));
    this.plates = new InstancedMesh(own(createPlateGeometry()), this.rock, MAX_PLATES);
    this.plates.castShadow = true;
    this.plates.receiveShadow = true;
    this.plates.frustumCulled = false;
    this.root.add(this.plates);

    this.floorMat = own(createFloorMaterial());
    this.floor = new Mesh(quad, this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = 0.03;
    this.floor.renderOrder = 2;
    this.root.add(this.floor);

    this.lensMat = own(createLensMaterial());
    this.lens = new Mesh(pocket, this.lensMat);
    this.lens.frustumCulled = false;
    this.root.add(this.lens);

    // Dice: each plate sits on a knot with its own jitter, size and spin.
    this.plateDice = new Float32Array(MAX_PLATES * 5);
    for (let i = 0; i < MAX_PLATES; i++) {
      const h = (k) => {
        const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453;
        return x - Math.floor(x);
      };
      this.plateDice[i * 5] = (i * 11 + 5) % WEB_NODES; // knot
      this.plateDice[i * 5 + 1] = (h(1) - 0.5) * 0.22; // azimuth jitter (rad)
      this.plateDice[i * 5 + 2] = (h(2) - 0.5) * 0.08; // elevation jitter
      this.plateDice[i * 5 + 3] = h(3); // size
      this.plateDice[i * 5 + 4] = h(4); // spin
    }

    // Shared state handed to every material's sync — one object, reused.
    this._shape = {
      radius: 1, height: 1, lip: 0.16, inflate: 0, clock: 0, wobble: 0, modes: 5, wobbleSpeed: 3,
      fade: 1, flash: 0, crack: 0, dissolve: 0, growth: 0, birth: 0, flare: 0, strength: 0, shock: 0,
    };
    this._seedState = { pulse: 0 };
    this._haloState = { spin: 0, fade: 1 };
    this._knotState = { fade: 1 };
    this._floorState = { tear: 0, growth: 0, fade: 1, dissolve: 0, clock: 0, lip: 0.16 };

    // Held bodies (dummy path) and held actor ids (combat path): fixed pools.
    this._held = new Array(MAX_TARGETS).fill(null);
    this._heldIds = new Array(MAX_TARGETS).fill(null);
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    /** Bound once: `Dummy#carry` samples it at every joint, every frame. */
    this._field = (x, y, z, out) => this._sampleField(x, y, z, out);

    routeExpansionTransparency(this.group);
    this.lens.layers.set(LAYER.DISTORTION);
    this.seedMesh.layers.set(LAYER.WORLD);
    this.plates.layers.set(LAYER.WORLD);
    this._disposed = false;
  }

  createParticles() {
    const p = this.ctx.particles;
    this.dust = p?.get?.('vacuumGenesis.dust', { capacity: 360, shape: ParticleShape.SMOKE, additive: false, curl: true, softFade: 0.6 }) ?? null;
    this.sparks = p?.get?.('vacuumGenesis.spark', { capacity: 600, shape: ParticleShape.STREAK, additive: true, stretch: true, softFade: 0.3 }) ?? null;
    this.motes = p?.get?.('vacuumGenesis.mote', { capacity: 360, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.4 }) ?? null;
    this.chips = createExpansionFX(this.ctx, 'vacuum-genesis', {
      shape: ParticleShape.CHIP,
      colors: ['#f6efff', '#c9a9ff', '#7b3dff', '#12082c'],
    });
    this._trailRate = new RateEmitter();
    this._moteRate = new RateEmitter();
    this._sparkRate = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this._born = false;
    this._ruptured = false;
    this._gathered = false;
    this._clock = 0;
    this._calm = prefersReducedMotion();
    this._heldCount = 0;
    this._heldIdCount = 0;
    this._birthHits = 0;
    this._ruptureHits = 0;
    this._sparkCursor = 0;
    for (let i = 0; i < MAX_TARGETS; i++) {
      this._held[i] = null;
      this._heldIds[i] = null;
    }
    this._trailRate.reset();
    this._moteRate.reset();
    this._sparkRate.reset();
    this.seed.visible = true;
    this.root.visible = true;
    this._sync(0);
  }

  onTravel(dt) {
    const c = this.config;
    // Seed trail.
    if (this.sparks) {
      const n = this._trailRate.tick(dt, c.seedTrailRate * settings.global.particleCount);
      if (n > 0) {
        this._seedPoint(this.u, _pos);
        _emit.position = _pos;
        _emit.radius = c.seedSize * 0.6;
        _emit.direction = _dir.copy(this.direction).negate();
        _emit.speed = 1.2;
        _emit.speedVariance = 0.5;
        _emit.spread = 0.6;
        _emit.inherit = null;
        _emit.anchor = null;
        _emit.size = c.seedTrailSize;
        _emit.sizeVariance = 0.5;
        _emit.life = 0.45;
        _emit.lifeVariance = 0.4;
        _emit.spin = 0;
        _emit.tint = null;
        _emit.time = frame.uTime.value;
        this.sparks.emit(n, _emit);
      }
    }
    this._sync(dt);
  }

  onImpact() {
    this.position.y = 0;
    this._born = true;
    this.seed.visible = false;
    this._birth();
    this._sync(0);
  }

  onFade(dt) {
    if (this.phase === 'fade' && !this._ruptured) {
      this._ruptured = true;
      this._rupture();
    }
    if (this.phase === 'impact') {
      if (!this._gathered && this.stagedTime >= 0.15) this._gather();
      this._carryHeld(dt);
      this._emitLinger(dt);
    }
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Gameplay                                                            */
  /* ------------------------------------------------------------------ */

  /** Which side does the rule run on? 'combat' (UCSM), 'dummies', 'standalone' or null. */
  _route() {
    if (this._scope && !this._scope.standalone) return 'combat';
    if (this.ctx.dummies?.findTargets) return 'dummies';
    if (this._scope) return 'standalone';
    return null;
  }

  _limit() {
    return Math.max(0, Math.min(MAX_TARGETS, Math.round(this.config.maxTargets)));
  }

  /** The air leaves: everyone inside is taken off their feet and held. */
  _birth() {
    const c = this.config;
    const R = c.zoneRadius;
    const limit = this._limit();
    const route = this._route();
    _source[0] = this.position.x;
    _source[1] = 0;
    _source[2] = this.position.z;
    if (route === 'combat' || route === 'standalone') {
      const found = this._scope.queryActors({ position: _source, radius: R, relation: 'enemy' });
      if (!found.ok) {
        this.failure = found.reason;
      } else {
        const ticks = Math.max(1, Math.round(this.impactDuration * (this._scope.tickRate || 30)));
        for (const actor of found.actors) {
          if (this._heldIdCount >= limit) break;
          const hit = this._scope.emit({
            type: 'hit', element: 'cosmic', targetIds: [actor.id], position: actor.position, sourcePosition: _source,
            damage: c.birthDamage, hitForce: { impulse: Math.min(24, c.holdImpulse), lift: Math.min(20, c.holdLift), spin: 1 },
            tags: ['vacuum-genesis', 'vacuum-pocket'],
          });
          if (!hit.ok) {
            this.failure = hit.reason;
            continue;
          }
          this._birthHits++;
          this._heldIds[this._heldIdCount++] = actor.id;
          if (route === 'combat') {
            const status = this._scope.emit({
              type: 'status', element: 'cosmic', targetIds: [actor.id], position: actor.position,
              durationTicks: ticks, tags: ['vacuum-pocket'],
            });
            if (!status.ok) this.failure = status.reason;
          }
        }
      }
    } else if (route === 'dummies') {
      const found = this.ctx.dummies.findTargets(this.position.x, this.position.z, R, this._found);
      this._force.impulse = c.holdImpulse;
      this._force.lift = c.holdLift;
      this._force.spin = 1;
      for (const dummy of found) {
        if (this._heldCount >= limit) break;
        _dir.set(dummy.position.x - this.position.x, 0, dummy.position.z - this.position.z);
        if (_dir.lengthSq() > R * R) continue;
        if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction);
        else _dir.normalize();
        if (dummy.kill(_dir.x, _dir.z, this._force)) {
          this._birthHits++;
          this._held[this._heldCount++] = dummy;
        }
      }
    }
    this._birthFX();
  }

  /** The shell is born: held bodies are thrown clear and given their weight back. */
  _rupture() {
    const c = this.config;
    const R = c.zoneRadius;
    const power = settings.global.explosionIntensity;
    _source[0] = this.position.x;
    _source[1] = 0;
    _source[2] = this.position.z;
    if (this._heldIdCount > 0 && this._scope) {
      const force = impactForce(c, power);
      for (let i = 0; i < this._heldIdCount; i++) {
        const id = this._heldIds[i];
        const got = this._scope.getActor(id);
        if (!got.ok) {
          this.failure = got.reason;
          continue;
        }
        const a = got.actor;
        if (!a.alive) continue;
        if (Math.hypot(a.position[0] - _source[0], a.position[2] - _source[2]) > R * 1.25) continue;
        const sent = this._scope.emit({
          type: 'hit', element: 'cosmic', targetIds: [id], position: a.position, sourcePosition: _source,
          damage: c.ruptureDamage, hitForce: force, tags: ['vacuum-genesis', 'genesis'],
        });
        if (sent.ok) this._ruptureHits++;
        else this.failure = sent.reason;
      }
    }
    for (let i = 0; i < this._heldCount; i++) {
      const dummy = this._held[i];
      if (!dummy) continue;
      dummy.bodyPoint?.(_p) ?? _p.copy(dummy.position);
      _dir.set(_p.x - this.position.x, 0, _p.z - this.position.z);
      if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction);
      else _dir.normalize();
      const out = Math.min(24, c.hitImpulse * power);
      dummy.shove?.(_dir.x * out, Math.min(20, c.hitLift * power), _dir.z * out);
      dummy.release?.();
      if (!this._heldIdCount) this._ruptureHits++;
      this._held[i] = null;
    }
    this._heldCount = 0;
    this._ruptureFX();
  }

  /**
   * With UCSM combat live the knockdown is the combat host's; once it has
   * landed, the pocket takes hold of the bodies it felled so they float the
   * same way they do on the dummy path. Presentation only: no extra hits.
   */
  _gather() {
    this._gathered = true;
    if (this._route() !== 'combat' || !this._heldIdCount || !this.ctx.dummies?.findBodies) return;
    const R = this.config.zoneRadius;
    const limit = Math.min(this._limit(), this._heldIdCount);
    const found = this.ctx.dummies.findBodies(this.position.x, this.position.z, R, this._found);
    for (const dummy of found) {
      if (this._heldCount >= limit) break;
      if (dummy.alive || typeof dummy.carry !== 'function') continue;
      this._held[this._heldCount++] = dummy;
    }
  }

  /** The pocket's flow: drift up to `floatHeight`, turn round the middle, stay inside. */
  _sampleField(x, y, z, out) {
    const c = this.config;
    const R = Math.max(0.5, c.zoneRadius);
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    const r = Math.hypot(dx, dz) || 1e-4;
    const orbit = this._calm ? 0 : c.floatOrbit;
    // Tangential swirl, a gentle inward wall past 70 % of the radius, and the lift.
    const wall = Math.max(0, r - R * 0.7) * 2.2;
    out.set(-dz * orbit - (dx / r) * wall, (c.floatHeight - y) * 2.4, dx * orbit - (dz / r) * wall);
    return out;
  }

  _carryHeld() {
    const c = this.config;
    const grab = clamp01(c.floatGrab);
    for (let i = 0; i < this._heldCount; i++) {
      const dummy = this._held[i];
      if (!dummy) continue;
      dummy.carry?.(this._field, grab, grab, clamp01(c.floatBuoyancy));
      dummy.hold?.();
    }
  }

  /* ------------------------------------------------------------------ */
  /* The beats' one-shot effects                                          */
  /* ------------------------------------------------------------------ */

  _birthFX() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = c.zoneRadius;
    this.lightBoost = c.birthLight * power;
    _pos.copy(this.position).setY(0.05);
    this.ctx.bursts?.spawn?.(BurstMode.AIR, _pos, {
      radius: R * 0.2, endRadius: R * c.birthBurstReach * power, life: c.birthBurstLife,
      intensity: c.burstIntensity, opacity: c.burstOpacity * g.opacity, fresnel: c.burstFresnel, squash: 0.55,
      colorA: getColor(c.colorCore), colorB: getColor(c.colorTint), colorC: getColor(c.colorBody),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: R * 1.35 * power, life: c.decalLife * 0.4, width: c.shockwaveWidth, intensity: c.shockwaveIntensity,
      colorA: getColor(c.colorCore), colorB: getColor(c.colorBody),
    });
    this.ctx.decals?.spawn?.(DecalType.DUSTRING, _pos, {
      radius: R * 1.25, life: c.decalLife * 0.6, intensity: c.dustRingIntensity,
      colorA: getColor(c.colorTint), colorB: getColor(c.colorDeep),
    });
    this.ctx.decals?.spawn?.(DecalType.CRACK, _pos, {
      radius: R * 1.05, life: c.decalLife, intensity: c.crackIntensity,
      colorA: getColor(c.colorTint), colorB: getColor(c.colorBody),
    });
    if (c.birthShake > 0) this.ctx.shake?.add?.(c.birthShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.birthFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorTint), c.birthFlash * power);
    // The air thrown out of the pocket, all round the lip.
    if (this.dust) {
      const per = Math.round((c.dustCount * g.particleCount) / DUST_BATCHES);
      for (let k = 0; k < DUST_BATCHES && per > 0; k++) {
        const a = (k / DUST_BATCHES) * TAU + 0.2;
        _pos.set(this.position.x + Math.cos(a) * R * 0.95, 0.35, this.position.z + Math.sin(a) * R * 0.95);
        _dir.set(Math.cos(a), 0.18, Math.sin(a));
        this._emitInto(this.dust, per, _pos, R * 0.18, _dir, c.dustSpeed, 0.3, c.dustSize, c.dustLife, 1.5);
      }
    }
  }

  _ruptureFX() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = c.zoneRadius;
    this.lightBoost = c.ruptureLight * power;
    _pos.copy(this.position).setY(c.domeHeight * R * 0.45);
    this.ctx.bursts?.spawn?.(BurstMode.STORM, _pos, {
      radius: R * 0.5, endRadius: R * c.ruptureBurstReach * power, life: c.ruptureBurstLife,
      intensity: c.burstIntensity, opacity: c.burstOpacity * g.opacity, fresnel: c.burstFresnel, squash: 0.7,
      colorA: getColor(c.colorCore), colorB: getColor(c.colorTint), colorC: getColor(c.colorBody),
    });
    _pos.y = 0.05;
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _pos, {
      radius: R * 0.95, life: c.decalLife, intensity: 1,
      colorA: getColor(c.colorBody), colorB: getColor(c.colorDeep),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: R * 1.7 * power, life: c.decalLife * 0.35, width: c.shockwaveWidth * 1.3, intensity: c.shockwaveIntensity,
      colorA: getColor(c.colorCore), colorB: getColor(c.colorTint),
    });
    if (c.ruptureShake > 0) this.ctx.shake?.add?.(c.ruptureShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.ruptureFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorCore), c.ruptureFlash * power);
    _pos.set(this.position.x, c.domeHeight * R * 0.5, this.position.z);
    _burst.count = c.chipCount;
    _burst.size = c.chipSize;
    _burst.life = c.chipLife;
    _burst.speed = c.chipSpeed;
    _burst.spread = 1;
    _burst.radius = R * 0.6;
    expansionBurst(this.chips, _pos, _burst);
  }

  /** Newborn motes rise inside the pocket; sparks run off the growing web. */
  _emitLinger(dt) {
    const c = this.config;
    const g = settings.global;
    const R = c.zoneRadius;
    if (this.motes) {
      const n = this._moteRate.tick(dt, c.moteRate * g.particleCount);
      if (n > 0) {
        const a = this.age * 7.31;
        _pos.set(this.position.x + Math.cos(a) * R * 0.35, 0.3, this.position.z + Math.sin(a) * R * 0.35);
        this._emitInto(this.motes, n, _pos, R * 0.5, _up, 0.7, 0.6, c.moteSize, c.moteLife, 0);
      }
    }
    if (this.sparks) {
      const n = this._sparkRate.tick(dt, c.sparkRate * g.particleCount);
      if (n > 0) {
        // A knot just reached by the web, walked in golden steps.
        const growth = this._growth();
        for (let tries = 0; tries < WEB_NODES; tries++) {
          const k = (this._sparkCursor = (this._sparkCursor + 13) % WEB_NODES);
          const el = this.nodes[k * 2 + 1];
          if (el * 0.82 > growth) continue;
          this._knotPoint(k, _pos, _n);
          _pos.add(this.position);
          this._emitInto(this.sparks, n, _pos, 0.1, _n, 1.8, 0.7, c.sparkSize, c.sparkLife, 0);
          break;
        }
      }
    }
  }

  _emitInto(system, count, position, radius, direction, speed, spread, size, life, spin) {
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = speed;
    _emit.speedVariance = 0.4;
    _emit.spread = spread;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = size;
    _emit.sizeVariance = 0.45;
    _emit.life = life;
    _emit.lifeVariance = 0.35;
    _emit.spin = spin;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    system.emit(count, _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Placement helpers — every one resolved from settings                */
  /* ------------------------------------------------------------------ */

  /** Seed position on its lob, at fraction `u` of the line. */
  _seedPoint(u, out) {
    const c = this.config;
    this.pointAt(u, out);
    out.y = 4 * c.seedArc * u * (1 - u) + 1.3 * (1 - u) * (1 - u);
    return out;
  }

  /** Web growth on the edges' clock: 0 → (0.82 + span) over the hold. */
  _growth() {
    const c = this.config;
    if (!this._born) return 0;
    return clamp01(this.stagedTime / Math.max(0.2, c.holdTime)) * (0.82 + c.webGrowSpan);
  }

  /** Knot `k` on the live skin (local frame, inflated), and its outward normal. */
  _knotPoint(k, out, normal) {
    const az = this.nodes[k * 2];
    const t = domeT(this.nodes[k * 2 + 1]);
    this._skinPoint(az, t, out, normal);
    return out;
  }

  /** A point on the live skin with its outward normal (local frame, inflated, rippled). */
  _skinPoint(az, t, out, normal) {
    const s = this._shape;
    domePoint(az, t, s.radius, s.height, s.lip, out);
    domePoint(az, Math.min(1, t + 0.004), s.radius, s.height, s.lip, _q);
    domePoint(az, Math.max(0, t - 0.004), s.radius, s.height, s.lip, normal);
    _q.sub(normal); // meridian tangent
    domePoint(az + 0.02, t, s.radius, s.height, s.lip, normal);
    normal.sub(out); // azimuthal tangent
    normal.crossVectors(_q, normal);
    if (normal.lengthSq() < 1e-12) normal.set(0, 1, 0);
    else normal.normalize();
    out.addScaledVector(normal, domeWobble(az, t, s.clock, s.wobble, s.modes, s.wobbleSpeed));
    out.multiplyScalar(s.inflate);
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const R = Math.max(0.3, c.zoneRadius);
    if (!this._calm) this._clock += dt * g.animationSpeed;
    const clock = this._clock;
    const st = this._born ? this.stagedTime : 0;
    const hold = Math.max(0.2, c.holdTime);
    const exitT = this.phase === 'fade' ? clamp01(this.fadeTime / this.fadeDuration) : 0;
    const exitS = this.phase === 'fade' ? this.fadeTime / this.lifetimeScale : 0;
    const life = clamp01(st / hold);

    // 1 · the seed in flight.
    if (this.seed.visible) {
      this._seedPoint(this.u, this.seed.position);
      const bud = smooth(this.age / 0.15);
      const size = c.seedSize * (0.3 + 0.7 * bud);
      this.seedMesh.scale.setScalar(size);
      this.seedMesh.rotation.set(clock * c.seedSpin * 0.6, clock * c.seedSpin, 0.4);
      this.halo.scale.setScalar(size * 3 * c.seedHalo);
      if (this.ctx.camera) this.halo.quaternion.copy(this.ctx.camera.quaternion);
      this._seedState.pulse = 0.5 + 0.5 * Math.sin(this.age * 22);
      this.seedMat.userData.sync(this._seedState);
      this._haloState.spin = clock * 6;
      this._haloState.fade = bud;
      this.haloMat.userData.sync(this._haloState);
    }

    // The pocket's shape, resolved from settings this frame.
    const s = this._shape;
    s.radius = R;
    s.height = Math.max(0.2, c.domeHeight) * R;
    s.lip = Math.max(0, c.lipCurl);
    let inflate = 0;
    if (this._born) {
      const x = clamp01(st / Math.max(0.05, c.inflateTime));
      const k = Math.max(0, c.inflateOvershoot);
      const xm = x - 1;
      inflate = x >= 1 ? 1 : 1 + (k + 1) * xm * xm * xm + k * xm * xm;
      inflate = Math.max(0.001, inflate);
      if (!this._calm) inflate *= 1 + c.breath * Math.sin(clock * 2.3) * (1 - exitT);
      inflate *= 1 + 0.06 * smooth(exitT * 2);
    }
    s.inflate = inflate;
    s.clock = clock;
    const ring = Math.exp(-Math.max(0, c.wobbleDecay) * st);
    s.wobble = this._calm ? 0 : c.wobble * R * (0.2 + 0.8 * ring) * (1 - exitT) * g.turbulence;
    s.modes = Math.round(c.wobbleModes);
    s.wobbleSpeed = c.wobbleSpeed;
    s.fade = 1;
    s.flash = this._born ? Math.exp(-st * 9) : 0;
    s.crack = this._ruptured ? 1 - exitT : smooth((life - 0.72) / 0.28);
    s.dissolve = smooth(exitT / 0.9);
    s.growth = this._growth();
    s.birth = life;
    s.flare = this._ruptured ? Math.exp(-exitS * 5) * 1.2 : 0;
    s.strength = this._born ? 1 - exitT : 0;
    s.shock = this._born ? Math.exp(-st * 7) + (this._ruptured ? Math.exp(-exitS * 6) : 0) : 0;

    // Before the birth the pocket's floor telegraph waits at the end of the line.
    if (this._born) this.root.position.copy(this.position);
    else this.pointAt(1, this.root.position);
    this.root.position.y = 0;
    const pocketOn = this._born && exitT < 1;
    this.skin.visible = pocketOn;
    this.voidMesh.visible = pocketOn;
    this.web.visible = pocketOn && s.growth > 0.001;
    this.knots.visible = pocketOn;
    this.plates.visible = this._born;
    if (pocketOn) {
      this.skinMat.userData.sync(s);
      this.voidMat.userData.sync(s);
      s.fade = 1 - smooth(exitT / 0.7);
      this.webMat.userData.sync(s);
      s.fade = 1;
    }
    this.lens.visible = !this._calm && pocketOn && (c.lensStrength + c.lensShock) * g.distortion > 0.002;
    if (this.lens.visible) this.lensMat.userData.sync(s);

    // 4 · knots condense where the threads arrive.
    if (pocketOn) {
      const kfade = 1 - smooth(exitT / 0.5);
      for (let k = 0; k < WEB_NODES; k++) {
        const born = smooth((s.growth - this.nodes[k * 2 + 1] * 0.82) / 0.12);
        this._knotPoint(k, _p, _n);
        _obj.position.copy(_p).addScaledVector(_n, 0.04 * R);
        _obj.rotation.set(0, 0, 0);
        _obj.scale.setScalar(Math.max(1e-4, c.knotSize * R * 0.4 * born * (1 + 0.6 * s.flare)));
        _obj.updateMatrix();
        this.knots.setMatrixAt(k, _obj.matrix);
      }
      this.knots.instanceMatrix.needsUpdate = true;
      this._knotState.fade = kfade;
      this.knotMat.userData.sync(this._knotState);
    }

    // 5 · the new rock: accreted on the knots, thrown out at the birth of the shell.
    if (this._born) this._syncPlates(R, s, exitS, exitT);

    // 6 · the floor: dims under the falling seed, tears open at the birth.
    const fs = this._floorState;
    this.floor.scale.set(R * 2 * Math.max(1.05, c.floorRadius), R * 2 * Math.max(1.05, c.floorRadius), 1);
    if (this._born) {
      fs.tear = smooth(st / Math.max(0.05, c.inflateTime * 1.3));
      fs.fade = 1;
      fs.growth = life;
      fs.dissolve = smooth((exitT - 0.35) / 0.65);
    } else {
      fs.tear = 1;
      fs.fade = 0.3 * smooth(this.u * 1.6);
      fs.growth = 0;
      fs.dissolve = 0;
    }
    fs.clock = clock;
    fs.lip = s.lip;
    this.floorMat.userData.sync(fs);

    this._syncParticles();
  }

  _syncPlates(R, s, exitS, exitT) {
    const c = this.config;
    const n = Math.max(0, Math.min(MAX_PLATES, Math.round(c.plateCount)));
    this.plates.count = n;
    const D = this.plateDice;
    for (let i = 0; i < n; i++) {
      const k = D[i * 5];
      const az = this.nodes[k * 2] + D[i * 5 + 1];
      const el = Math.min(0.98, Math.max(0.02, this.nodes[k * 2 + 1] + D[i * 5 + 2]));
      const born = smooth((s.growth - el * 0.82) / 0.18);
      this._skinPoint(az, domeT(el), _p, _n);
      const spin = D[i * 5 + 4];
      let size = c.plateSize * R * (0.6 + 0.7 * D[i * 5 + 3]) * born;
      if (this._ruptured) {
        // Ballistic throw along the skin normal and outward, then settle and sink.
        const tau = exitS;
        _dir.set(_n.x, 0, _n.z);
        if (_dir.lengthSq() < 1e-6) _dir.set(Math.cos(az), 0, Math.sin(az));
        _dir.normalize();
        const speed = c.plateThrow * (0.6 + 0.6 * D[i * 5 + 3]);
        _p.addScaledVector(_dir, speed * tau);
        _p.y += c.plateLift * (0.5 + spin) * tau - 0.5 * c.plateGravity * tau * tau;
        const rest = size * 0.12;
        if (_p.y < rest) _p.y = rest;
        size *= 1 - smooth((exitT - 0.55) / 0.45);
        _obj.position.copy(_p);
        _obj.lookAt(_q.copy(_p).add(_n));
        _obj.rotateX(tau * c.plateSpin * (spin - 0.5) * 2);
        _obj.rotateZ(tau * c.plateSpin * spin + spin * TAU);
      } else {
        _obj.position.copy(_p).addScaledVector(_n, 0.05 * R);
        _obj.lookAt(_q.copy(_obj.position).add(_n));
        _obj.rotateZ(spin * TAU);
      }
      _obj.scale.set(size, size * 0.85, size * 0.9);
      _obj.updateMatrix();
      this.plates.setMatrixAt(i, _obj.matrix);
    }
    this.plates.instanceMatrix.needsUpdate = true;
    // The rock is solid and lit; its seams glow while it is newborn.
    const g = settings.global;
    const heat = this._ruptured ? 0.35 + 1.4 * Math.exp(-exitS * 3) : 0.6 + 0.4 * s.growth;
    this.rock.color.copy(getColor(c.rockColor));
    this.rock.emissive.copy(getColor(c.colorBody));
    this.rock.emissiveIntensity = c.rockVeinGlow * heat * g.glow;
    this.rock.roughness = c.rockRoughness;
    this.rock.metalness = c.rockMetalness;
  }

  /** Mirror the particle look from settings every frame (no-op on stubs). */
  _syncParticles() {
    const c = this.config;
    particleLook(this.sparks, c.particleGlow, c.colorCore, c.colorTint, c.colorBody, c.colorDeep);
    particleLook(this.motes, c.particleGlow, c.colorCore, c.colorTint, c.colorBody, c.colorDeep);
    particleLook(this.dust, 1, c.colorTint, c.colorBody, c.colorDeep, c.colorDeep);
    particleLook(this.chips, c.particleGlow, c.colorCore, c.colorTint, c.colorBody, c.colorDeep);
    if (this.motes?.uniforms?.uGravity) this.motes.uniforms.uGravity.value.set(0, 0.8, 0);
    if (this.dust?.uniforms?.uGravity) this.dust.uniforms.uGravity.value.set(0, 0.4, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    // Never leave a body floating: give back anything still held.
    for (let i = 0; i < MAX_TARGETS; i++) {
      this._held[i]?.release?.();
      this._held[i] = null;
      this._heldIds[i] = null;
    }
    this._heldCount = 0;
    this._heldIdCount = 0;
    this._scope = null;
    this._born = false;
    this._ruptured = false;
    this.seed.visible = false;
    this.root.visible = false;
    this.lens.visible = false;
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
  const folder = gui.addFolder('◌  Vacuum Genesis');

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 80, 0.5, 'seed flies at (m/s)');
  R(cast, c, 'lifetime', 0.2, 8, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'cooldown', 0, 20, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 1, 8, 0.05, 'pocket radius (m)');
  castAnim(cast, c);

  const timing = sub(folder, 'Timing');
  R(timing, c, 'inflateTime', 0.05, 1.5, 0.01, 'inflates over (s)');
  R(timing, c, 'holdTime', 0.2, 4, 0.05, 'holds for (s)');
  R(timing, c, 'exitTime', 0.1, 3, 0.05, 'shell cracks over (s)');

  const play = sub(folder, 'Gameplay');
  R(play, c, 'maxTargets', 0, MAX_TARGETS, 1, 'bodies held');
  R(play, c, 'birthDamage', 0, 5, 0.05, 'damage at the birth');
  R(play, c, 'ruptureDamage', 0, 5, 0.05, 'damage at the rupture');
  R(play, c, 'holdLift', 0, 12, 0.05, 'lift off the feet');
  R(play, c, 'holdImpulse', 0, 8, 0.05, 'shove at the birth');
  R(play, c, 'floatHeight', 0.2, 3, 0.01, 'float height (m)');
  R(play, c, 'floatGrab', 0, 1, 0.01, 'grip of the pocket');
  R(play, c, 'floatOrbit', -2, 2, 0.01, 'orbit (rad/s)');
  R(play, c, 'floatBuoyancy', 0, 1, 0.01, 'weightlessness');
  R(play, c, 'hitImpulse', 0, 24, 0.1, 'rupture throw');
  R(play, c, 'hitLift', 0, 20, 0.1, 'rupture lift');
  R(play, c, 'hitSpin', 0, 8, 0.05, 'rupture tumble');

  const light = sub(folder, 'Light');
  color(light, c, 'lightColor', 'colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'birthLight', 0, 20, 0.1, 'punch at the birth');
  R(light, c, 'ruptureLight', 0, 20, 0.1, 'punch at the rupture');

  const ramp = sub(folder, 'Palette');
  color(ramp, c, 'colorCore', 'core (white-hot)');
  color(ramp, c, 'colorTint', 'tint');
  color(ramp, c, 'colorBody', 'body');
  color(ramp, c, 'colorDeep', 'deep (the vacuum)');
  color(ramp, c, 'colorFilm', 'thin-film sheen');

  const seed = sub(folder, '1 · The seed');
  R(seed, c, 'seedSize', 0.05, 1.2, 0.01, 'size (m)');
  R(seed, c, 'seedArc', 0, 6, 0.05, 'lob apex (m)');
  R(seed, c, 'seedSpin', 0, 20, 0.1, 'tumble');
  R(seed, c, 'seedGlow', 0, 6, 0.05, 'glow');
  R(seed, c, 'seedHalo', 0, 3, 0.01, 'halo size');
  R(seed, c, 'seedTrailRate', 0, 300, 1, 'trail per second');
  R(seed, c, 'seedTrailSize', 0.01, 0.4, 0.005, 'trail size');

  const skin = sub(folder, '2 · The skin');
  R(skin, c, 'domeHeight', 0.2, 1.6, 0.01, 'height (× radius)');
  R(skin, c, 'lipCurl', 0, 0.5, 0.005, 'lip curl (× radius)');
  R(skin, c, 'skinGlow', 0, 6, 0.05, 'glow');
  R(skin, c, 'skinOpacity', 0, 1, 0.01, 'opacity');
  R(skin, c, 'skinFresnel', 0.5, 8, 0.05, 'rim falloff');
  R(skin, c, 'filmStrength', 0, 3, 0.01, 'thin film');
  R(skin, c, 'filmScale', 0.2, 8, 0.05, 'film scale');
  R(skin, c, 'inflateOvershoot', 0, 4, 0.05, 'overshoot');
  R(skin, c, 'wobble', 0, 0.3, 0.005, 'ripple (× radius)');
  R(skin, c, 'wobbleModes', 0, 12, 1, 'ripple lobes');
  R(skin, c, 'wobbleSpeed', 0, 12, 0.05, 'ripple speed');
  R(skin, c, 'wobbleDecay', 0, 6, 0.05, 'ripple rings down');
  R(skin, c, 'breath', 0, 0.15, 0.001, 'breathing');
  R(skin, c, 'dissolveEdge', 0.005, 0.4, 0.005, 'dissolve edge');

  const vac = sub(folder, '3 · The void');
  R(vac, c, 'voidDarkness', 0, 1, 0.01, 'darkness');
  R(vac, c, 'voidStars', 0, 4, 0.05, 'newborn stars');
  R(vac, c, 'voidStarDensity', 4, 60, 1, 'star density');
  R(vac, c, 'nebulaStrength', 0, 2, 0.01, 'nebula');

  const web = sub(folder, '4 · The cosmic web');
  R(web, c, 'webReach', 0, 1, 0.01, 'threads that grow');
  R(web, c, 'webThickness', 0.1, 4, 0.01, 'thickness');
  R(web, c, 'webGlow', 0, 6, 0.05, 'glow');
  R(web, c, 'webGrowSpan', 0.05, 1, 0.01, 'thread crosses in (× hold)');
  R(web, c, 'webTipHeat', 0, 6, 0.05, 'tip heat');
  R(web, c, 'webPulse', 0, 4, 0.05, 'pulses');
  R(web, c, 'knotSize', 0.02, 0.5, 0.005, 'knot size (× radius)');
  R(web, c, 'knotGlow', 0, 6, 0.05, 'knot glow');

  const rock = sub(folder, '5 · The new rock');
  R(rock, c, 'plateCount', 0, MAX_PLATES, 1, 'plates');
  R(rock, c, 'plateSize', 0.05, 0.8, 0.005, 'size (× radius)');
  R(rock, c, 'plateThrow', 0, 24, 0.1, 'thrown out (m/s)');
  R(rock, c, 'plateLift', 0, 16, 0.1, 'thrown up (m/s)');
  R(rock, c, 'plateGravity', 0, 40, 0.1, 'fall (m/s²)');
  R(rock, c, 'plateSpin', 0, 20, 0.1, 'tumble');
  color(rock, c, 'rockColor', 'rock');
  R(rock, c, 'rockRoughness', 0, 1, 0.01, 'roughness');
  R(rock, c, 'rockMetalness', 0, 1, 0.01, 'metalness');
  R(rock, c, 'rockVeinGlow', 0, 6, 0.05, 'seam glow');

  const floor = sub(folder, '6 · The floor');
  R(floor, c, 'floorRadius', 1.05, 2.5, 0.01, 'reach (× radius)');
  R(floor, c, 'floorGlow', 0, 6, 0.05, 'glow');
  R(floor, c, 'floorDarkness', 0, 1, 0.01, 'stain darkness');
  R(floor, c, 'floorStreaks', 0, 3, 0.01, 'air streaks');
  R(floor, c, 'floorRim', 0, 4, 0.05, 'tear at the lip');
  R(floor, c, 'decalLife', 0.1, 8, 0.05, 'decals last (s)');
  R(floor, c, 'crackIntensity', 0, 3, 0.01, 'crack decal');
  R(floor, c, 'shockwaveWidth', 0.01, 0.4, 0.005, 'shockwave width');
  R(floor, c, 'shockwaveIntensity', 0, 3, 0.01, 'shockwave brightness');
  R(floor, c, 'dustRingIntensity', 0, 3, 0.01, 'dust ring');

  const fx = sub(folder, '7 · Particles');
  R(fx, c, 'dustCount', 0, 240, 1, 'dust at the birth');
  R(fx, c, 'dustSize', 0.05, 2, 0.01, 'dust size');
  R(fx, c, 'dustLife', 0.1, 4, 0.05, 'dust life (s)');
  R(fx, c, 'dustSpeed', 0, 20, 0.1, 'dust speed');
  R(fx, c, 'moteRate', 0, 200, 1, 'motes per second');
  R(fx, c, 'moteSize', 0.01, 0.4, 0.005, 'mote size');
  R(fx, c, 'moteLife', 0.1, 4, 0.05, 'mote life (s)');
  R(fx, c, 'sparkRate', 0, 300, 1, 'web sparks per second');
  R(fx, c, 'sparkSize', 0.01, 0.3, 0.005, 'spark size');
  R(fx, c, 'sparkLife', 0.05, 2, 0.01, 'spark life (s)');
  R(fx, c, 'chipCount', 0, 128, 1, 'rock chips');
  R(fx, c, 'chipSize', 0.01, 0.5, 0.005, 'chip size');
  R(fx, c, 'chipLife', 0.1, 3, 0.05, 'chip life (s)');
  R(fx, c, 'chipSpeed', 0, 20, 0.1, 'chip speed');
  R(fx, c, 'particleGlow', 0, 6, 0.05, 'particle glow');

  const bursts = sub(folder, '8 · The bursts');
  R(bursts, c, 'birthBurstReach', 0, 3, 0.01, 'air shell (× radius)');
  R(bursts, c, 'birthBurstLife', 0.05, 2, 0.01, 'air shell lives (s)');
  R(bursts, c, 'ruptureBurstReach', 0, 3, 0.01, 'storm shell (× radius)');
  R(bursts, c, 'ruptureBurstLife', 0.05, 2, 0.01, 'storm shell lives (s)');
  R(bursts, c, 'burstIntensity', 0, 3, 0.01, 'brightness');
  R(bursts, c, 'burstOpacity', 0, 1, 0.01, 'opacity');
  R(bursts, c, 'burstFresnel', 0, 6, 0.05, 'rim');

  const lens = sub(folder, '9 · The lens');
  R(lens, c, 'lensStrength', 0, 3, 0.01, 'rim refraction');
  R(lens, c, 'lensShock', 0, 3, 0.01, 'pressure pulses');

  const world = sub(folder, '10 · The world answers');
  R(world, c, 'birthShake', 0, 1, 0.01, 'knock at the birth');
  R(world, c, 'ruptureShake', 0, 1, 0.01, 'knock at the rupture');
  R(world, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(world, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(world, c, 'birthFlash', 0, 1, 0.01, 'flash at the birth');
  R(world, c, 'ruptureFlash', 0, 1, 0.01, 'flash at the rupture');

  return folder;
}
