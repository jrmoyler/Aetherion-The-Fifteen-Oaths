import { EQUIPMENT_ATLAS, oathIndex, tileHTML } from './painted-icons.js';
export const oathArt = () => EQUIPMENT_ATLAS;
export function artHTML(id, kind = 'portrait') {
  const index = ({ ninja: 35, sorcerer: 36, weapon: 15, cast: 16, item: 23, armor: 18 })[kind] ?? oathIndex(id);
  return tileHTML(index, kind === 'portrait' ? 'Oath crest' : kind);
}
