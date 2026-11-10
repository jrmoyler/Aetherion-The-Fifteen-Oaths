import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  PlaneGeometry,
  Shape,
  Vector2,
} from 'three';

/**
 * Signal Jack — procedural geometry. Everything is built once per pool member
 * in unit or metre space; the ability scales it from settings each frame.
 *
 *  - `createSpikeGeometry` — the hero: a machined jack spike. A custom lathe
 *    whose radius is a function of height *and* angle, so the drill section
 *    carries a real helical thread (a plain LatheGeometry cannot), over a
 *    flanged collar, a leg hub with a groove, a ribbed column and a mast
 *    socket. Floor at y = 0; the drill is buried below it once planted.
 *  - `createClawGeometry` — one claw leg: an extruded hooked outline with a
 *    bevel, hinge at the origin, tip at (1, −0.42) so the hinge height that
 *    plants the tip is derived (0.42 × reach).
 *  - `createDishGeometry` — a parabolic jammer dish with a rolled lip, closed
 *    shell (front and back) so it shades from both sides.
 *  - `createPlugGeometry` — the jack connector at a cable's end.
 *  - `createCableGeometry` — a tube *topology* (rings × sides) whose positions
 *    and normals the ability rewrites every frame along the cable curve.
 */

const TAU = Math.PI * 2;

/** Spike profile: [y, radius, thread weight]. Units are metres at spikeHeight 2.3. */
const SPIKE_PROFILE = [
  [-1.05, 0.0, 0],
  [-0.95, 0.035, 0.3],
  [-0.7, 0.09, 1],
  [-0.4, 0.14, 1],
  [-0.18, 0.165, 0.6],
  [-0.12, 0.17, 0],
  [-0.07, 0.38, 0],
  [0.04, 0.4, 0],
  [0.08, 0.3, 0],
  [0.12, 0.26, 0],
  [0.3, 0.26, 0],
  [0.32, 0.235, 0],
  [0.36, 0.235, 0],
  [0.38, 0.26, 0],
  [0.62, 0.26, 0],
  [0.7, 0.17, 0],
  [0.8, 0.15, 0],
  [1.1, 0.15, 0],
  [1.12, 0.18, 0],
  [1.18, 0.18, 0],
  [1.2, 0.15, 0],
  [1.55, 0.14, 0],
  [1.57, 0.17, 0],
  [1.63, 0.17, 0],
  [1.65, 0.14, 0],
  [2.12, 0.13, 0],
  [2.16, 0.22, 0],
  [2.26, 0.22, 0],
  [2.3, 0.12, 0],
  [2.3, 0.0, 0],
];

function sampleProfile(y) {
  for (let i = 1; i < SPIKE_PROFILE.length; i++) {
    const a = SPIKE_PROFILE[i - 1],
      b = SPIKE_PROFILE[i];
    if (y <= b[0] || i === SPIKE_PROFILE.length - 1) {
      const t = b[0] - a[0] > 1e-6 ? Math.min(1, Math.max(0, (y - a[0]) / (b[0] - a[0]))) : 1;
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return [0, 0];
}

/**
 * The jack spike: rings at every profile knot plus a dense run down the drill
 * so the helix resolves. r(y, a) = profile(y) + thread · amp · ridge(a − 2πy/pitch).
 */
export function createSpikeGeometry({ sides = 28, pitch = 0.16, threadAmp = 0.035 } = {}) {
  const ys = [];
  for (const k of SPIKE_PROFILE) ys.push(k[0]);
  for (let y = -0.95; y < -0.14; y += 0.018) ys.push(y);
  ys.sort((a, b) => a - b);
  const rows = [];
  for (const y of ys) if (!rows.length || Math.abs(y - rows[rows.length - 1]) > 1e-4 || y === 2.3) rows.push(y);
  // Keep the two y = 2.3 knots (cap): the ring at r .12 and the pole at r 0.
  const ringCount = rows.length;
  const verts = ringCount * (sides + 1);
  const pos = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);
  let capSeen = 0;
  for (let j = 0; j < ringCount; j++) {
    const y = rows[j];
    let [r, thread] = sampleProfile(y);
    if (y >= 2.3) r = capSeen++ === 0 ? 0.12 : 0;
    if (y <= -1.05) r = 0;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * TAU;
      const phase = a - (TAU * y) / pitch;
      const ridge = Math.max(0, Math.sin(phase)) ** 0.6;
      const rr = r + thread * threadAmp * ridge;
      const k = j * (sides + 1) + i;
      pos[k * 3] = Math.cos(a) * rr;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = Math.sin(a) * rr;
      uv[k * 2] = i / sides;
      uv[k * 2 + 1] = (y + 1.05) / 3.35;
    }
  }
  const index = [];
  for (let j = 0; j < ringCount - 1; j++)
    for (let i = 0; i < sides; i++) {
      const a = j * (sides + 1) + i,
        b = a + sides + 1;
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** One claw: hooked dog-leg outline, extruded and bevelled. Hinge at origin. */
export function createClawGeometry() {
  const s = new Shape();
  s.moveTo(0, 0.11);
  s.lineTo(0.32, 0.24);
  s.lineTo(0.62, 0.22);
  s.lineTo(0.84, 0.04);
  s.lineTo(0.97, -0.3);
  s.lineTo(1.0, -0.42);
  s.lineTo(0.93, -0.36);
  s.lineTo(0.79, -0.07);
  s.lineTo(0.6, 0.07);
  s.lineTo(0.34, 0.07);
  s.lineTo(0.0, -0.09);
  s.lineTo(0, 0.11);
  // A lightening slot through the upper limb: reads as a machined part.
  const hole = new Shape();
  hole.moveTo(0.22, 0.12);
  hole.lineTo(0.5, 0.17);
  hole.lineTo(0.6, 0.13);
  hole.lineTo(0.36, 0.11);
  hole.lineTo(0.22, 0.12);
  s.holes.push(hole);
  const g = new ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.014, bevelSegments: 1, steps: 1 });
  g.translate(0, 0, -0.04);
  g.computeVertexNormals();
  return g;
}

