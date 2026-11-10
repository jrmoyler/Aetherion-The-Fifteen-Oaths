import { BufferAttribute, BufferGeometry, Color, Mesh, Vector3 } from 'three';
import { LAYER } from '../../../core/Layers.js';
import { settings } from '../../../config/settings.js';
import { getColor } from '../../../utils/color.js';
import { BurstMode } from '../../../effects/BurstSphere.js';
import { DecalType } from '../../../effects/GroundDecals.js';
import { createInheritanceSealMaterial } from './NightshadeMaterials.js';

const TAU = Math.PI * 2;
/** One seal per inheritance tier (the first three transfers). */
const TIERS = 3;
/** Scratch burst options, rewritten per seal (the beat allocates nothing). */
const _burst = { radius: 0.3, speed: 0.4, size: 0.1, life: 0.9, spread: 0.75 };
/** Wing facets per tier: each heir is sealed with more. */
const FACETS_PER_TIER = [6, 8, 10];

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const bounded = (value, fallback, min, max) => Math.max(min, Math.min(max, value ?? fallback));

/**
 * A tier seal: `[6, 8, 10][tier]` interlocking raised wing facets round a
 * hub, each a six-vertex fan (inner corners, shoulders, tip and a lifted
 * ridge) that rises higher with the tier. Flat in XZ, radius 1.
 */
export function inheritanceSealGeometry(tier) {
  const count = FACETS_PER_TIER[tier];
  if (count === undefined) throw new RangeError('Expected inheritance tier 0, 1 or 2');
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i < count; i++) {
    const a = (i * TAU) / count;
    const span = (Math.PI / count) * 0.8;
    const base = positions.length / 3;
    for (const [r, t, y] of [
      [0.36, a - span, 0],
      [0.85, a - span * 0.5, 0.05],
      [1, a, 0.14 + tier * 0.05],
      [0.85, a + span * 0.5, 0.05],
      [0.36, a + span, 0],
      [0.64, a, 0.2 + tier * 0.05] // the ridge
    ]) {
      positions.push(Math.cos(t) * r, y, Math.sin(t) * r);
      uvs.push(0.5 + Math.cos(t) * r * 0.5, 0.5 + Math.sin(t) * r * 0.5);
    }
    for (let j = 0; j < 5; j++) indices.push(base + j, base + ((j + 1) % 5), base + 5);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Transfer-only seals; no seal is produced for a refused or missing heir.
 *
 * Each accepted inheritance `tier` (1..3) lights its own seal under the heir:
 * it starts wide and *closes* on them as its ring front contracts, turning,
 * then burns away. The engine cues are an AIR burst and a SHOCKWAVE ring
 * centred on the heir, both bounded to 4 m, plus a bounded mote burst.
 */
export class InheritanceSeals {
  constructor(parent, ctx, atmosphere, ownGeometry, ownMaterial) {
    this.ctx = ctx;
    this.atmosphere = atmosphere;
    this.point = new Vector3();
    this.primary = new Color();
    this.edge = new Color();
    this.dark = new Color();
    this.meshes = [];
    this.materials = [];
    this.times = new Array(TIERS).fill(-1);
    for (let i = 0; i < TIERS; i++) {
      const material = ownMaterial(createInheritanceSealMaterial(i));
      const mesh = new Mesh(ownGeometry(inheritanceSealGeometry(i)), material);
      mesh.visible = false;
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false;
      parent.add(mesh);
      this.meshes.push(mesh);
      this.materials.push(material);
    }
  }

  reset() {
    this.times.fill(-1);
    for (const mesh of this.meshes) mesh.visible = false;
  }

  /** @param {number} tier 1..3, the transfer count after this inheritance */
  fire(tier, position, elapsed, c) {
    const index = tier - 1;
    if (index < 0 || index >= TIERS) return;
    this.times[index] = elapsed;
    this.point.fromArray(position);
    this.meshes[index].position.copy(this.point).setY(0.055 + index * 0.01);
    this.primary.copy(getColor(c.shadowColor));
    this.edge.copy(getColor(c.edgeColor));
    this.dark.copy(this.primary).multiplyScalar(0.25);
    const scale = bounded(c.sealScale, 1, 0.25, 3);
    const glow = bounded(c.sealGlow, 0.8, 0, 2);
    const radius = Math.min(4, scale * (0.8 + tier * 0.25));
    this.ctx.bursts?.spawn(BurstMode.AIR, this.point, {
      radius: 0.06,
      endRadius: radius,
      life: 0.35 + tier * 0.1,
      intensity: glow * 0.6 * settings.global.explosionIntensity,
      opacity: 0.45,
      colorA: this.edge,
      colorB: this.primary,
      colorC: this.dark
    });
    this.ctx.decals?.spawn(DecalType.SHOCKWAVE, this.point, {
      radius,
      life: 0.5 + tier * 0.12,
      intensity: glow * 0.6,
      width: 0.04 + tier * 0.01,
      colorA: this.primary,
      colorB: this.dark
    });
    _burst.radius = 0.3 + tier * 0.1;
    this.atmosphere?.burst(position, 8 + tier * 4, _burst);
  }

  update(elapsed, time, fade, c, reducedMotion) {
    const duration = Math.max(0.1, c.sealDuration ?? 0.7);
    const scale = bounded(c.sealScale, 1, 0.25, 3);
    const glow = bounded(c.sealGlow, 0.8, 0, 2) * settings.global.glow;
    const shadow = getColor(c.shadowColor);
    const edge = getColor(c.edgeColor);
    for (let i = 0; i < TIERS; i++) {
      const age = this.times[i] < 0 ? -1 : elapsed - this.times[i];
      const progress = age < 0 ? 0 : clamp01(age / duration);
      const mesh = this.meshes[i];
      mesh.visible = !reducedMotion && age >= 0 && progress < 1;
      // Starts wide and closes on the heir.
      mesh.scale.setScalar(scale * (1.2 - progress * 0.7));
      mesh.rotation.y = time * (i % 2 ? -0.6 : 0.6);
      const u = this.materials[i].uniforms;
      u.uClock.value = time;
      u.uProgress.value = progress;
      u.uFade.value = fade * (1 - progress) * glow;
      u.uColor.value.copy(shadow);
      u.uEdge.value.copy(edge);
    }
  }
}
