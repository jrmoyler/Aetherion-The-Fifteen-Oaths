import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  PlaneGeometry,
  Vector2,
} from 'three';

/**
 * Equivalence Engine — procedural geometry. A balance, built as a foundry
 * would cast one: turned iron, a lofted beam, two plumb counterweights.
 *
 *  - **the fulcrum** — a turned tower (lathe of an authored profile): a
 *    stepped plinth, a waisted shaft, a collar and a forked bearing head.
 *    Unit height, unit radius; the ability scales it to `pivotHeight` and
 *    `fulcrumWidth`.
 *  - **the bearing** — a turned ring round the pivot.
 *  - **the beam** — a lofted octagonal section along an arch: swelling at the
 *    fulcrum, waisted between, flaring into a socket at each end. Its
 *    vertices are rewritten in place when `armReach`, `beamThickness` or
 *    `beamArch` change, so the weights always sit exactly on the beam ends.
 *  - **the counterweights** — a plumb spindle: a hook knob, a collar, three
 *    raised bands and a bulb tapering to a point. The point is the part that
 *    strikes the floor (bottom extent = `WEIGHT_BOTTOM` × radius).
 *  - **the motes** — a fixed seed cloud, placed entirely in the shader.
 *
 * Everything is built once per pool member and disposed with it.
 */

const TAU = Math.PI * 2;

/** How far the spindle's point reaches below its centre, × its radius. */
export const WEIGHT_BOTTOM = 1.0;

const lathe = (profile, segments) => {
  const g = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments);
  g.computeVertexNormals();
  return g;
};

/** The fulcrum tower. y ∈ [0, 1]; radius ≤ 1. */
export function createFulcrumGeometry(segments = 48) {
  return lathe([
    [0.0, 0.0],
    [1.0, 0.0], // plinth
    [1.0, 0.05],
    [0.92, 0.07],
    [0.92, 0.1], // second step
    [0.78, 0.12],
    [0.62, 0.16],
    [0.42, 0.24], // waist sweeps up
    [0.3, 0.42],
    [0.27, 0.6],
    [0.3, 0.7],
    [0.38, 0.73], // collar
    [0.38, 0.77],
    [0.29, 0.79],
    [0.26, 0.86],
    [0.34, 0.9], // bearing cradle
    [0.36, 0.95],
    [0.3, 0.97],
    [0.0, 0.97],
  ], segments);
}

/** The bearing ring round the pivot; lies in XZ — rotate to the beam's axis. */
export function createBearingGeometry(segments = 40) {
  const profile = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * TAU;
    // A slightly squared torus section with a raised bead on the outside.
    const bead = 1 + 0.25 * Math.max(0, Math.cos(a)) ** 6;
    profile.push([1 + Math.cos(a) * 0.32 * bead, Math.sin(a) * 0.32]);
  }
  return lathe(profile, segments);
}

/** The counterweight spindle. Centre at the origin, radius ≈ 1, point at y = −WEIGHT_BOTTOM. */
export function createWeightGeometry(segments = 40) {
  return lathe([
    [0.0, -WEIGHT_BOTTOM],
    [0.08, -0.96],
    [0.3, -0.82],
    [0.6, -0.58],
    [0.84, -0.34],
    [0.97, -0.12],
    [1.0, 0.02], // the bulb
    [1.04, 0.06], // band 1
    [1.04, 0.12],
    [0.97, 0.15],
    [0.9, 0.3],
    [0.95, 0.33], // band 2
    [0.95, 0.38],
    [0.84, 0.42],
    [0.66, 0.6],
    [0.7, 0.64], // collar
    [0.7, 0.7],
    [0.42, 0.74],
    [0.3, 0.86],
    [0.34, 0.94], // hook knob
    [0.3, 1.04],
    [0.16, 1.1],
    [0.0, 1.12],
  ], segments);
}

/* ---------------------------------------------------------------------- */
/* The beam — lofted, rewritten in place when its settings change         */
/* ---------------------------------------------------------------------- */

const BEAM_STATIONS = 48;
const BEAM_SIDES = 8;

/** Section scale along the beam, x ∈ [−1, 1]: swell at the fulcrum, waist, flared sockets. */
function beamSection(x) {
  const ax = Math.abs(x);
  const swell = 1 + 0.45 * Math.exp(-ax * ax * 30);
  const waist = 1 - 0.35 * Math.sin(Math.min(1, ax / 0.9) * Math.PI) ** 2;
  const socket = 1 + 0.9 * Math.exp(-((ax - 0.97) ** 2) * 900);
  return swell * waist * socket;
}

