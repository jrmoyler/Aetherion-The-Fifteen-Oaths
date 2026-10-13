import {
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  Object3D,
  PlaneGeometry,
  Vector3
} from 'three';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createRecallDialMaterial,
  createRecallEchoMaterial,
  createRecallPathMaterial,
  createRecallWarpMaterial
} from '../../materials/atlas/ChronoRecallMaterials.js';
import { createRecallGlyphGeometry, createRecallPathGeometry } from '../../assets/atlas/ChronoRecallGeometry.js';
import { CasterDouble, casterLock } from '../../assets/atlas/ChronoRecallRig.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing, randRange } from '../../utils/math.js';

export const ID = 'recall';

/** Echoes dropped on the way out. The editor's count slider clamps to this. */
const MAX_ECHOES = 8;
/** Plus one: the caster's own last pose, left at the target when the rewind takes it. */
const SLOTS = MAX_ECHOES + 1;
const PATH_NODES = 128;
const TAU = Math.PI * 2;

const _emit = {};
const _force = { impulse: 0, lift: 0, spin: 0 };
const _pos = new Vector3();
const _dir = new Vector3();
const _tan = new Vector3();
const _back = new Vector3();
const _a = new Vector3();
const _node = new Object3D();
/** Reused by `DummyField#findTargets`. */
const _targets = [];

/**
 * CHRONO RECALL — Time / mobility, line cast.
 *
 * The caster *runs* a bent arc to the target — visibly, the real body, not a
 * streak — and every few metres time catches on them: a frozen echo of the
 * body, in the exact pose it had at that instant, is left standing on the arc
 * over a clock dial. At the end the run holds for a beat with every clock
 * stopped. Then time rewinds: a last echo is left where the caster stood, and
 * the caster is dragged *backward* down the arc — still facing the way it
 * ran, like a reversed film — on an accelerating rewind head that wrings the
 * frame as it goes. Every echo it passes is unthreaded slice by slice, the
 * clocks spin backward, and the caster **snaps** home onto the origin.
 *
 * It is the opposite of the Blink Step in every beat: the Blink hides the body
 * and travels straight as light; the Recall never hides the body at all,
 * travels a curve, keeps a record of the trip and then undoes it.
 *
 * ## Layers
 *
 *   1. **ECHOES** (`createRecallEchoMaterial`) — the real rig, cloned with
 *      three's `SkeletonUtils.clone` (see `CasterDouble`) and frozen by copying
 *      the live bones' local transforms at the instant it is dropped. Amber
 *      glass: hot fresnel rim, sand-glass bands, the skin's detail as
 *      luminance, a per-slice tremor. On the rewind each horizontal slice
 *      peels on its own clock — twisted about the spine, sucked into the
 *      heart, dragged back along the arc and eaten by noise with a hot edge.
 *      If the rig is not loaded the echoes fall back to a lathe silhouette
 *      drawn with the same shader.
 *   2. **CLOCK DIALS** (`createRecallDialMaterial`) — instanced floor glyphs
 *      under every echo: bezel, sixty ticks, two hands, a light wedge behind
 *      the minute hand. Hands run during the dash, *stop* during the hold, and
 *      spin backward on the rewind (wound on the CPU so they can).
 *   3. **TIME-STREAM** (`createRecallPathMaterial`) — the arc itself on the
 *      floor, two rails, a hairline and chevrons that flow forward on the dash
 *      and backward on the rewind, revealed behind the runner and swallowed
 *      by the rewind head.
 *   4. **SAND** — curl-noise motes shed by the runner, by the standing echoes,
 *      and blown backward off the rewind head.
 *   5. **SPARKS** — a ring at every echo drop, a backward spray at every
 *      collapse, a crown at the snap.
 *   6. **REWIND WARP** (`createRecallWarpMaterial`, LAYER.DISTORTION) — a
 *      ring that *twists* the frame about the rewind head as it runs back,
 *      and an inward pull at the origin on the snap.
 *   7. **THE SNAP** — AIR pressure shell, SHOCKWAVE and DUSTRING decals,
 *      flash, shake and a light punch at the origin; small SHOCKWAVE stamps
 *      under every echo as it is dropped.
 *
 * ## Hits
 *
 * `handlesOwnHits`: the dash is a curve, which the default straight capsule
 * would get wrong. Every frame of the dash the arc between the last and this
 * frame's runner position is swept in sub-steps of `hitRadius / 2` with
 * `findTargets`, and every body touched is thrown along the run, kicked a
 * little outward from the bend.
 *
 * ## The body
 *
 * Same contract as the Blink Step, adapted to a body that moves every frame
 * — and simpler in one respect: the Recall **never hides the body**. That is
 * deliberate. The Blink Step saves `root.visible` when it takes the body, so
 * a mover that hid it and was then interrupted by a Blink would have the
 * Blink "restore" an invisible caster; a Recall cannot cause that.
 * The character is only touched while this cast *owns* it (`casterLock`,
 * shared with the Parallax Blink). Taking it saves its position and facing.
 * Every exit — the snap finishing, `destroy` (clear / retire), or
 * another atlas mover taking it — goes through `_releaseCharacter`. A clear or
 * a retire mid-cast puts the body back at the *origin* (the recall always
 * keeps its promise). A steal leaves the position to the new owner. And because Blink Step and Voidstep keep their
 * own tokens in files this set does not own, the Recall also watches for a
 * foreign move: if the body is not where the Recall last put it, someone else
 * has it, and the Recall lets go without touching it again. Only x and z are
 * ever written; y stays 0.
 *
 * ## The editor rule
 *
 * Echo records keep a curve parameter, a seed and their clocks; every metre,
 * colour and second is read from `settings.recall` per frame, so bend,
 * timings and looks are live mid-cast.
 */
