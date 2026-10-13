import { Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createVoidstepRiftMaterial,
  createVoidstepFilamentMaterial,
  createVoidstepThreadMaterial,
  createVoidstepLensMaterial
} from '../../materials/matrix-new/VoidstepRiftMaterials.js';
import { createBoltRibbonGeometry } from '../../assets/ProceduralGeometry.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing, randRange } from '../../utils/math.js';

export const ID = 'voidstep';

/** Filaments per rift; there are two rifts, drawn in one call. */
const MAX_FILAMENTS = 8;
const FILAMENT_NODES = 24;
const THREAD_NODES = 64;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _out = new Vector3();
const _entry = new Vector3();
const _exit = new Vector3();
const _end = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * Which voidstep currently has its hands on the character, if any.
 *
 * Module scope because ownership belongs to the *body*, not to a cast — the
 * same pattern as Blink Step. A re-cast inside the cooldown, or two pooled
 * instances in flight, hand the body over: whoever takes it releases the
 * previous holder first, so exactly one voidstep ever has it hidden or
 * squeezed and the scale it restores is always the body's real one.
 *
 * @type {VoidstepRiftAbility|null}
 */
let characterOwner = null;

/**
 * VOIDSTEP RIFT — Movement, line cast.
 *
 * Not a dash: nothing crosses the space between. Two vertical rifts tear open,
 * one in front of the caster and one at the target; the caster is drawn into
 * the first and is simply *gone*, a faint thread of void runs between the two
 * while the step is in transit, and the caster steps out of the second. Then
 * both slam shut, and the exit's closing throws a pulse that knocks down
 * everything standing near it. Bodies along the line are untouched — the
 * caster was never there (`handlesOwnHits`).
 *
 * ## Layers
 *
 *   1. **THE RIFTS** (`createVoidstepRiftMaterial`) — tall slit portals, a
 *      signed-distance tear with independently torn lips, a white-hot edge, a
 *      violet halo, and a void inside: three parallaxed layers of stars and
 *      gas swirling inward, so the hole has depth whichever way it is seen.
 *      They tear open with an overshoot and slam shut to a hairline crack.
 *   2. **FILAMENTS** (`createVoidstepFilamentMaterial`) — crackling arcs off
 *      both rifts' lips, re-struck many times a second; one draw for both.
 *   3. **THE THREAD** (`createVoidstepThreadMaterial`) — a faint, torn ribbon
 *      of void from the entry toward the exit, running out with the transit,
 *      a knot of light riding it where the caster *is*.
 *   4. **LENSES** (LAYER.DISTORTION) — a twisting pull toward each open rift,
 *      and the exit's closing pulse: a hard ring thrown outward.
 *   5. **PARTICLES** — motes sucked into the entry as the body goes in, embers
 *      torn off the open lips, sparks off the slam.
 *   6. **THE CLOSING PULSE** — an AIR shell, a SHOCKWAVE ring, a flash, a
 *      light punch, a shake, and every dummy inside `knockRadius` of the exit
 *      thrown outward from it.
 *
 * ## The body
 *
 * Handled exactly like Blink Step's: the character is only ever touched while
 * this cast *owns* it (`characterOwner`). Taking it saves `root.scale` and
 * `root.visible`; every way out — stepping out finishing, `destroy` (a clear,
 * or the manager retiring the cast), another voidstep taking the body — goes
 * through `_releaseCharacter`, which puts both back exactly. The move to the
 * exit happens once, after the front has arrived *and* the body has finished
 * vanishing (so a short step never teleports a visible body), and only if
 * this cast still owns it. Only x and z move; y stays 0; the body is turned to
 * face along the line. A cast cleared mid-transit leaves the caster standing,
 * visible and whole, where it started.
 *
 * ## The editor rule
 *
 * The cast records a seed and a handful of event timestamps (when the exit
 * began to open, when the body emerged, when the rifts snapped). Every metre,
 * second and colour is read from `settings.voidstep` each frame.
 */
