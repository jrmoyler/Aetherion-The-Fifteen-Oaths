import { Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createLashTubeGeometry,
  createLashStripGeometry,
  createLashQuadGeometry
} from '../../assets/codex/SolarLashGeometry.js';
import {
  createLashMaterial,
  createLashHazeMaterial,
  createFurrowHazeMaterial,
  createFurrowMaterial,
  createFlareMaterial,
  createBoomRingMaterial,
  createBoomWarpMaterial
} from '../../materials/codex/SolarLashMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'solarlash';

const TAU = Math.PI * 2;
/** Bodies that can be burning off one cast at once. */
const MAX_BURN = 10;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _floor = new Vector3();
const _body = new Vector3();
const _fullTip = new Vector3();
const _home = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * SOLAR LASH — a whip of molten plasma, cracked down the line.
 *
 * A line cast in five beats. The caster's fist **flares**; a tapering tube of
 * white-hot plasma **unfurls** from it down the line, bowed out to one side,
 * arched, and rippling with an S-wave that runs hand → tip; the tip drags
 * sparks off the floor and burns a molten furrow behind it. At the target it
 * **cracks**: the slack goes out of the whip in a tenth of a second (it
 * overshoots past straight, which is what a crack *is*), a sonic-boom ring
 * opens across the line and bends the air, the tip flashes, sparks spray.
 * Then the lash **recoils**, snaking back into the hand and burning out from
 * the tip, and the furrow **cools** from yellow-white through orange to a dull
 * red crust and erodes away.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the hand flare** — a camera-facing corona with flickering rays.
 *   2. **the lash** (`createLashMaterial`) — a parameter-space tube bent along
 *      the centreline in the vertex stage, inverted-fresnel plasma: a white
 *      wire of a core inside an orange rim, streaming, boiling, with surges
 *      running to the tip.
 *   3. **heat haze** — the lash again, fattened, on `LAYER.DISTORTION`, plus a
 *      camera-facing shimmer ribbon standing over the hot furrow.
 *   4. **the molten furrow** (`createFurrowMaterial`) — molten channel,
 *      cracked crust with lava seeping through the seams, a scorched char,
 *      all coloured off one temperature that cools over the lifetime.
 *   5. **embers & smoke** — additive curl-noise embers shed off the lash and
 *      the furrow; non-additive smoke off the furrow; streak sparks at the tip.
 *   6. **the crack** — tip flare, a boom ring and its distortion twin, a FIRE
 *      shell, a SHOCKWAVE and a SCORCH on the floor, flash, shake, light punch.
 *   7. **the throw** — `handlesOwnHits`. A body the tip passes is *ignited*
 *      (corroded to a charred, ember-rimmed look, and shedding embers and
 *      smoke for `burnTime`) and thrown **sideways, the way the whip sweeps**
 *      as it snaps straight. Bodies in the last `tipZone` metres wait for the
 *      crack and are launched hardest, forward and sideways.
 *
 * ## Why the sweep has a side
 *
 * The whip bows out to one side while it has slack. At the crack the slack
 * vanishes, so the whole lash moves from that side *across* the line — that
 * motion is the sweep, and its side (`sweepSide`, or a coin toss) is both the
 * side the bow is drawn on (the opposite one) and the direction the bodies fly.
 *
 * ## The editor rule
 *
 * A cast captures a seed, the sweep's side and four integrated phases (the
 * wave, the plasma flow, the surges, the lava seep). Every dimension, time and
 * colour is resolved from `settings.solarlash` every frame, so a slider moves
 * a lash already in the air, and rate sliders never make a phase jump.
 */
