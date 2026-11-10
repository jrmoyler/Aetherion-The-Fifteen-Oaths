import { DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Mesh, Object3D, Points, Quaternion, Vector3 } from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { Ability } from '../../Ability.js';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { ParticleShape } from '../../../particles/ParticleSystem.js';
import { RateEmitter } from '../../../particles/ParticleEngine.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { getColor } from '../../../utils/color.js';
import { saturate, smoothstep, Easing } from '../../../utils/math.js';
import { prefersReducedMotion } from '../ExpansionAtmosphere.js';
import { ID, UID, CONFIG } from './AbsoluteZeroThreadConfig.js';
import {
  THREAD_SEGMENTS,
  createChipGeometry,
  createIceShardGeometry,
  createMoteGeometry,
  createNeedleGeometry,
  createRosetteQuad,
  createStripGeometry,
  createThreadGeometry
} from './AbsoluteZeroThreadGeometry.js';
import {
  createChillMaterial,
  createChipMaterial,
  createMoteMaterial,
  createNeedleMaterial,
  createRimeMaterial,
  createRosetteMaterial,
  createShardMaterial,
  createSpineMaterial,
  createStatueMaterial,
  createThreadMaterial
} from './AbsoluteZeroThreadMaterials.js';

export { ID, UID, CONFIG };

const N = THREAD_SEGMENTS;
/** Statues one cast can hold at once (each a pooled rosette + ice material). */
const MAX_FROZEN = 8;
/** Crystals in the ring round each statue's feet. */
const SHARDS_PER_STATUE = 6;
/** Pooled shatter bursts. */
const MAX_SHATTERS = 8;
/** Crystals down the frost spine (both sides of the thread). */
const MAX_SPINE = 64;
/** Crystals in the terminal cluster where the needle lands (the first is the spire). */
const MAX_CLUSTER = 10;
const MAX_CRYSTALS = MAX_SPINE + MAX_CLUSTER;

// A pooled dummy may be placed and frozen again before an older cast expires.
// A cast may only vanish the specific frozen life it owns.
const frozenOwners = new WeakMap();

const _emit = {};
const _pos = new Vector3();
const _dir = new Vector3();
const _up = new Vector3(0, 1, 0);
const _axis = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _node = new Object3D();

/**
 * ABSOLUTE ZERO THREAD — Frost, line cast (matrix-expansion candidate).
 *
 * A needle of ice is thrown down the aimed line and draws a filament of
 * supercooled light behind it, arched like a thrown line, braided and
 * glinting. The floor frosts in plates behind it. Every body the filament
 * passes within `reach` is frozen `freezeDelay` later — the live rig stops
 * dead and an ice copy of that exact pose takes its place, the ice climbing
 * it from the feet — stands for `freezeDuration`, ringed by crystals and a
 * rime rosette, and then *shatters* into chips and cold vapour.
 *
 * ## Beats
 *
 *   - **anticipation** — the needle grows out of the caster's hand (outBack)
 *     and the rime starts at their feet.
 *   - **travel** — needle, filament, rime path, chill distortion, motes and a
 *     stream of frost dust off the needle run down the line.
 *   - **impact** — where the needle lands: a FROST shell, a FROST decal, a
 *     light knock; the needle bursts into dust and is gone.
 *   - **freeze** (per body) — FROST shell on the body, frost decal, vapour,
 *     light punch, a small knock; the statue's ice climbs, its shards grow.
 *   - **shatter** (per statue) — chip burst (pooled baked points + lit CHIP
 *     particles), vapour, flash, knock.
 *   - **linger and exit** — the filament stands for `lifetime`, then breaks
 *     up through a noise dissolve while the rime melts plate by plate.
 *
 * ## Layers (each a folder in the editor)
 *
 *   1. **the filament** — two crossed strips rewritten in place each frame
 *      (`THREAD_SEGMENTS` stations), bespoke additive shader.
 *   2. **the needle** — authored faceted crystal, fresnel ice shader.
 *   3. **the rime path** — ground strip, voronoi frost plates; its twin on
 *      `LAYER.DISTORTION` is the chill.
 *   4. **frost motes** — baked points over the covered line.
 *   5. **chill** — the distortion proxy.
 *   6. **the statues** — skinned clones with a per-slot ice material, a rime
 *      rosette and an instanced ring of authored shards, chips on shatter.
 *   7. **particles** — `.rime` frost dust, `.chips` lit ice, `.vapour`.
 *   8. **beats** — bursts, decals, flash, shake, light.
 *
 * ## The frost spine (2026 upgrade — the hero at play distance)
 *
 * At 8 m a filament is a line, so the thread now *grows a body*: behind the
 * needle a herringbone of opaque, sun-lit ice crystals (`spine*`, on
 * `LAYER.WORLD`, casting shadows) tears out of the rime either side of the
 * line, raked downrange and leaning out, ankle-high at the hand and
 * `spineHeight` at the end, each grown over `spineGrowDist` metres of the
 * needle's run. Where the needle lands a **terminal cluster** — a central
 * spire of `spireHeight` ringed by `clusterCount` crystals leaning out at
 * `clusterRadius` — heaves up round the frozen bodies (the impact form).
 *
 * The linger is not still: **pulses** of cold run down the thread from the
 * caster (`pulse*`), and each crystal they pass flares white and ratchets a
 * little taller (`pulseGrow`), while the whole spine creeps (`spineCreep`).
 * The exit is a **shatter sweep**: crystal by crystal from the cluster back
 * to the hand (`shatterSweep`), each bursting into lit ice chips.
 *
 * Records store dice (along, side, jitter, seed) and one `gone` flag; every
 * size, lean and time is resolved from settings each frame.
 *
 * ## Hits (`handlesOwnHits`)
 *
 * Unchanged gameplay contract. Each frame the segment of line the needle
 * crossed is scanned (`_scan`), each body once; a freeze is queued for
 * `freezeDelay` and cancelled if that body's life ends first (death, or a
 * pooled dummy standing up again — `standGeneration`). A statue vanishes its
 * dummy only if this cast still owns that frozen life (`frozenOwners`).
 *
 * ## The editor rule
 *
 * Records store only what a cast owns (who, when, which slot); every size,
 * colour, rate and glow is read from `settings[ID]` every frame. Reduced
 * motion holds the ambient animation and drops the shake and distortion.
 */
export class AbsoluteZeroThreadAbility extends Ability {
  constructor(ctx) {
    super(ID, ctx);
  }

  get handlesOwnHits() {
    return true;
  }

  get impactDuration() {
    return 0.25;
  }

  get fadeDuration() {
    // Targets at the end of the cast still need time to freeze and remain
    // frozen for the configured duration before the pool tears down the cast.
    return Math.max(
      0.2,
      this.config.lifetime,
      this.config.freezeDelay + this.config.freezeDuration + this.config.shatterLife + 0.1
    );
  }

