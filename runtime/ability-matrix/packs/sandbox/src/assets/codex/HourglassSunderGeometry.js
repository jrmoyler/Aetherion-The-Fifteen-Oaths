import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, LatheGeometry, Vector2 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Hourglass Sunder — procedural geometry. Everything is a lathe or an
 * extrusion built here; nothing is loaded.
 *
 * All of it shares one frame: the **neck at the origin**, the glass running
 * from y = −H to y = +H, metres at `size` 1. The ability scales and turns the
 * whole rig as one, so the sand shader, the stream and the frame never have to
 * agree on anything but this.
 *
 * The profile (`bulbRadius`) is the single source of truth for the glass's
 * shape. The CPU uses the same function to integrate a **volume table**, which
 * is how the sand keeps its volume: the level in each bulb is looked up from
 * how much sand is in it, so as the top drains the bottom fills by exactly the
 * same amount, whatever the bulb's shape.
 */

/**
 * Radius of the glass at a height.
 *
 * @param {number} s   |y| / H, 0 at the neck … 1 at a cap
 * @param {object} p   { neck, radius, shape, cap } — metres / fractions
 *   - `shape` 0.2..0.9: where along the bulb the widest point sits
 *   - `cap`   0.2..1  : the radius at the cap as a fraction of the widest
 */
export function bulbRadius(s, p) {
  const t = Math.min(1, Math.max(0, s));
  const w = Math.min(0.9, Math.max(0.15, p.shape));
  if (t <= w) {
    // A flared trumpet off the neck: thin for a while, then swelling fast.
    const k = Math.sin((t / w) * Math.PI * 0.5);
    return p.neck + (p.radius - p.neck) * Math.pow(k, 1.35);
  }
  const k = (t - w) / (1 - w);
  return p.radius * (1 - (1 - Math.min(1, Math.max(0.05, p.cap))) * k * k);
}

/** Lathe points for the glass, dense at the neck where the curvature is. */
function profilePoints(p, inset, rows) {
  const H = p.half;
  const points = [];
  points.push(new Vector2(0, -H));
  for (let i = rows; i >= -rows; i--) {
    const u = i / rows; // 1 … −1
    const s = Math.pow(Math.abs(u), 1.6);
    const y = Math.sign(u) * s * H * -1; // −H … +H as i runs down
    points.push(new Vector2(Math.max(0.002, bulbRadius(s, p) * inset), y));
  }
  points.push(new Vector2(0, H));
  return points;
}

/**
 * The glass: one closed lathe from cap to cap.
 * @param {object} p  { half, neck, radius, shape, cap }
 * @param {number} [inset] 1 for the glass, a little less for the sand inside
 */
