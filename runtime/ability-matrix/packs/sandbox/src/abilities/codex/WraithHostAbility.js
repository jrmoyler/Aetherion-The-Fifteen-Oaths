import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createWraithGeometry } from '../../assets/codex/WraithHostGeometry.js';
import {
  createWraithMaterial,
  createWraithPoolMaterial,
  createWraithWailMaterial
} from '../../materials/codex/WraithHostMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing, randRange } from '../../utils/math.js';

export const ID = 'wraiths';

const TAU = Math.PI * 2;

/** Hard ceiling on shades per cast. The editor's count slider clamps to this. */
const MAX_WRAITHS = 12;
/** Bodies held and drained at once. */
const MAX_GRIPS = 12;
/** Fraction of a dive at which the shade passes through its body. */
const STRIKE_AT = 0.6;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _floor = new Vector3();
const _centre = new Vector3();
const _orbitPt = new Vector3();
const _spawnPt = new Vector3();
const _q = new Vector3();
const _exit = new Vector3();
const _bend = new Vector3();
const _at = new Vector3();
const _X = new Vector3();
const _Y = new Vector3();
const _Z = new Vector3();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
const _up = new Vector3(0, 1, 0);

/** Quadratic Bézier, written into `out` (which may not alias the inputs). */
function bezier(a, b, c, t, out) {
  const it = 1 - t;
  return out.copy(a).multiplyScalar(it * it).addScaledVector(b, 2 * it * t).addScaledVector(c, t * t);
}

/**
 * WRAITH HOST — a pool of shadow opens and the shades in it hunt the circle.
 *
 * A zone cast. A thread of shadow creeps across the floor from the caster to
 * the circle. Where it arrives, the rite plays out on one clock:
 *
 *   1. **the pool** — the circle darkens into a disc of shadow that spreads
 *      open with a fingered edge: domain-warped darkness churning in a slow
 *      vortex toward a deeper middle, a pale rim, and a ring of pale runes that
 *      light in order round it. Normal-blended, so it really is dark.
 *   2. **the shades** — one instanced draw of a procedural hooded cloak, one
 *      instance per wraith. Additive fresnel ghosts with a dark hood hollow, two
 *      cold eyes, a tattered hem that billows and trails behind them. They claw
 *      up out of the pool one after another, climb into a ring overhead and
 *      circle, spiralling tighter and higher.
 *   3. **the wail** — while they circle they scream: a camera-facing disc on
 *      `LAYER.DISTORTION` throws rings of pressure out over the circle in time
 *      with their eyes flaring and their hoods being thrown back.
 *   4. **the dive** — one by one each shade picks a body in the circle and
 *      swoops on it — up, over, down — passes clean *through* it and out the far
 *      side, and climbs away, dissolving hem-first into smoke as it goes.
 *   5. **smoke, motes and drained life** — dark smoke off every hem and off the
 *      pool, pale motes off the shades, and pale streaks pulled up out of every
 *      body being drained toward the shade that took it.
 *   6. **the draining** — `handlesOwnHits`. A body a shade passes through is
 *      felled (`dummy.kill`) and then *held*: carried up off the floor with its
 *      weight taken (`dummy.carry`, uniform field, buoyancy), darkened as the
 *      life goes out of it (`dummy.corrode`), and after `drainTime` dropped
 *      (`dummy.release`) to fall dead.
 *
 * Then the pool closes, its runes going first, and leaves a dark residue
 * (a SCORCH decal) behind.
 *
 * ## The editor rule
 *
 * A wraith record stores only dice and two events: where it was when it began
 * its dive and which body (or point) it chose. Everything else — the rise, the
 * ring, the dive curve, the trail, the dissolve — is resolved from
 * `settings.wraiths` every frame from one clock, so dragging `orbitHeight` lifts
 * a host already circling and dragging `diveDelay` holds it up there longer.
 */
