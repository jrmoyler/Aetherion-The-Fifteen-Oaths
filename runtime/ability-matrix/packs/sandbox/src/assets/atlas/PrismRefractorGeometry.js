import { BufferAttribute, BufferGeometry, PlaneGeometry, Sphere, Vector3 } from 'three';

/**
 * Geometry for Prism Refractor.
 *
 * ## The crystal
 *
 * A capped prism — an `sides`-gon column of height `height` with a pyramid
 * point of `cap` on each end — centred on the origin, Y up. Unlike Sunfall's
 * bipyramid (all point, no body), this is a *column*: the long flat faces are
 * what a refracted beam visibly leaves from, and a triangular section is the
 * shape everyone reads as "prism".
 *
 * It is built **non-indexed and flat**: every triangle has its own three
 * vertices, so
 *
 *   normal  the face normal (hard facets, no smoothing)
 *   aEdge   barycentric (1,0,0)/(0,1,0)/(0,0,1), with the component across a
 *           *diagonal* of a quad pinned to 1 so only the solid's real edges are
 *           drawn — the material draws `min(aEdge)` near zero as a line
 *   aFace   a per-face random 0..1 and the face's height band, used by the
 *           shatter to give each facet its own clock
 *
 * The body is split into `bands` rows so the crack network (in the shader) has
 * vertices to work with and the materialise scan has a gradient up the column.
 */
export function createPrismGeometry({ sides = 3, height = 1.5, cap = 0.45, bands = 3 } = {}) {
  const N = Math.max(3, Math.round(sides));
  const B = Math.max(1, Math.round(bands));
  const h = height * 0.5;
  const pos = [];
  const nor = [];
  const edge = [];
  const face = [];

  const ring = (i, y) => {
    const a = (i / N) * Math.PI * 2 + Math.PI / 2;
    return [Math.cos(a), y, Math.sin(a)];
  };

  const n = new Vector3();
  const e1 = new Vector3();
  const e2 = new Vector3();

  const tri = (a, b, c, ea, eb, ec, rnd, band) => {
    e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    n.crossVectors(e1, e2).normalize();
    for (const [p, e] of [[a, ea], [b, eb], [c, ec]]) {
      pos.push(p[0], p[1], p[2]);
      nor.push(n.x, n.y, n.z);
      edge.push(e[0], e[1], e[2]);
      face.push(rnd, band);
    }
  };

  // Body: N quads per band, two triangles each. The diagonal is hidden by
  // holding the component opposite it at 1 on both triangles.
  for (let b = 0; b < B; b++) {
    const y0 = -h + (height * b) / B;
    const y1 = -h + (height * (b + 1)) / B;
    const isBottom = b === 0;
    const isTop = b === B - 1;
    for (let i = 0; i < N; i++) {
      const p00 = ring(i, y0);
      const p10 = ring(i + 1, y0);
      const p01 = ring(i, y1);
      const p11 = ring(i + 1, y1);
      const rnd = Math.random();
      const band = (b + 0.5) / B;
      // An edge is hidden by pinning the barycentric component of the vertex
      // *opposite* it to 1 on all three corners. The diagonal is always
      // hidden; the seam between two bands is hidden, so only the column's
      // real top and bottom rims are drawn.
      const hideBottom = isBottom ? 0 : 1;
      const hideTop = isTop ? 0 : 1;
      // Triangle 1: p00, p10, p11. Opposite p00 = side (drawn), opposite
      // p10 = diagonal (hidden), opposite p11 = bottom rim.
      tri(p00, p10, p11, [1, 1, hideBottom], [0, 1, hideBottom], [0, 1, 1], rnd, band);
      // Triangle 2: p00, p11, p01. Opposite p00 = top rim, opposite p11 =
      // side (drawn), opposite p01 = diagonal (hidden).
      tri(p00, p11, p01, [1, 0, 1], [hideTop, 1, 1], [hideTop, 0, 1], rnd, band);
    }
  }

  // Caps: a pyramid point on each end.
  for (const sign of [1, -1]) {
    const tip = [0, sign * (h + cap), 0];
    const y = sign * h;
    for (let i = 0; i < N; i++) {
      const a = ring(i, y);
      const b = ring(i + 1, y);
      const rnd = Math.random();
      const band = sign > 0 ? 1 : 0;
      if (sign > 0) tri(a, tip, b, [1, 0, 0], [0, 1, 0], [0, 0, 1], rnd, band);
      else tri(a, b, tip, [1, 0, 0], [0, 1, 0], [0, 0, 1], rnd, band);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  geometry.setAttribute('aEdge', new BufferAttribute(new Float32Array(edge), 3));
  geometry.setAttribute('aFace', new BufferAttribute(new Float32Array(face), 2));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A straight ribbon between two points, placed in the vertex stage: the lance
 * and every refracted beam. `segments` rows along it so the shader can bend
 * and band it; per vertex `aParam` is (t along 0..1, side −1/+1).
 */
export function createSegmentRibbonGeometry(segments = 24) {
  const S = Math.max(1, segments);
  const vertices = (S + 1) * 2;
  const position = new Float32Array(vertices * 3);
  const param = new Float32Array(vertices * 2);
  for (let i = 0; i <= S; i++) {
    for (let side = 0; side < 2; side++) {
      const v = i * 2 + side;
      param[v * 2] = i / S;
      param[v * 2 + 1] = side === 0 ? -1 : 1;
    }
  }
  const index = new Uint16Array(S * 6);
  let k = 0;
  for (let i = 0; i < S; i++) {
    const v = i * 2;
    index[k++] = v;
    index[k++] = v + 1;
    index[k++] = v + 2;
    index[k++] = v + 1;
    index[k++] = v + 3;
    index[k++] = v + 2;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('aParam', new BufferAttribute(param, 2));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
  return geometry;
}

/** Flat quad on the floor (XZ), −1..1, for the impact sigils. */
export function createRefractorFloorGeometry() {
  return new PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2);
}

/** Upright unit quad (XY), −1..1, for the billboarded warps. */
export function createRefractorQuadGeometry() {
  return new PlaneGeometry(2, 2, 1, 1);
}
