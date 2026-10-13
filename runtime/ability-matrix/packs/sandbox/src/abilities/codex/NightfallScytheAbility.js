import { Mesh, Object3D, PlaneGeometry, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createNightBladeMaterial,
  createNightSweepMaterial,
  createNightLensMaterial,
  createNightStainMaterial
} from '../../materials/codex/NightfallScytheMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'nightfall';

const TAU = Math.PI * 2;

/** Souls in flight at once. A reaping that takes more simply reuses the oldest. */
const MAX_SOULS = 16;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _hub = new Vector3();
const _right = new Vector3();
const _floor = new Vector3();
const _local = new Vector3();
const _back = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _hand = new Vector3();
const _ctrl = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * NIGHTFALL SCYTHE — a blade of night that spins down the line and reaps.
 *
 * A line cast. A huge spectral scythe blade forms out of the floor behind the
 * caster, turning slowly as it rises; then it is loosed, and runs the line
 * spinning flat at waist height about an invisible hub, so its point sweeps
 * a wide circle as it goes. Everything it passes is reaped: cut in two, and
 * its soul pulled out and streamed back into the caster's hand. At the end of
 * the line it slows, frays and comes apart into black smoke.
 *
 * Eight layers, each a folder in the editor:
 *
 *   1. **the blade** — a parameter-space strip bent into a hooked scythe in the
 *      vertex stage. Normal-blended ink: black with violet nebula swirls and
 *      twinkling stars, a thin white-violet edge along its concave front, and a
 *      back that is not an edge but smoke streaming off it. Spinning is a plain
 *      `rotation.y` on the mesh under a banked hub (`_pivot`).
 *   2. **the sweep** — a polar fan parented to the blade, covering the arc it
 *      has just swept: the motion smear that makes a spinning blade read as a
 *      blade and not a strobe, with a bright band along the tip's path. Its
 *      twin on `LAYER.DISTORTION` pushes the world out from the hub.
 *   3. **black smoke** — non-additive SMOKE shed off the back of the blade at
 *      the points the CPU twin of the shape puts there, plus a low wake left on
 *      the floor along the line.
 *   4. **violet motes** — additive sparks off the cutting edge, thrown along
 *      the blade's own tangential velocity.
 *   5. **the stain** — a ground strip that only exists behind the hub: a
 *      ragged inky pool with a violet rim and sunk stars, hot right behind the
 *      blade and cooling, eaten raggedly on the fade.
 *   6. **souls** — a pooled set of records, one per body reaped. Each is a
 *      quadratic arc from the body's chest to the caster's hand (read live, so
 *      the stream follows them), drawn as a bright head and a fading trail of
 *      additive particles; a puff of motes where it leaves and where it lands,
 *      and a light punch in the hand.
 *   7. **the reaping** — `handlesOwnHits`. Every frame the blade is sharp, a
 *      body within its reach is cut the moment the leading edge *at that body's
 *      radius* sweeps past its bearing from the hub (`dummy.kill(…, true)`),
 *      thrown along the blade's tangential velocity. A body the hub has already
 *      run past inside the reach is taken regardless: nothing slips the scythe.
 *   8. **the dissolve** — the blade drifts on past the target, slows, opens a
 *      little and tears apart on a noise threshold into a thick gout of smoke;
 *      a dark AIR shell, a violet shockwave, a knock on the camera and a punch
 *      of light.
 *
 * ## The editor rule
 *
 * A cast captures a seed and three integrated phases (the spin, the smoke
 * flow, the flutter). Everything with a unit is resolved from
 * `settings.nightfall` every frame, so dragging the reach or the curve
 * reshapes a blade already in flight and the spin never jumps.
 */
