import { Group, InstancedMesh, Mesh, Object3D, Vector3 } from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { createExpansionFX, routeExpansionTransparency, expansionBurst, ParticleShape } from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { LAYER } from '../../../core/Layers.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import {
  createAuraGeometry,
  createBarGeometry,
  createGlyphRingGeometry,
  createQuad,
  createSealGeometry,
  createWritGeometry,
} from './geometry.js';
import {
  MAX_WRITS,
  createAuraMaterial,
  createBrandMaterial,
  createEngravedMaterial,
  createIrisMaterial,
  createLensMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
export const UID = 'matrix-expansion/countermand-sigil';

const PI = Math.PI;
const clamp = (x) => Math.max(0, Math.min(1, x));
/** Shortest signed angle from a to b. */
const angleDelta = (a, b) => {
  let d = (b - a) % (2 * PI);
  if (d > PI) d -= 2 * PI;
  if (d < -PI) d += 2 * PI;
  return d;
};
/** Bodies one verdict may strike (marks plus countermand splash). */
const MAX_HITS = 16;
/** Thickness the seal geometry is built at (createSealGeometry depth). */
const SEAL_BUILD_DEPTH = 0.26;
/** Bar length the geometry is built at (× seal radius), matching config default. */
const BAR_BUILD_LENGTH = 1.18;
/** Inner radius of the glyph ring (unit seal space) — the iris fills it. */
const IRIS_RADIUS = 0.54;
const WRIT_MARK = 0;
const WRIT_COUNTER = 1;

const scratch = new Object3D();
const _hand = new Vector3();
const _seal = new Vector3();
const _pos = new Vector3();
const _dir = new Vector3();
const _zero = new Vector3();
/** Reused option bag for expansionBurst (it destructures, never retains). */
const _burst = { count: 0, size: 0, life: 0, speed: 0, spread: 0, radius: 0, direction: null, spin: 2 };

/**
 * COUNTERMAND SIGIL — Arcane, zone cast.
 *
 * A cast-reactive sigil that is a *construct*, not a drawing on the floor.
 *
 * **Anticipation.** A small seal of black arcane glass forms at the hand,
 * motes gathering round it, the floor at the target already scorching faintly.
 * **Travel.** It is thrown — flipping like a coin on an arc, shedding violet
 * streaks. **Impact (the plant).** It lands edge-on and unfolds, with an
 * overshoot, into a 4.3 m standing seal that bites into a slot it tears in
 * the floor: crack decal, dust ring, sparks and obsidian chips out of the
 * slot, a camera knock. On that frame the sigil takes jurisdiction: every
 * enemy inside the circle (up to `maxMarks`, nearest first) is served a
 * **writ** — a lit silver rune-nail that flies out of the seal and hangs
 * point-down over its target while a reticle burns into the floor beneath.
 * **Linger (the watch).** The seal turns to face each marked body in turn,
 * its pupil leading the turn; the outer ring wheels in its own plane while
 * the silver glyph ring counter-turns; the sixteen engraved glyph cells light
 * one by one clockwise from twelve — the countdown is written on the seal;
 * the veto bar hangs drawn out along its diagonal, sliding on its axis;
 * motes stream up out of the cracks into the eye; the air pulls inward
 * through the ring. **Any other spell that lands inside the circle is
 * countermanded**: the seal flares, answers with a writ of its own over the
 * spot, and the verdict comes sooner and harder. **Impact (the verdict).**
 * The seal squares up to the caster, the eye pinches shut, the veto bar
 * drives through the ring on the diagonal — the order is struck through —
 * and on the frame it locks every writ drives into the floor through its
 * target: bodies are thrown away from the seal, a STORM shell, shockwave and
 * scorch, arc burns under each writ, a white flash, light punch and knock.
 * **Linger II.** The struck-through seal recoils, then sinks back into its
 * slot while its runes drain; the embedded writs shatter into chips; the
 * floor's seams flare and cool. **Exit.** Everything dissolves through noise
 * with a burning lip; the scorch outlives the cast.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the seal** — extruded crenellated ring with four clasps
 *      (`createSealGeometry`) and a silver glyph ring with its runes cut right
 *      through (`createGlyphRingGeometry`); `createEngravedMaterial`: a lit,
 *      shadowing `MeshStandardMaterial` patched with engraved, filling rune
 *      cells, fresnel rim and a noise dissolve. On `LAYER.WORLD`.
 *   2. **the veto bar** — chisel-ended extruded blade, same engraved glass
 *      with a racing chevron channel.
 *   3. **the iris and aura** — `createIrisMaterial` (eye membrane: swirling
 *      ink, tick rings, a slit pupil that looks at the watched target) and
 *      `createAuraMaterial` (an N·V volume shell round the seal).
 *   4. **the writs** — up to 10 instanced lathe-turned rune-nails
 *      (`createWritGeometry`), lit silver with a spiral groove and a hot tip.
 *   5. **the floor** — `createBrandMaterial`: char, voronoi cracks from the
 *      seal's foot, the glowing slot, burned reticles under the writs; plus
 *      CRACK / DUSTRING at the plant and SHOCKWAVE / SCORCH / ARC at the
 *      verdict.
 *   6. **particles** — SOFT motes (hand gather, seams → eye), STREAK sparks
 *      (throw trail, writ trails, plant, verdict, countermands) and CHIP
 *      obsidian (slot, shattered writs).
 *   7. **the verdict** — STORM shell, flash, knock and light punch, all
 *      scaled by the globals.
 *   8. **the lens** — `createLensMaterial` on `LAYER.DISTORTION`, standing in
 *      the ring: inward pull while it watches, a pressure ring at the lock.
 *
 * ## Hits (`handlesOwnHits`)
 *
 * Jurisdiction is fixed on the plant frame: at most `maxMarks` enemies inside
 * `zoneRadius`, nearest first; nobody arriving later is marked. Each other
 * spell whose committed hit lands inside the circle before the bar starts to
 * lock (observed through the combat binding's `on('hit')`, or the public
 * `countermand(x, z)` entry point) adds one countermand writ over that spot,
 * up to `maxCountermands`, brings the verdict `countermandHaste` sooner and
 * adds `countermandBonus` to its force. At the verdict each marked enemy
 * still standing inside the circle takes one hit; each countermand writ hits
 * every enemy within `countermandRadius` of its spot that was not already
 * struck. At most `MAX_HITS` bodies, nobody twice, knockback away from the
 * seal. Routed through `bindExpansionCombat` when the host has a combat
 * adapter, otherwise straight to the dummy field.
 *
 * ## The editor rule
 *
 * A cast keeps dice (writ seeds, the instant each writ was served, a target
 * reference), the countermand count, whether the verdict has fired, and
 * integrated clocks (spin, yaw). Every dimension, colour, count and timing is
 * read from `settings.countermandSigil` every frame, so dragging the radius
 * mid-cast resizes the seal, its slot and its brand at once.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return MAX_WRITS + 7;
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** Lifetime-scaled seconds. */
  _s(x) {
    return x * settings.global.lifetime;
  }

  /** When the verdict lands, in impact-phase seconds — countermands hasten it. */
  _verdictTime() {
    const c = this.config;
    const lock = this._s(c.lockTime);
    return Math.max(lock + 0.1, this._s(c.verdictDelay) - this._countermands * this._s(c.countermandHaste));
  }

  get impactDuration() {
    return this._verdictTime() + this._s(this.config.afterTime);
  }

  get fadeDuration() {
    return Math.max(0.1, this._s(this.config.exitTime));
  }

  /** The seal is held in the hand for the wind-up before the throw leaves. */
  advance(dt) {
    if (this.age < this._s(this.config.windupTime)) {
      this.position.copy(this.origin);
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

    // 5 · the brand on the floor (world coordinates: the group is identity)
    this.brandMat = own(createBrandMaterial());
    this.brand = new Mesh(quad, this.brandMat);
    this.brand.rotation.x = -PI / 2;
    this.brand.renderOrder = 1;
    this.brand.frustumCulled = false;
    this.group.add(this.brand);

    // The seal assembly: root at the centre on the floor, pivot at the hub.
    this.root = new Group();
    this.group.add(this.root);
    this.pivot = new Group();
    this.root.add(this.pivot);

    // 1 · the seal — lit, solid, shadowing
    this.sealMat = own(createEngravedMaterial('seal'));
    this.glyphMat = own(createEngravedMaterial('glyph'));
    this.outerSpin = new Group();
    this.pivot.add(this.outerSpin);
    this.seal = new Mesh(own(createSealGeometry()), this.sealMat);
    this.seal.castShadow = true;
    this.seal.receiveShadow = true;
    this.outerSpin.add(this.seal);
    this.innerSpin = new Group();
    this.pivot.add(this.innerSpin);
    this.glyphRing = new Mesh(own(createGlyphRingGeometry()), this.glyphMat);
    this.glyphRing.castShadow = true;
    this.glyphRing.receiveShadow = true;
    this.innerSpin.add(this.glyphRing);

    // 2 · the veto bar, mounted on its diagonal, slides along its own axis
    this.barMat = own(createEngravedMaterial('bar'));
    this.barMount = new Group();
    this.pivot.add(this.barMount);
    this.bar = new Mesh(own(createBarGeometry()), this.barMat);
    this.bar.castShadow = true;
    this.barMount.add(this.bar);

    // 3 · the iris and the aura
    this.irisMat = own(createIrisMaterial());
    this.iris = new Mesh(quad, this.irisMat);
    this.iris.renderOrder = 6;
    this.pivot.add(this.iris);
    this.auraMat = own(createAuraMaterial());
    this.aura = new Mesh(own(createAuraGeometry()), this.auraMat);
    this.aura.renderOrder = 7;
    this.pivot.add(this.aura);

    // 8 · the lens, standing in the ring (does not spin)
    this.lensMat = own(createLensMaterial());
    this.lens = new Mesh(quad, this.lensMat);
    this.lens.visible = false;
    this.pivot.add(this.lens);

    // 4 · the writs (world coordinates)
    this.writMat = own(createEngravedMaterial('writ'));
    this.writs = new InstancedMesh(own(createWritGeometry()), this.writMat, MAX_WRITS);
    this.writs.frustumCulled = false;
    this.writs.castShadow = true;
    this.group.add(this.writs);

    /** Dice-only writ records, pooled. */
    this._records = [];
    for (let i = 0; i < MAX_WRITS; i++) {
      this._records.push({ active: false, kind: WRIT_MARK, dummy: null, actorId: null, x: 0, z: 0, seed: 0, born: 0, shattered: false });
    }
    this._found = [];
    this._probe = [];
    this._struck = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._marks = new Float32Array(MAX_WRITS * 3);
    this._lightPos = new Vector3();
    this._motes = new RateEmitter();
    this._countermands = 0;
    this._engraveState = { fill: 0, charge: 0, flash: 0, dissolve: 0, clock: 0 };
    this._glyphState = { fill: 0, charge: 0, flash: 0, dissolve: 0, clock: 0 };
    this._barState = { fill: 0, charge: 0, flash: 0, dissolve: 0, clock: 0 };
    this._writState = { fill: 0, charge: 0, flash: 0, dissolve: 0, clock: 0 };
    this._irisState = { clock: 0, charge: 0, lookX: 0, lookY: 0, collapse: 0, flash: 0, fade: 0 };
    this._auraState = { clock: 0, power: 0, fade: 0 };
    this._brandState = {
      cx: 0, cz: 0, radius: 1, char: 0, heat: 0, dissolve: 0, slotX: 1, slotZ: 0, slotLen: 1, slotOpen: 0, clock: 0, marks: this._marks,
    };
    this._lensState = { pull: 0, shock: 0, wave: 0, clock: 0 };
    this._onHit = (event) => {
      if (!event || event.abilityUid === UID) return;
      const p = event.position;
      if (!Array.isArray(p) || p.length < 3 || !Number.isFinite(p[0]) || !Number.isFinite(p[2])) return;
      this.countermand(p[0], p[2]);
    };

    routeExpansionTransparency(this.group);
    this.lens.layers.set(LAYER.DISTORTION);
    this._disposed = false;
    this._reset();
  }

  createParticles() {
    this.motes = createExpansionFX(this.ctx, 'countermand-motes', { shape: ParticleShape.SOFT, colors: ['#fff2fd', '#f6a6ff', '#a33cff', '#1a0630'] });
    this.sparks = createExpansionFX(this.ctx, 'countermand-sparks', { shape: ParticleShape.STREAK, colors: ['#fff2fd', '#f6a6ff', '#a33cff', '#1a0630'] });
    this.chips = createExpansionFX(this.ctx, 'countermand-chips', {
      shape: ParticleShape.CHIP, additive: false, colors: ['#5a3b78', '#2d1546', '#1a0630', '#08020f'],
    });
  }

  /** Clear every per-cast field (spawn and destroy). */
  _reset() {
    this._planted = false;
    this._verdicted = false;
    this._verdictAt = 0;
    this._countermands = 0;
    this._flash = 0;
    this._spinOuter = 0;
    this._spinInner = 0;
    this._clock = 0;
    this._yaw = 0;
    this._trailT = 0;
    this._cx = 0;
    this._cz = 0;
    this._marked = 0;
    this._hits = 0;
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._motes?.reset();
    for (const r of this._records) {
      r.active = false;
      r.dummy = null;
      r.actorId = null;
      r.shattered = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._reset();
    this.failure = null;
    this._scope = bindExpansionCombat(this.ctx, UID);
    this._calm = prefersReducedMotion();
    this._yaw = Math.atan2(this.direction.x, this.direction.z);
    this.root.visible = true;
    this.brand.visible = true;
    this.writs.visible = true;
    this._sync(0);
  }

  onTravel(dt) {
    this._sync(dt);
  }

  onImpact() {
    this.position.y = 0;
    this._cx = this.position.x;
    this._cz = this.position.z;
    this._planted = true;
    this._mark();
    if (this._scope?.on) {
      const sub = this._scope.on('hit', this._onHit);
      if (sub?.ok && typeof sub.unsubscribe === 'function') this._unsubscribe = sub.unsubscribe;
    }
    this._plantFx();
    this._sync(0);
  }

  onFade(dt) {
    if (!this._verdicted && (this.phase === 'fade' || this.impactTime >= this._verdictTime())) {
      this._verdict();
    }
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Gameplay                                                            */
  /* ------------------------------------------------------------------ */

  _freeRecord() {
    for (const r of this._records) if (!r.active) return r;
    return null;
  }

  _serve(r, kind, x, z) {
    r.active = true;
    r.kind = kind;
    r.x = x;
    r.z = z;
    r.seed = Math.random();
    r.born = this.impactTime;
    r.shattered = false;
  }

  /** The dummy standing on a point, for the writ to follow (visual only). */
  _dummyAt(x, z) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return null;
    const found = field.findTargets(x, z, 0.6, this._probe);
    return found?.length ? found[0] : null;
  }

  /** Take jurisdiction: serve a writ over each enemy inside the circle. */
  _mark() {
    const c = this.config;
    const R = c.zoneRadius;
    const max = Math.max(0, Math.min(MAX_WRITS, Math.round(c.maxMarks)));
    if (this._scope) {
      const res = this._scope.queryActors({ position: [this._cx, 0, this._cz], radius: R, relation: 'enemy' });
      if (!res?.ok) {
        this.failure = res?.reason ?? 'query failed';
        return;
      }
      const cx = this._cx;
      const cz = this._cz;
      const d2 = (a) => (a.position[0] - cx) ** 2 + (a.position[2] - cz) ** 2;
      const actors = res.actors.slice().sort((a, b) => d2(a) - d2(b) || (a.id < b.id ? -1 : 1));
      for (const actor of actors) {
        if (this._marked >= max) break;
        const r = this._freeRecord();
        if (!r) break;
        this._serve(r, WRIT_MARK, actor.position[0], actor.position[2]);
        r.actorId = actor.id;
        r.dummy = this._dummyAt(r.x, r.z);
        this._marked++;
      }
      return;
    }
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(this._cx, this._cz, R, this._found);
    for (const dummy of found) {
      if (this._marked >= max) break;
      if (!dummy?.position) continue;
      if ((dummy.position.x - this._cx) ** 2 + (dummy.position.z - this._cz) ** 2 > R * R) continue;
      const r = this._freeRecord();
      if (!r) break;
      this._serve(r, WRIT_MARK, dummy.position.x, dummy.position.z);
      r.dummy = dummy;
      this._marked++;
    }
  }

  /**
   * The cast-reactive rule. Another spell landed at (x, z): if it is inside
   * the jurisdiction and the bar has not started to lock, answer it with a
   * writ over the spot, bring the verdict sooner and make it heavier.
   * @returns {boolean} whether the seal countermanded it
   */
  countermand(x, z) {
    const c = this.config;
    if (this.phase !== 'impact' || !this._planted || this._verdicted) return false;
    if (this.impactTime >= this._verdictTime() - this._s(c.lockTime)) return false;
    if (this._countermands >= Math.min(MAX_WRITS, Math.max(0, Math.round(c.maxCountermands)))) return false;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    if ((x - this._cx) ** 2 + (z - this._cz) ** 2 > c.zoneRadius * c.zoneRadius) return false;
    const r = this._freeRecord();
    if (!r) return false;
    this._serve(r, WRIT_COUNTER, x, z);
    this._countermands++;
    // The seal flares and answers on the spot.
    this._flash = 1;
    this.lightBoost += c.plantLight * 0.5 * settings.global.explosionIntensity;
    _pos.set(x, 0.3, z);
    this._spark(this.sparks, _pos, c.sparkCount * 0.4, c.sparkSize, c.sparkLife, c.sparkSpeed * 0.6, 0.9, 0.3);
    this.ctx.decals?.spawn?.(DecalType.ARC, _pos.setY(0.02), {
      radius: c.countermandRadius, life: this._s(c.decalLife), intensity: 1,
      colorA: getColor(c.colorTint), colorB: getColor(c.colorBody),
    });
    return true;
  }

  /** The verdict: the bar locks, every writ drives down. */
  _verdict() {
    const c = this.config;
    const g = settings.global;
    this._verdicted = true;
    this._verdictAt = this.impactTime;
    this._unsubscribe?.();
    this._unsubscribe = null;
    const power = g.explosionIntensity * (1 + c.countermandBonus * this._countermands);
    const R = c.zoneRadius;
    const limit = R * 1.15;
    this._struck.length = 0;
    this._hits = 0;
    const source = [this._cx, 0, this._cz];

    if (this._scope) {
      const force = impactForce(c, power);
      const send = (actor, tag) => {
        if (this._hits >= MAX_HITS || this._struck.includes(actor.id)) return;
        const sent = this._scope.emit({
          type: 'hit', element: 'arcane', targetIds: [actor.id],
          position: actor.position, sourcePosition: source,
          damage: c.verdictDamage, hitForce: force, tags: ['countermand-sigil', tag],
        });
        if (sent?.ok) {
          this._struck.push(actor.id);
          this._hits++;
        } else this.failure = sent?.reason ?? 'emit failed';
      };
      for (const r of this._records) {
        if (!r.active) continue;
        if (r.kind === WRIT_MARK) {
          const got = this._scope.getActor(r.actorId);
          if (!got?.ok || !got.actor?.alive) continue;
          const p = got.actor.position;
          if ((p[0] - this._cx) ** 2 + (p[2] - this._cz) ** 2 > limit * limit) continue;
          send(got.actor, 'writ');
        } else {
          const res = this._scope.queryActors({ position: [r.x, 0, r.z], radius: c.countermandRadius, relation: 'enemy' });
          if (!res?.ok) {
            this.failure = res?.reason ?? 'query failed';
            continue;
          }
          for (const actor of res.actors) send(actor, 'countermand');
        }
      }
    } else {
      this._force.impulse = Math.min(24, c.hitImpulse * Math.min(3, power));
      this._force.lift = Math.min(20, c.hitLift * Math.min(3, power));
      this._force.spin = c.hitSpin;
      const kill = (dummy) => {
        if (this._hits >= MAX_HITS || !dummy?.alive || !dummy.kill) return;
        _dir.set(dummy.position.x - this._cx, 0, dummy.position.z - this._cz);
        if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction);
        else _dir.normalize();
        if (dummy.kill(_dir.x, _dir.z, this._force)) this._hits++;
      };
      for (const r of this._records) {
        if (!r.active) continue;
        if (r.kind === WRIT_MARK) {
          const d = r.dummy;
          if (!d?.position) continue;
          if ((d.position.x - this._cx) ** 2 + (d.position.z - this._cz) ** 2 > limit * limit) continue;
          kill(d);
        } else {
          const field = this.ctx.dummies;
          if (!field?.findTargets) continue;
          const found = field.findTargets(r.x, r.z, c.countermandRadius, this._found);
          for (const d of found) {
            if ((d.position.x - r.x) ** 2 + (d.position.z - r.z) ** 2 <= c.countermandRadius ** 2) kill(d);
          }
        }
      }
    }
    this._verdictFx();
  }

  /* ------------------------------------------------------------------ */
  /* The world answers                                                   */
  /* ------------------------------------------------------------------ */

  _spark(system, position, count, size, life, speed, spread, radius, direction = null) {
    _burst.count = count;
    _burst.size = size;
    _burst.life = life;
    _burst.speed = speed;
    _burst.spread = spread;
    _burst.radius = radius;
    _burst.direction = direction ?? undefined;
    expansionBurst(system, position, _burst);
  }

  _plantFx() {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    const R = c.zoneRadius;
    this.lightBoost = c.plantLight * power;
    this._flash = 1;
    _pos.set(this._cx, 0.04, this._cz);
    this.ctx.decals?.spawn?.(DecalType.CRACK, _pos, {
      radius: R * c.crackDecal, life: this._s(c.decalLife), intensity: 1,
      colorA: getColor(c.colorTint), colorB: getColor(c.colorBody),
    });
    this.ctx.decals?.spawn?.(DecalType.DUSTRING, _pos, {
      radius: R * c.dustDecal, life: this._s(c.decalLife) * 0.5, intensity: 0.6,
      colorA: getColor(c.colorDeep), colorB: getColor(c.colorBody),
    });
    _pos.y = 0.15;
    this._spark(this.sparks, _pos, c.sparkCount, c.sparkSize, c.sparkLife, c.sparkSpeed, 0.85, R * 0.25);
    this._spark(this.chips, _pos, c.chipCount, c.chipSize, c.chipLife, c.chipSpeed, 0.6, 0.4);
    if (c.plantShake > 0) this.ctx.shake?.add?.(c.plantShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.plantFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorTint), c.plantFlash * power);
  }

  _verdictFx() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = c.zoneRadius;
    const Rs = c.sealSize * R;
    this.lightBoost = c.verdictLight * power;
    this._flash = 1.4;
    _pos.set(this._cx, Math.max(0.3, Rs - c.sealLift), this._cz);
    this.ctx.bursts?.spawn?.(BurstMode.STORM, _pos, {
      radius: Rs * 0.2,
      endRadius: Rs * c.burstReach * power,
      life: this._s(c.burstLife),
      intensity: c.burstIntensity,
      opacity: c.burstOpacity * g.opacity,
      fresnel: 2.2 * g.fresnel,
      colorA: getColor(c.colorCore),
      colorB: getColor(c.colorTint),
      colorC: getColor(c.colorBody),
    });
    this._spark(this.sparks, _pos, c.sparkCount, c.sparkSize, c.sparkLife, c.sparkSpeed * 1.2, 1, Rs * 0.5);
    _pos.y = 0.04;
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: R * c.shockReach * power, life: this._s(c.decalLife) * 0.4, width: c.shockWidth, intensity: 1,
      colorA: getColor(c.colorCore), colorB: getColor(c.colorBody),
    });
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _pos, {
      radius: R * 0.85, life: this._s(c.scorchLife), intensity: 0.8,
      colorA: getColor(c.colorDeep), colorB: getColor(c.colorBody),
    });
    for (const r of this._records) {
      if (!r.active) continue;
      _pos.set(r.x, 0.04, r.z);
      this.ctx.decals?.spawn?.(DecalType.ARC, _pos, {
        radius: c.arcSize, life: this._s(c.decalLife), intensity: 1,
        colorA: getColor(c.colorTint), colorB: getColor(c.colorBody),
      });
      _pos.y = 0.2;
      this._spark(this.sparks, _pos, c.sparkCount * 0.25, c.sparkSize, c.sparkLife * 0.8, c.sparkSpeed * 0.7, 0.7, 0.2);
    }
    if (c.verdictShake > 0) this.ctx.shake?.add?.(c.verdictShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.verdictFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorCore), c.verdictFlash * power);
  }

  /** The light rides the seal, not the floor. */
  _updateLight(dt, scale) {
    if (!this.light) return;
    const c = this.config;
    this.lightColor.copy(getColor(c.lightColor));
    this.ctx.lights.set(
      this.light,
      this._lightPos,
      this.lightColor,
      c.lightIntensity * scale * this.lightShimmer() + this.lightBoost,
      c.lightRadius * (1 + this.lightBoost * 0.02),
      dt,
    );
    this.lightBoost = Math.max(0, this.lightBoost - this.lightBoost * 4.5 * dt - 0.5 * dt);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    for (const fx of [this.motes, this.sparks, this.chips]) {
      if (!fx?.uniforms) continue;
      const chip = fx === this.chips;
      fx.setGradient?.(
        getColor(chip ? c.colorChipA : c.colorMoteA),
        getColor(chip ? c.colorChipB : c.colorMoteB),
        getColor(chip ? c.colorChipC : c.colorMoteC),
        getColor(chip ? c.colorChipD : c.colorMoteD),
      );
      const u = fx.uniforms;
      if (u.uGlow) u.uGlow.value = (chip ? 1 : c.particleGlow) * g.glow;
      if (u.uOpacity) u.uOpacity.value = g.opacity;
      if (u.uTurbulence) u.uTurbulence.value = 0.5 * g.turbulence;
      if (u.uSizeScale) u.uSizeScale.value = g.particleSize;
      if (u.uSpeedScale) u.uSpeedScale.value = g.particleSpeed;
      if (u.uLifeScale) u.uLifeScale.value = g.particleLifetime;
      if (chip && u.uGravity?.value?.set) u.uGravity.value.set(0, -9, 0);
    }
  }

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const R = c.zoneRadius;
    const Rs = c.sealSize * R;
    const travelling = this.phase === 'travel';
    const t = this.impactTime;
    const V = this._verdictTime();
    const lockT = this._s(c.lockTime);
    const animDt = this._calm ? 0 : dt * g.animationSpeed;
    this._clock += animDt;
    const clock = this._clock;
    this._flash = Math.max(0, this._flash - dt * 3.2);

    const fadeT = this.phase === 'fade' ? clamp(this.fadeTime / this.fadeDuration) : 0;
    const plant = travelling ? 0 : Easing.outBack(clamp(t / Math.max(0.02, this._s(c.plantTime))));
    const plantLin = travelling ? 0 : clamp(t / Math.max(0.02, this._s(c.plantTime)));
    const charge = travelling ? 0 : clamp(t / Math.max(0.05, V));
    const lock = this._verdicted ? 1 : travelling ? 0 : Easing.inCubic(clamp((t - (V - lockT)) / Math.max(0.02, lockT)));
    const since = this._verdicted ? t - this._verdictAt + (this.phase === 'fade' ? this.fadeTime : 0) : -1;
    const after = Math.max(0.05, this._s(c.afterTime));
    const sink = this._verdicted ? Easing.inQuad(clamp((since - after * 0.22) / (after * 0.78 + this.fadeDuration))) : 0;
    const recoil = this._verdicted ? Math.exp(-since * 9) * Math.sin(since * 34) : 0;
    const dissolve = fadeT;
    const yawFace = Math.atan2(this.direction.x, this.direction.z);

    /* --- the seal's placement ------------------------------------- */
    let scale;
    if (travelling) {
      const windup = this._s(c.windupTime);
      _hand.copy(this.origin).addScaledVector(this.direction, 0.55);
      _hand.y = c.handHeight;
      const form = clamp(this.age / Math.max(0.02, windup));
      const landY = Rs * c.throwScale + 0.2;
      if (this.age < windup) {
        _seal.copy(_hand);
        scale = c.throwScale * Easing.outBack(form);
      } else {
        _seal.copy(this.position);
        _seal.y = c.handHeight + (landY - c.handHeight) * this.u + Math.sin(PI * this.u) * c.throwArc;
        scale = c.throwScale;
      }
      this.root.position.set(_seal.x, 0, _seal.z);
      this.pivot.position.set(0, _seal.y, 0);
      this.pivot.rotation.set(0, yawFace + this.age * c.throwSpin, 0, 'YXZ');
      this.pivot.scale.setScalar(Math.max(0.001, Rs * scale));
      if (dt > 0) {
        this._trailT += dt;
        if (this._trailT >= 0.03) {
          this._trailT = 0;
          if (this.age < windup) {
            this._spark(this.motes, _hand, c.handMotes, c.moteSize * 0.8, c.moteLife * 0.6, 0.5, 1, 0.55);
          } else {
            this._spark(this.sparks, _seal, c.trailCount, c.sparkSize, c.sparkLife * 0.6, 0.8, 1, 0.2);
          }
        }
      }
    } else {
      scale = c.throwScale + (1 - c.throwScale) * plant;
      // Watch: turn to face each marked target in turn; square up for the lock.
      let target = yawFace;
      let look = 0;
      if (!this._calm && this._marked + this._countermands > 0 && lock <= 0 && t > this._s(c.plantTime)) {
        const n = this._marked + this._countermands;
        const k = Math.floor(t * c.watchRate) % n;
        let seen = 0;
        for (const r of this._records) {
          if (!r.active) continue;
          if (seen++ !== k) continue;
          let d = angleDelta(yawFace, Math.atan2(r.x - this._cx, r.z - this._cz));
          if (d > PI / 2) d -= PI;
          if (d < -PI / 2) d += PI;
          target = yawFace + c.watchTurn * d;
          break;
        }
      }
      if (dt > 0) this._yaw += angleDelta(this._yaw, target) * (1 - Math.exp(-dt * 7));
      else if (this._calm) this._yaw = target;
      look = Math.max(-1, Math.min(1, angleDelta(this._yaw, target) * 2.2));
      const hubY = Rs * scale - c.sealLift - sink * (2 * Rs + 0.4);
      this.root.position.set(this._cx, 0, this._cz);
      this.pivot.position.set(0, hubY, 0);
      this.pivot.rotation.set(c.sealLean + recoil * 0.12, this._yaw, 0, 'YXZ');
      this.pivot.scale.setScalar(Math.max(0.001, Rs * scale * (1 + recoil * 0.04)));
      this._irisState.lookX = look;
      this._irisState.lookY = -0.3;
    }
    this._spinOuter += animDt * c.sealSpin * (travelling ? 0 : 1 + charge * 2.2) * (1 - lock);
    this._spinInner += animDt * c.innerSpin * (travelling ? 0 : 1 + charge * 2.2) * (1 - lock);
    this.outerSpin.rotation.z = this._spinOuter;
    this.innerSpin.rotation.z = this._spinInner;
    this.seal.scale.set(1, 1, c.sealDepth / SEAL_BUILD_DEPTH);
    const hubWorldY = this.pivot.position.y;
    this._lightPos.set(this.root.position.x, Math.max(0.4, travelling ? hubWorldY : c.lightHeight * (1 - sink)), this.root.position.z);

    // 2 · the bar: drawn out on its diagonal, driven through at the lock.
    this.barMount.rotation.z = c.barAngle;
    this.bar.visible = !travelling;
    const drift = this._calm ? 0 : Math.sin(clock * 1.7) * c.barDrift;
    const hover = (c.barHover + drift) * (1 - lock) * clamp(plantLin * 1.5);
    this.bar.position.set(hover + (1 - clamp(plantLin * 1.5)) * 2.5, 0, -(c.sealDepth * 0.5 + 0.13));
    this.bar.scale.set(c.barLength / BAR_BUILD_LENGTH, 1, 1);

    // 1 · engraved materials
    const fill = travelling ? 0 : this._verdicted ? Math.max(0, 1 - sink * 1.6) : charge;
    const flash = this._flash;
    const es = this._engraveState;
    es.fill = fill;
    es.charge = this._verdicted ? Math.max(0, 1 - since * 1.4) + 0.15 : charge;
    es.flash = flash;
    es.dissolve = dissolve;
    es.clock = clock;
    this.sealMat.userData.sync(es);
    const gs = this._glyphState;
    gs.fill = fill;
    gs.charge = es.charge;
    gs.flash = flash;
    gs.dissolve = dissolve;
    gs.clock = clock;
    this.glyphMat.userData.sync(gs);
    const bs = this._barState;
    bs.fill = fill;
    bs.charge = this._verdicted ? es.charge + 0.6 : lock > 0 ? 0.6 + lock : charge * 0.5;
    bs.flash = flash;
    bs.dissolve = dissolve;
    bs.clock = clock;
    this.barMat.userData.sync(bs);

    // 3 · iris and aura
    const irisOn = !travelling && (!this._verdicted || since < 0.15);
    this.iris.visible = irisOn;
    if (irisOn) {
      this.iris.scale.setScalar(IRIS_RADIUS * 2);
      const is = this._irisState;
      is.clock = clock;
      is.charge = charge;
      is.collapse = this._verdicted ? 1 : lock;
      is.flash = flash;
      is.fade = clamp(plantLin * 2);
      if (travelling) is.lookX = 0;
      this.irisMat.userData.sync(is);
    }
    const as = this._auraState;
    as.clock = clock;
    as.power = travelling ? 0.8 : (0.45 + charge * 0.6 + flash * 0.8) * (this._verdicted ? Math.max(0, 1 - since * 1.2) : 1);
    as.fade = (1 - dissolve) * (travelling ? clamp(this.age * 5) : 1);
    this.aura.visible = as.power * as.fade > 0.003;
    this.aura.scale.set(c.auraScale, c.auraScale, c.auraScale * 0.42);
    this.auraMat.userData.sync(as);

    // 8 · the lens
    const ls = this._lensState;
    ls.pull = travelling || this._verdicted ? 0 : charge * charge;
    ls.shock = this._verdicted && since < 0.5 ? 1 - since / 0.5 : 0;
    ls.wave = this._verdicted ? Easing.outCubic(clamp(since / 0.5)) : 0;
    ls.clock = clock;
    this.lens.visible = !this._calm && (ls.pull * c.lensPull + ls.shock * c.lensShock) * g.distortion > 0.002;
    if (this.lens.visible) {
      this.lens.scale.setScalar(2.2);
      this.lensMat.userData.sync(ls);
    }

    // 4 · the writs
    const ws = this._writState;
    ws.fill = 1;
    ws.charge = this._verdicted ? Math.max(0.2, 1 - since * 2) : 0.35 + charge * 0.65;
    ws.flash = flash * 0.6;
    ws.dissolve = dissolve;
    ws.clock = clock;
    this.writMat.userData.sync(ws);
    const flightT = Math.max(0.02, this._s(c.writFlight));
    const driveT = Math.max(0.02, this._s(c.writDrive));
    const shatterAt = after * 0.55;
    const tipHover = Math.max(0.2, c.writHeight - c.writLength);
    let emitTrail = false;
    if (dt > 0 && !travelling) {
      this._trailT += dt;
      if (this._trailT >= 0.03) {
        this._trailT = 0;
        emitTrail = true;
      }
    }
    for (let i = 0; i < MAX_WRITS; i++) {
      const r = this._records[i];
      let size = 0;
      if (r.active && !travelling) {
        // Follow a living mark until the verdict.
        if (r.kind === WRIT_MARK && !this._verdicted && r.dummy?.alive && r.dummy.position) {
          r.x = r.dummy.position.x;
          r.z = r.dummy.position.z;
        }
        const f = clamp((t - r.born) / flightT);
        const fe = Easing.outCubic(f);
        const bob = this._calm ? 0 : Math.sin(clock * 2.3 + r.seed * 6.28) * c.writBob;
        const drive = this._verdicted ? 1 : Easing.inCubic(clamp((t - (V - driveT)) / driveT));
        const tipY = tipHover + bob * (1 - drive) + (-c.writSink - tipHover) * drive;
        // From the hub out to the hover point, on an arc.
        const sx = this._cx + (r.x - this._cx) * fe;
        const sz = this._cz + (r.z - this._cz) * fe;
        const sy = hubWorldY + (tipY - hubWorldY) * fe + Math.sin(PI * f) * 1.2;
        const tilt = (1 - fe) * 1.2;
        const heading = Math.atan2(r.x - this._cx, r.z - this._cz);
        scratch.position.set(sx, sy, sz);
        scratch.rotation.set(tilt, heading + (this._calm ? 0 : clock * c.writSpin * (1 - drive)), 0, 'YXZ');
        size = c.writLength * Easing.outBack(clamp(f * 1.4));
        if (this._verdicted) {
          const sh = clamp((since - shatterAt) / 0.14);
          if (sh > 0 && !r.shattered) {
            r.shattered = true;
            _pos.set(r.x, 0.5, r.z);
            this._spark(this.chips, _pos, c.chipCount * 0.3, c.chipSize * 0.8, c.chipLife * 0.8, c.chipSpeed * 0.6, 0.8, 0.3);
            this._spark(this.motes, _pos, 6, c.moteSize, c.moteLife, 1.2, 0.9, 0.3);
          }
          size *= 1 - sh;
        }
        size *= 1 - dissolve;
        if (emitTrail && f < 1 && f > 0) {
          this._spark(this.sparks, scratch.position, c.trailCount, c.sparkSize * 0.8, c.sparkLife * 0.5, 0.6, 1, 0.1);
        }
        // Reticle under the writ: burns in as it arrives, flares when struck.
        const mark = fe * (this._verdicted ? 1 + Math.max(0, 1 - since * 2) * 1.5 : 0.55 + charge * 0.45);
        this._marks[i * 3] = r.x;
        this._marks[i * 3 + 1] = r.z;
        this._marks[i * 3 + 2] = mark * (1 - dissolve);
      } else {
        this._marks[i * 3 + 2] = 0;
        scratch.position.set(0, -50, 0);
        scratch.rotation.set(0, 0, 0);
      }
      scratch.scale.setScalar(Math.max(1e-4, size));
      scratch.updateMatrix();
      this.writs.setMatrixAt(i, scratch.matrix);
    }
    this.writs.instanceMatrix.needsUpdate = true;

    // 5 · the brand
    const bst = this._brandState;
    bst.cx = travelling ? this.origin.x + this.direction.x * this.length : this._cx;
    bst.cz = travelling ? this.origin.z + this.direction.z * this.length : this._cz;
    bst.radius = R;
    bst.char = travelling ? clamp(this.u) * 0.3 : 0.3 + 0.7 * plantLin;
    bst.heat = travelling ? 0 : this._verdicted ? 0.35 + Math.exp(-since * 2.5) * 1.6 : 0.3 + charge * 0.5 + flash * 0.4;
    bst.dissolve = clamp(fadeT / Math.max(0.05, c.brandFade));
    bst.slotX = Math.cos(this._yaw);
    bst.slotZ = -Math.sin(this._yaw);
    bst.slotLen = Rs * 0.92 * Math.max(0.2, scale);
    bst.slotOpen = travelling ? 0 : clamp(plantLin * 1.6);
    bst.clock = clock;
    this.brand.position.set(bst.cx, 0.03, bst.cz);
    this.brand.scale.set(R * 2.3, R * 2.3, 1);
    this.brandMat.userData.sync(bst);

    // 6 · motes stream out of the seams up into the eye while it watches
    if (!travelling && !this._verdicted && dt > 0 && this.motes) {
      let n = Math.min(12, this._motes.tick(dt, c.moteRate * g.particleCount * plantLin));
      while (n-- > 0) {
        const a = Math.random() * PI * 2;
        const rr = R * (0.25 + 0.65 * Math.sqrt(Math.random()));
        _pos.set(this._cx + Math.cos(a) * rr, 0.08, this._cz + Math.sin(a) * rr);
        _dir.set(this._cx - _pos.x, hubWorldY - _pos.y, this._cz - _pos.z).normalize();
        this._spark(this.motes, _pos, 1, c.moteSize, c.moteLife, c.moteSpeed, 0.12, 0.05, _dir);
      }
    }
    this._syncParticles();
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._reset();
    this._scope = null;
    this.root.visible = false;
    this.brand.visible = false;
    this.writs.visible = false;
    this.lens.visible = false;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._unsubscribe?.();
    this._unsubscribe = null;
    for (const r of this.resources) r.dispose();
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

