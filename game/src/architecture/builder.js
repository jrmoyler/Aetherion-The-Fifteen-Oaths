// Geometry accumulation for sanctuaries. Primitives are emitted straight into per-material
// buckets (merged into one Mesh per material per layer), with metre-scale UVs: planar faces
// are projected on their own tangent plane (no stretching on rotated walls, horizontal
// courses stay level), revolved shapes get arc-length UVs. Thin instances handle repeated
// modules. A "dry" builder only records big masses (for far skyline silhouettes).
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';

const TAU = Math.PI * 2;

/** Transform frame stack shared by builders, instancer and collider adapter. */
export class Frame {
  constructor() { this.stack = []; this.ox = 0; this.oy = 0; this.oz = 0; this.yaw = 0; this.c = 1; this.s = 0; }
  push(x = 0, y = 0, z = 0, ry = 0) {
    this.stack.push([this.ox, this.oy, this.oz, this.yaw]);
    const [wx, wz] = this.xz(x, z);
    this.ox = wx; this.oz = wz; this.oy += y; this.yaw += ry; this.c = Math.cos(this.yaw); this.s = Math.sin(this.yaw);
  }
  pop() { const [x, y, z, w] = this.stack.pop(); this.ox = x; this.oy = y; this.oz = z; this.yaw = w; this.c = Math.cos(w); this.s = Math.sin(w); }
  /** local (x,z) -> sanctuary frame (x,z) */
  xz(x, z) { return [this.ox + x * this.c + z * this.s, this.oz - x * this.s + z * this.c]; }
}

// rotation matrix rows for Ry * Rx * Rz (applied Rz, then Rx, then Ry)
function rotMat(rx, ry, rz) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // Rz
  const z = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  // Rx
  const x = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  // Ry (Babylon left-handed yaw: x' = x c + z s, z' = -x s + z c)
  const y = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const mul = (a, b) => [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
  return mul(y, mul(x, z));
}

// ---------------------------------------------------------------- polygon helpers
export function polyArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
/** Ear-clipping triangulation of a simple polygon; returns index triples. */
export function triangulate(pts) {
  const n = pts.length; if (n < 3) return [];
  const idx = []; const ccw = polyArea(pts) > 0;
  for (let i = 0; i < n; i++) idx.push(ccw ? i : n - 1 - i);
  const out = []; let guard = 0;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  while (idx.length > 3 && guard++ < 5000) {
    let ear = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length];
      const a = pts[i0], b = pts[i1], c = pts[i2];
      if (cross(a, b, c) <= 1e-9) continue;
      let ok = true;
      for (const j of idx) { if (j === i0 || j === i1 || j === i2) continue; if (inside(pts[j], a, b, c)) { ok = false; break; } }
      if (!ok) continue;
      out.push([i0, i1, i2]); idx.splice(i, 1); ear = true; break;
    }
    if (!ear) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

// ---------------------------------------------------------------- builder
export class Builder {
  /**
   * @param {Frame} F transform frame
   * @param {{dry?:boolean, sil?:Array, silMin?:number}} opts
   */
  constructor(F, opts = {}) {
    this.F = F; this.dry = !!opts.dry; this.sil = opts.sil || null; this.silMin = opts.silMin ?? 6;
    this.buckets = new Map(); this.verts = 0;
  }

  _bucket(mat) {
    let b = this.buckets.get(mat);
    if (!b) { b = { p: [], n: [], u: [], i: [] }; this.buckets.set(mat, b); }
    return b;
  }

  _sil(x, y, z, sx, sy, sz, yaw, mat) {
    if (!this.sil) return;
    if (Math.max(sx, sz) < this.silMin && sy < this.silMin * 1.2) return;
    const [wx, wz] = this.F.xz(x, z);
    this.sil.push({ x: wx, y: this.F.oy + y, z: wz, sx, sy, sz, yaw: this.F.yaw + yaw, mat });
  }

