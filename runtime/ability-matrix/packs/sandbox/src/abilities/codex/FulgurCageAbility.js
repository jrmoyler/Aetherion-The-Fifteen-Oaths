import {
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { BoltBatch, createFulguriteGeometry, createKnotGeometry } from '../../assets/codex/FulgurCageGeometry.js';
import {
  createBoltMaterial,
  createFulguriteMaterial,
  createKnotMaterial,
  createCageFloorMaterial,
  createIonWarpMaterial
} from '../../materials/codex/FulgurCageMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'fulgur';

/** Bars in the cage. The editor's slider clamps to this. */
const MAX_BARS = 16;
/** Glass tubes per bar foot. */
const GLASS_EACH = 4;
const MAX_GLASS = MAX_BARS * GLASS_EACH;
/** Ribbons one frame can draw: bars, branches, three link rings, arcs, the crawl. */
const MAX_BOLTS = 160;
const BOLT_SEGMENTS = 22;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _centre = new Vector3();
const _eye = new Vector3();
const _knot = new Vector3();
const _up = new Vector3(0, 1, 0);
const _scale = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);

const _knotState = { pos: new Vector3(), size: 1, intensity: 0, seed: 0 };
const _floorState = { centre: new Vector3(), radius: 4, bars: 10, phase: 0, ring: 0, spokes: 0, star: 0, heat: 1, seed: 0, erode: 0 };
const _warpState = { strength: 0 };

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
 * FULGUR CAGE — Lightning, zone cast.
 *
 * Static crawls along the floor to the circle, skittering. Then **bars of
 * lightning drop out of the sky**, one after another round the rim — each a
 * leader racing down from sixteen metres, a white return stroke the instant
 * it grounds, sparks, a scorch and a burst of **fulgurite**: tubes of fused
 * glass punching up out of the floor at its foot, molten inside. The bars do
 * not go out. They **stand**, crackling and re-forking many times a second,
 * and rings of crackle jump between them at knee and head height until the
 * circle is **a cage**. The air inside judders; motes of charge rise. Then
 * the cage **arcs inward**: one by one each bar throws a bolt sideways into
 * whatever is standing inside — the body is struck, charred and thrown —
 * and every bar with nothing to strike throws its arc into the middle,
 * where the arcs **knot into a churning ball of plasma** that swells until
 * it **bursts**: a shell of storm, a shockwave, a white flash, everything
 * left standing in the circle thrown out. The bars gutter out one at a
 * time; the fulgurites cool from white-orange to a blue charge to black
 * glass; the floor is left a sooty ring with burn spokes and a starburst.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **lightning** — every bar, branch, link ring, arc and the travel
 *      crawl drawn as camera-facing ribbons by one `BoltBatch` (one dynamic
 *      buffer, one draw), shaded by `createBoltMaterial`: core, body, halo,
 *      crawling brightness. Each bolt's shape is re-rolled whenever its seed
 *      ticks at its own flicker rate.
 *   2. **the knot** — a billboarded plasma ball fed by the arcs.
 *   3. **fulgurites** — an InstancedMesh of lathed glass tubes in
 *      `createFulguriteMaterial` (opaque, `LAYER.WORLD`), fused up at each
 *      foot as its bar strikes, cooling through the cast.
 *   4. **the scorched floor** — conductive ring, hot feet, burn spokes,
 *      starburst; and ionised air on `LAYER.DISTORTION`.
 *   5. **sparks, motes, smoke** — STREAK sparks at every strike and arc hit,
 *      SOFT motes rising in the cage, dark SMOKE off each foot.
 *   6. **the beat** — a knock, a flash, a light punch and a scorch decal per
 *      strike; a STORM burst, SHOCKWAVE and heavy knock at the burst; the
 *      light itself stutters.
 *
 * ## The bodies
 *
 * `handlesOwnHits`. When the arcs begin, every standing body in the circle
 * is assigned to the nearest bar with no target; that bar's arc strikes it
 * (`bodyPoint`, tracked as it moves) — charred (`corrode`) and killed,
 * thrown away from the bar. The burst kills whatever is still standing,
 * thrown out from the middle.
 *
 * ## The editor rule
 *
 * Bar records hold dice and latched events (struck, arced). Positions,
 * heights, widths, timing and colours are resolved from `settings.fulgur`
 * every frame.
 */
