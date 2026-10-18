// Tileable (periodic) procedural noise and pattern helpers used to bake PBR texture sets
// at runtime. Every function works in normalized texture space u,v in [0,1) and wraps
// seamlessly, so generated textures tile without visible seams.

const PERM = new Uint8Array(512);
const GRAD = new Float32Array(512 * 2);
{
  let s = 0x9e3779b9 >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) {
    PERM[i] = p[i & 255];
    const a = rnd() * Math.PI * 2; GRAD[i * 2] = Math.cos(a); GRAD[i * 2 + 1] = Math.sin(a);
  }
}

const mod = (a, n) => ((a % n) + n) % n;
export const hash2 = (x, y, seed = 0) => PERM[(PERM[(x + seed * 17) & 255] + y + seed * 31) & 255] / 255;
export const hash3 = (x, y, z) => PERM[(PERM[(PERM[x & 255] + y) & 255] + z) & 255] / 255;
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

/** Periodic gradient noise in [-1,1] (approximately). Period px,py in lattice cells. */
export function pnoise(x, y, px, py, seed = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  let ix0 = x0 % px; if (ix0 < 0) ix0 += px;
  let iy0 = y0 % py; if (iy0 < 0) iy0 += py;
  let ix1 = ix0 + 1; if (ix1 >= px) ix1 = 0;
  let iy1 = iy0 + 1; if (iy1 >= py) iy1 = 0;
  const s13 = seed * 13;
  const p0 = PERM[(ix0 + s13) & 255], p1 = PERM[(ix1 + s13) & 255];
  const h00 = ((PERM[(p0 + iy0) & 255] + seed) & 511) << 1, h10 = ((PERM[(p1 + iy0) & 255] + seed) & 511) << 1;
  const h01 = ((PERM[(p0 + iy1) & 255] + seed) & 511) << 1, h11 = ((PERM[(p1 + iy1) & 255] + seed) & 511) << 1;
  const a = GRAD[h00] * fx + GRAD[h00 + 1] * fy;
  const b = GRAD[h10] * (fx - 1) + GRAD[h10 + 1] * fy;
  const c = GRAD[h01] * fx + GRAD[h01 + 1] * (fy - 1);
  const d = GRAD[h11] * (fx - 1) + GRAD[h11 + 1] * (fy - 1);
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  return (a + u * (b - a) + v * (c - a + u * (a - b - c + d))) * 1.414;
}

/** Periodic fBm. freq = base lattice cells across the tile (integer). Returns ~[-1,1]. */
export function fbm(u, v, freq = 4, oct = 4, seed = 0, gain = 0.5) {
  let a = 1, f = freq, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * pnoise(u * f, v * f, f, f, seed + i); n += a; a *= gain; f *= 2; }
  return s / n;
}

/** Anisotropic periodic fBm (different lattice counts along u and v). */
export function fbm2(u, v, fu, fv, oct = 4, seed = 0) {
  let a = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * pnoise(u * fu, v * fv, fu, fv, seed + i); n += a; a *= 0.5; fu *= 2; fv *= 2; }
  return s / n;
}

export function ridgedf(u, v, freq = 4, oct = 4, seed = 0) {
  let a = 1, f = freq, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { const r = 1 - Math.abs(pnoise(u * f, v * f, f, f, seed + i)); s += a * r * r; n += a; a *= 0.5; f *= 2; }
  return s / n;
}

/**
 * Periodic Voronoi (jittered grid). Returns {f1, f2, id, cx, cy} with distances in cell units.
 * nx, ny: cells across the tile.
 */
export function voronoi(u, v, nx, ny, jitter = 0.85, seed = 0, out = {}) {
  const x = u * nx, y = v * ny;
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0, bx = 0, by = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const wx = mod(cx, nx), wy = mod(cy, ny);
    const px = cx + 0.5 + (hash2(wx, wy, seed) - 0.5) * jitter;
    const py = cy + 0.5 + (hash2(wx + 101, wy + 57, seed) - 0.5) * jitter;
    const d = Math.hypot(px - x, py - y);
    if (d < f1) { f2 = f1; f1 = d; id = wx * 977 + wy * 131 + seed; bx = px; by = py; } else if (d < f2) f2 = d;
  }
  out.f1 = f1; out.f2 = f2; out.id = id; out.cx = bx; out.cy = by;
  return out;
}

/**
 * Exact-ish edge distance for Voronoi (distance to the bisector of the two nearest seeds),
 * better for grout lines than f2-f1. Returns {edge, id, cx, cy} (cell units).
 */
