import { artHTML, oathArt } from './art.js';
// Compatibility name retained for existing HUD consumers; output is raster artwork.
export const emblemSVG = (id) => artHTML(id);
const cache = new Map();
export function emblemImage(id) { if (!cache.has(id)) { const img = new Image(); img.src = oathArt(id); cache.set(id, img); } return cache.get(id); }

export function emblemRect(id, img) {
  const index = Math.max(0, Math.min(14, (Number(String(id).split('-')[1]) || 9) - 1));
  const w = img.naturalWidth / 5, h = img.naturalHeight / 8;
  return [index % 5 * w, Math.floor(index / 5) * h, w, h];
}
