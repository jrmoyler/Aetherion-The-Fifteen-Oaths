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
  createBlinkTrailMaterial,
  createBlinkShardMaterial,
  createBlinkGhostMaterial,
  createBlinkWarpMaterial
} from '../../materials/collective/BlinkStepMaterials.js';
import { createBoltRibbonGeometry, createShardGeometry } from '../../assets/ProceduralGeometry.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, smoothstep, Easing, randRange } from '../../utils/math.js';

export const ID = 'blink';

/** Shards per crown; there are two crowns (departure, arrival). */
const MAX_SHARDS = 24;
/** Afterimages alive at once. A long blink recycles the oldest. */
const MAX_GHOSTS = 16;
/** Filaments in the streak, core included. */
const MAX_STRANDS = 6;
const TRAIL_NODES = 96;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _end = new Vector3();
const _out = new Vector3();
const _up = new Vector3(0, 1, 0);
const _dummy = new Object3D();

/**
 * Which blink currently has its hands on the character, if any.
 *
 * Module scope because ownership is a property of the *character*, not of a
 * cast: there is one body and possibly two blinks in flight (a re-cast inside
 * the cooldown, or two pooled instances). Whoever takes the body releases the
 * previous holder first, so exactly one blink ever has it hidden or squeezed,
 * and the saved scale it restores is always the body's real one.
 *
 * @type {BlinkStepAbility|null}
 */
let characterOwner = null;

/**
 * BLINK STEP — Movement, line cast.
 *
 * The one ability that moves the caster. The character is a
 * `CharacterController` whose `root` the App re-anchors the camera, the aim and
 * the contact shadow to every frame, so moving `character.position` is the
 * whole teleport: the camera glides after it on its own damping.
 *
 * ## Layers
 *
 *   1. **DEPARTURE** — streaks of light imploding onto the body from a shell
 *      round it, a crown of shards closing on it and then bursting outward
 *      once it is gone, a screen-space *pinch* (LAYER.DISTORTION) sucking the
 *      frame in, and the body itself squeezed to a sliver and hidden.
 *   2. **THE STREAK** (`createBlinkTrailMaterial`) — a camera-facing ribbon
 *      down the line with a white-hot head, a tapered, noise-torn tail, and
 *      filaments spiralling round the core; it retracts into the head on
 *      arrival.
 *   3. **AFTERIMAGES** (`createBlinkGhostMaterial`) — upright billboards with a
 *      procedural body SDF, dropped every `ghostSpacing` metres along the path:
 *      strobing, scan-lined, slice-torn, eaten by noise as they age.
 *   4. **SPARKS** — additive STREAK particles shed off the head.
 *   5. **ARRIVAL** — the body reforms with an overshoot, a crown of shards
 *      bursts out along the floor, an AIR pressure shell, a SHOCKWAVE and a
 *      DUSTRING, sparks and motes, a screen-space *bulge*, a light punch, a
 *      shake and a flash.
 *
 * Hits are the default line capsule: anything the streak runs through goes
 * down along the dash.
 *
 * ## The body
 *
 * The character is only touched while this blink *owns* it (`characterOwner`).
 * Taking it saves `root.scale` and `root.visible`; every way out — the reform
 * finishing, `destroy` (a clear, or the manager retiring the cast), or another
 * blink taking the body — goes through `_releaseCharacter`, which puts both
 * back exactly. The move to the end of the line happens once, on impact, and
 * only if this blink still owns the body; a blink cleared mid-transit leaves
 * the caster standing, visible, where it started — never hidden, never
 * half-way. Only x and z move; y stays 0.
 */
