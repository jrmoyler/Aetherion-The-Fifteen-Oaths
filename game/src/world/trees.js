// Procedural vegetation & rock meshes built in code: tube trunks/branches, alpha-tested leaf
// cards with spherical normals (soft volumetric canopy lighting), code-drawn leaf/bark textures.
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';

export function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

class Geo {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; this.i = []; }
  get count() { return this.p.length / 3; }
  v(x, y, z, nx, ny, nz, r, g, b, u, v, a = 1) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(r, g, b, a); this.uv.push(u, v); return this.count - 1; }
  tri(a, b, c) { this.i.push(a, b, c); }
  /** tube along points [{x,y,z,r}] */
  tube(pts, sides, col, uvRepeat = 1) {
    const base = this.count; let vAcc = 0;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k], q = pts[Math.min(k + 1, pts.length - 1)], o = pts[Math.max(k - 1, 0)];
      let tx = q.x - o.x, ty = q.y - o.y, tz = q.z - o.z; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      // reference vector not parallel to tangent
      let ax = 0, ay = 0, az = 1; if (Math.abs(tz) > 0.9) { ax = 1; az = 0; }
      let bx = ty * az - tz * ay, by = tz * ax - tx * az, bz = tx * ay - ty * ax; const bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl;
      const cx = ty * bz - tz * by, cy = tz * bx - tx * bz, cz = tx * by - ty * bx;
      if (k > 0) vAcc += Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z) / (2 * Math.PI * Math.max(p.r, 0.05)) * 0.5;
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2; const ca = Math.cos(a), sa = Math.sin(a);
        const nx = bx * ca + cx * sa, ny = by * ca + cy * sa, nz = bz * ca + cz * sa;
        const shade = 0.75 + 0.25 * (k / (pts.length - 1));
        this.v(p.x + nx * p.r, p.y + ny * p.r, p.z + nz * p.r, nx, ny, nz, col[0] * shade, col[1] * shade, col[2] * shade, (s / sides) * uvRepeat, vAcc);
      }
    }
    for (let k = 0; k < pts.length - 1; k++) for (let s = 0; s < sides; s++) {
      const a = base + k * (sides + 1) + s, b = a + 1, c = a + sides + 1, d = c + 1;
      this.tri(a, c, b); this.tri(b, c, d);
    }
  }
  /** quad card centred at c with half axes U, V; normal n; uv rect [u0,v0,u1,v1] */
  card(c, U, V, n, col, rect) {
    const [u0, v0, u1, v1] = rect; const b = this.count;
    const P = (su, sv, u, v) => this.v(c[0] + U[0] * su + V[0] * sv, c[1] + U[1] * su + V[1] * sv, c[2] + U[2] * su + V[2] * sv, n[0], n[1], n[2], col[0], col[1], col[2], u, v);
    P(-1, -1, u0, v1); P(1, -1, u1, v1); P(1, 1, u1, v0); P(-1, 1, u0, v0);
    this.tri(b, b + 1, b + 2); this.tri(b, b + 2, b + 3);
  }
  toMesh(name, scene) {
    const m = new Mesh(name, scene); if (!this.i.length) return m;
    const vd = new VertexData(); vd.positions = this.p; vd.normals = this.n; vd.colors = this.c; vd.uvs = this.uv; vd.indices = this.i;
    vd.applyToMesh(m, false);
    return m;
  }
}

const norm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
const QUAD = { broad: [0, 0, 0.5, 0.5], needle: [0.5, 0, 1, 0.5], tuft: [0, 0.5, 0.5, 1], blade: [0.5, 0.5, 1, 1] };

