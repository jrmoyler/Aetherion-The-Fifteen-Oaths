import { CatmullRomCurve3, Color, Group, InstancedMesh, Mesh, Object3D, PlaneGeometry, Vector3 } from 'three';
import { Ability as BaseAbility, AbilityPhase } from '../../Ability.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { createExpansionFX, routeExpansionTransparency, expansionBurst, ParticleShape } from '../ExpansionFX.js';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import config from './config.js';
import {
  heartGeometry,
  vesselCurves,
  taperedTube,
  bloodCellGeometry,
  gateRingGeometry,
  pulseRingGeometry,
  threadTubeGeometry
} from './PulseCovenantGeometry.js';
import {
  createHeartMaterial,
  createArteryMaterial,
  createCellMaterial,
  createCovenantFloorMaterial,
  createGateMaterial,
  createPulseRingMaterial,
  createPulseWarpMaterial,
  createPoolMaterial,
  createThreadMaterial
} from './PulseCovenantMaterials.js';

export { config };
export const ID = config.id;
const UID = 'matrix-expansion/pulse-covenant';

const TAU = Math.PI * 2;
/** Arteries in the network; three cells ride each. */
const ARTERIES = 6;
const CELLS_PER_ARTERY = 3;
/** Events remembered for de-duplication. Bounded so a long covenant cannot grow. */
const MAX_REMEMBERED = 128;
/** The combat bridge refuses more than eight targets per hit. */
const MAX_PULSE_TARGETS = 8;
/** Threads the heart can throw to bodies nearby (presentation only). */
const MAX_THREADS = 6;

const clamp = (x) => Math.max(0, Math.min(1, x));

/* Module scratch: no allocation per frame. */
const beadTransform = new Object3D();
const _emit = {};
const _up = new Vector3(0, 1, 0);
const _at = new Vector3();
const _heart = { time: 0, beat: 0, fade: 1, dissolve: 0 };
const _artery = { flow: 0, grow: 1, fade: 1, flare: 0 };
const _cell = { fade: 1, flare: 0 };
const _floor = { time: 0, beat: 0, pulse: 0, fade: 1, cue: 0, cueAlpha: 0, window: 0, gate: 0.5 };
const _gate = { sweep: 0, window: 0, beat: 0, fade: 1 };
const _ring = { progress: 0, alpha: 0 };
const _warp = { radius: 1, progress: 0, strength: undefined };
const _pool = { time: 0, spread: 0, beat: 0, fade: 1 };
const _wave = { progress: 0, alpha: 0, glow: 1, width: 0.2 };
const _thread = { a: new Vector3(), b: new Vector3(), c: new Vector3(), grow: 0, flow: 0, fade: 1 };
const _heartAt = new Vector3();

/**
 * A heartbeat as a doubled thump ("lub-dub") rather than a sine: a strong
 * contraction at the start of each beat and a weaker one a fifth later.
 */
function heartbeat(phase) {
  const p = phase - Math.floor(phase);
  const lub = Math.exp(-Math.pow(p / 0.07, 2)) + Math.exp(-Math.pow((1 - p) / 0.07, 2));
  const dub = 0.6 * Math.exp(-Math.pow((p - 0.22) / 0.06, 2));
  return Math.min(1, lub + dub);
}

