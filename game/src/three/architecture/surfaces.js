// Procedural PBR surface library for the sanctuary architecture.
// Every map is generated in pure JS into a tileable DataTexture (no canvas, no downloads), so it runs
// in the browser and under the Node test harness alike. Builder UVs are metric (tangent-plane / arc
// length in metres), so each family declares the metric size of one tile and materials set
// texture.repeat = 1 / tileMetres. Families: dressed ashlar (per stone), brick, flagstone / slab /
// hex paving, poured concrete panels, metal, timber planks, roof tiles, woven cloth, lime plaster,
// bark, foliage, cracked rock and ice. Each yields an sRGB albedo (tone in 0..1 multiplied by the
// material tint), a tangent-space normal map from a height field, and a roughness map (G channel).
import * as THREE from 'three';

// ------------------------------------------------------------------ periodic noise tables
function hash(x, y, s) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function vnoise(x, y, p, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % p) + p) % p, x1 = (x0 + 1) % p, y0 = ((yi % p) + p) % p, y1 = (y0 + 1) % p;
  const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Tileable fBm table N x N (values ~0..1), base lattice period `cells`. */
function fbmTable(N, cells, oct, seed) {
  const t = new Float32Array(N * N); let norm = 0; for (let o = 0, a = 1; o < oct; o++, a *= 0.5) norm += a;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0, a = 1, f = 1;
    for (let o = 0; o < oct; o++) { v += a * vnoise(x / N * cells * f, y / N * cells * f, cells * f, seed + o * 17); a *= 0.5; f *= 2; }
    t[y * N + x] = v / norm;
  }
  return t;
}
const TABLES = new Map();
function tables(N) {
  if (!TABLES.has(N)) TABLES.set(N, { lo: fbmTable(N, 6, 4, 11), mid: fbmTable(N, 24, 3, 29), hi: fbmTable(N, Math.min(N / 2, 128), 2, 47) });
  return TABLES.get(N);
}
/** Sample a table at integer-scaled, offset coordinates (keeps periodicity). */
const tap = (t, N, x, y, k = 1, ox = 0, oy = 0) => t[(((y * k + oy) % N + N) % N) * N + ((((x * k + ox) % N) + N) % N)];

// ------------------------------------------------------------------ running-bond / random block layout
/** Periodic course layout: rows of random height, blocks of random width (normalised to tile exactly). */
function courses(N, rand, rowMin, rowMax, wMin, wMax, o = {}) {
  const rows = []; let acc = 0;
  while (acc < N) { const h = rowMin + rand() * (rowMax - rowMin); rows.push(h); acc += h; }
  const k = N / acc; let y = 0; const out = [];
  for (const h0 of rows) {
    const h = h0 * k; const ws = []; let a = 0;
    while (a < N) { const w = wMin + rand() * (wMax - wMin); ws.push(w); a += w; }
    const kw = N / a; let x = 0; const edges = [];
    for (const w of ws) { edges.push(x); x += w * kw; }
    out.push({ y0: y, y1: y + h, shift: o.stagger ? (out.length % 2) * (o.stagger * N) + rand() * (o.jitter ?? 0) * N : rand() * N, edges, id: out.length * 97 });
    y += h;
  }
  const rowOf = new Int32Array(N); let r = 0;
  for (let py = 0; py < N; py++) { while (r < out.length - 1 && py + 0.5 >= out[r].y1) r++; rowOf[py] = r; }
  return { rows: out, rowOf };
}
/** For pixel (x,y): distance (px) to nearest joint, block id, and normalised position inside the block. */
function cell(L, N, x, y) {
  const row = L.rows[L.rowOf[y]]; const lx = ((x + row.shift) % N + N) % N; const e = row.edges;
  let lo = 0, hi = e.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (e[m] <= lx) lo = m; else hi = m - 1; }
  const x0 = e[lo], x1 = lo + 1 < e.length ? e[lo + 1] : N;
  const dx = Math.min(lx - x0, x1 - lx), dy = Math.min(y + 0.5 - row.y0, row.y1 - y - 0.5);
  return { d: Math.min(dx, dy), dx, dy, id: row.id + lo, u: (lx - x0) / (x1 - x0), v: (y + 0.5 - row.y0) / (row.y1 - row.y0), bw: x1 - x0, bh: row.y1 - row.y0 };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ family recipes