  get instanceCount() {
    return this.frozen.length;
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */

  createShaders() {
    // 1 · the filament
    this.geometry = createThreadGeometry();
    this.material = createThreadMaterial();
    this.thread = this._mesh(this.geometry, this.material, LAYER.VFX, 12);

    // 2 · the needle
    this.needleGeometry = createNeedleGeometry();
    this.needleMaterial = createNeedleMaterial();
    this.needle = this._mesh(this.needleGeometry, this.needleMaterial, LAYER.VFX, 14);

    // 3 · the rime path, and 5 · its chill twin on the distortion layer
    this.stripGeometry = createStripGeometry();
    this.rimeMaterial = createRimeMaterial();
    this.rime = this._mesh(this.stripGeometry, this.rimeMaterial, LAYER.VFX, 1);
    this.chillMaterial = createChillMaterial();
    this.chill = this._mesh(this.stripGeometry, this.chillMaterial, LAYER.DISTORTION, 0);

    // 4 · frost motes
    this.motesGeo = createMoteGeometry();
    this.motesMat = createMoteMaterial();
    this.motes = new Points(this.motesGeo, this.motesMat);
    this.motes.layers.set(LAYER.VFX);
    this.motes.frustumCulled = false;
    this.group.add(this.motes);

    // 6 · statues: a fixed pool of slots, each a rosette and its own ice
    // material (so each statue's ice climbs on its own clock).
    this.frostRingGeometry = createRosetteQuad();
    this.frostRingMaterial = createRosetteMaterial();
    this.slots = [];
    for (let i = 0; i < MAX_FROZEN; i++) {
      const ring = this._mesh(this.frostRingGeometry, this.frostRingMaterial, LAYER.VFX, 2);
      ring.position.y = 0.035;
      this.slots.push({ ring, material: createStatueMaterial(), inUse: false });
    }
    this.iceShardGeometry = createIceShardGeometry();
    this.iceShardMaterial = createShardMaterial();
    this.iceShards = new InstancedMesh(this.iceShardGeometry, this.iceShardMaterial, MAX_FROZEN * SHARDS_PER_STATUE);
    this.iceShards.layers.set(LAYER.VFX);
    this.iceShards.frustumCulled = false;
    this.iceShards.count = 0;
    this.group.add(this.iceShards);
    this.shardTransform = new Object3D();

    // Shatter chips: one shared baked geometry, a material per pooled burst.
    this.chipGeometry = createChipGeometry();
    this.shatters = [];
    for (let i = 0; i < MAX_SHATTERS; i++) {
      const points = new Points(this.chipGeometry, createChipMaterial());
      points.layers.set(LAYER.VFX);
      points.frustumCulled = false;
      points.visible = false;
      this.group.add(points);
      this.shatters.push({ points, born: 0 });
    }

    // 9 · the frost spine + terminal cluster: one instanced mesh, lit ice.
    this.spineGeometry = createIceShardGeometry();
    this.spinePulse = new InstancedBufferAttribute(new Float32Array(MAX_CRYSTALS), 1).setUsage(DynamicDrawUsage);
    this.spineGeometry.setAttribute('aPulse', this.spinePulse);
    this.spineMaterial = createSpineMaterial();
    this.spine = new InstancedMesh(this.spineGeometry, this.spineMaterial, MAX_CRYSTALS);
    this.spine.layers.set(LAYER.WORLD);
    this.spine.castShadow = true;
    this.spine.receiveShadow = true;
    this.spine.frustumCulled = false;
    this.spine.count = 0;
    this.group.add(this.spine);
    this.crystals = [];
    for (let i = 0; i < MAX_CRYSTALS; i++) this.crystals.push({ jitter: 0, lean: 0, seed: 0, gone: false });
    this._landAge = -1;

    this.shatterCursor = 0;
    this.hit = new Set();
    this.pending = [];
    this.frozen = [];
    this.found = [];
    this._position = new Vector3();
    this._clock = 0;
    this._fade = 1;
    this._landed = false;
    this.reduceMotion = false;
    this._threadState = { clock: 0, fade: 1, head: 1 };
    this._needleState = { power: 0 };
    this._rimeState = { clock: 0, front: 0, melt: 0, length: 1, power: 1 };
    this._moteState = { clock: 0 };
    this._ringState = { clock: 0, fade: 1 };
    this._iceState = { grow: 0, opacity: 1, floor: 0, height: 1.8 };
  }

  _mesh(geometry, material, layer, order) {
    const mesh = new Mesh(geometry, material);
    mesh.layers.set(layer);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }

  createParticles() {
    const particles = this.ctx.particles;
    this.rimeEmitter = new RateEmitter();
    if (!particles?.get) {
      this.rimeDust = this.chips = this.vapour = null;
      return;
    }
    this.rimeDust = particles.get(`${ID}.rime`, {
      capacity: 1200,
      shape: ParticleShape.SOFT,
      additive: true,
      curl: true,
      softFade: 0.2
    });
    this.rimeDust.uniforms.uSizeIn.value = 0.05;
    this.rimeDust.uniforms.uFadeIn.value = 0.05;
    this.rimeDust.uniforms.uFadeOut.value = 0.5;
    this.rimeDust.uniforms.uEndSize.value = 0.5;
    this.rimeDust.uniforms.uDrag.value = 1.8;

    this.chips = particles.get(`${ID}.chips`, {
      capacity: 600,
      shape: ParticleShape.CHIP,
      additive: false,
      lit: true,
      softFade: 0.1
    });
    this.chips.uniforms.uSizeIn.value = 0.02;
    this.chips.uniforms.uFadeIn.value = 0.02;
    this.chips.uniforms.uFadeOut.value = 0.3;
    this.chips.uniforms.uEndSize.value = 0.8;
    this.chips.uniforms.uDrag.value = 0.6;

    this.vapour = particles.get(`${ID}.vapour`, {
      capacity: 400,
      shape: ParticleShape.SMOKE,
      additive: false,
      softFade: 0.8
    });
    this.vapour.uniforms.uSizeIn.value = 0.2;
    this.vapour.uniforms.uFadeIn.value = 0.15;
    this.vapour.uniforms.uFadeOut.value = 0.55;
    this.vapour.uniforms.uEndSize.value = 2.2;
    this.vapour.uniforms.uDrag.value = 2;
  }

  /* ------------------------------------------------------------------ */
  /* Casting                                                             */
  /* ------------------------------------------------------------------ */

  onSpawn() {
    this.reduceMotion = prefersReducedMotion();
    this.prevFront = 0;
    this.hit.clear();
    this.pending.length = 0;
    this.frozen.length = 0;
    this.shatterCursor = 0;
    this._clock = 0;
    this._fade = 1;
    this._landed = false;
    this._exit = -1;
    this.rimeEmitter.reset();
    for (const burst of this.shatters) burst.points.visible = false;
    for (const slot of this.slots) {
      slot.inUse = false;
      slot.ring.visible = false;
    }
    this.iceShards.count = 0;
    this.spine.count = 0;
    this._landAge = -1;
    for (const k of this.crystals) {
      k.jitter = Math.random() * 2 - 1;
      k.lean = Math.random() * 2 - 1;
      k.seed = Math.random();
      k.gone = false;
    }
    this.thread.visible = true;
    this.needle.visible = true;
    this.rime.visible = true;
    this.chill.visible = !this.reduceMotion;
    this.motes.visible = true;

    // The ground layers are laid once down the aimed line and revealed by uFront.
    const yaw = Math.atan2(this.direction.x, this.direction.z);
    this.rime.position.copy(this.origin).setY(0.02);
    this.rime.rotation.set(0, yaw, 0);
    this.chill.position.copy(this.origin).setY(0.05);
    this.chill.rotation.set(0, yaw, 0);
    this.motes.position.copy(this.origin);
    this.motes.rotation.y = yaw;

    this._redraw(0);
    this._present(0, 1, 1);
  }

  /** Rewrite both strips of the filament up to `front` metres. */
  _redraw(front) {
    const c = this.config;
    const arr = this.geometry.attributes.position;
    const standing = (N + 1) * 2;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const d = u * front;
      const wave = Math.sin(u * c.waveFrequency - this.age * c.waveSpeed) * c.threadWave;
      const height = c.threadHeight + Math.sin(u * Math.PI) * c.threadArc;
      const x = this.origin.x + this.direction.x * d + this.side.x * wave;
      const z = this.origin.z + this.direction.z * d + this.side.z * wave;
      const w = c.width * (0.4 + 0.6 * Math.sin(u * Math.PI));
      // Flat strip across the line…
      arr.setXYZ(i * 2, x - this.side.x * w, height, z - this.side.z * w);
      arr.setXYZ(i * 2 + 1, x + this.side.x * w, height, z + this.side.z * w);
      // …and the standing strip, so the thread has body from behind.
      arr.setXYZ(standing + i * 2, x, height - w, z);
      arr.setXYZ(standing + i * 2 + 1, x, height + w, z);
    }
    arr.needsUpdate = true;
    this.motesMat.uniforms.uLength.value = front;
  }

