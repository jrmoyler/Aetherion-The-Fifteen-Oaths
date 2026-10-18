// Static game-design tables for the simulation, summarised from AETHERION_CANON:
//  - element interactions: 07_GAMEPLAY_SYSTEMS/ELEMENTAL_INTERACTION_MATRIX.md + INTERACTION_RULES.json
//    (the canon is a contextual state-transition matrix, not an advantage chart; we keep its
//    directed pairs as small bounded modifiers + "combo" reactions on matching statuses)
//  - names: 05_FACTIONS_AND_CHARACTERS/CHARACTER_REGISTRY.json
//  - quest titles: 06_NARRATIVE/QUEST_REGISTRY.json
//  - resources / professions: 14_LIFE_SKILLS_AND_ECONOMY/ECONOMY_REGISTRY.json
//  - world events: 13_WORLD_EVENTS/WORLD_EVENT_REGISTRY.json

/** On-hit status per element: [statusId, chance, duration s, magnitude]. */
export const ELEMENT_STATUS = {
  fire: ['burn', 0.45, 4, 0.12],      // DoT: magnitude x hit damage per second
  frost: ['chill', 0.6, 3, 0.4],      // slow 40%
  storm: ['shock', 0.25, 0.7, 1],     // brief stun
  water: ['soak', 0.6, 5, 0.15],      // slow 15%, primes storm/frost reactions
  earth: ['root', 0.3, 1.4, 1],
  wind: ['stagger', 0.35, 0.5, 3],    // knockback (m) + brief stun
  nature: ['root', 0.3, 1.6, 1],
  poison: ['poison', 0.55, 6, 0.08],  // stacking DoT
  light: ['radiant', 1, 0, 0.12],     // caster heals 12% of damage dealt
  cosmic: ['gravity', 0.4, 2.5, 0.3], // slow 30%
  shadow: ['weaken', 0.4, 5, 0.15],   // target deals 15% less damage
  blood: ['bleed', 0.5, 5, 0.1],      // DoT + 15% lifesteal on the hit
  arcane: ['expose', 0.4, 5, 0.12],   // target takes 12% more damage
  time: ['slow', 0.45, 3, 0.3],       // slow 30%; caster cooldowns tick 0.5 s
  tech: ['sunder', 0.4, 6, 0.3],      // armor -30%
};

/** Status catalogue: kind drives the simulation, fx id is what clients display. */
export const STATUSES = {
  burn: { kind: 'dot', element: 'fire' },
  poison: { kind: 'dot', element: 'poison', stacks: 3 },
  bleed: { kind: 'dot', element: 'blood' },
  chill: { kind: 'slow' },
  soak: { kind: 'slow' },
  gravity: { kind: 'slow' },
  slow: { kind: 'slow' },
  root: { kind: 'root' },
  shock: { kind: 'stun' },
  stun: { kind: 'stun' },
  stagger: { kind: 'stun' },
  freeze: { kind: 'stun' },
  weaken: { kind: 'weaken' },
  expose: { kind: 'expose' },
  sunder: { kind: 'sunder' },
  shield: { kind: 'shield' },
  haste: { kind: 'haste' },
  regen: { kind: 'hot' },
  empower: { kind: 'empower' },
  invuln: { kind: 'invuln' },
  combat: { kind: 'none' },
};

/**
 * Directed element modifiers (attacker element -> target innate element), bounded to +-20%
 * per the canon's "bounded prototype hypotheses". Innate element = mob's region element or the
 * player's Oath element. Derived from the canon pair descriptions (heat melts ice, cooling
 * quenches heat, current overloads wet conduits, light reveals shadow, ...).
 */
