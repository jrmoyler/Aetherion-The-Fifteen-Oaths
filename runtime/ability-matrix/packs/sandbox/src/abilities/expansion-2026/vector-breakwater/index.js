import { Group, InstancedMesh, Mesh, Object3D, Vector3 } from 'three';
import { Ability as BaseAbility, AbilityPhase } from '../../Ability.js';
import { settings } from '../../../config/settings.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { getColor } from '../../../utils/color.js';
import { saturate } from '../../../utils/math.js';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import {
  createExpansionFX,
  expansionImpact,
  routeExpansionTransparency,
  ParticleShape,
} from '../ExpansionFX.js';
import {
  createBraceGeometry,
  createContactGeometry,
  createCorridorGeometry,
  createFinGeometry,
  createFrontGeometry,
  createRibGeometry,
  createSheetGeometry,
  createWakeGeometry,
} from './BreakwaterGeometry.js';
import {
  createBraceMaterial,
  createContactMaterial,
  createCorridorMaterial,
  createFinMaterial,
  createFrontMaterial,
  createRibMaterial,
  createWakeMaterial,
  createWarpMaterial,
} from './BreakwaterMaterials.js';
import { castAnimation, gradient, rangeOf, subFolder } from './EditorKit.js';
import config from './config.js';

export { config };
export const ID = config.id;

const UID = 'matrix-expansion/vector-breakwater';
/** Shield fronts per cast. Each sweeps the lane once. */
const FRONTS = 3;
/** Pressure fins trailing each front. */
const FINS_PER_FRONT = 6;
/** Bodies one front sweep may strike in one frame. */
const MAX_TARGETS = 16;
/** Bodies one front may strike over its whole run. */
const MAX_HITS_PER_FRONT = 64;
/** Contact cues awaiting their committed UCSM hit. Pooled. */
const MAX_PENDING = 16;

const _loc = new Vector3();
const _contactPoint = new Vector3();
/** Scratch query point: queries read it immediately and never retain it. */
const _queryPos = [0, 0, 0];
const _pos = new Vector3();
const _dir = new Vector3();
const _up = new Vector3(0, 1, 0);
const _finTransform = new Object3D();
const _emit = {};

/** One pooled particle emission with the globals applied, reusing `_emit`. */
function emitParticles(system, count, position, radius, direction, speed, spread, size, life, spin, tint = null) {
  if (!system || count <= 0) return;
  const g = settings.global;
  const n = Math.min(128, Math.round(count * g.particleCount));
  if (n <= 0) return;
  _emit.position = position;
  _emit.radius = radius;
  _emit.direction = direction;
  _emit.speed = speed * g.particleSpeed;
  _emit.speedVariance = 0.45;
  _emit.spread = spread;
  _emit.inherit = null;
  _emit.anchor = null;
  _emit.size = size * g.particleSize;
  _emit.sizeVariance = 0.45;
  _emit.life = life * g.particleLifetime;
  _emit.lifeVariance = 0.35;
  _emit.spin = spin;
  _emit.tint = tint;
  _emit.time = frame.uTime.value;
  system.emit(n, _emit);
}

/** Push a settings gradient and behaviour uniforms into a shared system. */
function tuneSystem(system, c, prefix, gravityY, drag) {
  if (!system) return;
  system.setGradient?.(getColor(c[`${prefix}A`]), getColor(c[`${prefix}B`]), getColor(c[`${prefix}C`]), getColor(c[`${prefix}D`]));
  const u = system.uniforms;
  if (!u) return;
  const g = settings.global;
  u.uGravity?.value.set(0, gravityY, 0);
  if (u.uDrag) u.uDrag.value = drag;
  if (u.uGlow) u.uGlow.value = g.glow;
  if (u.uOpacity) u.uOpacity.value = g.opacity;
  if (u.uTurbulence) u.uTurbulence.value = 0.5 * g.turbulence;
}

