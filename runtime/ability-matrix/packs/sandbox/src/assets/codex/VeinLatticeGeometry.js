import { BufferGeometry, Float32BufferAttribute } from 'three';

/**
 * Vein Lattice — the vascular net, built in *cylinder parameter space*.
 *
 * Every vertex stores where it is on the net as (θ radians round the circle,
 * h 0..1 up the wall, rf radius as a fraction of the circle), the derivative
 * of that point along its vein, and its place round the tube. The vertex
 * shader (`VeinLatticeMaterials`) turns that into metres with the live
 * radius, height, squeeze and thickness — so every one of those is a slider,
 * and the heartbeat's constriction is a uniform, not a rebuild.
 *
 * ## The net
 *
 * `roots` trunks stand on the rim. Each `level` up, the nodes sit half a slot
 * round from the level below, and every node is fed by the two nodes beneath
 * it — a diamond net, the way capillaries anastomose. It is made organic by
 * jitter on every node, by veins that bow sideways between their ends, by
 * dropping a share of the links (`gaps`), by thinning with height, and by
 * knots where veins meet. The top row curls inward into tapering tendrils,
 * and each trunk throws a short root out across the floor.
 *
 * Per vertex:
 *   - `aCentre`  (θ, h, rf) of the vein's centreline here
 *   - `aDeriv`   d(θ, h, rf)/ds — for the tube frame in the shader
 *   - `aRing`    (cos φ, sin φ) round the tube
 *   - `aTube`    (grow 0..1 — when growth reaches it, thickness factor,
 *                 seed, s along its own vein 0..1)
 *
 * `nodes` (returned alongside) lists every node's (θ, h, rf) so the CPU can
 * drip and burst from exactly where the GPU draws a knot.
 */
