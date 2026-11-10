import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  LatheGeometry,
  PlaneGeometry,
  Vector2,
  Vector3,
} from 'three';

/**
 * Photon Doppel — procedural geometry.
 *
 *  - **the figure** — a hooded, robed figure one unit tall, lofted ring by
 *    ring from an authored (height, half-width, half-depth) profile so it has
 *    shoulders, a waist, a hood and a flared hem with drapery folds baked in,
 *    plus two arms swept as tapered tubes along curves into an open,
 *    palms-out pose. Arms carry `aSide`/`aArm` so the vertex shader can lift
 *    them round the shoulder as the decoy fills with light.
 *  - **the streamers** — ribbons of light spiralling in from the lure ring to
 *    the figure's heart. Only the centre line is built; the shader gives the
 *    ribbon its height in metres, so the spiral can be scaled to the lure
 *    radius without the ribbons thickening.
 *  - **the tethers** — `count` strips whose ends are uniforms: each is bent
 *    into an arc from an exposed enemy to the heart in the vertex shader.
 *  - **the shards** — irregular six-sided crystal spindles with flat facets.
 *  - **the packet** — a turned spindle, the photon in flight.
 *
 * Everything is built once per pool member and disposed with it.
 */

const TAU = Math.PI * 2;

/** Deterministic hash so every pool member builds the same mesh. */
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/* ---------------------------------------------------------------------- */
/* The figure                                                              */
/* ---------------------------------------------------------------------- */

/**
 * Body profile, hem to hood tip: [height, half-width, half-depth].
 * A robe flaring to the floor, a cinched waist, square shoulders and a
 * pointed hood — readable as a person at eight metres, and nothing else.
 */
const BODY = [
  [0.0, 0.3, 0.25],
  [0.035, 0.295, 0.245],
  [0.12, 0.26, 0.215],
  [0.24, 0.215, 0.175],
  [0.36, 0.17, 0.135],
  [0.46, 0.138, 0.108],
  [0.54, 0.15, 0.106],
  [0.62, 0.168, 0.112],
  [0.685, 0.19, 0.108],
  [0.725, 0.178, 0.1],
  [0.76, 0.11, 0.082],
  [0.79, 0.07, 0.07],
  [0.82, 0.082, 0.088],
  [0.865, 0.094, 0.1],
  [0.91, 0.092, 0.098],
  [0.95, 0.072, 0.078],
  [0.98, 0.04, 0.046],
  [1.0, 0.004, 0.004],
];

/** Shoulder pivot the arms are lifted round (the shader mirrors it by `aSide`). */
export const SHOULDER = new Vector3(0.165, 0.7, 0);
/** The heart: where every streamer, tether and band of light converges. */
export const HEART_Y = 0.62;

/** Push one vertex into the shared arrays. */
function put(a, x, y, z, nx, ny, nz, u, v, part, side, arm) {
  a.pos.push(x, y, z);
  a.nrm.push(nx, ny, nz);
  a.uv.push(u, v);
  a.part.push(part);
  a.side.push(side);
  a.arm.push(arm);
}

/** Lofted body: rings of an ellipse with drapery folds near the hem. */
function loftBody(a, segments) {
  const base = a.pos.length / 3;
  const rows = BODY.length;
  for (let j = 0; j < rows; j++) {
    const [y, rx, rz] = BODY[j];
    // Folds fall from the waist and deepen toward the hem.
    const foldAmp = 0.075 * (1 - Math.min(1, y / 0.5));
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * TAU;
      const fold = 1 + foldAmp * Math.sin(t * 7 + y * 9) + foldAmp * 0.4 * Math.sin(t * 13 - y * 5);
      const x = Math.cos(t) * rx * fold;
      const z = Math.sin(t) * rz * fold;
      // Ellipse normal (refined by computeVertexNormals later).
      put(a, x, y, z, Math.cos(t) / Math.max(rx, 1e-3), 0, Math.sin(t) / Math.max(rz, 1e-3), i / segments, y, 0, 0, 0);
    }
  }
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < segments; i++) {
      const p = base + j * (segments + 1) + i;
      const q = p + segments + 1;
      a.idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
  }
  // Close the hem with a fan so the robe has a floor.
  const centre = a.pos.length / 3;
  put(a, 0, 0, 0, 0, -1, 0, 0.5, 0, 0, 0, 0);
  for (let i = 0; i < segments; i++) a.idx.push(centre, base + i + 1, base + i);
}

/** One arm: a tapered tube swept along an authored curve, mirrored by `side`. */
function sweepArm(a, side, radial, steps) {
  const pts = [
    [0.15, 0.705, 0.0],
    [0.24, 0.66, 0.02],
    [0.33, 0.615, 0.06],
    [0.41, 0.625, 0.1],
    [0.47, 0.665, 0.13],
    [0.505, 0.705, 0.145],
  ].map(([x, y, z]) => new Vector3(x * side, y, z));
  const curve = new CatmullRomCurve3(pts);
  const frames = curve.computeFrenetFrames(steps, false);
  const base = a.pos.length / 3;
  const p = new Vector3();
  const n = new Vector3();
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    curve.getPointAt(t, p);
    // Sleeve at the shoulder, forearm, a small open hand, then closed.
    let r = 0.048 - 0.022 * t;
    if (t > 0.82) r = 0.026 + 0.012 * Math.sin(((t - 0.82) / 0.18) * Math.PI);
    if (s === steps) r = 0.001;
    const N = frames.normals[s];
    const B = frames.binormals[s];
    for (let k = 0; k <= radial; k++) {
      const ang = (k / radial) * TAU;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      // Flatten the hand into a palm.
      const flat = t > 0.82 ? 0.55 : 1;
      n.set(N.x * c + B.x * sn * flat, N.y * c + B.y * sn * flat, N.z * c + B.z * sn * flat);
      put(a, p.x + n.x * r, p.y + n.y * r, p.z + n.z * r, n.x, n.y, n.z, k / radial, t, 1, side, t);
    }
  }
  for (let s = 0; s < steps; s++) {
    for (let k = 0; k < radial; k++) {
      const i0 = base + s * (radial + 1) + k;
      const i1 = i0 + radial + 1;
      if (side > 0) a.idx.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
      else a.idx.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1);
    }
  }
}