/** random leaf cards in a blob around centre; normals blend blob-outward with canopy-outward */
function blob(g, R, cx, cy, cz, rad, count, size, col, quad, canopyC, flat = 0, vary = 0.12) {
  for (let i = 0; i < count; i++) {
    const u = R() * 2 - 1, th = R() * Math.PI * 2, rr = Math.cbrt(R()) * rad;
    const s = Math.sqrt(1 - u * u); let px = cx + Math.cos(th) * s * rr, py = cy + u * rr * (1 - flat), pz = cz + Math.sin(th) * s * rr;
    const a = R() * Math.PI * 2, tilt = (R() * 2 - 1) * (1 - flat) * 1.2 + (flat ? (R() - 0.5) * 0.5 : 0);
    const ux = Math.cos(a), uz = Math.sin(a);
    const U = [ux * size, Math.sin(tilt) * size * 0.3, uz * size];
    const vx = -uz, vz = ux; const ct = Math.cos(tilt), st = Math.sin(tilt);
    const V = flat ? [vx * size * ct, st * size, vz * size * ct] : [vx * size * st * 0.6, ct * size, vz * size * st * 0.6];
    const n1 = norm(px - cx, py - cy, pz - cz), n2 = norm(px - canopyC[0], (py - canopyC[1]) + 0.6, pz - canopyC[2]);
    const n = norm(n1[0] * 0.4 + n2[0] * 0.6, n1[1] * 0.4 + n2[1] * 0.6 + flat * 0.6, n1[2] * 0.4 + n2[2] * 0.6);
    const k = 1 - vary + R() * vary * 2; const inner = 0.75 + 0.25 * Math.min(1, rr / rad);
    g.card([px, py, pz], U, V, n, [col[0] * k * inner, col[1] * k * inner, col[2] * k * inner], quad);
  }
}

function branch(g, R, x, y, z, dx, dy, dz, len, r0, col, sides = 5, segs = 4, droop = 0) {
  const pts = []; let px = x, py = y, pz = z; const d = norm(dx, dy, dz);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs; pts.push({ x: px, y: py, z: pz, r: r0 * (1 - t * 0.8) });
    px += d[0] * len / segs + (R() - 0.5) * len * 0.08; py += d[1] * len / segs - droop * t * len / segs; pz += d[2] * len / segs + (R() - 0.5) * len * 0.08;
  }
  g.tube(pts, sides, col);
  return pts[pts.length - 1];
}

function trunk(g, R, h, r0, r1, col, sides, lean = 0.15, segs = 6) {
  const pts = []; const lx = (R() - 0.5) * lean, lz = (R() - 0.5) * lean;
  for (let i = 0; i <= segs; i++) { const t = i / segs; pts.push({ x: lx * t * t * h + (R() - 0.5) * 0.06 * h * t, y: -0.6 + t * (h + 0.6), z: lz * t * t * h + (R() - 0.5) * 0.06 * h * t, r: r0 + (r1 - r0) * Math.pow(t, 0.7) + (i === 0 ? r0 * 0.4 : 0) }); }
  g.tube(pts, sides, col);
  return pts;
}

const BARK = [0.42, 0.34, 0.27], BARK_DARK = [0.2, 0.17, 0.15], BIRCH = [0.92, 0.9, 0.86], CHAR = [0.12, 0.11, 0.1];

