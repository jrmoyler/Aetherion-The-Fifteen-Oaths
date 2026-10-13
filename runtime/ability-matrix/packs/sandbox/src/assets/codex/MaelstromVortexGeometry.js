import { BufferAttribute, BufferGeometry, CylinderGeometry, PlaneGeometry } from 'three';

/**
 * Maelstrom Vortex — procedural geometry.
 *
 *  - `createFunnelGeometry` — a polar grid on the unit disc, (x, 0, z) with
 *    radius ≤ 1. Rings are packed toward the middle (`pow`), because that is
 *    where the surface plunges and needs the vertices; the vertex stage scales
 *    it to the pool and drops it into the whirlpool.
 *  - `createGeyserGeometry` — an open tube, y 0..1, unit radius, shaped by the
 *    column shader.
 *  - `createWarpGeometry` — a unit quad on the floor (XZ, ±1) for the swirl's
 *    refraction proxy.
 */
export function createFunnelGeometry(rings = 72, segments = 160) {
  const verts = (rings + 1) * (segments + 1);
  const position = new Float32Array(verts * 3);
  let k = 0;
  for (let i = 0; i <= rings; i++) {
    // Never quite zero: the eye is a hole, and a degenerate centre fan would
    // put every one of its normals on the same point.
    const r = 0.004 + 0.996 * Math.pow(i / rings, 1.35);
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      position[k++] = Math.cos(a) * r;
      position[k++] = 0;
      position[k++] = Math.sin(a) * r;
    }
  }
  const index = [];
  const row = segments + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * row + j;
      const b = a + row;
      // Wound so the front face looks up.
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setIndex(index);
  return geometry;
}

export function createGeyserGeometry(radial = 40, height = 28) {
  const geometry = new CylinderGeometry(1, 1, 1, radial, height, true);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

export function createWarpGeometry() {
  return new PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2);
}
