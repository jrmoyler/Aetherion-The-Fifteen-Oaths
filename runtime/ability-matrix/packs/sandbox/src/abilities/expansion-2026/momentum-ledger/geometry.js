import {
  BufferGeometry,
  CatmullRomCurve3,
  DynamicDrawUsage,
  Float32BufferAttribute,
  PlaneGeometry,
  TubeGeometry,
  Vector3,
} from 'three';

/**
 * Momentum Ledger — procedural geometry.
 *
 *  - **the ledger wheel** — a ring of rectangular section (in XY, like a
 *    torus, so the same rotation lays it flat) with tally notches cut into
 *    its top face every fifteen degrees — a counter wheel, not a hoop.
 *  - **the coil** — a tapered helical spring along +Z, four turns, its wire
 *    radius swelling in the middle; the ability compresses it along Z with
 *    the distance actually banked.
 *  - **the velocity glyph** — a cut arrowhead with a raised spine and a
 *    notched tail, an oriented glyph rather than a flat decal.
 *  - **the wake ribbon** — a pooled triangle strip of `MAX` pairs that the
 *    ability rewrites from the recorded walk each frame.
 *  - **the directional fan** — a sector in XZ round +Z; `uv.x` across the
 *    angle, `uv.y` out along the radius, for the travelling release front.
 *  - **speed motes** — a fixed seed cloud placed entirely in the shader.
 *  - **the flywheel** — the hero: a heavy cast wheel of unit radius in XY
 *    (axle along +Z) — a toothed rim of rectangular section with 24 teeth
 *    (one per tally cell, `aTooth` = its index / 24, −1 elsewhere, so the
 *    material can light the teeth one by one as the bank fills), six swept
 *    S-curved spokes of box section, and a proud hub with an axle boss. Every
 *    face is swept from a 4-corner section with its corners doubled, so the
 *    edges stay hard under the sun.
 */

const TAU = Math.PI * 2;

