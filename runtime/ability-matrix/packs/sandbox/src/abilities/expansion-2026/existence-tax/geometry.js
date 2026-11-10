import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Path,
  PlaneGeometry,
  Shape,
} from 'three';

/**
 * Existence Tax — procedural geometry.
 *
 *  - **the well** (`createWellGeometry` + `writeWell`) — the hero. A lathe
 *    whose *profile* is rewritten in place every frame from settings: a flared
 *    outer wall rising from the floor, a rolled lip, and an inner wall that is
 *    a true gravity well (`y ∝ 1/r`, normalised between throat and lip, then
 *    bent by `wellCurve`) falling into a throat that drops through the floor.
 *    Rings are spaced in log-radius on the inner wall, so the vertices bunch
 *    where the curvature is — near the throat — instead of being wasted on the
 *    nearly flat rim. Normals are analytic (profile tangent turned a quarter
 *    turn), never `computeVertexNormals`, so a rewrite allocates nothing.
 *  - **the tithe coin** (`createCoinGeometry`) — a cash coin: a thick disc with
 *    a raised rim and a square hole, extruded and bevelled, 1 m across so the
 *    instance scale is the diameter. Its face normal is +Z.
 *  - **the ledger fin** (`createFinGeometry`) — an extruded, notched blade that
 *    stands out radially from the outer wall; unit height (y) and unit reach (x).
 *  - **the vortex carrier** — an open cylinder, y 0..1, reshaped entirely in
 *    the vortex vertex shader.
 */

/** Profile rings, by region. Fixed: the attribute layout depends on it. */
const OUTER = 16;
const LIP = 12;
const INNER = 30;
const THROAT = 8;
export const WELL_RINGS = OUTER + LIP + INNER + THROAT;
/** Radial segments of the lathe. */
export const WELL_SEGMENTS = 112;

/* Profile scratch — module level, reused by every rewrite. */
const _pr = new Float32Array(WELL_RINGS);
const _py = new Float32Array(WELL_RINGS);
const _cos = new Float32Array(WELL_SEGMENTS + 1);
const _sin = new Float32Array(WELL_SEGMENTS + 1);
for (let j = 0; j <= WELL_SEGMENTS; j++) {
  const a = (j / WELL_SEGMENTS) * Math.PI * 2;
  _cos[j] = Math.cos(a);
  _sin[j] = Math.sin(a);
}

/**
 * The resolved shape of the well, in metres. The ability fills one of these
 * from settings every frame; `writeWell` and `wellHeightAt` read it.
 * @typedef {{ rim:number, foot:number, height:number, lip:number,
 *             throat:number, throatY:number, curve:number }} WellShape
 */

/** Height of the inner wall at radius `r` (clamped to the throat..lip span). */
export function wellHeightAt(r, s) {
  const inner = Math.max(s.throat + 1e-3, s.rim - s.lip);
  const rr = Math.min(inner, Math.max(s.throat, r));
  const top = s.height - s.lip;
  const span = 1 / s.throat - 1 / inner;
  const w = span > 1e-6 ? (1 / s.throat - 1 / rr) / span : 1;
  return s.throatY + (top - s.throatY) * Math.pow(Math.max(0, w), s.curve);
}

/** Slope dy/dr of the inner wall at `r` (finite difference, for coin lean). */
export function wellSlopeAt(r, s) {
  const h = 0.02;
  return (wellHeightAt(r + h, s) - wellHeightAt(r - h, s)) / (2 * h);
}

function fillProfile(s) {
  const top = s.height - s.lip;
  const outerR = s.rim + s.lip;
  let k = 0;
  // Outer wall: a bell flaring from the foot to the outside of the lip.
  for (let i = 0; i < OUTER; i++, k++) {
    const q = i / (OUTER - 1);
    _pr[k] = s.foot + (outerR - s.foot) * (1 - (1 - q) * (1 - q));
    _py[k] = -0.06 + (top + 0.06) * Math.pow(q, 1.4);
  }
  // The rolled lip, over the top from outside to inside.
  for (let i = 0; i < LIP; i++, k++) {
    const a = ((i + 1) / (LIP + 1)) * Math.PI;
    _pr[k] = s.rim + s.lip * Math.cos(a);
    _py[k] = top + s.lip * 1.15 * Math.sin(a);
  }
  // The gravity well, log-spaced in radius.
  const inner = Math.max(s.throat + 1e-3, s.rim - s.lip);
  for (let i = 0; i < INNER; i++, k++) {
    const q = i / (INNER - 1);
    const r = inner * Math.pow(s.throat / inner, q);
    _pr[k] = r;
    _py[k] = wellHeightAt(r, s);
  }
  // The throat, dropping through the floor.
  for (let i = 0; i < THROAT; i++, k++) {
    const q = (i + 1) / THROAT;
    _pr[k] = s.throat * (1 - 0.12 * q);
    _py[k] = s.throatY - 0.9 * q;
  }
}

