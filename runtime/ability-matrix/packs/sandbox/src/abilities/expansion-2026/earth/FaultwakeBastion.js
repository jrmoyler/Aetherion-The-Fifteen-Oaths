import { InstancedMesh, Matrix4, Mesh, Points, Quaternion, Vector3 } from 'three';
import { Ability } from '../../Ability.js';
import {
  createColumnGeometry,
  createRubbleGeometry,
  addRockInstanceAttributes,
  createFissureGeometry,
  createShockGeometry,
  createDebrisGeometry
} from './FaultwakeBastionGeometry.js';
import {
  createRockMaterial,
  createRockDepthMaterial,
  createFissureMaterial,
  createHeatVeilMaterial,
  createDebrisMaterial,
  createShockMaterial
} from './FaultwakeBastionMaterials.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { saturate, Easing } from '../../../utils/math.js';

export const ID = 'faultwake-bastion',
  UID = 'matrix-expansion/faultwake-bastion';

export const CONFIG = Object.freeze({
  id: ID,
  meta: {
    label: 'Faultwake Bastion',
    accent: '#d5a077',
    element: 'earth',
    key: '',
    cast: 'line',
    hint: 'An advancing chain of fractured rock columns erupts and scatters enemies.',
    glyph: '<path d="M8 80L18 40L30 70L43 17L56 71L72 35L91 80Z"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 14, // how fast the fault runs out from the caster, metres/second
    lifetime: 2.3, // seconds the bastion stands, settles and folds back down
    cooldown: 4, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    impactTime: 0.45, // seconds the terminal eruption rings before the fade

    /* --- light --- */
    lightColor: '#ca8753', // the dynamic light riding the front
    lightIntensity: 4,
    lightRadius: 8,

    /* ================================================================ */
    /* 1 · THE COLUMNS                                                   */
    /* ================================================================ */

    columns: 9, // basalt slabs along the line (capped at 16)
    columnWidth: 0.7, // radius of a column, metres
    height: 2.7, // full height of the farthest (tallest) slab, metres
    heightVariance: 0.18, // 0 all equal … 1 some columns half height
    widthVariance: 0.2, // radius jitter, fraction
    columnJitter: 0.16, // extra random lateral wander off the aimed line, metres
    columnLean: 0.3, // radians each slab leans away from the fault (the splayed wake)
    columnTwist: 1, // random yaw, 0..1 of a hexagon's sixth
    startClear: 2.6, // metres of open fissure before the first slab, so the caster stays in view
    zigzag: 0.95, // slabs step alternately this far left/right of the fault, metres
    heightRamp: 0.45, // nearest slab's height as a fraction of the farthest: the chain climbs away
    slabVariety: 1, // 0 all plain columns … 1 spire / fin / block archetypes in turn
    finYaw: 0.6, // radians a fin slab turns off the line, so it shows its face to the caster
    emergeLead: 1, // metres before the front reaches it that a column starts to rise
    settleOvershoot: 0.15, // how far past full height the heave carries, fraction
    settleDuration: 0.35, // seconds from arrival to settled on its seat
    sinkDepth: 1.1, // how far it retreats under the floor, × its height
    retreatStagger: 0.45, // 0 all sink together … 1 the far end folds first, one by one

    /* --- the linger: aftershocks roll down the standing chain --- */
    aftershockPeriod: 0.62, // seconds between aftershock waves
    aftershockSpeed: 11, // metres/second each wave rolls from the caster's end to the far end
    aftershockLift: 0.09, // how far each slab jolts up, fraction of its height
    aftershockTilt: 0.06, // radians each slab rocks as the wave passes
    aftershockHeat: 0.75, // vein flare on each jolt, 0..1
    aftershockDust: 3, // dust puffs per slab per jolt
    lingerCreep: 0.12, // fraction the settled slabs keep grinding upward through the linger

    /* --- the rock itself --- */
    rockNoiseScale: 1.2, // scale of grit and strata in the column's own space
    rockGrit: 1, // fbm grain strength
    rockStrata: 1, // horizontal banding strength
    dustCover: 0.55, // dust settled on the upward faces, 0..1
    veinGlow: 2.6, // magma vein brightness (bloom picks up > 1)
    veinWidth: 0.12, // how open the veins are while hot
    veinRest: 0.08, // heat a settled column keeps, 0..1
    heatDecay: 0.75, // seconds for a fresh column's veins to seal
    burnEdge: 0.08, // width of the glowing rim on the exit dissolve
    dissolveStart: 0.55, // fraction of the fade before the sinking columns start to crumble
    colorRockDark: '#22150d',
    colorRockLight: '#6e4a31',
    colorRockDust: '#a48766',
    colorMagma: '#ff5a14',
    colorMagmaCore: '#ffd28a',

    /* --- rubble kicked off each column's base --- */
    rubblePerColumn: 3, // boulders thrown per column (capped at 3)
    rubbleSize: 0.26, // metres across
    rubbleSpeed: 3.2, // sideways throw, metres/second
    rubbleUp: 4.5, // upward throw, metres/second
    rubbleGravity: 16, // metres/second²
    rubbleSpin: 7, // tumble, radians/second while airborne

    /* ================================================================ */
    /* 2 · THE FISSURE                                                   */
    /* ================================================================ */

    crackWidth: 1.5, // half-width of the scorched strip, metres
    crackCoreWidth: 0.17, // width of the molten slit itself, metres
    crackLip: 0.45, // ember glow on the slit's lips, 0..1
    slabScar: 1.5, // radius of the scorch burnt round each slab's foot, metres (0 = off)
    crackFresh: 2.5, // metres behind the front that stay white-hot
    crackWander: 0.12, // how far the slit wanders off the line, metres
    crackBranching: 1, // density of the branch cracks
    crackGlow: 3, // brightness of the slit
    crackCool: 1.6, // >1 the slit holds its heat into the fade
    scarOpacity: 0.8, // scorched ground darkening, 0..1
    telegraphLength: 2.5, // metres ahead of the front the seam pulses
    telegraphGlow: 0.6, // brightness of that warning seam
    colorCrackHot: '#ffc27a',
    colorCrackEmber: '#d9380c',
    colorCrackScar: '#140c08',

    /* --- heat veil (screen distortion over the open fissure) --- */
    veilWidth: 1.6, // × crackWidth
    veilStrength: 0.6,
    veilScale: 1.4, // shimmer noise frequency, 1/metres
    veilSpeed: 1.2, // shimmer rise speed

    /* ================================================================ */
    /* 3 · DEBRIS AND PARTICLES                                          */
    /* ================================================================ */

    /* --- the debris cloud thrown behind the front (96 GPU points) --- */
    dustOpacity: 0.7, // opacity of the thrown debris
    debrisSize: 1, // chip size multiplier
    debrisLift: 3.2, // launch speed upward, metres/second
    debrisSpread: 1.6, // sideways scatter, metres/second
    debrisGravity: 8, // metres/second²
    debrisGlow: 2, // how hot a chip is when torn out
    colorDebris: '#6b4128',

    /* --- dust plumes off each eruption (pooled SMOKE) --- */
    dustPerColumn: 10, // puffs when a column breaks the floor
    dustRate: 36, // puffs/second trailing the front
    dustSize: 0.8,
    dustLife: 1.6,
    dustRise: 0.7, // buoyancy, metres/second²
    plumeOpacity: 0.55,
    colorDustA: '#b49a7c',
    colorDustB: '#8a6f55',
    colorDustC: '#5a4636',
    colorDustD: '#2e241c',

    /* --- rock chips (pooled CHIP, lit) --- */
    chipsPerColumn: 8,
    chipSpeed: 5,
    chipSize: 0.08,
    chipLife: 1.2,
    chipGravity: 12,
    colorChipA: '#8f6a4c',
    colorChipB: '#6b4b34',
    colorChipC: '#4a3324',
    colorChipD: '#2a1c13',

    /* --- embers rising off the fissure (pooled SOFT, additive) --- */
    emberRate: 70, // embers/second while the fissure is hot
    emberSize: 0.05,
    emberLife: 1.3,
    emberRise: 1.8, // metres/second²
    emberGlow: 2.6,
    colorEmberA: '#fff1c4',
    colorEmberB: '#ffa042',
    colorEmberC: '#d9380c',
    colorEmberD: '#3a0d02',

    /* ================================================================ */
    /* 4 · THE ERUPTION BEATS                                            */
    /* ================================================================ */

    impactShake: 0.18, // camera knock at the terminal eruption
    impactFlash: 0.07, // screen flash at the terminal eruption
    impactLight: 3, // light punch, × lightIntensity
    impactRadius: 2.6, // how far the shock disc runs, metres
    impactRingGlow: 2,
    impactCracks: 3, // radial crack density on the disc
    impactChips: 40, // chips at the terminal eruption
    impactDust: 34, // dust puffs at the terminal eruption
    burstSize: 0, // EARTH dust shell, metres (0 = off: the terminal slab and dust carry the beat)
    burstIntensity: 1,
    burstOpacity: 0.45, // dust shell opacity
    crackDecalRadius: 2.4, // radial CRACK decal, metres
    dustRingRadius: 3.6, // DUSTRING decal, metres
    columnKnock: 0.035, // small camera knock as each column breaks the floor
    columnLight: 0.6, // light punch per column, × lightIntensity
    colorFlash: '#ffb070',
    colorBurstA: '#ffd9a0',
    colorBurstB: '#b8683a',
    colorBurstC: '#3b2416',

    /* ================================================================ */
    /* 5 · HITS                                                          */
    /* ================================================================ */

    reach: 1.3, // half-width of the strip that throws a body, metres
    impulse: 5, // eruption force, metres/second
    lift: 2.2, // eruption lift, metres/second
    hitSpin: 0.6 // tumble given to a thrown body
  }
});

