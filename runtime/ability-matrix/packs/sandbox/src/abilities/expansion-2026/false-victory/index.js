import {
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  Vector3,
} from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { routeExpansionTransparency } from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { frame } from '../../../core/FrameUniforms.js';
import { LAYER } from '../../../core/Layers.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import {
  createConeGeometry,
  createKingGeometry,
  createLeafGeometry,
  createQuad,
  createStemSegmentGeometry,
} from './geometry.js';
import {
  createDaisMaterial,
  createEffigyMaterial,
  createLacquerMaterial,
  createMirageMaterial,
  createSpotMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
export const UID = 'matrix-expansion/false-victory';

const TAU = Math.PI * 2;
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
/** Leaves the laurel can carry (both branches). */
const MAX_LEAVES = 80;
/** Stem segments per branch. */
const STEM_SEGMENTS = 18;
/** Enemies one cast can mark — the bridge accepts at most 8 targets per event. */
const MAX_MARKS = 8;

// Module scratch: nothing below allocates per frame.
const _m = new Matrix4();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);
const _pos = new Vector3();
const _dir = new Vector3();
const _found = [];
const _ids = [];
const _source = [0, 0, 0];
const _emit = {
  position: null, radius: 0, direction: null, speed: 0, spread: 0, size: 0,
  sizeVariance: 0.4, life: 0, lifeVariance: 0.3, spin: 0, time: 0,
};
const _down = new Vector3(0, -1, 0);

