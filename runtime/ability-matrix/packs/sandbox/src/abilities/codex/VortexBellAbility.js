import { CylinderGeometry, Mesh, PlaneGeometry, TorusGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createBellMaterial,
  createBellLensMaterial,
  createVortexMaterial,
  createVortexLensMaterial,
  createBellFloorMaterial
} from '../../materials/codex/VortexBellMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing } from '../../utils/math.js';

export const ID = 'vortexbell';

/** Bodies one cast remembers having swept, so the ring does not hit twice. */
const MAX_SWEPT = 24;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _up = new Vector3(0, 1, 0);

/** Push one particle system's gradient and the globals through. */
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
 * VORTEX BELL — Wind, zone cast.
 *
 * A little **handbell** of air flies spinning from the caster to the circle,
 * shedding wind lines. Over the circle it becomes the real thing: a great
 * **bell of streaming air** — flared lip, waist, domed crown, nine metres
 * across and nearly five tall — forms five metres up and **drops** onto the
 * circle, spiral streaks pouring down its surface, the camera rumbling as it
 * falls. It lands with a **strike**: a flash, a jolt, a brass glint that runs
 * from the crown down to the lip, pressure rings thrown off the lip, a
 * shockwave. The bell **rings** — its lip squeezes into an oval that swaps
 * axes, the classic (2,0) mode of a real bell, dying away — and the floor
 * under it shows the print of that mode: standing pressure rings and the four
 * nodal diameters glowing.
 *
 * A beat after the strike the air trapped under it bursts out as a **vortex
 * ring**: a fat rolling torus of air that leaves the rim and rolls outward
 * across the floor to twice the bell's radius, its bands turning round the
 * tube, dust boiling up under it, **sweeping every body it reaches outward**.
 * The bell rings on, fainter; then it **lifts** off the floor and dissolves
 * upward from the lip, and the print erodes.
 *
 * It is not Downburst (a cloud and a falling column with a dust torus) nor
 * Tempest (a funnel): the silhouette is a *bell* — a hollow dome on a flared
 * lip — and the vortex is a clean, glowing ring of rolling air.
 *
 * ## Layers
 *
 *   1. **the bell** (`createBellMaterial`) — an analytic bell profile built in
 *      the vertex stage, ringing; streaming-air shell, brass strike band.
 *   2. **the bell lens** (`createBellLensMaterial`) — `LAYER.DISTORTION`.
 *   3. **the vortex ring** (`createVortexMaterial`) — a torus from its own
 *      parameters, rolling — and its lens (`createVortexLensMaterial`).
 *   4. **the bell print** (`createBellFloorMaterial`).
 *   5. **particles** — STREAK wind lines spiralling down the bell and off the
 *      handbell, SMOKE dust boiling up under the vortex, RING pressure rings
 *      off the lip on the strike.
 *   6. **the beat** — rumble on the drop; on the strike an AIR shell, a
 *      SHOCKWAVE, a DUSTRING, a flash, a jolt, a light punch.
 *
 * ## The bodies
 *
 * `handlesOwnHits`. The moment the vortex leaves the rim, everything under
 * the bell is blown out; from then on, every body the rolling ring reaches
 * (within `hitBand` of its tube) is swept outward and up — once each.
 *
 * ## The editor rule
 *
 * The cast captures a seed, the mode's axis, and three integrated phases
 * (the pour, the roll, the ringing). Everything else — the bell's profile,
 * its size, timing, the ring's reach and tube — is resolved from
 * `settings.vortexbell` every frame.
 */
