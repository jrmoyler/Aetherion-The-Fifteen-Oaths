import { Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createShearWallMaterial,
  createShearLensMaterial,
  createShearGroundMaterial
} from '../../materials/codex/ShearWallMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing } from '../../utils/math.js';

export const ID = 'shearwall';

/** Bodies one cast remembers having thrown, so the wall does not juggle them. */
const MAX_THROWN = 24;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _end = new Vector3();

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

/** 0..1 → 0..1 with an adjustable spring past the end (0 = outCubic). */
function springCurve(k, overshoot) {
  const c1 = Math.max(0, overshoot) * 2.6;
  const t = k - 1;
  return 1 + (c1 + 1) * t * t * t + c1 * t * t;
}

/**
 * SHEAR WALL — Wind, line cast.
 *
 * A **wall of air** stands up a metre in front of the caster — six metres
 * across, three tall, square on to the line — and **ploughs** down it. It is
 * not a flat sheet: in plan it is **pleated** like a folding screen, so every
 * fold catches the light, and its ends trail a little behind the middle. In
 * elevation it is cut into **rows**, and the rows **shear**: alternate layers
 * are shoved sideways in opposite directions, and every sixth of a second the
 * whole wall **snaps** — each row jerks across to the other side on a spring,
 * the seams between the rows flash white, wind lines whip sideways out of the
 * seams, grit is flung, and the camera takes a small knock. Inside each row
 * the air visibly streams sideways, alternate rows opposite ways, so even a
 * still frame reads as layers sliding past each other.
 *
 * Dust rolls up at its foot, and behind it the floor is **dragged**: parallel
 * scrape grooves that step sideways at every place the wall snapped, glowing
 * fresh near the wall. Whatever the wall reaches is thrown **sideways** off
 * the line, away from its middle, with a little of the wall's push.
 *
 * At the end of the line the wall **tears in two**: the halves slide apart
 * laterally and dissolve, an AIR shell and a shockwave go off, the camera is
 * knocked; the grooves erode.
 *
 * It is not Gale Sever (a crescent blade) nor Downburst/Tempest (columns): it
 * is a broad, layered barrier faced from behind — the silhouette is a wall.
 *
 * ## Layers
 *
 *   1. **the wall** (`createShearWallMaterial`) — a grid pleated, row-sheared
 *      and torn in the vertex stage, sideways-streaming air in the fragment.
 *   2. **the lens** (`createShearLensMaterial`) — the wall again, deeper, on
 *      `LAYER.DISTORTION`, shoving the world sideways row by row.
 *   3. **drag marks** (`createShearGroundMaterial`) — the stepped grooves.
 *   4. **dust** (SMOKE, non-additive) rolled up at the foot, **grit** (CHIP,
 *      lit) flung off it, **wind lines** (STREAK) whipped out of the seams.
 *   5. **the beat** — a knock and a flash of the seams on every snap; at the
 *      tear an AIR shell, a SHOCKWAVE, a DUSTRING, a flash, a light punch.
 *
 * ## The editor rule
 *
 * A cast captures a seed, the integrated sideways flow, and the snap state
 * (the side it last snapped to, how long ago). Everything else — the wall's
 * size, folds, rows, how far a row is shoved, the timing — is resolved from
 * `settings.shearwall` every frame.
 */