/**
 * FALSE VICTORY — Illusion, zone cast.
 *
 * The enemy's defeat is staged before it happens, and then made true.
 *
 * **Anticipation / travel.** A laurel wreath, folded small, is thrown from
 * the hand in a spinning arc, shedding glitter.
 *
 * **Impact (the crowning).** It opens out over the circle and hovers at
 * `crownHeight`, tipped toward the caster: two branches of solid lacquered
 * leaves unfurl round both sides from the near point toward an open gap on
 * the far side. Under it a black-and-violet chessboard dais spreads out
 * from the centre, a stage light pours down onto it, confetti pops. Every
 * enemy standing inside at this moment is **marked** (at most `maxMarked`,
 * nearest first): a chess-king effigy of obsidian lacquer rises out of the
 * dais just behind it.
 *
 * **Linger (the false victory).** The crown turns and drifts down, its
 * leaves flutter in a wave that runs along the branches; the board flips
 * tiles it cannot agree on; confetti rains. Each king rocks, then **topples
 * outward** — the gesture of resignation — and lands with a flash and a
 * crack in the floor. Lying in state, its cracks heat from violet to
 * white as the reveal comes.
 *
 * **Impact 2 (the reveal).** The crown slams down onto the board, its
 * leaves fly out like thrown knives, the kings burst along their cracks.
 * Every marked enemy still inside `zoneRadius + escapeSlack` is struck
 * **in exactly the direction its king fell**. Enemies that walked out of
 * the staged defeat saw through it; enemies that walked in were never in it.
 *
 * **Exit.** The leaves and kings burn away through noise, the board
 * dissolves from its rim, the light closes.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the wreath** (`createLacquerMaterial`, `createLeafGeometry`) — the
 *      hero: up to 80 instanced laurel leaves (a closed, cupped, curled lens
 *      with a midrib) and instanced stem segments, lit by the sun, on
 *      `LAYER.WORLD`, casting shadows; thin-film rims.
 *   2. **the kings** (`createEffigyMaterial`, `createKingGeometry`) — turned
 *      chess kings, lit obsidian with a fake mirror, voronoi cracks that
 *      heat, a dissolve from the cracks; casting shadows.
 *   3. **the dais** (`createDaisMaterial`) — the chessboard field, sized from
 *      `zoneRadius`; normal-blended so it darkens the floor (the deep stop).
 *   4. **the stage light** (`createSpotMaterial`) — a volumetric cone.
 *   5. **particles** — confetti (`CHIP`, lit, falling), glitter (`SOFT`,
 *      additive, rising), obsidian shards (`CHIP`, lit) at the reveal.
 *   6. **impacts** — DUSTRING + RIPPLE on the crowning, CRACK under each
 *      fallen king, SHOCKWAVE + SCORCH + AIR shell on the reveal; flashes,
 *      knocks and light punches scaled by the globals.
 *   7. **the mirage** (`createMirageMaterial` on `LAYER.DISTORTION`) — air
 *      shimmer over the board while the illusion holds; a pressure ring at
 *      the reveal.
 *
 * ## The editor rule
 *
 * A mark keeps only facts and dice: who was marked, where they stood when
 * the crown landed, a seed, an order and whether it was struck. Every
 * dimension, colour, count and timing is read from `settings.falseVictory`
 * each frame; the king's fall bearing is derived from where its enemy stood
 * relative to the centre, so the knock always matches what was shown.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return Math.min(MAX_LEAVES, this.config.leafCount | 0) + STEM_SEGMENTS * 2 + this._markCount;
  }

  get _after() {
    const c = this.config;
    return Math.max(c.leafFlightTime, c.shatterTime) + 0.3;
  }

  get impactDuration() {
    // The reveal is gameplay: it never scales. The aftermath does.
    return this.config.revealDelay + this._after * settings.global.lifetime;
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
    const quad = own(createQuad());

    // 3 · the dais
    this.daisMat = own(createDaisMaterial());
    this.dais = new Mesh(quad, this.daisMat);
    this.dais.rotation.x = -Math.PI / 2;
    this.dais.position.y = 0.025;
    this.dais.renderOrder = 1;
    this.root.add(this.dais);

    // 1 · the wreath — a pivot that carries the crown's height, yaw and tilt.
    this.crown = new Group();
    this.root.add(this.crown);
    this.lacquer = own(createLacquerMaterial());
    const leafGeo = own(createLeafGeometry());
    leafGeo.setAttribute('aSeed', new InstancedBufferAttribute(new Float32Array(MAX_LEAVES), 1));
    leafGeo.setAttribute('aState', new InstancedBufferAttribute(new Float32Array(MAX_LEAVES * 3), 3));
    for (let i = 0; i < MAX_LEAVES; i++) leafGeo.attributes.aSeed.setX(i, fract(Math.sin(i * 91.7 + 3.1) * 43758.5453));
    this.leaves = new InstancedMesh(leafGeo, this.lacquer, MAX_LEAVES);
    this.leaves.frustumCulled = false;
    this.leaves.castShadow = true;
    this.leaves.layers.set(LAYER.WORLD);
    this.crown.add(this.leaves);
    const stemGeo = own(createStemSegmentGeometry());
    stemGeo.setAttribute('aSeed', new InstancedBufferAttribute(new Float32Array(STEM_SEGMENTS * 2).fill(0.15), 1));
    stemGeo.setAttribute('aState', new InstancedBufferAttribute(new Float32Array(STEM_SEGMENTS * 6), 3));
    this.stems = new InstancedMesh(stemGeo, this.lacquer, STEM_SEGMENTS * 2);
    this.stems.frustumCulled = false;
    this.stems.castShadow = true;
    this.stems.layers.set(LAYER.WORLD);
    this.crown.add(this.stems);

    // 2 · the kings (world space under root, which sits at the zone centre)
    this.effigy = own(createEffigyMaterial());
    const kingGeo = own(createKingGeometry());
    kingGeo.setAttribute('aSeed', new InstancedBufferAttribute(new Float32Array(MAX_MARKS), 1));
    this._kingState = new InstancedBufferAttribute(new Float32Array(MAX_MARKS * 3), 3);
    kingGeo.setAttribute('aState', this._kingState);
    this.kings = new InstancedMesh(kingGeo, this.effigy, MAX_MARKS);
    this.kings.frustumCulled = false;
    this.kings.castShadow = true;
    this.kings.receiveShadow = true;
    this.kings.layers.set(LAYER.WORLD);
    this.root.add(this.kings);

    // 4 · the stage light
    this.spotMat = own(createSpotMaterial());
    this.spot = new Mesh(own(createConeGeometry()), this.spotMat);
    this.spot.frustumCulled = false;
    this.spot.renderOrder = 6;
    this.root.add(this.spot);

    // 7 · the mirage
    this.mirageMat = own(createMirageMaterial());
    this.mirage = new Mesh(quad, this.mirageMat);
    this.mirage.rotation.x = -Math.PI / 2;
    this.mirage.position.y = 0.4;
    this.mirage.visible = false;
    this.root.add(this.mirage);

    routeExpansionTransparency(this.group);
    this.mirage.layers.set(LAYER.DISTORTION);

    // Marks: facts and dice only (see the class comment).
    this._marks = [];
    for (let i = 0; i < MAX_MARKS; i++) {
      this._marks.push({ id: null, dummy: null, x: 0, z: 0, seed: 0, rank: 0, struck: false, landed: false });
    }
    this._markCount = 0;
    this._lacquerState = { dissolve: 0, flash: 0, glow: 1 };
    this._daisState = { radius: 1, clock: 0, grow: 0, energy: 1, shock: -1, dissolve: 0, fade: 1 };
    this._spotState = { radius: 1, fade: 0, clock: 0 };
    this._mirageState = { shimmer: 0, shock: 0, wave: 0, clock: 0 };
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._confettiRate = new RateEmitter();
    this._glitterRate = new RateEmitter();
    this._disposed = false;
  }

  createParticles() {
    const p = this.ctx.particles;
    this.confetti = p?.get?.('falseVictory.confetti', {
      capacity: 900, shape: ParticleShape.CHIP, additive: false, lit: true, curl: true, softFade: 0.3,
    }) ?? null;
    this.glitter = p?.get?.('falseVictory.glitter', {
      capacity: 700, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.35,
    }) ?? null;
    this.shards = p?.get?.('falseVictory.shards', {
      capacity: 400, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.2,
    }) ?? null;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this._revealed = false;
    this._markCount = 0;
    this.struckCount = 0;
    for (const m of this._marks) {
      m.id = null; m.dummy = null; m.struck = false; m.landed = false;
    }
    this._clock = 0;
    this._trailT = 0;
    this._calm = prefersReducedMotion();
    this._confettiRate.reset();
    this._glitterRate.reset();
    this.root.visible = true;
    this.kings.count = 0;
    this._sync(0);
  }

  onTravel(dt) {
    this._sync(dt);
  }

  onImpact() {
    this.position.y = 0;
    this._stage();
    this._crowning();
    this._sync(0);
  }

  onFade(dt) {
    if (!this._revealed && this.impactTime >= this.config.revealDelay) {
      this._revealed = true;
      this._reveal();
    }
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The rule                                                            */
  /* ------------------------------------------------------------------ */

  /** Mark every enemy inside the circle as the crown lands. */
  _stage() {
    const c = this.config;
    const cap = Math.max(0, Math.min(MAX_MARKS, c.maxMarked | 0));
    const cx = this.position.x, cz = this.position.z;
    let n = 0;
    if (this._scope) {
      const found = this._scope.queryActors({ position: [cx, 0, cz], radius: c.zoneRadius, relation: 'enemy' });
      if (!found.ok) {
        this.failure = found.reason;
      } else {
        // Nearest first, ties by id: the bridge sorts by id only.
        const actors = found.actors;
        for (let pick = 0; pick < cap; pick++) {
          let best = -1, bestD = Infinity;
          for (let i = 0; i < actors.length; i++) {
            const a = actors[i];
            if (this._isMarked(a.id, n)) continue;
            const d = (a.position[0] - cx) ** 2 + (a.position[2] - cz) ** 2;
            if (d < bestD) { bestD = d; best = i; }
          }
          if (best < 0) break;
          const a = actors[best];
          this._mark(n++, a.id, null, a.position[0], a.position[2]);
        }
      }
    } else if (this.ctx.dummies?.findTargets) {
      const found = this.ctx.dummies.findTargets(cx, cz, c.zoneRadius, _found);
      for (const dummy of found) {
        if (n >= cap) break;
        const dx = dummy.position.x - cx, dz = dummy.position.z - cz;
        if (dx * dx + dz * dz > c.zoneRadius * c.zoneRadius) continue;
        this._mark(n++, null, dummy, dummy.position.x, dummy.position.z);
      }
    }
    this._markCount = n;
    // Rank by distance to the caster: the nearest king rises and falls first.
    for (let i = 0; i < n; i++) {
      const a = this._marks[i];
      const da = (a.x - this.origin.x) ** 2 + (a.z - this.origin.z) ** 2;
      let rank = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const b = this._marks[j];
        const db = (b.x - this.origin.x) ** 2 + (b.z - this.origin.z) ** 2;
        if (db < da || (db === da && j < i)) rank++;
      }
      a.rank = rank;
    }
    // The staged defeat is a real status when the combat manager runs.
    if (this._scope && n && !this._scope.standalone) {
      _ids.length = 0;
      for (let i = 0; i < n; i++) if (this._marks[i].id) _ids.push(this._marks[i].id);
      if (_ids.length) {
        const sent = this._scope.emit({
          type: 'status', element: 'illusion', targetIds: _ids.slice(0, 8),
          position: [cx, 0, cz], durationTicks: Math.max(0, Math.round(c.deceiveTicks)),
          intensity: 1, tags: ['false-victory', 'staged-defeat'],
        });
        if (!sent.ok) this.failure = sent.reason;
      }
    }
  }

  _isMarked(id, n) {
    for (let i = 0; i < n; i++) if (this._marks[i].id === id) return true;
    return false;
  }

  _mark(i, id, dummy, x, z) {
    const m = this._marks[i];
    m.id = id;
    m.dummy = dummy;
    m.x = x;
    m.z = z;
    m.seed = fract(Math.sin((x * 12.9898 + z * 78.233) + i * 3.7) * 43758.5453);
    m.struck = false;
    m.landed = false;
    this.kings.geometry.attributes.aSeed.setX(i, m.seed);
    this.kings.geometry.attributes.aSeed.needsUpdate = true;
  }

  /** The fall bearing of mark `m`: outward from the centre (the cast's heading at the centre). */
  _fallDir(m, out) {
    out.set(m.x - this.position.x, 0, m.z - this.position.z);
    if (out.lengthSq() < 0.04) out.copy(this.direction);
    return out.normalize();
  }

  /** Strike every marked enemy still inside, in its king's fall direction. */
  _strike() {
    const c = this.config;
    const reach = c.zoneRadius + Math.max(0, c.escapeSlack);
    const cx = this.position.x, cz = this.position.z;
    const n = this._markCount;
    if (!n) return;
    if (this._scope) {
      const found = this._scope.queryActors({ position: [cx, 0, cz], radius: Math.min(48, reach), relation: 'enemy' });
      if (!found.ok) { this.failure = found.reason; return; }
      for (let i = 0; i < n; i++) {
        const m = this._marks[i];
        let actor = null;
        for (const a of found.actors) if (a.id === m.id) { actor = a; break; }
        if (!actor) continue; // walked out of the staged defeat
        this._fallDir(m, _dir);
        _source[0] = actor.position[0] - _dir.x;
        _source[1] = 0;
        _source[2] = actor.position[2] - _dir.z;
        const sent = this._scope.emit({
          type: 'hit', element: 'illusion', targetIds: [m.id],
          position: [actor.position[0], 0, actor.position[2]], sourcePosition: [_source[0], 0, _source[2]],
          damage: c.hitDamage, hitForce: impactForce(c, settings.global.explosionIntensity),
          tags: ['false-victory', 'reveal'],
        });
        if (sent.ok) { m.struck = true; this.struckCount++; } else this.failure = sent.reason;
      }
      return;
    }
    const power = settings.global.explosionIntensity;
    this._force.impulse = c.hitImpulse * power;
    this._force.lift = c.hitLift * power;
    this._force.spin = c.hitSpin;
    for (let i = 0; i < n; i++) {
      const m = this._marks[i];
      const dummy = m.dummy;
      if (!dummy || !dummy.alive) continue;
      const dx = dummy.position.x - cx, dz = dummy.position.z - cz;
      if (dx * dx + dz * dz > reach * reach) continue;
      this._fallDir(m, _dir);
      if (dummy.kill(_dir.x, _dir.z, this._force)) { m.struck = true; this.struckCount++; }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Beats                                                               */
  /* ------------------------------------------------------------------ */

  /** The crown lands: ring, ripple, popper, knock. */
  _crowning() {
    const c = this.config;
    const g = settings.global;
    const r = c.zoneRadius;
    const power = g.explosionIntensity;
    this.lightBoost = c.landLight * power;
    _pos.copy(this.position).setY(0.04);
    this.ctx.decals?.spawn?.(DecalType.DUSTRING, _pos, {
      radius: r * 1.15, life: c.decalLife * 0.6, intensity: 0.8,
      colorA: getColor(c.colorTint), colorB: getColor(c.colorDeep),
    });
    this.ctx.decals?.spawn?.(DecalType.RIPPLE, _pos, {
      radius: r, life: c.decalLife * 0.5, intensity: 0.7,
      colorA: getColor(c.colorTint), colorB: getColor(c.colorBody),
    });
    if (c.landShake > 0) this.ctx.shake?.add?.(c.landShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.landFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorBody), c.landFlash * power);
    // The popper: confetti thrown up out of the crown.
    _pos.copy(this.position).setY(c.crownHeight);
    this._puff(this.confetti, _pos, 70, { radius: r * 0.5, direction: _up, speed: 3, spread: 0.45, size: c.confettiSize, life: c.confettiLife, spin: 6 });
  }

  /** The reveal: hits, shell, ring, scorch, shards, flash, knock. */
  _reveal() {
    const c = this.config;
    const g = settings.global;
    const r = c.zoneRadius;
    const power = g.explosionIntensity;
    this._strike();
    this.lightBoost = c.revealLight * power;
    _pos.copy(this.position).setY(0.05);
    this.ctx.bursts?.spawn?.(BurstMode.AIR, _pos, {
      radius: r * 0.15, endRadius: r * c.burstReach * Math.max(0.2, power), life: c.burstLife,
      intensity: 0.9, opacity: c.burstOpacity * g.opacity, fresnel: 2.4, squash: 0.35,
      colorA: getColor(c.colorTint), colorB: getColor(c.colorBody), colorC: getColor(c.colorDeep),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: r * 1.7 * Math.max(0.2, power), life: c.decalLife * 0.4, width: 0.07, intensity: 1.1,
      colorA: getColor(c.colorCore), colorB: getColor(c.colorBody),
    });
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _pos, {
      radius: r * 0.95, life: c.decalLife, intensity: 0.85,
      colorA: getColor(c.colorDeep), colorB: getColor(c.colorBody),
    });
    if (c.revealShake > 0) this.ctx.shake?.add?.(c.revealShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.revealFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorTint), c.revealFlash * power);
    // Every king bursts along its cracks.
    for (let i = 0; i < this._markCount; i++) {
      this._kingBase(this._marks[i], _p);
      _p.y = 0.35;
      this._puff(this.shards, _p, c.shardCount, { radius: 0.5, direction: _up, speed: c.shardSpeed, spread: 0.9, size: c.shardSize, life: c.shardLife, spin: 9 });
      this._puff(this.glitter, _p, 18, { radius: 0.4, direction: _up, speed: c.shardSpeed * 0.6, spread: 1, size: c.glitterSize * 1.6, life: c.glitterLife * 0.6, spin: 0 });
    }
    // And the crown throws its leaves: glitter along the ring.
    _pos.copy(this.position).setY(0.4);
    this._puff(this.glitter, _pos, 60, { radius: r * c.wreathSeat, direction: _up, speed: 3.2, spread: 0.8, size: c.glitterSize * 1.4, life: c.glitterLife, spin: 0 });
  }

  _puff(system, position, count, o) {
    if (!system || count <= 0) return;
    const g = settings.global;
    _emit.position = position;
    _emit.radius = o.radius;
    _emit.direction = o.direction;
    _emit.speed = o.speed * g.particleSpeed;
    _emit.spread = o.spread;
    _emit.size = o.size * g.particleSize;
    _emit.life = o.life * g.particleLifetime;
    _emit.spin = o.spin;
    _emit.time = frame.uTime.value;
    system.emit(Math.min(200, Math.max(0, Math.round(count * g.particleCount))), _emit);
  }

  /** Where mark `m`'s king stands: behind its enemy along the fall. */
  _kingBase(m, out) {
    this._fallDir(m, _dir);
    const off = this.config.kingOffset;
    return out.set(m.x + _dir.x * off - this.position.x, 0, m.z + _dir.z * off - this.position.z);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    const set = (sys, a, b, cc, d, glow, gravity, drag, turb) => {
      const u = sys?.uniforms;
      if (!u) return;
      sys.setGradient?.(getColor(a), getColor(b), getColor(cc), getColor(d));
      if (u.uGlow) u.uGlow.value = glow * g.glow;
      if (u.uOpacity) u.uOpacity.value = g.opacity;
      if (u.uTurbulence) u.uTurbulence.value = turb * g.turbulence;
      if (u.uGravity) u.uGravity.value.set(0, gravity, 0);
      if (u.uDrag) u.uDrag.value = drag;
      if (u.uSizeScale) u.uSizeScale.value = g.particleSize;
      if (u.uSpeedScale) u.uSpeedScale.value = g.particleSpeed;
      if (u.uLifeScale) u.uLifeScale.value = g.particleLifetime;
    };
    set(this.confetti, c.colorConfettiA, c.colorConfettiB, c.colorConfettiC, c.colorConfettiD, 1, -c.confettiFall, 1.4, c.confettiDrift);
    set(this.glitter, c.colorCore, c.colorTint, c.colorBody, c.colorDeep, c.glitterGlow, 0.6, 1.1, 0.5);
    set(this.shards, c.colorTint, c.colorBody, c.colorDeep, c.colorDeep, 1, -12, 0.8, 0.2);
    if (this.confetti?.uniforms?.uEndSize) this.confetti.uniforms.uEndSize.value = 0.9;
    if (this.shards?.uniforms?.uEndSize) this.shards.uniforms.uEndSize.value = 0.6;
  }

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const r = c.zoneRadius;
    if (!this._calm) this._clock += dt * g.animationSpeed;
    const clock = this._clock;
    const travelling = this.phase === 'travel';
    const t = travelling ? 0 : this.impactTime + (this.phase === 'fade' ? this.fadeTime : 0);
    const reveal = Math.max(0.05, c.revealDelay);
    const since = this._revealed ? t - c.revealDelay : -1;
    const fadeT = this.phase === 'fade' ? clamp(this.fadeTime / this.fadeDuration) : 0;
    const fade = 1 - fadeT;
    const hold = travelling ? 0 : clamp(t / reveal); // 0..1 through the false victory

    this.root.position.copy(this.position);
    this.root.position.y = 0;

    /* 1 · the wreath -------------------------------------------------- */
    const yaw = Math.atan2(this.direction.z, -this.direction.x);
    const open = travelling ? 0 : Easing.outBack(clamp(t / Math.max(0.05, c.unfurlTime * 0.8)));
    const clampT = 0.2;
    const press = this._revealed ? 1 : travelling ? 0 : Easing.inCubic(clamp((t - (c.revealDelay - clampT)) / clampT));
    let hubY, size, tilt, turn;
    if (travelling) {
      hubY = c.travelHeight + Math.sin(Math.PI * clamp(this.u)) * c.travelArc;
      size = c.travelScale * smooth(this.u * 6 + 0.15);
      tilt = 0.6;
      turn = this.age * c.travelSpin;
    } else {
      const hover = c.travelHeight + (c.crownHeight - c.travelHeight) * clamp(open) - c.crownSink * smooth(hold);
      hubY = hover * (1 - press) + 0.22 * press;
      size = c.travelScale + (1 - c.travelScale) * open;
      tilt = c.crownTilt * (1 - press);
      turn = clock * c.crownTurn;
    }
    this.crown.position.set(0, hubY, 0);
    this.crown.rotation.set(0, yaw + turn, -tilt, 'YZX');
    this.crown.scale.setScalar(Math.max(0.001, size));

    const ls = this._lacquerState;
    const flyK = since >= 0 ? clamp(since / Math.max(0.05, c.leafFlightTime)) : 0;
    ls.dissolve = this._revealed ? Math.max(smooth((flyK - 0.35) / 0.65), fadeT) : 0;
    ls.flash = press * 0.8 * (1 - flyK);
    ls.glow = 0.6 + 0.8 * hold;
    this.lacquer.userData.sync(ls);
    this._layLaurel(travelling, t, clock, flyK);

    /* 2 · the kings --------------------------------------------------- */
    this.effigy.userData.sync();
    this._standKings(travelling, t, since, fade);

    /* 3 · the dais ---------------------------------------------------- */
    this.dais.visible = !travelling;
    this.dais.scale.set(r * 2, r * 2, 1);
    const ds = this._daisState;
    ds.radius = r;
    ds.clock = clock;
    ds.grow = smooth(t / 0.35);
    ds.energy = 0.55 + 0.45 * hold + (since >= 0 ? 0.6 * (1 - clamp(since / 0.6)) : 0);
    ds.shock = since >= 0 && since < 0.7 ? since / 0.7 : -1;
    ds.dissolve = clamp(fadeT / Math.max(0.05, c.daisDissolve));
    ds.fade = 1;
    this.daisMat.userData.sync(ds);

    /* 4 · the stage light --------------------------------------------- */
    const ss = this._spotState;
    ss.radius = r;
    ss.clock = clock;
    ss.fade = travelling ? 0 : smooth(t / 0.3) * (since >= 0 ? 1 - 0.65 * clamp(since / 0.4) : 1) * fade;
    this.spot.visible = ss.fade > 0.002;
    this.spotMat.userData.sync(ss);

    /* 5 · particles --------------------------------------------------- */
    this._syncParticles();
    if (dt > 0) {
      if (travelling) {
        this._trailT += dt;
        if (this._trailT >= 0.03) {
          this._trailT = 0;
          _pos.copy(this.position).setY(hubY);
          this._puff(this.glitter, _pos, c.trailCount, { radius: 0.25, direction: _up, speed: 0.3, spread: 1, size: c.glitterSize, life: c.glitterLife * 0.5, spin: 0 });
        }
      } else {
        const raining = t > 0.15 && (since < 0.4);
        const n = this._confettiRate.tick(dt, raining ? c.confettiRate * g.particleCount * fade : 0);
        if (n) {
          _pos.copy(this.position).setY(c.crownHeight + 1.6);
          this._puffRaw(this.confetti, _pos, n, r * 0.85, _down, 0.6, 0.5, c.confettiSize, c.confettiLife, 7);
        }
        const m = this._glitterRate.tick(dt, c.glitterRate * g.particleCount * fade * (since >= 0 ? 0.3 : 1));
        if (m) {
          _pos.copy(this.position).setY(0.1);
          this._puffRaw(this.glitter, _pos, m, r * 0.9, _up, 0.7, 0.35, c.glitterSize, c.glitterLife, 0);
        }
      }
    }

    /* 7 · the mirage -------------------------------------------------- */
    const ms = this._mirageState;
    ms.shimmer = travelling || this._revealed ? 0 : smooth(t / 0.4) * (0.5 + 0.5 * hold);
    ms.shock = since >= 0 && since < 0.7 ? (1 - since / 0.7) * fade : 0;
    ms.wave = since >= 0 ? Easing.outCubic(clamp(since / 0.7)) : 0;
    ms.clock = clock;
    this.mirage.visible = !this._calm && (ms.shimmer * c.mirageStrength + ms.shock * c.revealWarp) * g.distortion > 0.002;
    if (this.mirage.visible) {
      this.mirage.scale.set(r * 2.3, r * 2.3, 1);
      this.mirageMat.userData.sync(ms);
    }
  }

  /** Rate-driven emission (count already scaled by the globals). */
  _puffRaw(system, position, n, radius, direction, speed, spread, size, life, spin) {
    if (!system || n <= 0) return;
    const g = settings.global;
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = speed * g.particleSpeed;
    _emit.spread = spread;
    _emit.size = size * g.particleSize;
    _emit.life = life * g.particleLifetime;
    _emit.spin = spin;
    _emit.time = frame.uTime.value;
    system.emit(n, _emit);
  }

  /**
   * Lay the leaves and stem segments in the crown's local frame.
   * θ = 0 is the near point (local +X faces the caster); branch 1 runs to
   * +θ, branch 2 to −θ, both ending short of the far gap.
   */
  _layLaurel(travelling, t, clock, flyK) {
    const c = this.config;
    const R = c.zoneRadius * c.wreathSeat;
    const sweep = Math.max(0.2, Math.PI - c.gapAngle * 0.5);
    const count = Math.max(0, Math.min(MAX_LEAVES, c.leafCount | 0));
    const perBranch = Math.ceil(count / 2);
    const len = c.leafLength * c.zoneRadius * 0.25;
    const unfurl = Math.max(0.05, c.unfurlTime);
    const flight = Easing.outCubic(flyK);
    const calm = this._calm;
    for (let i = 0; i < count; i++) {
      const branch = i < perBranch ? 1 : -1;
      const k = branch > 0 ? i : i - perBranch;
      const f = (k + 0.5) / perBranch; // 0 near point .. 1 at the gap
      const seed = this.leaves.geometry.attributes.aSeed.getX(i);
      const theta = branch * f * sweep;
      const ct = Math.cos(theta), st = Math.sin(theta);
      // Unfurl: sweep-ordered from the near point round both sides.
      const grow = travelling ? 0.45 : Easing.outBack(clamp((t - f * unfurl * 0.7) / (unfurl * 0.35)));
      const side = (k % Math.max(1, c.leafRows | 0)) === 0 ? 1 : -1;
      const wave = calm ? 0 : Math.sin(clock * c.flutterRate - f * 9 + seed * 2) * c.flutter;
      const splay = c.leafSplay * (0.75 + 0.5 * seed) + wave * 0.6;
      // Tangent toward the branch tip, outward normal, then the leaf axis.
      const tx = -st * branch, tz = ct * branch;
      const ca = Math.cos(splay), sa = Math.sin(splay) * side;
      _x.set(tx * ca + ct * sa, 0.22 * side + wave * 0.5, tz * ca + st * sa).normalize();
      // Blade normal: up, rolled outward for the outer row.
      _y.set(ct * 0.35 * side, 1, st * 0.35 * side);
      _y.addScaledVector(_x, -_y.dot(_x)).normalize();
      _z.crossVectors(_x, _y);
      // Position on the ring; the reveal throws it outward and up.
      const out = R * (1 + flight * c.leafFlight * (0.7 + 0.6 * seed));
      const lift = flight * (1.4 + seed) * (1 - flyK) * 1.5;
      _p.set(ct * out, lift + 0.02 * side, st * out);
      if (flyK > 0) {
        // Thrown leaves tumble.
        const spin = flyK * (6 + seed * 8);
        _x.applyAxisAngle(_up, spin);
        _y.applyAxisAngle(_x, spin * 0.7);
        _z.crossVectors(_x, _y);
      }
      const sc = len * Math.max(0.001, grow) * (1 - 0.4 * flyK) * (0.8 + 0.4 * seed);
      _m.makeBasis(_x, _y, _z);
      _s.set(sc, sc, sc * c.leafWidth);
      _m.scale(_s);
      _m.setPosition(_p);
      this.leaves.setMatrixAt(i, _m);
    }
    this.leaves.count = count;
    this.leaves.instanceMatrix.needsUpdate = true;

    // The stems: short segments along each branch arc, grown with the leaves.
    const segLen = (R * sweep) / STEM_SEGMENTS;
    const thick = 0.022 * c.zoneRadius * c.stemThickness;
    for (let b = 0; b < 2; b++) {
      const branch = b === 0 ? 1 : -1;
      for (let k = 0; k < STEM_SEGMENTS; k++) {
        const f = (k + 0.5) / STEM_SEGMENTS;
        const theta = branch * f * sweep;
        const ct = Math.cos(theta), st = Math.sin(theta);
        const grow = travelling ? 1 : clamp((t - f * unfurl * 0.6) / (unfurl * 0.2));
        _x.set(-st * branch, 0, ct * branch);
        _y.set(0, 1, 0);
        _z.crossVectors(_x, _y);
        const vanish = flyK > 0 ? 1 - smooth(flyK * 2) : 1;
        _m.makeBasis(_x, _y, _z);
        _s.set(segLen * 1.08 * grow, thick * (1 - 0.5 * f) * vanish, thick * (1 - 0.5 * f) * vanish);
        _m.scale(_s);
        _p.set(ct * R, 0.06 * Math.sin(Math.PI * f), st * R);
        _m.setPosition(_p);
        this.stems.setMatrixAt(b * STEM_SEGMENTS + k, _m);
      }
    }
    this.stems.instanceMatrix.needsUpdate = true;
  }

  /** Rise, rock, topple, crack, shatter — each king on the one landing clock. */
  _standKings(travelling, t, since, fade) {
    const c = this.config;
    const n = this._markCount;
    this.kings.count = travelling ? 0 : n;
    if (travelling || !n) return;
    const h = c.kingHeight;
    const w = c.kingWidth;
    const calm = this._calm;
    const state = this._kingState;
    for (let i = 0; i < n; i++) {
      const m = this._marks[i];
      this._kingBase(m, _p);
      this._fallDir(m, _dir);
      const rise = Easing.outBack(clamp((t - m.rank * c.riseStagger) / Math.max(0.05, c.riseTime)));
      const tipStart = c.toppleAt + m.rank * c.toppleStagger;
      const tipK = clamp((t - tipStart) / Math.max(0.05, c.toppleTime));
      // A rock before the tip: small, then gone as it commits.
      const rockK = clamp((t - (tipStart - c.rockTime)) / Math.max(0.05, c.rockTime));
      const rock = calm ? 0 : Math.sin(rockK * Math.PI * 2) * c.rockAngle * (1 - tipK) * (rockK > 0 && rockK < 1 ? 1 : 0);
      // Fall as a hinged body: accelerating, then a damped bounce on landing.
      const fall = Easing.inQuad(tipK) * (Math.PI / 2);
      const landedFor = t - (tipStart + c.toppleTime);
      const bounce = landedFor > 0 ? c.toppleBounce * Math.exp(-landedFor * 9) * Math.abs(Math.sin(landedFor * 22)) : 0;
      const angle = Math.min(Math.PI / 2, fall) - bounce + rock;
      if (!m.landed && landedFor >= 0 && !this._revealed) {
        m.landed = true;
        this._kingLands(m);
      }
      // Hinge about the base rim on the fall side. Axis A = (D.z, 0, −D.x),
      // so that rotating "up" by +angle about A tips it toward D; the body
      // origin swings round the rim point P = B + D·r:
      //   O = B + r(1 − cos φ)·D + r sin φ·up      (r = base radius)
      const rr = w * 0.5;
      _z.set(_dir.z, 0, -_dir.x);
      _y.set(0, 1, 0).applyAxisAngle(_z, angle);
      _x.crossVectors(_y, _z);
      _m.makeBasis(_x, _y, _z);
      _m.scale(_pos.set(w, h * Math.max(0.001, rise), w));
      _m.setPosition(
        _p.x + rr * (1 - Math.cos(angle)) * _dir.x,
        rr * Math.sin(angle),
        _p.z + rr * (1 - Math.cos(angle)) * _dir.z,
      );
      this.kings.setMatrixAt(i, _m);
      // State: crack heat, dissolve, landing flash.
      const crack = since >= 0 ? 1 : clamp((t - tipStart - c.toppleTime) / Math.max(0.05, c.revealDelay - tipStart - c.toppleTime));
      const dissolve = since >= 0 ? Math.max(smooth(since / Math.max(0.05, c.shatterTime)), 1 - fade) : 0;
      const flash = landedFor > 0 ? Math.exp(-landedFor * 7) * 1.4 : 0;
      state.setXYZ(i, crack * (0.35 + 0.65 * crack), dissolve, flash + (since >= 0 ? Math.exp(-since * 10) * 2 : 0));
    }
    this.kings.instanceMatrix.needsUpdate = true;
    state.needsUpdate = true;
  }

  /** A king lands flat: a crack under it, a puff of glitter, a small knock. */
  _kingLands(m) {
    const c = this.config;
    this._kingBase(m, _pos);
    this._fallDir(m, _dir);
    _pos.add(this.position).addScaledVector(_dir, c.kingHeight * 0.5).setY(0.04);
    if (c.crackDecals > 0) {
      this.ctx.decals?.spawn?.(DecalType.CRACK, _pos, {
        radius: c.kingHeight * 0.55, life: c.decalLife, intensity: 0.9,
        colorA: getColor(c.colorTint), colorB: getColor(c.colorDeep),
      });
    }
    this._puff(this.glitter, _pos, 14, { radius: c.kingHeight * 0.4, direction: _up, speed: 1.6, spread: 0.9, size: c.glitterSize * 1.3, life: 0.7, spin: 0 });
    this.ctx.shake?.add?.(0.05 * settings.global.explosionIntensity, c.shakeDecay, c.shakeFrequency);
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._scope = null;
    this.root.visible = false;
    this.mirage.visible = false;
    this.kings.count = 0;
    this._revealed = false;
    this._markCount = 0;
    for (const m of this._marks) { m.id = null; m.dummy = null; }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    for (const r of this.resources) r.dispose();
    super.dispose();
  }
}