/** Build {bark, leaves, extra} Geo sets for a species at a given LOD (0 near, 1 far). */
export function buildSpecies(name, lod, seed = 1) {
  const R = rng(seed * 31 + lod * 7 + name.length * 13);
  const bark = new Geo(), leaves = new Geo(), extra = new Geo();
  const far = lod > 0;
  switch (name) {
    case 'conifer': case 'snowConifer': {
      const H = 15; trunk(bark, R, H * 0.95, 0.38, 0.05, BARK_DARK, far ? 4 : 7, 0.05);
      const tiers = far ? 6 : 13; const per = far ? 4 : 8;
      const snow = name === 'snowConifer';
      for (let t = 0; t < tiers; t++) {
        const f = t / (tiers - 1); const y = 2.2 + f * (H - 2.0); const Rr = 3.3 * Math.pow(1 - f, 0.95) + 0.35;
        for (let k = 0; k < per; k++) {
          const a = (k / per) * Math.PI * 2 + R() * 0.8 + t * 0.7; const dx = Math.cos(a), dz = Math.sin(a);
          const len = Rr * (0.55 + R() * 0.25) * (far ? 1.2 : 1); const droop = 0.35 + R() * 0.25;
          const c = [dx * len * 0.55, y - droop * len * 0.45, dz * len * 0.55];
          const U = [dx * len * 0.6, -droop * len * 0.5, dz * len * 0.6];
          const w = (0.45 + Rr * 0.32) * (far ? 1.4 : 1); const roll = (R() - 0.5) * 1.2;
          const V = [-dz * w * Math.cos(roll), w * Math.sin(roll), dx * w * Math.cos(roll)];
          const n = norm(dx * 0.7, 0.55, dz * 0.7);
          const g0 = snow ? (0.55 + 0.35 * (1 - f * 0.3)) : 0; const k2 = 0.85 + R() * 0.3;
          const base = [0.62 * k2, 0.78 * k2, 0.55 * k2];
          leaves.card(c, U, V, n, [base[0] + (1.6 - base[0]) * g0, base[1] + (1.6 - base[1]) * g0, base[2] + (1.7 - base[2]) * g0], QUAD.needle);
        }
      }
      break;
    }
    case 'broadleaf': {
      const pts = trunk(bark, R, 5.2, 0.42, 0.22, BARK, far ? 4 : 7, 0.25, 4);
      const top = pts[pts.length - 1]; const C = [top.x, top.y + 2.4, top.z];
      const nb = far ? 3 : 5; const tips = [];
      for (let b = 0; b < nb; b++) {
        const a = (b / nb) * Math.PI * 2 + R(); const yb = 3.6 + R() * 1.6;
        const e = far ? { x: Math.cos(a) * 2.6, y: yb + 2.2, z: Math.sin(a) * 2.6 } : branch(bark, R, top.x * 0.8, yb, top.z * 0.8, Math.cos(a), 0.75, Math.sin(a), 3.4, 0.16, BARK, 5, 3);
        tips.push(e);
      }
      tips.push({ x: top.x, y: top.y + 3.2, z: top.z });
      for (const t of tips) blob(leaves, R, t.x, t.y + 0.4, t.z, far ? 2.7 : 2.5, far ? 9 : 34, far ? 2.8 : 1.75, [0.95, 0.95, 0.9], QUAD.broad, C);
      break;
    }
    case 'giantTree': {
      const H = 10; const pts = trunk(bark, R, H, 1.7, 0.9, BARK, far ? 6 : 10, 0.1, 6);
      if (!far) for (let k = 0; k < 7; k++) { // flaring buttress roots
        const a = (k / 7) * Math.PI * 2 + R() * 0.4; const rp = [];
        for (let i = 0; i <= 6; i++) { const t = i / 6; const r = 1.1 + t * (5 + R() * 2.5); rp.push({ x: Math.cos(a) * r, y: 3.2 * (1 - t) * (1 - t) + 0.9 * Math.sin(t * Math.PI) - 0.5 * t, z: Math.sin(a) * r, r: 0.75 * (1 - t * 0.75) }); }
        bark.tube(rp, 6, BARK);
      }
      const top = pts[pts.length - 1]; const C = [top.x, top.y + 4, top.z]; const tips = [];
      const nb = far ? 4 : 6;
      for (let b = 0; b < nb; b++) {
        const a = (b / nb) * Math.PI * 2 + R() * 0.5; const yb = H * (0.65 + R() * 0.3);
        const e = far ? { x: Math.cos(a) * 8, y: yb + 4, z: Math.sin(a) * 8 } : branch(bark, R, 0, yb, 0, Math.cos(a), 0.45, Math.sin(a), 9 + R() * 2, 0.75, BARK, 7, 5, 0.6);
        tips.push(e);
        if (!far) { const m = { x: e.x * 0.55, y: e.y * 0.9, z: e.z * 0.55 }; tips.push(m); }
      }
      tips.push({ x: top.x, y: top.y + 5, z: top.z });
      for (const t of tips) blob(leaves, R, t.x, t.y + 1.2, t.z, far ? 5.5 : 4.4, far ? 9 : 30, far ? 4.2 : 2.6, [0.9, 0.95, 0.8], QUAD.broad, C, 0.25);
      break;
    }
    case 'cypress': {
      trunk(bark, R, 2.2, 0.3, 0.22, BARK_DARK, 5, 0.05, 2);
      const n = far ? 14 : 70; const C = [0, 6.5, 0];
      for (let i = 0; i < n; i++) {
        const y = 1.6 + R() * 10.5; const f = (y - 1.6) / 10.5; const rr = 1.45 * Math.sin(Math.PI * Math.min(1, f * 0.95 + 0.05)) * (0.6 + 0.4 * R()) * (1 - f * 0.35);
        const a = R() * Math.PI * 2; const px = Math.cos(a) * rr, pz = Math.sin(a) * rr;
        const s = far ? 1.9 : 1.05; const ua = a + Math.PI / 2;
        const U = [Math.cos(ua) * s, 0, Math.sin(ua) * s], V = [Math.cos(a) * 0.3 * s, s * 1.3, Math.sin(a) * 0.3 * s];
        const nn = norm(px - C[0], (y - C[1]) * 0.25 + 0.3, pz - C[2]); const k = 0.85 + R() * 0.3;
        leaves.card([px, y, pz], U, V, nn, [0.62 * k, 0.75 * k, 0.6 * k], QUAD.tuft);
      }
      break;
    }
    case 'stonePine': {
      const pts = trunk(bark, R, 9.5, 0.36, 0.2, [0.48, 0.36, 0.28], far ? 4 : 7, 0.5, 5);
      const top = pts[pts.length - 1]; const C = [top.x, top.y + 0.6, top.z];
      if (!far) for (let b = 0; b < 4; b++) { const a = (b / 4) * Math.PI * 2 + R(); branch(bark, R, top.x, top.y - 1.2, top.z, Math.cos(a), 0.5, Math.sin(a), 3, 0.12, [0.48, 0.36, 0.28], 4, 2); }
      blob(leaves, R, C[0], C[1] + 0.6, C[2], 4.8, far ? 12 : 56, far ? 2.8 : 1.6, [0.85, 0.9, 0.78], QUAD.tuft, [C[0], C[1] - 2, C[2]], 0.7);
      break;
    }
    case 'deadTree': {
      const pts = trunk(bark, R, 7, 0.38, 0.12, CHAR, far ? 4 : 6, 0.4, 5);
      const nb = far ? 3 : 6;
      for (let b = 0; b < nb; b++) {
        const p = pts[2 + Math.floor(R() * (pts.length - 3))]; const a = R() * Math.PI * 2;
        const e = branch(bark, R, p.x, p.y, p.z, Math.cos(a), 0.6 + R() * 0.5, Math.sin(a), 2.5 + R() * 2, 0.12, CHAR, 4, 3);
        if (!far) branch(bark, R, e.x, e.y, e.z, Math.cos(a + 0.8), 0.9, Math.sin(a + 0.8), 1.2, 0.05, CHAR, 3, 2);
      }
      break;
    }
    case 'birch': {
      const pts = trunk(bark, R, 10, 0.2, 0.07, BIRCH, far ? 4 : 6, 0.2, 6);
      const C = [pts[4].x, 8.2, pts[4].z];
      const nc = far ? 2 : 5;
      for (let i = 0; i < nc; i++) { const p = pts[3 + (i % 3)]; const a = R() * Math.PI * 2; const rr = 0.8 + R();
        blob(leaves, R, p.x + Math.cos(a) * rr, p.y + 0.8 + R() * 1.5, p.z + Math.sin(a) * rr, far ? 2.2 : 1.6, far ? 7 : 16, far ? 2 : 1.1, [1.1, 1.08, 0.75], QUAD.broad, C, 0, 0.2); }
      break;
    }
    case 'reeds': {
      const n = far ? 8 : 26;
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 0.9; const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const h = 1.3 + R() * 1.2, w = 0.07 + R() * 0.04; const la = R() * Math.PI; const lx = Math.cos(la) * 0.25, lz = Math.sin(la) * 0.25;
        const k = 0.8 + R() * 0.4; const col = [0.55 * k, 0.6 * k, 0.32 * k];
        const b = leaves.count; const ux = -Math.sin(la) * w, uz = Math.cos(la) * w;
        for (let s = 0; s <= 3; s++) { const t = s / 3; const ww = 1 - t * 0.85; const bx = x + lx * t * t, by = t * h, bz = z + lz * t * t;
          leaves.v(bx - ux * ww, by, bz - uz * ww, lx, 1, lz, col[0] * (0.6 + 0.4 * t), col[1] * (0.6 + 0.4 * t), col[2] * (0.6 + 0.4 * t), 0.5, 1 - t * 0.5 + 0.0);
          leaves.v(bx + ux * ww, by, bz + uz * ww, lx, 1, lz, col[0] * (0.6 + 0.4 * t), col[1] * (0.6 + 0.4 * t), col[2] * (0.6 + 0.4 * t), 1.0, 1 - t * 0.5); }
        for (let s = 0; s < 3; s++) { const q = b + s * 2; leaves.tri(q, q + 2, q + 1); leaves.tri(q + 1, q + 2, q + 3); }
        if (!far && i % 5 === 0) bark.tube([{ x: x + lx * 0.8, y: h * 0.8, z: z + lz * 0.8, r: 0.045 }, { x: x + lx * 0.85, y: h * 0.8 + 0.25, z: z + lz * 0.85, r: 0.045 }], 5, [0.3, 0.2, 0.12]);
      }
      break;
    }
    case 'shrub': {
      const C = [0, 0.5, 0]; const nc = far ? 1 : 3;
      for (let i = 0; i < nc; i++) blob(leaves, R, (R() - 0.5) * 0.9, 0.55 + R() * 0.4, (R() - 0.5) * 0.9, far ? 1.0 : 0.75, far ? 6 : 10, far ? 1.1 : 0.65, [0.8, 0.85, 0.7], QUAD.broad, C);
      break;
    }
    case 'crystal': {
      const n = far ? 4 : 7;
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, tilt = i === 0 ? 0.05 : 0.25 + R() * 0.5; const len = i === 0 ? 2.4 : 0.8 + R() * 1.4; const r = len * 0.13;
        const d = norm(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
        const pts = [{ x: 0, y: -0.3, z: 0, r }, { x: d[0] * len * 0.8, y: d[1] * len * 0.8 - 0.3, z: d[2] * len * 0.8, r }, { x: d[0] * len, y: d[1] * len - 0.3, z: d[2] * len, r: 0.01 }];
        extra.tube(pts, 6, [0.62 + R() * 0.15, 0.4, 0.9]);
      }
      break;
    }
    case 'boulder': case 'rock': {
      const sub = name === 'boulder' ? (far ? 1 : 3) : (far ? 1 : 2);
      icoRock(extra, sub, seed + (name === 'rock' ? 99 : 0), name === 'boulder' ? 1.6 : 0.55);
      break;
    }
    default: break;
  }
  return { bark, leaves, extra };
}

