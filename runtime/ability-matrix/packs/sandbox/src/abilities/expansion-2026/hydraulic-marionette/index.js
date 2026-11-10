import { Group, InstancedMesh, Mesh, Object3D, Quaternion, Vector3 } from 'three';
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
  createBarGeometry,
  createCrownGeometry,
  createDropGeometry,
  createQuad,
  createReservoirGeometry,
  createStringGeometry,
  writeString,
} from './geometry.js';
import {
  POOL_TIPS,
  createCrownMaterial,
  createLensMaterial,
  createLiquidMaterial,
  createPoolMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
export const UID = 'matrix-expansion/hydraulic-marionette';

const TAU = Math.PI * 2;
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
/** Shortest signed angle a − b, −π..π. */
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Strings per cast — the hard ceiling on tethered enemies. */
export const MAX_STRINGS = 6;
/** The feed line from the caster's hand is one more tube. */
const TUBES = MAX_STRINGS + 1;
const FEED = MAX_STRINGS;
/** Rings along every tube. */
const SEGMENTS = 40;
/** Splash crowns alive at once (6 hooks + 6 slams + the centre + spare). */
const MAX_CROWNS = 16;
/** Attach points on the control: four bar ends and two inner points on the main bar. */
const ATTACH = 6;

const _v = new Vector3();
const _w = new Vector3();
const _dir = new Vector3();
const _side = new Vector3();
const _a = new Vector3();
const _t = new Vector3();
const _hand = new Vector3();
const _feedEnd = new Vector3();
const _q = new Quaternion();
const _up = new Vector3(0, 1, 0);
const _o = new Object3D();
const _C = new Float32Array((SEGMENTS + 1) * 3);
const _R = new Float32Array(SEGMENTS + 1);
const _G = new Float32Array(SEGMENTS + 1);
/** Reused emit option bag (the particle system destructures, never retains). */
const _emit = {
  position: null, radius: 0, direction: null, speed: 1, speedVariance: 0.35, spread: 0.5,
  size: 0.1, sizeVariance: 0.4, life: 1, lifeVariance: 0.3, spin: 0, time: 0,
};
const _down = new Vector3(0, -1, 0);

/** A sharp periodic jerk: 0 → 1 at the tug, decaying over the cycle. */
function tug(cycle) {
  const f = cycle - Math.floor(cycle);
  return f < 0.4 ? 0 : Math.exp(-(f - 0.4) * 7);
}

/**
 * HYDRAULIC MARIONETTE — water, zone cast. *Liquid movement tether.*
 *
 * The caster works enemies like puppets on strings of water.
 *
 *  1. **anticipation** (`gatherTime`) — water spins up out of the air at the
 *     caster's hand and balls into a *spool*: the folded control, turning.
 *  2. **travel** — the spool is flung in an arc to the aimed circle, still
 *     tied to the hand by the **feed line**, a sagging cord of water that
 *     pays out behind it the whole way. As it flies it unfolds: the bars
 *     stretch out of the reservoir until it hangs over the circle as a
 *     puppeteer's control — a cross of pressurised water `controlHeight`
 *     up, its arms derived from `zoneRadius` so every string falls inside
 *     the circle whatever the radius.
 *  3. **impact** (`dropTime` after arrival) — up to six **strings** fall from
 *     the control and *hook*: one per enemy inside the circle, nearest
 *     first, the rest into the floor. On that frame each hooked enemy is
 *     yanked off its feet **toward the centre**, crowns of water splash up
 *     at every hook, the pool bursts out across the floor, the camera
 *     knocks and the light punches.
 *  4. **linger — the dance** (`holdTime`) — the control rocks like a
 *     puppeteer's hand and pulses are *pumped* down the strings, one string
 *     after another round the control (`tugStagger`), each landing as a
 *     jerk. Hooked bodies are hauled up to `puppetHeight` and inward to the
 *     `gatherRadius` ring under the control, bobbing and swinging on every
 *     tug; floor strings ring the pool with ripples on theirs. Drips run off
 *     every string and bar end; the pool ripples, glints and refracts.
 *  5. **the cut** (`cutTime`) — the control jerks up, the strings snap back
 *     into it and the puppets are **slammed** down into the pool on toward
 *     the centre: crowns, a splash dome, a shockwave, the heavier knock.
 *  6. **exit** (`exitTime`) — the control rains out through a noise
 *     dissolve, the pool drains away in patches.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the control** (`createLiquidMaterial`, world layer, shadows) — a
 *      lofted beaded main bar and crossbar, an onion reservoir with a spout,
 *      teardrop bulbs on the bar ends. The hero silhouette.
 *   2. **the strings** — six tubes plus the feed line, centrelines rewritten
 *      every frame (sag, a lateral ripple, a pumped bulge that lights them
 *      from inside), teardrop hooks on the tips. Same liquid shader.
 *   3. **the pool** (`createPoolMaterial`) — the dark wet spill on the floor,
 *      ripple rings off every tip, glints, foam lace; drains on exit.
 *   4. **crowns** (`createCrownMaterial`) — instanced splash crowns at every
 *      hook and every slam.
 *   5. **particles** — lit DROPLETs (gather, drips, splashes, the rain-out)
 *      and SMOKE spray puffs.
 *   6. **impact** — WATER splash dome, RIPPLE / FOAM / SHOCKWAVE decals,
 *      flash, camera knock, light punch, at the hook and the slam.
 *   7. **the lens** (`createLensMaterial`, `LAYER.DISTORTION`) — the pool
 *      refracts the floor; a pressure ring at the slam.
 *   8. **the light** — base class light following the spool, then hung
 *      under the control.
 *
 * ## The rule (`handlesOwnHits`)
 *
 * The tether is chosen once, on the hook frame: the `stringCount` (≤ 6)
 * nearest enemies inside `zoneRadius`. Each takes exactly two blows, both
 * pointed *at the centre* — the hook's yank and the cut's slam — and while
 * it is held its body is pinned to its string, so its movement belongs to
 * the control. Through the combat binding the hook also leaves the wet
 * tether status and a water region the size of the pool. Without a binding
 * the dummies are struck and pinned directly.
 *
 * ## The editor rule
 *
 * A record holds only dice and events: which body a string took, its
 * bearing and reach as fractions, a seed, which attach point it hangs from,
 * and the timestamps of crowns. Every metre, colour and second is read from
 * `settings.hydraulicMarionette` every frame.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return TUBES + MAX_STRINGS + 4 + MAX_CROWNS;
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get _life() {
    return Math.max(0.05, settings.global.lifetime);
  }

  get impactDuration() {
    const c = this.config;
    return Math.max(0.2, (c.dropTime + c.holdTime + c.cutTime) * this._life);
  }

  get fadeDuration() {
    return Math.max(0.1, this.config.exitTime * this._life);
  }

  /** The front waits at the hand while the water gathers (anticipation). */
  advance(dt) {
    if (this.age < this.config.gatherTime * this._life) {
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

    // 1 · the control
    this.liquid = own(createLiquidMaterial());
    this.control = new Group();
    this.group.add(this.control);
    const bar = own(createBarGeometry());
    this.mainBar = new Mesh(bar, this.liquid);
    this.crossBar = new Mesh(bar, this.liquid);
    this.crossBar.rotation.y = Math.PI / 2;
    this.reservoir = new Mesh(own(createReservoirGeometry()), this.liquid);
    const drop = own(createDropGeometry());
    this.ends = new InstancedMesh(drop, this.liquid, 4);
    this.ends.frustumCulled = false;
    for (const m of [this.mainBar, this.crossBar, this.reservoir, this.ends]) {
      m.castShadow = true;
      this.control.add(m);
    }

    // 2 · the strings, the feed line and the hooks
    this.stringLiquid = own(createLiquidMaterial({ glow: true }));
    this.tubes = [];
    for (let i = 0; i < TUBES; i++) {
      const tube = new Mesh(own(createStringGeometry(SEGMENTS, i === FEED ? 12 : 10)), this.stringLiquid);
      tube.frustumCulled = false;
      tube.castShadow = true;
      tube.visible = false;
      this.group.add(tube);
      this.tubes.push(tube);
    }
    this.hooks = new InstancedMesh(drop, this.liquid, MAX_STRINGS);
    this.hooks.frustumCulled = false;
    this.hooks.castShadow = true;
    this.group.add(this.hooks);

    // 3 · the pool
    this.poolMat = own(createPoolMaterial());
    this.pool = new Mesh(quad, this.poolMat);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.03;
    this.pool.renderOrder = 2;
    this.pool.frustumCulled = false;
    this.group.add(this.pool);

    // 4 · crowns
    this.crownMat = own(createCrownMaterial());
    this.crownGeo = own(createCrownGeometry(MAX_CROWNS));
    this.crowns = new InstancedMesh(this.crownGeo, this.crownMat, MAX_CROWNS);
    this.crowns.frustumCulled = false;
    this.crowns.renderOrder = 6;
    this.group.add(this.crowns);
    this._crownRec = [];
    for (let i = 0; i < MAX_CROWNS; i++) this._crownRec.push({ x: 0, z: 0, start: -1, slam: false, seed: 0 });

    // 7 · the lens (opaque proxy, see createLensMaterial)
    this.lensMat = own(createLensMaterial());
    this.lens = new Mesh(quad, this.lensMat);
    this.lens.rotation.x = -Math.PI / 2;
    this.lens.position.y = 0.25;
    this.lens.visible = false;
    this.group.add(this.lens);

    // Per-string records: dice and events only.
    this._slots = [];
    for (let i = 0; i < MAX_STRINGS; i++) {
      this._slots.push({
        active: false, body: false, dummy: null, actorId: null, bearing: 0, reach: 0, seed: 0, attach: 0, pinned: false,
      });
    }
    this._attachUsed = new Array(ATTACH).fill(false);
    this._centre = new Vector3();
    this._spool = new Vector3();
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._liquidState = { flash: 0, dissolve: 0 };
    this._stringState = { flash: 0, dissolve: 0 };
    this._poolState = { radius: 1, spread: 0, drain: 0, slam: -1, clock: 0 };
    this._lensState = { refract: 0, shock: 0, wave: 0, clock: 0 };
    this._drips = new RateEmitter();
    this._gather = new RateEmitter();
    this._rain = new RateEmitter();

    routeExpansionTransparency(this.group);
    this.lens.layers.set(LAYER.DISTORTION);
    this._disposed = false;
  }

  createParticles() {
    const particles = this.ctx.particles;
    this.dropSystem = particles?.get?.(`${ID}.drops`, {
      capacity: 1200, shape: ParticleShape.DROPLET, additive: false, lit: true, softFade: 0.3,
    }) ?? null;
    this.mistSystem = particles?.get?.(`${ID}.mist`, {
      capacity: 320, shape: ParticleShape.SMOKE, additive: false, curl: true, softFade: 1,
    }) ?? null;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this._chosen = false;
    this._hooked = false;
    this._cutDone = false;
    this._hits = 0;
    this._clock = 0;
    this._flash = 0;
    this._yaw = 0;
    this._calm = prefersReducedMotion();
    this._crownNext = 0;
    for (const r of this._crownRec) r.start = -1;
    for (const s of this._slots) this._clearSlot(s);
    this._drips.reset();
    this._gather.reset();
    this._rain.reset();
    this.pointAt(1, this._centre);
    this.control.visible = true;
    this.pool.visible = false;
    this.lens.visible = false;
    this.hooks.count = 0;
    for (const t of this.tubes) t.visible = false;
    this._sync(0);
  }

  onTravel(dt) {
    this._sync(dt);
    // The light rides with the spool.
    this.position.copy(this._spool);
  }

  onImpact() {
    this.pointAt(1, this._centre);
    this._centre.y = 0;
    // The tether is chosen as the control arrives, so the strings can be
    // seen falling onto it; the blows land when they hook.
    this._choose();
    this._sync(0);
  }

  onFade(dt) {
    const c = this.config;
    const L = this._life;
    const it = this.phase === 'fade' ? Infinity : this.impactTime;
    if (!this._chosen) this._choose();
    if (!this._hooked && it >= c.dropTime * L) this._hook();
    if (this._hooked && !this._cutDone && it >= (c.dropTime + c.holdTime) * L) this._cut();
    if (this._hooked && !this._cutDone) this._dance();
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The rule                                                            */
  /* ------------------------------------------------------------------ */

  _clearSlot(s) {
    s.active = false;
    s.body = false;
    s.dummy = null;
    s.actorId = null;
    s.pinned = false;
    s.bearing = 0;
    s.reach = 0;
    s.seed = 0;
    s.attach = 0;
  }

  /** The bar-end / inner attach point `k`, in the control's local space. */
  _attachLocal(k, out) {
    const c = this.config;
    const r = c.zoneRadius;
    const sM = r * c.controlSpan;
    const sC = r * c.crossSpan;
    const drop = c.bulbSize * 0.9;
    switch (k) {
      case 0: return out.set(sM, -drop, 0);
      case 1: return out.set(0, -drop, sC);
      case 2: return out.set(-sM, -drop, 0);
      case 3: return out.set(0, -drop, -sC);
      case 4: return out.set(sM * 0.48, -c.barThickness, 0);
      default: return out.set(-sM * 0.48, -c.barThickness, 0);
    }
  }

  /** Pick the free attach point that hangs most nearly over a bearing. */
  _pickAttach(bearing, reach) {
    let best = -1;
    let cost = Infinity;
    const R = Math.max(0.1, this.config.zoneRadius);
    for (let k = 0; k < ATTACH; k++) {
      if (this._attachUsed[k]) continue;
      this._attachLocal(k, _a);
      // Local +X turned by the control's yaw: world bearing of the attach point.
      const ang = Math.atan2(_a.z, _a.x) - this._yaw;
      const ar = Math.hypot(_a.x, _a.z) / R;
      const d = Math.abs(angleDelta(bearing, ang)) + 0.8 * Math.abs(ar - reach);
      if (d < cost) { cost = d; best = k; }
    }
    if (best < 0) best = 0;
    this._attachUsed[best] = true;
    return best;
  }

  /** Floor-relative bearing of a point from the centre (atan2(z, x)). */
  _bearingOf(x, z) {
    return Math.atan2(z - this._centre.z, x - this._centre.x);
  }

  /**
   * Choose the tether: the `stringCount` (≤ 6) nearest enemies inside the
   * circle, ties broken by id, each given the free attach point that hangs
   * most nearly over it. Strings left over will hook the floor.
   */
  _choose() {
    this._chosen = true;
    const c = this.config;
    const R = c.zoneRadius;
    const n = Math.max(0, Math.min(MAX_STRINGS, Math.round(c.stringCount)));
    const cx = this._centre.x;
    const cz = this._centre.z;
    this._attachUsed.fill(false);
    for (const s of this._slots) this._clearSlot(s);
    let used = 0;
    const take = (x, z, dummy, actorId) => {
      const d = Math.hypot(x - cx, z - cz);
      const s = this._slots[used++];
      s.active = true;
      s.body = true;
      s.dummy = dummy;
      s.actorId = actorId;
      s.bearing = d > 1e-4 ? Math.atan2(z - cz, x - cx) : Math.atan2(-this.direction.z, -this.direction.x);
      s.reach = R > 0 ? Math.min(1, d / R) : 0;
      s.seed = (used * 0.6180339887) % 1;
      s.attach = this._pickAttach(s.bearing, s.reach);
    };

    if (this._scope) {
      const found = this._scope.queryActors({ position: [cx, 0, cz], radius: R, relation: 'enemy' });
      if (!found.ok) this.failure = found.reason;
      else {
        // Nearest first, ties by id: deterministic whatever order the bridge returns.
        const list = this._found;
        list.length = 0;
        for (const a of found.actors) list.push(a);
        list.sort((p, q) => (Math.hypot(p.position[0] - cx, p.position[2] - cz) - Math.hypot(q.position[0] - cx, q.position[2] - cz)) || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
        for (const actor of list) {
          if (used >= n) break;
          if (Math.hypot(actor.position[0] - cx, actor.position[2] - cz) > R) continue;
          take(actor.position[0], actor.position[2], null, actor.id);
        }
        list.length = 0;
      }
    } else {
      const field = this.ctx.dummies;
      const found = field?.findTargets ? field.findTargets(cx, cz, R, this._found) : null;
      if (found) {
        for (const dummy of found) {
          if (used >= n) break;
          if (Math.hypot(dummy.position.x - cx, dummy.position.z - cz) > R) continue;
          take(dummy.position.x, dummy.position.z, dummy, null);
        }
        found.length = 0;
      }
    }

    // Strings with nobody to take hook the floor, under their attach point.
    for (let i = used; i < n; i++) {
      const s = this._slots[i];
      s.active = true;
      s.body = false;
      s.seed = ((i + 1) * 0.6180339887) % 1;
      s.attach = this._pickAttach(0, 0.7);
      this._attachLocal(s.attach, _a);
      s.bearing = Math.atan2(_a.z, _a.x) - this._yaw;
      s.reach = Math.min(0.92, (Math.hypot(_a.x, _a.z) / Math.max(0.1, R)) * 0.95);
    }
  }

  /**
   * The hook (the impact frame): every tethered enemy is yanked off its feet
   * toward the centre; through the bridge it also takes the wet tether
   * status, and the pool becomes a water region.
   */
  _hook() {
    this._hooked = true;
    const c = this.config;
    const R = c.zoneRadius;
    const power = settings.global.explosionIntensity;
    const cx = this._centre.x;
    const cz = this._centre.z;
    if (this._scope) {
      const hookForce = this._forceFor(c.hookImpulse, c.hookLift, c.hookSpin, power);
      const standalone = this._scope.standalone;
      const ticks = Math.max(1, Math.round(c.statusSeconds * (this._scope.tickRate || 30)));
      for (const s of this._slots) {
        if (!s.active || !s.actorId) continue;
        this._startPoint(s, _v);
        // The blow comes from *outside* the body, so it falls toward the centre.
        const ox = Math.cos(s.bearing);
        const oz = Math.sin(s.bearing);
        const sent = this._scope.emit({
          type: 'hit', element: 'water', targetIds: [s.actorId], position: [_v.x, 0, _v.z],
          sourcePosition: [_v.x + ox, 0, _v.z + oz], damage: c.hookDamage, hitForce: hookForce,
          tags: ['hydraulic-marionette', 'hook'],
        });
        if (!sent.ok) this.failure = sent.reason;
        else this._hits++;
        if (!standalone) {
          this._scope.emit({
            type: 'status', element: 'water', targetIds: [s.actorId], durationTicks: ticks,
            tags: ['hydraulic-marionette', 'tether'],
          });
        }
      }
      if (!standalone) {
        this._scope.emit({
          type: 'spawn', element: 'water', position: [cx, 0, cz],
          shape: { kind: 'disc', x: cx, z: cz, r: R * c.poolScale }, durationTicks: ticks,
          tags: ['hydraulic-marionette', 'pool'],
        });
      }
    } else {
      this._setForce(c.hookImpulse, c.hookLift, c.hookSpin, power);
      for (const s of this._slots) {
        const d = s.dummy;
        if (!s.active || !d || d.alive === false) continue;
        // Yanked inward: the direction of the blow points at the centre.
        if (d.kill(-Math.cos(s.bearing), -Math.sin(s.bearing), this._force)) this._hits++;
      }
    }
    this._hookFX();
  }

  _setForce(impulse, lift, spin, power) {
    this._force.impulse = Math.min(24, Math.max(0, impulse * power));
    this._force.lift = Math.min(20, Math.max(0, lift * power));
    this._force.spin = Math.min(8, Math.max(0, spin));
    return this._force;
  }

  _forceFor(impulse, lift, spin, power) {
    return impactForce({ hitImpulse: impulse, hitLift: lift, hitSpin: spin }, power);
  }

  /** Where string `i`'s body starts — its hook point on the floor plan. */
  _startPoint(s, out) {
    const R = this.config.zoneRadius;
    // A floor string turns with the control, so it always hangs under its attach point.
    if (!s.body && s.active) {
      this._attachLocal(s.attach, _w);
      s.bearing = Math.atan2(_w.z, _w.x) - this._yaw;
    }
    return out.set(this._centre.x + Math.cos(s.bearing) * s.reach * R, 0, this._centre.z + Math.sin(s.bearing) * s.reach * R);
  }

  /** Each held frame: find the felled bodies the bridge struck, pin them to their strings. */
  _dance() {
    const c = this.config;
    const field = this.ctx.dummies;
    for (let i = 0; i < MAX_STRINGS; i++) {
      const s = this._slots[i];
      if (!s.active || !s.body) continue;
      if (!s.dummy && s.actorId && field?.findBodies) {
        // Through the bridge the hit is attributed by id; the body that fell
        // is the nearest corpse to where the actor stood, not already claimed.
        this._startPoint(s, _v);
        const bodies = field.findBodies(_v.x, _v.z, 1.6, this._found);
        for (const b of bodies) {
          if (b.alive || this._claimed(b)) continue;
          s.dummy = b;
          break;
        }
      }
      const d = s.dummy;
      if (!d || d.alive || d.finished) continue;
      this._tip(i, _t);
      d.hold?.();
      if (d.pin?.(c.pinJoint, _t, c.pinStiffness)) s.pinned = true;
    }
  }

  _claimed(body) {
    for (const s of this._slots) if (s.dummy === body) return true;
    return false;
  }

  /** The cut: let go and slam every puppet down into the pool, toward the centre. */
  _cut() {
    this._cutDone = true;
    const c = this.config;
    const power = settings.global.explosionIntensity;
    for (let i = 0; i < MAX_STRINGS; i++) {
      const s = this._slots[i];
      if (!s.active) continue;
      const ix = -Math.cos(s.bearing);
      const iz = -Math.sin(s.bearing);
      const d = s.dummy;
      if (d) {
        d.unpin?.();
        if (d.alive) {
          // Never knocked down (the hook was refused): the slam fells it.
          if (!this._scope && d.kill(ix, iz, this._setForce(c.slamImpulse, 0.5, c.slamSpin, power))) this._hits++;
        } else {
          d.shove?.(ix * c.slamImpulse * power, -c.slamDown * power, iz * c.slamImpulse * power);
          d.release?.();
        }
      }
      if (this._scope && s.actorId) {
        const got = this._scope.getActor(s.actorId);
        if (got.ok && got.actor.alive) {
          this._startPoint(s, _v);
          const sent = this._scope.emit({
            type: 'hit', element: 'water', targetIds: [s.actorId], position: [_v.x, 0, _v.z],
            sourcePosition: [_v.x - ix, 0, _v.z - iz], damage: c.cutDamage,
            hitForce: this._forceFor(c.slamImpulse, 0.5, c.slamSpin, power), tags: ['hydraulic-marionette', 'slam'],
          });
          if (!sent.ok) this.failure = sent.reason;
          else this._hits++;
        }
      }
      // Let go; `pinned` stays so the string snaps back from where it held.
      s.dummy = null;
      // A crown where the puppet lands (under its tip, on the ring).
      if (s.body) {
        this._tip(i, _t);
        this._crown(_t.x, _t.z, true);
      }
    }
    this._slamFX();
  }

  /* ------------------------------------------------------------------ */
  /* Impact presentation                                                 */
  /* ------------------------------------------------------------------ */

  _crown(x, z, slam) {
    const r = this._crownRec[this._crownNext];
    this._crownNext = (this._crownNext + 1) % MAX_CROWNS;
    r.x = x;
    r.z = z;
    r.slam = slam;
    r.start = this.age;
    r.seed = (this._crownNext * 0.37 + (slam ? 0.5 : 0)) % 1;
  }

  _splash(pos, scale) {
    const c = this.config;
    const g = settings.global;
    if (this.dropSystem) {
      _emit.position = pos;
      _emit.radius = 0.12 * scale;
      _emit.direction = _up;
      _emit.speed = c.splashSpeed * g.particleSpeed * scale;
      _emit.speedVariance = 0.45;
      _emit.spread = 0.55;
      _emit.size = c.splashSize * g.particleSize;
      _emit.sizeVariance = 0.5;
      _emit.life = c.splashLife * g.particleLifetime;
      _emit.lifeVariance = 0.3;
      _emit.spin = 0;
      _emit.time = frame.uTime.value;
      this.dropSystem.emit(Math.min(128, Math.round(c.splashCount * scale * g.particleCount)), _emit);
    }
    if (this.mistSystem) {
      _emit.position = pos;
      _emit.radius = 0.3 * scale;
      _emit.direction = _up;
      _emit.speed = c.mistSpeed * g.particleSpeed;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.9;
      _emit.size = c.mistSize * g.particleSize * Math.sqrt(scale);
      _emit.sizeVariance = 0.4;
      _emit.life = c.mistLife * g.particleLifetime;
      _emit.lifeVariance = 0.3;
      _emit.spin = 0.6;
      _emit.time = frame.uTime.value;
      this.mistSystem.emit(Math.min(64, Math.round(c.mistCount * scale * g.particleCount)), _emit);
    }
  }

  _hookFX() {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    for (let i = 0; i < MAX_STRINGS; i++) {
      const s = this._slots[i];
      if (!s.active) continue;
      this._startPoint(s, _v);
      _v.y = 0.05;
      this._crown(_v.x, _v.z, false);
      this._splash(_v, 1);
      this.ctx.decals?.spawn?.(DecalType.RIPPLE, _v, {
        radius: 1.1, life: c.decalLife, intensity: c.rippleIntensity,
        colorA: getColor(c.colorTint), colorB: getColor(c.colorDeep),
      });
    }
    _v.copy(this._centre).setY(0.05);
    this.ctx.decals?.spawn?.(DecalType.FOAM, _v, {
      radius: c.zoneRadius * c.poolScale, life: c.decalLife, intensity: c.foamIntensity,
      colorA: getColor(c.colorTint), colorB: getColor(c.colorBody),
    });
    this.lightBoost = c.hookLight * power;
    this._flash = 1;
    if (c.hookShake > 0) this.ctx.shake?.add?.(c.hookShake * power * settings.global.cameraShake, c.shakeDecay, c.shakeFrequency);
    if (c.hookFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorTint), c.hookFlash * power);
  }

  _slamFX() {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    const R = c.zoneRadius;
    _v.copy(this._centre).setY(0.05);
    this._crown(_v.x, _v.z, true);
    this._splash(_v, 1.8);
    this.ctx.bursts?.spawn?.(BurstMode.WATER, _v, {
      radius: R * 0.12,
      endRadius: R * c.burstReach * power,
      life: c.burstLife * this._life,
      intensity: c.burstIntensity,
      opacity: c.burstOpacity * settings.global.opacity,
      fresnel: c.burstFresnel,
      squash: c.burstSquash,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _v, {
      radius: R * c.poolScale * power, life: c.decalLife * 0.5, width: c.shockwaveWidth, intensity: c.shockwaveIntensity,
      colorA: getColor(c.colorCore), colorB: getColor(c.colorBody),
    });
    this.ctx.decals?.spawn?.(DecalType.RIPPLE, _v, {
      radius: R * 0.9, life: c.decalLife, intensity: c.rippleIntensity,
      colorA: getColor(c.colorTint), colorB: getColor(c.colorDeep),
    });
    for (let i = 0; i < MAX_CROWNS; i++) {
      const r = this._crownRec[i];
      if (!r.slam || r.start !== this.age) continue;
      _w.set(r.x, 0.1, r.z);
      this._splash(_w, 1.2);
    }
    this.lightBoost = c.slamLight * power;
    this._flash = 1.4;
    if (c.slamShake > 0) this.ctx.shake?.add?.(c.slamShake * power * settings.global.cameraShake, c.shakeDecay, c.shakeFrequency);
    if (c.slamFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorCore), c.slamFlash * power);
  }

  /* ------------------------------------------------------------------ */
  /* The choreography — everything resolved from settings, every frame  */
  /* ------------------------------------------------------------------ */

  /** Seconds since the hook (−1 before it). */
  get _held() {
    if (!this._hooked) return -1;
    const L = this._life;
    const it = this.phase === 'fade' ? this.impactDuration + this.fadeTime : this.impactTime;
    return it - this.config.dropTime * L;
  }

  /** Tug cycle of string `i` (the rolling wave round the control). */
  _cycle(i) {
    const c = this.config;
    return Math.max(0, this._held - i * c.tugStagger * this._life) * c.danceRate;
  }

  /**
   * Where string `i` ends, in the world. A hooked body is hauled up to
   * `puppetHeight` and in to the `gatherRadius` ring, then bobs and swings
   * on every tug; a floor string stays in the floor.
   */
  _tip(i, out) {
    const c = this.config;
    const s = this._slots[i];
    const R = c.zoneRadius;
    this._startPoint(s, out);
    if (!s.body) return out.setY(0.02);
    out.y = 1.05;
    const held = Math.max(0, this._held);
    const hoist = s.pinned ? Easing.outCubic(clamp(held / Math.max(0.05, c.hoistTime * this._life))) : 0;
    const jerk = tug(this._cycle(i));
    const calm = this._calm ? 0 : 1;
    const ang = s.bearing + calm * (c.danceSway / Math.max(0.3, R * c.gatherRadius)) * Math.sin(held * 2.3 + s.seed * TAU) * hoist;
    const ring = R * c.gatherRadius;
    _w.set(this._centre.x + Math.cos(ang) * ring, c.puppetHeight + c.danceBob * jerk, this._centre.z + Math.sin(ang) * ring);
    return out.lerp(_w, hoist);
  }

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const L = this._life;
    const R = c.zoneRadius;
    if (!this._calm) this._clock += dt * g.animationSpeed;
    const clock = this._clock;
    this._flash = Math.max(0, this._flash - dt * 4);

    const travel = this.phase === 'travel';
    const fading = this.phase === 'fade';
    const gather = clamp(this.age / Math.max(0.01, c.gatherTime * L));
    const flight = travel ? this.u : 1;
    const it = fading ? this.impactDuration : this.impactTime;
    const dropP = travel ? 0 : clamp(it / Math.max(0.01, c.dropTime * L));
    const cutStart = (c.dropTime + c.holdTime) * L;
    const cutP = travel || !this._cutDone ? 0 : clamp((it + (fading ? this.fadeTime : 0) - cutStart) / Math.max(0.01, c.cutTime * L));
    const exitP = fading ? clamp(this.fadeTime / this.fadeDuration) : 0;
    const held = this._held;

    /* ---- the hand ---- */
    const ch = this.ctx.character?.position;
    if (ch) _hand.set(ch.x, 0, ch.z);
    else _hand.copy(this.origin);
    _hand.addScaledVector(this.direction, 0.45).setY(c.handHeight);

    /* ---- 1 · the control ---- */
    if (travel) this.pointAt(1, this._centre);
    const H = c.controlHeight;
    if (travel) {
      const p = smooth(flight);
      this._spool.set(lerp(_hand.x, this._centre.x, p), lerp(_hand.y, H, p) + c.arcLift * Math.sin(Math.PI * p), lerp(_hand.z, this._centre.z, p));
    } else {
      const rise = c.yankRise * (cutP < 0.3 ? Easing.outCubic(cutP / 0.3) : 1 - 0.4 * smooth((cutP - 0.3) / 0.7));
      const settle = 0.18 * Math.sin(dropP * Math.PI) * (1 - dropP * 0.5);
      this._spool.set(this._centre.x, H + rise - settle - exitP * 0.5, this._centre.z);
    }
    this.control.position.copy(this._spool);
    const unfurl = travel ? smooth((flight - 0.15) / 0.75) : 1;
    const spoolScale = travel ? lerp(c.spoolScale, 1, unfurl) * (0.25 + 0.75 * smooth(gather)) : 1;
    this.control.scale.setScalar(Math.max(0.001, spoolScale));
    const calm = this._calm ? 0 : 1;
    const dancing = travel ? 0 : clamp(held / 0.4) * (1 - cutP);
    this._yaw = travel ? calm * (1 - unfurl) * clock * 6 : this._yaw + dt * c.spinRate * calm * g.animationSpeed;
    const rockT = clock * c.rockRate * TAU;
    this.control.rotation.set(
      calm * c.rockAngle * dancing * Math.sin(rockT),
      this._yaw,
      calm * c.rockAngle * dancing * Math.sin(rockT * 0.73 + 1.3) + (travel ? calm * (1 - unfurl) * 0.6 : 0),
    );
    const sM = R * c.controlSpan * lerp(0.15, 1, unfurl);
    const sC = R * c.crossSpan * lerp(0.15, 1, unfurl);
    this.mainBar.scale.set(sM * 2, c.barThickness, c.barThickness);
    this.crossBar.scale.set(sC * 2, c.barThickness, c.barThickness);
    this.reservoir.scale.setScalar(c.knuckleSize);
    this.reservoir.position.y = -c.knuckleSize * 0.05;
    for (let k = 0; k < 4; k++) {
      const x = k === 0 ? sM : k === 2 ? -sM : 0;
      const z = k === 1 ? sC : k === 3 ? -sC : 0;
      // The end beads swell with each pumped tug.
      const swell = 1 + 0.25 * (travel ? 0 : tug(this._cycle(k)) * dancing);
      _o.position.set(x, -c.bulbSize * 0.25, z);
      _o.rotation.set(0, 0, 0);
      _o.scale.setScalar(c.bulbSize * swell);
      _o.updateMatrix();
      this.ends.setMatrixAt(k, _o.matrix);
    }
    this.ends.instanceMatrix.needsUpdate = true;
    this.control.updateMatrixWorld(true);
    const ls = this._liquidState;
    ls.flash = this._flash;
    ls.dissolve = Easing.inQuad(exitP) * 1.05;
    this.liquid.userData.sync(ls);
    this.control.visible = exitP < 1;

    /* ---- 2 · strings and hooks ---- */
    const showStrings = !travel && !fading && cutP < 1;
    let hookCount = 0;
    for (let i = 0; i < MAX_STRINGS; i++) {
      const tube = this.tubes[i];
      const s = this._slots[i];
      tube.visible = showStrings && s.active;
      if (!tube.visible) continue;
      this._attachLocal(s.attach, _a);
      _a.applyMatrix4(this.control.matrixWorld);
      this._tip(i, _t);
      // Falls from the attach point on the drop; snaps back up at the cut.
      const reach = Easing.inQuad(dropP) * (1 - Easing.outCubic(cutP));
      _t.lerpVectors(_a, _t, reach);
      const cycle = this._cycle(i);
      const f = cycle - Math.floor(cycle);
      const jerk = this._hooked ? tug(cycle) : 0;
      const tension = this._hooked ? 0.35 + 0.65 * jerk : 0.1;
      const pulseAt = held > 0 && f < 0.42 ? f / 0.4 : -1;
      this._writeTube(tube, _a, _t, {
        radius: c.stringRadius,
        sag: c.stringSag * (1 - tension) * reach,
        wave: calm * c.stringWave * (1 - 0.5 * tension),
        seed: s.seed,
        pulseAt,
        taper: 1.35,
      });
      // The hook: a bead with its neck up the string.
      _dir.set(_C[(SEGMENTS - 3) * 3] - _t.x, _C[(SEGMENTS - 3) * 3 + 1] - _t.y, _C[(SEGMENTS - 3) * 3 + 2] - _t.z);
      if (_dir.lengthSq() < 1e-8) _dir.set(0, 1, 0);
      _dir.normalize();
      _q.setFromUnitVectors(_up, _dir);
      _o.position.copy(_t);
      _o.quaternion.copy(_q);
      _o.scale.setScalar(c.hookSize * (0.35 + 0.65 * reach) * (1 + 0.3 * jerk));
      _o.updateMatrix();
      this.hooks.setMatrixAt(hookCount++, _o.matrix);
    }
    this.hooks.count = hookCount;
    this.hooks.instanceMatrix.needsUpdate = true;

    // The feed line: hand → spool on the flight, hand → reservoir spout after.
    const feed = this.tubes[FEED];
    _feedEnd.set(0, c.knuckleSize * 1.05, 0).applyMatrix4(this.control.matrixWorld);
    const feedCut = Easing.outCubic(cutP);
    feed.visible = !fading && feedCut < 1 && _hand.distanceToSquared(_feedEnd) > 0.04 && (travel ? this.age > c.gatherTime * L * 0.6 : true);
    if (feed.visible) {
      // At the cut the line lets go of the control and whips back to the hand.
      _feedEnd.lerp(_hand, feedCut);
      const pump = (clock * c.danceRate) % 1;
      this._writeTube(feed, _hand, _feedEnd, {
        radius: c.feedRadius,
        sag: c.feedSag * (travel ? 0.5 : 1),
        wave: calm * c.stringWave * 0.6,
        seed: 0.31,
        pulseAt: travel ? -1 : pump,
        taper: 0.8,
      });
    }
    const ss = this._stringState;
    ss.flash = this._flash;
    ss.dissolve = 0;
    this.stringLiquid.userData.sync(ss);

    /* ---- 3 · the pool ---- */
    const spread = this._hooked ? smooth(held / Math.max(0.05, c.poolSpread * L)) : 0;
    const drain = smooth(exitP / Math.max(0.05, c.poolDrain));
    this.pool.visible = this._hooked && drain < 1;
    if (this.pool.visible) {
      const pr = R * c.poolScale;
      this.pool.position.set(this._centre.x, 0.03, this._centre.z);
      this.pool.scale.set(pr * 2, pr * 2, 1);
      const tips = this.poolMat.uniforms.uTips.value;
      for (let i = 0; i < POOL_TIPS; i++) tips[i].set(0, 0, 0, 0);
      for (let i = 0; i < MAX_STRINGS; i++) {
        const s = this._slots[i];
        if (!s.active) continue;
        this._tip(i, _t);
        const body = s.body;
        // Floor strings stir the pool hard; a hoisted body drips rings below it.
        const energy = (body ? 0.35 : 0.7) * (0.5 + 0.5 * tug(this._cycle(i))) * (1 - cutP);
        tips[i].set((_t.x - this._centre.x) / pr, (_t.z - this._centre.z) / pr, energy, Math.max(0, held) + s.seed * 3);
      }
      // The hook's splash ring from the centre, dying away.
      tips[MAX_STRINGS].set(0, 0, 1.2 * Math.exp(-Math.max(0, held) * 2.5), Math.max(0, held));
      const ps = this._poolState;
      ps.radius = pr;
      ps.spread = spread;
      ps.drain = drain;
      ps.slam = this._cutDone && cutP < 1 ? Easing.outCubic(cutP) : -1;
      ps.clock = clock;
      this.poolMat.userData.sync(ps);
    }

    /* ---- 4 · crowns ---- */
    const crownLife = Math.max(0.05, c.crownLife * L);
    const attr = this.crownGeo.attributes.aCrown;
    for (let i = 0; i < MAX_CROWNS; i++) {
      const r = this._crownRec[i];
      const life = r.start < 0 ? -1 : (this.age - r.start) / crownLife;
      attr.array[i * 2] = life >= 0 && life < 1 ? Math.max(0.001, life) : -1;
      attr.array[i * 2 + 1] = r.seed;
      const k = r.slam ? c.crownSlam : 1;
      _o.position.set(r.x, 0.02, r.z);
      _o.rotation.set(0, r.seed * TAU, 0);
      _o.scale.set(c.crownWidth * k, c.crownHeight * k, c.crownWidth * k);
      _o.updateMatrix();
      this.crowns.setMatrixAt(i, _o.matrix);
    }
    attr.needsUpdate = true;
    this.crowns.instanceMatrix.needsUpdate = true;
    this.crownMat.userData.sync();

    /* ---- 5 · particles ---- */
    this._particles(dt, travel, gather, exitP, dancing);

    /* ---- 7 · the lens ---- */
    const lsn = this._lensState;
    lsn.refract = spread * (1 - drain);
    lsn.shock = this._cutDone && cutP < 1 ? 1 - cutP : 0;
    lsn.wave = Easing.outCubic(cutP);
    lsn.clock = clock;
    this.lens.visible = !this._calm && this._hooked && (lsn.refract * c.lensStrength + lsn.shock * c.lensShock) * g.distortion > 0.002;
    if (this.lens.visible) {
      this.lens.position.set(this._centre.x, 0.25, this._centre.z);
      this.lens.scale.set(R * c.poolScale * 2.1, R * c.poolScale * 2.1, 1);
      this.lensMat.userData.sync(lsn);
    }

    /* ---- 8 · the light hangs under the control after the flight ---- */
    if (!travel) this.position.set(this._centre.x, Math.max(1.2, this._spool.y - 1.6), this._centre.z);
  }

  /**
   * Rewrite one tube between `a` (bar) and `b` (tip): a sag that drops out
   * as the string pulls taut, a lateral ripple running down it, a taper,
   * and a pumped pulse (`pulseAt` 0..1 down the string, −1 for none) that
   * swells and lights it.
   */
  _writeTube(tube, a, b, o) {
    const c = this.config;
    _side.set(b.z - a.z, 0, a.x - b.x);
    if (_side.lengthSq() < 1e-8) _side.set(1, 0, 0);
    _side.normalize();
    const t = this._clock;
    for (let k = 0; k <= SEGMENTS; k++) {
      const s = k / SEGMENTS;
      const bell = 4 * s * (1 - s);
      const lateral = o.wave * Math.sin(Math.PI * s) * Math.sin(c.stringWaveFreq * TAU * s - c.stringWaveSpeed * t + o.seed * TAU);
      _C[k * 3] = lerp(a.x, b.x, s) + _side.x * lateral;
      _C[k * 3 + 1] = lerp(a.y, b.y, s) - o.sag * bell;
      _C[k * 3 + 2] = lerp(a.z, b.z, s) + _side.z * lateral;
      const pulse = o.pulseAt >= 0 ? Math.exp(-Math.pow((s - o.pulseAt) / 0.07, 2)) : 0;
      _G[k] = pulse;
      _R[k] = o.radius * lerp(o.taper, 1, s) * (1 + c.tugBulge * pulse);
    }
    writeString(tube.geometry, _C, _R, _G);
  }

  _particles(dt, travel, gather, exitP, dancing) {
    const c = this.config;
    const g = settings.global;
    this._syncParticles();
    const drops = this.dropSystem;
    if (!drops) return;
    const time = frame.uTime.value;
    // Anticipation: water spun up into the spool at the hand.
    if (travel && gather < 1) {
      const n = this._gather.tick(dt, c.gatherRate * g.particleCount);
      if (n > 0) {
        _emit.position = this._spool;
        _emit.radius = 0.55;
        _emit.direction = _up;
        _emit.speed = 0.8 * g.particleSpeed;
        _emit.speedVariance = 0.5;
        _emit.spread = 1;
        _emit.size = c.dripSize * g.particleSize;
        _emit.sizeVariance = 0.4;
        _emit.life = 0.4 * g.particleLifetime;
        _emit.lifeVariance = 0.3;
        _emit.spin = 0;
        _emit.time = time;
        drops.emit(n, _emit);
      }
    }
    // Drips off the strings and the bar ends while the dance runs.
    if (dancing > 0.01) {
      let n = this._drips.tick(dt, c.dripRate * MAX_STRINGS * g.particleCount);
      for (let guard = 0; n > 0 && guard < 64; guard++, n--) {
        const i = Math.floor(Math.random() * (MAX_STRINGS + 1));
        if (i < MAX_STRINGS) {
          const s = this._slots[i];
          if (!s.active) continue;
          this._tip(i, _t);
          this._attachLocal(s.attach, _a);
          _a.applyMatrix4(this.control.matrixWorld);
          _v.lerpVectors(_a, _t, 0.25 + Math.random() * 0.75);
        } else {
          this._attachLocal(Math.floor(Math.random() * 4), _v);
          _v.applyMatrix4(this.control.matrixWorld);
        }
        _emit.position = _v;
        _emit.radius = 0.05;
        _emit.direction = _down;
        _emit.speed = c.dripSpeed * g.particleSpeed;
        _emit.speedVariance = 0.4;
        _emit.spread = 0.15;
        _emit.size = c.dripSize * g.particleSize;
        _emit.sizeVariance = 0.35;
        _emit.life = c.dripLife * g.particleLifetime;
        _emit.lifeVariance = 0.25;
        _emit.spin = 0;
        _emit.time = time;
        drops.emit(1, _emit);
      }
    }
    // The exit: the control rains out.
    if (exitP > 0 && exitP < 0.9) {
      const n = this._rain.tick(dt, c.rainRate * g.particleCount);
      if (n > 0) {
        _emit.position = this._spool;
        _emit.radius = c.zoneRadius * c.controlSpan * 0.8;
        _emit.direction = _down;
        _emit.speed = 1.5 * g.particleSpeed;
        _emit.speedVariance = 0.4;
        _emit.spread = 0.2;
        _emit.size = c.dripSize * g.particleSize;
        _emit.sizeVariance = 0.4;
        _emit.life = c.dripLife * g.particleLifetime;
        _emit.lifeVariance = 0.3;
        _emit.spin = 0;
        _emit.time = time;
        drops.emit(Math.min(n, 64), _emit);
      }
    }
  }

  /** Mirror the particle look from settings every frame (no-op on stubs). */
  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    const d = this.dropSystem;
    if (d?.uniforms) {
      d.setGradient?.(getColor(c.colorDropA), getColor(c.colorDropB), getColor(c.colorDropC), getColor(c.colorDropD));
      const u = d.uniforms;
      u.uGravity?.value?.set?.(0, c.dripGravity, 0);
      if (u.uDrag) u.uDrag.value = 0.3;
      if (u.uGlow) u.uGlow.value = c.dropletGlow * g.glow;
      if (u.uOpacity) u.uOpacity.value = g.opacity;
      if (u.uSizeScale) u.uSizeScale.value = 1;
      if (u.uEndSize) u.uEndSize.value = 0.7;
      if (u.uFadeOut) u.uFadeOut.value = 0.7;
    }
    const m = this.mistSystem;
    if (m?.uniforms) {
      m.setGradient?.(getColor(c.colorMistA), getColor(c.colorMistB), getColor(c.colorMistC), getColor(c.colorMistD));
      const u = m.uniforms;
      u.uGravity?.value?.set?.(0, 0.3, 0);
      if (u.uDrag) u.uDrag.value = 1.6;
      if (u.uGlow) u.uGlow.value = g.glow;
      if (u.uOpacity) u.uOpacity.value = 0.55 * g.opacity;
      if (u.uEndSize) u.uEndSize.value = 1.8;
      if (u.uTurbulence) u.uTurbulence.value = 0.6 * g.turbulence;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    // Never leave a body hanging off a string that no longer exists.
    for (const s of this._slots) {
      if (s.dummy) {
        s.dummy.unpin?.();
        s.dummy.release?.();
      }
      this._clearSlot(s);
    }
    this._scope = null;
    this._hooked = false;
    this._cutDone = false;
    this.control.visible = false;
    this.pool.visible = false;
    this.lens.visible = false;
    this.hooks.count = 0;
    for (const t of this.tubes) t.visible = false;
    for (const r of this._crownRec) r.start = -1;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    for (const r of this.resources) r.dispose();
    this.ends.dispose?.();
    this.hooks.dispose?.();
    this.crowns.dispose?.();
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
  const gradient = (f, c, prefix, title) => {
    if (Editor?.gradient && typeof f.addFolder === 'function') return Editor.gradient(f, c, prefix, title);
    for (const s of ['A', 'B', 'C', 'D']) color(f, c, prefix + s, `${title} ${s}`);
    return f;
  };
  const castAnim = (f, c) => (Editor?.castAnimation ? Editor.castAnimation(f, c) : f.add(c, 'castAnim', CAST_ANIMATIONS));
  return { R, sub, color, gradient, castAnim };
}

const JOINTS = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'];

export function buildEditor(gui, c, Editor) {
  const { R, sub, color, gradient, castAnim } = editorKit(Editor);
  const folder = gui.addFolder('✥  Hydraulic Marionette');

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 60, 0.5, 'spool flies at (m/s)');
  R(cast, c, 'zoneRadius', 1, 8, 0.05, 'circle radius (m)');
  R(cast, c, 'lifetime', 0.5, 8, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'cooldown', 0, 15, 0.05, 'cooldown');
  castAnim(cast, c);

  const tether = sub(folder, 'The tether (gameplay)');
  R(tether, c, 'stringCount', 0, MAX_STRINGS, 1, 'strings / max tethered');
  R(tether, c, 'gatherTime', 0.05, 1, 0.01, 'gathers at the hand (s)');
  R(tether, c, 'dropTime', 0.02, 0.6, 0.01, 'strings fall (s)');
  R(tether, c, 'holdTime', 0.3, 4, 0.05, 'the dance (s)');
  R(tether, c, 'cutTime', 0.05, 1, 0.01, 'the cut (s)');
  R(tether, c, 'exitTime', 0.1, 2, 0.01, 'rain-out (s)');
  R(tether, c, 'hookDamage', 0, 5, 0.1, 'hook damage');
  R(tether, c, 'cutDamage', 0, 5, 0.1, 'slam damage');
  R(tether, c, 'statusSeconds', 0, 10, 0.1, 'wet tether status (s)');
  R(tether, c, 'hookImpulse', 0, 20, 0.1, 'hook yank inward');
  R(tether, c, 'hookLift', 0, 15, 0.1, 'hook lift');
  R(tether, c, 'hookSpin', 0, 8, 0.05, 'hook spin');
  R(tether, c, 'slamImpulse', 0, 20, 0.1, 'slam inward');
  R(tether, c, 'slamDown', 0, 30, 0.1, 'slam down');
  R(tether, c, 'slamSpin', 0, 8, 0.05, 'slam spin');
  R(tether, c, 'pinStiffness', 0, 1, 0.01, 'string grip');
  tether.add(c, 'pinJoint', JOINTS).name?.('hooked joint');

  const dance = sub(folder, 'The dance');
  R(dance, c, 'puppetHeight', 0.5, 3.5, 0.01, 'hoisted to (m)');
  R(dance, c, 'gatherRadius', 0, 1, 0.01, 'hauled in to (× radius)');
  R(dance, c, 'hoistTime', 0.05, 2, 0.01, 'hoist takes (s)');
  R(dance, c, 'danceRate', 0, 5, 0.05, 'tugs per second');
  R(dance, c, 'tugStagger', 0, 0.5, 0.005, 'tug wave stagger (s)');
  R(dance, c, 'danceBob', 0, 1.5, 0.01, 'tug jerk (m)');
  R(dance, c, 'danceSway', 0, 1.5, 0.01, 'swing (m)');

  const ctl = sub(folder, '1 · The control');
  R(ctl, c, 'controlHeight', 1.5, 8, 0.05, 'hangs at (m)');
  R(ctl, c, 'controlSpan', 0.2, 1.2, 0.01, 'main bar (× radius)');
  R(ctl, c, 'crossSpan', 0.1, 1.2, 0.01, 'crossbar (× radius)');
  R(ctl, c, 'barThickness', 0.03, 0.5, 0.005, 'bar radius (m)');
  R(ctl, c, 'knuckleSize', 0.1, 1.5, 0.01, 'reservoir (m)');
  R(ctl, c, 'bulbSize', 0.05, 0.8, 0.01, 'end beads (m)');
  R(ctl, c, 'rockAngle', 0, 0.8, 0.01, 'rock (rad)');
  R(ctl, c, 'rockRate', 0, 4, 0.05, 'rocks per second');
  R(ctl, c, 'spinRate', -2, 2, 0.01, 'turn (rad/s)');
  R(ctl, c, 'yankRise', 0, 3, 0.01, 'jerk up at the cut (m)');
  R(ctl, c, 'arcLift', 0, 5, 0.05, 'flight arc (m)');
  R(ctl, c, 'handHeight', 0.3, 2.5, 0.01, 'hand height (m)');
  R(ctl, c, 'spoolScale', 0.05, 1, 0.01, 'spool size');

  const str = sub(folder, '2 · The strings');
  R(str, c, 'stringRadius', 0.01, 0.2, 0.002, 'string radius (m)');
  R(str, c, 'stringSag', 0, 2, 0.01, 'slack sag (m)');
  R(str, c, 'stringWave', 0, 0.6, 0.005, 'ripple (m)');
  R(str, c, 'stringWaveFreq', 0, 8, 0.05, 'ripples along');
  R(str, c, 'stringWaveSpeed', 0, 20, 0.1, 'ripple speed');
  R(str, c, 'tugBulge', 0, 3, 0.01, 'pulse swell');
  R(str, c, 'tugGlow', 0, 8, 0.05, 'pulse light');
  R(str, c, 'hookSize', 0.05, 0.8, 0.01, 'hook bead (m)');
  R(str, c, 'feedRadius', 0.01, 0.25, 0.002, 'feed line radius (m)');
  R(str, c, 'feedSag', 0, 3, 0.01, 'feed line sag (m)');

  const liq = sub(folder, '3 · The liquid');
  color(liq, c, 'colorCore', 'core (white-hot)');
  color(liq, c, 'colorTint', 'tint (rim, caustics)');
  color(liq, c, 'colorBody', 'body (water)');
  color(liq, c, 'colorDeep', 'deep');
  R(liq, c, 'liquidGloss', 4, 400, 1, 'gloss');
  R(liq, c, 'liquidSpecular', 0, 8, 0.05, 'specular');
  R(liq, c, 'liquidEnv', 0, 3, 0.01, 'reflection');
  R(liq, c, 'liquidFresnel', 0.3, 8, 0.05, 'rim power');
  R(liq, c, 'liquidRim', 0, 4, 0.01, 'rim light');
  R(liq, c, 'liquidFlow', 0, 6, 0.05, 'flow speed');
  R(liq, c, 'liquidRipple', 0, 2, 0.01, 'surface ripple');
  R(liq, c, 'liquidCaustic', 0, 3, 0.01, 'caustics');
  R(liq, c, 'liquidGlow', 0, 3, 0.01, 'own light');
  R(liq, c, 'dissolveEdge', 0.01, 0.4, 0.005, 'rain-out foam edge');

  const pool = sub(folder, '4 · The pool');
  R(pool, c, 'poolScale', 0.3, 2, 0.01, 'spreads to (× radius)');
  R(pool, c, 'poolOpacity', 0, 1, 0.01, 'wetness');
  R(pool, c, 'poolSpread', 0.05, 2, 0.01, 'spreads over (s)');
  R(pool, c, 'poolRipple', 0, 3, 0.01, 'ripples');
  R(pool, c, 'poolRingFreq', 1, 30, 0.1, 'ring frequency');
  R(pool, c, 'poolRingSpeed', 0, 10, 0.05, 'ring speed');
  R(pool, c, 'poolFoam', 0, 2, 0.01, 'foam');
  R(pool, c, 'poolSpecular', 0, 5, 0.05, 'glints');
  R(pool, c, 'poolGlow', 0, 4, 0.01, 'brightness');
  R(pool, c, 'poolDrain', 0.1, 1, 0.01, 'drains over (× exit)');

  const crown = sub(folder, '5 · Splash crowns');
  R(crown, c, 'crownHeight', 0.1, 3, 0.01, 'height (m)');
  R(crown, c, 'crownWidth', 0.1, 2, 0.01, 'radius (m)');
  R(crown, c, 'crownLife', 0.1, 2, 0.01, 'life (s)');
  R(crown, c, 'crownGlow', 0, 5, 0.05, 'glow');
  R(crown, c, 'crownSlam', 0.5, 4, 0.05, 'slam crowns (×)');

  const fx = sub(folder, '6 · Particles');
  R(fx, c, 'dripRate', 0, 120, 1, 'drips per string (/s)');
  R(fx, c, 'dripSize', 0.01, 0.3, 0.005, 'drip size');
  R(fx, c, 'dripLife', 0.1, 3, 0.01, 'drip life (s)');
  R(fx, c, 'dripSpeed', 0, 6, 0.05, 'drip speed');
  R(fx, c, 'dripGravity', -30, 0, 0.1, 'gravity');
  R(fx, c, 'gatherRate', 0, 300, 1, 'gather droplets (/s)');
  R(fx, c, 'splashCount', 0, 128, 1, 'splash droplets');
  R(fx, c, 'splashSize', 0.01, 0.4, 0.005, 'splash size');
  R(fx, c, 'splashSpeed', 0, 12, 0.05, 'splash speed');
  R(fx, c, 'splashLife', 0.1, 3, 0.01, 'splash life (s)');
  R(fx, c, 'mistCount', 0, 64, 1, 'spray puffs');
  R(fx, c, 'mistSize', 0.05, 2, 0.01, 'spray size');
  R(fx, c, 'mistLife', 0.1, 4, 0.01, 'spray life (s)');
  R(fx, c, 'mistSpeed', 0, 4, 0.01, 'spray speed');
  R(fx, c, 'rainRate', 0, 600, 1, 'rain-out (/s)');
  R(fx, c, 'dropletGlow', 0, 5, 0.05, 'droplet glow');
  gradient(fx, c, 'colorDrop', 'droplets');
  gradient(fx, c, 'colorMist', 'spray');

  const hit = sub(folder, '7 · Hook & slam');
  R(hit, c, 'hookShake', 0, 1, 0.01, 'hook knock');
  R(hit, c, 'hookFlash', 0, 1, 0.01, 'hook flash');
  R(hit, c, 'hookLight', 0, 20, 0.1, 'hook light punch');
  R(hit, c, 'slamShake', 0, 1, 0.01, 'slam knock');
  R(hit, c, 'slamFlash', 0, 1, 0.01, 'slam flash');
  R(hit, c, 'slamLight', 0, 20, 0.1, 'slam light punch');
  R(hit, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(hit, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(hit, c, 'burstReach', 0, 2, 0.01, 'splash dome (× radius)');
  R(hit, c, 'burstLife', 0.05, 3, 0.01, 'dome life (s)');
  R(hit, c, 'burstIntensity', 0, 3, 0.01, 'dome brightness');
  R(hit, c, 'burstOpacity', 0, 1, 0.01, 'dome opacity');
  R(hit, c, 'burstFresnel', 0, 6, 0.05, 'dome rim');
  R(hit, c, 'burstSquash', 0.05, 1.5, 0.01, 'dome squash');
  color(hit, c, 'colorBurstA', 'dome inner');
  color(hit, c, 'colorBurstB', 'dome mid');
  color(hit, c, 'colorBurstC', 'dome outer');
  R(hit, c, 'decalLife', 0.1, 6, 0.05, 'decals last (s)');
  R(hit, c, 'rippleIntensity', 0, 3, 0.01, 'ripple decals');
  R(hit, c, 'foamIntensity', 0, 3, 0.01, 'foam decal');
  R(hit, c, 'shockwaveWidth', 0.01, 0.4, 0.005, 'shockwave width');
  R(hit, c, 'shockwaveIntensity', 0, 3, 0.01, 'shockwave');

  const lens = sub(folder, '8 · The lens');
  R(lens, c, 'lensStrength', 0, 3, 0.01, 'pool refraction');
  R(lens, c, 'lensShock', 0, 3, 0.01, 'slam pressure ring');

  const light = sub(folder, 'Light');
  color(light, c, 'lightColor', 'colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');

  return folder;
}