  /**
   * Core emit. pos/nrm local primitive arrays (flat xyz), uv null -> planar projection.
   * Rotation (rx,ry,rz) about primitive origin, then translate (x,y,z) in frame space.
   */
  emit(mat, pos, nrm, uv, idx, x, y, z, rx = 0, ry = 0, rz = 0) {
    const b = this._bucket(mat);
    const R = rotMat(rx, ry + this.F.yaw, rz);
    const [ox, oz] = this.F.xz(x, z); const oy = this.F.oy + y;
    const base = b.p.length / 3;
    const n = pos.length / 3;
    for (let k = 0; k < n; k++) {
      const px = pos[k * 3], py = pos[k * 3 + 1], pz = pos[k * 3 + 2];
      const qx = R[0] * px + R[1] * py + R[2] * pz + ox, qy = R[3] * px + R[4] * py + R[5] * pz + oy, qz = R[6] * px + R[7] * py + R[8] * pz + oz;
      const nx0 = nrm[k * 3], ny0 = nrm[k * 3 + 1], nz0 = nrm[k * 3 + 2];
      const nx = R[0] * nx0 + R[1] * ny0 + R[2] * nz0, ny = R[3] * nx0 + R[4] * ny0 + R[5] * nz0, nz = R[6] * nx0 + R[7] * ny0 + R[8] * nz0;
      b.p.push(qx, qy, qz); b.n.push(nx, ny, nz);
      if (uv) b.u.push(uv[k * 2], uv[k * 2 + 1]);
      else {
        // tangent-plane projection in metres
        if (Math.abs(ny) > 0.985) b.u.push(qx, qz);
        else {
          let tx = nz, tz = -nx; const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl; // T = up x n
          const bx = ny * tz, by = nz * tx - nx * tz, bz = -ny * tx; // B = n x T
          b.u.push(qx * tx + qz * tz, bx * qx + by * qy + bz * qz);
        }
      }
    }
    // indices with winding auto-correction (Babylon front face: cross(b-a,c-a) opposite to normal)
    const P = b.p, N = b.n;
    for (let t = 0; t < idx.length; t += 3) {
      const a = base + idx[t], c1 = base + idx[t + 1], c2 = base + idx[t + 2];
      const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      const ux = P[c1 * 3] - ax, uy = P[c1 * 3 + 1] - ay, uz = P[c1 * 3 + 2] - az;
      const vx = P[c2 * 3] - ax, vy = P[c2 * 3 + 1] - ay, vz = P[c2 * 3 + 2] - az;
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      const nx = N[a * 3] + N[c1 * 3] + N[c2 * 3], ny = N[a * 3 + 1] + N[c1 * 3 + 1] + N[c2 * 3 + 1], nz = N[a * 3 + 2] + N[c1 * 3 + 2] + N[c2 * 3 + 2];
      if (cx * nx + cy * ny + cz * nz > 0) b.i.push(a, c2, c1); else b.i.push(a, c1, c2);
    }
    this.verts += n;
  }