/**
 * The doppelgänger: one unit tall, standing on y = 0, facing +Z.
 * Attributes: `aPart` (0 body, 1 arm), `aSide` (−1, 0, 1), `aArm` (0..1
 * from shoulder to hand).
 */
export function createFigureGeometry(segments = 56) {
  const a = { pos: [], nrm: [], uv: [], part: [], side: [], arm: [], idx: [] };
  loftBody(a, segments);
  sweepArm(a, 1, 12, 28);
  sweepArm(a, -1, 12, 28);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(a.nrm, 3));
  g.setAttribute('uv', new Float32BufferAttribute(a.uv, 2));
  g.setAttribute('aPart', new Float32BufferAttribute(a.part, 1));
  g.setAttribute('aSide', new Float32BufferAttribute(a.side, 1));
  g.setAttribute('aArm', new Float32BufferAttribute(a.arm, 1));
  g.setIndex(a.idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* ---------------------------------------------------------------------- */
/* Streamers                                                               */
/* ---------------------------------------------------------------------- */

/**
 * `count` spiral ribbons from the unit lure ring into the heart. Positions are
 * the centre line in a (radius 1, height 1) frame — the mesh is scaled by
 * (lureRadius, figure height, lureRadius). Attributes: `aS` (0 at the ring,
 * 1 at the heart), `aAcross` (−1/1), `aSeed`.
 */
export function createStreamerGeometry(count = 10, steps = 64) {
  const pos = [];
  const s = [];
  const across = [];
  const seed = [];
  const idx = [];
  for (let k = 0; k < count; k++) {
    const phase = (k / count) * TAU + hash(k) * 0.4;
    const startY = 0.08 + 0.5 * hash(k + 11);
    const turns = 0.75 + 0.35 * hash(k + 23);
    const base = pos.length / 3;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = 1 - 0.95 * Math.pow(t, 0.85);
      const ang = phase + turns * TAU * t;
      const e = t * t * (3 - 2 * t);
      const y = startY + (HEART_Y - startY) * e;
      for (let side = -1; side <= 1; side += 2) {
        pos.push(Math.cos(ang) * r, y, Math.sin(ang) * r);
        s.push(t);
        across.push(side);
        seed.push(hash(k + 37));
      }
    }
    for (let i = 0; i < steps; i++) {
      const p = base + i * 2;
      idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aS', new Float32BufferAttribute(s, 1));
  g.setAttribute('aAcross', new Float32BufferAttribute(across, 1));
  g.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/* ---------------------------------------------------------------------- */
/* Tethers                                                                 */
/* ---------------------------------------------------------------------- */

/**
 * `count` strips; the vertex shader places strip `aIndex` between
 * `uFrom[aIndex]` and `uTo[aIndex]`. Attributes: `aT` (0 at the enemy, 1 at
 * the heart), `aAcross`, `aIndex`.
 */
export function createTetherGeometry(count = 8, steps = 28) {
  const pos = [];
  const t = [];
  const across = [];
  const index = [];
  const idx = [];
  for (let k = 0; k < count; k++) {
    const base = pos.length / 3;
    for (let i = 0; i <= steps; i++) {
      for (let side = -1; side <= 1; side += 2) {
        pos.push(i / steps, side, k);
        t.push(i / steps);
        across.push(side);
        index.push(k);
      }
    }
    for (let i = 0; i < steps; i++) {
      const p = base + i * 2;
      idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aT', new Float32BufferAttribute(t, 1));
  g.setAttribute('aAcross', new Float32BufferAttribute(across, 1));
  g.setAttribute('aIndex', new Float32BufferAttribute(index, 1));
  g.setIndex(idx);
  return g;
}

/* ---------------------------------------------------------------------- */
/* Shards                                                                  */
/* ---------------------------------------------------------------------- */

/**
 * A crystal spindle of solidified light: six irregular facets round a waist
 * set low, a long tip and a short one. Non-indexed so every facet is flat.
 * Unit length along Y.
 */
export function createShardGeometry() {
  const sides = 6;
  const ring = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * TAU + (hash(i + 3) - 0.5) * 0.5;
    const r = 0.14 + 0.08 * hash(i + 7);
    ring.push([Math.cos(a) * r, -0.12 + 0.08 * hash(i + 13), Math.sin(a) * r]);
  }
  const top = [0.02, 0.62, -0.01];
  const bottom = [-0.01, -0.38, 0.02];
  const pos = [];
  for (let i = 0; i < sides; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % sides];
    pos.push(...a, ...b, ...top);
    pos.push(...b, ...a, ...bottom);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* ---------------------------------------------------------------------- */
/* Packet, flare, quad                                                     */
/* ---------------------------------------------------------------------- */

/** The photon in flight: a turned spindle, long axis along +Z, unit length. */
export function createPacketGeometry() {
  const profile = [
    [0, -0.5], [0.05, -0.38], [0.1, -0.2], [0.13, 0], [0.11, 0.16], [0.07, 0.32], [0.03, 0.44], [0, 0.5],
  ].map(([r, y]) => new Vector2(r, y));
  const g = new LatheGeometry(profile, 24);
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** A unit quad (the flare billboard, the floor and the warp carry shaders). */
export function createQuad() {
  return new PlaneGeometry(1, 1, 1, 1);
}
