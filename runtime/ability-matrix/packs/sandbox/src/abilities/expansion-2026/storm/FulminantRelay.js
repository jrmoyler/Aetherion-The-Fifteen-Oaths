import { IcosahedronGeometry, Mesh, Points, Vector3 } from 'three';
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
  ARC_SECTIONS,
  createArcRibbon,
  createCoronaGeometry,
  createOrbitGeometry,
  createSeedGeometry,
  createTrackGeometry,
  createWarpQuad
} from './FulminantRelayGeometry.js';
import {
  createBlastMaterial,
  createBoltMaterial,
  createBoltUnderMaterial,
  createCoronaMaterial,
  createOrbitMaterial,
  createRelayWarpMaterial,
  createSeedMaterial,
  createTrackMaterial
} from './FulminantRelayMaterial.js';

export const ID = 'fulminant-relay';
export const UID = 'matrix-expansion/fulminant-relay';

/**
 * Fulminant Relay — storm, line cast.
 *
 * Data block: presentation (`meta`) and the live settings the ability and its
 * editor folder read. Every dimension, colour and time below is resolved per
 * frame, so dragging any of it re-shapes a relay that is already chaining.
 * The gameplay keys (`chainRadius`, `maxJumps`, `jumpInterval`, `impulse`,
 * `lift`, `arcLifetime`, `range`, `speed`) keep their original meaning.
 */
export const CONFIG = Object.freeze({
  id: ID,
  meta: {
    label: 'Fulminant Relay',
    accent: '#9ac8ff',
    element: 'storm',
    key: '',
    cast: 'line',
    hint: 'Launch a charged seed that jumps between nearby targets in a staggered chain.',
    glyph: '<path d="M55 5L25 52H48L38 95L75 42H52Z"/><circle cx="76" cy="72" r="8"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 20, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 18, // how fast the seed flies down the line, metres/second
    lifetime: 0.8, // seconds the seed takes to dissolve once the chain is spent
    cooldown: 4, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#a6caff',
    lightIntensity: 7, // the seed's steady glow
    lightRadius: 9,
    lightFlicker: 0.35, // 0..1 how hard the light gutters, like an arc lamp
    hopLight: 6, // light punch on every hop
    impactLight: 9, // light punch when the seed detonates at the end of the line

    /* ================================================================ */
    /* 1 · THE SEED                                                      */
    /* ================================================================ */
    size: 0.7, // seed radius, metres
    seedHeight: 1.1, // metres off the floor it flies at
    chargeTime: 0.14, // seconds it takes to swell out of the caster's hand
    seedSpin: 0.25, // turns/second
    seedLeap: 16, // how fast the seed follows the chain to each new target (1/s)
    seedSpike: 0.22, // ridged charge spikes (× radius)
    seedSpikeScale: 2.2, // spike noise frequency
    seedSpikeSpeed: 1.6, // spike noise speed
    seedGlow: 1.3, // core brightness
    seedFresnel: 2, // rim power
    seedFilament: 0.8, // 0..1 strength of the filaments crawling through the core
    seedFilamentScale: 2.4, // filament noise frequency
    seedCrawl: 1.2, // filament crawl speed
    seedFlicker: 14, // discharge re-rolls per second
    seedDissolveEdge: 0.12, // width of the burning lip as it dissolves
    shellScale: 1.45, // crackle shell radius (× seed)
    shellGlow: 0.8,
    shellOpacity: 0.7,
    colorSeedCore: '#ffffff', // white-hot filaments
    colorSeedBody: '#5b3cff', // saturated electric violet
    colorSeedRim: '#b7a6ff', // pale charge tint at the rim
    colorSeedDeep: '#0a0724', // the dark node the charge lives in
    seedDeep: 0.85, // 0..1 how much of the node's body is the deep stop
    shellHaze: 0.05, // the shell's even glassy film (the crackle lines are separate)

    /* crackle — short bolts snapping off the seed and re-striking */
    crackleCount: 6, // live crackle bolts round the seed (max 10)
    crackleReach: 1.1, // how far past the surface they reach (× seed radius)
    crackleRate: 9, // re-strikes per second
    crackleWidth: 0.1, // ribbon half-width, metres
    crackleJag: 0.35, // lateral jag (× seed radius)
    crackleGlow: 3.0,
    crackleOn: 0.7, // 0..1 share of crackles alight at any re-strike

    /* orbits — three broken gyroscope rings */
    orbitScale: 1.1, // ring radius (× seed)
    orbitSpeed: 0.8, // turns/second, each ring a little faster
    orbitGlow: 1.2,
    orbitOpacity: 0.8,
    orbitDashes: 3, // light dashes round each ring
    orbitDashSpeed: 1.5, // dash crawl speed

    /* corona — breathing points round the seed */
    coronaBreath: 2, // how far they breathe out (× seed)
    coronaRate: 0.6, // breaths per second
    coronaSize: 0.66,
    coronaGlow: 1,
    coronaOpacity: 1,

    /* ================================================================ */
    /* 2 · THE CHAIN (gameplay)                                          */
    /* ================================================================ */
    chainRadius: 5, // metres from the current anchor a hop can reach
    maxJumps: 4, // hops per cast, max 8
    jumpInterval: 0.22, // seconds between hops
    impulse: 5, // knockback on each struck target
    lift: 2.2, // upward kick on each struck target
    hitSpin: 0.8, // tumble on each struck target

    /* ================================================================ */
    /* 3 · THE ARCS                                                      */
    /* ================================================================ */
    arcLifetime: 0.55, // seconds one arc lingers after its strike
    arcSustain: 0.8, // 0..1 the standing channel each struck link keeps until the cast ends
    arcRestrike: 7, // re-strikes per second along the standing chain
    branchLength: 1.1, // metres, the side branch off the middle of each arc
    arcWidth: 0.26, // ribbon half-width, metres (branches are half)
    haloWidth: 0.24, // the vertical cross-ribbon's half-width, metres
    arcJag: 0.28, // metres of lateral jag
    arcJagFine: 0.12, // metres of fine kinks re-rolled each flicker
    channelArch: 0.7, // metres the first standing channel bows up mid-span
    channelArchStep: 0.32, // each later link bows this much higher, so they stack and read apart
    channelLift: 0.15, // metres each later link rides higher at its ends
    underWidth: 2.4, // dark under-stroke width (× channel width)
    underOpacity: 0.8, // how dark that bed is
    arcArch: 0.5, // metres the arc bows upward mid-span
    arcHeight: 1.05, // metres off the floor the arc runs at
    arcFlicker: 14, // re-shapes per second
    arcCore: 0.16, // white core width (× ribbon)
    arcGlow: 2.6,
    arcCrawl: 30, // speed brightness beads crawl down the bolt
    strikeTime: 0.08, // seconds of white return-stroke flare
    colorArcCore: '#ffffff',
    colorArcBody: '#a99cff',
    colorArcHalo: '#4a22d8',

    /* ================================================================ */
    /* 4 · SPARKS — streaks shed by the seed and sprayed at each hop     */
    /* ================================================================ */
    sparkTrail: 60, // per second while travelling
    sparkBurst: 26, // per hop
    sparkSize: 0.05,
    sparkSpeed: 7,
    sparkLife: 0.35,
    sparkStretch: 0.6,
    sparkGlow: 2.2,
    colorSparkA: '#ffffff',
    colorSparkB: '#bcd6ff',
    colorSparkC: '#6f7dff',
    colorSparkD: '#2a1f6b',

    /* ================================================================ */
    /* 5 · MOTES — ionised air drifting off the seed                     */
    /* ================================================================ */
    moteRate: 40, // per second
    moteSize: 0.09,
    moteSpeed: 0.6,
    moteLife: 0.9,
    moteRise: 0.6, // metres/second upward drift
    moteGlow: 1.4,
    colorMoteA: '#dbe9ff',
    colorMoteB: '#8fb2ff',
    colorMoteC: '#5b4cd8',
    colorMoteD: '#1b1640',

    /* ================================================================ */
    /* 6 · CINDERS — scorched grit kicked off the floor at each strike   */
    /* ================================================================ */
    cinderBurst: 14, // per hop (the detonation throws twice this)
    cinderSize: 0.05,
    cinderSpeed: 4,
    cinderLife: 0.9,
    cinderGravity: -12,
    colorCinderA: '#fff1d6',
    colorCinderB: '#8a7cff',
    colorCinderC: '#2d2a3a',
    colorCinderD: '#121018',

    /* ================================================================ */
    /* 7 · GROUND                                                        */
    /* ================================================================ */
    trackWidth: 0.55, // metres, half-width of the furrow the seed scores
    trackJag: 0.3, // metres the furrow's centreline wanders
    trackGlow: 2.2,
    trackCool: 0.6, // seconds a metre of furrow takes to cool to scorch
    trackOpacity: 0.9,
    colorTrackHot: '#cfe6ff',
    colorTrackWarm: '#6a5cff',
    colorTrackScorch: '#14121c',
    scorchRadius: 1.6, // metres, the burn under the detonation
    scorchLife: 2.4,
    markRadius: 1.4, // metres, the branching burn under each struck target
    markLife: 1.6,
    colorScorchA: '#221d36',
    colorScorchB: '#9ab8ff',

    /* ================================================================ */
    /* 8 · BEATS — bursts, shake and flash                               */
    /* ================================================================ */
    burstRadius: 1.6, // metres, the detonation's ionised filament shell
    burstIntensity: 1.4,
    burstOpacity: 0.05, // that shell's film: kept faint — the blast below carries the mass
    hopBurst: 0.9, // metres, the filament shell round each struck target
    hopBurstOpacity: 0.08,
    blastRadius: 2.2, // metres, the dark charge blast at the detonation
    hopBlast: 0.85, // metres, the smaller blast round each struck target
    blastLife: 0.6, // seconds a blast takes to swell and tear apart
    blastBillow: 0.28, // billow (× radius)
    blastOpacity: 0.9,
    blastFilament: 1, // white filaments over it
    blastGlow: 1.6,
    colorBlastBody: '#4a2ad8', // the blast's lit violet; its deep is colorSeedDeep
    hopScorchRadius: 1.1, // metres, the dark scorch left under each struck body
    colorHopScorchA: '#07050e',
    colorHopScorchB: '#5b3cff',
    shockRadius: 3.2, // metres, the detonation shockwave
    colorBurstA: '#ffffff',
    colorBurstB: '#8fb6ff',
    colorBurstC: '#4c3aff',
    impactShake: 0.1, // camera knock on detonation
    impactFlash: 0.1, // screen flash on detonation
    hopShake: 0.05, // camera knock per hop
    hopFlash: 0.04, // screen flash per hop
    colorFlash: '#b9d4ff',

    /* ================================================================ */
    /* 9 · DISTORTION                                                    */
    /* ================================================================ */
    warpStrength: 0.6,
    warpSize: 2.4, // metres across (× seed size)
    warpScale: 1.6, // crackle cell scale
    warpSpeed: 1, // crackle re-roll speed
    warpPunch: 1.2 // extra strength on each hop, decaying
  }
});