/** Columns one cast can raise; the instanced mesh is built at this size. */
const MAX_COLUMNS = 16;
/** Boulders per column, and the rubble mesh's capacity. */
const RUBBLE_PER_COLUMN = 3;
const MAX_RUBBLE = MAX_COLUMNS * RUBBLE_PER_COLUMN;
/** Dice per column: lateral, height, width, yaw, lean. */
const COLUMN_DICE = 5;
/** Dice per boulder: heading, speed, up, spin, size. */
const RUBBLE_DICE = 5;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _base = new Vector3();
const _scale = new Vector3();
const _m = new Matrix4();
const _qLean = new Quaternion();
const _qYaw = new Quaternion();
const _qSpin = new Quaternion();
const _qRock = new Quaternion();
/** Silhouette archetypes, cycled down the chain: [width, height, lean, fin]. */
const SLAB_ARCHETYPES = [
  [0.82, 1.18, 0.7, 0], // spire: narrow, tall, nearly upright
  [1.0, 0.92, 1.0, 1], // fin: a broad blade turned to show its face
  [1.28, 0.66, 1.3, 0] // block: squat, heavy, tipped hard off the fault
];
const _axis = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * FAULTWAKE BASTION — Earth, line cast.
 *
 * The ground does not *throw* rock at the target; it **stands up**. A fault
 * opens at the caster's feet and runs down the aimed line, and in its wake the
 * floor heaves up into a wall of hexagonal basalt columns — the way columnar
 * basalt really fractures, six-sided and jointed — each one punching up past
 * its seat, ringing, and settling. Whatever stands on the fault is thrown.
 * At the far end the last column breaks the floor with a terminal eruption.
 * Then the bastion folds back into the fissure, far end first, and the scar
 * cools and erodes away.
 *
 * ## Reading it from behind the caster
 *
 * A line cast is seen end-on, so the chain is composed for that view: the
 * first `startClear` metres are open, glowing fissure (the caster is never
 * buried); the slabs then step alternately left and right of the fault
 * (`zigzag`), each one splayed away from it, and climb in height toward the
 * far end (`heightRamp`) so every slab shows over the shoulder of the one in
 * front. Spire, fin and block silhouettes cycle down the chain
 * (`slabVariety`). While it stands, aftershock waves roll down the chain
 * every `aftershockPeriod` seconds — each slab jolts, rocks, flares its veins
 * and sheds grit as the wave passes — and the slabs keep grinding upward
 * (`lingerCreep`). Each slab burns a SCORCH decal round its foot that stays
 * for the whole linger.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the columns** (`createRockMaterial`, opaque, `LAYER.WORLD`) — one
 *      instanced hexagonal prism per column, leaning off the line, magma veins
 *      open while fresh and sealing as they cool (`aHeat` per instance), a
 *      molten seam at the floor, a burning dissolve on the way out. Each column
 *      also kicks three boulders (a second instanced mesh) off its base.
 *   2. **the fissure** (`createFissureMaterial`) — the white-hot slit that
 *      only exists behind the front, branch cracks, a scorched scar, and a
 *      telegraph seam pulsing *ahead* of the front: the anticipation beat.
 *      Over it, a **heat veil** on `LAYER.DISTORTION`.
 *   3. **debris and particles** — the 96-point GPU debris cloud thrown behind
 *      the front, plus three pooled systems: SMOKE plumes off each eruption
 *      and the front, lit CHIPs, and embers rising off the hot fissure.
 *   4. **the beats** — each column breaking the floor gets a dust ring, a
 *      light punch and a small camera knock; the terminal eruption gets the
 *      shock disc, an EARTH dust shell, CRACK + DUSTRING decals, a flash, a
 *      camera knock and a big light punch.
 *
 * ## Hits (`handlesOwnHits`)
 *
 * Unchanged from the candidate: every body inside `reach` of the line between
 * last frame's front and this frame's is thrown once, along the line. The
 * columns are dressing on that sweep, never a separate hit volume.
 *
 * ## The editor rule
 *
 * A cast stores a seed, dice per column and per boulder, and the moment each
 * column arrived. Every dimension, time and colour is read from
 * `settings['faultwake-bastion']` every frame, so the wall re-shapes under the
 * slider while it stands.
 */
