import {
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createQuartzPointGeometry, createQuartzQuadGeometry } from '../../assets/codex/QuartzSpireGeometry.js';
import {
  createQuartzCrystalMaterial,
  createQuartzFloorMaterial,
  createQuartzFlareMaterial,
  createQuartzResonanceMaterial
} from '../../materials/codex/QuartzSpireMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

export const ID = 'quartzspire';

/** Ring points the editor can ask for. */
const MAX_RING = 12;
/** The master plus the ring. */
const MAX_SPIRES = MAX_RING + 1;
/** Small points round each foot. */
const MAX_SATS = 4;
/** Little points jutting up behind the travelling front. */
const MAX_TRAIL = 40;
const SAT_BASE = MAX_SPIRES;
const TRAIL_BASE = SAT_BASE + MAX_SPIRES * MAX_SATS;
const MAX_INSTANCES = TRAIL_BASE + MAX_TRAIL;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _centre = new Vector3();
const _axis = new Vector3();
const _tilt = new Vector3();
const _top = new Vector3();
const _scale = new Vector3();
const _up = new Vector3(0, 1, 0);
const _q = new Quaternion();
const _qYaw = new Quaternion();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
const _floorState = { centre: new Vector3(), ring: 3, count: 7, turn: 0, reveal: 0, pulse: 0, songPhase: 0, erode: 0, seed: 0 };
const _flareState = { center: new Vector3(), intensity: 0, seed: 0 };
const _resState = { strength: 0, phase: 0, seed: 0 };
/** Size of the point being placed — reused, never allocated per frame. */
const _dims = { height: 1, radius: 0.3 };

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
 * QUARTZ SPIRE — Earth, zone cast.
 *
 * A **seed vein** races along the floor from the caster's feet to the circle,
 * a line of little crystal points stabbing up behind it and sinking again.
 * Where it lands the floor is **cut into a crystal star** — veins radiating
 * from the heart to a ring, a star polygon joining the ring — and then the
 * **choir** rises: clear quartz points, each a hexagonal prism with a pointed
 * termination, punch up out of the ring **one after another in a spiral**,
 * every one leaning in toward the heart with a cluster of small points
 * splayed round its foot. Last, with a flash and a jolt, the **master
 * crystal** — twice the height of the ring — breaks the floor at the centre,
 * a six-rayed star flaring at its point. Then the choir **sings**: gold
 * harmonics climb every point, chasing round the ring, the floor's veins pulse
 * in time and the air over the circle *rings* (rings of compression climbing a
 * distortion column). At the end the points **shatter** tip-first along a
 * white fracture edge, sinking as they go, throwing crystal shards, the master
 * last; the veins erode.
 *
 * It is not Basalt Columns (a packed hex field of opaque rock on magma) or
 * Geode Eruption (a stone shell cracking on an amethyst heart): it is a sparse
 * *ring* of clear, pointed, leaning crystals around one tall one — a crown,
 * read from twenty metres as a silhouette, and lit from inside.
 *
 * ## Layers
 *
 *   1. **the points** — one InstancedMesh (master, ring, satellites, trail)
 *      of `createQuartzPointGeometry` in the bespoke quartz shader
 *      (`createQuartzCrystalMaterial`): an inner core seen down the axis,
 *      phantom chevrons, milky veils, a dispersive rainbow rim, bright
 *      arrises, the climbing song, a tip-first shatter. Opaque on
 *      `LAYER.WORLD`, so they cast shadows and write the depth prepass.
 *   2. **the choir floor** (`createQuartzFloorMaterial`) — radial veins, star
 *      polygon, ring, frosted plates; grows out from the heart, pulses gold
 *      with the song, erodes away.
 *   3. **the tip flare** (`createQuartzFlareMaterial`) — the master's star.
 *   4. **resonance** (`createQuartzResonanceMaterial`) — an open cylinder on
 *      `LAYER.DISTORTION`, compression rings climbing it.
 *   5. **particles** — glints (additive SOFT) twinkling off the choir, lit
 *      crystal shards (CHIP) and streak sparks off every point breaking the
 *      floor and shattering, dust (SMOKE) at the feet.
 *   6. **the beat** — a small knock and a SHOCKWAVE ring per ring point; for
 *      the master a FROST shell, a big SHOCKWAVE, a CRACK, a flash, a jolt and
 *      a light punch.
 *
 * ## The bodies
 *
 * `handlesOwnHits`. The moment a ring point is two-thirds risen it impales
 * whatever stands within `hitRadius` of its foot, throwing it up and away
 * from the heart. The master throws everything still standing in the circle.
 *
 * ## The editor rule
 *
 * A point record holds dice only (height, lean, yaw, timing, seed) and three
 * latches (broke the floor, struck, shattered). Its place on the ring, its
 * size, its timing, its glow and colour are resolved from
 * `settings.quartzspire` every frame — dragging `spireCount` re-spaces a
 * choir that is already standing. The song phase is integrated so the rate
 * slider never jumps. `tipLength` and `asymmetry` rebuild the mesh.
 */
