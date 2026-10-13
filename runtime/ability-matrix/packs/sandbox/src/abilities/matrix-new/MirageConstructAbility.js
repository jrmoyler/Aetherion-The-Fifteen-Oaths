import {
  AnimationMixer,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LoopRepeat,
  Mesh,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3
} from 'three';
import { clone as cloneRigged } from 'three/addons/utils/SkeletonUtils.js';
import { Ability, AbilityPhase } from '../Ability.js';
import {
  createMirageBodyMaterial,
  createMiragePoolMaterial,
  createMirageShardMaterial,
  createMirageHazeMaterial,
  createMirageShockMaterial
} from '../../materials/matrix-new/MirageConstructMaterials.js';
import { createMirageFigureGeometry } from '../../assets/matrix-new/MirageConstructGeometry.js';
import { createShardGeometry } from '../../assets/ProceduralGeometry.js';
import { ParticleShape } from '../../particles/ParticleSystem.js';
import { RateEmitter } from '../../particles/ParticleEngine.js';
import { DecalType } from '../../effects/GroundDecals.js';
import { BurstMode } from '../../effects/BurstSphere.js';
import { LAYER } from '../../core/Layers.js';
import { frame } from '../../core/FrameUniforms.js';
import { settings } from '../../config/settings.js';
import { getColor } from '../../utils/color.js';
import { saturate, lerp, Easing, randRange } from '../../utils/math.js';

export const ID = 'mirage';

/** Hard ceiling on burst shards; the editor's count slider clamps to it. */
const MAX_SHARDS = 48;
/** Chromatic afterimages trailing the copy. */
const AFTERIMAGES = 2;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _feet = new Vector3();
const _right = new Vector3();
const _back = new Vector3();
const _up = new Vector3(0, 1, 0);
const _node = new Object3D();
const _spin = new Quaternion();

/**
 * MIRAGE CONSTRUCT — Illusion, zone cast.
 *
 * A stream of light runs from the caster's hand to the circle, and where it
 * lands a spectral copy of the caster *assembles from the feet up*, stands in
 * the circle breathing its own idle — out of step with you, because it is not
 * you — flickers, gathers, and bursts into shards of light that take everything
 * in the circle down with them.
 *
 * ## Layers
 *
 *   1. **THE COPY** (`createMirageBodyMaterial`) — the caster's own skinned rig,
 *      cloned once with `SkeletonUtils.clone` and driven by its own
 *      `AnimationMixer` playing the caster's idle clip. The ghost shader: a
 *      fresnel rim, interference bands rolling up the body with R/B phase-split
 *      against G (the chromatic fringe), a strobe, slice tearing in the vertex
 *      stage, a noise-fronted assembly seam climbing from the feet, and the
 *      erosion that takes it apart on the burst.
 *   2. **AFTERIMAGES** — two more draws of the same skinned meshes (sharing the
 *      clone's skeleton, so they cost no extra animation), offset either side
 *      across the view and drifting behind it, tinted magenta and cyan: the
 *      copy is never quite in register with itself.
 *   3. **THE MIRAGE POOL** (`createMiragePoolMaterial`) — iridescent rings of
 *      interference running outward across the floor, bent by a heat shimmer,
 *      flaring on the burst.
 *   4. **HEAT HAZE** (LAYER.DISTORTION) — a column of air rising off the copy
 *      while it stands; the burst's double-fronted shock ring after.
 *   5. **MOTES** — curling specks drifting up off the body while it stands,
 *      and the stream that carries the projection out to the circle.
 *   6. **THE BURST** — 48 instanced shards of light thrown off the body under
 *      drag and gravity (positions solved in closed form from their dice, so
 *      every slider is live mid-flight), streak sparks, an AIR pressure shell,
 *      a SHOCKWAVE ring and a DUSTRING, a flash, a light punch and a shake —
 *      and every dummy inside the circle killed (`handlesOwnHits`).
 *
 * ## The clone
 *
 * Built once, at construction, from `ctx.character.model`. The clone shares
 * the caster's geometry (never disposed here) but owns its bones, its
 * skeleton and its mixer, and every mesh in it is moved to LAYER.VFX with the
 * ghost material, so it stays out of the depth prepass, the shadow map and the
 * contact-shadow pass. If the character has not loaded when the instance is
 * built (the pools prewarm after it has, so this is the edge case) the clone
 * is retried on the next spawn; if there is still no character, a procedural
 * capsule figure (`createMirageFigureGeometry`) stands in so the cast still
 * has a body to assemble and burst.
 *
 * ## The editor rule
 *
 * A shard record stores only dice — a bearing, a height on the body, unitless
 * jitters. Where it is, how fast it flies, how long it lives, how big it is,
 * are all resolved from `settings.mirage` every frame from the time since the
 * burst. The copy's assembly front, charge and breakup are likewise derived
 * from the cast's own clock each frame, never stored.
 */
export class MirageConstructAbility extends Ability {
  constructor(context) {
    super(ID, context);
  }

  /** The burst picks its victims, at the moment it bursts. */
  get handlesOwnHits() {
    return true;
  }