export const ELEMENT_MOD = {
  fire: { frost: 0.2, nature: 0.2, poison: 0.1, water: -0.2, earth: -0.1 },
  frost: { fire: 0.15, water: 0.15, wind: 0.1, tech: -0.1, earth: -0.1 },
  storm: { water: 0.2, tech: 0.15, wind: 0.1, earth: -0.2 },
  water: { fire: 0.2, earth: 0.1, storm: -0.15, nature: -0.1 },
  earth: { storm: 0.2, fire: 0.1, tech: 0.1, wind: -0.15, nature: -0.1 },
  wind: { earth: 0.15, poison: 0.15, fire: 0.05, storm: -0.1 },
  nature: { water: 0.15, earth: 0.15, fire: -0.2, poison: -0.15 },
  poison: { nature: 0.2, blood: 0.15, tech: -0.2, light: -0.1 },
  light: { shadow: 0.2, arcane: 0.1, blood: 0.1, cosmic: -0.1 },
  cosmic: { time: 0.15, light: 0.1, tech: 0.1, arcane: -0.1 },
  shadow: { light: 0.15, arcane: 0.15, cosmic: 0.1, tech: -0.1 },
  blood: { nature: 0.15, poison: -0.15, shadow: 0.1, light: -0.1 },
  arcane: { cosmic: 0.15, time: 0.1, shadow: -0.1, tech: 0.05 },
  time: { tech: 0.2, storm: 0.1, cosmic: -0.15 },
  tech: { earth: 0.15, frost: 0.1, storm: -0.15, time: -0.1 },
};

/**
 * Reactions: attacker element hitting a target carrying a status. Consumes the status when
 * `consume` and multiplies damage; optional follow-up status. Mirrors canon directed pairs
 * (fire->frost melt, frost->fire quench, storm->water overload, fire->poison vapour ignition...).
 */
export const REACTIONS = [
  { el: 'fire', on: 'chill', mul: 1.3, consume: true, name: 'Thermal Shock' },
  { el: 'frost', on: 'burn', mul: 1.2, consume: true, name: 'Quench' },
  { el: 'storm', on: 'soak', mul: 1.35, consume: true, name: 'Overload', then: ['shock', 0.9] },
  { el: 'frost', on: 'soak', mul: 1.1, consume: true, name: 'Flash Freeze', then: ['freeze', 1.6] },
  { el: 'fire', on: 'poison', mul: 1.25, consume: true, name: 'Vapour Ignition' },
  { el: 'light', on: 'weaken', mul: 1.2, consume: true, name: 'Revelation' },
  { el: 'earth', on: 'stagger', mul: 1.2, consume: false, name: 'Fault Line' },
  { el: 'wind', on: 'burn', mul: 1.15, consume: false, name: 'Fanned Flames' },
  { el: 'tech', on: 'shock', mul: 1.2, consume: false, name: 'Short Circuit' },
  { el: 'time', on: 'slow', mul: 1.15, consume: false, name: 'Stopped Clock' },
  { el: 'blood', on: 'bleed', mul: 1.15, consume: false, name: 'Haemorrhage' },
  { el: 'cosmic', on: 'root', mul: 1.2, consume: false, name: 'Crush' },
];

/** Self-buff ability results by element. Regen magnitude is max-HP fraction per second.
 * Combat tuning profiles, not changes to the world/ability canon. */
export const SELF_BUFF = {
  storm: [['haste', 8, 0.35], ['empower', 8, 0.2]],
  fire: [['empower', 8, 0.3]],
  arcane: [['shield', 8, 0.25], ['empower', 8, 0.15]],
  frost: [['shield', 9, 0.3]],
  water: [['regen', 6, 0.025], ['shield', 6, 0.12]],
  earth: [['shield', 7, 0.35]],
  wind: [['haste', 9, 0.4]],
  nature: [['regen', 8, 0.035]],
  poison: [['empower', 10, 0.22]],
  light: [['regen', 6, 0.03], ['shield', 6, 0.16]],
  cosmic: [['shield', 8, 0.28], ['empower', 5, 0.1]],
  shadow: [['haste', 6, 0.25], ['empower', 6, 0.2]],
  blood: [['regen', 5, 0.02], ['empower', 7, 0.25]],
  time: [['haste', 10, 0.3]],
  tech: [['shield', 10, 0.2], ['empower', 10, 0.12]],
  default: [['shield', 6, 0.2]],
};

