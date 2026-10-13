import { Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createResonanceShellMaterial,
  createResonanceWarpMaterial,
  createResonanceFloorMaterial
} from '../../materials/collective/ResonancePulseMaterial.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

export const ID = 'sonic';

/** Rings per cast. The editor's `pulseCount` slider clamps to this. */
const MAX_PULSES = 12;
/** Grid the shell is wrapped from: around × apex-to-rim. */
const SHELL_AROUND = 56;
const SHELL_DOWN = 14;

const _emit = {};
const _pos = new Vector3();
const _hand = new Vector3();
const _end = new Vector3();
const _dir = new Vector3();
const _zAxis = new Vector3(0, 0, 1);
const _up = new Vector3(0, 1, 0);

/**
 * SONIC — Resonance Pulse.
 *
 * A line cast that is a *train*: `pulseCount` pressure rings leave the hand
 * `pulseInterval` apart and travel down the line at the cast speed, opening as
 * they go, and the last one landing sets off the boom. Sound, not force — so
 * the read is a lens and a beat, not a blast.
 *
 * Layers:
 *
 *   1. **RINGS** — each ring is a spherical cap built in the vertex stage
 *      (`ResonancePulseMaterial`), its rim facing down the cast. The fragment
 *      draws a thin rim split into red / green / blue, interference bands from
 *      two beating waves, standing-wave lobes and a fresnel lift, soft-faded
 *      where it cuts the floor.
 *   2. **WARP** — a second copy of every shell on LAYER.DISTORTION writing a
 *      screen-radial refraction offset in a band at its rim, so each ring
 *      visibly bends the world it passes through; the boom's floor ripple has
 *      its own warp pass.
 *   3. **DUST** — non-additive smoke kicked out sideways from under each ring
 *      every `dustSpacing` metres, because the air it pushes has to go
 *      somewhere.
 *   4. **RIPPLES** — RIPPLE decals laid on the floor under every Nth ring.
 *   5. **MUZZLE** — little RING particles thrown off the hand as each pulse
 *      leaves, and a tick of shake per pulse so the train is *felt* as a
 *      rhythm.
 *   6. **BOOM** — when the last ring lands: an AIR shell, a SHOCKWAVE decal, a
 *      chromatic ripple train racing across the floor (colour + warp), a ring
 *      of dust, a light punch, a flash and a camera kick.
 *
 * ## Decisions
 *
 * The base front is replaced (`advance`) by the train's own clock. Each ring
 * integrates its own distance, so the lead ring sets `position` (and the
 * default line hit capsule — this cast is happy to fell what it passes), and
 * the frame the *last* ring lands is the frame `advance` reports the end.
 *
 * A ring record captures only events — when it left, when it landed, a seed,
 * how far it has travelled. Its radius, height, brightness, banding and colour
 * are all resolved from `settings.sonic` every frame, so dragging `ringEnd` or
 * `spread` re-shapes rings that are already in flight.
 */
