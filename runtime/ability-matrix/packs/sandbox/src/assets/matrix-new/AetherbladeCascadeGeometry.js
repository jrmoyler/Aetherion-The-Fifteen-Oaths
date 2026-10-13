import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

/**
 * Procedural geometry for Aetherblade Cascade: the spectral sword.
 *
 * Built **tip-down**, because that is the only way these swords are ever
 * seen: the point sits at the origin and the sword runs up +Y to the pommel,
 * so an instance placed at its landing point and pushed back along its own
 * axis stabs straight down that axis into the floor.
 *
 * Unit space: the whole sword is 1 long. The blade takes the bottom
 * `bladeFraction`, with a diamond cross-section (a ridge down each face, two
 * cutting edges) whose width swells from a needle tip, holds, and narrows
 * slightly toward the guard. Above it a crossguard with swept quillons, an
 * octagonal grip and a faceted pommel. Every face is flat-shaded (unindexed,
 * one normal per triangle): glass reads as glass because its facets each catch
 * a different piece of sky.
 *
 * Attributes the blade material reads:
 *
 *   - `aV`    — 0 at the tip to 1 at the pommel. The dissolve-in runs up it.
 *   - `aEdge` — signed position across the blade face, -1 one edge, 0 the
 *               ridge, +1 the other edge. The rune channel runs down the
 *               middle of it and the cutting edges glow at its ends. 0 off the
 *               blade.
 *   - `aPart` — 0 blade, 1 crossguard, 2 grip, 3 pommel.
 *
 * @param {object} [options]
 * @param {number} [options.width]          blade half-width, × the sword length
 * @param {number} [options.thickness]      ridge half-thickness, × the sword length
 * @param {number} [options.bladeFraction]  share of the length that is blade
 * @param {number} [options.guardWidth]     crossguard half-span, × the blade width
 * @param {number} [options.rings]          rings up the blade
 */