/**
 * PULSE COVENANT — a heart bound above the caster that answers rhythm.
 *
 * A self cast that is a *reactive window* rather than an attack. It never
 * strikes on its own: it subscribes to the caster's committed hits on the
 * combat bridge and, whenever two **different** casts land hits one
 * `beatSeconds` apart (± `tolerance`), it sends a pulse of blood through up
 * to `maxTargets` enemies within `pulseRadius` of the second hit — never the
 * ones that hit already took. Its own hits, repeated events and later hits
 * from a cast it has already counted never count.
 *
 * ## Beats
 *
 *   - **anticipation (0 → formTime)** — the heart swells into being 2.4 m
 *     over the caster's head and the arteries start to grow down from it.
 *   - **bind (formTime, one frame)** — the heart lands its first beat: a burst
 *     of blood off it, a stain slammed into the floor (`bindDecal`), a
 *     shockwave, flash, shake and a light punch. The blood pool starts to run.
 *   - **travel** — threads: vessels the heart throws out over an arch to the
 *     nearest bodies within `threadRange`, growing tip-first over
 *     `threadGrowTime`; and on every beat a ragged blood wave rolls out across
 *     the floor from the sigil to `waveReach`. Both are presentation — they
 *     show the reach of the covenant; the pulse itself is still decided only
 *     by the rhythm rule above.
 *   - **linger (the covenant's `life`)** — it lives on the beat: the heart
 *     contracts lub-dub apex-first, a bolus runs down each artery and out
 *     along each thread and splashes on its body, the pool ripples, beads of
 *     blood jump off the sigil and motes rise off the pool. A pulse (when the
 *     rhythm lands) throws its own ring, warp, droplets and light at the hit.
 *   - **exit (`fade`)** — the threads retract, the network shrinks into the
 *     heart, the heart burns away apex-up and the pool dries off the floor;
 *     the bind stain stays a while longer.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the heart** — authored, deep-bevelled two-lobed muscle with an
 *      aortic arch and a pulmonary trunk (`createHeartMaterial`: opaque, lit
 *      wrap-shaded muscle on `LAYER.WORLD`, casting a shadow, with a four-stop
 *      ramp — deep clefts, muscle body, flaring veins, a wet white highlight).
 *   2. **the arteries** — six tapered vessels draped to the sigil's rim (their
 *      reach is *derived* from `floorRadius`), each with a capillary fork,
 *      a bolus of light running down them once per beat; instanced red cells
 *      (`bloodCellGeometry`) riding the six main curves.
 *   3. **the covenant floor** — a dark glossy blood pool (normal blended, the
 *      deep stop) under an additive sigil: capillaries, breathing rings and
 *      the **timing cue** — after each owned hit a ring contracts from the rim
 *      to the gate over exactly one beat and burns while the next hit would
 *      land in the window. The gate (`gateRingGeometry`) flares in the window.
 *   4. **beat waves & threads** — the reach, see *travel*. The wave has its
 *      own warp on `LAYER.DISTORTION`.
 *   5. **the pulse** — thrown from the second hit, not from the caster: a
 *      ragged ring across `pulseRadius`, an outward warp, a burst of droplets,
 *      a second pooled light at the contact point, shake, flash and a punch.
 *   6. **particles** — the pooled droplet system (`expansion.blood`: the
 *      bind and pulse bursts, the beads off the sigil, the splashes on the
 *      threaded bodies) and soft additive motes (`expansion.blood-motes`)
 *      rising off the pool.
 *
 * ## Timing
 *
 * The rhythm is judged on the bridge's fixed ticks (`e.tick / tickRate`),
 * never on frame time, so it is deterministic. The visual cue uses the cast's
 * age at the moment the hit was observed, which is the same instant on screen.
 * The covenant lasts `life` seconds (gameplay; not scaled by the global
 * lifetime) and withdraws over `fade`.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** It never strikes along a line; every hit it makes is its own pulse. */
  get handlesOwnHits() {
    return true;
  }

  get impactDuration() {
    return this.config.life;
  }

  get fadeDuration() {
    return Math.max(0.05, (this.config.fade ?? 0.6) * Math.max(0.1, settings.global.lifetime));
  }

  /** Cells riding the arteries plus the visible meshes. HUD readout only. */
  get instanceCount() {
    return this.vesselBeads.count + this.branches.length + 1;
  }

  /** The caster's light swells on every heartbeat. */
  lightShimmer() {
    const c = this.config;
    return 1 - c.lightThrob * 0.5 + c.lightThrob * heartbeat(this.age / Math.max(0.1, c.beatSeconds));
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /** Every geometry and material this instance owns, for `dispose`. */
    this.resources = [];
    const own = (x) => (this.resources.push(x), x);

    this.root = new Group();
    this.group.add(this.root);

    /* ---- 1 · the heart ---- */
    this.heartMat = own(createHeartMaterial());
    this.core = new Mesh(own(heartGeometry()), this.heartMat);
    this.core.position.set(0, 1.5, 0);
    this.core.scale.setScalar(0.48);
    this.core.renderOrder = 2;
    this.root.add(this.core);
    // The great vessels leave the top of the heart and beat with it: an
    // aortic arch hooking over, a pulmonary trunk beside it. Heart-local.
    this.aortaMat = own(createArteryMaterial());
    const arch = new CatmullRomCurve3([
      new Vector3(0.12, 0.35, 0.02), new Vector3(0.22, 0.95, 0.0), new Vector3(0.05, 1.28, -0.04),
      new Vector3(-0.38, 1.22, -0.06), new Vector3(-0.62, 0.86, -0.04), new Vector3(-0.7, 0.55, 0.0)
    ]);
    const trunk = new CatmullRomCurve3([
      new Vector3(-0.22, 0.32, 0.08), new Vector3(-0.3, 0.8, 0.12), new Vector3(-0.12, 1.05, 0.18), new Vector3(0.18, 1.1, 0.22)
    ]);
    this.aortas = [
      new Mesh(own(taperedTube(arch, 40, 10, 0.17, 0.1)), this.aortaMat),
      new Mesh(own(taperedTube(trunk, 24, 10, 0.13, 0.08)), this.aortaMat)
    ];
    for (const vessel of this.aortas) this.core.add(vessel);

    /* ---- 2 · the arteries, forks and cells ---- */
    // One sub-group so `arteryReach` scales vessels and cells together.
    this.network = new Group();
    this.root.add(this.network);
    const { arteries, forks } = vesselCurves();
    this.vesselCurves = arteries;
    this.veinMat = own(createArteryMaterial());
    this.forkMat = own(createArteryMaterial());
    this.branches = [];
    for (let k = 0; k < ARTERIES; k++) {
      const vein = new Mesh(own(taperedTube(arteries[k], 56, 8, 0.07, 0.028)), this.veinMat);
      this.network.add(vein);
      this.branches.push(vein);
    }
    this.forks = [];
    for (let k = 0; k < ARTERIES; k++) {
      const fork = new Mesh(own(taperedTube(forks[k], 24, 6, 0.034, 0.012)), this.forkMat);
      this.network.add(fork);
      this.forks.push(fork);
    }
    this.cellMat = own(createCellMaterial());
    /** The shared cell material under its original name. */
    this.glow = this.cellMat;
    this.vesselBeads = new InstancedMesh(own(bloodCellGeometry()), this.cellMat, ARTERIES * CELLS_PER_ARTERY);
    this.vesselBeads.frustumCulled = false;
    this.network.add(this.vesselBeads);

    /* ---- 3 · the blood pool, the covenant floor and its gate ---- */
    this.poolMat = own(createPoolMaterial());
    this.pool = new Mesh(own(new PlaneGeometry(1, 1)), this.poolMat);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.035;
    this.pool.renderOrder = 1;
    this.root.add(this.pool);
    this.membrane = own(createCovenantFloorMaterial());
    this.floor = new Mesh(own(new PlaneGeometry(1, 1)), this.membrane);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = 0.05;
    this.root.add(this.floor);
    this.gateMat = own(createGateMaterial());
    this.ring = new Mesh(own(gateRingGeometry()), this.gateMat);
    this.ring.position.y = 0.07;
    this.root.add(this.ring);

    /* ---- 4 · the pulse — lives in world space at the triggering hit ---- */
    this.waveMaterial = own(createPulseRingMaterial());
    this.pulseWave = new Mesh(own(pulseRingGeometry()), this.waveMaterial);
    this.pulseWave.visible = false;
    this.group.add(this.pulseWave);
    this.warpMat = own(createPulseWarpMaterial());
    this.pulseWarp = new Mesh(own(new PlaneGeometry(1, 1, 1, 1)), this.warpMat);
    this.pulseWarp.visible = false;
    this.group.add(this.pulseWarp);

    /* ---- 4b · beat waves and threads — world space ---- */
    this.waveMat = own(createPulseRingMaterial());
    this.beatWave = new Mesh(own(pulseRingGeometry(128, 4)), this.waveMat);
    this.beatWave.visible = false;
    this.group.add(this.beatWave);
    this.beatWarpMat = own(createPulseWarpMaterial());
    this.beatWarp = new Mesh(own(new PlaneGeometry(1, 1, 1, 1)), this.beatWarpMat);
    this.beatWarp.visible = false;
    this.group.add(this.beatWarp);
    const threadGeometry = own(threadTubeGeometry());
    this.threads = [];
    for (let k = 0; k < MAX_THREADS; k++) {
      const material = own(createThreadMaterial());
      const mesh = new Mesh(threadGeometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.threads.push({ mesh, material, dummy: null, grow: 0, cycle: 0, end: new Vector3() });
    }
    this._found = [];

    for (const mesh of [...this.branches, ...this.forks, this.vesselBeads, this.pool, this.floor, this.ring, this.pulseWave, this.beatWave, ...this.threads.map((t) => t.mesh)]) {
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false;
    }
    routeExpansionTransparency(this.group);
    // The heart and its great vessels are opaque, lit muscle: world layer,
    // in the depth prepass, casting a shadow onto the pool.
    for (const mesh of [this.core, ...this.aortas]) {
      mesh.layers.set(LAYER.WORLD);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
    }
    // The warp proxies are *not* transparent effects (their material is
    // opaque, see createPulseWarpMaterial), so the sweep leaves them alone
    // and they live on the distortion layer only.
    for (const warp of [this.pulseWarp, this.beatWarp]) {
      warp.layers.set(LAYER.DISTORTION);
      warp.frustumCulled = false;
    }

    /* ---- per-cast state (reset in onSpawn) ---- */
    this._unsub = null;
    this._scope = null;
    this._lastTick = null;
    this._lastHitAge = -1;
    this.failure = null;
    this._pulseAge = 999;
    this._hasPulse = false;
    this._seen = new Set();
    this._seenOrder = [];
    this._casts = new Set();
    this._castOrder = [];
    this._pulseLight = null;
    this._fxPoint = new Vector3();
    this._pulseLightPosition = new Vector3();
    this._pulseLightColor = new Color();
    this._lastBeat = -1;
    this._bound = false;
    this._disposed = false;
  }

  createParticles() {
    // One pooled droplet system, as every batch-C candidate is bound to (the
    // particle-engine integration test pins it). It carries two emissions:
    // the burst a pulse throws, and the beads of blood that jump off the
    // sigil's rim on every heartbeat. Non-additive: it is liquid.
    this.fx = createExpansionFX(this.ctx, 'blood', {
      shape: ParticleShape.DROPLET,
      colors: ['#fff1e7', '#ff8290', '#c11136', '#3d0717'],
      additive: false
    });
    // Soft additive motes of blood vapour rising off the pool: a second shape.
    this.motes = createExpansionFX(this.ctx, 'blood-motes', {
      shape: ParticleShape.SOFT,
      colors: ['#fff0f2', '#ff8290', '#d91f47', '#24030b'],
      additive: true,
      capacity: 360
    });
    this.moteEmitter = new RateEmitter();
    this._gradient = [new Color(), new Color(), new Color(), new Color()];
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._lastTick = null;
    this._lastHitAge = -1;
    this.failure = null;
    this._pulseAge = 999;
    this._hasPulse = false;
    this._lastBeat = -1;
    this._bound = false;
    this.moteEmitter.reset();
    for (const thread of this.threads) {
      thread.dummy = null;
      thread.grow = 0;
      thread.cycle = 0;
      thread.mesh.visible = false;
    }
    this.beatWave.visible = false;
    this.beatWarp.visible = false;
    this._seen.clear();
    this._seenOrder.length = 0;
    this._casts.clear();
    this._castOrder.length = 0;
    this.root.visible = true;
    this.pulseWave.visible = false;
    this.pulseWarp.visible = false;
    this._bind();
    this._sync(0);
  }

  _bind() {
    const bridge = this.ctx.expansionCombat;
    if (!bridge?.bind) {
      this._bridgeUnavailable = true;
      this.failure = 'combat bridge unavailable';
      return;
    }
    const scope = bindExpansionCombat(this.ctx, UID);
    this._scope = scope;
    this._bridgeUnavailable = false;
    const sub = scope.on('hit', (e) => this._onHit(e));
    this._bridgeUnavailable = !sub?.ok;
    if (!sub?.ok) this.failure = sub?.reason ?? 'owned hit observation unavailable';
    this._unsub = sub?.ok ? sub.unsubscribe : null;
  }

  /** Remember `key` in a bounded set (oldest forgotten first). */
  _remember(set, order, key) {
    set.add(key);
    order.push(key);
    if (order.length > MAX_REMEMBERED) set.delete(order.shift());
  }

  /* ------------------------------------------------------------------ */
  /* The mechanic                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * A committed owned hit. Counts only once per cast and per event, never for
   * this covenant's own pulses; judges the interval to the previous counted
   * hit on fixed ticks, and on a match emits one bounded pulse.
   */
  _onHit(e) {
    if (!this.isActive || e.ownerId !== 'caster' || e.abilityUid === UID || !e.targetIds?.length || this._seen.has(e.eventId)) return;
    const cast = e.castId ?? e.eventId;
    if (this._casts.has(cast)) return;
    this._remember(this._casts, this._castOrder, cast);
    this._remember(this._seen, this._seenOrder, e.eventId);

    const c = this.config;
    const tickRate = this._scope?.tickRate ?? 30;
    const interval = this._lastTick === null ? Infinity : (e.tick - this._lastTick) / tickRate;
    this._lastTick = e.tick;
    // The timing cue restarts from every counted hit.
    this._lastHitAge = this.age;
    if (Math.abs(interval - c.beatSeconds) > c.tolerance) return;

    const at = e.position;
    const result = this._scope.queryActors({ position: at, radius: c.pulseRadius, relation: 'enemy' });
    if (!result?.ok) return;
    // Fresh array: the event is handed to the combat queue and owns it.
    const ids = [];
    const cap = Math.min(MAX_PULSE_TARGETS, c.maxTargets);
    for (const actor of result.actors) {
      if (ids.length >= cap) break;
      if (actor.alive && !e.targetIds.includes(actor.id)) ids.push(actor.id);
    }
    if (!ids.length) return;
    const sent = this._scope.emit({ type: 'hit', element: 'blood', targetIds: ids, position: at, damage: c.damage, tags: ['pulse-covenant'] });
    if (sent?.ok) this._onPulse(at);
  }

  /** The beat of an accepted pulse, at the hit that completed the rhythm. */
  _onPulse(at) {
    const c = this.config;
    const g = settings.global;
    this._pulseAge = 0;
    this._hasPulse = true;
    this._fxPoint.fromArray(at);
    // The completing hit is also the first of the next pair, so the timing
    // cue keeps running from it (`_lastHitAge` was just set by `_onHit`).
    this.lightBoost = Math.max(this.lightBoost, c.lightPunch * g.lightIntensity);
    if (c.impactShake > 0) this.ctx.shake?.add?.(c.impactShake, 7, 20);
    const flash = c.impactFlash * g.explosionIntensity;
    if (flash > 0) this.ctx.flash?.trigger?.(getColor(c.bloodGlow), flash);
    if (!this._pulseLight) this._pulseLight = this.ctx.lights.acquire();
    this._syncParticles(c);
    expansionBurst(this.fx, this._fxPoint, {
      count: c.dropletCount,
      size: c.dropletSize,
      life: c.dropletLife,
      speed: c.dropletSpeed,
      radius: c.pulseRadius * 0.25
    });
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._pulseAge += dt;
    this._updatePulseLight(dt);
    this._sync(dt);
  }

  onImpact() {
    this._sync(0);
  }

  onFade(dt) {
    this._pulseAge += dt;
    this._updatePulseLight(dt);
    this._sync(dt);
  }

  _updatePulseLight(dt) {
    if (!this._pulseLight) return;
    const life = Math.max(0.05, this.config.pulseLife ?? 0.65);
    if (this._pulseAge >= life) {
      this.ctx.lights.release(this._pulseLight);
      this._pulseLight = null;
      return;
    }
    const strength = 1 - clamp(this._pulseAge / life);
    this._pulseLightPosition.copy(this._fxPoint).setY(1);
    this._pulseLightColor.copy(getColor(this.config.bloodGlow));
    // Same light globals as the cast's main light, so the editor's light
    // sliders reach the second heartbeat too.
    const g = settings.global;
    this.ctx.lights.set(this._pulseLight, this._pulseLightPosition, this._pulseLightColor,
      this.config.lightIntensity * g.lightIntensity * strength,
      this.config.pulseRadius * 1.5 * g.lightRadius, dt);
  }

  _syncParticles(c) {
    if (!this.fx) return;
    const k = this._gradient;
    k[0].copy(getColor(c.dropletColorA));
    k[1].copy(getColor(c.dropletColorB));
    k[2].copy(getColor(c.dropletColorC));
    k[3].copy(getColor(c.dropletColorD));
    this.fx.setGradient(k[0], k[1], k[2], k[3]);
    const u = this.fx.uniforms;
    u.uOpacity.value = settings.global.opacity;
    u.uGravity.value.set(0, -c.dropletGravity, 0);
    if (this.motes) {
      k[0].copy(getColor(c.moteColorA));
      k[1].copy(getColor(c.moteColorB));
      k[2].copy(getColor(c.moteColorC));
      k[3].copy(getColor(c.moteColorD));
      this.motes.setGradient(k[0], k[1], k[2], k[3]);
      const m = this.motes.uniforms;
      m.uOpacity.value = settings.global.opacity;
      if (m.uGlow) m.uGlow.value = settings.global.glow;
      m.uGravity.value.set(0, 0, 0);
    }
  }

  /** Where the heart hangs this frame, world space (its lower lobes). */
  _heartPoint(out, form) {
    const c = this.config;
    return out.copy(this.root.position).setY(this.root.position.y + c.heartHeight - 0.45 * c.heartSize * form);
  }

  /**
   * The bind: the heart's first beat lands. Burst off the heart, a stain
   * slammed into the floor that outlives the covenant, a shockwave, a flash,
   * a shake and a light punch. One frame.
   */
  _bindFx() {
    const c = this.config;
    const g = settings.global;
    const ctx = this.ctx;
    const power = g.explosionIntensity;
    _at.copy(this.root.position).setY(0);
    ctx.decals?.spawn?.(DecalType.SCORCH, _at, {
      radius: c.floorRadius * c.bindDecal,
      life: c.bindDecalLife,
      intensity: 0.85,
      colorA: getColor(c.deepColor),
      colorB: getColor(c.heartColor),
      height: 0.012
    });
    ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _at, {
      radius: c.floorRadius * 1.9,
      life: 0.55,
      width: 0.06,
      intensity: 0.9,
      colorA: getColor(c.bloodGlow),
      colorB: getColor(c.arteryColor)
    });
    this._heartPoint(_heartAt, 1);
    ctx.bursts?.spawn?.(BurstMode.WATER, _heartAt, {
      radius: 0.3,
      endRadius: c.heartSize * 2.2 * power,
      life: 0.45,
      intensity: 1,
      opacity: 0.7,
      colorA: getColor(c.deepColor),
      colorB: getColor(c.arteryColor),
      colorC: getColor(c.bloodGlow),
      squash: 1
    });
    if (c.bindShake > 0) ctx.shake?.add?.(c.bindShake * g.cameraShake, 6, 18);
    const flash = c.bindFlash * power;
    if (flash > 0) ctx.flash?.trigger?.(getColor(c.bloodGlow), flash);
    this.lightBoost = Math.max(this.lightBoost, c.bindLight * g.lightIntensity);
    this._syncParticles(c);
    expansionBurst(this.fx, _heartAt, {
      count: c.bindBurst,
      size: c.dropletSize * 0.55,
      life: c.dropletLife,
      speed: c.dropletSpeed * 1.2,
      spread: 1,
      radius: c.heartSize * 0.5
    });
  }

  /**
   * The threads: vessels the heart throws over an arch to the nearest bodies
   * in `threadRange`. Presentation only — they show who stands inside the
   * covenant's reach. A bolus leaves the heart each beat and splashes on its
   * body when it arrives.
   */
  _syncThreads(dt, phase, form, fade) {
    const c = this.config;
    const count = this._bound ? Math.max(0, Math.min(MAX_THREADS, Math.round(c.threadCount))) : 0;
    const field = this.ctx.dummies;
    let found = 0;
    if (count > 0 && field?.findTargets && this.phase !== AbilityPhase.FADE) {
      field.findTargets(this.root.position.x, this.root.position.z, c.threadRange, this._found);
      found = Math.min(count, this._found.length);
    }
    const growRate = 1 / Math.max(0.05, c.threadGrowTime);
    this._heartPoint(_heartAt, form);
    for (let k = 0; k < MAX_THREADS; k++) {
      const thread = this.threads[k];
      const dummy = k < found ? this._found[k] : null;
      if (dummy && dummy !== thread.dummy) {
        // A new body: the thread is thrown afresh.
        thread.dummy = dummy;
        thread.grow = 0;
      }
      if (dummy) {
        thread.end.copy(dummy.position).setY(1.05);
        thread.grow = Math.min(1, thread.grow + dt * growRate);
      } else {
        thread.dummy = null;
        thread.grow = Math.max(0, thread.grow - dt * growRate * 2.5);
      }
      const grow = Easing.outCubic(thread.grow) * fade;
      thread.mesh.visible = grow > 0.002;
      if (!thread.mesh.visible) continue;
      _thread.a.copy(_heartAt);
      _thread.b.copy(thread.end);
      _thread.c.addVectors(_thread.a, _thread.b).multiplyScalar(0.5);
      _thread.c.y += c.threadArc;
      _thread.grow = grow;
      // Staggered a little per thread so the boluses do not leave as one.
      const flow = phase - 0.08 - k * 0.06;
      _thread.flow = flow - Math.floor(flow);
      _thread.fade = 1;
      thread.material.userData.sync(c, _thread);
      // Arrival: the bolus wraps at the body end — splash it.
      const cycle = Math.floor(flow);
      if (cycle !== thread.cycle) {
        if (thread.grow >= 1 && dt > 0) {
          if (this.fx) expansionBurst(this.fx, thread.end, { count: c.threadSplash, size: c.dropletSize * 0.8, life: 0.55, speed: 1.8, spread: 0.9, radius: 0.15 });
          // The bite: a ring of blood answers on the floor under the body.
          if (c.threadBite > 0) {
            _at.copy(thread.end).setY(0);
            this.ctx.decals?.spawn?.(DecalType.RIPPLE, _at, {
              radius: c.threadBite,
              life: 0.5,
              intensity: 0.9,
              colorA: getColor(c.bloodGlow),
              colorB: getColor(c.arteryColor)
            });
          }
        }
        thread.cycle = cycle;
      }
    }
  }

  /** Blood motes rising off the pool. */
  _syncMotes(dt, spread) {
    const c = this.config;
    const g = settings.global;
    if (!this.motes || dt <= 0 || spread <= 0.05) return;
    const n = Math.min(12, this.moteEmitter.tick(dt, c.moteRate * g.particleCount));
    if (n <= 0) return;
    _at.copy(this.root.position).setY(0.08);
    _emit.position = _at;
    _emit.direction = _up;
    _emit.radius = Math.max(0.1, c.floorRadius * c.poolRadius * spread * 0.85);
    _emit.spread = 0.25;
    _emit.speed = c.moteRise * g.particleSpeed;
    _emit.speedVariance = 0.5;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.moteSize * g.particleSize;
    _emit.sizeVariance = 0.5;
    _emit.life = c.moteLife * g.particleLifetime;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0.5;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.motes.emit(n, _emit);
  }

  /**
   * Beads of blood jumping off the sigil's rim on a heartbeat: a ring of slow
   * droplets thrown up and falling back. Globals are applied the way
   * `expansionBurst` applies them, since the two emissions share the system.
   */
  _breathe(c) {
    if (!this.fx) return;
    const g = settings.global;
    const count = Math.min(24, Math.round(c.beatDrops * g.particleCount));
    if (count <= 0) return;
    _at.copy(this.root.position).setY(0.1);
    _emit.position = _at;
    _emit.direction = _up;
    _emit.radius = Math.max(0.1, c.floorRadius * 0.85);
    _emit.spread = 0.35;
    _emit.speed = c.beatDropSpeed * g.particleSpeed;
    _emit.speedVariance = 0.4;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.beatDropSize * g.particleSize;
    _emit.sizeVariance = 0.4;
    _emit.life = c.beatDropLife * g.particleLifetime;
    _emit.lifeVariance = 0.3;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.fx.emit(count, _emit);
  }

  _sync(dt) {
    const c = this.config;
    const p = this.ctx.character?.position ?? this.origin;
    this.root.position.copy(p);
    this.position.copy(p);
    const beatSeconds = Math.max(0.1, c.beatSeconds);
    const phase = this.age / beatSeconds;
    const beat = heartbeat(phase);
    const fade = this.phase === AbilityPhase.FADE ? 1 - clamp(this.fadeTime / this.fadeDuration) : 1;
    const pulseLife = Math.max(0.05, c.pulseLife ?? 0.65);
    const kick = this._pulseAge < 0.35 ? 1 - this._pulseAge / 0.35 : 0;
    this._syncParticles(c);

    // A new beat: blood beads jump off the sigil.
    const whole = Math.floor(phase);
    if (whole !== this._lastBeat) {
      if (this._lastBeat >= 0 && dt > 0) this._breathe(c);
      this._lastBeat = whole;
    }

    /* ---- the whole covenant recedes together on the exit ---- */
    this.root.scale.setScalar(Math.max(0.001, fade));

    /* ---- 1 · the heart ---- */
    const formTime = Math.max(0.05, c.formTime);
    const form = Easing.outBack(clamp(this.age / formTime));
    // The bind lands on the frame the heart has formed.
    if (!this._bound && this.age >= formTime && this.phase !== AbilityPhase.FADE) {
      this._bound = true;
      if (dt > 0) this._bindFx();
    }
    // Until the bind it swells; after it, it beats.
    const beating = this._bound ? beat : 0;
    this.core.position.y = c.heartHeight;
    this.core.scale.setScalar(Math.max(0.001, c.heartSize * form * (1 + beating * c.heartBeat + kick * 0.25)));
    this.core.rotation.y = Math.sin(this.age * 1.2) * c.heartSway;
    _heart.time = this.age;
    _heart.beat = Math.max(beating, kick);
    _heart.fade = 1;
    _heart.dissolve = clamp(1 - fade);
    this.heartMat.userData.sync(c, _heart);

    /* ---- 2 · arteries, forks, cells ---- */
    const grow = Easing.outCubic(clamp(this.age / Math.max(0.05, c.growTime))) * fade;
    // Derived, not tuned: the authored curves land 1.9 m out and rise to
    // 1.37 m, so the network is scaled to plant its feet on the sigil's rim
    // and to leave from inside the heart's lower lobes whatever the sliders.
    const reach = Math.max(0.05, (c.arteryReach * Math.max(0.1, c.floorRadius)) / 1.9);
    const lift = Math.max(0.2, (c.heartHeight - 0.45 * c.heartSize) / 1.37);
    this.network.scale.set(reach, lift, reach);
    _artery.flow = phase;
    _artery.grow = grow;
    _artery.fade = 1;
    _artery.flare = kick;
    this.veinMat.userData.sync(c, _artery);
    _artery.flow = phase + 0.3;
    _artery.grow = 1;
    this.aortaMat.userData.sync(c, _artery);
    _artery.flow = phase - 0.35;
    _artery.grow = grow;
    this.forkMat.userData.sync(c, _artery);
    for (let i = 0; i < this.branches.length; i++) {
      for (let j = 0; j < CELLS_PER_ARTERY; j++) {
        const progress = (phase + j / CELLS_PER_ARTERY) % 1;
        this.vesselCurves[i].getPoint(progress, beadTransform.position);
        const flare = this._pulseAge < 0.35 ? 1.8 : 1;
        // Cells only show on the part of the vessel that has grown.
        const shown = progress <= grow ? 1 : 0;
        beadTransform.scale.setScalar(shown * c.cellSize * flare * (0.65 + 0.35 * Math.sin(progress * Math.PI)));
        beadTransform.rotation.set(progress * 9 + i, progress * 5, j);
        beadTransform.updateMatrix();
        this.vesselBeads.setMatrixAt(i * CELLS_PER_ARTERY + j, beadTransform.matrix);
      }
    }
    this.vesselBeads.instanceMatrix.needsUpdate = true;
    _cell.fade = fade;
    _cell.flare = kick;
    this.cellMat.userData.sync(c, _cell);

    /* ---- 3 · the pool, the floor, the timing cue and the gate ---- */
    const floorRadius = Math.max(0.1, c.floorRadius);
    const spread = this._bound ? Easing.outCubic(clamp((this.age - formTime) / Math.max(0.05, c.poolSpread))) : 0;
    const poolRadius = Math.max(0.05, floorRadius * c.poolRadius);
    this.pool.scale.set(poolRadius * 2, poolRadius * 2, 1);
    this.pool.visible = spread > 0.001;
    _pool.time = this.age;
    _pool.spread = spread;
    _pool.beat = beating;
    _pool.fade = fade;
    this.poolMat.userData.sync(c, _pool);
    this._syncMotes(dt, spread * fade);
    this.floor.scale.set(floorRadius * 2, floorRadius * 2, 1);
    const gate = clamp(c.gateRadius / floorRadius);
    this.ring.scale.setScalar(Math.max(0.01, c.gateRadius));
    let cue = 0, cueAlpha = 0, window = 0;
    if (this._lastHitAge >= 0) {
      const since = this.age - this._lastHitAge;
      cue = since / beatSeconds;
      window = Math.abs(since - c.beatSeconds) <= c.tolerance ? 1 : 0;
      // Fades once the window has passed without a second hit.
      cueAlpha = 1 - clamp((since - (c.beatSeconds + c.tolerance)) / 0.25);
    }
    _floor.time = this.age;
    _floor.beat = beat;
    _floor.pulse = this._hasPulse && this._pulseAge < pulseLife ? clamp(this._pulseAge / pulseLife) : 0;
    _floor.fade = fade;
    _floor.cue = cue;
    _floor.cueAlpha = cueAlpha;
    _floor.window = window;
    _floor.gate = gate;
    this.membrane.userData.sync(c, _floor);
    _gate.sweep = phase;
    _gate.window = window;
    _gate.beat = beat;
    _gate.fade = fade;
    this.gateMat.userData.sync(c, _gate);

    /* ---- 4b · the beat wave: the covenant's reach, once per beat ---- */
    const waving = this._bound && this.phase !== AbilityPhase.FADE;
    const waveP = phase - Math.floor(phase);
    this.beatWave.visible = waving && c.waveGlow > 0;
    this.beatWarp.visible = waving && c.waveWarp > 0;
    if (waving) {
      const r0 = floorRadius * 0.55;
      const eased = Easing.outCubic(waveP);
      const radius = Math.max(0.05, r0 + (Math.max(r0, c.waveReach) - r0) * eased);
      this.beatWave.position.copy(this.root.position).setY(0.09);
      this.beatWave.scale.setScalar(radius);
      _wave.progress = eased;
      _wave.alpha = Math.pow(1 - waveP, 1.3) * fade;
      _wave.glow = c.waveGlow;
      _wave.width = c.waveWidth;
      this.waveMat.userData.sync(c, _wave);
      this.beatWarp.position.copy(this.root.position);
      _warp.radius = Math.max(r0, c.waveReach);
      _warp.progress = eased;
      _warp.strength = c.waveWarp;
      this.beatWarpMat.userData.sync(c, _warp);
      _warp.strength = undefined;
    }
    this._syncThreads(dt, phase, form, fade);

    /* ---- 4 · the pulse ---- */
    this.pulseWave.visible = this._pulseAge < pulseLife && this._hasPulse;
    this.pulseWarp.visible = this.pulseWave.visible;
    if (this.pulseWave.visible) {
      const progress = clamp(this._pulseAge / pulseLife);
      this.pulseWave.position.copy(this._fxPoint);
      this.pulseWave.position.y = 0.1;
      this.pulseWave.scale.setScalar(Math.max(0.01, c.pulseRadius * Easing.outCubic(progress)));
      _ring.progress = progress;
      _ring.alpha = (1 - progress) * fade;
      this.waveMaterial.userData.sync(c, _ring);
      this.pulseWarp.position.copy(this._fxPoint);
      _warp.radius = c.pulseRadius;
      _warp.progress = progress;
      this.warpMat.userData.sync(c, _warp);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    if (this._pulseLight) this.ctx.lights.release(this._pulseLight);
    this._pulseLight = null;
    this._unsub?.();
    this._unsub = null;
    this._scope = null;
    this.root.visible = false;
    this.pulseWave.visible = false;
    this.pulseWarp.visible = false;
    this.beatWave.visible = false;
    this.beatWarp.visible = false;
    for (const thread of this.threads) {
      thread.mesh.visible = false;
      thread.dummy = null;
      thread.grow = 0;
    }
    this._hasPulse = false;
    this._seen.clear();
    this._seenOrder.length = 0;
    this._casts.clear();
    this._castOrder.length = 0;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.onDestroy();
    for (const r of this.resources) r.dispose();
    super.dispose();
  }
}

