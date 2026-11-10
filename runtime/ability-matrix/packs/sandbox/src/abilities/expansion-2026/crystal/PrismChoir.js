import { Mesh, Points, Quaternion, Vector3 } from 'three';
import { Ability } from '../../Ability.js';
import {
  createLanceGeometry,
  createShardGeometry,
  createTrailGeometry,
  createSplinterGeometry,
  createLightfallGeometry,
  createLensGeometry,
  createChoirSpireGeometry
} from './PrismChoirGeometry.js';
import {
  createPrismMaterial,
  createBeamMaterial,
  createSplinterMaterial,
  createLightfallMaterial,
  createLensMaterial,
  createChoirSolidMaterial,
  createChoirGlowMaterial,
  createChoirRimeMaterial
} from './PrismChoirMaterials.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { saturate, Easing } from '../../../utils/math.js';

export const ID = 'prism-choir',
  UID = 'matrix-expansion/prism-choir';

export const CONFIG = Object.freeze({
  id: ID,
  meta: {
    label: 'Prism Choir',
    accent: '#e2d2ff',
    element: 'crystal',
    key: '',
    cast: 'line',
    hint: 'A crystalline lance splits into three diverging shards at the end of its course.',
    glyph: '<path d="M50 5L25 50L50 95L75 50Z"/><path d="M50 5V95M25 50H75"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 20, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 20, // how fast the lance flies, metres/second
    lifetime: 1.9, // seconds the split shards hang before they burn out
    cooldown: 4, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#d2b6ff', // the dynamic light riding the lance
    lightIntensity: 6,
    lightRadius: 8,

    /* ================================================================ */
    /* 1 · THE LANCE                                                     */
    /* ================================================================ */

    size: 1.15, // lance scale (the crystal is ~2.4 m long at 1)
    flightHeight: 1.35, // metres above the floor it flies
    formTime: 0.12, // seconds it takes to condense out of the air at the caster
    spinRate: 2, // radians/second it turns about its own axis in flight
    lanceTrailLength: 7, // metres of comet behind it
    lanceTrailWidth: 0.42, // metres
    lanceTrailGlow: 2.2,

    /* --- the crystal (lance and shards share it) --- */
    crystalGlow: 1.4, // overall brightness (bloom picks up > 1)
    crystalOpacity: 0.95,
    fresnelPower: 2.2, // lower spreads the spectral rim further over the faces
    dispersion: 1, // how far the rim's colour shifts with angle
    edgeGlow: 2, // facet edge brightness
    innerGlow: 1, // the refracted filaments inside
    spectralSpread: 1, // 0 white light … 2 a wide rainbow; also sets each shard's hue
    colorCrystalDeep: '#262a8c',
    colorCrystalBody: '#8f7cff',
    colorCrystalRim: '#bff4ff',

    /* ================================================================ */
    /* 2 · THE SPLIT                                                     */
    /* ================================================================ */

    splitDistance: 6, // metres each shard flies from the split
    splitDuration: 0.9, // seconds that flight takes
    splitAngle: 0.52, // radians the outer shards fan off the line
    shardScale: 0.75, // shard size, × lance size
    shardHeight: 1.5, // metres above the floor the shards fly
    shardSpin: 3, // radians/second a shard turns in flight
    shatterTime: 0.15, // fraction of the split over which the lance shatters away
    trailWidth: 0.4, // shard beam width, metres
    trailGlow: 2.6,

    /* --- splinters thrown out of the split (120 GPU points) --- */
    splinterReach: 1, // how far they fly, × their own speed
    splinterSize: 1.6,
    splinterGlow: 1.5,

    /* ================================================================ */
    /* 3 · LIGHTFALL AND LENS                                            */
    /* ================================================================ */

    causticGlow: 1.2, // caustics thrown on the floor
    causticScale: 1.6, // caustic web frequency, 1/metres
    causticRadius: 2.2, // pool under the lance, metres
    fanGlow: 2.2, // the three spectral rays on the floor
    fanWidth: 1.1, // ray width at the shard, metres
    lensStrength: 0.5, // the lance bending the scene behind it
    lensSize: 2.4, // lens billboard radius, metres
    splitRingStrength: 0.8, // the ring of bent air at the split

    /* ================================================================ */
    /* 4 · PARTICLES                                                     */
    /* ================================================================ */

    /* --- glints shed by the flying lance (pooled SOFT) --- */
    glintRate: 90,
    glintSize: 0.08,
    glintLife: 0.6,
    glintGlow: 2.4,
    colorGlintA: '#ffffff',
    colorGlintB: '#d7c8ff',
    colorGlintC: '#8f7cff',
    colorGlintD: '#2a1f66',

    /* --- spectral streaks off the split and the shards (pooled STREAK) --- */
    streakCount: 40, // sprayed at the split
    streakRate: 30, // per shard, per second, in flight
    streakSpeed: 7,
    streakSize: 0.07,
    streakLife: 0.45,
    streakStretch: 0.35,
    streakGlow: 2.5,
    colorStreakA: '#ffffff',
    colorStreakB: '#ffb8f0',
    colorStreakC: '#7fe8ff',
    colorStreakD: '#3a2a9a',

    /* --- glassy chips at the split (pooled CHIP) --- */
    chipCount: 30,
    chipSpeed: 4,
    chipSize: 0.13,
    chipLife: 0.9,
    chipGravity: 9,
    colorChipA: '#f2ecff',
    colorChipB: '#b8a6ff',
    colorChipC: '#6f5ad6',
    colorChipD: '#221a55',

    /* ================================================================ */
    /* 5 · THE SPLIT BEAT                                                */
    /* ================================================================ */

    impactFlash: 0.16, // screen flash as the lance splits
    impactShake: 0.22, // camera knock as the lance splits
    splitLight: 3, // light punch, × lightIntensity
    burstSize: 3, // FROST plate shell, metres
    burstIntensity: 1.2,
    shockRadius: 5, // SHOCKWAVE decal, metres
    frostRadius: 3.4, // crystalline FROST decal, metres
    colorFlash: '#e9dcff',
    colorBurstA: '#ffffff',
    colorBurstB: '#c9b8ff',
    colorBurstC: '#5d48c8',

    /* ================================================================ */
    /* 7 · THE CHOIR — crystal pipes where the shards land               */
    /* ================================================================ */

    spireScale: 1.15, // cluster size (the middle pipe is 2.4 m at 1)
    spireWidth: 1, // cluster width, × its height scale
    spireStart: 0.55, // fraction of the split at which the pipes break the floor
    spireGrow: 0.35, // fraction of the split they take to stand
    spireSink: 0.35, // last fraction of the hang over which they sink and burn out
    spireGlow: 0.9, // the solid's emissive at rest (bloom picks up > 1)
    spireSing: 1.4, // how loud the choir rings during the hang
    spireSingRate: 1.6, // rings per second climbing each pipe
    spireBands: 1, // ring tightness
    spireTint: 0.35, // how much of its hue the quartz body takes
    spireDeep: 0.22, // body brightness (the deep tone)
    spireRoughness: 0.12,
    spireMetalness: 0.25,
    spireChips: 20, // chips each cluster throws as it breaks the floor

    /* --- the rime the choir grows from (floor) --- */
    rimeRadius: 2.2, // metres round each cluster
    rimeFacets: 2.2, // crystal flagstones per metre
    rimeGlow: 1.1,
    rimeOpacity: 0.85,
    fanLinger: 0.65, // the spectral rays keep this much light through the hang

    /* ================================================================ */
    /* 6 · HITS                                                          */
    /* ================================================================ */

    reach: 0.8, // radius around the lance and each shard that throws a body
    impulse: 4, // metres/second
    lift: 1.5, // metres/second
    hitSpin: 0.5 // tumble given to a thrown body
  }
});

