import { InstancedMesh, Mesh, Object3D, Vector3 } from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { routeExpansionTransparency, ParticleShape } from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import {
  HORN_MOUTH,
  createConeGeometry,
  createHornGeometry,
  createQuad,
  createReedGeometry,
  createTapGeometry,
} from './geometry.js';
import {
  createConeMaterial,
  createFloorMaterial,
  createHornMaterial,
  createLensMaterial,
  createReedMaterial,
  createTapMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
export const UID = 'matrix-expansion/resonance-theft';

const TAU = Math.PI * 2;
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};

/** Enemies one horn can tap. */
const MAX_TAPS = 6;
/** Foreign attacks one horn can swallow. */
const MAX_STOLEN = 4;
/** Tethers drawn: one per tap and one per swallowed attack. */
const MAX_TETHERS = MAX_TAPS + MAX_STOLEN;
/** Reeds in the spectrum ring. */
const MAX_REEDS = 48;
/** Particles emitted by one call, at most (globals applied first). */
const MAX_EMIT = 96;

const _up = new Vector3(0, 1, 0);
const _pos = new Vector3();
const _dir = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _reed = new Object3D();
/** Reused particle option bag (the engine reads it, never retains it). */
const _emit = {};
/** Reused query point for the combat bridge (read immediately, never kept). */
const _query = [0, 0, 0];
/** Reused tether state handed to a tap material's sync. */
const _tap = {
  start: new Vector3(), ctrl: new Vector3(), end: new Vector3(),
  amp: 0, waves: 0, phase: 0, width: 0, reach: 0, packet: 0, glow: 0, fade: 0,
};

