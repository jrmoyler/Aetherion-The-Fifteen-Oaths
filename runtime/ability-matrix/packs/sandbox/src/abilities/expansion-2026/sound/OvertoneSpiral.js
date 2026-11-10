import { Color, Mesh, Points, Quaternion, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../../Ability.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { settings, CAST_ANIMATIONS } from '../../../config/settings.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { getColor } from '../../../utils/color.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import overtoneConfig from './OvertoneSpiralConfig.js';
import {
  harmonicFrontGeometry,
  forkTineGeometry,
  forkStemGeometry,
  overtoneHelixGeometry,
  carrierGeometry,
  carrierWakeGeometry,
  plateGeometry,
  noteCloudGeometry
} from './OvertoneSpiralGeometry.js';
import {
  createFrontMaterial,
  createResonatorMaterial,
  createCarrierMaterial,
  createWakeMaterial,
  createPlateMaterial,
  createHelixMaterial,
  createNoteMaterial,
  createPressureWarpMaterial
} from './OvertoneSpiralMaterials.js';

export const ID = 'overtone-spiral',
  UID = 'matrix-expansion/overtone-spiral';

/** The data block: `meta` and the live `settings` (see OvertoneSpiralConfig.js). */
export const CONFIG = Object.freeze(overtoneConfig);

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** Harmonics per cast — three strikes, three fronts. */
const HARMONICS = 3;
/** Tines on the fork. */
const TINES = 3;
/** Turns in the overtone helix (two per harmonic). */
const HELIX_TURNS = 6;
/** Notes in the drifting cloud. */
const NOTE_COUNT = 96;
/** Motes/dust emitted along the fronts in one frame, at most. */
const MAX_FRONT_EMITS = 8;

const _emit = {};
const _burst = { radius: 0.2, endRadius: 1.6, life: 0.45, intensity: 0.5, opacity: 0.28, colorA: null, colorB: null, colorC: null };
const _decal = { radius: 3, life: 0.6, intensity: 0.6, width: 0.05, colorA: null, colorB: null };
const _pos = new Vector3();
const _dir = new Vector3();
const _up = new Vector3(0, 1, 0);
const _fwd = new Vector3(0, 0, 1);
const _start = new Vector3();
const _head = new Vector3();
const _q = new Quaternion();
const _qSpin = new Quaternion();

/**
 * OVERTONE SPIRAL — Sound, zone cast.
 *
 * A struck tuning fork. The **travel** is a carrier — a flat bead of sound,
 * its rim pinched into seven lobes like a membrane caught mid-vibration —
 * skimming to the circle and shedding motes. On **impact** a resonator stands
 * up out of the floor there: a turned steel stem and three tines. It is
 * **struck three times**, `pulseInterval` apart; each strike makes the tines
 * jump and buzz, lights their nodal bands, punches the light, knocks the
 * camera, throws rings of sound off the fork and releases a harmonic
 * **front** that rolls out at `waveSpeed` to `radius`, knocking every body it
 * passes. The three fronts are the first three harmonics — each has more
 * lobes round its ridge, a higher shimmer and its own tone — and each knocks
 * a body once. Then the fork **rings down** over `lifetime`.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the carrier** (`carrierGeometry`, `createCarrierMaterial`) — a
 *      ringing bead at hand height, facing the way it flies — the motes it
 *      trails, and **the wake** (`carrierWakeGeometry`, `createWakeMaterial`
 *      ×2, crossed): a ribbon of sound strung from the caster's hand to the
 *      bead, swinging in a standing wave, dark-edged with a hot core. On
 *      impact the wake stays strung from the hand to the fork for `wakeHold`
 *      and then reels into it, so the path reads in the first frames even
 *      though the bead itself crosses the range in a few hundredths.
 *   2. **the resonator** (`forkTineGeometry` ×3, `forkStemGeometry`,
 *      `createResonatorMaterial`) — the standing silhouette, scaled by
 *      `forkScale` to ~3 m so it towers over the bodies it knocks down. Dark
 *      green-steel on a four-stop ramp (`metalDeep` shadow → `metalColor`
 *      lit faces → pale sheen → white-hot nodal bands) with a teal fresnel
 *      rim; the tines bend in their first mode on the strike and their nodal
 *      bands blaze in the fundamental's tone.
 *   3. **the fronts** (`harmonicFrontGeometry`, `createFrontMaterial` ×3) —
 *      pressure ridges displaced in the vertex stage: radius, width, crest
 *      and lobes are all uniforms, so no vertex is rewritten on the CPU.
 *   4. **the plate** (`createPlateMaterial`) — Chladni nodal lines on the
 *      floor, morphing from mode (1,2) to (2,5) to (3,7) as each harmonic
 *      rings in, turning slowly, with an echo where each front has passed.
 *   5. **the helix** (`overtoneHelixGeometry`, `createHelixMaterial`) — the
 *      overtone series wound up the fork, turns crowding toward the top,
 *      lit two turns per strike: the spiral in the name.
 *   6. **notes and particles** — a cloud of note glyphs spiralling up off the
 *      plate (`createNoteMaterial`), RING particles thrown off the fork per
 *      strike, SOFT motes and non-additive SMOKE dust shed along the fronts.
 *   7. **the warp** (`createPressureWarpMaterial`) — three rings of bent air
 *      on `LAYER.DISTORTION`, riding the three fronts.
 *   8. **the beats** — a knock as the fork stands, a knock, light punch and
 *      SHOCKWAVE decal per strike, a flash and AIR shell on the first.
 *
 * ## Hits (`handlesOwnHits`)
 *
 * Each front sweeps the annulus between where it was last frame and where it
 * is now (`_scan`). A living body it reaches is knocked down outward
 * (`kill`, not sliced); a body already down is shoved again by the later
 * fronts. Every front strikes each body at most once. A body at the dead
 * centre is knocked along the cast heading.
 *
 * ## The editor rule
 *
 * A cast keeps its centre, the three fronts' last radii, their hit sets and
 * two integrated phases. Every metre, time and colour is read from
 * `settings['overtone-spiral']` every frame.
 */
export class OvertoneSpiralAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Time for the last front to reach `radius`, plus a short tail. */
  get impactDuration() {
    return this.config.radius / this.config.waveSpeed + 2 * this.config.pulseInterval + 0.2;
  }

  /** The ring-down. Presentation only, so it follows the global lifetime. */
  get fadeDuration() {
    return Math.max(0.1, this.config.lifetime) * Math.max(0.1, settings.global.lifetime);
  }

  /** Bodies struck by any front this cast. HUD readout only. */
  get instanceCount() {
    return this.hit[0].size;
  }

  /** A struck fork beats: a fast tremolo on the light. */
  lightShimmer() {
    return 0.88 + 0.12 * Math.sin(this.age * 31) * Math.sin(this.age * 2.3);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- 2 · the resonator's shared steel ---- */
    this.mat = createResonatorMaterial();

    /* ---- 3 · the three fronts ---- */
    this.rings = [];
    this.ringMaterials = [];
    const colors = [new Color(0xa6ff85), new Color(0x54ebe6), new Color(0xe6d1ff)];
    for (let i = 0; i < HARMONICS; i++) {
      const material = createFrontMaterial(colors[i], 1 + i * 0.5);
      this.ringMaterials.push(material);
      // One geometry per front, so each can be disposed with its ring.
      const ring = new Mesh(harmonicFrontGeometry(), material);
      ring.layers.set(LAYER.VFX);
      ring.frustumCulled = false; // shaped in the vertex stage
      ring.renderOrder = 6 + i;
      this.group.add(ring);
      this.rings.push(ring);
    }
    this.centre = new Vector3();
    this.found = [];
    this.hit = [new Set(), new Set(), new Set()];
    this.previous = [0, 0, 0];

    /* ---- 1 · the carrier ---- */
    // A travelling carrier makes the delivery of the zone visible before the
    // resonator forms and releases its three independent fronts.
    this.carrierGeometry = carrierGeometry();
    this.carrierMaterial = createCarrierMaterial(new Color(0x7af5bd), 2);
    this.carrier = new Mesh(this.carrierGeometry, this.carrierMaterial);
    this.carrier.layers.set(LAYER.VFX);
    this.group.add(this.carrier);

    // The wake: two crossed ribbons sharing one strip.
    this.wakeGeometry = carrierWakeGeometry();
    this.wakeMaterials = [createWakeMaterial(0), createWakeMaterial(1)];
    this.wakes = this.wakeMaterials.map((material) => {
      const wake = new Mesh(this.wakeGeometry, material);
      wake.layers.set(LAYER.VFX);
      wake.frustumCulled = false; // laid out in the vertex stage
      wake.renderOrder = 9;
      wake.visible = false;
      this.group.add(wake);
      return wake;
    });
    this._impactAge = -1;

    /* ---- 2 · the resonator gives the fronts a physical source ---- */
    this.forkGeometry = forkTineGeometry();
    this.stemGeometry = forkStemGeometry();
    this.forks = [];
    for (let i = 0; i < TINES; i++) {
      const fork = new Mesh(this.forkGeometry, this.mat);
      fork.layers.set(LAYER.VFX);
      fork.renderOrder = 10;
      this.group.add(fork);
      this.forks.push(fork);
    }
    this.stem = new Mesh(this.stemGeometry, this.mat);
    this.stem.layers.set(LAYER.VFX);
    this.stem.renderOrder = 10;
    this.group.add(this.stem);

    /* ---- 4 · the plate, 7 · the warp (one disc geometry) ---- */
    this.plateGeometry = plateGeometry();
    this.plateMaterial = createPlateMaterial();
    this.plate = new Mesh(this.plateGeometry, this.plateMaterial);
    this.plate.rotation.x = -Math.PI / 2;
    this.plate.layers.set(LAYER.VFX);
    this.plate.renderOrder = 2;
    this.group.add(this.plate);
    this.warpMaterial = createPressureWarpMaterial();
    this.warp = new Mesh(this.plateGeometry, this.warpMaterial);
    this.warp.rotation.x = -Math.PI / 2;
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.group.add(this.warp);

    /* ---- 5 · the helix ---- */
    this.helixGeometry = overtoneHelixGeometry(HELIX_TURNS);
    this.helixMaterial = createHelixMaterial();
    this.helix = new Mesh(this.helixGeometry, this.helixMaterial);
    this.helix.layers.set(LAYER.VFX);
    this.helix.renderOrder = 11;
    this.group.add(this.helix);

    this._plateSpin = 0;
    this._helixSpin = 0;
    this._beats = 0;
    /** Scratch: radii of the fronts still travelling this frame. */
    this._radii = [0, 0, 0];
  }

  createParticles() {
    /* ---- 6 · the note cloud ---- */
    this.noteGeometry = noteCloudGeometry(NOTE_COUNT);
    this.noteMaterial = createNoteMaterial();
    this.notes = new Points(this.noteGeometry, this.noteMaterial);
    this.notes.layers.set(LAYER.VFX);
    this.notes.frustumCulled = false;
    this.group.add(this.notes);

    /* ---- 6 · pooled particle systems ---- */
    const particles = this.ctx.particles;
    this.soundRings = particles?.get?.(`${ID}.rings`, { capacity: 96, shape: ParticleShape.RING, additive: true, softFade: 0.3 }) ?? null;
    this.motes = particles?.get?.(`${ID}.motes`, { capacity: 900, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.3 }) ?? null;
    // Not additive: dust is the floor shivering, it should dirty, not glow.
    this.dust = particles?.get?.(`${ID}.dust`, { capacity: 600, shape: ParticleShape.SMOKE, additive: false, softFade: 0.8 }) ?? null;
    this.trailEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
    this.dustEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.reduceMotion = prefersReducedMotion();
    this.centre.copy(this.origin).addScaledVector(this.direction, this.length);
    for (const s of this.hit) s.clear();
    this.previous.fill(0);
    this._plateSpin = 0;
    this._helixSpin = 0;
    this._beats = 0;
    this.trailEmitter.reset();
    this.moteEmitter.reset();
    this.dustEmitter.reset();
    this.mat.uniforms.uFade.value = 1;
    this.mat.uniforms.uStrike.value = 0;
    for (const material of this.ringMaterials) material.uniforms.uFade.value = 1;
    this._syncColors();
    this.noteMaterial.uniforms.uFade.value = 0; // ramped on through the impact (see onFade)
    this.carrier.visible = true;
    this.carrierMaterial.uniforms.uFade.value = 1;
    this._impactAge = -1;
    for (const wake of this.wakes) wake.visible = true;
    this._drawCarrier();
    this.notes.position.copy(this.centre);
    this.noteMaterial.uniforms.uRadius.value = this.config.radius;
    this.notes.visible = false;
    this.stem.visible = false;
    for (const fork of this.forks) fork.visible = false;
    for (const r of this.rings) {
      r.visible = false;
      r.position.copy(this.centre);
    }
    this.plate.visible = false;
    this.warp.visible = false;
    this.helix.visible = false;
    this.plateMaterial.uniforms.uFade.value = 0;
    this.helixMaterial.uniforms.uFade.value = 0;
  }

  /** The cast's visual clock: frozen under reduced motion. */
  get _clock() {
    return this.reduceMotion ? 0 : this.age;
  }

  _drawCarrier() {
    const c = this.config;
    const time = this._clock;
    this._syncColors();
    this.pointAt(this.u, this.carrier.position);
    this.carrier.position.y = c.carrierHeight ?? 1.2;
    // The bead throbs as it flies, a carrier tone made visible.
    const size = (c.carrierSize ?? 0.75) * (1 + 0.28 * Math.sin(time * 12));
    this.carrier.scale.setScalar(size);
    // It faces the way it flies (so the caster's camera sees its face) and spins.
    _q.setFromUnitVectors(_fwd, this.direction);
    _qSpin.setFromAxisAngle(_fwd, time * (c.carrierSpin ?? 2));
    this.carrier.quaternion.copy(_q).multiply(_qSpin);
    this.carrierMaterial.uniforms.uTime.value = time;
    this._drawWake();
  }

  /** The resonator's size factor, live from the slider. */
  get _forkScale() {
    return Math.max(0.2, this.config.forkScale ?? 1);
  }

  /**
   * The wake, from the caster's hand to the bead in flight, then to the
   * fork's tines; after `wakeHold` it reels in toward the fork and is gone.
   */
  _drawWake() {
    const c = this.config;
    const gl = settings.global;
    let tail = 0;
    let fade = 1;
    _start.copy(this.origin).addScaledVector(this.direction, c.wakeStartOffset ?? 0.5);
    if (this._impactAge < 0) {
      _head.copy(this.carrier.position);
    } else {
      _head.copy(this.centre);
      _head.y = (c.forkHeight ?? 1) * this._forkScale;
      const life = Math.max(0.1, gl.lifetime);
      const since = this.age - this._impactAge;
      const hold = (c.wakeHold ?? 0.55) * life;
      const reel = Math.max(0.02, (c.wakeReel ?? 0.35) * life);
      tail = clamp01((since - hold) / reel);
      tail = tail * tail * (3 - 2 * tail);
      fade = 1 - clamp01((since - hold - reel * 0.6) / (reel * 0.4));
    }
    const dx = _head.x - _start.x;
    const dz = _head.z - _start.z;
    const length = Math.max(0.01, Math.hypot(dx, dz));
    _dir.set(dx / length, 0, dz / length);
    _q.setFromUnitVectors(_fwd, _dir);
    const time = this._clock;
    const show = fade > 0.001 && tail < 0.999;
    for (let i = 0; i < this.wakes.length; i++) {
      const wake = this.wakes[i];
      const material = this.wakeMaterials[i];
      wake.visible = show;
      if (!show) continue;
      wake.position.set(_start.x, 0, _start.z);
      wake.quaternion.copy(_q);
      material.userData.sync(c);
      const u = material.uniforms;
      u.uTime.value = time + i * 0.37;
      u.uLength.value = length;
      u.uStartY.value = c.wakeStartHeight ?? 1.3;
      u.uEndY.value = _head.y;
      u.uDraw.value = 1;
      u.uTail.value = tail;
      u.uFade.value = fade * gl.opacity;
    }
  }

  /** Tones and gains → every material, every frame, so a drag lands mid-cast. */
  _syncColors() {
    const c = this.config;
    this.ringMaterials[0].uniforms.uColor.value.set(c.toneA);
    this.ringMaterials[1].uniforms.uColor.value.set(c.toneB);
    this.ringMaterials[2].uniforms.uColor.value.set(c.toneC);
    for (let i = 0; i < HARMONICS; i++) this.ringMaterials[i].userData.sync(c, i);
    this.mat.userData.sync(c);
    this.carrierMaterial.userData.sync(c);
    this.plateMaterial.userData.sync(c);
    this.helixMaterial.userData.sync(c);
    this.noteMaterial.userData.sync(c);
  }

  /** Shared particle uniforms, written every frame from the live settings. */
  _syncParticles(c) {
    const gl = settings.global;
    if (this.soundRings) {
      // Rings start in the fundamental and die into the deep stop, not to a pale wash.
      this.soundRings.setGradient(getColor(c.toneA), getColor(c.toneB), getColor(c.toneB), getColor(c.colorDeep ?? '#07302b'));
      const u = this.soundRings.uniforms;
      u.uEndSize.value = c.ringGrowth ?? 6;
      u.uGravity.value.set(0, 0, 0);
      u.uDrag.value = 0;
      u.uSizeScale.value = gl.particleSize;
      u.uLifeScale.value = gl.particleLifetime;
      u.uSpeedScale.value = gl.particleSpeed;
      u.uOpacity.value = gl.opacity;
      u.uGlow.value = gl.glow;
    }
    if (this.motes) {
      this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
      const u = this.motes.uniforms;
      u.uGravity.value.set(0, 0.4, 0);
      u.uDrag.value = 1.2;
      u.uSizeScale.value = gl.particleSize;
      u.uLifeScale.value = gl.particleLifetime;
      u.uSpeedScale.value = gl.particleSpeed;
      u.uOpacity.value = gl.opacity;
      u.uGlow.value = gl.glow;
      u.uTurbulence.value = 0.4 * gl.turbulence;
    }
    if (this.dust) {
      this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
      const u = this.dust.uniforms;
      u.uGravity.value.set(0, 0.25, 0);
      u.uDrag.value = 1.8;
      u.uEndSize.value = 2.2;
      u.uSizeScale.value = gl.particleSize;
      u.uLifeScale.value = gl.particleLifetime;
      u.uSpeedScale.value = gl.particleSpeed;
      u.uOpacity.value = (c.dustOpacity ?? 0.25) * gl.opacity;
      u.uTurbulence.value = 0.5 * gl.turbulence;
    }
  }

  /** Fill the shared emission record. */
  _emitRecord(position, direction, radius, speed, size, life, spin) {
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = speed;
    _emit.speedVariance = 0.4;
    _emit.spread = 0.5;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = size;
    _emit.sizeVariance = 0.4;
    _emit.life = life;
    _emit.lifeVariance = 0.3;
    _emit.spin = spin;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    return _emit;
  }

  onTravel(dt) {
    this._drawCarrier();
    const c = this.config;
    this._syncParticles(c);
    if (this.motes && !this.reduceMotion) {
      const n = this.trailEmitter.tick(dt, Math.max(0, (c.carrierTrail ?? 40) * settings.global.particleCount));
      if (n) {
        _dir.copy(this.direction).negate().addScaledVector(_up, 0.4).normalize();
        this.motes.emit(n, this._emitRecord(this.carrier.position, _dir, 0.2, 0.6, c.moteSize ?? 0.06, c.moteLifetime ?? 0.8, 1));
      }
    }
  }

  onImpact() {
    const c = this.config;
    const gl = settings.global;
    this.position.copy(this.centre);
    this.carrier.visible = false;
    this._impactAge = this.age;
    // The note cloud eases on with the plate (onFade ramps uFade) instead of
    // popping in at full strength on the impact frame.
    this.noteMaterial.uniforms.uFade.value = 0;
    this.notes.visible = true;
    this.stem.visible = true;
    for (const fork of this.forks) fork.visible = true;
    this.plate.visible = true;
    this.helix.visible = true;
    this.plate.position.set(this.centre.x, 0.025, this.centre.z);
    this.warp.position.set(this.centre.x, 0.04, this.centre.z);
    this.helix.position.set(this.centre.x, 0.05, this.centre.z);
    // The fork stands up out of the floor: a small knock and a lift of light.
    if (!this.reduceMotion) this.ctx.shake?.add?.((c.landShake ?? 0.06) * gl.explosionIntensity, 4, 16);
    this.lightBoost = (c.strikeLight ?? 5) * 0.4 * gl.explosionIntensity;
  }

  /** The fork, its stem and the helix, at impact-phase fraction `t`. */
  _resonator(t) {
    const c = this.config;
    const time = this._clock;
    const envelope = Math.min(1, t * 8);
    const shimmer = Math.sin(time * 35) * 0.04;
    const elapsed = t * this.impactDuration;
    const decay = Math.max(0.02, c.strikeDecay ?? 0.18);
    let beat = 0;
    for (let i = 0; i < HARMONICS; i++) {
      const since = elapsed - i * c.pulseInterval;
      if (since >= 0) beat = Math.max(beat, Math.max(0, 1 - since / decay));
    }
    this.mat.uniforms.uStrike.value = beat;
    beat *= c.resonance;
    // Everything below is × forkScale, so the fork stands over a body; the
    // envelope grows it up out of the floor (the foot stays on the floor).
    const s = this._forkScale;
    const girth = s * Math.max(0.2, c.forkThickness ?? 1);
    this.stem.position.set(this.centre.x, 0.325 * s * envelope, this.centre.z);
    this.stem.scale.set(envelope * girth * (1 + beat * 0.12), envelope * s, envelope * girth * (1 + beat * 0.12));
    const spread = (c.forkSpread ?? 0.25) * s;
    for (let i = 0; i < this.forks.length; i++) {
      const fork = this.forks[i];
      const a = time * (c.forkTurn ?? 0.25) + (i * TAU) / TINES;
      fork.position.set(
        this.centre.x + Math.cos(a) * spread,
        ((c.forkHeight ?? 1) + shimmer + beat * 0.15) * s * envelope,
        this.centre.z + Math.sin(a) * spread
      );
      fork.rotation.set(shimmer * (i + 1), a, shimmer + beat * 0.12);
      fork.scale.set(envelope * girth, envelope * s * (1 + i * 0.16) * (1 + beat * 0.2), envelope * girth);
    }
    this.mat.uniforms.uTime.value = time;

    // The helix climbs the series: two turns lit per strike, each easing on.
    let lit = 0;
    for (let i = 0; i < HARMONICS; i++) lit += clamp01((elapsed - i * c.pulseInterval) / 0.3);
    const helix = this.helixMaterial.uniforms;
    helix.uDraw.value = (lit / HARMONICS) * (HELIX_TURNS + 0.4);
    helix.uTime.value = time;
    const hr = c.helixRadius ?? 0.55;
    this.helix.scale.set(hr * s * envelope, (c.helixHeight ?? 1.6) * s * envelope, hr * s * envelope);
    this.helix.rotation.y = this._helixSpin;

    // The plate rings into a new figure with each harmonic.
    let mode = 0;
    for (let i = 1; i < HARMONICS; i++) mode += clamp01((elapsed - i * c.pulseInterval) / 0.25);
    this.plateMaterial.uniforms.uMode.value = mode;
    this.noteMaterial.uniforms.uTime.value = time * ((c.noteSpeed ?? 0.4) / 0.4);
  }

  /** Sweep the annulus [lo, hi] for bodies front `index` has not yet struck. */
  _scan(index, lo, hi) {
    if (!this.ctx.dummies?.findTargets) return;
    const f = this.ctx.dummies,
      query = f.findBodies ?? f.findTargets,
      found = query.call(f, this.centre.x, this.centre.z, hi, this.found);
    for (const d of found) {
      if (this.hit[index].has(d)) continue;
      const p = d.alive === false ? (d.bodyPoint?.(this.position) ?? d.position) : d.position,
        dx = p.x - this.centre.x,
        dz = p.z - this.centre.z,
        r = Math.hypot(dx, dz);
      if (r > hi || r < lo - 0.25) continue;
      this.hit[index].add(d);
      // At the exact centre there is no radial direction; use the cast
      // heading so the hit still delivers its advertised outward impulse.
      const dirX = r > 1e-8 ? dx / r : this.direction.x;
      const dirZ = r > 1e-8 ? dz / r : this.direction.z;
      if (d.alive === false) d.shove?.(dirX * this.config.impulse, this.config.lift, dirZ * this.config.impulse);
      else d.kill?.(dirX, dirZ, { impulse: this.config.impulse, lift: this.config.lift, spin: 0.3 }, false);
    }
  }

  /** Place front `index` at `radius`; its shape is all in the vertex stage. */
  _ringMesh(mesh, radius, index) {
    mesh.position.copy(this.centre);
    mesh.position.y = 0.02 + index * 0.03;
    mesh.material.uniforms.uRadius.value = radius;
  }

  /** The beat of strike `k`: rings off the fork, a knock, a punch of light. */
  _strike(k) {
    const c = this.config;
    const gl = settings.global;
    this.lightBoost = (c.strikeLight ?? 5) * gl.explosionIntensity;
    if (this.reduceMotion) return;
    this.ctx.shake?.add?.((c.strikeShake ?? 0.1) * gl.explosionIntensity * (1 - k * 0.2), 4, 20);
    const tone = getColor(k === 0 ? c.toneA : k === 1 ? c.toneB : c.toneC);
    if (k === 0) {
      this.ctx.flash?.trigger?.(getColor(c.flashColor ?? c.toneA), (c.strikeFlash ?? 0.08) * gl.explosionIntensity);
      _pos.copy(this.centre).setY(0.9);
      _burst.endRadius = 1.6 * gl.explosionIntensity;
      _burst.colorA = tone;
      _burst.colorB = getColor(c.toneB);
      _burst.colorC = getColor(c.colorDeep ?? '#07302b');
      this.ctx.bursts?.spawn(BurstMode.AIR, _pos, _burst);
    }
    if ((c.strikeDecal ?? 0.6) > 0) {
      _decal.radius = c.radius * (c.strikeDecal ?? 0.6);
      _decal.colorA = _decal.colorB = tone;
      this.ctx.decals?.spawn(DecalType.SHOCKWAVE, this.centre, _decal);
    }
    if (this.soundRings) {
      const n = Math.min(12, Math.round((c.ringBurst ?? 3) * gl.particleCount));
      if (n > 0) {
        _pos.copy(this.centre).setY(((c.forkHeight ?? 1) + 0.2) * this._forkScale);
        this.soundRings.emit(n, this._emitRecord(_pos, _up, 0.05, 0.2, c.ringSize ?? 0.5, c.ringLifetime ?? 0.6, 0));
      }
    }
  }

  /** Motes and dust shed along whichever fronts are still travelling. */
  _emitAlongFronts(dt, c, radii, count) {
    if (this.reduceMotion || dt <= 0 || !count) return;
    const gl = settings.global;
    const motes = this.motes ? Math.min(MAX_FRONT_EMITS, this.moteEmitter.tick(dt, Math.max(0, (c.moteRate ?? 60) * gl.particleCount))) : 0;
    const dust = this.dust ? Math.min(MAX_FRONT_EMITS, this.dustEmitter.tick(dt, Math.max(0, (c.dustRate ?? 30) * gl.particleCount))) : 0;
    for (let k = 0; k < motes + dust; k++) {
      const r = radii[k % count];
      const a = Math.random() * TAU;
      _dir.set(Math.cos(a), 0, Math.sin(a));
      _pos.copy(this.centre).addScaledVector(_dir, r);
      if (k < motes) {
        _pos.y = 0.15 + Math.random() * (c.frontHeight ?? 0.3);
        _dir.addScaledVector(_up, 0.5).normalize();
        this.motes.emit(1, this._emitRecord(_pos, _dir, 0.1, c.moteSpeed ?? 0.8, c.moteSize ?? 0.06, c.moteLifetime ?? 0.8, 1));
      } else {
        _pos.y = 0.08;
        this.dust.emit(1, this._emitRecord(_pos, _dir, 0.15, 0.4, c.dustSize ?? 0.35, c.dustLifetime ?? 1, 0.5));
      }
    }
  }

  onFade(dt, t) {
    const c = this.config;
    const gl = settings.global;
    const time = this._clock;
    this._syncColors();
    this._syncParticles(c);
    this._drawWake();
    if (!this.reduceMotion) {
      this._plateSpin += (c.plateSpin ?? 0.15) * dt;
      this._helixSpin += (c.helixSpin ?? 0.6) * dt;
    }
    this.plateMaterial.uniforms.uSpin.value = this._plateSpin;
    this.plateMaterial.uniforms.uTime.value = time;
    this.plate.scale.set(c.radius, c.radius, 1);
    // The note spiral follows the radius slider live, like the plate and fronts.
    this.noteMaterial.uniforms.uRadius.value = c.radius;
    const R = Math.max(0.01, c.radius);
    const fronts = this.plateMaterial.uniforms.uFronts.value;
    const warpFronts = this.warpMaterial.uniforms.uFronts.value;
    const warpFades = this.warpMaterial.uniforms.uFronts2.value;
    const warpStrength = (c.warpStrength ?? 0.6) * Math.max(0, Math.min(2, gl.distortion));

    if (t <= 1) {
      const elapsed = t * this.impactDuration;
      // Strike beats land on the same instants the fronts launch.
      while (this._beats < HARMONICS && elapsed >= this._beats * c.pulseInterval) this._strike(this._beats++);
      let travelling = 0;
      for (let i = 0; i < HARMONICS; i++) {
        const age = elapsed - i * c.pulseInterval;
        if (age < 0) {
          fronts.setComponent(i, -1);
          warpFronts.setComponent(i, -1);
          continue;
        }
        const radius = Math.min(c.radius, age * c.waveSpeed);
        this.rings[i].visible = true;
        this.ringMaterials[i].uniforms.uTime.value = time;
        this.ringMaterials[i].uniforms.uFade.value = 1 - ((c.frontFadeOut ?? 0.65) * radius) / c.radius;
        this._scan(i, this.previous[i], radius);
        this.previous[i] = radius;
        this._ringMesh(this.rings[i], radius, i);
        fronts.setComponent(i, radius / R);
        warpFronts.setComponent(i, radius < c.radius ? radius / (R * 1.1) : -1);
        warpFades.setComponent(i, 1 - radius / R);
        // Record the still-moving fronts for the particles (reusing `previous`).
        if (radius < c.radius) this._radii[travelling++] = radius;
      }
      this.mat.uniforms.uTime.value = time;
      this._resonator(t);
      this.position.copy(this.centre);
      this.mat.uniforms.uFade.value = 1;
      this.plateMaterial.uniforms.uFade.value = Math.min(1, t * 6);
      this.noteMaterial.uniforms.uFade.value = Math.min(1, t * 6);
      this.helixMaterial.uniforms.uFade.value = 1;
      this._emitAlongFronts(dt, c, this._radii, travelling);
    } else {
      // The ring-down: everything dims together; the fronts hold where they stopped.
      const fade = 2 - t;
      this.mat.uniforms.uFade.value = fade;
      for (const material of this.ringMaterials) material.uniforms.uFade.value = 0.35 * fade;
      this.noteMaterial.uniforms.uFade.value = fade;
      this.plateMaterial.uniforms.uFade.value = fade;
      this.helixMaterial.uniforms.uFade.value = fade;
      warpFronts.set(-1, -1, -1);
      this._resonator(1);
    }

    this.warp.scale.set(R * 1.1, R * 1.1, 1);
    this.warpMaterial.uniforms.uTime.value = time;
    this.warpMaterial.uniforms.uStrength.value = warpStrength;
    this.warpMaterial.uniforms.uWidth.value = c.warpWidth ?? 0.05;
    this.warp.visible = !this.reduceMotion && warpStrength > 0 && t <= 1;
  }

  onDestroy() {
    this.carrier.visible = false;
    for (const wake of this.wakes) wake.visible = false;
    for (const r of this.rings) r.visible = false;
    for (const s of this.hit) s.clear();
    for (const fork of this.forks) fork.visible = false;
    this.stem.visible = false;
    this.notes.visible = false;
    this.plate.visible = false;
    this.warp.visible = false;
    this.helix.visible = false;
  }

  dispose() {
    for (const ring of this.rings) ring.geometry.dispose();
    for (const material of this.ringMaterials) material.dispose();
    this.forkGeometry.dispose();
    this.stemGeometry.dispose();
    this.noteGeometry.dispose();
    this.noteMaterial.dispose();
    this.carrierGeometry.dispose();
    this.carrierMaterial.dispose();
    this.wakeGeometry.dispose();
    for (const material of this.wakeMaterials) material.dispose();
    this.plateGeometry.dispose();
    this.plateMaterial.dispose();
    this.warpMaterial.dispose();
    this.helixGeometry.dispose();
    this.helixMaterial.dispose();
    this.mat.dispose();
    super.dispose();
  }
}

