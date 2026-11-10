import { BufferGeometry, Float32BufferAttribute, LatheGeometry, PlaneGeometry, Vector2 } from 'three';

/**
 * Refraction Tribunal — procedural geometry. Built once per pool member, at
 * construction; nothing here runs per frame.
 *
 *  - **the judge** — the hero form. A quartz slab-cluster, one per vertex of
 *    the court: a tall lancet column whose cross-section is an irregular,
 *    flattened hexagon lofted through six jittered rings (so the facets break
 *    and fold the way grown crystal does, rather than running as clean
 *    extrusion panels), terminated by an off-centre chisel point, with two
 *    smaller daughter crystals budding from its foot. Unit height, pivot on
 *    the floor at the column's foot, broad face along local X. Flat normals:
 *    every facet catches the sun on its own.
 *  - **the witness** — the bolt: a long hexagonal bipyramid (a cut gem
 *    pointed along +Z), its girdle slightly twisted.
 *  - **the beam** — a unit ribbon of `BEAM_SEGMENTS` rows along +Z with
 *    `uv.x` ∈ {-1, 1} across; the beam shader turns it to face the camera.
 *  - **the column** — the verdict's lathe: a spindle that swells at the
 *    floor and pinches under the apex, unit height.
 *  - **the quad** — a 1×1 carrier for the floor seal and the lens.
 */

/** Rows along a beam ribbon (the flow noise needs some to bend through). */
export const BEAM_SEGMENTS = 24;

/** Deterministic hash for authoring jitter (no Math.random: every pool member is identical). */
const h1 = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Append the triangles of a loft between rings of an n-gon to `out`.
 * `rings` = [{ y, sx, sz, ox, oz, twist }], cross-section `shape` = [[x, z] …].
 */
function loft(out, shape, rings, seed) {
  const n = shape.length;
  const at = (ring, i, ri) => {
    const a = ring.twist;
    const ca = Math.cos(a), sa = Math.sin(a);
    // Per-vertex jitter so neighbouring facets are never coplanar.
    const j = 1 + (h1(seed * 13.1 + ri * 7.7 + i * 3.3) - 0.5) * ring.jitter;
    const x = shape[i][0] * ring.sx * j;
    const z = shape[i][1] * ring.sz * j;
    return [x * ca - z * sa + ring.ox, ring.y, x * sa + z * ca + ring.oz];
  };
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      const a = at(rings[r], i, r), b = at(rings[r], i2, r);
      const c = at(rings[r + 1], i2, r + 1), d = at(rings[r + 1], i, r + 1);
      out.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
  return rings.length - 1;
}

/** A pointed termination from the last ring up to an apex. */
function cap(out, shape, ring, apex, seed, ri) {
  const n = shape.length;
  const ca = Math.cos(ring.twist), sa = Math.sin(ring.twist);
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    const p = (k) => {
      const j = 1 + (h1(seed * 13.1 + ri * 7.7 + k * 3.3) - 0.5) * ring.jitter;
      const x = shape[k][0] * ring.sx * j, z = shape[k][1] * ring.sz * j;
      return [x * ca - z * sa + ring.ox, ring.y, x * sa + z * ca + ring.oz];
    };
    out.push(...p(i), ...p(i2), ...apex);
  }
}

/** Transform a run of flat xyz triples in place: tilt about Z then X, then offset. */
function place(arr, from, tiltZ, tiltX, ox, oy, oz, scale) {
  const cz = Math.cos(tiltZ), sz = Math.sin(tiltZ);
  const cx = Math.cos(tiltX), sx = Math.sin(tiltX);
  for (let i = from; i < arr.length; i += 3) {
    let x = arr[i] * scale, y = arr[i + 1] * scale, z = arr[i + 2] * scale;
    const x1 = x * cz - y * sz, y1 = x * sz + y * cz;
    x = x1; y = y1;
    const y2 = y * cx - z * sx, z2 = y * sx + z * cx;
    arr[i] = x + ox; arr[i + 1] = y2 + oy; arr[i + 2] = z2 + oz;
  }
}

/** One crystal (column + chisel termination) appended to `out`. */
function crystal(out, seed, { height, body, width, depth, taper, chisel, lean }) {
  // Irregular flattened hexagon: broad faces along X, narrow along Z.
  const shape = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.18 * (h1(seed + i) - 0.5);
    const rr = 1 + 0.14 * (h1(seed * 3 + i) - 0.5);
    shape.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const ys = [0, 0.16, 0.38, 0.55, 0.7, body];
  const rings = ys.map((y, r) => {
    const t = y / body;
    const s = 1 - taper * t;
    // A girdle step at 0.38: the column narrows abruptly like a growth zone.
    const step = r >= 2 ? 0.93 : 1;
    return {
      y: y * height,
      sx: width * s * step,
      sz: depth * s * step,
      ox: lean * y * height,
      oz: 0,
      twist: 0.12 * t + 0.05 * (h1(seed * 9 + r) - 0.5),
      jitter: r === 0 ? 0.04 : 0.12,
    };
  });
  const from = out.length;
  loft(out, shape, rings, seed);
  const top = rings[rings.length - 1];
  // Off-centre chisel point: the apex leans toward one broad face.
  cap(out, shape, top, [top.ox + width * chisel, height, depth * 0.18], seed, rings.length - 1);
  return from;
}