  get instanceCount() {
    return this.shards.count;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    /* ---- layers 1 & 2: the copy and its afterimages ---- */
    this.bodyMaterial = createMirageBodyMaterial(false);
    this.afterMaterials = [];
    for (let i = 0; i < AFTERIMAGES; i++) this.afterMaterials.push(createMirageBodyMaterial(true));

    /** Holds whichever body is built; placed at the circle each frame. */
    this.copyRoot = new Group();
    this.copyRoot.name = 'MirageCopy';
    this.copyRoot.layers.set(LAYER.VFX);
    this.copyRoot.visible = false;
    this.group.add(this.copyRoot);

    /** The cloned rig, its mixer and idle — or null until built. */
    this.clone = null;
    this.mixer = null;
    this.idleAction = null;
    /** The afterimage draws, one list per afterimage. */
    this.afterMeshes = [[], []];
    /** The procedural stand-in, only built if the clone cannot be. */
    this.figure = null;
    this.figureGeometry = null;
    /** The rig's own forward yaw in model space (0 for the figure). */
    this._forwardYaw = 0;
    this._buildBody();

    /* ---- layer 3: the pool ---- */
    this.groundGeometry = new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    this.poolMaterial = createMiragePoolMaterial();
    this.pool = new Mesh(this.groundGeometry, this.poolMaterial);
    this.pool.name = 'MiragePool';
    this.pool.layers.set(LAYER.VFX);
    this.pool.renderOrder = 4;
    this.pool.frustumCulled = false;
    this.pool.visible = false;
    this.group.add(this.pool);

    /* ---- layer 4: haze & shock ---- */
    this.warpGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.hazeMaterial = createMirageHazeMaterial();
    this.haze = new Mesh(this.warpGeometry, this.hazeMaterial);
    this.shockMaterial = createMirageShockMaterial();
    this.shock = new Mesh(this.warpGeometry, this.shockMaterial);
    for (const mesh of [this.haze, this.shock]) {
      mesh.layers.set(LAYER.DISTORTION);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
    }

    /* ---- layer 6: shards ---- */
    this.shardGeometry = createShardGeometry(11, 5);
    this.shardFade = new InstancedBufferAttribute(new Float32Array(MAX_SHARDS), 1);
    this.shardGeometry.setAttribute('aFade', this.shardFade);
    this.shardMaterial = createMirageShardMaterial();
    this.shards = new InstancedMesh(this.shardGeometry, this.shardMaterial, MAX_SHARDS);
    this.shards.name = 'MirageShards';
    this.shards.layers.set(LAYER.VFX);
    this.shards.frustumCulled = false;
    this.shards.renderOrder = 13;
    this.shards.count = 0;
    this.group.add(this.shards);

    /** Dice only; everything else is resolved per frame. */
    this.shardDice = [];
    for (let i = 0; i < MAX_SHARDS; i++) {
      this.shardDice.push({ bearing: 0, height: 0, lift: 0, speed: 0, life: 0, size: 0, spin: 0, phase: 0 });
    }

    /* ---- cast state ---- */
    this._seed = 0;
    /** Seconds since the projection landed; -1 while it travels. */
    this._stand = -1;
    /** Seconds since the burst; -1 before it. */
    this._burst = -1;
    this._yaw = 0;
    this._poolFlare = 0;
    this._found = [];
    this._force = { impulse: 0, lift: 0, spin: 0 };

    this._bodyState = { root: new Vector3(), offset: new Vector3(), form: 0, breakup: 0, charge: 0, seed: 0, tint: null, opacity: 1 };
    this._poolState = { quadSize: 6, radius: 0, fade: 1, flare: 0, seed: 0 };
    this._hazeState = { strength: 0, seed: 0 };
    this._shockState = { strength: 0, front: 0, seed: 0 };
  }

  /**
   * Clone the caster, or — if there is no caster yet — stand the figure in.
   * Safe to call again: it only ever upgrades from the figure to the clone.
   */
  _buildBody() {
    if (this.clone) return;
    const character = this.ctx.character;
    const source = character?.model;
    if (source) {
      try {
        this._buildClone(character, source);
        if (this.figure) this.figure.visible = false;
        return;
      } catch (error) {
        // A rig SkeletonUtils cannot walk: fall back rather than crash a pool.
        console.warn('[MirageConstruct] could not clone the caster; using the stylised figure', error);
        this.clone = null;
      }
    }
    if (!this.figure) this._buildFigure();
  }

  _buildClone(character, source) {
    const clone = cloneRigged(source);
    clone.name = 'MirageRig';
    const afterLists = this.afterMeshes;
    const originals = [];
    clone.traverse((node) => {
      node.layers.set(LAYER.VFX);
      if (node.isMesh || node.isSkinnedMesh) originals.push(node);
    });

    for (const node of originals) {
      node.castShadow = false;
      node.receiveShadow = false;
      node.frustumCulled = false;
      node.renderOrder = 11;
      node.material = this._ghostSlot(node.material, this.bodyMaterial);

      // Afterimages: the same mesh drawn again on the same skeleton. A
      // SkinnedMesh clone keeps its source's skeleton and bind matrix, and
      // parented beside it its matrixWorld is identical, so it is posed for free.
      for (let a = 0; a < AFTERIMAGES; a++) {
        const twin = node.clone(false);
        twin.material = this._ghostSlot(node.material, this.afterMaterials[a]);
        twin.layers.set(LAYER.VFX);
        twin.renderOrder = 10;
        twin.frustumCulled = false;
        node.parent.add(twin);
        afterLists[a].push(twin);
      }
    }

    this.copyRoot.add(clone);
    this.clone = clone;

    this.mixer = new AnimationMixer(clone);
    const clip = character.idle?.getClip?.() ?? (source.animations ?? [])[0] ?? null;
    if (clip) {
      this.idleAction = this.mixer.clipAction(clip);
      this.idleAction.setLoop(LoopRepeat, Infinity);
    }

    const forward = character.forwardAxis;
    this._forwardYaw = forward ? Math.atan2(forward.x, forward.z) : 0;
  }

