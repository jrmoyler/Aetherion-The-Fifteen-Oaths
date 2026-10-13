import { BufferAttribute, BufferGeometry, LatheGeometry, Vector2, Vector3 } from 'three';

/**
 * Seedstorm Volley — procedural geometry.
 *
 *  - `createSaplingGeometry` — one branching sapling in *unit* space (about a
 *    metre tall), built as tubes along wandering paths: a trunk, its branches,
 *    their twigs, and folded leaf blades on the young wood. It carries no
 *    animation of its own; every vertex is tagged so the shader can grow it,
 *    lash it and wither it:
 *      `aCenter` — the spine point the vertex belongs to (a tube ring's centre,
 *                  or a leaf's attach point). Collapsing a vertex onto it is how
 *                  the grow mask hides wood that has not grown yet.
 *      `aGrow`   — path distance from the root, normalised 0..1. The grow front
 *                  is a threshold on it, so the sapling grows *along* itself:
 *                  trunk first, branches as the front passes their fork.
 *      `aKind`   — 0 bark, 1 leaf.
 *      `aUv`     — bark: (around, metres along); leaf: (across -1..1, along 0..1).
 *      `aLevel`  — 0 trunk, 1 branch, 2 twig (leaves take their twig's level).
 *  - `createSeedGeometry` — an almond, pointed along +Z, unit length.
 *
 * Built once per variant from a seeded PRNG, so a slider that changes the
 * branch structure rebuilds identically for the same dice.
 */

