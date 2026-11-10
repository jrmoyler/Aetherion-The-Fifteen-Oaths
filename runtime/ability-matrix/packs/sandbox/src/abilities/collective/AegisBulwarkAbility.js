import { Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createAegisDomeMaterial, createAegisSigilMaterial, MAX_IMPACTS } from '../../materials/collective/AegisBulwarkMaterial.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, Easing, randRange } from '../../utils/math.js';

export const ID = 'aegis';

/** Grid the dome is wrapped from: around × floor-to-crown. */
const DOME_AROUND = 96;
const DOME_UP = 32;
const TAU = Math.PI * 2;

const _emit = {};
const _centre = new Vector3();
const _pos = new Vector3();
const _dir = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * AEGIS — Aegis Bulwark.
 *
 * A zone cast that can be dropped at the caster's own feet (`minRange` 0). An
 * anchor of light races out to the point; the dome **slams** up out of the
 * floor, throwing everything inside it outward, stands for its `lifetime`
 * taking the odd stray hit, and comes apart cell by cell.
 *
 * Layers:
 *
 *   1. **DOME** — an ellipsoidal cap wrapped in the vertex stage from a plain
 *      grid (`AegisBulwarkMaterial`). Its fragment computes a hexagonal
 *      lattice on the dome's own uv, seams bright and faces dim, under a
 *      fresnel rim. As it forms, cells light from the floor upward in a
 *      jittered wave, each flaring as it is crossed; scan lines climb the
 *      wall; impact ripples run across it from where it is struck; and on the
 *      way out each cell burns bright and drops out on its own dice.
 *   2. **SIGIL** — a ground quad with its own shader: two bounding circles
 *      and ticks, a band of procedural runes built from SDF strokes picked by
 *      a hash per sector, and a counter-rotating hexagram — drawn in with a
 *      sweep round the circle.
 *   3. **MOTES** — soft additive energy rising inside the dome while it
 *      stands, trailing the anchor as it races out, and released as the cells
 *      dissolve.
 *   4. **SLAM** — an AIR shell, a SHOCKWAVE and a DUSTRING decal, a spray of
 *      motes, a light punch, a flash and a kick when it goes up, and every
 *      body inside thrown outward.
 *   5. **LIGHT** — a cool light standing in the dome, humming with the cells.
 *   6. **SPARKS** — velocity-stretched STREAKs: shot up the wall on the slam,
 *      skimming up it while it stands, spat off every ripple and off the foot
 *      on every heartbeat.
 *   7. **SHARDS** — lit CHIPs of the glass: plates kicked off the rim on the
 *      slam and dropping off as it comes apart.
 *
 * ## The upgrade (2026): a body, and a standing life
 *
 * The first version was all additive light and read as a near-white bubble
 * that stood unchanged once it had slammed. Now:
 *
 *   - **the dome has a body** — premultiplied over-blending: a deep navy
 *     glass (`colorDeep` → `colorBody` toward the rim, `bodyOpacity`) that
 *     darkens what is behind it, with the light *added* on top — pale-tint
 *     seams with a white-hot centre line only (`colorCore`, `seamCore`). Four
 *     stops: core → tint → body → deep.
 *   - **the lattice lives while it stands** — the cells slide round
 *     (`latticeSpin`), a radar arm of lit cells with a cooling tail runs round
 *     the wall (`sweep*`), a heartbeat band of cells climbs floor to crown
 *     every `beatPeriod` and the dome swells with it (`breath`), cells flare on
 *     their own clocks (`spark*`), and stray hits ripple it more often.
 *   - **the floor is a field, not a line** — the sigil quad fills the circle
 *     with a deep floor (`floorFill`), the lattice's footprint in faint hex
 *     seams, a hot foot where the wall meets the floor, and a ripple that runs
 *     out across it on each heartbeat.
 *   - **more than motes** — sparks and shards, so the slam, the stand and
 *     the dissolve each throw something with its own shape.
 *
 * ## Decisions
 *
 * `handlesOwnHits` is true. The default zone disc fells bodies along the cast
 * direction; a shield should throw them *away from its centre*, and it should
 * keep doing so to anything that walks in while it stands (`repel`), which a
 * one-shot disc cannot. Every body it throws also lands an impact ripple on
 * the dome at the bearing it left on, so the lattice answers the blow.
 *
 * As in the originals, the per-cast state is events and dice — when it
 * slammed, the seed, the impact bearings and their ages. Radius, height,
 * lattice density, colours, timings are all read from `settings.aegis` every
 * frame, so dragging `zoneRadius` resizes a dome that is already standing.
 */
