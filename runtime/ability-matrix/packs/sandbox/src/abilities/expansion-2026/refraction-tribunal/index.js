import { Color, Group, Mesh, Vector3 } from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { routeExpansionTransparency } from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import {
  createBeamGeometry,
  createColumnGeometry,
  createJudgeGeometry,
  createQuad,
  createWitnessGeometry,
} from './geometry.js';
import {
  createBeamMaterial,
  createColumnMaterial,
  createFacetMaterial,
  createLensMaterial,
  createQuartzMaterial,
  createSealMaterial,
  createWitnessMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
export const UID = 'matrix-expansion/refraction-tribunal';

const TAU = Math.PI * 2;
const sat = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = sat(x);
  return t * t * (3 - 2 * t);
};

/** The court always has three judges (a triangle: the smallest closed court). */
const JUDGES = 3;
/** Hard ceiling on refracted legs; the `refractions` slider clamps to it. */
export const MAX_LEGS = 6;
/** Bodies the verdict may strike at once. */
const MAX_VERDICT = 8;
/** Beams: [0] entry, [1 + 2k] leg k into its witness, [2 + 2k] leg k out, last = climb to the apex. */
const MAX_BEAMS = 2 + MAX_LEGS * 2;
const BEAM_APEX = MAX_BEAMS - 1;

/* Module scratch — nothing below allocates per frame. */
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _p = new Vector3();
const _q = new Vector3();
const _hand = new Vector3();
const _Z = new Vector3(0, 0, 1);
const _UP = new Vector3(0, 1, 0);
const _emit = {
  position: new Vector3(), direction: new Vector3(), radius: 0, speed: 0, speedVariance: 0.35, spread: 0.5,
  size: 0.1, sizeVariance: 0.4, life: 0.5, lifeVariance: 0.3, spin: 0, tint: null, time: 0,
};
/** The dispersed spectrum thrown at each refraction (per-particle tints). */
const SPECTRUM = [
  new Color(1.0, 0.42, 0.5), new Color(1.0, 0.78, 0.45), new Color(0.6, 1.0, 0.75),
  new Color(0.5, 0.85, 1.0), new Color(0.78, 0.52, 1.0),
];