export class NightfallScytheAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The scythe decides what it reaps. */
  get handlesOwnHits() {
    return true;
  }

  /** Bodies reaped this cast. HUD readout only. */
  get instanceCount() {
    return this._reaped;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* the banked hub the blade turns about; the blade spins inside it */
    this.pivot = new Object3D();
    this.pivot.name = 'NightfallHub';
    this.pivot.rotation.order = 'YXZ';
    this.group.add(this.pivot);

    this.spinner = new Object3D();
    this.spinner.name = 'NightfallSpin';
    this.pivot.add(this.spinner);

    /* ---- layer 1: the blade ---- */
    // x: heel → tip, y: cutting edge → back, both 0..1.
    this.bladeGeometry = new PlaneGeometry(1, 1, 64, 12).translate(0.5, 0.5, 0);
    this.bladeMaterial = createNightBladeMaterial();
    this.blade = new Mesh(this.bladeGeometry, this.bladeMaterial);
    this.blade.name = 'NightfallBlade';
    this.blade.layers.set(LAYER.VFX);
    this.blade.renderOrder = 16;
    this.blade.frustumCulled = false;
    this.spinner.add(this.blade);

    /* ---- layer 2: the sweep and its lens ---- */
    // x: 0 at the blade → 1 oldest, y: heel → tip.
    this.sweepGeometry = new PlaneGeometry(1, 1, 56, 10).translate(0.5, 0.5, 0);
    this.sweepMaterial = createNightSweepMaterial();
    this.sweep = new Mesh(this.sweepGeometry, this.sweepMaterial);
    this.sweep.name = 'NightfallSweep';
    this.sweep.layers.set(LAYER.VFX);
    this.sweep.renderOrder = 15;
    this.sweep.frustumCulled = false;
    this.spinner.add(this.sweep);

    this.lensMaterial = createNightLensMaterial();
    this.lens = new Mesh(this.sweepGeometry, this.lensMaterial);
    this.lens.name = 'NightfallLens';
    this.lens.layers.set(LAYER.DISTORTION);
    this.lens.frustumCulled = false;
    this.spinner.add(this.lens);

    /* ---- layer 5: the stain ---- */
    this.stainGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.stainMaterial = createNightStainMaterial();
    this.stain = new Mesh(this.stainGeometry, this.stainMaterial);
    this.stain.name = 'NightfallStain';
    this.stain.layers.set(LAYER.VFX);
    this.stain.renderOrder = 2;
    this.stain.frustumCulled = false;
    this.group.add(this.stain);

    this._setVisible(false);
    this.stain.visible = false;

    /** Scratch state handed to the materials — one object apiece, reused. */
    this._bladeState = { form: 0, spread: 1, dissolve: 0, phase: 0, flow: 0, fade: 1, trailFade: 1, seed: 0 };
    this._stainState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      length: 1,
      cutEnd: 0,
      bladeAt: 0,
      heat: 1,
      fadeT: 0,
      seed: 0
    };

    /** One record per soul: where it left from, its clock, its dice. */
    this.souls = [];
    for (let i = 0; i < MAX_SOULS; i++) {
      this.souls.push({ active: false, from: new Vector3(), at: new Vector3(), t: 0, sway: 0, side: 1, emitter: new RateEmitter() });
    }
    this._soulCursor = 0;

    this._seed = 0;
    /** Integrated spin angle (rad), smoke flow and flutter phase. */
    this._spin = 0;
    this._prevSpin = 0;
    this._flow = 0;
    this._phase = 0;
    /** Metres down the line the hub is, and was last frame. */
    this._along = 0;
    this._prevAlong = 0;
    this._reaped = 0;
    this._heat = 1;
    this._mirror = 1;

    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 3: black smoke ---- */
    // Not additive: the smoke of night has to darken what is behind it.
    this.smoke = particles.get('nightfall.smoke', {
      capacity: 2600,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.0
    });
    this.smoke.uniforms.uSizeIn.value = 0.15;
    this.smoke.uniforms.uFadeIn.value = 0.12;
    this.smoke.uniforms.uFadeOut.value = 0.5;
    this.smoke.uniforms.uEndSize.value = 2.0;
    this.smoke.uniforms.uTurbFrequency.value = 0.6;
    this.smoke.uniforms.uTurbSpeed.value = 0.5;

    /* ---- layer 4: violet motes ---- */
    this.motes = particles.get('nightfall.motes', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.3
    });
    this.motes.uniforms.uSizeIn.value = 0.05;
    this.motes.uniforms.uFadeIn.value = 0.05;
    this.motes.uniforms.uFadeOut.value = 0.55;
    this.motes.uniforms.uEndSize.value = 0.25;
    this.motes.uniforms.uTurbFrequency.value = 0.9;

    /* ---- layer 6: souls ---- */
    this.soulFx = particles.get('nightfall.souls', {
      capacity: 2000,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.3
    });
    this.soulFx.uniforms.uSizeIn.value = 0.03;
    this.soulFx.uniforms.uFadeIn.value = 0.03;
    this.soulFx.uniforms.uFadeOut.value = 0.65;
    this.soulFx.uniforms.uEndSize.value = 0.15;
    this.soulFx.uniforms.uDrag.value = 2.5;
    this.soulFx.uniforms.uGravity.value.set(0, 0.25, 0);

    this.smokeEmitter = new RateEmitter();
    this.wakeEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
  }

  _setVisible(on) {
    this.blade.visible = on;
    this.sweep.visible = on;
    this.lens.visible = on;
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the blade coming apart. */
  get impactDuration() {
    return Math.max(0.05, settings.nightfall.dissolveTime * settings.global.lifetime);
  }

  /** The fade is the smoke settling, the souls landing and the stain cooling. */
  get fadeDuration() {
    return Math.max(0.1, settings.nightfall.lifetime * settings.global.lifetime);
  }

  get _formTime() {
    return Math.max(0.01, settings.nightfall.formTime * settings.global.lifetime);
  }

  /** Guttering, in step with the blade's own turn. */
  lightShimmer() {
    const f = settings.nightfall.lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this._spin * 2.0) * Math.sin(this.age * 6.1 + 0.4));
  }

  /**
   * Hold the front at the caster while the blade forms; then run the line.
   * The base class eases off a standstill keyed on age, which by then has long
   * passed, so the blade leaves the hand already at speed — it was loosed.
   */
  advance(dt) {
    if (this.age < this._formTime) {
      this.position.copy(this.origin);
      return false;
    }
    return super.advance(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The blade on the CPU                                                */
  /* ------------------------------------------------------------------ */

  /**
   * A point on the blade at (u heel→tip, v edge→back), in the spinner's local
   * frame. The CPU twin of `bladeCentre` / `bladeBack` / `bladeWidth`.
   */
  _bladeLocal(u, v, out) {
    const c = settings.nightfall;
    const s = this._bladeState;
    this._centre(u, out);
    if (v === 0) return out;
    this._centre(Math.max(0, u - 0.01), _a);
    this._centre(Math.min(1, u + 0.01), _b);
    _b.sub(_a).setY(0).normalize();
    _back.set(-_b.z, 0, _b.x);
    // The trailing side of a point turning about +Y is (-z, 0, x).
    if (_back.x * -out.z + _back.z * out.x < 0) _back.negate();
    const heel = 0.35 + 0.65 * smoothstep(0, Math.max(c.bladeHeel, 0.001), u);
    const w = Math.max(0.02, c.bladeWidth) * s.spread * lerp(0.2, 1, s.form) * Math.pow(Math.max(1 - u, 0), Math.max(c.bladeTaper, 0.05)) * heel;
    return out.addScaledVector(_back, w * v);
  }

  _centre(u, out) {
    const c = settings.nightfall;
    const s = this._bladeState;
    const reach = Math.max(c.bladeInner + 0.1, c.bladeReach);
    const r = lerp(Math.max(0, c.bladeInner), reach, u) * s.spread * lerp(0.25, 1, s.form);
    const a = this._phi(u);
    return out.set(r * Math.cos(a), -c.bladeDroop * u * u, -r * Math.sin(a));
  }

  /** Rotation angle of the leading edge at u, relative to the blade's heel. */
  _phi(u) {
    return settings.nightfall.bladeCurve * Math.pow(Math.max(u, 0), 1.6) * lerp(0.3, 1, this._bladeState.form);
  }

  /** Local → world through the spinning blade's own transform. */
  _toWorld(local, out) {
    return out.copy(local).applyMatrix4(this.spinner.matrixWorld);
  }

  /** The reach of the scythe right now, metres from the hub. */
  _reach() {
    const c = settings.nightfall;
    const s = this._bladeState;
    return Math.max(c.bladeInner + 0.1, c.bladeReach) * s.spread * lerp(0.25, 1, s.form);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.nightfall;
    const g = settings.global;

    this.smokeEmitter.reset();
    this.wakeEmitter.reset();
    this.moteEmitter.reset();
    for (const soul of this.souls) soul.active = false;
    this._soulCursor = 0;

    this._seed = Math.random() * 100;
    this._spin = Math.random() * TAU;
    this._prevSpin = this._spin;
    this._flow = 0;
    this._phase = Math.random() * 10;
    this._along = -c.formBehind;
    this._prevAlong = this._along;
    this._reaped = 0;
    this._heat = 1;
    this._mirror = c.spinDir < 0 ? -1 : 1;

    // Local +X of the line in the world (as Gale Sever): yaw sends local +Z
    // down the line and local +X to (dir.z, 0, -dir.x).
    _right.set(this.direction.z, 0, -this.direction.x);

    const s = this._bladeState;
    s.seed = this._seed;
    s.form = 0;
    s.spread = 1;
    s.dissolve = 0;
    s.fade = 0;
    s.trailFade = 0;

    this._stainState.fadeT = 0;
    this._stainState.heat = 1;

    this._setVisible(true);
    this.stain.visible = true;

    /* a pool of smoke boils up where the blade is forming */
    this._resetEmit(frame.uTime.value);
    _pos.copy(this.origin).addScaledVector(this.direction, -c.formBehind).setY(0.15);
    _emit.position = _pos;
    _emit.anchor = _pos;
    _emit.radius = c.bladeReach * 0.45;
    _emit.direction = _up;
    _emit.speed = 0.9;
    _emit.spread = 0.6;
    _emit.size = c.smokeSize;
    _emit.life = c.smokeLifetime * 0.8;
    _emit.spin = 0.5;
    this.smoke.emit(Math.round(c.castSmoke * g.particleCount), _emit);
    _emit.size = c.moteSize;
    _emit.speed = c.moteSpeed;
    _emit.life = c.moteLifetime;
    this.motes.emit(Math.round(c.castSmoke * 0.6 * g.particleCount), _emit);

    this._sync(0, 0);
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

  /** Advance the integrated phases. Rates are live; positions never jump. */
  _advance(dt, spinScale) {
    const c = settings.nightfall;
    const g = settings.global;
    const forming = this.age < this._formTime;
    const rate = forming ? lerp(c.windupSpin, c.spinSpeed, Easing.inCubic(saturate(this.age / this._formTime))) : c.spinSpeed;
    this._prevSpin = this._spin;
    this._spin += rate * TAU * dt * g.animationSpeed * spinScale;
    this._flow += c.smokeFlow * dt * g.noiseSpeed;
    this._phase += 2.2 * dt * g.noiseSpeed;
  }

  /**
   * Resolve the blade, its sweep and the stain from settings.
   * @param {number} dissolveT 0 whole .. 1 gone (the impact phase)
   * @param {number} fadeT 0..1 through the fade
   */
  _sync(dissolveT, fadeT) {
    const c = settings.nightfall;
    const g = settings.global;
    const s = this._bladeState;

    const formK = saturate(this.age / this._formTime);
    s.form = Easing.outBack(formK);
    s.spread = lerp(1, 1.18, Easing.outCubic(dissolveT));
    s.dissolve = Easing.inOutQuad(dissolveT);
    s.phase = this._phase;
    s.flow = this._flow;
    s.fade = Easing.outQuad(saturate(formK * 1.6));
    s.trailFade = Easing.inQuad(formK) * (1 - Easing.outQuad(dissolveT));
    this.bladeMaterial.userData.sync(s);
    this.sweepMaterial.userData.sync(s);
    this.lensMaterial.userData.sync(s);

    // The hub: rises out of the floor behind the caster while forming, then
    // rides the line at blade height.
    _hub.copy(this.origin).addScaledVector(this.direction, this._along);
    _hub.y = c.bladeHeight - c.formRise * (1 - Easing.outCubic(formK));
    this.pivot.position.copy(_hub);
    this.pivot.rotation.set(0, Math.atan2(this.direction.x, this.direction.z), c.bladeTilt * this._mirror);
    // spinDir is a mirror of the whole hub, so the shape, the sweep and the
    // CPU twin stay one shape turning the other way.
    this.pivot.scale.set(1, 1, this._mirror);
    this.spinner.rotation.set(0, this._spin, 0);
    this.pivot.updateMatrixWorld(true);

    /* the stain */
    const st = this._stainState;
    const start = Math.max(0, c.stainStart);
    st.start.copy(this.origin).addScaledVector(this.direction, start);
    st.dir.copy(this.direction);
    st.side.copy(_right);
    st.length = Math.max(0.2, this.length + c.dissolveDrift - start + 1.5);
    st.bladeAt = this._along - start;
    st.cutEnd = Math.max(0, this._along - start);
    st.heat = this._heat;
    st.seed = this._seed;
    st.fadeT = fadeT;
    this.stainMaterial.userData.sync(st);

    /* the particles' looks */
    this.smoke.setGradient(getColor(c.colorSmokeA), getColor(c.colorSmokeB), getColor(c.colorSmokeC), getColor(c.colorSmokeD));
    const sm = this.smoke.uniforms;
    sm.uDrag.value = c.smokeDrag;
    sm.uGravity.value.set(0, c.smokeRise, 0);
    sm.uSizeScale.value = g.particleSize;
    sm.uLifeScale.value = g.particleLifetime;
    sm.uSpeedScale.value = g.particleSpeed;
    sm.uOpacity.value = c.smokeOpacity * g.opacity;
    sm.uTurbulence.value = c.smokeTurbulence * g.turbulence;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    const mo = this.motes.uniforms;
    mo.uDrag.value = 1.4;
    mo.uGravity.value.set(0, c.moteRise, 0);
    mo.uSizeScale.value = g.particleSize;
    mo.uLifeScale.value = g.particleLifetime;
    mo.uSpeedScale.value = g.particleSpeed;
    mo.uOpacity.value = g.opacity;
    mo.uGlow.value = c.moteGlow * g.glow;
    mo.uTurbulence.value = 0.6 * g.turbulence;

    this.soulFx.setGradient(getColor(c.colorSoulA), getColor(c.colorSoulB), getColor(c.colorSoulC), getColor(c.colorSoulD));
    const so = this.soulFx.uniforms;
    so.uSizeScale.value = g.particleSize;
    so.uLifeScale.value = g.particleLifetime;
    so.uSpeedScale.value = g.particleSpeed;
    so.uOpacity.value = g.opacity;
    so.uGlow.value = c.soulGlow * g.glow;
    so.uTurbulence.value = 0.35 * g.turbulence;
  }

  /** Where the hub is on the line, metres: from behind the caster to the target. */
  _hubAlong() {
    const c = settings.nightfall;
    const behind = Math.max(0, c.formBehind);
    // Linear in the front, so it leaves from behind the caster and arrives
    // exactly on the target — the run is the front's run, stretched.
    return this.front * (1 + behind / this.length) - behind;
  }

  /* ------------------------------------------------------------------ */
  /* Travel                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.nightfall;
    const g = settings.global;
    this._advance(dt, 1);
    this._prevAlong = this._along;
    this._along = this._hubAlong();
    this._sync(0, 0);

    const forming = this.age < this._formTime;
    this._flightFx(dt, forming ? 0.45 : 1, !forming);
    if (!forming) {
      this._reap();
      this.ctx.shake.rumble(c.travelRumble * g.cameraShake, dt);
    }
    this._updateSouls(dt);
    this.position.copy(_hub);
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the blade comes apart into smoke                           */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings.nightfall;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;

    _hub.copy(this.origin).addScaledVector(this.direction, this.length);
    _hub.y = c.bladeHeight;

    /* a shell of night, squashed to the floor */
    this.ctx.bursts.spawn(BurstMode.AIR, _hub, {
      radius: c.burstSize * 0.15,
      endRadius: c.burstSize * power,
      life: 0.6,
      intensity: c.burstIntensity,
      opacity: 0.4,
      fresnel: 2.2,
      displace: 0.4,
      squash: 0.5,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    _floor.copy(_hub).setY(0);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.6,
      width: 0.07,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.SCORCH, _floor, {
      radius: c.stainWidth * 1.3,
      life: c.lifetime * 1.6 + 1,
      intensity: 0.6,
      colorA: getColor(c.colorStainDeep),
      colorB: getColor(c.colorStainRim)
    });

    /* the gout of smoke the blade becomes — taken off the blade itself */
    this._resetEmit(time);
    const count = Math.round(c.dissolveSmoke * g.particleCount);
    _emit.radius = 0.15;
    _emit.size = c.smokeSize * 1.1;
    _emit.life = c.smokeLifetime;
    _emit.spin = 0.6;
    _emit.spread = 0.5;
    for (let n = 0; n < count; n++) {
      this._bladeLocal(Math.random(), Math.random(), _local);
      this._toWorld(_local, _pos);
      _dir.copy(_pos).sub(_hub).setY(0.4);
      if (_dir.lengthSq() < 1e-6) _dir.copy(_up);
      _dir.normalize();
      _emit.position = _pos;
      _emit.anchor = _pos;
      _emit.direction = _dir;
      _emit.speed = c.smokeShed * 1.4;
      this.smoke.emit(1, _emit);
    }
    _emit.anchor = null;
    _emit.position = _hub;
    _emit.radius = c.bladeReach * 0.6;
    _emit.direction = _up;
    _emit.size = c.moteSize * 1.2;
    _emit.life = c.moteLifetime;
    _emit.speed = c.moteSpeed * 1.6;
    _emit.spread = 1;
    this.motes.emit(Math.round(c.dissolveSmoke * 0.5 * g.particleCount), _emit);

    this.ctx.shake.add(c.impactShake * power * g.cameraShake, 1 / Math.max(0.05, c.shakeDuration), 16);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.lightIntensity * c.impactLight * power;
  }

  onFade(dt, t) {
    const c = settings.nightfall;
    this._updateSouls(dt);

    if (t <= 1) {
      // Drifts on past the target, slowing, fraying into smoke.
      this._advance(dt, 1 - c.dissolveSpinDown * Easing.outQuad(t));
      this._prevAlong = this._along;
      this._along = this.length + c.dissolveDrift * Easing.outCubic(t);
      this._sync(t, 0);
      const strength = 1 - Easing.inQuad(t);
      this._flightFx(dt, strength * 0.7, true);
      // The smoke it is becoming pours off it.
      this._dissolveFx(dt, t);
      if (t < 0.45) this._reap();
      this.position.copy(_hub);
      return;
    }

    /* the fade: the blade is gone; the smoke settles and the stain cools */
    const ft = saturate(t - 1);
    this._setVisible(false);
    this._heat = Math.max(0, this._heat - dt / Math.max(0.05, c.stainCool));
    this._sync(1, smoothstep(0.25, 1, ft));
    this.position.copy(_hub);
  }

  /* ------------------------------------------------------------------ */
  /* Effects in flight                                                   */
  /* ------------------------------------------------------------------ */

  /** Smoke off the back, motes off the edge, a wake on the floor. */
  _flightFx(dt, strength, wake) {
    const c = settings.nightfall;
    const g = settings.global;
    const time = frame.uTime.value;
    const omega = c.spinSpeed * TAU * g.animationSpeed * this._mirror;

    /* layer 3: black smoke shed off the blade's smoky back */
    const puffs = Math.round(this.smokeEmitter.tick(dt, c.smokeRate * strength) * g.particleCount);
    if (puffs > 0) {
      this._resetEmit(time);
      _emit.size = c.smokeSize;
      _emit.sizeVariance = 0.5;
      _emit.life = c.smokeLifetime;
      _emit.spin = 0.5;
      _emit.spread = 0.35;
      for (let n = 0; n < puffs; n++) {
        const u = Math.pow(Math.random(), 0.7);
        this._bladeLocal(u, lerp(0.7, 1.05, Math.random()), _local);
        this._toWorld(_local, _pos);
        // Left behind by the turn: thrown back against the spin, a little up.
        _vel.set(_pos.z - _hub.z, 0, -(_pos.x - _hub.x)).multiplyScalar(-0.12 * Math.sign(omega));
        _vel.y = c.smokeShed * 0.3;
        const sp = _vel.length();
        _emit.position = _pos;
        _emit.anchor = _pos;
        _emit.direction = sp > 1e-4 ? _dir.copy(_vel).divideScalar(sp) : _up;
        _emit.speed = c.smokeShed;
        this.smoke.emit(1, _emit);
      }
    }

    /* a low wake left on the floor down the line */
    if (wake) {
      const lows = Math.round(this.wakeEmitter.tick(dt, c.smokeWake * strength) * g.particleCount);
      if (lows > 0) {
        this._resetEmit(time);
        const half = Math.max(0.1, c.stainWidth);
        const step = Math.max(0, this._along - this._prevAlong);
        _emit.size = c.smokeSize * 1.2;
        _emit.life = c.smokeLifetime * 1.2;
        _emit.spin = 0.4;
        _emit.speed = 0.35;
        _emit.spread = 0.8;
        _emit.direction = _up;
        for (let n = 0; n < lows; n++) {
          _floor.copy(this.origin)
            .addScaledVector(this.direction, this._along - Math.random() * (step + 0.5))
            .addScaledVector(_right, (Math.random() * 2 - 1) * half * 0.8);
          _floor.y = 0.12;
          _emit.position = _floor;
          _emit.anchor = _floor;
          this.smoke.emit(1, _emit);
        }
      }
    }

    /* layer 4: violet motes flung off the cutting edge along its velocity */
    const motes = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength) * g.particleCount);
    if (motes > 0) {
      this._resetEmit(time);
      _emit.size = c.moteSize;
      _emit.sizeVariance = 0.6;
      _emit.life = c.moteLifetime;
      _emit.spread = 0.3;
      for (let n = 0; n < motes; n++) {
        const u = Math.sqrt(Math.random());
        this._bladeLocal(u, 0, _local);
        this._toWorld(_local, _pos);
        // Tangential velocity of a point turning about the hub.
        _vel.set(_pos.z - _hub.z, 0, -(_pos.x - _hub.x)).multiplyScalar(Math.sign(omega));
        _vel.normalize().addScaledVector(_up, 0.3).normalize();
        _emit.position = _pos;
        _emit.direction = _vel;
        _emit.speed = c.moteSpeed * (1 + u);
        this.motes.emit(1, _emit);
      }
    }
  }

  /** While it comes apart, the blade pours smoke as it goes. */
  _dissolveFx(dt, t) {
    const c = settings.nightfall;
    const g = settings.global;
    const n = Math.round(this.smokeEmitter.tick(dt, c.dissolveSmoke * 2.5 * (1 - t)) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.smokeSize * 1.2;
    _emit.life = c.smokeLifetime;
    _emit.spin = 0.6;
    _emit.spread = 0.6;
    _emit.speed = c.smokeShed * 0.8;
    _emit.direction = _up;
    for (let k = 0; k < n; k++) {
      this._bladeLocal(Math.random(), Math.random(), _local);
      this._toWorld(_local, _pos);
      _emit.position = _pos;
      _emit.anchor = _pos;
      this.smoke.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* The reaping                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Reap whatever the leading edge has swept past since the last frame.
   *
   * In the hub's frame a body at radius r and bearing β is cut when the edge
   * at that radius — at angle `spin + φ(u(r))` — passes β. Swept angle per
   * frame is `spin - prevSpin`; if that is a whole turn, everything in reach
   * goes. A body the hub has run past inside the reach is taken regardless.
   */
  _reap() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings.nightfall;
    const g = settings.global;
    const reach = this._reach() + c.sliceReach;
    const found = field.findTargets(_hub.x, _hub.z, reach + Math.max(0, this._along - this._prevAlong) + 0.5, this._found);
    if (found.length === 0) return;

    const swept = this._spin - this._prevSpin;
    const inner = Math.max(0, c.bladeInner);
    const outer = Math.max(inner + 0.1, c.bladeReach);
    const yaw = this.pivot.rotation.y;
    this._force.impulse = c.sliceImpulse * g.explosionIntensity;
    this._force.lift = c.sliceLift * g.explosionIntensity;
    this._force.spin = c.sliceSpin;

    for (const dummy of found) {
      const dx = dummy.position.x - _hub.x;
      const dz = dummy.position.z - _hub.z;
      const r = Math.hypot(dx, dz);
      if (r > reach) continue;
      // Body → hub-local: undo the yaw, then the mirror.
      const cy = Math.cos(-yaw);
      const sy = Math.sin(-yaw);
      const lx = dx * cy + dz * sy;
      const lz = (-dx * sy + dz * cy) * this._mirror;
      const bearing = Math.atan2(-lz, lx);
      const u = saturate((r / Math.max(0.01, this._bladeState.spread) - inner) / (outer - inner));
      const edgeNow = this._spin + this._phi(u);
      const edgePrev = edgeNow - swept;
      let delta = (bearing - edgePrev) % TAU;
      if (delta < 0) delta += TAU;
      const swept0 = swept >= TAU || delta <= swept;

      const along = (dummy.position.x - this.origin.x) * this.direction.x + (dummy.position.z - this.origin.z) * this.direction.z;
      const lat = (dummy.position.x - this.origin.x) * _right.x + (dummy.position.z - this.origin.z) * _right.z;
      const passed = along < this._along - 0.2 && Math.abs(lat) < reach;
      if (!swept0 && !passed && r > inner * 0.8) continue;

      // Thrown along the blade's tangential velocity at the body, and onward.
      _dir.set(dz, 0, -dx).multiplyScalar(this._mirror);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      _dir.normalize().addScaledVector(this.direction, 0.6).normalize();
      if (!dummy.kill(_dir.x, _dir.z, this._force, true)) continue;
      this._reaped++;
      this._hitFx(dummy.position, _dir);
      this._spawnSoul(dummy.position);
    }
  }

  /** Smoke and a knock where a body was reaped. */
  _hitFx(at, dir) {
    const c = settings.nightfall;
    const g = settings.global;
    const time = frame.uTime.value;
    this._resetEmit(time);
    _pos.copy(at).setY(c.bladeHeight);
    _emit.position = _pos;
    _emit.anchor = _pos;
    _emit.radius = 0.3;
    _emit.direction = dir;
    _emit.speed = c.smokeShed * 1.5;
    _emit.spread = 0.7;
    _emit.size = c.smokeSize * 0.9;
    _emit.life = c.smokeLifetime * 0.8;
    _emit.spin = 0.6;
    this.smoke.emit(Math.round(c.hitSmoke * g.particleCount), _emit);

    _emit.anchor = null;
    _emit.radius = 0.15;
    _emit.speed = c.moteSpeed * 2.2;
    _emit.spread = 0.8;
    _emit.size = c.moteSize * 1.2;
    _emit.life = c.moteLifetime * 0.7;
    this.motes.emit(Math.round(c.hitSmoke * 0.8 * g.particleCount), _emit);

    this.ctx.shake.add(c.hitShake * g.explosionIntensity * g.cameraShake, 7, 22);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.hitFlash * g.explosionIntensity);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.7);
  }

  /* ------------------------------------------------------------------ */
  /* Souls                                                               */
  /* ------------------------------------------------------------------ */

  /** Pull a soul out of a body and set it streaming home. */
  _spawnSoul(at) {
    const c = settings.nightfall;
    const g = settings.global;
    const soul = this.souls[this._soulCursor];
    this._soulCursor = (this._soulCursor + 1) % MAX_SOULS;
    soul.active = true;
    soul.t = 0;
    soul.from.set(at.x, 1.25, at.z);
    soul.at.copy(soul.from);
    soul.sway = Math.random() * TAU;
    soul.side = Math.random() < 0.5 ? -1 : 1;
    soul.emitter.reset();

    // A puff of pale motes as it is torn out.
    this._resetEmit(frame.uTime.value);
    _emit.position = soul.from;
    _emit.radius = 0.25;
    _emit.direction = _up;
    _emit.speed = c.moteSpeed * 1.4;
    _emit.spread = 0.9;
    _emit.size = c.soulTrailSize * 1.2;
    _emit.life = c.soulTrailLife * 1.2;
    this.soulFx.emit(Math.round(c.soulBurst * g.particleCount), _emit);
  }

  /** The caster's hand, live — the stream follows them if they move. */
  _handPoint(out) {
    const c = settings.nightfall;
    const root = this.ctx.character?.position;
    if (root) out.set(root.x, 0, root.z);
    else out.copy(this.origin);
    out.addScaledVector(this.direction, 0.35);
    out.y = c.handHeight;
    return out;
  }

  _updateSouls(dt) {
    const c = settings.nightfall;
    const g = settings.global;
    const time = frame.uTime.value;
    const span = Math.max(0.1, c.soulTime * g.lifetime);
    this._handPoint(_hand);

    for (const soul of this.souls) {
      if (!soul.active) continue;
      soul.t += dt / span;
      const k = Math.min(1, soul.t);
      // Slow to leave the body, fast into the hand.
      const e = Easing.inOutCubic(k);
      // A quadratic arc: up out of the body, over, and down into the hand,
      // weaving side to side on its way.
      _ctrl.lerpVectors(soul.from, _hand, 0.45);
      _ctrl.y = Math.max(soul.from.y, _hand.y) + c.soulArc;
      const ie = 1 - e;
      _pos.copy(soul.from).multiplyScalar(ie * ie)
        .addScaledVector(_ctrl, 2 * ie * e)
        .addScaledVector(_hand, e * e);
      const sway = Math.sin(soul.sway + k * 9.0) * c.soulSway * Math.sin(k * Math.PI) * soul.side;
      _pos.addScaledVector(_right, sway);
      _vel.copy(_pos).sub(soul.at);
      soul.at.copy(_pos);

      const n = soul.emitter.tick(dt, c.soulTrailRate * g.particleCount);
      if (n > 0) {
        this._resetEmit(time);
        _emit.position = _pos;
        _emit.radius = 0.05;
        _emit.direction = _up;
        _emit.speed = 0.15;
        _emit.spread = 1;
        _emit.size = c.soulTrailSize;
        _emit.life = c.soulTrailLife;
        this.soulFx.emit(n, _emit);
        // The head: a few large, short-lived, white-hot points, every frame.
        _emit.size = c.soulSize;
        _emit.sizeVariance = 0.2;
        _emit.life = 0.12;
        _emit.lifeVariance = 0.1;
        _emit.speed = 0;
        _emit.radius = 0;
        this.soulFx.emit(1, _emit);
      }

      if (k >= 1) {
        soul.active = false;
        // Taken into the hand: a puff, and the light in it jumps.
        this._resetEmit(time);
        _emit.position = _hand;
        _emit.radius = 0.15;
        _emit.direction = _up;
        _emit.speed = c.moteSpeed;
        _emit.spread = 1;
        _emit.size = c.soulTrailSize;
        _emit.life = c.soulTrailLife;
        this.soulFx.emit(Math.round(c.soulBurst * 0.7 * g.particleCount), _emit);
        this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.soulLight * g.explosionIntensity);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._setVisible(false);
    this.stain.visible = false;
    for (const soul of this.souls) soul.active = false;
  }

  dispose() {
    this.bladeGeometry.dispose();
    this.sweepGeometry.dispose();
    this.stainGeometry.dispose();
    this.bladeMaterial.dispose();
    this.sweepMaterial.dispose();
    this.lensMaterial.dispose();
    this.stainMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1F319}  Nightfall Scythe');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 80, 0.5, 'hub speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 8, 0.05, 'stain + smoke linger (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'guttering');

  const blade = folder.addFolder('1 · Blade');
  const shape = blade.addFolder('Silhouette');
  R(shape, c, 'bladeHeight', 0.1, 3, 0.01, 'spin height (m)');
  R(shape, c, 'bladeInner', 0, 2, 0.01, 'heel radius (m)');
  R(shape, c, 'bladeReach', 0.5, 6, 0.01, 'tip radius (m)');
  R(shape, c, 'bladeCurve', 0, 3, 0.01, 'hook (rad)');
  R(shape, c, 'bladeWidth', 0.05, 2.5, 0.01, 'depth (m)');
  R(shape, c, 'bladeTaper', 0.05, 3, 0.01, 'taper to the point');
  R(shape, c, 'bladeHeel', 0.001, 0.5, 0.001, 'heel rounding');
  R(shape, c, 'bladeDroop', -1, 1, 0.01, 'tip droop (m)');
  R(shape, c, 'bladeTilt', -1, 1, 0.01, 'bank (rad)');
  R(shape, c, 'spinSpeed', 0, 8, 0.01, 'spin (rev/s)');
  R(shape, c, 'spinDir', -1, 1, 2, 'spin direction');
  R(shape, c, 'formTime', 0.01, 2, 0.01, 'forms over (s)');
  R(shape, c, 'formBehind', 0, 5, 0.01, 'forms behind (m)');
  R(shape, c, 'formRise', 0, 3, 0.01, 'rises from (m)');
  R(shape, c, 'windupSpin', 0, 4, 0.01, 'wind-up spin (rev/s)');

  const look = blade.addFolder('Shading');
  R(look, c, 'edgeWidth', 0.005, 0.3, 0.001, 'edge width (m)');
  R(look, c, 'edgeGlow', 0, 15, 0.05, 'edge glow');
  R(look, c, 'edgeHalo', 0, 3, 0.01, 'edge halo');
  R(look, c, 'bodyOpacity', 0, 1, 0.01, 'body opacity');
  R(look, c, 'nebula', 0, 2, 0.01, 'nebula');
  R(look, c, 'nebulaScale', 0.1, 8, 0.01, 'nebula scale');
  R(look, c, 'starDensity', 0.5, 20, 0.1, 'stars per metre');
  R(look, c, 'starSize', 0.01, 0.5, 0.005, 'star size');
  R(look, c, 'starChance', 0, 1, 0.01, 'star chance');
  R(look, c, 'starGlow', 0, 10, 0.05, 'star glow');
  R(look, c, 'starTwinkle', 0, 20, 0.1, 'twinkle speed');
  R(look, c, 'smokeEdge', 0.01, 1, 0.01, 'smoky back (fraction)');
  R(look, c, 'smokeScale', 0.2, 8, 0.01, 'smoke scale');
  R(look, c, 'smokeFlow', 0, 8, 0.01, 'smoke flow');
  R(look, c, 'rimGlow', 0, 6, 0.01, 'edge-on glow');
  R(look, c, 'softFade', 0.01, 2, 0.01, 'soft intersection (m)');
  look.addColor(c, 'colorA').name('cutting edge');
  look.addColor(c, 'colorB').name('edge core');
  look.addColor(c, 'colorBody').name('body');
  look.addColor(c, 'colorNebula').name('nebula');
  look.addColor(c, 'colorStar').name('stars');

  const sweep = folder.addFolder('2 · Sweep + distortion');
  R(sweep, c, 'trailArc', 0.05, 6, 0.01, 'arc (rad)');
  R(sweep, c, 'trailOpacity', 0, 1, 0.01, 'opacity');
  R(sweep, c, 'trailGlow', 0, 8, 0.05, 'glow');
  R(sweep, c, 'trailEdge', 0.01, 0.6, 0.005, 'tip band');
  R(sweep, c, 'trailFalloff', 0.05, 6, 0.01, 'falloff');
  R(sweep, c, 'trailNoise', 0, 1, 0.01, 'smokiness');
  R(sweep, c, 'trailScale', 0.2, 8, 0.01, 'smoke scale');
  sweep.addColor(c, 'colorTrail').name('body');
  sweep.addColor(c, 'colorTrailEdge').name('tip path');
  R(sweep, c, 'warpStrength', 0, 4, 0.01, 'distortion');
  R(sweep, c, 'warpScale', 0.1, 8, 0.01, 'distortion scale');
  R(sweep, c, 'warpSpeed', 0, 12, 0.05, 'distortion speed');

  const smoke = folder.addFolder('3 · Black smoke');
  R(smoke, c, 'smokeRate', 0, 1000, 1, 'puffs/second');
  R(smoke, c, 'smokeSize', 0.05, 3, 0.01, 'size');
  R(smoke, c, 'smokeLifetime', 0.1, 5, 0.05, 'lifetime');
  R(smoke, c, 'smokeOpacity', 0, 1, 0.01, 'opacity');
  R(smoke, c, 'smokeShed', 0, 6, 0.01, 'shed speed');
  R(smoke, c, 'smokeRise', -2, 3, 0.01, 'rise');
  R(smoke, c, 'smokeDrag', 0, 6, 0.01, 'drag');
  R(smoke, c, 'smokeTurbulence', 0, 3, 0.01, 'turbulence');
  R(smoke, c, 'smokeWake', 0, 600, 1, 'floor wake/second');
  Editor.gradient(smoke, c, 'colorSmoke', 'smoke gradient');

  const motes = folder.addFolder('4 · Violet motes');
  R(motes, c, 'moteRate', 0, 800, 1, 'per second');
  R(motes, c, 'moteSize', 0.005, 0.5, 0.001, 'size');
  R(motes, c, 'moteLifetime', 0.05, 4, 0.01, 'lifetime');
  R(motes, c, 'moteSpeed', 0, 8, 0.01, 'speed');
  R(motes, c, 'moteRise', -2, 3, 0.01, 'rise');
  R(motes, c, 'moteGlow', 0, 10, 0.05, 'glow');
  Editor.gradient(motes, c, 'colorMote', 'mote gradient');

  const stain = folder.addFolder('5 · Shadow stain');
  R(stain, c, 'stainStart', 0, 4, 0.01, 'starts after (m)');
  R(stain, c, 'stainWidth', 0.1, 5, 0.01, 'half-width (m)');
  R(stain, c, 'stainEdgeNoise', 0, 1.5, 0.01, 'ragged edge');
  R(stain, c, 'stainEdgeScale', 0.05, 4, 0.01, 'ragged scale');
  R(stain, c, 'stainOpacity', 0, 1, 0.01, 'opacity');
  R(stain, c, 'stainRim', 0.01, 0.6, 0.005, 'rim width (m)');
  R(stain, c, 'stainRimGlow', 0, 8, 0.05, 'rim glow');
  R(stain, c, 'stainStars', 0.2, 12, 0.05, 'stars per metre');
  R(stain, c, 'stainStarGlow', 0, 8, 0.05, 'star glow');
  R(stain, c, 'stainHot', 0, 10, 0.05, 'fresh glow');
  R(stain, c, 'stainHotLength', 0.1, 12, 0.05, 'glow length (m)');
  R(stain, c, 'stainCool', 0.05, 5, 0.01, 'cools over (s)');
  R(stain, c, 'stainErode', 0, 1, 0.01, 'ragged fade');
  stain.addColor(c, 'colorStainDeep').name('deep');
  stain.addColor(c, 'colorStainMid').name('currents');
  stain.addColor(c, 'colorStainRim').name('rim + glow');
  stain.addColor(c, 'colorStainStar').name('stars');

  const souls = folder.addFolder('6 · Souls');
  R(souls, c, 'soulTime', 0.1, 4, 0.01, 'flight time (s)');
  R(souls, c, 'soulArc', 0, 6, 0.01, 'arc height (m)');
  R(souls, c, 'soulSway', 0, 3, 0.01, 'weave (m)');
  R(souls, c, 'soulSize', 0.02, 1, 0.005, 'head size');
  R(souls, c, 'soulTrailRate', 0, 400, 1, 'trail/second');
  R(souls, c, 'soulTrailSize', 0.01, 0.6, 0.005, 'trail size');
  R(souls, c, 'soulTrailLife', 0.05, 3, 0.01, 'trail lifetime');
  R(souls, c, 'soulGlow', 0, 10, 0.05, 'glow');
  R(souls, c, 'soulBurst', 0, 120, 1, 'burst motes');
  R(souls, c, 'handHeight', 0.2, 3, 0.01, 'hand height (m)');
  R(souls, c, 'soulLight', 0, 4, 0.01, 'light in the hand');
  Editor.gradient(souls, c, 'colorSoul', 'soul gradient');

  const reap = folder.addFolder('7 · The reaping');
  R(reap, c, 'sliceReach', 0, 3, 0.01, 'reach past the tip (m)');
  R(reap, c, 'sliceImpulse', 0, 20, 0.1, 'halves thrown (m/s)');
  R(reap, c, 'sliceLift', 0, 12, 0.05, 'lift (m/s)');
  R(reap, c, 'sliceSpin', 0, 5, 0.01, 'tumble');
  R(reap, c, 'hitSmoke', 0, 160, 1, 'smoke per body');
  R(reap, c, 'hitShake', 0, 1.5, 0.01, 'knock per body');
  R(reap, c, 'hitFlash', 0, 1, 0.01, 'flash per body');

  const end = folder.addFolder('8 · Dissolve');
  R(end, c, 'dissolveTime', 0.05, 3, 0.01, 'comes apart over (s)');
  R(end, c, 'dissolveDrift', 0, 10, 0.05, 'drifts on (m)');
  R(end, c, 'dissolveSpinDown', 0, 1, 0.01, 'slows by');
  R(end, c, 'dissolveSmoke', 0, 500, 1, 'smoke thrown');
  R(end, c, 'burstSize', 0, 14, 0.05, 'shell of night (m)');
  R(end, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(end, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(end, c, 'impactShake', 0, 1.5, 0.01, 'camera knock');
  R(end, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(end, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(end, c, 'impactLight', 0, 6, 0.01, 'light punch (× intensity)');
  R(end, c, 'travelRumble', 0, 1, 0.01, 'rumble in flight');
  R(end, c, 'castSmoke', 0, 200, 1, 'smoke where it forms');
  end.addColor(c, 'colorBurstA').name('shell inner');
  end.addColor(c, 'colorBurstB').name('shell mid');
  end.addColor(c, 'colorBurstC').name('shell outer');
  end.addColor(c, 'colorShockA').name('shockwave');
  end.addColor(c, 'colorShockB').name('shockwave hot');
  end.addColor(c, 'colorFlash').name('flash');

  folder.close();
  return folder;
}
