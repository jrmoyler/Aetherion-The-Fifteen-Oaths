import { Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import { createStakeGeometry, createStripGeometry, createQuadGeometry } from '../../assets/codex/HeartstakeGeometry.js';
import {
  createStakeMaterial,
  createTrailMaterial,
  createStainMaterial,
  createHeartGlowMaterial,
  createPulseWarpMaterial
} from '../../materials/codex/HeartstakeMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'heartstake';

/** Bodies that can be bleeding out off one cast at once. */
const MAX_BLED = 12;
/** Hard ceiling on heartbeats; the editor's slider clamps to it. */
const MAX_BEATS = 8;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _floor = new Vector3();
const _body = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * HEARTSTAKE — a stake of coagulated blood with a heart in it, thrown down the
 * line to root in the target and beat.
 *
 * A line cast in five beats. **Forming**: blood is drawn out of the air into
 * the caster's hand and sets into a stake — a barbed, faceted spike of dark
 * garnet glass with a lobed heart knotted near its tail. **Flight**: it flies
 * the line point-first, the heart pumping light down veins toward the point,
 * a streaky ribbon of blood shed behind it and droplets raining off; whatever
 * stands in its path is run through and thrown forward. **Plunge**: over the
 * last metres it pitches down and drives itself into the floor at the target —
 * a red splash dome, a shockwave, a knock to the camera — and everything round
 * it is thrown clear. **Rooting**: the heart then beats, `beats` times. Every
 * beat swells the knot, sends a surge of light up the shaft, jets blood out
 * of the heart, thumps the air (a ring on the distortion layer) and pushes a
 * bright pressure ring out along the radial capillaries the stain is sending
 * across the floor; the stain grows with each one, and anything in reach of the
 * roots is taken off its feet and bled pale. **Withering**: the beats stop;
 * the stake dries to brown-black, crumbles away point-first in flakes, and the
 * stain dries matte and erodes.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the stake** (`createStakeMaterial`) — parameter-space lathe, profile
 *      and barbs in the vertex stage, faceted glassy shading and inner light
 *      in the fragment stage.
 *   2. **the heart glow** — a ragged camera-facing bloom on the knot.
 *   3. **the trail** — a camera-facing ribbon of streaking blood.
 *   4. **the stain & roots** — the ground quad at the plunge.
 *   5. **the thump** — a flat distortion ring per beat.
 *   6. **droplets, mist, spray, flakes** — four particle systems.
 *   7. **the impact** — WATER shell tinted blood, SHOCKWAVE, flash, shake,
 *      light punch; and `handlesOwnHits`: pierce on the line, throw at the
 *      plunge, knock-down and bleed on each beat.
 *
 * ## The editor rule
 *
 * A cast captures a seed and integrated phases (vein flow, trail flow). The
 * flight path, the stake's shape, the beat timing and every colour are
 * resolved from `settings.heartstake` every frame, so a slider moves a stake
 * already in the air or already beating.
 */
export class HeartstakeAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._bledCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.stakeGeometry = createStakeGeometry(96, 7);
    this.stripGeometry = createStripGeometry(48, 2);
    this.quadGeometry = createQuadGeometry();

    this.stainMaterial = createStainMaterial();
    this.stain = this._mesh(this.quadGeometry, this.stainMaterial, LAYER.VFX, 2);

    this.trailMaterial = createTrailMaterial();
    this.trail = this._mesh(this.stripGeometry, this.trailMaterial, LAYER.VFX, 10);

    this.stakeMaterial = createStakeMaterial();
    this.stake = this._mesh(this.stakeGeometry, this.stakeMaterial, LAYER.VFX, 12);

    this.glowMaterial = createHeartGlowMaterial();
    this.glow = this._mesh(this.quadGeometry, this.glowMaterial, LAYER.VFX, 16);

    this.warpMaterial = createPulseWarpMaterial();
    this.warp = this._mesh(this.quadGeometry, this.warpMaterial, LAYER.DISTORTION, 0);

    this._stakeState = {
      tail: new Vector3(),
      axis: new Vector3(0, 0, 1),
      grow: 0,
      throb: 0,
      surge: -1,
      flow: 0,
      dry: 0,
      crumble: 0,
      seed: 0
    };
    this._trailState = { head: new Vector3(), back: new Vector3(), flow: 0, fade: 1, seed: 0 };
    this._stainState = { center: new Vector3(), spread: 0, reach: 0, ringR: -1, beat: 0, dry: 0, fadeT: 0, seed: 0 };
    this._glowState = { center: new Vector3(), size: 0.5, intensity: 0, seed: 0 };
    this._warpState = { center: new Vector3(), progress: 0, strength: 0 };

    /** Where the point came to rest, and the way the stake was pointing. */
    this._restTip = new Vector3();
    this._restAxis = new Vector3(0, -1, 0);
    /** The way it stands once it has rooted — it rights itself, point down. */
    this._plantAxis = new Vector3(0, -1, 0);
    this._tip = new Vector3();
    this._heart = new Vector3();

    this._seed = 0;
    this._flow = 0;
    this._trailFlow = 0;
    this._prevFront = 0;
    this._planted = false;
    /** Beat time since the plunge, seconds. */
    this._rite = 0;
    /** How many beats have fired. */
    this._beatsFired = 0;

    this._bled = [];
    for (let i = 0; i < MAX_BLED; i++) this._bled.push({ dummy: null, time: 0, emitter: new RateEmitter() });
    this._bledCount = 0;
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

    this.drops = particles.get('heartstake.drops', {
      capacity: 2400,
      shape: ParticleShape.DROPLET,
      additive: false,
      stretch: true,
      softFade: 0.2
    });
    this.drops.uniforms.uSizeIn.value = 0.04;
    this.drops.uniforms.uFadeIn.value = 0.02;
    this.drops.uniforms.uFadeOut.value = 0.3;
    this.drops.uniforms.uEndSize.value = 0.6;
    this.drops.uniforms.uDrag.value = 0.35;

    this.mist = particles.get('heartstake.mist', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.0
    });
    this.mist.uniforms.uSizeIn.value = 0.15;
    this.mist.uniforms.uFadeIn.value = 0.12;
    this.mist.uniforms.uFadeOut.value = 0.55;
    this.mist.uniforms.uEndSize.value = 2.2;
    this.mist.uniforms.uDrag.value = 1.4;

    this.spray = particles.get('heartstake.spray', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.25
    });
    this.spray.uniforms.uSizeIn.value = 0.03;
    this.spray.uniforms.uFadeIn.value = 0.03;
    this.spray.uniforms.uFadeOut.value = 0.5;
    this.spray.uniforms.uEndSize.value = 0.3;
    this.spray.uniforms.uDrag.value = 1.6;

    this.flakes = particles.get('heartstake.flakes', {
      capacity: 900,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.flakes.uniforms.uSizeIn.value = 0.05;
    this.flakes.uniforms.uFadeIn.value = 0.03;
    this.flakes.uniforms.uFadeOut.value = 0.35;
    this.flakes.uniforms.uEndSize.value = 0.7;
    this.flakes.uniforms.uDrag.value = 0.5;

    this.trailEmitter = new RateEmitter();
    this.flakeEmitter = new RateEmitter();
    this.seepEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get _beats() {
    return Math.max(1, Math.min(MAX_BEATS, Math.round(settings[ID].beats)));
  }

  /** The plunge settling, then every heartbeat and the last one's ring. */
  get impactDuration() {
    const c = settings[ID];
    const span = c.beatDelay + (this._beats - 1) * c.beatInterval + Math.max(c.ringTime, c.surgeTime) + 0.15;
    return Math.max(0.2, span * settings.global.lifetime);
  }

  /** The withering. */
  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  /** A pulse, not a flame: the light thumps with the heart. */
  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * 0.5 + f * this._stakeState.throb;
  }

  /* ------------------------------------------------------------------ */
  /* The flight path                                                     */
  /* ------------------------------------------------------------------ */

  /** Where the point is when the cast front is `front` metres down the line. */
  _tipAt(front, out) {
    const c = settings[ID];
    const L = this.length;
    const f = Math.min(Math.max(front, c.handForward), L);
    out.copy(this.origin).addScaledVector(this.direction, f);
    // Off the hand it lifts to flight height, then pitches down and drives in.
    const lift = smoothstep(c.handForward, c.handForward + 2.5, f);
    const k = smoothstep(Math.max(c.handForward, L - c.diveDistance), L, f);
    const cruise = lerp(c.handHeight, c.flightHeight, lift) + c.flightArc * Math.sin(Math.PI * saturate(f / L));
    out.y = lerp(cruise, -c.plungeDepth, Easing.inQuad(k));
    return out;
  }

  _hand(out) {
    const c = settings[ID];
    return out
      .copy(this.origin)
      .addScaledVector(this.direction, c.handForward)
      .addScaledVector(this.side, c.handSide)
      .setY(c.handHeight);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    const g = settings.global;
    this.trailEmitter.reset();
    this.flakeEmitter.reset();
    this.seepEmitter.reset();
    this._releaseBled();

    this._seed = Math.random() * 100;
    this._flow = 0;
    this._trailFlow = 0;
    this._prevFront = 0;
    this._planted = false;
    this._rite = 0;
    this._beatsFired = 0;

    const st = this._stakeState;
    st.seed = this._seed;
    st.grow = 0;
    st.throb = 0;
    st.surge = -1;
    st.dry = 0;
    st.crumble = 0;
    this._trailState.seed = this._seed;
    this._trailState.fade = 1;
    const ss = this._stainState;
    ss.seed = this._seed;
    ss.spread = 0;
    ss.reach = 0;
    ss.ringR = -1;
    ss.beat = 0;
    ss.dry = 0;
    ss.fadeT = 0;
    this._glowState.seed = this._seed;
    this._glowState.intensity = 0;
    this._warpState.progress = 0;
    this._warpState.strength = 0;

    this.stake.visible = true;
    this.trail.visible = true;
    this.glow.visible = true;
    this.stain.visible = false;
    this.warp.visible = false;

    /* blood drawn out of the air into the hand */
    this._hand(_a);
    const time = frame.uTime.value;
    this._resetEmit(time);
    _emit.size = c.dropSize * 0.8;
    _emit.life = c.formTime * 1.6 + 0.08;
    _emit.lifeVariance = 0.2;
    _emit.speedVariance = 0.15;
    _emit.spread = 0.05;
    const n = Math.round(c.gatherDrops * g.particleCount);
    for (let i = 0; i < n; i++) {
      _dir.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      _pos.copy(_a).addScaledVector(_dir, c.gatherRadius * (0.6 + 0.4 * Math.random()));
      _b.copy(_dir).negate();
      _emit.position = _pos;
      _emit.direction = _b;
      _emit.speed = c.gatherRadius / Math.max(0.05, c.formTime * 1.3);
      this.drops.emit(1, _emit);
    }

    this._syncLooks();
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

  _syncLooks() {
    const c = settings[ID];
    const g = settings.global;

    this.drops.setGradient(getColor(c.colorDropA), getColor(c.colorDropB), getColor(c.colorDropC), getColor(c.colorDropD));
    const d = this.drops.uniforms;
    d.uGravity.value.set(0, -c.dropGravity, 0);
    d.uSizeScale.value = g.particleSize;
    d.uLifeScale.value = g.particleLifetime;
    d.uSpeedScale.value = g.particleSpeed;
    d.uOpacity.value = g.opacity;
    d.uGlow.value = c.dropGlow * g.glow;
    d.uStretch.value = c.dropStretch;
    d.uTurbulence.value = 0.1 * g.turbulence;

    this.mist.setGradient(getColor(c.colorMistA), getColor(c.colorMistB), getColor(c.colorMistC), getColor(c.colorMistD));
    const m = this.mist.uniforms;
    m.uGravity.value.set(0, c.mistLift * 0.3, 0);
    m.uSizeScale.value = g.particleSize;
    m.uLifeScale.value = g.particleLifetime;
    m.uSpeedScale.value = g.particleSpeed;
    m.uOpacity.value = c.mistOpacity * g.opacity;
    m.uTurbulence.value = 0.8 * g.turbulence;

    this.spray.setGradient(getColor(c.colorSprayA), getColor(c.colorSprayB), getColor(c.colorSprayC), getColor(c.colorSprayD));
    const s = this.spray.uniforms;
    s.uGravity.value.set(0, -c.dropGravity * 0.3, 0);
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uGlow.value = c.sprayGlow * g.glow;
    s.uTurbulence.value = 0.5 * g.turbulence;

    this.flakes.setGradient(getColor(c.colorFlakeA), getColor(c.colorFlakeB), getColor(c.colorFlakeC), getColor(c.colorFlakeD));
    const f = this.flakes.uniforms;
    f.uGravity.value.set(0, -c.flakeGravity, 0);
    f.uSizeScale.value = g.particleSize;
    f.uLifeScale.value = g.particleLifetime;
    f.uSpeedScale.value = g.particleSpeed;
    f.uOpacity.value = g.opacity;
    f.uTurbulence.value = 0.3 * g.turbulence;
  }

  /** Lay the stake along `tip` / `axis` and push every material. */
  _syncStake(tip, axis) {
    const c = settings[ID];
    const st = this._stakeState;
    st.axis.copy(axis);
    st.tail.copy(tip).addScaledVector(axis, -c.stakeLength * st.grow);
    st.flow = this._flow;
    this.stakeMaterial.userData.sync(st);
    // The heart, in the world: for the glow, the light and the jets.
    this._heart.copy(st.tail).addScaledVector(axis, c.stakeLength * st.grow * c.heartAt);
    const gs = this._glowState;
    gs.center.copy(this._heart);
    this.glowMaterial.userData.sync(gs);
  }

  /* ------------------------------------------------------------------ */
  /* Travel — forming and flight                                         */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._flow += c.veinFlow * dt * g.noiseSpeed;
    this._trailFlow += c.trailFlow * dt * g.noiseSpeed;

    const st = this._stakeState;
    st.grow = Easing.outBack(saturate(this.age / Math.max(0.01, c.formTime * g.lifetime)));
    // A slow pulse in flight — the heart is already beating.
    st.throb = 0.3 * Math.pow(0.5 + 0.5 * Math.sin(this.age * c.flightPulse * Math.PI * 2), 6);
    st.surge = -1;

    this._tipAt(this.front, this._tip);
    this._tipAt(this.front - 0.35, _a);
    _dir.subVectors(this._tip, _a);
    if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
    _dir.normalize();
    this._syncStake(this._tip, _dir);

    const gs = this._glowState;
    gs.size = c.glowSize * (0.7 + 0.5 * st.throb) * st.grow;
    gs.intensity = (0.6 + st.throb) * st.grow;

    /* the trail: from the tail back along the path already flown */
    const ts = this._trailState;
    ts.head.copy(st.tail);
    const back = Math.max(c.handForward, this.front - c.stakeLength * st.grow - c.trailLength);
    this._tipAt(back, ts.back);
    ts.flow = this._trailFlow;
    ts.fade = saturate((this.front - c.handForward) / 1.5);
    this.trailMaterial.userData.sync(ts);

    this._syncLooks();
    this._flightFx(dt);
    this._lineHits();
    this._updateBled(dt);
    this._prevFront = this.front;
    this.position.copy(this._heart);
  }

  /** Droplets shed off the trail and a fine spray off the point. */
  _flightFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.trailEmitter.tick(dt, c.trailDrops) * g.particleCount);
    if (n <= 0) return;
    const ts = this._trailState;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.dropSize;
    _emit.life = c.dropLife;
    _emit.speed = c.dropSpeed * 0.4;
    _emit.spread = 0.6;
    _dir.copy(this.direction).multiplyScalar(0.6).addScaledVector(_up, 0.2);
    _emit.direction = _dir;
    for (let i = 0; i < n; i++) {
      _pos.lerpVectors(ts.head, ts.back, Math.pow(Math.random(), 1.8));
      _emit.position = _pos;
      if (Math.random() < 0.7) this.drops.emit(1, _emit);
      else this.spray.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the plunge                                                 */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._planted = true;
    this._rite = 0;
    this._beatsFired = 0;

    this._tipAt(this.length, this._restTip);
    this._tipAt(this.length - 0.35, _a);
    this._restAxis.subVectors(this._restTip, _a).normalize();

    this.pointAt(1, _floor).setY(0);
    const ss = this._stainState;
    ss.center.copy(_floor).setY(0.012);
    ss.spread = c.stainRadius * 0.3;
    ss.reach = c.stainRadius * 0.5;
    this.stain.visible = true;
    this.trail.visible = false;
    this._warpState.center.copy(_floor).setY(0.08);

    this.ctx.bursts.spawn(BurstMode.WATER, _floor, {
      radius: 0.2,
      endRadius: c.splashSize * power,
      life: 0.55,
      intensity: 1.1,
      opacity: 0.85,
      fresnel: 2.2,
      displace: 0.55,
      turbulence: 1.3,
      squash: 0.55,
      colorA: getColor(c.colorSplashA),
      colorB: getColor(c.colorSplashB),
      colorC: getColor(c.colorSplashC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.55,
      width: 0.07,
      intensity: 1.1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });

    /* the splash: a crown of droplets up and out, mist low */
    this._resetEmit(time);
    _emit.position = _floor;
    _emit.radius = 0.25;
    _emit.direction = _up;
    _emit.speed = c.dropSpeed * 1.4;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.9;
    _emit.size = c.dropSize * 1.3;
    _emit.life = c.dropLife * 1.2;
    this.drops.emit(Math.round(c.plungeDrops * g.particleCount), _emit);
    _emit.speed = c.dropSpeed * 1.8;
    _emit.size = c.dropSize * 0.6;
    _emit.life = c.dropLife * 0.7;
    this.spray.emit(Math.round(c.plungeDrops * 0.6 * g.particleCount), _emit);
    _emit.radius = 0.6;
    _emit.speed = c.mistLift * 1.5;
    _emit.spread = 1.4;
    _emit.size = c.mistSize * 1.3;
    _emit.life = c.mistLife;
    _emit.spin = 0.6;
    this.mist.emit(Math.round(18 * g.particleCount), _emit);

    this._plungeHits();

    this.ctx.shake.add(c.plungeShake * power, 6, 22);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.plungeFlash * power);
    this.lightBoost = c.lightIntensity * c.plungeLight * power;
  }

  /** Lean the planted stake from its flight angle toward standing, point down. */
  _plant(k) {
    const c = settings[ID];
    _b.copy(this.direction).multiplyScalar(c.plantLean).addScaledVector(_up, -1).normalize();
    this._plantAxis.copy(this._restAxis).lerp(_b, Easing.outBack(saturate(k))).normalize();
    return this._plantAxis;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const st = this._stakeState;
    this._flow += c.veinFlow * dt * g.noiseSpeed;
    st.grow = 1;

    if (t <= 1) {
      /* the heartbeats */
      this._rite += dt / Math.max(0.05, g.lifetime);
      const tau = this._rite;
      const beats = this._beats;

      // Fire any beat whose time has come.
      while (this._beatsFired < beats && tau >= c.beatDelay + this._beatsFired * c.beatInterval) {
        this._beat(this._beatsFired);
        this._beatsFired++;
      }

      // The latest beat drives the throb, the surge and the ring.
      const k = this._beatsFired - 1;
      const ss = this._stainState;
      if (k >= 0) {
        const x = tau - (c.beatDelay + k * c.beatInterval);
        st.throb = (1 - Math.exp(-x * 45)) * Math.exp(-x * c.throbDecay);
        st.surge = x < c.surgeTime ? lerp(c.heartAt, 1.05, x / Math.max(0.02, c.surgeTime)) : -1;
        const rp = saturate(x / Math.max(0.02, c.ringTime));
        ss.ringR = rp < 1 ? c.rootReach * Easing.outCubic(rp) : -1;
        ss.beat = st.throb;
        this._warpState.progress = rp;
        this._warpState.strength = 1 - rp;
        this.warp.visible = rp < 1;
      } else {
        // between the plunge and the first beat the heart holds its breath
        st.throb = 0;
        st.surge = -1;
        ss.ringR = -1;
        ss.beat = 0;
        this.warp.visible = false;
      }
      // The stain soaks out a step with each beat.
      const grown = saturate((this._beatsFired + (k >= 0 ? saturate((tau - (c.beatDelay + k * c.beatInterval)) / c.beatInterval) : 0)) / beats);
      ss.spread = c.stainRadius * lerp(0.3, 1, Easing.outCubic(grown));
      ss.reach = lerp(c.stainRadius * 0.5, c.rootReach, Easing.outCubic(grown));
      ss.dry = 0;
      ss.fadeT = 0;

      this._syncStake(this._restTip, this._plant(tau / Math.max(0.02, c.plantTime)));
      const gs = this._glowState;
      gs.size = c.glowSize * (0.8 + 0.9 * st.throb);
      gs.intensity = 0.5 + 1.8 * st.throb;
      this.stainMaterial.userData.sync(ss);
      this.warpMaterial.userData.sync(this._warpState);
      this._syncLooks();
      this._seep(dt, 1);
      this._updateBled(dt);
      this.position.copy(this._heart);
      return;
    }

    /* the withering */
    const ft = saturate(t - 1);
    this.warp.visible = false;
    st.throb = 0;
    st.surge = -1;
    st.dry = smoothstep(0, 0.4, ft);
    st.crumble = smoothstep(0.3, 0.92, ft);
    this.stake.visible = st.crumble < 0.999;
    const ss = this._stainState;
    ss.ringR = -1;
    ss.beat = 0;
    ss.dry = smoothstep(0.1, 0.6, ft);
    ss.fadeT = smoothstep(0.55, 1, ft);
    this._syncStake(this._restTip, this._plant(1));
    const gs = this._glowState;
    gs.intensity = 0.5 * (1 - st.dry);
    this.glow.visible = gs.intensity > 0.01;
    this.stainMaterial.userData.sync(ss);
    this._syncLooks();
    this._seep(dt, 1 - st.dry);
    this._crumbleFx(dt, st.crumble);
    this._updateBled(dt);
    this.position.copy(this._heart);
  }

  /** One heartbeat. */
  _beat(index) {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const last = index === this._beats - 1;
    const time = frame.uTime.value;

    /* jets out of the heart: up and round, and a fine hot spray */
    this._resetEmit(time);
    _emit.position = this._heart;
    _emit.radius = c.stakeRadius * c.heartSize;
    _emit.direction = _up;
    _emit.speed = c.dropSpeed * c.beatJet;
    _emit.speedVariance = 0.45;
    _emit.spread = 0.7;
    _emit.size = c.dropSize * 1.1;
    _emit.life = c.dropLife;
    this.drops.emit(Math.round(c.beatDrops * g.particleCount), _emit);
    _emit.speed = c.dropSpeed * c.beatJet * 1.3;
    _emit.size = c.dropSize * 0.5;
    _emit.life = c.dropLife * 0.6;
    this.spray.emit(Math.round(c.beatDrops * 0.7 * g.particleCount), _emit);
    _emit.position = this._stainState.center;
    _emit.radius = 0.5;
    _emit.speed = c.mistLift;
    _emit.spread = 1.2;
    _emit.size = c.mistSize;
    _emit.life = c.mistLife;
    _emit.spin = 0.5;
    this.mist.emit(Math.round(6 * g.particleCount), _emit);

    this.ctx.decals.spawn(DecalType.SHOCKWAVE, this._stainState.center, {
      radius: c.rootReach * (last ? 1.3 : 1),
      life: c.ringTime * 1.3,
      width: 0.05,
      intensity: 0.8,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });

    this._beatHits(index);
    this.ctx.shake.add(c.beatShake * power * (last ? 1.6 : 1), 9, 14);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.beatLight * power * (last ? 1.5 : 1));
  }

  /** Blood seeping off the stake while it beats, and a low mist. */
  _seep(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.seepEmitter.tick(dt, c.seepDrops * strength) * g.particleCount);
    if (n <= 0) return;
    const st = this._stakeState;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.dropSize * 0.8;
    _emit.life = c.dropLife * 0.8;
    _emit.speed = 0.3;
    _emit.spread = 0.4;
    _emit.direction = _up;
    for (let i = 0; i < n; i++) {
      // Down the exposed part of the shaft, crowded at the heart.
      const s = Math.random() * 0.5;
      _pos.copy(st.tail).addScaledVector(st.axis, c.stakeLength * s);
      if (_pos.y < 0.05) continue;
      _emit.position = _pos;
      this.drops.emit(1, _emit);
    }
  }

  /** Flakes falling off the crumbling stake. */
  _crumbleFx(dt, crumble) {
    const c = settings[ID];
    const g = settings.global;
    if (crumble <= 0 || crumble >= 1) return;
    const n = Math.round(this.flakeEmitter.tick(dt, c.flakeRate) * g.particleCount);
    if (n <= 0) return;
    const st = this._stakeState;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.flakeSize;
    _emit.life = c.flakeLife;
    _emit.speed = 0.6;
    _emit.spread = 1;
    _emit.spin = 4;
    _emit.direction = _up;
    // From the crumbling edge, which runs point → tail.
    const edge = 1.05 - crumble * 1.15;
    for (let i = 0; i < n; i++) {
      const s = saturate(edge + (Math.random() - 0.5) * 0.12) / 0.75;
      _pos.copy(st.tail).addScaledVector(st.axis, c.stakeLength * Math.min(1, s));
      if (_pos.y < 0.03) _pos.y = 0.03;
      _emit.position = _pos;
      _emit.radius = c.stakeRadius * 1.5;
      this.flakes.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Hits                                                                */
  /* ------------------------------------------------------------------ */

  /** Run through whatever the stake passes in flight — not those at the end. */
  _lineHits() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const from = Math.max(0, this._prevFront - 0.5);
    const to = this.front;
    if (to <= from) return;
    const mid = (from + to) * 0.5;
    this.pointAt(Math.min(1, mid / this.length), _floor);
    const found = field.findTargets(_floor.x, _floor.z, Math.hypot((to - from) * 0.5, c.hitWidth), this._found);
    if (found.length === 0) return;
    const plungeZone = this.length - c.impactRadius;
    const power = g.explosionIntensity;
    this._force.impulse = c.pierceImpulse * power;
    this._force.lift = c.pierceLift * power;
    this._force.spin = c.pierceSpin;
    for (const dummy of found) {
      const dx = dummy.position.x - this.origin.x;
      const dz = dummy.position.z - this.origin.z;
      const along = dx * this.direction.x + dz * this.direction.z;
      const lat = dx * this.side.x + dz * this.side.z;
      if (Math.abs(lat) > c.hitWidth || along < 0.4 || along > to || along >= plungeZone) continue;
      if (!dummy.kill(this.direction.x, this.direction.z, this._force)) continue;
      this._bleed(dummy, this.direction, 1);
    }
  }

  /** At the plunge: everything near it is thrown clear, outward. */
  _plungeHits() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const ss = this._stainState;
    const found = field.findTargets(ss.center.x, ss.center.z, c.impactRadius, this._found);
    for (const dummy of found) {
      _dir.set(dummy.position.x - ss.center.x, 0, dummy.position.z - ss.center.z);
      const d = _dir.length();
      if (d < 1e-3) _dir.copy(this.direction);
      else _dir.multiplyScalar(1 / d);
      const close = 1 - saturate(d / c.impactRadius);
      this._force.impulse = c.plungeImpulse * lerp(0.5, 1, close) * power;
      this._force.lift = c.plungeLift * lerp(0.6, 1, close) * power;
      this._force.spin = c.pierceSpin;
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      this._bleed(dummy, _dir, 1.2);
    }
  }

  /** Each beat knocks down whatever the roots have reached. */
  _beatHits(index) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const ss = this._stainState;
    const reach = lerp(c.stainRadius, c.rootReach, (index + 1) / this._beats);
    const found = field.findTargets(ss.center.x, ss.center.z, reach, this._found);
    this._force.impulse = c.beatImpulse * power;
    this._force.lift = c.beatLift * power;
    this._force.spin = c.pierceSpin * 0.5;
    for (const dummy of found) {
      // Pulled toward the heart: the roots drag them in.
      _dir.set(ss.center.x - dummy.position.x, 0, ss.center.z - dummy.position.z);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      _dir.normalize();
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      this._bleed(dummy, _dir, 0.7);
    }
  }

  /** Start a body bleeding out, with a spurt the way it was thrown. */
  _bleed(dummy, dir, scale) {
    const c = settings[ID];
    const g = settings.global;
    if (this._bledCount < MAX_BLED) {
      const slot = this._bled[this._bledCount++];
      slot.dummy = dummy;
      slot.time = 0;
      slot.emitter.reset();
    }
    this._resetEmit(frame.uTime.value);
    _pos.copy(dummy.position).setY(1.1);
    _b.copy(dir).addScaledVector(_up, 0.5).normalize();
    _emit.position = _pos;
    _emit.radius = 0.2;
    _emit.direction = _b;
    _emit.speed = c.dropSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.5;
    _emit.size = c.dropSize;
    _emit.life = c.dropLife;
    this.drops.emit(Math.round(26 * scale * g.particleCount), _emit);
    this.spray.emit(Math.round(14 * scale * g.particleCount), _emit);
    this.ctx.shake.add(c.beatShake * 0.4 * scale, 8, 18);
  }

  /** Bled bodies pale and keep dripping. */
  _updateBled(dt) {
    const c = settings[ID];
    const g = settings.global;
    const look = this._look;
    look.color = c.colorBledBody;
    look.rimColor = c.colorBledRim;
    look.rimEmissive = c.bledRimGlow;
    look.edgeColor = c.colorBledRim;
    look.edgeEmissive = c.bledRimGlow;
    look.edgeWidth = 0.04;
    const time = frame.uTime.value;
    for (let i = 0; i < this._bledCount; i++) {
      const slot = this._bled[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) continue;
      slot.time += dt;
      dummy.corrode(saturate(slot.time / Math.max(0.05, c.bleedTime)) * c.bleedPale, look);
      const left = 1 - saturate(slot.time / Math.max(0.05, c.bleedTime * 1.5));
      const n = Math.round(slot.emitter.tick(dt, c.bleedDrops * left) * g.particleCount);
      if (n <= 0) continue;
      const at = dummy.bodyPoint(_body) ?? _body.copy(dummy.position).setY(0.9);
      this._resetEmit(time);
      _emit.position = at;
      _emit.radius = 0.3;
      _emit.direction = _up;
      _emit.speed = 0.4;
      _emit.spread = 1;
      _emit.size = c.dropSize * 0.8;
      _emit.life = c.dropLife;
      this.drops.emit(n, _emit);
    }
  }

  _releaseBled() {
    for (let i = 0; i < this._bledCount; i++) this._bled[i].dummy = null;
    this._bledCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.stake.visible = false;
    this.trail.visible = false;
    this.stain.visible = false;
    this.glow.visible = false;
    this.warp.visible = false;
    this._releaseBled();
  }

  dispose() {
    this.stakeGeometry.dispose();
    this.stripGeometry.dispose();
    this.quadGeometry.dispose();
    this.stakeMaterial.dispose();
    this.trailMaterial.dispose();
    this.stainMaterial.dispose();
    this.glowMaterial.dispose();
    this.warpMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('♥  Heartstake');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'flight speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'withers over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'thump with the beat');

  const flight = folder.addFolder('1 · Forming & flight');
  R(flight, c, 'handForward', -1, 2, 0.01, 'hand forward (m)');
  R(flight, c, 'handSide', -1, 1, 0.01, 'hand to the right (m)');
  R(flight, c, 'handHeight', 0.2, 3, 0.01, 'hand height (m)');
  R(flight, c, 'formTime', 0.01, 1, 0.005, 'sets over (s)');
  R(flight, c, 'gatherDrops', 0, 200, 1, 'blood drawn in');
  R(flight, c, 'gatherRadius', 0.1, 3, 0.01, 'drawn from (m)');
  R(flight, c, 'flightHeight', 0.2, 4, 0.01, 'flight height (m)');
  R(flight, c, 'flightArc', -1, 3, 0.01, 'arc (m)');
  R(flight, c, 'diveDistance', 0.5, 10, 0.05, 'pitches down over (m)');
  R(flight, c, 'plungeDepth', 0, 2, 0.01, 'drives in (m)');
  R(flight, c, 'flightPulse', 0, 6, 0.05, 'beats/second in flight');
  R(flight, c, 'plantLean', -1, 2, 0.01, 'stands leaning (0 upright)');
  R(flight, c, 'plantTime', 0.02, 1, 0.005, 'rights itself over (s)');

  const stake = folder.addFolder('2 · The stake');
  R(stake, c, 'stakeLength', 0.3, 6, 0.01, 'length (m)');
  R(stake, c, 'stakeRadius', 0.01, 0.5, 0.001, 'shaft radius (m)');
  R(stake, c, 'taper', 0.1, 3, 0.01, 'taper');
  R(stake, c, 'twist', -6, 6, 0.01, 'facet twist');
  R(stake, c, 'heartSize', 0.5, 5, 0.01, 'heart (× shaft)');
  R(stake, c, 'heartAt', 0.05, 0.5, 0.005, 'heart sits at');
  R(stake, c, 'heartWidth', 0.01, 0.25, 0.001, 'heart length');
  R(stake, c, 'throb', 0, 1.5, 0.01, 'throb');
  R(stake, c, 'throbDecay', 1, 30, 0.1, 'throb decay');
  R(stake, c, 'barbRows', 0, 14, 0.1, 'barb rows');
  R(stake, c, 'barbsAround', 1, 8, 1, 'barbs around');
  R(stake, c, 'barbLength', 0, 4, 0.01, 'barb length (× shaft)');
  R(stake, c, 'finFlare', 0, 4, 0.01, 'tail fins (× shaft)');

  const glass = folder.addFolder('3 · Blood glass');
  R(glass, c, 'veinScale', 0.1, 10, 0.05, 'vein scale');
  R(glass, c, 'veinFlow', 0, 20, 0.1, 'vein flow');
  R(glass, c, 'veinGlow', 0, 8, 0.05, 'vein glow');
  R(glass, c, 'heartGlow', 0, 12, 0.05, 'heart glow');
  R(glass, c, 'surgeGlow', 0, 12, 0.05, 'surge glow');
  R(glass, c, 'surgeTime', 0.02, 1.5, 0.01, 'surge runs over (s)');
  R(glass, c, 'rimGlow', 0, 6, 0.05, 'rim');
  R(glass, c, 'gloss', 0, 4, 0.01, 'glint');
  R(glass, c, 'glowSize', 0.05, 3, 0.01, 'heart bloom (m)');
  R(glass, c, 'glowStrength', 0, 8, 0.05, 'heart bloom strength');
  glass.addColor(c, 'colorStakeDeep').name('deep');
  glass.addColor(c, 'colorStakeBody').name('body');
  glass.addColor(c, 'colorStakeHot').name('hot');
  glass.addColor(c, 'colorStakeRim').name('rim');
  glass.addColor(c, 'colorGlowCore').name('bloom core');
  glass.addColor(c, 'colorGlowHalo').name('bloom halo');

  const trail = folder.addFolder('4 · Trail');
  R(trail, c, 'trailLength', 0, 12, 0.05, 'length (m)');
  R(trail, c, 'trailWidth', 0.01, 1.5, 0.005, 'width (m)');
  R(trail, c, 'trailFlow', 0, 30, 0.1, 'flow');
  R(trail, c, 'trailGlow', 0, 8, 0.05, 'core glow');
  R(trail, c, 'trailOpacity', 0, 1, 0.01, 'opacity');
  R(trail, c, 'trailDrops', 0, 400, 1, 'drops/second');
  trail.addColor(c, 'colorTrailDeep').name('deep');
  trail.addColor(c, 'colorTrailHot').name('core');

  const beats = folder.addFolder('5 · The heartbeats');
  R(beats, c, 'beats', 1, MAX_BEATS, 1, 'beats');
  R(beats, c, 'beatDelay', 0, 1.5, 0.01, 'first beat after (s)');
  R(beats, c, 'beatInterval', 0.1, 1.5, 0.01, 'between beats (s)');
  R(beats, c, 'beatJet', 0, 4, 0.01, 'jet (× drop speed)');
  R(beats, c, 'beatDrops', 0, 300, 1, 'drops per beat');
  R(beats, c, 'seepDrops', 0, 200, 1, 'seep drops/second');
  R(beats, c, 'ringTime', 0.05, 2, 0.01, 'ring runs out over (s)');
  R(beats, c, 'ringWidth', 0.02, 1.5, 0.01, 'ring width (m)');
  R(beats, c, 'ringGlow', 0, 8, 0.05, 'ring glow');
  R(beats, c, 'beatWarp', 0, 4, 0.01, 'air thump');
  R(beats, c, 'beatShake', 0, 1.5, 0.01, 'camera thump');
  R(beats, c, 'beatLight', 0, 6, 0.01, 'light punch (× intensity)');

  const stain = folder.addFolder('6 · Stain & roots');
  R(stain, c, 'stainRadius', 0.2, 6, 0.01, 'stain radius (m)');
  R(stain, c, 'stainFingers', 0, 2, 0.01, 'fingers');
  R(stain, c, 'stainFingerFreq', 0.2, 8, 0.05, 'finger frequency');
  R(stain, c, 'stainOpacity', 0, 1, 0.01, 'opacity');
  R(stain, c, 'stainGloss', 0, 4, 0.01, 'wet glint');
  R(stain, c, 'rootCount', 1, 32, 1, 'roots');
  R(stain, c, 'rootReach', 0.5, 12, 0.05, 'roots reach (m)');
  R(stain, c, 'rootWidth', 0.01, 0.6, 0.005, 'root width (m)');
  R(stain, c, 'rootWander', 0, 1, 0.01, 'root wander');
  R(stain, c, 'rootGlow', 0, 8, 0.05, 'root glow');
  stain.addColor(c, 'colorStain').name('stain');
  stain.addColor(c, 'colorStainWet').name('stain wet');
  stain.addColor(c, 'colorRoots').name('roots');
  stain.addColor(c, 'colorDry').name('dried');

  const fx = folder.addFolder('7 · Blood & flakes');
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
  R(fx, c, 'flakeRate', 0, 400, 1, 'flakes/second');
  R(fx, c, 'flakeSize', 0.005, 0.3, 0.001, 'flake size');
  R(fx, c, 'flakeLife', 0.1, 4, 0.05, 'flake lifetime');
  R(fx, c, 'flakeGravity', 0, 20, 0.1, 'flake gravity');
  Editor.gradient(fx, c, 'colorDrop', 'drop gradient');
  Editor.gradient(fx, c, 'colorSpray', 'spray gradient');
  Editor.gradient(fx, c, 'colorMist', 'mist gradient');
  Editor.gradient(fx, c, 'colorFlake', 'flake gradient');

  const plunge = folder.addFolder('8 · The plunge');
  R(plunge, c, 'plungeDrops', 0, 500, 1, 'splash drops');
  R(plunge, c, 'splashSize', 0, 8, 0.05, 'splash dome (m)');
  R(plunge, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(plunge, c, 'plungeFlash', 0, 1, 0.01, 'flash');
  R(plunge, c, 'plungeShake', 0, 1.5, 0.01, 'camera knock');
  R(plunge, c, 'plungeLight', 0, 8, 0.01, 'light punch (× intensity)');
  plunge.addColor(c, 'colorSplashA').name('splash inner');
  plunge.addColor(c, 'colorSplashB').name('splash mid');
  plunge.addColor(c, 'colorSplashC').name('splash outer');
  plunge.addColor(c, 'colorShockA').name('shockwave');
  plunge.addColor(c, 'colorShockB').name('shockwave hot');
  plunge.addColor(c, 'colorFlash').name('flash');

  const hits = folder.addFolder('9 · Hits');
  R(hits, c, 'hitWidth', 0.1, 3, 0.01, 'reach either side (m)');
  R(hits, c, 'pierceImpulse', 0, 30, 0.1, 'run through (m/s)');
  R(hits, c, 'pierceLift', 0, 15, 0.05, 'run-through lift');
  R(hits, c, 'pierceSpin', 0, 6, 0.01, 'tumble');
  R(hits, c, 'impactRadius', 0, 8, 0.05, 'plunge throws within (m)');
  R(hits, c, 'plungeImpulse', 0, 30, 0.1, 'plunge throw (m/s)');
  R(hits, c, 'plungeLift', 0, 20, 0.05, 'plunge lift');
  R(hits, c, 'beatImpulse', 0, 20, 0.1, 'beat drag-in (m/s)');
  R(hits, c, 'beatLift', 0, 15, 0.05, 'beat lift');
  R(hits, c, 'bleedTime', 0.05, 6, 0.05, 'bleeds pale over (s)');
  R(hits, c, 'bleedPale', 0, 1, 0.01, 'how pale');
  R(hits, c, 'bleedDrops', 0, 200, 1, 'drips/second off a body');
  R(hits, c, 'bledRimGlow', 0, 8, 0.05, 'bled rim glow');
  hits.addColor(c, 'colorBledBody').name('bled body');
  hits.addColor(c, 'colorBledRim').name('bled rim');

  folder.close();
  return folder;
}
