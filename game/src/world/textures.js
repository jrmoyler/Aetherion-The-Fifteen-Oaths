// Procedural, tileable ground material layers generated in code (no image files).
// Each layer: albedo RGBA8 (sRGB rgb + height in a) and normal RGBA8 (nx, ny, roughness, ao).
// Pure JS (runs in the terrain worker).
import { LAYERS } from './surface.js';

function rng(seed) { let s = (seed * 2654435761) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

class Gen {
  constructor(N) { this.N = N; }
  field() { return new Float32Array(this.N * this.N); }
  /** tileable value-noise fbm, f0 = base lattice cells across the tile; ax/ay anisotropy multipliers */
  fbm(f0, oct, seed, gain = 0.5, ax = 1, ay = 1) {
    const N = this.N, out = this.field(), r = rng(seed); let amp = 1, tot = 0;
    for (let o = 0; o < oct; o++) {
      const fx = Math.max(1, Math.round(f0 * ax * (1 << o))), fy = Math.max(1, Math.round(f0 * ay * (1 << o)));
      const lat = new Float32Array(fx * fy); for (let i = 0; i < lat.length; i++) lat[i] = r() * 2 - 1;
      for (let y = 0; y < N; y++) {
        const gy = (y / N) * fy, iy = Math.floor(gy), ty = gy - iy, sy = ty * ty * (3 - 2 * ty);
        const y0 = (iy % fy) * fx, y1 = ((iy + 1) % fy) * fx;
        for (let x = 0; x < N; x++) {
          const gx = (x / N) * fx, ix = Math.floor(gx), tx = gx - ix, sx = tx * tx * (3 - 2 * tx);
          const x0 = ix % fx, x1 = (ix + 1) % fx;
          const a = lat[y0 + x0], b = lat[y0 + x1], c = lat[y1 + x0], d = lat[y1 + x1];
          out[y * N + x] += amp * (a + (b - a) * sx + (c - a + (d - c - b + a) * sx) * sy);
        }
      }
      tot += amp; amp *= gain;
    }
    for (let i = 0; i < out.length; i++) out[i] = out[i] / tot * 0.5 + 0.5;
    return out;
  }
  /** tileable voronoi: returns {f1, f2, id} fields (distances in cell units) */
  voronoi(cells, seed, jitter = 0.85, sy = 1) {
    const N = this.N, cx = cells, cy = Math.max(1, Math.round(cells * sy)); const r = rng(seed);
    const px = new Float32Array(cx * cy), py = new Float32Array(cx * cy), pid = new Float32Array(cx * cy);
    for (let i = 0; i < cx * cy; i++) { px[i] = 0.5 + (r() - 0.5) * jitter; py[i] = 0.5 + (r() - 0.5) * jitter; pid[i] = r(); }
    const f1 = this.field(), f2 = this.field(), id = this.field();
    for (let y = 0; y < N; y++) {
      const gy = (y / N) * cy, iy = Math.floor(gy), fy = gy - iy;
      for (let x = 0; x < N; x++) {
        const gx = (x / N) * cx, ix = Math.floor(gx), fx = gx - ix;
        let d1 = 9, d2 = 9, best = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const cxi = (ix + ox + cx) % cx, cyi = (iy + oy + cy) % cy; const k = cyi * cx + cxi;
          const dx = ox + px[k] - fx, dy = (oy + py[k] - fy) * sy; const d = Math.sqrt(dx * dx + dy * dy);
          if (d < d1) { d2 = d1; d1 = d; best = pid[k]; } else if (d < d2) d2 = d;
        }
        const i = y * N + x; f1[i] = d1; f2[i] = d2; id[i] = best;
      }
    }
    return { f1, f2, id };
  }
}

const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ss = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
function ramp(stops, t) { // stops: [[t, color], ...]
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const a = stops[i - 1], b = stops[i]; return mix3(a[1], b[1], (t - a[0]) / (b[0] - a[0])); }
  return stops[stops.length - 1][1];
}