/** Quads per bolt — the branch anchors on the middle quad of its parent. */
const SECTIONS = ARC_SECTIONS;
/** Quads per crackle bolt. */
const CRACKLE_SECTIONS = 10;
/** Hard capacity: one arc, branch and halo mesh per possible hop. */
const MAX_JUMPS = 8;
/** Crackle bolts round the seed. */
const MAX_CRACKLE = 10;
/** Blasts: the detonation plus one per hop. */
const MAX_BLASTS = MAX_JUMPS + 1;
const TAU = Math.PI * 2;
const NO_TARGETS = Object.freeze([]);

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _target = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _s1 = new Vector3();
const _s2 = new Vector3();
const _pt = new Vector3();

/** Deterministic 0..1 hash: crackle and fine-jag dice re-rolled per tick. */
function hash(x) {
  const h = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * FULMINANT RELAY — a charged seed that relays itself between targets.
 *
 * The seed flies the cast line. Where the line ends it detonates, and from
 * that anchor it jumps to the nearest unstruck target in `chainRadius`, then
 * from that target to the next, every `jumpInterval`, up to `maxJumps` hops.
 * The seed *goes with* the current: it leaps to each new anchor, so the eye
 * follows one object through the whole chain rather than watching arcs pop
 * out of nowhere.
 *
 * Layers, each a folder in the editor:
 *
 *   1. **the seed** — an authored, pronged node (`createSeedGeometry`) under a
 *      ridged-spike / filament / fresnel shader, inside a crackle shell, three
 *      broken orbit rings with dashes crawling round them, and a corona of
 *      breathing points. It swells out of the hand (anticipation), spins as it
 *      flies, punches on every hop, and dissolves with a burning lip (exit).
 *      The node itself is drawn opaque on a four-stop charge ramp (white-hot
 *      filaments → pale violet rim → electric-violet body → near-black deep),
 *      so it has dark mass and reads as stored charge rather than ice in glass;
 *      **crackle** bolts snap off its surface and re-strike several times a
 *      second (`_drawCrackle`).
 *   2. **the arcs** — one bolt per hop, each a flat ribbon plus a vertical
 *      cross-ribbon so it reads at full width from above and from the side,
 *      and one side branch off its middle. Each owns its material, so every
 *      arc fades from its *own* strike time with a white return-stroke flare.
 *      A struck link then stays as a standing channel (`arcSustain`) that
 *      re-strikes (`arcRestrike`) until the cast ends, so the whole relay
 *      stands as one visible circuit through the bodies it has hit.
 *   3. **sparks** — STREAKs shed behind the seed in flight and sprayed off
 *      each struck target along the arc that reached it.
 *   4. **motes** — soft ionised motes drifting up off the seed.
 *   5. **cinders** — lit grit kicked off the floor at each strike.
 *   6. **the ground** — the furrow the seed scores into the floor as it flies
 *      (revealed under the seed, cooling from plasma to scorch metre by
 *      metre), a SCORCH under the detonation and a branching ARC burn under
 *      every target struck.
 *   7. **the beats** — a STORM shell and shockwave on detonation, a smaller
 *      shell per hop, camera knock, flash and light punch on both, all scaled
 *      by the globals.
 *   8. **distortion** — torn-air crackle round the seed on LAYER.DISTORTION,
 *      punched by every hop.
 *
 * ## Rules
 *
 * The hop records are pooled (`MAX_JUMPS` of them); targeting reuses one
 * result array. Seed spin is *integrated* so dragging `seedSpin` never snaps
 * it. Everything visual is resolved from `settings[ID]` every frame. The
 * chain itself is the original mechanic, untouched: same targets, same order,
 * same timing, same force.
 */
export class FulminantRelayAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** It picks its own targets one hop at a time. */
  get handlesOwnHits() {
    return true;
  }

  /** Hops struck so far. HUD readout only. */
  get instanceCount() {
    return this.hops.length;
  }

  get impactDuration() {
    return Math.max(0.3, Math.min(MAX_JUMPS, this.config.maxJumps) * this.config.jumpInterval + 0.3);
  }

  /** Purely visual linger, so it honours the global lifetime multiplier. */
  get fadeDuration() {
    return Math.max(0.2, this.config.lifetime * settings.global.lifetime);
  }

  /** An arc lamp gutters: quick, irregular dips. */
  lightShimmer() {
    const f = saturate(this.config.lightFlicker ?? 0);
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 23.7) * Math.sin(this.age * 7.9 + 1.1));
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the seed ---- */
    this.coreGeometry = createSeedGeometry(3);
    this.coreMaterial = createSeedMaterial('core');
    this.core = new Mesh(this.coreGeometry, this.coreMaterial);

    this.shellGeometry = new IcosahedronGeometry(1, 3);
    this.shellMaterial = createSeedMaterial('shell');
    this.shell = new Mesh(this.shellGeometry, this.shellMaterial);

    this.ringMaterial = createOrbitMaterial();
    this.ringGeometries = [];
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const geometry = createOrbitGeometry(i + 1);
      const ring = new Mesh(geometry, this.ringMaterial);
      this.ringGeometries.push(geometry);
      this.rings.push(ring);
    }

    this.coronaGeometry = createCoronaGeometry(96);
    this.coronaMaterial = createCoronaMaterial();
    this.corona = new Points(this.coronaGeometry, this.coronaMaterial);

    for (const object of [this.core, this.shell, ...this.rings, this.corona]) {
      object.layers.set(LAYER.VFX);
      object.frustumCulled = false;
      this.group.add(object);
    }
    // The crackle shell adds over the core, not under it.
    this.shell.renderOrder = 2;

    /* ---- layer 2: arcs, their branches and cross-ribbons ---- */
    this.arcs = [];
    this.branches = [];
    this.halos = [];
    for (let i = 0; i < MAX_JUMPS; i++) {
      const arc = new Mesh(createArcRibbon(SECTIONS), createBoltMaterial(i * 1.7));
      // A branch and a halo share their arc's material: they fade with it.
      const branch = new Mesh(createArcRibbon(SECTIONS), arc.material);
      const halo = new Mesh(createArcRibbon(SECTIONS), arc.material);
      for (const mesh of [arc, branch, halo]) {
        mesh.layers.set(LAYER.VFX);
        // World-space vertices written per frame: the bounds mean nothing.
        mesh.frustumCulled = false;
        mesh.visible = false;
        this.group.add(mesh);
      }
      this.arcs.push(arc);
      this.branches.push(branch);
      this.halos.push(halo);
    }

    /* ---- layer 2b: standing channels on every struck link ---- */
    this.channelMaterial = createBoltMaterial(9.1);
    this.channels = [];
    this.channelHalos = [];
    for (let i = 0; i < MAX_JUMPS; i++) {
      const channel = new Mesh(createArcRibbon(SECTIONS), this.channelMaterial);
      const halo = new Mesh(createArcRibbon(SECTIONS), this.channelMaterial);
      for (const mesh of [channel, halo]) {
        mesh.layers.set(LAYER.VFX);
        mesh.frustumCulled = false;
        mesh.visible = false;
        this.group.add(mesh);
      }
      this.channels.push(channel);
      this.channelHalos.push(halo);
    }

    /* ---- dark under-strokes beneath the standing channels ---- */
    this.underMaterial = createBoltUnderMaterial();
    this.unders = [];
    this.underHalos = [];
    for (let i = 0; i < MAX_JUMPS; i++) {
      const under = new Mesh(createArcRibbon(SECTIONS), this.underMaterial);
      const halo = new Mesh(createArcRibbon(SECTIONS), this.underMaterial);
      for (const mesh of [under, halo]) {
        mesh.layers.set(LAYER.VFX);
        mesh.frustumCulled = false;
        mesh.visible = false;
        mesh.renderOrder = -1;
        this.group.add(mesh);
      }
      this.unders.push(under);
      this.underHalos.push(halo);
    }

    /* ---- charge blasts: a dark violet mass per detonation and hop ---- */
    this.blastGeometry = new IcosahedronGeometry(1, 4);
    this.blasts = [];
    for (let i = 0; i < MAX_BLASTS; i++) {
      const mesh = new Mesh(this.blastGeometry, createBlastMaterial(i * 2.3 + 0.7));
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
      this.blasts.push({ mesh, time: -1, radius: 1, at: new Vector3() });
    }

    /* ---- layer 1b: crackle bolts snapping off the seed ---- */
    // One shared bolt material: they flare together on every re-strike.
    this.crackleMaterial = createBoltMaterial(4.2);
    this.crackles = [];
    this.crackleHalos = [];
    for (let i = 0; i < MAX_CRACKLE; i++) {
      const bolt = new Mesh(createArcRibbon(CRACKLE_SECTIONS), this.crackleMaterial);
      const halo = new Mesh(createArcRibbon(CRACKLE_SECTIONS), this.crackleMaterial);
      for (const mesh of [bolt, halo]) {
        mesh.layers.set(LAYER.VFX);
        mesh.frustumCulled = false;
        mesh.visible = false;
        mesh.renderOrder = 3;
        this.group.add(mesh);
      }
      this.crackles.push(bolt);
      this.crackleHalos.push(halo);
    }

    /* ---- layer 6: the furrow ---- */
    this.trackGeometry = createTrackGeometry(96, 6);
    this.trackMaterial = createTrackMaterial();
    this.track = new Mesh(this.trackGeometry, this.trackMaterial);
    this.track.layers.set(LAYER.VFX);
    this.track.frustumCulled = false;
    this.track.renderOrder = -1;
    this.group.add(this.track);

    /* ---- layer 8: the warp ---- */
    this.warpGeometry = createWarpQuad();
    this.warpMaterial = createRelayWarpMaterial();
    this.warp = new Mesh(this.warpGeometry, this.warpMaterial);
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.group.add(this.warp);

    // Every always-on seed-side object, listed once so spawn and destroy can
    // toggle them without building a fresh array each cast.
    this._seedParts = [this.core, this.shell, ...this.rings, this.corona, this.track, this.warp];

    /* ---- per-cast state, allocated once ---- */
    this.branchStart = new Vector3();
    this.branchEnd = new Vector3();
    this.hit = new Set();
    this.found = [];
    this.hops = [];
    /** Hop records, pooled. `hops` only ever holds references into this. */
    this._hopPool = [];
    for (let i = 0; i < MAX_JUMPS; i++) this._hopPool.push({ from: new Vector3(), to: new Vector3(), time: 0 });
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this.anchor = new Vector3();
    this.targetPoint = new Vector3();
    this.seedPosition = new Vector3();
    this.tmp = new Vector3();
    this.nextJump = 0;

    this._seed = 0;
    this._spin = 0;
    this._orbit = 0;
    this._reduced = false;
    this._pulse = 0;
    this._warpPulse = 0;
    this._trackAge = 0;
    this._reveal = 0;
    this._seedState = { seed: 0, charge: 1, pulse: 0, fade: 1, dissolve: 0, flicker: 14 };
    this._fadeState = { fade: 1, pixelRatio: 1 };
    this._trackState = {
      origin: this.origin,
      dir: this.direction,
      side: this.side,
      length: 1,
      reveal: 0,
      age: 0,
      pace: 0.05,
      fade: 1,
      seed: 0
    };
    this._warpState = { size: 1, strength: 0, seed: 0 };
  }

  createParticles() {
    const particles = this.ctx.particles;
    /* ---- layer 3: sparks ---- */
    this.sparkSystem =
      particles?.get?.(`${ID}.sparks`, {
        capacity: 900,
        shape: ParticleShape.STREAK,
        additive: true,
        stretch: true,
        softFade: 0.3
      }) ?? null;
    /* ---- layer 4: motes ---- */
    this.moteSystem =
      particles?.get?.(`${ID}.motes`, {
        capacity: 700,
        shape: ParticleShape.SOFT,
        additive: true,
        curl: true,
        softFade: 0.5
      }) ?? null;
    /* ---- layer 5: cinders ---- */
    this.cinderSystem =
      particles?.get?.(`${ID}.cinders`, {
        capacity: 500,
        shape: ParticleShape.CHIP,
        additive: false,
        lit: true,
        softFade: 0.2
      }) ?? null;
    if (this.sparkSystem) {
      const u = this.sparkSystem.uniforms;
      u.uSizeIn.value = 0.02;
      u.uFadeIn.value = 0.02;
      u.uFadeOut.value = 0.5;
      u.uEndSize.value = 0.3;
      u.uDrag.value = 2.2;
    }
    if (this.moteSystem) {
      const u = this.moteSystem.uniforms;
      u.uSizeIn.value = 0.15;
      u.uFadeIn.value = 0.15;
      u.uFadeOut.value = 0.5;
      u.uEndSize.value = 0.2;
      u.uDrag.value = 1.4;
    }
    if (this.cinderSystem) {
      const u = this.cinderSystem.uniforms;
      u.uSizeIn.value = 0.02;
      u.uFadeIn.value = 0.03;
      u.uFadeOut.value = 0.7;
      u.uEndSize.value = 0.8;
    }
    this.sparkEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = this.config;
    this.hit.clear();
    this.hops.length = 0;
    this.nextJump = 0;
    this.anchor.copy(this.origin);
    this.seedPosition.set(this.origin.x, c.seedHeight, this.origin.z);
    this.sparkEmitter.reset();
    this.moteEmitter.reset();

    // The one random thing a cast captures; everything else is per frame.
    this._seed = Math.random() * 100;
    this._spin = Math.random() * TAU;
    this._orbit = Math.random() * TAU;
    // Read once per cast: matchMedia allocates, and the answer never changes mid-cast.
    this._reduced = prefersReducedMotion();
    this._pulse = 0;
    this._warpPulse = 0;
    this._trackAge = 0;
    this._reveal = 0;

    for (let i = 0; i < MAX_JUMPS; i++) {
      this.arcs[i].visible = false;
      this.branches[i].visible = false;
      this.halos[i].visible = false;
      this.arcs[i].material.uniforms.uFade.value = 1;
      this.arcs[i].material.uniforms.uStrike.value = 0;
    }
    for (let i = 0; i < this._seedParts.length; i++) this._seedParts[i].visible = true;
    for (let i = 0; i < MAX_CRACKLE; i++) {
      this.crackles[i].visible = false;
      this.crackleHalos[i].visible = false;
    }
    for (let i = 0; i < MAX_JUMPS; i++) {
      this.channels[i].visible = false;
      this.channelHalos[i].visible = false;
      this.unders[i].visible = false;
      this.underHalos[i].visible = false;
    }
    for (let i = 0; i < MAX_BLASTS; i++) {
      this.blasts[i].mesh.visible = false;
      this.blasts[i].time = -1;
    }
    // Points are sized in device pixels; read the ratio once per cast.
    this._fadeState.pixelRatio = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

    // A crackle off the caster's hand as the seed is pulled out of it.
    this._sparks(this.seedPosition, this.direction, Math.round(c.sparkBurst * 0.4), 0.6);
    this._draw(0);
  }

  onTravel(dt) {
    const c = this.config;
    this.pointAt(this.u, this.anchor);
    this._reveal = this.front;
    this.seedPosition.set(this.anchor.x, c.seedHeight, this.anchor.z);

    /* sparks shed backward, motes left hanging in the air behind */
    const g = settings.global;
    const n = Math.round(this.sparkEmitter.tick(dt, c.sparkTrail * g.particleCount));
    if (n > 0) {
      _dir.copy(this.direction).multiplyScalar(-1).setY(0.25).normalize();
      this._sparks(this.seedPosition, _dir, n, 0.5);
    }
    this._motes(dt, 1);
    this._draw(dt);
  }

  onImpact() {
    const c = this.config;
    const g = settings.global;
    this.nextJump = 0;
    this._reveal = this.length;

    /* the detonation at the end of the line */
    _pos.copy(this.anchor).setY(c.seedHeight * 0.6);
    this.ctx.bursts?.spawn?.(BurstMode.STORM, _pos, {
      radius: c.size * 0.4,
      endRadius: c.burstRadius * g.explosionIntensity,
      life: 0.5,
      intensity: c.burstIntensity,
      opacity: c.burstOpacity,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this._blast(0, _pos.copy(this.anchor).setY(c.seedHeight * 0.7), c.blastRadius);
    _pos.copy(this.anchor).setY(0);
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _pos, {
      radius: c.scorchRadius,
      life: c.scorchLife,
      intensity: 1,
      colorA: getColor(c.colorScorchA),
      colorB: getColor(c.colorScorchB)
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: c.shockRadius * g.explosionIntensity,
      life: 0.5,
      width: 0.06,
      intensity: 0.7,
      colorA: getColor(c.colorBlastBody),
      colorB: getColor(c.colorBurstC)
    });
    this._cinders(_pos, Math.round(c.cinderBurst * 2), 1.3);
    this._sparks(this.seedPosition, null, c.sparkBurst, 1.2);

    this.lightBoost = c.impactLight * g.explosionIntensity;
    this._pulse = 1;
    this._warpPulse = 1;

    this.ctx.shake?.add?.(c.impactShake * g.cameraShake, 7, 22);
    this.ctx.flash?.trigger?.(this.lightColor.copy(getColor(c.colorFlash)), c.impactFlash * g.explosionIntensity);
  }

  onFade(dt, t) {
    if (t <= 1) {
      const elapsed = t * this.impactDuration;
      const limit = Math.min(MAX_JUMPS, Math.max(1, Math.floor(this.config.maxJumps)));
      while (this.hops.length < limit && elapsed >= this.nextJump) {
        if (!this._jump()) {
          this.nextJump = Infinity;
          break;
        }
        this.nextJump += Math.max(0.05, this.config.jumpInterval);
      }
    }
    this._trackAge += dt;
    this._motes(dt, this.phase === AbilityPhase.FADE ? 1 - saturate(t - 1) : 1);
    this._draw(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The chain (gameplay — unchanged)                                    */
  /* ------------------------------------------------------------------ */

  _jump() {
    const c = this.config;
    const found = this.ctx.dummies?.findTargets?.(this.anchor.x, this.anchor.z, c.chainRadius, this.found) ?? NO_TARGETS;
    // A target can reject a hit (for example it became untargetable since
    // the field query). Do not spend a hop or show a successful arc for it.
    let best = null;
    let dirX = 0;
    let dirZ = 0;
    this._force.impulse = c.impulse;
    this._force.lift = c.lift;
    this._force.spin = c.hitSpin ?? 0.8;
    for (let attempt = 0; attempt < found.length; attempt++) {
      let bestD = Infinity;
      best = null;
      for (const d of found) {
        if (this.hit.has(d) || d.alive === false || typeof d.kill !== 'function') continue;
        const dx = d.position.x - this.anchor.x;
        const dz = d.position.z - this.anchor.z;
        const dist = dx * dx + dz * dz;
        if (dist <= c.chainRadius ** 2 && dist < bestD) {
          best = d;
          bestD = dist;
        }
      }
      if (!best) return false;
      this.hit.add(best);
      this.targetPoint.copy(best.position);
      const dx = this.targetPoint.x - this.anchor.x;
      const dz = this.targetPoint.z - this.anchor.z;
      const len = Math.hypot(dx, dz);
      dirX = len > 1e-5 ? dx / len : this.direction.x;
      dirZ = len > 1e-5 ? dz / len : this.direction.z;
      if (best.kill(dirX, dirZ, this._force, false) !== false) break;
      best = null;
    }
    if (!best) return false;

    const index = this.hops.length;
    const hop = this._hopPool[index];
    hop.from.copy(this.anchor);
    hop.to.copy(this.targetPoint);
    hop.time = this.age;
    this._writeArc(this.arcs[index], hop.from, hop.to, index, c.arcWidth, this.halos[index]);
    this.arcs[index].visible = true;
    this.hops.push(hop);
    this.anchor.copy(this.targetPoint);
    this._hopBeat(hop, dirX, dirZ);
    return true;
  }

  /** The visual beat of a landed hop: shell, burn, spray, knock, flash, light. */
  _hopBeat(hop, dirX, dirZ) {
    const c = this.config;
    const g = settings.global;
    _target.copy(hop.to).setY(c.arcHeight);
    this.ctx.bursts?.spawn?.(BurstMode.STORM, _target, {
      radius: 0.15,
      endRadius: c.hopBurst * g.explosionIntensity,
      life: 0.35,
      intensity: c.burstIntensity * 0.8,
      opacity: c.hopBurstOpacity,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this._blast(this.hops.length, _target, c.hopBlast);
    _pos.copy(hop.to).setY(0);
    // A dark scorch under the body it struck, then the branching burn over it.
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _pos, {
      radius: c.hopScorchRadius,
      life: c.scorchLife,
      intensity: 1,
      colorA: getColor(c.colorHopScorchA),
      colorB: getColor(c.colorHopScorchB)
    });
    this.ctx.decals?.spawn?.(DecalType.ARC, _pos, {
      radius: c.markRadius,
      life: c.markLife,
      intensity: 1,
      colorA: getColor(c.colorScorchA),
      colorB: getColor(c.colorScorchB)
    });
    // Sprayed on through the target, along the arc that reached it.
    _dir.set(dirX, 0.35, dirZ).normalize();
    this._sparks(_target, _dir, c.sparkBurst, 1);
    this._cinders(_pos, c.cinderBurst, 1);

    this.lightBoost = Math.max(this.lightBoost, c.hopLight * g.explosionIntensity);
    this._pulse = 1;
    this._warpPulse = 1;
    if (c.hopShake > 0) this.ctx.shake?.add?.(c.hopShake * g.cameraShake, 9, 26);
    if (c.hopFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorFlash), c.hopFlash * g.explosionIntensity);
  }

  /* ------------------------------------------------------------------ */
  /* Drawing                                                             */
  /* ------------------------------------------------------------------ */

  _draw(dt) {
    const c = this.config;
    const g = settings.global;

    /* --- the seed follows the chain --- */
    if (this.phase !== AbilityPhase.TRAVEL && dt > 0) {
      const k = 1 - Math.exp(-Math.max(0.1, c.seedLeap) * dt);
      _target.set(this.anchor.x, c.seedHeight, this.anchor.z);
      this.seedPosition.lerp(_target, k);
    }
    this._spin += c.seedSpin * TAU * dt * g.animationSpeed;
    this._orbit += c.orbitSpeed * TAU * dt * g.animationSpeed;
    this._pulse = Math.max(0, this._pulse - dt * 5);
    this._warpPulse = Math.max(0, this._warpPulse - dt * 4);

    // Anticipation: the seed swells out of the hand with an overshoot.
    const charge = Easing.outBack(saturate(this.age / Math.max(0.01, c.chargeTime)));
    let fade = 1;
    let dissolve = 0;
    if (this.phase === AbilityPhase.FADE) {
      const ft = saturate(this.fadeTime / this.fadeDuration);
      fade = 1 - Easing.inCubic(ft);
      dissolve = Easing.inQuad(ft);
    }
    const scale = c.size * Math.max(0.001, charge) * (1 + this._pulse * 0.25);

    const seed = this.seedPosition;
    this.core.position.copy(seed);
    this.core.scale.setScalar(scale);
    this.core.rotation.set(this._spin * 0.7, this._spin, this._spin * 0.4);
    this.shell.position.copy(seed);
    this.shell.scale.setScalar(scale * c.shellScale * (1 + 0.04 * Math.sin(this.age * 31)));
    this.shell.rotation.y = -this._spin * 0.6;
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      const turn = this._orbit * (1 + i * 0.35);
      ring.position.copy(seed);
      ring.scale.setScalar(scale * c.orbitScale * (1 + i * 0.12));
      ring.rotation.set(turn * 0.8 + i * 1.1, turn * 0.5 + i * 0.8, i * 0.5);
    }
    this.corona.position.copy(seed);
    this.corona.scale.setScalar(scale);

    // Reduced motion keeps the discharge but stops it strobing.
    const flicker = this._reduced ? Math.min(3, c.seedFlicker) : c.seedFlicker;
    const ss = this._seedState;
    ss.seed = this._seed;
    ss.charge = saturate(charge);
    ss.pulse = this._pulse;
    ss.fade = fade;
    ss.dissolve = dissolve;
    ss.flicker = flicker;
    this.coreMaterial.userData.sync(c, ss);
    this.shellMaterial.userData.sync(c, ss);
    this._fadeState.fade = fade * saturate(charge);
    this.ringMaterial.userData.sync(c, this._fadeState);
    this.coronaMaterial.userData.sync(c, this._fadeState);

    /* --- the arcs, each on its own clock --- */
    const life = Math.max(0.1, c.arcLifetime);
    const restrikeRate = this._reduced ? Math.min(2, c.arcRestrike) : c.arcRestrike;
    const restrikeClock = this.age * restrikeRate;
    const restrikeTick = Math.floor(restrikeClock);
    const sustain = saturate(c.arcSustain) * fade;
    this.underMaterial.userData.sync(c, sustain);
    this._drawBlasts();
    {
      const u = this.channelMaterial.uniforms;
      this.channelMaterial.userData.sync(c);
      u.uFade.value = sustain;
      u.uStrike.value = (1 - (restrikeClock - restrikeTick)) * 0.6;
    }
    for (let i = 0; i < this.hops.length; i++) {
      const hop = this.hops[i];
      const arc = this.arcs[i];
      const since = this.age - hop.time;
      const opacity = Math.max(0, 1 - since / life);
      arc.visible = opacity > 0;
      const u = arc.material.uniforms;
      // Eased so an arc holds bright, then drains — but still strictly falling.
      u.uFade.value = opacity * (0.5 + 0.5 * opacity);
      u.uStrike.value = Math.max(0, 1 - since / Math.max(0.01, c.strikeTime));

      // The struck link does not simply go out: a standing channel (its own
      // mesh, so the strike above still drains on its own clock) stays on the
      // link until the cast ends and re-strikes on its own dice, so the relay
      // reads as one circuit run through the bodies.
      const channel = this.channels[i];
      const channelHalo = this.channelHalos[i];
      const lit = sustain > 0.003 && since > 0 && hash(restrikeTick * 1.7 + i * 9.3) > 0.15;
      channel.visible = lit;
      channelHalo.visible = lit && c.haloWidth > 0;
      // Every standing link bows a step higher than the one before it, so the
      // circuit fans out in height and each link reads from a low camera.
      const arch = c.channelArch + c.channelArchStep * i;
      const lift = c.channelLift * i;
      const under = this.unders[i];
      const underHalo = this.underHalos[i];
      const bed = sustain > 0.003 && since > 0 && c.underOpacity > 0;
      under.visible = bed;
      underHalo.visible = bed && c.haloWidth > 0;
      if (lit) this._writeArc(channel, hop.from, hop.to, i * 5 + 31, c.arcWidth * 0.75, channelHalo, arch, lift);
      // The dark bed under it: same centreline (same index and flicker), wider.
      if (bed) this._writeArc(under, hop.from, hop.to, i * 5 + 31, c.arcWidth * 0.75 * c.underWidth, underHalo, arch, lift, c.haloWidth * c.underWidth);
      arc.material.userData.sync(c);
      const branch = this.branches[i];
      const halo = this.halos[i];
      branch.visible = arc.visible && c.branchLength > 0;
      halo.visible = arc.visible && c.haloWidth > 0;
      if (arc.visible) {
        this._writeArc(arc, hop.from, hop.to, i, c.arcWidth, halo);
        if (branch.visible) this._writeBranch(i, hop, arc, branch);
      }
    }

    this._drawCrackle(seed, scale, fade * saturate(charge));

    /* --- the furrow --- */
    const ts = this._trackState;
    ts.length = this.length;
    ts.reveal = this._reveal;
    ts.age = this._trackAge;
    ts.pace = 1 / Math.max(0.5, c.speed * g.speed);
    ts.seed = this._seed;
    ts.fade = this.phase === AbilityPhase.FADE ? 1 - saturate(this.fadeTime / this.fadeDuration) : 1;
    this.trackMaterial.userData.sync(c, ts);

    /* --- the warp --- */
    const ws = this._warpState;
    ws.size = scale * c.warpSize;
    ws.strength = fade * saturate(charge) * (0.5 + this._warpPulse * c.warpPunch);
    ws.seed = this._seed;
    this.warpMaterial.userData.sync(c, ws);
    this.warp.position.copy(seed);

    this._syncParticles();
    this.position.copy(seed);
  }

  _writeBranch(index, hop, arc, branch) {
    const c = this.config;
    const position = arc.geometry.attributes.position;
    const middle = SECTIONS;
    // The branch's own writer adds `arcHeight` back at its root, so the root
    // lands exactly on the middle of the parent arc.
    this.branchStart.set(
      (position.getX(middle) + position.getX(middle + 1)) * 0.5,
      (position.getY(middle) + position.getY(middle + 1)) * 0.5 - c.arcHeight,
      (position.getZ(middle) + position.getZ(middle + 1)) * 0.5
    );
    let dx = hop.to.x - hop.from.x;
    let dz = hop.to.z - hop.from.z;
    let len = Math.hypot(dx, dz);
    if (len < 1e-5) {
      // A target under the seed: branch across the cast line instead.
      dx = this.direction.x;
      dz = this.direction.z;
      len = 1;
    }
    const sign = index % 2 ? 1 : -1;
    this.branchEnd.set(
      this.branchStart.x + sign * (-dz / len) * c.branchLength,
      this.branchStart.y - 0.2,
      this.branchStart.z + sign * (dx / len) * c.branchLength
    );
    this._writeArc(branch, this.branchStart, this.branchEnd, index + 11, c.arcWidth * 0.5);
  }

  /**
   * Write one bolt's ribbon between two floor points.
   *
   * The centreline is the straight span bowed upward by `arcArch`, jagged
   * sideways and vertically by two incommensurate sines whose phase steps with
   * `arcFlicker` — so it re-shapes in jumps like a real channel, and the
   * `sin(πt)` envelope pins both ends exactly to the targets.
   *
   * @param {Mesh} [halo] optional cross-ribbon written on the same centreline,
   *   offset vertically instead of sideways
   */
  _writeArc(mesh, from, to, index, width = 0.08, halo = null, archOverride = null, lift = 0, haloOverride = null) {
    const c = this.config;
    const arcArch = archOverride ?? c.arcArch;
    const p = mesh.geometry.attributes.position;
    const h = halo ? halo.geometry.attributes.position : null;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    const sx = len > 1e-5 ? -dz / len : 1;
    const sz = len > 1e-5 ? dx / len : 0;
    const rate = this._reduced ? Math.min(3, c.arcFlicker) : c.arcFlicker;
    const flicker = Math.floor(this.age * rate);
    const jagAmp = c.arcJag * settings.global.noiseStrength;
    const fineAmp = (c.arcJagFine ?? 0) * settings.global.noiseStrength;
    const haloWidth = haloOverride ?? c.haloWidth;
    for (let i = 0; i <= SECTIONS; i++) {
      const t = i / SECTIONS;
      const wave = Math.sin(Math.PI * t);
      // Two broad sines for the channel's wander, plus fine kinks re-rolled
      // per flicker so it reads as a bolt and not a bent wire.
      const kink = i > 0 && i < SECTIONS ? (hash(i * 3.1 + index * 17.7 + flicker * 0.61) - 0.5) * 2 * fineAmp : 0;
      const jag = (Math.sin(i * 7.13 + index * 3.7 + flicker) + Math.sin(i * 3.31 + index - flicker * 1.7)) * wave * jagAmp + kink;
      const x = from.x + dx * t + sx * jag;
      const z = from.z + dz * t + sz * jag;
      const y =
        c.arcHeight + lift + from.y * (1 - t) + to.y * t + Math.sin(t * Math.PI) * arcArch + Math.sin(i * 4.2 + index) * wave * jagAmp * 0.75 + kink * 0.6;
      p.setXYZ(i * 2, x - sx * width, y, z - sz * width);
      p.setXYZ(i * 2 + 1, x + sx * width, y, z + sz * width);
      if (h) {
        h.setXYZ(i * 2, x, y - haloWidth, z);
        h.setXYZ(i * 2 + 1, x, y + haloWidth, z);
      }
    }
    p.needsUpdate = true;
    if (h) h.needsUpdate = true;
  }

  /** Start blast `slot` at `at`, swelling to `radius` metres. */
  _blast(slot, at, radius) {
    const b = this.blasts[Math.min(MAX_BLASTS - 1, slot)];
    b.time = this.age;
    b.radius = radius * settings.global.explosionIntensity;
    b.at.copy(at);
  }

  /** The charge blasts: swell fast (outCubic), billow, tear apart. */
  _drawBlasts() {
    const c = this.config;
    const life = Math.max(0.05, c.blastLife);
    for (let i = 0; i < MAX_BLASTS; i++) {
      const b = this.blasts[i];
      const t = b.time < 0 ? 1 : (this.age - b.time) / life;
      const on = b.time >= 0 && t < 1;
      b.mesh.visible = on;
      if (!on) continue;
      const grow = Easing.outCubic(saturate(t));
      b.mesh.position.copy(b.at);
      b.mesh.scale.setScalar(Math.max(0.01, b.radius * (0.25 + 0.75 * grow)));
      b.mesh.rotation.y = this._seed + t * 0.6;
      b.mesh.material.userData.sync(c, saturate(t));
    }
  }

  /**
   * Crackle: short jagged bolts snapping off the seed's surface into the air
   * round it. Each re-strike rolls a new root bearing and a new tip; only a
   * share of them are alight on any strike, so the node visibly *discharges*
   * instead of wearing a fixed halo. Dice are hashed from the strike tick, so
   * nothing is stored and nothing is allocated.
   */
  _drawCrackle(seed, scale, strength) {
    const c = this.config;
    const count = Math.min(MAX_CRACKLE, Math.max(0, Math.round(c.crackleCount)));
    const rate = this._reduced ? Math.min(3, c.crackleRate) : c.crackleRate;
    const clock = this.age * rate;
    const tick = Math.floor(clock);
    const flare = 1 - (clock - tick);
    const mu = this.crackleMaterial.uniforms;
    mu.uFade.value = strength;
    mu.uStrike.value = flare;
    this.crackleMaterial.userData.sync(c);
    mu.uGlow.value = c.crackleGlow * settings.global.glow;
    const width = c.crackleWidth;
    const jag = c.crackleJag * scale * settings.global.noiseStrength;
    for (let k = 0; k < MAX_CRACKLE; k++) {
      const bolt = this.crackles[k];
      const halo = this.crackleHalos[k];
      const roll = tick * 13.37 + k * 7.91 + this._seed;
      const lit = k < count && strength > 0.01 && hash(roll + 0.5) < c.crackleOn;
      bolt.visible = lit;
      halo.visible = lit;
      if (!lit) continue;
      // Root on the surface, tip out past it on a bent bearing.
      const th = hash(roll) * TAU;
      const ph = Math.acos(2 * hash(roll + 1.3) - 1);
      _a.set(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
      _b.set(_a.x + (hash(roll + 2.1) - 0.5), _a.y + (hash(roll + 3.7) - 0.5) * 0.6, _a.z + (hash(roll + 4.9) - 0.5)).normalize();
      const reach = scale * (1 + c.crackleReach * (0.6 + 0.4 * hash(roll + 5.5)));
      _a.multiplyScalar(scale * 0.75).add(seed);
      _b.multiplyScalar(reach).add(seed);
      // Two sides across the bolt, for the flat ribbon and its cross-ribbon.
      _dir.subVectors(_b, _a);
      const len = Math.max(1e-4, _dir.length());
      _dir.multiplyScalar(1 / len);
      _s1.set(-_dir.z, 0, _dir.x);
      if (_s1.lengthSq() < 1e-6) _s1.set(1, 0, 0);
      _s1.normalize();
      _s2.crossVectors(_dir, _s1).normalize();
      const p = bolt.geometry.attributes.position;
      const h = halo.geometry.attributes.position;
      for (let i = 0; i <= CRACKLE_SECTIONS; i++) {
        const t = i / CRACKLE_SECTIONS;
        const env = Math.sin(Math.PI * t) * (i === CRACKLE_SECTIONS ? 0 : 1);
        const j1 = (hash(roll + i * 1.91) - 0.5) * 2 * jag * env;
        const j2 = (hash(roll + i * 2.73 + 9.1) - 0.5) * 2 * jag * env;
        _pt.copy(_a).lerp(_b, t).addScaledVector(_s1, j1).addScaledVector(_s2, j2);
        // Tapers to a point at the tip.
        const w = width * (1 - t * 0.85);
        p.setXYZ(i * 2, _pt.x - _s1.x * w, _pt.y - _s1.y * w, _pt.z - _s1.z * w);
        p.setXYZ(i * 2 + 1, _pt.x + _s1.x * w, _pt.y + _s1.y * w, _pt.z + _s1.z * w);
        h.setXYZ(i * 2, _pt.x - _s2.x * w, _pt.y - _s2.y * w, _pt.z - _s2.z * w);
        h.setXYZ(i * 2 + 1, _pt.x + _s2.x * w, _pt.y + _s2.y * w, _pt.z + _s2.z * w);
      }
      p.needsUpdate = true;
      h.needsUpdate = true;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Particles                                                           */
  /* ------------------------------------------------------------------ */

  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    if (this.sparkSystem) {
      const u = this.sparkSystem.uniforms;
      this.sparkSystem.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
      u.uStretch.value = c.sparkStretch;
      u.uGlow.value = c.sparkGlow * g.glow;
      u.uOpacity.value = g.opacity;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
      u.uGravity.value.set(0, -2, 0);
      u.uTurbulence.value = 0.2 * g.turbulence;
    }
    if (this.moteSystem) {
      const u = this.moteSystem.uniforms;
      this.moteSystem.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
      u.uGlow.value = c.moteGlow * g.glow;
      u.uOpacity.value = g.opacity;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
      u.uGravity.value.set(0, c.moteRise, 0);
      u.uTurbulence.value = 0.8 * g.turbulence;
    }
    if (this.cinderSystem) {
      const u = this.cinderSystem.uniforms;
      this.cinderSystem.setGradient(getColor(c.colorCinderA), getColor(c.colorCinderB), getColor(c.colorCinderC), getColor(c.colorCinderD));
      u.uOpacity.value = g.opacity;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
      u.uGravity.value.set(0, c.cinderGravity, 0);
      u.uTurbulence.value = 0.1 * g.turbulence;
    }
  }

  /** A spray of streaks. `direction` null sprays in every direction. */
  _sparks(position, direction, count, speedScale) {
    if (!this.sparkSystem) return;
    const c = this.config;
    const n = Math.min(160, Math.max(0, Math.round(count * settings.global.particleCount)));
    if (n <= 0) return;
    _emit.position = position;
    _emit.radius = c.size * 0.3;
    _emit.direction = direction;
    _emit.speed = c.sparkSpeed * speedScale;
    _emit.speedVariance = 0.5;
    _emit.spread = direction ? 0.55 : 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.sparkSize;
    _emit.sizeVariance = 0.5;
    _emit.life = c.sparkLife;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.sparkSystem.emit(n, _emit);
  }

  _motes(dt, strength) {
    if (!this.moteSystem || dt <= 0) return;
    const c = this.config;
    const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength * settings.global.particleCount));
    if (n <= 0) return;
    _emit.position = this.seedPosition;
    _emit.radius = c.size * 0.9;
    _emit.direction = null;
    _emit.speed = c.moteSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.moteSize;
    _emit.sizeVariance = 0.5;
    _emit.life = c.moteLife;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0.5;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.moteSystem.emit(n, _emit);
  }

  _cinders(position, count, speedScale) {
    if (!this.cinderSystem) return;
    const c = this.config;
    const n = Math.min(96, Math.max(0, Math.round(count * settings.global.particleCount)));
    if (n <= 0) return;
    _pos.copy(position).setY(0.1);
    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _dir.set(0, 1, 0);
    _emit.speed = c.cinderSpeed * speedScale;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.7;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.cinderSize;
    _emit.sizeVariance = 0.6;
    _emit.life = c.cinderLife;
    _emit.lifeVariance = 0.4;
    _emit.spin = 8;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.cinderSystem.emit(n, _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.hit.clear();
    this.hops.length = 0;
    this._pulse = 0;
    this._warpPulse = 0;
    for (let i = 0; i < MAX_JUMPS; i++) {
      this.arcs[i].visible = false;
      this.branches[i].visible = false;
      this.halos[i].visible = false;
    }
    for (let i = 0; i < this._seedParts.length; i++) this._seedParts[i].visible = false;
    for (let i = 0; i < MAX_CRACKLE; i++) {
      this.crackles[i].visible = false;
      this.crackleHalos[i].visible = false;
    }
    for (let i = 0; i < MAX_JUMPS; i++) {
      this.channels[i].visible = false;
      this.channelHalos[i].visible = false;
      this.unders[i].visible = false;
      this.underHalos[i].visible = false;
    }
    for (let i = 0; i < MAX_BLASTS; i++) {
      this.blasts[i].mesh.visible = false;
      this.blasts[i].time = -1;
    }
  }

  dispose() {
    for (let i = 0; i < MAX_JUMPS; i++) {
      this.arcs[i].geometry.dispose();
      this.arcs[i].material.dispose();
      this.branches[i].geometry.dispose();
      this.halos[i].geometry.dispose();
    }
    for (const geometry of this.ringGeometries) geometry.dispose();
    for (let i = 0; i < MAX_CRACKLE; i++) {
      this.crackles[i].geometry.dispose();
      this.crackleHalos[i].geometry.dispose();
    }
    this.crackleMaterial.dispose();
    for (let i = 0; i < MAX_JUMPS; i++) {
      this.channels[i].geometry.dispose();
      this.channelHalos[i].geometry.dispose();
    }
    this.channelMaterial.dispose();
    for (let i = 0; i < MAX_JUMPS; i++) {
      this.unders[i].geometry.dispose();
      this.underHalos[i].geometry.dispose();
    }
    this.underMaterial.dispose();
    for (let i = 0; i < MAX_BLASTS; i++) this.blasts[i].mesh.material.dispose();
    this.blastGeometry.dispose();
    for (const resource of [
      this.coreGeometry,
      this.coreMaterial,
      this.shellGeometry,
      this.shellMaterial,
      this.ringMaterial,
      this.coronaGeometry,
      this.coronaMaterial,
      this.trackGeometry,
      this.trackMaterial,
      this.warpGeometry,
      this.warpMaterial
    ])
      resource.dispose();
    // The particle systems belong to the shared ParticleEngine.
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
  const folder = gui.addFolder('⚡  Fulminant Relay');
  const R = Editor.range;

  const cast = section(folder, 'The cast');
  R(cast, c, 'range', 4, 48, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'seed speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 4, 0.05, 'dissolve time (s)');
  R(cast, c, 'cooldown', 0, 20, 0.05, 'cooldown');
  if (Editor.castAnimation) Editor.castAnimation(cast, c);

  const light = section(folder, 'Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'gutter');
  R(light, c, 'hopLight', 0, 30, 0.1, 'punch per hop');
  R(light, c, 'impactLight', 0, 30, 0.1, 'punch on detonation');

  const seed = section(folder, '1 · Seed');
  R(seed, c, 'size', 0.2, 2, 0.05, 'seed size');
  R(seed, c, 'seedHeight', 0.2, 3, 0.05, 'flight height (m)');
  R(seed, c, 'chargeTime', 0.01, 0.6, 0.01, 'swell-up time (s)');
  R(seed, c, 'seedSpin', -2, 2, 0.01, 'spin (turns/s)');
  R(seed, c, 'seedLeap', 1, 60, 0.5, 'leap to next target');
  R(seed, c, 'seedSpike', 0, 1, 0.01, 'charge spikes');
  R(seed, c, 'seedSpikeScale', 0.2, 8, 0.05, 'spike scale');
  R(seed, c, 'seedSpikeSpeed', 0, 8, 0.05, 'spike speed');
  R(seed, c, 'seedGlow', 0, 6, 0.01, 'core glow');
  R(seed, c, 'seedFresnel', 0.2, 6, 0.05, 'rim power');
  R(seed, c, 'seedFilament', 0, 1, 0.01, 'filaments');
  R(seed, c, 'seedFilamentScale', 0.2, 8, 0.05, 'filament scale');
  R(seed, c, 'seedCrawl', 0, 6, 0.05, 'filament crawl');
  R(seed, c, 'seedFlicker', 0, 40, 0.5, 'discharge re-rolls/s');
  R(seed, c, 'seedDissolveEdge', 0.01, 0.5, 0.01, 'dissolve lip');
  R(seed, c, 'shellScale', 1, 3, 0.01, 'shell radius (× seed)');
  R(seed, c, 'shellGlow', 0, 4, 0.01, 'shell glow');
  R(seed, c, 'shellOpacity', 0, 1, 0.01, 'shell opacity');
  seed.addColor(c, 'colorSeedCore').name('core');
  seed.addColor(c, 'colorSeedBody').name('body');
  seed.addColor(c, 'colorSeedRim').name('rim');
  seed.addColor(c, 'colorSeedDeep').name('deep');
  R(seed, c, 'seedDeep', 0, 1, 0.01, 'dark body');
  R(seed, c, 'shellHaze', 0, 0.6, 0.01, 'shell film');
  const crackle = section(seed, 'Crackle');
  R(crackle, c, 'crackleCount', 0, MAX_CRACKLE, 1, 'bolts');
  R(crackle, c, 'crackleReach', 0, 3, 0.01, 'reach (× seed)');
  R(crackle, c, 'crackleRate', 0, 30, 0.5, 're-strikes/s');
  R(crackle, c, 'crackleWidth', 0.005, 0.3, 0.005, 'width (m)');
  R(crackle, c, 'crackleJag', 0, 1, 0.01, 'jag (× seed)');
  R(crackle, c, 'crackleGlow', 0, 8, 0.01, 'glow');
  R(crackle, c, 'crackleOn', 0, 1, 0.01, 'share alight');
  const orbits = section(seed, 'Orbits');
  R(orbits, c, 'orbitScale', 0.5, 3, 0.01, 'radius (× seed)');
  R(orbits, c, 'orbitSpeed', -4, 4, 0.01, 'turns/s');
  R(orbits, c, 'orbitGlow', 0, 6, 0.01, 'glow');
  R(orbits, c, 'orbitOpacity', 0, 1, 0.01, 'opacity');
  R(orbits, c, 'orbitDashes', 1, 8, 1, 'dashes per ring');
  R(orbits, c, 'orbitDashSpeed', -6, 6, 0.05, 'dash speed');
  const corona = section(seed, 'Corona');
  R(corona, c, 'coronaBreath', 0, 6, 0.05, 'breath (× seed)');
  R(corona, c, 'coronaRate', 0, 4, 0.01, 'breaths/s');
  R(corona, c, 'coronaSize', 0.05, 3, 0.01, 'point size');
  R(corona, c, 'coronaGlow', 0, 6, 0.01, 'glow');
  R(corona, c, 'coronaOpacity', 0, 1, 0.01, 'opacity');

  const chain = section(folder, '2 · Chain');
  R(chain, c, 'chainRadius', 1, 10, 0.1, 'jump radius');
  R(chain, c, 'maxJumps', 1, 8, 1, 'maximum jumps');
  R(chain, c, 'jumpInterval', 0.1, 1, 0.05, 'jump interval');
  R(chain, c, 'impulse', 0, 15, 0.1, 'impact force');
  R(chain, c, 'lift', 0, 8, 0.1, 'impact lift');
  R(chain, c, 'hitSpin', 0, 4, 0.05, 'impact tumble');

  const arcs = section(folder, '3 · Arcs');
  R(arcs, c, 'arcLifetime', 0.1, 2, 0.05, 'arc lifetime');
  R(arcs, c, 'arcSustain', 0, 1, 0.01, 'standing channel');
  R(arcs, c, 'arcRestrike', 0, 30, 0.5, 're-strikes/s');
  R(arcs, c, 'arcJagFine', 0, 0.5, 0.005, 'fine kinks (m)');
  R(arcs, c, 'channelArch', 0, 3, 0.01, 'standing arch (m)');
  R(arcs, c, 'channelArchStep', 0, 1.5, 0.01, 'arch step per link (m)');
  R(arcs, c, 'channelLift', 0, 1, 0.01, 'lift per link (m)');
  R(arcs, c, 'underWidth', 1, 6, 0.05, 'dark bed width (×)');
  R(arcs, c, 'underOpacity', 0, 1, 0.01, 'dark bed opacity');
  R(arcs, c, 'branchLength', 0, 3, 0.05, 'branch length');
  R(arcs, c, 'arcWidth', 0.01, 0.4, 0.005, 'ribbon width (m)');
  R(arcs, c, 'haloWidth', 0, 0.4, 0.005, 'cross-ribbon width (m)');
  R(arcs, c, 'arcJag', 0, 0.8, 0.01, 'jag (m)');
  R(arcs, c, 'arcArch', 0, 2, 0.01, 'arch (m)');
  R(arcs, c, 'arcHeight', 0.1, 3, 0.01, 'height (m)');
  R(arcs, c, 'arcFlicker', 0, 40, 0.5, 're-shapes/s');
  R(arcs, c, 'arcCore', 0.05, 1, 0.01, 'core width');
  R(arcs, c, 'arcGlow', 0, 8, 0.01, 'glow');
  R(arcs, c, 'arcCrawl', 0, 80, 0.5, 'bead crawl');
  R(arcs, c, 'strikeTime', 0.01, 0.4, 0.005, 'return-stroke flare (s)');
  arcs.addColor(c, 'colorArcCore').name('core');
  arcs.addColor(c, 'colorArcBody').name('body');
  arcs.addColor(c, 'colorArcHalo').name('halo');

  const sparks = section(folder, '4 · Sparks');
  R(sparks, c, 'sparkTrail', 0, 300, 1, 'trail per second');
  R(sparks, c, 'sparkBurst', 0, 120, 1, 'per hop');
  R(sparks, c, 'sparkSize', 0.005, 0.3, 0.005, 'width');
  R(sparks, c, 'sparkSpeed', 0, 30, 0.1, 'speed');
  R(sparks, c, 'sparkLife', 0.05, 2, 0.01, 'lifetime');
  R(sparks, c, 'sparkStretch', 0, 1, 0.01, 'stretch');
  R(sparks, c, 'sparkGlow', 0, 6, 0.01, 'glow');
  gradient(sparks, c, 'colorSpark', 'spark gradient', Editor);

  const motes = section(folder, '5 · Motes');
  R(motes, c, 'moteRate', 0, 300, 1, 'per second');
  R(motes, c, 'moteSize', 0.01, 0.5, 0.005, 'size');
  R(motes, c, 'moteSpeed', 0, 6, 0.05, 'speed');
  R(motes, c, 'moteLife', 0.1, 4, 0.05, 'lifetime');
  R(motes, c, 'moteRise', -2, 4, 0.05, 'rise (m/s)');
  R(motes, c, 'moteGlow', 0, 6, 0.01, 'glow');
  gradient(motes, c, 'colorMote', 'mote gradient', Editor);

  const cinders = section(folder, '6 · Cinders');
  R(cinders, c, 'cinderBurst', 0, 60, 1, 'per hop');
  R(cinders, c, 'cinderSize', 0.005, 0.3, 0.005, 'size');
  R(cinders, c, 'cinderSpeed', 0, 16, 0.1, 'speed');
  R(cinders, c, 'cinderLife', 0.1, 4, 0.05, 'lifetime');
  R(cinders, c, 'cinderGravity', -30, 0, 0.1, 'gravity');
  gradient(cinders, c, 'colorCinder', 'cinder gradient', Editor);

  const ground = section(folder, '7 · Ground');
  R(ground, c, 'trackWidth', 0.05, 2, 0.01, 'furrow width (m)');
  R(ground, c, 'trackJag', 0, 1.5, 0.01, 'furrow wander (m)');
  R(ground, c, 'trackGlow', 0, 8, 0.01, 'furrow glow');
  R(ground, c, 'trackCool', 0.05, 4, 0.01, 'cooling time (s)');
  R(ground, c, 'trackOpacity', 0, 1, 0.01, 'furrow opacity');
  ground.addColor(c, 'colorTrackHot').name('furrow hot');
  ground.addColor(c, 'colorTrackWarm').name('furrow warm');
  ground.addColor(c, 'colorTrackScorch').name('furrow scorch');
  R(ground, c, 'scorchRadius', 0, 6, 0.05, 'detonation scorch (m)');
  R(ground, c, 'scorchLife', 0.1, 8, 0.05, 'scorch life');
  R(ground, c, 'markRadius', 0, 5, 0.05, 'hop burn (m)');
  R(ground, c, 'hopScorchRadius', 0, 4, 0.05, 'hop scorch (m)');
  ground.addColor(c, 'colorHopScorchA').name('hop scorch dark');
  ground.addColor(c, 'colorHopScorchB').name('hop scorch embers');
  R(ground, c, 'markLife', 0.1, 6, 0.05, 'hop burn life');
  ground.addColor(c, 'colorScorchA').name('burn dark');
  ground.addColor(c, 'colorScorchB').name('burn hot');

  const beats = section(folder, '8 · Beats');
  R(beats, c, 'burstRadius', 0, 8, 0.05, 'detonation shell (m)');
  R(beats, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(beats, c, 'burstOpacity', 0, 1, 0.01, 'shell film');
  R(beats, c, 'hopBurst', 0, 4, 0.05, 'hop shell (m)');
  R(beats, c, 'hopBurstOpacity', 0, 1, 0.01, 'hop shell film');
  R(beats, c, 'blastRadius', 0, 6, 0.05, 'charge blast (m)');
  R(beats, c, 'hopBlast', 0, 3, 0.05, 'hop blast (m)');
  R(beats, c, 'blastLife', 0.1, 2, 0.01, 'blast life (s)');
  R(beats, c, 'blastBillow', 0, 1, 0.01, 'blast billow');
  R(beats, c, 'blastOpacity', 0, 1, 0.01, 'blast opacity');
  R(beats, c, 'blastFilament', 0, 2, 0.01, 'blast filaments');
  R(beats, c, 'blastGlow', 0, 6, 0.01, 'blast filament glow');
  beats.addColor(c, 'colorBlastBody').name('blast body');
  R(beats, c, 'shockRadius', 0, 10, 0.05, 'shockwave (m)');
  beats.addColor(c, 'colorBurstA').name('shell inner');
  beats.addColor(c, 'colorBurstB').name('shell mid');
  beats.addColor(c, 'colorBurstC').name('shell outer');
  R(beats, c, 'impactShake', 0, 1, 0.01, 'impact shake');
  R(beats, c, 'impactFlash', 0, 0.5, 0.01, 'impact flash');
  R(beats, c, 'hopShake', 0, 1, 0.01, 'hop shake');
  R(beats, c, 'hopFlash', 0, 0.5, 0.01, 'hop flash');
  beats.addColor(c, 'colorFlash').name('flash');

  const warp = section(folder, '9 · Distortion');
  R(warp, c, 'warpStrength', 0, 3, 0.01, 'strength');
  R(warp, c, 'warpSize', 0.2, 8, 0.05, 'size (× seed)');
  R(warp, c, 'warpScale', 0.1, 6, 0.01, 'crackle scale');
  R(warp, c, 'warpSpeed', 0, 6, 0.01, 'crackle speed');
  R(warp, c, 'warpPunch', 0, 4, 0.01, 'punch per hop');

  folder.close();
  return folder;
}
