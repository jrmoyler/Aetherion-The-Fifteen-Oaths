import { Color, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { createExpansionFX, routeExpansionTransparency, ParticleShape } from '../ExpansionFX.js';
import { Ability as BaseAbility } from '../../Ability.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { CAST_ANIMATIONS, settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { Easing } from '../../../utils/math.js';
import { MAX_ARMS, armPoint, armRadius, armTangent } from './crown.js';
import {
  createArcGeometry,
  createAxonGeometry,
  createBoutonGeometry,
  createCrownGeometry,
  createQuad,
  createSheathGeometry,
  createSomaGeometry,
} from './geometry.js';
import {
  createArcMaterial,
  createAxonMaterial,
  createDendriteMaterial,
  createFieldMaterial,
  createLensMaterial,
  createSomaMaterial,
} from './materials.js';
import config from './config.js';

export { config };
export const ID = config.id;
export const UID = 'matrix-expansion/synaptic-override';

const TAU = Math.PI * 2;
/** Bodies one crown can seize (the combat bridge takes ≤ 8 targets per event). */
const MAX_SEIZED = 8;
/** Myelin segments per arm. */
const MAX_SHEATH = 5;
/** Height of the caster's hand, where the axon leaves (m). */
const HAND_Y = 1.1;

const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
/** Deterministic 0..1 hash: the only "dice" a cast rolls are integers fed here. */
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Shortest signed angle from a to b. */
const angleTo = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

const scratch = new Object3D();
const _p = new Vector3();
const _q = new Vector3();
const _t = new Vector3();
const _world = new Vector3();
const _dir = new Vector3();
const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);
/** Reused particle option bag (ParticleSystem.emit reads, never retains). */
const _emit = {
  position: new Vector3(),
  radius: 0,
  direction: new Vector3(0, 1, 0),
  speed: 0,
  speedVariance: 0.4,
  spread: 0.8,
  size: 0,
  sizeVariance: 0.4,
  life: 0,
  lifeVariance: 0.3,
  spin: 2,
  time: 0,
};