export class QuartzSpireAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /** The points pick whom they impale, and when. */
  get handlesOwnHits() {
    return true;
  }

  /** Crystal points standing. HUD readout only. */
  get instanceCount() {
    return this._live;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the points ---- */
    this.crystalMaterial = createQuartzCrystalMaterial();
    this.stateAttr = new InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 4), 4);
    this.stateAttr.setUsage(DynamicDrawUsage);
    this._geoTip = -1;
    this._geoAsym = -1;
    this.pointGeometry = null;
    this.points = new InstancedMesh(this._pointGeometry(), this.crystalMaterial, MAX_INSTANCES);
    this.points.name = 'QuartzPoints';
    this.points.instanceMatrix.setUsage(DynamicDrawUsage);
    this.points.layers.set(LAYER.WORLD);
    this.points.castShadow = true;
    this.points.receiveShadow = false;
    this.points.frustumCulled = false;
    this.points.count = MAX_INSTANCES;
    this.points.visible = false;
    this.group.add(this.points);

    /* ---- layer 2: the choir floor ---- */
    this.quadGeometry = createQuartzQuadGeometry();
    this.floorMaterial = createQuartzFloorMaterial();
    this.floor = this._mesh(this.quadGeometry, this.floorMaterial, LAYER.VFX, 2);

    /* ---- layer 3: the tip flare ---- */
    this.flareMaterial = createQuartzFlareMaterial();
    this.flare = this._mesh(this.quadGeometry, this.flareMaterial, LAYER.VFX, 18);

    /* ---- layer 4: resonance ---- */
    this.resGeometry = new CylinderGeometry(1, 1, 1, 40, 1, true);
    this.resGeometry.translate(0, 0.5, 0);
    this.resMaterial = createQuartzResonanceMaterial();
    this.resonance = this._mesh(this.resGeometry, this.resMaterial, LAYER.DISTORTION, 0);

    /** Dice and latches only — see the class comment. Index 0 is the master. */
    this.spires = [];
    for (let i = 0; i < MAX_SPIRES; i++) {
      const sats = [];
      for (let k = 0; k < MAX_SATS; k++) sats.push({ a: 0, d: 0, s: 0, lean: 0, yaw: 0, seed: 0 });
      this.spires.push({
        hDice: 0,
        leanA: 0,
        leanJ: 0,
        yaw: 0,
        tDice: 0,
        sDice: 0,
        seed: 0,
        sats,
        broke: false,
        struck: false,
        shattered: false,
        x: 0,
        z: 0,
        h: 0
      });
    }
    this.trail = [];
    for (let i = 0; i < MAX_TRAIL; i++) {
      this.trail.push({ x: 0, z: 0, born: -1, hDice: 0, yaw: 0, tiltX: 0, tiltZ: 0, seed: 0 });
    }
    this._trailCursor = 0;
    this._travelled = 0;
    this._clock = -1;
    this._song = 0;
    this._res = 0;
    this._turn = 0;
    this._seed = 0;
    this._live = 0;
    this._glowSum = 0;
    this._masterTop = new Vector3();
    this._masterK = 0;

    this._targets = [];
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

    this.glints = particles.get('quartzspire.glint', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.15
    });
    this.glints.uniforms.uDrag.value = 1.2;
    this.glints.uniforms.uEndSize.value = 0.2;
    this.glints.uniforms.uSizeIn.value = 0.15;
    this.glints.uniforms.uFadeIn.value = 0.2;
    this.glints.uniforms.uFadeOut.value = 0.5;

    this.shards = particles.get('quartzspire.shard', {
      capacity: 1600,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.1
    });
    this.shards.uniforms.uDrag.value = 0.35;
    this.shards.uniforms.uEndSize.value = 0.7;
    this.shards.uniforms.uSizeIn.value = 0.02;
    this.shards.uniforms.uFadeIn.value = 0.01;
    this.shards.uniforms.uFadeOut.value = 0.3;

    this.dust = particles.get('quartzspire.dust', {
      capacity: 600,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.6
    });
    this.dust.uniforms.uDrag.value = 1.6;
    this.dust.uniforms.uEndSize.value = 2.0;
    this.dust.uniforms.uSizeIn.value = 0.12;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.6;

    this.sparks = particles.get('quartzspire.spark', {
      capacity: 800,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparks.uniforms.uDrag.value = 2.0;
    this.sparks.uniforms.uEndSize.value = 0.2;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.01;
    this.sparks.uniforms.uFadeOut.value = 0.6;

    this.glintEmitter = new RateEmitter();
    this.travelEmitter = new RateEmitter();
  }

  /** The point mesh, rebuilt only when its termination or face asymmetry moves. */
  _pointGeometry() {
    const c = settings[ID];
    const tip = Math.min(0.8, Math.max(0.05, c.tipLength));
    const asym = Math.max(0, Math.min(1, c.asymmetry));
    if (this.pointGeometry && Math.abs(tip - this._geoTip) < 1e-5 && Math.abs(asym - this._geoAsym) < 1e-5) {
      return this.pointGeometry;
    }
    this._geoTip = tip;
    this._geoAsym = asym;
    const old = this.pointGeometry;
    this.pointGeometry = createQuartzPointGeometry(tip, asym);
    this.pointGeometry.setAttribute('aState', this.stateAttr);
    if (this.points) this.points.geometry = this.pointGeometry;
    old?.dispose();
    return this.pointGeometry;
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every second resolved from settings                        */
  /* ------------------------------------------------------------------ */

  _ringCount() {
    return Math.max(3, Math.min(MAX_RING, Math.round(settings[ID].spireCount)));
  }

  /** Seconds after landing that spire `i` starts to rise (0 = master). */
  _startOf(i, sp, c, g) {
    if (i === 0) return Math.max(0, c.masterDelay) * g.lifetime;
    const n = this._ringCount();
    return (
      Math.max(0, c.riseDelay) * g.lifetime +
      ((i - 1) / n) * Math.max(0, c.spiralTime) * g.lifetime +
      sp.tDice * Math.max(0, c.riseJitter) * g.randomness
    );
  }

  _riseOf(i, c) {
    return Math.max(0.03, i === 0 ? c.masterRiseTime : c.riseTime);
  }

  get impactDuration() {
    const c = settings[ID];
    const g = settings.global;
    const ringEnd = (Math.max(0, c.riseDelay) + Math.max(0, c.spiralTime)) * g.lifetime + Math.max(0, c.riseJitter) + c.riseTime;
    const masterEnd = Math.max(0, c.masterDelay) * g.lifetime + c.masterRiseTime;
    return Math.max(ringEnd, masterEnd) + Math.max(0.05, c.lifetime * g.lifetime);
  }

  get fadeDuration() {
    const c = settings[ID];
    const g = settings.global;
    return Math.max(0.05, (Math.max(0, c.shatterSpread) + Math.max(0.05, c.shatterTime) + Math.max(0.05, c.groundFade)) * g.lifetime);
  }

  /** The light chimes with the song. */
  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * 0.5 + f * 0.5 * Math.sin(this._song * TAU);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._clock = -1;
    this._seed = Math.random() * 100;
    this._turn = Math.random() * TAU;
    this._song = 0;
    this._res = 0;
    this._travelled = 0;
    this._trailCursor = 0;
    this._live = 0;
    this._masterK = 0;
    this.glintEmitter.reset();
    this.travelEmitter.reset();

    for (let i = 0; i < MAX_SPIRES; i++) {
      const sp = this.spires[i];
      sp.hDice = Math.random();
      sp.leanA = Math.random() * TAU;
      sp.leanJ = Math.random();
      sp.yaw = Math.random() * TAU;
      sp.tDice = Math.random();
      sp.sDice = Math.random();
      sp.seed = Math.random();
      sp.broke = false;
      sp.struck = false;
      sp.shattered = false;
      sp.h = 0;
      for (let k = 0; k < MAX_SATS; k++) {
        const s = sp.sats[k];
        s.a = (k / MAX_SATS) * TAU + (Math.random() - 0.5) * 1.2;
        s.d = 0.6 + Math.random() * 0.4;
        s.s = 0.6 + Math.random() * 0.5;
        s.lean = 0.7 + Math.random() * 0.5;
        s.yaw = Math.random() * TAU;
        s.seed = Math.random();
      }
    }
    for (let i = 0; i < MAX_TRAIL; i++) this.trail[i].born = -1;

    this._pointGeometry();
    this.stateAttr.array.fill(0);
    this.stateAttr.needsUpdate = true;
    for (let i = 0; i < MAX_INSTANCES; i++) this.points.setMatrixAt(i, _zero);
    this.points.instanceMatrix.needsUpdate = true;
    this.points.visible = false;
    this.floor.visible = false;
    this.flare.visible = false;
    this.resonance.visible = false;
  }

  _sync(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._song += dt * c.songRate * g.noiseSpeed;
    this._res += dt * c.resonanceSpeed * g.noiseSpeed;
    this.crystalMaterial.userData.sync(this._song);

    syncSystem(this.glints, c.colorGlintA, c.colorGlintB, c.colorGlintC, c.colorGlintD, c.glintSize, c.glintGlow * g.glow, 0.3);
    this.glints.uniforms.uGravity.value.set(0, 0.4, 0);
    syncSystem(this.shards, c.colorShardA, c.colorShardB, c.colorShardC, c.colorShardD, c.shardSize, 1, 0.05);
    this.shards.uniforms.uGravity.value.set(0, c.shardGravity, 0);
    syncSystem(this.dust, c.colorDustA, c.colorDustB, c.colorDustC, c.colorDustD, c.dustSize, 1, 0.5);
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    this.dust.uniforms.uGravity.value.set(0, 0.2, 0);
    syncSystem(this.sparks, c.colorGlintA, c.colorGlintB, c.colorGlintC, c.colorGlintD, c.sparkSize, c.glintGlow * g.glow, 0.1);
    this.sparks.uniforms.uGravity.value.set(0, -6, 0);
    this.sparks.uniforms.uStretch.value = c.sparkStretch;
  }

  /* ------------------------------------------------------------------ */
  /* Placing a point                                                     */
  /* ------------------------------------------------------------------ */

  /** Ring position, height and lean of spire `i`, written into `sp` and the scratch vectors. */
  _placeSpire(i, sp, c, g, R) {
    if (i === 0) {
      this.pointAt(1, _pos);
      sp.x = _pos.x;
      sp.z = _pos.z;
      _tilt.set(Math.cos(sp.leanA), 0, Math.sin(sp.leanA)).multiplyScalar(0.04 * g.randomness);
      _dims.height = c.masterHeight * (0.95 + 0.1 * sp.hDice * g.randomness);
      _dims.radius = c.masterRadius;
      return _dims;
    }
    const n = this._ringCount();
    const a = this._turn + ((i - 1) / n) * TAU;
    const ring = Math.max(0.3, c.ringFrac * R);
    this.pointAt(1, _centre);
    sp.x = _centre.x + Math.cos(a) * ring;
    sp.z = _centre.z + Math.sin(a) * ring;
    // Lean in toward the heart, plus a little wander.
    const lean = c.spireLean;
    _tilt.set(-Math.cos(a) * lean, 0, -Math.sin(a) * lean);
    _tilt.x += Math.cos(sp.leanA) * c.leanJitter * sp.leanJ * g.randomness;
    _tilt.z += Math.sin(sp.leanA) * c.leanJitter * sp.leanJ * g.randomness;
    const height = lerp(c.ringHeightMin, c.ringHeightMax, lerp(0.5, sp.hDice, saturate(g.randomness)));
    _dims.height = height;
    _dims.radius = c.spireRadius * (0.85 + 0.3 * sp.sDice);
    return _dims;
  }

  /**
   * Compose an instance: a point whose foot is at (x, 0, z), leaning by the
   * tilt vector (its length is the lean in radians), risen `rise` of its height.
   */
  _compose(index, x, z, tiltX, tiltZ, yaw, radius, height, rise, outTop) {
    const lean = Math.hypot(tiltX, tiltZ);
    _qYaw.setFromAxisAngle(_up, yaw);
    if (lean > 1e-4) {
      // Axis ⟂ to the lean direction, so +Y tips toward (tiltX, tiltZ).
      _axis.set(tiltZ / lean, 0, -tiltX / lean);
      _q.setFromAxisAngle(_axis, lean).multiply(_qYaw);
    } else {
      _q.copy(_qYaw);
    }
    _dir.set(0, 1, 0).applyQuaternion(_q);
    // Pushed out of the floor along its own axis, so a leaning point slides out.
    _pos.set(x, 0, z).addScaledVector(_dir, (rise - 1) * height);
    _scale.set(radius, height, radius);
    _m.compose(_pos, _q, _scale);
    this.points.setMatrixAt(index, _m);
    if (outTop) outTop.copy(_pos).addScaledVector(_dir, height);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _updateChoir(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._pointGeometry();
    const clock = this._clock;
    const fading = this.phase === AbilityPhase.FADE;
    const ft = fading ? this.fadeTime : 0;
    const R = Math.max(0.5, c.zoneRadius);
    const n = this._ringCount();
    const sats = Math.max(0, Math.min(MAX_SATS, Math.round(c.satellites)));
    const state = this.stateAttr.array;
    const shatterSpread = Math.max(0, c.shatterSpread) * g.lifetime;
    const shatterT = Math.max(0.05, c.shatterTime) * g.lifetime;
    let live = 0;
    let glowSum = 0;

    for (let i = 0; i < MAX_SPIRES; i++) {
      const sp = this.spires[i];
      const active = i <= n && clock >= 0;
      if (!active) {
        this.points.setMatrixAt(i, _zero);
        for (let k = 0; k < MAX_SATS; k++) this.points.setMatrixAt(SAT_BASE + i * MAX_SATS + k, _zero);
        continue;
      }
      const dims = this._placeSpire(i, sp, c, g, R);
      const start = this._startOf(i, sp, c, g);
      const riseT = this._riseOf(i, c);
      const k = saturate((clock - start) / riseT);
      let rise = k > 0 ? springCurve(k, c.overshoot) : 0;

      if (k > 0 && !sp.broke) {
        sp.broke = true;
        this._breakFx(i, sp, c, g, dims.height);
      }
      if (k >= 0.66 && !sp.struck) {
        sp.struck = true;
        this._strike(i, sp, c, g, dims.height);
      }

      /* --- shatter --- */
      let shatter = 0;
      if (fading) {
        // Ring in spiral order, the master last of all.
        const order = i === 0 ? 1 : ((i - 1) / n) * 0.8;
        const s0 = order * shatterSpread;
        shatter = saturate((ft - s0) / shatterT);
        if (shatter > 0 && !sp.shattered) {
          sp.shattered = true;
          this._shatterFx(sp, c, g, dims.height);
        }
        rise *= 1 - Easing.inQuad(shatter) * saturate(c.shatterSink);
      }
      sp.h = rise * dims.height;

      if (rise <= 0.001 || shatter >= 0.999) {
        this.points.setMatrixAt(i, _zero);
      } else {
        this._compose(i, sp.x, sp.z, _tilt.x, _tilt.z, sp.yaw, dims.radius, dims.height, rise, i === 0 ? this._masterTop : null);
        live++;
      }
      const since = clock - start;
      const punch = since >= 0 ? Math.exp(-since * 7) : 0;
      const glow = (k > 0 ? c.idleGlow : 0) + punch * c.punchGlow;
      glowSum += glow;
      const i4 = i * 4;
      state[i4] = sp.seed;
      state[i4 + 1] = i === 0 ? 0 : (i - 1) / n;
      state[i4 + 2] = glow;
      state[i4 + 3] = shatter;
      if (i === 0) this._masterK = k;

      /* --- the satellites splayed round the foot --- */
      const baseTiltX = _tilt.x;
      const baseTiltZ = _tilt.z;
      for (let s = 0; s < MAX_SATS; s++) {
        const idx = SAT_BASE + i * MAX_SATS + s;
        if (s >= sats || rise <= 0.001 || shatter >= 0.999) {
          this.points.setMatrixAt(idx, _zero);
          continue;
        }
        const st = sp.sats[s];
        const d = c.satSpread * st.d * (i === 0 ? 1.5 : 1);
        const x = sp.x + Math.cos(st.a + sp.yaw) * d;
        const z = sp.z + Math.sin(st.a + sp.yaw) * d;
        const lean = c.satLean * st.lean;
        const tx = baseTiltX * 0.5 + Math.cos(st.a + sp.yaw) * lean;
        const tz = baseTiltZ * 0.5 + Math.sin(st.a + sp.yaw) * lean;
        const sScale = c.satScale * st.s;
        // Satellites lag their parent a touch, so the cluster blooms.
        const sk = saturate((clock - start - 0.05 - st.seed * 0.08) / riseT);
        const sRise = sk > 0 ? springCurve(sk, c.overshoot) * (fading ? 1 - Easing.inQuad(shatter) * saturate(c.shatterSink) : 1) : 0;
        if (sRise <= 0.001) {
          this.points.setMatrixAt(idx, _zero);
          continue;
        }
        this._compose(idx, x, z, tx, tz, st.yaw, dims.radius * sScale * 1.4, dims.height * sScale, sRise, null);
        const s4 = idx * 4;
        state[s4] = st.seed;
        state[s4 + 1] = i === 0 ? 0 : (i - 1) / n + 0.1;
        state[s4 + 2] = glow * 0.8;
        state[s4 + 3] = saturate(shatter * 1.2);
        live++;
      }
      _tilt.set(baseTiltX, 0, baseTiltZ);
    }

    live += this._updateTrail(c, g);
    this._live = live;
    this._glowSum = glowSum;
    this.points.instanceMatrix.needsUpdate = true;
    this.stateAttr.needsUpdate = true;
    this.points.visible = live > 0;

    /* --- the floor --- */
    if (clock >= 0) {
      this.pointAt(1, _centre);
      let erode = 0;
      if (fading) {
        const fd = this.fadeDuration;
        const gf = Math.max(0.05, c.groundFade * g.lifetime);
        erode = saturate((ft - (fd - gf)) / gf);
      }
      _floorState.centre.copy(_centre);
      _floorState.ring = Math.max(0.3, c.ringFrac * R);
      _floorState.count = n;
      _floorState.turn = this._turn;
      _floorState.reveal = Easing.outCubic(saturate(clock / Math.max(0.05, c.revealTime * g.lifetime))) * (R + 0.8);
      _floorState.pulse = Math.min(2, glowSum / (n + 1)) * (fading ? 1 - erode : 1) + (this._masterK > 0 ? 0.4 : 0);
      _floorState.songPhase = this._song * 0.5;
      _floorState.erode = erode;
      _floorState.seed = this._seed;
      this.floorMaterial.userData.sync(_floorState);
      this.floor.position.set(0, 0, 0);
      this.floor.visible = true;

      /* --- the flare at the master's point --- */
      let flare = 0;
      if (this._masterK > 0) {
        const since = clock - this._startOf(0, this.spires[0], c, g);
        flare = Math.max(0, 1 - Math.max(0, since - 0.1) * 0.6) * 0.7 + Math.exp(-since * 5) * 1.3;
        if (fading) flare *= 1 - saturate(ft / Math.max(0.05, shatterSpread + shatterT * 0.5));
        flare *= 0.8 + 0.2 * Math.sin(this._song * TAU * 2);
      }
      _flareState.center.copy(this._masterTop);
      _flareState.intensity = Math.max(0, flare);
      _flareState.seed = this._seed;
      this.flareMaterial.userData.sync(_flareState);
      this.flare.visible = flare > 0.01 && this.spires[0].h > 0.05;

      /* --- the air ringing --- */
      const ringing = saturate(glowSum / Math.max(1, n + 1)) * (fading ? 1 - saturate(ft / Math.max(0.05, shatterSpread + shatterT)) : 1);
      _resState.strength = ringing;
      _resState.phase = this._res;
      _resState.seed = this._seed;
      this.resMaterial.userData.sync(_resState);
      this.resonance.position.set(_centre.x, 0, _centre.z);
      this.resonance.scale.set(R * 0.9, Math.max(0.5, c.resonanceHeight), R * 0.9);
      this.resonance.visible = ringing > 0.01;

      /* --- glints twinkling off the standing choir --- */
      if (dt > 0 && live > 0) this._glintFx(dt, c, g, ringing);
    }
  }

  /** The little points racing behind the front; returns how many are drawn. */
  _updateTrail(c, g) {
    const state = this.stateAttr.array;
    const life = Math.max(0.1, c.trailLife * g.lifetime);
    let drawn = 0;
    for (let i = 0; i < MAX_TRAIL; i++) {
      const t = this.trail[i];
      const idx = TRAIL_BASE + i;
      const age = t.born < 0 ? -1 : this.age - t.born;
      if (age < 0 || age > life) {
        this.points.setMatrixAt(idx, _zero);
        continue;
      }
      const up = saturate(age / 0.08);
      const down = saturate((age - life * 0.55) / (life * 0.45));
      const rise = Easing.outBack(up) * (1 - Easing.inQuad(down));
      if (rise <= 0.001) {
        this.points.setMatrixAt(idx, _zero);
        continue;
      }
      const h = c.trailHeight * (0.55 + 0.6 * t.hDice);
      this._compose(idx, t.x, t.z, t.tiltX, t.tiltZ, t.yaw, c.trailRadius * (0.7 + 0.6 * t.hDice), h, rise, null);
      const i4 = idx * 4;
      state[i4] = t.seed;
      state[i4 + 1] = t.seed;
      state[i4 + 2] = 0.6 + Math.exp(-age * 8) * 1.5;
      state[i4 + 3] = down * 0.9;
      drawn++;
    }
    return drawn;
  }

  /* ------------------------------------------------------------------ */
  /* The bodies                                                          */
  /* ------------------------------------------------------------------ */

  _strike(i, sp, c, g, height) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const power = g.explosionIntensity;
    this.pointAt(1, _centre);
    const R = Math.max(0.5, c.zoneRadius);
    const reach = i === 0 ? R + 0.3 : Math.max(0.1, c.hitRadius);
    const found = field.findTargets(sp.x, sp.z, reach, this._targets);
    for (let f = 0; f < found.length; f++) {
      const dummy = found[f];
      _dir.set(dummy.position.x - _centre.x, 0, dummy.position.z - _centre.z);
      if (_dir.lengthSq() < 1e-6) _dir.set(Math.cos(sp.seed * TAU), 0, Math.sin(sp.seed * TAU));
      _dir.normalize();
      this._force.impulse = (i === 0 ? c.masterImpulse : c.hitImpulse) * power;
      this._force.lift = (i === 0 ? c.masterLift : c.hitLift * Math.min(1.5, height / Math.max(0.5, c.ringHeightMax))) * power;
      this._force.spin = c.hitSpin;
      dummy.kill(_dir.x, _dir.z, this._force);
    }
    this._targets.length = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  _fillEmit(position, radius, speed, spread, size, life, spin) {
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = _up;
    _emit.speed = speed;
    _emit.speedVariance = 0.5;
    _emit.spread = spread;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = size;
    _emit.sizeVariance = 0.6;
    _emit.life = life;
    _emit.lifeVariance = 0.4;
    _emit.spin = spin;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
  }

  /** One point breaking the floor. */
  _breakFx(i, sp, c, g, height) {
    const n = g.particleCount;
    const master = i === 0;
    const scale = master ? 2 : 1;
    _pos.set(sp.x, 0.1, sp.z);
    this._fillEmit(_pos, 0.35 * scale, c.shardSpeed * (master ? 1.3 : 1), 0.7, 0.1, c.shardLife, 10);
    this.shards.emit(Math.round(c.shardCount * scale * n), _emit);
    this._fillEmit(_pos, 0.3 * scale, c.sparkSpeed, 0.6, 0.08, c.sparkLife, 0);
    this.sparks.emit(Math.round(c.sparkCount * scale * n), _emit);
    this._fillEmit(_pos.set(sp.x, 0.25, sp.z), 0.5 * scale, c.dustSpeed, 1, 0.5, c.dustLife, 0.5);
    this.dust.emit(Math.round(c.dustCount * scale * n), _emit);
    // A run of glints straight up the new point.
    _pos.set(sp.x, height * 0.5, sp.z);
    this._fillEmit(_pos, height * 0.3, 0.6, 1, 0.07, c.glintLife, 0);
    this.glints.emit(Math.round(10 * scale * n), _emit);

    const power = g.explosionIntensity;
    if (!master) {
      this.ctx.shake.add(c.spireShake * power, 6, 22);
      this.lightBoost = Math.max(this.lightBoost, c.impactLight * 0.18 * power);
      this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos.set(sp.x, 0, sp.z), {
        radius: c.pointRingRadius * power,
        life: 0.45,
        width: 0.05,
        intensity: 0.9,
        colorA: getColor(c.colorShockA),
        colorB: getColor(c.colorShockB),
        height: 0.03
      });
      return;
    }

    /* --- the master: the real beat --- */
    this.pointAt(1, _centre);
    this.ctx.shake.add(c.masterShake * power, 3.4, 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.impactLight * power;
    this.ctx.bursts.spawn(BurstMode.FROST, _pos.copy(_centre).setY(1.2), {
      radius: 0.4,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1.4,
      opacity: 0.75 * g.opacity,
      squash: 0.8,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.shockRadius * power,
      life: c.shockLife,
      width: 0.07,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
    });
    this.ctx.decals.spawn(DecalType.CRACK, _centre, {
      radius: c.crackRadius,
      life: this.impactDuration + this.fadeDuration * 0.6,
      intensity: 0.9,
      colorA: getColor(c.colorSong),
      colorB: getColor(c.colorVein),
      width: 0.1,
      height: 0.02
    });
  }

  /** One point shattering: shards burst off it, glints scatter. */
  _shatterFx(sp, c, g, height) {
    const n = g.particleCount;
    _pos.set(sp.x, height * 0.55, sp.z);
    this._fillEmit(_pos, Math.max(0.3, height * 0.35), c.shardSpeed * 0.7, 1, 0.09, c.shardLife, 12);
    this.shards.emit(Math.round(c.shardCount * 1.5 * n), _emit);
    this._fillEmit(_pos, Math.max(0.3, height * 0.4), 1.5, 1, 0.07, c.glintLife * 1.2, 0);
    this.glints.emit(Math.round(16 * n), _emit);
    this.ctx.shake.add(c.spireShake * 0.6 * g.explosionIntensity, 7, 26);
  }

  _glintFx(dt, c, g, ringing) {
    const count = Math.round(this.glintEmitter.tick(dt, c.glintRate * (0.3 + ringing)) * g.particleCount);
    if (count <= 0) return;
    const n = this._ringCount();
    this._fillEmit(_pos, 0.15, 0.4, 1, 0.06, c.glintLife, 0);
    for (let k = 0; k < count; k++) {
      const sp = this.spires[(Math.random() * (n + 1)) | 0];
      if (sp.h <= 0.05) continue;
      _pos.set(sp.x, Math.random() * sp.h, sp.z);
      _emit.position = _pos;
      this.glints.emit(1, _emit);
    }
  }

  /** The seed vein: points jab up behind the front, glints stream off it. */
  _travelFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const spacing = Math.max(0.15, c.trailSpacing);
    while (this.front - this._travelled >= spacing) {
      this._travelled += spacing;
      this.pointAt(saturate(this._travelled / this.length), _pos);
      const t = this.trail[this._trailCursor];
      this._trailCursor = (this._trailCursor + 1) % MAX_TRAIL;
      const side = (Math.random() - 0.5) * 2 * c.trailSide;
      t.x = _pos.x + this.side.x * side;
      t.z = _pos.z + this.side.z * side;
      t.born = this.age;
      t.hDice = Math.random();
      t.yaw = Math.random() * TAU;
      const a = Math.random() * TAU;
      const lean = 0.15 + Math.random() * 0.35;
      // Lean forward along the cast, like a wake.
      t.tiltX = this.direction.x * 0.35 + Math.cos(a) * lean;
      t.tiltZ = this.direction.z * 0.35 + Math.sin(a) * lean;
      t.seed = Math.random();
      this._fillEmit(_pos.setY(0.1), 0.15, c.shardSpeed * 0.4, 0.6, 0.06, c.shardLife * 0.5, 8);
      this.shards.emit(Math.max(1, Math.round(3 * g.particleCount)), _emit);
    }
    const count = Math.round(this.travelEmitter.tick(dt, c.trailGlints) * g.particleCount);
    if (count > 0) {
      this._fillEmit(_pos.copy(this.position).setY(0.25), 0.3, 1.2, 0.8, 0.07, c.glintLife * 0.7, 0);
      _emit.tint = getColor(Math.random() < 0.5 ? c.colorSong : c.colorBody);
      this.glints.emit(count, _emit);
      _emit.tint = null;
    }
    this.ctx.shake.rumble(0.05 * g.cameraShake, dt);
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._clock = -1;
    this._sync(dt);
    this._travelFx(dt);
    this._updateChoir(dt);
    this.position.y = 0.4;
  }

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    this._clock = 0;
    this.pointAt(1, _centre);
    this.ctx.shake.add(c.spireShake * g.explosionIntensity, 5, 20);
    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: Math.max(0.5, c.zoneRadius * 0.8),
      life: 1.2,
      intensity: 0.7,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustC),
      growth: 0.4,
      height: 0.025
    });
    this.lightBoost = c.impactLight * 0.25 * g.explosionIntensity;
  }

  onFade(dt) {
    const c = settings[ID];
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;
    this._sync(dt);
    this._updateChoir(dt);
    this.pointAt(1, _centre);
    this.position.set(_centre.x, c.lightHeight, _centre.z);
  }

  onDestroy() {
    this._clock = -1;
    this._live = 0;
    for (let i = 0; i < MAX_TRAIL; i++) this.trail[i].born = -1;
    this.points.visible = false;
    this.floor.visible = false;
    this.flare.visible = false;
    this.resonance.visible = false;
  }

  dispose() {
    this.pointGeometry?.dispose();
    this.quadGeometry.dispose();
    this.resGeometry.dispose();
    this.crystalMaterial.dispose();
    this.floorMaterial.dispose();
    this.flareMaterial.dispose();
    this.resMaterial.dispose();
    this.points.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('◆  Quartz Spire');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'seed vein speed (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const vein = folder.addFolder('0 · Seed vein');
  R(vein, c, 'trailSpacing', 0.15, 3, 0.05, 'point spacing (m)');
  R(vein, c, 'trailHeight', 0.05, 2, 0.01, 'point height (m)');
  R(vein, c, 'trailRadius', 0.02, 0.5, 0.005, 'point radius (m)');
  R(vein, c, 'trailSide', 0, 2, 0.01, 'scatter (m)');
  R(vein, c, 'trailLife', 0.1, 3, 0.05, 'stands for (s)');
  R(vein, c, 'trailGlints', 0, 400, 1, 'glints / s');

  const time = folder.addFolder('Timing');
  R(time, c, 'riseDelay', 0, 1.5, 0.01, 'first point after (s)');
  R(time, c, 'spiralTime', 0, 3, 0.01, 'spiral round the ring (s)');
  R(time, c, 'riseTime', 0.03, 1, 0.01, 'one point rises over (s)');
  R(time, c, 'riseJitter', 0, 0.5, 0.01, 'rise jitter (s)');
  R(time, c, 'overshoot', 0, 1, 0.01, 'overshoot');
  R(time, c, 'masterDelay', 0, 3, 0.01, 'master after (s)');
  R(time, c, 'masterRiseTime', 0.03, 1.5, 0.01, 'master rises over (s)');
  R(time, c, 'lifetime', 0.05, 8, 0.05, 'choir sings for (s)');
  R(time, c, 'shatterSpread', 0, 3, 0.01, 'shatter spread (s)');
  R(time, c, 'shatterTime', 0.05, 2, 0.01, 'one point shatters over (s)');
  R(time, c, 'shatterSink', 0, 1, 0.01, 'sinks while shattering');
  R(time, c, 'groundFade', 0.05, 3, 0.05, 'veins erode over (s)');

  const shape = folder.addFolder('1 · Choir shape');
  R(shape, c, 'spireCount', 3, MAX_RING, 1, 'ring points');
  R(shape, c, 'ringFrac', 0.1, 1, 0.01, 'ring radius (× circle)');
  R(shape, c, 'ringHeightMin', 0.2, 8, 0.05, 'ring shortest (m)');
  R(shape, c, 'ringHeightMax', 0.2, 8, 0.05, 'ring tallest (m)');
  R(shape, c, 'spireRadius', 0.05, 1.2, 0.01, 'ring thickness (m)');
  R(shape, c, 'spireLean', -0.6, 0.8, 0.01, 'lean in (rad)');
  R(shape, c, 'leanJitter', 0, 0.6, 0.01, 'lean jitter (rad)');
  R(shape, c, 'masterHeight', 0.5, 12, 0.05, 'master height (m)');
  R(shape, c, 'masterRadius', 0.05, 2, 0.01, 'master thickness (m)');
  R(shape, c, 'satellites', 0, MAX_SATS, 1, 'satellites per foot');
  R(shape, c, 'satScale', 0.05, 1, 0.01, 'satellite size (×)');
  R(shape, c, 'satSpread', 0, 2, 0.01, 'satellite spread (m)');
  R(shape, c, 'satLean', 0, 1.4, 0.01, 'satellite splay (rad)');
  R(shape, c, 'tipLength', 0.05, 0.8, 0.01, 'termination (rebuild)');
  R(shape, c, 'asymmetry', 0, 1, 0.01, 'face asymmetry (rebuild)');

  const crystal = folder.addFolder('2 · Crystal');
  crystal.addColor(c, 'colorBody').name('crystal');
  crystal.addColor(c, 'colorDeep').name('depth');
  crystal.addColor(c, 'colorCore').name('inner light');
  crystal.addColor(c, 'colorSong').name('song');
  crystal.addColor(c, 'colorEdge').name('edges');
  R(crystal, c, 'coreGlow', 0, 8, 0.05, 'core glow');
  R(crystal, c, 'coreSharpness', 0.2, 10, 0.05, 'core sharpness');
  R(crystal, c, 'phantoms', 0, 16, 0.1, 'phantoms');
  R(crystal, c, 'phantomGlow', 0, 4, 0.01, 'phantom glow');
  R(crystal, c, 'veils', 0, 2, 0.01, 'veils');
  R(crystal, c, 'veilScale', 0.2, 8, 0.05, 'veil scale');
  R(crystal, c, 'rimGlow', 0, 8, 0.05, 'rim glow');
  R(crystal, c, 'dispersion', 0, 1, 0.01, 'dispersion');
  R(crystal, c, 'edgeGlow', 0, 8, 0.05, 'edge glow');
  R(crystal, c, 'edgeWidth', 0.005, 0.3, 0.005, 'edge width');
  R(crystal, c, 'envReflect', 0, 2, 0.01, 'sky reflection');
  R(crystal, c, 'specular', 0, 10, 0.05, 'sun glint');
  R(crystal, c, 'songRate', 0, 6, 0.05, 'song rate (/s)');
  R(crystal, c, 'songWidth', 0.01, 0.5, 0.005, 'song width');
  R(crystal, c, 'songGlow', 0, 15, 0.05, 'song glow');
  R(crystal, c, 'idleGlow', 0, 2, 0.01, 'standing glow');
  R(crystal, c, 'punchGlow', 0, 6, 0.05, 'break-out flash');
  R(crystal, c, 'shatterEdge', 0.01, 0.4, 0.005, 'fracture edge');

  const floor = folder.addFolder('3 · Choir floor');
  floor.addColor(c, 'colorFloor').name('floor');
  floor.addColor(c, 'colorVein').name('veins');
  R(floor, c, 'veinWidth', 0.005, 0.3, 0.005, 'vein width (m)');
  R(floor, c, 'veinGlow', 0, 10, 0.05, 'vein glow');
  R(floor, c, 'frost', 0, 2, 0.01, 'frosted plates');
  R(floor, c, 'frostScale', 0.2, 6, 0.05, 'plates / m');
  R(floor, c, 'floorDark', 0, 1, 0.01, 'darkening');
  R(floor, c, 'starSkip', 1, 5, 1, 'star step');
  R(floor, c, 'revealTime', 0.05, 2, 0.01, 'grows out over (s)');

  const air = folder.addFolder('4 · Flare & resonance');
  R(air, c, 'flareSize', 0.1, 5, 0.05, 'flare size (m)');
  R(air, c, 'flareGlow', 0, 8, 0.05, 'flare glow');
  R(air, c, 'flareRays', 2, 12, 1, 'rays');
  R(air, c, 'resonanceWarp', 0, 3, 0.01, 'ringing air');
  R(air, c, 'resonanceBands', 0.5, 12, 0.1, 'rings up the column');
  R(air, c, 'resonanceHeight', 0.5, 14, 0.05, 'column height (m)');
  R(air, c, 'resonanceSpeed', 0, 6, 0.05, 'rings / s');

  const parts = folder.addFolder('5 · Particles');
  R(parts, c, 'glintRate', 0, 400, 1, 'glints / s');
  R(parts, c, 'glintSize', 0.005, 0.3, 0.005, 'glint size');
  R(parts, c, 'glintLife', 0.1, 3, 0.05, 'glint lifetime');
  R(parts, c, 'glintGlow', 0, 8, 0.05, 'glint glow');
  Editor.gradient(parts, c, 'colorGlint', 'glint colour');
  R(parts, c, 'shardCount', 0, 40, 1, 'shards per point');
  R(parts, c, 'shardSpeed', 0, 20, 0.1, 'shard speed');
  R(parts, c, 'shardSize', 0.01, 0.4, 0.005, 'shard size');
  R(parts, c, 'shardLife', 0.1, 4, 0.05, 'shard lifetime');
  R(parts, c, 'shardGravity', -30, 0, 0.5, 'shard gravity');
  Editor.gradient(parts, c, 'colorShard', 'shard colour');
  R(parts, c, 'dustCount', 0, 20, 1, 'dust per point');
  R(parts, c, 'dustSize', 0.05, 3, 0.05, 'dust size');
  R(parts, c, 'dustSpeed', 0, 6, 0.05, 'dust speed');
  R(parts, c, 'dustLife', 0.1, 5, 0.05, 'dust lifetime');
  R(parts, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(parts, c, 'colorDust', 'dust colour');
  R(parts, c, 'sparkCount', 0, 40, 1, 'sparks per point');
  R(parts, c, 'sparkSpeed', 0, 25, 0.1, 'spark speed');
  R(parts, c, 'sparkSize', 0.005, 0.3, 0.005, 'spark size');
  R(parts, c, 'sparkLife', 0.05, 2, 0.01, 'spark lifetime');
  R(parts, c, 'sparkStretch', 0, 2, 0.01, 'spark stretch');

  const beat = folder.addFolder('6 · The beat');
  R(beat, c, 'spireShake', 0, 1, 0.01, 'knock per point');
  R(beat, c, 'masterShake', 0, 2, 0.01, 'master jolt');
  R(beat, c, 'impactFlash', 0, 1, 0.01, 'flash');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'burstRadius', 0, 10, 0.05, 'frost shell (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'shell life');
  beat.addColor(c, 'colorBurstA').name('shell, hot');
  beat.addColor(c, 'colorBurstB').name('shell, body');
  beat.addColor(c, 'colorBurstC').name('shell, deep');
  R(beat, c, 'shockRadius', 0, 20, 0.05, 'shock ring (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'shock life');
  beat.addColor(c, 'colorShockA').name('shock ring');
  beat.addColor(c, 'colorShockB').name('shock ring, hot');
  R(beat, c, 'pointRingRadius', 0, 5, 0.05, 'ring per point (m)');
  R(beat, c, 'crackRadius', 0, 8, 0.05, 'heart crack (m)');

  const hit = folder.addFolder('7 · Bodies');
  R(hit, c, 'hitRadius', 0.1, 3, 0.01, 'impale radius (m)');
  R(hit, c, 'hitImpulse', 0, 15, 0.1, 'outward impulse');
  R(hit, c, 'hitLift', 0, 25, 0.1, 'lift');
  R(hit, c, 'hitSpin', 0, 6, 0.05, 'spin');
  R(hit, c, 'masterImpulse', 0, 20, 0.1, 'master impulse');
  R(hit, c, 'masterLift', 0, 25, 0.1, 'master lift');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0.1, 8, 0.05, 'height (m)');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'chime');
  R(light, c, 'impactLight', 0, 60, 0.5, 'light punch');
}
