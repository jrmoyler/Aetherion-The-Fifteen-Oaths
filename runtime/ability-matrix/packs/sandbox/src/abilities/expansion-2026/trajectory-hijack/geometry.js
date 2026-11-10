import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  LatheGeometry,
  PlaneGeometry,
  Vector2,
} from 'three';

/**
 * Trajectory Hijack — procedural geometry. Nothing here is a stock primitive
 * used as itself.
 *
 *  - **the stator vane** — a cambered NACA-style airfoil section lofted from
 *    below the floor to a rounded tip with taper, twist and a swept leading
 *    edge. Unit chord along +Z (leading edge at −0.3, trailing edge at
 *    +0.7, so it pivots near the quarter chord), unit height along +Y; the
 *    instance matrix sizes it from settings. `aChord` (0 at the leading edge,
 *    1 at the trailing edge) lets the edge shader find the edge it lights.
 *  - **the dart** — a turned steel bolt: flared fletch collar, a waisted
 *    shaft, a barbed head. Unit length, tip on +Z.
 *  - **the compass needle** — a turned double spindle along +Z with a bead
 *    at the pivot; the north tip is a separate lathe so it can glow.
 *  - **the gimbal** — a turned ring with a bead, standing on edge.
 *  - **the ribbons** — one dynamic strip per dart; every vertex is written
 *    each frame from the dart's closed-form path sampled back in time and
 *    pushed sideways to face the camera in the vertex shader.
 */

const TAU = Math.PI * 2;

/* ---------------------------------------------------------------------- */
/* Stator vane                                                             */
/* ---------------------------------------------------------------------- */

