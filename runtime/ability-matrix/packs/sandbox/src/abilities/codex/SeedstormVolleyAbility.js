import {
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Mesh,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createSaplingGeometry, createSeedGeometry } from '../../assets/codex/SeedstormVolleyGeometry.js';
import {
  createLashWarpMaterial,
  createSaplingMaterial,
  createSeedMaterial,
  createSoilScatterMaterial,
  SOIL_SITES
} from '../../materials/codex/SeedstormVolleyMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

export const ID = 'seedstorm';

const TAU = Math.PI * 2;

/** Hard ceiling on seeds per cast; the editor's count slider clamps to this. */
const MAX_SEEDS = Math.min(16, SOIL_SITES);
/** Sapling silhouettes — each its own InstancedMesh, so no two trees match. */
const VARIANTS = 3;
const SLOTS = Math.ceil(MAX_SEEDS / VARIANTS);
/** Lens rings alive at once (a sprout and a lash per sapling, overlapping). */
const MAX_WARPS = 24;

const _emit = {};
const _pos = new Vector3();
const _pos2 = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _hand = new Vector3();
const _land = new Vector3();
const _floor = new Vector3();
const _crown = new Vector3();
const _up = new Vector3(0, 1, 0);
const _fwd = new Vector3(0, 0, 1);
const _node = new Object3D();
const _q = new Quaternion();
const _roll = new Quaternion();
const _tint = new Color();
/** Each particle system's gradient and multipliers, by settings key — a table, so the sync allocates nothing. */
const LOOKS = [
  { system: 'trail', a: 'colorTrailA', b: 'colorTrailB', c: 'colorTrailC', d: 'colorTrailD', opacity: null, glow: 'trailGlow', glowValue: 1 },
  { system: 'motes', a: 'colorMoteA', b: 'colorMoteB', c: 'colorMoteC', d: 'colorMoteD', opacity: null, glow: null, glowValue: 2.2 },
  { system: 'leaves', a: 'colorLeafA', b: 'colorLeafB', c: 'colorLeafC', d: 'colorLeafD', opacity: null, glow: null, glowValue: 1 },
  { system: 'chips', a: 'colorChipA', b: 'colorChipB', c: 'colorChipC', d: 'colorChipD', opacity: null, glow: null, glowValue: 1 },
  { system: 'dust', a: 'colorDustA', b: 'colorDustB', c: 'colorDustC', d: 'colorDustD', opacity: 'dustOpacity', glow: null, glowValue: 1 }
];
const _used = new Int32Array(VARIANTS);

/**
 * SEEDSTORM VOLLEY — a fan of glowing seeds thrown down the line.
 *
 * A line cast told in four beats per seed, staggered down the line so the
 * grove erupts *toward* the target like a drum roll:
 *
 *   1. **the volley** — instanced almond seeds (`createSeedMaterial`: hot core,
 *      fresnel rim, crawling veins) leave the hand a few hundredths of a
 *      second apart and arc out in a fan, each to its own point down the line.
 *      Every one sheds additive STREAK trails and glowing pollen motes.
 *   2. **the landing** — a seed punches into the floor, kicking up soil chips
 *      and a dust ring, and sits there flaring brighter for `sproutDelay`: the
 *      anticipation beat.
 *   3. **the sapling** — it explodes up out of the floor. One of three
 *      procedural branching trees (`createSaplingGeometry`), drawn by a patched
 *      standard material whose vertex stage grows it along its own path
 *      distance, a band of light riding the grow front, punching past full
 *      height and settling. An EARTH burst, a CRACK decal, chips and a lens
 *      ring on `LAYER.DISTORTION` sell the eruption. Then it **lashes**: it
 *      coils back, whips over toward the nearest body (aimed when it sprouts),
 *      and recoils in a damped wobble. The whole tree flares as it strikes,
 *      tears leaves off its crown and kicks soil from its root; a green
 *      SHOCKWAVE and a second lens ring go out from it.
 *   4. **the wither** — after `lifetime` it browns, its leaves hang and fall,
 *      it slumps and sinks back into the floor it came from.
 *
 * Under it all is **the soil scatter** — one ground strip drawing every
 * landing site analytically (churned earth, clods, the hole, cracks, cooling
 * roots of light), which erodes away as the cast ends and leaves a SCORCH stain
 * behind.
 *
 * ## The strike
 *
 * `handlesOwnHits`: nothing is hit by the volley itself. The lash is the blow —
 * at the instant a sapling's whip comes over, every body within `strikeRadius`
 * of it is thrown *away from that sapling* (`dummy.kill`), and bodies already
 * down are batted on (`dummy.shove`). Two saplings either side of a corpse
 * play catch with it.
 *
 * ## The editor rule
 *
 * A seed record stores only dice plus the events it has latched (landed,
 * sprouted, struck, withering) and the spot and aim it latched them at. Every
 * time and distance is resolved from `settings.seedstorm` each frame, so a
 * seed in the air re-aims when the fan is dragged, and a lash mid-swing
 * changes when its angle is.
 */
