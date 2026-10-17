// Pure surface rules shared by the terrain worker and the main thread: ground layer weights per
// biome (slope / height / noise driven), vegetation species densities, grass density.
// No Babylon imports — this file runs inside a Web Worker.
import { OATHS, SANCTUARY } from '@shared/oaths.js';
import { BIOMES, noise2, MARSH_LEVEL } from '@shared/terrain.js';

export const LAYERS = [
  'grass', 'dryGrass', 'soil', 'rock', 'strata', 'sand', 'snow', 'ice', 'basalt', 'moss',
  'shale', 'marble', 'crimson', 'cobble', 'earth', 'mud', 'lava', 'limestone',
];
export const L = Object.fromEntries(LAYERS.map((n, i) => [n, i]));
export const NLAYERS = LAYERS.length;
/** Layers that are sampled triplanar (cliff materials). */
export const TRIPLANAR = new Set([L.rock, L.strata, L.ice, L.basalt, L.shale, L.limestone]);

const BIOME_KIND = { volcanic: 1, glacial: 2, alpine: 3, coast: 4, canyon: 5, cliffs: 6, forest: 7, marsh: 8, meadow: 9, highland: 10, badlands: 11, crimson: 12, terraces: 13, plateau: 14, industrial: 15 };
export const REGION_KIND = OATHS.map((o) => BIOME_KIND[o.biome]);
const RX = OATHS.map((o) => o.center[0]), RZ = OATHS.map((o) => o.center[1]);
const NR = OATHS.length;

// Region ground tints (multiplied with albedo, subtle).
const TINTS = {
  1: [0.92, 0.88, 0.86], 2: [0.95, 0.98, 1.04], 3: [0.93, 0.95, 1.0], 4: [1.04, 1.03, 0.98], 5: [1.06, 0.98, 0.9],
  6: [1.02, 1.0, 0.95], 7: [0.98, 1.02, 0.92], 8: [0.92, 0.98, 0.84], 9: [1.04, 1.03, 0.94], 10: [0.9, 0.9, 1.04],
  11: [0.92, 0.92, 0.92], 12: [1.08, 0.88, 0.86], 13: [1.0, 0.97, 1.0], 14: [0.98, 1.0, 0.97], 15: [0.96, 0.95, 0.94],
};

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// scratch top-3 regions
const _ri = new Int32Array(3), _rw = new Float64Array(3);
export function regionTop3(x, z) {
  let i0 = 0, i1 = 0, i2 = 0, w0 = 0, w1 = 0, w2 = 0;
  for (let i = 0; i < NR; i++) {
    const dx = RX[i] - x, dz = RZ[i] - z; const d2 = dx * dx + dz * dz + 1; const w = 1 / (d2 * d2);
    if (w > w0) { i2 = i1; w2 = w1; i1 = i0; w1 = w0; i0 = i; w0 = w; } else if (w > w1) { i2 = i1; w2 = w1; i1 = i; w1 = w; } else if (w > w2) { i2 = i; w2 = w; }
  }
  // sharper biome borders than the height blend (k = 3 instead of 2)
  w0 = Math.pow(w0, 0.75); w1 = Math.pow(w1, 0.75); w2 = Math.pow(w2, 0.75);
  const s = w0 + w1 + w2; _ri[0] = i0; _ri[1] = i1; _ri[2] = i2; _rw[0] = w0 / s; _rw[1] = w1 / s; _rw[2] = w2 / s;
  return { idx: _ri, w: _rw };
}

/** Distance to the nearest sanctuary centre. */
export function sanctuaryDist(x, z) {
  let d = 1e9; for (let i = 0; i < NR; i++) { const v = Math.hypot(x - RX[i], z - RZ[i]); if (v < d) d = v; } return d;
}