/**
 * VECTOR BREAKWATER — three shield fronts that carry their impacts down a lane.
 *
 * A line cast with no travelling projectile of its own: the cast *is* the
 * three fronts. Each is launched `spacing` seconds after the last, sweeps the
 * corridor at `speed`, strikes everything it passes exactly once, and breaks
 * at the end of the line. A body in the lane therefore takes three
 * consecutive impacts, which is the move.
 *
 * Layers, each a folder in the editor:
 *
 *   1. **the brace** — three chevrons at the caster's feet, one per front,
 *      each flaring as its front leaves (with a small knock and light punch).
 *      That is the anticipation: you see the cadence before the first hit.
 *   2. **shield fronts** — a cambered, tapered sheet (`createFrontGeometry`)
 *      under a bespoke shader: drifting voronoi pressure cells, racing slash
 *      lines, hot rim and sides, fresnel; internal splines with climbing
 *      pulses; six instanced pressure fins trailing it. In the last
 *      `spentFade` of the lane the sheet tears apart from the crest with a
 *      burning dissolve edge and its crest curls forward — it breaks.
 *   3. **ground scour** — the corridor shader only marks ground a front has
 *      passed: dragged gouges, edge lines, a hot fresh band behind each front;
 *      plus grit kicked off each front's foot.
 *   4. **spray + contact** — spray every `sprayEvery` metres; at a confirmed
 *      hit, jagged pressure petals, flung shards and a light punch.
 *   5. **the break** — at the end of the line each front leaves a breaking
 *      wake crest, a shockwave decal and a light punch; the first adds a
 *      squashed pressure shell, camera knock and flash.
 *   6. **distortion** — a sheet on `LAYER.DISTORTION` riding each front.
 *
 * ## Look
 *
 * One four-stop ramp (`coreColor` → `edgeColor` → `bodyColor` →
 * `deepColor`). The fronts are dense, normal-blended walls: a dark umber
 * body (`frontDensity`) with saturated pressure cells, a hard white-hot
 * crest line and hot sides — force reads as mass, not jelly. Each sheet
 * only rises out of the floor once it is clear of the caster (past the
 * brace plus `frontClear` metres), so the first frames show the hero, the
 * brace flaring and a low pressure lip leaving — never a wall on the hero.
 * The scour is deep scorched ground with saturated seams; after the last
 * break it cools (`coolTime`) while aftershock ripples keep rolling down
 * the lane, then it crumbles away through a noise dissolve over the
 * presentation-only linger (`lingerTime`).
 *
 * Spray, grit and shards share one pooled streak system (the Batch C
 * contract allows one per cast), told apart by per-emit tint, size and speed.
 *
 * ## Gameplay is the contract
 *
 * The sweep (`_sweep`) is the candidate's own: a true line volume per front
 * per frame, a per-front set so nothing is struck twice by one front, the
 * same UCSM `hit` event and force, and the same direct-dummy fallback. A
 * contact cue under UCSM waits for its committed hit (subscription), so a
 * cancelled event never shows an impact.
 *
 * ## Live editing
 *
 * A front's position is a pure function of age, spacing and speed, so every
 * visual follows a slider on the next frame; shimmer is integrated so dragging
 * its speed never jumps the slash lines.
 */
export class Ability extends BaseAbility {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get impactDuration() {
    return Math.max(1.1, this.config.spacing * 3 + 0.5);
  }

  /** Presentation-only linger: every front has arrived before it starts. */
  get fadeDuration() {
    return Math.max(0.2, this.config?.lingerTime ?? 1.4);
  }