export class FulgurCageAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this.batch.count;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: lightning ---- */
    this.batch = new BoltBatch(MAX_BOLTS, BOLT_SEGMENTS);
    this.boltMaterial = createBoltMaterial();
    this.bolts = new Mesh(this.batch.geometry, this.boltMaterial);
    this.bolts.name = 'FulgurBolts';
    this.bolts.frustumCulled = false;
    this.bolts.renderOrder = 7;
    this.bolts.visible = false;
    this.group.add(this.bolts);

    /* ---- layer 2: the knot ---- */
    this.knotGeometry = createKnotGeometry();
    this.knotMaterial = createKnotMaterial();
    this.knot = new Mesh(this.knotGeometry, this.knotMaterial);
    this.knot.name = 'FulgurKnot';
    this.knot.frustumCulled = false;
    this.knot.renderOrder = 8;
    this.knot.visible = false;
    this.group.add(this.knot);

    /* ---- layer 3: fulgurites ---- */
    this.glassGeometry = createFulguriteGeometry();
    this.glassState = new InstancedBufferAttribute(new Float32Array(MAX_GLASS * 2), 2);
    this.glassState.setUsage(DynamicDrawUsage);
    this.glassGeometry.setAttribute('aState', this.glassState);
    this.glassMaterial = createFulguriteMaterial();
    this.glass = new InstancedMesh(this.glassGeometry, this.glassMaterial, MAX_GLASS);
    this.glass.name = 'FulgurGlass';
    this.glass.instanceMatrix.setUsage(DynamicDrawUsage);
    this.glass.layers.set(LAYER.WORLD);
    this.glass.castShadow = true;
    this.glass.frustumCulled = false;
    this.glass.count = MAX_GLASS;
    this.glass.visible = false;
    this.group.add(this.glass);
    this.glassDice = new Float32Array(MAX_GLASS * 5); // bearing, distance, lean, height, seed

    /* ---- layer 4: the floor, ionised air ---- */
    this.floorGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.floorMaterial = createCageFloorMaterial();
    this.floor = new Mesh(this.floorGeometry, this.floorMaterial);
    this.floor.name = 'FulgurFloor';
    this.floor.frustumCulled = false;
    this.floor.renderOrder = 2;
    this.floor.visible = false;
    this.group.add(this.floor);

    this.warpGeometry = new CylinderGeometry(1, 1, 1, 48, 1, true);
    this.warpGeometry.translate(0, 0.5, 0);
    this.warpMaterial = createIonWarpMaterial();
    this.warp = new Mesh(this.warpGeometry, this.warpMaterial);
    this.warp.name = 'FulgurIonAir';
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.warp.visible = false;
    this.group.add(this.warp);

    /** Dice and latches only. */
    this.bars = [];
    for (let i = 0; i < MAX_BARS; i++) {
      this.bars.push({
        jitter: 0, // bearing jitter
        order: 0, // 0..1 when it strikes in the drop
        lean: 0, // the sky end's lateral wander
        leanA: 0,
        seed: 0,
        out: 0, // 0..1 when it gutters out
        struck: false,
        struckAt: 0,
        arced: false,
        arcAt: 0,
        target: null
      });
    }
    this._order = new Float32Array(MAX_BARS);
    this._seed = 0;
    this._phase0 = 0;
    this._travelled = 0;
    this._burst = false;
    this._burstAt = 0;
    this._assigned = false;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0.05 };
    this._crawlTick = 0;
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.sparks = particles.get('fulgur.spark', { capacity: 2400, shape: ParticleShape.STREAK, additive: true, stretch: true, softFade: 0.2 });
    this.sparks.uniforms.uDrag.value = 2.4;
    this.sparks.uniforms.uEndSize.value = 0.2;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.01;
    this.sparks.uniforms.uFadeOut.value = 0.6;

    this.motes = particles.get('fulgur.mote', { capacity: 1200, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.2 });
    this.motes.uniforms.uDrag.value = 1.0;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uSizeIn.value = 0.1;
    this.motes.uniforms.uFadeIn.value = 0.15;
    this.motes.uniforms.uFadeOut.value = 0.4;

    this.smoke = particles.get('fulgur.smoke', { capacity: 900, shape: ParticleShape.SMOKE, additive: false, curl: true, softFade: 0.6 });
    this.smoke.uniforms.uDrag.value = 1.4;
    this.smoke.uniforms.uEndSize.value = 2.4;
    this.smoke.uniforms.uSizeIn.value = 0.1;
    this.smoke.uniforms.uFadeIn.value = 0.08;
    this.smoke.uniforms.uFadeOut.value = 0.6;

    this.moteEmitter = new RateEmitter();
    this.crawlEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _T(x) {
    return Math.max(0.03, x * settings.global.lifetime);
  }

  _arcStart() {
    const c = settings[ID];
    return this._T(c.dropTime) + Math.max(0.02, c.strikeTime) + this._T(c.cageTime);
  }

  _burstTime() {
    const c = settings[ID];
    return this._arcStart() + this._T(c.arcTime) + this._T(c.knotTime);
  }

  get impactDuration() {
    return this._burstTime() + 0.15;
  }

  get fadeDuration() {
    return this._T(settings[ID].lifetime);
  }

  /** Lightning stutters. */
  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f + f * (0.5 + 0.5 * Math.sin(this.age * 91.0) * Math.sin(this.age * 37.0 + 1.3));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    // Bar 0 stands at the point of the rim nearest the caster.
    this._phase0 = Math.atan2(-this.direction.z, -this.direction.x);
    this._travelled = 0;
    this._burst = false;
    this._burstAt = 0;
    this._assigned = false;
    this._found.length = 0;
    this._crawlTick = 0;
    this.moteEmitter.reset();
    this.crawlEmitter.reset();
    // Strike order: a shuffle, so the bars drop all round the ring at once.
    for (let i = 0; i < MAX_BARS; i++) this._order[i] = i;
    for (let i = MAX_BARS - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = this._order[i];
      this._order[i] = this._order[j];
      this._order[j] = tmp;
    }
    for (let i = 0; i < MAX_BARS; i++) {
      const b = this.bars[i];
      b.jitter = Math.random() - 0.5;
      b.order = this._order[i] / MAX_BARS;
      b.lean = Math.random();
      b.leanA = Math.random() * TAU;
      b.seed = Math.random() * 50;
      b.out = Math.random();
      b.struck = false;
      b.struckAt = 0;
      b.arced = false;
      b.arcAt = 0;
      b.target = null;
    }
    for (let i = 0; i < MAX_GLASS * 5; i++) this.glassDice[i] = Math.random();
    for (let i = 0; i < MAX_GLASS; i++) this.glass.setMatrixAt(i, _zero);
    this.glass.instanceMatrix.needsUpdate = true;
    this.glassState.array.fill(0);
    this.glassState.needsUpdate = true;
    this.glass.visible = false;
    this.knot.visible = false;
    this.floor.visible = false;
    this.warp.visible = false;
    this.bolts.visible = false;
    this.batch.begin();
    this.batch.end();
  }

  _sync() {
    const c = settings[ID];
    const g = settings.global;
    this.boltMaterial.userData.sync();
    this.glassMaterial.userData.sync();
    syncSystem(this.sparks, c.colorSparkA, c.colorSparkB, c.colorSparkC, c.colorSparkD, c.sparkSize, 2.5 * g.glow, 0.1);
    this.sparks.uniforms.uGravity.value.set(0, -9, 0);
    this.sparks.uniforms.uStretch.value = c.sparkStretch;
    syncSystem(this.motes, c.colorSparkA, c.colorSparkB, c.colorSparkC, c.colorSparkD, c.moteSize, 2 * g.glow, 0.8);
    this.motes.uniforms.uGravity.value.set(0, 1.2, 0);
    syncSystem(this.smoke, c.colorSmokeA, c.colorSmokeB, c.colorSmokeC, c.colorSmokeD, c.smokeSize, 1, 0.5);
    this.smoke.uniforms.uOpacity.value = c.smokeOpacity * g.opacity;
    this.smoke.uniforms.uGravity.value.set(0, 0.5, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Resolving                                                           */
  /* ------------------------------------------------------------------ */

  _barCount() {
    return Math.min(MAX_BARS, Math.max(3, Math.round(settings[ID].barCount)));
  }

  /** The foot of bar i on the floor. */
  _foot(i, n, out) {
    const c = settings[ID];
    const R = Math.max(0.5, c.zoneRadius);
    const a = this._phase0 + (i / n) * TAU + this.bars[i].jitter * (TAU / n) * 0.3 * settings.global.randomness;
    return out.set(_centre.x + Math.cos(a) * R, 0, _centre.z + Math.sin(a) * R);
  }

  /** A seed that ticks `rate` times a second — a new shape each tick. */
  _tick(seed, rate) {
    return seed + Math.floor(this.age * rate * settings.global.animationSpeed + seed * 7.0) * 1.618;
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _update(dt) {
    const c = settings[ID];
    const g = settings.global;
    const fading = this.phase === AbilityPhase.FADE;
    const t = fading ? this.impactDuration + this.fadeTime : this.impactTime;
    const kf = fading ? saturate(this.fadeTime / this.fadeDuration) : 0;
    const R = Math.max(0.5, c.zoneRadius);
    const n = this._barCount();
    this.pointAt(1, _centre);
    this.ctx.camera.getWorldPosition(_eye);

    const dropT = this._T(c.dropTime);
    const strikeT = Math.max(0.02, c.strikeTime);
    const cageStart = dropT + strikeT;
    const arcStart = this._arcStart();
    const arcT = this._T(c.arcTime);
    const burstAt = this._burstTime();

    if (t >= arcStart && !this._assigned) {
      this._assigned = true;
      this._assign(n);
    }

    this.batch.begin();
    let struck = 0;
    let arcsIn = 0;

    for (let i = 0; i < n; i++) {
      const bar = this.bars[i];
      const start = bar.order * dropT;
      const reach = saturate((t - start) / strikeT);
      if (reach <= 0) continue;
      this._foot(i, n, _b);
      // The sky end wanders a little, so the bars are not ruled lines.
      const lean = bar.lean * 1.5 * g.randomness;
      _a.set(_b.x + Math.cos(bar.leanA) * lean, c.barHeight, _b.z + Math.sin(bar.leanA) * lean);

      if (reach >= 1 && !bar.struck) {
        bar.struck = true;
        bar.struckAt = t;
        this._strikeFx(c, g, _b);
      }
      if (bar.struck) struck++;

      // Gutters out one by one in the fade; flares with the burst.
      const alive = fading ? (bar.out * 0.85 > kf ? 1 : 0) : 1;
      const since = bar.struck ? t - bar.struckAt : 0;
      const flare = bar.struck ? c.strikeFlare * Math.exp(-since * 14) : 1.2;
      const burstFlare = this._burst ? 1.5 * Math.exp(-(t - this._burstAt) * 8) : 0;
      const stutter = 0.75 + 0.25 * Math.sin(this.age * 53 + bar.seed) * Math.sin(this.age * 29 + bar.seed * 3);
      const intensity = (bar.struck ? Math.max(flare, c.barHold * stutter) : flare) + burstFlare;
      if (alive > 0) {
        const seed = this._tick(bar.seed, c.barFlicker);
        this.batch.add(_a, _b, _eye, c.barJag, c.barWidth * (bar.struck ? 1 : 0.6), seed, intensity, c.barFreq, reach, 0.1);
        // Branches forking off it.
        const nb = Math.round(c.branches);
        for (let k = 0; k < nb; k++) {
          const s = 0.25 + 0.5 * ((k + 0.5) / Math.max(1, nb));
          if (s > reach) continue;
          this.batch.pointOnLast(s, _c);
          const ba = bar.leanA + k * 2.4 + seed;
          _pos.set(_c.x + Math.cos(ba) * c.branchLength, _c.y - c.branchLength * 0.8, _c.z + Math.sin(ba) * c.branchLength);
          this.batch.add(_c, _pos, _eye, c.barJag * 0.5, c.barWidth * 0.45, seed + k * 3.3, intensity * 0.6, c.barFreq * 0.5, 1, 0.8);
        }
      }

      /* the arc inward */
      if (t >= arcStart && alive > 0) {
        const fire = arcStart + bar.order * arcT;
        const ka = saturate((t - fire) / 0.06);
        if (ka > 0) {
          _a.set(_b.x, c.arcHeight, _b.z);
          if (bar.target && bar.target.bodyPoint && !bar.target.finished) {
            if (!bar.target.bodyPoint(_c)) _c.set(bar.target.position.x, 1.1, bar.target.position.z);
          } else {
            _c.set(_centre.x, c.knotHeight, _centre.z);
          }
          if (ka >= 1 && !bar.arced) {
            bar.arced = true;
            bar.arcAt = t;
            this._arcHit(c, g, bar, _b, _c);
          }
          if (!bar.target) arcsIn++;
          const afterBurst = this._burst ? Math.exp(-(t - this._burstAt) * 6) : 1;
          const arcFlare = bar.arced ? 1 + 2 * Math.exp(-(t - bar.arcAt) * 12) : 1.5;
          this.batch.add(_a, _c, _eye, c.arcJag, c.arcWidth, this._tick(bar.seed + 9, c.arcFlicker), c.arcGlow * arcFlare * afterBurst, c.arcFreq, ka, 0.3);
        }
      }

    }

    /* the links: rings of crackle between neighbouring bars */
    if (t >= cageStart && !this._burst) {
      const tiers = Math.min(3, Math.max(0, Math.round(c.linkTiers)));
      const kl = smoothstep(0, 0.15, t - cageStart);
      for (let tier = 0; tier < tiers; tier++) {
        const h = tiers === 1 ? (c.linkLow + c.linkHigh) * 0.5 : lerp(c.linkLow, c.linkHigh, tier / (tiers - 1));
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          if (!this.bars[i].struck || !this.bars[j].struck) continue;
          // Not every link every tick: they jump.
          const seed = this._tick(this.bars[i].seed + tier * 5, c.barFlicker * 0.8);
          if (Math.sin(seed * 12.9898) > 0.55) continue;
          this._foot(i, n, _a).setY(h);
          this._foot(j, n, _b).setY(h);
          this.batch.add(_a, _b, _eye, c.linkJag, c.barWidth * 0.5, seed, c.linkGlow * kl * (fading ? 1 - kf : 1), c.barFreq * 0.6, 1, 0);
        }
      }
    }
    this.batch.end();
    this.bolts.visible = this.batch.count > 0;

    /* --- the knot --- */
    const kk = t >= arcStart ? saturate((t - arcStart) / (arcT + this._T(c.knotTime))) : 0;
    const knotLife = this._burst ? Math.max(0, 1 - (t - this._burstAt) / 0.12) : 1;
    _knotState.pos.set(_centre.x, c.knotHeight, _centre.z);
    _knotState.size = c.knotSize * (0.25 + 0.75 * Easing.outCubic(kk)) * (1 + (this._burst ? (t - this._burstAt) * 6 : 0)) * (1 + 0.08 * Math.sin(this.age * 60));
    _knotState.intensity = (arcsIn > 0 || kk > 0 ? kk * (0.6 + 0.4 * Math.min(1, arcsIn / 3)) : 0) * knotLife;
    _knotState.seed = this._seed;
    this.knotMaterial.userData.sync(_knotState);
    this.knot.visible = _knotState.intensity > 0.01;
    if (t >= burstAt && !this._burst) {
      this._burst = true;
      this._burstAt = t;
      this._burstFx(c, g);
    }

    /* --- fulgurites --- */
    this._updateGlass(c, g, n, t, kf);

    /* --- the floor --- */
    const spokes = t >= arcStart ? Easing.outCubic(saturate((t - arcStart) / arcT)) : 0;
    _floorState.centre.copy(_centre);
    _floorState.radius = R;
    _floorState.bars = n;
    _floorState.phase = this._phase0;
    _floorState.ring = saturate(struck / Math.max(1, n) * 1.5);
    _floorState.spokes = spokes;
    _floorState.star = this._burst ? Easing.outCubic(saturate((t - this._burstAt) / 0.2)) : 0;
    _floorState.heat = fading ? 1 - kf : 1;
    _floorState.seed = this._seed;
    _floorState.erode = fading ? saturate((kf - 0.4) / 0.6) : 0;
    this.floorMaterial.userData.sync(_floorState);
    this.floor.visible = true;

    /* --- ionised air & motes --- */
    const ion = (struck / Math.max(1, n)) * (fading ? 1 - kf : 1);
    this.warp.position.set(_centre.x, 0, _centre.z);
    this.warp.scale.set(R, c.linkHigh + 1.5, R);
    _warpState.strength = ion;
    this.warpMaterial.userData.sync(_warpState);
    this.warp.visible = ion > 0.01;
    if (ion > 0.05 && !this._burst) this._moteFx(dt, c, g, R, ion);

    if (t < arcStart + arcT && t > 0) this.ctx.shake.rumble(0.05 * ion * g.cameraShake, dt);
    this.position.set(_centre.x, this._burst ? c.knotHeight : 2.2, _centre.z);
  }

  _updateGlass(c, g, n, t, kf) {
    const per = Math.min(GLASS_EACH, Math.max(0, Math.round(c.glassPerBar)));
    const state = this.glassState.array;
    const growT = Math.max(0.02, c.glassGrowTime);
    let any = false;
    for (let i = 0; i < MAX_BARS; i++) {
      const bar = this.bars[i];
      for (let k = 0; k < GLASS_EACH; k++) {
        const gi = i * GLASS_EACH + k;
        if (i >= n || k >= per || !bar.struck) {
          this.glass.setMatrixAt(gi, _zero);
          continue;
        }
        const d = gi * 5;
        const since = t - bar.struckAt;
        const grow = Easing.outBack(saturate(since / growT));
        this._foot(i, n, _pos);
        const ba = this.glassDice[d] * TAU;
        const off = k === 0 ? 0 : 0.12 + this.glassDice[d + 1] * 0.3;
        _pos.x += Math.cos(ba) * off;
        _pos.z += Math.sin(ba) * off;
        // Sinks at the very end.
        _pos.y = -0.05 - (kf > 0.6 ? (kf - 0.6) / 0.4 : 0) * c.glassHeight;
        const lean = (k === 0 ? 0.3 : 1) * c.glassLean * this.glassDice[d + 2] * g.randomness;
        _dir.set(Math.cos(ba) * Math.sin(lean), Math.cos(lean), Math.sin(ba) * Math.sin(lean)).normalize();
        _q.setFromUnitVectors(_up, _dir);
        const h = c.glassHeight * (k === 0 ? 1 : 0.35 + 0.5 * this.glassDice[d + 3]) * grow;
        const w = c.glassWidth * (k === 0 ? 1 : 0.6);
        _scale.set(w, Math.max(0.001, h), w);
        _m.compose(_pos, _q, _scale);
        this.glass.setMatrixAt(gi, _m);
        // Molten at the strike, a charged blue while the cage holds, black at the end.
        let heat = lerp(0.35, 1, Math.exp(-since * 3));
        if (this._burst) heat = Math.max(heat, Math.exp(-(t - this._burstAt) * 2));
        heat *= 1 - kf;
        state[gi * 2] = heat;
        state[gi * 2 + 1] = this.glassDice[d + 4];
        any = true;
      }
    }
    this.glass.visible = any;
    this.glass.instanceMatrix.needsUpdate = true;
    this.glassState.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* The bodies                                                          */
  /* ------------------------------------------------------------------ */

  /** Give every standing body in the circle to the nearest free bar. */
  _assign(n) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const found = field.findTargets(_centre.x, _centre.z, Math.max(0.5, c.zoneRadius) + 0.2, this._found);
    for (let f = 0; f < found.length; f++) {
      const d = found[f];
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        if (this.bars[i].target) continue;
        this._foot(i, n, _pos);
        const dd = (_pos.x - d.position.x) ** 2 + (_pos.z - d.position.z) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = i;
        }
      }
      if (best >= 0) this.bars[best].target = d;
    }
    this._found.length = 0;
  }

  _arcHit(c, g, bar, from, at) {
    const power = g.explosionIntensity;
    this.ctx.shake.add(c.arcShake * power, 8, 24);
    this.lightBoost = Math.max(this.lightBoost, c.strikeLight * 0.6 * power);
    this._sparkFx(c, g, at, c.sparkCount * 0.7);
    const d = bar.target;
    if (!d || !d.alive) return;
    _dir.set(d.position.x - from.x, 0, d.position.z - from.z);
    if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
    _dir.normalize();
    const look = this._look;
    look.color = c.colorBodyBurnt;
    look.rimColor = c.colorBodyRim;
    look.rimEmissive = c.bodyRimGlow;
    look.edgeColor = c.colorBodyEdge;
    look.edgeEmissive = c.bodyEdgeGlow;
    d.corrode(c.scorchTint, look);
    this._force.impulse = c.hitImpulse * power;
    this._force.lift = c.hitLift * power;
    this._force.spin = c.hitSpin;
    d.kill(_dir.x, _dir.z, this._force);
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  _sparkFx(c, g, at, count) {
    _emit.position = at;
    _emit.radius = 0.1;
    _emit.direction = _up;
    _emit.speed = c.sparkSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 1.2;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.07;
    _emit.sizeVariance = 0.5;
    _emit.life = c.sparkLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.sparks.emit(Math.round(count * g.particleCount), _emit);
  }

  _strikeFx(c, g, foot) {
    const power = g.explosionIntensity;
    this.ctx.shake.add(c.strikeShake * power, 7, 26);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.strikeFlash * power);
    this.lightBoost = Math.max(this.lightBoost, c.strikeLight * power);
    _pos.copy(foot).setY(0.1);
    this._sparkFx(c, g, _pos, c.sparkCount);
    _emit.position = _pos;
    _emit.radius = 0.2;
    _emit.direction = _up;
    _emit.speed = 1.2;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.6;
    _emit.size = 0.5;
    _emit.sizeVariance = 0.5;
    _emit.life = c.smokeLifetime;
    _emit.spin = 0.4;
    this.smoke.emit(Math.round(c.smokeCount * g.particleCount), _emit);
    this.ctx.decals.spawn(DecalType.SCORCH, foot, {
      radius: c.scorchRadius,
      life: this.impactDuration + this.fadeDuration,
      intensity: 1,
      colorA: getColor(c.colorBoltBody),
      colorB: getColor(c.colorBoltCore),
      height: 0.02
    });
    this.ctx.decals.spawn(DecalType.ARC, foot, {
      radius: c.scorchRadius * 1.6,
      life: 0.8,
      intensity: 1,
      colorA: getColor(c.colorBoltBody),
      colorB: getColor(c.colorBoltCore),
      height: 0.025
    });
  }

  _burstFx(c, g) {
    const power = g.explosionIntensity;
    const R = Math.max(0.5, c.zoneRadius);
    this.ctx.shake.add(c.burstShake * power, 3, 16);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.burstFlash * power);
    this.lightBoost = c.burstLight * power;
    _knot.set(_centre.x, c.knotHeight, _centre.z);
    this.ctx.bursts.spawn(BurstMode.STORM, _knot, {
      radius: 0.4,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1.6,
      opacity: 0.9 * g.opacity,
      squash: 0.8,
      colorA: getColor(c.colorBoltCore),
      colorB: getColor(c.colorBoltBody),
      colorC: getColor(c.colorBoltHalo)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.shockRadius * power,
      life: c.shockLife,
      width: 0.07,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
    });
    this.ctx.decals.spawn(DecalType.ARC, _centre, {
      radius: R,
      life: 1.2,
      intensity: 1,
      colorA: getColor(c.colorBoltBody),
      colorB: getColor(c.colorBoltCore),
      height: 0.025
    });
    this._sparkFx(c, g, _knot, c.sparkCount * 4);

    const field = this.ctx.dummies;
    if (field?.findTargets) {
      const found = field.findTargets(_centre.x, _centre.z, R, this._found);
      const look = this._look;
      look.color = c.colorBodyBurnt;
      look.rimColor = c.colorBodyRim;
      look.rimEmissive = c.bodyRimGlow;
      look.edgeColor = c.colorBodyEdge;
      look.edgeEmissive = c.bodyEdgeGlow;
      for (let f = 0; f < found.length; f++) {
        const d = found[f];
        _dir.set(d.position.x - _centre.x, 0, d.position.z - _centre.z);
        if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
        _dir.normalize();
        d.corrode(c.scorchTint, look);
        this._force.impulse = c.burstImpulse * power;
        this._force.lift = c.burstLift * power;
        this._force.spin = c.hitSpin;
        d.kill(_dir.x, _dir.z, this._force);
      }
      this._found.length = 0;
    }
  }

  _moteFx(dt, c, g, R, k) {
    const count = Math.round(this.moteEmitter.tick(dt, c.moteRate * k) * g.particleCount);
    if (count <= 0) return;
    _emit.radius = 0;
    _emit.direction = _up;
    _emit.speed = 0.6;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.4;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.06;
    _emit.sizeVariance = 0.6;
    _emit.life = c.moteLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const r = R * Math.sqrt(Math.random()) * 0.95;
      _pos.set(_centre.x + Math.cos(a) * r, 0.1 + Math.random() * 1.5, _centre.z + Math.sin(a) * r);
      _emit.position = _pos;
      this.motes.emit(1, _emit);
    }
  }

  /** Static skittering along the floor to the circle. */
  _travelFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const spacing = Math.max(0.2, c.crawlSpacing);
    while (this.front - this._travelled >= spacing) {
      this._travelled += spacing;
      this.pointAt(saturate(this._travelled / this.length), _pos);
      this.ctx.decals.spawn(DecalType.ARC, _pos, {
        radius: c.crawlRadius,
        life: c.crawlLife * g.lifetime,
        intensity: 1,
        colorA: getColor(c.colorBoltBody),
        colorB: getColor(c.colorBoltCore),
        height: 0.02
      });
    }
    // A short bolt skittering ahead of the front, re-aimed every tick.
    this.ctx.camera.getWorldPosition(_eye);
    this.batch.begin();
    const seed = this._tick(this._seed, 20);
    _a.copy(this.position).setY(0.05);
    const ang = Math.sin(seed * 12.9898) * 1.2;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    _b.copy(_a).addScaledVector(this.direction, 1.4 * ca).addScaledVector(this.side, 1.4 * sa);
    _b.y = 0.05;
    this.batch.add(_a, _b, _eye, 0.25, 0.08, seed, 1.2, 4, 1, 0.5);
    _c.copy(_a).addScaledVector(this.direction, -1.2).addScaledVector(this.side, -sa * 0.8);
    this.batch.add(_a, _c, _eye, 0.2, 0.06, seed + 3, 0.8, 4, 1, 0.7);
    this.batch.end();
    this.bolts.visible = true;
    const count = Math.round(this.crawlEmitter.tick(dt, c.crawlSparks) * g.particleCount);
    if (count > 0) {
      _pos.copy(this.position).setY(0.1);
      _emit.position = _pos;
      _emit.radius = 0.2;
      _emit.direction = _up;
      _emit.speed = c.sparkSpeed * 0.5;
      _emit.speedVariance = 0.6;
      _emit.spread = 1;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.06;
      _emit.sizeVariance = 0.5;
      _emit.life = c.sparkLifetime * 0.7;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.sparks.emit(count, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._sync();
    this._travelFx(dt);
    this.position.y = 0.6;
  }

  onImpact() {
    this._sync();
  }

  onFade(dt) {
    this._sync();
    this._update(dt);
  }

  onDestroy() {
    for (let i = 0; i < MAX_BARS; i++) this.bars[i].target = null;
    this.batch.begin();
    this.batch.end();
    this.bolts.visible = false;
    this.knot.visible = false;
    this.glass.visible = false;
    this.floor.visible = false;
    this.warp.visible = false;
    this._found.length = 0;
  }

  dispose() {
    this.batch.dispose();
    this.knotGeometry.dispose();
    this.glassGeometry.dispose();
    this.floorGeometry.dispose();
    this.warpGeometry.dispose();
    this.boltMaterial.dispose();
    this.knotMaterial.dispose();
    this.glassMaterial.dispose();
    this.floorMaterial.dispose();
    this.warpMaterial.dispose();
    this.glass.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('ϟ  Fulgur Cage');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'static crawl speed (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'lifetime', 0.05, 5, 0.05, 'gutters out over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'dropTime', 0.02, 2, 0.01, 'bars strike over');
  R(time, c, 'strikeTime', 0.02, 0.5, 0.005, 'one bar reaches the floor in');
  R(time, c, 'cageTime', 0, 3, 0.01, 'cage stands for');
  R(time, c, 'arcTime', 0.02, 2, 0.01, 'arcs leap in over');
  R(time, c, 'knotTime', 0.02, 2, 0.01, 'knot swells for');

  const bars = folder.addFolder('1 · Bars');
  R(bars, c, 'barCount', 3, MAX_BARS, 1, 'bars');
  R(bars, c, 'barHeight', 2, 40, 0.1, 'from height (m)');
  R(bars, c, 'barWidth', 0.02, 1, 0.005, 'width (m)');
  R(bars, c, 'barJag', 0, 2, 0.01, 'jag (m)');
  R(bars, c, 'barFreq', 1, 20, 0.1, 'jags along it');
  R(bars, c, 'barFlicker', 0, 60, 0.5, 're-forks / s');
  R(bars, c, 'barHold', 0, 3, 0.01, 'standing brightness');
  R(bars, c, 'strikeFlare', 0, 8, 0.05, 'return stroke');
  R(bars, c, 'branches', 0, 4, 1, 'branches');
  R(bars, c, 'branchLength', 0.1, 5, 0.05, 'branch length (m)');
  R(bars, c, 'linkTiers', 0, 3, 1, 'link rings');
  R(bars, c, 'linkLow', 0, 5, 0.05, 'lower ring (m)');
  R(bars, c, 'linkHigh', 0, 8, 0.05, 'upper ring (m)');
  R(bars, c, 'linkJag', 0, 2, 0.01, 'link jag (m)');
  R(bars, c, 'linkGlow', 0, 3, 0.01, 'link brightness');
  const look = bars.addFolder('Lightning look');
  R(look, c, 'boltCore', 0.02, 1, 0.01, 'core width');
  R(look, c, 'boltGlow', 0, 15, 0.05, 'glow');
  R(look, c, 'boltCrawl', 0, 100, 0.5, 'crawl speed');
  look.addColor(c, 'colorBoltCore').name('core');
  look.addColor(c, 'colorBoltBody').name('body');
  look.addColor(c, 'colorBoltHalo').name('halo');

  const arcs = folder.addFolder('2 · Arcs & knot');
  R(arcs, c, 'arcHeight', 0, 5, 0.05, 'leaves the bar at (m)');
  R(arcs, c, 'arcWidth', 0.01, 0.6, 0.005, 'width (m)');
  R(arcs, c, 'arcJag', 0, 2, 0.01, 'jag (m)');
  R(arcs, c, 'arcFreq', 1, 20, 0.1, 'jags along it');
  R(arcs, c, 'arcFlicker', 0, 60, 0.5, 're-forks / s');
  R(arcs, c, 'arcGlow', 0, 5, 0.05, 'brightness');
  R(arcs, c, 'knotHeight', 0.2, 5, 0.05, 'knot height (m)');
  R(arcs, c, 'knotSize', 0.1, 6, 0.05, 'knot size (m)');
  R(arcs, c, 'knotGlow', 0, 10, 0.05, 'knot glow');

  const glass = folder.addFolder('3 · Fulgurites');
  R(glass, c, 'glassPerBar', 0, GLASS_EACH, 1, 'tubes per foot');
  R(glass, c, 'glassHeight', 0.05, 3, 0.01, 'height (m)');
  R(glass, c, 'glassWidth', 0.01, 0.5, 0.005, 'width (m)');
  R(glass, c, 'glassLean', 0, 1.2, 0.01, 'splay (rad)');
  R(glass, c, 'glassGrowTime', 0.02, 1, 0.01, 'fuses up over (s)');
  R(glass, c, 'glassGlow', 0, 10, 0.05, 'molten glow');
  R(glass, c, 'glassSheen', 0, 2, 0.01, 'sheen');
  R(glass, c, 'glassCrust', 0, 1, 0.01, 'sand crust');
  glass.addColor(c, 'colorGlass').name('glass');
  glass.addColor(c, 'colorSand').name('sand');
  glass.addColor(c, 'colorGlassHot').name('molten');

  const fl = folder.addFolder('4 · Scorched floor');
  R(fl, c, 'floorGlow', 0, 10, 0.05, 'burn glow');
  fl.addColor(c, 'colorSoot').name('soot');
  R(fl, c, 'ionWarp', 0, 3, 0.01, 'ionised air');

  const pt = folder.addFolder('5 · Sparks, motes, smoke');
  R(pt, c, 'sparkCount', 0, 200, 1, 'sparks per strike');
  R(pt, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(pt, c, 'sparkSize', 0.005, 0.3, 0.005, 'spark size');
  R(pt, c, 'sparkLifetime', 0.05, 2, 0.01, 'spark lifetime');
  R(pt, c, 'sparkStretch', 0, 2, 0.01, 'spark stretch');
  Editor.gradient(pt, c, 'colorSpark', 'spark colour');
  R(pt, c, 'moteRate', 0, 500, 1, 'motes / s');
  R(pt, c, 'moteSize', 0.005, 0.3, 0.005, 'mote size');
  R(pt, c, 'moteLifetime', 0.1, 4, 0.05, 'mote lifetime');
  R(pt, c, 'smokeCount', 0, 40, 1, 'smoke per strike');
  R(pt, c, 'smokeSize', 0.05, 3, 0.05, 'smoke size');
  R(pt, c, 'smokeLifetime', 0.1, 5, 0.05, 'smoke lifetime');
  R(pt, c, 'smokeOpacity', 0, 1, 0.01, 'smoke opacity');
  Editor.gradient(pt, c, 'colorSmoke', 'smoke colour');

  const hit = folder.addFolder('6 · Bodies');
  R(hit, c, 'hitImpulse', 0, 20, 0.1, 'struck, thrown (m/s)');
  R(hit, c, 'hitLift', 0, 15, 0.1, 'struck, lift');
  R(hit, c, 'hitSpin', 0, 6, 0.05, 'spin');
  R(hit, c, 'burstImpulse', 0, 25, 0.1, 'burst, thrown (m/s)');
  R(hit, c, 'burstLift', 0, 15, 0.1, 'burst, lift');
  R(hit, c, 'scorchTint', 0, 1, 0.01, 'charred');
  hit.addColor(c, 'colorBodyBurnt').name('charred body');
  hit.addColor(c, 'colorBodyRim').name('rim');
  R(hit, c, 'bodyRimGlow', 0, 6, 0.05, 'rim glow');
  hit.addColor(c, 'colorBodyEdge').name('edge');
  R(hit, c, 'bodyEdgeGlow', 0, 8, 0.05, 'edge glow');

  const beat = folder.addFolder('7 · The beat');
  R(beat, c, 'strikeShake', 0, 1, 0.01, 'strike knock');
  R(beat, c, 'strikeFlash', 0, 1, 0.01, 'strike flash');
  R(beat, c, 'strikeLight', 0, 80, 0.5, 'strike light');
  R(beat, c, 'arcShake', 0, 1, 0.01, 'arc knock');
  R(beat, c, 'burstShake', 0, 2, 0.01, 'burst shake');
  R(beat, c, 'burstFlash', 0, 1, 0.01, 'burst flash');
  R(beat, c, 'burstLight', 0, 150, 0.5, 'burst light');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'burstRadius', 0, 12, 0.05, 'storm shell (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'storm shell life');
  R(beat, c, 'shockRadius', 0, 15, 0.05, 'shock ring (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'shock ring life');
  beat.addColor(c, 'colorShockA').name('shock ring');
  beat.addColor(c, 'colorShockB').name('shock ring, hot');
  R(beat, c, 'scorchRadius', 0.1, 4, 0.05, 'foot scorch (m)');
  const trail = beat.addFolder('Static crawl (travel)');
  R(trail, c, 'crawlSpacing', 0.2, 5, 0.05, 'burn spacing (m)');
  R(trail, c, 'crawlRadius', 0.1, 3, 0.05, 'burn radius (m)');
  R(trail, c, 'crawlLife', 0.1, 5, 0.05, 'burn life');
  R(trail, c, 'crawlSparks', 0, 600, 1, 'sparks / s');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'stutter');
}
