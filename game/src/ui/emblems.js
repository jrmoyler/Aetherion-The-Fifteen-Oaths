import { artHTML, oathArt } from './art.js';
// Compatibility name retained for existing HUD consumers; output is raster artwork.
export const emblemSVG = (id) => artHTML(id);
const cache = new Map();
export function emblemImage(id) { if (!cache.has(id)) { const img = new Image(); img.src = oathArt(id); cache.set(id, img); } return cache.get(id); }
