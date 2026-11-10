import { Group, InstancedMesh, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../AuthoredImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { routeExpansionTransparency } from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { frame } from '../../../core/FrameUniforms.js';
import { LAYER } from '../../../core/Layers.js';
import { ELEMENT_OF_STATUS } from '../../../combat/ucsm/ontology.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import {
  addPoolInstances,
  addSerpentInstances,
  addThreadInstances,
  createFloorQuad,
  createSeedGeometry,
  createSerpentGeometry,
  createThreadGeometry,
  spineTip,
} from './geometry.js';
import {
  createHazeMaterial,
  createPoolMaterial,
  createSeedMaterial,
  createSerpentMaterial,
  createThreadMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
export const UID = 'matrix-expansion/venom-mimicry';

/** Carriers in all, the bitten host included. */
const MAX_CARRIERS = 8;
/** The serpent plus one mimic per carrier after the host. */
const MAX_SERPENTS = MAX_CARRIERS;
/** Ailments copied from the host (poison is always added on top). */
const MAX_MIMIC = 3;
/** Waves of contagion a cast can run. */
const MAX_WAVES = 6;

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const outCubic = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const lerp = (a, b, t) => a + (b - a) * t;

/* Module scratch: nothing below allocates per frame. */
const _obj = new Object3D();
const _tip = { x: 0, y: 0 };
const _at = new Vector3();
const _vel = new Vector3();
const _down = new Vector3(0, -1, 0);
const _up = new Vector3(0, 1, 0);
const _q = new Quaternion();
const _found = [];
const _probe = [];
const _cand = [];
let _cx = 0;
let _cz = 0;
const _byDistance = (a, b) => {
  const da = (a.x - _cx) ** 2 + (a.z - _cz) ** 2;
  const db = (b.x - _cx) ** 2 + (b.z - _cz) ** 2;
  return da - db || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
};
const _emit = {
  position: _at, radius: 0, direction: _up, speed: 1, speedVariance: 0.4, spread: 0.5,
  size: 0.1, sizeVariance: 0.4, life: 1, lifeVariance: 0.3, spin: 1, time: 0,
};
/** The stain a carrier's body wears; colours resolved from settings each frame. */
const _look = { color: '#24411a', rimColor: '#9cff3d', rimEmissive: 1.6, edgeColor: '#dcff86', edgeEmissive: 2 };

/**
 * VENOM MIMICRY — Poison, zone cast. *Infectious status imitation.*
 *
 * The spell is a creature that copies, and a copy that spreads.
 *
 *  1. **Anticipation** — a ridged venom seed swells at the caster's hand
 *     (`gatherTime`), then is **spat** in an arc to the circle, shedding drops.
 *  2. **Landing** — the seed bursts; a dark pool tears open (`zoneRadius`),
 *     veined and bubbling, and a hooded serpent rears out of it, facing the
 *     enemy nearest the centre with its back — and the two false eyes painted
 *     on its hood — toward the caster. Its hood is folded as it rises, and
 *     flares open as it rears back (`riseTime`, `rearTime`).
 *  3. **The bite (impact)** — one frame: the spine snaps from its rear pose to
 *     its strike pose and the fangs land on the host; the skin floods, venom
 *     splashes, a ring runs out across the pool, the camera knocks. The bite
 *     reads what the host is already suffering (its UCSM statuses).
 *  4. **Contagion (linger)** — every `hopInterval`, venom **threads** arc
 *     from each carrier to its nearest healthy neighbours (`fanout`, within
 *     `contagionRadius`), each laying poison *and a copy of the host's
 *     ailments* on the newly infected. Where a thread lands a smaller pool
 *     opens and a **mimic** serpent rises — the same mesh, the same hood, the
 *     same eyes — and weaves exactly as the original weaves, one beat late
 *     per generation (`mimicLag`): the imitation is visible as a ripple of
 *     the same sway passing outward through the crowd. Carriers' bodies
 *     stain venom green.
 *  5. **Venom (second impact)** — `venomDelay` after the last wave, every
 *     serpent strikes its carrier in unison; the threads flare and drain.
 *  6. **Exit** — the serpents fold their hoods and sink back into their
 *     pools; the pools dry out darker; the stains on the bodies stay.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the seed** (`createSeedMaterial`, lathe teardrop) — the travel.
 *   2. **the serpents** — one `InstancedMesh` of the authored spine-space body
 *      (`createSerpentGeometry`), lit and shadowed (`createSerpentMaterial`,
 *      a patched `MeshStandardMaterial` on `LAYER.SHAPED` with a matching
 *      depth material): the bend, the hood and the false eyes are all shader.
 *      Instance 0 is the serpent; 1…7 are the mimics.
 *   3. **venom threads** (`createThreadMaterial`) — instanced arcs.
 *   4. **pools** (`createPoolMaterial`) — instanced floor blots: the floor
 *      answers at the landing and under every carrier, and stays.
 *   5. **particles** — miasma (SMOKE) off every pool, venom drops (DROPLET)
 *      off the seed and every strike, splatter (STREAK) at the bite and the
 *      venom strike.
 *   6. **impacts** — WATER venom shells, SCORCH stain + RIPPLE + SHOCKWAVE
 *      decals, flash, camera knock, light punch.
 *   7. **haze** (`createHazeMaterial` on `LAYER.DISTORTION`) over the pool.
 *
 * ## Placement is derived
 *
 * A serpent's spine is `zoneRadius × serpentLength` long (× `mimicScale` for a
 * mimic) and its strike pose is the curvature profile (strikeLean,
 * strikeCurl). `spineTip` integrates that profile exactly as the vertex stage
 * does, so each serpent is planted `reach × length` short of its carrier on
 * the line it came from — the strike lands on the carrier at any radius,
 * length or pose, and every slider moves it on the next frame.
 *
 * ## Gameplay (`handlesOwnHits`)
 *
 * Deterministic and bounded: the host is the nearest enemy to the landing
 * point inside `zoneRadius` (ID breaks ties); each wave, carriers in
 * infection order take their `fanout` nearest uninfected enemies inside
 * `contagionRadius` (distance, then ID) until `maxInfected` (≤ 8). Through
 * the combat binding every infection is a UCSM `status` event — poison plus
 * one per copied ailment (≤ 3), all carriers of a wave in one event — and the
 * unison strike is one `hit` per carrier. Without combat the same rule runs
 * on the dummy field: infection stains, the strike fells. Records hold only
 * who was infected, by whom, and when; everything else is resolved from
 * `settings.venomMimicry` every frame.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  /** HUD readout only. */
  get instanceCount() {
    return this.serpents?.count ?? 0;
  }

  get lifeScale() {
    return Math.max(0.1, settings.global.lifetime);
  }

  /** Seconds after landing that the bite lands (authoring clock). */
  get biteAt() {
    const c = this.config;
    return c.riseTime + c.rearTime;
  }

  /** Seconds after landing that every serpent strikes (authoring clock). */
  get venomAt() {
    const c = this.config;
    return this.biteAt + this._waveCount() * c.hopInterval + c.venomDelay;
  }

  get impactDuration() {
    return (this.venomAt + this.config.recoilTime + 0.05) * this.lifeScale;
  }

  get fadeDuration() {
    return Math.max(0.05, this.config.exitTime) * this.lifeScale;
  }

  /** Time since landing on the authoring clock (runs through the fade). */
  get tau() {
    return (this.impactTime + this.fadeTime) / this.lifeScale;
  }

  lightShimmer() {
    return 0.86 + 0.14 * Math.sin(this.age * 5.3) * Math.sin(this.age * 1.7 + 0.4);
  }

  _waveCount() {
    return Math.max(0, Math.min(MAX_WAVES, Math.round(this.config.waves)));
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

    // 2 · the serpents: one authored body, instanced — the copies are the same creature.
    this.serpentMaterial = own(createSerpentMaterial());
    own(this.serpentMaterial.userData.depth);
    const serpentGeometry = own(addSerpentInstances(createSerpentGeometry(), MAX_SERPENTS));
    this.serpents = new InstancedMesh(serpentGeometry, this.serpentMaterial, MAX_SERPENTS);
    this.serpents.customDepthMaterial = this.serpentMaterial.userData.depth;
    this.serpents.castShadow = true;
    this.serpents.receiveShadow = true;
    this.serpents.frustumCulled = false;
    this.serpents.count = 0;
    this.root.add(this.serpents);

    // 3 · venom threads, laid in world space by their vertex stage.
    this.threadMaterial = own(createThreadMaterial());
    this.threads = new InstancedMesh(own(addThreadInstances(createThreadGeometry(), MAX_CARRIERS)), this.threadMaterial, MAX_CARRIERS);
    this.threads.frustumCulled = false;
    this.threads.renderOrder = 6;
    this.threads.count = 0;
    this.root.add(this.threads);

    // 4 · pools
    const quad = own(createFloorQuad());
    this.poolMaterial = own(createPoolMaterial());
    this.pools = new InstancedMesh(own(addPoolInstances(createFloorQuad(), MAX_SERPENTS)), this.poolMaterial, MAX_SERPENTS);
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 2;
    this.pools.count = 0;
    this.root.add(this.pools);

    // 1 · the seed
    this.seedMaterial = own(createSeedMaterial());
    this.seed = new Mesh(own(createSeedGeometry()), this.seedMaterial);
    this.seed.castShadow = true;
    this.seed.visible = false;
    this.root.add(this.seed);

    // 7 · haze
    this.hazeMaterial = own(createHazeMaterial());
    this.haze = new Mesh(quad, this.hazeMaterial);
    this.haze.visible = false;
    this.root.add(this.haze);

    routeExpansionTransparency(this.group);
    // SHAPED, not WORLD: the depth prepass would draw the raw spine-space
    // buffer through its override material; the shadow pass honours ours.
    this.serpents.layers.set(LAYER.SHAPED);
    this.haze.layers.set(LAYER.DISTORTION);

    /** Carrier records: who, by whom, when. Pooled. */
    this.carriers = [];
    for (let i = 0; i < MAX_CARRIERS; i++) {
      this.carriers.push({ id: '', dummy: null, x: 0, z: 0, fromX: 0, fromZ: 0, wave: 0, time: 0, seed: 0 });
    }
    this._count = 0;
    /** Elements of the ailments copied from the host. */
    this._mimicked = ['', '', ''];
    this._mimicCount = 0;
    this._miasma = [];
    for (let i = 0; i < MAX_SERPENTS; i++) this._miasma.push(new RateEmitter());
    this._trail = new RateEmitter();
    this._target = new Vector3();
    this._facing = new Vector3(0, 0, 1);
    this._disposed = false;
  }

  createParticles() {
    const p = this.ctx.particles;
    if (!p?.get) return;
    this.miasma = p.get(`${ID}.miasma`, { capacity: 900, shape: ParticleShape.SMOKE, additive: false, curl: true, softFade: 0.45 });
    this.drip = p.get(`${ID}.drip`, { capacity: 500, shape: ParticleShape.DROPLET, additive: false, softFade: 0.2 });
    this.spit = p.get(`${ID}.spit`, { capacity: 500, shape: ParticleShape.STREAK, additive: true, stretch: true, softFade: 0.25 });
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this._count = 0;
    this._mimicCount = 0;
    this._bitten = false;
    this._wavesDone = 0;
    this._venomed = false;
    this._landed = false;
    this._clock = 0;
    this._calm = prefersReducedMotion();
    for (const r of this.carriers) {
      r.id = '';
      r.dummy = null;
    }
    for (const e of this._miasma) e.reset();
    this._trail.reset();
    this._target.copy(this.origin);
    this._facing.copy(this.direction);
    this.root.visible = true;
    this.seed.visible = true;
    this.serpents.count = 0;
    this.threads.count = 0;
    this.pools.count = 0;
    this.haze.visible = false;
    this._sync(0);
  }

  onTravel(dt) {
    this._sync(dt);
  }

  onImpact() {
    this.position.y = 0;
    this._landed = true;
    this.seed.visible = false;
    this._acquireHost();
    this._landing();
    this._sync(0);
  }

  onFade(dt) {
    const c = this.config;
    const tau = this.tau;
    if (!this._bitten && tau >= this.biteAt) {
      this._bitten = true;
      this._bite();
    }
    const waves = this._waveCount();
    while (this._bitten && this._wavesDone < waves && tau >= this.biteAt + (this._wavesDone + 1) * c.hopInterval) {
      this._wavesDone++;
      this._spread(this._wavesDone, tau);
    }
    if (this._bitten && !this._venomed && tau >= this.venomAt) {
      this._venomed = true;
      this._venom();
    }
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Gameplay                                                            */
  /* ------------------------------------------------------------------ */

  /** Nearest dummy standing on a gameplay position (presentation only). */
  _dummyAt(x, z) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return null;
    const found = field.findTargets(x, z, 0.75, _probe);
    return found?.[0] ?? null;
  }

  _record(index, id, dummy, x, z, fromX, fromZ, wave, time) {
    const r = this.carriers[index];
    r.id = id;
    r.dummy = dummy;
    r.x = x;
    r.z = z;
    r.fromX = fromX;
    r.fromZ = fromZ;
    r.wave = wave;
    r.time = time;
    r.seed = ((index * 0.618034 + 0.137) % 1);
    return r;
  }

  _infected(id, dummy) {
    for (let i = 0; i < this._count; i++) {
      const r = this.carriers[i];
      if (dummy ? r.dummy === dummy : r.id === id) return true;
    }
    return false;
  }

  /** The bite's host: the nearest enemy to the landing point inside zoneRadius. */
  _acquireHost() {
    const c = this.config;
    const px = this.position.x;
    const pz = this.position.z;
    this._count = 0;
    if (this._scope) {
      const res = this._scope.queryActors({ position: [px, 0, pz], radius: c.zoneRadius, relation: 'enemy' });
      if (!res.ok) this.failure = res.reason;
      else {
        _cand.length = 0;
        for (const a of res.actors) if (a.alive !== false) _cand.push({ id: a.id, x: a.position[0], z: a.position[2] });
        _cx = px;
        _cz = pz;
        _cand.sort(_byDistance);
        const h = _cand[0];
        if (h) {
          this._record(0, h.id, this._dummyAt(h.x, h.z), h.x, h.z, this.origin.x, this.origin.z, 0, 0);
          this._count = 1;
        }
        _cand.length = 0;
      }
    } else if (this.ctx.dummies?.findTargets) {
      const found = this.ctx.dummies.findTargets(px, pz, c.zoneRadius, _found);
      for (const d of found) {
        if (!d?.position || d.alive === false) continue;
        if ((d.position.x - px) ** 2 + (d.position.z - pz) ** 2 > c.zoneRadius * c.zoneRadius) continue;
        this._record(0, '', d, d.position.x, d.position.z, this.origin.x, this.origin.z, 0, 0);
        this._count = 1;
        break;
      }
    }
    // The serpent faces along the line it was spat, onto the host (or the centre).
    if (this._count) this._target.set(this.carriers[0].x, 0, this.carriers[0].z);
    else this._target.set(px, 0, pz);
    this._facing.set(this._target.x - this.origin.x, 0, this._target.z - this.origin.z);
    if (this._facing.lengthSq() < 1e-6) this._facing.copy(this.direction);
    this._facing.normalize();
  }

  /** Swing a facing off the line it came along, so a strike reads in profile. */
  _turn(v, sign) {
    const a = this.config.approachAngle * sign;
    const x = v.x * Math.cos(a) - v.z * Math.sin(a);
    v.z = v.x * Math.sin(a) + v.z * Math.cos(a);
    v.x = x;
    return v;
  }

  /** The bite: poison on the host, and a copy taken of what it already suffers. */
  _bite() {
    const c = this.config;
    this._impactFX(this._target, 1, c.biteShake, c.biteFlash, c.biteLight);
    if (!this._count || !this._scope) return;
    const host = this.carriers[0];
    const got = this._scope.getActor(host.id);
    if (got?.ok) {
      const tags = [];
      for (const s of got.actor.statuses ?? []) {
        const element = ELEMENT_OF_STATUS[s?.tag];
        if (element && element !== 'poison' && !tags.includes(element)) tags.push(element);
      }
      tags.sort();
      const keep = Math.max(0, Math.min(MAX_MIMIC, Math.round(c.maxMimic)));
      this._mimicCount = Math.min(keep, tags.length);
      for (let i = 0; i < this._mimicCount; i++) this._mimicked[i] = tags[i];
    }
    if (this._scope.standalone) return; // statuses need the combat manager
    this._statuses([host.id], host.x, host.z, false);
  }

  /** Poison, plus (when `copies`) every copied ailment, on a set of carriers. */
  _statuses(ids, x, z, copies) {
    const c = this.config;
    const ticks = Math.max(1, Math.min(Math.round(c.statusSeconds * (this._scope.tickRate ?? 30)), 1800));
    const n = copies ? this._mimicCount : 0;
    for (let i = -1; i < n; i++) {
      const sent = this._scope.emit({
        type: 'status',
        element: i < 0 ? 'poison' : this._mimicked[i],
        targetIds: ids.slice(),
        position: [x, 0, z],
        durationTicks: ticks,
        intensity: 1,
        tags: ['venom-mimicry', i < 0 ? 'venom' : 'mimicry'],
      });
      if (!sent.ok) this.failure = sent.reason;
    }
  }

  /** One wave of contagion: carriers of the last wave infect their neighbours. */
  _spread(wave, tau) {
    const c = this.config;
    const cap = Math.max(1, Math.min(MAX_CARRIERS, Math.round(c.maxInfected)));
    const fanout = Math.max(0, Math.min(MAX_CARRIERS, Math.round(c.fanout)));
    const radius = Math.max(0, Math.min(48, c.contagionRadius));
    const before = this._count;
    if (!before || !fanout) return;
    const ids = this._scope && !this._scope.standalone ? [] : null;
    for (let i = 0; i < before && this._count < cap; i++) {
      const from = this.carriers[i];
      if (from.wave !== wave - 1) continue;
      let taken = 0;
      if (this._scope) {
        const res = this._scope.queryActors({ position: [from.x, 0, from.z], radius, relation: 'enemy' });
        if (!res.ok) {
          this.failure = res.reason;
          continue;
        }
        _cand.length = 0;
        for (const a of res.actors) {
          if (a.alive === false || this._infected(a.id, null)) continue;
          _cand.push({ id: a.id, x: a.position[0], z: a.position[2] });
        }
        _cx = from.x;
        _cz = from.z;
        _cand.sort(_byDistance);
        for (const a of _cand) {
          if (taken >= fanout || this._count >= cap) break;
          this._record(this._count++, a.id, this._dummyAt(a.x, a.z), a.x, a.z, from.x, from.z, wave, tau);
          ids?.push(a.id);
          taken++;
        }
        _cand.length = 0;
      } else if (this.ctx.dummies?.findTargets) {
        const found = this.ctx.dummies.findTargets(from.x, from.z, radius, _found);
        for (const d of found) {
          if (taken >= fanout || this._count >= cap) break;
          if (!d?.position || d.alive === false || this._infected('', d)) continue;
          if ((d.position.x - from.x) ** 2 + (d.position.z - from.z) ** 2 > radius * radius) continue;
          this._record(this._count++, '', d, d.position.x, d.position.z, from.x, from.z, wave, tau);
          taken++;
        }
      }
    }
    if (this._count > before) this._threadFX(before);
    if (ids?.length) {
      const first = this.carriers[before];
      this._statuses(ids, first.x, first.z, true);
    }
  }

  /**
   * Where serpent `i` stands: short of its carrier by the strike's reach,
   * drawn back by the lunge until `strike` (0..1) carries it forward. At
   * strike = 1 the fangs are exactly on the carrier.
   */
  _base(i, out, strike = 1) {
    const c = this.config;
    const L = this._length(i);
    spineTip(c.strikeLean, c.strikeCurl, _tip);
    const reach = _tip.x + c.lunge * (1 - strike);
    if (i === 0) {
      this._turn(_vel.copy(this._facing), 1);
      out.copy(this._target).addScaledVector(_vel, -reach * L);
      return _vel;
    }
    const r = this.carriers[i];
    let fx = r.x - r.fromX;
    let fz = r.z - r.fromZ;
    const l = Math.hypot(fx, fz);
    if (l < 1e-4) {
      fx = this._facing.x;
      fz = this._facing.z;
    } else {
      fx /= l;
      fz /= l;
    }
    _vel.set(fx, 0, fz);
    this._turn(_vel, i % 2 ? -1 : 1);
    out.set(r.x - _vel.x * reach * L, 0, r.z - _vel.z * reach * L);
    return _vel;
  }

  _length(i) {
    const c = this.config;
    return Math.max(0.2, c.zoneRadius * c.serpentLength * (i === 0 ? 1 : c.mimicScale));
  }

  /** The unison strike: one hit per carrier. */
  _venom() {
    const c = this.config;
    this._impactFX(this.position, 0, c.venomShake, c.venomFlash, c.venomLight);
    const g = settings.global;
    for (let i = 0; i < this._count; i++) {
      const r = this.carriers[i];
      const dir = this._base(i, _at);
      const bx = _at.x;
      const bz = _at.z;
      _at.set(r.x, 1, r.z);
      this._emitAt(this.spit, Math.round(c.spitCount * 0.5), _at, dir, c.spitSpeed * 0.7, c.spitSize, c.spitLife, 0.6, 0.2);
      this._emitAt(this.drip, Math.round(c.dripCount * 0.6), _at, _up, c.dripSpeed, c.dripSize, c.dripLife, 0.8, 0.25);
      _at.y = 0.6;
      this.ctx.bursts?.spawn?.(BurstMode.WATER, _at, {
        radius: 0.15, endRadius: c.zoneRadius * c.burstReach * 0.6 * g.explosionIntensity, life: c.burstLife,
        intensity: c.burstIntensity * 0.6, opacity: c.burstOpacity * 0.6 * g.opacity, fresnel: 2 * g.fresnel,
        colorA: getColor(c.colorDripB), colorB: getColor(c.colorScale), colorC: getColor(c.colorPoolD),
      });
      if (this._scope) {
        const sent = this._scope.emit({
          type: 'hit', element: 'poison', targetIds: [r.id], position: [r.x, 0, r.z], sourcePosition: [bx, 0, bz],
          damage: c.venomDamage, hitForce: impactForce(c), tags: ['venom-mimicry', 'unison'],
        });
        if (!sent.ok) this.failure = sent.reason;
      } else if (r.dummy?.kill && r.dummy.alive !== false) {
        let dx = r.x - bx;
        let dz = r.z - bz;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l;
        dz /= l;
        r.dummy.kill(dx, dz, impactForce(c));
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Beats (presentation)                                                */
  /* ------------------------------------------------------------------ */

  _emitAt(system, count, position, direction, speed, size, life, spread, radius) {
    if (!system?.emit || count <= 0) return;
    const g = settings.global;
    const n = Math.max(0, Math.min(160, Math.round(count * g.particleCount)));
    if (!n) return;
    _emit.position = position;
    _emit.direction = direction;
    _emit.radius = radius;
    _emit.speed = speed * g.particleSpeed;
    _emit.spread = spread;
    _emit.size = size * g.particleSize;
    _emit.life = life * g.particleLifetime;
    _emit.time = frame.uTime.value;
    system.emit(n, _emit);
  }

  /** The seed bursts and the pool tears open. */
  _landing() {
    const c = this.config;
    const g = settings.global;
    _at.copy(this.position).setY(0.25);
    this._emitAt(this.drip, c.dripCount, _at, _up, c.dripSpeed * 1.2, c.dripSize, c.dripLife, 0.9, 0.3);
    _at.y = 0.04;
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _at, {
      radius: c.zoneRadius * 0.95, life: c.decalLife + c.exitTime, intensity: 0.6,
      colorA: getColor(c.colorPoolC), colorB: getColor(c.colorPoolD),
    });
    this.ctx.shake?.add?.(c.biteShake * 0.35 * g.explosionIntensity, c.shakeDecay, c.shakeFrequency);
    this.lightBoost = c.biteLight * 0.3 * g.explosionIntensity;
  }

  /** Bite (`bite` = 1) or the unison strike (0): the world answers. */
  _impactFX(at, bite, shake, flash, light) {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    _at.set(at.x, 1, at.z);
    if (bite) {
      _vel.copy(this._facing);
      this._emitAt(this.spit, c.spitCount, _at, _vel, c.spitSpeed, c.spitSize, c.spitLife, 0.7, 0.25);
      this._emitAt(this.drip, c.dripCount, _at, _up, c.dripSpeed, c.dripSize, c.dripLife, 0.8, 0.3);
      _at.y = 0.7;
      this.ctx.bursts?.spawn?.(BurstMode.WATER, _at, {
        radius: 0.2, endRadius: c.zoneRadius * c.burstReach * power, life: c.burstLife,
        intensity: c.burstIntensity, opacity: c.burstOpacity * g.opacity, fresnel: 2 * g.fresnel, squash: 0.8,
        colorA: getColor(c.colorDripB), colorB: getColor(c.colorScale), colorC: getColor(c.colorPoolD),
      });
      _at.y = 0.05;
      this.ctx.decals?.spawn?.(DecalType.RIPPLE, _at, {
        radius: c.zoneRadius * 0.9, life: c.decalLife * 0.5, intensity: 0.8,
        colorA: getColor(c.colorPoolA), colorB: getColor(c.colorBand),
      });
    } else {
      _at.set(this.position.x, 0.05, this.position.z);
      this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _at, {
        radius: c.zoneRadius * 1.2 * power, life: c.decalLife * 0.35, width: 0.07, intensity: 1,
        colorA: getColor(c.colorPoolA), colorB: getColor(c.colorBand),
      });
    }
    if (shake > 0) this.ctx.shake?.add?.(shake * power, c.shakeDecay, c.shakeFrequency);
    if (flash > 0) this.ctx.flash?.trigger?.(getColor(c.colorDripB), flash * power);
    this.lightBoost = light * power;
  }

  /** Threads leave each new carrier's infector with a spurt of drops. */
  _threadFX(from) {
    const c = this.config;
    for (let i = from; i < this._count; i++) {
      const r = this.carriers[i];
      _at.set(r.fromX, 1, r.fromZ);
      _vel.set(r.x - r.fromX, 2, r.z - r.fromZ).normalize();
      this._emitAt(this.drip, Math.round(c.dripCount * 0.4), _at, _vel, c.dripSpeed, c.dripSize * 0.8, c.dripLife, 0.5, 0.15);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  /** How hard a strike is landing `x` seconds after it began, 0..1. */
  _strikeEnvelope(x) {
    const c = this.config;
    if (x < 0) return 0;
    const t = Math.max(0.02, c.strikeTime);
    if (x < t) return outCubic(x / t);
    const hold = 0.08;
    if (x < t + hold) return 1;
    return 1 - smooth((x - t - hold) / Math.max(0.05, c.recoilTime));
  }

  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    const set = (sys, a, b, cc, d, glow) => {
      if (!sys?.uniforms) return;
      sys.setGradient?.(getColor(a), getColor(b), getColor(cc), getColor(d));
      const u = sys.uniforms;
      if (u.uGlow) u.uGlow.value = glow * g.glow;
      if (u.uOpacity) u.uOpacity.value = g.opacity;
      if (u.uTurbulence) u.uTurbulence.value = 0.6 * g.turbulence;
      if (u.uSizeScale) u.uSizeScale.value = g.particleSize;
      if (u.uSpeedScale) u.uSpeedScale.value = g.particleSpeed;
      if (u.uLifeScale) u.uLifeScale.value = g.particleLifetime;
    };
    set(this.miasma, c.colorMiasmaA, c.colorMiasmaB, c.colorMiasmaC, c.colorMiasmaD, 0.6);
    set(this.drip, c.colorDripA, c.colorDripB, c.colorDripC, c.colorDripD, c.sparkGlow);
    set(this.spit, c.colorDripA, c.colorDripB, c.colorBand, c.colorDripD, c.sparkGlow);
    if (this.miasma?.uniforms?.uGravity) this.miasma.uniforms.uGravity.value.set(0, 0.35, 0);
    if (this.miasma?.uniforms?.uEndSize) this.miasma.uniforms.uEndSize.value = 2.2;
    if (this.drip?.uniforms?.uGravity) this.drip.uniforms.uGravity.value.set(0, -9.8, 0);
  }

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    if (!this._calm) this._clock += dt * g.animationSpeed;
    const clock = this._clock;
    const tau = this.tau;
    const exit = this.phase === 'fade' ? smooth(this.fadeTime / Math.max(1e-3, this.fadeDuration)) : 0;

    this.root.visible = true;
    this.serpentMaterial.userData.sync();
    this.threadMaterial.userData.sync();
    this.poolMaterial.userData.sync();
    this.seedMaterial.userData.sync();
    this._syncParticles();

    // 1 · the seed, swelling at the hand then arcing out
    if (!this._landed) {
      const u = this.u;
      this.pointAt(u, _at);
      _at.y = c.seedHeight * (1 - u) + c.seedArc * 4 * u * (1 - u);
      this.seed.position.copy(_at);
      const swell = smooth(this.age / Math.max(0.02, c.gatherTime * this.lifeScale));
      this.seed.scale.setScalar(Math.max(0.001, c.seedSize * (0.25 + 0.75 * swell)));
      // Point it along its flight: head first, the tail streaming behind.
      _vel.copy(this.direction).multiplyScalar(Math.max(0.1, this.length));
      _vel.y = -c.seedHeight + c.seedArc * 4 * (1 - 2 * u);
      _vel.normalize();
      this.seed.quaternion.setFromUnitVectors(_down, _vel);
      _q.setFromAxisAngle(_vel, this._calm ? 0 : this.age * c.seedSpin);
      this.seed.quaternion.premultiply(_q);
      const n = this._trail.tick(dt, 40 * g.particleCount);
      if (n) this._emitAt(this.drip, n, _at, _down, 0.6, c.dripSize * 0.8, c.dripLife * 0.6, 0.6, c.seedSize * 0.4);
      return;
    }

    // 2 · the serpents
    const count = Math.max(1, this._count);
    const pose = this.serpents.geometry.attributes.aPose;
    const life = this.serpents.geometry.attributes.aLife;
    const size = this.serpents.geometry.attributes.aSize;
    const venomX = this._venomed ? tau - this.venomAt : -1;
    let live = 0;
    for (let i = 0; i < count; i++) {
      const r = this.carriers[i];
      // Mimics are born when their thread arrives; the serpent at the landing.
      const birth = i === 0 ? 0 : r.time + c.threadTravel;
      const local = tau - birth;
      if (i > 0 && (local < 0 || i >= this._count)) continue;
      const lag = i === 0 ? 0 : c.mimicLag * r.wave;
      const emerge = smooth(local / Math.max(0.02, c.riseTime * (i === 0 ? 1 : 0.8))) * (1 - exit);
      const flare = (i === 0
        ? smooth((local - 0.3 * c.riseTime) / Math.max(0.02, c.rearTime + 0.7 * c.riseTime))
        : smooth(local / Math.max(0.02, c.riseTime))) * (1 - 0.85 * exit);
      let strike = venomX >= 0 ? this._strikeEnvelope(venomX) : 0;
      if (i === 0 && this._bitten) strike = Math.max(strike, this._strikeEnvelope(tau - this.biteAt));
      const L = this._length(i);
      const facing = this._base(i, _at, strike);
      // The imitation: every mimic weaves on the serpent's clock, `lag` late.
      const phase = c.swayRate * (clock - lag);
      const weave = (this._calm ? 0 : c.weaveYaw * Math.sin(phase * 0.5)) * (1 - strike) * emerge;
      _obj.position.copy(_at);
      _obj.rotation.set(0, Math.atan2(-facing.z, facing.x) + weave, 0);
      _obj.scale.setScalar(1);
      _obj.updateMatrix();
      this.serpents.setMatrixAt(live, _obj.matrix);
      const lean = lerp(lerp(c.restLean, c.rearLean, flare), c.strikeLean, strike);
      const curl = lerp(lerp(c.restCurl, c.rearCurl, flare), c.strikeCurl, strike);
      pose.setXYZW(live, lean, curl, c.swayAmp * g.turbulence * emerge * (1 - strike), phase);
      life.setXYZW(live, emerge, flare, strike * strike, r.seed + i * 0.37);
      size.setXYZW(live, L, (1 - emerge) * c.sinkDepth * L + exit * 0.15 * L, i === 0 ? 1 : c.mimicGlow, c.girth);
      live++;
    }
    this.serpents.count = live;
    this.serpents.instanceMatrix.needsUpdate = true;
    pose.needsUpdate = true;
    life.needsUpdate = true;
    size.needsUpdate = true;

    // 3 · venom threads, carrier to carrier
    const from = this.threads.geometry.attributes.aFrom;
    const to = this.threads.geometry.attributes.aTo;
    let threads = 0;
    for (let i = 1; i < this._count; i++) {
      const r = this.carriers[i];
      const grow = smooth((tau - r.time) / Math.max(0.02, c.threadTravel));
      let bright = 1 - exit;
      if (venomX >= 0) bright *= 1 - smooth((venomX - c.strikeTime) / 0.45) * 0.85;
      from.setXYZW(threads, r.fromX, 1.05, r.fromZ, grow);
      to.setXYZW(threads, r.x, 1.0, r.z, bright);
      threads++;
    }
    this.threads.count = threads;
    from.needsUpdate = true;
    to.needsUpdate = true;

    // 4 · pools, under the landing and every carrier with a mimic
    const pool = this.pools.geometry.attributes.aPool;
    let pools = 0;
    for (let i = 0; i < count; i++) {
      const r = this.carriers[i];
      if (i > 0 && i >= this._count) break;
      const birth = i === 0 ? 0 : r.time + c.threadTravel * 0.7;
      if (tau < birth) continue;
      const radius = i === 0 ? c.zoneRadius : c.zoneRadius * c.mimicPool;
      if (i === 0) _obj.position.set(this.position.x, 0.03, this.position.z);
      else {
        this._base(i, _at, 0);
        _obj.position.set(_at.x, 0.032 + i * 0.002, _at.z);
      }
      _obj.rotation.set(0, i * 1.7, 0);
      _obj.scale.set(radius * 2, 1, radius * 2);
      _obj.updateMatrix();
      this.pools.setMatrixAt(pools, _obj.matrix);
      // A ring runs across a pool when its serpent strikes.
      let ring = 0;
      const biteX = i === 0 && this._bitten ? tau - this.biteAt : -1;
      if (biteX >= 0 && biteX < 0.7) ring = biteX / 0.7;
      if (venomX >= 0 && venomX < 0.7) ring = venomX / 0.7;
      pool.setXYZW(pools, outCubic((tau - birth) / Math.max(0.02, c.poolGrow)), exit, r.seed + i * 0.29, ring);
      // Fumes off every pool.
      const n = this._miasma[i].tick(dt, c.miasmaRate * (i === 0 ? 1 : 0.5) * (1 - exit) * g.particleCount);
      if (n && this.miasma) {
        _at.set(_obj.position.x, 0.15, _obj.position.z);
        this._emitAt(this.miasma, n, _at, _up, c.miasmaSpeed, c.miasmaSize * (i === 0 ? 1 : 0.7), c.miasmaLife, 0.45, radius * 0.55);
      }
      pools++;
    }
    this.pools.count = pools;
    this.pools.instanceMatrix.needsUpdate = true;
    pool.needsUpdate = true;

    // Carriers' bodies stain as the venom takes them.
    _look.color = c.stainColor;
    _look.rimColor = c.stainRim;
    _look.rimEmissive = c.stainRimGlow;
    _look.edgeColor = c.stainEdge;
    _look.edgeEmissive = c.stainEdgeGlow;
    for (let i = 0; i < this._count; i++) {
      const r = this.carriers[i];
      const since = i === 0 ? tau - this.biteAt : tau - r.time - c.threadTravel;
      if (since < 0 || typeof r.dummy?.corrode !== 'function') continue;
      r.dummy.corrode(clamp01(since / Math.max(0.02, c.stainTime)) * c.stainAmount, _look);
    }

    // 7 · haze over the main pool
    const haze = (1 - exit) * smooth(tau / Math.max(0.02, c.riseTime));
    this.haze.visible = !this._calm && haze * c.hazeStrength * g.distortion > 0.002;
    if (this.haze.visible) {
      this.haze.position.set(this.position.x, 0.4, this.position.z);
      this.haze.scale.set(c.zoneRadius * 2, 1, c.zoneRadius * 2);
      this.hazeMaterial.userData.sync(haze);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._scope = null;
    this.root.visible = false;
    this.seed.visible = false;
    this.haze.visible = false;
    this.serpents.count = 0;
    this.threads.count = 0;
    this.pools.count = 0;
    for (const r of this.carriers) r.dummy = null;
    this._count = 0;
    this._bitten = false;
    this._venomed = false;
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
  const folder = gui.addFolder('🐍  Venom Mimicry');

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 60, 0.5, 'seed flies at (m/s)');
  R(cast, c, 'zoneRadius', 1, 8, 0.05, 'bite radius (m)');
  R(cast, c, 'lifetime', 0.2, 8, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'cooldown', 0, 20, 0.05, 'cooldown');
  castAnim(cast, c);

  const rule = sub(folder, 'Contagion');
  R(rule, c, 'contagionRadius', 0.5, 16, 0.1, 'spreads within (m)');
  R(rule, c, 'maxInfected', 1, MAX_CARRIERS, 1, 'carriers (incl. host)');
  R(rule, c, 'fanout', 0, 4, 1, 'infects per carrier per wave');
  R(rule, c, 'waves', 0, MAX_WAVES, 1, 'waves');
  R(rule, c, 'hopInterval', 0.1, 1.5, 0.01, 'wave every (s)');
  R(rule, c, 'maxMimic', 0, MAX_MIMIC, 1, 'ailments copied');
  R(rule, c, 'statusSeconds', 0.5, 20, 0.1, 'copied ailments last (s)');
  R(rule, c, 'venomDelay', 0.05, 2, 0.01, 'unison strike after (s)');
  R(rule, c, 'venomDamage', 0, 5, 0.05, 'strike damage');
  R(rule, c, 'hitImpulse', 0, 24, 0.1, 'impulse');
  R(rule, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(rule, c, 'hitSpin', 0, 8, 0.05, 'tumble');

  const time = sub(folder, 'Timing');
  R(time, c, 'gatherTime', 0.02, 0.6, 0.01, 'seed swells over (s)');
  R(time, c, 'riseTime', 0.05, 1.5, 0.01, 'rears out over (s)');
  R(time, c, 'rearTime', 0.05, 1.5, 0.01, 'flares over (s)');
  R(time, c, 'strikeTime', 0.02, 0.4, 0.005, 'strike lands in (s)');
  R(time, c, 'recoilTime', 0.05, 1.5, 0.01, 'recoils over (s)');
  R(time, c, 'exitTime', 0.1, 2, 0.01, 'sinks over (s)');

  const seed = sub(folder, '1 · The seed');
  R(seed, c, 'seedSize', 0.05, 1, 0.01, 'size (m)');
  R(seed, c, 'seedArc', 0, 5, 0.05, 'arc height (m)');
  R(seed, c, 'seedHeight', 0, 3, 0.05, 'leaves the hand at (m)');
  R(seed, c, 'seedSpin', 0, 30, 0.1, 'tumble');
  R(seed, c, 'seedGlow', 0, 8, 0.05, 'glow');

  const form = sub(folder, '2 · The serpent');
  R(form, c, 'serpentLength', 0.4, 2, 0.01, 'length (× radius)');
  R(form, c, 'girth', 0.3, 2.5, 0.01, 'girth');
  R(form, c, 'hoodWidth', 0.2, 2.5, 0.01, 'hood span');
  R(form, c, 'hoodCup', 0, 1.2, 0.01, 'hood cup');
  R(form, c, 'hoodFold', 0, 1, 0.01, 'folded hood (× span)');
  R(form, c, 'hoodBreath', 0, 0.5, 0.005, 'hood breath');
  R(form, c, 'sinkDepth', 0, 1, 0.01, 'rises from depth (× length)');
  R(form, c, 'restLean', -2, 2, 0.01, 'risen lean');
  R(form, c, 'restCurl', -1, 3, 0.01, 'risen curl');
  R(form, c, 'rearLean', -2, 2, 0.01, 'reared lean');
  R(form, c, 'rearCurl', -1, 3.5, 0.01, 'reared curl');
  R(form, c, 'strikeLean', -1, 2.5, 0.01, 'strike lean');
  R(form, c, 'strikeCurl', -1, 3.5, 0.01, 'strike curl');
  R(form, c, 'lunge', 0, 0.6, 0.01, 'strike lunge (× length)');
  R(form, c, 'tailLength', 0, 1.5, 0.01, 'floor coil (× length)');
  R(form, c, 'tailAngle', -1.5, 1.5, 0.01, 'coil trails at (rad)');
  R(form, c, 'tailWave', 0, 0.6, 0.01, 'coil S-curve');
  R(form, c, 'swayAmp', 0, 0.6, 0.005, 'sway');
  R(form, c, 'swayRate', 0, 8, 0.05, 'weave speed');
  R(form, c, 'weaveYaw', 0, 1, 0.01, 'side weave (rad)');
  R(form, c, 'sideWave', 0, 0.3, 0.005, 'side S-ripple');
  R(form, c, 'approachAngle', -1.5, 1.5, 0.01, 'approach off the line (rad)');

  const skin = sub(folder, '3 · Skin');
  color(skin, c, 'colorScale', 'scales');
  color(skin, c, 'colorDeep', 'deep');
  color(skin, c, 'colorBelly', 'belly');
  color(skin, c, 'colorBand', 'warning bands');
  color(skin, c, 'colorEye', 'false eye');
  color(skin, c, 'colorEyeRing', 'eye ring');
  R(skin, c, 'bandCount', 0, 30, 0.5, 'bands');
  R(skin, c, 'bandSharp', 0, 1, 0.01, 'band edge');
  R(skin, c, 'scaleSize', 4, 80, 0.5, 'scale cells');
  R(skin, c, 'roughness', 0.02, 1, 0.01, 'roughness');
  R(skin, c, 'metalness', 0, 1, 0.01, 'metalness');
  R(skin, c, 'skinGlow', 0, 4, 0.05, 'band glow');
  R(skin, c, 'eyeSize', 0.05, 0.5, 0.005, 'false eye size');
  R(skin, c, 'eyeGlow', 0, 10, 0.05, 'false eye glow');
  R(skin, c, 'rimGlow', 0, 4, 0.05, 'wet rim');
  R(skin, c, 'flashGlow', 0, 10, 0.05, 'strike flood');

  const mimic = sub(folder, '4 · Mimics');
  R(mimic, c, 'mimicScale', 0.2, 1.2, 0.01, 'size (× serpent)');
  R(mimic, c, 'mimicLag', 0, 1, 0.01, 'imitates late by (s / wave)');
  R(mimic, c, 'mimicGlow', 0, 4, 0.05, 'glow gain');

  const thread = sub(folder, '5 · Venom threads');
  R(thread, c, 'threadWidth', 0.01, 0.4, 0.005, 'radius (m)');
  R(thread, c, 'threadArc', 0, 5, 0.05, 'arc height (m)');
  R(thread, c, 'threadTravel', 0.05, 1.5, 0.01, 'reaches in (s)');
  R(thread, c, 'threadGlow', 0, 8, 0.05, 'glow');
  R(thread, c, 'threadFlow', 0, 8, 0.05, 'flow');
  R(thread, c, 'threadBeads', 1, 20, 1, 'pulses');

  const pool = sub(folder, '6 · Pools');
  R(pool, c, 'poolGlow', 0, 5, 0.05, 'glow');
  R(pool, c, 'poolVeins', 0, 3, 0.05, 'veins');
  R(pool, c, 'poolGrow', 0.05, 2, 0.01, 'spreads over (s)');
  R(pool, c, 'poolOpacity', 0, 1, 0.01, 'opacity');
  R(pool, c, 'mimicPool', 0.1, 1.5, 0.01, 'carrier pool (× radius)');
  gradient(pool, c, 'colorPool', 'pool ramp');

  const fx = sub(folder, '7 · Particles');
  R(fx, c, 'miasmaRate', 0, 100, 1, 'fumes / s');
  R(fx, c, 'miasmaSize', 0.05, 2, 0.01, 'fume size');
  R(fx, c, 'miasmaLife', 0.1, 4, 0.05, 'fume life (s)');
  R(fx, c, 'miasmaSpeed', 0, 3, 0.01, 'fume rise');
  gradient(fx, c, 'colorMiasma', 'fume ramp');
  R(fx, c, 'dripCount', 0, 80, 1, 'drops per strike');
  R(fx, c, 'dripSize', 0.01, 0.4, 0.005, 'drop size');
  R(fx, c, 'dripLife', 0.1, 3, 0.05, 'drop life (s)');
  R(fx, c, 'dripSpeed', 0, 10, 0.05, 'drop speed');
  gradient(fx, c, 'colorDrip', 'drop ramp');
  R(fx, c, 'spitCount', 0, 120, 1, 'splatter');
  R(fx, c, 'spitSize', 0.01, 0.4, 0.005, 'splatter size');
  R(fx, c, 'spitLife', 0.05, 2, 0.01, 'splatter life (s)');
  R(fx, c, 'spitSpeed', 0, 20, 0.1, 'splatter speed');
  R(fx, c, 'sparkGlow', 0, 6, 0.05, 'particle glow');

  const hit = sub(folder, '8 · Impact');
  R(hit, c, 'biteShake', 0, 1, 0.01, 'bite knock');
  R(hit, c, 'venomShake', 0, 1, 0.01, 'unison knock');
  R(hit, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(hit, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(hit, c, 'biteFlash', 0, 1, 0.01, 'bite flash');
  R(hit, c, 'venomFlash', 0, 1, 0.01, 'unison flash');
  R(hit, c, 'biteLight', 0, 20, 0.1, 'bite light punch');
  R(hit, c, 'venomLight', 0, 20, 0.1, 'unison light punch');
  R(hit, c, 'burstIntensity', 0, 3, 0.01, 'venom shell brightness');
  R(hit, c, 'burstLife', 0.05, 2, 0.01, 'venom shell life (s)');
  R(hit, c, 'burstOpacity', 0, 1, 0.01, 'venom shell opacity');
  R(hit, c, 'burstReach', 0, 2, 0.01, 'venom shell reach (× radius)');
  R(hit, c, 'decalLife', 0.1, 8, 0.05, 'stains last (s)');
  R(hit, c, 'stainAmount', 0, 1, 0.01, 'body stain');
  R(hit, c, 'stainTime', 0.05, 3, 0.01, 'stains over (s)');
  color(hit, c, 'stainColor', 'stain');
  color(hit, c, 'stainRim', 'stain rim');
  R(hit, c, 'stainRimGlow', 0, 6, 0.05, 'stain rim glow');
  color(hit, c, 'stainEdge', 'stain edge');
  R(hit, c, 'stainEdgeGlow', 0, 6, 0.05, 'stain edge glow');

  const haze = sub(folder, '9 · Haze');
  R(haze, c, 'hazeStrength', 0, 2, 0.01, 'toxic shimmer');

  const light = sub(folder, 'Light');
  color(light, c, 'lightColor', 'colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');

  return folder;
}
