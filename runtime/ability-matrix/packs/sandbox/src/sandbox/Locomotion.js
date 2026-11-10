import { MathUtils, Vector3 } from 'three';
import { settings } from '../config/settings.js';
import { ParticleShape } from '../particles/ParticleSystem.js';
import { DecalType } from '../effects/GroundDecals.js';
import { frame } from '../core/FrameUniforms.js';
import { getColor } from '../utils/color.js';
import { clamp, saturate } from '../utils/math.js';

const TAU = Math.PI * 2;

const _wish = new Vector3();
const _forward = new Vector3();
const _right = new Vector3();
const _pos = new Vector3();
const _dir = new Vector3();
const _up = new Vector3(0, 1, 0);
const _emit = {};
/** Standing bodies near the caster, reused every frame. */
const _near = [];

/**
 * Native abilities that take the caster's body over while they run — they hide
 * it, carry it and set it down somewhere else. Walking is suspended until they
 * let go, or the two would fight over the same position.
 */
const BODY_OWNERS = new Set(['blink', 'voidstep', 'parallax', 'recall']);

/**
 * Walking, running and dashing the caster round the arena.
 *
 * Input is read straight off `InputManager#keys` every frame: W A S D or the
 * arrows move, Shift runs, Space dashes. Movement is relative to the camera by
 * default, so W always walks into the screen however the view is orbited.
 *
 * The body turns to face where it is going — unless an ability is armed, in
 * which case it keeps facing the aim and strafes (App's `turnToAim` already owns
 * the heading then), at `aimSpeed` of its normal pace. Casting on the move is
 * the point: the aim arrow and zone circle are re-anchored on the caster every
 * frame, so they travel with it.
 *
 * The rig has no walk clip, so this only produces *intent* — a velocity, a gait
 * phase and a weight — and hands it to the character as `character.gait`.
 * `SandboxCharacter` turns that into joint angles laid over the idle.
 *
 * Steering stands down while a summon is out (WASD drives the summon then) and
 * while a native ability owns the body (`BODY_OWNERS`).
 */
export class Locomotion {
  /**
   * @param {object} ctx { character, input, camera, dummies, particles, decals, shake }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.velocity = new Vector3();
    /** 0..1 how much of a walk/run the gait shows. */
    this.weight = 0;
    /** Gait cycle phase, radians. */
    this.phase = 0;
    this._dashTime = -1;
    this._dashCooldown = 0;
    this._dashDir = new Vector3(0, 0, 1);
    this._dashFrom = new Vector3();
    this._spaceWas = false;
    /** A dash asked for from outside (the bridge's `move('dash')`). */
    this._dashRequested = false;
    this._lastStep = 0;
    /** True when the last frame had steering input. */
    this.moving = false;

