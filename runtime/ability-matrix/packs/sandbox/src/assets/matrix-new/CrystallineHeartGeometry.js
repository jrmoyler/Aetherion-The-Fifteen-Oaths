import { BufferGeometry, Float32BufferAttribute } from 'three';
import { hash11 } from '../../utils/math.js';

const TAU = Math.PI * 2;

/**
 * The classic heart curve, t in 0..2π. x is ±16, y runs about −17 (the point)
 * to +12 (the tops of the lobes), with the cleft at t = 0.
 */
function heartCurve(t) {
  const s = Math.sin(t);
  return [
    16 * s * s * s,
    13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
  ];
}

/**
 * A faceted crystal heart — a cut gem in the shape of a heart.
 *
 * Built like a brilliant: the heart outline is the *girdle*, and rings of
 * vertices step from it to a single culet point at the front and another at
 * the back, each ring shrinking the outline toward its centroid and pushing
 * out along z on an elliptical profile. Few rings and few points round the
 * girdle, so every face is a large flat facet; non-indexed with per-face
 * normals so the facets stay crisp. The cleft between the lobes and the point
 * at the bottom come straight from the curve, so it reads as a heart from any
 * angle that is not edge-on.
 *
 * Each vertex also carries:
 *   - `aBary` — barycentric coordinates within its triangle, so the shader can
 *     draw the cut edges as bright lines without a wireframe pass;
 *   - `aFacet` — a per-face random, so facets can catch the light unevenly.
 *
 * Unit space: centred on the origin, 1 across the lobes (±0.5 in x), facing
 * +Z. `depth` is the front-to-back thickness, as a fraction of the width.
 *
 * @param {object} options
 * @param {number} [options.depth]     thickness, × width
 * @param {number} [options.facets]    how hard the facets are cut: 0 a smooth
 *   pillow profile, 1 a gem's flat table and steep pavilion, past 1 sharper still
 * @param {number} [options.segments]  points round the girdle (keep it even)
 * @param {number} [options.seed]
 */
