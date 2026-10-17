// Pure terrain computations (worker or main thread): quadtree node vertex data with per-node
// material slots, vegetation scatter per cell, coarse world heightmap for water depth.
import { sampleTerrain } from '@shared/terrain.js';
import { classify, cobbleFraction, NLAYERS, speciesDensity, SPECIES } from './surface.js';

export const SLOTS = 8;
const S = { h: 0, lava: 0, road: 0, roadW: 0, coast: 0, plaza: 0 };

/**
 * Build vertex data for a terrain node. res = quads per side. Includes a skirt ring.
 * Positions are local to (x0, z0). Returns typed arrays + material slots.
 */
export function buildNode(x0, z0, size, res, skirtDepth) {
  const n = res + 1, b = res + 3, step = size / res;
  const hb = new Float32Array(b * b);
  const sv = new Array(n * n); // terrain samples of interior vertices
  for (let j = 0; j < b; j++) for (let i = 0; i < b; i++) {
    const x = x0 + (i - 1) * step, z = z0 + (j - 1) * step;
    const s = sampleTerrain(x, z, S);
    hb[j * b + i] = s.h;
    if (i >= 1 && i <= n && j >= 1 && j <= n) sv[(j - 1) * n + (i - 1)] = { h: s.h, lava: s.lava, road: s.road, roadW: s.roadW, coast: s.coast, plaza: s.plaza };
  }
  const vcount = n * n + 4 * res;
  const pos = new Float32Array(vcount * 3), nrm = new Float32Array(vcount * 3);
  const w0 = new Float32Array(vcount * 4), w1 = new Float32Array(vcount * 4), aux = new Float32Array(vcount * 4), col = new Float32Array(vcount * 4);
  const wAll = new Float32Array(n * n * NLAYERS);
  const tmpW = new Float32Array(NLAYERS), tint = [1, 1, 1];
  const totals = new Float64Array(NLAYERS);
  let minY = Infinity, maxY = -Infinity;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = j * n + i; const bi = (j + 1) * b + (i + 1);
    const h = hb[bi];
    const hx = hb[bi + 1] - hb[bi - 1], hz = hb[bi + b] - hb[bi - b];
    let nx = -hx, ny = 2 * step, nz = -hz; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    pos[v * 3] = i * step; pos[v * 3 + 1] = h; pos[v * 3 + 2] = j * step;
    nrm[v * 3] = nx; nrm[v * 3 + 1] = ny; nrm[v * 3 + 2] = nz;
    if (h < minY) minY = h; if (h > maxY) maxY = h;
    const x = x0 + i * step, z = z0 + j * step; const s = sv[v];
    classify(x, z, s, ny, tmpW, tint);
    for (let k = 0; k < NLAYERS; k++) { wAll[v * NLAYERS + k] = tmpW[k]; totals[k] += tmpW[k] + (tmpW[k] > 0.02 ? 0.5 : 0); }
    aux[v * 4] = s.road; aux[v * 4 + 1] = cobbleFraction(x, z); aux[v * 4 + 2] = s.lava; aux[v * 4 + 3] = s.coast;
    col[v * 4] = tint[0]; col[v * 4 + 1] = tint[1]; col[v * 4 + 2] = tint[2]; col[v * 4 + 3] = 1;
  }
  // choose the SLOTS most used layers in this node
  const order = Array.from({ length: NLAYERS }, (_, k) => k).sort((a, c) => totals[c] - totals[a]);
  const slots = order.slice(0, SLOTS).map((k) => (totals[k] > 0 ? k : -1));
  for (let v = 0; v < n * n; v++) {
    let sum = 0; const ws = [];
    for (let s = 0; s < SLOTS; s++) { const k = slots[s]; const w = k >= 0 ? wAll[v * NLAYERS + k] : 0; ws.push(w); sum += w; }
    if (sum < 1e-5) { ws[0] = 1; sum = 1; }
    for (let s = 0; s < 4; s++) { w0[v * 4 + s] = ws[s] / sum; w1[v * 4 + s] = ws[s + 4] / sum; }
  }
  // skirt: duplicate the border ring pushed downward
  let sk = n * n; const ring = [];
  for (let i = 0; i < res; i++) ring.push(i);                 // bottom edge j=0
  for (let j = 0; j < res; j++) ring.push(j * n + res);       // right edge
  for (let i = res; i > 0; i--) ring.push(res * n + i);       // top edge
  for (let j = res; j > 0; j--) ring.push(j * n);             // left edge
  for (const v of ring) {
    pos[sk * 3] = pos[v * 3]; pos[sk * 3 + 1] = pos[v * 3 + 1] - skirtDepth; pos[sk * 3 + 2] = pos[v * 3 + 2];
    for (let c = 0; c < 3; c++) nrm[sk * 3 + c] = nrm[v * 3 + c];
    for (let c = 0; c < 4; c++) { w0[sk * 4 + c] = w0[v * 4 + c]; w1[sk * 4 + c] = w1[v * 4 + c]; aux[sk * 4 + c] = aux[v * 4 + c]; col[sk * 4 + c] = col[v * 4 + c]; }
    sk++;
  }
  return { pos, nrm, w0, w1, aux, col, slots, minY: minY - skirtDepth, maxY, heights: hb, res };
}

