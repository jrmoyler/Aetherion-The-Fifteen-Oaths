import { Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createLatticeGeometry,
  latticePoint
} from '../../assets/matrix-new/EmberveilLatticeGeometry.js';
import {
  createEmberStrandMaterial,
  createEmberFloorMaterial,
  createEmberHazeMaterial,
  EMBERVEIL_MAX_STRANDS
} from '../../materials/matrix-new/EmberveilLatticeMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

export const ID = 'emberveil';

/** Strands the parameter buffer holds. The editor's count slider clamps to it. */
const MAX_STRANDS = EMBERVEIL_MAX_STRANDS;
/** Bodies one cage can hold at once. Fixed so a cast allocates nothing. */
const MAX_TRAPPED = 16;
/** Rings along a strand and vertices round one — the tube's tessellation. */
const STRAND_SEGMENTS = 96;
const STRAND_SIDES = 8;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _up = new Vector3(0, 1, 0);

/** JS twin of the fragment shader's per-strand climb hash. */
function strandHash(i) {
  const x = Math.sin(i * 91.345 + 7.13) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * EMBERVEIL LATTICE — Fire, zone cast.
 *
 * A cage, not an explosion: the ability's whole read is *containment*. An ember
 * is thrown to the circle; burning strands climb out of the floor round its
 * rim and weave over it into a dome, everything inside stands trapped while it
 * burns, and then the cage pulls itself tight and collapses inward into one
 * flame burst that throws the trapped clear.
 *
 * ## Layers
 *
 *   1. **THE STRANDS** (`createEmberStrandMaterial('core')`) — thin tubes on a
 *      woven dome path: two families sweeping round the circle in opposite
 *      senses as they arch over it, passing over and under each other. The
 *      tube is inflated from a *parameter buffer* in the vertex stage, so the
 *      dome's every dimension — and the contraction — is a uniform. White-hot
 *      down the line of sight, orange through the body, red at the silhouette,
 *      with heat pulses running from the roots to the crown.
 *   2. **THE FLAMES** (`createEmberStrandMaterial('flame')`) — the same path, a
 *      fatter tube whose upper side is torn upward by noise: the flames licking
 *      off every strand. Additive, depth-soft, faded out at the floor.
 *   3. **THE SCORCHED RING** (`createEmberFloorMaterial`) — a charred band round
 *      the circle that creeps inward while it burns, an ember seam crawling
 *      along it, a molten pool under every strand's anchor (recomputed from the
 *      path in the shader, so a pool is always under its strand), a heat wash.
 *   4. **EMBERS** — SOFT particles dripping off the strands, picked on the
 *      exact path the GPU draws (`latticePoint` has a JavaScript twin).
 *   5. **SPARKS & SMOKE** — curl-noise sparks rising off the cage and a slow
 *      non-additive smoke off the crown, so the dome has a column over it.
 *   6. **HEAT HAZE** (`createEmberHazeMaterial`) — a billboard on
 *      LAYER.DISTORTION over the cage: a fine vertical shimmer, not a swirl.
 *   7. **THE COLLAPSE** — a FIRE shell, a SHOCKWAVE ring, a SCORCH decal, a
 *      flash, a shake, a light punch and outward STREAK sparks.
 *
 * ## The bodies
 *
 * `handlesOwnHits`. Once the weave is half grown the cage polls `findTargets`
 * inside its own radius and holds what it finds: a trapped body stays standing
 * (nothing touches it) while the heat stains it (`Dummy#corrode`), so you can
 * see who is in the cage. On the collapse every held body — and anything that
 * is still inside — is killed and thrown *outward* from the centre: a cage
 * collapsing in blows out.
 *
 * ## Timeline (seconds after the ember lands)
 *
 *   0 → `weaveTime`               strands climb and meet over the crown
 *   → + `lifetime`                the closed cage burns
 *   → + `contractTime`            it tightens, turns faster, burns whiter
 *   collapse                      the burst, the kill
 *   fade (`fadeTime`)             burnt strands break apart, the floor cools
 *
 * ## The editor rule
 *
 * A cast keeps a seed and one integrated phase (the cage's turn — integrated,
 * so dragging `spin` does not snap it). Everything else is resolved from
 * `settings.emberveil` every frame.
 */