  /** Queue a freeze for every body the needle crossed between `from` and `to`. */
  _scan(from, to) {
    if (!this.ctx.dummies?.findTargets) return;
    const midpoint = (from + to) / 2;
    this.pointAt(midpoint / this.length, this._position);
    const found = this.ctx.dummies.findTargets(
      this._position.x,
      this._position.z,
      Math.hypot((to - from) / 2, this.config.reach),
      this.found
    );
    for (const d of found) {
      if (this.hit.has(d)) continue;
      const x = d.position.x - this.origin.x;
      const z = d.position.z - this.origin.z;
      const along = x * this.direction.x + z * this.direction.z;
      const side = Math.abs(x * this.side.x + z * this.side.z);
      if (along >= from && along <= to && side <= this.config.reach) {
        this.hit.add(d);
        this.pending.push({
          dummy: d,
          generation: this.ctx.dummies?.standGeneration?.(d) ?? null,
          time: this.age + this.config.freezeDelay
        });
      }
    }
  }

  /** Expire statues, then turn due pending hits into statues. */
  _flush() {
    for (let i = this.frozen.length - 1; i >= 0; i--) {
      const f = this.frozen[i];
      const owned = frozenOwners.get(f.dummy) === f;
      const changedState =
        (typeof f.dummy.state === 'string' && f.dummy.state !== 'frozen') ||
        (f.generation !== null && this.ctx.dummies?.standGeneration?.(f.dummy) !== f.generation);
      if (!owned || changedState || f.until <= this.age) {
        if (owned && !changedState) {
          this._shatter(f.ring.position);
          f.dummy.vanish?.();
        }
        if (owned) frozenOwners.delete(f.dummy);
        this._release(f);
        this.frozen.splice(i, 1);
      }
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      // A delayed freeze belongs to the actor that was hit, not a later life
      // of a pooled slot. Cancel as soon as that actor is no longer alive.
      if (
        this.pending[i].dummy.alive === false ||
        (this.pending[i].generation !== null &&
          this.ctx.dummies?.standGeneration?.(this.pending[i].dummy) !== this.pending[i].generation)
      ) {
        this.pending.splice(i, 1);
        continue;
      }
      if (this.pending[i].time <= this.age) {
        const d = this.pending[i].dummy;
        if (d.root && this.frozen.length < MAX_FROZEN) {
          // Stopping the animation restores its bind pose. Copy the visible
          // pose first, and only show it if the target accepts the freeze.
          const figure = cloneSkeleton(d.root);
          if (!d.freeze?.()) {
            this.pending.splice(i, 1);
            continue;
          }
          const slot = this._acquire();
          figure.visible = true;
          // freeze() preserves the live rig; the ice clone replaces it until
          // vanish() frees the dummy slot, rather than drawing both together.
          d.root.visible = false;
          figure.traverse((n) => {
            if (n.isMesh) {
              n.material = slot.material;
              n.castShadow = false;
              n.layers.set(LAYER.VFX);
            }
          });
          this.group.add(figure);
          slot.ring.position.set(d.position.x, 0.035, d.position.z);
          slot.ring.scale.setScalar(0.001);
          slot.ring.visible = true;
          // The ice climbs relative to the figure's own height, read off its
          // highest bone (the clone's bones carry the frozen pose).
          figure.updateMatrixWorld(true);
          let top = 0;
          figure.traverse((n) => {
            if (n.isBone && n.matrixWorld.elements[13] > top) top = n.matrixWorld.elements[13];
          });
          const height = top * 1.12;
          const frozen = {
            dummy: d,
            generation: this.pending[i].generation,
            figure,
            ring: slot.ring,
            slot,
            born: this.age,
            floor: 0,
            height: Number.isFinite(height) && height > 0.2 && height < 6 ? height : 1.8,
            until: this.age + this.config.freezeDuration
          };
          frozenOwners.set(d, frozen);
          this.frozen.push(frozen);
          this._freezeFx(d);
        }
        this.pending.splice(i, 1);
      }
    }
    this._drawIceShards();
    this._drawShatters();
    this._drawStatues();
  }

  _acquire() {
    for (const slot of this.slots) {
      if (!slot.inUse) {
        slot.inUse = true;
        return slot;
      }
    }
    // Unreachable: `frozen.length < MAX_FROZEN` and slots are freed with them.
    return this.slots[0];
  }

  /** Take a statue down: its clone, its skeletons' bone textures, its slot. */
  _release(f) {
    this.group.remove(f.figure);
    f.figure.traverse((n) => {
      if (n.isSkinnedMesh) n.skeleton?.dispose?.();
    });
    f.ring.visible = false;
    if (f.slot) f.slot.inUse = false;
  }

  /** Arm one pooled chip burst at `position`, plus the shatter beat. */
  _shatter(position) {
    const c = this.config;
    const burst = this.shatters[this.shatterCursor++ % this.shatters.length];
    burst.born = this.age;
    burst.points.position.copy(position);
    burst.points.visible = true;
    const u = burst.points.material.uniforms;
    u.uAge.value = 0;
    u.uLife.value = c.shatterLife;
    u.uSpeed.value = c.shatterSpeed;
    burst.points.material.userData.sync();
    this._shatterFx(position);
  }