/* -------------------------------------------------------------------- */
/* Editor                                                               */
/* -------------------------------------------------------------------- */

/**
 * The production `Editor` helpers when they are handed in, plain lil-gui calls
 * when they are not (the candidate harnesses pass a bare folder).
 */
function editorKit(c, Editor) {
  const named = (controller, label) => (label && typeof controller?.name === 'function' ? controller.name(label) : controller);
  const sub = (folder, title) => (typeof folder.addFolder === 'function' ? folder.addFolder(title) : folder);
  const range = (folder, key, min, max, step, label) =>
    Editor?.range ? Editor.range(folder, c, key, min, max, step, label) : named(folder.add(c, key, min, max, step), label);
  const color = (folder, key, label) => named(folder.addColor(c, key), label);
  const gradient = (folder, prefix, title) => {
    if (Editor?.gradient && typeof folder.addFolder === 'function') return Editor.gradient(folder, c, prefix, title);
    const group = sub(folder, title);
    color(group, `${prefix}A`, 'birth');
    color(group, `${prefix}B`, 'early');
    color(group, `${prefix}C`, 'late');
    color(group, `${prefix}D`, 'death');
    return group;
  };
  const cast = (folder) => (Editor?.castAnimation ? Editor.castAnimation(folder, c) : named(folder.add(c, 'castAnim', CAST_ANIMATIONS), 'cast animation'));
  return { sub, range, color, gradient, cast, named };
}

