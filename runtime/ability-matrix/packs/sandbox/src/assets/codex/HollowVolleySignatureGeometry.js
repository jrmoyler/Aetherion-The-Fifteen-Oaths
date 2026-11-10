import { LatheGeometry, Vector2 } from 'three';

/**
 * HollowVolley — the cast's own signature geometry, kept out of the generated
 * `HollowVolleyGeometry.js` (which is pinned byte for byte by tests/pure-rigs.test.mjs).
 */

/* ------------------------------------------------------------------ */
/* The signature: hollow seeds, and the wells they leave              */
/* ------------------------------------------------------------------ */

/**
 * The hollow seed: a five-lobed husk, pointed at the root and open at the
 * crown, so the light inside shows through the mouth and the slit seams the
 * shader cuts along each lobe valley. Unit height, centred on y = 0; the
 * mouth is at +Y. `uv.x` runs round the husk, `uv.y` from root to mouth.
 */
export function createHollowVolleySeedGeometry() {
  const profile = [
    [0.001, -0.5], [0.12, -0.46], [0.26, -0.34], [0.36, -0.16], [0.4, 0.02],
    [0.37, 0.18], [0.29, 0.32], [0.2, 0.41], [0.15, 0.46]
  ].map(([r, y]) => new Vector2(r, y));
  const geometry = new LatheGeometry(profile, 30);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    // Five lobes, deepest at the waist, and a slight twist up the husk.
    const waist = 1 - Math.abs(y) * 1.4;
    const lobe = 1 + 0.12 * Math.max(0, waist) * Math.cos(5 * (a + y * 0.6));
    pos.setXYZ(i, x * lobe, y, z * lobe);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The lip of a well: a ragged ring of thrown-up floor, unit outer radius,
 * a little under 0.2 tall at its crest. Heights and radii are periodic in the
 * angle so the lathe seam closes.
 */
export function createHollowVolleyLipGeometry() {
  const profile = [[0.62, 0], [0.7, 0.08], [0.8, 0.16], [0.9, 0.18], [1.0, 0.1], [1.08, 0]].map(([r, y]) => new Vector2(r, y));
  const geometry = new LatheGeometry(profile, 56);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const jag = 0.5 + 0.5 * Math.sin(a * 7 + 0.4) * Math.sin(a * 3 + 1.1);
    const rough = 1 + 0.05 * Math.sin(a * 11 + 2.0) + 0.04 * Math.sin(a * 17 + 0.7);
    pos.setXYZ(i, x * rough, y * (0.45 + 1.1 * jag), z * rough);
  }
  geometry.computeVertexNormals();
  return geometry;
}
