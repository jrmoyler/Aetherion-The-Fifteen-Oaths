import { Color, Group, Mesh, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../../Ability.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { getColor } from '../../../utils/color.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { impactForce } from '../ImpactForce.js';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { ExpansionAtmosphere, prefersReducedMotion } from '../ExpansionAtmosphere.js';
import {
  starGeometry,
  beamGeometry,
  celestialTargetGeometry,
  celestialShardGeometry,
  celestialMeteorTailGeometry,
  celestialFrameGeometry,
  celestialDustGeometry,
  celestialCoronaGeometry,
  celestialLinkGeometry,
  celestialReteGeometry
} from './CelestialGeometry.js';
import {
  createStarlightMaterial,
  createFrameMaterial,
  createNebulaMaterial,
  createChartLinkMaterial,
  createChartFloorMaterial,
  createTargetMaterial,
  createMeteorMaterial,
  createRayMaterial,
  createCoronaMaterial,
  createLensWarpMaterial,
  createReteMaterial,
  createChartGroundMaterial
} from './CelestialMaterials.js';

export {
  starGeometry,
  beamGeometry,
  celestialTargetGeometry,
  celestialShardGeometry,
  celestialMeteorTailGeometry
} from './CelestialGeometry.js';

export const ID = 'exp-celestial-cartography';
export const UID = 'matrix-expansion/celestial-cartography';

const TAU = Math.PI * 2;
/** Golden angle: dust and shard bearings that never line up. */
const GOLDEN = 2.399963;
/** Fixed capacities: a cast allocates nothing. */
const DUST = 40;
const SHARDS = 12;
const CORONA_RINGS = 3;
const TRAVEL_STARS = 3;
const METEOR_STARS = 3;
/** Seconds the strike corona burns. */
const FLARE_LIFE = 0.5;
/** Star-dust puff on each strike (module constant: the beat allocates no options). */
const STRIKE_BURST = { radius: 0.4, speed: 1.4, size: 0.08, life: 0.9, spread: 0.8 };

/** The constellation, in chart space (unit radius). */
const LAYOUT = [[-0.8, -0.32], [-0.55, 0.51], [-0.15, 0.16], [0.16, 0.76], [0.65, 0.39], [0.82, -0.24], [0.28, -0.7], [-0.18, -0.52]];

const bound = (x) => Math.max(0, Math.min(1, x));
const smoother = (x) => {
  const t = bound(x);
  return t * t * (3 - 2 * t);
};

const _emit = {};
const _kill = new Vector3();
const _pos = new Vector3();
const _down = new Vector3(0, -1, 0);
const _up = new Vector3(0, 1, 0);
/** Scratch query point: the binding reads it synchronously and keeps nothing. */
const _query = [0, 0, 0];
const _v = new Vector3();
const _tiltQ = new Quaternion();
const _yawQ = new Quaternion();

/**
 * CELESTIAL CARTOGRAPHY — a star chart that marks, warns and strikes.
 *
 * A zone cast whose **travel** is a small orrery of three stars inside a
 * graduated ring. On arrival a chart opens at `chartHeight` over the circle
 * and, after `armDelay`, marks the enemy nearest its centre (UCSM actors with
 * combat on, sandbox dummies with it off). The mark is a *fixed warning
 * point*: a compass of the true `strikeRadius` on the floor, rays bending
 * from every chart star onto it, a meteor falling along its tail. After
 * `strikeDelay` the meteor lands; the strike commits only if the target is
 * still alive, still the same life and still inside the compass. A target
 * that walks out evades it, and the corona still burns at the empty mark.
 *
 * The chart is no diagram: its **hero is an astrolabe rete** — a pierced
 * plate of dark violet bronze, cut procedurally (limb ring with teeth, an
 * eccentric ecliptic, two bars, one curved star pointer per chart star whose
 * diamond tip sits exactly on the star). It is solid, lit by the sun on
 * `LAYER.WORLD` and casts the constellation's shadow onto the floor. It
 * rises out of the circle and opens with a small overshoot, hangs at
 * `chartHeight` tilted `chartTilt` toward the caster so its face reads from
 * behind the caster, and **turns** the whole time (`reteSpin`) — kicked into
 * a fast spin by the strike that then winds down: the linger has its motion.
 * Under it a **filled star-map** darkens the floor (the deep stop of the
 * ramp): nebula, the constellation's links projected as channels, a hot rim,
 * and after the strike a scorch with a violet lip spreading from the mark.
 *
 * Layers, each a folder in the editor:
 *
 *   1. **the orrery** — three faceted stars tumbling inside a graduated ring,
 *      shedding glitter as it rolls.
 *   2. **the chart** — an armillary band graduated in 72 ticks, a nebula veil
 *      of domain-warped fbm with pin-prick background stars, eight faceted
 *      stars whose links are drawn one after another by a bright pen, two
 *      meridian rings turning above, forty grains of star dust, and the chart
 *      projected on the floor.
 *   3. **the mark** — the compass, convergence rays, the falling meteor with
 *      its streak trail and the column it falls down, and a gravitational
 *      lens on `LAYER.DISTORTION` bending the world round the star.
 *   4. **the strike** — a STORM burst and shockwave, a coronal flare, twelve
 *      tumbling shards, a camera knock, flash and light punch.
 *   5. **particles** — ambient motes, the meteor's streaks and star glitter.
 *
 * Exit: the chart *collapses* — it shrinks toward its centre and sinks by
 * `collapseStrength` as it fades. A combat mode change mid-cast voids the
 * cast (`failure`), so a mark made under one mode can never strike under the
 * other. Under reduced motion the visual clock is held at zero and the strike
 * cues, trails and camera knock are skipped.
 */
export class CelestialCartographyAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** It marks and strikes for itself. */
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

  /** Seconds since impact on the unscaled staging clock the settings are authored in. */
  get stagedTime() {
    return this.impactTime / this.lifetimeScale;
  }

  /** Stars, links and dust in the chart. HUD readout only. */
  get instanceCount() {
    return this.stars.length + this.lines.length + this.dust.length;
  }

  /** Starlight: a fast, faint scintillation. */
  lightShimmer() {
    return 0.9 + 0.1 * Math.sin(this.age * 17.3) * Math.sin(this.age * 5.1 + 0.4);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this._lightSaved = new Vector3();
    /** Every GPU resource this cast owns, disposed once each. */
    this.gs = [];
    this.ms = [];
    const geom = (x) => (this.gs.push(x), x);
    const mat = (x) => (this.ms.push(x), x);

    this.chartGroup = new Group();
    this.chartGroup.visible = false;
    this.group.add(this.chartGroup);

    this.starGeo = geom(starGeometry());
    this.beamGeo = geom(beamGeometry());
    const frameGeo = geom(celestialFrameGeometry());

    this.starMat = mat(createStarlightMaterial());
    this.dustMat = mat(createStarlightMaterial());
    this.frameMat = mat(createFrameMaterial());
    this.meridianMat = mat(createFrameMaterial());
    this.nebulaMat = mat(createNebulaMaterial());
    this.floorMat = mat(createChartFloorMaterial());
    this.targetMat = mat(createTargetMaterial());
    this.meteorMat = mat(createMeteorMaterial());
    this.convergenceMat = mat(createRayMaterial());
    this.beamMat = mat(createRayMaterial());
    this.flareMat = mat(createCoronaMaterial());
    this.shardMat = mat(createStarlightMaterial());
    this.warpMat = mat(createLensWarpMaterial());

    /* ---- 3 · the warning compass ---- */
    this.targetMark = new Mesh(geom(celestialTargetGeometry()), this.targetMat);
    this.targetMark.visible = false;
    this.chartGroup.add(this.targetMark);

    /* ---- 2 · the chart ---- */
    this.floor = new Mesh(geom(new PlaneGeometry(2, 2)), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = 0.04;
    this.chartGroup.add(this.floor);

    // The filled star-map under everything: the deep stop of the ramp.
    this.groundMat = mat(createChartGroundMaterial(LAYOUT.length));
    this.ground = new Mesh(geom(new PlaneGeometry(2, 2)), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = 0.025;
    this.ground.renderOrder = -2;
    this.chartGroup.add(this.ground);

    // Everything in the sky hangs off one group: tilted toward the caster,
    // turned by the rete's spin, scaled by its opening.
    this.skyGroup = new Group();
    this.chartGroup.add(this.skyGroup);

    this.nebula = new Mesh(geom(new PlaneGeometry(2, 2)), this.nebulaMat);
    this.nebula.rotation.x = -Math.PI / 2;
    this.nebula.renderOrder = -1; // the sky is behind everything drawn on it
    this.skyGroup.add(this.nebula);

    // The armillary band stays level — the horizon ring the tilted plate
    // turns inside, as on a real armillary sphere.
    this.frame = new Mesh(frameGeo, this.frameMat);
    this.chartGroup.add(this.frame);

    this.meridians = [];
    for (let i = 0; i < 2; i++) {
      const ring = new Mesh(frameGeo, this.meridianMat);
      this.skyGroup.add(ring);
      this.meridians.push(ring);
    }

    this.stars = [];
    this.lines = [];
    this.lineMaterials = [];
    this.nodes = LAYOUT.map(([x, z]) => new Vector3(x, 0, z));
    for (const node of this.nodes) {
      const star = new Mesh(this.starGeo, this.starMat);
      star.position.copy(node);
      star.rotation.x = -Math.PI / 2;
      star.scale.setScalar(0.22);
      this.skyGroup.add(star);
      this.stars.push(star);
    }
    for (let i = 0; i < this.nodes.length; i++) {
      const material = mat(createChartLinkMaterial());
      const line = new Mesh(geom(celestialLinkGeometry(this.nodes[i], this.nodes[(i + 1) % this.nodes.length])), material);
      this.skyGroup.add(line);
      this.lines.push(line);
      this.lineMaterials.push(material);
    }

    const grain = geom(celestialDustGeometry());
    this.dust = [];
    for (let i = 0; i < DUST; i++) {
      const dot = new Mesh(grain, this.dustMat);
      this.skyGroup.add(dot);
      this.dust.push(dot);
    }

    /* ---- 3 · convergence, meteor and its column ---- */
    this.convergenceRays = [];
    for (let i = 0; i < this.nodes.length; i++) {
      const ray = new Mesh(this.beamGeo, this.convergenceMat);
      ray.visible = false;
      this.chartGroup.add(ray);
      this.convergenceRays.push(ray);
    }
    this._convergenceDirection = new Vector3();

    this.meteor = new Group();
    this.meteor.visible = false;
    this.chartGroup.add(this.meteor);
    this.meteorStars = [];
    for (let i = 0; i < METEOR_STARS; i++) {
      const star = new Mesh(this.starGeo, this.meteorMat);
      star.rotation.set((i * TAU) / 3, 0, (i * TAU) / 6);
      this.meteor.add(star);
      this.meteorStars.push(star);
    }
    this.meteorTail = new Mesh(geom(celestialMeteorTailGeometry()), this.meteorMat);
    this.meteor.add(this.meteorTail);
    this._meteorPoint = new Vector3();

    this.beam = new Mesh(this.beamGeo, this.beamMat);
    this.beam.visible = false;
    this.chartGroup.add(this.beam);

    /* ---- 4 · the strike ---- */
    this.flare = new Group();
    this.flare.visible = false;
    this.chartGroup.add(this.flare);
    const corona = geom(celestialCoronaGeometry());
    this.flareRings = [];
    for (let i = 0; i < CORONA_RINGS; i++) {
      const ring = new Mesh(corona, this.flareMat);
      this.flare.add(ring);
      this.flareRings.push(ring);
    }
    this.flareStar = new Mesh(this.starGeo, this.flareMat);
    this.flare.add(this.flareStar);

    const shard = geom(celestialShardGeometry());
    this.strikeShards = [];
    for (let i = 0; i < SHARDS; i++) {
      const piece = new Mesh(shard, this.shardMat);
      piece.visible = false;
      this.chartGroup.add(piece);
      this.strikeShards.push(piece);
    }
    this._cueA = new Color();
    this._cueB = new Color();
    this._cueDark = new Color();

    /* ---- 1 · the orrery ---- */
    this.travelStar = new Group();
    this.travelStar.visible = false;
    this.group.add(this.travelStar);
    this.travelStars = [];
    for (let i = 0; i < TRAVEL_STARS; i++) {
      const star = new Mesh(this.starGeo, this.starMat);
      star.rotation.set((i * TAU) / 3, 0, (i * TAU) / 6);
      star.scale.setScalar(0.45);
      this.travelStar.add(star);
      this.travelStars.push(star);
    }
    const orbit = new Mesh(frameGeo, this.frameMat);
    orbit.scale.setScalar(0.65);
    this.travelStar.add(orbit);

    for (const root of [this.chartGroup, this.travelStar]) {
      root.traverse((n) => {
        if (!n.isMesh) return;
        n.layers.set(LAYER.VFX);
        n.frustumCulled = false;
      });
    }

    /* ---- the hero: the astrolabe rete, solid and lit ---- */
    this.reteMat = mat(createReteMaterial());
    this.rete = new Mesh(geom(celestialReteGeometry(LAYOUT)), this.reteMat);
    this.rete.layers.set(LAYER.WORLD);
    this.rete.castShadow = true;
    this.rete.receiveShadow = false;
    this.rete.frustumCulled = false;
    this.skyGroup.add(this.rete);
    this._yaw = 0;
    this._tiltSign = 1;
    this._groundNodes = this.groundMat.uniforms.uNodes.value;

    // The gravitational lens at the mark: a billboard on the distortion layer.
    this.warp = new Mesh(geom(new PlaneGeometry(1, 1, 1, 1)), this.warpMat);
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.warp.visible = false;
    this.chartGroup.add(this.warp);

    /** A marked UCSM actor, pooled: `{ actorId, position }`. A dummy is held directly. */
    this._actorTarget = { actorId: null, position: new Vector3() };
    this._found = [];
    this._target = null;
    this._targetGeneration = null;
    this._markedAt = -1;
    this._struck = false;
    this._strikeAt = -1;
    this._hitAt = -1;
    this._targetPos = new Vector3();
  }

  createParticles() {
    this.atmosphere = new ExpansionAtmosphere(this.ctx, 'cosmic', {
      shape: 'SOFT',
      colors: ['#f7eaff', '#bd9eff', '#8067dc', '#372356'],
      rate: 26
    });
    this.meteorTrail = new ExpansionAtmosphere(this.ctx, 'celestial-meteor', {
      shape: 'STREAK',
      colors: ['#f7eaff', '#bd9eff', '#8067dc', '#372356'],
      rate: 28,
      speed: 0.7,
      size: 0.07,
      life: 0.8,
      spread: 0.55
    });
    /** The orrery's wake of streaks on its way out. */
    this.orreryTrail = new ExpansionAtmosphere(this.ctx, 'celestial-orrery', {
      shape: 'STREAK',
      colors: ['#f7eaff', '#d5bbff', '#8067dc', '#372356'],
      rate: 50,
      speed: 0.9,
      size: 0.1,
      life: 0.6,
      spread: 0.6
    });
    /** Glitter: star dust drizzling off the chart and thrown by the strike. */
    this.stardust = this.ctx.particles?.get?.(`${ID}.stardust`, {
      capacity: 900,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.3
    }) ?? null;
    if (this.stardust) {
      const u = this.stardust.uniforms;
      u.uSizeIn.value = 0.05;
      u.uFadeIn.value = 0.08;
      u.uFadeOut.value = 0.6;
      u.uEndSize.value = 0.2;
      u.uDrag.value = 0.7;
    }
    this.stardustEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.scope = bindExpansionCombat(this.ctx, UID);
    this._initialStandalone = this.scope?.standalone;
    this._modeVersion = typeof this.ctx.expansionCombat?.modeVersion === 'function' ? this.ctx.expansionCombat.modeVersion() : null;
    this.failure = null;
    this.reduceMotion = prefersReducedMotion();
    this.atmosphere.reset();
    this.meteorTrail.reset();
    this.orreryTrail.reset();
    this.stardustEmitter.reset();
    this.meteor.visible = false;
    this.chartGroup.visible = false;
    this.travelStar.visible = true;
    this.travelStar.position.copy(this.origin);
    this._target = null;
    this._targetGeneration = null;
    this._actorTarget.actorId = null;
    this._markedAt = -1;
    this._struck = false;
    this._strikeAt = -1;
    this._hitAt = -1;
    this._found.length = 0;
    this._yaw = 0;
    this.flare.visible = false;
    this.targetMark.visible = false;
    this.beam.visible = false;
    this.warp.visible = false;
    for (const ray of this.convergenceRays) ray.visible = false;
    for (const shard of this.strikeShards) shard.visible = false;
  }

  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    this.atmosphere.rate = c.particleRate ?? this.atmosphere.rate;
    this.atmosphere.size = c.particleSize ?? this.atmosphere.size;
    this.atmosphere.syncPalette(c.chartColor, c.coreColor);
    if (!this.stardust) return;
    this.stardust.setGradient(getColor(c.colorStardustA), getColor(c.colorStardustB), getColor(c.colorStardustC), getColor(c.colorStardustD));
    const u = this.stardust.uniforms;
    u.uGravity.value.set(0, -0.6, 0);
    u.uSizeScale.value = g.particleSize;
    u.uLifeScale.value = g.particleLifetime;
    u.uSpeedScale.value = g.particleSpeed;
    u.uOpacity.value = g.opacity;
    u.uGlow.value = 1.6 * g.glow;
    u.uTurbulence.value = 0.4 * g.turbulence;
  }

  /** Bounded glitter at `at`, `count` grains drifting along `direction`. */
  _glitter(at, count, radius, direction, speed) {
    if (!this.stardust || count <= 0 || this.reduceMotion) return;
    const c = this.config;
    _emit.position = at;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = speed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.7;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.stardustSize;
    _emit.sizeVariance = 0.6;
    _emit.life = c.stardustLife;
    _emit.lifeVariance = 0.4;
    _emit.spin = 2;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.stardust.emit(Math.min(96, count), _emit);
  }

  _syncStarlight(material, clock, fade, glow) {
    const c = this.config;
    const u = material.uniforms;
    u.uClock.value = clock;
    u.uFade.value = fade;
    u.uGlow.value = glow * settings.global.glow;
    u.uTwinkle.value = c.twinkle ?? 3;
    u.uColor.value.copy(getColor(c.chartColor));
    u.uCore.value.copy(getColor(c.coreColor));
  }

  _syncFrame(material, clock, fade, glow) {
    const c = this.config;
    const u = material.uniforms;
    u.uClock.value = clock;
    u.uFade.value = fade;
    u.uGlow.value = glow * settings.global.glow;
    u.uColor.value.copy(getColor(c.chartColor));
    u.uCore.value.copy(getColor(c.coreColor));
  }

  onTravel(dt) {
    const c = this.config;
    const visualTime = this.reduceMotion ? 0 : this.age;
    this._syncParticles();
    this.travelStar.position.copy(this.position);
    this.travelStar.position.y = c.travelHeight ?? 1.1;
    const spin = c.travelSpin ?? 1.5;
    this.travelStar.rotation.set(visualTime * spin * 0.4, visualTime * spin, visualTime * spin * 0.6);
    this.travelStar.scale.setScalar(c.starScale ?? 1);
    this._syncStarlight(this.starMat, visualTime, 1, c.chartGlow ?? 1);
    this._syncFrame(this.frameMat, visualTime, 1, c.chartGlow ?? 1);
    if (dt > 0) {
      // A comet's wake of glitter and streaks: the path reads behind it.
      const n = this.stardustEmitter.tick(dt, (c.travelGlitter ?? 90) * settings.global.particleCount);
      this._glitter(this.travelStar.position, n, 0.45 * (c.starScale ?? 1), _down, 0.3);
      if (!this.reduceMotion) {
        this.orreryTrail.rate = c.travelStreaks ?? 50;
        this.orreryTrail.syncPalette(c.chartColor, c.coreColor);
        this.orreryTrail.update(dt, this.travelStar.position);
      }
    }
  }

  onImpact() {
    this.travelStar.visible = false;
    this.chartGroup.position.copy(this.position);
    this.chartGroup.visible = true;
    this.onFade(0, 0);
    this.lightBoost = this.config.lightIntensity * (this.config.arrivalLight ?? 0.6) * settings.global.explosionIntensity;
  }

  /* ------------------------------------------------------------------ */
  /* The chart in the sky                                                */
  /* ------------------------------------------------------------------ */

  /** Mark the enemy nearest the chart's centre, if one is inside it. */
  _acquire(elapsed, radius) {
    if (this.scope && !this.scope.standalone) {
      _query[0] = this.position.x;
      _query[1] = this.position.y;
      _query[2] = this.position.z;
      const query = this.scope.queryActors({ position: _query, radius, relation: 'enemy' });
      if (!query?.ok) {
        this.failure = query?.reason ?? 'target query refused';
        return;
      }
      let best = null;
      let bestDistance = Infinity;
      for (const actor of query.actors) {
        if (!actor.alive) continue;
        const d = Math.hypot(actor.position[0] - this.position.x, actor.position[2] - this.position.z);
        if (d < bestDistance || (d === bestDistance && actor.id.localeCompare(best.id) < 0)) {
          best = actor;
          bestDistance = d;
        }
      }
      if (!best) return;
      this._actorTarget.actorId = best.id;
      this._actorTarget.position.fromArray(best.position);
      this._target = this._actorTarget;
      this._targetGeneration = best.standGeneration ?? null;
      this._markedAt = elapsed;
      this._targetPos.copy(this._actorTarget.position);
      this.failure = null;
      this._markBeat();
      return;
    }

    // Standalone: the sandbox dummies, nearest centre strictly inside the chart.
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(this.position.x, this.position.z, radius, this._found);
    let nearest = null;
    let nearestDistance = Infinity;
    for (const d of found) {
      if (!d.alive) continue;
      const distance = Math.hypot(d.position.x - this.position.x, d.position.z - this.position.z);
      if (distance <= radius && distance < nearestDistance) {
        nearest = d;
        nearestDistance = distance;
      }
    }
    this._target = nearest;
    if (nearest) {
      this._markedAt = elapsed;
      this._targetGeneration = field.standGeneration?.(nearest) ?? null;
      this._targetPos.copy(nearest.position);
      this._markBeat();
    }
    this._found.length = 0;
  }

  _markBeat() {
    const c = this.config;
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * (c.markLight ?? 0.5) * settings.global.explosionIntensity);
  }

  /** Land the meteor: commit the hit if the target is still in the compass. */
  _strike(elapsed) {
    const c = this.config;
    this._struck = true;
    this._strikeAt = elapsed;
    this.targetMark.visible = false;
    this.meteor.visible = false;
    this.beam.visible = false;
    for (const ray of this.convergenceRays) ray.visible = false;

    const d = this._target;
    const reach = Math.max(0.25, c.strikeRadius ?? 1);
    let hit = false;
    if (d.actorId) {
      const result = this.scope.getActor(d.actorId);
      const actor = result?.actor;
      if (!result?.ok) {
        this.failure = result?.reason ?? 'target unavailable';
      } else if (
        actor?.alive &&
        (this._targetGeneration === null || actor.standGeneration === this._targetGeneration) &&
        Math.hypot(actor.position[0] - this._targetPos.x, actor.position[2] - this._targetPos.z) <= reach
      ) {
        const event = this.scope.emit({
          type: 'hit',
          element: 'cosmic',
          targetIds: [actor.id],
          position: actor.position,
          sourcePosition: this._targetPos.toArray(),
          hitForce: impactForce(c),
          damage: 1
        });
        hit = !!event?.ok;
        if (!hit) this.failure = event?.reason ?? 'strike refused';
      }
    } else if (
      settings.dummies.enabled &&
      d.alive &&
      (this._targetGeneration === null || this.ctx.dummies?.standGeneration?.(d) === this._targetGeneration) &&
      (!Array.isArray(this.ctx.dummies?.slots) || this.ctx.dummies.slots.some((slot) => slot?.dummy === d)) &&
      Math.hypot(d.position.x - this._targetPos.x, d.position.z - this._targetPos.z) <= reach
    ) {
      _kill.copy(this.direction);
      hit = !!d.kill(_kill.x, _kill.z, { impulse: c.hitImpulse, lift: c.hitLift, spin: c.hitSpin });
    }
    if (hit) this._strikeBeat(elapsed);
  }

  /** The accepted strike: burst, shockwave, glitter, knock, flash and light. */
  _strikeBeat(elapsed) {
    const c = this.config;
    const g = settings.global;
    this._hitAt = elapsed;
    this.lightBoost = c.lightIntensity * (c.strikeLight ?? 1.6) * g.explosionIntensity;
    if (this.reduceMotion) return;
    const a = this._cueA.copy(getColor(c.coreColor));
    const b = this._cueB.copy(getColor(c.chartColor));
    const dark = this._cueDark.copy(b).multiplyScalar(0.3);
    const radius = Math.min(4, (c.strikeRadius ?? 1) * (c.impactScale ?? 1));
    this.ctx.bursts?.spawn(BurstMode.STORM, this._targetPos, {
      radius: 0.08,
      endRadius: radius,
      life: 0.7,
      intensity: (c.impactGlow ?? 0.8) * g.explosionIntensity,
      opacity: 0.55,
      colorA: a,
      colorB: b,
      colorC: dark
    });
    this.ctx.decals?.spawn(DecalType.SHOCKWAVE, this._targetPos, {
      radius,
      life: 0.8,
      intensity: c.impactGlow ?? 0.8,
      width: 0.05,
      colorA: b,
      colorB: dark
    });
    this.atmosphere.burst(this._targetPos, 22, STRIKE_BURST);
    _pos.copy(this._targetPos).setY(0.3);
    this._glitter(_pos, Math.round((c.strikeStardust ?? 36) * g.particleCount), 0.35, _up, 3);
    this.ctx.shake?.add?.((c.strikeShake ?? 0.3) * g.explosionIntensity, 3, 20);
    this.ctx.flash?.trigger?.(getColor(c.coreColor), (c.strikeFlash ?? 0.28) * g.explosionIntensity);
  }

  onFade(dt, t) {
    const c = this.config;
    const gl = settings.global;
    const visualTime = this.reduceMotion ? 0 : this.age;
    this._syncParticles();
    if (!this.reduceMotion && this.phase === AbilityPhase.IMPACT) this.atmosphere.update(dt, this.position);

    /* --- envelopes --- */
    const elapsed = this.stagedTime;
    const fade = t <= 1 ? 1 : 1 - bound(t - 1);
    const rise = smoother(elapsed / Math.max(0.01, c.armDelay));
    // The exit collapses the chart toward its centre and down.
    const collapse = 1 - (1 - fade) * bound(c.collapseStrength ?? 0.8);
    const radius = c.zoneRadius * collapse;
    const draw = bound(elapsed / Math.max(0.1, c.drawTime ?? 0.45));
    const height = c.chartHeight * (0.5 + 0.5 * collapse);
    const glow = (c.chartGlow ?? 1);

    const modeStable =
      !this.scope ||
      (this.scope.standalone === this._initialStandalone &&
        (this._modeVersion === null || this.ctx.expansionCombat.modeVersion() === this._modeVersion));
    if (!modeStable) this.failure = 'combat mode changed during cast';

    /* --- 2 · the chart --- */
    // The sky group: lifted out of the circle as it opens (a small overshoot),
    // tilted about the cast's side axis so the far edge rises toward the
    // caster's eye, and turned by the rete's spin.
    const open = rise + Math.sin(rise * Math.PI) * (c.openOvershoot ?? 0.12);
    if (dt > 0 && !this.reduceMotion) {
      const hitAgeNow = this._hitAt < 0 ? -1 : elapsed - this._hitAt;
      const kick = hitAgeNow < 0 ? 0 : (c.reteStrikeSpin ?? 3) * Math.exp(-hitAgeNow * 1.4);
      this._yaw += dt * ((c.reteSpin ?? 0.25) + kick) * gl.animationSpeed;
    }
    _tiltQ.setFromAxisAngle(this.side, c.chartTilt ?? 0.45);
    _v.copy(this.direction).applyQuaternion(_tiltQ);
    if (_v.y < 0) _tiltQ.setFromAxisAngle(this.side, -(c.chartTilt ?? 0.45));
    _yawQ.setFromAxisAngle(_up, this._yaw);
    this.skyGroup.quaternion.copy(_tiltQ).multiply(_yawQ);
    this.skyGroup.position.set(0, height * (0.35 + 0.65 * rise), 0);
    this.skyGroup.scale.setScalar(Math.max(0.001, open));
    this.skyGroup.updateMatrix();
    const lift = (c.reteThickness ?? 0.16) * 0.75; // light layers ride on the plate's face

    const reteRadius = radius * (c.reteScale ?? 1);
    this.rete.scale.set(reteRadius, c.reteThickness ?? 0.16, reteRadius);
    this.rete.visible = open > 0.002;
    const rete = this.reteMat;
    rete.color.copy(getColor(c.reteColor ?? '#3a2c63'));
    rete.metalness = c.reteMetalness ?? 0.75;
    rete.roughness = c.reteRoughness ?? 0.32;
    const ru = rete.userData.uniforms;
    ru.uClock.value = visualTime;
    ru.uGlow.value = (c.reteGlow ?? 1.4) * gl.glow * fade;
    ru.uSweepSpeed.value = c.reteSweep ?? 0.12;
    ru.uColor.value.copy(getColor(c.chartColor));
    ru.uCore.value.copy(getColor(c.coreColor));

    this.floor.scale.set(radius, radius, 1);
    this.frame.position.y = height;
    this.frame.scale.setScalar(radius);
    this._syncFrame(this.frameMat, visualTime, fade * rise, glow);

    const nebulaRadius = radius * (c.nebulaScale ?? 1.15);
    this.nebula.position.y = -0.02;
    this.nebula.scale.set(nebulaRadius, nebulaRadius, 1);
    const nebula = this.nebulaMat.uniforms;
    nebula.uClock.value = visualTime;
    nebula.uFade.value = fade * rise;
    nebula.uGlow.value = (c.nebulaGlow ?? 0.5) * gl.glow;
    nebula.uColor.value.copy(getColor(c.rayColor));
    nebula.uCore.value.copy(getColor(c.coreColor));
    nebula.uNebula.value.copy(getColor(c.nebulaColor ?? '#3a2a7a'));

    const meridianRadius = radius * (c.meridianScale ?? 0.55);
    for (let i = 0; i < this.meridians.length; i++) {
      const ring = this.meridians[i];
      ring.position.y = lift + meridianRadius * 0.15;
      ring.rotation.set(Math.PI / 2 + (i ? 0.35 : -0.35), visualTime * (c.meridianSpin ?? 0.3) * (i ? -1 : 1) + i * 1.2, 0);
      ring.scale.setScalar(Math.max(0.001, meridianRadius * rise));
    }
    this._syncFrame(this.meridianMat, visualTime, fade * rise, c.meridianGlow ?? 0.6);

    const nodeScale = c.nodeScale ?? 0.22;
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      s.position.set(this.nodes[i].x * radius, lift, this.nodes[i].z * radius);
      s.scale.setScalar(nodeScale * (0.8 + 0.2 * Math.sin(visualTime * 3 + i)));
    }
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      const u = this.lineMaterials[i].uniforms;
      line.position.y = lift;
      line.scale.set(radius, 1, radius);
      u.uClock.value = visualTime;
      u.uFade.value = fade;
      u.uGlow.value = glow * gl.glow;
      // Drawn one after another, as if by a pen.
      u.uReveal.value = bound(draw * this.lines.length - i);
      u.uColor.value.copy(getColor(c.chartColor));
      u.uCore.value.copy(getColor(c.coreColor));
    }
    const drift = c.dustDrift ?? 0.08;
    for (let i = 0; i < this.dust.length; i++) {
      const a = i * GOLDEN;
      const r = radius * (0.18 + 0.78 * (((i * 37) % 41) / 40));
      const grain = this.dust[i];
      grain.position.set(Math.cos(a) * r, lift + 0.1 + (i % 7) * 0.05 + drift * Math.sin(visualTime * 2 + i), Math.sin(a) * r);
      grain.rotation.set(visualTime * 0.7 + i, visualTime * 1.1 + i * 0.3, 0);
    }
    this._syncStarlight(this.starMat, visualTime, fade * rise, glow);
    this._syncStarlight(this.dustMat, visualTime, fade * rise, glow * 0.8);

    const chart = this.floorMat.uniforms;
    chart.uClock.value = visualTime;
    chart.uFade.value = fade * rise;
    chart.uGlow.value = (c.floorGlow ?? 1) * gl.glow;
    chart.uColor.value.copy(getColor(c.rayColor));

    // The filled star-map: links projected as they are drawn, turning with the plate.
    this.ground.scale.set(radius, radius, 1);
    const ground = this.groundMat.uniforms;
    ground.uClock.value = visualTime;
    ground.uFade.value = fade * rise;
    ground.uOpacity.value = (c.groundOpacity ?? 0.72) * gl.opacity;
    ground.uDraw.value = draw;
    ground.uDeep.value.copy(getColor(c.groundDeep ?? '#140b2c'));
    ground.uBody.value.copy(getColor(c.nebulaColor ?? '#3a2a7a'));
    ground.uColor.value.copy(getColor(c.rayColor));
    for (let i = 0; i < this.nodes.length; i++) {
      _v.copy(this.nodes[i]).applyAxisAngle(_up, this._yaw);
      this._groundNodes[i * 2] = _v.x;
      this._groundNodes[i * 2 + 1] = _v.z;
    }

    // Glitter drizzles off the chart while it is in the sky.
    if (dt > 0 && this.phase === AbilityPhase.IMPACT) {
      const n = this.stardustEmitter.tick(dt, (c.stardustRate ?? 22) * rise * gl.particleCount);
      _pos.copy(this.position).setY(this.skyGroup.position.y);
      this._glitter(_pos, n, Math.max(0.2, radius * 0.75), _down, 0.4);
    }

    /* --- acquisition, once armed --- */
    if (dt > 0 && modeStable && this.phase === AbilityPhase.IMPACT && elapsed >= c.armDelay && this._markedAt < 0) {
      this._acquire(elapsed, radius);
    }

    /* --- 3 · the mark --- */
    const charge = this._markedAt < 0 ? 0 : bound((elapsed - this._markedAt) / Math.max(0.01, c.strikeDelay));
    chart.uCharge.value = charge;
    const armed = this._markedAt >= 0 && !this._struck;
    const markX = this._targetPos.x - this.position.x;
    const markZ = this._targetPos.z - this.position.z;

    // The plate floods as the strike charges and flashes when it lands; the
    // floor scorches outward from the struck point and stays.
    const burnAge = this._hitAt < 0 ? -1 : elapsed - this._hitAt;
    this.reteMat.userData.uniforms.uCharge.value = Math.max(armed ? charge : 0, burnAge >= 0 ? Math.exp(-burnAge * 2) : 0);
    ground.uBurn.value = burnAge < 0 ? 0 : smoother(burnAge / 0.35) * (c.groundBurn ?? 1);
    ground.uMark.value.set(markX / Math.max(0.01, radius), markZ / Math.max(0.01, radius), ((c.strikeRadius ?? 1) * (c.strikeScorch ?? 1.6)) / Math.max(0.01, radius));

    // Every chart star bends a ray onto the fixed warning point. Rays use
    // local chart coordinates and keep their endpoint if the target evades.
    const convergence = this.convergenceMat.uniforms;
    convergence.uClock.value = visualTime;
    convergence.uFade.value = fade * (c.convergenceGlow ?? 0.65);
    convergence.uGlow.value = gl.glow;
    convergence.uColor.value.copy(getColor(c.rayColor));
    convergence.uCore.value.copy(getColor(c.coreColor));
    for (let i = 0; i < this.convergenceRays.length; i++) {
      const ray = this.convergenceRays[i];
      const progress = bound(charge * 1.6 - i * 0.06);
      ray.visible = armed && progress > 0;
      // From the star as it hangs in the tilted, turning sky.
      ray.position.set(this.nodes[i].x * radius, lift, this.nodes[i].z * radius).applyMatrix4(this.skyGroup.matrix);
      this._convergenceDirection.set(markX - ray.position.x, -ray.position.y, markZ - ray.position.z);
      const length = this._convergenceDirection.length();
      if (length > 1e-6) ray.quaternion.setFromUnitVectors(_up, this._convergenceDirection.multiplyScalar(1 / length));
      ray.scale.set(c.convergenceWidth ?? 0.45, length * progress, c.convergenceWidth ?? 0.45);
    }

    this.targetMark.visible = armed;
    this.targetMark.position.set(markX, 0.06, markZ);
    this.targetMark.scale.setScalar(c.strikeRadius ?? 1);
    this.targetMark.rotation.y = visualTime * 0.4;
    const target = this.targetMat.uniforms;
    target.uClock.value = visualTime;
    target.uFade.value = fade;
    target.uGlow.value = (c.markGlow ?? 1) * gl.glow;
    target.uCharge.value = charge;
    target.uColor.value.copy(getColor(c.rayColor));
    target.uCore.value.copy(getColor(c.coreColor));

    // The meteor falls from the chart to the mark, easing in and out.
    this.meteor.visible = armed;
    const descent = charge * charge * (3 - 2 * charge);
    const meteorHeight = c.chartHeight * (1 - descent);
    this.meteor.position.set(markX, meteorHeight, markZ);
    this.meteor.rotation.y = visualTime * 1.3;
    for (const star of this.meteorStars) star.scale.setScalar(c.meteorHeadScale ?? 0.5);
    this.meteorTail.scale.set(c.meteorWidth ?? 1, Math.min(c.meteorTailLength ?? 2.5, c.chartHeight - meteorHeight), c.meteorWidth ?? 1);
    const meteor = this.meteorMat.uniforms;
    meteor.uClock.value = visualTime;
    meteor.uFade.value = fade * (c.meteorGlow ?? 1);
    meteor.uGlow.value = gl.glow;
    meteor.uColor.value.copy(getColor(c.rayColor));
    meteor.uCore.value.copy(getColor(c.coreColor));
    this.meteorTrail.rate = c.meteorTrailRate ?? 28;
    this.meteorTrail.syncPalette(c.rayColor, c.coreColor);
    if (this.meteor.visible && !this.reduceMotion && dt > 0) {
      this._meteorPoint.copy(this._targetPos).setY(meteorHeight);
      this.meteorTrail.update(dt, this._meteorPoint);
    }

    // The column it falls down, rising from the mark as the charge builds.
    this.beam.visible = armed;
    if (this.beam.visible) {
      this.beam.position.set(markX, 0, markZ);
      this.beam.scale.set(1, c.chartHeight * charge, 1);
    }
    const beam = this.beamMat.uniforms;
    beam.uClock.value = visualTime;
    beam.uFade.value = fade * (c.beamGlow ?? 0.8);
    beam.uGlow.value = gl.glow;
    beam.uColor.value.copy(getColor(c.rayColor));
    beam.uCore.value.copy(getColor(c.coreColor));

    /* --- the strike --- */
    if (dt > 0 && modeStable && this._target && !this._struck && charge >= 1) this._strike(elapsed);

    /* --- 4 · corona, shards and the lens --- */
    const flareAge = this._strikeAt < 0 ? -1 : elapsed - this._strikeAt;
    const flareProgress = bound(flareAge / FLARE_LIFE);
    this.flare.visible = flareAge >= 0 && flareAge < FLARE_LIFE;
    this.flare.position.set(markX, 0.6, markZ);
    this.flare.scale.setScalar((c.flareScale ?? 1) * (1 + flareProgress * 1.5));
    const flare = this.flareMat.uniforms;
    flare.uClock.value = visualTime;
    flare.uFade.value = fade * (1 - flareProgress);
    flare.uGlow.value = 1.6 * gl.glow;
    flare.uColor.value.copy(getColor(c.chartColor));
    flare.uCore.value.copy(getColor(c.coreColor));
    for (let i = 0; i < this.flareRings.length; i++) {
      this.flareRings[i].rotation.set((i * TAU) / 3, visualTime * (i % 2 ? -1 : 1), (i * TAU) / 6);
    }
    this.flareStar.rotation.y = visualTime;

    const hitAge = this._hitAt < 0 ? -1 : elapsed - this._hitAt;
    const shardProgress = hitAge < 0 ? 0 : bound(hitAge / Math.max(0.1, c.shardDuration ?? 0.8));
    const shards = this.shardMat.uniforms;
    shards.uClock.value = visualTime;
    shards.uFade.value = fade * (1 - shardProgress);
    shards.uGlow.value = 1.4 * gl.glow;
    shards.uTwinkle.value = 6;
    shards.uColor.value.copy(getColor(c.chartColor));
    shards.uCore.value.copy(getColor(c.coreColor));
    const spread = c.impactScale ?? 1;
    const fly = 1 - (1 - shardProgress) * (1 - shardProgress);
    for (let i = 0; i < this.strikeShards.length; i++) {
      const shard = this.strikeShards[i];
      const a = i * GOLDEN;
      shard.visible = !this.reduceMotion && hitAge >= 0 && shardProgress < 1;
      shard.position.set(markX + Math.cos(a) * fly * spread, 0.2 + fly * (0.5 + (i % 3) * 0.25) - shardProgress * shardProgress * 0.3, markZ + Math.sin(a) * fly * spread);
      shard.rotation.set(a * 0.3 + visualTime * 2, a * 0.7, a + visualTime * 1.5);
      shard.scale.setScalar((c.shardScale ?? 1) * (0.5 + 0.5 * (i % 2)) * (1 - shardProgress));
    }

    // The lens tightens round the falling star, then rings out at the strike.
    const lens = armed ? descent * 0.6 : flareAge >= 0 ? 1 - flareProgress : 0;
    const warp = this.warpMat.uniforms;
    warp.uClock.value = visualTime;
    warp.uWidth.value = Math.max(0.5, (c.strikeRadius ?? 1) * 3);
    warp.uHeight.value = Math.max(0.5, (c.strikeRadius ?? 1) * 3);
    warp.uRing.value = armed ? 0.75 - descent * 0.35 : 0.4 + flareProgress * 0.5;
    warp.uStrength.value = lens * (c.warpStrength ?? 0.6) * gl.distortion * fade;
    this.warp.position.set(markX, armed ? Math.max(0.5, meteorHeight) : 0.6, markZ);
    this.warp.visible = !this.reduceMotion && warp.uStrength.value > 0.005;
  }

  /** The light sits under the chart rather than on the floor. */
  _updateLight(dt, scale) {
    if (this.phase === AbilityPhase.TRAVEL || !this.chartGroup.visible) return super._updateLight(dt, scale);
    this._lightSaved.copy(this.position);
    this.position.y = this.config.chartHeight * 0.6;
    try {
      super._updateLight(dt, scale);
    } finally {
      this.position.copy(this._lightSaved);
    }
  }

  onDestroy() {
    this.scope = null;
    this.chartGroup.visible = false;
    this.travelStar.visible = false;
    this.meteor.visible = false;
    this.beam.visible = false;
    this.flare.visible = false;
    this.warp.visible = false;
    for (const shard of this.strikeShards) shard.visible = false;
    this._target = null;
    this._found.length = 0;
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
  const folder = gui.addFolder('✦  Celestial Cartography');
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
  R(cast, 'speed', 1, 60, 0.1, 'orrery speed (m/s)');
  R(cast, 'cooldown', 0, 30, 0.1, 'cooldown');
  R(cast, 'zoneRadius', 1, 8, 0.1, 'chart radius (m)');
  R(cast, 'lifetime', 2, 12, 0.1, 'stays in the sky (s)');
  R(cast, 'fade', 0.1, 5, 0.1, 'collapses over (s)');
  if (typeof Editor?.castAnimation === 'function') Editor.castAnimation(cast, c);
  else cast.add(c, 'castAnim', CAST_ANIMATIONS);

  const strike = sub(folder, 'The strike');
  R(strike, 'armDelay', 0.1, 3, 0.05, 'arms after (s)');
  R(strike, 'strikeDelay', 0.1, 1, 0.05, 'warning (s)');
  R(strike, 'strikeRadius', 0.25, 3, 0.05, 'strike radius (m)');
  R(strike, 'hitImpulse', 0, 24, 0.1, 'knock-back (m/s)');
  R(strike, 'hitLift', 0, 20, 0.1, 'lift (m/s)');
  R(strike, 'hitSpin', 0, 8, 0.05, 'tumble');

  const light = sub(folder, 'Light + palette');
  C(light, 'lightColor', 'light colour');
  R(light, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, 'arrivalLight', 0, 3, 0.05, 'chart opens (× intensity)');
  R(light, 'markLight', 0, 3, 0.05, 'mark (× intensity)');
  R(light, 'strikeLight', 0, 4, 0.05, 'strike (× intensity)');
  C(light, 'chartColor', 'chart');
  C(light, 'rayColor', 'rays + meteor');
  C(light, 'coreColor', 'white core');
  C(light, 'nebulaColor', 'deep sky');

  const orrery = sub(folder, '1 · Orrery');
  R(orrery, 'starScale', 0.25, 2, 0.05, 'size');
  R(orrery, 'travelHeight', 0.2, 4, 0.05, 'height (m)');
  R(orrery, 'travelSpin', -6, 6, 0.05, 'tumble (rad/s)');

  const chart = sub(folder, '2 · Chart');
  R(chart, 'chartHeight', 2, 9, 0.1, 'height (m)');
  R(chart, 'drawTime', 0.1, 3, 0.05, 'links drawn over (s)');
  R(chart, 'collapseStrength', 0, 1, 0.05, 'collapse on exit');
  R(chart, 'nodeScale', 0.05, 0.8, 0.01, 'star size');
  R(chart, 'twinkle', 0, 10, 0.1, 'twinkle');
  R(chart, 'chartGlow', 0, 4, 0.05, 'glow');
  R(chart, 'nebulaGlow', 0, 2, 0.01, 'nebula glow');
  R(chart, 'nebulaScale', 0.5, 2, 0.01, 'nebula radius (× chart)');
  R(chart, 'meridianScale', 0, 1.2, 0.01, 'meridians (× chart)');
  R(chart, 'meridianSpin', -2, 2, 0.01, 'meridian turn (rad/s)');
  R(chart, 'meridianGlow', 0, 2, 0.01, 'meridian glow');
  R(chart, 'floorGlow', 0, 3, 0.05, 'floor chart glow');
  R(chart, 'dustDrift', 0, 0.5, 0.01, 'dust bob (m)');
  R(chart, 'chartTilt', -1.2, 1.2, 0.01, 'tilt to caster (rad)');
  R(chart, 'openOvershoot', 0, 0.5, 0.01, 'opening overshoot');
  R(chart, 'groundOpacity', 0, 1, 0.01, 'star-map darkness');
  C(chart, 'groundDeep', 'star-map deep');
  R(chart, 'groundBurn', 0, 1, 0.01, 'strike scorch');
  R(chart, 'strikeScorch', 0.5, 4, 0.05, 'scorch radius (× strike)');

  const hero = sub(folder, '2b · Rete (hero)');
  R(hero, 'reteScale', 0.3, 1.5, 0.01, 'radius (× chart)');
  R(hero, 'reteThickness', 0.02, 0.6, 0.01, 'thickness (m)');
  R(hero, 'reteSpin', -2, 2, 0.01, 'turn (rad/s)');
  R(hero, 'reteStrikeSpin', 0, 12, 0.1, 'strike spin kick (rad/s)');
  R(hero, 'reteGlow', 0, 5, 0.05, 'engraving glow');
  R(hero, 'reteSweep', -1, 1, 0.01, 'pen sweep (turns/s)');
  C(hero, 'reteColor', 'bronze');
  R(hero, 'reteMetalness', 0, 1, 0.01, 'metalness');
  R(hero, 'reteRoughness', 0, 1, 0.01, 'roughness');

  const mark = sub(folder, '3 · Mark');
  R(mark, 'markGlow', 0, 3, 0.05, 'compass glow');
  R(mark, 'convergenceWidth', 0.1, 2, 0.05, 'ray width');
  R(mark, 'convergenceGlow', 0, 2, 0.05, 'ray glow');
  R(mark, 'meteorHeadScale', 0.1, 2, 0.05, 'meteor head');
  R(mark, 'meteorTailLength', 0.2, 8, 0.1, 'meteor tail (m)');
  R(mark, 'meteorWidth', 0.25, 3, 0.05, 'meteor width');
  R(mark, 'meteorGlow', 0, 2, 0.05, 'meteor glow');
  R(mark, 'meteorTrailRate', 0, 100, 1, 'meteor streaks/second');
  R(mark, 'beamGlow', 0, 2, 0.05, 'column glow');
  R(mark, 'warpStrength', 0, 2, 0.01, 'lens distortion');

  const hit = sub(folder, '4 · Strike');
  R(hit, 'impactScale', 0.25, 3, 0.05, 'burst + shard spread');
  R(hit, 'impactGlow', 0, 2, 0.05, 'burst glow');
  R(hit, 'flareScale', 0.25, 2, 0.05, 'corona size');
  R(hit, 'shardScale', 0.25, 2, 0.05, 'shard size');
  R(hit, 'shardDuration', 0.1, 2, 0.05, 'shards live (s)');
  R(hit, 'strikeShake', 0, 1, 0.01, 'camera knock');
  R(hit, 'strikeFlash', 0, 1, 0.01, 'flash');

  const motes = sub(folder, '5 · Particles');
  R(motes, 'particleRate', 0, 100, 1, 'ambient motes/second');
  R(motes, 'particleSize', 0.02, 0.5, 0.01, 'mote size');
  R(motes, 'stardustRate', 0, 200, 1, 'glitter/second');
  R(motes, 'travelGlitter', 0, 300, 1, 'orrery wake glitter/second');
  R(motes, 'travelStreaks', 0, 200, 1, 'orrery wake streaks/second');
  R(motes, 'stardustSize', 0.005, 0.4, 0.005, 'glitter size');
  R(motes, 'stardustLife', 0.1, 5, 0.05, 'glitter life (s)');
  R(motes, 'strikeStardust', 0, 96, 1, 'strike glitter');
  G(motes, 'colorStardust', 'glitter gradient');

  return folder;
}