/** Index buffer for a node of `res` quads incl. skirts (identical for every node of that res). */
export function buildIndices(res) {
  const n = res + 1; const idx = [];
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const a = j * n + i, b2 = a + 1, c = a + n, d = c + 1;
    // alternate diagonal for nicer shading
    if ((i + j) & 1) idx.push(a, b2, c, b2, d, c); else idx.push(a, d, c, a, b2, d);
  }
  const ring = [];
  for (let i = 0; i < res; i++) ring.push(i);
  for (let j = 0; j < res; j++) ring.push(j * n + res);
  for (let i = res; i > 0; i--) ring.push(res * n + i);
  for (let j = res; j > 0; j--) ring.push(j * n);
  const base = n * n, R = ring.length;
  for (let k = 0; k < R; k++) {
    const a = ring[k], b2 = ring[(k + 1) % R], sa = base + k, sb = base + ((k + 1) % R);
    idx.push(a, b2, sa, b2, sb, sa, a, sa, b2, b2, sa, sb); // both windings (skirts seen from either side)
  }
  return n * n + R > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
}

function hash(a, b, c) { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

/**
 * Scatter vegetation/rocks in a square cell. Returns {counts:Int32Array(species), data: Float32Array}
 * data: per instance [species, x, y, z, rotY, scale, tiltX, tiltZ].
 */
export function scatterCell(cx, cz, size, densityMul = 1) {
  const step = 4; const n = Math.round(size / step);
  const dens = new Float32Array(SPECIES.length);
  const out = [];
  const counts = new Int32Array(SPECIES.length);
  const ix0 = Math.round(cx / step), iz0 = Math.round(cz / step);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const gi = ix0 + i, gj = iz0 + j;
    const r0 = hash(gi, gj, 1), r1 = hash(gi, gj, 2), r2 = hash(gi, gj, 3), r3 = hash(gi, gj, 4);
    const x = cx + (i + 0.1 + 0.8 * r0) * step, z = cz + (j + 0.1 + 0.8 * r1) * step;
    const s = sampleTerrain(x, z, S); const h = s.h, lava = s.lava, road = s.road, coast = s.coast, plaza = s.plaza, roadW = s.roadW;
    if (h < 0.3) continue;
    const hx = sampleTerrain(x + 1.5, z, S).h - sampleTerrain(x - 1.5, z, S).h;
    const hz = sampleTerrain(x, z + 1.5, S).h - sampleTerrain(x, z - 1.5, S).h;
    const ny = 3 / Math.hypot(hx, 3, hz);
    speciesDensity(x, z, { h, lava, road, coast, plaza, roadW }, ny, dens);
    let tot = 0; for (let k = 0; k < dens.length; k++) tot += dens[k];
    const p = tot * step * step * densityMul; if (p <= 0) continue;
    if (r2 > p) continue;
    let pick = r3 * tot, sp = 0;
    for (; sp < dens.length - 1; sp++) { pick -= dens[sp]; if (pick <= 0) break; }
    const sc = 0.7 + 0.6 * hash(gi, gj, 5);
    out.push(sp, x, h, z, hash(gi, gj, 6) * Math.PI * 2, sc, hx / 3 * 0.5, hz / 3 * 0.5);
    counts[sp]++;
  }
  return { counts, data: new Float32Array(out) };
}

/** Coarse world heightmap (N×N over [-E, E]²) for water depth shading. */
export function buildHeightmap(N, E) {
  const hm = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) hm[j * N + i] = sampleTerrain(-E + (2 * E * (i + 0.5)) / N, -E + (2 * E * (j + 0.5)) / N, S).h;
  return hm;
}