/** Lathe buffers with a per-vertex `aWell` = (region, q in region, angle01). */
export function createWellGeometry() {
  const geometry = new BufferGeometry();
  const verts = WELL_RINGS * (WELL_SEGMENTS + 1);
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(verts * 3), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(verts * 3), 3));
  const well = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);
  const bounds = [OUTER, LIP, INNER, THROAT];
  let ring = 0;
  for (let region = 0; region < 4; region++) {
    for (let i = 0; i < bounds[region]; i++, ring++) {
      const q = bounds[region] > 1 ? i / (bounds[region] - 1) : 0;
      for (let j = 0; j <= WELL_SEGMENTS; j++) {
        const v = ring * (WELL_SEGMENTS + 1) + j;
        well[v * 3] = region;
        well[v * 3 + 1] = q;
        well[v * 3 + 2] = j / WELL_SEGMENTS;
        uv[v * 2] = j / WELL_SEGMENTS;
        uv[v * 2 + 1] = ring / (WELL_RINGS - 1);
      }
    }
  }
  geometry.setAttribute('aWell', new BufferAttribute(well, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  const index = [];
  for (let i = 0; i < WELL_RINGS - 1; i++) {
    for (let j = 0; j < WELL_SEGMENTS; j++) {
      const a = i * (WELL_SEGMENTS + 1) + j;
      const b = a + WELL_SEGMENTS + 1;
      // Wound so the front face looks along the analytic normal.
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  geometry.setIndex(index);
  writeWell(geometry, { rim: 3, foot: 2.4, height: 1.3, lip: 0.15, throat: 0.4, throatY: 0.1, curve: 1 });
  return geometry;
}

/**
 * Rewrite the lathe in place from a resolved shape. No allocation: the
 * profile goes into module scratch, positions and analytic normals straight
 * into the existing buffers.
 * @param {BufferGeometry} geometry from `createWellGeometry`
 * @param {WellShape} s
 */
export function writeWell(geometry, s) {
  fillProfile(s);
  const pos = geometry.attributes.position.array;
  const nor = geometry.attributes.normal.array;
  for (let i = 0; i < WELL_RINGS; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(WELL_RINGS - 1, i + 1);
    let dr = _pr[b] - _pr[a];
    let dy = _py[b] - _py[a];
    const len = Math.hypot(dr, dy) || 1;
    dr /= len;
    dy /= len;
    // The profile tangent turned a quarter turn: out-and-down on the outer
    // wall, up over the lip, up-and-in on the well.
    const nr = dy;
    const ny = -dr;
    for (let j = 0; j <= WELL_SEGMENTS; j++) {
      const v = (i * (WELL_SEGMENTS + 1) + j) * 3;
      pos[v] = _pr[i] * _cos[j];
      pos[v + 1] = _py[i];
      pos[v + 2] = _pr[i] * _sin[j];
      nor[v] = nr * _cos[j];
      nor[v + 1] = ny;
      nor[v + 2] = nr * _sin[j];
    }
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.normal.needsUpdate = true;
  // Generous fixed bounds: the well never leaves a 12 m box round its centre.
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  geometry.boundingSphere.center.set(0, 0, 0);
  geometry.boundingSphere.radius = 12;
}

/** A square-holed cash coin, 1 m across, face normal +Z, centred. */
export function createCoinGeometry() {
  const shape = new Shape();
  shape.absarc(0, 0, 0.5, 0, Math.PI * 2, false);
  const hole = new Path();
  const h = 0.13;
  hole.moveTo(-h, -h);
  hole.lineTo(-h, h);
  hole.lineTo(h, h);
  hole.lineTo(h, -h);
  hole.lineTo(-h, -h);
  shape.holes.push(hole);
  const depth = 0.07;
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    curveSegments: 40,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 3,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A ledger fin: a tall blade that leans out from the wall, its outer edge cut
 * with three tally notches. Unit height (y 0..1), unit reach (x 0..1), thin z.
 */
export function createFinGeometry() {
  const s = new Shape();
  s.moveTo(0, 0);
  s.lineTo(0.55, 0.0);
  s.quadraticCurveTo(1.0, 0.22, 0.86, 0.46);
  // Three tally notches down the outer edge.
  s.lineTo(0.7, 0.5);
  s.lineTo(0.8, 0.58);
  s.lineTo(0.62, 0.64);
  s.lineTo(0.7, 0.72);
  s.lineTo(0.5, 0.78);
  s.quadraticCurveTo(0.3, 0.95, 0.06, 1.0);
  s.lineTo(0, 0.9);
  s.lineTo(0, 0);
  const geometry = new ExtrudeGeometry(s, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.018,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geometry.translate(0, 0, -0.03);
  geometry.computeVertexNormals();
  return geometry;
}

/** Open cylinder carrier for the vortex, y 0..1 (reshaped in its shader). */
export function createVortexGeometry() {
  const geometry = new CylinderGeometry(1, 1, 1, 64, 36, true);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

/** Unit quad in XY (laid flat by its mesh). */
export function createQuad() {
  return new PlaneGeometry(1, 1);
}