function fract(x) {
  return x - Math.floor(x);
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
  const folder = gui.addFolder('♛  False Victory');

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 80, 0.5, 'wreath flies at (m/s)');
  R(cast, c, 'zoneRadius', 1, 8, 0.1, 'staged circle (m)');
  R(cast, c, 'lifetime', 0.2, 8, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'cooldown', 0, 15, 0.05, 'cooldown');
  castAnim(cast, c);

  const rule = sub(folder, 'The rule');
  R(rule, c, 'revealDelay', 0.4, 4, 0.05, 'reveal after (s)');
  R(rule, c, 'maxMarked', 0, MAX_MARKS, 1, 'enemies marked');
  R(rule, c, 'escapeSlack', 0, 2, 0.05, 'escape slack (m)');
  R(rule, c, 'deceiveTicks', 0, 300, 1, 'deceived (ticks)');
  R(rule, c, 'hitDamage', 0, 10, 0.1, 'damage');
  R(rule, c, 'hitImpulse', 0, 24, 0.1, 'knockback');
  R(rule, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(rule, c, 'hitSpin', 0, 8, 0.05, 'tumble');

  const light = sub(folder, 'Light');
  color(light, c, 'lightColor', 'colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'landLight', 0, 20, 0.1, 'punch at the crowning');
  R(light, c, 'revealLight', 0, 20, 0.1, 'punch at the reveal');

  const pal = sub(folder, 'Palette');
  color(pal, c, 'colorCore', 'core');
  color(pal, c, 'colorTint', 'tint');
  color(pal, c, 'colorBody', 'body');
  color(pal, c, 'colorDeep', 'deep');
  color(pal, c, 'colorFilm', 'thin-film');

  const w = sub(folder, '1 · The wreath');
  R(w, c, 'wreathSeat', 0.3, 1.3, 0.01, 'radius (× circle)');
  R(w, c, 'crownHeight', 0.5, 6, 0.05, 'hovers at (m)');
  R(w, c, 'crownSink', 0, 3, 0.05, 'drifts down (m)');
  R(w, c, 'crownTilt', 0, 1.2, 0.01, 'tilt to the caster (rad)');
  R(w, c, 'crownTurn', -2, 2, 0.01, 'turns (rad/s)');
  R(w, c, 'leafCount', 0, MAX_LEAVES, 1, 'leaves');
  R(w, c, 'leafLength', 0.1, 2, 0.01, 'leaf length');
  R(w, c, 'leafWidth', 0.1, 1, 0.01, 'leaf width');
  R(w, c, 'leafSplay', 0, 1.5, 0.01, 'leaf splay (rad)');
  R(w, c, 'leafRows', 1, 3, 1, 'alternating rows');
  R(w, c, 'gapAngle', 0, 3, 0.01, 'open gap (rad)');
  R(w, c, 'unfurlTime', 0.05, 2, 0.01, 'unfurls over (s)');
  R(w, c, 'flutter', 0, 0.8, 0.01, 'flutter (rad)');
  R(w, c, 'flutterRate', 0, 12, 0.1, 'flutter rate');
  R(w, c, 'stemThickness', 0.2, 3, 0.05, 'stem thickness');
  R(w, c, 'lacquerRough', 0, 1, 0.01, 'lacquer roughness');
  R(w, c, 'lacquerSpec', 0, 4, 0.05, 'specular');
  R(w, c, 'filmStrength', 0, 4, 0.05, 'thin-film');
  R(w, c, 'lacquerGlow', 0, 3, 0.05, 'vein glow');
  const throwF = sub(folder, '1b · The throw');
  R(throwF, c, 'travelHeight', 0.2, 4, 0.05, 'thrown at (m)');
  R(throwF, c, 'travelArc', 0, 6, 0.05, 'arc height (m)');
  R(throwF, c, 'travelScale', 0.05, 1, 0.01, 'size in flight');
  R(throwF, c, 'travelSpin', 0, 30, 0.5, 'spin in flight (rad/s)');
  R(throwF, c, 'trailCount', 0, 10, 1, 'trail glitter');

  const k = sub(folder, '2 · The kings');
  R(k, c, 'kingHeight', 0.4, 4, 0.05, 'height (m)');
  R(k, c, 'kingWidth', 0.1, 1.5, 0.01, 'width (m)');
  R(k, c, 'kingOffset', -1, 2, 0.01, 'behind the enemy (m)');
  R(k, c, 'riseTime', 0.05, 1.5, 0.01, 'rises over (s)');
  R(k, c, 'riseStagger', 0, 0.5, 0.01, 'rise stagger (s)');
  R(k, c, 'rockTime', 0.05, 1, 0.01, 'rocks for (s)');
  R(k, c, 'rockAngle', 0, 0.5, 0.01, 'rock (rad)');
  R(k, c, 'toppleAt', 0, 3, 0.01, 'tips at (s)');
  R(k, c, 'toppleTime', 0.05, 1.5, 0.01, 'falls over (s)');
  R(k, c, 'toppleStagger', 0, 0.5, 0.01, 'tip stagger (s)');
  R(k, c, 'toppleBounce', 0, 0.5, 0.01, 'bounce (rad)');
  R(k, c, 'kingGloss', 0, 4, 0.05, 'gloss');
  R(k, c, 'crackGlow', 0, 8, 0.05, 'crack glow');
  R(k, c, 'shatterTime', 0.05, 2, 0.01, 'shatters over (s)');

  const d = sub(folder, '3 · The dais');
  R(d, c, 'tileSize', 0.15, 2, 0.01, 'tile (m)');
  R(d, c, 'daisGlow', 0, 4, 0.05, 'brightness');
  R(d, c, 'daisOpacity', 0, 1, 0.01, 'opacity');
  R(d, c, 'groutGlow', 0, 5, 0.05, 'grout glow');
  R(d, c, 'rimWidth', 0.02, 0.4, 0.01, 'laurel rim');
  R(d, c, 'flipRate', 0, 8, 0.05, 'tile flips');
  R(d, c, 'sheen', 0, 3, 0.05, 'sheen');
  R(d, c, 'daisDissolve', 0.05, 1, 0.01, 'dissolves over (× fade)');

  const s = sub(folder, '4 · The stage light');
  R(s, c, 'spotHeight', 1, 15, 0.1, 'height (m)');
  R(s, c, 'spotTopRadius', 0, 2, 0.01, 'lamp radius (m)');
  R(s, c, 'spotSpread', 0.2, 2, 0.01, 'pool (× circle)');
  R(s, c, 'spotGlow', 0, 3, 0.01, 'glow');
  R(s, c, 'spotDust', 0, 2, 0.01, 'dust');

  const p = sub(folder, '5 · Particles');
  R(p, c, 'confettiRate', 0, 200, 1, 'confetti / s');
  R(p, c, 'confettiSize', 0.02, 0.5, 0.005, 'confetti size');
  R(p, c, 'confettiLife', 0.2, 5, 0.05, 'confetti life (s)');
  R(p, c, 'confettiFall', 0, 12, 0.1, 'confetti gravity');
  R(p, c, 'confettiDrift', 0, 3, 0.05, 'confetti drift');
  gradient(p, c, 'colorConfetti', 'confetti');
  R(p, c, 'glitterRate', 0, 200, 1, 'glitter / s');
  R(p, c, 'glitterSize', 0.01, 0.4, 0.005, 'glitter size');
  R(p, c, 'glitterLife', 0.1, 4, 0.05, 'glitter life (s)');
  R(p, c, 'glitterGlow', 0, 6, 0.05, 'glitter glow');
  R(p, c, 'shardCount', 0, 80, 1, 'shards per king');
  R(p, c, 'shardSize', 0.02, 0.6, 0.005, 'shard size');
  R(p, c, 'shardSpeed', 0, 15, 0.1, 'shard speed');
  R(p, c, 'shardLife', 0.1, 3, 0.05, 'shard life (s)');
  R(p, c, 'leafFlight', 0, 4, 0.05, 'leaves thrown (× radius)');
  R(p, c, 'leafFlightTime', 0.1, 2, 0.01, 'leaves fly for (s)');

  const im = sub(folder, '6 · Impacts');
  R(im, c, 'landShake', 0, 1, 0.01, 'crowning knock');
  R(im, c, 'landFlash', 0, 1, 0.01, 'crowning flash');
  R(im, c, 'revealShake', 0, 1.5, 0.01, 'reveal knock');
  R(im, c, 'revealFlash', 0, 1, 0.01, 'reveal flash');
  R(im, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(im, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(im, c, 'burstReach', 0, 3, 0.01, 'shell grows to (× radius)');
  R(im, c, 'burstLife', 0.05, 3, 0.01, 'shell lives (s)');
  R(im, c, 'burstOpacity', 0, 1, 0.01, 'shell opacity');
  R(im, c, 'decalLife', 0.1, 10, 0.05, 'marks last (s)');
  R(im, c, 'crackDecals', 0, 1, 1, 'crack under each king');

  const mi = sub(folder, '7 · The mirage');
  R(mi, c, 'mirageStrength', 0, 3, 0.01, 'shimmer');
  R(mi, c, 'revealWarp', 0, 3, 0.01, 'reveal pressure ring');

  return folder;
}