/** Build one layer. Returns {alb: Uint8Array(N*N*4), nrm: Uint8Array(N*N*4)} */
export function buildLayer(name, N, seed = 1) {
  const g = new Gen(N); const NN = N * N;
  const H = g.field(); const C = new Float32Array(NN * 3); const R = g.field(); let nStr = 1;
  const put = (i, c, h, r) => { C[i * 3] = c[0]; C[i * 3 + 1] = c[1]; C[i * 3 + 2] = c[2]; H[i] = h; R[i] = r; };
  switch (name) {
    case 'grass': case 'dryGrass': {
      const blades = g.fbm(20, 4, seed, 0.6); const clump = g.fbm(4, 4, seed + 1); const fine = g.fbm(48, 2, seed + 2); const tufts = g.voronoi(26, seed + 3, 0.95);
      const lush = name === 'grass';
      const A = lush ? [hex(0x2a3a14), hex(0x40541d), hex(0x5d6a2a), hex(0x8a8540)] : [hex(0x5a4a2a), hex(0x7d6a3e), hex(0x9d8a56), hex(0xb7a676)];
      for (let i = 0; i < NN; i++) { const tf = ss(0.45, 0.0, tufts.f1[i]) * (0.5 + tufts.id[i] * 0.5); const t = sat(blades[i] * 0.45 + clump[i] * 0.45 + tf * 0.25 - 0.1); const c = ramp([[0, A[0]], [0.4, A[1]], [0.75, A[2]], [1, A[3]]], t);
        const dirt = ss(0.72, 0.85, 1 - clump[i]) * 0.5; put(i, mix3(c, hex(0x4a3a28), dirt * fine[i]), blades[i] * 0.4 + clump[i] * 0.3 + tf * 0.3, 0.88); }
      nStr = 2.2; break;
    }
    case 'soil': case 'earth': case 'crimson': case 'mud': {
      const base = g.fbm(6, 5, seed); const peb = g.voronoi(18, seed + 3, 0.9); const fine = g.fbm(40, 2, seed + 4); const ruts = g.fbm(2, 3, seed + 5, 0.5, 1, 4);
      const cols = { soil: [hex(0x2e2218), hex(0x4a3726), hex(0x6a543c)], earth: [hex(0x4a3a26), hex(0x6a5436), hex(0x8a7454)], crimson: [hex(0x3a120e), hex(0x5e1e16), hex(0x7e3a2a)], mud: [hex(0x1a1610), hex(0x2c251a), hex(0x3c3424)] }[name];
      for (let i = 0; i < NN; i++) {
        const p = ss(0.38, 0.2, peb.f1[i]) * (name === 'mud' ? 0.2 : 1);
        let c = ramp([[0, cols[0]], [0.5, cols[1]], [1, cols[2]]], sat(base[i] * 0.8 + fine[i] * 0.3 - 0.05));
        c = mix3(c, mix3(cols[2], hex(0x8a8070), 0.4 + peb.id[i] * 0.3), p * 0.8);
        let h = base[i] * 0.5 + p * 0.5 + fine[i] * 0.1; if (name === 'earth') h -= ss(0.45, 0.55, ruts[i]) * ss(0.65, 0.55, ruts[i]) * 0.3;
        put(i, c, h, name === 'mud' ? 0.3 + fine[i] * 0.2 : 0.9 - p * 0.1);
      }
      nStr = name === 'mud' ? 1 : 3; break;
    }
    case 'rock': case 'basalt': case 'shale': case 'limestone': case 'strata': {
      const big = g.fbm(3, 6, seed, 0.55); const crk = g.voronoi(7, seed + 7, 0.95); const fine = g.fbm(28, 3, seed + 8); const lich = name === 'strata' ? g.fbm(14, 3, seed + 9, 0.5, 1, 0.12) : g.fbm(10, 3, seed + 9);
      const bands = g.fbm(2, 4, seed + 10, 0.5, 1, 1);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x; const v = y / N; const edge = crk.f2[i] - crk.f1[i];
        const crack = ss(0.08, 0.0, edge);
        let c, h, r = 0.75;
        if (name === 'rock') {
          c = ramp([[0, hex(0x3a3836)], [0.5, hex(0x5c5955)], [1, hex(0x86817a)]], sat(big[i] * 0.9 + fine[i] * 0.25 - 0.05));
          c = mix3(c, hex(0x5a6040), ss(0.62, 0.8, lich[i]) * 0.35);
          h = big[i] * 0.6 + fine[i] * 0.25 - crack * 0.4;
        } else if (name === 'basalt') {
          const col = g.N && crk; // columnar cells
          c = ramp([[0, hex(0x0e0d0c)], [0.6, hex(0x1e1c1a)], [1, hex(0x34302c)]], sat(big[i] * 0.6 + crk.id[i] * 0.4 + fine[i] * 0.2 - 0.1));
          c = mix3(c, hex(0x4a4440), ss(0.7, 0.9, fine[i]) * 0.3); // ash dust
          h = 0.6 + crk.id[i] * 0.2 - crack * 0.6 + fine[i] * 0.15; r = 0.8; void col;
        } else if (name === 'shale') {
          const plate = Math.abs(Math.sin((v * 22 + bands[i] * 3) * Math.PI));
          c = ramp([[0, hex(0x1e2024)], [0.5, hex(0x34373c)], [1, hex(0x52565c)]], sat(big[i] * 0.6 + plate * 0.3 + fine[i] * 0.2 - 0.1));
          h = plate * 0.4 + big[i] * 0.4 - crack * 0.3 + fine[i] * 0.1; r = 0.65;
        } else if (name === 'limestone') {
          const pits = g.N && fine;
          c = ramp([[0, hex(0xa29a88)], [0.5, hex(0xcfc6b2)], [1, hex(0xe8e0cf)]], sat(big[i] * 0.7 + fine[i] * 0.3 - crack * 0.4));
          c = mix3(c, hex(0x6a6a50), ss(0.7, 0.85, lich[i]) * 0.25);
          h = big[i] * 0.6 + fine[i] * 0.2 - crack * 0.35 - ss(0.75, 0.9, pits[i]) * 0.2; r = 0.8;
        } else { // strata: horizontal sandstone bands along v (world-up in side projections)
          const t = v * 7 + bands[i] * 2.2 + big[i] * 0.6;
          const band = t - Math.floor(t);
          const hue = ((Math.floor(t) % 5) + 5) % 5;
          const pal = [hex(0xa87252), hex(0xbc8a62), hex(0x9a6448), hex(0xc89c70), hex(0xb07a56)][hue];
          const next = [hex(0xbc8a62), hex(0x9a6448), hex(0xc89c70), hex(0xb07a56), hex(0xa87252)][hue];
          c = mix3(pal, next, ss(0.55, 1.0, band) * 0.5);
          c = mix3(c, hex(0x6e4430), ss(0.9, 1.0, band) * 0.35);
          const streak = g.N && lich; c = mix3(c, hex(0x5a3c2c), ss(0.6, 0.85, streak[i]) * 0.25); // vertical weathering
          c = mix3(c, hex(0xe2c49a), fine[i] * 0.15);
          h = 0.5 + 0.3 * ss(0.0, 0.15, band) - 0.3 * ss(0.8, 1, band) + fine[i] * 0.2 - crack * 0.2; r = 0.85;
        }
        put(i, c, sat(h), r);
      }
      nStr = 3.2; break;
    }
    case 'sand': {
      const rip = g.fbm(2, 3, seed); const fine = g.fbm(48, 2, seed + 1); const big = g.fbm(4, 4, seed + 2);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; const w = Math.sin((y / N * 14 + rip[i] * 4) * Math.PI * 2) * 0.5 + 0.5;
        put(i, ramp([[0, hex(0x9a8a6a)], [0.5, hex(0xc2b08a)], [1, hex(0xdccaa4)]], sat(big[i] * 0.6 + w * 0.2 + fine[i] * 0.3)), w * 0.6 + fine[i] * 0.3, 0.95); }
      nStr = 1.4; break;
    }
    case 'snow': case 'ice': {
      const big = g.fbm(3, 5, seed); const fine = g.fbm(36, 2, seed + 1); const crk = g.voronoi(5, seed + 2);
      for (let i = 0; i < NN; i++) {
        if (name === 'snow') put(i, ramp([[0, hex(0xb8c2cc)], [0.6, hex(0xe0e6ec)], [1, hex(0xf6f8fa)]], sat(big[i] * 0.8 + fine[i] * 0.3)), big[i] * 0.8 + fine[i] * 0.2, 0.55 + fine[i] * 0.2);
        else { const cr = ss(0.05, 0.0, crk.f2[i] - crk.f1[i]); put(i, mix3(ramp([[0, hex(0x4a6a84)], [0.6, hex(0x86a8c0)], [1, hex(0xc4dae6)]], big[i]), hex(0xe8f2f8), cr * 0.7), 0.6 + big[i] * 0.3 - cr * 0.3, 0.12 + cr * 0.4); }
      }
      nStr = name === 'snow' ? 0.8 : 1.2; break;
    }
    case 'moss': {
      const clump = g.fbm(8, 5, seed, 0.6); const fine = g.fbm(40, 2, seed + 1); const leaf = g.voronoi(14, seed + 2);
      for (let i = 0; i < NN; i++) { const l = ss(0.3, 0.1, leaf.f1[i]) * ss(0.4, 0.7, clump[i] * 0.5 + leaf.id[i] * 0.5);
        let c = ramp([[0, hex(0x1e2a0e)], [0.5, hex(0x34481a)], [1, hex(0x5a6a26)]], sat(clump[i] * 0.8 + fine[i] * 0.3));
        c = mix3(c, mix3(hex(0x5a3a1e), hex(0x8a6a2e), leaf.id[i]), l * 0.6); // leaf litter
        put(i, c, clump[i] * 0.7 + fine[i] * 0.2 + l * 0.2, 0.95); }
      nStr = 2.4; break;
    }
    case 'marble': case 'cobble': {
      const cells = g.voronoi(name === 'cobble' ? 13 : 22, seed, 0.85, 1); const fine = g.fbm(32, 3, seed + 1); const big = g.fbm(3, 3, seed + 2);
      for (let i = 0; i < NN; i++) {
        const e = cells.f2[i] - cells.f1[i]; const stone = ss(0.02, name === 'cobble' ? 0.14 : 0.2, e);
        const sc = name === 'cobble' ? ramp([[0, hex(0x5a554c)], [0.5, hex(0x6e685e)], [1, hex(0x857e72)]], sat(cells.id[i] * 0.45 + fine[i] * 0.35 + big[i] * 0.3 - 0.05))
          : ramp([[0, hex(0x9a948a)], [0.5, hex(0xc8c2b8)], [1, hex(0xe6e2da)]], sat(cells.id[i] * 0.6 + fine[i] * 0.4));
        const mortar = name === 'cobble' ? hex(0x4a4032) : hex(0x6a6052);
        put(i, mix3(mortar, sc, stone), stone * (0.6 + 0.4 * Math.sqrt(sat(e * 3))) + fine[i] * 0.1, 0.62 + (1 - stone) * 0.3);
      }
      nStr = name === 'cobble' ? 2.2 : 3; break;
    }
    case 'lava': {
      const crk = g.voronoi(5, seed, 0.9); const big = g.fbm(4, 5, seed + 1); const fine = g.fbm(30, 2, seed + 2);
      for (let i = 0; i < NN; i++) { const e = crk.f2[i] - crk.f1[i]; const c = ss(0.16, 0.0, e);
        put(i, mix3(ramp([[0, hex(0x0a0908)], [1, hex(0x262220)]], sat(big[i] * 0.7 + fine[i] * 0.3)), hex(0x3a1608), c), sat(0.75 - c * 0.7 + fine[i] * 0.1 + big[i] * 0.15), 0.75 - c * 0.3); }
      nStr = 2.5; break;
    }
    default: for (let i = 0; i < NN; i++) put(i, [0.5, 0.5, 0.5], 0.5, 0.8);
  }
  // normal from height (Sobel, wrapped), AO from local cavity
  const alb = new Uint8Array(NN * 4), nrm = new Uint8Array(NN * 4);
  const blur = g.field(); const rr = Math.max(2, N >> 6);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let s = 0, n = 0;
    for (let k = -rr; k <= rr; k += rr) for (let j = -rr; j <= rr; j += rr) { s += H[((y + k + N) % N) * N + ((x + j + N) % N)]; n++; }
    blur[y * N + x] = s / n; }
  const k = nStr * N / 256;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const xm = (x - 1 + N) % N, xp = (x + 1) % N, ym = (y - 1 + N) % N, yp = (y + 1) % N;
    const dx = (H[y * N + xp] - H[y * N + xm]) * k; const dy = (H[yp * N + x] - H[ym * N + x]) * k;
    const l = Math.hypot(dx, dy, 1);
    nrm[i * 4] = (-dx / l * 0.5 + 0.5) * 255; nrm[i * 4 + 1] = (-dy / l * 0.5 + 0.5) * 255;
    nrm[i * 4 + 2] = sat(R[i]) * 255; nrm[i * 4 + 3] = sat(1 - Math.max(0, blur[i] - H[i]) * 2.5) * 255;
    // store albedo as sRGB
    alb[i * 4] = Math.pow(sat(C[i * 3]), 1) * 255; alb[i * 4 + 1] = sat(C[i * 3 + 1]) * 255; alb[i * 4 + 2] = sat(C[i * 3 + 2]) * 255; alb[i * 4 + 3] = sat(H[i]) * 255;
  }
  return { alb, nrm };
}

export function buildLayers(indices, N) {
  return indices.map((li) => ({ index: li, ...buildLayer(LAYERS[li], N, 101 + li * 17) }));
}