export class SolarLashAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The whip picks whom it throws, and which way. */
  get handlesOwnHits() {
    return true;
  }

  /** Bodies burning off this cast. HUD readout only. */
  get instanceCount() {
    return this._burnCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.tubeGeometry = createLashTubeGeometry(120, 12);
    this.stripGeometry = createLashStripGeometry(160, 6);
    this.quadGeometry = createLashQuadGeometry();

    /* ---- layer 4: the furrow, under everything ---- */
    this.furrowMaterial = createFurrowMaterial();
    this.furrow = this._mesh(this.stripGeometry, this.furrowMaterial, LAYER.VFX, 2);

    /* ---- layer 2: the lash ---- */
    this.lashMaterial = createLashMaterial();
    this.lash = this._mesh(this.tubeGeometry, this.lashMaterial, LAYER.VFX, 14);

    /* ---- layer 3: the haze round the lash and over the furrow ---- */
    this.hazeMaterial = createLashHazeMaterial();
    this.haze = this._mesh(this.tubeGeometry, this.hazeMaterial, LAYER.DISTORTION, 0);
    this.ribbonMaterial = createFurrowHazeMaterial();
    this.ribbon = this._mesh(this.stripGeometry, this.ribbonMaterial, LAYER.DISTORTION, 0);

    /* ---- layer 1 + 6: the flares ---- */
    this.handFlareMaterial = createFlareMaterial();
    this.handFlare = this._mesh(this.quadGeometry, this.handFlareMaterial, LAYER.VFX, 16);
    this.tipFlareMaterial = createFlareMaterial();
    this.tipFlare = this._mesh(this.quadGeometry, this.tipFlareMaterial, LAYER.VFX, 17);

    /* ---- layer 6: the boom ---- */
    this.ringMaterial = createBoomRingMaterial();
    this.ring = this._mesh(this.quadGeometry, this.ringMaterial, LAYER.VFX, 15);
    this.boomWarpMaterial = createBoomWarpMaterial();
    this.boomWarp = this._mesh(this.quadGeometry, this.boomWarpMaterial, LAYER.DISTORTION, 0);

    /** Scratch state handed to the materials — one object apiece, reused. */
    this._shape = {
      hand: new Vector3(),
      tip: new Vector3(),
      side: new Vector3(),
      slack: 1,
      sweepSign: 1,
      wavePhase: 0,
      flow: 0,
      seed: 0,
      pulse: 0,
      fade: 1,
      dissolve: 0,
      snapFlash: 0,
      strength: 1
    };
    this._furrowState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      length: 1,
      cutEnd: 0,
      tipAt: 0,
      heat: 1,
      seep: 0,
      fadeT: 0,
      seed: 0
    };
    this._handFlareState = { center: new Vector3(), size: 0.7, intensity: 0, seed: 0 };
    this._tipFlareState = { center: new Vector3(), size: 0.7, intensity: 0, seed: 0 };
    this._ringState = { center: new Vector3(), axisU: new Vector3(), axisV: new Vector3(), progress: 0, seed: 0 };

    this._seed = 0;
    /** +1 / −1: which way along `side` the whip sweeps at the crack. */
    this._sweep = 1;
    this._wave = 0;
    this._flow = 0;
    this._pulse = 0;
    this._seep = 0;
    this._reach = 0;
    this._prevReach = 0;
    this._heat = 1;
    this._cracked = false;

    this._burn = [];
    for (let i = 0; i < MAX_BURN; i++) this._burn.push({ dummy: null, time: 0, emitter: new RateEmitter() });
    this._burnCount = 0;
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0.05 };

    this._found = [];
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
    const particles = this.ctx.particles;

    /* ---- embers: off the lash, the furrow, the burning bodies ---- */
    this.embers = particles.get('solarlash.embers', {
      capacity: 3200,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.embers.uniforms.uSizeIn.value = 0.05;
    this.embers.uniforms.uFadeIn.value = 0.05;
    this.embers.uniforms.uFadeOut.value = 0.5;
    this.embers.uniforms.uEndSize.value = 0.25;
    this.embers.uniforms.uDrag.value = 1.4;
    this.embers.uniforms.uTurbFrequency.value = 0.9;
    this.embers.uniforms.uTurbSpeed.value = 0.6;

    /* ---- smoke: dirty, so not additive ---- */
    this.smoke = particles.get('solarlash.smoke', {
      capacity: 1400,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 1.0
    });
    this.smoke.uniforms.uSizeIn.value = 0.2;
    this.smoke.uniforms.uFadeIn.value = 0.15;
    this.smoke.uniforms.uFadeOut.value = 0.5;
    this.smoke.uniforms.uEndSize.value = 2.6;
    this.smoke.uniforms.uDrag.value = 0.9;

    /* ---- sparks: the crack, the dragging tip, the hits ---- */
    this.sparks = particles.get('solarlash.sparks', {
      capacity: 1600,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.55;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uDrag.value = 1.2;

    this.emberEmitter = new RateEmitter();
    this.furrowEmitter = new RateEmitter();
    this.smokeEmitter = new RateEmitter();
    this.dragEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the crack, the taut hang and the recoil. */
  get impactDuration() {
    const c = settings[ID];
    return Math.max(0.05, (Math.max(0, c.recoilDelay) + Math.max(0.05, c.recoilTime)) * settings.global.lifetime);
  }

  /** The fade is the furrow cooling. */
  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  /** Plasma gutters. */
  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 17.3) * Math.sin(this.age * 6.1 + 1.3));
  }

  /* ------------------------------------------------------------------ */
  /* The centreline on the CPU                                           */
  /* ------------------------------------------------------------------ */

  /**
   * A point on the whip at `s` (0 hand .. 1 tip). The CPU twin of `lashPoint`
   * in SolarLashMaterials — keep them together.
   */
  _lashPoint(s, out) {
    const c = settings[ID];
    const g = settings.global;
    const st = this._shape;
    out.lerpVectors(st.hand, st.tip, s);
    const L = st.hand.distanceTo(st.tip);
    const env = smoothstep(0, 0.25, s) * (0.4 + 0.6 * s);
    const ph = (TAU * s * L) / Math.max(c.waveLength, 0.1) - st.wavePhase;
    const bow = Math.sin(Math.PI * s);
    const lat = (c.waveAmp * g.noiseStrength * env * Math.sin(ph) + c.sweep * st.sweepSign * bow) * st.slack;
    out.addScaledVector(st.side, lat);
    out.y += (c.arch * bow + c.waveLift * env * Math.cos(ph)) * st.slack;
    return out;
  }

  /** The fist, in the world. */
  _hand(out) {
    const c = settings[ID];
    return out
      .copy(this.origin)
      .addScaledVector(this.direction, c.handForward)
      .addScaledVector(this.side, c.handSide)
      .setY(c.handHeight);
  }

  /** Where the tip is when the whip is out `reach` metres down the line. */
  _tipAt(reach, out) {
    const c = settings[ID];
    out.copy(this.origin).addScaledVector(this.direction, reach);
    // Unfurling: the tip leaves the hand at hand height and drops to strike
    // height over its first three metres.
    const k = smoothstep(0, 3, reach - c.handForward);
    out.y = lerp(c.handHeight, c.tipHeight, k);
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    const g = settings.global;

    this.emberEmitter.reset();
    this.furrowEmitter.reset();
    this.smokeEmitter.reset();
    this.dragEmitter.reset();
    this._releaseBurns();

    this._seed = Math.random() * 100;
    this._sweep = c.sweepSide > 0.5 ? 1 : c.sweepSide < -0.5 ? -1 : Math.random() < 0.5 ? 1 : -1;
    this._wave = Math.random() * TAU;
    this._flow = 0;
    this._pulse = 0;
    this._seep = 0;
    this._reach = 0;
    this._prevReach = 0;
    this._heat = 1;
    this._cracked = false;

    const st = this._shape;
    st.seed = this._seed;
    st.side.copy(this.side);
    // The bow is drawn on the side the whip sweeps *from*.
    st.sweepSign = -this._sweep;
    st.slack = 1;
    st.fade = 1;
    st.dissolve = 0;
    st.snapFlash = 0;
    st.strength = 1;

    this._furrowState.fadeT = 0;
    this._furrowState.heat = 1;
    this._furrowState.seed = this._seed;
    this._handFlareState.seed = this._seed;
    this._tipFlareState.seed = this._seed + 7;
    this._ringState.seed = this._seed;
    this._ringState.progress = 0;

    this.lash.visible = true;
    this.haze.visible = true;
    this.furrow.visible = true;
    this.ribbon.visible = true;
    this.handFlare.visible = true;
    this.tipFlare.visible = false;
    this.ring.visible = false;
    this.boomWarp.visible = false;

    /* the fist catching fire */
    this._hand(_pos);
    this._resetEmit(frame.uTime.value);
    _emit.position = _pos;
    _emit.radius = 0.12;
    _emit.direction = _up;
    _emit.spread = 1;
    _emit.speed = c.emberSpeed * 1.5;
    _emit.size = c.emberSize * 1.2;
    _emit.life = c.emberLife * 0.6;
    this.embers.emit(Math.round(24 * g.particleCount), _emit);

    this._syncAll();
  }

  _resetEmit(time) {
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
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  /** Integrated phases — rates are live, positions never jump. */
  _advance(dt, waveMul) {
    const c = settings[ID];
    const g = settings.global;
    this._wave += c.waveSpeed * waveMul * dt * g.animationSpeed;
    this._flow += c.flowSpeed * dt * g.noiseSpeed;
    this._pulse += c.pulseRate * dt * g.animationSpeed;
    this._seep += c.seepSpeed * dt * g.noiseSpeed;
  }

  /** Push the shape, the furrow, the flares and the particles' looks to the GPU. */
  _syncAll() {
    const c = settings[ID];
    const g = settings.global;
    const st = this._shape;
    st.wavePhase = this._wave;
    st.flow = this._flow;
    st.pulse = this._pulse;
    this._hand(st.hand);
    this.lashMaterial.userData.sync(st);
    this.hazeMaterial.userData.sync(st);

    /* the furrow */
    const fs = this._furrowState;
    const start = Math.max(0, c.furrowStart);
    fs.start.copy(this.origin).addScaledVector(this.direction, start).setY(0);
    fs.dir.copy(this.direction);
    fs.side.copy(this.side);
    fs.length = Math.max(0.2, this.length - start + 0.6);
    fs.cutEnd = Math.max(0, this._reach - start);
    fs.tipAt = this._reach - start;
    fs.heat = this._heat;
    fs.seep = this._seep;
    this.furrowMaterial.userData.sync(fs);
    this.ribbonMaterial.userData.sync(fs);

    /* the fist */
    const hf = this._handFlareState;
    hf.center.copy(st.hand);
    this.handFlareMaterial.userData.sync(hf);
    this.tipFlareMaterial.userData.sync(this._tipFlareState);

    /* the particles' looks */
    this.embers.setGradient(getColor(c.colorEmberA), getColor(c.colorEmberB), getColor(c.colorEmberC), getColor(c.colorEmberD));
    const e = this.embers.uniforms;
    e.uGravity.value.set(0, c.emberLift, 0);
    e.uSizeScale.value = g.particleSize;
    e.uLifeScale.value = g.particleLifetime;
    e.uSpeedScale.value = g.particleSpeed;
    e.uOpacity.value = g.opacity;
    e.uGlow.value = c.emberGlow * g.glow;
    e.uTurbulence.value = 1.1 * g.turbulence;

    this.smoke.setGradient(getColor(c.colorSmokeA), getColor(c.colorSmokeB), getColor(c.colorSmokeC), getColor(c.colorSmokeD));
    const s = this.smoke.uniforms;
    s.uGravity.value.set(0, c.smokeLift * 0.4, 0);
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = c.smokeOpacity * g.opacity;
    s.uTurbulence.value = 0.7 * g.turbulence;
    s.uSwirl.value = 0.8;
    s.uSwirlExpand.value = 0.6;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    const k = this.sparks.uniforms;
    k.uGravity.value.set(0, -c.sparkGravity, 0);
    k.uStretch.value = c.sparkStretch;
    k.uSizeScale.value = g.particleSize;
    k.uLifeScale.value = g.particleLifetime;
    k.uSpeedScale.value = g.particleSpeed;
    k.uOpacity.value = g.opacity;
    k.uGlow.value = c.sparkGlow * g.glow;
    k.uTurbulence.value = 0.2 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the lash unfurls                                           */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    this._advance(dt, 1);
    this._prevReach = this._reach;
    this._reach = Math.max(c.handForward + 0.05, this.front);

    const st = this._shape;
    this._tipAt(this._reach, st.tip);
    st.slack = 1;
    st.fade = 1;
    st.dissolve = 0;
    st.snapFlash = 0;
    st.strength = 1;

    // The fist flares up fast and settles to a steady burn while the lash is out.
    const rise = saturate(this.age / Math.max(0.01, c.flareRise));
    this._handFlareState.size = c.flareSize * lerp(0.4, 1, Easing.outBack(rise));
    this._handFlareState.intensity = lerp(1.6, Math.max(0.05, c.flareSettle), smoothstep(0.5, 1, rise + this.u * 0.3)) * rise;

    this._syncAll();
    this._lashFx(dt, 1);
    this._furrowFx(dt);
    this._dragSparks(dt);
    this._lashHits();
    this._updateBurns(dt);
    this.ctx.shake.rumble(c.travelRumble, dt);

    this.position.copy(st.tip);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the crack                                                  */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._cracked = true;
    this._reach = this.length;
    this._tipAt(this.length, _fullTip);

    /* the boom: across the whip's line */
    const rs = this._ringState;
    rs.center.copy(_fullTip);
    rs.axisU.copy(this.side);
    rs.axisV.copy(_up);
    rs.progress = 0;
    this.ring.visible = true;
    this.boomWarp.visible = true;
    this.tipFlare.visible = true;
    this.ringMaterial.userData.sync(rs);
    this.boomWarpMaterial.userData.sync(rs);
    const tf = this._tipFlareState;
    tf.center.copy(_fullTip);
    tf.size = c.flareSize * 1.3;
    tf.intensity = 2.2;
    this.tipFlareMaterial.userData.sync(tf);

    this.ctx.bursts.spawn(BurstMode.FIRE, _fullTip, {
      radius: c.burstSize * 0.15,
      endRadius: c.burstSize * power,
      life: 0.5,
      intensity: c.burstIntensity,
      opacity: 0.6,
      fresnel: 1.8,
      displace: 0.4,
      turbulence: 1.2,
      squash: 0.7,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    _floor.copy(_fullTip).setY(0);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.5,
      width: 0.06,
      intensity: 1.1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.SCORCH, _floor, {
      radius: c.scorchRadius,
      life: this.fadeDuration + this.impactDuration,
      intensity: 1,
      colorA: getColor(c.colorChar),
      colorB: getColor(c.colorLavaB)
    });

    /* sparks: a cone forward, leaning the way the whip sweeps */
    this._resetEmit(time);
    _dir.copy(this.direction).addScaledVector(this.side, this._sweep * 0.45).addScaledVector(_up, 0.35).normalize();
    _emit.position = _fullTip;
    _emit.radius = 0.08;
    _emit.direction = _dir;
    _emit.speed = c.sparkSpeed;
    _emit.speedVariance = 0.55;
    _emit.spread = 0.85;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    _emit.lifeVariance = 0.5;
    this.sparks.emit(Math.round(c.crackSparks * g.particleCount), _emit);

    _emit.speed = c.emberSpeed * 3;
    _emit.spread = 1.2;
    _emit.size = c.emberSize * 1.4;
    _emit.life = c.emberLife;
    this.embers.emit(Math.round(c.crackSparks * 0.6 * g.particleCount), _emit);

    _emit.direction = _up;
    _emit.radius = 0.3;
    _emit.speed = c.smokeLift * 1.5;
    _emit.spread = 0.9;
    _emit.size = c.smokeSize * 1.4;
    _emit.life = c.smokeLife;
    _emit.spin = 0.6;
    this.smoke.emit(Math.round(14 * g.particleCount), _emit);

    this._tipThrow();

    this.ctx.shake.add(c.crackShake * power, 1 / Math.max(0.05, c.shakeDuration), 24);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.crackFlash * power);
    this.lightBoost = c.lightIntensity * c.crackLight * power;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;

    if (t <= 1) {
      /* the taut hang and the recoil */
      const tau = t * this.impactDuration / Math.max(0.01, g.lifetime);
      const delay = Math.max(0, c.recoilDelay);
      const r = saturate((tau - delay) / Math.max(0.05, c.recoilTime));
      this._advance(dt, r > 0 ? c.recoilWave : 0.4);

      const st = this._shape;
      const k = saturate(tau / Math.max(0.01, c.snapTime));
      // The snap: the slack goes, overshooting past straight, then settles.
      const snap = (1 - Easing.outCubic(k)) - c.snapOvershoot * Math.sin(Math.PI * k) * (1 - 0.5 * k);
      st.slack = r > 0 ? c.recoilSlack * Math.sin(Math.PI * Math.min(1, r * 1.2)) : snap;
      st.snapFlash = Math.exp(-tau * 9);

      // Snaking back to the fist: the tip retreats and rises toward the hand.
      this._tipAt(this.length, _fullTip);
      this._hand(_home).addScaledVector(this.direction, 0.25);
      st.tip.lerpVectors(_fullTip, _home, Easing.inOutCubic(r));
      st.dissolve = smoothstep(0.45, 1, r);
      st.fade = 1;
      st.strength = 1 - st.dissolve;

      // The fist flares as the lash comes home, then dies down.
      const hf = this._handFlareState;
      hf.size = c.flareSize * (1 + 0.3 * Math.sin(Math.PI * r));
      hf.intensity = Math.max(0.05, c.flareSettle) * (1 + Math.sin(Math.PI * r)) * (1 - smoothstep(0.7, 1, r));

      // The crack's flare and boom.
      const ringT = Math.max(0.02, c.ringTime);
      const rp = saturate(tau / ringT);
      this._ringState.progress = Easing.outCubic(rp);
      this.ring.visible = rp < 1;
      this.boomWarp.visible = rp < 1;
      this.ringMaterial.userData.sync(this._ringState);
      this.boomWarpMaterial.userData.sync(this._ringState);
      const tf = this._tipFlareState;
      tf.center.copy(_fullTip);
      tf.size = c.flareSize * 2.2 * (0.6 + 0.6 * Easing.outCubic(saturate(tau / (ringT * 0.5))));
      tf.intensity = 2.2 * Math.exp(-tau / (ringT * 0.6));
      this.tipFlare.visible = tf.intensity > 0.01;

      this._syncAll();
      this._lashFx(dt, 1 - st.dissolve);
      this._furrowFx(dt);
      this._updateBurns(dt);
      this.position.copy(_fullTip);
      return;
    }

    /* the fade: the lash is home and out; the furrow cools and erodes */
    const ft = saturate(t - 1);
    this._advance(dt, 0);
    this.lash.visible = false;
    this.haze.visible = false;
    this.ring.visible = false;
    this.boomWarp.visible = false;
    this.tipFlare.visible = false;
    this._handFlareState.intensity = 0;
    this.handFlare.visible = false;

    this._heat = Math.pow(1 - ft, 1 / Math.max(0.1, c.coolCurve));
    this._furrowState.fadeT = smoothstep(0.55, 1, ft);
    this._syncAll();
    this.ribbon.visible = this._heat > 0.02;
    this._furrowFx(dt);
    this._updateBurns(dt);

    // The light sinks into the middle of the cooling furrow.
    this.pointAt(0.5 + 0.5 * (1 - ft), this.position);
    this.position.y = 0.3;
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Embers shed off the lash, crowded toward the fast-moving tip. */
  _lashFx(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.emberEmitter.tick(dt, c.emberRate * strength) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.emberSize;
    _emit.life = c.emberLife;
    _emit.lifeVariance = 0.5;
    _emit.speed = c.emberSpeed;
    _emit.spread = 1;
    for (let i = 0; i < n; i++) {
      const s = 1 - Math.pow(Math.random(), 1.6) * 0.92;
      this._lashPoint(s, _pos);
      // Thrown off along the local motion of the wave — sideways, mostly.
      _dir.copy(this.side).multiplyScalar(Math.random() < 0.5 ? 1 : -1).addScaledVector(_up, 0.4);
      _emit.position = _pos;
      _emit.direction = _dir;
      this.embers.emit(1, _emit);
    }
  }

  /** Embers and smoke rising off the hot furrow. */
  _furrowFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const start = Math.max(0, c.furrowStart);
    const span = this._reach - start;
    if (span <= 0.1) return;
    const heat = this._heat;
    const time = frame.uTime.value;

    const embers = Math.round(this.furrowEmitter.tick(dt, c.furrowEmbers * heat) * g.particleCount);
    if (embers > 0) {
      this._resetEmit(time);
      _emit.size = c.emberSize * 0.8;
      _emit.life = c.emberLife * 0.9;
      _emit.speed = c.emberSpeed * 0.6;
      _emit.spread = 0.6;
      _emit.direction = _up;
      for (let i = 0; i < embers; i++) {
        // Crowded toward the fresh end, where it is hottest.
        const along = start + span * (1 - Math.pow(Math.random(), 0.7));
        _pos.copy(this.origin).addScaledVector(this.direction, along).addScaledVector(this.side, (Math.random() * 2 - 1) * c.furrowWidth * 1.5);
        _pos.y = 0.05;
        _emit.position = _pos;
        this.embers.emit(1, _emit);
      }
    }

    const puffs = Math.round(this.smokeEmitter.tick(dt, c.smokeRate * (0.3 + 0.7 * heat)) * g.particleCount);
    if (puffs > 0) {
      this._resetEmit(time);
      _emit.size = c.smokeSize;
      _emit.life = c.smokeLife;
      _emit.speed = c.smokeLift;
      _emit.spread = 0.35;
      _emit.spin = 0.5;
      _emit.direction = _up;
      for (let i = 0; i < puffs; i++) {
        const along = start + span * Math.random();
        _pos.copy(this.origin).addScaledVector(this.direction, along).addScaledVector(this.side, (Math.random() * 2 - 1) * c.furrowCrust);
        _pos.y = 0.15;
        _emit.position = _pos;
        _emit.anchor = _pos;
        this.smoke.emit(1, _emit);
      }
    }
  }

  /** Sparks struck off the floor where the tip drags. */
  _dragSparks(dt) {
    const c = settings[ID];
    const g = settings.global;
    const st = this._shape;
    // Only once the tip is down near the floor.
    if (st.tip.y > c.tipHeight + 0.4) return;
    const n = Math.round(this.dragEmitter.tick(dt, c.dragSparks) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _floor.copy(st.tip).setY(0.05);
    _dir.copy(this.direction).multiplyScalar(0.8).addScaledVector(_up, 0.7).addScaledVector(this.side, this._sweep * 0.3).normalize();
    _emit.position = _floor;
    _emit.radius = 0.1;
    _emit.direction = _dir;
    _emit.speed = c.sparkSpeed * 0.5;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.7;
    _emit.size = c.sparkSize * 0.8;
    _emit.life = c.sparkLife * 0.6;
    this.sparks.emit(n, _emit);
  }

  /* ------------------------------------------------------------------ */
  /* The throw                                                           */
  /* ------------------------------------------------------------------ */

  /** Throw every body the tip has run past this frame — except those at the end. */
  _lashHits() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const from = Math.max(0, this._prevReach - 0.6);
    const to = this._reach;
    if (to <= from) return;
    const mid = (from + to) * 0.5;
    this.pointAt(Math.min(1, mid / this.length), _floor);
    const radius = Math.hypot((to - from) * 0.5, c.hitWidth);
    const found = field.findTargets(_floor.x, _floor.z, radius, this._found);
    if (found.length === 0) return;

    const power = g.explosionIntensity;
    this._force.impulse = c.hitImpulse * power;
    this._force.lift = c.hitLift * power;
    this._force.spin = c.hitSpin;
    const tipStart = this.length - Math.max(0, c.tipZone);

    for (const dummy of found) {
      const dx = dummy.position.x - this.origin.x;
      const dz = dummy.position.z - this.origin.z;
      const along = dx * this.direction.x + dz * this.direction.z;
      const lat = dx * this.side.x + dz * this.side.z;
      if (Math.abs(lat) > c.hitWidth || along < 0.3 || along > to) continue;
      if (along >= tipStart) continue; // waits for the crack
      // Sideways, the way the whip sweeps, with a little of the line in it.
      _dir.copy(this.side).multiplyScalar(this._sweep).addScaledVector(this.direction, c.hitForward).normalize();
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      this._ignite(dummy, _dir, 0.6);
    }
  }

  /** At the crack: everything at the end of the line is launched, hardest at the tip. */
  _tipThrow() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const zone = Math.max(0.3, c.tipZone);
    this.pointAt(1, _floor);
    const found = field.findTargets(_floor.x, _floor.z, zone, this._found);
    for (const dummy of found) {
      const dx = dummy.position.x - this.origin.x;
      const dz = dummy.position.z - this.origin.z;
      const lat = dx * this.side.x + dz * this.side.z;
      if (Math.abs(lat) > c.hitWidth * 1.6) continue;
      // Closeness to the tip decides the share of the full launch.
      const d = Math.hypot(dummy.position.x - _floor.x, dummy.position.z - _floor.z);
      const close = 1 - saturate(d / zone);
      this._force.impulse = lerp(c.hitImpulse, c.tipImpulse, close) * power;
      this._force.lift = lerp(c.hitLift, c.tipLift, close) * power;
      this._force.spin = lerp(c.hitSpin, c.tipSpin, close);
      _dir.copy(this.side).multiplyScalar(this._sweep * 0.8).addScaledVector(this.direction, lerp(c.hitForward, 0.75, close)).normalize();
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      this._ignite(dummy, _dir, 1);
    }
  }

  /** Set a body burning, and spray sparks off it the way it was thrown. */
  _ignite(dummy, dir, scale) {
    const c = settings[ID];
    const g = settings.global;
    if (this._burnCount < MAX_BURN) {
      const slot = this._burn[this._burnCount++];
      slot.dummy = dummy;
      slot.time = 0;
      slot.emitter.reset();
    }
    this._resetEmit(frame.uTime.value);
    _pos.copy(dummy.position).setY(1.1);
    _emit.position = _pos;
    _emit.radius = 0.25;
    _emit.direction = dir;
    _emit.speed = c.sparkSpeed * 0.6;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.6;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife * 0.7;
    this.sparks.emit(Math.round(30 * scale * g.particleCount), _emit);
    _emit.speed = c.emberSpeed * 2;
    _emit.size = c.emberSize * 1.3;
    _emit.life = c.emberLife;
    this.embers.emit(Math.round(26 * scale * g.particleCount), _emit);
    this.ctx.shake.add(c.crackShake * 0.3 * scale, 7, 20);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.8 * scale);
  }

  /** Char the burning bodies and keep them shedding embers and smoke. */
  _updateBurns(dt) {
    const c = settings[ID];
    const g = settings.global;
    const look = this._look;
    look.color = c.colorBurnBody;
    look.rimColor = c.colorBurnRim;
    look.rimEmissive = c.burnRimGlow;
    look.edgeColor = c.colorBurnEdge;
    look.edgeEmissive = c.burnEdgeGlow;
    look.edgeWidth = c.burnEdgeWidth;
    const time = frame.uTime.value;
    for (let i = 0; i < this._burnCount; i++) {
      const slot = this._burn[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) continue;
      slot.time += dt;
      dummy.corrode(saturate(slot.time / Math.max(0.02, c.igniteTime)) * c.ignite, look);
      const left = 1 - saturate(slot.time / Math.max(0.05, c.burnTime * g.lifetime));
      if (left <= 0) continue;
      const at = dummy.bodyPoint(_body) ?? _body.copy(dummy.position).setY(0.9);
      const n = Math.round(slot.emitter.tick(dt, c.burnEmbers * left) * g.particleCount);
      if (n <= 0) continue;
      this._resetEmit(time);
      _emit.position = at;
      _emit.radius = 0.35;
      _emit.direction = _up;
      _emit.speed = c.emberSpeed;
      _emit.spread = 0.8;
      _emit.size = c.emberSize;
      _emit.life = c.emberLife * 0.8;
      this.embers.emit(n, _emit);
      if (Math.random() < 0.35 * left) {
        _emit.size = c.smokeSize * 0.7;
        _emit.life = c.smokeLife * 0.7;
        _emit.speed = c.smokeLift;
        _emit.spin = 0.5;
        this.smoke.emit(1, _emit);
      }
    }
  }

  _releaseBurns() {
    for (let i = 0; i < this._burnCount; i++) this._burn[i].dummy = null;
    this._burnCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.lash.visible = false;
    this.haze.visible = false;
    this.furrow.visible = false;
    this.ribbon.visible = false;
    this.handFlare.visible = false;
    this.tipFlare.visible = false;
    this.ring.visible = false;
    this.boomWarp.visible = false;
    this._releaseBurns();
  }

  dispose() {
    this.tubeGeometry.dispose();
    this.stripGeometry.dispose();
    this.quadGeometry.dispose();
    this.lashMaterial.dispose();
    this.hazeMaterial.dispose();
    this.ribbonMaterial.dispose();
    this.furrowMaterial.dispose();
    this.handFlareMaterial.dispose();
    this.tipFlareMaterial.dispose();
    this.ringMaterial.dispose();
    this.boomWarpMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('☄  Solar Lash');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'unfurl speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'furrow cools over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'gutter');

  const hand = folder.addFolder('1 · Hand');
  R(hand, c, 'handForward', -1, 2, 0.01, 'forward (m)');
  R(hand, c, 'handSide', -1, 1, 0.01, 'to the right (m)');
  R(hand, c, 'handHeight', 0.2, 3, 0.01, 'height (m)');
  R(hand, c, 'flareSize', 0.05, 4, 0.01, 'flare radius (m)');
  R(hand, c, 'flareGlow', 0, 15, 0.05, 'flare glow');
  R(hand, c, 'flareRays', 1, 16, 1, 'rays');
  R(hand, c, 'flareRise', 0.01, 1, 0.005, 'flares up over (s)');
  R(hand, c, 'flareSettle', 0, 1.5, 0.01, 'steady burn');
  hand.addColor(c, 'colorFlareCore').name('core');
  hand.addColor(c, 'colorFlareHalo').name('corona');

  const shape = folder.addFolder('2 · Lash shape');
  R(shape, c, 'rootRadius', 0.005, 0.5, 0.001, 'radius at the hand (m)');
  R(shape, c, 'tipRadius', 0.002, 0.3, 0.001, 'radius at the tip (m)');
  R(shape, c, 'taper', 0.1, 5, 0.01, 'taper');
  R(shape, c, 'tipHeight', 0, 2, 0.01, 'tip strike height (m)');
  R(shape, c, 'arch', -1, 4, 0.01, 'arch (m)');
  R(shape, c, 'sweep', 0, 5, 0.01, 'sideways bow (m)');
  R(shape, c, 'sweepSide', -1, 1, 1, 'sweeps toward (−1 L · 0 random · 1 R)');
  R(shape, c, 'waveAmp', 0, 2.5, 0.01, 'wave (m)');
  R(shape, c, 'waveLength', 0.3, 12, 0.05, 'wavelength (m)');
  R(shape, c, 'waveSpeed', 0, 60, 0.1, 'wave speed (rad/s)');
  R(shape, c, 'waveLift', 0, 1, 0.01, 'wave vertical share');
  R(shape, c, 'boil', 0, 1.5, 0.01, 'surface boil');
  R(shape, c, 'boilScale', 0.1, 10, 0.05, 'boil scale');
  R(shape, c, 'snapTime', 0.01, 1, 0.005, 'snaps taut over (s)');
  R(shape, c, 'snapOvershoot', 0, 1.5, 0.01, 'snap overshoot');

  const plasma = folder.addFolder('3 · Plasma');
  R(plasma, c, 'coreGlow', 0, 20, 0.05, 'core glow');
  R(plasma, c, 'edgeGlow', 0, 10, 0.05, 'rim glow');
  R(plasma, c, 'coreSharpness', 0.2, 10, 0.05, 'core thinness');
  R(plasma, c, 'flowSpeed', 0, 30, 0.1, 'flow (m/s)');
  R(plasma, c, 'flowScale', 0.1, 6, 0.01, 'flow scale');
  R(plasma, c, 'pulseRate', 0, 12, 0.05, 'surges/second');
  R(plasma, c, 'pulseGlow', 0, 8, 0.05, 'surge glow');
  R(plasma, c, 'tipHeat', 0, 2, 0.01, 'tip heat');
  R(plasma, c, 'softFade', 0.01, 2, 0.01, 'soft intersection (m)');
  R(plasma, c, 'opacity', 0, 1, 0.01, 'opacity');
  Editor.gradient(plasma, c, 'colorPlasma', 'plasma gradient');

  const recoil = folder.addFolder('4 · Recoil');
  R(recoil, c, 'recoilDelay', 0, 1, 0.005, 'hangs taut (s)');
  R(recoil, c, 'recoilTime', 0.05, 2, 0.01, 'recoils over (s)');
  R(recoil, c, 'recoilSlack', 0, 2, 0.01, 'slack on the way back');
  R(recoil, c, 'recoilWave', 0, 5, 0.01, 'wave speed (×)');
  R(recoil, c, 'dissolveEdge', 0.005, 0.4, 0.005, 'burn-out edge');

  const furrow = folder.addFolder('5 · Molten furrow');
  R(furrow, c, 'furrowStart', 0, 4, 0.01, 'starts after (m)');
  R(furrow, c, 'furrowWidth', 0.01, 1, 0.005, 'channel half-width (m)');
  R(furrow, c, 'furrowCrust', 0.05, 3, 0.01, 'crust half-width (m)');
  R(furrow, c, 'furrowChar', 0.05, 5, 0.01, 'scorch half-width (m)');
  R(furrow, c, 'crackScale', 0.3, 12, 0.05, 'crust plates per m');
  R(furrow, c, 'crackWidth', 0.005, 0.4, 0.005, 'seam width (m)');
  R(furrow, c, 'seepSpeed', 0, 5, 0.01, 'lava seep speed');
  R(furrow, c, 'furrowGlow', 0, 12, 0.05, 'lava glow');
  R(furrow, c, 'freshLength', 0.1, 20, 0.05, 'white-hot behind tip (m)');
  R(furrow, c, 'furrowWiggle', 0, 1, 0.005, 'wander (m)');
  R(furrow, c, 'furrowWiggleScale', 0.02, 3, 0.01, 'wander scale');
  R(furrow, c, 'coolCurve', 0.1, 5, 0.01, 'holds heat');
  R(furrow, c, 'crustOpacity', 0, 1, 0.01, 'crust opacity');
  R(furrow, c, 'charOpacity', 0, 1, 0.01, 'scorch opacity');
  R(furrow, c, 'furrowErode', 0, 1, 0.01, 'ragged fade');
  furrow.addColor(c, 'colorLavaA').name('lava white-hot');
  furrow.addColor(c, 'colorLavaB').name('lava orange');
  furrow.addColor(c, 'colorLavaC').name('lava dull red');
  furrow.addColor(c, 'colorCrust').name('crust');
  furrow.addColor(c, 'colorChar').name('scorch');

  const haze = folder.addFolder('6 · Heat haze');
  R(haze, c, 'hazeStrength', 0, 4, 0.01, 'strength');
  R(haze, c, 'hazeWidth', 1, 12, 0.05, 'width (× lash radius)');
  R(haze, c, 'hazeScale', 0.1, 8, 0.01, 'noise scale');
  R(haze, c, 'hazeSpeed', 0, 12, 0.05, 'noise speed');
  R(haze, c, 'hazeHeight', 0.05, 4, 0.01, 'shimmer over furrow (m)');
  R(haze, c, 'furrowHaze', 0, 3, 0.01, 'furrow shimmer');

  const fx = folder.addFolder('7 · Embers & smoke');
  R(fx, c, 'emberRate', 0, 1200, 1, 'embers/second off the lash');
  R(fx, c, 'furrowEmbers', 0, 600, 1, 'embers/second off the furrow');
  R(fx, c, 'emberSize', 0.005, 0.4, 0.001, 'ember size');
  R(fx, c, 'emberSpeed', 0, 10, 0.05, 'ember speed');
  R(fx, c, 'emberLift', -4, 10, 0.05, 'ember rise (m/s²)');
  R(fx, c, 'emberLife', 0.1, 5, 0.05, 'ember lifetime');
  R(fx, c, 'emberGlow', 0, 10, 0.05, 'ember glow');
  R(fx, c, 'smokeRate', 0, 300, 1, 'smoke/second');
  R(fx, c, 'smokeSize', 0.05, 4, 0.01, 'smoke size');
  R(fx, c, 'smokeLift', 0, 5, 0.01, 'smoke rise (m/s)');
  R(fx, c, 'smokeLife', 0.1, 8, 0.05, 'smoke lifetime');
  R(fx, c, 'smokeOpacity', 0, 1, 0.01, 'smoke opacity');
  Editor.gradient(fx, c, 'colorEmber', 'ember gradient');
  Editor.gradient(fx, c, 'colorSmoke', 'smoke gradient');

  const crack = folder.addFolder('8 · The crack');
  R(crack, c, 'dragSparks', 0, 400, 1, 'drag sparks/second');
  R(crack, c, 'crackSparks', 0, 500, 1, 'sparks at the crack');
  R(crack, c, 'sparkSpeed', 0, 40, 0.1, 'spark speed');
  R(crack, c, 'sparkSize', 0.005, 0.3, 0.001, 'spark size');
  R(crack, c, 'sparkStretch', 0, 1, 0.005, 'spark stretch');
  R(crack, c, 'sparkLife', 0.05, 3, 0.01, 'spark lifetime');
  R(crack, c, 'sparkGravity', -10, 30, 0.1, 'spark gravity');
  R(crack, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  R(crack, c, 'ringSize', 0.1, 10, 0.05, 'boom ring (m)');
  R(crack, c, 'ringTime', 0.02, 2, 0.01, 'ring opens over (s)');
  R(crack, c, 'ringWidth', 0.005, 0.4, 0.001, 'ring width');
  R(crack, c, 'ringGlow', 0, 15, 0.05, 'ring glow');
  R(crack, c, 'ringWarp', 0, 4, 0.01, 'boom distortion');
  R(crack, c, 'burstSize', 0, 10, 0.05, 'fire shell (m)');
  R(crack, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(crack, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(crack, c, 'scorchRadius', 0, 6, 0.05, 'scorch (m)');
  R(crack, c, 'crackFlash', 0, 1, 0.01, 'flash');
  R(crack, c, 'crackShake', 0, 1.5, 0.01, 'camera knock');
  R(crack, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(crack, c, 'crackLight', 0, 8, 0.01, 'light punch (× intensity)');
  R(crack, c, 'travelRumble', 0, 1, 0.01, 'rumble while unfurling');
  crack.addColor(c, 'colorRing').name('boom ring');
  crack.addColor(c, 'colorBurstA').name('shell inner');
  crack.addColor(c, 'colorBurstB').name('shell mid');
  crack.addColor(c, 'colorBurstC').name('shell outer');
  crack.addColor(c, 'colorShockA').name('shockwave');
  crack.addColor(c, 'colorShockB').name('shockwave hot');
  crack.addColor(c, 'colorFlash').name('flash');
  Editor.gradient(crack, c, 'colorSpark', 'spark gradient');

  const thrown = folder.addFolder('9 · The throw');
  R(thrown, c, 'hitWidth', 0.1, 4, 0.01, 'reach either side (m)');
  R(thrown, c, 'hitImpulse', 0, 25, 0.1, 'thrown sideways (m/s)');
  R(thrown, c, 'hitLift', 0, 15, 0.05, 'lift (m/s)');
  R(thrown, c, 'hitSpin', 0, 6, 0.01, 'tumble');
  R(thrown, c, 'hitForward', -1, 2, 0.01, 'share along the line');
  R(thrown, c, 'tipZone', 0, 8, 0.05, 'wait for the crack within (m)');
  R(thrown, c, 'tipImpulse', 0, 40, 0.1, 'tip launch (m/s)');
  R(thrown, c, 'tipLift', 0, 25, 0.05, 'tip lift (m/s)');
  R(thrown, c, 'tipSpin', 0, 8, 0.01, 'tip tumble');
  R(thrown, c, 'burnTime', 0, 10, 0.05, 'burns for (s)');
  R(thrown, c, 'burnEmbers', 0, 300, 1, 'embers/second off a body');
  R(thrown, c, 'ignite', 0, 1, 0.01, 'char');
  R(thrown, c, 'igniteTime', 0.02, 3, 0.01, 'catches over (s)');
  R(thrown, c, 'burnRimGlow', 0, 10, 0.05, 'burning rim glow');
  R(thrown, c, 'burnEdgeGlow', 0, 12, 0.05, 'burning edge glow');
  R(thrown, c, 'burnEdgeWidth', 0, 0.3, 0.001, 'burning edge width');
  thrown.addColor(c, 'colorBurnBody').name('charred body');
  thrown.addColor(c, 'colorBurnRim').name('burning rim');
  thrown.addColor(c, 'colorBurnEdge').name('burning edge');

  folder.close();
  return folder;
}
