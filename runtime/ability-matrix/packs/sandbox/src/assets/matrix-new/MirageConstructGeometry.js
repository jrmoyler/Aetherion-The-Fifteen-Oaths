import { BufferGeometry, CapsuleGeometry, Float32BufferAttribute, SphereGeometry, Vector3, Quaternion } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * The Mirage Construct's fallback figure.
 *
 * The construct is meant to be the caster's *own* rig, cloned with
 * `SkeletonUtils` and breathing its own idle. This is what stands in when that
 * is impossible — the character has not loaded (a headless harness, a failed
 * FBX) — so the ability still has a body to assemble and burst rather than an
 * empty circle.
 *
 * A stylised standing figure built from capsules: head, neck, chest, waist,
 * upper and lower arms hanging slightly away from the body, thighs and shins.
 * Feet on y = 0, `height` metres tall, facing +Z. One merged, indexed geometry
 * with real normals, because the body shader is fresnel-driven and a
 * silhouette without normals has no rim.
 *
 * @param {number} [height] metres, head to toe
 */
export function createMirageFigureGeometry(height = 1.78) {
  const s = height / 1.78;
  const parts = [];
  const a = new Vector3();
  const b = new Vector3();
  const mid = new Vector3();
  const dir = new Vector3();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);

  /** A capsule of radius `r` from `from` to `to` (metres, pre-scale). */
  const limb = (from, to, r) => {
    a.fromArray(from).multiplyScalar(s);
    b.fromArray(to).multiplyScalar(s);
    dir.subVectors(b, a);
    const length = Math.max(0.001, dir.length() - 0);
    const g = new CapsuleGeometry(r * s, Math.max(0.001, length - r * s * 0.5), 6, 12);
    q.setFromUnitVectors(up, dir.normalize());
    g.applyQuaternion(q);
    mid.addVectors(a, b).multiplyScalar(0.5);
    g.translate(mid.x, mid.y, mid.z);
    parts.push(g);
  };

  // Head and neck.
  const head = new SphereGeometry(0.108 * s, 18, 14);
  head.scale(0.92, 1.08, 1.0);
  head.translate(0, 1.645 * s, 0.01 * s);
  parts.push(head);
  limb([0, 1.47, 0], [0, 1.56, 0.005], 0.05);

  // Torso: chest, waist, hips — three overlapping capsules make the taper.
  limb([0, 1.18, 0], [0, 1.4, 0], 0.15);
  limb([0, 1.02, 0], [0, 1.2, 0], 0.125);
  limb([-0.09, 0.95, 0], [0.09, 0.95, 0], 0.115);
  // Shoulders.
  limb([-0.19, 1.4, 0], [0.19, 1.4, 0], 0.06);

  // Arms: hanging, a little away from the body, elbows soft.
  for (const side of [-1, 1]) {
    limb([0.21 * side, 1.4, 0], [0.27 * side, 1.12, -0.02], 0.048);
    limb([0.27 * side, 1.12, -0.02], [0.3 * side, 0.86, 0.03], 0.04);
    limb([0.3 * side, 0.86, 0.03], [0.31 * side, 0.78, 0.04], 0.035); // hand
  }

  // Legs: thighs, shins, feet.
  for (const side of [-1, 1]) {
    limb([0.1 * side, 0.92, 0], [0.11 * side, 0.5, 0.01], 0.07);
    limb([0.11 * side, 0.5, 0.01], [0.115 * side, 0.08, -0.01], 0.052);
    limb([0.115 * side, 0.05, -0.03], [0.12 * side, 0.04, 0.12], 0.04);
  }

  // Capsules come out indexed with position/normal/uv, so they merge cleanly.
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * The heat veil: `ribbons` tall tongues of shimmer standing in a ring round
 * the copy — the air itself bending, which is what a mirage *is*.
 *
 * Parameter-space geometry (technique: shape in the vertex shader). Every
 * vertex carries only `(t, a, i)`: `t` 0 at the floor .. 1 at the tip, `a`
 * −1..1 across the ribbon, `i` the ribbon index. No metres: the material
 * seats each ribbon on the ring (`veilSeat × zoneRadius`), sways it, tapers
 * it to a flame-like tip, pulls it in on the charge and blows it out on the
 * burst, all from settings every frame. `position` holds the same triple so
 * three's bounding volumes are harmless; the mesh is `frustumCulled = false`.
 *
 * @param {number} ribbons
 * @param {number} rows    segments up a ribbon
 * @param {number} cols    segments across a ribbon
 */
export function createMirageVeilGeometry(ribbons = 9, rows = 24, cols = 4) {
  const params = [];
  const index = [];
  for (let i = 0; i < ribbons; i++) {
    const base = params.length / 3;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      for (let k = 0; k <= cols; k++) params.push(t, (k / cols) * 2 - 1, i);
    }
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const a = base + r * (cols + 1) + k;
        const b = a + cols + 1;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(params, 3));
  geometry.setIndex(index);
  return geometry;
}