/** [key, min, max, step, label] rows per folder; '#' rows are colours. */
const EDITOR = [
  ['The cast', [
    ['range', 2, 40, 0.1, 'max range'], ['minRange', 0, 12, 0.1, 'min range'], ['speed', 4, 80, 0.5, 'seal flies at (m/s)'],
    ['lifetime', 0.2, 8, 0.05, 'nominal lifetime (s)'], ['cooldown', 0, 15, 0.05, 'cooldown'],
  ]],
  ['The order', [
    ['zoneRadius', 1, 8, 0.1, 'jurisdiction (m)'], ['maxMarks', 0, 10, 1, 'writs served'], ['verdictDelay', 0.3, 4, 0.05, 'verdict after (s)'],
    ['maxCountermands', 0, 10, 1, 'countermands'], ['countermandRadius', 0.2, 4, 0.05, 'countermand reach (m)'],
    ['countermandHaste', 0, 0.6, 0.01, 'haste per countermand (s)'], ['countermandBonus', 0, 1.5, 0.01, 'force per countermand'],
    ['verdictDamage', 0, 5, 0.1, 'damage per writ'], ['hitImpulse', 0, 24, 0.5, 'impulse'], ['hitLift', 0, 20, 0.1, 'lift'], ['hitSpin', 0, 8, 0.05, 'tumble'],
  ]],
  ['Timing', [
    ['windupTime', 0.05, 1, 0.01, 'forms in the hand (s)'], ['plantTime', 0.05, 1.2, 0.01, 'unfolds over (s)'], ['lockTime', 0.03, 0.8, 0.01, 'bar drives in over (s)'],
    ['afterTime', 0.2, 3, 0.05, 'linger after the verdict (s)'], ['exitTime', 0.1, 2, 0.05, 'exit (s)'],
  ]],
  ['The throw', [
    ['handHeight', 0.3, 3, 0.05, 'forms at (m)'], ['throwScale', 0.05, 1, 0.01, 'size in flight'], ['throwArc', 0, 5, 0.05, 'arc height (m)'], ['throwSpin', 0, 40, 0.5, 'coin flip (rad/s)'],
  ]],
  ['Light', [
    ['#lightColor', 'colour'], ['lightIntensity', 0, 30, 0.1, 'intensity'], ['lightRadius', 1, 40, 0.1, 'radius'], ['lightHeight', 0.2, 6, 0.05, 'height (m)'],
    ['plantLight', 0, 20, 0.1, 'punch at the plant'], ['verdictLight', 0, 30, 0.1, 'punch at the verdict'],
  ]],
  ['Palette', [['#colorCore', 'core'], ['#colorTint', 'tint'], ['#colorBody', 'body'], ['#colorDeep', 'deep']]],
  ['1 · The seal', [
    ['sealSize', 0.2, 1.2, 0.01, 'size (× radius)'], ['sealLift', -0.5, 1.5, 0.01, 'sunk into the slot (m)'], ['sealDepth', 0.05, 0.8, 0.01, 'thickness'],
    ['sealLean', -0.6, 0.6, 0.01, 'leans back (rad)'], ['sealSpin', -3, 3, 0.05, 'outer ring turns'], ['innerSpin', -3, 3, 0.05, 'glyph ring turns'],
    ['watchTurn', 0, 1, 0.01, 'turns to watch'], ['watchRate', 0, 8, 0.05, 'targets watched /s'],
    ['#obsidianColor', 'obsidian'], ['obsidianRoughness', 0, 1, 0.01, 'obsidian roughness'], ['obsidianMetalness', 0, 1, 0.01, 'obsidian metalness'],
    ['#silverColor', 'silver'], ['silverRoughness', 0, 1, 0.01, 'silver roughness'], ['silverMetalness', 0, 1, 0.01, 'silver metalness'],
    ['runeGlow', 0, 8, 0.05, 'rune glow'], ['runeCells', 4, 32, 1, 'glyph cells'], ['runeWidth', 0.02, 0.2, 0.005, 'stroke width'],
    ['edgeGlow', 0, 4, 0.05, 'bevel seam'], ['fresnelGlow', 0, 4, 0.05, 'rim light'],
  ]],
  ['2 · The veto bar', [
    ['barLength', 0.6, 2, 0.01, 'length (× diameter)'], ['barAngle', -1.6, 1.6, 0.01, 'angle (rad)'], ['barHover', 0, 3, 0.01, 'drawn out (× radius)'],
    ['barDrift', 0, 1, 0.01, 'slides while waiting'], ['barGlow', 0, 8, 0.05, 'channel glow'],
  ]],
  ['3 · Iris and aura', [
    ['irisGlow', 0, 6, 0.05, 'iris glow'], ['irisSwirl', 0, 4, 0.05, 'swirl'], ['pupilWidth', 0.02, 0.6, 0.01, 'pupil width'],
    ['auraGlow', 0, 3, 0.01, 'aura glow'], ['auraScale', 0.8, 2.5, 0.01, 'aura size'],
  ]],
  ['4 · The writs', [
    ['writLength', 0.3, 4, 0.05, 'length (m)'], ['writHeight', 0.8, 6, 0.05, 'hovers at (m)'], ['writFlight', 0.05, 1.5, 0.01, 'flight (s)'],
    ['writBob', 0, 0.6, 0.01, 'bob (m)'], ['writSpin', 0, 10, 0.1, 'spin (rad/s)'], ['writDrive', 0.02, 0.5, 0.01, 'drive down (s)'],
    ['writSink', 0, 1.5, 0.01, 'sinks into the floor (m)'], ['writGlow', 0, 8, 0.05, 'glow'],
  ]],
  ['5 · The floor', [
    ['floorGlow', 0, 6, 0.05, 'seams glow'], ['floorChar', 0, 1, 0.01, 'char'], ['crackScale', 0.5, 6, 0.05, 'crack density'],
    ['slotWidth', 0.05, 1, 0.01, 'slot width (m)'], ['markRadius', 0.2, 2, 0.01, 'reticle (m)'], ['brandFade', 0.05, 1, 0.01, 'dissolves over (× exit)'],
    ['plantShake', 0, 1, 0.01, 'plant knock'], ['plantFlash', 0, 1, 0.01, 'plant flash'], ['crackDecal', 0, 2, 0.01, 'crack decal (× radius)'],
    ['dustDecal', 0, 3, 0.01, 'dust ring (× radius)'], ['decalLife', 0.2, 8, 0.05, 'decals last (s)'], ['scorchLife', 0.5, 20, 0.1, 'scorch lasts (s)'],
  ]],
  ['6 · Particles', [
    ['moteRate', 0, 300, 1, 'motes /s'], ['moteSize', 0.01, 0.4, 0.005, 'mote size'], ['moteLife', 0.1, 3, 0.01, 'mote life'], ['moteSpeed', 0, 8, 0.05, 'mote speed'],
    ['handMotes', 0, 40, 1, 'hand motes'], ['sparkCount', 0, 128, 1, 'sparks'], ['sparkSize', 0.01, 0.4, 0.005, 'spark size'],
    ['sparkLife', 0.05, 2, 0.01, 'spark life'], ['sparkSpeed', 0, 20, 0.1, 'spark speed'], ['trailCount', 0, 10, 1, 'trail sparks'],
    ['chipCount', 0, 128, 1, 'chips'], ['chipSize', 0.01, 0.5, 0.005, 'chip size'], ['chipLife', 0.1, 3, 0.01, 'chip life'], ['chipSpeed', 0, 12, 0.05, 'chip speed'],
    ['particleGlow', 0, 6, 0.05, 'glow'],
  ]],
  ['7 · The verdict', [
    ['verdictShake', 0, 1.5, 0.01, 'knock'], ['shakeDecay', 0.5, 20, 0.1, 'knock decay'], ['shakeFrequency', 1, 40, 0.5, 'knock frequency'],
    ['verdictFlash', 0, 1, 0.01, 'flash'], ['burstReach', 0, 3, 0.01, 'shell reach (× seal)'], ['burstLife', 0.05, 2, 0.01, 'shell life (s)'],
    ['burstIntensity', 0, 3, 0.01, 'shell brightness'], ['burstOpacity', 0, 1, 0.01, 'shell opacity'], ['shockReach', 0, 3, 0.01, 'shockwave (× radius)'],
    ['shockWidth', 0.01, 0.4, 0.005, 'shockwave width'], ['arcSize', 0.1, 3, 0.05, 'arc burn (m)'],
  ]],
  ['8 · The lens', [['lensPull', 0, 3, 0.01, 'pull while watching'], ['lensShock', 0, 3, 0.01, 'verdict pressure ring']]],
];

export function buildEditor(gui, c, Editor) {
  const { R, sub, color, gradient, castAnim } = editorKit(Editor);
  const folder = gui.addFolder('⊘  Countermand Sigil');
  for (const [title, rows] of EDITOR) {
    const f = sub(folder, title);
    for (const row of rows) {
      if (row[0].startsWith('#')) color(f, c, row[0].slice(1), row[1]);
      else R(f, c, row[0], row[1], row[2], row[3], row[4]);
    }
    if (title === 'The cast') castAnim(f, c);
    if (title === '6 · Particles') {
      gradient(f, c, 'colorMote', 'mote & spark gradient');
      gradient(f, c, 'colorChip', 'chip gradient');
    }
  }
  return folder;
}
