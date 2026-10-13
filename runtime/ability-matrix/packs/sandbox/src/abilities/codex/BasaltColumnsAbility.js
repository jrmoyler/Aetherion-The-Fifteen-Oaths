import {
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Euler,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createHexColumnGeometry, hexCellCentre } from '../../assets/codex/BasaltColumnsGeometry.js';
import {
  createBasaltRockMaterial,
  createBasaltGroundMaterial,
  createBasaltShimmerMaterial
} from '../../materials/codex/BasaltColumnsMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'basalt';

/** Hard ceiling on columns per cast. The grid is clipped to this. */
const MAX_COLUMNS = 360;
/** Bodies one cast remembers having thrown, so a corpse is not juggled by every column it lands on. */
const MAX_THROWN = 24;
const TAU = Math.PI * 2;
const SQRT3 = Math.sqrt(3);

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _up = new Vector3(0, 1, 0);
const _scale = new Vector3();
const _q = new Quaternion();
const _euler = new Euler();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
const _cell = { x: 0, z: 0 };
const _groundState = { centre: new Vector3(), radius: 4, cell: 0.55, seed: 0, front: 0, open: 0, heat: 1, erode: 0 };
const _shimmerState = { strength: 0, seed: 0 };

/** Push one particle system's gradient and the globals through. Module-level, so no closure per frame. */
function syncSystem(p, a, b, cc, d, size, glow, turb) {
  const g = settings.global;
  p.setGradient(getColor(a), getColor(b), getColor(cc), getColor(d));
  p.uniforms.uSizeScale.value = size * g.particleSize * 7;
  p.uniforms.uLifeScale.value = g.particleLifetime;
  p.uniforms.uSpeedScale.value = g.particleSpeed;
  p.uniforms.uOpacity.value = g.opacity;
  p.uniforms.uGlow.value = glow;
  p.uniforms.uTurbulence.value = turb * g.turbulence;
}

/**
 * BASALT COLUMNS — Earth, zone cast.
 *
 * A fissure runs along the floor from the caster's feet to the circle. Where
 * it arrives, the floor **cracks into a honeycomb**, and then **hexagonal
 * basalt columns punch up out of it** — the centre first, a ripple running
 * out to the rim — each to its own height, throwing rock chips, sparks and
 * dust. Whatever is standing on a column as it rises is **hurled skyward**,
 * harder the taller its column. The columns stand for a beat, glowing at the
 * foot where the rock is freshly extruded, then **sink back** into the floor
 * with a rumble, and the seams cool from orange to black and erode away.
 *
 * ## Layers
 *
 *   1. **the columns** — one InstancedMesh of chamfered hex prisms
 *      (`createHexColumnGeometry`) in the bespoke basalt shader
 *      (`createBasaltRockMaterial`): flat facets, strata measured below each
 *      column's own top so the beds ride up with it, worn arrises, a cracked
 *      cap and a white-hot → red foot. Opaque on `LAYER.WORLD`, so they write
 *      the depth prepass (the dust feathers against them) and cast shadows.
 *      Placed through `instanceMatrix`, so the prepass override and the shadow
 *      depth material — neither of which knows this shader — still draw them
 *      where they are.
 *   2. **the honeycomb** (`createBasaltGroundMaterial`) — the floor disc.
 *      Its hex SDF is the *same grid* the columns are laid out on
 *      (`hexCellCentre` ↔ `hexCentre`), so every column stands exactly inside
 *      the seam it came out of. A ragged crack front races out; plates darken;
 *      seams open on magma, wider while the columns are up.
 *   3. **heat shimmer** — an open cylinder on `LAYER.DISTORTION`.
 *   4. **rock chips** (CHIP, lit), **dust** (SMOKE), **embers** (SOFT,
 *      additive, off the seams) and **sparks** (STREAK) — per column as it
 *      breaks the floor, and as it sinks.
 *   5. **the beat** — an EARTH burst, a SHOCKWAVE and a DUSTRING when the
 *      first wave breaks; a flash and a light punch; a rumble that tracks how
 *      many columns are moving at that instant; CRACK decals and embers down
 *      the fissure during the travel.
 *
 * ## The bodies
 *
 * `handlesOwnHits`. The moment a column passes `launchAt` of its rise, every
 * body standing within its cap (`findTargets`, `hitRadius` × cell) is killed
 * with a blow that is mostly *up*: `liftBase + liftPerMetre × height`, plus a
 * little outward from the circle's centre so a body thrown off the middle
 * column does not land back on it. A body already lying on a rising column is
 * shoved up the same way (`Dummy#shove`) — once per cast, so a corpse is not
 * juggled to the sky by every column it comes down on.
 *
 * ## The editor rule
 *
 * A column record holds dice only — a height roll, a timing roll, a sink roll,
 * a tilt, a seed — plus the three one-shot events it latches (breaking the
 * floor, throwing what stands on it, starting to sink). Its place is the hex
 * grid, re-cut whenever `cellSize`, `zoneRadius` or `rimMargin` moves; its
 * height, timing, heat and colour are resolved from `settings.basalt` every
 * frame. Dragging `heightMax` re-raises a field that is already standing.
 */
