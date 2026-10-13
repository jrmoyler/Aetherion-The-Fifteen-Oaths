import { Mesh, Vector2, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createOrbitalGrid, createOrbitalGroundQuad } from '../../assets/codex/OrbitalStrikeGeometry.js';
import {
  createOrbitalLaserMaterial,
  createOrbitalReticleMaterial,
  createOrbitalColumnMaterial,
  createOrbitalCraterMaterial,
  createOrbitalWarpMaterial
} from '../../materials/codex/OrbitalStrikeMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'orbital';

/** Bodies the updraft can hold at once. */
const MAX_GRIPS = 16;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _at = new Vector3();
const _centre = new Vector3();
const _base = new Vector3();
const _sky = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * ORBITAL STRIKE — Tech, zone cast.
 *
 * A thin red laser comes down out of the sky and paints the circle; a
 * holographic reticle locks onto it; then a white-hot beam from orbit burns
 * it out and everything standing in it is lifted up the beam and vaporised.
 * Five beats on one clock that starts when the laser's spot reaches the edge:
 *
 *   1. **THE PAINT** (`paintTime`) — the spot circles the edge and the reticle
 *      is drawn behind it in an angular sweep: segmented rings, ticks, a
 *      crosshair, warning glyphs, a hex grid.
 *   2. **THE COUNTDOWN** (to `lockTime`) — the reticle tightens from
 *      `tightenFrom` onto the circle, its rings counter-rotating, a sweep
 *      counting down clockwise, the spot spiralling into the centre.
 *   3. **THE LOCK** — a chirp in the camera, the reticle flares and blinks, the
 *      laser fattens. `strikeDelay` of held breath.
 *   4. **THE STRIKE** (`strikeTime`) — the beam drops from orbit as a front in
 *      `beamDrop` seconds and lands: a fireball shell, a shockwave, debris, a
 *      flash and a heavy shake. Then it burns: three layered cylinders with
 *      energy pouring down them, leaning toward their source in the sky and
 *      wandering inside the circle, a heat bend round them, sparks sprayed off
 *      the splash, embers carried up the updraft, smoke rolling off the rim,
 *      and under it a molten crater spreading, hottest where the beam is now.
 *      Every body inside is killed, taken by the updraft (`carry`) and burnt
 *      away (`corrode` to white-hot, then `consume`) on its way up.
 *   5. **THE CUT** (`cutTime`) — the beam narrows to a thread and goes out.
 *      The crater crusts over through orange to dull red, its seams glowing
 *      longest, and erodes away over `lifetime`.
 *
 * ## Layers
 *
 *   - **laser** (`createOrbitalLaserMaterial`) — core + halo, from the sky.
 *   - **reticle** (`createOrbitalReticleMaterial`) — the ground hologram.
 *   - **column** (`createOrbitalColumnMaterial`) — core, mid and outer layers.
 *   - **heat bend** (`createOrbitalWarpMaterial`) — on `LAYER.DISTORTION`.
 *   - **crater** (`createOrbitalCraterMaterial`) — the ground treatment.
 *   - **particles** — sparks (STREAK), embers (SOFT, curl), smoke (SMOKE),
 *     debris (CHIP).
 *   - **impact** — FIRE burst, SHOCKWAVE + DUSTRING decals, flash, shake.
 *
 * ## The editor rule
 *
 * A cast keeps a seed, the paint's starting bearing and the integrated
 * phases (the rings' spins, the energy's flow, the pulses, the sweep's
 * wander). Every time, radius, height and colour is resolved from
 * `settings.orbital` every frame, so dragging `strikeTime` lengthens a burn
 * already in progress and dragging `beamRadius` fattens a beam already down.
 */