/**
 * REFRACTION TRIBUNAL — Crystal, zone cast. *Projectile refraction.*
 *
 * The caster holds out a hand and a **witness** — a cut gem of light —
 * condenses in it, spinning, while far ahead the floor cracks on three points
 * of a triangle and the **judges** start to come up: three slabs of quartz,
 * three metres tall, leaning out as if to hear. The witness flies. It does not
 * land: it strikes the near judge's face and is **refracted** — bent, split
 * into a spectral fan — onto the nearest enemy in the court that has not been
 * judged, through it, and on to the next judge, which turns its face to catch
 * it and bends it again. Judge to witness to judge, `refractions` times,
 * round the triangle; every refraction flashes the judge white, throws a fan
 * of coloured streaks and leaves the bent leg of light hanging in the air.
 * Then the light climbs to the apex, the three judges **bow** until their
 * points meet over the centre, and the **verdict** drops: a column of light
 * into the middle of the court, a pressure ring, a frost shell of amethyst,
 * the floor crystallising. The court stands, humming — the judges turn slowly
 * on their axes, light bands climb inside them, caustics crawl over the seal —
 * and then they straighten, crack, and sink back into the floor.
 *
 * ## Beats
 *   1. **anticipation** — `chargeTime`: the witness grows in the hand; the
 *      judges are already rising out of cracked floor at the target.
 *   2. **travel** — the witness flies, trailing a ribbon, to the near judge.
 *   3. **impact** — the first refraction (flash, knock, spectral fan), and
 *      every leg after it lands on a single frame on its enemy.
 *   4. **linger** — legs, bow, verdict, then `verdictHold` of humming court:
 *      the silhouette never stops changing (turning, bowing, spinning).
 *   5. **exit** — the judges straighten and sink, the seal dissolves.
 *
 * ## Layers
 *   1. **judges** — authored quartz clusters (`createJudgeGeometry`): solid,
 *      lit `MeshStandardMaterial` on `LAYER.WORLD`, casting shadows.
 *   2. **facet light** (`createFacetMaterial`) — dispersive rim, climbing
 *      bands, refraction flash; additive shell on each judge.
 *   3. **beams** (`createBeamMaterial`) — the bent legs, camera-facing
 *      chromatic ribbons, one per leg half.
 *   4. **the witness** (`createWitnessMaterial`) — the bolt's gem.
 *   5. **the seal** (`createSealMaterial`) — the court on the floor.
 *   6. **the column** (`createColumnMaterial`) — the verdict.
 *   7. **particles** — SOFT glints off the witness and the judges' points,
 *      STREAK spectral fans at refractions, CHIP quartz at eruption, verdict
 *      and exit.
 *   8. **world answers** — CRACK decals under each judge, FROST and
 *      SHOCKWAVE decals and a FROST shell at the verdict, flash, shake,
 *      light punch.
 *   9. **the lens** (`createLensMaterial`, `LAYER.DISTORTION`).
 *
 * ## Placement is derived
 * Judges stand at `judgeRing × zoneRadius` on a triangle that shows the
 * caster an edge (judge 0 front-left), so the witness enters judge 0 and no
 * judge stands between the caster and the verdict. The bow is
 * solved, not tuned: a judge of height `H` seated `Rj` from the centre puts
 * its point over the centre when it leans in by `asin(Rj / H)`, so the bow
 * angle is computed from `zoneRadius` every frame (and `H` grows when the
 * court is too wide for the judges to reach). Every beam end is the live
 * refraction point on a judge, so dragging a slider mid-cast keeps the light
 * on the crystal.
 *
 * ## Gameplay (`handlesOwnHits`)
 * Leg k starts at judge `k mod 3` and picks the nearest enemy inside the
 * court not yet struck by this cast; halfway through the leg it strikes it
 * (knocked along the bent beam). With no enemy left the leg runs straight to
 * the next judge. After the last leg, the verdict strikes every enemy not yet
 * judged within `verdictRadius` of the centre. Each enemy is struck at most
 * once per cast; at most `refractions + 8` strikes. Through the expansion
 * combat binding when present, else the dummy field.
 *
 * ## The editor rule
 * Records hold dice and events only: which enemy a leg chose, where and when
 * it struck, when each judge last refracted. Every dimension, colour, count
 * and timing is read from `settings.refractionTribunal` every frame.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return JUDGES * 2 + MAX_BEAMS + 4;
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  _legCount() {
    return Math.max(1, Math.min(MAX_LEGS, Math.round(this.config.refractions)));
  }

  _legTime() {
    return Math.max(0.05, this.config.legTime) * settings.global.lifetime;
  }

  /** Seconds after arrival at which the verdict falls. */
  _verdictAt() {
    return this._legCount() * this._legTime() + Math.max(0.02, this.config.verdictDelay) * settings.global.lifetime;
  }

  get impactDuration() {
    return this._verdictAt() + Math.max(0.1, this.config.verdictHold) * settings.global.lifetime;
  }

  get fadeDuration() {
    return 0.8 * settings.global.lifetime;
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

    // 5 · the seal
    const quad = own(createQuad());
    this.sealMaterial = own(createSealMaterial());
    this.seal = new Mesh(quad, this.sealMaterial);
    this.seal.rotation.x = -Math.PI / 2;
    this.seal.position.y = 0.03;
    this.seal.renderOrder = 2;
    this.seal.frustumCulled = false;
    this.root.add(this.seal);

    // 1 · 2 · the judges: a pivot (seat + lean) → spin → solid + shell
    const judgeGeometry = own(createJudgeGeometry());
    this.judges = [];
    for (let k = 0; k < JUDGES; k++) {
      const pivot = new Group();
      pivot.rotation.order = 'YZX';
      const spin = new Group();
      pivot.add(spin);
      const quartz = own(createQuartzMaterial());
      const solid = new Mesh(judgeGeometry, quartz);
      solid.castShadow = true;
      solid.receiveShadow = true;
      solid.layers.set(LAYER.WORLD);
      spin.add(solid);
      const facet = own(createFacetMaterial());
      const shell = new Mesh(judgeGeometry, facet);
      shell.renderOrder = 6;
      spin.add(shell);
      this.root.add(pivot);
      this.judges.push({
        pivot, spin, solid, shell, quartz, facet,
        // dice
        spinSeed: 0,
        // events
        lastCharge: -1e3, aimFrom: 0, aimTo: 0, aimAt: -1e3,
        // per-frame (derived, not state)
        lean: 0, height: 1, baseY: 0,
        state: { clock: 0, charge: 0, dissolve: 0, fade: 1 },
        quartzState: { charge: 0 },
      });
    }

    // 3 · beams
    const beamGeometry = own(createBeamGeometry());
    this.beams = [];
    for (let i = 0; i < MAX_BEAMS; i++) {
      const material = own(createBeamMaterial(i));
      const mesh = new Mesh(beamGeometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 8;
      mesh.visible = false;
      this.root.add(mesh);
      this.beams.push({ mesh, material, state: { clock: 0, fade: 0, length: 1, head: 1, width: 0.1 } });
    }

    // 4 · the witness
    this.witnessMaterial = own(createWitnessMaterial());
    this.witness = new Mesh(own(createWitnessGeometry()), this.witnessMaterial);
    this.witness.renderOrder = 9;
    this.witness.frustumCulled = false;
    this.root.add(this.witness);

    // 6 · the column
    this.columnMaterial = own(createColumnMaterial());
    this.column = new Mesh(own(createColumnGeometry()), this.columnMaterial);
    this.column.renderOrder = 7;
    this.column.frustumCulled = false;
    this.column.visible = false;
    this.root.add(this.column);

    // 9 · the lens
    this.lensMaterial = own(createLensMaterial());
    this.lens = new Mesh(quad, this.lensMaterial);
    this.lens.rotation.x = -Math.PI / 2;
    this.lens.position.y = 0.35;
    this.lens.visible = false;
    this.lens.frustumCulled = false;
    this.root.add(this.lens);

    /* records: fixed pools, reset in spawn */
    this.legs = [];
    for (let i = 0; i < MAX_LEGS; i++) {
      this.legs.push({
        started: false, judge: 0, start: 0,
        hasTarget: false, ref: null, id: null, hx: 0, hy: 0, hz: 0,
        struck: false, struckAt: 0,
      });
    }
    this.struck = new Array(MAX_LEGS + MAX_VERDICT).fill(null);
    this.struckCount = 0;
    this.hits = 0;
    this.center = new Vector3();
    this.entry = new Vector3();
    this.boltPos = new Vector3();
    this._lastBolt = new Vector3();
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._glints = new RateEmitter();
    this._hum = new RateEmitter();
    this._sealState = { cx: 0, cz: 0, radius: 1, ring: 0.86, angle: 0, draw: 0, clock: 0, c0: 0, c1: 0, c2: 0, wave: -1, dissolve: 0, fade: 1 };
    this._witnessState = { fade: 1, flicker: 0.5 };
    this._columnState = { clock: 0, power: 0 };
    this._lensState = { pull: 0, shock: 0, wave: 0, clock: 0 };

    routeExpansionTransparency(this.group);
    this.lens.layers.set(LAYER.DISTORTION);
    for (const j of this.judges) j.solid.layers.set(LAYER.WORLD);
    this._disposed = false;
  }

  createParticles() {
    const get = (name, options) => this.ctx.particles?.get?.(`${ID}.${name}`, options) ?? null;
    this.glints = get('glint', { capacity: 900, shape: ParticleShape.SOFT, additive: true, softFade: 0.3 });
    this.streaks = get('streak', { capacity: 900, shape: ParticleShape.STREAK, additive: true, stretch: true, softFade: 0.3 });
    this.chips = get('chip', { capacity: 500, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.2 });
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this._calm = prefersReducedMotion();
    this.pointAt(1, this.center);
    this.center.y = 0;
    for (const leg of this.legs) {
      leg.started = false; leg.hasTarget = false; leg.ref = null; leg.id = null; leg.struck = false;
      leg.start = 0; leg.struckAt = 0; leg.judge = 0; leg.hx = leg.hy = leg.hz = 0;
    }
    this.struck.fill(null);
    this.struckCount = 0;
    this.hits = 0;
    this._legIndex = 0;
    this._arrived = false;
    this._verdict = false;
    this._verdictTime = 0;
    this._cracked = false;
    this._shattered = false;
    this._sunk = false;
    this._glints.reset();
    this._hum.reset();
    for (let k = 0; k < JUDGES; k++) {
      const j = this.judges[k];
      j.spinSeed = (Math.random() - 0.5) * 0.8 * settings.global.randomness;
      j.lastCharge = -1e3;
      j.aimFrom = j.aimTo = j.spinSeed;
      j.aimAt = -1e3;
    }
    this.root.visible = true;
    this.witness.visible = true;
    this.column.visible = false;
    this.lens.visible = false;
    for (const b of this.beams) b.mesh.visible = false;
    this.position.copy(this._handPoint(_hand));
    this.boltPos.copy(this.position);
    this._lastBolt.copy(this.position);
    this._sync(0);
  }

  /**
   * The front: holds at the hand for `chargeTime` (anticipation), then runs
   * to the near judge — not the centre — so the witness strikes the court's
   * first face. `this.position` follows the witness.
   */
  advance(dt) {
    const c = this.config;
    const g = settings.global;
    const charge = Math.max(0, c.chargeTime) * g.lifetime;
    const end = Math.max(0.1, this.length - this._ring());
    if (this.age < charge) {
      this.u = 0;
      this.position.copy(this._handPoint(_hand));
      return false;
    }
    const speed = c.speed * g.speed;
    const easeIn = Easing.outQuad(sat((this.age - charge) / 0.08));
    this.front += speed * easeIn * dt;
    const previousU = this.u;
    this.u = sat(this.front / end);
    this._flightPoint(this.u, this.position);
    return this.u >= 1 && previousU < 1;
  }

  onTravel(dt) {
    this._sync(dt);
  }

  onImpact() {
    this._arrived = true;
    this._legIndex = 0;
    this._refract(0, 0);
    this._startLeg(0);
    const c = this.config;
    const power = settings.global.explosionIntensity;
    if (c.arrivalShake > 0) this.ctx.shake?.add?.(c.arrivalShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.arrivalFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorB), c.arrivalFlash * power);
    this._sync(0);
  }

  onFade(dt) {
    const since = this._since();
    const n = this._legCount();
    const legT = this._legTime();
    // Start every leg whose time has come (in order; large dt safe).
    while (this._legIndex < n && since >= this._legIndex * legT) this._startLeg(this._legIndex);
    // Strike every started leg halfway through.
    for (let i = 0; i < this._legIndex; i++) {
      const leg = this.legs[i];
      if (leg.hasTarget && !leg.struck && since >= leg.start + legT * 0.5) this._strikeLeg(leg, since);
    }
    if (!this._verdict && since >= this._verdictAt()) {
      this._verdict = true;
      this._verdictTime = since;
      this._passVerdict();
    }
    if (this.phase === 'fade' && !this._sunk) {
      this._sunk = true;
      this._shatterWitness();
      this._chipsAtJudges(0.7);
    }
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Geometry of the court (all derived from settings, every call)        */
  /* ------------------------------------------------------------------ */

  /** Judges' ring radius (m). */
  _ring() {
    return Math.max(0.2, this.config.zoneRadius * this.config.judgeRing);
  }

  /**
   * Judge height (m): grows when the court is too wide for a steep bow
   * (the bowed lean never passes ~37°, so the verdict always has a tall apex).
   */
  _height() {
    return Math.max(this.config.judgeHeight, this._ring() / 0.6);
  }

  /**
   * Bearing (world xz, radians) of judge k. The triangle shows the caster an
   * *edge*, not a vertex: judge 0 stands front-left (60° off the caster's
   * bearing), judge 1 directly behind the centre, judge 2 front-right — so no
   * judge stands between the caster and the verdict.
   */
  _bearing(k) {
    return Math.atan2(-this.direction.z, -this.direction.x) + Math.PI / 3 + k * (TAU / JUDGES);
  }

  /** Floor point under judge k. */
  _seat(k, out) {
    const a = this._bearing(k), r = this._ring();
    return out.set(this.center.x + Math.cos(a) * r, 0, this.center.z + Math.sin(a) * r);
  }

  /** A point `h` (m) up judge k's axis, honouring its current lean and sink. */
  _alongJudge(k, h, out) {
    const j = this.judges[k];
    const a = this._bearing(k);
    this._seat(k, out);
    const s = Math.sin(j.lean), co = Math.cos(j.lean);
    out.x += Math.cos(a) * s * h;
    out.z += Math.sin(a) * s * h;
    out.y = j.baseY + co * h;
    return out;
  }

  /** Where the beam touches judge k. */
  _refractPoint(k, out) {
    return this._alongJudge(k, this._height() * this.config.refractAt, out);
  }

  /** The apex the bowed judges point at. */
  _apex(out) {
    const H = this._height();
    const lean = this._bowLean();
    return out.set(this.center.x, Math.max(0.5, Math.cos(lean) * H * 0.98), this.center.z);
  }

  /** Lean (rad, negative = inward) that puts a judge's point over the centre. */
  _bowLean() {
    const ratio = Math.min(0.98, (this._ring() / this._height()) * this.config.bowAmount);
    return -Math.asin(ratio);
  }

  _handPoint(out) {
    const c = this.config;
    return out.copy(this.origin).addScaledVector(this.direction, 0.65).addScaledVector(this.side, 0.22).setY(c.boltHeight);
  }

  /** Point on the flight from the hand to the near judge's face, u 0..1. */
  _flightPoint(u, out) {
    this._handPoint(_a);
    this._refractPoint(0, _b);
    out.lerpVectors(_a, _b, u);
    // A shallow arc so the flight reads as thrown, not drawn.
    out.y += Math.sin(Math.PI * u) * 0.35;
    return out;
  }

  /** Seconds since the witness struck the court (−1 before). */
  _since() {
    if (!this._arrived) return -1;
    return this.phase === 'fade' ? this.impactDuration + this.fadeTime : this.impactTime;
  }

  /* ------------------------------------------------------------------ */
  /* Gameplay                                                            */
  /* ------------------------------------------------------------------ */

  _alreadyStruck(key) {
    for (let i = 0; i < this.struckCount; i++) if (this.struck[i] === key) return true;
    return false;
  }

  _markStruck(key) {
    if (this.struckCount < this.struck.length) this.struck[this.struckCount++] = key;
  }

  /**
   * Leg k: from judge k mod 3, choose the nearest enemy in the court not yet
   * struck (an event: the choice and the point are stored, nothing else).
   */
  _startLeg(i) {
    const leg = this.legs[i];
    const c = this.config;
    const k = i % JUDGES;
    leg.started = true;
    leg.judge = k;
    leg.start = i * this._legTime();
    leg.hasTarget = false;
    leg.ref = null;
    leg.id = null;
    leg.struck = false;
    this._legIndex = i + 1;
    this._seat(k, _c);
    let best = Infinity;
    if (this._scope) {
      const res = this._scope.queryActors({ position: [this.center.x, 0, this.center.z], radius: c.zoneRadius, relation: 'enemy' });
      if (!res.ok) {
        this.failure = res.reason;
      } else {
        for (const actor of res.actors) {
          if (!actor.alive || this._alreadyStruck(actor.id) || this._claimed(actor.id)) continue;
          const dx = actor.position[0] - _c.x, dz = actor.position[2] - _c.z;
          const d = dx * dx + dz * dz;
          if (d < best) {
            best = d; leg.id = actor.id; leg.hx = actor.position[0]; leg.hz = actor.position[2];
          }
        }
      }
    } else if (this.ctx.dummies?.findTargets) {
      const found = this.ctx.dummies.findTargets(this.center.x, this.center.z, c.zoneRadius, this._found);
      const r2 = c.zoneRadius * c.zoneRadius;
      for (const dummy of found) {
        if (dummy.alive === false || this._alreadyStruck(dummy) || this._claimed(dummy)) continue;
        const cx = dummy.position.x - this.center.x, cz = dummy.position.z - this.center.z;
        if (cx * cx + cz * cz > r2) continue;
        const dx = dummy.position.x - _c.x, dz = dummy.position.z - _c.z;
        const d = dx * dx + dz * dz;
        if (d < best) {
          best = d; leg.ref = dummy; leg.hx = dummy.position.x; leg.hz = dummy.position.z;
        }
      }
    }
    leg.hasTarget = best < Infinity;
    leg.hy = 1.05;
    // The judge turns its face along the outgoing leg.
    const toward = leg.hasTarget ? Math.atan2(leg.hz - _c.z, leg.hx - _c.x) : this._bearing((k + 1) % JUDGES) + Math.PI;
    this._aim(k, toward, leg.start);
    if (i > 0) this._refract(k, leg.start);
  }

  /** True if a started, unstruck leg already chose this target. */
  _claimed(key) {
    for (let i = 0; i < this._legIndex - 1; i++) {
      const leg = this.legs[i];
      if (leg.hasTarget && !leg.struck && (leg.ref === key || leg.id === key)) return true;
    }
    return false;
  }

  _strikeLeg(leg, since) {
    leg.struck = true;
    leg.struckAt = since;
    const key = leg.ref ?? leg.id;
    this._markStruck(key);
    this._refractPoint(leg.judge, _a);
    let dx = leg.hx - _a.x, dz = leg.hz - _a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) { dx = this.direction.x; dz = this.direction.z; } else { dx /= len; dz /= len; }
    this._hit(leg.ref, leg.id, dx, dz, _a.x, _a.z, leg.hx, leg.hz);
    // The witness passes through: a small spectral spray at the body.
    _p.set(leg.hx, leg.hy, leg.hz);
    this._spectralFan(_p, dx, dz, 0.5);
    this.lightBoost = Math.max(this.lightBoost, this.config.refractLight * 0.6 * settings.global.explosionIntensity);
  }

  /** One strike, through the combat binding or the dummy field. */
  _hit(ref, id, dx, dz, sx, sz, tx, tz) {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    if (this._scope) {
      if (id === null) return;
      const sent = this._scope.emit({
        type: 'hit', element: 'crystal', targetIds: [id],
        position: [tx, 0, tz], sourcePosition: [sx, 0, sz], damage: 1,
        hitForce: impactForce(c, power), tags: ['refraction-tribunal'],
      });
      if (!sent.ok) this.failure = sent.reason;
      else this.hits++;
      return;
    }
    if (!ref?.kill) return;
    this._force.impulse = c.hitImpulse * power;
    this._force.lift = c.hitLift * power;
    this._force.spin = c.hitSpin;
    if (ref.kill(dx, dz, this._force)) this.hits++;
  }

  /** The verdict: every unjudged enemy near the centre, the court's big beat. */
  _passVerdict() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const vr = Math.min(c.verdictRadius, c.zoneRadius);
    let count = 0;
    if (this._scope) {
      const res = this._scope.queryActors({ position: [this.center.x, 0, this.center.z], radius: vr, relation: 'enemy' });
      if (!res.ok) this.failure = res.reason;
      else {
        for (const actor of res.actors) {
          if (count >= MAX_VERDICT) break;
          if (!actor.alive || this._alreadyStruck(actor.id)) continue;
          this._markStruck(actor.id);
          const dx = actor.position[0] - this.center.x, dz = actor.position[2] - this.center.z;
          const l = Math.hypot(dx, dz) || 1;
          this._hit(null, actor.id, dx / l, dz / l, this.center.x, this.center.z, actor.position[0], actor.position[2]);
          count++;
        }
      }
    } else if (this.ctx.dummies?.findTargets) {
      const found = this.ctx.dummies.findTargets(this.center.x, this.center.z, vr, this._found);
      for (const dummy of found) {
        if (count >= MAX_VERDICT) break;
        if (dummy.alive === false || this._alreadyStruck(dummy)) continue;
        let dx = dummy.position.x - this.center.x, dz = dummy.position.z - this.center.z;
        const l = Math.hypot(dx, dz);
        if (l > vr) continue;
        if (l < 1e-6) { dx = this.direction.x; dz = this.direction.z; } else { dx /= l; dz /= l; }
        this._markStruck(dummy);
        this._hit(dummy, null, dx, dz, this.center.x, this.center.z, dummy.position.x, dummy.position.z);
        count++;
      }
    }

    // The world answers.
    const r = c.zoneRadius;
    this.lightBoost = c.verdictLight * power;
    _p.copy(this.center).setY(0.05);
    this.ctx.bursts?.spawn?.(BurstMode.FROST, _p, {
      radius: r * 0.12, endRadius: r * c.burstReach * power, life: c.burstLife, intensity: c.burstIntensity,
      opacity: c.burstOpacity * g.opacity, fresnel: 2 * g.fresnel, squash: 0.45,
      colorA: getColor(c.colorBurstA), colorB: getColor(c.colorBurstB), colorC: getColor(c.colorBurstC),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _p, {
      radius: r * 1.1 * power, life: c.decalLife * 0.35, width: c.shockwaveWidth, intensity: 1.2,
      colorA: getColor(c.colorA), colorB: getColor(c.colorC),
    });
    this.ctx.decals?.spawn?.(DecalType.FROST, _p, {
      radius: r * 0.95, life: c.decalLife, intensity: c.frostIntensity, growth: 0.35,
      colorA: getColor(c.colorB), colorB: getColor(c.colorD),
    });
    if (c.verdictShake > 0) this.ctx.shake?.add?.(c.verdictShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.verdictFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorB), c.verdictFlash * power);
    // Streaks thrown out of the column's foot, chips knocked off the judges.
    if (this.streaks) {
      this._syncSystems();
      const e = _emit;
      e.position.copy(this.center).setY(0.25);
      e.direction.copy(_UP);
      e.radius = 0.3;
      e.spread = 0.95;
      e.speed = c.streakSpeed * 1.2 * g.particleSpeed;
      e.size = c.streakSize * 1.4 * g.particleSize;
      e.life = c.streakLife * 1.3 * g.particleLifetime;
      e.spin = 0;
      e.time = frame.uTime.value;
      for (let i = 0; i < SPECTRUM.length; i++) {
        e.tint = SPECTRUM[i];
        this.streaks.emit(Math.round((c.streakCount * 2 * g.particleCount) / SPECTRUM.length), e);
      }
      e.tint = null;
    }
    this._chipsAtJudges(0.5);
    for (const j of this.judges) j.lastCharge = this._verdictTime;
  }

  /* ------------------------------------------------------------------ */
  /* Events of presentation                                              */
  /* ------------------------------------------------------------------ */

  /** A judge turns its face: store the event, the turn is eased per frame. */
  _aim(k, worldAngle, at) {
    const j = this.judges[k];
    const local = Math.atan2(Math.sin(worldAngle - this._bearing(k)), Math.cos(worldAngle - this._bearing(k)));
    j.aimFrom = this._currentAim(j, at);
    j.aimTo = j.spinSeed + local * this.config.turnAmount;
    j.aimAt = at;
  }

  _currentAim(j, t) {
    const c = this.config;
    const turn = Math.max(0.02, c.turnTime) * settings.global.lifetime;
    const e = Easing.outBack(sat((t - j.aimAt) / turn));
    return j.aimFrom + (j.aimTo - j.aimFrom) * e;
  }

  /** Judge k refracts the witness: flash, light, fan. */
  _refract(k, at) {
    const j = this.judges[k];
    j.lastCharge = at;
    const c = this.config;
    this.lightBoost = Math.max(this.lightBoost, c.refractLight * settings.global.explosionIntensity);
    this._refractPoint(k, _p);
    const a = this._bearing(k);
    // Fan inward (into the court), dispersed.
    this._spectralFan(_p, -Math.cos(a), -Math.sin(a), 1);
  }

  _spectralFan(at, dx, dz, scale) {
    if (!this.streaks) return;
    const c = this.config;
    const g = settings.global;
    this._syncSystems();
    const e = _emit;
    e.position.copy(at);
    e.radius = 0.08;
    e.spread = 0.12;
    e.speed = c.streakSpeed * g.particleSpeed;
    e.size = c.streakSize * g.particleSize;
    e.life = c.streakLife * g.particleLifetime;
    e.spin = 0;
    e.time = frame.uTime.value;
    const per = Math.max(1, Math.round((c.streakCount * scale * g.particleCount) / SPECTRUM.length));
    for (let i = 0; i < SPECTRUM.length; i++) {
      // Each colour bends by a different angle: the dispersion itself.
      const off = (i - (SPECTRUM.length - 1) / 2) * c.streakFan;
      const ca = Math.cos(off), sa = Math.sin(off);
      e.direction.set(dx * ca - dz * sa, 0.15 + 0.05 * i, dx * sa + dz * ca).normalize();
      e.tint = SPECTRUM[i];
      this.streaks.emit(per, e);
    }
    e.tint = null;
  }

  _chipsAtJudges(scale) {
    if (!this.chips) return;
    const c = this.config;
    const g = settings.global;
    this._syncSystems();
    const e = _emit;
    for (let k = 0; k < JUDGES; k++) {
      this._seat(k, e.position).setY(0.15);
      e.direction.copy(_UP);
      e.radius = 0.35;
      e.spread = 0.75;
      e.speed = c.chipSpeed * g.particleSpeed;
      e.size = c.chipSize * g.particleSize;
      e.life = c.chipLife * g.particleLifetime;
      e.spin = 6;
      e.tint = null;
      e.time = frame.uTime.value;
      this.chips.emit(Math.round(c.chipCount * scale * g.particleCount), e);
    }
  }

  _shatterWitness() {
    if (this._shattered) return;
    this._shattered = true;
    if (!this.chips) return;
    const c = this.config;
    const g = settings.global;
    const e = _emit;
    this._apex(e.position);
    e.direction.copy(_UP);
    e.radius = 0.2;
    e.spread = 1;
    e.speed = c.chipSpeed * 0.7 * g.particleSpeed;
    e.size = c.chipSize * 0.7 * g.particleSize;
    e.life = c.chipLife * g.particleLifetime;
    e.spin = 8;
    e.tint = null;
    e.time = frame.uTime.value;
    this.chips.emit(Math.round(c.chipCount * g.particleCount), e);
  }

  /** The floor cracks as the judges break through (once, at the start of the rise). */
  _crackFloor() {
    this._cracked = true;
    const c = this.config;
    for (let k = 0; k < JUDGES; k++) {
      this._seat(k, _p).setY(0.04);
      this.ctx.decals?.spawn?.(DecalType.CRACK, _p, {
        radius: c.crackRadius, life: c.decalLife + c.verdictHold, intensity: 1,
        colorA: getColor(c.colorB), colorB: getColor(c.colorD),
      });
    }
    this._chipsAtJudges(1);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _syncSystems() {
    const c = this.config;
    const g = settings.global;
    const set = (sys, prefix, glow) => {
      if (!sys?.uniforms) return;
      sys.setGradient?.(getColor(c[prefix + 'A']), getColor(c[prefix + 'B']), getColor(c[prefix + 'C']), getColor(c[prefix + 'D']));
      const u = sys.uniforms;
      if (u.uGlow) u.uGlow.value = glow * g.glow;
      if (u.uOpacity) u.uOpacity.value = g.opacity;
      if (u.uTurbulence) u.uTurbulence.value = 0.35 * g.turbulence;
      if (u.uSizeScale) u.uSizeScale.value = g.particleSize;
      if (u.uSpeedScale) u.uSpeedScale.value = g.particleSpeed;
      if (u.uLifeScale) u.uLifeScale.value = g.particleLifetime;
    };
    set(this.glints, 'colorGlint', c.glintGlow);
    set(this.streaks, 'colorStreak', c.streakGlow);
    set(this.chips, 'colorChip', c.chipGlow);
    if (this.chips?.uniforms?.uGravity) this.chips.uniforms.uGravity.value.set(0, -9, 0);
    if (this.streaks?.uniforms?.uGravity) this.streaks.uniforms.uGravity.value.set(0, -1.5, 0);
    if (this.glints?.uniforms?.uGravity) this.glints.uniforms.uGravity.value.set(0, 0.6, 0);
  }

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const L = g.lifetime;
    const calm = this._calm;
    const since = this._since();
    const fadeT = this.phase === 'fade' ? sat(this.fadeTime / this.fadeDuration) : 0;
    const fade = 1 - fadeT;
    const clock = calm ? 0 : this.age * g.noiseSpeed;
    const H = this._height();
    const R = c.zoneRadius;
    const n = this._legCount();
    const legT = this._legTime();
    const verdictAt = this._verdictAt();
    const sinceVerdict = this._verdict ? since - this._verdictTime : -1;

    this.root.position.set(0, 0, 0);

    /* --- the judges' pose ------------------------------------------------ */
    const riseT = sat(this.age / Math.max(0.05, c.riseTime * L));
    if (!this._cracked && this.age > 0) this._crackFloor();
    const rise = Easing.outBack(riseT);
    const bowTime = Math.max(0.05, c.bowTime * L);
    const bow = this._arrived ? smooth((since - (verdictAt - bowTime)) / bowTime) : 0;
    const bowLean = this._bowLean();
    const exitStraighten = Easing.inOutCubic(sat(fadeT * 1.6));
    const sink = Easing.inCubic(sat((fadeT - 0.15) / 0.85));
    for (let k = 0; k < JUDGES; k++) {
      const j = this.judges[k];
      // Outward while the court hears the case, then the solved bow.
      let lean = c.leanOut * (1 - bow) + bowLean * bow;
      if (bow > 0 && !calm) lean += Math.sin(this.age * 2.4 + k * 2.1) * c.humSway * bow * fade;
      // A refraction kicks the judge back a little.
      const charge = Math.exp(-Math.max(0, since - j.lastCharge) * c.chargeDecay) * (this._arrived ? 1 : 0);
      lean += charge * 0.06 * (1 - bow);
      lean = lean * (1 - exitStraighten) + c.leanOut * 0.5 * exitStraighten;
      j.lean = lean;
      j.height = H;
      j.baseY = -H * (1 - rise) - H * 1.05 * sink;
      this._seat(k, _a);
      j.pivot.position.set(_a.x, j.baseY, _a.z);
      // Pivot: Y turns local +X onto the radial, Z leans along it.
      j.pivot.rotation.set(0, -this._bearing(k), -lean);
      j.pivot.scale.set(c.judgeWidth, H, c.judgeWidth);
      // Spin: the aim the judge turned to, plus the court's slow hum.
      let aim = this._currentAim(j, since < 0 ? 0 : since);
      if (sinceVerdict > 0 && !calm) aim += c.humSpin * sinceVerdict * (k % 2 ? -1 : 1);
      j.spin.rotation.y = aim;
      j.state.clock = clock + k * 1.7;
      j.state.charge = charge * fade;
      j.state.dissolve = sat((fadeT - 0.25) / 0.75);
      j.state.fade = sat(riseT * 3);
      j.facet.userData.sync(j.state);
      j.quartzState.charge = charge;
      j.quartz.userData.sync(j.quartzState);
      j.pivot.visible = j.baseY > -H * 1.02;
    }

    /* --- the seal ------------------------------------------------------- */
    this.seal.position.set(this.center.x, 0.03, this.center.z);
    this.seal.scale.set(R * 2.1, R * 2.1, 1);
    const ss = this._sealState;
    ss.cx = this.center.x;
    ss.cz = this.center.z;
    ss.radius = R;
    ss.ring = c.judgeRing;
    ss.angle = this._bearing(0);
    ss.draw = smooth(this.age / Math.max(0.05, (c.chargeTime + c.riseTime) * L));
    ss.clock = clock;
    ss.c0 = this.judges[0].state.charge;
    ss.c1 = this.judges[1].state.charge;
    ss.c2 = this.judges[2].state.charge;
    ss.wave = this._verdict ? sat(sinceVerdict / (0.6 * L)) : -1;
    if (ss.wave >= 1) ss.wave = -1;
    ss.dissolve = sat(fadeT / Math.max(0.05, c.dissolveTime));
    ss.fade = 1;
    this.sealMaterial.userData.sync(ss);

    /* --- the witness and its beams -------------------------------------- */
    for (const b of this.beams) b.mesh.visible = false;
    const beamLife = Math.max(0.05, c.beamLife * L);
    let wFade = 1;
    if (!this._arrived) {
      // Anticipation and flight.
      const charge = Math.max(0.01, c.chargeTime * L);
      const grow = Easing.outBack(sat(this.age / charge));
      this.boltPos.copy(this.position);
      this.witness.scale.setScalar(Math.max(0.001, c.boltSize * grow));
      if (this.u > 0) {
        this._handPoint(_a);
        // Trail: from `trailLength` behind the witness to the witness.
        const back = sat(1 - c.trailLength / Math.max(0.1, this.front));
        this._flightPoint(back * this.u, _b);
        this._beam(0, _b, this.boltPos, 1, 1, c.beamWidth * 0.8, clock);
      }
      // Glints converge in the hand, then shed off the flight.
      this._emitGlints(dt, this.boltPos, this.u > 0 ? 1 : 0.6);
    } else {
      this.witness.scale.setScalar(Math.max(0.001, c.boltSize * (this._verdict ? 0.8 : 1)));
      // The entry ribbon fades after arrival.
      const entryFade = 1 - sat(since / beamLife);
      if (entryFade > 0) {
        this._handPoint(_a);
        this._refractPoint(0, _b);
        this._beam(0, _a, _b, 1, entryFade, c.beamWidth * 0.8, clock);
      }
      // The legs.
      for (let i = 0; i < this._legIndex; i++) {
        const leg = this.legs[i];
        const t0 = leg.start;
        const tau = (since - t0) / legT;
        if (tau < 0) continue;
        this._refractPoint(leg.judge, _a);
        this._refractPoint((leg.judge + 1) % JUDGES, _b);
        if (leg.hasTarget) {
          _c.set(leg.hx, leg.hy, leg.hz);
          const h1 = sat(tau * 2), h2 = sat(tau * 2 - 1);
          const f1 = 1 - sat((since - (t0 + legT * 0.5)) / beamLife);
          const f2 = 1 - sat((since - (t0 + legT)) / beamLife);
          if (f1 > 0) this._beam(1 + i * 2, _a, _c, h1, f1, c.beamWidth, clock);
          if (h2 > 0 && f2 > 0) this._beam(2 + i * 2, _c, _b, h2, f2, c.beamWidth, clock);
          if (tau < 1) {
            if (tau < 0.5) this.boltPos.lerpVectors(_a, _c, h1);
            else this.boltPos.lerpVectors(_c, _b, h2);
          }
        } else {
          const h = sat(tau);
          const f = 1 - sat((since - (t0 + legT)) / beamLife);
          if (f > 0) this._beam(1 + i * 2, _a, _b, h, f, c.beamWidth, clock);
          if (tau < 1) this.boltPos.lerpVectors(_a, _b, h);
        }
      }
      // After the last leg: climb from the last judge to the apex.
      const climbStart = n * legT;
      if (since >= climbStart) {
        const climbT = sat((since - climbStart) / Math.max(0.02, verdictAt - climbStart));
        this._refractPoint(n % JUDGES, _a);
        this._apex(_b);
        const f = this._verdict ? 1 - sat(sinceVerdict / beamLife) : 1;
        if (f > 0) this._beam(BEAM_APEX, _a, _b, climbT, f, c.beamWidth, clock);
        if (!this._verdict) this.boltPos.lerpVectors(_a, _b, climbT);
        else this._apex(this.boltPos);
      }
      if (this._verdict) {
        // The witness hangs at the apex as the court's gavel, slowly spinning.
        this._apex(this.boltPos);
        if (!calm) this.boltPos.y += Math.sin(this.age * 2) * 0.05;
        wFade = this._shattered ? 0 : 1;
        // Glints shed off the judges' points while the court stands.
        const n2 = this._hum.tick(dt, c.glintRate * 0.6 * fade);
        if (n2 > 0 && this.glints) {
          for (let k = 0; k < JUDGES; k++) {
            this._alongJudge(k, H * 0.92, _p);
            this._glintBurst(_p, Math.max(1, Math.round(n2 / JUDGES)), 0.35);
          }
        }
      } else {
        this._emitGlints(dt, this.boltPos, 1);
      }
    }
    this.witness.visible = wFade > 0;
    this.witness.position.copy(this.boltPos);
    // Point the gem along its motion; in the hand and at the apex, straight down/up.
    if (this._arrived && !this._verdict) {
      _d.subVectors(this.boltPos, this._lastBolt);
      if (_d.lengthSq() > 1e-8) this.witness.quaternion.setFromUnitVectors(_Z, _d.normalize());
    } else if (!this._arrived) {
      this._refractPoint(0, _d);
      _d.sub(this.boltPos);
      if (_d.lengthSq() > 1e-8) this.witness.quaternion.setFromUnitVectors(_Z, _d.normalize());
    } else {
      this.witness.quaternion.setFromUnitVectors(_Z, _UP);
    }
    if (!calm) this.witness.rotateZ(this.age * c.boltSpin);
    this._lastBolt.copy(this.boltPos);
    // The cast's light rides the witness round the court.
    if (this._arrived) this.position.copy(this.boltPos);
    this._witnessState.fade = wFade * fade;
    this._witnessState.flicker = calm ? 0.5 : 0.5 + 0.5 * Math.sin(this.age * 31);
    this.witnessMaterial.userData.sync(this._witnessState);

    /* --- the verdict column --------------------------------------------- */
    this.column.visible = this._verdict && fade > 0.01;
    if (this.column.visible) {
      this._apex(_b);
      const drop = Easing.outCubic(sat(sinceVerdict / (0.12 * L)));
      const hold = sat(sinceVerdict / Math.max(0.1, c.verdictHold * L));
      const thin = 1 - c.columnLife * hold;
      const pulse = calm ? 1 : 0.85 + 0.15 * Math.sin(this.age * c.columnPulse);
      const width = c.columnWidth * thin * pulse * (1 + 0.6 * Math.exp(-sinceVerdict * 8));
      const height = _b.y * drop;
      this.column.position.set(this.center.x, _b.y - height, this.center.z);
      this.column.scale.set(width, Math.max(0.01, height), width);
      this._columnState.clock = clock;
      this._columnState.power = (0.55 + 0.45 * (1 - hold)) * sat(1 - fadeT * 2.5) * (1 + 1.5 * Math.exp(-sinceVerdict * 10));
      this.columnMaterial.userData.sync(this._columnState);
    }

    /* --- the lens ------------------------------------------------------- */
    const ls = this._lensState;
    ls.pull = bow * (this._verdict ? 0 : 1);
    ls.wave = this._verdict ? Easing.outCubic(sat(sinceVerdict / (0.55 * L))) : 0;
    ls.shock = this._verdict && ls.wave < 1 ? (1 - ls.wave) * fade : 0;
    ls.clock = clock;
    this.lens.visible = !calm && (ls.pull * c.lensStrength + ls.shock * c.lensShock) * g.distortion > 0.002;
    if (this.lens.visible) {
      this.lens.position.set(this.center.x, 0.35, this.center.z);
      this.lens.scale.set(R * 2.2, R * 2.2, 1);
      this.lensMaterial.userData.sync(ls);
    }
    this._syncSystems();
  }

  /** Lay beam `i` from a to b, drawn to `head` (0..1). */
  _beam(i, a, b, head, fade, width, clock) {
    const beam = this.beams[i];
    _q.subVectors(b, a);
    const len = _q.length();
    if (len < 1e-4 || fade <= 0 || head <= 0) return;
    beam.mesh.visible = true;
    beam.mesh.position.copy(a);
    beam.mesh.quaternion.setFromUnitVectors(_Z, _q.multiplyScalar(1 / len));
    beam.mesh.scale.set(1, 1, len);
    const s = beam.state;
    s.clock = clock;
    s.fade = fade;
    s.length = len;
    s.head = head;
    s.width = width;
    beam.material.userData.sync(s);
  }

  _emitGlints(dt, at, scale) {
    if (!this.glints) return;
    const count = this._glints.tick(dt, this.config.glintRate * scale);
    if (count > 0) this._glintBurst(at, count, 0.12);
  }

  _glintBurst(at, count, radius) {
    const c = this.config;
    const g = settings.global;
    const e = _emit;
    e.position.copy(at);
    e.direction.copy(_UP);
    e.radius = radius;
    e.spread = 1;
    e.speed = 0.5 * g.particleSpeed;
    e.size = c.glintSize * g.particleSize;
    e.life = c.glintLife * g.particleLifetime;
    e.spin = 0;
    e.tint = null;
    e.time = frame.uTime.value;
    this.glints.emit(Math.round(count * g.particleCount), e);
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._scope = null;
    this.root.visible = false;
    this.column.visible = false;
    this.lens.visible = false;
    for (const b of this.beams) b.mesh.visible = false;
    for (const leg of this.legs) leg.ref = null;
    this.struck.fill(null);
    this.struckCount = 0;
    this._arrived = false;
    this._verdict = false;
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

export function buildEditor(gui, c, Editor) {
  const { R, sub, color, gradient, castAnim } = editorKit(Editor);
  const folder = gui.addFolder('◬  Refraction Tribunal');

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 5, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 15, 0.1, 'min range');
  R(cast, c, 'speed', 4, 80, 0.5, 'witness flies at (m/s)');
  R(cast, c, 'zoneRadius', 1.5, 8, 0.05, 'court radius (m)');
  R(cast, c, 'lifetime', 0.5, 8, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'cooldown', 0, 20, 0.05, 'cooldown');
  castAnim(cast, c);

  const rule = sub(folder, 'Refraction (gameplay)');
  R(rule, c, 'refractions', 1, MAX_LEGS, 1, 'refractions');
  R(rule, c, 'legTime', 0.05, 1, 0.01, 'seconds per leg');
  R(rule, c, 'verdictDelay', 0.02, 1, 0.01, 'climb to the apex (s)');
  R(rule, c, 'verdictRadius', 0, 8, 0.05, 'verdict radius (m)');
  R(rule, c, 'verdictHold', 0.1, 4, 0.05, 'court stands for (s)');
  R(rule, c, 'hitImpulse', 0, 24, 0.1, 'impulse');
  R(rule, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(rule, c, 'hitSpin', 0, 8, 0.05, 'tumble');

  const light = sub(folder, 'Light');
  color(light, c, 'lightColor', 'colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'refractLight', 0, 20, 0.1, 'punch per refraction');
  R(light, c, 'verdictLight', 0, 30, 0.1, 'punch at the verdict');

  const bolt = sub(folder, '1 · The witness');
  R(bolt, c, 'chargeTime', 0, 1, 0.01, 'condenses in the hand (s)');
  R(bolt, c, 'boltHeight', 0.3, 3, 0.01, 'height at the hand (m)');
  R(bolt, c, 'boltSize', 0.1, 3, 0.01, 'gem size');
  R(bolt, c, 'boltSpin', 0, 30, 0.1, 'spin (rad/s)');
  R(bolt, c, 'boltGlow', 0, 8, 0.05, 'glow');
  R(bolt, c, 'trailLength', 0, 12, 0.1, 'trail (m)');

  const judges = sub(folder, '2 · The judges');
  R(judges, c, 'judgeRing', 0.3, 1, 0.01, 'stand at (× radius)');
  R(judges, c, 'judgeHeight', 0.8, 8, 0.05, 'height (m)');
  R(judges, c, 'judgeWidth', 0.3, 3, 0.01, 'girth');
  R(judges, c, 'riseTime', 0.05, 2, 0.01, 'erupt over (s)');
  R(judges, c, 'leanOut', -0.3, 0.6, 0.01, 'lean out (rad)');
  R(judges, c, 'refractAt', 0.1, 0.95, 0.01, 'beam strikes at (× height)');
  R(judges, c, 'turnTime', 0.02, 1, 0.01, 'turn to aim over (s)');
  R(judges, c, 'turnAmount', 0, 2, 0.01, 'turn amount');
  R(judges, c, 'bowAmount', 0, 1, 0.01, 'bow (1 = points meet)');
  R(judges, c, 'bowTime', 0.05, 1.5, 0.01, 'bow over (s)');
  R(judges, c, 'humSpin', 0, 3, 0.01, 'turn while standing (rad/s)');
  R(judges, c, 'humSway', 0, 0.2, 0.005, 'sway (rad)');
  color(judges, c, 'crystalColor', 'quartz');
  color(judges, c, 'crystalEmissive', 'quartz emissive');
  R(judges, c, 'crystalGlow', 0, 4, 0.01, 'quartz glow');
  R(judges, c, 'crystalRoughness', 0, 1, 0.01, 'roughness');
  R(judges, c, 'crystalMetalness', 0, 1, 0.01, 'metalness');

  const facet = sub(folder, '3 · Facet light');
  R(facet, c, 'facetGlow', 0, 6, 0.05, 'glow');
  R(facet, c, 'facetOpacity', 0, 1, 0.01, 'opacity');
  R(facet, c, 'facetFresnel', 0.3, 8, 0.05, 'rim power');
  R(facet, c, 'dispersion', 0, 2.5, 0.01, 'dispersion');
  R(facet, c, 'bandDensity', 0, 20, 0.1, 'bands');
  R(facet, c, 'bandSpeed', 0, 8, 0.05, 'band climb');
  R(facet, c, 'chargeGlow', 0, 10, 0.05, 'refraction flash');
  R(facet, c, 'chargeDecay', 0.5, 20, 0.1, 'flash decay');

  const beams = sub(folder, '4 · The beams');
  R(beams, c, 'beamWidth', 0.02, 0.6, 0.005, 'half-width (m)');
  R(beams, c, 'beamGlow', 0, 8, 0.05, 'glow');
  R(beams, c, 'beamSplit', 0, 2, 0.01, 'chromatic split');
  R(beams, c, 'beamFlow', 0, 20, 0.1, 'flow');
  R(beams, c, 'beamLife', 0.05, 2, 0.01, 'lingers (s)');

  const column = sub(folder, '5 · The verdict');
  R(column, c, 'columnWidth', 0.1, 2.5, 0.01, 'column radius (m)');
  R(column, c, 'columnGlow', 0, 8, 0.05, 'glow');
  R(column, c, 'columnPulse', 0, 20, 0.1, 'pulse');
  R(column, c, 'columnLife', 0, 1, 0.01, 'thins over the hold');
  R(column, c, 'arrivalShake', 0, 1, 0.01, 'arrival knock');
  R(column, c, 'arrivalFlash', 0, 1, 0.01, 'arrival flash');
  R(column, c, 'verdictShake', 0, 1, 0.01, 'verdict knock');
  R(column, c, 'verdictFlash', 0, 1, 0.01, 'verdict flash');
  R(column, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(column, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(column, c, 'burstReach', 0, 2, 0.01, 'shell grows to (× radius)');
  R(column, c, 'burstLife', 0.05, 3, 0.01, 'shell lives (s)');
  R(column, c, 'burstIntensity', 0, 3, 0.01, 'shell brightness');
  R(column, c, 'burstOpacity', 0, 1, 0.01, 'shell opacity');
  color(column, c, 'colorBurstA', 'shell inner');
  color(column, c, 'colorBurstB', 'shell mid');
  color(column, c, 'colorBurstC', 'shell outer');

  const seal = sub(folder, '6 · The seal');
  R(seal, c, 'sealGlow', 0, 6, 0.05, 'glow');
  R(seal, c, 'sealOpacity', 0, 1, 0.01, 'dark floor opacity');
  R(seal, c, 'sealLine', 0, 4, 0.05, 'etched lines');
  R(seal, c, 'causticGlow', 0, 4, 0.05, 'caustics');
  R(seal, c, 'causticScale', 0.2, 4, 0.01, 'caustic scale');
  R(seal, c, 'crackGlow', 0, 4, 0.05, 'cracks');
  R(seal, c, 'crackReach', 0.05, 1, 0.01, 'crack reach (× radius)');
  R(seal, c, 'dissolveTime', 0.05, 1, 0.01, 'dissolves over (× exit)');
  R(seal, c, 'crackRadius', 0.2, 4, 0.05, 'crack decal (m)');
  R(seal, c, 'decalLife', 0.2, 6, 0.05, 'decals last (s)');
  R(seal, c, 'shockwaveWidth', 0.01, 0.4, 0.005, 'shockwave width');
  R(seal, c, 'frostIntensity', 0, 3, 0.01, 'crystallised floor');

  const ramp = sub(folder, 'Palette');
  gradient(ramp, c, 'color', 'ramp (core → deep)');

  const fx = sub(folder, '7 · Particles');
  R(fx, c, 'glintRate', 0, 300, 1, 'glints per second');
  R(fx, c, 'glintSize', 0.01, 0.4, 0.005, 'glint size');
  R(fx, c, 'glintLife', 0.05, 3, 0.01, 'glint life');
  R(fx, c, 'glintGlow', 0, 6, 0.05, 'glint glow');
  gradient(fx, c, 'colorGlint', 'glints');
  R(fx, c, 'streakCount', 0, 120, 1, 'streaks per refraction');
  R(fx, c, 'streakSpeed', 0, 20, 0.1, 'streak speed');
  R(fx, c, 'streakSize', 0.01, 0.3, 0.005, 'streak size');
  R(fx, c, 'streakLife', 0.05, 2, 0.01, 'streak life');
  R(fx, c, 'streakFan', 0, 1, 0.01, 'spectral fan (rad)');
  R(fx, c, 'streakGlow', 0, 6, 0.05, 'streak glow');
  gradient(fx, c, 'colorStreak', 'streaks');
  R(fx, c, 'chipCount', 0, 60, 1, 'chips per judge');
  R(fx, c, 'chipSize', 0.02, 0.5, 0.005, 'chip size');
  R(fx, c, 'chipLife', 0.1, 3, 0.01, 'chip life');
  R(fx, c, 'chipSpeed', 0, 12, 0.1, 'chip speed');
  R(fx, c, 'chipGlow', 0, 6, 0.05, 'chip glow');
  gradient(fx, c, 'colorChip', 'chips');

  const lens = sub(folder, '8 · The lens');
  R(lens, c, 'lensStrength', 0, 3, 0.01, 'pull while bowing');
  R(lens, c, 'lensShock', 0, 3, 0.01, 'verdict pressure ring');

  return folder;
}
