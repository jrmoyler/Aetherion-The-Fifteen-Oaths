// Per-oath sanctuary styles: materials/palette, plaza type, rim, hall, signature structures,
// houses, walls. Each is faithful to the ENVIRONMENT panel of its reference sheet
// (assets/references/reference-099..113) and the art guide's architecture motif.
import { OATH_BY_ID } from '@shared/oaths.js';
import { genericHouse } from './kit.js';
import CITIES_A from './cities_a.js';
import CITIES_B from './cities_b.js';

function base(id) {
  const o = OATH_BY_ID[id]; const p = o.palette;
  return {
    plaza: 'circle', emblemScale: 10.5, glow: p.glow, lamp: 'brazier',
    banner: { color: p.secondary, trim: p.trim, emblem: p.accent },
    mats: {
      pave: ['paving.flagstone', { tint: p.stone }], border: ['stone.darkgranite', { tint: p.trim }], ground: ['paving.flagstone', { tint: p.stone }],
      wall: ['stone.limestone', { tint: p.stone }], trim: ['stone.darkgranite', { tint: p.trim }], metal: ['metal.iron'], roof: ['tile.roof', { tint: p.trim }],
      wood: ['wood.weathered'], inlay: ['metal.brass'], found: ['stone.darkgranite', { tint: p.primary }],
    },
    hall(S) {}, signature(S) {},
    house(S, w, d, h) { genericHouse(S, w, d, h); },
  };
}

export const STYLES = {};
for (const id of Object.keys(OATH_BY_ID)) {
  const b = base(id); const over = CITIES_A[id] || CITIES_B[id] || {};
  STYLES[id] = { ...b, ...over, mats: { ...b.mats, ...(over.mats || {}) }, banner: { ...b.banner, ...(over.banner || {}) } };
}