export class VoidstepRiftAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /** Only the exit's pulse hits anything — never the line. */
  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return (this.riftA.visible ? 1 : 0) + (this.riftB.visible ? 1 : 0) + (this.filaments.visible ? this.filamentGeometry.instanceCount : 0);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the two rifts ---- */
    this.riftGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.riftMaterialA = createVoidstepRiftMaterial();
    this.riftMaterialB = createVoidstepRiftMaterial();
    this.riftA = new Mesh(this.riftGeometry, this.riftMaterialA);
    this.riftB = new Mesh(this.riftGeometry, this.riftMaterialB);
    this.riftA.name = 'VoidstepEntry';
    this.riftB.name = 'VoidstepExit';
    for (const mesh of [this.riftA, this.riftB]) {
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false;
      mesh.renderOrder = 12;
      mesh.visible = false;
      this.group.add(mesh);
    }

    /* ---- layer 2: filaments, both rifts in one draw ---- */
    this.filamentGeometry = createBoltRibbonGeometry(FILAMENT_NODES, MAX_FILAMENTS * 2);
    this.filamentMaterial = createVoidstepFilamentMaterial(MAX_FILAMENTS);
    this.filaments = new Mesh(this.filamentGeometry, this.filamentMaterial);
    this.filaments.name = 'VoidstepFilaments';
    this.filaments.layers.set(LAYER.VFX);
    this.filaments.frustumCulled = false;
    this.filaments.renderOrder = 14;
    this.filaments.visible = false;
    this.group.add(this.filaments);

    /* ---- layer 3: the thread ---- */
    this.threadGeometry = createBoltRibbonGeometry(THREAD_NODES, 1);
    this.threadMaterial = createVoidstepThreadMaterial();
    this.thread = new Mesh(this.threadGeometry, this.threadMaterial);
    this.thread.name = 'VoidstepThread';
    this.thread.layers.set(LAYER.VFX);
    this.thread.frustumCulled = false;
    this.thread.renderOrder = 11;
    this.thread.visible = false;
    this.group.add(this.thread);

    /* ---- layer 4: lenses and the pulse ---- */
    this.lensGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.lensMaterialA = createVoidstepLensMaterial();
    this.lensMaterialB = createVoidstepLensMaterial();
    this.pulseMaterial = createVoidstepLensMaterial();
    this.lensA = new Mesh(this.lensGeometry, this.lensMaterialA);
    this.lensB = new Mesh(this.lensGeometry, this.lensMaterialB);
    this.pulse = new Mesh(this.lensGeometry, this.pulseMaterial);
    for (const mesh of [this.lensA, this.lensB, this.pulse]) {
      mesh.layers.set(LAYER.DISTORTION);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
    }

    /* ---- the body ---- */
    this._owns = false;
    this._moved = false;
    this._savedScale = new Vector3(1, 1, 1);
    this._savedVisible = true;

    /* ---- cast state: a seed and event timestamps, nothing else ---- */
    this._seed = 0;
    /** Age the exit rift began to open; -1 until it has. */
    this._exitOpenAge = -1;
    /** Seconds since the body stepped out; -1 before. */
    this._emergeAge = -1;
    /** Seconds since the rifts snapped shut; -1 before. */
    this._closeAge = -1;
    /** Whether the front has reached the exit. */
    this._arrived = false;

    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._riftState = { open: 0, fade: 1, seed: 0 };
    this._filamentState = { baseA: new Vector3(), baseB: new Vector3(), openA: 0, openB: 0 };
    this._threadState = { from: new Vector3(), dir: new Vector3(0, 0, 1), head: 0, knot: 0, knotGlow: 1, fade: 1, seed: 0 };
    this._lensState = { open: 0, pulse: 0, pulseAt: 0, size: 2, aspect: 1, seed: 0 };
  }

  createParticles() {
    const particles = this.ctx.particles;

    // Motes drawn into the entry as the body goes: aimed to arrive as they
    // die, so no drag, no gravity, and their speed/life scales left at 1.
    this.suck = particles.get('voidstep.suck', {
      capacity: 600,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.suck.uniforms.uDrag.value = 0;
    this.suck.uniforms.uGravity.value.set(0, 0, 0);
    this.suck.uniforms.uEndSize.value = 0.2;
    this.suck.uniforms.uSizeIn.value = 0.15;
    this.suck.uniforms.uFadeIn.value = 0.2;
    this.suck.uniforms.uFadeOut.value = 0.25;
    this.suck.uniforms.uTurbulence.value = 0;

    // Embers torn off the open lips: curling, drifting.
    this.embers = particles.get('voidstep.embers', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.3
    });
    this.embers.uniforms.uDrag.value = 1.6;
    this.embers.uniforms.uEndSize.value = 0.15;
    this.embers.uniforms.uSizeIn.value = 0.05;
    this.embers.uniforms.uFadeIn.value = 0.05;
    this.embers.uniforms.uFadeOut.value = 0.5;

    // Sparks off the slam.
    this.sparks = particles.get('voidstep.sparks', {
      capacity: 1200,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparks.uniforms.uDrag.value = 2.6;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.6;

    this.emberEmitterA = new RateEmitter();
    this.emberEmitterB = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The rifts hold open this long after the front arrives. */
  get impactDuration() {
    return Math.max(0.05, settings.voidstep.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings.voidstep.fadeTime * settings.global.lifetime);
  }

  /** Torn space does not burn steadily: it crackles with the filaments. */
  lightShimmer() {
    return 0.85 + 0.15 * Math.sin(this.age * 41.0) * Math.sin(this.age * 17.3 + this._seed);
  }

  /* ------------------------------------------------------------------ */
  /* Placement                                                           */
  /* ------------------------------------------------------------------ */

  /** Where the entry rift stands: just in front of the caster. */
  _entryPoint(out) {
    const c = settings.voidstep;
    return out.copy(this.origin).addScaledVector(this.direction, Math.min(c.riftOffset, this.length * 0.45)).setY(0);
  }

  /** Where the exit rift stands: just behind the arrival point. */
  _exitPoint(out) {
    const c = settings.voidstep;
    this.pointAt(1, out).setY(0);
    return out.addScaledVector(this.direction, -Math.min(c.riftOffset, this.length * 0.45));
  }

  /* ------------------------------------------------------------------ */
  /* The body                                                            */
  /* ------------------------------------------------------------------ */

  /** Take the character, releasing whoever had it, and remember how it was. */
  _takeCharacter() {
    const character = this.ctx.character;
    if (!character?.root) return;
    if (characterOwner && characterOwner !== this) characterOwner._releaseCharacter();
    characterOwner = this;
    this._owns = true;
    this._savedScale.copy(character.root.scale);
    this._savedVisible = character.root.visible;
  }

  /** Put the body back exactly as it was taken. Safe to call at any time. */
  _releaseCharacter() {
    if (!this._owns) return;
    const character = this.ctx.character;
    if (character?.root) {
      character.root.scale.copy(this._savedScale);
      character.root.visible = this._savedVisible;
    }
    this._owns = false;
    if (characterOwner === this) characterOwner = null;
  }

  /** Squeeze / stretch the body relative to its saved scale. */
  _shapeBody(width, height, visible) {
    if (!this._owns) return;
    const root = this.ctx.character.root;
    root.scale.set(this._savedScale.x * width, this._savedScale.y * height, this._savedScale.z * width);
    root.visible = visible && this._savedVisible;
  }

  /** Going in — 0 whole, 1 gone. */
  _vanish() {
    return saturate(this.age / Math.max(0.01, settings.voidstep.enterTime));
  }

  /**
   * Step out, once: the front has arrived *and* the body is fully gone. Called
   * every frame after arrival until it happens. `force` skips the wait for
   * the vanish — the rifts are about to slam, and nobody is left inside.
   */
  _tryEmerge(force = false) {
    if (this._moved || !this._arrived) return;
    if (!force && this._vanish() < 1) return;
    const c = settings.voidstep;
    this._moved = true;
    this._emergeAge = 0;
    this.pointAt(1, _end);
    if (this._owns) {
      const character = this.ctx.character;
      character.position.x = _end.x;
      character.position.z = _end.z;
      character.position.y = 0;
      character.setFacing?.(Math.atan2(this.direction.x, this.direction.z));
    }
    this._shapeBody(c.enterSqueeze, c.enterStretch, true);
    this._emergeFx();
  }

  _updateBody() {
    const c = settings.voidstep;
    if (!this._owns) return;
    if (!this._moved) {
      const k = Easing.inCubic(this._vanish());
      this._shapeBody(lerp(1, c.enterSqueeze, k), lerp(1, c.enterStretch, k), this._vanish() < 1);
      return;
    }
    const r = saturate(this._emergeAge / Math.max(0.02, c.exitTime));
    if (r >= 1) {
      this._releaseCharacter();
      return;
    }
    const ov = Math.max(0, c.exitOvershoot);
    const x = r - 1;
    const k = 1 + (ov + 1) * x * x * x + ov * x * x; // outBack, tunable
    this._shapeBody(lerp(c.enterSqueeze, 1, k), lerp(c.enterStretch, 1, k), true);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.voidstep;
    const g = settings.global;
    this._seed = Math.random() * 100;
    this._exitOpenAge = -1;
    this._emergeAge = -1;
    this._closeAge = -1;
    this._arrived = false;
    this._moved = false;
    this.emberEmitterA.reset();
    this.emberEmitterB.reset();

    this._takeCharacter();
    this._sync();

    /* motes drawn into the entry from a shell round the body */
    this._entryPoint(_entry);
    _entry.y = c.riftHeight * 0.45;
    const count = Math.round(c.suckCount * g.particleCount);
    const life = Math.max(0.05, c.enterTime * 1.3);
    this._resetEmit(frame.uTime.value);
    for (let n = 0; n < count; n++) {
      _dir.set(randRange(-1, 1), randRange(-0.6, 1), randRange(-1, 1));
      if (_dir.lengthSq() < 1e-4) _dir.set(1, 0, 0);
      _dir.normalize();
      const r = c.suckRadius * randRange(0.6, 1.1);
      _pos.copy(_entry).addScaledVector(_dir, r);
      _pos.y = Math.max(0.05, _pos.y);
      _out.subVectors(_entry, _pos);
      const dist = _out.length();
      _out.multiplyScalar(1 / Math.max(dist, 1e-4));
      _emit.position = _pos;
      _emit.direction = _out;
      _emit.speed = dist / life;
      _emit.speedVariance = 0;
      _emit.spread = 0;
      _emit.size = 0.09;
      _emit.life = life;
      _emit.lifeVariance = 0;
      this.suck.emit(1, _emit);
    }

    this.ctx.shake.add(c.entryShake * g.cameraShake, 7, 18);
    this._updateBody();
    this._updateRifts();
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _sync() {
    const c = settings.voidstep;
    const g = settings.global;

    this.suck.setGradient(getColor(c.colorEmberA), getColor(c.colorEmberB), getColor(c.colorEmberC), getColor(c.colorEmberD));
    this.suck.uniforms.uSizeScale.value = c.emberSize * 14 * g.particleSize;
    this.suck.uniforms.uOpacity.value = g.opacity;
    this.suck.uniforms.uGlow.value = c.emberGlow * g.glow;
    this.suck.uniforms.uStretch.value = 0.6;

    this.embers.setGradient(getColor(c.colorEmberA), getColor(c.colorEmberB), getColor(c.colorEmberC), getColor(c.colorEmberD));
    this.embers.uniforms.uGravity.value.set(0, 0.3, 0);
    this.embers.uniforms.uSizeScale.value = g.particleSize;
    this.embers.uniforms.uLifeScale.value = g.particleLifetime;
    this.embers.uniforms.uSpeedScale.value = g.particleSpeed;
    this.embers.uniforms.uOpacity.value = g.opacity;
    this.embers.uniforms.uGlow.value = c.emberGlow * g.glow;
    this.embers.uniforms.uTurbulence.value = 0.8 * g.turbulence;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    this.sparks.uniforms.uGravity.value.set(0, -2, 0);
    this.sparks.uniforms.uSizeScale.value = g.particleSize;
    this.sparks.uniforms.uLifeScale.value = g.particleLifetime;
    this.sparks.uniforms.uSpeedScale.value = g.particleSpeed;
    this.sparks.uniforms.uOpacity.value = g.opacity;
    this.sparks.uniforms.uGlow.value = c.sparkGlow * g.glow;
    this.sparks.uniforms.uStretch.value = 0.8;
    this.sparks.uniforms.uTurbulence.value = 0.25 * g.turbulence;
  }

  /**
   * How open a rift is, from the age it began to open. Tears open with an
   * overshoot; after the snap, slams shut.
   */
  _openAmount(since) {
    const c = settings.voidstep;
    if (since < 0) return 0;
    const t = saturate(since / Math.max(0.01, c.openTime));
    let open = Easing.outBack(t);
    if (this._closeAge >= 0) {
      open *= 1 - Easing.inCubic(saturate(this._closeAge / Math.max(0.01, c.closeTime)));
    }
    return Math.max(0, open);
  }

  /** The hairline left after the snap, dying over the rest of the fade. */
  _hairline() {
    const c = settings.voidstep;
    if (this._closeAge < 0) return 1;
    const t = (this._closeAge - c.closeTime) / Math.max(0.05, this.fadeDuration * 0.6);
    return 1 - Easing.outQuad(saturate(t));
  }

  _updateRifts() {
    const c = settings.voidstep;
    const openA = this._openAmount(this.age);
    const openB = this._openAmount(this._exitOpenAge < 0 ? -1 : this.age - this._exitOpenAge);
    const fade = this._hairline();

    this._entryPoint(this.riftA.position);
    this._exitPoint(this.riftB.position);

    const state = this._riftState;
    state.fade = fade;
    state.open = openA;
    state.seed = this._seed;
    this.riftMaterialA.userData.sync(state);
    this.riftA.visible = fade > 0.004 && (openA > 0.001 || this._closeAge >= 0);

    state.open = openB;
    state.seed = this._seed + 31.7;
    this.riftMaterialB.userData.sync(state);
    this.riftB.visible = fade > 0.004 && this._exitOpenAge >= 0 && (openB > 0.001 || this._closeAge >= 0);

    /* filaments */
    const fil = this._filamentState;
    fil.baseA.copy(this.riftA.position);
    fil.baseB.copy(this.riftB.position);
    fil.openA = openA;
    fil.openB = openB;
    this.filamentMaterial.userData.sync(fil);
    this.filaments.visible = (openA > 0.02 || openB > 0.02) && Math.round(c.filamentCount) > 0;

    /* lenses */
    const lens = this._lensState;
    lens.pulse = 0;
    lens.pulseAt = 0;
    lens.size = c.lensSize;
    // Stretched tall over the slit.
    lens.aspect = Math.max(1, c.riftHeight / Math.max(0.2, c.lensSize));
    lens.open = Math.min(1, openA);
    lens.seed = this._seed;
    this.lensMaterialA.userData.sync(lens);
    this.lensA.position.copy(this.riftA.position).setY(c.riftLift + c.riftHeight * 0.5);
    this.lensA.visible = lens.open > 0.01;
    lens.open = Math.min(1, openB);
    lens.seed = this._seed + 9;
    this.lensMaterialB.userData.sync(lens);
    this.lensB.position.copy(this.riftB.position).setY(c.riftLift + c.riftHeight * 0.5);
    this.lensB.visible = lens.open > 0.01;

    /* the closing pulse */
    if (this._closeAge < 0) {
      this.pulse.visible = false;
    } else {
      const t = saturate(this._closeAge / Math.max(0.02, c.pulseTime));
      lens.open = 0;
      lens.pulse = (1 - t) * saturate(t * 10);
      lens.pulseAt = lerp(0.05, 0.95, Easing.outCubic(t));
      lens.size = c.pulseSize;
      lens.aspect = 1;
      lens.seed = this._seed + 17;
      this.pulseMaterial.userData.sync(lens);
      this.pointAt(1, this.pulse.position).setY(1.0);
      this.pulse.visible = t < 1;
    }
  }

  _updateThread() {
    const c = settings.voidstep;
    this._entryPoint(_entry);
    this._exitPoint(_exit);
    const span = Math.max(0.01, _exit.distanceTo(_entry));
    // The front runs from the caster; the thread from the entry rift.
    const along = Math.max(0, this.front - _entry.distanceTo(this.origin));
    const head = Math.min(span, along);
    const fade = (1 - Easing.inQuad(saturate(this._closeAge < 0 ? 0 : this._closeAge / Math.max(0.02, c.closeTime * 1.5))));
    const state = this._threadState;
    state.from.copy(_entry);
    state.dir.copy(this.direction);
    state.head = head;
    state.knot = head;
    // The knot is the caster in transit: it dims once they have stepped out.
    state.knotGlow = this._moved ? Math.max(0, 1 - this._emergeAge * 4) : 1;
    state.fade = fade;
    state.seed = this._seed;
    this.threadMaterial.userData.sync(state);
    this.thread.visible = head > 0.05 && fade > 0.004 && this._vanish() > 0.3;
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  _resetEmit(time) {
    _emit.radius = 0;
    _emit.direction = null;
    _emit.speed = 0;
    _emit.speedVariance = 0.4;
    _emit.spread = 0.5;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.5;
    _emit.life = 1;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
  }

  /** Embers torn off one rift's lips, in proportion to how open it is. */
  _emberFx(dt, emitter, at, open) {
    const c = settings.voidstep;
    const g = settings.global;
    const n = emitter.tick(dt, c.emberRate * Math.min(1, open) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    const cam = this.ctx.camera.position;
    // Across the view, the way the rift itself is laid out.
    _out.set(cam.x - at.x, 0, cam.z - at.z);
    if (_out.lengthSq() < 1e-6) _out.set(0, 0, 1);
    _out.normalize();
    _out.set(_out.z, 0, -_out.x);
    for (let i = 0; i < n; i++) {
      const y = randRange(0.12, 0.88);
      const side = Math.random() < 0.5 ? -1 : 1;
      const half = 0.5 * c.riftWidth * Math.min(1, open) * Math.pow(Math.max(0, 4 * y * (1 - y)), c.riftPinch * 0.5);
      _pos.copy(at).addScaledVector(_out, side * half);
      _pos.y = c.riftLift + y * c.riftHeight;
      _dir.copy(_out).multiplyScalar(side).setY(randRange(-0.2, 0.5)).normalize();
      _emit.position = _pos;
      _emit.radius = 0.04;
      _emit.direction = _dir;
      _emit.speed = c.emberSpeed;
      _emit.spread = 0.6;
      _emit.size = c.emberSize;
      _emit.life = c.emberLifetime;
      this.embers.emit(1, _emit);
    }
  }

  /** Stepping out of the exit. */
  _emergeFx() {
    const c = settings.voidstep;
    const g = settings.global;
    this.pointAt(1, _end);
    this._resetEmit(frame.uTime.value);
    _pos.copy(_end).setY(1.0);
    _emit.position = _pos;
    _emit.radius = 0.4;
    _emit.direction = _dir.copy(this.direction).setY(0.3).normalize();
    _emit.speed = 2.2;
    _emit.spread = 0.9;
    _emit.size = c.emberSize * 1.3;
    _emit.life = c.emberLifetime;
    this.embers.emit(Math.round(50 * g.particleCount), _emit);
    this.ctx.decals.spawn(DecalType.RIPPLE, _end, {
      radius: 1.6,
      life: 0.6,
      intensity: 0.6,
      colorA: getColor(c.colorRingA),
      colorB: getColor(c.colorEdgeOuter)
    });
    this.ctx.shake.add(c.exitShake * g.cameraShake, 6, 18);
    this.lightBoost = c.lightIntensity * 0.8;
  }

  /** Both rifts slam shut; the exit throws its pulse. */
  _snapFx() {
    const c = settings.voidstep;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._exitPoint(_exit);
    this.pointAt(1, _end);

    _pos.copy(_exit).setY(c.riftLift + c.riftHeight * 0.45);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: 0.2,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: c.burstIntensity,
      opacity: 0.8,
      fresnel: 2.4,
      squash: 0.85,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _end, {
      radius: c.ringRadius * power,
      life: c.ringLife,
      width: 0.06,
      intensity: 1.0,
      colorA: getColor(c.colorRingA),
      colorB: getColor(c.colorRingB)
    });

    // Sparks off both slits as they slam.
    this._resetEmit(time);
    for (let r = 0; r < 2; r++) {
      if (r === 0) this._entryPoint(_pos);
      else _pos.copy(_exit);
      _pos.y = c.riftLift + c.riftHeight * 0.5;
      _emit.position = _pos;
      _emit.radius = c.riftHeight * 0.3;
      _emit.direction = _up;
      _emit.speed = c.sparkSpeed * (r === 0 ? 0.6 : 1);
      _emit.speedVariance = 0.6;
      _emit.spread = 1.5;
      _emit.size = c.sparkSize;
      _emit.life = c.sparkLifetime;
      this.sparks.emit(Math.round(c.closeSparks * (r === 0 ? 0.4 : 1) * g.particleCount), _emit);
    }

    this.ctx.shake.add(c.closeShake * power * g.cameraShake, 5, 22);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.closeFlash * power);
    this.lightBoost = c.lightIntensity * c.lightBoost * power;

    this._knock();
  }

  /** Everything near the exit is thrown outward from it. */
  _knock() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings.voidstep;
    const g = settings.global;
    this.pointAt(1, _end);
    const found = field.findTargets(_end.x, _end.z, c.knockRadius, this._found);
    if (found.length === 0) return;
    this._force.impulse = c.knockImpulse * g.explosionIntensity;
    this._force.lift = c.knockLift * g.explosionIntensity;
    this._force.spin = c.knockSpin;
    for (const dummy of found) {
      _dir.set(dummy.position.x - _end.x, 0, dummy.position.z - _end.z);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      else _dir.normalize();
      dummy.kill(_dir.x, _dir.z, this._force);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  /** Everything that runs on every frame of every phase. */
  _step(dt) {
    const c = settings.voidstep;
    const speed = Math.max(0.1, c.speed * settings.global.speed);

    // The exit tears open `exitOpenLead` seconds before the caster reaches it.
    if (this._exitOpenAge < 0 && (this.length - this.front) / speed <= c.exitOpenLead) {
      this._exitOpenAge = this.age;
    }
    if (this._moved) this._emergeAge += dt;
    if (this._closeAge >= 0) this._closeAge += dt;

    this._tryEmerge();
    this._sync();
    this._updateBody();
    this._updateRifts();
    this._updateThread();

    if (this._closeAge < 0) {
      this._entryPoint(_entry);
      this._emberFx(dt, this.emberEmitterA, _entry, this._openAmount(this.age));
      if (this._exitOpenAge >= 0) {
        this._exitPoint(_exit);
        this._emberFx(dt, this.emberEmitterB, _exit, this._openAmount(this.age - this._exitOpenAge));
      }
    }
  }

  onTravel(dt) {
    const c = settings.voidstep;
    this._step(dt);
    // The light rides the knot in the thread — where the caster *is*.
    this.position.y = c.threadHeight;
  }

  onImpact() {
    this._arrived = true;
    // The exit has to be open by now even on a step too short for the lead.
    if (this._exitOpenAge < 0) this._exitOpenAge = this.age;
    this._tryEmerge();
  }

  onFade(dt, t) {
    // The snap: on the frame the hold runs out.
    if (t >= 1 && this._closeAge < 0) {
      this._tryEmerge(true);
      this._closeAge = 0;
      this._snapFx();
    }
    this._step(dt);
    this.pointAt(1, this.position);
    this.position.y = 1.2;
  }

  onDestroy() {
    // First, always: whatever state the cast is in, the body goes back.
    this._releaseCharacter();
    this._moved = false;
    this._arrived = false;
    this._exitOpenAge = -1;
    this._emergeAge = -1;
    this._closeAge = -1;
    this.riftA.visible = false;
    this.riftB.visible = false;
    this.filaments.visible = false;
    this.thread.visible = false;
    this.lensA.visible = false;
    this.lensB.visible = false;
    this.pulse.visible = false;
  }

  dispose() {
    this._releaseCharacter();
    this.riftGeometry.dispose();
    this.riftMaterialA.dispose();
    this.riftMaterialB.dispose();
    this.filamentGeometry.dispose();
    this.filamentMaterial.dispose();
    this.threadGeometry.dispose();
    this.threadMaterial.dispose();
    this.lensGeometry.dispose();
    this.lensMaterialA.dispose();
    this.lensMaterialB.dispose();
    this.pulseMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⧘  Voidstep Rift');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 3, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 120, 0.5, 'transit speed (m/s)');
  R(cast, c, 'lifetime', 0.05, 4, 0.01, 'rifts hold for (s)');
  R(cast, c, 'fadeTime', 0.1, 3, 0.01, 'close settles over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);
  cast.addColor(c, 'colorA').name('void');
  cast.addColor(c, 'colorB').name('tear');

  const body = folder.addFolder('The body');
  R(body, c, 'enterTime', 0.01, 1, 0.005, 'drawn in over (s)');
  R(body, c, 'exitTime', 0.02, 1.5, 0.005, 'steps out over (s)');
  R(body, c, 'enterSqueeze', 0.01, 1, 0.01, 'pinched width');
  R(body, c, 'enterStretch', 0.5, 3, 0.01, 'pinched height');
  R(body, c, 'exitOvershoot', 0, 4, 0.05, 'step-out overshoot');

  const rift = folder.addFolder('1 · Rifts');
  R(rift, c, 'riftHeight', 0.5, 6, 0.01, 'height (m)');
  R(rift, c, 'riftWidth', 0.1, 4, 0.01, 'width (m)');
  R(rift, c, 'riftLift', 0, 1, 0.005, 'lift (m)');
  R(rift, c, 'riftOffset', 0, 3, 0.01, 'offset from body (m)');
  R(rift, c, 'openTime', 0.01, 1, 0.005, 'tear open (s)');
  R(rift, c, 'closeTime', 0.01, 1, 0.005, 'slam shut (s)');
  R(rift, c, 'exitOpenLead', 0, 1.5, 0.01, 'exit opens ahead (s)');
  R(rift, c, 'riftPinch', 0.1, 6, 0.05, 'pinch');
  R(rift, c, 'riftJag', 0, 1, 0.01, 'torn edge');
  R(rift, c, 'riftJagScale', 0.2, 16, 0.05, 'tear scale');
  R(rift, c, 'riftJagSpeed', 0, 10, 0.05, 'tear speed');
  R(rift, c, 'edgeWidth', 0.005, 0.4, 0.001, 'lip width (m)');
  R(rift, c, 'edgeGlow', 0, 16, 0.05, 'lip glow');
  R(rift, c, 'edgeFlicker', 0, 1, 0.01, 'lip flicker');
  R(rift, c, 'voidDepth', 0, 12, 0.05, 'void depth (m)');
  R(rift, c, 'voidSwirl', -6, 6, 0.05, 'swirl (rad/s)');
  R(rift, c, 'voidTwist', 0, 10, 0.05, 'twist');
  R(rift, c, 'starDensity', 2, 120, 0.5, 'star density');
  R(rift, c, 'starSize', 0.01, 0.4, 0.005, 'star size');
  R(rift, c, 'starBright', 0, 12, 0.05, 'star brightness');
  R(rift, c, 'nebula', 0, 3, 0.01, 'gas');
  R(rift, c, 'nebulaScale', 0.2, 8, 0.05, 'gas scale');
  R(rift, c, 'voidGlow', 0, 4, 0.01, 'void brightness');
  R(rift, c, 'riftOpacity', 0, 1, 0.01, 'void opacity');
  rift.addColor(c, 'colorVoidDeep').name('void deep');
  rift.addColor(c, 'colorVoidGas').name('void gas');
  rift.addColor(c, 'colorStar').name('stars');
  rift.addColor(c, 'colorEdgeCore').name('lip core');
  rift.addColor(c, 'colorEdgeGlow').name('lip glow');
  rift.addColor(c, 'colorEdgeOuter').name('lip halo');

  const fil = folder.addFolder('2 · Filaments');
  R(fil, c, 'filamentCount', 0, MAX_FILAMENTS, 1, 'per rift');
  R(fil, c, 'filamentLength', 0.05, 3, 0.01, 'length (m)');
  R(fil, c, 'filamentWidth', 0.002, 0.2, 0.001, 'width (m)');
  R(fil, c, 'filamentJag', 0, 1, 0.005, 'kinks (m)');
  R(fil, c, 'filamentRate', 0, 40, 0.1, 'strikes / s');
  R(fil, c, 'filamentGlow', 0, 12, 0.05, 'glow');
  fil.addColor(c, 'colorFilament').name('colour');

  const thread = folder.addFolder('3 · Thread');
  R(thread, c, 'threadHeight', 0, 3, 0.01, 'height (m)');
  R(thread, c, 'threadWidth', 0.005, 0.5, 0.005, 'width (m)');
  R(thread, c, 'threadGlow', 0, 10, 0.05, 'glow');
  R(thread, c, 'threadPulse', 0, 8, 0.05, 'transit knot');
  R(thread, c, 'threadPulseSize', 0.05, 5, 0.05, 'knot size (m)');
  R(thread, c, 'threadNoise', 0, 1, 0.01, 'tearing');
  R(thread, c, 'threadNoiseScale', 0.1, 6, 0.05, 'tear scale');
  R(thread, c, 'threadOpacity', 0, 1, 0.01, 'opacity');
  thread.addColor(c, 'colorThreadCore').name('core');
  thread.addColor(c, 'colorThreadEdge').name('edge');

  const lens = folder.addFolder('4 · Lenses');
  R(lens, c, 'lensStrength', 0, 3, 0.01, 'pull strength');
  R(lens, c, 'lensSize', 0.2, 10, 0.05, 'pull size (m)');
  R(lens, c, 'lensSwirl', 0, 1, 0.01, 'twist');
  R(lens, c, 'pulseStrength', 0, 5, 0.01, 'pulse strength');
  R(lens, c, 'pulseSize', 0.5, 20, 0.1, 'pulse size (m)');
  R(lens, c, 'pulseTime', 0.05, 2, 0.01, 'pulse time (s)');

  const parts = folder.addFolder('5 · Particles');
  R(parts, c, 'emberRate', 0, 400, 1, 'embers / s per rift');
  R(parts, c, 'emberSize', 0.01, 0.3, 0.005, 'ember size');
  R(parts, c, 'emberSpeed', 0, 8, 0.05, 'ember speed');
  R(parts, c, 'emberLifetime', 0.05, 4, 0.05, 'ember life');
  R(parts, c, 'emberGlow', 0, 8, 0.05, 'ember glow');
  Editor.gradient(parts, c, 'colorEmber', 'ember colour');
  R(parts, c, 'suckCount', 0, 300, 1, 'drawn-in motes');
  R(parts, c, 'suckRadius', 0.2, 5, 0.05, 'drawn from (m)');
  R(parts, c, 'closeSparks', 0, 400, 1, 'slam sparks');
  R(parts, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(parts, c, 'sparkSize', 0.01, 0.4, 0.005, 'spark size');
  R(parts, c, 'sparkLifetime', 0.05, 3, 0.01, 'spark life');
  R(parts, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  Editor.gradient(parts, c, 'colorSpark', 'spark colour');

  const pulse = folder.addFolder('6 · Closing pulse');
  R(pulse, c, 'knockRadius', 0, 10, 0.05, 'knock radius (m)');
  R(pulse, c, 'knockImpulse', 0, 25, 0.1, 'thrown out (m/s)');
  R(pulse, c, 'knockLift', 0, 20, 0.1, 'thrown up (m/s)');
  R(pulse, c, 'knockSpin', 0, 4, 0.01, 'torque');
  R(pulse, c, 'burstRadius', 0.2, 10, 0.05, 'shell radius (m)');
  R(pulse, c, 'burstLife', 0.05, 2, 0.01, 'shell life');
  R(pulse, c, 'burstIntensity', 0, 6, 0.05, 'shell intensity');
  pulse.addColor(c, 'colorBurstA').name('shell core');
  pulse.addColor(c, 'colorBurstB').name('shell body');
  pulse.addColor(c, 'colorBurstC').name('shell edge');
  R(pulse, c, 'ringRadius', 0.2, 10, 0.05, 'ring (m)');
  R(pulse, c, 'ringLife', 0.05, 3, 0.01, 'ring life');
  pulse.addColor(c, 'colorRingA').name('ring');
  pulse.addColor(c, 'colorRingB').name('ring, hot');
  R(pulse, c, 'entryShake', 0, 1, 0.01, 'entry shake');
  R(pulse, c, 'exitShake', 0, 1.5, 0.01, 'exit shake');
  R(pulse, c, 'closeShake', 0, 2, 0.01, 'slam shake');
  R(pulse, c, 'closeFlash', 0, 2, 0.01, 'slam flash');
  pulse.addColor(c, 'colorFlash').name('flash');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 30, 0.1, 'radius');
  R(light, c, 'lightBoost', 0, 8, 0.05, 'slam punch (× intensity)');

  folder.close();
  return folder;
}
