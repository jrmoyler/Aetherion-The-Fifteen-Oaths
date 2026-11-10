import { Float32BufferAttribute, LatheGeometry, Vector2 } from 'three';

/**
 * Facet Volley — the cast's own crystals (upgrade pass).
 *
 * Kept apart from the generated `FacetVolleyGeometry.js` (pinned byte for
 * byte by tests/pure-rigs.test.mjs). Two shapes, both six-sided, faceted,
 * flat-shaded and slightly irregular so the sun breaks them into planes:
 *
 *  - **seed** — a double-terminated amethyst, 1 m long along +Y with its
 *    centre on the origin, radius 0.17 m: what flies. The leading tip is +Y.
 *  - **prism** — a single-terminated crystal for the planted clusters, 1 m
 *    tall from its root (y = −0.15, buried) to its point, radius 0.16 m,
 *    a slight bulge and a skewed termination.
 *
 * Every vertex carries `aHeat` (0..1): how close it is to a termination,
 * where the light gathers. The material turns it into the glowing tips; the
 * body stays dark lit crystal.
 */

function jitterOf(x, y, z, salt) {
  const h = Math.sin(Math.round(x * 997) * 12.9898 + Math.round(y * 991) * 78.233 + Math.round(z * 983) * 37.719 + salt * 17.13) * 43758.5453;
  return h - Math.floor(h);
}

function faceted(profile, salt, rough, skew, heatOf) {
  const g = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 6);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const k = r < 1e-5 ? 1 : 1 + (jitterOf(x, y, z, salt) - 0.5) * 2 * rough;
    // A skewed termination: the point leans off axis like a grown crystal.
    const lean = skew * Math.max(0, y - 0.55);
    pos.setXYZ(i, x * k + lean, y, z * k + lean * 0.4);
  }
  const flat = g.toNonIndexed();
  g.dispose();
  const p = flat.getAttribute('position');
  const heat = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) heat[i] = heatOf(p.getY(i));
  flat.setAttribute('aHeat', new Float32BufferAttribute(heat, 1));
  flat.deleteAttribute('uv');
  flat.deleteAttribute('normal');
  flat.computeVertexNormals();
  flat.computeBoundingSphere();
  return flat;
}

/** The flying seed: double-terminated, 1 m long, centred, leading tip at +Y. */
export function createFacetVolleySeedGeometry() {
  return faceted(
    [[0, -0.5], [0.1, -0.33], [0.17, -0.16], [0.17, 0.18], [0.12, 0.3], [0, 0.5]],
    5,
    0.06,
    0,
    (y) => Math.max(0, (Math.abs(y) - 0.15) / 0.35)
  );
}

/** A planted prism: 1 m root to point, root buried at y = −0.15, skewed termination. */
export function createFacetVolleyPrismGeometry() {
  return faceted(
    [[0, -0.15], [0.15, -0.15], [0.16, 0.2], [0.17, 0.5], [0.15, 0.68], [0.06, 0.88], [0, 1.0]],
    9,
    0.09,
    0.12,
    (y) => (y > 0.62 ? Math.min(1, (y - 0.62) / 0.3) : y < 0.0 ? 0.35 : 0)
  );
}
