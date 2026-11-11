// Geometry kernel for code-built costumes.
//
// Everything a hero wears is emitted into one Bag: positions in the body's bind space, a colour, a material
// triple (roughness, metalness, kind) and up to four bone weights per vertex. The Bag becomes one skinned
// BufferGeometry, so a whole costume is a single draw call driven by the body's own skeleton.
import { BufferAttribute, BufferGeometry, Color, Vector3 } from 'three';

export const TAU = Math.PI * 2;
export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (from, to, value) => { const t = clamp((value - from) / (to - from), 0, 1); return t * t * (3 - 2 * t); };
export const V = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);

/** Deterministic random stream, so a recipe always builds the same hair and folds. */
export function rng(seed) {
  let s = 2166136261;
  for (const ch of String(seed)) { s ^= ch.charCodeAt(0); s = Math.imul(s, 16777619); }
  return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/** Monotone cubic through (x, y) knots: no overshoot, so a waist never bulges between two measurements. */
export function curve(knots) {
  const n = knots.length, xs = knots.map((k) => k[0]), ys = knots.map((k) => k[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0] ?? 0; m[n - 1] = d[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 2 * d[i - 1] * d[i] / (d[i - 1] + d[i]);
  return (x) => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/** Surface classes. `kind` selects the procedural detail in the costume shader (see material.js). */
export const MAT = {
  cloth: [.94, 0, 0], ceramic: [.84, 0, 1], leather: [.62, 0, 2], iron: [.5, .82, 3],
  skin: [.62, 0, 4], hair: [.42, 0, 5], hollow: [1, 0, 6], ember: [.7, 0, 7],
};

const SIDED = /\.([LR])$/;
const other = (name) => name.replace(SIDED, (_, side) => `.${side === 'L' ? 'R' : 'L'}`);
const a3 = new Vector3(), b3 = new Vector3(), c3 = new Vector3();

export class Bag {
  /** @param index bone name -> index in the skeleton the costume will be bound to */
  constructor(index) {
    this.index = index; this.mirror = false; this.part = '';
    this.position = []; this.normal = []; this.color = []; this.sm = []; this.skinIndex = []; this.skinWeight = []; this.tris = [];
    this.count = 0; this.parts = {};
  }
  vert(p, n, color, mat, skin) {
    const sx = this.mirror ? -1 : 1;
    this.position.push(p.x * sx, p.y, p.z); this.normal.push(n.x * sx, n.y, n.z);
    this.color.push(color.r, color.g, color.b); this.sm.push(mat[0], mat[1], mat[2]);
    const pairs = skin.filter((pair) => pair[1] > 1e-4).sort((x, y) => y[1] - x[1]).slice(0, 4);
    const total = pairs.reduce((sum, pair) => sum + pair[1], 0) || 1;
    for (let k = 0; k < 4; k++) {
      const pair = pairs[k], name = pair && (this.mirror ? other(pair[0]) : pair[0]);
      if (pair && this.index[name] === undefined) throw new Error(`costume part "${this.part}" is weighted to unknown bone "${name}"`);
      this.skinIndex.push(pair ? this.index[name] : 0); this.skinWeight.push(pair ? pair[1] / total : 0);
    }
    return this.count++;
  }
  tri(a, b, c) {
    if (this.mirror) this.tris.push(a, c, b); else this.tris.push(a, b, c);
    this.parts[this.part] = (this.parts[this.part] ?? 0) + 1;
  }
  /**
   * A (nu x nv) quad sheet. fn(u, v) returns { p, skin, n?, c? } for u, v in 0..1. With `closeU` the sheet wraps
   * around u (a tube). Normals are taken from fn, or computed smooth across the sheet. `inside` (a point, or a
   * function of the vertex) orients the sheet so its front faces away from that point.
   */
  grid(nu, nv, fn, o = {}) {
    nu = Math.max(o.closeU ? 3 : 1, Math.round(nu)); nv = Math.max(1, Math.round(nv));
    const cols = o.closeU ? nu : nu + 1, rows = nv + 1, P = [], given = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const r = fn(i / nu, j / nv); P.push({ p: r.p.clone(), skin: r.skin, c: r.c ?? o.color, n: r.n?.clone() }); given.push(!!r.n); }
    const at = (i, j) => j * cols + (o.closeU ? ((i % cols) + cols) % cols : i);
    const quads = [];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { if (o.skip?.((i + .5) / nu, (j + .5) / nv)) continue; quads.push([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]); }
    if (!given.every(Boolean)) {
      for (const v of P) v.n = new Vector3();
      for (const [a, b, c, d] of quads) {
        a3.subVectors(P[c].p, P[a].p); b3.subVectors(P[d].p, P[b].p); c3.crossVectors(a3, b3);
        P[a].n.add(c3); P[b].n.add(c3); P[c].n.add(c3); P[d].n.add(c3);
      }
      for (const v of P) if (v.n.lengthSq() > 0) v.n.normalize(); else v.n.set(0, 1, 0);
      let flip = !!o.flip;
      if (o.inside) {
        let facing = 0;
        for (const v of P) { const q = typeof o.inside === 'function' ? o.inside(v.p) : o.inside; facing += v.n.x * (v.p.x - q.x) + v.n.y * (v.p.y - q.y) + v.n.z * (v.p.z - q.z); }
        if (facing < 0) flip = !flip;
      }
      if (flip) { for (const v of P) v.n.negate(); for (const q of quads) q.reverse(); }
    }
    const ids = P.map((v) => this.vert(v.p, v.n, v.c, o.mat, typeof v.skin === 'function' ? v.skin(v.p) : v.skin));
    for (const [a, b, c, d] of quads) {
      // Supplied normals decide which way a quad faces; computed ones already agree with their winding.
      a3.subVectors(P[c].p, P[a].p); b3.subVectors(P[d].p, P[b].p); c3.crossVectors(a3, b3);
      const agree = c3.dot(P[a].n) + c3.dot(P[b].n) + c3.dot(P[c].n) + c3.dot(P[d].n) >= 0;
      if (agree) { this.tri(ids[a], ids[b], ids[c]); this.tri(ids[a], ids[c], ids[d]); } else { this.tri(ids[a], ids[c], ids[b]); this.tri(ids[a], ids[d], ids[c]); }
    }
  }
  /**
   * A hard-surface shape ({ verts: [{ p, n }], quads }) in its own frame, put on the body by `place` (any smooth
   * map from the shape's frame to bind space: a bone frame, or a wrap around the trunk or a limb).
   */
  solid(shape, place, skin, color, mat) {
    const eps = 1e-3, t1 = new Vector3(), t2 = new Vector3(), w0 = new Vector3(), w1 = new Vector3(), w2 = new Vector3(), q = new Vector3();
    const P = shape.verts.map(({ p, n }) => {
      t1.set(n.y, n.z, n.x).cross(n); if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0).cross(n); t1.normalize(); t2.crossVectors(n, t1);
      w0.copy(place(q.copy(p))); w1.copy(place(q.copy(p).addScaledVector(t1, eps))).sub(w0); w2.copy(place(q.copy(p).addScaledVector(t2, eps))).sub(w0);
      return { p: w0.clone(), n: new Vector3().crossVectors(w1, w2).normalize() };
    });
    const ids = P.map((v) => this.vert(v.p, v.n, color, mat, typeof skin === 'function' ? skin(v.p) : skin));
    for (const [a, b, c, d] of shape.quads) {
      a3.subVectors(P[c].p, P[a].p); b3.subVectors(P[d].p, P[b].p); c3.crossVectors(a3, b3);
      const agree = c3.dot(P[a].n) + c3.dot(P[b].n) + c3.dot(P[c].n) + c3.dot(P[d].n) >= 0;
      if (agree) { this.tri(ids[a], ids[b], ids[c]); this.tri(ids[a], ids[c], ids[d]); } else { this.tri(ids[a], ids[c], ids[b]); this.tri(ids[a], ids[d], ids[c]); }
    }
  }
  get triangles() { return this.tris.length / 3; }
  geometry() {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.position), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(this.normal), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.color), 3));
    geometry.setAttribute('sm', new BufferAttribute(new Float32Array(this.sm), 3));
    geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(this.skinIndex), 4));
    geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array(this.skinWeight), 4));
    geometry.setIndex(new BufferAttribute(this.count > 65535 ? new Uint32Array(this.tris) : new Uint16Array(this.tris), 1));
    geometry.computeBoundingSphere(); geometry.computeBoundingBox();
    return geometry;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Hard-surface shapes, each in its own frame with analytic normals.