export class WraithHostAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /** The host chooses who it takes, and when. */
  get handlesOwnHits() {
    return true;
  }

  /** Shades currently drawn. HUD readout only. */
  get instanceCount() {
    return this._visible;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the pool ---- */
    this.poolGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.poolMaterial = createWraithPoolMaterial();
    this.pool = new Mesh(this.poolGeometry, this.poolMaterial);
    this.pool.name = 'WraithPool';
    this.pool.layers.set(LAYER.VFX);
    this.pool.renderOrder = 3;
    this.pool.frustumCulled = false;
    this.pool.visible = false;
    this.group.add(this.pool);

    /* ---- layer 2: the shades ---- */
    this.wraithGeometry = createWraithGeometry(24, 30);
    this.seedAttr = new InstancedBufferAttribute(new Float32Array(MAX_WRAITHS), 1);
    this.stateAttr = new InstancedBufferAttribute(new Float32Array(MAX_WRAITHS * 4), 4);
    this.stateAttr.setUsage(DynamicDrawUsage);
    this.wraithGeometry.setAttribute('aSeed', this.seedAttr);
    this.wraithGeometry.setAttribute('aState', this.stateAttr);
    this.wraithMaterial = createWraithMaterial();
    this.host = new InstancedMesh(this.wraithGeometry, this.wraithMaterial, MAX_WRAITHS);
    this.host.name = 'WraithHost';
    this.host.layers.set(LAYER.VFX);
    this.host.instanceMatrix.setUsage(DynamicDrawUsage);
    this.host.renderOrder = 14;
    this.host.frustumCulled = false;
    this.host.count = 0;
    this.host.visible = false;
    this.group.add(this.host);

    /* ---- layer 3: the wail ---- */
    this.wailGeometry = new PlaneGeometry(1, 1);
    this.wailMaterial = createWraithWailMaterial();
    this.wail = new Mesh(this.wailGeometry, this.wailMaterial);
    this.wail.name = 'WraithWail';
    this.wail.layers.set(LAYER.DISTORTION);
    this.wail.frustumCulled = false;
    this.wail.visible = false;
    this.group.add(this.wail);

    /** One record per shade: dice, and the two events of its dive. */
    this.wraiths = [];
    for (let i = 0; i < MAX_WRAITHS; i++) {
      this.wraiths.push({
        bearing: 0,
        reach: 0,
        phase0: 0,
        rJit: 0,
        hJit: 0,
        sJit: 0,
        bobPhase: 0,
        scale: 1,
        dissolve: 0,
        emerged: false,
        dove: false,
        struck: false,
        target: null,
        diveFrom: new Vector3(),
        strike: new Vector3(),
        pos: new Vector3(),
        vel: new Vector3(),
        facing: new Vector3(0, 0, 1),
        seen: false,
        smokeEmitter: new RateEmitter(),
        moteEmitter: new RateEmitter()
      });
    }

    /** One record per body being drained. */
    this.grips = [];
    for (let i = 0; i < MAX_GRIPS; i++) {
      this.grips.push({ dummy: null, time: 0, hold: new Vector3(), wraith: -1, emitter: new RateEmitter() });
    }
    this._gripCount = 0;
    /** Bodies already chosen this cast, so the host spreads itself out. */
    this._claimed = [];

    this._seed = 0;
    /** Seconds since the shadow reached the circle, in beat time. */
    this._rite = 0;
    /** 0..1 through the closing. */
    this._close = 0;
    this._stained = false;
    this._visible = 0;
    /** Integrated phases, so their rates are live. */
    this._orbit = 0;
    this._flow = 0;
    this._phase = 0;
    this._wisp = 0;
    this._runeAngle = 0;
    this._wailClock = 0;
    this._lastWail = 0;

    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    /** The velocity a held body is steered toward — uniform, so it keeps its shape. */
    this._fieldVel = new Vector3();
    this._field = (_x, _y, _z, out) => out.copy(this._fieldVel);

    this._poolState = { quad: 10, radius: 4, open: 0, flow: 0, runeLit: 0, runeAngle: 0, fade: 1, seed: 0 };
    this._wraithState = { phase: 0, flow: 0 };
    this._wailState = { centre: new Vector3(), size: 5, strength: 0, clock: 0, seed: 0 };
  }

  createParticles() {
    const particles = this.ctx.particles;

    // Smoke of the shades and the pool. Non-additive, so it stains the air.
    this.smoke = particles.get('wraiths.smoke', {
      capacity: 2400,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.0
    });
    this.smoke.uniforms.uSizeIn.value = 0.2;
    this.smoke.uniforms.uFadeIn.value = 0.15;
    this.smoke.uniforms.uFadeOut.value = 0.5;
    this.smoke.uniforms.uEndSize.value = 2.0;
    this.smoke.uniforms.uTurbFrequency.value = 0.55;

    // Pale motes off the shades.
    this.motes = particles.get('wraiths.motes', {
      capacity: 1400,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.3
    });
    this.motes.uniforms.uSizeIn.value = 0.05;
    this.motes.uniforms.uFadeIn.value = 0.05;
    this.motes.uniforms.uFadeOut.value = 0.55;
    this.motes.uniforms.uEndSize.value = 0.3;
    this.motes.uniforms.uDrag.value = 1.3;
    this.motes.uniforms.uGravity.value.set(0, 0.35, 0);

    // Life being drawn out of a held body: fast pale streaks.
    this.drain = particles.get('wraiths.drain', {
      capacity: 1600,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.3
    });
    this.drain.uniforms.uSizeIn.value = 0.03;
    this.drain.uniforms.uFadeIn.value = 0.08;
    this.drain.uniforms.uFadeOut.value = 0.5;
    this.drain.uniforms.uEndSize.value = 0.4;
    this.drain.uniforms.uDrag.value = 0.2;
    this.drain.uniforms.uGravity.value.set(0, 0, 0);

    this.travelEmitter = new RateEmitter();
    this.poolEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get _count() {
    return Math.max(1, Math.min(MAX_WRAITHS, Math.round(settings.wraiths.wraithCount)));
  }

  /** Beat time at which the last shade has gone and the last body dropped. */
  get _riteLength() {
    const c = settings.wraiths;
    const lastDive = c.diveDelay + (this._count - 1) * c.diveStagger;
    const vanished = lastDive + c.diveTime + c.vanishTime;
    const dropped = lastDive + c.diveTime * STRIKE_AT + c.drainTime;
    return Math.max(c.poolOpenTime, vanished, dropped) + Math.max(0, c.lifetime);
  }

  get impactDuration() {
    return Math.max(0.2, this._riteLength * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings.wraiths.poolCloseTime * settings.global.lifetime);
  }

  /** Guttering, colder and slower than a flame. */
  lightShimmer() {
    const f = settings.wraiths.lightFlicker;
    return 1 - f * (0.5 - 0.5 * Math.sin(this.age * 5.3) * Math.sin(this.age * 2.1 + 1.3));
  }

  get radius() {
    return Math.max(0.2, settings.wraiths.zoneRadius);
  }

  _floorPoint(out) {
    this.pointAt(1, out);
    out.y = 0;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.travelEmitter.reset();
    this.poolEmitter.reset();
    this._seed = Math.random() * 100;
    this._rite = 0;
    this._close = 0;
    this._stained = false;
    this._visible = 0;
    this._orbit = 0;
    this._flow = 0;
    this._phase = Math.random() * 10;
    this._wisp = 0;
    this._runeAngle = Math.random() * TAU;
    this._wailClock = 0;
    this._lastWail = 0;
    this._claimed.length = 0;
    this._dropAll();
    this._rollWraiths();

    this.pool.visible = false;
    this.host.visible = false;
    this.wail.visible = false;
    this._sync(0);
  }

  /** Re-roll the host. Unitless dice only. */
  _rollWraiths() {
    const n = MAX_WRAITHS;
    for (let i = 0; i < n; i++) {
      const w = this.wraiths[i];
      w.bearing = Math.random() * TAU;
      w.reach = randRange(0.25, 0.8);
      w.phase0 = (i / n) * TAU * 2.3 + Math.random() * 0.5;
      w.rJit = randRange(-1, 1);
      w.hJit = randRange(-1, 1);
      w.sJit = randRange(-1, 1);
      w.bobPhase = Math.random() * TAU;
      w.scale = randRange(-1, 1);
      w.emerged = false;
      w.dove = false;
      w.struck = false;
      w.target = null;
      w.seen = false;
      w.facing.set(0, 0, 1);
      w.vel.set(0, 0, 0);
      w.smokeEmitter.reset();
      w.moteEmitter.reset();
      this.seedAttr.array[i] = Math.random() * 10;
    }
    this.seedAttr.needsUpdate = true;
  }

  _resetEmit(time) {
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.4;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.5;
    _emit.life = 1;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  /* ------------------------------------------------------------------ */
  /* Where each shade is — resolved from the clock every frame           */
  /* ------------------------------------------------------------------ */

  /** A shade's place in the circling ring at beat time `t`. */
  _orbitPoint(w, t, out) {
    const c = settings.wraiths;
    const g = settings.global;
    const j = c.orbitJitter * g.randomness;
    const span = Math.max(0.1, c.diveDelay - c.riseDelay);
    const p = saturate((t - c.riseDelay) / span);
    const r = this.radius * c.orbitRadius * (1 + w.rJit * j * 0.5) * (1 - c.spiralTighten * Easing.inOutQuad(p));
    const a = w.phase0 + this._orbit * (1 + w.sJit * j * 0.3);
    out.set(_centre.x + Math.cos(a) * r, 0, _centre.z + Math.sin(a) * r);
    out.y = c.orbitHeight * (1 + w.hJit * j * 0.25) + c.spiralRise * p + c.bobHeight * Math.sin(t * c.bobSpeed + w.bobPhase);
    return out;
  }

  /**
   * Where shade `i` is at beat time `t`, and how far it has dissolved.
   * Fires its events (emerging, choosing, striking) on the frame they happen.
   *
   * @returns {number} its fade, 0 = not drawn
   */
  _placeWraith(i, t, out) {
    const c = settings.wraiths;
    const w = this.wraiths[i];
    w.dissolve = 0;

    const rise0 = c.riseDelay + i * c.riseStagger;
    if (t < rise0) return 0;

    const dive0 = c.diveDelay + i * c.diveStagger;
    if (t < dive0 || !w.dove) {
      this._orbitPoint(w, t, _orbitPt);
      const k = saturate((t - rise0) / Math.max(0.05, c.riseTime));
      if (k < 1) {
        // Clawing up out of the pool in a corkscrew, then sweeping into the ring.
        _spawnPt.set(
          _centre.x + Math.cos(w.bearing) * w.reach * this._poolRadius,
          -c.riseDepth,
          _centre.z + Math.sin(w.bearing) * w.reach * this._poolRadius
        );
        out.lerpVectors(_spawnPt, _orbitPt, Easing.inOutQuad(k));
        out.y = lerp(-c.riseDepth, _orbitPt.y, Easing.outCubic(k));
        const curl = (1 - k) * 0.45;
        out.x += Math.cos(k * TAU * 1.2 + w.bearing) * curl;
        out.z += Math.sin(k * TAU * 1.2 + w.bearing) * curl;
      } else {
        out.copy(_orbitPt);
      }
      if (!w.emerged && out.y > 0) {
        w.emerged = true;
        this._emergeFx(_spawnPt.set(out.x, 0, out.z));
      }
      // Its dive begins here: remember where from, and choose.
      if (t >= dive0 && !w.dove && this._close <= 0) {
        w.dove = true;
        w.diveFrom.copy(out);
        this._choose(w);
      }
      return Easing.outQuad(saturate(k * 3));
    }

    // The dive: up and over, down through the body, out and away.
    const kd = (t - dive0) / Math.max(0.05, c.diveTime);
    this._divePath(w, kd, out);
    if (kd >= STRIKE_AT && !w.struck) {
      w.struck = true;
      this._strike(w, i);
    }
    if (kd <= 1) return 1;

    // Gone up into smoke.
    const kv = (t - dive0 - c.diveTime) / Math.max(0.05, c.vanishTime);
    if (kv >= 1) return 0;
    w.dissolve = Easing.inOutQuad(saturate(kv));
    return 1;
  }

  /** The dive curve. `k` 0..STRIKE_AT is the swoop onto the body, then out and up; past 1 the climb. */
  _divePath(w, k, out) {
    const c = settings.wraiths;
    // The control point: partway toward the body, lofted above where it began.
    _q.lerpVectors(w.diveFrom, w.strike, 0.35);
    _q.y = w.diveFrom.y + c.diveLoft;
    // The direction it arrives along, which it carries on through the body.
    _dir.copy(w.strike).sub(_q).normalize();
    _bend.copy(w.strike).addScaledVector(_dir, c.diveThrough);
    _bend.y = Math.max(0.3, _bend.y);
    _exit.copy(_bend).addScaledVector(_dir, c.diveThrough * 0.5);
    _exit.y = Math.max(0.6, _bend.y) + c.diveExit;

    if (k < STRIKE_AT) {
      bezier(w.diveFrom, _q, w.strike, Easing.inQuad(k / STRIKE_AT), out);
    } else if (k <= 1) {
      bezier(w.strike, _bend, _exit, Easing.outQuad((k - STRIKE_AT) / (1 - STRIKE_AT)), out);
    } else {
      const kv = saturate((k - 1) * c.diveTime / Math.max(0.05, c.vanishTime));
      out.copy(_exit).addScaledVector(_dir.setY(0), 0.6 * kv);
      out.y += c.vanishRise * Easing.outQuad(kv);
    }
    return out;
  }

  get _poolRadius() {
    return Math.max(0.1, this.radius * settings.wraiths.poolRadius);
  }

  /* ------------------------------------------------------------------ */
  /* Choosing and striking                                               */
  /* ------------------------------------------------------------------ */

  /** Pick a body in the circle — one nobody else has chosen, if there is one. */
  _choose(w) {
    const c = settings.wraiths;
    const field = this.ctx.dummies;
    w.target = null;
    if (field?.findTargets) {
      const found = field.findTargets(_centre.x, _centre.z, this.radius * c.killReach, this._found);
      for (const dummy of found) {
        if (this._claimed.indexOf(dummy) >= 0) continue;
        w.target = dummy;
        break;
      }
      if (!w.target && found.length > 0) w.target = found[(Math.random() * found.length) | 0];
    }
    if (w.target) {
      if (this._claimed.length < MAX_WRAITHS && this._claimed.indexOf(w.target) < 0) this._claimed.push(w.target);
      w.strike.set(w.target.position.x, c.chestHeight, w.target.position.z);
    } else {
      // Nobody left: it dives on the empty pool anyway.
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * this.radius * 0.6;
      w.strike.set(_centre.x + Math.cos(a) * r, c.chestHeight, _centre.z + Math.sin(a) * r);
    }
  }

  /** The shade passes through its body: it is felled, and held. */
  _strike(w, index) {
    const c = settings.wraiths;
    const g = settings.global;
    const power = g.explosionIntensity;
    const dummy = w.target;

    if (dummy && dummy.alive) {
      _dir.copy(w.strike).sub(w.diveFrom).setY(0);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      _dir.normalize();
      this._force.impulse = c.hitImpulse * power;
      this._force.lift = c.hitLift * power;
      this._force.spin = c.hitSpin;
      if (dummy.kill(_dir.x, _dir.z, this._force)) this._grip(dummy, index);
    }

    /* a pale shell where it went through, and the knock */
    this.ctx.bursts.spawn(BurstMode.AIR, w.strike, {
      radius: 0.2,
      endRadius: c.hitBurst * power,
      life: 0.45,
      intensity: 1.0,
      opacity: 0.55,
      fresnel: 2.6,
      displace: 0.3,
      squash: 0.8,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    _floor.copy(w.strike).setY(0);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.hitBurst * 1.4 * power,
      life: 0.5,
      width: 0.05,
      intensity: 0.8,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });

    this._resetEmit(frame.uTime.value);
    _emit.position = w.strike;
    _emit.radius = 0.35;
    _emit.direction = _up;
    _emit.speed = c.moteSpeed * 2.5;
    _emit.spread = 1;
    _emit.size = c.moteSize * 1.4;
    _emit.life = c.moteLifetime;
    this.motes.emit(Math.round(40 * g.particleCount), _emit);
    _emit.anchor = w.strike;
    _emit.speed = 1.2;
    _emit.size = c.smokeSize;
    _emit.life = c.smokeLifetime * 0.8;
    _emit.spin = 0.5;
    this.smoke.emit(Math.round(24 * g.particleCount), _emit);

    this.ctx.shake.add(c.hitShake * power * g.cameraShake, 7, 20);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.hitFlash * power);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.hitLight * power);
  }

  /* ------------------------------------------------------------------ */
  /* The draining                                                        */
  /* ------------------------------------------------------------------ */

  _grip(dummy, wraith) {
    if (this._gripCount >= MAX_GRIPS) return;
    if (!dummy.bodyPoint(_at)) return;
    const slot = this.grips[this._gripCount++];
    slot.dummy = dummy;
    slot.time = 0;
    slot.wraith = wraith;
    slot.hold.set(_at.x, 0, _at.z);
    slot.emitter.reset();
  }

  /** Hold every taken body up off the floor, darken it, and let it drop when it is spent. */
  _hold(dt) {
    if (dt <= 0) return;
    const c = settings.wraiths;
    const g = settings.global;
    const time = frame.uTime.value;
    const drainTime = Math.max(0.05, c.drainTime * g.lifetime);

    for (let i = this._gripCount - 1; i >= 0; i--) {
      const slot = this.grips[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished || dummy.alive || !dummy.bodyPoint(_at)) {
        this._dropGrip(i);
        continue;
      }
      slot.time += dt;
      const k = saturate(slot.time / drainTime);
      // Lifted up into the air and hung there, limp: one uniform velocity for
      // every joint (so the body keeps its shape) and its weight carried.
      const take = Easing.outCubic(saturate(slot.time / 0.3));
      const targetY = c.liftHeight + 0.35;
      this._fieldVel.set((slot.hold.x - _at.x) * 1.5, (targetY - _at.y) * 3.0, (slot.hold.z - _at.z) * 1.5);
      const grab = saturate(c.liftGrip * dt) * take;
      dummy.carry(this._field, grab, grab, saturate(c.liftBuoyancy) * take);
      // Drained: the colour goes out of it. Pushed every frame, which is also
      // what carries the live editor colours onto the body.
      dummy.corrode(saturate(slot.time * c.stain), c.look);
      dummy.hold();

      // Its life streaming out, up toward the shade that took it.
      const n = slot.emitter.tick(dt, c.drainRate * (1 - k * 0.6) * g.particleCount);
      if (n > 0) {
        const w = this.wraiths[slot.wraith];
        _dir.copy(w ? w.pos : _at).sub(_at);
        _dir.y = Math.max(_dir.y, 0.5);
        _dir.normalize();
        this._resetEmit(time);
        _emit.position = _at;
        _emit.radius = 0.35;
        _emit.direction = _dir;
        _emit.speed = c.drainSpeed;
        _emit.spread = 0.25;
        _emit.size = c.drainSize;
        _emit.life = c.drainLifetime;
        this.drain.emit(n, _emit);
      }

      if (k >= 1) {
        // Spent: dropped.
        dummy.release();
        this._resetEmit(time);
        _emit.position = _at;
        _emit.radius = 0.3;
        _emit.direction = _up;
        _emit.speed = 0.8;
        _emit.spread = 0.9;
        _emit.size = c.smokeSize;
        _emit.life = c.smokeLifetime;
        _emit.spin = 0.5;
        this.smoke.emit(Math.round(14 * g.particleCount), _emit);
        this._dropGrip(i);
      }
    }
  }

  _dropGrip(i) {
    const last = this._gripCount - 1;
    const slot = this.grips[i];
    slot.dummy?.release?.();
    slot.dummy = null;
    if (i !== last) {
      const other = this.grips[last];
      this.grips[last] = slot;
      this.grips[i] = other;
    }
    this._gripCount = last;
  }

  _dropAll() {
    for (let i = this._gripCount - 1; i >= 0; i--) this._dropGrip(i);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _advance(dt) {
    const c = settings.wraiths;
    const g = settings.global;
    const scaled = dt * g.animationSpeed;
    this._orbit += c.orbitSpeed * scaled;
    this._flow += c.poolRoilSpeed * dt * g.noiseSpeed;
    this._phase += 2.4 * dt * g.noiseSpeed;
    this._wisp += c.wispFlow * dt * g.noiseSpeed;
    this._runeAngle += c.runeSpin * scaled;
    this._wailClock += c.wailSpeed * scaled;
  }

  /** @param {number} dt seconds (0 on spawn) */
  _sync(dt) {
    const c = settings.wraiths;
    const g = settings.global;
    const travelling = this.phase === AbilityPhase.TRAVEL;
    const t = this._rite;
    this._floorPoint(_centre);

    /* ---- the pool ---- */
    const poolR = this._poolRadius;
    const ps = this._poolState;
    const open = travelling ? 0 : Easing.outCubic(saturate(t / Math.max(0.05, c.poolOpenTime)));
    ps.radius = poolR;
    ps.quad = (poolR * (1 + c.poolEdgeNoise) + c.poolFeather + 0.6) * 2;
    ps.open = open * (1 - Easing.inOutCubic(this._close));
    ps.flow = this._flow;
    // The runes go out before the pool closes.
    ps.runeLit = saturate((t - c.poolOpenTime * 0.5) / Math.max(0.05, c.runeIgnite)) * (1 - saturate(this._close * 2.5));
    ps.runeAngle = this._runeAngle;
    ps.fade = 1;
    ps.seed = this._seed;
    this.poolMaterial.userData.sync(ps);
    this.pool.visible = !travelling && ps.open > 0.004;
    this.pool.position.set(_centre.x, c.poolHeight, _centre.z);

    /* ---- the shades ---- */
    this._wraithState.phase = this._phase;
    this._wraithState.flow = this._wisp;
    this.wraithMaterial.userData.sync(this._wraithState);
    const wailEnv = this._wailEnvelope(t);
    const scream = Math.pow(Math.max(0, Math.sin(this._wailClock * Math.PI)), 6);
    this._placeHost(dt, t, wailEnv * scream);

    /* ---- the wail ---- */
    const ws = this._wailState;
    ws.centre.copy(_centre);
    ws.centre.y = c.orbitHeight + c.spiralRise * 0.5;
    ws.size = Math.max(0.5, this.radius * c.orbitRadius * c.wailSize * 2);
    ws.strength = wailEnv;
    ws.clock = this._wailClock;
    ws.seed = this._seed;
    this.wailMaterial.userData.sync(ws);
    this.wail.visible = !travelling && wailEnv > 0.004;
    if (wailEnv > 0.01) this.ctx.shake.rumble(0.04 * wailEnv * c.wailStrength * g.cameraShake, dt);

    /* ---- particles ---- */
    this.smoke.setGradient(getColor(c.colorSmokeA), getColor(c.colorSmokeB), getColor(c.colorSmokeC), getColor(c.colorSmokeD));
    const sm = this.smoke.uniforms;
    sm.uDrag.value = c.smokeDrag;
    sm.uGravity.value.set(0, c.smokeRise, 0);
    sm.uSizeScale.value = g.particleSize;
    sm.uLifeScale.value = g.particleLifetime;
    sm.uSpeedScale.value = g.particleSpeed;
    sm.uOpacity.value = c.smokeOpacity * g.opacity;
    sm.uTurbulence.value = c.smokeTurbulence * g.turbulence;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    const mo = this.motes.uniforms;
    mo.uSizeScale.value = g.particleSize;
    mo.uLifeScale.value = g.particleLifetime;
    mo.uSpeedScale.value = g.particleSpeed;
    mo.uOpacity.value = g.opacity;
    mo.uGlow.value = c.moteGlow * g.glow;
    mo.uTurbulence.value = 0.5 * g.turbulence;

    this.drain.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    const dr = this.drain.uniforms;
    dr.uStretch.value = c.drainStretch;
    dr.uSizeScale.value = g.particleSize;
    dr.uLifeScale.value = g.particleLifetime;
    dr.uSpeedScale.value = g.particleSpeed;
    dr.uOpacity.value = g.opacity;
    dr.uGlow.value = c.drainGlow * g.glow;
    dr.uTurbulence.value = 0.2 * g.turbulence;
  }

  /** 0..1, how hard the host is screaming at beat time `t`. */
  _wailEnvelope(t) {
    const c = settings.wraiths;
    if (this.phase === AbilityPhase.TRAVEL) return 0;
    const up = c.riseDelay + c.riseTime * 0.6;
    return smoothstep(up, up + 0.6, t) * (1 - smoothstep(c.diveDelay - 0.25, c.diveDelay + 0.35, t));
  }

  /** Place every shade, orient it along its flight, and shed its smoke. */
  _placeHost(dt, t, scream) {
    const c = settings.wraiths;
    const g = settings.global;
    const n = this._count;
    const travelling = this.phase === AbilityPhase.TRAVEL;
    const time = frame.uTime.value;
    const state = this.stateAttr.array;
    this._visible = 0;

    for (let i = 0; i < MAX_WRAITHS; i++) {
      const w = this.wraiths[i];
      const fade = i < n && !travelling ? this._placeWraith(i, t, _pos) : 0;
      if (fade <= 0.001) {
        this.host.setMatrixAt(i, _zero);
        state[i * 4] = 0;
        w.seen = false;
        continue;
      }
      this._visible++;

      // Velocity, smoothed, so the orientation does not shiver.
      if (!w.seen || dt <= 0) {
        w.seen = true;
        w.vel.set(0, 1, 0);
      } else {
        _vel.copy(_pos).sub(w.pos).divideScalar(dt);
        w.vel.lerp(_vel, saturate(dt * 10));
      }
      w.pos.copy(_pos);
      const speed = w.vel.length();

      // Head leads the motion as it speeds up; the hem trails behind.
      const lean = saturate(speed / Math.max(0.1, c.leanSpeed)) * c.maxLean;
      if (speed > 0.05) _dir.copy(w.vel).divideScalar(speed);
      else _dir.copy(w.facing);
      _Y.copy(_up).multiplyScalar(1 - lean).addScaledVector(_dir, lean).normalize();
      _Z.copy(_dir).addScaledVector(_Y, -_dir.dot(_Y));
      if (_Z.lengthSq() < 0.02) _Z.copy(w.facing).addScaledVector(_Y, -w.facing.dot(_Y));
      if (_Z.lengthSq() < 1e-4) _Z.set(0, 0, 1);
      _Z.normalize();
      w.facing.copy(_Z);
      _X.crossVectors(_Y, _Z);

      const s = Math.max(0.1, c.wraithScale * (1 + w.scale * c.wraithScaleJitter * g.randomness));
      _m.makeBasis(_X.multiplyScalar(s), _Y.multiplyScalar(s), _Z.multiplyScalar(s));
      _m.setPosition(_pos);
      this.host.setMatrixAt(i, _m);

      state[i * 4] = fade;
      state[i * 4 + 1] = w.dissolve;
      state[i * 4 + 2] = Math.min(c.trailMax, speed * c.trailPerSpeed) / s;
      state[i * 4 + 3] = w.dove ? 0 : scream;

      if (dt > 0) this._shadeFx(w, dt, time, s, speed);
    }

    this.host.count = n;
    this.host.visible = this._visible > 0;
    this.host.instanceMatrix.needsUpdate = true;
    this.stateAttr.needsUpdate = true;
  }

  /** Smoke off a shade's hem and motes off its body; more as it dissolves. */
  _shadeFx(w, dt, time, s, speed) {
    const c = settings.wraiths;
    const g = settings.global;
    const above = w.pos.y > 0.2;
    const rate = (c.smokeRate + w.dissolve * c.vanishSmoke / Math.max(0.1, c.vanishTime)) * (above ? 1 : 0.3);
    const puffs = Math.round(w.smokeEmitter.tick(dt, rate) * g.particleCount);
    if (puffs > 0) {
      this._resetEmit(time);
      // The hem, below the figure's middle along its own axis.
      _floor.copy(w.pos).addScaledVector(_Y, -0.75); // _Y carries the scale
      if (_floor.y < 0.1) _floor.y = 0.1;
      _emit.position = _floor;
      _emit.anchor = _floor;
      _emit.radius = 0.3 * s;
      _emit.direction = speed > 0.05 ? _dir.copy(w.vel).multiplyScalar(-1 / speed) : _up;
      _emit.speed = Math.min(2, speed * 0.15) + 0.2;
      _emit.spread = 0.6;
      _emit.size = c.smokeSize * s;
      _emit.life = c.smokeLifetime;
      _emit.spin = 0.5;
      this.smoke.emit(puffs, _emit);
    }
    const motes = Math.round(w.moteEmitter.tick(dt, c.moteRate * (1 + w.dissolve * 3)) * g.particleCount);
    if (motes > 0) {
      this._resetEmit(time);
      _emit.position = w.pos;
      _emit.radius = 0.45 * s;
      _emit.direction = _up;
      _emit.speed = c.moteSpeed;
      _emit.spread = 0.8;
      _emit.size = c.moteSize;
      _emit.life = c.moteLifetime;
      this.motes.emit(motes, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.wraiths;
    const g = settings.global;
    this._advance(dt);
    this._sync(dt);

    // A thread of shadow creeping across the floor to the circle.
    const n = Math.round(this.travelEmitter.tick(dt, c.travelSmoke) * g.particleCount);
    if (n > 0) {
      this._resetEmit(frame.uTime.value);
      _pos.copy(this.position).setY(0.15);
      _emit.position = _pos;
      _emit.anchor = _pos;
      _emit.radius = 0.3;
      _emit.direction = _up;
      _emit.speed = 0.3;
      _emit.spread = 0.8;
      _emit.size = c.smokeSize * 0.8;
      _emit.life = c.smokeLifetime * 0.8;
      _emit.spin = 0.4;
      this.smoke.emit(n, _emit);
      _emit.anchor = null;
      _emit.size = c.moteSize;
      _emit.speed = c.moteSpeed;
      _emit.life = c.moteLifetime * 0.6;
      this.motes.emit(Math.max(1, Math.round(n * 0.3)), _emit);
    }
    this.position.y = 0.3;
  }

  /** The shadow reaches the circle: the pool opens. */
  onImpact() {
    const c = settings.wraiths;
    const g = settings.global;
    const power = g.explosionIntensity;
    this._floorPoint(_centre);

    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _centre, {
      radius: c.openShock * power,
      life: 0.7,
      width: 0.06,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this._resetEmit(frame.uTime.value);
    _pos.copy(_centre).setY(0.2);
    _emit.position = _pos;
    _emit.anchor = _pos;
    _emit.radius = this.radius * 0.5;
    _emit.direction = _up;
    _emit.speed = 1.0;
    _emit.spread = 0.8;
    _emit.size = c.smokeSize * 1.3;
    _emit.life = c.smokeLifetime;
    _emit.spin = 0.4;
    this.smoke.emit(Math.round(50 * g.particleCount), _emit);

    this.ctx.shake.add(c.openShake * power * g.cameraShake, 4, 12);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.openFlash * power);
    this.lightBoost = c.lightIntensity * 0.8 * power;
  }

  onFade(dt, t) {
    const c = settings.wraiths;
    const g = settings.global;
    this._advance(dt);
    this._rite += dt / Math.max(0.05, g.lifetime);

    if (t > 1) {
      this._close = saturate(t - 1);
      if (!this._stained) {
        // The residue the pool leaves, laid under it as it closes.
        this._stained = true;
        this.ctx.decals.spawn(DecalType.SCORCH, _centre, {
          radius: this._poolRadius * 0.95,
          life: 3.5,
          intensity: 0.7,
          colorA: getColor(c.colorStainA),
          colorB: getColor(c.colorStainB)
        });
        this._dropAll();
      }
    }

    this._sync(dt);
    this._hold(dt);
    this._poolFx(dt);
    this.position.set(_centre.x, c.lightHeight, _centre.z);
  }

  /** Smoke boiling up off the open pool. */
  _poolFx(dt) {
    const c = settings.wraiths;
    const g = settings.global;
    const open = this._poolState.open;
    if (open <= 0.05) return;
    const n = Math.round(this.poolEmitter.tick(dt, c.poolSmoke * open) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.direction = _up;
    _emit.speed = 0.35;
    _emit.spread = 0.5;
    _emit.size = c.smokeSize * 1.1;
    _emit.life = c.smokeLifetime;
    _emit.spin = 0.35;
    const r = this._poolRadius * open * 0.9;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU;
      const rr = Math.sqrt(Math.random()) * r;
      _pos.set(_centre.x + Math.cos(a) * rr, 0.12, _centre.z + Math.sin(a) * rr);
      _emit.position = _pos;
      _emit.anchor = _pos;
      this.smoke.emit(1, _emit);
    }
  }

  /** A shade breaking the surface. */
  _emergeFx(at) {
    const c = settings.wraiths;
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    _floor.copy(at).setY(0.15);
    _emit.position = _floor;
    _emit.anchor = _floor;
    _emit.radius = 0.4;
    _emit.direction = _up;
    _emit.speed = 1.6;
    _emit.spread = 0.6;
    _emit.size = c.smokeSize;
    _emit.life = c.smokeLifetime * 0.8;
    _emit.spin = 0.6;
    this.smoke.emit(Math.round(18 * g.particleCount), _emit);
    _emit.anchor = null;
    _emit.size = c.moteSize;
    _emit.speed = c.moteSpeed * 2;
    _emit.life = c.moteLifetime;
    this.motes.emit(Math.round(14 * g.particleCount), _emit);
    _floor.y = 0;
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: 1.3,
      life: 0.45,
      width: 0.05,
      intensity: 0.7,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.shake.add(c.riseShake * g.explosionIntensity * g.cameraShake, 8, 18);
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._dropAll();
    this.pool.visible = false;
    this.host.visible = false;
    this.host.count = 0;
    this.wail.visible = false;
  }

  dispose() {
    this.poolGeometry.dispose();
    this.wraithGeometry.dispose();
    this.wailGeometry.dispose();
    this.poolMaterial.dispose();
    this.wraithMaterial.dispose();
    this.wailMaterial.dispose();
    this.host.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('\u{1F47B}  Wraith Host');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 2, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 80, 0.5, 'shadow speed (m/s)');
  R(cast, c, 'zoneRadius', 0.5, 12, 0.05, 'circle radius (m)');
  R(cast, c, 'lifetime', 0, 6, 0.05, 'pool holds after (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 40, 0.1, 'intensity');
  R(light, c, 'lightRadius', 0.5, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0, 8, 0.05, 'height (m)');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'guttering');

  const pool = folder.addFolder('1 · Pool of shadow');
  R(pool, c, 'poolRadius', 0.2, 2, 0.01, 'radius (× circle)');
  R(pool, c, 'poolOpenTime', 0.05, 3, 0.01, 'opens over (s)');
  R(pool, c, 'poolCloseTime', 0.05, 4, 0.01, 'closes over (s)');
  R(pool, c, 'poolEdgeNoise', 0, 0.8, 0.005, 'fingered edge');
  R(pool, c, 'poolEdgeScale', 0.2, 10, 0.05, 'fingers');
  R(pool, c, 'poolFeather', 0.01, 2, 0.01, 'soft edge (m)');
  R(pool, c, 'poolOpacity', 0, 1, 0.01, 'opacity');
  R(pool, c, 'poolRoil', 0, 3, 0.01, 'churn');
  R(pool, c, 'poolRoilScale', 0.05, 3, 0.01, 'churn scale');
  R(pool, c, 'poolRoilSpeed', 0, 3, 0.01, 'churn speed');
  R(pool, c, 'poolSwirl', -4, 4, 0.01, 'vortex twist');
  R(pool, c, 'poolDepth', 0, 1, 0.01, 'deeper middle');
  R(pool, c, 'poolRim', 0.01, 0.6, 0.005, 'rim width (m)');
  R(pool, c, 'poolRimGlow', 0, 8, 0.05, 'rim glow');
  R(pool, c, 'poolHeight', 0, 0.1, 0.001, 'lift off floor (m)');
  pool.addColor(c, 'colorPoolDeep').name('deep');
  pool.addColor(c, 'colorPoolMid').name('churn');
  pool.addColor(c, 'colorPoolSwirl').name('swirl light');
  pool.addColor(c, 'colorPoolRim').name('rim');
  const runes = pool.addFolder('Runes');
  R(runes, c, 'runeRadius', 0.1, 1, 0.01, 'ring (× pool)');
  R(runes, c, 'runeWidth', 0.05, 1.5, 0.01, 'band width (m)');
  R(runes, c, 'runeCount', 3, 40, 1, 'runes');
  R(runes, c, 'runeStroke', 0.005, 0.15, 0.001, 'stroke (m)');
  R(runes, c, 'runeGlow', 0, 10, 0.05, 'glow');
  R(runes, c, 'runeIgnite', 0.05, 4, 0.01, 'light over (s)');
  R(runes, c, 'runeSpin', -2, 2, 0.01, 'turn (rad/s)');
  R(runes, c, 'runeFlicker', 0, 1, 0.01, 'waver');
  runes.addColor(c, 'colorRune').name('colour');

  const host = folder.addFolder('2 · The shades');
  R(host, c, 'wraithCount', 1, MAX_WRAITHS, 1, 'count');
  R(host, c, 'wraithScale', 0.3, 3, 0.01, 'size');
  R(host, c, 'wraithScaleJitter', 0, 0.6, 0.01, 'size jitter');
  const look = host.addFolder('Shading');
  R(look, c, 'bodyOpacity', 0, 1.5, 0.01, 'body haze');
  R(look, c, 'fresnelPower', 0.2, 8, 0.01, 'rim tightness');
  R(look, c, 'rimGlow', 0, 10, 0.05, 'rim glow');
  R(look, c, 'wispScale', 0.2, 10, 0.05, 'wisp scale');
  R(look, c, 'wispFlow', 0, 6, 0.01, 'wisp flow');
  R(look, c, 'tatterDepth', 0, 0.7, 0.005, 'tatter depth');
  R(look, c, 'tatterScale', 1, 16, 0.1, 'tatters');
  R(look, c, 'hemFlare', 0, 3, 0.01, 'hem flare');
  R(look, c, 'flutter', 0, 0.4, 0.005, 'billow (m)');
  R(look, c, 'trailPerSpeed', 0, 0.5, 0.005, 'trail per m/s');
  R(look, c, 'trailMax', 0, 4, 0.01, 'longest trail (m)');
  R(look, c, 'leanSpeed', 0.1, 20, 0.1, 'head-first at (m/s)');
  R(look, c, 'maxLean', 0, 1, 0.01, 'lean');
  R(look, c, 'eyeGlow', 0, 20, 0.1, 'eye glow');
  R(look, c, 'eyeSize', 0.004, 0.1, 0.001, 'eye size');
  R(look, c, 'eyeSeparation', 0, 0.15, 0.001, 'eye spacing');
  R(look, c, 'eyeHeight', 0.2, 0.7, 0.005, 'eye height');
  R(look, c, 'faceDark', 0, 1, 0.01, 'hood hollow');
  R(look, c, 'softFade', 0.01, 2, 0.01, 'soft intersection (m)');
  look.addColor(c, 'colorA').name('rim');
  look.addColor(c, 'colorB').name('dissolve fray');
  look.addColor(c, 'colorBody').name('body');
  look.addColor(c, 'colorEye').name('eyes');
  const rise = host.addFolder('Rise');
  R(rise, c, 'riseDelay', 0, 3, 0.01, 'first after (s)');
  R(rise, c, 'riseStagger', 0, 1, 0.005, 'stagger (s)');
  R(rise, c, 'riseTime', 0.05, 3, 0.01, 'climb (s)');
  R(rise, c, 'riseDepth', 0, 4, 0.01, 'from under (m)');
  const orbit = host.addFolder('Circling');
  R(orbit, c, 'orbitRadius', 0.05, 2, 0.01, 'radius (× circle)');
  R(orbit, c, 'orbitHeight', 0.5, 10, 0.05, 'height (m)');
  R(orbit, c, 'orbitSpeed', -6, 6, 0.01, 'speed (rad/s)');
  R(orbit, c, 'orbitJitter', 0, 1, 0.01, 'path jitter');
  R(orbit, c, 'spiralTighten', 0, 0.9, 0.01, 'spiral in');
  R(orbit, c, 'spiralRise', -2, 4, 0.01, 'spiral up (m)');
  R(orbit, c, 'bobHeight', 0, 1.5, 0.01, 'bob (m)');
  R(orbit, c, 'bobSpeed', 0, 8, 0.01, 'bob speed');
  const wail = host.addFolder('Wail (distortion)');
  R(wail, c, 'wailStrength', 0, 4, 0.01, 'strength');
  R(wail, c, 'wailRings', 1, 6, 1, 'rings');
  R(wail, c, 'wailSpeed', 0, 5, 0.01, 'screams/second');
  R(wail, c, 'wailSize', 0.2, 4, 0.01, 'reach (× ring)');
  R(wail, c, 'wailEyes', 0, 4, 0.01, 'eyes flare');
  const dive = host.addFolder('Dive');
  R(dive, c, 'diveDelay', 0.2, 8, 0.01, 'first dive at (s)');
  R(dive, c, 'diveStagger', 0, 1, 0.005, 'stagger (s)');
  R(dive, c, 'diveTime', 0.1, 3, 0.01, 'dive (s)');
  R(dive, c, 'diveLoft', -1, 4, 0.01, 'loft (m)');
  R(dive, c, 'diveThrough', 0, 5, 0.01, 'carries through (m)');
  R(dive, c, 'diveExit', 0, 5, 0.01, 'swoops up (m)');
  R(dive, c, 'chestHeight', 0.2, 2.5, 0.01, 'strike height (m)');
  R(dive, c, 'vanishTime', 0.1, 3, 0.01, 'dissolves over (s)');
  R(dive, c, 'vanishRise', 0, 6, 0.01, 'climbs as it goes (m)');

  const smoke = folder.addFolder('3 · Smoke');
  R(smoke, c, 'smokeRate', 0, 400, 1, 'per shade/second');
  R(smoke, c, 'smokeSize', 0.05, 3, 0.01, 'size');
  R(smoke, c, 'smokeLifetime', 0.1, 5, 0.05, 'lifetime');
  R(smoke, c, 'smokeOpacity', 0, 1, 0.01, 'opacity');
  R(smoke, c, 'smokeRise', -2, 3, 0.01, 'rise');
  R(smoke, c, 'smokeDrag', 0, 6, 0.01, 'drag');
  R(smoke, c, 'smokeTurbulence', 0, 3, 0.01, 'turbulence');
  R(smoke, c, 'poolSmoke', 0, 400, 1, 'off the pool/second');
  R(smoke, c, 'vanishSmoke', 0, 300, 1, 'per shade dissolving');
  R(smoke, c, 'travelSmoke', 0, 600, 1, 'creeping shadow/second');
  Editor.gradient(smoke, c, 'colorSmoke', 'smoke gradient');

  const motes = folder.addFolder('4 · Motes + drained life');
  R(motes, c, 'moteRate', 0, 300, 1, 'motes per shade/second');
  R(motes, c, 'moteSize', 0.005, 0.5, 0.001, 'mote size');
  R(motes, c, 'moteLifetime', 0.05, 4, 0.01, 'mote lifetime');
  R(motes, c, 'moteSpeed', 0, 6, 0.01, 'mote speed');
  R(motes, c, 'moteGlow', 0, 10, 0.05, 'mote glow');
  R(motes, c, 'drainRate', 0, 400, 1, 'drain streaks/second');
  R(motes, c, 'drainSize', 0.005, 0.3, 0.001, 'drain width');
  R(motes, c, 'drainSpeed', 0, 15, 0.05, 'drain speed');
  R(motes, c, 'drainLifetime', 0.05, 3, 0.01, 'drain lifetime');
  R(motes, c, 'drainStretch', 0, 1, 0.005, 'drain stretch');
  R(motes, c, 'drainGlow', 0, 10, 0.05, 'drain glow');
  Editor.gradient(motes, c, 'colorMote', 'mote gradient');

  const drain = folder.addFolder('5 · The draining');
  R(drain, c, 'killReach', 0.2, 2, 0.01, 'chooses within (× circle)');
  R(drain, c, 'hitImpulse', 0, 10, 0.05, 'pushed along the dive');
  R(drain, c, 'hitLift', 0, 10, 0.05, 'lift (m/s)');
  R(drain, c, 'hitSpin', 0, 4, 0.01, 'tumble');
  R(drain, c, 'liftHeight', 0, 3, 0.01, 'held up at (m)');
  R(drain, c, 'liftGrip', 0, 30, 0.1, 'grip');
  R(drain, c, 'liftBuoyancy', 0, 1, 0.01, 'weight carried');
  R(drain, c, 'drainTime', 0.05, 5, 0.01, 'drained over (s)');
  R(drain, c, 'stain', 0, 6, 0.01, 'darkens (/s)');
  const dl = drain.addFolder('Drained look');
  dl.addColor(c.look, 'color').name('flesh');
  dl.addColor(c.look, 'rimColor').name('rim');
  R(dl, c.look, 'rimEmissive', 0, 8, 0.05, 'rim glow');
  dl.addColor(c.look, 'edgeColor').name('edge');
  R(dl, c.look, 'edgeEmissive', 0, 10, 0.05, 'edge glow');
  R(dl, c.look, 'edgeWidth', 0, 0.3, 0.005, 'edge width');

  const beats = folder.addFolder('6 · Beats');
  R(beats, c, 'openShock', 0, 16, 0.05, 'shockwave as it opens (m)');
  R(beats, c, 'openShake', 0, 1.5, 0.01, 'knock as it opens');
  R(beats, c, 'openFlash', 0, 1, 0.01, 'flash as it opens');
  R(beats, c, 'riseShake', 0, 1, 0.01, 'knock per shade rising');
  R(beats, c, 'hitShake', 0, 1.5, 0.01, 'knock per strike');
  R(beats, c, 'hitFlash', 0, 1, 0.01, 'flash per strike');
  R(beats, c, 'hitBurst', 0, 6, 0.01, 'shell per strike (m)');
  R(beats, c, 'hitLight', 0, 6, 0.01, 'light per strike (× intensity)');
  beats.addColor(c, 'colorBurstA').name('shell inner');
  beats.addColor(c, 'colorBurstB').name('shell mid');
  beats.addColor(c, 'colorBurstC').name('shell outer');
  beats.addColor(c, 'colorShockA').name('shockwave');
  beats.addColor(c, 'colorShockB').name('shockwave hot');
  beats.addColor(c, 'colorStainA').name('residue');
  beats.addColor(c, 'colorStainB').name('residue edge');
  beats.addColor(c, 'colorFlash').name('flash');

  folder.close();
  return folder;
}
