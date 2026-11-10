import { BufferAttribute, BufferGeometry, Color, Mesh, Vector3 } from 'three';
import { LAYER } from '../../../core/Layers.js';
import { frame } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { createHeliostatApertureMaterial, createHeliostatPrismMaterial } from './HeliostatMaterials.js';

const TAU = Math.PI * 2;
/** Golden angle: shard bearings that never line up, without a random draw. */
const GOLDEN = 2.399963;
/** Shards thrown by one contact. Fixed so a hit allocates nothing. */
const MAX_SHARDS = 12;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const bounded = (value, fallback, min, max) => Math.max(min, Math.min(max, value ?? fallback));

const _emit = {};
const _up = new Vector3(0, 1, 0);
const _sparkDir = new Vector3();
/** Mote puff at the contact (module constant: the beat allocates no options). */
const CONTACT_BURST = { radius: 0.25, speed: 2.2, size: 0.07, life: 0.65, spread: 0.35 };

/**
 * An interrupted radial aperture: 24 raised petals round the beam contact,
 * alternating long and short, each a four-sided facet with a lifted centre.
 * Lies flat in XZ, radius 1.
 */
export function heliostatImpactGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];
  const count = 24;
  for (let i = 0; i < count; i++) {
    const a = (i * TAU) / count;
    const span = (Math.PI / count) * 0.65;
    const reach = i % 2 ? 1 : 0.82;
    const base = positions.length / 3;
    // inner-left, outer-left, outer-right, inner-right, raised centre
    for (const [radius, angle, y] of [
      [0.35, a - span, 0],
      [reach, a - span * 0.35, 0.03],
      [reach, a + span * 0.35, 0.03],
      [0.35, a + span, 0],
      [0.67, a, 0.12]
    ]) {
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      uvs.push(0.5 + Math.cos(angle) * radius * 0.5, 0.5 + Math.sin(angle) * radius * 0.5);
    }
    indices.push(base, base + 1, base + 4, base + 1, base + 2, base + 4, base + 2, base + 3, base + 4, base + 3, base, base + 4);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A narrow lens splinter: a double pyramid on a lozenge, so it has a front
 * ridge *and* a back ridge and tumbles convincingly instead of flipping flat.
 */
export function heliostatImpactShardGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([
    0, 0.48, 0, // tip
    -0.08, 0, 0, // left shoulder
    0, -0.3, 0, // tail
    0.08, 0, 0, // right shoulder
    0, 0.04, 0.07, // front ridge
    0, 0.04, -0.05 // back ridge
  ]), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0.5, 1, 0, 0.5, 0.5, 0, 1, 0.5, 0.5, 0.55, 0.5, 0.45]), 2));
  geometry.setIndex([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4, 1, 0, 5, 2, 1, 5, 3, 2, 5, 0, 3, 5]);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * One owned contact release, independent of the live target after the hit.
 *
 * Fired only from the ability's *accepted* light hit, at the actual (possibly
 * moving) target position. It owns:
 *
 *   - the **aperture**: a floor iris that opens with the ring front and burns
 *     away with a noise dissolve,
 *   - twelve prismatic **shards** thrown up and out on golden-angle bearings,
 *   - the one-shot engine cues: a STORM burst, a SHOCKWAVE ring and a SCORCH
 *     of glassed floor (in that order — the shockwave is the contact read),
 *   - a bounded spark burst into the cast's own particle system, plus 24 motes
 *     into the shared ambient system.
 *
 * Camera knock, flash and the light punch belong to the ability, which owns
 * the light. Everything here is pooled; `fire` allocates nothing but the
 * engine's option literals, exactly like the originals.
 */
export class HeliostatImpact {
  /**
   * @param {Object3D} parent         where the meshes live (the ability group)
   * @param {object} ctx              ability context
   * @param {ExpansionAtmosphere} atmosphere  ambient particles (may be set later)
   * @param {(g) => g} ownGeometry    registers a geometry for disposal
   * @param {(m) => m} ownMaterial    registers a material for disposal
   */
  constructor(parent, ctx, atmosphere, ownGeometry, ownMaterial) {
    this.ctx = ctx;
    this.atmosphere = atmosphere;
    /** The cast's spark system, attached by the ability once particles exist. */
    this.sparks = null;
    this.point = new Vector3();
    this.primary = new Color();
    this.core = new Color();
    this.dark = new Color();
    this.scorch = new Color();
    this.time = -1;

    this.material = ownMaterial(createHeliostatApertureMaterial());
    this.shardMaterial = ownMaterial(createHeliostatPrismMaterial());
    this.halo = new Mesh(ownGeometry(heliostatImpactGeometry()), this.material);
    this.shards = [];
    const shard = ownGeometry(heliostatImpactShardGeometry());
    for (let i = 0; i < MAX_SHARDS; i++) this.shards.push(new Mesh(shard, this.shardMaterial));
    for (const mesh of [this.halo, ...this.shards]) {
      mesh.visible = false;
      mesh.layers.set(LAYER.VFX);
      // Positioned per frame far from the group origin: the bounds mean nothing.
      mesh.frustumCulled = false;
      parent.add(mesh);
    }
  }

