import { Group, InstancedMesh, Mesh, Object3D, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../../Ability.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import { impactForce } from '../AuthoredImpactForce.js';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { ExpansionAtmosphere, prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { InheritanceSeals } from './InheritanceSeals.js';
import {
  shadeWingGeometry,
  inheritanceRibbonGeometry,
  nightshadeBlossomGeometry,
  nightshadeSigilGeometry,
  nightshadePetalGeometry,
  nightshadeStripGeometry
} from './NightshadeGeometry.js';
import {
  createShadeWingMaterial,
  createShadeGlyphMaterial,
  createShadePoolMaterial,
  createInheritanceRibbonMaterial,
  createBlossomMaterial,
  createShadeSigilMaterial,
  createShadeWarpMaterial,
  createNightshadePetalMaterial,
  createBlightMaterial,
  createRootMaterial,
  syncShadeRamp
} from './NightshadeMaterials.js';

export { shadeWingGeometry, inheritanceRibbonGeometry } from './NightshadeGeometry.js';

export const ID = 'exp-nightshade-inheritance';
export const UID = 'matrix-expansion/nightshade-inheritance';

const TAU = Math.PI * 2;
/** Golden angle: blossom bearings that never line up, without a random draw. */
const GOLDEN = 2.399963;
/** Fixed rig capacities: a cast allocates nothing. */
const WINGS = 8;
const TRAVEL_WINGS = 4;
const BLOSSOMS = 24;
const RIBBONS = 3;
/** The binding never allows more than three inheritances per cast. */
const MAX_TRANSFERS = 3;
/** Bell petals allocated per pool member (`bellPetals` is clamped to this). */
const MAX_PETALS = 8;
/** Roots reaching toward would-be heirs. */
const MAX_TENDRILS = 2;

const clamp01 = (x) => Math.max(0, Math.min(1, x));

const _emit = {};
const _pos = new Vector3();
const _up = new Vector3(0, 1, 0);
const _back = new Vector3();
const _obj = new Object3D();
_obj.rotation.order = 'YXZ';
/** Shadow-smoke puff on each mark (module constant: the beat allocates no options). */
const MARK_BURST = { radius: 0.5, speed: 0.6, size: 0.12, life: 1, spread: 0.8 };
/** Seconds the flying shade takes to shrink away at the circle on a miss. */
const MISS_FIZZLE = 0.2;

/** Horizontal distance between two `[x, y, z]` points. */
const flatDistance = (a, bx, bz) => Math.hypot(a[0] - bx, a[2] - bz);

/**
 * NIGHTSHADE INHERITANCE — a mark that is passed on by death.
 *
 * A zone cast that marks one enemy and waits. The **travel** is a small shade
 * of four wings flying to the circle. On arrival it marks the nearest living
 * enemy in `zoneRadius` (with combat on, by a committed shadow `status`). From
 * then on it listens: when the marked host is *committed* defeated — a real
 * UCSM hit event (combat on) or an observed sandbox knockdown (combat off) —
 * the shade strikes the nearest living enemy within `inheritRadius` that has
 * not carried it, with an attributed shadow `hit` sourced at the fallen host,
 * and marks them in turn. At most `maxTransfers` (≤ 3) inheritances. A refused
 * strike reports its reason and the shade retracts rather than claiming a hit.
 *
 * Layers, each a folder in the editor:
 *
 *   1. **the shade in flight** — four wings beating as it flies, shedding a
 *      trail of umbral wisps (`travelTrailRate`). If nobody is marked at the
 *      circle it puffs into smoke and shrinks away over `MISS_FIZZLE` seconds
 *      instead of vanishing.
 *   2. **the mark** — eight membrane wings (normal-blended: darkness with
 *      weight) that unfurl in staggered pairs round the host, a thorned
 *      crescent crown floating over its head, and 24 belladonna blossoms
 *      drifting up through it. The *hunger* beat floods veins and crown.
 *   3. **the floor** — a pool of real darkness drawn inward by a spiral warp,
 *      a claw glyph of light over it, and the world bending toward the host
 *      on `LAYER.DISTORTION`.
 *   4. **the inheritance** — a twisted ribbon of shade from the fallen host to
 *      the heir, a tier seal that closes on the heir (AIR burst + shockwave),
 *      a camera knock, a violet flash and a light punch.
 *   5. **particles** — ambient shadow smoke on the shared expansion transport
 *      and dark, non-additive umbral smoke rising off the pool.
 *
 * Every accepted mark rises round its host over `markRise` and restarts on
 * each transfer; the exit retracts the whole shade over `releaseDuration`.
 * Under reduced motion the visual clock is held, the mark appears whole and
 * seals and camera knocks are skipped; the inheritance itself is unchanged.
 */
export class NightshadeInheritanceAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The shade picks its hosts and commits its own strikes. */
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

  /** Wings, blossoms and the crown. HUD readout only. */
  get instanceCount() {
    return this.wings.length + this.motes.length + 1;
  }

  /** Shadow light: a slow, uneven breath that dims as well as brightens. */
  lightShimmer() {
    return 0.8 + 0.2 * Math.sin(this.age * 2.1) * Math.sin(this.age * 0.77 + 1.2);
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

    this.shade = new Group();
    this.shade.visible = false;
    this.group.add(this.shade);

    this.mat = m(createShadeWingMaterial());
    this.floorMat = m(createShadeGlyphMaterial());
    this.poolMat = m(createShadePoolMaterial());
    this.blossomMat = m(createBlossomMaterial());
    this.sigilMat = m(createShadeSigilMaterial());
    this.warpMat = m(createShadeWarpMaterial());
    this.sealEffects = new InheritanceSeals(this.group, this.ctx, this.atmosphere, g, m);

    /* ---- 4 · the ribbons, one per overlapping transfer ---- */
    const ribbonGeometry = g(inheritanceRibbonGeometry());
    this.ribbons = [];
    this.ribbonMaterials = [];
    this.ribbonTimes = new Array(RIBBONS).fill(-1);
    this.ribbonNext = 0;
    for (let i = 0; i < RIBBONS; i++) {
      const material = m(createInheritanceRibbonMaterial());
      const ribbon = new Mesh(ribbonGeometry, material);
      ribbon.layers.set(LAYER.VFX);
      ribbon.frustumCulled = false;
      ribbon.visible = false;
      this.group.add(ribbon);
      this.ribbons.push(ribbon);
      this.ribbonMaterials.push(material);
    }
    /** The first ribbon, for readouts that only care about one. */
    this.ribbon = this.ribbons[0];

    /* ---- 3 · the floor: darkness first, the glyph of light over it ---- */
    this.pool = new Mesh(g(new PlaneGeometry(2, 2)), this.poolMat);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.035;
    this.pool.renderOrder = -1;
    this.shade.add(this.pool);
    this.floor = new Mesh(g(new PlaneGeometry(2, 2)), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = 0.045;
    this.shade.add(this.floor);

    /* ---- 2 · the mark ---- */
    const wing = g(shadeWingGeometry());
    this.wings = [];
    for (let i = 0; i < WINGS; i++) {
      const w = new Mesh(wing, this.mat);
      w.rotation.y = (i * TAU) / WINGS;
      w.rotation.z = 0.5 + (i % 2) * 0.3;
      w.position.y = 1.2;
      this.shade.add(w);
      this.wings.push(w);
    }

    this.sigil = new Mesh(g(nightshadeSigilGeometry()), this.sigilMat);
    this.sigil.position.y = 2.1;
    this.shade.add(this.sigil);

    const blossom = g(nightshadeBlossomGeometry());
    /** Belladonna blossoms drifting up round the host (the HUD's "motes"). */
    this.motes = [];
    for (let i = 0; i < BLOSSOMS; i++) {
      const o = new Mesh(blossom, this.blossomMat);
      this.shade.add(o);
      this.motes.push(o);
    }

    /* ---- 1 · the shade in flight ---- */
    this.travelShade = new Group();
    this.travelShade.visible = false;
    this.group.add(this.travelShade);
    this.travelWings = [];
    for (let i = 0; i < TRAVEL_WINGS; i++) {
      const w = new Mesh(wing, this.mat);
      w.rotation.y = (i * TAU) / TRAVEL_WINGS;
      w.rotation.z = 0.5;
      w.scale.setScalar(0.55);
      this.travelShade.add(w);
      this.travelWings.push(w);
    }

    for (const root of [this.shade, this.travelShade]) {
      root.traverse((n) => {
        if (!n.isMesh) return;
        n.layers.set(LAYER.VFX);
        n.frustumCulled = false;
      });
    }

    // The pull toward the host: a billboard on the distortion layer.
    this.warp = new Mesh(g(new PlaneGeometry(1, 1, 1, 1)), this.warpMat);
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.warp.visible = false;
    this.shade.add(this.warp);

    /* ---- 6 · the nightshade bell: lit, shadowing petals round the host ---- */
    this.bloom = new Group();
    this.bloom.visible = false;
    this.group.add(this.bloom);
    this.petalMat = m(createNightshadePetalMaterial());
    this.petals = new InstancedMesh(g(nightshadePetalGeometry()), this.petalMat, MAX_PETALS);
    this.petals.castShadow = true;
    this.petals.receiveShadow = true;
    this.petals.frustumCulled = false;
    this.petals.count = 0;
    this.petals.layers.set(LAYER.WORLD);
    this.bloom.add(this.petals);

    /* ---- 7 · the blight: the zone-sized floor the shade lands in ---- */
    this.blightMat = m(createBlightMaterial());
    this.blight = new Mesh(g(new PlaneGeometry(2, 2)), this.blightMat);
    this.blight.rotation.x = -Math.PI / 2;
    this.blight.position.y = 0.028;
    this.blight.renderOrder = -2;
    this.blight.layers.set(LAYER.VFX);
    this.blight.frustumCulled = false;
    this.blight.visible = false;
    this.group.add(this.blight);

    /* ---- 8 · roots: the wake behind the flying shade, and the reach to the heirs ---- */
    const strip = g(nightshadeStripGeometry());
    this.wakeMat = m(createRootMaterial());
    this.wake = new Mesh(strip, this.wakeMat);
    this.wake.position.y = 0.04;
    this.wake.renderOrder = 3;
    this.wake.layers.set(LAYER.VFX);
    this.wake.frustumCulled = false;
    this.wake.visible = false;
    this.group.add(this.wake);
    this.tendrils = [];
    this.tendrilMats = [];
    this.tendrilTargets = [];
    for (let i = 0; i < MAX_TENDRILS; i++) {
      const material = m(createRootMaterial());
      const mesh = new Mesh(strip, material);
      mesh.position.y = 0.05;
      mesh.renderOrder = 3;
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
      this.tendrils.push(mesh);
      this.tendrilMats.push(material);
      this.tendrilTargets.push(new Vector3());
    }
    this.tendrilCount = 0;
    this.tendrilAt = 0;
    this.landing = new Vector3();
    this.landed = false;
    this.bloomAt = 0;
    this.bellYaw = 0;

    /** Pre-bound so spawning a cast never allocates its listener. */
    this._onHit = (event) => this.onCommittedHit(event);

    this.scope = null;
    this.targetId = null;
    this.targetGeneration = null;
    this.unsubscribe = null;
    this.visited = new Set();
    this.transfers = 0;
    this.failure = null;
    this.releaseAt = -1;
    this.markAt = -1;
    /** True when the shade reached the circle and marked nobody. */
    this.missed = false;
  }

  createParticles() {
    this.atmosphere = new ExpansionAtmosphere(this.ctx, 'shadow', {
      shape: 'SMOKE',
      colors: ['#d2baff', '#7654ad', '#382052', '#160c25'],
      rate: 24
    });
    this.sealEffects.atmosphere = this.atmosphere;

    /** Umbral smoke: non-additive, so it darkens what it drifts across. */
    this.umbra = this.ctx.particles?.get?.(`${ID}.umbra`, {
      capacity: 700,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      swirl: true,
      softFade: 0.8
    }) ?? null;
    if (this.umbra) {
      const u = this.umbra.uniforms;
      u.uSizeIn.value = 0.15;
      u.uFadeIn.value = 0.2;
      u.uFadeOut.value = 0.5;
      u.uEndSize.value = 2.2;
      u.uDrag.value = 1.2;
    }
    this.umbraEmitter = new RateEmitter();
    /** Paces the wisp trail behind the shade in flight. */
    this.trailEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.reduceMotion = prefersReducedMotion();
    this.atmosphere.reset();
    this.umbraEmitter.reset();
    this.trailEmitter.reset();
    this.missed = false;
    this.shade.visible = false;
    this.shade.scale.setScalar(1);
    this.warp.visible = false;
    this.ribbonTimes.fill(-1);
    this.ribbonNext = 0;
    this.sealEffects.reset();
    for (const ribbon of this.ribbons) ribbon.visible = false;
    this.releaseAt = -1;
    this.markAt = -1;
    this.targetId = null;
    this.targetGeneration = null;
    this.visited.clear();
    this.transfers = 0;
    this.failure = null;
    this.landed = false;
    this.bloom.visible = false;
    this.petals.count = 0;
    this.blight.visible = false;
    this.tendrilCount = 0;
    for (const t of this.tendrils) t.visible = false;
    this.bellYaw = Math.random() * TAU;
    // The wake runs the whole cast line; its vein races out with the shade.
    this.wake.visible = true;
    this.wake.position.set(this.origin.x, 0.04, this.origin.z);
    this.wake.rotation.y = -Math.atan2(this.direction.z, this.direction.x);
    this.wake.scale.set(this.length, 1, this.config.wakeWidth ?? 0.7);
    this._syncRoot(this.wakeMat, 0, 0, this.length, 0);
    this.scope = bindExpansionCombat(this.ctx, UID);
    if (!this.scope) {
      this.failure = 'combat bridge unavailable';
      return;
    }
    this.standaloneMode = this.scope.standalone;
    if (!this.standaloneMode) {
      // Combat on: inherit on a *committed* defeat, delivered by the binding.
      const sub = this.scope.on('hit', this._onHit);
      if (!sub?.ok) {
        this.failure = sub?.reason ?? 'event subscription refused';
        this.scope = null;
        return;
      }
      this.unsubscribe = sub.unsubscribe;
    }
    this.travelShade.visible = true;
    this.travelShade.position.copy(this.origin);
  }

  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    this.atmosphere.rate = c.particleRate ?? this.atmosphere.rate;
    this.atmosphere.size = c.particleSize ?? this.atmosphere.size;
    this.atmosphere.syncPalette(c.shadowColor, c.edgeColor);
    if (!this.umbra) return;
    this.umbra.setGradient(getColor(c.colorUmbraA), getColor(c.colorUmbraB), getColor(c.colorUmbraC), getColor(c.colorUmbraD));
    const u = this.umbra.uniforms;
    u.uGravity.value.set(0, c.umbraRise ?? 0.5, 0);
    u.uSwirl.value = 1.4;
    u.uSizeScale.value = g.particleSize;
    u.uLifeScale.value = g.particleLifetime;
    u.uSpeedScale.value = g.particleSpeed;
    u.uOpacity.value = 0.7 * g.opacity;
    u.uTurbulence.value = 0.6 * g.turbulence;
  }

  /** Dark smoke off the pool round `at`, `count` puffs (bounded). */
  _emitUmbra(at, count, radius) {
    if (!this.umbra || count <= 0) return;
    const c = this.config;
    _pos.copy(at).setY(0.15);
    _emit.position = _pos;
    _emit.radius = radius;
    _emit.direction = _up;
    _emit.speed = c.umbraRise ?? 0.5;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.4;
    _emit.inherit = null;
    _emit.anchor = _pos;
    _emit.size = c.umbraSize ?? 0.42;
    _emit.sizeVariance = 0.5;
    _emit.life = c.umbraLife ?? 1.6;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0.6;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.umbra.emit(Math.min(48, count), _emit);
  }

  _syncWings(clock, fade, hunger) {
    const c = this.config;
    const u = this.mat.uniforms;
    u.uClock.value = clock;
    u.uFade.value = fade;
    u.uHunger.value = hunger;
    u.uOpacity.value = c.wingOpacity ?? 0.85;
    u.uGlow.value = (c.wingGlow ?? 1) * settings.global.glow;
    u.uColor.value.copy(getColor(c.shadowColor));
    u.uEdge.value.copy(getColor(c.edgeColor));
    u.uVoid.value.copy(getColor(c.voidColor ?? '#120a1c'));
  }

  onTravel(dt) {
    const c = this.config;
    const t = this.reduceMotion ? 0 : this.age;
    this._syncParticles();
    this.travelShade.position.copy(this.position);
    this.travelShade.position.y = c.travelHeight ?? 0.9;
    this.travelShade.rotation.y = t * (c.travelSpin ?? 0.8);
    this.travelShade.scale.setScalar(c.travelScale ?? 1);
    this._syncWings(t, 1, 0);
    this._syncRoot(this.wakeMat, t, this.u, this.length, 1);
    for (let i = 0; i < this.travelWings.length; i++) {
      this.travelWings[i].rotation.z = 0.5 + 0.2 * Math.sin(t * (c.travelFlap ?? 5) + i);
    }

    // A thin trail of umbral wisps shed behind the shade.
    if (this.umbra && this.travelShade.visible && !this.reduceMotion && dt > 0) {
      const count = Math.min(8, this.trailEmitter.tick(dt, Math.max(0, c.travelTrailRate ?? 18) * settings.global.particleCount));
      if (count > 0) this._emitWisps(this.travelShade.position, count);
    }
  }

  /** Small, short-lived umbral wisps drifting back off the flying shade (bounded). */
  _emitWisps(at, count) {
    const c = this.config;
    _pos.copy(at);
    _back.copy(this.direction).multiplyScalar(-0.5).setY(0.25).normalize();
    _emit.position = _pos;
    _emit.radius = 0.18 * (c.travelScale ?? 1);
    _emit.direction = _back;
    _emit.speed = 0.6;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.5;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = (c.umbraSize ?? 0.42) * 0.5;
    _emit.sizeVariance = 0.4;
    _emit.life = (c.umbraLife ?? 1.6) * 0.45;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0.6;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.umbra.emit(Math.min(8, count), _emit);
  }

  /** The shade reached the circle and marked nobody: a puff of smoke, then it shrinks away. */
  _miss() {
    if (!this.travelShade.visible) return;
    this.missed = true;
    if (!this.reduceMotion) this._emitUmbra(this.position, Math.round(8 * settings.global.particleCount), 0.4);
  }

  /**
   * The nearest living enemy to `point` (ties on id), optionally skipping
   * those already visited. A loop rather than filter + sort: no allocation.
   */
  _nearest(actors, px, pz, skipVisited) {
    let best = null;
    let bestDistance = Infinity;
    for (const actor of actors) {
      if (!actor.alive || (skipVisited && this.visited.has(actor.id))) continue;
      const d = flatDistance(actor.position, px, pz);
      if (d < bestDistance || (d === bestDistance && actor.id.localeCompare(best.id) < 0)) {
        best = actor;
        bestDistance = d;
      }
    }
    return best;
  }

  onImpact() {
    this._arrive();
    if (!this.scope) {
      this.travelShade.visible = false;
      return;
    }
    const query = this.scope.queryActors({ position: this.position.toArray(), radius: this.config.zoneRadius, relation: 'enemy' });
    const actor = query?.ok ? this._nearest(query.actors, this.position.x, this.position.z, false) : null;
    if (!actor) {
      this.failure = query?.reason ?? 'no eligible target';
      this._miss();
      return;
    }
    if (!this.standaloneMode) {
      // With combat on the mark itself is a committed status.
      const result = this.scope.emit({ type: 'status', element: 'shadow', targetIds: [actor.id], position: actor.position, intensity: 1 });
      if (!result?.ok) {
        this.failure = result?.reason ?? 'mark refused';
        this._miss();
        return;
      }
    }
    // A host: the flying shade becomes the mark round them.
    this.travelShade.visible = false;
    this.targetId = actor.id;
    this.targetGeneration = actor.standGeneration ?? null;
    this.markAt = this.stagedTime;
    this.visited.add(actor.id);
    this.shade.visible = true;
    this.shade.position.fromArray(actor.position);
    this.bloomAt = this.markAt;
    this._reachHeirs(actor.position[0], actor.position[2]);
    this.onFade(0, 0);
    this._markBeat();
  }

  /** A host is marked: a small knock, a breath of light, a puff of darkness. */
  _markBeat() {
    const c = this.config;
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * (c.markLight ?? 0.8) * settings.global.explosionIntensity);
    if (this.reduceMotion) return;
    this.ctx.shake?.add?.((c.markShake ?? 0.06) * settings.global.explosionIntensity, 3, 12);
    this.atmosphere.burst(this.shade.position, 10, MARK_BURST);
    this._emitUmbra(this.shade.position, Math.round(10 * settings.global.particleCount), 0.6);
  }

  /**
   * The shade lands — host or not. The blight spreads from the circle with a
   * shock ring, the bell tears up (over a host if one is found, else over
   * the empty circle, where it withers after `missHold`), a knock and a
   * breath of light. No shared bursts or decals: those cues belong to the
   * inheritance alone.
   */
  _arrive() {
    const c = this.config;
    const g = settings.global;
    this.landed = true;
    this.landing.copy(this.position).setY(0);
    this.bloomAt = 0;
    this.bloom.visible = true;
    this.bloom.position.copy(this.landing);
    this.blight.visible = true;
    this.blight.position.set(this.landing.x, 0.028, this.landing.z);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * (c.arrivalLight ?? 1.2) * g.explosionIntensity);
    if (this.reduceMotion) return;
    this.ctx.shake?.add?.((c.arrivalShake ?? 0.14) * g.explosionIntensity, 4, 14);
    this._emitUmbra(this.landing, Math.round(18 * g.particleCount), c.zoneRadius * 0.45);
  }

  /** Roots reach from the host toward the (up to two) enemies that would inherit it. */
  _reachHeirs(px, pz) {
    const c = this.config;
    this.tendrilCount = 0;
    const want = Math.min(MAX_TENDRILS, Math.max(0, Math.floor(c.tendrils ?? 2)));
    if (!want || !this.scope) return;
    const query = this.scope.queryActors({ position: [px, 0, pz], radius: c.inheritRadius, relation: 'enemy' });
    if (!query?.ok) return;
    const first = this._nearest(query.actors, px, pz, true);
    if (!first) return;
    this.tendrilTargets[0].fromArray(first.position);
    this.tendrilCount = 1;
    if (want > 1) {
      this.visited.add(first.id);
      const second = this._nearest(query.actors, px, pz, true);
      this.visited.delete(first.id);
      if (second) {
        this.tendrilTargets[1].fromArray(second.position);
        this.tendrilCount = 2;
      }
    }
    this.tendrilAt = this.stagedTime;
  }

  _syncRoot(material, clock, reveal, length, fade) {
    const c = this.config;
    const u = material.uniforms;
    u.uClock.value = clock;
    u.uReveal.value = reveal;
    u.uLength.value = Math.max(0.1, length);
    u.uFade.value = fade;
    u.uGlow.value = (c.tendrilGlow ?? 1.6) * settings.global.glow;
    syncShadeRamp(u, c.colorShadeA ?? '#f3eaff', c.colorShadeB ?? '#c7a7ff', c.colorShadeC ?? '#7b45c9', c.colorShadeD ?? '#0b0612', getColor);
  }

  /** The bell, the blight, the wake and the roots, every frame after the landing. */
  _updateBloom(visualTime, fade, exitFade, hunger) {
    if (!this.landed) return;
    const c = this.config;
    const gl = settings.global;
    const staged = this.stagedTime;

    /* bell */
    const hosted = this.markAt >= 0;
    const grow = this.reduceMotion ? 1 : Easing.outBack(Math.min(1, Math.max(0, (staged - this.bloomAt) / Math.max(0.05, c.bellRise ?? 0.4))));
    const missWither = hosted ? 0 : clamp01((staged - (c.missHold ?? 1.1)) / Math.max(0.05, c.bellWither ?? 0.7));
    const wither = Math.max(1 - fade, missWither);
    if (hosted) this.bloom.position.set(this.shade.position.x, 0, this.shade.position.z);
    const n = Math.min(MAX_PETALS, Math.max(0, Math.round(c.bellPetals ?? 6)));
    const H = c.bellHeight ?? 3.1;
    const seat = c.bellSeat ?? 1.35;
    const width = c.petalWidth ?? 1.55;
    const beat = clamp01(hunger / Math.max(0.05, c.markGlow ?? 0.8));
    const sway = this.reduceMotion ? 0 : c.bellSway ?? 0.04;
    for (let i = 0; i < n; i++) {
      const a = this.bellYaw + (i / Math.max(1, n)) * TAU + visualTime * (c.bellSpin ?? 0.12);
      // Petals arrive splayed open and close as they rise; they breathe on
      // the hunger beat and peel open as they wither.
      const open = (c.bellOpen ?? 0.1) + beat * (c.bellBreath ?? 0.2) + (1 - Math.min(1, grow)) * 0.7 + wither * 1.1
        + sway * Math.sin(visualTime * 1.6 + i * 2.1);
      _obj.position.set(Math.cos(a) * seat * (1 + wither * 0.3), -wither * 0.45 * H, Math.sin(a) * seat * (1 + wither * 0.3));
      _obj.rotation.set(open, Math.atan2(Math.cos(a), Math.sin(a)), 0);
      _obj.scale.set(width * (0.5 + 0.5 * Math.min(1, grow)), Math.max(0.001, H * grow), seat);
      _obj.updateMatrix();
      this.petals.setMatrixAt(i, _obj.matrix);
    }
    this.petals.count = n;
    this.petals.instanceMatrix.needsUpdate = true;
    this.bloom.visible = n > 0 && wither < 1;
    const pu = this.petalMat.userData.petal;
    pu.uPetalClock.value = visualTime;
    pu.uPetalHunger.value = hosted ? beat : 0.3;
    pu.uPetalWither.value = wither;
    pu.uPetalGlow.value = (c.bellGlow ?? 1.6) * gl.glow * gl.shaderIntensity;
    pu.uPetalGrow.value = grow;
    syncShadeRamp(pu, c.colorShadeA ?? '#f3eaff', c.colorShadeB ?? '#c7a7ff', c.colorShadeC ?? '#7b45c9', c.colorShadeD ?? '#0b0612', getColor);
    this.petalMat.color.copy(getColor(c.petalColor ?? '#1b1027'));
    this.petalMat.roughness = c.petalRoughness ?? 0.32;

    /* blight: stays at the landing until the cast exits */
    const b = this.blightMat.uniforms;
    b.uClock.value = visualTime;
    b.uFade.value = exitFade;
    b.uSpread.value = this.reduceMotion ? 1 : Easing.outCubic(clamp01(staged / Math.max(0.05, c.blightSpread ?? 0.55)));
    b.uShock.value = clamp01(staged / Math.max(0.05, c.shockTime ?? 0.45));
    b.uHunger.value = beat;
    b.uGlow.value = (c.blightGlow ?? 1.4) * gl.glow;
    b.uDarkness.value = (c.blightDarkness ?? 0.82) * gl.opacity;
    syncShadeRamp(b, c.colorShadeA ?? '#f3eaff', c.colorShadeB ?? '#c7a7ff', c.colorShadeC ?? '#7b45c9', c.colorShadeD ?? '#0b0612', getColor);
    const rb = c.zoneRadius * (c.blightScale ?? 1);
    this.blight.scale.set(rb, rb, 1);
    this.blight.visible = exitFade > 0;

    /* wake: lingers, then sinks away */
    const wakeFade = 1 - clamp01(staged / Math.max(0.1, c.wakeLife ?? 1.6));
    this.wake.visible = wakeFade > 0;
    this.wake.scale.z = c.wakeWidth ?? 0.7;
    this._syncRoot(this.wakeMat, visualTime, 1, this.length, wakeFade * exitFade);

    /* roots toward the heirs */
    const reveal = this.reduceMotion ? 1 : clamp01((staged - this.tendrilAt) / Math.max(0.05, c.tendrilCrawl ?? 0.9));
    for (let i = 0; i < MAX_TENDRILS; i++) {
      const t = this.tendrils[i];
      const on = i < this.tendrilCount && this.targetId !== null;
      t.visible = on;
      if (!on) continue;
      const to = this.tendrilTargets[i];
      const dx = to.x - this.shade.position.x;
      const dz = to.z - this.shade.position.z;
      const len = Math.hypot(dx, dz);
      t.position.set(this.shade.position.x, 0.05, this.shade.position.z);
      t.rotation.y = -Math.atan2(dz, dx);
      t.scale.set(Math.max(0.1, len), 1, c.tendrilWidth ?? 0.55);
      this._syncRoot(this.tendrilMats[i], visualTime, reveal, len, fade);
    }
  }

  /** Combat on: the binding delivered a committed hit; did it fell our host? */
  onCommittedHit(event) {
    if (this.standaloneMode || !this.targetId || this.phase !== AbilityPhase.IMPACT || !event.targetIds.includes(this.targetId)) return;
    this.inheritDefeated();
  }

  /** The current host is down: pass the shade to the nearest unvisited enemy. */
  inheritDefeated() {
    if (!this.targetId || !this.scope || this.phase !== AbilityPhase.IMPACT) return;
    const c = this.config;
    const prior = this.scope.getActor(this.targetId);
    if (!prior?.ok) return;
    if (this.targetGeneration !== null && prior.actor.standGeneration !== this.targetGeneration) {
      this.failure = 'marked target was replaced';
      this._release();
      return;
    }
    if (prior.actor.alive) return;
    if (this.transfers >= Math.min(MAX_TRANSFERS, Math.max(0, Math.floor(c.maxTransfers)))) {
      this._release();
      return;
    }

    const point = prior.actor.position;
    const query = this.scope.queryActors({ position: point, radius: c.inheritRadius, relation: 'enemy' });
    if (!query?.ok) {
      this.failure = query?.reason ?? 'inheritance query refused';
      this._release();
      return;
    }
    const next = this._nearest(query.actors, point[0], point[2], true);
    if (!next) {
      this._release();
      return;
    }

    // The strike is sourced at the fallen host, so it throws away from them.
    const hit = this.scope.emit({
      type: 'hit',
      element: 'shadow',
      targetIds: [next.id],
      position: next.position,
      sourcePosition: point,
      hitForce: impactForce(c),
      damage: c.transferDamage ?? 1,
      intensity: Math.min(2, 1 + this.transfers * 0.25)
    });
    if (!hit?.ok) {
      this.failure = hit?.reason ?? 'inheritance strike refused';
      this._release();
      return;
    }

    // A ribbon from the fallen host to the heir, in the next free slot.
    const dx = next.position[0] - point[0];
    const dz = next.position[2] - point[2];
    const slot = this.ribbonNext;
    const ribbon = this.ribbons[slot];
    ribbon.position.set(point[0], 0.7, point[2]);
    ribbon.rotation.y = -Math.atan2(dz, dx);
    ribbon.scale.set(Math.hypot(dx, dz), c.trailScale ?? 1, c.trailScale ?? 1);
    this.ribbonTimes[slot] = this.stagedTime;
    this.ribbonNext = (slot + 1) % this.ribbons.length;

    this.targetId = next.id;
    this.targetGeneration = next.standGeneration ?? null;
    this.markAt = this.stagedTime;
    this.visited.add(next.id);
    this.transfers++;
    this.shade.position.fromArray(next.position);
    this.bloomAt = this.markAt;
    this._reachHeirs(next.position[0], next.position[2]);
    this._transferBeat(next.position);
  }

  /** The shade has nowhere to go: drop the host and retract. */
  _release() {
    this.targetId = null;
    this.tendrilCount = 0;
    this.releaseAt = this.stagedTime;
  }

  /** An accepted inheritance: tier seal, knock, violet flash, light, darkness. */
  _transferBeat(position) {
    const c = this.config;
    const g = settings.global;
    this.lightBoost = c.lightIntensity * (c.transferLight ?? 1.4) * g.explosionIntensity;
    if (this.reduceMotion) return;
    this.sealEffects.fire(this.transfers, position, this.stagedTime, c);
    this.ctx.shake?.add?.((c.transferShake ?? 0.22) * g.explosionIntensity, 3, 18);
    this.ctx.flash?.trigger?.(getColor(c.edgeColor), (c.transferFlash ?? 0.16) * g.explosionIntensity);
    _pos.fromArray(position);
    this._emitUmbra(_pos, Math.round(16 * g.particleCount), 0.7);
  }

  /* ------------------------------------------------------------------ */
  /* The waiting shade                                                   */
  /* ------------------------------------------------------------------ */

  onFade(dt, t) {
    /* --- re-validate the host; with combat off, observe its defeat --- */
    if (this.scope && this.targetId) {
      const current = this.scope.getActor(this.targetId);
      if (!current?.ok) {
        this.failure = current?.reason ?? 'marked target unavailable';
        this._release();
      } else if (this.targetGeneration !== null && current.actor.standGeneration !== this.targetGeneration) {
        this.failure = 'marked target was replaced';
        this._release();
      } else if (dt > 0 && this.standaloneMode && this.phase === AbilityPhase.IMPACT && !current.actor.alive) {
        this.inheritDefeated();
      }
    }

    const c = this.config;
    const gl = settings.global;
    const visualTime = this.reduceMotion ? 0 : this.age;
    this._syncParticles();
    if (!this.reduceMotion && this.targetId && this.phase === AbilityPhase.IMPACT) this.atmosphere.update(dt, this.shade.position);

    /* --- 1 · a shade that marked nobody shrinks away where it landed --- */
    const fizzling = this.missed && this.travelShade.visible;
    const fizzle = fizzling ? 1 - clamp01(this.impactTime / MISS_FIZZLE) : 0;
    if (fizzling) {
      this.travelShade.scale.setScalar(Math.max(0.001, (c.travelScale ?? 1) * fizzle));
      if (fizzle <= 0) this.travelShade.visible = false;
    }

    /* --- envelopes --- */
    let fade = t <= 1 ? 1 : 1 - clamp01(t - 1);
    if (this.releaseAt >= 0) {
      const release = clamp01((this.stagedTime - this.releaseAt) / Math.max(0.1, c.releaseDuration ?? 0.55));
      fade = Math.min(fade, 1 - release);
      if (release >= 1) this.shade.visible = false;
    }
    const markAge = this.markAt < 0 ? 0 : Math.max(0, this.stagedTime - this.markAt);
    const markEntry = this.markAt < 0 ? 0 : this.reduceMotion ? 1 : clamp01(markAge / Math.max(0.1, c.markRise ?? 0.45));
    const hunger = this.reduceMotion ? 0 : markEntry * (0.5 + 0.5 * Math.sin(visualTime * (c.markPulseRate ?? 2.5))) * (c.markGlow ?? 0.8);
    // The whole mark rises round its host — and shrinks away on release.
    this.shade.scale.setScalar(Math.max(0.001, fade * markEntry));
    const shadow = getColor(c.shadowColor);
    const edge = getColor(c.edgeColor);
    const voidColor = getColor(c.voidColor ?? '#120a1c');

    this.sealEffects.update(this.stagedTime, visualTime, fade, c, this.reduceMotion);
    // The flying wings share the mark's material: while they fizzle (and no
    // mark exists) the material follows the fizzle instead of the mark.
    this._syncWings(visualTime, fizzling ? fizzle : fade * markEntry, hunger);

    /* --- 3 · the floor --- */
    const glyph = this.floorMat.uniforms;
    glyph.uClock.value = visualTime;
    glyph.uFade.value = fade * markEntry;
    glyph.uHunger.value = hunger;
    glyph.uGlow.value = (c.floorGlow ?? 1) * gl.glow;
    glyph.uColor.value.copy(shadow);
    glyph.uEdge.value.copy(edge);
    this.floor.scale.set(c.floorRadius ?? 1, c.floorRadius ?? 1, 1);

    const pool = this.poolMat.uniforms;
    pool.uClock.value = visualTime;
    pool.uFade.value = fade * markEntry;
    pool.uHunger.value = hunger;
    pool.uDarkness.value = (c.poolDarkness ?? 0.75) * gl.opacity;
    pool.uSwirl.value = c.poolSwirl ?? 0.6;
    pool.uColor.value.copy(shadow);
    pool.uVoid.value.copy(voidColor);
    this.pool.scale.set(c.poolRadius ?? 1.35, c.poolRadius ?? 1.35, 1);

    const warp = this.warpMat.uniforms;
    warp.uClock.value = visualTime;
    warp.uWidth.value = (c.poolRadius ?? 1.35) * 2;
    warp.uHeight.value = (c.wingHeight ?? 1.2) * 2;
    warp.uStrength.value = (c.warpStrength ?? 0.45) * gl.distortion * fade * markEntry * (0.6 + 0.4 * hunger);
    this.warp.visible = !this.reduceMotion && warp.uStrength.value > 0.005;

    /* --- 4 · ribbons --- */
    const trailDuration = Math.max(0.1, c.trailDuration ?? 0.5);
    for (let i = 0; i < this.ribbons.length; i++) {
      const age = this.ribbonTimes[i] < 0 ? -1 : this.stagedTime - this.ribbonTimes[i];
      this.ribbons[i].visible = age >= 0 && age < trailDuration;
      const u = this.ribbonMaterials[i].uniforms;
      u.uClock.value = visualTime;
      u.uFade.value = fade * (age < 0 ? 0 : 1 - clamp01(age / trailDuration));
      u.uTwist.value = c.trailTwist ?? 1.5;
      u.uGlow.value = (c.trailGlow ?? 1.2) * gl.glow;
      u.uColor.value.copy(shadow);
      u.uEdge.value.copy(edge);
    }

    // The shade follows a living host.
    if (this.targetId && this.scope) {
      const actor = this.scope.getActor(this.targetId);
      if (actor?.ok && actor.actor.alive) this.shade.position.fromArray(actor.actor.position);
    }

    /* --- 2 · wings unfurl in staggered pairs --- */
    const wingHeight = c.wingHeight ?? 1.2;
    for (let i = 0; i < this.wings.length; i++) {
      const w = this.wings[i];
      const unfold = this.reduceMotion ? 1 : clamp01((markAge - (i % 4) * (c.wingStagger ?? 0.06)) / Math.max(0.1, c.markRise ?? 0.45));
      w.rotation.y = (i * TAU) / this.wings.length + visualTime * (c.wingSpin ?? 0.25);
      w.rotation.z = 0.5 + (i % 2) * 0.3 + (1 - unfold) * (c.wingCurl ?? 0.7) + 0.12 * Math.sin(visualTime * 2 + i);
      w.position.y = wingHeight - (1 - unfold) * (c.wingRise ?? 0.8);
      w.scale.setScalar(0.15 + 0.85 * unfold);
    }

    /* --- the crescent crown --- */
    const sigil = this.sigilMat.uniforms;
    sigil.uClock.value = visualTime;
    sigil.uFade.value = fade * markEntry;
    sigil.uHunger.value = hunger;
    sigil.uGlow.value = (c.sigilGlow ?? 1.2) * gl.glow;
    sigil.uColor.value.copy(shadow);
    sigil.uEdge.value.copy(edge);
    this.sigil.position.y = (c.sigilHeight ?? 2.1) + 0.06 * Math.sin(visualTime * 1.3);
    this.sigil.rotation.y = -visualTime * 0.6;
    this.sigil.scale.setScalar((c.sigilScale ?? 1) * (1 + hunger * 0.08));

    /* --- belladonna drifting up through the shade --- */
    const blossom = this.blossomMat.uniforms;
    blossom.uClock.value = visualTime;
    blossom.uFade.value = fade * markEntry;
    blossom.uHunger.value = hunger;
    blossom.uGlow.value = gl.glow;
    blossom.uColor.value.copy(shadow);
    blossom.uEdge.value.copy(edge);
    blossom.uVoid.value.copy(voidColor);
    const orbit = c.blossomOrbit ?? 0.6;
    const rise = c.blossomRise ?? 0.4;
    const bloom = c.blossomScale ?? 1;
    for (let i = 0; i < this.motes.length; i++) {
      const a = i * GOLDEN + visualTime * orbit;
      const r = 0.7 + (i % 5) * 0.16;
      // Each rises 2.3 m and wraps, so the stream never runs dry.
      const climb = (i * 0.29 + visualTime * rise) % 2.3;
      const o = this.motes[i];
      o.position.set(Math.cos(a) * r, 0.2 + climb, Math.sin(a) * r);
      o.rotation.set(Math.sin(visualTime + i) * 0.5, a, Math.cos(visualTime * 0.7 + i) * 0.5);
      // Blossoms open as they lift off and close before they wrap.
      o.scale.setScalar(Math.max(0.001, bloom * Math.sin(Math.PI * clamp01(climb / 2.3)) * 1.4));
    }

    /* --- darkness rising off the pool --- */
    if (this.targetId && this.phase === AbilityPhase.IMPACT && !this.reduceMotion && dt > 0 && this.umbra) {
      const count = this.umbraEmitter.tick(dt, Math.max(0, (c.umbraRate ?? 16) * markEntry) * gl.particleCount);
      if (count > 0) this._emitUmbra(this.shade.position, count, (c.poolRadius ?? 1.35) * 0.6);
    }

    /* --- 6–8 · bell, blight, wake and roots --- */
    this._updateBloom(visualTime, fade, t <= 1 ? 1 : 1 - clamp01(t - 1), hunger);
  }

  /** The light rides the shade (and so the host), not the fixed aim point. */
  _updateLight(dt, scale) {
    if (this.phase === AbilityPhase.TRAVEL || !this.shade.visible) return super._updateLight(dt, scale);
    this._lightSaved.copy(this.position);
    this.position.copy(this.shade.position);
    try {
      super._updateLight(dt, scale);
    } finally {
      this.position.copy(this._lightSaved);
    }
  }

  onDestroy() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.shade.visible = false;
    this.warp.visible = false;
    for (const ribbon of this.ribbons) ribbon.visible = false;
    this.travelShade.visible = false;
    this.missed = false;
    this.landed = false;
    this.bloom.visible = false;
    this.blight.visible = false;
    this.wake.visible = false;
    for (const t of this.tendrils) t.visible = false;
    this.tendrilCount = 0;
    this.sealEffects.reset();
    this.targetId = null;
    this.scope = null;
    this.visited.clear();
  }

  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const x of this.gs) x.dispose();
    for (const x of this.ms) x.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('☾  Nightshade Inheritance');
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
  R(cast, 'speed', 1, 60, 0.1, 'shade speed (m/s)');
  R(cast, 'cooldown', 0, 30, 0.1, 'cooldown');
  R(cast, 'zoneRadius', 1, 8, 0.1, 'first-host circle (m)');
  R(cast, 'lifetime', 2, 12, 0.1, 'waits for (s)');
  R(cast, 'fade', 0.1, 5, 0.1, 'exit (s)');
  if (typeof Editor?.castAnimation === 'function') Editor.castAnimation(cast, c);
  else cast.add(c, 'castAnim', CAST_ANIMATIONS);

  const inherit = sub(folder, 'The inheritance');
  R(inherit, 'inheritRadius', 1, 12, 0.1, 'heir search radius (m)');
  R(inherit, 'maxTransfers', 0, 3, 1, 'max inheritances');
  R(inherit, 'transferDamage', 0.1, 3, 0.1, 'strike damage');
  R(inherit, 'hitImpulse', 0, 24, 0.1, 'knock-back (m/s)');
  R(inherit, 'hitLift', 0, 20, 0.1, 'lift (m/s)');
  R(inherit, 'hitSpin', 0, 8, 0.05, 'tumble');

  const light = sub(folder, 'Light + palette');
  C(light, 'lightColor', 'light colour');
  R(light, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, 'markLight', 0, 3, 0.05, 'mark punch (× intensity)');
  R(light, 'transferLight', 0, 4, 0.05, 'inheritance punch (× intensity)');
  C(light, 'shadowColor', 'shade');
  C(light, 'edgeColor', 'veins + edges');
  C(light, 'voidColor', 'void');

  const flight = sub(folder, '1 · Shade in flight');
  R(flight, 'travelScale', 0.25, 2, 0.05, 'size');
  R(flight, 'travelHeight', 0, 3, 0.05, 'height (m)');
  R(flight, 'travelSpin', -6, 6, 0.05, 'turn (rad/s)');
  R(flight, 'travelFlap', 0, 20, 0.1, 'wingbeat');
  R(flight, 'travelTrailRate', 0, 80, 1, 'wisp trail/second');

  const mark = sub(folder, '2 · Mark');
  R(mark, 'markRise', 0.1, 2, 0.05, 'rises over (s)');
  R(mark, 'wingStagger', 0, 0.3, 0.01, 'wing stagger (s)');
  R(mark, 'wingCurl', 0, 2, 0.05, 'wing curl (rad)');
  R(mark, 'wingRise', 0, 2, 0.05, 'wing rise (m)');
  R(mark, 'wingHeight', 0.2, 3, 0.05, 'wing root height (m)');
  R(mark, 'wingSpin', -2, 2, 0.01, 'wing turn (rad/s)');
  R(mark, 'wingOpacity', 0, 1, 0.01, 'membrane density');
  R(mark, 'wingGlow', 0, 4, 0.05, 'wing glow');
  R(mark, 'markPulseRate', 0, 6, 0.1, 'hunger beat');
  R(mark, 'markGlow', 0, 2, 0.05, 'hunger glow');
  R(mark, 'sigilHeight', 0.5, 4, 0.05, 'crown height (m)');
  R(mark, 'sigilScale', 0.2, 3, 0.05, 'crown size');
  R(mark, 'sigilGlow', 0, 4, 0.05, 'crown glow');
  R(mark, 'blossomScale', 0, 3, 0.05, 'blossom size');
  R(mark, 'blossomOrbit', -3, 3, 0.05, 'blossom orbit (rad/s)');
  R(mark, 'blossomRise', 0, 2, 0.01, 'blossom drift (m/s)');

  const floor = sub(folder, '3 · Floor');
  R(floor, 'floorRadius', 0.2, 4, 0.05, 'glyph radius (m)');
  R(floor, 'floorGlow', 0, 3, 0.05, 'glyph glow');
  R(floor, 'poolRadius', 0.2, 4, 0.05, 'pool radius (m)');
  R(floor, 'poolDarkness', 0, 1, 0.01, 'pool darkness');
  R(floor, 'poolSwirl', -3, 3, 0.05, 'pool swirl (rad/s)');
  R(floor, 'warpStrength', 0, 2, 0.01, 'pull distortion');

  const transfer = sub(folder, '4 · Inheritance');
  R(transfer, 'trailScale', 0.25, 2, 0.05, 'ribbon size');
  R(transfer, 'trailDuration', 0.1, 2, 0.05, 'ribbon lingers (s)');
  R(transfer, 'trailTwist', 0, 6, 0.05, 'ribbon twist (half-turns)');
  R(transfer, 'trailGlow', 0, 4, 0.05, 'ribbon glow');
  R(transfer, 'sealScale', 0.25, 3, 0.05, 'seal size');
  R(transfer, 'sealDuration', 0.1, 2, 0.05, 'seal closes over (s)');
  R(transfer, 'sealGlow', 0, 2, 0.05, 'seal glow');
  R(transfer, 'markShake', 0, 1, 0.01, 'mark knock');
  R(transfer, 'transferShake', 0, 1, 0.01, 'inheritance knock');
  R(transfer, 'transferFlash', 0, 1, 0.01, 'inheritance flash');
  R(transfer, 'releaseDuration', 0.1, 2, 0.05, 'retracts over (s)');

  const motes = sub(folder, '5 · Particles');
  R(motes, 'particleRate', 0, 100, 1, 'shadow smoke/second');
  R(motes, 'particleSize', 0.02, 0.5, 0.01, 'smoke size');
  R(motes, 'umbraRate', 0, 100, 1, 'umbral smoke/second');
  R(motes, 'umbraSize', 0.05, 2, 0.01, 'umbral size');
  R(motes, 'umbraLife', 0.1, 5, 0.05, 'umbral life (s)');
  R(motes, 'umbraRise', 0, 3, 0.05, 'umbral rise (m/s)');
  G(motes, 'colorUmbra', 'umbral gradient');

  const bell = sub(folder, '6 · Nightshade bell');
  R(bell, 'bellPetals', 0, 8, 1, 'petals');
  R(bell, 'bellHeight', 0.5, 6, 0.05, 'height (m)');
  R(bell, 'bellSeat', 0.3, 4, 0.05, 'seat radius (m)');
  R(bell, 'petalWidth', 0.2, 3, 0.05, 'petal width (m)');
  R(bell, 'bellRise', 0.05, 2, 0.01, 'tears up over (s)');
  R(bell, 'bellOpen', -0.5, 1.5, 0.01, 'rest lean (rad)');
  R(bell, 'bellBreath', 0, 1, 0.01, 'opens on the beat (rad)');
  R(bell, 'bellSpin', -2, 2, 0.01, 'turn (rad/s)');
  R(bell, 'bellSway', 0, 0.3, 0.005, 'sway (rad)');
  R(bell, 'bellGlow', 0, 6, 0.05, 'vein glow');
  R(bell, 'bellWither', 0.05, 3, 0.05, 'withers over (s)');
  R(bell, 'missHold', 0, 4, 0.05, 'stands at an empty circle (s)');
  R(bell, 'petalRoughness', 0, 1, 0.01, 'petal roughness');
  C(bell, 'petalColor', 'petal');

  const blight = sub(folder, '7 · Blight');
  R(blight, 'blightScale', 0.2, 2, 0.01, 'radius (× zone)');
  R(blight, 'blightSpread', 0.05, 3, 0.01, 'creeps out over (s)');
  R(blight, 'blightDarkness', 0, 1, 0.01, 'darkness');
  R(blight, 'blightGlow', 0, 5, 0.05, 'root glow');
  R(blight, 'shockTime', 0.05, 2, 0.01, 'arrival ring (s)');
  R(blight, 'arrivalShake', 0, 1, 0.01, 'arrival knock');
  R(blight, 'arrivalLight', 0, 4, 0.05, 'arrival light (× intensity)');

  const roots = sub(folder, '8 · Roots');
  R(roots, 'wakeWidth', 0, 3, 0.05, 'wake width (m)');
  R(roots, 'wakeLife', 0.1, 5, 0.05, 'wake lingers (s)');
  R(roots, 'tendrils', 0, 2, 1, 'reach toward heirs');
  R(roots, 'tendrilWidth', 0.05, 2, 0.01, 'root width (m)');
  R(roots, 'tendrilCrawl', 0.05, 3, 0.05, 'crawls over (s)');
  R(roots, 'tendrilGlow', 0, 5, 0.05, 'root glow');
  G(roots, 'colorShade', 'shade ramp');

  return folder;
}
