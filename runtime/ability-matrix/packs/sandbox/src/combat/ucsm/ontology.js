/**
 * The element ontology the Universal Combat State Manager resolves against.
 *
 * Ids are the sandbox's own (`config/elements.js`): Lightning is `storm`.
 * Capability tags are the spec's starter ontology (Ability Matrix Unified
 * Combat Spec §6) — inferred from what each element *is*, not measured from
 * the casts, so they are a starting point to normalise against real cast
 * behaviour, not a statement of it.
 *
 * Plain data, no three.js: the manager and its tests run in node.
 */

export const ELEMENT_IDS = Object.freeze([
  'fire', 'frost', 'storm', 'water', 'earth', 'crystal', 'wind', 'sound',
  'nature', 'poison', 'light', 'holy', 'cosmic', 'gravity', 'shadow', 'void',
  'blood', 'arcane', 'illusion', 'time', 'motion', 'tech', 'force'
]);

export const ELEMENT_LABEL = Object.freeze({
  fire: 'Fire', frost: 'Frost', storm: 'Lightning', water: 'Water', earth: 'Earth',
  crystal: 'Crystal', wind: 'Wind', sound: 'Sound', nature: 'Nature', poison: 'Poison',
  light: 'Light', holy: 'Holy', cosmic: 'Cosmic', gravity: 'Gravity', shadow: 'Shadow',
  void: 'Void', blood: 'Blood', arcane: 'Arcane', illusion: 'Illusion', time: 'Time',
  motion: 'Motion', tech: 'Tech', force: 'Force'
});

/** Spec §6 capability registry. */
export const CAPABILITIES = Object.freeze({
  fire: ['heat', 'ignite'],
  frost: ['cold', 'brittle'],
  storm: ['electric', 'conductive'],
  water: ['wet', 'flow'],
  earth: ['solid', 'terrain'],
  crystal: ['refract', 'brittle'],
  wind: ['air', 'vector'],
  sound: ['wave', 'resonance'],
  nature: ['organic', 'growth'],
  poison: ['toxin', 'contaminate'],
  light: ['radiant', 'illuminate'],
  holy: ['sanctify', 'protect'],
  cosmic: ['astral', 'orbit'],
  gravity: ['gravity', 'mass'],
  shadow: ['obscure', 'stealth'],
  void: ['null', 'spatial'],
  blood: ['vital', 'sacrifice'],
  arcane: ['rune', 'amplify'],
  illusion: ['deceive', 'perception'],
  time: ['temporal', 'delay'],
  motion: ['kinetic', 'vector'],
  tech: ['device', 'sensor'],
  force: ['barrier', 'impulse']
});

/** The gameplay status a hit of each element leaves on what it touches. */
export const STATUS_OF = Object.freeze({
  fire: 'burning',
  frost: 'chilled',
  storm: 'charged',
  water: 'wet',
  earth: 'rooted',
  crystal: 'refracting',
  wind: 'buffeted',
  sound: 'resonating',
  nature: 'entangled',
  poison: 'poisoned',
  light: 'illuminated',
  holy: 'sanctified',
  cosmic: 'starmarked',
  gravity: 'heavy',
  shadow: 'obscured',
  void: 'hollowed',
  blood: 'bleeding',
  arcane: 'inscribed',
  illusion: 'deceived',
  time: 'delayed',
  motion: 'momentum',
  tech: 'tagged',
  force: 'staggered'
});

/** Which element a status tag belongs to. */
export const ELEMENT_OF_STATUS = Object.freeze(
  Object.fromEntries(Object.entries(STATUS_OF).map(([element, tag]) => [tag, element]))
);

export const MECHANICS = Object.freeze(['standard', 'weave', 'stance', 'counter', 'worldshape', 'convergence']);

/** Lifecycle events a host adapter emits (spec §2, existing-runtimes integration). */
export const EVENT_TYPES = Object.freeze(['cast-start', 'spawn', 'hit', 'status', 'terrain-impact', 'expire', 'interrupt']);

export function isElement(id) {
  return ELEMENT_IDS.includes(id);
}

export function hasTag(element, tag) {
  return (CAPABILITIES[element] ?? []).includes(tag);
}