/** Three shards: the choir. */
const SHARDS = 3;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * PRISM CHOIR — Crystal, line cast.
 *
 * A prism splits white light into a spectrum; this one splits itself. A
 * doubly-terminated quartz lance condenses out of the air at the caster and
 * flies the aimed line, spinning, shedding glints and dragging a comet of
 * caustic light along the floor beneath it. At the end of its course it
 * **shatters into three**: a flash, a FROST shell of crystal plates and a
 * ring of bent air, and three shards fan out — each tuned to its own part of
 * the spectrum, each trailing a beam of its colour and throwing its own ray of
 * coloured light on the floor — decelerate, hang in the air, and burn out.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the lance** (`createPrismMaterial`) — refracted interior, spectral
 *      fresnel rim, glowing facet edges, formation and burn-out dissolves.
 *      Behind it a crossed-ribbon comet (`createBeamMaterial`).
 *   2. **the split** — three shards (own geometry, own material each, own
 *      hue), their spectral beams, and 120 GPU splinters.
 *   3. **lightfall** (`createLightfallMaterial`) — floor caustics: a pool and
 *      comet under the lance, then the three coloured rays of the split.
 *      **the lens** (`createLensMaterial`, `LAYER.DISTORTION`) — the crystal
 *      bending what is behind it, and the split's pressure ring.
 *   4. **particles** — glints off the lance, spectral streaks off the split
 *      and the shards, glassy chips at the split.
 *   5. **the split beat** — flash, camera knock, light punch, FROST shell,
 *      SHOCKWAVE and FROST decals.
 *
 * ## The choir (the linger)
 *
 *   6. **the choir** (`createChoirSpireGeometry`, `createChoirSolidMaterial`,
 *      `createChoirGlowMaterial`) — where each shard's flight ends, a cluster
 *      of seven quartz pipes, graded like an organ front with the middle pipe
 *      2.4 m tall, breaks out of the floor in that shard's colour (lit, flat
 *      facets, `LAYER.WORLD`, casting shadows) and *sings*: through the hang
 *      a ring of light climbs each pipe in turn and flares at its tip, so the
 *      three clusters ring across the fan like a chord. Its place is derived
 *      every frame from the split point, the live split angle and reach. At
 *      the exit the pipes sink back and burn out from the tips down.
 *   7. **the rime** (`createChoirRimeMaterial`) — a faceted crystal floor
 *      spreading under each cluster in its hue, deep in the cells and bright
 *      on the seams, with spectral cracks pulsing outward with the song. It
 *      stays for the whole hang, so the fan is written on the ground.
 *
 * ## Hits (`handlesOwnHits`)
 *
 * Unchanged from the candidate: the lance throws whatever is within `reach`
 * of its swept path (including its terminal edge); each shard throws whatever
 * is within `reach` of the segment it swept this frame, along its own heading.
 * Nothing is hit twice.
 *
 * ## The editor rule
 *
 * A cast keeps the split origin and how far the shards have swept. Every size,
 * angle, colour and timing is read from `settings['prism-choir']` every frame.
 */
