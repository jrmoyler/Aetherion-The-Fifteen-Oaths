import { Group, Vector3 } from 'three';
import { Ability as BaseAbility, AbilityPhase } from '../../Ability.js';
import { settings } from '../../../config/settings.js';
import { frame } from '../../../core/FrameUniforms.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { getColor } from '../../../utils/color.js';
import { bindExpansionCombat } from '../StandaloneCombat.js';
import { impactForce } from '../ImpactForce.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { createExpansionFX, expansionImpact, ParticleShape } from '../ExpansionFX.js';
import { CINDER_CONFIG, GLACIER_CONFIG } from './config.js';
import { createPhaseEffects } from './PhaseEffects.js';
import { createAuthoredStages, updateAuthoredStages } from './AuthoredStages.js';
import { createCandidateMonument, updateCandidateMonument } from './CandidateMonuments.js';
import { createTravelDelivery, resetTravelDelivery, updateTravelDelivery, endTravelDelivery } from './TravelDelivery.js';
import { createImpactFragments, updateImpactFragments } from './ImpactFragments.js';
import { createContacts, clearContacts, addContact, updateContacts } from './ContactEffects.js';
import { createElementalGround, updateElementalGround } from './ElementalGround.js';
import { createResonance, updateResonance } from './ResonanceChoreography.js';
import { createPulseWarp, createSculpture, createTelegraphRing } from './PulseAtmosphere.js';
import { castAnimation, gradient, rangeOf, subFolder } from './EditorKit.js';
import { syncPulseGlobals } from './PulseUniforms.js';
import { createGlacierBody, updateGlacierBody } from './GlacierBellBody.js';

export { CINDER_CONFIG, GLACIER_CONFIG };

const CINDER_UID = 'matrix-expansion/cinder-crown';
const GLACIER_UID = 'matrix-expansion/glacier-bell';
/** Bodies one strike may reach (and frost may remember) per cast. */
const MAX_STRIKE = 32;

const clamp = (n) => Math.max(0, Math.min(1, n));
const _pos = new Vector3();
const _up = new Vector3(0, 1, 0);
const _emit = {};
/** Scratch query point: queries read it immediately and never retain it. */
const _queryPos = [0, 0, 0];

