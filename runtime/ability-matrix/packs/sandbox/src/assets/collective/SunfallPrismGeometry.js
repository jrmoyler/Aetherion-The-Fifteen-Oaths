import { BufferAttribute, BufferGeometry, CylinderGeometry, Vector3 } from 'three';

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _n = new Vector3();
const _m = new Vector3();

/**
 * The crystal: a faceted bipyramid with a straight waist.
 *
 * `sides` facets round a band of height `band` (fraction of the total), capped
 * top and bottom by pyramids running to a point. Three sides is a true
 * triangular prism stood on end and drawn to points, which is the silhouette
 * the reference wants; more sides read as a cut gem. The upper ring is turned
 * by `twist` against the lower one, so the waist facets are skewed
 * parallelograms rather than rectangles — a small thing that stops it looking
 * like a lathe part.
 *
 * Unit size: radius 1 at the waist, height 1 from tip to tip, centred on the
 * origin. The ability scales it from the live settings.
 *
 * Built non-indexed with flat normals, and with one extra attribute the glass
 * shader uses for its facet edges: `aEdge`, a barycentric coordinate per
 * triangle whose minimum is zero along a *real* edge. The diagonal that splits
 * each waist quad into two triangles is not a real edge of the stone, so its
 * component is pinned to 1 and the shader never draws it.
 *
 * @param {object} o
 * @param {number} o.sides  facets round the waist, 3..12
 * @param {number} o.band   waist height, fraction of the total, 0..0.9
 * @param {number} o.twist  radians the upper ring is turned
 */
export function createPrismGeometry({ sides = 3, band = 0.3, twist = 0.3 } = {}) {
  const n = Math.max(3, Math.min(12, Math.round(sides)));
  const half = Math.max(0, Math.min(0.9, band)) * 0.5;

  const top = new Vector3(0, 0.5, 0);
  const bottom = new Vector3(0, -0.5, 0);
  const upper = [];
  const lower = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    lower.push(new Vector3(Math.cos(a), -half, Math.sin(a)));
    upper.push(new Vector3(Math.cos(a + twist), half, Math.sin(a + twist)));
  }

  const positions = [];
  const edges = [];

  /**
   * One triangle, wound outward. `skip` is which of the three edges (by the
   * index of the vertex *opposite* it) is not a real edge, or -1.
   */
  const tri = (p, q, r, skip = -1) => {
    _a.copy(p);
    _b.copy(q);
    _c.copy(r);
    _n.subVectors(_b, _a).cross(_m.subVectors(_c, _a));
    // Outward test against the triangle's own centroid: the solid is convex
    // and centred on the origin, so this is exact.
    _m.copy(_a).add(_b).add(_c);
    if (_n.dot(_m) < 0) {
      const t = _b.clone();
      _b.copy(_c);
      _c.copy(t);
    }
    positions.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
    const e = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ];
    if (skip >= 0) for (const v of e) v[skip] = 1;
    for (const v of e) edges.push(v[0], v[1], v[2]);
  };

  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    // The caps.
    tri(top, upper[k], upper[k1]);
    tri(bottom, lower[k1], lower[k]);
    // The waist: two triangles per facet, the shared diagonal hidden. In each,
    // the diagonal is opposite the first vertex.
    if (half > 1e-4) {
      tri(lower[k], upper[k], lower[k1], 0);
      tri(upper[k1], lower[k1], upper[k], 0);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('aEdge', new BufferAttribute(new Float32Array(edges), 3));
  // Non-indexed, so this gives each facet its own flat normal.
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A light beam: an open cylinder of radius 1 running from y = 0 to y = 1.
 *
 * The ability stands it on its contact point and points +Y at the source, so
 * scaling Y is the beam's length. The beam material tapers the radius along
 * Y, which is how the same mesh is the wide sun shaft, the thin white strike
 * and every spectral beam.
 */
export function createBeamGeometry(radialSegments = 20) {
  const geometry = new CylinderGeometry(1, 1, 1, radialSegments, 1, true);
  geometry.translate(0, 0.5, 0);
  return geometry;
}
