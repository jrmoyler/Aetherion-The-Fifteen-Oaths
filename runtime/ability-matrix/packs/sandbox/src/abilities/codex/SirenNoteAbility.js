import { Mesh, PlaneGeometry, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createSirenSheetMaterial,
  createSirenLensMaterial,
  createSirenFrontMaterial,
  createSirenGroundMaterial
} from '../../materials/codex/SirenNoteMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing } from '../../utils/math.js';

export const ID = 'sirennote';

const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _end = new Vector3();
const _up = new Vector3(0, 1, 0);

/** Push one particle system's gradient and the globals through. */
function syncSystem(p, a, b, cc, d, size, glow, turb) {
  const g = settings.global;
  p.setGradient(getColor(a), getColor(b), getColor(cc), getColor(d));
  p.uniforms.uSizeScale.value = size * g.particleSize * 7;
  p.uniforms.uLifeScale.value = g.particleLifetime;
  p.uniforms.uSpeedScale.value = g.particleSpeed;
  p.uniforms.uOpacity.value = g.opacity;
  p.uniforms.uGlow.value = glow;
  p.uniforms.uTurbulence.value = turb * g.turbulence;
}

/**
 * SIREN NOTE — Wind, line cast.
 *
 * One note, held. It leaves the caster's mouth-height as a taut thread and
 * opens within a few metres into a **sheet of air** two and a half metres
 * across, laid flat at chest height and banked a little toward the camera,
 * running all the way from the caster to the front. The sheet **vibrates**:
 * a standing wave with its nodes fixed every half-wavelength, so the sheet
 * visibly swings between still lines — taut, glowing strands across it are
 * bright where it moves and dark where it does not, and the thin film between
 * them shivers through a spectrum with the displacement. A travelling ripple
 * runs just behind the white **leading edge**, and standing across the line
 * at the front is the note's **wavefront** — a disc of pressure arcs racing
 * outward, split into colour at the rim.
 *
 * Under it, the note sorts the dust: a **Chladni pattern** — the nodal lines
 * of a vibrating plate — appears on the floor behind the front, pale ridges
 * on a scoured, dark band. Rings pulse off every node, wind lines stream off
 * the sheet's edges, dust is thrown sideways from under the front.
 *
 * At the end of the line the note **screams**: the amplitude spikes, the
 * wavefront blooms to several times its size and thins to its rim, an AIR
 * shell and a shockwave go off, the camera is knocked. The sheet hangs taut
 * for a beat, then **shreds** from the far end back into its own strands,
 * which fray and vanish; the floor pattern erodes.
 *
 * It is not Resonance Pulse (a train of travelling ring-caps) or Gale Sever
 * (a crescent blade): it is one continuous, vibrating membrane from the hand
 * to the target, the whole length of the cast at once.
 *
 * ## Layers
 *
 *   1. **the sheet** (`createSirenSheetMaterial`) — a strip bent into the
 *      vibrating sheet in the vertex stage. Premultiplied: a filled body of
 *      pressed air (dark deep teal in the nodes, saturated teal where it
 *      swings) occludes what is behind it, and the light — pale strands,
 *      white-hot leading edge — adds on top. Four-stop ramp
 *      colorEdge → colorStrand → colorMembrane → colorDeep.
 *
 *   After the scream the note does not stop: for `holdTime` it **rings down**
 *   — still vibrating, swelling on a slow tremolo and decaying — while the
 *   floor's Chladni plate keeps re-sorting, crawling between two modes, its
 *   filled lobes of piled dust pulsing with the note. Then it shreds.
 *   2. **the lens** (`createSirenLensMaterial`) — the same sheet, wider, on
 *      `LAYER.DISTORTION`, bending the world by the wave's own slope.
 *   3. **the wavefront** (`createSirenFrontMaterial`) — the pressure disc, a
 *      dark filled disc with teal arcs (not a glass rim); at the end the scream.
 *   4. **the Chladni floor** (`createSirenGroundMaterial`) — filled: deep
 *      scour, saturated lobes of piled dust, pale glowing ridges.
 *   5. **particles** — STREAK wind lines off the edges, RING pulses off every
 *      node, non-additive SMOKE dust thrown sideways under the front.
 *   6. **the scream** — AIR shell, SHOCKWAVE, flash, shake, light punch.
 *
 * ## The bodies
 *
 * `handlesOwnHits`. A body within `hitRadius` of the front as it passes is
 * **cut** (`slice = true`) at chest height and carried on down the line. At
 * the scream everything within `blastRadius` of the end is thrown outward.
 *
 * ## The editor rule
 *
 * A cast captures a seed and three integrated phases (the note, the ripple,
 * the wavefront arcs). Every metre, rate and colour is resolved from
 * `settings.sirennote` every frame, so a slider re-shapes a note already in
 * the air and the rate sliders never make a phase jump.
 */