/** Box with rounded edges: flat faces, true bevel highlights. Half-extents hx, hy, hz; edge radius r. */
export function roundBox(hx, hy, hz, r = .004) {
  r = Math.min(r, hx, hy, hz); const h = [hx, hy, hz], verts = [], quads = [];
  const line = (half) => [-half, -half + r, half - r, half];
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const u = (axis + 1) % 3, w = (axis + 2) % 3, us = line(h[u]), ws = line(h[w]), start = verts.length;
    for (const b of ws) for (const a of us) {
      const p = [0, 0, 0]; p[axis] = sign * h[axis]; p[u] = a; p[w] = b;
      const q = p.map((value, k) => clamp(value, -(h[k] - r), h[k] - r)), d = new Vector3(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      if (d.lengthSq() > 0) d.normalize(); else d.setComponent(axis, sign);
      verts.push({ p: new Vector3(q[0], q[1], q[2]).addScaledVector(d, r), n: d });
    }
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) quads.push([start + j * 4 + i, start + j * 4 + i + 1, start + (j + 1) * 4 + i + 1, start + (j + 1) * 4 + i]);
  }
  return { verts, quads };
}

/** Plain box with flat faces, for details too small to carry a bevel. */
export function box(hx, hy, hz) {
  const h = [hx, hy, hz], verts = [], quads = [];
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const u = (axis + 1) % 3, w = (axis + 2) % 3, start = verts.length, n = new Vector3().setComponent(axis, sign);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = [0, 0, 0]; p[axis] = sign * h[axis]; p[u] = a * h[u]; p[w] = b * h[w]; verts.push({ p: new Vector3(...p), n }); }
    quads.push([start, start + 1, start + 2, start + 3]);
  }
  return { verts, quads };
}

