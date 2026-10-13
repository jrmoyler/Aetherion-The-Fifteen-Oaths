import { Mesh, PlaneGeometry, RingGeometry, SphereGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createGravitonCoreMaterial,
  createGravitonDiscMaterial,
  createGravitonLensMaterial,
  createGravitonWellMaterial
} from '../../materials/collective/GravitonCollapseMaterials.js';
import { createWellGeometry } from '../../assets/collective/GravitonCollapseGeometry.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing, randRange } from '../../utils/math.js';

export const ID = 'graviton';

const TAU = Math.PI * 2;

/** Bodies one well can hold at once. More than the stage ever stands in a circle. */
const MAX_GRIPS = 10;
/** Points one frame's collapse ejecta is split between, so it is not one hose. */
const BLAST_BATCHES = 6;

const _emit = {};
const _pos = new Vector3();
const _at = new Vector3();
const _core = new Vector3();
const _floor = new Vector3();
const _dir = new Vector3();
const _hand = new Vector3();
const _target = new Vector3();

/**
 * GRAVITON COLLAPSE — a gravity well, not a black hole.
 *
 * The Astral Void (`AstralVoidAbility`) is the other gravity spell in this
 * project, and the two are built to be told apart at a glance. The Void is a
 * *hole in space* — a lensed shadow that erupts a nebula and eats what it
 * catches. This is a *weight*: a dense dark seed thrown to the circle that
 * bends the **floor** under it, gathers matter into a turning disc, hauls every
 * body standing nearby into a huddle under itself — and then, at the end of
 * its life, the well collapses and everything it was holding is hurled back out.
 * The Void takes; the Graviton gives it all back at once. Where the Void reads
 * as violet gas, this reads as stone and gravity: a funnel in the floor with a
 * grid of space-time wound down its throat.
 *
 * Six layers:
 *
 *   1. **the core** — an opaque black sphere (it writes depth, so the far half
 *      of the disc truly passes behind it) with a hot, streaked limb. It whitens
 *      as it is crushed in the last moments before the collapse.
 *   2. **the accretion disc** — a tilted annulus whose bands shear
 *      differentially, hot on its inner edge, Doppler-beamed so one side is
 *      brighter than the other. At the collapse it is flung outward and thins.
 *   3. **the lens** — a camera-facing proxy on LAYER.DISTORTION that pinches
 *      and winds the finished frame toward the core.
 *   4. **the funnel** — the floor itself, sunk in a vertex shader along a
 *      softened inverse-square profile and ruled with a radial/concentric
 *      grid that winds and drains into the throat. After the collapse it rings
 *      like a struck membrane: it overshoots *upward* into a dome and settles.
 *   5. **the infall** — CHIP debris torn off the lip, glowing motes on a shell
 *      round the core and a ground haze, all on the particle engine's swirl
 *      path with a *negative* expansion, so each spirals in and arrives at the
 *      core exactly as it dies.
 *   6. **the collapse** — implosion flash, an outward SHOCKWAVE decal and AIR
 *      burst, stone ejecta, streaks of light and a dust ring, a scar left in
 *      the floor, camera shake and a light punch.
 *
 * ## The bodies
 *
 * `handlesOwnHits` is true. A body **standing** inside the reach is not killed
 * on arrival: it is dragged — its root slid inward and wound round the axis,
 * eased in over `pullWindUp`, and lifted off the floor the closer it gets —
 * until the bodies are huddled under the core. A body **already down** is
 * steered through `Dummy#carry` with the well carrying part of its weight. Then
 * on the collapse every one of them is thrown *outward*: the living through
 * `Dummy#kill` along the radial, the corpses by one full-grab `carry` onto an
 * outward velocity. If the cast is retired early the grip lets go and anything
 * still standing is put back on the floor.
 *
 * ## The editor rule
 *
 * Like the originals, a cast records nothing but a seed and its own clocks.
 * Every metre and second — the core, the disc, the funnel's depth and throat,
 * the grip — is resolved against `settings.graviton` every frame, so dragging
 * `wellDepth` while the well is open re-sinks the floor under the bodies.
 */