export class ShearWallAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The wall throws bodies sideways, not where the default capsule would. */
  get handlesOwnHits() {
    return true;
  }

  /** Snaps so far. HUD readout only. */
  get instanceCount() {
    return this._snaps;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    // x −0.5..0.5 across, y 0..1 up — dense across for the pleats.
    this.wallGeometry = new PlaneGeometry(1, 1, 120, 32);
    this.wallGeometry.translate(0, 0.5, 0);
    this.groundGeometry = new PlaneGeometry(1, 2, 1, 1);
    this.groundGeometry.translate(0.5, 0, 0);

    this.groundMaterial = createShearGroundMaterial();
    this.ground = this._mesh(this.groundGeometry, this.groundMaterial, LAYER.VFX, 2);

    this.wallMaterial = createShearWallMaterial();
    this.wall = this._mesh(this.wallGeometry, this.wallMaterial, LAYER.VFX, 14);

    this.lensMaterial = createShearLensMaterial();
    this.lens = this._mesh(this.wallGeometry, this.lensMaterial, LAYER.DISTORTION, 0);

    /** Scratch state handed to the materials — reused. */
    this._wallState = {
      center: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      shift: 0,
      split: 0,
      grow: 1,
      seed: 0,
      flow: 0,
      flash: 0,
      dissolve: 0,
      fade: 1
    };
    this._groundState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      length: 1,
      reach: 0,
      snapSpacing: 2,
      erode: 0,
      seed: 0
    };

    this._seed = 0;
    this._flow = 0;
    this._along = 0;
    this._snapClock = 0;
    this._snapAge = 1;
    this._snapSign = 1;
    this._prevShift = 0;
    this._shift = 0;
    this._snaps = 0;
    this._split = 0;

    this._found = [];
    this._thrown = [];
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

    this.dust = particles.get('shearwall.dust', {
      capacity: 1800,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.7
    });
    this.dust.uniforms.uDrag.value = 1.6;
    this.dust.uniforms.uEndSize.value = 2.4;
    this.dust.uniforms.uSizeIn.value = 0.15;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.6;

    this.streaks = particles.get('shearwall.streak', {
      capacity: 1600,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.streaks.uniforms.uDrag.value = 2.2;
    this.streaks.uniforms.uEndSize.value = 0.4;
    this.streaks.uniforms.uSizeIn.value = 0.03;
    this.streaks.uniforms.uFadeIn.value = 0.05;
    this.streaks.uniforms.uFadeOut.value = 0.5;

    this.chips = particles.get('shearwall.chip', {
      capacity: 800,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.1
    });
    this.chips.uniforms.uDrag.value = 0.6;
    this.chips.uniforms.uEndSize.value = 0.7;
    this.chips.uniforms.uSizeIn.value = 0.02;
    this.chips.uniforms.uFadeIn.value = 0.01;
    this.chips.uniforms.uFadeOut.value = 0.3;

    this.dustEmitter = new RateEmitter();
    this.chipEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the tear. */
  get impactDuration() {
    return Math.max(0.05, settings[ID].tearTime * settings.global.lifetime);
  }

  /** The fade is the halves dissolving, then the grooves eroding. */
  get fadeDuration() {
    const c = settings[ID];
    return Math.max(0.1, (Math.max(0.05, c.lifetime) + Math.max(0.05, c.groundFade)) * settings.global.lifetime);
  }

  /** The light jolts on every snap. */
  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f + f * (0.6 + 0.8 * Math.exp(-this._snapAge * 10));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 10;
    this._flow = 0;
    this._along = 0;
    this._snapClock = 0;
    this._snapAge = 1;
    this._snapSign = Math.random() < 0.5 ? 1 : -1;
    this._prevShift = 0;
    this._shift = 0;
    this._snaps = 0;
    this._split = 0;
    this._thrown.length = 0;
    this.dustEmitter.reset();
    this.chipEmitter.reset();
    this.wall.visible = false;
    this.lens.visible = false;
    this.ground.visible = false;
  }

  /** Metres down the line the wall's foot stands. */
  _wallAlong() {
    const c = settings[ID];
    return Math.min(this.length, Math.max(c.startDistance, this.front));
  }

  /* ------------------------------------------------------------------ */
  /* The shear                                                           */
  /* ------------------------------------------------------------------ */

  /** Advance the snap clock; on a snap, latch the new side and fire the beat. */
  _updateShear(dt, allowSnap) {
    const c = settings[ID];
    const g = settings.global;
    this._flow += dt * c.flowSpeed * g.noiseSpeed;
    this._snapAge += dt;
    if (allowSnap) {
      this._snapClock += dt;
      const interval = Math.max(0.03, c.snapInterval);
      if (this._snapClock >= interval) {
        this._snapClock -= interval;
        this._prevShift = this._shift;
        this._snapSign = -this._snapSign;
        this._snapAge = 0;
        this._snaps++;
        this._snapFx();
      }
    }
    const k = saturate(this._snapAge / Math.max(0.01, c.snapTime));
    const target = this._snapSign * c.shearAmount * g.randomness;
    this._shift = this._prevShift + (target - this._prevShift) * springCurve(k, c.snapSpring);
  }

  _sync(grow, dissolve, fade, erode) {
    const c = settings[ID];
    const g = settings.global;
    const st = this._wallState;
    this.pointAt(this._along / this.length, st.center);
    st.dir.copy(this.direction);
    st.side.copy(this.side);
    st.shift = this._shift;
    st.split = this._split;
    st.grow = grow;
    st.seed = this._seed;
    st.flow = this._flow;
    st.flash = Math.exp(-this._snapAge * 12);
    st.dissolve = dissolve;
    st.fade = fade;
    this.wallMaterial.userData.sync(st);
    this.lensMaterial.userData.sync(st);

    const gs = this._groundState;
    gs.start.copy(this.origin);
    gs.dir.copy(this.direction);
    gs.side.copy(this.side);
    gs.length = this.length + 1;
    gs.reach = this._along;
    gs.snapSpacing = c.speed * g.speed * Math.max(0.03, c.snapInterval);
    gs.erode = erode;
    gs.seed = this._seed;
    this.groundMaterial.userData.sync(gs);

    syncSystem(this.dust, c.colorDustA, c.colorDustB, c.colorDustC, c.colorDustD, c.dustSize, 1, 0.6);
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    this.dust.uniforms.uGravity.value.set(0, 0.25, 0);
    syncSystem(this.streaks, c.colorStreakA, c.colorStreakB, c.colorStreakC, c.colorStreakD, c.streakSize, 2 * g.glow, 0.1);
    this.streaks.uniforms.uStretch.value = c.streakStretch;
    this.streaks.uniforms.uGravity.value.set(0, 0, 0);
    syncSystem(this.chips, c.colorChipA, c.colorChipB, c.colorChipC, c.colorChipD, c.chipSize, 1, 0.05);
    this.chips.uniforms.uGravity.value.set(0, -12, 0);
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

  /** One snap: wind lines whipped sideways out of the seams, grit, a knock. */
  _snapFx() {
    const c = settings[ID];
    const g = settings.global;
    const rows = Math.max(1, Math.round(c.rows));
    const halfW = c.wallWidth * 0.5;
    const count = Math.round(c.streakCount * g.particleCount);
    this.pointAt(this._along / this.length, _end);
    this._fillEmit(_pos, 0.1, _dir, c.streakSpeed, 0.08, 0.06, c.streakLife, 0);
    for (let k = 0; k < count; k++) {
      const seam = 1 + ((Math.random() * Math.max(1, rows - 1)) | 0);
      const sign = seam % 2 === 0 ? -this._snapSign : this._snapSign;
      _pos.copy(_end).addScaledVector(this.side, (Math.random() - 0.5) * 2 * halfW);
      _pos.y = (seam / rows) * c.wallHeight;
      _dir.copy(this.side).multiplyScalar(sign).addScaledVector(this.direction, 0.25);
      _emit.position = _pos;
      _emit.direction = _dir;
      this.streaks.emit(1, _emit);
    }
    this.ctx.shake.add(c.snapShake * g.cameraShake, 9, 30);
    this.lightBoost = Math.max(this.lightBoost, c.impactLight * 0.12 * g.explosionIntensity);
  }

  /** Dust rolled up and grit flung off the wall's foot. */
  _footFx(dt, strength) {
    const c = settings[ID];
    const g = settings.global;
    const halfW = c.wallWidth * 0.5;
    this.pointAt(this._along / this.length, _end);
    const count = Math.round(this.dustEmitter.tick(dt, c.dustRate * strength) * g.particleCount);
    if (count > 0) {
      this._fillEmit(_pos, 0.3, _dir, c.dustSpeed, 0.35, 0.5, c.dustLife, 0.5);
      for (let k = 0; k < count; k++) {
        const u = (Math.random() - 0.5) * 2;
        _pos.copy(_end).addScaledVector(this.side, u * halfW).setY(0.25);
        _dir.copy(this.direction).addScaledVector(this.side, this._snapSign * 0.6).setY(0.6);
        _emit.position = _pos;
        _emit.direction = _dir;
        this.dust.emit(1, _emit);
      }
    }
    const chips = Math.round(this.chipEmitter.tick(dt, c.chipRate * strength) * g.particleCount);
    if (chips > 0) {
      this._fillEmit(_pos, 0.2, _dir, c.chipSpeed, 0.4, 0.07, c.chipLife, 10);
      for (let k = 0; k < chips; k++) {
        const u = (Math.random() - 0.5) * 2;
        _pos.copy(_end).addScaledVector(this.side, u * halfW).setY(0.1);
        _dir.copy(this.side).multiplyScalar(Math.sign(u) || 1).addScaledVector(this.direction, 0.5).setY(0.7);
        _emit.position = _pos;
        _emit.direction = _dir;
        this.chips.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* The bodies                                                          */
  /* ------------------------------------------------------------------ */

  /** Throw whatever the wall's foot is crossing sideways off the line. */
  _sweep(depth, impulseScale) {
    const c = settings[ID];
    const g = settings.global;
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const halfW = c.wallWidth * 0.5 + 0.3;
    this.pointAt(this._along / this.length, _end);
    const found = field.findTargets(_end.x, _end.z, halfW + depth, this._found);
    for (let f = 0; f < found.length; f++) {
      const dummy = found[f];
      if (this._wasThrown(dummy)) continue;
      _dir.set(dummy.position.x - _end.x, 0, dummy.position.z - _end.z);
      const along = _dir.dot(this.direction);
      const lateral = _dir.dot(this.side);
      if (Math.abs(along) > depth || Math.abs(lateral) > halfW) continue;
      const sign = Math.abs(lateral) < 0.25 ? this._snapSign : Math.sign(lateral);
      _dir.copy(this.side).multiplyScalar(sign).addScaledVector(this.direction, c.hitForward).normalize();
      this._force.impulse = c.hitImpulse * impulseScale * g.explosionIntensity;
      this._force.lift = c.hitLift * g.explosionIntensity;
      this._force.spin = c.hitSpin;
      if (dummy.kill(_dir.x, _dir.z, this._force) && this._thrown.length < MAX_THROWN) this._thrown.push(dummy);
    }
    this._found.length = 0;
  }

  _wasThrown(dummy) {
    for (let i = 0; i < this._thrown.length; i++) if (this._thrown[i] === dummy) return true;
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._along = this._wallAlong();
    this._updateShear(dt, true);
    const grow = 0.25 + 0.75 * Easing.outBack(saturate(this.age / Math.max(0.02, c.formTime)));
    this._split = 0;
    this._sync(grow, 0, 1, 0);
    this.wall.visible = true;
    this.lens.visible = true;
    this.ground.visible = true;

    this._footFx(dt, 1);
    this._sweep(Math.max(0.1, c.hitDepth), 1);
    this.ctx.shake.rumble(c.travelRumble * g.cameraShake, dt);
    this.pointAt(this._along / this.length, this.position);
    this.position.y = c.wallHeight * 0.5;
  }

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._along = this.length;
    this.pointAt(1, _end);
    this.ctx.shake.add(c.impactShake * power, 4, 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.impactLight * power;
    this.ctx.bursts.spawn(BurstMode.AIR, _pos.copy(_end).setY(c.wallHeight * 0.45), {
      radius: 0.4,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1.5,
      opacity: 0.8 * g.opacity,
      squash: 0.6,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _end, {
      radius: c.shockRadius * power,
      life: c.shockLife,
      width: 0.06,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _end, {
      radius: c.wallWidth * 0.6,
      life: 1.2,
      intensity: 0.8,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustC),
      growth: 0.5,
      height: 0.025
    });
    // Wind lines torn out sideways both ways, where the halves part.
    this._fillEmit(_pos.copy(_end).setY(c.wallHeight * 0.5), 1.2, this.side, c.streakSpeed * 1.2, 0.3, 0.07, c.streakLife * 1.5, 0);
    this.streaks.emit(Math.round(40 * g.particleCount), _emit);
    _dir.copy(this.side).negate();
    _emit.direction = _dir;
    this.streaks.emit(Math.round(40 * g.particleCount), _emit);
    this._sweep(Math.max(0.1, c.hitDepth) * 2, 1.3);
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    this._along = this.length;
    this._updateShear(dt, false);
    let dissolve = 0;
    let erode = 0;
    let fade = 1;
    if (this.phase === AbilityPhase.IMPACT) {
      this._split = c.tearDistance * Easing.outCubic(t);
      this._footFx(dt, 1 - t);
    } else {
      this._split = c.tearDistance * (1 + (t - 1) * 0.25);
      const dt2 = Math.max(0.05, c.lifetime) * g.lifetime;
      dissolve = saturate(this.fadeTime / dt2);
      fade = 1 - Easing.inQuad(dissolve);
      const fd = this.fadeDuration;
      const gf = Math.max(0.05, c.groundFade) * g.lifetime;
      erode = saturate((this.fadeTime - (fd - gf)) / gf);
    }
    this._sync(1, dissolve, fade, erode);
    this.wall.visible = dissolve < 1;
    this.lens.visible = dissolve < 1;
    this.ground.visible = erode < 1;
    this.pointAt(1, this.position);
    this.position.y = c.wallHeight * 0.5;
  }

  onDestroy() {
    this._thrown.length = 0;
    this.wall.visible = false;
    this.lens.visible = false;
    this.ground.visible = false;
  }

  dispose() {
    this.wallGeometry.dispose();
    this.groundGeometry.dispose();
    this.wallMaterial.dispose();
    this.lensMaterial.dispose();
    this.groundMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('▤  Shear Wall');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'wall speed (m/s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const shape = folder.addFolder('1 · Wall shape');
  R(shape, c, 'startDistance', 0, 5, 0.05, 'stands up at (m)');
  R(shape, c, 'formTime', 0.02, 1, 0.01, 'stands up over (s)');
  R(shape, c, 'wallWidth', 0.5, 14, 0.05, 'width (m)');
  R(shape, c, 'wallHeight', 0.3, 8, 0.05, 'height (m)');
  R(shape, c, 'pleats', 0.5, 12, 0.05, 'pleats');
  R(shape, c, 'pleatDepth', 0, 2, 0.01, 'pleat depth (m)');
  R(shape, c, 'rows', 1, 10, 1, 'rows');
  R(shape, c, 'wallBow', -2, 3, 0.01, 'ends trail (m)');
  R(shape, c, 'wallLean', -2, 2, 0.01, 'top leans (m)');

  const shear = folder.addFolder('2 · The shear');
  R(shear, c, 'shearAmount', 0, 3, 0.01, 'row shove (m)');
  R(shear, c, 'snapInterval', 0.03, 1, 0.005, 'snap every (s)');
  R(shear, c, 'snapTime', 0.01, 0.5, 0.005, 'snap over (s)');
  R(shear, c, 'snapSpring', 0, 2, 0.01, 'snap overshoot');
  R(shear, c, 'flowSpeed', 0, 40, 0.1, 'sideways flow (m/s)');

  const look = folder.addFolder('3 · Wall look');
  R(look, c, 'streakScale', 0.1, 6, 0.05, 'streak scale');
  R(look, c, 'streakGlow', 0, 10, 0.05, 'streak glow');
  R(look, c, 'bodyGlow', 0, 4, 0.01, 'body glow');
  R(look, c, 'ridgeGlow', 0, 8, 0.05, 'ridge glow');
  R(look, c, 'seamGlow', 0, 10, 0.05, 'seam glow');
  R(look, c, 'topTear', 0, 1, 0.01, 'torn top');
  R(look, c, 'footFade', 0.01, 0.6, 0.01, 'foot feather');
  R(look, c, 'softFade', 0.01, 2, 0.01, 'soft fade (m)');
  R(look, c, 'wallOpacity', 0, 2, 0.01, 'opacity');
  look.addColor(c, 'colorAirA').name('streaks');
  look.addColor(c, 'colorAirB').name('air');
  look.addColor(c, 'colorAirC').name('air, deep');
  look.addColor(c, 'colorSeam').name('seams');
  const lens = look.addFolder('Lens (distortion)');
  R(lens, c, 'lensWarp', 0, 3, 0.01, 'strength');
  R(lens, c, 'lensDepth', 0.2, 4, 0.01, 'depth (× pleats)');

  const tear = folder.addFolder('4 · The tear');
  R(tear, c, 'tearTime', 0.05, 2, 0.01, 'halves part over (s)');
  R(tear, c, 'tearDistance', 0, 10, 0.05, 'each half slides (m)');
  R(tear, c, 'lifetime', 0.05, 4, 0.05, 'dissolves over (s)');

  const floor = folder.addFolder('5 · Drag marks');
  R(floor, c, 'groundStep', 0, 2, 0.01, 'groove step (m)');
  R(floor, c, 'grooveDensity', 0.2, 10, 0.05, 'grooves / m');
  R(floor, c, 'grooveGlow', 0, 6, 0.05, 'fresh glow');
  R(floor, c, 'groundScour', 0, 1, 0.01, 'scour darkening');
  R(floor, c, 'freshLength', 0.05, 10, 0.05, 'fresh length (m)');
  R(floor, c, 'groundFade', 0.05, 3, 0.05, 'erodes over (s)');
  floor.addColor(c, 'colorScour').name('scoured floor');
  floor.addColor(c, 'colorGroove').name('grooves');

  const parts = folder.addFolder('6 · Particles');
  R(parts, c, 'dustRate', 0, 500, 1, 'dust / s');
  R(parts, c, 'dustSize', 0.05, 3, 0.05, 'dust size');
  R(parts, c, 'dustSpeed', 0, 10, 0.05, 'dust speed');
  R(parts, c, 'dustLife', 0.1, 4, 0.05, 'dust lifetime');
  R(parts, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(parts, c, 'colorDust', 'dust colour');
  R(parts, c, 'streakCount', 0, 120, 1, 'wind lines per snap');
  R(parts, c, 'streakSize', 0.005, 0.3, 0.005, 'line size');
  R(parts, c, 'streakSpeed', 0, 40, 0.1, 'line speed');
  R(parts, c, 'streakLife', 0.05, 2, 0.01, 'line lifetime');
  R(parts, c, 'streakStretch', 0, 4, 0.01, 'line stretch');
  Editor.gradient(parts, c, 'colorStreak', 'wind line colour');
  R(parts, c, 'chipRate', 0, 200, 1, 'grit / s');
  R(parts, c, 'chipSize', 0.01, 0.3, 0.005, 'grit size');
  R(parts, c, 'chipSpeed', 0, 15, 0.1, 'grit speed');
  R(parts, c, 'chipLife', 0.1, 3, 0.05, 'grit lifetime');
  Editor.gradient(parts, c, 'colorChip', 'grit colour');

  const beat = folder.addFolder('7 · The beat');
  R(beat, c, 'snapShake', 0, 0.5, 0.005, 'knock per snap');
  R(beat, c, 'travelRumble', 0, 0.5, 0.005, 'rumble');
  R(beat, c, 'impactShake', 0, 2, 0.01, 'tear knock');
  R(beat, c, 'impactFlash', 0, 1, 0.01, 'flash');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'burstRadius', 0, 10, 0.05, 'air shell (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'shell life');
  beat.addColor(c, 'colorBurstA').name('shell, hot');
  beat.addColor(c, 'colorBurstB').name('shell, body');
  beat.addColor(c, 'colorBurstC').name('shell, deep');
  R(beat, c, 'shockRadius', 0, 20, 0.05, 'shock ring (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'shock life');
  beat.addColor(c, 'colorShockA').name('shock ring');
  beat.addColor(c, 'colorShockB').name('shock ring, hot');

  const hit = folder.addFolder('8 · Bodies');
  R(hit, c, 'hitDepth', 0.1, 4, 0.01, 'caught within (m)');
  R(hit, c, 'hitImpulse', 0, 20, 0.1, 'sideways impulse');
  R(hit, c, 'hitForward', 0, 2, 0.01, 'forward share');
  R(hit, c, 'hitLift', 0, 15, 0.1, 'lift');
  R(hit, c, 'hitSpin', 0, 6, 0.05, 'spin');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'jolt per snap');
  R(light, c, 'impactLight', 0, 60, 0.5, 'light punch');
}
