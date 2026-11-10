import { InstancedMesh, Mesh, Object3D, Vector3 } from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../AuthoredImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { routeExpansionTransparency } from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import {
  ANCHOR_RING_Y,
  createAnchorGeometry,
  createChainGeometry,
  createGateGeometry,
  createQuad,
} from './geometry.js';
import {
  MAX_POOL_TARGETS,
  createChainMaterial,
  createGateMaterial,
  createLensMaterial,
  createObsidianMaterial,
  createPoolMaterial,
  createVeinMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
export const UID = 'matrix-expansion/umbra-exchange';

const TAU = Math.PI * 2;
/** Golden angle: floor-chain bearings that never line up, without a random draw. */
const GOLDEN = 2.399963;
/** Most enemies one anchor exchanges (the pool shader's capacity). */
const MAX_TARGETS = MAX_POOL_TARGETS;
/** Hook chains (one per target or spare floor chain) plus the throw's tether. */
const MAX_CHAINS = MAX_TARGETS;
/** A sinking gate and a rising gate per target. */
const MAX_GATES = MAX_TARGETS * 2;
/** Chest height a chain hooks a standing body at (m). */
const CHEST = 1.15;

const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};

const _a = new Vector3();
const _b = new Vector3();
const _p = new Vector3();
const _q = new Vector3();
const _hand = new Vector3();
const _ring = new Vector3();
const _up = new Vector3(0, 1, 0);
const _gate = new Object3D();
/** Reused emit option bag (ParticleSystem.emit destructures, never retains). */
const _emit = {
  position: new Vector3(), radius: 0, direction: new Vector3(0, 1, 0), speed: 1, speedVariance: 0.4,
  spread: 0.5, size: 0.2, sizeVariance: 0.4, life: 1, lifeVariance: 0.3, spin: 0, time: 0,
};
/** Reused hit force for the direct dummy path. */
const _force = { impulse: 0, lift: 0, spin: 0 };

