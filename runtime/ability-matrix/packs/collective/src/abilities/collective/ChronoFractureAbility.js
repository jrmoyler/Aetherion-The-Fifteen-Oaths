import {
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createChronoClockMaterial,
  createChronoGlassMaterial,
  createChronoLensMaterial,
  createChronoRingMaterial,
  createChronoShellMaterial
} from '../../materials/collective/ChronoFractureMaterials.js';
import { createGlassPlateGeometry, createRingBlankGeometry } from '../../assets/collective/ChronoFractureGeometry.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing, randRange } from '../../utils/math.js';

export const ID = 'chrono';

const TAU = Math.PI * 2;

/** Concentric rings available. The editor's count slider clamps to this. */
const MAX_RINGS = 5;
/** Glass panes suspended inside the sphere. */
const MAX_SHARDS = 40;
/** Pieces the shell breaks into. */
const MAX_FRAGS = 96;
/** Pane silhouettes per mesh, so the field is not one shape rotated. */
const VARIANTS = 2;
/** Bodies the sphere can hold. */
const MAX_HELD = 10;

const _emit = {};
const _pos = new Vector3();
const _centre = new Vector3();
const _floor = new Vector3();
const _dir = new Vector3();
const _hand = new Vector3();
const _node = new Object3D();
const _usedA = new Int32Array(VARIANTS);
const _usedB = new Int32Array(VARIANTS);

/**
 * CHRONO FRACTURE — a sphere of stopped time.
 *
 * A gold gyroscope is thrown to the circle and unfolds there into a clockwork
 * sphere. For `lifetime` seconds nothing inside it moves: the bodies standing
 * in it are *held* — their idle stops, their rims burn gold — while the rings
 * grind round them and the clock on the floor ticks. Then cracks race across
 * the shell from one point, the rings seize, and the sphere **shatters**: a
 * flash, a SHOCKWAVE, the shell blown out as tumbling glass, and time comes
 * back all at once — every body it was holding is thrown outward.
 *
 * Seven layers:
 *
 *   1. **the rings** — up to five concentric gold bands, each tipped off the
 *      last and turning at its own rate, engraved with ticks and numeral
 *      dashes, reflecting the stage's sky. They unfold one after another on
 *      arrival, slow as the shell cracks, and fly apart at the shatter.
 *   2. **the clock face** — a ground sigil with a bezel, sixty ticks, a turning
 *      gear and three hands, the second hand ticking in jumps with a wedge of
 *      light behind it. Each tick knocks the camera a hair and pulses the
 *      engravings on the rings.
 *   3. **the glass** — panes suspended inside the sphere, turning very slowly
 *      and bobbing a few centimetres: things caught mid-fall.
 *   4. **the shell** — an almost invisible sphere with a fresnel rim and a hex
 *      lattice, across which the **cracks** grow as voronoi walls revealed
 *      outward from an impact point.
 *   5. **the motes** — slow drifting dust inside the sphere, barely moving.
 *   6. **the lens** — a time eddy on LAYER.DISTORTION while it holds, and a hard
 *      outward ring when it breaks.
 *   7. **the shatter** — the shell becomes instanced fragments thrown out under
 *      gravity, plus flash, SHOCKWAVE decal, AIR burst, sparks and glitter.
 *
 * ## The bodies
 *
 * `handlesOwnHits` is true. Bodies inside the sphere are found every frame of
 * the hold and are **not killed**: the sphere freezes them by pausing their
 * idle clip's action (not the mixer — `Dummy#update` rewrites the mixer's time
 * scale every tick; it is unpaused the moment the sphere lets go), and tints them with
 * `Dummy#corrode` so the held body reads as caught in amber. At the shatter
 * every one of them is killed with an outward throw. If the cast is retired
 * early the hold is simply released.
 *
 * ## The editor rule
 *
 * Records hold dice and clocks only. The rings, the sphere, the clock hands and
 * the shards are all resolved from `settings.chrono` per frame; `ringTube` and
 * `ringCount` take effect live on rings that are already turning.
 */