export function voronoiEdge(u, v, nx, ny, jitter = 0.85, seed = 0, out = {}) {
  const x = u * nx, y = v * ny;
  const xi = Math.floor(x), yi = Math.floor(y);
  let md = 9, mx = 0, my = 0, id = 0, cx0 = 0, cy0 = 0;
  const pts = [];
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
    const cx = xi + i, cy = yi + j;
    const wx = mod(cx, nx), wy = mod(cy, ny);
    const px = cx + 0.5 + (hash2(wx, wy, seed) - 0.5) * jitter;
    const py = cy + 0.5 + (hash2(wx + 101, wy + 57, seed) - 0.5) * jitter;
    pts.push(px, py);
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < md) { md = d; mx = px; my = py; id = wx * 977 + wy * 131 + seed; cx0 = px; cy0 = py; }
  }
  let edge = 9;
  for (let k = 0; k < pts.length; k += 2) {
    const px = pts[k], py = pts[k + 1];
    if (px === mx && py === my) continue;
    const ex = px - mx, ey = py - my; const el = Math.hypot(ex, ey);
    if (el < 1e-5) continue;
    const d = ((x - (mx + px) / 2) * -ex + (y - (my + py) / 2) * -ey) / el;
    if (d < edge) edge = d;
  }
  out.edge = edge; out.id = id; out.cx = cx0; out.cy = cy0;
  return out;
}

/**
 * Irregular running-bond ashlar. rows across the tile (v), approx cols per row; each row
 * is split at random (tile-consistent) positions. Returns distances in metres given tile size.
 */
const ASHLAR_CACHE = new Map();
function ashlarRows(rows, cols, seed, irregular) {
  const key = `${rows}:${cols}:${seed}:${irregular}`;
  let t = ASHLAR_CACHE.get(key);
  if (t) return t;
  t = [];
  for (let r = 0; r < rows; r++) {
    const cuts = [];
    const off = hash2(r, 7, seed);
    for (let c = 0; c < cols; c++) cuts.push((c + off + (hash2(r, c + 11, seed) - 0.5) * irregular) / cols);
    cuts.sort((a, b) => a - b);
    t.push(cuts.map((x) => mod(x, 1)).sort((a, b) => a - b));
  }
  ASHLAR_CACHE.set(key, t);
  return t;
}
export function ashlar(u, v, rows, cols, tileW, tileH, seed = 0, irregular = 0.6, out = {}) {
  const y = v * rows; const row = Math.min(rows - 1, Math.floor(y)); const fy = y - row;
  const cuts = ashlarRows(rows, cols, seed, irregular)[row];
  let a = cuts[cuts.length - 1] - 1, b = cuts[0], k = 0;
  for (let i = 0; i < cuts.length; i++) { if (u >= cuts[i]) { a = cuts[i]; b = i + 1 < cuts.length ? cuts[i + 1] : cuts[0] + 1; k = i + 1; } }
  const bh = tileH / rows;
  const dx = Math.min(u - a, b - u) * tileW;
  const dy = Math.min(fy, 1 - fy) * bh;
  out.d = Math.min(dx, dy);
  out.id = row * 37 + (k % cuts.length) * 101 + seed;
  out.bu = (u - a) / (b - a); out.bv = fy; out.bw = (b - a) * tileW; out.bh = bh;
  return out;
}

/** Hex tiling. Tile must be sized so that cols*1.5*s = 1 and rows*sqrt3*s = aspect. */
export function hexCell(x, y, out = {}) {
  // x,y in hex-units (flat-top hex of circumradius 1)
  const q = (2 / 3) * x; const r = (-1 / 3) * x + (Math.sqrt(3) / 3) * y;
  let rx = Math.round(q), ry = Math.round(-q - r), rz = Math.round(r);
  const dx = Math.abs(rx - q), dy = Math.abs(ry - (-q - r)), dz = Math.abs(rz - r);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  const cx = 1.5 * rx, cy = Math.sqrt(3) * (rz + rx / 2);
  const lx = Math.abs(x - cx), ly = Math.abs(y - cy);
  // distance to hex edge (flat-top, apothem sqrt3/2)
  const ap = Math.sqrt(3) / 2;
  const d = Math.min(ap - ly, ap - (lx * Math.sqrt(3) / 2 + ly / 2));
  out.d = d; out.q = rx; out.r = rz; out.cx = cx; out.cy = cy;
  return out;
}

export function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
export function linearToSrgb(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
export function hexToRgb(hex) {
  if (Array.isArray(hex)) return hex;
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