export class OrbitalStrikeAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The beam picks its own bodies, and holds them. */
  get handlesOwnHits() {
    return true;
  }

  /** Bodies in the updraft right now. HUD readout only. */
  get instanceCount() {
    return this._gripCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.quadGeometry = createOrbitalGroundQuad();
    this.craterMaterial = createOrbitalCraterMaterial();
    this.crater = this._mesh(this.quadGeometry, this.craterMaterial, 2, LAYER.VFX);
    this.reticleMaterial = createOrbitalReticleMaterial();
    this.reticle = this._mesh(this.quadGeometry, this.reticleMaterial, 6, LAYER.VFX);

    this.laserGeometry = createOrbitalGrid(10, 64);
    this.laserMaterial = createOrbitalLaserMaterial(false);
    this.laser = this._mesh(this.laserGeometry, this.laserMaterial, 14, LAYER.VFX);
    this.laserHaloMaterial = createOrbitalLaserMaterial(true);
    this.laserHalo = this._mesh(this.laserGeometry, this.laserHaloMaterial, 13, LAYER.VFX);

    this.columnGeometry = createOrbitalGrid(48, 96);
    this.outerMaterial = createOrbitalColumnMaterial('outer');
    this.outer = this._mesh(this.columnGeometry, this.outerMaterial, 10, LAYER.VFX);
    this.midMaterial = createOrbitalColumnMaterial('mid');
    this.mid = this._mesh(this.columnGeometry, this.midMaterial, 11, LAYER.VFX);
    this.coreMaterial = createOrbitalColumnMaterial('core');
    this.core = this._mesh(this.columnGeometry, this.coreMaterial, 12, LAYER.VFX);
    this.warpMaterial = createOrbitalWarpMaterial();
    this.warp = this._mesh(this.columnGeometry, this.warpMaterial, 0, LAYER.DISTORTION);

    /** Scratch state for the materials — one object apiece, reused. */
    this._laserState = { from: new Vector3(), to: new Vector3(), level: 0, width: 1, pulsePhase: 0, seed: 0 };
    this._reticleState = {
      centre: new Vector3(),
      radius: 4,
      spinO: 0,
      spinI: 0,
      sweep: 0,
      lock: 0,
      locked: false,
      paint: 0,
      paintAngle: 0,
      level: 0,
      burn: 0,
      dot: new Vector2(),
      dotLevel: 0,
      seed: 0
    };
    this._columnState = {
      base: new Vector3(),
      lean: new Vector3(),
      height: 45,
      radius: 1,
      front: 45,
      flow: 0,
      pulsePhase: 0,
      level: 0,
      strength: 0,
      seed: 0
    };
    this._craterState = {
      centre: new Vector3(),
      radius: 3,
      form: 0,
      heat: 0,
      beam: 0,
      spot: new Vector2(),
      spotR: 1,
      fadeT: 0,
      seed: 0
    };

    this._seed = 0;
    this._clock = -1;
    this._spinO = 0;
    this._spinI = 0;
    this._flow = 0;
    this._pulse = 0;
    this._laserPulse = 0;
    this._wander = 0;
    this._landed = false;
    this._locked = false;
    this._cutDone = false;
    this._spot = new Vector3();
    this._beamBase = new Vector3();
    this._beamOn = 0;
    this._lightMix = 0;

    this._grips = [];
    for (let i = 0; i < MAX_GRIPS; i++) this._grips.push({ dummy: null, time: 0 });
    this._gripCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    /** The updraft as a velocity field, bound once so `carry` never allocates. */
    this._field = (x, y, z, out) => this._updraft(x, y, z, out);
    this._draft = 1;
  }

  _mesh(geometry, material, order, layer) {
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.sparks = particles.get('orbital.sparks', {
      capacity: 3000,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.5;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uDrag.value = 1.2;

    this.embers = particles.get('orbital.embers', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.embers.uniforms.uSizeIn.value = 0.05;
    this.embers.uniforms.uFadeIn.value = 0.08;
    this.embers.uniforms.uFadeOut.value = 0.5;
    this.embers.uniforms.uEndSize.value = 0.3;
    this.embers.uniforms.uDrag.value = 0.5;
    this.embers.uniforms.uTurbFrequency.value = 0.6;
    this.embers.uniforms.uTurbSpeed.value = 0.9;

    this.smoke = particles.get('orbital.smoke', {
      capacity: 1200,
      shape: ParticleShape.SMOKE,
      additive: false,
      softFade: 1.0
    });
    this.smoke.uniforms.uSizeIn.value = 0.12;
    this.smoke.uniforms.uFadeIn.value = 0.12;
    this.smoke.uniforms.uFadeOut.value = 0.5;
    this.smoke.uniforms.uEndSize.value = 2.6;
    this.smoke.uniforms.uDrag.value = 0.7;

    this.debris = particles.get('orbital.debris', {
      capacity: 700,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.1
    });
    this.debris.uniforms.uSizeIn.value = 0.02;
    this.debris.uniforms.uFadeIn.value = 0.02;
    this.debris.uniforms.uFadeOut.value = 0.3;
    this.debris.uniforms.uEndSize.value = 0.8;
    this.debris.uniforms.uDrag.value = 0.3;

    this.sparkEmitter = new RateEmitter();
    this.emberEmitter = new RateEmitter();
    this.smokeEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing — seconds on the clock that starts when the spot lands       */
  /* ------------------------------------------------------------------ */

  _tPaint() {
    return Math.max(0.05, settings.orbital.paintTime);
  }

  _tLock() {
    return Math.max(this._tPaint() + 0.05, settings.orbital.lockTime);
  }

  _tStrike() {
    return this._tLock() + Math.max(0, settings.orbital.strikeDelay);
  }

  _tLand() {
    return this._tStrike() + Math.max(0.01, settings.orbital.beamDrop);
  }

  _tCut() {
    return this._tLand() + Math.max(0.05, settings.orbital.strikeTime * settings.global.lifetime);
  }

  _tEnd() {
    return this._tCut() + Math.max(0.05, settings.orbital.cutTime);
  }

  get impactDuration() {
    return this._tEnd();
  }

  get fadeDuration() {
    return Math.max(0.2, settings.orbital.lifetime * settings.global.lifetime);
  }

  /** The beam gutters; the targeting light is steady. */
  lightShimmer() {
    const f = settings.orbital.lightFlicker * settings.global.randomness * this._beamOn;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 37.0) * Math.sin(this.age * 13.3 + 0.4));
  }

  /** As the base, but the colour slides from the targeting red to the beam's white. */
  _updateLight(dt, scale) {
    if (!this.light) return;
    const c = settings.orbital;
    this.lightColor.copy(getColor(c.lightColor)).lerp(getColor(c.beamLightColor), this._lightMix);
    this.ctx.lights.set(
      this.light,
      this.position,
      this.lightColor,
      c.lightIntensity * scale * this.lightShimmer() + this.lightBoost,
      c.lightRadius * (1 + this.lightBoost * 0.02 + this._beamOn * 0.6),
      dt
    );
    this.lightBoost = Math.max(0, this.lightBoost - this.lightBoost * 4.5 * dt - 0.5 * dt);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    this._clock = -1;
    this._spinO = Math.random() * TAU;
    this._spinI = Math.random() * TAU;
    this._flow = 0;
    this._pulse = 0;
    this._laserPulse = 0;
    this._wander = Math.random() * TAU;
    this._landed = false;
    this._locked = false;
    this._cutDone = false;
    this._beamOn = 0;
    this._lightMix = 0;
    this._releaseGrips();
    this.sparkEmitter.reset();
    this.emberEmitter.reset();
    this.smokeEmitter.reset();

    this.pointAt(1, _centre);
    this._spot.copy(this.origin);
    this._beamBase.copy(_centre);
    // The paint starts at the edge nearest the caster.
    this._reticleState.paintAngle = Math.atan2(-this.direction.z, -this.direction.x);

    this.laser.visible = true;
    this.laserHalo.visible = true;
    this.reticle.visible = false;
    this.crater.visible = false;
    this.outer.visible = false;
    this.mid.visible = false;
    this.core.visible = false;
    this.warp.visible = false;
    this._sync(0);
  }

  _resetEmit(time) {
    _emit.position = _pos;
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.35;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.4;
    _emit.life = 1;
    _emit.lifeVariance = 0.3;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  /* ------------------------------------------------------------------ */
  /* Resolving the strike — every metre and second comes from here       */
  /* ------------------------------------------------------------------ */

  /** Where the orbit is: high over the circle, set back toward the caster. */
  _source(out) {
    const c = settings.orbital;
    this.pointAt(1, _centre);
    return out.copy(_centre).addScaledVector(this.direction, -c.skyLean).setY(c.skyHeight);
  }

  /** Radius of the reticle right now: tightening onto the circle. */
  _reticleRadius(clock) {
    const c = settings.orbital;
    const k = Easing.inOutCubic(saturate(clock / this._tLock()));
    return c.zoneRadius * lerp(Math.max(1, c.tightenFrom), 1, k);
  }

  /** Where the laser's spot is on the floor. */
  _spotAt(clock, out) {
    const c = settings.orbital;
    this.pointAt(1, _centre);
    if (clock < 0) {
      // Travel: running out from the caster to the near edge of the circle.
      const reach = Math.max(0, this.length - this._reticleRadius(0));
      return out.copy(this.origin).addScaledVector(this.direction, this.u * reach).setY(0);
    }
    const R = this._reticleRadius(clock);
    const paint = saturate(clock / this._tPaint());
    // Round the edge, then a spiral into the centre for the countdown.
    const spiral = Easing.inOutQuad(saturate((clock - this._tPaint()) / Math.max(0.05, this._tLock() - this._tPaint())));
    const a = this._reticleState.paintAngle + paint * Math.max(1, c.paintLaps) * TAU + spiral * TAU * 0.75;
    const r = R * (1 - spiral);
    return out.set(_centre.x + Math.cos(a) * r, 0, _centre.z + Math.sin(a) * r);
  }

  /** The beam's wander inside the circle, on the floor. */
  _beamAt(out) {
    const c = settings.orbital;
    this.pointAt(1, _centre);
    const amp = c.beamSweep * c.zoneRadius * smoothstep(0, 0.5, this._clock - this._tLand());
    const w = this._wander;
    return out.set(
      _centre.x + amp * Math.sin(w) * Math.cos(w * 0.37 + 1.1),
      0,
      _centre.z + amp * Math.sin(w * 0.71 + 2.3) * 0.8
    );
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _phases(dt) {
    const c = settings.orbital;
    const g = settings.global;
    const anim = g.animationSpeed;
    // Spin harder as the count runs down.
    const urgency = this._clock < 0 ? 1 : 1 + 2.5 * saturate(this._clock / this._tLock());
    this._spinO += c.spinOuter * urgency * dt * anim;
    this._spinI += c.spinInner * urgency * dt * anim;
    this._flow += c.energyFlow * dt * g.noiseSpeed;
    this._pulse += c.pulseSpeed * dt * g.noiseSpeed;
    this._laserPulse += c.laserPulseSpeed * dt * g.noiseSpeed;
    this._wander += c.sweepSpeed * dt * anim;
  }

  _sync(dt) {
    const c = settings.orbital;
    const g = settings.global;
    this._phases(dt);
    const clock = this._clock;
    this.pointAt(1, _centre);
    _centre.y = 0;
    const exit = this.phase === AbilityPhase.FADE ? saturate(this.fadeTime / this.fadeDuration) : 0;

    /* ---- the targeting laser ---- */
    this._spotAt(clock, this._spot);
    const ls = this._laserState;
    this._source(ls.from);
    ls.to.copy(this._spot);
    ls.seed = this._seed;
    ls.pulsePhase = this._laserPulse;
    let laserLevel = smoothstep(0, 0.15, this.age);
    let laserWidth = 1;
    if (clock >= this._tLock()) {
      // Locked: it fattens and blinks; then the beam takes over.
      const sinceLock = clock - this._tLock();
      laserWidth = 1 + 1.6 * Math.exp(-sinceLock * 5);
      laserLevel *= 0.75 + 0.25 * (Math.sin(sinceLock * 60) > 0 ? 1 : 0);
      laserLevel *= 1 - smoothstep(this._tStrike(), this._tLand(), clock);
    }
    ls.level = laserLevel;
    ls.width = laserWidth;
    this.laserMaterial.userData.sync(ls);
    this.laserHaloMaterial.userData.sync(ls);
    this.laser.visible = laserLevel > 0.002;
    this.laserHalo.visible = this.laser.visible;

    /* ---- the reticle ---- */
    const rs = this._reticleState;
    rs.centre.copy(_centre);
    rs.seed = this._seed;
    rs.spinO = this._spinO;
    rs.spinI = this._spinI;
    rs.radius = this._reticleRadius(Math.max(0, clock));
    rs.dot.set(this._spot.x - _centre.x, this._spot.z - _centre.z);
    rs.dotLevel = laserLevel;
    if (clock < 0) {
      rs.level = 0;
      rs.paint = 0;
    } else {
      rs.paint = saturate((clock / this._tPaint()) * Math.max(1, c.paintLaps));
      rs.sweep = saturate((clock - this._tPaint()) / Math.max(0.05, this._tLock() - this._tPaint()));
      rs.locked = clock >= this._tLock();
      rs.lock = rs.locked ? Math.exp(-(clock - this._tLock()) * 6) : 0;
      rs.burn = saturate((clock - this._tLand()) / 0.45);
      rs.level = smoothstep(0, 0.1, clock) * (1 - smoothstep(0.6, 1, rs.burn));
    }
    this.reticleMaterial.userData.sync(rs);
    // The dot shows during travel even before the reticle exists.
    this.reticle.visible = rs.level > 0.002 || rs.dotLevel > 0.002;
    if (clock < 0) rs.level = 0;

    /* ---- the column ---- */
    const cs = this._columnState;
    let level = 0;
    let radius = c.beamRadius;
    let front = c.skyHeight;
    if (clock >= this._tStrike()) {
      front = c.skyHeight * (1 - Easing.inQuad(saturate((clock - this._tStrike()) / Math.max(0.01, c.beamDrop))));
      level = 1;
      if (clock >= this._tCut()) {
        const ct = saturate((clock - this._tCut()) / Math.max(0.05, c.cutTime));
        radius = lerp(c.beamRadius, Math.max(0.002, c.threadWidth / Math.max(0.05, c.coreFrac)), Easing.outCubic(ct));
        level = 1 - smoothstep(0.7, 1, ct);
      }
      // The drop starts thin and fattens as it lands.
      radius *= lerp(0.35, 1, smoothstep(this._tStrike(), this._tLand() + 0.08, clock));
    }
    if (this.phase === AbilityPhase.FADE) level = 0;
    this._beamOn = level;
    this._lightMix = Math.max(this._lightMix, level > 0 ? 1 : 0) * (1 - exit);
    this._beamAt(this._beamBase);
    this._source(_sky);
    cs.base.copy(this._beamBase);
    cs.lean.set(_sky.x - this._beamBase.x, 0, _sky.z - this._beamBase.z);
    cs.height = c.skyHeight;
    cs.radius = radius;
    cs.front = Math.max(0, front);
    cs.flow = this._flow;
    cs.pulsePhase = this._pulse;
    cs.seed = this._seed;
    cs.strength = level;
    const cutT = clock >= this._tCut() ? saturate((clock - this._tCut()) / Math.max(0.05, c.cutTime)) : 0;
    cs.level = level;
    this.coreMaterial.userData.sync(cs);
    cs.level = level * (1 - cutT * 0.6);
    this.midMaterial.userData.sync(cs);
    cs.level = level * (1 - cutT);
    this.outerMaterial.userData.sync(cs);
    this.warpMaterial.userData.sync(cs);
    const beamVisible = level > 0.002;
    this.core.visible = beamVisible;
    this.mid.visible = beamVisible;
    this.outer.visible = beamVisible;
    this.warp.visible = beamVisible;

    /* ---- the crater ---- */
    const cr = this._craterState;
    cr.centre.copy(_centre);
    cr.radius = c.zoneRadius * c.craterRadius;
    cr.seed = this._seed;
    if (clock >= this._tLand()) {
      cr.form = Easing.outCubic(saturate((clock - this._tLand()) / Math.max(0.05, c.craterGrow)));
      const sinceCut = clock - this._tCut();
      cr.heat = sinceCut <= 0 ? smoothstep(0, 0.3, clock - this._tLand()) : Math.exp(-sinceCut / Math.max(0.05, c.coolTime * g.lifetime));
      cr.beam = level;
      cr.spot.set(this._beamBase.x - _centre.x, this._beamBase.z - _centre.z);
      cr.spotR = Math.max(0.1, radius);
      cr.fadeT = smoothstep(0.45, 1, exit);
      this.crater.visible = true;
    } else {
      cr.form = 0;
      cr.heat = 0;
      cr.beam = 0;
      cr.fadeT = 0;
      this.crater.visible = false;
    }
    this.craterMaterial.userData.sync(cr);

    this._syncParticles();
  }

  _syncParticles() {
    const c = settings.orbital;
    const g = settings.global;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    const sp = this.sparks.uniforms;
    sp.uStretch.value = c.sparkStretch;
    sp.uGravity.value.set(0, c.sparkGravity, 0);
    sp.uSizeScale.value = g.particleSize;
    sp.uLifeScale.value = g.particleLifetime;
    sp.uSpeedScale.value = g.particleSpeed;
    sp.uOpacity.value = g.opacity;
    sp.uGlow.value = c.sparkGlow * g.glow;
    sp.uTurbulence.value = 0.15 * g.turbulence;

    this.embers.setGradient(getColor(c.colorEmberA), getColor(c.colorEmberB), getColor(c.colorEmberC), getColor(c.colorEmberD));
    const em = this.embers.uniforms;
    em.uGravity.value.set(0, 0, 0);
    em.uSizeScale.value = g.particleSize;
    em.uLifeScale.value = g.particleLifetime;
    em.uSpeedScale.value = g.particleSpeed;
    em.uOpacity.value = g.opacity;
    em.uGlow.value = c.emberGlow * g.glow;
    em.uTurbulence.value = 1.2 * g.turbulence;

    this.smoke.setGradient(getColor(c.colorSmokeA), getColor(c.colorSmokeB), getColor(c.colorSmokeC), getColor(c.colorSmokeD));
    const sm = this.smoke.uniforms;
    sm.uGravity.value.set(0, c.smokeRise * 0.25, 0);
    sm.uSizeScale.value = g.particleSize;
    sm.uLifeScale.value = g.particleLifetime;
    sm.uSpeedScale.value = g.particleSpeed;
    sm.uOpacity.value = c.smokeOpacity * g.opacity;
    sm.uTurbulence.value = 0.8 * g.turbulence;

    this.debris.setGradient(getColor(c.colorDebrisA), getColor(c.colorDebrisB), getColor(c.colorDebrisC), getColor(c.colorDebrisD));
    const de = this.debris.uniforms;
    de.uGravity.value.set(0, -16, 0);
    de.uSizeScale.value = g.particleSize;
    de.uLifeScale.value = g.particleLifetime;
    de.uSpeedScale.value = g.particleSpeed;
    de.uOpacity.value = g.opacity;
    de.uTurbulence.value = 0.05 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._clock = -1;
    this._sync(dt);
    this.position.copy(this._spot).setY(settings.orbital.lightHeight * 0.4);
  }

  onImpact() {
    this._clock = 0;
    this.reticle.visible = true;
    this.lightBoost = settings.orbital.lightIntensity * 0.4;
  }

  onFade(dt) {
    const c = settings.orbital;
    const g = settings.global;
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;
    const clock = this._clock;

    if (!this._locked && clock >= this._tLock()) this._lock();
    if (!this._landed && clock >= this._tLand()) this._land();

    this._sync(dt);

    const burning = this._landed && clock < this._tEnd() && this.phase !== AbilityPhase.FADE;
    if (burning) {
      const cutT = clock >= this._tCut() ? saturate((clock - this._tCut()) / Math.max(0.05, c.cutTime)) : 0;
      const strength = 1 - cutT;
      this._burnFx(dt, strength);
      if (clock < this._tCut()) this._takeBodies();
      this._lift(dt, strength);
      this.ctx.shake.rumble(c.strikeRumble * strength * g.cameraShake, dt);
      this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.strikeLight * strength * g.explosionIntensity);
    } else if (this._locked && !this._landed) {
      this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.lockLight);
    }
    if (!this._cutDone && (clock >= this._tEnd() || this.phase === AbilityPhase.FADE)) this._cut();
    if (this._landed && !burning) this._coolFx(dt);

    // The light follows the spot, then the beam, then settles on the crater.
    if (!this._landed) this.position.copy(this._spot).setY(c.lightHeight * 0.4);
    else if (burning) this.position.copy(this._beamBase).setY(c.lightHeight);
    else {
      this.pointAt(1, _centre);
      this.position.set(_centre.x, c.lightHeight * 0.4, _centre.z);
    }
  }

  /** The lock: a chirp, a flare. */
  _lock() {
    const c = settings.orbital;
    const g = settings.global;
    this._locked = true;
    this.ctx.shake.add(c.lockShake * g.cameraShake, 9, c.chirpFreq);
    this.lightBoost = c.lightIntensity * c.lockLight * 1.5;
  }

  /** The beam reaches the floor. */
  _land() {
    const c = settings.orbital;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._landed = true;
    this.pointAt(1, _centre);
    _centre.y = 0;

    this.ctx.bursts.spawn(BurstMode.FIRE, _pos.copy(_centre).setY(0.6), {
      radius: c.beamRadius * 0.6,
      endRadius: c.burstSize * power,
      life: 0.7,
      intensity: c.burstIntensity,
      opacity: 0.9 * g.opacity,
      fresnel: 1.6 * g.fresnel,
      displace: 0.45,
      turbulence: g.turbulence,
      squash: 0.55,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.shockRadius * power,
      life: 0.8,
      width: 0.06,
      intensity: 1.2,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.035
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: c.zoneRadius * 1.4,
      life: 1.6,
      intensity: 0.8,
      colorA: getColor(c.colorSmokeC),
      colorB: getColor(c.colorSmokeA)
    });

    this._resetEmit(time);
    _pos.copy(_centre).setY(0.3);
    _emit.position = _pos;
    _emit.radius = c.beamRadius * 0.8;
    _emit.direction = _up;
    _emit.speed = c.debrisSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.8;
    _emit.size = c.debrisSize;
    _emit.sizeVariance = 0.6;
    _emit.life = c.debrisLife;
    _emit.spin = 8;
    this.debris.emit(Math.round(c.debrisCount * g.particleCount), _emit);

    _emit.speed = c.sparkSpeed * 1.4;
    _emit.spread = 1.0;
    _emit.size = c.sparkSize * 1.3;
    _emit.life = c.sparkLife * 1.4;
    _emit.spin = 0;
    this.sparks.emit(Math.round(c.sparkRate * 0.35 * g.particleCount), _emit);

    this.ctx.shake.add(c.impactShake * power * g.cameraShake, 1 / Math.max(0.05, c.shakeDuration), 16);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.lightIntensity * c.strikeLight * 1.6 * power;

    this._takeBodies();
  }

  /** The beam goes out. */
  _cut() {
    const c = settings.orbital;
    const g = settings.global;
    this._cutDone = true;
    this._releaseGrips();
    if (!this._landed) return;
    this.ctx.shake.add(c.cutShake * g.cameraShake, 6, 30);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.cutFlash * g.explosionIntensity);
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Sparks off the splash, embers up the updraft, smoke off the rim. */
  _burnFx(dt, strength) {
    const c = settings.orbital;
    const g = settings.global;
    const time = frame.uTime.value;
    const base = this._beamBase;
    const R = this._columnState.radius * (1 + c.beamFlare * 0.6);

    const sparks = Math.round(this.sparkEmitter.tick(dt, c.sparkRate * strength) * g.particleCount);
    if (sparks > 0) {
      this._resetEmit(time);
      _emit.size = c.sparkSize;
      _emit.life = c.sparkLife;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.2;
      for (let n = 0; n < sparks; n++) {
        const a = Math.random() * TAU;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        _pos.set(base.x + ca * R * 0.8, 0.12, base.z + sa * R * 0.8);
        // Sprayed out low off the splash, as off a cutting torch.
        _dir.set(ca, 0.35 + Math.random() * 0.6, sa).normalize();
        _emit.position = _pos;
        _emit.direction = _dir;
        _emit.speed = c.sparkSpeed;
        this.sparks.emit(1, _emit);
      }
    }

    const embers = Math.round(this.emberEmitter.tick(dt, c.emberRate * strength) * g.particleCount);
    if (embers > 0) {
      this._resetEmit(time);
      _emit.size = c.emberSize;
      _emit.life = c.emberLife;
      _emit.speedVariance = 0.4;
      _emit.spread = 0.15;
      _emit.direction = _up;
      _emit.speed = c.emberRise;
      for (let n = 0; n < embers; n++) {
        const a = Math.random() * TAU;
        const rr = Math.sqrt(Math.random()) * Math.max(R * 1.4, c.zoneRadius * 0.7);
        _pos.set(base.x + Math.cos(a) * rr, 0.2 + Math.random() * 0.5, base.z + Math.sin(a) * rr);
        _emit.position = _pos;
        this.embers.emit(1, _emit);
      }
    }

    this._smokeFx(dt, strength);
  }

  /** After the cut: the crater still smokes as it cools. */
  _coolFx(dt) {
    const c = settings.orbital;
    const heat = this._craterState.heat * (1 - this._craterState.fadeT);
    this._smokeFx(dt, heat * 0.5);
    // A few last embers lifting off the cooling pool.
    const embers = Math.round(this.emberEmitter.tick(dt, c.emberRate * 0.15 * heat) * settings.global.particleCount);
    if (embers <= 0) return;
    this.pointAt(1, _centre);
    this._resetEmit(frame.uTime.value);
    _emit.size = c.emberSize * 0.8;
    _emit.life = c.emberLife * 0.8;
    _emit.direction = _up;
    _emit.speed = c.emberRise * 0.25;
    _emit.spread = 0.3;
    const R = c.zoneRadius * c.craterRadius * c.moltenFrac;
    for (let n = 0; n < embers; n++) {
      const a = Math.random() * TAU;
      const rr = Math.sqrt(Math.random()) * R;
      _pos.set(_centre.x + Math.cos(a) * rr, 0.1, _centre.z + Math.sin(a) * rr);
      _emit.position = _pos;
      this.embers.emit(1, _emit);
    }
  }

  _smokeFx(dt, strength) {
    const c = settings.orbital;
    const g = settings.global;
    const count = Math.round(this.smokeEmitter.tick(dt, c.smokeRate * strength) * g.particleCount);
    if (count <= 0) return;
    this.pointAt(1, _centre);
    this._resetEmit(frame.uTime.value);
    _emit.size = c.smokeSize;
    _emit.sizeVariance = 0.5;
    _emit.life = c.smokeLife;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0.5;
    _emit.spread = 0.15;
    _emit.speedVariance = 0.4;
    const R = c.zoneRadius * c.craterRadius;
    for (let n = 0; n < count; n++) {
      const a = Math.random() * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      _pos.set(_centre.x + ca * R * (0.85 + Math.random() * 0.3), 0.3, _centre.z + sa * R * (0.85 + Math.random() * 0.3));
      _dir.set(ca * c.smokeSpread, c.smokeRise, sa * c.smokeSpread);
      const sp = _dir.length();
      _emit.position = _pos;
      _emit.direction = _dir.divideScalar(Math.max(1e-4, sp));
      _emit.speed = sp;
      this.smoke.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Vaporise                                                            */
  /* ------------------------------------------------------------------ */

  /** Kill every standing body inside the circle and give it to the updraft. */
  _takeBodies() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings.orbital;
    const g = settings.global;
    this.pointAt(1, _centre);
    const found = field.findTargets(_centre.x, _centre.z, c.zoneRadius * c.killFrac, this._found);
    if (found.length === 0) return;
    this._force.impulse = c.hitImpulse * g.explosionIntensity;
    this._force.lift = c.hitLift * g.explosionIntensity;
    this._force.spin = c.hitSpin;
    for (let f = 0; f < found.length; f++) {
      const dummy = found[f];
      _dir.set(dummy.position.x - _centre.x, 0, dummy.position.z - _centre.z);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      _dir.normalize();
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      if (this._gripCount < MAX_GRIPS) {
        const slot = this._grips[this._gripCount++];
        slot.dummy = dummy;
        slot.time = 0;
      }
    }
    this._found.length = 0;
  }

  /**
   * The updraft as a velocity field: up the column, fading out toward the
   * ceiling, drawn in toward the axis and wound round it.
   */
  _updraft(x, y, z, out) {
    const c = settings.orbital;
    const base = this._beamBase;
    const rx = x - base.x;
    const rz = z - base.z;
    const r = Math.max(1e-3, Math.hypot(rx, rz));
    const climb = c.updraft * (1 - saturate(y / Math.max(0.5, c.updraftCeiling))) * this._draft;
    const pull = c.pullIn * this._draft * Math.min(1, r);
    const swirl = c.swirl * this._draft;
    out.set((-rx / r) * pull - (rz / r) * swirl, climb, (-rz / r) * pull + (rx / r) * swirl);
  }

  _lift(dt, strength) {
    if (dt <= 0 || this._gripCount === 0) return;
    const c = settings.orbital;
    this._draft = strength;
    const grab = saturate(c.grab * dt);
    for (let i = this._gripCount - 1; i >= 0; i--) {
      const slot = this._grips[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished || !dummy.bodyPoint(_at)) {
        this._dropGrip(i);
        continue;
      }
      slot.time += dt;
      // Eased in, so a body is taken by the air rather than snapped onto it.
      const wound = Easing.outCubic(saturate(slot.time / 0.4)) * strength;
      dummy.carry(this._field, grab * wound, grab * wound, saturate(c.buoyancy * wound));
      dummy.corrode(saturate(slot.time / Math.max(0.05, c.stainTime)), c.look);
      dummy.consume(saturate((slot.time - c.stainTime * 0.5) / Math.max(0.05, c.vaporiseTime)));
    }
  }

  _dropGrip(i) {
    const last = this._gripCount - 1;
    const slot = this._grips[i];
    slot.dummy?.release();
    slot.dummy = this._grips[last].dummy;
    slot.time = this._grips[last].time;
    this._grips[last].dummy = null;
    this._gripCount = last;
  }

  _releaseGrips() {
    for (let i = 0; i < this._gripCount; i++) {
      this._grips[i].dummy?.release();
      this._grips[i].dummy = null;
    }
    this._gripCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._releaseGrips();
    this.laser.visible = false;
    this.laserHalo.visible = false;
    this.reticle.visible = false;
    this.crater.visible = false;
    this.outer.visible = false;
    this.mid.visible = false;
    this.core.visible = false;
    this.warp.visible = false;
  }

  dispose() {
    this.quadGeometry.dispose();
    this.laserGeometry.dispose();
    this.columnGeometry.dispose();
    this.craterMaterial.dispose();
    this.reticleMaterial.dispose();
    this.laserMaterial.dispose();
    this.laserHaloMaterial.dispose();
    this.outerMaterial.dispose();
    this.midMaterial.dispose();
    this.coreMaterial.dispose();
    this.warpMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1F6F0}  Orbital Strike');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 120, 0.5, 'laser runs out (m/s)');
  R(cast, c, 'zoneRadius', 0.5, 12, 0.05, 'circle radius (m)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'crater cools over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);
  cast.addColor(c, 'colorA').name('accent');
  cast.addColor(c, 'colorB').name('white-hot');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('targeting colour');
  light.addColor(c, 'beamLightColor').name('beam colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'beam gutter');
  R(light, c, 'lockLight', 0, 6, 0.05, 'locked (× intensity)');
  R(light, c, 'strikeLight', 0, 20, 0.05, 'burning (× intensity)');
  R(light, c, 'lightHeight', 0.2, 10, 0.05, 'height (m)');

  const laser = folder.addFolder('1 · Targeting laser');
  R(laser, c, 'skyHeight', 5, 120, 0.5, 'source height (m)');
  R(laser, c, 'skyLean', -30, 30, 0.1, 'source set back (m)');
  R(laser, c, 'laserWidth', 0.002, 0.2, 0.001, 'radius (m)');
  R(laser, c, 'laserGlow', 0, 20, 0.05, 'glow');
  R(laser, c, 'laserFlicker', 0, 1, 0.01, 'stutter');
  R(laser, c, 'laserPulseScale', 0, 3, 0.01, 'pulses / m');
  R(laser, c, 'laserPulseSpeed', -40, 40, 0.1, 'pulse speed');
  R(laser, c, 'laserDot', 0.02, 1.5, 0.005, 'spot radius (m)');
  R(laser, c, 'paintTime', 0.05, 3, 0.01, 'paints the edge over (s)');
  R(laser, c, 'paintLaps', 1, 4, 0.05, 'laps');
  laser.addColor(c, 'colorLaserCore').name('core');
  laser.addColor(c, 'colorLaser').name('laser');

  const ret = folder.addFolder('2 · Reticle');
  R(ret, c, 'lockTime', 0.1, 5, 0.01, 'locks after (s)');
  R(ret, c, 'tightenFrom', 1, 4, 0.01, 'starts wider (×)');
  R(ret, c, 'reticleGlow', 0, 10, 0.05, 'glow');
  R(ret, c, 'reticleOpacity', 0, 1, 0.01, 'opacity');
  R(ret, c, 'ringWidth', 0.005, 0.3, 0.001, 'line width (m)');
  R(ret, c, 'innerRing', 0.1, 0.95, 0.005, 'inner ring (×)');
  R(ret, c, 'segments', 1, 24, 1, 'outer segments');
  R(ret, c, 'segmentGap', 0, 0.8, 0.005, 'segment gap');
  R(ret, c, 'spinOuter', -6, 6, 0.01, 'outer spin (rad/s)');
  R(ret, c, 'spinInner', -6, 6, 0.01, 'inner spin (rad/s)');
  R(ret, c, 'ticks', 4, 180, 1, 'ticks');
  R(ret, c, 'tickLength', 0, 1.5, 0.005, 'tick length (m)');
  R(ret, c, 'sweepOpacity', 0, 1, 0.01, 'countdown sweep');
  R(ret, c, 'glyphCount', 0, 8, 1, 'warning glyphs');
  R(ret, c, 'glyphSize', 0.05, 2, 0.01, 'glyph size (m)');
  R(ret, c, 'glyphRadius', 0.1, 1.2, 0.005, 'glyphs at (×)');
  R(ret, c, 'glyphBlink', 0, 20, 0.1, 'glyph blink (Hz)');
  R(ret, c, 'crossGap', 0, 0.9, 0.005, 'crosshair gap (×)');
  R(ret, c, 'gridOpacity', 0, 1, 0.01, 'hex grid');
  R(ret, c, 'lockFlash', 0, 5, 0.05, 'lock flare');
  R(ret, c, 'lockBlink', 0, 40, 0.5, 'lock blink (Hz)');
  R(ret, c, 'lockShake', 0, 1, 0.005, 'lock chirp');
  R(ret, c, 'chirpFreq', 1, 80, 0.5, 'chirp frequency');
  ret.addColor(c, 'colorReticle').name('reticle');
  ret.addColor(c, 'colorReticleHot').name('hot');
  ret.addColor(c, 'colorReticleDeep').name('deep');

  const beam = folder.addFolder('3 · Beam');
  const time = beam.addFolder('Timing');
  R(time, c, 'strikeDelay', 0, 2, 0.01, 'held breath (s)');
  R(time, c, 'beamDrop', 0.01, 1, 0.005, 'drops from orbit (s)');
  R(time, c, 'strikeTime', 0.1, 8, 0.05, 'burns for (s)');
  R(time, c, 'cutTime', 0.05, 2, 0.01, 'narrows over (s)');
  const shape = beam.addFolder('Shape');
  R(shape, c, 'beamRadius', 0.1, 6, 0.01, 'radius (m)');
  R(shape, c, 'coreFrac', 0.02, 1, 0.005, 'core (×)');
  R(shape, c, 'midFrac', 0.05, 1, 0.005, 'middle (×)');
  R(shape, c, 'beamFlare', 0, 3, 0.01, 'floor flare (×)');
  R(shape, c, 'flareHeight', 0.05, 8, 0.05, 'flare height (m)');
  R(shape, c, 'beamSweep', 0, 1, 0.005, 'wander (× circle)');
  R(shape, c, 'sweepSpeed', 0, 8, 0.01, 'wander speed');
  R(shape, c, 'beamPulse', 0, 0.6, 0.005, 'breathing');
  R(shape, c, 'pulseSpeed', 0, 80, 0.5, 'breath speed');
  R(shape, c, 'threadWidth', 0.002, 0.5, 0.001, 'thread radius (m)');
  R(shape, c, 'softFade', 0.01, 3, 0.01, 'soft against floor (m)');
  const look = beam.addFolder('Shading');
  R(look, c, 'coreGlow', 0, 30, 0.1, 'core glow');
  R(look, c, 'midGlow', 0, 15, 0.05, 'middle glow');
  R(look, c, 'outerGlow', 0, 10, 0.05, 'outer glow');
  R(look, c, 'outerOpacity', 0, 1, 0.01, 'outer opacity');
  R(look, c, 'energyScale', 0.05, 6, 0.01, 'energy scale');
  R(look, c, 'energyFlow', -80, 80, 0.5, 'energy pours (m/s)');
  R(look, c, 'energyContrast', 0, 1, 0.01, 'energy contrast');
  look.addColor(c, 'colorBeamCore').name('core');
  look.addColor(c, 'colorBeamMid').name('middle');
  look.addColor(c, 'colorBeamOuter').name('outer');
  look.addColor(c, 'colorBeamRim').name('rim');
  const warp = beam.addFolder('Heat bend');
  R(warp, c, 'warpStrength', 0, 4, 0.01, 'strength');
  R(warp, c, 'warpWidth', 1, 5, 0.01, 'width (× radius)');
  R(warp, c, 'warpScale', 0.1, 6, 0.01, 'noise scale');
  R(warp, c, 'warpSpeed', 0, 20, 0.05, 'noise speed');

  const crater = folder.addFolder('4 · Crater');
  R(crater, c, 'craterRadius', 0.1, 1.5, 0.005, 'radius (× circle)');
  R(crater, c, 'craterGrow', 0.05, 4, 0.01, 'spreads over (s)');
  R(crater, c, 'moltenFrac', 0.05, 0.98, 0.005, 'molten pool (×)');
  R(crater, c, 'craterCells', 0.2, 8, 0.01, 'crust cells / m');
  R(crater, c, 'craterGlow', 0, 15, 0.05, 'molten glow');
  R(crater, c, 'crackGlow', 0, 10, 0.05, 'seam glow');
  R(crater, c, 'rimWidth', 0.01, 0.6, 0.005, 'rim (×)');
  R(crater, c, 'scorchRadius', 1.01, 3, 0.01, 'scorch (×)');
  R(crater, c, 'scorchOpacity', 0, 1, 0.01, 'scorch opacity');
  R(crater, c, 'coolTime', 0.1, 8, 0.05, 'crusts over (s)');
  crater.addColor(c, 'colorMoltenHot').name('white-hot');
  crater.addColor(c, 'colorMoltenWarm').name('molten');
  crater.addColor(c, 'colorMoltenCool').name('cooling');
  crater.addColor(c, 'colorCrust').name('crust');
  crater.addColor(c, 'colorScorch').name('scorch');
  crater.addColor(c, 'colorRim').name('rim');

  const parts = folder.addFolder('5 · Sparks, embers, smoke');
  R(parts, c, 'sparkRate', 0, 2000, 1, 'sparks / s');
  R(parts, c, 'sparkSpeed', 0, 40, 0.1, 'spark speed');
  R(parts, c, 'sparkSize', 0.005, 0.3, 0.001, 'spark width');
  R(parts, c, 'sparkLife', 0.05, 3, 0.01, 'spark lifetime');
  R(parts, c, 'sparkStretch', 0, 1, 0.005, 'spark stretch');
  R(parts, c, 'sparkGravity', -40, 0, 0.5, 'spark gravity');
  R(parts, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  Editor.gradient(parts, c, 'colorSpark', 'spark gradient');
  R(parts, c, 'emberRate', 0, 1000, 1, 'embers / s');
  R(parts, c, 'emberSize', 0.005, 0.4, 0.001, 'ember size');
  R(parts, c, 'emberRise', 0, 30, 0.1, 'ember rise (m/s)');
  R(parts, c, 'emberLife', 0.1, 5, 0.05, 'ember lifetime');
  R(parts, c, 'emberGlow', 0, 10, 0.05, 'ember glow');
  Editor.gradient(parts, c, 'colorEmber', 'ember gradient');
  R(parts, c, 'smokeRate', 0, 300, 1, 'smoke / s');
  R(parts, c, 'smokeSize', 0.1, 4, 0.01, 'smoke size');
  R(parts, c, 'smokeRise', 0, 8, 0.05, 'smoke rise (m/s)');
  R(parts, c, 'smokeSpread', 0, 8, 0.05, 'smoke spread (m/s)');
  R(parts, c, 'smokeLife', 0.2, 8, 0.05, 'smoke lifetime');
  R(parts, c, 'smokeOpacity', 0, 1, 0.01, 'smoke opacity');
  Editor.gradient(parts, c, 'colorSmoke', 'smoke gradient');
  R(parts, c, 'debrisCount', 0, 300, 1, 'debris');
  R(parts, c, 'debrisSpeed', 0, 40, 0.1, 'debris speed');
  R(parts, c, 'debrisSize', 0.01, 0.6, 0.005, 'debris size');
  R(parts, c, 'debrisLife', 0.1, 5, 0.05, 'debris lifetime');
  Editor.gradient(parts, c, 'colorDebris', 'debris gradient');

  const hit = folder.addFolder('6 · The hit');
  R(hit, c, 'burstSize', 0, 16, 0.05, 'fireball (m)');
  R(hit, c, 'burstIntensity', 0, 6, 0.01, 'fireball brightness');
  R(hit, c, 'shockRadius', 0, 24, 0.1, 'shockwave (m)');
  R(hit, c, 'impactShake', 0, 2.5, 0.01, 'camera knock');
  R(hit, c, 'shakeDuration', 0.05, 3, 0.01, 'knock lasts');
  R(hit, c, 'strikeRumble', 0, 1.5, 0.01, 'rumble while burning');
  R(hit, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(hit, c, 'cutShake', 0, 1, 0.01, 'cut-out knock');
  R(hit, c, 'cutFlash', 0, 1, 0.01, 'cut-out flash');
  hit.addColor(c, 'colorBurstA').name('fireball hot');
  hit.addColor(c, 'colorBurstB').name('fireball mid');
  hit.addColor(c, 'colorBurstC').name('fireball outer');
  hit.addColor(c, 'colorShockA').name('shockwave');
  hit.addColor(c, 'colorShockB').name('shockwave hot');
  hit.addColor(c, 'colorFlash').name('flash');

  const vap = folder.addFolder('7 · Vaporise');
  R(vap, c, 'killFrac', 0.1, 1.5, 0.01, 'reach (× circle)');
  R(vap, c, 'hitImpulse', 0, 20, 0.1, 'thrown out (m/s)');
  R(vap, c, 'hitLift', 0, 30, 0.1, 'thrown up (m/s)');
  R(vap, c, 'hitSpin', 0, 6, 0.01, 'tumble');
  R(vap, c, 'updraft', 0, 40, 0.1, 'updraft (m/s)');
  R(vap, c, 'updraftCeiling', 0.5, 40, 0.1, 'updraft ceiling (m)');
  R(vap, c, 'pullIn', 0, 12, 0.05, 'drawn to the axis (m/s)');
  R(vap, c, 'swirl', -10, 10, 0.05, 'wound round it (m/s)');
  R(vap, c, 'grab', 0, 20, 0.05, 'grip (/s)');
  R(vap, c, 'buoyancy', 0, 1, 0.01, 'weight carried');
  R(vap, c, 'vaporiseTime', 0.05, 5, 0.01, 'burns away over (s)');
  R(vap, c, 'stainTime', 0.02, 3, 0.01, 'goes white-hot over (s)');
  vap.addColor(c.look, 'color').name('carbonised');
  vap.addColor(c.look, 'rimColor').name('rim');
  R(vap, c.look, 'rimEmissive', 0, 10, 0.05, 'rim emissive');
  vap.addColor(c.look, 'edgeColor').name('burn edge');
  R(vap, c.look, 'edgeEmissive', 0, 14, 0.05, 'edge emissive');
  R(vap, c.look, 'edgeWidth', 0.005, 0.3, 0.001, 'edge width');

  folder.close();
  return folder;
}
