import { Mesh, Quaternion, Vector3 } from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createChakramGeometry,
  createChakramPlaneGeometry,
  ChakramTrailRibbon,
  MAX_PATH
} from '../../assets/atlas/VectorChakramGeometry.js';
import {
  createChakramDiscMaterial,
  createChakramSmearMaterial,
  createChakramTrailMaterial,
  createChakramPathMaterial,
  createChakramSigilMaterial,
  createChakramWarpMaterial
} from '../../materials/atlas/VectorChakramMaterials.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing } from '../../utils/math.js';

export const ID = 'chakram';

/** Ricochets per throw. The editor's `bankCount` slider clamps to this. */
const MAX_BANKS = 3;
/** Floor marks: one per bank plus a few for bodies cut in passing. */
const MAX_SIGILS = 6;
/** Shutter used to size the smear, seconds — how much travel one frame blurs. */
const SHUTTER = 0.035;
const TAU = Math.PI * 2;

/** Where the disc is in its throw. */
const Flight = Object.freeze({
  /** Spinning up in the hand. */
  WINDUP: 0,
  /** On a straight leg toward the next bank. */
  LEG: 1,
  /** Biting on a bank for `bankPause`. */
  BITE: 2,
  /** On the curved recovery arc home. */
  RETURN: 3,
  /** In the hand. */
  CAUGHT: 4
});

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _side = new Vector3();
const _local = new Vector3();
const _zig = new Vector3();
const _mid = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _up = new Vector3(0, 1, 0);
const _qSpin = new Quaternion();
const _qBank = new Quaternion();
const _qYaw = new Quaternion();
const _qInv = new Quaternion();

/**
 * CHAKRAM — Vector Chakram.
 *
 * A thrown blade with a plan. It spins up in the hand for `windupTime`, then
 * flies a **zig-zag of straight legs** through up to `bankCount` bank points.
 * Each bank is chosen the moment the disc leaves the previous one: the live
 * body nearest the disc that is still *ahead* of it (within `seekRange`,
 * weighted toward the aimed line), or — with nobody there — a fallback point
 * on an alternating zig-zag either side of the line. On every bank the disc
 * **bites** for `bankPause`, the body is cut down (sliced, `slice` of the
 * time), a vector sigil burns into the floor pointing the way it deflected,
 * sparks and metal chips spray off and the blade flares. After the last bank
 * it turns for home on a **separate curved recovery arc** — a quadratic bow
 * swung to the far side of the outbound zig and lifted off the floor — and is
 * **caught** at the caster's hand in a small flash, where it keeps spinning
 * down for `catchHold` before it is stowed.
 *
 * The blade is sized for play distance: `discRadius` 0.8 m to the tooth roots
 * (≈ 2.2 m across the tips), so six hooked teeth read at the 8 m camera and
 * 18 m down the line. The smear is kept thin so the lit metal shows.
 *
 * ## Layers
 *
 *   1. **DISC** (`createChakramGeometry` + `createChakramDiscMaterial`) — a
 *      procedural toothed ring with hooked sawtooth teeth and a bevelled knife
 *      edge; brushed metal lit by the stage sun and the sky probe, a burning
 *      cutting edge, energy packets in a groove round the hub, white-hot tooth
 *      tips, and a flare on every bank. On LAYER.WORLD: it casts a shadow.
 *   2. **SMEAR + TRAIL** — a coplanar additive quad that ghosts the blade
 *      back along its velocity and streaks it round (motion blur for a disc
 *      turning faster than the frame rate), and a camera-facing ribbon of the
 *      disc's recent path whose width is set by *age*, so a bank leaves a
 *      knot in it.
 *   3. **BANK SIGILS** (`createChakramSigilMaterial`) — a chevron-and-ring
 *      glyph aimed along the deflection, burning in white and cooling to
 *      gold, dissolving out; plus a SCORCH decal and a SHOCKWAVE ring.
 *   3b. **FLOOR PATH** (`createChakramPathMaterial`) — the whole route scored
 *      into the floor: a second ribbon sampled every `pathStep` metres,
 *      flattened onto the ground — char bed, hot cut cooling to gold, tooth
 *      nicks — so the zig-zag legs, the bank knots and the return bow stay
 *      readable after the disc has passed, and erode out over `pathLife`.
 *   4. **SPARKS, CHIPS, MOTES** — STREAK sparks thrown along the deflection,
 *      lit CHIP fragments knocked off the bank, SOFT motes shed in flight.
 *   5. **IMPACT + CATCH** — an AIR shell per bank and at the hand, flash,
 *      shake and light punch on each beat.
 *   6. **WAKE WARP** (LAYER.DISTORTION) — a spun distortion round the blade
 *      that follows its speed.
 *
 * ## Decisions
 *
 * `handlesOwnHits` is true: the disc does not travel the aimed line, so the
 * default capsule would kill the wrong bodies. It kills what it banks on and
 * anything within `hitRadius` of the blade on the way.
 *
 * The front is not the base class's: `advance` is overridden so the throw runs
 * on its own clock and reports "the end" on the frame of the catch. The
 * impact phase is the catch flash (`lifetime`) and the fade lets the trail and
 * the floor marks finish.
 *
 * A throw records only what was decided — the bank points, which body each
 * one was, the ages — and resolves speeds, sizes and colours from
 * `settings.chakram` every frame.
 */