// Each recipe fills H (height 0..1), T (tone, ~0..1.15), R (roughness 0..1) and returns {tile, normal}.
const STONE = {
  // Real-world ashlar: blocks 0.4-0.9 m long, courses 0.25-0.42 m, joints 5-10 mm. tile/row/w/joint/bevel in metres.
  limestone: { tile: 2, row: [0.28, 0.4], w: [0.45, 0.9], joint: 0.008, bevel: 0.022, contrast: 0.12, rough: 0.82, grain: 0.10, strata: 0.02, pits: 0.5, jointTone: 0.62 },
  sandstone: { tile: 2, row: [0.3, 0.42], w: [0.5, 0.95], joint: 0.008, bevel: 0.026, contrast: 0.1, rough: 0.88, grain: 0.08, strata: 0.06, pits: 0.2, jointTone: 0.66 },
  darkgranite: { tile: 2, row: [0.3, 0.4], w: [0.45, 0.85], joint: 0.007, bevel: 0.018, contrast: 0.14, rough: 0.72, grain: 0.16, strata: 0, pits: 0.15, jointTone: 0.55 },
  basalt: { tile: 2, row: [0.25, 0.38], w: [0.4, 0.75], joint: 0.01, bevel: 0.02, contrast: 0.18, rough: 0.9, grain: 0.18, strata: 0.02, pits: 0.6, jointTone: 0.5 },
  slate: { tile: 2, row: [0.1, 0.2], w: [0.3, 0.8], joint: 0.006, bevel: 0.01, contrast: 0.2, rough: 0.7, grain: 0.1, strata: 0.04, pits: 0, jointTone: 0.5 },
  shale: { tile: 2, row: [0.1, 0.28], w: [0.35, 0.95], joint: 0.006, bevel: 0.014, contrast: 0.22, rough: 0.86, grain: 0.1, strata: 0.12, pits: 0.1, jointTone: 0.5 },
  marble: { tile: 3, row: [0.42, 0.7], w: [0.7, 1.3], joint: 0.004, bevel: 0.008, contrast: 0.06, rough: 0.34, grain: 0.03, strata: 0, pits: 0, veins: 0.22, jointTone: 0.6 },
  // fired brick 240 x 75 mm, 10 mm joints, half-bond
  terracotta: { tile: 1, row: [0.085, 0.085], w: [0.25, 0.25], joint: 0.01, bevel: 0.006, contrast: 0.22, rough: 0.86, grain: 0.1, strata: 0, pits: 0.3, stagger: 0.5, jointTone: 0.55 },
};
function ashlar(N, p, seed, H, T, R) {
  const { lo, mid, hi } = tables(N); const rand = rng(seed); const ppm = N / p.tile;
  const L = courses(N, rand, p.row[0] * ppm, p.row[1] * ppm, p.w[0] * ppm, p.w[1] * ppm, { stagger: p.stagger, jitter: p.stagger ? 0 : 0 });
  const joint = p.joint * ppm, bevel = p.bevel * ppm;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const c = cell(L, N, x, y);
    const chip = (tap(mid, N, x, y, 1, 37, 11) - 0.5) * bevel * 1.6;
    const e = c.d + chip; const r = hash(c.id, 3, seed); const r2 = hash(c.id, 7, seed);
    const face = smooth(joint, joint + bevel, e);
    const g = tap(hi, N, x, y), m = tap(mid, N, x, y, 1, c.id * 13, c.id * 7), l = tap(lo, N, x, y);
    // dressed face: pillowed toward the centre, tooled grain, a few pits
    const pillow = Math.sin(Math.PI * c.u) * Math.sin(Math.PI * c.v);
    let pit = 0; if (p.pits && g > 0.86 - p.pits * 0.06) pit = (g - (0.86 - p.pits * 0.06)) * 3;
    H[i] = face * (0.72 + 0.12 * pillow + 0.1 * m + 0.06 * g) - pit * 0.12;
    let tone = 1 - p.contrast * 0.5 + p.contrast * r + (m - 0.5) * 0.12 + (g - 0.5) * p.grain + (l - 0.5) * 0.1;
    if (p.strata) tone += Math.sin((y / N) * 64 + m * 6) * p.strata * 0.5;
    if (p.veins) { const v = Math.abs(Math.sin((x + y * 0.6) / N * 18 + tap(lo, N, x, y, 2) * 14 + r * 9)); tone -= Math.pow(1 - v, 18) * p.veins + Math.pow(1 - v, 4) * p.veins * 0.25; }
    tone -= pit * 0.25;
    // edges catch light / wear lighter, joints carry grime
    tone += (1 - smooth(0, bevel * 2.2, e - joint)) * 0.05 * face;
    const jt = (p.jointTone ?? 0.55) + (g - 0.5) * 0.2;
    T[i] = face * tone + (1 - face) * jt;
    R[i] = Math.min(1, face * (p.rough + (g - 0.5) * 0.14 + (r2 - 0.5) * 0.08) + (1 - face) * 0.96);
  }
  return { tile: p.tile, normal: p.veins ? 0.6 : 1.0, strength: 3.2 };
}
const PAVE = {
  // plaza flags 0.5-1.1 m, ceremonial slabs 0.8-1.6 m, 6-10 mm grout
  flagstone: { tile: 3, row: [0.5, 0.9], w: [0.5, 1.1], joint: 0.01, bevel: 0.012, contrast: 0.2, rough: 0.8 },
  slab: { tile: 4, row: [0.75, 1.2], w: [0.8, 1.6], joint: 0.008, bevel: 0.01, contrast: 0.16, rough: 0.76 },
  rock: { tile: 4, row: [0.3, 0.9], w: [0.3, 1.0], joint: 0.03, bevel: 0.12, contrast: 0.3, rough: 0.95 },
};
function paving(N, p, seed, H, T, R) {
  const { lo, mid, hi } = tables(N); const rand = rng(seed); const ppm = N / p.tile;
  const L = courses(N, rand, p.row[0] * ppm, p.row[1] * ppm, p.w[0] * ppm, p.w[1] * ppm, {});
  const joint = p.joint * ppm, bevel = p.bevel * ppm;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const c = cell(L, N, x, y);
    const e = c.d + (tap(mid, N, x, y, 2, 5, 9) - 0.5) * joint * 1.5;
    const face = smooth(joint, joint + bevel, e);
    const r = hash(c.id, 5, seed), g = tap(hi, N, x, y), m = tap(mid, N, x, y, 1, c.id * 11, c.id * 3), l = tap(lo, N, x, y);
    // hairline cracks: thin iso-lines of a per-slab noise, masked
    const cn = tap(mid, N, x, y, 2, c.id * 29, c.id * 5); const crack = (Math.abs(cn - 0.5) < 0.006 && r > 0.55) ? 1 : 0;
    // foot-polished wear in the middle of slabs, darker grime toward joints
    const wear = Math.sin(Math.PI * c.u) * Math.sin(Math.PI * c.v);
    H[i] = face * (0.8 + 0.08 * m + 0.05 * g + (r - 0.5) * 0.06) - crack * 0.18;
    T[i] = face * (1 - p.contrast * 0.5 + p.contrast * r + (m - 0.5) * 0.12 + (g - 0.5) * 0.08 + (l - 0.5) * 0.12 + wear * 0.04 - crack * 0.25 - (1 - smooth(0, bevel * 3, e - joint)) * 0.07) + (1 - face) * 0.42;
    R[i] = face * (p.rough - wear * 0.12 + (g - 0.5) * 0.12) + (1 - face);
  }
  return { tile: p.tile, normal: 1, strength: 3 };
}
function hexTiles(N, seed, H, T, R) {
  const { mid, hi, lo } = tables(N); const tile = 3.4642; const ppm = N / tile; const s = 0.5 * ppm; // hex circumradius 0.5 m; tile = 2*sqrt3*... periodic
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const px = x / ppm, py = y / ppm;
    // axial hex grid with spacing sqrt3*r horizontally
    const r = 0.5, w = Math.sqrt(3) * r; let best = 1e9, second = 1e9, bid = 0;
    const qy = Math.floor(py / (1.5 * r));
    for (let jy = qy - 1; jy <= qy + 1; jy++) { const off = (jy & 1) * w / 2; const qx = Math.floor((px - off) / w); for (let jx = qx - 1; jx <= qx + 1; jx++) { const cx = jx * w + off, cy = jy * 1.5 * r; const d = Math.hypot(px - cx, py - cy); if (d < best) { second = best; best = d; bid = ((jx % 4) + 4) % 4 * 31 + ((jy % 4) + 4) % 4; } else if (d < second) second = d; } }
    const e = (second - best) * ppm * 0.5; const face = smooth(0.012 * ppm, 0.04 * ppm, e);
    const rr = hash(bid, 9, seed), g = tap(hi, N, x, y), m = tap(mid, N, x, y);
    H[i] = face * (0.8 + 0.1 * m); T[i] = face * (0.86 + rr * 0.2 + (m - 0.5) * 0.12 + (g - 0.5) * 0.06 + (tap(lo, N, x, y) - 0.5) * 0.1) + (1 - face) * 0.42; R[i] = face * (0.72 + (g - 0.5) * 0.1) + (1 - face);
  }
  void s; return { tile, normal: 1, strength: 3 };
}
function concrete(N, seed, H, T, R) {
  const { lo, mid, hi } = tables(N); const tile = 4; const ppm = N / tile; const pw = 2 * ppm, ph = 1 * ppm;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const sx = ((y / ph | 0) & 1) ? (x + pw / 2) % N : x;
    const ux = sx % pw, uy = y % ph; const e = Math.min(ux, pw - ux, uy, ph - uy);
    const seam = smooth(0.012 * ppm, 0.03 * ppm, e); const id = ((sx / pw) | 0) * 7 + ((y / ph) | 0) * 13;
    let bolt = 0; for (const [bx, by] of [[0.12, 0.12], [pw / ppm - 0.12, 0.12], [0.12, ph / ppm - 0.12], [pw / ppm - 0.12, ph / ppm - 0.12]]) { const d = Math.hypot(ux / ppm - bx, uy / ppm - by); if (d < 0.035) bolt = Math.max(bolt, 1 - d / 0.035); }
    const g = tap(hi, N, x, y), m = tap(mid, N, x, y), l = tap(lo, N, x, y);
    const streak = tap(mid, N, x, (y / 6) | 0, 1, 13, 0) * smooth(0, ph, ph - uy);
    H[i] = seam * (0.8 + 0.04 * m + 0.04 * g) + bolt * 0.12;
    T[i] = seam * (0.9 + hash(id, 1, seed) * 0.1 + (l - 0.5) * 0.16 + (g - 0.5) * 0.08 - streak * 0.08) + (1 - seam) * 0.45 - bolt * 0.2;
    R[i] = 0.82 + (g - 0.5) * 0.1 - bolt * 0.3;
  }
  return { tile, normal: 1, strength: 2.5 };
}
function metal(N, seed, H, T, R) {
  const { lo, mid, hi } = tables(N); const tile = 1.5;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const brush = tap(hi, N, (x / 8) | 0, y, 1, 0, 0); const dent = tap(mid, N, x, y, 2);
    const scratch = Math.abs(tap(mid, N, x, y, 3, 17, 5) - 0.5) < 0.004 ? 1 : 0; const l = tap(lo, N, x, y);
    H[i] = dent * 0.5 + brush * 0.08 - scratch * 0.1;
    T[i] = 0.9 + (l - 0.5) * 0.22 + (brush - 0.5) * 0.06 + scratch * 0.12 - Math.max(0, l - 0.62) * 0.4;
    R[i] = 0.32 + (l - 0.5) * 0.32 + (brush - 0.5) * 0.12 + scratch * 0.25;
  }
  return { tile, normal: 1, strength: 1.4 };
}
function planks(N, seed, H, T, R) {
  const { lo, mid, hi } = tables(N); const rand = rng(seed); const tile = 2; const ppm = N / tile;
  const L = courses(N, rand, 0.2 * ppm, 0.26 * ppm, 0.9 * ppm, 2.2 * ppm, {});
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const c = cell(L, N, x, y); const r = hash(c.id, 2, seed);
    const gap = smooth(0.006 * ppm, 0.02 * ppm, c.d);
    const ring = Math.sin((c.v * 7 + tap(mid, N, (x / 3) | 0, y, 1, c.id * 3, 0) * 5 + r * 20) * Math.PI * 2);
    const fine = tap(hi, N, (x / 6) | 0, y, 1, c.id, 0);
    let knot = 0; { const kx = hash(c.id, 4, seed), ky = hash(c.id, 6, seed); if (kx > 0.6) { const d = Math.hypot((c.u - kx) * c.bw, (c.v - ky) * c.bh) / ppm; knot = Math.max(0, 1 - d / 0.05); } }
    H[i] = gap * (0.75 + ring * 0.05 + fine * 0.1) - knot * 0.1;
    T[i] = gap * (0.82 + r * 0.22 + ring * 0.07 + (fine - 0.5) * 0.16 + (tap(lo, N, x, y) - 0.5) * 0.14 - knot * 0.35) + (1 - gap) * 0.3;
    R[i] = 0.78 + (fine - 0.5) * 0.15 + (1 - gap) * 0.2;
  }
  return { tile, normal: 1, strength: 2.4 };
}
function roofTiles(N, seed, H, T, R) {
  const { lo, mid, hi } = tables(N); const tile = 2; const ppm = N / tile; const rh = 0.25 * ppm, tw = 0.25 * ppm;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const row = Math.floor(y / rh); const sx = (x + (row & 1) * tw / 2) % N; const col = Math.floor(sx / tw);
    const u = (sx % tw) / tw, v = (y % rh) / rh; const id = row * 53 + col; const r = hash(id, 8, seed);
    const barrel = Math.sin(Math.PI * u); const lap = 1 - v; // lower edge (v=0) overlaps the tile below
    H[i] = 0.35 + barrel * 0.35 + lap * 0.3 - (u < 0.05 || u > 0.95 ? 0.15 : 0);
    const g = tap(hi, N, x, y), m = tap(mid, N, x, y);
    T[i] = 0.78 + r * 0.24 + barrel * 0.06 + (m - 0.5) * 0.14 + (g - 0.5) * 0.06 + (tap(lo, N, x, y) - 0.5) * 0.12 - smooth(0.85, 1, v) * 0.22;
    R[i] = 0.7 + (g - 0.5) * 0.15 + r * 0.08;
  }
  return { tile, normal: 1, strength: 4 };
}
function cloth(N, seed, H, T, R) {
  const { lo, mid, hi } = tables(N); const tile = 0.6; const f = N / 4 / 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const wx = Math.sin(x / N * f * Math.PI * 2), wy = Math.sin(y / N * f * Math.PI * 2);
    const weave = (((x / N * f * 2) | 0) + ((y / N * f * 2) | 0)) & 1 ? Math.abs(wx) : Math.abs(wy);
    const g = tap(hi, N, x, y), m = tap(mid, N, x, y);
    H[i] = weave * 0.5 + m * 0.3; T[i] = 0.9 + weave * 0.06 + (m - 0.5) * 0.1 + (g - 0.5) * 0.06 + (tap(lo, N, x, y) - 0.5) * 0.1; R[i] = 0.9;
  }
  return { tile, normal: 1, strength: 1.2 };
}
function plaster(N, seed, H, T, R) {
  const { lo, mid, hi } = tables(N); const tile = 4;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const l = tap(lo, N, x, y), m = tap(mid, N, x, y), g = tap(hi, N, x, y);
    const crack = Math.abs(tap(mid, N, x, y, 2, 3, 7) - 0.5) < 0.004 && l > 0.55 ? 1 : 0; const patch = smooth(0.6, 0.64, tap(lo, N, x, y, 2, 9, 3));
    H[i] = 0.6 + m * 0.2 + g * 0.08 - crack * 0.2 - patch * 0.08;
    T[i] = 0.93 + (l - 0.5) * 0.14 + (m - 0.5) * 0.06 - crack * 0.25 - patch * 0.08; R[i] = 0.9 + (g - 0.5) * 0.08;
  }
  return { tile, normal: 1, strength: 1.6 };
}
function bark(N, seed, H, T, R) {
  const { lo, mid, hi } = tables(N); const tile = 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const ridge = tap(mid, N, x, (y / 8) | 0, 2, 0, 0); const g = tap(hi, N, x, y);
    const f = Math.pow(Math.abs(Math.sin(ridge * 9 + x / N * 40)), 0.6);
    H[i] = f * 0.7 + g * 0.2; T[i] = 0.7 + f * 0.35 + (tap(lo, N, x, y) - 0.5) * 0.2; R[i] = 0.92;
  }
  return { tile, normal: 1, strength: 4 };
}
function foliage(N, seed, H, T, R) {
  const { lo, mid, hi } = tables(N); const tile = 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const m = tap(mid, N, x, y, 2), g = tap(hi, N, x, y); const leaf = smooth(0.35, 0.6, m);
    H[i] = leaf * 0.7 + g * 0.3; T[i] = 0.5 + leaf * 0.6 + (g - 0.5) * 0.2 + (tap(lo, N, x, y) - 0.5) * 0.25; R[i] = 0.8;
  }
  return { tile, normal: 1, strength: 3 };
}
function ice(N, seed, H, T, R) {
  const { lo, mid, hi } = tables(N); const tile = 3;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const m = tap(mid, N, x, y), l = tap(lo, N, x, y); const crack = Math.abs(tap(mid, N, x, y, 2, 3, 1) - 0.5) < 0.008 ? 1 : 0;
    H[i] = l * 0.5 + m * 0.2 - crack * 0.2; T[i] = 0.88 + (l - 0.5) * 0.25 + crack * 0.18; R[i] = 0.1 + m * 0.2 + crack * 0.4;
  }
  return { tile, normal: 1, strength: 1.2 };
}