export function createHeartGeometry({ depth = 0.55, facets = 1, segments = 20, seed = 3 } = {}) {
  const girdle = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  // Sample the curve finely, then keep `segments` points spaced evenly by arc
  // length — evenly in t would bunch them at the point and starve the lobes.
  const fine = [];
  const N = 512;
  for (let i = 0; i <= N; i++) fine.push(heartCurve((i / N) * TAU));
  const lengths = [0];
  for (let i = 1; i <= N; i++) {
    const dx = fine[i][0] - fine[i - 1][0];
    const dy = fine[i][1] - fine[i - 1][1];
    lengths.push(lengths[i - 1] + Math.hypot(dx, dy));
  }
  const total = lengths[N];
  const count = Math.max(8, Math.round(segments / 2) * 2);
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total;
    while (j < N && lengths[j + 1] < target) j++;
    const f = (target - lengths[j]) / Math.max(1e-6, lengths[j + 1] - lengths[j]);
    const x = fine[j][0] + (fine[j + 1][0] - fine[j][0]) * f;
    const y = fine[j][1] + (fine[j + 1][1] - fine[j][1]) * f;
    girdle.push([x, y]);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  // Normalise: 1 across, centred on the bounding box.
  const scale = 1 / (maxX - minX);
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  for (const p of girdle) {
    p[0] = (p[0] - cx) * scale;
    p[1] = (p[1] - cy) * scale;
  }
  // The culets sit a little above the box centre — the mass of a heart is in
  // its lobes — so the facets fan out evenly rather than crowding the point.
  const centre = [0, 0.06];
  const half = depth * 0.5;

  /**
   * Rings from the girdle (v = 0) to a culet (|v| = 1). The front gets a broad
   * table (the last ring stays wide, then steps in), the back a deeper
   * pavilion. `facets` blends both toward a smooth elliptical profile.
   */
  const front = [
    [1.0, 0.0],
    [0.86, 0.55],
    [0.52, 0.92],
    [0.0, 1.0]
  ];
  const back = [
    [1.0, 0.0],
    [0.72, 0.45],
    [0.34, 0.8],
    [0.0, 1.0]
  ];
  const smooth = (v) => [Math.cos(v * Math.PI * 0.5), Math.sin(v * Math.PI * 0.5)];
  const ringsFor = (profile, sign) =>
    profile.map(([r, z], index) => {
      const v = index / (profile.length - 1);
      const s = smooth(v);
      const k = Math.min(1.5, Math.max(0, facets));
      const rr = s[0] + (r - s[0]) * k;
      const zz = (s[1] + (z - s[1]) * k) * half * sign;
      return girdle.map((p, i) => {
        // Rings are rotated half a step against each other, so the facets
        // interlock like a cut stone's instead of stacking into bands.
        const twist = index % 2 === 1 ? 0.5 : 0;
        const q = girdle[(i + (twist ? 1 : 0)) % girdle.length];
        const px = twist ? (p[0] + q[0]) * 0.5 : p[0];
        const py = twist ? (p[1] + q[1]) * 0.5 : p[1];
        const jitter = 1 + (hash11(seed * 7.3 + index * 13.1 + i * 3.7 + sign) - 0.5) * 0.05 * k;
        return [
          centre[0] + (px - centre[0]) * rr * jitter,
          centre[1] + (py - centre[1]) * rr * jitter,
          zz
        ];
      });
    });

  const positions = [];
  const bary = [];
  const facet = [];
  let face = 0;
  const tri = (a, b, c) => {
    positions.push(...a, ...b, ...c);
    bary.push(1, 0, 0, 0, 1, 0, 0, 0, 1);
    const r = hash11(seed * 1.31 + face * 0.917);
    facet.push(r, r, r);
    face++;
  };

  for (const [profile, sign] of [[front, 1], [back, -1]]) {
    const rings = ringsFor(profile, sign);
    const n = girdle.length;
    for (let r = 0; r < rings.length - 1; r++) {
      const lo = rings[r];
      const hi = rings[r + 1];
      const last = r === rings.length - 2;
      for (let i = 0; i < n; i++) {
        const i1 = (i + 1) % n;
        // Wind so the outward normal faces +z on the front, −z on the back.
        if (last) {
          // The culet: one point.
          const tip = [centre[0], centre[1], hi[0][2]];
          if (sign > 0) tri(lo[i], lo[i1], tip);
          else tri(lo[i1], lo[i], tip);
        } else if (sign > 0) {
          tri(lo[i], lo[i1], hi[i]);
          tri(lo[i1], hi[i1], hi[i]);
        } else {
          tri(lo[i1], lo[i], hi[i]);
          tri(hi[i1], lo[i1], hi[i]);
        }
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aBary', new Float32BufferAttribute(bary, 3));
  geometry.setAttribute('aFacet', new Float32BufferAttribute(facet, 1));
  geometry.computeVertexNormals(); // non-indexed: per-face normals, crisp facets
  geometry.computeBoundingSphere();
  return geometry;
}

/** Rib authoring dimensions, metres: the foot's radius, the tip's radius, the height. */
export const RIB_FOOT = 2.6;
export const RIB_TIP = 0.95;
export const RIB_HEIGHT = 3.4;

/**
 * One rib of the crystal cage that cradles the heart: a five-sided quartz
 * blade swept along an arc in the XY plane, rising straight out of the floor
 * at x = RIB_FOOT and arching inward to a point at x = RIB_TIP, y = RIB_HEIGHT.
 * The section tapers from 0.24 m at the foot to a point, flattened across
 * the arc so it reads as a blade, and twists a little as it climbs so its
 * facets catch the sun one after another. The ability turns local +X onto the
 * rib's bearing and scales it to the live ring radius and height. Indexed —
 * the material shades it flat.
 */
export function createHeartRibGeometry({ sides = 5, rows = 18, seed = 1.7 } = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const point = (s) => {
    const k = Math.pow(s, 2.2);
    return [RIB_FOOT - (RIB_FOOT - RIB_TIP) * k, RIB_HEIGHT * Math.pow(Math.sin((s * Math.PI) / 2), 0.85)];
  };
  for (let j = 0; j <= rows; j++) {
    const s = j / rows;
    const [x, y] = point(s);
    // Tangent of the arc, for a section square to it.
    const [x2, y2] = point(Math.min(1, s + 0.01));
    const [x1, y1] = point(Math.max(0, s - 0.01));
    let tx = x2 - x1;
    let ty = y2 - y1;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const nx = -ty; // in-plane normal
    const ny = tx;
    const radius = j === rows ? 0.0 : 0.24 * Math.pow(1 - s, 0.7) + 0.015;
    const twist = s * 0.9 + seed;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * TAU + twist;
      const jitter = 1 + 0.12 * (hash11(seed * 13 + i * 3.1 + j * 0.37) - 0.5);
      const across = Math.cos(a) * radius * 0.65 * jitter; // in the arc's plane (flattened)
      const out = Math.sin(a) * radius * jitter; // out of the plane
      positions.push(x + nx * across, y + ny * across, out);
      uvs.push(i / sides, s);
    }
  }
  const stride = sides + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * stride + i;
      indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
    }
  }
  // Cap the foot (buried, but it closes the silhouette when it rises).
  const centre = positions.length / 3;
  positions.push(RIB_FOOT, 0, 0);
  uvs.push(0.5, 0);
  for (let i = 0; i < sides; i++) indices.push(centre, i + 1, i);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