function biomeLayers(kind, h, slope, n1, n2, out, a) {
  const steep = smooth(0.17, 0.3, slope + n2 * 0.05);
  const flat = 1 - steep;
  const add = (l, v) => { out[l] += v * a; };
  switch (kind) {
    case 1: // volcanic
      add(L.basalt, flat * (0.55 + 0.3 * n1)); add(L.soil, flat * (0.35 - 0.3 * n1) * 0.6); add(L.dryGrass, flat * smooth(0.3, 0.6, n2) * 0.25);
      add(L.basalt, steep * 0.8); add(L.rock, steep * 0.2); break;
    case 2: { // glacial
      const sn = smooth(55, 75, h + n1 * 14);
      add(L.snow, flat * sn * (0.8 + 0.2 * n2)); add(L.ice, flat * sn * smooth(0.45, 0.7, n1) * 0.7);
      add(L.dryGrass, flat * (1 - sn) * 0.5); add(L.rock, flat * (1 - sn) * 0.5);
      add(L.rock, steep * 0.6); add(L.ice, steep * 0.25 * sn); add(L.shale, steep * 0.25); break;
    }
    case 3: { // alpine
      const sn = smooth(150, 200, h + n1 * 30);
      add(L.grass, flat * (1 - sn) * smooth(0.45, 0.1, n1) * 0.8); add(L.dryGrass, flat * (1 - sn) * 0.5); add(L.rock, flat * (1 - sn) * smooth(0.3, 0.7, n2) * 0.4);
      add(L.snow, flat * sn);
      add(L.shale, steep * 0.6); add(L.rock, steep * 0.4); add(L.snow, steep * sn * 0.25); break;
    }
    case 4: // coast (Tidal)
      add(L.grass, flat * (0.55 + 0.3 * n1)); add(L.dryGrass, flat * (0.35 - 0.2 * n1)); add(L.limestone, flat * smooth(0.55, 0.8, n2) * 0.4);
      add(L.sand, flat * smooth(3.5, 1.2, h) * 2.0);
      add(L.limestone, steep); break;
    case 5: // canyon
      add(L.sand, flat * (0.6 + 0.3 * n1)); add(L.dryGrass, flat * smooth(0.2, 0.6, n2) * 0.45); add(L.strata, flat * 0.15);
      add(L.strata, steep); break;
    case 6: // Reed cliffs
      add(L.grass, flat * (0.5 + 0.3 * n1)); add(L.dryGrass, flat * (0.5 - 0.2 * n1)); add(L.sand, flat * smooth(3, 1, h) * 1.5);
      add(L.limestone, steep * 0.7); add(L.rock, steep * 0.3); break;
    case 7: // forest (Graft)
      add(L.moss, flat * (0.5 + 0.3 * n1)); add(L.grass, flat * (0.35 - 0.2 * n1)); add(L.soil, flat * smooth(0.4, 0.8, n2) * 0.4);
      add(L.rock, steep * 0.6); add(L.moss, steep * 0.4); break;
    case 8: // marsh (Bitterglass)
      add(L.mud, flat * smooth(MARSH_LEVEL + 0.8, MARSH_LEVEL - 0.2, h) * 1.4); add(L.moss, flat * (0.4 + 0.3 * n1)); add(L.grass, flat * (0.3 - 0.2 * n1)); add(L.soil, flat * 0.15);
      add(L.soil, steep * 0.6); add(L.rock, steep * 0.4); break;
    case 9: // meadow (Daybreak)
      add(L.grass, flat * (0.8 + 0.2 * n1)); add(L.dryGrass, flat * smooth(0.35, 0.7, n2) * 0.45);
      add(L.limestone, steep * 0.6); add(L.rock, steep * 0.4); break;
    case 10: // highland (Observatory)
      add(L.grass, flat * (0.5 + 0.3 * n1)); add(L.dryGrass, flat * 0.3); add(L.shale, flat * smooth(0.5, 0.8, n2) * 0.5);
      add(L.shale, steep * 0.7); add(L.rock, steep * 0.3); break;
    case 11: // badlands (Missing Court)
      add(L.shale, flat * 0.4); add(L.dryGrass, flat * (0.3 + 0.2 * n1)); add(L.soil, flat * 0.3);
      add(L.shale, steep * 0.5); add(L.rock, steep * 0.5); break;
    case 12: // crimson (Sanguine)
      add(L.crimson, flat * (0.6 + 0.3 * n1)); add(L.dryGrass, flat * smooth(0.3, 0.7, n2) * 0.35);
      add(L.rock, steep * 0.5); add(L.crimson, steep * 0.2); add(L.strata, steep * 0.3); break;
    case 13: // terraces (Folded Theatre)
      add(L.grass, flat * (0.6 + 0.2 * n1)); add(L.marble, flat * smooth(0.5, 0.8, n2) * 0.4); add(L.dryGrass, flat * 0.2);
      add(L.limestone, steep); break;
    case 14: // plateau (Escapement)
      add(L.dryGrass, flat * (0.55 + 0.2 * n1)); add(L.grass, flat * 0.3); add(L.soil, flat * smooth(0.5, 0.8, n2) * 0.35);
      add(L.strata, steep * 0.5); add(L.rock, steep * 0.5); break;
    case 15: default: // industrial (Impulse)
      add(L.soil, flat * 0.45); add(L.earth, flat * smooth(0.4, 0.7, n1) * 0.4); add(L.dryGrass, flat * 0.3); add(L.shale, flat * smooth(0.6, 0.85, n2) * 0.3);
      add(L.rock, steep); break;
  }
}