  reset() {
    this.time = -1;
    this.halo.visible = false;
    for (const shard of this.shards) shard.visible = false;
  }

  /** @param {number[]} position actual contact, [x, y, z] */
  fire(position, elapsed, c) {
    this.time = elapsed;
    this.point.fromArray(position);
    this.primary.copy(getColor(c.rayColor));
    this.core.copy(getColor(c.coreColor));
    this.dark.copy(this.primary).multiplyScalar(0.35);
    this.scorch.copy(getColor(c.scorchColor ?? '#5a3410'));
    const g = settings.global;
    const scale = bounded(c.impactScale, 1, 0.25, 3);
    const glow = bounded(c.impactGlow, 0.8, 0, 2);
    const radius = Math.min(4, scale * 1.2);

    this.ctx.bursts?.spawn(BurstMode.STORM, this.point, {
      radius: 0.06,
      endRadius: radius,
      life: 0.5,
      intensity: glow * g.explosionIntensity,
      opacity: 0.5,
      colorA: this.core,
      colorB: this.primary,
      colorC: this.dark
    });
    // The shockwave first: it is the read of the contact.
    this.ctx.decals?.spawn(DecalType.SHOCKWAVE, this.point, {
      radius,
      life: 0.7,
      intensity: glow * 0.7,
      width: 0.05,
      colorA: this.primary,
      colorB: this.dark
    });
    // Then the floor the ray cooked, cooling long after the light has gone.
    this.ctx.decals?.spawn(DecalType.SCORCH, this.point, {
      radius: bounded(c.scorchRadius, 0.9, 0.1, 4),
      life: bounded(c.scorchLife, 2.6, 0.2, 10),
      intensity: 0.8,
      colorA: this.scorch,
      colorB: this.primary
    });
    this.atmosphere?.burst(position, 24, CONTACT_BURST);

    // White-hot sparks thrown off the contact, in the cast's own system.
    if (this.sparks) {
      _emit.position = this.point;
      _emit.radius = 0.12;
      _emit.direction = _sparkDir.copy(_up);
      _emit.speed = bounded(c.sparkSpeed, 4.5, 0, 20);
      _emit.speedVariance = 0.6;
      _emit.spread = 1;
      _emit.inherit = null;
      _emit.anchor = null;
      _emit.size = bounded(c.sparkSize, 0.05, 0.005, 0.5);
      _emit.sizeVariance = 0.5;
      _emit.life = 0.55;
      _emit.lifeVariance = 0.4;
      _emit.spin = 0;
      _emit.tint = null;
      _emit.time = frame.uTime.value;
      this.sparks.emit(Math.max(0, Math.min(96, Math.round((c.sparkCount ?? 30) * g.particleCount))), _emit);
    }
  }

  update(elapsed, time, fade, c, reducedMotion) {
    const age = this.time < 0 ? -1 : elapsed - this.time;
    const duration = Math.max(0.1, c.impactFxDuration ?? 0.8);
    const progress = age < 0 ? 0 : clamp01(age / duration);
    const scale = bounded(c.impactScale, 1, 0.25, 3);
    const glow = bounded(c.impactGlow, 0.8, 0, 2) * settings.global.glow;
    const visible = !reducedMotion && age >= 0 && progress < 1;
    // Eased: the aperture snaps open, then drifts.
    const open = 1 - (1 - progress) * (1 - progress);

    this.halo.visible = visible;
    this.halo.position.copy(this.point).setY(0.06);
    this.halo.scale.setScalar(scale * (0.4 + open));
    this.halo.rotation.y = time * 0.5;

    for (let i = 0; i < this.shards.length; i++) {
      const shard = this.shards[i];
      const angle = i * GOLDEN;
      const lift = open * (0.5 + (i % 3) * 0.18) - progress * progress * 0.35;
      shard.visible = visible;
      shard.position.set(
        this.point.x + Math.cos(angle) * open * scale,
        this.point.y + 0.15 + Math.max(0, lift),
        this.point.z + Math.sin(angle) * open * scale
      );
      shard.rotation.set(angle * 0.3 + time * 2, angle * 0.7, angle + time * 1.4);
      shard.scale.setScalar((0.45 + (i % 2) * 0.25) * scale * (1 - progress));
    }

    const u = this.material.uniforms;
    u.uClock.value = time;
    u.uProgress.value = progress;
    u.uFade.value = fade * (1 - progress) * glow;
    u.uColor.value.copy(getColor(c.rayColor));
    u.uCore.value.copy(getColor(c.coreColor));

    const s = this.shardMaterial.uniforms;
    s.uClock.value = time;
    s.uFade.value = fade * (1 - progress);
    s.uGlow.value = 1.4 * glow;
    s.uCharge.value = 1 - progress;
    s.uColor.value.copy(getColor(c.rayColor));
    s.uCore.value.copy(getColor(c.coreColor));
    s.uSky.value.copy(getColor(c.skyColor ?? '#9cc4ff'));
  }
}
