import { Group, InstancedMesh, Mesh, Object3D, Vector3 } from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { routeExpansionTransparency, ParticleShape } from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { frame } from '../../../core/FrameUniforms.js';
import { LAYER } from '../../../core/Layers.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import {
  HEART_Y,
  createFigureGeometry,
  createPacketGeometry,
  createQuad,
  createShardGeometry,
  createStreamerGeometry,
  createTetherGeometry,
} from './geometry.js';
import {
  createFieldMaterial,
  createFigureMaterial,
  createFlareMaterial,
  createPacketMaterial,
  createShardMaterial,
  createStreamerMaterial,
  createTetherMaterial,
  createWarpMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
export const UID = 'matrix-expansion/photon-doppel';

const TAU = Math.PI * 2;
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};

/** Enemies one decoy can expose (tethers drawn). */
export const MAX_MARKS = 8;
/** Bodies one overexposure may strike. */
export const MAX_TARGETS = 8;
/** Foreign hits one decoy may soak up. */
export const MAX_SOAKED = 8;
/** Corpses one decoy may draw in. */
const MAX_BODIES = 6;
/** Crystal shards: the halo before, the burst after. */
const MAX_SHARDS = 36;
const MAX_HALO = 16;
/** Spiral ribbons of light drawn into the heart. */
const STREAMERS = 10;
/** Dice per shard: bearing, height, speed, lift, size. */
const DICE = 5;

const scratch = new Object3D();
const _pos = new Vector3();
const _dir = new Vector3();
const _heart = new Vector3();
const _body = new Vector3();
const _up = new Vector3(0, 1, 0);
/** One reused option bag for every emit (ParticleSystem destructures it). */
const _emit = { position: _pos, direction: _dir, radius: 0, speed: 1, spread: 0.5, size: 0.1, life: 1, spin: 2, time: 0 };