/**
 * Ground layer weights at a point. s = sampleTerrain() output, ny = normal.y.
 * Fills `out` (Float32Array(NLAYERS), zeroed here) and returns region tint [r,g,b] in `tint`.
 */
export function classify(x, z, s, ny, out, tint) {
  out.fill(0);
  const h = s.h; const slope = 1 - ny;
  const n1 = 0.5 + 0.5 * noise2(x / 37 + 3.3, z / 37 - 1.1) * 0.8 + 0.2 * noise2(x / 9, z / 9);
  const n2 = 0.5 + 0.5 * noise2(x / 83 - 7.7, z / 83 + 4.4);
  const r = regionTop3(x, z);
  tint[0] = tint[1] = tint[2] = 0;
  for (let k = 0; k < 3; k++) {
    const w = r.w[k]; if (w < 0.01) continue; const kind = REGION_KIND[r.idx[k]];
    biomeLayers(kind, h, slope, n1, n2, out, w);
    const t = TINTS[kind]; tint[0] += t[0] * w; tint[1] += t[1] * w; tint[2] += t[2] * w;
  }
  // beaches and sea floor
  if (h < 1.6 && s.coast < 120) { const b = smooth(1.6, 0.2, h) * smooth(0.3, 0.12, slope); out[L.sand] += 3 * b; }
  if (h < -1) { out.fill(0); out[L.sand] = 1; out[L.rock] = smooth(0.1, 0.25, slope) * 2; }
  // sanctuary plaza ring: pale gravel/cobbles under the architecture
  if (s.plaza > 0.05) {
    const d = sanctuaryDist(x, z);
    const p = smooth(SANCTUARY.cityRadius * 0.62, SANCTUARY.cityRadius * 0.45, d);
    if (p > 0) { for (let i = 0; i < out.length; i++) out[i] *= 1 - p; out[L.cobble] += p * 0.6; out[L.marble] += p * 0.4; }
  }
  // lava channels
  if (s.lava > 0.01) { for (let i = 0; i < out.length; i++) out[i] *= 1 - s.lava; out[L.lava] += s.lava * 1.5; out[L.basalt] += s.lava * 0.2; }
  let sum = 0; for (let i = 0; i < out.length; i++) sum += out[i];
  if (sum <= 1e-5) { out[L.rock] = 1; sum = 1; }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
}

/** Share of cobbles (vs packed earth) for road surfaces near a sanctuary. */
export function cobbleFraction(x, z) { return smooth(520, 300, sanctuaryDist(x, z)); }