/* -------------------------------------------------------------------- */
/* Editor                                                               */
/* -------------------------------------------------------------------- */

/** Degrades for hosts/tests that pass bare folders or a partial `Editor`. */
function editorKit(Editor) {
  const named = (ctl, label) => (label && typeof ctl?.name === 'function' ? ctl.name(label) : ctl);
  const sub = (folder, title) => (typeof folder.addFolder === 'function' ? folder.addFolder(title) : folder);
  const R = (folder, c, key, min, max, step, label) =>
    typeof Editor?.range === 'function' ? Editor.range(folder, c, key, min, max, step, label) : named(folder.add(c, key, min, max, step), label);
  const C = (folder, c, key, label) => named(folder.addColor(c, key), label);
  const G = (folder, c, prefix, title) => {
    if (typeof Editor?.gradient === 'function' && typeof folder.addFolder === 'function') return Editor.gradient(folder, c, prefix, title);
    const group = sub(folder, title);
    C(group, c, `${prefix}A`, 'birth');
    C(group, c, `${prefix}B`, 'early');
    C(group, c, `${prefix}C`, 'late');
    C(group, c, `${prefix}D`, 'death');
    return group;
  };
  const anim = (folder, c) =>
    typeof Editor?.castAnimation === 'function' ? Editor.castAnimation(folder, c) : named(folder.add(c, 'castAnim', CAST_ANIMATIONS), 'cast animation');
  return { R, C, G, sub, anim };
}