export class ChronoRecallAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    let n = this.dials.count;
    for (const echo of this.echoes) if (echo.double.root.visible) n++;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 3: the time-stream ---- */
    this.pathGeometry = createRecallPathGeometry(PATH_NODES);
    this.pathMaterial = createRecallPathMaterial();
    this.path = new Mesh(this.pathGeometry, this.pathMaterial);
    this.path.name = 'RecallStream';
    this.path.layers.set(LAYER.VFX);
    this.path.frustumCulled = false;
    this.path.renderOrder = 6;
    this.path.visible = false;
    this.group.add(this.path);

    /* ---- layer 2: the clock dials ---- */
    this.dialGeometry = createRecallGlyphGeometry();
    this.dialA = new InstancedBufferAttribute(new Float32Array(SLOTS * 4), 4);
    this.dialB = new InstancedBufferAttribute(new Float32Array(SLOTS * 2), 2);
    this.dialGeometry.setAttribute('aDial', this.dialA);
    this.dialGeometry.setAttribute('aDialB', this.dialB);
    this.dialMaterial = createRecallDialMaterial();
    this.dials = new InstancedMesh(this.dialGeometry, this.dialMaterial, SLOTS);
    this.dials.name = 'RecallDials';
    this.dials.layers.set(LAYER.VFX);
    this.dials.frustumCulled = false;
    this.dials.renderOrder = 7;
    this.dials.count = 0;
    this.group.add(this.dials);

    /* ---- layer 1: the echoes ---- */
    // One double and one material per slot: each echo carries its own
    // collapse, flare and anchor. Built once, here — `bind` is a no-op on
    // every later cast unless the rig itself was swapped.
    this.echoes = [];
    for (let i = 0; i < SLOTS; i++) {
      const material = createRecallEchoMaterial();
      const double = new CasterDouble(material, `RecallEcho${i}`);
      double.bind(this.ctx.character);
      this.group.add(double.root);
      this.echoes.push({
        double,
        material,
        t: 0, // curve parameter it stands at
        born: -1, // age it was dropped at, -1 = unused
        collapseAt: -1, // age the rewind reached it
        seed: 0,
        minute: 0, // clock hands, radians
        state: {
          anchor: new Vector3(),
          back: new Vector3(),
          collapse: 0,
          fade: 0,
          flare: 0,
          seed: 0,
          height: 1.78,
          map: null
        }
      });
    }

    /* ---- layer 6: the rewind warp and the snap pull ---- */
    this.warpGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.rewindWarpMaterial = createRecallWarpMaterial();
    this.snapWarpMaterial = createRecallWarpMaterial();
    this.rewindWarp = new Mesh(this.warpGeometry, this.rewindWarpMaterial);
    this.snapWarp = new Mesh(this.warpGeometry, this.snapWarpMaterial);
    for (const mesh of [this.rewindWarp, this.snapWarp]) {
      mesh.layers.set(LAYER.DISTORTION);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
    }
    this._warpState = { size: 1, strength: 0, front: 0.5, width: 0.05, twist: 0, sign: 1, seed: 0 };

    /* ---- the curve, resolved per frame ---- */
    this._ctrl = new Vector3();
    this._target = new Vector3();
    this._arc = 1;
    this._bendSign = 1;
    this._pathState = {
      origin: this.origin,
      ctrl: this._ctrl,
      target: this._target,
      arc: 1,
      head: 0,
      rewind: 1,
      rewinding: 0,
      fade: 1
    };

    /* ---- the body ---- */
    this._owns = false;
    this._savedPos = new Vector3();
    this._savedFacing = 0;
    this._lastWritten = new Vector3();

    this._seed = 0;
    this._dropped = 0;
    this._lastHitT = 0;
    this._rewindP = 0;
    this._rewindStarted = false;
    this._snapped = false;
    this._snapAge = -1;
    this._holdFlash = 0;
    this._rewinding = 0;
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 4: sand ---- */
    this.sand = particles.get('recall.sand', {
      capacity: 2400,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.3
    });
    this.sand.uniforms.uDrag.value = 1.6;
    this.sand.uniforms.uEndSize.value = 0.35;
    this.sand.uniforms.uSizeIn.value = 0.1;
    this.sand.uniforms.uFadeIn.value = 0.1;
    this.sand.uniforms.uFadeOut.value = 0.5;

    /* ---- layer 5: sparks ---- */
    this.sparks = particles.get('recall.sparks', {
      capacity: 2400,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparks.uniforms.uDrag.value = 2.2;
    this.sparks.uniforms.uEndSize.value = 0.25;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.6;

    this.sandEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The hold plus the rewind: everything between arriving and snapping back. */
  get impactDuration() {
    const c = settings.recall;
    return Math.max(0.1, (c.lifetime + c.rewindTime) * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings.recall.fadeTime * settings.global.lifetime);
  }

  /** Clockwork: steady, with a tick. */
  lightShimmer() {
    const c = settings.recall;
    const tick = Math.pow(Math.max(0, Math.sin(this.age * c.tickRate * Math.PI)), 24);
    return 0.92 + tick * 0.25;
  }

  /* ------------------------------------------------------------------ */
  /* The curve                                                           */
  /* ------------------------------------------------------------------ */

  /** Re-derive the arc from the live settings. Called every frame. */
  _updateCurve() {
    const c = settings.recall;
    this.pointAt(1, this._target);
    // The control point bows off the chord's midpoint; at `bend` 0.5 the arc's
    // apex sits a quarter of the chord off the straight line.
    this._ctrl.copy(this.origin).add(this._target).multiplyScalar(0.5);
    this._ctrl.addScaledVector(this.side, this.length * c.bend * this._bendSign);
    this._ctrl.y = 0;

    // Arc length by 16 chords: plenty for a single quadratic.
    let arc = 0;
    _a.copy(this.origin);
    for (let i = 1; i <= 16; i++) {
      this._curve(i / 16, _pos);
      arc += _pos.distanceTo(_a);
      _a.copy(_pos);
    }
    this._arc = Math.max(0.1, arc);
  }

  /** A point on the arc, on the floor. */
  _curve(t, out) {
    const k = 1 - t;
    out.copy(this.origin).multiplyScalar(k * k);
    out.addScaledVector(this._ctrl, 2 * k * t);
    out.addScaledVector(this._target, t * t);
    out.y = 0;
    return out;
  }

  /** The arc's unit tangent, flat. */
  _tangent(t, out) {
    out.copy(this._ctrl).sub(this.origin).multiplyScalar(2 * (1 - t));
    _a.copy(this._target).sub(this._ctrl).multiplyScalar(2 * t);
    out.add(_a);
    out.y = 0;
    if (out.lengthSq() < 1e-8) out.copy(this.direction);
    return out.normalize();
  }

  /**
   * The base class runs a front down the *chord*. The runner runs the *arc*,
   * so the front is re-measured against the arc's length and `u` becomes the
   * curve parameter (a symmetric quadratic is near enough arc-length uniform).
   */
  advance(dt) {
    const c = settings.recall;
    this._updateCurve();
    const speed = c.speed * settings.global.speed;
    const easeIn = Easing.outQuad(saturate(this.age / Math.max(0.01, c.dashEaseIn)));
    this.front += speed * easeIn * dt;
    const previousU = this.u;
    this.u = saturate(this.front / this._arc);
    this._curve(this.u, this.position);
    return this.u >= 1 && previousU < 1;
  }

  /* ------------------------------------------------------------------ */
  /* The body                                                            */
  /* ------------------------------------------------------------------ */

  _takeCharacter() {
    const character = this.ctx.character;
    if (!character?.root) return;
    if (casterLock.owner && casterLock.owner !== this) casterLock.owner._releaseCharacter(true);
    casterLock.owner = this;
    this._owns = true;
    this._savedPos.copy(character.position);
    this._savedFacing = character.facing ?? 0;
    this._lastWritten.copy(character.position);
  }

  /**
   * Hand the body back. `steal` = another mover is taking it this instant, so
   * only visibility is restored; otherwise a body that has not snapped yet is
   * put back at the origin, because that is what a recall promises.
   */
  _releaseCharacter(steal = false) {
    if (!this._owns) return;
    const character = this.ctx.character;
    if (character?.root) {
      if (!steal && !this._snapped) {
        character.position.set(this._savedPos.x, 0, this._savedPos.z);
        character.setFacing?.(this._savedFacing);
      }
    }
    this._owns = false;
    if (casterLock.owner === this) casterLock.owner = null;
  }

  /**
   * Someone outside the lock (Blink Step, Voidstep) moved the body: they have
   * it now. Let go without moving it back.
   */
  _checkForeign() {
    if (!this._owns) return;
    const p = this.ctx.character.position;
    const dx = p.x - this._lastWritten.x;
    const dz = p.z - this._lastWritten.z;
    if (dx * dx + dz * dz > 1e-4) {
      this._snapped = true; // nothing left for us to put back
      this._releaseCharacter(true);
    }
  }

  _placeBody(x, z, yaw) {
    if (!this._owns) return;
    const character = this.ctx.character;
    character.position.x = x;
    character.position.z = z;
    character.position.y = 0;
    character.setFacing?.(yaw);
    this._lastWritten.set(x, 0, z);
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.recall;
    this._seed = Math.random() * 100;
    this._bendSign = c.bendSide > 0.33 ? 1 : c.bendSide < -0.33 ? -1 : Math.random() < 0.5 ? -1 : 1;
    this._dropped = 0;
    this._lastHitT = 0;
    this._rewindP = 0;
    this._rewindStarted = false;
    this._snapped = false;
    this._snapAge = -1;
    this._holdFlash = 0;
    this._rewinding = 0;
    this.sandEmitter.reset();

    for (const echo of this.echoes) {
      // Upgrades a fallback silhouette to the real rig if it has loaded since.
      echo.double.bind(this.ctx.character);
      echo.born = -1;
      echo.collapseAt = -1;
      echo.double.root.visible = false;
    }

    this._updateCurve();
    this._takeCharacter();
    this._sync();
  }

  /** Drop an echo of the live pose at curve parameter `t`. */
  _dropEcho(slot, t, yaw) {
    const c = settings.recall;
    const g = settings.global;
    const echo = this.echoes[slot];
    echo.t = t;
    echo.born = this.age;
    echo.collapseAt = -1;
    echo.seed = Math.random();
    echo.minute = Math.random() * TAU;

    const double = echo.double;
    double.copyPose();
    this._curve(t, double.root.position);
    double.setFacing(yaw);
    double.root.visible = true;

    /* the stamp: a ring of sparks and a small shock ring under the feet */
    _pos.copy(double.root.position);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.dialRadius * c.stampRadius,
      life: c.stampLife,
      width: 0.05,
      intensity: 0.9,
      colorA: getColor(c.colorDialRing),
      colorB: getColor(c.colorEchoRim)
    });
    _pos.y = c.bodyHeight;
    _emit.position = _pos;
    _emit.radius = 0.35;
    _emit.direction = _dir.set(0, 0.3, 0);
    _emit.speed = c.stampSparkSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.09;
    _emit.sizeVariance = 0.5;
    _emit.life = c.sparkLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.sparks.emit(Math.round(c.stampSparks * g.particleCount), _emit);
    this.ctx.shake.add(c.stampShake * g.cameraShake, 10, 22);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _sync() {
    const c = settings.recall;
    const g = settings.global;

    this.dialMaterial.userData.sync();

    this.sand.setGradient(getColor(c.colorSandA), getColor(c.colorSandB), getColor(c.colorSandC), getColor(c.colorSandD));
    this.sand.uniforms.uGravity.value.set(0, c.sandRise, 0);
    this.sand.uniforms.uSizeScale.value = c.sandSize * g.particleSize * 7;
    this.sand.uniforms.uLifeScale.value = g.particleLifetime;
    this.sand.uniforms.uSpeedScale.value = g.particleSpeed;
    this.sand.uniforms.uOpacity.value = g.opacity;
    this.sand.uniforms.uGlow.value = c.sandGlow * g.glow;
    this.sand.uniforms.uTurbulence.value = c.sandTurbulence * g.turbulence;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    this.sparks.uniforms.uGravity.value.set(0, -2, 0);
    this.sparks.uniforms.uSizeScale.value = c.sparkSize * g.particleSize * 7;
    this.sparks.uniforms.uLifeScale.value = g.particleLifetime;
    this.sparks.uniforms.uSpeedScale.value = g.particleSpeed;
    this.sparks.uniforms.uOpacity.value = g.opacity;
    this.sparks.uniforms.uGlow.value = c.sparkGlow * g.glow;
    this.sparks.uniforms.uStretch.value = c.sparkStretch;
    this.sparks.uniforms.uTurbulence.value = 0.3 * g.turbulence;
  }

  /** How many echoes this cast drops, from the live slider. */
  _echoCount() {
    return Math.min(MAX_ECHOES, Math.max(1, Math.round(settings.recall.echoCount)));
  }

  /**
   * Every standing echo and its dial: placement on the (live) curve, frozen
   * pose, collapse, clocks.
   */
  _updateEchoes(dt) {
    const c = settings.recall;
    const g = settings.global;
    const rewindHead = this._rewindStarted ? this._rewindHead() : 2;
    const collapseTime = Math.max(0.02, c.echoCollapseTime);
    const appear = Math.max(0.01, c.echoAppear);
    const dialA = this.dialA.array;
    const dialB = this.dialB.array;
    let drawn = 0;

    // Hands: forward while running, stopped during the hold, backward on the rewind.
    let handRate = c.dialSpeed;
    if (this.phase !== AbilityPhase.TRAVEL) handRate = this._rewindStarted ? -c.dialRewindSpeed : 0;
    if (this._snapped) handRate = 0;

    for (let i = 0; i < SLOTS; i++) {
      const echo = this.echoes[i];
      const double = echo.double;
      if (echo.born < 0) {
        double.root.visible = false;
        this._parkDial(i, dialA, dialB);
        continue;
      }

      // The rewind reaches it.
      if (echo.collapseAt < 0 && rewindHead <= echo.t + 1e-4) {
        echo.collapseAt = this.age;
        this._collapseBurst(echo);
      }
      const collapse = echo.collapseAt < 0 ? 0 : saturate((this.age - echo.collapseAt) / collapseTime);
      const life = this.age - echo.born;
      const fadeIn = Easing.outCubic(saturate(life / appear));
      const fade = fadeIn * (1 - smoothstep(0.75, 1, collapse));

      if (collapse >= 1 || fade <= 0.001) {
        double.root.visible = collapse < 1;
        if (collapse >= 1) {
          this._parkDial(i, dialA, dialB);
          continue;
        }
      }

      // Re-placed every frame: dragging `bend` slides the echoes with the arc.
      this._curve(echo.t, double.root.position);
      this._tangent(echo.t, _tan);
      double.setFacing(Math.atan2(_tan.x, _tan.z));
      double.root.visible = true;

      const st = echo.state;
      st.anchor.copy(double.root.position);
      st.back.copy(_tan).negate();
      st.collapse = collapse;
      st.fade = fade;
      st.flare = Math.max(0, 1 - life / Math.max(0.02, c.echoFlareTime)) * c.echoFlare + this._holdFlash * 0.5;
      st.seed = echo.seed * 37 + this._seed;
      st.height = double.height;
      st.map = c.echoMapMix > 0 ? double.map : null;
      echo.material.userData.sync(st);

      /* --- its dial --- */
      echo.minute += handRate * dt * (0.8 + echo.seed * 0.4);
      const scale = c.dialRadius * 2 * (i === 0 ? c.anchorDialScale : 1) * lerp(0.6, 1, fadeIn) * (1 + collapse * 0.4);
      _node.position.copy(double.root.position).setY(c.dialLift);
      _node.quaternion.identity();
      _node.scale.setScalar(scale);
      _node.updateMatrix();
      this.dials.setMatrixAt(i, _node.matrix);
      dialA[i * 4] = echo.minute;
      dialA[i * 4 + 1] = echo.minute / 12 + echo.seed * TAU;
      dialA[i * 4 + 2] = fade * (1 - collapse * 0.5);
      dialA[i * 4 + 3] = this._rewinding;
      dialB[i * 2] = echo.seed;
      dialB[i * 2 + 1] = st.flare;
      drawn = i + 1;
    }

    this.dials.count = drawn;
    this.dials.instanceMatrix.needsUpdate = true;
    this.dialA.needsUpdate = true;
    this.dialB.needsUpdate = true;

    // Sand off the echoes while they stand.
    if (this.phase !== AbilityPhase.TRAVEL && !this._snapped) {
      const n = Math.round(this.sandEmitter.tick(dt, c.sandHoldRate) * g.particleCount);
      for (let k = 0; k < n; k++) {
        const echo = this.echoes[Math.floor(Math.random() * SLOTS)];
        if (echo.born < 0 || echo.collapseAt >= 0) continue;
        echo.double.bodyPoint(_pos);
        this._emitSand(_pos, _dir.set(0, 1, 0), c.sandSpeed * 0.5, 1);
      }
    }
  }

  _parkDial(i, dialA, dialB) {
    _node.position.set(0, -999, 0);
    _node.quaternion.identity();
    _node.scale.setScalar(0.0001);
    _node.updateMatrix();
    this.dials.setMatrixAt(i, _node.matrix);
    dialA[i * 4 + 2] = 0;
    dialB[i * 2 + 1] = 0;
  }

  _emitSand(at, dir, speed, count) {
    const c = settings.recall;
    _emit.position = at;
    _emit.radius = 0.12;
    _emit.direction = dir;
    _emit.speed = speed;
    _emit.speedVariance = 0.6;
    _emit.spread = 0.6;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.06;
    _emit.sizeVariance = 0.6;
    _emit.life = c.sandLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.sand.emit(count, _emit);
  }

  /** An echo starts to unthread: sparks sprayed back toward the origin. */
  _collapseBurst(echo) {
    const c = settings.recall;
    const g = settings.global;
    this._tangent(echo.t, _back).negate();
    this._curve(echo.t, _pos);
    _pos.y = c.bodyHeight;
    _emit.position = _pos;
    _emit.radius = 0.4;
    _emit.direction = _dir.copy(_back).setY(0.15).normalize();
    _emit.speed = c.collapseSparkSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 0.35;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.5;
    _emit.life = c.sparkLifetime;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.sparks.emit(Math.round(c.collapseSparks * g.particleCount), _emit);
    this.ctx.shake.add(c.collapseShake * g.cameraShake, 12, 26);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.collapseLight);
  }

  /** Where the rewind head is on the curve, 1 (target) → 0 (origin). */
  _rewindHead() {
    return 1 - Math.pow(this._rewindP, Math.max(0.2, settings.recall.rewindEase));
  }

  _updatePath(fade) {
    const st = this._pathState;
    st.arc = this._arc;
    st.head = this.phase === AbilityPhase.TRAVEL ? this.u : 1;
    st.rewind = this._rewindStarted ? this._rewindHead() : 1;
    st.rewinding = this._rewinding;
    st.fade = fade;
    this.pathMaterial.userData.sync(st);
    this.path.visible = fade > 0.001 && st.rewind > 0.001;
  }

  _updateRewindWarp() {
    const c = settings.recall;
    if (!this._rewindStarted || this._snapped) {
      this.rewindWarp.visible = false;
      return;
    }
    const h = this._rewindHead();
    const st = this._warpState;
    st.size = c.warpSize;
    st.strength = c.warpStrength * Math.sin(Math.min(1, this._rewindP * 1.2) * Math.PI * 0.5 + 0.2);
    st.front = 0.45 + 0.08 * Math.sin(this.age * 9);
    st.width = c.warpWidth;
    st.twist = c.warpTwist;
    st.sign = 1;
    st.seed = this._seed;
    this.rewindWarpMaterial.userData.sync(st);
    this._curve(h, this.rewindWarp.position).setY(c.bodyHeight);
    this.rewindWarp.visible = true;
  }

  _updateSnapWarp() {
    const c = settings.recall;
    if (this._snapAge < 0) {
      this.snapWarp.visible = false;
      return;
    }
    const t = saturate(this._snapAge / Math.max(0.02, c.snapWarpTime));
    const st = this._warpState;
    st.size = c.snapWarpSize;
    st.strength = c.snapWarpStrength * (1 - t) * smoothstep(0, 0.08, t);
    st.front = lerp(0.95, 0.1, Easing.outCubic(t));
    st.width = 0.035;
    st.twist = c.warpTwist * 0.5;
    st.sign = -1;
    st.seed = this._seed + 3;
    this.snapWarpMaterial.userData.sync(st);
    this.snapWarp.position.copy(this.origin).setY(c.bodyHeight);
    this.snapWarp.visible = t < 1;
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.recall;
    const g = settings.global;
    this._checkForeign();
    this._sync();

    /* --- the runner --- */
    this._tangent(this.u, _tan);
    const yaw = Math.atan2(_tan.x, _tan.z);
    this._placeBody(this.position.x, this.position.z, yaw);

    /* --- drop echoes as the runner passes their marks --- */
    const count = this._echoCount();
    while (this._dropped < count && this.u >= this._dropped / count) {
      const t = this._dropped / count;
      this._dropEcho(this._dropped, t, Math.atan2(this._tangent(t, _dir).x, _dir.z));
      this._dropped++;
    }

    this._sweepHits(this._lastHitT, this.u);
    this._lastHitT = this.u;

    this._updateEchoes(dt);
    this._updatePath(1);
    this.rewindWarp.visible = false;
    this.snapWarp.visible = false;

    /* --- sand off the runner --- */
    const n = Math.round(this.sandEmitter.tick(dt, c.sandRate) * g.particleCount);
    if (n > 0) {
      _pos.copy(this.position).setY(c.bodyHeight * 0.6);
      this._emitSand(_pos, _dir.copy(_tan).negate().setY(0.4).normalize(), c.sandSpeed, n);
    }

    this.position.y = c.bodyHeight;
  }

  /**
   * Sweep the arc from `t0` to `t1` for bodies, in sub-steps short enough that
   * a fast runner cannot step over one.
   */
  _sweepHits(t0, t1) {
    const c = settings.recall;
    const field = this.ctx.dummies;
    if (!field?.findTargets || t1 <= t0) return;
    const reach = Math.max(0.1, c.hitRadius);
    const steps = Math.min(32, Math.max(1, Math.ceil(((t1 - t0) * this._arc) / (reach * 0.5))));
    _force.impulse = c.hitImpulse;
    _force.lift = c.hitLift;
    _force.spin = c.hitSpin;
    for (let s = 1; s <= steps; s++) {
      const t = lerp(t0, t1, s / steps);
      this._curve(t, _pos);
      field.findTargets(_pos.x, _pos.z, reach, _targets);
      if (!_targets.length) continue;
      this._tangent(t, _tan);
      for (const dummy of _targets) {
        // Along the run, kicked out from the inside of the bend.
        _dir.set(dummy.position.x - _pos.x, 0, dummy.position.z - _pos.z);
        const side = _dir.dot(this.side) * this._bendSign >= 0 ? 1 : -1;
        _dir.copy(_tan).addScaledVector(this.side, side * this._bendSign * c.hitOutward).normalize();
        if (dummy.kill(_dir.x, _dir.z, _force)) {
          _a.copy(dummy.position).setY(c.bodyHeight);
          _emit.position = _a;
          _emit.radius = 0.3;
          _emit.direction = _dir;
          _emit.speed = c.stampSparkSpeed * 1.4;
          _emit.speedVariance = 0.5;
          _emit.spread = 0.6;
          _emit.inherit = null;
          _emit.anchor = null;
          _emit.size = 0.1;
          _emit.sizeVariance = 0.5;
          _emit.life = c.sparkLifetime;
          _emit.lifeVariance = 0.4;
          _emit.spin = 0;
          _emit.tint = null;
          _emit.time = frame.uTime.value;
          this.sparks.emit(Math.round(c.hitSparks * settings.global.particleCount), _emit);
          this.ctx.shake.add(c.hitShake * settings.global.cameraShake, 9, 20);
        }
      }
    }
  }

  onImpact() {
    const c = settings.recall;
    const g = settings.global;
    this._sweepHits(this._lastHitT, 1);
    this._lastHitT = 1;
    // Any marks the runner crossed on its last frame.
    const count = this._echoCount();
    while (this._dropped < count) {
      const t = this._dropped / count;
      this._dropEcho(this._dropped, t, Math.atan2(this._tangent(t, _dir).x, _dir.z));
      this._dropped++;
    }

    /* --- time stops: every clock halts, a dry tick, a cold flash --- */
    this._holdFlash = 1;
    this.pointAt(1, _pos);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.dialRadius * 2.2,
      life: c.stampLife * 1.4,
      width: 0.04,
      intensity: 1,
      colorA: getColor(c.colorDialRing),
      colorB: getColor(c.colorDialHand)
    });
    this.ctx.shake.add(c.holdShake * g.cameraShake, 14, 30);
    this.ctx.flash.trigger(getColor(c.colorDialHand), c.holdFlash * g.explosionIntensity);
    this.lightBoost = c.lightIntensity * c.holdLight;
  }

  onFade(dt) {
    const c = settings.recall;
    const g = settings.global;
    this._checkForeign();
    this._sync();
    this._updateCurve();
    this._holdFlash = Math.max(0, this._holdFlash - dt / Math.max(0.05, c.holdFlashTime));

    const hold = c.lifetime * g.lifetime;
    const rewind = Math.max(0.05, c.rewindTime * g.lifetime);
    const impactAge = this.phase === AbilityPhase.IMPACT ? this.impactTime : this.impactDuration;
    const into = impactAge - hold;

    /* --- the rewind begins: a last echo is left where the caster stood --- */
    if (!this._rewindStarted && into >= 0) {
      this._rewindStarted = true;
      const body = this.ctx.character;
      const yaw = this._owns ? body.facing : Math.atan2(this.direction.x, this.direction.z);
      this._dropEcho(MAX_ECHOES, 1, yaw);
      this.ctx.flash.trigger(getColor(c.colorRewind), c.rewindFlash * g.explosionIntensity);
      this.ctx.shake.add(c.rewindShake * g.cameraShake, 6, 14);
    }
    if (this._rewindStarted) {
      this._rewindP = saturate(into / rewind);
      this._rewinding = Math.min(1, this._rewinding + dt * 6);
    }

    /* --- the body rides the rewind head backward, facing the way it ran --- */
    if (this._rewindStarted && !this._snapped && this._rewindP < 1) {
      const h = this._rewindHead();
      this._curve(h, _pos);
      this._tangent(h, _tan);
      this._placeBody(_pos.x, _pos.z, Math.atan2(_tan.x, _tan.z));
    }

    /* --- the snap --- */
    if (this._rewindStarted && !this._snapped && this._rewindP >= 1) this._snap();
    if (this._snapAge >= 0) this._snapAge += dt;

    /* --- sand blown back off the rewind head --- */
    if (this._rewindStarted && !this._snapped) {
      const h = this._rewindHead();
      const n = Math.round(this.sandEmitter.tick(dt, c.sandRewindRate) * g.particleCount);
      if (n > 0) {
        this._curve(h, _pos).setY(c.bodyHeight * 0.7);
        this._tangent(h, _dir).negate().setY(0.1).normalize();
        this._emitSand(_pos, _dir, c.sandSpeed * 2.2, n);
      }
      this._curve(h, this.position);
    } else if (this._snapped) {
      this.position.copy(this.origin);
    } else {
      this.position.copy(this._target);
    }
    this.position.y = c.bodyHeight;

    const fade = this.phase === AbilityPhase.FADE ? 1 - Easing.inQuad(saturate(this.fadeTime / this.fadeDuration)) : 1;
    this._updateEchoes(dt);
    this._updatePath(fade);
    this._updateRewindWarp();
    this._updateSnapWarp();
  }

  /** Back where it started. Everything resolves at the origin. */
  _snap() {
    const c = settings.recall;
    const g = settings.global;
    this._snapped = true;
    this._snapAge = 0;

    if (this._owns) {
      const character = this.ctx.character;
      character.position.set(this._savedPos.x, 0, this._savedPos.z);
      character.setFacing?.(this._savedFacing);
      this._lastWritten.copy(character.position);
      this._releaseCharacter(true);
    }

    _pos.copy(this.origin);
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _pos, {
      radius: c.snapRadius * g.explosionIntensity,
      life: c.snapDecalLife,
      width: 0.06,
      intensity: 1.1,
      colorA: getColor(c.colorRewind),
      colorB: getColor(c.colorDialHand)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _pos, {
      radius: c.snapRadius * 0.8,
      life: c.snapDecalLife * 1.4,
      intensity: 0.6,
      colorA: getColor(c.colorDust),
      colorB: getColor(c.colorDust)
    });
    _pos.y = c.bodyHeight * 0.8;
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: 0.3,
      endRadius: c.snapBurst * g.explosionIntensity,
      life: c.snapBurstLife,
      intensity: c.snapBurstIntensity,
      opacity: 0.7,
      fresnel: 2.2 * g.fresnel,
      squash: 0.8,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _dir.set(0, 0.25, 0);
    _emit.speed = c.snapSparkSpeed;
    _emit.speedVariance = 0.5;
    _emit.spread = 1;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.11;
    _emit.sizeVariance = 0.5;
    _emit.life = c.sparkLifetime * 1.3;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
    this.sparks.emit(Math.round(c.snapSparks * g.particleCount), _emit);
    this._emitSand(_pos, _dir.set(0, 1, 0), c.sandSpeed * 1.5, Math.round(c.snapSand * g.particleCount));

    this.ctx.shake.add(c.snapShake * g.explosionIntensity * g.cameraShake, 1 / Math.max(0.05, c.snapShakeTime), 22);
    this.ctx.flash.trigger(getColor(c.colorFlash), c.snapFlash * g.explosionIntensity);
    this.lightBoost = c.lightIntensity * c.lightBoost * g.explosionIntensity;
  }

  onDestroy() {
    // First, always: wherever the cast was, the body goes back whole.
    this._releaseCharacter(false);
    this.path.visible = false;
    this.dials.count = 0;
    this.rewindWarp.visible = false;
    this.snapWarp.visible = false;
    for (const echo of this.echoes) {
      echo.born = -1;
      echo.collapseAt = -1;
      echo.double.root.visible = false;
    }
    this._snapAge = -1;
    this._rewindStarted = false;
  }

  dispose() {
    this._releaseCharacter(false);
    this.pathGeometry.dispose();
    this.pathMaterial.dispose();
    this.dialGeometry.dispose();
    this.dials.dispose();
    this.dialMaterial.dispose();
    for (const echo of this.echoes) {
      echo.double.dispose();
      echo.material.dispose();
    }
    this.warpGeometry.dispose();
    this.rewindWarpMaterial.dispose();
    this.snapWarpMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('◷  Chrono Recall');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 3, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 60, 0.5, 'dash speed (m/s)');
  R(cast, c, 'dashEaseIn', 0.01, 1, 0.01, 'dash ease-in (s)');
  R(cast, c, 'bend', 0, 1, 0.01, 'arc bend (× length)');
  R(cast, c, 'bendSide', -1, 1, 1, 'bend side (-1 L, 0 random, 1 R)');
  R(cast, c, 'lifetime', 0, 4, 0.01, 'hold before rewind (s)');
  R(cast, c, 'rewindTime', 0.05, 4, 0.01, 'rewind (s)');
  R(cast, c, 'rewindEase', 0.2, 4, 0.05, 'rewind acceleration');
  R(cast, c, 'fadeTime', 0.05, 3, 0.01, 'linger after snap (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'bodyHeight', 0.1, 2.5, 0.01, 'body centre (m)');
  R(cast, c, 'tickRate', 0, 8, 0.05, 'light tick (Hz)');
  Editor.castAnimation(cast, c);

  const echo = folder.addFolder('1 · Echoes');
  R(echo, c, 'echoCount', 1, MAX_ECHOES, 1, 'echoes');
  R(echo, c, 'echoAppear', 0.01, 1, 0.01, 'appear (s)');
  R(echo, c, 'echoFlare', 0, 4, 0.05, 'stamp flare');
  R(echo, c, 'echoFlareTime', 0.02, 1.5, 0.01, 'flare decay (s)');
  R(echo, c, 'echoOpacity', 0, 1, 0.01, 'opacity');
  R(echo, c, 'echoGlow', 0, 8, 0.05, 'glow');
  R(echo, c, 'echoFill', 0, 2, 0.01, 'glass fill');
  R(echo, c, 'echoFresnel', 0, 6, 0.05, 'rim');
  R(echo, c, 'echoFresnelPower', 0.5, 8, 0.05, 'rim power');
  R(echo, c, 'echoBands', 0, 60, 0.5, 'sand bands');
  R(echo, c, 'echoBandSpeed', -1, 1, 0.01, 'band crawl');
  R(echo, c, 'echoBandSharp', 1, 30, 0.5, 'band sharpness');
  R(echo, c, 'echoMapMix', 0, 1, 0.01, 'skin detail');
  R(echo, c, 'echoJitter', 0, 0.05, 0.001, 'frozen tremor (m)');
  echo.addColor(c, 'colorEchoCore').name('glass');
  echo.addColor(c, 'colorEchoRim').name('rim');
  echo.addColor(c, 'colorEchoBand').name('bands');

  const col = folder.addFolder('Rewind collapse');
  R(col, c, 'echoCollapseTime', 0.02, 2, 0.01, 'collapse (s)');
  R(col, c, 'echoSlices', 1, 60, 1, 'slices');
  R(col, c, 'echoTwist', 0, 12, 0.05, 'twist (rad)');
  R(col, c, 'echoSmear', 0, 6, 0.05, 'drag back (m)');
  R(col, c, 'echoShrink', 0, 1, 0.01, 'fall into heart');
  R(col, c, 'collapseSparks', 0, 200, 1, 'sparks');
  R(col, c, 'collapseSparkSpeed', 0, 20, 0.1, 'spark speed');
  R(col, c, 'collapseShake', 0, 1, 0.01, 'shake');
  R(col, c, 'collapseLight', 0, 4, 0.05, 'light punch (× intensity)');
  col.addColor(c, 'colorRewind').name('rewind colour');

  const dial = folder.addFolder('2 · Clock dials');
  R(dial, c, 'dialRadius', 0.1, 3, 0.01, 'radius (m)');
  R(dial, c, 'anchorDialScale', 0.5, 3, 0.01, 'origin dial (× radius)');
  R(dial, c, 'dialLift', 0, 0.2, 0.005, 'lift (m)');
  R(dial, c, 'dialLine', 0.005, 0.08, 0.001, 'line width');
  R(dial, c, 'dialSpeed', -20, 20, 0.1, 'hands, dashing (rad/s)');
  R(dial, c, 'dialRewindSpeed', 0, 60, 0.5, 'hands, rewinding (rad/s)');
  R(dial, c, 'dialTrail', 0, 3, 0.01, 'hand wedge');
  R(dial, c, 'dialGlow', 0, 8, 0.05, 'glow');
  R(dial, c, 'dialOpacity', 0, 1, 0.01, 'opacity');
  R(dial, c, 'stampRadius', 0, 4, 0.05, 'stamp ring (× radius)');
  R(dial, c, 'stampLife', 0.05, 3, 0.01, 'stamp ring life');
  R(dial, c, 'stampSparks', 0, 120, 1, 'stamp sparks');
  R(dial, c, 'stampSparkSpeed', 0, 15, 0.1, 'stamp spark speed');
  R(dial, c, 'stampShake', 0, 0.5, 0.005, 'stamp shake');
  dial.addColor(c, 'colorDialRing').name('ring');
  dial.addColor(c, 'colorDialHand').name('hands');
  dial.addColor(c, 'colorDialTrail').name('wedge');

  const path = folder.addFolder('3 · Time-stream');
  R(path, c, 'pathWidth', 0.05, 2, 0.01, 'half-width (m)');
  R(path, c, 'pathLift', 0, 0.2, 0.005, 'lift (m)');
  R(path, c, 'pathTickSpacing', 0.1, 4, 0.05, 'chevron spacing (m)');
  R(path, c, 'pathFlowSpeed', 0, 12, 0.1, 'flow (m/s)');
  R(path, c, 'pathGrain', 0, 1, 0.01, 'grain');
  R(path, c, 'pathHeadGlow', 0, 8, 0.05, 'head glow');
  R(path, c, 'pathGlow', 0, 8, 0.05, 'glow');
  R(path, c, 'pathOpacity', 0, 1, 0.01, 'opacity');
  path.addColor(c, 'colorPathCore').name('core');
  path.addColor(c, 'colorPathEdge').name('rails');

  const sand = folder.addFolder('4 · Sand');
  R(sand, c, 'sandRate', 0, 600, 1, 'off the runner (/s)');
  R(sand, c, 'sandHoldRate', 0, 400, 1, 'off the echoes (/s)');
  R(sand, c, 'sandRewindRate', 0, 800, 1, 'off the rewind (/s)');
  R(sand, c, 'sandSize', 0.01, 0.4, 0.005, 'size');
  R(sand, c, 'sandSpeed', 0, 10, 0.05, 'speed');
  R(sand, c, 'sandLifetime', 0.1, 4, 0.05, 'lifetime');
  R(sand, c, 'sandRise', -3, 3, 0.05, 'rise');
  R(sand, c, 'sandTurbulence', 0, 3, 0.05, 'turbulence');
  R(sand, c, 'sandGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(sand, c, 'colorSand', 'sand colour');

  const sparks = folder.addFolder('5 · Sparks');
  R(sparks, c, 'sparkSize', 0.01, 0.4, 0.005, 'size');
  R(sparks, c, 'sparkLifetime', 0.05, 2, 0.01, 'lifetime');
  R(sparks, c, 'sparkStretch', 0, 2, 0.01, 'stretch');
  R(sparks, c, 'sparkGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(sparks, c, 'colorSpark', 'spark colour');

  const warp = folder.addFolder('6 · Rewind warp');
  R(warp, c, 'warpStrength', 0, 3, 0.01, 'strength');
  R(warp, c, 'warpSize', 0.2, 10, 0.05, 'size (m)');
  R(warp, c, 'warpWidth', 0.005, 0.3, 0.005, 'ring width');
  R(warp, c, 'warpTwist', 0, 1, 0.01, 'twist (0 push, 1 wring)');
  R(warp, c, 'rewindFlash', 0, 1, 0.01, 'rewind flash');
  R(warp, c, 'rewindShake', 0, 1, 0.01, 'rewind shake');

  const hold = folder.addFolder('Hold (time stops)');
  R(hold, c, 'holdFlash', 0, 1, 0.01, 'flash');
  R(hold, c, 'holdFlashTime', 0.05, 2, 0.01, 'echo flare decay (s)');
  R(hold, c, 'holdShake', 0, 1, 0.01, 'shake');
  R(hold, c, 'holdLight', 0, 4, 0.05, 'light punch (× intensity)');

  const snap = folder.addFolder('7 · The snap');
  R(snap, c, 'snapRadius', 0.1, 8, 0.05, 'shock ring (m)');
  R(snap, c, 'snapDecalLife', 0.05, 3, 0.01, 'ring life');
  R(snap, c, 'snapBurst', 0.1, 8, 0.05, 'pressure shell (m)');
  R(snap, c, 'snapBurstLife', 0.05, 2, 0.01, 'shell life');
  R(snap, c, 'snapBurstIntensity', 0, 6, 0.05, 'shell intensity');
  snap.addColor(c, 'colorBurstA').name('shell core');
  snap.addColor(c, 'colorBurstB').name('shell body');
  snap.addColor(c, 'colorBurstC').name('shell edge');
  snap.addColor(c, 'colorDust').name('dust');
  R(snap, c, 'snapSparks', 0, 300, 1, 'sparks');
  R(snap, c, 'snapSparkSpeed', 0, 20, 0.1, 'spark speed');
  R(snap, c, 'snapSand', 0, 300, 1, 'sand');
  R(snap, c, 'snapWarpStrength', 0, 3, 0.01, 'pull strength');
  R(snap, c, 'snapWarpSize', 0.2, 10, 0.05, 'pull size (m)');
  R(snap, c, 'snapWarpTime', 0.02, 1.5, 0.01, 'pull time');
  R(snap, c, 'snapShake', 0, 1.5, 0.01, 'shake');
  R(snap, c, 'snapShakeTime', 0.05, 2, 0.01, 'shake settles over');
  R(snap, c, 'snapFlash', 0, 1, 0.01, 'flash');
  snap.addColor(c, 'colorFlash').name('flash');

  const hits = folder.addFolder('Hits (outbound dash)');
  R(hits, c, 'hitRadius', 0.1, 4, 0.05, 'reach (m)');
  R(hits, c, 'hitImpulse', 0, 20, 0.1, 'impulse (m/s)');
  R(hits, c, 'hitLift', 0, 12, 0.1, 'lift (m/s)');
  R(hits, c, 'hitSpin', 0, 6, 0.05, 'spin');
  R(hits, c, 'hitOutward', 0, 2, 0.01, 'out of the bend');
  R(hits, c, 'hitSparks', 0, 120, 1, 'sparks');
  R(hits, c, 'hitShake', 0, 1, 0.01, 'shake');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightBoost', 0, 6, 0.05, 'snap punch (× intensity)');
}
