// Procedural material definitions. Each entry describes how to bake a tileable PBR texture set
// (albedo / normal / ORM [+ emissive]) entirely in code, plus physical defaults.
// gen(u, v, o) fills: o.h (height 0..1), o.r o.g o.b (sRGB albedo 0..1), o.rough, o.metal,
// optional o.er o.eg o.eb (emissive sRGB). Post-processing adds cavity AO, crevice grime and
// convex edge wear so surfaces never read as flat plastic.
import { fbm, fbm2, ridgedf, voronoi, voronoiEdge, ashlar, hexCell, hash2, smooth, clamp01, lerp } from './noise.js';

const V = {}; const VE = {}; const A = {}; const H = {};

function stoneBlocks(u, v, o, cfg) {
  const { rows, cols, tile, base, var: cv, mortar = 0.012, bevel = 0.03, rough = 0.75, seed = 1, irr = 0.6, mortarCol = null } = cfg;
  const a = ashlar(u, v, rows, cols, tile[0], tile[1], seed, irr, A);
  const bn = hash2(a.id & 255, (a.id >> 8) & 255, seed);
  const n1 = fbm(u, v, 8, 4, seed + 3);
  const n2 = fbm(u, v, 32, 3, seed + 9);
  const bevelH = smooth(mortar, mortar + bevel, a.d);
  const chip = smooth(0.35, 0.75, fbm(u, v, 24, 3, seed + 21)) * (1 - smooth(mortar, mortar + bevel * 3, a.d));
  const h = bevelH * (0.82 + 0.1 * bn + 0.05 * n1 + 0.03 * n2) - chip * 0.25;
  const k = 1 + (bn - 0.5) * cv + n1 * 0.08 + n2 * 0.05;
  const m = mortarCol || [base[0] * 0.65, base[1] * 0.63, base[2] * 0.6];
  const t = bevelH;
  o.h = clamp01(h);
  o.r = lerp(m[0], base[0] * k, t); o.g = lerp(m[1], base[1] * k, t); o.b = lerp(m[2], base[2] * k, t);
  o.rough = lerp(0.95, rough + n2 * 0.08, t); o.metal = 0;
  return a;
}

