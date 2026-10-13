import { Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createFunnelGeometry } from '../../assets/collective/TempestSpiralGeometry.js';
import {
  createFunnelMaterial,
  createTempestWarpMaterial
} from '../../materials/collective/TempestSpiralMaterial.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing, randRange } from '../../utils/math.js';

export const ID = 'tempest';

/** Bodies one column can hold at once. Fixed so a cast allocates nothing. */
const MAX_GRIPS = 8;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _at = new Vector3();
const _axis = new Vector3();

/**
 * TEMPEST SPIRAL — a tornado that lifts what it catches.
 *
 * A zone cast in two acts. The **travel** is a small dust devil skimming the
 * floor from the caster to the circle, kicking dust behind it; the **impact**
 * is that devil standing up into a full column which picks the bodies in the
 * circle off the floor, winds them up its throat, and throws them clear when
 * it dies.
 *
 * Seven layers, each a folder in the editor:
 *
 *   1. **the dust devil** — the funnel shader at a tenth of the size, riding the
 *      travelling front with its top snaking behind it.
 *   2. **the funnel** — two open lathe shells drawn in *parameter space* (see
 *      `createFunnelGeometry`): an occluding dust shell and an additive wind
 *      shell a little inside it, spinning the other way. Two surfaces shearing
 *      past each other is what reads as air; one is a texture on a cone.
 *   3. **the dust skirt** — non-additive SMOKE wound round the base on a swirl
 *      anchor, plus DUSTRING decals pulsing out across the floor. This is what
 *      plants the column: without it the funnel hovers.
 *   4. **debris** — lit CHIPs orbiting up the column on the same anchor trick,
 *      their orbit opening as they climb so they trace the flare.
 *   5. **wind streaks** — additive STREAKs fired tangentially round the wall,
 *      velocity-stretched, the fastest thing in the frame.
 *   6. **distortion** — a billboard on LAYER.DISTORTION round the base whose
 *      warp is itself rotated by height and time, so the refraction turns.
 *   7. **the impact** — an AIR pressure shell squashed flat, a shockwave, a
 *      knock on the camera and a punch of light on touchdown.
 *
 * ## The bodies
 *
 * This class answers `handlesOwnHits`. While the column stands it polls
 * `findBodies` inside `zoneRadius`; a standing body is knocked off its feet
 * (gently — the wind takes it, it is not struck), and from then on every body
 * it holds is handed to `Dummy#carry` with a velocity field: tangential orbit,
 * a spring toward the funnel wall at the body's own height, and a climb toward
 * `liftCeiling`. The wind carries most of the body's weight through `carry`'s
 * buoyancy — the only formulation that means the same thing at every frame
 * rate. When the column collapses, each body gets one frame of an *outward*
 * field with a full grab, and is let go: that is the fling.
 *
 * ## The rule that makes the editor work
 *
 * A cast captures a seed and three integrated phases (spin, rise, sway) — the
 * phases have to be integrated, or dragging `spin` mid-cast would snap the
 * funnel to a new angle. Every metre is resolved from `settings.tempest`
 * every frame, so the column re-shapes under the slider while it stands.
 */