  _drawShatters() {
    const c = this.config;
    for (const burst of this.shatters) {
      if (!burst.points.visible) continue;
      const elapsed = this.age - burst.born;
      const u = burst.points.material.uniforms;
      u.uAge.value = elapsed;
      u.uSpeed.value = c.shatterSpeed;
      burst.points.material.userData.sync();
      if (elapsed >= u.uLife.value) burst.points.visible = false;
    }
  }

  _drawIceShards() {
    const c = this.config;
    let count = 0;
    for (const frozen of this.frozen) {
      const elapsed = this.config.freezeDuration - (frozen.until - this.age);
      // Grow in fast, shrink back just before the shatter.
      const growth = Math.max(0.001, Math.min(1, elapsed * 4, (frozen.until - this.age) * 4));
      for (let i = 0; i < SHARDS_PER_STATUE; i++) {
        const angle = (i * Math.PI * 2) / SHARDS_PER_STATUE;
        const p = this.shardTransform;
        p.position.set(
          frozen.ring.position.x + Math.cos(angle) * c.shardRadius,
          0,
          frozen.ring.position.z + Math.sin(angle) * c.shardRadius
        );
        // Each leans out from the statue.
        p.rotation.set(Math.sin(angle) * 0.32, angle, Math.cos(angle) * -0.32);
        const tall = c.shardHeight * (0.55 + (i % 3) * 0.22);
        p.scale.set(0.9, growth * tall, 0.9);
        p.updateMatrix();
        this.iceShards.setMatrixAt(count++, p.matrix);
      }
    }
    this.iceShards.count = count;
    this.iceShards.instanceMatrix.needsUpdate = true;
  }

  /** Per-statue ice climb and rosette bloom. */
  _drawStatues() {
    const c = this.config;
    const s = this._iceState;
    for (const frozen of this.frozen) {
      const age = this.age - frozen.born;
      s.grow = saturate(age / Math.max(0.01, c.statueCreep));
      s.opacity = 1;
      s.floor = frozen.floor;
      s.height = frozen.height;
      frozen.slot.material.userData.sync(s);
      const bloom = Easing.outCubic(saturate(age / Math.max(0.01, c.statueCreep * 1.5)));
      frozen.ring.scale.setScalar(Math.max(0.001, c.ringRadius * 2 * bloom));
    }
  }

  _spineCount() {
    return Math.max(0, Math.min(MAX_SPINE, Math.round(this.config.spineCount)));
  }

  _clusterCount() {
    return Math.max(0, Math.min(MAX_CLUSTER, Math.round(this.config.clusterCount) + 1));
  }

  /**
   * Pose every crystal of the spine and the cluster from the live settings.
   * `front` is metres the needle has run.
   */
  _drawSpine(front) {
    const c = this.config;
    const g = settings.global;
    const L = this.length;
    const n = this._spineCount();
    const m = this._clusterCount();
    const sinceLand = this._landAge >= 0 ? this.age - this._landAge : -1;
    const sweep = this._exit ?? -1;
    const pulseSpan = L + c.pulseWidth * 2;
    const yaw = Math.atan2(this.direction.x, this.direction.z);
    let count = 0;
    const arr = this.spinePulse.array;

    for (let i = 0; i < n + m; i++) {
      const k = this.crystals[i];
      const cluster = i >= n;
      let along;
      let height;
      let grow;
      if (!cluster) {
        // Herringbone: alternate sides, evenly down the line.
        along = ((i + 0.5 + k.jitter * 0.3) / Math.max(1, n)) * L * c.spineEnd;
        const f = saturate(along / Math.max(0.1, L));
        height = (c.spineHeightNear + (c.spineHeight - c.spineHeightNear) * Math.pow(f, c.spineCurve)) * (1 + k.jitter * 0.25 * g.randomness);
        grow = Easing.outBack(saturate((front - along) / Math.max(0.05, c.spineGrowDist)));
      } else {
        along = L;
        const j = i - n;
        height = (j === 0 ? c.spireHeight : c.clusterHeight * (0.75 + 0.25 * k.seed)) * (1 + k.jitter * 0.15 * g.randomness);
        grow = sinceLand < 0 ? 0 : Easing.outBack(saturate((sinceLand - (j === 0 ? 0 : 0.04 * j)) / Math.max(0.02, c.clusterGrow)));
      }
      if (grow <= 0.001 || k.gone) continue;

      // The pulse running down the thread, and the slow creep.
      let pulse = 0;
      if (sinceLand > 0 && c.pulseSpeed > 0) {
        const at = ((sinceLand * c.pulseSpeed) % pulseSpan) - c.pulseWidth;
        const d = (along - at) / Math.max(0.05, c.pulseWidth);
        pulse = Math.exp(-d * d);
      }
      const creep = sinceLand > 0 ? 1 + c.spineCreep * saturate(sinceLand / Math.max(0.1, c.lifetime)) : 1;

      // The exit: shatter from the cluster back to the hand.
      let shrink = 1;
      if (sweep >= 0) {
        const order = 1 - saturate(along / Math.max(0.1, L)) + (cluster ? -0.05 : 0);
        const local = (sweep - order * c.shatterSweep) / 0.12;
        if (local >= 1) {
          k.gone = true;
          this._crystalChips(i, along, height);
          continue;
        }
        if (local > 0) shrink = 1 - local * 0.4;
      }

      _node.position.copy(this.origin).addScaledVector(this.direction, along);
      if (!cluster) {
        const sideSign = i % 2 === 0 ? -1 : 1;
        const f = saturate(along / Math.max(0.1, L));
        _node.position.addScaledVector(this.side, sideSign * c.spineSpread * (0.35 + 0.65 * f));
        // Lean out off the thread (about the line) and rake downrange (about the side).
        _q.setFromAxisAngle(this.direction, sideSign * (c.spineLean + k.lean * 0.12 * g.randomness));
        // About the side axis +θ tips the top back toward the caster, so negate.
        _q2.setFromAxisAngle(this.side, -c.spineRake);
        _q.multiply(_q2);
        _q2.setFromAxisAngle(_up, yaw + k.seed * 6.283);
        _node.quaternion.copy(_q).multiply(_q2);
      } else {
        const j = i - n;
        if (j === 0) {
          _q.setFromAxisAngle(_up, k.seed * 6.283);
          _node.quaternion.copy(_q);
        } else {
          const a = ((j - 1) / Math.max(1, m - 1)) * Math.PI * 2 + k.jitter * 0.2;
          _axis.copy(this.direction).multiplyScalar(Math.cos(a)).addScaledVector(this.side, Math.sin(a));
          _node.position.addScaledVector(_axis, c.clusterRadius);
          // Tip outward: rotate about the tangent (up × radial).
          _axis.set(_axis.z, 0, -_axis.x);
          _q.setFromAxisAngle(_axis, c.clusterLean + k.lean * 0.1);
          _q2.setFromAxisAngle(_up, k.seed * 6.283);
          _node.quaternion.copy(_q).multiply(_q2);
        }
      }
      _node.position.y = -0.04;
      const h = Math.max(0.001, height * grow * creep * (1 + c.pulseGrow * pulse) * shrink);
      const w = c.spineThick * (cluster ? (i === n ? 1.9 : 1.35) : 1) * (0.5 + 0.5 * Math.min(1, grow)) * Math.min(1.6, 0.45 + height * 0.45) * shrink;
      _node.scale.set(w, h, w);
      _node.updateMatrix();
      this.spine.setMatrixAt(count, _node.matrix);
      arr[count] = pulse + (cluster && sinceLand >= 0 ? Math.max(0, 1 - sinceLand * 3) : 0);
      count++;
    }
    this.spine.count = count;
    this.spine.instanceMatrix.needsUpdate = true;
    this.spinePulse.needsUpdate = true;
  }