export class AegisBulwarkAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the dome ---- */
    this.domeGeometry = new PlaneGeometry(1, 1, DOME_AROUND, DOME_UP);
    this.domeMaterial = createAegisDomeMaterial();
    this.dome = new Mesh(this.domeGeometry, this.domeMaterial);
    this.dome.name = 'AegisDome';
    this.dome.layers.set(LAYER.VFX);
    this.dome.frustumCulled = false; // shaped in the vertex stage
    this.dome.renderOrder = 12;
    this.dome.visible = false;
    this.group.add(this.dome);

    /* ---- layer 2: the sigil ---- */
    this.sigilGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.sigilMaterial = createAegisSigilMaterial();
    this.sigil = new Mesh(this.sigilGeometry, this.sigilMaterial);
    this.sigil.name = 'AegisSigil';
    this.sigil.layers.set(LAYER.VFX);
    this.sigil.renderOrder = 5;
    this.sigil.frustumCulled = false;
    this.sigil.visible = false;
    this.group.add(this.sigil);

    this._domeState = {
      radius: 1, height: 1, wobble: 0, slamAge: 0, form: 0, dissolve: 0, fade: 0, seed: 0,
      spinU: 0, sweepPos: 0, beatPhase: -1, stand: 0
    };
    this._sigilState = { radius: 1, quadSize: 1, spin: 0, innerSpin: 0, grow: 0, fade: 0, seed: 0, ringPhase: 0, stand: 0 };
    /** Integrated clocks of the standing lattice, so their rates are live. */
    this._spinU = 0;
    this._sweepPos = 0;
    /** Which heartbeat last threw sparks off the foot. */
    this._lastBeat = -1;

    /** Ripple slots: unit bearing on the dome + age, written straight into the uniform. */
    this._impacts = this.domeMaterial.uniforms.uImpacts.value;
    this._impactCursor = 0;

    /** Reused by `DummyField#findTargets`. */
    this._targets = [];

    // Per-cast state, reset in `onSpawn`.
    this._slamAge = -1;
    this._seed = 0;
    this._spin = 0;
    this._innerSpin = 0;
    this._sigilGrow = 0;
  }

  createParticles() {
    this.motes = this.ctx.particles.get('aegis.motes', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.4
    });
    this.motes.uniforms.uDrag.value = 0.8;
    this.motes.uniforms.uEndSize.value = 0.4;
    this.motes.uniforms.uSizeIn.value = 0.08;
    this.motes.uniforms.uFadeIn.value = 0.1;
    this.motes.uniforms.uFadeOut.value = 0.4;

    // Sparks: velocity-stretched streaks skimming the wall.
    this.sparks = this.ctx.particles.get('aegis.sparks', {
      capacity: 1600,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparks.uniforms.uDrag.value = 0.6;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.5;

    // Shards: lit plates of the glass, which fall.
    this.shards = this.ctx.particles.get('aegis.shards', {
      capacity: 600,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.2
    });
    this.shards.uniforms.uDrag.value = 0.3;
    this.shards.uniforms.uEndSize.value = 0.7;
    this.shards.uniforms.uSizeIn.value = 0.03;
    this.shards.uniforms.uFadeIn.value = 0.02;
    this.shards.uniforms.uFadeOut.value = 0.3;

    this.moteEmitter = new RateEmitter();
    this.impactEmitter = new RateEmitter();
    this.dissolveEmitter = new RateEmitter();
    this.sparkEmitter = new RateEmitter();
    this.shardEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return (this.dome.visible ? 1 : 0) + (this.sigil.visible ? 1 : 0);
  }

  /** The dome stands for its lifetime. */
  get impactDuration() {
    return Math.max(0.05, settings.aegis.lifetime * settings.global.lifetime);
  }

  /** ...and then comes apart cell by cell. */
  get fadeDuration() {
    return Math.max(0.05, settings.aegis.dissolveTime);
  }

  /** A hum, not a flicker: a field holding its shape. */
  lightShimmer() {
    const k = settings.aegis.lightHum;
    return 1 - k * 0.5 + k * 0.5 * Math.sin(this.age * 11.0) * Math.sin(this.age * 2.3 + 1.0);
  }

  /* ------------------------------------------------------------------ */
  /* Live geometry                                                       */
  /* ------------------------------------------------------------------ */

  get radius() {
    return Math.max(0.2, settings.aegis.zoneRadius);
  }

  _centrePoint(out) {
    return this.pointAt(1, out).setY(0);
  }

  /** How far up the slam has carried the dome, with one overshoot. */
  _rise() {
    if (this._slamAge < 0) return 0;
    const c = settings.aegis;
    const riseTime = Math.max(0.02, c.riseTime);
    const peak = 1 + c.riseOvershoot;
    if (this._slamAge <= riseTime) return Easing.outQuint(this._slamAge / riseTime) * peak;
    const settle = saturate((this._slamAge - riseTime) / (riseTime * 1.2));
    return peak - c.riseOvershoot * Easing.inOutQuad(settle);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._slamAge = -1;
    this._seed = Math.random() * 100;
    this._spin = Math.random() * TAU;
    this._innerSpin = 0;
    this._impactCursor = 0;
    for (let i = 0; i < MAX_IMPACTS; i++) this._impacts[i].set(0, 1, 0, -1);
    this.moteEmitter.reset();
    this.impactEmitter.reset();
    this.dissolveEmitter.reset();
    this.sparkEmitter.reset();
    this.shardEmitter.reset();
    this._spinU = Math.random();
    this._sweepPos = Math.random();
    this._lastBeat = -1;
    this._targets.length = 0;

    this.dome.visible = false;
    this.sigil.visible = false;
    // The sigil starts drawing itself the moment the cast leaves the hand, so
    // it is already turning by the time the dome slams over it.
    this._sigilGrow = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Repulsion                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Throw every live body inside the dome outward, and ripple the dome where
   * each one left.
   */
  _repel() {
    const c = settings.aegis;
    if (!settings.dummies.hit.enabled) return;

    this._centrePoint(_centre);
    const found = this.ctx.dummies?.findTargets?.(_centre.x, _centre.z, this.radius, this._targets);
    if (!found) return;

    for (let i = 0; i < found.length; i++) {
      const dummy = found[i];
      let dx = dummy.position.x - _centre.x;
      let dz = dummy.position.z - _centre.z;
      const flat = Math.hypot(dx, dz);
      // A body standing dead centre has no outward; it takes the cast's own.
      if (flat < 1e-3) {
        dx = this.direction.x;
        dz = this.direction.z;
      } else {
        dx /= flat;
        dz /= flat;
      }
      if (dummy.kill(dx, dz, c.hit)) {
        // The lattice answers the blow at the bearing it left on, a little way up.
        this._addImpact(dx, 0.35, dz);
      }
    }
  }

  /** Start a ripple at a direction on the dome (local, need not be unit). */
  _addImpact(x, y, z) {
    const slot = this._impacts[this._impactCursor];
    this._impactCursor = (this._impactCursor + 1) % MAX_IMPACTS;
    _dir.set(x, Math.max(0.02, y), z).normalize();
    slot.set(_dir.x, _dir.y, _dir.z, 0);

    const c = settings.aegis;
    const g = settings.global;
    // A spit of motes off the surface where it lands.
    this._centrePoint(_pos);
    const h = this.radius * c.heightScale;
    _pos.x += _dir.x * this.radius;
    _pos.y += _dir.y * h;
    _pos.z += _dir.z * this.radius;
    _emit.position = _pos;
    _emit.radius = 0.1;
    _emit.direction = _dir;
    _emit.speed = c.moteSpeed * 3;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.8;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.5;
    _emit.life = c.moteLife * 0.4;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.motes.emit(Math.round(12 * g.particleCount), _emit);

    // ...and sparks spat off it, skimming the surface.
    _emit.speed = c.sparkSpeed * 1.3;
    _emit.spread = 0.9;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLife;
    this.sparks.emit(Math.round(c.impactSparks * g.particleCount), _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _syncMotes() {
    const c = settings.aegis;
    const g = settings.global;
    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    this.motes.uniforms.uGravity.value.set(0, c.moteRise, 0);
    this.motes.uniforms.uSizeScale.value = (c.moteSize / 0.1) * g.particleSize;
    this.motes.uniforms.uLifeScale.value = g.particleLifetime;
    this.motes.uniforms.uSpeedScale.value = g.particleSpeed;
    this.motes.uniforms.uOpacity.value = g.opacity;
    this.motes.uniforms.uGlow.value = c.moteGlow * g.glow;
    this.motes.uniforms.uTurbulence.value = c.moteTurbulence * g.turbulence;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    this.sparks.uniforms.uGravity.value.set(0, -2.5, 0);
    this.sparks.uniforms.uSizeScale.value = (c.sparkSize / 0.1) * g.particleSize;
    this.sparks.uniforms.uLifeScale.value = g.particleLifetime;
    this.sparks.uniforms.uSpeedScale.value = g.particleSpeed;
    this.sparks.uniforms.uOpacity.value = g.opacity;
    this.sparks.uniforms.uGlow.value = c.sparkGlow * g.glow;

    this.shards.setGradient(getColor(c.colorShardA), getColor(c.colorShardB), getColor(c.colorShardC), getColor(c.colorShardD));
    this.shards.uniforms.uGravity.value.set(0, c.shardGravity, 0);
    this.shards.uniforms.uSizeScale.value = (c.shardSize / 0.1) * g.particleSize;
    this.shards.uniforms.uLifeScale.value = g.particleLifetime;
    this.shards.uniforms.uSpeedScale.value = g.particleSpeed;
    this.shards.uniforms.uOpacity.value = g.opacity;
  }

  /** Seconds into the standing life (after the wave has reached the crown). */
  _standAge() {
    return this._slamAge - settings.aegis.formTime * 0.8;
  }

  /** 0..1 position of the heartbeat band, or -1 between bands. */
  _beatPhase() {
    const t = this._standAge();
    if (t < 0) return -1;
    const period = Math.max(0.1, settings.aegis.beatPeriod);
    // The band enters below the floor and leaves above the crown.
    return (t / period - Math.floor(t / period)) * 1.3 - 0.15;
  }

  /**
   * Drive the dome and the sigil.
   * @param {number} dissolve 0..1 cell-by-cell dissolve
   * @param {number} fade     0..1 overall fade
   */
  _updateMeshes(dt, dissolve, fade) {
    const c = settings.aegis;
    const g = settings.global;
    const radius = this.radius;
    this._centrePoint(_centre);

    /* --- the sigil: draws itself in, turns, goes with the dome --- */
    this._sigilGrow = Math.min(1, this._sigilGrow + dt / 0.45);
    this._spin += c.sigilSpin * g.animationSpeed * dt;
    this._innerSpin += c.sigilInnerSpin * g.animationSpeed * dt;
    const ss = this._sigilState;
    ss.radius = radius;
    ss.quadSize = radius * c.sigilScale * 2 + c.sigilLine * 16 + 0.5;
    ss.spin = this._spin;
    ss.innerSpin = this._innerSpin;
    ss.grow = Easing.outCubic(this._sigilGrow);
    ss.fade = fade * (1 - dissolve * 0.6);
    ss.seed = this._seed;
    const standAge = this._slamAge < 0 ? -1 : this._standAge();
    const stand = saturate(standAge / 0.3 + 1) * (this._slamAge < 0 ? 0 : 1) * (1 - dissolve);
    ss.stand = stand;
    ss.ringPhase = standAge < 0 ? 0 : saturate(this._beatPhase() / 1.15);
    this.sigil.position.set(_centre.x, 0.025, _centre.z);
    this.sigil.scale.set(ss.quadSize, 1, ss.quadSize);
    this.sigilMaterial.userData.sync(ss);
    this.sigil.visible = ss.fade > 0.002;

    /* --- the dome --- */
    if (this._slamAge < 0) {
      this.dome.visible = false;
      return;
    }
    const rise = this._rise();
    const ds = this._domeState;
    this._spinU += c.latticeSpin * g.animationSpeed * dt * stand;
    this._sweepPos += c.sweepSpeed * g.animationSpeed * dt;
    const beat = this._beatPhase();
    // The dome swells as the band leaves the floor.
    const swell = beat > -0.15 ? Math.exp(-Math.pow((beat - 0.1) / 0.18, 2)) : 0;
    ds.radius = radius * (1 + c.breath * swell * stand);
    ds.spinU = this._spinU;
    ds.sweepPos = this._sweepPos - Math.floor(this._sweepPos);
    ds.beatPhase = beat;
    ds.stand = stand;
    ds.height = Math.max(0.02, ds.radius * c.heightScale * rise);
    ds.wobble = c.wobble * Math.exp(-this._slamAge * c.wobbleDecay);
    ds.slamAge = this._slamAge;
    // Unclamped, so the flare of the last cells to light dies away too.
    ds.form = Math.min(50, this._slamAge / Math.max(0.02, c.formTime)) * 1.15;
    ds.dissolve = dissolve;
    ds.fade = fade;
    ds.seed = this._seed;
    this.dome.position.copy(_centre);
    this.domeMaterial.userData.sync(ds);
    this.dome.visible = fade > 0.002;

    // Age the ripples.
    for (let i = 0; i < MAX_IMPACTS; i++) {
      const imp = this._impacts[i];
      if (imp.w >= 0) {
        imp.w += dt;
        if (imp.w > c.impactLife) imp.w = -1;
      }
    }
  }

  /** Motes rising inside, stray hits, and cells released on the way out. */
  _standingFx(dt, strength, dissolve) {
    const c = settings.aegis;
    const g = settings.global;
    const time = frame.uTime.value;
    const radius = this.radius;
    this._centrePoint(_centre);

    const count = Math.round(this.moteEmitter.tick(dt, c.moteRate * strength) * g.particleCount);
    for (let n = 0; n < count; n++) {
      const angle = Math.random() * TAU;
      const reach = Math.sqrt(Math.random()) * radius * 0.9;
      _pos.set(_centre.x + Math.cos(angle) * reach, 0.1, _centre.z + Math.sin(angle) * reach);
      _emit.position = _pos;
      _emit.radius = 0.05;
      _emit.direction = _up;
      _emit.speed = c.moteSpeed;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.25;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.1;
      _emit.sizeVariance = 0.6;
      _emit.life = c.moteLife;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = time;
      this.motes.emit(1, _emit);
    }

    // Stray hits while it stands, at random bearings.
    if (strength > 0.5 && dissolve <= 0) {
      const hits = this.impactEmitter.tick(dt, c.impactRate);
      for (let n = 0; n < hits; n++) {
        const angle = Math.random() * TAU;
        this._addImpact(Math.cos(angle), randRange(0.15, 0.85), Math.sin(angle));
      }
    }

    // Sparks skimming up the wall: born low on the dome, sent along its
    // tangent toward the crown.
    const h = radius * c.heightScale;
    const crawl = Math.round(this.sparkEmitter.tick(dt, c.sparkCrawl * strength) * g.particleCount);
    for (let n = 0; n < crawl; n++) {
      const angle = Math.random() * TAU;
      const el = Math.random() * 0.5;
      const ce = Math.cos(el);
      const se = Math.sin(el);
      _pos.set(_centre.x + ce * Math.cos(angle) * radius, se * h + 0.05, _centre.z + ce * Math.sin(angle) * radius);
      _dir.set(-se * Math.cos(angle) * radius, ce * h, -se * Math.sin(angle) * radius).normalize();
      _emit.position = _pos;
      _emit.radius = 0.05;
      _emit.direction = _dir;
      _emit.speed = c.sparkSpeed;
      _emit.speedVariance = 0.4;
      _emit.spread = 0.12;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.1;
      _emit.sizeVariance = 0.5;
      _emit.life = c.sparkLife;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = time;
      this.sparks.emit(1, _emit);
    }

    // Each heartbeat throws a ring of sparks off the foot.
    if (dissolve <= 0 && this._standAge() >= 0) {
      const beatIndex = Math.floor(this._standAge() / Math.max(0.1, c.beatPeriod));
      if (beatIndex !== this._lastBeat) {
        this._lastBeat = beatIndex;
        const n = Math.round(c.beatSparks * g.particleCount);
        for (let k = 0; k < n; k++) {
          const angle = (k / Math.max(1, n)) * TAU + Math.random() * 0.3;
          _pos.set(_centre.x + Math.cos(angle) * radius, 0.08, _centre.z + Math.sin(angle) * radius);
          _dir.set(Math.cos(angle), 0.9, Math.sin(angle)).normalize();
          _emit.position = _pos;
          _emit.radius = 0.05;
          _emit.direction = _dir;
          _emit.speed = c.sparkSpeed * 0.8;
          _emit.speedVariance = 0.4;
          _emit.spread = 0.3;
          _emit.inherit = null;
          _emit.anchor = null;
          _emit.size = 0.1;
          _emit.sizeVariance = 0.5;
          _emit.life = c.sparkLife;
          _emit.lifeVariance = 0.3;
          _emit.spin = 0;
          _emit.tint = null;
          _emit.time = time;
          this.sparks.emit(1, _emit);
        }
      }
    }

    // Plates of the glass dropping off as it comes apart.
    if (dissolve > 0 && dissolve < 1) {
      const shards = Math.round(this.shardEmitter.tick(dt, c.dissolveShards) * g.particleCount);
      for (let n = 0; n < shards; n++) {
        const angle = Math.random() * TAU;
        const el = Math.random() * Math.PI * 0.45;
        _dir.set(Math.cos(el) * Math.cos(angle), Math.sin(el), Math.cos(el) * Math.sin(angle));
        _pos.set(_centre.x + _dir.x * radius, _dir.y * h, _centre.z + _dir.z * radius);
        _emit.position = _pos;
        _emit.radius = 0.05;
        _emit.direction = _dir;
        _emit.speed = c.shardSpeed * 0.3;
        _emit.speedVariance = 0.5;
        _emit.spread = 0.6;
        _emit.inherit = null;
        _emit.anchor = null;
        _emit.size = 0.1;
        _emit.sizeVariance = 0.5;
        _emit.life = c.shardLife;
        _emit.lifeVariance = 0.3;
        _emit.spin = 6;
        _emit.tint = null;
        _emit.time = time;
        this.shards.emit(1, _emit);
      }
    }

    // Cells coming apart release their light.
    if (dissolve > 0 && dissolve < 1) {
      const released = Math.round(this.dissolveEmitter.tick(dt, c.dissolveMotes * 40) * g.particleCount);
      for (let n = 0; n < released; n++) {
        const angle = Math.random() * TAU;
        const el = Math.random() * Math.PI * 0.5;
        _dir.set(Math.cos(el) * Math.cos(angle), Math.sin(el), Math.cos(el) * Math.sin(angle));
        _pos.set(_centre.x + _dir.x * radius, _dir.y * h, _centre.z + _dir.z * radius);
        _emit.position = _pos;
        _emit.radius = 0.05;
        _emit.direction = _dir;
        _emit.speed = c.moteSpeed * 1.4;
        _emit.speedVariance = 0.6;
        _emit.spread = 0.5;
        _emit.inherit = null;
        _emit.anchor = null;
        _emit.size = 0.12;
        _emit.sizeVariance = 0.5;
        _emit.life = c.moteLife * 0.8;
        _emit.lifeVariance = 0.4;
        _emit.spin = 0;
        _emit.tint = null;
        _emit.time = time;
        this.motes.emit(1, _emit);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.aegis;
    const g = settings.global;
    this._syncMotes();
    this._updateMeshes(dt, 0, 1);

    // The anchor of light racing out to the point, at shin height.
    this.position.y = 0.4;
    const count = Math.round(this.moteEmitter.tick(dt, c.travelMotes) * g.particleCount);
    if (count > 0) {
      _emit.position = this.position;
      _emit.radius = 0.15;
      _emit.direction = _up;
      _emit.speed = c.moteSpeed;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.8;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.12;
      _emit.sizeVariance = 0.5;
      _emit.life = c.moteLife * 0.5;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.motes.emit(count, _emit);

      // ...and a wake of streaks thrown back off it along the floor.
      _dir.copy(this.direction).multiplyScalar(-1).setY(0.35).normalize();
      _emit.direction = _dir;
      _emit.speed = c.sparkSpeed;
      _emit.spread = 0.35;
      _emit.size = 0.1;
      _emit.life = c.sparkLife;
      this.sparks.emit(Math.max(1, Math.round(count * 0.4)), _emit);
    }
  }

  onImpact() {
    const c = settings.aegis;
    const g = settings.global;
    const radius = this.radius;
    this._slamAge = 0;
    this._centrePoint(_centre);
    this.position.copy(_centre).setY(c.lightHeight);

    /* --- the bodies inside go first --- */
    this._repel();

    /* --- the slam --- */
    _pos.copy(_centre).setY(radius * c.heightScale * 0.3);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: radius * 0.6,
      endRadius: radius * c.slamBurst * g.explosionIntensity,
      life: c.slamBurstLife,
      intensity: c.slamBurstIntensity,
      opacity: 0.5,
      fresnel: 2.4,
      displace: 0.25,
      squash: c.heightScale,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: radius * c.shockRadius * g.explosionIntensity,
      life: c.shockLife,
      width: 0.06,
      intensity: 1.0,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: radius * c.dustRadius * g.explosionIntensity,
      life: c.dustLife,
      intensity: 0.8,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustB)
    });

    // Light thrown off the rim as it goes up.
    const sparks = Math.round(c.slamSparks * g.particleCount);
    const spokes = 12;
    for (let k = 0; k < spokes; k++) {
      const angle = (k / spokes) * TAU;
      _dir.set(Math.cos(angle), 1.1, Math.sin(angle)).normalize();
      _pos.set(_centre.x + Math.cos(angle) * radius, 0.15, _centre.z + Math.sin(angle) * radius);
      _emit.position = _pos;
      _emit.radius = 0.2;
      _emit.direction = _dir;
      _emit.speed = c.moteSpeed * 4;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.4;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.12;
      _emit.sizeVariance = 0.5;
      _emit.life = c.moteLife * 0.6;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.motes.emit(Math.max(1, Math.round(sparks / spokes)), _emit);
    }

    // Streaks shot up the wall, and plates of glass kicked off the rim.
    const streaks = Math.round(c.slamStreaks * g.particleCount);
    for (let k = 0; k < streaks; k++) {
      const angle = Math.random() * TAU;
      _pos.set(_centre.x + Math.cos(angle) * radius, 0.1, _centre.z + Math.sin(angle) * radius);
      _dir.set(Math.cos(angle) * 0.25, 1, Math.sin(angle) * 0.25).normalize();
      _emit.position = _pos;
      _emit.radius = 0.1;
      _emit.direction = _dir;
      _emit.speed = c.sparkSpeed * 2.2;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.15;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.12;
      _emit.sizeVariance = 0.5;
      _emit.life = c.sparkLife * 1.2;
      _emit.lifeVariance = 0.3;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.sparks.emit(1, _emit);
    }
    const shards = Math.round(c.slamShards * g.particleCount);
    for (let k = 0; k < shards; k++) {
      const angle = Math.random() * TAU;
      _pos.set(_centre.x + Math.cos(angle) * radius, 0.2, _centre.z + Math.sin(angle) * radius);
      _dir.set(Math.cos(angle), 1.3, Math.sin(angle)).normalize();
      _emit.position = _pos;
      _emit.radius = 0.25;
      _emit.direction = _dir;
      _emit.speed = c.shardSpeed;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.35;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.1;
      _emit.sizeVariance = 0.6;
      _emit.life = c.shardLife;
      _emit.lifeVariance = 0.3;
      _emit.spin = 8;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.shards.emit(1, _emit);
    }

    this.ctx.shake.add(c.slamShake * g.explosionIntensity * g.cameraShake, 2.6, 18);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.slamFlash * g.explosionIntensity);
    this.lightBoost = c.slamLight * g.explosionIntensity;
  }

  onFade(dt, t) {
    const c = settings.aegis;
    this._syncMotes();
    this._slamAge += dt;
    this._centrePoint(this.position);
    this.position.y = c.lightHeight;

    let dissolve = 0;
    let fade = 1;
    if (this.phase === AbilityPhase.FADE) {
      const k = saturate(t - 1);
      dissolve = Easing.inOutQuad(k);
      fade = 1 - Easing.inQuad(saturate((k - 0.7) / 0.3));
    } else if (c.repel > 0.5) {
      // Anything that walks in while it stands is thrown back out.
      this._repel();
    }

    this._updateMeshes(dt, dissolve, fade);
    this._standingFx(dt, 1 - dissolve, dissolve);
  }

  onDestroy() {
    this.dome.visible = false;
    this.sigil.visible = false;
    this._slamAge = -1;
    for (let i = 0; i < MAX_IMPACTS; i++) this._impacts[i].w = -1;
    this._targets.length = 0;
  }

  dispose() {
    this.domeGeometry.dispose();
    this.domeMaterial.dispose();
    this.sigilGeometry.dispose();
    this.sigilMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const R = Editor.range;
  const folder = gui.addFolder('⬡  Aegis Bulwark');

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 0, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 120, 0.5, 'anchor speed (m/s)');
  R(cast, c, 'zoneRadius', 0.5, 10, 0.05, 'dome radius (m)');
  R(cast, c, 'lifetime', 0.1, 20, 0.05, 'stands for');
  R(cast, c, 'dissolveTime', 0.05, 5, 0.05, 'dissolves over');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const repel = folder.addFolder('Repulsion');
  R(repel, c, 'repel', 0, 1, 1, 'keep throwing out intruders');
  R(repel, c.hit, 'impulse', 0, 20, 0.1, 'throw impulse');
  R(repel, c.hit, 'lift', 0, 20, 0.1, 'throw lift');
  R(repel, c.hit, 'spin', 0, 5, 0.05, 'throw spin');

  /* ---- layer 1 ---- */
  const dome = folder.addFolder('1 · Dome');
  const shape = dome.addFolder('Shape & slam');
  R(shape, c, 'heightScale', 0.2, 1.6, 0.01, 'height (× radius)');
  R(shape, c, 'riseTime', 0.02, 1.5, 0.01, 'slam time (s)');
  R(shape, c, 'riseOvershoot', 0, 0.6, 0.005, 'slam overshoot');
  R(shape, c, 'wobble', 0, 0.5, 0.005, 'pressure wobble (m)');
  R(shape, c, 'wobbleDecay', 0.2, 20, 0.1, 'wobble decay (/s)');
  R(shape, c, 'wobbleFreq', 0, 20, 0.1, 'wobble ripples');

  const lattice = dome.addFolder('Lattice');
  R(lattice, c, 'cellsAround', 3, 60, 1, 'cells around');
  R(lattice, c, 'cellRows', 1, 24, 0.1, 'rows to the crown');
  R(lattice, c, 'edgeWidth', 0.005, 0.3, 0.001, 'seam width');
  R(lattice, c, 'edgeBright', 0, 8, 0.05, 'seam brightness');
  R(lattice, c, 'cellFill', 0, 1, 0.005, 'cell fill');
  R(lattice, c, 'cellVariance', 0, 1, 0.01, 'cell dice');
  R(lattice, c, 'crown', 0.3, 1, 0.01, 'lattice melts above');
  R(lattice, c, 'pulseSpeed', 0, 6, 0.05, 'cell breathing rate');
  R(lattice, c, 'pulseDepth', 0, 1, 0.01, 'cell breathing depth');
  R(lattice, c, 'seamCore', 0, 1, 0.01, 'seam hot centre');

  const life = dome.addFolder('Standing life');
  R(life, c, 'latticeSpin', -0.5, 0.5, 0.005, 'cells slide (turns/s)');
  R(life, c, 'sweepSpeed', -2, 2, 0.01, 'radar arm (turns/s)');
  R(life, c, 'sweepWidth', 0.01, 0.5, 0.005, 'radar tail (turns)');
  R(life, c, 'sweepBright', 0, 6, 0.05, 'radar brightness');
  R(life, c, 'beatPeriod', 0.15, 3, 0.01, 'heartbeat every (s)');
  R(life, c, 'beatWidth', 0.01, 0.5, 0.005, 'heartbeat band');
  R(life, c, 'beatBright', 0, 6, 0.05, 'heartbeat brightness');
  R(life, c, 'breath', 0, 0.2, 0.001, 'swell on the beat (× radius)');
  R(life, c, 'sparkRate', 0, 10, 0.05, 'cell clock (/s)');
  R(life, c, 'sparkChance', 0, 0.5, 0.005, 'cells that flare');
  R(life, c, 'sparkBright', 0, 8, 0.05, 'flare brightness');
  const form = dome.addFolder('Forming');
  R(form, c, 'formTime', 0.05, 3, 0.01, 'wave reaches the crown in (s)');
  R(form, c, 'formJitter', 0, 1, 0.01, 'per-cell lag');
  R(form, c, 'formFlash', 0, 10, 0.05, 'flare as a cell lights');
  form.addColor(c, 'colorForm').name('flare colour');

  const surface = dome.addFolder('Surface');
  R(surface, c, 'fresnelPower', 0.2, 8, 0.05, 'fresnel power');
  R(surface, c, 'fresnelBright', 0, 5, 0.01, 'fresnel brightness');
  R(surface, c, 'backFace', 0, 1, 0.01, 'far wall');
  R(surface, c, 'scanCount', 0, 8, 1, 'scan lines');
  R(surface, c, 'scanSpeed', -3, 3, 0.01, 'scan speed');
  R(surface, c, 'scanWidth', 0.002, 0.2, 0.001, 'scan width');
  R(surface, c, 'scanBright', 0, 6, 0.05, 'scan brightness');
  R(surface, c, 'intensity', 0, 8, 0.05, 'intensity');
  R(surface, c, 'opacity', 0, 1, 0.01, 'opacity');
  R(surface, c, 'softFade', 0.01, 2, 0.01, 'soft fade (m)');
  R(surface, c, 'bodyOpacity', 0, 1, 0.01, 'glass body opacity');
  R(surface, c, 'bodyGrad', 0, 4, 0.01, 'body deep → rim');
  surface.addColor(c, 'colorCore').name('seam core (white-hot)');
  surface.addColor(c, 'colorEdge').name('seams (tint)');
  surface.addColor(c, 'colorCell').name('cells (saturated)');
  surface.addColor(c, 'colorBody').name('glass body');
  surface.addColor(c, 'colorDeep').name('glass deep');
  surface.addColor(c, 'colorRim').name('rim');
  surface.addColor(c, 'colorScan').name('scan lines');

  const impacts = dome.addFolder('Impacts');
  R(impacts, c, 'impactRate', 0, 8, 0.05, 'stray hits per second');
  R(impacts, c, 'impactSpeed', 0.1, 8, 0.05, 'ripple speed (rad/s)');
  R(impacts, c, 'impactWidth', 0.01, 0.6, 0.005, 'ripple width (rad)');
  R(impacts, c, 'impactLife', 0.1, 3, 0.05, 'ripple lifetime');
  R(impacts, c, 'impactBright', 0, 10, 0.05, 'ripple brightness');
  R(impacts, c, 'impactRings', 1, 4, 1, 'rings per ripple');
  impacts.addColor(c, 'colorImpact').name('ripple colour');

  const diss = dome.addFolder('Dissolve');
  R(diss, c, 'dissolveEdge', 0, 0.5, 0.005, 'burning edge');
  R(diss, c, 'dissolveGlow', 0, 12, 0.05, 'burn brightness');

  /* ---- layer 2 ---- */
  const sigil = folder.addFolder('2 · Sigil');
  R(sigil, c, 'sigilScale', 0.5, 2, 0.01, 'outer radius (× dome)');
  R(sigil, c, 'sigilBand', 0.05, 0.6, 0.005, 'rune band (× dome)');
  R(sigil, c, 'sigilRunes', 3, 40, 1, 'runes');
  R(sigil, c, 'sigilRuneSize', 0.2, 1.2, 0.01, 'rune size');
  R(sigil, c, 'sigilLine', 0.005, 0.15, 0.001, 'stroke (m)');
  R(sigil, c, 'sigilSpin', -2, 2, 0.01, 'band spin (rad/s)');
  R(sigil, c, 'sigilInnerSpin', -2, 2, 0.01, 'star spin (rad/s)');
  R(sigil, c, 'sigilStar', 0, 1, 1, 'hexagram');
  R(sigil, c, 'sigilGlow', 0, 8, 0.05, 'glow');
  R(sigil, c, 'sigilOpacity', 0, 1, 0.01, 'opacity');
  R(sigil, c, 'sigilFlicker', 0, 1, 0.01, 'rune flicker');
  sigil.addColor(c, 'colorSigil').name('lines');
  sigil.addColor(c, 'colorSigilHot').name('runes');
  R(sigil, c, 'floorFill', 0, 1, 0.01, 'deep field opacity');
  R(sigil, c, 'floorHexSize', 0.03, 0.6, 0.005, 'floor hex (× radius)');
  R(sigil, c, 'floorHexBright', 0, 3, 0.01, 'floor hex brightness');
  R(sigil, c, 'floorContact', 0, 5, 0.05, 'foot of the wall');
  R(sigil, c, 'floorRingBright', 0, 5, 0.05, 'heartbeat ripple');
  sigil.addColor(c, 'colorFloorDeep').name('field deep');
  sigil.addColor(c, 'colorFloorBody').name('field body');

  /* ---- layer 3 ---- */
  const motes = folder.addFolder('3 · Motes');
  R(motes, c, 'moteRate', 0, 400, 1, 'rising (/s)');
  R(motes, c, 'travelMotes', 0, 500, 1, 'off the anchor (/s)');
  R(motes, c, 'dissolveMotes', 0, 20, 0.1, 'released on dissolve');
  R(motes, c, 'moteSize', 0.01, 0.6, 0.005, 'size');
  R(motes, c, 'moteLife', 0.1, 4, 0.05, 'lifetime');
  R(motes, c, 'moteSpeed', 0, 6, 0.05, 'speed');
  R(motes, c, 'moteRise', -2, 6, 0.05, 'rise');
  R(motes, c, 'moteGlow', 0, 8, 0.05, 'glow');
  R(motes, c, 'moteTurbulence', 0, 4, 0.05, 'turbulence');
  Editor.gradient(motes, c, 'colorMote', 'Colour over life');

  const sparks = folder.addFolder('3b · Sparks & shards');
  R(sparks, c, 'sparkCrawl', 0, 200, 1, 'skimming the wall (/s)');
  R(sparks, c, 'sparkSpeed', 0, 12, 0.05, 'spark speed');
  R(sparks, c, 'sparkSize', 0.01, 0.4, 0.005, 'spark size');
  R(sparks, c, 'sparkLife', 0.05, 2, 0.01, 'spark life');
  R(sparks, c, 'sparkGlow', 0, 8, 0.05, 'spark glow');
  R(sparks, c, 'slamStreaks', 0, 400, 1, 'streaks on the slam');
  R(sparks, c, 'impactSparks', 0, 60, 1, 'per ripple');
  R(sparks, c, 'beatSparks', 0, 120, 1, 'per heartbeat');
  Editor.gradient(sparks, c, 'colorSpark', 'Spark colour');
  R(sparks, c, 'slamShards', 0, 200, 1, 'shards on the slam');
  R(sparks, c, 'dissolveShards', 0, 120, 1, 'shards on dissolve (/s)');
  R(sparks, c, 'shardSize', 0.02, 0.6, 0.005, 'shard size');
  R(sparks, c, 'shardSpeed', 0, 12, 0.05, 'shard speed');
  R(sparks, c, 'shardLife', 0.1, 4, 0.05, 'shard life');
  R(sparks, c, 'shardGravity', -30, 0, 0.1, 'shard gravity');
  Editor.gradient(sparks, c, 'colorShard', 'Shard colour');

  /* ---- layer 4 ---- */
  const slam = folder.addFolder('4 · Slam');
  R(slam, c, 'slamBurst', 0.2, 3, 0.01, 'air shell (× radius)');
  R(slam, c, 'slamBurstLife', 0.05, 2, 0.01, 'shell lifetime');
  R(slam, c, 'slamBurstIntensity', 0, 5, 0.05, 'shell intensity');
  slam.addColor(c, 'colorBurstA').name('shell core');
  slam.addColor(c, 'colorBurstB').name('shell body');
  slam.addColor(c, 'colorBurstC').name('shell edge');
  R(slam, c, 'shockRadius', 0.2, 4, 0.01, 'shockwave (× radius)');
  R(slam, c, 'shockLife', 0.1, 3, 0.05, 'shockwave lifetime');
  slam.addColor(c, 'colorShockA').name('shockwave inner');
  slam.addColor(c, 'colorShockB').name('shockwave outer');
  R(slam, c, 'dustRadius', 0.2, 4, 0.01, 'dust ring (× radius)');
  R(slam, c, 'dustLife', 0.1, 4, 0.05, 'dust lifetime');
  slam.addColor(c, 'colorDustA').name('dust inner');
  slam.addColor(c, 'colorDustB').name('dust outer');
  R(slam, c, 'slamSparks', 0, 400, 1, 'light off the rim');
  R(slam, c, 'slamShake', 0, 1.5, 0.01, 'shake');
  R(slam, c, 'slamFlash', 0, 1, 0.01, 'flash');
  slam.addColor(c, 'colorFlash').name('flash colour');

  /* ---- layer 5 ---- */
  const light = folder.addFolder('5 · Light');
  light.addColor(c, 'lightColor').name('light colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'light intensity');
  R(light, c, 'lightRadius', 0.5, 30, 0.1, 'light radius');
  R(light, c, 'lightHeight', 0, 5, 0.05, 'light height (m)');
  R(light, c, 'slamLight', 0, 60, 0.5, 'light punch on the slam');
  R(light, c, 'lightHum', 0, 1, 0.01, 'hum');
}