export class GravitonCollapseAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /** The well picks who it holds, holds them, and decides when they are thrown. */
  get handlesOwnHits() {
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the core ---- */
    this.coreGeometry = new SphereGeometry(1, 48, 32);
    this.coreMaterial = createGravitonCoreMaterial();
    this.core = new Mesh(this.coreGeometry, this.coreMaterial);
    this.core.name = 'GravitonCore';
    this.core.layers.set(LAYER.VFX);
    this.core.renderOrder = 3;
    this.core.frustumCulled = false;
    this.core.visible = false;
    this.group.add(this.core);

    /* ---- layer 2: the accretion disc ---- */
    // Unit annulus; the inner edge is cut in the shader, so `discInner` and
    // `coreRadius` can move without rebuilding anything.
    this.discGeometry = new RingGeometry(0.02, 1, 160, 12);
    this.discMaterial = createGravitonDiscMaterial();
    this.disc = new Mesh(this.discGeometry, this.discMaterial);
    this.disc.name = 'GravitonDisc';
    this.disc.layers.set(LAYER.VFX);
    this.disc.renderOrder = 12;
    this.disc.frustumCulled = false;
    this.disc.visible = false;
    this.disc.rotation.order = 'YXZ';
    this.group.add(this.disc);

    /* ---- layer 3: the lens ---- */
    this.lensGeometry = new PlaneGeometry(1, 1);
    this.lensMaterial = createGravitonLensMaterial();
    this.lens = new Mesh(this.lensGeometry, this.lensMaterial);
    this.lens.name = 'GravitonLens';
    this.lens.layers.set(LAYER.DISTORTION);
    this.lens.frustumCulled = false;
    this.lens.visible = false;
    this.group.add(this.lens);

    /* ---- layer 4: the funnel ---- */
    // Left at the origin with an identity transform: the vertex stage places
    // every vertex from uniforms, so the matrix must not move it again.
    this.wellGeometry = createWellGeometry(144, 56, 1.75);
    this.wellMaterial = createGravitonWellMaterial();
    this.well = new Mesh(this.wellGeometry, this.wellMaterial);
    this.well.name = 'GravitonWell';
    this.well.layers.set(LAYER.VFX);
    // Under the decals and every particle, so a scorch or a chip lands on it.
    this.well.renderOrder = 4;
    this.well.frustumCulled = false;
    this.well.visible = false;
    this.group.add(this.well);

    /** Per-cast state. Clocks and a seed — never a metre. */
    this._seed = 0;
    /** Seconds since the well opened. */
    this._hold = 0;
    /** Seconds since the collapse. */
    this._after = 0;
    this._collapsed = false;
    /** Whether the crush window's inrush has been thrown yet. */
    this._crushFired = false;
    /** The disc's own integrated clock — see the material on why it is not global. */
    this._discClock = 0;
    /** The funnel grid's clock. */
    this._wellClock = 0;

    /** The bodies this well has hold of. Pre-allocated slots; `_gripCount` are live. */
    this._grips = [];
    for (let i = 0; i < MAX_GRIPS; i++) {
      this._grips.push({ dummy: null, time: 0, standing: false, angle: 0, radius: 0 });
    }
    this._gripCount = 0;
    this._found = [];
    /** Refilled from settings at the collapse; handed to `Dummy#kill`. */
    this._force = { impulse: 0, lift: 0, spin: 0 };

    /** What `_sampleFlow` reads. Refilled per frame; the sampler allocates nothing. */
    this._flow = { cx: 0, cy: 0, cz: 0, pull: 0, swirl: 0, well: 1, out: 0, up: 0 };
    /** Bound once — `Dummy#carry` is handed this every frame for every corpse. */
    this._field = (x, y, z, out) => this._sampleFlow(x, y, z, out);

    // Scratch state handed to the materials, one object apiece and reused.
    this._coreState = { heat: 0, fade: 1, seed: 0 };
    this._discState = { clock: 0, inner: 0.3, heat: 0, fade: 1, seed: 0 };
    this._lensState = { size: 1, core: 0, strength: 0 };
    this._wellState = { centre: new Vector3(), reach: 4, depth: 0, clock: 0, open: 0, fade: 1, seed: 0 };
  }

  createParticles() {
    const particles = this.ctx.particles;

    // Stone torn off the lip. Lit chips on the swirl path, weightless: with a
    // negative expansion their orbit collapses onto the core over their life.
    this.debris = particles.get('graviton.debris', {
      capacity: 1600,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      swirl: true,
      softFade: 0.2
    });
    this.debris.uniforms.uDrag.value = 0.6;
    this.debris.uniforms.uEndSize.value = 0.35;
    this.debris.uniforms.uSizeIn.value = 0.08;
    this.debris.uniforms.uFadeIn.value = 0.08;
    this.debris.uniforms.uFadeOut.value = 0.25;
    this.debris.uniforms.uGravity.value.set(0, 0, 0);
    this.debris.uniforms.uTurbulence.value = 0.05;

    // Glowing dust drawn into the core on a shell.
    this.motes = particles.get('graviton.motes', {
      capacity: 3000,
      shape: ParticleShape.SOFT,
      additive: true,
      swirl: true,
      softFade: 0.3
    });
    this.motes.uniforms.uDrag.value = 0.4;
    this.motes.uniforms.uEndSize.value = 0.25;
    this.motes.uniforms.uSizeIn.value = 0.05;
    this.motes.uniforms.uFadeIn.value = 0.12;
    this.motes.uniforms.uFadeOut.value = 0.3;
    this.motes.uniforms.uGravity.value.set(0, 0, 0);
    this.motes.uniforms.uTurbulence.value = 0.02;

    // Ground haze rolling over the lip and down the throat. Non-additive, so
    // it darkens the floor rather than lighting it.
    this.haze = particles.get('graviton.haze', {
      capacity: 600,
      shape: ParticleShape.SMOKE,
      additive: false,
      swirl: true,
      softFade: 0.8
    });
    this.haze.uniforms.uDrag.value = 1.0;
    this.haze.uniforms.uEndSize.value = 0.5;
    this.haze.uniforms.uSizeIn.value = 0.25;
    this.haze.uniforms.uFadeIn.value = 0.3;
    this.haze.uniforms.uFadeOut.value = 0.4;
    this.haze.uniforms.uGravity.value.set(0, 0, 0);
    this.haze.uniforms.uTurbulence.value = 0.1;

    // Streaks of light: the seed's trail and the collapse's flash of ejecta.
    this.sparks = particles.get('graviton.sparks', {
      capacity: 2000,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.25
    });
    this.sparks.uniforms.uDrag.value = 2.2;
    this.sparks.uniforms.uEndSize.value = 0.2;
    this.sparks.uniforms.uSizeIn.value = 0.03;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.45;
    this.sparks.uniforms.uStretch.value = 0.08;
    this.sparks.uniforms.uGravity.value.set(0, -2.0, 0);

    // The stone the collapse throws out. Real gravity: this one falls.
    this.ejecta = particles.get('graviton.ejecta', {
      capacity: 1200,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      stretch: true,
      softFade: 0.2
    });
    this.ejecta.uniforms.uDrag.value = 0.7;
    this.ejecta.uniforms.uEndSize.value = 0.7;
    this.ejecta.uniforms.uSizeIn.value = 0.03;
    this.ejecta.uniforms.uFadeIn.value = 0.02;
    this.ejecta.uniforms.uFadeOut.value = 0.5;
    this.ejecta.uniforms.uGravity.value.set(0, -9.0, 0);

    // The ring of dust the shock lifts.
    this.dust = particles.get('graviton.dust', {
      capacity: 900,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 1.0
    });
    this.dust.uniforms.uDrag.value = 1.9;
    this.dust.uniforms.uEndSize.value = 2.6;
    this.dust.uniforms.uSizeIn.value = 0.12;
    this.dust.uniforms.uFadeIn.value = 0.12;
    this.dust.uniforms.uFadeOut.value = 0.35;
    this.dust.uniforms.uGravity.value.set(0, -0.4, 0);

    this.debrisEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
    this.hazeEmitter = new RateEmitter();
    this.trailEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The well stands and pulls for `lifetime`; the impact phase *is* the hold. */
  get impactDuration() {
    return Math.max(0.1, settings.graviton.lifetime * settings.global.lifetime);
  }

  /** From the collapse until the floor has settled. */
  get fadeDuration() {
    return Math.max(0.1, settings.graviton.fadeTime * settings.global.lifetime);
  }

  /** The light breathes with the core rather than shimmering. */
  lightShimmer() {
    const c = settings.graviton;
    const breath = Math.sin(this.age * c.corePulseRate * 0.5);
    return 1 + c.lightPulse * breath * 0.5 + this._crush() * 0.8;
  }

  /* ------------------------------------------------------------------ */
  /* Geometry — every metre resolved from live settings                   */
  /* ------------------------------------------------------------------ */

  get radius() {
    return Math.max(0.2, settings.graviton.zoneRadius);
  }

  /** The funnel's lip, metres. */
  get wellReach() {
    return Math.max(0.5, this.radius * settings.graviton.wellReach);
  }

  /** How far the grip reaches, metres. */
  get pullRadius() {
    return Math.max(0.3, this.radius * settings.graviton.pullReach);
  }

  /** Where the seed is gathered at the caster's hand. */
  _handPoint(out) {
    const c = settings.graviton;
    out
      .copy(this.origin)
      .addScaledVector(this.direction, c.handForward)
      .addScaledVector(this.side, c.handSide);
    out.y = c.handHeight;
    return out;
  }

  /** The middle of the well on the floor. */
  _floorPoint(out) {
    this.pointAt(1, out);
    out.y = 0;
    return out;
  }

  /** The core — riding the front in flight, hanging over the funnel after. */
  _corePoint(out) {
    const c = settings.graviton;
    if (this.phase === AbilityPhase.TRAVEL) {
      this._handPoint(_hand);
      this._floorPoint(_target);
      _target.y = c.coreHeight;
      // A shallow arc on the way: dense things are thrown, not floated.
      out.lerpVectors(_hand, _target, this.u);
      out.y += Math.sin(this.u * Math.PI) * 0.35;
      return out;
    }
    this._floorPoint(out);
    out.y = c.coreHeight;
    return out;
  }

  /** 0..1, how far the well has opened. */
  _open() {
    if (this.phase === AbilityPhase.TRAVEL) return 0;
    return saturate(this._hold / Math.max(0.02, settings.graviton.openTime));
  }

  /** 0..1 through the crush window just before the collapse. */
  _crush() {
    if (this.phase === AbilityPhase.TRAVEL || this._collapsed) return 0;
    const c = settings.graviton;
    const window = Math.max(0.02, c.crushTime);
    return saturate((this._hold - (this.impactDuration - window)) / window);
  }

  /** 0..1 through the fade after the collapse. */
  _afterAmount() {
    return this._collapsed ? saturate(this._after / this.fadeDuration) : 0;
  }

  /** Radius of the black core right now, metres. */
  _coreRadius() {
    const c = settings.graviton;
    const base = Math.max(0.02, c.coreRadius);
    if (this.phase === AbilityPhase.TRAVEL) return base * c.seedSize;

    if (this._collapsed) {
      // Gone in a few frames: what is left of it went out with the shock.
      return base * 0.25 * (1 - Easing.outCubic(saturate(this._after / 0.12)));
    }

    // Overshoots open — mass arriving has momentum — then breathes.
    const open = Easing.outBack(this._open());
    const breath = 1 + c.corePulse * Math.sin(this._hold * c.corePulseRate * TAU * 0.25);
    const crush = 1 - 0.75 * Easing.inCubic(this._crush());
    return base * lerp(c.seedSize, 1, open) * breath * crush;
  }

  /**
   * How deep the funnel is right now, metres. Negative is a dome.
   *
   * During the hold it eases in with a little overshoot and deepens through the
   * crush. After the collapse it is a damped spring released from the deepest
   * point: the floor springs up past flat into a dome (`wellBounce` of the
   * depth), rings, and settles.
   */
  _wellDepth() {
    const c = settings.graviton;
    if (this.phase === AbilityPhase.TRAVEL) return 0;
    const deep = c.wellDepth * (1 + 0.25 * Easing.inQuad(this._crush()));
    if (!this._collapsed) return deep * Easing.outBack(this._open());

    const t = this._after;
    const ring = Math.exp(-Math.max(0, c.wellSettle) * t) * Math.cos(c.wellBounceRate * t);
    // The upward half of the swing is scaled on its own, so the dome can be
    // gentler than the pit it came out of.
    const swing = ring >= 0 ? ring : ring * c.wellBounce;
    return c.wellDepth * 1.25 * swing;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.debrisEmitter.reset();
    this.moteEmitter.reset();
    this.hazeEmitter.reset();
    this.trailEmitter.reset();

    this._releaseGrips(false);
    this._seed = Math.random() * 100;
    this._hold = 0;
    this._after = 0;
    this._collapsed = false;
    this._crushFired = false;
    this._discClock = Math.random() * 10;
    this._wellClock = 0;

    this._sync();
    this._muzzleFx();
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  /** Push live settings and the cast's envelopes into every layer. */
  _sync() {
    const c = settings.graviton;
    const g = settings.global;
    const travelling = this.phase === AbilityPhase.TRAVEL;
    const after = this._afterAmount();
    const crush = this._crush();
    const open = this._open();

    this._corePoint(_core);
    const coreR = this._coreRadius();

    /* ---- the core ---- */
    const coreState = this._coreState;
    coreState.heat = this._collapsed ? 1 : crush;
    coreState.fade = 1;
    coreState.seed = this._seed;
    this.coreMaterial.userData.sync(coreState);
    this.core.visible = coreR > 0.004;
    this.core.position.copy(_core);
    this.core.scale.setScalar(coreR);

    /* ---- the disc ---- */
    // In flight it is a tight little ring round the seed; open, it swells to
    // full size; in the crush it is drawn tighter and spins up; after the
    // collapse it is flung outward and thins to nothing.
    let discR;
    if (travelling) {
      discR = Math.max(0.05, c.coreRadius * c.seedSize * c.discInner * 1.9);
    } else if (!this._collapsed) {
      discR = lerp(c.coreRadius * c.seedSize * c.discInner * 1.9, c.discRadius, Easing.outCubic(open));
      discR *= 1 - 0.45 * Easing.inCubic(crush);
    } else {
      discR = c.discRadius * lerp(0.55, c.discFling, Easing.outQuint(saturate(this._after / 0.45)));
    }
    discR = Math.max(0.05, discR);

    const discState = this._discState;
    discState.clock = this._discClock;
    // The inner edge sits at `discInner` core radii — of the *open* core, so the
    // disc does not chase the crush inward.
    discState.inner = saturate((c.coreRadius * c.discInner * (this._collapsed ? 0.5 : 1)) / discR);
    if (travelling) discState.inner = 0.5;
    discState.heat = this._collapsed ? Math.max(0, 1 - this._after * 3) : crush;
    discState.fade = this._collapsed ? 1 - Easing.outCubic(saturate(this._after / 0.55)) : 1;
    discState.seed = this._seed;
    this.discMaterial.userData.sync(discState);

    this.disc.visible = discState.fade > 0.004;
    this.disc.position.copy(_core);
    this.disc.scale.setScalar(discR);
    const heading = Math.atan2(this.direction.x, this.direction.z);
    this.disc.rotation.set(-Math.PI / 2 + c.discTilt, heading + c.discYaw, 0);

    /* ---- the lens ---- */
    const lensState = this._lensState;
    if (!this._collapsed) {
      lensState.size = Math.max(0.1, coreR * c.lensReach);
      lensState.core = coreR;
      lensState.strength = travelling ? 0.45 : lerp(0.5, 1, open) * (1 + crush * 0.8);
    } else {
      // The released space rushes back out: a ring of warp that grows and dies.
      const k = saturate(this._after / 0.5);
      lensState.size = c.coreRadius * c.lensReach * lerp(1, 3.2, Easing.outCubic(k));
      lensState.core = lensState.size * 0.35 * k;
      lensState.strength = (1 - k) * 1.6;
    }
    this.lensMaterial.userData.sync(lensState);
    this.lens.visible = lensState.strength > 0.004;
    this.lens.position.copy(_core);

    /* ---- the funnel ---- */
    const wellState = this._wellState;
    this._floorPoint(wellState.centre);
    wellState.reach = this.wellReach;
    wellState.depth = this._wellDepth();
    wellState.clock = this._wellClock;
    wellState.open = this._collapsed ? 1 - Easing.inQuad(after) : Easing.outCubic(open);
    wellState.fade = this._collapsed ? 1 - Easing.inQuad(after) : 1;
    wellState.seed = this._seed;
    this.wellMaterial.userData.sync(wellState);
    this.well.visible = !travelling && wellState.fade > 0.004;

    /* ---- the particle systems ---- */
    this._syncParticles(c, g);
  }

  /** Every shared particle uniform, from live settings. */
  _syncParticles(c, g) {
    const size = g.particleSize;
    const life = g.particleLifetime;
    const speed = g.particleSpeed;

    this.debris.setGradient(getColor(c.colorDebrisA), getColor(c.colorDebrisB), getColor(c.colorDebrisC), getColor(c.colorDebrisD));
    this.debris.uniforms.uSwirl.value = c.debrisSwirl * g.noiseSpeed;
    this.debris.uniforms.uSwirlExpand.value = -saturate(c.debrisInfall);
    this.debris.uniforms.uSizeScale.value = size;
    this.debris.uniforms.uLifeScale.value = life;
    this.debris.uniforms.uSpeedScale.value = speed;
    this.debris.uniforms.uOpacity.value = g.opacity;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    this.motes.uniforms.uSwirl.value = c.moteSwirl * g.noiseSpeed;
    this.motes.uniforms.uSwirlExpand.value = -saturate(c.moteInfall);
    this.motes.uniforms.uSizeScale.value = size;
    this.motes.uniforms.uLifeScale.value = life;
    this.motes.uniforms.uSpeedScale.value = speed;
    this.motes.uniforms.uOpacity.value = g.opacity;
    this.motes.uniforms.uGlow.value = g.glow;

    this.haze.setGradient(getColor(c.colorHazeA), getColor(c.colorHazeB), getColor(c.colorHazeC), getColor(c.colorHazeD));
    this.haze.uniforms.uSwirl.value = c.hazeSwirl * g.noiseSpeed;
    this.haze.uniforms.uSwirlExpand.value = -0.85;
    this.haze.uniforms.uSizeScale.value = size;
    this.haze.uniforms.uLifeScale.value = life;
    this.haze.uniforms.uOpacity.value = c.hazeOpacity * g.opacity;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    this.sparks.uniforms.uSizeScale.value = size;
    this.sparks.uniforms.uLifeScale.value = life;
    this.sparks.uniforms.uSpeedScale.value = speed;
    this.sparks.uniforms.uOpacity.value = g.opacity;
    this.sparks.uniforms.uGlow.value = g.glow;

    this.ejecta.setGradient(getColor(c.colorDebrisA), getColor(c.colorDebrisB), getColor(c.colorDebrisC), getColor(c.colorDebrisD));
    this.ejecta.uniforms.uSizeScale.value = size;
    this.ejecta.uniforms.uLifeScale.value = life;
    this.ejecta.uniforms.uSpeedScale.value = speed;
    this.ejecta.uniforms.uOpacity.value = g.opacity;

    this.dust.setGradient(getColor(c.colorHazeA), getColor(c.colorHazeB), getColor(c.colorHazeC), getColor(c.colorHazeD));
    this.dust.uniforms.uSizeScale.value = size;
    this.dust.uniforms.uLifeScale.value = life;
    this.dust.uniforms.uSpeedScale.value = speed;
    this.dust.uniforms.uOpacity.value = c.hazeOpacity * g.opacity;
    this.dust.uniforms.uTurbulence.value = 0.6 * g.turbulence;
  }

  /* ------------------------------------------------------------------ */
  /* The grip                                                            */
  /* ------------------------------------------------------------------ */

  _gripOf(dummy) {
    for (let i = 0; i < this._gripCount; i++) {
      if (this._grips[i].dummy === dummy) return this._grips[i];
    }
    return null;
  }

  /** Drop slot `index`, swapping the last live slot into its place. */
  _dropGrip(index, settle) {
    const last = this._gripCount - 1;
    const slot = this._grips[index];
    this._letGo(slot, settle);
    this._grips[index] = this._grips[last];
    this._grips[last] = slot;
    this._gripCount = last;
  }

  /** Let one body go. A standing body is put back on the floor. */
  _letGo(slot, settle) {
    const dummy = slot.dummy;
    if (dummy) {
      if (dummy.alive) {
        if (settle) dummy.position.y = 0;
      } else {
        dummy.release();
      }
    }
    slot.dummy = null;
    slot.time = 0;
    slot.standing = false;
  }

  _releaseGrips(settle = true) {
    for (let i = 0; i < this._gripCount; i++) this._letGo(this._grips[i], settle);
    this._gripCount = 0;
  }

  /**
   * Take hold of anything inside the reach not already held.
   *
   * Polled every frame of the hold, because a body knocked into the circle by
   * another cast has to be caught the frame it crosses.
   */
  _capture() {
    const field = this.ctx.dummies;
    if (!field?.findBodies) return;
    this._floorPoint(_floor);
    const found = field.findBodies(_floor.x, _floor.z, this.pullRadius, this._found);

    for (const dummy of found) {
      if (this._gripCount >= MAX_GRIPS) break;
      if (this._gripOf(dummy)) continue;
      // A corpse needs a solver to be steered; one with none is left alone.
      if (!dummy.alive && !dummy.bodyPoint(_at)) continue;

      const slot = this._grips[this._gripCount++];
      slot.dummy = dummy;
      slot.time = 0;
      slot.standing = dummy.alive;
    }
  }

  /**
   * The current that carries a corpse, at one world-space point.
   *
   * Toward the core in three dimensions, softened at `well` so two joints
   * either side of the axis are not given opposite velocities of unbounded
   * size — plus a tangential swirl about the vertical. After the collapse the
   * same sampler answers with the throw instead (`out`, `up`), so one bound
   * function serves both.
   */
  _sampleFlow(x, y, z, out) {
    const f = this._flow;
    const dx = f.cx - x;
    const dy = f.cy - y;
    const dz = f.cz - z;
    const d = Math.max(1e-3, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const flat = Math.max(1e-3, Math.hypot(dx, dz));

    if (f.out > 0) {
      // The throw: straight out along the flat radial, and up.
      out.set((-dx / flat) * f.out, f.up, (-dz / flat) * f.out);
      return;
    }

    const well = Math.max(0.3, f.well);
    const pull = (f.pull * well * well) / (d * d + well * well) * Math.min(1, d / well + 0.2);
    const swirl = f.swirl * Math.min(1, flat / well);
    out.set(
      (dx / d) * pull + (dz / flat) * swirl,
      (dy / d) * pull,
      (dz / d) * pull - (dx / flat) * swirl
    );
  }

  /**
   * Drag everything held toward the middle.
   *
   * Standing bodies are moved by their root: slid inward along the radial
   * toward a huddle radius and wound round the axis, lifted off the floor the
   * nearer they get. Their idle clip keeps playing — they are *held*, and the
   * stillness of their feet against a floor that is swimming under them is
   * what sells the weight. Corpses are steered through `Dummy#carry`.
   */
  _drag(dt) {
    if (dt <= 0) return;
    const c = settings.graviton;
    this._floorPoint(_floor);
    this._corePoint(_core);
    const reach = this.pullRadius;
    const huddle = Math.max(0.1, c.pullHuddle);

    const f = this._flow;
    f.cx = _core.x;
    f.cy = _core.y;
    f.cz = _core.z;
    f.well = this.radius * 0.6;
    f.out = 0;
    f.up = 0;

    for (let i = this._gripCount - 1; i >= 0; i--) {
      const slot = this._grips[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) {
        this._dropGrip(i, false);
        continue;
      }

      slot.time += dt;
      const wound = Easing.outCubic(saturate(slot.time / Math.max(0.05, c.pullWindUp)));

      // Killed by something else mid-hold: it becomes a corpse in the current.
      if (slot.standing && !dummy.alive) slot.standing = false;

      if (slot.standing) {
        const at = dummy.position;
        let dx = at.x - _floor.x;
        let dz = at.z - _floor.z;
        let r = Math.hypot(dx, dz);
        if (r < 1e-3) {
          dx = this.direction.x;
          dz = this.direction.z;
          r = 1;
        }
        const ux = dx / r;
        const uz = dz / r;
        // Pulled harder the deeper in the well it is — inverse-square-ish,
        // so the last metre goes faster than the first.
        const closeness = 1 - saturate(r / reach);
        const inward = Math.min(Math.max(0, r - huddle), c.pullSpeed * wound * (0.55 + closeness * 0.9) * dt);
        const nr = r - inward;
        // Wound round the axis, faster near it (constant tangential speed).
        const turn = (c.pullSwirl * wound * dt) / Math.max(nr, 0.3);
        const cs = Math.cos(turn);
        const sn = Math.sin(turn);
        const rx = (ux * cs - uz * sn) * nr;
        const rz = (ux * sn + uz * cs) * nr;
        at.x = _floor.x + rx;
        at.z = _floor.z + rz;
        // Lifted off the stone as it nears the core.
        at.y = c.bodyLift * wound * (0.25 + 0.75 * closeness) * (1 + 0.35 * this._crush());
      } else {
        if (!dummy.bodyPoint(_at)) {
          this._dropGrip(i, false);
          continue;
        }
        f.pull = c.corpsePull * wound;
        f.swirl = c.pullSwirl * wound;
        const grab = saturate(c.corpseGrab * dt) * wound;
        dummy.carry(this._field, grab, grab * 0.6, saturate(c.corpseBuoy * wound));
      }
    }
  }

  /**
   * The collapse throws everything it was holding back out.
   *
   * The living are felled along the radial from the core. Corpses get one
   * full-grab `carry` onto an outward velocity and are let go, so their next
   * substep is a body in flight. Anything standing in the circle that the grip
   * never had a slot for is thrown too, so a full stage is never half-hit.
   */
  _throw() {
    const c = settings.graviton;
    const g = settings.global;
    this._floorPoint(_floor);
    this._corePoint(_core);

    const power = g.explosionIntensity;
    this._force.impulse = c.throwImpulse * power;
    this._force.lift = c.throwLift * power;
    this._force.spin = c.throwSpin;

    const f = this._flow;
    f.cx = _core.x;
    f.cy = _core.y;
    f.cz = _core.z;
    f.out = c.throwImpulse * power;
    f.up = c.throwLift * power;

    for (let i = 0; i < this._gripCount; i++) {
      const slot = this._grips[i];
      const dummy = slot.dummy;
      if (!dummy || dummy.finished) continue;
      if (dummy.alive) this._killOutward(dummy);
      else {
        dummy.carry(this._field, 1, 1, 0);
        dummy.release();
      }
      slot.dummy = null;
    }
    this._gripCount = 0;
    f.out = 0;

    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(_floor.x, _floor.z, this.pullRadius, this._found);
    for (const dummy of found) this._killOutward(dummy);
  }

  _killOutward(dummy) {
    const at = dummy.position;
    _dir.set(at.x - _floor.x, 0, at.z - _floor.z);
    if (_dir.lengthSq() < 1e-6) {
      const a = Math.random() * TAU;
      _dir.set(Math.cos(a), 0, Math.sin(a));
    } else {
      _dir.normalize();
    }
    dummy.kill(_dir.x, _dir.z, this._force);
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  /** Common emit defaults; callers override what they need. */
  _resetEmit(time) {
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0;
    _emit.spread = 0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.sizeVariance = 0.6;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  /** The seed drawn together at the hand: motes collapsing onto it. */
  _muzzleFx() {
    const c = settings.graviton;
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    this._handPoint(_pos);
    _emit.position = _pos;
    _emit.anchor = _pos;
    _emit.radius = 0.55;
    _emit.size = c.moteSize;
    _emit.life = c.moteLifetime * 0.5;
    this.motes.emit(Math.round(50 * g.particleCount), _emit);
  }

  /** The seed in flight: a dark comet shedding light. */
  _travelFx(dt) {
    const c = settings.graviton;
    const g = settings.global;
    const n = this.trailEmitter.tick(dt, c.trailRate * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    this._corePoint(_pos);
    _emit.position = _pos;
    _emit.radius = c.coreRadius * c.seedSize * 1.4;
    _emit.direction = _dir.copy(this.direction).multiplyScalar(-1).setY(0.2).normalize();
    _emit.speed = c.sparkSpeed * 0.15;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.5;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLifetime * 0.6;
    this.sparks.emit(n, _emit);

    // And motes orbiting it, collapsing in: the seed pulls on its own trail.
    _emit.anchor = _pos;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.spread = 0;
    _emit.radius = c.coreRadius * 2.2;
    _emit.size = c.moteSize;
    _emit.life = c.moteLifetime * 0.4;
    this.motes.emit(Math.max(1, Math.round(n * 0.6)), _emit);
  }

  /** The well opening on arrival: a downward knock, a dust ring, a soft flash. */
  _openFx() {
    const c = settings.graviton;
    const g = settings.global;
    this._floorPoint(_floor);

    this.ctx.decals.spawn(DecalType.DUSTRING, _floor, {
      radius: this.wellReach * 0.9,
      life: 1.6,
      intensity: 0.6,
      colorA: getColor(c.colorHazeA),
      colorB: getColor(c.colorHazeC),
      height: 0.016
    });
    this.ctx.flash.trigger(getColor(c.colorFlash), c.openFlash * g.explosionIntensity);
    this.ctx.shake.add(c.openShake * g.explosionIntensity * g.cameraShake, 4.0, 14);
    this.lightBoost = c.lightIntensity * 0.5;
  }

  /** Everything the standing well keeps drawing in. */
  _holdFx(dt) {
    const c = settings.graviton;
    const g = settings.global;
    const time = frame.uTime.value;
    const open = this._open();
    const surge = 1 + this._crush() * 1.5;
    this._floorPoint(_floor);
    this._corePoint(_core);
    const lip = this.wellReach;

    /* stone torn off the lip, spiralling up into the core */
    const chips = this.debrisEmitter.tick(dt, c.debrisRate * open * surge * g.particleCount);
    for (let n = 0; n < chips; n += 4) {
      this._resetEmit(time);
      const a = Math.random() * TAU;
      const r = lip * randRange(0.55, 0.95);
      _pos.set(_floor.x + Math.cos(a) * r, c.debrisHeight, _floor.z + Math.sin(a) * r);
      _emit.position = _pos;
      _emit.anchor = _core;
      _emit.radius = 0.25;
      _emit.size = c.debrisSize;
      _emit.sizeVariance = 0.8;
      _emit.life = c.debrisLifetime;
      _emit.spin = 6;
      this.debris.emit(Math.min(4, chips - n), _emit);
    }

    /* glowing dust on a shell round the core */
    const motes = this.moteEmitter.tick(dt, c.moteRate * open * surge * g.particleCount);
    for (let n = 0; n < motes; n += 6) {
      this._resetEmit(time);
      const a = Math.random() * TAU;
      const shell = this.radius * c.moteShell * randRange(0.5, 1.0);
      _pos.set(
        _core.x + Math.cos(a) * shell,
        _core.y + randRange(-0.6, 0.4) * shell * 0.5,
        _core.z + Math.sin(a) * shell
      );
      _emit.position = _pos;
      _emit.anchor = _core;
      _emit.radius = 0.2;
      _emit.size = c.moteSize;
      _emit.sizeVariance = 0.8;
      _emit.life = c.moteLifetime;
      this.motes.emit(Math.min(6, motes - n), _emit);
    }

    /* haze rolling over the lip and down */
    const haze = this.hazeEmitter.tick(dt, c.hazeRate * open * g.particleCount);
    if (haze > 0) {
      this._resetEmit(time);
      const a = Math.random() * TAU;
      _pos.set(_floor.x + Math.cos(a) * lip * 0.9, 0.2, _floor.z + Math.sin(a) * lip * 0.9);
      _floor.y = 0.15;
      _emit.position = _pos;
      _emit.anchor = _floor;
      _emit.radius = 0.4;
      _emit.size = c.hazeSize;
      _emit.life = c.hazeLifetime;
      _emit.spin = 0.4;
      this.haze.emit(haze, _emit);
      _floor.y = 0;
    }
  }

  /** The crush window opening: everything nearby rushes into the core. */
  _implodeFx() {
    const c = settings.graviton;
    const g = settings.global;
    this._resetEmit(frame.uTime.value);
    this._corePoint(_core);
    _emit.position = _core;
    _emit.anchor = _core;
    _emit.radius = this.radius * 1.1;
    _emit.size = c.moteSize * 1.4;
    _emit.sizeVariance = 0.8;
    // Timed to arrive exactly as the well collapses.
    _emit.life = Math.max(0.1, c.crushTime);
    _emit.lifeVariance = 0.15;
    this.motes.emit(Math.round(c.implodeMotes * g.particleCount), _emit);
  }

  /** The collapse. */
  _collapseFx() {
    const c = settings.graviton;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._floorPoint(_floor);
    this._corePoint(_core);

    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _floor, {
      radius: c.shockRadius * power,
      life: c.shockLife,
      width: 0.06,
      intensity: 1.2,
      colorA: getColor(c.colorShockHot),
      colorB: getColor(c.colorShockBody)
    });
    this.ctx.decals.spawn(DecalType.SCORCH, _floor, {
      radius: c.scorchRadius,
      life: c.scorchLife,
      intensity: 0.85,
      colorA: getColor(c.colorScorch),
      colorB: getColor(c.colorScorchEmber),
      height: 0.013
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _floor, {
      radius: c.shockRadius * 0.6 * power,
      life: 2.6,
      intensity: 0.7,
      colorA: getColor(c.colorHazeA),
      colorB: getColor(c.colorHazeC),
      height: 0.017
    });
    this.ctx.bursts.spawn(BurstMode.AIR, _core, {
      radius: 0.3,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: 1.4,
      colorA: getColor(c.colorShockHot),
      colorB: getColor(c.colorShockBody),
      colorC: getColor(c.colorSparkD),
      squash: 0.7
    });

    /* streaks of light out of the middle */
    const sparks = Math.round(c.sparkCount * g.particleCount);
    const perSpark = Math.max(1, Math.ceil(sparks / BLAST_BATCHES));
    for (let n = 0; n < sparks; n += perSpark) {
      this._resetEmit(time);
      const a = Math.random() * TAU;
      _emit.position = _core;
      _emit.radius = 0.2;
      _emit.direction = _dir.set(Math.cos(a), randRange(-0.25, 0.6), Math.sin(a)).normalize();
      _emit.speed = c.sparkSpeed * power;
      _emit.speedVariance = 0.6;
      _emit.spread = 0.6;
      _emit.size = c.sparkSize * 1.4;
      _emit.life = c.sparkLifetime;
      this.sparks.emit(Math.min(perSpark, sparks - n), _emit);
    }

    /* the stone the funnel was made of, thrown back out */
    const chips = Math.round(c.ejectaCount * g.particleCount);
    const perChip = Math.max(1, Math.ceil(chips / BLAST_BATCHES));
    for (let n = 0; n < chips; n += perChip) {
      this._resetEmit(time);
      const a = Math.random() * TAU;
      _pos.set(_floor.x + Math.cos(a) * 0.6, 0.15, _floor.z + Math.sin(a) * 0.6);
      _emit.position = _pos;
      _emit.radius = 0.5;
      _emit.direction = _dir.set(Math.cos(a), 0.9, Math.sin(a)).normalize();
      _emit.speed = c.ejectaSpeed * power;
      _emit.speedVariance = 0.55;
      _emit.spread = 0.45;
      _emit.size = c.ejectaSize;
      _emit.sizeVariance = 0.75;
      _emit.life = c.ejectaLifetime;
      _emit.spin = 9;
      this.ejecta.emit(Math.min(perChip, chips - n), _emit);
    }

    /* the dust the shock lifts */
    const dust = Math.round(c.blastDustCount * g.particleCount);
    const perDust = Math.max(1, Math.ceil(dust / BLAST_BATCHES));
    for (let n = 0; n < dust; n += perDust) {
      this._resetEmit(time);
      const a = Math.random() * TAU;
      _pos.set(_floor.x + Math.cos(a) * 0.8, 0.2, _floor.z + Math.sin(a) * 0.8);
      _emit.position = _pos;
      _emit.radius = 0.6;
      _emit.direction = _dir.set(Math.cos(a), 0.25, Math.sin(a)).normalize();
      _emit.speed = c.blastDustSpeed * power;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.3;
      _emit.size = c.blastDustSize;
      _emit.life = c.blastDustLifetime;
      _emit.spin = 0.4;
      this.dust.emit(Math.min(perDust, dust - n), _emit);
    }

    this.ctx.flash.trigger(getColor(c.colorFlash), c.collapseFlash * power);
    this.ctx.shake.add(c.collapseShake * power * g.cameraShake, 3.2, 22);
    this.lightBoost = c.collapseLight * power;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._discClock += dt * 1.6;
    this._sync();
    this._corePoint(this.position);
    this._travelFx(dt);
    this.ctx.shake.rumble(settings.graviton.travelRumble * settings.global.cameraShake, dt);
  }

  onImpact() {
    this._hold = 0;
    this._after = 0;
    this._collapsed = false;
    this._crushFired = false;
    this._openFx();
  }

  onFade(dt, t) {
    const c = settings.graviton;
    const g = settings.global;

    if (!this._collapsed) {
      this._hold += dt;
      const crush = this._crush();
      this._discClock += dt * (1 + crush * 2.5);
      this._wellClock += dt * (1 + crush * 1.5);

      if (crush > 0 && !this._crushFired) {
        this._crushFired = true;
        this._implodeFx();
      }

      this._capture();
      this._drag(dt);
      this._holdFx(dt);
      this.ctx.shake.rumble(c.holdRumble * (1 + crush * 3) * g.cameraShake, dt);

      // The well has stood its time: it collapses.
      if (t >= 1) {
        this._collapsed = true;
        this._after = 0;
        this._throw();
        this._collapseFx();
      }
    } else {
      this._after += dt;
      this._discClock += dt * 3;
      this._wellClock += dt;
    }

    this._sync();
    this._corePoint(this.position);
  }

  onDestroy() {
    // Retired early: let go, and put anything still standing back on the floor.
    this._releaseGrips(true);
    this._collapsed = false;
    this.core.visible = false;
    this.disc.visible = false;
    this.lens.visible = false;
    this.well.visible = false;
  }

  dispose() {
    this.coreGeometry.dispose();
    this.discGeometry.dispose();
    this.lensGeometry.dispose();
    this.wellGeometry.dispose();
    this.coreMaterial.dispose();
    this.discMaterial.dispose();
    this.lensMaterial.dispose();
    this.wellMaterial.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('◉  Graviton Collapse');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 90, 0.5, 'seed speed (m/s)');
  R(cast, c, 'lifetime', 0.3, 8, 0.05, 'well stands for (s)');
  R(cast, c, 'fadeTime', 0.2, 4, 0.05, 'collapse settles over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 0.5, 8, 0.05, 'zone radius (m)');
  Editor.castAnimation(cast, c);
  R(cast, c, 'handForward', -1, 2, 0.01, 'hand forward (m)');
  R(cast, c, 'handSide', -1, 1, 0.01, 'hand side (m)');
  R(cast, c, 'handHeight', 0, 3, 0.01, 'hand height (m)');
  R(cast, c, 'coreHeight', 0.4, 5, 0.01, 'core hangs at (m)');

  const core = folder.addFolder('1 · The core');
  R(core, c, 'coreRadius', 0.05, 2, 0.01, 'radius (m)');
  R(core, c, 'seedSize', 0.05, 1, 0.01, 'seed size (× radius)');
  R(core, c, 'openTime', 0.05, 2, 0.01, 'opens over (s)');
  R(core, c, 'coreWobble', 0, 0.3, 0.005, 'surface boil');
  R(core, c, 'coreRimGlow', 0, 12, 0.05, 'limb glow');
  R(core, c, 'coreRimPower', 0.5, 8, 0.05, 'limb thinness');
  R(core, c, 'coreSwirl', 0, 10, 0.05, 'limb swirl (rad/s)');
  R(core, c, 'corePulse', 0, 0.3, 0.005, 'breathing');
  R(core, c, 'corePulseRate', 0, 20, 0.1, 'breath rate');
  core.addColor(c, 'colorCore').name('body');
  core.addColor(c, 'colorCoreRim').name('limb');

  const disc = folder.addFolder('2 · Accretion disc');
  R(disc, c, 'discRadius', 0.3, 6, 0.01, 'outer radius (m)');
  R(disc, c, 'discInner', 1, 4, 0.01, 'inner edge (× core)');
  R(disc, c, 'discTilt', -1.2, 1.2, 0.01, 'tilt (rad)');
  R(disc, c, 'discYaw', -3.14, 3.14, 0.01, 'yaw off the cast (rad)');
  R(disc, c, 'discSpin', 0, 20, 0.05, 'spin at inner edge (rad/s)');
  R(disc, c, 'discShear', 0, 3, 0.01, 'differential shear');
  R(disc, c, 'discBands', 0, 24, 0.1, 'bands');
  R(disc, c, 'discNoise', 0, 1, 0.01, 'turbulence');
  R(disc, c, 'discNoiseScale', 0.3, 8, 0.05, 'turbulence scale');
  R(disc, c, 'discHotEdge', 0.5, 20, 0.1, 'hot edge falloff');
  R(disc, c, 'discBeaming', 0, 1, 0.01, 'Doppler beaming');
  R(disc, c, 'discBrightness', 0, 12, 0.05, 'brightness');
  R(disc, c, 'discOpacity', 0, 1, 0.01, 'opacity');
  R(disc, c, 'discSoftFade', 0.01, 2, 0.01, 'soft fade (m)');
  R(disc, c, 'discFling', 1, 4, 0.05, 'flung out at collapse (×)');
  disc.addColor(c, 'colorDiscHot').name('inner edge');
  disc.addColor(c, 'colorDiscMid').name('body');
  disc.addColor(c, 'colorDiscCool').name('outer');

  const lens = folder.addFolder('3 · Lens');
  R(lens, c, 'lensReach', 1, 16, 0.1, 'reach (× core)');
  R(lens, c, 'lensStrength', 0, 5, 0.01, 'strength');
  R(lens, c, 'lensPinch', 0, 2, 0.01, 'pinch');
  R(lens, c, 'lensSwirl', -2, 2, 0.01, 'swirl');
  R(lens, c, 'lensFalloff', 0.02, 1, 0.01, 'falloff');
  R(lens, c, 'lensRipple', 0, 1, 0.01, 'ripples');

  const well = folder.addFolder('4 · The funnel');
  R(well, c, 'wellReach', 0.5, 3, 0.01, 'lip (× zone)');
  R(well, c, 'wellDepth', -1, 5, 0.01, 'depth (m)');
  R(well, c, 'wellThroat', 0.1, 5, 0.01, 'throat (m)');
  R(well, c, 'wellLift', 0, 0.1, 0.001, 'lip lift (m)');
  R(well, c, 'wellDepthBias', 0, 0.5, 0.005, 'depth-write bias (m)');
  R(well, c, 'wellTwist', -8, 8, 0.05, 'grid winding (rad)');
  R(well, c, 'wellSpin', -6, 6, 0.05, 'winding spin (rad/s)');
  R(well, c, 'wellSpokes', 0, 72, 1, 'radial lines');
  R(well, c, 'wellRingSpacing', 0.1, 2, 0.01, 'ring spacing (m)');
  R(well, c, 'wellLineWidth', 0.005, 0.2, 0.001, 'line width');
  R(well, c, 'wellFlow', -3, 3, 0.01, 'rings drain (m/s)');
  R(well, c, 'wellGridGlow', 0, 10, 0.05, 'grid glow');
  R(well, c, 'wellHotGlow', 0, 10, 0.05, 'throat glow');
  R(well, c, 'wellShade', 0, 1, 0.01, 'throat darkness');
  R(well, c, 'wellGrain', 0, 1, 0.01, 'stone grain');
  R(well, c, 'wellFeather', 0.01, 0.8, 0.01, 'lip feather');
  R(well, c, 'wellOpacity', 0, 1, 0.01, 'opacity');
  R(well, c, 'wellBounce', 0, 1.5, 0.01, 'dome after collapse (×)');
  R(well, c, 'wellBounceRate', 0, 40, 0.1, 'ring rate (rad/s)');
  R(well, c, 'wellSettle', 0, 15, 0.1, 'settle rate');
  well.addColor(c, 'colorWellBase').name('stone');
  well.addColor(c, 'colorWellDeep').name('throat');
  well.addColor(c, 'colorWellGrid').name('grid');
  well.addColor(c, 'colorWellHot').name('throat glow');

  const infall = folder.addFolder('5 · Infall');
  R(infall, c, 'debrisRate', 0, 400, 1, 'debris / s');
  R(infall, c, 'debrisSize', 0.01, 0.5, 0.005, 'debris size');
  R(infall, c, 'debrisLifetime', 0.2, 4, 0.05, 'debris life (s)');
  R(infall, c, 'debrisSwirl', -10, 10, 0.05, 'debris swirl (rad/s)');
  R(infall, c, 'debrisInfall', 0, 1, 0.01, 'debris infall');
  R(infall, c, 'debrisHeight', 0, 1, 0.01, 'debris height (m)');
  Editor.gradient(infall, c, 'colorDebris', 'debris colour');
  R(infall, c, 'moteRate', 0, 800, 1, 'motes / s');
  R(infall, c, 'moteSize', 0.01, 0.4, 0.005, 'mote size');
  R(infall, c, 'moteLifetime', 0.2, 4, 0.05, 'mote life (s)');
  R(infall, c, 'moteSwirl', -12, 12, 0.05, 'mote swirl (rad/s)');
  R(infall, c, 'moteInfall', 0, 1, 0.01, 'mote infall');
  R(infall, c, 'moteShell', 0.2, 3, 0.01, 'mote shell (× zone)');
  Editor.gradient(infall, c, 'colorMote', 'mote colour');
  R(infall, c, 'hazeRate', 0, 120, 1, 'haze / s');
  R(infall, c, 'hazeSize', 0.1, 4, 0.01, 'haze size');
  R(infall, c, 'hazeLifetime', 0.2, 5, 0.05, 'haze life (s)');
  R(infall, c, 'hazeSwirl', -6, 6, 0.05, 'haze swirl (rad/s)');
  R(infall, c, 'hazeOpacity', 0, 1, 0.01, 'haze opacity');
  Editor.gradient(infall, c, 'colorHaze', 'haze & dust colour');
  R(infall, c, 'trailRate', 0, 600, 1, 'seed trail / s');

  const grip = folder.addFolder('6 · The grip');
  R(grip, c, 'pullReach', 0.2, 3, 0.01, 'reach (× zone)');
  R(grip, c, 'pullSpeed', 0, 10, 0.05, 'drag speed (m/s)');
  R(grip, c, 'pullSwirl', -6, 6, 0.05, 'wind round (m/s)');
  R(grip, c, 'pullWindUp', 0.05, 3, 0.01, 'grip takes hold over (s)');
  R(grip, c, 'pullHuddle', 0, 3, 0.01, 'huddle radius (m)');
  R(grip, c, 'bodyLift', 0, 3, 0.01, 'levitate (m)');
  R(grip, c, 'corpsePull', 0, 12, 0.05, 'corpse pull (m/s)');
  R(grip, c, 'corpseGrab', 0, 12, 0.05, 'corpse grab (1/s)');
  R(grip, c, 'corpseBuoy', 0, 1, 0.01, 'corpse weight carried');
  R(grip, c, 'throwImpulse', 0, 25, 0.1, 'thrown out (m/s)');
  R(grip, c, 'throwLift', 0, 15, 0.1, 'thrown up (m/s)');
  R(grip, c, 'throwSpin', 0, 4, 0.01, 'throw torque');
  R(grip, c, 'crushTime', 0.05, 2, 0.01, 'crush window (s)');

  const blast = folder.addFolder('7 · The collapse');
  R(blast, c, 'shockRadius', 0.5, 20, 0.1, 'shockwave radius (m)');
  R(blast, c, 'shockLife', 0.1, 3, 0.01, 'shockwave life (s)');
  R(blast, c, 'burstRadius', 0.5, 12, 0.1, 'air burst radius (m)');
  R(blast, c, 'burstLife', 0.1, 3, 0.01, 'air burst life (s)');
  R(blast, c, 'ejectaCount', 0, 600, 1, 'ejecta');
  R(blast, c, 'ejectaSpeed', 0, 30, 0.1, 'ejecta speed');
  R(blast, c, 'ejectaSize', 0.01, 0.5, 0.005, 'ejecta size');
  R(blast, c, 'ejectaLifetime', 0.2, 4, 0.05, 'ejecta life (s)');
  R(blast, c, 'sparkCount', 0, 800, 1, 'sparks');
  R(blast, c, 'sparkSpeed', 0, 40, 0.1, 'spark speed');
  R(blast, c, 'sparkSize', 0.01, 0.4, 0.005, 'spark size');
  R(blast, c, 'sparkLifetime', 0.1, 3, 0.01, 'spark life (s)');
  Editor.gradient(blast, c, 'colorSpark', 'spark colour');
  R(blast, c, 'blastDustCount', 0, 300, 1, 'dust');
  R(blast, c, 'blastDustSpeed', 0, 20, 0.1, 'dust speed');
  R(blast, c, 'blastDustSize', 0.1, 5, 0.01, 'dust size');
  R(blast, c, 'blastDustLifetime', 0.2, 5, 0.05, 'dust life (s)');
  R(blast, c, 'implodeMotes', 0, 600, 1, 'implosion motes');
  R(blast, c, 'collapseFlash', 0, 3, 0.01, 'collapse flash');
  R(blast, c, 'openFlash', 0, 2, 0.01, 'open flash');
  R(blast, c, 'openShake', 0, 2, 0.01, 'open shake');
  R(blast, c, 'collapseShake', 0, 3, 0.01, 'collapse shake');
  R(blast, c, 'holdRumble', 0, 0.5, 0.005, 'hold rumble');
  R(blast, c, 'travelRumble', 0, 0.5, 0.005, 'travel rumble');
  R(blast, c, 'scorchRadius', 0.2, 8, 0.05, 'scar radius (m)');
  R(blast, c, 'scorchLife', 0.5, 20, 0.1, 'scar life (s)');
  blast.addColor(c, 'colorFlash').name('flash');
  blast.addColor(c, 'colorShockHot').name('shock edge');
  blast.addColor(c, 'colorShockBody').name('shock body');
  blast.addColor(c, 'colorScorch').name('scar');
  blast.addColor(c, 'colorScorchEmber').name('scar embers');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 30, 0.1, 'radius');
  R(light, c, 'lightPulse', 0, 1, 0.01, 'breathing');
  R(light, c, 'collapseLight', 0, 40, 0.1, 'collapse punch');

  folder.close();
  return folder;
}