export function buildEditor(gui, c, Editor) {
  const { sub, range: R, color, gradient, cast: castAnimation, named } = editorKit(c, Editor);
  const f = gui.addFolder('♥  Pulse Covenant');

  const cast = sub(f, 'The cast');
  // A self cast by design; shown so the anchoring is visible, not a free choice.
  named(cast.add(c, 'aimStyle', ['self']), 'aim (anchored on caster)');
  R(cast, 'range', 1, 48, 0.1, 'reticle range');
  R(cast, 'minRange', 0, 20, 0.1, 'min range');
  R(cast, 'speed', 1, 200, 1, 'bind speed (m/s)');
  R(cast, 'zoneRadius', 0.5, 8, 0.1, 'reticle radius (m)');
  R(cast, 'cooldown', 0, 30, 0.1, 'cooldown');
  R(cast, 'life', 1, 20, 0.5, 'covenant duration');
  R(cast, 'lifetime', 1, 20, 0.5, 'catalog lifetime (mirror)');
  R(cast, 'fade', 0.05, 3, 0.05, 'withdraws over');
  castAnimation(cast);

  const rhythm = sub(f, 'The rhythm (gameplay)');
  R(rhythm, 'beatSeconds', 0.2, 1.5, 0.05, 'beat (s)');
  R(rhythm, 'tolerance', 0.03, 0.3, 0.01, 'timing window');
  R(rhythm, 'pulseRadius', 1, 8, 0.1, 'pulse radius');
  R(rhythm, 'damage', 0, 2, 0.05, 'pulse damage');
  R(rhythm, 'maxTargets', 1, 8, 1, 'secondary targets');

  const light = sub(f, 'Light & beat');
  color(light, 'lightColor', 'light');
  R(light, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, 'lightPunch', 0, 20, 0.1, 'punch per pulse');
  R(light, 'bindLight', 0, 30, 0.1, 'punch at the bind');
  R(light, 'lightThrob', 0, 1, 0.01, 'heartbeat throb');
  R(light, 'impactShake', 0, 1, 0.01, 'impact shake');
  R(light, 'impactFlash', 0, 1, 0.01, 'impact flash');

  const palette = sub(f, 'Palette (core → tint → body → deep)');
  color(palette, 'coreColor', 'core (white-hot)');
  color(palette, 'bloodGlow', 'tint (living blood)');
  color(palette, 'arteryColor', 'body (vessels)');
  color(palette, 'heartColor', 'muscle');
  color(palette, 'deepColor', 'deep (clot)');

  const heart = sub(f, '1 · The heart');
  R(heart, 'heartSize', 0.1, 1.5, 0.01, 'size');
  R(heart, 'heartHeight', 0.5, 3, 0.05, 'height (m)');
  R(heart, 'formTime', 0.05, 2, 0.05, 'forms over');
  R(heart, 'heartBeat', 0, 0.6, 0.01, 'beat swell');
  R(heart, 'heartSquash', 0, 0.5, 0.01, 'contraction');
  R(heart, 'heartSway', 0, 0.6, 0.01, 'sway (rad)');
  R(heart, 'heartGlow', 0, 6, 0.05, 'glow');
  R(heart, 'heartFresnel', 0, 6, 0.05, 'wet rim');
  R(heart, 'heartVeins', 0, 2, 0.05, 'veins');

  const arteries = sub(f, '2 · The arteries');
  R(arteries, 'growTime', 0.05, 2, 0.05, 'grow out over');
  R(arteries, 'arteryReach', 0.3, 2, 0.05, 'reach');
  R(arteries, 'arteryGlow', 0, 6, 0.05, 'bolus glow');
  R(arteries, 'arterySwell', 0, 3, 0.05, 'wall swell');
  R(arteries, 'cellSize', 0, 3, 0.05, 'cell size');
  R(arteries, 'cellGlow', 0, 6, 0.05, 'cell glow');

  const floor = sub(f, '3 · The covenant floor');
  R(floor, 'floorRadius', 0.5, 4, 0.05, 'sigil radius (m)');
  R(floor, 'floorGlow', 0, 6, 0.05, 'sigil glow');
  R(floor, 'floorVeins', 0, 2, 0.05, 'capillaries');
  R(floor, 'gateRadius', 0.2, 3, 0.05, 'gate radius (m)');
  R(floor, 'cueGlow', 0, 6, 0.05, 'timing cue glow');
  const pool = sub(floor, 'Blood pool');
  R(pool, 'poolRadius', 0.1, 1.5, 0.01, 'radius (× sigil)');
  R(pool, 'poolSpread', 0.05, 3, 0.05, 'runs out over (s)');
  R(pool, 'poolOpacity', 0, 1, 0.01, 'opacity');
  R(pool, 'poolSheen', 0, 4, 0.05, 'wet sheen');
  R(pool, 'poolRipple', 0, 3, 0.05, 'beat ripples');
  const bind = sub(floor, 'The bind');
  R(bind, 'bindDecal', 0, 3, 0.05, 'stain radius (× sigil)');
  R(bind, 'bindDecalLife', 0.5, 30, 0.5, 'stain stays (s)');
  R(bind, 'bindShake', 0, 1, 0.01, 'shake');
  R(bind, 'bindFlash', 0, 1, 0.01, 'flash');
  R(bind, 'bindBurst', 0, 128, 1, 'droplets');

  const reach = sub(f, '3b · Beat waves & threads');
  R(reach, 'waveReach', 1, 20, 0.1, 'wave reach (m)');
  R(reach, 'waveGlow', 0, 6, 0.05, 'wave glow');
  R(reach, 'waveWidth', 0.02, 0.8, 0.01, 'wave band');
  R(reach, 'waveWarp', 0, 2, 0.01, 'wave warp');
  R(reach, 'threadCount', 0, MAX_THREADS, 1, 'threads');
  R(reach, 'threadRange', 1, 24, 0.1, 'thread reach (m)');
  R(reach, 'threadGrowTime', 0.05, 2, 0.01, 'thrown over (s)');
  R(reach, 'threadRadius', 0.01, 0.3, 0.005, 'thickness (m)');
  R(reach, 'threadArc', 0, 5, 0.05, 'arch (m)');
  R(reach, 'threadGlow', 0, 6, 0.05, 'bolus glow');
  R(reach, 'threadSplash', 0, 24, 1, 'splash per bolus');
  R(reach, 'threadBite', 0, 3, 0.05, 'bite ring (m)');

  const pulse = sub(f, '4 · The pulse');
  R(pulse, 'pulseLife', 0.1, 2, 0.05, 'crosses over');
  R(pulse, 'pulseWidth', 0.05, 0.8, 0.01, 'ring band');
  R(pulse, 'pulseGlow', 0, 6, 0.05, 'ring glow');
  R(pulse, 'warpStrength', 0, 3, 0.01, 'warp strength');

  const particles = sub(f, '5 · Particles');
  const drops = sub(particles, 'Droplets');
  R(drops, 'dropletCount', 0, 128, 1, 'per pulse');
  R(drops, 'dropletSize', 0.02, 0.5, 0.01, 'size');
  R(drops, 'dropletLife', 0.1, 3, 0.05, 'lifetime');
  R(drops, 'dropletSpeed', 0, 10, 0.1, 'speed');
  gradient(drops, 'dropletColor', 'Droplet colour');
  R(drops, 'dropletGravity', 0, 20, 0.1, 'gravity');
  const beads = sub(particles, 'Heartbeat beads');
  R(beads, 'beatDrops', 0, 24, 1, 'per heartbeat');
  R(beads, 'beatDropSize', 0.01, 0.3, 0.005, 'size');
  R(beads, 'beatDropSpeed', 0, 6, 0.05, 'jump speed');
  R(beads, 'beatDropLife', 0.1, 2, 0.05, 'lifetime');
  const motes = sub(particles, 'Pool motes');
  R(motes, 'moteRate', 0, 120, 1, 'per second');
  R(motes, 'moteSize', 0.01, 0.5, 0.005, 'size');
  R(motes, 'moteLife', 0.1, 4, 0.05, 'lifetime');
  R(motes, 'moteRise', 0, 4, 0.05, 'rise (m/s)');
  gradient(motes, 'moteColor', 'Mote colour');

  return f;
}