export class PrismChoirAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Crystals on screen. HUD readout only. */
  get instanceCount() {
    let n = this.primary.visible ? 1 : 0;
    for (const s of this.shards) if (s.visible) n++;
    return n;
  }

  get impactDuration() {
    return Math.max(0.1, this.config.splitDuration) * settings.global.lifetime;
  }

  get fadeDuration() {
    return Math.max(0.2, this.config.lifetime) * settings.global.lifetime;
  }

  /** Crystal light glitters rather than gutters. */
  lightShimmer() {
    return 0.9 + 0.1 * Math.sin(this.age * 23.0) * Math.sin(this.age * 7.1);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the lance and its comet ---- */
    this.geo = createLanceGeometry();
    this.mat = createPrismMaterial(0);
    this.primary = this._mesh(this.geo, this.mat, LAYER.VFX, 12);

    this.trailGeometry = createTrailGeometry();
    this.lanceTrailMaterial = createBeamMaterial(0);
    this.lanceTrail = this._mesh(this.trailGeometry, this.lanceTrailMaterial, LAYER.VFX, 10);

    /* ---- layer 2: the three shards and their beams ---- */
    this.shardGeometry = createShardGeometry();
    this.shards = [];
    this.shardMaterials = [];
    this.trails = [];
    this.trailMaterials = [];
    this._arms = [];
    for (let i = 0; i < SHARDS; i++) {
      const material = createPrismMaterial(i * 2.1);
      this.shardMaterials.push(material);
      this.shards.push(this._mesh(this.shardGeometry, material, LAYER.VFX, 12));
      const beam = createBeamMaterial(i * 2.1);
      this.trailMaterials.push(beam);
      this.trails.push(this._mesh(this.trailGeometry, beam, LAYER.VFX, 11));
      this._arms.push(new Vector3(0, 0, 1));
    }

    /* ---- layer 3: lightfall on the floor, and the lens ---- */
    this.lightfallGeometry = createLightfallGeometry();
    this.lightfallMaterial = createLightfallMaterial();
    this.lightfall = this._mesh(this.lightfallGeometry, this.lightfallMaterial, LAYER.VFX, 1);

    this.lensGeometry = createLensGeometry();
    this.lensMaterial = createLensMaterial();
    this.lens = this._mesh(this.lensGeometry, this.lensMaterial, LAYER.DISTORTION, 0);

    /* ---- layer 6: the choir — one cluster per shard ---- */
    this.spireGeometry = createChoirSpireGeometry();
    this.spireSolids = [];
    this.spireSolidMaterials = [];
    this.spireGlows = [];
    this.spireGlowMaterials = [];
    this._centres = [];
    for (let i = 0; i < SHARDS; i++) {
      const solidMat = createChoirSolidMaterial();
      const solid = this._mesh(this.spireGeometry, solidMat, LAYER.WORLD, 5);
      solid.castShadow = true;
      solid.receiveShadow = true;
      const glowMat = createChoirGlowMaterial();
      const glow = this._mesh(this.spireGeometry, glowMat, LAYER.VFX, 6);
      this.spireSolidMaterials.push(solidMat);
      this.spireSolids.push(solid);
      this.spireGlowMaterials.push(glowMat);
      this.spireGlows.push(glow);
      this._centres.push(new Vector3());
    }
    /* ---- layer 7: the rime under the choir (same quad as the lightfall) ---- */
    this.rimeMaterial = createChoirRimeMaterial();
    this.rime = this._mesh(this.lightfallGeometry, this.rimeMaterial, LAYER.VFX, 0);
    this._spireState = { hue: 0, sing: 0, fade: 1 };
    this._spireGlowState = { time: 0, hue: 0, sing: 0, fade: 1 };
    this._rimeState = { time: 0, centres: this._centres, arms: null, hues: null, grow: 0, dissolve: 0, sing: 0 };
    /** Whether the clusters have broken the floor / started sinking this cast. */
    this._spiresBroke = false;
    this._spiresSank = false;
    this._broke = 0;

    /** Scratch handed to the materials each frame — one object apiece. */
    this._crystalState = { time: 0, fade: 1, form: 1, hue: 0 };
    this._beamState = { time: 0, fade: 1, hue: 0, length: 1, tail: 4, width: 0.2, glow: 1 };
    this._splinterState = { time: 0, burst: 0, fade: 1 };
    this._hues = [0, 2.1, 4.2];
    this._lightfallState = {
      time: 0,
      origin: this.origin,
      dir: this.direction,
      lance: new Vector3(),
      lancePower: 0,
      split: new Vector3(),
      arms: this._arms,
      hues: this._hues,
      armLength: 0,
      fanPower: 0
    };
    this._lensState = { size: 1, strength: 0, ring: 0 };
    this._rimeState.arms = this._arms;
    this._rimeState.hues = this._hues;

    this.hit = new Set();
    this.found = [];
    this.tmp = new Vector3();
    this.splitOrigin = new Vector3();
    this.splitStart = new Vector3();
    this.splitEnd = new Vector3();
    this.splitPrevious = 0;
    this.prev = 0;
    this.longAxis = new Vector3(0, 1, 0);
    this.flightDirection = new Vector3();
    this.spin = new Quaternion();
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  _mesh(geometry, material, layer, order) {
    const mesh = new Mesh(geometry, material);
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    /* ---- the 120 splinters, owned by this instance ---- */
    this.splinterGeometry = createSplinterGeometry();
    this.splinterMaterial = createSplinterMaterial();
    this.splinters = new Points(this.splinterGeometry, this.splinterMaterial);
    this.splinters.layers.set(LAYER.VFX);
    this.splinters.frustumCulled = false;
    this.splinters.visible = false;
    this.group.add(this.splinters);

    /* ---- pooled systems (optional: a bare test context has none) ---- */
    const particles = this.ctx.particles;
    this.glints = particles?.get?.(`${ID}.glints`, {
      capacity: 1200,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    }) ?? null;
    if (this.glints) {
      const u = this.glints.uniforms;
      u.uSizeIn.value = 0.05;
      u.uFadeIn.value = 0.05;
      u.uFadeOut.value = 0.5;
      u.uEndSize.value = 0.2;
      u.uDrag.value = 2.2;
      u.uTurbFrequency.value = 0.9;
      u.uTurbSpeed.value = 0.6;
    }
    this.streaks = particles?.get?.(`${ID}.streaks`, {
      capacity: 1200,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    }) ?? null;
    if (this.streaks) {
      const u = this.streaks.uniforms;
      u.uSizeIn.value = 0.02;
      u.uFadeIn.value = 0.02;
      u.uFadeOut.value = 0.5;
      u.uEndSize.value = 0.3;
      u.uDrag.value = 2;
    }
    this.chips = particles?.get?.(`${ID}.chips`, {
      capacity: 600,
      shape: ParticleShape.CHIP,
      additive: true,
      softFade: 0.15
    }) ?? null;
    if (this.chips) {
      const u = this.chips.uniforms;
      u.uSizeIn.value = 0.02;
      u.uFadeIn.value = 0.02;
      u.uFadeOut.value = 0.35;
      u.uEndSize.value = 0.6;
      u.uDrag.value = 0.6;
    }
    this.glintEmitter = new RateEmitter();
    this.streakEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.hit.clear();
    this.prev = 0;
    this.splitPrevious = 0;
    this.glintEmitter.reset();
    this.streakEmitter.reset();

    this.primary.visible = true;
    this.lanceTrail.visible = true;
    this.lightfall.visible = true;
    this.lens.visible = true;
    for (const s of this.shards) s.visible = false;
    for (const t of this.trails) t.visible = false;
    this.splinters.visible = false;
    for (const m of this.spireSolids) m.visible = false;
    for (const m of this.spireGlows) m.visible = false;
    this.rime.visible = false;
    this._spiresBroke = false;
    this._spiresSank = false;

    // Every material back to whole, before the first frame draws.
    const cs = this._crystalState;
    cs.time = 0;
    cs.fade = 1;
    cs.form = 0;
    cs.hue = 0;
    this.mat.userData.sync(cs);
    for (let i = 0; i < SHARDS; i++) {
      cs.form = 1;
      cs.hue = this._hue(i);
      this.shardMaterials[i].userData.sync(cs);
    }
    const ss = this._splinterState;
    ss.time = 0;
    ss.burst = 0;
    ss.fade = 1;
    this.splinterMaterial.userData.sync(ss);
    this._beamState.fade = 1;
    this._lightfallState.lancePower = 0;
    this._lightfallState.fanPower = 0;
    this._lightfallState.armLength = 0;
    this._lensState.ring = 0;

    this._placeLightfall();
    this._drawPrimary(0);
  }

  /** Shard `i`'s place in the spectrum, radians. */
  _hue(i) {
    return i * 2.1 * this.config.spectralSpread;
  }

  /** Re-derive the three arm headings from the live split angle. */
  _updateArms() {
    const angle = this.config.splitAngle;
    for (let i = 0; i < SHARDS; i++) {
      const a = (i - 1) * angle;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      this._arms[i].set(this.direction.x * ca + this.side.x * sa, 0, this.direction.z * ca + this.side.z * sa);
    }
  }

  /** The lightfall quad covers the line and the whole fan beyond it. */
  _placeLightfall() {
    const c = this.config;
    const fanHalf = c.splitDistance * Math.sin(Math.min(1.4, Math.abs(c.splitAngle))) + c.fanWidth + 1;
    const extent = this.length + c.splitDistance + 2 * c.causticRadius;
    this.lightfall.position.copy(this.origin).addScaledVector(this.direction, (this.length + c.splitDistance) / 2);
    this.lightfall.position.y = 0.04;
    this.lightfall.rotation.set(0, Math.atan2(this.direction.x, this.direction.z), 0);
    this.lightfall.scale.set(2 * Math.max(fanHalf + c.rimeRadius * 0.6, c.causticRadius + 0.5), 1, extent + c.rimeRadius);
    this.rime.position.copy(this.lightfall.position);
    this.rime.position.y = 0.035;
    this.rime.rotation.copy(this.lightfall.rotation);
    this.rime.scale.copy(this.lightfall.scale);
  }

  /** Pose the lance `d` metres down the line. */
  _drawPrimary(d) {
    const c = this.config;
    this.pointAt(Math.min(1, d / this.length), this.tmp);
    this.primary.position.copy(this.tmp);
    this.primary.position.y = c.flightHeight;
    this._orient(this.primary, this.direction.x, this.direction.z, this.age * c.spinRate * settings.global.animationSpeed);
    // Condensing out of the air: a quick overshooting grow and a dissolve-in.
    const form = saturate(this.age / Math.max(0.01, c.formTime * settings.global.lifetime));
    this.primary.scale.setScalar(c.size * (0.35 + 0.65 * Easing.outBack(form)));
    const cs = this._crystalState;
    cs.time = this.age;
    cs.fade = 1;
    cs.form = form;
    cs.hue = 0;
    this.mat.userData.sync(cs);
    this.position.copy(this.tmp);
    this.position.y = c.flightHeight;

    // The comet from the caster to the lance.
    this.lanceTrail.position.copy(this.origin);
    this.lanceTrail.position.y = c.flightHeight;
    this.lanceTrail.rotation.set(0, Math.atan2(this.direction.x, this.direction.z), 0);
    this.lanceTrail.scale.set(1, 1, Math.max(0.001, d));
    const bs = this._beamState;
    bs.time = this.age;
    bs.fade = form;
    bs.hue = 0;
    bs.length = d;
    bs.tail = c.lanceTrailLength;
    bs.width = c.lanceTrailWidth * c.size / 0.65;
    bs.glow = c.lanceTrailGlow;
    this.lanceTrailMaterial.userData.sync(bs);

    // The lens rides the lance.
    this.lens.position.copy(this.primary.position);
    const ls = this._lensState;
    ls.size = c.lensSize * c.size / 0.65;
    ls.strength = form;
    ls.ring = 0;
    this.lensMaterial.userData.sync(ls);

    const lf = this._lightfallState;
    lf.lance.copy(this.tmp).setY(0);
    lf.lancePower = form;
  }

  /** Turn a crystal's long axis (+Y) onto a flat heading, then spin it about it. */
  _orient(mesh, dx, dz, spin) {
    this.flightDirection.set(dx, 0, dz).normalize();
    mesh.quaternion.setFromUnitVectors(this.longAxis, this.flightDirection);
    this.spin.setFromAxisAngle(this.longAxis, spin);
    mesh.quaternion.multiply(this.spin);
  }

  _syncLightfall() {
    const lf = this._lightfallState;
    lf.time = this.age;
    for (let i = 0; i < SHARDS; i++) this._hues[i] = this._hue(i);
    this._placeLightfall();
    this.lightfallMaterial.userData.sync(lf);
  }

  /* ------------------------------------------------------------------ */
  /* Hits                                                                */
  /* ------------------------------------------------------------------ */

  _applyForce() {
    const c = this.config;
    this._force.impulse = c.impulse;
    this._force.lift = c.lift;
    this._force.spin = c.hitSpin;
    return this._force;
  }

  _hitShape(position, r) {
    const found = this.ctx.dummies?.findTargets?.(position.x, position.z, r, this.found) ?? [];
    for (const d of found) {
      if (this.hit.has(d)) continue;
      const dx = d.position.x - position.x,
        dz = d.position.z - position.z;
      if (dx * dx + dz * dz > r * r) continue;
      this.hit.add(d);
      if (d.kill?.(this.direction.x, this.direction.z, this._applyForce(), false)) this._struck(d);
    }
  }

  /** Throw whatever is within `reach` of the segment a→b, along a→b. */
  _hitSegment(a, b) {
    const cx = (a.x + b.x) / 2,
      cz = (a.z + b.z) / 2,
      dx = b.x - a.x,
      dz = b.z - a.z,
      len = dx * dx + dz * dz,
      r = this.config.reach;
    const found = this.ctx.dummies?.findTargets?.(cx, cz, Math.sqrt(len) / 2 + r, this.found) ?? [];
    for (const target of found) {
      if (this.hit.has(target)) continue;
      const px = target.position.x - a.x,
        pz = target.position.z - a.z,
        u = len > 1e-9 ? Math.max(0, Math.min(1, (px * dx + pz * dz) / len)) : 0,
        ex = px - u * dx,
        ez = pz - u * dz;
      if (ex * ex + ez * ez > r * r) continue;
      this.hit.add(target);
      const distance = Math.sqrt(len);
      const ok = target.kill?.(
        distance > 1e-5 ? dx / distance : this.direction.x,
        distance > 1e-5 ? dz / distance : this.direction.z,
        this._applyForce(),
        false
      );
      if (ok) this._struck(target);
    }
  }

  /** A body was thrown: spectral streaks off it and a glitter of light. */
  _struck(target) {
    const c = this.config;
    _pos.copy(target.position).setY(1);
    this._syncParticles();
    this._streakBurst(_pos, Math.round(16 * settings.global.particleCount), 0.7);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.5);
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const begin = this.prev,
      end = Math.min(this.length, this.front),
      step = Math.max(0.15, this.config.reach * 0.6);
    for (let d = begin; d <= end; d += step) {
      this.pointAt(Math.min(1, d / this.length), this.tmp);
      this._hitShape(this.tmp, this.config.reach);
    }
    // The terminal edge is always checked, even on a long frame.
    this.pointAt(end / this.length, this.tmp);
    this._hitShape(this.tmp, this.config.reach);
    this.prev = end;
    this._drawPrimary(end);
    this._updateArms();
    this._syncLightfall();
    this._syncParticles();
    this._glintFx(dt);
  }

  onImpact() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    // Always issued, so the host's own envelope sees a zero when shake is off.
    this.ctx.shake?.add?.(c.impactShake * g.cameraShake, 6, 22);
    this.ctx.flash?.trigger?.(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.lightIntensity * c.splitLight * power;

    this.splitPrevious = 0;
    this.pointAt(1, this.splitOrigin);
    this.splinters.position.copy(this.splitOrigin);
    this.splinters.position.y = c.flightHeight;
    this.splinters.visible = true;
    this._lightfallState.split.copy(this.splitOrigin).setY(0);
    this._updateArms();
    // Pose the shards and beams at t = 0 before they show: the frame renders
    // before the first onFade, so otherwise they would draw for one frame at
    // the previous cast's hang (or at the group origin on the very first cast).
    for (let i = 0; i < SHARDS; i++) {
      const arm = this._arms[i];
      const s = this.shards[i];
      s.position.set(this.splitOrigin.x, c.shardHeight, this.splitOrigin.z);
      s.scale.setScalar(Math.max(0.001, c.size * c.shardScale * 0.3));
      this._orient(s, arm.x, arm.z, this.age * c.shardSpin * g.animationSpeed + i);
      this._poseTrail(i, 0, 1);
      s.visible = true;
      this.trails[i].visible = true;
    }
    this._shardFade(1);

    _pos.copy(this.splitOrigin).setY(c.flightHeight);
    this.ctx.bursts?.spawn?.(BurstMode.FROST, _pos, {
      radius: c.burstSize * 0.15,
      endRadius: c.burstSize * power,
      life: 0.5,
      intensity: c.burstIntensity,
      opacity: 0.65,
      fresnel: 2.5,
      displace: 0.15,
      turbulence: 0.6,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    _pos.y = 0;
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: c.shockRadius * power,
      life: 0.5,
      width: 0.05,
      intensity: 1,
      colorA: getColor(c.colorBurstB),
      colorB: getColor(c.colorBurstA)
    });
    this.ctx.decals?.spawn?.(DecalType.FROST, _pos, {
      radius: c.frostRadius * power,
      life: Math.max(0.6, this.fadeDuration + this.impactDuration),
      intensity: 0.8,
      colorA: getColor(c.colorCrystalBody),
      colorB: getColor(c.colorCrystalRim)
    });

    this._syncParticles();
    _pos.y = c.flightHeight;
    this._streakBurst(_pos, Math.round(c.streakCount * g.particleCount), 1);
    this._chipBurst(_pos, Math.round(c.chipCount * g.particleCount));
  }

  onFade(dt, t) {
    const c = this.config;
    const g = settings.global;
    this._updateArms();
    if (t <= 1) {
      // Out fast, slowing to a hang: the hit sweep follows the same curve.
      const travel = c.splitDistance * Easing.outQuad(t);
      const grow = Easing.outBack(saturate(t / 0.15));
      for (let i = 0; i < SHARDS; i++) {
        const arm = this._arms[i];
        const dx = arm.x,
          dz = arm.z;
        this.tmp.set(this.splitOrigin.x + dx * travel, 0, this.splitOrigin.z + dz * travel);
        const s = this.shards[i];
        // As its pipes break the floor the shard climbs to crown them.
        const crowning = Easing.outCubic(saturate((t - c.spireStart) / Math.max(0.02, c.spireGrow)));
        s.position.set(this.tmp.x, c.shardHeight + (this._crownHeight() - c.shardHeight) * crowning, this.tmp.z);
        s.scale.setScalar(Math.max(0.001, c.size * c.shardScale * (0.3 + 0.7 * grow)));
        this._orient(s, dx, dz, this.age * c.shardSpin * g.animationSpeed + i);
        this.splitStart.set(this.splitOrigin.x + dx * this.splitPrevious, 0, this.splitOrigin.z + dz * this.splitPrevious);
        this.splitEnd.copy(this.tmp);
        this._hitSegment(this.splitStart, this.splitEnd);
        this._poseTrail(i, travel, 1);
      }
      this.splitPrevious = travel;
      this._splinterState.burst = t;
      this._splinterState.fade = 1;
      this._shardFade(1);
      this._shardFx(dt, travel);

      // The lance shatters away over the first moments of the split.
      const shatter = saturate(t / Math.max(0.01, c.shatterTime));
      this.primary.visible = shatter < 1;
      if (this.primary.visible) {
        this.primary.scale.setScalar(c.size * (1 + 0.35 * shatter));
        const cs = this._crystalState;
        cs.time = this.age;
        cs.fade = 1 - shatter;
        cs.form = 1;
        cs.hue = 0;
        this.mat.userData.sync(cs);
      }
      this.lanceTrailMaterial.uniforms.uFade.value = (1 - shatter) * g.opacity;
      this.lanceTrail.visible = shatter < 1;

      const lf = this._lightfallState;
      lf.lancePower = 1 - shatter;
      lf.fanPower = Easing.outCubic(saturate(t * 3));
      lf.armLength = travel;

      // The choir breaks the floor as the shards arrive.
      const rising = saturate((t - c.spireStart) / Math.max(0.02, c.spireGrow));
      this._updateChoir(dt, rising, 0, 1);

      // The lens leaves the lance and becomes the split's pressure ring.
      const ls = this._lensState;
      this.lens.position.copy(this.splitOrigin);
      this.lens.position.y = c.flightHeight;
      ls.size = c.lensSize + c.shockRadius * 0.6;
      ls.strength = 1 - shatter;
      ls.ring = Easing.outCubic(t);
      this.lensMaterial.userData.sync(ls);
      this.lens.visible = t < 0.98;
    } else {
      // The hang: the shards drift and slow their spin while they burn out.
      const ft = t - 1;
      const fade = 2 - t;
      for (let i = 0; i < SHARDS; i++) {
        const arm = this._arms[i];
        const s = this.shards[i];
        s.position.set(
          this.splitOrigin.x + arm.x * c.splitDistance,
          this._crownHeight() + 0.15 * Math.sin(ft * 3 + i * 2.1),
          this.splitOrigin.z + arm.z * c.splitDistance
        );
        s.scale.setScalar(Math.max(0.001, c.size * c.shardScale * (1 + 0.15 * ft)));
        this._orient(s, arm.x, arm.z, this.age * c.shardSpin * g.animationSpeed * (1 - 0.6 * ft) + i);
        this._poseTrail(i, c.splitDistance, fade);
      }
      this._shardFade(fade);
      this._splinterState.burst = 1;
      this._splinterState.fade = fade;
      this.primary.visible = false;
      this.lanceTrail.visible = false;
      this.lens.visible = false;
      const lf = this._lightfallState;
      lf.lancePower = 0;
      lf.fanPower = Math.max(fade, c.fanLinger * (1 - saturate((ft - (1 - c.spireSink)) / Math.max(0.02, c.spireSink))));
      lf.armLength = c.splitDistance;

      // The choir sings through the hang, then sinks.
      const sink = saturate((ft - (1 - c.spireSink)) / Math.max(0.02, c.spireSink));
      this._updateChoir(dt, 1, sink, 1);
    }
    this._splinterState.time = this.age;
    this.splinterMaterial.userData.sync(this._splinterState);
    this._syncLightfall();
    this._syncParticles();
    this.pointAt(1, this.position);
    this.position.y = c.flightHeight;
  }

  /**
   * The three clusters and the rime, resolved from the live settings: each
   * stands at the end of its arm (split point + arm × splitDistance), turned
   * to face back down the arm, grown by `grow` (0..1, overshooting) and sunk
   * by `sink` (0..1). Sings once it stands.
   */
  _updateChoir(dt, grow, sink, _fade) {
    const c = this.config;
    const g = settings.global;
    const stand = grow > 0 && sink < 1;
    const up = Easing.outBack(grow);
    const down = Easing.inQuad(sink);
    const sing = c.spireSing * saturate(grow * 1.5 - 0.5) * (1 - down) + 0.6 * Math.exp(-Math.max(0, this.age - this._broke) * 4) * (this._spiresBroke ? 1 : 0);
    for (let i = 0; i < SHARDS; i++) {
      const arm = this._arms[i];
      const centre = this._centres[i];
      centre.set(this.splitOrigin.x + arm.x * c.splitDistance, 0, this.splitOrigin.z + arm.z * c.splitDistance);
      const solid = this.spireSolids[i];
      const glow = this.spireGlows[i];
      solid.visible = stand;
      glow.visible = stand;
      if (!stand) continue;
      const h = c.spireScale * Math.max(0.001, up) * (1 - down);
      const w = c.spireScale * c.spireWidth * (0.7 + 0.3 * Math.min(1, up));
      solid.position.copy(centre);
      solid.position.y = -0.25 * down;
      solid.rotation.set(0, Math.atan2(arm.x, arm.z) + Math.PI, 0);
      solid.scale.set(w, Math.max(0.001, h), w);
      glow.position.copy(solid.position);
      glow.rotation.copy(solid.rotation);
      glow.scale.copy(solid.scale);
      const hue = this._hue(i);
      const ss = this._spireState;
      ss.hue = hue;
      ss.sing = sing * (0.75 + 0.25 * Math.sin(this.age * 6 + i * 2.1));
      ss.fade = 1 - down;
      this.spireSolidMaterials[i].userData.sync(ss);
      const gs = this._spireGlowState;
      gs.time = this.age + i * 0.33;
      gs.hue = hue;
      gs.sing = sing;
      gs.fade = 1 - 0.85 * down;
      this.spireGlowMaterials[i].userData.sync(gs);
    }

    // Breaking the floor, and starting to sink: one chip burst each, per cluster.
    if (grow > 0 && !this._spiresBroke) {
      this._spiresBroke = true;
      this._broke = this.age;
      this._syncParticles();
      for (let i = 0; i < SHARDS; i++) {
        _pos.copy(this._centres[i]).setY(0.3);
        this._chipBurst(_pos, Math.round(c.spireChips * g.particleCount));
      }
      this.ctx.shake?.add?.(c.impactShake * 0.5 * g.cameraShake, 7, 18);
      this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.splitLight * 0.5 * g.explosionIntensity);
    }
    if (sink > 0 && !this._spiresSank) {
      this._spiresSank = true;
      this._syncParticles();
      for (let i = 0; i < SHARDS; i++) {
        _pos.copy(this._centres[i]).setY(1.2 * c.spireScale);
        this._chipBurst(_pos, Math.round(c.spireChips * 0.6 * g.particleCount));
      }
    }

    const rs = this._rimeState;
    rs.time = this.age;
    rs.grow = Easing.outCubic(saturate(grow * 1.4));
    rs.dissolve = Easing.inQuad(sink);
    rs.sing = sing;
    this.rime.visible = grow > 0 && sink < 1;
    this.rimeMaterial.userData.sync(rs);
  }

  /** Where a shard hangs over its cluster: just above the tallest pipe. */
  _crownHeight() {
    return 2.4 * this.config.spireScale + 0.55;
  }

  /** Every shard's material at the same fade, each at its own hue. */
  _shardFade(fade) {
    const cs = this._crystalState;
    cs.time = this.age;
    cs.fade = fade;
    cs.form = 1;
    for (let i = 0; i < SHARDS; i++) {
      cs.hue = this._hue(i);
      this.shardMaterials[i].userData.sync(cs);
    }
  }

  /** Beam `i` from the split to its shard, `travel` metres long. */
  _poseTrail(i, travel, fade) {
    const c = this.config;
    const arm = this._arms[i];
    const trail = this.trails[i];
    trail.position.copy(this.splitOrigin);
    trail.position.y = c.shardHeight;
    trail.rotation.set(0, Math.atan2(arm.x, arm.z), 0);
    trail.scale.set(1, 1, Math.max(0.001, travel));
    const bs = this._beamState;
    bs.time = this.age;
    bs.fade = fade;
    bs.hue = this._hue(i);
    bs.length = travel;
    bs.tail = c.splitDistance;
    bs.width = c.trailWidth;
    bs.glow = c.trailGlow;
    this.trailMaterials[i].userData.sync(bs);
  }

  /* ------------------------------------------------------------------ */
  /* Particles                                                           */
  /* ------------------------------------------------------------------ */

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

  /** Glints shed along the lance as it flies. */
  _glintFx(dt) {
    if (!this.glints) return;
    const c = this.config;
    const n = Math.round(this.glintEmitter.tick(dt, c.glintRate) * settings.global.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.position = this.primary.position;
    _emit.radius = 0.3 * c.size / 0.65;
    _emit.speed = 0.4;
    _emit.spread = 1;
    _emit.size = c.glintSize;
    _emit.life = c.glintLife;
    this.glints.emit(n, _emit);
  }

  /** Streaks shed off each shard as it flies. */
  _shardFx(dt, travel) {
    if (!this.streaks || travel <= 0) return;
    const c = this.config;
    const n = Math.round(this.streakEmitter.tick(dt, c.streakRate * SHARDS) * settings.global.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.speed = c.streakSpeed * 0.25;
    _emit.spread = 0.6;
    _emit.size = c.streakSize;
    _emit.life = c.streakLife;
    for (let k = 0; k < n; k++) {
      const i = k % SHARDS;
      _emit.position = this.shards[i].position;
      _dir.copy(this._arms[i]).negate().addScaledVector(_up, 0.3).normalize();
      _emit.direction = _dir;
      this.streaks.emit(1, _emit);
    }
  }

  _streakBurst(at, count, strength) {
    if (!this.streaks || count <= 0) return;
    const c = this.config;
    this._resetEmit(frame.uTime.value);
    _emit.position = at;
    _emit.radius = 0.15;
    _emit.direction = this.direction;
    _emit.speed = c.streakSpeed * strength;
    _emit.speedVariance = 0.5;
    _emit.spread = 1;
    _emit.size = c.streakSize;
    _emit.life = c.streakLife;
    this.streaks.emit(count, _emit);
  }

  _chipBurst(at, count) {
    if (!this.chips || count <= 0) return;
    const c = this.config;
    this._resetEmit(frame.uTime.value);
    _emit.position = at;
    _emit.radius = 0.2;
    _emit.direction = _up;
    _emit.speed = c.chipSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 1;
    _emit.size = c.chipSize;
    _emit.life = c.chipLife;
    _emit.spin = 9;
    this.chips.emit(count, _emit);
  }

  /** Pooled systems are shared by name; refresh them from settings every frame. */
  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    if (this.glints) {
      this.glints.setGradient(getColor(c.colorGlintA), getColor(c.colorGlintB), getColor(c.colorGlintC), getColor(c.colorGlintD));
      const u = this.glints.uniforms;
      u.uGravity.value.set(0, 0.4, 0);
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
      u.uOpacity.value = g.opacity;
      u.uGlow.value = c.glintGlow * g.glow;
      u.uTurbulence.value = 0.5 * g.turbulence;
    }
    if (this.streaks) {
      this.streaks.setGradient(getColor(c.colorStreakA), getColor(c.colorStreakB), getColor(c.colorStreakC), getColor(c.colorStreakD));
      const u = this.streaks.uniforms;
      u.uGravity.value.set(0, -1.5, 0);
      u.uStretch.value = c.streakStretch;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
      u.uOpacity.value = g.opacity;
      u.uGlow.value = c.streakGlow * g.glow;
      u.uTurbulence.value = 0.15 * g.turbulence;
    }
    if (this.chips) {
      this.chips.setGradient(getColor(c.colorChipA), getColor(c.colorChipB), getColor(c.colorChipC), getColor(c.colorChipD));
      const u = this.chips.uniforms;
      u.uGravity.value.set(0, -c.chipGravity, 0);
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
      u.uOpacity.value = g.opacity;
      u.uGlow.value = g.glow;
      u.uTurbulence.value = 0.1 * g.turbulence;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.hit.clear();
    this.splinters.visible = false;
    this.primary.visible = false;
    this.lanceTrail.visible = false;
    this.lightfall.visible = false;
    this.lens.visible = false;
    for (const s of this.shards) s.visible = false;
    for (const t of this.trails) t.visible = false;
    for (const m of this.spireSolids) m.visible = false;
    for (const m of this.spireGlows) m.visible = false;
    this.rime.visible = false;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.shardGeometry.dispose();
    for (const m of this.shardMaterials) m.dispose();
    this.trailGeometry.dispose();
    this.lanceTrailMaterial.dispose();
    for (const m of this.trailMaterials) m.dispose();
    this.splinterGeometry.dispose();
    this.splinterMaterial.dispose();
    this.lightfallGeometry.dispose();
    this.lightfallMaterial.dispose();
    this.lensGeometry.dispose();
    this.lensMaterial.dispose();
    this.spireGeometry.dispose();
    for (const m of this.spireSolidMaterials) m.dispose();
    for (const m of this.spireGlowMaterials) m.dispose();
    this.rimeMaterial.dispose();
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
  for (const stop of ['A', 'B', 'C', 'D']) folder.addColor(c, `${prefix}${stop}`);
  return folder;
};
const castAnimation = (folder, c, Editor) =>
  typeof Editor.castAnimation === 'function' ? Editor.castAnimation(folder, c) : folder.add(c, 'castAnim', CAST_ANIMATIONS);
const color = (folder, c, key, label) => {
  const controller = folder.addColor(c, key);
  return controller?.name ? controller.name(label) : controller;
};

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('◈  Prism Choir');
  const R = Editor.range;

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 4, 48, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 80, 0.5, 'lance flies at (m/s)');
  R(cast, c, 'lifetime', 0.2, 6, 0.05, 'shards hang for (s)');
  R(cast, c, 'cooldown', 0, 30, 0.1, 'cooldown');
  castAnimation(cast, c, Editor);

  const light = sub(folder, 'Light');
  color(light, c, 'lightColor', 'colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');

  const lance = sub(folder, '1 · The lance');
  R(lance, c, 'size', 0.2, 2, 0.05, 'crystal size');
  R(lance, c, 'flightHeight', 0.2, 3, 0.01, 'flies at height (m)');
  R(lance, c, 'formTime', 0, 1, 0.01, 'condenses over (s)');
  R(lance, c, 'spinRate', -12, 12, 0.05, 'spin (rad/s)');
  R(lance, c, 'lanceTrailLength', 0, 20, 0.05, 'comet length (m)');
  R(lance, c, 'lanceTrailWidth', 0.01, 1, 0.005, 'comet width (m)');
  R(lance, c, 'lanceTrailGlow', 0, 8, 0.05, 'comet glow');

  const crystal = sub(folder, '1 · Crystal');
  R(crystal, c, 'crystalGlow', 0, 6, 0.05, 'glow');
  R(crystal, c, 'crystalOpacity', 0, 1, 0.01, 'opacity');
  R(crystal, c, 'fresnelPower', 0.3, 8, 0.05, 'rim tightness');
  R(crystal, c, 'dispersion', 0, 4, 0.01, 'dispersion');
  R(crystal, c, 'edgeGlow', 0, 8, 0.05, 'facet edges');
  R(crystal, c, 'innerGlow', 0, 4, 0.01, 'inner filaments');
  R(crystal, c, 'spectralSpread', 0, 2, 0.05, 'spectral spread');
  color(crystal, c, 'colorCrystalDeep', 'deep');
  color(crystal, c, 'colorCrystalBody', 'body');
  color(crystal, c, 'colorCrystalRim', 'rim');

  const split = sub(folder, '2 · The split');
  R(split, c, 'splitDistance', 1, 12, 0.1, 'split reach');
  R(split, c, 'splitDuration', 0.2, 3, 0.05, 'split time');
  R(split, c, 'splitAngle', 0, 1.4, 0.01, 'fan angle (rad)');
  R(split, c, 'shardScale', 0.1, 2, 0.01, 'shard size (× lance)');
  R(split, c, 'shardHeight', 0.2, 3, 0.01, 'shards fly at (m)');
  R(split, c, 'shardSpin', -12, 12, 0.05, 'shard spin (rad/s)');
  R(split, c, 'shatterTime', 0.01, 0.6, 0.005, 'lance shatters over');
  R(split, c, 'trailWidth', 0.01, 1, 0.005, 'beam width (m)');
  R(split, c, 'trailGlow', 0, 8, 0.05, 'beam glow');
  R(split, c, 'splinterReach', 0, 4, 0.01, 'splinter reach');
  R(split, c, 'splinterSize', 0, 4, 0.01, 'splinter size');
  R(split, c, 'splinterGlow', 0, 8, 0.05, 'splinter glow');

  const floor = sub(folder, '3 · Lightfall & lens');
  R(floor, c, 'causticGlow', 0, 6, 0.05, 'caustic glow');
  R(floor, c, 'causticScale', 0.2, 6, 0.05, 'caustic scale');
  R(floor, c, 'causticRadius', 0.1, 5, 0.05, 'pool radius (m)');
  R(floor, c, 'fanGlow', 0, 6, 0.05, 'ray glow');
  R(floor, c, 'fanWidth', 0.02, 2, 0.01, 'ray width (m)');
  R(floor, c, 'lensStrength', 0, 3, 0.01, 'lens strength');
  R(floor, c, 'lensSize', 0.1, 5, 0.05, 'lens size (m)');
  R(floor, c, 'splitRingStrength', 0, 3, 0.01, 'split ring');

  const fx = sub(folder, '4 · Particles');
  R(fx, c, 'glintRate', 0, 600, 1, 'glints/second');
  R(fx, c, 'glintSize', 0.005, 0.3, 0.005, 'glint size');
  R(fx, c, 'glintLife', 0.05, 3, 0.01, 'glint lifetime');
  R(fx, c, 'glintGlow', 0, 10, 0.05, 'glint glow');
  gradient(fx, c, 'colorGlint', 'glint gradient', Editor);
  R(fx, c, 'streakCount', 0, 200, 1, 'streaks at the split');
  R(fx, c, 'streakRate', 0, 200, 1, 'streaks/second per shard');
  R(fx, c, 'streakSpeed', 0, 30, 0.1, 'streak speed');
  R(fx, c, 'streakSize', 0.005, 0.3, 0.005, 'streak size');
  R(fx, c, 'streakLife', 0.05, 3, 0.01, 'streak lifetime');
  R(fx, c, 'streakStretch', 0, 1, 0.005, 'streak stretch');
  R(fx, c, 'streakGlow', 0, 10, 0.05, 'streak glow');
  gradient(fx, c, 'colorStreak', 'streak gradient', Editor);
  R(fx, c, 'chipCount', 0, 200, 1, 'chips at the split');
  R(fx, c, 'chipSpeed', 0, 20, 0.1, 'chip speed');
  R(fx, c, 'chipSize', 0.01, 0.4, 0.005, 'chip size');
  R(fx, c, 'chipLife', 0.05, 3, 0.01, 'chip lifetime');
  R(fx, c, 'chipGravity', 0, 40, 0.1, 'chip gravity');
  gradient(fx, c, 'colorChip', 'chip gradient', Editor);

  const beat = sub(folder, '5 · The split beat');
  R(beat, c, 'impactShake', 0, 1, 0.01, 'split shake');
  R(beat, c, 'impactFlash', 0, 0.5, 0.01, 'split flash');
  R(beat, c, 'splitLight', 0, 10, 0.05, 'light punch (× intensity)');
  R(beat, c, 'burstSize', 0, 8, 0.05, 'plate shell (m)');
  R(beat, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(beat, c, 'shockRadius', 0, 12, 0.05, 'shockwave (m)');
  R(beat, c, 'frostRadius', 0, 10, 0.05, 'crystal decal (m)');
  color(beat, c, 'colorFlash', 'flash');
  color(beat, c, 'colorBurstA', 'shell inner');
  color(beat, c, 'colorBurstB', 'shell mid');
  color(beat, c, 'colorBurstC', 'shell outer');

  const choir = sub(folder, '7 · The choir');
  R(choir, c, 'spireScale', 0.2, 3, 0.01, 'cluster size');
  R(choir, c, 'spireWidth', 0.3, 2.5, 0.01, 'cluster width');
  R(choir, c, 'spireStart', 0, 1, 0.01, 'breaks the floor at (× split)');
  R(choir, c, 'spireGrow', 0.02, 1, 0.01, 'stands over (× split)');
  R(choir, c, 'spireSink', 0.02, 1, 0.01, 'sinks over (× hang)');
  R(choir, c, 'spireGlow', 0, 4, 0.05, 'quartz glow');
  R(choir, c, 'spireSing', 0, 4, 0.05, 'song');
  R(choir, c, 'spireSingRate', 0, 6, 0.05, 'rings / s');
  R(choir, c, 'spireBands', 0.2, 4, 0.05, 'ring tightness');
  R(choir, c, 'spireTint', 0, 1, 0.01, 'hue in the quartz');
  R(choir, c, 'spireDeep', 0, 1, 0.01, 'body brightness');
  R(choir, c, 'spireRoughness', 0, 1, 0.01, 'roughness');
  R(choir, c, 'spireMetalness', 0, 1, 0.01, 'metalness');
  R(choir, c, 'spireChips', 0, 80, 1, 'chips per cluster');
  R(choir, c, 'rimeRadius', 0.2, 6, 0.05, 'rime radius (m)');
  R(choir, c, 'rimeFacets', 0.3, 8, 0.05, 'rime facets / m');
  R(choir, c, 'rimeGlow', 0, 4, 0.05, 'rime glow');
  R(choir, c, 'rimeOpacity', 0, 1, 0.01, 'rime opacity');
  R(choir, c, 'fanLinger', 0, 1, 0.01, 'rays held through the hang');

  const hits = sub(folder, '6 · Hits');
  R(hits, c, 'reach', 0.1, 3, 0.05, 'shard reach');
  R(hits, c, 'impulse', 0, 15, 0.1, 'shard force');
  R(hits, c, 'lift', 0, 8, 0.1, 'shard lift');
  R(hits, c, 'hitSpin', 0, 4, 0.01, 'tumble');

  folder.close();
  return folder;
}