export function buildEditor(gui, c, Editor) {
  const { R, C, G, sub, anim } = editorKit(Editor);
  const f = gui.addFolder('♫  Overtone Spiral');

  const cast = sub(f, 'The cast');
  R(cast, c, 'range', 1, 48, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 20, 0.1, 'min range');
  R(cast, c, 'speed', 1, 60, 0.5, 'carrier speed (m/s)');
  R(cast, c, 'cooldown', 0, 30, 0.1, 'cooldown');
  R(cast, c, 'lifetime', 0.1, 5, 0.05, 'rings down over');
  anim(cast, c);

  const waves = sub(f, 'The fronts (gameplay)');
  R(waves, c, 'radius', 1, 10, 0.1, 'maximum radius');
  R(waves, c, 'pulseInterval', 0.1, 1, 0.05, 'pulse spacing');
  R(waves, c, 'waveSpeed', 1, 20, 0.5, 'wave speed');
  R(waves, c, 'impulse', 0, 15, 0.1, 'wave force');
  R(waves, c, 'lift', 0, 8, 0.1, 'wave lift');
  C(waves, c, 'toneA', 'first tone');
  C(waves, c, 'toneB', 'second tone');
  C(waves, c, 'toneC', 'third tone');

  const carrier = sub(f, '1 · Carrier');
  R(carrier, c, 'carrierSize', 0.05, 2, 0.01, 'size (m)');
  R(carrier, c, 'carrierHeight', 0, 3, 0.01, 'height (m)');
  R(carrier, c, 'carrierSpin', 0, 12, 0.1, 'spin (rad/s)');
  R(carrier, c, 'carrierGlow', 0, 4, 0.05, 'glow');
  R(carrier, c, 'carrierTrail', 0, 200, 1, 'trail motes/second');
  R(carrier, c, 'wakeWidth', 0.02, 1.5, 0.01, 'wake half-width (m)');
  R(carrier, c, 'wakeSwing', 0, 1.5, 0.01, 'wake swing (m)');
  R(carrier, c, 'wakeWaves', 0.5, 12, 0.1, 'wake wavelengths');
  R(carrier, c, 'wakeGlow', 0, 4, 0.05, 'wake glow');
  R(carrier, c, 'wakeStartHeight', 0, 3, 0.01, 'wake starts at height (m)');
  R(carrier, c, 'wakeStartOffset', 0, 3, 0.01, 'wake starts ahead of caster (m)');
  R(carrier, c, 'wakeHold', 0, 2, 0.01, 'wake holds after impact (s)');
  R(carrier, c, 'wakeReel', 0.02, 2, 0.01, 'wake reels in over (s)');

  const fork = sub(f, '2 · Resonator');
  R(fork, c, 'resonance', 0, 2, 0.05, 'strike motion');
  R(fork, c, 'strikeDecay', 0.02, 1, 0.01, 'strike settles over (s)');
  R(fork, c, 'forkScale', 0.3, 4, 0.01, 'resonator scale');
  R(fork, c, 'forkThickness', 0.3, 4, 0.01, 'girth');
  R(fork, c, 'forkHeight', 0.5, 3, 0.05, 'tine height (× scale)');
  R(fork, c, 'forkSpread', 0.05, 1, 0.01, 'tine spread (m)');
  R(fork, c, 'forkTurn', 0, 3, 0.05, 'tine turn (rad/s)');
  R(fork, c, 'forkBuzz', 0, 0.1, 0.002, 'buzz (m)');
  R(fork, c, 'resonatorGlow', 0, 4, 0.05, 'nodal glow');
  C(fork, c, 'metalColor', 'steel');
  C(fork, c, 'metalDeep', 'steel deep');
  C(fork, c, 'colorDeep', 'cast deep stop');

  const fronts = sub(f, '3 · Fronts');
  R(fronts, c, 'frontWidth', 0.02, 0.6, 0.01, 'ridge half-width (m)');
  R(fronts, c, 'frontHeight', 0, 1.5, 0.01, 'crest height (m)');
  R(fronts, c, 'frontLobes', 1, 24, 1, 'lobes (fundamental)');
  R(fronts, c, 'frontRipple', 0, 0.5, 0.005, 'lobe amplitude (m)');
  R(fronts, c, 'frontGlow', 0, 4, 0.05, 'glow');
  R(fronts, c, 'frontFadeOut', 0, 1, 0.01, 'dims with distance');

  const plate = sub(f, '4 · Plate');
  R(plate, c, 'plateGlow', 0, 4, 0.05, 'glow');
  R(plate, c, 'plateOpacity', 0, 1, 0.01, 'line strength');
  R(plate, c, 'plateLine', 0.01, 0.4, 0.005, 'line thickness');
  R(plate, c, 'plateSpin', -2, 2, 0.01, 'figure turn (rad/s)');

  const helix = sub(f, '5 · Helix');
  R(helix, c, 'helixHeight', 0.2, 4, 0.05, 'height (m)');
  R(helix, c, 'helixRadius', 0.1, 2, 0.01, 'base radius (m)');
  R(helix, c, 'helixSpin', -4, 4, 0.05, 'spin (rad/s)');
  R(helix, c, 'helixGlow', 0, 4, 0.05, 'glow');

  const motes = sub(f, '6 · Notes + particles');
  R(motes, c, 'noteRise', 0, 5, 0.05, 'note rise (m)');
  R(motes, c, 'noteSize', 2, 60, 0.5, 'note size');
  R(motes, c, 'noteSwirl', 0, 8, 0.05, 'note spiral (rad)');
  R(motes, c, 'noteSpeed', 0.05, 2, 0.01, 'notes/second');
  R(motes, c, 'ringBurst', 0, 12, 1, 'sound rings per strike');
  R(motes, c, 'ringSize', 0.05, 3, 0.01, 'ring size (m)');
  R(motes, c, 'ringGrowth', 0.5, 16, 0.1, 'ring growth');
  R(motes, c, 'ringLifetime', 0.1, 3, 0.05, 'ring lifetime');
  R(motes, c, 'moteRate', 0, 400, 1, 'front motes/second');
  R(motes, c, 'moteSize', 0.01, 0.4, 0.005, 'mote size');
  R(motes, c, 'moteSpeed', 0, 6, 0.05, 'mote speed');
  R(motes, c, 'moteLifetime', 0.1, 4, 0.05, 'mote lifetime');
  G(motes, c, 'colorMote', 'mote gradient');
  R(motes, c, 'dustRate', 0, 300, 1, 'dust/second');
  R(motes, c, 'dustSize', 0.05, 2, 0.01, 'dust size');
  R(motes, c, 'dustLifetime', 0.1, 4, 0.05, 'dust lifetime');
  R(motes, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  G(motes, c, 'colorDust', 'dust gradient');

  const warp = sub(f, '7 · Warp');
  R(warp, c, 'warpStrength', 0, 3, 0.05, 'refraction');
  R(warp, c, 'warpWidth', 0.005, 0.3, 0.005, 'ring width');

  const beats = sub(f, '8 · Beats');
  R(beats, c, 'landShake', 0, 1, 0.01, 'stand-up shake');
  R(beats, c, 'strikeShake', 0, 1, 0.01, 'strike shake');
  R(beats, c, 'strikeFlash', 0, 1, 0.01, 'first strike flash');
  R(beats, c, 'strikeLight', 0, 30, 0.1, 'strike light punch');
  R(beats, c, 'strikeDecal', 0, 2, 0.01, 'shockwave decal (× radius)');
  C(beats, c, 'flashColor', 'flash');

  const light = sub(f, 'Light');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  C(light, c, 'lightColor', 'colour');
  // Returned closed, as the original folder was.
  f.close?.();
  return f;
}