export class BlinkStepAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layer 2: the streak ---- */
    this.trailGeometry = createBoltRibbonGeometry(TRAIL_NODES, MAX_STRANDS);
    this.trailMaterial = createBlinkTrailMaterial();
    this.trail = new Mesh(this.trailGeometry, this.trailMaterial);
    this.trail.name = 'BlinkStreak';
    this.trail.layers.set(LAYER.VFX);
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 14;
    this.trail.visible = false;
    this.group.add(this.trail);
    this._trailState = { origin: new Vector3(), dir: new Vector3(), tail: 0, head: 0, fade: 1, seed: 0 };

    /* ---- layers 1 & 5: the shard crowns ---- */
    this.shardGeometry = createShardGeometry(7, 4);
    this.shardFade = new InstancedBufferAttribute(new Float32Array(MAX_SHARDS * 2), 1);
    this.shardGeometry.setAttribute('aFade', this.shardFade);
    this.shardMaterial = createBlinkShardMaterial();
    this.shards = new InstancedMesh(this.shardGeometry, this.shardMaterial, MAX_SHARDS * 2);
    this.shards.name = 'BlinkShards';
    this.shards.layers.set(LAYER.VFX);
    this.shards.frustumCulled = false;
    this.shards.renderOrder = 13;
    this.shards.count = 0;
    this.group.add(this.shards);

    /** Dice for one shard, shared by both crowns (each reads its own half). */
    this.shardDice = [];
    for (let i = 0; i < MAX_SHARDS * 2; i++) {
      this.shardDice.push({ angle: 0, height: 0, length: 1, width: 1, tilt: 0 });
    }

    /* ---- layer 3: afterimages ---- */
    // A unit quad with its foot on y = 0, so the instance translation is where
    // the figure stands.
    this.ghostGeometry = new PlaneGeometry(1, 1, 1, 1).translate(0, 0.5, 0);
    this.ghostAttribute = new InstancedBufferAttribute(new Float32Array(MAX_GHOSTS * 2), 2);
    this.ghostGeometry.setAttribute('aGhost', this.ghostAttribute);
    this.ghostMaterial = createBlinkGhostMaterial();
    this.ghosts = new InstancedMesh(this.ghostGeometry, this.ghostMaterial, MAX_GHOSTS);
    this.ghosts.name = 'BlinkGhosts';
    this.ghosts.layers.set(LAYER.VFX);
    this.ghosts.frustumCulled = false;
    this.ghosts.renderOrder = 12;
    this.ghosts.count = 0;
    this.group.add(this.ghosts);

    this.ghostRecords = [];
    for (let i = 0; i < MAX_GHOSTS; i++) {
      this.ghostRecords.push({ along: 0, born: -1, seed: 0 });
    }
    this._ghostCursor = 0;
    this._nextGhost = 0;
    this._departGhost = false;

    /* ---- the pinch and the bulge (screen-space warp) ---- */
    this.warpGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.pinchMaterial = createBlinkWarpMaterial();
    this.bulgeMaterial = createBlinkWarpMaterial();
    this.pinch = new Mesh(this.warpGeometry, this.pinchMaterial);
    this.bulge = new Mesh(this.warpGeometry, this.bulgeMaterial);
    for (const mesh of [this.pinch, this.bulge]) {
      mesh.layers.set(LAYER.DISTORTION);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
    }
    this._warpState = { size: 1, strength: 0, front: 0, sign: 1, seed: 0 };

    /* ---- the body ---- */
    this._owns = false;
    this._moved = false;
    this._savedScale = new Vector3(1, 1, 1);
    this._savedVisible = true;

    this._arriveAge = -1;
    this._seed = 0;
  }

  createParticles() {
    const particles = this.ctx.particles;

    /* ---- layer 1: the implosion ---- */
    // No drag, no gravity, and its speed and life scales are left at 1: each
    // streak is aimed to arrive on the body exactly as it dies, and any global
    // scaling of either would make the implosion overshoot or fall short.
    this.implode = particles.get('blink.implode', {
      capacity: 1200,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.implode.uniforms.uDrag.value = 0.0;
    this.implode.uniforms.uGravity.value.set(0, 0, 0);
    this.implode.uniforms.uEndSize.value = 0.25;
    this.implode.uniforms.uSizeIn.value = 0.15;
    this.implode.uniforms.uFadeIn.value = 0.2;
    this.implode.uniforms.uFadeOut.value = 0.2;
    this.implode.uniforms.uTurbulence.value = 0;

    /* ---- layer 4: sparks off the head, and out of the landing ---- */
    this.sparks = particles.get('blink.sparks', {
      capacity: 4000,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.2
    });
    this.sparks.uniforms.uDrag.value = 2.4;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.6;

    /* ---- layer 5: motes settling after the landing ---- */
    this.motes = particles.get('blink.motes', {
      capacity: 1500,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.3
    });
    this.motes.uniforms.uDrag.value = 1.8;
    this.motes.uniforms.uEndSize.value = 0.2;
    this.motes.uniforms.uSizeIn.value = 0.05;
    this.motes.uniforms.uFadeIn.value = 0.05;
    this.motes.uniforms.uFadeOut.value = 0.5;

    this.sparkEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  get instanceCount() {
    return this.shards.count + this.ghosts.count + (this.trail.visible ? this.trailGeometry.instanceCount : 0);
  }

  get impactDuration() {
    return Math.max(0.1, settings.blink.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings.blink.fadeTime * settings.global.lifetime);
  }

  /** A blink is a crack of light, not a flame: hard and steady. */
  lightShimmer() {
    return 1;
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

  /** Vanishing on the way out — 0 whole, 1 gone. */
  _vanish(c) {
    return saturate(this.age / Math.max(0.01, c.vanishTime));
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = settings.blink;
    const g = settings.global;

    this._seed = Math.random() * 100;
    this._arriveAge = -1;
    this._moved = false;
    this._ghostCursor = 0;
    this._departGhost = false;
    this._nextGhost = Math.max(0.2, c.ghostSpacing) * 0.5;
    this.sparkEmitter.reset();
    for (const ghost of this.ghostRecords) ghost.born = -1;

    for (const dice of this.shardDice) {
      dice.angle = Math.random() * TAU;
      dice.height = randRange(-1, 1);
      dice.length = 1 + randRange(-1, 1) * c.shardJitter * g.randomness;
      dice.width = 1 + randRange(-1, 1) * c.shardJitter * g.randomness;
      dice.tilt = randRange(-1, 1) * c.shardJitter * g.randomness;
    }

    this._takeCharacter();

    /* the implosion: streaks from a shell round the body, aimed to arrive on it */
    const time = frame.uTime.value;
    const count = Math.round(c.implodeCount * g.particleCount);
    const life = Math.max(0.03, c.implodeTime);
    const centreY = c.bodyHeight;
    for (let n = 0; n < count; n++) {
      // Upper hemisphere, flattened: light is gathered from round the body,
      // not out of the floor.
      _dir.set(randRange(-1, 1), randRange(-0.35, 1), randRange(-1, 1));
      if (_dir.lengthSq() < 1e-4) _dir.set(1, 0, 0);
      _dir.normalize();
      const r = c.implodeRadius * randRange(0.75, 1.15);
      _pos.copy(this.origin).addScaledVector(_dir, r);
      _pos.y += centreY;
      _out.copy(_dir).negate();
      _emit.position = _pos;
      _emit.radius = 0;
      _emit.direction = _out;
      _emit.speed = r / life;
      _emit.speedVariance = 0;
      _emit.spread = 0;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.1;
      _emit.sizeVariance = 0.5;
      _emit.life = life;
      _emit.lifeVariance = 0;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = time;
      this.implode.emit(1, _emit);
    }

    this.ctx.shake.add(c.departShake * g.cameraShake, 7, 18);
    this._sync();
    this._updateDeparture(c);
  }

  /* ------------------------------------------------------------------ */
  /* Per frame                                                           */
  /* ------------------------------------------------------------------ */

  _sync() {
    const c = settings.blink;
    const g = settings.global;

    this.shardMaterial.userData.sync();
    this.ghostMaterial.userData.sync();

    this.implode.setGradient(
      getColor(c.colorImplodeA),
      getColor(c.colorImplodeB),
      getColor(c.colorImplodeC),
      getColor(c.colorImplodeD)
    );
    this.implode.uniforms.uSizeScale.value = c.implodeSize * g.particleSize * 7;
    this.implode.uniforms.uOpacity.value = g.opacity;
    this.implode.uniforms.uGlow.value = c.implodeGlow * g.glow;
    this.implode.uniforms.uStretch.value = c.implodeStretch;

    this.sparks.setGradient(
      getColor(c.colorSparkA),
      getColor(c.colorSparkB),
      getColor(c.colorSparkC),
      getColor(c.colorSparkD)
    );
    this.sparks.uniforms.uGravity.value.set(0, -1.5, 0);
    this.sparks.uniforms.uSizeScale.value = c.sparkSize * g.particleSize * 7;
    this.sparks.uniforms.uLifeScale.value = g.particleLifetime;
    this.sparks.uniforms.uSpeedScale.value = g.particleSpeed;
    this.sparks.uniforms.uOpacity.value = g.opacity;
    this.sparks.uniforms.uGlow.value = c.sparkGlow * g.glow;
    this.sparks.uniforms.uStretch.value = c.sparkStretch;
    this.sparks.uniforms.uTurbulence.value = 0.25 * g.turbulence;

    this.motes.setGradient(
      getColor(c.colorMoteA),
      getColor(c.colorMoteB),
      getColor(c.colorMoteC),
      getColor(c.colorMoteD)
    );
    this.motes.uniforms.uGravity.value.set(0, c.moteRise, 0);
    this.motes.uniforms.uSizeScale.value = c.moteSize * g.particleSize * 7;
    this.motes.uniforms.uLifeScale.value = g.particleLifetime;
    this.motes.uniforms.uSpeedScale.value = g.particleSpeed;
    this.motes.uniforms.uOpacity.value = g.opacity;
    this.motes.uniforms.uGlow.value = c.moteGlow * g.glow;
    this.motes.uniforms.uTurbulence.value = 0.7 * g.turbulence;
  }

  /**
   * The body and the departure crown, both keyed off `age` so they keep
   * running through every phase.
   */
  _updateDeparture(c) {
    const vanish = this._vanish(c);

    /* --- the body squeezes to a sliver, then goes --- */
    if (!this._moved) {
      const k = Easing.inCubic(vanish);
      this._shapeBody(lerp(1, c.squeeze, k), lerp(1, c.stretch, k), vanish < 1);
    }

    /* --- the pinch --- */
    const pt = saturate(this.age / Math.max(0.02, c.pinchTime));
    const state = this._warpState;
    state.size = c.pinchSize;
    state.strength = c.pinchStrength * Math.sin(pt * Math.PI);
    state.front = lerp(0.95, 0.05, Easing.inQuad(pt));
    state.sign = -1;
    state.seed = this._seed;
    this.pinchMaterial.userData.sync(state);
    this.pinch.visible = pt < 1;
    this.pinch.position.copy(this.origin).setY(c.bodyHeight);
  }

  /**
   * Lay out both crowns: the departure ring closing on the body and bursting
   * once it is gone, and — after impact — the arrival ring thrown along the
   * floor. Everything resolved from the live settings.
   */
  _updateShards(c) {
    const count = Math.min(MAX_SHARDS, Math.max(0, Math.round(c.shardCount)));
    const fade = this.shardFade.array;
    const vanish = this._vanish(c);
    const burstT = (this.age - c.vanishTime) / Math.max(0.02, c.crownLife);
    const spin = this.age * c.crownSpin;

    /* --- departure --- */
    for (let i = 0; i < MAX_SHARDS; i++) {
      const dice = this.shardDice[i];
      if (i >= count || burstT >= 1) {
        this._parkShard(i);
        fade[i] = 0;
        continue;
      }
      const angle = (i / Math.max(1, count)) * TAU + dice.angle * 0.15 + spin;
      _dir.set(Math.cos(angle), dice.height * 0.25, Math.sin(angle)).normalize();

      let radius;
      let alpha;
      let inward;
      if (burstT < 0) {
        radius = c.crownRadius * lerp(1, c.crownClose, Easing.inCubic(vanish));
        alpha = smoothstep(0, 0.35, vanish);
        inward = true;
      } else {
        radius = lerp(c.crownRadius * c.crownClose, c.crownBurst, Easing.outCubic(burstT));
        alpha = 1 - Easing.inQuad(burstT);
        inward = false;
      }

      _pos.copy(this.origin).addScaledVector(_dir, radius);
      _pos.y += c.bodyHeight;
      // Tips toward the body while closing, away from it once it bursts.
      _out.copy(_dir).multiplyScalar(inward ? -1 : 1);
      _out.y += dice.tilt * 0.3;
      this._placeShard(i, _pos, _out.normalize(), dice, c);
      fade[i] = alpha;
    }

    /* --- arrival --- */
    const t = this._arriveAge < 0 ? -1 : this._arriveAge / Math.max(0.02, c.crownLife);
    this.pointAt(1, _end);
    for (let i = 0; i < MAX_SHARDS; i++) {
      const slot = MAX_SHARDS + i;
      const dice = this.shardDice[slot];
      if (i >= count || t < 0 || t >= 1) {
        this._parkShard(slot);
        fade[slot] = 0;
        continue;
      }
      const angle = (i / Math.max(1, count)) * TAU + dice.angle * 0.2;
      const radius = lerp(0.2, c.arrivalRadius, Easing.outCubic(t));
      _dir.set(Math.cos(angle), 0, Math.sin(angle));
      _pos.copy(_end).addScaledVector(_dir, radius);
      _pos.y = 0.05;
      const tilt = c.arrivalTilt + dice.tilt * 0.25;
      _out.copy(_dir).multiplyScalar(Math.cos(tilt));
      _out.y = Math.sin(tilt);
      this._placeShard(slot, _pos, _out.normalize(), dice, c);
      fade[slot] = 1 - Easing.inQuad(t);
    }

    this.shards.count = MAX_SHARDS * 2;
    this.shards.instanceMatrix.needsUpdate = true;
    this.shardFade.needsUpdate = true;
  }

  /** One shard at `at`, its tip along `along` (unit). */
  _placeShard(slot, at, along, dice, c) {
    _dummy.position.copy(at);
    _dummy.quaternion.setFromUnitVectors(_up, along);
    _dummy.scale.set(c.shardWidth * dice.width, c.shardLength * dice.length, c.shardWidth * dice.width);
    _dummy.updateMatrix();
    this.shards.setMatrixAt(slot, _dummy.matrix);
  }

  _parkShard(slot) {
    _dummy.position.set(0, -999, 0);
    _dummy.quaternion.identity();
    _dummy.scale.setScalar(0.0001);
    _dummy.updateMatrix();
    this.shards.setMatrixAt(slot, _dummy.matrix);
  }

  /** The streak, from wherever its tail is to wherever its head is. */
  _updateTrail(fade) {
    const c = settings.blink;
    const state = this._trailState;
    let head = this.front;
    let tail = Math.max(0, head - c.trailLength);

    if (this._arriveAge >= 0) {
      head = this.length;
      const r = saturate(this._arriveAge / Math.max(0.02, c.trailRetract));
      // The tail runs up into the head: the light arriving *is* the body.
      tail = lerp(Math.max(0, this.length - c.trailLength), this.length, Easing.inCubic(r));
    }

    state.origin.copy(this.origin);
    state.dir.copy(this.direction);
    state.head = head;
    state.tail = tail;
    state.fade = fade;
    state.seed = this._seed;
    this.trailMaterial.userData.sync(state);

    this.trailGeometry.instanceCount = 1 + Math.min(MAX_STRANDS - 1, Math.max(0, Math.round(c.trailStrands)));
    this.trail.visible = fade > 0.001 && head - tail > 0.01;
  }

  /** Drop afterimages as the head passes, and age the ones standing. */
  _updateGhosts() {
    const c = settings.blink;
    const spacing = Math.max(0.2, c.ghostSpacing);
    const life = Math.max(0.05, c.ghostLife);

    // One where the body vanished, once it has.
    if (this._vanish(c) >= 1 && !this._departGhost) {
      this._departGhost = true;
      this._dropGhost(0);
    }
    while (this.phase === AbilityPhase.TRAVEL && this.front >= this._nextGhost && this._nextGhost < this.length) {
      this._dropGhost(this._nextGhost);
      this._nextGhost += spacing;
    }

    const data = this.ghostAttribute.array;
    let drawn = 0;
    for (let i = 0; i < MAX_GHOSTS; i++) {
      const ghost = this.ghostRecords[i];
      const age = ghost.born < 0 ? 1 : (this.age - ghost.born) / life;
      if (age >= 1) {
        _dummy.position.set(0, -999, 0);
        data[i * 2] = 1;
      } else {
        this.pointAt(ghost.along / Math.max(0.1, this.length), _dummy.position);
        _dummy.position.y = 0;
        data[i * 2] = Math.max(0, age);
        drawn = i + 1;
      }
      data[i * 2 + 1] = ghost.seed;
      _dummy.quaternion.identity();
      _dummy.scale.setScalar(1);
      _dummy.updateMatrix();
      this.ghosts.setMatrixAt(i, _dummy.matrix);
    }

    // The dash direction, so every afterimage leans into the move whichever
    // side of the line the camera is on.
    this.ghostMaterial.uniforms.uDir.value.copy(this.direction);
    this.ghosts.count = drawn;
    this.ghosts.instanceMatrix.needsUpdate = true;
    this.ghostAttribute.needsUpdate = true;
  }

  _dropGhost(along) {
    const ghost = this.ghostRecords[this._ghostCursor];
    this._ghostCursor = (this._ghostCursor + 1) % MAX_GHOSTS;
    ghost.along = along;
    ghost.born = this.age;
    ghost.seed = Math.random();
  }

  /** The bulge at the far end, after impact. */
  _updateBulge(c) {
    if (this._arriveAge < 0) {
      this.bulge.visible = false;
      return;
    }
    const t = saturate(this._arriveAge / Math.max(0.02, c.bulgeTime));
    const state = this._warpState;
    state.size = c.bulgeSize;
    state.strength = c.bulgeStrength * (1 - t) * smoothstep(0, 0.1, t);
    state.front = lerp(0.1, 0.95, Easing.outCubic(t));
    state.sign = 1;
    state.seed = this._seed + 7;
    this.bulgeMaterial.userData.sync(state);
    this.bulge.visible = t < 1;
    this.pointAt(1, this.bulge.position).setY(c.bodyHeight);
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.blink;
    const g = settings.global;

    this._sync();
    this._updateDeparture(c);
    this._updateShards(c);
    this._updateTrail(1);
    this._updateGhosts();
    this._updateBulge(c);

    // The light and the camera ride the head.
    this.position.y = c.bodyHeight;

    const count = Math.round(this.sparkEmitter.tick(dt, c.sparkRate) * g.particleCount);
    if (count > 0) {
      _emit.position = _pos.copy(this.position);
      _emit.radius = c.trailWidth;
      _emit.direction = _dir.copy(this.direction).negate();
      _emit.speed = c.sparkSpeed;
      _emit.speedVariance = 0.6;
      _emit.spread = c.sparkSpread;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = 0.1;
      _emit.sizeVariance = 0.5;
      _emit.life = c.sparkLifetime;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.sparks.emit(count, _emit);
    }
  }

  onImpact() {
    const c = settings.blink;
    const g = settings.global;
    const time = frame.uTime.value;
    this._arriveAge = 0;
    this.pointAt(1, _end);

    /* --- the move itself: x/z only, and only if the body is still ours --- */
    if (this._owns && !this._moved) {
      const character = this.ctx.character;
      character.position.x = _end.x;
      character.position.z = _end.z;
      character.position.y = 0;
      character.setFacing?.(Math.atan2(this.direction.x, this.direction.z));
    }
    this._moved = true;
    this._shapeBody(c.squeeze, c.stretch, true);

    /* --- the landing --- */
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _end, {
      radius: c.decalRadius * g.explosionIntensity,
      life: c.decalLife,
      width: 0.07,
      intensity: 1.0,
      colorA: getColor(c.colorDecalA),
      colorB: getColor(c.colorDecalB)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _end, {
      radius: c.dustRadius,
      life: c.dustLife,
      intensity: 0.7,
      colorA: getColor(c.colorDust),
      colorB: getColor(c.colorDust)
    });

    _pos.copy(_end).setY(c.bodyHeight * 0.8);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: 0.3,
      endRadius: c.arrivalBurst * g.explosionIntensity,
      life: c.arrivalBurstLife,
      intensity: c.arrivalBurstIntensity,
      opacity: 0.7,
      fresnel: 2.0,
      squash: 0.75,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });

    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _dir.set(0, 0.35, 0).addScaledVector(this.direction, 0.2).normalize();
    _emit.speed = c.arrivalSparkSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 1.0;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.11;
    _emit.sizeVariance = 0.5;
    _emit.life = c.sparkLifetime * 1.5;
    _emit.lifeVariance = 0.4;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = time;
    this.sparks.emit(Math.round(c.arrivalSparks * g.particleCount), _emit);

    _emit.radius = 0.6;
    _emit.direction = _dir.set(0, 1, 0);
    _emit.speed = 1.2;
    _emit.size = 0.08;
    _emit.life = c.moteLifetime;
    this.motes.emit(Math.round(c.arrivalMotes * g.particleCount), _emit);

    this.ctx.shake.add(
      c.impactShake * g.explosionIntensity * g.cameraShake,
      1 / Math.max(0.05, c.shakeDuration),
      20
    );
    this.ctx.flash.trigger(getColor(c.colorFlash), c.impactFlash * g.explosionIntensity);
    this.lightBoost = c.lightIntensity * c.lightBoost * g.explosionIntensity;
  }

  onFade(dt) {
    const c = settings.blink;
    this._arriveAge += dt;

    /* --- the body reforms, overshooting, then is handed back whole --- */
    if (this._owns) {
      const r = saturate(this._arriveAge / Math.max(0.02, c.reformTime));
      if (r >= 1) {
        this._releaseCharacter();
      } else {
        const ov = Math.max(0, c.reformOvershoot);
        const x = r - 1;
        const k = 1 + (ov + 1) * x * x * x + ov * x * x; // outBack, tunable
        this._shapeBody(lerp(c.squeeze, 1, k), lerp(c.stretch, 1, k), true);
      }
    }

    const fade =
      this.phase === AbilityPhase.FADE ? 1 - Easing.inQuad(saturate(this.fadeTime / this.fadeDuration)) : 1;

    this._sync();
    this._updateDeparture(c);
    this._updateShards(c);
    this._updateTrail(fade);
    this._updateGhosts();
    this._updateBulge(c);

    this.pointAt(1, this.position);
    this.position.y = c.bodyHeight;
  }

  onDestroy() {
    // First, always: whatever state the cast is in, the body goes back.
    this._releaseCharacter();
    this._arriveAge = -1;
    this._departGhost = false;
    this.trail.visible = false;
    this.shards.count = 0;
    this.ghosts.count = 0;
    this.pinch.visible = false;
    this.bulge.visible = false;
    for (const ghost of this.ghostRecords) ghost.born = -1;
  }

  dispose() {
    this._releaseCharacter();
    this.trailGeometry.dispose();
    this.trailMaterial.dispose();
    this.shardGeometry.dispose();
    this.shards.dispose();
    this.shardMaterial.dispose();
    this.ghostGeometry.dispose();
    this.ghosts.dispose();
    this.ghostMaterial.dispose();
    this.warpGeometry.dispose();
    this.pinchMaterial.dispose();
    this.bulgeMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('⇢  Blink Step');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 3, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 4, 120, 0.5, 'streak speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 4, 0.01, 'arrival plays for');
  R(cast, c, 'fadeTime', 0.05, 3, 0.01, 'fade out');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  Editor.castAnimation(cast, c);

  const body = folder.addFolder('The body');
  R(body, c, 'vanishTime', 0.01, 1, 0.005, 'vanish time');
  R(body, c, 'reformTime', 0.02, 1.5, 0.005, 'reform time');
  R(body, c, 'squeeze', 0.01, 1, 0.01, 'squeezed width');
  R(body, c, 'stretch', 0.5, 3, 0.01, 'squeezed height');
  R(body, c, 'reformOvershoot', 0, 4, 0.05, 'reform overshoot');
  R(body, c, 'bodyHeight', 0.1, 2.5, 0.01, 'streak height (m)');

  const depart = folder.addFolder('1 · Departure');
  R(depart, c, 'implodeCount', 0, 400, 1, 'implosion streaks');
  R(depart, c, 'implodeRadius', 0.2, 6, 0.05, 'start radius (m)');
  R(depart, c, 'implodeTime', 0.03, 1, 0.005, 'arrive over (s)');
  R(depart, c, 'implodeSize', 0.01, 0.4, 0.005, 'size');
  R(depart, c, 'implodeStretch', 0, 1, 0.01, 'stretch');
  R(depart, c, 'implodeGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(depart, c, 'colorImplode', 'implosion colour');
  R(depart, c, 'pinchStrength', 0, 3, 0.01, 'pinch strength');
  R(depart, c, 'pinchSize', 0.2, 8, 0.05, 'pinch size (m)');
  R(depart, c, 'pinchTime', 0.02, 1.5, 0.01, 'pinch time');
  R(depart, c, 'departShake', 0, 1, 0.01, 'shake');

  const shards = folder.addFolder('Shard crowns');
  R(shards, c, 'shardCount', 0, MAX_SHARDS, 1, 'shards per crown');
  R(shards, c, 'shardLength', 0.05, 2, 0.01, 'length (m)');
  R(shards, c, 'shardWidth', 0.01, 0.5, 0.005, 'width (m)');
  R(shards, c, 'shardJitter', 0, 1, 0.01, 'jitter');
  R(shards, c, 'crownRadius', 0.1, 4, 0.01, 'departure radius (m)');
  R(shards, c, 'crownClose', 0, 1, 0.01, 'closes to (× radius)');
  R(shards, c, 'crownBurst', 0.1, 8, 0.05, 'bursts out to (m)');
  R(shards, c, 'crownLife', 0.05, 2, 0.01, 'burst life');
  R(shards, c, 'crownSpin', -10, 10, 0.05, 'spin (rad/s)');
  R(shards, c, 'arrivalRadius', 0.2, 8, 0.05, 'arrival radius (m)');
  R(shards, c, 'arrivalTilt', 0, 1.5, 0.01, 'arrival tilt (rad)');
  R(shards, c, 'shardGlow', 0, 8, 0.05, 'glow');
  R(shards, c, 'shardFresnel', 0, 6, 0.05, 'fresnel');
  R(shards, c, 'shardFresnelPower', 0.5, 8, 0.05, 'fresnel power');
  R(shards, c, 'shardOpacity', 0, 1, 0.01, 'opacity');
  shards.addColor(c, 'colorShardCore').name('core');
  shards.addColor(c, 'colorShardEdge').name('edge');
  shards.addColor(c, 'colorShardDeep').name('deep');

  const trail = folder.addFolder('2 · The streak');
  R(trail, c, 'trailWidth', 0.01, 1, 0.005, 'width (m)');
  R(trail, c, 'trailTailWidth', 0, 2, 0.01, 'tail width (× head)');
  R(trail, c, 'trailLength', 0.5, 40, 0.1, 'tail length (m)');
  R(trail, c, 'trailTaper', 0.1, 5, 0.05, 'taper');
  R(trail, c, 'trailFalloff', 0.1, 6, 0.05, 'tail falloff');
  R(trail, c, 'trailHeadGlow', 0, 10, 0.05, 'head glow');
  R(trail, c, 'trailHeadSize', 0.05, 4, 0.01, 'head size (m)');
  R(trail, c, 'trailGlow', 0, 10, 0.05, 'glow');
  R(trail, c, 'trailNoise', 0, 1, 0.01, 'tearing');
  R(trail, c, 'trailNoiseScale', 0.05, 6, 0.01, 'tear scale');
  R(trail, c, 'trailNoiseSpeed', 0, 15, 0.05, 'tear speed');
  R(trail, c, 'trailCore', 0.02, 1, 0.01, 'core width');
  R(trail, c, 'trailStrands', 0, MAX_STRANDS - 1, 1, 'filaments');
  R(trail, c, 'trailSpiral', 0, 1, 0.005, 'filament spiral (m)');
  R(trail, c, 'trailTwist', 0, 6, 0.05, 'turns per metre');
  R(trail, c, 'trailStrandWidth', 0.05, 1, 0.01, 'filament width');
  R(trail, c, 'trailRetract', 0.02, 2, 0.01, 'retract on arrival');
  R(trail, c, 'trailOpacity', 0, 1, 0.01, 'opacity');
  trail.addColor(c, 'colorTrailCore').name('core');
  trail.addColor(c, 'colorTrailMid').name('body');
  trail.addColor(c, 'colorTrailEdge').name('edge');
  trail.addColor(c, 'colorTrailTail').name('tail');

  const ghosts = folder.addFolder('3 · Afterimages');
  R(ghosts, c, 'ghostSpacing', 0.3, 10, 0.05, 'spacing (m)');
  R(ghosts, c, 'ghostLife', 0.05, 2, 0.01, 'life');
  R(ghosts, c, 'ghostHeight', 0.3, 3, 0.01, 'height (m)');
  R(ghosts, c, 'ghostWidth', 0.3, 1.5, 0.01, 'width (× height)');
  R(ghosts, c, 'ghostGlow', 0, 8, 0.05, 'glow');
  R(ghosts, c, 'ghostOpacity', 0, 1, 0.01, 'opacity');
  R(ghosts, c, 'ghostEdge', 0, 3, 0.01, 'outline');
  R(ghosts, c, 'ghostFill', 0, 2, 0.01, 'fill');
  R(ghosts, c, 'ghostFlicker', 0, 1, 0.01, 'flicker');
  R(ghosts, c, 'ghostFlickerRate', 1, 80, 0.5, 'flicker rate');
  R(ghosts, c, 'ghostGlitch', 0, 0.3, 0.005, 'slice tearing');
  R(ghosts, c, 'ghostSlices', 1, 60, 1, 'slices');
  R(ghosts, c, 'ghostScan', 0, 200, 1, 'scanlines');
  R(ghosts, c, 'ghostDissolve', 0, 2, 0.01, 'dissolve');
  ghosts.addColor(c, 'colorGhostCore').name('core');
  ghosts.addColor(c, 'colorGhostEdge').name('edge');

  const sparks = folder.addFolder('4 · Sparks');
  R(sparks, c, 'sparkRate', 0, 1000, 1, 'per second');
  R(sparks, c, 'sparkSize', 0.01, 0.4, 0.005, 'size');
  R(sparks, c, 'sparkSpeed', 0, 15, 0.1, 'speed');
  R(sparks, c, 'sparkSpread', 0, 1.5, 0.01, 'spread');
  R(sparks, c, 'sparkLifetime', 0.05, 2, 0.01, 'lifetime');
  R(sparks, c, 'sparkStretch', 0, 2, 0.01, 'stretch');
  R(sparks, c, 'sparkGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(sparks, c, 'colorSpark', 'spark colour');

  const arrive = folder.addFolder('5 · Arrival');
  R(arrive, c, 'arrivalBurst', 0.1, 8, 0.05, 'pressure shell (m)');
  R(arrive, c, 'arrivalBurstLife', 0.05, 2, 0.01, 'shell life');
  R(arrive, c, 'arrivalBurstIntensity', 0, 6, 0.05, 'shell intensity');
  arrive.addColor(c, 'colorBurstA').name('shell core');
  arrive.addColor(c, 'colorBurstB').name('shell body');
  arrive.addColor(c, 'colorBurstC').name('shell edge');
  R(arrive, c, 'decalRadius', 0.1, 8, 0.05, 'shock ring (m)');
  R(arrive, c, 'decalLife', 0.05, 3, 0.01, 'shock ring life');
  arrive.addColor(c, 'colorDecalA').name('ring');
  arrive.addColor(c, 'colorDecalB').name('ring, hot');
  R(arrive, c, 'dustRadius', 0, 6, 0.05, 'dust ring (m)');
  R(arrive, c, 'dustLife', 0.05, 4, 0.05, 'dust life');
  arrive.addColor(c, 'colorDust').name('dust');
  R(arrive, c, 'arrivalSparks', 0, 300, 1, 'sparks');
  R(arrive, c, 'arrivalSparkSpeed', 0, 20, 0.1, 'spark speed');
  R(arrive, c, 'arrivalMotes', 0, 300, 1, 'motes');
  R(arrive, c, 'moteSize', 0.01, 0.3, 0.005, 'mote size');
  R(arrive, c, 'moteLifetime', 0.1, 4, 0.05, 'mote lifetime');
  R(arrive, c, 'moteRise', -2, 4, 0.05, 'mote rise');
  R(arrive, c, 'moteGlow', 0, 8, 0.05, 'mote glow');
  Editor.gradient(arrive, c, 'colorMote', 'mote colour');
  R(arrive, c, 'bulgeStrength', 0, 3, 0.01, 'bulge strength');
  R(arrive, c, 'bulgeSize', 0.2, 10, 0.05, 'bulge size (m)');
  R(arrive, c, 'bulgeTime', 0.02, 1.5, 0.01, 'bulge time');
  R(arrive, c, 'impactShake', 0, 1.5, 0.01, 'shake');
  R(arrive, c, 'shakeDuration', 0.05, 2, 0.01, 'shake settles over');
  R(arrive, c, 'impactFlash', 0, 1, 0.01, 'flash');
  arrive.addColor(c, 'colorFlash').name('flash');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 40, 0.1, 'radius');
  R(light, c, 'lightBoost', 0, 6, 0.05, 'arrival punch (× intensity)');
}