// ----- rocks: displaced icosphere -----
function vnoise3(x, y, z, seed) {
  const h = (i, j, k) => { let n = (i * 73856093) ^ (j * 19349663) ^ (k * 83492791) ^ (seed * 2654435761); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z); const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t); const u = s(xf), v = s(yf), w = s(zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
}
function icoRock(g, sub, seed, size) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((v) => norm(...v));
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < sub; s++) {
    const cache = new Map(); const nf = [];
    const mid = (a, b) => { const k = a < b ? a * 1e6 + b : b * 1e6 + a; let m = cache.get(k); if (m === undefined) { const p = verts[a], q = verts[b]; verts.push(norm(p[0] + q[0], p[1] + q[1], p[2] + q[2])); m = verts.length - 1; cache.set(k, m); } return m; };
    for (const [a, b, c] of faces) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    faces = nf;
  }
  const R = rng(seed); const sx = 0.9 + R() * 0.6, sy = 0.55 + R() * 0.3, sz = 0.8 + R() * 0.5;
  const P = verts.map(([x, y, z]) => {
    let d = 1 + (vnoise3(x * 1.6 + 3, y * 1.6, z * 1.6, seed) - 0.5) * 0.7 + (vnoise3(x * 4, y * 4, z * 4, seed + 1) - 0.5) * 0.22 + (vnoise3(x * 9, y * 9, z * 9, seed + 2) - 0.5) * 0.07;
    // planar facets
    const f = vnoise3(x * 2.2, y * 2.2, z * 2.2, seed + 3); d *= 1 - Math.max(0, f - 0.6) * 0.5;
    let py = y * d * sy; if (py < -0.15) py = -0.15 + (py + 0.15) * 0.3;
    return [x * d * sx * size, py * size, z * d * sz * size];
  });
  // smooth normals
  const N = P.map(() => [0, 0, 0]);
  for (const [a, b, c] of faces) {
    const pa = P[a], pb = P[b], pc = P[c];
    const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2], vx = pc[0] - pa[0], vy = pc[1] - pa[1], vz = pc[2] - pa[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { N[k][0] += nx; N[k][1] += ny; N[k][2] += nz; }
  }
  const base = g.count;
  P.forEach((p, k) => { const n = norm(...N[k]); const r0 = Math.hypot(...verts[k]); void r0;
    const cav = 0.65 + 0.35 * Math.min(1, Math.max(0, (Math.hypot(p[0] / sx, p[1] / sy, p[2] / sz) / size - 0.7) * 1.5));
    const shade = cav * (0.85 + 0.15 * n[1]);
    g.v(p[0], p[1], p[2], n[0], n[1], n[2], shade, shade, shade, 0, 0); });
  for (const [a, b, c] of faces) g.tri(base + a, base + c, base + b);
}

