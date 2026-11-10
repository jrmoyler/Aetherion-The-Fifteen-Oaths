import { Box3, Group, InstancedMesh, Mesh, Object3D, Points, Quaternion, Vector3 } from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { Ability, AbilityPhase } from '../../Ability.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { getColor } from '../../../utils/color.js';
import { Easing, saturate } from '../../../utils/math.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { ID, UID, CONFIG } from './AshenDoppelgangerConfig.js';
import {
  FUSE_POINTS,
  createBrandGeometry,
  createBrandTailGeometry,
  createEmberColumnGeometry,
  createSpireGeometry,
  createFuseGeometry,
  createGroundQuad,
  createHazeQuad,
  createHeadGeometry,
  createLimbGeometry,
  createTorsoGeometry
} from './AshenDoppelgangerGeometry.js';
import {
  createBrandMaterial,
  createBrandTailMaterial,
  createCinderFieldMaterial,
  createEchoSkinMaterial,
  createSpireMaterial,
  createEmberColumnMaterial,
  createFuseMaterial,
  createHeatHazeMaterial,
  createRigMaterial,
  createSigilMaterial
} from './AshenDoppelgangerMaterials.js';

export { ID, UID, CONFIG };

/** Recorded path/pose samples (20 Hz → ~4.8 s of history). */
const HISTORY = 96;
/** Seconds between recorded samples. */
const SAMPLE_STEP = 0.05;
/** Bones a caster rig may have before the echo falls back to the figure. */
const MAX_BONES = 128;
/** Floats per bone per sample: quaternion xyzw + position xyz. */
const BONE_STRIDE = 7;
/** Spires the cinder crown can raise (`spireCount` is clamped to this). */
const MAX_SPIRES = 12;
/** Dice per spire: bearing, seat, height, lean. */
const SPIRE_DICE = 4;
const TAU = Math.PI * 2;

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _side = new Vector3();
const _up = new Vector3(0, 1, 0);
const _box = new Box3();
const _obj = new Object3D();
_obj.rotation.order = 'YXZ';
const _q = new Quaternion();
const _vel = new Vector3();

/**
 * ASHEN DOPPELGANGER — Fire, zone cast (matrix-expansion candidate).
 *
 * The caster leaves a copy of themselves made of cooling ash. It condenses at
 * their shoulder and then *walks their path* — the same footsteps, the same
 * facing and, when the host has given us the caster's rig, the same pose —
 * `delay` seconds behind them. Every `pulseInterval` it flares and scorches
 * everything within `pulseRadius`. And because it is *you, a moment late*, it
 * also repeats your cast: `brandAt` seconds in, it throws a coal from its hand
 * to the point you aimed at, where the floor tears open into a field of
 * smouldering cracks and a crown of ash-basalt spires heaves up out of it.
 * When its time is up it crumbles crown-first into ash and embers.
 *
 * The read is *your own past, still burning*: a dark ash figure at your
 * shoulder with fissures of fire in it, a smouldering fuse from its feet to
 * yours, and — out where you aimed — a crown of charred stone it raised.
 *
 * ## Beats
 *
 *   - **anticipation** (0 → `brandAt`) — the echo condenses feet-first out of
 *     ash over `formTime`; for the last `brandCharge` seconds a coal gathers
 *     and swells in its hand, the light rising with it.
 *   - **travel** (`brandFlight`) — the coal flies an arc (`brandArc`) to the
 *     aimed point, tumbling, its seams boiling, a flame tail streaming back
 *     along the flight and a wake of embers and ash smoke behind it.
 *   - **impact** (one frame) — the landing: everything inside `brandRadius`
 *     is struck and charred, a fire shell and shockwave, sparks, a flash, a
 *     camera knock and a light punch; the cinder field tears open from the
 *     centre (white-hot front) and `spireCount` spires tear up out of it,
 *     leaning outward, sized from `brandRadius` so the crown always fills the
 *     zone.
 *   - **linger** (`crownLife`) — the crown is alive: the stone cools
 *     (`spireCool`, veins sliding white → gold → ember → char, pale ash
 *     settling on the crowns), the spires settle into the floor and lean
 *     further out, sway in their own heat, embers and ash rise off them,
 *     the field's cracks breathe and cool, a haze rises — and every pulse of
 *     the echo re-flares the stone. Meanwhile the echo keeps walking your path
 *     and pulsing: a shockwave and scorch on the floor, sparks, a knock; a
 *     pulse that fells a body shells it in fire and chars it (`Dummy.corrode`
 *     with `scorchLook`) so the stain travels with it.
 *   - **exit** — the crown crumbles from the top down behind a white-hot
 *     edge (`crownCrumble`) with a sigh of ash; over the last `burnOutTime`
 *     the echo does the same; the field fades with the cast. Nothing pops.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the echo body** — the caster's own rig cloned with an ash crust
 *      patched into a lit `MeshStandardMaterial` (charcoal grain, pale ash
 *      flecks, crawling fissures, ember rim, condense/crumble fronts), or
 *      (until a rig exists) an authored, eroded fallback figure with the
 *      bespoke ember-crust ShaderMaterial. It stands `echoSide`/`echoBack`
 *      off its path point so it never hides inside the caster.
 *   2. **the sigil** — ground circle, cracks and pulse ring (additive shader).
 *   3. **the fuse** — the smouldering path ribbon, rewritten in place each frame
 *      from the recorded history (fixed `FUSE_POINTS`).
 *   4. **the ember column** — baked points in an updraft round the body.
 *   5. **heat haze** — `LAYER.DISTORTION` billboards over the echo and crown.
 *   6. **particles** — embers (`.motes`), ash smoke (`.ash`), sparks
 *      (`.sparks`), all shared `ctx.particles` systems.
 *   7. **beats** — SHOCKWAVE + SCORCH decals, FIRE bursts, flash, shake, light.
 *   8. **the brand** — the thrown coal (eroded lathe, opaque sun-lit char with
 *      boiling seams) and its additive flame-cone tail.
 *   9. **the cinder crown** — instanced, faceted ash-basalt spires
 *      (`MeshStandardMaterial` patch: lit, shadowing, `LAYER.WORLD`).
 *  10. **the cinder field** — the torn floor: charred plates over a warped
 *      crack network, normal-blended so the deep tone grounds the cast.
 *  Every glowing layer of the echo's cast reads one four-stop ramp,
 *  `colorCinderA..D` (white-hot → gold → ember → char).
 *
 * ## Hits (`handlesOwnHits`)
 *
 * Each pulse calls `findTargets` round the echo figure and `kill`s each body
 * with a force pointing away from it; the brand's landing does the same once
 * round the aimed point with `brandForce`. Only a body that actually fell is
 * stained. Pulses are clocked off `age`, not frames, so a long frame catches
 * up (capped at four per frame); the landing fires once per cast.
 *
 * ## The editor rule
 *
 * A cast keeps its history, its pulse clock, its landing time, per-spire dice
 * and a few integrated phases; every size, colour, rate and glow is read from
 * `settings[ID]` every frame (the crown's seat and heights from `brandRadius`
 * and `spireHeight`, so dragging them reshapes a standing crown). Reduced
 * motion holds every ambient animation (crust crawl, column drift, haze,
 * sway, shake) — the gameplay timing is untouched.
 */
