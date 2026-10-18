import { Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createFountainGeometry,
  createSeamStripGeometry,
  createBaptismQuadGeometry
} from '../../assets/codex/CrimsonBaptismGeometry.js';
import {
  createFountainMaterial,
  createFountainShimmerMaterial,
  createSeamMaterial,
  createFontMaterial,
  createCrownGlowMaterial
} from '../../materials/codex/CrimsonBaptismMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'baptism';

const TAU = Math.PI * 2;
/** Bodies that can be anointed off one cast at once. */
const MAX_ANOINTED = 14;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _down = new Vector3(0, -1, 0);
const _up = new Vector3(0, 1, 0);

/**
 * CRIMSON BAPTISM — blood forces its way under the floor to the circle, bursts
 * up out of it as a fountain, and falls back over everything in it as rain.
 *
 * A zone cast in five beats. **The seam**: a glowing crack races across the
 * floor from the caster to the circle, blood seeping out of it and bubbling
 * up at its hot head — something is coming *under* the stone. **The
 * eruption**: at the circle a column of blood punches straight up out of the
 * floor, overshoots and settles, turns over at the top and falls away on every
 * side as a glossy umbrella sheet that lands in a ring — a fountain, lit red
 * from inside its column, a bloom where it turns over, shimmering the air.
 * Whatever stood over the source is thrown straight up. **The pour**: for a
 * moment it stands, pouring; the ring it lands on floods outward and inward
 * into a pool that fills the circle. **The collapse**: the column drops back,
 * the sheet tears into holes and droplets, and the blood **falls back as
 * rain** — streaks over the whole circle, rings blooming all over the pool,
 * and everything still standing is beaten down and anointed red. **The
 * drain**: the pool dries brown and erodes.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the seam** — the crack across the floor.
 *   2. **the fountain** (`createFountainMaterial`) — a parameter-space surface
 *      of revolution: column, turn-over, ballistic crown; streaks, inner glow,
 *      sheen, break-up.
 *   3. **the shimmer** — the fountain fattened on `LAYER.DISTORTION`.
 *   4. **the crown glow** — a bloom at the turn-over.
 *   5. **the font** — the pool, with rain rings.
 *   6. **rain, droplets, spray, mist** — four particle systems.
 *   7. **the eruption** — WATER shell tinted blood, SHOCKWAVE, RIPPLE, flash,
 *      shake, light punch; `handlesOwnHits`: thrown up at the eruption, beaten
 *      down and anointed by the rain.
 *
 * ## The editor rule
 *
 * A cast captures a seed and integrated phases (the flow and the twist). The
 * fountain's shape, every timing and every colour are resolved from
 * `settings.baptism` every frame.
 */
