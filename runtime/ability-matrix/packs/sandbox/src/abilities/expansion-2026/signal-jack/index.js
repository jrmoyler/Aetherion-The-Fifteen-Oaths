import { Color, Group, Mesh, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { routeExpansionTransparency, ParticleShape } from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import {
  createCableGeometry,
  createClawGeometry,
  createDishGeometry,
  createMastGeometry,
  createPlugGeometry,
  createQuad,
  createSleeve,
  createSpikeGeometry,
} from './geometry.js';
import {
  createAccentMaterial,
  createBoltMaterial,
  createCableMaterial,
  createFieldMaterial,
  createHaloMaterial,
  createLensMaterial,
  createMetalMaterial,
  createSheathMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
const UID = 'matrix-expansion/signal-jack';

const TAU = Math.PI * 2;
/** Enemies one spike can cable. */
const MAX_JACKS = 4;
/** Claw legs. */
const MAX_LEGS = 6;
/** Bodies a single query may return. */
const MAX_FOUND = 32;
/** Folded claw angle (rad): pointing up along the spike. */
const FOLD = 1.95;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const span = (t, a, d) => clamp01((t - a) / Math.max(1e-3, d));

const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _p = new Vector3();
const _t = new Vector3();
const _n = new Vector3();
const _bn = new Vector3();
const _v = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _emit = { position: new Vector3(), radius: 0, direction: new Vector3(0, 1, 0), speed: 1, speedVariance: 0.4, spread: 0.6, size: 0.1, sizeVariance: 0.4, life: 1, lifeVariance: 0.3, spin: 0, time: 0 };
const RAMP = [new Color(), new Color(), new Color(), new Color()];
const METAL = [new Color(), new Color(), new Color(), new Color()];
const _overloadCfg = { hitImpulse: 0, hitLift: 0, hitSpin: 0 };

/**
 * SIGNAL JACK — Tech, zone cast. *Hostile deployable takeover.*
 *
 * The sandbox has no enemy deployables to steal, so the cast makes the
 * enemies themselves into ours: the dummies are the hostile hardware, and the
 * jack turns them on each other.
 *
 * ## Beats
 *
 *  1. **Anticipation + travel.** A landing reticle closes on the floor while
 *     a machined jack spike is thrown from the hand, tip first, drilling about
 *     its axis along a closed-form arc (its pose at any `u` is analytic) and
 *     shedding sparks.
 *  2. **Impact (plant).** It drives the last `driveDepth` into the floor in
 *     `driveTime`, rights itself, and the floor cracks; sparks, metal chips
 *     and dust are thrown, the camera knocks, a pressure ring runs out. The
 *     claw legs spring from folded to planted (outBack) and bite; their hinge
 *     height is *derived* (0.42 × reach) so the tips land on the floor at any
 *     `zoneRadius`. The mast telescopes, the jammer dish unfolds and sweeps;
 *     the intrusion field's circuit traces race out to the rim.
 *  3. **The jack.** At `jackAt` the dish stops on the nearest enemy and up to
 *     `maxJacks` armoured cables whip from the head to the nearest bodies in
 *     the circle (staggered), sagging on a quadratic catenary, and plug into
 *     their backs. Each jacked body lights a scan sheath and a takeover halo;
 *     bus routes light across the floor to it.
 *  4. **Linger (the turn).** The dish slews from body to body; data packets
 *     run down the cables; the cables sway. On its own clock each jacked
 *     body fires a turncoat bolt into the nearest enemy *that is not jacked*
 *     (within `turnRange`, possibly outside the circle), throwing it away from
 *     the traitor; the claws kick on every bolt.
 *  5. **Overload, then exit.** At `overloadAt` a white front runs down every
 *     cable, the jacked bodies are blown off their feet away from the spike,
 *     an EMP ring and a STORM shell run out. Then the cables reel home off the
 *     falling bodies, the dish folds, the mast drops, the claws fold up and
 *     the spike sinks back into the floor while the field dissolves.
 *
 * ## Layers
 *   1. jack spike — helical-thread lathe (`createSpikeGeometry`), lit
 *      gunmetal with signal seams (`createMetalMaterial`), WORLD, shadows.
 *   2. claws — extruded hooked outlines (`createClawGeometry`), same metal.
 *   3. mast + jammer dish + feed — lathe dish, anodised tubes, accent eye.
 *   4. cables — CPU-swept tubes along a catenary, armoured rubber with data
 *      packets (`createCableMaterial`); lathe jack plugs at the tips.
 *   5. possession — scan sheath + hex halo on each jacked body.
 *   6. turncoat bolts — additive volume beams (`createBoltMaterial`).
 *   7. intrusion field — deep footprint + circuit traces + routes + reticle
 *      + EMP ring (`createFieldMaterial`).
 *   8. particles — STREAK sparks, lit CHIP metal, lit SMOKE dust, SOFT data
 *      motes rising off the cables.
 *   9. plant/overload — CRACK, SCORCH, DUSTRING, SHOCKWAVE, ARC decals, AIR
 *      and STORM shells, flash, knock, light punches.
 *  10. lens — heat shimmer at the spike and EMP rings, `LAYER.DISTORTION`.
 *
 * ## Records
 * A jack record keeps who it holds (id / dummy) and where it stood when it
 * was cabled, plus whom it chose to fire at; every metre, second and colour
 * is resolved from `settings.signalJack` each frame.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return 3 + MAX_LEGS + MAX_JACKS * 5;
  }

  get impactDuration() {
    const c = this.config;
    return Math.max(0.5, (c.overloadAt + c.overloadHold) * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.2, this.config.exitTime * settings.global.lifetime);
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

    this.metal = own(createMetalMaterial());
    this.dark = own(createMetalMaterial({ dark: true, seams: false }));
    this.accent = own(createAccentMaterial());

    // 1 · the spike (its own group: flies, drives, sinks)
    this.spike = new Group();
    this.root.add(this.spike);
    this.spikeMesh = new Mesh(own(createSpikeGeometry({ pitch: config.settings.threadPitch })), this.metal);
    this.spikeMesh.castShadow = this.spikeMesh.receiveShadow = true;
    this.spike.add(this.spikeMesh);

    // 2 · claws on hinge pivots
    const claw = own(createClawGeometry());
    this.legs = [];
    for (let i = 0; i < MAX_LEGS; i++) {
      const pivot = new Group();
      const mesh = new Mesh(claw, this.metal);
      mesh.castShadow = mesh.receiveShadow = true;
      pivot.add(mesh);
      this.spike.add(pivot);
      this.legs.push(pivot);
    }

    // 3 · mast, head, dish, feed
    this.mastLow = new Mesh(own(createMastGeometry(0.11, 0.1)), this.dark);
    this.mastHigh = new Mesh(own(createMastGeometry(0.075, 0.065)), this.metal);
    this.mastLow.castShadow = this.mastHigh.castShadow = true;
    this.spike.add(this.mastLow, this.mastHigh);
    this.head = new Group();
    this.spike.add(this.head);
    this.collar = new Mesh(own(new TorusGeometry(0.22, 0.06, 8, 20)), this.dark);
    this.collar.rotation.x = Math.PI / 2;
    this.collar.castShadow = true;
    this.head.add(this.collar);
    this.dishPivot = new Group();
    this.head.add(this.dishPivot);
    this.dish = new Mesh(own(createDishGeometry()), this.metal);
    this.dish.castShadow = true;
    this.dishPivot.add(this.dish);
    this.feed = new Mesh(own(createMastGeometry(0.03, 0.02)), this.dark);
    this.dishPivot.add(this.feed);
    this.eye = new Mesh(own(new SphereGeometry(1, 16, 12)), this.accent);
    this.dishPivot.add(this.eye);

    // 4 · cables, plugs  5 · possession  6 · bolts
    this.cableMat = own(createCableMaterial());
    const plugGeo = own(createPlugGeometry());
    const ringGeo = own(new TorusGeometry(0.1, 0.022, 6, 16));
    const sleeve = own(createSleeve());
    const quad = own(createQuad());
    const boltGeo = own(createSleeve(12).translate(0, 0.5, 0));
    this.sheathMat = [];
    this.haloMat = [];
    this.boltMat = [];
    this.jacks = [];
    for (let i = 0; i < MAX_JACKS; i++) {
      const cable = new Mesh(own(createCableGeometry(40, 8)), this.cableMat);
      cable.frustumCulled = false;
      cable.castShadow = true;
      this.root.add(cable);
      const plug = new Group();
      const plugMesh = new Mesh(plugGeo, this.metal);
      plugMesh.castShadow = true;
      const plugRing = new Mesh(ringGeo, this.accent);
      plugRing.rotation.x = Math.PI / 2;
      plugRing.position.y = 0.1;
      plug.add(plugMesh, plugRing);
      this.root.add(plug);
      const sm = own(createSheathMaterial());
      const sheath = new Mesh(sleeve, sm);
      sheath.renderOrder = 6;
      this.root.add(sheath);
      const hm = own(createHaloMaterial());
      const halo = new Mesh(quad, hm);
      halo.rotation.x = -Math.PI / 2;
      halo.renderOrder = 7;
      this.root.add(halo);
      const bm = own(createBoltMaterial());
      const bolt = new Mesh(boltGeo, bm);
      bolt.frustumCulled = false;
      bolt.renderOrder = 8;
      this.root.add(bolt);
      this.sheathMat.push(sm);
      this.haloMat.push(hm);
      this.boltMat.push(bm);
      this.jacks.push({
        cable, plug, sheath, halo, bolt,
        id: null, dummy: null, x: 0, z: 0,
        victimId: null, victimDummy: null, vx: 0, vz: 0, hasVictim: false, chosen: false, struck: false,
        sx: 0, sy: 0, sz: 0, tx: 0, ty: 0, tz: 0,
        cableState: { phase: 0, front: -1, reach: 1, fade: 1 },
      });
    }
    // Cable materials are shared; the per-jack front is the max of them.
    this._cableState = { phase: 0, front: -1, reach: 1, fade: 1 };

    // 7 · field  10 · lens
    this.fieldMat = own(createFieldMaterial());
    this.field = new Mesh(quad, this.fieldMat);
    this.field.rotation.x = -Math.PI / 2;
    this.field.position.y = 0.03;
    this.field.renderOrder = 2;
    this.root.add(this.field);
    this.lensMat = own(createLensMaterial());
    this.lens = new Mesh(quad, this.lensMat);
    this.lens.rotation.x = -Math.PI / 2;
    this.lens.position.y = 0.4;
    this.root.add(this.lens);

    this._found = [];
    this._actors = [];
    this._fieldState = { x: 0, z: 0, radius: 1, spread: 0, reticle: 0, ring: -1, clock: 0, fade: 1, dissolve: 0, targets: [], count: 0 };
    for (let i = 0; i < MAX_JACKS; i++) this._fieldState.targets.push({ x: 0, z: 0, power: 0, hot: 0 });
    this._metalState = { pulse: 0, fade: 1 };
    this._accentState = { power: 0, fade: 1 };
    this._possState = { power: 0, scan: 0, hot: 0, spin: 0 };
    this._boltState = { power: 0, travel: 0, clock: 0 };
    this._lensState = { hum: 0, shock: 0, wave: 0, clock: 0 };
    this._force = { impulse: 0, lift: 0, spin: 0 };

    routeExpansionTransparency(this.group);
    this.lens.layers.set(LAYER.DISTORTION);
    this.root.visible = false;
    this._disposed = false;
  }

  createParticles() {
    const get = (name, opts) => this.ctx.particles?.get?.(`expansion.signal-jack.${name}`, opts) ?? null;
    this.sparks = get('sparks', { capacity: 900, shape: ParticleShape.STREAK, additive: true, stretch: true, softFade: 0.3 });
    this.chips = get('chips', { capacity: 400, shape: ParticleShape.CHIP, additive: false, lit: true, softFade: 0.2 });
    this.dust = get('dust', { capacity: 240, shape: ParticleShape.SMOKE, additive: false, lit: true, curl: true, softFade: 0.5 });
    this.motes = get('motes', { capacity: 500, shape: ParticleShape.SOFT, additive: true, curl: true, softFade: 0.3 });
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this._calm = prefersReducedMotion();
    this._planted = false;
    this._jacked = false;
    this._overloaded = false;
    this._jackCount = 0;
    this._hits = 0;
    this._kick = -10;
    this._headYaw = 0;
    this._trailT = 0;
    this._moteT = 0;
    this._clock = 0;
    for (const j of this.jacks) this._resetJack(j);
    this.root.visible = true;
    this._sync(0);
  }

  _resetJack(j) {
    j.id = null;
    j.dummy = null;
    j.victimId = null;
    j.victimDummy = null;
    j.hasVictim = false;
    j.chosen = false;
    j.struck = false;
    j.cable.visible = j.plug.visible = j.sheath.visible = j.halo.visible = j.bolt.visible = false;
  }

  onTravel(dt) {
    this._sync(dt);
  }

  onImpact() {
    this.position.y = 0;
    this._plant();
    this._sync(0);
  }

  onFade(dt) {
    const c = this.config;
    const L = settings.global.lifetime;
    const t = this.impactTime;
    if (this.phase === 'impact') {
      if (!this._jacked && t >= c.jackAt * L) this._jack();
      if (this._jacked && !this._overloaded) {
        for (let i = 0; i < this._jackCount; i++) {
          const j = this.jacks[i];
          const fireAt = (c.turnAt + i * c.turnStagger) * L;
          if (!j.chosen && t >= fireAt && fireAt < c.overloadAt * L) this._choose(j);
          if (j.hasVictim && !j.struck && t >= fireAt + c.boltLife * 0.25 * L) this._strike(j);
        }
      }
      if (!this._overloaded && t >= c.overloadAt * L) this._overload();
    }
    this._sync(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Gameplay                                                            */
  /* ------------------------------------------------------------------ */

  /** Cable the nearest enemies in the circle (≤ maxJacks). */
  _jack() {
    this._jacked = true;
    const c = this.config;
    const cap = Math.max(0, Math.min(MAX_JACKS, Math.floor(c.maxJacks)));
    const px = this.position.x,
      pz = this.position.z,
      R = c.zoneRadius;
    let n = 0;
    if (this._scope) {
      const found = this._scope.queryActors({ position: [px, 0, pz], radius: R, relation: 'enemy' });
      if (!found.ok) this.failure = found.reason;
      else {
        const list = this._sortActors(found.actors, px, pz);
        for (let i = 0; i < list.length && n < cap; i++) {
          const j = this.jacks[n++];
          j.id = list[i].id;
          j.x = list[i].position[0];
          j.z = list[i].position[2];
          j.dummy = this._dummyAt(j.x, j.z);
        }
        list.length = 0;
      }
    } else {
      const field = this.ctx.dummies;
      if (field?.findTargets) {
        const found = field.findTargets(px, pz, R, this._found);
        for (let i = 0; i < found.length && i < MAX_FOUND && n < cap; i++) {
          const d = found[i];
          if (!d || d.alive === false) continue;
          if (Math.hypot(d.position.x - px, d.position.z - pz) > R) continue;
          const j = this.jacks[n++];
          j.id = null;
          j.dummy = d;
          j.x = d.position.x;
          j.z = d.position.z;
        }
        this._found.length = 0;
      }
    }
    this._jackCount = n;
    if (n && this._scope && !this._scope.standalone) {
      // The takeover as a status: the jacked are stunned by our signal.
      const ids = [];
      for (let i = 0; i < n; i++) if (this.jacks[i].id) ids.push(this.jacks[i].id);
      const rate = Number.isFinite(this._scope.tickRate) ? this._scope.tickRate : 30;
      if (ids.length) {
        const sent = this._scope.emit({
          type: 'status', element: 'tech', targetIds: ids, position: [px, 0, pz], intensity: 1,
          durationTicks: Math.max(1, Math.round((c.overloadAt - c.jackAt) * settings.global.lifetime * rate)),
          tags: ['signal-jack', 'jacked'],
        });
        if (!sent.ok) this.failure = sent.reason;
      }
    }
  }

  _sortActors(actors, x, z) {
    const list = this._actors;
    list.length = 0;
    for (const a of actors) if (a && a.alive !== false && Array.isArray(a.position)) list.push(a);
    list.sort((a, b) => Math.hypot(a.position[0] - x, a.position[2] - z) - Math.hypot(b.position[0] - x, b.position[2] - z) || (a.id < b.id ? -1 : 1));
    return list;
  }

  /** A standing dummy at an actor's position, for visuals only. */
  _dummyAt(x, z) {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return null;
    const found = field.findTargets(x, z, 0.6, this._found);
    const d = found[0] ?? null;
    this._found.length = 0;
    return d;
  }

  _isJacked(id, dummy) {
    for (let i = 0; i < this._jackCount; i++) {
      const j = this.jacks[i];
      if ((id !== null && j.id === id) || (dummy && j.dummy === dummy)) return true;
    }
    return false;
  }

  _isClaimed(id, dummy) {
    for (let i = 0; i < this._jackCount; i++) {
      const j = this.jacks[i];
      if (!j.hasVictim) continue;
      if ((id !== null && j.victimId === id) || (dummy && j.victimDummy === dummy)) return true;
    }
    return false;
  }

  /** A jacked body picks the nearest enemy that is neither jacked nor already chosen. */
  _choose(j) {
    j.chosen = true;
    const c = this.config;
    if (j.dummy && j.dummy.alive === false) return; // knocked down before its turn
    const jx = j.dummy?.position?.x ?? j.x,
      jz = j.dummy?.position?.z ?? j.z;
    j.x = jx;
    j.z = jz;
    if (this._scope) {
      const found = this._scope.queryActors({ position: [jx, 0, jz], radius: c.turnRange, relation: 'enemy' });
      if (!found.ok) {
        this.failure = found.reason;
        return;
      }
      const list = this._sortActors(found.actors, jx, jz);
      for (const a of list) {
        if (a.id === j.id || this._isJacked(a.id, null) || this._isClaimed(a.id, null)) continue;
        j.victimId = a.id;
        j.vx = a.position[0];
        j.vz = a.position[2];
        j.victimDummy = this._dummyAt(j.vx, j.vz);
        j.hasVictim = true;
        break;
      }
      list.length = 0;
    } else {
      const field = this.ctx.dummies;
      if (!field?.findTargets) return;
      const found = field.findTargets(jx, jz, c.turnRange, this._found);
      for (let i = 0; i < found.length && i < MAX_FOUND; i++) {
        const d = found[i];
        if (!d || d.alive === false || d === j.dummy || this._isJacked(null, d) || this._isClaimed(null, d)) continue;
        if (Math.hypot(d.position.x - jx, d.position.z - jz) > c.turnRange) continue;
        j.victimDummy = d;
        j.victimId = null;
        j.vx = d.position.x;
        j.vz = d.position.z;
        j.hasVictim = true;
        break;
      }
      this._found.length = 0;
    }
    if (j.hasVictim) {
      this._kick = this.impactTime;
      this.lightBoost += c.turnLight * settings.global.explosionIntensity;
      _p.set(jx, c.jackHeight, jz);
      this._burst(this.sparks, _p, 14, c.sparkSize, c.sparkLife * 0.6, c.sparkSpeed * 0.5, 0.8, 0.15);
    }
  }

  /** The turncoat bolt lands: the victim is thrown away from the traitor. */
  _strike(j) {
    j.struck = true;
    const c = this.config;
    let dx = j.vx - j.x,
      dz = j.vz - j.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) {
      dx = this.direction.x;
      dz = this.direction.z;
    } else {
      dx /= len;
      dz /= len;
    }
    const force = impactForce(c, settings.global.explosionIntensity);
    if (this._scope) {
      if (j.victimId !== null) {
        const sent = this._scope.emit({
          type: 'hit', element: 'tech', targetIds: [j.victimId],
          position: [j.vx, 0, j.vz], sourcePosition: [j.x, 0, j.z],
          damage: c.turnDamage, hitForce: force, tags: ['signal-jack', 'turncoat'],
        });
        if (sent.ok) this._hits++;
        else this.failure = sent.reason;
      }
    } else if (j.victimDummy && j.victimDummy.alive !== false) {
      this._force.impulse = force.impulse;
      this._force.lift = force.lift;
      this._force.spin = force.spin;
      if (j.victimDummy.kill(dx, dz, this._force)) this._hits++;
    }
    _p.set(j.vx, 1.2, j.vz);
    this._burst(this.sparks, _p, 24, c.sparkSize, c.sparkLife, c.sparkSpeed * 0.6, 0.9, 0.2);
    _p.setY(0.02);
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _p, {
      radius: 0.9, life: c.decalLife * 0.6, intensity: 0.8, colorA: getColor(c.colorBody), colorB: getColor(c.colorDeep),
    });
    if (c.plantShake > 0) this.ctx.shake?.add?.(c.plantShake * 0.35 * settings.global.explosionIntensity * settings.global.cameraShake, c.shakeDecay, c.shakeFrequency);
  }

  /** The signal overloads: every jacked body is blown away from the spike. */
  _overload() {
    this._overloaded = true;
    const c = this.config;
    const g = settings.global;
    const px = this.position.x,
      pz = this.position.z;
    _overloadCfg.hitImpulse = c.overloadImpulse;
    _overloadCfg.hitLift = c.overloadLift;
    _overloadCfg.hitSpin = c.overloadSpin;
    const force = impactForce(_overloadCfg, settings.global.explosionIntensity);
    for (let i = 0; i < this._jackCount; i++) {
      const j = this.jacks[i];
      const x = j.dummy?.position?.x ?? j.x,
        z = j.dummy?.position?.z ?? j.z;
      let dx = x - px,
        dz = z - pz;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) {
        dx = this.direction.x;
        dz = this.direction.z;
      } else {
        dx /= len;
        dz /= len;
      }
      if (this._scope) {
        if (j.id === null) continue;
        const sent = this._scope.emit({
          type: 'hit', element: 'tech', targetIds: [j.id], position: [x, 0, z], sourcePosition: [px, 0, pz],
          damage: c.overloadDamage, hitForce: force, tags: ['signal-jack', 'overload'],
        });
        if (sent.ok) this._hits++;
        else if (!/defeated/.test(sent.reason ?? '')) this.failure = sent.reason;
      } else if (j.dummy && j.dummy.alive !== false) {
        this._force.impulse = force.impulse;
        this._force.lift = force.lift;
        this._force.spin = force.spin;
        if (j.dummy.kill(dx, dz, this._force)) this._hits++;
      }
      _p.set(x, 0.02, z);
      this.ctx.decals?.spawn?.(DecalType.ARC, _p, { radius: 1.2, life: c.decalLife * 0.5, intensity: 1, colorA: getColor(c.colorTint), colorB: getColor(c.colorBody) });
      _p.setY(c.jackHeight);
      this._burst(this.sparks, _p, 30, c.sparkSize, c.sparkLife, c.sparkSpeed * 0.7, 1, 0.3);
      this._burst(this.chips, _p, 8, c.chipSize * 0.7, c.chipLife, c.chipSpeed * 0.6, 0.9, 0.2);
    }
    // EMP
    const power = g.explosionIntensity;
    _p.set(px, 1.2, pz);
    this.ctx.bursts?.spawn?.(BurstMode.STORM, _p, {
      radius: 0.3, endRadius: c.zoneRadius * c.burstReach * power, life: c.burstLife, intensity: 1,
      opacity: c.burstOpacity * g.opacity, fresnel: 2, squash: 0.55,
      colorA: getColor(c.colorCore), colorB: getColor(c.colorTint), colorC: getColor(c.colorBody),
    });
    _p.setY(0.03);
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _p, { radius: c.zoneRadius * 1.1 * power, life: 0.7, width: 0.06, intensity: 1.2, colorA: getColor(c.colorCore), colorB: getColor(c.colorBody) });
    this.lightBoost += c.overloadLight * power;
    if (c.overloadShake > 0) this.ctx.shake?.add?.(c.overloadShake * power * g.cameraShake, c.shakeDecay, c.shakeFrequency);
    if (c.overloadFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorTint), c.overloadFlash * power);
  }

  /** The plant: crack, chips, dust, knock, flash, pressure ring. */
  _plant() {
    this._planted = true;
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    _p.copy(this.position).setY(0.02);
    this.ctx.decals?.spawn?.(DecalType.CRACK, _p, { radius: c.crackRadius, life: c.decalLife, intensity: 1, colorA: getColor(c.colorTint), colorB: getColor(c.colorBody) });
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _p, { radius: c.crackRadius * 0.9, life: c.decalLife, intensity: 0.7, colorA: getColor(c.colorBody), colorB: getColor(c.colorDeep) });
    this.ctx.decals?.spawn?.(DecalType.DUSTRING, _p, { radius: c.zoneRadius * 0.7, life: 1.2, intensity: 0.7, colorA: getColor(c.colorChipA), colorB: getColor(c.colorChipC) });
    _p.setY(0.2);
    this.ctx.bursts?.spawn?.(BurstMode.AIR, _p, {
      radius: 0.2, endRadius: c.crackRadius * 1.6 * power, life: 0.35, intensity: 0.8, opacity: 0.5 * g.opacity, fresnel: 2, squash: 0.35,
      colorA: getColor(c.colorCore), colorB: getColor(c.colorTint), colorC: getColor(c.colorBody),
    });
    this._burst(this.sparks, _p, c.sparkCount, c.sparkSize, c.sparkLife, c.sparkSpeed, 0.7, 0.2);
    this._burst(this.chips, _p, c.chipCount, c.chipSize, c.chipLife, c.chipSpeed, 0.75, 0.3);
    this._burst(this.dust, _p, c.dustCount, c.dustSize, c.dustLife, 1.6, 1, 0.6);
    this.lightBoost += c.plantLight * power;
    if (c.plantShake > 0) this.ctx.shake?.add?.(c.plantShake * power * g.cameraShake, c.shakeDecay, c.shakeFrequency);
    if (c.plantFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorTint), c.plantFlash * power);
  }

  _burst(system, pos, count, size, life, speed, spread, radius) {
    if (!system?.emit) return;
    const g = settings.global;
    const n = Math.min(160, Math.max(0, Math.round(count * g.particleCount)));
    if (!n) return;
    _emit.position.copy(pos);
    _emit.direction.copy(UP);
    _emit.radius = radius;
    _emit.speed = speed * g.particleSpeed;
    _emit.spread = spread;
    _emit.size = size * g.particleSize;
    _emit.life = life * g.particleLifetime;
    _emit.spin = 3;
    _emit.time = frame.uTime.value;
    system.emit(n, _emit);
  }

  /* ------------------------------------------------------------------ */
  /* Presentation                                                        */
  /* ------------------------------------------------------------------ */

  /** Point a jacked (or victim) body is plugged at / shot from. */
  _bodyPoint(dummy, x, z, height, out) {
    if (dummy) {
      if (dummy.alive !== false && dummy.position) return out.set(dummy.position.x, height, dummy.position.z);
      if (dummy.bodyPoint?.(out)) return out;
      if (dummy.position) return out.set(dummy.position.x, Math.min(height, 0.4), dummy.position.z);
    }
    return out.set(x, height, z);
  }

  _syncParticles() {
    const c = this.config;
    const g = settings.global;
    RAMP[0].copy(getColor(c.colorCore));
    RAMP[1].copy(getColor(c.colorTint));
    RAMP[2].copy(getColor(c.colorBody));
    RAMP[3].copy(getColor(c.colorDeep));
    METAL[0].copy(getColor(c.colorChipA));
    METAL[1].copy(getColor(c.colorChipB));
    METAL[2].copy(getColor(c.colorChipC));
    METAL[3].copy(getColor(c.colorChipD));
    this._sysLook(this.sparks, RAMP, 2.2 * g.glow, -9, 0.97);
    this._sysLook(this.motes, RAMP, 1.6 * g.glow, 0.6, 0.94);
    this._sysLook(this.chips, METAL, 1, -13, 0.985);
    this._sysLook(this.dust, METAL, 1, 0.25, 0.9);
  }

  _sysLook(sys, colors, glow, gravity, drag) {
    if (!sys?.uniforms) return;
    const g = settings.global;
    sys.setGradient?.(colors[0], colors[1], colors[2], colors[3]);
    const u = sys.uniforms;
    if (u.uGlow) u.uGlow.value = glow;
    if (u.uOpacity) u.uOpacity.value = g.opacity;
    if (u.uTurbulence) u.uTurbulence.value = 0.4 * g.turbulence;
    if (u.uGravity) u.uGravity.value.y = gravity;
    if (u.uDrag) u.uDrag.value = drag;
    if (u.uSizeScale) u.uSizeScale.value = g.particleSize;
    if (u.uSpeedScale) u.uSpeedScale.value = g.particleSpeed;
    if (u.uLifeScale) u.uLifeScale.value = g.particleLifetime;
  }

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const L = g.lifetime;
    const R = c.zoneRadius;
    if (!this._calm) this._clock += dt * g.animationSpeed;
    const clock = this._clock;
    const travelling = this.phase === 'travel';
    const t = travelling ? 0 : this.impactTime; // seconds since the plant (holds through the exit)
    const fadeT = this.phase === 'fade' ? clamp01(this.fadeTime / this.fadeDuration) : 0;
    const exitS = this.phase === 'fade' ? this.fadeTime : 0; // seconds into the exit
    const px = this.position.x,
      pz = this.position.z;
    const s = c.spikeHeight / 2.3;
    const girth = s * c.spikeGirth;

    this.root.position.set(0, 0, 0);

    // ---- 1 · the spike: flight, drive, stand, sink ----
    const sp = this.spike;
    if (travelling) {
      const u = clamp01(this.u);
      const h0 = c.throwHeight,
        h1 = c.driveDepth;
      const y = h0 + (h1 - h0) * u + c.throwArc * 4 * u * (1 - u);
      const dy = h1 - h0 + c.throwArc * 4 * (1 - 2 * u);
      _v.copy(this.direction).multiplyScalar(this.length).setY(dy).normalize();
      _q.setFromUnitVectors(DOWN, _v);
      _q2.setFromAxisAngle(UP, this._calm ? 0 : this.age * c.drillSpin);
      sp.quaternion.copy(_q).multiply(_q2);
      sp.position.set(px, y, pz);
      sp.scale.setScalar(Math.max(0.01, c.throwScale + (1 - c.throwScale) * Easing.inQuad(u)));
      // Sparks shed off the drill along the throw.
      this._trailT += dt * c.trailRate * g.particleCount;
      const n = Math.floor(this._trailT);
      if (n > 0 && this.sparks?.emit) {
        this._trailT -= n;
        _emit.position.copy(sp.position);
        _emit.direction.copy(_v).negate();
        _emit.radius = 0.12;
        _emit.speed = 2 * g.particleSpeed;
        _emit.spread = 0.5;
        _emit.size = c.sparkSize * 0.8 * g.particleSize;
        _emit.life = c.sparkLife * 0.6 * g.particleLifetime;
        _emit.spin = 0;
        _emit.time = frame.uTime.value;
        this.sparks.emit(Math.min(n, 12), _emit);
      }
    } else {
      // The drive: from driveDepth to 0 in driveTime, righting from the flight pose.
      const drive = Easing.inQuad(span(t, 0, c.driveTime * L));
      _v.copy(this.direction).multiplyScalar(this.length).setY(c.driveDepth - c.throwHeight - c.throwArc * 4).normalize();
      _q.setFromUnitVectors(DOWN, _v);
      _q2.identity();
      sp.quaternion.copy(_q).slerp(_q2, drive);
      const sink = Easing.inCubic(span(exitS, (c.exitTime - c.sinkTime) * L, c.sinkTime * L));
      sp.position.set(px, c.driveDepth * (1 - drive) - sink * (c.spikeHeight + c.mastLift + 0.6), pz);
      sp.scale.setScalar(1);
    }
    this.spikeMesh.scale.set(girth, s, girth);

    // ---- 2 · claws: derived hinge so the tips land on the floor ----
    const reach = Math.max(0.2, c.legShare * R);
    const hingeY = 0.42 * reach;
    const nLegs = Math.max(0, Math.min(MAX_LEGS, Math.round(c.legCount)));
    const deploy = travelling ? 0 : Easing.outBack(span(t, 0.03 * L, c.legDeploy * L));
    const fold = Easing.inOutCubic(span(exitS, (c.exitTime - c.sinkTime - c.foldTime) * L, c.foldTime * L));
    const kickAge = this.impactTime - this._kick;
    const kick = this.phase === 'impact' && kickAge >= 0 && kickAge < 0.4 ? Math.sin(Math.min(1, kickAge / 0.4) * Math.PI) : 0;
    const legBase = Math.atan2(this.direction.x, this.direction.z) + Math.PI / 4;
    for (let i = 0; i < MAX_LEGS; i++) {
      const leg = this.legs[i];
      leg.visible = i < nLegs;
      if (!leg.visible) continue;
      const b = legBase + (i * TAU) / Math.max(1, nLegs);
      leg.position.set(Math.cos(b) * 0.24 * girth, hingeY, -Math.sin(b) * 0.24 * girth);
      leg.rotation.set(0, b, FOLD * (1 - deploy) + FOLD * fold - c.legFlex * kick, 'YXZ');
      leg.children[0].scale.set(reach, reach, c.legThick);
    }

    // ---- 3 · mast and dish ----
    const mastUp = travelling ? 0 : Easing.outCubic(span(t, 0.12 * L, c.mastTime * L)) * (1 - Easing.inCubic(span(exitS, 0.1 * L, c.exitTime * 0.35 * L)));
    const socket = 2.25 * s;
    const lift = c.mastLift * mastUp;
    this.mastLow.position.set(0, socket - 0.25, 0);
    this.mastLow.scale.set(girth, 0.35 + lift * 0.55, girth);
    this.mastHigh.position.set(0, socket - 0.2 + lift * 0.45, 0);
    this.mastHigh.scale.set(girth, 0.4 + lift * 0.55, girth);
    const headY = socket + 0.2 + lift;
    this.head.position.set(0, headY, 0);
    const unfold = travelling ? 0 : Easing.outBack(span(t, 0.22 * L, 0.3 * L)) * (1 - Easing.inCubic(span(exitS, 0.05 * L, c.exitTime * 0.3 * L)));
    const dishR = c.dishSize * Math.max(0.001, unfold);
    this.dish.scale.set(dishR, dishR * 0.9, dishR);
    this.feed.scale.set(1, c.dishSize * 0.55 * unfold, 1);
    this.eye.position.set(0, c.dishSize * 0.55 * unfold + 0.04, 0);
    this.eye.scale.setScalar(0.07 * Math.max(0.001, unfold));
    this.collar.scale.setScalar(girth);
    // Head yaw: sweep before the jack, then slew toward the body whose turn it is.
    let aimYaw = this._headYaw;
    if (!travelling) {
      if (!this._jacked) aimYaw = this._calm ? aimYaw : this._headYaw + dt * c.scanSpin;
      else if (this._jackCount) {
        let k = 0;
        for (let i = 0; i < this._jackCount; i++) if (t >= (c.turnAt + i * c.turnStagger - 0.25) * L) k = i;
        const j = this.jacks[k];
        const want = Math.atan2(j.x - px, j.z - pz);
        let d = want - this._headYaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        aimYaw = this._headYaw + d * (this._calm ? 1 : 1 - Math.exp(-c.slewRate * dt));
      }
    }
    this._headYaw = aimYaw;
    this.dishPivot.rotation.set(-c.dishPitch * unfold, aimYaw, 0, 'YXZ');

    // ---- metal + accent glow ----
    const running = !travelling && !this._overloaded && this.phase === 'impact';
    const pulse = this._calm ? 0.6 : 0.5 + 0.5 * Math.sin(clock * (this._jacked ? 11 : 6));
    const ms = this._metalState;
    ms.pulse = this._overloaded ? 0.15 : pulse;
    ms.fade = (1 - fadeT) * (this._overloaded ? 0.35 : 1);
    this.metal.userData.sync(ms);
    this.dark.userData.sync(ms);
    const as = this._accentState;
    const overloadAge = this._overloaded ? this.impactTime + exitS - c.overloadAt * L : -1;
    as.power = (running ? 0.4 + 0.6 * pulse : 0.2) + (overloadAge >= 0 ? Math.max(0, 1 - overloadAge * 3) * 2 : 0);
    as.fade = 1 - fadeT;
    this.accent.userData.sync(as);

    // ---- 4/5/6 · cables, possession, bolts ----
    const portR = 0.24 * girth;
    const cs = this._cableState;
    cs.phase = this._calm ? 0 : clock * c.pulseRate;
    cs.front = overloadAge >= 0 && overloadAge < 0.5 ? overloadAge / 0.35 : -1;
    cs.reach = 1;
    cs.fade = 1;
    let maxReach = 0;
    const fs = this._fieldState;
    fs.count = 0;
    const reel = 1 - Easing.inCubic(span(exitS, 0, c.reelTime * L));
    for (let i = 0; i < MAX_JACKS; i++) {
      const j = this.jacks[i];
      const active = i < this._jackCount && !travelling;
      if (!active) {
        j.cable.visible = j.plug.visible = j.sheath.visible = j.halo.visible = j.bolt.visible = false;
        continue;
      }
      const t0 = (c.jackAt + i * c.cableStagger) * L;
      const ext = Easing.outCubic(span(t, t0, c.cableTime * L)) * reel;
      // Anchor at the head, on the side facing the body.
      this._bodyPoint(j.dummy, j.x, j.z, c.jackHeight, _b);
      const bearing = Math.atan2(_b.x - px, _b.z - pz);
      _a.set(px + Math.sin(bearing) * portR, sp.position.y + headY - 0.05, pz + Math.cos(bearing) * portR);
      // Plug into the back: offset toward the spike.
      _t.set(px - _b.x, 0, pz - _b.z);
      const dl = _t.length();
      if (dl > 1e-4) _b.addScaledVector(_t, 0.18 / dl);
      const len = _a.distanceTo(_b);
      maxReach = Math.max(maxReach, len * ext);
      // Control point: sag below the chord, lash sideways while flying, idle sway.
      _c.addVectors(_a, _b).multiplyScalar(0.5);
      _n.set(-(_b.z - _a.z), 0, _b.x - _a.x);
      if (_n.lengthSq() > 1e-8) _n.normalize();
      const fly = 1 - span(t, t0, c.cableTime * L);
      const lash = this._calm ? 0 : c.cableWhip * Math.sin(Math.PI * ext) * fly;
      const sway = this._calm ? 0 : c.cableSway * Math.sin(clock * c.swayRate + i * 2.1);
      _c.y -= 2 * c.cableSag * Math.min(1, len / 4);
      _c.addScaledVector(_n, lash + sway);
      j.cable.visible = ext > 0.002;
      if (j.cable.visible) this._sweepCable(j.cable.geometry, _a, _c, _b, ext, c.cableRadius);
      // The plug at the tip, along the tangent.
      const te = Math.max(0.001, ext);
      this._bezier(_a, _c, _b, te, _p);
      this._bezierTangent(_a, _c, _b, te, _t);
      j.plug.visible = ext > 0.02;
      j.plug.position.copy(_p);
      j.plug.quaternion.setFromUnitVectors(DOWN, _t.normalize());
      j.plug.scale.setScalar(1.2);
      const plugged = ext >= 0.999 * reel && span(t, t0, c.cableTime * L) >= 1;
      if (plugged && !j._sparked) {
        j._sparked = true;
        this._burst(this.sparks, _p, 18, c.sparkSize, c.sparkLife * 0.7, c.sparkSpeed * 0.45, 0.9, 0.1);
      }
      if (!plugged && t < t0) j._sparked = false;
      // Data motes off the cable while it carries signal.
      if (plugged && running && this.motes?.emit && dt > 0) {
        this._moteT += dt * c.moteRate * g.particleCount / Math.max(1, this._jackCount);
        const m = Math.floor(this._moteT);
        if (m > 0) {
          this._moteT -= m;
          this._bezier(_a, _c, _b, ((clock * 0.37 + i * 0.29) % 1), _emit.position);
          _emit.direction.copy(UP);
          _emit.radius = 0.08;
          _emit.speed = 0.5 * g.particleSpeed;
          _emit.spread = 0.6;
          _emit.size = c.moteSize * g.particleSize;
          _emit.life = c.moteLife * g.particleLifetime;
          _emit.spin = 0;
          _emit.time = frame.uTime.value;
          this.motes.emit(Math.min(m, 6), _emit);
        }
      }

      // Possession on the body.
      const hold = span(t, t0 + c.cableTime * L, 0.15 * L);
      const blown = overloadAge >= 0 ? Math.max(0, 1 - overloadAge / 0.3) : 1;
      const power = hold * (overloadAge >= 0 ? blown : 1) * (1 - fadeT);
      const alive = !j.dummy || j.dummy.alive !== false || overloadAge >= 0;
      const ps = this._possState;
      ps.power = alive ? power : power * 0.3;
      ps.scan = this._calm ? 0.5 : (clock * c.scanRate + i * 0.33) % 1;
      ps.hot = overloadAge >= 0 ? blown * 1.5 : 0;
      ps.spin = this._calm ? 0 : clock * c.haloSpin + i;
      j.sheath.visible = ps.power > 0.003;
      if (j.sheath.visible) {
        this._bodyPoint(j.dummy, j.x, j.z, 0, _p);
        const fallen = j.dummy && j.dummy.alive === false;
        j.sheath.position.set(_p.x, fallen ? Math.max(0.1, _p.y - 0.2) : c.sheathHeight * 0.5, _p.z);
        const swell = 1 + (overloadAge >= 0 ? (1 - blown) * 0.8 : 0);
        j.sheath.scale.set(c.sheathRadius * swell, fallen ? 0.6 : c.sheathHeight, c.sheathRadius * swell);
        this.sheathMat[i].userData.sync(ps);
      }
      j.halo.visible = j.sheath.visible && !(j.dummy && j.dummy.alive === false && overloadAge < 0);
      if (j.halo.visible) {
        j.halo.position.set(j.sheath.position.x, c.haloHeight + (overloadAge >= 0 ? (1 - blown) * 0.8 : 0), j.sheath.position.z);
        const hs = c.haloSize * 2 * (0.4 + 0.6 * hold) * (overloadAge >= 0 ? 1 + (1 - blown) : 1);
        j.halo.scale.set(hs, hs, 1);
        this.haloMat[i].userData.sync(ps);
      }

      // Turncoat bolt.
      const fireAt = (c.turnAt + i * c.turnStagger) * L;
      const bt = (t - fireAt) / Math.max(0.02, c.boltLife * L);
      j.bolt.visible = j.hasVictim && bt >= 0 && bt < 1 && this.phase === 'impact';
      if (j.bolt.visible) {
        _p.set(j.x, c.jackHeight + 0.1, j.z);
        this._bodyPoint(j.struck ? j.victimDummy : null, j.vx, j.vz, 1.15, _v);
        if (!j.struck) _v.set(j.vx, 1.15, j.vz);
        _t.subVectors(_v, _p);
        const bl = Math.max(0.05, _t.length());
        j.bolt.position.copy(_p);
        j.bolt.quaternion.setFromUnitVectors(UP, _t.multiplyScalar(1 / bl));
        const w = c.boltWidth * (1 + 0.6 * Math.max(0, 1 - bt * 4));
        j.bolt.scale.set(w, bl, w);
        const bs = this._boltState;
        bs.travel = Math.min(1, bt * 4);
        bs.power = 1 - Easing.inQuad(bt);
        bs.clock = clock;
        this.boltMat[i].userData.sync(bs);
      }

      // Floor route.
      const ft = fs.targets[fs.count++];
      ft.x = _b.x;
      ft.z = _b.z;
      ft.power = ext * (1 - fadeT);
      ft.hot = overloadAge >= 0 ? blown : bt >= 0 && bt < 1 ? 1 - bt : 0;
    }
    cs.reach = Math.max(1, maxReach);
    this.cableMat.userData.sync(cs);

    // ---- 7 · the field ----
    fs.x = px;
    fs.z = pz;
    fs.radius = R * c.fieldReach;
    fs.spread = travelling ? 0 : Easing.outCubic(span(t, 0.05 * L, c.fieldSpread * L));
    fs.reticle = travelling ? Easing.outCubic(clamp01(this.u * 1.4)) : Math.max(0, 1 - t * 6);
    fs.ring = overloadAge >= 0 && overloadAge < 0.6 ? overloadAge / 0.6 : -1;
    fs.clock = this._calm ? 0 : clock;
    fs.fade = (travelling ? 0.55 : 1) * g.opacity;
    fs.dissolve = fadeT;
    this.field.position.set(px, 0.03, pz);
    this.field.scale.set(fs.radius * 2, fs.radius * 2, 1);
    this.fieldMat.userData.sync(fs);

    // ---- 10 · the lens ----
    const ls = this._lensState;
    const plantWave = !travelling && t < 0.45 * L ? t / (0.45 * L) : -1;
    ls.hum = running ? 1 : 0;
    ls.shock = overloadAge >= 0 && overloadAge < 0.6 ? 1 - overloadAge / 0.6 : plantWave >= 0 ? (1 - plantWave) * 0.6 : 0;
    ls.wave = overloadAge >= 0 && overloadAge < 0.6 ? Easing.outCubic(overloadAge / 0.6) : plantWave >= 0 ? Easing.outCubic(plantWave) * 0.5 : 0;
    ls.clock = clock;
    this.lens.visible = !this._calm && !travelling && (ls.hum * c.lensHum + ls.shock * c.lensStrength) * g.distortion > 0.002;
    if (this.lens.visible) {
      this.lens.position.set(px, 0.4, pz);
      this.lens.scale.set(R * 2.4, R * 2.4, 1);
      this.lensMat.userData.sync(ls);
    }

    this._syncParticles();
  }

  _bezier(a, c, b, u, out) {
    const k = 1 - u;
    return out.set(
      k * k * a.x + 2 * k * u * c.x + u * u * b.x,
      k * k * a.y + 2 * k * u * c.y + u * u * b.y,
      k * k * a.z + 2 * k * u * c.z + u * u * b.z,
    );
  }

  _bezierTangent(a, c, b, u, out) {
    const k = 1 - u;
    out.set(
      2 * k * (c.x - a.x) + 2 * u * (b.x - c.x),
      2 * k * (c.y - a.y) + 2 * u * (b.y - c.y),
      2 * k * (c.z - a.z) + 2 * u * (b.z - c.z),
    );
    if (out.lengthSq() < 1e-10) out.set(0, -1, 0);
    return out;
  }

  /** Rewrite a cable tube along the quadratic curve up to `ext`. */
  _sweepCable(geo, a, c, b, ext, radius) {
    const rings = geo.userData.rings,
      sides = geo.userData.sides;
    const pos = geo.attributes.position.array,
      nor = geo.attributes.normal.array;
    for (let j = 0; j <= rings; j++) {
      const u = (j / rings) * ext;
      this._bezier(a, c, b, u, _p);
      this._bezierTangent(a, c, b, u, _t).normalize();
      _n.crossVectors(_t, UP);
      if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0);
      _n.normalize();
      _bn.crossVectors(_n, _t).normalize();
      // Armour collars swell the radius every ~0.2 m.
      const r = radius * (1 + 0.18 * Math.max(0, Math.sin(j * 1.9)));
      for (let i = 0; i <= sides; i++) {
        const th = (i / sides) * TAU;
        const cx = Math.cos(th),
          sx = Math.sin(th);
        const nx = _n.x * cx + _bn.x * sx,
          ny = _n.y * cx + _bn.y * sx,
          nz = _n.z * cx + _bn.z * sx;
        const k = (j * (sides + 1) + i) * 3;
        pos[k] = _p.x + nx * r;
        pos[k + 1] = _p.y + ny * r;
        pos[k + 2] = _p.z + nz * r;
        nor[k] = nx;
        nor[k + 1] = ny;
        nor[k + 2] = nz;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._scope = null;
    this.root.visible = false;
    this.lens.visible = false;
    this._jackCount = 0;
    this._jacked = this._overloaded = this._planted = false;
    for (const j of this.jacks) this._resetJack(j);
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
  const castAnim = (f, c) => (Editor?.castAnimation ? Editor.castAnimation(f, c) : f.add(c, 'castAnim', CAST_ANIMATIONS));
  return { R, sub, color, castAnim };
}

/** Folder → keys. Ranges: [min, max, step]; colours are detected. */
const EDITOR = [
  ['The cast', { range: [2, 40, 0.1], minRange: [0, 12, 0.1], speed: [4, 80, 0.5], cooldown: [0, 20, 0.1], zoneRadius: [1, 10, 0.1], lifetime: [0.5, 10, 0.05] }],
  ['The takeover', {
    maxJacks: [0, MAX_JACKS, 1], jackAt: [0.05, 2, 0.01], cableStagger: [0, 0.5, 0.01], cableTime: [0.05, 1, 0.01],
    turnAt: [0.2, 3, 0.01], turnStagger: [0, 1, 0.01], turnRange: [0.5, 15, 0.1], turnDamage: [0, 5, 0.05],
    overloadAt: [0.5, 5, 0.01], overloadHold: [0.05, 2, 0.01], overloadDamage: [0, 5, 0.05],
    hitImpulse: [0, 24, 0.5], hitLift: [0, 20, 0.1], hitSpin: [0, 8, 0.05],
    overloadImpulse: [0, 24, 0.5], overloadLift: [0, 20, 0.1], overloadSpin: [0, 8, 0.05],
  }],
  ['Light', { lightColor: 0, lightIntensity: [0, 30, 0.1], lightRadius: [1, 40, 0.1], plantLight: [0, 20, 0.1], turnLight: [0, 20, 0.1], overloadLight: [0, 30, 0.1] }],
  ['Palette & metal', {
    colorCore: 0, colorTint: 0, colorBody: 0, colorDeep: 0, metalColor: 0, metalDark: 0,
    metalness: [0, 1, 0.01], roughness: [0, 1, 0.01], seamGlow: [0, 8, 0.05], seamWidth: [0.005, 0.4, 0.005], seamSpacing: [0.5, 12, 0.1],
  }],
  ['1 · The spike', {
    spikeHeight: [0.8, 5, 0.05], spikeGirth: [0.4, 2.5, 0.01], threadPitch: [0.05, 0.5, 0.005], throwHeight: [0.2, 4, 0.05], throwArc: [0, 6, 0.05],
    throwScale: [0.1, 1, 0.01], drillSpin: [0, 60, 0.5], driveDepth: [0, 3, 0.01], driveTime: [0.02, 0.5, 0.005], trailRate: [0, 300, 1],
  }],
  ['2 · The claws', { legCount: [0, MAX_LEGS, 1], legShare: [0.1, 0.6, 0.01], legThick: [0.3, 3, 0.05], legDeploy: [0.05, 1, 0.01], legFlex: [0, 0.4, 0.005] }],
  ['3 · Mast & dish', { mastLift: [0, 3, 0.05], mastTime: [0.05, 1, 0.01], dishSize: [0.2, 2, 0.01], dishPitch: [0, 1.5, 0.01], scanSpin: [0, 30, 0.1], slewRate: [0.5, 40, 0.1] }],
  ['4 · The cables', {
    cableRadius: [0.01, 0.2, 0.005], cableSag: [0, 2, 0.01], cableWhip: [0, 3, 0.01], cableSway: [0, 0.6, 0.005], swayRate: [0, 10, 0.05],
    pulseRate: [0, 10, 0.05], pulseGlow: [0, 10, 0.05], reelTime: [0.05, 1, 0.01], jackHeight: [0.3, 2, 0.01],
  }],
  ['5 · Possession', { sheathRadius: [0.2, 1.5, 0.01], sheathHeight: [0.5, 3, 0.05], sheathGlow: [0, 6, 0.05], scanRate: [0, 6, 0.05], haloHeight: [0.5, 4, 0.05], haloSize: [0.1, 1.5, 0.01], haloSpin: [0, 10, 0.05] }],
  ['6 · Turncoat bolt', { boltWidth: [0.02, 0.5, 0.005], boltLife: [0.05, 1.5, 0.01], boltGlow: [0, 10, 0.05] }],
  ['7 · Intrusion field', { fieldReach: [0.5, 1.6, 0.01], fieldSpread: [0.05, 2, 0.01], traceCell: [0.1, 1.5, 0.01], traceGlow: [0, 6, 0.05], deepOpacity: [0, 1, 0.01], reticleGlow: [0, 6, 0.05], routeGlow: [0, 8, 0.05] }],
  ['8 · Particles', {
    sparkCount: [0, 160, 1], sparkSize: [0.01, 0.4, 0.005], sparkLife: [0.05, 2, 0.01], sparkSpeed: [0, 20, 0.1],
    chipCount: [0, 160, 1], chipSize: [0.02, 0.5, 0.005], chipLife: [0.1, 3, 0.01], chipSpeed: [0, 15, 0.1],
    dustCount: [0, 120, 1], dustSize: [0.1, 3, 0.05], dustLife: [0.1, 4, 0.05],
    moteRate: [0, 120, 1], moteSize: [0.01, 0.3, 0.005], moteLife: [0.1, 3, 0.05],
    colorChipA: 0, colorChipB: 0, colorChipC: 0, colorChipD: 0,
  }],
  ['9 · Plant & overload', {
    plantShake: [0, 1.5, 0.01], plantFlash: [0, 1, 0.01], overloadShake: [0, 1.5, 0.01], overloadFlash: [0, 1, 0.01],
    shakeDecay: [0.5, 20, 0.1], shakeFrequency: [1, 40, 0.5], crackRadius: [0.2, 5, 0.05], decalLife: [0.2, 12, 0.1],
    burstReach: [0, 2, 0.01], burstLife: [0.05, 2, 0.01], burstOpacity: [0, 1, 0.01], lensStrength: [0, 3, 0.01], lensHum: [0, 2, 0.01],
  }],
  ['10 · Exit', { foldTime: [0.05, 1.5, 0.01], sinkTime: [0.05, 1.5, 0.01], exitTime: [0.2, 3, 0.01] }],
];

export function buildEditor(gui, c, Editor) {
  const { R, sub, color, castAnim } = editorKit(Editor);
  const folder = gui.addFolder('⌁  Signal Jack');
  for (const [title, keys] of EDITOR) {
    const f = sub(folder, title);
    if (title === 'The cast') castAnim(f, c);
    for (const [key, spec] of Object.entries(keys)) {
      if (typeof c[key] === 'string') color(f, c, key, key);
      else R(f, c, key, spec[0], spec[1], spec[2], key);
    }
  }
  return folder;
}