/** Small deterministic PRNG (mulberry32). */
function rng(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _t = new Vector3();
const _n = new Vector3();
const _b = new Vector3();
const _tmp = new Vector3();
const _up = new Vector3(0, 1, 0);

/** Rotate `v` about unit `axis` by `angle` (Rodrigues), in place. */
function rotateAbout(v, axis, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const d = v.dot(axis);
  _tmp.crossVectors(axis, v);
  v.multiplyScalar(c).addScaledVector(_tmp, s).addScaledVector(axis, d * (1 - c));
  return v;
}

/**
 * @param {object} o
 * @param {number} o.seed
 * @param {number} [o.branches]  branches off the trunk
 * @param {number} [o.twigs]     twigs off each branch
 * @param {number} [o.leaves]    leaf density, 0..2
 * @param {number} [o.curve]     how much the wood wanders, 0..1
 * @param {number} [o.spread]    how far the branches splay, 0..1
 */
export function createSaplingGeometry({ seed = 1, branches = 5, twigs = 3, leaves = 1, curve = 0.35, spread = 0.55 } = {}) {
  const rand = rng(Math.floor(seed * 1000) + 17);
  const pos = [];
  const nor = [];
  const cen = [];
  const grw = [];
  const knd = [];
  const uvs = [];
  const lvl = [];
  const idx = [];
  let maxGrow = 0;

  const vertex = (p, n, c, g, kind, u, v, level) => {
    pos.push(p.x, p.y, p.z);
    nor.push(n.x, n.y, n.z);
    cen.push(c.x, c.y, c.z);
    grw.push(g);
    knd.push(kind);
    uvs.push(u, v);
    lvl.push(level);
    if (g > maxGrow) maxGrow = g;
    return pos.length / 3 - 1;
  };

  /** One folded leaf blade hung off `at`, pointing roughly along `dir`. */
  const leaf = (at, dir, grow, level, scale) => {
    const len = (0.12 + rand() * 0.07) * scale;
    const wid = len * (0.32 + rand() * 0.12);
    const fold = 0.35 + rand() * 0.25;
    const axis = new Vector3().copy(dir).normalize();
    // A leaf faces up-and-out: its blade normal leans toward the sky.
    const side = new Vector3().crossVectors(axis, _up);
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    const normal = new Vector3().crossVectors(side, axis).normalize();
    if (normal.y < 0) normal.negate();
    const steps = 6;
    const mid = [];
    const left = [];
    const right = [];
    const p = new Vector3();
    for (let s = 0; s <= steps; s++) {
      const k = s / steps;
      // Droops a little toward its tip.
      const along = new Vector3().copy(axis).multiplyScalar(len * k).addScaledVector(normal, -len * 0.18 * k * k);
      const w = wid * Math.pow(Math.sin(Math.PI * Math.min(k * 1.04, 1)), 0.75) * (1 - 0.25 * k);
      p.copy(at).add(along);
      mid.push(vertex(p, normal, at, grow, 1, 0, k, level));
      p.copy(at).add(along).addScaledVector(side, w).addScaledVector(normal, w * fold);
      left.push(vertex(p, normal, at, grow, 1, -1, k, level));
      p.copy(at).add(along).addScaledVector(side, -w).addScaledVector(normal, w * fold);
      right.push(vertex(p, normal, at, grow, 1, 1, k, level));
    }
    for (let s = 0; s < steps; s++) {
      idx.push(mid[s], left[s], mid[s + 1], left[s], left[s + 1], mid[s + 1]);
      idx.push(mid[s], mid[s + 1], right[s], right[s], mid[s + 1], right[s + 1]);
    }
  };

  /**
   * A tube along a wandering path, then its children.
   * `grow0` is the path distance (unit metres) from the root at its fork.
   */
  const branch = (start, dir, length, r0, r1, level, grow0) => {
    const segments = level === 0 ? 12 : level === 1 ? 8 : 5;
    const radial = level === 0 ? 8 : level === 1 ? 6 : 4;
    const points = [];
    const tangents = [];
    const d = new Vector3().copy(dir).normalize();
    const p = new Vector3().copy(start);
    const wanderAxis = new Vector3();
    for (let k = 0; k <= segments; k++) {
      points.push(p.clone());
      tangents.push(d.clone());
      // Wander, and turn toward the light: young wood grows up.
      wanderAxis.set(rand() - 0.5, rand() * 0.2 - 0.1, rand() - 0.5).normalize();
      rotateAbout(d, wanderAxis, (rand() - 0.5) * curve * 0.9);
      d.lerp(_up, 0.06 + level * 0.04).normalize();
      p.addScaledVector(d, length / segments);
    }

    // Parallel-transport frame, so the rings do not twist.
    _n.set(1, 0, 0);
    if (Math.abs(tangents[0].x) > 0.9) _n.set(0, 0, 1);
    _b.crossVectors(tangents[0], _n).normalize();
    _n.crossVectors(_b, tangents[0]).normalize();

    const rings = [];
    const ringN = new Vector3();
    const ringP = new Vector3();
    for (let k = 0; k <= segments; k++) {
      const t = tangents[k];
      if (k > 0) {
        // Transport: remove the component along the new tangent.
        _n.addScaledVector(t, -_n.dot(t)).normalize();
        _b.crossVectors(t, _n).normalize();
      }
      const f = k / segments;
      // A flare at the root of the trunk, then a taper.
      const flare = level === 0 ? 1 + 0.6 * Math.exp(-f * 14) : 1;
      const r = (r0 + (r1 - r0) * Math.pow(f, 0.8)) * flare;
      const g = grow0 + length * f;
      const ring = [];
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        ringN.copy(_n).multiplyScalar(Math.cos(a)).addScaledVector(_b, Math.sin(a));
        ringP.copy(points[k]).addScaledVector(ringN, r);
        ring.push(vertex(ringP, ringN, points[k], g, 0, j / radial, g, level));
      }
      rings.push(ring);
    }
    for (let k = 0; k < segments; k++) {
      for (let j = 0; j < radial; j++) {
        const a = rings[k][j];
        const b = rings[k][j + 1];
        const c = rings[k + 1][j];
        const e = rings[k + 1][j + 1];
        idx.push(a, c, b, b, c, e);
      }
    }

    /* children */
    if (level < 2) {
      const count = level === 0 ? branches : twigs;
      const golden = 2.39996;
      let az = rand() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const f = level === 0 ? 0.3 + 0.6 * ((i + 0.5 + (rand() - 0.5) * 0.6) / count) : 0.25 + 0.7 * rand();
        const k = Math.min(segments - 1, Math.max(1, Math.round(f * segments)));
        const t = tangents[k];
        az += golden + (rand() - 0.5) * 0.5;
        // Out of the parent at a splay angle, on a spiral round it.
        const childDir = new Vector3(Math.cos(az), 0, Math.sin(az));
        childDir.addScaledVector(t, -childDir.dot(t)).normalize();
        const splay = (0.45 + spread * 0.75) * (0.75 + rand() * 0.5);
        childDir.multiplyScalar(Math.sin(splay)).addScaledVector(t, Math.cos(splay)).normalize();
        const lenK = (level === 0 ? 0.5 : 0.42) * (0.75 + rand() * 0.5) * (1 - f * 0.35);
        const rK = (r0 + (r1 - r0) * Math.pow(k / segments, 0.8)) * 0.62;
        branch(points[k], childDir, length * lenK, rK, rK * 0.2, level + 1, grow0 + length * (k / segments));
      }
    }

    /* leaves on the young wood */
    if (level >= 1) {
      const n = Math.round((level === 1 ? 2 : 4) * leaves);
      for (let i = 0; i < n; i++) {
        const k = Math.min(segments, Math.round((0.35 + 0.65 * ((i + rand()) / Math.max(1, n))) * segments));
        const t = tangents[Math.min(k, segments)];
        const out = new Vector3(rand() - 0.5, rand() * 0.6, rand() - 0.5);
        out.addScaledVector(t, -out.dot(t));
        if (out.lengthSq() < 1e-4) out.set(1, 0, 0);
        out.normalize().multiplyScalar(0.8).addScaledVector(t, 0.6).normalize();
        leaf(points[k], out, grow0 + length * (k / segments) + 0.02, level, level === 1 ? 1.1 : 0.9);
      }
      // A tuft at the very tip.
      const tip = points[segments];
      const tt = tangents[segments];
      for (let i = 0; i < Math.round(2 * leaves); i++) {
        const out = new Vector3(rand() - 0.5, 0.3, rand() - 0.5).normalize().multiplyScalar(0.5).addScaledVector(tt, 0.8).normalize();
        leaf(tip, out, grow0 + length + 0.02, level, 0.85);
      }
    }
  };

  const lean = new Vector3((rand() - 0.5) * 0.25, 1, (rand() - 0.5) * 0.25).normalize();
  branch(new Vector3(0, -0.05, 0), lean, 1.0, 0.045, 0.008, 0, 0);

  // Normalise the path distance so the shader's front runs 0..1.
  const inv = 1 / Math.max(maxGrow, 1e-4);
  for (let i = 0; i < grw.length; i++) grw[i] *= inv;

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  geometry.setAttribute('aCenter', new BufferAttribute(new Float32Array(cen), 3));
  geometry.setAttribute('aGrow', new BufferAttribute(new Float32Array(grw), 1));
  geometry.setAttribute('aKind', new BufferAttribute(new Float32Array(knd), 1));
  geometry.setAttribute('aUv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute('aLevel', new BufferAttribute(new Float32Array(lvl), 1));
  const index = pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** An almond: pointed at +Z, blunt at -Z, unit length, ~0.45 wide. */
export function createSeedGeometry() {
  const profile = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Fat behind the middle, drawn out to a point in front.
    const r = 0.22 * Math.pow(Math.sin(Math.PI * t), 0.7) * (1 - 0.35 * t);
    profile.push(new Vector2(Math.max(r, 0.0005), t - 0.5));
  }
  const geometry = new LatheGeometry(profile, 10);
  geometry.rotateX(Math.PI / 2); // lathe axis +Y → +Z
  return geometry;
}