export class TempestSpiralAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** It picks its own, and holds them. A disc that flung them outward on the
   *  frame of touchdown would throw them clear of the thing meant to lift them. */
  get handlesOwnHits() {
    return true;
  }

  /** Bodies currently in the wind. HUD readout only. */
  get instanceCount() {
    return this._gripCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.funnelGeometry = createFunnelGeometry(56, 48);
    this.devilGeometry = createFunnelGeometry(28, 20);

    this.outerMaterial = createFunnelMaterial('outer');
    this.innerMaterial = createFunnelMaterial('inner');
    this.devilMaterial = createFunnelMaterial('devil');

    this.outer = new Mesh(this.funnelGeometry, this.outerMaterial);
    this.inner = new Mesh(this.funnelGeometry, this.innerMaterial);
    this.devil = new Mesh(this.devilGeometry, this.devilMaterial);
    // The wind shell is drawn after the dust so it adds over it, not under.
    this.outer.renderOrder = 10;
    this.inner.renderOrder = 11;
    this.devil.renderOrder = 10;
    for (const mesh of [this.outer, this.inner, this.devil]) {
      // Parameter-space vertices: the bounding volume means nothing.
      mesh.frustumCulled = false;
      mesh.layers.set(LAYER.VFX);
      mesh.visible = false;
      this.group.add(mesh);
    }

    /* ---- layer 6: the warp ---- */
    this.warpGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.warpMaterial = createTempestWarpMaterial();
    this.warp = new Mesh(this.warpGeometry, this.warpMaterial);
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.warp.visible = false;
    this.group.add(this.warp);

    /** Scratch handed to the materials each frame — one object apiece, reused. */
    this._funnelState = {
      height: 1,
      base: 0.5,
      top: 3,
      flare: 2,
      sway: 0,
      spinPhase: 0,
      swayPhase: 0,
      risePhase: 0,
      collapse: 0,
      fade: 1,
      seed: 0
    };
    this._innerState = { ...this._funnelState };
    this._devilState = { ...this._funnelState };
    this._warpState = { width: 1, height: 1, strength: 0, seed: 0 };

    /* ---- the grip ---- */
    this._grips = [];
    for (let i = 0; i < MAX_GRIPS; i++) this._grips.push({ dummy: null, time: 0 });
    this._gripCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    /** What the field reads. Written once per frame, read once per joint. */
    this._flow = { cx: 0, cz: 0, ceiling: 1, orbit: 0, pull: 0, climb: 0, fling: 0, flingLift: 0, height: 1 };
    this._liftField = (x, y, z, out) => this._sampleLift(x, y, z, out);
    this._flingField = (x, y, z, out) => this._sampleFling(x, y, z, out);

    this._seed = 0;
    this._spin = 0;
    this._innerSpin = 0;
    this._devilSpin = 0;
    this._rise = 0;
    this._swayPhase = 0;
    this._height = 0;
    this._collapse = 0;
    this._flung = false;
    this._ringClock = 0;
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 3: the skirt ---- */
    // Not additive: the dust has to sit *in front of* the base of the funnel
    // and dirty it, and additive dust is a glow.
    this.dust = particles.get('tempest.dust', {
      capacity: 2600,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 1.0
    });
    this.dust.uniforms.uSizeIn.value = 0.12;
    this.dust.uniforms.uFadeIn.value = 0.14;
    this.dust.uniforms.uFadeOut.value = 0.4;
    this.dust.uniforms.uEndSize.value = 2.4;
    this.dust.uniforms.uDrag.value = 1.4;

    /* ---- layer 4: debris ---- */
    this.debris = particles.get('tempest.debris', {
      capacity: 1600,
      shape: ParticleShape.CHIP,
      additive: false,
      swirl: true,
      lit: true,
      softFade: 0.2
    });
    this.debris.uniforms.uSizeIn.value = 0.03;
    this.debris.uniforms.uFadeIn.value = 0.04;
    this.debris.uniforms.uFadeOut.value = 0.75;
    this.debris.uniforms.uEndSize.value = 0.85;

    /* ---- layer 5: wind streaks ---- */
    this.streaks = particles.get('tempest.streaks', {
      capacity: 1400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.3
    });
    this.streaks.uniforms.uSizeIn.value = 0.05;
    this.streaks.uniforms.uFadeIn.value = 0.1;
    this.streaks.uniforms.uFadeOut.value = 0.5;
    this.streaks.uniforms.uEndSize.value = 0.6;
    this.streaks.uniforms.uDrag.value = 0.6;
    this.streaks.uniforms.uGravity.value.set(0, 0, 0);

    this.dustEmitter = new RateEmitter();
    this.debrisEmitter = new RateEmitter();
    this.streakEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get impactDuration() {
    return Math.max(0.3, settings.tempest.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.2, settings.tempest.collapseTime * settings.global.lifetime);
  }

  /** Wind gusts: a quick, irregular flutter rather than a slow shimmer. */
  lightShimmer() {
    const f = settings.tempest.lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 11.3) * Math.sin(this.age * 4.1 + 1.3));
  }

  /* ------------------------------------------------------------------ */
  /* Geometry, resolved from the live settings                           */
  /* ------------------------------------------------------------------ */

  get radius() {
    return Math.max(0.1, settings.tempest.zoneRadius);
  }

  _centrePoint(out) {
    return this.pointAt(1, out).setY(0);
  }

  /** Funnel radius at height fraction `v` — the vertex shader's curve, on the CPU. */
  _funnelRadius(v) {
    const c = settings.tempest;
    return lerp(c.baseRadius, c.topRadius, Math.pow(saturate(v), Math.max(0.05, c.flare)));
  }

  /** The bent axis at height fraction `v`, written into `out.x/z` (mirrors `swayAt`). */
  _swayAt(v, out) {
    const c = settings.tempest;
    const bend = c.sway * Math.pow(saturate(v), 1.3);
    const k = v * c.swayFrequency * TAU;
    out.set(
      bend * Math.sin(k - this._swayPhase + this._seed),
      0,
      bend * Math.cos(k * 0.83 - this._swayPhase * 0.77 + this._seed * 1.7)
    );
    return out;
  }

  /** How far the column has risen, 0 → 1 by way of one overshoot. */
  _riseAmount() {
    const c = settings.tempest;
    const t = this.phase === AbilityPhase.TRAVEL ? 0 : this.impactTime + (this.phase === AbilityPhase.FADE ? 1e3 : 0);
    const riseTime = Math.max(0.05, c.riseTime);
    const peak = 1 + c.riseOvershoot;
    if (t <= riseTime) return Easing.outQuint(t / riseTime) * peak;
    return peak - c.riseOvershoot * Easing.outCubic(saturate((t - riseTime) / (riseTime * 1.5)));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.dustEmitter.reset();
    this.debrisEmitter.reset();
    this.streakEmitter.reset();
    this._releaseGrips();

    // The one thing a cast captures. Everything else is resolved per frame.
    this._seed = Math.random() * 100;
    this._spin = Math.random() * TAU;
    this._innerSpin = Math.random() * TAU;
    this._devilSpin = Math.random() * TAU;
    this._rise = 0;
    this._swayPhase = 0;
    this._height = 0;
    this._collapse = 0;
    this._flung = false;
    this._ringClock = 0;

    this.outer.visible = false;
    this.inner.visible = false;
    this.warp.visible = false;
    this.devil.visible = true;

    // A puff off the caster's feet as the devil spins up.
    const c = settings.tempest;
    const g = settings.global;
    _pos.copy(this.origin).setY(0.25);
    _emit.position = _pos;
    _emit.radius = 0.4;
    _emit.direction = _dir.copy(this.direction).setY(0.3).normalize();
    _emit.speed = c.skirtSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.9;
    _emit.inherit = null;
    _emit.anchor = _pos;
    _emit.size = c.skirtSize * 0.6;
    _emit.sizeVariance = 0.5;
    _emit.life = c.skirtLifetime * 0.6;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0.5;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.dust.emit(Math.round(14 * g.particleCount), _emit);
  }

  /** Spin, rise and sway are *integrated*, so a slider move mid-cast never snaps. */
  _advancePhases(dt) {
    const c = settings.tempest;
    const g = settings.global;
    this._spin += c.spin * TAU * dt * g.animationSpeed;
    this._innerSpin += c.innerSpin * TAU * dt * g.animationSpeed;
    this._devilSpin += c.devilSpin * TAU * dt * g.animationSpeed;
    this._rise += c.rise * dt * g.noiseSpeed;
    this._swayPhase += c.swaySpeed * dt * g.noiseSpeed;
  }

  _syncParticles() {
    const c = settings.tempest;
    const g = settings.global;

    const d = this.dust.uniforms;
    this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
    d.uGravity.value.set(0, c.skirtRise, 0);
    d.uSwirl.value = c.skirtSwirl;
    d.uSwirlExpand.value = c.skirtExpand;
    d.uSizeScale.value = g.particleSize;
    d.uLifeScale.value = g.particleLifetime;
    d.uSpeedScale.value = g.particleSpeed;
    d.uOpacity.value = c.skirtOpacity * g.opacity;
    d.uTurbulence.value = c.skirtTurbulence * g.turbulence;

    const b = this.debris.uniforms;
    this.debris.setGradient(getColor(c.colorDebrisA), getColor(c.colorDebrisB), getColor(c.colorDebrisC), getColor(c.colorDebrisD));
    b.uGravity.value.set(0, c.debrisGravity, 0);
    b.uDrag.value = c.debrisDrag;
    b.uSwirl.value = c.debrisSwirl;
    b.uSwirlExpand.value = c.debrisExpand;
    b.uSizeScale.value = g.particleSize;
    b.uLifeScale.value = g.particleLifetime;
    b.uSpeedScale.value = g.particleSpeed;
    b.uOpacity.value = g.opacity;
    b.uTurbulence.value = 0.3 * g.turbulence;

    const s = this.streaks.uniforms;
    this.streaks.setGradient(getColor(c.colorStreakA), getColor(c.colorStreakB), getColor(c.colorStreakC), getColor(c.colorStreakD));
    s.uStretch.value = c.streakStretch;
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uGlow.value = c.streakGlow * g.glow;
    s.uTurbulence.value = 0.2 * g.turbulence;
  }

  /** Write the funnel's live shape into one of the state objects. */
  _shapeFunnel(state, height, phase, collapse, fade) {
    const c = settings.tempest;
    state.height = height;
    state.base = c.baseRadius;
    state.top = c.topRadius;
    state.flare = c.flare;
    state.sway = c.sway;
    state.spinPhase = phase;
    state.swayPhase = this._swayPhase;
    state.risePhase = this._rise;
    state.collapse = collapse;
    state.fade = fade;
    state.seed = this._seed;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — the dust devil                                             */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.tempest;
    const g = settings.global;
    const time = frame.uTime.value;

    this._advancePhases(dt);
    this._syncParticles();

    // Spins up off the caster's hand rather than appearing at full size.
    const grow = Easing.outCubic(saturate(this.age / 0.25));
    const devil = this._devilState;
    this._shapeFunnel(devil, c.devilHeight * grow, this._devilSpin, 0, grow);
    devil.base = c.devilBase;
    devil.top = c.devilTop;
    devil.flare = 1.4;
    devil.sway = c.devilSway;
    this.devilMaterial.userData.sync(devil);
    this.devil.position.copy(this.position).setY(0);
    this.devil.visible = true;

    // The light rides the devil.
    this.position.y = c.devilHeight * 0.5;

    /* dust kicked up behind it, wound round its foot */
    const puffs = Math.round(this.dustEmitter.tick(dt, c.devilDust) * g.particleCount);
    if (puffs > 0) {
      _pos.copy(this.position).setY(0.2);
      _emit.position = _pos;
      _emit.radius = c.devilTop * 0.7;
      // Trails backward down the line: the devil is moving through the dust.
      _emit.direction = _dir.copy(this.direction).multiplyScalar(-0.6).setY(0.4).normalize();
      _emit.speed = c.skirtSpeed * 0.4;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.6;
      _emit.inherit = null;
      _emit.anchor = _pos;
      _emit.size = c.skirtSize * 0.55;
      _emit.sizeVariance = 0.5;
      _emit.life = c.skirtLifetime * 0.6;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0.6;
      _emit.tint = null;
      _emit.time = time;
      this.dust.emit(puffs, _emit);
    }

    const chips = Math.round(this.debrisEmitter.tick(dt, c.devilChips) * g.particleCount);
    if (chips > 0) {
      _pos.copy(this.position).setY(0.15);
      _emit.position = _pos;
      _emit.radius = c.devilBase * 2.5;
      _emit.direction = _dir.set(0, 1, 0);
      _emit.speed = c.debrisClimb * 0.45;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.25;
      _emit.inherit = null;
      _emit.anchor = _pos;
      _emit.size = c.debrisSize * 0.8;
      _emit.sizeVariance = 0.6;
      _emit.life = c.debrisLifetime * 0.35;
      _emit.lifeVariance = 0.4;
      _emit.spin = 6;
      _emit.tint = null;
      _emit.time = time;
      this.debris.emit(chips, _emit);
    }

    this._streakFx(dt, this.position, c.devilHeight * grow, c.devilTop, 0.35);
    this.ctx.shake.rumble(c.devilRumble, dt);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the column stands up                                       */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings.tempest;
    const g = settings.global;
    const time = frame.uTime.value;

    this.devil.visible = false;
    this.outer.visible = true;
    this.inner.visible = true;
    this.warp.visible = true;

    const centre = this._centrePoint(_centre);

    /* a flat shell of pressure leaving the floor */
    _pos.copy(centre).setY(0.4);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: c.burstSize * 0.2,
      endRadius: c.burstSize * g.explosionIntensity,
      life: 0.55,
      intensity: c.burstIntensity,
      opacity: 0.5,
      fresnel: 2.2,
      displace: 0.4,
      squash: 0.3,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    this.ctx.decals.spawn(DecalType.SHOCKWAVE, centre, {
      radius: c.shockRadius * g.explosionIntensity,
      life: 0.65,
      width: 0.07,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, centre, {
      radius: c.skirtRadius * 1.3,
      life: c.ringLife * 1.4,
      intensity: c.ringIntensity,
      colorA: getColor(c.colorRingA),
      colorB: getColor(c.colorRingB)
    });

    /* the floor's loose dirt thrown up in one go */
    _pos.copy(centre).setY(0.3);
    _emit.position = _pos;
    _emit.radius = c.skirtRadius * 0.6;
    _emit.direction = _dir.set(0, 1, 0);
    _emit.speed = c.skirtSpeed * 1.3;
    _emit.speedVariance = 0.6;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = centre;
    _emit.size = c.skirtSize * 1.2;
    _emit.sizeVariance = 0.5;
    _emit.life = c.skirtLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0.5;
    _emit.tint = null;
    _emit.time = time;
    this.dust.emit(Math.round(40 * g.particleCount), _emit);

    this.ctx.shake.add(c.impactShake * g.explosionIntensity, 1 / Math.max(0.1, c.shakeDuration), 16);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * g.explosionIntensity);
    this.lightBoost = c.lightIntensity * 1.2 * g.explosionIntensity;
  }

  onFade(dt, t) {
    const c = settings.tempest;
    const g = settings.global;

    this._advancePhases(dt);
    this._syncParticles();

    const centre = this._centrePoint(_centre);
    const rise = this._riseAmount();
    const height = c.height * rise;
    this._height = height;

    /* --- the collapse: bottom up, over the fade --- */
    let collapse = 0;
    let fade = 1;
    if (this.phase === AbilityPhase.FADE) {
      const ft = saturate(this.fadeTime / this.fadeDuration);
      collapse = Easing.inOutQuad(ft);
      fade = 1 - Easing.inCubic(ft);
      if (!this._flung) this._fling(centre);
    }
    this._collapse = collapse;

    this._shapeFunnel(this._funnelState, height, this._spin, collapse, fade);
    this.outerMaterial.userData.sync(this._funnelState);
    this._shapeFunnel(this._innerState, height * 0.97, this._innerSpin, collapse, fade);
    this.innerMaterial.userData.sync(this._innerState);
    this.outer.position.copy(centre);
    this.inner.position.copy(centre);

    /* --- layer 6: the base warp --- */
    const ws = this._warpState;
    ws.width = c.skirtRadius * c.warpWidth;
    ws.height = Math.max(0.2, height * c.warpHeight);
    ws.strength = Math.min(1, rise) * (1 - collapse);
    ws.seed = this._seed;
    this.warpMaterial.userData.sync(ws);
    this.warp.position.set(centre.x, ws.height * 0.5, centre.z);

    // The light sits in the throat of the column.
    this.position.set(centre.x, height * c.lightHeight, centre.z);

    /* --- what the standing column keeps doing --- */
    // `strength` falls as the bottom is eaten, so the dust is shed rather than
    // switched off.
    const strength = Math.min(1, rise) * (1 - collapse);
    if (strength > 0.01) this._columnFx(dt, centre, height, strength);

    /* --- the bodies --- */
    if (this.phase === AbilityPhase.IMPACT) {
      this._capture(centre);
      this._lift(dt, centre, height, Math.min(1, rise));
      this.ctx.shake.rumble(c.colRumble * strength, dt);
    }
  }

  /* ------------------------------------------------------------------ */
  /* The grip                                                            */
  /* ------------------------------------------------------------------ */

  _gripOf(dummy) {
    for (let i = 0; i < this._gripCount; i++) if (this._grips[i].dummy === dummy) return true;
    return false;
  }

  _dropGrip(index) {
    const last = this._gripCount - 1;
    const slot = this._grips[index];
    this._grips[index] = this._grips[last];
    this._grips[last] = slot;
    slot.dummy?.release();
    slot.dummy = null;
    slot.time = 0;
    this._gripCount = last;
  }

  _releaseGrips() {
    for (let i = 0; i < this._gripCount; i++) {
      this._grips[i].dummy?.release();
      this._grips[i].dummy = null;
      this._grips[i].time = 0;
    }
    this._gripCount = 0;
  }

  /**
   * Take hold of anything in the circle. Polled every frame, so a body thrown
   * into the circle by something else is caught on the frame it arrives.
   */
  _capture(centre) {
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    const c = settings.tempest;

    const found = field.findBodies(centre.x, centre.z, this.radius, this._found);
    this._force.impulse = c.liftImpulse;
    this._force.lift = c.liftKick;
    this._force.spin = c.liftSpin;

    for (const dummy of found) {
      if (this._gripCount >= MAX_GRIPS) break;
      if (this._gripOf(dummy)) continue;

      if (dummy.alive) {
        // Knocked *round* the column, not away from it: the wind takes the
        // body sideways off its feet, in the direction the funnel turns.
        const dx = dummy.position.x - centre.x;
        const dz = dummy.position.z - centre.z;
        const l = Math.hypot(dx, dz);
        const sign = Math.sign(c.spin) || 1;
        const tx = l > 1e-4 ? (-dz / l) * sign : this.direction.x;
        const tz = l > 1e-4 ? (dx / l) * sign : this.direction.z;
        if (!dummy.kill(tx, tz, this._force)) continue;
      } else if (!dummy.bodyPoint(_at)) {
        continue;
      }

      const slot = this._grips[this._gripCount++];
      slot.dummy = dummy;
      slot.time = 0;
    }
  }

  /**
   * The wind at one point. Sampled once per joint of every body held, so it
   * reads `_flow` rather than taking arguments, and allocates nothing.
   *
   *  - **orbit** — tangential about the (bent) axis, constant speed: the
   *    funnel turns as one body of air, which is also what keeps a held corpse
   *    from being sheared apart joint against joint.
   *  - **pull** — a spring toward the funnel wall *at that joint's height*,
   *    so a body that climbs is carried outward along the flare.
   *  - **climb** — toward the ceiling, easing off as it gets there so bodies
   *    hang in the throat rather than shooting out of the top.
   */
  _sampleLift(x, y, z, out) {
    const f = this._flow;
    const c = settings.tempest;
    const v = saturate(y / Math.max(0.1, f.height));
    this._swayAt(v, _axis);
    const rx = x - (f.cx + _axis.x);
    const rz = z - (f.cz + _axis.z);
    const r = Math.max(1e-3, Math.hypot(rx, rz));
    const want = this._funnelRadius(v) * c.liftRadius;
    const radial = (want - r) * f.pull;
    const sign = Math.sign(c.spin) || 1;
    const climb = Math.max(-f.climb, Math.min(f.climb, (f.ceiling - y) * 1.6));

    out.set(
      (rx / r) * radial + (-rz / r) * f.orbit * sign,
      climb,
      (rz / r) * radial + (rx / r) * f.orbit * sign
    );
  }

  /** The throw: outward from the axis, plus a lift, plus what is left of the orbit. */
  _sampleFling(x, y, z, out) {
    const f = this._flow;
    const rx = x - f.cx;
    const rz = z - f.cz;
    const r = Math.max(1e-3, Math.hypot(rx, rz));
    const sign = Math.sign(settings.tempest.spin) || 1;
    out.set(
      (rx / r) * f.fling - (rz / r) * f.orbit * 0.4 * sign,
      f.flingLift,
      (rz / r) * f.fling + (rx / r) * f.orbit * 0.4 * sign
    );
  }

  _lift(dt, centre, height, hold) {
    if (dt <= 0 || this._gripCount === 0) return;
    const c = settings.tempest;

    const f = this._flow;
    f.cx = centre.x;
    f.cz = centre.z;
    f.height = Math.max(0.5, height);
    f.ceiling = height * c.liftCeiling;
    f.pull = c.liftPull;

    const grab = saturate(c.liftGrab * dt);

    for (let i = this._gripCount - 1; i >= 0; i--) {
      const slot = this._grips[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished || !dummy.bodyPoint(_at)) {
        this._dropGrip(i);
        continue;
      }
      slot.time += dt;
      // Eased in: a body snapped onto the current the frame it is caught reads
      // as one dropped onto a turntable.
      const wound = Easing.outCubic(saturate(slot.time / 0.6)) * hold;
      f.orbit = c.liftOrbit * wound;
      f.climb = c.liftSpeed * wound;
      dummy.carry(this._liftField, grab * wound, grab * wound, saturate(c.liftBuoyancy * wound));
    }
  }

  /** The column lets go: one frame of an outward wind at full grab, then release. */
  _fling(centre) {
    const c = settings.tempest;
    const g = settings.global;
    this._flung = true;

    const f = this._flow;
    f.cx = centre.x;
    f.cz = centre.z;
    f.fling = c.flingSpeed * g.explosionIntensity;
    f.flingLift = c.flingLift;
    f.orbit = c.liftOrbit;

    for (let i = 0; i < this._gripCount; i++) {
      const dummy = this._grips[i].dummy;
      if (dummy && !dummy.finished && dummy.bodyPoint(_at)) dummy.carry(this._flingField, 1, 1, 0);
    }
    this._releaseGrips();

    /* the debris goes with them */
    const time = frame.uTime.value;
    _pos.copy(centre).setY(Math.max(0.5, this._height * 0.35));
    _emit.position = _pos;
    _emit.radius = c.baseRadius * 1.5;
    _emit.direction = _dir.set(0, 0.25, 0);
    _emit.speed = c.debrisFlingSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.debrisSize;
    _emit.sizeVariance = 0.6;
    _emit.life = c.debrisLifetime * 0.7;
    _emit.lifeVariance = 0.4;
    _emit.spin = 8;
    _emit.tint = null;
    _emit.time = time;
    this.debris.emit(Math.round(c.debrisFling * g.particleCount), _emit);

    // ...and the dust it was holding is shed in a last ring.
    _pos.copy(centre).setY(0.3);
    _emit.position = _pos;
    _emit.radius = c.skirtRadius * 0.5;
    _emit.direction = _dir.set(0, 0.4, 0);
    _emit.speed = c.skirtSpeed * 1.4;
    _emit.spread = 1;
    _emit.anchor = centre;
    _emit.size = c.skirtSize * 1.3;
    _emit.life = c.skirtLifetime * 1.2;
    _emit.spin = 0.5;
    this.dust.emit(Math.round(36 * g.particleCount), _emit);

    this.ctx.decals.spawn(DecalType.DUSTRING, centre, {
      radius: c.skirtRadius * 1.6,
      life: c.ringLife * 1.5,
      intensity: c.ringIntensity,
      colorA: getColor(c.colorRingA),
      colorB: getColor(c.colorRingB)
    });
    this.ctx.shake.add(c.impactShake * 0.5 * g.explosionIntensity, 2.5, 14);
    this.lightBoost = c.lightIntensity * 0.6;
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Skirt, debris, streaks and dust rings while the column stands. */
  _columnFx(dt, centre, height, strength) {
    const c = settings.tempest;
    const g = settings.global;
    const time = frame.uTime.value;

    /* layer 3: dust wound round the base */
    const puffs = Math.round(this.dustEmitter.tick(dt, c.skirtRate * strength) * g.particleCount);
    if (puffs > 0) {
      _pos.copy(centre).setY(0.35);
      _emit.position = _pos;
      // The swirl offset *is* the ball radius: puffs start round the foot of the
      // funnel and are wound outward by `skirtExpand`.
      _emit.radius = Math.max(c.baseRadius * 1.6, c.skirtRadius * 0.55);
      _emit.direction = _dir.set(0, 1, 0);
      _emit.speed = c.skirtSpeed * 0.25;
      _emit.speedVariance = 0.7;
      _emit.spread = 0.5;
      _emit.inherit = null;
      _emit.anchor = centre;
      _emit.size = c.skirtSize;
      _emit.sizeVariance = 0.5;
      _emit.life = c.skirtLifetime;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0.6;
      _emit.tint = null;
      _emit.time = time;
      this.dust.emit(puffs, _emit);
    }

    /* layer 4: debris orbiting up the column */
    const chips = Math.round(this.debrisEmitter.tick(dt, c.debrisRate * strength) * g.particleCount);
    if (chips > 0) {
      _pos.copy(centre).setY(0.2);
      _emit.position = _pos;
      _emit.radius = c.baseRadius * 1.4;
      _emit.direction = _dir.set(0, 1, 0);
      _emit.speed = c.debrisClimb;
      _emit.speedVariance = 0.45;
      _emit.spread = 0.12;
      _emit.inherit = null;
      _emit.anchor = centre;
      _emit.size = c.debrisSize;
      _emit.sizeVariance = 0.7;
      _emit.life = c.debrisLifetime;
      _emit.lifeVariance = 0.4;
      _emit.spin = 7;
      _emit.tint = null;
      _emit.time = time;
      this.debris.emit(chips, _emit);
    }

    /* layer 5 */
    this._streakFx(dt, centre, height, 0, strength);

    /* the floor keeps being scoured */
    this._ringClock += dt;
    const interval = Math.max(0.05, c.ringInterval);
    while (this._ringClock >= interval) {
      this._ringClock -= interval;
      this.ctx.decals.spawn(DecalType.DUSTRING, centre, {
        radius: c.skirtRadius * randRange(0.8, 1.15),
        life: c.ringLife,
        intensity: c.ringIntensity * strength,
        colorA: getColor(c.colorRingA),
        colorB: getColor(c.colorRingB)
      });
    }
  }

  /**
   * Wind lines fired tangentially round the wall. Each one is its own emit,
   * because each has its own tangent — there is no "direction" shared by a
   * particle on the near side of the funnel and one on the far side.
   *
   * @param {number} radiusOverride non-zero to use a fixed radius (the devil)
   */
  _streakFx(dt, centre, height, radiusOverride, strength) {
    const c = settings.tempest;
    const g = settings.global;
    const count = Math.round(this.streakEmitter.tick(dt, c.streakRate * strength) * g.particleCount);
    if (count <= 0) return;

    const time = frame.uTime.value;
    const sign = Math.sign(c.spin) || 1;
    _emit.radius = 0.05;
    _emit.speedVariance = 0.3;
    _emit.spread = 0.08;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = c.streakSize;
    _emit.sizeVariance = 0.5;
    _emit.life = c.streakLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;

    for (let n = 0; n < count; n++) {
      const v = Math.pow(Math.random(), 0.8);
      const a = Math.random() * TAU;
      const r = (radiusOverride > 0 ? radiusOverride * lerp(0.4, 1, v) : this._funnelRadius(v)) * c.streakReach;
      if (radiusOverride > 0) _axis.set(0, 0, 0);
      else this._swayAt(v, _axis);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      _pos.set(centre.x + _axis.x + ca * r, v * height + 0.1, centre.z + _axis.z + sa * r);
      // Tangent, with a little climb so the lines spiral up rather than ring.
      _dir.set(-sa * sign, 0.18, ca * sign).normalize();
      _emit.position = _pos;
      _emit.direction = _dir;
      _emit.speed = c.streakSpeed * (radiusOverride > 0 ? 0.6 : 1);
      this.streaks.emit(1, _emit);
    }
  }

  onDestroy() {
    this._releaseGrips();
    this.outer.visible = false;
    this.inner.visible = false;
    this.devil.visible = false;
    this.warp.visible = false;
  }

  dispose() {
    this._releaseGrips();
    this.funnelGeometry.dispose();
    this.devilGeometry.dispose();
    this.warpGeometry.dispose();
    this.outerMaterial.dispose();
    this.innerMaterial.dispose();
    this.devilMaterial.dispose();
    this.warpMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1F32A}  Tempest Spiral');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'devil speed (m/s)');
  R(cast, c, 'lifetime', 0.3, 12, 0.05, 'column stands for');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 0.5, 10, 0.05, 'circle / lift reach (m)');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0, 1, 0.01, 'height (× column)');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'gusting');

  const devil = folder.addFolder('1 · Dust devil');
  R(devil, c, 'devilHeight', 0.2, 6, 0.05, 'height (m)');
  R(devil, c, 'devilBase', 0.02, 1.5, 0.01, 'foot radius (m)');
  R(devil, c, 'devilTop', 0.05, 3, 0.01, 'lip radius (m)');
  R(devil, c, 'devilSpin', -6, 6, 0.05, 'turns/second');
  R(devil, c, 'devilSway', 0, 1.5, 0.01, 'sway (m)');
  R(devil, c, 'devilOpacity', 0, 1, 0.01, 'opacity');
  R(devil, c, 'devilDust', 0, 400, 1, 'dust/second');
  R(devil, c, 'devilChips', 0, 200, 1, 'grit/second');
  R(devil, c, 'devilRumble', 0, 1, 0.01, 'camera rumble');

  const funnel = folder.addFolder('2 · Funnel');
  const shape = funnel.addFolder('Silhouette');
  R(shape, c, 'height', 1, 24, 0.1, 'height (m)');
  R(shape, c, 'baseRadius', 0.05, 4, 0.01, 'foot radius (m)');
  R(shape, c, 'topRadius', 0.2, 12, 0.05, 'lip radius (m)');
  R(shape, c, 'flare', 0.2, 6, 0.01, 'how late it flares');
  R(shape, c, 'riseTime', 0.05, 3, 0.01, 'rise time (s)');
  R(shape, c, 'riseOvershoot', 0, 0.6, 0.01, 'surge past full height');
  R(shape, c, 'sway', 0, 4, 0.01, 'top sway (m)');
  R(shape, c, 'swayFrequency', 0, 4, 0.01, 'bends along it');
  R(shape, c, 'swaySpeed', 0, 6, 0.01, 'bend speed');
  R(shape, c, 'wobble', 0, 0.6, 0.005, 'wall ripple');
  R(shape, c, 'wobbleScale', 0.1, 6, 0.01, 'ripple scale');

  const shells = funnel.addFolder('Shells');
  R(shells, c, 'spin', -4, 4, 0.01, 'dust shell turns/second');
  R(shells, c, 'innerSpin', -6, 6, 0.01, 'wind shell turns/second');
  R(shells, c, 'innerScale', 0.2, 1.2, 0.01, 'wind shell radius (× dust)');
  R(shells, c, 'twist', -8, 8, 0.01, 'spiral wind (rad/m)');
  R(shells, c, 'rise', -4, 6, 0.01, 'band climb speed');

  const bands = funnel.addFolder('Filaments + bands');
  R(bands, c, 'bandScale', 0.2, 8, 0.01, 'noise round the column');
  R(bands, c, 'streak', 0.01, 1, 0.005, 'filament length (smaller = longer)');
  R(bands, c, 'bandFrequency', 0, 6, 0.01, 'bands per metre');
  R(bands, c, 'bandContrast', 0, 1, 0.01, 'band contrast');
  R(bands, c, 'filament', 0, 1, 0.01, 'filament carve');
  R(bands, c, 'filamentSharp', 0.2, 8, 0.05, 'filament tightness');
  R(bands, c, 'rimPower', 0.1, 6, 0.01, 'facing-ratio power');
  R(bands, c, 'rim', 0, 1, 0.01, 'facing-ratio weight');

  const fades = funnel.addFolder('Fades + collapse');
  R(fades, c, 'floorFade', 0.01, 3, 0.01, 'into the floor (m)');
  R(fades, c, 'topFade', 0.01, 0.8, 0.01, 'at the lip');
  R(fades, c, 'softFade', 0.01, 3, 0.01, 'soft intersection (m)');
  R(fades, c, 'collapseTime', 0.1, 4, 0.01, 'collapse time (s)');
  R(fades, c, 'collapseSoft', 0.01, 0.8, 0.01, 'collapse edge width');
  R(fades, c, 'collapseNoise', 0, 0.8, 0.01, 'collapse raggedness');

  const look = funnel.addFolder('Look');
  R(look, c, 'outerOpacity', 0, 1, 0.01, 'dust shell opacity');
  R(look, c, 'innerOpacity', 0, 1, 0.01, 'wind shell opacity');
  R(look, c, 'innerGlow', 0, 8, 0.01, 'wind shell glow');
  R(look, c, 'filamentGlow', 0, 6, 0.01, 'filament glow');
  look.addColor(c, 'colorFunnelBase').name('dust at the floor');
  look.addColor(c, 'colorFunnelMid').name('body');
  look.addColor(c, 'colorFunnelTop').name('lip');
  look.addColor(c, 'colorFilament').name('filaments');
  look.addColor(c, 'colorWind').name('wind shell');

  const skirt = folder.addFolder('3 · Dust skirt');
  R(skirt, c, 'skirtRadius', 0.2, 8, 0.05, 'spread (m)');
  R(skirt, c, 'skirtRate', 0, 600, 1, 'puffs/second');
  R(skirt, c, 'skirtSize', 0.05, 4, 0.01, 'puff size');
  R(skirt, c, 'skirtSpeed', 0, 10, 0.05, 'puff speed');
  R(skirt, c, 'skirtLifetime', 0.1, 6, 0.05, 'puff lifetime');
  R(skirt, c, 'skirtOpacity', 0, 1, 0.01, 'opacity');
  R(skirt, c, 'skirtSwirl', -8, 8, 0.05, 'swirl (rad/s)');
  R(skirt, c, 'skirtExpand', 0, 4, 0.01, 'swirl spread');
  R(skirt, c, 'skirtRise', -1, 3, 0.01, 'rise (m/s)');
  R(skirt, c, 'skirtTurbulence', 0, 3, 0.01, 'turbulence');
  R(skirt, c, 'ringInterval', 0.05, 2, 0.01, 'dust ring every (s)');
  R(skirt, c, 'ringLife', 0.1, 5, 0.05, 'dust ring life');
  R(skirt, c, 'ringIntensity', 0, 2, 0.01, 'dust ring strength');
  skirt.addColor(c, 'colorRingA').name('ring dark');
  skirt.addColor(c, 'colorRingB').name('ring light');
  Editor.gradient(skirt, c, 'colorDust', 'dust gradient');

  const debris = folder.addFolder('4 · Debris');
  R(debris, c, 'debrisRate', 0, 400, 1, 'chips/second');
  R(debris, c, 'debrisSize', 0.005, 0.4, 0.005, 'chip size');
  R(debris, c, 'debrisClimb', 0, 20, 0.1, 'climb (m/s)');
  R(debris, c, 'debrisDrag', 0, 4, 0.01, 'drag');
  R(debris, c, 'debrisSwirl', -12, 12, 0.05, 'orbit (rad/s)');
  R(debris, c, 'debrisExpand', 0, 6, 0.01, 'orbit opens by');
  R(debris, c, 'debrisLifetime', 0.1, 6, 0.05, 'lifetime');
  R(debris, c, 'debrisGravity', -20, 5, 0.1, 'gravity');
  R(debris, c, 'debrisFling', 0, 600, 1, 'thrown on collapse');
  R(debris, c, 'debrisFlingSpeed', 0, 40, 0.1, 'throw speed');
  Editor.gradient(debris, c, 'colorDebris', 'debris gradient');

  const streaks = folder.addFolder('5 · Wind streaks');
  R(streaks, c, 'streakRate', 0, 600, 1, 'per second');
  R(streaks, c, 'streakSize', 0.005, 0.4, 0.005, 'width');
  R(streaks, c, 'streakSpeed', 0, 50, 0.1, 'speed (m/s)');
  R(streaks, c, 'streakStretch', 0, 1, 0.005, 'stretch');
  R(streaks, c, 'streakLifetime', 0.05, 2, 0.01, 'lifetime');
  R(streaks, c, 'streakReach', 0.5, 3, 0.01, 'radius (× funnel)');
  R(streaks, c, 'streakGlow', 0, 6, 0.01, 'glow');
  Editor.gradient(streaks, c, 'colorStreak', 'streak gradient');

  const warp = folder.addFolder('6 · Distortion');
  R(warp, c, 'warpStrength', 0, 3, 0.01, 'strength');
  R(warp, c, 'warpWidth', 0.2, 5, 0.01, 'width (× skirt)');
  R(warp, c, 'warpHeight', 0.05, 1.5, 0.01, 'height (× column)');
  R(warp, c, 'warpScale', 0.1, 6, 0.01, 'noise scale');
  R(warp, c, 'warpSpeed', 0, 8, 0.01, 'noise speed');
  R(warp, c, 'warpSwirl', -4, 4, 0.01, 'twist');

  const impact = folder.addFolder('7 · Impact');
  R(impact, c, 'burstSize', 0, 12, 0.05, 'pressure shell (m)');
  R(impact, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(impact, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(impact, c, 'impactShake', 0, 1, 0.01, 'camera knock');
  R(impact, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(impact, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(impact, c, 'colRumble', 0, 1, 0.01, 'rumble while standing');
  impact.addColor(c, 'colorBurstA').name('shell inner');
  impact.addColor(c, 'colorBurstB').name('shell mid');
  impact.addColor(c, 'colorBurstC').name('shell outer');
  impact.addColor(c, 'colorShockA').name('shockwave');
  impact.addColor(c, 'colorShockB').name('shockwave hot');
  impact.addColor(c, 'colorFlash').name('flash');

  const lift = folder.addFolder('8 · The lift');
  R(lift, c, 'liftImpulse', 0, 12, 0.05, 'knock off feet (m/s)');
  R(lift, c, 'liftKick', 0, 12, 0.05, 'upward kick (m/s)');
  R(lift, c, 'liftSpin', 0, 5, 0.01, 'tumble');
  R(lift, c, 'liftSpeed', 0, 16, 0.05, 'climb (m/s)');
  R(lift, c, 'liftCeiling', 0.05, 1, 0.01, 'hang height (× column)');
  R(lift, c, 'liftOrbit', 0, 24, 0.05, 'orbit (m/s)');
  R(lift, c, 'liftPull', 0, 10, 0.05, 'wall spring');
  R(lift, c, 'liftRadius', 0, 2, 0.01, 'orbit radius (× funnel)');
  R(lift, c, 'liftGrab', 0, 20, 0.05, 'grab rate');
  R(lift, c, 'liftBuoyancy', 0, 1.2, 0.01, 'weight carried');
  R(lift, c, 'flingSpeed', 0, 40, 0.1, 'fling outward (m/s)');
  R(lift, c, 'flingLift', 0, 20, 0.1, 'fling upward (m/s)');
}