  // ------------------------------------------------------------ primitives
  /** Box with base at y (centre x,z). o: {ry, rx, rz, noBottom, noTop} */
  box(mat, x, y, z, sx, sy, sz, o = {}) {
    if (this.dry) { this._sil(x, y, z, sx, sy, sz, o.ry || 0, mat); return; }
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const P = [], N = [], I = [];
    const face = (nx, ny, nz, verts) => { const b = P.length / 3; for (const v of verts) { P.push(v[0], v[1], v[2]); N.push(nx, ny, nz); } I.push(b, b + 1, b + 2, b, b + 2, b + 3); };
    face(0, 0, 1, [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]);
    face(0, 0, -1, [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]);
    face(1, 0, 0, [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]]);
    face(-1, 0, 0, [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]]);
    if (!o.noTop) face(0, 1, 0, [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]]);
    if (!o.noBottom) face(0, -1, 0, [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]);
    this.emit(mat, P, N, null, I, x, y + hy, z, o.rx || 0, o.ry || 0, o.rz || 0);
  }

  /** Box between two points (beam / rail), square section w x h. */
  beam(mat, a, b, w, h = w) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const L = Math.hypot(dx, dy, dz); if (L < 1e-4) return;
    const ry = Math.atan2(dx, dz); const rx = -Math.atan2(dy, Math.hypot(dx, dz));
    this.box(mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - h / 2, (a[2] + b[2]) / 2, w, h, L, { ry, rx });
  }

  /** Cylinder / cone frustum, base at y. o: {ry, rx, rz, caps(true), arc(TAU), flat(false)} */
  cyl(mat, x, y, z, r0, r1, h, seg = 12, o = {}) {
    if (this.dry) { this._sil(x, y, z, Math.max(r0, r1) * 2, h, Math.max(r0, r1) * 2, 0, mat); return; }
    const arc = o.arc ?? TAU; const full = arc >= TAU - 1e-6;
    const P = [], N = [], U = [], I = [];
    const slope = (r0 - r1) / h; const nl = Math.hypot(1, slope);
    const rm = (r0 + r1) / 2;
    for (let i = 0; i <= seg; i++) {
      const a = (o.a0 || 0) + (i / seg) * arc; const ca = Math.sin(a), sa = Math.cos(a);
      P.push(ca * r0, 0, sa * r0, ca * r1, h, sa * r1);
      N.push(ca / nl, slope / nl, sa / nl, ca / nl, slope / nl, sa / nl);
      U.push(a * rm, 0, a * rm, Math.hypot(h, r0 - r1));
      if (i < seg) { const b = i * 2; I.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    if (o.caps !== false) {
      for (const [yy, r, ny] of [[h, r1, 1], [0, r0, -1]]) {
        if (r <= 1e-4) continue;
        const c = P.length / 3; P.push(0, yy, 0); N.push(0, ny, 0); U.push(0, 0);
        for (let i = 0; i <= seg; i++) { const a = (o.a0 || 0) + (i / seg) * arc; P.push(Math.sin(a) * r, yy, Math.cos(a) * r); N.push(0, ny, 0); U.push(Math.sin(a) * r, Math.cos(a) * r); }
        for (let i = 0; i < seg; i++) I.push(c, c + 1 + i, c + 2 + i);
      }
    }
    if (!full && o.caps !== false) {
      // close the arc ends
      for (const a of [(o.a0 || 0), (o.a0 || 0) + arc]) {
        const ca = Math.sin(a), sa = Math.cos(a); const nx = sa, nz = -ca;
        const b = P.length / 3;
        P.push(0, 0, 0, ca * r0, 0, sa * r0, ca * r1, h, sa * r1, 0, h, 0);
        for (let k = 0; k < 4; k++) N.push(nx, 0, nz);
        U.push(0, 0, r0, 0, r1, h, 0, h);
        I.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    }
    this.emit(mat, P, N, U, I, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0);
  }

  /** Revolved profile [[r,y],...] bottom->top. */
  lathe(mat, x, y, z, prof, seg = 16, o = {}) {
    if (this.dry) { let r = 0, h = 0; for (const [pr, py] of prof) { r = Math.max(r, pr); h = Math.max(h, py); } this._sil(x, y, z, r * 2, h, r * 2, 0, mat); return; }
    const P = [], N = [], U = [], I = [];
    const m = prof.length;
    // profile normals
    const pn = prof.map((p, k) => {
      const a = prof[Math.max(0, k - 1)], b = prof[Math.min(m - 1, k + 1)];
      const dr = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dr, dy) || 1; return [dy / l, -dr / l];
    });
    let acc = 0; const vlen = [0];
    for (let k = 1; k < m; k++) { acc += Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]); vlen.push(acc); }
    const rmax = Math.max(...prof.map((p) => p[0]));
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU; const ca = Math.sin(a), sa = Math.cos(a);
      for (let k = 0; k < m; k++) {
        P.push(ca * prof[k][0], prof[k][1], sa * prof[k][0]); N.push(ca * pn[k][0], pn[k][1], sa * pn[k][0]); U.push(a * rmax * 0.7, vlen[k]);
      }
    }
    for (let i = 0; i < seg; i++) for (let k = 0; k < m - 1; k++) { const a = i * m + k, b = (i + 1) * m + k; I.push(a, b, a + 1, a + 1, b, b + 1); }
    this.emit(mat, P, N, U, I, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0);
  }

  sphere(mat, x, y, z, r, seg = 12, o = {}) {
    const prof = []; const rings = Math.max(4, seg >> 1);
    const t0 = o.hemi ? 0 : -Math.PI / 2;
    for (let k = 0; k <= rings; k++) { const t = t0 + (k / rings) * (Math.PI / 2 - t0); prof.push([Math.max(0, Math.cos(t)) * r * (o.sx || 1), Math.sin(t) * r * (o.sy || 1)]); }
    this.lathe(mat, x, y, z, prof, seg, o);
  }

  /** Torus in local XZ plane (ring lying flat), o.rx = PI/2 stands it up. arc for partial. */
  torus(mat, x, y, z, R, r, seg = 24, segr = 6, o = {}) {
    if (this.dry) { this._sil(x, y - R, z, R * 2, R * 2, R * 2, o.ry || 0, mat); return; }
    const arc = o.arc ?? TAU; const P = [], N = [], U = [], I = [];
    for (let i = 0; i <= seg; i++) {
      const a = (o.a0 || 0) + (i / seg) * arc; const ca = Math.cos(a), sa = Math.sin(a);
      for (let j = 0; j <= segr; j++) {
        const b = (j / segr) * TAU; const cb = Math.cos(b), sb = Math.sin(b);
        P.push((R + r * cb) * ca, r * sb, (R + r * cb) * sa); N.push(cb * ca, sb, cb * sa); U.push(a * R, b * r);
      }
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < segr; j++) { const a = i * (segr + 1) + j, b = (i + 1) * (segr + 1) + j; I.push(a, b, a + 1, a + 1, b, b + 1); }
    this.emit(mat, P, N, U, I, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0);
  }

  /** Flat ring/annulus band in XZ plane at height y (thickness th, raised). */
  ring(mat, x, y, z, r0, r1, th = 0.02, seg = 64, o = {}) {
    if (this.dry) return;
    const arc = o.arc ?? TAU; const a0 = o.a0 || 0;
    const P = [], N = [], I = [];
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * arc; const ca = Math.sin(a), sa = Math.cos(a);
      P.push(ca * r0, th, sa * r0, ca * r1, th, sa * r1); N.push(0, 1, 0, 0, 1, 0);
      if (i < seg) { const b = i * 2; I.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    if (o.bottom) {
      const bb = P.length / 3;
      for (let i = 0; i <= seg; i++) {
        const a = a0 + (i / seg) * arc; const ca = Math.sin(a), sa = Math.cos(a);
        P.push(ca * r0, 0, sa * r0, ca * r1, 0, sa * r1); N.push(0, -1, 0, 0, -1, 0);
        if (i < seg) { const b = bb + i * 2; I.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
    }
    if (th > 0.03) {
      const b0 = P.length / 3;
      for (let i = 0; i <= seg; i++) {
        const a = a0 + (i / seg) * arc; const ca = Math.sin(a), sa = Math.cos(a);
        P.push(ca * r1, 0, sa * r1, ca * r1, th, sa * r1); N.push(ca, 0, sa, ca, 0, sa);
        if (i < seg) { const b = b0 + i * 2; I.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      }
      const b1 = P.length / 3;
      for (let i = 0; i <= seg; i++) {
        const a = a0 + (i / seg) * arc; const ca = Math.sin(a), sa = Math.cos(a);
        P.push(ca * r0, 0, sa * r0, ca * r0, th, sa * r0); N.push(-ca, 0, -sa, -ca, 0, -sa);
        if (i < seg) { const b = b1 + i * 2; I.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      }
    }
    this.emit(mat, P, N, null, I, x, y, z, 0, o.ry || 0, 0);
  }

  /** Disc (filled n-gon) lying in XZ at height y. */
  disc(mat, x, y, z, r, seg = 48, o = {}) {
    if (this.dry) { return; }
    const P = [0, 0, 0], N = [0, 1, 0], I = [];
    for (let i = 0; i <= seg; i++) { const a = (o.a0 || 0) + (i / seg) * TAU; P.push(Math.sin(a) * r, 0, Math.cos(a) * r); N.push(0, 1, 0); if (i < seg) I.push(0, i + 1, i + 2); }
    this.emit(mat, P, N, null, I, x, y, z, 0, o.ry || 0, 0);
  }

  /**
   * Prism: polygon pts [[x,z]] (any winding, simple) extruded from y to y+h. o.top/o.bottom/o.sides.
   * o.vertical: polygon is in local XY plane and extruded along Z by depth h, centred.
   */
  prism(mat, pts, x, y, z, h, o = {}) {
    if (this.dry) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [px, pz] of pts) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz); }
      if (o.vertical) this._sil(x + (x0 + x1) / 2, y + z0, z, x1 - x0, z1 - z0, h, o.ry || 0, mat);
      else this._sil(x + (x0 + x1) / 2, y, z + (z0 + z1) / 2, x1 - x0, h, z1 - z0, o.ry || 0, mat);
      return;
    }
    const tris = triangulate(pts); const n = pts.length;
    const P = [], N = [], I = [];
    const map = o.vertical ? (px, pz, yy) => [px, pz, yy - h / 2] : (px, pz, yy) => [px, yy, pz];
    const up = o.vertical ? [0, 0, 1] : [0, 1, 0];
    if (o.top !== false) { const b = P.length / 3; for (const [px, pz] of pts) { P.push(...map(px, pz, h)); N.push(...up); } for (const t of tris) I.push(b + t[0], b + t[1], b + t[2]); }
    if (o.bottom !== false) { const b = P.length / 3; for (const [px, pz] of pts) { P.push(...map(px, pz, 0)); N.push(-up[0], -up[1], -up[2]); } for (const t of tris) I.push(b + t[0], b + t[1], b + t[2]); }
    if (o.sides !== false) {
      const ccw = polyArea(pts) > 0;
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n];
        let ex = q[0] - p[0], ez = q[1] - p[1]; const l = Math.hypot(ex, ez) || 1; ex /= l; ez /= l;
        // outward normal of edge in polygon plane
        let nx = ez, nz = -ex; if (!ccw) { nx = -nx; nz = -nz; }
        const nn = o.vertical ? [nx, nz, 0] : [nx, 0, nz];
        const b = P.length / 3;
        P.push(...map(p[0], p[1], 0), ...map(q[0], q[1], 0), ...map(q[0], q[1], h), ...map(p[0], p[1], h));
        for (let k = 0; k < 4; k++) N.push(...nn);
        I.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    }
    this.emit(mat, P, N, null, I, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0);
  }

  /** Tube along a 3D polyline (frame-space points) with radius r (number or fn(t)). */
  tube(mat, pts, r, seg = 6, o = {}) {
    if (this.dry) return;
    const P = [], N = [], U = [], I = [];
    const m = pts.length; let acc = 0;
    let prevN = null;
    for (let k = 0; k < m; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(m - 1, k + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      // reference normal
      let rx = 0, ry = 1, rz = 0; if (Math.abs(ty) > 0.9) { rx = 1; ry = 0; }
      if (prevN) { rx = prevN[0]; ry = prevN[1]; rz = prevN[2]; }
      // n = normalize(ref - t*dot)
      const d = rx * tx + ry * ty + rz * tz; let nx = rx - tx * d, ny = ry - ty * d, nz = rz - tz * d; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      prevN = [nx, ny, nz];
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
      if (k > 0) acc += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1], pts[k][2] - pts[k - 1][2]);
      const rr = typeof r === 'function' ? r(k / (m - 1)) : r;
      for (let j = 0; j <= seg; j++) {
        const t = (j / seg) * TAU; const c = Math.cos(t), s = Math.sin(t);
        const ox = nx * c + bx * s, oy = ny * c + by * s, oz = nz * c + bz * s;
        P.push(pts[k][0] + ox * rr, pts[k][1] + oy * rr, pts[k][2] + oz * rr); N.push(ox, oy, oz); U.push(t * rr, acc);
      }
    }
    for (let k = 0; k < m - 1; k++) for (let j = 0; j < seg; j++) { const a = k * (seg + 1) + j, b = (k + 1) * (seg + 1) + j; I.push(a, b, a + 1, a + 1, b, b + 1); }
    this.emit(mat, P, N, U, I, 0, 0, 0);
  }

  /** Quad from 4 frame-space corners. o.double for two-sided, o.uv explicit [u0,v0,u1,v1]. */
  quad(mat, c, o = {}) {
    if (this.dry) return;
    const [a, b, cc, d] = c;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (o.flip) { nx = -nx; ny = -ny; nz = -nz; }
    const P = [...a, ...b, ...cc, ...d]; const N = [nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz];
    const uv = o.uv ? [o.uv[0], o.uv[1], o.uv[2], o.uv[1], o.uv[2], o.uv[3], o.uv[0], o.uv[3]] : null;
    this.emit(mat, P, N, uv, [0, 1, 2, 0, 2, 3], 0, 0, 0);
    if (o.double) this.emit(mat, P, [-nx, -ny, -nz, -nx, -ny, -nz, -nx, -ny, -nz, -nx, -ny, -nz], uv, [0, 1, 2, 0, 2, 3], 0, 0, 0);
  }

  /** Subdivided cloth sheet hanging from top edge: centre-top at (x,ytop,z), facing local -Z rotated by ry. UV 0..1 (v=1 top). */
  cloth(mat, x, ytop, z, w, h, ry = 0, sx = 4, sy = 8, o = {}) {
    if (this.dry) return;
    const P = [], N = [], U = [], I = [];
    const sag = o.sag || 0; const taper = o.taper ?? 0;
    for (let j = 0; j <= sy; j++) for (let i = 0; i <= sx; i++) {
      const u = i / sx, v = 1 - j / sy;
      let px = (u - 0.5) * w; let py = -j / sy * h;
      if (o.point && j === sy) px *= 0.0; // pointed tail
      if (taper) px *= 1 - taper * (1 - v);
      if (o.vcut && j === sy) py += Math.abs(u - 0.5) * 2 * (o.vcut) - o.vcut;
      const pz = sag * Math.sin(u * Math.PI) * 0;
      P.push(px, py, pz); N.push(0, 0, -1); U.push(u, v);
    }
    for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) { const a = j * (sx + 1) + i, b = a + sx + 1; I.push(a, a + 1, b, a + 1, b + 1, b); }
    this.emit(mat, P, N, U, I, x, ytop, z, 0, ry, 0);
  }

  /**
   * Wall with semicircular arched opening. Wall centred on x,z (width w along local X, depth d),
   * base at y, height h, opening width ow, opening height oh (to arch crown).
   */
  archWall(mat, x, y, z, w, h, d, ow, oh, o = {}) {
    const ry = o.ry || 0; const r = ow / 2; const spring = oh - r;
    if (this.dry) { this._sil(x, y, z, w, h, d, ry, mat); return; }
    this.F.push(x, y, z, ry);
    const pw = (w - ow) / 2;
    if (pw > 0.01) { this.box(mat, -(ow / 2 + pw / 2), 0, 0, pw, oh, d); this.box(mat, ow / 2 + pw / 2, 0, 0, pw, oh, d); }
    if (h > oh + 0.01) this.box(mat, 0, oh, 0, w, h - oh, d);
    // spandrels + intrados
    const seg = o.seg ?? 12; const P = [], N = [], I = [], U = null;
    for (const side of [1, -1]) {
      const zf = side * d / 2;
      const b0 = P.length / 3;
      for (let i = 0; i <= seg; i++) {
        const a = Math.PI * (i / seg); const ca = Math.cos(a), sa = Math.sin(a);
        const m = Math.max(Math.abs(ca), sa);
        P.push(r * ca, spring + r * sa, zf, (r * ca) / m, spring + (r * sa) / m, zf);
        N.push(0, 0, side, 0, 0, side);
        if (i < seg) { const b = b0 + i * 2; I.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      }
      // corner fill at the crown square corners handled by outer points projection
    }
    const b1 = P.length / 3;
    for (let i = 0; i <= seg; i++) {
      const a = Math.PI * (i / seg); const ca = Math.cos(a), sa = Math.sin(a);
      P.push(r * ca, spring + r * sa, d / 2, r * ca, spring + r * sa, -d / 2); N.push(-ca, -sa, 0, -ca, -sa, 0);
      if (i < seg) { const b = b1 + i * 2; I.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    this.emit(mat, P, N, U, I, 0, 0, 0);
    this.F.pop();
  }

  /** Gable roof: ridge along local X, width w (X), depth d (Z), eave at y, rise. Overhang included by caller. */
  gable(mat, x, y, z, w, d, rise, o = {}) {
    const th = o.th ?? 0.18;
    if (this.dry) { this._sil(x, y, z, w, rise, d, o.ry || 0, mat); return; }
    this.F.push(x, y, z, o.ry || 0);
    const hw = w / 2, hd = d / 2;
    // two slopes as thin quads (top) + undersides
    for (const s of [1, -1]) {
      this.quad(mat, [[-hw, 0, s * hd], [hw, 0, s * hd], [hw, rise, 0], [-hw, rise, 0]], { flip: s < 0 });
      this.quad(mat, [[-hw, -th, s * hd], [-hw, rise - th, 0], [hw, rise - th, 0], [hw, -th, s * hd]], { flip: s < 0 });
      // fascia
      this.quad(mat, [[-hw, -th, s * hd], [hw, -th, s * hd], [hw, 0, s * hd], [-hw, 0, s * hd]], { flip: s < 0 });
    }
    if (o.gableMat) {
      for (const s of [1, -1]) this.prism(o.gableMat, [[-hd + 0.05, 0], [hd - 0.05, 0], [0, rise - th - 0.02]], s * (hw - (o.inset ?? 0.4)), 0, 0, 0.3, { vertical: true, ry: Math.PI / 2 });
    }
    this.F.pop();
  }

  /** Hip/pyramid roof (4 sides) over w x d at eave y with rise; o.cone for round. */
  hip(mat, x, y, z, w, d, rise, o = {}) {
    if (this.dry) { this._sil(x, y, z, w, rise, d, o.ry || 0, mat); return; }
    const hw = w / 2, hd = d / 2; const ridge = Math.max(0, (w - d) / 2) * (o.ridge ?? 1);
    this.F.push(x, y, z, o.ry || 0);
    const A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [hw, 0, hd], D = [-hw, 0, hd];
    const R1 = [-ridge, rise, 0], R2 = [ridge, rise, 0];
    this.quad(mat, [A, B, R2, R1], { flip: true }); this.quad(mat, [C, D, R1, R2], { flip: true });
    this.quad(mat, [B, C, R2, R2], { flip: true }); this.quad(mat, [D, A, R1, R1], { flip: true });
    this.F.pop();
  }

  /** Straight staircase: footprint w (X) x run (Z), rising h toward +Z, base at y. Steps count auto. */
  stairs(mat, x, y, z, w, run, h, o = {}) {
    const n = Math.max(2, Math.round(h / (o.riser ?? 0.22)));
    if (this.dry) { this._sil(x, y, z, w, h, run, o.ry || 0, mat); return; }
    this.F.push(x, y, z, o.ry || 0);
    const sd = run / n, sh = h / n;
    for (let i = 0; i < n; i++) this.box(mat, 0, 0, -run / 2 + sd * i + (run - sd * i) / 2, w, sh * (i + 1), run - sd * i, { noBottom: true });
    if (o.cheek) { for (const s of [-1, 1]) this.prism(o.cheek, [[-run / 2, 0], [run / 2, 0], [run / 2, h + 0.5], [-run / 2 + 0.6, 0.6]], s * (w / 2 + 0.25), 0, 0, 0.5, { vertical: true, ry: Math.PI / 2 }); }
    this.F.pop();
  }

  /** Create meshes. Returns array of {mesh, mat}. */
  build(scene, name, resolveMat, opts = {}) {
    const out = [];
    for (const [mat, b] of this.buckets) {
      if (!b.i.length) continue;
      const mesh = new Mesh(`${name}:${mat}`, scene);
      const vd = new VertexData();
      vd.positions = new Float32Array(b.p); vd.normals = new Float32Array(b.n); vd.uvs = new Float32Array(b.u);
      vd.indices = b.p.length / 3 > 65535 ? new Uint32Array(b.i) : new Uint16Array(b.i);
      vd.applyToMesh(mesh, false);
      mesh.material = resolveMat(mat);
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      if (opts.position) { mesh.position.copyFrom(opts.position); mesh.rotation.y = opts.rotY || 0; }
      mesh.computeWorldMatrix(true);
      mesh.freezeWorldMatrix();
      mesh.doNotSyncBoundingInfo = true;
      out.push({ mesh, mat, verts: b.p.length / 3 });
    }
    this.buckets.clear();
    return out;
  }
}

/** Thin-instance collector: proto meshes built once (VertexData cached), instanced per sanctuary. */
export class Instancer {
  constructor(F, dry = false) { this.F = F; this.dry = dry; this.sets = new Map(); this.count = 0; }
  add(proto, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
    if (this.dry) return;
    let s = this.sets.get(proto); if (!s) { s = []; this.sets.set(proto, s); }
    const [wx, wz] = this.F.xz(x, z); const yaw = this.F.yaw + ry;
    const c = Math.cos(yaw), si = Math.sin(yaw);
    s.push(sx * c, 0, -sx * si, 0, 0, sy, 0, 0, sz * si, 0, sz * c, 0, wx, this.F.oy + y, wz, 1);
    this.count++;
  }
  /** protos: name -> {parts:[{mat, vd}]} ; returns meshes */
  build(scene, name, protos, resolveMat, opts = {}) {
    const out = [];
    for (const [proto, arr] of this.sets) {
      const P = protos[proto]; if (!P) continue;
      const parts = P.parts();
      for (const part of parts) {
        const mesh = new Mesh(`${name}:inst:${proto}:${part.mat}`, scene);
        part.vd.applyToMesh(mesh, false);
        mesh.material = resolveMat(part.mat);
        mesh.isPickable = false; mesh.receiveShadows = true;
        if (opts.position) { mesh.position.copyFrom(opts.position); mesh.rotation.y = opts.rotY || 0; }
        mesh.thinInstanceSetBuffer('matrix', new Float32Array(arr), 16, true);
        mesh.thinInstanceRefreshBoundingInfo(false);
        mesh.computeWorldMatrix(true);
        mesh.freezeWorldMatrix();
        mesh.doNotSyncBoundingInfo = true;
        out.push({ mesh, mat: part.mat, count: arr.length / 16, proto });
      }
    }
    this.sets.clear();
    return out;
  }
}

/** Build a prototype's parts from a builder callback (local frame). Cached per proto name. */
const PROTO_CACHE = new Map();
export function makeProto(name, fn) {
  return {
    parts() {
      let parts = PROTO_CACHE.get(name);
      if (parts) return parts;
      const F = new Frame(); const b = new Builder(F); fn(b);
      parts = [];
      for (const [mat, bk] of b.buckets) {
        const vd = new VertexData();
        vd.positions = new Float32Array(bk.p); vd.normals = new Float32Array(bk.n); vd.uvs = new Float32Array(bk.u);
        vd.indices = new Uint32Array(bk.i);
        parts.push({ mat, vd });
      }
      PROTO_CACHE.set(name, parts);
      return parts;
    },
  };
}