// ---------- names (canon character registry) ----------
export const CANON_NAMES = [
  'Mara Venn', 'Ivo Serr', 'Sera Pell', 'Nemi Or', 'Tal Ren', 'Oda Kesh', 'Elen Voss', 'Kavi Sen', 'Deren Korr',
  'Pella Ust', 'Lio Senn', 'Amri Fell', 'Yara Moss', 'Tovin Hale', 'Neris Vale', 'Bram Ilex', 'Helia Mar', 'Sorin Kes',
  'Iria Deyn', 'Cal Ro', 'Veya Noll', 'Rell An', 'Adra Kest', 'Oren Sol', 'Mirren Fane', 'Seli Dorn', 'Jalen Rusk',
  'Tessa Wren', 'Tarek Voss', 'Una Brin', 'Dessa Rowan', 'Tarin Esh',
];
/** Leader (oathkeeper) and civic counterpoint (chronicler) per Oath, in Oath order. */
export const OATH_LEADERS = CANON_NAMES.slice(0, 30).filter((_, i) => i % 2 === 0);
export const OATH_CIVICS = CANON_NAMES.slice(0, 30).filter((_, i) => i % 2 === 1);

/** Regional seat names from the canon regional arcs (quest-region-XX). */
export const SEATS = ['Cindervault', 'Stillfolio', 'Crownspan', 'Confluence Quay', 'Keystone Hall', 'Cantilever', 'Rootmeet',
  'Vitrial', 'Aureate Steps', 'Parallax Crown', 'Absent Seat', 'Kinhold', 'Manydoor', 'Wayclock', 'Counterpoise'];
/** Independent civic review sites (quest-civic-review-XX), used as bounty-board place names. */
export const WARDS = ['Ashbridge', 'Meltgate', 'Grounding Reach', 'Brackensluice', 'Talus Steps', 'Hush Vale', 'Gleaning Margin',
  'Clearfen', 'Lantern Ward', 'Ballast Haven', 'Witness Ford', 'Open Hearth', 'Plainmarket', 'Restmile', 'Handshift'];
/** Export resources per region (economy registry) - used for loot / vendor flavour. */
export const RESOURCES = ['tempered components', 'preserved reagents', 'relay conductors', 'treated water and marine fiber',
  'structural stone and tuned crystal', 'acoustic reeds and sailcloth', 'cultivated fiber and food', 'antidotes and filter media',
  'ward lenses and recovery supplies', 'navigation tables and balanced instruments', 'sealed records and privacy screens',
  'consensual ritual implements', 'projection panels and mirror fittings', 'timing regulators and transport fittings',
  'actuators and modular fasteners'];
/** Canon world events (WORLD_EVENT_REGISTRY world-event-01..15). */
export const CANON_EVENTS = ['contain or redirect an eruption', 'recover a failing preservation chamber', 'restore a contested relay link',
  'restore an overloaded aqueduct', 'stabilize a resonant fault crossing', 'restore a disrupted public performance',
  'contain an expanding overgrowth', 'contain a chemical-wetland spill', 'maintain a shelter during ward failure',
  'recover a bounded meteor fall', 'stabilize a phasing civic passage', 'support an exhausted voluntary rite',
  'resolve a rearranged public stage', 'resynchronize a temporal transport corridor', 'rebuild a disabled infrastructure engine'];

const SYL_A = ['Ael', 'Bri', 'Cor', 'Dav', 'Eli', 'Fen', 'Gar', 'Hal', 'Isa', 'Jor', 'Kel', 'Lun', 'Mor', 'Nai', 'Ost', 'Pry', 'Quin', 'Ros', 'Syl', 'Tam', 'Ulv', 'Vor', 'Wen', 'Yev', 'Zar'];
const SYL_B = ['a', 'en', 'is', 'or', 'wyn', 'ric', 'eth', 'ia', 'an', 'el', 'ra', 'on'];
const SUR = ['Ash', 'Brine', 'Cole', 'Dusk', 'Ember', 'Frost', 'Gale', 'Holt', 'Ire', 'Kest', 'Lark', 'Marr', 'Nox', 'Pyre', 'Reed', 'Sable', 'Thorne', 'Vale', 'Wick'];
export function genName(rng) {
  return `${rng.pick(SYL_A)}${rng.pick(SYL_B)} ${rng.pick(SUR)}${rng.pick(['', 'well', 'ford', 'mere', 'wright', 'by'])}`;
}

