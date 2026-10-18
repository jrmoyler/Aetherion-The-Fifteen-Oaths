import { Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import { createFunnelGeometry } from '../../assets/codex/DustDevilMarchGeometry.js';
import {
  createFunnelMaterial,
  createFunnelWarpMaterial,
  createTrackMaterial,
  MAX_DEVILS
} from '../../materials/codex/DustDevilMarchMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'dustmarch';

const TAU = Math.PI * 2;
/** Bodies the march can be carrying at once. */
const MAX_CAUGHT = 8;
/** Bodies one cast remembers having flung, so it does not catch them twice. */
const MAX_FLUNG = 16;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _anchor = new Vector3();
const _centre = new Vector3();
const _vel = new Vector3();
const _up = new Vector3(0, 1, 0);
const _trackState = { centre: new Vector3(), radius: 5, worn: 0, march: 0, erode: 0, seed: 0 };

function syncSystem(p, a, b, cc, d, glow, turb) {
  const g = settings.global;
  p.setGradient(getColor(a), getColor(b), getColor(cc), getColor(d));
  p.uniforms.uSizeScale.value = g.particleSize;
  p.uniforms.uLifeScale.value = g.particleLifetime;
  p.uniforms.uSpeedScale.value = g.particleSpeed;
  p.uniforms.uOpacity.value = g.opacity;
  p.uniforms.uGlow.value = glow;
  p.uniforms.uTurbulence.value = turb * g.turbulence;
}

function resetEmit(time) {
  _emit.radius = 0;
  _emit.direction = null;
  _emit.speed = 0;
  _emit.speedVariance = 0.35;
  _emit.spread = 0;
  _emit.inherit = null;
  _emit.anchor = null;
  _emit.size = 0.1;
  _emit.sizeVariance = 0.4;
  _emit.life = 1;
  _emit.lifeVariance = 0.35;
  _emit.spin = 0;
  _emit.tint = null;
  _emit.time = time;
}

/**
 * DUST DEVIL MARCH — Wind, zone cast.
 *
 * A **gust** skims the floor from the caster to the circle with a single
 * small dust devil riding its head. Where it arrives it **breaks** — a puff of
 * dust, a thin shell of air — and **splits**: a ring of dust devils spins up
 * out of the middle and races out to the rim, growing as they go, until the
 * circle is **crowned** with whirling columns, each pinched at the floor over
 * a flared skirt of kicked-up dust and widening up into a ragged crown. Then
 * they **march**: round the rim together, leaning into the walk, snaking,
 * spinning debris and grit round themselves and wearing a raked ring into the
 * floor. Anything they walk over is **snatched up** — whirled round the column
 * and lifted — and, a moment later, **flung** out of the circle. At the end
 * the devils **rope out**: the columns thin, the skirts spread, they fray into
 * wisps and drop their dust.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the funnels** (`createFunnelMaterial`) — one instanced parameter-space
 *      tube, drawn twice per devil (a dense core and a wide veil), raised,
 *      leaned, twisted and frayed in the vertex stage. Normal-blended dust: a
 *      devil darkens what is behind it.
 *   2. **the swirl** (`createFunnelWarpMaterial`) — the same tubes on
 *      `LAYER.DISTORTION`, bending the air *round* each column.
 *   3. **the track** (`createTrackMaterial`) — the raked ring and the churn
 *      under each devil.
 *   4. **particles** — the skirts (SMOKE, swirling), debris (CHIP, lit,
 *      swirling up the columns), grit streaks (STREAK) whipped round them.
 *   5. **the beats** — a DUSTRING and an AIR shell where the gust breaks, a
 *      DUSTRING where each devil reaches the rim and where each one dies,
 *      shake, and a rumble that tracks how many devils are walking.
 *
 * ## The bodies
 *
 * `handlesOwnHits`. A devil that walks within `catchRadius` of a standing
 * body knocks it off its feet and *carries* it (`Dummy#carry`) on the devil's
 * own flow field — round the column, in toward it, up it — for `holdTime`;
 * then lets go and flings it outward (`Dummy#shove`). A body, once flung, is
 * not caught again.
 *
 * ## The editor rule
 *
 * A devil holds dice only (a seed, a height roll, a wander roll). Its place on
 * the rim, its height, lean, spin and fray are resolved from
 * `settings.dustmarch` each frame; the march and every spin are integrated
 * phases, so their rates are live without anything jumping.
 */
export class DustDevilMarchAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** Devils walking. HUD readout only. */
  get instanceCount() {
    return this._live;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- 1 · the funnels, and 2 · their swirl ---- */
    this.funnelGeometry = createFunnelGeometry(MAX_DEVILS * 2);
    this.funnelMaterial = createFunnelMaterial();
    this.funnels = new Mesh(this.funnelGeometry, this.funnelMaterial);
    this._setup(this.funnels, LAYER.VFX, 10);
    this.swirlMaterial = createFunnelWarpMaterial();
    this.swirl = new Mesh(this.funnelGeometry, this.swirlMaterial);
    this._setup(this.swirl, LAYER.DISTORTION, 0);

    /* ---- 3 · the track ---- */
    this.trackGeometry = new PlaneGeometry(2, 2, 1, 1);
    this.trackMaterial = createTrackMaterial();
    this.track = new Mesh(this.trackGeometry, this.trackMaterial);
    this._setup(this.track, LAYER.VFX, 2);

    /** Dice, and what this frame resolved — see the class comment. */
    this.devils = [];
    for (let i = 0; i < MAX_DEVILS; i++) {
      this.devils.push({
        seed: 0,
        hDice: 0,
        wDice: 0,
        spin: 0,
        arrived: false,
        collapsing: false,
        x: 0,
        z: 0,
        px: 0,
        pz: 0,
        vx: 0,
        vz: 0,
        height: 0,
        scale: 0,
        opacity: 0,
        collapse: 0,
        leanX: 0,
        leanZ: 0
      });
    }
    this.caught = [];
    for (let i = 0; i < MAX_CAUGHT; i++) {
      const slot = { dummy: null, devil: 0, time: 0, field: null };
      slot.field = (x, y, z, out) => this._flow(slot, x, y, z, out);
      this.caught.push(slot);
    }
    this._flung = [];
    this._n = 1;
    this._live = 0;
    this._seed = 0;
    this._clock = -1;
    this._march = 0;
    this._marchRate = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  _setup(mesh, layer, order) {
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.group.add(mesh);
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.skirt = particles.get('dustmarch.skirt', { capacity: 2000, shape: ParticleShape.SMOKE, additive: false, swirl: true, softFade: 0.8 });
    this.skirt.uniforms.uDrag.value = 1.4;
    this.skirt.uniforms.uEndSize.value = 2.2;
    this.skirt.uniforms.uSizeIn.value = 0.12;
    this.skirt.uniforms.uFadeIn.value = 0.1;
    this.skirt.uniforms.uFadeOut.value = 0.55;

    this.debris = particles.get('dustmarch.debris', { capacity: 1600, shape: ParticleShape.CHIP, additive: false, lit: true, swirl: true, softFade: 0.1 });
    this.debris.uniforms.uDrag.value = 0.8;
    this.debris.uniforms.uEndSize.value = 0.9;
    this.debris.uniforms.uSizeIn.value = 0.03;
    this.debris.uniforms.uFadeIn.value = 0.05;
    this.debris.uniforms.uFadeOut.value = 0.3;

    this.grit = particles.get('dustmarch.grit', { capacity: 1600, shape: ParticleShape.STREAK, additive: false, stretch: true, softFade: 0.2 });
    this.grit.uniforms.uDrag.value = 0.6;
    this.grit.uniforms.uEndSize.value = 0.5;
    this.grit.uniforms.uSizeIn.value = 0.02;
    this.grit.uniforms.uFadeIn.value = 0.05;
    this.grit.uniforms.uFadeOut.value = 0.5;

    this.skirtEmitter = new RateEmitter();
    this.debrisEmitter = new RateEmitter();
    this.gritEmitter = new RateEmitter();
    this.gustEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing — every second resolved from settings                        */
  /* ------------------------------------------------------------------ */

  _spreadEnd() {
    const c = settings[ID];
    return Math.max(0.05, c.spreadTime) + Math.max(0, c.spawnStagger) * (this._n - 1);
  }

  get impactDuration() {
    const c = settings[ID];
    return this._spreadEnd() + Math.max(0.1, c.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    const c = settings[ID];
    return (Math.max(0.1, c.collapseTime) + Math.max(0, c.collapseStagger)) * settings.global.lifetime;
  }

  /** Daylight through dust: a slow sway, no flicker. */
  lightShimmer() {
    return 0.9 + 0.1 * Math.sin(this.age * 1.7);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings[ID];
    this._seed = Math.random() * 100;
    this._clock = -1;
    this._march = Math.random() * TAU;
    this._marchRate = 0;
    this._live = 0;
    this._n = Math.max(1, Math.min(MAX_DEVILS, Math.round(c.devilCount)));
    this._flung.length = 0;
    this._releaseAll();
    this.skirtEmitter.reset();
    this.debrisEmitter.reset();
    this.gritEmitter.reset();
    this.gustEmitter.reset();
    for (let i = 0; i < MAX_DEVILS; i++) {
      const d = this.devils[i];
      d.seed = Math.random();
      d.hDice = Math.random();
      d.wDice = Math.random();
      d.spin = Math.random() * TAU;
      d.arrived = false;
      d.collapsing = false;
      d.x = this.origin.x;
      d.z = this.origin.z;
      d.px = d.x;
      d.pz = d.z;
      d.vx = 0;
      d.vz = 0;
      d.height = 0;
      d.scale = 0;
      d.opacity = 0;
      d.collapse = 0;
      d.leanX = 0;
      d.leanZ = 0;
    }
    const devs = this.trackMaterial.uniforms.uDevils.value;
    for (let i = 0; i < MAX_DEVILS; i++) devs[i].set(0, 0, 0, 1);
    this.funnelGeometry.instanceCount = 0;
    this.funnels.visible = true;
    this.swirl.visible = true;
    this.track.visible = false;
  }

  _sync() {
    const c = settings[ID];
    const g = settings.global;
    this.funnelMaterial.userData.sync();
    this.swirlMaterial.userData.sync();
    syncSystem(this.skirt, c.colorSkirtA, c.colorSkirtB, c.colorSkirtC, c.colorSkirtD, 1, 0.6);
    this.skirt.uniforms.uOpacity.value = c.skirtOpacity * g.opacity;
    this.skirt.uniforms.uGravity.value.set(0, c.skirtRise, 0);
    this.skirt.uniforms.uSwirl.value = c.skirtSwirl;
    this.skirt.uniforms.uSwirlExpand.value = c.skirtExpand;
    syncSystem(this.debris, c.colorDebrisA, c.colorDebrisB, c.colorDebrisC, c.colorDebrisD, 1, 0.1);
    this.debris.uniforms.uGravity.value.set(0, -c.debrisGravity, 0);
    this.debris.uniforms.uSwirl.value = c.debrisSwirl;
    this.debris.uniforms.uSwirlExpand.value = c.debrisExpand;
    syncSystem(this.grit, c.colorGritA, c.colorGritB, c.colorGritC, c.colorGritD, 1, 0.3);
    this.grit.uniforms.uOpacity.value = c.gritOpacity * g.opacity;
    this.grit.uniforms.uGravity.value.set(0, -1, 0);
    this.grit.uniforms.uStretch.value = c.gritStretch;
  }

  /* ------------------------------------------------------------------ */
  /* The march                                                           */
  /* ------------------------------------------------------------------ */

  /** Place every devil: the leader on the gust, then the split, the crown, the march, the rope-out. */
  _updateDevils(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._n = Math.max(1, Math.min(MAX_DEVILS, Math.round(c.devilCount)));
    const n = this._n;
    const clock = this._clock;
    const fading = this.phase === AbilityPhase.FADE;
    const ft = fading ? this.fadeTime : 0;
    const R = Math.max(0.5, c.zoneRadius * c.marchRadius);
    const spreadEnd = this._spreadEnd();

    // The march gathers pace once the ring is crowned, and slows as it ropes out.
    const marching = clock < 0 ? 0 : smoothstep(spreadEnd * 0.6, spreadEnd + 0.3, clock);
    const slow = fading ? 1 - smoothstep(0, 0.6, ft / Math.max(0.05, this.fadeDuration)) : 1;
    this._marchRate = c.marchSpeed * marching * slow;
    this._march += this._marchRate * dt * g.animationSpeed;

    let live = 0;
    for (let i = 0; i < n; i++) {
      const d = this.devils[i];
      d.px = d.x;
      d.pz = d.z;
      const H = lerp(c.heightMin, c.heightMax, d.hDice);
      if (clock < 0) {
        /* the leader rides the gust; the rest are not born yet */
        if (i === 0) {
          d.x = this.position.x;
          d.z = this.position.z;
          d.height = c.leadHeight;
          d.scale = c.leadScale * smoothstep(0, 0.15, this.age);
          d.opacity = 1;
        } else {
          d.x = this.position.x;
          d.z = this.position.z;
          d.height = 0;
          d.scale = 0;
          d.opacity = 0;
        }
        d.collapse = 0;
      } else {
        /* the split: out from the middle to its place on the rim, growing */
        const k = saturate((clock - i * Math.max(0, c.spawnStagger)) / Math.max(0.05, c.spreadTime));
        const e = Easing.outCubic(k);
        const ang = this._march + (i / n) * TAU;
        const wander = c.wander * Math.sin(this.age * c.wanderRate + d.wDice * TAU) * g.randomness;
        const rr = (R + wander) * e;
        d.x = _centre.x + Math.cos(ang) * rr;
        d.z = _centre.z + Math.sin(ang) * rr;
        d.height = lerp(i === 0 ? c.leadHeight : 0.4, H, e);
        d.scale = lerp(i === 0 ? c.leadScale : 0.2, lerp(0.85, 1.15, d.seed), e);
        d.opacity = i === 0 ? 1 : smoothstep(0, 0.25, k);
        if (k >= 1 && !d.arrived) {
          d.arrived = true;
          this._arriveFx(d);
        }
        /* the rope-out */
        if (fading) {
          const stag = Math.max(0, c.collapseStagger) * g.lifetime * d.seed;
          d.collapse = saturate((ft - stag) / Math.max(0.1, c.collapseTime * g.lifetime));
          if (d.collapse > 0 && !d.collapsing) {
            d.collapsing = true;
            this._collapseFx(d);
          }
          d.height *= 1 + d.collapse * c.ropeStretch;
          d.opacity *= 1 - smoothstep(0.55, 1, d.collapse);
        } else {
          d.collapse = 0;
        }
      }
      // Velocity (for the lean and the carried bodies), smoothed.
      if (dt > 0) {
        const ivx = (d.x - d.px) / dt;
        const ivz = (d.z - d.pz) / dt;
        const s = Math.min(1, dt * 6);
        d.vx += (ivx - d.vx) * s;
        d.vz += (ivz - d.vz) * s;
      }
      // Lean into the walk.
      d.leanX = Math.max(-1, Math.min(1, d.vx * c.lean * 0.1));
      d.leanZ = Math.max(-1, Math.min(1, d.vz * c.lean * 0.1));
      d.spin += c.spinRate * (1 - d.collapse * 0.6) * dt * g.animationSpeed;
      if (d.opacity > 0.01 && d.scale > 0.01) live++;
    }
    this._live = live;

    /* write the instances: core, then veil, per devil */
    const a1 = this.funnelGeometry.attributes.aDevil;
    const a2 = this.funnelGeometry.attributes.aDevil2;
    const a3 = this.funnelGeometry.attributes.aDevil3;
    for (let i = 0; i < n; i++) {
      const d = this.devils[i];
      for (let shell = 0; shell < 2; shell++) {
        const q = i * 2 + shell;
        a1.setXYZW(q, d.x, d.z, d.seed + shell * 0.37, shell);
        a2.setXYZW(q, Math.max(0.05, d.height), d.scale, d.spin * (shell ? c.veilSpin : 1), d.opacity);
        a3.setXYZW(q, d.leanX, d.leanZ, d.collapse, 0);
      }
    }
    a1.needsUpdate = true;
    a2.needsUpdate = true;
    a3.needsUpdate = true;
    this.funnelGeometry.instanceCount = n * 2;
    this.funnels.visible = live > 0;
    this.swirl.visible = live > 0;

    /* the track */
    if (clock >= 0) {
      const devs = this.trackMaterial.uniforms.uDevils.value;
      for (let i = 0; i < MAX_DEVILS; i++) {
        const d = this.devils[i];
        if (i < n) devs[i].set(d.x - _centre.x, d.z - _centre.z, d.opacity * (1 - d.collapse) * d.scale, c.churnRadius * d.scale);
        else devs[i].set(0, 0, 0, 1);
      }
      _trackState.centre.copy(_centre);
      _trackState.radius = R;
      _trackState.worn = smoothstep(0, spreadEnd + 1.2, clock);
      _trackState.march = this._march;
      _trackState.erode = fading ? smoothstep(0.3, 1, ft / Math.max(0.05, this.fadeDuration)) : 0;
      _trackState.seed = this._seed;
      this.trackMaterial.userData.sync(_trackState);
      this.track.visible = true;
    }

    if (dt > 0) {
      this._devilFx(dt);
      this.ctx.shake.rumble(c.marchRumble * Math.min(1, live / 4) * slow, dt);
    }
  }

  /* ------------------------------------------------------------------ */
  /* The bodies                                                          */
  /* ------------------------------------------------------------------ */

  /** The flow round devil `slot.devil` — what a carried body is swept along on. */
  _flow(slot, x, y, z, out) {
    const c = settings[ID];
    const d = this.devils[slot.devil];
    const H = Math.max(0.5, d.height);
    const s = Math.max(0, Math.min(1, y / H));
    const ax = d.x + d.leanX * s * H;
    const az = d.z + d.leanZ * s * H;
    let rx = x - ax;
    let rz = z - az;
    const r = Math.max(0.05, Math.hypot(rx, rz));
    rx /= r;
    rz /= r;
    // Round the column (spinning), in toward its orbit, up it, and along with it.
    const swirl = c.carrySwirl;
    const pull = (c.carryOrbit - r) * c.carryPull;
    out.x = -rz * swirl + rx * pull + d.vx;
    out.z = rx * swirl + rz * pull + d.vz;
    out.y = c.carryLift * (1 - s / Math.max(0.1, c.carryCeiling));
    return out;
  }

  /** Snatch up whatever the walking devils pass over; carry; fling. */
  _updateCaught(dt) {
    const c = settings[ID];
    const g = settings.global;
    const field = this.ctx.dummies;
    const power = g.explosionIntensity;
    const fading = this.phase === AbilityPhase.FADE;

    /* catch */
    if (field?.findTargets && this._clock >= 0 && !fading) {
      for (let i = 0; i < this._n; i++) {
        const d = this.devils[i];
        if (d.opacity < 0.5 || d.scale < 0.4) continue;
        const found = field.findTargets(d.x, d.z, c.catchRadius * d.scale, this._found);
        for (let f = 0; f < found.length; f++) {
          const body = found[f];
          if (this._wasFlung(body)) continue;
          let slot = null;
          for (let q = 0; q < MAX_CAUGHT; q++) {
            if (!this.caught[q].dummy) {
              slot = this.caught[q];
              break;
            }
          }
          if (!slot) break;
          _dir.set(-(body.position.z - d.z), 0, body.position.x - d.x);
          if (_dir.lengthSq() < 1e-4) _dir.set(1, 0, 0);
          _dir.normalize();
          this._force.impulse = c.catchImpulse * power;
          this._force.lift = c.catchLift * power;
          this._force.spin = c.catchSpin;
          if (!body.kill(_dir.x, _dir.z, this._force)) continue;
          slot.dummy = body;
          slot.devil = i;
          slot.time = 0;
          this.ctx.shake.add(c.catchShake * power, 8, 20);
        }
        this._found.length = 0;
      }
    }

    /* carry, then fling */
    for (let q = 0; q < MAX_CAUGHT; q++) {
      const slot = this.caught[q];
      const body = slot.dummy;
      if (!body) continue;
      slot.time += dt;
      const d = this.devils[slot.devil];
      if (slot.time < c.holdTime && !d.collapsing && !body.finished) {
        const grab = c.carryGrab * (1 - d.collapse);
        body.carry(slot.field, grab, grab, c.carryBuoyancy);
        continue;
      }
      body.release();
      if (!body.finished) {
        if (!body.bodyPoint(_pos)) _pos.copy(body.position);
        _dir.set(_pos.x - _centre.x, 0, _pos.z - _centre.z);
        if (_dir.lengthSq() < 1e-4) _dir.set(d.vx, 0, d.vz);
        if (_dir.lengthSq() < 1e-4) _dir.set(1, 0, 0);
        _dir.normalize();
        body.shove(_dir.x * c.flingSpeed * power, c.flingUp * power, _dir.z * c.flingSpeed * power);
      }
      if (this._flung.length < MAX_FLUNG) this._flung.push(body);
      slot.dummy = null;
    }
  }

  _wasFlung(body) {
    for (let i = 0; i < this._flung.length; i++) if (this._flung[i] === body) return true;
    for (let q = 0; q < MAX_CAUGHT; q++) if (this.caught[q].dummy === body) return true;
    return false;
  }

  _releaseAll() {
    for (let q = 0; q < MAX_CAUGHT; q++) {
      const slot = this.caught[q];
      if (slot.dummy) slot.dummy.release();
      slot.dummy = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  /** Skirts, debris and grit round every devil; dust off the gust's head while it travels. */
  _devilFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const time = frame.uTime.value;
    const n = this._n;
    const live = Math.max(1, this._live);

    const sk = Math.round(this.skirtEmitter.tick(dt, c.skirtRate * live) * g.particleCount);
    if (sk > 0) {
      resetEmit(time);
      _emit.direction = _up;
      _emit.speed = c.skirtSpeed;
      _emit.spread = 0.6;
      _emit.size = c.skirtSize;
      _emit.sizeVariance = 0.5;
      _emit.life = c.skirtLife;
      _emit.spin = 0.6;
      for (let q = 0; q < sk; q++) {
        const d = this.devils[(Math.random() * n) | 0];
        if (d.opacity < 0.05) continue;
        const a = Math.random() * TAU;
        const r = c.baseRadius * d.scale * (1.2 + Math.random() * 1.5);
        _anchor.set(d.x, 0.1, d.z);
        _pos.set(d.x + Math.cos(a) * r, 0.12, d.z + Math.sin(a) * r);
        _emit.position = _pos;
        _emit.anchor = _anchor;
        this.skirt.emit(1, _emit);
      }
    }

    const db = Math.round(this.debrisEmitter.tick(dt, c.debrisRate * live) * g.particleCount);
    if (db > 0) {
      resetEmit(time);
      _emit.direction = _up;
      _emit.speed = c.debrisRise;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.15;
      _emit.size = c.debrisSize;
      _emit.sizeVariance = 0.6;
      _emit.life = c.debrisLife;
      _emit.spin = 9;
      for (let q = 0; q < db; q++) {
        const d = this.devils[(Math.random() * n) | 0];
        if (d.opacity < 0.3) continue;
        const h = Math.random() * d.height * 0.5;
        const s = h / Math.max(0.5, d.height);
        const r = lerp(c.baseRadius, c.topRadius, Math.pow(s, c.flare)) * d.scale * 0.9;
        const a = Math.random() * TAU;
        _anchor.set(d.x + d.leanX * h, h, d.z + d.leanZ * h);
        _pos.set(_anchor.x + Math.cos(a) * r, h, _anchor.z + Math.sin(a) * r);
        _emit.position = _pos;
        _emit.anchor = _anchor;
        this.debris.emit(1, _emit);
      }
    }

    const gr = Math.round(this.gritEmitter.tick(dt, c.gritRate * live) * g.particleCount);
    if (gr > 0) {
      resetEmit(time);
      _emit.speedVariance = 0.3;
      _emit.spread = 0.05;
      _emit.size = c.gritSize;
      _emit.life = c.gritLife;
      for (let q = 0; q < gr; q++) {
        const d = this.devils[(Math.random() * n) | 0];
        if (d.opacity < 0.3) continue;
        const h = Math.random() * d.height * 0.8;
        const s = h / Math.max(0.5, d.height);
        const r = lerp(c.baseRadius, c.topRadius, Math.pow(s, c.flare)) * d.scale * 1.1;
        const a = Math.random() * TAU;
        _pos.set(d.x + d.leanX * h + Math.cos(a) * r, h, d.z + d.leanZ * h + Math.sin(a) * r);
        // Whipped round tangentially, the way the column turns, and a little up.
        _dir.set(-Math.sin(a), 0.25, Math.cos(a));
        _emit.position = _pos;
        _emit.direction = _dir;
        _emit.speed = c.gritSpeed;
        _vel.set(d.vx, 0, d.vz);
        _emit.inherit = _vel;
        this.grit.emit(1, _emit);
      }
    }

    // The gust: a low streak of dust trailing the leader on its way out.
    if (this._clock < 0) {
      const gu = Math.round(this.gustEmitter.tick(dt, c.gustRate) * g.particleCount);
      if (gu > 0) {
        resetEmit(time);
        _pos.copy(this.position).setY(0.15);
        _emit.position = _pos;
        _emit.radius = 0.4;
        _emit.direction = _dir.copy(this.direction).negate().setY(0.3).normalize();
        _emit.speed = c.skirtSpeed * 1.5;
        _emit.spread = 0.5;
        _emit.size = c.skirtSize * 0.8;
        _emit.life = c.skirtLife * 0.7;
        _emit.spin = 0.5;
        _emit.anchor = _pos;
        this.skirt.emit(gu, _emit);
      }
    }
  }

  /** A devil reaching its place on the rim. */
  _arriveFx(d) {
    const c = settings[ID];
    _pos.set(d.x, 0.02, d.z);
    this.ctx.decals.spawn(DecalType.DUSTRING, _pos, {
      radius: c.arriveRing,
      life: 0.9,
      intensity: 0.7,
      colorA: getColor(c.colorSkirtB),
      colorB: getColor(c.colorSkirtC),
      growth: 0.4,
      height: 0.02
    });
  }

  /** A devil roping out: its dust drops. */
  _collapseFx(d) {
    const c = settings[ID];
    const g = settings.global;
    resetEmit(frame.uTime.value);
    _pos.set(d.x, 0.3, d.z);
    _emit.position = _pos;
    _emit.radius = c.baseRadius * 2;
    _emit.direction = _up;
    _emit.speed = c.skirtSpeed;
    _emit.spread = 1;
    _emit.size = c.skirtSize * 1.4;
    _emit.life = c.skirtLife * 1.3;
    _emit.spin = 0.4;
    _anchor.copy(_pos);
    _emit.anchor = _anchor;
    this.skirt.emit(Math.round(c.collapseDust * g.particleCount), _emit);
    this.ctx.decals.spawn(DecalType.DUSTRING, _pos.setY(0.02), {
      radius: c.arriveRing * 1.2,
      life: 1.2,
      intensity: 0.6,
      colorA: getColor(c.colorSkirtB),
      colorB: getColor(c.colorSkirtC),
      growth: 0.5,
      height: 0.02
    });
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    this._clock = -1;
    this._sync();
    this._updateDevils(dt);
    this.ctx.shake.rumble(c.travelRumble, dt);
    this.position.y = 0.8;
  }

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._clock = 0;
    this.pointAt(1, _centre);
    this.ctx.decals.spawn(DecalType.DUSTRING, _centre, {
      radius: c.zoneRadius * c.breakRing,
      life: 1.4,
      intensity: 0.85,
      colorA: getColor(c.colorSkirtA),
      colorB: getColor(c.colorSkirtC),
      growth: 0.4,
      height: 0.025
    });
    this.ctx.bursts.spawn(BurstMode.AIR, _pos.copy(_centre).setY(0.8), {
      radius: 0.3,
      endRadius: c.breakBurst * power,
      life: 0.55,
      intensity: 1,
      opacity: 0.6 * g.opacity,
      squash: 0.5,
      colorA: getColor(c.colorDustLight),
      colorB: getColor(c.colorDustMid),
      colorC: getColor(c.colorDustDark)
    });
    this.ctx.shake.add(c.breakShake * power, 1 / Math.max(0.05, c.breakShakeTime), 14);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.breakFlash * power);
    this.lightBoost = c.lightIntensity * c.breakLight * power;
    resetEmit(frame.uTime.value);
    _pos.copy(_centre).setY(0.2);
    _emit.position = _pos;
    _emit.radius = 0.8;
    _emit.direction = _up;
    _emit.speed = c.skirtSpeed * 2.5;
    _emit.spread = 1;
    _emit.size = c.skirtSize * 1.4;
    _emit.life = c.skirtLife;
    _emit.spin = 0.6;
    _anchor.copy(_pos);
    _emit.anchor = _anchor;
    this.skirt.emit(Math.round(c.breakDust * g.particleCount), _emit);
  }

  onFade(dt) {
    const c = settings[ID];
    this._clock = this.phase === AbilityPhase.FADE ? this.impactDuration + this.fadeTime : this.impactTime;
    this.pointAt(1, _centre);
    this._sync();
    this._updateDevils(dt);
    this._updateCaught(dt);
    this.position.set(_centre.x, c.lightHeight, _centre.z);
  }

  onDestroy() {
    this._clock = -1;
    this._releaseAll();
    this.funnelGeometry.instanceCount = 0;
    this.funnels.visible = false;
    this.swirl.visible = false;
    this.track.visible = false;
  }

  dispose() {
    this.funnelGeometry.dispose();
    this.trackGeometry.dispose();
    this.funnelMaterial.dispose();
    this.swirlMaterial.dispose();
    this.trackMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('≋  Dust Devil March');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'gust speed (m/s)');
  R(cast, c, 'zoneRadius', 1, 10, 0.05, 'circle radius (m)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'march lasts (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const march = folder.addFolder('1 · The march');
  R(march, c, 'devilCount', 1, MAX_DEVILS, 1, 'devils');
  R(march, c, 'marchRadius', 0.3, 1.5, 0.01, 'walk the rim at (× circle)');
  R(march, c, 'marchSpeed', -3, 3, 0.01, 'march (rad/s)');
  R(march, c, 'spreadTime', 0.05, 2, 0.01, 'race out to the rim over (s)');
  R(march, c, 'spawnStagger', 0, 0.5, 0.005, 'split one after another (s)');
  R(march, c, 'wander', 0, 2, 0.01, 'wander in and out (m)');
  R(march, c, 'wanderRate', 0, 6, 0.05, 'wander rate');
  R(march, c, 'lean', 0, 3, 0.01, 'lean into the walk');
  R(march, c, 'collapseTime', 0.1, 4, 0.05, 'one ropes out over (s)');
  R(march, c, 'collapseStagger', 0, 2, 0.01, 'roping out spreads over (s)');
  R(march, c, 'ropeStretch', 0, 1, 0.01, 'stretches as it ropes out');
  R(march, c, 'leadHeight', 0.3, 6, 0.05, 'gust devil height (m)');
  R(march, c, 'leadScale', 0.1, 1.5, 0.01, 'gust devil girth (×)');

  const shape = folder.addFolder('2 · Funnel');
  R(shape, c, 'heightMin', 0.5, 12, 0.05, 'shortest (m)');
  R(shape, c, 'heightMax', 0.5, 14, 0.05, 'tallest (m)');
  R(shape, c, 'baseRadius', 0.02, 1.5, 0.01, 'waist (m)');
  R(shape, c, 'topRadius', 0.1, 4, 0.01, 'crown (m)');
  R(shape, c, 'flare', 0.3, 4, 0.01, 'flare curve');
  R(shape, c, 'skirt', 0, 2, 0.01, 'skirt flare (m)');
  R(shape, c, 'skirtHeight', 0.02, 2, 0.01, 'skirt height (m)');
  R(shape, c, 'wobble', 0, 2, 0.01, 'snake (m)');
  R(shape, c, 'wobbleRate', 0, 6, 0.05, 'snake rate');
  R(shape, c, 'twist', -10, 10, 0.05, 'twist up the column (rad)');
  R(shape, c, 'bulge', 0, 0.6, 0.005, 'ragged');
  R(shape, c, 'veilScale', 0.5, 3, 0.01, 'veil (× core)');
  R(shape, c, 'spinRate', -30, 30, 0.1, 'spin (rad/s)');
  R(shape, c, 'veilSpin', 0, 2, 0.01, 'veil spin (× core)');

  const dust = folder.addFolder('3 · Dust');
  R(dust, c, 'density', 0, 2, 0.01, 'density');
  R(dust, c, 'dustOpacity', 0, 1, 0.01, 'opacity');
  R(dust, c, 'bandScale', 0.2, 6, 0.05, 'band scale');
  R(dust, c, 'bandShear', -20, 20, 0.1, 'band shear');
  R(dust, c, 'dustNoiseScale', 0.05, 4, 0.01, 'noise per metre');
  R(dust, c, 'edgeThickness', 0, 1, 0.01, 'thicker at the edges');
  R(dust, c, 'crownFade', 0.05, 1, 0.01, 'crown fades over');
  R(dust, c, 'softFade', 0.01, 2, 0.01, 'soft into the floor (m)');
  R(dust, c, 'dustLit', 0, 1.5, 0.01, 'sunlit side');
  dust.addColor(c, 'colorDustDark').name('dust, shade');
  dust.addColor(c, 'colorDustMid').name('dust');
  dust.addColor(c, 'colorDustLight').name('dust, sunlit');
  R(dust, c, 'swirlWarp', 0, 3, 0.01, 'air turns (distortion)');

  const track = folder.addFolder('4 · Track');
  R(track, c, 'trackWidth', 0.1, 4, 0.01, 'ring width (m)');
  R(track, c, 'trackOpacity', 0, 1, 0.01, 'worn');
  R(track, c, 'grooves', 1, 80, 1, 'rake grooves');
  R(track, c, 'grooveDepth', 0, 1, 0.01, 'groove contrast');
  R(track, c, 'churnRadius', 0.1, 4, 0.01, 'churn under a devil (m)');
  track.addColor(c, 'colorScour').name('scoured');
  track.addColor(c, 'colorGroove').name('grooves');
  track.addColor(c, 'colorChurn').name('churn');

  const fx = folder.addFolder('5 · Skirt, debris, grit');
  R(fx, c, 'skirtRate', 0, 200, 1, 'skirt / s per devil');
  R(fx, c, 'skirtSize', 0.05, 3, 0.01, 'skirt size');
  R(fx, c, 'skirtSpeed', 0, 6, 0.05, 'skirt speed');
  R(fx, c, 'skirtLife', 0.1, 5, 0.05, 'skirt life');
  R(fx, c, 'skirtRise', -1, 3, 0.01, 'skirt rise');
  R(fx, c, 'skirtSwirl', -15, 15, 0.1, 'skirt swirl (rad/s)');
  R(fx, c, 'skirtExpand', 0, 3, 0.01, 'skirt spreads');
  R(fx, c, 'skirtOpacity', 0, 1, 0.01, 'skirt opacity');
  Editor.gradient(fx, c, 'colorSkirt', 'skirt colour');
  R(fx, c, 'debrisRate', 0, 200, 1, 'debris / s per devil');
  R(fx, c, 'debrisSize', 0.01, 0.4, 0.005, 'debris size');
  R(fx, c, 'debrisRise', 0, 10, 0.05, 'debris rise');
  R(fx, c, 'debrisLife', 0.1, 4, 0.05, 'debris life');
  R(fx, c, 'debrisGravity', -5, 15, 0.1, 'debris gravity');
  R(fx, c, 'debrisSwirl', -20, 20, 0.1, 'debris swirl (rad/s)');
  R(fx, c, 'debrisExpand', 0, 3, 0.01, 'debris flung out');
  Editor.gradient(fx, c, 'colorDebris', 'debris colour');
  R(fx, c, 'gritRate', 0, 400, 1, 'grit / s per devil');
  R(fx, c, 'gritSize', 0.005, 0.2, 0.005, 'grit size');
  R(fx, c, 'gritSpeed', 0, 20, 0.1, 'grit speed');
  R(fx, c, 'gritLife', 0.05, 2, 0.01, 'grit life');
  R(fx, c, 'gritStretch', 0, 1, 0.01, 'grit stretch');
  R(fx, c, 'gritOpacity', 0, 1, 0.01, 'grit opacity');
  Editor.gradient(fx, c, 'colorGrit', 'grit colour');
  R(fx, c, 'gustRate', 0, 300, 1, 'gust dust / s');
  R(fx, c, 'collapseDust', 0, 80, 1, 'dust when one dies');
  R(fx, c, 'arriveRing', 0, 4, 0.05, 'dust ring at the rim (m)');

  const beat = folder.addFolder('6 · The break');
  R(beat, c, 'breakRing', 0, 2, 0.01, 'dust ring (× circle)');
  R(beat, c, 'breakBurst', 0, 8, 0.05, 'air shell (m)');
  R(beat, c, 'breakDust', 0, 200, 1, 'dust puff');
  R(beat, c, 'breakShake', 0, 1.5, 0.01, 'jolt');
  R(beat, c, 'breakShakeTime', 0.05, 2, 0.01, 'jolt lasts (s)');
  R(beat, c, 'breakFlash', 0, 1, 0.01, 'flash');
  R(beat, c, 'breakLight', 0, 6, 0.05, 'light punch (× intensity)');
  R(beat, c, 'marchRumble', 0, 1, 0.01, 'rumble while marching');
  R(beat, c, 'travelRumble', 0, 1, 0.01, 'rumble on the way');
  beat.addColor(c, 'colorFlash').name('flash');

  const hit = folder.addFolder('7 · Carried & flung');
  R(hit, c, 'catchRadius', 0.1, 4, 0.01, 'catches within (m)');
  R(hit, c, 'catchImpulse', 0, 10, 0.1, 'knocked round (m/s)');
  R(hit, c, 'catchLift', 0, 10, 0.05, 'snatched up (m/s)');
  R(hit, c, 'catchSpin', 0, 8, 0.05, 'tumble');
  R(hit, c, 'catchShake', 0, 1, 0.01, 'jolt');
  R(hit, c, 'holdTime', 0, 5, 0.05, 'carried for (s)');
  R(hit, c, 'carryGrab', 0, 1, 0.01, 'grip');
  R(hit, c, 'carrySwirl', 0, 20, 0.1, 'whirled round (m/s)');
  R(hit, c, 'carryPull', 0, 10, 0.05, 'pulled to the column');
  R(hit, c, 'carryOrbit', 0, 3, 0.01, 'orbit radius (m)');
  R(hit, c, 'carryLift', 0, 12, 0.05, 'lifted (m/s)');
  R(hit, c, 'carryCeiling', 0.1, 1, 0.01, 'up to (× height)');
  R(hit, c, 'carryBuoyancy', 0, 1, 0.01, 'weight carried');
  R(hit, c, 'flingSpeed', 0, 30, 0.1, 'flung out (m/s)');
  R(hit, c, 'flingUp', 0, 15, 0.1, 'flung up (m/s)');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightHeight', 0.1, 6, 0.05, 'height (m)');

  folder.close();
  return folder;
}
