import { Mesh, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createBladeGeometry,
  createRodGeometry,
  createFanGeometry,
  createStripGeometry,
  createQuadGeometry
} from '../../assets/codex/PendulumCleaverGeometry.js';
import {
  MAX_SCARS,
  createBladeMaterial,
  createRodMaterial,
  createPivotMaterial,
  createSmearMaterial,
  createScarMaterial,
  createHaloMaterial,
  createWarpMaterial
} from '../../materials/codex/PendulumCleaverMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'pendulum';

const DEG = Math.PI / 180;
const HALF_PI = Math.PI * 0.5;

/** What the pendulum is doing — the impact and fade phases are split into beats. */
const Beat = Object.freeze({ SWING: 0, STALL: 1, HOLD: 2, CLEAVE: 3, FOLLOW: 4 });

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _floor = new Vector3();
const _local = new Vector3();
const _up = new Vector3(0, 1, 0);
const _force = { impulse: 0, lift: 0, spin: 0 };
const _targets = [];

/** Push one particle system's gradient and the globals through. */
function syncSystem(p, c, prefix, glow, turb) {
  const g = settings.global;
  p.setGradient(getColor(c[`${prefix}A`]), getColor(c[`${prefix}B`]), getColor(c[`${prefix}C`]), getColor(c[`${prefix}D`]));
  p.uniforms.uSizeScale.value = g.particleSize;
  p.uniforms.uLifeScale.value = g.particleLifetime;
  p.uniforms.uSpeedScale.value = g.particleSpeed;
  p.uniforms.uOpacity.value = g.opacity;
  p.uniforms.uGlow.value = glow * g.glow;
  p.uniforms.uTurbulence.value = turb * g.turbulence;
}

/**
 * The blade's outline in its own frame, metres — the CPU twin of
 * `bladeShape()` in PendulumCleaverMaterials. Keep them together.
 */
function bladeShape(q, v, out) {
  const c = settings[ID];
  const s = Math.sqrt(Math.max(1 - q * q, 0));
  const up = c.bladeTipUp * q * q;
  const yb = up - c.bladeDepth * s;
  const yt = up - c.bladeDepth * c.bladeInner * s;
  return out.set(q * c.bladeWidth * 0.5, lerp(yb, yt, v), 0);
}

/**
 * PENDULUM CLEAVER — Time, line cast.
 *
 * A pendulum is hung from the air over the line: a notched brass pivot ring,
 * a long rod, and a steel crescent the width of a doorway with a honed edge
 * glowing gold. The pivot rides down the line and the blade **swings across
 * it**, its edge grazing the floor at the bottom of every pass — sparks, a
 * white-hot gouge slashed across the line, anything standing there cut down.
 * Every swing is **slower** than the last (time thickening round it), until,
 * at the end of the line, the last swing climbs high to one side and simply
 * **stops** — hung at the top of its arc, trembling, a gold halo and an eddy
 * of thick air round it. Then it is **let go**: one long accelerating stroke
 * down through the target, the edge running white-hot, a shock ring, a gouge
 * twice the size, and everything at the end of the line cleaved. It carries
 * on up the far side and dissolves along a burning gold edge.
 *
 * Kept apart from the other time spells: no clock face, no glass, no sand, no
 * rings round a sphere. Time is shown as *motion* — the decaying swing rate,
 * the smear that shrinks with it, the stall where it vanishes entirely.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the rig** — the pivot ring (a notched torus, param-space) and the
 *      rod, materialising out of noise as the cast starts.
 *   2. **the blade** (`createBladeMaterial`) — the crescent, shaped and lit in
 *      the vertex stage from sliders: etched steel reflecting the sky, a gold
 *      fresnel rim, a honed edge that glows and runs hot on the cleave.
 *   3. **the smear** — an additive fan swept round the pivot behind the
 *      blade; its span *is* the swing's angular speed.
 *   4. **the scars** — up to 24 slanted gouges across the line, cooling from
 *      white-hot to a dark cut, and a gold timeline under the pivot's path.
 *   5. **the stall** — a billboard halo of stepping marks behind the stopped
 *      blade and an eddy of thick air on `LAYER.DISTORTION`.
 *   6. **sparks, motes, dust** — STREAK sparks where the edge grazes, slow
 *      gold motes shed off the blade (barely drifting: slowed time), SMOKE
 *      dust thrown up by the cleave.
 *   7. **the cleave** — the shock ring warp, an AIR shell, SHOCKWAVE and CRACK
 *      decals, flash, shake and a light punch.
 *   8. **the cut** — `handlesOwnHits`. Whatever the low edge passes is felled
 *      the way the blade swings — sliced in two when slicing is on — and the
 *      cleave throws harder.
 *
 * ## The editor rule
 *
 * A cast captures dice only: a seed, the side the first swing starts from.
 * The swing phase is *integrated* (so the rate sliders never make it jump);
 * every dimension, angle, time and colour is read from `settings.pendulum`
 * every frame.
 */