/** Parabolic dish, unit radius, opening +y, closed shell with a rolled lip. */
export function createDishGeometry() {
  const pts = [];
  const front = [];
  for (let i = 0; i <= 10; i++) {
    const r = 0.08 + (i / 10) * 0.92;
    front.push(new Vector2(r, 0.26 * r * r));
  }
  pts.push(new Vector2(0.0, -0.06));
  pts.push(new Vector2(0.08, -0.06));
  for (let i = 0; i <= 10; i++) {
    const r = 0.08 + (i / 10) * 0.95;
    pts.push(new Vector2(r, 0.26 * r * r - 0.06));
  }
  pts.push(new Vector2(1.06, 0.28));
  pts.push(new Vector2(1.04, 0.31));
  for (let i = front.length - 1; i >= 0; i--) pts.push(front[i]);
  pts.push(new Vector2(0.0, 0.0017));
  // LatheGeometry sweeps x as the radius: the bowl is traced back face then front.
  const g = new LatheGeometry(pts, 32);
  g.computeVertexNormals();
  return g;
}

/** Jack connector, along +y, base at 0 (seats on the cable's end). */
export function createPlugGeometry() {
  const pts = [
    [0, 0],
    [0.085, 0],
    [0.085, 0.07],
    [0.11, 0.08],
    [0.11, 0.13],
    [0.06, 0.15],
    [0.06, 0.26],
    [0.035, 0.28],
    [0.035, 0.36],
    [0, 0.37],
  ].map(([x, y]) => new Vector2(x, y));
  const g = new LatheGeometry(pts, 14);
  g.computeVertexNormals();
  return g;
}

/**
 * Tube topology for a cable. `aT` (uv.x) runs 0 at the head to 1 at the tip;
 * the ability rewrites `position` and `normal` every frame.
 */
export function createCableGeometry(rings = 40, sides = 8) {
  const verts = (rings + 1) * (sides + 1);
  const g = new BufferGeometry();
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);
  for (let j = 0; j <= rings; j++)
    for (let i = 0; i <= sides; i++) {
      const k = j * (sides + 1) + i;
      uv[k * 2] = j / rings;
      uv[k * 2 + 1] = i / sides;
      nor[k * 3 + 1] = 1;
    }
  const index = [];
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < sides; i++) {
      const a = j * (sides + 1) + i,
        b = a + sides + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(index);
  g.userData.rings = rings;
  g.userData.sides = sides;
  return g;
}

/** Carriers reshaped by their shaders. */
export const createQuad = () => new PlaneGeometry(1, 1, 1, 1);
export const createSleeve = (sides = 24) => new CylinderGeometry(1, 1, 1, sides, 1, true);
export const createMastGeometry = (r0, r1) => new CylinderGeometry(r1, r0, 1, 16, 1, false).translate(0, 0.5, 0);