function cliff(N, seed, H, T, R) {
  const { lo, mid, hi } = tables(N); const tile = 28;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const l = tap(lo, N, x, y), m = tap(mid, N, x, y), g = tap(hi, N, x, y);
    // sedimentary bands warped by low-frequency noise, vertical fracture joints, weathered pitting
    const band = y / N * 9 + l * 2.2; const b = band - Math.floor(band); const bandTone = hash(Math.floor(band) % 9, 1, seed);
    const frac = Math.abs(tap(lo, N, x, (y / 6) | 0, 2, 7, 3) - 0.5) < 0.006 ? 1 : 0;
    const ledge = smooth(0.85, 0.97, b);
    H[i] = 0.5 + m * 0.3 + g * 0.1 - ledge * 0.25 - frac * 0.3;
    T[i] = 0.78 + bandTone * 0.3 + (m - 0.5) * 0.14 + (g - 0.5) * 0.08 - ledge * 0.2 - frac * 0.3;
    R[i] = 0.92;
  }
  return { tile, normal: 1, strength: 5 };
}

function earth(N, seed, H, T, R) {
  const { lo, mid, hi } = tables(N); const tile = 6;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const l = tap(lo, N, x, y), m = tap(mid, N, x, y), g = tap(hi, N, x, y);
    const pebble = g > 0.82 ? (g - 0.82) * 5 : 0; const rut = Math.abs(tap(lo, N, x, y, 2, 3, 9) - 0.5) < 0.02 ? 1 : 0;
    H[i] = 0.5 + m * 0.2 + pebble * 0.3 - rut * 0.1;
    T[i] = 0.9 + (l - 0.5) * 0.22 + (m - 0.5) * 0.1 + pebble * 0.15 - rut * 0.08; R[i] = 0.95;
  }
  return { tile, normal: 1, strength: 1.4 };
}

