import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createObsidianShardGeometry,
  createObsidianSlabGeometry
} from '../../assets/matrix-new/ObsidianWallGeometry.js';
import {
  createObsidianFissureMaterial,
  createObsidianGlassMaterial
} from '../../materials/matrix-new/ObsidianWallMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing, randRange } from '../../utils/math.js';

export const ID = 'obsidianwall';

const TAU = Math.PI * 2;

/** Hard ceiling on slabs per wall; the spacing slider is clamped by it. */
const MAX_SLABS = 40;
/** Shards each slab can break into; `shardsPerSlab` clamps to this. */
const SHARDS_PER = 10;
const MAX_SHARDS = MAX_SLABS * SHARDS_PER;
/** Silhouettes — each its own InstancedMesh, because the facets differ. */
const SLAB_VARIANTS = 3;
const SHARD_VARIANTS = 3;
const SLAB_SLOTS = Math.ceil(MAX_SLABS / SLAB_VARIANTS);
const SHARD_SLOTS = Math.ceil(MAX_SHARDS / SHARD_VARIANTS);

const _emit = {};
const _pos = new Vector3();
const _base = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _up = new Vector3(0, 1, 0);
const _node = new Object3D();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _slabUsed = new Int32Array(SLAB_VARIANTS);
const _shardUsed = new Int32Array(SHARD_VARIANTS);

/**
 * OBSIDIAN WALL — a wall of volcanic glass that erupts, stands, and breaks.
 *
 * A line cast in three acts. The **travel** is an eruption front running down
 * the line: behind it the floor splits along a glowing fissure and slab after
 * slab of black glass punches up out of it, overshooting and settling, each
 * one throwing dust and grit. The **impact** is the wall standing for
 * `lifetime`, cooling — then, in its last `chargeTime`, its cracks light
 * violet, the slabs shiver, sparks rise. The **fade** is the break: slab by
 * slab, caster first, the wall bursts into a fan of spinning shards that fly
 * out either side, kill any body they reach, land, skid and are gone.
 *
 * Six layers, each a folder in the editor:
 *
 *   1. **the slabs** — three InstancedMeshes of faceted, jagged-topped plates
 *      (`createObsidianSlabGeometry`), opaque on LAYER.WORLD so they cast
 *      shadows and the dust soft-fades against them.
 *   2. **volcanic glass** — one bespoke shader for slabs and shards: truly flat
 *      facets from screen-space derivatives, conchoidal ripples round a
 *      per-facet origin, glass Fresnel and a sharp sky reflection from
 *      `frame.uEnvMap`, a hard sun glint, and violet light in the cracks — on
 *      the surface and, with parallax, inside. Per-instance `vec4 aState`
 *      (seed, heat, charge, shard) — so one material serves every mesh.
 *   3. **the fissure** — a ground strip that opens behind the front: a
 *      zigzag rift with a violet core, branching side cracks, a scorched
 *      margin. Cools, flares again with the charge, erodes in the fade. CRACK
 *      and DUSTRING decals per slab.
 *   4. **dust + grit** — non-additive SMOKE and lit CHIPs per slab, and a thin
 *      sift of dust off the standing wall.
 *   5. **the charge** — the cracks' energy ramps, the slabs shiver, additive
 *      embers rise off them, the camera rumbles.
 *   6. **the shards** — three InstancedMeshes of glass bipyramids. Flight is
 *      analytic (ballistic to a landing time solved per shard, then an
 *      exponential skid), so every launch slider reshapes a volley mid-air.
 *      `handlesOwnHits`: a shard still flying or skidding kills any body
 *      within `shardHitRadius`, thrown along the shard's own flight.
 *
 * ## The editor rule
 *
 * A slab record holds dice and two event times (when it erupted, when it
 * broke); a shard record holds dice and one flag. Stations, sizes, launch
 * vectors, flight and spin are all resolved from `settings.obsidianwall` every
 * frame.
 */
