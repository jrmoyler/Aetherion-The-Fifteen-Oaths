// Pure terrain rasterizer for the minimap and the world map. Runs in a Web Worker
// (terrainWorker.js) or, as a fallback, in idle slices on the main thread.
// Heights come from @shared/terrain.js — the same function the server and world use.
import { heightAt, SEA_LEVEL, noise2 } from '@shared/terrain.js';
import { OATHS } from '@shared/oaths.js';

export const BIOME_TINT = {
  volcanic: [62, 54, 50], glacial: [196, 205, 212], alpine: [118, 130, 120], coast: [176, 168, 132], canyon: [166, 124, 84],
  cliffs: [160, 152, 120], forest: [72, 96, 52], marsh: [84, 96, 64], meadow: [124, 146, 82], highland: [108, 114, 98],
  badlands: [142, 106, 80], crimson: [112, 58, 52], terraces: [156, 140, 114], plateau: [162, 144, 104], industrial: [92, 92, 88],
};
const CENTERS = OATHS.map((o) => ({ x: o.center[0], z: o.center[1], c: BIOME_TINT[o.biome] || [120, 120, 100] }));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function biomeColor(x, z, out) {
  // domain-warped inverse-distance blend of the three nearest regions -> organic, soft borders
  const wx = x + noise2(x / 520, z / 520) * 260 + noise2(x / 140, z / 140) * 60;
  const wz = z + noise2(x / 520 + 17.3, z / 520 - 9.1) * 260 + noise2(x / 140 + 5, z / 140 + 3) * 60;
  let i1 = 0, i2 = 0, i3 = 0, d1 = Infinity, d2 = Infinity, d3 = Infinity;
  for (let i = 0; i < CENTERS.length; i++) {
    const c = CENTERS[i]; const d = (c.x - wx) ** 2 + (c.z - wz) ** 2;
    if (d < d1) { d3 = d2; i3 = i2; d2 = d1; i2 = i1; d1 = d; i1 = i; } else if (d < d2) { d3 = d2; i3 = i2; d2 = d; i2 = i; } else if (d < d3) { d3 = d; i3 = i; }
  }
  const w1 = 1 / (d1 * d1 + 1), w2 = 1 / (d2 * d2 + 1), w3 = 1 / (d3 * d3 + 1); const ws = w1 + w2 + w3;
  const a = CENTERS[i1].c, b = CENTERS[i2].c, c = CENTERS[i3].c;
  for (let k = 0; k < 3; k++) out[k] = (a[k] * w1 + b[k] * w2 + c[k] * w3) / ws;
}

const hash = (x, y) => { let n = (x * 374761393 + y * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) & 1023) / 1023; };

/**
 * Rasterize a world rectangle. rect = { minX, maxZ, mpp, w, h, relief? }
 * Pixel (i, j) centre -> x = minX + (i + .5) * mpp, z = maxZ - (j + .5) * mpp  (north up).
 * Returns { rgba: Uint8ClampedArray, heights: Float32Array }.
 */
export function rasterize(rect) {
  const { minX, maxZ, mpp, w, h } = rect;
  const relief = rect.relief ?? (mpp > 6 ? 2.6 : 1.6);
  const W = w + 2, H = h + 2;
  const hs = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    const z = maxZ - (j - 0.5) * mpp;
    for (let i = 0; i < W; i++) hs[j * W + i] = heightAt(minX + (i - 0.5) * mpp, z);
  }
  const rgba = new Uint8ClampedArray(w * h * 4);
  const heights = new Float32Array(w * h);
  const col = [0, 0, 0];
  // light from the north-west, 40 degrees up
  const lx = -0.6, ly = 0.64, lz = 0.48;
  for (let j = 0; j < h; j++) {
    const z = maxZ - (j + 0.5) * mpp;
    for (let i = 0; i < w; i++) {
      const x = minX + (i + 0.5) * mpp;
      const k = (j + 1) * W + (i + 1);
      const ht = hs[k];
      heights[j * w + i] = ht;
      const o = (j * w + i) * 4;
      const n = hash(Math.floor(x / mpp), Math.floor(z / mpp));
      if (ht < SEA_LEVEL) {
        const d = SEA_LEVEL - ht;
        const t = smooth(0, 26, d);
        let r = 62 + (14 - 62) * t, g = 118 + (32 - 118) * t, b = 128 + (52 - 128) * t;
        if (d < 1.4) { const f = 1 - d / 1.4; r += (150 - r) * f * 0.6; g += (178 - g) * f * 0.6; b += (170 - b) * f * 0.6; }
        const ripple = (n - 0.5) * 6;
        rgba[o] = r + ripple; rgba[o + 1] = g + ripple; rgba[o + 2] = b + ripple; rgba[o + 3] = 255;
        continue;
      }
      biomeColor(x, z, col);
      let r = col[0], g = col[1], b = col[2];
      // elevation: high ground desaturates toward rock, very high toward snow
      const rock = smooth(70, 135, ht);
      r += (128 - r) * rock * 0.45; g += (124 - g) * rock * 0.45; b += (118 - b) * rock * 0.45;
      const snow = smooth(118, 150, ht);
      r += (232 - r) * snow; g += (236 - g) * snow; b += (238 - b) * snow;
      // beaches
      const beach = 1 - smooth(0.6, 3.2, ht);
      r += (198 - r) * beach * 0.8; g += (184 - g) * beach * 0.8; b += (140 - b) * beach * 0.8;
      // hillshade from grid gradient
      const dx = (hs[k + 1] - hs[k - 1]) / (2 * mpp) * relief;
      const dz = (hs[k - W] - hs[k + W]) / (2 * mpp) * relief; // north - south
      const nx = -dx, ny = 1, nz = -dz; const nl = Math.hypot(nx, ny, nz);
      const sh = Math.max(0, (nx * lx + ny * ly + nz * lz) / nl);
      const slope = 1 - ny / nl;
      const lit = 0.5 + sh * 0.72 - slope * 0.12 + (n - 0.5) * 0.05;
      rgba[o] = r * lit; rgba[o + 1] = g * lit; rgba[o + 2] = b * lit; rgba[o + 3] = 255;
    }
  }
  return { rgba, heights };
}