const RECIPES = {
  cliff: (N, v, s, H, T, R) => cliff(N, s, H, T, R),
  ashlar: (N, v, s, H, T, R) => ashlar(N, STONE[v] || STONE.limestone, s, H, T, R),
  paving: (N, v, s, H, T, R) => (v === 'hex' ? hexTiles(N, s, H, T, R) : v === 'earth' ? earth(N, s, H, T, R) : paving(N, PAVE[v] || PAVE.flagstone, s, H, T, R)),
  concrete: (N, v, s, H, T, R) => concrete(N, s, H, T, R),
  metal: (N, v, s, H, T, R) => metal(N, s, H, T, R),
  wood: (N, v, s, H, T, R) => planks(N, s, H, T, R),
  roof: (N, v, s, H, T, R) => roofTiles(N, s, H, T, R),
  cloth: (N, v, s, H, T, R) => cloth(N, s, H, T, R),
  plaster: (N, v, s, H, T, R) => plaster(N, s, H, T, R),
  bark: (N, v, s, H, T, R) => bark(N, s, H, T, R),
  foliage: (N, v, s, H, T, R) => foliage(N, s, H, T, R),
  ice: (N, v, s, H, T, R) => ice(N, s, H, T, R),
};

function dataTexture(data, N, srgb) {
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}