export class ObsidianWallAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /** The shards choose who they hit, and when. */
  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    let n = 0;
    for (const mesh of this.slabMeshes) n += mesh.count;
    for (const mesh of this.shardMeshes) n += mesh.count;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.glassMaterial = createObsidianGlassMaterial();

    /* ---- layer 1: the slabs ---- */
    this._slabState = [];
    this.slabMeshes = [];
    this._shapeKey = '';
    for (let v = 0; v < SLAB_VARIANTS; v++) {
      const state = new InstancedBufferAttribute(new Float32Array(SLAB_SLOTS * 4), 4).setUsage(DynamicDrawUsage);
      this._slabState.push(state);
      const mesh = new InstancedMesh(this._buildSlab(v), this.glassMaterial, SLAB_SLOTS);
      mesh.name = 'ObsidianSlabs';
      mesh.layers.set(LAYER.WORLD);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
      this.slabMeshes.push(mesh);
    }

    /* ---- layer 6: the shards ---- */
    this._shardState = [];
    this.shardMeshes = [];
    for (let v = 0; v < SHARD_VARIANTS; v++) {
      const state = new InstancedBufferAttribute(new Float32Array(SHARD_SLOTS * 4), 4).setUsage(DynamicDrawUsage);
      this._shardState.push(state);
      const geometry = createObsidianShardGeometry({ seed: 2.3 + v * 4.1, sides: 5 + v });
      geometry.setAttribute('aState', state);
      const mesh = new InstancedMesh(geometry, this.glassMaterial, SHARD_SLOTS);
      mesh.name = 'ObsidianShards';
      mesh.layers.set(LAYER.WORLD);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
      this.shardMeshes.push(mesh);
    }

    /* ---- layer 3: the fissure ---- */
    this.fissureGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.fissureMaterial = createObsidianFissureMaterial();
    this.fissure = new Mesh(this.fissureGeometry, this.fissureMaterial);
    this.fissure.name = 'ObsidianFissure';
    this.fissure.layers.set(LAYER.VFX);
    this.fissure.renderOrder = 2;
    this.fissure.frustumCulled = false;
    this.fissure.visible = false;
    this.group.add(this.fissure);
    this._fissureState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      length: 1,
      width: 1,
      open: 0,
      frontAt: 0,
      heat: 1,
      charge: 0,
      fadeT: 0,
      seed: 0
    };

    /** Slab records: dice and two event times. */
    this.slabs = [];
    for (let i = 0; i < MAX_SLABS; i++) {
      this.slabs.push({ along: 0, lateral: 0, height: 0, width: 0, lean: 0, yaw: 0, seed: 0, eruptAt: -1, brokeAt: -1, erupted: false });
    }
    /** Shard records: dice and one flag. */
    this.shards = [];
    for (let i = 0; i < MAX_SHARDS; i++) {
      this.shards.push({ fan: 0, speed: 0, lift: 0, size: 0, side: 0, h: 0, w: 0, seed: 0, axis: new Vector3(0, 1, 0), yaw: 0, done: false });
    }

    this._clock = 0;
    this._seed = 0;
    this._heat = 1;
    this._charge = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  /** One slab silhouette from the live shape settings. */
  _buildSlab(variant) {
    const c = settings.obsidianwall;
    const geometry = createObsidianSlabGeometry({
      seed: 1.7 + variant * 3.9,
      sides: 8,
      rows: 4,
      jag: c.slabJag,
      lumps: c.slabLumps,
      taper: c.slabTaper
    });
    geometry.setAttribute('aState', this._slabState[variant]);
    return geometry;
  }

  /** Rebuild the slab silhouettes only when a shape slider actually moved. */
  _syncGeometry() {
    const c = settings.obsidianwall;
    const key = `${c.slabJag}|${c.slabLumps}|${c.slabTaper}`;
    if (key === this._shapeKey) return;
    const first = this._shapeKey === '';
    this._shapeKey = key;
    if (first) return;
    for (let v = 0; v < SLAB_VARIANTS; v++) {
      const mesh = this.slabMeshes[v];
      const old = mesh.geometry;
      mesh.geometry = this._buildSlab(v);
      old.dispose();
    }
  }

  createParticles() {
    const particles = this.ctx.particles;

    // Dust off the eruption: dark, heavy, not additive.
    this.dust = particles.get('obsidianwall.dust', {
      capacity: 1600,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.0
    });
    this.dust.uniforms.uSizeIn.value = 0.15;
    this.dust.uniforms.uFadeIn.value = 0.12;
    this.dust.uniforms.uFadeOut.value = 0.45;
    this.dust.uniforms.uEndSize.value = 2.0;
    this.dust.uniforms.uDrag.value = 1.8;

    // Grit: lit chips of glass with real weight.
    this.grit = particles.get('obsidianwall.grit', {
      capacity: 2200,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.grit.uniforms.uSizeIn.value = 0.02;
    this.grit.uniforms.uFadeIn.value = 0.02;
    this.grit.uniforms.uFadeOut.value = 0.3;
    this.grit.uniforms.uEndSize.value = 0.85;
    this.grit.uniforms.uDrag.value = 0.5;

    // Violet sparks rising off the cracks while the wall charges.
    this.embers = particles.get('obsidianwall.embers', {
      capacity: 900,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.3
    });
    this.embers.uniforms.uSizeIn.value = 0.08;
    this.embers.uniforms.uFadeIn.value = 0.1;
    this.embers.uniforms.uFadeOut.value = 0.5;
    this.embers.uniforms.uEndSize.value = 0.25;
    this.embers.uniforms.uDrag.value = 0.8;

    this.standEmitter = new RateEmitter();
    this.emberEmitter = new RateEmitter();
    this.trailEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the wall standing (the charge is its tail). */
  get impactDuration() {
    const c = settings.obsidianwall;
    return Math.max(0.1, (c.lifetime + c.riseTime + c.eruptDelay) * settings.global.lifetime);
  }

  /** The fade is the break: the stagger down the wall plus one flight. */
  get fadeDuration() {
    const c = settings.obsidianwall;
    return Math.max(0.2, (c.shardStagger * this._count() + c.shardFlightTime) * settings.global.lifetime);
  }

  /** Glass light: steady, with a growing tremor as the wall charges. */
  lightShimmer() {
    const k = this._charge;
    return 0.92 + 0.08 * Math.sin(this.age * 4.1) + k * 0.6 * (0.5 + 0.5 * Math.sin(this.age * 31));
  }

  /* ------------------------------------------------------------------ */
  /* Placement — every metre from live settings                          */
  /* ------------------------------------------------------------------ */

  _count() {
    const c = settings.obsidianwall;
    const run = Math.max(0, this.length - c.wallStart);
    return Math.max(1, Math.min(MAX_SLABS, Math.floor(run / Math.max(0.2, c.slabSpacing)) + 1));
  }

  /** Metres down the line slab `i` stands at. */
  _station(i) {
    const c = settings.obsidianwall;
    const spacing = Math.max(0.2, c.slabSpacing);
    return Math.min(this.length, c.wallStart + i * spacing + this.slabs[i].along * spacing * 0.2 * settings.global.randomness);
  }

  /** Slab height, crowned toward the middle of the wall. */
  _slabHeight(i, count) {
    const c = settings.obsidianwall;
    const f = count > 1 ? i / (count - 1) : 0.5;
    const crown = lerp(1, 0.55 + 0.45 * Math.sin(f * Math.PI), c.crestShape);
    return Math.max(0.1, c.slabHeight * crown * (1 + this.slabs[i].height * c.heightJitter * settings.global.randomness));
  }

  _slabFoot(i, out) {
    const c = settings.obsidianwall;
    this.pointAt(this._station(i) / this.length, out);
    out.addScaledVector(this.side, this.slabs[i].lateral * c.lateralJitter * settings.global.randomness);
    out.y = 0;
    return out;
  }

  /** How far up slab `i` is: 0 buried, 1 standing, past 1 in the punch. */
  _rise(i) {
    const c = settings.obsidianwall;
    const slab = this.slabs[i];
    if (slab.eruptAt < 0) return 0;
    const t = this._clock - slab.eruptAt - c.eruptDelay;
    if (t <= 0) return 0;
    const rise = Math.max(0.01, c.riseTime);
    if (t < rise) return Easing.outCubic(t / rise) * (1 + c.overshoot);
    const settle = Easing.outCubic(saturate((t - rise) / Math.max(0.01, c.settleTime)));
    return lerp(1 + c.overshoot, 1, settle);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.standEmitter.reset();
    this.emberEmitter.reset();
    this.trailEmitter.reset();
    this._clock = 0;
    this._seed = Math.random() * 100;
    this._heat = 1;
    this._charge = 0;

    for (const slab of this.slabs) {
      slab.along = randRange(-1, 1);
      slab.lateral = randRange(-1, 1);
      slab.height = randRange(-1, 1);
      slab.width = randRange(-1, 1);
      slab.lean = randRange(-1, 1);
      slab.yaw = randRange(-1, 1);
      slab.seed = Math.random() * 10;
      slab.eruptAt = -1;
      slab.brokeAt = -1;
      slab.erupted = false;
    }
    for (const shard of this.shards) {
      shard.fan = randRange(-1, 1);
      shard.speed = randRange(-1, 1);
      shard.lift = Math.random();
      shard.size = randRange(-1, 1);
      shard.side = Math.random();
      shard.h = Math.random();
      shard.w = randRange(-1, 1);
      shard.seed = Math.random() * 10;
      shard.axis.set(randRange(-1, 1), randRange(-1, 1), randRange(-1, 1));
      if (shard.axis.lengthSq() < 1e-4) shard.axis.set(0, 1, 0);
      shard.axis.normalize();
      shard.yaw = Math.random() * TAU;
      shard.done = false;
    }

    this.fissure.visible = true;
    this._sync(0);
  }

  /** Erupt every slab the front has reached. */
  _call(reach) {
    const count = this._count();
    for (let i = 0; i < count; i++) {
      const slab = this.slabs[i];
      if (slab.eruptAt < 0 && this._station(i) <= reach) slab.eruptAt = this._clock;
    }
  }

  onTravel(dt) {
    const c = settings.obsidianwall;
    this._clock += dt;
    this._call(this.front);
    this._sync(dt);
    this.ctx.shake.rumble(c.travelRumble, dt);
  }

  onImpact() {
    this._call(this.length + 1e3);
  }

  onFade(dt, t) {
    const c = settings.obsidianwall;
    const g = settings.global;
    this._clock += dt;
    this._call(this.length + 1e3);

    if (t <= 1) {
      // Standing; the last `chargeTime` of it, charging.
      const left = this.impactDuration - this.impactTime;
      this._charge = saturate(1 - left / Math.max(0.05, c.chargeTime * g.lifetime));
      if (this._charge > 0) this.ctx.shake.rumble(c.chargeRumble * this._charge, dt);
    } else {
      this._charge = 1;
      // The break, caster first.
      const count = this._count();
      for (let i = 0; i < count; i++) {
        const slab = this.slabs[i];
        if (slab.brokeAt >= 0 || slab.eruptAt < 0) continue;
        if (this.fadeTime >= i * c.shardStagger * g.lifetime) {
          slab.brokeAt = this._clock;
          this._breakFx(i, count);
        }
      }
    }
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _sync(dt) {
    const c = settings.obsidianwall;
    const g = settings.global;
    this._syncGeometry();
    this.glassMaterial.userData.sync();
    this._syncParticles();

    const travelling = this.phase === AbilityPhase.TRAVEL;
    if (!travelling) this._heat = Math.max(0, this._heat - dt / Math.max(0.05, c.fissureCool));

    const count = this._count();
    _slabUsed.fill(0);
    let standing = 0;
    let lightAlong = 0;

    for (let i = 0; i < count; i++) {
      const slab = this.slabs[i];
      if (slab.brokeAt >= 0) continue;
      const k = this._rise(i);
      if (k <= 0.001) continue;

      const v = i % SLAB_VARIANTS;
      const mesh = this.slabMeshes[v];
      const slot = _slabUsed[v]++;
      const H = this._slabHeight(i, count);
      const W = Math.max(0.1, c.slabWidth * (1 + slab.width * c.widthJitter * g.randomness));
      const T = Math.max(0.05, c.slabThickness);

      // Face along the wall: local X runs down the line.
      const yaw = Math.atan2(this.direction.x, this.direction.z) - Math.PI / 2 + slab.yaw * c.yawJitter * g.randomness;
      _q.setFromAxisAngle(_up, yaw);
      _q2.setFromAxisAngle(this.direction, slab.lean * c.leanJitter * g.randomness);
      _node.quaternion.copy(_q2).multiply(_q);

      this._slabFoot(i, _base);
      // Shiver while the wall charges.
      const shiver = c.chargeShiver * this._charge;
      if (shiver > 0) {
        _base.x += Math.sin(this._clock * 61 + slab.seed * 7) * shiver;
        _base.z += Math.cos(this._clock * 57 + slab.seed * 3) * shiver;
      }
      // Below 1 it slides up out of the floor (which hides the buried part);
      // past 1 it stretches — the punch of the eruption.
      _node.position.copy(_base);
      _node.position.y = -H * (1 - Math.min(k, 1));
      _node.scale.set(W, H * Math.max(k, 1), T);
      _node.updateMatrix();
      mesh.setMatrixAt(slot, _node.matrix);

      const heat = Math.exp(-(this._clock - slab.eruptAt) * c.heatDecay);
      const s = this._slabState[v].array;
      s[slot * 4 + 0] = slab.seed;
      s[slot * 4 + 1] = heat;
      s[slot * 4 + 2] = this._charge;
      s[slot * 4 + 3] = 0;

      // The frame it breaks the floor.
      if (!slab.erupted) {
        slab.erupted = true;
        this._eruptFx(i, _base, W);
      }
      standing++;
      lightAlong += this._station(i);
    }
    for (let v = 0; v < SLAB_VARIANTS; v++) {
      this.slabMeshes[v].count = _slabUsed[v];
      this.slabMeshes[v].instanceMatrix.needsUpdate = true;
      this._slabState[v].needsUpdate = true;
    }

    this._updateShards(dt, count);
    this._syncFissure(count);

    /* the charge: sparks off the standing wall, and the sift of dust */
    if (standing > 0) this._standFx(dt, count);

    // The light hangs over the middle of what stands (or what flies).
    const mid = standing > 0 ? lightAlong / standing : (c.wallStart + this.length) * 0.5;
    this.pointAt(Math.min(1, mid / this.length), this.position);
    if (travelling) this.pointAt(this.u, this.position);
    this.position.y = c.lightHeight;
  }

  _syncFissure(count) {
    const c = settings.obsidianwall;
    const fs = this._fissureState;
    const start = Math.max(0, c.wallStart - c.slabSpacing * 0.6);
    fs.start.copy(this.origin).addScaledVector(this.direction, start);
    fs.dir.copy(this.direction);
    fs.side.copy(this.side);
    const end = Math.min(this.length, this._station(count - 1) + c.slabSpacing * 0.6);
    fs.length = Math.max(0.2, end - start);
    fs.width = 2 * (Math.max(c.fissureMargin, c.fissureBranch) + c.fissureWander + c.lateralJitter + 0.2);
    fs.open = Math.max(0, Math.min(this.front, end) - start);
    fs.frontAt = this.front - start;
    fs.heat = this._heat;
    fs.charge = this._charge * 0.8;
    fs.fadeT = this.phase === AbilityPhase.FADE ? saturate(this.fadeTime / Math.max(0.05, this.fadeDuration) * 1.2 - 0.2) : 0;
    fs.seed = this._seed;
    this.fissureMaterial.userData.sync(fs);
  }

  _syncParticles() {
    const c = settings.obsidianwall;
    const g = settings.global;

    this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
    const d = this.dust.uniforms;
    d.uGravity.value.set(0, c.dustRise, 0);
    d.uSizeScale.value = g.particleSize;
    d.uLifeScale.value = g.particleLifetime;
    d.uSpeedScale.value = g.particleSpeed;
    d.uOpacity.value = c.dustOpacity * g.opacity;
    d.uTurbulence.value = c.dustTurbulence * g.turbulence;

    this.grit.setGradient(getColor(c.colorGritA), getColor(c.colorGritB), getColor(c.colorGritC), getColor(c.colorGritD));
    const r = this.grit.uniforms;
    r.uGravity.value.set(0, c.gritGravity, 0);
    r.uSizeScale.value = g.particleSize;
    r.uLifeScale.value = g.particleLifetime;
    r.uSpeedScale.value = g.particleSpeed;
    r.uOpacity.value = g.opacity;
    r.uTurbulence.value = 0.1 * g.turbulence;

    this.embers.setGradient(getColor(c.colorEmberA), getColor(c.colorEmberB), getColor(c.colorEmberC), getColor(c.colorEmberD));
    const e = this.embers.uniforms;
    e.uGravity.value.set(0, 0.8, 0);
    e.uSizeScale.value = g.particleSize;
    e.uLifeScale.value = g.particleLifetime;
    e.uSpeedScale.value = g.particleSpeed;
    e.uOpacity.value = g.opacity;
    e.uGlow.value = 1.6 * g.glow;
    e.uTurbulence.value = 0.5 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* The shards                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Where shard `j` of slab `i` is, `t` seconds after its slab broke.
   *
   * Ballistic to a landing time solved per shard (the floor is at the shard's
   * own half-size), then an exponential skid along the floor. Returns the
   * remaining speed so the caller knows whether it can still hurt anything.
   */
  _shardAt(i, j, t, out, vel) {
    const c = settings.obsidianwall;
    const g = settings.global;
    const shard = this.shards[i * SHARDS_PER + j];
    const count = this._count();

    /* where on the slab it came from */
    this._slabFoot(i, _base);
    const H = this._slabHeight(i, count);
    _base.addScaledVector(this.direction, shard.w * c.slabWidth * 0.4);
    const y0 = 0.15 + shard.h * H * 0.85;

    /* the launch: out of either face, fanned, biased down the line */
    const sign = shard.side < 0.5 * c.shardSides ? -1 : 1;
    const a = shard.fan * c.shardFan * 0.5;
    _dir.copy(this.side).multiplyScalar(sign * Math.cos(a)).addScaledVector(this.direction, Math.sin(a) + c.shardForward);
    _dir.y = 0;
    if (_dir.lengthSq() < 1e-5) _dir.copy(this.side);
    _dir.normalize();
    const speed = Math.max(0, c.shardSpeed * g.explosionIntensity * (1 + shard.speed * c.shardSpeedJitter * g.randomness));
    const vy = c.shardLift * (0.5 + shard.lift);
    const grav = Math.min(-0.1, c.shardGravity);
    const size = this._shardSize(shard);
    const rest = size * 0.22;

    // Solve y0 + vy t + ½ g t² = rest.
    const disc = vy * vy - 2 * grav * (y0 - rest);
    const tl = (vy + Math.sqrt(Math.max(0, disc))) / -grav;

    if (t < tl) {
      out.copy(_base).addScaledVector(_dir, speed * t);
      out.y = y0 + vy * t + 0.5 * grav * t * t;
      vel.copy(_dir).multiplyScalar(speed);
      vel.y = vy + grav * t;
      return speed;
    }
    const k = 4 / Math.max(0.01, c.shardSkid + 0.05);
    const s = t - tl;
    const skid = speed * c.shardSkid;
    const slide = (skid * (1 - Math.exp(-k * s))) / k;
    out.copy(_base).addScaledVector(_dir, speed * tl + slide);
    out.y = rest;
    const left = skid * Math.exp(-k * s);
    vel.copy(_dir).multiplyScalar(left);
    return left;
  }

  _shardSize(shard) {
    const c = settings.obsidianwall;
    return Math.max(0.03, c.shardSize * (1 + shard.size * c.shardSizeJitter * settings.global.randomness));
  }

  _updateShards(dt, count) {
    const c = settings.obsidianwall;
    const g = settings.global;
    const per = Math.min(SHARDS_PER, Math.max(0, Math.round(c.shardsPerSlab)));
    const flight = Math.max(0.1, c.shardFlightTime * g.lifetime);
    const field = this.ctx.dummies;
    _shardUsed.fill(0);

    this._force.impulse = c.shardImpulse * g.explosionIntensity;
    this._force.lift = c.shardKillLift * g.explosionIntensity;
    this._force.spin = c.shardKillSpin;

    let flying = 0;
    for (let i = 0; i < count; i++) {
      const slab = this.slabs[i];
      if (slab.brokeAt < 0) continue;
      const t = this._clock - slab.brokeAt;
      if (t >= flight) continue;

      for (let j = 0; j < per; j++) {
        const idx = i * SHARDS_PER + j;
        const shard = this.shards[idx];
        const speed = this._shardAt(i, j, t, _pos, _vel);
        const size = this._shardSize(shard);

        // Tumble while it flies; lie still once it has stopped.
        const spinT = speed > 0.3 ? t : t * 0.2;
        _q.setFromAxisAngle(shard.axis, c.shardSpin * spinT + shard.yaw);
        _node.quaternion.copy(_q);
        // Shrinks away over the last part of the flight.
        const shrink = 1 - Easing.inQuad(saturate((t / flight - (1 - c.shardShrink)) / Math.max(0.01, c.shardShrink)));
        // Pops to full size over its first instant, so it does not appear whole.
        const pop = Easing.outBack(saturate(t / 0.08));
        _node.position.copy(_pos);
        _node.scale.set(size * 0.55, size, size * 0.45).multiplyScalar(Math.max(0.0001, shrink * pop));
        _node.updateMatrix();

        const v = idx % SHARD_VARIANTS;
        const slot = _shardUsed[v]++;
        this.shardMeshes[v].setMatrixAt(slot, _node.matrix);
        const s = this._shardState[v].array;
        s[slot * 4 + 0] = shard.seed;
        s[slot * 4 + 1] = Math.exp(-t * 2.5);
        s[slot * 4 + 2] = 0;
        s[slot * 4 + 3] = 1;
        flying++;

        /* the hit: only while it is still moving with intent */
        if (!shard.done && speed > 1.5 && _pos.y < 2.4 && field?.findTargets) {
          const found = field.findTargets(_pos.x, _pos.z, c.shardHitRadius, this._found);
          for (const dummy of found) {
            const h = Math.hypot(_vel.x, _vel.z);
            const dx = h > 1e-4 ? _vel.x / h : this.side.x;
            const dz = h > 1e-4 ? _vel.z / h : this.side.z;
            if (dummy.kill(dx, dz, this._force)) this._hitFx(dummy.position);
          }
        }
        if (speed <= 0.3 && !shard.done) shard.done = true;
      }
    }

    for (let v = 0; v < SHARD_VARIANTS; v++) {
      this.shardMeshes[v].count = _shardUsed[v];
      this.shardMeshes[v].instanceMatrix.needsUpdate = true;
      this._shardState[v].needsUpdate = true;
    }

    /* dust trailing the volley */
    if (flying > 0) {
      const n = this.trailEmitter.tick(dt, c.trailRate * g.particleCount);
      if (n > 0) {
        this._resetEmit(frame.uTime.value);
        _emit.size = c.dustSize * 0.45;
        _emit.life = c.dustLifetime * 0.5;
        _emit.speed = 0.4;
        _emit.spread = 1;
        for (let k = 0; k < n; k++) {
          // A random shard of a random broken slab.
          const i = (Math.random() * count) | 0;
          const slab = this.slabs[i];
          if (slab.brokeAt < 0 || per === 0) continue;
          const t = this._clock - slab.brokeAt;
          if (t >= flight * 0.8) continue;
          const j = (Math.random() * per) | 0;
          this._shardAt(i, j, t, _pos, _vel);
          _emit.position = _pos;
          this.dust.emit(1, _emit);
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  _resetEmit(time) {
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.4;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.5;
    _emit.life = 1;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  /** A slab breaking the floor: dust, grit, a crack and a ring, a knock. */
  _eruptFx(i, foot, W) {
    const c = settings.obsidianwall;
    const g = settings.global;
    const time = frame.uTime.value;

    this._resetEmit(time);
    _pos.copy(foot).setY(0.2);
    _emit.position = _pos;
    _emit.radius = W * 0.4;
    _emit.direction = _up;
    _emit.speed = c.dustSpeed;
    _emit.spread = 0.9;
    _emit.size = c.dustSize;
    _emit.life = c.dustLifetime;
    _emit.spin = 0.5;
    this.dust.emit(Math.round(c.dustPerSlab * g.particleCount), _emit);

    _emit.radius = W * 0.3;
    _emit.speed = c.gritSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.75;
    _emit.size = c.gritSize;
    _emit.sizeVariance = 0.7;
    _emit.life = c.gritLifetime;
    _emit.spin = 9;
    this.grit.emit(Math.round(c.gritPerSlab * g.particleCount), _emit);

    this.ctx.decals.spawn(DecalType.CRACK, foot, {
      radius: W * 1.1,
      life: c.lifetime + 1.5,
      width: 0.5,
      intensity: 1,
      colorA: getColor(c.colorFissure),
      colorB: getColor(c.colorFissureGlow)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, foot, {
      radius: c.ringRadius,
      life: c.ringLife,
      intensity: c.ringIntensity,
      colorA: getColor(c.colorRingA),
      colorB: getColor(c.colorRingB)
    });

    this.ctx.shake.add(c.eruptShake * g.explosionIntensity, 7, 20);
    this.lightBoost = Math.max(this.lightBoost, c.eruptLight * g.explosionIntensity);

    // A body standing where a slab comes up is thrown off it.
    const field = this.ctx.dummies;
    if (c.eruptKnock > 0 && field?.findTargets) {
      const found = field.findTargets(foot.x, foot.z, W * 0.5, this._found);
      this._force.impulse = c.eruptKnock * 0.4;
      this._force.lift = c.eruptKnock;
      this._force.spin = c.shardKillSpin;
      for (const dummy of found) {
        const sx = (dummy.position.x - foot.x) * this.side.x + (dummy.position.z - foot.z) * this.side.z;
        const sign = sx >= 0 ? 1 : -1;
        dummy.kill(this.side.x * sign, this.side.z * sign, this._force);
      }
    }
  }

  /** The standing wall: a sift of dust, and sparks once it charges. */
  _standFx(dt, count) {
    const c = settings.obsidianwall;
    const g = settings.global;
    const time = frame.uTime.value;

    const sift = this.standEmitter.tick(dt, c.standDust * g.particleCount * (this.phase === AbilityPhase.TRAVEL ? 0.4 : 1));
    if (sift > 0) {
      this._resetEmit(time);
      _emit.size = c.dustSize * 0.6;
      _emit.life = c.dustLifetime;
      _emit.direction = _up;
      _emit.speed = 0.3;
      _emit.spread = 0.6;
      _emit.radius = 0.2;
      for (let k = 0; k < sift; k++) {
        const i = (Math.random() * count) | 0;
        if (this.slabs[i].brokeAt >= 0 || this._rise(i) < 0.9) continue;
        this._slabFoot(i, _pos);
        _pos.y = 0.15 + Math.random() * 0.4;
        _pos.addScaledVector(this.side, (Math.random() - 0.5) * c.slabThickness * 1.6);
        _emit.position = _pos;
        this.dust.emit(1, _emit);
      }
    }

    if (this._charge <= 0) return;
    const sparks = this.emberEmitter.tick(dt, c.emberRate * this._charge * g.particleCount);
    if (sparks <= 0) return;
    this._resetEmit(time);
    _emit.size = c.emberSize;
    _emit.life = c.emberLifetime;
    _emit.direction = _up;
    _emit.speed = c.emberSpeed;
    _emit.spread = 0.5;
    for (let k = 0; k < sparks; k++) {
      const i = (Math.random() * count) | 0;
      if (this.slabs[i].brokeAt >= 0 || this._rise(i) < 0.9) continue;
      this._slabFoot(i, _pos);
      _pos.y = Math.random() * this._slabHeight(i, count) * 0.9;
      _pos.addScaledVector(this.direction, (Math.random() - 0.5) * c.slabWidth * 0.8);
      _pos.addScaledVector(this.side, (Math.random() - 0.5) * c.slabThickness);
      _emit.position = _pos;
      this.embers.emit(1, _emit);
    }
  }

  /** A slab coming apart: grit, dust, and — for the wall — the knock. */
  _breakFx(i, count) {
    const c = settings.obsidianwall;
    const g = settings.global;
    const time = frame.uTime.value;
    this._slabFoot(i, _base);
    const H = this._slabHeight(i, count);

    this._resetEmit(time);
    _pos.copy(_base).setY(H * 0.5);
    _emit.position = _pos;
    _emit.radius = c.slabWidth * 0.4;
    _emit.direction = _up;
    _emit.speed = c.gritSpeed * 1.3;
    _emit.speedVariance = 0.6;
    _emit.spread = 1;
    _emit.size = c.gritSize;
    _emit.sizeVariance = 0.7;
    _emit.life = c.gritLifetime;
    _emit.spin = 12;
    this.grit.emit(Math.round(c.gritPerSlab * c.breakGrit * g.particleCount), _emit);

    _pos.y = H * 0.35;
    _emit.radius = c.slabWidth * 0.5;
    _emit.speed = c.dustSpeed * 1.4;
    _emit.size = c.dustSize * 1.1;
    _emit.life = c.dustLifetime;
    _emit.spin = 0.4;
    this.dust.emit(Math.round(c.dustPerSlab * g.particleCount), _emit);

    _pos.y = H * 0.5;
    this.embers.emit(Math.round(10 * g.particleCount), _emit);

    // The wall's big beat: on the first slab, and at a few points down it.
    const bursts = Math.max(0, Math.round(c.breakBursts));
    const every = bursts > 0 ? Math.max(1, Math.floor(count / bursts)) : 0;
    if (i === 0) {
      this.ctx.shake.add(c.breakShake * g.explosionIntensity, 1 / Math.max(0.05, c.breakShakeDuration), 16);
      this.ctx.flash.trigger(getColor(c.colorFlash), c.breakFlash * g.explosionIntensity);
      this.lightBoost = c.breakLight * g.explosionIntensity;
    }
    if (every > 0 && i % every === 0) {
      _pos.copy(_base).setY(H * 0.45);
      this.ctx.bursts.spawn(BurstMode.EARTH, _pos, {
        radius: 0.3,
        endRadius: c.breakBurst * g.explosionIntensity,
        life: 0.6,
        intensity: 1,
        opacity: 0.8,
        squash: 0.8,
        colorA: getColor(c.colorBurstA),
        colorB: getColor(c.colorBurstB),
        colorC: getColor(c.colorBurstC)
      });
      this.ctx.decals.spawn(DecalType.SHOCKWAVE, _base, {
        radius: c.breakBurst * 1.4,
        life: 0.5,
        width: 0.05,
        intensity: 0.9,
        colorA: getColor(c.colorFissureGlow),
        colorB: getColor(c.colorBurstA)
      });
      this.ctx.shake.add(c.breakShake * 0.3 * g.explosionIntensity, 6, 18);
    }
  }

  /** Grit where a shard went into a body. */
  _hitFx(at) {
    const c = settings.obsidianwall;
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _base.copy(at).setY(1.0);
    _emit.position = _base;
    _emit.radius = 0.2;
    _emit.direction = _up;
    _emit.speed = c.gritSpeed * 0.7;
    _emit.spread = 1;
    _emit.size = c.gritSize;
    _emit.life = c.gritLifetime * 0.8;
    _emit.spin = 10;
    this.grit.emit(Math.round(14 * g.particleCount), _emit);
    this.embers.emit(Math.round(8 * g.particleCount), _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    for (const mesh of this.slabMeshes) mesh.count = 0;
    for (const mesh of this.shardMeshes) mesh.count = 0;
    this.fissure.visible = false;
  }

  dispose() {
    for (const mesh of this.slabMeshes) mesh.geometry.dispose();
    for (const mesh of this.shardMeshes) mesh.geometry.dispose();
    this.fissureGeometry.dispose();
    this.glassMaterial.dispose();
    this.fissureMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('◆  Obsidian Wall');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 50, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'eruption speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 12, 0.05, 'wall stands for (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0, 6, 0.05, 'height (m)');
  R(light, c, 'eruptLight', 0, 20, 0.1, 'punch per slab');
  R(light, c, 'breakLight', 0, 60, 0.1, 'punch on the break');

  const wall = folder.addFolder('1 · Wall');
  R(wall, c, 'wallStart', 0, 6, 0.05, 'starts after (m)');
  R(wall, c, 'slabSpacing', 0.3, 4, 0.01, 'spacing (m)');
  R(wall, c, 'slabHeight', 0.3, 8, 0.05, 'height (m)');
  R(wall, c, 'slabWidth', 0.2, 4, 0.01, 'width (m)');
  R(wall, c, 'slabThickness', 0.1, 2, 0.01, 'thickness (m)');
  R(wall, c, 'heightJitter', 0, 0.8, 0.01, 'height jitter');
  R(wall, c, 'widthJitter', 0, 0.8, 0.01, 'width jitter');
  R(wall, c, 'lateralJitter', 0, 1, 0.01, 'off the line (m)');
  R(wall, c, 'leanJitter', 0, 0.6, 0.005, 'lean (rad)');
  R(wall, c, 'yawJitter', 0, 1.2, 0.01, 'turn (rad)');
  R(wall, c, 'crestShape', 0, 1, 0.01, 'crowned in the middle');
  R(wall, c, 'slabJag', 0, 0.8, 0.01, 'ragged top (rebuild)');
  R(wall, c, 'slabLumps', 0, 0.4, 0.005, 'facet wander (rebuild)');
  R(wall, c, 'slabTaper', 0, 0.8, 0.01, 'taper (rebuild)');
  const erupt = wall.addFolder('Eruption');
  R(erupt, c, 'eruptDelay', 0, 0.5, 0.005, 'behind the front (s)');
  R(erupt, c, 'riseTime', 0.02, 1, 0.005, 'rise (s)');
  R(erupt, c, 'overshoot', 0, 0.6, 0.01, 'overshoot');
  R(erupt, c, 'settleTime', 0.02, 1, 0.005, 'settle (s)');
  R(erupt, c, 'eruptShake', 0, 0.5, 0.005, 'knock per slab');
  R(erupt, c, 'eruptKnock', 0, 16, 0.1, 'throws bodies (m/s)');
  R(erupt, c, 'travelRumble', 0, 1.5, 0.01, 'rumble in travel');

  const glass = folder.addFolder('2 · Volcanic glass');
  R(glass, c, 'glassEnv', 0, 4, 0.01, 'sky reflection');
  R(glass, c, 'glassFresnel', 0, 2, 0.01, 'grazing mirror');
  R(glass, c, 'glassSpecular', 0, 20, 0.05, 'sun glint');
  R(glass, c, 'glassGloss', 8, 1200, 1, 'gloss');
  R(glass, c, 'glassDiffuse', 0, 1, 0.01, 'diffuse');
  R(glass, c, 'ridgeStrength', 0, 1, 0.005, 'conchoidal ripples');
  R(glass, c, 'ridgeFrequency', 0.2, 12, 0.05, 'ripples per metre');
  R(glass, c, 'ridgeReach', 0.05, 3, 0.01, 'ripple reach (m)');
  R(glass, c, 'crackScale', 0.2, 8, 0.05, 'crack scale');
  R(glass, c, 'crackWidth', 0.005, 0.3, 0.001, 'crack width');
  R(glass, c, 'crackGlow', 0, 8, 0.05, 'crack glow');
  R(glass, c, 'deepGlow', 0, 4, 0.01, 'inner glow');
  R(glass, c, 'deepDepth', 0, 0.6, 0.005, 'inner glow depth (m)');
  R(glass, c, 'rootGlow', 0, 1, 0.01, 'hotter at the root');
  R(glass, c, 'crackPulse', 0, 1, 0.01, 'crack throb');
  R(glass, c, 'rimGlow', 0, 2, 0.01, 'rim');
  R(glass, c, 'heatDecay', 0.1, 8, 0.05, 'cools (per s)');
  glass.addColor(c, 'colorGlass').name('glass');
  glass.addColor(c, 'colorSheen').name('sheen');
  glass.addColor(c, 'colorCrack').name('cracks');
  glass.addColor(c, 'colorDeep').name('inner glow');
  glass.addColor(c, 'colorRim').name('rim');

  const fissure = folder.addFolder('3 · Fissure');
  R(fissure, c, 'fissureWidth', 0.01, 0.6, 0.005, 'rift half-width (m)');
  R(fissure, c, 'fissureMargin', 0.05, 3, 0.01, 'scorched margin (m)');
  R(fissure, c, 'fissureBranch', 0, 4, 0.01, 'side cracks reach (m)');
  R(fissure, c, 'fissureBranchScale', 0.2, 8, 0.05, 'side crack scale');
  R(fissure, c, 'fissureWander', 0, 1, 0.005, 'zigzag (m)');
  R(fissure, c, 'fissureGlow', 0, 10, 0.05, 'glow');
  R(fissure, c, 'fissureDark', 0, 1, 0.01, 'darkness');
  R(fissure, c, 'fissureCool', 0.05, 6, 0.05, 'cools over (s)');
  R(fissure, c, 'fissureErode', 0, 1, 0.01, 'ragged fade');
  R(fissure, c, 'ringRadius', 0, 4, 0.05, 'dust ring (m)');
  R(fissure, c, 'ringLife', 0.1, 4, 0.05, 'dust ring life');
  R(fissure, c, 'ringIntensity', 0, 2, 0.01, 'dust ring strength');
  fissure.addColor(c, 'colorFissure').name('rift');
  fissure.addColor(c, 'colorFissureGlow').name('glow');
  fissure.addColor(c, 'colorScorch').name('scorch');
  fissure.addColor(c, 'colorRingA').name('ring dark');
  fissure.addColor(c, 'colorRingB').name('ring light');

  const dust = folder.addFolder('4 · Dust + grit');
  R(dust, c, 'dustPerSlab', 0, 60, 1, 'dust per slab');
  R(dust, c, 'dustSize', 0.05, 3, 0.01, 'dust size');
  R(dust, c, 'dustSpeed', 0, 10, 0.05, 'dust speed');
  R(dust, c, 'dustLifetime', 0.1, 5, 0.05, 'dust life');
  R(dust, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  R(dust, c, 'dustRise', -1, 2, 0.01, 'dust rise');
  R(dust, c, 'dustTurbulence', 0, 3, 0.01, 'dust turbulence');
  R(dust, c, 'standDust', 0, 200, 1, 'sift off the wall / s');
  Editor.gradient(dust, c, 'colorDust', 'dust gradient');
  R(dust, c, 'gritPerSlab', 0, 120, 1, 'grit per slab');
  R(dust, c, 'gritSize', 0.005, 0.4, 0.001, 'grit size');
  R(dust, c, 'gritSpeed', 0, 20, 0.05, 'grit speed');
  R(dust, c, 'gritLifetime', 0.1, 4, 0.05, 'grit life');
  R(dust, c, 'gritGravity', -40, 0, 0.1, 'grit gravity');
  Editor.gradient(dust, c, 'colorGrit', 'grit gradient');

  const charge = folder.addFolder('5 · Charge');
  R(charge, c, 'chargeTime', 0.05, 3, 0.01, 'charges for (s)');
  R(charge, c, 'chargeShiver', 0, 0.2, 0.001, 'shiver (m)');
  R(charge, c, 'chargeRumble', 0, 1.5, 0.01, 'rumble');
  R(charge, c, 'emberRate', 0, 600, 1, 'sparks / s');
  R(charge, c, 'emberSize', 0.005, 0.3, 0.001, 'spark size');
  R(charge, c, 'emberSpeed', 0, 8, 0.05, 'spark speed');
  R(charge, c, 'emberLifetime', 0.05, 3, 0.01, 'spark life');
  Editor.gradient(charge, c, 'colorEmber', 'spark gradient');

  const shards = folder.addFolder('6 · Shards');
  R(shards, c, 'shardsPerSlab', 0, SHARDS_PER, 1, 'per slab');
  R(shards, c, 'shardSize', 0.05, 1.5, 0.01, 'size (m)');
  R(shards, c, 'shardSizeJitter', 0, 0.9, 0.01, 'size jitter');
  R(shards, c, 'shardSpeed', 0, 40, 0.1, 'speed (m/s)');
  R(shards, c, 'shardSpeedJitter', 0, 1, 0.01, 'speed jitter');
  R(shards, c, 'shardLift', 0, 15, 0.05, 'lift (m/s)');
  R(shards, c, 'shardFan', 0, 3.1, 0.01, 'fan (rad)');
  R(shards, c, 'shardForward', -1, 1, 0.01, 'down the line');
  R(shards, c, 'shardSides', 0, 1, 0.01, 'both sides');
  R(shards, c, 'shardGravity', -40, -0.5, 0.1, 'gravity');
  R(shards, c, 'shardSpin', 0, 40, 0.1, 'spin (rad/s)');
  R(shards, c, 'shardStagger', 0, 0.3, 0.001, 'stagger (s)');
  R(shards, c, 'shardFlightTime', 0.2, 5, 0.05, 'volley lasts (s)');
  R(shards, c, 'shardShrink', 0.01, 1, 0.01, 'shrinks over (× flight)');
  R(shards, c, 'shardSkid', 0, 1, 0.01, 'skid');
  R(shards, c, 'trailRate', 0, 800, 1, 'dust trail / s');
  const hits = shards.addFolder('Hits');
  R(hits, c, 'shardHitRadius', 0, 2, 0.01, 'hit radius (m)');
  R(hits, c, 'shardImpulse', 0, 20, 0.1, 'thrown (m/s)');
  R(hits, c, 'shardKillLift', 0, 12, 0.05, 'lift (m/s)');
  R(hits, c, 'shardKillSpin', 0, 5, 0.01, 'torque');
  const brk = shards.addFolder('The break');
  R(brk, c, 'breakShake', 0, 1.5, 0.01, 'shake');
  R(brk, c, 'breakShakeDuration', 0.05, 2, 0.01, 'shake lasts');
  R(brk, c, 'breakFlash', 0, 1, 0.01, 'flash');
  R(brk, c, 'breakBurst', 0, 8, 0.05, 'shell (m)');
  R(brk, c, 'breakBursts', 0, 8, 1, 'shells down the wall');
  R(brk, c, 'breakGrit', 0, 5, 0.05, 'grit (×)');
  brk.addColor(c, 'colorFlash').name('flash');
  brk.addColor(c, 'colorBurstA').name('shell inner');
  brk.addColor(c, 'colorBurstB').name('shell mid');
  brk.addColor(c, 'colorBurstC').name('shell outer');

  folder.close();
  return folder;
}
