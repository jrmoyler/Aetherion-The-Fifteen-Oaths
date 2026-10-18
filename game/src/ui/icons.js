import { esc } from './dom.js';
const label = (text) => `<span class="ico ae-text-icon" aria-hidden="true">${esc(text)}</span>`;
export const ICONS = Object.fromEntries(Object.entries({map:'Map',bag:'Bag',gear:'Set',chat:'Chat',quest:'Log',close:'×',jump:'Jump',dodge:'Roll',target:'Aim',interact:'Use',sprint:'Run',menu:'Menu',compass:'N',plus:'+',minus:'−',locate:'Here',install:'↓',skull:'KO',shrine:'Rest'}).map(([k,v])=>[k,label(v)]));
export const DEBUFFS = new Set(['burn','chill','freeze','stun','slow','root','poison','bleed','silence','weaken','shock','daze']);
export function statusIcon(status) { const key=String(status||'Effect').toLowerCase(); return { svg:label(key.slice(0,3)), debuff:DEBUFFS.has(key), key }; }
export function itemIcon(name='', type='') { return label((type || name || 'Item').slice(0,3)); }
export const RARITY = {
  common: { label: 'Common', color: '#cfc8b8' },
  uncommon: { label: 'Uncommon', color: '#7fc06a' },
  rare: { label: 'Rare', color: '#5aa6e8' },
  epic: { label: 'Epic', color: '#b07ce8' },
  legendary: { label: 'Legendary', color: '#e89a40' },
  relic: { label: 'Relic', color: '#e8cf70' },
};
export const rarityOf = (r) => RARITY[String(r || 'common').toLowerCase()] || RARITY.common;
