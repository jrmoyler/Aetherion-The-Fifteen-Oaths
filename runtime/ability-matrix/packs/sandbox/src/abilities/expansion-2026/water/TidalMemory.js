import { Mesh, Points, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../../Ability.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { getColor } from '../../../utils/color.js';
import { saturate, Easing } from '../../../utils/math.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import {
  createRibbonGeometry,
  createRippleGeometry,
  createSprayGeometry,
  createWarpQuad,
  createWaveGeometry
} from './TidalMemoryGeometry.js';
import {
  createCrestMaterial,
  createSprayMaterial,
  createTideWarpMaterial,
  createTurnMaterial,
  createWakeMaterial,
  createWaveMaterial
} from './TidalMemoryMaterial.js';

export const ID = 'tidal-memory';
export const UID = 'matrix-expansion/tidal-memory';

/**
 * Tidal Memory — water, line cast.
 *
 * Data block: presentation (`meta`) and the live settings the ability and its
 * editor folder read. The gameplay keys (`width`, `returnDuration`,
 * `impulse`, `lift`, `range`, `speed`) keep their original meaning; every
 * other number is look, resolved per frame.
 */
export const CONFIG = Object.freeze({
  id: ID,
  meta: {
    label: 'Tidal Memory',
    accent: '#53c6ff',
    element: 'water',
    key: '',
    cast: 'line',
    hint: 'A wave records its course, then retraces it back to the caster.',
    glyph: '<path d="M8 50Q25 20 40 50T72 50T92 50"/><path d="M70 65L54 80L70 90"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 20, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 12, // how fast the wave runs out, metres/second
    lifetime: 1.2, // seconds the spent wave takes to sink once it is home
    cooldown: 4, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#64caff',
    lightIntensity: 5, // the wave's steady glow
    lightRadius: 8,
    turnLight: 6, // light punch when it turns
    arrivalLight: 3, // light punch when it comes home

    /* ================================================================ */
    /* 1 · THE WAVE                                                      */
    /* ================================================================ */
    width: 1.6, // metres, half-width — also the sweep's reach (gameplay)
    height: 1.3, // metres, crest height
    waveBack: 1.6, // metres, length of the back slope behind the crest
    waveCurl: 0.6, // how far the lip curls (× crest height)
    waveRoll: 0.1, // metres the crest rolls laterally
    waveRollSpeed: 4, // roll speed
    waveWander: 0.08, // metres the crest wanders with noise
    waveOpacity: 0.8,
    waveFresnel: 2.5, // silhouette power
    waveFoam: 0.7, // 0..1 foam on the crest and lip
    waveFoamScale: 3, // foam noise scale
    waveCaustic: 0.5, // caustic shimmer on the face
    waveGlint: 1.2, // sun glint
    waveSoftFade: 0.4, // metres of soft intersection with the scene
    colorDeep: '#053056',
    colorShallow: '#2fb8e6',
    colorFoam: '#e8fbff',
    colorGlint: '#ffffff',

    /* crest foam bands riding and lagging the crest */
    crestColor: '#a6f3ff',
    crestWidth: 0.14, // metres
    crestOpacity: 0.75,

    /* spray points thrown off the lip */
    sprayRate: 0.7, // cycles per second
    spraySize: 1, // point size
    sprayOpacity: 1,
    colorSpray: '#8ce6ff',

    /* ================================================================ */
    /* 2 · THE RETURN (gameplay)                                         */
    /* ================================================================ */
    returnDuration: 1.2, // seconds the retrace takes
    impulse: 4, // push on each body the wave sweeps
    lift: 2, // upward kick on each body the wave sweeps

    /* ================================================================ */
    /* 3 · THE TURN                                                      */
    /* ================================================================ */
    turnRadius: 2.4, // metres the turn ripple spreads
    turnDuration: 0.45, // seconds it takes
    turnFlash: 0.06,
    turnShake: 0.06,
    turnRings: 3, // concentric crests in the ripple
    colorTurn: '#33ccff',
    colorTurnFoam: '#dff9ff',
    turnBurst: 1.8, // metres, the splash dome where it turns
    turnBurstIntensity: 0.8,
    colorBurstA: '#e9fbff',
    colorBurstB: '#5fd0ff',
    colorBurstC: '#0d5f99',

    /* ================================================================ */
    /* 4 · THE WAKE — the memory on the floor                            */
    /* ================================================================ */
    wakeWidth: 0.35, // metres, half-width
    wakeWobble: 0.15, // metres the width breathes along the course
    wakeOpacity: 1,
    wakeLace: 0.6, // foam lace strength
    wakeMemory: 0.25, // what is left once the return has retraced it
    colorWake: '#1490d8',
    colorWakeMemory: '#8fe6ff',

    /* ================================================================ */
    /* 5 · DROPLETS — spray off the lip                                  */
    /* ================================================================ */
    dropletRate: 60, // per second while moving
    dropletSize: 0.07,
    dropletSpeed: 3.5,
    dropletLife: 0.7,
    dropletGravity: -9,
    colorDropletA: '#f2fdff',
    colorDropletB: '#9fe8ff',
    colorDropletC: '#3aa6dc',
    colorDropletD: '#0d4d7a',

    /* ================================================================ */
    /* 6 · MIST — sea haze off the crest                                 */
    /* ================================================================ */
    mistRate: 18,
    mistSize: 0.6,
    mistLife: 1.4,
    mistOpacity: 0.3,
    colorMistA: '#d9f6ff',
    colorMistB: '#9cd8f0',
    colorMistC: '#5aa2c4',
    colorMistD: '#2a5f7c',

    /* ================================================================ */
    /* 7 · FOAM — bubbles left at the wave's foot                        */
    /* ================================================================ */
    bubbleRate: 40,
    bubbleSize: 0.06,
    bubbleLife: 0.6,
    colorBubbleA: '#ffffff',
    colorBubbleB: '#cdf4ff',
    colorBubbleC: '#7fd2f2',
    colorBubbleD: '#2e88b8',

    /* ================================================================ */
    /* 8 · GROUND — foam laid along the course, ripples at the ends      */
    /* ================================================================ */
    foamInterval: 1.5, // metres between foam patches the wave leaves
    foamRadius: 1.1,
    foamLife: 2.2,
    rippleRadius: 1.4, // metres, the launch and arrival ripples
    rippleLife: 1.1,
    colorFoamA: '#c6f5ff',
    colorFoamB: '#1f6f9e',

    /* ================================================================ */
    /* 9 · ARRIVAL & DISTORTION                                          */
    /* ================================================================ */
    arrivalSplash: 24, // droplets thrown when it comes home
    travelRumble: 0.04, // camera rumble while the wave runs
    warpStrength: 0.5,
    warpScale: 1.4,
    warpSpeed: 1.2
  }
});