export class VectorChakramAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 1: the disc ---- */
    this._shapeKey = '';
    this.discMaterial = createChakramDiscMaterial();
    this.disc = new Mesh(this._buildDisc(), this.discMaterial);
    this.disc.name = 'ChakramDisc';
    this.disc.layers.set(LAYER.WORLD);
    this.disc.castShadow = true;
    this.disc.visible = false;
    this.group.add(this.disc);

    /* ---- layer 2: smear + trail ---- */
    this.planeGeometry = createChakramPlaneGeometry();
    this.smearMaterial = createChakramSmearMaterial();
    this.smear = new Mesh(this.planeGeometry, this.smearMaterial);
    this.smear.name = 'ChakramSmear';
    this.smear.layers.set(LAYER.VFX);
    this.smear.renderOrder = 15;
    this.smear.frustumCulled = false;
    this.smear.visible = false;
    this.group.add(this.smear);

    this.trail = new ChakramTrailRibbon();
    this.trailMaterial = createChakramTrailMaterial();
    this.trailMesh = new Mesh(this.trail.geometry, this.trailMaterial);
    this.trailMesh.name = 'ChakramTrail';
    this.trailMesh.layers.set(LAYER.VFX);
    this.trailMesh.renderOrder = 13;
    this.trailMesh.frustumCulled = false;
    this.trailMesh.visible = false;
    this.group.add(this.trailMesh);

    /* ---- layer 3b: the floor path ---- */
    this.path = new ChakramTrailRibbon(MAX_PATH, false);
    this.pathMaterial = createChakramPathMaterial();
    this.pathMesh = new Mesh(this.path.geometry, this.pathMaterial);
    this.pathMesh.name = 'ChakramPath';
    this.pathMesh.layers.set(LAYER.VFX);
    this.pathMesh.renderOrder = 2;
    this.pathMesh.frustumCulled = false;
    this.pathMesh.visible = false;
    this.group.add(this.pathMesh);
    this._pathLast = new Vector3();
    this._pathState = { fade: 1 };

    /* ---- layer 3: bank sigils ---- */
    this.sigils = [];
    for (let i = 0; i < MAX_SIGILS; i++) {
      const material = createChakramSigilMaterial();
      const mesh = new Mesh(this.planeGeometry, material);
      mesh.name = `ChakramSigil${i}`;
      mesh.layers.set(LAYER.VFX);
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
      this.sigils.push({
        mesh,
        material,
        active: false,
        birth: 0,
        /** A bank mark is bigger and lives the full `sigilLife`. */
        bank: false,
        state: { burn: 0, heat: 1, life: 0, cutAngle: 0, seed: 0 }
      });
    }
    this._sigilCursor = 0;

    /* ---- layer 6: wake warp ---- */
    this.warpMaterial = createChakramWarpMaterial();
    this.warp = new Mesh(this.planeGeometry.clone().rotateX(Math.PI / 2), this.warpMaterial);
    this.warp.name = 'ChakramWarp';
    this.warp.layers.set(LAYER.DISTORTION);
    this.warp.frustumCulled = false;
    this.warp.visible = false;
    this.group.add(this.warp);

    /* ---- per-throw state, preallocated ---- */
    this._banks = [];
    for (let i = 0; i < MAX_BANKS; i++) this._banks.push({ point: new Vector3(), dummy: null, age: 0 });
    this._legFrom = new Vector3();
    this._legTo = new Vector3();
    this._arcFrom = new Vector3();
    this._arcCtrl = new Vector3();
    this._hand = new Vector3();
    this._prev = new Vector3();
    this._velocity = new Vector3();
    this._targets = [];
    this._struck = [];

    this._discState = { flare: 0, charge: 0 };
    this._smearState = { dirX: 1, dirY: 0, stretch: 0, scale: 1, spin: 0, amount: 0 };
    this._trailState = { fade: 1 };
    this._warpState = { strength: 0 };

    this._flight = Flight.CAUGHT;
    this._reported = false;
    this._bankIndex = 0;
    this._banksDone = 0;
    this._legDist = 0;
    this._legLen = 1;
    this._timer = 0;
    this._spin = 0;
    this._flare = 0;
    this._zigSign = 1;
    this._catchAge = 0;
    this._lastBankAge = 0;
    this._seed = 0;
  }

  _buildDisc() {
    const c = settings.chakram;
    return createChakramGeometry({
      teeth: c.teeth,
      inner: c.innerRadius,
      toothDepth: c.toothDepth,
      toothSharp: c.toothSharp,
      thickness: c.thickness,
      blade: c.bladeBevel
    });
  }

  /** Rebuild the blade only when a *shape* control moves. */
  _syncGeometry() {
    const c = settings.chakram;
    const key = `${Math.round(c.teeth)}|${c.innerRadius.toFixed(3)}|${c.toothDepth.toFixed(3)}|${c.toothSharp.toFixed(2)}|${c.thickness.toFixed(3)}|${c.bladeBevel.toFixed(3)}`;
    if (key === this._shapeKey) return;
    this._shapeKey = key;
    const previous = this.disc.geometry;
    this.disc.geometry = this._buildDisc();
    previous.dispose();
  }

  createParticles() {
    const particles = this.ctx.particles;

    this.sparks = particles.get('chakram.sparks', {
      capacity: 2400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparks.uniforms.uEndSize.value = 0.25;
    this.sparks.uniforms.uSizeIn.value = 0.01;
    this.sparks.uniforms.uFadeIn.value = 0.01;
    this.sparks.uniforms.uFadeOut.value = 0.55;

    this.chips = particles.get('chakram.chips', {
      capacity: 600,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.1
    });
    this.chips.uniforms.uDrag.value = 0.6;
    this.chips.uniforms.uEndSize.value = 0.8;
    this.chips.uniforms.uSizeIn.value = 0.02;
    this.chips.uniforms.uFadeIn.value = 0.02;
    this.chips.uniforms.uFadeOut.value = 0.3;
    this.chips.uniforms.uTurbulence.value = 0;

    this.motes = particles.get('chakram.motes', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      softFade: 0.3
    });
    this.motes.uniforms.uDrag.value = 2.2;
    this.motes.uniforms.uEndSize.value = 0.2;
    this.motes.uniforms.uSizeIn.value = 0.05;
    this.motes.uniforms.uFadeIn.value = 0.05;
    this.motes.uniforms.uFadeOut.value = 0.6;
    this.motes.uniforms.uTurbulence.value = 0.3;

    this.moteEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get handlesOwnHits() {
    return true;
  }

  /** Banks struck so far. HUD readout only. */
  get instanceCount() {
    return this._banksDone;
  }

  /** The catch flash. */
  get impactDuration() {
    return Math.max(0.05, settings.chakram.lifetime * settings.global.lifetime);
  }

  /** Long enough for the trail to die, the disc to stow and the floor marks to go out. */
  get fadeDuration() {
    const c = settings.chakram;
    const L = settings.global.lifetime;
    const marks = this._lastBankAge + c.sigilLife * L - this._catchAge - this.impactDuration;
    const path = c.pathLife * L - this.impactDuration;
    const hold = c.catchHold - this.impactDuration;
    return Math.max(0.05, c.fadeTime, marks, path, hold);
  }

  /** The throw runs on its own clock; report the end the frame it is caught. */
  advance() {
    if (this._flight === Flight.CAUGHT && !this._reported) {
      this._reported = true;
      this.u = 1;
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this._flight = Flight.WINDUP;
    this._reported = false;
    this._bankIndex = 0;
    this._banksDone = 0;
    this._legDist = 0;
    this._legLen = 1;
    this._timer = 0;
    this._spin = Math.random() * TAU;
    this._flare = 0;
    // The first zig swings to whichever side has a body, else at random.
    this._zigSign = Math.random() < 0.5 ? -1 : 1;
    this._catchAge = 0;
    this._lastBankAge = 0;
    this._seed = Math.random() * 100;
    this._struck.length = 0;
    this._targets.length = 0;
    this._sigilCursor = 0;
    this.moteEmitter.reset();
    for (const bank of this._banks) bank.dummy = null;
    for (const sigil of this.sigils) {
      sigil.active = false;
      sigil.mesh.visible = false;
    }

    this._handPoint(this._hand);
    this.position.copy(this._hand);
    this._prev.copy(this._hand);
    this._velocity.set(0, 0, 0);
    this.trail.clear();
    this.path.clear();
    this._pathLast.copy(this._hand);

    this.disc.visible = true;
    this.pathMesh.visible = true;
    this.smear.visible = true;
    this.trailMesh.visible = true;
    this.warp.visible = true;

    this._syncGeometry();
    this._place(0);
  }

  /** Where the disc leaves from and is caught — follows the caster. */
  _handPoint(out) {
    const c = settings.chakram;
    const body = this.ctx.character?.position ?? this.origin;
    out.set(body.x, 0, body.z).addScaledVector(this.direction, c.handForward).addScaledVector(this.side, c.handSide);
    out.y = c.handHeight;
    return out;
  }

  /** Is this body already cut by this throw. */
  _isStruck(dummy) {
    for (let i = 0; i < this._struck.length; i++) if (this._struck[i] === dummy) return true;
    return false;
  }

  /**
   * Choose bank `i` from `from`: the best live body ahead, else the zig point.
   * Writes `bank.point` and `bank.dummy`.
   */
  _planBank(i, from) {
    const c = settings.chakram;
    const bank = this._banks[i];
    const count = this._bankCount();

    // The fallback: alternating either side of the line, marching out.
    const span = (1 - c.zigStart) / Math.max(1, count - 1 || 1);
    const s = count === 1 ? Math.max(c.zigStart, 0.75) : c.zigStart + span * i;
    this.pointAt(Math.min(1, s), _zig).addScaledVector(this.side, c.zigWidth * this._zigSign);
    _zig.y = c.flightHeight;

    // Search between where it is and where the zig would take it.
    _mid.addVectors(from, _zig).multiplyScalar(0.5);
    const radius = c.seekRange + 0.5 * Math.hypot(_zig.x - from.x, _zig.z - from.z);
    const fromAlong = (from.x - this.origin.x) * this.direction.x + (from.z - this.origin.z) * this.direction.z;

    let best = null;
    let bestScore = Infinity;
    const found = this.ctx.dummies?.findTargets?.(_mid.x, _mid.z, radius, this._targets);
    if (found) {
      for (const dummy of found) {
        if (this._isStruck(dummy) || this._isPlanned(dummy, i)) continue;
        const dx = dummy.position.x - this.origin.x;
        const dz = dummy.position.z - this.origin.z;
        const along = dx * this.direction.x + dz * this.direction.z;
        if (along < fromAlong - c.seekAhead || along > this.length + c.seekRange * 0.5) continue;
        const lateral = Math.abs(dx * this.side.x + dz * this.side.z);
        const reach = Math.hypot(dummy.position.x - from.x, dummy.position.z - from.z);
        if (reach > c.seekRange * 2) continue;
        const score = reach + lateral * 0.6;
        if (score < bestScore) {
          bestScore = score;
          best = dummy;
        }
      }
    }

    if (best) {
      bank.dummy = best;
      bank.point.set(best.position.x, settings.dummies.height * c.bankHeight, best.position.z);
      // The next fallback swings to the other side of wherever this body was.
      const lateral = (best.position.x - this.origin.x) * this.side.x + (best.position.z - this.origin.z) * this.side.z;
      this._zigSign = lateral >= 0 ? -1 : 1;
    } else {
      bank.dummy = null;
      bank.point.copy(_zig);
      this._zigSign = -this._zigSign;
    }
  }

  _isPlanned(dummy, upTo) {
    for (let i = 0; i < upTo; i++) if (this._banks[i].dummy === dummy) return true;
    return false;
  }

  _bankCount() {
    return Math.max(1, Math.min(MAX_BANKS, Math.round(settings.chakram.bankCount)));
  }

  _startLeg(from) {
    this._planBank(this._bankIndex, from);
    this._legFrom.copy(from);
    this._legTo.copy(this._banks[this._bankIndex].point);
    this._legLen = Math.max(0.05, this._legFrom.distanceTo(this._legTo));
    this._legDist = 0;
    this._flight = Flight.LEG;
  }

  /** The recovery arc: a quadratic bow off the far side, lifted. */
  _startReturn(from) {
    const c = settings.chakram;
    this._arcFrom.copy(from);
    this._handPoint(this._hand);
    _a.subVectors(this._hand, from);
    const chord = Math.max(0.1, _a.length());
    _side.crossVectors(_a, _up).normalize();
    // Swing to the side the outbound path did *not* finish on, so the arc
    // reads as a separate route rather than a retrace.
    const lateral = (from.x - this.origin.x) * this.side.x + (from.z - this.origin.z) * this.side.z;
    const away = lateral >= 0 ? 1 : -1;
    const sign = Math.sign(_side.dot(this.side)) * away || 1;
    this._arcCtrl.addVectors(from, this._hand).multiplyScalar(0.5);
    this._arcCtrl.addScaledVector(_side, c.returnBow * chord * sign);
    this._arcCtrl.y += c.returnLift * 2;
    this._legLen = chord * (1 + 0.6 * c.returnBow);
    this._legDist = 0;
    this._flight = Flight.RETURN;
  }

  /** Quadratic Bézier, with the hand end live. */
  _arcAt(t, out) {
    this._handPoint(this._hand);
    const u = 1 - t;
    return out
      .copy(this._arcFrom)
      .multiplyScalar(u * u)
      .addScaledVector(this._arcCtrl, 2 * u * t)
      .addScaledVector(this._hand, t * t);
  }

  /* ------------------------------------------------------------------ */
  /* Beats                                                               */
  /* ------------------------------------------------------------------ */

  /** The disc reaches bank `i`. */
  _bank(i) {
    const c = settings.chakram;
    const g = settings.global;
    const bank = this._banks[i];
    bank.age = this.age;
    this._lastBankAge = this.age;
    this._banksDone++;
    this._flare = 1;

    // Incoming direction, flat.
    _dir.subVectors(this._legTo, this._legFrom).setY(0);
    if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
    _dir.normalize();

    if (bank.dummy && bank.dummy.alive && settings.dummies.hit.enabled) {
      this._struck.push(bank.dummy);
      bank.dummy.kill(_dir.x, _dir.z, c.hit, Math.random() < c.slice);
    }

    // Peek the way out, for the sigil and the spray: plan the next bank now.
    const last = i + 1 >= this._bankCount();
    if (last) {
      this._handPoint(_b);
      _a.subVectors(_b, bank.point).setY(0);
    } else {
      // Reflect the incoming about the line toward the next zig, cheaply: the
      // next leg is planned on leaving, so aim the mark at its fallback side.
      _a.copy(this.direction).addScaledVector(this.side, this._zigSign * 0.9).setY(0);
    }
    if (_a.lengthSq() < 1e-6) _a.copy(this.direction);
    _a.normalize();

    this._mark(bank.point, _a, _dir, true);
    this._sprayAt(bank.point, _a, 1);

    this.ctx.bursts.spawn(BurstMode.AIR, bank.point, {
      radius: c.bankBurst * 0.15,
      endRadius: c.bankBurst * g.explosionIntensity,
      life: c.bankBurstLife,
      intensity: 2.2,
      opacity: c.bankBurstOpacity * g.opacity,
      fresnel: 2.4,
      displace: 0.2,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    _pos.set(bank.point.x, 0, bank.point.z);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.shockRadius * g.explosionIntensity,
      life: 0.45,
      width: 0.05,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals.spawn(DecalType.SCORCH, _pos, {
      radius: c.scorchRadius,
      life: c.scorchLife,
      intensity: 1,
      colorA: getColor(c.colorSigilChar),
      colorB: getColor(c.colorSigil)
    });

    this.lightBoost = Math.max(this.lightBoost, c.bankLight * g.explosionIntensity);
    this.ctx.shake.add(c.bankShake * g.explosionIntensity, 6, 30);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.bankFlash * g.explosionIntensity);
  }

  /** A body cut in passing, between banks. */
  _passHit(dummy) {
    const c = settings.chakram;
    _dir.copy(this._velocity).setY(0);
    if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
    _dir.normalize();
    this._struck.push(dummy);
    dummy.kill(_dir.x, _dir.z, c.hit, Math.random() < c.slice);
    _pos.set(dummy.position.x, settings.dummies.height * c.bankHeight, dummy.position.z);
    this._mark(_pos, _dir, _dir, false);
    this._sprayAt(_pos, _dir, 0.5);
    this._flare = Math.max(this._flare, 0.6);
    this.lightBoost = Math.max(this.lightBoost, c.bankLight * 0.5);
    this.ctx.shake.add(c.bankShake * 0.5 * settings.global.explosionIntensity, 6, 30);
  }

  /** Burn a vector sigil at `point`, +X along `out`, the cut along `incoming`. */
  _mark(point, out, incoming, bank) {
    const c = settings.chakram;
    const sigil = this.sigils[this._sigilCursor];
    this._sigilCursor = (this._sigilCursor + 1) % MAX_SIGILS;
    sigil.active = true;
    sigil.bank = bank;
    sigil.birth = this.age;
    sigil.mesh.visible = true;
    sigil.mesh.position.set(point.x, 0.035, point.z);
    const theta = Math.atan2(-out.z, out.x);
    sigil.mesh.rotation.set(0, theta, 0);
    // The incoming line in the quad's own frame.
    const cs = Math.cos(theta);
    const sn = Math.sin(theta);
    const lx = incoming.x * cs - incoming.z * sn;
    const lz = incoming.x * sn + incoming.z * cs;
    sigil.state.cutAngle = Math.atan2(lz, lx);
    sigil.state.seed = Math.random() * 10;
    const size = c.sigilSize * (bank ? 1 : 0.6);
    sigil.mesh.scale.set(size, 1, size);
  }

  /** Sparks along the deflection, chips knocked off the bank. */
  _sprayAt(point, out, strength) {
    const c = settings.chakram;
    const g = settings.global;
    const time = frame.uTime.value;

    _emit.position = point;
    _emit.radius = 0.15;
    _emit.direction = _b.copy(out).setY(0.35).normalize();
    _emit.speed = c.sparkSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.8;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.05;
    _emit.sizeVariance = 0.6;
    _emit.life = c.sparkLife;
    _emit.lifeVariance = 0.5;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
    this.sparks.emit(Math.round(c.sparkCount * strength * g.particleCount), _emit);
    // A second, wider fan the other way: the bite throws both sides.
    _emit.direction = _b.copy(out).negate().setY(0.8).normalize();
    _emit.spread = 1.2;
    _emit.speed = c.sparkSpeed * 0.6;
    this.sparks.emit(Math.round(c.sparkCount * 0.4 * strength * g.particleCount), _emit);

    _emit.direction = _up;
    _emit.speed = c.shardSpeed;
    _emit.spread = 1.0;
    _emit.size = c.shardSize;
    _emit.sizeVariance = 0.5;
    _emit.life = c.shardLife;
    _emit.spin = 8;
    this.chips.emit(Math.round(c.shardCount * strength * g.particleCount), _emit);
  }

  _catch() {
    const c = settings.chakram;
    const g = settings.global;
    this._flight = Flight.CAUGHT;
    this._catchAge = this.age;
    this._handPoint(this._hand);
    this.position.copy(this._hand);

    this.ctx.bursts.spawn(BurstMode.AIR, this._hand, {
      radius: c.catchBurst * 0.2,
      endRadius: c.catchBurst * g.explosionIntensity,
      life: 0.18,
      intensity: 2.4,
      opacity: 0.55,
      fresnel: 2.4,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    _emit.position = this._hand;
    _emit.radius = 0.1;
    _emit.direction = _b.copy(this._velocity).normalize().negate();
    _emit.speed = c.sparkSpeed * 0.5;
    _emit.speedVariance = 0.6;
    _emit.spread = 1.3;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.05;
    _emit.sizeVariance = 0.6;
    _emit.life = c.sparkLife * 0.7;
    _emit.lifeVariance = 0.5;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.sparks.emit(Math.round(c.catchSparks * g.particleCount), _emit);

    this.lightBoost = Math.max(this.lightBoost, c.catchLight * g.explosionIntensity);
    this.ctx.shake.add(c.catchShake * g.explosionIntensity, 8, 30);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.catchFlash * g.explosionIntensity);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  /** Step the flight. */
  _fly(dt) {
    const c = settings.chakram;
    const g = settings.global;
    this._prev.copy(this.position);

    switch (this._flight) {
      case Flight.WINDUP: {
        this._timer += dt;
        this._handPoint(this.position);
        if (this._timer >= Math.max(0, c.windupTime)) {
          this.ctx.shake.add(c.throwShake * g.cameraShake, 6, 30);
          this._startLeg(this.position);
        }
        break;
      }
      case Flight.LEG: {
        this._legDist += c.speed * g.speed * dt;
        const t = saturate(this._legDist / this._legLen);
        this.position.lerpVectors(this._legFrom, this._legTo, t);
        if (t >= 1) {
          this._bank(this._bankIndex);
          this._flight = Flight.BITE;
          this._timer = 0;
        }
        break;
      }
      case Flight.BITE: {
        this._timer += dt;
        if (this._timer >= Math.max(0, c.bankPause)) {
          const from = this._banks[this._bankIndex].point;
          this._bankIndex++;
          if (this._bankIndex >= this._bankCount()) this._startReturn(from);
          else this._startLeg(from);
        }
        break;
      }
      case Flight.RETURN: {
        this._legDist += c.returnSpeed * g.speed * dt;
        const t = saturate(this._legDist / this._legLen);
        // Ease out of the bank and into the hand: it is being reeled in.
        this._arcAt(Easing.inOutQuad(t) * 0.25 + t * 0.75, this.position);
        if (t >= 1) this._catch();
        break;
      }
      default:
        this._handPoint(this.position);
        break;
    }

    if (dt > 0) this._velocity.subVectors(this.position, this._prev).divideScalar(dt);
  }

  /** Bodies within `hitRadius` of the blade in flight. */
  _cutThrough() {
    if (this._flight !== Flight.LEG && this._flight !== Flight.RETURN) return;
    if (!settings.dummies.hit.enabled) return;
    const found = this.ctx.dummies?.findTargets?.(this.position.x, this.position.z, settings.chakram.hitRadius, this._targets);
    if (!found) return;
    for (let i = 0; i < found.length; i++) {
      const dummy = found[i];
      if (this._isStruck(dummy)) continue;
      // The body this leg is aimed at gets the full bank instead.
      if (this._flight === Flight.LEG && this._banks[this._bankIndex].dummy === dummy) continue;
      this._passHit(dummy);
    }
  }

  _place(dt) {
    const c = settings.chakram;
    const g = settings.global;
    const caught = this._flight === Flight.CAUGHT;
    const windup = this._flight === Flight.WINDUP;
    const speed = this._velocity.length();

    /* --- spin: winds up in the hand --- */
    const spinUp = windup ? Easing.inQuad(saturate(this._timer / Math.max(0.01, c.windupTime))) : 1;
    // Caught: it keeps turning in the hand, spinning down over `catchHold`.
    const held = caught ? saturate((this.age - this._catchAge) / Math.max(0.02, c.catchHold)) : 0;
    this._spin += c.spinRate * TAU * spinUp * (1 - held) * (1 - held) * g.animationSpeed * dt;
    this._flare = Math.max(0, this._flare - this._flare * 7 * dt - 0.4 * dt);

    /* --- orientation: flat, banked into the leg, wobbling home --- */
    _vel.copy(this._velocity).setY(0);
    if (_vel.lengthSq() < 1e-4) _vel.copy(this.direction);
    _vel.normalize();
    _qYaw.setFromAxisAngle(_up, Math.atan2(-_vel.z, _vel.x));
    let bankAngle = c.tilt * (this._zigSign >= 0 ? 1 : -1);
    if (this._flight === Flight.RETURN) bankAngle += Math.sin(this.age * 9 + this._seed) * c.wobble;
    if (caught) bankAngle = lerp(bankAngle, c.tilt * 2.2, held);
    if (windup) bankAngle = lerp(1.2, bankAngle, spinUp); // held edge-on, then laid over
    _qBank.setFromAxisAngle(_a.set(1, 0, 0), bankAngle);
    _qSpin.setFromAxisAngle(_up, -this._spin);
    // world = yaw · bank · spin: spin in the blade's plane, bank about the
    // velocity, then turn to face the way it is going.
    this.disc.quaternion.copy(_qYaw).multiply(_qBank).multiply(_qSpin);
    this.disc.position.copy(this.position);
    const grow = windup ? lerp(0.55, 1, spinUp) : 1;
    const catchShrink = caught ? 1 - Easing.inQuad(saturate((held - 0.6) / 0.4)) : 1;
    const r = c.discRadius * grow * catchShrink;
    this.disc.scale.setScalar(Math.max(1e-3, r));
    this.disc.visible = catchShrink > 0.001;

    const ds = this._discState;
    ds.flare = this._flare;
    ds.charge = windup ? spinUp : 1;
    this.discMaterial.userData.sync(ds);

    /* --- smear, in the blade's plane, ghosted back along the velocity --- */
    this.smear.position.copy(this.position);
    this.smear.quaternion.copy(_qYaw).multiply(_qBank);
    _qInv.copy(this.smear.quaternion).invert();
    _local.copy(this._velocity).applyQuaternion(_qInv);
    const flat = Math.hypot(_local.x, _local.z);
    const stretch = Math.min(1.6, (speed * SHUTTER) / Math.max(0.05, c.discRadius));
    const half = c.smearScale * (1 + c.toothDepth + stretch);
    this.smear.scale.setScalar(Math.max(1e-3, r * half));
    const ss = this._smearState;
    ss.dirX = flat > 1e-4 ? _local.x / flat : 1;
    // The shader's quad space is the plane's own (x, z).
    ss.dirY = flat > 1e-4 ? _local.z / flat : 0;
    ss.stretch = stretch;
    ss.scale = half;
    ss.spin = this._spin;
    ss.amount = (0.35 + 0.65 * saturate(speed / 20)) * spinUp * catchShrink * (1 - held);
    this.smearMaterial.userData.sync(ss);
    this.smear.visible = ss.amount > 0.003;

    /* --- trail --- */
    if (!windup && !caught) this.trail.push(this.position, this.age);
    const fadeT = this.phase === AbilityPhase.FADE ? saturate(this.fadeTime / Math.max(0.05, c.fadeTime)) : 0;
    this.trail.build(this.position, this.age, c.trailLife * g.lifetime);
    this._trailState.fade = 1 - fadeT;
    this.trailMaterial.userData.sync(this._trailState);
    this.trailMesh.visible = this._trailState.fade > 0.001;

    /* --- floor path: a sample every pathStep metres of flight --- */
    if (!windup && !caught) {
      const step = Math.max(0.05, c.pathStep);
      if (this.path.count === 0 || this._pathLast.distanceToSquared(this.position) >= step * step) {
        this.path.push(this.position, this.age);
        this._pathLast.copy(this.position);
      }
    }
    this.path.build(this.position, this.age, c.pathLife * g.lifetime);
    this._pathState.fade = 1;
    this.pathMaterial.userData.sync(this._pathState);
    this.pathMesh.visible = this.path.count > 1;

    /* --- warp --- */
    this.warp.position.copy(this.position);
    this._warpState.strength = saturate(speed / 25) * catchShrink;
    this.warpMaterial.userData.sync(this._warpState);
    this.warp.visible = this._warpState.strength > 0.004;

    /* --- motes shed in flight --- */
    if (!windup && !caught) {
      const motes = Math.round(this.moteEmitter.tick(dt, c.moteRate) * g.particleCount);
      if (motes > 0) {
        _emit.position = this.position;
        _emit.radius = c.discRadius;
        _emit.direction = _b.copy(this._velocity).normalize().negate();
        _emit.speed = 1.2;
        _emit.speedVariance = 0.7;
        _emit.spread = 1.0;
        _emit.inherit = null;
        _emit.anchor = null;
        _emit.size = 1;
        _emit.sizeVariance = 0.5;
        _emit.life = c.moteLife;
        _emit.lifeVariance = 0.4;
        _emit.spin = 0;
        _emit.tint = null;
        _emit.time = frame.uTime.value;
        this.motes.emit(motes, _emit);
      }
    }
  }

  _updateSigils() {
    const c = settings.chakram;
    const g = settings.global;
    for (const sigil of this.sigils) {
      if (!sigil.active) continue;
      const life = Math.max(0.1, c.sigilLife * g.lifetime * (sigil.bank ? 1 : 0.7));
      const age = this.age - sigil.birth;
      const s = sigil.state;
      s.burn = Easing.outCubic(saturate(age / Math.max(0.01, c.sigilBurn))) * 1.12;
      s.heat = 1 - saturate(age / Math.max(0.01, c.sigilCool));
      s.life = saturate((age / life - 0.62) / 0.38);
      sigil.material.userData.sync(s);
      if (age >= life) {
        sigil.active = false;
        sigil.mesh.visible = false;
      }
    }
  }

  _syncParticles() {
    const c = settings.chakram;
    const g = settings.global;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    this.sparks.uniforms.uGravity.value.set(0, c.sparkGravity, 0);
    this.sparks.uniforms.uDrag.value = c.sparkDrag;
    this.sparks.uniforms.uStretch.value = c.sparkStretch;
    this.sparks.uniforms.uSizeScale.value = (c.sparkSize / 0.05) * g.particleSize;
    this.sparks.uniforms.uLifeScale.value = g.particleLifetime;
    this.sparks.uniforms.uSpeedScale.value = g.particleSpeed;
    this.sparks.uniforms.uOpacity.value = g.opacity;
    this.sparks.uniforms.uGlow.value = c.sparkGlow * g.glow;

    // Chips are the blade's own metal, so they take the metal colours.
    const metal = getColor(c.metalColor);
    const dark = getColor(c.metalDark);
    this.chips.setGradient(metal, metal, dark, dark);
    this.chips.uniforms.uGravity.value.set(0, -16, 0);
    this.chips.uniforms.uSizeScale.value = g.particleSize;
    this.chips.uniforms.uLifeScale.value = g.particleLifetime;
    this.chips.uniforms.uSpeedScale.value = g.particleSpeed;
    this.chips.uniforms.uOpacity.value = g.opacity;
    this.chips.uniforms.uGlow.value = 1;

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    this.motes.uniforms.uGravity.value.set(0, 0.4, 0);
    this.motes.uniforms.uSizeScale.value = c.moteSize * g.particleSize;
    this.motes.uniforms.uLifeScale.value = g.particleLifetime;
    this.motes.uniforms.uSpeedScale.value = g.particleSpeed;
    this.motes.uniforms.uOpacity.value = g.opacity;
    this.motes.uniforms.uGlow.value = c.moteGlow * g.glow;
  }

  _frame(dt) {
    this._syncGeometry();
    this._syncParticles();
    this._fly(dt);
    this._cutThrough();
    this._place(dt);
    this._updateSigils();
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    this._frame(dt);
  }

  /** Caught. The flash holds for the impact phase. */
  onImpact() {}

  onFade(dt) {
    this._frame(dt);
  }

  onDestroy() {
    this.disc.visible = false;
    this.smear.visible = false;
    this.trailMesh.visible = false;
    this.pathMesh.visible = false;
    this.path.clear();
    this.warp.visible = false;
    for (const sigil of this.sigils) {
      sigil.active = false;
      sigil.mesh.visible = false;
    }
    for (const bank of this._banks) bank.dummy = null;
    this._struck.length = 0;
    this._targets.length = 0;
    this.trail.clear();
    this._flight = Flight.CAUGHT;
  }

  dispose() {
    this.disc.geometry.dispose();
    this.discMaterial.dispose();
    this.planeGeometry.dispose();
    this.warp.geometry.dispose();
    this.smearMaterial.dispose();
    this.trail.dispose();
    this.trailMaterial.dispose();
    this.path.dispose();
    this.pathMaterial.dispose();
    for (const sigil of this.sigils) sigil.material.dispose();
    this.warpMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const R = Editor.range;
  const folder = gui.addFolder('\u{1F4C0}  Vector Chakram');

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 4, 60, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 80, 0.5, 'outbound speed (m/s)');
  R(cast, c, 'returnSpeed', 2, 80, 0.5, 'return speed (m/s)');
  R(cast, c, 'lifetime', 0.02, 2, 0.01, 'catch flash holds (s)');
  R(cast, c, 'fadeTime', 0.05, 4, 0.05, 'trail dies over (s)');
  R(cast, c, 'catchHold', 0.02, 2, 0.01, 'spins down in the hand (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);
  R(cast, c, 'windupTime', 0, 1, 0.01, 'spin-up in the hand (s)');
  R(cast, c, 'handForward', -1, 2, 0.01, 'hand forward (m)');
  R(cast, c, 'handSide', -1, 1, 0.01, 'hand side (m)');
  R(cast, c, 'handHeight', 0, 3, 0.01, 'hand height (m)');
  R(cast, c, 'flightHeight', 0.2, 3, 0.01, 'cruise height (m)');

  const flight = folder.addFolder('The flight');
  R(flight, c, 'bankCount', 1, MAX_BANKS, 1, 'banks');
  R(flight, c, 'seekRange', 0, 20, 0.1, 'seeks bodies within (m)');
  R(flight, c, 'seekAhead', 0, 10, 0.1, 'may turn back by (m)');
  R(flight, c, 'zigWidth', 0, 8, 0.05, 'zig-zag width (m)');
  R(flight, c, 'zigStart', 0, 0.9, 0.01, 'first zig at (× length)');
  R(flight, c, 'bankHeight', 0, 1.2, 0.01, 'bank height (× body)');
  R(flight, c, 'hitRadius', 0, 3, 0.01, 'cuts in passing within (m)');
  R(flight, c, 'returnBow', -1.5, 1.5, 0.01, 'return arc bow (× chord)');
  R(flight, c, 'returnLift', 0, 6, 0.05, 'return arc lift (m)');
  R(flight, c, 'bankPause', 0, 0.3, 0.005, 'bites for (s)');
  R(flight, c, 'slice', 0, 1, 0.01, 'slice chance');
  R(flight, c.hit, 'impulse', 0, 20, 0.1, 'throw impulse');
  R(flight, c.hit, 'lift', 0, 20, 0.1, 'throw lift');
  R(flight, c.hit, 'spin', 0, 5, 0.05, 'throw spin');

  /* ---- layer 1 ---- */
  const disc = folder.addFolder('1 · Disc');
  const shape = disc.addFolder('Blade');
  R(shape, c, 'discRadius', 0.1, 2, 0.01, 'radius (m)');
  R(shape, c, 'teeth', 3, 16, 1, 'teeth');
  R(shape, c, 'innerRadius', 0.1, 0.9, 0.01, 'hub (× radius)');
  R(shape, c, 'toothDepth', 0, 0.8, 0.01, 'tooth depth (× radius)');
  R(shape, c, 'toothSharp', 0.2, 10, 0.05, 'hook sharpness');
  R(shape, c, 'thickness', 0.01, 0.3, 0.005, 'thickness (× radius)');
  R(shape, c, 'bladeBevel', 0.05, 0.9, 0.01, 'bevel (× radius)');
  const motion = disc.addFolder('Motion');
  R(motion, c, 'spinRate', 0, 20, 0.1, 'turns/second');
  R(motion, c, 'tilt', 0, 1.2, 0.01, 'bank into the leg (rad)');
  R(motion, c, 'wobble', 0, 0.8, 0.01, 'wobble home (rad)');
  const metal = disc.addFolder('Metal + energy');
  metal.addColor(c, 'metalColor').name('metal');
  metal.addColor(c, 'metalDark').name('metal shadow');
  R(metal, c, 'roughness', 0, 1, 0.01, 'roughness');
  R(metal, c, 'envIntensity', 0, 4, 0.01, 'sky reflection');
  R(metal, c, 'brushed', 0, 1, 0.01, 'brushed streaks');
  R(metal, c, 'fresnel', 0, 4, 0.01, 'fresnel');
  R(metal, c, 'rimEnergy', 0, 12, 0.05, 'cutting edge energy');
  R(metal, c, 'rimWidth', 0.01, 0.6, 0.005, 'edge width');
  R(metal, c, 'channelEnergy', 0, 10, 0.05, 'groove energy');
  R(metal, c, 'channelSpeed', -12, 12, 0.05, 'groove speed');
  R(metal, c, 'tipHeat', 0, 10, 0.05, 'tooth tip heat');
  R(metal, c, 'hitFlare', 0, 12, 0.05, 'flare on a bank');
  metal.addColor(c, 'colorEnergy').name('energy');
  metal.addColor(c, 'colorEnergyHot').name('energy hot');

  /* ---- layer 2 ---- */
  const blur = folder.addFolder('2 · Smear + trail');
  R(blur, c, 'smearScale', 0.5, 3, 0.01, 'smear size');
  R(blur, c, 'smearStrength', 0, 4, 0.01, 'smear brightness');
  R(blur, c, 'smearStreaks', 2, 60, 1, 'smear streaks');
  R(blur, c, 'smearOpacity', 0, 1, 0.01, 'smear opacity');
  R(blur, c, 'trailLife', 0.02, 1.2, 0.01, 'trail life (s)');
  R(blur, c, 'trailWidth', 0.01, 1.5, 0.005, 'trail half-width (m)');
  R(blur, c, 'trailCore', 0, 1, 0.01, 'trail core');
  R(blur, c, 'trailIntensity', 0, 10, 0.05, 'trail intensity');
  R(blur, c, 'trailOpacity', 0, 1, 0.01, 'trail opacity');
  R(blur, c, 'trailStreaks', 0, 30, 0.5, 'speed lines');
  R(blur, c, 'trailTwist', 0, 1, 0.01, 'lie flat (blade wake)');
  blur.addColor(c, 'colorTrailHead').name('trail head');
  blur.addColor(c, 'colorTrailTail').name('trail tail');
  blur.addColor(c, 'colorTrailEdge').name('trail edge');

  /* ---- layer 3b ---- */
  const path = folder.addFolder('3b · Floor path');
  R(path, c, 'pathStep', 0.05, 2, 0.01, 'sample every (m)');
  R(path, c, 'pathLife', 0.2, 8, 0.05, 'lasts (s)');
  R(path, c, 'pathWidth', 0.02, 1.5, 0.01, 'half-width (m)');
  R(path, c, 'pathCool', 0.01, 1, 0.01, 'cools over (× life)');
  R(path, c, 'pathIntensity', 0, 8, 0.05, 'cut glow');
  R(path, c, 'pathOpacity', 0, 1, 0.01, 'opacity');
  R(path, c, 'pathNicks', 0, 8, 0.05, 'tooth nicks / m');
  R(path, c, 'pathHighFade', 0.1, 6, 0.05, 'fainter above (m)');

  /* ---- layer 3 ---- */
  const sigil = folder.addFolder('3 · Bank sigils');
  R(sigil, c, 'sigilSize', 0.1, 4, 0.01, 'half-size (m)');
  R(sigil, c, 'sigilLife', 0.1, 8, 0.05, 'lasts (s)');
  R(sigil, c, 'sigilBurn', 0.01, 1, 0.01, 'burns in over (s)');
  R(sigil, c, 'sigilCool', 0.01, 3, 0.01, 'cools over (s)');
  R(sigil, c, 'sigilLine', 0.005, 0.15, 0.001, 'line width');
  R(sigil, c, 'sigilIntensity', 0, 8, 0.05, 'intensity');
  sigil.addColor(c, 'colorSigil').name('colour');
  sigil.addColor(c, 'colorSigilHot').name('hot');
  sigil.addColor(c, 'colorSigilChar').name('char');
  R(sigil, c, 'scorchRadius', 0, 3, 0.01, 'scorch decal (m)');
  R(sigil, c, 'scorchLife', 0.1, 8, 0.05, 'scorch life');

  /* ---- layer 4 ---- */
  const fx = folder.addFolder('4 · Sparks, chips, motes');
  R(fx, c, 'sparkCount', 0, 300, 1, 'sparks per bank');
  R(fx, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(fx, c, 'sparkSize', 0.005, 0.3, 0.005, 'spark size');
  R(fx, c, 'sparkLife', 0.05, 2, 0.01, 'spark lifetime');
  R(fx, c, 'sparkGravity', -30, 5, 0.1, 'spark gravity');
  R(fx, c, 'sparkDrag', 0, 8, 0.05, 'spark drag');
  R(fx, c, 'sparkStretch', 0, 0.4, 0.005, 'spark stretch');
  R(fx, c, 'sparkGlow', 0, 8, 0.05, 'spark glow');
  Editor.gradient(fx, c, 'colorSpark', 'Spark colour over life');
  R(fx, c, 'shardCount', 0, 80, 1, 'chips per bank');
  R(fx, c, 'shardSize', 0.01, 0.4, 0.005, 'chip size');
  R(fx, c, 'shardSpeed', 0, 20, 0.1, 'chip speed');
  R(fx, c, 'shardLife', 0.05, 3, 0.01, 'chip lifetime');
  R(fx, c, 'moteRate', 0, 400, 1, 'motes in flight (/s)');
  R(fx, c, 'moteSize', 0.01, 1, 0.005, 'mote size');
  R(fx, c, 'moteLife', 0.05, 3, 0.01, 'mote lifetime');
  R(fx, c, 'moteGlow', 0, 8, 0.05, 'mote glow');
  Editor.gradient(fx, c, 'colorMote', 'Mote colour over life');

  /* ---- layer 5 ---- */
  const impact = folder.addFolder('5 · Impact + catch');
  R(impact, c, 'bankBurst', 0, 5, 0.05, 'shell per bank (m)');
  R(impact, c, 'bankBurstLife', 0.05, 1, 0.01, 'shell lifetime');
  R(impact, c, 'bankBurstOpacity', 0, 1, 0.01, 'shell opacity');
  R(impact, c, 'shockRadius', 0, 6, 0.05, 'shockwave (m)');
  R(impact, c, 'catchBurst', 0, 3, 0.05, 'catch shell (m)');
  R(impact, c, 'catchSparks', 0, 200, 1, 'catch sparks');
  impact.addColor(c, 'colorBurstA').name('shell inner');
  impact.addColor(c, 'colorBurstB').name('shell mid');
  impact.addColor(c, 'colorBurstC').name('shell outer');
  impact.addColor(c, 'colorShockA').name('shockwave');
  impact.addColor(c, 'colorShockB').name('shockwave hot');

  /* ---- layer 6 ---- */
  const warp = folder.addFolder('6 · Wake warp');
  R(warp, c, 'warpSize', 0.1, 4, 0.05, 'half-size (m)');
  R(warp, c, 'warpStrength', 0, 3, 0.01, 'strength');
  R(warp, c, 'warpScale', 0.2, 12, 0.05, 'noise scale');
  R(warp, c, 'warpSpeed', 0, 12, 0.05, 'noise speed');

  /* ---- layer 7 ---- */
  const fb = folder.addFolder('7 · Light & feedback');
  fb.addColor(c, 'lightColor').name('light colour');
  R(fb, c, 'lightIntensity', 0, 30, 0.1, 'light intensity');
  R(fb, c, 'lightRadius', 0.5, 30, 0.1, 'light radius');
  R(fb, c, 'bankLight', 0, 60, 0.5, 'light punch per bank');
  R(fb, c, 'catchLight', 0, 60, 0.5, 'light punch on catch');
  R(fb, c, 'bankShake', 0, 1, 0.01, 'shake per bank');
  R(fb, c, 'bankFlash', 0, 1, 0.01, 'flash per bank');
  R(fb, c, 'catchShake', 0, 1, 0.01, 'shake on catch');
  R(fb, c, 'catchFlash', 0, 1, 0.01, 'flash on catch');
  R(fb, c, 'throwShake', 0, 0.5, 0.005, 'shake on throw');
  fb.addColor(c, 'colorFlash').name('flash colour');
}