/**
 * RESONANCE THEFT — Sound, zone cast.
 *
 * The horn that listens. Everything other sound casts do is *emit*; this one
 * takes first. Beat by beat:
 *
 *   1. **anticipation** (`chargeTime`) — at the caster's hand a coiled shell,
 *      the horn wound tight, spins itself together while rings of sound
 *      converge on it.
 *   2. **travel** — the shell is thrown on a low arc (`arcHeight`) to the
 *      circle, spinning, trailing a corkscrew waveform wake back to the hand.
 *   3. **landing** — over `unfurlTime` the shell *unfurls* into the hero: a
 *      cochlear horn of dark lacquered bronze, sized from `zoneRadius`,
 *      hanging over the circle with its bell mouth-down. The floor darkens
 *      into a spectrogram, the spectrum ring of reeds grows up round the rim
 *      in a sweep, a knock and a light punch.
 *   4. **the listening** (`listenTime`, the first half of the linger) —
 *      every enemy in the circle is **tapped**: a corkscrew waveform ribbon
 *      reaches from its chest into the bell, packets of its sound running up
 *      it, rings drawn along it, while motes are sucked in from the rim and
 *      the air under the bell is drawn inward. The tube swells with a wave
 *      running *toward the apex* — it is swallowing. Each captured frequency
 *      lights one groove band on the horn (from the bell upward) and one
 *      bright groove on the floor; the reeds lean in and pump. Any attack
 *      another cast lands inside the circle is swallowed too: a tether from
 *      where it struck, a flash on the horn, one more band.
 *   5. **the playback** (the impact frame of the move) — the horn jumps, the
 *      wave reverses, a pressure cone drops from the bell to the floor, and
 *      every tapped enemy is struck once, outward, *harder for every
 *      frequency caught*. AIR shell, SHOCKWAVE and RIPPLE decals,
 *      interference rings on the floor, flash, camera knock, light punch,
 *      sparks off each body, rings thrown from the bell.
 *   6. **ring-down** (`ringTime`) — the swell decays, the reeds settle, the
 *      lit grooves hum and dim.
 *   7. **exit** (`exitTime`) — the horn coils back toward a shell, rising,
 *      and dissolves through noise from the bell up; the reeds sink; the
 *      floor dissolves.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the horn** (`createHornGeometry`, `createHornMaterial`) — lit,
 *      opaque, `LAYER.WORLD`, casts shadows. The silhouette and the storage
 *      meter of the theft.
 *   2. **the taps** (`createTapGeometry`, `createTapMaterial` ×10) — the
 *      theft made visible; also the flight wake.
 *   3. **the floor** (`createFloorMaterial`) — spectrogram stain, grooves,
 *      spectrum bars, captured rings, playback interference; dissolves out.
 *   4. **the spectrum ring** (`createReedGeometry`, `createReedMaterial`,
 *      instanced) — reeds round the rim, pumping.
 *   5. **the playback cone** (`createConeMaterial`).
 *   6. **particles** — RING (drawn along taps, converging at the hand, thrown
 *      from the bell), STREAK sparks (landing, struck bodies), SOFT motes
 *      (drawn in from the rim, trailing the shell).
 *   7. **the beats** — AIR shell, SHOCKWAVE / RIPPLE / DUSTRING decals,
 *      flash, knock, light punch.
 *   8. **the lens** (`createLensMaterial`, `LAYER.DISTORTION`).
 *
 * ## Gameplay (`handlesOwnHits`)
 *
 * While listening, every `scanInterval` the horn taps enemies inside
 * `zoneRadius` (up to `maxTaps`; through the combat binding a tapped enemy is
 * marked `resonating`). With `stealAttacks` on, each committed hit another
 * cast lands inside the circle during the listening is captured (up to
 * `maxStolen`). At the end of `listenTime` every tapped enemy is struck once:
 * `damage = min(maxDamage, baseDamage + damagePerFrequency·(N−1))` and
 * knockback × `min(maxAmplify, 1 + amplifyPerFrequency·(N−1))`, where `N` is
 * taps + captured attacks. Nothing is struck twice; nothing is struck before
 * the playback.
 *
 * ## The editor rule
 *
 * A record holds dice and events only: who was tapped and where it stood,
 * the tap time, a seed. Every metre, second and colour is read from
 * `settings.resonanceTheft` every frame; the horn, bell, reeds, cone, floor
 * and tethers are all placed from `zoneRadius`, so dragging the radius
 * mid-cast keeps every tether ending in the bell.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._reedsDrawn + this._tapCount + this._stolenCount + 1;
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get impactDuration() {
    const c = this.config;
    return Math.max(0.2, c.listenTime) + c.ringTime * settings.global.lifetime;
  }

  get fadeDuration() {
    return Math.max(0.05, this.config.exitTime * settings.global.lifetime);
  }

  _chargeTime() {
    return Math.max(0, this.config.chargeTime * settings.global.lifetime);
  }

  /** Hold the front at the hand while the shell winds itself together. */
  advance(dt) {
    if (this.age < this._chargeTime()) {
      this.pointAt(0, this.position);
      return false;
    }
    return super.advance(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.resources = [];
    const own = (x) => {
      this.resources.push(x);
      return x;
    };
    const quad = own(createQuad());

    // 3 · the floor
    this.floorMat = own(createFloorMaterial());
    this.floor = new Mesh(quad, this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.renderOrder = 3;
    this.floor.frustumCulled = false;
    this.group.add(this.floor);

    // 1 · the horn — solid, lit, casts shadows
    this.hornMat = own(createHornMaterial());
    this.horn = new Mesh(own(createHornGeometry()), this.hornMat);
    this.horn.castShadow = true;
    this.horn.receiveShadow = true;
    this.horn.frustumCulled = false;
    this.group.add(this.horn);

    // 2 · the taps, and the flight wake
    const tapGeometry = own(createTapGeometry());
    this.tethers = [];
    for (let i = 0; i < MAX_TETHERS + 1; i++) {
      const mat = own(createTapMaterial());
      const mesh = new Mesh(tapGeometry, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 8;
      mesh.visible = false;
      this.group.add(mesh);
      this.tethers.push(mesh);
    }
    this.wake = this.tethers[MAX_TETHERS];

    // 4 · the spectrum ring
    this.reedMat = own(createReedMaterial());
    this.reeds = new InstancedMesh(own(createReedGeometry()), this.reedMat, MAX_REEDS);
    this.reeds.frustumCulled = false;
    this.reeds.renderOrder = 6;
    this.reeds.count = 0;
    this.group.add(this.reeds);

    // 5 · the playback cone
    this.coneMat = own(createConeMaterial());
    this.cone = new Mesh(own(createConeGeometry()), this.coneMat);
    this.cone.frustumCulled = false;
    this.cone.renderOrder = 7;
    this.cone.visible = false;
    this.group.add(this.cone);

    // 8 · the lens
    this.lensMat = own(createLensMaterial());
    this.lens = new Mesh(quad, this.lensMat);
    this.lens.rotation.x = -Math.PI / 2;
    this.lens.frustumCulled = false;
    this.lens.visible = false;
    this.group.add(this.lens);

    // Pooled records: dice and events only.
    this._taps = [];
    for (let i = 0; i < MAX_TAPS; i++) {
      this._taps.push({ active: false, id: null, dummy: null, x: 0, z: 0, at: 0, seed: 0, emitter: new RateEmitter() });
    }
    this._stolen = [];
    for (let i = 0; i < MAX_STOLEN; i++) {
      this._stolen.push({ active: false, x: 0, z: 0, at: 0, seed: 0, emitter: new RateEmitter() });
    }
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._hand = new Vector3();
    this._mouth = new Vector3();
    this._shell = new Vector3();
    this._gather = new RateEmitter();
    this._trail = new RateEmitter();
    this._draw = new RateEmitter();
    this._hum = new RateEmitter();
    this._tapCount = 0;
    this._stolenCount = 0;
    this._reedsDrawn = 0;
    this._hornState = { phase: 0, litBands: 0, listen: 0, flow: 0, play: 0, steal: 0, dissolve: 0, swell: 0 };
    this._floorState = { clock: 0, energy: 0, listen: 0, captured: 0, wave: -1, spin: 0, dissolve: 0, fade: 1 };
    this._reedState = { fade: 1 };
    this._coneState = { topY: 1, topR: 1, footR: 1, progress: 0, fade: 1 };
    this._lensState = { draw: 0, shock: 0, wave: 0, clock: 0 };
    this._onForeignHit = (event) => this._capture(event);

    routeExpansionTransparency(this.group);
    this.lens.layers.set(LAYER.DISTORTION);
    this.horn.layers.set(LAYER.WORLD);
    this._disposed = false;
  }

  createParticles() {
    const p = this.ctx.particles;
    this.ringFx = p?.get?.(`${ID}.rings`, { capacity: 320, shape: ParticleShape.RING, additive: true, softFade: 0.3 }) ?? null;
    this.sparkFx = p?.get?.(`${ID}.sparks`, { capacity: 384, shape: ParticleShape.STREAK, additive: true, stretch: true, softFade: 0.3 }) ?? null;
    this.moteFx = p?.get?.(`${ID}.motes`, { capacity: 448, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.5 }) ?? null;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this._calm = prefersReducedMotion();
    this._clock = 0;
    this._spin = 0;
    this._ripple = 0;
    this._flow = 0;
    this._packet = 0;
    this._helix = 0;
    this._scanTimer = 0;
    this._played = false;
    this._sincePlay = 0;
    this._landed = false;
    this._steal = 0;
    this._tapCount = 0;
    this._stolenCount = 0;
    this._struck = 0;
    this._lastDamage = 0;
    this._lastAmplify = 1;
    for (const t of this._taps) { t.active = false; t.id = null; t.dummy = null; t.emitter.reset(); }
    for (const s of this._stolen) { s.active = false; s.emitter.reset(); }
    this._gather.reset();
    this._trail.reset();
    this._draw.reset();
    this._hum.reset();
    this._floorState.spin = 0;
    this._subscription = null;
    if (this._scope && this.config.stealAttacks) {
      const sub = this._scope.on('hit', this._onForeignHit);
      if (sub?.ok) this._subscription = sub;
    }
    this._placeHand();
    this.horn.visible = true;
    this.floor.visible = false;
    this.reeds.count = 0;
    this.cone.visible = false;
    this.lens.visible = false;
    for (const t of this.tethers) t.visible = false;
    this._sync(0);
  }

  onTravel(dt) {
    const c = this.config;
    // Rings converge on the hand while the shell winds itself together.
    if (this.age < this._chargeTime()) {
      this._emitRings(this._gather.tick(dt, c.gatherRate), this._hand, 0.55, _up, 0.25, 1, c.ringSize * 0.7, c.ringLife * 0.6);
    } else {
      _dir.set(0, 1, 0);
      this._emitMotes(this._trail.tick(dt, c.moteRate * 1.5), this._shell, 0.12, _dir, 0.4, 1, c.moteSize, c.moteLife * 0.6);
    }
    this._sync(dt);
  }

  onImpact() {
    const c = this.config;
    const g = settings.global;
    this._landed = true;
    // The light rides at chest height under the bell.
    this.position.y = c.chestHeight;
    this.lightBoost = c.landLight * g.explosionIntensity;
    this._placeMouth();
    _pos.set(this.position.x, 0.05, this.position.z);
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: c.zoneRadius * 0.7, life: 0.6, width: c.shockwaveWidth, intensity: c.shockwaveIntensity * 0.7,
      colorA: getColor(c.colorTint), colorB: getColor(c.colorBody),
    });
    if (c.landShake > 0) this.ctx.shake?.add?.(c.landShake * g.cameraShake, c.shakeDecay, c.shakeFrequency);
    _dir.set(0, 1, 0);
    this._emitSparks(c.sparkCount, _pos, c.zoneRadius * 0.15, _dir, c.sparkSpeed * 0.6, 0.9, c.sparkSize, c.sparkLife);
    this._sync(0);
  }

  onFade(dt) {
    const c = this.config;
    if (!this._played) {
      this._scanTimer -= dt;
      if (this._scanTimer <= 0) {
        this._scanTimer = Math.max(0.02, c.scanInterval);
        this._scan();
      }
      if (this.impactTime >= Math.max(0.2, c.listenTime)) {
        this._played = true;
        this._sincePlay = 0;
        this._playback();
      }
    } else {
      this._sincePlay += dt;
    }
    this._emitListening(dt);
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The theft — gameplay                                                */
  /* ------------------------------------------------------------------ */

  _listening() {
    return this._landed && !this._played && this.phase === 'impact';
  }

  _tapLimit() {
    return Math.max(0, Math.min(MAX_TAPS, Math.floor(this.config.maxTaps)));
  }

  /** Tap every new enemy inside the circle (bounded). */
  _scan() {
    const c = this.config;
    const limit = this._tapLimit();
    if (this._tapCount >= limit) return;
    const r = c.zoneRadius;
    const cx = this.position.x, cz = this.position.z;
    if (this._scope) {
      _query[0] = cx; _query[1] = 0; _query[2] = cz;
      const found = this._scope.queryActors({ position: _query, radius: r, relation: 'enemy' });
      if (!found?.ok) { this.failure = found?.reason ?? 'query failed'; return; }
      for (const actor of found.actors) {
        if (this._tapCount >= limit) break;
        if (this._tapped(actor.id, null)) continue;
        const tap = this._newTap(actor.id, null, actor.position[0], actor.position[2]);
        const ticks = Math.max(1, Math.round(c.tapStatusTime * (this._scope.tickRate || 30)));
        // Marked while it is being drained (combat only; standalone refuses statuses).
        this._scope.emit({
          type: 'status', element: 'sound', targetIds: [tap.id], position: [tap.x, 0, tap.z],
          durationTicks: ticks, tags: ['resonance-theft', 'tapped'],
        });
      }
      return;
    }
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(cx, cz, r, this._found);
    for (const dummy of found) {
      if (this._tapCount >= limit) break;
      if (!dummy || dummy.alive === false || !dummy.position) continue;
      const dx = dummy.position.x - cx, dz = dummy.position.z - cz;
      if (dx * dx + dz * dz > r * r) continue;
      if (this._tapped(null, dummy)) continue;
      this._newTap(null, dummy, dummy.position.x, dummy.position.z);
    }
  }

  _tapped(id, dummy) {
    for (let i = 0; i < this._tapCount; i++) {
      const t = this._taps[i];
      if ((id !== null && t.id === id) || (dummy !== null && t.dummy === dummy)) return true;
    }
    return false;
  }

  _newTap(id, dummy, x, z) {
    const t = this._taps[this._tapCount];
    t.active = true;
    t.id = id;
    t.dummy = dummy;
    t.x = x;
    t.z = z;
    t.at = this.impactTime;
    t.seed = (this._tapCount * 0.618034 + 0.137) % 1;
    t.emitter.reset();
    this._tapCount++;
    return t;
  }

  /** A committed hit from another cast: swallow it if it landed in the circle. */
  _capture(event) {
    const c = this.config;
    if (!c.stealAttacks || !this._listening() || !event || event.abilityUid === UID) return;
    const limit = Math.max(0, Math.min(MAX_STOLEN, Math.floor(c.maxStolen)));
    if (this._stolenCount >= limit) return;
    const p = event.position;
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[2])) return;
    const dx = p[0] - this.position.x, dz = p[2] - this.position.z;
    if (dx * dx + dz * dz > c.zoneRadius * c.zoneRadius) return;
    const s = this._stolen[this._stolenCount++];
    s.active = true;
    s.x = p[0];
    s.z = p[2];
    s.at = this.impactTime;
    s.seed = (this._stolenCount * 0.414214 + 0.71) % 1;
    s.emitter.reset();
    this._steal = 1;
  }

  /** Captured frequencies: taps plus swallowed attacks. */
  get captured() {
    return this._tapCount + this._stolenCount;
  }

  /** The playback: every tapped enemy struck once, scaled by what was caught. */
  _playback() {
    const c = this.config;
    const g = settings.global;
    const n = Math.max(1, this.captured);
    const damage = Math.min(c.maxDamage, c.baseDamage + c.damagePerFrequency * (n - 1));
    const amplify = Math.min(c.maxAmplify, 1 + c.amplifyPerFrequency * (n - 1));
    this._lastDamage = damage;
    this._lastAmplify = amplify;
    this._unsubscribe();
    this._playbackFX(n);
    const cx = this.position.x, cz = this.position.z;
    if (this._scope) {
      for (let i = 0; i < this._tapCount; i++) {
        const t = this._taps[i];
        if (!t.id) continue;
        const sent = this._scope.emit({
          type: 'hit', element: 'sound', targetIds: [t.id],
          position: [t.x, 0, t.z], sourcePosition: [cx, 0, cz], damage,
          hitForce: impactForce(c, g.explosionIntensity * amplify), tags: ['resonance-theft', 'playback'],
        });
        if (!sent.ok) this.failure = sent.reason;
        else this._struck++;
      }
      return;
    }
    const force = impactForce(c, g.explosionIntensity * amplify);
    this._force.impulse = force.impulse;
    this._force.lift = force.lift;
    this._force.spin = force.spin;
    for (let i = 0; i < this._tapCount; i++) {
      const t = this._taps[i];
      const dummy = t.dummy;
      if (!dummy || dummy.alive === false) continue;
      _dir.set(dummy.position.x - cx, 0, dummy.position.z - cz);
      if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction);
      else _dir.normalize();
      if (dummy.kill(_dir.x, _dir.z, this._force)) this._struck++;
    }
  }

  _unsubscribe() {
    this._subscription?.unsubscribe?.();
    this._subscription = null;
  }

  /* ------------------------------------------------------------------ */
  /* Beats and particles                                                 */
  /* ------------------------------------------------------------------ */

  _playbackFX(n) {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const r = c.zoneRadius;
    this.lightBoost = c.playLight * power * (0.8 + 0.05 * n);
    _pos.set(this.position.x, 0.05, this.position.z);
    this.ctx.bursts?.spawn?.(BurstMode.AIR, _pos, {
      radius: r * 0.1, endRadius: r * c.burstReach * power, life: c.burstLife,
      intensity: c.burstIntensity, opacity: c.burstOpacity * g.opacity, fresnel: c.burstFresnel, squash: c.burstSquash,
      colorA: getColor(c.colorCore), colorB: getColor(c.colorBody), colorC: getColor(c.colorDeep),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: r * 1.1 * power, life: 0.7, width: c.shockwaveWidth, intensity: c.shockwaveIntensity,
      colorA: getColor(c.colorCore), colorB: getColor(c.colorBody),
    });
    this.ctx.decals?.spawn?.(DecalType.RIPPLE, _pos, {
      radius: r * 0.95, life: c.decalLife, intensity: c.rippleIntensity,
      colorA: getColor(c.colorBody), colorB: getColor(c.colorDeep),
    });
    if (c.playShake > 0) this.ctx.shake?.add?.(c.playShake * power * g.cameraShake, c.shakeDecay, c.shakeFrequency);
    if (c.playFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorTint), c.playFlash * power);
    // Rings out of the bell, straight down and spreading.
    _dir.set(0, -1, 0);
    this._emitRings(c.playRingCount, this._mouth, 0.3, _dir, c.zoneRadius * 2.2, 0.75, c.ringSize * 1.6, c.ringLife);
    // Sparks off every struck body, thrown away from the bell, and a dust ring.
    for (let i = 0; i < this._tapCount; i++) {
      const t = this._taps[i];
      this._tapPoint(t, _a);
      _dir.set(_a.x - this.position.x, 0.35, _a.z - this.position.z).normalize();
      this._emitSparks(c.sparkCount, _a, 0.25, _dir, c.sparkSpeed, 0.5, c.sparkSize, c.sparkLife);
      _b.set(_a.x, 0.04, _a.z);
      this.ctx.decals?.spawn?.(DecalType.DUSTRING, _b, {
        radius: 1.1, life: 0.9, intensity: 0.8, colorA: getColor(c.colorTint), colorB: getColor(c.colorDeep),
      });
    }
  }

  /** Continuous emission while the horn is down. */
  _emitListening(dt) {
    const c = this.config;
    if (!this._played) {
      // Rings drawn up each tap into the bell.
      for (let i = 0; i < this._tapCount; i++) this._drawAlong(this._taps[i], dt);
      for (let i = 0; i < this._stolenCount; i++) this._drawAlong(this._stolen[i], dt);
      // Motes sucked in from a point sweeping round the rim.
      const n = this._draw.tick(dt, c.moteRate);
      if (n > 0) {
        const a = this._clock * 2.3;
        const r = c.zoneRadius * 0.95;
        _pos.set(this.position.x + Math.cos(a) * r, 0.2, this.position.z + Math.sin(a) * r);
        _dir.subVectors(this._mouth, _pos).normalize();
        this._emitMotes(n, _pos, 0.35, _dir, c.moteSpeed, 0.18, c.moteSize, c.moteLife);
        _pos.set(this.position.x - Math.cos(a) * r, 0.2, this.position.z - Math.sin(a) * r);
        _dir.subVectors(this._mouth, _pos).normalize();
        this._emitMotes(n, _pos, 0.35, _dir, c.moteSpeed, 0.18, c.moteSize, c.moteLife);
      }
    } else if (this.phase === 'impact') {
      // The bell hums out its last rings through the ring-down.
      _dir.set(0, -1, 0);
      const n = this._hum.tick(dt, 7 * Math.exp(-this._sincePlay * 2));
      this._emitRings(n, this._mouth, 0.2, _dir, 1.6, 0.6, c.ringSize * 1.2, c.ringLife);
    }
  }

  _drawAlong(rec, dt) {
    const c = this.config;
    const reach = clamp((this.impactTime - rec.at) / Math.max(0.05, c.tapReach));
    if (reach < 1) return;
    const n = rec.emitter.tick(dt, c.ringRate);
    if (n <= 0) return;
    this._recPoint(rec, _a);
    _dir.subVectors(this._mouth, _a);
    const dist = _dir.length();
    _dir.divideScalar(Math.max(1e-4, dist));
    this._emitRings(n, _a, 0.1, _dir, dist / Math.max(0.05, c.ringLife), 0.05, c.ringSize, c.ringLife);
  }

  _emit(system, count, position, radius, direction, speed, spread, size, life, spin) {
    if (!system || count <= 0) return;
    const g = settings.global;
    const n = Math.min(MAX_EMIT, Math.round(count * g.particleCount));
    if (n <= 0) return;
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = speed * g.particleSpeed;
    _emit.speedVariance = 0.3;
    _emit.spread = spread;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = size * g.particleSize;
    _emit.sizeVariance = 0.4;
    _emit.life = life * g.particleLifetime;
    _emit.lifeVariance = 0.3;
    _emit.spin = spin;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    system.emit(n, _emit);
  }

  _emitRings(n, p, radius, dir, speed, spread, size, life) { this._emit(this.ringFx, n, p, radius, dir, speed, spread, size, life, 0); }
  _emitSparks(n, p, radius, dir, speed, spread, size, life) { this._emit(this.sparkFx, n, p, radius, dir, speed, spread, size, life, 0); }
  _emitMotes(n, p, radius, dir, speed, spread, size, life) { this._emit(this.moteFx, n, p, radius, dir, speed, spread, size, life, 1.5); }

  /** Push the ramp and globals into the three particle systems. */
  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    const core = getColor(c.colorCore), tint = getColor(c.colorTint), body = getColor(c.colorBody), deep = getColor(c.colorDeep);
    for (const fx of [this.ringFx, this.sparkFx, this.moteFx]) {
      if (!fx?.uniforms) continue;
      fx.setGradient?.(core, tint, body, deep);
      const u = fx.uniforms;
      if (u.uGlow) u.uGlow.value = c.particleGlow * g.glow;
      if (u.uOpacity) u.uOpacity.value = g.opacity;
      if (u.uTurbulence) u.uTurbulence.value = 0.4 * g.turbulence;
    }
    const ru = this.ringFx?.uniforms;
    if (ru) {
      ru.uGravity?.value.set(0, 0, 0);
      if (ru.uDrag) ru.uDrag.value = 0.2;
      // Rings shrink as they are swallowed, and swell when they are played back.
      if (ru.uEndSize) ru.uEndSize.value = this._played ? 2.4 : 0.3;
    }
    const su = this.sparkFx?.uniforms;
    if (su) {
      su.uGravity?.value.set(0, -7, 0);
      if (su.uDrag) su.uDrag.value = 1.2;
      if (su.uStretch) su.uStretch.value = 0.22;
    }
    const mu = this.moteFx?.uniforms;
    if (mu) {
      mu.uGravity?.value.set(0, 0.3, 0);
      if (mu.uDrag) mu.uDrag.value = 0.4;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Placement — derived from settings every frame                       */
  /* ------------------------------------------------------------------ */

  _placeHand() {
    _pos.copy(this.origin).addScaledVector(this.direction, 0.45).addScaledVector(this.side, 0.3);
    this._hand.set(_pos.x, 1.45, _pos.z);
  }

  _hornSize() {
    const c = this.config;
    return Math.max(0.2, c.zoneRadius * c.hornScale);
  }

  /** The bell's mouth: centred over the circle, high enough for the bell to clear a body. */
  _mouthHeight() {
    const c = this.config;
    return c.chestHeight + 0.35 + c.hornLift;
  }

  _placeMouth() {
    this._mouth.set(this.position.x, this._mouthHeight() + this._hornSize() * 0.12, this.position.z);
  }

  /** Where a tapped body is tapped (its chest; live if it still stands). */
  _tapPoint(t, out) {
    const p = t.dummy?.position;
    return out.set(p ? p.x : t.x, this.config.chestHeight, p ? p.z : t.z);
  }

  _recPoint(rec, out) {
    if (rec.emitter && 'dummy' in rec) return this._tapPoint(rec, out);
    return out.set(rec.x, 0.25, rec.z);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const r = c.zoneRadius;
    const calm = this._calm;
    const anim = dt * g.animationSpeed;
    this._clock += anim;
    const clock = this._clock;
    const charge = this._chargeTime();
    const size = this._hornSize();
    const fadeT = this.phase === 'fade' ? clamp(this.fadeTime / this.fadeDuration) : 0;
    const fade = 1 - fadeT;
    const listening = this._listening();
    const since = this._played ? this._sincePlay : -1;
    const ringT = this._played ? clamp(since / Math.max(0.05, c.ringTime * g.lifetime)) : 0;
    const unfurl = this._landed ? clamp(this.impactTime / Math.max(0.05, c.unfurlTime * g.lifetime)) : 0;
    if (this._landed) this._placeMouth();
    const mouthY = this._mouthHeight();

    /* 1 · the horn ------------------------------------------------------ */
    const shell = Math.max(0.05, c.shellSize);
    const horn = this.horn;
    if (!this._landed) {
      if (this.age < charge) {
        // Wound together at the hand.
        const k = smooth(this.age / Math.max(0.01, charge));
        this._shell.copy(this._hand);
        horn.scale.setScalar(Math.max(0.001, shell * (0.2 + 0.8 * Easing.outBack(k))));
      } else {
        // Thrown on an arc from the hand to over the circle.
        const k = this.u;
        this.pointAt(1, _pos);
        _pos.y = mouthY + size * 0.12;
        this._shell.lerpVectors(this._hand, _pos, k);
        this._shell.y += Math.sin(Math.PI * k) * c.arcHeight;
        horn.scale.setScalar(shell);
      }
      if (!calm) this._spin += anim * c.flightSpin * TAU;
      horn.position.copy(this._shell);
      horn.rotation.set(0.5 * Math.sin(clock * 3), this._spin, 0.35);
    } else {
      // Unfurl, listen, play back, ring down, coil away.
      const grow = Easing.outBack(unfurl);
      const kick = this._played ? c.playbackKick * Math.exp(-since * 9) * Math.cos(since * 40) : 0;
      let scale = shell + (size - shell) * grow;
      scale *= 1 + kick;
      // Exit: coils back toward a shell and rises as it dissolves.
      const coil = Easing.inCubic(fadeT);
      scale = scale + (shell * 2 - scale) * coil * 0.6;
      if (!calm) this._spin += anim * TAU * (c.spinRate * (listening ? 1 : 0.5) + (1 - unfurl) * 1.5 + coil * 2);
      horn.scale.setScalar(Math.max(0.001, scale));
      horn.position.set(this.position.x, mouthY + fadeT * fadeT * 1.4, this.position.z);
      // The unfurl unwinds the coil; the bell settles to mouth-down.
      horn.rotation.set(0.35 * (1 - unfurl), this._spin, 0.35 * (1 - unfurl));
    }
    // The swell runs toward the apex while it listens, out of the bell after.
    const speed = c.rippleSpeed * (this._played ? -2.2 : 1);
    if (!calm) this._ripple += anim * speed;
    this._flow += anim * (this._played ? -3 : 2.2);
    this._steal = Math.max(0, this._steal - dt * 3);
    const hs = this._hornState;
    hs.phase = this._ripple;
    hs.swell = calm ? 0 : (this._landed ? (listening ? 0.6 + 0.4 * unfurl : 1.6 * Math.exp(-Math.max(0, since) * 2.5)) * fade : 0.4);
    hs.litBands = this._litBands();
    hs.listen = listening ? 1 : 0;
    hs.flow = this._flow;
    hs.play = this._played ? Math.exp(-since * 5) : 0;
    hs.steal = this._steal;
    hs.dissolve = smooth((fadeT - 0.1) / 0.85);
    this.hornMat.userData.sync(hs);

    /* 2 · the taps and the wake ---------------------------------------- */
    this._helix += anim * TAU * (this._played ? -2.5 : 1.4);
    this._packet += anim * c.tapFlow * (this._played ? -2 : 1);
    for (let i = 0; i < MAX_TETHERS; i++) {
      const mesh = this.tethers[i];
      const isTap = i < MAX_TAPS;
      const rec = isTap ? this._taps[i] : this._stolen[i - MAX_TAPS];
      const live = isTap ? i < this._tapCount : i - MAX_TAPS < this._stolenCount;
      const after = this._played ? clamp(since / 0.45) : 0;
      mesh.visible = live && after < 1 && this._landed;
      if (!mesh.visible) continue;
      this._recPoint(rec, _tap.start);
      _tap.end.copy(this._mouth);
      const rise = _tap.end.y - _tap.start.y;
      _tap.ctrl.lerpVectors(_tap.start, _tap.end, 0.5);
      _tap.ctrl.y += Math.max(0.4, rise * c.tapSag + 0.5);
      _tap.amp = c.tapAmplitude * (isTap ? 1 : 0.7);
      _tap.waves = c.tapWaves + (isTap ? i : 0.5 + i - MAX_TAPS);
      _tap.phase = this._helix * (1 + rec.seed * 0.5);
      _tap.width = c.tapWidth * (isTap ? 1 : 0.8);
      _tap.reach = clamp((this.impactTime - rec.at) / Math.max(0.05, c.tapReach));
      _tap.packet = this._packet;
      _tap.glow = c.tapGlow * (1 + (this._played ? 2.5 * (1 - after) : 0));
      _tap.fade = (1 - after) * fade;
      mesh.material.userData.sync(_tap);
    }
    const wakeT = this._landed ? clamp(this.impactTime / 0.3) : 0;
    this.wake.visible = this.age >= charge && wakeT < 1;
    if (this.wake.visible) {
      _tap.start.copy(this._hand);
      _tap.end.copy(this._landed ? horn.position : this._shell);
      _tap.ctrl.lerpVectors(_tap.start, _tap.end, 0.5);
      _tap.ctrl.y += c.arcHeight * 2 * Math.min(1, this.u * 1.2);
      _tap.amp = c.tapAmplitude * 0.6;
      _tap.waves = c.tapWaves * 1.5;
      _tap.phase = this._helix;
      _tap.width = c.wakeWidth;
      _tap.reach = 1;
      _tap.packet = -this._packet;
      _tap.glow = c.tapGlow;
      _tap.fade = 1 - wakeT;
      this.wake.material.userData.sync(_tap);
    }

    /* 3 · the floor ----------------------------------------------------- */
    this.floor.visible = this._landed;
    if (this._landed) {
      const grow = 0.25 + 0.75 * Easing.outCubic(unfurl);
      this.floor.position.set(this.position.x, 0.03, this.position.z);
      this.floor.scale.set(r * 2 * grow, r * 2 * grow, 1);
      const fs = this._floorState;
      fs.clock = calm ? 0 : clock;
      fs.energy = smooth(unfurl * 1.5);
      fs.listen = listening ? 1 : Math.max(0, 1 - ringT) * 0.6;
      fs.captured = this._litBands();
      fs.wave = this._played ? Math.min(1, since * c.floorWaveSpeed * 0.6) : -1;
      if (!calm) fs.spin += anim * (listening ? 0.6 : 0.15);
      fs.dissolve = smooth(fadeT / Math.max(0.05, c.floorDissolve));
      fs.fade = 1;
      this.floorMat.userData.sync(fs);
    }

    /* 4 · the spectrum ring -------------------------------------------- */
    const count = this._landed ? Math.max(0, Math.min(MAX_REEDS, Math.floor(c.reedCount))) : 0;
    this._reedsDrawn = count;
    this.reeds.count = count;
    if (count > 0) {
      const ringR = r * 0.98;
      const lean = (listening ? c.reedLean : c.reedLean * 0.3 * (1 - ringT)) * (calm ? 0.5 : 1);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU;
        // Sweep up round the rim on landing; sink in a sweep on exit.
        const rise = smooth((this.impactTime - 0.06 - 0.28 * (i / count)) / 0.22);
        const sink = 1 - smooth((fadeT - 0.4 * (i / count)) / 0.5);
        const s1 = Math.sin(clock * (5 + (i % 7)) + i * 1.7);
        const s2 = Math.sin(clock * 2.3 + i * 0.61);
        let pump = 0.35 + 0.65 * Math.abs(s1 * 0.6 + s2 * 0.4) * c.reedPump;
        if (this._played) pump = pump * (1 - Math.exp(-since * 3)) + 1.3 * Math.exp(-since * 3);
        if (calm) pump = 0.6;
        const h = Math.max(0.001, c.reedHeight * pump * rise * sink);
        _reed.position.set(this.position.x + Math.cos(a) * ringR, 0, this.position.z + Math.sin(a) * ringR);
        _reed.rotation.set(0, Math.PI / 2 - a, 0);
        // Lean in toward the horn (rotate about the tangent).
        _reed.rotateX(-lean * rise);
        _reed.scale.set(c.reedWidth, h, c.reedWidth * 0.8);
        _reed.updateMatrix();
        this.reeds.setMatrixAt(i, _reed.matrix);
      }
      this.reeds.instanceMatrix.needsUpdate = true;
      this._reedState.fade = 1;
      this.reedMat.userData.sync(this._reedState);
    }

    /* 5 · the playback cone -------------------------------------------- */
    const coneT = this._played ? since / Math.max(0.05, c.coneLife) : 1;
    this.cone.visible = coneT < 1;
    if (this.cone.visible) {
      this.cone.position.set(this.position.x, 0, this.position.z);
      const cs = this._coneState;
      cs.topY = mouthY;
      cs.topR = horn.scale.x * HORN_MOUTH * 0.95;
      cs.footR = r * c.coneSpread;
      cs.progress = clamp(coneT);
      cs.fade = 1;
      this.coneMat.userData.sync(cs);
    }

    /* 6 · particles ------------------------------------------------------ */
    this._syncParticles();

    /* 8 · the lens ------------------------------------------------------- */
    const ls = this._lensState;
    ls.draw = listening ? smooth(unfurl) : 0;
    ls.shock = this._played ? Math.max(0, 1 - since / 0.6) * fade : 0;
    ls.wave = this._played ? Easing.outCubic(clamp(since / 0.6)) : 0;
    ls.clock = clock;
    this.lens.visible = this._landed && !calm && (ls.draw * c.lensDraw + ls.shock * c.lensShock) * g.distortion > 0.002;
    if (this.lens.visible) {
      this.lens.position.set(this.position.x, 0.3, this.position.z);
      this.lens.scale.set(r * 2.2, r * 2.2, 1);
      this.lensMat.userData.sync(ls);
    }
  }

  /** Groove bands lit: captured frequencies whose tether has reached the bell. */
  _litBands() {
    const reach = Math.max(0.05, this.config.tapReach);
    let lit = 0;
    for (let i = 0; i < this._tapCount; i++) if (this.impactTime - this._taps[i].at >= reach) lit++;
    for (let i = 0; i < this._stolenCount; i++) if (this.impactTime - this._stolen[i].at >= reach) lit++;
    return lit;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._unsubscribe();
    this._scope = null;
    this.horn.visible = false;
    this.floor.visible = false;
    this.cone.visible = false;
    this.lens.visible = false;
    this.reeds.count = 0;
    for (const t of this.tethers) t.visible = false;
    for (const t of this._taps) { t.active = false; t.dummy = null; t.id = null; }
    for (const s of this._stolen) s.active = false;
    this._tapCount = 0;
    this._stolenCount = 0;
    this._played = false;
    this._landed = false;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._unsubscribe();
    for (const r of this.resources) r.dispose();
    this.reeds.dispose?.();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

/** Editor helpers that degrade to the dev harness's minimal shim. */
function editorKit(Editor) {
  const R = Editor?.range ?? ((f, c, k, min, max, step, label) => f.add(c, k, min, max, step).name?.(label ?? k));
  const sub = (parent, title) => (typeof parent.addFolder === 'function' ? parent.addFolder(title) : parent);
  const color = (f, c, k, label) => f.addColor(c, k).name?.(label ?? k);
  const castAnim = (f, c) => (Editor?.castAnimation ? Editor.castAnimation(f, c) : f.add(c, 'castAnim', CAST_ANIMATIONS));
  return { R, sub, color, castAnim };
}

export function buildEditor(gui, c, Editor) {
  const { R, sub, color, castAnim } = editorKit(Editor);
  const folder = gui.addFolder('◎  Resonance Theft');

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 80, 0.5, 'shell flies at (m/s)');
  R(cast, c, 'lifetime', 0.2, 8, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'cooldown', 0, 20, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 1, 8, 0.05, 'circle radius (m)');
  castAnim(cast, c);

  const theft = sub(folder, 'The theft');
  R(theft, c, 'listenTime', 0.2, 4, 0.05, 'listens for (s)');
  R(theft, c, 'scanInterval', 0.02, 0.5, 0.01, 'scan every (s)');
  R(theft, c, 'maxTaps', 0, MAX_TAPS, 1, 'enemies tapped');
  R(theft, c, 'stealAttacks', 0, 1, 1, 'swallow other casts’ attacks');
  R(theft, c, 'maxStolen', 0, MAX_STOLEN, 1, 'attacks swallowed');
  R(theft, c, 'baseDamage', 0, 4, 0.05, 'damage, one frequency');
  R(theft, c, 'damagePerFrequency', 0, 2, 0.05, '+ damage per frequency');
  R(theft, c, 'maxDamage', 0, 10, 0.1, 'damage ceiling');
  R(theft, c, 'amplifyPerFrequency', 0, 1, 0.01, '+ knockback per frequency');
  R(theft, c, 'maxAmplify', 1, 3, 0.05, 'knockback ceiling (×)');
  R(theft, c, 'hitImpulse', 0, 24, 0.1, 'impulse');
  R(theft, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(theft, c, 'hitSpin', 0, 8, 0.05, 'tumble');
  R(theft, c, 'tapStatusTime', 0, 6, 0.05, 'resonating for (s)');

  const light = sub(folder, 'Light & palette');
  color(light, c, 'lightColor', 'light');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'landLight', 0, 20, 0.1, 'punch on landing');
  R(light, c, 'playLight', 0, 30, 0.1, 'punch at playback');
  color(light, c, 'colorCore', 'ramp · core');
  color(light, c, 'colorTint', 'ramp · tint');
  color(light, c, 'colorBody', 'ramp · body');
  color(light, c, 'colorDeep', 'ramp · deep');

  const timing = sub(folder, 'Timing (× global lifetime)');
  R(timing, c, 'chargeTime', 0, 1, 0.01, 'charge at the hand (s)');
  R(timing, c, 'unfurlTime', 0.05, 1.5, 0.01, 'unfurl (s)');
  R(timing, c, 'ringTime', 0.1, 3, 0.05, 'ring-down (s)');
  R(timing, c, 'exitTime', 0.1, 2, 0.05, 'coil away (s)');

  const horn = sub(folder, '1 · The horn');
  R(horn, c, 'hornScale', 0.3, 1.6, 0.01, 'size (× radius)');
  R(horn, c, 'hornLift', -0.5, 3, 0.01, 'lift (m)');
  R(horn, c, 'shellSize', 0.1, 2, 0.01, 'shell size (m)');
  R(horn, c, 'arcHeight', 0, 5, 0.05, 'throw arc (m)');
  R(horn, c, 'spinRate', 0, 2, 0.01, 'turn (rev/s)');
  R(horn, c, 'flightSpin', 0, 6, 0.05, 'shell spin (rev/s)');
  R(horn, c, 'hornMetalness', 0, 1, 0.01, 'lacquer specular');
  R(horn, c, 'hornGloss', 4, 160, 1, 'gloss');
  R(horn, c, 'hornRim', 0, 4, 0.05, 'rim');
  R(horn, c, 'grooveGlow', 0, 8, 0.05, 'lit groove glow');
  R(horn, c, 'grooveCount', 4, 30, 1, 'groove bands');
  R(horn, c, 'rippleAmp', 0, 0.15, 0.001, 'swell');
  R(horn, c, 'rippleFreq', 2, 60, 0.5, 'swell waves');
  R(horn, c, 'rippleSpeed', 0, 20, 0.1, 'swell speed');
  R(horn, c, 'playbackKick', 0, 0.6, 0.01, 'playback jump');
  R(horn, c, 'dissolveEdge', 0.01, 0.3, 0.005, 'dissolve edge');

  const taps = sub(folder, '2 · The taps');
  R(taps, c, 'tapWidth', 0.01, 0.4, 0.005, 'width (m)');
  R(taps, c, 'tapAmplitude', 0, 1, 0.01, 'corkscrew (m)');
  R(taps, c, 'tapWaves', 1, 16, 0.5, 'turns');
  R(taps, c, 'tapFlow', 0, 8, 0.05, 'packets / s');
  R(taps, c, 'tapGlow', 0, 8, 0.05, 'glow');
  R(taps, c, 'tapSag', 0, 2, 0.01, 'arc (× rise)');
  R(taps, c, 'tapReach', 0.05, 1.5, 0.01, 'reaches the horn in (s)');
  R(taps, c, 'chestHeight', 0.3, 2.2, 0.01, 'tapped at (m)');
  R(taps, c, 'wakeWidth', 0.01, 0.4, 0.005, 'flight wake width (m)');

  const floor = sub(folder, '3 · The floor');
  R(floor, c, 'floorGlow', 0, 6, 0.05, 'glow');
  R(floor, c, 'floorStain', 0, 1, 0.01, 'stain');
  R(floor, c, 'grooveRings', 4, 120, 1, 'record grooves');
  R(floor, c, 'spectrumBins', 8, 128, 1, 'spectrum bars');
  R(floor, c, 'spectrumHeight', 0, 0.24, 0.005, 'bar reach (× radius)');
  R(floor, c, 'floorWaveSpeed', 0.1, 6, 0.05, 'playback rings speed');
  R(floor, c, 'floorDissolve', 0.1, 1, 0.01, 'dissolves over (× exit)');

  const reeds = sub(folder, '4 · The spectrum ring');
  R(reeds, c, 'reedCount', 0, MAX_REEDS, 1, 'reeds');
  R(reeds, c, 'reedHeight', 0.05, 3, 0.01, 'height (m)');
  R(reeds, c, 'reedWidth', 0.02, 0.8, 0.005, 'width (m)');
  R(reeds, c, 'reedPump', 0, 2, 0.01, 'pump');
  R(reeds, c, 'reedGlow', 0, 6, 0.05, 'glow');
  R(reeds, c, 'reedLean', 0, 1.2, 0.01, 'lean in (rad)');

  const cone = sub(folder, '5 · The playback cone');
  R(cone, c, 'coneLife', 0.05, 2, 0.01, 'lasts (s)');
  R(cone, c, 'coneGlow', 0, 8, 0.05, 'glow');
  R(cone, c, 'coneRings', 1, 20, 1, 'pressure rings');
  R(cone, c, 'coneSpread', 0.2, 2, 0.01, 'foot (× radius)');

  const fx = sub(folder, '6 · Particles');
  R(fx, c, 'ringRate', 0, 40, 0.5, 'rings / s per tap');
  R(fx, c, 'ringSize', 0.02, 1.5, 0.01, 'ring size');
  R(fx, c, 'ringLife', 0.05, 2, 0.01, 'ring life (s)');
  R(fx, c, 'moteRate', 0, 160, 1, 'motes / s');
  R(fx, c, 'moteSize', 0.01, 0.4, 0.005, 'mote size');
  R(fx, c, 'moteLife', 0.05, 3, 0.01, 'mote life (s)');
  R(fx, c, 'moteSpeed', 0, 8, 0.05, 'mote speed');
  R(fx, c, 'sparkCount', 0, 96, 1, 'sparks per body');
  R(fx, c, 'sparkSize', 0.01, 0.4, 0.005, 'spark size');
  R(fx, c, 'sparkLife', 0.05, 2, 0.01, 'spark life (s)');
  R(fx, c, 'sparkSpeed', 0, 20, 0.1, 'spark speed');
  R(fx, c, 'playRingCount', 0, 96, 1, 'rings at playback');
  R(fx, c, 'gatherRate', 0, 80, 1, 'charge rings / s');
  R(fx, c, 'particleGlow', 0, 6, 0.05, 'glow');

  const beats = sub(folder, '7 · The beats');
  R(beats, c, 'landShake', 0, 1, 0.01, 'landing knock');
  R(beats, c, 'playShake', 0, 1, 0.01, 'playback knock');
  R(beats, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(beats, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(beats, c, 'playFlash', 0, 1, 0.01, 'flash');
  R(beats, c, 'burstReach', 0, 2, 0.01, 'shell reach (× radius)');
  R(beats, c, 'burstLife', 0.05, 3, 0.01, 'shell life (s)');
  R(beats, c, 'burstIntensity', 0, 3, 0.01, 'shell brightness');
  R(beats, c, 'burstOpacity', 0, 1, 0.01, 'shell opacity');
  R(beats, c, 'burstFresnel', 0, 6, 0.05, 'shell rim');
  R(beats, c, 'burstSquash', 0.05, 1.5, 0.01, 'shell squash');
  R(beats, c, 'decalLife', 0.05, 5, 0.05, 'ripple lasts (s)');
  R(beats, c, 'shockwaveWidth', 0.01, 0.4, 0.005, 'shockwave width');
  R(beats, c, 'shockwaveIntensity', 0, 3, 0.01, 'shockwave brightness');
  R(beats, c, 'rippleIntensity', 0, 3, 0.01, 'ripple brightness');

  const lens = sub(folder, '8 · The lens');
  R(lens, c, 'lensDraw', 0, 3, 0.01, 'listening draw');
  R(lens, c, 'lensShock', 0, 3, 0.01, 'playback ring');

  return folder;
}