/** NACA 4-digit half thickness at chord position x (0..1), closed TE. */
function halfThickness(x, t) {
  const s = Math.sqrt(Math.max(0, x));
  return 5 * t * (0.2969 * s - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
}

/**
 * @param {object} o { thickness, camber, twist, sweep, taper, around, up, floor }
 */
export function createVaneGeometry({
  thickness = 0.16,
  camber = 0.12,
  twist = 0.55,
  sweep = 0.3,
  taper = 0.4,
  around = 36,
  up = 22,
  floor = -0.12,
} = {}) {
  const ring = around + 1; // duplicated seam at the trailing edge
  const count = ring * (up + 1);
  const position = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const chord = new Float32Array(count);
  let p = 0;
  for (let j = 0; j <= up; j++) {
    const v = j / up;
    const y = floor + (1 - floor) * v;
    // Taper, then a rounded tip: the section shrinks to a point at v = 1.
    const tip = Math.sqrt(Math.max(0, 1 - Math.pow(v, 5)));
    const scale = (1 - taper * v) * tip;
    const turn = twist * v;
    const ct = Math.cos(turn);
    const st = Math.sin(turn);
    for (let i = 0; i <= around; i++) {
      const s = i / around;
      // Cosine spacing: dense at the round leading edge (s = 0.5).
      const x = 0.5 * (1 + Math.cos(TAU * s));
      const side = s < 0.5 ? 1 : -1;
      const yc = 4 * camber * x * (1 - x);
      const off = yc + side * halfThickness(x, thickness);
      // Section in (across, along): along runs LE → TE.
      const along = (x - 0.3) * scale + sweep * v;
      const across = off * scale;
      position[p * 3] = across * ct - along * st;
      position[p * 3 + 1] = y;
      position[p * 3 + 2] = across * st + along * ct;
      uv[p * 2] = s;
      uv[p * 2 + 1] = v;
      chord[p] = x;
      p++;
    }
  }
  const index = [];
  for (let j = 0; j < up; j++) {
    for (let i = 0; i < around; i++) {
      const a = j * ring + i;
      const b = a + ring;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(position, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setAttribute('aChord', new BufferAttribute(chord, 1));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* ---------------------------------------------------------------------- */
/* Turned parts                                                            */
/* ---------------------------------------------------------------------- */

function lathe(profile, segments, toZ = true) {
  const g = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments);
  if (toZ) g.rotateX(Math.PI / 2); // lathe axis +Y → +Z
  g.computeVertexNormals();
  return g;
}

/** Dart: unit length, tail at z = 0, tip at z = 1. */
export function createDartGeometry() {
  return lathe([
    [0, 0],
    [0.055, 0.0],
    [0.075, 0.04], // fletch collar
    [0.07, 0.11],
    [0.03, 0.15],
    [0.024, 0.32], // waisted shaft
    [0.03, 0.56],
    [0.05, 0.6], // ferrule bead
    [0.036, 0.64],
    [0.085, 0.7], // barbs
    [0.06, 0.74],
    [0.048, 0.8],
    [0.02, 0.94],
    [0, 1],
  ], 14);
}

/** Compass needle body: −1..0.58 along +Z, bead at the pivot. */
export function createNeedleGeometry() {
  return lathe([
    [0, -1],
    [0.035, -0.9],
    [0.07, -0.55],
    [0.09, -0.16],
    [0.15, -0.07], // pivot bead
    [0.17, 0],
    [0.15, 0.07],
    [0.09, 0.16],
    [0.075, 0.5],
    [0.06, 0.58],
    [0, 0.58],
  ], 18);
}

/** The needle's north tip, 0.58..1, the part that glows. */
export function createNeedleTipGeometry() {
  return lathe([
    [0, 0.575],
    [0.065, 0.58],
    [0.05, 0.75],
    [0.018, 0.93],
    [0, 1],
  ], 18);
}

/** A turned gimbal ring of unit radius standing on edge (axis +Z). */
export function createGimbalGeometry() {
  return lathe([
    [0.95, -0.03],
    [1.0, -0.035],
    [1.035, -0.012],
    [1.045, 0],
    [1.035, 0.012],
    [1.0, 0.035],
    [0.95, 0.03],
    [0.94, 0],
    [0.95, -0.03],
  ], 72);
}

/** Floor carrier for the field and lens shaders (reshaped in the fragment). */
export function createQuad() {
  return new PlaneGeometry(1, 1);
}

/* ---------------------------------------------------------------------- */
/* Ribbons                                                                 */
/* ---------------------------------------------------------------------- */

/**
 * `darts` strips × `samples` pairs. `position` holds the ribbon's centre
 * line, `aTangent` its direction there, `aAlpha` per-sample visibility —
 * all three dynamic. `aSide` (±1) and `aT` (0 head → 1 tail) are fixed.
 */
export function createTrailGeometry(darts, samples) {
  const verts = darts * samples * 2;
  const g = new BufferGeometry();
  const position = new Float32BufferAttribute(new Float32Array(verts * 3), 3);
  const tangent = new Float32BufferAttribute(new Float32Array(verts * 3), 3);
  const alpha = new Float32BufferAttribute(new Float32Array(verts), 1);
  position.setUsage(DynamicDrawUsage);
  tangent.setUsage(DynamicDrawUsage);
  alpha.setUsage(DynamicDrawUsage);
  const side = new Float32Array(verts);
  const t = new Float32Array(verts);
  const dart = new Float32Array(verts);
  const index = [];
  for (let d = 0; d < darts; d++) {
    for (let k = 0; k < samples; k++) {
      const v = (d * samples + k) * 2;
      side[v] = -1;
      side[v + 1] = 1;
      t[v] = t[v + 1] = k / (samples - 1);
      dart[v] = dart[v + 1] = d;
      if (k < samples - 1) index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  g.setAttribute('position', position);
  g.setAttribute('aTangent', tangent);
  g.setAttribute('aAlpha', alpha);
  g.setAttribute('aSide', new BufferAttribute(side, 1));
  g.setAttribute('aT', new BufferAttribute(t, 1));
  g.setAttribute('aDart', new BufferAttribute(dart, 1));
  g.setIndex(index);
  return g;
}