    this.dust = ctx.particles.get('move.dust', {
      capacity: 600,
      shape: ParticleShape.SMOKE,
      additive: false,
      lit: true,
      softFade: true
    });
    this.trail = ctx.particles.get('move.trail', {
      capacity: 400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: 1
    });
  }

  /** Dash on the next frame, as if Space had been pressed. */
  requestDash() {
    this._dashRequested = true;
  }

  get dashing() {
    return this._dashTime >= 0;
  }

  /**
   * @param {number} dt simulation delta (0 while paused: nothing moves)
   * @param {object} state { aiming, aimFacing, locked }
   */
  update(dt, { aiming = false, locked = false, abilities = [], speedMultiplier = 1 } = {}) {
    const c = settings.move;
    const character = this.ctx.character;
    const keys = this.ctx.input.keys;

    let owned = locked;
    for (const ability of abilities) if (BODY_OWNERS.has(ability.element)) owned = true;
    const enabled = c.enabled && !owned && character.root.visible;

    /* ---- what the keys ask for ---- */
    let ix = 0;
    let iz = 0;
    if (enabled) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
      const analog = this.ctx.input.analog;
      if (analog) {
        ix += analog.x || 0;
        iz += analog.z || 0;
      }
    }
    const running = keys.has('ShiftLeft') || keys.has('ShiftRight') || !!this.ctx.input.runLock;
    const space = enabled && keys.has('Space');
    const pressedDash = (space && !this._spaceWas) || (enabled && this._dashRequested);
    this._spaceWas = space;
    if (dt > 0) this._dashRequested = false;

    if (c.cameraRelative) {
      this.ctx.camera.getWorldDirection(_forward);
      _forward.y = 0;
      if (_forward.lengthSq() < 1e-6) _forward.set(0, 0, 1);
      _forward.normalize();
    } else {
      _forward.set(0, 0, 1);
    }
    _right.crossVectors(_forward, _up); // screen right, on the floor
    _wish.set(0, 0, 0).addScaledVector(_forward, iz).addScaledVector(_right, ix);
    const hasInput = _wish.lengthSq() > 0;
    if (hasInput) _wish.normalize();
    this.moving = hasInput;

    let topSpeed = running ? c.runSpeed : c.walkSpeed;
    topSpeed *= speedMultiplier;
    if (aiming) topSpeed *= c.aimSpeed;
    _wish.multiplyScalar(topSpeed);

    if (dt <= 0) {
      // Paused: hold the pose exactly where it is.
      this._publish(character);
      return;
    }

    /* ---- dash ---- */
    this._dashCooldown = Math.max(0, this._dashCooldown - dt);
    if (pressedDash && this._dashCooldown <= 0 && !this.dashing) {
      if (hasInput) this._dashDir.copy(_wish).normalize();
      else this._dashDir.set(Math.sin(character.facing), 0, Math.cos(character.facing));
      this._dashTime = 0;
      this._dashCooldown = c.dashCooldown + c.dashTime;
      this._dashFrom.copy(character.position);
      this._kick(character.position, this._dashDir, 1);
      if (!aiming) character.setFacing(Math.atan2(this._dashDir.x, this._dashDir.z));
    }

    if (this.dashing) {
      const duration = Math.max(0.05, c.dashTime);
      const t0 = this._dashTime / duration;
      this._dashTime += dt;
      const t1 = Math.min(1, this._dashTime / duration);
      // Ease-out: most of the distance in the first half, then it skids home.
      const ease = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
      const step = (ease(t1) - ease(t0)) * c.dashDistance * speedMultiplier;
      character.position.addScaledVector(this._dashDir, step);
      this.velocity.copy(this._dashDir).multiplyScalar(c.dashDistance / duration * (1 - t1));
      this._trail(character.position, dt);
      if (t1 >= 1) {
        this._dashTime = -1;
        this._kick(character.position, this._dashDir, 0.6);
      }
    } else {
      /* ---- walk / run ---- */
      const rate = hasInput ? c.acceleration : c.deceleration;
      _dir.copy(_wish).sub(this.velocity);
      const gap = _dir.length();
      if (gap > 1e-5) this.velocity.addScaledVector(_dir, Math.min(1, (rate * dt) / gap));
      character.position.addScaledVector(this.velocity, dt);
    }

    /* ---- keep out of bodies and inside the arena ---- */
    this._collide(character.position, c.bodyRadius);
    const r = Math.hypot(character.position.x, character.position.z);
    if (r > c.arenaRadius) {
      character.position.x *= c.arenaRadius / r;
      character.position.z *= c.arenaRadius / r;
    }
    character.position.y = 0;

    /* ---- heading ---- */
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (!aiming && speed > 0.3 && !this.dashing) {
      const yaw = Math.atan2(this.velocity.x, this.velocity.z);
      character.turnToward(yaw, c.turnRate, dt);
    }

    /* ---- gait ---- */
    const target = saturate(speed / Math.max(0.1, c.walkSpeed * 0.6));
    const k = 1 - Math.exp(-dt / Math.max(0.01, c.blendTime));
    this.weight += (target - this.weight) * k;
    const run = this.runBlend;
    const stride = MathUtils.lerp(c.stride, c.runStride, run);
    this.phase = (this.phase + (speed / Math.max(0.2, stride)) * TAU * dt) % TAU;

    // A footfall every half cycle: dust at the planted foot while running.
    const half = Math.floor(this.phase / Math.PI);
    if (half !== this._lastStep) {
      this._lastStep = half;
      if (c.footDust && run > 0.5 && !this.dashing) this._footfall(character, half);
    }

    this._publish(character);
  }

  /** 0 at walking pace, 1 at a full run. */
  get runBlend() {
    const c = settings.move;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    return saturate((speed - c.walkSpeed) / Math.max(0.1, c.runSpeed - c.walkSpeed));
  }

  /** Hand the gait to the character for its bones. */
  _publish(character) {
    const gait = character.gait;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    gait.weight = this.weight;
    gait.phase = this.phase;
    gait.run = this.runBlend;
    gait.dash = this.dashing ? 1 - saturate(this._dashTime / Math.max(0.05, settings.move.dashTime)) : 0;
    if (speed > 1e-3) gait.dir.set(this.velocity.x / speed, 0, this.velocity.z / speed);
    else if (this.dashing) gait.dir.copy(this._dashDir);
  }

  /** Push the caster out of every standing body it walked into. */
  _collide(position, radius) {
    const dummies = this.ctx.dummies;
    if (!dummies?.findTargets) return;
    const reach = radius + settings.dummies.bodyRadius;
    dummies.findTargets(position.x, position.z, radius, _near);
    for (const dummy of _near) {
      const dx = position.x - dummy.position.x;
      const dz = position.z - dummy.position.z;
      const d = Math.hypot(dx, dz);
      if (d >= reach) continue;
      if (d < 1e-4) {
        position.x += reach;
        continue;
      }
      const push = (reach - d) / d;
      position.x += dx * push;
      position.z += dz * push;
      // Bleed off the velocity going into the body so it slides round it.
      const vn = (this.velocity.x * dx + this.velocity.z * dz) / d;
      if (vn < 0) {
        this.velocity.x -= (vn * dx) / d;
        this.velocity.z -= (vn * dz) / d;
      }
    }
    _near.length = 0;
  }

  /** Dust ring + puff where a dash starts or lands. */
  _kick(at, dir, strength) {
    const c = settings.move;
    const g = settings.global;
    if (!c.dashDust) return;
    _pos.set(at.x, 0.02, at.z);
    this.ctx.decals.spawn(DecalType.DUSTRING, _pos, {
      radius: 1.3 * strength + 0.4,
      life: 0.7,
      intensity: 0.45 * strength,
      colorA: getColor(c.colorDust),
      colorB: getColor(c.colorDust)
    });
    this._dustUniforms();
    _pos.set(at.x, 0.25, at.z);
    _dir.copy(dir).multiplyScalar(-1).setY(0.35).normalize();
    Object.assign(_emit, {
      position: _pos,
      radius: 0.35,
      direction: _dir,
      speed: 2.6 * strength,
      speedVariance: 0.5,
      spread: 0.9,
      inherit: null,
      anchor: null,
      size: 0.55,
      sizeVariance: 0.4,
      life: 0.9,
      lifeVariance: 0.3,
      spin: 1,
      tint: null,
      time: frame.uTime.value
    });
    this.dust.emit(Math.round(26 * strength * g.particleCount), _emit);
    this.ctx.shake.add(0.06 * strength * g.cameraShake, 6, 18);
  }

  _footfall(character, half) {
    const c = settings.move;
    const g = settings.global;
    this._dustUniforms();
    // Alternate feet: a little to either side of the line of travel.
    const side = half % 2 === 0 ? 1 : -1;
    const dir = character.gait.dir;
    _pos.set(character.position.x - dir.z * 0.12 * side, 0.08, character.position.z + dir.x * 0.12 * side);
    _dir.set(-dir.x, 0.6, -dir.z).normalize();
    Object.assign(_emit, {
      position: _pos,
      radius: 0.08,
      direction: _dir,
      speed: 0.9,
      speedVariance: 0.5,
      spread: 0.8,
      inherit: null,
      anchor: null,
      size: 0.28,
      sizeVariance: 0.4,
      life: 0.6,
      lifeVariance: 0.3,
      spin: 0.6,
      tint: null,
      time: frame.uTime.value
    });
    this.dust.emit(Math.max(1, Math.round(4 * g.particleCount)), _emit);
    void c;
  }

  /** Streaks shed along a dash. */
  _trail(at, dt) {
    const c = settings.move;
    const g = settings.global;
    const count = Math.round(c.dashTrail * g.particleCount * dt / Math.max(0.05, c.dashTime));
    if (count <= 0) return;
    const u = this.trail.uniforms;
    u.uDrag.value = 4;
    u.uGravity.value.set(0, 0, 0);
    u.uEndSize.value = 0.2;
    const col = getColor(c.colorTrail);
    this.trail.setGradient(col, col, col, col);
    _pos.set(at.x, 0.9, at.z);
    _dir.copy(this._dashDir).multiplyScalar(-1);
    Object.assign(_emit, {
      position: _pos,
      radius: 0.45,
      direction: _dir,
      speed: 3,
      speedVariance: 0.4,
      spread: 0.15,
      inherit: null,
      anchor: null,
      size: 0.035,
      sizeVariance: 0.3,
      life: 0.28,
      lifeVariance: 0.3,
      spin: 0,
      tint: null,
      time: frame.uTime.value
    });
    this.trail.emit(clamp(count, 1, 40), _emit);
  }

  _dustUniforms() {
    const u = this.dust.uniforms;
    u.uDrag.value = 2.2;
    u.uGravity.value.set(0, 0.25, 0);
    u.uEndSize.value = 2.4;
    const col = getColor(settings.move.colorDust);
    this.dust.setGradient(col, col, col, col);
    if (u.uOpacity) u.uOpacity.value = 0.35;
  }

  reset() {
    this.velocity.set(0, 0, 0);
    this.weight = 0;
    this._dashTime = -1;
  }
}