const CACHE = new Map();
/** Tileable surface maps for a family/variant: {map, normalMap, roughnessMap, tile, normalScale}. */
export function surfaceMaps(family, variant = '', size = 512) {
  const key = `${family}:${variant}:${size}`; if (CACHE.has(key)) return CACHE.get(key);
  const N = size; const H = new Float32Array(N * N), T = new Float32Array(N * N), R = new Float32Array(N * N);
  const seed = [...key].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  const info = (RECIPES[family] || RECIPES.plaster)(N, variant, seed, H, T, R);
  const alb = new Uint8Array(N * N * 4), nor = new Uint8Array(N * N * 4), rou = new Uint8Array(N * N * 4);
  const k = info.strength * (N / 512) * 0.5;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, o = i * 4;
    const t = Math.max(0, Math.min(1, T[i] * 0.88)) * 255; alb[o] = alb[o + 1] = alb[o + 2] = t; alb[o + 3] = 255;
    const xl = y * N + ((x + N - 1) % N), xr = y * N + ((x + 1) % N), yd = ((y + N - 1) % N) * N + x, yu = ((y + 1) % N) * N + x;
    let nx = -(H[xr] - H[xl]) * k * 8, ny = -(H[yu] - H[yd]) * k * 8; const l = Math.hypot(nx, ny, 1); nx /= l; ny /= l;
    nor[o] = (nx * 0.5 + 0.5) * 255; nor[o + 1] = (ny * 0.5 + 0.5) * 255; nor[o + 2] = (1 / l * 0.5 + 0.5) * 255; nor[o + 3] = 255;
    const r = Math.max(0.04, Math.min(1, R[i])) * 255; rou[o] = rou[o + 1] = rou[o + 2] = r; rou[o + 3] = 255;
  }
  const out = { map: dataTexture(alb, N, true), normalMap: dataTexture(nor, N, false), roughnessMap: dataTexture(rou, N, false), tile: info.tile, normalScale: info.normal };
  CACHE.set(key, out); return out;
}

