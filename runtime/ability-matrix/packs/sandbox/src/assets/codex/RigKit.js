import { BufferGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';

/**
 * RigKit — the procedural toolbox behind the pure-element Codex rigs.
 *
 * Every pure-element cast owns two authored pieces of geometry (see
 * `<Cast>Geometry.js`): a small **piece** thrown many times through an
 * InstancedMesh, and one larger **hero** that stands, drops or rides at the
 * heart of the cast. Both are built here, from the same handful of solids
 * (lathe, loft, prism, tube, ribbon, blade, crystal), placed with a transform
 * stack and grouped into **parts**.
 *
 * A part is the unit of articulation. It carries a pivot, a hinge axis, a
 * swing angle, a start delay and a stage (0 = deploys with the rise, 1 = with
 * the beat); the detail vertex shader folds it about its pivot as the cast
 * progresses. So a cage's bars close, a lotus' petals open and a gimbal's
 * rings turn without one matrix being touched on the CPU.
 *
 * Output is non-indexed (every face is its own triangle pair) with:
 *
 *   - `normal`  flat by default; a part can ask for a crease angle and get
 *               smoothed normals where faces meet more gently than that
 *   - `aEdge`   vec3, per-vertex distance to each *real* edge. The diagonal of
 *               a quad is never real, so the shader can draw clean arrises
 *   - `aInfo`   vec4: part, face, delay, stage
 *   - `aStyle`  vec3: edge strength, glow weight (hot core parts), span 0..1
 *   - `aPivot`  vec3, `aHinge` vec4 (axis xyz, swing radians)
 *
 * Conventions. +Y is up the piece. Rings and polygons run counter-clockwise as
 * (x, z) = (cos a, sin a), which makes lofts face outward; the builder flips a
 * triangle back out if a mirroring transform inverted it. The shader lights
 * both sides of a face, so a reversed sheet still reads.
 */

export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Deterministic random in [0, 1): mulberry32. Rigs never touch Math.random. */
export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Regular polygon as [x, z] pairs, counter-clockwise. */
export function ngon(n, r = 1, phase = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * TAU;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

/** Star polygon: alternating outer and inner radii. */
export function star(points, outer = 1, inner = 0.5, phase = 0) {
  const out = [];
  for (let i = 0; i < points * 2; i++) {
    const a = phase + (i / (points * 2)) * TAU;
    const r = i % 2 === 0 ? outer : inner;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

/**
 * Annular sector as an [x, z] outline, counter-clockwise: outer arc a0 -> a1,
 * then the inner arc back. Angles run (cos, sin), so PI / 2 faces +Z.
 */
export function arcBand(a0, a1, r0, r1, steps = 8, wobble = null) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const a = lerp(a0, a1, i / steps);
    const r = r1 * (wobble ? wobble(i, steps, true) : 1);
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (let i = steps; i >= 0; i--) {
    const a = lerp(a0, a1, i / steps);
    const r = r0 * (wobble ? wobble(i, steps, false) : 1);
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

/** Catmull-Rom through points: returns a function t in [0, 1] -> [x, y, z]. */
export function curve(points, closed = false) {
  const n = points.length;
  const at = (i) => {
    if (closed) return points[((i % n) + n) % n];
    return points[Math.max(0, Math.min(n - 1, i))];
  };
  return (t) => {
    const span = closed ? n : n - 1;
    const f = clamp(t) * span;
    const i = Math.min(Math.floor(f), span - 1);
    const u = f - i;
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const out = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u * u + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u * u * u);
    }
    return out;
  };
}

/** Circle or arc in the XZ plane at height y. */
export function arcPath(radius, a0 = 0, a1 = TAU, y = 0) {
  return (t) => {
    const a = lerp(a0, a1, t);
    return [Math.cos(a) * radius, y, Math.sin(a) * radius];
  };
}

/** Helix about +Y: radius r0 -> r1, `turns` turns, rising `height`. */
export function helixPath(r0, r1, turns, height, y0 = 0, phase = 0) {
  return (t) => {
    const a = phase + t * turns * TAU;
    const r = lerp(r0, r1, t);
    return [Math.cos(a) * r, y0 + t * height, Math.sin(a) * r];
  };
}

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _n = new Vector3();
const _e = new Euler();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();

const norm3 = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export class RigBuilder {
  constructor(name = 'rig') {
    this.name = name;
    this.positions = [];
    this.normals = [];
    this.edges = [];
    this.info = [];
    this.style = [];
    this.pivots = [];
    this.hinges = [];
    this.creases = [];
    this.stack = [new Matrix4()];
    this.partId = 0;
    this.faceId = 0;
    this.started = false;
    this.cur = null;
    this.userData = {};
    this.part();
  }

  get m() {
    return this.stack[this.stack.length - 1];
  }

  get triangles() {
    return this.positions.length / 9;
  }

  /** How the hero is sized by the cast: 'ring' follows the circle, 'mass' does not. */
  fit(kind) {
    this.userData.fit = kind;
    return this;
  }

  /**
   * Run `fn` inside a transform. `p` position, `r` Euler radians about X, Y
   * and Z (composed Y * X * Z, so a yaw never fights a pitch), `s` scale
   * (number or vector).
   */
  at(t, fn) {
    const p = t.p ?? [0, 0, 0];
    const r = t.r ?? [0, 0, 0];
    const s = typeof t.s === 'number' ? [t.s, t.s, t.s] : (t.s ?? [1, 1, 1]);
    _e.set(r[0], r[1], r[2], 'YXZ');
    _q.setFromEuler(_e);
    const local = new Matrix4().compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
    this.stack.push(this.m.clone().multiply(local));
    fn();
    this.stack.pop();
    return this;
  }

  /** Build a +Y solid pointing along +Z instead (the forward axis of a line cast). */
  aimZ(fn) {
    return this.at({ r: [PI / 2, 0, 0] }, fn);
  }

  /** `n` placements: `place(i, t)` returns a transform, `fn(i, t)` builds in it. */
  repeat(n, place, fn) {
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      this.at(place(i, t), () => fn(i, t));
    }
    return this;
  }

  /** `n` placements around +Y. Local +Z points outward, +X is tangential. */
  ring(n, radius, fn, o = {}) {
    const phase = o.phase ?? 0;
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * TAU;
      this.at({ p: [Math.cos(a) * radius, o.y ?? 0, Math.sin(a) * radius], r: [0, PI / 2 - a, 0], s: o.s }, () => fn(i, i / n, a));
    }
    return this;
  }

  /**
   * Begin a part. Pivot and axis are in the current local frame.
   * `swing` radians of fold at full articulation, `delay` 0..0.5 of the rise,
   * `stage` 0 rise / 1 beat, `edge` arris strength, `glow` hot-core weight,
   * `crease` degrees below which neighbouring faces are smoothed together.
   */
  part(o = {}) {
    if (this.started) this.partId++;
    this.started = false;
    this.faceId = 0;
    const pivot = this.m.clone();
    const pv = new Vector3(...(o.pivot ?? [0, 0, 0])).applyMatrix4(pivot);
    const ax = new Vector3(...(o.axis ?? [0, 1, 0])).transformDirection(pivot);
    this.cur = {
      pivot: [pv.x, pv.y, pv.z],
      axis: [ax.x, ax.y, ax.z],
      swing: o.swing ?? 0,
      delay: o.delay ?? 0,
      stage: o.stage ?? 0,
      edge: o.edge ?? 1,
      glow: o.glow ?? 0,
      crease: o.crease ? Math.cos((o.crease * PI) / 180) : 2
    };
    return this;
  }

  /* ------------------------------------------------------------------ */
  /* Triangles                                                           */
  /* ------------------------------------------------------------------ */

  _emit(p0, p1, p2, mask) {
    const m = this.m;
    const v0 = _a.set(p0[0], p0[1], p0[2]).applyMatrix4(m).toArray();
    let v1 = _b.set(p1[0], p1[1], p1[2]).applyMatrix4(m).toArray();
    let v2 = _c.set(p2[0], p2[1], p2[2]).applyMatrix4(m).toArray();
    let k = mask;
    if (m.determinant() < 0) {
      const t = v1;
      v1 = v2;
      v2 = t;
      k = [mask[0], mask[2], mask[1]];
    }
    const nrm = cross3(sub3(v1, v0), sub3(v2, v0));
    const area = Math.hypot(nrm[0], nrm[1], nrm[2]);
    if (area < 1e-10) return;
    const n = [nrm[0] / area, nrm[1] / area, nrm[2] / area];
    const cur = this.cur;
    this.started = true;
    const verts = [v0, v1, v2];
    for (let j = 0; j < 3; j++) {
      this.positions.push(verts[j][0], verts[j][1], verts[j][2]);
      this.normals.push(n[0], n[1], n[2]);
      this.edges.push(k[0] ? (j === 0 ? 1 : 0) : 1, k[1] ? (j === 1 ? 1 : 0) : 1, k[2] ? (j === 2 ? 1 : 0) : 1);
      this.info.push(this.partId, this.faceId, cur.delay, cur.stage);
      this.style.push(cur.edge, cur.glow, 0);
      this.pivots.push(cur.pivot[0], cur.pivot[1], cur.pivot[2]);
      this.hinges.push(cur.axis[0], cur.axis[1], cur.axis[2], cur.swing);
      this.creases.push(cur.crease);
    }
  }

  tri(a, b, c, mask = [1, 1, 1]) {
    this._emit(a, b, c, mask);
    this.faceId++;
    return this;
  }

  /** Quad a-b-c-d, counter-clockwise from the front. The diagonal is hidden. */
  quad(a, b, c, d) {
    this._emit(a, b, c, [1, 0, 1]);
    this._emit(a, c, d, [1, 1, 0]);
    this.faceId++;
    return this;
  }

  /**
   * Any simple planar polygon, ear-clipped so concave outlines (stars,
   * crenels, arcs) fill correctly. Only the boundary is drawn.
   */
  poly(points) {
    const n = points.length;
    if (n < 3) return this;
    // Project onto the plane's dominant axis, keeping the winding.
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    let flat;
    if (ax >= ay && ax >= az) flat = points.map((p) => (nx > 0 ? [p[1], p[2]] : [p[2], p[1]]));
    else if (ay >= az) flat = points.map((p) => (ny > 0 ? [p[2], p[0]] : [p[0], p[2]]));
    else flat = points.map((p) => (nz > 0 ? [p[0], p[1]] : [p[1], p[0]]));
    let area = 0;
    for (let i = 0; i < n; i++) {
      const a = flat[i];
      const b = flat[(i + 1) % n];
      area += a[0] * b[1] - b[0] * a[1];
    }
    const sign = area >= 0 ? 1 : -1;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const inside = (p, a, b, c) => cross(a, b, p) * sign > 1e-12 && cross(b, c, p) * sign > 1e-12 && cross(c, a, p) * sign > 1e-12;
    const idx = points.map((_, i) => i);
    let guard = n * n + 8;
    while (idx.length > 3 && guard-- > 0) {
      let clipped = false;
      for (let k = 0; k < idx.length; k++) {
        const ia = idx[(k + idx.length - 1) % idx.length];
        const ib = idx[k];
        const ic = idx[(k + 1) % idx.length];
        if (cross(flat[ia], flat[ib], flat[ic]) * sign <= 1e-12) continue;
        let ear = true;
        for (const j of idx) {
          if (j !== ia && j !== ib && j !== ic && inside(flat[j], flat[ia], flat[ib], flat[ic])) {
            ear = false;
            break;
          }
        }
        if (!ear) continue;
        this._emitEar(points, n, ia, ib, ic);
        idx.splice(k, 1);
        clipped = true;
        break;
      }
      if (!clipped) break;
    }
    if (idx.length === 3) this._emitEar(points, n, idx[0], idx[1], idx[2]);
    this.faceId++;
    return this;
  }

  _emitEar(points, n, a, b, c) {
    const real = (i, j) => (Math.abs(i - j) === 1 || Math.abs(i - j) === n - 1 ? 1 : 0);
    this._emit(points[a], points[b], points[c], [real(b, c), real(c, a), real(a, b)]);
  }

  /* ------------------------------------------------------------------ */
  /* Solids                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Connect rings (arrays of [x, y, z] of equal length) with quads.
   * `close` joins each ring's last point to its first; `loop` joins the last
   * ring back to the first (a torus). Caps are optional polygons.
   */
  loft(rings, o = {}) {
    const close = o.close ?? true;
    const n = rings[0].length;
    const last = o.loop ? rings.length : rings.length - 1;
    for (let i = 0; i < last; i++) {
      const A = rings[i];
      const B = rings[(i + 1) % rings.length];
      const span = close ? n : n - 1;
      for (let j = 0; j < span; j++) {
        const k = (j + 1) % n;
        if (o.flip) this.quad(A[j], A[k], B[k], B[j]);
        else this.quad(A[j], B[j], B[k], A[k]);
      }
    }
    if (o.capA) this.poly(o.flip ? [...rings[0]].reverse() : rings[0]);
    if (o.capB) this.poly(o.flip ? rings[rings.length - 1] : [...rings[rings.length - 1]].reverse());
    return this;
  }

  /**
   * Solid of revolution about +Y. `profile` rows are [radius, y] or
   * [radius, y, ex, ez] (an elliptical ring). `jag(i, j)` scales one vertex.
   */
  lathe(profile, sides = 8, o = {}) {
    const phase = o.phase ?? 0;
    const twist = o.twist ?? 0;
    const rings = profile.map(([r, y, ex = 1, ez = 1], i) => {
      const ring = [];
      for (let j = 0; j < sides; j++) {
        const a = phase + (j / sides) * TAU + twist * y;
        const jr = o.jag ? o.jag(i, j) : 1;
        const sk = o.skew ? o.skew(y) : [0, 0];
        ring.push([Math.cos(a) * r * ex * (o.ex ?? 1) * jr + sk[0], y, Math.sin(a) * r * ez * (o.ez ?? 1) * jr + sk[1]]);
      }
      return ring;
    });
    const cap = o.cap ?? true;
    return this.loft(rings, { capA: cap && profile[0][0] > 1e-6, capB: cap && profile[profile.length - 1][0] > 1e-6, flip: o.flip });
  }

  /** Straight or tapering extrusion of a polygon ([x, z] pairs) from y0 to y1. */
  prism(poly, y0, y1, o = {}) {
    const taper = o.taper ?? 1;
    const tx = Array.isArray(taper) ? taper[0] : taper;
    const tz = Array.isArray(taper) ? taper[1] : taper;
    const twist = o.twist ?? 0;
    const off = o.offset ?? [0, 0];
    const bottom = poly.map(([x, z]) => [x, y0, z]);
    const top = poly.map(([x, z]) => {
      const sx = x * tx;
      const sz = z * tz;
      const c = Math.cos(twist);
      const s = Math.sin(twist);
      return [sx * c - sz * s + off[0], y1, sx * s + sz * c + off[1]];
    });
    const cap = o.cap ?? true;
    return this.loft([bottom, top], { capA: cap, capB: cap && (tx > 1e-6 || tz > 1e-6), flip: o.flip });
  }

  /** Box standing on y = 0 (centered with o.center). Taper scales the top. */
  box(w, h, d, o = {}) {
    const y0 = o.center ? -h / 2 : 0;
    const poly = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
    return this.prism(poly, y0, y0 + h, o);
  }

  pyramid(sides, r, h, o = {}) {
    return this.lathe([[r, 0], [0, h]], sides, o);
  }

  /** Straight faceted cylinder (or frustum with r1) standing on y = 0. */
  cylinder(r, h, sides = 8, o = {}) {
    return this.lathe([[r, 0], [o.r1 ?? r, h]], sides, o);
  }

  /** Low-poly ball, centred on the origin; `ex`, `ey`, `ez` stretch it. */
  orb(r, o = {}) {
    const { sides = 8, rings = 4, ex = 1, ey = 1, ez = 1 } = o;
    const profile = [];
    for (let i = 0; i <= rings; i++) {
      const t = (i / rings) * PI;
      profile.push([Math.sin(t) * r, -Math.cos(t) * r * ey]);
    }
    return this.lathe(profile, sides, { ...o, ex, ez });
  }

  /**
   * A natural crystal: a prism whose alternate faces run broad and narrow,
   * closed by a pyramidal termination. Base at y = 0, apex at y = h.
   */
  crystal(o = {}) {
    const { r = 0.2, h = 1, sides = 6, tip = 0.3, asym = 0.2, foot = 0, taper = 0.92, phase = 0 } = o;
    const shoulder = h * (1 - tip);
    const profile = [[r * 0.8, -foot], [r, 0], [r * taper, shoulder], [0, h]];
    return this.lathe(profile, sides, {
      phase,
      jag: (i, j) => (i === 3 ? 1 : 1 + (j % 2 ? -1 : 1) * asym),
      skew: o.skew
    });
  }

  /**
   * A blade along +Y: a diamond cross-section whose width follows `shape(t)`,
   * bent toward +Z, optionally serrated. Base at y = 0, tip at y = len.
   */
  blade(o = {}) {
    const { len = 1, w = 0.2, thick = 0.04, bend = 0, segs = 8, serrate = 0, twist = 0, shape = (t) => Math.sin(Math.PI * Math.pow(t, 0.65)) * (1 - 0.15 * t) } = o;
    const rings = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const saw = serrate && i % 2 === 1 ? 1 - serrate : 1;
      const width = i === segs ? 0 : w * Math.max(0.0, shape(t)) * saw;
      const th = thick * (1 - 0.65 * t) * (i === segs ? 0 : 1);
      const a = twist * t;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const pts = [[width, 0], [0, th], [-width, 0], [0, -th]].map(([x, z]) => [x * c - z * s, len * t, x * s + z * c + bend * t * t * len]);
      rings.push(pts);
    }
    return this.loft(rings);
  }

  /**
   * A sheet along `path` (t -> [x, y, z]). `w` is a width or fn(t); `twist`
   * radians total or fn(t); `thick` gives the sheet a flat edge-on section.
   */
  ribbon(path, o = {}) {
    const { segs = 24, up = [0, 1, 0], thick = 0 } = o;
    const width = typeof o.w === 'function' ? o.w : () => o.w ?? 0.2;
    const twist = typeof o.twist === 'function' ? o.twist : (t) => (o.twist ?? 0) * t;
    const rings = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const P = path(t);
      const T = norm3(sub3(path(Math.min(1, t + 0.01)), path(Math.max(0, t - 0.01))));
      let B = cross3(up, T);
      if (Math.hypot(B[0], B[1], B[2]) < 1e-3) B = cross3([1, 0, 0], T);
      B = norm3(B);
      const N = norm3(cross3(T, B));
      const a = twist(t);
      const c = Math.cos(a);
      const s = Math.sin(a);
      const Bt = [B[0] * c + N[0] * s, B[1] * c + N[1] * s, B[2] * c + N[2] * s];
      const Nt = [N[0] * c - B[0] * s, N[1] * c - B[1] * s, N[2] * c - B[2] * s];
      const hw = width(t) / 2;
      const L = [P[0] - Bt[0] * hw, P[1] - Bt[1] * hw, P[2] - Bt[2] * hw];
      const R = [P[0] + Bt[0] * hw, P[1] + Bt[1] * hw, P[2] + Bt[2] * hw];
      if (thick > 0) {
        rings.push([L, [P[0] + Nt[0] * thick, P[1] + Nt[1] * thick, P[2] + Nt[2] * thick], R, [P[0] - Nt[0] * thick, P[1] - Nt[1] * thick, P[2] - Nt[2] * thick]]);
      } else {
        rings.push([L, R]);
      }
    }
    return this.loft(rings, { close: thick > 0, flip: o.flip });
  }

  /**
   * A tube along `path` with parallel-transport frames. `r` is a radius or
   * fn(t). `sides` 4 gives a square beam. `closed` joins the ends (a ring).
   */
  tube(path, o = {}) {
    const { sides = 6, segs = 24, caps = true, closed = false, phase = 0 } = o;
    const radius = typeof o.r === 'function' ? o.r : () => o.r ?? 0.05;
    const rings = [];
    let N = null;
    const count = closed ? segs : segs + 1;
    for (let i = 0; i < count; i++) {
      const t = i / segs;
      const P = path(t);
      const T = norm3(sub3(path(Math.min(1, t + 0.005)), path(Math.max(0, t - 0.005))));
      if (!N) {
        N = cross3(T, Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
        N = norm3(N);
      } else {
        const d = N[0] * T[0] + N[1] * T[1] + N[2] * T[2];
        N = norm3([N[0] - T[0] * d, N[1] - T[1] * d, N[2] - T[2] * d]);
      }
      const B = cross3(N, T);
      const rr = radius(t);
      const ring = [];
      for (let j = 0; j < sides; j++) {
        const a = phase + (j / sides) * TAU;
        const ca = Math.cos(a) * rr;
        const sa = Math.sin(a) * rr;
        ring.push([P[0] + N[0] * ca + B[0] * sa, P[1] + N[1] * ca + B[1] * sa, P[2] + N[2] * ca + B[2] * sa]);
      }
      rings.push(ring);
    }
    return this.loft(rings, { loop: closed, capA: caps && !closed && radius(0) > 1e-6, capB: caps && !closed && radius(1) > 1e-6, flip: o.flip });
  }

  /** Torus about +Y, in the XZ plane. `wob(i, j)` scales a ring vertex. */
  torus(R, r, o = {}) {
    const { segs = 24, sides = 6, arc = TAU, a0 = 0 } = o;
    const full = Math.abs(arc - TAU) < 1e-6;
    return this.tube(arcPath(R, a0, a0 + arc, 0), { r, sides, segs, closed: full, caps: !full, phase: o.phase ?? 0, flip: o.flip });
  }

  /**
   * Flat outline filled to a plate: `poly` is [x, z] pairs, thickness
   * `h`, standing on y = 0.
   */
  plate(poly, h, o = {}) {
    return this.prism(poly, 0, h, o);
  }

  /* ------------------------------------------------------------------ */
  /* Output                                                              */
  /* ------------------------------------------------------------------ */

  /** Smooth normals across faces that meet more gently than the part's crease. */
  _smooth() {
    const count = this.positions.length / 3;
    if (!this.creases.some((c) => c < 1.5)) return;
    const buckets = new Map();
    const key = (i) => {
      const x = Math.round(this.positions[i * 3] * 2000);
      const y = Math.round(this.positions[i * 3 + 1] * 2000);
      const z = Math.round(this.positions[i * 3 + 2] * 2000);
      return `${this.info[i * 4]}|${x}|${y}|${z}`;
    };
    for (let i = 0; i < count; i++) {
      if (this.creases[i] > 1.5) continue;
      const k = key(i);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(i);
    }
    const out = Float32Array.from(this.normals);
    for (const list of buckets.values()) {
      for (const i of list) {
        _n.set(0, 0, 0);
        const ni = [this.normals[i * 3], this.normals[i * 3 + 1], this.normals[i * 3 + 2]];
        for (const j of list) {
          const dot = ni[0] * this.normals[j * 3] + ni[1] * this.normals[j * 3 + 1] + ni[2] * this.normals[j * 3 + 2];
          if (dot >= this.creases[i]) _n.add(_c.set(this.normals[j * 3], this.normals[j * 3 + 1], this.normals[j * 3 + 2]));
        }
        if (_n.lengthSq() > 1e-9) {
          _n.normalize();
          out[i * 3] = _n.x;
          out[i * 3 + 1] = _n.y;
          out[i * 3 + 2] = _n.z;
        }
      }
    }
    this.normals = Array.from(out);
  }

  /**
   * `center` lifts the whole solid so its vertical middle sits on y = 0;
   * `fit` then scales it uniformly so its largest extent is that many units.
   * Both move the pivots with the vertices.
   */
  build(o = {}) {
    if (!this.positions.length) throw new Error(`${this.name}: empty rig`);
    this._smooth();
    const count = this.positions.length / 3;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], this.positions[i * 3 + k]);
        hi[k] = Math.max(hi[k], this.positions[i * 3 + k]);
      }
    }
    if (o.center || o.fit) {
      const mid = (lo[1] + hi[1]) / 2;
      const k = o.fit ? o.fit / Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) : 1;
      for (let i = 0; i < count; i++) {
        this.positions[i * 3] *= k;
        this.positions[i * 3 + 1] = (this.positions[i * 3 + 1] - mid) * k;
        this.positions[i * 3 + 2] *= k;
        this.pivots[i * 3] *= k;
        this.pivots[i * 3 + 1] = (this.pivots[i * 3 + 1] - mid) * k;
        this.pivots[i * 3 + 2] *= k;
      }
      lo[1] = (lo[1] - mid) * k;
      hi[1] = (hi[1] - mid) * k;
    }
    const y0 = lo[1];
    const y1 = hi[1];
    const span = Math.max(1e-6, y1 - y0);
    for (let i = 0; i < count; i++) this.style[i * 3 + 2] = (this.positions[i * 3 + 1] - y0) / span;
    const g = new BufferGeometry();
    g.name = this.name;
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    g.setAttribute('aEdge', new Float32BufferAttribute(this.edges, 3));
    g.setAttribute('aInfo', new Float32BufferAttribute(this.info, 4));
    g.setAttribute('aStyle', new Float32BufferAttribute(this.style, 3));
    g.setAttribute('aPivot', new Float32BufferAttribute(this.pivots, 3));
    g.setAttribute('aHinge', new Float32BufferAttribute(this.hinges, 4));
    g.userData = { ...this.userData, parts: this.partId + 1, triangles: this.triangles };
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}