/** Samples along the recorded course — the tests and the foam bands rely on 80. */
const N = 80;
/** Fixed capacity of foam patches one cast lays along its course. */
const MAX_FOAM_PATCHES = 32;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _facing = new Vector3();
const UP = new Vector3(0, 1, 0);

/**
 * TIDAL MEMORY — a wave that records its course, then retraces it home.
 *
 * Going out, the wave runs the cast line along a wandering curve sampled once
 * at spawn (`samples`, the memory). At the end it turns. Coming back it runs
 * the *same* curve in reverse over `returnDuration`, sweeping anything in its
 * width a second time — the other way, along the recorded tangent. Each pass
 * strikes a body at most once.
 *
 * Layers, each a folder in the editor:
 *
 *   1. **the wave** — a breaking wave in parameter space: back slope, crest,
 *      a lip curling forward and under, tapered at its lateral ends, rolling
 *      and wandering. Shaded as water: deep foot, lit-through crest, fresnel,
 *      caustic shimmer, crest foam streaming down the back, sun glint. It
 *      *faces home* on the return, and sinks into the floor at the end.
 *   2. **crest foam** — two bands riding the crest, lagging it in whichever
 *      direction it travels, torn into gaps by noise.
 *   3. **spray** — the lip's own point spray, plus DROPLETs from the shared
 *      engine thrown forward off the lip.
 *   4. **mist** — soft sea haze shed behind the crest.
 *   5. **foam** — BUBBLEs left on the floor at the wave's foot.
 *   6. **the wake** — the memory itself on the floor: revealed only where the
 *      wave has been, a bright memory line down its middle, ripples and lace,
 *      dimmed to a residue where the return has already retraced it. FOAM
 *      patches are laid along the course as the wave passes.
 *   7. **the turn** — concentric ripple crests spreading at the endpoint, a
 *      WATER splash dome, RIPPLE + FOAM decals, a knock, flash and punch of
 *      light, all scaled by the globals.
 *   8. **arrival** — when the retrace reaches the caster the wave throws its
 *      last spray, leaves a ripple and foam, and sinks: a graceful exit.
 *   9. **distortion** — refraction riding behind the crest on
 *      LAYER.DISTORTION.
 *
 * ## Rules
 *
 * The path is sampled once per cast and never rewritten (the memory). The
 * crest roll is integrated, so dragging its speed never snaps the wave. The
 * sweep — query, curve-relative test, per-pass dedupe, tangent push, body
 * shove — is the original, unchanged. No allocation per frame.
 */