/** Map an architecture material key ('stone.basalt', 'tile.roof', ...) to a surface family/variant. */
export function familyOf(key) {
  const [group, kind] = key.split('.');
  if (group === 'stone') return ['ashlar', kind];
  if (group === 'paving') return ['paving', kind];
  if (group === 'ground') return ['paving', 'rock'];
  if (group === 'rock') return ['cliff', ''];
  if (group === 'concrete') return ['concrete', ''];
  if (group === 'metal') return ['metal', ''];
  if (group === 'wood') return ['wood', ''];
  if (group === 'tile') return ['roof', ''];
  if (group === 'cloth') return ['cloth', ''];
  if (group === 'plaster') return ['plaster', ''];
  if (group === 'bark') return ['bark', ''];
  if (group === 'foliage') return ['foliage', ''];
  if (group === 'ice') return ['ice', ''];
  return null;
}

/**
 * Falling-water sheet: vertical foam streaks with transparent gaps (RGBA, alpha = coverage) plus a
 * ripple normal map for still water. Scrolled by the runtime (texture.offset.y) for motion.
 */
export function fallMaps(N = 256) {
  const key = `fall:${N}`; if (CACHE.has(key)) return CACHE.get(key);
  const { lo, mid, hi } = tables(N);
  const fall = new Uint8Array(N * N * 4), ripple = new Uint8Array(N * N * 4);
  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, o = i * 4;
    // streaks: noise stretched 16x along the fall direction
    const s = tap(mid, N, x, (y / 16) | 0, 1, 0, 0) * 0.6 + tap(hi, N, x, (y / 8) | 0, 1, 0, 0) * 0.4;
    const foam = smooth(0.32, 0.75, s); const c = 0.78 + foam * 0.22;
    fall[o] = c * 225; fall[o + 1] = c * 242; fall[o + 2] = c * 250; fall[o + 3] = (0.32 + foam * 0.68) * 255;
    H[i] = tap(mid, N, x, y, 1) * 0.6 + tap(lo, N, x, y, 2) * 0.4;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, o = i * 4;
    let nx = -(H[y * N + (x + 1) % N] - H[y * N + (x + N - 1) % N]) * 6, ny = -(H[((y + 1) % N) * N + x] - H[((y + N - 1) % N) * N + x]) * 6; const l = Math.hypot(nx, ny, 1);
    ripple[o] = (nx / l * 0.5 + 0.5) * 255; ripple[o + 1] = (ny / l * 0.5 + 0.5) * 255; ripple[o + 2] = (0.5 / l + 0.5) * 255; ripple[o + 3] = 255;
  }
  const out = { fall: dataTexture(fall, N, true), ripple: dataTexture(ripple, N, false) };
  CACHE.set(key, out); return out;
}