export class CrimsonBaptismAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._anointedCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.fountainGeometry = createFountainGeometry(72, 44);
    this.stripGeometry = createSeamStripGeometry(120, 2);
    this.quadGeometry = createBaptismQuadGeometry();

    this.seamMaterial = createSeamMaterial();
    this.seam = this._mesh(this.stripGeometry, this.seamMaterial, LAYER.VFX, 2);

    this.fontMaterial = createFontMaterial();
    this.font = this._mesh(this.quadGeometry, this.fontMaterial, LAYER.VFX, 3);

    this.fountainMaterial = createFountainMaterial();
    this.fountain = this._mesh(this.fountainGeometry, this.fountainMaterial, LAYER.VFX, 12);

    this.shimmerMaterial = createFountainShimmerMaterial();
    this.shimmer = this._mesh(this.fountainGeometry, this.shimmerMaterial, LAYER.DISTORTION, 0);

    this.glowMaterial = createCrownGlowMaterial();
    this.glow = this._mesh(this.quadGeometry, this.glowMaterial, LAYER.VFX, 16);

    this._shape = {
      center: new Vector3(),
      height: 0,
      reach: 0,
      loft: 0,
      flow: 0,
      seed: 0,
      break: 0,
      strength: 1
    };
    this._seamState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      length: 1,
      front: 0,
      fade: 1,
      seed: 0
    };
    this._fontState = { center: new Vector3(), fill: 0, land: -1, rain: 0, dry: 0, fadeT: 0, seed: 0 };
    this._glowState = { center: new Vector3(), size: 1, intensity: 0, seed: 0 };

    this._seed = 0;
    this._flow = 0;
    this._tau = 0;
    this._rained = false;
    this._seamFade = 1;

    this._anointed = [];
    for (let i = 0; i < MAX_ANOINTED; i++) this._anointed.push({ dummy: null, time: 0 });
    this._anointedCount = 0;
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

    this.rain = particles.get('baptism.rain', {
      capacity: 3200,
      shape: ParticleShape.STREAK,
      additive: false,
      stretch: true,
      softFade: 0.15
    });
    this.rain.uniforms.uSizeIn.value = 0.02;
    this.rain.uniforms.uFadeIn.value = 0.05;
    this.rain.uniforms.uFadeOut.value = 0.1;
    this.rain.uniforms.uEndSize.value = 1;
    this.rain.uniforms.uDrag.value = 0;

    this.drops = particles.get('baptism.drops', {
      capacity: 2600,
      shape: ParticleShape.DROPLET,
      additive: false,
      stretch: true,
      softFade: 0.2
    });
    this.drops.uniforms.uSizeIn.value = 0.04;
    this.drops.uniforms.uFadeIn.value = 0.02;
    this.drops.uniforms.uFadeOut.value = 0.3;
    this.drops.uniforms.uEndSize.value = 0.6;
    this.drops.uniforms.uDrag.value = 0.3;

    this.spray = particles.get('baptism.spray', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.25
    });
    this.spray.uniforms.uSizeIn.value = 0.03;
    this.spray.uniforms.uFadeIn.value = 0.03;
    this.spray.uniforms.uFadeOut.value = 0.5;
    this.spray.uniforms.uEndSize.value = 0.4;
    this.spray.uniforms.uDrag.value = 1.4;

    this.mist = particles.get('baptism.mist', {
      capacity: 1000,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.0
    });
    this.mist.uniforms.uSizeIn.value = 0.2;
    this.mist.uniforms.uFadeIn.value = 0.12;
    this.mist.uniforms.uFadeOut.value = 0.55;
    this.mist.uniforms.uEndSize.value = 2.4;
    this.mist.uniforms.uDrag.value = 1.4;

    this.rainEmitter = new RateEmitter();
    this.crownEmitter = new RateEmitter();
    this.seamEmitter = new RateEmitter();
    this.mistEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get _rainStart() {
    const c = settings[ID];
    return c.eruptTime + c.pourTime * 0.6;
  }

  get impactDuration() {
    const c = settings[ID];
    const fountain = c.eruptTime + c.pourTime + c.collapseTime;
    const rain = this._rainStart + c.rainTime;
    return Math.max(0.2, (Math.max(fountain, rain) + 0.1) * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  get radius() {
    return Math.max(0.2, settings[ID].zoneRadius);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.rainEmitter.reset();
    this.crownEmitter.reset();
    this.seamEmitter.reset();
    this.mistEmitter.reset();
    this._releaseAnointed();

    this._seed = Math.random() * 100;
    this._flow = 0;
    this._tau = 0;
    this._rained = false;
    this._seamFade = 1;

    this.pointAt(1, _centre).setY(0);
    const st = this._shape;
    st.center.copy(_centre);
    st.height = 0;
    st.reach = 0;
    st.loft = 0;
    st.seed = this._seed;
    st.break = 0;
    st.strength = 1;

    const ss = this._seamState;
    ss.seed = this._seed;
    ss.front = 0;
    ss.fade = 1;
    const fs = this._fontState;
    fs.center.copy(_centre).setY(0.013);
    fs.fill = 0;
    fs.land = -1;
    fs.rain = 0;
    fs.dry = 0;
    fs.fadeT = 0;
    fs.seed = this._seed;
    this._glowState.seed = this._seed;
    this._glowState.intensity = 0;

    this.seam.visible = true;
    this.font.visible = false;
    this.fountain.visible = false;
    this.shimmer.visible = false;
    this.glow.visible = false;

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

  _syncAll() {
    const c = settings[ID];
    const g = settings.global;
    const st = this._shape;
    st.flow = this._flow;
    this.fountainMaterial.userData.sync(st);
    this.shimmerMaterial.userData.sync(st);

    const ss = this._seamState;
    const start = Math.max(0, c.seamStart);
    ss.start.copy(this.origin).addScaledVector(this.direction, start).setY(0);
    ss.dir.copy(this.direction);
    ss.side.copy(this.side);
    ss.length = Math.max(0.2, this.length - start);
    ss.fade = this._seamFade;
    this.seamMaterial.userData.sync(ss);

    this.fontMaterial.userData.sync(this._fontState);
    const gs = this._glowState;
    gs.center.copy(st.center).setY(st.height + st.loft * 0.5);
    this.glowMaterial.userData.sync(gs);

    this.rain.setGradient(getColor(c.colorRainA), getColor(c.colorRainB), getColor(c.colorRainC), getColor(c.colorRainD));
    const r = this.rain.uniforms;
    r.uGravity.value.set(0, -c.rainGravity, 0);
    r.uStretch.value = c.rainStretch;
    r.uSizeScale.value = g.particleSize;
    r.uLifeScale.value = g.particleLifetime;
    r.uSpeedScale.value = g.particleSpeed;
    r.uOpacity.value = c.rainOpacity * g.opacity;
    r.uGlow.value = c.rainGlow * g.glow;
    r.uTurbulence.value = 0.05 * g.turbulence;

    this.drops.setGradient(getColor(c.colorDropA), getColor(c.colorDropB), getColor(c.colorDropC), getColor(c.colorDropD));
    const d = this.drops.uniforms;
    d.uGravity.value.set(0, -c.dropGravity, 0);
    d.uStretch.value = c.dropStretch;
    d.uSizeScale.value = g.particleSize;
    d.uLifeScale.value = g.particleLifetime;
    d.uSpeedScale.value = g.particleSpeed;
    d.uOpacity.value = g.opacity;
    d.uGlow.value = c.dropGlow * g.glow;
    d.uTurbulence.value = 0.1 * g.turbulence;

    this.spray.setGradient(getColor(c.colorSprayA), getColor(c.colorSprayB), getColor(c.colorSprayC), getColor(c.colorSprayD));
    const s = this.spray.uniforms;
    s.uGravity.value.set(0, -c.dropGravity * 0.35, 0);
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uGlow.value = c.sprayGlow * g.glow;
    s.uTurbulence.value = 0.5 * g.turbulence;

    this.mist.setGradient(getColor(c.colorMistA), getColor(c.colorMistB), getColor(c.colorMistC), getColor(c.colorMistD));
    const m = this.mist.uniforms;
    m.uGravity.value.set(0, c.mistLift * 0.3, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = c.mistOpacity * g.opacity;
    m.uTurbulence.value = 0.8 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the seam                                                   */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._flow += c.flowSpeed * dt * g.noiseSpeed;
    const ss = this._seamState;
    ss.front = Math.max(0, this.front - Math.max(0, c.seamStart));
    this._syncAll();

    /* blood bubbling up at the seam's head */
    const n = Math.round(this.seamEmitter.tick(dt, c.seamDrops) * g.particleCount);
    if (n > 0) {
      this.pointAt(this.u, _pos).setY(0.05);
      this._resetEmit(frame.uTime.value);
      _emit.position = _pos;
      _emit.radius = 0.15;
      _emit.direction = _up;
      _emit.speed = c.dropSpeed * 0.45;
      _emit.spread = 0.5;
      _emit.size = c.dropSize;
      _emit.life = c.dropLife * 0.7;
      this.drops.emit(n, _emit);
    }
    this.ctx.shake.rumble(c.seamRumble, dt);
    this.pointAt(this.u, this.position);
    this.position.y = 0.4;
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the eruption                                               */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._tau = 0;
    const st = this._shape;

    this.font.visible = true;
    this.fountain.visible = true;
    this.shimmer.visible = true;
    this.glow.visible = true;

    this.ctx.bursts.spawn(BurstMode.WATER, st.center, {
      radius: 0.3,
      endRadius: c.burstSize * power,
      life: 0.55,
      intensity: 1.1,
      opacity: 0.8,
      fresnel: 2.2,
      displace: 0.6,
      turbulence: 1.4,
      squash: 0.6,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, st.center, {
      radius: c.zoneRadius * 1.5 * power,
      life: 0.55,
      width: 0.07,
      intensity: 1.1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.RIPPLE, st.center, {
      radius: c.zoneRadius * 1.1,
      life: 1.2,
      intensity: 0.8,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });

    /* a gout straight up the middle */
    this._resetEmit(time);
    _emit.position = st.center;
    _emit.radius = c.columnRadius;
    _emit.direction = _up;
    _emit.speed = c.dropSpeed * 2.2;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.25;
    _emit.size = c.dropSize * 1.3;
    _emit.life = c.dropLife * 1.4;
    this.drops.emit(Math.round(c.eruptDrops * g.particleCount), _emit);
    _emit.speed = c.dropSpeed * 2.6;
    _emit.size = c.dropSize * 0.6;
    this.spray.emit(Math.round(c.eruptDrops * 0.6 * g.particleCount), _emit);
    _emit.radius = c.columnRadius * 2;
    _emit.speed = c.mistLift * 2;
    _emit.spread = 1.4;
    _emit.size = c.mistSize * 1.3;
    _emit.life = c.mistLife;
    _emit.spin = 0.6;
    this.mist.emit(Math.round(20 * g.particleCount), _emit);

    this._eruptHits();
    this.ctx.shake.add(c.eruptShake * power, 1 / Math.max(0.05, c.shakeDuration), 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.eruptFlash * power);
    this.lightBoost = c.lightIntensity * c.eruptLight * power;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const st = this._shape;
    const fs = this._fontState;
    this._flow += c.flowSpeed * dt * g.noiseSpeed;

    if (t <= 1) {
      this._tau += dt / Math.max(0.05, g.lifetime);
      const tau = this._tau;
      const erupt = Math.max(0.02, c.eruptTime);
      const pour = Math.max(0, c.pourTime);
      const collapse = Math.max(0.05, c.collapseTime);

      // The seam goes dark once the blood has surfaced.
      this._seamFade = 1 - smoothstep(0, 0.5, tau);
      this.seam.visible = this._seamFade > 0.01;

      /* the fountain */
      const e = saturate(tau / erupt);
      const fall = saturate((tau - erupt - pour) / collapse);
      const surge = 1 + c.pourSurge * Math.sin(tau * TAU * c.pourPulse) * (1 - fall);
      st.height = c.height * Easing.outBack(e) * (1 - Easing.inQuad(fall)) * surge;
      st.reach = c.crownReach * lerp(0.2, 1, Easing.outCubic(e)) * (1 + 0.15 * fall);
      st.loft = c.crownLoft * Easing.outCubic(e) * (1 - fall);
      st.break = smoothstep(0.05, 0.85, fall);
      st.strength = 1 - fall;
      this.fountain.visible = st.break < 0.999 && st.height > 0.01;
      this.shimmer.visible = this.fountain.visible;

      /* the pool */
      fs.fill = smoothstep(erupt * 0.5, erupt + pour + collapse, tau);
      fs.land = st.break < 0.9 && e > 0.3 ? st.reach : -1;
      const rs = this._rainStart;
      fs.rain = smoothstep(rs, rs + 0.25, tau) * (1 - smoothstep(rs + c.rainTime * 0.7, rs + c.rainTime + 0.3, tau));
      fs.dry = 0;
      fs.fadeT = 0;

      /* the crown glow */
      const gs = this._glowState;
      gs.size = c.crownGlowSize * (0.6 + 0.4 * e);
      gs.intensity = (1.6 * Math.exp(-tau * 3) + 0.6) * (1 - fall);
      this.glow.visible = gs.intensity > 0.01;

      if (!this._rained && tau >= rs) {
        this._rained = true;
        this._rainHits();
      }

      this._syncAll();
      this._crownFx(dt, 1 - fall);
      this._rainFx(dt, fs.rain);
      this._updateAnointed(dt);
      this.position.copy(st.center);
      this.position.y = Math.max(0.5, st.height * 0.8);
      return;
    }

    /* the drain */
    const ft = saturate(t - 1);
    this.fountain.visible = false;
    this.shimmer.visible = false;
    this.glow.visible = false;
    this.seam.visible = false;
    fs.fill = 1;
    fs.land = -1;
    fs.rain = 0;
    fs.dry = smoothstep(0, 0.6, ft);
    fs.fadeT = smoothstep(0.45, 1, ft);
    this._syncAll();
    this._poolMist(dt, 1 - ft);
    this._updateAnointed(dt);
    this.position.copy(st.center);
    this.position.y = 0.4;
  }

  /** Droplets torn off the crown's lip, and spray off the top of the column. */
  _crownFx(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const st = this._shape;
    const n = Math.round(this.crownEmitter.tick(dt, c.crownDrops * strength) * g.particleCount);
    if (n <= 0 || st.height < 0.05) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.dropSize;
    _emit.life = c.dropLife;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      if (Math.random() < 0.6) {
        // off the lip, low down, flung outward
        const r = st.reach * (0.85 + 0.2 * Math.random());
        _pos.set(st.center.x + ca * r, 0.3 + Math.random() * 0.6, st.center.z + sa * r);
        _dir.set(ca, 0.6, sa);
        _emit.speed = c.dropSpeed * 0.7;
        _emit.spread = 0.4;
        _emit.position = _pos;
        _emit.direction = _dir;
        this.drops.emit(1, _emit);
      } else {
        // off the turn-over at the top
        const r = c.columnRadius * 0.8;
        _pos.set(st.center.x + ca * r, st.height + st.loft * 0.3, st.center.z + sa * r);
        _dir.set(ca * 0.6, 1, sa * 0.6);
        _emit.speed = c.dropSpeed;
        _emit.spread = 0.5;
        _emit.position = _pos;
        _emit.direction = _dir;
        if (Math.random() < 0.5) this.spray.emit(1, _emit);
        else this.drops.emit(1, _emit);
      }
    }
  }

  /** The blood coming back down over the whole circle. */
  _rainFx(dt, rain) {
    const c = settings[ID];
    const g = settings.global;
    const st = this._shape;
    const n = Math.round(this.rainEmitter.tick(dt, c.rainRate * rain) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.direction = _down;
    _emit.speed = c.rainSpeed;
    _emit.speedVariance = 0.2;
    _emit.spread = 0.04;
    _emit.size = c.rainSize;
    _emit.life = c.rainHeight / Math.max(1, c.rainSpeed) * 1.05;
    _emit.lifeVariance = 0.1;
    const R = this.radius * 1.05;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = R * Math.sqrt(Math.random());
      _pos.set(st.center.x + Math.cos(a) * r, c.rainHeight * (0.8 + 0.4 * Math.random()), st.center.z + Math.sin(a) * r);
      _emit.position = _pos;
      this.rain.emit(1, _emit);
    }
  }

  /** A little mist off the draining pool. */
  _poolMist(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.mistEmitter.tick(dt, c.poolMist * strength) * g.particleCount);
    if (n <= 0) return;
    const st = this._shape;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.mistSize;
    _emit.life = c.mistLife;
    _emit.speed = c.mistLift * 0.5;
    _emit.spread = 0.4;
    _emit.spin = 0.4;
    _emit.direction = _up;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = this.radius * Math.sqrt(Math.random()) * 0.9;
      _pos.set(st.center.x + Math.cos(a) * r, 0.1, st.center.z + Math.sin(a) * r);
      _emit.position = _pos;
      this.mist.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Hits                                                                */
  /* ------------------------------------------------------------------ */

  /** The eruption throws whatever stands over the source straight up. */
  _eruptHits() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const st = this._shape;
    const found = field.findTargets(st.center.x, st.center.z, c.eruptRadius, this._found);
    for (const dummy of found) {
      _dir.set(dummy.position.x - st.center.x, 0, dummy.position.z - st.center.z);
      const d = _dir.length();
      if (d < 1e-3) _dir.set(this.direction.x, 0, this.direction.z);
      else _dir.multiplyScalar(1 / d);
      const close = 1 - saturate(d / Math.max(0.1, c.eruptRadius));
      this._force.impulse = c.eruptImpulse * power;
      this._force.lift = c.eruptLift * lerp(0.6, 1, close) * power;
      this._force.spin = c.hitSpin;
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      this._anoint(dummy, 1.2);
    }
  }

  /** The rain beats down everything still standing in the circle. */
  _rainHits() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const st = this._shape;
    const found = field.findTargets(st.center.x, st.center.z, this.radius, this._found);
    this._force.impulse = c.rainImpulse * power;
    this._force.lift = c.rainLift * power;
    this._force.spin = c.hitSpin * 0.5;
    for (const dummy of found) {
      _dir.set(dummy.position.x - st.center.x, 0, dummy.position.z - st.center.z);
      if (_dir.lengthSq() < 1e-6) _dir.set(this.direction.x, 0, this.direction.z);
      _dir.normalize();
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      this._anoint(dummy, 0.6);
    }
  }

  _anoint(dummy, scale) {
    const c = settings[ID];
    const g = settings.global;
    if (this._anointedCount < MAX_ANOINTED) {
      const slot = this._anointed[this._anointedCount++];
      slot.dummy = dummy;
      slot.time = 0;
    }
    this._resetEmit(frame.uTime.value);
    _pos.copy(dummy.position).setY(1.0);
    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _up;
    _emit.speed = c.dropSpeed * 0.8;
    _emit.spread = 0.8;
    _emit.size = c.dropSize;
    _emit.life = c.dropLife;
    this.drops.emit(Math.round(22 * scale * g.particleCount), _emit);
  }

  _updateAnointed(dt) {
    const c = settings[ID];
    const look = this._look;
    look.color = c.colorAnointedBody;
    look.rimColor = c.colorAnointedRim;
    look.rimEmissive = c.anointedRimGlow;
    look.edgeColor = c.colorAnointedRim;
    look.edgeEmissive = c.anointedRimGlow;
    look.edgeWidth = 0.05;
    for (let i = 0; i < this._anointedCount; i++) {
      const slot = this._anointed[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) continue;
      slot.time += dt;
      dummy.corrode(saturate(slot.time / Math.max(0.05, c.anointTime)) * c.anoint, look);
    }
  }

  _releaseAnointed() {
    for (let i = 0; i < this._anointedCount; i++) this._anointed[i].dummy = null;
    this._anointedCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.seam.visible = false;
    this.font.visible = false;
    this.fountain.visible = false;
    this.shimmer.visible = false;
    this.glow.visible = false;
    this._releaseAnointed();
  }

  dispose() {
    this.fountainGeometry.dispose();
    this.stripGeometry.dispose();
    this.quadGeometry.dispose();
    this.seamMaterial.dispose();
    this.fontMaterial.dispose();
    this.fountainMaterial.dispose();
    this.shimmerMaterial.dispose();
    this.glowMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⛲  Crimson Baptism');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'zoneRadius', 0.5, 12, 0.05, 'circle radius (m)');
  R(cast, c, 'speed', 4, 90, 0.5, 'seam speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'pool drains over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');

  const seam = folder.addFolder('1 · The seam');
  R(seam, c, 'seamStart', 0, 4, 0.01, 'starts after (m)');
  R(seam, c, 'seamWidth', 0.01, 0.5, 0.005, 'crack width (m)');
  R(seam, c, 'seamWander', 0, 1.5, 0.01, 'wander (m)');
  R(seam, c, 'seamGlow', 0, 10, 0.05, 'glow');
  R(seam, c, 'seamHeadGlow', 0, 10, 0.05, 'head glow');
  R(seam, c, 'seamCool', 0.1, 20, 0.05, 'glows behind the head (m)');
  R(seam, c, 'seamDrops', 0, 300, 1, 'bubbling drops/second');
  R(seam, c, 'seamRumble', 0, 1, 0.01, 'rumble');
  seam.addColor(c, 'colorSeamHot').name('hot');
  seam.addColor(c, 'colorSeamWet').name('wet');

  const shape = folder.addFolder('2 · The fountain');
  R(shape, c, 'height', 0.5, 14, 0.05, 'column height (m)');
  R(shape, c, 'columnRadius', 0.05, 2, 0.01, 'column radius (m)');
  R(shape, c, 'columnShare', 0.1, 0.9, 0.01, 'column share of the flow');
  R(shape, c, 'crownReach', 0.3, 10, 0.05, 'crown lands at (m)');
  R(shape, c, 'crownLoft', 0, 5, 0.01, 'crown loft (m)');
  R(shape, c, 'wobble', 0, 0.6, 0.005, 'wobble');
  R(shape, c, 'twist', -4, 4, 0.01, 'twist');
  R(shape, c, 'flowSpeed', 0, 30, 0.1, 'flow speed');
  R(shape, c, 'eruptTime', 0.02, 2, 0.01, 'erupts over (s)');
  R(shape, c, 'pourTime', 0, 4, 0.01, 'pours for (s)');
  R(shape, c, 'pourSurge', 0, 0.5, 0.005, 'pour surge');
  R(shape, c, 'pourPulse', 0, 8, 0.05, 'surges/second');
  R(shape, c, 'collapseTime', 0.05, 3, 0.01, 'collapses over (s)');

  const look = folder.addFolder('3 · Blood sheet');
  R(look, c, 'streakScale', 0.2, 10, 0.05, 'streak scale');
  R(look, c, 'coreGlow', 0, 10, 0.05, 'column glow');
  R(look, c, 'sheen', 0, 4, 0.01, 'sheen');
  R(look, c, 'gloss', 0, 4, 0.01, 'gloss');
  R(look, c, 'fountainOpacity', 0, 1, 0.01, 'opacity');
  R(look, c, 'crownOpacity', 0, 1, 0.01, 'crown sheet opacity (× opacity)');
  R(look, c, 'lipTear', 0, 1.5, 0.01, 'lip tear');
  R(look, c, 'shimmer', 0, 3, 0.01, 'air shimmer');
  R(look, c, 'shimmerWidth', 1, 4, 0.01, 'shimmer width (× column)');
  R(look, c, 'crownGlowSize', 0.1, 6, 0.05, 'crown bloom (m)');
  R(look, c, 'crownGlow', 0, 8, 0.05, 'crown bloom strength');
  look.addColor(c, 'colorFountainDeep').name('deep');
  look.addColor(c, 'colorFountainBody').name('body');
  look.addColor(c, 'colorFountainHot').name('glow');
  look.addColor(c, 'colorFountainSheen').name('sheen');
  look.addColor(c, 'colorCrownCore').name('bloom core');
  look.addColor(c, 'colorCrownHalo').name('bloom halo');

  const font = folder.addFolder('4 · The font');
  R(font, c, 'poolOpacity', 0, 1, 0.01, 'opacity');
  R(font, c, 'poolGloss', 0, 4, 0.01, 'gloss');
  R(font, c, 'poolEdgeGlow', 0, 6, 0.05, 'edge glow');
  R(font, c, 'rippleCell', 0.1, 2, 0.01, 'ripple spacing (m)');
  R(font, c, 'rippleRate', 0, 6, 0.05, 'ripples/second');
  R(font, c, 'rippleGlow', 0, 6, 0.05, 'ripple glow');
  R(font, c, 'poolMist', 0, 100, 1, 'mist/second as it drains');
  font.addColor(c, 'colorPool').name('pool');
  font.addColor(c, 'colorPoolLit').name('pool lit');
  font.addColor(c, 'colorRipple').name('ripples');
  font.addColor(c, 'colorDry').name('dried');

  const rain = folder.addFolder('5 · The rain');
  R(rain, c, 'rainTime', 0.1, 5, 0.05, 'rains for (s)');
  R(rain, c, 'rainRate', 0, 3000, 10, 'drops/second');
  R(rain, c, 'rainHeight', 1, 16, 0.1, 'falls from (m)');
  R(rain, c, 'rainSpeed', 1, 40, 0.1, 'speed (m/s)');
  R(rain, c, 'rainGravity', 0, 30, 0.1, 'gravity');
  R(rain, c, 'rainSize', 0.005, 0.2, 0.001, 'size');
  R(rain, c, 'rainStretch', 0, 1, 0.005, 'stretch');
  R(rain, c, 'rainGlow', 0, 4, 0.05, 'glow');
  R(rain, c, 'rainOpacity', 0, 1, 0.01, 'opacity');
  Editor.gradient(rain, c, 'colorRain', 'rain gradient');

  const fx = folder.addFolder('6 · Droplets & mist');
  R(fx, c, 'eruptDrops', 0, 600, 1, 'eruption drops');
  R(fx, c, 'crownDrops', 0, 600, 1, 'crown drops/second');
  R(fx, c, 'dropSize', 0.005, 0.4, 0.001, 'drop size');
  R(fx, c, 'dropSpeed', 0, 20, 0.05, 'drop speed');
  R(fx, c, 'dropLife', 0.1, 4, 0.05, 'drop lifetime');
  R(fx, c, 'dropGravity', 0, 30, 0.1, 'drop gravity');
  R(fx, c, 'dropStretch', 0, 1, 0.005, 'drop stretch');
  R(fx, c, 'dropGlow', 0, 4, 0.05, 'drop glow');
  R(fx, c, 'sprayGlow', 0, 8, 0.05, 'spray glow');
  R(fx, c, 'mistSize', 0.05, 4, 0.01, 'mist size');
  R(fx, c, 'mistLift', 0, 5, 0.01, 'mist rise');
  R(fx, c, 'mistLife', 0.1, 6, 0.05, 'mist lifetime');
  R(fx, c, 'mistOpacity', 0, 1, 0.01, 'mist opacity');
  Editor.gradient(fx, c, 'colorDrop', 'drop gradient');
  Editor.gradient(fx, c, 'colorSpray', 'spray gradient');
  Editor.gradient(fx, c, 'colorMist', 'mist gradient');

  const erupt = folder.addFolder('7 · Eruption & hits');
  R(erupt, c, 'burstSize', 0, 8, 0.05, 'splash dome (m)');
  R(erupt, c, 'eruptShake', 0, 1.5, 0.01, 'camera knock');
  R(erupt, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(erupt, c, 'eruptFlash', 0, 1, 0.01, 'flash');
  R(erupt, c, 'eruptLight', 0, 8, 0.01, 'light punch (× intensity)');
  R(erupt, c, 'eruptRadius', 0, 6, 0.05, 'thrown up within (m)');
  R(erupt, c, 'eruptImpulse', 0, 20, 0.1, 'thrown out (m/s)');
  R(erupt, c, 'eruptLift', 0, 30, 0.1, 'thrown up (m/s)');
  R(erupt, c, 'rainImpulse', 0, 15, 0.1, 'rain knock (m/s)');
  R(erupt, c, 'rainLift', 0, 10, 0.05, 'rain lift (m/s)');
  R(erupt, c, 'hitSpin', 0, 6, 0.01, 'tumble');
  R(erupt, c, 'anoint', 0, 1, 0.01, 'anointed');
  R(erupt, c, 'anointTime', 0.05, 4, 0.05, 'anointed over (s)');
  R(erupt, c, 'anointedRimGlow', 0, 8, 0.05, 'anointed rim glow');
  erupt.addColor(c, 'colorBurstA').name('splash inner');
  erupt.addColor(c, 'colorBurstB').name('splash mid');
  erupt.addColor(c, 'colorBurstC').name('splash outer');
  erupt.addColor(c, 'colorShockA').name('shockwave');
  erupt.addColor(c, 'colorShockB').name('shockwave hot');
  erupt.addColor(c, 'colorFlash').name('flash');
  erupt.addColor(c, 'colorAnointedBody').name('anointed body');
  erupt.addColor(c, 'colorAnointedRim').name('anointed rim');

  folder.close();
  return folder;
}
