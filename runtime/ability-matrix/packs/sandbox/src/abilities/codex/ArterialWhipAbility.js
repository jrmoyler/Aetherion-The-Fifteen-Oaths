import { Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createVesselGeometry,
  createSplatterStripGeometry,
  createVesselQuadGeometry
} from '../../assets/codex/ArterialWhipGeometry.js';
import {
  createVesselMaterial,
  createSplatterMaterial,
  createWoundGlowMaterial,
  createRuptureWarpMaterial
} from '../../materials/codex/ArterialWhipMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'arterial';

const TAU = Math.PI * 2;
/** Bodies that can be bleeding off one cast at once. */
const MAX_BLED = 10;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _a = new Vector3();
const _floor = new Vector3();
const _home = new Vector3();
const _fullTip = new Vector3();
const _body = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * ARTERIAL WHIP — a living artery torn out of the caster's wrist and cracked
 * down the line like a bullwhip, overhead.
 *
 * A line cast in five beats. The caster's wrist **opens** — a ragged red bloom
 * at the hand — and a vessel pays out of it: a thick, beaded, tapering artery
 * of wet dark flesh, segment after segment pinched at the joints like a string
 * of vertebrae. It **unfurls** down the line in a high arc *over the caster's
 * head*, a vertical wave rolling along it, while the heart pumps peristaltic
 * pulses hand → tip — each one swells the beads it passes and glows through
 * their thin walls, and the joints spurt blood as it goes by. Then the **slam**:
 * the arch inverts, the whole vessel comes down flat onto the floor along the
 * line, hand first and the tip last, and the tip *ruptures* — a fan of blood
 * thrown forward, a red splash dome, a ring of bent air, a knock to the camera
 * — and the floor is painted with a smeared stroke and a flung spatter.
 * Everything along the line is slammed up off its feet; the tip launches what
 * it lands on. It **lies there** a moment, still pulsing and spurting, then
 * **reels back** into the wrist, bleeding away tip-first. The spatter **dries**
 * brown and erodes.
 *
 * Deliberately not Solar Lash: that is a horizontal sweep of additive plasma;
 * this is a vertical, opaque, lit, segmented vessel with blood in it, and the
 * crack is a slam into the floor.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the wound** — a ragged bloom at the hand that beats with the pulses.
 *   2. **the vessel** (`createVesselMaterial`) — parameter-space tube, beaded,
 *      pulsed, slammed flat by a floor clamp; lit wet flesh with blood glowing
 *      through.
 *   3. **the splatter** — the ground strip the slam paints.
 *   4. **the rupture** — WATER shell tinted blood, a SHOCKWAVE, a flat ring on
 *      the distortion layer, flash, shake, light punch.
 *   5. **blood** — droplets (spurts and the rupture fan), a hot spray, a red
 *      mist.
 *   6. **the slam** — `handlesOwnHits`: nothing is hit until the vessel comes
 *      down; then everything along it is thrown *up*, and the tip launches.
 *
 * ## The editor rule
 *
 * A cast captures a seed and three integrated phases (the wave, the pulse, the
 * spurt clock). Everything else is resolved from `settings.arterial` every
 * frame, so dragging the arch lifts a whip that is already overhead.
 */
export class ArterialWhipAbility extends Ability {
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
    this.vesselGeometry = createVesselGeometry(220, 14);
    this.stripGeometry = createSplatterStripGeometry(96, 4);
    this.quadGeometry = createVesselQuadGeometry();

    this.splatterMaterial = createSplatterMaterial();
    this.splatter = this._mesh(this.stripGeometry, this.splatterMaterial, LAYER.VFX, 2);

    this.vesselMaterial = createVesselMaterial();
    this.vessel = this._mesh(this.vesselGeometry, this.vesselMaterial, LAYER.VFX, 12);

    this.woundMaterial = createWoundGlowMaterial();
    this.wound = this._mesh(this.quadGeometry, this.woundMaterial, LAYER.VFX, 16);
    this.tipGlowMaterial = createWoundGlowMaterial();
    this.tipGlow = this._mesh(this.quadGeometry, this.tipGlowMaterial, LAYER.VFX, 17);

    this.warpMaterial = createRuptureWarpMaterial();
    this.warp = this._mesh(this.quadGeometry, this.warpMaterial, LAYER.DISTORTION, 0);