export const MATERIALS = {
  'stone.basalt': {
    size: [3, 3], normal: 2.2,
    gen(u, v, o) {
      stoneBlocks(u, v, o, { rows: 5, cols: 3, tile: [3, 3], base: [0.17, 0.16, 0.155], var: 0.35, rough: 0.72, seed: 11 });
      const p = smooth(0.55, 0.8, fbm(u, v, 48, 2, 4)); o.h -= p * 0.06; o.r *= 1 - p * 0.3; o.g *= 1 - p * 0.3; o.b *= 1 - p * 0.3;
    },
  },
  'stone.marble': {
    size: [7, 7], normal: 1.0,
    gen(u, v, o) {
      const a = stoneBlocks(u, v, o, { rows: 4, cols: 2, tile: [4, 4], base: [0.9, 0.885, 0.85], var: 0.08, mortar: 0.006, bevel: 0.015, rough: 0.28, seed: 5, irr: 0.3, mortarCol: [0.72, 0.70, 0.66] });
      const w = fbm(u, v, 3, 5, 31) * 3.2;
      const vein = Math.pow(1 - Math.abs(Math.sin((u * 2 + v * 3) * Math.PI * 2 + w * 3)), 14);
      const vein2 = Math.pow(1 - Math.abs(Math.sin((u * 5 - v * 2) * Math.PI * 2 + w * 5 + (a.id & 7))), 30);
      const g = vein * 0.32 + vein2 * 0.18;
      o.r -= g * 0.9; o.g -= g * 0.88; o.b -= g * 0.8;
      o.rough += g * 0.1;
    },
  },
  'stone.limestone': {
    size: [3, 3], normal: 1.6,
    gen(u, v, o) {
      stoneBlocks(u, v, o, { rows: 5, cols: 3, tile: [3, 3], base: [0.86, 0.82, 0.72], var: 0.12, rough: 0.78, seed: 7, mortarCol: [0.66, 0.62, 0.54] });
      const pit = smooth(0.62, 0.8, fbm(u, v, 64, 2, 13)); o.h -= pit * 0.05; o.r -= pit * 0.12; o.g -= pit * 0.12; o.b -= pit * 0.12;
      const st = smooth(0.2, 0.9, fbm2(u, v, 2, 12, 3, 17)) * 0.08; o.r -= st; o.g -= st * 1.05; o.b -= st * 1.15;
    },
  },
  'stone.sandstone': {
    size: [3, 3], normal: 1.8,
    gen(u, v, o) {
      stoneBlocks(u, v, o, { rows: 4, cols: 2, tile: [3, 3], base: [0.74, 0.56, 0.4], var: 0.22, rough: 0.88, seed: 9, irr: 0.8, bevel: 0.05 });
      const band = Math.sin((v * 22 + fbm(u, v, 3, 3, 41) * 2.2) * Math.PI) * 0.5 + 0.5;
      const k = 0.88 + band * 0.18; o.r *= k; o.g *= k * 0.98; o.b *= k * 0.95; o.h += band * 0.03;
    },
  },
  'stone.slate': {
    size: [3, 3], normal: 1.6,
    gen(u, v, o) {
      stoneBlocks(u, v, o, { rows: 6, cols: 3, tile: [3, 3], base: [0.25, 0.27, 0.3], var: 0.25, rough: 0.5, seed: 21, mortar: 0.008 });
      const cleft = fbm2(u, v, 3, 24, 3, 3) * 0.06; o.h += cleft; o.r += cleft * 0.4; o.g += cleft * 0.4; o.b += cleft * 0.5;
    },
  },
  'stone.shale': {
    size: [3, 3], normal: 2.6,
    gen(u, v, o) {
      const w = fbm(u, v, 3, 4, 77) * 0.08;
      const y = (v + w) * 18; const layer = Math.floor(y); const fy = y - layer;
      const ln = hash2(layer & 255, 3, 5);
      const lip = smooth(0.0, 0.25, fy) * (1 - smooth(0.85, 1, fy) * 0.6);
      const n = fbm(u, v, 16, 3, 61);
      o.h = clamp01(0.4 + lip * 0.4 + ln * 0.15 + n * 0.08);
      const k = 0.78 + ln * 0.35 + n * 0.1;
      o.r = 0.40 * k; o.g = 0.37 * k; o.b = 0.34 * k; o.rough = 0.82; o.metal = 0;
    },
  },
  'stone.darkgranite': {
    size: [3, 3], normal: 1.4,
    gen(u, v, o) {
      stoneBlocks(u, v, o, { rows: 5, cols: 3, tile: [3, 3], base: [0.27, 0.27, 0.28], var: 0.18, rough: 0.6, seed: 15 });
      const sp = hash2(Math.floor(u * 512) & 255, Math.floor(v * 512) & 255, 9);
      const s = sp > 0.92 ? 0.25 : sp < 0.08 ? -0.12 : 0; o.r += s * 0.5; o.g += s * 0.5; o.b += s * 0.52;
    },
  },
  'stone.terracotta': {
    size: [2, 2], normal: 1.8,
    gen(u, v, o) {
      stoneBlocks(u, v, o, { rows: 10, cols: 4, tile: [2, 2], base: [0.6, 0.3, 0.18], var: 0.3, rough: 0.82, seed: 31, irr: 0.15, mortar: 0.01, bevel: 0.02, mortarCol: [0.32, 0.28, 0.25] });
      const sc = smooth(0.5, 0.85, fbm(u, v, 10, 3, 12)); o.r *= 1 - sc * 0.35; o.g *= 1 - sc * 0.4; o.b *= 1 - sc * 0.4;
    },
  },
  'paving.flagstone': {
    size: [8, 8], normal: 1.6,
    gen(u, v, o) {
      const e = voronoiEdge(u, v, 7, 7, 0.75, 3, VE);
      const bn = hash2(e.id & 255, (e.id >> 8) & 255, 3);
      const edgeM = e.edge * (8 / 7);
      const t = smooth(0.012, 0.04, edgeM);
      const n = fbm(u, v, 12, 4, 19), n2 = fbm(u, v, 48, 2, 23);
      o.h = clamp01(t * (0.8 + bn * 0.12 + n * 0.06 + n2 * 0.03));
      const k = 0.85 + (bn - 0.5) * 0.3 + n * 0.12;
      o.r = lerp(0.3, 0.52 * k, t); o.g = lerp(0.29, 0.5 * k, t); o.b = lerp(0.27, 0.47 * k, t);
      o.rough = lerp(0.95, 0.68 + n2 * 0.1, t); o.metal = 0;
    },
  },
  'paving.slab': {
    size: [9, 9], normal: 1.3,
    gen(u, v, o) {
      stoneBlocks(u, v, o, { rows: 6, cols: 4, tile: [9, 9], base: [0.56, 0.54, 0.51], var: 0.16, mortar: 0.008, bevel: 0.025, rough: 0.7, seed: 41, irr: 0.7, mortarCol: [0.36, 0.35, 0.33] });
      const st = smooth(0.3, 0.9, fbm(u, v, 5, 4, 77)) * 0.08; o.r -= st; o.g -= st; o.b -= st * 0.9;
    },
  },
  'paving.hex': {
    // tile = 2 x-periods (6 hex units) by 3 y-periods (3*sqrt3); circumradius 0.75 m
    size: [4.5, 4.5 * (3 * Math.sqrt(3)) / 6], normal: 1.4,
    gen(u, v, o) {
      const x = u * 6; const y = v * 3 * Math.sqrt(3);
      const hc = hexCell(x, y, H);
      const W6 = 6, H6 = 3 * Math.sqrt(3);
      const bn = hash2(Math.round((((hc.cx % W6) + W6) % W6) * 4) & 255, Math.round((((hc.cy % H6) + H6) % H6) * 4) & 255, 7);
      const t = smooth(0.03, 0.09, hc.d);
      const n = fbm(u, v, 12, 3, 5);
      o.h = clamp01(t * (0.85 + bn * 0.1 + n * 0.05));
      const k = 0.85 + (bn - 0.5) * 0.28 + n * 0.1;
      o.r = lerp(0.22, 0.5 * k, t); o.g = lerp(0.21, 0.48 * k, t); o.b = lerp(0.2, 0.46 * k, t);
      o.rough = lerp(0.95, 0.62, t); o.metal = 0;
    },
  },
  'metal.brass': {
    size: [2, 2], normal: 0.6,
    gen(u, v, o) {
      const br = fbm2(u, v, 2, 96, 2, 3) * 0.5 + 0.5;
      const tar = smooth(0.15, 0.7, fbm(u, v, 6, 4, 8));
      const n = fbm(u, v, 24, 2, 4);
      o.h = 0.5 + br * 0.05 + n * 0.04;
      o.r = lerp(0.8, 0.4, tar * 0.7); o.g = lerp(0.65, 0.32, tar * 0.7); o.b = lerp(0.42, 0.2, tar * 0.7);
      o.rough = 0.28 + tar * 0.35 + br * 0.08; o.metal = 1 - tar * 0.25;
    },
  },
  'metal.copper': {
    size: [2, 2], normal: 0.7,
    gen(u, v, o) {
      const br = fbm2(u, v, 2, 80, 2, 5) * 0.5 + 0.5;
      const pat = smooth(0.35, 0.75, fbm(u, v, 5, 5, 12));
      const n = fbm(u, v, 24, 2, 4);
      o.h = 0.5 + n * 0.05 + pat * 0.06;
      o.r = lerp(0.74, 0.32, pat); o.g = lerp(0.47, 0.55, pat); o.b = lerp(0.34, 0.46, pat);
      o.rough = lerp(0.3 + br * 0.1, 0.8, pat); o.metal = lerp(1, 0.1, pat);
    },
  },
  'metal.iron': {
    size: [2, 2], normal: 1.2,
    gen(u, v, o) {
      const rust = smooth(0.25, 0.75, fbm(u, v, 5, 5, 31) * 0.8 + fbm(u, v, 30, 2, 7) * 0.3);
      const n = fbm(u, v, 20, 3, 13);
      o.h = 0.5 + rust * 0.12 + n * 0.06;
      o.r = lerp(0.3, 0.42, rust); o.g = lerp(0.29, 0.22, rust); o.b = lerp(0.28, 0.13, rust);
      o.rough = lerp(0.5 + n * 0.1, 0.9, rust); o.metal = lerp(0.95, 0.2, rust);
    },
  },
  'metal.gold': {
    size: [2, 2], normal: 0.4,
    gen(u, v, o) {
      const br = fbm2(u, v, 2, 120, 2, 9) * 0.5 + 0.5; const d = smooth(0.4, 0.8, fbm(u, v, 6, 4, 2));
      o.h = 0.5 + br * 0.03;
      o.r = lerp(0.98, 0.72, d * 0.5); o.g = lerp(0.85, 0.6, d * 0.5); o.b = lerp(0.58, 0.38, d * 0.5);
      o.rough = 0.2 + br * 0.08 + d * 0.15; o.metal = 1;
    },
  },
  'metal.steel': {
    size: [3, 3], normal: 1.2,
    gen(u, v, o) {
      const pu = u * 3, pv = v * 2; const fx = pu - Math.floor(pu), fy = pv - Math.floor(pv);
      const seam = Math.min(fx * 1, (1 - fx) * 1, fy * 1.5, (1 - fy) * 1.5);
      const t = smooth(0.004, 0.012, seam);
      const rx = Math.min(Math.abs(fx - 0.04), Math.abs(fx - 0.96)), ry = ((fy * 12) % 1) - 0.5;
      const rivet = (rx < 0.012 && Math.abs(ry) < 0.12) ? 1 - Math.hypot(rx / 0.012, ry / 0.12) : 0;
      const br = fbm2(u, v, 2, 90, 2, 21) * 0.5 + 0.5;
      const grime = smooth(0.3, 0.9, fbm(u, v, 6, 4, 33));
      const pid = hash2(Math.floor(pu) & 255, Math.floor(pv) & 255, 3);
      o.h = clamp01(0.5 * t + 0.35 + rivet * 0.3);
      const k = 0.9 + pid * 0.15 - grime * 0.25;
      o.r = 0.56 * k; o.g = 0.57 * k; o.b = 0.59 * k;
      o.rough = 0.32 + br * 0.12 + grime * 0.3; o.metal = 1 - grime * 0.2;
    },
  },
  'wood.weathered': {
    size: [2.4, 2.4], normal: 1.6,
    gen(u, v, o) {
      const rows = 8; const y = v * rows; const row = Math.floor(y); const fy = y - row;
      const off = hash2(row, 1, 4); const x = (u + off) * 2; const seg = Math.floor(x); const fx = x - seg;
      const id = hash2(row, seg & 255, 9);
      const gap = Math.min(fy, 1 - fy) * (2.4 / rows); const endGap = Math.min(fx, 1 - fx) * 1.2;
      const t = smooth(0.003, 0.012, Math.min(gap, endGap));
      const grain = fbm2(u, v + id, 3, 48, 4, 3);
      const ring = Math.sin((v * 60 + grain * 6) * Math.PI) * 0.5 + 0.5;
      o.h = clamp01(t * (0.75 + ring * 0.08 + grain * 0.1));
      const k = 0.8 + id * 0.35 + grain * 0.15;
      o.r = lerp(0.12, 0.48 * k, t); o.g = lerp(0.1, 0.4 * k, t); o.b = lerp(0.08, 0.31 * k, t);
      o.rough = 0.82; o.metal = 0;
    },
  },
  'wood.lacquer': {
    size: [2, 2], normal: 0.6,
    gen(u, v, o) {
      const grain = fbm2(u, v, 3, 40, 3, 7);
      const wear = smooth(0.62, 0.85, fbm(u, v, 8, 4, 11));
      o.h = 0.5 + grain * 0.03 - wear * 0.04;
      o.r = lerp(0.42, 0.45, wear) + grain * 0.03; o.g = lerp(0.07, 0.3, wear); o.b = lerp(0.06, 0.2, wear);
      o.rough = lerp(0.22, 0.75, wear); o.metal = 0;
    },
  },
  'glass.tinted': {
    size: [2, 2], normal: 0.25, alpha: 0.32,
    gen(u, v, o) {
      const d = smooth(0.45, 0.85, fbm(u, v, 5, 4, 3));
      o.h = 0.5 + fbm(u, v, 3, 2, 9) * 0.04;
      o.r = lerp(0.62, 0.42, d); o.g = lerp(0.74, 0.44, d); o.b = lerp(0.72, 0.38, d);
      o.rough = 0.05 + d * 0.35; o.metal = 0;
    },
  },
  'cloth.banner': {
    size: [1, 1], normal: 0.8,
    gen(u, v, o) {
      const wx = Math.sin(u * Math.PI * 2 * 96), wy = Math.sin(v * Math.PI * 2 * 96);
      const weave = (wx > 0) !== (wy > 0) ? Math.abs(wx) : Math.abs(wy);
      const n = fbm(u, v, 8, 3, 5);
      o.h = 0.5 + weave * 0.12 + n * 0.05;
      const k = 0.88 + weave * 0.08 + n * 0.08;
      o.r = 0.86 * k; o.g = 0.85 * k; o.b = 0.82 * k; o.rough = 0.92; o.metal = 0;
    },
  },
  'crystal.amethyst': {
    size: [1.5, 1.5], normal: 2.5, emissiveTex: true,
    gen(u, v, o) {
      const c = voronoi(u, v, 6, 6, 0.9, 41, V);
      const ha = hash2(c.id & 255, 3, 1) * Math.PI * 2, hb = hash2(c.id & 255, 9, 2);
      const fx = (u * 6 - c.cx), fy = (v * 6 - c.cy);
      const facet = (Math.cos(ha) * fx + Math.sin(ha) * fy) * 0.6;
      const edge = smooth(0.0, 0.1, c.f2 - c.f1);
      o.h = clamp01(0.5 + facet * 0.5 * edge);
      const k = 0.65 + hb * 0.5;
      o.r = 0.52 * k; o.g = 0.3 * k; o.b = 0.86 * k; o.rough = 0.12 + (1 - edge) * 0.2; o.metal = 0;
      const e = (1 - edge) * 0.6 + hb * 0.25; o.er = 0.55 * e; o.eg = 0.3 * e; o.eb = 0.95 * e;
    },
  },
  'ice.glacial': {
    size: [3, 3], normal: 1.2, emissiveTex: true,
    gen(u, v, o) {
      const e = voronoiEdge(u, v, 5, 5, 0.9, 13, VE);
      const crack = 1 - smooth(0.0, 0.05, e.edge);
      const n = fbm(u, v, 4, 5, 3), n2 = fbm(u, v, 20, 3, 8);
      o.h = clamp01(0.6 + n * 0.15 - crack * 0.2 + n2 * 0.04);
      const deep = smooth(-0.3, 0.5, n);
      o.r = lerp(0.42, 0.82, deep) + crack * 0.12; o.g = lerp(0.62, 0.92, deep) + crack * 0.08; o.b = lerp(0.78, 0.98, deep);
      o.rough = 0.12 + crack * 0.3 + (1 - deep) * 0.05; o.metal = 0;
      const em = (1 - deep) * 0.25; o.er = 0.25 * em; o.eg = 0.55 * em; o.eb = 0.8 * em;
    },
  },
  'bark.living': {
    size: [2, 3], normal: 2.8,
    gen(u, v, o) {
      const fur = ridgedf(u * 1, v * 1, 6, 3, 9);
      const fur2 = fbm2(u, v, 10, 2, 4, 3);
      const moss = smooth(0.15, 0.55, fbm(u, v, 4, 4, 51) + (1 - fur) * 0.3);
      o.h = clamp01(fur * 0.7 + fur2 * 0.15 + moss * 0.1);
      const k = 0.55 + fur * 0.6;
      o.r = lerp(0.36 * k, 0.3, moss); o.g = lerp(0.25 * k, 0.4, moss); o.b = lerp(0.16 * k, 0.14, moss);
      o.rough = 0.9; o.metal = 0;
    },
  },
  'emissive.lava': {
    size: [5, 5], normal: 2.4, emissiveTex: true, animated: [0.012, 0.006],
    gen(u, v, o) {
      const e = voronoiEdge(u, v, 6, 6, 0.9, 71, VE);
      const n = fbm(u, v, 6, 4, 2);
      const crack = 1 - smooth(0.02, 0.16 + n * 0.08, e.edge);
      const hot = smooth(0.1, 0.6, fbm(u, v, 3, 3, 5) * 0.5 + 0.5);
      o.h = clamp01(0.7 - crack * 0.6 + fbm(u, v, 24, 2, 7) * 0.08);
      o.r = lerp(0.1, 0.9, crack); o.g = lerp(0.07, 0.35, crack); o.b = lerp(0.06, 0.08, crack);
      o.rough = lerp(0.85, 0.4, crack); o.metal = 0;
      const em = crack * (0.6 + hot * 0.6) + hot * 0.06;
      o.er = Math.min(1, 1.0 * em); o.eg = Math.min(1, 0.36 * em * em + 0.05 * em); o.eb = 0.04 * em;
    },
  },
  'emissive.glow': { size: [1, 1], flat: true, color: [1, 0.85, 0.55] },
  // ---- extra keys used by architecture and available to other modules ----
  'tile.roof': {
    size: [2, 2], normal: 2.2,
    gen(u, v, o) {
      const rows = 8, cols = 7; const y = v * rows; const row = Math.floor(y); const fy = y - row;
      const x = u * cols + (row & 1) * 0.5; const col = Math.floor(x); const fx = x - col;
      const id = hash2(col & 255, row & 255, 17);
      const curve = Math.sin(fx * Math.PI); const lap = smooth(0.0, 0.85, fy);
      const gap = smooth(0.0, 0.06, Math.min(fx, 1 - fx));
      o.h = clamp01((0.35 + curve * 0.4) * gap * (0.6 + lap * 0.4));
      const k = 0.75 + id * 0.4 + fbm(u, v, 16, 2, 3) * 0.1;
      const sh = 0.55 + 0.45 * lap * gap;
      o.r = 0.62 * k * sh; o.g = 0.6 * k * sh; o.b = 0.58 * k * sh; o.rough = 0.7; o.metal = 0;
    },
  },
  'plaster.lime': {
    size: [4, 4], normal: 1.2,
    gen(u, v, o) {
      const n = fbm(u, v, 6, 5, 3), n2 = fbm(u, v, 40, 2, 9);
      const stain = smooth(0.1, 0.7, fbm2(u, v, 4, 2, 3, 17) + (1 - v) * 0.0);
      const flake = smooth(0.55, 0.62, fbm(u, v, 10, 4, 33));
      o.h = clamp01(0.6 + n * 0.08 + n2 * 0.04 - flake * 0.2);
      const k = 0.92 + n * 0.08 - stain * 0.12;
      o.r = lerp(0.88 * k, 0.55, flake); o.g = lerp(0.85 * k, 0.48, flake); o.b = lerp(0.78 * k, 0.4, flake);
      o.rough = 0.88; o.metal = 0;
    },
  },
  'concrete.panel': {
    size: [4, 4], normal: 1.2,
    gen(u, v, o) {
      const pu = u * 2, pv = v * 2; const fx = pu - Math.floor(pu), fy = pv - Math.floor(pv);
      const seam = Math.min(fx, 1 - fx, fy, 1 - fy) * 2;
      const t = smooth(0.004, 0.012, seam);
      const tie = Math.hypot(((fx * 4) % 1) - 0.5, ((fy * 4) % 1) - 0.5) < 0.05 ? 1 : 0;
      const n = fbm(u, v, 10, 4, 3), stain = smooth(0.2, 0.8, fbm2(u, v, 6, 2, 3, 9));
      o.h = clamp01(0.6 * t + 0.3 - tie * 0.15 + n * 0.04);
      const k = 0.85 + n * 0.1 - stain * 0.15 - tie * 0.2;
      o.r = 0.56 * k; o.g = 0.56 * k; o.b = 0.55 * k; o.rough = 0.85; o.metal = 0;
    },
  },
  'liquid.water': {
    size: [8, 8], normal: 0.6, alpha: 0.9, animated: [0.02, 0.013],
    gen(u, v, o) {
      const n = fbm(u, v, 4, 5, 3) + fbm(u, v, 9, 3, 11) * 0.5;
      o.h = 0.5 + n * 0.3;
      o.r = 0.12 + n * 0.03; o.g = 0.4 + n * 0.05; o.b = 0.44 + n * 0.04; o.rough = 0.07; o.metal = 0;
    },
  },
  'liquid.fall': {
    size: [3, 6], normal: 1.0, alpha: 0.78, animated: [0, -0.9], emissiveTex: true,
    gen(u, v, o) {
      const s = fbm2(u, v, 24, 2, 4, 5) * 0.5 + 0.5; const s2 = fbm2(u, v, 60, 3, 3, 7) * 0.5 + 0.5;
      const foam = smooth(0.45, 0.85, s * 0.7 + s2 * 0.4);
      o.h = 0.4 + s * 0.4;
      o.r = lerp(0.35, 0.92, foam); o.g = lerp(0.6, 0.96, foam); o.b = lerp(0.7, 0.98, foam);
      o.rough = 0.1 + foam * 0.3; o.metal = 0;
      const e = 0.18 + foam * 0.45; o.er = e * 0.82; o.eg = e * 0.92; o.eb = e;
    },
  },
  'liquid.reagent': {
    size: [6, 6], normal: 0.8, animated: [0.015, 0.01], emissiveTex: true,
    gen(u, v, o) {
      const n = fbm(u, v, 5, 4, 7) * 0.5 + 0.5; const b = smooth(0.55, 0.75, fbm(u, v, 12, 3, 21) * 0.5 + 0.5);
      o.h = 0.5 + n * 0.2;
      o.r = 0.42 + b * 0.3; o.g = 0.6 + b * 0.3; o.b = 0.08; o.rough = 0.1; o.metal = 0;
      const e = 0.35 + n * 0.4 + b * 0.4; o.er = 0.55 * e; o.eg = 0.85 * e; o.eb = 0.12 * e;
    },
  },
  'ground.grass': {
    size: [6, 6], normal: 1.2,
    gen(u, v, o) {
      const n = fbm(u, v, 6, 5, 3), n2 = fbm(u, v, 64, 2, 9); const d = smooth(0.3, 0.7, fbm(u, v, 3, 4, 17));
      o.h = 0.5 + n2 * 0.2 + n * 0.1;
      o.r = lerp(0.3, 0.42, d) + n2 * 0.05; o.g = lerp(0.38, 0.36, d) + n2 * 0.06; o.b = lerp(0.16, 0.24, d);
      o.rough = 0.95; o.metal = 0;
    },
  },
  'foliage.leaves': {
    size: [3, 3], normal: 2.6,
    gen(u, v, o) {
      const c = voronoi(u, v, 14, 14, 0.9, 61, V);
      const leaf = 1 - smooth(0.1, 0.62, c.f1);
      const n = fbm(u, v, 6, 4, 9); const id = hash2(c.id & 255, 5, 3);
      o.h = clamp01(leaf * 0.8 + n * 0.1);
      const k = 0.5 + leaf * 0.5 + id * 0.3 + n * 0.15;
      o.r = 0.2 * k + id * 0.05; o.g = 0.32 * k; o.b = 0.1 * k; o.rough = 0.75; o.metal = 0;
    },
  },
  'ground.rock': {
    size: [10, 10], normal: 2.4,
    gen(u, v, o) {
      const r = ridgedf(u, v, 5, 5, 7), n = fbm(u, v, 30, 3, 4);
      o.h = clamp01(r * 0.8 + n * 0.1);
      const k = 0.7 + r * 0.4 + n * 0.1; o.r = 0.42 * k; o.g = 0.4 * k; o.b = 0.37 * k; o.rough = 0.85; o.metal = 0;
    },
  },
};

export const MATERIAL_KEYS = Object.keys(MATERIALS);
/** Bump when shared bake code (noise / post-process / stoneBlocks) changes, to invalidate IndexedDB caches. */
export const LIB_VERSION = 5;