export function createAetherbladeGeometry({
  width = 0.055,
  thickness = 0.016,
  bladeFraction = 0.74,
  guardWidth = 3.4,
  rings = 14
} = {}) {
  const pos = [];
  const v = [];
  const edge = [];
  const part = [];

  function tri(a, b, c, va, vb, vc, ea, eb, ec, p) {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    v.push(va, vb, vc);
    edge.push(ea, eb, ec);
    part.push(p, p, p);
  }

  /* ---- the blade: diamond rings from the tip up to the guard ---- */
  const bladeTop = bladeFraction;
  const profile = (f) => {
    // Needle point, swelling quickly, a long parallel run, a slight waist
    // under the guard (the ricasso).
    const point = Math.min(1, f / 0.16);
    const swell = 1 - Math.pow(1 - point, 2.2);
    const waist = 1 - 0.18 * Math.max(0, (f - 0.82) / 0.18);
    return swell * waist;
  };
  const ringPts = [];
  for (let j = 0; j <= rings; j++) {
    const f = j / rings;
    const y = f * bladeTop;
    const w = width * profile(f);
    const t = thickness * Math.max(0.15, profile(f));
    // +X edge, +Z ridge, -X edge, -Z ridge.
    ringPts.push({ y, f, pts: [[w, y, 0], [0, y, t], [-w, y, 0], [0, y, -t]] });
  }
  // The very tip is a single point so the needle is a real needle.
  ringPts[0].pts = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const edgeOf = [1, 0, -1, 0];
  for (let j = 0; j < rings; j++) {
    const lo = ringPts[j];
    const hi = ringPts[j + 1];
    const vlo = lo.y;
    const vhi = hi.y;
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      const a = lo.pts[k];
      const b = lo.pts[k2];
      const c = hi.pts[k2];
      const d = hi.pts[k];
      tri(a, c, b, vlo, vhi, vlo, edgeOf[k], edgeOf[k2], edgeOf[k2], 0);
      tri(a, d, c, vlo, vhi, vhi, edgeOf[k], edgeOf[k], edgeOf[k2], 0);
    }
  }

  /* ---- a faceted box helper for the furniture ---- */
  // Eight corners of a box between y0 and y1, half-extents (hx0,hz0) at the
  // bottom and (hx1,hz1) at the top, its centre-line bent by `bend` at the ends.
  function prism(y0, y1, hx0, hz0, hx1, hz1, p, bend = 0) {
    const yb = [y0, y0, y0, y0];
    const c0 = [[hx0, -hz0], [hx0, hz0], [-hx0, hz0], [-hx0, -hz0]];
    const c1 = [[hx1, -hz1], [hx1, hz1], [-hx1, hz1], [-hx1, -hz1]];
    const lower = c0.map(([x, z], i) => [x, yb[i] + bend * Math.abs(x) / Math.max(hx0, 1e-4), z]);
    const upper = c1.map(([x, z]) => [x, y1 + bend * Math.abs(x) / Math.max(hx1, 1e-4), z]);
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      tri(lower[k], upper[k2], lower[k2], y0, y1, y0, 0, 0, 0, p);
      tri(lower[k], upper[k], upper[k2], y0, y1, y1, 0, 0, 0, p);
    }
    tri(lower[0], lower[1], lower[2], y0, y0, y0, 0, 0, 0, p);
    tri(lower[0], lower[2], lower[3], y0, y0, y0, 0, 0, 0, p);
    tri(upper[0], upper[2], upper[1], y1, y1, y1, 0, 0, 0, p);
    tri(upper[0], upper[3], upper[2], y1, y1, y1, 0, 0, 0, p);
  }

  /* ---- crossguard: a bar with quillons swept toward the blade ---- */
  const gy0 = bladeTop;
  const gy1 = bladeTop + 0.03;
  const span = width * guardWidth;
  // Centre block, then two quillons whose tips sweep down toward the point.
  prism(gy0, gy1, width * 1.15, thickness * 2.2, width * 1.15, thickness * 2.2, 1);
  for (const side of [1, -1]) {
    const x0 = width * 1.15 * side;
    const x1 = span * side;
    const drop = 0.045;
    // Each quillon is a tapered prism laid sideways: build it from quads.
    const h0 = 0.015;
    const h1 = 0.006;
    const z0 = thickness * 1.8;
    const z1 = thickness * 0.9;
    const yc0 = (gy0 + gy1) * 0.5;
    const yc1 = yc0 - drop;
    const A = [[x0, yc0 - h0, -z0], [x0, yc0 - h0, z0], [x0, yc0 + h0, z0], [x0, yc0 + h0, -z0]];
    const B = [[x1, yc1 - h1, -z1], [x1, yc1 - h1, z1], [x1, yc1 + h1, z1], [x1, yc1 + h1, -z1]];
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      if (side > 0) {
        tri(A[k], A[k2], B[k2], yc0, yc0, yc1, 0, 0, 0, 1);
        tri(A[k], B[k2], B[k], yc0, yc1, yc1, 0, 0, 0, 1);
      } else {
        tri(A[k], B[k2], A[k2], yc0, yc1, yc0, 0, 0, 0, 1);
        tri(A[k], B[k], B[k2], yc0, yc1, yc1, 0, 0, 0, 1);
      }
    }
    // A small faceted bead on the end of each quillon.
    const tipC = [x1 + side * 0.012, yc1, 0];
    const r = 0.014;
    const oct = [
      [tipC[0] + r, tipC[1], tipC[2]], [tipC[0] - r, tipC[1], tipC[2]],
      [tipC[0], tipC[1] + r, tipC[2]], [tipC[0], tipC[1] - r, tipC[2]],
      [tipC[0], tipC[1], tipC[2] + r], [tipC[0], tipC[1], tipC[2] - r]
    ];
    octahedron(oct, yc1, 1);
  }

  /* ---- grip: octagonal, slightly waisted ---- */
  const grip0 = gy1;
  const grip1 = gy1 + 0.17;
  const sides = 8;
  const gr = (f) => thickness * 1.25 * (1 - 0.12 * Math.sin(f * Math.PI));
  const gripRings = 4;
  for (let j = 0; j < gripRings; j++) {
    const fa = j / gripRings;
    const fb = (j + 1) / gripRings;
    const ya = grip0 + (grip1 - grip0) * fa;
    const yb = grip0 + (grip1 - grip0) * fb;
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2;
      const a1 = ((k + 1) / sides) * Math.PI * 2;
      const p00 = [Math.cos(a0) * gr(fa), ya, Math.sin(a0) * gr(fa)];
      const p01 = [Math.cos(a1) * gr(fa), ya, Math.sin(a1) * gr(fa)];
      const p10 = [Math.cos(a0) * gr(fb), yb, Math.sin(a0) * gr(fb)];
      const p11 = [Math.cos(a1) * gr(fb), yb, Math.sin(a1) * gr(fb)];
      tri(p00, p11, p01, ya, yb, ya, 0, 0, 0, 2);
      tri(p00, p10, p11, ya, yb, yb, 0, 0, 0, 2);
    }
  }

  /* ---- pommel: an elongated octahedron ---- */
  const pc = grip1 + 0.035;
  const pr = thickness * 2.6;
  octahedron(
    [[pr, pc, 0], [-pr, pc, 0], [0, pc + 0.05, 0], [0, grip1 - 0.004, 0], [0, pc, pr], [0, pc, -pr]],
    pc,
    3
  );

  function octahedron(o, vv, p) {
    // o: +x, -x, +y, -y, +z, -z
    const faces = [
      [0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0],
      [0, 4, 3], [4, 1, 3], [1, 5, 3], [5, 0, 3]
    ];
    for (const [a, b, c] of faces) tri(o[a], o[b], o[c], vv, vv, vv, 0, 0, 0, p);
  }

  // Normalise aV so the pommel is exactly 1.
  const top = pc + 0.05;
  for (let i = 0; i < v.length; i++) v[i] = Math.min(1, v[i] / top);
  for (let i = 1; i < pos.length; i += 3) pos[i] /= top;
  for (let i = 0; i < pos.length; i++) if (i % 3 !== 1) pos[i] /= top;

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('aV', new BufferAttribute(new Float32Array(v), 1));
  geometry.setAttribute('aEdge', new BufferAttribute(new Float32Array(edge), 1));
  geometry.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1));
  // Unindexed: one normal per face is the faceted-glass look.
  geometry.computeVertexNormals();
  geometry.boundingSphere = new Sphere(new Vector3(0, 0.5, 0), 1);
  return geometry;
}