/** Round bar along Y, radius r, half-length h, with domed ends. */
export function bar(r, h, sides = 8) {
  const verts = [], quads = [], rings = [[-h - r * .55, .55, -.83], [-h, 1, 0], [h, 1, 0], [h + r * .55, .55, .83]];
  for (const [y, k, ny] of rings) for (let i = 0; i < sides; i++) { const a = i / sides * TAU, c = Math.cos(a), s = Math.sin(a), nr = Math.sqrt(1 - ny * ny); verts.push({ p: V(c * r * k, y, s * r * k), n: V(c * nr, ny, s * nr) }); }
  for (let j = 0; j < 3; j++) for (let i = 0; i < sides; i++) quads.push([j * sides + i, j * sides + (i + 1) % sides, (j + 1) * sides + (i + 1) % sides, (j + 1) * sides + i]);
  for (const [ring, y, ny] of [[0, -h - r * .6, -1], [3, h + r * .6, 1]]) { const centre = verts.length; verts.push({ p: V(0, y, 0), n: V(0, ny, 0) }); for (let i = 0; i < sides; i++) quads.push([centre, ring * sides + i, ring * sides + (i + 1) % sides, centre]); }
  return { verts, quads };
}

/** Ring (torus) in the XY plane: major radius R (rx, ry for an oval or D-ring), tube radius r. */
export function ring(rx, ry, r, segments = 18, sides = 6) {
  const verts = [], quads = [];
  for (let i = 0; i < segments; i++) for (let j = 0; j < sides; j++) {
    const a = i / segments * TAU, b = j / sides * TAU, out = V(Math.cos(a), Math.sin(a), 0), n = out.clone().multiplyScalar(Math.cos(b)).add(V(0, 0, Math.sin(b)));
    verts.push({ p: V(Math.cos(a) * rx, Math.sin(a) * ry, 0).addScaledVector(n, r), n });
  }
  for (let i = 0; i < segments; i++) for (let j = 0; j < sides; j++) quads.push([i * sides + j, ((i + 1) % segments) * sides + j, ((i + 1) % segments) * sides + (j + 1) % sides, i * sides + (j + 1) % sides]);
  return { verts, quads };
}

/** Low dome (rivet head, stud) sitting on the XY plane, bulging toward +Z. */
export function dome(r, height = r * .6, sides = 8) {
  const verts = [], quads = [];
  for (const [k, z] of [[1, 0], [.72, .7], [0, 1]]) for (let i = 0; i < sides; i++) { const a = i / sides * TAU; verts.push({ p: V(Math.cos(a) * r * k, Math.sin(a) * r * k, z * height), n: V(Math.cos(a) * k, Math.sin(a) * k, .35 + z).normalize() }); }
  for (let j = 0; j < 2; j++) for (let i = 0; i < sides; i++) quads.push([j * sides + i, j * sides + (i + 1) % sides, (j + 1) * sides + (i + 1) % sides, (j + 1) * sides + i]);
  return { verts, quads };
}

/** Move a shape inside its own frame before placing it. */
export function moved(shape, offset, turn = null) {
  return { quads: shape.quads, verts: shape.verts.map(({ p, n }) => ({ p: (turn ? p.clone().applyQuaternion(turn) : p.clone()).add(offset), n: turn ? n.clone().applyQuaternion(turn) : n })) };
}

/** A rigid frame as a place() map: origin plus three orthonormal axes. */
export function frame(origin, x, y, z = new Vector3().crossVectors(x, y)) {
  return (p) => new Vector3().copy(origin).addScaledVector(x, p.x).addScaledVector(y, p.y).addScaledVector(z, p.z);
}

export const colour = (hex) => new Color(hex);
