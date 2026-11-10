import { BufferAttribute, BufferGeometry, Color, Mesh, PlaneGeometry, Vector3 } from 'three';
import { LAYER } from '../../../core/Layers.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { createVigilFootprintMaterial, createVigilPulseMaterial } from './VigilMaterials.js';

const TAU = Math.PI * 2;
/** Overlapping pulses the sanctuary can show at once. Fixed: a pulse allocates nothing. */
const MAX_PULSES = 3;
/** Scratch burst options, rewritten per pulse (the beat allocates nothing). */
const _burst = { radius: 0.5, speed: 0.8, size: 0.1, life: 1.1, spread: 0.6 };

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const bounded = (value, fallback, min, max) => Math.max(min, Math.min(max, value ?? fallback));

/**
 * Twelve beveled flame petals round a hub, each a raised four-sided facet:
 * inner point, two shoulders, outer tip and a lifted ridge. Flat in XZ,
 * radius 1, so it scales directly to the sanctuary radius.
 */
export function vigilPulseGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];
  const count = 12;
  for (let i = 0; i < count; i++) {
    const a = (i * TAU) / count;
    const span = (Math.PI / count) * 0.72;
    const base = positions.length / 3;
    for (const [r, t, y] of [
      [0.3, a, 0],
      [0.64, a - span, 0.025],
      [1, a, 0.08],
      [0.64, a + span, 0.025],
      [0.62, a, 0.16]
    ]) {
      positions.push(Math.cos(t) * r, y, Math.sin(t) * r);
      uvs.push(0.5 + Math.cos(t) * r * 0.5, 0.5 + Math.sin(t) * r * 0.5);
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
 * Three independent pooled pulse records that track the expanding curtains.
 *
 * Each accepted pulse takes the next slot round-robin and gets:
 *
 *   - a **glyph** — the petal mesh, growing to the full radius and lifting by
 *     `glyphRise` as its ring front rides out and it burns away,
 *   - a **footprint** — the whole damage disc lit for `footprintDuration`, so
 *     what the pulse covered is unambiguous,
 *   - the one-shot engine cues, centred on the sanctuary at the true radius:
 *     an AIR burst and a SHOCKWAVE ring, plus a bounded mote burst.
 *
 * Only an accepted (or harmlessly empty) pulse reaches `fire`; a refused one
 * shows nothing, so the visuals never claim an effect the binding denied.
 */
export class VigilPulses {
  constructor(parent, ctx, atmosphere, ownGeometry, ownMaterial) {
    this.ctx = ctx;
    this.atmosphere = atmosphere;
    this.point = new Vector3();
    this.primary = new Color();
    this.core = new Color();
    this.dark = new Color();
    this.meshes = [];
    this.materials = [];
    this.footprints = [];
    this.footprintMaterials = [];
    this.times = new Array(MAX_PULSES).fill(-1);
    this.next = 0;

    const geometry = ownGeometry(vigilPulseGeometry());
    const quad = ownGeometry(new PlaneGeometry(2, 2));
    for (let i = 0; i < MAX_PULSES; i++) {
      const material = ownMaterial(createVigilPulseMaterial());
      const mesh = new Mesh(geometry, material);
      const flashMaterial = ownMaterial(createVigilFootprintMaterial());
      const flash = new Mesh(quad, flashMaterial);
      mesh.visible = false;
      flash.visible = false;
      flash.rotation.x = -Math.PI / 2;
      for (const part of [mesh, flash]) {
        part.layers.set(LAYER.VFX);
        part.frustumCulled = false;
        parent.add(part);
      }
      this.meshes.push(mesh);
      this.materials.push(material);
      this.footprints.push(flash);
      this.footprintMaterials.push(flashMaterial);
    }
  }

  reset() {
    this.times.fill(-1);
    this.next = 0;
    for (const mesh of this.meshes) mesh.visible = false;
    for (const flash of this.footprints) flash.visible = false;
  }

  /** @param {number[]} position sanctuary centre, [x, y, z] */
  fire(position, elapsed, c) {
    const slot = this.next;
    this.next = (slot + 1) % this.meshes.length;
    this.times[slot] = elapsed;
    this.point.fromArray(position);
    // Stacked a hair apart so overlapping glyphs never z-fight.
    this.meshes[slot].position.copy(this.point).setY(0.06 + slot * 0.008);
    this.footprints[slot].position.copy(this.point).setY(0.045 + slot * 0.006);

    this.primary.copy(getColor(c.holyColor));
    this.core.copy(getColor(c.coreColor));
    // The shell's outer stop is the cast's dark bronze, not a dimmed tint.
    this.dark.copy(getColor(c.deepColor ?? '#3a2209'));
    const radius = bounded(c.zoneRadius, 4, 0.2, 8);
    const glow = bounded(c.glyphGlow, 0.75, 0, 2);
    this.ctx.bursts?.spawn(BurstMode.AIR, this.point, {
      radius: 0.08,
      endRadius: radius,
      life: 0.55,
      intensity: glow * 0.55 * settings.global.explosionIntensity,
      opacity: 0.28,
      colorA: this.core,
      colorB: this.primary,
      colorC: this.dark
    });
    this.ctx.decals?.spawn(DecalType.SHOCKWAVE, this.point, {
      radius,
      life: 0.7,
      intensity: glow * 0.6,
      width: 0.06,
      colorA: this.primary,
      colorB: this.dark
    });
    _burst.radius = radius * 0.5;
    this.atmosphere?.burst(position, 18, _burst);
  }

  update(elapsed, time, fade, c, reducedMotion) {
    const duration = Math.max(0.1, c.waveDuration ?? 0.7);
    const radius = bounded(c.zoneRadius, 4, 0.2, 8);
    const glow = bounded(c.glyphGlow, 0.75, 0, 2) * settings.global.glow;
    const flashDuration = Math.max(0.05, c.footprintDuration ?? 0.22);
    const flashGlow = bounded(c.footprintGlow, 0.8, 0, 2) * settings.global.glow;
    const primary = getColor(c.holyColor);
    const core = getColor(c.coreColor);

    for (let i = 0; i < this.meshes.length; i++) {
      const age = this.times[i] < 0 ? -1 : elapsed - this.times[i];
      const progress = age < 0 ? 0 : clamp01(age / duration);
      // Eased out: the glyph leaps to the edge, then settles as it burns.
      const reach = 1 - (1 - progress) * (1 - progress);

      const mesh = this.meshes[i];
      mesh.visible = !reducedMotion && age >= 0 && progress < 1;
      mesh.scale.setScalar(Math.max(0.001, radius * reach));
      mesh.rotation.y = time * (i % 2 ? -0.2 : 0.2);
      mesh.position.y = 0.06 + i * 0.008 + (c.glyphRise ?? 0.1) * progress;
      const u = this.materials[i].uniforms;
      u.uClock.value = time;
      u.uProgress.value = progress;
      u.uFade.value = fade * (1 - progress) * glow;
      u.uColor.value.copy(primary);
      u.uCore.value.copy(core);

      const flash = this.footprints[i];
      const flashProgress = age < 0 ? 0 : clamp01(age / flashDuration);
      flash.visible = !reducedMotion && age >= 0 && flashProgress < 1;
      flash.scale.setScalar(radius);
      const f = this.footprintMaterials[i].uniforms;
      f.uFade.value = fade * (1 - flashProgress) * flashGlow;
      f.uColor.value.copy(primary);
      f.uCore.value.copy(core);
    }
  }
}