/**
 * PHOTON DOPPEL — light, zone cast. An absorbing light decoy.
 *
 * ## Beats
 *
 *  1. **anticipation** — for `chargeTime` a photon packet winds up at the
 *     caster's hand inside a small starburst, and the strike circle and the
 *     dashed lure ring start to draw themselves at the target.
 *  2. **travel** — the packet, a turned spindle of light, flies the line at
 *     `packetHeight`, shedding a stream of sparks.
 *  3. **impact (formation)** — the packet stands up as a **hooded figure of
 *     light**, arms open, a head taller than a person (its height is derived
 *     from `zoneRadius`, so the decoy always fills its circle). Flash, knock,
 *     a shockwave, a starburst at the heart, a light punch.
 *  4. **linger (the drinking)** — for `absorbTime` the decoy drinks light,
 *     and the whole presentation moves with how much it has drunk: bands of
 *     light run inward through the body, its core goes dark and the dark
 *     spreads; the arms lift; it breathes faster; it turns slowly to and fro;
 *     ten ribbons spiral in from the lure ring; rays on the floor run to its
 *     feet while an umbra eats the floor under it; a tether arcs from every
 *     enemy it has exposed into its heart; motes stream inward; the scene's
 *     light *dims*; the air is pulled toward it. A halo of crystal shards
 *     turns behind its head.
 *  5. **impact (overexposure)** — it whites out, swells, and bursts: a white
 *     front runs out over the floor, a starburst flares, a pressure shell and
 *     a ring of sparks are thrown, every shard is thrown out of the body.
 *  6. **exit** — the figure burns away from the hem upward, the shards
 *     tumble down and settle while they cool, the sun-print on the floor
 *     cools from the rim inward and finally dissolves.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the figure** (`createFigureGeometry`, `createFigureMaterial`) — the
 *      hero: a lofted, hooded, robed body with swept arms; normal-blended so
 *      its dark core really hides what is behind it.
 *   2. **the halo and shards** — lit, shadow-casting crystal
 *      (`MeshStandardMaterial`, world layer): light made solid.
 *   3. **the streamers** — spiral ribbons with dashes running inward.
 *   4. **the tethers** — one arc per exposed enemy, reeled into the heart.
 *   5. **the floor** (`createFieldMaterial`) — telegraph, rays, umbra, then
 *      the sun-print.
 *   6. **the packet** — travel.
 *   7. **the flare** — camera-facing starburst at the hand, the heart, the
 *      overexposure.
 *   8. **particles** — inward motes (SOFT, swirl), sparks (STREAK), glints
 *      (CHIP); an AIR shell, SHOCKWAVE and SCORCH decals.
 *   9. **the warp** — `LAYER.DISTORTION`: inward pull, then a pressure ring.
 *
 * ## The rule (`handlesOwnHits`)
 *
 * The decoy *exposes* every enemy inside `lureRadius` while it drinks (up to
 * `maxMarks`, scanned every `markInterval`, deterministic order): a tether is
 * drawn from each, and under the combat binding a `light` status is laid on
 * it. It also *soaks up* every other cast's committed hit that lands inside
 * its circle (`maxSoaked`). Charge = marks × `chargePerMark` + soaked ×
 * `chargePerHit`, capped at 1. Corpses on the floor inside the lure are drawn
 * toward it. At `absorbTime` it overexposes: exactly one hit on every enemy
 * inside `zoneRadius` (≤ 8), damage `baseDamage + round(charge·bonusDamage)`,
 * knockback and lift × (1 + charge·`chargeForce`), routed through the
 * expansion combat binding, or straight to the dummies without one. Enemies
 * that were exposed but stand outside the strike circle are not hit — the
 * lure is wider than the blast on purpose.
 *
 * ## The editor rule
 *
 * A cast keeps only events (who it exposed and when, how many hits it
 * soaked, whether it has overexposed) and per-shard dice; every dimension,
 * colour, count and timing is read from `settings.photonDoppel` every frame.
 * Under reduced motion the visual clock is held and the camera knock and the
 * warp are skipped; gameplay timing is unchanged.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return MAX_SHARDS + STREAMERS + MAX_MARKS;
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** Seconds the decoy drinks before it overexposes. */
  get absorbDuration() {
    return Math.max(0.05, this.config.absorbTime * settings.global.lifetime);
  }

  get impactDuration() {
    return this.absorbDuration + Math.max(0.05, this.config.exposureLinger * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.05, this.config.fadeTime * settings.global.lifetime);
  }

  /** Hold the packet at the hand for `chargeTime` before it flies. */
  advance(dt) {
    if (this.age < this.config.chargeTime * settings.global.lifetime) {
      this.pointAt(0, this.position);
      return false;
    }
    return super.advance(dt);
  }

  /** The decoy drinks the scene's light: the cast light sinks with charge. */
  lightShimmer() {
    const base = super.lightShimmer();
    if (!this._drinking) return base;
    return base * (1 - clamp(this.config.absorbDim) * this._shown);
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
    // Everything at the target hangs off `root`; the packet, the flare and
    // the tethers are placed in world space directly on the group.
    this.root = new Group();
    this.group.add(this.root);
    const quad = own(createQuad());

    // 5 · the floor
    this.fieldMaterial = own(createFieldMaterial());
    this.field = new Mesh(quad, this.fieldMaterial);
    this.field.rotation.x = -Math.PI / 2;
    this.field.position.y = 0.03;
    this.field.renderOrder = 2;
    this.root.add(this.field);

    // 1 · the figure
    this.figureMaterial = own(createFigureMaterial());
    this.figure = new Mesh(own(createFigureGeometry()), this.figureMaterial);
    this.figure.renderOrder = 5;
    this.root.add(this.figure);

    // 2 · the halo and shards: lit crystal on the world layer, casting shadows.
    this.shardMaterial = own(createShardMaterial());
    this.shards = new InstancedMesh(own(createShardGeometry()), this.shardMaterial, MAX_SHARDS);
    this.shards.castShadow = true;
    this.shards.frustumCulled = false;
    this.root.add(this.shards);
    this._dice = new Float32Array(MAX_SHARDS * DICE);

    // 3 · the streamers
    this.streamerMaterial = own(createStreamerMaterial());
    this.streamers = new Mesh(own(createStreamerGeometry(STREAMERS)), this.streamerMaterial);
    this.streamers.frustumCulled = false;
    this.streamers.renderOrder = 6;
    this.root.add(this.streamers);

    // 4 · the tethers (world space; ends written per frame)
    this.tetherMaterial = own(createTetherMaterial(MAX_MARKS));
    this.tethers = new Mesh(own(createTetherGeometry(MAX_MARKS)), this.tetherMaterial);
    this.tethers.frustumCulled = false;
    this.tethers.renderOrder = 7;
    this.group.add(this.tethers);

    // 6 · the packet
    this.packetMaterial = own(createPacketMaterial());
    this.packet = new Mesh(own(createPacketGeometry()), this.packetMaterial);
    this.packet.renderOrder = 8;
    this.group.add(this.packet);

    // 7 · the flare
    this.flareMaterial = own(createFlareMaterial());
    this.flare = new Mesh(quad, this.flareMaterial);
    this.flare.frustumCulled = false;
    this.flare.renderOrder = 9;
    this.group.add(this.flare);

    // 9 · the warp
    this.warpMaterial = own(createWarpMaterial());
    this.warp = new Mesh(quad, this.warpMaterial);
    this.warp.rotation.x = -Math.PI / 2;
    this.warp.position.y = 0.4;
    this.warp.visible = false;
    this.root.add(this.warp);

    // Pooled records: events only.
    this._marks = [];
    for (let i = 0; i < MAX_MARKS; i++) this._marks.push({ id: null, dummy: null, x: 0, z: 0, at: 0, seen: false });
    this._bodies = [];
    this._found = [];
    this._target = new Vector3();
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._source = [0, 0, 0];
    this._clock = 0;
    this._shown = 0;
    this._drinking = false;
    this._sub = null;
    // A current toward the decoy, for corpses it draws in (see Dummy#carry).
    this._bodyField = (x, y, z, out) => {
      const dx = this._target.x - x;
      const dz = this._target.z - z;
      const d = Math.hypot(dx, dz) || 1;
      const s = Math.min(4, d * 1.6);
      out.set((dx / d) * s, 0.8, (dz / d) * s);
    };
    // A foreign hit inside the circle is light the decoy soaks up.
    this._onHit = (event) => {
      if (!this._drinking || !event || event.abilityUid === UID) return;
      const p = event.position;
      if (!Array.isArray(p) || p.length < 3) return;
      if (Math.hypot(p[0] - this._target.x, p[2] - this._target.z) > this.config.zoneRadius) return;
      if (this._soaked < Math.min(MAX_SOAKED, Math.max(0, Math.round(this.config.maxSoaked)))) this._soaked++;
    };

    this._fieldState = { clock: 0, zone: 0.6, umbra: 0.3, telegraph: 0, absorb: 0, drink: 0, expose: -1, burn: 0, cool: 0, dissolve: 0, fade: 1 };
    this._figureState = { clock: 0, breath: 0, raise: 0, swell: 0, absorb: 0, white: 0, dissolve: 0, fade: 1 };
    this._ribbonState = { clock: 0, power: 0 };
    this._tetherState = { clock: 0, power: 0 };
    this._packetState = { clock: 0, power: 1 };
    this._flareState = { power: 0, rot: 0 };
    this._warpState = { pull: 0, shock: 0, wave: 0, clock: 0 };
    this._shardState = { heat: 1 };

    routeExpansionTransparency(this.group);
    this.warp.layers.set(LAYER.DISTORTION);
    this._disposed = false;
  }

  createParticles() {
    const p = this.ctx.particles;
    // Motes streaming into the heart: soft, additive, swirling.
    this.motes = p?.get?.(`${ID}.motes`, { capacity: 900, shape: ParticleShape.SOFT, additive: true, swirl: true, curl: true, softFade: 0.4 }) ?? null;
    // Trail and overexposure sparks: velocity-stretched streaks.
    this.sparks = p?.get?.(`${ID}.sparks`, { capacity: 900, shape: ParticleShape.STREAK, additive: true, stretch: true, softFade: 0.3 }) ?? null;
    // Glints of crystallised light thrown off the figure.
    this.glints = p?.get?.(`${ID}.glints`, { capacity: 500, shape: ParticleShape.CHIP, additive: true, softFade: 0.3 }) ?? null;
    if (this.motes?.uniforms) {
      const u = this.motes.uniforms;
      u.uDrag.value = 0.25;
      u.uGravity.value.set(0, 0.4, 0);
      u.uEndSize.value = 0.2;
      u.uFadeIn.value = 0.2;
      u.uFadeOut.value = 0.45;
    }
    if (this.sparks?.uniforms) {
      const u = this.sparks.uniforms;
      u.uDrag.value = 1.6;
      u.uGravity.value.set(0, -3, 0);
      u.uEndSize.value = 0.3;
      u.uStretch.value = 0.22;
    }
    if (this.glints?.uniforms) {
      const u = this.glints.uniforms;
      u.uDrag.value = 0.8;
      u.uGravity.value.set(0, -6, 0);
      u.uEndSize.value = 0.5;
      u.uFadeOut.value = 0.6;
    }
    this.moteEmitter = new RateEmitter();
    this.trailEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.pointAt(1, this._target);
    this._target.y = 0;
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this._calm = prefersReducedMotion();
    this._clock = 0;
    this._shown = 0;
    this._drinking = false;
    this._exposed = false;
    this._formed = false;
    this._markCount = 0;
    this._soaked = 0;
    this._struck = 0;
    this._damage = 0;
    this._scanTimer = 0;
    this._unsubscribe();
    for (const m of this._marks) {
      m.id = null;
      m.dummy = null;
      m.seen = false;
    }
    this._bodies.length = 0;
    for (let i = 0; i < this._dice.length; i++) this._dice[i] = Math.random();
    this.moteEmitter?.reset();
    this.trailEmitter?.reset();
    this.root.visible = true;
    this.figure.visible = false;
    this._sync(0);
  }

  onTravel(dt) {
    this._sync(dt);
    this._emitTrail(dt);
  }

  onImpact() {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    this.position.copy(this._target);
    this._formed = true;
    this._drinking = true;
    if (this._scope) {
      const sub = this._scope.on('hit', this._onHit);
      if (sub?.ok) this._sub = sub;
    }
    this._scan();
    this.lightBoost = c.formLight * power;
    _pos.copy(this._target).setY(0.04);
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: c.zoneRadius * 0.6, life: 0.6, width: c.shockwaveWidth, intensity: c.shockwaveIntensity * 0.7,
      colorA: getColor(c.tintColor), colorB: getColor(c.bodyColor),
    });
    if (!this._calm && c.formShake > 0) this.ctx.shake?.add?.(c.formShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.formFlash > 0) this.ctx.flash?.trigger?.(getColor(c.tintColor), c.formFlash * power);
    this._heartPoint(_heart);
    this._burst(this.glints, _heart, c.glintCount * 0.35, 0.3, c.glintSpeed * 0.6, 0.9, c.glintSize, c.glintLife * 0.7);
    this._sync(0);
  }

  onFade(dt) {
    const c = this.config;
    if (this._drinking) {
      this._scanTimer += dt;
      if (this._scanTimer >= Math.max(0.02, c.markInterval)) {
        this._scanTimer = 0;
        this._scan();
      }
      this._drawBodies();
      this._emitMotes(dt);
    }
    if (!this._exposed && this.impactTime >= this.absorbDuration) this._overexpose();
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* The rule                                                            */
  /* ------------------------------------------------------------------ */

  /** Charge drunk so far, 0..1, from events and live multipliers. */
  get charge() {
    const c = this.config;
    return clamp(this._markCount * c.chargePerMark + this._soaked * c.chargePerHit);
  }

  get marks() {
    return this._markCount;
  }

  get soaked() {
    return this._soaked;
  }

  _markLimit() {
    return Math.min(MAX_MARKS, Math.max(0, Math.round(this.config.maxMarks)));
  }

  /** Expose every new enemy inside the lure; refresh where the known ones stand. */
  _scan() {
    const c = this.config;
    const lure = Math.max(c.zoneRadius, c.lureRadius);
    for (const m of this._marks) m.seen = false;
    if (this._scope) {
      this._source[0] = this._target.x;
      this._source[1] = 0;
      this._source[2] = this._target.z;
      const found = this._scope.queryActors({ position: this._source, radius: Math.min(48, lure), relation: 'enemy' });
      if (!found?.ok) return;
      for (const actor of found.actors) {
        let mark = null;
        for (let i = 0; i < this._markCount; i++) if (this._marks[i].id === actor.id) mark = this._marks[i];
        if (!mark) {
          if (this._markCount >= this._markLimit()) continue;
          mark = this._marks[this._markCount++];
          mark.id = actor.id;
          mark.dummy = null;
          mark.at = this.impactTime;
          this._scope.emit({
            type: 'status', element: 'light', targetIds: [actor.id], position: actor.position,
            durationTicks: Math.max(1, Math.round(c.statusSeconds * (this._scope.tickRate || 30))),
            tags: ['photon-doppel', 'exposed'],
          });
        }
        mark.x = actor.position[0];
        mark.z = actor.position[2];
        mark.seen = true;
      }
      return;
    }
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(this._target.x, this._target.z, lure, this._found);
    for (const dummy of found) {
      if (!dummy?.position || dummy.alive === false) continue;
      const dx = dummy.position.x - this._target.x;
      const dz = dummy.position.z - this._target.z;
      if (dx * dx + dz * dz > lure * lure) continue;
      let mark = null;
      for (let i = 0; i < this._markCount; i++) if (this._marks[i].dummy === dummy) mark = this._marks[i];
      if (!mark) {
        if (this._markCount >= this._markLimit()) continue;
        mark = this._marks[this._markCount++];
        mark.dummy = dummy;
        mark.id = null;
        mark.at = this.impactTime;
      }
      mark.x = dummy.position.x;
      mark.z = dummy.position.z;
      mark.seen = true;
    }
  }

  /** Corpses inside the lure are drawn toward the decoy while it drinks. */
  _drawBodies() {
    const c = this.config;
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    if (this._scanTimer === 0) {
      const lure = Math.max(c.zoneRadius, c.lureRadius);
      const found = field.findBodies(this._target.x, this._target.z, lure, this._found);
      for (const body of found) {
        if (body.alive || this._bodies.length >= MAX_BODIES || this._bodies.includes(body)) continue;
        if (typeof body.carry === 'function') this._bodies.push(body);
      }
    }
    for (const body of this._bodies) body.carry(this._bodyField, clamp(c.bodyPull), clamp(c.bodyPull) * 0.5, clamp(c.bodyBuoyancy));
  }

  /** Let go of drawn corpses, throwing them outward if `throwSpeed` > 0. */
  _releaseBodies(throwSpeed) {
    for (const body of this._bodies) {
      body.release?.();
      if (throwSpeed > 0 && body.shove) {
        const at = body.bodyPoint?.(_body) ?? body.position;
        _dir.set(at.x - this._target.x, 0, at.z - this._target.z);
        if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction);
        _dir.normalize();
        body.shove(_dir.x * throwSpeed, throwSpeed * 0.5, _dir.z * throwSpeed);
      }
    }
    this._bodies.length = 0;
  }

  _unsubscribe() {
    this._sub?.unsubscribe?.();
    this._sub = null;
  }

  /** The decoy overexposes: one strike, scaled by what it drank. */
  _overexpose() {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    this._exposed = true;
    this._drinking = false;
    this._unsubscribe();
    const charge = this.charge;
    const scale = 1 + charge * Math.max(0, c.chargeForce);
    // Clamp before impactForce so a full charge stays inside the bridge bounds.
    this._force.impulse = Math.min(24, Math.max(0, c.hitImpulse * scale));
    this._force.lift = Math.min(20, Math.max(0, c.hitLift * scale));
    this._force.spin = Math.min(8, Math.max(0, c.hitSpin));
    const force = impactForce({ hitImpulse: this._force.impulse, hitLift: this._force.lift, hitSpin: this._force.spin }, power);
    this._damage = Math.max(0, c.baseDamage + Math.round(charge * c.bonusDamage));
    this._strike(force);
    this._releaseBodies(c.bodyThrow * power);
    this._present();
  }

  _strike(force) {
    const c = this.config;
    const r = c.zoneRadius;
    this._source[0] = this._target.x;
    this._source[1] = 0;
    this._source[2] = this._target.z;
    if (this._scope) {
      const targets = this._scope.queryActors({ position: this._source, radius: Math.min(48, r), relation: 'enemy' });
      if (!targets?.ok) {
        this.failure = targets?.reason ?? 'query failed';
        return;
      }
      const n = Math.min(MAX_TARGETS, targets.actors.length);
      for (let i = 0; i < n; i++) {
        const actor = targets.actors[i];
        const sent = this._scope.emit({
          type: 'hit', element: 'light', targetIds: [actor.id],
          position: actor.position, sourcePosition: [this._source[0], 0, this._source[2]],
          damage: this._damage, hitForce: force, tags: ['photon-doppel', 'overexposure'],
        });
        if (sent.ok) this._struck++;
        else this.failure = sent.reason;
      }
      return;
    }
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(this._target.x, this._target.z, r, this._found);
    for (const dummy of found) {
      if (this._struck >= MAX_TARGETS) break;
      if (!dummy?.position || dummy.alive === false) continue;
      _dir.set(dummy.position.x - this._target.x, 0, dummy.position.z - this._target.z);
      if (_dir.lengthSq() > r * r) continue;
      if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction);
      else _dir.normalize();
      if (dummy.kill(_dir.x, _dir.z, force)) this._struck++;
    }
  }

  /** The overexposure's flash, knock, light, shell, decals and particles. */
  _present() {
    const c = this.config;
    const power = settings.global.explosionIntensity;
    const r = c.zoneRadius;
    this.lightBoost = c.exposureLight * power;
    this._heartPoint(_heart);
    _pos.copy(_heart);
    this.ctx.bursts?.spawn?.(BurstMode.AIR, _pos, {
      radius: r * 0.12, endRadius: r * c.burstReach * power, life: c.burstLife,
      intensity: c.burstIntensity, opacity: c.burstOpacity * settings.global.opacity,
      fresnel: c.burstFresnel, squash: c.burstSquash,
      colorA: getColor(c.colorBurstA), colorB: getColor(c.colorBurstB), colorC: getColor(c.colorBurstC),
    });
    _pos.copy(this._target).setY(0.04);
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _pos, {
      radius: r * 0.95, life: c.decalLife, intensity: c.scorchIntensity,
      colorA: getColor(c.bodyColor), colorB: getColor(c.deepColor),
    });
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: r * 1.15 * power, life: c.decalLife * 0.35, width: c.shockwaveWidth, intensity: c.shockwaveIntensity,
      colorA: getColor(c.coreColor), colorB: getColor(c.bodyColor),
    });
    if (!this._calm && c.exposureShake > 0) this.ctx.shake?.add?.(c.exposureShake * power, c.shakeDecay, c.shakeFrequency);
    if (c.exposureFlash > 0) this.ctx.flash?.trigger?.(getColor(c.coreColor), c.exposureFlash * power);
    this._burst(this.sparks, _heart, c.sparkCount, 0.4, c.sparkSpeed, 1, c.sparkSize, c.sparkLife);
    this._burst(this.glints, _heart, c.glintCount, r * 0.15, c.glintSpeed, 0.9, c.glintSize, c.glintLife);
  }

  /* ------------------------------------------------------------------ */
  /* Particles                                                           */
  /* ------------------------------------------------------------------ */

  _burst(system, at, count, radius, speed, spread, size, life) {
    if (!system) return;
    const n = Math.min(160, Math.max(0, Math.round(count * settings.global.particleCount)));
    if (!n) return;
    _pos.copy(at);
    _dir.copy(_up);
    _emit.radius = radius;
    _emit.speed = speed;
    _emit.spread = spread;
    _emit.size = size;
    _emit.life = life;
    _emit.spin = 3;
    _emit.time = frame.uTime.value;
    system.emit(n, _emit);
  }

  /** Sparks shed behind the packet. */
  _emitTrail(dt) {
    const c = this.config;
    if (!this.sparks || !this.packet.visible) return;
    const n = this.trailEmitter.tick(dt, Math.max(0, c.trailRate * settings.global.particleCount));
    if (!n) return;
    _pos.copy(this.packet.position);
    _dir.copy(this.direction).negate();
    _emit.radius = 0.08;
    _emit.speed = 1.6;
    _emit.spread = 0.35;
    _emit.size = c.trailSize;
    _emit.life = c.trailLife;
    _emit.spin = 0;
    _emit.time = frame.uTime.value;
    this.sparks.emit(Math.min(16, n), _emit);
  }

  /** Motes from the lure ring, each aimed at the heart so it arrives as it dies. */
  _emitMotes(dt) {
    const c = this.config;
    if (!this.motes) return;
    const n = Math.min(12, this.moteEmitter.tick(dt, Math.max(0, c.moteRate * (0.4 + 0.6 * this._shown) * settings.global.particleCount)));
    if (!n) return;
    const lure = Math.max(c.zoneRadius, c.lureRadius);
    this._heartPoint(_heart);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const rr = lure * (0.75 + 0.25 * Math.random());
      _pos.set(this._target.x + Math.cos(a) * rr, 0.2 + Math.random() * 1.6, this._target.z + Math.sin(a) * rr);
      _dir.subVectors(_heart, _pos);
      const d = _dir.length();
      _dir.multiplyScalar(1 / Math.max(d, 1e-4));
      _emit.radius = 0.05;
      _emit.speed = (d / Math.max(0.1, c.moteLife)) * 1.15;
      _emit.spread = 0.05;
      _emit.size = c.moteSize;
      _emit.life = c.moteLife;
      _emit.spin = 0;
      _emit.time = frame.uTime.value;
      this.motes.emit(1, _emit);
    }
  }

  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    for (const system of [this.motes, this.sparks, this.glints]) {
      if (!system?.uniforms) continue;
      system.setGradient?.(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
      const u = system.uniforms;
      if (u.uGlow) u.uGlow.value = c.moteGlow * g.glow;
      if (u.uOpacity) u.uOpacity.value = g.opacity;
      if (u.uTurbulence) u.uTurbulence.value = 0.4 * g.turbulence;
      if (u.uSizeScale) u.uSizeScale.value = g.particleSize;
      if (u.uSpeedScale) u.uSpeedScale.value = g.particleSpeed;
      if (u.uLifeScale) u.uLifeScale.value = g.particleLifetime;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  /** Figure height in metres, derived from the strike circle. */
  _height() {
    return Math.max(0.2, this.config.zoneRadius * this.config.figureHeight);
  }

  _heartPoint(out) {
    return out.copy(this._target).setY(HEART_Y * this._height());
  }

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const r = c.zoneRadius;
    const lure = Math.max(r, c.lureRadius);
    const H = this._height();
    if (!this._calm) this._clock += dt * g.noiseSpeed;
    const clock = this._clock;
    const life = g.lifetime;
    const absorbT = this.absorbDuration;
    const travel = this.phase === 'travel';
    const fadeT = this.phase === 'fade' ? clamp(this.fadeTime / this.fadeDuration) : 0;
    const fade = 1 - fadeT;
    // Seconds since the overexposure, running on through the fade.
    const since = this._exposed ? this.impactTime - absorbT + (this.phase === 'fade' ? this.fadeTime : 0) : -1;
    const drinkT = this._formed && !this._exposed ? clamp(this.impactTime / absorbT) : this._exposed ? 1 : 0;
    // What the decoy shows it has drunk: a baseline that grows with time, and
    // the real charge on top, eased so a new exposure swells in.
    const target = clamp(0.35 * drinkT + 0.65 * this.charge);
    this._shown += (target - this._shown) * Math.min(1, dt * 6);
    const shown = this._shown;
    const form = this._formed ? clamp(this.impactTime / Math.max(0.02, c.formTime * life)) : 0;

    this.root.position.copy(this._target);

    // 5 · the floor
    const fieldR = lure * 1.02;
    this.field.scale.set(fieldR * 2, fieldR * 2, 1);
    const fs = this._fieldState;
    fs.clock = clock;
    fs.zone = r / fieldR;
    fs.umbra = (c.umbraRadius * r) / fieldR;
    fs.telegraph = travel ? smooth(this.u * 1.3) : this._exposed ? 1 - clamp(since / 0.35) : 1;
    fs.absorb = shown;
    fs.drink = this._exposed ? 1 - clamp(since / 0.25) : this._formed ? smooth(form * 2) : 0;
    fs.expose = this._exposed && since < 0.5 ? clamp(since / 0.45) : -1;
    fs.burn = this._exposed ? smooth(since / 0.12) : 0;
    fs.cool = this._exposed ? clamp(since / Math.max(0.05, c.burnCool * life)) : 0;
    fs.dissolve = clamp(fadeT / Math.max(0.05, c.dissolveTime));
    fs.fade = 1;
    this.fieldMaterial.userData.sync(fs);

    // 1 · the figure
    const whiteT = Math.max(0.02, c.whiteOut * life);
    const burnAway = this._exposed ? clamp((since - whiteT * 0.5) / Math.max(0.05, c.shatterTime * life)) : 0;
    this.figure.visible = this._formed && burnAway < 1;
    if (this.figure.visible) {
      const rise = Easing.outBack(form);
      const width = H * c.figureWidth * (0.55 + 0.45 * form);
      this.figure.scale.set(width, Math.max(0.001, H * rise), width);
      // It faces the caster — a doppelgänger — and turns slowly to and fro.
      const yaw = Math.atan2(-this.direction.x, -this.direction.z);
      this.figure.rotation.y = yaw + Math.sin(clock * c.turnSpeed * 2) * 0.45 * Math.min(1, c.turnSpeed * 3);
      const fg = this._figureState;
      fg.clock = clock;
      const breathRate = c.breathRate * (1 + 1.5 * shown);
      fg.breath = this._calm ? 0 : c.breathDepth * Math.sin(this.age * breathRate);
      fg.raise = c.armRaise * (this._exposed ? 1 : shown);
      fg.swell = this._exposed ? smooth(since / whiteT) : 0;
      fg.absorb = this._exposed ? shown * (1 - smooth(since / whiteT)) : shown;
      fg.white = this._exposed ? smooth(since / whiteT) * (1 - 0.7 * burnAway) : 0;
      fg.dissolve = burnAway;
      fg.fade = smooth(form * 3);
      this.figureMaterial.userData.sync(fg);
    }

    // 2 · the halo, then the shards
    this._syncShards(H, form, since, fade, clock);

    // 3 · the streamers
    const rs = this._ribbonState;
    rs.clock = clock;
    rs.power = this._exposed ? 1 - clamp(since / 0.2) : this._formed ? smooth(form * 1.5) * (0.35 + 0.65 * shown) : 0;
    this.streamers.visible = rs.power > 0.002;
    if (this.streamers.visible) {
      this.streamers.scale.set(lure, H, lure);
      this.streamers.rotation.y = -clock * c.streamerSpin;
      this.streamerMaterial.userData.sync(rs);
    }

    // 4 · the tethers
    const ts = this._tetherState;
    ts.clock = clock;
    ts.power = this._exposed ? 1 - clamp(since / 0.18) : this._formed ? 1 : 0;
    this.tethers.visible = ts.power > 0.002 && this._markCount > 0;
    if (this.tethers.visible) {
      const u = this.tetherMaterial.uniforms;
      this._heartPoint(_heart);
      for (let i = 0; i < MAX_MARKS; i++) {
        const m = this._marks[i];
        let live = 0;
        if (i < this._markCount) {
          live = clamp((this.impactTime - m.at) / 0.25);
          if (m.dummy ? m.dummy.alive === false : !m.seen) live = 0;
          u.uFrom.value[i].set(m.x, 1.05, m.z);
          u.uTo.value[i].copy(_heart);
        }
        u.uLive.value[i] = live;
      }
      this.tetherMaterial.userData.sync(ts);
    }

    // 6 · the packet: at the hand while it winds up, then on the line
    const hold = c.chargeTime * life;
    this.packet.visible = travel;
    if (travel) {
      const wind = smooth(this.age / Math.max(0.02, hold));
      this.packet.position.copy(this.position).addScaledVector(this.direction, 0.6 * (1 - this.u)).setY(c.packetHeight);
      const s = c.packetSize * (0.3 + 0.7 * wind);
      this.packet.scale.set(s * 0.8, s * 0.8, s * (1 + 1.2 * this.u * wind));
      this.packet.rotation.set(0, Math.atan2(this.direction.x, this.direction.z), clock * 9);
      const ps = this._packetState;
      ps.clock = clock;
      ps.power = 1;
      this.packetMaterial.userData.sync(ps);
    }

    // 7 · the flare: hand, packet, formation, overexposure
    const fl = this._flareState;
    const flareT = Math.max(0.05, c.flareTime * life);
    let size = 0;
    if (travel) {
      fl.power = this.age < hold ? 0.8 * smooth(this.age / Math.max(0.02, hold)) : 0.45;
      size = c.flareSize * (this.age < hold ? 0.55 : 0.45);
      this.flare.position.copy(this.packet.position);
    } else {
      const formFlare = this._formed ? (1 - clamp(this.impactTime / flareT)) * 0.8 : 0;
      const exposeFlare = this._exposed ? 1 - clamp(since / flareT) : 0;
      fl.power = Math.max(formFlare, exposeFlare * 1.2);
      size = c.flareSize * (exposeFlare > formFlare ? 1.3 : 0.7);
      this._heartPoint(this.flare.position);
    }
    fl.rot = clock * 0.4;
    this.flare.visible = fl.power > 0.002;
    this.flare.scale.setScalar(Math.max(0.01, size));
    this.flareMaterial.userData.sync(fl);

    // 9 · the warp
    const ws = this._warpState;
    ws.pull = this._drinking ? shown * smooth(form * 2) : 0;
    ws.shock = this._exposed && since < 0.6 ? (1 - since / 0.6) * fade : 0;
    ws.wave = Easing.outCubic(this._exposed ? clamp(since / 0.6) : 0);
    ws.clock = clock;
    this.warp.visible = !this._calm && (ws.pull * c.warpPull + ws.shock * c.warpShock) * g.distortion > 0.002;
    if (this.warp.visible) {
      this.warp.scale.set(lure * 2.2, lure * 2.2, 1);
      this.warpMaterial.userData.sync(ws);
    }

    this._syncParticles();
  }

  /**
   * The halo turns behind the head while the decoy drinks; at the
   * overexposure every shard is thrown out of the body on a ballistic arc
   * (solved in closed form from `since`, so no state is integrated), lands,
   * and lies cooling; on the exit they shrink into the print.
   */
  _syncShards(H, form, since, fade, clock) {
    const c = this.config;
    const halo = Math.min(MAX_HALO, Math.max(0, Math.round(c.haloCount)));
    const yaw = Math.atan2(-this.direction.x, -this.direction.z);
    const back = -0.12 * H;
    const size = c.shardSize;
    let shown = 0;
    for (let i = 0; i < MAX_SHARDS; i++) {
      const d = i * DICE;
      let scale = 0;
      if (!this._exposed) {
        if (this._formed && i < halo) {
          const a = (i / Math.max(1, halo)) * TAU + clock * c.haloSpin;
          const hr = c.haloRadius * H;
          // A ring in the figure's own vertical plane, behind the hood.
          const lx = Math.cos(a) * hr;
          const ly = H * 0.9 + Math.sin(a) * hr;
          scratch.position.set(Math.cos(yaw) * lx + Math.sin(yaw) * back, ly, -Math.sin(yaw) * lx + Math.cos(yaw) * back);
          scratch.rotation.set(0, yaw, a - Math.PI / 2);
          scale = size * (0.7 + 0.5 * this._dice[d + 4]) * smooth(form * 1.5);
        }
      } else {
        // Thrown from a point on the body.
        const bearing = this._dice[d] * TAU;
        const y0 = H * (0.15 + 0.8 * this._dice[d + 1]);
        const r0 = H * 0.16;
        const vh = c.shardSpeed * (0.55 + 0.9 * this._dice[d + 2]);
        const vy = c.shardLift * (0.35 + 0.9 * this._dice[d + 3]);
        const gr = Math.max(0.1, c.shardGravity);
        const rest = size * 0.2;
        // Lands when y0 + vy·t − ½g·t² = rest.
        const land = (vy + Math.sqrt(vy * vy + 2 * gr * Math.max(0, y0 - rest))) / gr;
        const t = Math.min(Math.max(0, since), land);
        const reach = r0 + vh * t;
        const y = Math.max(rest, y0 + vy * t - 0.5 * gr * t * t);
        scratch.position.set(Math.cos(bearing) * reach, y - (1 - fade) * size * 0.6, Math.sin(bearing) * reach);
        const tumble = c.shardSpin * t;
        scratch.rotation.set(tumble * (0.5 + this._dice[d + 2]), bearing, since < land ? tumble : Math.PI / 2 + this._dice[d + 4]);
        scale = size * (0.6 + 0.7 * this._dice[d + 4]) * fade;
      }
      if (scale > 0) shown++;
      scratch.scale.setScalar(Math.max(1e-4, scale));
      scratch.updateMatrix();
      this.shards.setMatrixAt(i, scratch.matrix);
    }
    this.shards.instanceMatrix.needsUpdate = true;
    this.shards.visible = shown > 0;
    this._shardState.heat = this._exposed ? 1 - 0.85 * clamp(since / 1.2) : 1;
    this.shardMaterial.userData.sync(this._shardState);
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._unsubscribe();
    this._releaseBodies(0);
    this._scope = null;
    this._drinking = false;
    this._exposed = false;
    this._formed = false;
    this.root.visible = false;
    this.packet.visible = false;
    this.flare.visible = false;
    this.tethers.visible = false;
    this.warp.visible = false;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._unsubscribe();
    for (const r of this.resources) r.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

/**
 * Every key, by folder: [key, min, max, step, label]. Colour keys take only
 * [key, label]. `buildEditor` walks this table, and the test checks it covers
 * the whole settings block.
 */
export const EDITOR = [
  ['The cast', [
    ['range', 2, 40, 0.1, 'max range'],
    ['minRange', 0, 12, 0.1, 'min range'],
    ['speed', 4, 80, 0.5, 'packet flies at (m/s)'],
    ['lifetime', 0.5, 8, 0.05, 'nominal lifetime (s)'],
    ['cooldown', 0, 15, 0.05, 'cooldown'],
    ['castAnim'],
    ['zoneRadius', 1, 8, 0.1, 'strike radius (m)'],
    ['lureRadius', 1, 14, 0.1, 'exposes enemies within (m)'],
  ]],
  ['The decoy (gameplay)', [
    ['absorbTime', 0.2, 4, 0.05, 'drinks for (s)'],
    ['markInterval', 0.02, 0.5, 0.01, 'looks for enemies every (s)'],
    ['maxMarks', 0, MAX_MARKS, 1, 'most enemies exposed'],
    ['chargePerMark', 0, 1, 0.01, 'charge per exposure'],
    ['chargePerHit', 0, 1, 0.01, 'charge per soaked hit'],
    ['maxSoaked', 0, MAX_SOAKED, 1, 'most hits soaked'],
    ['baseDamage', 0, 5, 0.1, 'damage'],
    ['bonusDamage', 0, 5, 0.1, 'extra damage at full charge'],
    ['hitImpulse', 0, 24, 0.5, 'knockback'],
    ['hitLift', 0, 20, 0.1, 'lift'],
    ['hitSpin', 0, 8, 0.05, 'tumble'],
    ['chargeForce', 0, 2, 0.01, 'extra force at full charge (×)'],
    ['statusSeconds', 0, 10, 0.1, 'light status lasts (s)'],
    ['bodyPull', 0, 1, 0.01, 'corpse pull'],
    ['bodyBuoyancy', 0, 1, 0.01, 'corpse lift'],
    ['bodyThrow', 0, 20, 0.1, 'corpse throw (m/s)'],
  ]],
  ['Timing', [
    ['chargeTime', 0, 1, 0.01, 'wind-up at the hand (s)'],
    ['formTime', 0.02, 1.5, 0.01, 'rises over (s)'],
    ['exposureLinger', 0.1, 3, 0.05, 'aftermath lasts (s)'],
    ['shatterTime', 0.05, 2, 0.01, 'burns away over (s)'],
    ['fadeTime', 0.1, 2, 0.05, 'print fades over (s)'],
  ]],
  ['Light', [
    ['lightColor', 'colour'],
    ['lightIntensity', 0, 30, 0.1, 'intensity'],
    ['lightRadius', 1, 40, 0.1, 'radius'],
    ['formLight', 0, 20, 0.1, 'punch when it forms'],
    ['exposureLight', 0, 40, 0.1, 'punch at overexposure'],
    ['absorbDim', 0, 1, 0.01, 'light drunk at full charge'],
  ]],
  ['Palette', [
    ['coreColor', 'core'],
    ['tintColor', 'tint'],
    ['bodyColor', 'body'],
    ['deepColor', 'deep'],
  ]],
  ['1 · The figure', [
    ['figureHeight', 0.3, 2, 0.01, 'height (× radius)'],
    ['figureWidth', 0.5, 2, 0.01, 'width'],
    ['bodyGlow', 0, 3, 0.01, 'body glow'],
    ['bodyOpacity', 0, 1, 0.01, 'body opacity'],
    ['rimGlow', 0, 8, 0.05, 'rim glow'],
    ['rimPower', 0.5, 6, 0.05, 'rim sharpness'],
    ['prismSplit', 0, 3, 0.01, 'prismatic fringe'],
    ['umbraStrength', 0, 1, 0.01, 'core darkness'],
    ['flowBands', 0, 8, 0.05, 'bands'],
    ['flowSpeed', 0, 4, 0.05, 'band speed'],
    ['breathDepth', 0, 0.2, 0.005, 'breath'],
    ['breathRate', 0, 8, 0.05, 'breath rate'],
    ['swayAmount', 0, 0.3, 0.005, 'sway'],
    ['robeRipple', 0, 0.3, 0.005, 'hem ripple'],
    ['armRaise', 0, 1.6, 0.01, 'arm lift (rad)'],
    ['turnSpeed', 0, 2, 0.01, 'turn'],
    ['whiteOut', 0.02, 1, 0.01, 'white-out (s)'],
  ]],
  ['2 · Halo & shards', [
    ['haloCount', 0, MAX_HALO, 1, 'halo shards'],
    ['haloRadius', 0, 0.6, 0.01, 'halo radius (× height)'],
    ['haloSpin', -4, 4, 0.05, 'halo spin'],
    ['shardSize', 0.05, 1, 0.01, 'shard size (m)'],
    ['shardSpeed', 0, 15, 0.1, 'thrown out (m/s)'],
    ['shardLift', 0, 12, 0.1, 'thrown up (m/s)'],
    ['shardGravity', 1, 40, 0.5, 'gravity'],
    ['shardSpin', 0, 20, 0.1, 'tumble'],
    ['shardGlow', 0, 8, 0.05, 'glow'],
    ['shardMetalness', 0, 1, 0.01, 'metalness'],
    ['shardRoughness', 0, 1, 0.01, 'roughness'],
  ]],
  ['3 · Streamers', [
    ['streamerGlow', 0, 6, 0.05, 'glow'],
    ['streamerWidth', 0.01, 0.5, 0.005, 'height (m)'],
    ['streamerSpeed', 0, 5, 0.05, 'speed'],
    ['streamerDashes', 1, 12, 1, 'dashes'],
    ['streamerSpin', -3, 3, 0.05, 'spiral turn'],
    ['streamerOpacity', 0, 1, 0.01, 'opacity'],
  ]],
  ['4 · Tethers', [
    ['tetherGlow', 0, 6, 0.05, 'glow'],
    ['tetherWidth', 0.01, 0.6, 0.005, 'width (m)'],
    ['tetherArc', 0, 3, 0.01, 'arc'],
    ['tetherSpeed', 0, 6, 0.05, 'pulse speed'],
  ]],
  ['5 · The floor', [
    ['fieldGlow', 0, 4, 0.05, 'glow'],
    ['fieldOpacity', 0, 1, 0.01, 'opacity'],
    ['telegraphGlow', 0, 4, 0.05, 'strike circle'],
    ['rayCount', 4, 64, 1, 'rays'],
    ['raySpeed', 0, 3, 0.05, 'ray speed'],
    ['umbraRadius', 0, 1.2, 0.01, 'umbra (× radius)'],
    ['burnGlow', 0, 5, 0.05, 'sun-print glow'],
    ['burnCool', 0.1, 4, 0.05, 'print cools over (s)'],
    ['dissolveTime', 0.05, 1, 0.01, 'dissolves over (× fade)'],
  ]],
  ['6 · The packet', [
    ['packetSize', 0.1, 2, 0.01, 'size (m)'],
    ['packetHeight', 0.2, 3, 0.01, 'height (m)'],
    ['packetGlow', 0, 8, 0.05, 'glow'],
    ['trailRate', 0, 300, 1, 'trail sparks/s'],
    ['trailSize', 0.01, 0.4, 0.005, 'trail size'],
    ['trailLife', 0.05, 2, 0.01, 'trail life (s)'],
  ]],
  ['7 · The flare', [
    ['flareSize', 0, 8, 0.05, 'size (m)'],
    ['flareStretch', 1, 8, 0.05, 'anamorphic streak'],
    ['flareGlow', 0, 8, 0.05, 'glow'],
    ['flareTime', 0.05, 2, 0.01, 'decays over (s)'],
  ]],
  ['8 · Particles', [
    ['moteRate', 0, 300, 1, 'motes/s'],
    ['moteSize', 0.01, 0.4, 0.005, 'mote size'],
    ['moteLife', 0.1, 3, 0.01, 'mote life (s)'],
    ['moteGlow', 0, 6, 0.05, 'particle glow'],
    ['sparkCount', 0, 160, 1, 'overexposure sparks'],
    ['sparkSize', 0.01, 0.4, 0.005, 'spark size'],
    ['sparkLife', 0.05, 2, 0.01, 'spark life (s)'],
    ['sparkSpeed', 0, 30, 0.1, 'spark speed'],
    ['glintCount', 0, 160, 1, 'glints'],
    ['glintSize', 0.01, 0.5, 0.005, 'glint size'],
    ['glintLife', 0.05, 3, 0.01, 'glint life (s)'],
    ['glintSpeed', 0, 15, 0.1, 'glint speed'],
    ['colorSpark'],
  ]],
  ['9 · Impacts', [
    ['formShake', 0, 1, 0.01, 'knock when it forms'],
    ['exposureShake', 0, 1, 0.01, 'knock at overexposure'],
    ['shakeDecay', 0.5, 20, 0.1, 'knock decay'],
    ['shakeFrequency', 1, 40, 0.5, 'knock frequency'],
    ['formFlash', 0, 1, 0.01, 'flash when it forms'],
    ['exposureFlash', 0, 1, 0.01, 'flash at overexposure'],
    ['burstReach', 0, 2.5, 0.01, 'shell grows to (× radius)'],
    ['burstLife', 0.05, 3, 0.01, 'shell lives (s)'],
    ['burstIntensity', 0, 3, 0.01, 'shell brightness'],
    ['burstOpacity', 0, 1, 0.01, 'shell opacity'],
    ['burstFresnel', 0, 6, 0.05, 'shell rim'],
    ['burstSquash', 0.05, 1.5, 0.01, 'shell squash'],
    ['colorBurstA', 'shell inner'],
    ['colorBurstB', 'shell mid'],
    ['colorBurstC', 'shell outer'],
    ['decalLife', 0.1, 6, 0.05, 'decals last (s)'],
    ['scorchIntensity', 0, 3, 0.01, 'scorch'],
    ['shockwaveWidth', 0.01, 0.4, 0.005, 'shockwave width'],
    ['shockwaveIntensity', 0, 3, 0.01, 'shockwave brightness'],
  ]],
  ['10 · The warp', [
    ['warpPull', 0, 3, 0.01, 'inward pull'],
    ['warpShock', 0, 3, 0.01, 'pressure ring'],
  ]],
];

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
  const folder = gui.addFolder('☼  Photon Doppel');
  for (const [title, rows] of EDITOR) {
    const f = sub(folder, title);
    for (const row of rows) {
      const [key] = row;
      if (key === 'castAnim') castAnim(f, c);
      else if (key === 'colorSpark') gradient(f, c, 'colorSpark', 'particle gradient');
      else if (row.length === 2) color(f, c, key, row[1]);
      else R(f, c, key, row[1], row[2], row[3], row[4]);
    }
  }
  return folder;
}