/**
 * UMBRA EXCHANGE — shadow, zone cast. An anchored shadow position swap.
 *
 * The caster draws an **obsidian anchor** out of their own shadow and throws
 * it; it bites the floor; and everything its chains can reach is traded for
 * its own shadow on the far side of it.
 *
 * ## Beats
 *
 *   1. **Anticipation** (`chargeTime`) — the anchor forms at the hand out of
 *      smoke (a noise dissolve on its veins, the body growing from a sliver),
 *      a chain of shade rising to it from the floor at the caster's feet,
 *      violet motes drawn in.
 *   2. **Travel** — it is hurled on an arc (`arcHeight`), flipping end over
 *      end (`tumble` whole turns) so it always lands crown-down, paying the
 *      chain out behind it from the caster's shadow and shedding smoke.
 *   3. **Impact** — the plunge: it bites `anchorBury` deep and rebounds; the
 *      crown and flukes go white-hot; the pool of darkness tears open with
 *      violet fissures; obsidian chips, a dark shell, CRACK / SCORCH /
 *      SHOCKWAVE decals, a pressure ring in the lens, a knock, a flash and a
 *      light punch. The throw's tether reels back to the hand.
 *   4. **Linger — the exchange.** Chains whip out of the anchor's ring to
 *      every enemy in reach (`hookDelay`). Each hooked body sinks into a
 *      puddle of its own shadow inside a twisting sheath of umbral tendrils
 *      (`sinkTime`); its umbra **crawls across the pool, through the anchor,
 *      to its mirror point** P′ = 2A − P, dragging the chain with it, while
 *      the anchor turns half a revolution (`crawlTime`); the body surfaces at
 *      P′ out of a second sheath (`riseTime`) and is struck — thrown away from
 *      the anchor. Then the anchor hums (`holdTime`): veins pulse up the
 *      shank, it rocks, chains reel back, the pool churns and smokes.
 *   5. **Exit** (`fade`) — the anchor is drawn down into its pool and the
 *      pool drains in patches.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the anchor** — procedural lofted obsidian (`createAnchorGeometry`):
 *      lit `MeshStandardMaterial`, world layer, casts shadows; an additive vein
 *      shell (`createVeinMaterial`) over the same geometry. Height derived from
 *      `zoneRadius`.
 *   2. **the chains** — the tether and up to six hook chains, unit tubes bent
 *      onto beziers and pinched into links in the vertex stage
 *      (`createChainMaterial`). When nobody is in reach, `floorChains` spare
 *      chains bite the floor and are dragged round as the anchor turns.
 *   3. **the pool** — the floor field (`createPoolMaterial`): darkness that
 *      eats the light, fissures, puddles at P and P′ and the crawling umbra.
 *   4. **the gates** — instanced twisting sheaths of umbral tendrils
 *      (`createGateMaterial`) where a body sinks and where it rises.
 *   5. **particles** — dark lit SMOKE off the pool and the anchor, lit CHIP
 *      obsidian at the plunge and at every surfacing, additive SOFT motes.
 *   6. **the plunge** — EARTH shell in the dark ramp, decals, flash, knock,
 *      light punch; a small AIR shell, SHOCKWAVE and knock at each surfacing.
 *   7. **the lens** (`LAYER.DISTORTION`) — the floor bends round the turning
 *      anchor, a pressure ring at the plunge.
 *
 * ## The rule (`handlesOwnHits`)
 *
 * At the plunge the anchor hooks the `maxTargets` (≤ 6) nearest living
 * enemies within `zoneRadius` — dummies, and through the combat binding only
 * the ones it reports as enemies. Each is moved, in the sandbox's own terms,
 * from P to its point reflection through the anchor P′ = 2A − P (a body on the
 * far side of the anchor from another trades places with it) and struck once
 * on arrival: one attributed shadow `hit` (`damage`, knocked away from the
 * anchor) through the binding, or `Dummy#kill` without one. At most one hit
 * per hooked enemy, six per cast. A body is only moved while it is alive and
 * the same life it was hooked in; a cast cleared mid-exchange puts every body
 * it still holds back on the floor where it stands — never left underground.
 * Reduced motion holds the flourishes (tumble, turn, rock, lens, knocks); the
 * exchange and its timing are unchanged.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get lifetimeScale() {
    return Math.max(0.1, settings.global.lifetime);
  }

  /** The exchange and the hum, end to end. */
  get impactDuration() {
    const c = this.config;
    return (c.hookDelay + c.sinkTime + c.crawlTime + c.riseTime + c.holdTime) * this.lifetimeScale;
  }

  get fadeDuration() {
    return this.config.fade * this.lifetimeScale;
  }

  /** Chains and gates on screen. HUD readout only. */
  get instanceCount() {
    let n = 0;
    for (const chain of this.chains) if (chain.visible) n++;
    return n + this.gates.count + 1;
  }

  /** Shadow light: an uneven breath that dims as well as brightens. */
  lightShimmer() {
    return 0.82 + 0.18 * Math.sin(this.age * 2.3) * Math.sin(this.age * 0.9 + 1.1);
  }

  /** The anchor is held at the hand for `chargeTime` before the throw. */
  advance(dt) {
    if (this.age < this.config.chargeTime * this.lifetimeScale) {
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

    // 1 · the anchor: solid lit obsidian on the world layer, and its veins.
    const anchorGeometry = own(createAnchorGeometry());
    this.obsidian = own(createObsidianMaterial());
    this.anchor = new Mesh(anchorGeometry, this.obsidian);
    this.anchor.castShadow = true;
    this.anchor.receiveShadow = true;
    this.anchor.rotation.order = 'YXZ';
    this.group.add(this.anchor);
    this.veinMat = own(createVeinMaterial());
    this.veins = new Mesh(anchorGeometry, this.veinMat);
    this.veins.renderOrder = 6;
    this.anchor.add(this.veins);

    // 2 · the chains: [0] is the throw's tether, the rest hook.
    const chainGeometry = own(createChainGeometry());
    this.chains = [];
    this.chainMats = [];
    for (let i = 0; i <= MAX_CHAINS; i++) {
      const material = own(createChainMaterial());
      const mesh = new Mesh(chainGeometry, material);
      mesh.frustumCulled = false; // placed in the vertex stage
      mesh.renderOrder = 5;
      mesh.visible = false;
      this.group.add(mesh);
      this.chains.push(mesh);
      this.chainMats.push(material);
    }

    // 3 · the pool
    this.poolMat = own(createPoolMaterial());
    this.pool = new Mesh(quad, this.poolMat);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.renderOrder = 2;
    this.group.add(this.pool);

    // 4 · the gates
    this.gateMat = own(createGateMaterial());
    this.gateGeometry = own(createGateGeometry(MAX_GATES));
    this.gates = new InstancedMesh(this.gateGeometry, this.gateMat, MAX_GATES);
    this.gates.frustumCulled = false;
    this.gates.renderOrder = 4;
    this.gates.count = 0;
    this.group.add(this.gates);

    // 7 · the lens
    this.lensMat = own(createLensMaterial());
    this.lens = new Mesh(quad, this.lensMat);
    this.lens.rotation.x = -Math.PI / 2;
    this.lens.position.y = 0.25;
    this.lens.visible = false;
    this.group.add(this.lens);

    routeExpansionTransparency(this.group);
    this.anchor.layers.set(LAYER.WORLD);
    this.lens.layers.set(LAYER.DISTORTION);

    /** Pooled per-target records: what was hooked, where, and what happened. */
    this.recs = [];
    for (let i = 0; i < MAX_TARGETS; i++) {
      this.recs.push({
        active: false, dummy: null, gen: 0, actorId: null,
        px: 0, pz: 0, seed: 0, moved: false, struck: false, struckAt: -1,
      });
    }
    this._found = [];
    this._anchor = new Vector3();
    this._poolState = { half: 1, radius: 1, spread: 0, impact: -1, hum: 0, clock: 0, fade: 1, dissolve: 0 };
    this._veinState = { clock: 0, hum: 0, heat: 0, form: 1, fade: 1 };
    this._chainState = { clock: 0, fade: 1, pulse: -1, taut: 0, length: 1 };
    this._gateState = { clock: 0 };
    this._lensState = { swirl: 0, shock: 0, wave: 0, clock: 0 };
    this._smokeRate = new RateEmitter();
    this._moteRate = new RateEmitter();
    this._disposed = false;
  }

  createParticles() {
    const get = (name, options) => this.ctx.particles?.get?.(`${ID}.${name}`, options) ?? null;
    this.smoke = get('smoke', { capacity: 700, shape: ParticleShape.SMOKE, additive: false, curl: true, lit: true, softFade: 0.45 });
    this.shards = get('shards', { capacity: 400, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.15 });
    this.motes = get('motes', { capacity: 600, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.3 });
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this.hooked = 0;
    this.struck = 0;
    this._clock = 0;
    this._heat = 0;
    this._plunged = false;
    this._calm = prefersReducedMotion();
    this._smokeRate.reset();
    this._moteRate.reset();
    for (const rec of this.recs) this._clearRec(rec);
    this._anchor.copy(this.origin);
    for (const chain of this.chains) chain.visible = false;
    this.gates.count = 0;
    this.lens.visible = false;
    this.anchor.visible = true;
    this.pool.visible = false;
    this._sync(0);
  }

  onTravel(dt) {
    this._emitTravel(dt);
    this._sync(dt);
  }

  onImpact() {
    this.position.y = 0;
    this._anchor.copy(this.position);
    this._plunged = true;
    this._heat = 1;
    this._hook();
    this._plunge();
    this._sync(0);
  }

  onFade(dt) {
    this._exchange();
    this._emitLinger(dt);
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The rule                                                            */
  /* ------------------------------------------------------------------ */

  _clearRec(rec) {
    rec.active = false;
    rec.dummy = null;
    rec.gen = 0;
    rec.actorId = null;
    rec.moved = false;
    rec.struck = false;
    rec.struckAt = -1;
  }

  _generation(dummy) {
    return this.ctx.dummies?.standGeneration?.(dummy) ?? 0;
  }

  /** Whether a record may still touch its body: alive, and the same life. */
  _owns(rec) {
    return rec.active && rec.dummy && rec.dummy.alive !== false && this._generation(rec.dummy) === rec.gen;
  }

  /** At the plunge: hook the nearest living enemies in reach. */
  _hook() {
    const c = this.config;
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const A = this._anchor;
    const R = c.zoneRadius;
    const limit = Math.max(0, Math.min(MAX_TARGETS, Math.round(c.maxTargets)));
    let actors = null;
    if (this._scope) {
      const found = this._scope.queryActors({ position: [A.x, 0, A.z], radius: Math.min(48, R + 1.5), relation: 'enemy' });
      if (!found.ok) {
        this.failure = found.reason;
        return;
      }
      actors = found.actors;
    }
    const bodies = field.findTargets(A.x, A.z, R, this._found);
    let n = 0;
    for (const dummy of bodies) {
      if (n >= limit) break;
      if (!dummy?.position || dummy.alive === false) continue;
      let actorId = null;
      if (actors) {
        // The binding is the authority on who is an enemy: the body must be
        // one of its live enemy actors.
        let best = 0.6;
        for (const actor of actors) {
          if (actor.alive === false) continue;
          const d = Math.hypot(actor.position[0] - dummy.position.x, actor.position[2] - dummy.position.z);
          if (d < best) {
            best = d;
            actorId = actor.id;
          }
        }
        if (!actorId) continue;
      }
      const rec = this.recs[n++];
      rec.active = true;
      rec.dummy = dummy;
      rec.gen = this._generation(dummy);
      rec.actorId = actorId;
      rec.px = dummy.position.x;
      rec.pz = dummy.position.z;
      rec.seed = (n * 0.618034) % 1;
    }
    this.hooked = n;
  }

  /** Mirror of a hooked body's start through the anchor, written into `out`. */
  _mirror(rec, out) {
    return out.set(2 * this._anchor.x - rec.px, 0, 2 * this._anchor.z - rec.pz);
  }

  /** Staged seconds since the plunge, through the impact and the fade. */
  get _since() {
    if (!this._plunged) return -1;
    return (this.impactTime + (this.phase === 'fade' ? this.fadeTime : 0)) / this.lifetimeScale;
  }

  /** Move the hooked bodies through the exchange; strike them on arrival. */
  _exchange() {
    const c = this.config;
    const s = this._since;
    const tSink = c.hookDelay;
    const tCrawl = tSink + c.sinkTime;
    const tRise = tCrawl + c.crawlTime;
    const tOut = tRise + c.riseTime;
    for (const rec of this.recs) {
      if (!rec.active || rec.struck) continue;
      if (!this._owns(rec)) {
        // Felled, frozen or re-stood by something else: let go, untouched.
        rec.active = false;
        continue;
      }
      const body = rec.dummy.position;
      if (!rec.moved && s >= tCrawl) {
        // Under the floor: the body changes sides of the anchor.
        this._mirror(rec, _p);
        body.x = _p.x;
        body.z = _p.z;
        const home = rec.dummy._home;
        if (home && Number.isFinite(home.x) && Number.isFinite(home.z)) {
          home.x = 2 * this._anchor.x - home.x;
          home.z = 2 * this._anchor.z - home.z;
        }
        rec.moved = true;
      }
      const sink = Easing.inQuad(clamp((s - tSink) / Math.max(0.01, c.sinkTime)));
      const rise = rec.moved ? Easing.outCubic(clamp((s - tRise) / Math.max(0.01, c.riseTime))) : 0;
      body.y = rec.moved ? -c.sinkDepth * (1 - rise) : -c.sinkDepth * sink;
      if (rec.moved && s >= tOut) {
        body.y = 0;
        this._arrive(rec);
      }
    }
  }

  /** The body is out: one shadow hit, away from the anchor. */
  _arrive(rec) {
    const c = this.config;
    rec.struck = true;
    rec.struckAt = this._since;
    const A = this._anchor;
    this._mirror(rec, _p);
    _q.set(_p.x - A.x, 0, _p.z - A.z);
    if (_q.lengthSq() < 1e-8) _q.copy(this.direction);
    else _q.normalize();
    const power = settings.global.explosionIntensity;
    if (this._scope) {
      if (rec.actorId) {
        const sent = this._scope.emit({
          type: 'hit', element: 'shadow', targetIds: [rec.actorId],
          position: [_p.x, 0, _p.z], sourcePosition: [A.x, 0, A.z], damage: c.damage,
          hitForce: impactForce(c), tags: ['umbra-exchange', 'exchange'],
        });
        if (sent.ok) this.struck++;
        else this.failure = sent.reason;
      }
    } else {
      _force.impulse = c.hitImpulse * power;
      _force.lift = c.hitLift * power;
      _force.spin = c.hitSpin;
      if (rec.dummy.kill?.(_q.x, _q.z, _force)) this.struck++;
    }
    // The surfacing beat.
    this.lightBoost = Math.max(this.lightBoost, c.arrivalLight * power);
    _a.set(_p.x, 0.05, _p.z);
    this.ctx.bursts?.spawn?.(BurstMode.AIR, _a, {
      radius: 0.2, endRadius: c.gateRadius * 2.6 * power, life: 0.45, intensity: c.burstIntensity,
      opacity: c.burstOpacity * settings.global.opacity, fresnel: c.burstFresnel, squash: 0.6,
      colorA: getColor(c.tintColor), colorB: getColor(c.bodyColor), colorC: getColor(c.deepColor),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _a, {
      radius: c.gateRadius * 3 * power, life: c.decalLife * 0.5, width: c.shockwaveWidth, intensity: c.shockwaveIntensity,
      colorA: getColor(c.tintColor), colorB: getColor(c.deepColor),
    });
    if (!this._calm && c.arrivalShake > 0) this.ctx.shake?.add?.(c.arrivalShake * power * settings.global.cameraShake, c.shakeDecay, c.shakeFrequency);
    this._burst(this.shards, _a, c.arrivalShards, c.shardSize, c.shardSpeed * 0.7, c.shardLife, 0.7, 0.3);
    this._burst(this.smoke, _a, 10, c.smokeSize * 1.2, c.smokeSpeed * 1.5, c.smokeLife, 0.8, 0.4);
  }

  /** The plunge: everything lands on one frame. */
  _plunge() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = c.zoneRadius;
    this.lightBoost = c.plungeLight * power;
    _a.copy(this._anchor).setY(0.05);
    this.ctx.bursts?.spawn?.(BurstMode.EARTH, _a, {
      radius: R * 0.12, endRadius: R * c.burstReach * power, life: c.burstLife, intensity: c.burstIntensity,
      opacity: c.burstOpacity * g.opacity, fresnel: c.burstFresnel, squash: c.burstSquash,
      colorA: getColor(c.bodyColor), colorB: getColor(c.deepColor), colorC: getColor(c.voidColor),
    });
    this.ctx.decals?.spawn?.(DecalType.CRACK, _a, {
      radius: R * c.crackDecal, life: c.decalLife, intensity: 1,
      colorA: getColor(c.tintColor), colorB: getColor(c.deepColor),
    });
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _a, {
      radius: R * c.scorchDecal, life: c.decalLife, intensity: 0.8,
      colorA: getColor(c.bodyColor), colorB: getColor(c.voidColor),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _a, {
      radius: R * 1.2 * power, life: c.decalLife * 0.4, width: c.shockwaveWidth, intensity: c.shockwaveIntensity,
      colorA: getColor(c.coreColor), colorB: getColor(c.bodyColor),
    });
    if (!this._calm && c.impactShake > 0) this.ctx.shake?.add?.(c.impactShake * power * g.cameraShake, c.shakeDecay, c.shakeFrequency);
    if (c.impactFlash > 0) this.ctx.flash?.trigger?.(getColor(c.tintColor), c.impactFlash * power);
    this._burst(this.shards, _a, c.plungeShards, c.shardSize, c.shardSpeed, c.shardLife, 0.85, R * 0.15);
    this._burst(this.smoke, _a, 28, c.smokeSize * 1.6, c.smokeSpeed * 3, c.smokeLife, 1, R * 0.3);
    this._burst(this.motes, _a, 40, c.moteSize * 1.4, 3.5, c.moteLife * 1.6, 0.9, R * 0.2);
  }

  /* ------------------------------------------------------------------ */
  /* Particles                                                           */
  /* ------------------------------------------------------------------ */

  _burst(system, at, count, size, speed, life, spread, radius) {
    if (!system || count <= 0) return;
    const g = settings.global;
    _emit.position.copy(at);
    _emit.radius = radius;
    _emit.direction.copy(_up);
    _emit.speed = speed * g.particleSpeed;
    _emit.spread = spread;
    _emit.size = size * g.particleSize;
    _emit.life = life * g.particleLifetime;
    _emit.spin = 3;
    _emit.time = frame.uTime.value;
    system.emit(Math.min(160, Math.max(0, Math.round(count * g.particleCount))), _emit);
  }

  _emitTravel(dt) {
    const c = this.config;
    if (this.age < c.chargeTime * this.lifetimeScale) {
      // Gather: motes at the hand, shade rising off the caster's feet.
      this._handPoint(_hand);
      this._burst(this.motes, _hand, c.gatherCount, c.moteSize, 0.5, c.moteLife, 1, 0.55);
      const n = this._smokeRate.tick(dt, c.smokeRate * 0.6 * settings.global.particleCount);
      if (n > 0) this._burst(this.smoke, _a.copy(this.origin).setY(0.1), n, c.smokeSize * 0.7, c.smokeSpeed, c.smokeLife * 0.7, 0.5, 0.45);
      return;
    }
    const n = this._smokeRate.tick(dt, c.smokeRate * 1.4 * settings.global.particleCount);
    if (n > 0) this._burst(this.smoke, this.anchor.position, n, c.smokeSize * 0.8, 0.3, c.smokeLife * 0.6, 1, 0.25);
    const m = this._moteRate.tick(dt, 40 * settings.global.particleCount);
    if (m > 0) this._burst(this.motes, this.anchor.position, m, c.moteSize, 0.6, c.moteLife, 1, 0.3);
  }

  _emitLinger(dt) {
    const c = this.config;
    const g = settings.global;
    const fading = this.phase === 'fade';
    const n = this._smokeRate.tick(dt, c.smokeRate * g.particleCount * (fading ? 0.5 : 1));
    if (n > 0) {
      // Off a random point of the pool, rising and curling.
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * c.zoneRadius * c.poolScale * 0.85;
      _a.set(this._anchor.x + Math.cos(a) * r, 0.1, this._anchor.z + Math.sin(a) * r);
      this._burst(this.smoke, _a, n, c.smokeSize, c.smokeSpeed, c.smokeLife, 0.35, 0.3);
    }
    const m = this._moteRate.tick(dt, 30 * g.particleCount);
    if (m > 0 && !fading) {
      // Motes climb the anchor's veins and stream off the gates.
      const rec = this.recs[Math.floor(Math.random() * Math.max(1, this.hooked))];
      if (rec?.active && !rec.struck) {
        if (rec.moved) this._mirror(rec, _a);
        else _a.set(rec.px, 0, rec.pz);
        _a.y = 0.2;
        this._burst(this.motes, _a, m, c.moteSize, 1.4, c.moteLife, 0.4, c.gateRadius);
      } else {
        _a.copy(this._anchor).setY(this._anchorHeight() * 0.5);
        this._burst(this.motes, _a, m, c.moteSize, 0.8, c.moteLife, 1, 0.5);
      }
    }
  }

  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    const sys = (system, glow, a, b, cc, d) => {
      if (!system?.uniforms) return;
      system.setGradient?.(getColor(a), getColor(b), getColor(cc), getColor(d));
      const u = system.uniforms;
      if (u.uGlow) u.uGlow.value = glow * g.glow;
      if (u.uOpacity) u.uOpacity.value = g.opacity;
      if (u.uTurbulence) u.uTurbulence.value = 0.7 * g.turbulence;
      if (u.uSizeScale) u.uSizeScale.value = g.particleSize;
      if (u.uSpeedScale) u.uSpeedScale.value = g.particleSpeed;
      if (u.uLifeScale) u.uLifeScale.value = g.particleLifetime;
    };
    sys(this.smoke, 1, c.colorSmokeA, c.colorSmokeB, c.colorSmokeC, c.colorSmokeD);
    if (this.smoke?.uniforms?.uGravity) this.smoke.uniforms.uGravity.value.set(0, 0.6, 0);
    if (this.smoke?.uniforms?.uEndSize) this.smoke.uniforms.uEndSize.value = 2.2;
    sys(this.shards, 1, c.coreColor, c.obsidianColor, c.deepColor, c.voidColor);
    if (this.shards?.uniforms?.uGravity) this.shards.uniforms.uGravity.value.set(0, -9.8, 0);
    sys(this.motes, c.sparkGlow, c.colorMoteA, c.colorMoteB, c.colorMoteC, c.colorMoteD);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  /** Full anchor height, metres: derived from the reach. */
  _anchorHeight() {
    return this.config.anchorHeight * this.config.zoneRadius;
  }

  /** Where the anchor forms: over the caster's right hand. */
  _handPoint(out) {
    return out.copy(this.origin).addScaledVector(this.side, 0.45).addScaledVector(_up, this.config.handHeight);
  }

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const R = c.zoneRadius;
    const H = this._anchorHeight();
    if (!this._calm) this._clock += dt * g.animationSpeed;
    const clock = this._clock;
    const charge = c.chargeTime * this.lifetimeScale;
    const s = this._since;
    const fadeT = this.phase === 'fade' ? clamp(this.fadeTime / Math.max(0.01, this.fadeDuration)) : 0;
    const fade = 1 - fadeT;
    const tSink = c.hookDelay;
    const tCrawl = tSink + c.sinkTime;
    const tRise = tCrawl + c.crawlTime;
    const tOut = tRise + c.riseTime;
    this._heat = Math.max(0, this._heat - dt * 2.2);

    /* --- 1 · the anchor --- */
    const yaw = Math.atan2(-this.side.z, this.side.x);
    let form = 1;
    let hum = 0;
    if (!this._plunged) {
      this._handPoint(_hand);
      const held = this.age < charge;
      const f = held ? 0 : smooth(this.u);
      form = held ? smooth(this.age / Math.max(0.01, charge)) : 1;
      const scale = H * (c.handScale + (1 - c.handScale) * f) * (0.25 + 0.75 * form);
      _a.lerpVectors(_hand, this.position, f);
      _a.y = _hand.y * (1 - f) + 4 * c.arcHeight * f * (1 - f);
      // Hold the anchor by its ring at the hand; land it crown-down at the floor.
      _a.y -= scale * ANCHOR_RING_Y * (1 - f) + scale * c.anchorBury * f;
      this.anchor.position.copy(_a);
      this.anchor.scale.setScalar(Math.max(0.001, scale));
      const turns = this._calm ? 0 : Math.max(0, Math.round(c.tumble));
      this.anchor.rotation.set(-TAU * turns * f, yaw + (held ? clock * 1.5 : 0), 0);
    } else {
      const since = Math.max(0, s);
      // Bite, overshoot, settle; then on the exit, drawn under.
      const rebound = c.plungeDepth * c.anchorBury * H * Math.exp(-since * 9) * Math.cos(since * 16);
      const under = Easing.inCubic(fadeT) * H * 1.15;
      this.anchor.position.set(this._anchor.x, -c.anchorBury * H - rebound - under, this._anchor.z);
      this.anchor.scale.setScalar(H);
      const turnT = smooth((since - tCrawl) / Math.max(0.01, c.crawlTime));
      const turn = this._calm ? 0 : (c.turnAngle * Math.PI / 180) * turnT;
      hum = smooth((since - tSink) / 0.5) * fade;
      const rock = this._calm ? 0 : Math.sin(clock * 2.1) * 0.045 * smooth((since - tOut) / 0.4) * fade;
      this.anchor.rotation.set(rock, yaw + turn, rock * 0.5);
    }
    this.anchor.visible = fade > 0.001;
    this.obsidian.userData.sync();
    const vs = this._veinState;
    vs.clock = clock;
    vs.hum = hum;
    vs.heat = this._heat;
    vs.form = form;
    vs.fade = fade;
    this.veinMat.userData.sync(vs);
    this.anchor.updateMatrix();
    _ring.set(0, ANCHOR_RING_Y, 0).applyMatrix4(this.anchor.matrix);

    /* --- 2 · the chains --- */
    const cs = this._chainState;
    cs.clock = clock;
    // The tether: out of the caster's shadow to the anchor's ring; reels back after the plunge.
    {
      const chain = this.chains[0];
      const reel = this._plunged ? clamp(Math.max(0, s) / Math.max(0.01, c.tetherRetract)) : 0;
      chain.visible = reel < 1 && fade > 0;
      if (chain.visible) {
        _a.copy(this.origin).addScaledVector(this.direction, -0.2).setY(0.02);
        const u = this.chainMats[0].uniforms;
        u.uA.value.copy(_a);
        u.uC.value.copy(_ring);
        u.uB.value.lerpVectors(_a, _ring, 0.5);
        u.uB.value.y -= c.chainSag * (1 - smooth(this.u));
        u.uFrom.value = 0;
        u.uTo.value = 1 - Easing.inQuad(reel);
        cs.fade = this.age < charge ? smooth(this.age / Math.max(0.01, charge) * 2) : 1;
        cs.pulse = this._plunged ? -1 : (clock * 1.5) % 1;
        cs.taut = this._plunged ? 0 : 0.5;
        cs.length = _a.distanceTo(_ring);
        this.chainMats[0].userData.sync(cs);
      }
    }
    // Hook chains: one per hooked body, then spare chains that bite the floor.
    const spare = this.hooked === 0 ? Math.max(0, Math.min(MAX_CHAINS, Math.round(c.floorChains))) : 0;
    const used = this.hooked + spare;
    for (let i = 0; i < MAX_CHAINS; i++) {
      const chain = this.chains[i + 1];
      chain.visible = false;
      if (!this._plunged || i >= used || fade <= 0) continue;
      const since = Math.max(0, s);
      const pay = Easing.outCubic(clamp(since / Math.max(0.01, c.hookDelay)));
      let retract = 0;
      let taut = 1;
      let pulse = -1;
      const u = this.chainMats[i + 1].uniforms;
      if (i < this.hooked) {
        const rec = this.recs[i];
        if (rec.struck) retract = clamp((since - rec.struckAt) / 0.3);
        if (!rec.struck && !rec.active) retract = 1;
        // The end follows the body down, the umbra across, the body up.
        if (!rec.moved) {
          _b.set(rec.px, 0, rec.pz);
          const sink = rec.dummy?.position?.y ?? 0;
          _b.y = Math.max(0.05, CHEST + sink);
        } else if (since < tRise) {
          const k = clamp((since - tCrawl) / Math.max(0.01, c.crawlTime));
          this._mirror(rec, _q);
          if (k < 0.5) _b.set(rec.px, 0.05, rec.pz).lerp(this._anchor, k * 2).setY(0.05);
          else _b.copy(this._anchor).lerp(_q, k * 2 - 1).setY(0.05);
          pulse = (since * 2.2) % 1;
        } else {
          this._mirror(rec, _b);
          _b.y = Math.max(0.05, CHEST + (rec.dummy?.position?.y ?? 0));
        }
        if (since >= tCrawl && since < tRise) taut = 1.2;
      } else {
        // A floor chain bites at a golden-angle bearing and is dragged round
        // as the anchor turns.
        const turnT = smooth((since - tCrawl) / Math.max(0.01, c.crawlTime));
        const bearing = yaw + i * GOLDEN + (this._calm ? 0 : (c.turnAngle * Math.PI / 180) * turnT);
        const reach = R * c.floorChainReach;
        _b.set(this._anchor.x + Math.cos(bearing) * reach, 0.03, this._anchor.z + Math.sin(bearing) * reach);
        retract = clamp((since - tOut) / Math.max(0.01, c.holdTime * 0.8));
        taut = 0.6;
      }
      chain.visible = retract < 1;
      if (!chain.visible) continue;
      u.uA.value.copy(_ring);
      u.uC.value.copy(_b);
      // Control: a slack arc that whips sideways as it strikes and pulls taut.
      u.uB.value.lerpVectors(_ring, _b, 0.5);
      const whip = this._calm ? 0 : Math.sin(since * 11 + i * 1.7) * c.chainWhip * (1 - pay);
      u.uB.value.addScaledVector(this.side, whip);
      u.uB.value.y += (1 - pay) * c.chainSag * 1.5 - c.chainSag * 0.4 * (1 - taut * 0.6);
      u.uFrom.value = 0;
      u.uTo.value = pay * (1 - Easing.inQuad(retract));
      cs.fade = fade;
      cs.pulse = pulse;
      cs.taut = taut;
      cs.length = _ring.distanceTo(_b);
      this.chainMats[i + 1].userData.sync(cs);
    }

    /* --- 3 · the pool --- */
    this.pool.visible = this._plunged && fade > 0.001;
    if (this.pool.visible) {
      const since = Math.max(0, s);
      const poolR = R * c.poolScale;
      const half = poolR * 1.12 + c.puddleSize;
      this.pool.position.set(this._anchor.x, 0.03, this._anchor.z);
      this.pool.scale.set(half * 2, half * 2, 1);
      const ps = this._poolState;
      ps.half = half;
      ps.radius = poolR;
      ps.spread = Easing.outCubic(clamp(since / Math.max(0.01, c.poolSpread)));
      ps.impact = since < 0.6 ? since / 0.6 : -1;
      ps.hum = hum;
      ps.clock = clock;
      ps.fade = fade;
      ps.dissolve = clamp(fadeT / Math.max(0.05, c.poolDissolve));
      const targets = this.poolMat.uniforms.uTargets.value;
      const states = this.poolMat.uniforms.uState.value;
      for (let i = 0; i < MAX_TARGETS; i++) {
        const rec = this.recs[i];
        if (i >= this.hooked) {
          states[i].set(0, 0, -1, 0);
          continue;
        }
        this._mirror(rec, _q);
        targets[i].set(rec.px - this._anchor.x, -(rec.pz - this._anchor.z), _q.x - this._anchor.x, -(_q.z - this._anchor.z));
        const atP = smooth((since - tSink * 0.4) / Math.max(0.01, c.hookDelay)) * (1 - smooth((since - tRise) / 0.5));
        const atQ = smooth((since - (tCrawl + c.crawlTime * 0.5)) / Math.max(0.01, c.crawlTime * 0.5)) * (1 - smooth((since - tOut - 0.2) / 0.7));
        const crawl = rec.moved && since >= tCrawl && since < tRise ? (since - tCrawl) / Math.max(0.01, c.crawlTime) : -1;
        states[i].set(atP, atQ, crawl, 1);
      }
      this.poolMat.userData.sync(ps);
    }

    /* --- 4 · the gates --- */
    let gates = 0;
    if (this._plunged && fade > 0) {
      const since = Math.max(0, s);
      const attr = this.gateGeometry.attributes.aGate;
      for (let i = 0; i < this.hooked; i++) {
        const rec = this.recs[i];
        // Sinking gate at P.
        const openP = smooth((since - tSink * 0.6) / Math.max(0.01, c.sinkTime * 0.5));
        const closeP = smooth((since - tCrawl) / Math.max(0.01, c.gateLife));
        if (openP * (1 - closeP) > 0.002) {
          _gate.position.set(rec.px, 0.02, rec.pz);
          _gate.updateMatrix();
          this.gates.setMatrixAt(gates, _gate.matrix);
          attr.setXYZW(gates, openP * (1 - closeP * 0.5), rec.seed, 0, openP * (1 - closeP) * fade);
          gates++;
        }
        // Rising gate at P′.
        const openQ = smooth((since - (tRise - c.crawlTime * 0.25)) / Math.max(0.01, c.riseTime * 0.6 + 0.05));
        const closeQ = smooth((since - tOut) / Math.max(0.01, c.gateLife));
        if (openQ * (1 - closeQ) > 0.002) {
          this._mirror(rec, _q);
          _gate.position.set(_q.x, 0.02, _q.z);
          _gate.updateMatrix();
          this.gates.setMatrixAt(gates, _gate.matrix);
          attr.setXYZW(gates, openQ * (1 - closeQ * 0.5), rec.seed + 0.37, 1, openQ * (1 - closeQ) * fade);
          gates++;
        }
      }
      if (gates) {
        attr.needsUpdate = true;
        this.gates.instanceMatrix.needsUpdate = true;
      }
    }
    this.gates.count = gates;
    this._gateState.clock = clock;
    this.gateMat.userData.sync(this._gateState);

    /* --- 5 · particles --- */
    this._syncParticles();

    /* --- 7 · the lens --- */
    const ls = this._lensState;
    const since = Math.max(0, s);
    ls.swirl = this._plunged ? smooth((since - tSink) / 0.4) * (1 - smooth((since - tOut) / 0.5)) * fade : 0;
    ls.shock = this._plunged && since < 0.6 ? 1 - since / 0.6 : 0;
    ls.wave = Easing.outCubic(clamp(since / 0.6));
    ls.clock = clock;
    this.lens.visible = !this._calm && this._plunged && (ls.swirl * c.lensStrength + ls.shock * c.lensShock) * g.distortion > 0.002;
    if (this.lens.visible) {
      this.lens.position.set(this._anchor.x, 0.25, this._anchor.z);
      this.lens.scale.set(R * 2.4, R * 2.4, 1);
      this.lensMat.userData.sync(ls);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    // First, always: no body this cast still holds is left under the floor.
    for (const rec of this.recs) {
      if (this._owns(rec) && !rec.struck) rec.dummy.position.y = 0;
      this._clearRec(rec);
    }
    this.hooked = 0;
    this._scope = null;
    this._plunged = false;
    this.anchor.visible = false;
    this.pool.visible = false;
    this.lens.visible = false;
    this.gates.count = 0;
    for (const chain of this.chains) chain.visible = false;
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
  const folder = gui.addFolder('⚓  Umbra Exchange');

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 3, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 80, 0.5, 'anchor flies at (m/s)');
  R(cast, c, 'zoneRadius', 1, 9, 0.1, 'anchor reach (m)');
  R(cast, c, 'lifetime', 0.5, 8, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'cooldown', 0, 20, 0.05, 'cooldown');
  castAnim(cast, c);

  const swap = sub(folder, 'The exchange');
  R(swap, c, 'maxTargets', 0, MAX_TARGETS, 1, 'most enemies exchanged');
  R(swap, c, 'chargeTime', 0.05, 1.2, 0.01, 'anchor forms over (s)');
  R(swap, c, 'hookDelay', 0.05, 1, 0.01, 'chains reach after (s)');
  R(swap, c, 'sinkTime', 0.1, 1.5, 0.01, 'bodies sink over (s)');
  R(swap, c, 'crawlTime', 0.1, 2, 0.01, 'umbra crawls over (s)');
  R(swap, c, 'riseTime', 0.1, 1.5, 0.01, 'bodies rise over (s)');
  R(swap, c, 'holdTime', 0.1, 3, 0.01, 'anchor hums for (s)');
  R(swap, c, 'fade', 0.1, 3, 0.01, 'exit (s)');
  R(swap, c, 'sinkDepth', 0.5, 4, 0.05, 'drawn under (m)');
  R(swap, c, 'damage', 0, 10, 0.1, 'damage on arrival');
  R(swap, c, 'hitImpulse', 0, 24, 0.1, 'thrown away (impulse)');
  R(swap, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(swap, c, 'hitSpin', 0, 8, 0.05, 'tumble');

  const light = sub(folder, 'Light & palette');
  color(light, c, 'lightColor', 'light colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'plungeLight', 0, 20, 0.1, 'punch at the plunge');
  R(light, c, 'arrivalLight', 0, 20, 0.1, 'punch at each surfacing');
  color(light, c, 'coreColor', 'core');
  color(light, c, 'tintColor', 'tint');
  color(light, c, 'bodyColor', 'body');
  color(light, c, 'deepColor', 'deep');
  color(light, c, 'voidColor', 'void');

  const anchor = sub(folder, '1 · The anchor');
  R(anchor, c, 'anchorHeight', 0.2, 1.6, 0.01, 'height (× reach)');
  R(anchor, c, 'anchorBury', 0, 0.5, 0.01, 'bites in (× height)');
  R(anchor, c, 'handScale', 0.05, 1, 0.01, 'size at the hand');
  R(anchor, c, 'handHeight', 0.3, 3, 0.01, 'forms at height (m)');
  R(anchor, c, 'arcHeight', 0, 8, 0.05, 'throw arc (m)');
  R(anchor, c, 'tumble', 0, 4, 1, 'flips in flight');
  R(anchor, c, 'plungeDepth', 0, 2, 0.01, 'overshoot (× bite)');
  R(anchor, c, 'turnAngle', 0, 720, 1, 'turns during the exchange (°)');
  color(anchor, c, 'obsidianColor', 'obsidian');
  R(anchor, c, 'obsidianMetalness', 0, 1, 0.01, 'metalness');
  R(anchor, c, 'obsidianRoughness', 0, 1, 0.01, 'roughness');
  R(anchor, c, 'veinGlow', 0, 6, 0.05, 'vein glow');
  R(anchor, c, 'veinScale', 0.5, 10, 0.05, 'vein scale');
  R(anchor, c, 'rimGlow', 0, 4, 0.05, 'sheen');
  R(anchor, c, 'humRate', 0, 8, 0.05, 'hum (Hz)');

  const chains = sub(folder, '2 · The chains');
  R(chains, c, 'chainWidth', 0.01, 0.3, 0.005, 'link thickness (m)');
  R(chains, c, 'chainLinks', 2, 24, 0.5, 'links per metre');
  R(chains, c, 'chainSag', 0, 3, 0.01, 'slack (m)');
  R(chains, c, 'chainWhip', 0, 2, 0.01, 'whip (m)');
  R(chains, c, 'chainGlow', 0, 6, 0.05, 'glow');
  R(chains, c, 'chainOpacity', 0, 1, 0.01, 'opacity');
  R(chains, c, 'floorChains', 0, MAX_CHAINS, 1, 'floor chains when nobody is in reach');
  R(chains, c, 'floorChainReach', 0.1, 1.2, 0.01, 'floor chains bite at (× reach)');
  R(chains, c, 'tetherRetract', 0.05, 1.5, 0.01, 'tether reels back over (s)');

  const pool = sub(folder, '3 · The pool');
  R(pool, c, 'poolScale', 0.3, 2, 0.01, 'radius (× reach)');
  R(pool, c, 'poolSpread', 0.05, 2, 0.01, 'runs out over (s)');
  R(pool, c, 'poolDarkness', 0, 1, 0.01, 'darkness');
  R(pool, c, 'crackGlow', 0, 6, 0.05, 'fissure glow');
  R(pool, c, 'crackCount', 2, 24, 1, 'fissures');
  R(pool, c, 'puddleSize', 0.2, 3, 0.01, 'puddle (m)');
  R(pool, c, 'umbraSize', 0.2, 3, 0.01, 'crawling umbra (m)');
  R(pool, c, 'poolSwirl', 0, 3, 0.01, 'churn');
  R(pool, c, 'poolDissolve', 0.05, 1, 0.01, 'drains over (× exit)');

  const gates = sub(folder, '4 · The gates');
  R(gates, c, 'gateHeight', 0.3, 6, 0.05, 'height (m)');
  R(gates, c, 'gateRadius', 0.1, 2, 0.01, 'radius (m)');
  R(gates, c, 'gateTwist', 0, 8, 0.05, 'twist');
  R(gates, c, 'gateGlow', 0, 6, 0.05, 'glow');
  R(gates, c, 'gateLife', 0.05, 2, 0.01, 'dies away over (s)');

  const fx = sub(folder, '5 · Particles');
  R(fx, c, 'smokeRate', 0, 120, 1, 'smoke per second');
  R(fx, c, 'smokeSize', 0.05, 2, 0.01, 'smoke size');
  R(fx, c, 'smokeLife', 0.1, 4, 0.01, 'smoke life (s)');
  R(fx, c, 'smokeSpeed', 0, 4, 0.01, 'smoke rise');
  gradient(fx, c, 'colorSmoke', 'smoke gradient');
  R(fx, c, 'gatherCount', 0, 12, 1, 'motes gathered per frame');
  R(fx, c, 'moteSize', 0.01, 0.4, 0.005, 'mote size');
  R(fx, c, 'moteLife', 0.05, 3, 0.01, 'mote life (s)');
  R(fx, c, 'sparkGlow', 0, 6, 0.05, 'mote glow');
  gradient(fx, c, 'colorMote', 'mote gradient');
  R(fx, c, 'plungeShards', 0, 160, 1, 'chips at the plunge');
  R(fx, c, 'arrivalShards', 0, 80, 1, 'chips at each surfacing');
  R(fx, c, 'shardSize', 0.02, 0.5, 0.005, 'chip size');
  R(fx, c, 'shardSpeed', 0, 16, 0.05, 'chip speed');
  R(fx, c, 'shardLife', 0.1, 3, 0.01, 'chip life (s)');

  const plunge = sub(folder, '6 · The plunge');
  R(plunge, c, 'burstReach', 0, 2, 0.01, 'shell grows to (× reach)');
  R(plunge, c, 'burstIntensity', 0, 3, 0.01, 'shell brightness');
  R(plunge, c, 'burstLife', 0.05, 3, 0.01, 'shell lives (s)');
  R(plunge, c, 'burstOpacity', 0, 1, 0.01, 'shell opacity');
  R(plunge, c, 'burstFresnel', 0, 6, 0.05, 'shell rim');
  R(plunge, c, 'burstSquash', 0.05, 1.5, 0.01, 'shell squash');
  R(plunge, c, 'decalLife', 0.1, 6, 0.05, 'decals last (s)');
  R(plunge, c, 'crackDecal', 0, 2, 0.01, 'crack decal (× reach)');
  R(plunge, c, 'scorchDecal', 0, 2, 0.01, 'scorch decal (× reach)');
  R(plunge, c, 'shockwaveWidth', 0.01, 0.4, 0.005, 'shockwave width');
  R(plunge, c, 'shockwaveIntensity', 0, 3, 0.01, 'shockwave brightness');
  R(plunge, c, 'impactShake', 0, 1, 0.01, 'camera knock');
  R(plunge, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(plunge, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(plunge, c, 'impactFlash', 0, 1, 0.01, 'flash');
  R(plunge, c, 'arrivalShake', 0, 1, 0.01, 'knock at each surfacing');

  const lens = sub(folder, '7 · The lens');
  R(lens, c, 'lensStrength', 0, 3, 0.01, 'bend round the anchor');
  R(lens, c, 'lensShock', 0, 3, 0.01, 'plunge pressure ring');

  return folder;
}
