import { esc } from './dom.js';
import { tileHTML, equipmentTile } from './painted-icons.js';
const label = (text) => `<span class="ico ae-text-icon" aria-hidden="true">${esc(text)}</span>`;
const UTILITY = {
  map: [27, 'Map'], bag: [29, 'Gear'], gear: [32, 'Menu'], chat: [33, 'Chat'], quest: [31, 'Tasks'],
  compass: [28, 'North'], skull: [37, 'Fallen'], shrine: [34, 'Rest'], target: [30, 'Target'], interact: [39, 'Interact'],
};
export const ICONS = Object.fromEntries(Object.entries({map:'Map',bag:'Gear',gear:'Menu',chat:'Chat',quest:'Tasks',close:'×',jump:'Jump',dodge:'Roll',target:'Target',interact:'Interact',sprint:'Run',menu:'Menu',compass:'N',plus:'+',minus:'−',locate:'Here',install:'↓',skull:'Fallen',shrine:'Rest'}).map(([key,text]) => {
  const entry = UTILITY[key];
  return [key, entry ? tileHTML(entry[0], entry[1]).replace('class="ae-painted-icon"', `class="ae-painted-icon ae-utility-icon" data-label="${entry[1]}"`) : label(text)];
}));
export const DEBUFFS = new Set(['burn','chill','freeze','stun','slow','root','poison','bleed','silence','weaken','shock','daze']);
export function statusIcon(status) { const key=String(status||'Effect').toLowerCase(); return { svg:label(key.slice(0,3)), debuff:DEBUFFS.has(key), key }; }
export function itemIcon(name='', type='') { return tileHTML(equipmentTile(name, type), name || type || 'Item'); }
export const RARITY = {
  common: { label: 'Common', color: '#cfc8b8' },
  uncommon: { label: 'Uncommon', color: '#7fc06a' },
  rare: { label: 'Rare', color: '#5aa6e8' },
  epic: { label: 'Epic', color: '#b07ce8' },
  legendary: { label: 'Legendary', color: '#e89a40' },
  relic: { label: 'Relic', color: '#e8cf70' },
};
export const rarityOf = (r) => RARITY[String(r || 'common').toLowerCase()] || RARITY.common;
