import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createIcicleGeometry, createCloudGeometry, createStripGeometry } from '../../assets/codex/WhiteoutNeedleGeometry.js';
import {
  createIcicleMaterial,
  createCloudMaterial,
  createDriftMaterial,
  createColdSheetMaterial
} from '../../materials/codex/WhiteoutNeedleMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'whiteout';

/** Icicles down the line. The editor's slider clamps to this. */
const MAX_FIELD = 160;
/** Icicles in the last volley at the end of the line. */
const MAX_VOLLEY = 32;
/** Bodies one storm can pin. */
const MAX_PINS = 8;
/** Icicles per pinned body, at most. */
const PIN_EACH = 4;
const MAX_NEEDLES = MAX_FIELD + MAX_VOLLEY + MAX_PINS * PIN_EACH;
const KIND_FIELD = 0;
const KIND_VOLLEY = 1;
const KIND_PIN = 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _axis = new Vector3();
const _perp = new Vector3();
const _ground = new Vector3();
const _tip = new Vector3();
const _end = new Vector3();
const _fall = new Vector3();
const _up = new Vector3(0, 1, 0);
const _scale = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
/** Dice for the storm's nominal slant — what the driving snow follows. */
const NOMINAL = { slantD: 0.5, yawD: 0.5 };

const _cloudState = { length: 10, width: 5, lead: 0, seed: 0, fade: 0, flash: 0 };
const _driftState = { length: 10, width: 3, front: 0, seed: 0, erode: 0, start: 0 };
const _coldState = { length: 10, width: 3, front: 0, strength: 0 };

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
 * WHITEOUT NEEDLE — Frost, line cast.
 *
 * The sky closes over the line: **a low slate-and-white cloud runs down it**
 * from over the caster's head, its billows rolling with the wind, always a
 * few metres ahead of the storm front. Under it the air goes white with
 * driving snow, and out of it **icicles rain down point-first** — long
 * five-faceted spears, falling at a slant down the line, streaked and
 * burning at the root as they drop — and **drive into the floor**, a third
 * of their length deep, shuddering as they strike, each in a puff of snow
 * and a spray of ice. The lane behind the front goes white, wind-combed.
 * Whatever the front reaches is knocked flat and **pinned**: three icicles
 * come down on it and nail it to the floor by the spine, and it stays held
 * there, frosting over. At the end of the line the storm empties itself in
 * one last **volley** — a ring of the biggest icicles round the end point,
 * a flash in the cloud's belly, a shell of frost. The field stands, a forest
 * of slanted ice, then **sublimes** away root-first with the snow, and the
 * cloud thins to nothing.
 *
 * Distinct from the other frost: nothing grows *up* (Ice, Glacier Crown,
 * Permafrost), nothing rolls along the floor (Avalanche), nothing flies
 * along the line (Glacial Shard Storm) — everything here comes *down*, and
 * it stays standing at an angle where it fell.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the icicles** — one InstancedMesh of lathed five-facet spears in
 *      `createIcicleMaterial` (opaque, `LAYER.WORLD`, casting shadows),
 *      stretched into streaks while they fall, shuddering on a damped
 *      spring once they land, subliming root-first; per-instance `aState`.
 *   2. **the cloud** — a billowed grid in `createCloudMaterial`, revealed
 *      to `front + cloudLead`, lit by the volley's flash.
 *   3. **the snow** — STREAK snow driving down under the front, SOFT flakes
 *      drifting over the whole storm, a SMOKE ground blizzard at the front.
 *   4. **the snowed floor** — the lane combed white behind the front, a
 *      drift heaped round the end; the same strip lifted on
 *      `LAYER.DISTORTION` for the cold air.
 *   5. **strikes** — a puff, ice chips and (every nth) a FROST decal where
 *      each icicle lands, and a tick of shake; a FROST burst, a SHOCKWAVE,
 *      flash and a light punch for the volley.
 *
 * ## The bodies
 *
 * `handlesOwnHits`. The front catches every standing body within
 * `hitRadius` of it and knocks it flat down the line; a pin is opened for
 * it and `pinNeedles` icicles start falling on it — steered onto its spine
 * while they drop — and when the first lands the spine is held to the floor
 * (`Dummy#pin`) until the field sublimes. The volley catches whatever is
 * standing round the end of the line the same way.
 *
 * ## The editor rule
 *
 * An icicle record holds dice and a couple of latched times (when it began
 * to fall, when it landed). Its spot on the line is a fraction and a signed
 * lateral fraction, so dragging `laneWidth`, `needleLength`, `slant` or the
 * cloud's height re-shapes a field that is already standing.
 */