  /** A crystal bursting in the exit sweep: lit ice chips and a puff of vapour. */
  _crystalChips(i, along, height) {
    if (!this.chips) return;
    const c = this.config;
    const g = settings.global;
    this._resetEmit();
    this.pointAt(Math.min(1, along / Math.max(0.1, this.length)), _pos);
    _pos.y = height * 0.45;
    _emit.radius = 0.25;
    _emit.speed = c.shatterSpeed * 1.2;
    _emit.speedVariance = 0.6;
    _emit.spread = 1;
    _emit.size = c.chipParticleSize;
    _emit.life = c.chipLife;
    _emit.spin = 6;
    this.chips.emit(Math.round(c.spineChips * (i >= this._spineCount() ? 2.5 : 1) * g.particleCount), _emit);
    if (i % 3 === 0) this._vapour(_pos, 2, c.vapourSize * 0.8);
  }

  onTravel(dt) {
    const before = this.prevFront ?? 0;
    const front = Math.min(this.length, this.front);
    this._scan(before, front);
    this.prevFront = front;
    this._redraw(front);
    this._flush();
    this._present(dt, 1, 1);
    this._needleFx(dt);
  }

  onImpact() {
    this._landAge = this.age;
    this._flush();
    this._landFx();
  }

  onFade(dt, t) {
    this._flush();
    this._redraw(this.length);
    const f = t > 1 ? Math.max(0, 2 - t) : 1;
    // The exit sweep runs over the first part of the fade.
    const cc = this.config;
    this._exit = t > 1 && t - 1 >= cc.shatterSweepDelay ? saturate((t - 1 - cc.shatterSweepDelay) / Math.max(0.05, cc.shatterSweepStart)) : -1;
    this.material.uniforms.uFade.value = f;
    this.motesMat.uniforms.uFade.value = f;
    this.frostRingMaterial.uniforms.uFade.value = f;
    this._present(dt, f, t > 1 ? 0 : 1 - t);
    this._lingerFx(dt, f);
  }

  /* ------------------------------------------------------------------ */
  /* The look                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * @param {number} fade  1 standing → 0 gone
   * @param {number} head  needle-end glare and needle power, 1 in flight
   */
  _present(dt, fade, head) {
    const c = this.config;
    const g = settings.global;
    if (!this.reduceMotion) this._clock += dt * g.animationSpeed;
    const clock = this._clock;
    this._fade = fade;
    const front = Math.min(this.length, this.front);

    const ts = this._threadState;
    ts.clock = clock;
    ts.fade = fade;
    ts.head = head;
    this.material.userData.sync(ts);

    // The needle: grows out of the hand, flies at the front, gone after landing.
    // Never a zero scale: a singular matrix would NaN the facet normals.
    const grow = Math.max(0.001, Easing.outBack(saturate(this.age / 0.12)));
    this.needle.visible = head > 0.01;
    if (this.needle.visible) {
      this.pointAt(front / this.length, _pos);
      _pos.y = c.threadHeight;
      const k = c.needleRadius / 0.1;
      this.needle.scale.set(k * grow, k * grow, c.needleLength * grow * (0.6 + 0.4 * head));
      _pos.addScaledVector(this.direction, -c.needleLength * 0.6 * grow);
      this.needle.position.copy(_pos);
      this.needle.rotation.set(0, Math.atan2(this.direction.x, this.direction.z), clock * c.needleSpin);
    }
    this._needleState.power = head * grow;
    this.needleMaterial.userData.sync(this._needleState);

    const rs = this._rimeState;
    rs.clock = clock;
    rs.front = front / this.length;
    rs.melt = smoothstep(1 - Math.max(0.01, c.rimeMelt), 1, 1 - fade);
    rs.length = this.length;
    rs.power = fade;
    this.rime.scale.set(c.rimeWidth * 2, 1, this.length);
    this.chill.scale.set(c.rimeWidth * 2.4, 1, this.length);
    this.rimeMaterial.userData.sync(rs);
    this.chill.visible = !this.reduceMotion && c.chillStrength > 0;
    this.chillMaterial.userData.sync(rs);

    this._moteState.clock = clock;
    this.motesMat.userData.sync(this._moteState);
    this._ringState.clock = clock;
    this._ringState.fade = fade;
    this.frostRingMaterial.userData.sync(this._ringState);
    this.iceShardMaterial.userData.sync();
    this.spineMaterial.userData.sync(clock);
    this._drawSpine(front);
    this._syncParticles(c, g);
  }