export class ResonancePulseAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layers 1 & 2: the shells and their warp ---- */
    // One grid for every ring and its warp twin: only `uv` is read, the cap is
    // placed in the vertex stage.
    this.shellGeometry = new PlaneGeometry(1, 1, SHELL_AROUND, SHELL_DOWN);
    this.rings = [];
    for (let i = 0; i < MAX_PULSES; i++) {
      const material = createResonanceShellMaterial();
      const mesh = new Mesh(this.shellGeometry, material);
      mesh.name = `SonicRing${i}`;
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false; // the cap is built in the shader
      mesh.renderOrder = 13;
      mesh.visible = false;
      this.group.add(mesh);

      const warpMaterial = createResonanceWarpMaterial();
      const warp = new Mesh(this.shellGeometry, warpMaterial);
      warp.name = `SonicRingWarp${i}`;
      warp.layers.set(LAYER.DISTORTION);
      warp.frustumCulled = false;
      warp.visible = false;
      this.group.add(warp);

      this.rings.push({
        mesh,
        material,
        warp,
        warpMaterial,
        state: { radius: 1, fade: 0, seed: Math.random() * 10 },
        launched: false,
        landed: false,
        done: false,
        launchAge: 0,
        landAge: 0,
        distance: 0,
        dustAt: 0,
        rippleAt: 0
      });
    }

    /* ---- layer 6: the boom's floor ripple ---- */
    this.floorGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.floorMaterial = createResonanceFloorMaterial('color');
    this.floorWarpMaterial = createResonanceFloorMaterial('warp');
    this.floor = new Mesh(this.floorGeometry, this.floorMaterial);
    this.floor.name = 'SonicFloor';
    this.floor.layers.set(LAYER.VFX);
    this.floor.renderOrder = 6;
    this.floor.frustumCulled = false;
    this.floor.visible = false;
    this.group.add(this.floor);

    this.floorWarp = new Mesh(this.floorGeometry, this.floorWarpMaterial);
    this.floorWarp.name = 'SonicFloorWarp';
    this.floorWarp.layers.set(LAYER.DISTORTION);
    this.floorWarp.frustumCulled = false;
    this.floorWarp.visible = false;
    this.group.add(this.floorWarp);

    this._floorState = { quadSize: 1, front: 0, fade: 0 };

    // Per-cast clocks, reset in `onSpawn`; initialised so the HUD can read them.
    this._count = 0;
    this._ended = false;
    this._boomAge = -1;
    this._lastLaunch = -10;
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 3: dust ---- */
    // Non-additive: dust occludes, and an additive version is a pink haze.
    this.dust = particles.get('sonic.dust', {
      capacity: 2400,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.9
    });
    this.dust.uniforms.uEndSize.value = 2.6;
    this.dust.uniforms.uSizeIn.value = 0.1;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.4;

    /* ---- layer 5: muzzle rings ---- */
    this.muzzle = particles.get('sonic.muzzle', {
      capacity: 300,
      shape: ParticleShape.RING,
      additive: true,
      softFade: 0.2
    });
    this.muzzle.uniforms.uDrag.value = 3.0;
    this.muzzle.uniforms.uEndSize.value = 3.2;
    this.muzzle.uniforms.uSizeIn.value = 0.01;
    this.muzzle.uniforms.uFadeIn.value = 0.01;
    this.muzzle.uniforms.uFadeOut.value = 0.75;
    this.muzzle.uniforms.uGravity.value.set(0, 0, 0);
    this.muzzle.uniforms.uTurbulence.value = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get instanceCount() {
    let n = 0;
    for (let i = 0; i < this._count; i++) if (this.rings[i].mesh.visible) n++;
    return n + (this.floor.visible ? 1 : 0);
  }

  get impactDuration() {
    return Math.max(0.05, settings.sonic.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.05, settings.sonic.fadeTime);
  }

  /** The light beats with the train: a thump on every pulse that leaves. */
  lightShimmer() {
    const k = settings.sonic.lightThrob;
    const since = this.age - this._lastLaunch;
    return 1 - k * 0.6 + k * 1.2 * Math.exp(-since * 14);
  }

  /**
   * The train's own clock in place of the base front.
   *
   * Every launched ring integrates its own distance at the live cast speed;
   * the lead ring is the front everyone else reads (`u`, `position`), and the
   * frame the last ring lands is reported as the end.
   */
  advance(dt) {
    const c = settings.sonic;
    const speed = c.speed * settings.global.speed;
    const interval = Math.max(0, c.pulseInterval);

    let lead = 0;
    let allLanded = true;
    for (let i = 0; i < this._count; i++) {
      const ring = this.rings[i];

      if (!ring.launched) {
        if (this.age >= i * interval) this._launch(ring, i);
        else {
          allLanded = false;
          continue;
        }
      }

      if (!ring.landed) {
        ring.distance = Math.min(this.length, ring.distance + speed * dt);
        if (ring.distance >= this.length) {
          ring.landed = true;
          ring.landAge = this.age;
        }
      }
      if (!ring.landed) allLanded = false;
      lead = Math.max(lead, ring.distance);
    }

    this.front = lead;
    this.u = saturate(lead / this.length);
    this.pointAt(this.u, this.position);
    this.position.y = c.ringHeight;

    if (allLanded && !this._ended) {
      this._ended = true;
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.sonic;

    this._count = Math.max(1, Math.min(MAX_PULSES, Math.round(c.pulseCount)));
    this._ended = false;
    this._boomAge = -1;
    this._lastLaunch = -10;
    // The first ring launches inside `advance`, before `onTravel` runs.
    this._syncParticles();

    for (let i = 0; i < MAX_PULSES; i++) {
      const ring = this.rings[i];
      ring.launched = false;
      ring.landed = false;
      ring.done = false;
      ring.distance = 0;
      ring.dustAt = 0;
      ring.rippleAt = 0;
      ring.state.seed = Math.random() * 10;
      // Rim facing down the cast; set once, the line does not turn.
      ring.mesh.quaternion.setFromUnitVectors(_zAxis, this.direction);
      ring.warp.quaternion.copy(ring.mesh.quaternion);
      ring.mesh.visible = false;
      ring.warp.visible = false;
    }

    this.floor.visible = false;
    this.floorWarp.visible = false;
  }

  /** Where the train leaves the caster. */
  _handPoint(out) {
    const c = settings.sonic;
    out.copy(this.origin).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
    out.y = c.handHeight;
    return out;
  }

  /** One ring leaves the hand. */
  _launch(ring, index) {
    const c = settings.sonic;
    const g = settings.global;

    ring.launched = true;
    ring.launchAge = this.age;
    ring.distance = 0;
    this._lastLaunch = this.age;

    // The little rings off the hand: the mouth of the sound.
    this._handPoint(_hand);
    _emit.position = _hand;
    _emit.radius = 0.05;
    _emit.direction = this.direction;
    _emit.speed = c.muzzleSpeed;
    _emit.speedVariance = 0.3;
    _emit.spread = 0.15;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.4;
    _emit.sizeVariance = 0.25;
    _emit.life = c.muzzleLife;
    _emit.lifeVariance = 0.2;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.muzzle.emit(Math.round(c.muzzleRings * g.particleCount), _emit);

    // A tick per pulse, slightly heavier on the first.
    this.ctx.shake.add(c.pulseShake * (index === 0 ? 1.6 : 1) * g.cameraShake, 9, 34);
  }

  /* ------------------------------------------------------------------ */
  /* Resolving a ring — every metre from live settings                    */
  /* ------------------------------------------------------------------ */

  /** Ring centre at `s` (0..1) along the line. */
  _ringCentre(s, out) {
    const c = settings.sonic;
    this._handPoint(_hand);
    this.pointAt(1, _end).setY(c.ringHeight);
    out.lerpVectors(_hand, _end, s);
    // Height settles early: the ring drops from the hand to its cruising
    // height in the first stretch rather than sliding down the whole line.
    out.y = lerp(c.handHeight, c.ringHeight, Easing.outQuad(s));
    return out;
  }

  _ringRadius(s, index) {
    const c = settings.sonic;
    const r = lerp(c.ringStart, c.ringEnd, Math.pow(saturate(s), Math.max(0.05, c.ringCurve)));
    return Math.max(0.02, r * (1 - saturate(c.pulseShrink) * index));
  }

  /** Drive one ring's mesh, warp twin and ground effects. */
  _updateRing(ring, index, fadeAll) {
    const c = settings.sonic;
    if (!ring.launched || ring.done) return;

    const s = saturate(ring.distance / this.length);
    let radius = this._ringRadius(s, index);
    let fade = saturate((this.age - ring.launchAge) / Math.max(0.005, c.birthTime));
    fade *= Math.max(0, 1 - saturate(c.pulseDim) * index);

    if (ring.landed) {
      const t = saturate((this.age - ring.landAge) / Math.max(0.02, c.arriveFade));
      radius *= 1 + c.arriveGrow * Easing.outQuad(t);
      fade *= 1 - Easing.inQuad(t);
      if (t >= 1) {
        ring.done = true;
        ring.mesh.visible = false;
        ring.warp.visible = false;
        return;
      }
    }
    fade *= fadeAll;

    this._ringCentre(s, ring.mesh.position);
    ring.warp.position.copy(ring.mesh.position);
    ring.state.radius = radius;
    ring.state.fade = fade;
    ring.material.userData.sync(ring.state);
    ring.warpMaterial.userData.sync(ring.state);
    ring.mesh.visible = fade > 0.002;
    ring.warp.visible = ring.mesh.visible;

    if (!ring.landed) this._ringGroundFx(ring, index, radius);
  }

  /** Dust kicked out from under a passing ring, and ripples laid behind it. */
  _ringGroundFx(ring, index, radius) {
    const c = settings.sonic;
    const g = settings.global;
    const time = frame.uTime.value;

    const dustStep = Math.max(0.1, c.dustSpacing);
    while (ring.distance - ring.dustAt >= dustStep) {
      ring.dustAt += dustStep;
      const s = saturate(ring.dustAt / this.length);
      this.pointAt(s, _pos).setY(0.1);
      // Both sides: the ring pushes air out to its flanks, not ahead of it.
      for (let side = -1; side <= 1; side += 2) {
        _emit.position = _pos.addScaledVector(this.side, side * radius * 0.7);
        _emit.radius = 0.25;
        _emit.direction = _dir.copy(this.side).multiplyScalar(side).addScaledVector(_up, 0.35).normalize();
        _emit.speed = c.dustSpeed;
        _emit.speedVariance = 0.6;
        _emit.spread = 0.6;
        _emit.inherit = null;
        _emit.anchor = null;
        _emit.size = 0.6;
        _emit.sizeVariance = 0.5;
        _emit.life = c.dustLife;
        _emit.lifeVariance = 0.4;
        _emit.spin = 0.4;
        _emit.tint = null;
        _emit.time = time;
        this.dust.emit(Math.round(c.dustCount * g.particleCount), _emit);
        _pos.addScaledVector(this.side, -side * radius * 0.7);
      }
    }

    const every = Math.max(1, Math.round(c.rippleEvery));
    if (index % every !== 0) return;
    const rippleStep = Math.max(0.2, c.rippleSpacing);
    while (ring.distance - ring.rippleAt >= rippleStep) {
      ring.rippleAt += rippleStep;
      this.pointAt(saturate(ring.rippleAt / this.length), _pos);
      this.ctx.decals.spawn(DecalType.RIPPLE, _pos, {
        radius: radius * c.rippleRadius,
        life: c.rippleLife,
        width: c.rippleWidth,
        intensity: c.rippleIntensity,
        colorA: getColor(c.colorRippleA),
        colorB: getColor(c.colorRippleB),
        growth: 0.6
      });
    }
  }

  _syncParticles() {
    const c = settings.sonic;
    const g = settings.global;

    this.dust.setGradient(getColor(c.colorDustA), getColor(c.colorDustB), getColor(c.colorDustC), getColor(c.colorDustD));
    this.dust.uniforms.uGravity.value.set(0, c.dustRise, 0);
    this.dust.uniforms.uDrag.value = c.dustDrag;
    this.dust.uniforms.uSizeScale.value = (c.dustSize / 0.6) * g.particleSize;
    this.dust.uniforms.uLifeScale.value = g.particleLifetime;
    this.dust.uniforms.uSpeedScale.value = g.particleSpeed;
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    this.dust.uniforms.uTurbulence.value = c.dustTurbulence * g.turbulence;

    this.muzzle.setGradient(getColor(c.colorMuzzleA), getColor(c.colorMuzzleB), getColor(c.colorMuzzleC), getColor(c.colorMuzzleD));
    this.muzzle.uniforms.uSizeScale.value = (c.muzzleSize / 0.4) * g.particleSize;
    this.muzzle.uniforms.uLifeScale.value = g.particleLifetime;
    this.muzzle.uniforms.uSpeedScale.value = g.particleSpeed;
    this.muzzle.uniforms.uOpacity.value = g.opacity;
    this.muzzle.uniforms.uGlow.value = c.muzzleGlow * g.glow;
  }

  /** The boom's ripple running out across the floor. */
  _updateFloor(fadeAll) {
    const c = settings.sonic;
    const g = settings.global;
    if (this._boomAge < 0) return;

    const reach = Math.max(0.1, c.floorRadius * g.explosionIntensity);
    const t = saturate(this._boomAge / Math.max(0.05, c.floorTime));
    // The trailing wavelets need room behind the front, so the front overruns
    // the reach by the length of the train and the shader trims it.
    const trail = Math.max(1, Math.round(c.floorRings)) * c.floorWavelength;
    const state = this._floorState;
    state.front = Easing.outCubic(t) * (reach + trail);
    state.fade = (1 - Easing.inQuad(t)) * fadeAll;
    state.quadSize = (reach + c.floorWidth * 3) * 2;

    const visible = t < 1 && state.fade > 0.002;
    this.floor.visible = visible;
    this.floorWarp.visible = visible;
    if (!visible) return;

    this.pointAt(1, this.floor.position).setY(0.03);
    this.floorWarp.position.copy(this.floor.position);
    this.floor.scale.set(state.quadSize, 1, state.quadSize);
    this.floorWarp.scale.copy(this.floor.scale);
    this.floorMaterial.userData.sync(state);
    this.floorWarpMaterial.userData.sync(state);
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel() {
    this._syncParticles();
    for (let i = 0; i < this._count; i++) this._updateRing(this.rings[i], i, 1);
  }

  onImpact() {
    const c = settings.sonic;
    const g = settings.global;
    const time = frame.uTime.value;

    this._boomAge = 0;
    this.pointAt(1, _end);

    /* --- the shell of air --- */
    _pos.copy(_end).setY(c.ringHeight * 0.6);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: c.boomBurst * 0.15,
      endRadius: c.boomBurst * g.explosionIntensity,
      life: c.boomBurstLife,
      intensity: c.boomBurstIntensity,
      opacity: c.boomBurstOpacity,
      fresnel: 2.0,
      displace: 0.3,
      squash: 0.75,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    /* --- the ring that snaps out across the floor --- */
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _end, {
      radius: c.shockRadius * g.explosionIntensity,
      life: c.shockLife,
      width: c.shockWidth,
      intensity: 1.0,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });

    /* --- dust thrown out in a ring --- */
    const count = Math.round(c.boomDust * g.particleCount);
    const spokes = 10;
    for (let k = 0; k < spokes; k++) {
      const angle = (k / spokes) * Math.PI * 2 + Math.random() * 0.3;
      _dir.set(Math.cos(angle), 0.25, Math.sin(angle)).normalize();
      _emit.position = _pos.copy(_end).setY(0.15);
      _emit.radius = 0.6;
      _emit.direction = _dir;
      _emit.speed = c.dustSpeed * 2.8;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.35;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.8;
      _emit.sizeVariance = 0.5;
      _emit.life = c.dustLife * 1.3;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0.4;
      _emit.tint = null;
      _emit.time = time;
      this.dust.emit(Math.max(1, Math.round(count / spokes)), _emit);
    }

    /* --- the beat --- */
    this.position.copy(_end).setY(c.ringHeight);
    this.ctx.shake.add(c.boomShake * g.explosionIntensity * g.cameraShake, 1 / Math.max(0.1, c.boomShakeTime), 16);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.boomFlash * g.explosionIntensity);
    this.lightBoost = c.boomLight * g.explosionIntensity;
    this._lastLaunch = this.age;
  }

  onFade(dt, t) {
    this._syncParticles();
    const fadeAll = this.phase === AbilityPhase.FADE ? 1 - Easing.inQuad(saturate(t - 1)) : 1;
    this._boomAge += dt;

    for (let i = 0; i < this._count; i++) this._updateRing(this.rings[i], i, fadeAll);
    this._updateFloor(fadeAll);
  }

  onDestroy() {
    for (let i = 0; i < MAX_PULSES; i++) {
      const ring = this.rings[i];
      ring.mesh.visible = false;
      ring.warp.visible = false;
      ring.launched = false;
      ring.done = true;
    }
    this.floor.visible = false;
    this.floorWarp.visible = false;
    this._boomAge = -1;
    this._count = 0;
  }

  dispose() {
    for (const ring of this.rings) {
      ring.material.dispose();
      ring.warpMaterial.dispose();
    }
    this.shellGeometry.dispose();
    this.floorGeometry.dispose();
    this.floorMaterial.dispose();
    this.floorWarpMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const R = Editor.range;
  const folder = gui.addFolder('⦿  Resonance Pulse');

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 80, 0.5, 'ring speed (m/s)');
  R(cast, c, 'lifetime', 0.05, 6, 0.05, 'boom hangs for');
  R(cast, c, 'fadeTime', 0.05, 4, 0.05, 'settle time');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);
  R(cast, c, 'handForward', -1, 2, 0.01, 'hand forward (m)');
  R(cast, c, 'handSide', -1, 1, 0.01, 'hand side (m)');
  R(cast, c, 'handHeight', 0, 3, 0.01, 'hand height (m)');

  /* ---- layer 1 ---- */
  const rings = folder.addFolder('1 · Rings');
  const train = rings.addFolder('The train');
  R(train, c, 'pulseCount', 1, MAX_PULSES, 1, 'rings per cast');
  R(train, c, 'pulseInterval', 0, 0.6, 0.005, 'seconds between rings');
  R(train, c, 'pulseShrink', 0, 0.15, 0.005, 'later rings smaller by');
  R(train, c, 'pulseDim', 0, 0.15, 0.005, 'later rings dimmer by');

  const shape = rings.addFolder('Shape');
  R(shape, c, 'ringStart', 0.02, 3, 0.01, 'radius at the hand (m)');
  R(shape, c, 'ringEnd', 0.1, 8, 0.05, 'radius at the end (m)');
  R(shape, c, 'ringCurve', 0.1, 4, 0.01, 'how late it opens');
  R(shape, c, 'ringHeight', 0, 4, 0.01, 'height at the end (m)');
  R(shape, c, 'spread', 0.05, 1.5, 0.01, 'dome half-angle (rad)');
  R(shape, c, 'birthTime', 0.005, 0.5, 0.005, 'fade in (s)');
  R(shape, c, 'arriveGrow', 0, 2, 0.01, 'opens on landing by');
  R(shape, c, 'arriveFade', 0.02, 2, 0.01, 'dies on landing over (s)');

  const look = rings.addFolder('Shader');
  R(look, c, 'rimWidth', 0.005, 0.4, 0.001, 'rim width');
  R(look, c, 'rimBright', 0, 10, 0.05, 'rim brightness');
  R(look, c, 'chroma', 0, 0.2, 0.001, 'chromatic split');
  R(look, c, 'fresnelPower', 0.2, 8, 0.05, 'fresnel power');
  R(look, c, 'fresnelBright', 0, 4, 0.01, 'fresnel brightness');
  R(look, c, 'bodyOpacity', 0, 2, 0.01, 'body (bands) strength');
  R(look, c, 'bands', 0, 24, 0.1, 'interference bands');
  R(look, c, 'beat', 1, 3, 0.01, 'beat ratio');
  R(look, c, 'bandSpeed', 0, 60, 0.5, 'band speed');
  R(look, c, 'bandSharp', 0.5, 12, 0.1, 'band sharpness');
  R(look, c, 'lobes', 0, 16, 1, 'standing lobes');
  R(look, c, 'lobeDepth', 0, 1, 0.01, 'lobe depth');
  R(look, c, 'intensity', 0, 10, 0.05, 'intensity');
  R(look, c, 'opacity', 0, 1, 0.01, 'opacity');
  R(look, c, 'softFade', 0.01, 2, 0.01, 'soft fade (m)');
  look.addColor(c, 'colorRim').name('rim');
  look.addColor(c, 'colorBody').name('body');
  look.addColor(c, 'colorChromaR').name('chroma red');
  look.addColor(c, 'colorChromaG').name('chroma green');
  look.addColor(c, 'colorChromaB').name('chroma blue');

  /* ---- layer 2 ---- */
  const warp = folder.addFolder('2 · Warp');
  R(warp, c, 'warpStrength', 0, 5, 0.01, 'ring warp strength');
  R(warp, c, 'warpWidth', 0.01, 0.6, 0.005, 'ring warp band width');
  R(warp, c, 'warpBody', 0, 1, 0.01, 'warp across the shell');
  R(warp, c, 'boomWarp', 0, 5, 0.01, 'floor ripple warp');

  /* ---- layer 3 ---- */
  const dust = folder.addFolder('3 · Dust');
  R(dust, c, 'dustSpacing', 0.1, 4, 0.05, 'metres between puffs');
  R(dust, c, 'dustCount', 0, 30, 1, 'per puff');
  R(dust, c, 'boomDust', 0, 300, 1, 'thrown by the boom');
  R(dust, c, 'dustSize', 0.05, 3, 0.01, 'size');
  R(dust, c, 'dustLife', 0.1, 4, 0.05, 'lifetime');
  R(dust, c, 'dustSpeed', 0, 8, 0.05, 'speed');
  R(dust, c, 'dustRise', -2, 3, 0.05, 'rise');
  R(dust, c, 'dustDrag', 0, 8, 0.05, 'drag');
  R(dust, c, 'dustOpacity', 0, 1, 0.01, 'opacity');
  R(dust, c, 'dustTurbulence', 0, 4, 0.05, 'turbulence');
  Editor.gradient(dust, c, 'colorDust', 'Colour over life');

  /* ---- layer 4 ---- */
  const ripples = folder.addFolder('4 · Ripples');
  R(ripples, c, 'rippleSpacing', 0.2, 6, 0.05, 'metres between ripples');
  R(ripples, c, 'rippleEvery', 1, 6, 1, 'every Nth ring');
  R(ripples, c, 'rippleRadius', 0.1, 3, 0.01, 'radius (× ring)');
  R(ripples, c, 'rippleLife', 0.1, 3, 0.05, 'lifetime');
  R(ripples, c, 'rippleWidth', 0.01, 0.4, 0.005, 'line width');
  R(ripples, c, 'rippleIntensity', 0, 3, 0.01, 'intensity');
  ripples.addColor(c, 'colorRippleA').name('ripple inner');
  ripples.addColor(c, 'colorRippleB').name('ripple outer');

  /* ---- layer 5 ---- */
  const muzzle = folder.addFolder('5 · Muzzle');
  R(muzzle, c, 'muzzleRings', 0, 12, 1, 'rings per pulse');
  R(muzzle, c, 'muzzleSize', 0.05, 2, 0.01, 'size');
  R(muzzle, c, 'muzzleLife', 0.05, 1.5, 0.01, 'lifetime');
  R(muzzle, c, 'muzzleSpeed', 0, 10, 0.05, 'speed');
  R(muzzle, c, 'muzzleGlow', 0, 8, 0.05, 'glow');
  R(muzzle, c, 'pulseShake', 0, 0.3, 0.005, 'shake per pulse');
  Editor.gradient(muzzle, c, 'colorMuzzle', 'Colour over life');

  /* ---- layer 6 ---- */
  const boom = folder.addFolder('6 · Boom');
  R(boom, c, 'boomBurst', 0.2, 14, 0.05, 'air shell (m)');
  R(boom, c, 'boomBurstLife', 0.05, 2, 0.01, 'shell lifetime');
  R(boom, c, 'boomBurstIntensity', 0, 5, 0.05, 'shell intensity');
  R(boom, c, 'boomBurstOpacity', 0, 1, 0.01, 'shell opacity');
  boom.addColor(c, 'colorBurstA').name('shell core');
  boom.addColor(c, 'colorBurstB').name('shell body');
  boom.addColor(c, 'colorBurstC').name('shell edge');
  R(boom, c, 'shockRadius', 0.5, 16, 0.1, 'shockwave radius (m)');
  R(boom, c, 'shockLife', 0.1, 3, 0.05, 'shockwave lifetime');
  R(boom, c, 'shockWidth', 0.01, 0.4, 0.005, 'shockwave width');
  boom.addColor(c, 'colorShockA').name('shockwave inner');
  boom.addColor(c, 'colorShockB').name('shockwave outer');
  R(boom, c, 'floorRadius', 0.5, 25, 0.1, 'floor ripple reach (m)');
  R(boom, c, 'floorTime', 0.1, 4, 0.05, 'floor ripple time (s)');
  R(boom, c, 'floorRings', 1, 6, 1, 'floor wavelets');
  R(boom, c, 'floorWavelength', 0.1, 3, 0.05, 'wavelet spacing (m)');
  R(boom, c, 'floorWidth', 0.02, 1, 0.01, 'wavelet width (m)');
  R(boom, c, 'floorIntensity', 0, 8, 0.05, 'floor ripple intensity');
  R(boom, c, 'floorChroma', 0, 0.5, 0.005, 'floor chromatic split (m)');
  R(boom, c, 'boomShake', 0, 1.5, 0.01, 'camera kick');
  R(boom, c, 'boomShakeTime', 0.1, 2, 0.01, 'kick dies over (s)');
  R(boom, c, 'boomFlash', 0, 1, 0.01, 'flash');
  boom.addColor(c, 'colorFlash').name('flash colour');
  R(boom, c, 'boomLight', 0, 60, 0.5, 'light punch');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('light colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'light intensity');
  R(light, c, 'lightRadius', 0.5, 30, 0.1, 'light radius');
  R(light, c, 'lightThrob', 0, 1, 0.01, 'beats with the train');
}