export class WhiteoutNeedleAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._standing;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the icicles ---- */
    this.icicleGeometry = createIcicleGeometry();
    this.stateAttr = new InstancedBufferAttribute(new Float32Array(MAX_NEEDLES * 4), 4);
    this.stateAttr.setUsage(DynamicDrawUsage);
    this.icicleGeometry.setAttribute('aState', this.stateAttr);
    this.icicleMaterial = createIcicleMaterial();
    this.icicles = new InstancedMesh(this.icicleGeometry, this.icicleMaterial, MAX_NEEDLES);
    this.icicles.name = 'WhiteoutIcicles';
    this.icicles.instanceMatrix.setUsage(DynamicDrawUsage);
    this.icicles.layers.set(LAYER.WORLD);
    this.icicles.castShadow = true;
    this.icicles.frustumCulled = false;
    this.icicles.count = MAX_NEEDLES;
    this.icicles.visible = false;
    this.group.add(this.icicles);

    /** Dice and latches only — see the class comment. */
    this.recs = [];
    for (let i = 0; i < MAX_NEEDLES; i++) {
      this.recs.push({
        kind: i < MAX_FIELD ? KIND_FIELD : i < MAX_FIELD + MAX_VOLLEY ? KIND_VOLLEY : KIND_PIN,
        idx: i,
        uD: 0, // where in its slot down the line it falls (field)
        lat: 0, // −1..1 across the lane (field)
        gx: 0, // ground point (volley, pin) — written when it is aimed
        gz: 0,
        slantD: 0,
        yawD: 0,
        lenD: 0,
        phase: 0,
        seed: 0,
        t0: -1, // when it began to fall (volley, pin)
        landed: false,
        landAt: 0,
        live: false
      });
    }

    /* ---- layer 2: the cloud ---- */
    this.cloudGeometry = createCloudGeometry();
    this.cloudMaterial = createCloudMaterial();
    this.cloud = new Mesh(this.cloudGeometry, this.cloudMaterial);
    this.cloud.name = 'WhiteoutCloud';
    this.cloud.frustumCulled = false;
    this.cloud.renderOrder = 6;
    this.cloud.visible = false;
    this.group.add(this.cloud);

    /* ---- layer 4: the snowed floor, and cold air ---- */
    this.stripGeometry = createStripGeometry();
    this.driftMaterial = createDriftMaterial();
    this.drift = new Mesh(this.stripGeometry, this.driftMaterial);
    this.drift.name = 'WhiteoutDrift';
    this.drift.frustumCulled = false;
    this.drift.renderOrder = 2;
    this.drift.visible = false;
    this.group.add(this.drift);

    this.coldMaterial = createColdSheetMaterial();
    this.cold = new Mesh(this.stripGeometry, this.coldMaterial);
    this.cold.name = 'WhiteoutColdAir';
    this.cold.layers.set(LAYER.DISTORTION);
    this.cold.frustumCulled = false;
    this.cold.visible = false;
    this.group.add(this.cold);

    this.pins = [];
    for (let i = 0; i < MAX_PINS; i++) this.pins.push({ dummy: null, held: false, x: 0, z: 0, at: 0 });
    this._seed = 0;
    this._strikes = 0;
    this._standing = 0;
    this._volleyed = false;
    this._volleyAt = 0;
    this._beat = false;
    this._flash = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._look = { color: '#000000', rimColor: '#000000', rimEmissive: 0, edgeColor: '#000000', edgeEmissive: 0, edgeWidth: 0.05 };
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.snow = particles.get('whiteout.snow', { capacity: 3200, shape: ParticleShape.STREAK, additive: true, stretch: true, softFade: 0.3 });
    this.snow.uniforms.uDrag.value = 0.2;
    this.snow.uniforms.uEndSize.value = 0.6;
    this.snow.uniforms.uSizeIn.value = 0.03;
    this.snow.uniforms.uFadeIn.value = 0.1;
    this.snow.uniforms.uFadeOut.value = 0.3;

    this.flakes = particles.get('whiteout.flake', { capacity: 2000, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.3 });
    this.flakes.uniforms.uDrag.value = 0.8;
    this.flakes.uniforms.uEndSize.value = 0.6;
    this.flakes.uniforms.uSizeIn.value = 0.1;
    this.flakes.uniforms.uFadeIn.value = 0.15;
    this.flakes.uniforms.uFadeOut.value = 0.4;

    this.puffs = particles.get('whiteout.puff', { capacity: 1400, shape: ParticleShape.SMOKE, additive: false, curl: true, softFade: 0.6 });
    this.puffs.uniforms.uDrag.value = 1.8;
    this.puffs.uniforms.uEndSize.value = 1.4;
    this.puffs.uniforms.uSizeIn.value = 0.08;
    this.puffs.uniforms.uFadeIn.value = 0.05;
    this.puffs.uniforms.uFadeOut.value = 0.6;

    this.chips = particles.get('whiteout.chip', { capacity: 1400, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.1 });
    this.chips.uniforms.uDrag.value = 0.4;
    this.chips.uniforms.uEndSize.value = 0.7;
    this.chips.uniforms.uSizeIn.value = 0.02;
    this.chips.uniforms.uFadeIn.value = 0.01;
    this.chips.uniforms.uFadeOut.value = 0.3;

    this.snowEmitter = new RateEmitter();
    this.flakeEmitter = new RateEmitter();
    this.hazeEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _T(x) {
    return Math.max(0.03, x * settings.global.lifetime);
  }

  _fallT() {
    return Math.max(0.05, settings[ID].fallTime);
  }

  get impactDuration() {
    const c = settings[ID];
    return this._T(c.volleyTime) + this._fallT() + this._T(c.holdTime);
  }

  get fadeDuration() {
    return this._T(settings[ID].lifetime);
  }

  lightShimmer() {
    return 0.8 + 0.2 * Math.sin(this.age * 31.0) * Math.sin(this.age * 7.7);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 100;
    this._strikes = 0;
    this._standing = 0;
    this._volleyed = false;
    this._volleyAt = 0;
    this._beat = false;
    this._flash = 0;
    this._found.length = 0;
    this.snowEmitter.reset();
    this.flakeEmitter.reset();
    this.hazeEmitter.reset();
    this._releasePins();
    for (let i = 0; i < MAX_NEEDLES; i++) {
      const r = this.recs[i];
      // Field icicles are spread down the line, one per slot, jittered in it.
      r.uD = Math.random();
      r.lat = Math.random() * 2 - 1;
      r.slantD = Math.random();
      r.yawD = Math.random();
      r.lenD = Math.random();
      r.phase = Math.random() * Math.PI * 2;
      r.seed = Math.random();
      r.t0 = -1;
      r.landed = false;
      r.landAt = 0;
      r.live = false;
      r.gx = 0;
      r.gz = 0;
      this.icicles.setMatrixAt(i, _zero);
    }
    this.icicles.instanceMatrix.needsUpdate = true;
    this.stateAttr.array.fill(0);
    this.stateAttr.needsUpdate = true;
    this.icicles.visible = false;
    this.cloud.visible = false;
    this.drift.visible = false;
    this.cold.visible = false;
  }

  _sync() {
    const c = settings[ID];
    const g = settings.global;
    this.icicleMaterial.userData.sync();
    syncSystem(this.snow, c.colorSnowA, c.colorSnowB, c.colorSnowC, c.colorSnowD, c.snowSize, 1.4 * g.glow, 0.1);
    this.snow.uniforms.uGravity.value.set(0, -4, 0);
    this.snow.uniforms.uStretch.value = c.snowStretch;
    syncSystem(this.flakes, c.colorSnowA, c.colorSnowB, c.colorSnowC, c.colorSnowD, c.flakeSize, 1.2 * g.glow, 0.8);
    this.flakes.uniforms.uGravity.value.set(0, -0.8, 0);
    syncSystem(this.puffs, c.colorPuffA, c.colorPuffB, c.colorPuffC, c.colorPuffD, c.puffSize, 1, 0.5);
    this.puffs.uniforms.uOpacity.value = c.puffOpacity * g.opacity;
    this.puffs.uniforms.uGravity.value.set(0, 0.1, 0);
    syncSystem(this.chips, c.colorPuffA, c.colorPuffB, c.colorPuffC, c.colorPuffD, c.chipSize, 1, 0.05);
    this.chips.uniforms.uGravity.value.set(0, c.chipGravity, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Resolving an icicle                                                 */
  /* ------------------------------------------------------------------ */

  /** Fraction down the line a field icicle falls at — re-spread live over `needleCount`. */
  _uOf(r, c) {
    const n = Math.min(MAX_FIELD, Math.max(1, Math.round(c.needleCount)));
    // The field starts `laneStart` metres out so it never buries the caster.
    const s0 = Math.min(c.laneStart, this.length * 0.5) / Math.max(0.01, this.length);
    return s0 + (1 - s0) * ((r.idx + r.uD) / n);
  }

  /** Where it strikes the floor, written to `_ground`. */
  _groundOf(r, c) {
    if (r.kind === KIND_FIELD) {
      this.pointAt(this._uOf(r, c), _ground).addScaledVector(this.side, r.lat * c.laneWidth * settings.global.randomness);
    } else {
      _ground.set(r.gx, 0, r.gz);
    }
    _ground.y = 0;
    return _ground;
  }

  /** The way it points (root → point), written to `_axis`. */
  _axisOf(r, c, g) {
    const sl = c.slant + (r.slantD - 0.5) * 2 * c.slantJitter * g.randomness;
    const yaw = (r.yawD - 0.5) * 0.7 * g.randomness;
    // The line direction turned a little about the vertical.
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const dx = this.direction.x * cy - this.direction.z * sy;
    const dz = this.direction.x * sy + this.direction.z * cy;
    const s = Math.sin(sl);
    _axis.set(dx * s, -Math.cos(sl), dz * s).normalize();
    return _axis;
  }

  _lengthOf(r, c) {
    const base = r.kind === KIND_VOLLEY ? c.volleyLength : c.needleLength;
    return base * (1 - saturate(c.needleJitter) * r.lenD);
  }

  /** 0..1 how far it has fallen. Field icicles are keyed to the front; the rest to their own clock. */
  _fallOf(r, c) {
    if (r.kind === KIND_FIELD) {
      const L = this.length;
      const lead = Math.max(0.1, c.speed * settings.global.speed * this._fallT());
      return saturate((this.front - this._uOf(r, c) * L + lead) / lead);
    }
    if (r.t0 < 0) return 0;
    return saturate((this.age - r.t0) / this._fallT());
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _updateIcicles(dt, fadeK) {
    const c = settings[ID];
    const g = settings.global;
    const state = this.stateAttr.array;
    const nField = Math.min(MAX_FIELD, Math.max(0, Math.round(c.needleCount)));
    const D = Math.max(0.5, c.cloudHeight);
    let standing = 0;

    for (let i = 0; i < MAX_NEEDLES; i++) {
      const r = this.recs[i];
      const k4 = i * 4;
      if (r.kind === KIND_FIELD) {
        r.live = i < nField;
      }
      if (!r.live) {
        this.icicles.setMatrixAt(i, _zero);
        state[k4 + 3] = 0;
        continue;
      }
      // A pin icicle is steered onto the body it is meant for while it drops.
      if (r.kind === KIND_PIN && !r.landed) this._steerPin(r, i);

      const k = this._fallOf(r, c);
      if (k <= 0) {
        this.icicles.setMatrixAt(i, _zero);
        state[k4 + 3] = 0;
        continue;
      }
      this._groundOf(r, c);
      this._axisOf(r, c, g);
      const len = this._lengthOf(r, c);
      const embed = saturate(c.embed);

      if (k >= 1 && !r.landed) {
        r.landed = true;
        r.landAt = this.age;
        this._strikeFx(r, c, g, _ground);
      }

      let lenNow = len;
      let falling = 0;
      if (!r.landed) {
        // Accelerating down its own axis from the cloud.
        const kk = Easing.inQuad(k);
        const dist = (D / Math.max(0.2, -_axis.y)) * (1 - kk);
        _tip.copy(_ground).addScaledVector(_axis, embed * len - dist);
        lenNow = len * lerp(Math.max(1, c.fallStretch), 1, kk * kk);
        _pos.copy(_tip).addScaledVector(_axis, -lenNow);
        falling = 1;
      } else {
        // Shudder about the point it went in at.
        const tl = this.age - r.landAt;
        const q = c.quiverAmp * Math.exp(-tl * c.quiverDamp) * Math.sin(tl * c.quiverFreq * Math.PI * 2 + r.phase);
        if (Math.abs(q) > 1e-4) {
          _perp.crossVectors(_axis, _up).normalize();
          _q2.setFromAxisAngle(_perp, q);
          _axis.applyQuaternion(_q2);
        }
        _pos.copy(_ground).addScaledVector(_axis, -len * (1 - embed));
        standing++;
      }

      _q.setFromUnitVectors(_up, _axis);
      const w = c.needleWidth * (r.kind === KIND_VOLLEY ? 1.35 : 1) * (falling ? 0.8 : 1);
      _scale.set(w, lenNow, w);
      _m.compose(_pos, _q, _scale);
      this.icicles.setMatrixAt(i, _m);

      const dissolve = fadeK > 0 ? saturate(fadeK * 1.5 - r.seed * 0.5) : 0;
      state[k4] = r.seed;
      state[k4 + 1] = falling;
      state[k4 + 2] = dissolve;
      state[k4 + 3] = r.landed ? Math.exp(-(this.age - r.landAt) * 10) : 0;
    }
    this._standing = standing;
    this.icicles.visible = true;
    this.icicles.instanceMatrix.needsUpdate = true;
    this.stateAttr.needsUpdate = true;
  }

  /** The storm overhead and the floor beneath it. */
  _updateSky(dt, fadeK) {
    const c = settings[ID];
    const g = settings.global;
    const L = this.length;
    const yaw = Math.atan2(-this.direction.z, this.direction.x);
    const reach = L + c.volleyRadius + 2;

    /* the cloud */
    // The cloud starts ahead of the caster: behind them it would hang between
    // the chase camera and the body and fill the screen.
    const start = Math.min(c.cloudStart, reach - 1);
    const cl = Math.max(1, reach - start + c.cloudLead);
    this.cloud.position.copy(this.origin).addScaledVector(this.direction, start);
    this.cloud.position.y = c.cloudHeight + c.cloudBillow;
    this.cloud.rotation.set(0, yaw, 0);
    this.cloud.scale.set(cl, 1, c.cloudWidth);
    _cloudState.length = cl;
    _cloudState.width = c.cloudWidth;
    _cloudState.lead = this.front - start + c.cloudLead + (this.phase === AbilityPhase.TRAVEL ? 0 : c.volleyRadius + 2);
    _cloudState.seed = this._seed;
    _cloudState.fade = fadeK;
    this._flash = Math.max(0, this._flash - dt * 4);
    _cloudState.flash = this._flash;
    this.cloudMaterial.userData.sync(_cloudState);
    this.cloud.visible = fadeK < 0.999;

    /* the snowed floor */
    const width = c.laneWidth * 2 + 1.4;
    this.drift.position.copy(this.origin);
    this.drift.position.y = 0.012;
    this.drift.rotation.set(0, yaw, 0);
    this.drift.scale.set(reach, 1, width);
    // After the front stops, the drift spreads on round the end over the volley.
    const extra = this.phase === AbilityPhase.TRAVEL ? 0 : (c.volleyRadius + 2) * saturate(this.impactTime / Math.max(0.05, this._T(c.volleyTime) + this._fallT()));
    _driftState.length = reach;
    _driftState.width = width;
    _driftState.front = this.phase === AbilityPhase.FADE ? reach : this.front + extra;
    _driftState.seed = this._seed;
    _driftState.erode = fadeK;
    _driftState.start = Math.min(c.laneStart, L * 0.5);
    this.driftMaterial.userData.sync(_driftState);
    this.drift.visible = true;

    /* cold air at waist height */
    this.cold.position.copy(this.origin);
    this.cold.position.y = 1.1;
    this.cold.rotation.set(0, yaw, 0);
    this.cold.scale.set(reach, 1, width);
    _coldState.length = reach;
    _coldState.width = width;
    _coldState.front = _driftState.front;
    _coldState.strength = 1 - fadeK;
    this.coldMaterial.userData.sync(_coldState);
    this.cold.visible = fadeK < 0.999;
  }

  /* ------------------------------------------------------------------ */
  /* The bodies                                                          */
  /* ------------------------------------------------------------------ */

  _catch(x, z, radius) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings[ID];
    const g = settings.global;
    const found = field.findTargets(x, z, radius, this._found);
    const power = g.explosionIntensity;
    for (let f = 0; f < found.length; f++) {
      const dummy = found[f];
      this._force.impulse = c.hitImpulse * power;
      this._force.lift = c.hitLift * power;
      this._force.spin = c.hitSpin;
      if (!dummy.kill(this.direction.x, this.direction.z, this._force)) continue;
      this._openPin(dummy, c);
    }
    this._found.length = 0;
  }

  /** Give a felled body a pin and start its icicles falling on it. */
  _openPin(dummy, c) {
    let p = -1;
    for (let i = 0; i < MAX_PINS; i++) {
      if (!this.pins[i].dummy) {
        p = i;
        break;
      }
    }
    if (p < 0) return;
    const pin = this.pins[p];
    pin.dummy = dummy;
    pin.held = false;
    pin.x = dummy.position.x;
    pin.z = dummy.position.z;
    pin.at = this.age;
    const n = Math.min(PIN_EACH, Math.max(1, Math.round(c.pinNeedles)));
    for (let k = 0; k < PIN_EACH; k++) {
      const r = this.recs[MAX_FIELD + MAX_VOLLEY + p * PIN_EACH + k];
      r.live = k < n;
      r.t0 = this.age + k * 0.07;
      r.landed = false;
      r.gx = pin.x;
      r.gz = pin.z;
    }
  }

  /** Aim a pin icicle at its body's spine (offset a little for all but the first). */
  _steerPin(r, i) {
    const local = i - MAX_FIELD - MAX_VOLLEY;
    const pin = this.pins[Math.floor(local / PIN_EACH)];
    if (!pin?.dummy) return;
    const k = local % PIN_EACH;
    const c = settings[ID];
    if (pin.dummy.joint && pin.dummy.joint(c.pinJoint, _pos)) {
      pin.x = _pos.x;
      pin.z = _pos.z;
    }
    const a = r.phase;
    const off = k === 0 ? 0 : 0.3;
    r.gx = pin.x + Math.cos(a) * off;
    r.gz = pin.z + Math.sin(a) * off;
  }

  /** Hold every pinned body's spine to the floor where its first icicle went in. */
  _holdPins(fadeK) {
    const c = settings[ID];
    for (let p = 0; p < MAX_PINS; p++) {
      const pin = this.pins[p];
      if (!pin.dummy) continue;
      const first = this.recs[MAX_FIELD + MAX_VOLLEY + p * PIN_EACH];
      if (!first.landed) continue;
      if (fadeK > 0.5 || pin.dummy.finished) {
        pin.dummy.unpin();
        pin.dummy = null;
        continue;
      }
      if (!pin.held) {
        pin.held = true;
        pin.x = first.gx;
        pin.z = first.gz;
      }
      _pos.set(pin.x, c.pinHeight, pin.z);
      pin.dummy.pin(c.pinJoint, _pos, c.pinStiffness);
      const look = this._look;
      look.color = c.colorBodyFrozen;
      look.rimColor = c.colorBodyRim;
      look.rimEmissive = c.bodyRimGlow;
      look.edgeColor = c.colorBodyEdge;
      look.edgeEmissive = c.bodyEdgeGlow;
      pin.dummy.corrode(saturate((this.age - first.landAt) / 0.6) * c.frostTint, look);
    }
  }

  _releasePins() {
    for (let p = 0; p < MAX_PINS; p++) {
      const pin = this.pins[p];
      if (pin.dummy) pin.dummy.unpin();
      pin.dummy = null;
      pin.held = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  _strikeFx(r, c, g, at) {
    const time = frame.uTime.value;
    this._strikes++;
    _pos.copy(at).setY(0.08);
    _emit.position = _pos;
    _emit.radius = 0.15;
    _emit.direction = _up;
    _emit.speed = c.puffSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.9;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.4;
    _emit.sizeVariance = 0.5;
    _emit.life = c.puffLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0.5;
    _emit.tint = null;
    _emit.time = time;
    this.puffs.emit(Math.round(c.puffCount * g.particleCount), _emit);
    _emit.speed = c.chipSpeed;
    _emit.spread = 0.8;
    _emit.size = 0.08;
    _emit.sizeVariance = 0.6;
    _emit.life = c.chipLifetime;
    _emit.spin = 10;
    this.chips.emit(Math.round(c.chipCount * g.particleCount), _emit);
    const every = Math.max(1, Math.round(c.strikeDecalEvery));
    if (this._strikes % every === 0 || r.kind !== KIND_FIELD) {
      this.ctx.decals.spawn(DecalType.FROST, at, {
        radius: c.strikeDecalRadius * (r.kind === KIND_VOLLEY ? 1.6 : 1),
        life: this.impactDuration + this.fadeDuration,
        intensity: 0.9,
        colorA: getColor(c.colorSnow),
        colorB: getColor(c.colorIceGlow),
        height: 0.02
      });
    }
    this.ctx.shake.add(c.strikeShake * g.explosionIntensity, 9, 26);
  }

  /** Driving snow under the front, flakes over the storm, a ground blizzard at the front. */
  _snowFx(dt, c, g, from, to, rate) {
    const time = frame.uTime.value;
    const L = this.length;
    const n = Math.round(this.snowEmitter.tick(dt, c.snowRate * rate) * g.particleCount);
    if (n > 0) {
      this._axisOf(NOMINAL, c, g);
      _fall.copy(_axis);
      _emit.radius = 0;
      _emit.direction = _fall;
      _emit.speed = c.snowSpeed;
      _emit.speedVariance = 0.25;
      _emit.spread = 0.08;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.06;
      _emit.sizeVariance = 0.5;
      _emit.life = c.snowLifetime;
      _emit.lifeVariance = 0.3;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = time;
      for (let k = 0; k < n; k++) {
        const s = lerp(from, to, Math.random());
        this.pointAt(saturate(s / L), _pos).addScaledVector(this.side, (Math.random() * 2 - 1) * (c.laneWidth + 0.8));
        // Over-run the line's end a little so the volley is snowed on too.
        if (s > L) _pos.addScaledVector(this.direction, s - L);
        _pos.y = c.cloudHeight * (0.55 + 0.4 * Math.random());
        _emit.position = _pos;
        this.snow.emit(1, _emit);
      }
    }
    const nf = Math.round(this.flakeEmitter.tick(dt, c.flakeRate * Math.min(1, rate + 0.3)) * g.particleCount);
    if (nf > 0) {
      _emit.radius = 0;
      _emit.direction = _fall;
      _emit.speed = 1.4;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.5;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.07;
      _emit.sizeVariance = 0.6;
      _emit.life = c.flakeLifetime;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = time;
      for (let k = 0; k < nf; k++) {
        const s0 = Math.min(c.laneStart, L * 0.5);
        const s = s0 + Math.random() * Math.max(0.5, to - s0);
        this.pointAt(saturate(s / L), _pos).addScaledVector(this.side, (Math.random() * 2 - 1) * (c.laneWidth + 1.2));
        _pos.y = Math.random() * c.cloudHeight;
        _emit.position = _pos;
        this.flakes.emit(1, _emit);
      }
    }
    const nh = Math.round(this.hazeEmitter.tick(dt, c.hazeRate * rate) * g.particleCount);
    if (nh > 0) {
      this.pointAt(saturate(Math.min(to, L) / L), _pos).setY(0.4);
      _emit.position = _pos;
      _emit.radius = c.laneWidth * 0.8;
      _emit.direction = this.direction;
      _emit.speed = c.puffSpeed * 1.5;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.6;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.6;
      _emit.sizeVariance = 0.5;
      _emit.life = c.puffLifetime * 1.2;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0.4;
      _emit.tint = null;
      _emit.time = time;
      this.puffs.emit(nh, _emit);
    }
  }

  _volley(c, g) {
    this._volleyed = true;
    this._volleyAt = this.age;
    this.pointAt(1, _end);
    const n = Math.min(MAX_VOLLEY, Math.max(0, Math.round(c.volleyCount)));
    const span = this._T(c.volleyTime);
    for (let k = 0; k < MAX_VOLLEY; k++) {
      const r = this.recs[MAX_FIELD + k];
      r.live = k < n;
      if (!r.live) continue;
      const a = Math.random() * Math.PI * 2;
      const rr = c.volleyRadius * Math.sqrt(Math.random());
      r.gx = _end.x + Math.cos(a) * rr;
      r.gz = _end.z + Math.sin(a) * rr;
      // The middle comes down last, and hardest.
      r.t0 = this.age + span * (1 - rr / Math.max(0.1, c.volleyRadius)) * (0.6 + 0.4 * Math.random());
      r.landed = false;
    }
  }

  _volleyBeat(c, g) {
    const power = g.explosionIntensity;
    this.pointAt(1, _end);
    this.ctx.shake.add(c.volleyShake * power, 3.5, 16);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.volleyFlash * power);
    this.lightBoost = c.volleyLight * power;
    this._flash = 1;
    _pos.copy(_end).setY(0.6);
    this.ctx.bursts.spawn(BurstMode.FROST, _pos, {
      radius: 0.3,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1.3,
      opacity: 0.8 * g.opacity,
      squash: 0.5,
      colorA: getColor(c.colorSnowA),
      colorB: getColor(c.colorIceGlow),
      colorC: getColor(c.colorSnowD)
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
    this._catch(_end.x, _end.z, c.volleyRadius + 0.4);
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._sync();
    this._updateSky(dt, 0);
    this._updateIcicles(dt, 0);
    this._snowFx(dt, c, g, Math.max(Math.min(c.laneStart, this.length * 0.5), this.front - c.snowSpan), this.front + c.cloudLead * 0.5, 1);
    this._catch(this.position.x, this.position.z, c.hitRadius);
    this._holdPins(0);
    this.ctx.shake.rumble(c.stormRumble * g.cameraShake, dt);
    this.position.y = 2;
  }

  onImpact() {
    const c = settings[ID];
    this._volley(c, settings.global);
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    const fadeK = t > 1 ? t - 1 : 0;
    this._sync();
    this._updateSky(dt, fadeK);
    this._updateIcicles(dt, fadeK);
    // The last volley lands when its centre does.
    if (this._volleyed && !this._beat && this.age - this._volleyAt >= this._T(c.volleyTime) * 0.6 + this._fallT()) {
      this._beat = true;
      this._volleyBeat(c, g);
    }
    const storm = this.phase === AbilityPhase.IMPACT ? 1 - smoothstep(0.5, 1, t) : 0;
    const L = this.length;
    this._snowFx(dt, c, g, L - c.snowSpan * 0.5, L + c.volleyRadius, storm);
    this._holdPins(fadeK);
    this.pointAt(1, _end);
    this.position.set(_end.x, 1.6, _end.z);
  }

  onDestroy() {
    this._releasePins();
    this._beat = false;
    for (let i = 0; i < MAX_NEEDLES; i++) this.recs[i].live = false;
    this.icicles.visible = false;
    this.cloud.visible = false;
    this.drift.visible = false;
    this.cold.visible = false;
    this._found.length = 0;
  }

  dispose() {
    this.icicleGeometry.dispose();
    this.cloudGeometry.dispose();
    this.stripGeometry.dispose();
    this.icicleMaterial.dispose();
    this.cloudMaterial.dispose();
    this.driftMaterial.dispose();
    this.coldMaterial.dispose();
    this.icicles.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('❄  Whiteout Needle');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'storm front speed (m/s)');
  R(cast, c, 'zoneRadius', 0, 10, 0.05, 'zone radius (unused)');
  R(cast, c, 'lifetime', 0.05, 5, 0.05, 'sublimes over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const time = folder.addFolder('Timing');
  R(time, c, 'fallTime', 0.05, 1.5, 0.01, 'icicle falls over');
  R(time, c, 'volleyTime', 0.05, 2, 0.01, 'last volley over');
  R(time, c, 'holdTime', 0, 4, 0.05, 'field stands for');

  const ic = folder.addFolder('1 · Icicles');
  R(ic, c, 'needleCount', 0, MAX_FIELD, 1, 'down the line');
  R(ic, c, 'laneWidth', 0, 5, 0.05, 'lane half-width (m)');
  R(ic, c, 'needleLength', 0.2, 5, 0.05, 'length (m)');
  R(ic, c, 'needleWidth', 0.01, 0.5, 0.005, 'width (m)');
  R(ic, c, 'needleJitter', 0, 1, 0.01, 'length variety');
  R(ic, c, 'embed', 0, 0.9, 0.01, 'driven in (× length)');
  R(ic, c, 'slant', 0, 1.3, 0.01, 'slant (rad)');
  R(ic, c, 'slantJitter', 0, 1, 0.01, 'slant variety (rad)');
  R(ic, c, 'fallStretch', 1, 6, 0.05, 'streak while falling (×)');
  R(ic, c, 'quiverAmp', 0, 0.6, 0.005, 'shudder (rad)');
  R(ic, c, 'quiverFreq', 0, 60, 0.5, 'shudder rate');
  R(ic, c, 'quiverDamp', 0, 30, 0.1, 'shudder dies');
  R(ic, c, 'iceEnv', 0, 2, 0.01, 'sky reflection');
  R(ic, c, 'iceRimGlow', 0, 5, 0.05, 'rim glow');
  R(ic, c, 'iceCoreGlow', 0, 5, 0.05, 'core glow');
  R(ic, c, 'trailGlow', 0, 15, 0.05, 'falling root glow');
  R(ic, c, 'landGlow', 0, 15, 0.05, 'strike flash');
  ic.addColor(c, 'colorIce').name('ice');
  ic.addColor(c, 'colorIceMilk').name('ice, milky');
  ic.addColor(c, 'colorIceGlow').name('glow');
  const vol = ic.addFolder('Last volley');
  R(vol, c, 'volleyCount', 0, MAX_VOLLEY, 1, 'icicles');
  R(vol, c, 'volleyRadius', 0.2, 5, 0.05, 'radius (m)');
  R(vol, c, 'volleyLength', 0.2, 6, 0.05, 'length (m)');

  const cl = folder.addFolder('2 · Cloud');
  R(cl, c, 'cloudHeight', 2, 15, 0.05, 'height (m)');
  R(cl, c, 'cloudWidth', 1, 15, 0.05, 'width (m)');
  R(cl, c, 'laneStart', 0, 10, 0.05, 'storm starts ahead of the caster (m)');
  R(cl, c, 'cloudStart', -3, 10, 0.05, 'starts ahead of the caster (m)');
  R(cl, c, 'cloudLead', 0, 10, 0.05, 'runs ahead (m)');
  R(cl, c, 'cloudBillow', 0, 4, 0.05, 'billow (m)');
  R(cl, c, 'cloudScale', 0.05, 2, 0.01, 'billows / m');
  R(cl, c, 'cloudWind', 0, 8, 0.05, 'wind (m/s)');
  R(cl, c, 'cloudOpacity', 0, 1, 0.01, 'opacity');
  cl.addColor(c, 'colorCloudBelly').name('belly');
  cl.addColor(c, 'colorCloudLit').name('lit');

  const sn = folder.addFolder('3 · Snow');
  R(sn, c, 'snowRate', 0, 3000, 10, 'driving snow / s');
  R(sn, c, 'snowSpeed', 0, 40, 0.1, 'speed');
  R(sn, c, 'snowSize', 0.005, 0.3, 0.005, 'size');
  R(sn, c, 'snowLifetime', 0.05, 2, 0.01, 'lifetime');
  R(sn, c, 'snowStretch', 0, 2, 0.01, 'stretch');
  R(sn, c, 'snowSpan', 0, 15, 0.1, 'falls behind the front (m)');
  R(sn, c, 'flakeRate', 0, 1500, 5, 'flakes / s');
  R(sn, c, 'flakeSize', 0.005, 0.3, 0.005, 'flake size');
  R(sn, c, 'flakeLifetime', 0.1, 5, 0.05, 'flake lifetime');
  Editor.gradient(sn, c, 'colorSnow', 'snow colour');

  const fl = folder.addFolder('4 · Snowed floor');
  R(fl, c, 'driftStreak', 0, 4, 0.01, 'wind-combed');
  R(fl, c, 'driftEdgeGlow', 0, 8, 0.05, 'leading edge glow');
  R(fl, c, 'driftSparkle', 0, 8, 0.05, 'glints');
  R(fl, c, 'driftOpacity', 0, 1, 0.01, 'opacity');
  fl.addColor(c, 'colorSnow').name('snow');
  fl.addColor(c, 'colorSnowShade').name('snow, shade');
  R(fl, c, 'coldWarp', 0, 3, 0.01, 'cold air distortion');
  R(fl, c, 'coldScale', 0.1, 5, 0.05, 'cold air scale');

  const st = folder.addFolder('5 · Strikes');
  R(st, c, 'puffCount', 0, 30, 1, 'puffs per strike');
  R(st, c, 'puffSize', 0.05, 3, 0.05, 'puff size');
  R(st, c, 'puffSpeed', 0, 8, 0.05, 'puff speed');
  R(st, c, 'puffLifetime', 0.1, 4, 0.05, 'puff lifetime');
  R(st, c, 'puffOpacity', 0, 1, 0.01, 'puff opacity');
  R(st, c, 'chipCount', 0, 30, 1, 'chips per strike');
  R(st, c, 'chipSpeed', 0, 20, 0.1, 'chip speed');
  R(st, c, 'chipSize', 0.01, 0.4, 0.005, 'chip size');
  R(st, c, 'chipLifetime', 0.1, 3, 0.05, 'chip lifetime');
  R(st, c, 'chipGravity', -40, 0, 0.5, 'chip gravity');
  R(st, c, 'strikeDecalEvery', 1, 12, 1, 'frost decal every nth');
  R(st, c, 'strikeDecalRadius', 0.05, 2, 0.01, 'frost decal radius');
  R(st, c, 'hazeRate', 0, 300, 1, 'ground blizzard / s');
  Editor.gradient(st, c, 'colorPuff', 'puff colour');

  const hit = folder.addFolder('6 · Bodies');
  R(hit, c, 'hitRadius', 0, 5, 0.05, 'caught within (m)');
  R(hit, c, 'hitImpulse', 0, 15, 0.1, 'knocked down the line');
  R(hit, c, 'hitLift', 0, 8, 0.05, 'lift');
  R(hit, c, 'hitSpin', 0, 5, 0.05, 'spin');
  hit.add(c, 'pinJoint').name('pinned by joint');
  R(hit, c, 'pinHeight', 0, 1.5, 0.01, 'held at height (m)');
  R(hit, c, 'pinStiffness', 0, 1, 0.01, 'hold stiffness');
  R(hit, c, 'pinNeedles', 1, PIN_EACH, 1, 'icicles per body');
  R(hit, c, 'frostTint', 0, 1, 0.01, 'frosted');
  hit.addColor(c, 'colorBodyFrozen').name('frosted body');
  hit.addColor(c, 'colorBodyRim').name('rim');
  R(hit, c, 'bodyRimGlow', 0, 6, 0.05, 'rim glow');
  hit.addColor(c, 'colorBodyEdge').name('edge');
  R(hit, c, 'bodyEdgeGlow', 0, 8, 0.05, 'edge glow');

  const beat = folder.addFolder('7 · The beat');
  R(beat, c, 'strikeShake', 0, 0.5, 0.005, 'per strike');
  R(beat, c, 'stormRumble', 0, 1, 0.01, 'storm rumble');
  R(beat, c, 'volleyShake', 0, 1.5, 0.01, 'volley shake');
  R(beat, c, 'volleyFlash', 0, 1, 0.01, 'volley flash');
  R(beat, c, 'volleyLight', 0, 100, 0.5, 'light punch');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'burstRadius', 0, 10, 0.05, 'frost shell (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'frost shell life');
  R(beat, c, 'shockRadius', 0, 12, 0.05, 'shock ring (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'shock ring life');
  beat.addColor(c, 'colorShockA').name('shock ring');
  beat.addColor(c, 'colorShockB').name('shock ring, hot');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
}