export class AshenDoppelgangerAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get impactDuration() {
    return 0.05;
  }

  get fadeDuration() {
    return Math.max(0.1, this.config.duration);
  }

  get instanceCount() {
    return this._hitCount;
  }

  /** A coal gutters; the light breathes harder as the next pulse nears. */
  lightShimmer() {
    if (this.reduceMotion) return 1;
    const gutter = 0.8 + 0.12 * Math.sin(this.age * 13.1) * Math.sin(this.age * 4.7) + 0.08 * Math.sin(this.age * 29.3);
    return gutter + (this._heat ?? 0) * 0.35;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    this.skin = createEchoSkinMaterial();
    this.groundMat = createSigilMaterial();
    this.sparkMat = createEmberColumnMaterial();
    this.fuseMat = createFuseMaterial();
    this.hazeMat = createHeatHazeMaterial();

    this.bodyGeo = createTorsoGeometry();
    this.headGeo = createHeadGeometry();
    this.limbGeo = createLimbGeometry();
    this.groundGeo = createGroundQuad();
    this.sparkGeo = createEmberColumnGeometry();
    this.fuseGeo = createFuseGeometry();
    this.hazeGeo = createHazeQuad();

    // The echo: everything that walks the path lives under this group.
    this.echo = new Group();
    this.echo.name = 'AshEcho';
    this.group.add(this.echo);

    // Fallback figure, ~1.8 m: the legs hang from hips at 0.84 m to the
    // floor, the torso stands on the crotch at 0.74 m with its shoulders at
    // ~1.47 m, the head sits on the neck. Parts are authored at a generous
    // size and proportioned here, so the editor-free silhouette reads as a
    // person rather than a stack of capsules.
    // The figure stands beside its path point (`echoSide`/`echoBack`).
    this.figure = new Group();
    this.figure.name = 'AshEchoFigure';
    this.echo.add(this.figure);
    this.figurePos = new Vector3();

    this.body = new Mesh(this.bodyGeo, this.skin);
    this.body.position.y = 0.74;
    this.body.scale.set(0.62, 0.72, 0.62);
    this.figure.add(this.body);
    this.head = new Mesh(this.headGeo, this.skin);
    this.head.position.y = 1.52;
    this.head.scale.setScalar(0.6);
    this.figure.add(this.head);
    this.limbs = [];
    // [x, y, length scale, girth scale]: arms hang from the shoulders, legs
    // from the hips. The limb geometry is built pointing up; the pivot's
    // child is turned over so it hangs, and the pivot swings it.
    for (const [x, y, len, girth] of [
      [-0.25, 1.44, 0.85, 0.62],
      [0.25, 1.44, 0.85, 0.62],
      [-0.09, 0.84, 1.0, 0.85],
      [0.09, 0.84, 1.0, 0.85]
    ]) {
      const pivot = new Group();
      pivot.position.set(x, y, 0);
      const part = new Mesh(this.limbGeo, this.skin);
      part.rotation.z = Math.PI;
      part.scale.set(girth, len, girth);
      pivot.add(part);
      this.figure.add(pivot);
      this.limbs.push(pivot);
    }

    // The ember column rides the echo too.
    this.spark = new Points(this.sparkGeo, this.sparkMat);
    this.spark.frustumCulled = false;
    this.figure.add(this.spark);

    // The sigil and the fuse are on the floor in world space.
    this.ground = new Mesh(this.groundGeo, this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = 0.035;
    this.ground.renderOrder = 2;
    this.group.add(this.ground);

    this.fuse = new Mesh(this.fuseGeo, this.fuseMat);
    this.fuse.frustumCulled = false;
    this.fuse.renderOrder = 1;
    this.group.add(this.fuse);

    this.haze = new Mesh(this.hazeGeo, this.hazeMat);
    this.haze.frustumCulled = false;
    this.group.add(this.haze);

    // 8 · the brand: the coal and its flame tail (world space).
    this.brandMat = createBrandMaterial();
    this.brandGeo = createBrandGeometry();
    this.brand = new Mesh(this.brandGeo, this.brandMat);
    this.brand.frustumCulled = false;
    this.brand.castShadow = true;
    this.brand.visible = false;
    this.group.add(this.brand);
    this.tailMat = createBrandTailMaterial();
    this.tailGeo = createBrandTailGeometry();
    this.tail = new Mesh(this.tailGeo, this.tailMat);
    this.tail.frustumCulled = false;
    this.tail.visible = false;
    this.group.add(this.tail);

    // 9 · the cinder crown: instanced, lit, shadowing spires.
    this.spireMat = createSpireMaterial();
    this.spireGeo = createSpireGeometry();
    this.spires = new InstancedMesh(this.spireGeo, this.spireMat, MAX_SPIRES);
    this.spires.castShadow = true;
    this.spires.receiveShadow = true;
    this.spires.frustumCulled = false;
    this.spires.count = 0;
    this.spires.visible = false;
    this.group.add(this.spires);
    this.spireDice = new Float32Array(MAX_SPIRES * SPIRE_DICE);

    // 10 · the cinder field, and a second haze over the crown.
    this.fieldMat = createCinderFieldMaterial();
    this.field = new Mesh(this.groundGeo, this.fieldMat);
    this.field.rotation.x = -Math.PI / 2;
    this.field.position.y = 0.03;
    this.field.renderOrder = 1;
    this.field.visible = false;
    this.group.add(this.field);
    this.crownHazeMat = createHeatHazeMaterial();
    this.crownHaze = new Mesh(this.hazeGeo, this.crownHazeMat);
    this.crownHaze.frustumCulled = false;
    this.crownHaze.visible = false;
    this.group.add(this.crownHaze);

    this.aim = new Vector3();
    this.launchFrom = new Vector3();
    this.hand = new Vector3();
    this._brandPrev = new Vector3();
    this._launched = false;
    this._landed = false;
    this._landAt = -1;
    this._crownCollapsed = false;
    this._brandState = { clock: 0, heat: 0, power: 0 };
    this._spireState = { clock: 0, heat: 1, pulse: 0, crumble: 0 };
    this._fieldState = { clock: 0, opacity: 0, reveal: 0, heat: 1, pulse: 0 };
    this._crownHazeState = { clock: 0, heat: 0, power: 0 };

    // Bounded ring-buffer history: position, time, facing, and (with a rig)
    // every bone's local pose. Nothing here grows after construction.
    this.samples = Array.from({ length: HISTORY }, () => new Vector3());
    this.sampleTimes = new Float64Array(HISTORY);
    this.yawHistory = new Float32Array(HISTORY);
    this.writeIndex = 0;
    this.count = 0;
    this.sampleClock = 0;
    this.nextPulse = 0;
    this.lastPulse = -1;
    this.found = [];
    this.tmp = new Vector3();
    this.last = new Vector3();
    this.poseQuaternion = new Quaternion();
    this.posePosition = new Vector3();
    this.echoRig = null;
    this.poseSources = [];
    this.poseCopies = [];
    this.poseHistory = null;
    this.rigMaterial = null;
    this.rigMeshes = [];
    this._rigHeight = 1.8;

    // Per-cast state handed to the material syncs (same objects every frame).
    this._skinState = { clock: 0, heat: 0, form: 0, crumble: 0, origin: new Vector3() };
    this._rigState = { clock: 0, heat: 0, form: 0, crumble: 0, height: 1.8, opacity: 0 };
    this._fxState = { clock: 0, heat: 0, power: 1 };
    this._force = { impulse: 0, lift: 0, spin: 0 };
    this._clock = 0;
    this._heat = 0;
    this._form = 0;
    this._crumble = 0;
    this._hitCount = 0;
    this._collapsed = false;
    this.reduceMotion = false;

    this.echo.traverse((o) => o.layers?.set(LAYER.VFX));
    this.ground.layers.set(LAYER.VFX);
    this.fuse.layers.set(LAYER.VFX);
    this.haze.layers.set(LAYER.DISTORTION);
    this.brand.layers.set(LAYER.WORLD);
    this.tail.layers.set(LAYER.VFX);
    this.spires.layers.set(LAYER.WORLD);
    this.field.layers.set(LAYER.VFX);
    this.crownHaze.layers.set(LAYER.DISTORTION);
  }

  createParticles() {
    const particles = this.ctx.particles;
    this.moteEmitter = new RateEmitter();
    this.ashEmitter = new RateEmitter();
    this.brandEmitter = new RateEmitter();
    this.brandSmokeEmitter = new RateEmitter();
    this.crownEmitter = new RateEmitter();
    this.crownSmokeEmitter = new RateEmitter();
    if (!particles?.get) {
      this.motes = this.ash = this.sparks = null;
      return;
    }
    this.motes = particles.get(`${ID}.motes`, {
      capacity: 900,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.motes.uniforms.uSizeIn.value = 0.1;
    this.motes.uniforms.uFadeIn.value = 0.1;
    this.motes.uniforms.uFadeOut.value = 0.55;
    this.motes.uniforms.uEndSize.value = 0.2;
    this.motes.uniforms.uDrag.value = 1.1;

    this.ash = particles.get(`${ID}.ash`, {
      capacity: 600,
      shape: ParticleShape.SMOKE,
      additive: false,
      softFade: 0.6
    });
    this.ash.uniforms.uSizeIn.value = 0.2;
    this.ash.uniforms.uFadeIn.value = 0.15;
    this.ash.uniforms.uFadeOut.value = 0.5;
    this.ash.uniforms.uEndSize.value = 1.8;
    this.ash.uniforms.uDrag.value = 1.6;

    this.sparks = particles.get(`${ID}.sparks`, {
      capacity: 900,
      shape: ParticleShape.STREAK,
      additive: true,
      stretch: true,
      softFade: 0.15
    });
    this.sparks.uniforms.uSizeIn.value = 0.02;
    this.sparks.uniforms.uFadeIn.value = 0.02;
    this.sparks.uniforms.uFadeOut.value = 0.6;
    this.sparks.uniforms.uEndSize.value = 0.3;
    this.sparks.uniforms.uDrag.value = 1.4;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    const c = this.config;
    const g = settings.global;
    this._ensureRig();
    this.reduceMotion = prefersReducedMotion();
    this.count = 0;
    this.writeIndex = 0;
    this.sampleClock = 0;
    this.nextPulse = c.delay;
    this.lastPulse = -1;
    this._clock = 0;
    this._heat = 0;
    this._form = 0;
    this._crumble = 0;
    this._hitCount = 0;
    this._collapsed = false;
    this.moteEmitter.reset();
    this.ashEmitter.reset();
    this.brandEmitter.reset();
    this.brandSmokeEmitter.reset();
    this.crownEmitter.reset();
    this.crownSmokeEmitter.reset();
    // The echo's own cast: where you aimed, and fresh dice for its crown.
    this.pointAt(1, this.aim);
    this.aim.y = 0;
    this._launched = false;
    this._landed = false;
    this._landAt = -1;
    this._crownCollapsed = false;
    this._crownYaw = Math.random() * TAU;
    for (let i = 0; i < this.spireDice.length; i++) this.spireDice[i] = Math.random();
    this.brand.visible = false;
    this.tail.visible = false;
    this.spires.visible = false;
    this.spires.count = 0;
    this.field.visible = false;
    this.crownHaze.visible = false;
    this.figure.position.set(-c.echoSide, 0, -c.echoBack);
    this.figurePos.set(this.origin.x - c.echoSide, 0, this.origin.z - c.echoBack);
    this.last.copy(this.origin);
    this.echo.position.copy(this.origin);
    this.echo.rotation.y = 0;

    this.echo.visible = true;
    this.ground.visible = true;
    this.fuse.visible = true;
    this.haze.visible = !this.reduceMotion;

    this.skin.uniforms.uOpacity.value = c.echoOpacity;
    this.sparkMat.uniforms.uOpacity.value = c.emberOpacity * g.opacity;
    this.sparkMat.uniforms.uRate.value = c.emberRate;
    this.groundMat.uniforms.uOpacity.value = c.sigilOpacity * g.opacity;
    this.groundMat.uniforms.uPulse.value = 1;
    this._sample();
    this._present(0, 1);
  }

  /** Clone the caster's rig once per pooled instance; the clone is reused. */
  _ensureRig() {
    if (this.echoRig || !this.ctx.character?.model) return;
    const source = this.ctx.character.model;
    const copy = cloneSkeleton(source);
    const originals = [];
    const clones = [];
    source.traverse((node) => {
      if (node.isBone) originals.push(node);
    });
    copy.traverse((node) => {
      if (node.isBone) clones.push(node);
    });
    if (!originals.length || originals.length !== clones.length || originals.length > MAX_BONES) return;
    this.rigMaterial = createRigMaterial();
    this.rigMaterial.opacity = this.config.echoOpacity;
    this.rigMeshes = [];
    copy.traverse((node) => {
      if (node.isMesh) {
        this.rigMeshes.push(node);
        node.material = this.rigMaterial;
        // Solid ash: lit by the sun and casting its own shadow.
        node.castShadow = true;
      }
      node.layers?.set(LAYER.WORLD);
    });
    // The crust's dissolve needs the body's height; measure it once.
    _box.setFromObject(source);
    const height = _box.max.y - _box.min.y;
    this._rigHeight = Number.isFinite(height) && height > 0.2 && height < 6 ? height : 1.8;
    this.figure.add(copy);
    this.echoRig = copy;
    this.poseSources = originals;
    this.poseCopies = clones;
    this.poseHistory = new Float32Array(HISTORY * originals.length * BONE_STRIDE);
    this.body.visible = false;
    this.head.visible = false;
    for (const limb of this.limbs) limb.visible = false;
  }

  /** Record where (and how) the caster is now into the ring buffer. */
  _sample() {
    const point = this.ctx.character?.position ?? this.origin;
    this.samples[this.writeIndex].copy(point);
    this.sampleTimes[this.writeIndex] = this.age;
    this.yawHistory[this.writeIndex] = this.ctx.character?.root?.rotation.y ?? 0;
    if (this.poseHistory) {
      const bones = this.poseSources;
      const base = this.writeIndex * bones.length * BONE_STRIDE;
      for (let i = 0; i < bones.length; i++) {
        bones[i].quaternion.toArray(this.poseHistory, base + i * BONE_STRIDE);
        bones[i].position.toArray(this.poseHistory, base + i * BONE_STRIDE + 4);
      }
    }
    this.writeIndex = (this.writeIndex + 1) % HISTORY;
    this.count = Math.min(this.count + 1, HISTORY);
  }

  /**
   * Walk the echo along the recorded path and run the pulse clock.
   * Gameplay lives here; `_present` does the look.
   */
  _updateEcho(dt) {
    const c = this.config;
    this.sampleClock += dt;
    if (this.sampleClock >= SAMPLE_STEP) {
      this._sample();
      this.sampleClock %= SAMPLE_STEP;
    }
    const targetTime = Math.max(0, this.age - c.delay);
    // Bracket the desired time in the circular history. Interpolate rather
    // than stepping between 20 Hz samples, including across the ±π yaw seam.
    const size = this.samples.length;
    let lower = (this.writeIndex - this.count + size) % size;
    let upper = lower;
    for (let n = 1; n < this.count; n++) {
      const i = (lower + 1) % size;
      if (this.sampleTimes[i] > targetTime) {
        upper = i;
        break;
      }
      lower = i;
      upper = i;
    }
    this._lower = lower;
    const span = this.sampleTimes[upper] - this.sampleTimes[lower];
    const blend = span > 0 ? saturate((targetTime - this.sampleTimes[lower]) / span) : 0;
    this.last.copy(this.echo.position);
    this.echo.position.copy(this.samples[lower]).lerp(this.samples[upper], blend);
    this.echo.position.y = 0;
    const dx = this.echo.position.x - this.last.x;
    const dz = this.echo.position.z - this.last.z;
    if (this.echoRig) {
      const yaw = this.yawHistory[lower];
      const delta = this.yawHistory[upper] - yaw;
      const deltaYaw = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.echo.rotation.y = yaw + deltaYaw * blend;
      const bones = this.poseCopies;
      const lowerBase = lower * bones.length * BONE_STRIDE;
      const upperBase = upper * bones.length * BONE_STRIDE;
      for (let i = 0; i < bones.length; i++) {
        const bone = bones[i];
        const offset = i * BONE_STRIDE;
        bone.quaternion.fromArray(this.poseHistory, lowerBase + offset).normalize();
        this.poseQuaternion.fromArray(this.poseHistory, upperBase + offset).normalize();
        bone.quaternion.slerp(this.poseQuaternion, blend);
        bone.position.fromArray(this.poseHistory, lowerBase + offset + 4);
        this.posePosition.fromArray(this.poseHistory, upperBase + offset + 4);
        bone.position.lerp(this.posePosition, blend);
      }
    } else if (dx * dx + dz * dz > 1e-6) {
      this.echo.rotation.y = Math.atan2(dx, dz);
    }
    // The fallback figure swings its limbs with its walking speed.
    const stride = Math.min(1, (Math.hypot(dx, dz) / Math.max(dt, 0.001)) * 0.2);
    for (let i = 0; i < 4; i++) this.limbs[i].rotation.x = Math.sin(this.age * 8 + i * Math.PI) * stride * 0.5;

    // The figure stands `echoSide`/`echoBack` off its path point, in the
    // echo's own frame; pulses, sigil and haze centre on the figure.
    this.figure.position.set(-c.echoSide, 0, -c.echoBack);
    const yaw = this.echo.rotation.y;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    this.figurePos.set(
      this.echo.position.x + this.figure.position.x * cy + this.figure.position.z * sy,
      0,
      this.echo.position.z - this.figure.position.x * sy + this.figure.position.z * cy
    );
    const fp = this.figurePos;
    this.ground.position.set(fp.x, 0.035, fp.z);
    this.ground.scale.setScalar(c.pulseRadius * 2);
    this._heat = Math.max(0, 1 - (this.nextPulse - this.age) / Math.max(0.01, c.preheat));
    this.skin.uniforms.uHeat.value = this._heat;
    this.groundMat.uniforms.uPulse.value = saturate((this.age - this.lastPulse) / Math.max(0.01, c.pulseRingTime));
    this.position.copy(fp);

    let pulses = 0;
    while (this.age >= this.nextPulse && pulses++ < 4) {
      this.nextPulse += Math.max(0.05, c.pulseInterval);
      this.lastPulse = this.age;
      this.groundMat.uniforms.uPulse.value = 0;
      this._pulseFx();
      const found = this.ctx.dummies?.findTargets?.(fp.x, fp.z, c.pulseRadius, this.found) ?? [];
      this._force.impulse = c.pulseForce;
      this._force.lift = c.pulseLift;
      this._force.spin = c.pulseSpin;
      for (const d of found) {
        const x = d.position.x - fp.x;
        const z = d.position.z - fp.z;
        const r = Math.hypot(x, z) || 1;
        const struck = d.kill?.(x / r, z / r, this._force, false);
        // Like Emberveil's scorch stain, the look travels with the actual
        // struck body rather than being a separate unattached decoration.
        if (struck) {
          d.corrode?.(c.scorchAmount, c.scorchLook);
          this._hitCount++;
          this._strikeFx(d, fp);
        }
      }
    }
  }

  onTravel(dt) {
    this._updateEcho(dt);
    this._present(dt, 1);
    this._updateBrand(dt, 1);
  }

  onImpact() {}

  onFade(dt, t) {
    this._updateEcho(dt);
    this._present(dt, t);
    this._updateBrand(dt, t > 1 ? saturate((2 - t) * 4) : 1);
  }

  /* ------------------------------------------------------------------ */
  /* The look                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Drive every layer from the cast's clock and the live settings.
   * @param {number} t the base phase parameter (1..2 in the fade)
   */
  _present(dt, t) {
    const c = this.config;
    const g = settings.global;
    // Ambient clock: held under reduced motion, scaled by the global speed.
    if (!this.reduceMotion) this._clock += dt * g.animationSpeed;
    const clock = this._clock;

    // Condense over `formTime`; crumble over the last `burnOutTime`.
    this._form = Math.min(1, this.age / Math.max(0.01, c.formTime));
    let remaining = Infinity;
    if (this.phase === AbilityPhase.FADE && t > 1) remaining = (2 - t) * this.fadeDuration;
    this._crumble = 1 - saturate(remaining / Math.max(0.01, c.burnOutTime));
    // The last quarter also thins, as before, so the exit never snaps.
    const exitFade = t > 1 ? saturate((2 - t) * 4) : 1;
    const live = (1 - this._crumble) * exitFade;

    // 1 · body
    const opacity = c.echoOpacity * g.opacity * exitFade;
    this.skin.uniforms.uOpacity.value = opacity;
    const ss = this._skinState;
    ss.clock = clock;
    ss.heat = this._heat;
    ss.form = this._form;
    ss.crumble = this._crumble;
    ss.origin.copy(this.figurePos);
    this.skin.userData.sync(ss);
    if (this.rigMaterial) {
      const rs = this._rigState;
      rs.clock = clock;
      rs.heat = this._heat;
      rs.form = this._form;
      rs.crumble = this._crumble;
      rs.height = this._rigHeight;
      rs.opacity = opacity;
      this.rigMaterial.userData.sync(rs);
      // The depth pass ignores the crust's dissolve, so the echo only casts
      // a shadow while it stands whole.
      const whole = this._form >= 1 && this._crumble <= 0;
      for (let i = 0; i < this.rigMeshes.length; i++) this.rigMeshes[i].castShadow = whole;
    }

    // 2 · sigil (uPulse belongs to the pulse clock in `_updateEcho`)
    const fx = this._fxState;
    fx.clock = clock;
    fx.heat = this._heat;
    fx.power = live;
    this.groundMat.uniforms.uOpacity.value = c.sigilOpacity * g.opacity * Math.min(1, this._form * 2) * exitFade;
    this.groundMat.userData.sync(fx);

    // 3 · fuse
    this._drawFuse(c);
    fx.power = live * this._form;
    this.fuseMat.userData.sync(fx);

    // 4 · ember column
    this.sparkMat.uniforms.uOpacity.value = c.emberOpacity * g.opacity * exitFade;
    this.sparkMat.uniforms.uRate.value = c.emberRate;
    this.sparkMat.userData.sync(fx);

    // 5 · haze — strongest at the pulse, gone under reduced motion
    this.haze.visible = !this.reduceMotion && c.hazeStrength > 0;
    this.haze.position.copy(this.figurePos);
    fx.power = live * this._form * (0.45 + 0.55 * Math.max(this._heat, 1 - this.groundMat.uniforms.uPulse.value));
    this.hazeMat.userData.sync(fx);

    // 6 · particles
    this._syncParticles(c, g);
    this._shed(dt, c, g, live);
    if (this._crumble > 0 && !this._collapsed) this._collapse(c, g);
  }

  /**
   * Rewrite the fuse ribbon along the recorded path, from the echo's feet
   * (u = 0) to the caster (u = 1), resampled to at most `FUSE_POINTS`.
   */
  _drawFuse(c) {
    const pos = this.fuseGeo.attributes.position;
    const size = this.samples.length;
    const lower = this._lower ?? (this.writeIndex - this.count + size) % size;
    const newest = (this.writeIndex - 1 + size) % size;
    const available = ((newest - lower + size) % size) + 1;
    const points = Math.max(2, Math.min(FUSE_POINTS, available + 1));
    for (let i = 0; i < FUSE_POINTS; i++) {
      const k = Math.min(i, points - 1);
      this._fusePoint(k, points, lower, available, _a);
      // Tangent from the neighbours; the strip is laid flat across it.
      this._fusePoint(Math.max(0, k - 1), points, lower, available, _b);
      this._fusePoint(Math.min(points - 1, k + 1), points, lower, available, _pos);
      _dir.subVectors(_pos, _b).setY(0);
      if (_dir.lengthSq() < 1e-8) _dir.copy(this.direction);
      _dir.normalize();
      _side.crossVectors(_dir, _up);
      // Thins towards both ends so the cap never shows.
      const u = k / (points - 1);
      const w = c.trailWidth * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, u * 1.1)));
      pos.setXYZ(i * 2, _a.x - _side.x * w, 0.03, _a.z - _side.z * w);
      pos.setXYZ(i * 2 + 1, _a.x + _side.x * w, 0.03, _a.z + _side.z * w);
    }
    pos.needsUpdate = true;
    this.fuseGeo.setDrawRange(0, (points - 1) * 6);
  }

  /** Station `k` of `points`: the echo, then history samples, then the caster. */
  _fusePoint(k, points, lower, available, out) {
    if (k === 0) return out.copy(this.figurePos);
    if (k === points - 1) {
      const p = this.ctx.character?.position;
      return p ? out.copy(p) : out.copy(this.samples[(lower + available - 1) % this.samples.length]);
    }
    const s = Math.round((k / (points - 1)) * (available - 1));
    return out.copy(this.samples[(lower + s) % this.samples.length]);
  }

  _syncParticles(c, g) {
    if (this.motes) {
      this.motes.setGradient(getColor(c.colorMoteA), getColor(c.colorMoteB), getColor(c.colorMoteC), getColor(c.colorMoteD));
      const m = this.motes.uniforms;
      m.uGravity.value.set(0, c.moteLift, 0);
      m.uSizeScale.value = g.particleSize;
      m.uLifeScale.value = g.particleLifetime;
      m.uSpeedScale.value = g.particleSpeed;
      m.uOpacity.value = g.opacity;
      m.uGlow.value = c.moteGlow * g.glow;
      m.uTurbulence.value = 0.8 * g.turbulence;
    }
    if (this.ash) {
      this.ash.setGradient(getColor(c.colorAshA), getColor(c.colorAshB), getColor(c.colorAshC), getColor(c.colorAshD));
      const a = this.ash.uniforms;
      a.uGravity.value.set(0, c.ashLift, 0);
      a.uSizeScale.value = g.particleSize;
      a.uLifeScale.value = g.particleLifetime;
      a.uSpeedScale.value = g.particleSpeed;
      a.uOpacity.value = c.ashOpacity * g.opacity;
      a.uTurbulence.value = 0.6 * g.turbulence;
    }
    if (this.sparks) {
      this.sparks.setGradient(getColor(c.colorSparkA), getColor(c.colorSparkB), getColor(c.colorSparkC), getColor(c.colorSparkD));
      const k = this.sparks.uniforms;
      k.uGravity.value.set(0, -c.sparkGravity, 0);
      k.uStretch.value = c.sparkStretch;
      k.uSizeScale.value = g.particleSize;
      k.uLifeScale.value = g.particleLifetime;
      k.uSpeedScale.value = g.particleSpeed;
      k.uOpacity.value = g.opacity;
      k.uGlow.value = c.sparkGlow * g.glow;
      k.uTurbulence.value = 0.2 * g.turbulence;
    }
  }

  _resetEmit() {
    _emit.position = _pos;
    _emit.radius = 0;
    _emit.direction = _up;
    _emit.speed = 0;
    _emit.speedVariance = 0.35;
    _emit.spread = 0.5;
    _emit.inherit = null;
    _emit.anchor = null;
    _emit.size = 0.1;
    _emit.sizeVariance = 0.45;
    _emit.life = 1;
    _emit.lifeVariance = 0.35;
    _emit.spin = 0;
    _emit.tint = null;
    _emit.time = frame.uTime.value;
  }

  /** A random point on the standing body, world. */
  _bodyPoint(out, low = 0.15, high = 1.65) {
    const h = low + Math.random() * (high - low);
    const a = Math.random() * Math.PI * 2;
    const r = 0.12 + Math.random() * 0.16;
    return out.set(this.figurePos.x + Math.cos(a) * r, h, this.figurePos.z + Math.sin(a) * r);
  }

  /** Embers and ash shed continuously; heavier at the pulse and the crumble. */
  _shed(dt, c, g, live) {
    if (dt <= 0 || this._form <= 0) return;
    const boost = (0.6 + this._heat) * (1 + this._crumble * 3) * Math.max(0.15, live + this._crumble);
    if (this.motes) {
      const n = Math.round(this.moteEmitter.tick(dt, c.moteRate * boost) * g.particleCount);
      if (n > 0) {
        this._resetEmit();
        _emit.size = c.moteSize;
        _emit.life = c.moteLife;
        _emit.speed = c.moteSpeed;
        _emit.spread = 0.8;
        _emit.radius = 0.05;
        // Shed from where the crust still stands (below the crumble line).
        const top = 1.65 * (1 - this._crumble * 0.9);
        for (let i = 0; i < n; i++) {
          this._bodyPoint(_pos, 0.15, Math.max(0.2, top));
          this.motes.emit(1, _emit);
        }
      }
    }
    if (this.ash) {
      const n = Math.round(this.ashEmitter.tick(dt, c.ashRate * boost) * g.particleCount);
      if (n > 0) {
        this._resetEmit();
        _emit.size = c.ashSize;
        _emit.life = c.ashLife;
        _emit.speed = 0.3;
        _emit.spread = 0.9;
        _emit.radius = 0.08;
        _emit.spin = 0.6;
        for (let i = 0; i < n; i++) {
          this._bodyPoint(_pos, 0.3, 1.6);
          this.ash.emit(1, _emit);
        }
      }
    }
  }

  /** The pulse beat: ring, marks on the floor, sparks, light, a light knock. */
  _pulseFx() {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    _pos.copy(this.figurePos).setY(0);
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: c.pulseRadius * power,
      life: c.shockLife,
      width: 0.06,
      intensity: 1,
      colorA: getColor(c.colorShockA),
      colorB: getColor(c.colorShockB)
    });
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _pos, {
      radius: c.pulseRadius * c.scorchDecal,
      life: c.scorchDecalLife,
      intensity: 0.5,
      colorA: getColor(c.scorchLook.rimColor),
      colorB: getColor(c.scorchLook.color)
    });
    if (this.sparks && c.pulseSparks > 0) {
      this._resetEmit();
      _pos.copy(this.figurePos).setY(0.9);
      _emit.radius = 0.25;
      _emit.speed = c.sparkSpeed;
      _emit.speedVariance = 0.5;
      _emit.spread = 1;
      _emit.size = c.sparkSize;
      _emit.life = c.sparkLife;
      this.sparks.emit(Math.round(c.pulseSparks * g.particleCount), _emit);
    }
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.pulseLight * power);
    if (!this.reduceMotion && c.pulseShake > 0) this.ctx.shake?.add?.(c.pulseShake * power, c.shakeDecay, 18);
  }

  /** A blow from `from` felled `dummy`: a fire shell on it, sparks, a flash, a knock. */
  _strikeFx(dummy, from) {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    _pos.copy(dummy.position).setY(0.9);
    this.ctx.bursts?.spawn?.(BurstMode.FIRE, _pos, {
      radius: c.burstSize * 0.2,
      endRadius: c.burstSize * power,
      life: 0.5,
      intensity: c.burstIntensity,
      opacity: 0.8,
      fresnel: 1.5 * g.fresnel,
      displace: 0.3,
      turbulence: 0.9 * g.turbulence,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    _a.copy(dummy.position).setY(0);
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _a, {
      radius: Math.max(0.3, c.burstSize * 0.9),
      life: c.scorchDecalLife,
      intensity: 1,
      colorA: getColor(c.scorchLook.rimColor),
      colorB: getColor(c.scorchLook.color)
    });
    if (this.sparks) {
      this._resetEmit();
      _dir.subVectors(dummy.position, from).setY(0);
      if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
      _dir.normalize().addScaledVector(_up, 0.8).normalize();
      _emit.direction = _dir;
      _emit.radius = 0.3;
      _emit.speed = c.sparkSpeed * 0.8;
      _emit.spread = 0.8;
      _emit.size = c.sparkSize;
      _emit.life = c.sparkLife;
      this.sparks.emit(Math.round(c.pulseSparks * 0.8 * g.particleCount), _emit);
    }
    if (this.motes) {
      this._resetEmit();
      _emit.radius = 0.35;
      _emit.speed = c.moteSpeed * 2.5;
      _emit.spread = 1;
      _emit.size = c.moteSize * 1.3;
      _emit.life = c.moteLife;
      this.motes.emit(Math.round(20 * g.particleCount), _emit);
    }
    if (c.hitFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorFlash), c.hitFlash * power);
    if (!this.reduceMotion && c.hitShake > 0) this.ctx.shake?.add?.(c.hitShake * power, c.shakeDecay, 22);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.pulseLight * 1.6 * power);
  }

  /** The crumble begins: one sigh of ash and embers off the whole body. */
  _collapse(c, g) {
    this._collapsed = true;
    if (this.ash && c.collapseAsh > 0) {
      this._resetEmit();
      _emit.size = c.ashSize * 1.4;
      _emit.life = c.ashLife * 1.2;
      _emit.speed = 0.5;
      _emit.spread = 1;
      _emit.radius = 0.1;
      _emit.spin = 0.8;
      const n = Math.round(c.collapseAsh * g.particleCount);
      for (let i = 0; i < n; i++) {
        this._bodyPoint(_pos, 0.1, 1.7);
        this.ash.emit(1, _emit);
      }
    }
    if (this.motes && c.collapseEmbers > 0) {
      this._resetEmit();
      _emit.size = c.moteSize * 1.2;
      _emit.life = c.moteLife * 1.3;
      _emit.speed = c.moteSpeed * 1.8;
      _emit.spread = 1;
      _emit.radius = 0.1;
      const n = Math.round(c.collapseEmbers * g.particleCount);
      for (let i = 0; i < n; i++) {
        this._bodyPoint(_pos, 0.1, 1.7);
        this.motes.emit(1, _emit);
      }
    }
    _pos.copy(this.figurePos).setY(0);
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _pos, {
      radius: c.pulseRadius * c.scorchDecal * 0.8,
      life: c.scorchDecalLife * 1.5,
      intensity: 0.9,
      colorA: getColor(c.scorchLook.rimColor),
      colorB: getColor(c.scorchLook.color)
    });
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.pulseLight * g.explosionIntensity);
  }


  /* ------------------------------------------------------------------ */
  /* The echo repeats your cast: brand, landing, cinder crown            */
  /* ------------------------------------------------------------------ */

  /**
   * Charge the coal in the echo's hand, fly it to the aimed point, land it
   * once, then run the crown. `exitFade` is the cast's own exit (1 → 0).
   */
  _updateBrand(dt, exitFade) {
    const c = this.config;
    const g = settings.global;
    const clock = this._clock;
    // The hand: chest-high in front of the figure, turned toward the aim.
    _dir.subVectors(this.aim, this.figurePos).setY(0);
    if (_dir.lengthSq() < 1e-6) _dir.copy(this.direction);
    _dir.normalize();
    this.hand.copy(this.figurePos).addScaledVector(_dir, 0.38).setY(1.45);

    const chargeStart = Math.max(0, c.brandAt - c.brandCharge);
    const bs = this._brandState;
    bs.clock = clock;

    if (!this._launched) {
      if (this.age < chargeStart || exitFade <= 0) {
        this.brand.visible = false;
        this.tail.visible = false;
      } else if (this.age < c.brandAt) {
        // Anticipation: the coal swells in the hand, the light with it.
        const k = saturate((this.age - chargeStart) / Math.max(0.01, c.brandCharge));
        this.brand.visible = true;
        this.tail.visible = false;
        this.brand.position.copy(this.hand);
        this.brand.position.y += Math.sin(clock * 9) * 0.03 * k;
        this.brand.scale.setScalar(Math.max(0.001, c.brandSize * (0.2 + 0.8 * Easing.outCubic(k))));
        if (!this.reduceMotion) this.brand.rotation.y += c.brandSpin * 0.4 * dt;
        bs.heat = k;
        this.brandMat.userData.sync(bs);
        this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.5 * k);
        this._chargeMotes(dt, c, g, k);
      } else {
        this._launched = true;
        this.launchFrom.copy(this.hand);
        this._brandPrev.copy(this.hand);
        this.brand.position.copy(this.hand);
        this._launchFx(c, g);
      }
    }

    if (this._launched && !this._landed) {
      const u = saturate((this.age - c.brandAt) / Math.max(0.01, c.brandFlight));
      this._brandPrev.copy(this.brand.position);
      // A thrown arc: straight in plan, a parabola in height, landing on the floor.
      this.brand.position.lerpVectors(this.launchFrom, this.aim, u);
      this.brand.position.y = this.launchFrom.y * (1 - u) + 0.15 * u + 4 * c.brandArc * u * (1 - u);
      this.brand.visible = true;
      this.brand.scale.setScalar(c.brandSize);
      if (!this.reduceMotion) {
        this.brand.rotation.x += c.brandSpin * dt;
        this.brand.rotation.y += c.brandSpin * 0.6 * dt;
      }
      bs.heat = 1;
      this.brandMat.userData.sync(bs);
      // The tail streams back along the flight.
      _vel.subVectors(this.brand.position, this._brandPrev);
      if (_vel.lengthSq() > 1e-8) {
        _vel.normalize().negate();
        _q.setFromUnitVectors(_up, _vel);
        this.tail.quaternion.copy(_q);
      }
      this.tail.visible = true;
      this.tail.position.copy(this.brand.position);
      this.tail.scale.set(c.brandSize * 1.2, c.brandTail, c.brandSize * 1.2);
      bs.power = exitFade;
      this.tailMat.userData.sync(bs);
      this._trail(dt, c, g);
      this.position.copy(this.brand.position);
      if (u >= 1) {
        this._landed = true;
        this._landAt = this.age;
        this.brand.visible = false;
        this.tail.visible = false;
        this._land(c, g);
      }
    }

    if (this._landed) this._updateCrown(dt, c, g, clock, exitFade);
  }

  /** Embers gathering round the hand while the coal charges. */
  _chargeMotes(dt, c, g, k) {
    if (!this.motes || dt <= 0) return;
    const n = Math.round(this.brandEmitter.tick(dt, c.brandTrailRate * 0.35 * k) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit();
    _pos.copy(this.hand);
    _emit.radius = 0.35 * (1 - k * 0.6);
    _emit.speed = c.moteSpeed * 0.5;
    _emit.spread = 1;
    _emit.size = c.moteSize * 1.1;
    _emit.life = c.moteLife * 0.5;
    this.motes.emit(n, _emit);
  }

  /** The throw: a spit of sparks off the hand. */
  _launchFx(c, g) {
    if (this.sparks) {
      this._resetEmit();
      _pos.copy(this.hand);
      _emit.direction = _dir;
      _emit.radius = 0.1;
      _emit.speed = c.sparkSpeed * 0.7;
      _emit.spread = 0.6;
      _emit.size = c.sparkSize;
      _emit.life = c.sparkLife;
      this.sparks.emit(Math.round(c.brandSparks * 0.25 * g.particleCount), _emit);
    }
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * 0.8 * g.explosionIntensity);
  }

  /** Embers, sparks and ash smoke laid along the segment the coal just flew. */
  _trail(dt, c, g) {
    if (dt <= 0) return;
    if (this.motes) {
      const n = Math.round(this.brandEmitter.tick(dt, c.brandTrailRate) * g.particleCount);
      if (n > 0) {
        this._resetEmit();
        _emit.radius = c.brandSize * 0.3;
        _emit.speed = c.moteSpeed * 0.6;
        _emit.spread = 1;
        _emit.size = c.moteSize * 1.4;
        _emit.life = c.moteLife * 0.8;
        for (let i = 0; i < n; i++) {
          _pos.lerpVectors(this._brandPrev, this.brand.position, Math.random());
          this.motes.emit(1, _emit);
        }
      }
    }
    if (this.ash) {
      const n = Math.round(this.brandSmokeEmitter.tick(dt, c.brandSmokeRate) * g.particleCount);
      if (n > 0) {
        this._resetEmit();
        _emit.radius = c.brandSize * 0.25;
        _emit.speed = 0.25;
        _emit.spread = 1;
        _emit.size = c.ashSize * 1.2;
        _emit.life = c.ashLife * 0.8;
        _emit.spin = 0.7;
        for (let i = 0; i < n; i++) {
          _pos.lerpVectors(this._brandPrev, this.brand.position, Math.random());
          this.ash.emit(1, _emit);
        }
      }
    }
  }

  /** The landing beat: strike, shell, shockwave, sparks, flash, knock, light. */
  _land(c, g) {
    const power = g.explosionIntensity;
    const at = this.aim;
    // Gameplay: everything inside `brandRadius` is struck once, thrown outward.
    const found = this.ctx.dummies?.findTargets?.(at.x, at.z, c.brandRadius, this.found) ?? [];
    this._force.impulse = c.brandForce;
    this._force.lift = c.brandLift;
    this._force.spin = c.brandTumble;
    for (const d of found) {
      const x = d.position.x - at.x;
      const z = d.position.z - at.z;
      const r = Math.hypot(x, z) || 1;
      if (d.kill?.(x / r, z / r, this._force, false)) {
        d.corrode?.(c.scorchAmount, c.scorchLook);
        this._hitCount++;
        this._strikeFx(d, at);
      }
    }
    _pos.copy(at).setY(0.5);
    this.ctx.bursts?.spawn?.(BurstMode.FIRE, _pos, {
      radius: c.brandRadius * 0.15,
      endRadius: c.brandRadius * c.brandBurst * power,
      life: 0.6,
      intensity: c.burstIntensity * 1.3,
      opacity: 0.85,
      fresnel: 1.5 * g.fresnel,
      displace: 0.35,
      turbulence: 0.9 * g.turbulence,
      colorA: getColor(c.colorCinderA),
      colorB: getColor(c.colorCinderC),
      colorC: getColor(c.colorCinderD)
    });
    _pos.copy(at).setY(0);
    this.ctx.decals?.spawn?.(DecalType.SHOCKWAVE, _pos, {
      radius: c.brandRadius * 1.6 * power,
      life: 0.7,
      width: 0.08,
      intensity: 1.2,
      colorA: getColor(c.colorCinderC),
      colorB: getColor(c.colorCinderA)
    });
    this.ctx.decals?.spawn?.(DecalType.SCORCH, _pos, {
      radius: c.brandRadius * c.fieldScale * 1.05,
      life: Math.max(c.scorchDecalLife, c.crownLife + c.crownCrumble + 1),
      intensity: 0.9,
      colorA: getColor(c.scorchLook.rimColor),
      colorB: getColor(c.scorchLook.color)
    });
    if (this.sparks && c.brandSparks > 0) {
      this._resetEmit();
      _pos.copy(at).setY(0.3);
      _emit.radius = c.brandRadius * 0.25;
      _emit.speed = c.sparkSpeed * 1.3;
      _emit.speedVariance = 0.5;
      _emit.spread = 0.9;
      _emit.size = c.sparkSize * 1.2;
      _emit.life = c.sparkLife * 1.4;
      this.sparks.emit(Math.round(c.brandSparks * g.particleCount), _emit);
    }
    if (this.motes) {
      this._resetEmit();
      _pos.copy(at).setY(0.4);
      _emit.radius = c.brandRadius * 0.5;
      _emit.speed = c.moteSpeed * 2;
      _emit.spread = 1;
      _emit.size = c.moteSize * 1.4;
      _emit.life = c.moteLife;
      this.motes.emit(Math.round(60 * g.particleCount), _emit);
    }
    if (this.ash) {
      this._resetEmit();
      _pos.copy(at).setY(0.3);
      _emit.radius = c.brandRadius * 0.45;
      _emit.speed = 0.9;
      _emit.spread = 0.7;
      _emit.size = c.ashSize * 1.8;
      _emit.life = c.ashLife;
      _emit.spin = 0.8;
      this.ash.emit(Math.round(30 * g.particleCount), _emit);
    }
    if (c.brandFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorFlash), c.brandFlash * power);
    if (!this.reduceMotion && c.brandShake > 0) this.ctx.shake?.add?.(c.brandShake * power, c.shakeDecay * 0.7, 20);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.brandLight * power);
  }

  /** The cinder crown and field: rise, cool, settle, sway, crumble. */
  _updateCrown(dt, c, g, clock, exitFade) {
    const k = this.age - this._landAt;
    const R = c.brandRadius;
    const n = Math.min(MAX_SPIRES, Math.max(0, Math.round(c.spireCount)));
    const rise = saturate(k / Math.max(0.01, c.spireRise));
    const riseE = Easing.outBack(rise);
    const life = Math.max(0.1, c.crownLife);
    const linger = Easing.inOutQuad(saturate(k / life));
    const crumble = Math.max(saturate((k - life) / Math.max(0.05, c.crownCrumble)), 1 - exitFade);
    const heat = Math.pow(0.5, k / Math.max(0.05, c.spireCool));
    // Each echo pulse re-flares the stone it raised.
    const pulse = (1 - this.groundMat.uniforms.uPulse.value) * 0.8 + this._heat * 0.3;
    const sway = this.reduceMotion ? 0 : c.spireSway;

    for (let i = 0; i < n; i++) {
      const d = i * SPIRE_DICE;
      const d0 = this.spireDice[d];
      const d1 = this.spireDice[d + 1];
      const d2 = this.spireDice[d + 2];
      const d3 = this.spireDice[d + 3];
      // Seat derived from the zone: the crown always rings `brandRadius`.
      const a = this._crownYaw + (i / Math.max(1, n)) * TAU + (d0 - 0.5) * (TAU / Math.max(1, n)) * 0.5;
      const r = c.spireRing * R * (0.78 + 0.44 * d1);
      const h = Math.max(0.001, c.spireHeight * (0.58 + 0.42 * d2) * riseE);
      const w = 0.7 * c.spireWidth * (0.75 + 0.5 * d1) * (0.55 + 0.45 * Math.min(1, riseE));
      const sink = c.spireSettle * linger * (0.6 + 0.8 * d3) + crumble * h * 0.15;
      const lean = c.spireLean * (0.55 + 0.9 * d3) + c.spireTilt * linger + sway * Math.sin(clock * 1.7 + i * 1.3);
      _obj.position.set(this.aim.x + Math.cos(a) * r, -sink, this.aim.z + Math.sin(a) * r);
      // Yaw so the spire's +z faces outward, then tilt its crown outward.
      _obj.rotation.set(lean, Math.atan2(Math.cos(a), Math.sin(a)), 0);
      _obj.scale.set(w, h, w * (0.8 + 0.4 * d0));
      _obj.updateMatrix();
      this.spires.setMatrixAt(i, _obj.matrix);
    }
    this.spires.count = n;
    this.spires.instanceMatrix.needsUpdate = true;
    this.spires.visible = n > 0 && crumble < 1;
    const ss = this._spireState;
    ss.clock = clock;
    ss.heat = heat;
    ss.pulse = pulse;
    ss.crumble = crumble;
    this.spireMat.userData.sync(ss);

    // The torn floor stays until the cast itself fades.
    this.field.visible = exitFade > 0;
    this.field.position.set(this.aim.x, 0.03, this.aim.z);
    this.field.scale.setScalar(c.fieldScale * R * 2);
    const fs = this._fieldState;
    fs.clock = clock;
    fs.opacity = exitFade;
    fs.reveal = saturate(k / Math.max(0.01, c.fieldReveal));
    fs.heat = Math.pow(0.5, k / Math.max(0.05, c.fieldCool));
    fs.pulse = pulse;
    this.fieldMat.userData.sync(fs);

    // Heat haze over the crown, strongest while the stone is hot.
    const hz = this._crownHazeState;
    hz.clock = clock;
    hz.power = c.crownHaze / Math.max(0.01, c.hazeStrength) * heat * (1 - crumble) * exitFade;
    this.crownHazeMat.userData.sync(hz);
    this.crownHazeMat.uniforms.uWidth.value = R * c.spireRing * 1.3;
    this.crownHazeMat.uniforms.uHeight.value = c.spireHeight * 1.5;
    this.crownHaze.position.set(this.aim.x, 0, this.aim.z);
    this.crownHaze.visible = !this.reduceMotion && hz.power > 0.01 && c.hazeStrength > 0;

    // Embers and ash rising off the crown; a sigh of both as it crumbles.
    this._crownShed(dt, c, g, heat, crumble, n, R);
    if (crumble > 0 && !this._crownCollapsed) {
      this._crownCollapsed = true;
      if (this.ash) {
        this._resetEmit();
        _pos.copy(this.aim).setY(1);
        _emit.radius = c.spireRing * R;
        _emit.speed = 0.6;
        _emit.spread = 1;
        _emit.size = c.ashSize * 1.6;
        _emit.life = c.ashLife * 1.2;
        _emit.spin = 0.8;
        this.ash.emit(Math.round(c.collapseAsh * g.particleCount), _emit);
      }
    }

    // The light leaves the echo for the landing, then drifts back.
    const w = saturate(1 - (k - 0.5) / 1.4);
    this.position.lerpVectors(this.figurePos, this.aim, w);
  }

  _crownShed(dt, c, g, heat, crumble, n, R) {
    if (dt <= 0 || n <= 0 || crumble >= 1) return;
    const boost = (0.35 + heat) * (1 + crumble * 4);
    if (this.motes) {
      const m = Math.round(this.crownEmitter.tick(dt, c.crownEmbers * boost) * g.particleCount);
      if (m > 0) {
        this._resetEmit();
        _emit.radius = 0.15;
        _emit.speed = c.moteSpeed;
        _emit.spread = 0.6;
        _emit.size = c.moteSize * 1.2;
        _emit.life = c.moteLife * 1.2;
        for (let i = 0; i < m; i++) {
          const a = Math.random() * TAU;
          const r = Math.sqrt(Math.random()) * c.spireRing * R * 1.15;
          _pos.set(this.aim.x + Math.cos(a) * r, 0.1 + Math.random() * c.spireHeight * 0.8 * (1 - crumble * 0.7), this.aim.z + Math.sin(a) * r);
          this.motes.emit(1, _emit);
        }
      }
    }
    if (this.ash) {
      const m = Math.round(this.crownSmokeEmitter.tick(dt, c.crownSmoke * (0.5 + crumble * 3)) * g.particleCount);
      if (m > 0) {
        this._resetEmit();
        _emit.radius = 0.2;
        _emit.speed = 0.35;
        _emit.spread = 0.8;
        _emit.size = c.ashSize * 1.4;
        _emit.life = c.ashLife;
        _emit.spin = 0.6;
        for (let i = 0; i < m; i++) {
          const a = Math.random() * TAU;
          const r = c.spireRing * R * (0.7 + Math.random() * 0.5);
          _pos.set(this.aim.x + Math.cos(a) * r, 0.4 + Math.random() * c.spireHeight * 0.7, this.aim.z + Math.sin(a) * r);
          this.ash.emit(1, _emit);
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    this.count = 0;
    this.echo.visible = false;
    this.brand.visible = false;
    this.tail.visible = false;
    this.spires.visible = false;
    this.spires.count = 0;
    this.field.visible = false;
    this.crownHaze.visible = false;
    this.brandEmitter.reset();
    this.brandSmokeEmitter.reset();
    this.crownEmitter.reset();
    this.crownSmokeEmitter.reset();
    this.ground.visible = false;
    this.fuse.visible = false;
    this.haze.visible = false;
    this.moteEmitter.reset();
    this.ashEmitter.reset();
  }

  dispose() {
    for (const g of [this.bodyGeo, this.limbGeo, this.headGeo, this.groundGeo, this.sparkGeo, this.fuseGeo, this.hazeGeo, this.brandGeo, this.tailGeo, this.spireGeo]) g.dispose();
    for (const m of [this.skin, this.groundMat, this.sparkMat, this.fuseMat, this.hazeMat, this.brandMat, this.tailMat, this.spireMat, this.fieldMat, this.crownHazeMat]) m.dispose();
    this.spires.dispose();
    if (this.echoRig?.traverse) {
      // The clone shares geometry with the caster but owns its skeletons
      // (and their bone textures).
      this.echoRig.traverse((node) => {
        if (node.isSkinnedMesh) node.skeleton?.dispose?.();
      });
      this.echoRig.parent?.remove(this.echoRig);
    }
    this.rigMaterial?.dispose();
    super.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

/** A sub-folder where the host GUI has them; the parent folder otherwise. */
function sub(folder, title) {
  return typeof folder.addFolder === 'function' ? folder.addFolder(title) : folder;
}

/** `Editor.gradient` where sub-folders exist, four plain colours otherwise. */
function gradient(folder, c, prefix, title, Editor) {
  if (typeof folder.addFolder === 'function' && Editor.gradient) return Editor.gradient(folder, c, prefix, title);
  for (const [k, label] of [['A', 'birth'], ['B', 'early'], ['C', 'late'], ['D', 'death']]) folder.addColor(c, `${prefix}${k}`).name(`${title} ${label}`);
  return folder;
}

export function buildEditor(gui, c, Editor) {
  const folder = gui.addFolder('♨  Ashen Doppelganger');
  const R = Editor.range;

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 0, 48, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 1, 90, 0.5, 'front speed');
  R(cast, c, 'lifetime', 0.1, 12, 0.05, 'nominal lifetime');
  R(cast, c, 'cooldown', 0, 30, 0.1, 'cooldown');
  if (Editor.castAnimation) Editor.castAnimation(cast, c);
  cast.addColor(c, 'lightColor').name('light colour');
  R(cast, c, 'lightIntensity', 0, 40, 0.1, 'light intensity');
  R(cast, c, 'lightRadius', 0.5, 40, 0.1, 'light radius');

  const rules = sub(folder, 'The echo (gameplay)');
  R(rules, c, 'delay', 0.1, 2, 0.05, 'echo delay (s)');
  R(rules, c, 'duration', 1, 8, 0.1, 'duration (s)');
  R(rules, c, 'pulseInterval', 0.2, 2, 0.05, 'pulse interval (s)');
  R(rules, c, 'pulseRadius', 0.5, 5, 0.1, 'pulse radius (m)');
  R(rules, c, 'pulseForce', 0, 12, 0.1, 'pulse force');
  R(rules, c, 'pulseLift', 0, 8, 0.05, 'pulse lift');
  R(rules, c, 'pulseSpin', 0, 4, 0.05, 'pulse tumble');
  R(rules, c, 'scorchAmount', 0, 1, 0.01, 'scorch amount');
  rules.addColor(c.scorchLook, 'color').name('scorch colour');
  rules.addColor(c.scorchLook, 'rimColor').name('scorch rim');
  R(rules, c.scorchLook, 'rimEmissive', 0, 4, 0.05, 'rim glow');
  rules.addColor(c.scorchLook, 'edgeColor').name('scorch edge');
  R(rules, c.scorchLook, 'edgeEmissive', 0, 4, 0.05, 'edge glow');

  const body = sub(folder, '1 · The echo body');
  R(body, c, 'echoOpacity', 0, 1, 0.01, 'opacity');
  R(body, c, 'formTime', 0.01, 2, 0.01, 'condenses over (s)');
  R(body, c, 'burnOutTime', 0.05, 3, 0.01, 'crumbles over (s)');
  R(body, c, 'fissureScale', 2, 60, 0.5, 'crack density');
  R(body, c, 'fissureSpeed', 0, 8, 0.05, 'crack crawl');
  R(body, c, 'crustGrain', 1, 60, 0.5, 'char grain');
  R(body, c, 'fissureGlow', 0, 8, 0.05, 'crack glow');
  R(body, c, 'rimGlow', 0, 4, 0.01, 'rim glow');
  R(body, c, 'preheat', 0.01, 1, 0.01, 'flares before pulse (s)');
  R(body, c, 'heatFlare', 0, 4, 0.05, 'pulse flare');
  R(body, c, 'wobble', 0, 0.2, 0.001, 'heat sway (m)');
  R(body, c, 'burnEdge', 0.005, 0.4, 0.005, 'burn edge');
  body.addColor(c, 'colorCharA').name('char cool');
  body.addColor(c, 'colorCharB').name('char warm');
  body.addColor(c, 'colorFissure').name('cracks');
  body.addColor(c, 'colorRim').name('rim');
  body.addColor(c, 'colorBurnEdge').name('burn edge');
  R(body, c, 'rigEmissive', 0, 6, 0.05, 'rig glow');
  body.addColor(c, 'colorRigBody').name('rig body');
  body.addColor(c, 'colorRigEmissive').name('rig emissive');
  body.addColor(c, 'colorRigAsh').name('rig ash flecks');
  R(body, c, 'echoSide', -3, 3, 0.05, 'stands to the side (m)');
  R(body, c, 'echoBack', -3, 3, 0.05, 'stands behind (m)');

  const sigil = sub(folder, '2 · Sigil and pulse ring');
  R(sigil, c, 'sigilOpacity', 0, 1, 0.01, 'opacity');
  R(sigil, c, 'sigilGlow', 0, 6, 0.05, 'glow');
  R(sigil, c, 'sigilRing', 0.2, 0.95, 0.01, 'ring radius');
  R(sigil, c, 'sigilCracks', 0, 32, 1, 'cracks');
  R(sigil, c, 'pulseRingTime', 0.05, 2, 0.01, 'ring runs out over (s)');
  sigil.addColor(c, 'colorSigil').name('colour');
  sigil.addColor(c, 'colorSigilHot').name('hot');

  const fuse = sub(folder, '3 · The fuse');
  R(fuse, c, 'trailWidth', 0, 1, 0.01, 'half-width (m)');
  R(fuse, c, 'trailGlow', 0, 6, 0.05, 'glow');
  R(fuse, c, 'trailOpacity', 0, 1, 0.01, 'opacity');
  R(fuse, c, 'trailFlicker', 0, 3, 0.05, 'gutter');
  fuse.addColor(c, 'colorTrailHot').name('hot');
  fuse.addColor(c, 'colorTrailAsh').name('ash');

  const column = sub(folder, '4 · Ember column');
  R(column, c, 'emberOpacity', 0, 1, 0.01, 'opacity');
  R(column, c, 'emberRate', 0, 6, 0.1, 'ember drift');
  R(column, c, 'emberHeight', 0.3, 5, 0.05, 'height (m)');
  R(column, c, 'emberSize', 1, 60, 0.5, 'size');
  column.addColor(c, 'colorEmberA').name('cool');
  column.addColor(c, 'colorEmberB').name('hot');

  const haze = sub(folder, '5 · Heat haze');
  R(haze, c, 'hazeStrength', 0, 3, 0.01, 'strength');
  R(haze, c, 'hazeWidth', 0.2, 4, 0.05, 'half-width (m)');
  R(haze, c, 'hazeHeight', 0.3, 6, 0.05, 'height (m)');
  R(haze, c, 'hazeScale', 0.2, 8, 0.05, 'noise scale');
  R(haze, c, 'hazeSpeed', 0, 6, 0.05, 'rise speed');

  const fx = sub(folder, '6 · Particles');
  R(fx, c, 'moteRate', 0, 200, 1, 'embers/second');
  R(fx, c, 'moteSize', 0.005, 0.4, 0.001, 'ember size');
  R(fx, c, 'moteSpeed', 0, 6, 0.05, 'ember speed');
  R(fx, c, 'moteLife', 0.1, 5, 0.05, 'ember lifetime');
  R(fx, c, 'moteLift', -4, 6, 0.05, 'ember rise');
  R(fx, c, 'moteGlow', 0, 10, 0.05, 'ember glow');
  gradient(fx, c, 'colorMote', 'ember gradient', Editor);
  R(fx, c, 'ashRate', 0, 120, 1, 'ash/second');
  R(fx, c, 'ashSize', 0.02, 1.5, 0.01, 'ash size');
  R(fx, c, 'ashLife', 0.1, 6, 0.05, 'ash lifetime');
  R(fx, c, 'ashLift', -2, 4, 0.05, 'ash rise');
  R(fx, c, 'ashOpacity', 0, 1, 0.01, 'ash opacity');
  gradient(fx, c, 'colorAsh', 'ash gradient', Editor);
  R(fx, c, 'pulseSparks', 0, 200, 1, 'sparks per pulse');
  R(fx, c, 'sparkSpeed', 0, 20, 0.1, 'spark speed');
  R(fx, c, 'sparkSize', 0.005, 0.3, 0.001, 'spark size');
  R(fx, c, 'sparkLife', 0.05, 3, 0.01, 'spark lifetime');
  R(fx, c, 'sparkGravity', -10, 30, 0.1, 'spark gravity');
  R(fx, c, 'sparkStretch', 0, 1, 0.01, 'spark stretch');
  R(fx, c, 'sparkGlow', 0, 10, 0.05, 'spark glow');
  gradient(fx, c, 'colorSpark', 'spark gradient', Editor);

  const beats = sub(folder, '7 · Pulse and strike');
  R(beats, c, 'pulseShake', 0, 1, 0.01, 'pulse knock');
  R(beats, c, 'hitShake', 0, 1.5, 0.01, 'strike knock');
  R(beats, c, 'shakeDecay', 0.5, 30, 0.1, 'knock settles');
  R(beats, c, 'pulseLight', 0, 6, 0.05, 'light punch (× intensity)');
  R(beats, c, 'hitFlash', 0, 1, 0.01, 'strike flash');
  beats.addColor(c, 'colorFlash').name('flash');
  R(beats, c, 'scorchDecal', 0, 1.5, 0.01, 'scorch mark (× radius)');
  R(beats, c, 'scorchDecalLife', 0.1, 8, 0.05, 'scorch lasts (s)');
  R(beats, c, 'shockLife', 0.05, 2, 0.01, 'shockwave lasts (s)');
  beats.addColor(c, 'colorShockA').name('shockwave');
  beats.addColor(c, 'colorShockB').name('shockwave hot');
  R(beats, c, 'burstSize', 0, 4, 0.05, 'fire shell (m)');
  R(beats, c, 'burstIntensity', 0, 4, 0.05, 'shell brightness');
  beats.addColor(c, 'colorBurstA').name('shell inner');
  beats.addColor(c, 'colorBurstB').name('shell mid');
  beats.addColor(c, 'colorBurstC').name('shell outer');
  R(beats, c, 'collapseAsh', 0, 200, 1, 'crumble ash');
  R(beats, c, 'collapseEmbers', 0, 300, 1, 'crumble embers');

  const brand = sub(folder, '8 · The echo repeats your cast');
  R(brand, c, 'brandAt', 0.05, 3, 0.01, 'throws at (s)');
  R(brand, c, 'brandCharge', 0, 1.5, 0.01, 'gathers for (s)');
  R(brand, c, 'brandFlight', 0.05, 2, 0.01, 'flight (s)');
  R(brand, c, 'brandArc', 0, 6, 0.05, 'arc height (m)');
  R(brand, c, 'brandSize', 0.05, 2, 0.01, 'coal size (m)');
  R(brand, c, 'brandSpin', 0, 30, 0.1, 'tumble (rad/s)');
  R(brand, c, 'brandGlow', 0, 8, 0.05, 'seam glow');
  R(brand, c, 'brandTail', 0, 6, 0.05, 'flame tail (m)');
  R(brand, c, 'brandTrailRate', 0, 400, 1, 'trail embers/second');
  R(brand, c, 'brandSmokeRate', 0, 200, 1, 'trail smoke/second');
  R(brand, c, 'brandRadius', 0.5, 8, 0.05, 'landing radius (m)');
  R(brand, c, 'brandForce', 0, 12, 0.1, 'landing force');
  R(brand, c, 'brandLift', 0, 8, 0.05, 'landing lift');
  R(brand, c, 'brandTumble', 0, 4, 0.05, 'landing tumble');
  R(brand, c, 'brandShake', 0, 1.5, 0.01, 'landing knock');
  R(brand, c, 'brandFlash', 0, 1, 0.01, 'landing flash');
  R(brand, c, 'brandLight', 0, 8, 0.05, 'landing light (× intensity)');
  R(brand, c, 'brandBurst', 0, 2, 0.01, 'fire shell (× radius)');
  R(brand, c, 'brandSparks', 0, 400, 1, 'landing sparks');

  const crown = sub(folder, '9 · Cinder crown');
  R(crown, c, 'spireCount', 0, 12, 1, 'spires');
  R(crown, c, 'spireRing', 0, 1.2, 0.01, 'seat (× radius)');
  R(crown, c, 'spireHeight', 0.2, 6, 0.05, 'height (m)');
  R(crown, c, 'spireWidth', 0.2, 3, 0.05, 'girth');
  R(crown, c, 'spireLean', -1, 1.2, 0.01, 'outward lean (rad)');
  R(crown, c, 'spireRise', 0.02, 1.5, 0.01, 'tears up over (s)');
  R(crown, c, 'spireSettle', 0, 2, 0.01, 'sinks over linger (m)');
  R(crown, c, 'spireTilt', 0, 1, 0.01, 'leans over linger (rad)');
  R(crown, c, 'spireSway', 0, 0.2, 0.001, 'heat sway (rad)');
  R(crown, c, 'crownLife', 0.2, 8, 0.05, 'stands for (s)');
  R(crown, c, 'crownCrumble', 0.05, 3, 0.01, 'crumbles over (s)');
  R(crown, c, 'spireCool', 0.1, 8, 0.05, 'heat half-life (s)');
  R(crown, c, 'spireVeinGlow', 0, 10, 0.05, 'vein glow');
  R(crown, c, 'spireVeinScale', 0.5, 20, 0.1, 'vein density');
  R(crown, c, 'spireRoughness', 0, 1, 0.01, 'roughness');
  crown.addColor(c, 'colorSpireRock').name('stone');
  crown.addColor(c, 'colorSpireAsh').name('ash coat');
  R(crown, c, 'crownEmbers', 0, 300, 1, 'embers/second');
  R(crown, c, 'crownSmoke', 0, 120, 1, 'ash/second');
  R(crown, c, 'crownHaze', 0, 3, 0.01, 'heat haze');

  const field = sub(folder, '10 · Cinder field');
  R(field, c, 'fieldScale', 0.2, 2.5, 0.01, 'radius (× landing radius)');
  R(field, c, 'fieldReveal', 0.02, 2, 0.01, 'tears open over (s)');
  R(field, c, 'fieldOpacity', 0, 1, 0.01, 'opacity');
  R(field, c, 'fieldGlow', 0, 8, 0.05, 'crack glow');
  R(field, c, 'fieldCool', 0.1, 10, 0.05, 'heat half-life (s)');
  R(field, c, 'fieldCrackScale', 0.3, 8, 0.05, 'plate density');
  gradient(field, c, 'colorCinder', 'cinder ramp', Editor);

  folder.close();
  return folder;
}
