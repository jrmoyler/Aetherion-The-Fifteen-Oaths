import { BufferAttribute, BufferGeometry } from 'three';

/**
 * KineticHalo — the cast's own signature geometry, kept out of the generated
 * `KineticHaloGeometry.js` (which is pinned byte for byte by tests/pure-rigs.test.mjs).
 */

/* ------------------------------------------------------------------ */
/* The signature: the flywheel                                         */
/* ------------------------------------------------------------------ */

/**
 * The cross-section of the flywheel rim, unit half-width (radial) and unit
 * half-height, walked anticlockwise from the inner bottom edge. Every edge is
 * its own flat face, so the steel reads as machined.
 *   face ids: 0 bottom · 1 outer chamfer low · 2 outer face · 3 outer chamfer high
 *             4 top · 5 inner chamfer high · 6 inner face · 7 inner chamfer low
 */
const WHEEL_SECTION = [[-0.7, -1], [0.7, -1], [1, -0.5], [1, 0.5], [0.7, 1], [-0.7, 1], [-1, 0.5], [-1, -0.5]];

/** A ratchet tooth: a slow ramp up, a sheer drop. 0..1 over one tooth. */
function ratchet(t) {
  const f = t - Math.floor(t);
  return f < 0.82 ? f / 0.82 : (1 - f) / 0.18;
}

/**
 * The flywheel: a heavy machined rim with ratchet teeth on its outer face,
 * swept round the Y axis. Its topology is fixed; `writeKineticHaloWheel`
 * rewrites positions and normals for a radius, rim size and tooth depth in
 * metres, so the rim keeps its absolute thickness while the wheel grows from
 * the thrown size to the circle.
 *
 * Attributes: `aWheel` = (angle 0..1 round the rim, face id, tooth 0..1).
 *
 * @param {number} [stations] steps round the rim
 * @param {number} [teeth]
 */
export function createKineticHaloWheelGeometry(stations = 192, teeth = 16) {
  const faces = WHEEL_SECTION.length;
  const count = (stations + 1) * faces * 2;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(count * 3), 3));
  const wheel = new Float32Array(count * 3);
  const indices = [];
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const tooth = ratchet(t * teeth);
    for (let f = 0; f < faces; f++) {
      for (let e = 0; e < 2; e++) {
        const v = (i * faces + f) * 2 + e;
        wheel[v * 3] = t;
        wheel[v * 3 + 1] = f;
        wheel[v * 3 + 2] = tooth;
      }
    }
  }
  for (let i = 0; i < stations; i++) {
    for (let f = 0; f < faces; f++) {
      const a = (i * faces + f) * 2;
      const b = a + 1;
      const c = ((i + 1) * faces + f) * 2;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  geometry.setAttribute('aWheel', new BufferAttribute(wheel, 3));
  geometry.setIndex(indices);
  geometry.userData.stations = stations;
  geometry.userData.teeth = teeth;
  writeKineticHaloWheel(geometry, 1, 0.3, 0.2, 0.12);
  return geometry;
}

/**
 * Lay the flywheel out at a size, in place (no allocation).
 *
 * @param {BufferGeometry} geometry from createKineticHaloWheelGeometry
 * @param {number} radius  centre line of the rim, metres
 * @param {number} half    radial half-width of the rim, metres
 * @param {number} height  half-height of the rim, metres
 * @param {number} toothDepth how far a tooth stands proud of the outer face, metres
 */
export function writeKineticHaloWheel(geometry, radius, half, height, toothDepth) {
  const pos = geometry.attributes.position.array;
  const nor = geometry.attributes.normal.array;
  const wheel = geometry.attributes.aWheel.array;
  const faces = WHEEL_SECTION.length;
  const stations = geometry.userData.stations;
  for (let i = 0; i <= stations; i++) {
    const ang = (i / stations) * Math.PI * 2;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    for (let f = 0; f < faces; f++) {
      const p0 = WHEEL_SECTION[f];
      const p1 = WHEEL_SECTION[(f + 1) % faces];
      // Edge normal in section space (outward for an anticlockwise walk), scaled into metres.
      let nx = (p1[1] - p0[1]) / height;
      let ny = -(p1[0] - p0[0]) / half;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      for (let e = 0; e < 2; e++) {
        const p = e === 0 ? p0 : p1;
        const v = (i * faces + f) * 2 + e;
        const tooth = wheel[v * 3 + 2];
        // Teeth stand off the outer face and its chamfers, most at mid-height.
        const outer = p[0] > 0.6 ? toothDepth * tooth * (1 - 0.35 * Math.abs(p[1])) : 0;
        const r = radius + p[0] * half + outer;
        pos[v * 3] = ca * r;
        pos[v * 3 + 1] = p[1] * height;
        pos[v * 3 + 2] = sa * r;
        nor[v * 3] = ca * nx;
        nor[v * 3 + 1] = ny;
        nor[v * 3 + 2] = sa * nx;
      }
    }
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.normal.needsUpdate = true;
}