/** Leaf atlas (2×2): broadleaf cluster, conifer needles, pine/cypress tuft, reed blades. */
export function makeLeafAtlas(scene, size = 512) {
  const t = new DynamicTexture('leafAtlas', { width: size, height: size }, scene, true);
  const c = t.getContext(); c.clearRect(0, 0, size, size);
  const h = size / 2; const R = rng(7);
  const leaf = (x, y, len, w, ang, col) => { c.save(); c.translate(x, y); c.rotate(ang); c.fillStyle = col; c.beginPath(); c.ellipse(len / 2, 0, len / 2, w / 2, 0, 0, Math.PI * 2); c.fill(); c.restore(); };
  const green = (l, s = 0) => `rgb(${Math.round(48 + l * 62 + s * 50)},${Math.round(72 + l * 70 + s * 20)},${Math.round(26 + l * 26)})`;
  // Q0 broadleaf cluster
  c.save(); c.beginPath(); c.rect(0, 0, h, h); c.clip();
  c.strokeStyle = 'rgb(70,55,40)'; c.lineWidth = size / 170;
  for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(h / 2, h * 0.95); c.quadraticCurveTo(h / 2 + (R() - 0.5) * h * 0.4, h / 2, h * (0.15 + R() * 0.7), h * (0.1 + R() * 0.5)); c.stroke(); }
  for (let i = 0; i < 260; i++) { const a = R() * Math.PI * 2, r = Math.sqrt(R()) * h * 0.44; const x = h / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r * 0.9; const l = R();
    leaf(x, y, size * (0.04 + R() * 0.022), size * (0.02 + R() * 0.012), R() * Math.PI * 2, green(l * (0.35 + 0.65 * (1 - r / (h * 0.44))), R() < 0.08 ? 1 : 0)); }
  c.restore();
  // Q1 conifer needle spray (twig along u)
  c.save(); c.beginPath(); c.rect(h, 0, h, h); c.clip(); c.translate(h, 0);
  c.strokeStyle = 'rgb(60,45,35)'; c.lineWidth = size / 140; c.beginPath(); c.moveTo(h * 0.02, h / 2); c.lineTo(h * 0.98, h / 2); c.stroke();
  for (let i = 0; i < 420; i++) { const u = R(); const x = h * (0.04 + u * 0.92); const side = R() < 0.5 ? -1 : 1; const wfac = 0.42 * (1 - Math.abs(u - 0.45) * 0.9);
    const len = h * wfac * (0.5 + R() * 0.5); const a = side * (0.9 + R() * 0.5) - 0.3; const l = R();
    c.strokeStyle = `rgb(${Math.round(40 + l * 40)},${Math.round(70 + l * 50)},${Math.round(40 + l * 25)})`; c.lineWidth = size / 300 + R() * size / 400;
    c.beginPath(); c.moveTo(x, h / 2); c.lineTo(x + Math.cos(a) * len * 0.35, h / 2 + Math.sin(a) * len); c.stroke(); }
  c.restore();
  // Q2 tuft (stone pine / cypress scale foliage)
  c.save(); c.beginPath(); c.rect(0, h, h, h); c.clip(); c.translate(0, h);
  for (let k = 0; k < 9; k++) { const cx = h * (0.2 + R() * 0.6), cy = h * (0.2 + R() * 0.6);
    for (let i = 0; i < 70; i++) { const a = R() * Math.PI * 2; const len = h * (0.08 + R() * 0.14); const l = R();
      c.strokeStyle = `rgb(${Math.round(45 + l * 45)},${Math.round(75 + l * 55)},${Math.round(40 + l * 30)})`; c.lineWidth = size / 260;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); c.stroke(); } }
  c.restore();
  // Q3 reed / grass blade (vertical gradient strip)
  c.save(); c.beginPath(); c.rect(h, h, h, h); c.clip(); c.translate(h, h);
  const gr = c.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgb(70,80,40)'); gr.addColorStop(1, 'rgb(170,165,100)');
  c.fillStyle = gr; c.fillRect(0, 0, h, h);
  c.restore();
  t.hasAlpha = true; t.update(true);
  t.anisotropicFilteringLevel = 4;
  return t;
}

/** Bark texture: vertical fibrous streaks (neutral, tinted by vertex colour). */
export function makeBarkTexture(scene, size = 256) {
  const t = new DynamicTexture('barkTex', { width: size, height: size }, scene, true);
  const c = t.getContext(); const R = rng(11);
  c.fillStyle = 'rgb(150,140,130)'; c.fillRect(0, 0, size, size);
  for (let i = 0; i < 600; i++) { const x = R() * size, w = 1 + R() * 4, l = R();
    c.fillStyle = `rgba(${Math.round(60 + l * 120)},${Math.round(55 + l * 110)},${Math.round(50 + l * 100)},0.35)`;
    const y = R() * size, hgt = size * (0.2 + R() * 0.8); c.fillRect(x, y, w, hgt); c.fillRect(x, y - size, w, hgt); }
  for (let i = 0; i < 90; i++) { c.fillStyle = 'rgba(30,25,20,0.5)'; const x = R() * size, y = R() * size; c.fillRect(x, y, 2 + R() * 6, 1 + R() * 2); }
  t.update(true); t.wrapU = t.wrapV = 1;
  return t;
}

export { Geo };