  _syncParticles(c, g) {
    if (this.rimeDust) {
      this.rimeDust.setGradient(getColor(c.colorRimeDustA), getColor(c.colorRimeDustB), getColor(c.colorRimeDustC), getColor(c.colorRimeDustD));
      const r = this.rimeDust.uniforms;
      r.uGravity.value.set(0, 0.25, 0);
      r.uSizeScale.value = g.particleSize;
      r.uLifeScale.value = g.particleLifetime;
      r.uSpeedScale.value = g.particleSpeed;
      r.uOpacity.value = g.opacity;
      r.uGlow.value = c.rimeGlowP * g.glow;
      r.uTurbulence.value = 0.7 * g.turbulence;
    }
    if (this.chips) {
      this.chips.setGradient(getColor(c.colorChipA), getColor(c.colorChipB), getColor(c.colorChipC), getColor(c.colorChipD));
      const k = this.chips.uniforms;
      k.uGravity.value.set(0, -c.chipGravity, 0);
      k.uSizeScale.value = g.particleSize;
      k.uLifeScale.value = g.particleLifetime;
      k.uSpeedScale.value = g.particleSpeed;
      k.uOpacity.value = g.opacity;
      k.uTurbulence.value = 0.1 * g.turbulence;
    }
    if (this.vapour) {
      this.vapour.setGradient(getColor(c.colorVapourA), getColor(c.colorVapourB), getColor(c.colorVapourC), getColor(c.colorVapourD));
      const v = this.vapour.uniforms;
      v.uGravity.value.set(0, -0.15, 0); // cold air sinks
      v.uSizeScale.value = g.particleSize;
      v.uLifeScale.value = g.particleLifetime;
      v.uSpeedScale.value = g.particleSpeed;
      v.uOpacity.value = c.vapourOpacity * g.opacity;
      v.uTurbulence.value = 0.5 * g.turbulence;
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

  /** Frost dust streaming off the needle in flight. */
  _needleFx(dt) {
    if (!this.rimeDust || dt <= 0) return;
    const c = this.config;
    const g = settings.global;
    const n = Math.round(this.rimeEmitter.tick(dt, c.rimeRate) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit();
    this.pointAt(Math.min(1, this.front / this.length), _pos);
    _pos.y = c.threadHeight;
    _dir.copy(this.direction).negate().addScaledVector(_up, 0.3).normalize();
    _emit.direction = _dir;
    _emit.radius = c.needleRadius * 1.5;
    _emit.speed = c.rimeSpeed;
    _emit.spread = 0.6;
    _emit.size = c.rimeSize;
    _emit.life = c.rimeLife;
    this.rimeDust.emit(n, _emit);
  }

  /** A thinner sift of dust off the standing filament while it lingers. */
  _lingerFx(dt, fade) {
    if (!this.rimeDust || dt <= 0 || fade <= 0) return;
    const c = this.config;
    const g = settings.global;
    const n = Math.round(this.rimeEmitter.tick(dt, c.rimeRate * 0.25 * fade) * g.particleCount);
    if (n <= 0) return;
    this._resetEmit();
    _emit.radius = c.width;
    _emit.speed = c.rimeSpeed * 0.4;
    _emit.spread = 1;
    _emit.size = c.rimeSize;
    _emit.life = c.rimeLife;
    for (let i = 0; i < n; i++) {
      const u = Math.random();
      this.pointAt(u, _pos);
      _pos.y = c.threadHeight + Math.sin(u * Math.PI) * c.threadArc;
      this.rimeDust.emit(1, _emit);
    }
  }

  _vapour(position, count, size) {
    if (!this.vapour || count <= 0) return;
    const c = this.config;
    this._resetEmit();
    _pos.copy(position);
    _emit.radius = 0.35;
    _emit.speed = 0.4;
    _emit.spread = 1;
    _emit.size = size;
    _emit.life = c.vapourLife;
    _emit.spin = 0.4;
    this.vapour.emit(Math.round(count * settings.global.particleCount), _emit);
  }

  /** Where the needle lands. */
  _landFx() {
    if (this._landed) return;
    this._landed = true;
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    this.pointAt(1, _pos);
    _pos.y = c.threadHeight;
    this.ctx.bursts?.spawn?.(BurstMode.FROST, _pos, {
      radius: c.landBurst * 0.15,
      endRadius: c.landBurst * power,
      life: 0.5,
      intensity: c.burstIntensity,
      opacity: 0.7,
      fresnel: 2 * g.fresnel,
      displace: 0.2,
      turbulence: 0.6 * g.turbulence,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    if (this.rimeDust) {
      this._resetEmit();
      this.pointAt(1, _pos);
      _pos.y = c.threadHeight;
      _emit.radius = 0.1;
      _emit.speed = c.rimeSpeed * 4;
      _emit.spread = 1;
      _emit.size = c.rimeSize * 1.4;
      _emit.life = c.rimeLife;
      this.rimeDust.emit(Math.round(40 * g.particleCount), _emit);
    }
    this.pointAt(1, _pos);
    this.ctx.decals?.spawn?.(DecalType.FROST, _pos, {
      radius: c.frostDecal * 0.7,
      life: c.frostDecalLife,
      intensity: 0.8,
      colorA: getColor(c.colorDecalA),
      colorB: getColor(c.colorDecalB)
    });
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.freezeLight * power);
    if (!this.reduceMotion && c.landShake > 0) this.ctx.shake?.add?.(c.landShake * power, c.shakeDecay, 20);
  }

  /** A body has just turned to ice. */
  _freezeFx(dummy) {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    _pos.copy(dummy.position).setY(0.9);
    this.ctx.bursts?.spawn?.(BurstMode.FROST, _pos, {
      radius: c.freezeBurst * 0.2,
      endRadius: c.freezeBurst * power,
      life: 0.6,
      intensity: c.burstIntensity,
      opacity: 0.75,
      fresnel: 2 * g.fresnel,
      displace: 0.25,
      turbulence: 0.7 * g.turbulence,
      squash: 1.3,
      colorA: getColor(c.colorBurstA),
      colorB: getColor(c.colorBurstB),
      colorC: getColor(c.colorBurstC)
    });
    _dir.copy(dummy.position).setY(0);
    this.ctx.decals?.spawn?.(DecalType.FROST, _dir, {
      radius: c.frostDecal,
      life: Math.max(c.frostDecalLife, c.freezeDuration + 0.5),
      intensity: 1,
      colorA: getColor(c.colorDecalA),
      colorB: getColor(c.colorDecalB)
    });
    _dir.setY(0.3);
    this._vapour(_dir, c.vapourCount, c.vapourSize);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.freezeLight * power);
    if (!this.reduceMotion && c.freezeShake > 0) this.ctx.shake?.add?.(c.freezeShake * power, c.shakeDecay, 24);
  }

  /** A statue has just shattered at `position` (its rosette, on the floor). */
  _shatterFx(position) {
    const c = this.config;
    const g = settings.global;
    const power = g.explosionIntensity;
    if (this.chips && c.shatterChips > 0) {
      this._resetEmit();
      _pos.copy(position).setY(0.9);
      _emit.radius = 0.35;
      _emit.speed = c.shatterSpeed * 1.6;
      _emit.speedVariance = 0.6;
      _emit.spread = 1;
      _emit.size = c.chipParticleSize;
      _emit.life = c.chipLife;
      _emit.spin = 6;
      this.chips.emit(Math.round(c.shatterChips * g.particleCount), _emit);
    }
    _dir.copy(position).setY(0.6);
    this._vapour(_dir, c.vapourCount * 0.7, c.vapourSize * 1.2);
    if (c.shatterFlash > 0) this.ctx.flash?.trigger?.(getColor(c.colorFlash), c.shatterFlash * power);
    if (!this.reduceMotion && c.shatterShake > 0) this.ctx.shake?.add?.(c.shatterShake * power, c.shakeDecay, 26);
    this.lightBoost = Math.max(this.lightBoost, c.lightIntensity * c.freezeLight * 1.4 * power);
  }

  /* ------------------------------------------------------------------ */
  /* Pooling                                                             */
  /* ------------------------------------------------------------------ */

  onDestroy() {
    for (const f of this.frozen) {
      if (frozenOwners.get(f.dummy) === f) {
        frozenOwners.delete(f.dummy);
        const sameLife = f.generation === null || this.ctx.dummies?.standGeneration?.(f.dummy) === f.generation;
        const stillFrozen = typeof f.dummy.state !== 'string' || f.dummy.state === 'frozen';
        if (sameLife && stillFrozen) f.dummy.vanish?.();
      }
      this._release(f);
    }
    this.frozen.length = 0;
    for (const slot of this.slots) {
      slot.inUse = false;
      slot.ring.visible = false;
    }
    this.iceShards.count = 0;
    this.spine.count = 0;
    for (const burst of this.shatters) burst.points.visible = false;
    this.hit.clear();
    this.pending.length = 0;
    this.prevFront = 0;
    this.needle.visible = false;
    this.chill.visible = false;
    this.rimeEmitter.reset();
    this.material.uniforms.uFade.value = 1;
    this.motesMat.uniforms.uFade.value = 1;
    this.frostRingMaterial.uniforms.uFade.value = 1;
  }

  dispose() {
    this.onDestroy();
    this.geometry.dispose();
    this.material.dispose();
    this.needleGeometry.dispose();
    this.needleMaterial.dispose();
    this.stripGeometry.dispose();
    this.rimeMaterial.dispose();
    this.chillMaterial.dispose();
    this.motesGeo.dispose();
    this.motesMat.dispose();
    for (const slot of this.slots) slot.material.dispose();
    this.frostRingGeometry.dispose();
    this.frostRingMaterial.dispose();
    this.iceShards.dispose();
    this.iceShardGeometry.dispose();
    this.iceShardMaterial.dispose();
    this.spine.dispose();
    this.spineGeometry.dispose();
    this.spineMaterial.dispose();
    this.chipGeometry.dispose();
    for (const burst of this.shatters) burst.points.material.dispose();
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
  const folder = gui.addFolder('❄  Absolute Zero Thread');
  const R = Editor.range;

  const cast = sub(folder, 'The cast');
  R(cast, c, 'range', 2, 48, 0.1, 'max range');
  R(cast, c, 'minRange', 0, 12, 0.1, 'min range');
  R(cast, c, 'speed', 1, 80, 0.5, 'needle speed (m/s)');
  R(cast, c, 'lifetime', 0.1, 10, 0.05, 'lingers for (s)');
  R(cast, c, 'cooldown', 0, 30, 0.1, 'cooldown');
  if (Editor.castAnimation) Editor.castAnimation(cast, c);
  cast.addColor(c, 'lightColor').name('light colour');
  R(cast, c, 'lightIntensity', 0, 40, 0.1, 'light intensity');
  R(cast, c, 'lightRadius', 0.5, 40, 0.1, 'light radius');

  const rules = sub(folder, 'The freeze (gameplay)');
  R(rules, c, 'width', 0.02, 0.5, 0.01, 'filament width');
  R(rules, c, 'reach', 0.1, 3, 0.05, 'freeze reach');
  R(rules, c, 'freezeDelay', 0, 2, 0.05, 'freeze delay');
  R(rules, c, 'freezeDuration', 0.1, 6, 0.1, 'statue duration');
  R(rules, c, 'shatterLife', 0.1, 2, 0.05, 'chip lifetime');
  R(rules, c, 'shatterSpeed', 0.2, 6, 0.1, 'chip speed');

  const thread = sub(folder, '1 · The filament');
  R(thread, c, 'threadHeight', 0, 2, 0.01, 'height (m)');
  R(thread, c, 'threadArc', 0, 3, 0.01, 'arc (m)');
  R(thread, c, 'threadWave', 0, 0.5, 0.005, 'wave (m)');
  R(thread, c, 'waveFrequency', 0, 120, 0.5, 'waves');
  R(thread, c, 'waveSpeed', 0, 20, 0.1, 'wave speed');
  R(thread, c, 'threadGlow', 0, 8, 0.05, 'glow');
  R(thread, c, 'strandDensity', 0, 300, 1, 'strands');
  R(thread, c, 'crystalDensity', 1, 200, 1, 'crystal cells');
  R(thread, c, 'threadDissolve', 0, 1, 0.01, 'fade as dissolve');
  thread.addColor(c, 'colorThreadDeep').name('deep');
  thread.addColor(c, 'colorThreadCore').name('core');
  thread.addColor(c, 'colorCrystal').name('crystal glint');

  const needle = sub(folder, '2 · The needle');
  R(needle, c, 'needleLength', 0.1, 3, 0.01, 'length (m)');
  R(needle, c, 'needleRadius', 0.01, 0.4, 0.005, 'radius (m)');
  R(needle, c, 'needleGlow', 0, 8, 0.05, 'glow');
  R(needle, c, 'needleSpin', -20, 20, 0.1, 'spin (rad/s)');
  R(needle, c, 'needleFresnel', 0.2, 8, 0.05, 'rim power');
  needle.addColor(c, 'colorNeedle').name('ice');
  needle.addColor(c, 'colorNeedleRim').name('rim');

  const rime = sub(folder, '3 · The rime path');
  R(rime, c, 'rimeWidth', 0.05, 2, 0.01, 'half-width (m)');
  R(rime, c, 'rimeOpacity', 0, 1, 0.01, 'opacity');
  R(rime, c, 'rimeScale', 0.2, 12, 0.05, 'plates per metre');
  R(rime, c, 'rimeGlow', 0, 4, 0.05, 'plate edge glow');
  R(rime, c, 'rimeMelt', 0.01, 1, 0.01, 'melts over (fraction of fade)');
  rime.addColor(c, 'colorRimeA').name('plate edges');
  rime.addColor(c, 'colorRimeB').name('plate centres');

  const motes = sub(folder, '4 · Frost motes');
  R(motes, c, 'moteOpacity', 0, 2, 0.01, 'brightness');
  R(motes, c, 'moteSize', 1, 60, 0.5, 'size');
  R(motes, c, 'moteRise', 0, 3, 0.01, 'drift');
  motes.addColor(c, 'colorMote').name('colour');

  const chill = sub(folder, '5 · Chill (distortion)');
  R(chill, c, 'chillStrength', 0, 2, 0.01, 'strength');
  R(chill, c, 'chillScale', 0.2, 10, 0.05, 'noise scale');
  R(chill, c, 'chillSpeed', 0, 4, 0.01, 'drift');

  const statue = sub(folder, '6 · The statues');
  R(statue, c, 'statueOpacity', 0, 1, 0.01, 'ice opacity');
  R(statue, c, 'statueGlow', 0, 4, 0.05, 'ice glow');
  R(statue, c, 'statueFrost', 0, 4, 0.05, 'hoarfrost');
  R(statue, c, 'statueRim', 0, 6, 0.05, 'rim glow');
  R(statue, c, 'statueCreep', 0.01, 2, 0.01, 'ice climbs over (s)');
  statue.addColor(c, 'colorStatue').name('ice');
  statue.addColor(c, 'colorStatueEmissive').name('ice glow colour');
  statue.addColor(c, 'colorStatueRim').name('ice rim');
  R(statue, c, 'ringRadius', 0.1, 3, 0.01, 'rosette radius (m)');
  R(statue, c, 'ringGlow', 0, 6, 0.05, 'rosette glow');
  R(statue, c, 'shardRadius', 0.1, 2, 0.01, 'shard ring (m)');
  R(statue, c, 'shardHeight', 0.1, 3, 0.01, 'shard height (m)');
  R(statue, c, 'shardGlow', 0, 6, 0.05, 'shard glow');
  statue.addColor(c, 'colorShard').name('shard');
  statue.addColor(c, 'colorShardRim').name('shard rim');
  R(statue, c, 'chipSize', 1, 60, 0.5, 'chip size');
  statue.addColor(c, 'colorChip').name('chip');

  const spine = sub(folder, '9 · The frost spine (hero)');
  R(spine, c, 'spineCount', 0, MAX_SPINE, 1, 'crystals down the line');
  R(spine, c, 'spineEnd', 0.3, 1, 0.01, 'runs to (× line)');
  R(spine, c, 'spineHeightNear', 0.05, 2, 0.01, 'height at the hand (m)');
  R(spine, c, 'spineHeight', 0.2, 4, 0.01, 'height at the end (m)');
  R(spine, c, 'spineCurve', 0.3, 4, 0.05, 'height curve');
  R(spine, c, 'spineSpread', 0, 2, 0.01, 'off the thread (m)');
  R(spine, c, 'spineLean', 0, 1, 0.01, 'lean out (rad)');
  R(spine, c, 'spineRake', -1, 1, 0.01, 'rake downrange (rad)');
  R(spine, c, 'spineThick', 0.3, 4, 0.01, 'girth (×)');
  R(spine, c, 'spineGrowDist', 0.05, 6, 0.05, 'grows over (m of run)');
  R(spine, c, 'spineCreep', 0, 0.6, 0.005, 'creeps taller (×)');
  R(spine, c, 'clusterCount', 0, MAX_CLUSTER - 1, 1, 'cluster crystals');
  R(spine, c, 'clusterRadius', 0, 3, 0.01, 'cluster radius (m)');
  R(spine, c, 'clusterHeight', 0.2, 5, 0.01, 'cluster height (m)');
  R(spine, c, 'spireHeight', 0.2, 6, 0.01, 'spire height (m)');
  R(spine, c, 'clusterLean', 0, 1.2, 0.01, 'cluster leans out (rad)');
  R(spine, c, 'clusterGrow', 0.02, 1.5, 0.01, 'cluster grows over (s)');
  R(spine, c, 'pulseSpeed', 0, 40, 0.1, 'pulse runs at (m/s)');
  R(spine, c, 'pulseWidth', 0.1, 6, 0.05, 'pulse width (m)');
  R(spine, c, 'pulseGrow', 0, 0.6, 0.005, 'pulse ratchet (×)');
  R(spine, c, 'pulseGlow', 0, 6, 0.05, 'pulse flare');
  R(spine, c, 'shatterSweepDelay', 0, 0.9, 0.01, 'exit sweep starts at (× fade)');
  R(spine, c, 'shatterSweepStart', 0.05, 1, 0.01, 'exit sweep over (× fade)');
  R(spine, c, 'shatterSweep', 0, 1, 0.01, 'sweep stagger');
  R(spine, c, 'spineChips', 0, 40, 1, 'chips per crystal');
  R(spine, c, 'spineRough', 0, 1, 0.01, 'roughness');
  R(spine, c, 'spineGlow', 0, 3, 0.01, 'inner glow');
  R(spine, c, 'spineRimGlow', 0, 4, 0.01, 'rim glow');
  R(spine, c, 'spineFresnel', 0.3, 8, 0.05, 'rim power');
  spine.addColor(c, 'colorSpine').name('ice body');
  spine.addColor(c, 'colorSpineDeep').name('ice deep');
  spine.addColor(c, 'colorSpineRim').name('ice rim (tint)');
  spine.addColor(c, 'colorSpineCore').name('pulse core');

  const fx = sub(folder, '7 · Particles');
  R(fx, c, 'rimeRate', 0, 400, 1, 'dust/second');
  R(fx, c, 'rimeSize', 0.005, 0.4, 0.001, 'dust size');
  R(fx, c, 'rimeLife', 0.05, 4, 0.01, 'dust lifetime');
  R(fx, c, 'rimeSpeed', 0, 6, 0.05, 'dust speed');
  R(fx, c, 'rimeGlowP', 0, 8, 0.05, 'dust glow');
  gradient(fx, c, 'colorRimeDust', 'dust gradient', Editor);
  R(fx, c, 'shatterChips', 0, 200, 1, 'chips per shatter');
  R(fx, c, 'chipParticleSize', 0.01, 0.5, 0.005, 'chip size');
  R(fx, c, 'chipLife', 0.1, 4, 0.05, 'chip lifetime');
  R(fx, c, 'chipGravity', 0, 30, 0.1, 'chip gravity');
  gradient(fx, c, 'colorChip', 'chip gradient', Editor);
  R(fx, c, 'vapourCount', 0, 80, 1, 'vapour puffs');
  R(fx, c, 'vapourSize', 0.05, 3, 0.01, 'vapour size');
  R(fx, c, 'vapourLife', 0.1, 6, 0.05, 'vapour lifetime');
  R(fx, c, 'vapourOpacity', 0, 1, 0.01, 'vapour opacity');
  gradient(fx, c, 'colorVapour', 'vapour gradient', Editor);

  const beats = sub(folder, '8 · Beats');
  R(beats, c, 'freezeShake', 0, 1, 0.01, 'freeze knock');
  R(beats, c, 'shatterShake', 0, 1.5, 0.01, 'shatter knock');
  R(beats, c, 'landShake', 0, 1, 0.01, 'landing knock');
  R(beats, c, 'shakeDecay', 0.5, 30, 0.1, 'knock settles');
  R(beats, c, 'freezeLight', 0, 6, 0.05, 'light punch (× intensity)');
  R(beats, c, 'shatterFlash', 0, 1, 0.01, 'shatter flash');
  beats.addColor(c, 'colorFlash').name('flash');
  R(beats, c, 'freezeBurst', 0, 4, 0.05, 'freeze shell (m)');
  R(beats, c, 'landBurst', 0, 4, 0.05, 'landing shell (m)');
  R(beats, c, 'burstIntensity', 0, 4, 0.05, 'shell brightness');
  beats.addColor(c, 'colorBurstA').name('shell inner');
  beats.addColor(c, 'colorBurstB').name('shell mid');
  beats.addColor(c, 'colorBurstC').name('shell outer');
  R(beats, c, 'frostDecal', 0, 4, 0.05, 'frost mark (m)');
  R(beats, c, 'frostDecalLife', 0.1, 8, 0.05, 'frost mark lasts (s)');
  beats.addColor(c, 'colorDecalA').name('frost mark');
  beats.addColor(c, 'colorDecalB').name('frost mark deep');

  folder.close();
  return folder;
}
