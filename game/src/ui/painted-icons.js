// Raster atlas coordinates are fixed to ability identity, never hotbar position.
import { PAINTED_TILES } from './painted-tiles.js';
const base = import.meta.env?.BASE_URL ?? '/';
export const EQUIPMENT_ATLAS = `${base}ui/equipment-atlas.webp`;
export const ABILITY_ATLAS = `${base}ui/ability-atlas.webp`;
export const oathIndex = id => Math.max(0, Math.min(14, (Number(String(id).split('-')[1]) || 9) - 1));
export const ABILITY_TILES = Object.fromEntries(Object.entries(PAINTED_TILES).map(([id, [row, col]]) => [id, { row, col }]));
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function tileHTML(index, label = '', atlas = EQUIPMENT_ATLAS, columns = 5, rows = 8) {
  const col = index % columns, row = Math.floor(index / columns);
  return `<span class="ae-painted-icon" role="img" aria-label="${escape(label)}" style="display:block;width:100%;height:100%;background-image:url('${atlas}');background-repeat:no-repeat;background-size:${columns * 100}% ${rows * 100}%;background-position:${col * 100 / (columns - 1)}% ${row * 100 / (rows - 1)}%"></span>`;
}
// Castables added after the atlas was painted carry the glyph their Ability Matrix source authored.
// It is drawn as a CSS mask over the ability's own accent colour, so no inline <svg> enters the HUD.
const sigilCache = new Map();
function sigilMask(glyph) {
  let url = sigilCache.get(glyph);
  if (!url) {
    const svg = glyph.replace(/\sclass="[^"]*"/, '').replace(/currentColor/g, '#fff').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    sigilCache.set(glyph, url);
  }
  return url;
}
export function sigilHTML(ability) {
  const accent = /^#[0-9a-f]{6}$/i.test(ability.accent ?? '') ? ability.accent : '#d4a843';
  const mask = sigilMask(ability.glyph);
  return `<span class="ae-painted-icon ae-sigil-icon" role="img" aria-label="${escape(ability.name)}" style="--sigil:${accent}"><span class="ae-sigil-glyph" style="-webkit-mask-image:${escape(mask)};mask-image:${escape(mask)}"></span></span>`;
}
export function abilityIcon(ability, cls = 'ninja') {
  const tile = ABILITY_TILES[ability?.id];
  if (!tile && ability?.glyph) return sigilHTML(ability);
  if (!tile) return tileHTML(cls === 'sorcerer' ? 16 : 15, ability?.name || 'Basic attack');
  return tileHTML(tile.row * 10 + tile.col, ability.name, ABILITY_ATLAS, 10, 15);
}
export function equipmentTile(name = '', type = '') {
  const value = `${type} ${name}`.toLowerCase();
  if (/mana|ether|blue.*potion/.test(value)) return 25;
  if (/potion|heal|elixir/.test(value)) return 24;
  if (/staff|wand/.test(value)) return 16;
  if (/tome|book|focus/.test(value)) return 17;
  if (/helm|head|hood/.test(value)) return 19;
  if (/glove|gauntlet|hand/.test(value)) return 20;
  if (/boot|feet|leg/.test(value)) return 21;
  if (/ring/.test(value)) return 22;
  if (/amulet|pendant|neck/.test(value)) return 23;
  if (/armor|armour|chest|robe/.test(value)) return 18;
  if (/shield/.test(value)) return 38;
  if (/sword|blade|dagger|weapon/.test(value)) return 15;
  if (/coin|gold|currency/.test(value)) return 26;
  if (/key/.test(value)) return 39;
  if (/scroll|quest/.test(value)) return 31;
  return 29;
}