/** One pooled particle emission with the globals applied, reusing `_emit`. */
function emitParticles(system, count, position, radius, direction, speed, spread, size, life, spin) {
  if (!system) return;
  const g = settings.global;
  const n = Math.min(128, Math.max(0, Math.round(count * g.particleCount)));
  _emit.position = position;
  _emit.radius = radius;
  _emit.direction = direction;
  _emit.speed = speed * g.particleSpeed;
  _emit.speedVariance = 0.4;
  _emit.spread = spread;
  _emit.inherit = null;
  _emit.anchor = null;
  _emit.size = size * g.particleSize;
  _emit.sizeVariance = 0.4;
  _emit.life = life * g.particleLifetime;
  _emit.lifeVariance = 0.3;
  _emit.spin = spin;
  _emit.tint = null;
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
 * CINDER CROWN / GLACIER BELL — two pulses from one engine.
 *
 * Both are zone casts in three acts. The **travel** is the delivery (a flame
 * wedge lobbed low, or an ice needle lobbed high and spinning) on its arc
 * with a sampled line trail and particle trail, while the telegraph ring
 * marks the landing at full radius. The **impact** is where they diverge:
 *
 *  - *Cinder Crown* strikes everything in `zoneRadius` on landing and again
 *    at `secondPulse` through the phase. Each strike is a beat: the coal
 *    heart's cracks flood, the crown plates and ember crown flare to full
 *    height, a shock front runs across the scorch seal, splinters fly, a
 *    fire shell and scorch decal, shake, flash and a light punch.
 *  - *Glacier Bell* rings once: the frost front grows from the centre to
 *    `zoneRadius` across the phase and strikes each enemy once as it passes.
 *    The lattice, shards, rime seal and refraction band all sit *exactly* on
 *    that growing radius — what you see reach a body is what hits it — and
 *    the striker swings in a decaying ring-out.
 *
 * The **linger** is the fade: embers or frost motes stop, a release burst
 * (smoke or frost) lets go exactly once on the first live fade frame, and
 * every layer dissolves on the same `fade` ramp. Nothing pops.
 *
 * Layers (each a folder in the editor): 1 delivery · 2 telegraph, sculpture,
 * phase spears + motes, authored crown/lattice · 3 monument (lit solid,
 * fresnel shell, shafts) · 4 strike beat (burst particles, shell, decals,
 * fragments, contacts) · 5 ground seal · 6 resonance · 7 ambient + release ·
 * 8 distortion.
 *
 * ## Gameplay is the contract
 *
 * Strike timing, radius, the once-per-target frost rule, the UCSM `hit`
 * event and the direct-dummy fallback are the candidate's own (`_strike`).
 * A zero-length frame renders without committing anything, so a paused
 * game never strikes.
 *
 * ## Globals
 *
 * Every layer answers to `settings.global`: one shader clock (`_clock`,
 * integrated at `animationSpeed × noiseSpeed`) drives them all; opacity,
 * noise frequency/strength and fresnel reach every material through the
 * shared `PulseUniforms` boxes; glow and shader intensity through the frame
 * uniforms; strike shake, flash, light, shell and shockwave scale with
 * `explosionIntensity`; particle counts, sizes, speeds and lifetimes with the
 * particle globals; the warp with `distortion`.
 *
 * ## Reduced motion
 *
 * With `prefers-reduced-motion`, every shader clock is held at zero, the
 * delivery does not spin, ambient and trail particles are not emitted, and
 * resonance holds still. Strikes and their timing are unchanged.
 */
class PulseAbility extends BaseAbility {
  constructor(id, ctx, fire) {
    super(id, ctx);
    this.fire = fire;
  }

  get handlesOwnHits() {
    return true;
  }

  get impactDuration() {
    return this.config.lifetime;
  }

  get fadeDuration() {
    return Math.max(0.05, this.config.fadeTime ?? 0.6);
  }

  /** Live contact cues. HUD readout only. */
  get instanceCount() {
    return this.contacts?.mesh.count ?? 0;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    // Called by the base constructor before `this.fire` is assigned, so the
    // element is read from the id.
    const fire = this.element === CINDER_CONFIG.id;
    this.resources = [];
    this.root = new Group();
    this.group.add(this.root);

    /* 1 · the delivery flies in world space, not under the landing root */
    this.delivery = createTravelDelivery(this.group, this.resources, fire);
    /* 2 · telegraph, sculpture, spears + motes, authored stage */
    this.surface = createSculpture(this.root, this.resources, fire);
    this.ring = createTelegraphRing(this.root, this.resources, fire);
    this.detail = createPhaseEffects(this.root, this.resources, fire);
    this.authored = createAuthoredStages(this.root, this.resources, !fire);
    /* 3 · monument */
    this.monument = createCandidateMonument(this.root, this.resources, fire);
    /* 4 · fragments + contacts */
    this.fragments = createImpactFragments(this.root, this.resources, fire);
    this.contacts = createContacts(this.root, this.resources, fire);
    /* 5 · ground seal */
    this.ground = createElementalGround(this.root, this.resources, fire);
    /* 6 · resonance */
    this.resonance = createResonance(this.root, this.resources, fire);
    /* 8 · distortion */
    this.warp = createPulseWarp(this.root, this.resources, fire);
    /* 3b · Glacier Bell only: the zone-scale ice bell, its spikes, the deep floor */
    this.body = fire ? null : createGlacierBody(this.root, this.resources);
    this._bodyState = fire ? null : { active: false, since: 0, q: 0, fade: 1, clock: 0, c: null, direction: this.direction, energy: 0, reduced: false };

    this.found = [];
    this.hit = new Set();
    this.target = new Vector3();
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._warpKick = 0;
    /** The cast's shader clock, seconds scaled by the global speeds. */
    this._clock = 0;
    this._disposed = false;
  }

  createParticles() {
    const fire = this.element === CINDER_CONFIG.id;
    const id = this.element;
    const shape = fire ? ParticleShape.STREAK : ParticleShape.CHIP;
    // The strike burst system is named for the cast itself; it is emitted
    // only by `_burst`, once per strike beat.
    this.fx = createExpansionFX(this.ctx, id, { shape });
    this.travelFx = createExpansionFX(this.ctx, `${id}.delivery`, { capacity: 160, shape });
    this.releaseFx = createExpansionFX(this.ctx, `${id}.release`, {
      capacity: 192,
      shape: fire ? ParticleShape.SMOKE : ParticleShape.CHIP,
      additive: !fire,
    });
    this.ambientFx = createExpansionFX(this.ctx, `${id}.ambient`, {
      capacity: 240,
      shape: fire ? ParticleShape.STREAK : ParticleShape.SOFT,
    });
    this.ambientEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.scope = bindExpansionCombat(this.ctx, this.fire ? CINDER_UID : GLACIER_UID);
    this.failure = null;
    this.released = false;
    this.travelElapsed = 0;
    this._warpKick = 0;
    this._clock = 0;
    this.ambientEmitter.reset();
    clearContacts(this.contacts);
    resetTravelDelivery(this.delivery);
    const c = this.config;
    updateTravelDelivery(this.delivery, this.origin, this.direction, 0, 0, c.accentColor, c.deliveryScale, 0, c.deliveryArc, prefersReducedMotion(), c.coreColor, c.deliveryGlow, settings.global.opacity);
    this.hit.clear();
    this.second = false;
    this.root.visible = true;
    this.target.copy(this.origin).addScaledVector(this.direction, this.length);
    this._sync(1, 0);
  }

  onTravel(dt) {
    const c = this.config;
    const reduced = prefersReducedMotion();
    this._tick(dt);
    updateTravelDelivery(this.delivery, this.position, this.direction, dt, this._shaderClock(), c.accentColor, c.deliveryScale, this.u, c.deliveryArc, reduced, c.coreColor, c.deliveryGlow, settings.global.opacity);
    // A fixed cadence of small trail bursts, at most one per frame, at the
    // delivery's real arcing position.
    const rate = Math.max(0, c.travelRate);
    if (dt > 0 && rate > 0 && !reduced) {
      this.travelElapsed += dt;
      const interval = 1 / rate;
      if (this.travelElapsed >= interval) {
        this.travelElapsed = Math.min(interval, this.travelElapsed - interval);
        tuneSystem(this.travelFx, c, 'colorTrail', this.fire ? 1 : -1, 1.4);
        emitParticles(this.travelFx, c.travelParticles, this.delivery.group.position, 0.1, _up, c.trailSpeed, 1, c.trailSize, c.trailLife, 2);
      }
    }
    this._sync(1, 0);
  }

  onImpact() {
    endTravelDelivery(this.delivery);
    this._sync(1, 0);
    this._burst();
    if (this.fire) this._strike(this.config.zoneRadius, false);
  }

  onFade(dt, t) {
    const c = this.config;
    const q = clamp(t);
    this._tick(dt);
    const fade = t > 1 ? 2 - t : 1;
    if (dt > 0 && t > 1 && !this.released) {
      this.released = true;
      this._release();
    }
    if (dt > 0 && t <= 1) {
      if (this.fire && !this.second && q >= c.secondPulse) {
        this.second = true;
        this._burst();
        this._strike(c.zoneRadius, false);
      } else if (!this.fire) {
        this._strike(c.zoneRadius * q, true);
      }
      this._ambient(dt, q);
    }
    if (dt > 0) this._warpKick = Math.max(0, this._warpKick - dt * 3);
    updateContacts(this.contacts, dt, c.coreColor, c.contactScale, fade, prefersReducedMotion(), c.contactLife, this._shaderClock());
    this._sync(fade, q);
  }

  /* ------------------------------------------------------------------ */
  /* Beats                                                               */
  /* ------------------------------------------------------------------ */

  /** One strike beat: the burst particles plus its shell, decals, shake, flash, light. */
  _burst() {
    const c = this.config;
    const g = settings.global;
    tuneSystem(this.fx, c, 'colorBurst', this.fire ? 0.5 : -3, 1.2);
    emitParticles(this.fx, c.particleCount, this.target, c.zoneRadius * 0.6, _up, c.burstSpeed, 0.8, c.burstSize, c.burstLife, 2);

    _pos.copy(this.target).setY(0.5);
    this.ctx.bursts?.spawn(this.fire ? BurstMode.FIRE : BurstMode.FROST, _pos, {
      radius: 0.3,
      endRadius: c.zoneRadius * c.burstShell * 0.6 * g.explosionIntensity,
      life: this.fire ? 0.6 : 0.8,
      intensity: 1,
      opacity: 0.7,
      squash: 0.45,
      colorA: getColor(c.coreColor),
      colorB: getColor(c.accentColor),
      colorC: getColor(c.groundColor),
    });
    _pos.y = 0;
    this.ctx.decals?.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.zoneRadius * c.shockRadius * g.explosionIntensity,
      life: 0.6,
      width: 0.07,
      intensity: 1,
      colorA: getColor(c.coreColor),
      colorB: getColor(c.accentColor),
    });
    this.ctx.decals?.spawn(this.fire ? DecalType.SCORCH : DecalType.FROST, _pos, {
      radius: c.zoneRadius * 0.9,
      life: c.decalLife,
      intensity: 0.8,
      growth: this.fire ? 0 : 0.6,
      colorA: getColor(c.groundColor),
      colorB: getColor(c.coreColor),
    });
    // expansionImpact applies global.cameraShake; strike power scales both.
    expansionImpact(this.ctx, c.lightColor, c.impactShake * g.explosionIntensity, c.impactFlash * g.explosionIntensity);
    this.lightBoost = c.pulseLight * g.explosionIntensity;
    this._warpKick = 1;
  }

  /** The let-go: one bounded release burst at the circle. */
  _release() {
    const c = this.config;
    tuneSystem(this.releaseFx, c, 'colorRelease', this.fire ? 0.6 : -1.5, 1.6);
    emitParticles(this.releaseFx, c.releaseParticles, this.target, c.zoneRadius * 0.7, _up, c.releaseSpeed, 1, c.releaseSize, c.releaseLife, 2);
    this.lightBoost = Math.max(this.lightBoost, c.releaseLight);
  }

  /** Embers climb off the coal; frost motes drift inside the grown ring. */
  _ambient(dt, q) {
    const c = this.config;
    if (prefersReducedMotion() || !this.ambientFx) return;
    const count = this.ambientEmitter.tick(dt, c.ambientRate);
    if (count <= 0) return;
    tuneSystem(this.ambientFx, c, 'colorAmbient', this.fire ? c.ambientRise * 0.5 : 0.1, 0.8);
    const reach = this.fire ? c.zoneRadius * 0.45 : c.zoneRadius * Math.max(0.1, q) * 0.8;
    _pos.copy(this.target).setY(0.2);
    emitParticles(this.ambientFx, count, _pos, reach, _up, c.ambientRise, 0.35, c.ambientSize, c.ambientLife, 1);
  }

  /* ------------------------------------------------------------------ */
  /* The strike (combat-bound)                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Strike within `radius` of the circle. `once` is frost's rule: each body
   * is struck at most once per cast.
   */
  _strike(radius, once) {
    const c = this.config;
    if (radius <= 0) return;
    if (this.scope) {
      _queryPos[0] = this.target.x;
      _queryPos[2] = this.target.z;
      const targets = this.scope.queryActors({ position: _queryPos, radius, relation: 'enemy' });
      if (!targets.ok) {
        this.failure = targets.reason;
        return;
      }
      for (const actor of targets.actors) {
        if (once && (this.hit.has(actor.id) || this.hit.size >= MAX_STRIKE)) continue;
        const dx = actor.position[0] - this.target.x;
        const dz = actor.position[2] - this.target.z;
        if (Math.hypot(dx, dz) > radius) continue;
        const result = this.scope.emit({
          type: 'hit',
          element: this.fire ? 'fire' : 'frost',
          targetIds: [actor.id],
          position: actor.position,
          // Queued by the bridge, so each event owns its arrays.
          sourcePosition: [this.target.x, 0, this.target.z],
          damage: 1,
          hitForce: impactForce({ hitImpulse: c.impulse, hitLift: c.lift, hitSpin: 0 }, settings.global.explosionIntensity),
          tags: [this.element],
        });
        if (!result.ok) {
          this.failure = result.reason;
          continue;
        }
        addContact(this.contacts, dx, dz);
        if (once) this.hit.add(actor.id);
      }
      return;
    }
    if (!this.ctx.dummies?.findTargets) return;
    this.found.length = 0;
    const found = this.ctx.dummies.findTargets(this.target.x, this.target.z, radius, this.found) || this.found;
    const power = settings.global.explosionIntensity;
    this._force.impulse = c.impulse * power;
    this._force.lift = c.lift * power;
    this._force.spin = 0;
    for (let i = 0; i < Math.min(found.length, MAX_STRIKE); i++) {
      const d = found[i];
      if (!d?.position || typeof d.kill !== 'function' || (once && (this.hit.has(d) || this.hit.size >= MAX_STRIKE))) continue;
      const dx = d.position.x - this.target.x;
      const dz = d.position.z - this.target.z;
      const dist = Math.hypot(dx, dz);
      if (dist > radius) continue;
      // Pushed straight away from the centre (down the cast line if dead centre).
      const x = dist > 1e-6 ? dx / dist : this.direction.x;
      const z = dist > 1e-6 ? dz / dist : this.direction.z;
      if (d.kill(x, z, this._force)) {
        addContact(this.contacts, dx, dz);
        if (once) this.hit.add(d);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame resolve                                                   */
  /* ------------------------------------------------------------------ */

  /** Advance the shader clock; a zero-length (paused) frame holds it. */
  _tick(dt) {
    if (dt <= 0) return;
    const g = settings.global;
    this._clock += dt * g.animationSpeed * g.noiseSpeed;
  }

  /** The clock every layer reads: held at zero under reduced motion. */
  _shaderClock() {
    return prefersReducedMotion() ? 0 : this._clock;
  }

  /**
   * @param {number} fade 1 through the impact, ramping to 0 over the fade
   * @param {number} q    0..1 through the impact phase
   */
  _sync(fade, q) {
    const c = this.config;
    const radius = c.zoneRadius;
    const reduced = prefersReducedMotion();
    const clock = this._shaderClock();
    const g = settings.global;
    // Opacity, noise and fresnel globals reach every pulse material at once.
    syncPulseGlobals();
    const pulse = c.secondPulse ?? 0;
    const travelling = this.phase === AbilityPhase.TRAVEL;
    const active = !travelling;

    this.root.position.copy(this.target);
    // The light rides the delivery, then stands over the circle.
    if (travelling) this.position.copy(this.delivery.group.position);
    else this.position.copy(this.target).setY(0.6);

    /* ---- 2 · what only appears once it has landed ---- */
    this.surface.visible = active;
    this.detail.surface.visible = active;
    this.detail.points.visible = active;
    this.authored.stage.visible = active;
    this.monument.group.visible = active;

    this.surface.scale.set(radius, c.sculptureHeight, radius);
    const su = this.surface.material.uniforms;
    su.clock.value = clock;
    su.fade.value = fade;
    su.glow.value = c.sculptureGlow;
    su.opacity.value = c.sculptureOpacity;
    su.tint.value.set(c.accentColor);
    su.core.value.set(c.coreColor);

    // The telegraph is the full radius in flight; after landing fire holds
    // it, frost grows it with the strike radius.
    this.ring.scale.setScalar(radius * (travelling || this.fire ? 1 : Math.max(0.01, q)));
    const ru = this.ring.material.uniforms;
    ru.clock.value = clock;
    ru.opacity.value = (travelling ? c.telegraphOpacity : c.ringOpacity) * fade;
    ru.glow.value = c.ringGlow;
    ru.travel.value = travelling ? 1 : 0;
    ru.tint.value.set(c.accentColor);

    const u = this.detail.uniforms;
    u.clock.value = clock;
    u.fade.value = fade;
    // Fire's spears swell for 0.12 of the phase after each strike.
    u.beat.value = this.fire ? (q < 0.12 || (q >= pulse && q < pulse + 0.12) ? 1 : 0) : q;
    u.glow.value = c.detailGlow;
    u.tint.value.set(c.accentColor);
    this.detail.surface.scale.set(radius, 1, radius);
    this.detail.points.scale.set(radius, 1, radius);

    updateAuthoredStages(this.authored, { radius, q, phase: this.phase, pulse, fade, clock, tint: c.coreColor, detailHeight: c.detailHeight });
    /* ---- 3 ---- */
    updateCandidateMonument(this.monument, {
      q,
      phase: this.phase,
      pulse,
      fade,
      clock,
      tint: c.coreColor,
      scale: c.monumentScale,
      glow: c.monumentGlow,
      color: c.monumentColor,
      emissive: c.monumentEmissive,
      shellGlow: c.shellGlow,
      shellPower: c.shellPower,
    });
    /* ---- 4 ---- */
    updateImpactFragments(this.fragments, { phase: this.phase, q, pulse, radius, fade, scale: c.fragmentScale, glow: c.fragmentGlow, tint: c.coreColor, clock });
    /* ---- 5 ---- */
    updateElementalGround(this.ground, { phase: this.phase, q, pulse, radius, fade, clock, tint: c.groundColor, glow: c.groundGlow, opacity: c.groundOpacity });
    /* ---- 6 ---- */
    updateResonance(this.resonance, { phase: this.phase, q, pulse, fade, scale: c.resonanceScale, amplitude: c.resonanceMotion, tint: c.coreColor, reducedMotion: reduced, clock });

    /* ---- 3b · Glacier Bell's body ---- */
    if (this.body) {
      const bs = this._bodyState;
      bs.active = active;
      bs.since = active ? this.impactTime + (this.phase === AbilityPhase.FADE || this.phase === AbilityPhase.DONE ? this.fadeTime : 0) : 0;
      bs.q = q;
      bs.fade = fade;
      bs.clock = clock;
      bs.c = c;
      bs.energy = active ? 1 - 0.5 * q : 0;
      bs.direction = this.direction;
      bs.reduced = reduced;
      updateGlacierBody(this.body, bs);
    }

    /* ---- 8 · distortion ---- */
    const strength = active ? (c.warpStrength + this._warpKick * c.warpPulse) * fade * g.distortion : 0;
    const wu = this.warp.material.uniforms;
    wu.uStrength.value = strength;
    wu.uScale.value = c.warpScale * g.noiseFrequency;
    wu.uSpeed.value = c.warpSpeed * g.noiseSpeed;
    wu.uWidth.value = this.fire ? radius * 1.2 : radius * 1.05;
    wu.uHeight.value = c.warpHeight;
    // Frost refraction sits on the ring; the quad spans ±1.05 radius.
    wu.uProgress.value = q / 1.05;
    this.warp.visible = strength > 0.001;
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.scope = null;
    clearContacts(this.contacts);
    endTravelDelivery(this.delivery);
    this.root.visible = false;
    this.warp.visible = false;
    if (this.body) this.body.group.visible = false;
    this.hit.clear();
    this.second = false;
    this.released = false;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.onDestroy();
    for (const x of this.resources) x.dispose();
    super.dispose();
  }
}

export class CinderCrownAbility extends PulseAbility {
  constructor(ctx) {
    super(CINDER_CONFIG.id, ctx, true);
  }
}

export class GlacierBellAbility extends PulseAbility {
  constructor(ctx) {
    super(GLACIER_CONFIG.id, ctx, false);
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

function editor(title, gui, c, Editor) {
  const fire = 'secondPulse' in c;
  const folder = gui.addFolder(title);
  const R = rangeOf(Editor);

  const cast = subFolder(folder, 'The cast');
  R(cast, c, 'range', 2, 48, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 1, 60, 0.5, 'delivery speed (m/s)');
  R(cast, c, 'cooldown', 0, 30, 0.1, 'cooldown');
  R(cast, c, 'zoneRadius', 1, 8, 0.1, 'radius (m)');
  R(cast, c, 'lifetime', 0.3, 3, 0.1, 'duration');
  R(cast, c, 'fadeTime', 0.1, 3, 0.05, 'linger (s)');
  castAnimation(cast, c, Editor);

  const attack = subFolder(folder, 'Attack');
  R(attack, c, 'impulse', 0, 20, 0.5, 'impulse');
  R(attack, c, 'lift', 0, 12, 0.5, 'lift');
  if (fire) R(attack, c, 'secondPulse', 0.2, 0.9, 0.01, 'second pulse');

  const light = subFolder(folder, 'Light + palette');
  light.addColor(c, 'lightColor').name('light');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'pulseLight', 0, 20, 0.1, 'punch per strike');
  R(light, c, 'releaseLight', 0, 10, 0.1, 'punch on release');
  light.addColor(c, 'accentColor').name('accent');
  light.addColor(c, 'coreColor').name('core');
  light.addColor(c, 'groundColor').name('ground');

  const delivery = subFolder(folder, '1 · Delivery');
  R(delivery, c, 'deliveryScale', 0.2, 3, 0.05, 'delivery scale');
  R(delivery, c, 'deliveryArc', 0, 4, 0.05, 'delivery arc');
  R(delivery, c, 'deliveryGlow', 0, 6, 0.05, 'delivery glow');
  R(delivery, c, 'travelRate', 0, 20, 0.5, 'trail rate');
  R(delivery, c, 'travelParticles', 0, 8, 1, 'trail particles');
  R(delivery, c, 'trailSize', 0.01, 0.4, 0.005, 'trail size');
  R(delivery, c, 'trailLife', 0.05, 2, 0.01, 'trail lifetime');
  R(delivery, c, 'trailSpeed', 0, 8, 0.05, 'trail speed');
  gradient(delivery, c, 'colorTrail', 'trail gradient');

  const field = subFolder(folder, fire ? '2 · Crown field' : '2 · Bell field');
  R(field, c, 'telegraphOpacity', 0, 1, 0.01, 'landing telegraph');
  R(field, c, 'ringOpacity', 0, 1, 0.01, 'strike ring');
  R(field, c, 'ringGlow', 0, 6, 0.05, 'ring glow');
  R(field, c, 'sculptureHeight', 0.2, 3, 0.05, fire ? 'tongue height' : 'teeth height');
  R(field, c, 'sculptureGlow', 0, 4, 0.05, fire ? 'tongue glow' : 'teeth glow');
  R(field, c, 'sculptureOpacity', 0, 1, 0.01, fire ? 'tongue opacity' : 'teeth opacity');
  R(field, c, 'detailHeight', 0.3, 2, 0.05, fire ? 'crown plate height' : 'lattice height');
  R(field, c, 'detailGlow', 0, 4, 0.05, 'spears + motes glow');

  const monument = subFolder(folder, fire ? '3 · Coal heart' : '3 · Glacier bell');
  R(monument, c, 'monumentScale', 0.3, 3, 0.05, 'centre scale');
  R(monument, c, 'monumentGlow', 0, 3, 0.05, 'centre glow');
  monument.addColor(c, 'monumentColor').name('body');
  monument.addColor(c, 'monumentEmissive').name('emissive');
  R(monument, c, 'shellGlow', 0, 4, 0.05, fire ? 'crack glow' : 'rime glow');
  R(monument, c, 'shellPower', 0.3, 8, 0.05, 'fresnel falloff');

  if (!fire) glacierBodyEditor(folder, c, R);

  const strike = subFolder(folder, '4 · Strike beat');
  R(strike, c, 'impactShake', 0, 1, 0.01, 'impact shake');
  R(strike, c, 'impactFlash', 0, 1, 0.01, 'impact flash');
  R(strike, c, 'burstShell', 0, 3, 0.05, 'pressure shell (× radius)');
  R(strike, c, 'shockRadius', 0, 3, 0.05, 'shockwave (× radius)');
  R(strike, c, 'decalLife', 0.1, 6, 0.05, fire ? 'scorch life' : 'rime life');
  R(strike, c, 'particleCount', 0, 64, 1, 'burst particles');
  R(strike, c, 'burstSize', 0.02, 0.5, 0.005, 'burst size');
  R(strike, c, 'burstLife', 0.1, 3, 0.05, 'burst lifetime');
  R(strike, c, 'burstSpeed', 0, 10, 0.05, 'burst speed');
  gradient(strike, c, 'colorBurst', 'burst gradient');
  R(strike, c, 'fragmentScale', 0.1, 3, 0.05, 'fragment scale');
  R(strike, c, 'fragmentGlow', 0, 3, 0.05, 'fragment glow');
  R(strike, c, 'contactScale', 0.2, 3, 0.05, 'contact scale');
  R(strike, c, 'contactLife', 0.05, 2, 0.01, 'contact life (s)');

  const ground = subFolder(folder, '5 · Ground seal');
  R(ground, c, 'groundGlow', 0, 3, 0.05, 'ground glow');
  R(ground, c, 'groundOpacity', 0, 1, 0.01, 'ground opacity');

  const resonance = subFolder(folder, fire ? '6 · Ember crown' : '6 · Striker');
  R(resonance, c, 'resonanceScale', 0.2, 3, 0.05, 'resonance scale');
  R(resonance, c, 'resonanceMotion', 0, 2, 0.05, 'resonance motion');

  const ambient = subFolder(folder, fire ? '7 · Embers + release' : '7 · Frost motes + release');
  R(ambient, c, 'ambientRate', 0, 120, 1, 'per second');
  R(ambient, c, 'ambientSize', 0.01, 0.4, 0.005, 'size');
  R(ambient, c, 'ambientLife', 0.1, 4, 0.05, 'lifetime');
  R(ambient, c, 'ambientRise', 0, 6, 0.05, 'rise (m/s)');
  gradient(ambient, c, 'colorAmbient', fire ? 'ember gradient' : 'mote gradient');
  R(ambient, c, 'releaseParticles', 0, 64, 1, 'release particles');
  R(ambient, c, 'releaseSize', 0.02, 1, 0.01, 'release size');
  R(ambient, c, 'releaseLife', 0.1, 4, 0.05, 'release lifetime');
  R(ambient, c, 'releaseSpeed', 0, 8, 0.05, 'release speed');
  gradient(ambient, c, 'colorRelease', 'release gradient');

  const warp = subFolder(folder, '8 · Distortion');
  R(warp, c, 'warpStrength', 0, 3, 0.01, fire ? 'heat shimmer' : 'cold refraction');
  R(warp, c, 'warpPulse', 0, 4, 0.01, 'extra per strike');
  // Fire's shimmer is a standing column; frost's a floor band riding the ring.
  R(warp, c, 'warpHeight', 0.1, 8, 0.05, fire ? 'height (m)' : 'band width (m)');
  R(warp, c, 'warpScale', 0.1, 8, 0.05, 'noise scale');
  R(warp, c, 'warpSpeed', 0, 8, 0.05, 'noise speed');
  return folder;
}

/** Glacier Bell only: the bell body, its spikes and the deep ice floor. */
function glacierBodyEditor(folder, c, R) {
  const bell = subFolder(folder, '3b · The bell (body)');
  R(bell, c, 'bellRadius', 0.1, 1, 0.01, 'lip radius (× radius)');
  R(bell, c, 'bellHeight', 0.5, 3, 0.01, 'height (× lip)');
  R(bell, c, 'bellHang', 0, 3, 0.01, 'hangs above floor (m)');
  R(bell, c, 'bellDrop', 0, 10, 0.05, 'drops from (m)');
  R(bell, c, 'bellDropTime', 0.02, 1, 0.01, 'fall time (s)');
  R(bell, c, 'bellSwing', 0, 0.8, 0.005, 'swing (rad)');
  R(bell, c, 'bellSwingRate', 0.1, 4, 0.01, 'swings per second');
  R(bell, c, 'bellSwingDecay', 0, 5, 0.01, 'swing decay');
  R(bell, c, 'bellQuiver', 0, 0.2, 0.001, 'lip quiver');
  R(bell, c, 'bellRingBand', 0, 5, 0.01, 'ring band glow');
  R(bell, c, 'bellRimeCrawl', 0, 1, 0.01, 'rime crawl');
  R(bell, c, 'bellDissolveStart', 0.05, 1, 0.01, 'dissolves below fade');
  R(bell, c, 'bellFacet', 0, 2, 0.01, 'facet contrast');
  R(bell, c, 'bellCrackGlow', 0, 3, 0.01, 'inner veins');
  R(bell, c, 'bellSpecular', 0, 8, 0.05, 'glints');
  bell.addColor(c, 'iceCore').name('ice core');
  bell.addColor(c, 'iceTint').name('ice tint');
  bell.addColor(c, 'iceBody').name('ice body');
  bell.addColor(c, 'iceDeep').name('ice deep');
  bell.addColor(c, 'rimeColor').name('rime');

  const spikes = subFolder(folder, '3c · Glacier spikes');
  R(spikes, c, 'spikeCount', 0, 32, 1, 'spikes');
  R(spikes, c, 'spikeHeight', 0.1, 4, 0.01, 'height (m)');
  R(spikes, c, 'spikeWidth', 0.02, 1, 0.005, 'width (m)');
  R(spikes, c, 'spikeLean', 0, 1.2, 0.01, 'lean out (rad)');
  R(spikes, c, 'spikeInner', 0, 0.95, 0.01, 'innermost (× radius)');
  R(spikes, c, 'spikeGrowTime', 0.02, 1, 0.01, 'break the floor in (s)');
  R(spikes, c, 'spikeCreep', 0, 1, 0.01, 'creep through linger');
  R(spikes, c, 'spikeSink', 0, 2, 0.01, 'sink on exit');

  const floor = subFolder(folder, '3d · Deep ice floor');
  R(floor, c, 'floorOpacity', 0, 1, 0.01, 'opacity');
  R(floor, c, 'floorCracks', 0, 2, 0.01, 'fracture plates');
  R(floor, c, 'floorRime', 0, 2, 0.01, 'drifted rime');
}

export const cinderEditor = (gui, c, Editor) => editor('♛  Cinder Crown', gui, c, Editor);
export const glacierEditor = (gui, c, Editor) => editor('\u2744  Glacier Bell', gui, c, Editor);

export const DUAL_CANDIDATES = Object.freeze([
  { ID: CINDER_CONFIG.id, uid: CINDER_UID, config: CINDER_CONFIG, Ability: CinderCrownAbility, buildEditor: cinderEditor },
  { ID: GLACIER_CONFIG.id, uid: GLACIER_UID, config: GLACIER_CONFIG, Ability: GlacierBellAbility, buildEditor: glacierEditor },
]);