export class BasaltColumnsAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /** The columns decide who is thrown, and when. */
  get handlesOwnHits() {
    return true;
  }

  /** Columns standing above the floor. HUD readout only. */
  get instanceCount() {
    let n = 0;
    for (let i = 0; i < this._count; i++) if (this.cols[i].h > 0.01) n++;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the columns ---- */
    this.rockMaterial = createBasaltRockMaterial();
    this.stateAttr = new InstancedBufferAttribute(new Float32Array(MAX_COLUMNS * 4), 4);
    this.stateAttr.setUsage(DynamicDrawUsage);
    this._geoBevel = -1;
    this._geoDrop = -1;
    this.columnGeometry = null;
    this.columns = new InstancedMesh(this._columnGeometry(), this.rockMaterial, MAX_COLUMNS);
    this.columns.name = 'BasaltColumns';
    this.columns.instanceMatrix.setUsage(DynamicDrawUsage);
    this.columns.layers.set(LAYER.WORLD);
    this.columns.castShadow = true;
    this.columns.receiveShadow = false;
    this.columns.frustumCulled = false;
    this.columns.count = 0;
    this.columns.visible = false;
    this.group.add(this.columns);

    /* ---- layer 2: the honeycomb ---- */
    this.groundGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.groundMaterial = createBasaltGroundMaterial();
    this.ground = new Mesh(this.groundGeometry, this.groundMaterial);
    this.ground.name = 'BasaltHoneycomb';
    this.ground.layers.set(LAYER.VFX);
    this.ground.frustumCulled = false;
    this.ground.renderOrder = 2;
    this.ground.visible = false;
    this.group.add(this.ground);

    /* ---- layer 3: heat shimmer ---- */
    this.shimmerGeometry = new CylinderGeometry(1, 1, 1, 40, 1, true);
    this.shimmerGeometry.translate(0, 0.5, 0);
    this.shimmerMaterial = createBasaltShimmerMaterial();
    this.shimmer = new Mesh(this.shimmerGeometry, this.shimmerMaterial);
    this.shimmer.name = 'BasaltShimmer';
    this.shimmer.layers.set(LAYER.DISTORTION);
    this.shimmer.frustumCulled = false;
    this.shimmer.visible = false;
    this.group.add(this.shimmer);

    /** Dice and latches only — see the class comment. */
    this.cols = [];
    for (let i = 0; i < MAX_COLUMNS; i++) {
      this.cols.push({
        x: 0, // world XZ of its hex centre (from the grid)
        z: 0,
        dist: 0, // metres from the circle's centre
        hDice: 0,
        dDice: 0,
        sDice: 0,
        tiltX: 0,
        tiltZ: 0,
        seed: 0,
        broke: false,
        launched: false,
        sinking: false,
        h: 0 // the height this frame — read by the HUD and the hit
      });
    }
    this._count = 0;
    this._layoutCell = -1;
    this._layoutRadius = -1;
    this._layoutMargin = -1;
    this._clock = -1;
    this._seed = 0;
    this._firstWave = false;
    this._travelled = 0;
    this._open = 0;

    this._targets = [];
    this._thrown = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.chips = particles.get('basalt.chip', {
      capacity: 2400,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.1
    });
    this.chips.uniforms.uDrag.value = 0.4;
    this.chips.uniforms.uEndSize.value = 0.8;
    this.chips.uniforms.uSizeIn.value = 0.02;
    this.chips.uniforms.uFadeIn.value = 0.01;
    this.chips.uniforms.uFadeOut.value = 0.25;

    this.dust = particles.get('basalt.dust', {
      capacity: 1400,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.6
    });
    this.dust.uniforms.uDrag.value = 1.6;
    this.dust.uniforms.uEndSize.value = 2.2;
    this.dust.uniforms.uSizeIn.value = 0.12;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.6;

    this.embers = particles.get('basalt.ember', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.embers.uniforms.uDrag.value = 0.9;
    this.embers.uniforms.uEndSize.value = 0.3;
    this.embers.uniforms.uSizeIn.value = 0.05;
    this.embers.uniforms.uFadeIn.value = 0.05;
    this.embers.uniforms.uFadeOut.value = 0.5;

    this.sparks = particles.get('basalt.spark', {
      capacity: 1200,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparks.uniforms.uDrag.value = 2.2;
    this.sparks.uniforms.uEndSize.value = 0.2;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.01;
    this.sparks.uniforms.uFadeOut.value = 0.6;

    this.emberEmitter = new RateEmitter();
    this.travelEmitter = new RateEmitter();
  }

  /**
   * The prism, rebuilt only when its chamfer moves. The chamfer's drop is in
   * metres but the shaft is scaled to the column's full length, so the unit
   * geometry carries it pre-divided by that length.
   */
  _columnGeometry() {
    const c = settings.basalt;
    const length = this._shaftLength(c);
    const bevel = Math.max(0, c.topBevel);
    const drop = Math.max(0.001, c.bevelDrop) / length;
    // Rebuilt only when either number has moved — compared as numbers, no key string per frame.
    if (this.columnGeometry && Math.abs(bevel - this._geoBevel) < 1e-5 && Math.abs(drop - this._geoDrop) < 1e-6) {
      return this.columnGeometry;
    }
    this._geoBevel = bevel;
    this._geoDrop = drop;
    const old = this.columnGeometry;
    this.columnGeometry = createHexColumnGeometry(bevel, drop);
    this.columnGeometry.setAttribute('aState', this.stateAttr);
    if (this.columns) this.columns.geometry = this.columnGeometry;
    old?.dispose();
    return this.columnGeometry;
  }

  /** Metres from cap to foot: enough that the tallest column, overshooting, still has its foot under the floor. */
  _shaftLength(c) {
    return Math.max(0.5, c.heightMax * (1 + Math.max(0, c.overshoot) * 0.6) + Math.max(0.1, c.columnDepth));
  }

  /* ------------------------------------------------------------------ */
  /* The grid                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Cut the circle into hex cells. Positions come from the grid; the dice in
   * each record are kept by index, so re-cutting mid-cast reshapes the field
   * without re-rolling it. Allocation-free: fixed records, written in place.
   */
  _layout(force = false) {
    const c = settings.basalt;
    const s = Math.max(0.15, c.cellSize);
    const R = Math.max(0.5, c.zoneRadius);
    const margin = Math.max(0, c.rimMargin) * s;
    if (!force && s === this._layoutCell && R === this._layoutRadius && margin === this._layoutMargin) return;
    this._layoutCell = s;
    this._layoutRadius = R;
    this._layoutMargin = margin;

    this.pointAt(1, _centre);
    const N = Math.ceil(R / (1.5 * s)) + 1;
    const limit = R - margin;
    let n = 0;
    // Rings outward, so a field clipped by MAX_COLUMNS loses its rim, never its heart.
    for (let ring = 0; ring <= N && n < MAX_COLUMNS; ring++) {
      for (let q = -ring; q <= ring && n < MAX_COLUMNS; q++) {
        for (let r = -ring; r <= ring && n < MAX_COLUMNS; r++) {
          const k = -q - r;
          if (Math.max(Math.abs(q), Math.abs(r), Math.abs(k)) !== ring) continue;
          hexCellCentre(q, r, s, _cell);
          const d = Math.hypot(_cell.x, _cell.z);
          if (d > limit) continue;
          const col = this.cols[n++];
          col.x = _centre.x + _cell.x;
          col.z = _centre.z + _cell.z;
          col.dist = d;
        }
      }
    }
    this._count = n;
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every second resolved from settings                        */
  /* ------------------------------------------------------------------ */

  _crackTime() {
    return Math.max(0.05, settings.basalt.crackTime * settings.global.lifetime);
  }

  _riseTime() {
    return Math.max(0.03, settings.basalt.riseTime);
  }

  /** Seconds after landing that this column starts to move. */
  _startOf(col, c, g) {
    const R = Math.max(0.5, c.zoneRadius);
    return (
      this._crackTime() * saturate(c.riseLead) +
      saturate(col.dist / R) * Math.max(0, c.rippleTime) * g.lifetime +
      col.dDice * Math.max(0, c.riseJitter) * g.randomness
    );
  }

  /** The latest any column can start. */
  _lastStart(c, g) {
    return this._crackTime() * saturate(c.riseLead) + Math.max(0, c.rippleTime) * g.lifetime + Math.max(0, c.riseJitter) * g.randomness;
  }

  get impactDuration() {
    const c = settings.basalt;
    const g = settings.global;
    return this._lastStart(c, g) + this._riseTime() + Math.max(0.05, c.lifetime * g.lifetime);
  }

  _sinkSpread() {
    return Math.max(0, settings.basalt.sinkSpread * settings.global.lifetime);
  }

  _sinkTime() {
    return Math.max(0.05, settings.basalt.sinkTime);
  }

  get fadeDuration() {
    const c = settings.basalt;
    return this._sinkSpread() + this._sinkTime() + Math.max(0.05, c.coolTime * settings.global.lifetime);
  }

  /** Magma gutters. */
  lightShimmer() {
    return 0.8 + 0.2 * Math.sin(this.age * 13.1) * Math.sin(this.age * 5.3 + 1.1);
  }

  /* ------------------------------------------------------------------ */
  /* Resolving a column                                                  */
  /* ------------------------------------------------------------------ */

  /** Full height of this column, metres. */
  _targetHeight(col, c, g) {
    const R = Math.max(0.5, c.zoneRadius);
    const profile = lerp(1, 1 - saturate(col.dist / R) * 0.85, saturate(c.heightFalloff));
    const roll = lerp(0.6, 0.4 + col.hDice * 0.6, saturate(g.randomness));
    let h = lerp(c.heightMin, c.heightMax, saturate(profile * roll));
    if (c.heightSteps > 0) {
      const step = Math.max(0.05, (c.heightMax - c.heightMin) / 4);
      h = lerp(h, Math.round(h / step) * step, saturate(c.heightSteps));
    }
    return Math.max(0.05, h);
  }

  /** 0..1 → 0..1 with an adjustable spring past the end (0 = outCubic). */
  _riseCurve(k, overshoot) {
    const c1 = Math.max(0, overshoot) * 2.6;
    const t = k - 1;
    return 1 + (c1 + 1) * t * t * t + c1 * t * t;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._clock = -1;
    this._seed = Math.random() * 100;
    this._firstWave = false;
    this._travelled = 0;
    this._open = 0;
    this._thrown.length = 0;
    this.emberEmitter.reset();
    this.travelEmitter.reset();

    for (let i = 0; i < MAX_COLUMNS; i++) {
      const col = this.cols[i];
      col.hDice = Math.random();
      col.dDice = Math.random();
      col.sDice = Math.random();
      const a = Math.random() * TAU;
      const t = Math.random();
      col.tiltX = Math.cos(a) * t;
      col.tiltZ = Math.sin(a) * t;
      col.seed = Math.random();
      col.broke = false;
      col.launched = false;
      col.sinking = false;
      col.h = 0;
    }
    this._layout(true);
    this._columnGeometry();
    this.stateAttr.array.fill(0);
    this.stateAttr.needsUpdate = true;
    for (let i = 0; i < MAX_COLUMNS; i++) this.columns.setMatrixAt(i, _zero);
    this.columns.instanceMatrix.needsUpdate = true;
    this.columns.count = 0;
    this.columns.visible = false;
    this.ground.visible = false;
    this.shimmer.visible = false;
  }

  _sync() {
    const c = settings.basalt;
    const g = settings.global;
    this.rockMaterial.userData.sync();

    syncSystem(this.chips, c.colorChipA, c.colorChipB, c.colorChipC, c.colorChipD, c.chipSize, 1, 0.05);
    this.chips.uniforms.uGravity.value.set(0, c.chipGravity, 0);
    syncSystem(this.dust, c.colorDustA, c.colorDustB, c.colorDustC, c.colorDustD, c.dustSize, 1, 0.5);
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    this.dust.uniforms.uGravity.value.set(0, 0.25, 0);
    syncSystem(this.embers, c.colorEmberA, c.colorEmberB, c.colorEmberC, c.colorEmberD, c.emberSize, c.emberGlow * g.glow, 0.6);
    this.embers.uniforms.uGravity.value.set(0, 0.6, 0);
    syncSystem(this.sparks, c.colorEmberA, c.colorEmberB, c.colorEmberC, c.colorEmberD, c.sparkSize, c.emberGlow * g.glow, 0.1);
    this.sparks.uniforms.uGravity.value.set(0, -9, 0);
    this.sparks.uniforms.uStretch.value = c.sparkStretch;
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Place every column, latch its events, write the floor. Runs on a
   * zero-length frame too, so the editor reshapes a paused field.
   */
  _updateField(dt) {
    const c = settings.basalt;
    const g = settings.global;
    this._layout();
    this._columnGeometry();

    const clock = this._clock;
    const fading = this.phase === AbilityPhase.FADE;
    const ft = fading ? this.fadeTime : 0;
    const riseT = this._riseTime();
    const sinkSpread = this._sinkSpread();
    const sinkT = this._sinkTime();
    const R = Math.max(0.5, c.zoneRadius);
    const s = Math.max(0.15, c.cellSize);
    const radius = Math.max(0.05, s - Math.max(0, c.columnGap) / SQRT3);
    const length = this._shaftLength(c);
    const tilt = c.tiltMax * g.randomness;
    const sinkK = fading ? saturate(ft / Math.max(0.05, sinkSpread + sinkT)) : 0;
    const state = this.stateAttr.array;

    let moving = 0;
    let sinkingNow = 0;
    let risen = 0;

    for (let i = 0; i < this._count; i++) {
      const col = this.cols[i];
      const target = this._targetHeight(col, c, g);
      const start = this._startOf(col, c, g);
      const k = clock < 0 ? 0 : saturate((clock - start) / riseT);
      let h = k > 0 ? target * this._riseCurve(k, c.overshoot) : 0;

      /* --- the events it latches --- */
      if (k > 0 && !col.broke) {
        col.broke = true;
        this._breakFx(col, c, g, target);
        if (!this._firstWave) {
          this._firstWave = true;
          this._waveFx(c, g);
        }
      }
      if (k >= saturate(c.launchAt) && !col.launched && clock >= 0) {
        col.launched = true;
        this._launch(col, c, g, target);
      }
      if (k > 0 && k < 1) moving++;

      /* --- sinking --- */
      let heat = 0;
      if (col.broke) {
        const since = clock - start;
        heat = lerp(1, saturate(c.holdHeat), saturate(since / Math.max(0.05, c.columnCool)));
      }
      if (fading) {
        const order = lerp(saturate(col.dist / R), col.sDice, saturate(c.sinkOrder * g.randomness));
        const sStart = order * sinkSpread;
        const k2 = saturate((ft - sStart) / sinkT);
        // A shudder in the moment before it lets go.
        const lead = ft - sStart;
        if (lead > -0.18 && k2 < 0.3) {
          h += c.sinkShudder * Math.sin(frame.uTime.value * 61 + col.seed * 40) * (1 - k2 / 0.3);
        }
        if (k2 > 0 && !col.sinking) {
          col.sinking = true;
          if (h > 0.05) this._sinkFx(col, c, g);
        }
        if (k2 > 0 && k2 < 1) sinkingNow++;
        h *= 1 - Easing.inCubic(k2);
        heat *= 1 - sinkK * 0.85;
      }
      col.h = h;
      if (target > 0) risen += saturate(h / target);

      /* --- the instance --- */
      const k4 = i * 4;
      if (h <= 0.002) {
        this.columns.setMatrixAt(i, _zero);
        state[k4 + 3] = 0;
        continue;
      }
      _euler.set(col.tiltX * tilt, 0, col.tiltZ * tilt);
      _q.setFromEuler(_euler);
      // The top sits a hair under the floor at h = 0, so nothing z-fights.
      _pos.set(col.x, h - 0.015, col.z);
      _scale.set(radius, length, radius);
      _m.compose(_pos, _q, _scale);
      this.columns.setMatrixAt(i, _m);
      state[k4] = col.seed;
      state[k4 + 1] = heat;
      state[k4 + 2] = h;
      state[k4 + 3] = clock >= start ? Math.exp(-(clock - start) * 6) : 0;
    }
    for (let i = this._count; i < MAX_COLUMNS; i++) this.columns.setMatrixAt(i, _zero);

    this.columns.count = this._count;
    this.columns.instanceMatrix.needsUpdate = true;
    this.stateAttr.needsUpdate = true;
    this.columns.visible = this._count > 0 && clock >= 0;
    this._open = this._count > 0 ? risen / this._count : 0;

    /* --- the floor --- */
    const crack = clock < 0 ? 0 : Easing.outCubic(saturate(clock / this._crackTime()));
    let groundHeat = 1;
    let erode = 0;
    if (fading) {
      const fd = this.fadeDuration;
      groundHeat = 1 - smoothstep(0, fd * 0.9, ft);
      const gf = Math.max(0.05, c.groundFade * g.lifetime);
      erode = saturate((ft - (fd - gf)) / gf);
    }
    this.pointAt(1, _centre);
    _groundState.centre.copy(_centre);
    _groundState.radius = R;
    _groundState.cell = s;
    _groundState.seed = this._seed;
    _groundState.front = crack * (R + c.scorchMargin + 0.6);
    _groundState.open = saturate(this._open * c.seamOpen);
    _groundState.heat = groundHeat;
    _groundState.erode = erode;
    this.groundMaterial.userData.sync(_groundState);
    this.ground.visible = clock >= 0;

    /* --- the shimmer --- */
    _shimmerState.strength = groundHeat * crack * (0.35 + 0.65 * this._open);
    _shimmerState.seed = this._seed;
    this.shimmerMaterial.userData.sync(_shimmerState);
    this.shimmer.position.set(_centre.x, 0, _centre.z);
    this.shimmer.scale.set(R, Math.max(0.1, c.shimmerHeight), R);
    this.shimmer.visible = clock >= 0 && _shimmerState.strength > 0.002;

    /* --- the rumble --- */
    const share = this._count > 0 ? moving / this._count : 0;
    const sinkShare = this._count > 0 ? sinkingNow / this._count : 0;
    let rumble = 0;
    if (clock >= 0 && !fading && clock < this._crackTime()) rumble += c.crackRumble;
    rumble += c.riseRumble * Math.min(1, share * 4);
    rumble += c.sinkRumble * Math.min(1, sinkShare * 3);
    if (rumble > 0 && dt > 0) this.ctx.shake.rumble(rumble, dt);

    /* --- embers off the open seams --- */
    if (clock >= 0) this._emberFx(dt, c, g, groundHeat * (1 - erode), crack);
  }

  /* ------------------------------------------------------------------ */
  /* The bodies                                                          */
  /* ------------------------------------------------------------------ */

  _launch(col, c, g, target) {
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    const s = Math.max(0.15, c.cellSize);
    const reach = s * Math.max(0.05, c.hitRadius);
    const power = g.explosionIntensity;
    const lift = (c.liftBase + c.liftPerMetre * target) * power;
    this.pointAt(1, _centre);

    const found = field.findBodies(col.x, col.z, reach, this._targets);
    for (let f = 0; f < found.length; f++) {
      const dummy = found[f];
      // Thrown a little outward from the middle, so a body off the tallest
      // column does not come straight back down on it.
      _dir.set(dummy.position.x - _centre.x, 0, dummy.position.z - _centre.z);
      if (_dir.lengthSq() < 1e-6) {
        const a = col.seed * TAU;
        _dir.set(Math.cos(a), 0, Math.sin(a));
      }
      _dir.normalize();

      if (dummy.alive) {
        this._force.impulse = c.hitImpulse * power;
        this._force.lift = lift;
        this._force.spin = c.hitSpin;
        if (dummy.kill(_dir.x, _dir.z, this._force)) this._remember(dummy);
      } else if (!this._wasThrown(dummy) && dummy.bodyPoint(_pos)) {
        const up = lift * c.corpseLift;
        dummy.shove(_dir.x * c.hitImpulse * power, up, _dir.z * c.hitImpulse * power);
        this._remember(dummy);
      }
    }
    this._targets.length = 0;
  }

  _remember(dummy) {
    if (this._thrown.length < MAX_THROWN) this._thrown.push(dummy);
  }

  _wasThrown(dummy) {
    for (let i = 0; i < this._thrown.length; i++) if (this._thrown[i] === dummy) return true;
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  _base(col, y) {
    return _pos.set(col.x, y, col.z);
  }

  /** One column breaking the floor: chips and sparks up off its rim, a puff of dust. */
  _breakFx(col, c, g, target) {
    const time = frame.uTime.value;
    const s = Math.max(0.15, c.cellSize);
    const n = g.particleCount;

    _emit.position = this._base(col, 0.08);
    _emit.radius = s * 0.8;
    _emit.direction = _up;
    _emit.speed = c.chipSpeed * (0.7 + 0.3 * Math.min(1, target / Math.max(0.1, c.heightMax)));
    _emit.speedVariance = 0.5;
    _emit.spread = 0.85;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.7;
    _emit.life = c.chipLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 9;
    _emit.tint = null;
    _emit.time = time;
    this.chips.emit(Math.round(c.chipCount * n), _emit);

    _emit.speed = c.sparkSpeed;
    _emit.spread = 0.7;
    _emit.size = 0.08;
    _emit.life = c.sparkLifetime;
    _emit.spin = 0;
    this.sparks.emit(Math.round(c.sparkCount * n), _emit);

    _emit.position = this._base(col, 0.25);
    _emit.radius = s * 0.6;
    _emit.speed = c.dustSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 1;
    _emit.size = 0.5;
    _emit.sizeVariance = 0.5;
    _emit.life = c.dustLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0.6;
    this.dust.emit(Math.round(c.dustCount * n), _emit);
  }

  /** One column letting go: dust rolling off its foot. */
  _sinkFx(col, c, g) {
    const s = Math.max(0.15, c.cellSize);
    _emit.position = this._base(col, 0.2);
    _emit.radius = s * 0.7;
    _emit.direction = _up;
    _emit.speed = c.dustSpeed * 0.6;
    _emit.speedVariance = 0.5;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.55;
    _emit.sizeVariance = 0.5;
    _emit.life = c.dustLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0.5;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.dust.emit(Math.round(c.sinkDust * g.particleCount), _emit);

    _emit.speed = c.chipSpeed * 0.3;
    _emit.size = 0.07;
    _emit.life = c.chipLifetime * 0.6;
    _emit.spin = 6;
    this.chips.emit(Math.round(c.chipCount * 0.4 * g.particleCount), _emit);
  }

  /** The first wave: the jolt, the flash, the burst, the rings. */
  _waveFx(c, g) {
    const power = g.explosionIntensity;
    this.pointAt(1, _centre);
    this.ctx.shake.add(c.riseShake * power, 3.2, 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.impactLight * power;
    this.ctx.bursts.spawn(BurstMode.EARTH, _pos.copy(_centre).setY(0.4), {
      radius: 0.3,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1.6,
      opacity: 0.85 * g.opacity,
      squash: 0.45,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.shockRadius * power,
      life: c.shockLife,
      width: 0.06,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: c.dustRingRadius,
      life: c.dustRingLife,
      intensity: 0.9,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustC),
      growth: 0.35,
      height: 0.025
    });
  }

  /** Embers lifting off the open seams — a random hex corner of a random cell. */
  _emberFx(dt, c, g, heat, crack) {
    if (this._count === 0) return;
    const rate = c.emberRate * heat * crack * (0.3 + this._open);
    const count = Math.round(this.emberEmitter.tick(dt, rate) * g.particleCount);
    if (count <= 0) return;
    const s = Math.max(0.15, c.cellSize);
    _emit.radius = 0.05;
    _emit.direction = _up;
    _emit.speed = c.emberRise;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.35;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.08;
    _emit.sizeVariance = 0.6;
    _emit.life = c.emberLifetime;
    _emit.lifeVariance = 0.5;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    for (let k = 0; k < count; k++) {
      const col = this.cols[(Math.random() * this._count) | 0];
      const a = ((Math.random() * 6) | 0) * (Math.PI / 3);
      _pos.set(col.x + Math.cos(a) * s, 0.06, col.z + Math.sin(a) * s);
      _emit.position = _pos;
      this.embers.emit(1, _emit);
    }
  }

  /** The fissure running to the circle: cracks dropped behind the front, embers off it. */
  _travelFx(dt) {
    const c = settings.basalt;
    const g = settings.global;
    const spacing = Math.max(0.2, c.travelCrackSpacing);
    while (this.front - this._travelled >= spacing) {
      this._travelled += spacing;
      this.pointAt(saturate(this._travelled / this.length), _pos);
      this.ctx.decals.spawn(DecalType.CRACK, _pos, {
        radius: c.travelCrackRadius,
        life: c.travelCrackLife * g.lifetime,
        intensity: 1,
        colorA: getColor(c.colorHotB),
        colorB: getColor(c.colorHotA),
        width: 0.1,
        height: 0.02
      });
    }
    const count = Math.round(this.travelEmitter.tick(dt, c.travelEmbers) * g.particleCount);
    if (count > 0) {
      _emit.position = _pos.copy(this.position).setY(0.08);
      _emit.radius = 0.25;
      _emit.direction = _up;
      _emit.speed = c.emberRise * 1.2;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.5;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.08;
      _emit.sizeVariance = 0.6;
      _emit.life = c.emberLifetime * 0.7;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      // The fissure sheds the accent pair.
      _emit.tint = getColor(Math.random() < 0.5 ? c.colorA : c.colorB);
      _emit.time = frame.uTime.value;
      this.embers.emit(count, _emit);
      _emit.tint = null;
      _emit.speed = c.chipSpeed * 0.35;
      _emit.size = 0.06;
      _emit.life = c.chipLifetime * 0.5;
      _emit.spin = 6;
      this.chips.emit(Math.max(1, Math.round(count * 0.15)), _emit);
    }
    this.ctx.shake.rumble(c.travelRumble, dt);
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._clock = -1;
    this._sync();
    this._travelFx(dt);
    this._updateField(dt);
    this.position.y = 0.4;
  }

  onImpact() {
    const c = settings.basalt;
    const g = settings.global;
    this._clock = 0;
    this.pointAt(1, _centre);
    // The fissure arrives: a small jolt and a crack at the heart.
    this.ctx.shake.add(c.riseShake * 0.35 * g.explosionIntensity, 5, 20);
    this.ctx.decals.spawn(DecalType.CRACK, _centre, {
      radius: Math.max(0.5, c.zoneRadius * 0.6),
      life: (this.impactDuration + this.fadeDuration) * 0.8,
      intensity: 1,
      colorA: getColor(c.colorHotB),
      colorB: getColor(c.colorHotA),
      width: 0.12,
      height: 0.02
    });
    this.lightBoost = c.lightIntensity * 0.4;
  }

  onFade(dt) {
    const c = settings.basalt;
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;
    this._sync();
    this._updateField(dt);
    this.pointAt(1, _centre);
    this.position.set(_centre.x, c.lightHeight * (0.5 + 0.5 * this._open), _centre.z);
  }

  onDestroy() {
    this._clock = -1;
    this._count = 0;
    this._thrown.length = 0;
    this.columns.count = 0;
    this.columns.visible = false;
    this.ground.visible = false;
    this.shimmer.visible = false;
  }

  dispose() {
    this.columnGeometry?.dispose();
    this.groundGeometry.dispose();
    this.shimmerGeometry.dispose();
    this.rockMaterial.dispose();
    this.groundMaterial.dispose();
    this.shimmerMaterial.dispose();
    this.columns.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⬢  Basalt Columns');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'fissure speed (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  cast.addColor(c, 'colorA').name('accent');
  cast.addColor(c, 'colorB').name('accent, hot');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'crackTime', 0.05, 3, 0.01, 'floor cracks over');
  R(time, c, 'riseLead', 0, 1, 0.01, 'first column after (× crack)');
  R(time, c, 'rippleTime', 0, 3, 0.01, 'ripple to the rim over');
  R(time, c, 'riseTime', 0.03, 1.5, 0.01, 'one column rises over');
  R(time, c, 'riseJitter', 0, 1, 0.01, 'rise jitter (s)');
  R(time, c, 'overshoot', 0, 1, 0.01, 'overshoot');
  R(time, c, 'lifetime', 0.05, 8, 0.05, 'stands for');
  R(time, c, 'sinkSpread', 0, 3, 0.01, 'sinking spread over');
  R(time, c, 'sinkOrder', 0, 1, 0.01, 'ripple ↔ random sink');
  R(time, c, 'sinkTime', 0.05, 3, 0.01, 'one column sinks over');
  R(time, c, 'sinkShudder', 0, 0.3, 0.005, 'shudder before sinking (m)');
  R(time, c, 'coolTime', 0.05, 4, 0.05, 'seams cool over');

  const cols = folder.addFolder('1 · Columns');
  R(cols, c, 'cellSize', 0.2, 1.5, 0.01, 'hex size (m)');
  R(cols, c, 'columnGap', 0, 0.3, 0.005, 'gap (m)');
  R(cols, c, 'rimMargin', 0, 2, 0.01, 'rim margin (× hex)');
  R(cols, c, 'heightMin', 0.05, 6, 0.05, 'shortest (m)');
  R(cols, c, 'heightMax', 0.1, 8, 0.05, 'tallest (m)');
  R(cols, c, 'heightFalloff', 0, 1, 0.01, 'taller in the middle');
  R(cols, c, 'heightSteps', 0, 1, 0.01, 'terraced heights');
  R(cols, c, 'tiltMax', 0, 0.4, 0.005, 'lean (rad)');
  R(cols, c, 'columnDepth', 0.1, 4, 0.05, 'shaft below floor (m)');
  R(cols, c, 'topBevel', 0, 0.45, 0.005, 'chamfer inset');
  R(cols, c, 'bevelDrop', 0.005, 0.4, 0.005, 'chamfer drop (m)');

  const rock = cols.addFolder('Rock');
  rock.addColor(c, 'colorRock').name('rock');
  rock.addColor(c, 'colorRockLight').name('rock, pale');
  rock.addColor(c, 'colorStrata').name('strata');
  R(rock, c, 'strataScale', 0, 10, 0.05, 'beds / m');
  R(rock, c, 'strataWarp', 0, 2, 0.01, 'bed wander');
  R(rock, c, 'strataContrast', 0, 1, 0.01, 'bed contrast');
  R(rock, c, 'rockNoise', 0.1, 8, 0.05, 'rock features / m');
  R(rock, c, 'rockBump', 0, 2, 0.01, 'bump');
  R(rock, c, 'rockDiffuse', 0, 2, 0.01, 'diffuse');
  R(rock, c, 'rockAmbient', 0, 1, 0.01, 'ambient');
  R(rock, c, 'rockSpecular', 0, 3, 0.01, 'specular');
  R(rock, c, 'rockGloss', 2, 200, 1, 'gloss');
  R(rock, c, 'rockEnv', 0, 2, 0.01, 'sky sheen');
  R(rock, c, 'edgeWear', 0, 1, 0.01, 'edge wear');
  R(rock, c, 'capCracks', 0, 1, 0.01, 'cap fractures');
  R(rock, c, 'capCrackScale', 0.5, 8, 0.05, 'cap fracture scale');

  const heat = cols.addFolder('Heat');
  heat.addColor(c, 'colorHotA').name('white-hot');
  heat.addColor(c, 'colorHotB').name('orange');
  heat.addColor(c, 'colorHotC').name('deep red');
  heat.addColor(c, 'colorCold').name('cold');
  R(heat, c, 'undersideGlow', 0, 12, 0.05, 'underside glow');
  R(heat, c, 'undersideHeight', 0.02, 3, 0.01, 'glow reach (m)');
  R(heat, c, 'emberSpeckle', 0, 3, 0.01, 'hot pinholes');
  R(heat, c, 'glowPulse', 0, 1, 0.01, 'throb');
  R(heat, c, 'punchGlow', 0, 8, 0.05, 'break-out flash');
  R(heat, c, 'columnCool', 0.05, 5, 0.05, 'cools over (s)');
  R(heat, c, 'holdHeat', 0, 1, 0.01, 'heat while standing');

  const floor = folder.addFolder('2 · Honeycomb floor');
  floor.addColor(c, 'colorPlate').name('plates');
  R(floor, c, 'groundDark', 0, 1, 0.01, 'plate darkness');
  R(floor, c, 'seamWidth', 0.005, 0.3, 0.005, 'seam width (m)');
  R(floor, c, 'seamSoftness', 0.005, 0.5, 0.005, 'seam bloom (m)');
  R(floor, c, 'seamGlow', 0, 12, 0.05, 'seam glow');
  R(floor, c, 'seamFlicker', 0, 1, 0.01, 'seam flicker');
  R(floor, c, 'seamOpen', 0, 2, 0.01, 'seams gape when risen');
  R(floor, c, 'fineCracks', 0, 1, 0.01, 'fine fractures');
  R(floor, c, 'fineCrackScale', 0.2, 8, 0.05, 'fine fracture scale');
  R(floor, c, 'frontSoftness', 0.05, 2, 0.01, 'crack front softness (m)');
  R(floor, c, 'frontNoise', 0, 2, 0.01, 'crack front wander (m)');
  R(floor, c, 'rimRagged', 0, 2, 0.01, 'rim wander (m)');
  R(floor, c, 'rimSoftness', 0.02, 2, 0.01, 'rim softness (m)');
  R(floor, c, 'scorchMargin', 0, 3, 0.05, 'scorched margin (m)');
  R(floor, c, 'groundFade', 0.05, 3, 0.05, 'erodes over (s)');
  const warp = floor.addFolder('Heat shimmer');
  R(warp, c, 'heatShimmer', 0, 3, 0.01, 'strength');
  R(warp, c, 'shimmerHeight', 0.1, 8, 0.05, 'height (m)');
  R(warp, c, 'shimmerScale', 0.1, 6, 0.05, 'scale');
  R(warp, c, 'shimmerSpeed', 0, 6, 0.05, 'speed');

  const hit = folder.addFolder('3 · Bodies');
  R(hit, c, 'hitRadius', 0.1, 2, 0.01, 'standing on (× hex)');
  R(hit, c, 'launchAt', 0, 1, 0.01, 'thrown at rise fraction');
  R(hit, c, 'liftBase', 0, 25, 0.1, 'lift (m/s)');
  R(hit, c, 'liftPerMetre', 0, 10, 0.05, 'lift per metre of column');
  R(hit, c, 'hitImpulse', 0, 15, 0.1, 'outward impulse');
  R(hit, c, 'hitSpin', 0, 6, 0.05, 'spin');
  R(hit, c, 'corpseLift', 0, 2, 0.01, 'corpse lift (×)');

  const debris = folder.addFolder('4 · Debris');
  R(debris, c, 'chipCount', 0, 30, 1, 'chips per column');
  R(debris, c, 'chipSpeed', 0, 20, 0.1, 'chip speed');
  R(debris, c, 'chipSize', 0.01, 0.4, 0.005, 'chip size');
  R(debris, c, 'chipLifetime', 0.1, 4, 0.05, 'chip lifetime');
  R(debris, c, 'chipGravity', -30, 0, 0.5, 'chip gravity');
  Editor.gradient(debris, c, 'colorChip', 'chip colour');
  R(debris, c, 'dustCount', 0, 12, 1, 'dust per column');
  R(debris, c, 'sinkDust', 0, 12, 1, 'dust per sinking column');
  R(debris, c, 'dustSize', 0.05, 3, 0.05, 'dust size');
  R(debris, c, 'dustSpeed', 0, 6, 0.05, 'dust speed');
  R(debris, c, 'dustLifetime', 0.1, 5, 0.05, 'dust lifetime');
  R(debris, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(debris, c, 'colorDust', 'dust colour');
  R(debris, c, 'emberRate', 0, 400, 1, 'embers / s');
  R(debris, c, 'emberSize', 0.005, 0.3, 0.005, 'ember size');
  R(debris, c, 'emberRise', 0, 8, 0.05, 'ember rise (m/s)');
  R(debris, c, 'emberLifetime', 0.1, 4, 0.05, 'ember lifetime');
  R(debris, c, 'emberGlow', 0, 8, 0.05, 'ember glow');
  Editor.gradient(debris, c, 'colorEmber', 'ember colour');
  R(debris, c, 'sparkCount', 0, 20, 1, 'sparks per column');
  R(debris, c, 'sparkSpeed', 0, 25, 0.1, 'spark speed');
  R(debris, c, 'sparkSize', 0.005, 0.3, 0.005, 'spark size');
  R(debris, c, 'sparkLifetime', 0.05, 2, 0.01, 'spark lifetime');
  R(debris, c, 'sparkStretch', 0, 2, 0.01, 'spark stretch');

  const beat = folder.addFolder('5 · The beat');
  R(beat, c, 'crackRumble', 0, 1, 0.01, 'crack rumble');
  R(beat, c, 'riseShake', 0, 1, 0.01, 'first wave jolt');
  R(beat, c, 'riseRumble', 0, 1, 0.01, 'rise rumble');
  R(beat, c, 'sinkRumble', 0, 1, 0.01, 'sink rumble');
  R(beat, c, 'impactFlash', 0, 1, 0.01, 'flash');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'burstRadius', 0, 8, 0.05, 'earth burst (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'burst life');
  beat.addColor(c, 'colorBurstA').name('burst, hot');
  beat.addColor(c, 'colorBurstB').name('burst, body');
  beat.addColor(c, 'colorBurstC').name('burst, dark');
  R(beat, c, 'shockRadius', 0, 15, 0.05, 'shock ring (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'shock life');
  beat.addColor(c, 'colorShockA').name('shock ring');
  beat.addColor(c, 'colorShockB').name('shock ring, hot');
  R(beat, c, 'dustRingRadius', 0, 15, 0.05, 'dust ring (m)');
  R(beat, c, 'dustRingLife', 0.1, 5, 0.05, 'dust ring life');
  const travel = beat.addFolder('Fissure (travel)');
  R(travel, c, 'travelCrackSpacing', 0.2, 5, 0.05, 'crack spacing (m)');
  R(travel, c, 'travelCrackRadius', 0.1, 4, 0.05, 'crack radius (m)');
  R(travel, c, 'travelCrackLife', 0.1, 5, 0.05, 'crack life');
  R(travel, c, 'travelEmbers', 0, 500, 1, 'embers / s');
  R(travel, c, 'travelRumble', 0, 1, 0.01, 'rumble');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0.1, 6, 0.05, 'height (m)');
  R(light, c, 'impactLight', 0, 60, 0.5, 'light punch');
}