export function createBulbGeometry(p, inset = 1, segments = 56, rows = 48) {
  const geometry = new LatheGeometry(profilePoints(p, inset, rows), segments);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Cumulative volume of one bulb, neck → cap, sampled at `n + 1` heights.
 * `table[i]` is the volume between the neck and s = i / n, cubic metres.
 */
export function bulbVolumeTable(p, inset, table) {
  const n = table.length - 1;
  const H = p.half;
  let v = 0;
  table[0] = 0;
  for (let i = 1; i <= n; i++) {
    const s0 = (i - 1) / n;
    const s1 = i / n;
    const r0 = bulbRadius(s0, p) * inset;
    const r1 = bulbRadius(s1, p) * inset;
    // Frustum slice.
    v += (Math.PI * H * (s1 - s0) * (r0 * r0 + r0 * r1 + r1 * r1)) / 3;
    table[i] = v;
  }
  return table;
}

/** Inverse of the table: the s (0..1) at which `volume` has been reached from the neck. */
export function levelForVolume(table, volume) {
  const n = table.length - 1;
  if (volume <= 0) return 0;
  if (volume >= table[n]) return 1;
  for (let i = 1; i <= n; i++) {
    if (table[i] >= volume) {
      const a = table[i - 1];
      const k = (volume - a) / Math.max(1e-9, table[i] - a);
      return (i - 1 + k) / n;
    }
  }
  return 1;
}

/**
 * The brass frame: two moulded end plates and turned spindle pillars, merged
 * into one mesh because they move as one and share one material.
 *
 * @param {object} p { half, radius, capRadius, capThickness, pillars, pillarRadius }
 */
export function createFrameGeometry(p) {
  const H = p.half;
  const R = p.capRadius;
  const T = p.capThickness;
  const parts = [];

  // An end plate: a moulded profile — a lip, a cove, a bead, a crown.
  const plate = (sign) => {
    const pts = [
      [0, 0],
      [R * 0.8, 0],
      [R * 0.98, T * 0.12],
      [R, T * 0.3],
      [R * 0.94, T * 0.45],
      [R * 1.02, T * 0.62],
      [R * 0.9, T * 0.82],
      [R * 0.62, T * 0.95],
      [R * 0.3, T],
      [0, T * 1.05]
    ];
    const v = pts.map(([r, y]) => new Vector2(Math.max(0.001, r), sign > 0 ? H + y : -H - y));
    if (sign < 0) v.reverse();
    const g = new LatheGeometry(v, 64);
    return g;
  };
  parts.push(plate(1), plate(-1));

  // Spindles: beads at both ends and a swell in the middle, like turned wood.
  const n = Math.max(0, Math.round(p.pillars));
  const pr = p.pillarRadius;
  const ring = p.pillarRing;
  for (let i = 0; i < n; i++) {
    const spindle = [];
    const rows = 28;
    for (let k = 0; k <= rows; k++) {
      const u = k / rows; // 0 bottom … 1 top
      const y = -H + u * 2 * H;
      const bead = Math.exp(-Math.pow((u - 0.06) / 0.03, 2)) + Math.exp(-Math.pow((u - 0.94) / 0.03, 2));
      const swell = Math.exp(-Math.pow((u - 0.5) / 0.12, 2)) * 0.6;
      const ringBead = Math.exp(-Math.pow((u - 0.5) / 0.015, 2)) * 0.8;
      spindle.push(new Vector2(pr * (0.75 + bead * 0.7 + swell + ringBead), y));
    }
    spindle.unshift(new Vector2(0.001, -H));
    spindle.push(new Vector2(0.001, H));
    const g = new LatheGeometry(spindle, 12);
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    g.translate(Math.cos(a) * ring, 0, Math.sin(a) * ring);
    parts.push(g);
  }

  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * A flat toothed ring — clockwork. Lies in XZ, centred on the origin,
 * `thickness` tall. Non-indexed, so every face is hard-edged.
 *
 * @param {number} teeth
 * @param {number} inner   inner radius, metres
 * @param {number} outer   root radius of the teeth, metres
 * @param {number} depth   tooth height, metres
 * @param {number} thickness
 */
export function createGearGeometry(teeth, inner, outer, depth, thickness) {
  const n = Math.max(6, Math.round(teeth));
  const steps = n * 4;
  const pos = [];
  const half = thickness * 0.5;

  // Outline radius at each of the four points per tooth: root, rise, top, fall.
  const outR = (k) => {
    const m = k % 4;
    return m === 1 || m === 2 ? outer + depth : outer;
  };
  const ang = (k) => {
    // Teeth a little narrower at the top than at the root.
    const m = k % 4;
    const base = Math.floor(k / 4) * 4;
    const off = m === 0 ? 0 : m === 1 ? 1.15 : m === 2 ? 2.85 : 4;
    return ((base + off) / steps) * Math.PI * 2;
  };
  const quad = (a, b, c, d) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  };

  for (let k = 0; k < steps; k++) {
    const a0 = ang(k);
    const a1 = ang(k + 1);
    const r0 = outR(k);
    const r1 = outR(k + 1);
    const o0t = [Math.cos(a0) * r0, half, Math.sin(a0) * r0];
    const o1t = [Math.cos(a1) * r1, half, Math.sin(a1) * r1];
    const o0b = [o0t[0], -half, o0t[2]];
    const o1b = [o1t[0], -half, o1t[2]];
    const i0t = [Math.cos(a0) * inner, half, Math.sin(a0) * inner];
    const i1t = [Math.cos(a1) * inner, half, Math.sin(a1) * inner];
    const i0b = [i0t[0], -half, i0t[2]];
    const i1b = [i1t[0], -half, i1t[2]];
    // top (facing +y), bottom (−y), outer wall, inner wall
    quad(i0t, i1t, o1t, o0t);
    quad(i0b, o0b, o1b, i1b);
    quad(o0t, o1t, o1b, o0b);
    quad(i1t, i0t, i0b, i1b);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * One glass shard: a thin, slightly bowed, irregular triangle with real
 * thickness, about a metre across — scaled down per instance.
 */
export function createShardGeometry() {
  const pos = [];
  const t = 0.04;
  const A = [0, 0.55, 0.02];
  const B = [-0.38, -0.3, -0.03];
  const C = [0.45, -0.2, 0.05];
  const M = [0.02, 0.0, 0.09]; // bowed centre
  const off = (p, s) => [p[0], p[1], p[2] + s];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  // front and back faces, fanned round the bowed centre
  for (const [s, flip] of [
    [t, false],
    [-t, true]
  ]) {
    const a = off(A, s);
    const b = off(B, s);
    const c = off(C, s);
    const m = off(M, s);
    if (!flip) {
      tri(a, b, m);
      tri(b, c, m);
      tri(c, a, m);
    } else {
      tri(a, m, b);
      tri(b, m, c);
      tri(c, m, a);
    }
  }
  // edges
  const edge = (p, q) => {
    const p0 = off(p, t);
    const q0 = off(q, t);
    const p1 = off(p, -t);
    const q1 = off(q, -t);
    tri(p0, p1, q1);
    tri(p0, q1, q0);
  };
  edge(A, B);
  edge(B, C);
  edge(C, A);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** The falling column of sand: an open tube hanging from y = 0 to y = −1. */
export function createStreamGeometry() {
  const geometry = new CylinderGeometry(1, 1, 1, 12, 24, true);
  geometry.translate(0, -0.5, 0);
  return geometry;
}
