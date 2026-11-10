import { Group, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { Ability as BaseAbility } from '../../Ability.js';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { routeExpansionTransparency, ParticleShape } from '../ExpansionFX.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { hash11 } from '../../../utils/math.js';
import {
  WEAPON_KINDS,
  createKnotGeometry,
  createQuad,
  createStreakGeometry,
  createWeaponGeometry,
} from './geometry.js';
import {
  MAX_POOL_SEATS,
  createKnotMaterial,
  createLensMaterial,
  createPoolMaterial,
  createStreakMaterial,
  createWeaponMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
const UID = 'matrix-expansion/hematite-arsenal';

const TAU = Math.PI * 2;
/** Weapons one arsenal can hold. */
export const MAX_WEAPONS = Math.min(8, MAX_POOL_SEATS);
/** Strikes one weapon can ever carry, however much vitality it is given. */
export const MAX_STRIKES_PER_WEAPON = 4;
/** Bodies one cast keeps a wound ledger for. */
const MAX_LEDGER = 16;

const sat = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = sat(x);
  return t * t * (3 - 2 * t);
};

/* Module scratch: nothing allocates per frame. */
const UP = new Vector3(0, 1, 0);
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _f = new Vector3();
const _z = new Vector3();
const _tip = new Vector3();
const _seat = new Vector3();
const _out = new Vector3();
const _hover = new Vector3();
const _hit = new Vector3();
const _hand = new Vector3();
const _m = new Matrix4();
const _q0 = new Quaternion();
const _q1 = new Quaternion();
const _emit = {
  position: new Vector3(), radius: 0, direction: new Vector3(0, 1, 0), speed: 1, speedVariance: 0.35,
  spread: 0.5, size: 0.1, sizeVariance: 0.4, life: 1, lifeVariance: 0.3, spin: 0, time: 0,
};
const _point = [0, 0, 0];
const _source = [0, 0, 0];
const _weaponState = { vital: 1, form: 1, heat: 0, rust: 0, crumble: 0, clock: 0, seed: 0 };
const _poolState = { reach: 1, grow: 0, dry: 0, fade: 1, clock: 0 };
const _knotState = { clock: 0, fade: 1 };
const _streakState = { head: 1, alpha: 0, seed: 0 };
const _lensState = { shock: 0, wave: 0, haze: 0, puff: 0, puffX: 0, puffY: 0, clock: 0 };
const _woundLook = { color: '#5c0612', rimColor: '#ff2a3a', rimEmissive: 0.8, edgeColor: '#2a0309', edgeEmissive: 0 };

/** Orientation whose +Y is `axis` and whose +Z leans toward `face`. */
function basisQuaternion(axis, face, out) {
  _y.copy(axis).normalize();
  _x.crossVectors(_y, face);
  if (_x.lengthSq() < 1e-8) _x.crossVectors(_y, Math.abs(_y.x) < 0.9 ? _f.set(1, 0, 0) : _f.set(0, 0, 1));
  _x.normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

/**
 * HEMATITE ARSENAL — Blood, zone cast. *Bounded vitality weapons.*
 *
 * The caster spends a fixed measure of vitality — `vitality` — and forges it
 * into weapons. Everything the cast can ever do is paid out of that measure.
 *
 * ## Beats
 *
 *   1. **Anticipation — the forge** (`forgeTime`). A knot of blood boils at
 *      the hand and the arsenal congeals out of it in a fan over the
 *      caster's shoulders — greatsword, spear, falx-glaive, twice over —
 *      molten red cooling to polished black hematite, every point turned
 *      downrange.
 *   2. **Travel — the volley.** The weapons leave the fan one after another
 *      and fly closed-form arcs tip-first, turning on their own axis, each
 *      to its socket on a ring at `ringSeat·zoneRadius`. The stagger is
 *      folded into the flight so every one of them arrives on `u = 1`.
 *   3. **Impact — the ring slams in.** All weapons drive point-first into
 *      the floor at once, pommels leaning out, quivering. Crack decals at
 *      every socket, a blood-splash shell and a shockwave, a pressure ring
 *      on the lens, droplets thrown up, flash, knock and a light punch — and
 *      the blood pool starts to spread from the sockets.
 *   4. **Linger — the arsenal fights.** One at a time on a fixed cadence
 *      (`strikeStart`, `strikeGap`), a weapon rips itself out of the floor,
 *      rears over the ring, turns on an enemy and drives through it at
 *      chest height, holds, and flies back to its socket. Every strike is
 *      paid for: the blood in the weapon's fuller drops, its edge cools,
 *      and the rivulet that feeds it from the pool thins. A weapon whose
 *      vitality is spent rusts where it struck and crumbles to flakes. The
 *      ring visibly thins as the measure runs out.
 *   5. **Exit — return.** Whatever is left melts back into the pool — the
 *      weapons sink molten into it — and the pool crusts into dried
 *      hematite and dissolves.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the forge** — the blood knot (`createKnotMaterial`, a sphere boiled
 *      in the vertex stage) and the blood mist drawn up round it.
 *   2. **the weapons** — the hero: lofted, lathed and extruded hematite
 *      (`geometry.js`) in a patched `MeshStandardMaterial`
 *      (`createWeaponMaterial`) on `LAYER.WORLD`, casting shadows; blood
 *      level = vitality, molten forming, rust and crumble.
 *   3. **the streaks** — a crimson ribbon along every lunge
 *      (`createStreakMaterial`).
 *   4. **the pool** — the floor field (`createPoolMaterial`): spreading
 *      blood, rivulets from each socket, wet sheen, strike rings, crust.
 *   5. **particles** — blood droplets (`DROPLET`) at the landing and every
 *      strike, rust flakes (`CHIP`, lit) when a weapon crumbles, blood mist
 *      (`SOFT`, curl) at the forge and off the pool.
 *   6. **the landing** — WATER burst shell in the blood ramp, CRACK decals
 *      at the sockets, a SHOCKWAVE, flash, camera knock, light punch.
 *   7. **the lens** — `LAYER.DISTORTION`: landing ring, strike puffs, haze.
 *   8. **the light** — rides the target; punched on landing and per strike.
 *
 * ## The rule (`handlesOwnHits`)
 *
 * At spawn the cast fixes `N = weaponCount` (≤ 8) and gives every weapon
 * `vitality / N`. A strike deals `strikeDamage` and spends exactly that, so
 * a weapon carries `floor(share / strikeDamage)` strikes (≤ 4), and the
 * whole cast can never deal more than `vitality`. Strike `j` belongs to
 * weapon `j mod N` and launches at a fixed time; at launch it picks, among
 * the living enemies inside `zoneRadius`, the one this arsenal has already
 * wounded most (it finishes what it starts), else the one nearest its
 * socket — never a body the arsenal has already reserved enough damage to
 * fell. Damage is reserved at launch and lands at the end of the lunge,
 * through the expansion combat binding, or straight on the dummies, which
 * fall once the wounds this cast dealt them reach one full health (wounds
 * short of that stain them). A strike with no enemy to take is withheld and
 * spends nothing; unspent vitality melts back into the pool.
 *
 * ## The editor rule
 *
 * Records keep only dice (socket jitter, seeds) and event facts (launch
 * times are computed, targets chosen, strikes landed); every metre, colour,
 * timing and count is resolved from `settings.hematiteArsenal` each frame.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this._n ?? 0;
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** Seconds a strike takes from rip to the end of its return. */
  _strikeDuration() {
    const c = this.config;
    return c.ripTime + c.lungeTime + c.holdTime + c.returnTime;
  }

  /** Launch time of strike `j`, seconds after landing. */
  launchTime(j) {
    const c = this.config;
    const n = Math.max(1, this._n);
    const cycle = Math.max(n * c.strikeGap, this._strikeDuration() + 0.05);
    return c.strikeStart + Math.floor(j / n) * cycle + (j % n) * c.strikeGap;
  }

  get totalStrikes() {
    return this._n * this._strikesPer;
  }

  get impactDuration() {
    const c = this.config;
    const tail = 0.2 * settings.global.lifetime;
    if (!this._n || !this.totalStrikes) return c.strikeStart + 0.8 + tail;
    return this.launchTime(this.totalStrikes - 1) + c.ripTime + c.lungeTime + Math.max(c.holdTime + c.returnTime, c.holdTime + c.crumbleTime) + tail;
  }

  get fadeDuration() {
    return 0.8 * Math.max(0.1, settings.global.lifetime);
  }

  /** Travel waits at the hand while the arsenal congeals (Beam's charge). */
  advance(dt) {
    if (this.age < this.config.forgeTime) {
      this.position.copy(this.origin);
      return false;
    }
    return super.advance(dt);
  }

  lightShimmer() {
    return 0.92 + 0.08 * Math.sin(this.age * 7.1) + this._strikePulse * 0.6;
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
    this.root = new Group();
    this.group.add(this.root);
    const quad = own(createQuad());

    // 4 · the pool
    this.poolMat = own(createPoolMaterial());
    this.pool = new Mesh(quad, this.poolMat);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.renderOrder = 2;
    this.root.add(this.pool);

    // 1 · the forge
    this.knotMat = own(createKnotMaterial());
    this.knot = new Mesh(own(createKnotGeometry()), this.knotMat);
    this.knot.renderOrder = 6;
    this.root.add(this.knot);

    // 2 · the weapons, 3 · their streaks
    const geometries = WEAPON_KINDS.map((kind) => own(createWeaponGeometry(kind)));
    const streakGeometry = own(createStreakGeometry());
    this.weapons = [];
    for (let i = 0; i < MAX_WEAPONS; i++) {
      const kind = i % WEAPON_KINDS.length;
      const mat = own(createWeaponMaterial());
      const mesh = new Mesh(geometries[kind], mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.layers.set(LAYER.WORLD);
      this.root.add(mesh);
      const streakMat = own(createStreakMaterial());
      const streak = new Mesh(streakGeometry, streakMat);
      streak.frustumCulled = false;
      streak.renderOrder = 7;
      streak.visible = false;
      this.root.add(streak);
      const strikes = [];
      for (let k = 0; k < MAX_STRIKES_PER_WEAPON; k++) {
        strikes.push({ launched: false, landed: false, skipped: false, key: null, tx: 0, tz: 0, hx: 0, hz: 0 });
      }
      this.weapons.push({
        kind, mesh, mat, streak, streakMat, strikes,
        // dice
        seatJ: 0, leanJ: 0, seed: 0,
        // events
        landed: 0, spentAt: -1, lastLand: -1,
      });
    }

    // 7 · the lens (opaque proxy on the distortion layer)
    this.lensMat = own(createLensMaterial());
    this.lens = new Mesh(quad, this.lensMat);
    this.lens.rotation.x = -Math.PI / 2;
    this.lens.position.y = 0.4;
    this.lens.visible = false;
    this.root.add(this.lens);

    this._ledger = [];
    for (let i = 0; i < MAX_LEDGER; i++) this._ledger.push({ key: null, first: 1, dealt: 0, taken: 0 });
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._castIndex = 0;
    this._n = 0;
    this._strikesPer = 0;
    this._strikePulse = 0;
    this._target = new Vector3();
    this._clock = 0;

    routeExpansionTransparency(this.group);
    for (const w of this.weapons) w.mesh.layers.set(LAYER.WORLD);
    this.lens.layers.set(LAYER.DISTORTION);
    this._disposed = false;
  }

  createParticles() {
    const p = this.ctx.particles;
    this.spray = p?.get?.(`${ID}.spray`, { capacity: 640, shape: ParticleShape.DROPLET, additive: false, softFade: 0.2 }) ?? null;
    this.rust = p?.get?.(`${ID}.rust`, { capacity: 420, shape: ParticleShape.CHIP, additive: false, lit: true }) ?? null;
    this.mist = p?.get?.(`${ID}.mist`, { capacity: 420, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.4 }) ?? null;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = this.config;
    this._castIndex++;
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this._calm = prefersReducedMotion();
    this._clock = 0;
    this._strikePulse = 0;
    this._landedAt = -1;
    this._nextStrike = 0;
    this._puffAt = -10;
    this._puffSeat = 0;
    this._mistCarry = 0;
    this.hitsLanded = 0;
    this.damageDealt = 0;
    this.withheld = 0;
    // The rule is fixed for the life of the cast.
    this._n = Math.max(1, Math.min(MAX_WEAPONS, Math.round(c.weaponCount)));
    this._damage = Math.max(0.01, c.strikeDamage);
    this._share = Math.max(0, c.vitality) / this._n;
    this._strikesPer = Math.min(MAX_STRIKES_PER_WEAPON, Math.floor(this._share / this._damage + 1e-6));
    this.pointAt(1, this._target);
    for (let i = 0; i < MAX_WEAPONS; i++) {
      const w = this.weapons[i];
      w.seatJ = hash11(i * 7.31 + this._castIndex * 1.17) * 2 - 1;
      w.leanJ = hash11(i * 3.77 + this._castIndex * 2.03) * 2 - 1;
      w.seed = hash11(i * 5.13 + this._castIndex * 0.61) * 10;
      w.landed = 0;
      w.spentAt = -1;
      w.lastLand = -1;
      w._flaked = false;
      for (const s of w.strikes) {
        s.launched = false; s.landed = false; s.skipped = false; s.key = null;
        s.tx = 0; s.tz = 0; s.hx = 0; s.hz = 0;
      }
      w.mesh.visible = i < this._n;
      w.streak.visible = false;
    }
    for (const e of this._ledger) { e.key = null; e.first = 1; e.dealt = 0; e.taken = 0; }
    this.root.visible = true;
    this._sync(0);
  }

  onTravel(dt) {
    this._forgeMist(dt);
    this._sync(dt);
  }

  onImpact() {
    this.position.copy(this._target);
    this._landedAt = 0;
    this._land();
    this._sync(0);
  }

  onFade(dt) {
    if (this.phase === 'impact') {
      // Launch every strike whose time has come, then land every lunge
      // whose point has arrived. Both read live settings for timing.
      while (this._nextStrike < this.totalStrikes && this.impactTime >= this.launchTime(this._nextStrike)) {
        this._launch(this._nextStrike++);
      }
      const c = this.config;
      for (let i = 0; i < this._n; i++) {
        const w = this.weapons[i];
        for (let k = 0; k < this._strikesPer; k++) {
          const s = w.strikes[k];
          if (!s.launched || s.landed || s.skipped) continue;
          if (this.impactTime >= this.launchTime(k * this._n + i) + c.ripTime + c.lungeTime) this._strike(i, k);
        }
      }
      this._poolMist(dt);
    }
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Placement — derived from settings every frame                       */
  /* ------------------------------------------------------------------ */

  /** Socket of weapon `i` on the floor, and its outward unit. */
  _seatOf(i, outSeat, outOut) {
    const c = this.config;
    const bearing = Math.atan2(-this.direction.z, -this.direction.x);
    const theta = bearing + ((i + 0.5) / this._n) * TAU + this.weapons[i].seatJ * c.seatJitter * settings.global.randomness;
    outOut.set(Math.cos(theta), 0, Math.sin(theta));
    return outSeat.copy(this._target).addScaledVector(outOut, c.ringSeat * c.zoneRadius).setY(0);
  }

  /** Planted pose of weapon `i`: tip position and orientation. */
  _planted(i, tipOut, qOut, sway) {
    const c = this.config;
    this._seatOf(i, _seat, _out);
    const lean = c.lean * (1 + 0.25 * this.weapons[i].leanJ) + sway;
    _d.copy(UP).multiplyScalar(Math.cos(lean)).addScaledVector(_out, Math.sin(lean)).normalize();
    tipOut.copy(_seat).addScaledVector(_d, -c.plantDepth);
    // Flat of the blade faces the centre.
    _c.copy(_out).negate();
    return basisQuaternion(_d, _c, qOut);
  }

  /** Where weapon `i` hangs in the forge fan. */
  _fan(i, tipOut, qOut) {
    const c = this.config;
    const n = this._n;
    const a = (n > 1 ? i / (n - 1) - 0.5 : 0) * c.fanSpread;
    const bob = this._calm ? 0 : Math.sin(this._clock * 3 + i) * 0.05;
    tipOut.copy(this.origin)
      .addScaledVector(this.direction, -c.fanBack)
      .addScaledVector(this.side, Math.sin(a) * c.fanRadius)
      .addScaledVector(UP, c.fanHeight + Math.cos(a) * c.fanRadius * 0.4 + bob);
    _d.copy(this._target).sub(tipOut).normalize().negate();
    return basisQuaternion(_d, UP, qOut);
  }

  /* ------------------------------------------------------------------ */
  /* Gameplay                                                            */
  /* ------------------------------------------------------------------ */

  _ledgerFor(key, create, first) {
    let free = null;
    for (const e of this._ledger) {
      if (e.key === key) return e;
      if (!free && e.key === null) free = e;
    }
    if (create && free) {
      free.key = key;
      free.first = first;
      free.dealt = 0;
      free.taken = 0;
      return free;
    }
    return null;
  }

  /** Pick a target for strike `j`, reserve its damage, or withhold it. */
  _launch(j) {
    const c = this.config;
    const i = j % this._n, k = Math.floor(j / this._n);
    const w = this.weapons[i];
    const s = w.strikes[k];
    s.launched = true;
    this._seatOf(i, _seat, _out);
    const R = c.zoneRadius;
    let best = null, bestKey = null, bestHealth = 1, bestScore = Infinity, bx = 0, bz = 0;
    const consider = (key, x, z, health) => {
      const dx = x - this._target.x, dz = z - this._target.z;
      if (dx * dx + dz * dz > R * R) return;
      const e = this._ledgerFor(key, false, 0);
      if (e && e.dealt >= e.first - 1e-6) return; // already reserved to fall
      const dealt = e ? e.dealt : 0;
      const d = Math.hypot(x - _seat.x, z - _seat.z);
      // Finish the wounded first, then the nearest to this socket.
      const score = (dealt > 0 ? -1000 * dealt : 0) + d;
      if (score < bestScore - 1e-9) {
        bestScore = score; best = true; bestKey = key; bestHealth = health; bx = x; bz = z;
      }
    };
    if (this._scope) {
      _point[0] = this._target.x; _point[1] = 0; _point[2] = this._target.z;
      const found = this._scope.queryActors({ position: _point, radius: R, relation: 'enemy' });
      if (!found.ok) this.failure = found.reason;
      else for (const actor of found.actors) if (actor.alive !== false) consider(actor.id, actor.position[0], actor.position[2], Number.isFinite(actor.health) ? actor.health : 1);
    } else if (this.ctx.dummies?.findTargets) {
      const found = this.ctx.dummies.findTargets(this._target.x, this._target.z, R, this._found);
      for (const dummy of found) if (dummy.alive !== false) consider(dummy, dummy.position.x, dummy.position.z, 1);
    }
    if (!best) {
      s.skipped = true;
      this.withheld++;
      return;
    }
    const e = this._ledgerFor(bestKey, true, bestHealth);
    if (e) e.dealt += this._damage;
    s.key = bestKey;
    s.tx = bx;
    s.tz = bz;
  }

  /** The lunge of weapon `i`, strike `k`, arrives: the hit lands. */
  _strike(i, k) {
    const c = this.config;
    const w = this.weapons[i];
    const s = w.strikes[k];
    s.landed = true;
    w.landed++;
    w.lastLand = this.impactTime;
    if (w.landed >= this._strikesPer) w.spentAt = this.impactTime;
    this.hitsLanded++;
    this.damageDealt += this._damage;
    this._hoverOf(i, _hover);
    s.hx = _hover.x;
    s.hz = _hover.z;
    const e = this._ledgerFor(s.key, false, 0);
    // Reserved at launch, *taken* at landing: only the landing that brings
    // the wounds to full health fells the body.
    if (e) e.taken += this._damage;
    const lethal = e ? e.taken >= e.first - 1e-6 : true;
    if (this._scope) {
      _point[0] = s.tx; _point[1] = 0; _point[2] = s.tz;
      _source[0] = _hover.x; _source[1] = 0; _source[2] = _hover.z;
      const sent = this._scope.emit({
        type: 'hit', element: 'blood', targetIds: [s.key], position: _point, sourcePosition: _source,
        damage: this._damage, hitForce: impactForce(c, settings.global.explosionIntensity), tags: ['hematite-arsenal'],
      });
      if (!sent.ok) this.failure = sent.reason;
      if (!lethal && this.ctx.dummies?.findTargets) {
        const near = this.ctx.dummies.findTargets(s.tx, s.tz, 0.3, this._found);
        if (near.length) this._wound(near[0], e);
      }
    } else if (s.key && typeof s.key.kill === 'function' && s.key.alive !== false) {
      if (lethal) {
        _d.set(s.tx - _hover.x, 0, s.tz - _hover.z);
        if (_d.lengthSq() < 1e-8) _d.copy(this.direction);
        else _d.normalize();
        const power = settings.global.explosionIntensity;
        this._force.impulse = c.hitImpulse * power;
        this._force.lift = c.hitLift * power;
        this._force.spin = c.hitSpin;
        s.key.kill(_d.x, _d.z, this._force);
      } else this._wound(s.key, e);
    }
    this._strikeFx(i, s);
  }

  _wound(dummy, entry) {
    if (typeof dummy?.corrode !== 'function') return;
    const c = this.config;
    _woundLook.color = c.woundColor;
    _woundLook.rimColor = c.woundRim;
    _woundLook.rimEmissive = c.woundEmissive;
    _woundLook.edgeColor = c.deepColor;
    dummy.corrode(entry ? sat(entry.taken / Math.max(1e-3, entry.first)) * 0.8 : 0.4, _woundLook);
  }

  /** Where weapon `i` rears before it lunges. */
  _hoverOf(i, out) {
    const c = this.config;
    this._seatOf(i, _seat, _out);
    return out.copy(_seat).addScaledVector(_out, -c.hoverInset * c.zoneRadius).addScaledVector(UP, c.hoverHeight);
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  _emitFrom(system, count, at, radius, dir, speed, spread, size, life) {
    if (!system || count <= 0) return;
    const g = settings.global;
    _emit.position.copy(at);
    _emit.radius = radius;
    _emit.direction.copy(dir);
    _emit.speed = speed * g.particleSpeed;
    _emit.spread = spread;
    _emit.size = size * g.particleSize;
    _emit.life = life * g.particleLifetime;
    _emit.spin = 3;
    _emit.time = frame.uTime.value;
    system.emit(Math.min(128, Math.round(count * g.particleCount)), _emit);
  }

  /** The arsenal slams into the floor. */
  _land() {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    const R = c.zoneRadius;
    this.lightBoost = c.impactLight * power;
    _a.copy(this._target).setY(0.05);
    for (let i = 0; i < this._n; i++) {
      this._seatOf(i, _seat, _out);
      _seat.y = 0.04;
      this.ctx.decals?.spawn?.(DecalType.CRACK, _seat, {
        radius: c.crackRadius, life: c.decalLife, intensity: 1,
        colorA: getColor(c.bodyColor), colorB: getColor(c.deepColor),
      });
      _b.copy(_out).addScaledVector(UP, 1.6).normalize();
      this._emitFrom(this.spray, c.landSpray, _seat, 0.12, _b, c.spraySpeed, 0.45, c.spraySize, c.sprayLife);
    }
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _a, {
      radius: R * 1.15 * power, life: c.decalLife * 0.3, width: c.shockwaveWidth, intensity: 1,
      colorA: getColor(c.tintColor), colorB: getColor(c.bodyColor),
    });
    this.ctx.bursts?.spawn?.(BurstMode.WATER, _a, {
      radius: R * 0.15, endRadius: R * c.burstReach * power, life: c.burstLife,
      intensity: c.burstIntensity, opacity: c.burstOpacity * settings.global.opacity,
      fresnel: 2.2 * settings.global.fresnel, squash: 0.35, displace: 0.4, turbulence: settings.global.turbulence,
      colorA: getColor(c.colorBurstA), colorB: getColor(c.colorBurstB), colorC: getColor(c.colorBurstC),
    });
    if (c.impactShake > 0) this.ctx.shake?.add?.(c.impactShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.impactFlash > 0) this.ctx.flash?.trigger?.(getColor(c.tintColor), c.impactFlash * power);
  }

  _strikeFx(i, s) {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    this.lightBoost = Math.max(this.lightBoost, c.strikeLight * power);
    this._strikePulse = 1;
    _hit.set(s.tx, c.strikeHeight, s.tz);
    _b.set(s.tx - s.hx, 0.25, s.tz - s.hz).normalize();
    this._emitFrom(this.spray, c.sprayCount, _hit, 0.15, _b, c.spraySpeed, 0.55, c.spraySize, c.sprayLife);
    if (c.strikeShake > 0) this.ctx.shake?.add?.(c.strikeShake * power, c.shakeDecay * 1.5, c.shakeFrequency);
    this._puffAt = this.impactTime;
    this._puffSeat = i;
    this.ctx.decals?.spawn?.(DecalType.RIPPLE, _hit.setY(0.04), {
      radius: 0.9, life: 0.8, intensity: 0.8, colorA: getColor(c.tintColor), colorB: getColor(c.deepColor),
    });
  }

  _forgeMist(dt) {
    const c = this.config;
    if (!this.mist || this.u >= 1) return;
    this._mistCarry += dt * c.mistRate * settings.global.particleCount;
    const n = Math.floor(this._mistCarry);
    if (n <= 0) return;
    this._mistCarry -= n;
    this._handPoint(_hand);
    this._emitFrom(this.mist, n, _hand, c.knotSize * 3, UP, 0.5, 0.9, c.mistSize, c.mistLife);
  }

  _poolMist(dt) {
    const c = this.config;
    if (!this.mist) return;
    this._mistCarry += dt * c.mistRate * 0.6 * settings.global.particleCount;
    const n = Math.floor(this._mistCarry);
    if (n <= 0) return;
    this._mistCarry -= n;
    const i = Math.floor(this.impactTime * 13) % this._n;
    this._seatOf(i, _seat, _out);
    _seat.y = 0.1;
    this._emitFrom(this.mist, n, _seat, 0.35, UP, 0.45, 0.35, c.mistSize, c.mistLife);
  }

  _handPoint(out) {
    const c = this.config;
    return out.copy(this.origin).addScaledVector(UP, c.forgeHeight).addScaledVector(this.direction, c.forgeReach);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    const set = (sys, a, b, cc, d, glow, gravity) => {
      if (!sys?.uniforms) return;
      sys.setGradient?.(getColor(a), getColor(b), getColor(cc), getColor(d));
      const u = sys.uniforms;
      if (u.uGlow) u.uGlow.value = glow * g.glow;
      if (u.uOpacity) u.uOpacity.value = g.opacity;
      if (u.uTurbulence) u.uTurbulence.value = 0.6 * g.turbulence;
      if (u.uSizeScale) u.uSizeScale.value = g.particleSize;
      if (u.uSpeedScale) u.uSpeedScale.value = g.particleSpeed;
      if (u.uLifeScale) u.uLifeScale.value = g.particleLifetime;
      if (u.uGravity?.value?.set && gravity !== null) u.uGravity.value.set(0, -gravity, 0);
    };
    set(this.spray, c.colorSprayA, c.colorSprayB, c.colorSprayC, c.colorSprayD, c.sparkGlow, c.sprayGravity);
    set(this.rust, c.colorRustA, c.colorRustB, c.colorRustC, c.colorRustD, 0.6, 5);
    set(this.mist, c.tintColor, c.bodyColor, c.deepColor, c.deepColor, c.sparkGlow, -0.4);
  }

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const R = c.zoneRadius;
    if (!this._calm) this._clock += dt * g.noiseSpeed;
    const clock = this._clock;
    this._strikePulse = Math.max(0, this._strikePulse - dt * 5);
    const fadeT = this.phase === 'fade' ? sat(this.fadeTime / this.fadeDuration) : 0;
    const landed = this.phase !== 'travel';
    const t = landed ? this.impactTime + (this.phase === 'fade' ? this.impactDuration + this.fadeTime : 0) : -1;
    const forge = sat(this.age / Math.max(0.01, c.forgeTime));
    const scale = c.weaponScale;

    // 1 · the knot
    this._handPoint(_hand);
    const knotLife = landed ? 0 : smooth(forge * 1.6) * (1 - smooth((this.u - 0.1) / 0.5));
    this.knot.visible = knotLife > 0.01;
    if (this.knot.visible) {
      this.knot.position.copy(_hand);
      this.knot.scale.setScalar(c.knotSize * (0.4 + 0.6 * knotLife) * (1 + 0.4 * (1 - forge)));
      if (!this._calm) this.knot.rotation.y = clock * 2;
      _knotState.clock = clock;
      _knotState.fade = knotLife;
      this.knotMat.userData.sync(_knotState);
    }

    // 2 · the weapons
    for (let i = 0; i < MAX_WEAPONS; i++) {
      const w = this.weapons[i];
      if (i >= this._n) { w.mesh.visible = false; w.streak.visible = false; continue; }
      let vital = this._strikesPer > 0 ? sat((this._share - w.landed * this._damage) / Math.max(1e-6, this._share)) : 1;
      let form = 1, heat = 0, rust = (1 - vital) * 0.3, crumble = 0, size = 1;
      let streakOn = false;
      if (!landed) {
        // Anticipation and travel: the fan, then the arc.
        form = smooth(forge * 1.15 - i * 0.03);
        size = 0.35 + 0.65 * smooth(forge * 1.3);
        this._fan(i, _a, _q0);
        const n = this._n;
        const delay = n > 1 ? (i / (n - 1)) * c.flightStagger : 0;
        const f = sat((this.u - delay) / Math.max(0.05, 1 - delay));
        if (f <= 0) {
          _tip.copy(_a);
          w.mesh.quaternion.copy(_q0);
        } else {
          const e = Math.pow(f, 1.35);
          this._planted(i, _b, _q1, 0);
          // Quadratic arc, apex `flightArc` over the chord.
          _c.copy(_a).add(_b).multiplyScalar(0.5).addScaledVector(UP, c.flightArc * 2);
          const m = 1 - e;
          _tip.copy(_a).multiplyScalar(m * m).addScaledVector(_c, 2 * m * e).addScaledVector(_b, e * e);
          // Tangent: the point leads.
          _x.copy(_b).sub(_c);
          _d.copy(_c).sub(_a).multiplyScalar(2 * m).addScaledVector(_x, 2 * e);
          _d.normalize().negate();
          basisQuaternion(_d, UP, w.mesh.quaternion);
          if (!this._calm) {
            _q0.setFromAxisAngle(UP, c.flightSpin * TAU * (1 - e));
            w.mesh.quaternion.multiply(_q0);
          }
          w.mesh.quaternion.slerp(_q1, smooth((e - 0.8) / 0.2));
          heat = 0.25 * e;
        }
      } else {
        // Planted, quivering after the slam.
        const sinceLand = Math.max(0, t);
        const sway = this._calm ? 0 : c.quiver * Math.exp(-sinceLand * 5) * Math.sin(sinceLand * c.quiverRate + i);
        this._planted(i, _tip, w.mesh.quaternion, sway);
        heat = Math.exp(-sinceLand * 4.5) * 0.9;
        // The strike in progress, if any.
        for (let k = 0; k < this._strikesPer; k++) {
          const s = w.strikes[k];
          if (!s.launched || s.skipped) continue;
          const launch = this.launchTime(k * this._n + i);
          const sl = t - launch;
          const strikeEnd = c.ripTime + c.lungeTime + c.holdTime + c.returnTime;
          const spent = w.landed >= this._strikesPer && k === this._strikesPer - 1;
          if (sl < 0 || (!spent && sl > strikeEnd)) continue;
          this._planted(i, _b, _q0, 0); // socket pose
          this._hoverOf(i, _hover);
          _hit.set(s.tx, c.strikeHeight, s.tz);
          _d.copy(_hit).sub(_hover);
          const len = Math.max(0.01, _d.length());
          _d.multiplyScalar(1 / len);
          _c.copy(_hit).addScaledVector(_d, c.pierce); // through the body
          _y.copy(_d).negate();
          basisQuaternion(_y, UP, _q1); // aim pose
          let head = 0;
          if (sl < c.ripTime) {
            const a = smooth(sl / Math.max(0.01, c.ripTime));
            _tip.copy(_b).lerp(_hover, a).addScaledVector(UP, Math.sin(a * Math.PI) * 0.3);
            w.mesh.quaternion.slerpQuaternions(_q0, _q1, a);
          } else if (sl < c.ripTime + c.lungeTime) {
            const a = sat((sl - c.ripTime) / Math.max(0.01, c.lungeTime));
            const e = a * a;
            _tip.copy(_hover).lerp(_c, e);
            w.mesh.quaternion.copy(_q1);
            head = e;
            streakOn = true;
          } else if (sl < c.ripTime + c.lungeTime + c.holdTime || spent) {
            const shudder = this._calm ? 0 : Math.sin(sl * 70) * 0.02 * sat(1 - (sl - c.ripTime - c.lungeTime) * 4);
            _tip.copy(_c).addScaledVector(UP, shudder);
            w.mesh.quaternion.copy(_q1);
            head = 1;
            streakOn = true;
            if (spent) {
              const since = sl - c.ripTime - c.lungeTime - c.holdTime;
              crumble = sat(since / Math.max(0.05, c.crumbleTime));
              rust = Math.max(rust, sat(since / Math.max(0.05, c.crumbleTime * 0.4)));
              // It sags as it rusts through.
              _tip.addScaledVector(UP, -crumble * 0.4);
              if (since >= 0 && !w._flaked) {
                w._flaked = true;
                _a.copy(_c).addScaledVector(_d, -0.6);
                this._emitFrom(this.rust, c.rustCount, _a, 0.5, UP, c.rustSpeed, 0.9, c.rustSize, c.rustLife);
              }
            }
          } else {
            const a = smooth((sl - c.ripTime - c.lungeTime - c.holdTime) / Math.max(0.01, c.returnTime));
            _tip.copy(_c).lerp(_b, a).addScaledVector(UP, Math.sin(a * Math.PI) * c.returnArc);
            w.mesh.quaternion.slerpQuaternions(_q1, _q0, a);
            head = 1;
            streakOn = true;
          }
          heat = Math.max(heat, head > 0 ? 0.35 : 0);
          // 3 · the streak along the lunge
          const streakAge = sl - c.ripTime - c.lungeTime;
          const alpha = streakAge < 0 ? 1 : sat(1 - streakAge / Math.max(0.02, c.streakLife));
          streakOn = streakOn && alpha > 0.01 && !this._calm;
          if (streakOn) {
            w.streak.position.copy(_hover);
            _x.copy(_d);
            _z.crossVectors(_x, UP);
            if (_z.lengthSq() < 1e-6) _z.set(1, 0, 0);
            _z.normalize();
            _y.crossVectors(_z, _x);
            _m.makeBasis(_x, _y, _z);
            w.streak.quaternion.setFromRotationMatrix(_m);
            w.streak.scale.set(len + c.pierce, c.streakWidth, 1);
            _streakState.head = sat(head);
            _streakState.alpha = alpha * (1 - fadeT);
            _streakState.seed = w.seed;
            w.streakMat.userData.sync(_streakState);
          }
          break;
        }
        if (w.spentAt >= 0 && crumble === 0 && t > w.spentAt + c.holdTime + c.crumbleTime) crumble = 1;
        if (w.landed > 0 && t - w.lastLand < 0.4) heat = Math.max(heat, 0.5 * Math.exp(-(t - w.lastLand) * 8));
        // Exit: what is left melts back into the pool.
        if (fadeT > 0 && w.spentAt < 0) {
          _tip.addScaledVector(UP, -fadeT * fadeT * 1.6 * scale);
          heat = Math.max(heat, fadeT * 0.8);
          crumble = Math.max(crumble, smooth((fadeT - 0.35) / 0.65));
        }
      }
      w.mesh.visible = crumble < 0.999;
      w.streak.visible = streakOn;
      w.mesh.position.copy(_tip);
      w.mesh.scale.setScalar(scale * size);
      _weaponState.vital = vital;
      _weaponState.form = form;
      _weaponState.heat = heat;
      _weaponState.rust = rust;
      _weaponState.crumble = crumble;
      _weaponState.clock = clock;
      _weaponState.seed = w.seed;
      w.mat.userData.sync(_weaponState);
    }

    // 4 · the pool
    const poolOn = landed;
    this.pool.visible = poolOn;
    if (poolOn) {
      const reach = c.poolReach + 0.15;
      this.pool.position.set(this._target.x, 0.03, this._target.z);
      this.pool.scale.set(2 * R * reach, 2 * R * reach, 1);
      const u = this.poolMat.uniforms;
      u.uCount.value = this._n;
      for (let i = 0; i < this._n; i++) {
        const w = this.weapons[i];
        this._seatOf(i, _seat, _out);
        const ring = w.lastLand >= 0 ? (t - w.lastLand) / 0.6 : 2;
        u.uSeats.value[i].set((_seat.x - this._target.x) / R, -(_seat.z - this._target.z) / R, ring < 1 ? ring : -1);
        u.uVital.value[i] = this._strikesPer > 0 ? sat((this._share - w.landed * this._damage) / Math.max(1e-6, this._share)) : 1;
      }
      _poolState.reach = reach;
      _poolState.grow = c.poolReach * smooth(Math.max(0, t) / Math.max(0.05, c.poolGrow));
      _poolState.dry = sat(fadeT / Math.max(0.05, c.dryTime));
      _poolState.fade = 1 - smooth((fadeT - 0.55) / 0.45);
      _poolState.clock = clock;
      this.poolMat.userData.sync(_poolState);
    }

    // 7 · the lens
    const ls = _lensState;
    const wave = poolOn ? sat(Math.max(0, t) / 0.5) : 0;
    ls.shock = poolOn && wave < 1 ? (1 - wave) : 0;
    ls.wave = wave;
    ls.haze = poolOn ? (1 - fadeT) * smooth(Math.max(0, t) / 0.5) : 0;
    const puff = poolOn ? sat(1 - (this.impactTime - this._puffAt) / 0.3) : 0;
    ls.puff = this.phase === 'impact' ? puff : 0;
    if (ls.puff > 0) {
      const w = this.weapons[this._puffSeat];
      const s = w.strikes[Math.max(0, w.landed - 1)];
      const half = R * 1.3;
      ls.puffX = (s.tx - this._target.x) / half;
      ls.puffY = -(s.tz - this._target.z) / half;
    }
    ls.clock = clock;
    this.lens.visible = !this._calm && (ls.shock * c.lensShock + ls.haze * c.lensHaze + ls.puff * c.lensStrike) * g.distortion > 0.002;
    if (this.lens.visible) {
      this.lens.position.set(this._target.x, 0.4, this._target.z);
      this.lens.scale.set(2 * R * 1.3, 2 * R * 1.3, 1);
      this.lensMat.userData.sync(ls);
    }
    this._syncParticles();
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._scope = null;
    this.root.visible = false;
    this.lens.visible = false;
    this.knot.visible = false;
    for (const w of this.weapons) {
      w.mesh.visible = false;
      w.streak.visible = false;
      w._flaked = false;
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    for (const r of this.resources) r.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

function editorKit(Editor) {
  const R = Editor?.range ?? ((f, c, k, min, max, step, label) => f.add(c, k, min, max, step).name?.(label ?? k));
  const sub = (parent, title) => (typeof parent.addFolder === 'function' ? parent.addFolder(title) : parent);
  const color = (f, c, k, label) => f.addColor(c, k).name?.(label ?? k);
  const gradient = (f, c, prefix, title) => {
    if (Editor?.gradient && typeof f.addFolder === 'function') return Editor.gradient(f, c, prefix, title);
    for (const s of ['A', 'B', 'C', 'D']) color(f, c, prefix + s, `${title} ${s}`);
    return f;
  };
  const castAnim = (f, c) => (Editor?.castAnimation ? Editor.castAnimation(f, c) : f.add(c, 'castAnim', CAST_ANIMATIONS));
  return { R, sub, color, gradient, castAnim };
}

export function buildEditor(gui, c, Editor) {
  const { R, sub, color, gradient, castAnim } = editorKit(Editor);
  const folder = gui.addFolder('⚔  Hematite Arsenal');

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 80, 0.5, 'arsenal flies at (m/s)');
  R(cast, c, 'zoneRadius', 1, 8, 0.05, 'guarded radius (m)');
  R(cast, c, 'lifetime', 0.5, 10, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'cooldown', 0, 20, 0.05, 'cooldown');
  castAnim(cast, c);

  const vit = sub(folder, 'The vitality (gameplay)');
  R(vit, c, 'vitality', 0, 16, 0.05, 'vitality spent (total damage bound)');
  R(vit, c, 'weaponCount', 1, MAX_WEAPONS, 1, 'weapons forged');
  R(vit, c, 'strikeDamage', 0.05, 4, 0.05, 'damage per strike');
  R(vit, c, 'strikeStart', 0, 2, 0.01, 'first strike after (s)');
  R(vit, c, 'strikeGap', 0.03, 1, 0.01, 'next weapon after (s)');
  R(vit, c, 'ripTime', 0.03, 1, 0.01, 'rip out & turn (s)');
  R(vit, c, 'lungeTime', 0.03, 1, 0.01, 'lunge (s)');
  R(vit, c, 'holdTime', 0, 1, 0.01, 'held through the body (s)');
  R(vit, c, 'returnTime', 0.05, 1.5, 0.01, 'return to socket (s)');
  R(vit, c, 'hitImpulse', 0, 24, 0.1, 'impulse');
  R(vit, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(vit, c, 'hitSpin', 0, 8, 0.05, 'spin');

  const light = sub(folder, 'Light');
  color(light, c, 'lightColor', 'colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'impactLight', 0, 20, 0.1, 'punch on landing');
  R(light, c, 'strikeLight', 0, 10, 0.1, 'punch per strike');

  const pal = sub(folder, 'Palette (blood ramp)');
  color(pal, c, 'coreColor', 'core');
  color(pal, c, 'tintColor', 'tint');
  color(pal, c, 'bodyColor', 'body');
  color(pal, c, 'deepColor', 'deep');

  const forge = sub(folder, '1 · The forge');
  R(forge, c, 'forgeTime', 0.05, 1.2, 0.01, 'congeals over (s)');
  R(forge, c, 'forgeHeight', 0.3, 3, 0.01, 'knot height (m)');
  R(forge, c, 'forgeReach', -1, 2, 0.01, 'knot ahead of caster (m)');
  R(forge, c, 'knotSize', 0.05, 1, 0.01, 'knot radius (m)');
  R(forge, c, 'knotGlow', 0, 8, 0.05, 'knot glow');
  R(forge, c, 'knotChurn', 0, 3, 0.05, 'knot boil');
  R(forge, c, 'fanRadius', 0, 3, 0.01, 'fan width (m)');
  R(forge, c, 'fanHeight', 0.5, 5, 0.01, 'fan height (m)');
  R(forge, c, 'fanSpread', 0, 3.2, 0.01, 'fan spread (rad)');
  R(forge, c, 'fanBack', -1, 2, 0.01, 'fan behind caster (m)');

  const flight = sub(folder, '2 · The flight');
  R(flight, c, 'flightArc', 0, 6, 0.05, 'arc apex (m)');
  R(flight, c, 'flightStagger', 0, 0.9, 0.01, 'launch stagger');
  R(flight, c, 'flightSpin', 0, 3, 0.05, 'spin (rev)');

  const weapons = sub(folder, '3 · The weapons');
  R(weapons, c, 'weaponScale', 0.3, 2.5, 0.01, 'size');
  R(weapons, c, 'ringSeat', 0.2, 1.2, 0.01, 'sockets at (× radius)');
  R(weapons, c, 'plantDepth', 0, 1, 0.01, 'planted depth (m)');
  R(weapons, c, 'lean', -0.8, 0.8, 0.01, 'outward lean (rad)');
  R(weapons, c, 'seatJitter', 0, 0.6, 0.01, 'socket jitter (rad)');
  R(weapons, c, 'quiver', 0, 0.3, 0.005, 'quiver (rad)');
  R(weapons, c, 'quiverRate', 0, 40, 0.5, 'quiver rate');
  color(weapons, c, 'metalColor', 'hematite');
  color(weapons, c, 'metalSheen', 'red sheen');
  R(weapons, c, 'metalness', 0, 1, 0.01, 'metalness');
  R(weapons, c, 'roughness', 0, 1, 0.01, 'roughness');
  color(weapons, c, 'rustColor', 'rust');
  R(weapons, c, 'rustRoughness', 0, 1, 0.01, 'rust roughness');
  R(weapons, c, 'fullerGlow', 0, 8, 0.05, 'blood in the fuller');
  R(weapons, c, 'fullerFlow', 0, 5, 0.05, 'blood flow');
  R(weapons, c, 'edgeGlow', 0, 4, 0.05, 'edge glow');
  R(weapons, c, 'rimGlow', 0, 4, 0.05, 'red fresnel rim');
  R(weapons, c, 'formGlow', 0, 8, 0.05, 'molten glow');

  const strike = sub(folder, '4 · The strike');
  R(strike, c, 'hoverHeight', 0, 4, 0.01, 'rears to (m)');
  R(strike, c, 'hoverInset', -0.5, 1, 0.01, 'rears inward (× radius)');
  R(strike, c, 'strikeHeight', 0.2, 2.5, 0.01, 'strikes at height (m)');
  R(strike, c, 'pierce', 0, 1.5, 0.01, 'passes through by (m)');
  R(strike, c, 'returnArc', 0, 3, 0.01, 'return arc (m)');
  R(strike, c, 'crumbleTime', 0.05, 2, 0.01, 'spent weapon crumbles over (s)');
  R(strike, c, 'streakWidth', 0.05, 1.5, 0.01, 'streak width (m)');
  R(strike, c, 'streakGlow', 0, 8, 0.05, 'streak glow');
  R(strike, c, 'streakLife', 0.02, 1.5, 0.01, 'streak lingers (s)');
  color(strike, c, 'woundColor', 'wound stain');
  color(strike, c, 'woundRim', 'wound rim');
  R(strike, c, 'woundEmissive', 0, 4, 0.05, 'wound glow');

  const pool = sub(folder, '5 · The pool');
  R(pool, c, 'poolReach', 0.3, 1.6, 0.01, 'spreads to (× radius)');
  R(pool, c, 'poolGrow', 0.05, 2, 0.01, 'spreads over (s)');
  R(pool, c, 'poolGlow', 0, 4, 0.05, 'glow');
  R(pool, c, 'poolSheen', 0, 4, 0.05, 'wet sheen');
  R(pool, c, 'poolVeins', 0, 3, 0.05, 'rivulets');
  R(pool, c, 'poolRipple', 0, 3, 0.05, 'strike rings');
  R(pool, c, 'dryTime', 0.05, 1, 0.01, 'crusts over (× fade)');
  color(pool, c, 'crustColor', 'crust');

  const fx = sub(folder, '6 · Particles');
  R(fx, c, 'sprayCount', 0, 128, 1, 'droplets per strike');
  R(fx, c, 'spraySize', 0.01, 0.4, 0.005, 'droplet size');
  R(fx, c, 'sprayLife', 0.05, 3, 0.01, 'droplet life');
  R(fx, c, 'spraySpeed', 0, 12, 0.05, 'droplet speed');
  R(fx, c, 'sprayGravity', 0, 20, 0.1, 'droplet gravity');
  R(fx, c, 'landSpray', 0, 64, 1, 'droplets per socket on landing');
  gradient(fx, c, 'colorSpray', 'droplets');
  R(fx, c, 'rustCount', 0, 128, 1, 'rust flakes');
  R(fx, c, 'rustSize', 0.01, 0.4, 0.005, 'flake size');
  R(fx, c, 'rustLife', 0.05, 3, 0.01, 'flake life');
  R(fx, c, 'rustSpeed', 0, 8, 0.05, 'flake speed');
  gradient(fx, c, 'colorRust', 'rust flakes');
  R(fx, c, 'mistRate', 0, 120, 1, 'mist per second');
  R(fx, c, 'mistSize', 0.02, 0.6, 0.005, 'mist size');
  R(fx, c, 'mistLife', 0.1, 3, 0.01, 'mist life');
  R(fx, c, 'sparkGlow', 0, 6, 0.05, 'droplet & mist glow');

  const land = sub(folder, '7 · The landing');
  R(land, c, 'impactShake', 0, 1, 0.01, 'camera knock');
  R(land, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(land, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(land, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(land, c, 'strikeShake', 0, 0.5, 0.005, 'knock per strike');
  R(land, c, 'crackRadius', 0.1, 3, 0.01, 'socket crack (m)');
  R(land, c, 'decalLife', 0.2, 10, 0.05, 'decals last (s)');
  R(land, c, 'shockwaveWidth', 0.01, 0.4, 0.005, 'shockwave width');
  R(land, c, 'burstReach', 0, 2, 0.01, 'splash shell (× radius)');
  R(land, c, 'burstLife', 0.05, 3, 0.01, 'splash life');
  R(land, c, 'burstIntensity', 0, 3, 0.01, 'splash brightness');
  R(land, c, 'burstOpacity', 0, 1, 0.01, 'splash opacity');
  color(land, c, 'colorBurstA', 'splash inner');
  color(land, c, 'colorBurstB', 'splash mid');
  color(land, c, 'colorBurstC', 'splash outer');

  const lens = sub(folder, '8 · The lens');
  R(lens, c, 'lensShock', 0, 3, 0.01, 'landing ring');
  R(lens, c, 'lensHaze', 0, 2, 0.01, 'pool shimmer');
  R(lens, c, 'lensStrike', 0, 3, 0.01, 'strike puff');

  return folder;
}
