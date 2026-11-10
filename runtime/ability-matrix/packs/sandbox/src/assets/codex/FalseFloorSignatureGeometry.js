import { Float32BufferAttribute, LatheGeometry, Vector2 } from 'three';

/**
 * False Floor — the cast's own solid (upgrade pass).
 *
 * Kept apart from the generated `FalseFloorGeometry.js` (pinned byte for byte
 * by tests/pure-rigs.test.mjs).
 *
 * **tile** — one flagstone of the false floor: a square slab 1 × 1 m, 0.24 m
 * thick, its top face at y = 0 and a chamfered top edge, so a field of them
 * reads as paving with real seams the sun can catch. Flat-shaded, a little
 * irregular. Every vertex carries `aHeat` (0..1): highest on the chamfer and the top
 * of the sides — the seam the illusion glows through — and little further down;
 * the top face is 0 (it pretends to be plain floor).
 */
export function createFalseFloorTileGeometry() {
  const h = Math.SQRT1_2; // half-diagonal of a unit square
  const g = new LatheGeometry(
    [[0, 0], [h - 0.06, 0], [h - 0.02, -0.03], [h, -0.06], [h * 0.97, -0.24], [0, -0.24]].map(([r, y]) => new Vector2(r, y)),
    4
  );
  g.rotateY(Math.PI / 4);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    // A worn, hand-cut slab: corners a touch off square, the top a touch domed.
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = Math.sin(Math.round(x * 97) * 12.9898 + Math.round(z * 89) * 78.233 + Math.round(y * 83) * 3.7) * 43758.5453;
    const j = (k - Math.floor(k) - 0.5) * 0.04;
    pos.setXYZ(i, x * (1 + j), y + (y === 0 && Math.hypot(x, z) < 0.1 ? 0.012 : 0), z * (1 - j));
  }
  const flat = g.toNonIndexed();
  g.dispose();
  const p = flat.getAttribute('position');
  const heat = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const r = Math.max(Math.abs(p.getX(i)), Math.abs(p.getZ(i)));
    heat[i] = y > -0.005 ? (r > 0.44 ? 0.5 : 0) : y > -0.08 ? 0.6 : 0.12;
  }
  flat.setAttribute('aHeat', new Float32BufferAttribute(heat, 1));
  flat.deleteAttribute('uv');
  flat.deleteAttribute('normal');
  flat.computeVertexNormals();
  flat.computeBoundingSphere();
  return flat;
}