export class TidalMemoryAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get impactDuration() {
    return Math.max(0.1, this.config.returnDuration);
  }

  /** Purely visual sink, so it honours the global lifetime multiplier. */
  get fadeDuration() {
    return Math.max(0.1, this.config.lifetime * settings.global.lifetime);
  }

  /** Bodies struck so far, both passes. HUD readout only. */
  get instanceCount() {
    return this.hitOut.size + this.hitBack.size;
  }

  /** Water glints, it does not gutter. */
  lightShimmer() {
    return 0.88 + 0.12 * Math.sin(this.age * 6.1) * Math.sin(this.age * 2.3 + 0.7);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the wave ---- */
    this.geo = createWaveGeometry(N);
    this.mat = createWaveMaterial();
    this.wave = new Mesh(this.geo, this.mat);
    this.wave.frustumCulled = false;
    this.wave.layers.set(LAYER.VFX);
    this.wave.renderOrder = 2;
    this.group.add(this.wave);

    /* ---- layer 6: the wake ---- */
    this.wakeGeo = createRibbonGeometry(N);
    this.wakeMat = createWakeMaterial();
    this.wake = new Mesh(this.wakeGeo, this.wakeMat);
    this.wake.frustumCulled = false;
    this.wake.layers.set(LAYER.VFX);
    this.wake.renderOrder = -1;
    this.group.add(this.wake);

    /* ---- layer 2: crest foam ---- */
    // Two independently shaped foam bands ride the wave's crest and lag
    // behind it. Their direction reverses when the recorded wave returns.
    this.crestMaterial = createCrestMaterial();
    this.crestBands = [];
    for (let i = 0; i < 2; i++) {
      const band = new Mesh(createRibbonGeometry(N), this.crestMaterial);
      band.layers.set(LAYER.VFX);
      band.frustumCulled = false;
      band.renderOrder = 3;
      this.group.add(band);
      this.crestBands.push(band);
    }

    /* ---- layer 7: the turn ripple ---- */
    this.turnGeometry = createRippleGeometry();
    this.turnMaterial = createTurnMaterial();
    this.turnRing = new Mesh(this.turnGeometry, this.turnMaterial);
    this.turnRing.layers.set(LAYER.VFX);
    this.turnRing.rotation.x = -Math.PI / 2;
    this.turnRing.visible = false;
    this.group.add(this.turnRing);

    /* ---- layer 9: refraction ---- */
    this.warpGeometry = createWarpQuad();
    this.warpMaterial = createTideWarpMaterial();
    this.warp = new Mesh(this.warpGeometry, this.warpMaterial);
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.group.add(this.warp);

    /* ---- per-cast state, allocated once ---- */
    this.samples = new Float32Array((N + 1) * 2);
    this.hitOut = new Set();
    this.hitBack = new Set();
    this.found = [];
    this.tmp = new Vector3();
    this.frontPoint = new Vector3();
    this.wakePoint = new Vector3();
    this.bodyPoint = new Vector3();
    this.backDistance = 0;
    this.prev = 0;
    this.coverage = 0;
    this.returning = false;

    this._seed = 0;
    this._rollPhase = 0;
    this._foamLaid = 0;
    this._nextFoam = 0;
    this._landed = false;
    this._reduced = false;
    this._waveState = {
      front: this.frontPoint,
      facing: _facing,
      side: this.side,
      height: 1,
      rollPhase: 0,
      fade: 1,
      seed: 0
    };
    this._warpState = { width: 1, height: 1, strength: 0, seed: 0 };
  }

  createParticles() {
    /* ---- layer 3: the lip's own point spray ---- */
    this.sprayGeometry = createSprayGeometry(112);
    this.sprayMaterial = createSprayMaterial();
    this.spray = new Points(this.sprayGeometry, this.sprayMaterial);
    this.spray.layers.set(LAYER.VFX);
    this.spray.frustumCulled = false;
    this.group.add(this.spray);

    /* ---- layers 3–5: the shared engine ---- */
    const particles = this.ctx.particles;
    this.dropletSystem =
      particles?.get?.(`${ID}.droplets`, {
        capacity: 900,
        shape: ParticleShape.DROPLET,
        additive: false,
        lit: true,
        softFade: 0.3
      }) ?? null;
    this.mistSystem =
      particles?.get?.(`${ID}.mist`, {
        capacity: 400,
        shape: ParticleShape.SMOKE,
        additive: false,
        curl: true,
        softFade: 1
      }) ?? null;
    this.bubbleSystem =
      particles?.get?.(`${ID}.bubbles`, {
        capacity: 600,
        shape: ParticleShape.BUBBLE,
        additive: false,
        softFade: 0.2
      }) ?? null;
    if (this.dropletSystem) {
      const u = this.dropletSystem.uniforms;
      u.uSizeIn.value = 0.05;
      u.uFadeIn.value = 0.05;
      u.uFadeOut.value = 0.4;
      u.uEndSize.value = 0.6;
      u.uDrag.value = 0.4;
    }
    if (this.mistSystem) {
      const u = this.mistSystem.uniforms;
      u.uSizeIn.value = 0.2;
      u.uFadeIn.value = 0.2;
      u.uFadeOut.value = 0.55;
      u.uEndSize.value = 2;
      u.uDrag.value = 1.5;
    }
    if (this.bubbleSystem) {
      const u = this.bubbleSystem.uniforms;
      u.uSizeIn.value = 0.1;
      u.uFadeIn.value = 0.1;
      u.uFadeOut.value = 0.3;
      u.uEndSize.value = 1.2;
      u.uDrag.value = 3;
    }
    this.dropletEmitter = new RateEmitter();
    this.mistEmitter = new RateEmitter();
    this.bubbleEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = this.config;
    this.hitOut.clear();
    this.hitBack.clear();
    this.turnRing.visible = false;
    this.prev = 0;
    this.backDistance = this.length;
    this.coverage = 0;
    this.returning = false;
    this.wakeMat.uniforms.uDirection.value = 1;
    this.wakeMat.uniforms.uCoverage.value = 0;
    this.wakeMat.uniforms.uErase.value = 1;
    this.wakeMat.uniforms.uFade.value = 1;
    this.mat.uniforms.uFade.value = 1;
    this.sprayMaterial.uniforms.uFade.value = 1;
    this.sprayMaterial.uniforms.uWidth.value = c.width;
    this.sprayMaterial.uniforms.uHeight.value = c.height;
    this.crestMaterial.uniforms.uFade.value = 1;
    // The memory: one wandering course, sampled once, retraced exactly.
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      this.samples[i * 2] = Math.sin(u * 8.1) * 0.24 + Math.sin(u * 19.7) * 0.07;
      this.samples[i * 2 + 1] = 0.14 * Math.sin(u * 12.3);
    }

    this._seed = Math.random() * 100;
    this._rollPhase = 0;
    this._foamLaid = 0;
    this._nextFoam = Math.max(0.2, c.foamInterval) * 0.5;
    this._landed = false;
    // Read once per cast: matchMedia allocates, and the answer never changes mid-cast.
    this._reduced = prefersReducedMotion();
    this.dropletEmitter.reset();
    this.mistEmitter.reset();
    this.bubbleEmitter.reset();
    this.wave.visible = true;
    this.wake.visible = true;
    this.spray.visible = true;
    this.warp.visible = true;
    for (const band of this.crestBands) band.visible = true;

    // Anticipation: the water gathers at the caster's feet before it runs.
    _pos.copy(this.origin);
    this.ctx.decals?.spawn?.(DecalType.RIPPLE, _pos, {
      radius: c.rippleRadius,
      life: c.rippleLife,
      intensity: 0.8,
      colorA: getColor(c.colorFoamA),
      colorB: getColor(c.colorFoamB)
    });
    this._draw(0, 0);
  }

  /* ------------------------------------------------------------------ */
  /* The course (gameplay — unchanged)                                   */
  /* ------------------------------------------------------------------ */

  _path(d) {
    const u = Math.max(0, Math.min(1, d / this.length)) * N;
    const i = Math.min(N - 1, Math.floor(u));
    const f = u - i;
    return this.samples[i * 2] * (1 - f) + this.samples[(i + 1) * 2] * f;
  }

  _point(d, out) {
    return out.copy(this.origin).addScaledVector(this.direction, d).addScaledVector(this.side, this._path(d));
  }

  _sweep(a, b, seen) {
    if (!this.ctx.dummies?.findTargets) return;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    this._point((lo + hi) / 2, this.tmp);
    const field = this.ctx.dummies;
    const query = b < a && field.findBodies ? field.findBodies : field.findTargets;
    const found = query.call(field, this.tmp.x, this.tmp.z, Math.hypot((hi - lo) / 2, this.config.width + 1), this.found);
    for (const d of found) {
      if (seen.has(d)) continue;
      const at = d.alive === false ? (d.bodyPoint?.(this.bodyPoint) ?? d.position) : d.position;
      const x = at.x - this.origin.x;
      const z = at.z - this.origin.z;
      const along = x * this.direction.x + z * this.direction.z;
      const side = x * this.side.x + z * this.side.z - this._path(along);
      if (along < lo - 0.3 || along > hi + 0.3 || Math.abs(side) > this.config.width) continue;
      seen.add(d);
      const sign = b >= a ? 1 : -1;
      // Follow the sampled curve rather than pushing every target along the
      // original straight aim line. The return pass reverses the tangent.
      const before = Math.max(0, Math.min(this.length, along - 0.01));
      const after = Math.max(0, Math.min(this.length, along + 0.01));
      const slope = after > before ? (this._path(after) - this._path(before)) / (after - before) : 0;
      let pushX = this.direction.x + this.side.x * slope;
      let pushZ = this.direction.z + this.side.z * slope;
      const magnitude = Math.hypot(pushX, pushZ) || 1;
      pushX = (pushX / magnitude) * sign;
      pushZ = (pushZ / magnitude) * sign;
      if (d.alive === false) d.shove?.(pushX * this.config.impulse, this.config.lift, pushZ * this.config.impulse);
      else d.kill?.(pushX, pushZ, { impulse: this.config.impulse, lift: this.config.lift, spin: 0.5 }, false);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const front = Math.min(this.length, this.front);
    this.coverage = front / this.length;
    this._sweep(this.prev, front, this.hitOut);
    this.prev = front;
    this._layFoam(front);
    this.ctx.shake?.rumble?.(this.config.travelRumble, dt);
    this._draw(front, dt);
  }

  onImpact() {
    const c = this.config;
    const g = settings.global;
    this.backDistance = this.length;
    this.returning = true;
    this.wakeMat.uniforms.uDirection.value = -1;
    this.turnRing.position.copy(this.frontPoint);
    this.turnRing.position.y = 0.06;
    this.turnRing.scale.setScalar(0.2);
    this.turnRing.visible = true;
    this.turnMaterial.uniforms.uFade.value = 1;

    /* the turn: a splash dome, ripple and foam, droplets thrown up */
    _pos.copy(this.frontPoint).setY(c.height * 0.4);
    this.ctx.bursts?.spawn?.(BurstMode.WATER, _pos, {
      radius: 0.3,
      endRadius: c.turnBurst * g.explosionIntensity,
      life: 0.6,
      intensity: c.turnBurstIntensity,
      opacity: 0.55,
      squash: 0.55,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    _pos.y = 0;
    this.ctx.decals?.spawn?.(DecalType.RIPPLE, _pos, {
      radius: c.turnRadius,
      life: c.rippleLife,
      intensity: 1,
      colorA: getColor(c.colorFoamA),
      colorB: getColor(c.colorFoamB)
    });
    this.ctx.decals?.spawn?.(DecalType.FOAM, _pos, {
      radius: c.foamRadius * 1.4,
      life: c.foamLife,
      intensity: 1,
      colorA: getColor(c.colorFoamA),
      colorB: getColor(c.colorFoamB)
    });
    _pos.y = c.height * 0.8;
    this._droplets(_pos, UP, c.arrivalSplash, 1.3, c.width * 0.6);
    this.lightBoost = c.turnLight * g.explosionIntensity;

    this.ctx.shake?.add?.(c.turnShake * g.cameraShake, 5, 18);
    this.ctx.flash?.trigger?.(this.lightColor.copy(getColor(c.lightColor)), c.turnFlash * g.explosionIntensity);
  }

  onFade(dt, t) {
    const c = this.config;
    if (t <= 1) {
      const turn = Math.min(1, (t * this.impactDuration) / Math.max(0.05, c.turnDuration));
      this.turnRing.scale.setScalar(0.2 + turn * c.turnRadius);
      this.turnMaterial.uniforms.uFade.value = (1 - turn) * (1 - turn);
      this.turnMaterial.uniforms.uTime.value = this.age;
      this.turnRing.visible = turn < 1;
      const next = this.length * (1 - t);
      this._sweep(this.backDistance, next, this.hitBack);
      this.backDistance = next;
      this.wakeMat.uniforms.uErase.value = next / this.length;
      if (t >= 1 && !this._landed) this._arrive();
      this._draw(next, dt);
    } else {
      // Home: the spent wave sinks into the floor rather than fading flat.
      this.turnRing.visible = false;
      this._draw(0, dt, 2 - t);
    }
  }

  /** The wave reaches the caster: last spray, a ripple and foam, a soft punch. */
  _arrive() {
    const c = this.config;
    this._landed = true;
    _pos.copy(this.frontPoint).setY(0);
    this.ctx.decals?.spawn?.(DecalType.RIPPLE, _pos, {
      radius: c.rippleRadius,
      life: c.rippleLife,
      intensity: 0.8,
      colorA: getColor(c.colorFoamA),
      colorB: getColor(c.colorFoamB)
    });
    this.ctx.decals?.spawn?.(DecalType.FOAM, _pos, {
      radius: c.foamRadius,
      life: c.foamLife,
      intensity: 0.8,
      colorA: getColor(c.colorFoamA),
      colorB: getColor(c.colorFoamB)
    });
    _pos.y = c.height * 0.6;
    this._droplets(_pos, UP, c.arrivalSplash, 0.9, c.width * 0.5);
    this.lightBoost = Math.max(this.lightBoost, c.arrivalLight * settings.global.explosionIntensity);
  }

  /** FOAM patches laid along the course as the wave passes, bounded per cast. */
  _layFoam(front) {
    const c = this.config;
    const step = Math.max(0.2, c.foamInterval);
    while (this._nextFoam <= front && this._foamLaid < MAX_FOAM_PATCHES) {
      this._point(this._nextFoam, _pos);
      this.ctx.decals?.spawn?.(DecalType.FOAM, _pos, {
        radius: c.foamRadius,
        life: c.foamLife,
        intensity: 0.7,
        colorA: getColor(c.colorFoamA),
        colorB: getColor(c.colorFoamB)
      });
      this._foamLaid++;
      this._nextFoam += step;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Drawing                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * @param {number} d     metres along the course the crest is at
   * @param {number} dt
   * @param {number} [sink] 1 → 0 through the final fade
   */
  _draw(d, dt, sink = 1) {
    const c = this.config;
    const g = settings.global;
    this._point(d, this.frontPoint);
    this.tmp.copy(this.frontPoint);
    if (!this._reduced) this._rollPhase += c.waveRollSpeed * dt * g.animationSpeed;
    const roll = this._rollPhase;
    const fade = Easing.outQuad(saturate(sink));
    // It swells out of the floor at the start, and sinks back into it at the end.
    const rise = Easing.outCubic(saturate(this.age / 0.18));
    const height = c.height * rise * (0.15 + 0.85 * fade);

    /* --- layer 1: the wave, facing the way it is going --- */
    const sign = this.returning ? -1 : 1;
    _facing.copy(this.direction).multiplyScalar(sign);
    const ws = this._waveState;
    ws.height = height;
    ws.rollPhase = roll;
    ws.fade = fade;
    ws.seed = this._seed;
    this.mat.userData.sync(c, ws);

    /* --- layer 2: crest foam --- */
    for (let band = 0; band < this.crestBands.length; band++) {
      const p = this.crestBands[band].geometry.attributes.position;
      for (let i = 0; i <= N; i++) {
        const u = (i / N) * 2 - 1;
        const x = u * c.width;
        const h = height * Math.max(0, 1 - u * u);
        const r = Math.sin(u * 7 + roll) * c.waveRoll;
        // Roll and lag both along _facing, exactly as the wave shader rolls
        // its crest (uFacing * roll): on the return the bands stay on the
        // crest instead of rolling the opposite way and sliding off it.
        const along = r - (0.12 + band * 0.24);
        const width = c.crestWidth * (1 - band * 0.25);
        for (let j = 0; j < 2; j++)
          p.setXYZ(
            i * 2 + j,
            this.tmp.x + this.side.x * x + _facing.x * along,
            h + (j ? width : 0),
            this.tmp.z + this.side.z * x + _facing.z * along
          );
      }
      p.needsUpdate = true;
    }
    this.crestMaterial.uniforms.uTime.value = this.age;
    // getColor caches the parse; Color.set(string) would regex it every frame.
    this.crestMaterial.uniforms.uColor.value.copy(getColor(c.crestColor));
    this.crestMaterial.uniforms.uOpacity.value = c.crestOpacity * g.opacity;
    this.crestMaterial.uniforms.uFade.value = fade;
    this.crestMaterial.uniforms.uSeed.value = this._seed;

    /* --- layer 6: the wake (the recorded course, written every frame so its
       width stays a live slider) --- */
    const wa = this.wakeGeo.attributes.position;
    for (let i = 0; i <= N; i++) {
      const dist = (this.length * i) / N;
      const p = this._point(dist, this.wakePoint);
      const w = c.wakeWidth + c.wakeWobble * Math.sin(i * 1.7);
      wa.setXYZ(i * 2, p.x - this.side.x * w, 0.04, p.z - this.side.z * w);
      wa.setXYZ(i * 2 + 1, p.x + this.side.x * w, 0.04, p.z + this.side.z * w);
    }
    wa.needsUpdate = true;
    this.wakeMat.uniforms.uTime.value = this.age;
    this.wakeMat.uniforms.uCoverage.value = this.coverage;
    this.wakeMat.uniforms.uFade.value = fade;
    this.wakeMat.userData.sync(c, this.length, this._seed);

    /* --- layer 3: the lip's spray --- */
    this.spray.position.copy(this.frontPoint);
    this.spray.rotation.y = Math.atan2(this.direction.x, this.direction.z) + (this.returning ? Math.PI : 0);
    const su = this.sprayMaterial.uniforms;
    su.uTime.value = this.age;
    su.uWidth.value = c.width;
    su.uHeight.value = height;
    su.uRate.value = c.sprayRate * g.particleSpeed;
    su.uSize.value = c.spraySize * g.particleSize;
    su.uOpacity.value = c.sprayOpacity * g.opacity;
    su.uFade.value = fade;
    su.uColor.value.copy(getColor(c.colorSpray));

    /* --- layer 7: the turn ripple's look --- */
    const tu = this.turnMaterial.uniforms;
    tu.uRings.value = c.turnRings;
    tu.uSeed.value = this._seed;
    tu.uColor.value.copy(getColor(c.colorTurn));
    tu.uColorFoam.value.copy(getColor(c.colorTurnFoam));

    /* --- layer 9: refraction behind the crest --- */
    const warp = this._warpState;
    warp.width = c.width * 2.2;
    warp.height = height * 1.4 + 0.2;
    warp.strength = fade * rise;
    warp.seed = this._seed;
    this.warpMaterial.userData.sync(c, warp);
    this.warp.position.copy(this.frontPoint).addScaledVector(_facing, -0.4);
    this.warp.position.y = warp.height * 0.5;

    /* --- layers 3–5: the shared engine --- */
    this._syncParticles();
    if (dt > 0 && sink >= 1) this._weather(dt, height);

    this.position.copy(this.frontPoint);
    this.position.y = height * 0.5;
  }

  _weather(dt, height) {
    const c = this.config;
    const g = settings.global;
    const time = frame.uTime.value;
    // Droplets thrown forward and up off the lip.
    const drops = Math.round(this.dropletEmitter.tick(dt, c.dropletRate * g.particleCount));
    if (drops > 0) {
      _pos.copy(this.frontPoint).addScaledVector(_facing, 0.3).setY(height * 0.9);
      _dir.copy(_facing).setY(1.1).normalize();
      this._droplets(_pos, _dir, drops, 1, c.width * 0.8);
    }
    // Haze shed behind the crest.
    const puffs = Math.round(this.mistEmitter.tick(dt, c.mistRate * g.particleCount));
    if (this.mistSystem && puffs > 0) {
      _pos.copy(this.frontPoint).addScaledVector(_facing, -0.5).setY(height * 0.75);
      _emit.position = _pos;
      _emit.radius = c.width * 0.7;
      _emit.direction = _dir.copy(_facing).multiplyScalar(-0.4).setY(0.5).normalize();
      _emit.speed = 0.5;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.8;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = c.mistSize;
      _emit.sizeVariance = 0.5;
      _emit.life = c.mistLife;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0.4;
      _emit.tint = null;
      _emit.time = time;
      this.mistSystem.emit(Math.min(puffs, 24), _emit);
    }
    // Foam bubbles left at the foot.
    const bubbles = Math.round(this.bubbleEmitter.tick(dt, c.bubbleRate * g.particleCount));
    if (this.bubbleSystem && bubbles > 0) {
      _pos.copy(this.frontPoint).addScaledVector(_facing, -0.2).setY(0.08);
      _emit.position = _pos;
      _emit.radius = c.width * 0.8;
      _emit.direction = UP;
      _emit.speed = 0.2;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.6;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = c.bubbleSize;
      _emit.sizeVariance = 0.6;
      _emit.life = c.bubbleLife;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = time;
      this.bubbleSystem.emit(Math.min(bubbles, 32), _emit);
    }
  }

  _droplets(position, direction, count, speedScale, radius) {
    if (!this.dropletSystem) return;
    const c = this.config;
    const n = Math.min(96, Math.max(0, Math.round(count * settings.global.particleCount)));
    if (n <= 0) return;
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = c.dropletSpeed * speedScale;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.6;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.dropletSize;
    _emit.sizeVariance = 0.5;
    _emit.life = c.dropletLife;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.dropletSystem.emit(n, _emit);
  }

  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    if (this.dropletSystem) {
      const u = this.dropletSystem.uniforms;
      this.dropletSystem.setGradient(getColor(c.colorDropletA), getColor(c.colorDropletB), getColor(c.colorDropletC), getColor(c.colorDropletD));
      u.uGravity.value.set(0, c.dropletGravity, 0);
      u.uOpacity.value = g.opacity;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
      u.uTurbulence.value = 0.1 * g.turbulence;
    }
    if (this.mistSystem) {
      const u = this.mistSystem.uniforms;
      this.mistSystem.setGradient(getColor(c.colorMistA), getColor(c.colorMistB), getColor(c.colorMistC), getColor(c.colorMistD));
      u.uGravity.value.set(0, 0.25, 0);
      u.uOpacity.value = c.mistOpacity * g.opacity;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
      u.uTurbulence.value = 0.7 * g.turbulence;
    }
    if (this.bubbleSystem) {
      const u = this.bubbleSystem.uniforms;
      this.bubbleSystem.setGradient(getColor(c.colorBubbleA), getColor(c.colorBubbleB), getColor(c.colorBubbleC), getColor(c.colorBubbleD));
      u.uGravity.value.set(0, 0, 0);
      u.uOpacity.value = g.opacity;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.hitOut.clear();
    this.hitBack.clear();
    this.turnRing.visible = false;
    this.wave.visible = false;
    this.wake.visible = false;
    this.spray.visible = false;
    this.warp.visible = false;
    for (const band of this.crestBands) band.visible = false;
    this.mat.uniforms.uFade.value = 1;
    this.wakeMat.uniforms.uFade.value = 1;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.wakeGeo.dispose();
    this.wakeMat.dispose();
    this.sprayGeometry.dispose();
    this.sprayMaterial.dispose();
    for (const band of this.crestBands) band.geometry.dispose();
    this.crestMaterial.dispose();
    this.turnGeometry.dispose();
    this.turnMaterial.dispose();
    this.warpGeometry.dispose();
    this.warpMaterial.dispose();
    // The droplet, mist and bubble systems belong to the shared ParticleEngine.
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

/** A sub-folder where the host GUI nests; a flat host gets the parent back. */
function section(parent, title) {
  return typeof parent.addFolder === 'function' ? parent.addFolder(title) : parent;
}

/** `Editor.gradient`, with the same flat-host fallback as `section`. */
function gradient(folder, c, prefix, title, Editor) {
  if (typeof folder.addFolder === 'function') return Editor.gradient(folder, c, prefix, title);
  for (const stop of ['A', 'B', 'C', 'D']) folder.addColor(c, `${prefix}${stop}`).name(`${title} ${stop}`);
  return folder;
}

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1F30A}  Tidal Memory');
  const R = Editor.range;

  const cast = section(folder, 'The cast');
  R(cast, c, 'range', 4, 48, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 40, 0.5, 'wave speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 4, 0.05, 'sink time (s)');
  R(cast, c, 'cooldown', 0, 20, 0.05, 'cooldown');
  if (Editor.castAnimation) Editor.castAnimation(cast, c);

  const light = section(folder, 'Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'turnLight', 0, 30, 0.1, 'punch at the turn');
  R(light, c, 'arrivalLight', 0, 30, 0.1, 'punch on arrival');

  const wave = section(folder, '1 · Wave');
  R(wave, c, 'width', 0.4, 4, 0.05, 'wave width');
  R(wave, c, 'height', 0.2, 4, 0.05, 'crest height');
  R(wave, c, 'waveBack', 0.2, 5, 0.05, 'back slope (m)');
  R(wave, c, 'waveCurl', 0, 1.5, 0.01, 'lip curl');
  R(wave, c, 'waveRoll', 0, 0.5, 0.005, 'crest roll (m)');
  R(wave, c, 'waveRollSpeed', 0, 12, 0.05, 'roll speed');
  R(wave, c, 'waveWander', 0, 0.5, 0.005, 'crest wander (m)');
  R(wave, c, 'waveOpacity', 0, 1, 0.01, 'opacity');
  R(wave, c, 'waveFresnel', 0.2, 8, 0.05, 'silhouette power');
  R(wave, c, 'waveFoam', 0, 1, 0.01, 'crest foam');
  R(wave, c, 'waveFoamScale', 0.2, 10, 0.05, 'foam scale');
  R(wave, c, 'waveCaustic', 0, 2, 0.01, 'caustics');
  R(wave, c, 'waveGlint', 0, 6, 0.01, 'sun glint');
  R(wave, c, 'waveSoftFade', 0.01, 3, 0.01, 'soft intersection (m)');
  wave.addColor(c, 'colorDeep').name('deep');
  wave.addColor(c, 'colorShallow').name('shallow');
  wave.addColor(c, 'colorFoam').name('foam');
  wave.addColor(c, 'colorGlint').name('glint');
  const crest = section(wave, 'Crest foam');
  R(crest, c, 'crestWidth', 0.02, 0.6, 0.01, 'foam width');
  R(crest, c, 'crestOpacity', 0, 1, 0.01, 'foam opacity');
  crest.addColor(c, 'crestColor').name('foam color');
  const spray = section(wave, 'Lip spray');
  R(spray, c, 'sprayRate', 0, 4, 0.01, 'cycles/s');
  R(spray, c, 'spraySize', 0.1, 4, 0.01, 'point size');
  R(spray, c, 'sprayOpacity', 0, 1, 0.01, 'opacity');
  spray.addColor(c, 'colorSpray').name('colour');

  const sweep = section(folder, '2 · Return');
  R(sweep, c, 'returnDuration', 0.2, 4, 0.05, 'return time');
  R(sweep, c, 'impulse', 0, 15, 0.1, 'wave force');
  R(sweep, c, 'lift', 0, 8, 0.1, 'wave lift');

  const turn = section(folder, '3 · Turn');
  R(turn, c, 'turnRadius', 0.2, 6, 0.1, 'turn ripple radius');
  R(turn, c, 'turnDuration', 0.1, 2, 0.05, 'turn ripple time');
  R(turn, c, 'turnRings', 1, 8, 1, 'ripple crests');
  R(turn, c, 'turnFlash', 0, 0.5, 0.01, 'turn flash');
  R(turn, c, 'turnShake', 0, 1, 0.01, 'turn shake');
  R(turn, c, 'turnBurst', 0, 6, 0.05, 'splash dome (m)');
  R(turn, c, 'turnBurstIntensity', 0, 3, 0.01, 'splash brightness');
  turn.addColor(c, 'colorTurn').name('ripple');
  turn.addColor(c, 'colorTurnFoam').name('ripple foam');
  turn.addColor(c, 'colorBurstA').name('splash inner');
  turn.addColor(c, 'colorBurstB').name('splash mid');
  turn.addColor(c, 'colorBurstC').name('splash outer');

  const wake = section(folder, '4 · Wake');
  R(wake, c, 'wakeWidth', 0.05, 2, 0.01, 'width (m)');
  R(wake, c, 'wakeWobble', 0, 1, 0.01, 'width wobble (m)');
  R(wake, c, 'wakeOpacity', 0, 2, 0.01, 'opacity');
  R(wake, c, 'wakeLace', 0, 2, 0.01, 'foam lace');
  R(wake, c, 'wakeMemory', 0, 1, 0.01, 'left after retrace');
  wake.addColor(c, 'colorWake').name('water');
  wake.addColor(c, 'colorWakeMemory').name('memory line');

  const droplets = section(folder, '5 · Droplets');
  R(droplets, c, 'dropletRate', 0, 300, 1, 'per second');
  R(droplets, c, 'dropletSize', 0.01, 0.4, 0.005, 'size');
  R(droplets, c, 'dropletSpeed', 0, 12, 0.05, 'speed');
  R(droplets, c, 'dropletLife', 0.1, 3, 0.05, 'lifetime');
  R(droplets, c, 'dropletGravity', -25, 0, 0.1, 'gravity');
  R(droplets, c, 'arrivalSplash', 0, 96, 1, 'thrown at turn / arrival');
  gradient(droplets, c, 'colorDroplet', 'droplet gradient', Editor);

  const mist = section(folder, '6 · Mist');
  R(mist, c, 'mistRate', 0, 100, 0.5, 'puffs/s');
  R(mist, c, 'mistSize', 0.05, 3, 0.01, 'size');
  R(mist, c, 'mistLife', 0.1, 5, 0.05, 'lifetime');
  R(mist, c, 'mistOpacity', 0, 1, 0.01, 'opacity');
  gradient(mist, c, 'colorMist', 'mist gradient', Editor);

  const bubbles = section(folder, '7 · Foam bubbles');
  R(bubbles, c, 'bubbleRate', 0, 200, 1, 'per second');
  R(bubbles, c, 'bubbleSize', 0.01, 0.3, 0.005, 'size');
  R(bubbles, c, 'bubbleLife', 0.1, 3, 0.05, 'lifetime');
  gradient(bubbles, c, 'colorBubble', 'bubble gradient', Editor);

  const ground = section(folder, '8 · Ground');
  R(ground, c, 'foamInterval', 0.2, 6, 0.05, 'foam every (m)');
  R(ground, c, 'foamRadius', 0.1, 4, 0.05, 'foam radius (m)');
  R(ground, c, 'foamLife', 0.1, 8, 0.05, 'foam life');
  R(ground, c, 'rippleRadius', 0.1, 6, 0.05, 'launch/arrival ripple (m)');
  R(ground, c, 'rippleLife', 0.1, 4, 0.05, 'ripple life');
  ground.addColor(c, 'colorFoamA').name('foam light');
  ground.addColor(c, 'colorFoamB').name('foam dark');

  const extra = section(folder, '9 · Motion & distortion');
  R(extra, c, 'travelRumble', 0, 0.5, 0.005, 'camera rumble');
  R(extra, c, 'warpStrength', 0, 3, 0.01, 'refraction');
  R(extra, c, 'warpScale', 0.1, 6, 0.01, 'refraction scale');
  R(extra, c, 'warpSpeed', 0, 6, 0.01, 'refraction speed');

  folder.close();
  return folder;
}