  /** Fronts currently in the lane. HUD readout only. */
  get instanceCount() {
    let n = 0;
    for (const front of this.fronts) if (front.visible) n++;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.resources = [];
    const own = (x) => (this.resources.push(x), x);

    this.root = new Group();
    this.group.add(this.root);

    const frontGeo = own(createFrontGeometry());
    const ribGeo = own(createRibGeometry());
    const contactGeo = own(createContactGeometry());
    const wakeGeo = own(createWakeGeometry());
    const sheetGeo = own(createSheetGeometry());

    /* ---- layer 2: fronts, ribs, fins ---- */
    this.frontMats = [];
    this.ribMats = [];
    this.fronts = [];
    this.wakeRings = [];
    this.contacts = [];
    this.warps = [];
    this.contactTimes = [-1, -1, -1];
    for (let i = 0; i < FRONTS; i++) {
      const frontMat = own(createFrontMaterial(i * 3.7));
      const ribMat = own(createRibMaterial());
      this.frontMats.push(frontMat);
      this.ribMats.push(ribMat);
      const mesh = new Mesh(frontGeo, frontMat);
      // One child only: the splines. Everything else that follows a front
      // lives in root space so it can outlive the sheet.
      mesh.add(new Mesh(ribGeo, ribMat));
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.root.add(mesh);
      this.fronts.push(mesh);

      /* ---- layer 5: the wake crest each front leaves ---- */
      const wake = new Mesh(wakeGeo, own(createWakeMaterial(i * 5.1)));
      wake.position.y = 0.06 + i * 0.005;
      wake.visible = false;
      this.root.add(wake);
      this.wakeRings.push(wake);

      /* ---- layer 4: the contact petals ---- */
      const contact = new Mesh(contactGeo, own(createContactMaterial()));
      contact.visible = false;
      this.root.add(contact);
      this.contacts.push(contact);

      /* ---- layer 6: the warp riding the front ---- */
      const warp = new Mesh(sheetGeo, own(createWarpMaterial()));
      warp.frustumCulled = false;
      warp.visible = false;
      this.root.add(warp);
      this.warps.push(warp);
    }

    this.finMat = own(createFinMaterial());
    this.fins = new InstancedMesh(own(createFinGeometry()), this.finMat, FRONTS * FINS_PER_FRONT);
    this.fins.frustumCulled = false;
    this.root.add(this.fins);

    /* ---- layer 3: the corridor ---- */
    this.trailMat = own(createCorridorMaterial());
    this.trail = new Mesh(own(createCorridorGeometry()), this.trailMat);
    this.trail.position.y = 0.03;
    this.root.add(this.trail);

    /* ---- layer 1: the brace ---- */
    this.braceMat = own(createBraceMaterial());
    this.brace = new Mesh(own(createBraceGeometry()), this.braceMat);
    this.brace.position.y = 0.035;
    this.root.add(this.brace);

    routeExpansionTransparency(this.group);
    for (const warp of this.warps) warp.layers.set(LAYER.DISTORTION);

    /* ---- per-cast state, all fixed-size ---- */
    this._previous = [0, 0, 0];
    this._nextTrail = [0, 0, 0];
    this._launched = [false, false, false];
    this._arrived = [false, false, false];
    this._braceHeat = [0, 0, 0];
    this._shimmer = 0;
    this._found = [];
    this._hitSets = [new Set(), new Set(), new Set()];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this.dustEmitters = [new RateEmitter(), new RateEmitter(), new RateEmitter()];

    // Contact cues awaiting a committed hit: a fixed pool of records keyed by
    // event id, and one bound handler — nothing is allocated per cast.
    this._pendingContacts = new Map();
    this._pendingPool = [];
    for (let i = 0; i < MAX_PENDING; i++) this._pendingPool.push({ i: 0, lat: 0, along: 0, position: [0, 0, 0] });
    this._hitSubscription = null;
    this._onCommittedHit = (event) => {
      const cue = this._pendingContacts.get(event.eventId);
      if (!cue) return;
      this._pendingContacts.delete(event.eventId);
      this._pendingPool.push(cue);
      this._showContact(cue.i, cue.lat, cue.along, cue.position);
    };

    /** Scratch handed to the materials each frame — one apiece, reused. */
    this._frontState = { fade: 1, spent: 0, shimmer: 0 };
    this._fadeState = { fade: 1 };
    this._corridorState = { fade: 1, cool: 0, length: 1, f0: -1, f1: -1, f2: -1 };
    this._braceState = { fade: 1, h0: 0, h1: 0, h2: 0 };
    this._warpState = { strength: 0 };
    this._disposed = false;
  }

  createParticles() {
    // One shared, pooled streak system (the Batch C contract allows a cast
    // exactly one). Spray, grit and shards are told apart by per-emit tint,
    // size, speed and life over its gradient.
    this.fx = createExpansionFX(this.ctx, 'vectorBreakwater', { shape: ParticleShape.STREAK });
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._scope = bindExpansionCombat(this.ctx, UID);
    this.failure = null;
    this._releasePending();
    this._hitSubscription = null;
    if (this._scope && !this._scope.standalone) {
      const sub = this._scope.on('hit', this._onCommittedHit);
      if (sub.ok) this._hitSubscription = sub;
      else this.failure = sub.reason;
    }
    this._previous.fill(0);
    this._nextTrail.fill(0);
    this._launched.fill(false);
    this._arrived.fill(false);
    this._braceHeat.fill(0);
    this._shimmer = 0;
    this.contactTimes.fill(-1);
    for (const contact of this.contacts) contact.visible = false;
    for (const wake of this.wakeRings) wake.visible = false;
    for (const set of this._hitSets) set.clear();
    for (const emitter of this.dustEmitters) emitter.reset();
    this.root.visible = true;
    this._updateWaves(0);
  }

  onTravel(dt) {
    this._updateWaves(dt);
  }

  onImpact() {
    const c = this.config;
    const g = settings.global;
    this._updateWaves(0);
    // The first front breaking is the cast's one big beat.
    this.pointAt(1, _pos).setY(0.5);
    this.ctx.bursts?.spawn(BurstMode.AIR, _pos, {
      radius: c.burstSize * 0.15,
      endRadius: c.burstSize * g.explosionIntensity,
      life: 0.5,
      intensity: 1,
      opacity: c.burstOpacity * g.opacity,
      fresnel: 2,
      squash: 0.35,
      colorA: getColor(c.edgeColor),
      colorB: getColor(c.bodyColor),
      colorC: getColor(c.deepColor),
    });
    expansionImpact(this.ctx, c.edgeColor, c.impactShake * g.explosionIntensity, c.impactFlash * g.explosionIntensity);
  }