/**
 * The judge. Unit height (the main column's apex is at y = 1), foot at the
 * origin, broad face along local X, flat-shaded triangles.
 * A `aHeight` attribute (0..1 up the main column) feeds the facet shader.
 */
export function createJudgeGeometry() {
  const p = [];
  // The main lancet.
  crystal(p, 1.7, { height: 1, body: 0.8, width: 0.5, depth: 0.27, taper: 0.22, chisel: 0.22, lean: 0 });
  // Two daughters budding from the foot, leaning away.
  let from = p.length;
  crystal(p, 4.1, { height: 1, body: 0.74, width: 0.28, depth: 0.2, taper: 0.3, chisel: -0.18, lean: 0 });
  place(p, from, -0.42, 0.18, 0.34, -0.04, 0.08, 0.46);
  from = p.length;
  crystal(p, 7.3, { height: 1, body: 0.7, width: 0.24, depth: 0.18, taper: 0.3, chisel: 0.15, lean: 0 });
  place(p, from, 0.5, -0.22, -0.3, -0.04, -0.06, 0.34);
  // A low splinter on the outer face, so the foot is never a clean pole.
  from = p.length;
  crystal(p, 9.9, { height: 1, body: 0.66, width: 0.2, depth: 0.15, taper: 0.35, chisel: 0.1, lean: 0 });
  place(p, from, 0.15, 0.62, 0.05, -0.05, 0.22, 0.24);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(p, 3));
  const heights = new Float32Array(p.length / 3);
  for (let i = 0; i < heights.length; i++) heights[i] = Math.max(0, Math.min(1, p[i * 3 + 1]));
  geometry.setAttribute('aHeight', new Float32BufferAttribute(heights, 1));
  // Facet coordinates for the shader's grain (planar, cheap, stable).
  const uv = new Float32Array((p.length / 3) * 2);
  for (let i = 0; i < p.length / 3; i++) {
    uv[i * 2] = p[i * 3] + p[i * 3 + 2] * 0.7;
    uv[i * 2 + 1] = p[i * 3 + 1];
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals(); // non-indexed ⇒ flat facet normals
  geometry.computeBoundingSphere();
  return geometry;
}

/** The witness bolt: a hexagonal bipyramid along +Z, ~0.85 long at scale 1. */
export function createWitnessGeometry() {
  const p = [];
  const n = 6;
  const front = [0, 0, 0.55], back = [0, 0, -0.3];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const r0 = i % 2 ? 0.1 : 0.13, r1 = (i + 1) % 2 ? 0.1 : 0.13;
    const g0 = [Math.cos(a0) * r0, Math.sin(a0) * r0, 0.04 * Math.sin(a0 * 3)];
    const g1 = [Math.cos(a1) * r1, Math.sin(a1) * r1, 0.04 * Math.sin(a1 * 3)];
    p.push(...g0, ...g1, ...front, ...g1, ...g0, ...back);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(p, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Unit beam ribbon along +Z (0..1), uv.x ∈ {-1, 1} across, uv.y 0..1 along. */
export function createBeamGeometry() {
  const p = [], uv = [], index = [];
  for (let i = 0; i <= BEAM_SEGMENTS; i++) {
    const t = i / BEAM_SEGMENTS;
    p.push(0, 0, t, 0, 0, t);
    uv.push(-1, t, 1, t);
    if (i < BEAM_SEGMENTS) {
      const a = i * 2;
      index.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(p, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return geometry;
}

/** The verdict column: a spindle lathe, unit height, unit max radius. */
export function createColumnGeometry() {
  const profile = [];
  const rows = 28;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    // Swells at the floor (where it lands), pinches under the apex.
    const r = 0.18 + 0.82 * Math.pow(1 - t, 2.2) + 0.08 * Math.sin(t * Math.PI * 3) * (1 - t);
    profile.push(new Vector2(Math.max(0.04, r), t));
  }
  return new LatheGeometry(profile, 32);
}

/** 1×1 carrier quad (rotated flat by the owner). */
export function createQuad() {
  return new PlaneGeometry(1, 1, 1, 1);
}
