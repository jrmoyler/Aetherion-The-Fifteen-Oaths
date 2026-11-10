import { Group, Mesh, PlaneGeometry, Quaternion, Vector2, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../../Ability.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { getColor } from '../../../utils/color.js';
import { impactForce } from '../AuthoredImpactForce.js';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { ExpansionAtmosphere, prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { HeliostatImpact } from './HeliostatImpact.js';
import {
  heliostatGeometry,
  heliostatFacetGeometry,
  heliostatBladeGeometry,
  heliostatLensGeometry,
  heliostatConeGeometry,
  heliostatRayGeometry,
  heliostatCoreGeometry,
  heliostatPostGeometry,
  heliostatPanelGeometry,
  heliostatShaftGeometry
} from './HeliostatGeometry.js';
import {
  createHeliostatMirrorMaterial,
  createHeliostatPrismMaterial,
  createHeliostatIrisMaterial,
  createHeliostatFocusMaterial,
  createHeliostatConeMaterial,
  createHeliostatRayMaterial,
  createHeliostatCoreMaterial,
  createHeliostatWarpMaterial,
  createHeliostatBronzeMaterial,
  createHeliostatGlassMaterial,
  createHeliostatShaftMaterial,
  createHeliostatCourtMaterial
} from './HeliostatMaterials.js';

export { heliostatGeometry, heliostatFacetGeometry, heliostatBladeGeometry } from './HeliostatGeometry.js';

export const ID = 'exp-heliostat-verdict';
export const UID = 'matrix-expansion/heliostat-verdict';

const TAU = Math.PI * 2;
/** Fixed rig capacities: a cast allocates nothing. */
const IRIS_BLADES = 8;
const TRAVEL_BLADES = 6;
const FACETS = 12;
const RAY_RIBBONS = 3;
/** Most mirror pylons the field can stand (`pylonCount` is clamped to it). */
const MAX_PYLONS = 12;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth01 = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _down = new Vector3(0, -1, 0);
const _up = new Vector3(0, 1, 0);
const _aim = new Vector3();
const _pivot = new Vector3();
const _toSun = new Vector3();
const _toAim = new Vector3();
const _normal = new Vector3();
const _look = new Vector3();
const _quat = new Quaternion();
/** Where the sun stands for the field's reflection law (unit, up and a little behind). */
const SUN_DIR = new Vector3(0.35, 1, 0.25).normalize();
const outBack = (x) => {
  const t = clamp01(x) - 1;
  return 1 + 2.4 * t * t * t + 1.4 * t * t;
};
/** Seconds the travelling lens takes to fizzle out at the circle on a miss. */
const MISS_FIZZLE = 0.2;
/** Glints thrown by that fizzle (× global particle count). */
const MISS_GLINTS = 14;
/** Scratch line-of-sight origin: `isBlocked` reads it synchronously and keeps nothing. */
const _origin = [0, 0, 0];

/**
 * HELIOSTAT VERDICT — a mirror array that judges one visible enemy.
 *
 * A zone cast that picks its own single target. The **travel** is a small
 * lens on a ring of iris blades skimming to the circle and shedding glints.
 * On arrival the cast asks the combat binding for the nearest living enemy in
 * `zoneRadius` that it has an unobstructed line to (`isBlocked` from the
 * caster). If there is one, a heliostat opens over it and *charges* for
 * `lockTime`; then one attributed `light` hit is emitted, and only if the
 * binding accepts it does the ray actually fire. The heliostat then folds away
 * over `releaseDuration`, the contact left cooling on the floor.
 *
 * Layers, each a folder in the editor:
 *
 *   1. **the lens** — six iris blades round a biconvex prism disc, rolling
 *      down the cast line, with a glint trail.
 *   2. **the heliostat** — twelve concave mirror slabs on spokes round a hub
 *      (`heliostatGeometry`), normal-blended so it reads as an object; it
 *      unfolds from the hub outward, rocks as it tracks, and floods with light
 *      panel by panel as the charge builds. Eight iris blades close round the
 *      hub and twelve prism facets orbit the rim.
 *   3. **the gather** — a sun-dial on the floor whose caustic spot narrows to a
 *      pinpoint, and a fluted cone of light pouring from the dish down to it.
 *      This is the anticipation: the player can see exactly who is about to be
 *      judged and how long they have.
 *   4. **the ray** — three crossed ribbons that pinch toward the contact, a
 *      white-hot core column, and heat shimmer on `LAYER.DISTORTION`.
 *   5. **the contact** (`HeliostatImpact`) — aperture iris, prism shards, a
 *      STORM burst, shockwave and a glassed scorch, sparks, plus a camera
 *      knock, flash and light punch from here.
 *   6. **particles** — ambient motes on the shared expansion transport, glints
 *      off the mirrors, and contact sparks, both in the cast's own systems.
 *   7. **the heliostat field** — the cast's silhouette at play distance. The
 *      moment the lens lands, `pylonCount` bronze pylons (lathed, fluted posts
 *      `postHeight` m tall, `heliostatPostGeometry`) shoulder out of the floor
 *      round the circle at `pylonRing × zoneRadius`, overshooting, one after
 *      another. Each carries a 1.8 × 1.2 m concave mirror panel of six tiles
 *      (`heliostatPanelGeometry`), lit by the scene sun on `LAYER.WORLD` and
 *      casting shadows. Every panel is aimed every frame by the reflection
 *      law — its normal bisects the sun and the focus — so whatever the radius,
 *      height or target, the light lands on the dish: placement is derived.
 *      A reflected shaft (`createHeliostatShaftMaterial`) runs from each panel
 *      to the dish and swells with the charge: a crown of sunlight converging
 *      over the judged enemy. After the ray the focus slides off the dish and
 *      sweeps the court like a sun crossing the sky, the panels turning to
 *      follow it (the linger); then the panels fold flat and the pylons sink.
 *   8. **the sun-court** (`createHeliostatCourtMaterial`) — a filled floor
 *      dial spanning the zone: dark glassy bronze flags with gold seams, hour
 *      lines, a rim band, pools under the pylons, a gnomon hand sweeping, the
 *      caustic focus narrowing on the target, then a disc of glassed floor
 *      with molten cracks that crawl and cool. It draws in on arrival and
 *      burns out through noise on the exit. With no enemy to judge the field
 *      still rises and gathers its light on the empty centre, then folds.
 *
 * ## Rules that make it trustworthy
 *
 * Nothing that claims damage happens before the binding accepts the hit: no
 * contact burst, decal or shard is spawned for a refused or blocked ray. The
 * target is re-validated every frame (alive, same stand generation, still in
 * the circle, still visible at the moment of firing); a terrain query that
 * *fails* keeps the lock and retries, a query that says *blocked* drops it.
 * Under reduced motion the visual clock is held at zero and the contact
 * effects and camera knock are skipped; gameplay timing is unchanged.
 *
 * Nothing pops. A lock that is lost before the ray fires (target replaced,
 * escaped, died or slipped behind cover) folds the open heliostat away over
 * `releaseDuration` from the moment of loss (`abortAt`) rather than hiding it
 * in one frame, and a lens that finds nobody at the circle fizzles out over
 * `MISS_FIZZLE` seconds in a small burst of glints. Neither claims a hit.
 *
 * Every number is resolved from `settings[ID]` every frame, so the editor
 * re-shapes a heliostat that is already charging.
 */
export class HeliostatVerdictAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** It picks its own target and commits its own hit through the binding. */
  get handlesOwnHits() {
    return true;
  }

  get lifetimeScale() {
    return Math.max(0.1, settings.global.lifetime);
  }

  get impactDuration() {
    return this.config.lifetime * this.lifetimeScale;
  }

  get fadeDuration() {
    return this.config.fade * this.lifetimeScale;
  }

  /** Seconds since impact on the *unscaled* staging clock the settings are authored in. */
  get stagedTime() {
    return this.impactTime / this.lifetimeScale;
  }

  /** Meshes the standing rig is drawing. HUD readout only. */
  get instanceCount() {
    return this.rig.visible ? 1 + this.blades.length + this.facets.length + RAY_RIBBONS : 0;
  }

  /** The gathered light climbs with the charge, with a quick solar flicker. */
  lightShimmer() {
    if (this.phase !== AbilityPhase.IMPACT || this.fired || !this.targetId) return super.lightShimmer();
    const charge = clamp01(this.stagedTime / Math.max(0.1, this.config.lockTime));
    return 0.5 + 0.5 * charge + 0.08 * Math.sin(this.age * 31) * charge;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this._lightSaved = new Vector3();
    /** Every GPU resource this cast owns, disposed once each. */
    this.gs = [];
    this.ms = [];
    const g = (x) => (this.gs.push(x), x);
    const m = (x) => (this.ms.push(x), x);

    this.rig = new Group();
    this.rig.visible = false;
    this.group.add(this.rig);
    this.impactEffects = new HeliostatImpact(this.group, this.ctx, this.atmosphere, g, m);

    this.lensMat = m(createHeliostatMirrorMaterial());
    this.prismMat = m(createHeliostatPrismMaterial());
    this.irisMat = m(createHeliostatIrisMaterial());
    this.rayMat = m(createHeliostatFocusMaterial());
    this.coneMat = m(createHeliostatConeMaterial());
    this.beamMat = m(createHeliostatRayMaterial());
    this.coreMat = m(createHeliostatCoreMaterial());
    this.warpMat = m(createHeliostatWarpMaterial());

    /* ---- 2 · the heliostat ---- */
    this.mirror = new Mesh(g(heliostatGeometry()), this.lensMat);
    this.mirror.position.y = 2.7;
    // Drawn after the cone it emits, so the glass sits over its own light.
    this.mirror.renderOrder = 4;
    this.rig.add(this.mirror);

    const blade = g(heliostatBladeGeometry());
    this.blades = [];
    for (let i = 0; i < IRIS_BLADES; i++) {
      const b = new Mesh(blade, this.irisMat);
      this.rig.add(b);
      this.blades.push(b);
    }

    const facet = g(heliostatFacetGeometry());
    this.facets = [];
    for (let i = 0; i < FACETS; i++) {
      const shard = new Mesh(facet, this.prismMat);
      this.rig.add(shard);
      this.facets.push(shard);
    }

    /* ---- 3 · the gather ---- */
    // The sun-dial: one floor quad, everything drawn in its fragment shader.
    this.halo = new Mesh(g(new PlaneGeometry(2, 2, 1, 1)), this.rayMat);
    this.halo.rotation.x = -Math.PI / 2;
    this.halo.position.y = 0.05;
    this.rig.add(this.halo);

    this.cone = new Mesh(g(heliostatConeGeometry(12)), this.coneMat);
    this.cone.position.y = 0.04;
    this.cone.renderOrder = 2;
    this.rig.add(this.cone);

    /* ---- 4 · the ray ---- */
    const ray = g(heliostatRayGeometry());
    this.rays = [];
    for (let i = 0; i < RAY_RIBBONS; i++) {
      const beam = new Mesh(ray, this.beamMat);
      beam.rotation.y = (i * Math.PI) / RAY_RIBBONS;
      beam.visible = false;
      beam.renderOrder = 3;
      this.rig.add(beam);
      this.rays.push(beam);
    }
    this.beamCore = new Mesh(g(heliostatCoreGeometry()), this.coreMat);
    this.beamCore.visible = false;
    this.beamCore.renderOrder = 3;
    this.rig.add(this.beamCore);

    // Heat shimmer: a billboard on the distortion layer, sized in the shader.
    this.warp = new Mesh(g(new PlaneGeometry(1, 1, 1, 1)), this.warpMat);
    this.warp.visible = false;

    /* ---- 1 · the travelling lens ---- */
    this.travelLens = new Group();
    this.travelLens.visible = false;
    this.group.add(this.travelLens);
    this.travelBlades = [];
    for (let i = 0; i < TRAVEL_BLADES; i++) {
      const b = new Mesh(blade, this.irisMat);
      b.rotation.z = (i * TAU) / TRAVEL_BLADES;
      b.position.set(Math.cos((i * TAU) / TRAVEL_BLADES) * 0.08, Math.sin((i * TAU) / TRAVEL_BLADES) * 0.08, 0);
      b.scale.setScalar(0.5);
      this.travelLens.add(b);
      this.travelBlades.push(b);
    }
    this.travelCore = new Mesh(g(heliostatLensGeometry()), this.prismMat);
    this.travelLens.add(this.travelCore);

    for (const root of [this.rig, this.travelLens]) {
      root.traverse((n) => {
        if (!n.isMesh) return;
        n.layers.set(LAYER.VFX);
        // Rigs are re-posed every frame far from the group origin.
        n.frustumCulled = false;
      });
    }
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.rig.add(this.warp);

    /* ---- 7 · the heliostat field ---- */
    this.field = new Group();
    this.field.visible = false;
    this.group.add(this.field);
    this.bronzeMat = m(createHeliostatBronzeMaterial());
    this.glassMat = m(createHeliostatGlassMaterial());
    this.shaftMat = m(createHeliostatShaftMaterial());
    const postGeo = g(heliostatPostGeometry());
    const panelGeo = g(heliostatPanelGeometry());
    const shaftGeo = g(heliostatShaftGeometry());
    this.pylons = [];
    for (let i = 0; i < MAX_PYLONS; i++) {
      const post = new Mesh(postGeo, this.bronzeMat);
      const panel = new Mesh(panelGeo, [this.glassMat, this.bronzeMat]);
      const shaft = new Mesh(shaftGeo, this.shaftMat);
      for (const solid of [post, panel]) {
        solid.layers.set(LAYER.WORLD);
        solid.castShadow = true;
        solid.receiveShadow = true;
        solid.frustumCulled = false;
      }
      shaft.layers.set(LAYER.VFX);
      shaft.frustumCulled = false;
      shaft.renderOrder = 2;
      this.field.add(post, panel, shaft);
      this.pylons.push({ post, panel, shaft });
    }

    /* ---- 8 · the sun-court ---- */
    this.courtMat = m(createHeliostatCourtMaterial());
    this.court = new Mesh(g(new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2)), this.courtMat);
    this.court.layers.set(LAYER.VFX);
    this.court.renderOrder = 1;
    this.court.frustumCulled = false;
    this.field.add(this.court);
    /** Zone centre the field stands round (fixed at arrival). */
    this.fieldCentre = new Vector3();
    this._courtTarget = new Vector2();

    this.scope = null;
    this.targetId = null;
    this.targetGeneration = null;
    this.fired = false;
    this.firedAt = -1;
    this.failure = null;
    this.retryAt = 0;
    /** Staged time the lock was lost before firing; -1 while it holds. */
    this.abortAt = -1;
    /** True when the lens reached the circle and found nobody to judge. */
    this.missed = false;
  }

  createParticles() {
    // Ambient motes on the shared expansion transport (tests and the
    // contact read its system directly, so it stays the primary channel).
    this.atmosphere = new ExpansionAtmosphere(this.ctx, 'light', {
      shape: 'STREAK',
      colors: ['#ffffff', '#fff1bd', '#ffcf72', '#a76d24'],
      rate: 25
    });
    this.impactEffects.atmosphere = this.atmosphere;

    const particles = this.ctx.particles;
    /** Glints: stretched sparkles shed by the lens and rained off the mirrors. */
    this.glints = particles?.get?.(`${ID}.glints`, {
      capacity: 900,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.3
    }) ?? null;
    /** Sparks: white-hot flecks thrown by the contact. */
    this.sparks = particles?.get?.(`${ID}.sparks`, {
      capacity: 600,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.25
    }) ?? null;
    if (this.glints) {
      const u = this.glints.uniforms;
      u.uSizeIn.value = 0.05;
      u.uFadeIn.value = 0.05;
      u.uFadeOut.value = 0.6;
      u.uEndSize.value = 0.3;
      u.uDrag.value = 0.8;
    }
    if (this.sparks) {
      const u = this.sparks.uniforms;
      u.uSizeIn.value = 0.02;
      u.uFadeIn.value = 0.02;
      u.uFadeOut.value = 0.5;
      u.uEndSize.value = 0.2;
      u.uDrag.value = 1.6;
    }
    this.impactEffects.sparks = this.sparks;
    /** The cast's own systems, gathered once so the per-frame sync allocates nothing. */
    this._ownSystems = [this.glints, this.sparks].filter(Boolean);
    this.glintEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.reduceMotion = prefersReducedMotion();
    this.atmosphere.reset();
    this.glintEmitter.reset();
    this.rig.visible = false;
    this.impactEffects.reset();
    for (const blade of this.blades) blade.visible = false;
    for (const facet of this.facets) facet.visible = false;
    for (const ray of this.rays) ray.visible = false;
    this.beamCore.visible = false;
    this.warp.visible = false;
    this.fired = false;
    this.firedAt = -1;
    this.targetId = null;
    this.targetGeneration = null;
    this.failure = null;
    this.retryAt = 0;
    this.abortAt = -1;
    this.missed = false;
    this.field.visible = false;
    this.fieldCentre.copy(this.origin);
    this.scope = bindExpansionCombat(this.ctx, UID);
    if (!this.scope) this.failure = 'combat bridge unavailable';
    // Without a binding nothing can be judged, so nothing pretends to travel.
    this.travelLens.visible = !!this.scope;
    this.travelLens.position.copy(this.origin);
  }

  /** Glints, mirrors and sparks follow the live gradient and globals. */
  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    this.atmosphere.rate = c.particleRate ?? this.atmosphere.rate;
    this.atmosphere.size = c.particleSize ?? this.atmosphere.size;
    this.atmosphere.syncPalette(c.rayColor, c.coreColor);
    for (let i = 0; i < this._ownSystems.length; i++) {
      const system = this._ownSystems[i];
      system.setGradient(getColor(c.colorGlintA), getColor(c.colorGlintB), getColor(c.colorGlintC), getColor(c.colorGlintD));
      const u = system.uniforms;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
      u.uOpacity.value = g.opacity;
      u.uGlow.value = 1.6 * g.glow;
      u.uTurbulence.value = 0.25 * g.turbulence;
    }
    if (this.glints) this.glints.uniforms.uGravity.value.set(0, -1.2, 0);
    if (this.sparks) this.sparks.uniforms.uGravity.value.set(0, -6, 0);
  }

  /** Bounded glint emission: `rate` per second from a ring or a point. */
  _emitGlints(dt, at, radius, direction, rate) {
    if (!this.glints || dt <= 0 || this.reduceMotion) return;
    const c = this.config;
    const count = this.glintEmitter.tick(dt, Math.max(0, rate) * settings.global.particleCount);
    if (count <= 0) return;
    _emit.position = at;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = c.glintSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.45;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.glintSize;
    _emit.sizeVariance = 0.5;
    _emit.life = c.glintLife;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.glints.emit(Math.min(48, count), _emit);
  }

  /** A fixed, bounded puff of glints at `at` (the miss fizzle). */
  _glintBurst(at, count) {
    if (!this.glints || count <= 0 || this.reduceMotion) return;
    const c = this.config;
    _emit.position = at;
    _emit.radius = 0.25;
    _emit.direction = _up;
    _emit.speed = c.glintSpeed * 0.8;
    _emit.speedVariance = 0.6;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.glintSize;
    _emit.sizeVariance = 0.5;
    _emit.life = c.glintLife * 0.7;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.glints.emit(Math.min(48, count), _emit);
  }

  /** The lens reached the circle and found nobody: it fizzles instead of vanishing. */
  _miss() {
    if (!this.travelLens.visible) return;
    this.missed = true;
    this._glintBurst(this.travelLens.position, Math.round(MISS_GLINTS * settings.global.particleCount));
  }

  onTravel(dt) {
    const c = this.config;
    const t = this.reduceMotion ? 0 : this.age;
    this._syncParticles();
    this.travelLens.position.copy(this.position);
    this.travelLens.position.y = c.travelHeight ?? 1;
    this.travelLens.rotation.set(0, Math.atan2(this.direction.x, this.direction.z), t * (c.travelSpin ?? 3));
    // Grows off the hand rather than appearing at full size.
    this.travelLens.scale.setScalar((c.travelScale ?? 1) * (0.4 + 0.6 * smooth01(this.age / 0.12)));

    const iris = this.irisMat.uniforms;
    iris.uClock.value = t;
    iris.uFade.value = 1;
    iris.uCharge.value = 0;
    iris.uGlow.value = settings.global.glow;
    iris.uColor.value.copy(getColor(c.rayColor));
    iris.uCore.value.copy(getColor(c.coreColor));
    this._syncPrism(t, 1, 0.4);

    // Glints shed backward off the lens.
    if (this.travelLens.visible) {
      _dir.copy(this.direction).multiplyScalar(-0.6).setY(0.15).normalize();
      this._emitGlints(dt, this.travelLens.position, 0.2, _dir, c.glintRate);
    }
  }

  _syncPrism(clock, fade, charge) {
    const c = this.config;
    const p = this.prismMat.uniforms;
    p.uClock.value = clock;
    p.uFade.value = fade;
    p.uCharge.value = charge;
    p.uGlow.value = (c.facetGlow ?? 1.2) * settings.global.glow;
    p.uFresnel.value = 2 * settings.global.fresnel;
    p.uColor.value.copy(getColor(c.rayColor));
    p.uCore.value.copy(getColor(c.coreColor));
    p.uSky.value.copy(getColor(c.skyColor));
  }

  /**
   * The nearest living enemy the caster can see. Every candidate is checked
   * for cover (a refused terrain query records its reason and skips that
   * candidate); ties break on actor id, so selection is deterministic.
   */
  _nearestVisible(actors) {
    let best = null;
    let bestDistance = Infinity;
    const origin = this.origin.toArray(_origin);
    for (const actor of actors) {
      if (!actor.alive) continue;
      const cover = this.scope.isBlocked(origin, actor.position);
      if (!cover?.ok) {
        this.failure = cover?.reason ?? 'terrain query refused';
        continue;
      }
      if (cover.blocked) continue;
      const d = Math.hypot(actor.position[0] - this.position.x, actor.position[2] - this.position.z);
      if (d < bestDistance || (d === bestDistance && actor.id.localeCompare(best.id) < 0)) {
        best = actor;
        bestDistance = d;
      }
    }
    return best;
  }

  onImpact() {
    if (!this.scope) {
      this.travelLens.visible = false;
      return;
    }
    // The field rises round the circle whether or not anyone is there to judge.
    this.fieldCentre.copy(this.position).setY(0);
    this.field.visible = true;
    this._updateField(0, 0, 1);
    const query = this.scope.queryActors({ position: this.position.toArray(), radius: this.config.zoneRadius, relation: 'enemy' });
    if (!query?.ok) {
      this.failure = query?.reason ?? 'query refused';
      this._miss();
      return;
    }
    const target = this._nearestVisible(query.actors);
    if (!target) {
      this.failure ??= 'no eligible target';
      this._miss();
      return;
    }
    // A lock: the lens hands over to the heliostat it opens.
    this.travelLens.visible = false;
    this.targetId = target.id;
    this.targetGeneration = target.standGeneration ?? null;
    this.rig.position.fromArray(target.position);
    this.rig.visible = true;
    this.mirror.rotation.set(0, 0, 0);
    this.halo.scale.setScalar(1);

    // Arrival frame: resolve the dish fully lit but folded, so a reused cast
    // never shows last cast's open dish for a frame.
    const c = this.config;
    const lens = this.lensMat.uniforms;
    lens.uFade.value = 1;
    lens.uCharge.value = 0;
    lens.uOpen.value = 0;
    lens.uColor.value.copy(getColor(c.rayColor));
    lens.uCore.value.copy(getColor(c.coreColor));
    lens.uSky.value.copy(getColor(c.skyColor));
    this.rayMat.uniforms.uFade.value = 1;
    this.rayMat.uniforms.uCharge.value = 0;
    this.rayMat.uniforms.uColor.value.copy(getColor(c.rayColor));
    this.coneMat.uniforms.uCharge.value = 0;
  }

  /* ------------------------------------------------------------------ */
  /* The standing heliostat                                              */
  /* ------------------------------------------------------------------ */

  onFade(dt, t) {
    const c = this.config;
    const gl = settings.global;
    const visualTime = this.reduceMotion ? 0 : this.age;
    this._syncParticles();
    if (!this.reduceMotion && this.targetId && this.phase === AbilityPhase.IMPACT) this.atmosphere.update(dt, this.rig.position);

    /* --- 1 · a lens that missed shrinks away where it landed --- */
    if (this.missed && this.travelLens.visible) {
      const left = 1 - clamp01(this.impactTime / MISS_FIZZLE);
      this.travelLens.scale.setScalar(Math.max(0.001, (c.travelScale ?? 1) * left));
      if (left <= 0) this.travelLens.visible = false;
    }

    /* --- envelopes --- */
    const normalFade = t <= 1 ? 1 : 1 - clamp01(t - 1);
    const shotAge = this.firedAt < 0 ? -1 : this.stagedTime - this.firedAt;
    const beamLife = Math.max(0.1, c.beamDuration ?? 0.6);
    // 1 until the ray has burned for `beamDuration`, then folds to 0.
    const release = shotAge < 0 ? 1 : 1 - clamp01((shotAge - beamLife) / Math.max(0.1, c.releaseDuration ?? 0.45));
    // 1 while the lock holds; folds to 0 over `releaseDuration` once it is lost unfired.
    const abort = this.abortAt < 0 ? 1 : 1 - clamp01((this.stagedTime - this.abortAt) / Math.max(0.1, c.releaseDuration ?? 0.45));
    const fade = normalFade * release * abort;
    const charge = clamp01(this.stagedTime / Math.max(0.1, c.lockTime));
    const open = smooth01(this.stagedTime / Math.max(0.05, c.openTime ?? 0.35));
    const mirrorHeight = c.mirrorHeight ?? 2.7;
    const fold = 0.7 + 0.3 * release * abort; // the dish closes a little as it leaves

    /* --- 2 · the dish --- */
    const lens = this.lensMat.uniforms;
    lens.uClock.value = visualTime;
    lens.uFade.value = fade;
    lens.uCharge.value = charge;
    lens.uOpen.value = open;
    lens.uGlow.value = (c.mirrorGlow ?? 1.3) * gl.glow;
    lens.uFresnel.value = (c.mirrorFresnel ?? 2.4) * gl.fresnel;
    lens.uShimmer.value = (c.mirrorShimmer ?? 0.6) * gl.noiseStrength;
    lens.uColor.value.copy(getColor(c.rayColor));
    lens.uCore.value.copy(getColor(c.coreColor));
    lens.uSky.value.copy(getColor(c.skyColor));
    const wobble = c.mirrorWobble ?? 0.12;
    this.mirror.position.y = mirrorHeight;
    this.mirror.rotation.set(Math.sin(visualTime * 0.9) * wobble, visualTime * (c.mirrorSpin ?? 1.2), Math.cos(visualTime * 0.7) * wobble);
    this.mirror.scale.setScalar((c.mirrorScale ?? 1) * (0.55 + 0.45 * open) * fold);

    /* --- the iris closes round the hub --- */
    const iris = this.irisMat.uniforms;
    iris.uClock.value = visualTime;
    iris.uFade.value = fade;
    iris.uCharge.value = charge;
    iris.uGlow.value = gl.glow;
    iris.uColor.value.copy(getColor(c.rayColor));
    iris.uCore.value.copy(getColor(c.coreColor));
    for (let i = 0; i < this.blades.length; i++) {
      const b = this.blades[i];
      const a = (i * TAU) / this.blades.length + visualTime * (c.irisSpin ?? 0.35);
      const r = (c.irisRadius ?? 0.42) + charge * (c.irisClose ?? 0.35);
      b.visible = true;
      b.position.set(Math.cos(a) * r, mirrorHeight - 0.04, Math.sin(a) * r);
      b.rotation.set(Math.PI / 2, -a, 0);
      b.scale.setScalar((c.irisScale ?? 1) * (0.5 + charge * 0.5));
    }

    /* --- the facets orbit the rim --- */
    this._syncPrism(visualTime, fade, charge);
    for (let i = 0; i < this.facets.length; i++) {
      const f = this.facets[i];
      const angle = (i * TAU) / this.facets.length + visualTime * (i % 2 ? c.facetOrbit ?? 0.4 : -(c.facetOrbit ?? 0.4));
      const r = (c.facetRadius ?? 1.2) + (i % 3) * 0.18;
      f.visible = true;
      f.position.set(Math.cos(angle) * r, mirrorHeight - 0.3 + 0.3 * Math.sin(angle * 2), Math.sin(angle) * r);
      f.rotation.y = -angle;
      f.rotation.z = angle * 0.4;
      f.scale.setScalar((c.facetScale ?? 0.6) + charge * 0.4);
    }

    /* --- 3 · the gather --- */
    // Once the ray fires the gathered light is spent into it.
    const spent = shotAge < 0 ? 0 : clamp01(shotAge / 0.12);
    const focus = this.rayMat.uniforms;
    focus.uClock.value = visualTime;
    focus.uFade.value = fade;
    focus.uCharge.value = shotAge < 0 ? charge : 1;
    focus.uTighten.value = c.focusTighten ?? 0.75;
    focus.uGlow.value = (c.focusGlow ?? 0.9) * gl.glow;
    focus.uColor.value.copy(getColor(c.rayColor));
    focus.uCore.value.copy(getColor(c.coreColor));
    const focusRadius = (c.focusRadius ?? 1.5) * (1 + charge * 0.25);
    this.halo.scale.set(focusRadius, focusRadius, 1);

    const cone = this.coneMat.uniforms;
    cone.uClock.value = visualTime;
    cone.uFade.value = fade * (1 - spent);
    cone.uCharge.value = smooth01(charge * 1.15);
    cone.uBands.value = Math.max(1, Math.round(c.coneBands ?? 12));
    cone.uGlow.value = (c.coneGlow ?? 0.55) * gl.glow;
    cone.uColor.value.copy(getColor(c.rayColor));
    cone.uCore.value.copy(getColor(c.coreColor));
    const coneRadius = 1.3 * (c.mirrorScale ?? 1) * (0.55 + 0.45 * open) * fold;
    this.cone.visible = spent < 1;
    this.cone.scale.set(coneRadius, Math.max(0.1, mirrorHeight - 0.08), coneRadius);
    this.cone.rotation.y = visualTime * (c.mirrorSpin ?? 1.2);

    if (!this.fired && this.targetId && this.abortAt < 0 && this.phase === AbilityPhase.IMPACT) {
      // Glints rain off the mirrors as they fill, and the camera hums.
      _pos.copy(this.rig.position).setY(mirrorHeight);
      this._emitGlints(dt, _pos, 1.1 * (c.mirrorScale ?? 1), _down, (c.glintRate ?? 42) * charge);
      if (!this.reduceMotion) this.ctx.shake?.rumble?.((c.chargeRumble ?? 0.05) * charge * charge, dt);
    }

    /* --- the verdict --- */
    this._trackAndFire(dt, charge);

    this.impactEffects.update(this.stagedTime, visualTime, normalFade, c, this.reduceMotion);

    /* --- 7 + 8 · the field and the court --- */
    this._updateField(dt, visualTime, normalFade);

    /* --- 4 · the ray --- */
    const beamAge = this.firedAt < 0 ? -1 : this.stagedTime - this.firedAt;
    const beamLit = beamAge >= 0 && beamAge < beamLife;
    // Strikes at full strength, then thins over its life.
    const beamFade = beamAge < 0 ? 0 : normalFade * (1 - clamp01(beamAge / beamLife));
    const width = c.beamWidth ?? 1;
    const glow = (c.beamGlow ?? 2.2) * gl.glow;
    const beam = this.beamMat.uniforms;
    beam.uClock.value = visualTime;
    beam.uFade.value = beamFade;
    beam.uGlow.value = glow;
    beam.uColor.value.copy(getColor(c.rayColor));
    beam.uCore.value.copy(getColor(c.coreColor));
    for (let i = 0; i < this.rays.length; i++) {
      const ray = this.rays[i];
      ray.visible = beamLit;
      ray.rotation.y = (i * Math.PI) / this.rays.length + visualTime * 0.8;
      ray.scale.set(width * (1 + 0.4 * (1 - clamp01(beamAge / 0.1))), mirrorHeight, 1);
    }
    const core = this.coreMat.uniforms;
    core.uClock.value = visualTime;
    core.uFade.value = beamFade;
    core.uGlow.value = glow * 1.2;
    core.uColor.value.copy(getColor(c.rayColor));
    core.uCore.value.copy(getColor(c.coreColor));
    this.beamCore.visible = beamLit;
    this.beamCore.scale.set(width, mirrorHeight, width);

    /* --- heat shimmer: a little during the charge, a lot under the ray --- */
    const warmth = (shotAge < 0 ? charge * charge * 0.3 : beamFade) * fade;
    const warp = this.warpMat.uniforms;
    warp.uClock.value = visualTime;
    warp.uWidth.value = c.warpWidth ?? 1.4;
    warp.uHeight.value = mirrorHeight;
    warp.uStrength.value = warmth * (c.warpStrength ?? 0.7) * gl.distortion;
    warp.uScale.value = (c.warpScale ?? 2.2) * gl.noiseFrequency;
    warp.uSpeed.value = (c.warpSpeed ?? 2.4) * gl.noiseSpeed;
    this.warp.visible = !this.reduceMotion && warmth > 0.01;

    if ((this.fired && release <= 0) || abort <= 0) this.rig.visible = false;
  }

  /**
   * The heliostat field and the sun-court, resolved from the live settings.
   * Everything is derived: pylon bearings from `pylonCount`/`pylonPhase`, the
   * ring from `zoneRadius`, each panel's aim from the reflection law toward the
   * current focus (the dish while it judges, a sweeping sun afterwards).
   */
  _updateField(dt, visualTime, normalFade) {
    if (!this.field.visible) return;
    const c = this.config;
    const gl = settings.global;
    const s = this.stagedTime;
    const count = Math.max(0, Math.min(MAX_PYLONS, Math.round(c.pylonCount ?? 8)));
    const R = c.zoneRadius * (c.pylonRing ?? 0.92);
    const postHeight = c.postHeight ?? 2.6;
    const phase = c.pylonPhase ?? 0.39;
    const charge = clamp01(s / Math.max(0.1, c.lockTime));
    const locked = !!this.targetId && this.rig.visible && this.abortAt < 0;
    const shotAge = this.firedAt < 0 ? -1 : s - this.firedAt;
    const beamLife = Math.max(0.1, c.beamDuration ?? 0.6);

    // Exit: panels fold flat in the first half, posts sink in the second.
    const sink = 1 - normalFade;
    const fold = smooth01(sink * 2);
    const drop = smooth01(sink * 2 - 1);
    const rise = smooth01(s / Math.max(0.05, c.courtDrawTime ?? 0.4));

    // The focus the panels serve, and how hard the light is gathered.
    let power;
    let sweep;
    if (this.fired) {
      sweep = smooth01((shotAge - beamLife) / 0.5);
      const burning = shotAge < beamLife ? 1 : 0;
      power = Math.max(burning, (c.shaftLinger ?? 0.3) * sweep, 1 - sweep);
    } else if (locked) {
      sweep = 0;
      power = Math.pow(charge, 0.7);
    } else {
      // Nobody judged (a miss, or a lost lock): the light gathers on the empty
      // centre, then the field gives up and sweeps.
      sweep = this.abortAt >= 0 ? smooth01((s - this.abortAt) / 0.5) : smooth01((s - 0.5) / 0.8);
      power = (c.shaftMiss ?? 0.35) * (1 - 0.4 * sweep);
    }
    const focusHeight = locked || (this.fired && this.rig.visible) ? c.mirrorHeight ?? 3.6 : c.fieldFocusHeight ?? 3.2;
    if (locked || (this.fired && this.rig.visible)) _aim.copy(this.rig.position).setY(focusHeight);
    else _aim.copy(this.fieldCentre).setY(focusHeight);
    if (sweep > 0) {
      const hand = phase + visualTime * (c.sweepSpeed ?? 0.9);
      const sr = R * (c.sweepRadius ?? 0.5);
      _look.set(this.fieldCentre.x + Math.cos(hand) * sr, (c.fieldFocusHeight ?? 3.2) * 0.8, this.fieldCentre.z + Math.sin(hand) * sr);
      _aim.lerp(_look, sweep);
    }
    power *= normalFade * (1 - fold);

    for (let i = 0; i < MAX_PYLONS; i++) {
      const p = this.pylons[i];
      const on = i < count;
      p.post.visible = on;
      p.panel.visible = on;
      if (!on) {
        p.shaft.visible = false;
        continue;
      }
      const a = phase + (i / Math.max(1, count)) * TAU;
      const x = this.fieldCentre.x + Math.cos(a) * R;
      const z = this.fieldCentre.z + Math.sin(a) * R;
      // Shoulders out of the floor, overshooting, one after another.
      const up = outBack((s - i * (c.riseStagger ?? 0.035)) / Math.max(0.05, c.riseTime ?? 0.35));
      const y = -(postHeight + (c.sinkDepth ?? 1.4)) * (1 - up) - (postHeight + (c.sinkDepth ?? 1.4)) * drop;
      const w = c.postWidth ?? 1;
      p.post.position.set(x, y, z);
      p.post.scale.set(w, postHeight, w);
      p.post.rotation.y = a;

      // The reflection law: the panel's normal bisects the sun and the focus.
      _pivot.set(x, y + postHeight + 0.1, z);
      _toAim.subVectors(_aim, _pivot);
      const length = _toAim.length();
      _toAim.multiplyScalar(1 / Math.max(1e-4, length));
      _normal.copy(SUN_DIR).add(_toAim).normalize();
      _normal.lerp(_up, fold).normalize();
      if (_normal.lengthSq() < 1e-6) _normal.copy(_up);
      p.panel.position.copy(_pivot);
      p.panel.lookAt(_look.copy(_pivot).add(_normal));
      p.panel.scale.setScalar((c.panelScale ?? 1.1) * (0.4 + 0.6 * clamp01(up)));

      // The reflected shaft, panel → focus.
      const shaft = p.shaft;
      shaft.visible = power > 0.01 && up > 0.6;
      if (shaft.visible) {
        shaft.position.copy(_pivot);
        _quat.setFromUnitVectors(_up, _toAim);
        shaft.quaternion.copy(_quat);
        const width = (c.shaftWidth ?? 1) * (c.panelScale ?? 1.1);
        shaft.scale.set(width, length, width);
      }
    }

    /* --- materials --- */
    const punch = this.fired && shotAge >= 0 ? Math.exp(-shotAge * 5) * (c.glassPunch ?? 2.5) : 0;
    this.glassMat.color.copy(getColor(c.glassColor ?? '#dfe8ff'));
    this.glassMat.emissive.copy(getColor(c.rayColor));
    this.glassMat.emissiveIntensity = ((c.glassGlow ?? 1.1) * (0.2 + 1.3 * power) + punch) * gl.glow;
    this.glassMat.roughness = c.glassRough ?? 0.08;
    this.bronzeMat.color.copy(getColor(c.bronzeColor ?? '#5a3a18'));
    this.bronzeMat.emissive.copy(getColor(c.rayColor));
    this.bronzeMat.emissiveIntensity = (0.03 + (c.bronzeHeat ?? 0.35) * (charge * (locked ? 1 : 0.3) + punch * 0.2)) * gl.glow;
    this.bronzeMat.metalness = c.bronzeMetal ?? 0.85;
    this.bronzeMat.roughness = c.bronzeRough ?? 0.34;

    const sh = this.shaftMat.uniforms;
    sh.uClock.value = visualTime;
    sh.uFade.value = power * gl.opacity;
    sh.uGlow.value = (c.shaftGlow ?? 1.3) * gl.glow;
    sh.uFlow.value = (c.shaftFlow ?? 2.5) * gl.noiseSpeed;
    sh.uColor.value.copy(getColor(c.rayColor));
    sh.uCore.value.copy(getColor(c.coreColor));

    /* --- the court --- */
    const radius = c.zoneRadius * (c.courtScale ?? 1.05);
    const size = radius * 2.2;
    this.court.position.set(this.fieldCentre.x, 0.03, this.fieldCentre.z);
    this.court.scale.set(size, 1, size);
    if (locked || this.fired) this._courtTarget.set(this.rig.position.x - this.fieldCentre.x, this.rig.position.z - this.fieldCentre.z);
    else this._courtTarget.set(0, 0);
    const u = this.courtMat.uniforms;
    u.uClock.value = visualTime;
    u.uFade.value = gl.opacity;
    u.uSize.value = size;
    u.uRadius.value = radius;
    u.uRise.value = rise;
    u.uDissolve.value = smooth01(sink * 1.15);
    u.uCharge.value = locked ? charge : this.fired ? 1 : (c.shaftMiss ?? 0.35) * rise;
    u.uTighten.value = c.focusTighten ?? 0.75;
    u.uScorchAge.value = this.fired ? Math.max(0, shotAge) : -1;
    u.uScorchRadius.value = c.courtScorchRadius ?? 2.2;
    u.uScorchLife.value = c.scorchLife ?? 2.6;
    u.uHand.value = Math.atan2(this._courtTarget.y, this._courtTarget.x) + visualTime * (c.handSpeed ?? 0.9);
    u.uPylons.value = count;
    u.uPylonPhase.value = phase;
    u.uPylonRing.value = R;
    u.uOpacity.value = c.courtOpacity ?? 0.85;
    u.uGlow.value = (c.courtGlow ?? 1) * gl.glow;
    u.uLines.value = c.courtLines ?? 1;
    u.uNoiseScale.value = (c.courtNoise ?? 1) * gl.noiseFrequency;
    u.uTarget.value.copy(this._courtTarget);
    u.uCore.value.copy(getColor(c.coreColor));
    u.uTint.value.copy(getColor(c.courtTintColor ?? '#fff1bd'));
    u.uBody.value.copy(getColor(c.courtBodyColor ?? '#e0a040'));
    u.uDeep.value.copy(getColor(c.courtDeepColor ?? '#1c0f05'));
    u.uScorch.value.copy(getColor(c.scorchColor));

    if (normalFade <= 0) this.field.visible = false;
  }

  /**
   * Re-validate the lock and, once the charge is full, ask the binding to
   * accept the ray. Only an accepted hit fires anything visible.
   */
  _trackAndFire(dt, charge) {
    if (!this.targetId || !this.scope || this.phase !== AbilityPhase.IMPACT) return;
    const c = this.config;
    const result = this.scope.getActor(this.targetId);
    const actor = result?.actor;

    if (this.targetGeneration !== null && actor?.standGeneration !== this.targetGeneration) {
      // A pooled actor stood up as a new life: the old verdict does not carry.
      this.targetId = null;
      if (!this.fired) {
        this.failure = 'target was replaced';
        this._abort();
      }
      return;
    }
    if (!result?.ok || !actor?.alive || Math.hypot(actor.position[0] - this.position.x, actor.position[2] - this.position.z) > c.zoneRadius) {
      this.targetId = null;
      if (!this.fired) {
        this.failure = 'target escaped';
        this._abort();
      }
      return;
    }

    // The heliostat tracks the target while it charges.
    this.rig.position.fromArray(actor.position);
    if (dt <= 0 || charge < 1 || this.fired || this.stagedTime < this.retryAt) return;

    const cover = this.scope.isBlocked(this.origin.toArray(_origin), actor.position);
    if (!cover?.ok) {
      // A failed query is not evidence of cover: keep the lock and retry.
      this.failure = cover?.reason ?? 'terrain query refused';
      this.retryAt = this.stagedTime + 0.2;
      return;
    }
    if (cover.blocked) {
      this.failure = 'target behind cover';
      this.targetId = null;
      this._abort();
      return;
    }

    const event = this.scope.emit({
      type: 'hit',
      element: 'light',
      targetIds: [actor.id],
      position: actor.position,
      sourcePosition: this.origin.toArray(),
      hitForce: impactForce(c),
      damage: c.damage,
      intensity: 1
    });
    if (!event?.ok) {
      this.failure = event?.reason ?? 'ray refused';
      this.retryAt = this.stagedTime + 0.2;
      return;
    }

    this.failure = null;
    this.fired = true;
    this.firedAt = this.stagedTime;
    this._verdictBeat(actor.position);
  }

  /** The lock is lost unfired: start folding the heliostat away (no hit is claimed). */
  _abort() {
    if (this.abortAt < 0) this.abortAt = this.stagedTime;
  }

  /** The accepted ray: contact effects, a knock on the camera, flash and light. */
  _verdictBeat(position) {
    const c = this.config;
    const g = settings.global;
    this.lightBoost = c.lightIntensity * (c.impactLight ?? 1.6) * g.explosionIntensity;
    if (this.reduceMotion) return;
    this.impactEffects.fire(position, this.stagedTime, c);
    this.ctx.shake?.add?.((c.impactShake ?? 0.28) * g.explosionIntensity, 3.2, 22);
    this.ctx.flash?.trigger?.(getColor(c.coreColor), (c.impactFlash ?? 0.32) * g.explosionIntensity);
  }

  /** The light follows the heliostat (and so the target), not the fixed aim point. */
  _updateLight(dt, scale) {
    if (this.phase === AbilityPhase.TRAVEL || !this.rig.visible) return super._updateLight(dt, scale);
    this._lightSaved.copy(this.position);
    this.position.copy(this.rig.position);
    this.position.y = (this.config.mirrorHeight ?? 2.7) * 0.5;
    try {
      super._updateLight(dt, scale);
    } finally {
      this.position.copy(this._lightSaved);
    }
  }

  onDestroy() {
    this.rig.visible = false;
    this.field.visible = false;
    this.travelLens.visible = false;
    this.targetId = null;
    this.abortAt = -1;
    this.missed = false;
    this.scope = null;
    for (const r of this.rays) r.visible = false;
    this.beamCore.visible = false;
    this.warp.visible = false;
    this.impactEffects.reset();
  }

  dispose() {
    for (const x of this.gs) x.dispose();
    for (const x of this.ms) x.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('☼  Heliostat Verdict');
  // Hosts without nested folders (headless harnesses) get one flat folder.
  const sub = (parent, title) => (typeof parent.addFolder === 'function' ? parent.addFolder(title) : parent);
  const R = (f, key, min, max, step, label) =>
    typeof Editor?.range === 'function' ? Editor.range(f, c, key, min, max, step, label) : f.add(c, key, min, max, step);
  const C = (f, key, label) => {
    const control = f.addColor(c, key);
    control?.name?.(label);
    return control;
  };
  const G = (f, prefix, title) => {
    if (typeof Editor?.gradient === 'function' && typeof f.addFolder === 'function') return Editor.gradient(f, c, prefix, title);
    for (const stop of ['A', 'B', 'C', 'D']) C(f, `${prefix}${stop}`, `${title} ${stop}`);
    return f;
  };

  const cast = sub(folder, 'The cast');
  R(cast, 'range', 1, 48, 0.1, 'max range');
  R(cast, 'minRange', 0, 20, 0.1, 'min range');
  R(cast, 'speed', 1, 60, 0.1, 'lens speed (m/s)');
  R(cast, 'cooldown', 0, 30, 0.1, 'cooldown');
  R(cast, 'zoneRadius', 1, 8, 0.1, 'judgement circle (m)');
  R(cast, 'lifetime', 1, 6, 0.1, 'stands for (s)');
  R(cast, 'fade', 0.1, 5, 0.1, 'exit (s)');
  if (typeof Editor?.castAnimation === 'function') Editor.castAnimation(cast, c);
  else cast.add(c, 'castAnim', CAST_ANIMATIONS);

  const verdict = sub(folder, 'The verdict');
  R(verdict, 'lockTime', 0.2, 2, 0.05, 'charge (s)');
  R(verdict, 'damage', 0.1, 3, 0.1, 'damage');
  R(verdict, 'hitImpulse', 0, 24, 0.1, 'knock-back (m/s)');
  R(verdict, 'hitLift', 0, 20, 0.1, 'lift (m/s)');
  R(verdict, 'hitSpin', 0, 8, 0.05, 'tumble');

  const light = sub(folder, 'Light + palette');
  C(light, 'lightColor', 'light colour');
  R(light, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, 'impactLight', 0, 4, 0.05, 'ray punch (× intensity)');
  C(light, 'rayColor', 'sunlight');
  C(light, 'coreColor', 'white-hot core');
  C(light, 'skyColor', 'reflected sky');
  C(light, 'scorchColor', 'scorch');

  const lens = sub(folder, '1 · Lens');
  R(lens, 'travelScale', 0.25, 2, 0.05, 'size');
  R(lens, 'travelHeight', 0.2, 3, 0.05, 'height (m)');
  R(lens, 'travelSpin', -12, 12, 0.1, 'roll (rad/s)');

  const dish = sub(folder, '2 · Heliostat');
  R(dish, 'mirrorHeight', 1.2, 6, 0.05, 'height over target (m)');
  R(dish, 'mirrorScale', 0.3, 2.5, 0.05, 'dish size');
  R(dish, 'mirrorSpin', -6, 6, 0.05, 'turn (rad/s)');
  R(dish, 'mirrorWobble', 0, 0.6, 0.01, 'tracking rock (rad)');
  R(dish, 'mirrorGlow', 0, 4, 0.05, 'glass glow');
  R(dish, 'mirrorFresnel', 0.2, 6, 0.05, 'rim power');
  R(dish, 'mirrorShimmer', 0, 2, 0.05, 'caustic shimmer');
  R(dish, 'openTime', 0.05, 1.5, 0.01, 'unfold (s)');
  R(dish, 'facetRadius', 0.3, 3, 0.05, 'facet orbit (m)');
  R(dish, 'facetOrbit', 0, 3, 0.05, 'facet speed (rad/s)');
  R(dish, 'facetScale', 0.1, 2, 0.05, 'facet size');
  R(dish, 'facetGlow', 0, 4, 0.05, 'facet glow');
  R(dish, 'irisScale', 0.25, 2, 0.05, 'iris blade size');
  R(dish, 'irisRadius', 0, 1.5, 0.01, 'iris radius (m)');
  R(dish, 'irisClose', 0, 1.5, 0.01, 'iris sweep with charge (m)');
  R(dish, 'irisSpin', -4, 4, 0.05, 'iris turn (rad/s)');

  const gather = sub(folder, '3 · Gather');
  R(gather, 'focusRadius', 0.3, 4, 0.05, 'sun-dial radius (m)');
  R(gather, 'focusTighten', 0, 0.95, 0.01, 'spot narrows by');
  R(gather, 'focusGlow', 0, 3, 0.05, 'sun-dial glow');
  R(gather, 'coneGlow', 0, 3, 0.05, 'cone glow');
  R(gather, 'coneBands', 1, 32, 1, 'light flutes');
  R(gather, 'chargeRumble', 0, 0.5, 0.01, 'camera hum');

  const ray = sub(folder, '4 · Ray');
  R(ray, 'beamDuration', 0.1, 2, 0.05, 'burns for (s)');
  R(ray, 'releaseDuration', 0.1, 2, 0.05, 'folds away over (s)');
  R(ray, 'beamWidth', 0.2, 3, 0.05, 'width');
  R(ray, 'beamGlow', 0, 6, 0.05, 'glow');
  R(ray, 'warpStrength', 0, 3, 0.01, 'heat shimmer');
  R(ray, 'warpWidth', 0.2, 5, 0.05, 'shimmer width (m)');
  R(ray, 'warpScale', 0.1, 8, 0.05, 'shimmer scale');
  R(ray, 'warpSpeed', 0, 8, 0.05, 'shimmer rise');

  const contact = sub(folder, '5 · Contact');
  R(contact, 'impactScale', 0.25, 3, 0.05, 'aperture + shard spread');
  R(contact, 'impactFxDuration', 0.1, 2, 0.05, 'aperture life (s)');
  R(contact, 'impactGlow', 0, 2, 0.05, 'burst brightness');
  R(contact, 'impactShake', 0, 1, 0.01, 'camera knock');
  R(contact, 'impactFlash', 0, 1, 0.01, 'flash');
  R(contact, 'scorchRadius', 0.1, 4, 0.05, 'scorch radius (m)');
  R(contact, 'scorchLife', 0.2, 10, 0.1, 'scorch cools over (s)');

  const motes = sub(folder, '6 · Particles');
  R(motes, 'particleRate', 0, 100, 1, 'ambient motes/second');
  R(motes, 'particleSize', 0.02, 0.5, 0.01, 'mote size');
  R(motes, 'glintRate', 0, 200, 1, 'glints/second');
  R(motes, 'glintSize', 0.005, 0.4, 0.005, 'glint size');
  R(motes, 'glintLife', 0.05, 3, 0.05, 'glint life (s)');
  R(motes, 'glintSpeed', 0, 10, 0.05, 'glint speed');
  R(motes, 'sparkCount', 0, 96, 1, 'contact sparks');
  R(motes, 'sparkSpeed', 0, 20, 0.1, 'spark speed');
  R(motes, 'sparkSize', 0.005, 0.5, 0.005, 'spark size');
  G(motes, 'colorGlint', 'glint + spark gradient');

  const field = sub(folder, '7 · Heliostat field');
  R(field, 'pylonCount', 0, MAX_PYLONS, 1, 'mirror pylons');
  R(field, 'pylonRing', 0.3, 1.5, 0.01, 'ring (× circle)');
  R(field, 'pylonPhase', -3.2, 3.2, 0.01, 'first bearing (rad)');
  R(field, 'postHeight', 0.6, 6, 0.05, 'post height (m)');
  R(field, 'postWidth', 0.3, 3, 0.05, 'post girth');
  R(field, 'panelScale', 0.3, 3, 0.05, 'mirror panel size');
  R(field, 'riseTime', 0.05, 1.5, 0.01, 'rise (s)');
  R(field, 'riseStagger', 0, 0.3, 0.005, 'rise stagger (s)');
  R(field, 'sinkDepth', 0, 4, 0.05, 'sink depth (m)');
  R(field, 'fieldFocusHeight', 0.5, 8, 0.05, 'idle focus height (m)');
  R(field, 'sweepRadius', 0, 1.2, 0.01, 'sun sweep (× ring)');
  R(field, 'sweepSpeed', -4, 4, 0.05, 'sun sweep (rad/s)');
  C(field, 'bronzeColor', 'bronze');
  R(field, 'bronzeMetal', 0, 1, 0.01, 'bronze metalness');
  R(field, 'bronzeRough', 0, 1, 0.01, 'bronze roughness');
  R(field, 'bronzeHeat', 0, 3, 0.01, 'bronze heat with charge');
  C(field, 'glassColor', 'mirror glass');
  R(field, 'glassGlow', 0, 4, 0.05, 'glass light');
  R(field, 'glassRough', 0, 1, 0.01, 'glass roughness');
  R(field, 'glassPunch', 0, 8, 0.05, 'glass flash on the ray');
  R(field, 'shaftWidth', 0.1, 3, 0.05, 'shaft width');
  R(field, 'shaftGlow', 0, 6, 0.05, 'shaft glow');
  R(field, 'shaftFlow', 0, 10, 0.05, 'shaft flow');
  R(field, 'shaftLinger', 0, 1, 0.01, 'shafts after the ray');
  R(field, 'shaftMiss', 0, 1, 0.01, 'shafts with no target');

  const court = sub(folder, '8 · Sun-court');
  R(court, 'courtScale', 0.3, 2, 0.01, 'court (× circle)');
  R(court, 'courtOpacity', 0, 1, 0.01, 'opacity');
  R(court, 'courtGlow', 0, 4, 0.05, 'glow');
  R(court, 'courtLines', 0, 3, 0.05, 'hour lines');
  R(court, 'courtDrawTime', 0.05, 2, 0.01, 'draws in over (s)');
  R(court, 'courtNoise', 0.2, 4, 0.05, 'flag scale');
  R(court, 'courtScorchRadius', 0.2, 6, 0.05, 'glassed floor (m)');
  R(court, 'handSpeed', -4, 4, 0.05, 'gnomon sweep (rad/s)');
  C(court, 'courtTintColor', 'pale tint');
  C(court, 'courtBodyColor', 'gold body');
  C(court, 'courtDeepColor', 'deep bronze');

  return folder;
}