  /** One material, or the same material in every slot of a multi-material. */
  _ghostSlot(current, material) {
    return Array.isArray(current) ? current.map(() => material) : material;
  }

  _buildFigure() {
    this.figureGeometry = createMirageFigureGeometry(1.78);
    this.figure = new Group();
    this.figure.name = 'MirageFigure';
    const body = new Mesh(this.figureGeometry, this.bodyMaterial);
    body.renderOrder = 11;
    this.figure.add(body);
    for (let a = 0; a < AFTERIMAGES; a++) {
      const twin = new Mesh(this.figureGeometry, this.afterMaterials[a]);
      twin.renderOrder = 10;
      this.figure.add(twin);
      this.afterMeshes[a].push(twin);
    }
    this.figure.traverse((node) => {
      node.layers.set(LAYER.VFX);
      node.frustumCulled = false;
    });
    this.copyRoot.add(this.figure);
    this._forwardYaw = 0;
  }

  createParticles() {
    const particles = this.ctx.particles;

    // Specks of the illusion: curling, rising, additive.
    this.motes = particles.get('mirage.motes', {
      capacity: 1600,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.3
    });
    this.motes.uniforms.uDrag.value = 1.6;
    this.motes.uniforms.uEndSize.value = 0.2;
    this.motes.uniforms.uSizeIn.value = 0.1;
    this.motes.uniforms.uFadeIn.value = 0.12;
    this.motes.uniforms.uFadeOut.value = 0.5;

    // The burst's sparks.
    this.sparks = particles.get('mirage.sparks', {
      capacity: 1600,
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

    this.projectEmitter = new RateEmitter();
    this.moteEmitter = new RateEmitter();
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  /** The copy stands for the whole impact phase; the burst ends it. */
  get impactDuration() {
    return Math.max(0.3, settings.mirage.lifetime * settings.global.lifetime);
  }

  get fadeDuration() {
    return Math.max(0.1, settings.mirage.fadeTime * settings.global.lifetime);
  }

  /** An illusion does not burn steadily — it strobes with the body. */
  lightShimmer() {
    const c = settings.mirage;
    const tick = Math.floor(this.age * c.flickerRate);
    const roll = Math.abs(Math.sin(tick * 12.9898 + this._seed) * 43758.5453) % 1;
    return 1 - c.flicker * 0.4 * roll;
  }

  get radius() {
    return Math.max(0.2, settings.mirage.zoneRadius);
  }

  _feetPoint(out) {
    this.pointAt(1, out);
    out.y = 0;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    // The one place the clone can still be built: a character that loaded
    // after this instance was constructed.
    this._buildBody();

    this._seed = Math.random() * 100;
    this._stand = -1;
    this._burst = -1;
    this._poolFlare = 0;
    this.projectEmitter.reset();
    this.moteEmitter.reset();

    const c = settings.mirage;
    const g = settings.global;
    for (const dice of this.shardDice) {
      dice.bearing = Math.random() * TAU;
      dice.height = Math.random();
      dice.lift = randRange(-1, 1);
      dice.speed = randRange(-1, 1);
      dice.life = randRange(0.7, 1.15);
      dice.size = 1 + randRange(-0.4, 0.4) * g.randomness;
      dice.spin = randRange(-1, 1);
      dice.phase = Math.random() * TAU;
    }

    // Facing: back toward the caster (a mirror), or along the cast.
    const sign = c.faceCaster ? -1 : 1;
    this._yaw = Math.atan2(this.direction.x * sign, this.direction.z * sign);

    if (this.idleAction) {
      this.idleAction.reset();
      this.idleAction.play();
      // Out of step with the caster: the copy is a beat behind.
      this.idleAction.time = Math.max(0, c.idleOffset);
    }

    this.copyRoot.visible = false;
    this.shards.count = 0;
    this._sync();
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame sync                                                      */
  /* ------------------------------------------------------------------ */

  _sync() {
    const c = settings.mirage;
    const g = settings.global;

    this.shardMaterial.userData.sync();

    this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
    this.motes.uniforms.uGravity.value.set(0, c.moteRise, 0);
    this.motes.uniforms.uSizeScale.value = g.particleSize;
    this.motes.uniforms.uLifeScale.value = g.particleLifetime;
    this.motes.uniforms.uSpeedScale.value = g.particleSpeed;
    this.motes.uniforms.uOpacity.value = g.opacity;
    this.motes.uniforms.uGlow.value = c.moteGlow * g.glow;
    this.motes.uniforms.uTurbulence.value = 0.6 * g.turbulence;

    this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
    this.sparks.uniforms.uGravity.value.set(0, -3, 0);
    this.sparks.uniforms.uSizeScale.value = g.particleSize;
    this.sparks.uniforms.uLifeScale.value = g.particleLifetime;
    this.sparks.uniforms.uSpeedScale.value = g.particleSpeed;
    this.sparks.uniforms.uOpacity.value = g.opacity;
    this.sparks.uniforms.uGlow.value = c.sparkGlow * g.glow;
    this.sparks.uniforms.uStretch.value = c.sparkStretch;
    this.sparks.uniforms.uTurbulence.value = 0.2 * g.turbulence;
  }

  /** How far up the assembly front has climbed, metres (past the head when whole). */
  _form() {
    const c = settings.mirage;
    if (this._stand < 0) return 0;
    const t = saturate(this._stand / Math.max(0.02, c.formTime));
    return Easing.outCubic(t) * (c.bodyHeight + c.formNoise + c.formEdge * 4 + 0.2);
  }

  /** 0..1 gather before the burst. */
  _charge() {
    const c = settings.mirage;
    if (this._stand < 0 || this._burst >= 0) return 0;
    const left = this.impactDuration - this._stand;
    return Easing.inQuad(saturate(1 - left / Math.max(0.02, c.chargeTime)));
  }

  /** 0..1 how far the body has come apart. */
  _breakup() {
    if (this._burst < 0) return 0;
    return saturate(this._burst / Math.max(0.01, settings.mirage.burstTime));
  }

  /** The copy, its afterimages, its mixer. */
  _updateCopy(dt) {
    const c = settings.mirage;
    const g = settings.global;
    const standing = this._stand >= 0;
    const breakup = this._breakup();
    const visible = standing && breakup < 1;
    this.copyRoot.visible = visible;
    if (!visible) return;

    this._feetPoint(_feet);
    this.copyRoot.position.copy(_feet);
    this.copyRoot.rotation.set(0, this._yaw - this._forwardYaw, 0);
    // The figure is authored at 1.78 m; the clone is already the caster's size.
    if (!this.clone && this.figure) this.figure.scale.setScalar(c.bodyHeight / 1.78);
    this.copyRoot.updateMatrixWorld(true);

    if (this.mixer) this.mixer.update(dt * c.idleSpeed * g.animationSpeed);

    const charge = this._charge();
    const state = this._bodyState;
    state.root.copy(_feet);
    state.offset.set(0, 0, 0);
    state.form = this._form();
    state.breakup = breakup;
    state.charge = charge;
    state.seed = this._seed;
    state.tint = null;
    state.opacity = 1;
    this.bodyMaterial.userData.sync(state);

    /* --- the afterimages: either side across the view, a little behind --- */
    const cam = this.ctx.camera.position;
    _right.set(cam.x - _feet.x, 0, cam.z - _feet.z);
    if (_right.lengthSq() < 1e-6) _right.set(0, 0, 1);
    _right.normalize();
    _back.copy(_right).negate(); // away from the camera
    _right.set(_right.z, 0, -_right.x); // up × toCamera
    const count = Math.min(AFTERIMAGES, Math.max(0, Math.round(c.afterCount)));
    const time = frame.uTime.value;
    for (let a = 0; a < AFTERIMAGES; a++) {
      const on = a < count;
      const meshes = this.afterMeshes[a];
      for (let m = 0; m < meshes.length; m++) meshes[m].visible = on;
      if (!on) continue;
      const side = a === 0 ? -1 : 1;
      const sway = Math.sin(time * c.afterWobbleRate * TAU + a * 2.1 + this._seed) * c.afterWobble;
      // They split wider as it charges: the illusion losing its hold.
      const split = (c.afterSplit * (1 + charge * 2) + sway) * side;
      state.offset.copy(_right).multiplyScalar(split).addScaledVector(_back, c.afterLag);
      state.tint = a === 0 ? 'colorAfterA' : 'colorAfterB';
      state.opacity = c.afterOpacity;
      this.afterMaterials[a].userData.sync(state);
    }
  }

  _updatePool() {
    const c = settings.mirage;
    const state = this._poolState;
    const poolR = this.radius * c.poolRadius;
    const grow = this._stand < 0 ? 0 : Easing.outCubic(saturate(this._stand / Math.max(0.02, c.poolGrowTime)));
    const fade = this.phase === AbilityPhase.FADE ? 1 - Easing.inQuad(saturate(this.fadeTime / this.fadeDuration)) : 1;
    state.quadSize = (poolR * 1.25 + 0.4) * 2;
    state.radius = poolR * grow;
    state.fade = fade;
    state.flare = this._poolFlare * c.poolFlare + this._charge() * 0.6;
    state.seed = this._seed;
    this.poolMaterial.userData.sync(state);
    this._feetPoint(this.pool.position);
    this.pool.position.y = 0.02;
    this.pool.scale.set(state.quadSize, 1, state.quadSize);
    this.pool.visible = state.radius > 0.01 && fade > 0.004;
  }

  _updateWarp() {
    const c = settings.mirage;
    /* haze over the standing copy */
    const presence = this._stand < 0 ? 0 : saturate(this._form() / Math.max(0.1, c.bodyHeight)) * (1 - this._breakup());
    this._hazeState.strength = presence * (1 + this._charge());
    this._hazeState.seed = this._seed;
    this.hazeMaterial.userData.sync(this._hazeState);
    this._feetPoint(this.haze.position);
    this.haze.visible = this._hazeState.strength > 0.002;

    /* the burst's shock ring */
    if (this._burst < 0) {
      this.shock.visible = false;
      return;
    }
    const t = saturate(this._burst / Math.max(0.02, c.shockTime));
    this._shockState.front = lerp(0.05, 0.95, Easing.outCubic(t));
    this._shockState.strength = (1 - t) * saturate(t * 12);
    this._shockState.seed = this._seed;
    this.shockMaterial.userData.sync(this._shockState);
    this._feetPoint(this.shock.position);
    this.shock.position.y = c.bodyHeight * 0.5;
    this.shock.visible = t < 1;
  }

  /** Every shard, from its dice and the time since the burst. */
  _updateShards() {
    if (this._burst < 0) {
      this.shards.count = 0;
      return;
    }
    const c = settings.mirage;
    const g = settings.global;
    const count = Math.min(MAX_SHARDS, Math.max(0, Math.round(c.shardCount)));
    const fade = this.shardFade.array;
    const k = Math.max(0, c.shardDrag);
    this._feetPoint(_feet);
    let any = false;

    for (let i = 0; i < MAX_SHARDS; i++) {
      const dice = this.shardDice[i];
      const life = Math.max(0.05, c.shardLife * dice.life);
      const t = this._burst;
      if (i >= count || t >= life) {
        _node.position.set(0, -999, 0);
        _node.scale.setScalar(0.0001);
        _node.quaternion.identity();
        _node.updateMatrix();
        this.shards.setMatrixAt(i, _node.matrix);
        fade[i] = 0;
        continue;
      }
      any = true;

      // Start: on the body's surface at its dice height.
      const cx = Math.cos(dice.bearing);
      const cz = Math.sin(dice.bearing);
      _pos.set(_feet.x + cx * 0.18, dice.height * c.bodyHeight * 0.95 + 0.05, _feet.z + cz * 0.18);

      // Launch: out from the body, biased up, jittered.
      _dir.set(cx, c.shardLift + dice.lift * 0.35 * g.randomness, cz).normalize();
      const speed = c.shardSpeed * (1 + dice.speed * c.shardSpeedJitter * g.randomness) * g.explosionIntensity;
      _vel.copy(_dir).multiplyScalar(speed);

      // Closed-form flight under linear drag and gravity.
      const e = Math.exp(-k * t);
      const f = k > 1e-4 ? (1 - e) / k : t;
      const fall = k > 1e-4 ? (t - f) / k : 0.5 * t * t;
      _pos.addScaledVector(_vel, f);
      _pos.y += c.shardGravity * fall;
      if (_pos.y < 0.03) _pos.y = 0.03; // they skid on the floor rather than sink

      // Oriented along the current velocity, spinning about their own length.
      _vel.multiplyScalar(e);
      _vel.y += k > 1e-4 ? (c.shardGravity * (1 - e)) / k : c.shardGravity * t;
      if (_vel.lengthSq() < 1e-6) _vel.copy(_dir);
      _vel.normalize();
      _node.quaternion.setFromUnitVectors(_up, _vel);
      _spin.setFromAxisAngle(_up, dice.phase + dice.spin * c.shardSpin * t);
      _node.quaternion.multiply(_spin);

      const age = t / life;
      const size = dice.size * (1 - 0.5 * age);
      _node.position.copy(_pos);
      _node.scale.set(c.shardWidth * size, c.shardLength * size, c.shardWidth * size);
      _node.updateMatrix();
      this.shards.setMatrixAt(i, _node.matrix);
      fade[i] = 1 - Easing.inQuad(age);
    }

    this.shards.count = any ? MAX_SHARDS : 0;
    this.shards.instanceMatrix.needsUpdate = true;
    this.shardFade.needsUpdate = true;
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

  /** The projection in flight: a fraying stream of motes. */
  _travelFx(dt) {
    const c = settings.mirage;
    const g = settings.global;
    const n = this.projectEmitter.tick(dt, c.projectRate * g.particleCount);
    if (n <= 0) return;
    this._resetEmit(frame.uTime.value);
    _emit.position = this.position;
    _emit.radius = c.projectSpread;
    _emit.direction = _dir.copy(this.direction).negate();
    _emit.speed = 0.6;
    _emit.spread = 0.8;
    _emit.size = c.projectSize;
    _emit.life = c.moteLifetime * 0.5;
    this.motes.emit(n, _emit);
  }

  /** Specks drifting up off the standing copy. */
  _standFx(dt) {
    const c = settings.mirage;
    const g = settings.global;
    const presence = this.copyRoot.visible ? saturate(this._form() / Math.max(0.1, c.bodyHeight)) : 0;
    const n = this.moteEmitter.tick(dt, c.moteRate * presence * (1 + this._charge() * 2) * g.particleCount);
    if (n <= 0) return;
    this._feetPoint(_feet);
    this._resetEmit(frame.uTime.value);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * c.moteRadius;
      _pos.set(_feet.x + Math.cos(a) * r, Math.random() * c.bodyHeight, _feet.z + Math.sin(a) * r);
      _emit.position = _pos;
      _emit.radius = 0.05;
      _emit.direction = _up;
      _emit.speed = 0.35;
      _emit.spread = 0.6;
      _emit.size = c.moteSize;
      _emit.life = c.moteLifetime;
      this.motes.emit(1, _emit);
    }
  }

  /** The projection touching down: the mirage takes the circle. */
  _landFx() {
    const c = settings.mirage;
    const g = settings.global;
    this._feetPoint(_feet);
    this.ctx.decals.spawn(DecalType.RIPPLE, _feet, {
      radius: this.radius * c.poolRadius,
      life: 0.9,
      intensity: 0.6,
      colorA: getColor(c.colorPoolA),
      colorB: getColor(c.colorPoolB)
    });
    this._resetEmit(frame.uTime.value);
    _pos.copy(_feet).setY(0.1);
    _emit.position = _pos;
    _emit.radius = 0.3;
    _emit.direction = _up;
    _emit.speed = 1.6;
    _emit.spread = 0.9;
    _emit.size = c.moteSize * 1.4;
    _emit.life = c.moteLifetime * 0.6;
    this.motes.emit(Math.round(40 * g.particleCount), _emit);
    this.ctx.shake.add(0.08 * g.cameraShake, 7, 16);
    this.lightBoost = c.lightIntensity * 0.4;
  }

  /** The copy coming apart, and everything in the circle with it. */
  _burstFx() {
    const c = settings.mirage;
    const g = settings.global;
    const power = g.explosionIntensity;
    const time = frame.uTime.value;
    this._feetPoint(_feet);

    _pos.copy(_feet).setY(c.bodyHeight * 0.55);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: 0.3,
      endRadius: c.burstRadius * power,
      life: c.burstLife,
      intensity: c.burstIntensity,
      opacity: 0.75,
      fresnel: 2.2,
      squash: 0.8,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    this.ctx.decals.spawn(DecalType.SHOCKWAVE, _feet, {
      radius: this.radius * c.ringRadius * power,
      life: c.ringLife,
      width: 0.06,
      intensity: 1.0,
      colorA: getColor(c.colorRingA),
      colorB: getColor(c.colorRingB)
    });
    this.ctx.decals.spawn(DecalType.DUSTRING, _feet, {
      radius: this.radius * 0.9,
      life: c.dustLife,
      intensity: 0.6,
      colorA: getColor(c.colorDust),
      colorB: getColor(c.colorDust)
    });

    this._resetEmit(time);
    _emit.position = _pos;
    _emit.radius = 0.4;
    _emit.direction = _up;
    _emit.speed = c.sparkSpeed;
    _emit.speedVariance = 0.6;
    _emit.spread = 1.4;
    _emit.size = c.sparkSize;
    _emit.life = c.sparkLifetime;
    this.sparks.emit(Math.round(c.sparkCount * g.particleCount), _emit);

    _emit.radius = 0.5;
    _emit.speed = 2.0;
    _emit.size = c.moteSize * 1.5;
    _emit.life = c.moteLifetime;
    this.motes.emit(Math.round(c.sparkCount * 0.5 * g.particleCount), _emit);

    this.ctx.shake.add(c.burstShake * power * g.cameraShake, 5, 20);
    this.ctx.flash.trigger(getColor(c.colorB), c.burstFlash * power);
    this.lightBoost = c.lightIntensity * c.lightBoost * power;
    this._poolFlare = 1;

    this._kill();
  }

  /** Everything inside the circle goes down, thrown out from the copy. */
  _kill() {
    const field = this.ctx.dummies;
    if (!field?.findTargets) return;
    const c = settings.mirage;
    const g = settings.global;
    this._feetPoint(_feet);
    const found = field.findTargets(_feet.x, _feet.z, this.radius * c.killReach, this._found);
    if (found.length === 0) return;
    this._force.impulse = c.killImpulse * g.explosionIntensity;
    this._force.lift = c.killLift * g.explosionIntensity;
    this._force.spin = c.killSpin;
    for (const dummy of found) {
      _dir.set(dummy.position.x - _feet.x, 0, dummy.position.z - _feet.z);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      else _dir.normalize();
      dummy.kill(_dir.x, _dir.z, this._force);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases                                                              */
  /* ------------------------------------------------------------------ */

  onTravel(dt) {
    const c = settings.mirage;
    this._sync();
    this.position.y = c.projectHeight;
    this._travelFx(dt);
    this._updatePool();
    this._updateWarp();
  }

  onImpact() {
    this._stand = 0;
    this._landFx();
  }

  onFade(dt, t) {
    const c = settings.mirage;
    const g = settings.global;
    this._stand += dt;
    if (this._burst >= 0) this._burst += dt;
    this._poolFlare = Math.max(0, this._poolFlare - this._poolFlare * 3.5 * dt);

    // The gather: a rumble that grows into the burst.
    const charge = this._charge();
    if (charge > 0) this.ctx.shake.rumble(c.chargeShake * charge * g.cameraShake, dt);

    // The burst, on the frame the copy's time runs out.
    if (t >= 1 && this._burst < 0) {
      this._burst = 0;
      this._burstFx();
    }

    this._sync();
    this._updateCopy(dt);
    this._updatePool();
    this._updateWarp();
    this._updateShards();
    if (this._burst < 0) this._standFx(dt);

    // The light sits in the copy's chest.
    this._feetPoint(this.position);
    this.position.y = c.lightHeight;
  }

  onDestroy() {
    this.copyRoot.visible = false;
    // The mixer stops with the copy; `onSpawn` resets and replays it.
    this.mixer?.stopAllAction();
    this.pool.visible = false;
    this.haze.visible = false;
    this.shock.visible = false;
    this.shards.count = 0;
    this._stand = -1;
    this._burst = -1;
  }

  dispose() {
    this.mixer?.stopAllAction();
    if (this.clone) {
      // The geometry is the caster's — shared, not ours to free. The bones and
      // their skeletons are.
      this.clone.traverse((node) => {
        if (node.isSkinnedMesh) node.skeleton?.dispose();
      });
      if (this.mixer) this.mixer.uncacheRoot(this.clone);
    }
    this.figureGeometry?.dispose();
    this.bodyMaterial.dispose();
    for (const material of this.afterMaterials) material.dispose();
    this.groundGeometry.dispose();
    this.poolMaterial.dispose();
    this.warpGeometry.dispose();
    this.hazeMaterial.dispose();
    this.shockMaterial.dispose();
    this.shardGeometry.dispose();
    this.shards.dispose();
    this.shardMaterial.dispose();
    super.dispose();
  }
}

/* ==================================================================== */
/* Editor                                                                */
/* ==================================================================== */

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('◎  Mirage Construct');
  const R = Editor.range;

  const cast = folder.addFolder('The cast');
  R(cast, c, 'range', 2, 40, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 2, 80, 0.5, 'projection speed (m/s)');
  R(cast, c, 'lifetime', 0.5, 12, 0.05, 'copy stands for (s)');
  R(cast, c, 'fadeTime', 0.1, 5, 0.05, 'burst settles over (s)');
  R(cast, c, 'cooldown', 0, 10, 0.05, 'cooldown');
  R(cast, c, 'zoneRadius', 0.5, 8, 0.05, 'zone radius (m)');
  Editor.castAnimation(cast, c);
  cast.addColor(c, 'colorA').name('accent');
  cast.addColor(c, 'colorB').name('burst flash');
  R(cast, c, 'projectHeight', 0, 3, 0.01, 'projection height (m)');
  R(cast, c, 'projectRate', 0, 800, 1, 'projection motes / s');
  R(cast, c, 'projectSize', 0.01, 0.4, 0.005, 'projection mote size');
  R(cast, c, 'projectSpread', 0, 1.5, 0.01, 'projection fray (m)');

  const body = folder.addFolder('1 · The copy');
  R(body, c, 'bodyHeight', 0.5, 3, 0.01, 'height (m)');
  body.add(c, 'faceCaster').name('face the caster');
  R(body, c, 'idleOffset', 0, 4, 0.01, 'idle offset (s)');
  R(body, c, 'idleSpeed', 0, 3, 0.01, 'idle speed');
  R(body, c, 'formTime', 0.02, 3, 0.01, 'assembles over (s)');
  R(body, c, 'formEdge', 0.005, 0.5, 0.005, 'seam width (m)');
  R(body, c, 'formNoise', 0, 0.8, 0.005, 'seam raggedness (m)');
  R(body, c, 'formNoiseScale', 0.2, 12, 0.05, 'seam detail');
  R(body, c, 'formGlow', 0, 12, 0.05, 'seam glow');
  R(body, c, 'rimStrength', 0, 6, 0.05, 'rim');
  R(body, c, 'rimPower', 0.5, 8, 0.05, 'rim thinness');
  R(body, c, 'fill', 0, 1.5, 0.01, 'body fill');
  R(body, c, 'bandDensity', 0.5, 40, 0.1, 'bands per metre');
  R(body, c, 'bandSpeed', -10, 10, 0.05, 'band speed');
  R(body, c, 'bandSharpness', 0.2, 16, 0.05, 'band sharpness');
  R(body, c, 'bandStrength', 0, 3, 0.01, 'band strength');
  R(body, c, 'bandWarp', 0, 2, 0.01, 'band warp');
  R(body, c, 'chromaSplit', 0, 0.5, 0.005, 'chromatic split');
  R(body, c, 'flicker', 0, 1, 0.01, 'flicker');
  R(body, c, 'flickerRate', 0, 60, 0.5, 'flicker rate');
  R(body, c, 'glitch', 0, 0.3, 0.001, 'slice tearing (m)');
  R(body, c, 'glitchSlices', 1, 80, 1, 'slices');
  R(body, c, 'bodyGlow', 0, 10, 0.05, 'glow');
  R(body, c, 'bodyOpacity', 0, 1, 0.01, 'opacity');
  body.addColor(c, 'colorBodyRim').name('rim');
  body.addColor(c, 'colorBodyBand').name('bands');
  body.addColor(c, 'colorBodyEdge').name('seam');
  R(body, c, 'chargeTime', 0.05, 3, 0.01, 'charge over (s)');
  R(body, c, 'chargeGlow', 0, 8, 0.05, 'charge glow');
  R(body, c, 'chargeGlitch', 0, 0.5, 0.005, 'charge tearing (m)');
  R(body, c, 'chargeShake', 0, 1, 0.01, 'charge rumble');

  const after = folder.addFolder('2 · Afterimages');
  R(after, c, 'afterCount', 0, AFTERIMAGES, 1, 'count');
  R(after, c, 'afterSplit', 0, 0.6, 0.005, 'split (m)');
  R(after, c, 'afterLag', -0.5, 0.8, 0.005, 'lag (m)');
  R(after, c, 'afterWobble', 0, 0.4, 0.005, 'sway (m)');
  R(after, c, 'afterWobbleRate', 0, 6, 0.05, 'sway rate');
  R(after, c, 'afterOpacity', 0, 1, 0.01, 'opacity');
  after.addColor(c, 'colorAfterA').name('left fringe');
  after.addColor(c, 'colorAfterB').name('right fringe');

  const pool = folder.addFolder('3 · Mirage pool');
  R(pool, c, 'poolRadius', 0.1, 2, 0.01, 'radius (× zone)');
  R(pool, c, 'poolGrowTime', 0.02, 3, 0.01, 'spreads over (s)');
  R(pool, c, 'poolRings', 1, 30, 0.5, 'rings');
  R(pool, c, 'poolRingSpeed', -4, 4, 0.01, 'ring speed');
  R(pool, c, 'poolRingWidth', 0.005, 0.5, 0.005, 'ring width');
  R(pool, c, 'poolIridescence', 0, 1.5, 0.01, 'iridescence');
  R(pool, c, 'poolShimmer', 0, 2, 0.01, 'shimmer');
  R(pool, c, 'poolShimmerScale', 0.2, 10, 0.05, 'shimmer scale');
  R(pool, c, 'poolEdgeGlow', 0, 8, 0.05, 'edge glow');
  R(pool, c, 'poolGlow', 0, 6, 0.05, 'glow');
  R(pool, c, 'poolOpacity', 0, 1, 0.01, 'opacity');
  R(pool, c, 'poolFlare', 0, 8, 0.05, 'flare on burst');
  pool.addColor(c, 'colorPoolA').name('rings');
  pool.addColor(c, 'colorPoolB').name('body');
  pool.addColor(c, 'colorPoolC').name('film');

  const haze = folder.addFolder('4 · Heat haze & shock');
  R(haze, c, 'hazeStrength', 0, 2, 0.01, 'haze strength');
  R(haze, c, 'hazeScale', 0.2, 10, 0.05, 'haze scale');
  R(haze, c, 'hazeSpeed', 0, 6, 0.05, 'haze rise');
  R(haze, c, 'hazeWidth', 0.2, 6, 0.05, 'haze width (m)');
  R(haze, c, 'hazeHeight', 0.2, 6, 0.05, 'haze height (m)');
  R(haze, c, 'shockStrength', 0, 4, 0.01, 'shock strength');
  R(haze, c, 'shockSize', 0.5, 20, 0.1, 'shock size (m)');
  R(haze, c, 'shockTime', 0.05, 2, 0.01, 'shock time (s)');

  const motes = folder.addFolder('5 · Motes');
  R(motes, c, 'moteRate', 0, 300, 1, 'per second');
  R(motes, c, 'moteRadius', 0, 2, 0.01, 'radius (m)');
  R(motes, c, 'moteSize', 0.01, 0.3, 0.005, 'size');
  R(motes, c, 'moteLifetime', 0.1, 5, 0.05, 'lifetime');
  R(motes, c, 'moteRise', -2, 4, 0.05, 'rise');
  R(motes, c, 'moteGlow', 0, 8, 0.05, 'glow');
  Editor.gradient(motes, c, 'colorMote', 'mote colour');

  const burst = folder.addFolder('6 · The burst');
  R(burst, c, 'burstTime', 0.01, 1, 0.005, 'comes apart over (s)');
  R(burst, c, 'shardCount', 0, MAX_SHARDS, 1, 'shards');
  R(burst, c, 'shardSpeed', 0, 30, 0.1, 'shard speed');
  R(burst, c, 'shardSpeedJitter', 0, 1, 0.01, 'speed jitter');
  R(burst, c, 'shardLift', -1, 3, 0.01, 'lift');
  R(burst, c, 'shardGravity', -30, 5, 0.1, 'gravity');
  R(burst, c, 'shardDrag', 0, 8, 0.05, 'drag');
  R(burst, c, 'shardLife', 0.1, 4, 0.01, 'life (s)');
  R(burst, c, 'shardLength', 0.02, 1.5, 0.005, 'length (m)');
  R(burst, c, 'shardWidth', 0.005, 0.4, 0.005, 'width (m)');
  R(burst, c, 'shardSpin', 0, 40, 0.1, 'spin (rad/s)');
  R(burst, c, 'shardGlow', 0, 10, 0.05, 'glow');
  R(burst, c, 'shardFresnel', 0, 6, 0.05, 'fresnel');
  R(burst, c, 'shardOpacity', 0, 1, 0.01, 'opacity');
  burst.addColor(c, 'colorShardCore').name('shard core');
  burst.addColor(c, 'colorShardEdge').name('shard edge');
  burst.addColor(c, 'colorShardDeep').name('shard deep');
  R(burst, c, 'sparkCount', 0, 600, 1, 'sparks');
  R(burst, c, 'sparkSpeed', 0, 30, 0.1, 'spark speed');
  R(burst, c, 'sparkSize', 0.01, 0.4, 0.005, 'spark size');
  R(burst, c, 'sparkLifetime', 0.05, 3, 0.01, 'spark life');
  R(burst, c, 'sparkStretch', 0, 2, 0.01, 'spark stretch');
  R(burst, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  Editor.gradient(burst, c, 'colorSpark', 'spark colour');
  R(burst, c, 'burstRadius', 0.2, 10, 0.05, 'pressure shell (m)');
  R(burst, c, 'burstLife', 0.05, 2, 0.01, 'shell life');
  R(burst, c, 'burstIntensity', 0, 6, 0.05, 'shell intensity');
  burst.addColor(c, 'colorBurstA').name('shell core');
  burst.addColor(c, 'colorBurstB').name('shell body');
  burst.addColor(c, 'colorBurstC').name('shell edge');
  R(burst, c, 'ringRadius', 0.2, 4, 0.01, 'shock ring (× zone)');
  R(burst, c, 'ringLife', 0.05, 3, 0.01, 'ring life');
  burst.addColor(c, 'colorRingA').name('ring');
  burst.addColor(c, 'colorRingB').name('ring, hot');
  R(burst, c, 'dustLife', 0.05, 4, 0.05, 'dust life');
  burst.addColor(c, 'colorDust').name('dust');
  R(burst, c, 'killReach', 0.1, 2, 0.01, 'kill reach (× zone)');
  R(burst, c, 'killImpulse', 0, 20, 0.1, 'thrown out (m/s)');
  R(burst, c, 'killLift', 0, 20, 0.1, 'thrown up (m/s)');
  R(burst, c, 'killSpin', 0, 4, 0.01, 'torque');
  R(burst, c, 'burstShake', 0, 2, 0.01, 'shake');
  R(burst, c, 'burstFlash', 0, 2, 0.01, 'flash');

  const light = folder.addFolder('Light');
  light.addColor(c, 'lightColor').name('colour');
  R(light, c, 'lightIntensity', 0, 30, 0.1, 'intensity');
  R(light, c, 'lightRadius', 1, 30, 0.1, 'radius');
  R(light, c, 'lightHeight', 0, 3, 0.01, 'height (m)');
  R(light, c, 'lightBoost', 0, 8, 0.05, 'burst punch (× intensity)');

  folder.close();
  return folder;
}