export class PendulumCleaverAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Gouges cut this cast. HUD readout only. */
  get instanceCount() {
    return this._scarCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.bladeGeometry = createBladeGeometry(64, 10);
    this.rodGeometry = createRodGeometry(24, 10);
    this.ringGeometry = createRodGeometry(48, 10);
    this.fanGeometry = createFanGeometry(40, 18);
    this.stripGeometry = createStripGeometry(140, 6);
    this.quadGeometry = createQuadGeometry();

    this.scarMaterial = createScarMaterial();
    this.scars = this._mesh(this.stripGeometry, this.scarMaterial, LAYER.VFX, 2);

    this.bladeMaterial = createBladeMaterial();
    this.blade = this._mesh(this.bladeGeometry, this.bladeMaterial, LAYER.VFX, 6);
    this.rodMaterial = createRodMaterial();
    this.rod = this._mesh(this.rodGeometry, this.rodMaterial, LAYER.VFX, 6);
    this.pivotMaterial = createPivotMaterial();
    this.pivot = this._mesh(this.ringGeometry, this.pivotMaterial, LAYER.VFX, 6);

    this.smearMaterial = createSmearMaterial();
    this.smear = this._mesh(this.fanGeometry, this.smearMaterial, LAYER.VFX, 12);
    this.haloMaterial = createHaloMaterial();
    this.halo = this._mesh(this.quadGeometry, this.haloMaterial, LAYER.VFX, 11);
    this.pivotGlowMaterial = createHaloMaterial();
    this.pivotGlow = this._mesh(this.quadGeometry, this.pivotGlowMaterial, LAYER.VFX, 13);
    this.warpMaterial = createWarpMaterial();
    this.warp = this._mesh(this.quadGeometry, this.warpMaterial, LAYER.DISTORTION, 0);

    /* Scratch state handed to the materials — one object apiece, reused. */
    this._metal = {
      attach: new Vector3(),
      across: new Vector3(),
      down: new Vector3(),
      flat: new Vector3(),
      pivot: new Vector3(),
      axisA: new Vector3(),
      axisB: new Vector3(),
      reveal: 0,
      heat: 0,
      halo: 0,
      seed: 0
    };
    this._smearState = { pivot: new Vector3(), side: new Vector3(), theta: 0, span: 0, fade: 1, seed: 0 };
    this._scarData = new Float32Array(MAX_SCARS * 4);
    this._scarState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      length: 1,
      scars: this._scarData,
      count: 0,
      lineTo: 0,
      fade: 1,
      seed: 0
    };
    this._haloState = { center: new Vector3(), size: 2, intensity: 0, gain: 1, tick: 0, seed: 0 };
    this._pivotGlowState = { center: new Vector3(), size: 1, intensity: 0, gain: 1, tick: 0, seed: 0 };
    this._warpState = { center: new Vector3(), size: 3, hold: 0, shock: 0 };

    this._pivotPos = new Vector3();
    this._edge = new Vector3();
    this._cutAt = new Vector3();

    this._beat = Beat.SWING;
    this._beatTime = 0;
    this._seed = 0;
    this._sign = 1;
    this._phi = 0;
    this._amp = 0;
    this._theta = 0;
    this._thetaDot = 0;
    this._along = 0;
    this._phi0 = 0;
    this._phiT = 0;
    this._amp0 = 0;
    this._thetaTop = 0;
    this._tick = 0;
    this._cleaved = false;
    this._shockT = -1;
    this._scarCount = 0;
    this._scarHead = 0;
    this._fadeK = 0;
  }

  _mesh(geometry, material, layer, order) {
    const mesh = new Mesh(geometry, material);
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.sparks = particles.get('pendulum.sparks', {
      capacity: 1800,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.55;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uDrag.value = 1.1;

    this.motes = particles.get('pendulum.motes', {
      capacity: 1400,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.3
    });
    this.motes.uniforms.uSizeIn.value = 0.2;
    this.motes.uniforms.uFadeIn.value = 0.2;
    this.motes.uniforms.uFadeOut.value = 0.5;
    this.motes.uniforms.uEndSize.value = 0.4;
    this.motes.uniforms.uDrag.value = 2.6;
    this.motes.uniforms.uTurbFrequency.value = 0.6;
    this.motes.uniforms.uTurbSpeed.value = 0.25;

    this.dust = particles.get('pendulum.dust', {
      capacity: 500,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 1
    });
    this.dust.uniforms.uSizeIn.value = 0.15;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.55;
    this.dust.uniforms.uEndSize.value = 2.4;
    this.dust.uniforms.uDrag.value = 1.6;

    this.sparkEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the stall, the hang and the stroke down. */
  get impactDuration() {
    const c = settings[ID];
    return Math.max(0.1, (c.stallTime + c.holdTime + c.cleaveTime) * settings.global.lifetime);
  }

  /** The fade is the follow-through and the dissolve. */
  get fadeDuration() {
    const c = settings[ID];
    return Math.max(0.1, Math.max(c.followTime, c.lifetime) * settings.global.lifetime);
  }

  /** A honed edge glints rather than gutters. */
  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 13.1) * Math.sin(this.age * 4.3 + 0.7));
  }

  /* ------------------------------------------------------------------ */
  /* The rig on the CPU                                                  */
  /* ------------------------------------------------------------------ */

  /** Where the pivot hangs, from `_along`. */
  _pivotAt(out) {
    const c = settings[ID];
    return out.copy(this.origin).addScaledVector(this.direction, this._along).setY(c.pivotHeight);
  }

  /**
   * The frame the blade hangs in for the current angle: the collar, the
   * swing's tangent, pivot → blade, and the line (the blade's thickness).
   */
  _frame() {
    const c = settings[ID];
    const m = this._metal;
    const st = Math.sin(this._theta);
    const ct = Math.cos(this._theta);
    this._pivotAt(m.pivot);
    m.down.copy(this.side).multiplyScalar(st).addScaledVector(_up, -ct);
    m.across.copy(this.side).multiplyScalar(ct).addScaledVector(_up, st);
    m.flat.copy(this.direction);
    m.attach.copy(m.pivot).addScaledVector(m.down, c.rodLength);
    m.axisA.copy(this.side);
    m.axisB.copy(_up);
    // The lowest point of the edge: the bottom of the crescent.
    this._edge.copy(m.attach).addScaledVector(m.down, c.bladeDepth);
  }

  /** A point on the blade at (q, v), world. */
  _bladePoint(q, v, out) {
    const m = this._metal;
    bladeShape(q, v, _local);
    return out.copy(m.attach).addScaledVector(m.across, _local.x).addScaledVector(m.down, -_local.y);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    this.sparkEmitter.reset();
    this.moteEmitter.reset();

    this._seed = Math.random() * 100;
    this._sign = Math.random() < 0.5 ? 1 : -1;
    // Pulled back to one side: the first pass starts from the top of its arc.
    this._phi = -HALF_PI;
    this._amp = c.swingAngle * DEG;
    this._theta = -this._sign * this._amp;
    this._thetaDot = 0;
    this._along = Math.min(Math.max(0, c.pivotStart), this.length);
    this._beat = Beat.SWING;
    this._beatTime = 0;
    this._tick = 0;
    this._cleaved = false;
    this._shockT = -1;
    this._scarCount = 0;
    this._scarHead = 0;
    this._fadeK = 0;

    const m = this._metal;
    m.seed = this._seed;
    m.reveal = 0;
    m.heat = 0;
    m.halo = 0;
    this._smearState.seed = this._seed;
    this._scarState.seed = this._seed;
    this._haloState.seed = this._seed;
    this._pivotGlowState.seed = this._seed + 3;
    this._warpState.hold = 0;
    this._warpState.shock = 0;

    this.blade.visible = true;
    this.rod.visible = true;
    this.pivot.visible = true;
    this.smear.visible = true;
    this.scars.visible = true;
    this.pivotGlow.visible = true;
    this.halo.visible = false;
    this.warp.visible = false;

    this._frame();
    this._syncAll(0);

    /* the pivot kindling: a puff of gold motes where it will hang */
    this._resetEmit();
    _emit.position = m.pivot;
    _emit.radius = c.pivotRadius;
    _emit.speed = c.moteSpeed * 3;
    _emit.spread = 1;
    _emit.size = c.moteSize * 1.3;
    _emit.life = c.moteLife * 0.7;
    this.motes.emit(Math.round(30 * settings.global.particleCount), _emit);
  }

  _resetEmit() {
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
    _emit.time = frame.uTime.value;
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _syncAll(dt) {
    const c = settings[ID];
    const g = settings.global;
    const m = this._metal;

    this.bladeMaterial.userData.sync(m);
    this.rodMaterial.userData.sync(m);
    this.pivotMaterial.userData.sync(m);

    const sm = this._smearState;
    sm.pivot.copy(m.pivot);
    sm.side.copy(this.side);
    sm.theta = this._theta;
    // The smear trails as far back as the swing went in `smearTime`: a stall
    // has no smear at all.
    sm.span = Math.max(-1.4, Math.min(1.4, this._thetaDot * c.smearTime));
    sm.fade = m.reveal * (1 - this._fadeK);
    this.smearMaterial.userData.sync(sm);
    this.smear.visible = Math.abs(sm.span) > 0.004 && sm.fade > 0.01;

    const sc = this._scarState;
    sc.start.copy(this.origin);
    sc.dir.copy(this.direction);
    sc.side.copy(this.side);
    sc.length = this.length + c.scarHalf;
    sc.count = this._scarCount;
    sc.lineTo = this._along;
    sc.fade = 1 - smoothstep(0.35, 1, this._fadeK);
    this.scarMaterial.userData.sync(sc);

    const pg = this._pivotGlowState;
    pg.center.copy(m.pivot);
    pg.size = c.pivotRadius * 2.2;
    pg.intensity = m.reveal * (1 - this._fadeK);
    pg.gain = c.pivotGlow;
    this._tick += dt * (this._beat === Beat.HOLD ? 0.25 : 1.4) * g.animationSpeed;
    pg.tick = -this._tick;
    this.pivotGlowMaterial.userData.sync(pg);

    syncSystem(this.sparks, c, 'colorSpark', c.sparkGlow, 0.2);
    this.sparks.uniforms.uGravity.value.set(0, -c.sparkGravity, 0);
    this.sparks.uniforms.uStretch.value = c.sparkStretch;
    syncSystem(this.motes, c, 'colorMote', c.moteGlow, 0.5);
    this.motes.uniforms.uGravity.value.set(0, 0.05, 0);
    syncSystem(this.dust, c, 'colorDust', 1, 0.6);
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    this.dust.uniforms.uGravity.value.set(0, 0.2, 0);
    this.dust.uniforms.uSwirl.value = 0.6;
  }

  /* ------------------------------------------------------------------ */
  /* Travel — swinging down the line, slower every pass                  */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._along = Math.min(this.length, Math.max(c.pivotStart, this.front));

    // The swing rate decays toward `slowEnd` of itself as the pivot travels.
    const rate = c.swingFreq * lerp(1, c.slowEnd, Easing.inOutQuad(this.u));
    this._phi += Math.PI * 2 * rate * dt * g.animationSpeed;
    this._amp = c.swingAngle * DEG;
    this._setTheta(this._sign * this._amp * Math.sin(this._phi), dt);

    this._metal.reveal = Easing.outQuad(saturate(this.age / Math.max(0.02, c.formTime * g.lifetime)));
    this._metal.heat = 0;
    this._metal.halo = 0;
    this._frame();
    this._syncAll(dt);
    this._swingFx(dt, 1);
    this.ctx.shake.rumble(c.travelRumble * g.cameraShake, dt);
    this.position.copy(this._metal.attach);
  }

  /** Move to a new angle, keeping its rate, and cut a scar when it crosses the bottom. */
  _setTheta(theta, dt) {
    const prev = this._theta;
    this._theta = theta;
    if (dt > 0) this._thetaDot = (theta - prev) / dt;
    // The cleave cuts its own (bigger) gouge; the follow-through cuts none.
    if (!this._cleaved && prev !== 0 && Math.sign(prev) !== Math.sign(theta) && Math.abs(this._thetaDot) > 0.2) {
      this._bottomPass(1);
    }
  }

  /** The edge has just come through the bottom of its arc. */
  _bottomPass(scale) {
    const c = settings[ID];
    const g = settings.global;
    this._frame();
    if (this._edge.y > c.grazeHeight + 0.35) return;
    this._addScar(this._along, Math.sign(this._thetaDot), 1);
    _floor.copy(this._edge).setY(0);
    this.ctx.decals.spawn(DecalType.DUSTRING, _floor, {
      radius: c.scarHalf * 0.9,
      life: 0.6,
      intensity: 0.5,
      colorA: getColor(c.colorDustB),
      colorB: getColor(c.colorDustA)
    });
    this.ctx.shake.add(c.grazeShake * scale * g.cameraShake, 8, 18);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.5);
  }

  _addScar(along, sign, strength) {
    const i = this._scarHead;
    this._scarHead = (this._scarHead + 1) % MAX_SCARS;
    this._scarCount = Math.min(MAX_SCARS, this._scarCount + 1);
    const d = this._scarData;
    d[i * 4] = along;
    d[i * 4 + 1] = sign || 1;
    d[i * 4 + 2] = frame.uTime.value;
    d[i * 4 + 3] = strength;
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the stall, the hang, the stroke down                       */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings[ID];
    this._along = this.length;
    this._beat = Beat.STALL;
    this._beatTime = 0;
    this._phi0 = this._phi;
    // The next top of the arc: where sin φ is ±1 and the swing turns round.
    this._phiT = (Math.floor((this._phi - HALF_PI) / Math.PI) + 1) * Math.PI + HALF_PI;
    if (this._phiT - this._phi < 0.6) this._phiT += Math.PI;
    this._amp0 = this._amp;
    this._thetaTop = this._sign * Math.sin(this._phiT) * c.cleaveAngle * DEG;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const L = g.lifetime;
    this._beatTime += dt;
    const m = this._metal;

    if (t <= 1) {
      const stall = Math.max(0.02, c.stallTime * L);
      const hold = Math.max(0, c.holdTime * L);
      const tau = this._beatTime;

      if (tau < stall) {
        /* the last swing climbing high and running out of time */
        this._beat = Beat.STALL;
        const k = tau / stall;
        const phi = lerp(this._phi0, this._phiT, Easing.outCubic(k));
        this._amp = lerp(this._amp0, c.cleaveAngle * DEG, smoothstep(0, 1, k));
        this._setTheta(this._sign * this._amp * Math.sin(phi), dt);
        m.halo = smoothstep(0.6, 1, k);
      } else if (tau < stall + hold) {
        /* hung at the top, stopped — trembling */
        this._beat = Beat.HOLD;
        const k = (tau - stall) / Math.max(0.01, hold);
        const shiver = c.tremble * DEG * (0.4 + 0.6 * k) * Math.sin(this.age * 41) * Math.sin(this.age * 7.3);
        this._theta = this._thetaTop + shiver;
        this._thetaDot = 0;
        m.halo = 1;
        this.ctx.shake.rumble(0.04 * k * g.cameraShake, dt);
      } else {
        /* let go: one long accelerating stroke to the bottom */
        this._beat = Beat.CLEAVE;
        const k = saturate((tau - stall - hold) / Math.max(0.02, c.cleaveTime * L));
        this._setTheta(this._thetaTop * Math.cos(HALF_PI * k), dt);
        m.halo = 1 - k;
        m.heat = Easing.inQuad(k);
      }

      m.reveal = 1;
      this._frame();
      this._syncStall(dt, m.halo);
      this._syncAll(dt);
      this._swingFx(dt, 1);
      this.position.copy(m.attach);
      return;
    }

    /* the fade: the follow-through up the far side, dissolving */
    if (!this._cleaved) this._cleave();
    this._beat = Beat.FOLLOW;
    const ft = saturate(t - 1);
    this._fadeK = ft;
    const follow = saturate((this.fadeTime) / Math.max(0.05, c.followTime * L));
    // The far half of the arc, losing height as it goes.
    const swing = Math.sin(HALF_PI * Easing.outQuad(follow));
    this._setTheta(-this._thetaTop * swing * 0.8, dt);
    m.heat = 1 - smoothstep(0, 0.6, ft);
    m.halo = 0;
    m.reveal = 1 - Easing.inQuad(smoothstep(0.1, 1, ft));
    this._frame();
    this._syncStall(dt, 0);
    this._syncAll(dt);
    this._swingFx(dt, 1 - ft);
    this.blade.visible = m.reveal > 0.001;
    this.rod.visible = this.blade.visible;
    this.pivot.visible = this.blade.visible;
    this.pivotGlow.visible = this.blade.visible;
    this.position.copy(m.attach);
  }

  /** The halo and the eddy round the stopped blade, and the cleave's shock ring. */
  _syncStall(dt, halo) {
    const c = settings[ID];
    const m = this._metal;
    const hs = this._haloState;
    this._bladePoint(0, 0.5, hs.center);
    hs.size = c.bladeWidth * 0.75;
    hs.intensity = halo;
    hs.gain = c.holdHalo;
    hs.tick = this._tick * 0.6;
    this.haloMaterial.userData.sync(hs);
    this.halo.visible = halo > 0.01;

    const ws = this._warpState;
    if (this._shockT >= 0) {
      this._shockT += dt;
      ws.center.copy(this._cutAt);
      ws.size = c.shockRadius * 0.6;
      ws.hold = 0;
      ws.shock = saturate(this._shockT / 0.45);
      if (ws.shock >= 1) this._shockT = -1;
    } else {
      ws.center.copy(hs.center);
      ws.size = c.holdWarpSize;
      ws.hold = halo;
      ws.shock = 0;
    }
    this.warpMaterial.userData.sync(ws);
    this.warp.visible = ws.hold > 0.01 || ws.shock > 0;
    m.halo = halo;
  }

  /** The bottom of the last stroke: everything at the end of the line is cleaved. */
  _cleave() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._cleaved = true;
    this._frame();
    this._cutAt.copy(this._edge);
    this._cutAt.y = Math.max(0.6, this._edge.y + c.bladeDepth * 0.4);
    _floor.copy(this._edge).setY(0);

    this._addScar(this._along, Math.sign(this._thetaDot) || 1, 1.7);
    this._shockT = 0;

    this.ctx.bursts.spawn(BurstMode.AIR, this._cutAt, {
      radius: c.burstSize * 0.2,
      endRadius: c.burstSize * power,
      life: 0.55,
      intensity: c.burstIntensity,
      opacity: 0.7,
      fresnel: 2.2,
      displace: 0.3,
      turbulence: 1,
      squash: 0.55,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.6,
      width: 0.07,
      intensity: 1.2,
      colorA: getColor(c.colorShock),
      colorB: getColor(c.colorBurstA)
    });
    this.ctx.decals.spawn(DecalType.CRACK, _floor, {
      radius: c.crackRadius,
      life: this.fadeDuration + 0.8,
      intensity: 1,
      colorA: getColor(c.colorCrackA),
      colorB: getColor(c.colorCrackB)
    });

    /* sparks thrown the way the stroke went, dust up off the floor */
    this._resetEmit();
    _dir.copy(this.side).multiplyScalar(Math.sign(this._thetaDot) || 1).addScaledVector(_up, 0.5).normalize();
    _emit.position = _floor.setY(0.1);
    _emit.radius = 0.25;
    _emit.direction = _dir;
    _emit.speed = c.sparkSpeed * 1.4;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.9;
    _emit.size = c.sparkSize * 1.3;
    _emit.life = c.sparkLife;
    _emit.lifeVariance = 0.5;
    this.sparks.emit(Math.round(c.cleaveSparks * g.particleCount), _emit);

    this._resetEmit();
    _emit.position = _floor;
    _emit.anchor = _floor;
    _emit.radius = 0.6;
    _emit.direction = _up;
    _emit.speed = 2.2;
    _emit.spread = 1.2;
    _emit.size = c.dustSize;
    _emit.life = c.dustLife;
    _emit.spin = 0.6;
    this.dust.emit(Math.round(c.dustCount * g.particleCount), _emit);

    this._resetEmit();
    _emit.position = this._cutAt;
    _emit.radius = c.bladeWidth * 0.4;
    _emit.speed = c.moteSpeed * 6;
    _emit.spread = 1;
    _emit.size = c.moteSize * 1.4;
    _emit.life = c.moteLife;
    this.motes.emit(Math.round(70 * g.particleCount), _emit);

    /* the cut: everything at the end of the line, harder */
    this._cut(true);

    this.ctx.shake.add(c.cleaveShake * power * g.cameraShake, 1 / Math.max(0.05, c.shakeDuration), 22);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.cleaveFlash * power);
    this.lightBoost = c.lightIntensity * c.cleaveLight * power;
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Sparks where the edge grazes, motes off the blade, and the cut. */
  _swingFx(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const m = this._metal;
    const time = frame.uTime.value;
    const moving = Math.abs(this._thetaDot);

    if (this._edge.y < c.grazeHeight && moving > 0.3) {
      const n = Math.round(this.sparkEmitter.tick(dt, c.grazeSparks * strength) * g.particleCount);
      if (n > 0) {
        this._resetEmit();
        _floor.copy(this._edge).setY(0.04);
        _dir.copy(m.across).multiplyScalar(Math.sign(this._thetaDot)).setY(0.6).normalize();
        _emit.position = _floor;
        _emit.radius = 0.12;
        _emit.direction = _dir;
        _emit.speed = c.sparkSpeed;
        _emit.speedVariance = 0.6;
        _emit.spread = 0.7;
        _emit.size = c.sparkSize;
        _emit.life = c.sparkLife * 0.7;
        this.sparks.emit(n, _emit);
      }
    } else {
      this.sparkEmitter.reset();
    }

    const motes = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength * m.reveal) * g.particleCount);
    if (motes > 0) {
      this._resetEmit();
      _emit.size = c.moteSize;
      _emit.life = c.moteLife;
      _emit.speed = c.moteSpeed;
      _emit.spread = 1;
      _emit.direction = _up;
      for (let i = 0; i < motes; i++) {
        // Off the edge, mostly: where the swing is fastest.
        this._bladePoint(Math.random() * 2 - 1, Math.pow(Math.random(), 2) * 0.6, _pos);
        _emit.position = _pos;
        _emit.time = time;
        this.motes.emit(1, _emit);
      }
    }

    if (!this._cleaved && moving > 0.3) this._cut(false);
  }

  /** Fell whatever the low edge is passing through. */
  _cut(cleave) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    if (!cleave && this._edge.y > c.hitHeight) return;
    const m = this._metal;
    const reach = Math.max(0.1, c.hitReach) + (cleave ? c.bladeWidth * 0.5 : c.bladeWidth * 0.25);
    const found = field.findTargets(this._edge.x, this._edge.z, reach, _targets);
    if (found.length === 0) return;
    const power = g.explosionIntensity;
    _force.impulse = (cleave ? c.cleaveImpulse : c.hitImpulse) * power;
    _force.lift = (cleave ? c.cleaveLift : c.hitLift) * power;
    _force.spin = c.hitSpin;
    const sgn = Math.sign(this._thetaDot) || 1;
    _dir.copy(m.across).setY(0);
    if (_dir.lengthSq() < 1e-4) _dir.copy(this.side);
    _dir.normalize().multiplyScalar(sgn).addScaledVector(this.direction, cleave ? 0.35 : 0.1).normalize();
    for (let i = 0; i < found.length; i++) {
      const dummy = found[i];
      // Only what is actually in the blade's plane, give or take its reach.
      const dx = dummy.position.x - this._edge.x;
      const dz = dummy.position.z - this._edge.z;
      const along = Math.abs(dx * this.direction.x + dz * this.direction.z);
      if (along > Math.max(0.1, c.hitReach) + (cleave ? 0.6 : 0)) continue;
      if (!dummy.kill(_dir.x, _dir.z, _force, c.slice > 0.5)) continue;
      this._resetEmit();
      _pos.copy(dummy.position).setY(0.9);
      _emit.position = _pos;
      _emit.radius = 0.2;
      _emit.direction = _dir;
      _emit.speed = c.sparkSpeed * 0.7;
      _emit.spread = 0.7;
      _emit.size = c.sparkSize;
      _emit.life = c.sparkLife * 0.7;
      this.sparks.emit(Math.round(36 * g.particleCount), _emit);
      this.ctx.shake.add(c.grazeShake * 2 * g.cameraShake, 8, 20);
      this.lightBoost = Math.max(this.lightBoost, c.lightIntensity);
    }
    _targets.length = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.blade.visible = false;
    this.rod.visible = false;
    this.pivot.visible = false;
    this.smear.visible = false;
    this.scars.visible = false;
    this.halo.visible = false;
    this.pivotGlow.visible = false;
    this.warp.visible = false;
    this._scarCount = 0;
    this._shockT = -1;
  }

  dispose() {
    this.bladeGeometry.dispose();
    this.rodGeometry.dispose();
    this.ringGeometry.dispose();
    this.fanGeometry.dispose();
    this.stripGeometry.dispose();
    this.quadGeometry.dispose();
    this.bladeMaterial.dispose();
    this.rodMaterial.dispose();
    this.pivotMaterial.dispose();
    this.smearMaterial.dispose();
    this.scarMaterial.dispose();
    this.haloMaterial.dispose();
    this.pivotGlowMaterial.dispose();
    this.warpMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⚖  Pendulum Cleaver');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 1, 40, 0.1, 'pivot travel (m/s)');
  R(cast, c, 'lifetime', 0.1, 6, 0.05, 'dissolves over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'glint');

  const rig = folder.addFolder('1 · Rig');
  R(rig, c, 'pivotStart', 0, 8, 0.05, 'pivot appears at (m)');
  R(rig, c, 'pivotHeight', 2, 16, 0.05, 'pivot height (m)');
  R(rig, c, 'rodLength', 0.5, 14, 0.05, 'rod length (m)');
  R(rig, c, 'rodRadius', 0.005, 0.3, 0.001, 'rod radius (m)');
  R(rig, c, 'collarRadius', 0.01, 0.6, 0.005, 'collar radius (m)');
  R(rig, c, 'pivotRadius', 0.05, 2, 0.01, 'pivot ring (m)');
  R(rig, c, 'pivotTube', 0.005, 0.4, 0.001, 'pivot ring thickness');
  R(rig, c, 'pivotGlow', 0, 10, 0.05, 'pivot glow');
  R(rig, c, 'formTime', 0.02, 2, 0.01, 'materialises over (s)');
  R(rig, c, 'revealEdge', 0.005, 0.4, 0.005, 'materialise edge');

  const shape = folder.addFolder('2 · Blade shape');
  R(shape, c, 'bladeWidth', 0.2, 8, 0.01, 'tip to tip (m)');
  R(shape, c, 'bladeDepth', 0.1, 4, 0.01, 'depth (m)');
  R(shape, c, 'bladeInner', 0, 0.95, 0.01, 'spine curve');
  R(shape, c, 'bladeTipUp', -1, 2, 0.01, 'tip sweep (m)');
  R(shape, c, 'bladeThickness', 0.005, 0.6, 0.005, 'spine thickness (m)');

  const metal = folder.addFolder('3 · Blade metal');
  R(metal, c, 'metalEnv', 0, 4, 0.01, 'reflection');
  R(metal, c, 'metalSpecular', 0, 10, 0.05, 'highlight');
  R(metal, c, 'metalGloss', 1, 300, 1, 'gloss');
  R(metal, c, 'engrave', 0, 1, 0.01, 'filigree');
  R(metal, c, 'engraveScale', 0.2, 12, 0.05, 'filigree scale');
  R(metal, c, 'edgeGlow', 0, 20, 0.05, 'edge glow');
  R(metal, c, 'edgeWidth', 0.01, 1, 0.005, 'honed share');
  R(metal, c, 'rimGlow', 0, 6, 0.05, 'gold rim');
  metal.addColor(c, 'colorSteel').name('steel');
  metal.addColor(c, 'colorSteelDark').name('etching');
  metal.addColor(c, 'colorBrass').name('brass');
  metal.addColor(c, 'colorEdge').name('edge');
  metal.addColor(c, 'colorEdgeHot').name('edge hot');
  metal.addColor(c, 'colorRim').name('rim');
  metal.addColor(c, 'colorReveal').name('materialise edge');

  const swing = folder.addFolder('4 · Swing');
  R(swing, c, 'swingAngle', 1, 80, 0.5, 'swing (deg either side)');
  R(swing, c, 'swingFreq', 0.05, 4, 0.01, 'swings/second at the start');
  R(swing, c, 'slowEnd', 0.05, 2, 0.01, 'rate at the end (×)');
  R(swing, c, 'stallTime', 0.05, 3, 0.01, 'stalls over (s)');
  R(swing, c, 'cleaveAngle', 5, 120, 0.5, 'climbs to (deg)');
  R(swing, c, 'holdTime', 0, 3, 0.01, 'hangs for (s)');
  R(swing, c, 'tremble', 0, 6, 0.05, 'tremble (deg)');
  R(swing, c, 'cleaveTime', 0.05, 2, 0.01, 'stroke down (s)');
  R(swing, c, 'followTime', 0.05, 3, 0.01, 'follow-through (s)');

  const smear = folder.addFolder('5 · Smear');
  R(smear, c, 'smearTime', 0, 0.6, 0.005, 'trails (s of swing)');
  R(smear, c, 'smearGlow', 0, 10, 0.05, 'glow');
  R(smear, c, 'smearOpacity', 0, 1, 0.01, 'opacity');
  R(smear, c, 'smearStreaks', 1, 80, 1, 'streaks');
  R(smear, c, 'smearRod', 0, 1, 0.01, 'share on the rod');
  smear.addColor(c, 'colorSmearA').name('near the blade');
  smear.addColor(c, 'colorSmearB').name('trailing');

  const scars = folder.addFolder('6 · Scars');
  R(scars, c, 'scarHalf', 0.1, 6, 0.05, 'half-length (m)');
  R(scars, c, 'scarWidth', 0.005, 0.5, 0.005, 'width (m)');
  R(scars, c, 'scarSkew', -1, 1, 0.01, 'slant');
  R(scars, c, 'scarGlow', 0, 15, 0.05, 'glow');
  R(scars, c, 'scarCool', 0.05, 6, 0.05, 'cools over (s)');
  R(scars, c, 'grooveOpacity', 0, 1, 0.01, 'groove opacity');
  R(scars, c, 'lineGlow', 0, 4, 0.01, 'timeline glow');
  R(scars, c, 'lineWidth', 0.005, 0.4, 0.005, 'timeline width (m)');
  scars.addColor(c, 'colorScarHot').name('fresh');
  scars.addColor(c, 'colorScarWarm').name('cooling');
  scars.addColor(c, 'colorGroove').name('groove');
  scars.addColor(c, 'colorLine').name('timeline');

  const stall = folder.addFolder('7 · Stall');
  R(stall, c, 'holdWarp', 0, 4, 0.01, 'thick air');
  R(stall, c, 'holdWarpSize', 0.2, 10, 0.05, 'eddy size (m)');
  R(stall, c, 'holdHalo', 0, 10, 0.05, 'halo');
  stall.addColor(c, 'colorHalo').name('halo');

  const fx = folder.addFolder('8 · Sparks, motes, dust');
  R(fx, c, 'grazeHeight', 0, 3, 0.01, 'grazes below (m)');
  R(fx, c, 'grazeSparks', 0, 800, 1, 'sparks/second');
  R(fx, c, 'sparkSpeed', 0, 40, 0.1, 'spark speed');
  R(fx, c, 'sparkSize', 0.005, 0.3, 0.001, 'spark size');
  R(fx, c, 'sparkLife', 0.05, 3, 0.01, 'spark lifetime');
  R(fx, c, 'sparkGravity', -10, 40, 0.1, 'spark gravity');
  R(fx, c, 'sparkStretch', 0, 1, 0.005, 'spark stretch');
  R(fx, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  Editor.gradient(fx, c, 'colorSpark', 'spark gradient');
  R(fx, c, 'moteRate', 0, 400, 1, 'motes/second');
  R(fx, c, 'moteSize', 0.005, 0.5, 0.001, 'mote size');
  R(fx, c, 'moteLife', 0.1, 6, 0.05, 'mote lifetime');
  R(fx, c, 'moteSpeed', 0, 4, 0.01, 'mote drift');
  R(fx, c, 'moteGlow', 0, 10, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorMote', 'mote gradient');
  R(fx, c, 'dustCount', 0, 120, 1, 'dust at the cleave');
  R(fx, c, 'dustSize', 0.05, 4, 0.01, 'dust size');
  R(fx, c, 'dustLife', 0.1, 6, 0.05, 'dust lifetime');
  R(fx, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(fx, c, 'colorDust', 'dust gradient');

  const cleave = folder.addFolder('9 · Cleave');
  R(cleave, c, 'cleaveSparks', 0, 800, 1, 'sparks');
  R(cleave, c, 'shockRadius', 0, 16, 0.05, 'shockwave (m)');
  R(cleave, c, 'crackRadius', 0, 8, 0.05, 'crack (m)');
  R(cleave, c, 'burstSize', 0, 10, 0.05, 'air shell (m)');
  R(cleave, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(cleave, c, 'ringWarp', 0, 4, 0.01, 'shock distortion');
  R(cleave, c, 'cleaveFlash', 0, 1, 0.01, 'flash');
  R(cleave, c, 'cleaveShake', 0, 2, 0.01, 'camera knock');
  R(cleave, c, 'shakeDuration', 0.05, 2, 0.01, 'knock lasts');
  R(cleave, c, 'cleaveLight', 0, 10, 0.05, 'light punch (× intensity)');
  R(cleave, c, 'travelRumble', 0, 1, 0.01, 'rumble while swinging');
  R(cleave, c, 'grazeShake', 0, 1, 0.01, 'knock per pass');
  cleave.addColor(c, 'colorBurstA').name('shell inner');
  cleave.addColor(c, 'colorBurstB').name('shell mid');
  cleave.addColor(c, 'colorBurstC').name('shell outer');
  cleave.addColor(c, 'colorShock').name('shockwave');
  cleave.addColor(c, 'colorFlash').name('flash');
  cleave.addColor(c, 'colorCrackA').name('crack');
  cleave.addColor(c, 'colorCrackB').name('crack hot');

  const cut = folder.addFolder('10 · Cut');
  R(cut, c, 'hitHeight', 0, 4, 0.01, 'cuts below (m)');
  R(cut, c, 'hitReach', 0.05, 3, 0.01, 'reach off the blade (m)');
  R(cut, c, 'hitImpulse', 0, 30, 0.1, 'thrown (m/s)');
  R(cut, c, 'hitLift', 0, 15, 0.05, 'lift (m/s)');
  R(cut, c, 'hitSpin', 0, 8, 0.01, 'tumble');
  R(cut, c, 'cleaveImpulse', 0, 40, 0.1, 'cleave throw (m/s)');
  R(cut, c, 'cleaveLift', 0, 20, 0.05, 'cleave lift (m/s)');
  R(cut, c, 'slice', 0, 1, 1, 'slice in two');

  folder.close();
  return folder;
}