/** Unit-radius counter wheel with `notches` tally cuts. */
export function createLedgerWheelGeometry({ width = 0.07, thickness = 0.035, segments = 192, notches = 24 } = {}) {
  const position = [];
  const uv = [];
  const index = [];
  const corners = [[1, 1], [1, -1], [1, -1], [-1, -1], [-1, -1], [-1, 1], [-1, 1], [1, 1]];
  const perRing = corners.length;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = t * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    // A notch is a narrow dip in the top face (front, +Z).
    const notch = Math.abs(((t * notches) % 1) - 0.5) > 0.44 ? 1 : 0;
    for (let k = 0; k < perRing; k++) {
      const [radial, depth] = corners[k];
      const r = 1 + radial * width * 0.5;
      const z = depth > 0 ? thickness * 0.5 * (1 - notch * 0.7) : -thickness * 0.5;
      position.push(c * r, s * r, z);
      uv.push(t, k / (perRing - 1));
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let k = 0; k < perRing; k += 2) {
      const a = i * perRing + k, b = a + 1, c = a + perRing, d = b + perRing;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setIndex(index);
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** A tapered helical spring along +Z, 1.5 m long before scaling. */
export function createCoilGeometry() {
  const points = [];
  for (let i = 0; i <= 96; i++) {
    const t = i / 96,
      angle = t * TAU * 4;
    const radius = 0.11 * (0.5 + 0.5 * Math.sin(Math.PI * t));
    points.push(new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, t * 1.5));
  }
  return new TubeGeometry(new CatmullRomCurve3(points), 160, 0.025, 8, false);
}

/** Cut arrowhead with a raised spine and a notched tail; points +Z. */
export function createVectorGeometry() {
  const g = new BufferGeometry(),
    v = [];
  const face = (a, b, c) => v.push(...a, ...b, ...c);
  const p = [
    [0, 0, 0.46],
    [-0.17, 0, 0.03],
    [-0.065, 0, 0.08],
    [-0.065, 0, -0.32],
    [-0.12, 0, -0.44], // tail fletch
    [0, 0, -0.34], // notch
    [0.12, 0, -0.44],
    [0.065, 0, -0.32],
    [0.065, 0, 0.08],
    [0.17, 0, 0.03],
  ];
  const top = [0, 0.08, 0.02];
  const bottom = [0, -0.025, 0.02];
  for (let i = 0; i < p.length; i++) {
    const a = p[i],
      b = p[(i + 1) % p.length];
    face(top, a, b);
    face(bottom, b, a);
  }
  g.setAttribute('position', new Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Pooled ribbon strip of `max` cross-sections. `aT` is rewritten each frame
 * (0 at the oldest point, 1 at the newest); `aSide` is fixed at ±1.
 */
export function createRibbonGeometry(max) {
  const position = new Float32BufferAttribute(new Float32Array(max * 2 * 3), 3);
  position.setUsage(DynamicDrawUsage);
  const along = new Float32BufferAttribute(new Float32Array(max * 2), 1);
  along.setUsage(DynamicDrawUsage);
  const side = new Float32Array(max * 2);
  const index = [];
  for (let i = 0; i < max; i++) {
    side[i * 2] = -1;
    side[i * 2 + 1] = 1;
    if (i < max - 1) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setIndex(index);
  g.setAttribute('position', position);
  g.setAttribute('aT', along);
  g.setAttribute('aSide', new Float32BufferAttribute(side, 1));
  g.setDrawRange(0, 0);
  return g;
}

/** A sector in XZ round +Z from −1..1 of its half-angle, unit radius. */
export function createFanGeometry({ arc = 24, rings = 10 } = {}) {
  const position = [];
  const uv = [];
  const index = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    for (let i = 0; i <= arc; i++) {
      const u = i / arc;
      // The shader turns uv.x into an angle; the vertices only lay it out.
      const a = (u * 2 - 1) * 0.5;
      position.push(Math.sin(a) * v, 0, Math.cos(a) * v);
      uv.push(u, v);
    }
  }
  const row = arc + 1;
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < arc; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setIndex(index);
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}

/** `count` seeds for the GPU speed motes. Positions are placeholders. */
export function createSpeedMoteGeometry(count) {
  const position = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  let h = 0xbb67ae85;
  const rand = () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
  for (let i = 0; i < count; i++) {
    seed[i * 4 + 0] = rand();
    seed[i * 4 + 1] = rand();
    seed[i * 4 + 2] = rand();
    seed[i * 4 + 3] = i / count;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('aSeed', new Float32BufferAttribute(seed, 4));
  return g;
}

/** Unit quad. */
export function createQuad() {
  return new PlaneGeometry(1, 1);
}

/* ---------------------------------------------------------------------- */
/* The flywheel                                                            */
/* ---------------------------------------------------------------------- */

/**
 * Sweep a 4-corner section along `n + 1` stations into `out`. `section(t, k)`
 * returns corner `k` (0..3, in order round the section) at station `t` 0..1
 * as [x, y, z]. Corners are doubled so each face keeps its own normal.
 */
function sweep(out, n, section, tooth) {
  const base = out.position.length / 3;
  const per = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    for (let k = 0; k < 4; k++) {
      const a = section(t, k);
      const b = section(t, (k + 1) % 4);
      out.position.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      const tv = typeof tooth === 'function' ? tooth(t, k) : tooth;
      out.tooth.push(tv, tv);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) {
      const a = base + i * per + k * 2;
      const b = a + 1;
      const c = a + per;
      const d = b + per;
      out.index.push(a, c, b, b, c, d);
    }
  }
  return out;
}

/**
 * Unit-radius flywheel in XY, axle along +Z.
 * @param {object} [o]
 * @param {number} [o.teeth=24]   tally teeth round the rim
 * @param {number} [o.spokes=6]
 * @param {number} [o.width=0.2]  rim width along the axle (unit radii)
 */
export function createFlywheelGeometry({ teeth = 24, spokes = 6, width = 0.2 } = {}) {
  const out = { position: [], tooth: [], index: [] };
  const segments = teeth * 8;
  const hw = width * 0.5;

  // Rim: inner face at 0.8, outer at 0.94, teeth rising to 1.0 on the outer
  // face. A tooth is a flat-topped trapezoid occupying ~55 % of its pitch.
  const toothAt = (t) => {
    const f = (t * teeth) % 1;
    const rise = Math.min(1, Math.max(0, (Math.min(f, 1 - f) - 0.18) / 0.06));
    return rise;
  };
  const rim = (t, k) => {
    const a = t * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    const outer = 0.94 + 0.08 * toothAt(t);
    const inner = 0.8;
    const corners = [
      [inner, -hw], [outer, -hw * 0.82], [outer, hw * 0.82], [inner, hw],
    ];
    const [r, z] = corners[k];
    return [c * r, s * r, z];
  };
  sweep(out, segments, rim, (t) => {
    const f = (t * teeth) % 1;
    return Math.min(f, 1 - f) > 0.2 ? Math.floor(t * teeth + 1e-6) / teeth : -1;
  });

  // Hub: 0.12 → 0.24, deeper than the rim; an axle boss 0.05 → 0.11.
  const ring = (r0, r1, z0, z1) => (t, k) => {
    const a = t * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    const corners = [[r0, z0], [r1, z0 * 0.9], [r1, z1 * 0.9], [r0, z1]];
    const [r, z] = corners[k];
    return [c * r, s * r, z];
  };
  sweep(out, 48, ring(0.12, 0.25, -hw * 1.6, hw * 1.6), -1);
  sweep(out, 32, ring(0.04, 0.11, -hw * 2.6, hw * 2.6), -1);
  // Spokes: S-curved, box section, from the hub to inside the rim.
  for (let i = 0; i < spokes; i++) {
    const a0 = (i / spokes) * TAU;
    const spoke = (t, k) => {
      const r = 0.22 + t * 0.6;
      const a = a0 + 0.42 * Math.sin(t * Math.PI) * (t - 0.2);
      const c = Math.cos(a), s = Math.sin(a);
      const w = 0.045 * (1.25 - 0.5 * t); // tapers toward the rim
      const d = hw * (1.05 - 0.35 * t);
      const corners = [[-w, -d], [w, -d], [w, d], [-w, d]];
      const [x, z] = corners[k];
      return [c * r - s * x, s * r + c * x, z];
    };
    sweep(out, 14, spoke, -1);
  }

  const g = new BufferGeometry();
  g.setIndex(out.index);
  g.setAttribute('position', new Float32BufferAttribute(out.position, 3));
  g.setAttribute('aTooth', new Float32BufferAttribute(out.tooth, 1));
  g.computeVertexNormals();
  return g;
}