  onFade(dt) {
    this._updateWaves(dt);
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame resolve                                                   */
  /* ------------------------------------------------------------------ */

  /** @param {number} dt seconds since last frame; 0 renders without advancing */
  _updateWaves(dt = 0) {
    const c = this.config;
    const g = settings.global;
    const speed = c.speed * g.speed;
    const fade = this.phase === AbilityPhase.FADE ? 1 - saturate(this.fadeTime / this.fadeDuration) : 1;
    const wakeTime = Math.max(0.05, c.wakeTime ?? 0.55);
    const spentFade = Math.max(0.01, c.spentFade);
    this._shimmer += c.shimmerSpeed * dt * g.noiseSpeed;
    this._syncParticles();

    this.root.position.copy(this.origin);
    this.root.rotation.y = Math.atan2(this.direction.x, this.direction.z);

    /* ---- the corridor ---- */
    this.trail.position.z = this.length * 0.5;
    this.trail.scale.set(c.width * 2, 1, this.length);
    const cs = this._corridorState;
    cs.fade = fade;
    cs.length = this.length;
    // The scour cools after the last front breaks (presentation clock only).
    const lastArrival = (FRONTS - 1) * c.spacing + this.length / Math.max(0.001, speed);
    cs.cool = saturate((this.age - lastArrival) / Math.max(0.05, c.coolTime));
    // The sheet rises out of the floor only once it is clear of the caster:
    // past the brace plus `frontClear` metres, so it never stands on the hero.
    const clearFrom = c.braceSize;
    const clearAt = c.braceSize + Math.max(0.05, c.frontClear);

    /* ---- the brace ---- */
    this.brace.scale.set(c.braceSize * Math.max(0.5, c.width * 0.6), 1, c.braceSize);

    for (let i = 0; i < FRONTS; i++) {
      const elapsed = this.age - i * c.spacing;
      const front = saturate((elapsed * speed) / this.length) * this.length;
      const mesh = this.fronts[i];
      const r = saturate((front - clearFrom) / (clearAt - clearFrom));
      const rise = r * r * (3 - 2 * r);
      mesh.visible = elapsed >= 0 && front < this.length && rise > 0.01;
      mesh.position.set(0, 0.04, front);
      mesh.scale.set(c.width * 2 * (0.6 + 0.4 * rise), c.frontHeight * Math.max(0.001, rise), 1);

      // Launch and arrival beats fire once, on the frame they are crossed.
      if (elapsed >= 0 && !this._launched[i]) this._launch(i);
      const arrival = elapsed - this.length / Math.max(0.001, speed);
      if (arrival >= 0 && !this._arrived[i]) this._arrive(i);

      // Torn apart over the last `spentFade` of the lane.
      const spent = saturate((front / this.length - (1 - spentFade)) / spentFade);
      const fs = this._frontState;
      fs.fade = fade;
      fs.spent = spent;
      fs.shimmer = this._shimmer + i * 1.7;
      this.frontMats[i].userData.sync(fs);
      this._fadeState.fade = fade * (1 - spent);
      this.ribMats[i].userData.sync(this._fadeState);

      if (i === 0) cs.f0 = elapsed >= 0 ? front : -1;
      else if (i === 1) cs.f1 = elapsed >= 0 ? front : -1;
      else cs.f2 = elapsed >= 0 ? front : -1;

      /* the warp rides the sheet */
      const warp = this.warps[i];
      warp.visible = mesh.visible;
      if (warp.visible) {
        warp.position.set(0, 0, front + 0.05);
        warp.scale.set(c.width * 2.2, c.warpHeight * Math.max(0.001, rise), 1);
        this._warpState.strength = (1 - spent) * fade;
        warp.material.userData.sync(this._warpState);
      }

      /* dust off the front's foot */
      if (mesh.visible && dt > 0) {
        const puffs = this.dustEmitters[i].tick(dt, c.dustRate * (1 - spent));
        if (puffs > 0) {
          this.pointAt(front / this.length, _pos).setY(0.2);
          _dir.copy(this.direction).multiplyScalar(-0.5).setY(0.6).normalize();
          emitParticles(this.fx, puffs, _pos, c.width * 0.6, _dir, 1.6, 0.7, c.dustSize, c.dustLife, 0, getColor(c.dustColor));
        }
      }

      /* ---- the wake crest at the end ---- */
      const wake = this.wakeRings[i];
      wake.visible = arrival >= 0 && arrival < wakeTime;
      if (wake.visible) {
        const t = saturate(arrival / wakeTime);
        wake.position.z = this.length;
        wake.scale.setScalar(c.width * (0.15 + t * c.wakeGrowth));
        this._fadeState.fade = (1 - t) * fade;
        wake.material.userData.sync(this._fadeState);
      }

      /* ---- a confirmed contact's petals ---- */
      const contact = this.contacts[i];
      const contactAge = this.contactTimes[i] < 0 ? -1 : this.age - this.contactTimes[i];
      const contactLife = Math.max(0.05, c.contactLife ?? 0.4);
      contact.visible = contactAge >= 0 && contactAge < contactLife;
      if (contact.visible) {
        const t = saturate(contactAge / contactLife);
        contact.scale.setScalar((c.contactSize ?? 1) * (0.25 + 0.75 * t));
        contact.rotation.y = this.age * (i % 2 ? -1 : 1);
        this._fadeState.fade = (1 - t) * fade;
        contact.material.userData.sync(this._fadeState);
      }

      /* ---- fins: trail the sheet, then peel away as it breaks ---- */
      const peel = saturate(arrival / wakeTime);
      const active = elapsed >= 0 && arrival < wakeTime;
      for (let j = 0; j < FINS_PER_FRONT; j++) {
        const side = (j / (FINS_PER_FRONT - 1)) * 2 - 1;
        _finTransform.position.set(
          side * (c.width * 0.82 + peel * (c.finSpread ?? 0.9)),
          0.12 + (j % 3) * 0.16 + peel * 0.6,
          front - 0.25 - (j % 2) * 0.15 + peel * 0.45,
        );
        _finTransform.rotation.set(peel * 1.5, side * 0.3, side * (0.3 + peel));
        _finTransform.scale.setScalar(active && rise > 0.01 ? (c.finSize ?? 0.22) * (1 - peel) * fade * rise : 0.001);
        _finTransform.updateMatrix();
        this.fins.setMatrixAt(i * FINS_PER_FRONT + j, _finTransform.matrix);
      }

      /* ---- the attack ---- */
      if (elapsed >= 0 && front > this._previous[i]) this._sweep(i, this._previous[i], front);
      this._previous[i] = front;

      // Brace chevrons cool after their front leaves.
      if (dt > 0) this._braceHeat[i] = Math.max(0, this._braceHeat[i] - dt / Math.max(0.05, c.braceTime));
    }
    this.fins.instanceMatrix.needsUpdate = true;
    this._fadeState.fade = fade;
    this.finMat.userData.sync(this._fadeState);
    this.trailMat.userData.sync(cs);

    const bs = this._braceState;
    // The brace stands while the fronts are still leaving, then cools out.
    bs.fade = fade * (1 - saturate((this.age - FRONTS * c.spacing - 0.4) / 0.5));
    bs.h0 = this._braceHeat[0];
    bs.h1 = this._braceHeat[1];
    bs.h2 = this._braceHeat[2];
    this.braceMat.userData.sync(bs);
    this.brace.visible = bs.fade > 0.001;
  }

  /** A front leaves the caster: its chevron flares, a small knock and puff. */
  _launch(i) {
    const c = this.config;
    this._launched[i] = true;
    this._braceHeat[i] = 1;
    this.lightBoost = Math.max(this.lightBoost, c.launchLight);
    if (c.launchShake > 0) this.ctx.shake?.add?.(c.launchShake, 9, 18);
    _pos.copy(this.origin).addScaledVector(this.direction, 0.6).setY(0.15);
    emitParticles(this.fx, 6, _pos, c.width * 0.4, this.direction, 2.5, 0.6, c.dustSize, c.dustLife * 0.7, 0, getColor(c.dustColor));
  }

  /** A front reaches the end of the line and breaks. */
  _arrive(i) {
    const c = this.config;
    const g = settings.global;
    this._arrived[i] = true;
    this.pointAt(1, _pos).setY(0);
    this.ctx.decals?.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.shockRadius * (1 - i * 0.2) * g.explosionIntensity,
      life: 0.55,
      width: 0.07,
      intensity: 1,
      colorA: getColor(c.edgeColor),
      colorB: getColor(c.bodyColor),
    });
    this.ctx.decals?.spawn(DecalType.DUSTRING, _pos, {
      radius: c.width * 1.2,
      life: 0.9,
      intensity: 0.7,
      colorA: getColor(c.bodyColor),
      colorB: getColor(c.dustColor),
    });
    _pos.y = 0.4;
    emitParticles(this.fx, c.sprayCount, _pos, c.width * 0.5, _up, c.spraySpeed * 1.4, 0.9, c.spraySize, c.sprayLife, 2);
    this.lightBoost = Math.max(this.lightBoost, c.arrivalLight);
    // The first break's knock is onImpact's; the later two are smaller.
    if (i > 0 && c.arrivalShake > 0) this.ctx.shake?.add?.(c.arrivalShake * g.explosionIntensity, 7, 20);
  }

  _syncParticles() {
    const c = this.config;
    tuneSystem(this.fx, c, 'colorSpray', c.particleGravity, c.particleDrag);
  }

  /* ------------------------------------------------------------------ */
  /* The attack (combat-bound)                                           */
  /* ------------------------------------------------------------------ */

  /** Strike everything the front `i` swept between `from` and `to` metres. */
  _sweep(i, from, to) {
    const c = this.config;
    const field = this.ctx.dummies;
    if (!this._scope && !field?.findTargets) return;
    const mid = (from + to) / 2;
    this.pointAt(mid / this.length, _loc);
    if (to >= this._nextTrail[i]) {
      _pos.copy(_loc).setY(0.25);
      emitParticles(this.fx, c.sprayCount, _pos, c.width * 0.25, _up, c.spraySpeed, 0.8, c.spraySize, c.sprayLife, 2);
      this._nextTrail[i] = to + Math.max(0.25, c.sprayEvery);
    }
    if (this._scope) {
      _queryPos[0] = _loc.x;
      _queryPos[2] = _loc.z;
      const query = this._scope.queryActors({ position: _queryPos, radius: Math.hypot((to - from) / 2, c.width), relation: 'enemy' });
      if (!query.ok) {
        this.failure = query.reason;
        return;
      }
      // Built only when something is actually in the swept volume; emitted
      // events are queued by the bridge, so they get their own objects.
      let force = null;
      let n = 0;
      for (const actor of query.actors) {
        const x = actor.position[0] - this.origin.x;
        const z = actor.position[2] - this.origin.z;
        const along = x * this.direction.x + z * this.direction.z;
        const lat = x * this.side.x + z * this.side.z;
        if (along < from || along > to || Math.abs(lat) > c.width || this._hitSets[i].has(actor.id)) continue;
        if (this._hitSets[i].size >= MAX_HITS_PER_FRONT) break;
        force ??= impactForce({ hitImpulse: c.impulse, hitLift: c.lift, hitSpin: c.spin }, settings.global.explosionIntensity);
        const sent = this._scope.emit({
          type: 'hit',
          element: 'force',
          targetIds: [actor.id],
          position: actor.position,
          sourcePosition: [this.origin.x, 0, this.origin.z],
          damage: 1,
          hitForce: force,
          tags: ['vector-breakwater'],
        });
        if (!sent.ok) {
          this.failure = sent.reason;
          continue;
        }
        this._hitSets[i].add(actor.id);
        if (n === 0) {
          if (sent.standalone) this._showContact(i, lat, along, actor.position);
          else if (this._hitSubscription && sent.eventId) this._queueContact(sent.eventId, i, lat, along, actor.position);
        }
        if (++n >= MAX_TARGETS) break;
      }
      return;
    }
    const found = field.findTargets(_loc.x, _loc.z, Math.hypot((to - from) / 2, c.width), this._found);
    const power = settings.global.explosionIntensity;
    this._force.impulse = c.impulse * power;
    this._force.lift = c.lift * power;
    this._force.spin = c.spin;
    let n = 0;
    for (const d of found) {
      const x = d.position.x - this.origin.x;
      const z = d.position.z - this.origin.z;
      const along = x * this.direction.x + z * this.direction.z;
      const lat = x * this.side.x + z * this.side.z;
      if (along < from || along > to || Math.abs(lat) > c.width || this._hitSets[i].has(d)) continue;
      if (this._hitSets[i].size >= MAX_HITS_PER_FRONT) break;
      this._hitSets[i].add(d);
      if (d.kill(this.direction.x, this.direction.z, this._force)) {
        if (n === 0) this._showContactAt(i, lat, along, d.position);
        if (++n >= MAX_TARGETS) break;
      }
    }
  }

  /** Hold a contact cue until its UCSM hit commits. Drops it if the pool is spent. */
  _queueContact(eventId, i, lat, along, position) {
    const cue = this._pendingPool.pop();
    if (!cue) return;
    cue.i = i;
    cue.lat = lat;
    cue.along = along;
    cue.position[0] = position[0];
    cue.position[1] = position[1];
    cue.position[2] = position[2];
    this._pendingContacts.set(eventId, cue);
  }

  _releasePending() {
    for (const cue of this._pendingContacts.values()) this._pendingPool.push(cue);
    this._pendingContacts.clear();
  }

  /** Contact cue from an array position (UCSM / standalone actor snapshot). */
  _showContact(i, lat, along, position) {
    _contactPoint.fromArray(position);
    this._showContactAt(i, lat, along, _contactPoint);
  }

  /** Contact cue at a world point. */
  _showContactAt(i, lat, along, point) {
    const c = this.config;
    // The rig's local X is opposite the gameplay side vector.
    this.contacts[i].position.set(-lat, 0.08 + i * 0.01, along);
    this.contactTimes[i] = this.age;
    _pos.copy(point).setY(Math.max(point.y, 0) + 0.6);
    emitParticles(this.fx, c.chipCount, _pos, 0.15, _up, c.chipSpeed, 0.8, c.chipSize, c.chipLife, 2);
    _dir.copy(this.direction).setY(0.6).normalize();
    emitParticles(this.fx, c.chipCount, _pos, 0.2, _dir, c.chipSpeed * 1.5, 0.6, c.chipSize, c.chipLife * 1.6, 0, getColor(c.chipColor));
    this.lightBoost = Math.max(this.lightBoost, c.contactLight);
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this._hitSubscription?.unsubscribe();
    this._hitSubscription = null;
    this._releasePending();
    this._scope = null;
    this.root.visible = false;
    for (const set of this._hitSets) set.clear();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.onDestroy();
    for (const r of this.resources) r.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⫸  Vector Breakwater');
  const R = rangeOf(Editor);

  const cast = subFolder(folder, 'The cast');
  R(cast, c, 'range', 2, 48, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 3, 40, 0.5, 'front speed (m/s)');
  R(cast, c, 'cooldown', 0, 30, 0.1, 'cooldown');
  R(cast, c, 'lifetime', 0.5, 10, 0.1, 'contract lifetime (unused)');
  castAnimation(cast, c, Editor);
  cast.add(c, 'aimStyle', ['wide', 'lanes', 'self']).name('aim reticle');

  const attack = subFolder(folder, 'Attack');
  R(attack, c, 'width', 0.5, 5, 0.1, 'lane half-width (m)');
  R(attack, c, 'spacing', 0.05, 0.6, 0.01, 'front spacing (s)');
  R(attack, c, 'impulse', 0, 24, 0.5, 'impulse');
  R(attack, c, 'lift', 0, 20, 0.1, 'lift');
  R(attack, c, 'spin', 0, 8, 0.05, 'spin');

  const light = subFolder(folder, 'Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');

  const brace = subFolder(folder, '1 · Brace');
  R(brace, c, 'braceSize', 0.2, 4, 0.05, 'size (m)');
  R(brace, c, 'braceGlow', 0, 8, 0.05, 'flare glow');
  R(brace, c, 'braceTime', 0.05, 2, 0.01, 'cool time (s)');
  R(brace, c, 'launchShake', 0, 0.5, 0.005, 'launch knock');
  R(brace, c, 'launchLight', 0, 10, 0.1, 'launch light');

  const fronts = subFolder(folder, '2 · Shield fronts');
  const sheet = subFolder(fronts, 'Sheet');
  sheet.addColor(c, 'coreColor').name('ramp · core');
  sheet.addColor(c, 'edgeColor').name('ramp · pale (edge)');
  sheet.addColor(c, 'bodyColor').name('ramp · body (pressure)');
  sheet.addColor(c, 'deepColor').name('ramp · deep');
  R(sheet, c, 'frontDensity', 0, 1, 0.01, 'wall density');
  R(sheet, c, 'frontClear', 0.05, 6, 0.05, 'rises over (m past the brace)');
  R(sheet, c, 'frontHeight', 0.3, 5, 0.05, 'height (m)');
  R(sheet, c, 'frontGlow', 0, 6, 0.05, 'glow');
  R(sheet, c, 'frontOpacity', 0, 2, 0.01, 'opacity');
  R(sheet, c, 'frontNoise', 0, 2, 0.01, 'pressure cells');
  R(sheet, c, 'frontNoiseScale', 0.2, 10, 0.05, 'cell scale');
  R(sheet, c, 'shimmerSpeed', 0, 30, 0.1, 'slash speed');
  R(sheet, c, 'frontRim', 0, 2, 0.01, 'crest rim');
  R(sheet, c, 'spentFade', 0.01, 0.6, 0.01, 'break-up length (× lane)');
  const ribs = subFolder(fronts, 'Ribs + fins');
  R(ribs, c, 'ribGlow', 0, 6, 0.05, 'rib glow');
  R(ribs, c, 'ribOpacity', 0, 1, 0.01, 'rib opacity');
  R(ribs, c, 'finSize', 0.04, 0.5, 0.01, 'fin size');
  R(ribs, c, 'finSpread', 0, 3, 0.1, 'break spread');
  R(ribs, c, 'finGlow', 0, 6, 0.05, 'fin glow');

  const ground = subFolder(folder, '3 · Ground scour');
  ground.addColor(c, 'groundColor').name('scour');
  R(ground, c, 'groundOpacity', 0, 2, 0.01, 'opacity');
  R(ground, c, 'groundGlow', 0, 6, 0.05, 'glow');
  R(ground, c, 'scourWidth', 0.05, 3, 0.01, 'fresh band (× width)');
  R(ground, c, 'groundDeep', 0, 1.5, 0.01, 'scorched base');
  R(ground, c, 'groundSeams', 0, 2, 0.01, 'pressure seams');
  R(ground, c, 'coolTime', 0.05, 4, 0.05, 'cools over (s)');
  R(ground, c, 'aftershock', 0, 2, 0.01, 'aftershock ripples');
  R(ground, c, 'aftershockSpeed', 0, 12, 0.1, 'aftershock speed (m/s)');
  R(ground, c, 'lingerTime', 0.2, 4, 0.05, 'linger (s, presentation only)');
  R(ground, c, 'dustRate', 0, 200, 1, 'grit/second per front');
  R(ground, c, 'dustSize', 0.01, 0.5, 0.005, 'grit size');
  R(ground, c, 'dustLife', 0.1, 4, 0.05, 'grit lifetime');
  ground.addColor(c, 'dustColor').name('grit tint');

  const contact = subFolder(folder, '4 · Spray + contact');
  R(contact, c, 'sprayCount', 0, 96, 1, 'spray per burst');
  R(contact, c, 'sprayEvery', 0.25, 8, 0.05, 'burst every (m)');
  R(contact, c, 'spraySize', 0.01, 0.4, 0.005, 'spray size');
  R(contact, c, 'sprayLife', 0.05, 2, 0.01, 'spray lifetime');
  R(contact, c, 'spraySpeed', 0, 20, 0.1, 'spray speed');
  R(contact, c, 'particleGravity', -20, 5, 0.1, 'particle gravity');
  R(contact, c, 'particleDrag', 0, 4, 0.01, 'particle drag');
  gradient(contact, c, 'colorSpray', 'particle gradient (all layers)');
  R(contact, c, 'contactSize', 0.2, 3, 0.1, 'petal size');
  R(contact, c, 'contactLife', 0.1, 1, 0.05, 'petal time (s)');
  R(contact, c, 'chipCount', 0, 64, 1, 'shards');
  R(contact, c, 'chipSize', 0.01, 0.4, 0.005, 'shard size');
  R(contact, c, 'chipLife', 0.05, 2, 0.01, 'shard lifetime');
  R(contact, c, 'chipSpeed', 0, 20, 0.1, 'shard speed');
  contact.addColor(c, 'chipColor').name('shard tint');
  R(contact, c, 'contactLight', 0, 10, 0.1, 'contact light');

  const brk = subFolder(folder, '5 · The break');
  R(brk, c, 'wakeTime', 0.1, 2, 0.01, 'wake life (s)');
  R(brk, c, 'wakeGrowth', 0.1, 4, 0.05, 'wake spread (× width)');
  R(brk, c, 'wakeOpacity', 0, 1, 0.01, 'wake opacity');
  R(brk, c, 'impactShake', 0, 1, 0.01, 'first break knock');
  R(brk, c, 'impactFlash', 0, 1, 0.01, 'first break flash');
  R(brk, c, 'arrivalShake', 0, 1, 0.01, 'later break knock');
  R(brk, c, 'arrivalLight', 0, 12, 0.1, 'light per break');
  R(brk, c, 'shockRadius', 0, 10, 0.05, 'shockwave (m)');
  R(brk, c, 'burstSize', 0, 8, 0.05, 'pressure shell (m)');
  R(brk, c, 'burstOpacity', 0, 1, 0.01, 'pressure shell opacity');

  const warp = subFolder(folder, '6 · Distortion');
  R(warp, c, 'warpStrength', 0, 3, 0.01, 'strength');
  R(warp, c, 'warpHeight', 0.2, 6, 0.05, 'height (m)');
  R(warp, c, 'warpScale', 0.1, 8, 0.05, 'noise scale');
  R(warp, c, 'warpSpeed', 0, 8, 0.05, 'noise speed');

  return folder;
}