/** Lava: dark cooled crust plates (albedo/normal) and a glowing crack network (emissive map). */
export function lavaMaps(N = 256) {
  const key = `lava:${N}`; if (CACHE.has(key)) return CACHE.get(key);
  const { lo, mid, hi } = tables(N); const alb = new Uint8Array(N * N * 4), emi = new Uint8Array(N * N * 4), nor = new Uint8Array(N * N * 4); const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, o = i * 4; const m = tap(mid, N, x, y), l = tap(lo, N, x, y), g = tap(hi, N, x, y);
    const crack = 1 - smooth(0.0, 0.11, Math.abs(m - 0.5)); const pool = smooth(0.46, 0.6, l); const glow = Math.min(1, crack * 0.9 + pool + (g > 0.9 ? 0.4 : 0));
    const crust = (0.16 + g * 0.08) * (1 - glow);
    alb[o] = (crust + glow * 0.5) * 255; alb[o + 1] = (crust * 0.9 + glow * 0.2) * 255; alb[o + 2] = crust * 0.8 * 255; alb[o + 3] = 255;
    emi[o] = glow * 255; emi[o + 1] = glow * glow * 170; emi[o + 2] = glow * glow * glow * 60; emi[o + 3] = 255; H[i] = (1 - glow) * (0.5 + g * 0.3);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x, o = i * 4; let nx = -(H[y * N + (x + 1) % N] - H[y * N + (x + N - 1) % N]) * 4, ny = -(H[((y + 1) % N) * N + x] - H[((y + N - 1) % N) * N + x]) * 4; const l = Math.hypot(nx, ny, 1); nor[o] = (nx / l * 0.5 + 0.5) * 255; nor[o + 1] = (ny / l * 0.5 + 0.5) * 255; nor[o + 2] = (0.5 / l + 0.5) * 255; nor[o + 3] = 255; }
  const out = { map: dataTexture(alb, N, true), emissiveMap: dataTexture(emi, N, true), normalMap: dataTexture(nor, N, false) };
  for (const t of Object.values(out)) t.repeat.set(1 / 5, 1 / 5);
  CACHE.set(key, out); return out;
}

