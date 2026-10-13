import { InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { Ability } from '../Ability.js';
import {
  createAvalancheDriftGeometry,
  createAvalancheShellGeometry,
  createIceBoulderGeometry
} from '../../assets/codex/AvalancheWakeGeometry.js';
import {
  MAX_RUTS,
  createAvalancheBoulderMaterial,
  createAvalancheDriftMaterial,
  createAvalancheShellMaterial,
  createAvalancheWarpMaterial
} from '../../materials/codex/AvalancheWakeMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing, randRange } from '../../utils/math.js';

export const ID = 'avalanche';

const TAU = Math.PI * 2;
const GRAVITY = 9.8;

/** Hard ceiling on boulders per cast. The editor's count slider clamps to this. */
const MAX_BOULDERS = 32;
/** How many bodies one wave can be carrying at once. */
const MAX_CARRY = 10;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _at = new Vector3();
const _local = new Vector3();
const _floor = new Vector3();
const _scale = new Vector3();
const _axis = new Vector3();
const _up = new Vector3(0, 1, 0);
const _down = new Vector3(0, -1, 0);
const _turn = new Quaternion();
const _matrix = new Matrix4();

/**
 * AVALANCHE WAKE — a rolling front of snow ploughed down the line.
 *
 * A line cast. A wall of powder heaves up off the caster's feet and rolls away
 * down the line at a heavy, steady pace, ice boulders tumbling and bouncing
 * inside it. Whatever it meets it swallows and carries; at the end of the line
 * it breaks into a burst of powder, the boulders are thrown clear, and what it
 * was carrying is dumped and buried in the heap. The packed snow it laid down
 * the line lingers, then melts away.
 *
 * Seven layers, each a folder in the editor:
 *
 *   1. **the front** — one bespoke shell (`createAvalancheShellMaterial`): a
 *      parameter grid bent in the vertex stage into a curling wall whose
 *      billows are fbm sampled in a domain that *turns* with the distance
 *      rolled, so they climb the back, go over the crest and come down the face.
 *      Soft-volume shading: dense face-on, noise-eroded at the silhouette, lit
 *      by the stage's sun with a wrapped term and backlit through its edges.
 *   2. **the shove** — the same shell a size up on `LAYER.DISTORTION`: the air
 *      the wave pushes ahead of itself, bent along the shell's normal.
 *   3. **powder** — non-additive, lit SMOKE thrown off the face and curling
 *      forward over the crest (inheriting the front's speed, so it keeps pace
 *      and then drags behind), a low settling haze left in the wake, and
 *      additive diamond dust glittering in the air behind it.
 *   4. **the boulders** — an InstancedMesh of faceted ice (opaque, on
 *      `LAYER.WORLD` so they cast shadows and the powder feathers against
 *      them). Each one *rolls* — its turn is integrated from distance over its
 *      own radius — hops on a bounce cadence measured in metres, and throws ice
 *      chips and a puff of snow every time it lands. At the break they are
 *      thrown, simulated ballistically with restitution and friction, settle,
 *      and sink into the snow as it melts.
 *   5. **the drift** — a ground mesh laid down the line behind the face: a
 *      banked, lumpy strip of packed snow with a fresh thick lip just behind
 *      the front, the ruts each boulder gouged (their live lateral tracks are
 *      handed to the shader), a heap where the wave broke, glints, and a
 *      patchy wet melt that erodes it into the floor.
 *   6. **engulf** — `handlesOwnHits`. Bodies the face reaches are cut loose
 *      with a soft shove, then *carried*: `Dummy#carry` with a field that is
 *      the front's own velocity, a spring toward the body's place inside the
 *      wall (measured off the body's centre, so it moves the body without
 *      flattening it) and a rigid roll about the lateral axis, so they tumble
 *      with the wave. When it breaks they are flung forward and down into the
 *      heap, let go, and the floor is lowered under them (`Dummy#sink`) so the
 *      snow closes over them.
 *   7. **the break** — the front surges up and collapses on a noise threshold
 *      while it rolls on a few metres; a frost shell, shockwave, rime and a
 *      dust ring; powder, diamond dust and chips thrown up; a knock on the
 *      camera, a flash and a punch of light. The camera rumbles the whole time
 *      the wave is rolling.
 *
 * ## The editor rule
 *
 * A cast captures dice and a handful of integrated phases (the roll, the bob,
 * each boulder's turn and bounce cadence). Every metre and second is resolved
 * from `settings.avalanche` each frame, so dragging the wall's height, the
 * boulders' size or the drift's depth reshapes a wave already rolling.
 */
export class AvalancheWakeAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The wave takes hold of what it meets — it does not knock it down. */
  get handlesOwnHits() {
    return true;
  }

  /** Boulders on screen plus bodies being carried. HUD readout only. */
  get instanceCount() {
    return this.boulders.count + this._carryCount;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layers 1 + 2: one grid, drawn twice ---- */
    this.shellGeometry = createAvalancheShellGeometry();
    this.shellMaterial = createAvalancheShellMaterial();
    this.shell = new Mesh(this.shellGeometry, this.shellMaterial);
    this.shell.name = 'AvalancheFront';
    this.shell.layers.set(LAYER.VFX);
    // Before the powder puffs (10), so the puffs in front of the wall read on it.
    this.shell.renderOrder = 9;
    this.shell.frustumCulled = false;
    this.shell.visible = false;
    this.group.add(this.shell);

    this.warpMaterial = createAvalancheWarpMaterial();
    this.warp = new Mesh(this.shellGeometry, this.warpMaterial);
    this.warp.name = 'AvalancheShove';
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.warp.visible = false;
    this.group.add(this.warp);

    /* ---- layer 4: the boulders ---- */
    this.boulderGeometry = createIceBoulderGeometry(Math.random() * 10, 0.3);
    const seeds = new InstancedBufferAttribute(new Float32Array(MAX_BOULDERS), 1);
    for (let i = 0; i < MAX_BOULDERS; i++) seeds.array[i] = Math.random() * 10;
    this.boulderGeometry.setAttribute('aSeed', seeds);
    this.boulderMaterial = createAvalancheBoulderMaterial();
    this.boulders = new InstancedMesh(this.boulderGeometry, this.boulderMaterial, MAX_BOULDERS);
    this.boulders.name = 'AvalancheBoulders';
    // Solid ice: in the depth prepass so the powder feathers against it, and
    // casting the sun's shadow onto the drift.
    this.boulders.layers.set(LAYER.WORLD);
    this.boulders.castShadow = true;
    this.boulders.receiveShadow = false;
    this.boulders.frustumCulled = false;
    this.boulders.count = 0;
    this.group.add(this.boulders);

    this.boulderRecords = [];
    for (let i = 0; i < MAX_BOULDERS; i++) {
      this.boulderRecords.push({
        // dice, rolled per cast
        lat: 0,
        back: 0,
        size: 0,
        phase: 0,
        tilt: 0,
        sx: 1,
        sy: 1,
        sz: 1,
        throwDice: 0,
        // state
        pos: new Vector3(),
        vel: new Vector3(),
        quat: new Quaternion(),
        axis: new Vector3(),
        spin: 0,
        hop: 0, // bounces done, so each landing fires once
        mode: 0, // 0 riding, 1 thrown, 2 settled
        settle: 0
      });
    }

    /* ---- layer 5: the drift ---- */
    this.driftGeometry = createAvalancheDriftGeometry();
    this.driftMaterial = createAvalancheDriftMaterial();
    this.drift = new Mesh(this.driftGeometry, this.driftMaterial);
    this.drift.name = 'AvalancheDrift';
    this.drift.layers.set(LAYER.VFX);
    // Under the decals (6+) so the rime lands on the snow, before the powder.
    this.drift.renderOrder = 4;
    this.drift.frustumCulled = false;
    this.drift.visible = false;
    this.group.add(this.drift);

    /** Scratch state handed to the materials — one object apiece, reused. */
    this._frontState = { scale: 0, bob: 0, roll: 0, phase: 0, seed: 0, dissolve: 0, fade: 1, strength: 0 };
    this._driftState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      length: 1,
      laid: 0,
      ruts: new Float32Array(MAX_RUTS),
      rutCount: 0,
      heapAcross: 0,
      heapAlong: 0,
      heap: 0,
      melt: 0,
      seed: 0
    };

    /** Per-cast clocks. */
    this._seed = 0;
    this._roll = 0;
    this._phase = 0;
    this._bobPhase = 0;
    this._along = 0;
    this._prevAlong = 0;
    this._frontSpeed = 0;
    this._breakT = 0;
    this._broken = false;
    this._dumped = false;

    /* ---- layer 6: the bodies being carried ---- */
    this._carry = [];
    for (let i = 0; i < MAX_CARRY; i++) this._carry.push({ dummy: null, time: 0, lat: 0, height: 0 });
    this._carryCount = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    /** What `_sampleCarry` reads — filled per body, so the field allocates nothing. */
    this._flow = { vx: 0, vy: 0, vz: 0, cx: 0, cy: 0, cz: 0, spin: 0 };
    this._carryField = (x, y, z, out) => this._sampleCarry(x, y, z, out);
    this._dumpField = (x, y, z, out) => this._sampleDump(x, y, z, out);
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 3: powder off the face ---- */
    // Not additive: snow has to cover what is behind it, and lit so the puffs
    // have a sunny side and a shaded one like the shell they came off.
    this.powder = particles.get('avalanche.powder', {
      capacity: 3200,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      lit: true,
      softFade: 0.8
    });
    this.powder.uniforms.uSizeIn.value = 0.12;
    this.powder.uniforms.uFadeIn.value = 0.08;
    this.powder.uniforms.uFadeOut.value = 0.5;
    this.powder.uniforms.uTurbFrequency.value = 0.5;
    this.powder.uniforms.uTurbSpeed.value = 0.6;

    /* ---- the haze settling in the wake ---- */
    this.haze = particles.get('avalanche.haze', {
      capacity: 1600,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      lit: true,
      softFade: 1.0
    });
    this.haze.uniforms.uSizeIn.value = 0.2;
    this.haze.uniforms.uFadeIn.value = 0.2;
    this.haze.uniforms.uFadeOut.value = 0.55;
    this.haze.uniforms.uEndSize.value = 2.0;
    this.haze.uniforms.uTurbFrequency.value = 0.35;
    this.haze.uniforms.uTurbSpeed.value = 0.3;

    /* ---- diamond dust ---- */
    this.sparkle = particles.get('avalanche.sparkle', {
      capacity: 1800,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.2
    });
    this.sparkle.uniforms.uSizeIn.value = 0.05;
    this.sparkle.uniforms.uFadeIn.value = 0.1;
    this.sparkle.uniforms.uFadeOut.value = 0.5;
    this.sparkle.uniforms.uEndSize.value = 0.6;
    this.sparkle.uniforms.uDrag.value = 1.8;
    this.sparkle.uniforms.uGravity.value.set(0, -0.35, 0);

    /* ---- ice chips off every landing ---- */
    this.chips = particles.get('avalanche.chips', {
      capacity: 900,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.15
    });
    this.chips.uniforms.uSizeIn.value = 0.02;
    this.chips.uniforms.uFadeIn.value = 0.02;
    this.chips.uniforms.uFadeOut.value = 0.35;
    this.chips.uniforms.uEndSize.value = 0.7;
    this.chips.uniforms.uDrag.value = 0.5;
    this.chips.uniforms.uGravity.value.set(0, -GRAVITY, 0);

    this.powderEmitter = new RateEmitter();
    this.hazeEmitter = new RateEmitter();
    this.sparkleEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the wave breaking. */
  get impactDuration() {
    return Math.max(0.1, settings.avalanche.breakTime * settings.global.lifetime);
  }

  /** The fade is the drift lingering and melting away. */
  get fadeDuration() {
    return Math.max(0.2, settings.avalanche.lifetime * settings.global.lifetime);
  }

  /** Churning: a low, slow pulse, the powder swallowing and giving back the glow. */
  lightShimmer() {
    const f = settings.avalanche.lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 6.1) * Math.sin(this.age * 2.3 + 1.1));
  }

  /* ------------------------------------------------------------------ */
  /* The front on the CPU                                                */
  /* ------------------------------------------------------------------ */

  /**
   * The shell at (u, v) in the front's local frame, without its billows. The
   * CPU twin of `frontPoint` in AvalancheWakeMaterials — keep them together.
   * Used to throw the powder off the real surface.
   */
  _frontLocal(u, v, out) {
    const c = settings.avalanche;
    const s = this._frontState;
    const taper = Math.pow(Math.max(1 - u * u, 0), Math.max(c.frontTaper, 0.05));
    const th = saturate(v) * Math.PI;
    const sn = Math.sin(th);
    const H = c.frontHeight * (0.22 + 0.78 * taper) * s.scale * (1 + s.bob);
    const D = c.frontDepth * (0.55 + 0.45 * taper) * s.scale;
    out.x = u * c.frontWidth * s.scale * (1 + 0.12 * sn);
    out.y = Math.pow(sn, 0.85) * H;
    out.z = -D * 0.5 * (1 + Math.cos(th));
    out.z += c.frontCurl * D * sn * sn * smoothstep(0.3, 0.85, v);
    out.z -= u * u * D * 0.4;
    return out;
  }

  /** Front-local → world. +X is the line's right (`side`), +Z its direction. */
  _toWorld(local, out) {
    return out
      .copy(this.origin)
      .addScaledVector(this.direction, this._along + local.z)
      .addScaledVector(this.side, local.x)
      .setY(local.y);
  }

  /** The wall's current half-width, metres. */
  get _halfWidth() {
    return settings.avalanche.frontWidth * Math.max(0.05, this._frontState.scale);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.avalanche;
    const g = settings.global;

    this.powderEmitter.reset();
    this.hazeEmitter.reset();
    this.sparkleEmitter.reset();

    this._seed = Math.random() * 100;
    this._roll = Math.random() * TAU;
    this._phase = Math.random() * 10;
    this._bobPhase = Math.random() * TAU;
    this._along = 0;
    this._prevAlong = 0;
    this._frontSpeed = 0;
    this._breakT = 0;
    this._broken = false;
    this._dumped = false;
    this._releaseCarry();

    const fs = this._frontState;
    fs.seed = this._seed;
    fs.scale = 0;
    fs.dissolve = 0;
    fs.fade = 1;

    this._rollBoulders();

    const yaw = Math.atan2(this.direction.x, this.direction.z);
    this.shell.rotation.set(0, yaw, 0);
    this.warp.rotation.set(0, yaw, 0);
    this.shell.visible = true;
    this.warp.visible = true;
    this.drift.visible = true;

    /* the powder kicked up off the caster's feet as the wall heaves up */
    this._resetEmit(frame.uTime.value);
    _pos.copy(this.origin).addScaledVector(this.direction, 0.8).setY(0.3);
    _emit.position = _pos;
    _emit.radius = 0.8;
    _emit.direction = _dir.copy(this.direction).setY(0.6).normalize();
    _emit.speed = c.powderSpeed * 0.8;
    _emit.spread = 0.9;
    _emit.size = c.powderSize * 0.7;
    _emit.life = c.powderLifetime;
    _emit.spin = 0.5;
    this.powder.emit(Math.round(c.castPuff * g.particleCount), _emit);

    this._sync(0, 0);
  }

  /** Re-roll every boulder's dice. Unitless only — sizes are resolved live. */
  _rollBoulders() {
    for (const b of this.boulderRecords) {
      b.lat = randRange(-1, 1);
      b.back = Math.random();
      b.size = randRange(-1, 1);
      b.phase = Math.random();
      b.tilt = randRange(-1, 1);
      b.sx = randRange(0.85, 1.2);
      b.sy = randRange(0.75, 1.05);
      b.sz = randRange(0.85, 1.2);
      b.throwDice = Math.random();
      b.quat.setFromAxisAngle(_axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), Math.random() * TAU);
      b.vel.set(0, 0, 0);
      b.spin = 0;
      b.hop = -1;
      b.mode = 0;
      b.settle = 0;
    }
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
  _advance(dt) {
    const c = settings.avalanche;
    const g = settings.global;
    const step = Math.max(0, this._along - this._prevAlong);
    this._frontSpeed = dt > 0 ? step / dt : 0;
    // True rolling for a wheel half the wall's height, scaled by the slider.
    const radius = Math.max(0.2, c.frontHeight * 0.5 * Math.max(0.2, this._frontState.scale));
    this._roll += (step / radius) * c.rollSpeed * g.animationSpeed;
    this._phase += dt * g.noiseSpeed;
    this._bobPhase += c.frontBobSpeed * dt * g.animationSpeed;
  }

  /**
   * Resolve the front, its warp, the drift and the particle looks.
   * @param {number} breakT 0 rolling .. 1 fully collapsed
   * @param {number} melt 0..1 through the melt
   */
  _sync(breakT, melt) {
    const c = settings.avalanche;
    const g = settings.global;
    const fs = this._frontState;

    // Heaves up off the hand, grows as it gathers snow, surges and falls at the end.
    const rise = Easing.outBack(saturate(this.age / Math.max(0.02, c.frontRise)));
    const gather = 1 + c.frontGrowth * saturate(this._along / Math.max(0.5, this.length));
    const surge = 1 + c.breakSurge * Math.sin(Math.PI * saturate(breakT * 1.6)) * (1 - breakT);
    fs.scale = Math.max(0, rise) * gather * surge * (1 - Easing.inQuad(breakT) * 0.35);
    fs.bob = c.frontBob * g.randomness * Math.sin(this._bobPhase) / Math.max(0.2, c.frontHeight);
    fs.roll = this._roll;
    fs.phase = this._phase;
    fs.dissolve = smoothstep(0.15, 1, breakT);
    fs.fade = 1;
    fs.strength = saturate(rise) * (1 - fs.dissolve);
    this.shellMaterial.userData.sync(fs);
    this.warpMaterial.userData.sync(fs);

    _pos.copy(this.origin).addScaledVector(this.direction, this._along);
    this.shell.position.copy(_pos);
    this.warp.position.copy(_pos);

    /* the drift */
    const ds = this._driftState;
    ds.start.copy(this.origin);
    ds.dir.copy(this.direction);
    ds.side.copy(this.side);
    ds.length = this.length + c.breakDrift + c.heapRadius + 1.5;
    // Laid just behind the face; when it breaks, filled on out to the heap.
    ds.laid = Math.max(0, this._along - c.driftLag + Easing.outCubic(breakT) * (c.driftLag + c.heapRadius));
    ds.heapAcross = 0;
    ds.heapAlong = this.length + c.breakDrift * 0.55;
    ds.heap = Easing.outCubic(smoothstep(0.05, 0.75, breakT));
    ds.melt = melt;
    ds.seed = this._seed;
    // The ruts are the live tracks of the first boulders.
    const live = Math.min(MAX_RUTS, this.boulders.count);
    const spread = c.boulderSpread * this._halfWidth;
    for (let i = 0; i < live; i++) ds.ruts[i] = this.boulderRecords[i].lat * spread;
    ds.rutCount = live;
    this.driftMaterial.userData.sync(ds);

    this.boulderMaterial.userData.sync();

    /* the particles' looks */
    this.powder.setGradient(getColor(c.colorPowderA), getColor(c.colorPowderB), getColor(c.colorPowderC), getColor(c.colorPowderD));
    const p = this.powder.uniforms;
    p.uDrag.value = c.powderDrag;
    p.uEndSize.value = c.powderEndSize;
    p.uGravity.value.set(0, -0.6, 0);
    p.uSizeScale.value = g.particleSize;
    p.uLifeScale.value = g.particleLifetime;
    p.uSpeedScale.value = g.particleSpeed;
    p.uOpacity.value = c.powderOpacity * g.opacity;
    p.uTurbulence.value = c.powderTurbulence * g.turbulence;

    this.haze.setGradient(getColor(c.colorPowderB), getColor(c.colorPowderB), getColor(c.colorPowderC), getColor(c.colorPowderD));
    const h = this.haze.uniforms;
    h.uDrag.value = 1.2;
    h.uGravity.value.set(0, -0.15, 0);
    h.uSizeScale.value = g.particleSize;
    h.uLifeScale.value = g.particleLifetime;
    h.uSpeedScale.value = g.particleSpeed;
    h.uOpacity.value = c.trailOpacity * g.opacity;
    h.uTurbulence.value = 0.5 * g.turbulence;

    this.sparkle.setGradient(getColor(c.colorSparkleA), getColor(c.colorSparkleB), getColor(c.colorSparkleC), getColor(c.colorSparkleD));
    const s = this.sparkle.uniforms;
    s.uSizeScale.value = g.particleSize;
    s.uLifeScale.value = g.particleLifetime;
    s.uSpeedScale.value = g.particleSpeed;
    s.uOpacity.value = g.opacity;
    s.uGlow.value = c.sparkleGlow * g.glow;
    s.uTurbulence.value = 0.6 * g.turbulence;

    this.chips.setGradient(getColor(c.colorChipA), getColor(c.colorChipB), getColor(c.colorChipC), getColor(c.colorChipD));
    const k = this.chips.uniforms;
    k.uSizeScale.value = g.particleSize;
    k.uLifeScale.value = g.particleLifetime;
    k.uSpeedScale.value = g.particleSpeed;
    k.uOpacity.value = g.opacity;
    k.uTurbulence.value = 0.1 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* Travel                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.avalanche;
    this._prevAlong = this._along;
    this._along = this.front;
    this._advance(dt);
    this._sync(0, 0);

    this._updateBoulders(dt, 0);
    this._rollingFx(dt, 1);
    this._engulf();
    this._carryBodies(dt);
    this.ctx.shake.rumble(c.rollRumble, dt);

    // The light rides inside the wall.
    this.position.copy(this.origin).addScaledVector(this.direction, this._along - c.frontDepth * 0.4);
    this.position.y = c.frontHeight * 0.5;
  }

  /* ------------------------------------------------------------------ */
  /* Impact — the wave breaks                                            */
  /* ------------------------------------------------------------------ */

  onImpact() {
    const c = settings.avalanche;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._breakT = 0;
    this._broken = true;

    // Where it breaks: a little past the end of the line, where the heap goes.
    this.pointAt(1, _floor).addScaledVector(this.direction, c.breakDrift * 0.55);
    _floor.y = 0;

    this.ctx.bursts.spawn(BurstMode.FROST, _pos.copy(_floor).setY(c.frontHeight * 0.35), {
      radius: c.burstSize * 0.2,
      endRadius: c.burstSize * power,
      life: 0.8,
      intensity: c.burstIntensity,
      opacity: 0.55,
      fresnel: 2.2,
      displace: 0.4,
      squash: 0.6,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: 0.7,
      width: 0.08,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.FROST, _floor, {
      radius: c.frostRadius,
      life: c.frostLife,
      intensity: 1,
      growth: 0.25,
      colorA: getColor(c.colorFrostA),
      colorB: getColor(c.colorFrostB)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _floor, {
      radius: c.frostRadius * 1.3,
      life: 1.6,
      intensity: 1.2,
      colorA: getColor(c.colorPowderC),
      colorB: getColor(c.colorPowderA)
    });

    /* the powder thrown up as it breaks */
    this._resetEmit(time);
    _pos.copy(_floor).setY(0.6);
    _emit.position = _pos;
    _emit.radius = c.frontWidth * 0.6;
    _emit.direction = _dir.copy(this.direction).multiplyScalar(0.6).add(_up).normalize();
    _emit.speed = c.powderSpeed * 1.6;
    _emit.spread = 0.9;
    _emit.size = c.powderSize * 1.2;
    _emit.life = c.powderLifetime * 1.4;
    _emit.spin = 0.4;
    this.powder.emit(Math.round(c.powderBurst * g.particleCount), _emit);

    _emit.radius = c.frontWidth * 0.8;
    _emit.speed = c.powderSpeed * 1.2;
    _emit.size = c.sparkleSize;
    _emit.life = c.sparkleLifetime * 1.5;
    _emit.spin = 0;
    this.sparkle.emit(Math.round(c.sparkleBurst * g.particleCount), _emit);

    _emit.radius = c.frontWidth * 0.5;
    _emit.speed = c.chipSpeed * 1.4;
    _emit.size = c.chipSize * 1.3;
    _emit.life = c.chipLifetime;
    _emit.spin = 8;
    this.chips.emit(Math.round(40 * g.particleCount), _emit);

    /* the boulders are thrown clear */
    this._scatterBoulders();

    this.ctx.shake.add(c.impactShake * power, 1 / Math.max(0.05, c.shakeDuration), 14);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.lightIntensity * c.impactLight * power;
  }

  onFade(dt, t) {
    const c = settings.avalanche;

    if (t <= 1) {
      // Rolls on a few metres while it collapses.
      this._breakT = t;
      this._prevAlong = this._along;
      this._along = this.length + c.breakDrift * Easing.outCubic(t);
      this._advance(dt);
      this._sync(t, 0);
      this._updateBoulders(dt, 0);
      this._rollingFx(dt, 1 - Easing.inQuad(t));
      if (t < 0.4) {
        this._engulf();
        this._carryBodies(dt);
      } else if (!this._dumped) {
        this._dump();
      }
      this.position.copy(this.origin).addScaledVector(this.direction, this._along - c.frontDepth * 0.3);
      this.position.y = c.frontHeight * 0.4 * (1 - t) + 0.4;
      return;
    }

    /* the linger: the drift lies there, then melts */
    if (!this._dumped) this._dump();
    const ft = saturate(t - 1);
    this.shell.visible = false;
    this.warp.visible = false;
    const melt = saturate((ft - c.meltDelay) / Math.max(0.05, 1 - c.meltDelay));
    this._advance(0);
    this._sync(1, Easing.inOutQuad(melt));
    this._updateBoulders(dt, melt);
    this._rollingFx(dt, 0);
    // Cold wisps still coming off the heap for a while.
    const g = settings.global;
    const wisps = Math.round(this.hazeEmitter.tick(dt, c.trailRate * 0.25 * (1 - ft)) * g.particleCount);
    if (wisps > 0) {
      this._resetEmit(frame.uTime.value);
      this.pointAt(1, _pos).addScaledVector(this.direction, c.breakDrift * 0.55).setY(0.4);
      _emit.position = _pos;
      _emit.radius = c.heapRadius * 0.7;
      _emit.direction = _up;
      _emit.speed = 0.4;
      _emit.spread = 0.6;
      _emit.size = c.trailSize * 0.8;
      _emit.life = c.trailLifetime;
      _emit.spin = 0.3;
      this.haze.emit(wisps, _emit);
    }
    this.position.copy(this.origin).addScaledVector(this.direction, this._along).setY(0.5);
  }

  /* ------------------------------------------------------------------ */
  /* The boulders                                                        */
  /* ------------------------------------------------------------------ */

  /** Mean-relative radius of one boulder, metres. */
  _radiusOf(b) {
    const c = settings.avalanche;
    return Math.max(0.05, c.boulderSize * (1 + b.size * c.boulderSizeJitter));
  }

  /**
   * Ride, fly, settle — and write the instance matrices.
   * @param {number} melt 0..1 — settled boulders sink and shrink with the snow
   */
  _updateBoulders(dt, melt) {
    const c = settings.avalanche;
    const count = Math.min(MAX_BOULDERS, Math.max(0, Math.round(c.boulderCount)));
    const fs = this._frontState;
    const step = Math.max(0, this._along - this._prevAlong);
    const half = this._halfWidth;

    for (let i = 0; i < count; i++) {
      const b = this.boulderRecords[i];
      const r = this._radiusOf(b);
      let shown = 1;

      if (b.mode === 0) {
        /* riding the front: rolls with the distance, hops on a cadence in metres */
        const along = this._along - r * 0.8 - b.back * c.boulderBack * fs.scale;
        const lat = b.lat * c.boulderSpread * half;
        const cadence = this._along * c.boulderBounceRate + b.phase;
        const hop = Math.floor(cadence);
        const arc = Math.sin(Math.PI * (cadence - hop));
        const lift = c.boulderBounce * (0.5 + 0.5 * Math.abs(b.tilt)) * arc;
        b.pos.copy(this.origin).addScaledVector(this.direction, along).addScaledVector(this.side, lat);
        b.pos.y = r * 0.9 + lift;
        // Landed: once per hop, and not the frame it was born on.
        if (hop !== b.hop) {
          if (b.hop >= 0 && fs.scale > 0.5) this._landFx(b.pos, r, 0.7);
          b.hop = hop;
        }
        // The axis it rolls about: the lateral, tipped by its own dice.
        _axis.copy(this.side).multiplyScalar(-1).addScaledVector(_up, b.tilt * c.boulderWobble).normalize();
        const turn = (step / r) * c.boulderSpin;
        if (turn > 0) b.quat.premultiply(_turn.setFromAxisAngle(_axis, turn));
        b.vel.copy(this.direction).multiplyScalar(this._frontSpeed);
        // Grows in with the wall heaving up — nothing pops in.
        shown = saturate(fs.scale * 1.4);
      } else if (b.mode === 1 && dt > 0) {
        /* thrown: ballistic, bouncing with restitution and friction */
        b.vel.y -= GRAVITY * dt;
        b.pos.addScaledVector(b.vel, dt);
        if (b.spin > 0) b.quat.premultiply(_turn.setFromAxisAngle(b.axis, b.spin * dt));
        if (b.pos.y < r * 0.85) {
          b.pos.y = r * 0.85;
          const impact = -b.vel.y;
          if (impact > 1.2) this._landFx(b.pos, r, saturate(impact / 6));
          b.vel.y = impact * c.boulderRestitution;
          const keep = 1 - c.boulderFriction;
          b.vel.x *= keep;
          b.vel.z *= keep;
          b.spin *= keep;
          if (impact < 1.0 && b.vel.x * b.vel.x + b.vel.z * b.vel.z < 0.3) {
            b.mode = 2;
            b.settle = 0;
          }
        }
      } else if (b.mode === 2) {
        /* settled: bedding into the snow, then going with it */
        b.settle += dt / Math.max(0.05, c.boulderSink);
        b.pos.y = r * lerp(0.85, 0.45, Easing.outCubic(saturate(b.settle))) - r * melt * 0.6;
        shown = 1 - smoothstep(0.4, 1, melt);
      }

      _scale.set(b.sx * r, b.sy * r, b.sz * r).multiplyScalar(Math.max(1e-4, shown));
      _matrix.compose(b.pos, b.quat, _scale);
      this.boulders.setMatrixAt(i, _matrix);
    }

    this.boulders.count = count;
    this.boulders.instanceMatrix.needsUpdate = true;
  }

  /** The front breaks: every boulder is thrown on out of it. */
  _scatterBoulders() {
    const c = settings.avalanche;
    const g = settings.global;
    for (const b of this.boulderRecords) {
      if (b.mode !== 0) continue;
      const k = 0.55 + 0.65 * b.throwDice;
      b.vel.copy(this.direction).multiplyScalar(c.scatterSpeed * k * g.explosionIntensity);
      b.vel.addScaledVector(this.side, b.lat * c.scatterSpeed * 0.55);
      b.vel.y = c.scatterLift * (0.45 + 0.75 * (1 - b.throwDice)) * g.explosionIntensity;
      b.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      b.spin = c.scatterSpin * (0.5 + Math.random());
      b.mode = 1;
    }
  }

  /** Chips and a puff of snow where a boulder came down. */
  _landFx(at, r, strength) {
    const c = settings.avalanche;
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _pos.copy(at).setY(0.1);
    _emit.position = _pos;
    _emit.radius = r * 0.6;
    _emit.direction = _dir.copy(_up).addScaledVector(this.direction, 0.4).normalize();
    _emit.speed = c.chipSpeed * (0.5 + strength);
    _emit.spread = 0.8;
    _emit.size = c.chipSize;
    _emit.life = c.chipLifetime;
    _emit.spin = 9;
    this.chips.emit(Math.round(c.chipsPerBounce * g.particleCount), _emit);

    _emit.speed = 1.2 + strength * 2;
    _emit.spread = 0.9;
    _emit.size = c.powderSize * (0.4 + r);
    _emit.life = c.powderLifetime * 0.8;
    _emit.spin = 0.4;
    this.powder.emit(Math.max(1, Math.round(2 * g.particleCount)), _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Effects while rolling                                               */
  /* ------------------------------------------------------------------ */

  /** Powder off the face, haze in the wake, diamond dust — scaled by `strength`. */
  _rollingFx(dt, strength) {
    const c = settings.avalanche;
    const g = settings.global;
    const time = frame.uTime.value;
    const fs = this._frontState;
    const speed = this._frontSpeed;

    /* powder: thrown off the real surface, curling forward over the crest */
    const puffs = Math.round(this.powderEmitter.tick(dt, c.powderRate * strength * saturate(fs.scale)) * g.particleCount);
    if (puffs > 0) {
      this._resetEmit(time);
      _emit.size = c.powderSize * Math.max(0.3, fs.scale);
      _emit.sizeVariance = 0.5;
      _emit.life = c.powderLifetime;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0.5;
      _emit.speedVariance = 0.3;
      for (let n = 0; n < puffs; n++) {
        const u = Math.random() * 2 - 1;
        const v = 0.25 + Math.random() * 0.75;
        this._frontLocal(u, v, _local);
        this._toWorld(_local, _pos);
        // Out of the face, up, and on over the crest at the wave's own pace.
        const crest = Math.sin(v * Math.PI);
        _vel.copy(this.direction).multiplyScalar(speed * 0.8 + c.powderCurl * crest)
          .addScaledVector(_up, c.powderLift * (1.1 - v * 0.6))
          .addScaledVector(this.side, u * 1.4);
        _vel.addScaledVector(this.direction, c.powderSpeed * (v - 0.4));
        const sp = _vel.length();
        _emit.position = _pos;
        _emit.direction = sp > 1e-4 ? _dir.copy(_vel).divideScalar(sp) : _up;
        _emit.speed = sp;
        this.powder.emit(1, _emit);
      }
    }

    /* the low haze settling behind it */
    const haze = Math.round(this.hazeEmitter.tick(dt, c.trailRate * strength * saturate(fs.scale)) * g.particleCount);
    if (haze > 0) {
      this._resetEmit(time);
      _emit.size = c.trailSize;
      _emit.life = c.trailLifetime;
      _emit.spin = 0.25;
      _emit.speed = 0.5;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.7;
      for (let n = 0; n < haze; n++) {
        const back = c.frontDepth * fs.scale * (0.6 + Math.random() * 0.8);
        _pos.copy(this.origin)
          .addScaledVector(this.direction, this._along - back)
          .addScaledVector(this.side, (Math.random() * 2 - 1) * this._halfWidth * 1.05);
        _pos.y = 0.3 + Math.random() * 0.6;
        _emit.position = _pos;
        _emit.direction = _dir.copy(this.direction).multiplyScalar(0.4).add(_up).normalize();
        this.haze.emit(1, _emit);
      }
    }

    /* diamond dust glittering in the air behind the crest */
    const motes = Math.round(this.sparkleEmitter.tick(dt, c.sparkleRate * strength) * g.particleCount);
    if (motes > 0) {
      this._resetEmit(time);
      _emit.size = c.sparkleSize;
      _emit.sizeVariance = 0.6;
      _emit.life = c.sparkleLifetime;
      _emit.spin = 0;
      _emit.speed = 1.2;
      _emit.spread = 1;
      for (let n = 0; n < motes; n++) {
        this._frontLocal(Math.random() * 2 - 1, Math.random() * 0.6, _local);
        this._toWorld(_local, _pos);
        _pos.y += Math.random() * 0.8;
        _emit.position = _pos;
        _emit.direction = _up;
        _emit.inherit = _vel.copy(this.direction).multiplyScalar(speed * 0.3);
        this.sparkle.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Engulf — the bodies                                                 */
  /* ------------------------------------------------------------------ */

  _carriedSlot(dummy) {
    for (let i = 0; i < this._carryCount; i++) if (this._carry[i].dummy === dummy) return this._carry[i];
    return null;
  }

  /**
   * Take hold of every body the face has reached.
   *
   * Polled every frame: the face is a moving line, and a body is caught on the
   * frame it passes, standing or already down. A standing one is cut loose with
   * a soft shove forward — the snow hits it, but it is the carry that moves it.
   */
  _engulf() {
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    const c = settings.avalanche;
    const g = settings.global;
    const fs = this._frontState;
    if (fs.scale < 0.3) return;

    const half = this._halfWidth + c.engulfReach;
    const depth = c.frontDepth * fs.scale;
    const mid = this._along - depth * 0.5;
    this.pointAt(Math.max(0, mid) / this.length, _floor);
    const found = field.findBodies(_floor.x, _floor.z, Math.hypot(half, depth * 0.5 + c.engulfLead + 0.5), this._found);
    if (found.length === 0) return;

    this._force.impulse = c.engulfImpulse * g.explosionIntensity;
    this._force.lift = c.engulfLift * g.explosionIntensity;
    this._force.spin = c.engulfSpin;

    for (const dummy of found) {
      if (this._carryCount >= MAX_CARRY) break;
      if (this._carriedSlot(dummy)) continue;
      const from = dummy.alive ? dummy.position : dummy.bodyPoint(_at);
      if (!from) continue;
      // A body already under the floor is someone else's.
      if (!dummy.alive && from.y < -0.2) continue;
      const dx = from.x - this.origin.x;
      const dz = from.z - this.origin.z;
      const along = dx * this.direction.x + dz * this.direction.z;
      const lat = dx * this.side.x + dz * this.side.z;
      if (Math.abs(lat) > half) continue;
      if (along > this._along + c.engulfLead) continue; // the face has not got there
      if (along < this._along - depth - 0.8) continue; // behind the wave

      if (dummy.alive) {
        _dir.copy(this.direction).addScaledVector(this.side, Math.sign(lat) * 0.2).normalize();
        if (!dummy.kill(_dir.x, _dir.z, this._force)) continue;
      }
      const slot = this._carry[this._carryCount++];
      slot.dummy = dummy;
      slot.time = 0;
      slot.lat = lat / Math.max(0.1, half);
      slot.height = Math.random();
      this._engulfFx(from);
    }
  }

  /** A burst of powder where the snow closed over a body. */
  _engulfFx(at) {
    const c = settings.avalanche;
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _pos.copy(at).setY(0.8);
    _emit.position = _pos;
    _emit.radius = 0.5;
    _emit.direction = _dir.copy(this.direction).add(_up).normalize();
    _emit.speed = c.powderSpeed;
    _emit.spread = 0.8;
    _emit.size = c.powderSize;
    _emit.life = c.powderLifetime;
    _emit.spin = 0.5;
    this.powder.emit(Math.round(14 * g.particleCount), _emit);
    this.ctx.shake.add(c.impactShake * 0.25, 5, 16);
  }

  /**
   * The snow's velocity at one point — sampled once per joint of every body the
   * wave is carrying, so it reads `_flow` rather than taking anything.
   *
   * The front's own velocity, a spring toward the body's place in the wall
   * measured off the body's *centre* (so every joint gets the same pull and the
   * body is moved, not flattened), and a rigid roll about the lateral axis
   * through that centre — a rotation every bone length already agrees with, so
   * the solver lets the body tumble instead of eating the shear.
   */
  _sampleCarry(x, y, z, out) {
    const f = this._flow;
    const rx = x - f.cx;
    const ry = y - f.cy;
    const rz = z - f.cz;
    // ω (−side) × r : top goes forward, bottom goes back — the wave's own roll.
    const ax = -this.side.x;
    const az = -this.side.z;
    const w = f.spin;
    out.set(f.vx - w * az * ry, f.vy + w * (az * rx - ax * rz), f.vz + w * ax * ry);
  }

  /** The break: forward and down into the heap, all of the body at once. */
  _sampleDump(x, y, z, out) {
    const c = settings.avalanche;
    out.copy(this.direction).multiplyScalar(c.dumpThrow).addScaledVector(_down, c.dumpDown);
  }

  /** Carry every held body along inside the front. */
  _carryBodies(dt) {
    if (dt <= 0 || this._carryCount === 0) return;
    const c = settings.avalanche;
    const g = settings.global;
    const fs = this._frontState;
    const grab = saturate(c.carryGrab * dt);
    const f = this._flow;

    for (let i = this._carryCount - 1; i >= 0; i--) {
      const slot = this._carry[i];
      const dummy = slot.dummy;
      const at = dummy && !dummy.finished ? dummy.bodyPoint(_at) : null;
      if (!at) {
        this._dropCarry(i);
        continue;
      }
      slot.time += dt;
      // Eased in: the snow takes a body over a quarter of a second, not a frame.
      const wound = Easing.outCubic(saturate(slot.time / 0.25));

      // Its place in the churn: behind the face, up the wall, toward the middle.
      _pos.copy(this.origin)
        .addScaledVector(this.direction, this._along - c.carryBack * fs.scale)
        .addScaledVector(this.side, slot.lat * this._halfWidth * c.carrySpread);
      _pos.y = c.carryHeight * fs.scale * (0.7 + 0.6 * slot.height) +
        0.25 * Math.sin(this._roll + slot.height * TAU);

      const k = c.carrySpring;
      let sx = (_pos.x - at.x) * k;
      let sy = (_pos.y - at.y) * k;
      let sz = (_pos.z - at.z) * k;
      // Clamped, so a body caught three metres out of place is drawn in, not fired.
      const sl = Math.hypot(sx, sy, sz);
      const cap = 9;
      if (sl > cap) {
        sx *= cap / sl;
        sy *= cap / sl;
        sz *= cap / sl;
      }
      f.vx = this.direction.x * this._frontSpeed + sx;
      f.vy = sy;
      f.vz = this.direction.z * this._frontSpeed + sz;
      f.cx = at.x;
      f.cy = at.y;
      f.cz = at.z;
      f.spin = c.carryTumble * TAU * g.animationSpeed * wound;
      dummy.carry(this._carryField, grab * wound, grab * wound, saturate(c.carryBuoyancy) * wound);
      dummy.hold();
    }
  }

  /** The wave breaks: fling everything it is carrying into the heap and bury it. */
  _dump() {
    this._dumped = true;
    const c = settings.avalanche;
    for (let i = 0; i < this._carryCount; i++) {
      const dummy = this._carry[i].dummy;
      if (!dummy || dummy.finished) continue;
      const at = dummy.bodyPoint(_at);
      if (!at) continue;
      dummy.carry(this._dumpField, 1, 1, 0);
      dummy.release();
      // The floor gives under it: the snow closes over a body lying in it.
      dummy.sink(c.buryDepth);
      this._engulfFx(at);
    }
    this._releaseCarry();
  }

  _dropCarry(index) {
    const last = this._carryCount - 1;
    const slot = this._carry[index];
    slot.dummy?.release();
    this._carry[index] = this._carry[last];
    this._carry[last] = slot;
    slot.dummy = null;
    slot.time = 0;
    this._carryCount = last;
  }

  _releaseCarry() {
    for (let i = 0; i < this._carryCount; i++) {
      this._carry[i].dummy?.release();
      this._carry[i].dummy = null;
      this._carry[i].time = 0;
    }
    this._carryCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._releaseCarry();
    this.shell.visible = false;
    this.warp.visible = false;
    this.drift.visible = false;
    this.boulders.count = 0;
  }

  dispose() {
    this.shellGeometry.dispose();
    this.boulderGeometry.dispose();
    this.driftGeometry.dispose();
    this.shellMaterial.dispose();
    this.warpMaterial.dispose();
    this.boulderMaterial.dispose();
    this.driftMaterial.dispose();
    this.boulders.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1F3D4}  Avalanche Wake');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 40, 0.1, 'rolls at (m/s)');
  R(cast, c, 'lifetime', 0.2, 10, 0.05, 'drift lingers (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'churn');

  const front = folder.addFolder('1 · The front');
  const shape = front.addFolder('Silhouette');
  R(shape, c, 'frontWidth', 0.5, 8, 0.01, 'half-width (m)');
  R(shape, c, 'frontHeight', 0.4, 6, 0.01, 'crest height (m)');
  R(shape, c, 'frontDepth', 0.4, 6, 0.01, 'depth (m)');
  R(shape, c, 'frontCurl', -0.2, 1.2, 0.01, 'crest leans over');
  R(shape, c, 'frontTaper', 0.05, 3, 0.01, 'flanks drop');
  R(shape, c, 'frontGrowth', 0, 1.5, 0.01, 'gathers (× by the end)');
  R(shape, c, 'frontRise', 0.02, 1.5, 0.01, 'heaves up over (s)');
  R(shape, c, 'frontBob', 0, 0.6, 0.005, 'heave (m)');
  R(shape, c, 'frontBobSpeed', 0, 20, 0.1, 'heave speed');
  R(shape, c, 'frontBillow', 0, 1.5, 0.01, 'billows (m)');
  R(shape, c, 'frontBillowScale', 0.1, 5, 0.01, 'billows per metre');
  R(shape, c, 'rollSpeed', 0, 3, 0.01, 'roll (× true rolling)');
  R(shape, c, 'tipFade', 0.01, 1, 0.01, 'flank softness');

  const look = front.addFolder('Shading');
  R(look, c, 'shellOpacity', 0, 1, 0.01, 'opacity');
  R(look, c, 'shellDensity', 0.05, 6, 0.01, 'thins to the edge');
  R(look, c, 'shellLight', 0, 3, 0.01, 'key light');
  R(look, c, 'shellAmbient', 0, 1, 0.01, 'sky fill');
  R(look, c, 'shellScatter', 0, 3, 0.01, 'backlit edges');
  R(look, c, 'shellErode', 0, 1.5, 0.01, 'wispy silhouette');
  R(look, c, 'shellErodeScale', 0.2, 8, 0.05, 'wisps per metre');
  R(look, c, 'shellSoftFade', 0.01, 3, 0.01, 'soft intersection (m)');
  look.addColor(c, 'colorShellLit').name('lit');
  look.addColor(c, 'colorShellShadow').name('shade');
  look.addColor(c, 'colorShellDeep').name('folds');
  look.addColor(c, 'colorShellRim').name('backlit edge');

  const warp = folder.addFolder('2 · Shove (distortion)');
  R(warp, c, 'warpStrength', 0, 4, 0.01, 'strength');
  R(warp, c, 'warpGrow', 1, 2, 0.01, 'size (× front)');
  R(warp, c, 'warpScale', 0.1, 6, 0.01, 'noise scale');
  R(warp, c, 'warpSpeed', 0, 10, 0.05, 'churn speed');

  const powder = folder.addFolder('3 · Powder');
  R(powder, c, 'powderRate', 0, 800, 1, 'puffs / s');
  R(powder, c, 'powderSize', 0.05, 4, 0.01, 'puff size (m)');
  R(powder, c, 'powderEndSize', 0.2, 5, 0.01, 'grows to (×)');
  R(powder, c, 'powderLifetime', 0.1, 5, 0.05, 'lifetime');
  R(powder, c, 'powderSpeed', 0, 15, 0.05, 'thrown at (m/s)');
  R(powder, c, 'powderLift', 0, 8, 0.05, 'lift (m/s)');
  R(powder, c, 'powderCurl', -4, 10, 0.05, 'curl over the crest (m/s)');
  R(powder, c, 'powderDrag', 0, 6, 0.01, 'drag');
  R(powder, c, 'powderOpacity', 0, 1, 0.01, 'opacity');
  R(powder, c, 'powderTurbulence', 0, 3, 0.01, 'turbulence');
  R(powder, c, 'trailRate', 0, 400, 1, 'wake haze / s');
  R(powder, c, 'trailSize', 0.1, 5, 0.01, 'haze size');
  R(powder, c, 'trailLifetime', 0.1, 8, 0.05, 'haze lifetime');
  R(powder, c, 'trailOpacity', 0, 1, 0.01, 'haze opacity');
  Editor.gradient(powder, c, 'colorPowder', 'powder gradient');
  const dust = powder.addFolder('Diamond dust');
  R(dust, c, 'sparkleRate', 0, 600, 1, 'per second');
  R(dust, c, 'sparkleSize', 0.005, 0.3, 0.001, 'size');
  R(dust, c, 'sparkleLifetime', 0.1, 5, 0.05, 'lifetime');
  R(dust, c, 'sparkleGlow', 0, 10, 0.05, 'glow');
  Editor.gradient(dust, c, 'colorSparkle', 'dust gradient');

  const boulders = folder.addFolder('4 · Ice boulders');
  R(boulders, c, 'boulderCount', 0, MAX_BOULDERS, 1, 'count');
  R(boulders, c, 'boulderSize', 0.05, 1.5, 0.01, 'radius (m)');
  R(boulders, c, 'boulderSizeJitter', 0, 0.9, 0.01, 'size jitter');
  R(boulders, c, 'boulderSpread', 0, 1.2, 0.01, 'spread (× half-width)');
  R(boulders, c, 'boulderBack', 0, 5, 0.01, 'scattered through (m)');
  R(boulders, c, 'boulderBounce', 0, 2, 0.01, 'hop height (m)');
  R(boulders, c, 'boulderBounceRate', 0.05, 3, 0.01, 'hops per metre');
  R(boulders, c, 'boulderSpin', 0, 3, 0.01, 'roll (× true rolling)');
  R(boulders, c, 'boulderWobble', 0, 2, 0.01, 'axis wobble');
  R(boulders, c, 'chipsPerBounce', 0, 20, 1, 'chips per landing');
  R(boulders, c, 'chipSize', 0.01, 0.4, 0.005, 'chip size');
  R(boulders, c, 'chipLifetime', 0.1, 3, 0.05, 'chip lifetime');
  R(boulders, c, 'chipSpeed', 0, 15, 0.05, 'chip speed');
  Editor.gradient(boulders, c, 'colorChip', 'chip gradient');
  const ice = boulders.addFolder('Ice shading');
  R(ice, c, 'iceIOR', 1, 2, 0.01, 'IOR');
  R(ice, c, 'iceRefract', 0, 3, 0.01, 'see-through');
  R(ice, c, 'iceReflect', 0, 3, 0.01, 'reflection');
  R(ice, c, 'iceFresnel', 0, 6, 0.01, 'rim');
  R(ice, c, 'iceFresnelPower', 0.5, 8, 0.05, 'rim power');
  R(ice, c, 'iceFrost', 0, 1, 0.01, 'snow crust');
  R(ice, c, 'iceFrostScale', 0.2, 10, 0.05, 'crust scale');
  R(ice, c, 'iceCracks', 0, 3, 0.01, 'fractures');
  R(ice, c, 'iceCrackScale', 0.2, 8, 0.05, 'fracture scale');
  R(ice, c, 'iceSparkle', 0, 10, 0.05, 'glints');
  R(ice, c, 'iceSparkleSharp', 4, 200, 1, 'glint sharpness');
  R(ice, c, 'iceInner', 0, 3, 0.01, 'inner light');
  ice.addColor(c, 'colorIceDeep').name('deep');
  ice.addColor(c, 'colorIceBody').name('body');
  ice.addColor(c, 'colorIceRim').name('rim');
  ice.addColor(c, 'colorIceFrost').name('crust');
  ice.addColor(c, 'colorIceInner').name('inner light');

  const drift = folder.addFolder('5 · The drift');
  R(drift, c, 'driftWidth', 0.2, 8, 0.01, 'half-width (m)');
  R(drift, c, 'driftHeight', 0, 1.2, 0.005, 'depth (m)');
  R(drift, c, 'driftEdge', 0.02, 1, 0.01, 'bank slope');
  R(drift, c, 'driftStart', 0, 6, 0.05, 'starts after (m)');
  R(drift, c, 'driftLag', 0, 4, 0.01, 'laid behind the face (m)');
  R(drift, c, 'driftNoise', 0, 0.5, 0.005, 'lumps (m)');
  R(drift, c, 'driftNoiseScale', 0.05, 5, 0.01, 'lumps per metre');
  R(drift, c, 'rutDepth', 0, 0.5, 0.005, 'rut depth (m)');
  R(drift, c, 'rutWidth', 0.02, 1, 0.005, 'rut half-width (m)');
  R(drift, c, 'heapHeight', 0, 3, 0.01, 'heap height (m)');
  R(drift, c, 'heapRadius', 0.2, 8, 0.01, 'heap radius (m)');
  R(drift, c, 'driftLight', 0, 3, 0.01, 'key light');
  R(drift, c, 'driftAmbient', 0, 1, 0.01, 'sky fill');
  R(drift, c, 'driftSparkle', 0, 10, 0.05, 'glints');
  R(drift, c, 'driftSparkleDensity', 1, 120, 1, 'glint cells / m');
  R(drift, c, 'driftSparkleCut', 0, 0.999, 0.001, 'dark cells');
  R(drift, c, 'meltDelay', 0, 0.95, 0.01, 'melt starts at');
  R(drift, c, 'meltErode', 0, 1, 0.01, 'patchy melt');
  R(drift, c, 'meltWet', 0, 1, 0.01, 'goes wet');
  drift.addColor(c, 'colorDriftLit').name('lit');
  drift.addColor(c, 'colorDriftShadow').name('shade');
  drift.addColor(c, 'colorDriftWet').name('wet');
  drift.addColor(c, 'colorDriftSparkle').name('glint');

  const engulf = folder.addFolder('6 · Engulf');
  R(engulf, c, 'engulfReach', 0, 3, 0.01, 'reach past the flank (m)');
  R(engulf, c, 'engulfLead', 0, 3, 0.01, 'reach ahead of the face (m)');
  R(engulf, c, 'engulfImpulse', 0, 12, 0.05, 'shove (m/s)');
  R(engulf, c, 'engulfLift', 0, 10, 0.05, 'lift (m/s)');
  R(engulf, c, 'engulfSpin', 0, 5, 0.01, 'tumble');
  R(engulf, c, 'carryBack', 0, 4, 0.01, 'held behind the face (m)');
  R(engulf, c, 'carryHeight', 0, 3, 0.01, 'held up the wall (m)');
  R(engulf, c, 'carrySpread', 0, 1, 0.01, 'keeps its offset');
  R(engulf, c, 'carryGrab', 0.5, 30, 0.1, 'grip (/s)');
  R(engulf, c, 'carrySpring', 0, 20, 0.1, 'drawn to its place (/s)');
  R(engulf, c, 'carryBuoyancy', 0, 1, 0.01, 'weight carried');
  R(engulf, c, 'carryTumble', 0, 3, 0.01, 'tumble (turns/s)');
  R(engulf, c, 'dumpThrow', 0, 15, 0.05, 'flung forward (m/s)');
  R(engulf, c, 'dumpDown', 0, 10, 0.05, 'thrown down (m/s)');
  R(engulf, c, 'buryDepth', 0, 1.5, 0.01, 'buried (m)');

  const impact = folder.addFolder('7 · The break');
  R(impact, c, 'breakTime', 0.1, 4, 0.01, 'collapses over (s)');
  R(impact, c, 'breakDrift', 0, 10, 0.05, 'rolls on (m)');
  R(impact, c, 'breakSurge', 0, 1.5, 0.01, 'surges up (×)');
  R(impact, c, 'burstSize', 0, 16, 0.05, 'frost shell (m)');
  R(impact, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(impact, c, 'shockRadius', 0, 20, 0.05, 'shockwave (m)');
  R(impact, c, 'frostRadius', 0, 12, 0.05, 'rime (m)');
  R(impact, c, 'frostLife', 0.1, 12, 0.05, 'rime lasts (s)');
  R(impact, c, 'powderBurst', 0, 500, 1, 'powder thrown');
  R(impact, c, 'sparkleBurst', 0, 800, 1, 'dust thrown');
  R(impact, c, 'scatterSpeed', 0, 20, 0.05, 'boulders thrown (m/s)');
  R(impact, c, 'scatterLift', 0, 15, 0.05, 'boulder lift (m/s)');
  R(impact, c, 'scatterSpin', 0, 25, 0.1, 'boulder tumble (rad/s)');
  R(impact, c, 'boulderRestitution', 0, 0.95, 0.01, 'bounce kept');
  R(impact, c, 'boulderFriction', 0, 1, 0.01, 'slide lost');
  R(impact, c, 'boulderSink', 0.05, 5, 0.05, 'beds in over (s)');
  R(impact, c, 'impactShake', 0, 2, 0.01, 'camera knock');
  R(impact, c, 'shakeDuration', 0.05, 3, 0.01, 'knock lasts');
  R(impact, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(impact, c, 'impactLight', 0, 8, 0.01, 'light punch (× intensity)');
  R(impact, c, 'rollRumble', 0, 1.5, 0.01, 'rumble while rolling');
  R(impact, c, 'castPuff', 0, 200, 1, 'powder at the feet');
  impact.addColor(c, 'colorBurstA').name('shell inner');
  impact.addColor(c, 'colorBurstB').name('shell mid');
  impact.addColor(c, 'colorBurstC').name('shell outer');
  impact.addColor(c, 'colorShockA').name('shockwave');
  impact.addColor(c, 'colorShockB').name('shockwave hot');
  impact.addColor(c, 'colorFrostA').name('rime');
  impact.addColor(c, 'colorFrostB').name('rime bright');
  impact.addColor(c, 'colorFlash').name('flash');

  folder.close();
  return folder;
}