// ---------- NPC dialogue ----------
export const NPC_TEXT = {
  oathkeeper: (o, n) => `${n} regards you across the plaza of ${o.name}. "Every covenant is a promise kept in public. Ours is ${o.elementLabel.toLowerCase()} - mind what it costs, and who pays."`,
  quartermaster: (o) => `"Supplies for the road. ${o.name} trades fairly - we buy what you carry back and sell what keeps you breathing."`,
  trainer: (o, n, cls) => `"A ${cls} of ${o.name} fights with intent, not appetite. Rest here and I will see your wounds closed and your focus restored."`,
  warden: (o) => `"The approaches are not safe. The bounty board pays in coin for every threat cleared beyond the city ring."`,
  chronicler: (o, n) => `${n} closes a ledger. "I record what happened, not what was promised. Ask, and I will tell you where the road leads."`,
  artisan: (o) => `"Bring me gear and coin and I will temper it in the way of ${o.name}: ${o.materials.slice(0, 2).join(' and ')}."`,
};

// ---------- items ----------
export const RARITIES = [
  { id: 'common', w: 60, mul: 1.0 },
  { id: 'uncommon', w: 26, mul: 1.25 },
  { id: 'rare', w: 10, mul: 1.6 },
  { id: 'epic', w: 3.4, mul: 2.1 },
  { id: 'legendary', w: 0.6, mul: 2.8 },
];
export const GEAR_SLOTS = ['weapon', 'head', 'chest', 'hands', 'legs', 'feet', 'trinket'];
export const SLOT_NOUNS = {
  head: ['Hood', 'Helm', 'Visor', 'Circlet', 'Mask'],
  chest: ['Cuirass', 'Vestment', 'Coat', 'Harness', 'Robe'],
  hands: ['Grips', 'Gauntlets', 'Wraps', 'Bracers'],
  legs: ['Greaves', 'Leggings', 'Tassets', 'Trousers'],
  feet: ['Boots', 'Treads', 'Sabatons', 'Sandals'],
  trinket: ['Seal', 'Charm', 'Token', 'Sigil', 'Locket'],
};
export const RARITY_ADJ = {
  common: ['Worn', 'Plain', 'Sturdy', 'Field'],
  uncommon: ['Tempered', 'Fine', 'Oathmarked', 'Honed'],
  rare: ['Vowbound', 'Gleaming', 'Warden\'s', 'Seasoned'],
  epic: ['Covenant', 'Resonant', 'Exalted', 'Ascendant'],
  legendary: ['Unbound', 'Fifteenth', 'Primordial', 'Archivist\'s'],
};
export const CONSUMABLES = {
  'potion': { name: 'Restorative Draught', heal: 0.4, price: 20, cd: 15 },
  'ether': { name: 'Focus Ether', mana: 0.5, price: 20, cd: 15 },
};

// ---------- chat ----------
export const BOT_CHAT = [
  'Anyone heading toward {next}?', 'Watch the ridge, the {mob}s hit hard out here.', 'That boss lair near {seat} is no joke.',
  'Good hunting, Oathbound.', 'Selling spare {res} at the quartermaster.', 'The road to {next} is clear for now.',
  'Need a hand with the bounty board?', 'Just hit level {lvl}!', 'Storm rolling in, keep your heads down.',
  'Does anyone know where the {seat} shrine is?', 'Rest at the trainer, it helps.', 'Every covenant is a promise kept in public.',
];
export const MASK_WORDS = ['fuck', 'shit', 'cunt', 'bitch', 'asshole', 'bastard', 'dick'];