/** Octagonal loft along X. Build once; `updateBeamGeometry` shapes it. */
export function createBeamGeometry() {
  const ring = BEAM_SIDES + 1;
  const count = (BEAM_STATIONS + 1) * ring + 2;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(count * 3), 3));
  const uv = new Float32Array(count * 2);
  for (let s = 0; s <= BEAM_STATIONS; s++) {
    for (let k = 0; k <= BEAM_SIDES; k++) {
      const i = s * ring + k;
      uv[i * 2] = s / BEAM_STATIONS;
      uv[i * 2 + 1] = k / BEAM_SIDES;
    }
  }
  uv[(count - 2) * 2] = 0;
  uv[(count - 1) * 2] = 1;
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  const index = [];
  for (let s = 0; s < BEAM_STATIONS; s++) {
    for (let k = 0; k < BEAM_SIDES; k++) {
      const a = s * ring + k, b = a + ring, c = b + 1, d = a + 1;
      index.push(a, b, d, b, c, d);
    }
  }
  const capA = count - 2, capB = count - 1, last = BEAM_STATIONS * ring;
  for (let k = 0; k < BEAM_SIDES; k++) {
    index.push(capA, k + 1, k);
    index.push(capB, last + k, last + k + 1);
  }
  g.setIndex(index);
  g.userData.key = '';
  return g;
}

/**
 * Shape the beam: half-length `half`, section `thick` at the fulcrum, bowed
 * up by `arch`. Writes in place (no allocation) and only when the key changes.
 */
export function updateBeamGeometry(g, half, thick, arch) {
  const key = `${half.toFixed(4)}|${thick.toFixed(4)}|${arch.toFixed(4)}`;
  if (g.userData.key === key) return false;
  g.userData.key = key;
  const pos = g.attributes.position.array;
  const nor = g.attributes.normal.array;
  const ring = BEAM_SIDES + 1;
  for (let s = 0; s <= BEAM_STATIONS; s++) {
    const x = (s / BEAM_STATIONS) * 2 - 1;
    const y = arch * (1 - x * x);
    // Tangent of the arch, for a section square to the curve.
    const dy = (-2 * arch * x) / Math.max(1e-4, half);
    const tl = Math.hypot(1, dy);
    const tx = 1 / tl, ty = dy / tl;
    const r = 0.5 * thick * beamSection(x);
    for (let k = 0; k <= BEAM_SIDES; k++) {
      const a = (k / BEAM_SIDES) * TAU + Math.PI / BEAM_SIDES;
      const cy = Math.cos(a), cz = Math.sin(a);
      // Normal in the plane square to the tangent: (−ty, tx, 0)·cy + (0,0,1)·cz.
      const nx = -ty * cy, ny = tx * cy, nz = cz;
      const i = (s * ring + k) * 3;
      // A slightly flattened octagon: deeper than it is wide, like a cast beam.
      pos[i] = x * half + nx * r * 1.15;
      pos[i + 1] = y + ny * r * 1.15;
      pos[i + 2] = nz * r * 0.8;
      nor[i] = nx;
      nor[i + 1] = ny;
      nor[i + 2] = nz;
    }
  }
  const n = pos.length / 3;
  // End caps.
  pos[(n - 2) * 3] = -half; pos[(n - 2) * 3 + 1] = 0; pos[(n - 2) * 3 + 2] = 0;
  pos[(n - 1) * 3] = half; pos[(n - 1) * 3 + 1] = 0; pos[(n - 1) * 3 + 2] = 0;
  nor[(n - 2) * 3] = -1; nor[(n - 2) * 3 + 1] = 0; nor[(n - 2) * 3 + 2] = 0;
  nor[(n - 1) * 3] = 1; nor[(n - 1) * 3 + 1] = 0; nor[(n - 1) * 3 + 2] = 0;
  g.attributes.position.needsUpdate = true;
  g.attributes.normal.needsUpdate = true;
  g.computeBoundingSphere();
  return true;
}

/** Unit quad for floor-field, lens and shock carriers (the shaders shape them). */
export function createQuad() {
  return new PlaneGeometry(1, 1, 1, 1);
}

/** A fixed seed cloud for the mass grains: (angle, band, phase, index). */
export function createMoteGeometry(count) {
  const g = new BufferGeometry();
  const seed = new Float32Array(count * 4);
  const pos = new Float32Array(count * 3);
  let h = 0x9e3779b9;
  const rand = () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
  for (let i = 0; i < count; i++) {
    seed[i * 4] = rand();
    seed[i * 4 + 1] = rand();
    seed[i * 4 + 2] = rand();
    // The grain's share of the mass: grains with share < mA belong to A.
    seed[i * 4 + 3] = (i + 0.5) / count;
  }
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new Float32BufferAttribute(seed, 4));
  return g;
}