export function createVeinNetGeometry(opts) {
  const roots = Math.max(3, Math.round(opts.roots));
  const levels = Math.max(1, Math.round(opts.levels));
  const jitter = opts.jitter ?? 0.3;
  const gaps = opts.gaps ?? 0.2;
  const bow = opts.bow ?? 0.25;
  const curl = opts.curl ?? 0.35;
  const seed = opts.seed ?? 1;
  const SEG = opts.segments ?? 12;
  const SIDES = opts.sides ?? 8;

  let s0 = seed * 9301 + 49297;
  const rand = () => {
    s0 = (s0 * 9301 + 49297) % 233280;
    return s0 / 233280;
  };

  const TAU = Math.PI * 2;
  const step = TAU / roots;

  /* ---- nodes ---- */
  const grid = [];
  const nodes = [];
  for (let k = 0; k <= levels; k++) {
    const row = [];
    for (let i = 0; i < roots; i++) {
      const f = k / levels;
      const theta = (i + 0.5 * k) * step + (k === 0 ? 0.15 : 0.35) * (rand() * 2 - 1) * jitter * step;
      const h = k === 0 ? 0 : Math.min(1, (f * 0.86 + (rand() * 2 - 1) * 0.06 * jitter) * 1);
      const rf = 1 - curl * f * f;
      row.push([theta, h, rf]);
      nodes.push(theta, h, rf);
    }
    grid.push(row);
  }

  /* ---- veins as cubic béziers in (θ, h, rf) ---- */
  const veins = [];
  const addVein = (a, b, g0, g1, t0, t1, bowAmt) => {
    // Unwrap θ so a vein never goes the long way round.
    let tb = b[0];
    while (tb - a[0] > Math.PI) tb -= TAU;
    while (tb - a[0] < -Math.PI) tb += TAU;
    const B = [tb, b[1], b[2]];
    const d = [B[0] - a[0], B[1] - a[1], B[2] - a[2]];
    // Bow sideways (in θ) and a little in height, opposite at each control.
    const side = (rand() * 2 - 1) * bowAmt * step;
    const lift = (rand() * 2 - 1) * bowAmt * 0.08;
    const p1 = [a[0] + d[0] / 3 + side, a[1] + d[1] / 3 + lift, a[2] + d[2] / 3];
    const p2 = [a[0] + (2 * d[0]) / 3 - side * 0.6, a[1] + (2 * d[1]) / 3 - lift, a[2] + (2 * d[2]) / 3];
    veins.push({ p0: a, p1, p2, p3: B, g0, g1, t0, t1, seed: rand() });
  };

  const L1 = levels + 1;
  for (let k = 1; k <= levels; k++) {
    for (let i = 0; i < roots; i++) {
      const n = grid[k][i];
      const left = grid[k - 1][i];
      const right = grid[k - 1][(i + 1) % roots];
      const thick0 = 1 - 0.55 * ((k - 1) / levels);
      const thick1 = 1 - 0.55 * (k / levels);
      const g0 = (k - 1) / L1;
      const g1 = k / L1;
      // Drop a share of the links, but never both feeds of one node.
      const dropL = rand() < gaps;
      const dropR = !dropL && rand() < gaps;
      if (!dropL) addVein(left, n, g0, g1, thick0, thick1, bow);
      if (!dropR) addVein(right, n, g0, g1, thick0 * 0.92, thick1, bow);
    }
  }
  // Tendrils off the top row, curling in and up to a point.
  for (let i = 0; i < roots; i++) {
    const n = grid[levels][i];
    const tip = [n[0] + (rand() * 2 - 1) * 0.3 * step, Math.min(1.12, n[1] + 0.14 + rand() * 0.08), n[2] - curl * 0.5 - 0.1];
    addVein(n, tip, levels / L1, 1, 1 - 0.55, 0.0, bow * 1.5);
  }
  // A root off each trunk, out across the floor.
  for (let i = 0; i < roots; i++) {
    const n = grid[0][i];
    const out = [n[0] + (rand() * 2 - 1) * 0.4 * step, 0, 1.18 + rand() * 0.15];
    veins.push({ p0: [n[0], 0, 1], p1: [n[0], 0.015, 1.06], p2: [out[0], 0.01, out[2] - 0.05], p3: out, g0: 0, g1: 0.08, t0: 1.1, t1: 0.0, seed: rand() });
  }

  /* ---- tessellate ---- */
  const centre = [];
  const deriv = [];
  const ring = [];
  const tube = [];
  const indices = [];
  const bez = (p0, p1, p2, p3, t, j) => {
    const u = 1 - t;
    return u * u * u * p0[j] + 3 * u * u * t * p1[j] + 3 * u * t * t * p2[j] + t * t * t * p3[j];
  };
  const dbez = (p0, p1, p2, p3, t, j) => {
    const u = 1 - t;
    return 3 * u * u * (p1[j] - p0[j]) + 6 * u * t * (p2[j] - p1[j]) + 3 * t * t * (p3[j] - p2[j]);
  };

  for (const v of veins) {
    const base = centre.length / 3;
    for (let a = 0; a <= SEG; a++) {
      const t = a / SEG;
      const cx = bez(v.p0, v.p1, v.p2, v.p3, t, 0);
      const cy = bez(v.p0, v.p1, v.p2, v.p3, t, 1);
      const cz = bez(v.p0, v.p1, v.p2, v.p3, t, 2);
      const dx = dbez(v.p0, v.p1, v.p2, v.p3, t, 0);
      const dy = dbez(v.p0, v.p1, v.p2, v.p3, t, 1);
      const dz = dbez(v.p0, v.p1, v.p2, v.p3, t, 2);
      // Knots where veins meet; thinning to the far end.
      const knot = 1 + 0.4 * Math.exp(-((t / 0.1) ** 2)) + 0.3 * Math.exp(-(((1 - t) / 0.1) ** 2));
      const thick = (v.t0 + (v.t1 - v.t0) * t) * (v.t1 === 0 ? 1 : knot);
      const grow = v.g0 + (v.g1 - v.g0) * t;
      for (let b = 0; b <= SIDES; b++) {
        const phi = (b / SIDES) * TAU;
        centre.push(cx, cy, cz);
        deriv.push(dx, dy, dz);
        ring.push(Math.cos(phi), Math.sin(phi));
        tube.push(grow, thick, v.seed, t);
      }
    }
    for (let a = 0; a < SEG; a++) {
      for (let b = 0; b < SIDES; b++) {
        const i0 = base + a * (SIDES + 1) + b;
        const i1 = i0 + 1;
        const i2 = i0 + SIDES + 1;
        const i3 = i2 + 1;
        indices.push(i0, i2, i1, i1, i2, i3);
      }
    }
  }

  const geometry = new BufferGeometry();
  // `position` is the param-space centre too, so three has something to bound.
  geometry.setAttribute('position', new Float32BufferAttribute(centre, 3));
  geometry.setAttribute('aCentre', new Float32BufferAttribute(centre, 3));
  geometry.setAttribute('aDeriv', new Float32BufferAttribute(deriv, 3));
  geometry.setAttribute('aRing', new Float32BufferAttribute(ring, 2));
  geometry.setAttribute('aTube', new Float32BufferAttribute(tube, 4));
  geometry.setIndex(indices);
  return { geometry, nodes: new Float32Array(nodes), roots, levels };
}

/**
 * A straight tube along +X (0..1), radius 1, for the feeder vein that runs
 * down the cast line. `uv.x` is along, `uv.y` round.
 */
export function createVeinFeederGeometry(segments = 160, sides = 6) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let a = 0; a <= segments; a++) {
    const s = a / segments;
    for (let b = 0; b <= sides; b++) {
      const phi = (b / sides) * Math.PI * 2;
      positions.push(s, Math.cos(phi), Math.sin(phi));
      uvs.push(s, b / sides);
    }
  }
  for (let a = 0; a < segments; a++) {
    for (let b = 0; b < sides; b++) {
      const i0 = a * (sides + 1) + b;
      const i1 = i0 + 1;
      const i2 = i0 + sides + 1;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}