export class FaultwakeBastionAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Columns plus boulders on screen. HUD readout only. */
  get instanceCount() {
    return this.columns.count + this.rubble.count;
  }

  get impactDuration() {
    return Math.max(0.05, this.config.impactTime) * settings.global.lifetime;
  }

  get fadeDuration() {
    return Math.max(0.2, this.config.lifetime) * settings.global.lifetime;
  }

  /** Magma light: a slow, heavy pulse rather than a flicker. */
  lightShimmer() {
    return 0.88 + 0.12 * Math.sin(this.age * 5.1) * Math.sin(this.age * 1.7 + 0.6);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: basalt columns + rubble (opaque, world layer) ---- */
    this.geo = addRockInstanceAttributes(createColumnGeometry(), MAX_COLUMNS);
    this.mat = createRockMaterial();
    this.columns = new InstancedMesh(this.geo, this.mat, MAX_COLUMNS);
    // Opaque rock occludes and is what soft particles fade against. It casts
    // into the (per-frame) sun cascade through a patched depth material that
    // runs the basalt's own below-floor discard and erosion dissolve, so the
    // shadow sinks and crumbles with the column instead of staying solid.
    this.columns.layers.set(LAYER.WORLD);
    this.columns.castShadow = true;
    this.columnDepthMaterial = createRockDepthMaterial(this.mat);
    this.columns.customDepthMaterial = this.columnDepthMaterial;
    this.columns.frustumCulled = false;
    this.columns.count = 0;
    this.group.add(this.columns);

    this.rubbleGeometry = addRockInstanceAttributes(createRubbleGeometry(), MAX_RUBBLE);
    this.rubbleMaterial = createRockMaterial();
    this.rubble = new InstancedMesh(this.rubbleGeometry, this.rubbleMaterial, MAX_RUBBLE);
    this.rubble.layers.set(LAYER.WORLD);
    this.rubble.castShadow = true;
    this.rubbleDepthMaterial = createRockDepthMaterial(this.rubbleMaterial);
    this.rubble.customDepthMaterial = this.rubbleDepthMaterial;
    this.rubble.frustumCulled = false;
    this.rubble.count = 0;
    this.group.add(this.rubble);

    /* ---- layer 2: the fissure and its heat veil ---- */
    this.crackGeometry = createFissureGeometry();
    this.crackMaterial = createFissureMaterial();
    this.crack = new Mesh(this.crackGeometry, this.crackMaterial);
    this.crack.layers.set(LAYER.VFX);
    this.crack.renderOrder = 2;
    this.crack.frustumCulled = false;
    this.group.add(this.crack);

    this.veilMaterial = createHeatVeilMaterial();
    // Same ground strip, drawn wider into the distortion buffer only.
    this.veil = new Mesh(this.crackGeometry, this.veilMaterial);
    this.veil.layers.set(LAYER.DISTORTION);
    this.veil.frustumCulled = false;
    this.group.add(this.veil);

    /* ---- layer 3: the debris cloud ---- */
    this.debrisGeometry = createDebrisGeometry();
    this.debrisMaterial = createDebrisMaterial();
    this.debris = new Points(this.debrisGeometry, this.debrisMaterial);
    this.debris.layers.set(LAYER.VFX);
    this.debris.frustumCulled = false;
    this.group.add(this.debris);

    /* ---- layer 4: the terminal shock disc ---- */
    this.impactGeometry = createShockGeometry();
    this.impactMaterial = createShockMaterial();
    this.impactRing = new Mesh(this.impactGeometry, this.impactMaterial);
    this.impactRing.layers.set(LAYER.VFX);
    this.impactRing.rotation.x = -Math.PI / 2;
    this.impactRing.renderOrder = 3;
    this.impactRing.visible = false;
    this.group.add(this.impactRing);

    /** Per-cast dice; filled in `onSpawn`, never reallocated. */
    this._columnDice = new Float32Array(MAX_COLUMNS * COLUMN_DICE);
    this._rubbleDice = new Float32Array(MAX_RUBBLE * RUBBLE_DICE);
    /** Age at which each column broke the floor, or −1. */
    this.columnArrival = new Float64Array(MAX_COLUMNS);
    /** Last aftershock wave each slab answered (dust once per wave), or −1. */
    this._wave = new Int32Array(MAX_COLUMNS);
    this._seed = 0;
    this._heat = 1;

    /** Scratch handed to the materials each frame — one object apiece. */
    this._rockState = { time: 0, fade: 1 };
    this._crackState = { time: 0, front: 0, fade: 1, heat: 1, length: 1, width: 1, seed: 0 };
    this._veilState = { time: 0, front: 0, length: 1, strength: 1, seed: 0 };
    this._debrisState = { time: 0, front: 0, length: 1, speed: 1, fade: 1, origin: this.origin, dir: this.direction, side: this.side };
    this._shockState = { time: 0, fade: 0, seed: 0 };

    this.p = new Vector3();
    this.found = [];
    this.hit = new Set();
    this.prev = 0;
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  createParticles() {
    const particles = this.ctx.particles;
    // The pooled systems are optional: a bare test context has none, and the
    // cast must still run (and hit) without them.
    this.dust = particles?.get?.(`${ID}.dust`, {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.9
    }) ?? null;
    if (this.dust) {
      const u = this.dust.uniforms;
      u.uSizeIn.value = 0.12;
      u.uFadeIn.value = 0.08;
      u.uFadeOut.value = 0.6;
      u.uEndSize.value = 2.6;
      u.uDrag.value = 1.6;
      u.uTurbFrequency.value = 0.5;
      u.uTurbSpeed.value = 0.4;
    }
    this.chips = particles?.get?.(`${ID}.chips`, {
      capacity: 900,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.2
    }) ?? null;
    if (this.chips) {
      const u = this.chips.uniforms;
      u.uSizeIn.value = 0.02;
      u.uFadeIn.value = 0.02;
      u.uFadeOut.value = 0.25;
      u.uEndSize.value = 0.85;
      u.uDrag.value = 0.35;
    }
    this.embers = particles?.get?.(`${ID}.embers`, {
      capacity: 1200,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.3
    }) ?? null;
    if (this.embers) {
      const u = this.embers.uniforms;
      u.uSizeIn.value = 0.1;
      u.uFadeIn.value = 0.1;
      u.uFadeOut.value = 0.5;
      u.uEndSize.value = 0.3;
      u.uDrag.value = 1.1;
      u.uTurbFrequency.value = 0.9;
      u.uTurbSpeed.value = 0.6;
    }
    this.dustEmitter = new RateEmitter();
    this.emberEmitter = new RateEmitter();
    this.sinkEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const g = settings.global;
    this.prev = 0;
    this.hit.clear();
    this.columnArrival.fill(-1);
    this._wave.fill(-1);
    this._seed = Math.random() * 100;
    this._heat = 1;
    // Dice: each a signed or unsigned unit value, scaled by settings later.
    for (let i = 0; i < this._columnDice.length; i++) this._columnDice[i] = Math.random();
    for (let i = 0; i < this._rubbleDice.length; i++) this._rubbleDice[i] = Math.random();
    this.dustEmitter.reset();
    this.emberEmitter.reset();
    this.sinkEmitter.reset();

    this.crack.visible = true;
    this.veil.visible = true;
    this.debris.visible = true;
    this.impactRing.visible = false;
    this.columns.visible = true;
    this.rubble.visible = true;
    this._shockState.fade = 0;
    this._shockState.seed = this._seed;
    this._crackState.seed = this._seed;
    this._veilState.seed = this._seed;
    this._draw(0, 1);

    // Anticipation: the ground at the caster's feet gives first.
    this._puff(this.origin, Math.round(6 * g.particleCount), 0.3);
    this.ctx.decals?.spawn?.(DecalType.DUSTRING, this.origin, {
      radius: this.config.crackWidth * 1.2,
      life: 0.8,
      intensity: 0.5,
      colorA: getColor(this.config.colorDustA),
      colorB: getColor(this.config.colorDustC)
    });
  }

  /* ------------------------------------------------------------------ */
  /* The wall                                                            */
  /* ------------------------------------------------------------------ */

  /** Live column count, clamped to the mesh's capacity. */
  _columnCount() {
    return Math.max(1, Math.min(MAX_COLUMNS, Math.round(this.config.columns)));
  }

  /**
   * Pose every column, boulder and ground layer for a front `front` metres
   * out and an overall `fade` (1 standing … 0 gone).
   */
  _draw(front, fade) {
    const c = this.config;
    const g = settings.global;
    const n = this._columnCount();
    const rubblePer = Math.max(0, Math.min(RUBBLE_PER_COLUMN, Math.round(c.rubblePerColumn)));
    const lead = Math.max(0.05, c.emergeLead);
    const stagger = saturate(c.retreatStagger) * 0.95;
    const exit = 1 - fade;
    const variety = saturate(c.slabVariety);
    const ramp = saturate(c.heightRamp);
    const period = Math.max(0.1, c.aftershockPeriod);
    const settleTime = Math.max(0.01, c.settleDuration);
    const heats = this.geo.attributes.aHeat.array;
    const rubbleHeats = this.rubbleGeometry.attributes.aHeat.array;
    this.columns.count = n;
    this.rubble.count = n * rubblePer;

    for (let i = 0; i < n; i++) {
      const dice = i * COLUMN_DICE;
      const d = this._slabDistance(i, n);
      // 0 at the caster's end … 1 at the terminal slab.
      const rank = n > 1 ? i / (n - 1) : 1;
      // The column starts rising `lead` metres before the front reaches it.
      const emerge = Easing.outCubic(saturate((front - d + lead) / lead));
      if (front >= d && this.columnArrival[i] < 0) {
        this.columnArrival[i] = this.age;
        this._erupt(i, d);
      }
      const since = this.columnArrival[i] < 0 ? 0 : this.age - this.columnArrival[i];
      // The heave: past its seat and back, one swing, exactly 1 when settled.
      const settle = 1 + c.settleOvershoot * Math.sin(Math.PI * Math.min(1, since / settleTime));

      // The linger: once seated, the slab keeps grinding up, and aftershock
      // waves roll down the chain from the caster's end, jolting each slab
      // in turn (and flaring its veins) as the wave passes under it.
      const seated = this.columnArrival[i] >= 0 ? saturate((since - settleTime) / 0.25) : 0;
      const creep = c.lingerCreep * (1 - Math.exp(-Math.max(0, since - settleTime) / 1.2)) * seated;
      const wave = (this.age - d / Math.max(0.5, c.aftershockSpeed)) / period;
      const waveIndex = Math.floor(wave);
      const wt = (wave - waveIndex) * period;
      const jolt = seated * fade * (wt < 0.22 ? Math.sin(Math.PI * (wt / 0.22)) : 0);
      if (seated >= 1 && fade > 0.35 && waveIndex !== this._wave[i]) {
        if (this._wave[i] >= 0) this._aftershock(i, d);
        this._wave[i] = waveIndex;
      }

      // The retreat rolls home from the far end.
      const delay = n > 1 ? stagger * (1 - rank) : 0;
      const local = saturate((exit - delay) / Math.max(0.05, 1 - stagger));

      // Silhouette: spire, fin and block in turn, blended in by `slabVariety`.
      const arch = SLAB_ARCHETYPES[i % SLAB_ARCHETYPES.length];
      const aw = 1 + (arch[0] - 1) * variety;
      const ah = 1 + (arch[1] - 1) * variety;
      const al = 1 + (arch[2] - 1) * variety;
      const fin = arch[3] * variety;

      // Placement: the slabs step left and right of the fault in turn (so
      // from behind the caster each one shows beside the last), wander a
      // little, lean away from the fault and turn.
      const lateral = this._slabLateral(i);
      const side = lateral >= 0 ? 1 : -1;
      _base.copy(this.origin).addScaledVector(this.direction, d).addScaledVector(this.side, lateral);
      // A positive turn about the heading tips the crown toward +side, so the
      // columns splay away from the fault as if it had pushed them apart.
      _axis.copy(this.direction);
      const rock = c.aftershockTilt * jolt * (this._columnDice[dice + 4] > 0.5 ? 1 : -1);
      _qLean.setFromAxisAngle(_axis, side * (c.columnLean * al * (0.6 + 0.6 * this._columnDice[dice + 4]) + rock));
      // Heading of the line in the column's yaw frame, so a fin turns off it.
      const heading = Math.atan2(-this.direction.z, this.direction.x);
      const yaw = this._columnDice[dice + 3] * c.columnTwist * (TAU / 6) * (1 - fin) + fin * (heading + side * c.finYaw);
      _qYaw.setFromAxisAngle(_up, yaw);
      _qLean.multiply(_qYaw);
      _qRock.setFromAxisAngle(this.side, rock * 0.5);
      _qLean.premultiply(_qRock);

      const sx = c.columnWidth * aw * (1 - c.widthVariance * this._columnDice[dice + 2]);
      // A fin is a blade: long in local X, thin in local Z.
      const fx = sx * (1 + 0.6 * fin);
      const fz = sx * (1 - 0.45 * fin);
      const climb = ramp + (1 - ramp) * rank;
      const tall = (1 - c.heightVariance * this._columnDice[dice + 1]) * climb * ah;
      // Each slab is cast a little deeper than it shows (`embed`), so the
      // linger can push it further out of the floor — the creep and the
      // aftershock jolts — without ever lifting its foot off the ground.
      const embedFrac = Math.max(0, c.lingerCreep) + Math.max(0, c.aftershockLift);
      const full = c.height * tall * emerge * settle;
      const sy = full * 0.5 * (1 + embedFrac);
      const rise = full * (creep + c.aftershockLift * jolt - embedFrac);
      const sink = c.height * tall * c.sinkDepth * local * local;
      _scale.set(fx, Math.max(1e-4, sy), fz);
      _pos.set(_base.x, rise - sink, _base.z);
      _m.compose(_pos, _qLean, _scale);
      this.columns.setMatrixAt(i, _m);

      // Heat: glowing while it pushes up, sealing as it cools, flaring on each jolt.
      const cool = this.columnArrival[i] < 0 ? 1 : Math.exp(-since / Math.max(0.05, c.heatDecay));
      heats[i] = Math.max(c.veinRest, cool, jolt * c.aftershockHeat) * (1 - local);

      // Boulders thrown off the base when it broke the floor.
      for (let k = 0; k < rubblePer; k++) {
        const j = i * rubblePer + k;
        this._poseRubble(j, i, since, sink, emerge, d, lateral);
        rubbleHeats[j] = heats[i] * 0.6;
      }
    }
    this.columns.instanceMatrix.needsUpdate = true;
    this.rubble.instanceMatrix.needsUpdate = true;
    this.geo.attributes.aHeat.needsUpdate = true;
    this.rubbleGeometry.attributes.aHeat.needsUpdate = true;

    // The rock dissolves only once the retreat is well under way.
    const ds = saturate(c.dissolveStart);
    const rockFade = 1 - saturate((exit - ds) / Math.max(0.05, 1 - ds));
    this._rockState.time = this.age;
    this._rockState.fade = rockFade;
    this.mat.userData.sync(this._rockState);
    this.rubbleMaterial.userData.sync(this._rockState);

    this._drawGround(front, fade);
  }

  /**
   * Where slab `i` of `n` stands down the line: the first `startClear` metres
   * are open fissure (the caster stays in view), the last slab is the
   * terminal eruption at the full length.
   */
  _slabLateral(i) {
    const c = this.config;
    const zig = (i % 2 === 0 ? 1 : -1) * c.zigzag;
    return zig + (this._columnDice[i * COLUMN_DICE] * 2 - 1) * c.columnJitter * settings.global.randomness;
  }

  /** The foot of slab `i` (`d` metres down the line) on the floor. */
  _slabFoot(i, d, out) {
    return out.copy(this.origin).addScaledVector(this.direction, d).addScaledVector(this.side, this._slabLateral(i)).setY(0);
  }

  /** Where slab `i` of `n` stands down the line (see `_slabDistance`). */
  _slabDistance(i, n) {
    const start = Math.min(Math.max(0, this.config.startClear), this.length * 0.5);
    if (n <= 1) return this.length;
    return start + ((this.length - start) * i) / (n - 1);
  }

  /** One boulder: ballistic from the column's base, then at rest, then sunk. */
  _poseRubble(j, i, since, sink, emerge, d, lateral) {
    const c = this.config;
    const g = settings.global;
    const dice = j * RUBBLE_DICE;
    const arrived = this.columnArrival[i] >= 0;
    const size = c.rubbleSize * (0.6 + 0.8 * this._rubbleDice[dice + 4]);
    if (!arrived || size <= 0) {
      _m.makeScale(1e-4, 1e-4, 1e-4);
      this.rubble.setMatrixAt(j, _m);
      return;
    }
    const heading = this._rubbleDice[dice] * TAU;
    const out = c.rubbleSpeed * (0.5 + this._rubbleDice[dice + 1]) * g.randomness;
    const up = c.rubbleUp * (0.6 + 0.6 * this._rubbleDice[dice + 2]);
    const grav = Math.max(0.1, c.rubbleGravity);
    // Flight time until it lands back on the floor.
    const flight = (2 * up) / grav;
    const t = Math.min(since, flight);
    const rest = size * 0.3;
    _dir.set(Math.cos(heading), 0, Math.sin(heading));
    _pos.copy(this.origin).addScaledVector(this.direction, d).addScaledVector(this.side, lateral).addScaledVector(_dir, c.columnWidth * 0.8 + out * t);
    _pos.y = Math.max(rest, up * t - 0.5 * grav * t * t + rest) - sink;
    _qSpin.setFromAxisAngle(_dir.set(_dir.z, 0.4, -_dir.x).normalize(), c.rubbleSpin * t + heading);
    const s = size * Math.min(1, emerge * 1.5);
    _scale.set(s, s, s);
    _m.compose(_pos, _qSpin, _scale);
    this.rubble.setMatrixAt(j, _m);
  }

  /** Fissure, veil and debris all follow the same front. */
  _drawGround(front, fade) {
    const c = this.config;
    const g = settings.global;
    const yaw = -Math.atan2(this.direction.z, this.direction.x);
    // The strip's local X runs along the line, so its UV advances with travel.
    this.crack.position.copy(this.origin).addScaledVector(this.direction, this.length / 2);
    this.crack.position.y = 0.045;
    this.crack.rotation.set(-Math.PI / 2, 0, yaw);
    this.crack.scale.set(this.length, c.crackWidth * 2, 1);
    const cs = this._crackState;
    cs.time = this.age;
    cs.front = Math.min(1, front / this.length);
    cs.fade = fade;
    cs.heat = this._heat;
    cs.length = this.length;
    cs.width = c.crackWidth * 2;
    this.crackMaterial.userData.sync(cs);

    this.veil.position.copy(this.crack.position);
    this.veil.position.y = 0.08;
    this.veil.rotation.copy(this.crack.rotation);
    this.veil.scale.set(this.length, c.crackWidth * 2 * Math.max(0.1, c.veilWidth), 1);
    const vs = this._veilState;
    vs.time = this.age;
    vs.front = cs.front;
    vs.length = this.length;
    vs.strength = this._heat * fade;
    this.veilMaterial.userData.sync(vs);

    const ds = this._debrisState;
    ds.time = this.age;
    ds.front = front;
    ds.length = this.length;
    ds.speed = c.speed * g.speed;
    ds.fade = fade;
    this.debrisMaterial.userData.sync(ds);
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const front = Math.min(this.length, this.front);
    this._hit(this.prev, front);
    this.prev = front;
    this._heat = 1;
    this._draw(front, 1);
    this._syncParticles();
    this._frontFx(dt, front);
    this._emberFx(dt, front, 1);
  }

  onImpact() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    this.pointAt(1, this.impactRing.position);
    this.impactRing.position.y = 0.055;
    this.impactRing.scale.setScalar(0.2);
    this.impactRing.visible = true;
    this._shockState.fade = 1;
    this._shockState.time = this.age;
    this.impactMaterial.userData.sync(this._shockState);

    // Always issued, so the host's own envelope sees a zero when shake is off.
    this.ctx.shake?.add?.(c.impactShake * g.cameraShake, 5, 18);
    this.ctx.flash?.trigger?.(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.lightIntensity * c.impactLight * power;

    this.pointAt(1, _pos);
    _pos.y = 0;
    if (c.burstSize > 0) this.ctx.bursts?.spawn?.(BurstMode.EARTH, _pos, {
      radius: c.burstSize * 0.2,
      endRadius: c.burstSize * power,
      life: 0.7,
      intensity: c.burstIntensity,
      opacity: c.burstOpacity,
      displace: 0.4,
      turbulence: 1,
      squash: 0.6,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals?.spawn?.(DecalType.CRACK, _pos, {
      radius: c.crackDecalRadius * power,
      life: Math.max(0.5, this.fadeDuration),
      intensity: 1,
      colorA: getColor(c.colorCrackEmber),
      colorB: getColor(c.colorCrackHot)
    });
    this.ctx.decals?.spawn?.(DecalType.DUSTRING, _pos, {
      radius: c.dustRingRadius * power,
      life: 1.4,
      intensity: 0.9,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustC)
    });
    this._syncParticles();
    this._chipBurst(_pos, Math.round(c.impactChips * g.particleCount), 1.4);
    this._puff(_pos, Math.round(c.impactDust * g.particleCount), c.crackWidth);
  }

  onFade(dt, t) {
    const c = this.config;
    const fade = t > 1 ? 2 - t : 1;
    // The fissure holds its heat into the fade, then cools to scar.
    this._heat = t > 1 ? Math.pow(fade, Math.max(0.1, c.crackCool)) : 1;
    this._draw(this.length, fade);
    this._syncParticles();
    if (t <= 1) {
      this.impactRing.scale.setScalar(0.2 + Easing.outCubic(t) * c.impactRadius);
      this._shockState.fade = (1 - t) * (1 - t);
    } else {
      this.impactRing.visible = false;
      this._shockState.fade = 0;
    }
    this._shockState.time = this.age;
    this.impactMaterial.userData.sync(this._shockState);
    this._emberFx(dt, this.length, this._heat * fade);
    if (t > 1) this._sinkFx(dt, fade);
  }

  /* ------------------------------------------------------------------ */
  /* Hits                                                                */
  /* ------------------------------------------------------------------ */

  _hit(from, to) {
    if (!this.ctx.dummies?.findTargets) return;
    const c = this.config;
    this.pointAt((from + to) / (2 * this.length), this.p);
    const targets = this.ctx.dummies.findTargets(this.p.x, this.p.z, Math.hypot((to - from) / 2, c.reach), this.found);
    this._force.impulse = c.impulse;
    this._force.lift = c.lift;
    this._force.spin = c.hitSpin;
    for (const d of targets) {
      if (this.hit.has(d)) continue;
      const x = d.position.x - this.origin.x,
        z = d.position.z - this.origin.z,
        along = x * this.direction.x + z * this.direction.z,
        lat = Math.abs(x * this.side.x + z * this.side.z);
      if (along < from - 0.3 || along > to + 0.3 || lat > c.reach) continue;
      this.hit.add(d);
      if (d.kill?.(this.direction.x, this.direction.z, this._force, false)) {
        // The throw, read on the body: chips and a punch of magma light.
        _pos.copy(d.position).setY(0.4);
        this._chipBurst(_pos, Math.round(14 * settings.global.particleCount), 1);
        this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.columnLight);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Beats and effects                                                   */
  /* ------------------------------------------------------------------ */

  /** A column has just broken the floor at `d` metres down the line. */
  _erupt(i, d) {
    const c = this.config;
    const g = settings.global;
    this._slabFoot(i, d, _pos);
    this._syncParticles();
    // The floor is burnt dark round the slab's foot, embers glinting in the
    // char, and stays burnt for the linger.
    if (c.slabScar > 0) {
      this.ctx.decals?.spawn?.(DecalType.SCORCH, _pos, {
        radius: c.slabScar * (0.8 + 0.4 * this._columnDice[i * COLUMN_DICE + 2]),
        life: Math.max(0.5, this.impactDuration + this.fadeDuration + 0.4),
        intensity: 0.9,
        colorA: getColor(c.colorCrackScar),
        colorB: getColor(c.colorCrackEmber)
      });
    }
    this._slabFoot(i, d, _pos);
    this._puff(_pos, Math.round(c.dustPerColumn * g.particleCount), c.columnWidth);
    this._chipBurst(_pos, Math.round(c.chipsPerColumn * g.particleCount), 1);
    this.ctx.decals?.spawn?.(DecalType.DUSTRING, _pos, {
      radius: c.columnWidth * 2.2,
      life: 0.9,
      intensity: 0.6,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustC)
    });
    this.ctx.shake?.add?.(c.columnKnock * g.cameraShake, 7, 26);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.columnLight * (0.6 + 0.4 * (i % 2)));
  }

  /** An aftershock wave has just reached slab `i`: grit shaken off its foot. */
  _aftershock(i, d) {
    const c = this.config;
    const n = Math.round(c.aftershockDust * settings.global.particleCount);
    if (n <= 0) return;
    this._slabFoot(i, d, _pos);
    this._syncParticles();
    this._puff(_pos, n, c.columnWidth * 0.8);
    this._chipBurst(_pos.setY(0.2), Math.max(1, Math.round(n * 0.7)), 0.55);
  }

  _resetEmit(time) {
    _emit.radius = 0;
    _emit.direction = _up;
    _emit.speed = 0;
    _emit.speedVariance = 0.35;
    _emit.spread = 0.5;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.4;
    _emit.life = 1;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  /** Dust rolling off a point on the floor. */
  _puff(at, count, radius) {
    if (!this.dust || count <= 0) return;
    const c = this.config;
    this._resetEmit(frame.uTime.value);
    _pos.copy(at).setY(0.15);
    _emit.position = _pos;
    _emit.radius = Math.max(0.05, radius * 0.6);
    _emit.speed = 1.2;
    _emit.spread = 0.9;
    _emit.size = c.dustSize;
    _emit.life = c.dustLife;
    _emit.spin = 0.6;
    this.dust.emit(count, _emit);
  }

  /** Rock chips sprayed up and out. */
  _chipBurst(at, count, strength) {
    if (!this.chips || count <= 0) return;
    const c = this.config;
    this._resetEmit(frame.uTime.value);
    _dir.copy(_up);
    _emit.position = at;
    _emit.radius = 0.2;
    _emit.direction = _dir;
    _emit.speed = c.chipSpeed * strength;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.85;
    _emit.size = c.chipSize;
    _emit.life = c.chipLife;
    _emit.spin = 8;
    this.chips.emit(count, _emit);
  }

  /** Dust trailing the travelling front. */
  _frontFx(dt, front) {
    if (!this.dust) return;
    const c = this.config;
    const n = Math.round(this.dustEmitter.tick(dt, c.dustRate) * settings.global.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    this.pointAt(Math.min(1, front / this.length), _pos);
    _pos.y = 0.1;
    _emit.position = _pos;
    _emit.radius = c.crackWidth * 0.5;
    _emit.speed = 0.8;
    _emit.spread = 0.9;
    _emit.size = c.dustSize * 0.7;
    _emit.life = c.dustLife * 0.8;
    _emit.spin = 0.5;
    this.dust.emit(n, _emit);
  }

  /** Embers lifting off the open fissure behind the front. */
  _emberFx(dt, front, strength) {
    if (!this.embers || strength <= 0.01 || front <= 0) return;
    const c = this.config;
    const n = Math.round(this.emberEmitter.tick(dt, c.emberRate * strength) * settings.global.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.speed = 0.6;
    _emit.spread = 0.4;
    _emit.size = c.emberSize;
    _emit.life = c.emberLife;
    _emit.radius = 0.08;
    for (let k = 0; k < n; k++) {
      // Weighted toward the freshest few metres behind the front.
      const s = Math.max(0, front - Math.pow(Math.random(), 2) * Math.min(front, 6));
      this.pointAt(s / this.length, _pos);
      _pos.addScaledVector(this.side, (Math.random() * 2 - 1) * 0.15).setY(0.06);
      _emit.position = _pos;
      this.embers.emit(1, _emit);
    }
  }

  /** Dust shaken loose as the columns fold back under the floor. */
  _sinkFx(dt, fade) {
    if (!this.dust) return;
    const c = this.config;
    const rate = c.dustRate * 0.6 * Math.sin(Math.PI * saturate(1 - fade));
    const n = Math.round(this.sinkEmitter.tick(dt, rate) * settings.global.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.speed = 0.5;
    _emit.spread = 1;
    _emit.size = c.dustSize * 0.6;
    _emit.life = c.dustLife * 0.7;
    _emit.radius = c.columnWidth * 0.6;
    const count = this._columnCount();
    for (let k = 0; k < n; k++) {
      const i = Math.floor(Math.random() * count);
      this._slabFoot(i, this._slabDistance(i, count), _pos);
      _pos.y = 0.1;
      _emit.position = _pos;
      this.dust.emit(1, _emit);
    }
  }

  /** Pooled systems are shared by name; refresh them from settings every frame. */
  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    if (this.dust) {
      this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
      const u = this.dust.uniforms;
      u.uGravity.value.set(0, c.dustRise, 0);
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
      u.uOpacity.value = c.plumeOpacity * g.opacity;
      u.uTurbulence.value = 0.5 * g.turbulence;
    }
    if (this.chips) {
      this.chips.setGradient(getColor(c.colorChipA), getColor(c.colorChipB), getColor(c.colorChipC), getColor(c.colorChipD));
      const u = this.chips.uniforms;
      u.uGravity.value.set(0, -c.chipGravity, 0);
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
      u.uOpacity.value = g.opacity;
      u.uTurbulence.value = 0.1 * g.turbulence;
    }
    if (this.embers) {
      this.embers.setGradient(getColor(c.colorEmberA), getColor(c.colorEmberB), getColor(c.colorEmberC), getColor(c.colorEmberD));
      const u = this.embers.uniforms;
      u.uGravity.value.set(0, c.emberRise, 0);
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
      u.uOpacity.value = g.opacity;
      u.uGlow.value = c.emberGlow * g.glow;
      u.uTurbulence.value = 0.8 * g.turbulence;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.hit.clear();
    this.columns.count = 0;
    this.rubble.count = 0;
    this.crack.visible = false;
    this.veil.visible = false;
    this.debris.visible = false;
    this.impactRing.visible = false;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.columnDepthMaterial.dispose();
    this.rubbleGeometry.dispose();
    this.rubbleMaterial.dispose();
    this.rubbleDepthMaterial.dispose();
    this.crackGeometry.dispose();
    this.crackMaterial.dispose();
    this.veilMaterial.dispose();
    this.debrisGeometry.dispose();
    this.debrisMaterial.dispose();
    this.impactGeometry.dispose();
    this.impactMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

/** A sub-folder where the GUI supports them; flat otherwise (test GUIs). */
const sub = (parent, title) => (typeof parent.addFolder === 'function' ? parent.addFolder(title) : parent);
const gradient = (folder, c, prefix, title, Editor) => {
  // `Editor.gradient` nests a folder; a flat GUI gets the four stops inline.
  if (typeof Editor.gradient === 'function' && typeof folder.addFolder === 'function') {
    return Editor.gradient(folder, c, prefix, title);
  }
  const group = sub(folder, title);
  for (const stop of ['A', 'B', 'C', 'D']) group.addColor(c, `${prefix}${stop}`);
  return group;
};
const castAnimation = (folder, c, Editor) =>
  typeof Editor.castAnimation === 'function' ? Editor.castAnimation(folder, c) : folder.add(c, 'castAnim', CAST_ANIMATIONS);
const color = (folder, c, key, label) => {
  const controller = folder.addColor(c, key);
  return controller?.name ? controller.name(label) : controller;
};

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⛰  Faultwake Bastion');
  const R = Editor.range;

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 4, 48, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.1, 'fault runs at (m/s)');
  R(cast, c, 'lifetime', 0.2, 8, 0.05, 'stands for (s)');
  R(cast, c, 'impactTime', 0.05, 3, 0.01, 'eruption rings for (s)');
  R(cast, c, 'cooldown', 0, 30, 0.1, 'cooldown');
  castAnimation(cast, c, Editor);

  const light = sub(folder, 'Light');
  color(light, c, 'lightColor', 'colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');

  const columns = sub(folder, '1 · The columns');
  R(columns, c, 'columns', 3, MAX_COLUMNS, 1, 'column count');
  R(columns, c, 'columnWidth', 0.1, 2, 0.05, 'column width');
  R(columns, c, 'height', 0.5, 4, 0.1, 'height');
  R(columns, c, 'heightVariance', 0, 0.9, 0.01, 'height variance');
  R(columns, c, 'widthVariance', 0, 0.9, 0.01, 'width variance');
  R(columns, c, 'columnJitter', 0, 1.5, 0.01, 'wander off the line (m)');
  R(columns, c, 'columnLean', 0, 0.8, 0.01, 'lean (rad)');
  R(columns, c, 'columnTwist', 0, 1, 0.01, 'twist');
  R(columns, c, 'startClear', 0, 8, 0.05, 'open fissure before first slab (m)');
  R(columns, c, 'zigzag', 0, 3, 0.01, 'zigzag step (m)');
  R(columns, c, 'heightRamp', 0.1, 1, 0.01, 'nearest slab height (× farthest)');
  R(columns, c, 'slabVariety', 0, 1, 0.01, 'spire / fin / block variety');
  R(columns, c, 'finYaw', 0, 1.5, 0.01, 'fin turn (rad)');
  R(columns, c, 'emergeLead', 0.05, 4, 0.05, 'rises ahead of the front (m)');
  R(columns, c, 'settleOvershoot', 0, 0.6, 0.01, 'rise overshoot');
  R(columns, c, 'settleDuration', 0.05, 1.5, 0.05, 'settle time');
  R(columns, c, 'sinkDepth', 0, 2, 0.05, 'retreat depth');
  R(columns, c, 'retreatStagger', 0, 1, 0.01, 'retreat stagger');

  const shocks = sub(folder, '1 · Aftershocks (linger)');
  R(shocks, c, 'aftershockPeriod', 0.1, 3, 0.01, 'wave every (s)');
  R(shocks, c, 'aftershockSpeed', 0.5, 40, 0.1, 'wave speed (m/s)');
  R(shocks, c, 'aftershockLift', 0, 0.5, 0.005, 'jolt (× height)');
  R(shocks, c, 'aftershockTilt', 0, 0.4, 0.005, 'rock (rad)');
  R(shocks, c, 'aftershockHeat', 0, 1, 0.01, 'vein flare');
  R(shocks, c, 'aftershockDust', 0, 20, 1, 'dust per jolt');
  R(shocks, c, 'lingerCreep', 0, 0.6, 0.005, 'keeps grinding up (× height)');

  const rock = sub(folder, '1 · Rock');
  R(rock, c, 'rockNoiseScale', 0.2, 5, 0.01, 'grain scale');
  R(rock, c, 'rockGrit', 0, 3, 0.01, 'grit');
  R(rock, c, 'rockStrata', 0, 3, 0.01, 'strata');
  R(rock, c, 'dustCover', 0, 1, 0.01, 'dust on top faces');
  R(rock, c, 'veinGlow', 0, 10, 0.05, 'magma glow');
  R(rock, c, 'veinWidth', 0.01, 0.5, 0.005, 'vein width');
  R(rock, c, 'veinRest', 0, 1, 0.01, 'heat kept when settled');
  R(rock, c, 'heatDecay', 0.05, 5, 0.05, 'veins seal over (s)');
  R(rock, c, 'burnEdge', 0.005, 0.4, 0.005, 'crumble edge');
  R(rock, c, 'dissolveStart', 0, 1, 0.01, 'crumbles after (fade)');
  color(rock, c, 'colorRockDark', 'rock dark');
  color(rock, c, 'colorRockLight', 'rock light');
  color(rock, c, 'colorRockDust', 'dust');
  color(rock, c, 'colorMagma', 'magma');
  color(rock, c, 'colorMagmaCore', 'magma core');

  const rubble = sub(folder, '1 · Rubble');
  R(rubble, c, 'rubblePerColumn', 0, RUBBLE_PER_COLUMN, 1, 'boulders per column');
  R(rubble, c, 'rubbleSize', 0, 1, 0.01, 'size (m)');
  R(rubble, c, 'rubbleSpeed', 0, 10, 0.05, 'throw out (m/s)');
  R(rubble, c, 'rubbleUp', 0, 12, 0.05, 'throw up (m/s)');
  R(rubble, c, 'rubbleGravity', 1, 40, 0.1, 'gravity');
  R(rubble, c, 'rubbleSpin', 0, 30, 0.1, 'tumble');

  const fissure = sub(folder, '2 · The fissure');
  R(fissure, c, 'crackWidth', 0.1, 3, 0.05, 'fissure width');
  R(fissure, c, 'crackCoreWidth', 0.01, 0.6, 0.005, 'molten slit width (m)');
  R(fissure, c, 'crackLip', 0, 2, 0.01, 'lip glow');
  R(fissure, c, 'slabScar', 0, 5, 0.05, 'scorch round each slab (m)');
  R(fissure, c, 'crackFresh', 0.05, 10, 0.05, 'white-hot behind front (m)');
  R(fissure, c, 'crackWander', 0, 0.5, 0.005, 'wander (m)');
  R(fissure, c, 'crackBranching', 0, 3, 0.01, 'branching');
  R(fissure, c, 'crackGlow', 0, 12, 0.05, 'glow');
  R(fissure, c, 'crackCool', 0.1, 5, 0.01, 'holds heat');
  R(fissure, c, 'scarOpacity', 0, 1, 0.01, 'scorch');
  R(fissure, c, 'telegraphLength', 0, 8, 0.05, 'warning seam ahead (m)');
  R(fissure, c, 'telegraphGlow', 0, 3, 0.01, 'warning glow');
  color(fissure, c, 'colorCrackHot', 'white-hot');
  color(fissure, c, 'colorCrackEmber', 'ember');
  color(fissure, c, 'colorCrackScar', 'scar');
  R(fissure, c, 'veilWidth', 0.1, 4, 0.05, 'heat veil width (× fissure)');
  R(fissure, c, 'veilStrength', 0, 3, 0.01, 'heat veil strength');
  R(fissure, c, 'veilScale', 0.1, 6, 0.05, 'heat veil scale');
  R(fissure, c, 'veilSpeed', 0, 6, 0.05, 'heat veil speed');

  const debris = sub(folder, '3 · Debris');
  R(debris, c, 'dustOpacity', 0, 1, 0.01, 'debris opacity');
  R(debris, c, 'debrisSize', 0, 4, 0.01, 'debris size');
  R(debris, c, 'debrisLift', 0, 10, 0.05, 'debris lift');
  R(debris, c, 'debrisSpread', 0, 6, 0.05, 'debris spread');
  R(debris, c, 'debrisGravity', 0.5, 30, 0.1, 'debris gravity');
  R(debris, c, 'debrisGlow', 0, 8, 0.05, 'debris heat');
  color(debris, c, 'colorDebris', 'debris');

  const fx = sub(folder, '3 · Particles');
  R(fx, c, 'dustPerColumn', 0, 60, 1, 'dust per column');
  R(fx, c, 'dustRate', 0, 200, 1, 'dust trailing front/s');
  R(fx, c, 'dustSize', 0.05, 3, 0.01, 'dust size');
  R(fx, c, 'dustLife', 0.1, 6, 0.05, 'dust lifetime');
  R(fx, c, 'dustRise', -2, 4, 0.01, 'dust rise');
  R(fx, c, 'plumeOpacity', 0, 1, 0.01, 'dust opacity');
  gradient(fx, c, 'colorDust', 'dust gradient', Editor);
  R(fx, c, 'chipsPerColumn', 0, 60, 1, 'chips per column');
  R(fx, c, 'chipSpeed', 0, 20, 0.1, 'chip speed');
  R(fx, c, 'chipSize', 0.01, 0.4, 0.005, 'chip size');
  R(fx, c, 'chipLife', 0.1, 4, 0.05, 'chip lifetime');
  R(fx, c, 'chipGravity', 0, 40, 0.1, 'chip gravity');
  gradient(fx, c, 'colorChip', 'chip gradient', Editor);
  R(fx, c, 'emberRate', 0, 400, 1, 'embers/second');
  R(fx, c, 'emberSize', 0.005, 0.3, 0.005, 'ember size');
  R(fx, c, 'emberLife', 0.1, 5, 0.05, 'ember lifetime');
  R(fx, c, 'emberRise', -2, 6, 0.05, 'ember rise');
  R(fx, c, 'emberGlow', 0, 10, 0.05, 'ember glow');
  gradient(fx, c, 'colorEmber', 'ember gradient', Editor);

  const beats = sub(folder, '4 · The eruption');
  R(beats, c, 'impactShake', 0, 1, 0.01, 'impact shake');
  R(beats, c, 'impactFlash', 0, 0.5, 0.01, 'impact flash');
  R(beats, c, 'impactLight', 0, 10, 0.05, 'light punch (× intensity)');
  R(beats, c, 'impactRadius', 0.2, 10, 0.05, 'shock disc (m)');
  R(beats, c, 'impactRingGlow', 0, 8, 0.05, 'shock glow');
  R(beats, c, 'impactCracks', 0.5, 10, 0.05, 'shock cracks');
  R(beats, c, 'impactChips', 0, 200, 1, 'chips');
  R(beats, c, 'impactDust', 0, 120, 1, 'dust puffs');
  R(beats, c, 'burstSize', 0, 8, 0.05, 'dust shell (m)');
  R(beats, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(beats, c, 'burstOpacity', 0, 1, 0.01, 'shell opacity');
  R(beats, c, 'crackDecalRadius', 0, 10, 0.05, 'crack decal (m)');
  R(beats, c, 'dustRingRadius', 0, 10, 0.05, 'dust ring (m)');
  R(beats, c, 'columnKnock', 0, 0.3, 0.005, 'per-column knock');
  R(beats, c, 'columnLight', 0, 4, 0.01, 'per-column light (× intensity)');
  color(beats, c, 'colorFlash', 'flash');
  color(beats, c, 'colorBurstA', 'shell inner');
  color(beats, c, 'colorBurstB', 'shell mid');
  color(beats, c, 'colorBurstC', 'shell outer');

  const hits = sub(folder, '5 · Hits');
  R(hits, c, 'reach', 0.3, 3, 0.05, 'hit reach');
  R(hits, c, 'impulse', 0, 15, 0.1, 'eruption force');
  R(hits, c, 'lift', 0, 8, 0.1, 'eruption lift');
  R(hits, c, 'hitSpin', 0, 4, 0.01, 'tumble');

  folder.close();
  return folder;
}
