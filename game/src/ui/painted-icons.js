// Raster atlas coordinates are fixed to ability identity, never hotbar position.
import { ABILITIES_BY_OATH } from '@shared/abilities.js';
const base = import.meta.env?.BASE_URL ?? '/';
export const EQUIPMENT_ATLAS = `${base}ui/equipment-atlas.webp`;
export const ABILITY_ATLAS = `${base}ui/ability-atlas.webp`;
export const oathIndex = id => Math.max(0, Math.min(14, (Number(String(id).split('-')[1]) || 9) - 1));
export const ABILITY_TILES = Object.fromEntries(Object.entries(ABILITIES_BY_OATH).flatMap(([oath, list]) => list.map((a, col) => [a.id, { row: oathIndex(oath), col }])));
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function tileHTML(index, label = '', atlas = EQUIPMENT_ATLAS, columns = 5, rows = 8) {
  const col = index % columns, row = Math.floor(index / columns);
  return `<span class="ae-painted-icon" role="img" aria-label="${escape(label)}" style="display:block;width:100%;height:100%;background-image:url('${atlas}');background-repeat:no-repeat;background-size:${columns * 100}% ${rows * 100}%;background-position:${col * 100 / (columns - 1)}% ${row * 100 / (rows - 1)}%"></span>`;
}
export function abilityIcon(ability, cls = 'ninja') {
  const tile = ABILITY_TILES[ability?.id];
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