export class ChronoFractureAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    let n = 0;
    for (const mesh of this.shardMeshes) n += mesh.count;
    for (const mesh of this.fragMeshes) n += mesh.count;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the rings ---- */
    this.ringGeometry = createRingBlankGeometry(14, 220);
    this.rings = [];
    this.ringMaterials = [];
    for (let i = 0; i < MAX_RINGS; i++) {
      const material = createChronoRingMaterial();
      const mesh = new Mesh(this.ringGeometry, material);
      mesh.name = `ChronoRing${i}`;
      // Opaque and depth-writing, but on VFX rather than WORLD: the vertex
      // stage re-places the torus blank from uniforms, and the depth prepass
      // draws WORLD with one override material — it would rasterise the raw
      // unit blank (a metre-wide hoop) instead of the band. Same reason
      // LAYER.SHAPED exists; the rings need no shadow, so VFX is enough.
      mesh.layers.set(LAYER.VFX);
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.rotation.order = 'YXZ';
      this.group.add(mesh);
      this.rings.push(mesh);
      this.ringMaterials.push(material);
    }

    /* ---- layer 2: the clock face ---- */
    this.clockGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.clockMaterial = createChronoClockMaterial();
    this.clock = new Mesh(this.clockGeometry, this.clockMaterial);
    this.clock.name = 'ChronoClock';
    this.clock.layers.set(LAYER.VFX);
    this.clock.renderOrder = 5;
    this.clock.frustumCulled = false;
    this.clock.visible = false;
    this.group.add(this.clock);

    /* ---- layers 3 + 7: the glass ---- */
    this.glassMaterial = createChronoGlassMaterial();
    this.shardMeshes = [];
    this.fragMeshes = [];
    this.shardGlow = [];
    this.fragGlow = [];
    const shardSlots = Math.ceil(MAX_SHARDS / VARIANTS);
    const fragSlots = Math.ceil(MAX_FRAGS / VARIANTS);
    for (let v = 0; v < VARIANTS; v++) {
      const shard = this._glassMesh(createGlassPlateGeometry(3.1 + v * 7, 5 + v, 0.07, 0.6), shardSlots);
      shard.mesh.name = `ChronoShards${v}`;
      this.shardMeshes.push(shard.mesh);
      this.shardGlow.push(shard.glow);

      const frag = this._glassMesh(createGlassPlateGeometry(11.7 + v * 5, 4 + v, 0.05, 0.25), fragSlots);
      frag.mesh.name = `ChronoFrags${v}`;
      this.fragMeshes.push(frag.mesh);
      this.fragGlow.push(frag.glow);
    }

    /* ---- layer 4: the shell ---- */
    this.shellGeometry = new SphereGeometry(1, 64, 40);
    this.shellMaterial = createChronoShellMaterial();
    this.shell = new Mesh(this.shellGeometry, this.shellMaterial);
    this.shell.name = 'ChronoShell';
    this.shell.layers.set(LAYER.VFX);
    this.shell.renderOrder = 13;
    this.shell.frustumCulled = false;
    this.shell.visible = false;
    this.group.add(this.shell);

    /* ---- layer 6: the lens ---- */
    this.lensGeometry = new PlaneGeometry(1, 1);
    this.lensMaterial = createChronoLensMaterial();
    this.lens = new Mesh(this.lensGeometry, this.lensMaterial);
    this.lens.name = 'ChronoLens';
    this.lens.layers.set(LAYER.DISTORTION);
    this.lens.frustumCulled = false;
    this.lens.visible = false;
    this.group.add(this.lens);

    /** Per-ring dice: tilt phase and a spin sign. */
    this._ringDice = [];
    for (let i = 0; i < MAX_RINGS; i++) this._ringDice.push({ yaw: 0, angle: 0 });

    /** Per-shard dice: where it hangs and how it turns. */
    this._shards = [];
    for (let i = 0; i < MAX_SHARDS; i++) {
      this._shards.push({ dx: 0, dy: 0, dz: 0, size: 1, rx: 0, ry: 0, rz: 0, phase: 0 });
    }
    /** Per-fragment dice: where on the shell it was, and how it tumbles. */
    this._frags = [];
    for (let i = 0; i < MAX_FRAGS; i++) {
      this._frags.push({ dx: 0, dy: 0, dz: 0, size: 1, speed: 1, rx: 0, ry: 0, rz: 0 });
    }

    this._seed = 0;
    /** Seconds since the sphere landed. */
    this._hold = 0;
    /** Seconds since the shatter. */
    this._after = 0;
    this._shattered = false;
    this._crackFired = false;
    /** The clock's integrated hand angles and its tick envelope. */
    this._clockTime = 0;
    this._lastTick = 0;
    this._tickGlow = 0;
    this._gearAngle = 0;
    /** Where the fracture starts, a unit direction on the shell. */
    this._impact = new Vector3(0, 1, 0);

    /** Bodies held. */
    this._held = [];
    for (let i = 0; i < MAX_HELD; i++) this._held.push({ dummy: null, time: 0 });
    this._heldCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    /** The amber look handed to `Dummy#corrode`; colours refreshed from settings. */
    this._look = {
      color: '#000000',
      rimColor: '#ffffff',
      rimEmissive: 1,
      edgeColor: '#ffffff',
      edgeEmissive: 1,
      edgeWidth: 0.12
    };

    this._ringState = { major: 1, tube: 1, tick: 0, fade: 1, seed: 0 };
    this._clockState = { quadSize: 8, radius: 3, open: 0, hour: 0, minute: 0, second: 0, gear: 0, fade: 1 };
    this._glassState = { fade: 1 };
    this._shellState = { crack: 0, impact: this._impact, fade: 1, seed: 0 };
    this._lensState = { size: 4, eddy: 0, shock: 0, shockAt: 0 };
  }

  /** An InstancedMesh of glass panes with per-instance seed and glow. */
  _glassMesh(geometry, slots) {
    const seeds = new InstancedBufferAttribute(new Float32Array(slots), 1);
    const glow = new InstancedBufferAttribute(new Float32Array(slots), 1);
    for (let i = 0; i < slots; i++) seeds.array[i] = Math.random() * 10;
    geometry.setAttribute('aSeed', seeds);
    geometry.setAttribute('aGlow', glow);
    const mesh = new InstancedMesh(geometry, this.glassMaterial, slots);
    mesh.layers.set(LAYER.VFX);
    mesh.renderOrder = 11;
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.group.add(mesh);
    return { mesh, glow };
  }

  createParticles() {
    const particles = this.ctx.particles;

    // Slow motes inside the sphere. Almost no drag needed: they barely move.
    this.motes = particles.get('chrono.motes', {
      capacity: 900,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.3
    });
    this.motes.uniforms.uDrag.value = 0.6;
    this.motes.uniforms.uEndSize.value = 0.6;
    this.motes.uniforms.uSizeIn.value = 0.25;
    this.motes.uniforms.uFadeIn.value = 0.25;
    this.motes.uniforms.uFadeOut.value = 0.4;
    this.motes.uniforms.uGravity.value.set(0, 0, 0);

    // Sparks at the shatter, and the gyroscope's trail in flight.
    this.sparks = particles.get('chrono.sparks', {
      capacity: 1600,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.25
    });
    this.sparks.uniforms.uDrag.value = 2.4;
    this.sparks.uniforms.uEndSize.value = 0.2;
    this.sparks.uniforms.uSizeIn.value = 0.03;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.5;
    this.sparks.uniforms.uStretch.value = 0.07;
    this.sparks.uniforms.uGravity.value.set(0, -3.0, 0);

    // Glints of glass hanging in the air after the shatter.
    this.glitter = particles.get('chrono.glitter', {
      capacity: 1200,
      shape: ParticleShape.CHIP,
      additive: true,
      lit: true,
      softFade: 0.2
    });
    this.glitter.uniforms.uDrag.value = 2.0;
    this.glitter.uniforms.uEndSize.value = 0.5;
    this.glitter.uniforms.uSizeIn.value = 0.03;
    this.glitter.uniforms.uFadeIn.value = 0.02;
    this.glitter.uniforms.uFadeOut.value = 0.5;
    this.glitter.uniforms.uGravity.value.set(0, -1.6, 0);

    this.moteEmitter = new RateEmitter();
    this.trailEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get impactDuration() {
    return Math.max(0.2, settings.chrono.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings.chrono.fadeTime * settings.global.lifetime);
  }

  /** The light ticks with the clock. */
  lightShimmer() {
    return 0.9 + this._tickGlow * 0.25 + this._crackAmount() * 0.5;
  }

  /* ------------------------------------------------------------------ */
  /* Geometry — every metre from live settings                           */
  /* ------------------------------------------------------------------ */

  /** Sphere radius, metres. */
  get sphereRadius() {
    return Math.max(0.3, settings.chrono.zoneRadius * settings.chrono.sphereScale);
  }

  _floorPoint(out) {
    this.pointAt(1, out);
    out.y = 0;
    return out;
  }

  /** The sphere's centre; in flight the gyroscope rides a shallow arc. */
  _centrePoint(out) {
    const c = settings.chrono;
    if (this.phase === AbilityPhase.TRAVEL) {
      _hand.copy(this.origin).addScaledVector(this.direction, 0.6);
      _hand.y = c.handHeight;
      this._floorPoint(out);
      out.y = c.sphereLift;
      out.lerpVectors(_hand, out, this.u);
      out.y += Math.sin(this.u * Math.PI) * 0.6;
      return out;
    }
    this._floorPoint(out);
    out.y = c.sphereLift;
    return out;
  }

  /** 0..1 how far ring `i` has unfolded. */
  _ringOpen(i) {
    const c = settings.chrono;
    if (this.phase === AbilityPhase.TRAVEL) return 0;
    return saturate((this._hold - i * c.openStagger) / Math.max(0.05, c.openTime));
  }

  /** 0..1 across the crack window before the shatter. */
  _crackAmount() {
    if (this.phase === AbilityPhase.TRAVEL) return 0;
    if (this._shattered) return 1;
    const c = settings.chrono;
    const window = Math.max(0.05, c.crackTime);
    return saturate((this._hold - (this.impactDuration - window)) / window);
  }

  /** 0..1 through the fade after the shatter. */
  _afterAmount() {
    return this._shattered ? saturate(this._after / this.fadeDuration) : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.moteEmitter.reset();
    this.trailEmitter.reset();
    this._releaseHeld();

    this._seed = Math.random() * 100;
    this._hold = 0;
    this._after = 0;
    this._shattered = false;
    this._crackFired = false;
    this._clockTime = Math.random() * 30;
    this._lastTick = -1;
    this._tickGlow = 0;
    this._gearAngle = 0;

    // The fracture starts somewhere on the upper hemisphere, facing roughly
    // back toward the caster, so the player sees it begin.
    const a = Math.random() * TAU;
    this._impact.set(Math.cos(a) * 0.5 - this.direction.x * 0.7, 0.55, Math.sin(a) * 0.5 - this.direction.z * 0.7).normalize();

    for (let i = 0; i < MAX_RINGS; i++) {
      this._ringDice[i].yaw = Math.random() * TAU;
      this._ringDice[i].angle = Math.random() * TAU;
    }
    for (const s of this._shards) {
      // A point in the ball, biased outward so the middle is left clear.
      const u = Math.random() * TAU;
      const v = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.45);
      s.dx = Math.sin(v) * Math.cos(u) * r;
      s.dy = Math.cos(v) * r * 0.85;
      s.dz = Math.sin(v) * Math.sin(u) * r;
      s.size = randRange(-1, 1);
      s.rx = Math.random() * TAU;
      s.ry = Math.random() * TAU;
      s.rz = Math.random() * TAU;
      s.phase = Math.random() * TAU;
    }
    for (const f of this._frags) {
      const u = Math.random() * TAU;
      const v = Math.acos(2 * Math.random() - 1);
      f.dx = Math.sin(v) * Math.cos(u);
      f.dy = Math.cos(v);
      f.dz = Math.sin(v) * Math.sin(u);
      f.size = randRange(0.6, 1.3);
      f.speed = randRange(0.6, 1.2);
      f.rx = randRange(-1, 1);
      f.ry = randRange(-1, 1);
      f.rz = randRange(-1, 1);
    }

    this._sync(0);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _sync(dt) {
    const c = settings.chrono;
    const g = settings.global;
    const travelling = this.phase === AbilityPhase.TRAVEL;
    const R = this.sphereRadius;
    const crack = this._crackAmount();
    const after = this._afterAmount();
    this._centrePoint(_centre);
    this._floorPoint(_floor);

    /* ---- the rings ---- */
    const count = Math.min(MAX_RINGS, Math.max(1, Math.round(c.ringCount)));
    const fling = this._shattered ? Easing.outCubic(saturate(this._after / 0.6)) : 0;
    for (let i = 0; i < MAX_RINGS; i++) {
      const mesh = this.rings[i];
      if (i >= count) {
        mesh.visible = false;
        continue;
      }
      const dice = this._ringDice[i];
      // The outermost ring is index 0.
      const f = count > 1 ? i / (count - 1) : 0;
      const open = travelling ? 1 : Easing.outBack(this._ringOpen(i));
      const major = travelling
        ? R * c.seedSize * lerp(1, 0.55, f)
        : R * lerp(c.ringOuter, c.ringInner, f) * Math.max(0.02, open) * lerp(1, c.ringScatter, fling);

      // Spin: alternate directions, inner rings faster; slowed to `ringFreeze`
      // as the shell cracks, and seized entirely once it breaks.
      const rate = c.ringSpin * (1 + i * c.ringSpinSpread) * (i % 2 === 0 ? 1 : -1) * g.animationSpeed;
      const slow = this._shattered ? 0 : lerp(1, c.ringFreeze, Easing.inQuad(crack));
      dice.angle += rate * slow * (travelling ? 3 : 1) * dt;

      mesh.position.copy(_centre);
      // Each ring's axis is tipped further from the last: a gyroscope.
      mesh.rotation.set(Math.PI / 2 + c.ringTilt * i, dice.yaw + i * 1.1, dice.angle);
      if (this._shattered) {
        // Thrown off their axes as they fly apart.
        mesh.rotation.x += fling * (i % 2 ? 0.9 : -0.7);
        mesh.position.y += fling * (i - count * 0.5) * 0.35;
      }

      const state = this._ringState;
      state.major = major;
      state.tube = travelling ? 0.5 : 1;
      state.tick = this._tickGlow;
      state.fade = this._shattered ? 1 - Easing.inQuad(after) : 1;
      state.seed = this._seed + i * 7.1;
      this.ringMaterials[i].userData.sync(state);
      // The gold doesn't fade — it is solid — so it shrinks out instead.
      const shrink = this._shattered ? 1 - Easing.inCubic(saturate((after - 0.4) / 0.6)) : 1;
      mesh.scale.setScalar(Math.max(0.0001, shrink));
      mesh.visible = shrink > 0.01 && major > 0.005;
    }

    /* ---- the clock face ---- */
    const clockR = R * c.clockRadius;
    const clockState = this._clockState;
    clockState.quadSize = (clockR + 0.6) * 2;
    clockState.radius = clockR;
    clockState.open = travelling ? 0 : Easing.outCubic(saturate(this._hold / Math.max(0.05, c.openTime * 1.4)));
    // The second hand: stepped or swept, but always turning from the cast's
    // own clock so it can be stopped by stopping that clock.
    const steps = Math.max(1, Math.round(c.clockHandSteps));
    const stepAngle = TAU / steps;
    const raw = this._clockTime * c.clockSecondSpeed;
    const stepped = Math.floor(raw / stepAngle) * stepAngle;
    // Each step lands with a little overshoot.
    const sinceStep = (raw - stepped) / Math.max(1e-3, c.clockSecondSpeed);
    const settle = Easing.outElastic(saturate(sinceStep / 0.18));
    const second = lerp(raw, stepped - stepAngle + stepAngle * settle, saturate(c.clockTickStep));
    const toward = Math.atan2(this.direction.z, this.direction.x);
    clockState.second = toward - second;
    clockState.minute = toward - this._clockTime * c.clockMinuteSpeed;
    clockState.hour = toward - this._clockTime * c.clockHourSpeed;
    clockState.gear = this._gearAngle;
    clockState.fade = this._shattered ? 1 - Easing.inQuad(after) : 1;
    this.clockMaterial.userData.sync(clockState);
    this.clock.visible = !travelling && clockState.fade > 0.004;
    this.clock.position.set(_floor.x, c.clockHeight, _floor.z);
    this.clock.scale.set(clockState.quadSize, 1, clockState.quadSize);

    // A tick: the step index changed.
    const tickIndex = Math.floor(raw / stepAngle);
    if (!travelling && !this._shattered && tickIndex !== this._lastTick && dt > 0) {
      if (this._lastTick >= 0) this._tickFx();
      this._lastTick = tickIndex;
    }

    /* ---- the shell ---- */
    const shellState = this._shellState;
    shellState.crack = crack;
    shellState.fade = this._shattered ? 1 - Easing.outCubic(saturate(this._after / 0.12)) : Easing.outCubic(this._ringOpen(0));
    shellState.seed = this._seed;
    this.shellMaterial.userData.sync(shellState);
    this.shell.visible = !travelling && shellState.fade > 0.004;
    this.shell.position.copy(_centre);
    // Bulges very slightly just before it goes.
    this.shell.scale.setScalar(R * (1 + Easing.inQuad(crack) * 0.04));

    /* ---- the glass ---- */
    this._glassState.fade = 1;
    this.glassMaterial.userData.sync(this._glassState);
    this._updateShards(R, crack);
    this._updateFrags(R);

    /* ---- the lens ---- */
    const lensState = this._lensState;
    lensState.size = R * c.lensReach * (this._shattered ? 2.2 : 1);
    lensState.eddy = travelling ? 0 : Easing.outCubic(this._ringOpen(0)) * (1 - after) * (1 + crack);
    lensState.shock = this._shattered ? 1 - Easing.outQuad(saturate(this._after / 0.55)) : 0;
    lensState.shockAt = this._shattered ? Easing.outCubic(saturate(this._after / 0.55)) * 0.95 : 0;
    this.lensMaterial.userData.sync(lensState);
    this.lens.visible = lensState.eddy + lensState.shock > 0.004;
    this.lens.position.copy(_centre);

    /* ---- particles ---- */
    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    this.motes.uniforms.uSizeScale.value = g.particleSize;
    this.motes.uniforms.uLifeScale.value = g.particleLifetime;
    this.motes.uniforms.uSpeedScale.value = g.particleSpeed;
    this.motes.uniforms.uOpacity.value = g.opacity;
    this.motes.uniforms.uGlow.value = g.glow;
    this.motes.uniforms.uTurbulence.value = 0.05 * g.turbulence;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    this.sparks.uniforms.uSizeScale.value = g.particleSize;
    this.sparks.uniforms.uLifeScale.value = g.particleLifetime;
    this.sparks.uniforms.uSpeedScale.value = g.particleSpeed;
    this.sparks.uniforms.uOpacity.value = g.opacity;
    this.sparks.uniforms.uGlow.value = g.glow;

    this.glitter.setGradient(getColor(c.colorGlassRim), getColor(c.colorGlass), getColor(c.colorMoteC), getColor(c.colorMoteD));
    this.glitter.uniforms.uSizeScale.value = g.particleSize;
    this.glitter.uniforms.uLifeScale.value = g.particleLifetime;
    this.glitter.uniforms.uSpeedScale.value = g.particleSpeed;
    this.glitter.uniforms.uOpacity.value = g.opacity;
    this.glitter.uniforms.uGlow.value = g.glow;
  }

  /** The suspended panes: hung inside, turning slowly; they go with the shell. */
  _updateShards(R, crack) {
    const c = settings.chrono;
    const g = settings.global;
    const count = this.phase === AbilityPhase.TRAVEL || this._shattered ? 0 : Math.min(MAX_SHARDS, Math.max(0, Math.round(c.shardCount)));
    const used = _usedA;
    used.fill(0);
    const open = Easing.outCubic(this._ringOpen(1));
    const t = this._hold;

    for (let i = 0; i < MAX_SHARDS; i++) {
      const variant = i % VARIANTS;
      const slot = (i / VARIANTS) | 0;
      const mesh = this.shardMeshes[variant];
      if (i >= count || open <= 0.001) {
        if (i < count) {
          _node.position.set(0, -999, 0);
          _node.scale.setScalar(0.0001);
          _node.updateMatrix();
          mesh.setMatrixAt(slot, _node.matrix);
          used[variant] = Math.max(used[variant], slot + 1);
        }
        continue;
      }
      const s = this._shards[i];
      const reach = R * c.shardFill * open;
      const bob = Math.sin(t * 0.9 + s.phase) * c.shardDrift;
      // Shiver as the shell cracks: time is coming back.
      const shiver = crack * crack * 0.04 * Math.sin(t * 60 + s.phase * 9);
      _node.position.set(
        _centre.x + s.dx * reach + shiver,
        _centre.y + s.dy * reach + bob,
        _centre.z + s.dz * reach - shiver
      );
      const turn = t * c.shardTurn * g.animationSpeed;
      _node.rotation.set(s.rx + turn, s.ry + turn * 0.7, s.rz + turn * 0.4);
      const size = Math.max(0.02, c.shardSize * (1 + s.size * c.shardSizeJitter * g.randomness)) * open;
      _node.scale.setScalar(size);
      _node.updateMatrix();
      mesh.setMatrixAt(slot, _node.matrix);
      this.shardGlow[variant].array[slot] = crack * crack * 0.6;
      used[variant] = Math.max(used[variant], slot + 1);
    }
    for (let v = 0; v < VARIANTS; v++) {
      this.shardMeshes[v].count = used[v];
      this.shardMeshes[v].instanceMatrix.needsUpdate = true;
      this.shardGlow[v].needsUpdate = true;
    }
  }

  /**
   * The shell after it breaks: each fragment starts on the sphere at its own
   * point and is thrown out along that normal under gravity — closed-form, so
   * the editor can change speed or gravity on a shatter already in flight.
   */
  _updateFrags(R) {
    const c = settings.chrono;
    const g = settings.global;
    const used = _usedB;
    used.fill(0);
    const count = this._shattered ? Math.min(MAX_FRAGS, Math.max(0, Math.round(c.fragCount))) : 0;
    const t = this._after;
    const life = Math.max(0.1, c.fragLife * this.fadeDuration);
    const k = saturate(t / life);

    for (let i = 0; i < count; i++) {
      const f = this._frags[i];
      const variant = i % VARIANTS;
      const slot = (i / VARIANTS) | 0;
      const mesh = this.fragMeshes[variant];
      const speed = c.fragSpeed * f.speed * g.explosionIntensity;
      // Exponential drag on the outward throw, plain gravity on the fall.
      const travel = (1 - Math.exp(-1.6 * t)) / 1.6;
      let y = _centre.y + f.dy * R + f.dy * speed * travel + 0.5 * c.fragGravity * t * t;
      // Land on the floor and lie there.
      y = Math.max(0.03, y);
      _node.position.set(_centre.x + f.dx * (R + speed * travel), y, _centre.z + f.dz * (R + speed * travel));
      const spin = c.fragTumble * travel;
      _node.rotation.set(f.rx * spin + f.dy, f.ry * spin + Math.atan2(f.dx, f.dz), f.rz * spin);
      const size = c.fragSize * f.size * (1 - Easing.inCubic(k));
      _node.scale.setScalar(Math.max(0.0001, size));
      _node.updateMatrix();
      mesh.setMatrixAt(slot, _node.matrix);
      // White-hot for the first instant, then just glass.
      this.fragGlow[variant].array[slot] = Math.max(0, 1 - t * 5);
      used[variant] = Math.max(used[variant], slot + 1);
    }
    for (let v = 0; v < VARIANTS; v++) {
      this.fragMeshes[v].count = used[v];
      this.fragMeshes[v].instanceMatrix.needsUpdate = true;
      this.fragGlow[v].needsUpdate = true;
    }
  }

  /* ------------------------------------------------------------------ */
  /* The hold                                                            */
  /* ------------------------------------------------------------------ */

  _heldOf(dummy) {
    for (let i = 0; i < this._heldCount; i++) if (this._held[i].dummy === dummy) return this._held[i];
    return null;
  }

  /**
   * Put a held body's clock back.
   *
   * The freeze pauses the idle *action* rather than the mixer: `Dummy#update`
   * rewrites the mixer's time scale from the global animation speed on every
   * tick, so anything written there is gone before it is read. `paused` on the
   * action is left alone by the dummy, and `Dummy#place` clears it anyway when
   * a body stands back up.
   */
  _unfreeze(dummy) {
    if (dummy?.action) dummy.action.paused = false;
  }

  _releaseHeld() {
    for (let i = 0; i < this._heldCount; i++) {
      this._unfreeze(this._held[i].dummy);
      this._held[i].dummy = null;
      this._held[i].time = 0;
    }
    this._heldCount = 0;
  }

  /** Take hold of every body inside the sphere, and keep them stopped. */
  _freeze(dt) {
    const c = settings.chrono;
    const field = this.ctx.dummies;
    if (field?.findTargets) {
      this._floorPoint(_floor);
      const reach = this.sphereRadius * c.holdReach * Easing.outCubic(this._ringOpen(0));
      const found = field.findTargets(_floor.x, _floor.z, reach, this._found);
      for (const dummy of found) {
        if (this._heldCount >= MAX_HELD) break;
        if (this._heldOf(dummy)) continue;
        const slot = this._held[this._heldCount++];
        slot.dummy = dummy;
        slot.time = 0;
      }
    }

    const look = this._look;
    look.color = c.colorStain;
    look.rimColor = c.colorStainRim;
    look.rimEmissive = c.holdRimGlow;
    look.edgeColor = c.colorStainRim;
    look.edgeEmissive = c.holdRimGlow * 2;

    for (let i = this._heldCount - 1; i >= 0; i--) {
      const slot = this._held[i];
      const dummy = slot.dummy;
      // Gone, or felled by something else: nothing left to hold.
      if (!dummy || !dummy.alive) {
        this._unfreeze(dummy);
        const last = this._heldCount - 1;
        this._held[i] = this._held[last];
        this._held[last] = slot;
        slot.dummy = null;
        this._heldCount = last;
        continue;
      }
      slot.time += dt;
      // Stopped mid-breath: the idle clip is paused where it stands.
      if (dummy.action) dummy.action.paused = true;
      dummy.corrode(saturate(slot.time / Math.max(0.05, c.holdStainTime)) * c.holdStain, look);
    }
  }

  /** The shatter: every held body is thrown outward. */
  _release() {
    const c = settings.chrono;
    const g = settings.global;
    this._floorPoint(_floor);
    this._force.impulse = c.killImpulse * g.explosionIntensity;
    this._force.lift = c.killLift * g.explosionIntensity;
    this._force.spin = c.killSpin;

    for (let i = 0; i < this._heldCount; i++) {
      const dummy = this._held[i].dummy;
      if (!dummy) continue;
      this._unfreeze(dummy);
      _dir.set(dummy.position.x - _floor.x, 0, dummy.position.z - _floor.z);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      else _dir.normalize();
      dummy.kill(_dir.x, _dir.z, this._force);
      this._held[i].dummy = null;
    }
    this._heldCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  _resetEmit(time) {
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.4;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.sizeVariance = 0.5;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  /** The gyroscope in flight: a thin trail of gold. */
  _travelFx(dt) {
    const c = settings.chrono;
    const g = settings.global;
    const n = this.trailEmitter.tick(dt, 90 * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    this._centrePoint(_pos);
    _emit.position = _pos;
    _emit.radius = this.sphereRadius * c.seedSize * 0.8;
    _emit.direction = _dir.copy(this.direction).negate();
    _emit.speed = 1.5;
    _emit.spread = 0.6;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLifetime * 0.7;
    this.sparks.emit(n, _emit);
  }

  /** Landing: the sphere opens with a soft knock and a ring on the floor. */
  _openFx() {
    const c = settings.chrono;
    const g = settings.global;
    this._floorPoint(_floor);
    this.ctx.decals.spawn(DecalType.RIPPLE, _floor, {
      radius: this.sphereRadius * 1.2,
      life: 1.0,
      intensity: 0.6,
      colorA: getColor(c.colorClockGlow),
      colorB: getColor(c.colorClockSweep)
    });
    this.ctx.shake.add(c.openShake * g.cameraShake, 5, 14);
    this.lightBoost = c.lightIntensity * 0.4;
  }

  /** One tick of the clock. */
  _tickFx() {
    const c = settings.chrono;
    this._tickGlow = 1;
    this.ctx.shake.add(c.tickShake * settings.global.cameraShake, 14, 30);
  }

  /** The crack window opening: a hairline flash where the fracture starts. */
  _crackFx() {
    const c = settings.chrono;
    const g = settings.global;
    this._centrePoint(_centre);
    _pos.copy(this._impact).multiplyScalar(this.sphereRadius).add(_centre);
    this._resetEmit(frame.uTime.value);
    _emit.position = _pos;
    _emit.radius = 0.1;
    _emit.direction = _dir.copy(this._impact);
    _emit.speed = c.sparkSpeed * 0.4;
    _emit.spread = 0.8;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLifetime;
    this.sparks.emit(Math.round(24 * g.particleCount), _emit);
    this.ctx.shake.add(c.shatterShake * 0.25 * g.cameraShake, 8, 24);
  }

  /** The shatter. */
  _shatterFx() {
    const c = settings.chrono;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._centrePoint(_centre);
    this._floorPoint(_floor);
    const R = this.sphereRadius;

    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: c.shockLife,
      width: 0.05,
      intensity: 1.1,
      colorA: getColor(c.colorShockHot),
      colorB: getColor(c.colorShockBody)
    });
    this.ctx.decals.spawn(DecalType.FROST, _floor, {
      radius: R * 1.1,
      life: 3.5,
      intensity: 0.5,
      colorA: getColor(c.colorGlass),
      colorB: getColor(c.colorClockGlow),
      height: 0.013
    });
    this.ctx.bursts.spawn(BurstMode.AIR, _centre, {
      radius: R * 0.9,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1.3,
      colorA: getColor(c.colorShockHot),
      colorB: getColor(c.colorShockBody),
      colorC: getColor(c.colorGlass)
    });

    /* sparks off the whole shell */
    for (let n = 0, total = Math.round(c.sparkCount * g.particleCount); n < total; n += 20) {
      this._resetEmit(time);
      const u = Math.random() * TAU;
      const v = Math.acos(2 * Math.random() - 1);
      _dir.set(Math.sin(v) * Math.cos(u), Math.abs(Math.cos(v)) * 0.8 + 0.1, Math.sin(v) * Math.sin(u)).normalize();
      _pos.copy(_dir).multiplyScalar(R).add(_centre);
      _emit.position = _pos;
      _emit.radius = 0.25;
      _emit.direction = _dir;
      _emit.speed = c.sparkSpeed * power;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.35;
      _emit.size = c.sparkSize * 1.3;
      _emit.life = c.sparkLifetime;
      this.sparks.emit(Math.min(20, total - n), _emit);
    }

    /* glitter hanging in the air */
    this._resetEmit(time);
    _emit.position = _centre;
    _emit.radius = R;
    _emit.direction = null;
    _emit.speed = 1.6 * power;
    _emit.spread = 1;
    _emit.size = c.glitterSize;
    _emit.sizeVariance = 0.7;
    _emit.life = c.glitterLifetime;
    _emit.spin = 10;
    this.glitter.emit(Math.round(c.glitterCount * g.particleCount), _emit);

    this.ctx.flash.trigger(getColor(c.colorFlash), c.shatterFlash * power);
    this.ctx.shake.add(c.shatterShake * power * g.cameraShake, 3.5, 24);
    this.lightBoost = c.shatterLight * power;
  }

  /** Slow motes drifting inside the sphere. */
  _holdFx(dt) {
    const c = settings.chrono;
    const g = settings.global;
    const n = this.moteEmitter.tick(dt, c.moteRate * Easing.outCubic(this._ringOpen(0)) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    this._centrePoint(_centre);
    _emit.position = _centre;
    _emit.radius = this.sphereRadius * 0.9;
    _emit.direction = null;
    _emit.speed = c.moteDrift;
    _emit.spread = 1;
    _emit.size = c.moteSize;
    _emit.life = c.moteLifetime;
    this.motes.emit(n, _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  /** Integrate the clocks. Time inside the sphere runs slow, then stops. */
  _advance(dt) {
    const g = settings.global;
    const crack = this._crackAmount();
    const rate = this._shattered ? 0 : lerp(1, 0.15, Easing.inQuad(crack));
    this._clockTime += dt * rate * g.animationSpeed;
    this._gearAngle += dt * 0.6 * rate * g.animationSpeed;
    this._tickGlow = Math.max(0, this._tickGlow - this._tickGlow * 7 * dt);
  }

  onTravel(dt) {
    this._advance(dt);
    this._sync(dt);
    this._centrePoint(this.position);
    this._travelFx(dt);
  }

  onImpact() {
    this._hold = 0;
    this._after = 0;
    this._shattered = false;
    this._crackFired = false;
    this._openFx();
  }

  onFade(dt, t) {
    if (!this._shattered) {
      this._hold += dt;
      if (this._crackAmount() > 0 && !this._crackFired) {
        this._crackFired = true;
        this._crackFx();
      }
      this._freeze(dt);
      this._holdFx(dt);
      if (t >= 1) {
        this._shattered = true;
        this._after = 0;
        this._shatterFx();
        this._release();
      }
    } else {
      this._after += dt;
    }
    this._advance(dt);
    this._sync(dt);
    this._centrePoint(this.position);
  }

  onDestroy() {
    this._releaseHeld();
    this._shattered = false;
    for (const ring of this.rings) ring.visible = false;
    this.clock.visible = false;
    this.shell.visible = false;
    this.lens.visible = false;
    for (const mesh of this.shardMeshes) mesh.count = 0;
    for (const mesh of this.fragMeshes) mesh.count = 0;
  }

  dispose() {
    this.ringGeometry.dispose();
    this.clockGeometry.dispose();
    this.shellGeometry.dispose();
    this.lensGeometry.dispose();
    for (const mesh of this.shardMeshes) mesh.geometry.dispose();
    for (const mesh of this.fragMeshes) mesh.geometry.dispose();
    for (const material of this.ringMaterials) material.dispose();
    this.clockMaterial.dispose();
    this.glassMaterial.dispose();
    this.shellMaterial.dispose();
    this.lensMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('◷  Chrono Fracture');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'gyroscope speed (m/s)');
  R(cast, c, 'lifetime', 0.3, 8, 0.05, 'time held for (s)');
  R(cast, c, 'fadeTime', 0.2, 4, 0.05, 'shatter lasts (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 0.5, 8, 0.05, 'zone radius (m)');
  Editor.castAnimation(cast, c);
  R(cast, c, 'handHeight', 0, 3, 0.01, 'hand height (m)');
  R(cast, c, 'seedSize', 0.02, 0.6, 0.005, 'gyroscope size (× sphere)');

  const sphere = folder.addFolder('The sphere');
  R(sphere, c, 'sphereScale', 0.3, 2, 0.01, 'radius (× zone)');
  R(sphere, c, 'sphereLift', 0, 4, 0.01, 'centre height (m)');
  R(sphere, c, 'openTime', 0.05, 2, 0.01, 'unfolds over (s)');
  R(sphere, c, 'openStagger', 0, 0.5, 0.005, 'ring stagger (s)');

  const rings = folder.addFolder('1 · Rings');
  R(rings, c, 'ringCount', 1, MAX_RINGS, 1, 'rings');
  R(rings, c, 'ringInner', 0.1, 1.2, 0.01, 'innermost (× sphere)');
  R(rings, c, 'ringOuter', 0.2, 1.5, 0.01, 'outermost (× sphere)');
  R(rings, c, 'ringTube', 0.005, 0.25, 0.001, 'tube (m)');
  R(rings, c, 'ringBand', 0.5, 8, 0.05, 'band width (× tube)');
  R(rings, c, 'ringTilt', 0, 1.6, 0.01, 'tilt between rings (rad)');
  R(rings, c, 'ringSpin', 0, 6, 0.01, 'spin (rad/s)');
  R(rings, c, 'ringSpinSpread', 0, 2, 0.01, 'inner rings faster by');
  R(rings, c, 'ringFreeze', 0, 1, 0.01, 'slowed to as it cracks');
  R(rings, c, 'ringScatter', 1, 5, 0.05, 'flung to at shatter (×)');
  R(rings, c, 'ringTicks', 4, 180, 1, 'ticks');
  R(rings, c, 'ringTickDepth', 0, 1, 0.01, 'engraving depth');
  R(rings, c, 'ringTickWidth', 0.02, 0.4, 0.005, 'tick width');
  R(rings, c, 'ringNumerals', 1, 24, 1, 'numerals');
  R(rings, c, 'ringEngraveGlow', 0, 10, 0.05, 'engraving glow');
  R(rings, c, 'ringMetal', 0, 3, 0.01, 'reflection');
  R(rings, c, 'ringGloss', 4, 300, 1, 'gloss');
  R(rings, c, 'ringSpecular', 0, 8, 0.05, 'specular');
  R(rings, c, 'ringFresnel', 0, 4, 0.01, 'fresnel');
  R(rings, c, 'ringPulse', 0, 3, 0.01, 'pulse on tick');
  rings.addColor(c, 'colorGold').name('gold');
  rings.addColor(c, 'colorGoldDeep').name('deep gold');
  rings.addColor(c, 'colorEngrave').name('engraving');
  rings.addColor(c, 'colorGoldSpec').name('highlight');

  const clock = folder.addFolder('2 · Clock face');
  R(clock, c, 'clockRadius', 0.3, 2, 0.01, 'radius (× sphere)');
  R(clock, c, 'clockLine', 0.002, 0.1, 0.001, 'stroke (m)');
  R(clock, c, 'clockGlowWidth', 0.005, 0.4, 0.005, 'glow width (m)');
  R(clock, c, 'clockTicks', 4, 120, 1, 'ticks');
  R(clock, c, 'clockGear', 0.1, 0.8, 0.01, 'gear radius');
  R(clock, c, 'clockGearTeeth', 3, 64, 1, 'gear teeth');
  R(clock, c, 'clockHourSpeed', -3, 3, 0.01, 'hour hand (rad/s)');
  R(clock, c, 'clockMinuteSpeed', -10, 10, 0.05, 'minute hand (rad/s)');
  R(clock, c, 'clockSecondSpeed', 0, 20, 0.05, 'second hand (rad/s)');
  R(clock, c, 'clockHandSteps', 1, 120, 1, 'second hand steps');
  R(clock, c, 'clockTickStep', 0, 1, 0.01, 'stepped ↔ swept');
  R(clock, c, 'clockSweep', 0, 3, 0.01, 'sweep wedge (rad)');
  R(clock, c, 'clockSweepGlow', 0, 3, 0.01, 'sweep glow');
  R(clock, c, 'clockCoreGlow', 0, 10, 0.05, 'stroke glow');
  R(clock, c, 'clockHaloGlow', 0, 5, 0.05, 'halo glow');
  R(clock, c, 'clockOpacity', 0, 1, 0.01, 'opacity');
  R(clock, c, 'clockHeight', 0, 0.1, 0.001, 'height (m)');
  clock.addColor(c, 'colorClockCore').name('stroke');
  clock.addColor(c, 'colorClockGlow').name('glow');
  clock.addColor(c, 'colorClockSweep').name('sweep');

  const glass = folder.addFolder('3 · Glass');
  R(glass, c, 'shardCount', 0, MAX_SHARDS, 1, 'suspended shards');
  R(glass, c, 'shardSize', 0.02, 1.2, 0.01, 'shard size (m)');
  R(glass, c, 'shardSizeJitter', 0, 1, 0.01, 'size jitter');
  R(glass, c, 'shardFill', 0.1, 1.2, 0.01, 'hang out to (× sphere)');
  R(glass, c, 'shardDrift', 0, 0.6, 0.005, 'bob (m)');
  R(glass, c, 'shardTurn', 0, 3, 0.01, 'turn (rad/s)');
  R(glass, c, 'fragCount', 0, MAX_FRAGS, 1, 'shell fragments');
  R(glass, c, 'fragSize', 0.05, 1.5, 0.01, 'fragment size (m)');
  R(glass, c, 'fragSpeed', 0, 25, 0.1, 'fragment speed (m/s)');
  R(glass, c, 'fragGravity', -30, 0, 0.1, 'fragment gravity');
  R(glass, c, 'fragTumble', 0, 30, 0.1, 'fragment tumble');
  R(glass, c, 'fragLife', 0.1, 1, 0.01, 'fragment life (× fade)');
  R(glass, c, 'glassOpacity', 0, 1, 0.01, 'opacity');
  R(glass, c, 'glassFresnel', 0, 6, 0.01, 'fresnel');
  R(glass, c, 'glassEnv', 0, 3, 0.01, 'reflection');
  R(glass, c, 'glassIridescence', 0, 1, 0.01, 'iridescence');
  R(glass, c, 'glassCaustic', 0, 3, 0.01, 'caustics');
  R(glass, c, 'glassGlow', 0, 4, 0.01, 'glow');
  glass.addColor(c, 'colorGlass').name('glass');
  glass.addColor(c, 'colorGlassRim').name('rim');

  const shell = folder.addFolder('4 · Shell & cracks');
  R(shell, c, 'shellOpacity', 0, 1, 0.01, 'opacity');
  R(shell, c, 'shellFresnel', 0.3, 8, 0.05, 'rim power');
  R(shell, c, 'shellGlow', 0, 5, 0.01, 'glow');
  R(shell, c, 'shellHex', 0, 1, 0.01, 'lattice');
  R(shell, c, 'shellHexScale', 1, 20, 0.1, 'lattice scale');
  R(shell, c, 'crackTime', 0.05, 3, 0.01, 'cracks spread over (s)');
  R(shell, c, 'crackScale', 1, 12, 0.05, 'crack cells');
  R(shell, c, 'crackWidth', 0.005, 0.2, 0.001, 'crack width');
  R(shell, c, 'crackGlow', 0, 15, 0.1, 'crack glow');
  R(shell, c, 'crackJag', 0, 1, 0.01, 'jaggedness');
  shell.addColor(c, 'colorShell').name('shell');
  shell.addColor(c, 'colorShellRim').name('rim');
  shell.addColor(c, 'colorCrack').name('crack');
  shell.addColor(c, 'colorCrackHot').name('crack front');

  const motes = folder.addFolder('5 · Motes & lens');
  R(motes, c, 'moteRate', 0, 300, 1, 'motes / s');
  R(motes, c, 'moteSize', 0.01, 0.4, 0.005, 'mote size');
  R(motes, c, 'moteLifetime', 0.2, 6, 0.05, 'mote life (s)');
  R(motes, c, 'moteDrift', 0, 2, 0.01, 'drift (m/s)');
  Editor.gradient(motes, c, 'colorMote', 'mote colour');
  R(motes, c, 'lensStrength', 0, 4, 0.01, 'eddy strength');
  R(motes, c, 'lensReach', 0.5, 3, 0.01, 'reach (× sphere)');
  R(motes, c, 'lensSwirl', -2, 2, 0.01, 'swirl');
  R(motes, c, 'lensRipple', 0, 1, 0.01, 'ripple');
  R(motes, c, 'lensShock', 0, 6, 0.01, 'shatter pulse');

  const hold = folder.addFolder('6 · Hold & shatter');
  R(hold, c, 'holdReach', 0.2, 2, 0.01, 'reach (× sphere)');
  R(hold, c, 'holdStain', 0, 1, 0.01, 'amber tint');
  R(hold, c, 'holdStainTime', 0.05, 3, 0.01, 'tint takes (s)');
  R(hold, c, 'holdRimGlow', 0, 10, 0.05, 'held rim glow');
  hold.addColor(c, 'colorStain').name('held body');
  hold.addColor(c, 'colorStainRim').name('held rim');
  R(hold, c, 'killImpulse', 0, 25, 0.1, 'thrown out (m/s)');
  R(hold, c, 'killLift', 0, 15, 0.1, 'thrown up (m/s)');
  R(hold, c, 'killSpin', 0, 4, 0.01, 'torque');
  R(hold, c, 'shockRadius', 0.5, 20, 0.1, 'shockwave radius (m)');
  R(hold, c, 'shockLife', 0.1, 3, 0.01, 'shockwave life (s)');
  R(hold, c, 'burstRadius', 0.5, 12, 0.1, 'air burst radius (m)');
  R(hold, c, 'burstLife', 0.1, 2, 0.01, 'air burst life (s)');
  R(hold, c, 'sparkCount', 0, 600, 1, 'sparks');
  R(hold, c, 'sparkSpeed', 0, 40, 0.1, 'spark speed');
  R(hold, c, 'sparkSize', 0.01, 0.4, 0.005, 'spark size');
  R(hold, c, 'sparkLifetime', 0.1, 3, 0.01, 'spark life (s)');
  Editor.gradient(hold, c, 'colorSpark', 'spark colour');
  R(hold, c, 'glitterCount', 0, 800, 1, 'glitter');
  R(hold, c, 'glitterSize', 0.01, 0.3, 0.005, 'glitter size');
  R(hold, c, 'glitterLifetime', 0.1, 4, 0.05, 'glitter life (s)');
  R(hold, c, 'shatterFlash', 0, 3, 0.01, 'shatter flash');
  R(hold, c, 'shatterShake', 0, 3, 0.01, 'shatter shake');
  R(hold, c, 'openShake', 0, 1, 0.01, 'open shake');
  R(hold, c, 'tickShake', 0, 0.3, 0.005, 'tick shake');
  R(hold, c, 'shatterLight', 0, 40, 0.1, 'shatter light');
  hold.addColor(c, 'colorFlash').name('flash');
  hold.addColor(c, 'colorShockHot').name('shock edge');
  hold.addColor(c, 'colorShockBody').name('shock body');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 30, 0.1, 'radius');

  folder.close();
  return folder;
}