/**
 * Banner cloth texture for an oath: field colour, trim border, a hem band and the oath emblem.
 * UV 0..1 with v=1 at the top (matches Builder.cloth). polys: emblem polygons in unit space.
 */
export function bannerTexture(polys, field, trim, emblem, W = 128, Hh = 320) {
  const f = new THREE.Color(field), t = new THREE.Color(trim), e = new THREE.Color(emblem);
  const toS = (c) => [c.r, c.g, c.b].map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  const F = toS(f), Tt = toS(t), E = toS(e);
  const data = new Uint8Array(W * Hh * 4);
  const inside = (px, py, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const ecx = W / 2, ecy = Hh * 0.66, es = W * 0.32;
  const { mid, hi } = tables(128);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4; let col = F;
    const bx = Math.min(x, W - 1 - x), top = Hh - 1 - y;
    if (bx < 6 || (top > 14 && top < 20) || (y > Hh * 0.18 && y < Hh * 0.18 + 4) || (bx > 9 && bx < 11)) col = Tt;
    let cover = 0;
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) { const ux = (x + 0.25 + sx * 0.5 - ecx) / es, uy = (y + 0.25 + sy * 0.5 - ecy) / es; for (const p of polys) if (inside(-ux, uy, p)) { cover++; break; } }
    const weave = 0.93 + 0.07 * (((x + y) & 1) ? 1 : 0.4) + (tap(mid, 128, x % 128, y % 128) - 0.5) * 0.12 + (tap(hi, 128, x % 128, y % 128) - 0.5) * 0.06;
    for (let c = 0; c < 3; c++) { const v = (col[c] * (1 - cover / 4) + E[c] * (cover / 4)) * weave; data[o + c] = Math.max(0, Math.min(255, v * 255)); }
    data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, W, Hh, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true; tex.anisotropy = 4; tex.needsUpdate = true;
  return tex;
}