export class EmberveilLatticeAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Bodies held in the cage. HUD readout only. */
  get instanceCount() {
    return this._trappedCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layers 1 & 2: the strands and their flames, one buffer ---- */
    this.latticeGeometry = createLatticeGeometry(MAX_STRANDS, STRAND_SEGMENTS, STRAND_SIDES);
    this.flameMaterial = createEmberStrandMaterial('flame');
    this.coreMaterial = createEmberStrandMaterial('core');
    this.flames = new Mesh(this.latticeGeometry, this.flameMaterial);
    this.strands = new Mesh(this.latticeGeometry, this.coreMaterial);
    this.flames.renderOrder = 11;
    this.strands.renderOrder = 13;
    for (const mesh of [this.flames, this.strands]) {
      // Parameter-space vertices: the bounding volume means nothing.
      mesh.frustumCulled = false;
      mesh.layers.set(LAYER.VFX);
      mesh.visible = false;
      this.group.add(mesh);
    }

    /* ---- layer 3: the scorched ring ---- */
    this.floorGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.floorMaterial = createEmberFloorMaterial();
    this.floor = new Mesh(this.floorGeometry, this.floorMaterial);
    this.floor.layers.set(LAYER.VFX);
    // Over the scorch decals, under the flames.
    this.floor.renderOrder = 6;
    this.floor.frustumCulled = false;
    this.floor.visible = false;
    this.group.add(this.floor);

    /* ---- layer 6: the heat haze ---- */
    this.hazeGeometry = new PlaneGeometry(1, 1, 1, 1).translate(0, 0.5, 0);
    this.hazeMaterial = createEmberHazeMaterial();
    this.haze = new Mesh(this.hazeGeometry, this.hazeMaterial);
    this.haze.layers.set(LAYER.DISTORTION);
    this.haze.frustumCulled = false;
    this.haze.visible = false;
    this.group.add(this.haze);

    /** The dome path — one object, read by three materials and the embers. */
    this._lattice = {
      centre: new Vector3(),
      count: 0,
      radius: 1,
      height: 1,
      apex: 1,
      arch: 1,
      sweep: 0,
      crossings: 0,
      weave: 0,
      rot: 0,
      sway: 0,
      swaySpeed: 0,
      shrink: 1,
      squash: 1
    };
    this._strandState = { grow: 0, dissolve: 0, surge: 0, fade: 1 };
    this._floorState = { quadSize: 1, reveal: 0, heat: 0, surge: 0, fade: 1, seed: 0 };
    this._hazeState = { width: 1, height: 1, strength: 0, seed: 0 };

    this._trapped = new Array(MAX_TRAPPED).fill(null);
    this._trappedCount = 0;
    this._targets = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };

    this._clock = -1;
    this._rot = 0;
    this._seed = 0;
    this._collapsed = false;
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 4: embers dripping off the strands ---- */
    this.drips = particles.get('emberveil.drip', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.2
    });
    this.drips.uniforms.uDrag.value = 0.6;
    this.drips.uniforms.uEndSize.value = 0.35;
    this.drips.uniforms.uSizeIn.value = 0.04;
    this.drips.uniforms.uFadeIn.value = 0.03;
    this.drips.uniforms.uFadeOut.value = 0.5;

    /* ---- layer 5: sparks rising off the cage ---- */
    this.sparks = particles.get('emberveil.spark', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.3
    });
    this.sparks.uniforms.uDrag.value = 1.2;
    this.sparks.uniforms.uEndSize.value = 0.2;
    this.sparks.uniforms.uSizeIn.value = 0.05;
    this.sparks.uniforms.uFadeIn.value = 0.05;
    this.sparks.uniforms.uFadeOut.value = 0.45;

    /* ---- layer 5: smoke off the crown ---- */
    this.smoke = particles.get('emberveil.smoke', {
      capacity: 1200,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.0
    });
    this.smoke.uniforms.uDrag.value = 1.4;
    this.smoke.uniforms.uSizeIn.value = 0.12;
    this.smoke.uniforms.uFadeIn.value = 0.12;
    this.smoke.uniforms.uFadeOut.value = 0.45;

    /* ---- layer 7 + travel: fast velocity-stretched streaks ---- */
    this.streaks = particles.get('emberveil.streak', {
      capacity: 2000,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.streaks.uniforms.uDrag.value = 2.0;
    this.streaks.uniforms.uEndSize.value = 0.3;
    this.streaks.uniforms.uSizeIn.value = 0.02;
    this.streaks.uniforms.uFadeIn.value = 0.02;
    this.streaks.uniforms.uFadeOut.value = 0.55;

    this.dripEmitter = new RateEmitter();
    this.sparkEmitter = new RateEmitter();
    this.smokeEmitter = new RateEmitter();
    this.callEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _weaveTime() {
    return Math.max(0.05, settings.emberveil.weaveTime * settings.global.lifetime);
  }

  _burnTime() {
    return Math.max(0, settings.emberveil.lifetime * settings.global.lifetime);
  }

  _contractTime() {
    return Math.max(0.05, settings.emberveil.contractTime * settings.global.lifetime);
  }

  /** The collapse is the end of the impact phase. */
  get impactDuration() {
    return this._weaveTime() + this._burnTime() + this._contractTime();
  }

  get fadeDuration() {
    return Math.max(0.1, settings.emberveil.fadeTime * settings.global.lifetime);
  }

  /** Fire gutters. */
  lightShimmer() {
    const f = settings.emberveil.lightFlicker;
    return 1 - f + f * (0.55 + 0.45 * Math.sin(this.age * 21.0) * Math.sin(this.age * 6.7 + 1.3));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._clock = -1;
    this._rot = Math.random() * Math.PI * 2;
    this._seed = Math.random() * 100;
    this._collapsed = false;
    this._releaseTrapped();
    this.dripEmitter.reset();
    this.sparkEmitter.reset();
    this.smokeEmitter.reset();
    this.callEmitter.reset();

    this.strands.visible = false;
    this.flames.visible = false;
    this.floor.visible = false;
    this.haze.visible = false;
    this._syncParticles();
  }

  _releaseTrapped() {
    for (let i = 0; i < MAX_TRAPPED; i++) this._trapped[i] = null;
    this._trappedCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _syncParticles() {
    const c = settings.emberveil;
    const g = settings.global;

    this.drips.setGradient(getColor(c.colorDripA), getColor(c.colorDripB), getColor(c.colorDripC), getColor(c.colorDripD));
    this.drips.uniforms.uGravity.value.set(0, c.dripGravity, 0);
    this.drips.uniforms.uSizeScale.value = c.dripSize * g.particleSize * 7;
    this.drips.uniforms.uLifeScale.value = g.particleLifetime;
    this.drips.uniforms.uSpeedScale.value = g.particleSpeed;
    this.drips.uniforms.uOpacity.value = g.opacity;
    this.drips.uniforms.uGlow.value = c.dripGlow * g.glow;
    this.drips.uniforms.uTurbulence.value = 0.1 * g.turbulence;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    this.sparks.uniforms.uGravity.value.set(0, c.sparkRise, 0);
    this.sparks.uniforms.uSizeScale.value = c.sparkSize * g.particleSize * 7;
    this.sparks.uniforms.uLifeScale.value = g.particleLifetime;
    this.sparks.uniforms.uSpeedScale.value = g.particleSpeed;
    this.sparks.uniforms.uOpacity.value = g.opacity;
    this.sparks.uniforms.uGlow.value = c.sparkGlow * g.glow;
    this.sparks.uniforms.uTurbulence.value = 0.7 * g.turbulence;

    this.smoke.setGradient(getColor(c.colorSmokeA), getColor(c.colorSmokeB), getColor(c.colorSmokeC), getColor(c.colorSmokeD));
    this.smoke.uniforms.uGravity.value.set(0, c.smokeRise, 0);
    this.smoke.uniforms.uSizeScale.value = c.smokeSize * g.particleSize;
    this.smoke.uniforms.uLifeScale.value = g.particleLifetime;
    this.smoke.uniforms.uSpeedScale.value = g.particleSpeed;
    this.smoke.uniforms.uOpacity.value = c.smokeOpacity * g.opacity;
    this.smoke.uniforms.uTurbulence.value = c.smokeTurbulence * g.turbulence;
    this.smoke.uniforms.uEndSize.value = c.smokeSpread;

    this.streaks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    this.streaks.uniforms.uGravity.value.set(0, -6, 0);
    this.streaks.uniforms.uSizeScale.value = c.sparkSize * g.particleSize * 9;
    this.streaks.uniforms.uLifeScale.value = g.particleLifetime;
    this.streaks.uniforms.uSpeedScale.value = g.particleSpeed;
    this.streaks.uniforms.uOpacity.value = g.opacity;
    this.streaks.uniforms.uGlow.value = c.sparkGlow * g.glow;
    this.streaks.uniforms.uStretch.value = 0.25;
    this.streaks.uniforms.uTurbulence.value = 0.15 * g.turbulence;
  }

  /**
   * Resolve the dome for this frame and hand it to every surface that draws it.
   *
   * @param {number} grow     0..1 how far the weave has climbed
   * @param {number} contract 0..1 through the contraction (and past it, the slump)
   * @param {number} dissolve 0..1 the burnt strands breaking apart
   * @param {number} heat     0..1 how much of the floor is still burning
   * @param {number} fade     0..1 overall visibility
   */
  _shape(dt, grow, contract, dissolve, heat, fade) {
    const c = settings.emberveil;
    const g = settings.global;
    const L = this._lattice;

    // Integrated, so dragging `spin` mid-cast changes the speed, not the angle.
    const spinRate = c.spin * (1 + saturate(contract) * c.contractSpin);
    this._rot += spinRate * dt * g.animationSpeed;

    this.pointAt(1, _centre);
    const k = Easing.inCubic(saturate(contract));
    L.centre.copy(_centre);
    L.count = Math.min(MAX_STRANDS, Math.max(2, Math.round(c.strandCount)));
    L.radius = Math.max(0.2, c.zoneRadius * c.cageRadius);
    L.height = Math.max(0.1, c.cageHeight);
    L.apex = c.cageApex;
    L.arch = c.cageArch;
    L.sweep = c.sweep;
    L.crossings = c.crossings;
    L.weave = c.weave;
    L.rot = this._rot;
    L.sway = c.sway * g.turbulence;
    L.swaySpeed = c.swaySpeed * g.animationSpeed;
    // Past 1 (after the burst) the burnt strands keep slumping toward the floor.
    const slump = Math.max(0, contract - 1);
    L.shrink = lerp(1, c.contractScale, k) * (1 - slump * 1.2);
    L.squash = lerp(1, c.contractSquash, k) * (1 - slump * 2);

    const surge = saturate(contract) * c.contractSurge;
    const ss = this._strandState;
    ss.grow = grow;
    ss.dissolve = dissolve;
    ss.surge = surge;
    ss.fade = fade;
    this.flameMaterial.userData.sync(L, ss);
    this.coreMaterial.userData.sync(L, ss);

    const fs = this._floorState;
    fs.quadSize = (L.radius * (1 + c.weave) + c.charWidth + c.poolSize + 0.8) * 2;
    fs.reveal = Easing.outCubic(grow);
    fs.heat = heat;
    fs.surge = surge;
    fs.fade = fade;
    fs.seed = this._seed;
    this.floorMaterial.userData.sync(L, fs);
    this.floor.position.set(_centre.x, 0.035, _centre.z);
    this.floor.scale.set(fs.quadSize, 1, fs.quadSize);

    const hs = this._hazeState;
    hs.width = L.radius * L.shrink * 2 * c.hazeWidth;
    hs.height = Math.max(0.2, L.height * L.squash * c.hazeHeight);
    hs.strength = grow * (1 - dissolve) * (1 + surge) * fade;
    hs.seed = this._seed;
    this.hazeMaterial.userData.sync(hs);
    this.haze.position.set(_centre.x, 0, _centre.z);

    this.strands.visible = true;
    this.flames.visible = true;
    this.floor.visible = true;
    this.haze.visible = hs.strength > 0.001;

    return surge;
  }

  /**
   * Embers, sparks and smoke shed off the strands.
   * The drips are placed with the JavaScript twin of the vertex shader's path,
   * and only on the part of a strand that has already climbed into view.
   */
  _burnFx(dt, grow, strength) {
    const c = settings.emberveil;
    const g = settings.global;
    const L = this._lattice;
    const time = frame.uTime.value;
    const stagger = saturate(c.weaveStagger * g.randomness);
    const st = Math.min(stagger, 0.95);

    const drips = Math.round(this.dripEmitter.tick(dt, c.dripRate * strength) * g.particleCount);
    for (let n = 0; n < drips; n++) {
      const i = (Math.random() * L.count) | 0;
      const reachMax = saturate((grow - strandHash(i) * st) / (1 - st));
      if (reachMax <= 0.02) continue;
      // reach is symmetric about the crown: pick a side, then a point on it.
      const reach = Math.random() * reachMax;
      const s = Math.random() < 0.5 ? reach * 0.5 : 1 - reach * 0.5;
      latticePoint(i, s, time, L, _pos);
      if (_pos.y < 0.2) continue;
      _emit.position = _pos;
      _emit.radius = c.strandWidth;
      _emit.direction = _dir.set(0, -1, 0);
      _emit.speed = c.dripSpeed;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.25;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.1;
      _emit.sizeVariance = 0.5;
      _emit.life = c.dripLifetime;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = time;
      this.drips.emit(1, _emit);
    }

    const sparks = Math.round(this.sparkEmitter.tick(dt, c.sparkRate * strength) * g.particleCount);
    for (let n = 0; n < sparks; n++) {
      const i = (Math.random() * L.count) | 0;
      const reachMax = saturate((grow - strandHash(i) * st) / (1 - st));
      if (reachMax <= 0.05) continue;
      const reach = Math.random() * reachMax;
      const s = Math.random() < 0.5 ? reach * 0.5 : 1 - reach * 0.5;
      latticePoint(i, s, time, L, _pos);
      _emit.position = _pos;
      _emit.radius = c.strandWidth * 2;
      _emit.direction = _up;
      _emit.speed = 1.2;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.6;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.08;
      _emit.sizeVariance = 0.6;
      _emit.life = c.sparkLifetime;
      _emit.lifeVariance = 0.5;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = time;
      this.sparks.emit(1, _emit);
    }

    const smokes = Math.round(this.smokeEmitter.tick(dt, c.smokeRate * strength * grow) * g.particleCount);
    if (smokes > 0) {
      _emit.position = _pos.set(L.centre.x, L.height * L.squash * 0.9, L.centre.z);
      _emit.radius = L.radius * L.shrink * 0.45;
      _emit.direction = _up;
      _emit.speed = 0.8;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.4;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 1.0;
      _emit.sizeVariance = 0.4;
      _emit.life = c.smokeLifetime;
      _emit.lifeVariance = 0.35;
      _emit.spin = 0.4;
      _emit.tint = null;
      _emit.time = time;
      this.smoke.emit(smokes, _emit);
    }
  }

  /** Take hold of whatever stands inside the cage, and stain what it holds. */
  _trap(stain) {
    const c = settings.emberveil;
    const L = this._lattice;
    const field = this.ctx.dummies;
    if (field?.findTargets) {
      const found = field.findTargets(L.centre.x, L.centre.z, L.radius * L.shrink * c.trapReach, this._targets);
      for (let f = 0; f < found.length && this._trappedCount < MAX_TRAPPED; f++) {
        const dummy = found[f];
        let held = false;
        for (let t = 0; t < this._trappedCount; t++) if (this._trapped[t] === dummy) held = true;
        if (!held) this._trapped[this._trappedCount++] = dummy;
      }
      this._targets.length = 0;
    }
    for (let t = 0; t < this._trappedCount; t++) {
      const dummy = this._trapped[t];
      if (dummy && dummy.alive) dummy.corrode(stain, c.look);
    }
  }

  /** The cage gives way: one flame burst, and everything in it thrown clear. */
  _collapse() {
    const c = settings.emberveil;
    const g = settings.global;
    const L = this._lattice;
    this._collapsed = true;
    _centre.copy(L.centre);

    this.ctx.bursts.spawn(BurstMode.FIRE, _pos.set(_centre.x, 0.9, _centre.z), {
      radius: L.radius * L.shrink,
      endRadius: c.burstSize * g.explosionIntensity,
      life: c.burstLife,
      intensity: c.burstIntensity,
      opacity: c.burstOpacity * g.opacity,
      fresnel: 1.4,
      displace: 0.6,
      squash: c.burstSquash,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.ringRadius * g.explosionIntensity,
      life: c.ringLife,
      width: c.ringWidth,
      intensity: 1,
      colorA: getColor(c.colorRingA),
      colorB: getColor(c.colorRingB),
      height: 0.03
    });
    this.ctx.decals.spawn(DecalType.SCORCH, _centre, {
      radius: c.scorchRadius,
      life: c.scorchLife * g.lifetime,
      intensity: 1,
      colorA: getColor(c.colorScorch),
      colorB: getColor(c.colorScorchEmber),
      height: 0.022
    });

    _emit.position = _pos.set(_centre.x, 0.6, _centre.z);
    _emit.radius = 0.6;
    _emit.direction = _up;
    _emit.speed = c.collapseSparkSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 1.0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.6;
    _emit.life = c.sparkLifetime * 0.7;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.streaks.emit(Math.round(c.collapseSparks * g.particleCount), _emit);

    _emit.speed = 2.5;
    _emit.radius = 1.2;
    _emit.size = 1.2;
    _emit.life = c.smokeLifetime;
    _emit.spin = 0.5;
    this.smoke.emit(Math.round(14 * g.particleCount), _emit);

    this.ctx.shake.add(c.collapseShake * g.explosionIntensity, 3.5, 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.collapseFlash * g.explosionIntensity);
    this.lightBoost = c.collapseLight * g.explosionIntensity;

    /* --- the kill: held bodies first, then anything else still inside --- */
    this._force.impulse = c.hitImpulse;
    this._force.lift = c.hitLift;
    this._force.spin = c.hitSpin;
    for (let t = 0; t < this._trappedCount; t++) this._throw(this._trapped[t]);
    const field = this.ctx.dummies;
    if (field?.findTargets) {
      const found = field.findTargets(_centre.x, _centre.z, L.radius * c.trapReach, this._targets);
      for (let f = 0; f < found.length; f++) this._throw(found[f]);
      this._targets.length = 0;
    }
    this._releaseTrapped();
  }

  _throw(dummy) {
    if (!dummy || !dummy.alive) return;
    _dir.set(dummy.position.x - _centre.x, 0, dummy.position.z - _centre.z);
    if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
    _dir.normalize();
    dummy.kill(_dir.x, _dir.z, this._force);
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.emberveil;
    const g = settings.global;
    this._syncParticles();

    // The ember arcs out of the hand: a low lob, the light riding it.
    this.position.y = 1.2 + Math.sin(Math.PI * this.u) * 1.4;
    const count = Math.round(this.callEmitter.tick(dt, c.callSparks) * g.particleCount);
    if (count > 0) {
      _emit.position = _pos.copy(this.position);
      _emit.radius = 0.12;
      _emit.direction = _dir.copy(this.direction).negate().setY(0.4).normalize();
      _emit.speed = 2.0;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.5;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.1;
      _emit.sizeVariance = 0.5;
      _emit.life = c.sparkLifetime * 0.5;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = getColor(c.colorB);
      _emit.time = frame.uTime.value;
      this.streaks.emit(count, _emit);
      _emit.tint = null;
    }
  }

  onImpact() {
    const c = settings.emberveil;
    const g = settings.global;
    this._clock = 0;
    this.pointAt(1, _centre);

    // The ember breaks on the floor and the ring catches.
    this.ctx.bursts.spawn(BurstMode.FIRE, _pos.set(_centre.x, 0.3, _centre.z), {
      radius: 0.1,
      endRadius: c.callFlameSize * g.explosionIntensity,
      life: 0.35,
      intensity: c.burstIntensity * 0.7,
      opacity: 0.8,
      displace: 0.5,
      colorA: getColor(c.colorB),
      colorB: getColor(c.colorA),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.zoneRadius * c.cageRadius * 1.05,
      life: 0.5,
      width: 0.05,
      intensity: 0.8,
      colorA: getColor(c.colorRingA),
      colorB: getColor(c.colorRingB),
      height: 0.03
    });
    this.ctx.shake.add(0.1 * g.explosionIntensity, 6, 16);
    this.lightBoost = c.lightIntensity * 0.6;
  }

  onFade(dt) {
    const c = settings.emberveil;
    const g = settings.global;
    this._syncParticles();

    const weave = this._weaveTime();
    const burn = this._burnTime();
    const contractTime = this._contractTime();
    const collapseAt = weave + burn + contractTime;

    if (this.phase === AbilityPhase.IMPACT) this._clock = this.impactTime;
    else this._clock = this.impactDuration + this.fadeTime;
    const clock = this._clock;

    const grow = Easing.outCubic(saturate(clock / weave));
    let contract = saturate((clock - weave - burn) / contractTime);
    let dissolve = 0;
    let heat = 1;
    let fade = 1;

    if (!this._collapsed && clock >= collapseAt) {
      // The shape must be resolved at full contraction before the burst reads it.
      this._shape(0, grow, 1, 0, 1, 1);
      this._collapse();
    }

    if (this._collapsed) {
      const ft = saturate((clock - collapseAt) / this.fadeDuration);
      // After the burst the strands slump further in and break apart quickly;
      // the floor keeps glowing and cools over the whole fade.
      contract = 1 + Easing.outCubic(saturate(ft * 3)) * 0.35;
      dissolve = Easing.outQuad(saturate(ft * 2.2));
      heat = c.floorCool * (1 - Easing.inQuad(ft));
      fade = 1 - Easing.inQuad(ft);
    }

    const surge = this._shape(dt, grow, contract, dissolve, heat, fade);

    const burning = (1 - dissolve) * fade;
    if (burning > 0.01) this._burnFx(dt, grow, burning * (1 + surge));

    // Hold the trapped: from the moment the weave is half grown until it gives.
    if (!this._collapsed && grow > 0.5) {
      const stainT = saturate((clock - weave * 0.5) / Math.max(0.05, c.trapStainTime));
      this._trap(stainT * c.trapStain);
    }

    if (!this._collapsed) {
      this.ctx.shake.rumble((c.trapRumble + contract * c.contractRumble) * g.explosionIntensity, dt);
    }

    // The light sits inside the cage, sinking with it as it slumps.
    this.position.set(this._lattice.centre.x, c.lightHeight * this._lattice.squash, this._lattice.centre.z);
  }

  onDestroy() {
    this._clock = -1;
    this._releaseTrapped();
    this.strands.visible = false;
    this.flames.visible = false;
    this.floor.visible = false;
    this.haze.visible = false;
  }

  dispose() {
    this.latticeGeometry.dispose();
    this.flameMaterial.dispose();
    this.coreMaterial.dispose();
    this.floorGeometry.dispose();
    this.floorMaterial.dispose();
    this.hazeGeometry.dispose();
    this.hazeMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('▦  Emberveil Lattice');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'ember speed (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'callSparks', 0, 600, 1, 'ember sparks / s');
  R(cast, c, 'callFlameSize', 0, 4, 0.05, 'landing flame (m)');
  cast.addColor(c, 'colorA').name('ember');
  cast.addColor(c, 'colorB').name('ember, hot');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'weaveTime', 0.05, 4, 0.01, 'weave climbs over');
  R(time, c, 'lifetime', 0, 10, 0.05, 'cage burns for');
  R(time, c, 'contractTime', 0.05, 3, 0.01, 'contracts over');
  R(time, c, 'fadeTime', 0.1, 5, 0.05, 'fade out');

  const shape = folder.addFolder('1 · The cage');
  R(shape, c, 'strandCount', 2, MAX_STRANDS, 1, 'strands');
  R(shape, c, 'cageRadius', 0.2, 1.4, 0.01, 'radius (× circle)');
  R(shape, c, 'cageHeight', 0.3, 10, 0.05, 'height (m)');
  R(shape, c, 'cageApex', 0.2, 1.57, 0.01, 'climb (rad)');
  R(shape, c, 'cageArch', 0.2, 3, 0.01, 'flat ↔ pointed crown');
  R(shape, c, 'sweep', -6, 6, 0.01, 'sweep round (rad)');
  R(shape, c, 'crossings', 0, 20, 0.5, 'over/under crossings');
  R(shape, c, 'weave', 0, 0.3, 0.005, 'weave depth (× radius)');
  R(shape, c, 'spin', -2, 2, 0.01, 'turn (rad/s)');
  R(shape, c, 'sway', 0, 0.5, 0.005, 'writhe (rad)');
  R(shape, c, 'swaySpeed', 0, 8, 0.05, 'writhe speed');
  R(shape, c, 'weaveStagger', 0, 1, 0.01, 'climb stagger');
  R(shape, c, 'weaveHeadGlow', 0, 8, 0.05, 'climbing tip glow');

  const strand = folder.addFolder('2 · Burning strand');
  R(strand, c, 'strandWidth', 0.005, 0.4, 0.005, 'radius (m)');
  R(strand, c, 'strandTaper', 0, 0.95, 0.01, 'crown taper');
  R(strand, c, 'strandIntensity', 0, 12, 0.05, 'intensity');
  R(strand, c, 'strandOpacity', 0, 1, 0.01, 'opacity');
  R(strand, c, 'coreSharpness', 0.5, 20, 0.1, 'white core sharpness');
  R(strand, c, 'pulseAmount', 0, 1, 0.01, 'heat pulses');
  R(strand, c, 'pulseScale', 0.2, 12, 0.05, 'pulse scale');
  R(strand, c, 'pulseSpeed', 0, 10, 0.05, 'pulse speed');
  R(strand, c, 'floorFade', 0.01, 2, 0.01, 'floor fade (m)');
  R(strand, c, 'strandSoftFade', 0.01, 1, 0.01, 'soft fade (m)');
  strand.addColor(c, 'colorStrandCore').name('white-hot core');
  strand.addColor(c, 'colorStrandBody').name('body');
  strand.addColor(c, 'colorStrandEdge').name('rim');

  const flame = folder.addFolder('3 · Flames');
  R(flame, c, 'flameWidth', 1, 10, 0.05, 'width (× strand)');
  R(flame, c, 'flameLick', 0, 2, 0.01, 'tongue reach (m)');
  R(flame, c, 'flameLickScale', 0.1, 8, 0.05, 'tongue scale');
  R(flame, c, 'flameNoise', 0, 1, 0.01, 'tearing');
  R(flame, c, 'flameNoiseScale', 0.1, 10, 0.05, 'tear scale');
  R(flame, c, 'flameSpeed', 0, 10, 0.05, 'stream speed');
  R(flame, c, 'flameIntensity', 0, 10, 0.05, 'intensity');
  R(flame, c, 'flameOpacity', 0, 1, 0.01, 'opacity');
  R(flame, c, 'flameSoftFade', 0.01, 2, 0.01, 'soft fade (m)');
  flame.addColor(c, 'colorFlameCore').name('core');
  flame.addColor(c, 'colorFlameBody').name('body');
  flame.addColor(c, 'colorFlameTip').name('tips');

  const embers = folder.addFolder('4 · Dripping embers');
  R(embers, c, 'dripRate', 0, 400, 1, 'embers / s');
  R(embers, c, 'dripSize', 0.01, 0.3, 0.005, 'size');
  R(embers, c, 'dripSpeed', 0, 5, 0.05, 'drop speed');
  R(embers, c, 'dripGravity', -30, 0, 0.1, 'gravity');
  R(embers, c, 'dripLifetime', 0.1, 3, 0.05, 'lifetime');
  R(embers, c, 'dripGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(embers, c, 'colorDrip', 'ember colour');

  const sparks = folder.addFolder('5 · Sparks & smoke');
  R(sparks, c, 'sparkRate', 0, 400, 1, 'sparks / s');
  R(sparks, c, 'sparkSize', 0.01, 0.3, 0.005, 'spark size');
  R(sparks, c, 'sparkRise', -2, 8, 0.05, 'spark rise');
  R(sparks, c, 'sparkLifetime', 0.1, 4, 0.05, 'spark lifetime');
  R(sparks, c, 'sparkGlow', 0, 8, 0.05, 'spark glow');
  Editor.gradient(sparks, c, 'colorSpark', 'spark colour');
  R(sparks, c, 'smokeRate', 0, 100, 1, 'smoke / s');
  R(sparks, c, 'smokeSize', 0.05, 4, 0.01, 'smoke size');
  R(sparks, c, 'smokeSpread', 0.5, 6, 0.05, 'smoke end size');
  R(sparks, c, 'smokeRise', -1, 4, 0.05, 'smoke rise');
  R(sparks, c, 'smokeLifetime', 0.1, 6, 0.05, 'smoke lifetime');
  R(sparks, c, 'smokeOpacity', 0, 1, 0.01, 'smoke opacity');
  R(sparks, c, 'smokeTurbulence', 0, 3, 0.01, 'smoke turbulence');
  Editor.gradient(sparks, c, 'colorSmoke', 'smoke colour');

  const floor = folder.addFolder('6 · Scorched ring');
  R(floor, c, 'floorOpacity', 0, 1, 0.01, 'opacity');
  R(floor, c, 'charWidth', 0.05, 2, 0.01, 'char width (m)');
  R(floor, c, 'charCreep', 0, 4, 0.05, 'char creeps in (m)');
  R(floor, c, 'charDarkness', 0, 1, 0.01, 'char darkness');
  R(floor, c, 'seamWidth', 0.005, 0.4, 0.005, 'seam width (m)');
  R(floor, c, 'seamGlow', 0, 10, 0.05, 'seam glow');
  R(floor, c, 'seamCrawl', 0, 4, 0.01, 'seam crawl');
  R(floor, c, 'poolSize', 0, 1.5, 0.01, 'anchor pools (m)');
  R(floor, c, 'poolGlow', 0, 10, 0.05, 'pool glow');
  R(floor, c, 'washGlow', 0, 1, 0.01, 'heat wash');
  R(floor, c, 'floorNoiseScale', 0.1, 6, 0.05, 'noise scale');
  R(floor, c, 'floorCool', 0, 1, 0.01, 'heat kept after collapse');
  floor.addColor(c, 'colorChar').name('char');
  floor.addColor(c, 'colorSeam').name('seam');
  floor.addColor(c, 'colorSeamHot').name('seam, hot');
  floor.addColor(c, 'colorWash').name('wash');

  const haze = folder.addFolder('7 · Heat haze');
  R(haze, c, 'hazeStrength', 0, 3, 0.01, 'strength');
  R(haze, c, 'hazeWidth', 0.2, 3, 0.01, 'width (× cage)');
  R(haze, c, 'hazeHeight', 0.2, 3, 0.01, 'height (× cage)');
  R(haze, c, 'hazeScale', 0.1, 8, 0.05, 'noise scale');
  R(haze, c, 'hazeSpeed', 0, 8, 0.05, 'rise speed');
  R(haze, c, 'hazeFalloff', 0.1, 4, 0.05, 'falloff');

  const trap = folder.addFolder('8 · The trapped');
  R(trap, c, 'trapReach', 0.2, 1.5, 0.01, 'reach (× cage)');
  R(trap, c, 'trapStain', 0, 1, 0.01, 'scorch stain');
  R(trap, c, 'trapStainTime', 0.05, 6, 0.05, 'stain over (s)');
  R(trap, c, 'trapRumble', 0, 0.3, 0.005, 'rumble while it burns');
  const look = trap.addFolder('Scorched look');
  look.addColor(c.look, 'color').name('body');
  look.addColor(c.look, 'rimColor').name('rim');
  R(look, c.look, 'rimEmissive', 0, 8, 0.05, 'rim glow');
  look.addColor(c.look, 'edgeColor').name('burn edge');
  R(look, c.look, 'edgeEmissive', 0, 8, 0.05, 'edge glow');
  R(look, c.look, 'edgeWidth', 0, 0.3, 0.005, 'edge width');

  const contract = folder.addFolder('9 · Contraction');
  R(contract, c, 'contractScale', 0, 1, 0.01, 'pulls in to (× radius)');
  R(contract, c, 'contractSquash', 0, 1, 0.01, 'slumps to (× height)');
  R(contract, c, 'contractSpin', 0, 20, 0.1, 'spins up (×)');
  R(contract, c, 'contractSurge', 0, 4, 0.05, 'burns whiter');
  R(contract, c, 'contractRumble', 0, 1, 0.01, 'rumble');

  const burst = folder.addFolder('10 · Collapse');
  R(burst, c, 'burstSize', 0.2, 10, 0.05, 'fire shell (m)');
  R(burst, c, 'burstLife', 0.05, 2, 0.01, 'shell life');
  R(burst, c, 'burstIntensity', 0, 8, 0.05, 'shell intensity');
  R(burst, c, 'burstOpacity', 0, 1, 0.01, 'shell opacity');
  R(burst, c, 'burstSquash', 0.1, 1.5, 0.01, 'shell squash');
  burst.addColor(c, 'colorBurstA').name('shell core');
  burst.addColor(c, 'colorBurstB').name('shell body');
  burst.addColor(c, 'colorBurstC').name('shell edge');
  R(burst, c, 'ringRadius', 0.5, 16, 0.05, 'shock ring (m)');
  R(burst, c, 'ringLife', 0.05, 2, 0.01, 'ring life');
  R(burst, c, 'ringWidth', 0.01, 0.4, 0.005, 'ring width');
  burst.addColor(c, 'colorRingA').name('ring');
  burst.addColor(c, 'colorRingB').name('ring, hot');
  R(burst, c, 'scorchRadius', 0.2, 8, 0.05, 'scorch (m)');
  R(burst, c, 'scorchLife', 0.2, 15, 0.1, 'scorch life');
  burst.addColor(c, 'colorScorch').name('scorch');
  burst.addColor(c, 'colorScorchEmber').name('scorch embers');
  R(burst, c, 'collapseSparks', 0, 600, 1, 'sparks');
  R(burst, c, 'collapseSparkSpeed', 0, 30, 0.1, 'spark speed');
  R(burst, c, 'collapseShake', 0, 1.5, 0.01, 'shake');
  R(burst, c, 'collapseFlash', 0, 1, 0.01, 'flash');
  burst.addColor(c, 'colorFlash').name('flash');
  R(burst, c, 'collapseLight', 0, 80, 0.5, 'light punch');

  const hit = burst.addFolder('Hits');
  R(hit, c, 'hitImpulse', 0, 25, 0.1, 'impulse');
  R(hit, c, 'hitLift', 0, 15, 0.1, 'lift');
  R(hit, c, 'hitSpin', 0, 6, 0.05, 'spin');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0.1, 8, 0.05, 'height (m)');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
}