export class SeedstormVolleyAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The lash decides what it hits, and when. */
  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    let n = this.seedMesh.count;
    for (const mesh of this.saplingMeshes) n += mesh.count;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    const environment = this.ctx.environment;

    /* ---- layer 1: the seeds ---- */
    this.seedGeometry = createSeedGeometry();
    this.seedState = new InstancedBufferAttribute(new Float32Array(MAX_SEEDS * 2), 2);
    this.seedGeometry.setAttribute('aSeedState', this.seedState);
    this.seedMaterial = createSeedMaterial();
    this.seedMesh = new InstancedMesh(this.seedGeometry, this.seedMaterial, MAX_SEEDS);
    this.seedMesh.name = 'SeedstormSeeds';
    this.seedMesh.layers.set(LAYER.VFX);
    this.seedMesh.frustumCulled = false;
    this.seedMesh.count = 0;
    this.seedMesh.renderOrder = 3;
    this.group.add(this.seedMesh);

    /* ---- layer 3: the saplings ---- */
    this.saplingMaterial = createSaplingMaterial(environment);
    this._shapeKey = '';
    this.saplingMeshes = [];
    this.saplingState = [];
    this.saplingExtra = [];
    for (let v = 0; v < VARIANTS; v++) {
      const state = new InstancedBufferAttribute(new Float32Array(SLOTS * 4), 4);
      const extra = new InstancedBufferAttribute(new Float32Array(SLOTS * 4), 4);
      this.saplingState.push(state);
      this.saplingExtra.push(extra);
      const mesh = new InstancedMesh(this._buildSapling(v), this.saplingMaterial, SLOTS);
      mesh.name = `SeedstormSaplings${v}`;
      mesh.customDepthMaterial = this.saplingMaterial.userData.depth;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // SHAPED: lit and shadowed like the world, but out of the depth prepass,
      // whose override material would rasterise the unbent, ungrown buffer.
      mesh.layers.set(LAYER.SHAPED);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
      this.saplingMeshes.push(mesh);
    }

    /* ---- layer 5: the soil scatter ---- */
    this.soilGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.soilMaterial = createSoilScatterMaterial();
    this.soil = new Mesh(this.soilGeometry, this.soilMaterial);
    this.soil.name = 'SeedstormSoil';
    this.soil.layers.set(LAYER.VFX);
    this.soil.renderOrder = 2;
    this.soil.frustumCulled = false;
    this.soil.visible = false;
    this.group.add(this.soil);
    this._soilState = { start: new Vector3(), dir: new Vector3(), side: new Vector3(), length: 1, width: 1, count: 0, fade: 0 };

    /* ---- layer 7: lens rings ---- */
    const plane = new PlaneGeometry(1, 1);
    this.warpGeometry = new InstancedBufferGeometry();
    this.warpGeometry.index = plane.index;
    this.warpGeometry.setAttribute('position', plane.getAttribute('position'));
    this.warpGeometry.setAttribute('uv', plane.getAttribute('uv'));
    this.warpCenter = new InstancedBufferAttribute(new Float32Array(MAX_WARPS * 3), 3);
    this.warpData = new InstancedBufferAttribute(new Float32Array(MAX_WARPS * 4), 4);
    this.warpGeometry.setAttribute('aCenter', this.warpCenter);
    this.warpGeometry.setAttribute('aWarp', this.warpData);
    this.warpGeometry.instanceCount = MAX_WARPS;
    this.warpMaterial = createLashWarpMaterial();
    this.warp = new Mesh(this.warpGeometry, this.warpMaterial);
    this.warp.name = 'SeedstormWarp';
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.warp.visible = false;
    this.group.add(this.warp);
    this.warps = [];
    for (let i = 0; i < MAX_WARPS; i++) {
      this.warps.push({ x: 0, y: 0, z: 0, age: 0, life: 1, size: 1, strength: 0, seed: 0, active: false });
    }

    /** One record per seed: dice, latched events, and where it latched them. */
    this.seeds = [];
    for (let i = 0; i < MAX_SEEDS; i++) {
      this.seeds.push({
        s: 0, lat: 0, arc: 0, size: 0, yaw: 0, slump: 0, roll: 0, phase: 0,
        rank: 0,
        landed: false, sprouted: false, struck: false, withering: false,
        landX: 0, landZ: 0, landAt: 0, aim: 0,
        trailAcc: 0, moteAcc: 0, fallAcc: 0, growAcc: 0
      });
    }

    this._seed = 0;
    this._clock = 0;
    this._travelEnd = 0;
    this._count = 0;
    this._struck = 0;
    this._firstSprout = false;
    this._fadeT = 0;
    this._flicker = 0;

    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  /** One sapling silhouette from the live shape settings. */
  _buildSapling(variant) {
    const c = settings.seedstorm;
    const geometry = createSaplingGeometry({
      seed: 3.1 + variant * 7.7,
      branches: Math.max(1, Math.round(c.branchCount)),
      twigs: Math.max(0, Math.round(c.twigCount)),
      leaves: Math.max(0, c.leafDensity),
      curve: c.woodCurve,
      spread: c.branchSpread
    });
    geometry.setAttribute('aState', this.saplingState[variant]);
    geometry.setAttribute('aExtra', this.saplingExtra[variant]);
    return geometry;
  }

  /** Rebuild the silhouettes only when a structure slider actually moved. */
  _syncGeometry() {
    const c = settings.seedstorm;
    const key = `${Math.round(c.branchCount)}|${Math.round(c.twigCount)}|${c.leafDensity}|${c.woodCurve}|${c.branchSpread}`;
    if (key === this._shapeKey) return;
    const first = this._shapeKey === '';
    this._shapeKey = key;
    if (first) return; // built in the constructor from the same values
    for (let v = 0; v < VARIANTS; v++) {
      const mesh = this.saplingMeshes[v];
      const old = mesh.geometry;
      mesh.geometry = this._buildSapling(v);
      old.dispose();
    }
  }

  createParticles() {
    const particles = this.ctx.particles;

    // The seeds' trails: thin green streaks, smeared along the flight.
    this.trail = particles.get('seedstorm.trail', {
      capacity: 2400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.3
    });
    this.trail.uniforms.uSizeIn.value = 0.05;
    this.trail.uniforms.uFadeIn.value = 0.05;
    this.trail.uniforms.uFadeOut.value = 0.55;
    this.trail.uniforms.uEndSize.value = 0.3;
    this.trail.uniforms.uDrag.value = 1.2;
    this.trail.uniforms.uGravity.value.set(0, -0.4, 0);

    // Glowing pollen: shed by the seeds and lifting off the growing wood.
    this.motes = particles.get('seedstorm.motes', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.3
    });
    this.motes.uniforms.uSizeIn.value = 0.1;
    this.motes.uniforms.uFadeIn.value = 0.1;
    this.motes.uniforms.uFadeOut.value = 0.5;
    this.motes.uniforms.uEndSize.value = 0.4;
    this.motes.uniforms.uDrag.value = 1.6;
    this.motes.uniforms.uTurbFrequency.value = 0.8;

    // Leaves: torn off by the lash, shed by the wither. Lit, so they are leaves.
    this.leaves = particles.get('seedstorm.leaves', {
      capacity: 1600,
      shape: ParticleShape.LEAF,
      additive: false,
      lit: true,
      curl: true,
      softFade: 0.25
    });
    this.leaves.uniforms.uSizeIn.value = 0.05;
    this.leaves.uniforms.uFadeIn.value = 0.04;
    this.leaves.uniforms.uFadeOut.value = 0.3;
    this.leaves.uniforms.uEndSize.value = 0.85;
    this.leaves.uniforms.uDrag.value = 1.5;
    this.leaves.uniforms.uTurbFrequency.value = 0.6;

    // Soil chips: hard little clods with real gravity.
    this.chips = particles.get('seedstorm.chips', {
      capacity: 1400,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.2
    });
    this.chips.uniforms.uSizeIn.value = 0.02;
    this.chips.uniforms.uFadeIn.value = 0.02;
    this.chips.uniforms.uFadeOut.value = 0.25;
    this.chips.uniforms.uEndSize.value = 0.8;
    this.chips.uniforms.uDrag.value = 0.6;
    this.chips.uniforms.uTurbulence.value = 0;

    // Dust: not additive, so it dirties what is behind it.
    this.dust = particles.get('seedstorm.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      softFade: 1.0
    });
    this.dust.uniforms.uSizeIn.value = 0.15;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.5;
    this.dust.uniforms.uEndSize.value = 2.0;
    this.dust.uniforms.uDrag.value = 2.2;
    this.dust.uniforms.uGravity.value.set(0, 0.25, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every beat from live settings                              */
  /* ------------------------------------------------------------------ */

  get seedCount() {
    return Math.min(MAX_SEEDS, Math.max(1, Math.round(settings.seedstorm.seedCount)));
  }

  /** Seconds from a sapling bursting to its lash coming over. */
  _strikeAt() {
    const c = settings.seedstorm;
    return c.growTime + c.lashDelay + c.windupTime + c.snapTime;
  }

  /** Seconds after landing a seed starts to wither. */
  _witherAt(seed) {
    const c = settings.seedstorm;
    const g = settings.global;
    return c.sproutDelay + this._strikeAt() + c.recoilTime + c.lifetime * g.lifetime + seed.rank * c.witherStagger;
  }

  get _witherTime() {
    return Math.max(0.1, settings.seedstorm.witherTime * settings.global.lifetime);
  }

  /** Clock time the last sapling starts to wither. */
  _lastWither() {
    let last = 0;
    for (let i = 0; i < this._count; i++) {
      const seed = this.seeds[i];
      last = Math.max(last, this._landTime(seed) + this._witherAt(seed));
    }
    return last;
  }

  /** The impact phase is the grove standing: until the last sapling withers. */
  get impactDuration() {
    return Math.max(0.2, this._lastWither() - this._travelEnd);
  }

  /** The fade is the last of the wither and the soil eroding. */
  get fadeDuration() {
    return this._witherTime + 0.5;
  }

  lightShimmer() {
    const f = settings.seedstorm.lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 6.1) * Math.sin(this.age * 2.3 + 0.4));
  }

  /* ------------------------------------------------------------------ */
  /* Geometry of the volley                                              */
  /* ------------------------------------------------------------------ */

  /** Where the seeds leave from: the hand, a little ahead of the body. */
  _handPoint(out) {
    out.copy(this.origin).addScaledVector(this.direction, 0.55);
    out.y = settings.seedstorm.handHeight;
    return out;
  }

  /** Metres along the line seed `seed` lands at. */
  _along(seed) {
    const c = settings.seedstorm;
    const n = this.seedCount;
    const slot = (seed.rank + 0.5 + (seed.s - 0.5) * c.landJitter * settings.global.randomness) / n;
    return lerp(c.firstLand, 1, saturate(slot)) * this.length;
  }

  /** Where a seed lands — latched once it has, live while it is in the air. */
  _landPoint(seed, out) {
    if (seed.landed) return out.set(seed.landX, 0, seed.landZ);
    const c = settings.seedstorm;
    const along = this._along(seed);
    const fan = Math.pow(saturate(along / Math.max(this.length, 0.1)), Math.max(0.05, c.fanCurve));
    const lateral = seed.lat * c.fanWidth * fan;
    return out.copy(this.origin).addScaledVector(this.direction, along).addScaledVector(this.side, lateral).setY(0);
  }

  _launchTime(seed) {
    return seed.rank * settings.seedstorm.volleyStagger;
  }

  _flightTime(seed) {
    const c = settings.seedstorm;
    const speed = Math.max(0.5, c.speed * settings.global.speed);
    return Math.max(c.minFlight, (this._along(seed) + 0.5) / speed);
  }

  _landTime(seed) {
    return seed.landed ? seed.landAt : this._launchTime(seed) + this._flightTime(seed);
  }

  /** A seed in the air at flight fraction `k`: a parabola from hand to floor. */
  _flightPoint(seed, k, out) {
    const c = settings.seedstorm;
    this._handPoint(_hand);
    _hand.addScaledVector(this.side, seed.lat * 0.12);
    this._landPoint(seed, _land);
    const span = _hand.distanceTo(_land);
    const arc = c.arcHeight * (span / 10) * (1 + seed.arc * c.arcJitter * settings.global.randomness);
    out.lerpVectors(_hand, _land, k);
    out.y += Math.max(0, arc) * 4 * k * (1 - k);
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* The lash                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * How far a sapling is grown, 0..1 (past 1 in the punch), `t` seconds after
   * it burst.
   */
  _grow(t) {
    const c = settings.seedstorm;
    if (t <= 0) return 0;
    const rise = Math.max(0.01, c.growTime);
    if (t < rise) return Easing.outCubic(t / rise) * (1 + c.growOvershoot);
    const settle = Easing.outCubic(saturate((t - rise) / Math.max(0.01, c.growSettle)));
    return lerp(1 + c.growOvershoot, 1, settle);
  }

  /** The whip's bend in radians, `t` seconds after the sapling burst. */
  _bend(t) {
    const c = settings.seedstorm;
    const t0 = c.growTime + c.lashDelay;
    const wind = Math.max(0.01, c.windupTime);
    const snap = Math.max(0.01, c.snapTime);
    if (t <= t0) return 0;
    let x = t - t0;
    if (x < wind) return -c.windupAngle * Easing.inOutQuad(x / wind);
    x -= wind;
    // Accelerating over: a whip is fastest at the end of its stroke.
    if (x < snap) return lerp(-c.windupAngle, c.lashAngle, Easing.inQuad(x / snap));
    x -= snap;
    const k = saturate(x / Math.max(0.05, c.recoilTime));
    // A damped swing from the strike down to the lean it is left at.
    const swing = (1 - k) * (1 - k) * Math.cos(k * Math.PI * 2 * c.recoilWobble);
    return c.restLean + (c.lashAngle - c.restLean) * swing;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const g = settings.global;
    this._seed = Math.random() * 100;
    this._clock = 0;
    this._travelEnd = 0;
    this._count = this.seedCount;
    this._struck = 0;
    this._firstSprout = false;
    this._fadeT = 0;
    this._flicker = 0;

    // Dice, then rank them by where down the line they will land.
    for (let i = 0; i < MAX_SEEDS; i++) {
      const seed = this.seeds[i];
      seed.s = Math.random();
      seed.lat = (Math.random() * 2 - 1) * (0.55 + 0.45 * g.randomness);
      seed.arc = Math.random() * 2 - 1;
      seed.size = Math.random() * 2 - 1;
      seed.yaw = Math.random() * TAU;
      seed.slump = Math.random() < 0.5 ? -1 : 1;
      seed.roll = Math.random() * TAU;
      seed.phase = Math.random();
      seed.landed = false;
      seed.sprouted = false;
      seed.struck = false;
      seed.withering = false;
      seed.landX = 0;
      seed.landZ = 0;
      seed.landAt = 0;
      seed.aim = seed.yaw;
      seed.trailAcc = 0;
      seed.moteAcc = 0;
      seed.fallAcc = 0;
      seed.growAcc = 0;
    }
    // Alternate the fan side as the volley runs down the line, so it reads as
    // a spread rather than a clump.
    for (let i = 0; i < this._count; i++) {
      const seed = this.seeds[i];
      seed.rank = i;
      const side = i % 2 === 0 ? 1 : -1;
      seed.lat = side * Math.abs(seed.lat) * (i === 0 ? 0.3 : 1);
    }

    for (const w of this.warps) {
      w.active = false;
      w.strength = 0;
    }

    this.soil.visible = true;
    this.warp.visible = true;
    this._sync(0);
  }

  _resetEmit(time) {
    _emit.position = null;
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.35;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.45;
    _emit.life = 1;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  /* ------------------------------------------------------------------ */
  /* The frame                                                           */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._step(dt);
  }

  onImpact() {
    this._travelEnd = this._clock;
  }

  onFade(dt, t) {
    this._fadeT = t <= 1 ? 0 : saturate(t - 1);
    this._step(dt);
  }

  /** Everything, on the cast's own clock: phases are only containers here. */
  _step(dt) {
    this._clock += dt;
    this._flicker = Math.max(0, this._flicker - this._flicker * 5 * dt);
    this._syncGeometry();

    const n = this._count;
    for (let i = 0; i < n; i++) this._seedEvents(this.seeds[i], dt);
    this._sync(dt);
    this._placeLight();
  }

  /** Latch one seed's events as its clock passes them, and its running effects. */
  _seedEvents(seed, dt) {
    const c = settings.seedstorm;
    const g = settings.global;
    const time = frame.uTime.value;
    const launch = this._launchTime(seed);
    const now = this._clock;

    /* in the air */
    if (!seed.landed) {
      if (now < launch) return;
      const flight = this._flightTime(seed);
      const k = saturate((now - launch) / flight);
      if (k >= 1) {
        this._landPoint(seed, _land);
        seed.landed = true;
        seed.landX = _land.x;
        seed.landZ = _land.z;
        seed.landAt = launch + flight;
        this._landFx(seed);
        return;
      }
      // Streaks and pollen off the seed, every frame it flies.
      this._flightPoint(seed, k, _pos);
      this._flightPoint(seed, Math.max(0, k - 0.04), _pos2);
      _vel.subVectors(_pos, _pos2);
      const vlen = _vel.length();
      if (vlen > 1e-5) _vel.divideScalar(vlen);
      else _vel.copy(this.direction);

      seed.trailAcc += dt * c.trailRate * g.particleCount;
      const streaks = Math.floor(seed.trailAcc);
      seed.trailAcc -= streaks;
      if (streaks > 0) {
        this._resetEmit(time);
        _emit.position = _pos;
        _emit.radius = 0.03;
        _emit.direction = _dir.copy(_vel).negate();
        _emit.speed = c.trailDrift;
        _emit.speedVariance = 0.5;
        _emit.spread = 0.08;
        _emit.size = c.trailSize;
        _emit.life = c.trailLifetime;
        this.trail.emit(streaks, _emit);
      }
      seed.moteAcc += dt * c.moteRate * g.particleCount;
      const motes = Math.floor(seed.moteAcc);
      seed.moteAcc -= motes;
      if (motes > 0) {
        this._resetEmit(time);
        _emit.position = _pos;
        _emit.radius = 0.08;
        _emit.direction = _up;
        _emit.speed = c.moteRise;
        _emit.spread = 0.6;
        _emit.size = c.moteSize;
        _emit.life = c.moteLifetime;
        this.motes.emit(motes, _emit);
      }
      return;
    }

    const t = now - seed.landAt; // seconds since landing
    const tg = t - c.sproutDelay; // seconds since bursting

    if (!seed.sprouted && tg >= 0) {
      seed.sprouted = true;
      this._sproutFx(seed);
    }
    if (seed.sprouted && !seed.struck && tg >= this._strikeAt()) {
      seed.struck = true;
      this._strike(seed);
    }
    if (!seed.withering && t >= this._witherAt(seed)) {
      seed.withering = true;
      this._witherFx(seed);
    }

    /* pollen lifting off the wood while it grows */
    if (seed.sprouted && tg < c.growTime + c.growSettle) {
      seed.growAcc += dt * c.moteRate * 3 * g.particleCount;
      const motes = Math.floor(seed.growAcc);
      seed.growAcc -= motes;
      if (motes > 0) {
        const grow = Math.min(1, this._grow(tg));
        const h = this._height(seed);
        this._resetEmit(time);
        _pos.set(seed.landX, h * grow * 0.7, seed.landZ);
        _emit.position = _pos;
        _emit.radius = 0.35 * grow + 0.1;
        _emit.direction = _up;
        _emit.speed = c.moteRise * 2;
        _emit.spread = 0.8;
        _emit.size = c.moteSize * 1.2;
        _emit.life = c.moteLifetime;
        this.motes.emit(motes, _emit);
      }
    }

    /* leaves letting go as it withers */
    if (seed.withering) {
      const w = saturate((t - this._witherAt(seed)) / this._witherTime);
      if (w < 0.85) {
        seed.fallAcc += dt * (c.leafFall / Math.max(0.1, this._witherTime)) * g.particleCount;
        const fall = Math.floor(seed.fallAcc);
        seed.fallAcc -= fall;
        if (fall > 0) {
          this._resetEmit(time);
          this._crownPoint(seed, 0.75, _pos);
          _emit.position = _pos;
          _emit.radius = 0.5 * this._height(seed) * 0.4;
          _emit.direction = _dir.set(0, -1, 0);
          _emit.speed = 0.3;
          _emit.spread = 0.9;
          _emit.size = c.leafParticleSize;
          _emit.life = c.leafLifetime * 1.3;
          _emit.spin = c.leafSpin * 0.6;
          _emit.tint = _tint.copy(getColor(c.colorLeafWither)).multiplyScalar(1.6);
          this.leaves.emit(fall, _emit);
        }
      }
    }
  }

  /** A sapling's full height, metres. */
  _height(seed) {
    const c = settings.seedstorm;
    return Math.max(0.1, c.saplingHeight * (1 + seed.size * c.heightJitter * settings.global.randomness));
  }

  /** A point up the sapling's crown, leaning the way it lashes. */
  _crownPoint(seed, frac, out) {
    const h = this._height(seed);
    return out.set(seed.landX + Math.sin(seed.aim) * h * 0.25, h * frac, seed.landZ + Math.cos(seed.aim) * h * 0.25);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _sync(dt) {
    const c = settings.seedstorm;
    const g = settings.global;
    this.seedMaterial.userData.sync();
    this.saplingMaterial.userData.sync();
    this.warpMaterial.userData.sync();

    this._updateSeeds();
    this._updateSaplings();
    this._updateWarps(dt);
    this._updateSoil();

    /* the particles' looks */
    for (const look of LOOKS) {
      const system = this[look.system];
      system.setGradient(getColor(c[look.a]), getColor(c[look.b]), getColor(c[look.c]), getColor(c[look.d]));
      const u = system.uniforms;
      u.uSizeScale.value = g.particleSize;
      u.uLifeScale.value = g.particleLifetime;
      u.uSpeedScale.value = g.particleSpeed;
      u.uOpacity.value = (look.opacity ? c[look.opacity] : 1) * g.opacity;
      u.uGlow.value = (look.glow ? c[look.glow] : look.glowValue) * g.glow;
    }
    this.trail.uniforms.uStretch.value = c.trailStretch;
    this.trail.uniforms.uTurbulence.value = 0.1 * g.turbulence;
    this.motes.uniforms.uTurbulence.value = 0.8 * g.turbulence;
    this.leaves.uniforms.uGravity.value.set(0, c.leafGravity, 0);
    this.leaves.uniforms.uTurbulence.value = 1.2 * g.turbulence;
    this.chips.uniforms.uGravity.value.set(0, c.chipGravity, 0);
    this.dust.uniforms.uTurbulence.value = 0.4 * g.turbulence;
  }

  /** The seeds: in the air, then embedded and flaring until they burst. */
  _updateSeeds() {
    const c = settings.seedstorm;
    const now = this._clock;
    const size = Math.max(0.01, c.seedSize);
    const width = Math.max(0.05, c.seedWidth);
    const state = this.seedState.array;
    let used = 0;

    for (let i = 0; i < this._count; i++) {
      const seed = this.seeds[i];
      const launch = this._launchTime(seed);
      let glow = 1;
      if (now < launch || seed.sprouted) {
        _node.position.set(0, -999, 0);
        _node.scale.setScalar(0.0001);
        _node.quaternion.identity();
      } else if (!seed.landed) {
        const k = saturate((now - launch) / this._flightTime(seed));
        this._flightPoint(seed, k, _pos);
        this._flightPoint(seed, Math.min(1, k + 0.02), _pos2);
        _dir.subVectors(_pos2, _pos);
        if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction);
        _dir.normalize();
        _q.setFromUnitVectors(_fwd, _dir);
        _roll.setFromAxisAngle(_fwd, seed.roll + (now - launch) * c.seedSpin);
        _node.quaternion.copy(_q).multiply(_roll);
        _node.position.copy(_pos);
        // It grows out of the hand rather than appearing in it.
        const grow = Easing.outCubic(saturate((now - launch) / 0.08));
        _node.scale.set(size * width * grow, size * width * grow, size * grow);
      } else {
        // Embedded: point down, sinking, flaring brighter toward the burst.
        const e = saturate((now - seed.landAt) / Math.max(0.01, c.sproutDelay));
        _node.position.set(seed.landX, size * 0.25 - c.embedDepth * Easing.outCubic(e), seed.landZ);
        _q.setFromUnitVectors(_fwd, _dir.set(Math.sin(seed.yaw) * 0.4, -1, Math.cos(seed.yaw) * 0.4).normalize());
        _node.quaternion.copy(_q);
        _node.scale.set(size * width, size * width, size);
        glow = 1 + (c.embedGlow - 1) * Easing.inQuad(e);
      }
      _node.updateMatrix();
      this.seedMesh.setMatrixAt(i, _node.matrix);
      state[i * 2] = glow;
      state[i * 2 + 1] = seed.phase;
      used = i + 1;
    }
    this.seedMesh.count = used;
    this.seedMesh.instanceMatrix.needsUpdate = true;
    this.seedState.needsUpdate = true;
  }

  /** Every sapling's placement and its state vector, from its dice and the clock. */
  _updateSaplings() {
    const c = settings.seedstorm;
    const now = this._clock;
    _used.fill(0);

    for (let i = 0; i < this._count; i++) {
      const seed = this.seeds[i];
      const variant = i % VARIANTS;
      const slot = (i / VARIANTS) | 0;
      const mesh = this.saplingMeshes[variant];
      const st = this.saplingState[variant].array;
      const ex = this.saplingExtra[variant].array;
      const o = slot * 4;

      if (!seed.sprouted) {
        _node.position.set(0, -999, 0);
        _node.quaternion.identity();
        _node.scale.setScalar(0.0001);
        _node.updateMatrix();
        mesh.setMatrixAt(slot, _node.matrix);
        st[o] = 0;
        st[o + 1] = 0;
        st[o + 2] = 0;
        st[o + 3] = 0;
        ex[o] = 0;
        ex[o + 1] = seed.phase;
        ex[o + 2] = 0;
        ex[o + 3] = 0;
        _used[variant] = Math.max(_used[variant], slot + 1);
        continue;
      }

      const t = now - seed.landAt;
      const tg = t - c.sproutDelay;
      const w = seed.withering ? saturate((t - this._witherAt(seed)) / this._witherTime) : 0;

      // Unit space × height: the tree is built a metre tall.
      const h = this._height(seed);
      _node.position.set(seed.landX, 0, seed.landZ);
      _node.quaternion.setFromAxisAngle(_up, seed.aim);
      _node.scale.setScalar(h / Math.max(0.1, c.saplingHeight));
      _node.updateMatrix();
      mesh.setMatrixAt(slot, _node.matrix);

      // Withering: the tips retract, it slumps sideways and sinks.
      st[o] = this._grow(tg) * (1 - 0.45 * Easing.inQuad(w));
      st[o + 1] = this._bend(tg) * (1 - w * 0.6);
      st[o + 2] = w;
      st[o + 3] = c.sinkDepth * Easing.inCubic(saturate((w - 0.25) / 0.75));
      // The flash: bright as it bursts, brighter as it strikes.
      const sinceStrike = tg - this._strikeAt();
      const flash = Math.max(Math.exp(-tg * 9) * 0.6, sinceStrike >= 0 ? Math.exp(-sinceStrike * 7) : 0);
      ex[o] = flash * (1 - w);
      ex[o + 1] = seed.phase;
      ex[o + 2] = seed.slump * c.witherSlump * Easing.inOutQuad(w);
      ex[o + 3] = 0;
      _used[variant] = Math.max(_used[variant], slot + 1);
    }

    for (let v = 0; v < VARIANTS; v++) {
      this.saplingMeshes[v].count = _used[v];
      this.saplingMeshes[v].instanceMatrix.needsUpdate = true;
      this.saplingState[v].needsUpdate = true;
      this.saplingExtra[v].needsUpdate = true;
    }
  }

  /** The ground strip and every landing site on it. */
  _updateSoil() {
    const c = settings.seedstorm;
    const st = this._soilState;
    const now = this._clock;
    st.start.copy(this.origin).addScaledVector(this.direction, -1);
    st.dir.copy(this.direction);
    st.side.copy(this.side);
    st.length = this.length + 2.5;
    st.width = 2 * (c.fanWidth + c.soilRadius * 1.8 + 0.6);
    st.count = this._count;
    st.fade = this._fadeT;

    const sites = this.soilMaterial.uniforms.uSite.value;
    const sitesB = this.soilMaterial.uniforms.uSiteB.value;
    for (let i = 0; i < SOIL_SITES; i++) {
      const site = sites[i];
      const b = sitesB[i];
      const seed = i < this._count ? this.seeds[i] : null;
      if (!seed || !seed.landed) {
        site.set(0, 0, 0, 0);
        b.set(0, 0, 0, 0);
        continue;
      }
      const dx = seed.landX - st.start.x;
      const dz = seed.landZ - st.start.z;
      const along = dx * st.dir.x + dz * st.dir.z;
      const across = dx * st.side.x + dz * st.side.z;
      const t = now - seed.landAt;
      const tg = t - c.sproutDelay;
      // A small pock when it lands; thrown wide open when it bursts.
      const open = seed.sprouted
        ? lerp(0.35, 1, Easing.outCubic(saturate(tg / Math.max(0.01, c.soilOpen))))
        : 0.35 * Easing.outCubic(saturate(t / 0.1));
      site.set(along, across, c.soilRadius, open);
      // The roots light up as it bursts, again as it strikes, then cool.
      const cool = Math.max(0.05, c.soilRootCool);
      const sinceStrike = tg - this._strikeAt();
      const root = seed.sprouted
        ? Math.max(Math.exp(-Math.max(0, tg) / cool), sinceStrike >= 0 ? Math.exp(-sinceStrike / cool) : 0)
        : 0;
      b.set(seed.phase * 17.3 + this._seed, root, seed.sprouted ? 1 : 0, 0);
    }
    this.soilMaterial.userData.sync(st);
    this.soil.visible = this._fadeT < 1;
  }

  /** Age the lens rings and write them to the instance buffers. */
  _updateWarps(dt) {
    const c = settings.seedstorm;
    const g = settings.global;
    const centers = this.warpCenter.array;
    const data = this.warpData.array;
    for (let i = 0; i < MAX_WARPS; i++) {
      const w = this.warps[i];
      if (w.active) {
        w.age += dt;
        if (w.age >= w.life) w.active = false;
      }
      const k = w.active ? saturate(w.age / w.life) : 0;
      centers[i * 3] = w.x;
      centers[i * 3 + 1] = w.y;
      centers[i * 3 + 2] = w.z;
      data[i * 4] = Easing.outCubic(k);
      data[i * 4 + 1] = w.active ? w.strength * c.warpStrength * g.distortion : 0;
      data[i * 4 + 2] = w.size * (0.35 + 0.65 * Easing.outCubic(k));
      data[i * 4 + 3] = w.seed;
    }
    this.warpCenter.needsUpdate = true;
    this.warpData.needsUpdate = true;
  }

  _spawnWarp(x, y, z, size, strength) {
    const c = settings.seedstorm;
    let pick = this.warps[0];
    for (const w of this.warps) {
      if (!w.active) {
        pick = w;
        break;
      }
      if (w.age / w.life > pick.age / pick.life) pick = w;
    }
    pick.active = true;
    pick.x = x;
    pick.y = y;
    pick.z = z;
    pick.age = 0;
    pick.life = Math.max(0.05, c.warpTime);
    pick.size = size;
    pick.strength = strength;
    pick.seed = Math.random() * 10;
  }

  /** The light rides the volley, then hangs over the middle of the grove. */
  _placeLight() {
    const c = settings.seedstorm;
    let n = 0;
    _pos.set(0, 0, 0);
    for (let i = 0; i < this._count; i++) {
      const seed = this.seeds[i];
      if (seed.landed && !seed.withering) {
        _pos.x += seed.landX;
        _pos.z += seed.landZ;
        n++;
      }
    }
    if (n > 0) {
      _pos.divideScalar(n);
      _pos.y = c.lightHeight;
      // Lean toward the front of the volley while seeds are still landing.
      if (this.phase === AbilityPhase.TRAVEL) _pos.lerp(this.position, 0.5);
      this.position.copy(_pos);
    } else if (this.phase === AbilityPhase.TRAVEL) {
      this.position.y = c.handHeight;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */

  /** A seed punching into the floor. */
  _landFx(seed) {
    const c = settings.seedstorm;
    const g = settings.global;
    const time = frame.uTime.value;
    _floor.set(seed.landX, 0, seed.landZ);
    this.ctx.decals.spawn(DecalType.DUSTRING, _floor, {
      radius: c.landRingRadius,
      life: c.landRingLife,
      intensity: 0.7,
      colorA: getColor(c.colorDustC),
      colorB: getColor(c.colorDustA)
    });
    this._resetEmit(time);
    _pos.set(seed.landX, 0.05, seed.landZ);
    _emit.position = _pos;
    _emit.radius = 0.08;
    _emit.direction = _up;
    _emit.speed = c.chipSpeed * 0.5;
    _emit.spread = 0.6;
    _emit.size = c.chipSize * 0.8;
    _emit.life = c.chipLifetime * 0.6;
    _emit.spin = 8;
    this.chips.emit(Math.round(c.landChips * g.particleCount), _emit);
    _emit.speed = 0.6;
    _emit.size = c.dustSize * 0.6;
    _emit.life = c.dustLifetime * 0.6;
    _emit.spin = 0.5;
    this.dust.emit(Math.round(c.landDust * g.particleCount), _emit);
    this.ctx.shake.add(c.landShake * g.cameraShake, 8, 22);
  }

  /** A sapling exploding up out of the floor, and choosing what to lash at. */
  _sproutFx(seed) {
    const c = settings.seedstorm;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    _floor.set(seed.landX, 0, seed.landZ);

    // Aim: the nearest body in reach, else the seed's own bearing.
    const field = this.ctx.dummies;
    seed.aim = seed.yaw;
    if (field?.findTargets) {
      const found = field.findTargets(seed.landX, seed.landZ, c.strikeRadius * c.aimReach, this._found);
      if (found.length > 0) {
        const d = found[0];
        seed.aim = Math.atan2(d.position.x - seed.landX, d.position.z - seed.landZ);
      }
      this._found.length = 0;
    }

    _pos.set(seed.landX, 0.25, seed.landZ);
    this.ctx.bursts.spawn(BurstMode.EARTH, _pos, {
      radius: 0.15,
      endRadius: c.burstRadius * power,
      life: 0.45,
      intensity: c.burstIntensity,
      opacity: 0.7,
      squash: 0.5,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.CRACK, _floor, {
      radius: c.crackRadius,
      life: c.crackLife,
      intensity: 0.9,
      colorA: getColor(c.colorCrackA),
      colorB: getColor(c.colorCrackB)
    });

    this._resetEmit(time);
    _emit.position = _pos.set(seed.landX, 0.1, seed.landZ);
    _emit.radius = 0.15;
    _emit.direction = _up;
    _emit.speed = c.chipSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.55;
    _emit.size = c.chipSize;
    _emit.life = c.chipLifetime;
    _emit.spin = 10;
    this.chips.emit(Math.round(c.lashChips * g.particleCount), _emit);
    _emit.speed = 1.2;
    _emit.spread = 0.9;
    _emit.size = c.dustSize;
    _emit.life = c.dustLifetime;
    _emit.spin = 0.4;
    this.dust.emit(Math.round(c.lashDust * g.particleCount), _emit);
    // A spray of leaves off the bursting crown.
    _emit.position = _pos.set(seed.landX, this._height(seed) * 0.5, seed.landZ);
    _emit.radius = 0.3;
    _emit.speed = c.leafSpeed * 0.5;
    _emit.spread = 0.9;
    _emit.size = c.leafParticleSize;
    _emit.life = c.leafLifetime * 0.7;
    _emit.spin = c.leafSpin;
    this.leaves.emit(Math.round(c.lashLeaves * 0.3 * g.particleCount), _emit);

    this._spawnWarp(seed.landX, 0.4, seed.landZ, c.warpSize * 0.8, 0.8);
    this.ctx.shake.add(c.sproutShake * power * g.cameraShake, 6, 18);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.sproutLight * power);
    if (!this._firstSprout) {
      this._firstSprout = true;
      this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    }
  }

  /** The whip coming over: everything in reach is thrown away from the tree. */
  _strike(seed) {
    const c = settings.seedstorm;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    _floor.set(seed.landX, 0, seed.landZ);
    const ax = Math.sin(seed.aim);
    const az = Math.cos(seed.aim);
    const h = this._height(seed);

    /* the blow */
    let connected = 0;
    const field = this.ctx.dummies;
    if (field?.findBodies) {
      const found = field.findBodies(seed.landX, seed.landZ, c.strikeRadius, this._found);
      this._force.impulse = c.strikeImpulse * power;
      this._force.lift = c.strikeLift * power;
      this._force.spin = c.strikeSpin;
      for (const dummy of found) {
        _dir.set(dummy.position.x - seed.landX, 0, dummy.position.z - seed.landZ);
        if (dummy.alive) {
          if (_dir.lengthSq() < 1e-6) _dir.set(ax, 0, az);
          _dir.normalize();
          if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
          dummy.bodyPoint(_pos) ?? _pos.copy(dummy.position).setY(1);
        } else {
          // A body already down is batted on, away from this tree.
          if (!dummy.bodyPoint(_pos)) continue;
          _dir.set(_pos.x - seed.landX, 0, _pos.z - seed.landZ);
          if (_dir.lengthSq() < 1e-6) _dir.set(ax, 0, az);
          _dir.normalize();
          dummy.shove(_dir.x * c.corpseShove * power, c.corpseShove * 0.6 * power, _dir.z * c.corpseShove * power);
        }
        connected++;
        this._struck++;
        this._hitFx(_pos, _dir);
      }
      this._found.length = 0;
    }

    /* leaves torn off the crown, flung the way it lashed */
    this._resetEmit(time);
    this._crownPoint(seed, 0.8, _crown);
    _emit.position = _crown;
    _emit.radius = h * 0.2;
    _emit.direction = _dir.set(ax, 0.35, az).normalize();
    _emit.speed = c.leafSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.7;
    _emit.size = c.leafParticleSize;
    _emit.life = c.leafLifetime;
    _emit.spin = c.leafSpin;
    this.leaves.emit(Math.round(c.lashLeaves * g.particleCount), _emit);

    /* soil kicked out from the root */
    _emit.position = _pos.set(seed.landX, 0.08, seed.landZ);
    _emit.radius = 0.2;
    _emit.direction = _dir.set(-ax * 0.5, 1, -az * 0.5).normalize();
    _emit.speed = c.chipSpeed * 0.8;
    _emit.spread = 0.6;
    _emit.size = c.chipSize;
    _emit.life = c.chipLifetime;
    _emit.spin = 10;
    this.chips.emit(Math.round(c.lashChips * 0.6 * g.particleCount), _emit);
    _emit.speed = 1.6;
    _emit.size = c.dustSize;
    _emit.life = c.dustLifetime;
    _emit.spin = 0.4;
    this.dust.emit(Math.round(c.lashDust * g.particleCount), _emit);

    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.5,
      width: 0.05,
      intensity: 0.9,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this._spawnWarp(seed.landX + ax * h * 0.3, c.warpHeight, seed.landZ + az * h * 0.3, c.warpSize, 1);

    const knock = connected > 0 ? c.strikeShake : c.strikeShake * 0.4;
    this.ctx.shake.add(knock * power * g.cameraShake, 7, 20);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.strikeLight * power * (connected > 0 ? 1.4 : 0.7));
    this._flicker = 1;
  }

  /** Leaves and dirt bursting off a body the lash connected with. */
  _hitFx(at, dir) {
    const c = settings.seedstorm;
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _pos2.copy(at);
    _emit.position = _pos2;
    _emit.radius = 0.3;
    _emit.direction = _vel.copy(dir).setY(0.6).normalize();
    _emit.speed = c.leafSpeed * 0.8;
    _emit.spread = 0.6;
    _emit.size = c.leafParticleSize;
    _emit.life = c.leafLifetime * 0.8;
    _emit.spin = c.leafSpin;
    this.leaves.emit(Math.round(c.hitLeaves * g.particleCount), _emit);
    _emit.size = c.moteSize * 2;
    _emit.speed = 2;
    _emit.life = c.moteLifetime;
    this.motes.emit(Math.round(c.hitLeaves * g.particleCount), _emit);
  }

  /** The wither beginning: the soil stain is left on the floor for after. */
  _witherFx(seed) {
    const c = settings.seedstorm;
    _floor.set(seed.landX, 0, seed.landZ);
    this.ctx.decals.spawn(DecalType.SCORCH, _floor, {
      radius: c.soilRadius * 1.1,
      life: c.soilLinger + this._witherTime,
      intensity: c.soilStain,
      colorA: getColor(c.colorSoil),
      colorB: getColor(c.colorSoilDeep),
      height: 0.011
    });
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.seedMesh.count = 0;
    for (const mesh of this.saplingMeshes) mesh.count = 0;
    this.soil.visible = false;
    this.warp.visible = false;
    for (const w of this.warps) w.active = false;
  }

  dispose() {
    this.seedGeometry.dispose();
    for (const mesh of this.saplingMeshes) mesh.geometry.dispose();
    this.soilGeometry.dispose();
    this.warpGeometry.dispose();
    this.seedMaterial.dispose();
    this.saplingMaterial.userData.depth.dispose();
    this.saplingMaterial.dispose();
    this.soilMaterial.dispose();
    this.warpMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1F331}  Seedstorm Volley');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 80, 0.5, 'volley speed (m/s)');
  R(cast, c, 'lifetime', 0, 8, 0.05, 'saplings stand for (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);
  R(cast, c, 'handHeight', 0.2, 3, 0.01, 'hand height (m)');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'breathing');
  R(light, c, 'lightHeight', 0.1, 6, 0.05, 'height over the grove (m)');

  const volley = folder.addFolder('1 · Volley');
  R(volley, c, 'seedCount', 1, MAX_SEEDS, 1, 'seeds');
  R(volley, c, 'firstLand', 0, 0.9, 0.01, 'first lands at (× line)');
  R(volley, c, 'landJitter', 0, 1, 0.01, 'spacing jitter');
  R(volley, c, 'fanWidth', 0, 6, 0.05, 'fan half-width (m)');
  R(volley, c, 'fanCurve', 0.1, 3, 0.01, 'fan opening curve');
  R(volley, c, 'volleyStagger', 0, 0.3, 0.005, 'launch stagger (s)');
  R(volley, c, 'arcHeight', 0, 8, 0.05, 'arc height (m per 10 m)');
  R(volley, c, 'arcJitter', 0, 1, 0.01, 'arc jitter');
  R(volley, c, 'minFlight', 0.05, 2, 0.01, 'min flight (s)');
  const seedLook = volley.addFolder('Seed');
  R(seedLook, c, 'seedSize', 0.02, 1, 0.005, 'length (m)');
  R(seedLook, c, 'seedWidth', 0.2, 3, 0.01, 'girth');
  R(seedLook, c, 'seedSpin', 0, 60, 0.5, 'roll (rad/s)');
  R(seedLook, c, 'seedGlow', 0, 12, 0.05, 'core glow');
  R(seedLook, c, 'seedRim', 0, 8, 0.05, 'rim glow');
  R(seedLook, c, 'seedPulse', 0, 1, 0.01, 'pulse');
  R(seedLook, c, 'seedVeinScale', 0.5, 20, 0.1, 'vein scale');
  R(seedLook, c, 'embedDepth', 0, 0.4, 0.005, 'embeds by (m)');
  R(seedLook, c, 'embedGlow', 1, 6, 0.05, 'flare before burst (×)');
  seedLook.addColor(c, 'colorSeedCore').name('core');
  seedLook.addColor(c, 'colorSeedBody').name('husk');
  seedLook.addColor(c, 'colorSeedRim').name('rim');

  const trail = folder.addFolder('2 · Trails & pollen');
  R(trail, c, 'trailRate', 0, 400, 1, 'streaks / s / seed');
  R(trail, c, 'trailSize', 0.005, 0.3, 0.001, 'streak width');
  R(trail, c, 'trailLifetime', 0.05, 2, 0.01, 'streak lifetime');
  R(trail, c, 'trailStretch', 0, 1, 0.005, 'stretch');
  R(trail, c, 'trailGlow', 0, 8, 0.05, 'glow');
  R(trail, c, 'trailDrift', 0, 6, 0.05, 'fall back (m/s)');
  Editor.gradient(trail, c, 'colorTrail', 'streak gradient');
  R(trail, c, 'moteRate', 0, 200, 1, 'pollen / s / seed');
  R(trail, c, 'moteSize', 0.005, 0.3, 0.001, 'pollen size');
  R(trail, c, 'moteLifetime', 0.1, 4, 0.05, 'pollen lifetime');
  R(trail, c, 'moteRise', 0, 4, 0.05, 'pollen rise (m/s)');
  Editor.gradient(trail, c, 'colorMote', 'pollen gradient');

  const land = folder.addFolder('3 · Landing');
  R(land, c, 'sproutDelay', 0, 1.5, 0.01, 'bursts after (s)');
  R(land, c, 'landChips', 0, 60, 1, 'chips');
  R(land, c, 'landDust', 0, 30, 1, 'dust puffs');
  R(land, c, 'landRingRadius', 0, 4, 0.05, 'dust ring (m)');
  R(land, c, 'landRingLife', 0.05, 3, 0.05, 'dust ring life');
  R(land, c, 'landShake', 0, 0.5, 0.005, 'camera tap');

  const tree = folder.addFolder('4 · Sapling');
  const shape = tree.addFolder('Shape');
  R(shape, c, 'saplingHeight', 0.3, 6, 0.05, 'height (m)');
  R(shape, c, 'heightJitter', 0, 1, 0.01, 'height jitter');
  R(shape, c, 'girth', 0.2, 4, 0.01, 'girth');
  R(shape, c, 'leafSize', 0, 3, 0.01, 'leaf size');
  R(shape, c, 'branchCount', 1, 9, 1, 'branches (rebuild)');
  R(shape, c, 'twigCount', 0, 6, 1, 'twigs (rebuild)');
  R(shape, c, 'leafDensity', 0, 2, 0.05, 'leaves (rebuild)');
  R(shape, c, 'woodCurve', 0, 1, 0.01, 'wander (rebuild)');
  R(shape, c, 'branchSpread', 0, 1, 0.01, 'splay (rebuild)');
  R(shape, c, 'growTime', 0.03, 2, 0.01, 'bursts up over (s)');
  R(shape, c, 'growOvershoot', 0, 0.8, 0.01, 'punch past full');
  R(shape, c, 'growSettle', 0.01, 1.5, 0.01, 'settles over (s)');
  R(shape, c, 'growFeather', 0.01, 0.6, 0.005, 'grow front softness');
  R(shape, c, 'bendCurve', 0.3, 4, 0.01, 'whippiness');
  R(shape, c, 'sway', 0, 0.4, 0.005, 'idle sway (rad)');
  R(shape, c, 'swaySpeed', 0, 8, 0.05, 'sway speed');
  const shade = tree.addFolder('Shading');
  R(shade, c, 'barkRoughness', 0, 1, 0.01, 'roughness');
  R(shade, c, 'barkScale', 1, 30, 0.1, 'bark streaks');
  R(shade, c, 'frontGlow', 0, 12, 0.05, 'grow front glow');
  R(shade, c, 'veinGlow', 0, 5, 0.01, 'vein glow');
  R(shade, c, 'leafGlow', 0, 3, 0.01, 'leaf translucency');
  R(shade, c, 'rimGlow', 0, 4, 0.01, 'rim glow');
  R(shade, c, 'flashGlow', 0, 10, 0.05, 'strike flash');
  shade.addColor(c, 'colorBarkDark').name('bark dark');
  shade.addColor(c, 'colorBarkLight').name('bark light');
  shade.addColor(c, 'colorYoung').name('young wood');
  shade.addColor(c, 'colorLeafBase').name('leaf base');
  shade.addColor(c, 'colorLeafTip').name('leaf tip');
  shade.addColor(c, 'colorLeafVein').name('leaf veins');
  shade.addColor(c, 'colorGlow').name('life glow');

  const lash = folder.addFolder('5 · Lash');
  R(lash, c, 'lashDelay', 0, 1, 0.01, 'winds up after (s)');
  R(lash, c, 'windupTime', 0.01, 1, 0.005, 'wind-up (s)');
  R(lash, c, 'windupAngle', 0, 1.5, 0.01, 'coils back (rad)');
  R(lash, c, 'snapTime', 0.01, 0.6, 0.005, 'snap (s)');
  R(lash, c, 'lashAngle', 0, 2.5, 0.01, 'lashes over (rad)');
  R(lash, c, 'recoilTime', 0.05, 3, 0.01, 'recoil (s)');
  R(lash, c, 'recoilWobble', 0, 8, 0.05, 'recoil wobbles');
  R(lash, c, 'restLean', -0.6, 0.6, 0.005, 'left leaning (rad)');
  R(lash, c, 'aimReach', 0, 4, 0.01, 'aims within (× reach)');
  const torn = lash.addFolder('Leaves, chips & dust');
  R(torn, c, 'lashLeaves', 0, 120, 1, 'leaves torn off');
  R(torn, c, 'leafSpeed', 0, 20, 0.1, 'leaf speed');
  R(torn, c, 'leafParticleSize', 0.01, 0.5, 0.005, 'leaf size');
  R(torn, c, 'leafLifetime', 0.1, 5, 0.05, 'leaf lifetime');
  R(torn, c, 'leafSpin', 0, 20, 0.1, 'leaf spin');
  R(torn, c, 'leafGravity', -15, 2, 0.1, 'leaf gravity');
  Editor.gradient(torn, c, 'colorLeaf', 'leaf gradient');
  R(torn, c, 'lashChips', 0, 80, 1, 'soil chips');
  R(torn, c, 'chipSpeed', 0, 15, 0.1, 'chip speed');
  R(torn, c, 'chipSize', 0.01, 0.3, 0.005, 'chip size');
  R(torn, c, 'chipLifetime', 0.1, 3, 0.05, 'chip lifetime');
  R(torn, c, 'chipGravity', -30, 0, 0.1, 'chip gravity');
  Editor.gradient(torn, c, 'colorChip', 'chip gradient');
  R(torn, c, 'lashDust', 0, 40, 1, 'dust puffs');
  R(torn, c, 'dustSize', 0.05, 3, 0.01, 'dust size');
  R(torn, c, 'dustLifetime', 0.1, 5, 0.05, 'dust lifetime');
  R(torn, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(torn, c, 'colorDust', 'dust gradient');

  const strike = folder.addFolder('6 · Strike');
  R(strike, c, 'strikeRadius', 0.2, 6, 0.05, 'reach (m)');
  R(strike, c, 'strikeImpulse', 0, 25, 0.1, 'thrown (m/s)');
  R(strike, c, 'strikeLift', 0, 15, 0.1, 'lift (m/s)');
  R(strike, c, 'strikeSpin', 0, 5, 0.01, 'tumble');
  R(strike, c, 'corpseShove', 0, 15, 0.1, 'corpses batted (m/s)');
  R(strike, c, 'strikeShake', 0, 1, 0.01, 'camera knock');
  R(strike, c, 'strikeLight', 0, 4, 0.01, 'light punch (× intensity)');
  R(strike, c, 'hitLeaves', 0, 60, 1, 'leaves per hit');

  const erupt = folder.addFolder('7 · Eruption');
  R(erupt, c, 'sproutShake', 0, 1, 0.01, 'camera knock');
  R(erupt, c, 'sproutLight', 0, 4, 0.01, 'light punch (× intensity)');
  R(erupt, c, 'burstRadius', 0, 5, 0.05, 'earth burst (m)');
  R(erupt, c, 'burstIntensity', 0, 4, 0.01, 'burst brightness');
  R(erupt, c, 'crackRadius', 0, 4, 0.05, 'crack decal (m)');
  R(erupt, c, 'crackLife', 0.1, 6, 0.05, 'crack life');
  R(erupt, c, 'shockRadius', 0, 8, 0.05, 'lash shockwave (m)');
  R(erupt, c, 'impactFlash', 0, 1, 0.01, 'first sprout flash');
  erupt.addColor(c, 'colorBurstA').name('burst inner');
  erupt.addColor(c, 'colorBurstB').name('burst mid');
  erupt.addColor(c, 'colorBurstC').name('burst outer');
  erupt.addColor(c, 'colorCrackA').name('crack dark');
  erupt.addColor(c, 'colorCrackB').name('crack glow');
  erupt.addColor(c, 'colorShockA').name('shockwave');
  erupt.addColor(c, 'colorShockB').name('shockwave hot');
  erupt.addColor(c, 'colorFlash').name('flash');
  const warp = erupt.addFolder('Distortion');
  R(warp, c, 'warpStrength', 0, 4, 0.01, 'strength');
  R(warp, c, 'warpSize', 0.2, 10, 0.05, 'ring size (m)');
  R(warp, c, 'warpTime', 0.05, 2, 0.01, 'ring life (s)');
  R(warp, c, 'warpWidth', 0.02, 0.8, 0.005, 'ring width');
  R(warp, c, 'warpNoise', 0, 1, 0.01, 'turbulence');
  R(warp, c, 'warpHeight', 0, 4, 0.05, 'lash ring height (m)');

  const soil = folder.addFolder('8 · Soil scatter');
  R(soil, c, 'soilRadius', 0.1, 4, 0.01, 'radius (m)');
  R(soil, c, 'soilOpen', 0.01, 2, 0.01, 'throws open over (s)');
  R(soil, c, 'soilDark', 0, 1, 0.01, 'earth opacity');
  R(soil, c, 'soilClods', 0, 1, 0.01, 'clod opacity');
  R(soil, c, 'soilClodScale', 0.5, 30, 0.1, 'clods per metre');
  R(soil, c, 'soilCracks', 0, 16, 1, 'cracks');
  R(soil, c, 'soilEdgeNoise', 0, 1, 0.01, 'ragged edge');
  R(soil, c, 'soilRootGlow', 0, 8, 0.05, 'root glow');
  R(soil, c, 'soilRootScale', 0.5, 12, 0.05, 'root scale');
  R(soil, c, 'soilRootCool', 0.05, 6, 0.05, 'roots cool over (s)');
  R(soil, c, 'soilErode', 0, 1, 0.01, 'ragged fade');
  R(soil, c, 'soilLinger', 0, 15, 0.1, 'stain lingers (s)');
  R(soil, c, 'soilStain', 0, 1.5, 0.01, 'stain strength');
  soil.addColor(c, 'colorSoilDeep').name('hole & cracks');
  soil.addColor(c, 'colorSoil').name('earth');
  soil.addColor(c, 'colorSoilLight').name('clods');
  soil.addColor(c, 'colorRootGlow').name('roots of light');

  const wither = folder.addFolder('9 · Wither');
  R(wither, c, 'witherTime', 0.1, 5, 0.05, 'withers over (s)');
  R(wither, c, 'witherStagger', 0, 1, 0.01, 'stagger (s)');
  R(wither, c, 'witherDroop', 0, 2, 0.01, 'leaves hang');
  R(wither, c, 'witherSlump', 0, 1.5, 0.01, 'slumps (rad)');
  R(wither, c, 'sinkDepth', 0, 2, 0.01, 'sinks (× height)');
  R(wither, c, 'leafFall', 0, 120, 1, 'leaves shed');
  wither.addColor(c, 'colorLeafWither').name('dead leaf');
  wither.addColor(c, 'colorBarkWither').name('dead bark');

  folder.close();
  return folder;
}