export class SirenNoteAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /** The sheet decides whom it cuts. */
  get handlesOwnHits() {
    return true;
  }

  /** Nodes currently ringing. HUD readout only. */
  get instanceCount() {
    return this._nodes;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    // Parameter-space strip: x 0..1 along, y −1..1 across.
    this.stripGeometry = new PlaneGeometry(1, 2, 180, 14);
    this.stripGeometry.translate(0.5, 0, 0);
    this.groundGeometry = new PlaneGeometry(1, 2, 1, 1);
    this.groundGeometry.translate(0.5, 0, 0);
    this.quadGeometry = new PlaneGeometry(2, 2, 1, 1);

    /* ---- layer 4: the floor, under everything ---- */
    this.groundMaterial = createSirenGroundMaterial();
    this.ground = this._mesh(this.groundGeometry, this.groundMaterial, LAYER.VFX, 2);

    /* ---- layer 1: the sheet ---- */
    this.sheetMaterial = createSirenSheetMaterial();
    this.sheet = this._mesh(this.stripGeometry, this.sheetMaterial, LAYER.VFX, 14);

    /* ---- layer 2: the lens ---- */
    this.lensMaterial = createSirenLensMaterial();
    this.lens = this._mesh(this.stripGeometry, this.lensMaterial, LAYER.DISTORTION, 0);

    /* ---- layer 3: the wavefront ---- */
    this.frontMaterial = createSirenFrontMaterial();
    this.frontDisc = this._mesh(this.quadGeometry, this.frontMaterial, LAYER.VFX, 15);

    /** Scratch state handed to the materials — one object apiece, reused. */
    this._sheetState = {
      hand: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      reach: 0,
      phase: 0,
      ripplePhase: 0,
      scream: 0,
      shred: 0,
      fade: 1,
      seed: 0
    };
    this._frontState = {
      center: new Vector3(),
      axisU: new Vector3(),
      axisV: new Vector3(0, 1, 0),
      size: 1,
      phase: 0,
      intensity: 1,
      open: 0,
      seed: 0
    };
    this._groundState = {
      start: new Vector3(),
      dir: new Vector3(),
      side: new Vector3(),
      length: 1,
      reach: 0,
      heat: 1,
      erode: 0,
      seed: 0,
      morph: 0,
      pulse: 0
    };
    this._morph = 0;

    this._seed = 0;
    this._phase = 0;
    this._ripple = 0;
    this._arcs = 0;
    this._reach = 0;
    this._nodes = 0;
    this._screamed = false;

    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };
  }

  _mesh(geometry, material, layer, order) {
    const mesh = new Mesh(geometry, material);
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- wind lines off the sheet's edges ---- */
    this.streaks = particles.get('sirennote.streak', {
      capacity: 1600,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.streaks.uniforms.uDrag.value = 1.5;
    this.streaks.uniforms.uEndSize.value = 0.4;
    this.streaks.uniforms.uSizeIn.value = 0.05;
    this.streaks.uniforms.uFadeIn.value = 0.1;
    this.streaks.uniforms.uFadeOut.value = 0.5;

    /* ---- pulses off every node ---- */
    this.rings = particles.get('sirennote.ring', {
      capacity: 600,
      shape: ParticleShape.RING,
      additive: true,
      softFade: 0.2
    });
    this.rings.uniforms.uDrag.value = 3;
    this.rings.uniforms.uEndSize.value = 2.5;
    this.rings.uniforms.uSizeIn.value = 0.02;
    this.rings.uniforms.uFadeIn.value = 0.05;
    this.rings.uniforms.uFadeOut.value = 0.7;

    /* ---- dust thrown sideways: not additive ---- */
    this.dust = particles.get('sirennote.dust', {
      capacity: 1200,
      shape: ParticleShape.SMOKE,
      additive: false,
      curl: true,
      softFade: 0.7
    });
    this.dust.uniforms.uDrag.value = 1.8;
    this.dust.uniforms.uEndSize.value = 2.4;
    this.dust.uniforms.uSizeIn.value = 0.15;
    this.dust.uniforms.uFadeIn.value = 0.1;
    this.dust.uniforms.uFadeOut.value = 0.6;

    this.streakEmitter = new RateEmitter();
    this.ringEmitter = new RateEmitter();
    this.dustEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The impact phase is the scream and the taut hang after it. */
  get impactDuration() {
    const c = settings[ID];
    return Math.max(0.05, (Math.max(0.03, c.screamTime) + Math.max(0, c.holdTime)) * settings.global.lifetime);
  }

  /** The fade is the shred, then the floor eroding. */
  get fadeDuration() {
    const c = settings[ID];
    return Math.max(0.1, (Math.max(0.05, c.lifetime) + Math.max(0.05, c.groundFade)) * settings.global.lifetime);
  }

  /** The light warbles with the note. */
  lightShimmer() {
    const f = settings[ID].lightFlicker;
    return 1 - f * 0.5 + f * 0.5 * Math.abs(Math.cos(this._phase));
  }

  /* ------------------------------------------------------------------ */
  /* The sheet on the CPU                                                */
  /* ------------------------------------------------------------------ */

  /** The mouth, in the world. */
  _hand(out) {
    const c = settings[ID];
    return out
      .copy(this.origin)
      .addScaledVector(this.direction, c.handForward)
      .addScaledVector(this.side, c.handSide)
      .setY(c.handHeight);
  }

  /**
   * A point on the sheet, `d` metres from the mouth and `v` −1..1 across.
   * The CPU twin of `sheetPoint` in SirenNoteMaterials, without the wave
   * (particles only need to start near it).
   */
  _sheetPoint(d, v, out) {
    const c = settings[ID];
    const st = this._sheetState;
    const open = smoothstep(0, Math.max(0.05, c.sheetFlare), d);
    const halfW = lerp(c.sheetPinch, c.sheetWidth, open) * 0.5;
    out.copy(st.hand).addScaledVector(this.direction, d);
    out.y = lerp(st.hand.y, c.sheetHeight, open);
    out.addScaledVector(this.side, v * halfW * Math.cos(c.sheetBank));
    out.y += v * halfW * Math.sin(c.sheetBank);
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._seed = Math.random() * 10;
    this._phase = 0;
    this._ripple = 0;
    this._arcs = 0;
    this._reach = 0;
    this._nodes = 0;
    this._screamed = false;
    this._morph = 0;
    this.streakEmitter.reset();
    this.ringEmitter.reset();
    this.dustEmitter.reset();
    this.sheet.visible = false;
    this.lens.visible = false;
    this.frontDisc.visible = false;
    this.ground.visible = false;
  }

  /** Advance the integrated phases and push every material. */
  _sync(dt, scream, shred, fade, frontOpen, frontIntensity, heat, erode) {
    const c = settings[ID];
    const g = settings.global;
    this._phase += dt * c.noteRate * TAU * g.noiseSpeed * (1 + scream * 0.8);
    this._ripple += dt * c.rippleSpeed * g.noiseSpeed;
    this._arcs += dt * c.frontSpeed * g.noiseSpeed * (1 + scream * 2);

    const st = this._sheetState;
    this._hand(st.hand);
    st.dir.copy(this.direction);
    st.side.copy(this.side);
    st.reach = this._reach;
    st.phase = this._phase;
    st.ripplePhase = this._ripple;
    st.scream = scream;
    st.shred = shred;
    st.fade = fade;
    st.seed = this._seed;
    this.sheetMaterial.userData.sync(st);
    this.lensMaterial.userData.sync(st);

    /* --- the wavefront stands across the line at the front --- */
    const fs = this._frontState;
    this._sheetPoint(this._reach, 0, fs.center);
    fs.axisU.copy(this.side);
    fs.axisV.set(0, 1, 0);
    const open = smoothstep(0, Math.max(0.05, c.sheetFlare), this._reach);
    fs.size = Math.max(0.05, c.frontSize * (0.25 + 0.75 * open) * (1 + (c.screamSize - 1) * frontOpen) * (frontOpen > 0 ? g.explosionIntensity : 1));
    fs.phase = this._arcs;
    fs.intensity = frontIntensity;
    fs.open = frontOpen;
    fs.seed = this._seed;
    this.frontMaterial.userData.sync(fs);

    /* --- the floor --- */
    const gs = this._groundState;
    gs.start.copy(this.origin);
    gs.dir.copy(this.direction);
    gs.side.copy(this.side);
    gs.length = this.length + 1;
    gs.reach = this._reach + c.handForward;
    gs.heat = heat;
    gs.erode = erode;
    gs.seed = this._seed;
    this._morph += dt * c.groundMorph * TAU * g.noiseSpeed * (0.3 + 0.7 * heat) * (1 + scream);
    gs.morph = this._morph;
    gs.pulse = Math.abs(Math.cos(this._phase)) * heat;
    this.groundMaterial.userData.sync(gs);

    syncSystem(this.streaks, c.colorStreakA, c.colorStreakB, c.colorStreakC, c.colorStreakD, c.streakSize, 2 * g.glow, 0.15);
    this.streaks.uniforms.uStretch.value = c.streakStretch;
    this.streaks.uniforms.uGravity.value.set(0, 0, 0);
    syncSystem(this.rings, c.colorRingA, c.colorRingB, c.colorRingC, c.colorRingD, c.ringSize, c.ringGlow * g.glow, 0);
    this.rings.uniforms.uGravity.value.set(0, 0, 0);
    syncSystem(this.dust, c.colorDustA, c.colorDustB, c.colorDustC, c.colorDustD, c.dustSize, 1, 0.6);
    this.dust.uniforms.uOpacity.value = c.dustOpacity * g.opacity;
    this.dust.uniforms.uGravity.value.set(0, 0.15, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Particles                                                           */
  /* ------------------------------------------------------------------ */

  _fillEmit(position, radius, direction, speed, spread, size, life) {
    _emit.position = position;
    _emit.radius = radius;
    _emit.direction = direction;
    _emit.speed = speed;
    _emit.speedVariance = 0.35;
    _emit.spread = spread;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = size;
    _emit.sizeVariance = 0.4;
    _emit.life = life;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
  }

  /** Wind lines streaming off the two edges, forward along the line. */
  _streakFx(dt, rate, scale) {
    const c = settings[ID];
    const g = settings.global;
    const count = Math.round(this.streakEmitter.tick(dt, rate) * g.particleCount);
    if (count <= 0 || this._reach < 0.2) return;
    this._fillEmit(_pos, 0.05, this.direction, c.speed * g.speed * c.streakSpeed * scale, 0.04, 0.06, c.streakLife);
    for (let k = 0; k < count; k++) {
      const d = Math.random() * this._reach;
      const v = Math.random() < 0.5 ? -1 : 1;
      this._sheetPoint(d, v * (0.8 + Math.random() * 0.25), _pos);
      _pos.y += (Math.random() - 0.5) * c.waveAmp;
      _emit.position = _pos;
      this.streaks.emit(1, _emit);
    }
  }

  /** Rings pulsing off the nodes — every half wavelength from the mouth. */
  _ringFx(dt, boost) {
    const c = settings[ID];
    const g = settings.global;
    const half = Math.max(0.2, c.waveLength * 0.5);
    const nodes = Math.min(64, Math.floor(this._reach / half));
    this._nodes = nodes;
    if (nodes <= 0) return;
    const count = Math.round(this.ringEmitter.tick(dt, c.ringRate * nodes * boost) * g.particleCount);
    if (count <= 0) return;
    this._fillEmit(_pos, 0, _up, 0.01, 0, 0.12, c.ringLife);
    _emit.sizeVariance = 0.15;
    for (let k = 0; k < count; k++) {
      const j = 1 + ((Math.random() * nodes) | 0);
      this._sheetPoint(j * half, 0, _pos);
      _emit.position = _pos;
      this.rings.emit(1, _emit);
    }
  }

  /** Dust shoved out sideways from under the front. */
  _dustFx(dt) {
    const c = settings[ID];
    const g = settings.global;
    const count = Math.round(this.dustEmitter.tick(dt, c.dustRate) * g.particleCount);
    if (count <= 0) return;
    this._fillEmit(_pos, 0.3, _dir, c.dustSpeed, 0.25, 0.4, c.dustLife);
    for (let k = 0; k < count; k++) {
      const s = Math.random() < 0.5 ? -1 : 1;
      _pos.copy(this.position).setY(0.15).addScaledVector(this.side, s * c.sheetWidth * 0.4);
      _dir.copy(this.side).multiplyScalar(s).addScaledVector(this.direction, 0.4).setY(0.35);
      _emit.position = _pos;
      _emit.direction = _dir;
      this.dust.emit(1, _emit);
    }
  }

  /* ------------------------------------------------------------------ */
  /* The bodies                                                          */
  /* ------------------------------------------------------------------ */

  /** Cut whatever the front is passing. */
  _cut() {
    const c = settings[ID];
    const g = settings.global;
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const found = field.findTargets(this.position.x, this.position.z, Math.max(0.1, c.hitRadius), this._found);
    for (let f = 0; f < found.length; f++) {
      const dummy = found[f];
      this._force.impulse = c.hitImpulse * g.explosionIntensity;
      this._force.lift = c.hitLift * g.explosionIntensity;
      this._force.spin = c.hitSpin;
      dummy.kill(this.direction.x, this.direction.z, this._force, true);
    }
    this._found.length = 0;
  }

  /** The scream throws everything near the end outward. */
  _blast() {
    const c = settings[ID];
    const g = settings.global;
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    this.pointAt(1, _end);
    const found = field.findTargets(_end.x, _end.z, Math.max(0.1, c.blastRadius), this._found);
    for (let f = 0; f < found.length; f++) {
      const dummy = found[f];
      _dir.set(dummy.position.x - _end.x, 0, dummy.position.z - _end.z);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      _dir.normalize().addScaledVector(this.direction, 0.6).normalize();
      this._force.impulse = c.blastImpulse * g.explosionIntensity;
      this._force.lift = c.blastLift * g.explosionIntensity;
      this._force.spin = c.hitSpin;
      dummy.kill(_dir.x, _dir.z, this._force);
    }
    this._found.length = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings[ID];
    const g = settings.global;
    this._reach = Math.max(0.01, this.front - c.handForward);
    // The opening beat: the sheet is a thread for its first instants.
    const born = Easing.outCubic(saturate(this.age / 0.12));
    this._sync(dt, 0, 0, born, 0, born, 1, 0);
    this._sheetPoint(this._reach, 0, this.position);

    this.sheet.visible = true;
    this.lens.visible = true;
    this.frontDisc.visible = true;
    this.ground.visible = true;

    this._streakFx(dt, c.streakRate, 1);
    this._ringFx(dt, 1);
    this._dustFx(dt);
    this._cut();
    this.ctx.shake.rumble(c.travelRumble * g.cameraShake, dt);
  }

  onImpact() {
    const c = settings[ID];
    const g = settings.global;
    const power = g.explosionIntensity;
    this._reach = Math.max(0.01, this.length - c.handForward);
    this._sheetPoint(this._reach, 0, _pos);
    this.pointAt(1, _end);

    this.ctx.shake.add(c.impactShake * power, 4, 24);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * power);
    this.lightBoost = c.impactLight * power;
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: 0.3,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: c.burstIntensity,
      opacity: c.burstOpacity * g.opacity,
      squash: 0.75,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _end, {
      radius: c.shockRadius * power,
      life: c.shockLife,
      width: 0.05,
      intensity: c.shockIntensity,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB),
      height: 0.03
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _end, {
      radius: c.burstRadius * 0.8,
      life: 1.0,
      intensity: 0.6,
      colorA: getColor(c.colorDustA),
      colorB: getColor(c.colorDustC),
      growth: 0.5,
      height: 0.025
    });

    // A shout of rings and wind lines straight out of the front.
    this._fillEmit(_pos, 0.2, this.direction, 0.5, 1, 0.3, c.ringLife * 1.2);
    this.rings.emit(Math.round(8 * g.particleCount), _emit);
    this._fillEmit(_pos, 0.3, this.direction, c.speed * 0.5, 0.9, 0.08, c.streakLife * 1.5);
    this.streaks.emit(Math.round(70 * g.particleCount), _emit);
    this._blast();
    this._screamed = true;
  }

  onFade(dt, t) {
    const c = settings[ID];
    const g = settings.global;
    this._reach = Math.max(0.01, this.length - c.handForward);
    let scream = 0;
    let frontOpen = 0;
    let frontI = 0;
    let shred = 0;
    let erode = 0;
    let heat = 1;

    if (this.phase === AbilityPhase.IMPACT) {
      const st = Math.max(0.03, c.screamTime) * g.lifetime;
      const k = saturate(this.impactTime / st);
      // A swell and release; after it the sheet hangs taut, still faintly singing.
      // After the scream the note rings down: still vibrating, swelling and
      // dying on a slow tremolo — the linger has its own motion.
      const holdT = Math.max(0, this.impactTime - st);
      const ring = c.ringDown * Math.exp(-holdT * c.ringDecay) * (0.55 + 0.45 * Math.sin(holdT * TAU * c.tremolo));
      scream = k < 1 ? Math.sin(Math.PI * k) : ring;
      frontOpen = Easing.outCubic(k);
      frontI = 1 - Easing.inQuad(k);
    } else {
      const fd = this.fadeDuration;
      const shredT = Math.max(0.05, c.lifetime) * g.lifetime;
      shred = saturate(this.fadeTime / shredT);
      const gf = Math.max(0.05, c.groundFade) * g.lifetime;
      erode = saturate((this.fadeTime - (fd - gf)) / gf);
      heat = 1 - shred;
      frontOpen = 1;
      frontI = 0;
    }
    const fade = 1 - Easing.inQuad(saturate((t - 1) * 1.05));
    this._sync(dt, scream, shred, Math.max(0, fade), frontOpen, frontI, heat, erode);

    this._sheetPoint(this._reach, 0, this.position);
    this.frontDisc.visible = frontI > 0.01;
    this.sheet.visible = fade > 0.01 && shred < 1;
    this.lens.visible = this.sheet.visible;
    this.ground.visible = erode < 1;

    const live = 1 - shred;
    if (live > 0.01) {
      this._streakFx(dt, c.streakRate * (0.4 + scream) * live, 0.6);
      this._ringFx(dt, (0.5 + scream * 2) * live);
    } else {
      this._nodes = 0;
    }
  }

  onDestroy() {
    this._nodes = 0;
    this.sheet.visible = false;
    this.lens.visible = false;
    this.frontDisc.visible = false;
    this.ground.visible = false;
  }

  dispose() {
    this.stripGeometry.dispose();
    this.groundGeometry.dispose();
    this.quadGeometry.dispose();
    this.sheetMaterial.dispose();
    this.lensMaterial.dispose();
    this.frontMaterial.dispose();
    this.groundMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('〰  Siren Note');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 80, 0.5, 'front speed (m/s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);
  R(cast, c, 'handForward', 0, 2, 0.01, 'mouth forward (m)');
  R(cast, c, 'handSide', -1, 1, 0.01, 'mouth side (m)');
  R(cast, c, 'handHeight', 0.2, 3, 0.01, 'mouth height (m)');

  const shape = folder.addFolder('1 · Sheet shape');
  R(shape, c, 'sheetWidth', 0.2, 8, 0.05, 'width (m)');
  R(shape, c, 'sheetPinch', 0.01, 2, 0.01, 'width at the mouth (m)');
  R(shape, c, 'sheetFlare', 0.1, 10, 0.05, 'opens over (m)');
  R(shape, c, 'sheetHeight', 0.2, 4, 0.01, 'height (m)');
  R(shape, c, 'sheetBank', -1.2, 1.2, 0.01, 'bank (rad)');
  R(shape, c, 'waveAmp', 0, 1.5, 0.01, 'amplitude (m)');
  R(shape, c, 'waveLength', 0.4, 12, 0.05, 'wavelength (m)');
  R(shape, c, 'noteRate', 0, 20, 0.05, 'vibrations / s');
  R(shape, c, 'rippleLength', 0.05, 8, 0.05, 'ripple length (m)');
  R(shape, c, 'rippleSpeed', 0, 80, 0.5, 'ripple speed');

  const look = folder.addFolder('2 · Sheet look');
  R(look, c, 'strands', 1, 30, 1, 'strands');
  R(look, c, 'strandWidth', 0.01, 0.5, 0.005, 'strand width');
  R(look, c, 'strandGlow', 0, 10, 0.05, 'strand glow');
  R(look, c, 'membraneGlow', 0, 4, 0.01, 'membrane glow');
  R(look, c, 'membraneFill', 0, 1, 0.01, 'membrane body (dark fill)');
  look.addColor(c, 'colorDeep').name('deep (body)');
  R(look, c, 'iridescence', 0, 1, 0.01, 'iridescence');
  R(look, c, 'edgeGlow', 0, 15, 0.05, 'leading edge glow');
  R(look, c, 'edgeWidth', 0.02, 3, 0.01, 'leading edge width (m)');
  R(look, c, 'sideFeather', 0.01, 1, 0.01, 'side feather');
  R(look, c, 'sheetOpacity', 0, 2, 0.01, 'opacity');
  R(look, c, 'softFade', 0.01, 2, 0.01, 'soft fade (m)');
  R(look, c, 'shredEdge', 0.005, 0.3, 0.005, 'tear edge');
  look.addColor(c, 'colorStrand').name('strands');
  look.addColor(c, 'colorMembrane').name('membrane');
  look.addColor(c, 'colorAntinode').name('antinodes');
  look.addColor(c, 'colorEdge').name('leading edge');
  const lens = look.addFolder('Lens (distortion)');
  R(lens, c, 'lensWarp', 0, 3, 0.01, 'strength');
  R(lens, c, 'lensWidth', 0.5, 3, 0.01, 'width (× sheet)');

  const front = folder.addFolder('3 · Wavefront & scream');
  R(front, c, 'frontSize', 0.1, 5, 0.05, 'radius (m)');
  R(front, c, 'frontBands', 1, 12, 0.1, 'arcs');
  R(front, c, 'frontBandWidth', 0.01, 0.5, 0.005, 'arc width');
  R(front, c, 'frontGlow', 0, 10, 0.05, 'glow');
  R(front, c, 'frontFill', 0, 1, 0.01, 'pressed-air fill (dark)');
  R(front, c, 'frontSplit', 0, 4, 0.01, 'chromatic split');
  R(front, c, 'frontSpeed', 0, 12, 0.05, 'arcs / s');
  R(front, c, 'screamSize', 1, 12, 0.05, 'scream bloom (×)');
  R(front, c, 'screamTime', 0.03, 2, 0.01, 'scream over (s)');
  R(front, c, 'screamAmp', 0, 5, 0.05, 'scream amplitude (×)');
  R(front, c, 'holdTime', 0, 4, 0.01, 'rings on for (s)');
  R(front, c, 'ringDown', 0, 2, 0.01, 'ring-down strength');
  R(front, c, 'ringDecay', 0, 8, 0.05, 'ring-down decay');
  R(front, c, 'tremolo', 0, 10, 0.05, 'tremolo (Hz)');
  R(front, c, 'lifetime', 0.05, 4, 0.05, 'shreds over (s)');

  const floor = folder.addFolder('4 · Chladni floor');
  R(floor, c, 'groundWidth', 0.2, 8, 0.05, 'width (m)');
  R(floor, c, 'groundModes', 1, 8, 0.1, 'nodal modes');
  R(floor, c, 'groundLineWidth', 0.01, 1, 0.005, 'line width');
  R(floor, c, 'groundGlow', 0, 6, 0.05, 'line glow');
  R(floor, c, 'groundScour', 0, 1, 0.01, 'scour darkening');
  R(floor, c, 'groundFill', 0, 1, 0.01, 'filled lobes');
  R(floor, c, 'groundMorph', 0, 4, 0.01, 'pattern crawl (Hz)');
  floor.addColor(c, 'colorSandBody').name('piled dust');
  floor.addColor(c, 'colorGroundLine').name('ridge glow');
  R(floor, c, 'groundFade', 0.05, 3, 0.05, 'erodes over (s)');
  floor.addColor(c, 'colorSand').name('sorted dust');
  floor.addColor(c, 'colorScour').name('scoured floor');

  const parts = folder.addFolder('5 · Particles');
  R(parts, c, 'streakRate', 0, 600, 1, 'wind lines / s');
  R(parts, c, 'streakSize', 0.005, 0.3, 0.005, 'line size');
  R(parts, c, 'streakSpeed', 0, 2, 0.01, 'line speed (× cast)');
  R(parts, c, 'streakLife', 0.05, 2, 0.01, 'line lifetime');
  R(parts, c, 'streakStretch', 0, 4, 0.01, 'line stretch');
  Editor.gradient(parts, c, 'colorStreak', 'wind line colour');
  R(parts, c, 'ringRate', 0, 30, 0.1, 'node rings / s');
  R(parts, c, 'ringSize', 0.05, 3, 0.01, 'ring size');
  R(parts, c, 'ringLife', 0.05, 3, 0.01, 'ring lifetime');
  R(parts, c, 'ringGlow', 0, 8, 0.05, 'ring glow');
  Editor.gradient(parts, c, 'colorRing', 'ring colour');
  R(parts, c, 'dustRate', 0, 300, 1, 'dust / s');
  R(parts, c, 'dustSize', 0.05, 3, 0.05, 'dust size');
  R(parts, c, 'dustSpeed', 0, 10, 0.05, 'dust speed');
  R(parts, c, 'dustLife', 0.1, 4, 0.05, 'dust lifetime');
  R(parts, c, 'dustOpacity', 0, 1, 0.01, 'dust opacity');
  Editor.gradient(parts, c, 'colorDust', 'dust colour');

  const beat = folder.addFolder('6 · The scream');
  R(beat, c, 'travelRumble', 0, 0.5, 0.005, 'hum');
  R(beat, c, 'impactShake', 0, 2, 0.01, 'knock');
  R(beat, c, 'impactFlash', 0, 1, 0.01, 'flash');
  beat.addColor(c, 'colorFlash').name('flash');
  R(beat, c, 'burstRadius', 0, 10, 0.05, 'air shell (m)');
  R(beat, c, 'burstLife', 0.05, 3, 0.01, 'shell life');
  R(beat, c, 'burstIntensity', 0, 4, 0.01, 'shell brightness');
  R(beat, c, 'burstOpacity', 0, 1, 0.01, 'shell opacity');
  R(beat, c, 'shockIntensity', 0, 3, 0.01, 'shock ring brightness');
  beat.addColor(c, 'colorBurstA').name('shell, hot');
  beat.addColor(c, 'colorBurstB').name('shell, body');
  beat.addColor(c, 'colorBurstC').name('shell, fringe');
  R(beat, c, 'shockRadius', 0, 20, 0.05, 'shock ring (m)');
  R(beat, c, 'shockLife', 0.05, 3, 0.01, 'shock life');
  beat.addColor(c, 'colorShockA').name('shock ring');
  beat.addColor(c, 'colorShockB').name('shock ring, hot');

  const hit = folder.addFolder('7 · Bodies');
  R(hit, c, 'hitRadius', 0.1, 4, 0.01, 'cut reach (m)');
  R(hit, c, 'hitImpulse', 0, 15, 0.1, 'cut impulse');
  R(hit, c, 'hitLift', 0, 15, 0.1, 'cut lift');
  R(hit, c, 'hitSpin', 0, 6, 0.05, 'spin');
  R(hit, c, 'blastRadius', 0, 8, 0.05, 'scream reach (m)');
  R(hit, c, 'blastImpulse', 0, 20, 0.1, 'scream impulse');
  R(hit, c, 'blastLift', 0, 20, 0.1, 'scream lift');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightFlicker', 0, 1, 0.01, 'warble');
  R(light, c, 'impactLight', 0, 60, 0.5, 'light punch');
}