export class VortexBellAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The vortex decides whom it sweeps. */
  get handlesOwnHits() {
    return true;
  }

  /** Bodies swept. HUD readout only. */
  get instanceCount() {
    return this._swept.length;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    // An open cylinder grid the vertex stage turns into a bell (y −0.5..0.5).
    this.bellGeometry = new CylinderGeometry(1, 1, 1, 72, 40, true);
    this.torusGeometry = new TorusGeometry(1, 0.2, 20, 120);
    this.floorGeometry = new PlaneGeometry(2, 2, 1, 1);

    this.floorMaterial = createBellFloorMaterial();
    this.floor = this._mesh(this.floorGeometry, this.floorMaterial, LAYER.VFX, 2);

    this.bellMaterial = createBellMaterial();
    this.bell = this._mesh(this.bellGeometry, this.bellMaterial, LAYER.VFX, 12);
    this.bellLensMaterial = createBellLensMaterial();
    this.bellLens = this._mesh(this.bellGeometry, this.bellLensMaterial, LAYER.DISTORTION, 0);

    // The handbell is the same shader, small, on its own mesh.
    this.seedMaterial = createBellMaterial();
    this.seed = this._mesh(this.bellGeometry, this.seedMaterial, LAYER.VFX, 12);

    this.vortexMaterial = createVortexMaterial();
    this.vortex = this._mesh(this.torusGeometry, this.vortexMaterial, LAYER.VFX, 13);
    this.vortexLensMaterial = createVortexLensMaterial();
    this.vortexLens = this._mesh(this.torusGeometry, this.vortexLensMaterial, LAYER.DISTORTION, 0);

    /** Scratch state handed to the materials — reused. */
    this._bellState = {
      center: new Vector3(),
      radius: 4,
      height: 4.5,
      mode: 0,
      modeAng: 0,
      hum: 0,
      flow: 0,
      band: -1,
      strike: 0,
      dissolve: 0,
      fade: 1,
      seed: 0
    };
    this._seedState = {
      center: new Vector3(),
      radius: 0.3,
      height: 0.4,
      mode: 0,
      modeAng: 0,
      hum: 0,
      flow: 0,
      band: -1,
      strike: 0,
      dissolve: 0,
      fade: 1,
      seed: 0
    };
    this._vortexState = { center: new Vector3(), major: 4, tube: 0.4, roll: 0, fade: 0, seed: 0 };
    this._floorState = { centre: new Vector3(), radius: 4, phase: 0, press: 0, strike: 0, modeAng: 0, erode: 0, seed: 0 };

    this._clock = -1;
    this._seed = 0;
    this._flow = 0;
    this._roll = 0;
    this._ring = 0;
    this._modeAng = 0;
    this._struck = false;
    this._thrown = false;
    this._vortexR = 0;

    this._found = [];
    this._swept = [];
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

    this.streaks = particles.get('vortexbell.streak', {
      capacity: 1800,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.streaks.uniforms.uDrag.value = 1.2;
    this.streaks.uniforms.uEndSize.value = 0.4;
    this.streaks.uniforms.uSizeIn.value = 0.05;
    this.streaks.uniforms.uFadeIn.value = 0.1;
    this.streaks.uniforms.uFadeOut.value = 0.5;

    this.dust = particles.get('vortexbell.dust', {
      capacity: 2000,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.7
    });
    this.dust.uniforms.uDrag.value = 1.8;
    this.dust.uniforms.uEndSize.value = 2.2;
    this.dust.uniforms.uSizeIn.value = 0.15;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.6;

    this.rings = particles.get('vortexbell.ring', {
      capacity: 300,
      shape: ParticleShape.RING,
      additive: true,
      softFade: 0.2
    });
    this.rings.uniforms.uDrag.value = 2.5;
    this.rings.uniforms.uEndSize.value = 2.5;
    this.rings.uniforms.uSizeIn.value = 0.02;
    this.rings.uniforms.uFadeIn.value = 0.03;
    this.rings.uniforms.uFadeOut.value = 0.7;

    this.streakEmitter = new RateEmitter();
    this.dustEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every second resolved from settings                        */
  /* ------------------------------------------------------------------ */

  _dropT() {
    return Math.max(0.03, settings[ID].dropTime * settings.global.lifetime);
  }

  _throwAt() {
    return this._dropT() + Math.max(0, settings[ID].throwDelay) * settings.global.lifetime;
  }

  _vortexT() {
    return Math.max(0.1, settings[ID].vortexTime * settings.global.lifetime);
  }

  get impactDuration() {
    const c = settings[ID];
    const g = settings.global;
    return this._dropT() + Math.max(Math.max(0.05, c.holdTime) * g.lifetime, this._throwAt() - this._dropT() + this._vortexT());
  }

  get fadeDuration() {
    const c = settings[ID];
    return Math.max(0.1, (Math.max(0.05, c.lifetime) + Math.max(0.05, c.groundFade)) * settings.global.lifetime);
  }

  /** The light trembles with the ringing. */
  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * 0.5 + f * 0.5 * Math.sin(this._ring * 2) * Math.min(1, this._ringAmp() * 8 + 0.3);
  }

  /** Current ringing envelope (0 before the strike). */
  _ringAmp() {
    const c = settings[ID];
    if (!this._struck) return 0;
    const since = Math.max(0, this._clock - this._dropT());
    return Math.exp(-since * Math.max(0, c.modeDecay));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._clock = -1;
    this._seed = Math.random() * 10;
    this._flow = 0;
    this._roll = 0;
    this._ring = 0;
    this._modeAng = Math.random() * Math.PI;
    this._struck = false;
    this._thrown = false;
    this._vortexR = 0;
    this._swept.length = 0;
    this.streakEmitter.reset();
    this.dustEmitter.reset();
    this.bell.visible = false;
    this.bellLens.visible = false;
    this.seed.visible = false;
    this.vortex.visible = false;
    this.vortexLens.visible = false;
    this.floor.visible = false;
  }

  _syncParticles() {
    const c = settings[ID];
    const g = settings.global;
    syncSystem(this.streaks, c.colorStreakA, c.colorStreakB, c.colorStreakC, c.colorStreakD, c.streakSize, 2 * g.glow, 0.15);
    this.streaks.uniforms.uStretch.value = c.streakStretch;
    this.streaks.uniforms.uGravity.value.set(0, -1, 0);
    syncSystem(this.dust, c.colorDustA, c.colorDustB, c.colorDustC, c.colorDustD, c.dustSize, 1, 0.6);
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    this.dust.uniforms.uGravity.value.set(0, 0.4, 0);
    syncSystem(this.rings, c.colorRingA, c.colorRingB, c.colorRingC, c.colorRingD, c.ringSize, 2 * g.glow, 0);
    this.rings.uniforms.uGravity.value.set(0, 0, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _updateBell(dt) {
    const c = settings[ID];
    const g = settings.global;
    const clock = this._clock;
    const fading = this.phase === AbilityPhase.FADE;
    const ft = fading ? this.fadeTime : 0;
    const R = Math.max(0.5, c.zoneRadius) * c.bellRadius;
    const dropT = this._dropT();
    this._flow += dt * c.flowSpeed * g.noiseSpeed;
    this._roll += dt * c.rollSpeed * g.noiseSpeed;
    this._ring += dt * c.modeRate * g.animationSpeed;
    this.pointAt(1, _centre);

    /* --- the drop and the lift --- */
    const k = saturate(clock / dropT);
    let y = (1 - Easing.inCubic(k)) * c.dropHeight;
    let dissolve = 0;
    let fade = Easing.outQuad(saturate(clock / (dropT * 0.6)));
    if (fading) {
      const lt = Math.max(0.05, c.lifetime) * g.lifetime;
      const u = saturate(ft / lt);
      y = Easing.inQuad(u) * c.liftHeight;
      dissolve = u;
    }

    if (k >= 1 && !this._struck) {
      this._struck = true;
      this._strike(c, g, R);
    }
    if (!this._thrown && clock >= this._throwAt()) {
      this._thrown = true;
      this._throw(c, g, R);
    }

    const amp = this._ringAmp();
    const bs = this._bellState;
    bs.center.set(_centre.x, y, _centre.z);
    bs.radius = R;
    bs.height = Math.max(0.3, c.bellHeight);
    bs.mode = c.modeAmp * amp * Math.sin(this._ring);
    bs.modeAng = this._modeAng;
    bs.hum = this._struck ? c.humAmp * (0.4 + amp) * Math.sin(this._ring * 3.1) : 0;
    bs.flow = this._flow;
    const since = clock - dropT;
    bs.band = this._struck && since < 1.2 / Math.max(0.1, c.bandSpeed) ? 1 - since * c.bandSpeed : -1;
    bs.strike = this._struck ? Math.exp(-since * 6) : 0;
    bs.dissolve = dissolve;
    bs.fade = fade;
    bs.seed = this._seed;
    this.bellMaterial.userData.sync(bs);
    this.bellLensMaterial.userData.sync(bs);
    this.bell.visible = dissolve < 1;
    this.bellLens.visible = this.bell.visible;

    /* --- the vortex ring --- */
    const vs = this._vortexState;
    if (this._thrown) {
      const vk = saturate((clock - this._throwAt()) / this._vortexT());
      const ek = Easing.outCubic(vk);
      this._vortexR = R + (Math.max(R, c.vortexReach * g.explosionIntensity) - R) * ek;
      const tube = c.vortexTube * (1 + (c.vortexGrow - 1) * ek);
      vs.center.set(_centre.x, c.vortexRise + tube * 0.4 * ek, _centre.z);
      vs.major = this._vortexR;
      vs.tube = tube;
      vs.roll = this._roll;
      // In fast, thinning out over its last third.
      vs.fade = saturate(vk * 8) * (1 - Easing.inQuad(saturate((vk - 0.6) / 0.4)));
      vs.seed = this._seed;
      this.vortexMaterial.userData.sync(vs);
      this.vortexLensMaterial.userData.sync(vs);
      this.vortex.visible = vs.fade > 0.01;
      this.vortexLens.visible = this.vortex.visible;
      if (vs.fade > 0.01) {
        this._sweep(c, g, tube);
        if (dt > 0) this._dustFx(dt, c, g, vs.fade, tube);
      }
    } else {
      this.vortex.visible = false;
      this.vortexLens.visible = false;
    }

    /* --- the print --- */
    let erode = 0;
    if (fading) {
      const fd = this.fadeDuration;
      const gf = Math.max(0.05, c.groundFade * g.lifetime);
      erode = saturate((ft - (fd - gf)) / gf);
    }
    const fs = this._floorState;
    fs.centre.copy(_centre);
    fs.radius = R;
    fs.phase = this._ring * 0.15;
    fs.press = Math.max(0, 1 - y / Math.max(0.1, c.dropHeight)) * (fading ? 1 - erode : 1) * (0.5 + 0.5 * Math.min(1, amp * 2 + 0.4));
    fs.strike = bs.strike;
    fs.modeAng = this._modeAng;
    fs.erode = erode;
    fs.seed = this._seed;
    this.floorMaterial.userData.sync(fs);
    this.floor.visible = erode < 1 && fs.press > 0.01;

    /* --- wind lines spiralling down the bell --- */
    if (dt > 0 && dissolve < 1) this._streakFx(dt, c, g, R, y, fade * (1 - dissolve));
    if (!this._struck && dt > 0) this.ctx.shake.rumble(c.dropShake * g.cameraShake * k, dt);
  }

  /* ------------------------------------------------------------------ */
  /* The bodies                                                          */
  /* ------------------------------------------------------------------ */

  _sweep(c, g, tube) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const band = tube + Math.max(0.05, c.hitBand);
    const found = field.findTargets(_centre.x, _centre.z, this._vortexR + band, this._found);
    for (let f = 0; f < found.length; f++) {
      const dummy = found[f];
      if (this._wasSwept(dummy)) continue;
      _dir.set(dummy.position.x - _centre.x, 0, dummy.position.z - _centre.z);
      const d = _dir.length();
      if (Math.abs(d - this._vortexR) > band) continue;
      this._blow(dummy, d, c, g);
    }
    this._found.length = 0;
  }

  _blow(dummy, d, c, g) {
    if (d < 1e-3) _dir.copy(this.direction);
    _dir.normalize();
    this._force.impulse = c.hitImpulse * g.explosionIntensity;
    this._force.lift = c.hitLift * g.explosionIntensity;
    this._force.spin = c.hitSpin;
    dummy.kill(_dir.x, _dir.z, this._force);
    if (this._swept.length < MAX_SWEPT) this._swept.push(dummy);
  }

  _wasSwept(dummy) {
    for (let i = 0; i < this._swept.length; i++) if (this._swept[i] === dummy) return true;
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  _fillEmit(position, radius, direction, speed, spread, size, life, spin) {
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = speed;
    _emit.speedVariance = 0.4;
    _emit.spread = spread;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = size;
    _emit.sizeVariance = 0.5;
    _emit.life = life;
    _emit.lifeVariance = 0.35;
    _emit.spin = spin;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
  }

  /** The strike: flash, jolt, shell, rings off the lip, the shockwave. */
  _strike(c, g, R) {
    const power = g.explosionIntensity;
    this.ctx.shake.add(c.strikeShake * power, 3.2, 16);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.strikeFlash * power);
    this.lightBoost = c.impactLight * power;
    this.ctx.bursts.spawn(BurstMode.AIR, _pos.copy(_centre).setY(1.2), {
      radius: 0.5,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1.4,
      opacity: 0.7 * g.opacity,
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
    // Pressure rings off the lip, all the way round.
    const n = Math.round(c.strikeRings * g.particleCount);
    this._fillEmit(_pos, 0, _up, 0.01, 0, 0.3, c.ringLife, 0);
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, n)) * TAU + this._seed;
      _pos.set(_centre.x + Math.cos(a) * R, 0.4, _centre.z + Math.sin(a) * R);
      _emit.position = _pos;
      this.rings.emit(1, _emit);
    }
  }

  /** The vortex leaves the rim: everything under the bell is blown out. */
  _throw(c, g, R) {
    const field = this.ctx.dummies;
    this.ctx.shake.add(c.strikeShake * 0.4 * g.explosionIntensity, 5, 22);
    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: c.vortexReach * 0.8,
      life: 1.4,
      intensity: 0.9,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustC),
      growth: 0.6,
      height: 0.025
    });
    if (!field?.findTargets) return;
    const found = field.findTargets(_centre.x, _centre.z, R, this._found);
    for (let f = 0; f < found.length; f++) {
      const dummy = found[f];
      _dir.set(dummy.position.x - _centre.x, 0, dummy.position.z - _centre.z);
      this._blow(dummy, _dir.length(), c, g);
    }
    this._found.length = 0;
  }

  /** Dust boiling up under the rolling ring. */
  _dustFx(dt, c, g, strength, tube) {
    const count = Math.round(this.dustEmitter.tick(dt, c.dustRate * strength) * g.particleCount);
    if (count <= 0) return;
    this._fillEmit(_pos, 0.3, _dir, 2.5, 0.3, 0.5, c.dustLife, 0.5);
    for (let k = 0; k < count; k++) {
      const a = Math.random() * TAU;
      _pos.set(_centre.x + Math.cos(a) * this._vortexR, 0.15 + Math.random() * tube * 0.5, _centre.z + Math.sin(a) * this._vortexR);
      _dir.set(Math.cos(a), 0.9, Math.sin(a));
      _emit.position = _pos;
      _emit.direction = _dir;
      this.dust.emit(1, _emit);
    }
  }

  /** Wind lines spiralling down the bell's wall. */
  _streakFx(dt, c, g, R, y, strength) {
    const count = Math.round(this.streakEmitter.tick(dt, c.streakRate * strength) * g.particleCount);
    if (count <= 0) return;
    const H = Math.max(0.3, c.bellHeight);
    this._fillEmit(_pos, 0.05, _dir, 4, 0.05, 0.05, c.streakLife, 0);
    for (let k = 0; k < count; k++) {
      const a = Math.random() * TAU;
      const h = 0.15 + Math.random() * 0.65;
      // Roughly on the bell's wall at that height (waist ↔ lip).
      const r = R * (c.bellWaist + (1 - c.bellWaist) * Math.pow(1 - h / Math.max(0.05, c.crownStart), c.bellFlare)) * 1.04;
      _pos.set(_centre.x + Math.cos(a) * r, y + h * H, _centre.z + Math.sin(a) * r);
      // Down and round — the spiral the streaks on the shell follow.
      _dir.set(-Math.sin(a), -1.2, Math.cos(a));
      _emit.position = _pos;
      _emit.direction = _dir;
      this.streaks.emit(1, _emit);
    }
  }

  /** The handbell: small, spinning, at flight height, shedding wind lines. */
  _updateSeed(dt) {
    const c = settings[ID];
    const g = settings.global;
    const ss = this._seedState;
    const born = Easing.outBack(saturate(this.age / 0.15));
    ss.center.copy(this.position).setY(c.seedHeight - c.seedScale * 0.6);
    ss.radius = Math.max(0.05, c.seedScale * born);
    ss.height = ss.radius * 1.3;
    ss.mode = 0.15 * Math.sin(this.age * 20);
    ss.modeAng = this.age * c.seedSpin;
    ss.hum = 0;
    ss.flow = this._flow;
    ss.band = -1;
    ss.strike = 0.4;
    ss.dissolve = 0;
    ss.fade = 1;
    ss.seed = this._seed;
    this.seedMaterial.userData.sync(ss);
    this.seed.visible = true;
    this._flow += dt * c.flowSpeed * 3;

    const count = Math.round(this.streakEmitter.tick(dt, c.travelStreaks) * g.particleCount);
    if (count > 0) {
      this._fillEmit(_pos.copy(ss.center), c.seedScale, _dir, 3, 0.3, 0.05, c.streakLife * 0.7, 0);
      for (let k = 0; k < count; k++) {
        const a = Math.random() * TAU;
        _dir.set(Math.cos(a), -0.3, Math.sin(a)).addScaledVector(this.direction, -1.5);
        this.streaks.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._clock = -1;
    this._syncParticles();
    this.position.y = settings[ID].seedHeight;
    this._updateSeed(dt);
  }

  onImpact() {
    const c = settings[ID];
    this._clock = 0;
    this.seed.visible = false;
    this.pointAt(1, _centre);
    // The handbell bursts into the bell above the circle.
    this._fillEmit(_pos.copy(_centre).setY(c.seedHeight), 0.3, _up, 5, 1, 0.06, c.streakLife, 0);
    this.streaks.emit(Math.round(40 * settings.global.particleCount), _emit);
    this.lightBoost = c.impactLight * 0.2;
  }

  onFade(dt) {
    const c = settings[ID];
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;
    this._syncParticles();
    this._updateBell(dt);
    this.position.set(_centre.x, c.lightHeight, _centre.z);
  }

  onDestroy() {
    this._clock = -1;
    this._swept.length = 0;
    this.bell.visible = false;
    this.bellLens.visible = false;
    this.seed.visible = false;
    this.vortex.visible = false;
    this.vortexLens.visible = false;
    this.floor.visible = false;
  }

  dispose() {
    this.bellGeometry.dispose();
    this.torusGeometry.dispose();
    this.floorGeometry.dispose();
    this.bellMaterial.dispose();
    this.bellLensMaterial.dispose();
    this.seedMaterial.dispose();
    this.vortexMaterial.dispose();
    this.vortexLensMaterial.dispose();
    this.floorMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('🔔  Vortex Bell');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'handbell speed (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const seed = folder.addFolder('0 · Handbell');
  R(seed, c, 'seedHeight', 0.3, 4, 0.05, 'flies at (m)');
  R(seed, c, 'seedScale', 0.05, 1.5, 0.01, 'size (m)');
  R(seed, c, 'seedSpin', 0, 30, 0.1, 'spin');
  R(seed, c, 'travelStreaks', 0, 400, 1, 'wind lines / s');

  const shape = folder.addFolder('1 · Bell shape');
  R(shape, c, 'bellRadius', 0.2, 1.5, 0.01, 'lip radius (× circle)');
  R(shape, c, 'bellHeight', 0.5, 10, 0.05, 'height (m)');
  R(shape, c, 'bellWaist', 0.1, 1, 0.01, 'waist');
  R(shape, c, 'bellFlare', 0.3, 6, 0.05, 'flare curve');
  R(shape, c, 'lipFlare', 0, 0.5, 0.005, 'lip flare');
  R(shape, c, 'crownStart', 0.3, 0.98, 0.01, 'crown starts at');

  const time = folder.addFolder('Timing');
  R(time, c, 'dropHeight', 0, 12, 0.05, 'drops from (m)');
  R(time, c, 'dropTime', 0.03, 2, 0.01, 'drop over (s)');
  R(time, c, 'throwDelay', 0, 1.5, 0.01, 'vortex after strike (s)');
  R(time, c, 'holdTime', 0.05, 5, 0.05, 'rings for (s)');
  R(time, c, 'vortexTime', 0.1, 4, 0.05, 'vortex rolls out over (s)');
  R(time, c, 'lifetime', 0.05, 4, 0.05, 'lifts & dissolves over (s)');
  R(time, c, 'liftHeight', 0, 10, 0.05, 'lifts (m)');
  R(time, c, 'groundFade', 0.05, 3, 0.05, 'print erodes over (s)');

  const ring = folder.addFolder('2 · Ringing');
  R(ring, c, 'modeAmp', 0, 0.5, 0.005, 'oval squeeze');
  R(ring, c, 'modeRate', 0, 40, 0.1, 'ring rate');
  R(ring, c, 'modeDecay', 0, 8, 0.05, 'dies away (/s)');
  R(ring, c, 'humAmp', 0, 0.1, 0.001, 'hum');

  const look = folder.addFolder('3 · Bell look');
  R(look, c, 'flowSpeed', 0, 8, 0.05, 'pour speed');
  R(look, c, 'spiralTwist', -10, 10, 0.05, 'spiral twist');
  R(look, c, 'streakLanes', 1, 64, 1, 'streak lanes');
  R(look, c, 'streakGlow', 0, 8, 0.05, 'streak glow');
  R(look, c, 'rimGlow', 0, 8, 0.05, 'silhouette glow');
  R(look, c, 'bodyGlow', 0, 2, 0.01, 'body glow');
  R(look, c, 'lipGlow', 0, 8, 0.05, 'lip glow');
  R(look, c, 'bandGlow', 0, 15, 0.05, 'strike band glow');
  R(look, c, 'bandSpeed', 0.1, 8, 0.05, 'strike band speed');
  R(look, c, 'bandWidth', 0.01, 0.4, 0.005, 'strike band width');
  R(look, c, 'dissolveEdge', 0.005, 0.3, 0.005, 'dissolve edge');
  R(look, c, 'bellOpacity', 0, 2, 0.01, 'opacity');
  R(look, c, 'softFade', 0.01, 2, 0.01, 'soft fade (m)');
  R(look, c, 'bellWarp', 0, 3, 0.01, 'bend in the air');
  look.addColor(c, 'colorBellA').name('streaks');
  look.addColor(c, 'colorBellB').name('air');
  look.addColor(c, 'colorBellC').name('air, deep');
  look.addColor(c, 'colorBand').name('strike band');

  const vortex = folder.addFolder('4 · Vortex ring');
  R(vortex, c, 'vortexReach', 1, 20, 0.05, 'reach (m)');
  R(vortex, c, 'vortexTube', 0.05, 2, 0.01, 'tube (m)');
  R(vortex, c, 'vortexGrow', 0.2, 4, 0.01, 'tube grows (×)');
  R(vortex, c, 'vortexSquash', 0.2, 2, 0.01, 'squash');
  R(vortex, c, 'vortexRise', 0, 3, 0.01, 'height (m)');
  R(vortex, c, 'rollBands', 1, 20, 1, 'bands');
  R(vortex, c, 'rollSpeed', 0, 10, 0.05, 'roll speed');
  R(vortex, c, 'vortexGlow', 0, 8, 0.05, 'glow');
  R(vortex, c, 'vortexRim', 0, 8, 0.05, 'rim');
  R(vortex, c, 'vortexWarp', 0, 3, 0.01, 'drag in the air');
  vortex.addColor(c, 'colorVortexA').name('bands');
  vortex.addColor(c, 'colorVortexB').name('air');
  vortex.addColor(c, 'colorVortexC').name('air, deep');

  const floor = folder.addFolder('5 · Bell print');
  R(floor, c, 'printRings', 0, 16, 0.1, 'pressure rings');
  R(floor, c, 'printGlow', 0, 6, 0.05, 'ring glow');
  R(floor, c, 'nodalGlow', 0, 6, 0.05, 'nodal lines');
  R(floor, c, 'printDark', 0, 1, 0.01, 'darkening');
  floor.addColor(c, 'colorPrint').name('print');
  floor.addColor(c, 'colorPrintDark').name('pressed floor');

  const parts = folder.addFolder('6 · Particles');
  R(parts, c, 'streakRate', 0, 600, 1, 'wind lines / s');
  R(parts, c, 'streakSize', 0.005, 0.3, 0.005, 'line size');
  R(parts, c, 'streakLife', 0.05, 2, 0.01, 'line lifetime');
  R(parts, c, 'streakStretch', 0, 4, 0.01, 'line stretch');
  Editor.gradient(parts, c, 'colorStreak', 'wind line colour');
  R(parts, c, 'dustRate', 0, 800, 1, 'dust / s');
  R(parts, c, 'dustSize', 0.05, 3, 0.05, 'dust size');
  R(parts, c, 'dustLife', 0.1, 4, 0.05, 'dust lifetime');
  R(parts, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(parts, c, 'colorDust', 'dust colour');
  R(parts, c, 'strikeRings', 0, 40, 1, 'lip rings on strike');
  R(parts, c, 'ringSize', 0.05, 4, 0.01, 'ring size');
  R(parts, c, 'ringLife', 0.05, 3, 0.01, 'ring lifetime');
  Editor.gradient(parts, c, 'colorRing', 'ring colour');

  const beat = folder.addFolder('7 · The strike');
  R(beat, c, 'dropShake', 0, 1, 0.01, 'drop rumble');
  R(beat, c, 'strikeShake', 0, 2, 0.01, 'strike jolt');
  R(beat, c, 'strikeFlash', 0, 1, 0.01, 'flash');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'burstRadius', 0, 10, 0.05, 'air shell (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'shell life');
  beat.addColor(c, 'colorBurstA').name('shell, hot');
  beat.addColor(c, 'colorBurstB').name('shell, body');
  beat.addColor(c, 'colorBurstC').name('shell, brass');
  R(beat, c, 'shockRadius', 0, 20, 0.05, 'shock ring (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'shock life');
  beat.addColor(c, 'colorShockA').name('shock ring');
  beat.addColor(c, 'colorShockB').name('shock ring, hot');

  const hit = folder.addFolder('8 · Bodies');
  R(hit, c, 'hitBand', 0.05, 3, 0.01, 'caught within (m)');
  R(hit, c, 'hitImpulse', 0, 20, 0.1, 'outward');
  R(hit, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(hit, c, 'hitSpin', 0, 6, 0.05, 'spin');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0.1, 8, 0.05, 'height (m)');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'tremble');
  R(light, c, 'impactLight', 0, 60, 0.5, 'light punch');
}