    this._shape = {
      hand: new Vector3(),
      tip: new Vector3(),
      side: new Vector3(1, 0, 0),
      slack: 1,
      wavePhase: 0,
      pulse: 0,
      seed: 0,
      dissolve: 0,
      flash: 0
    };
    this._splatState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      length: 1,
      reveal: 0,
      dry: 0,
      fadeT: 0,
      seed: 0
    };
    this._woundState = { center: new Vector3(), size: 0.4, intensity: 0, beat: 0, seed: 0 };
    this._tipGlowState = { center: new Vector3(), size: 0.6, intensity: 0, beat: 0, seed: 0 };
    this._warpState = { center: new Vector3(), progress: 0 };

    this._seed = 0;
    this._wave = 0;
    this._pulse = 0;
    this._reach = 0;
    this._slammed = false;
    /** Seconds since the crack began, in beat time. */
    this._tau = 0;

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

    this.drops = particles.get('arterial.drops', {
      capacity: 3000,
      shape: ParticleShape.DROPLET,
      additive: false,
      stretch: true,
      softFade: 0.2
    });
    this.drops.uniforms.uSizeIn.value = 0.03;
    this.drops.uniforms.uFadeIn.value = 0.02;
    this.drops.uniforms.uFadeOut.value = 0.3;
    this.drops.uniforms.uEndSize.value = 0.55;
    this.drops.uniforms.uDrag.value = 0.3;

    this.spray = particles.get('arterial.spray', {
      capacity: 1800,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.spray.uniforms.uSizeIn.value = 0.02;
    this.spray.uniforms.uFadeIn.value = 0.02;
    this.spray.uniforms.uFadeOut.value = 0.5;
    this.spray.uniforms.uEndSize.value = 0.3;
    this.spray.uniforms.uDrag.value = 1.1;

    this.mist = particles.get('arterial.mist', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.0
    });
    this.mist.uniforms.uSizeIn.value = 0.15;
    this.mist.uniforms.uFadeIn.value = 0.1;
    this.mist.uniforms.uFadeOut.value = 0.55;
    this.mist.uniforms.uEndSize.value = 2.2;
    this.mist.uniforms.uDrag.value = 1.5;

    this.spurtEmitter = new RateEmitter();
    this.dripEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The snap down, the moment it lies there, and the reel back. */
  get impactDuration() {
    const c = settings[ID];
    return Math.max(0.1, (Math.max(0.02, c.snapTime) + Math.max(0, c.holdTime) + Math.max(0.05, c.recoilTime)) * settings.global.lifetime);
  }

  /** The spatter drying. */
  get fadeDuration() {
    return Math.max(0.1, settings[ID].lifetime * settings.global.lifetime);
  }

  /** The light pulses with the blood, not with a flame. */
  lightShimmer() {
    const f = settings[ID].lightFlicker;
    const beat = Math.pow(0.5 + 0.5 * Math.sin(TAU * this._pulse), 8);
    return 1 - f * 0.5 + f * beat;
  }

  /* ------------------------------------------------------------------ */
  /* The centreline on the CPU                                           */
  /* ------------------------------------------------------------------ */

  /** CPU twin of `vesselPoint` in ArterialWhipMaterials — keep them together. */
  _vesselPoint(s, out) {
    const c = settings[ID];
    const g = settings.global;
    const st = this._shape;
    out.lerpVectors(st.hand, st.tip, s);
    const L = st.hand.distanceTo(st.tip);
    const env = smoothstep(0, 0.2, s) * (0.35 + 0.65 * s);
    const ph = (TAU * s * L) / Math.max(c.waveLength, 0.1) - st.wavePhase;
    const bow = Math.sin(Math.PI * s) * (1 - 0.35 * s);
    out.y += (c.arch * bow + c.waveAmp * g.noiseStrength * env * Math.sin(ph)) * st.slack;
    out.addScaledVector(st.side, c.sway * g.randomness * env * Math.cos(ph * 0.7) * Math.abs(st.slack));
    out.y = Math.max(out.y, Math.max(0.01, c.rootRadius * 0.8));
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

  _tipAt(reach, out) {
    const c = settings[ID];
    out.copy(this.origin).addScaledVector(this.direction, reach);
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
    this.spurtEmitter.reset();
    this.dripEmitter.reset();
    this._releaseBled();

    this._seed = Math.random() * 100;
    this._wave = Math.random() * TAU;
    this._pulse = 0;
    this._reach = 0;
    this._slammed = false;
    this._tau = 0;

    const st = this._shape;
    st.seed = this._seed;
    st.side.copy(this.side);
    st.slack = 1;
    st.dissolve = 0;
    st.flash = 0;

    const sp = this._splatState;
    sp.seed = this._seed;
    sp.reveal = 0;
    sp.dry = 0;
    sp.fadeT = 0;
    this._woundState.seed = this._seed;
    this._tipGlowState.seed = this._seed + 5;
    this._warpState.progress = 0;

    this.vessel.visible = true;
    this.wound.visible = true;
    this.splatter.visible = false;
    this.tipGlow.visible = false;
    this.warp.visible = false;

    /* the wrist opening: a burst of blood off the hand */
    this._hand(_pos);
    this._resetEmit(frame.uTime.value);
    _emit.position = _pos;
    _emit.radius = 0.1;
    _emit.direction = _up;
    _emit.spread = 1;
    _emit.speed = c.dropSpeed * 0.6;
    _emit.size = c.dropSize;
    _emit.life = c.dropLife * 0.8;
    this.drops.emit(Math.round(30 * g.particleCount), _emit);

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

  _advance(dt, waveMul) {
    const c = settings[ID];
    const g = settings.global;
    this._wave += c.waveSpeed * waveMul * dt * g.animationSpeed;
    this._pulse += c.pulseRate * dt * g.animationSpeed;
  }

  _syncAll() {
    const c = settings[ID];
    const g = settings.global;
    const st = this._shape;
    st.wavePhase = this._wave;
    st.pulse = this._pulse;
    this._hand(st.hand);
    this.vesselMaterial.userData.sync(st);

    const sp = this._splatState;
    const start = Math.max(0, c.handForward);
    sp.start.copy(this.origin).addScaledVector(this.direction, start).setY(0);
    sp.dir.copy(this.direction);
    sp.side.copy(this.side);
    sp.length = Math.max(0.2, this.length - start + 0.8);
    this.splatterMaterial.userData.sync(sp);

    const ws = this._woundState;
    ws.center.copy(st.hand);
    ws.beat = Math.pow(0.5 + 0.5 * Math.sin(TAU * this._pulse), 8);
    this.woundMaterial.userData.sync(ws);
    this.tipGlowMaterial.userData.sync(this._tipGlowState);

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

    this.spray.setGradient(getColor(c.colorSprayA), getColor(c.colorSprayB), getColor(c.colorSprayC), getColor(c.colorSprayD));
    const s = this.spray.uniforms;
    s.uGravity.value.set(0, -c.dropGravity * 0.6, 0);
    s.uStretch.value = c.sprayStretch;
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uGlow.value = c.sprayGlow * g.glow;
    s.uTurbulence.value = 0.2 * g.turbulence;

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
  /* Travel — the vessel pays out overhead                               */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    this._advance(dt, 1);
    this._reach = Math.max(c.handForward + 0.05, this.front);
    const st = this._shape;
    this._tipAt(this._reach, st.tip);
    // The arch builds as the vessel pays out — it cannot arch before it is long.
    st.slack = smoothstep(0, 4, this._reach - c.handForward) * 0.8 + 0.2;
    st.dissolve = 0;
    st.flash = 0;

    const ws = this._woundState;
    const open = saturate(this.age / Math.max(0.01, c.woundOpen));
    ws.size = c.woundSize * lerp(0.3, 1, Easing.outBack(open));
    ws.intensity = lerp(1.8, 1, open) * open;

    this._syncAll();
    this._spurts(dt, c.spurtRate, 0);
    this.ctx.shake.rumble(c.travelRumble, dt);
    this.position.copy(st.tip);
  }

  /** Blood spurting from the joints a pulse is passing, and off the tip. */
  _spurts(dt, rate, minS) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.spurtEmitter.tick(dt, rate) * g.particleCount);
    if (n <= 0) return;
    const st = this._shape;
    const L = st.hand.distanceTo(st.tip);
    if (L < 0.3) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.dropSize;
    _emit.life = c.dropLife;
    _emit.speed = c.dropSpeed * 0.45;
    _emit.spread = 0.6;
    for (let i = 0; i < n; i++) {
      // Spurt where a pulse is: walk the pulse train, pick one at random.
      const spacing = Math.max(0.1, c.pulseSpacing);
      const count = Math.max(1, Math.floor(L / spacing));
      const k = Math.floor(Math.random() * count);
      let d = (k + (this._pulse % 1)) * spacing;
      if (Math.random() < 0.25) d = L * (0.9 + 0.1 * Math.random()); // the tip sheds
      const s = Math.min(1, d / L);
      if (s < minS) continue;
      this._vesselPoint(s, _pos);
      _dir.copy(this.side).multiplyScalar(Math.random() < 0.5 ? 1 : -1).addScaledVector(_up, 0.8);
      _emit.position = _pos;
      _emit.direction = _dir;
      if (Math.random() < 0.75) this.drops.emit(1, _emit);
      else this.spray.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the slam                                                   */
  /* ------------------------------------------------------------------ */

  onImpact() {
    this._reach = this.length;
    this._tau = 0;
    this._slammed = false;
  }

  /** The moment the vessel hits the floor. */
  _slam() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._slammed = true;

    this._tipAt(this.length, _fullTip);
    _floor.copy(_fullTip).setY(0);

    this.splatter.visible = true;
    this.tipGlow.visible = true;
    this.warp.visible = true;
    this._warpState.center.copy(_floor).setY(0.1);
    this._warpState.progress = 0;
    const tg = this._tipGlowState;
    tg.center.copy(_floor).setY(0.35);
    tg.size = c.woundSize * 2.4;
    tg.intensity = 2.4;

    this.ctx.bursts.spawn(BurstMode.WATER, _floor, {
      radius: 0.2,
      endRadius: c.splashSize * power,
      life: 0.5,
      intensity: 1.1,
      opacity: 0.85,
      fresnel: 2.2,
      displace: 0.6,
      turbulence: 1.3,
      squash: 0.5,
      colorA: getColor(c.colorSplashA),
      colorB: getColor(c.colorSplashB),
      colorC: getColor(c.colorSplashC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.5,
      width: 0.07,
      intensity: 1.1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });

    /* the rupture fan: forward and up off the tip */
    this._resetEmit(time);
    _dir.copy(this.direction).addScaledVector(_up, 0.75).normalize();
    _emit.position = _floor;
    _emit.radius = 0.15;
    _emit.direction = _dir;
    _emit.speed = c.ruptureSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.75;
    _emit.size = c.dropSize * 1.3;
    _emit.life = c.dropLife * 1.2;
    this.drops.emit(Math.round(c.ruptureDrops * g.particleCount), _emit);
    _emit.speed = c.ruptureSpeed * 1.3;
    _emit.size = c.dropSize * 0.6;
    _emit.life = c.dropLife * 0.7;
    this.spray.emit(Math.round(c.ruptureDrops * 0.7 * g.particleCount), _emit);
    _emit.direction = _up;
    _emit.radius = 0.5;
    _emit.speed = c.mistLift * 1.5;
    _emit.spread = 1.3;
    _emit.size = c.mistSize * 1.3;
    _emit.life = c.mistLife;
    _emit.spin = 0.6;
    this.mist.emit(Math.round(16 * g.particleCount), _emit);

    /* the length of it striking the floor: droplets kicked up all along */
    this._resetEmit(time);
    _emit.speed = c.dropSpeed * 0.9;
    _emit.spread = 0.8;
    _emit.direction = _up;
    _emit.size = c.dropSize;
    _emit.life = c.dropLife * 0.8;
    const along = Math.round(c.slamDrops * g.particleCount);
    for (let i = 0; i < along; i++) {
      const f = c.handForward + Math.random() * (this.length - c.handForward);
      _pos.copy(this.origin).addScaledVector(this.direction, f).setY(0.05);
      _emit.position = _pos;
      this.drops.emit(1, _emit);
    }

    this._slamHits();
    this.ctx.shake.add(c.slamShake * power, 1 / Math.max(0.05, c.shakeDuration), 26);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.slamFlash * power);
    this.lightBoost = c.lightIntensity * c.slamLight * power;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const st = this._shape;

    if (t <= 1) {
      this._tau += dt / Math.max(0.05, g.lifetime);
      const tau = this._tau;
      const snap = Math.max(0.02, c.snapTime);
      const hold = Math.max(0, c.holdTime);
      this._tipAt(this.length, _fullTip);

      if (tau < snap) {
        /* the arch comes over and down — accelerating, like a real crack */
        this._advance(dt, 1.6);
        const k = tau / snap;
        st.slack = lerp(1, -c.slamDepth, Easing.inCubic(k));
        st.tip.copy(_fullTip);
        st.tip.y = lerp(c.tipHeight, 0.05, Easing.inCubic(k));
        st.flash = 0;
        st.dissolve = 0;
      } else {
        if (!this._slammed) this._slam();
        const after = tau - snap;
        const r = saturate((after - hold) / Math.max(0.05, c.recoilTime));
        this._advance(dt, r > 0 ? c.recoilWave : 0.2);
        st.flash = Math.exp(-after * 10);
        // Lies flat, then reels back into the wrist, lifting a little.
        st.slack = r > 0 ? -c.slamDepth * (1 - r) + c.recoilSlack * Math.sin(Math.PI * r) : -c.slamDepth;
        this._hand(_home).addScaledVector(this.direction, 0.2);
        _fullTip.y = 0.05;
        st.tip.lerpVectors(_fullTip, _home, Easing.inOutCubic(r));
        st.dissolve = smoothstep(0.35, 1, r);
        // The spatter is painted hand → tip as the vessel lands.
        this._splatState.reveal = (this.length + 0.8) * Easing.outCubic(saturate(after / Math.max(0.02, c.slamSweep)));
        // The rupture warp and glow.
        const rp = saturate(after / Math.max(0.02, c.ruptureTime));
        this._warpState.progress = Easing.outCubic(rp);
        this.warp.visible = rp < 1;
        this.warpMaterial.userData.sync(this._warpState);
        const tg = this._tipGlowState;
        tg.intensity = 2.4 * Math.exp(-after / Math.max(0.02, c.ruptureTime * 0.6));
        this.tipGlow.visible = tg.intensity > 0.01;
        // Spurting from the joints while it lies there.
        this._spurts(dt, c.lieSpurts * (1 - r), 0.05);
      }

      const ws = this._woundState;
      ws.size = c.woundSize;
      ws.intensity = 1 - smoothstep(0.6, 1, saturate((tau - snap - hold) / Math.max(0.05, c.recoilTime)));
      this._syncAll();
      this._updateBled(dt);
      this.position.copy(_fullTip);
      return;
    }

    /* the fade: the spatter dries */
    const ft = saturate(t - 1);
    this._advance(dt, 0);
    this.vessel.visible = false;
    this.wound.visible = false;
    this.tipGlow.visible = false;
    this.warp.visible = false;
    const sp = this._splatState;
    sp.reveal = this.length + 0.8;
    sp.dry = smoothstep(0, 0.6, ft);
    sp.fadeT = smoothstep(0.5, 1, ft);
    this._syncAll();
    this._drips(dt, 1 - ft);
    this._updateBled(dt);
    this.pointAt(0.5 + 0.5 * (1 - ft), this.position);
    this.position.y = 0.3;
  }

  /** A little mist off the drying spatter. */
  _drips(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const n = Math.round(this.dripEmitter.tick(dt, c.splatterMist * strength) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.size = c.mistSize;
    _emit.life = c.mistLife;
    _emit.speed = c.mistLift * 0.5;
    _emit.spread = 0.4;
    _emit.spin = 0.4;
    _emit.direction = _up;
    for (let i = 0; i < n; i++) {
      const f = c.handForward + Math.random() * (this.length - c.handForward);
      _pos.copy(this.origin).addScaledVector(this.direction, f).addScaledVector(this.side, (Math.random() * 2 - 1) * c.strokeWidth * 2);
      _pos.y = 0.1;
      _emit.position = _pos;
      this.mist.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Hits                                                                */
  /* ------------------------------------------------------------------ */

  /** The slam: everything along the vessel is thrown up; the tip launches. */
  _slamHits() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this.pointAt(0.5, _floor);
    const found = field.findTargets(_floor.x, _floor.z, this.length * 0.5 + c.tipZone + c.hitWidth, this._found);
    const tipStart = this.length - Math.max(0, c.tipZone);
    for (const dummy of found) {
      const dx = dummy.position.x - this.origin.x;
      const dz = dummy.position.z - this.origin.z;
      const along = dx * this.direction.x + dz * this.direction.z;
      const lat = dx * this.side.x + dz * this.side.z;
      if (along < 0.3 || along > this.length + c.tipZone * 0.5) continue;
      const atTip = along >= tipStart;
      if (Math.abs(lat) > c.hitWidth * (atTip ? 1.6 : 1)) continue;
      if (atTip) {
        this._force.impulse = c.tipImpulse * power;
        this._force.lift = c.tipLift * power;
        this._force.spin = c.hitSpin * 1.5;
        _dir.copy(this.direction).addScaledVector(this.side, Math.sign(lat) * 0.3).normalize();
      } else {
        // Slammed up and shoved off the line, away from where it struck.
        this._force.impulse = c.hitImpulse * power;
        this._force.lift = c.hitLift * power;
        this._force.spin = c.hitSpin;
        _dir.copy(this.side).multiplyScalar(lat >= 0 ? 1 : -1).addScaledVector(this.direction, 0.25).normalize();
      }
      if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      this._bleed(dummy, _dir, atTip ? 1.2 : 0.8);
    }
  }

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
    _pos.copy(dummy.position).setY(1.0);
    _a.copy(dir).addScaledVector(_up, 0.8).normalize();
    _emit.position = _pos;
    _emit.radius = 0.25;
    _emit.direction = _a;
    _emit.speed = c.dropSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.6;
    _emit.size = c.dropSize;
    _emit.life = c.dropLife;
    this.drops.emit(Math.round(28 * scale * g.particleCount), _emit);
    this.spray.emit(Math.round(16 * scale * g.particleCount), _emit);
  }

  _updateBled(dt) {
    const c = settings[ID];
    const g = settings.global;
    const look = this._look;
    look.color = c.colorWoundedBody;
    look.rimColor = c.colorWoundedRim;
    look.rimEmissive = c.woundedRimGlow;
    look.edgeColor = c.colorWoundedRim;
    look.edgeEmissive = c.woundedRimGlow;
    look.edgeWidth = 0.05;
    const time = frame.uTime.value;
    for (let i = 0; i < this._bledCount; i++) {
      const slot = this._bled[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) continue;
      slot.time += dt;
      dummy.corrode(saturate(slot.time / 0.4) * c.wounded, look);
      const left = 1 - saturate(slot.time / Math.max(0.05, c.bleedTime));
      const n = Math.round(slot.emitter.tick(dt, c.bleedDrops * left) * g.particleCount);
      if (n <= 0) continue;
      const at = dummy.bodyPoint(_body) ?? _body.copy(dummy.position).setY(0.9);
      this._resetEmit(time);
      _emit.position = at;
      _emit.radius = 0.3;
      _emit.direction = _up;
      _emit.speed = 0.8;
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
    this.vessel.visible = false;
    this.splatter.visible = false;
    this.wound.visible = false;
    this.tipGlow.visible = false;
    this.warp.visible = false;
    this._releaseBled();
  }

  dispose() {
    this.vesselGeometry.dispose();
    this.stripGeometry.dispose();
    this.quadGeometry.dispose();
    this.vesselMaterial.dispose();
    this.splatterMaterial.dispose();
    this.woundMaterial.dispose();
    this.tipGlowMaterial.dispose();
    this.warpMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('〰  Arterial Whip');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'pays out at (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'spatter dries over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'pulse');

  const wound = folder.addFolder('1 · The wound');
  R(wound, c, 'handForward', -1, 2, 0.01, 'forward (m)');
  R(wound, c, 'handSide', -1, 1, 0.01, 'to the right (m)');
  R(wound, c, 'handHeight', 0.2, 3, 0.01, 'height (m)');
  R(wound, c, 'woundSize', 0.05, 3, 0.01, 'bloom radius (m)');
  R(wound, c, 'woundGlow', 0, 10, 0.05, 'bloom glow');
  R(wound, c, 'woundOpen', 0.01, 1, 0.005, 'opens over (s)');
  wound.addColor(c, 'colorWoundCore').name('core');
  wound.addColor(c, 'colorWoundHalo').name('halo');

  const shape = folder.addFolder('2 · Vessel shape');
  R(shape, c, 'rootRadius', 0.01, 0.5, 0.001, 'radius at the wrist (m)');
  R(shape, c, 'tipRadius', 0.003, 0.3, 0.001, 'radius at the tip (m)');
  R(shape, c, 'taper', 0.1, 5, 0.01, 'taper');
  R(shape, c, 'segmentLength', 0.03, 1.5, 0.005, 'segment length (m)');
  R(shape, c, 'pinch', 0, 0.9, 0.01, 'joint pinch');
  R(shape, c, 'tipHeight', 0, 3, 0.01, 'tip height in flight (m)');
  R(shape, c, 'arch', -1, 6, 0.01, 'overhead arch (m)');
  R(shape, c, 'waveAmp', 0, 2, 0.01, 'wave (m)');
  R(shape, c, 'waveLength', 0.3, 12, 0.05, 'wavelength (m)');
  R(shape, c, 'waveSpeed', 0, 40, 0.1, 'wave speed (rad/s)');
  R(shape, c, 'sway', 0, 1.5, 0.01, 'sideways sway (m)');

  const pulse = folder.addFolder('3 · Pulse & flesh');
  R(pulse, c, 'pulseRate', 0, 8, 0.05, 'pulses/second');
  R(pulse, c, 'pulseSpacing', 0.3, 8, 0.05, 'pulse spacing (m)');
  R(pulse, c, 'pulseSwell', 0, 1.5, 0.01, 'swell');
  R(pulse, c, 'pulseGlow', 0, 10, 0.05, 'glow through the wall');
  R(pulse, c, 'wallGlow', 0, 3, 0.01, 'resting glow');
  R(pulse, c, 'capillaryScale', 0.2, 10, 0.05, 'capillary scale');
  R(pulse, c, 'capillaries', 0, 2, 0.01, 'capillaries');
  R(pulse, c, 'wetness', 0, 4, 0.01, 'wet specular');
  R(pulse, c, 'rimGlow', 0, 4, 0.01, 'rim');
  R(pulse, c, 'dissolveEdge', 0.005, 0.4, 0.005, 'bleed-away edge');
  pulse.addColor(c, 'colorVesselDeep').name('deep');
  pulse.addColor(c, 'colorVesselBody').name('body');
  pulse.addColor(c, 'colorVesselHot').name('blood glow');
  pulse.addColor(c, 'colorVesselRim').name('rim');
  pulse.addColor(c, 'colorCapillary').name('capillaries');

  const slam = folder.addFolder('4 · The slam');
  R(slam, c, 'snapTime', 0.02, 1, 0.005, 'comes down over (s)');
  R(slam, c, 'slamDepth', 0, 2, 0.01, 'slam overshoot');
  R(slam, c, 'slamSweep', 0.02, 1, 0.005, 'lands hand → tip over (s)');
  R(slam, c, 'holdTime', 0, 2, 0.01, 'lies there (s)');
  R(slam, c, 'recoilTime', 0.05, 2, 0.01, 'reels back over (s)');
  R(slam, c, 'recoilSlack', 0, 3, 0.01, 'lift as it reels');
  R(slam, c, 'recoilWave', 0, 5, 0.01, 'wave on the way back (×)');
  R(slam, c, 'travelRumble', 0, 1, 0.01, 'rumble while paying out');
  R(slam, c, 'slamShake', 0, 1.5, 0.01, 'camera knock');
  R(slam, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(slam, c, 'slamFlash', 0, 1, 0.01, 'flash');
  R(slam, c, 'slamLight', 0, 8, 0.01, 'light punch (× intensity)');
  slam.addColor(c, 'colorFlash').name('flash');

  const rupture = folder.addFolder('5 · Rupture');
  R(rupture, c, 'ruptureDrops', 0, 600, 1, 'fan of drops');
  R(rupture, c, 'ruptureSpeed', 0, 30, 0.1, 'fan speed');
  R(rupture, c, 'ruptureSize', 0.2, 10, 0.05, 'warp ring (m)');
  R(rupture, c, 'ruptureTime', 0.02, 2, 0.01, 'ring opens over (s)');
  R(rupture, c, 'ruptureWarp', 0, 4, 0.01, 'warp strength');
  R(rupture, c, 'splashSize', 0, 8, 0.05, 'splash dome (m)');
  R(rupture, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  rupture.addColor(c, 'colorSplashA').name('splash inner');
  rupture.addColor(c, 'colorSplashB').name('splash mid');
  rupture.addColor(c, 'colorSplashC').name('splash outer');
  rupture.addColor(c, 'colorShockA').name('shockwave');
  rupture.addColor(c, 'colorShockB').name('shockwave hot');

  const splat = folder.addFolder('6 · Splatter');
  R(splat, c, 'strokeWidth', 0.02, 1.5, 0.005, 'smear half-width (m)');
  R(splat, c, 'spatterSpread', 0.1, 5, 0.01, 'spatter reach (m)');
  R(splat, c, 'spatterScale', 0.03, 1.5, 0.005, 'spatter cell (m)');
  R(splat, c, 'spatterDensity', 0, 1, 0.01, 'density');
  R(splat, c, 'spatterFling', 0, 6, 0.01, 'flung stretch');
  R(splat, c, 'splatterGloss', 0, 3, 0.01, 'wet glint');
  R(splat, c, 'splatterSheen', 0, 3, 0.01, 'fresh sheen');
  R(splat, c, 'splatterOpacity', 0, 1, 0.01, 'opacity');
  R(splat, c, 'splatterMist', 0, 100, 1, 'mist/second off it');
  splat.addColor(c, 'colorSplatterFresh').name('fresh');
  splat.addColor(c, 'colorSplatterDark').name('dark');
  splat.addColor(c, 'colorSplatterDry').name('dried');

  const blood = folder.addFolder('7 · Blood');
  R(blood, c, 'spurtRate', 0, 600, 1, 'spurts/second paying out');
  R(blood, c, 'lieSpurts', 0, 600, 1, 'spurts/second lying');
  R(blood, c, 'slamDrops', 0, 500, 1, 'drops kicked up by the slam');
  R(blood, c, 'dropSize', 0.005, 0.4, 0.001, 'drop size');
  R(blood, c, 'dropSpeed', 0, 20, 0.05, 'drop speed');
  R(blood, c, 'dropLife', 0.1, 4, 0.05, 'drop lifetime');
  R(blood, c, 'dropGravity', 0, 30, 0.1, 'drop gravity');
  R(blood, c, 'dropStretch', 0, 1, 0.005, 'drop stretch');
  R(blood, c, 'dropGlow', 0, 4, 0.05, 'drop glow');
  R(blood, c, 'sprayStretch', 0, 1, 0.005, 'spray stretch');
  R(blood, c, 'sprayGlow', 0, 8, 0.05, 'spray glow');
  R(blood, c, 'mistSize', 0.05, 4, 0.01, 'mist size');
  R(blood, c, 'mistLift', 0, 5, 0.01, 'mist rise');
  R(blood, c, 'mistLife', 0.1, 6, 0.05, 'mist lifetime');
  R(blood, c, 'mistOpacity', 0, 1, 0.01, 'mist opacity');
  Editor.gradient(blood, c, 'colorDrop', 'drop gradient');
  Editor.gradient(blood, c, 'colorSpray', 'spray gradient');
  Editor.gradient(blood, c, 'colorMist', 'mist gradient');

  const hits = folder.addFolder('8 · Hits');
  R(hits, c, 'hitWidth', 0.1, 4, 0.01, 'reach either side (m)');
  R(hits, c, 'hitImpulse', 0, 25, 0.1, 'shoved off the line (m/s)');
  R(hits, c, 'hitLift', 0, 20, 0.05, 'slammed up (m/s)');
  R(hits, c, 'hitSpin', 0, 6, 0.01, 'tumble');
  R(hits, c, 'tipZone', 0, 8, 0.05, 'tip zone (m)');
  R(hits, c, 'tipImpulse', 0, 40, 0.1, 'tip launch (m/s)');
  R(hits, c, 'tipLift', 0, 25, 0.05, 'tip lift (m/s)');
  R(hits, c, 'wounded', 0, 1, 0.01, 'wound stain');
  R(hits, c, 'bleedTime', 0.05, 6, 0.05, 'bleeds for (s)');
  R(hits, c, 'bleedDrops', 0, 200, 1, 'drips/second off a body');
  R(hits, c, 'woundedRimGlow', 0, 8, 0.05, 'wound rim glow');
  hits.addColor(c, 'colorWoundedBody').name('wounded body');
  hits.addColor(c, 'colorWoundedRim').name('wounded rim');

  folder.close();
  return folder;
}