// ---------------------------------------------------------------------------------------------
// Vegetation
export const SPECIES = ['conifer', 'snowConifer', 'broadleaf', 'giantTree', 'cypress', 'stonePine', 'deadTree', 'birch', 'reeds', 'crystal', 'shrub', 'boulder', 'rock'];
export const SP = Object.fromEntries(SPECIES.map((n, i) => [n, i]));
// instances per hectare (10 000 m²) on suitable flat ground
const DENSITY = {
  1: { deadTree: 5, boulder: 6, rock: 22 },
  2: { snowConifer: 14, conifer: 4, boulder: 8, rock: 18 },
  3: { conifer: 24, snowConifer: 6, boulder: 6, rock: 16, shrub: 6 },
  4: { cypress: 7, stonePine: 6, shrub: 20, rock: 6, boulder: 2 },
  5: { crystal: 6, boulder: 10, rock: 20, shrub: 3, deadTree: 1 },
  6: { stonePine: 8, cypress: 3, shrub: 22, rock: 10, boulder: 3 },
  7: { broadleaf: 34, giantTree: 5, shrub: 30, rock: 6, boulder: 3 },
  8: { reeds: 90, deadTree: 4, shrub: 8, broadleaf: 3 },
  9: { birch: 10, broadleaf: 5, cypress: 3, shrub: 12, rock: 4 },
  10: { conifer: 10, shrub: 10, boulder: 8, rock: 18 },
  11: { deadTree: 5, boulder: 9, rock: 22 },
  12: { deadTree: 7, shrub: 6, boulder: 6, rock: 16 },
  13: { cypress: 8, stonePine: 4, shrub: 14, rock: 6 },
  14: { stonePine: 3, conifer: 3, shrub: 12, boulder: 5, rock: 12 },
  15: { deadTree: 3, shrub: 5, boulder: 6, rock: 14 },
};
const ROCKY = new Set([SP.boulder, SP.rock, SP.crystal]);

/** Species density per m² at a point (fills out Float32Array(SPECIES.length)). */
export function speciesDensity(x, z, s, ny, out) {
  out.fill(0);
  const slope = 1 - ny;
  if (s.h < 0.4) return out; // under water
  if (s.plaza > 0.05 && sanctuaryDist(x, z) < SANCTUARY.cityRadius * 0.62) return out; // plaza kept clear
  const road = s.road < 9 ? 0 : smooth(9, 16, s.road);
  const r = regionTop3(x, z);
  const n = 0.5 + 0.5 * noise2(x / 140 + 9.1, z / 140 - 3.7); // clearing / grove structure
  const grove = smooth(0.25, 0.65, n);
  for (let k = 0; k < 3; k++) {
    const w = r.w[k]; if (w < 0.02) continue; const kind = REGION_KIND[r.idx[k]];
    const D = DENSITY[kind];
    for (const name in D) {
      const sp = SP[name]; let d = D[name] * w / 10000;
      if (ROCKY.has(sp)) d *= 0.5 + slope * 4; else d *= smooth(0.32, 0.12, slope) * (0.25 + 1.5 * grove);
      if (sp === SP.reeds) d *= smooth(MARSH_LEVEL + 1.4, MARSH_LEVEL + 0.2, s.h) * smooth(MARSH_LEVEL - 1.2, MARSH_LEVEL - 0.2, s.h);
      if (sp === SP.snowConifer) d *= smooth(70, 95, s.h + (kind === 3 ? -70 : 0));
      if (sp === SP.conifer && kind === 3) d *= smooth(200, 150, s.h);
      out[sp] += d;
    }
  }
  if (s.lava > 0.02) out.fill(0);
  for (let i = 0; i < out.length; i++) out[i] *= road;
  return out;
}

/** Grass density 0..1 from ground weights (grass + dry grass + moss share). */
export function grassAmount(weights) {
  return Math.min(1, weights[L.grass] * 1.2 + weights[L.dryGrass] * 1.0 + weights[L.moss] * 0.5 + weights[L.mud] * 0.3);
}

export { TINTS, BIOMES };