/**
 * SYNAPTIC OVERRIDE — Storm (lightning), zone cast.
 *
 * Lightning written as a *nerve impulse*: not a bolt from the sky but a
 * signal that travels, takes hold, and is re-routed.
 *
 * **Anticipation / travel.** A charge gathers at the caster's hand and an
 * axon — a beaded, meandering tube of plasma — drops from the hand to the
 * floor and crawls along it to the target at `speed`, a white-hot head
 * leading and nodes of Ranvier flickering down its length.
 *
 * **Impact.** The neuron fires. A soma heaves up out of the floor — a lumpy
 * plasma cell body with an axon hillock pulled toward the caster — and a
 * crown of `dendriteCount` insulated dendrites arcs out of it, each one
 * planting a synaptic terminal on the floor exactly at the zone's rim (see
 * the arc identity in `crown.js`). Storm shell, ARC burn and scorch, a light
 * punch, a knock.
 *
 * **Seize (the interrupt).** `seizeDelay` later the crown takes hold: every
 * enemy within `zoneRadius` (≤ `maxSeized`) gets the arm whose rest bearing is
 * nearest, which *swings* onto it and re-plants its terminal at its feet — arm
 * length re-derived from the body's distance, so it lands there at any radius.
 * A contact arc climbs each seized body. Through the combat binding this lays
 * the storm status on every seized actor: the interrupt.
 *
 * **Linger (the override listens).** For `overrideTime` the crown writhes
 * harder, action potentials run *in* along every seized arm and *out* along
 * the free ones, the soma beats, transmitter motes are drawn in from the rim,
 * sparks crackle off the arms and the burnt neural web on the floor pulses
 * inward. Identity in motion the whole way.
 *
 * **Diversion.** The signal is re-routed: each seized body is struck and
 * thrown *at the next seized body round the soma* — its own blow turned on
 * its neighbour, a bolt jumping between them to show it. A lone body has no
 * neighbour, so its blow is bent `divertAngle` off the radial. The crown
 * whips open (Θ < π: every arm rears up off the floor and flings out), the
 * potentials reverse, a shock ring and the storm shell run out, the camera
 * knocks.
 *
 * **Exit.** The crown retracts into the soma from the tips, the soma
 * collapses into its nucleus, and the floor web dissolves through noise.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the soma** (`createSomaMaterial`) — noise-heaved plasma cell body.
 *   2. **the dendrite crown** (`createDendriteMaterial`, `LAYER.SHAPED`) — the
 *      hero: arms and twigs bent from parameter space in the vertex stage, lit
 *      insulated membrane over a live core, travelling potentials; casts a
 *      real shadow through its matching depth material.
 *   3. **the sheath** — solid, lit myelin segments (lathe) and synaptic
 *      terminals (lathe) on `LAYER.WORLD`, placed on the bent arms by the JS
 *      mirror of the crown; they cast shadows.
 *   4. **the axon** (`createAxonMaterial`) — the travel beat.
 *   5. **the arcs** (`createArcMaterial`) — contact arcs climbing the seized
 *      bodies, diverted bolts between them.
 *   6. **the synaptic field** (`createFieldMaterial`) — scorch, neural web,
 *      arm traces, inward pulses, diversion ring; it stays for the linger.
 *   7. **particles** — STREAK sparks off the arms, SOFT transmitter motes.
 *   8. **plant and diversion** — STORM shells, SCORCH / ARC / SHOCKWAVE
 *      decals, flash, knock and light punch on both beats.
 *   9. **the lens** (`createLensMaterial`, `LAYER.DISTORTION`) — ionised
 *      crackle while listening, pressure rings at plant and diversion.
 *
 * ## Hits (`handlesOwnHits`)
 *
 * At most `maxSeized` (≤ 8, ≤ arm count) bodies are seized, once, at
 * `seizeDelay`; each seized body is hit exactly once, at `overrideTime`, and
 * nothing else is. The order is the bodies' bearing round the soma, so the
 * diversion is deterministic. Through the combat binding: one `status` event
 * (the interrupt) and one `hit` per body whose `sourcePosition` sits behind
 * it on the diverted line; without it, `dummy.kill` along that line.
 *
 * ## The editor rule
 *
 * A cast keeps only its seed, its seized bodies and two timestamps (seize,
 * diversion); every dimension, colour, count and timing is read from
 * `settings.synapticOverride` every frame.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return MAX_ARMS * MAX_SHEATH + MAX_ARMS + MAX_SEIZED;
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** When the diversion lands, seconds after the crown plants. Gameplay: unscaled. */
  _overrideAt() {
    const c = this.config;
    return Math.max(c.overrideTime, c.seizeDelay + 0.05);
  }

  get impactDuration() {
    return this._overrideAt() + Math.max(0.1, this.config.dischargeTail * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, this.config.exitTime * settings.global.lifetime);
  }

  /** Lightning stutters: the light jumps with the potentials. */
  lightShimmer() {
    const f = this.config.lightFlicker ?? 0.3;
    const k = Math.floor(this.age * 24);
    return 1 - f * hash(k + this._seed * 97) * (this._listen > 0 ? 1 : 0.5);
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

    // 6 · the synaptic field
    this.fieldMat = own(createFieldMaterial());
    this.field = new Mesh(quad, this.fieldMat);
    this.field.rotation.x = -Math.PI / 2;
    this.field.position.y = 0.03;
    this.field.renderOrder = 1;
    this.root.add(this.field);

    // 2 · the dendrite crown — the hero
    this.crownMat = own(createDendriteMaterial());
    own(this.crownMat.userData.depth);
    this.crown = new Mesh(own(createCrownGeometry()), this.crownMat);
    this.crown.customDepthMaterial = this.crownMat.userData.depth;
    this.crown.castShadow = true;
    this.crown.frustumCulled = false;
    this.root.add(this.crown);

    // 1 · the soma
    this.somaMat = own(createSomaMaterial());
    this.soma = new Mesh(own(createSomaGeometry()), this.somaMat);
    this.soma.frustumCulled = false;
    this.soma.renderOrder = 4;
    this.root.add(this.soma);

    // 3 · the sheath: solid, lit, shadowed
    this.sheathMat = own(new MeshStandardMaterial({
      color: 0x232c58, metalness: 0.55, roughness: 0.32, emissive: 0x2b46ff, emissiveIntensity: 0.55,
    }));
    this.sheath = new InstancedMesh(own(createSheathGeometry()), this.sheathMat, MAX_ARMS * MAX_SHEATH);
    this.sheath.castShadow = true;
    this.sheath.receiveShadow = true;
    this.sheath.frustumCulled = false;
    this.root.add(this.sheath);
    this.boutons = new InstancedMesh(own(createBoutonGeometry()), this.sheathMat, MAX_ARMS);
    this.boutons.castShadow = true;
    this.boutons.receiveShadow = true;
    this.boutons.frustumCulled = false;
    this.root.add(this.boutons);

    // 4 · the axon (world space: it runs from the caster to the target)
    this.axonMat = own(createAxonMaterial());
    this.axon = new Mesh(own(createAxonGeometry()), this.axonMat);
    this.axon.frustumCulled = false;
    this.axon.renderOrder = 3;
    this.group.add(this.axon);

    // 5 · contact and diversion arcs (world space)
    const arcGeometry = own(createArcGeometry());
    this.arcs = [];
    for (let i = 0; i < MAX_SEIZED; i++) {
      const arc = new Mesh(arcGeometry, own(createArcMaterial(0.13 + i * 0.37)));
      arc.frustumCulled = false;
      arc.visible = false;
      arc.renderOrder = 6;
      this.group.add(arc);
      this.arcs.push(arc);
    }

    // 9 · the lens
    this.lensMat = own(createLensMaterial());
    this.lens = new Mesh(quad, this.lensMat);
    this.lens.rotation.x = -Math.PI / 2;
    this.lens.position.y = 0.6;
    this.lens.visible = false;
    this.root.add(this.lens);

    routeExpansionTransparency(this.group);
    this.crown.layers.set(LAYER.SHAPED);
    this.lens.layers.set(LAYER.DISTORTION);

    // Gameplay records, allocated once.
    this._targets = [];
    for (let i = 0; i < MAX_SEIZED; i++) this._targets.push({ id: null, dummy: null, x: 0, z: 0, angle: 0, dist: 0, dx: 0, dz: 0, arm: -1 });
    this._armTarget = new Int8Array(MAX_ARMS).fill(-1);
    this._found = [];
    this._actors = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._sparkRate = new RateEmitter();
    this._moteRate = new RateEmitter();
    this._casts = 0;
    this._seed = 0;
    this._listen = 0;
    this._clock = 0;
    this._potential = 0;
    this._emitCounter = 0;

    // Per-frame state handed to the materials (allocated once).
    this._crownState = { energy: 1, potential: 0, clock: 0 };
    this._somaState = { clock: 0, beat: 0, flare: 0, fade: 1, hillock: new Vector3(0, 0, -1) };
    this._axonState = { start: new Vector3(), end: new Vector3(), head: 0, tail: 0, charge: 0, clock: 0, fade: 1 };
    this._arcState = { a: new Vector3(), b: new Vector3(), draw: 1, intensity: 0, clock: 0 };
    this._fieldState = { size: 4, clock: 0, energy: 0, listen: 0, potential: 0, ring: -1, dissolve: 0, fade: 1 };
    this._lensState = { crackle: 0, shock: 0, wave: 0, clock: 0 };
    this._crownMirror = { r0: 0.4, baseY: 0.3, writheFreq: 1.6, writheClock: 0 };
    this._ramp = [new Color(), new Color(), new Color(), new Color()];
    this._disposed = false;
  }

  createParticles() {
    const c = config.settings;
    const ramp = [c.colorSparkA, c.colorSparkB, c.colorSparkC, c.colorSparkD];
    this.sparks = createExpansionFX(this.ctx, 'synaptic-override.sparks', { shape: ParticleShape.STREAK, colors: ramp });
    this.motes = createExpansionFX(this.ctx, 'synaptic-override.motes', { shape: ParticleShape.SOFT, colors: ramp });
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this._casts++;
    this._seed = hash(this._casts * 7.31);
    this._seizedDone = false;
    this._discharged = false;
    this._seized = 0;
    this._hits = 0;
    this._dischargeAt = 0;
    this._listen = 0;
    this._clock = 0;
    this._potential = 0;
    this._emitCounter = 0;
    this._armTarget.fill(-1);
    for (const t of this._targets) {
      t.id = null;
      t.dummy = null;
      t.arm = -1;
    }
    this._sparkRate.reset();
    this._moteRate.reset();
    this._calm = prefersReducedMotion();
    this.root.visible = true;
    this.axon.visible = true;
    for (const arc of this.arcs) arc.visible = false;
    this._sync(0);
  }

  onTravel(dt) {
    // The charge at the hand: sparks gather while the axon leaves.
    if (this.u < 0.6) {
      const n = this._sparkRate.tick(dt, this.config.sparkRate * 0.6 * settings.global.particleCount);
      if (n > 0) {
        _p.set(this.origin.x, HAND_Y, this.origin.z).addScaledVector(this.direction, 0.35);
        this._emitSparks(_p, n, 0.18, 0.6);
      }
    }
    this._sync(dt);
  }

  onImpact() {
    this.position.y = 0;
    this._sparkRate.reset();
    this._plant();
    this._sync(0);
  }

  onFade(dt) {
    const c = this.config;
    if (this.phase === 'impact') {
      if (!this._seizedDone && this.impactTime >= c.seizeDelay) this._seize();
      if (!this._discharged && this.impactTime >= this._overrideAt()) this._discharge();
    }
    this._sync(dt);
    if (this.phase === 'impact' && !this._discharged) this._crackle(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Gameplay: seize (the interrupt) and the diversion                   */
  /* ------------------------------------------------------------------ */

  /** How many arms the crown grows now. */
  _armCount() {
    return Math.max(1, Math.min(MAX_ARMS, Math.round(this.config.dendriteCount)));
  }

  _restYaw(i, n) {
    return this._seed * TAU + (i * TAU) / n + (hash(i * 3.7 + this._seed * 11) - 0.5) * 0.3;
  }

  _seize() {
    this._seizedDone = true;
    this._seizeAt = this.impactTime;
    const c = this.config;
    const R = c.zoneRadius;
    const arms = this._armCount();
    const cap = Math.max(0, Math.min(MAX_SEIZED, arms, Math.floor(c.maxSeized)));
    const px = this.position.x,
      pz = this.position.z;
    let n = 0;
    if (this._scope) {
      const found = this._scope.queryActors({ position: [px, 0, pz], radius: R, relation: 'enemy' });
      if (!found.ok) this.failure = found.reason;
      else {
        // Nearest first, so a crowded circle seizes the bodies at its heart.
        const actors = this._actors;
        actors.length = 0;
        for (const actor of found.actors) if (actor.alive !== false) actors.push(actor);
        actors.sort((a, b) =>
          Math.hypot(a.position[0] - px, a.position[2] - pz) - Math.hypot(b.position[0] - px, b.position[2] - pz) || (a.id < b.id ? -1 : 1));
        for (let i = 0; i < actors.length && n < cap; i++) {
          const rec = this._targets[n++];
          rec.id = actors[i].id;
          rec.dummy = null;
          rec.x = actors[i].position[0];
          rec.z = actors[i].position[2];
        }
        actors.length = 0;
      }
    } else {
      const field = this.ctx.dummies;
      if (field?.findTargets) {
        const found = field.findTargets(px, pz, R, this._found);
        for (let i = 0; i < found.length && n < cap; i++) {
          const d = found[i];
          if (!d || d.alive === false) continue;
          if (Math.hypot(d.position.x - px, d.position.z - pz) > R) continue;
          const rec = this._targets[n++];
          rec.id = null;
          rec.dummy = d;
          rec.x = d.position.x;
          rec.z = d.position.z;
        }
        this._found.length = 0;
      }
    }
    // Order the seized bodies by bearing round the soma: the diversion order.
    for (let i = 0; i < n; i++) {
      const rec = this._targets[i];
      rec.angle = Math.atan2(rec.z - pz, rec.x - px);
      rec.dist = Math.hypot(rec.x - px, rec.z - pz);
    }
    for (let i = 1; i < n; i++) {
      for (let j = i; j > 0 && this._targets[j - 1].angle > this._targets[j].angle; j--) {
        const tmp = this._targets[j];
        this._targets[j] = this._targets[j - 1];
        this._targets[j - 1] = tmp;
      }
    }
    // Each body takes the free arm whose rest bearing is nearest its own.
    this._armTarget.fill(-1);
    for (let i = 0; i < n; i++) {
      const rec = this._targets[i];
      let best = -1,
        bestD = Infinity;
      for (let j = 0; j < arms; j++) {
        if (this._armTarget[j] >= 0) continue;
        const d = Math.abs(angleTo(this._restYaw(j, arms), rec.angle));
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      rec.arm = best;
      if (best >= 0) this._armTarget[best] = i;
    }
    this._seized = n;
    if (!n) return;

    // The interrupt: the storm status on every seized actor.
    if (this._scope && this._targets[0].id !== null) {
      const ids = [];
      for (let i = 0; i < n; i++) ids.push(this._targets[i].id);
      const rate = Number.isFinite(this._scope.tickRate) ? this._scope.tickRate : 30;
      const sent = this._scope.emit({
        type: 'status', element: 'storm', targetIds: ids, position: [px, 0, pz],
        intensity: 1, durationTicks: Math.max(1, Math.round(this._overrideAt() * rate)),
        tags: ['synaptic-override', 'interrupt'],
      });
      // The direct fallback has no statuses to lay; that is not a failure.
      if (!sent.ok && !this._scope.standalone) this.failure = sent.reason;
    }
    // A spit of sparks where each terminal bites.
    for (let i = 0; i < n; i++) {
      _p.set(this._targets[i].x, 0.15, this._targets[i].z);
      this._emitSparks(_p, 10, 0.2, 1.2);
    }
    this.lightBoost += c.plantLight * 0.4 * settings.global.explosionIntensity;
  }

  _discharge() {
    this._discharged = true;
    this._dischargeAt = this.impactTime;
    const c = this.config;
    const g = settings.global;
    const n = this._seized;
    const px = this.position.x,
      pz = this.position.z;
    const force = impactForce(c, g.explosionIntensity);
    this._force.impulse = force.impulse;
    this._force.lift = force.lift;
    this._force.spin = force.spin;
    const bend = (c.divertAngle * Math.PI) / 180;
    for (let i = 0; i < n; i++) {
      const rec = this._targets[i];
      let dx, dz;
      if (n >= 2) {
        // The diversion: thrown at the next seized body round the soma.
        const next = this._targets[(i + 1) % n];
        dx = next.x - rec.x;
        dz = next.z - rec.z;
      } else {
        // Nobody to turn it on: the blow is bent off the radial.
        const rx = rec.x - px,
          rz = rec.z - pz;
        const cb = Math.cos(bend),
          sb = Math.sin(bend);
        dx = rx * cb - rz * sb;
        dz = rx * sb + rz * cb;
      }
      let len = Math.hypot(dx, dz);
      if (len < 1e-6) {
        dx = this.direction.x;
        dz = this.direction.z;
        len = Math.hypot(dx, dz) || 1;
      }
      rec.dx = dx / len;
      rec.dz = dz / len;
      if (this._scope) {
        if (rec.id === null) continue;
        const sent = this._scope.emit({
          type: 'hit', element: 'storm', targetIds: [rec.id],
          position: [rec.x, 0, rec.z], sourcePosition: [rec.x - rec.dx, 0, rec.z - rec.dz],
          damage: c.hitDamage, hitForce: force, tags: ['synaptic-override', 'diversion'],
        });
        if (sent.ok) this._hits++;
        else this.failure = sent.reason;
      } else if (rec.dummy && rec.dummy.alive !== false) {
        if (rec.dummy.kill(rec.dx, rec.dz, this._force)) this._hits++;
      }
    }
    this._dischargeFX();
  }

  /* ------------------------------------------------------------------ */
  /* The world answers                                                   */
  /* ------------------------------------------------------------------ */

  _plant() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = c.zoneRadius;
    _p.copy(this.position).setY(c.somaHeight * 0.6);
    this.ctx.bursts?.spawn?.(BurstMode.STORM, _p, {
      radius: 0.2, endRadius: R * c.plantBurstReach * power, life: c.burstLife * 0.8,
      intensity: c.burstIntensity, opacity: c.burstOpacity * g.opacity, fresnel: c.burstFresnel, squash: c.burstSquash,
      colorA: getColor(c.colorBurstA), colorB: getColor(c.colorBurstB), colorC: getColor(c.colorBurstC),
    });
    _p.setY(0.02);
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _p, {
      radius: R * 0.85, life: c.decalLife, intensity: c.scorchIntensity,
      colorA: getColor(c.deepColor), colorB: getColor(c.bodyColor),
    });
    this.ctx.decals?.spawn?.(DecalType.ARC, _p, {
      radius: R * 1.05, life: c.decalLife * 0.8, intensity: c.arcDecalIntensity,
      colorA: getColor(c.tintColor), colorB: getColor(c.bodyColor),
    });
    _p.setY(c.somaHeight);
    this._emitSparks(_p, c.plantSparks, 0.4, 1.3);
    this.lightBoost = c.plantLight * power;
    if (c.plantShake > 0) this.ctx.shake?.add?.(c.plantShake * power * g.cameraShake, c.shakeDecay, c.shakeFrequency);
    if (c.plantFlash > 0) this.ctx.flash?.trigger?.(getColor(c.tintColor), c.plantFlash * power);
  }

  _dischargeFX() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    const R = c.zoneRadius;
    _p.copy(this.position).setY(c.somaHeight * 0.5);
    this.ctx.bursts?.spawn?.(BurstMode.STORM, _p, {
      radius: R * 0.1, endRadius: R * c.dischargeBurstReach * power, life: c.burstLife,
      intensity: c.burstIntensity * 1.2, opacity: c.burstOpacity * g.opacity, fresnel: c.burstFresnel, squash: c.burstSquash,
      colorA: getColor(c.colorBurstA), colorB: getColor(c.colorBurstB), colorC: getColor(c.colorBurstC),
    });
    _p.setY(0.03);
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _p, {
      radius: R * 1.1 * power, life: c.decalLife * 0.35, width: c.shockwaveWidth, intensity: 1,
      colorA: getColor(c.coreColor), colorB: getColor(c.bodyColor),
    });
    _p.setY(c.somaHeight);
    this._emitSparks(_p, c.dischargeSparks * 0.4, 0.5, 1.6);
    for (let i = 0; i < this._seized; i++) {
      const rec = this._targets[i];
      _q.set(rec.x, 0.02, rec.z);
      this.ctx.decals?.spawn?.(DecalType.ARC, _q, {
        radius: 1.1, life: c.decalLife * 0.6, intensity: c.arcDecalIntensity,
        colorA: getColor(c.coreColor), colorB: getColor(c.bodyColor),
      });
      _q.setY(c.contactHeight);
      this._emitSparks(_q, (c.dischargeSparks * 0.6) / Math.max(1, this._seized), 0.3, 1.4);
    }
    this.lightBoost = c.dischargeLight * power;
    if (c.dischargeShake > 0) this.ctx.shake?.add?.(c.dischargeShake * power * g.cameraShake, c.shakeDecay, c.shakeFrequency);
    if (c.dischargeFlash > 0) this.ctx.flash?.trigger?.(getColor(c.coreColor), c.dischargeFlash * power);
  }

  /* ------------------------------------------------------------------ */
  /* Particles                                                           */
  /* ------------------------------------------------------------------ */

  _emitSparks(at, count, radius, speedGain) {
    const sys = this.sparks;
    const c = this.config;
    const g = settings.global;
    const n = Math.min(128, Math.round(count * g.particleCount));
    if (!sys || n <= 0) return;
    _emit.position.copy(at);
    _emit.radius = radius;
    _emit.direction.copy(UP);
    _emit.spread = 1;
    _emit.speed = c.sparkSpeed * speedGain * g.particleSpeed;
    _emit.size = c.sparkSize * g.particleSize;
    _emit.life = c.sparkLife * g.particleLifetime;
    _emit.time = frame.uTime.value;
    sys.emit(n, _emit);
  }

  /** While listening: sparks off the arms and motes drawn in to the soma. */
  _crackle(dt) {
    if (!this._seizedDone && this.impactTime < this.config.eruptTime) return;
    const c = this.config;
    const g = settings.global;
    const arms = this._armCount();
    const sparks = this._sparkRate.tick(dt, c.sparkRate * g.particleCount);
    for (let k = 0; k < sparks && this.sparks; k++) {
      const j = Math.floor(hash(++this._emitCounter * 1.3 + this._seed) * arms);
      const s = 0.25 + 0.75 * hash(this._emitCounter * 2.9);
      armPoint(_p, this.crownMat.uniforms.uArmA.value[j], this.crownMat.uniforms.uArmB.value[j], this._crownMirror, s);
      _p.add(this.root.position);
      this._emitSparks(_p, 1, 0.05, 0.6);
    }
    const motes = this._moteRate.tick(dt, c.vesicleRate * g.particleCount);
    if (motes > 0 && this.motes) {
      const a = hash(++this._emitCounter * 4.1) * TAU;
      const r = c.zoneRadius * (0.55 + 0.4 * hash(this._emitCounter * 5.3));
      _emit.position.set(this.position.x + Math.cos(a) * r, 0.25, this.position.z + Math.sin(a) * r);
      _emit.radius = 0.3;
      _emit.direction.set(-Math.cos(a), 0.35, -Math.sin(a)).normalize();
      _emit.spread = 0.15;
      _emit.speed = c.vesicleSpeed * g.particleSpeed;
      _emit.size = c.vesicleSize * g.particleSize;
      _emit.life = c.vesicleLife * g.particleLifetime;
      _emit.time = frame.uTime.value;
      this.motes.emit(motes, _emit);
    }
  }

  _syncParticles() {
    this._syncSystem(this.sparks, this.config.sparkGlow);
    this._syncSystem(this.motes, this.config.vesicleGlow);
  }

  /** Mirror the particle look from settings every frame (no-op on stubs). */
  _syncSystem(sys, glow) {
    if (!sys?.uniforms) return;
    const c = this.config;
    const g = settings.global;
    const ramp = this._ramp;
    ramp[0].copy(getColor(c.colorSparkA));
    ramp[1].copy(getColor(c.colorSparkB));
    ramp[2].copy(getColor(c.colorSparkC));
    ramp[3].copy(getColor(c.colorSparkD));
    sys.setGradient?.(ramp[0], ramp[1], ramp[2], ramp[3]);
    const u = sys.uniforms;
    if (u.uGlow) u.uGlow.value = glow * g.glow;
    if (u.uOpacity) u.uOpacity.value = g.opacity;
    if (u.uTurbulence) u.uTurbulence.value = 0.6 * g.turbulence;
    if (u.uSizeScale) u.uSizeScale.value = g.particleSize;
    if (u.uSpeedScale) u.uSpeedScale.value = g.particleSpeed;
    if (u.uLifeScale) u.uLifeScale.value = g.particleLifetime;
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame presentation                                              */
  /* ------------------------------------------------------------------ */

  _sync(dt) {
    const c = this.config;
    const g = settings.global;
    const L = g.lifetime;
    const R = c.zoneRadius;
    if (!this._calm) this._clock += dt * g.animationSpeed;
    this._potential += dt * c.potentialSpeed * g.animationSpeed * (this._calm ? 0.4 : 1);
    const clock = this._clock;
    const travel = this.phase === 'travel';
    // Seconds since the crown planted, running on through the fade.
    const land = travel ? 0 : this.phase === 'fade' ? this.impactDuration + this.fadeTime : this.impactTime;
    const erupt = travel ? 0 : Easing.outCubic(clamp(land / Math.max(0.05, c.eruptTime * L)));
    const fadeT = this.phase === 'fade' ? clamp(this.fadeTime / this.fadeDuration) : 0;
    const growth = erupt * (1 - Easing.inCubic(fadeT));
    const seizeK = this._seizedDone ? smooth((land - c.seizeDelay) / Math.max(0.02, c.seizeTime)) : 0;
    const sinceD = this._discharged ? land - this._dischargeAt : -1;
    this._listen = this._seizedDone && !this._discharged ? smooth((land - c.seizeDelay) / 0.2) : this._discharged ? Math.exp(-sinceD * 5) : 0;
    const listen = this._listen;
    // The rear-up: a damped spring, so the crown whips open and settles.
    const rear = this._discharged ? clamp(1 - Math.exp(-sinceD * 12) * Math.cos(sinceD * 19)) : 0;
    const theta = Math.PI * (1 - 0.5 * c.curl * rear);
    const flashD = this._discharged ? Math.exp(-sinceD * 6) * 2 : 0;

    this.root.position.copy(this.position);
    this.root.visible = !travel;

    // 2 · the crown: per-arm numbers, written where the vertex stage reads them
    const arms = this._armCount();
    const A = this.crownMat.uniforms.uArmA.value;
    const B = this.crownMat.uniforms.uArmB.value;
    const F = this.fieldMat.uniforms.uArms.value;
    const writhe = c.writhe * g.noiseStrength * (1 + (c.listenWrithe - 1) * listen);
    for (let i = 0; i < MAX_ARMS; i++) {
      if (i >= arms) {
        A[i].set(0, R, 0, Math.PI);
        B[i].set(0, 0, 0, 0);
        F[i].set(0, R, 0, 0);
        continue;
      }
      let yaw = this._restYaw(i, arms);
      let reach = R * c.dendriteReach * (0.93 + 0.1 * hash(i * 5.1 + this._seed * 3));
      const ti = this._armTarget[i];
      let flash = flashD;
      let flow = -1;
      if (ti >= 0 && ti < this._seized) {
        const rec = this._targets[ti];
        yaw += angleTo(yaw, rec.angle) * seizeK;
        reach += (Math.max(c.somaRadius + 0.35, rec.dist) - reach) * seizeK;
        const bite = land - c.seizeDelay - c.seizeTime;
        if (bite >= 0) flash += Math.exp(-bite * 5) * 1.5;
        flow = this._discharged ? -1 : 1;
      }
      A[i].set(yaw, reach, growth, theta);
      B[i].set(writhe * (0.75 + 0.5 * hash(i + 0.5)), hash(i * 9.7 + this._seed), flash, flow);
      F[i].set(yaw, reach, growth, 1);
    }
    const cs = this._crownState;
    cs.energy = 0.55 + 0.45 * Math.max(listen, erupt * (1 - fadeT)) + flashD * 0.3;
    cs.potential = this._potential;
    cs.clock = clock;
    this.crownMat.userData.sync(cs);
    const m = this._crownMirror;
    m.r0 = this.crownMat.uniforms.uR0.value;
    m.baseY = this.crownMat.uniforms.uBaseY.value;
    m.writheFreq = this.crownMat.uniforms.uWritheFreq.value;
    m.writheClock = this.crownMat.uniforms.uWritheClock.value;

    // 1 · the soma
    const pop = travel ? 0 : Easing.outBack(clamp(land / Math.max(0.05, c.eruptTime * L * 0.8)));
    const somaScale = c.somaRadius * pop * (1 - Easing.inCubic(fadeT)) * (1 + 0.25 * flashD * 0.5);
    this.soma.visible = somaScale > 0.002;
    this.soma.position.set(0, c.somaHeight, 0);
    this.soma.scale.setScalar(Math.max(0.001, somaScale));
    const ss = this._somaState;
    ss.clock = clock;
    ss.beat = this._calm ? 0 : listen * (0.5 + 0.5 * Math.sin(clock * c.somaBeat * TAU));
    ss.flare = flashD * 0.5 + listen * 0.3;
    ss.fade = 1 - fadeT * 0.5;
    ss.hillock.set(this.origin.x - this.position.x, 0, this.origin.z - this.position.z);
    if (ss.hillock.lengthSq() < 1e-6) ss.hillock.set(-this.direction.x, 0, -this.direction.z);
    ss.hillock.normalize();
    this.somaMat.userData.sync(ss);

    // 3 · the sheath and the terminals, placed on the bent arms
    this.sheathMat.color.copy(getColor(c.sheathColor));
    this.sheathMat.metalness = c.sheathMetalness;
    this.sheathMat.roughness = c.sheathRoughness;
    this.sheathMat.emissive.copy(getColor(c.sheathEmissive));
    this.sheathMat.emissiveIntensity = c.sheathGlow * g.glow * (0.6 + 0.4 * listen + flashD * 0.5);
    const per = Math.max(0, Math.min(MAX_SHEATH, Math.round(c.sheathPerArm)));
    const thick = c.dendriteThickness;
    const taper = Math.min(0.95, Math.max(0, c.dendriteTaper));
    for (let i = 0; i < MAX_ARMS; i++) {
      for (let k = 0; k < MAX_SHEATH; k++) {
        const slot = i * MAX_SHEATH + k;
        const s = 0.12 + 0.7 * ((k + 0.5) / Math.max(1, per));
        const shown = i < arms && k < per ? smooth((growth - s) / 0.08) : 0;
        if (shown <= 0) {
          scratch.scale.setScalar(0);
          scratch.position.set(0, -10, 0);
        } else {
          armPoint(scratch.position, A[i], B[i], m, s);
          armTangent(_t, A[i], B[i], m, s, _q);
          scratch.quaternion.setFromUnitVectors(UP, _t);
          const rad = armRadius(thick, taper, s) * 1.5 * c.sheathSize * shown;
          scratch.scale.set(rad, 0.3 * c.sheathSize * shown, rad);
        }
        scratch.updateMatrix();
        this.sheath.setMatrixAt(slot, scratch.matrix);
      }
      const tip = i < arms ? smooth((growth - 0.9) / 0.1) : 0;
      if (tip <= 0) {
        scratch.scale.setScalar(0);
        scratch.position.set(0, -10, 0);
        scratch.quaternion.identity();
      } else {
        armPoint(scratch.position, A[i], B[i], m, 1);
        armTangent(_t, A[i], B[i], m, 1, _q);
        // The cup grips the floor: its foot faces back along the arm.
        scratch.quaternion.setFromUnitVectors(UP, _t.negate());
        scratch.position.y = Math.max(0, scratch.position.y - 0.02);
        scratch.scale.setScalar(c.boutonSize * tip * (1 + 0.3 * (B[i].z > 0 ? Math.min(1, B[i].z) : 0)));
      }
      scratch.updateMatrix();
      this.boutons.setMatrixAt(i, scratch.matrix);
    }
    this.sheath.instanceMatrix.needsUpdate = true;
    this.boutons.instanceMatrix.needsUpdate = true;

    // 4 · the axon: crawls out with the front, reeled in after landing
    const axonEnd = travel ? 1 : clamp(land / Math.max(0.05, c.axonLinger * L));
    this.axon.visible = travel || axonEnd < 1;
    if (this.axon.visible) {
      const as = this._axonState;
      as.start.set(this.origin.x, HAND_Y, this.origin.z).addScaledVector(this.direction, 0.35);
      as.end.copy(this.position).setY(0);
      if (travel) {
        // The end is the *target*, so the meander does not slide as it grows.
        as.end.copy(this.origin).addScaledVector(this.direction, this.length).setY(0);
        as.head = Math.max(0.002, this.u);
        as.tail = 0;
      } else {
        as.end.copy(this.position).setY(0);
        as.head = 1;
        as.tail = Easing.inCubic(axonEnd) * 0.999;
      }
      as.charge = travel ? 1 - clamp(this.u * 1.6) : 0;
      as.clock = clock;
      as.fade = travel ? 1 : 1 - axonEnd * 0.5;
      this.axonMat.userData.sync(as);
    }

    // 5 · the arcs: contact arcs while listening, diverted bolts after
    const arc = this._arcState;
    arc.clock = this.age;
    const divertT = this._discharged ? sinceD / Math.max(0.05, c.divertArcTime * L) : 0;
    for (let i = 0; i < MAX_SEIZED; i++) {
      const mesh = this.arcs[i];
      mesh.visible = false;
      if (i >= this._seized) continue;
      const rec = this._targets[i];
      if (!this._discharged) {
        const climb = smooth((land - c.seizeDelay - c.seizeTime * 0.6) / 0.15);
        if (climb <= 0 || this.phase !== 'impact') continue;
        const j = rec.arm >= 0 ? rec.arm : 0;
        armPoint(_world, A[j], B[j], m, 1);
        arc.a.copy(_world).add(this.root.position);
        arc.a.y = Math.max(0.05, arc.a.y);
        arc.b.set(rec.x, c.contactHeight, rec.z);
        arc.draw = climb;
        arc.intensity = 0.65 + 0.35 * hash(Math.floor(this.age * c.arcFlicker) + i * 13);
      } else {
        if (divertT >= 1) continue;
        arc.a.set(rec.x, c.contactHeight, rec.z);
        if (this._seized >= 2) {
          const next = this._targets[(i + 1) % this._seized];
          arc.b.set(next.x, c.contactHeight, next.z);
        } else {
          arc.b.set(rec.x + rec.dx * 2.2, 0.1, rec.z + rec.dz * 2.2);
        }
        arc.draw = smooth(divertT * 4);
        arc.intensity = (1 - divertT) * 1.4;
      }
      mesh.visible = true;
      mesh.material.userData.sync(arc);
    }

    // 6 · the synaptic field
    const fs = this._fieldState;
    const size = R * c.fieldRadius;
    this.field.scale.set(size * 2, size * 2, 1);
    fs.size = size;
    fs.clock = clock;
    fs.energy = travel ? 0 : smooth(land / Math.max(0.05, c.eruptTime * L * 0.6));
    fs.listen = listen;
    fs.potential = this._potential * (this._discharged ? -1 : 1);
    fs.ring = this._discharged && sinceD < 0.6 ? clamp(sinceD / 0.6) : -1;
    fs.dissolve = clamp(fadeT / Math.max(0.05, c.fieldDissolve));
    fs.fade = 1;
    this.fieldMat.userData.sync(fs);

    // 9 · the lens
    const ls = this._lensState;
    const plantWave = clamp(land / 0.4);
    if (this._discharged && sinceD < 0.5) {
      ls.wave = Easing.outCubic(clamp(sinceD / 0.5));
      ls.shock = 1 - ls.wave;
    } else if (!travel && land < 0.4) {
      ls.wave = Easing.outCubic(plantWave) * 0.8;
      ls.shock = (1 - plantWave) * 0.7;
    } else {
      ls.wave = 0;
      ls.shock = 0;
    }
    ls.crackle = listen * (1 - fadeT);
    ls.clock = this.age;
    this.lens.scale.set(R * 2.4, R * 2.4, 1);
    this.lens.visible = !travel && !this._calm && (ls.crackle * c.lensCrackle + ls.shock * c.lensShock) * g.distortion > 0.002;
    if (this.lens.visible) this.lensMat.userData.sync(ls);

    this._syncParticles();
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._scope = null;
    this.root.visible = false;
    this.axon.visible = false;
    this.lens.visible = false;
    for (const arc of this.arcs) arc.visible = false;
    for (const t of this._targets) {
      t.id = null;
      t.dummy = null;
    }
    this._seized = 0;
    this._discharged = false;
    this._seizedDone = false;
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
  const folder = gui.addFolder('⌁  Synaptic Override');

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 80, 0.5, 'axon crawls at (m/s)');
  R(cast, c, 'zoneRadius', 1, 8, 0.05, 'crown reach (m)');
  R(cast, c, 'lifetime', 0.2, 8, 0.05, 'nominal lifetime (s)');
  R(cast, c, 'cooldown', 0, 15, 0.05, 'cooldown');
  castAnim(cast, c);

  const rule = sub(folder, 'The override');
  R(rule, c, 'maxSeized', 0, MAX_SEIZED, 1, 'bodies seized (max)');
  R(rule, c, 'seizeDelay', 0, 1, 0.01, 'arms re-aim after (s)');
  R(rule, c, 'seizeTime', 0.02, 0.6, 0.01, 'swing onto a body (s)');
  R(rule, c, 'overrideTime', 0.3, 3, 0.05, 'listens for (s)');
  R(rule, c, 'divertAngle', 0, 180, 1, 'lone body bent off radial (°)');
  R(rule, c, 'hitDamage', 0, 5, 0.05, 'damage per diverted hit');
  R(rule, c, 'hitImpulse', 0, 24, 0.1, 'impulse');
  R(rule, c, 'hitLift', 0, 20, 0.1, 'lift');
  R(rule, c, 'hitSpin', 0, 8, 0.05, 'tumble');

  const phases = sub(folder, 'Phases');
  R(phases, c, 'eruptTime', 0.05, 1.5, 0.01, 'crown arcs out over (s)');
  R(phases, c, 'dischargeTail', 0.1, 2.5, 0.01, 'after the diversion (s)');
  R(phases, c, 'exitTime', 0.1, 2, 0.01, 'retract over (s)');
  R(phases, c, 'axonLinger', 0.05, 2, 0.01, 'axon reeled in over (s)');

  const light = sub(folder, 'Light');
  color(light, c, 'lightColor', 'colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'flicker');
  R(light, c, 'plantLight', 0, 20, 0.1, 'punch at the plant');
  R(light, c, 'dischargeLight', 0, 30, 0.1, 'punch at the diversion');

  const palette = sub(folder, 'Palette');
  color(palette, c, 'coreColor', 'core (white-hot)');
  color(palette, c, 'tintColor', 'tint');
  color(palette, c, 'bodyColor', 'body');
  color(palette, c, 'deepColor', 'deep');

  const soma = sub(folder, '1 · The soma');
  R(soma, c, 'somaRadius', 0.15, 1.5, 0.01, 'radius (m)');
  R(soma, c, 'somaHeight', 0.2, 2, 0.01, 'height (m)');
  R(soma, c, 'somaLumps', 0, 0.6, 0.01, 'lumps');
  R(soma, c, 'somaStretch', 0, 1.5, 0.01, 'axon hillock');
  R(soma, c, 'somaGlow', 0, 6, 0.05, 'glow');
  R(soma, c, 'somaBeat', 0, 16, 0.1, 'beats per second');

  const crown = sub(folder, '2 · The dendrite crown');
  R(crown, c, 'dendriteCount', 1, MAX_ARMS, 1, 'arms');
  R(crown, c, 'dendriteReach', 0.4, 1.4, 0.01, 'plants at (× radius)');
  R(crown, c, 'dendriteThickness', 0.03, 0.4, 0.005, 'thickness (m)');
  R(crown, c, 'dendriteTaper', 0, 0.95, 0.01, 'taper');
  R(crown, c, 'dendriteRise', 0, 1, 0.01, 'leaves the soma at (× height)');
  R(crown, c, 'twigAt', 0.15, 0.9, 0.01, 'first twig at');
  R(crown, c, 'twigAt2', 0.15, 0.95, 0.01, 'second twig at');
  R(crown, c, 'twigSpread', 0, 1.5, 0.01, 'twig splay (rad)');
  R(crown, c, 'twigThickness', 0.1, 1, 0.01, 'twig thickness');
  R(crown, c, 'writhe', 0, 0.8, 0.01, 'writhe (m)');
  R(crown, c, 'writheFrequency', 0, 5, 0.05, 'writhe waves');
  R(crown, c, 'writheSpeed', 0, 12, 0.1, 'writhe speed');
  R(crown, c, 'listenWrithe', 1, 4, 0.05, 'writhe gain while listening');
  R(crown, c, 'curl', 0, 1.2, 0.01, 'rear-up at the diversion');
  R(crown, c, 'potentialSpeed', 0, 6, 0.05, 'potentials per second');
  R(crown, c, 'potentialWidth', 0.01, 0.3, 0.005, 'potential length');
  R(crown, c, 'potentialSwell', 0, 1.5, 0.01, 'potential swell');
  color(crown, c, 'membraneColor', 'membrane');
  R(crown, c, 'membraneSpecular', 0, 3, 0.05, 'membrane specular');
  R(crown, c, 'dendriteGlow', 0, 6, 0.05, 'core glow');
  R(crown, c, 'potentialGlow', 0, 10, 0.05, 'potential glow');

  const sheath = sub(folder, '3 · The sheath');
  R(sheath, c, 'sheathPerArm', 0, MAX_SHEATH, 1, 'segments per arm');
  R(sheath, c, 'sheathSize', 0.2, 3, 0.01, 'segment size');
  color(sheath, c, 'sheathColor', 'colour');
  R(sheath, c, 'sheathMetalness', 0, 1, 0.01, 'metalness');
  R(sheath, c, 'sheathRoughness', 0, 1, 0.01, 'roughness');
  color(sheath, c, 'sheathEmissive', 'emissive');
  R(sheath, c, 'sheathGlow', 0, 4, 0.05, 'emissive intensity');
  R(sheath, c, 'boutonSize', 0.05, 0.8, 0.01, 'terminal size (m)');

  const axon = sub(folder, '4 · The axon');
  R(axon, c, 'axonThickness', 0.01, 0.3, 0.005, 'thickness (m)');
  R(axon, c, 'axonWave', 0, 2, 0.01, 'meander (m)');
  R(axon, c, 'axonArch', 0, 2, 0.01, 'arch (m)');
  R(axon, c, 'axonNodes', 0, 5, 0.05, 'nodes per metre');
  R(axon, c, 'axonGlow', 0, 6, 0.05, 'glow');
  R(axon, c, 'chargeGlow', 0, 6, 0.05, 'charge at the hand');

  const arcs = sub(folder, '5 · Contact & diversion arcs');
  R(arcs, c, 'arcWidth', 0.01, 0.5, 0.005, 'width (m)');
  R(arcs, c, 'arcJitter', 0, 1, 0.01, 'jag (m)');
  R(arcs, c, 'arcFlicker', 1, 60, 1, 're-strikes per second');
  R(arcs, c, 'arcGlow', 0, 8, 0.05, 'glow');
  R(arcs, c, 'contactHeight', 0.2, 2.5, 0.01, 'climbs the body to (m)');
  R(arcs, c, 'divertArcTime', 0.05, 1.5, 0.01, 'diverted bolt lasts (s)');

  const field = sub(folder, '6 · The synaptic field');
  R(field, c, 'fieldRadius', 0.5, 2, 0.01, 'size (× radius)');
  R(field, c, 'fieldGlow', 0, 6, 0.05, 'glow');
  R(field, c, 'fieldCells', 0.2, 8, 0.05, 'web density');
  R(field, c, 'fieldTrace', 0, 4, 0.05, 'arm traces');
  R(field, c, 'fieldScorch', 0, 1, 0.01, 'scorch');
  R(field, c, 'fieldDissolve', 0.05, 1, 0.01, 'dissolves over (× exit)');

  const fx = sub(folder, '7 · Particles');
  R(fx, c, 'sparkRate', 0, 240, 1, 'sparks per second');
  R(fx, c, 'sparkSize', 0.005, 0.3, 0.005, 'spark size');
  R(fx, c, 'sparkLife', 0.05, 2, 0.01, 'spark life (s)');
  R(fx, c, 'sparkSpeed', 0, 15, 0.05, 'spark speed');
  R(fx, c, 'sparkGlow', 0, 6, 0.05, 'spark glow');
  gradient(fx, c, 'colorSpark', 'particle gradient');
  R(fx, c, 'vesicleRate', 0, 160, 1, 'motes per second');
  R(fx, c, 'vesicleSize', 0.01, 0.4, 0.005, 'mote size');
  R(fx, c, 'vesicleLife', 0.05, 3, 0.01, 'mote life (s)');
  R(fx, c, 'vesicleSpeed', 0, 6, 0.05, 'mote speed');
  R(fx, c, 'vesicleGlow', 0, 6, 0.05, 'mote glow');
  R(fx, c, 'plantSparks', 0, 128, 1, 'sparks at the plant');
  R(fx, c, 'dischargeSparks', 0, 200, 1, 'sparks at the diversion');

  const beat = sub(folder, '8 · Plant & diversion');
  R(beat, c, 'plantBurstReach', 0, 2, 0.01, 'plant shell (× radius)');
  R(beat, c, 'dischargeBurstReach', 0, 2.5, 0.01, 'diversion shell (× radius)');
  R(beat, c, 'burstLife', 0.05, 2, 0.01, 'shell life (s)');
  R(beat, c, 'burstIntensity', 0, 3, 0.01, 'shell brightness');
  R(beat, c, 'burstOpacity', 0, 1, 0.01, 'shell opacity');
  R(beat, c, 'burstFresnel', 0, 6, 0.05, 'shell rim');
  R(beat, c, 'burstSquash', 0.05, 1.5, 0.01, 'shell squash');
  color(beat, c, 'colorBurstA', 'shell inner');
  color(beat, c, 'colorBurstB', 'shell mid');
  color(beat, c, 'colorBurstC', 'shell outer');
  R(beat, c, 'decalLife', 0.1, 6, 0.05, 'burns last (s)');
  R(beat, c, 'scorchIntensity', 0, 3, 0.01, 'scorch decal');
  R(beat, c, 'arcDecalIntensity', 0, 3, 0.01, 'arc burn decal');
  R(beat, c, 'shockwaveWidth', 0.01, 0.4, 0.005, 'shockwave width');
  R(beat, c, 'plantShake', 0, 1, 0.01, 'plant knock');
  R(beat, c, 'dischargeShake', 0, 1, 0.01, 'diversion knock');
  R(beat, c, 'shakeDecay', 0.5, 20, 0.1, 'knock decay');
  R(beat, c, 'shakeFrequency', 1, 40, 0.5, 'knock frequency');
  R(beat, c, 'plantFlash', 0, 1, 0.01, 'plant flash');
  R(beat, c, 'dischargeFlash', 0, 1, 0.01, 'diversion flash');

  const lens = sub(folder, '9 · The lens');
  R(lens, c, 'lensCrackle', 0, 2, 0.01, 'ionised crackle');
  R(lens, c, 'lensShock', 0, 3, 0.01, 'pressure rings');

  return folder;
}
