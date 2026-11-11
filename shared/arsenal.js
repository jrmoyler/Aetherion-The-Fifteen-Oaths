// Arsenal Forge registry: which forged weapon and armor piece stands behind each piece of gear.
// Pure data and deterministic lookups, shared by the simulation (item identity) and the client (models, icons).
import { ARSENAL_WEAPONS, ARSENAL_ARMOR, ARSENAL_COMMIT, ARSENAL_REVISION } from './arsenal.generated.js';

export { ARSENAL_WEAPONS, ARSENAL_ARMOR, ARSENAL_COMMIT, ARSENAL_REVISION };

const W = (key) => `arsenal:${key}`;
// Canon names each discipline's weapon (shared/oaths.js). The first entry is the forged piece closest to that
// description; the rest are kindred pieces that rarer drops can take, so better loot also looks different.
export const CANON_ARMS = Object.freeze({
  'oath-01': { ninja: ['short_blades/kukri', 'heavy_impact/war-axe', 'manifested/flame-sword'], sorcerer: ['tech_ranged/grenade-launcher', 'tech_ranged/beam-projector'] },
  'oath-02': { ninja: ['swords/saber', 'swords/katana', 'manifested/ice-spear'], sorcerer: ['archery/repeating-crossbow', 'archery/crossbow'] },
  'oath-03': { ninja: ['flexible/whip', 'flexible/weighted-chain', 'flexible/rope-dart'], sorcerer: ['casting_implements/channeling-rod', 'polearms/trident'] },
  'oath-04': { ninja: ['polearms/glaive', 'polearms/trident'], sorcerer: ['casting_implements/crystal-staff', 'casting_implements/oak-staff'] },
  'oath-05': { ninja: ['short_blades/dagger', 'short_blades/punch-dagger', 'manifested/crystal-scythe'], sorcerer: ['heavy_impact/flanged-mace', 'casting_implements/scepter'] },
  'oath-06': { ninja: ['thrown/chakram', 'thrown/boomerang'], sorcerer: ['casting_implements/wand', 'ritual/talisman-array'] },
  'oath-07': { ninja: ['archery/recurve-bow', 'archery/longbow', 'archery/composite-bow'], sorcerer: ['casting_implements/oak-staff', 'casting_implements/crystal-staff'] },
  'oath-08': { ninja: ['swords/saber', 'short_blades/kukri'], sorcerer: ['archery/crossbow', 'archery/repeating-crossbow'] },
  'oath-09': { ninja: ['short_blades/tanto', 'swords/longsword', 'manifested/light-blade'], sorcerer: ['casting_implements/crystal-staff', 'casting_implements/scepter'] },
  'oath-10': { ninja: ['flexible/meteor-hammer', 'flexible/weighted-chain'], sorcerer: ['casting_implements/channeling-rod', 'ritual/relic-orb'] },
  'oath-11': { ninja: ['heavy_impact/war-axe', 'heavy_impact/military-pick'], sorcerer: ['heavy_impact/flanged-mace', 'manifested/void-disc'] },
  'oath-12': { ninja: ['flexible/chain-sickle', 'flexible/whip'], sorcerer: ['martial/cestus', 'martial/talons', 'integrated/energy-gauntlet'] },
  'oath-13': { ninja: ['swords/rapier', 'swords/saber'], sorcerer: ['ritual/grimoire', 'ritual/rune-tablet'] },
  'oath-14': { ninja: ['manifested/crystal-scythe', 'polearms/halberd'], sorcerer: ['ritual/ceremonial-seal', 'thrown/chakram'] },
  'oath-15': { ninja: ['heavy_impact/warhammer', 'integrated/servo-blade', 'martial/power-knuckles'], sorcerer: ['shields/kinetic-disc', 'shields/tower-shield'] },
});
// Gear slot -> Arsenal armor families. Five pieces per family, ordered plain to ornate, one per rarity tier.
export const ARMOR_FAMILIES = Object.freeze({
  head: ['helmet', 'mask'], chest: ['chest', 'robe'], hands: ['glove', 'arm'], legs: ['legs', 'belt'], feet: ['boot'], trinket: ['accessory'],
});
// What a piece is called decides which family it is: a Robe is a robe and a Cuirass is plate, whoever wears it.
const NOUN_FAMILY = Object.freeze({
  Helm: 'helmet', Hood: 'helmet', Circlet: 'helmet', Visor: 'mask', Mask: 'mask',
  Cuirass: 'chest', Harness: 'chest', Vestment: 'robe', Coat: 'robe', Robe: 'robe',
  Gauntlets: 'glove', Grips: 'glove', Wraps: 'arm', Bracers: 'arm',
  Greaves: 'legs', Leggings: 'legs', Trousers: 'legs', Tassets: 'belt',
});
const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

/** Small stable hash, so a drop keeps its look without consuming the simulation's random stream. */
export function stableIndex(text, modulo) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0) % modulo;
}

/** The forged weapon a discipline carries by canon. */
export function canonWeapon(oath, cls) {
  const list = CANON_ARMS[oath]?.[cls] ?? CANON_ARMS['oath-09'].ninja;
  return W(list[0]);
}

/** Arsenal id for a generated gear piece. Common and uncommon weapons are the canon piece; rarer ones vary. */
export function arsenalForGear({ slot, oath, cls, rarity, seed = '', name = '' }) {
  const rank = RARITY_RANK[rarity] ?? 0;
  if (slot === 'weapon') {
    const list = CANON_ARMS[oath]?.[cls] ?? CANON_ARMS['oath-09'].ninja;
    return W(rank < 2 || list.length === 1 ? list[0] : list[1 + stableIndex(seed, list.length - 1)]);
  }
  const families = ARMOR_FAMILIES[slot];
  if (!families) return null;
  // The name decides where it can; otherwise sorcerers favour the cloth family (robe, mask, arm wraps).
  const noun = name.split(' ').find((word) => NOUN_FAMILY[word] && families.includes(NOUN_FAMILY[word]));
  const family = noun ? NOUN_FAMILY[noun] : families.length > 1 && cls === 'sorcerer' ? families[1] : families[0];
  return `arsenal:armor/${family}/${String(rank + 1).padStart(2, '0')}`;
}

export const arsenalEntry = (id) => ARSENAL_WEAPONS[id] ?? ARSENAL_ARMOR[id] ?? null;
/** Longest measured dimension in metres: a weapon's real reach as modelled, for tooltips. */
export const arsenalLength = (id) => { const e = ARSENAL_WEAPONS[id]; return e ? Math.max(...e.dims) : null; };
export const FAMILY_LABEL = Object.freeze({
  swords: 'Sword', short_blades: 'Short blade', polearms: 'Polearm', heavy_impact: 'Heavy weapon', archery: 'Bow', casting_implements: 'Casting implement',
  ritual: 'Ritual focus', martial: 'Martial weapon', flexible: 'Flexible weapon', thrown: 'Thrown weapon', tech_ranged: 'Tech firearm', integrated: 'Integrated arm',
  shields: 'Shield', manifested: 'Manifested weapon', deployables: 'Deployable',
});
