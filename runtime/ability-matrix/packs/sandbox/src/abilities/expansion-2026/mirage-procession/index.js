import { Group, InstancedMesh, LineSegments, Mesh, Object3D, Points, Vector3 } from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import {
  createExpansionFX,
  routeExpansionTransparency,
  expansionBurst,
  ParticleShape,
} from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { LAYER } from '../../../core/Layers.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import {
  createEngravingGeometry,
  createGlitterGeometry,
  createMaskGeometry,
  createQuad,
  createShardGeometry,
  createVeilGeometry,
} from './geometry.js';
import {
  createEngravingMaterial,
  createFaceMaterial,
  createGlitterMaterial,
  createPoolMaterial,
  createShardMaterial,
  createShimmerMaterial,
  createVeilMaterial,
  createWakeMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;

const clamp = (x) => Math.max(0, Math.min(1, x));
const point = new Vector3();
const _contactPoint = new Vector3();
const shardTransform = new Object3D();
/** Reused option bag for expansionBurst (it destructures, never retains). */
const _burst = { count: 0, size: 0, life: 0, speed: 0, spread: 0, radius: 0 };
/** Reused sweep query — queryActors reads it and never retains it. */
const _queryPos = [0, 0, 0];
const _query = { position: _queryPos, radius: 0, relation: 'enemy' };
/** Reused impactForce input (the result is built once per sweep that hits). */
const _forceIn = { hitImpulse: 0, hitLift: 0, hitSpin: 0 };
/** Mirror shards orbiting each mask. */
const SHARDS_PER_LANE = 8;
/** Bodies one sweep step may strike. */
const MAX_TARGETS = 16;
/** Distinct bodies one cast may strike in total. */
const MAX_STRUCK = 64;
/** GPU glitter allocated per pool member (a multiple of three lanes). */
const MAX_GLITTER = 180;
/** Pooled true-strike masks (honest feedback on committed hits). */
const MAX_STRIKES = 4;
const _strikeState = { clock: 0, fade: 1, dissolve: 0, calm: false, heat: 0 };
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * MIRAGE PROCESSION — Illusion, line cast.
 *
 * Three masks **fade in** over three parallel lanes and **process** down the
 * line together, bobbing and swaying out of step, silk veils streaming
 * behind them, mirror shards orbiting each one, glitter and puffs shed in
 * their wake, the air shimmering at their front. Only one lane (`trueLane`)
 * is real: its sweep strikes whatever it passes. At the end of the line the
 * procession **breaks**: three identical shells mark the endpoints, every
 * mask rears up as its shards peel outward and then **falls**, crashing
 * face-up onto the floor of its lane (identical ripples), its shards raining
 * down round it, and a deep lacquer **pool** spreads under it. Through the
 * linger the masks turn slowly in their pools and sink while the veins
 * swirl and ripple fronts roll out; the masks burn away through the
 * dissolve and the pools dry from the lip inward.
 *
 * ## The rule of the feint
 *
 * Nothing the player can see may tell the lanes apart. Every layer below is
 * built per lane from shared geometry and a shared material, emitted with the
 * same counts at the same times; the trail puffs and the finale are issued in
 * a `for lane of -1..1` loop. The one exception is a *committed* hit, which is
 * honest feedback on a body that was actually struck — and even that waits
 * for the combat manager to commit the event (a cancelled hit draws nothing).
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the masks** (`createFaceMaterial`) — a carved theatrical face
 *      (domed brow, arched brow ridge, sunk sockets, eye holes cut through,
 *      nose bridge to a proud tip, hard cheekbones, lips round a mouth slit,
 *      chin) in lit dark lacquer on `LAYER.WORLD`, casting shadows; magenta
 *      only in the eye fire, the mouth ember and the gilded border. Outer
 *      masks stand three-quarter so the carving reads. The engraving
 *      (`createEngravingMaterial`) glints along its strokes.
 *   2. **the veils** (`createVeilMaterial`) — silk ribbons fluttered and
 *      drooped in the vertex stage.
 *   3. **the wakes** (`createWakeMaterial`) — heat-shimmer bands down each
 *      lane, brightest just behind the mask.
 *   4. **the shards** (`createShardMaterial`) — 24 instanced bevelled mirror
 *      shards with a fake reflection, peeling outward at the finale.
 *   5. **particles** — identical soft puffs per lane on a fixed interval and
 *      at the finale (the shared expansion system), and GPU glitter dealt
 *      evenly across the three lanes.
 *   6. **the finale & contacts** — per-lane AIR shells and RIPPLE decals,
 *      flash, camera knock, light punch; SHOCKWAVE + burst at a committed hit.
 *   7. **the shimmer** (`createShimmerMaterial` on `LAYER.DISTORTION`) — the
 *      bent air across all three lanes at the mask front.
 *   8. **the pools** (`createPoolMaterial`) — the linger: deep lacquer under
 *      each fallen mask, swirling veins, rolling ripple fronts, a pale lip.
 *   9. **the true strike** — at a committed hit the real mask lunges out of
 *      the struck body: a larger copy of the face whose eyes and gilding blaze
 *      with a magenta aura, that drives down the line and burns away (pooled, four slots), with a
 *      shockwave, a body-coloured flash and a knock. It only ever answers a
 *      hit that landed, so it never betrays the lane before the strike.
 *
 * ## Colour
 *
 * Every layer is drawn from one four-stop ramp: `coreColor` (white-hot, only
 * in glints, scan bands and burn edges) → `edgeColor` (pale rims) →
 * `maskColor` (saturated lacquer) → `deepColor` (shadowed lacquer, pools,
 * lane haze). The masks, wakes and pools are normal-blended so the deep stop
 * really darkens the floor and carries the body.
 *
 * ## Hits (`handlesOwnHits`)
 *
 * Unchanged by the craft pass: each frame the true lane sweeps the segment
 * of line the front covered since the last frame (`_sweep`), `hitWidth`
 * either side of its lane centre, each body once per cast.
 *
 * ## The editor rule
 *
 * A cast keeps its lane, the swept distance, the struck set and integrated
 * clocks; every dimension, colour, count and timing is read from
 * `settings.mirageProcession` every frame.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return 3 * (1 + SHARDS_PER_LANE);
  }

  /* ------------------------------------------------------------------ */
  /* Timing — gameplay; unchanged                                        */
  /* ------------------------------------------------------------------ */

  get impactDuration() {
    return 0.7;
  }

  /** Presentation-only linger after the fall (hits all land in travel). */
  get fadeDuration() {
    return Math.max(0.3, this.config?.lingerTime ?? 1.5);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.resources = [];
    const own = (x) => (this.resources.push(x), x);
    this.root = new Group();
    this.group.add(this.root);

    this.maskMat = own(createFaceMaterial());
    this.wakeMat = own(createWakeMaterial());
    this.engravingMat = own(createEngravingMaterial());
    this.veilMat = own(createVeilMaterial());
    const engraving = own(createEngravingGeometry());
    const veil = own(createVeilGeometry());
    const mask = own(createMaskGeometry()),
      plane = own(createQuad());
    this.masks = [];
    this.wakes = [];
    this.veils = [];
    for (let i = 0; i < 3; i++) {
      // 1 · mask + its engraving (first child) + 2 · its veil (second child)
      const m = new Mesh(mask, this.maskMat);
      m.add(new LineSegments(engraving, this.engravingMat));
      const v = new Mesh(veil, this.veilMat);
      v.position.set(0, 0.6, -0.16); // hung from the crown, behind the face
      v.rotation.y = Math.PI; // a plume streaming off the back of the head
      v.frustumCulled = false;
      m.add(v);
      m.position.y = 1.2;
      m.castShadow = true;
      m.receiveShadow = true;
      m.renderOrder = 6;
      this.root.add(m);
      this.masks.push(m);
      this.veils.push(v);
      // 3 · the lane's wake
      const w = new Mesh(plane, this.wakeMat);
      w.rotation.x = -Math.PI / 2;
      w.position.y = 0.04;
      w.renderOrder = 2;
      this.root.add(w);
      this.wakes.push(w);
    }

    // 4 · mirror shards
    this.shardMat = own(createShardMaterial());
    this.shards = new InstancedMesh(own(createShardGeometry()), this.shardMat, 3 * SHARDS_PER_LANE);
    this.shards.frustumCulled = false;
    this.shards.renderOrder = 7;
    this.root.add(this.shards);

    // 5 · glitter
    this.glitterMat = own(createGlitterMaterial());
    this.glitter = new Points(own(createGlitterGeometry(MAX_GLITTER)), this.glitterMat);
    this.glitter.frustumCulled = false;
    this.glitter.renderOrder = 8;
    this.root.add(this.glitter);

    // 8 · the pools under the fallen masks — one shared material, so the
    // three lanes stay identical.
    this.poolMat = own(createPoolMaterial(0));
    this.pools = [];
    for (let i = 0; i < 3; i++) {
      const pool = new Mesh(plane, this.poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.renderOrder = 3;
      pool.visible = false;
      this.root.add(pool);
      this.pools.push(pool);
    }

    // 9 · the true strike: pooled mask copies in world space.
    this.strikes = [];
    this._strikeTimes = [];
    this._strikePos = [];
    for (let i = 0; i < MAX_STRIKES; i++) {
      const strike = new Mesh(mask, own(createFaceMaterial()));
      strike.visible = false;
      strike.frustumCulled = false;
      strike.renderOrder = 9;
      this.group.add(strike);
      this.strikes.push(strike);
      this._strikeTimes.push(-1);
      this._strikePos.push(new Vector3());
    }
    this._strikeNext = 0;
    this._landed = false;

    // 7 · the shimmer (opaque proxy, see createShimmerMaterial)
    this.shimmerMat = own(createShimmerMaterial());
    this.shimmer = new Mesh(plane, this.shimmerMat);
    this.shimmer.frustumCulled = false;
    this.root.add(this.shimmer);

    this._previous = 0;
    this._hits = new Set();
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._pendingContacts = new Map();
    this._clock = 0;
    this._calm = false;
    this._maskState = { clock: 0, fade: 1, dissolve: 0, calm: false };
    this._fadeState = { clock: 0, fade: 1 };
    this._veilState = { clock: 0, fade: 1, calm: false };
    this._wakeState = { clock: 0, fade: 1 };
    this._poolState = { clock: 0, fade: 0, dissolve: 0, calm: false };
    this._glitterState = { clock: 0, front: 0, spread: 0, fade: 1, capacity: MAX_GLITTER };
    this._shimmerState = { clock: 0, strength: 0, span: 6 };

    routeExpansionTransparency(this.group);
    // The carved faces are solid lit lacquer: world layer, shadows on.
    for (const m of this.masks) m.layers.set(LAYER.WORLD);
    for (const strike of this.strikes) strike.layers.set(LAYER.WORLD);
    this.shimmer.layers.set(LAYER.DISTORTION);
    this._disposed = false;
  }

  createParticles() {
    this.fx = createExpansionFX(this.ctx, 'illusion', {
      shape: ParticleShape.SOFT,
      colors: ['#fff4fb', '#ff8fd6', '#b0207e', '#2a0838'],
    });
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._previous = 0;
    this._scope = bindExpansionCombat(this.ctx, 'matrix-expansion/mirage-procession');
    this.failure = null;
    this._pendingContacts.clear();
    this._hitSubscription = null;
    if (this._scope && !this._scope.standalone) {
      // A contact is only drawn once the combat manager commits the hit.
      const sub = this._scope.on('hit', (event) => {
        const position = this._pendingContacts.get(event.eventId);
        if (!position) return;
        this._pendingContacts.delete(event.eventId);
        point.fromArray(position);
        this._contact(point);
      });
      if (sub.ok) this._hitSubscription = sub;
      else this.failure = sub.reason;
    }
    this._trailElapsed = 0;
    this._hits.clear();
    this._clock = 0;
    this._calm = prefersReducedMotion();
    this._landed = false;
    this._strikeNext = 0;
    this._lastStrikeFx = -1;
    this._strikeTimes.fill(-1);
    for (const strike of this.strikes) strike.visible = false;
    for (const pool of this.pools) pool.visible = false;
    this.root.visible = true;
    this._lane = Math.max(-1, Math.min(1, Math.round(this.config.trueLane)));
    this._sync(0);
  }

  onTravel(dt) {
    const c = this.config;
    const front = Math.min(this.length, this.front);
    this._sweep(this._previous, front);
    this._previous = front;
    this._trailElapsed += dt;
    const interval = Math.max(0.02, c.trailInterval);
    if (this._trailElapsed >= interval) {
      this._trailElapsed %= interval;
      // All three masks shed the same particles so their visual cues do not
      // disclose which lane carries the hit volume.
      for (let lane = -1; lane <= 1; lane++) {
        this.pointAt(this.u, point);
        point.addScaledVector(this.side, lane * c.laneGap);
        point.y = 1.1;
        _burst.count = c.trailCount;
        _burst.size = c.trailSize;
        _burst.life = c.trailLife;
        _burst.speed = c.trailSpeed;
        _burst.spread = c.trailSpread;
        _burst.radius = c.trailRadius;
        expansionBurst(this.fx, point, _burst);
      }
    }
    this._sync(dt);
  }

  onImpact() {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    this._sync(0);
    // Every mask dissolves with the same terminal flourish; impact feedback
    // cannot reveal the damaging lane.
    for (let lane = -1; lane <= 1; lane++) {
      this.pointAt(1, point);
      point.addScaledVector(this.side, lane * c.laneGap);
      point.y = 1.1;
      _burst.count = c.finaleCount;
      _burst.size = c.finaleSize;
      _burst.life = c.finaleLife;
      _burst.speed = c.finaleSpeed;
      _burst.spread = c.finaleSpread;
      _burst.radius = c.finaleRadius;
      expansionBurst(this.fx, point, _burst);
      this.ctx.bursts?.spawn?.(BurstMode.AIR, point, {
        radius: 0.1,
        endRadius: c.finaleBurst * power,
        life: c.shellLife,
        intensity: c.finaleIntensity,
        opacity: c.shellOpacity * settings.global.opacity,
        fresnel: c.shellFresnel,
        colorA: getColor(c.colorBurstA),
        colorB: getColor(c.colorBurstB),
        colorC: getColor(c.colorBurstC),
      });
    }
    this.lightBoost = c.finaleLight * power;
    if (c.impactShake > 0) this.ctx.shake?.add?.(c.impactShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.impactFlash > 0) this.ctx.flash?.trigger?.(getColor(c.edgeColor), c.impactFlash * power);
  }

  onFade(dt) {
    this._sync(dt);
  }

  /** The three masks hit the floor together: identical ripples, one knock. */
  _land() {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    this._landed = true;
    for (let lane = -1; lane <= 1; lane++) {
      this.pointAt(1, point);
      point.addScaledVector(this.side, lane * c.laneGap);
      point.y = 0.02;
      this.ctx.decals?.spawn?.(DecalType.RIPPLE, point, {
        radius: c.rippleRadius * power,
        life: c.decalLife,
        intensity: c.rippleIntensity,
        colorA: getColor(c.edgeColor),
        colorB: getColor(c.maskColor),
      });
    }
    this.lightBoost = Math.max(this.lightBoost, c.finaleLight * 0.6 * power);
    if (c.landShake > 0) this.ctx.shake?.add?.(c.landShake * power, c.shakeDecay, c.shakeFrequency);
  }

  /** Honest feedback on a body that was actually struck. */
  _contact(position) {
    const c = this.config;
    _burst.count = c.contactCount;
    _burst.size = c.contactSize;
    _burst.life = c.contactLife;
    _burst.speed = c.contactSpeed;
    _burst.spread = c.contactSpread;
    _burst.radius = c.contactEmitRadius;
    expansionBurst(this.fx, position, _burst);
    _contactPoint.copy(position).setY(0.02);
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _contactPoint, {
      radius: c.contactRadius * settings.global.explosionIntensity,
      life: c.decalLife * 0.7,
      intensity: c.contactIntensity,
      width: c.contactWidth,
      colorA: getColor(c.edgeColor),
      colorB: getColor(c.maskColor),
    });
    const power = settings.global.explosionIntensity;
    this.lightBoost = Math.max(this.lightBoost, c.contactLight * power);
    // The strike lands: a pressure shell of hot lacquer driven into the body
    // and a dark lacquer splash left on the floor under it — one honest,
    // distinct impact that only a committed hit ever draws.
    if (c.strikeBurst > 0) {
      _contactPoint.copy(position).setY(Math.max(0.6, position.y));
      this.ctx.bursts?.spawn?.(BurstMode.AIR, _contactPoint, {
        radius: 0.15,
        endRadius: c.strikeBurst * power,
        life: c.strikeBurstLife,
        intensity: c.strikeBurstIntensity,
        opacity: c.strikeBurstOpacity * settings.global.opacity,
        fresnel: c.shellFresnel,
        squash: 0.8,
        colorA: getColor(c.edgeColor),
        colorB: getColor(c.maskColor),
        colorC: getColor(c.deepColor),
      });
    }
    if (c.strikeStain > 0) {
      _contactPoint.copy(position).setY(0.02);
      this.ctx.decals?.spawn?.(DecalType.SCORCH, _contactPoint, {
        radius: c.strikeStain * power,
        life: c.strikeStainLife,
        intensity: 1,
        colorA: getColor(c.deepColor),
        colorB: getColor(c.maskColor),
      });
    }
    // 9 · the real mask lunges out of the struck body.
    const slot = this._strikeNext % MAX_STRIKES;
    this._strikeNext++;
    this._strikeTimes[slot] = this.age;
    this._strikePos[slot].copy(position).setY(Math.max(0, position.y));
    // One knock and flash per volley, however many bodies it struck.
    if (this.age - this._lastStrikeFx < 0.2) return;
    this._lastStrikeFx = this.age;
    if (c.strikeShake > 0) this.ctx.shake?.add?.(c.strikeShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.strikeFlash > 0) this.ctx.flash?.trigger?.(getColor(c.maskColor), c.strikeFlash * power);
  }

  /* ------------------------------------------------------------------ */
  /* The sweep — gameplay, unchanged                                      */
  /* ------------------------------------------------------------------ */

  _sweep(from, to) {
    const c = this.config,
      field = this.ctx.dummies;
    if ((!this._scope && !field?.findTargets) || to <= from) return;
    const mid = (from + to) / 2;
    this.pointAt(mid / this.length, point);
    point.addScaledVector(this.side, this._lane * c.laneGap);
    if (this._scope) {
      _queryPos[0] = point.x;
      _queryPos[2] = point.z;
      _query.radius = Math.hypot((to - from) / 2, c.hitWidth);
      const query = this._scope.queryActors(_query);
      if (!query.ok) { this.failure = query.reason; return; }
      if (!query.actors.length) return;
      // Built lazily: most sweep steps find nobody and allocate nothing.
      let force = null;
      let hits = 0;
      for (const actor of query.actors) {
        const dx = actor.position[0] - this.origin.x, dz = actor.position[2] - this.origin.z;
        const along = dx * this.direction.x + dz * this.direction.z,
          lat = dx * this.side.x + dz * this.side.z - this._lane * c.laneGap;
        if (along < from || along > to || Math.abs(lat) > c.hitWidth || this._hits.has(actor.id)) continue;
        if (this._hits.size >= MAX_STRUCK) break;
        if (!force) {
          _forceIn.hitImpulse = c.impulse;
          _forceIn.hitLift = c.lift;
          _forceIn.hitSpin = c.spin;
          force = impactForce(_forceIn, settings.global.explosionIntensity);
        }
        const sent = this._scope.emit({
          type: 'hit', element: 'illusion', targetIds: [actor.id], position: actor.position,
          sourcePosition: [this.origin.x, 0, this.origin.z], damage: 1, hitForce: force, tags: ['mirage-procession'],
        });
        if (!sent.ok) { this.failure = sent.reason; continue; }
        this._hits.add(actor.id);
        if (sent.standalone) {
          point.fromArray(actor.position);
          this._contact(point);
        } else if (this._hitSubscription && sent.eventId) this._pendingContacts.set(sent.eventId, [...actor.position]);
        if (++hits >= MAX_TARGETS) break;
      }
      return;
    }
    const found = field.findTargets(point.x, point.z, Math.hypot((to - from) / 2, c.hitWidth), this._found),
      power = settings.global.explosionIntensity;
    this._force.impulse = c.impulse * power;
    this._force.lift = c.lift * power;
    this._force.spin = c.spin;
    let hits = 0;
    for (const d of found) {
      const dx = d.position.x - this.origin.x,
        dz = d.position.z - this.origin.z,
        along = dx * this.direction.x + dz * this.direction.z,
        lat = dx * this.side.x + dz * this.side.z - this._lane * c.laneGap;
      if (along < from || along > to || Math.abs(lat) > c.hitWidth || this._hits.has(d)) continue;
      if (this._hits.size >= MAX_STRUCK) break;
      this._hits.add(d);
      this._contact(d.position);
      if (d.kill(this.direction.x, this.direction.z, this._force) && ++hits >= MAX_TARGETS) break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  /** Mirror the particle look from settings every frame (no-op on stubs). */
  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    const fx = this.fx;
    if (!fx?.uniforms) return;
    fx.setGradient?.(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    const u = fx.uniforms;
    if (u.uGlow) u.uGlow.value = c.sparkGlow * g.glow;
    if (u.uOpacity) u.uOpacity.value = g.opacity;
    if (u.uTurbulence) u.uTurbulence.value = 0.6 * g.turbulence;
    if (u.uSizeScale) u.uSizeScale.value = g.particleSize;
    if (u.uSpeedScale) u.uSpeedScale.value = g.particleSpeed;
    if (u.uLifeScale) u.uLifeScale.value = g.particleLifetime;
  }

  _sync(dt) {
    const c = this.config,
      g = settings.global;
    if (!this._calm) this._clock += dt * g.animationSpeed;
    const clock = this._clock;
    const fadeT = this.phase === 'fade' ? clamp(this.fadeTime / this.fadeDuration) : 0;
    const fade = 1 - fadeT;
    const appear = Easing.outCubic(clamp(this.age / Math.max(0.01, c.appearTime)));
    this.root.position.copy(this.origin);
    this.root.rotation.y = Math.atan2(this.direction.x, this.direction.z);

    const departure = this.phase === 'travel' ? 0 : this.phase === 'impact' ? clamp(this.impactTime / this.impactDuration) : 1;
    // The impact beat: rear up (0 → fallStart), then fall face-up onto the
    // floor (fallStart → fallStart + fallTime) under gravity; then lie.
    const fallStart = clamp(c.fallStart);
    const fallEnd = Math.min(1, fallStart + Math.max(0.05, c.fallTime));
    const rear = departure < fallStart ? Math.sin(Math.PI * 0.5 * (departure / Math.max(0.01, fallStart))) : 1;
    const fall = clamp((departure - fallStart) / Math.max(0.01, fallEnd - fallStart));
    const drop = fall * fall; // gravity: slow off the top, fast into the floor
    if (fall >= 1 && !this._landed && this.phase !== 'travel') this._land();
    // Time since the masks landed (the pools' own clock).
    const landedFor = this.phase === 'fade'
      ? (1 - fallEnd) * this.impactDuration + this.fadeTime
      : Math.max(0, departure - fallEnd) * this.impactDuration;
    const lying = this._landed ? 1 : 0;

    // The lacquer holds while the masks fall, then burns away in the pools.
    const hold = Math.min(0.9, Math.max(0, c.maskHold ?? 0.3));
    const dissolve = this.phase === 'fade' ? smooth(hold, 1, fadeT) * 1.02 : 0;
    const ms = this._maskState;
    ms.clock = clock;
    ms.fade = appear;
    ms.dissolve = dissolve;
    ms.calm = this._calm;
    this.maskMat.userData.sync(ms);
    this._fadeState.clock = clock;
    this._fadeState.fade = appear * (1 - 0.7 * fall) * (1 - smooth(0.2, 0.8, fadeT));
    this.engravingMat.userData.sync(this._fadeState);
    const vs = this._veilState;
    vs.clock = clock;
    vs.fade = appear * fade * (1 - Math.max(departure, fall));
    vs.calm = this._calm;
    this.veilMat.userData.sync(vs);
    this._wakeState.clock = clock;
    this._wakeState.fade = appear * (1 - smooth(0.25, 1, fadeT));
    this.wakeMat.userData.sync(this._wakeState);
    this._fadeState.fade = 1 - smooth(0.4, 1, fadeT);
    this.shardMat.userData.sync(this._fadeState);
    const ps = this._poolState;
    ps.clock = clock;
    ps.fade = smooth(0, Math.max(0.05, c.poolGrow * 0.5), landedFor) * lying;
    ps.dissolve = smooth(0.45, 1, fadeT) * 1.05;
    ps.calm = this._calm;
    this.poolMat.userData.sync(ps);

    const front = Math.min(this.length, this.front);
    const bob = this._calm ? 0 : c.maskBob;
    const sway = this._calm ? 0 : c.maskSway;
    const orbitSpeed = c.shardSpin ?? 1.8;
    const size = c.maskSize * (0.6 + 0.4 * appear) * (1 - departure * 0.1);
    const restY = c.maskRestHeight * size;
    const airY = c.maskHeight + c.maskRear * rear;
    const poolR = Math.min(c.poolRadius * c.maskSize, c.laneGap * 0.75) * Easing.outCubic(clamp(landedFor / Math.max(0.05, c.poolGrow)));
    for (let i = 0; i < 3; i++) {
      const lane = i - 1,
        m = this.masks[i],
        w = this.wakes[i],
        pool = this.pools[i];
      const hover = c.maskHeight + Math.sin(clock * 3 + i) * bob;
      const y = this.phase === 'travel' ? hover : airY + (restY - airY) * drop - (this.phase === 'fade' ? c.maskSink * size * smooth(0.15, 1, fadeT) : 0);
      m.position.set(lane * c.laneGap, y, front);
      // Rearing tips the face up a little; the fall lays it on its back,
      // top toward the caster; lying, it turns slowly in its pool.
      // The masks walk the line looking back at the caster (yaw π); rearing
      // tips the face up, the fall drops it back onto its pool at
      // `fallTilt`, still presenting the face; there it turns and sinks.
      // Outer masks stand three-quarter, turned toward the centre (mirror-
      // symmetric, so the pose never tells the true lane), so the carving —
      // brow, nose, cheekbones — reads in relief.
      const turn = -lane * (c.maskTurn ?? 0) * (1 - 0.5 * drop);
      m.rotation.set(0.3 * rear * (1 - drop) + c.fallTilt * drop, Math.PI + turn + Math.sin(clock * 2 + i) * sway * (1 - fall), (this.phase === 'fade' ? c.maskLieSpin * fadeT : 0) * (i % 2 ? 1 : -1));
      m.castShadow = ms.dissolve < 0.5 && appear > 0.5;
      m.scale.setScalar(size);
      w.position.set(lane * c.laneGap, 0.04, front * 0.5);
      w.scale.set(c.hitWidth * 2, Math.max(0.01, front), 1);
      pool.visible = lying > 0 && poolR > 0.01 && ps.fade > 0.001;
      pool.position.set(lane * c.laneGap, 0.035, front);
      pool.scale.set(poolR * 2, poolR * 2, 1);
      for (let j = 0; j < SHARDS_PER_LANE; j++) {
        const angle = (j * Math.PI * 2) / SHARDS_PER_LANE + clock * orbitSpeed * (1 - 0.6 * lying);
        // Peel out while the masks rear, rain down round them as they fall,
        // then spiral in toward the sinking mask through the linger.
        const orbit = ((c.shardOrbit ?? 0.55) + departure * (c.shardSpread ?? 1.2)) * (1 - 0.55 * smooth(0, 1, fadeT));
        const airYs = m.position.y + Math.sin(angle) * orbit * 0.8;
        const floorY = c.shardRest + 0.05 * Math.sin(angle * 3 + j) - (this.phase === 'fade' ? 0.15 * fadeT : 0);
        const shardDrop = clamp(fall * 1.15 - (j % 3) * 0.05);
        shardTransform.position.set(
          lane * c.laneGap + Math.cos(angle) * orbit,
          airYs + (floorY - airYs) * shardDrop * shardDrop,
          front + (Math.sin(angle * 2) * 0.18 + departure * (j % 2 ? 0.45 : -0.45)) * (1 - shardDrop) + Math.sin(angle) * orbit * 0.8 * shardDrop,
        );
        shardTransform.rotation.set(angle * 0.4 + shardDrop * 1.2, angle, (clock * 2 + j) * (1 - 0.8 * lying));
        shardTransform.scale.setScalar((c.shardSize ?? 0.12) * (1 - departure * 0.3) * (1 - smooth(0.5, 1, fadeT)));
        shardTransform.updateMatrix();
        this.shards.setMatrixAt(i * SHARDS_PER_LANE + j, shardTransform.matrix);
      }
    }
    this.shards.instanceMatrix.needsUpdate = true;
    this._syncStrikes(clock);

    // 5 · glitter, dealt evenly over the lanes
    const gs = this._glitterState;
    gs.clock = clock;
    gs.front = front;
    gs.spread = departure;
    gs.fade = appear * fade;
    this.glitterMat.userData.sync(gs);
    this._syncParticles();

    // 7 · the shimmer stands at the mask front, across all three lanes
    const span = c.laneGap * 2 + 2;
    const ss = this._shimmerState;
    ss.clock = clock;
    ss.strength = appear * fade * (1 - departure * 0.6);
    ss.span = span;
    this.shimmer.visible = !this._calm && ss.strength * c.shimmerStrength * g.distortion > 0.002;
    if (this.shimmer.visible) {
      this.shimmer.position.set(0, c.shimmerHeight * 0.5, front);
      this.shimmer.scale.set(span, c.shimmerHeight, 1);
      this.shimmerMat.userData.sync(ss);
    }
  }

  /** 9 · the true strike masks: lunge down the line, swell, burn away. */
  _syncStrikes(clock) {
    const c = this.config;
    const life = Math.max(0.05, c.strikeLife);
    const yaw = Math.atan2(this.direction.x, this.direction.z);
    for (let k = 0; k < MAX_STRIKES; k++) {
      const strike = this.strikes[k];
      const born = this._strikeTimes[k];
      const t = born < 0 ? 1 : (this.age - born) / life;
      strike.visible = t >= 0 && t < 1;
      if (!strike.visible) continue;
      const lunge = Easing.outCubic(t);
      strike.position.copy(this._strikePos[k]).addScaledVector(this.direction, c.strikeLunge * lunge);
      strike.position.y = c.maskHeight + c.strikeRise * Easing.outCubic(Math.min(1, t * 3)) + 0.15 * Math.sin(Math.PI * t);
      // Looms over the struck body facing the caster, then drives down on it.
      strike.rotation.set(0.25 + 0.5 * lunge, yaw + Math.PI, 0);
      strike.scale.setScalar(c.maskSize * c.strikeSize * (0.55 + 0.45 * Easing.outBack(Math.min(1, t * 2.2))));
      _strikeState.clock = clock;
      _strikeState.fade = 1;
      _strikeState.dissolve = smooth(0.25, 1, t) * 1.02;
      _strikeState.calm = this._calm;
      _strikeState.heat = c.strikeHeat * (1 - t);
      strike.material.userData.sync(_strikeState);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._hitSubscription?.unsubscribe();
    this._hitSubscription = null;
    this._pendingContacts?.clear();
    this._scope = null;
    this.root.visible = false;
    this.shimmer.visible = false;
    for (const strike of this.strikes) strike.visible = false;
    for (const pool of this.pools) pool.visible = false;
    this._hits.clear();
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
  const folder = gui.addFolder('◐  Mirage Procession');

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 3, 40, 0.5, 'procession speed (m/s)');
  R(cast, c, 'lifetime', 0.2, 8, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'cooldown', 0, 15, 0.05, 'cooldown');
  castAnim(cast, c);
  cast.add(c, 'aimStyle', ['lanes']).name?.('reticle');

  const feint = sub(folder, 'The feint');
  feint.add(c, 'trueLane', { left: -1, center: 0, right: 1 }).name?.('real lane');
  R(feint, c, 'laneGap', 0.8, 4, 0.1, 'lane spacing (m)');
  R(feint, c, 'hitWidth', 0.1, 2, 0.05, 'real half-width (m)');
  R(feint, c, 'impulse', 0, 30, 0.1, 'knockback (m/s)');
  R(feint, c, 'lift', 0, 15, 0.05, 'lift (m/s)');
  R(feint, c, 'spin', 0, 8, 0.05, 'tumble');

  const light = sub(folder, 'Light');
  color(light, c, 'lightColor', 'colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'finaleLight', 0, 20, 0.1, 'punch at the finale');
  R(light, c, 'contactLight', 0, 20, 0.1, 'punch on a hit');

  const masks = sub(folder, '1 · The masks');
  R(masks, c, 'maskSize', 0.3, 2.5, 0.01, 'size');
  R(masks, c, 'maskHeight', 0.3, 3, 0.01, 'floats at (m)');
  R(masks, c, 'maskBob', 0, 0.6, 0.01, 'bob (m)');
  R(masks, c, 'maskSway', 0, 1, 0.01, 'sway (rad)');
  R(masks, c, 'appearTime', 0.01, 1, 0.01, 'fades in over (s)');
  R(masks, c, 'maskGlow', 0, 6, 0.05, 'lacquer glow');
  R(masks, c, 'maskShade', 0, 1, 0.01, 'key-light modelling');
  R(masks, c, 'maskSpecular', 0, 4, 0.05, 'lacquer glint');
  R(masks, c, 'maskDeep', -0.3, 0.3, 0.005, 'lacquer toward deep');
  R(masks, c, 'maskHold', 0, 0.9, 0.01, 'fallen masks hold (× linger)');
  R(masks, c, 'maskRear', 0, 1.5, 0.01, 'rear up before the fall (m)');
  R(masks, c, 'fallStart', 0, 0.9, 0.01, 'rear (× impact beat)');
  R(masks, c, 'fallTime', 0.05, 1, 0.01, 'fall (× impact beat)');
  R(masks, c, 'maskRestHeight', 0, 1, 0.01, 'rests at (× size)');
  R(masks, c, 'fallTilt', 0, 1.6, 0.01, 'fallen lean (rad)');
  R(masks, c, 'maskSink', 0, 1.5, 0.01, 'sinks in its pool (× size)');
  R(masks, c, 'maskLieSpin', -3, 3, 0.01, 'turns in its pool (rad)');
  R(masks, c, 'maskOpacity', 0, 2, 0.01, 'opacity');
  color(masks, c, 'maskLacquer', 'lacquer albedo');
  R(masks, c, 'maskRoughness', 0, 1, 0.01, 'lacquer roughness');
  R(masks, c, 'maskMetalness', 0, 1, 0.01, 'lacquer metalness');
  R(masks, c, 'maskClearcoat', 0, 1, 0.01, 'varnish coat');
  R(masks, c, 'maskKeyFill', 0, 3, 0.01, 'modelling key');
  R(masks, c, 'maskRimLight', 0, 3, 0.01, 'rim light');
  R(masks, c, 'maskTurn', -1, 1, 0.01, 'three-quarter turn (rad)');
  R(masks, c, 'gildWidth', 0, 0.2, 0.001, 'gilded border width');
  R(masks, c, 'gildGlow', 0, 6, 0.05, 'gilding glow');
  R(masks, c, 'gildMetal', 0, 1, 0.01, 'gilding metalness');
  R(masks, c, 'eyeGlow', 0, 12, 0.05, 'eye fire');
  R(masks, c, 'eyeSpread', 0.005, 0.2, 0.001, 'eye glow spread');
  R(masks, c, 'mouthGlow', 0, 6, 0.05, 'mouth ember');
  R(masks, c, 'filmStrength', 0, 1, 0.01, 'iridescence');
  R(masks, c, 'glitch', 0, 3, 0.01, 'slice glitch');
  R(masks, c, 'scanSpeed', 0, 20, 0.1, 'scan speed');
  R(masks, c, 'engravingGlow', 0, 6, 0.05, 'engraving glow');
  R(masks, c, 'dissolveEdge', 0.01, 0.3, 0.005, 'burn edge');
  color(masks, c, 'coreColor', 'ramp · core');
  color(masks, c, 'edgeColor', 'ramp · pale (edge)');
  color(masks, c, 'maskColor', 'ramp · body (mask)');
  color(masks, c, 'deepColor', 'ramp · deep');

  const veils = sub(folder, '2 · The veils');
  R(veils, c, 'veilLength', 0, 4, 0.01, 'length (m)');
  R(veils, c, 'veilWidth', 0.05, 2, 0.01, 'width (m)');
  R(veils, c, 'veilFlutter', 0, 3, 0.01, 'flutter');
  R(veils, c, 'veilDroop', 0, 1.5, 0.01, 'droop (m)');
  R(veils, c, 'veilGlow', 0, 6, 0.05, 'glow');
  R(veils, c, 'veilOpacity', 0, 1, 0.01, 'opacity');
  color(veils, c, 'trailColor', 'wake & veil');

  const wakes = sub(folder, '3 · The wakes');
  R(wakes, c, 'wakeGlow', 0, 6, 0.05, 'glow');
  R(wakes, c, 'wakeOpacity', 0, 1, 0.01, 'opacity');
  R(wakes, c, 'wakeShimmer', 0, 4, 0.01, 'shimmer');
  R(wakes, c, 'wakeScale', 0.2, 4, 0.01, 'band frequency');
  R(wakes, c, 'wakeDeep', 0, 2, 0.01, 'deep haze');
  R(wakes, c, 'wakeFill', 0, 1, 0.01, 'filled runner');
  R(wakes, c, 'wakeVeins', 0, 2, 0.01, 'flowing veins');

  const shards = sub(folder, '4 · The shards');
  R(shards, c, 'shardSize', 0.03, 0.35, 0.01, 'mirror size');
  R(shards, c, 'shardSpread', 0.2, 3, 0.1, 'departure spread (m)');
  R(shards, c, 'shardOrbit', 0.1, 1.5, 0.01, 'orbit (m)');
  R(shards, c, 'shardSpin', -6, 6, 0.05, 'orbit speed');
  R(shards, c, 'shardGlow', 0, 6, 0.05, 'glow');
  R(shards, c, 'shardOpacity', 0, 1, 0.01, 'opacity');
  R(shards, c, 'shardRest', 0, 0.5, 0.01, 'fallen shards lie at (m)');

  const pools = sub(folder, '4b · The pools (linger)');
  R(pools, c, 'lingerTime', 0.3, 4, 0.05, 'linger (s, presentation only)');
  R(pools, c, 'poolRadius', 0, 3, 0.01, 'radius (× size)');
  R(pools, c, 'poolGrow', 0.05, 2, 0.01, 'spreads over (s)');
  R(pools, c, 'poolOpacity', 0, 1, 0.01, 'opacity');
  R(pools, c, 'poolGlow', 0, 4, 0.05, 'glow');
  R(pools, c, 'poolSwirl', 0, 4, 0.05, 'swirl');
  R(pools, c, 'poolVeins', 0, 2, 0.01, 'veins');
  R(pools, c, 'poolRipple', 0, 2, 0.01, 'ripple fronts');

  const fx = sub(folder, '5 · Particles');
  R(fx, c, 'trailInterval', 0.02, 0.5, 0.01, 'trail puff every (s)');
  R(fx, c, 'trailCount', 0, 16, 1, 'trail puff count');
  R(fx, c, 'trailSize', 0.01, 0.5, 0.005, 'trail puff size');
  R(fx, c, 'trailLife', 0.05, 3, 0.01, 'trail puff life (s)');
  R(fx, c, 'trailSpeed', 0, 6, 0.05, 'trail puff speed');
  R(fx, c, 'trailSpread', 0, 1, 0.01, 'trail puff spread');
  R(fx, c, 'trailRadius', 0, 1.5, 0.01, 'trail emitter radius (m)');
  R(fx, c, 'finaleCount', 0, 48, 1, 'finale puff count');
  R(fx, c, 'finaleSize', 0.01, 0.6, 0.005, 'finale puff size');
  R(fx, c, 'finaleLife', 0.05, 3, 0.01, 'finale puff life (s)');
  R(fx, c, 'finaleSpeed', 0, 8, 0.05, 'finale puff speed');
  R(fx, c, 'finaleSpread', 0, 1, 0.01, 'finale puff spread');
  R(fx, c, 'finaleRadius', 0, 2, 0.01, 'finale emitter radius (m)');
  R(fx, c, 'contactCount', 0, 48, 1, 'contact burst count');
  R(fx, c, 'contactSize', 0.01, 0.6, 0.005, 'contact burst size');
  R(fx, c, 'contactLife', 0.05, 3, 0.01, 'contact burst life (s)');
  R(fx, c, 'contactSpeed', 0, 10, 0.05, 'contact burst speed');
  R(fx, c, 'contactSpread', 0, 1, 0.01, 'contact burst spread');
  R(fx, c, 'contactEmitRadius', 0, 2, 0.01, 'contact emitter radius (m)');
  R(fx, c, 'sparkGlow', 0, 6, 0.05, 'puff glow');
  gradient(fx, c, 'colorSpark', 'puff gradient');
  R(fx, c, 'glitterCount', 0, MAX_GLITTER, 1, 'glitter');
  R(fx, c, 'glitterSize', 0.005, 0.3, 0.005, 'glitter size');
  R(fx, c, 'glitterGlow', 0, 8, 0.05, 'glitter glow');
  R(fx, c, 'glitterRise', 0, 4, 0.05, 'glitter drift (m)');
  color(fx, c, 'glitterColor', 'glitter core');

  const finale = sub(folder, '6 · Finale & contacts');
  R(finale, c, 'finaleBurst', 0, 4, 0.01, 'shell per mask (m)');
  R(finale, c, 'finaleIntensity', 0, 3, 0.01, 'shell brightness');
  R(finale, c, 'shellLife', 0.05, 3, 0.01, 'shell lives (s)');
  R(finale, c, 'shellOpacity', 0, 1, 0.01, 'shell opacity');
  R(finale, c, 'shellFresnel', 0, 6, 0.05, 'shell rim');
  R(finale, c, 'rippleRadius', 0, 6, 0.05, 'ripple per lane (m)');
  R(finale, c, 'rippleIntensity', 0, 3, 0.01, 'ripple brightness');
  R(finale, c, 'contactRadius', 0, 5, 0.05, 'hit shockwave (m)');
  R(finale, c, 'contactIntensity', 0, 3, 0.01, 'hit shockwave brightness');
  R(finale, c, 'contactWidth', 0.01, 0.4, 0.005, 'hit shockwave width');
  R(finale, c, 'decalLife', 0.05, 3, 0.01, 'decals last (s)');
  color(finale, c, 'colorBurstA', 'shell inner');
  color(finale, c, 'colorBurstB', 'shell mid');
  color(finale, c, 'colorBurstC', 'shell outer');
  R(finale, c, 'impactShake', 0, 1, 0.01, 'camera knock');
  R(finale, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(finale, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(finale, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(finale, c, 'landShake', 0, 1, 0.01, 'knock as the masks land');

  const strike = sub(folder, '6b · The true strike');
  R(strike, c, 'strikeSize', 0.2, 3, 0.01, 'size (× mask)');
  R(strike, c, 'strikeLife', 0.05, 2, 0.01, 'life (s)');
  R(strike, c, 'strikeLunge', 0, 3, 0.01, 'lunge (m)');
  R(strike, c, 'strikeRise', 0, 3, 0.01, 'looms above (m)');
  R(strike, c, 'strikeHeat', 0, 4, 0.05, 'heat');
  R(strike, c, 'strikeFlash', 0, 1, 0.01, 'flash');
  R(strike, c, 'strikeShake', 0, 1, 0.01, 'knock');
  R(strike, c, 'strikeBurst', 0, 5, 0.05, 'pressure shell (m)');
  R(strike, c, 'strikeBurstLife', 0.05, 2, 0.01, 'shell life (s)');
  R(strike, c, 'strikeBurstOpacity', 0, 1, 0.01, 'shell opacity');
  R(strike, c, 'strikeBurstIntensity', 0, 4, 0.05, 'shell brightness');
  R(strike, c, 'strikeStain', 0, 4, 0.05, 'floor splash (m)');
  R(strike, c, 'strikeStainLife', 0.1, 6, 0.05, 'splash lasts (s)');

  const shimmer = sub(folder, '7 · The shimmer');
  R(shimmer, c, 'shimmerStrength', 0, 3, 0.01, 'strength');
  R(shimmer, c, 'shimmerHeight', 0.2, 5, 0.05, 'height (m)');
  R(shimmer, c, 'shimmerScale', 0.2, 4, 0.01, 'noise frequency');

  return folder;
}
