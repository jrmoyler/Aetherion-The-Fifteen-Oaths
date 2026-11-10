import { ELEMENT_IDS } from './ontology.js';
import { PLAYABLE_MECHANICS } from './mechanics/presets.js';
import { EXPANSION_STATUS } from '../../abilities/expansion-2026/status.js';

/**
 * The spec's proposed content (Unified Combat Spec §3–4), as data.
 *
 * Only explicitly implemented representatives are selectable. All
 * other entries remain proposed; a family manager alone does not promote content.
 * It is here so the combat manager, the tests and any explorer see one
 * registry with the spec's UID rule applied — existing uids untouched, new
 * ones under `matrix-expansion/<slug>` and `mechanics/<family>/<slug>`.
 *
 * Rows are in ELEMENT_IDS order (Lightning is `storm`).
 */

const STANDARD = [
  ['fire', 'Ashen Doppelganger', 'Combustion Debt', 'Delayed echo clone / heat accumulation'],
  ['frost', 'Absolute Zero Thread', "Winter's Borrowed Breath", 'Freezing filament / velocity-to-armor'],
  ['storm', 'Thunderhead Parasite', 'Synaptic Override', 'Attached attack-reactive storm / interrupt diversion'],
  ['water', 'Tidal Memory', 'Hydraulic Marionette', 'Reversed wave path / liquid movement tether'],
  ['earth', 'Strata Exchange', 'Lithic Momentum', 'Terrain exchange / accumulated rolling mass'],
  ['crystal', 'Refraction Tribunal', 'Diamond Remembrance', 'Projectile refraction / impact-memory replay'],
  ['wind', 'Pressure Inversion', 'Skyhook Draft', 'Air-pressure inversion / navigable draft'],
  ['sound', 'Resonance Theft', 'Antiphase', 'Capture attack frequency / opposing phase cancellation'],
  ['nature', 'Predatory Canopy', 'Symbiotic Exchange', 'Overhead living trap / ally regeneration link'],
  ['poison', 'Toxin Evolution', 'Venom Mimicry', 'Evolving toxin / infectious status imitation'],
  ['light', 'Photon Doppel', 'Daybreak Exposure', 'Absorbing light decoy / precision exposure'],
  ['holy', "Martyr's Accord", 'Absolution', 'Protective sacrifice / conversion of ailments to shield'],
  ['cosmic', 'Celestial Cartography', 'Vacuum Genesis', 'Constellation-triggered strike / vacuum pocket'],
  ['gravity', 'Equivalence Engine', 'Lagrange Trap', 'Inverse linked mass / projectile orbital capture'],
  ['shadow', 'Nightshade Inheritance', 'Umbra Exchange', 'Shadow inheritance on defeat / anchored shadow position swap'],
  ['void', 'Existence Tax', 'Spatial Excision', 'Consume eligible construct / temporary spatial severance'],
  ['blood', 'Pulse Covenant', 'Hematite Arsenal', 'Cadence-linked strikes / bounded vitality weapons'],
  ['arcane', "Spellwright's Gambit", 'Countermand Sigil', 'Compose attack shapes / cast-reactive sigil'],
  ['illusion', 'False Victory', 'Paradox Audience', 'False enemy defeat / misleading caster positions'],
  ['time', 'Borrowed Tomorrow', 'Temporal Mortgage', 'Deferred stronger strike / borrowed speed with recovery debt'],
  ['motion', 'Momentum Ledger', 'Trajectory Hijack', 'Store movement energy / redirect projectile heading'],
  ['tech', 'Adaptive Fabricator', 'Signal Jack', 'Adaptive device / hostile deployable takeover'],
  ['force', 'Impact Dividend', 'Inertia Verdict', 'Bank blocked impulse / directional movement constraint']
];

/** Five mechanic families × 23 elements, in ELEMENT_IDS order. */
const MECHANIC_MOVES = {
  weave: {
    family: 'Covenant Weaving',
    rule: 'Persistent 2–3 anchor spatial graph: 3 anchors per caster, 12 s life, 14 m max link, 18–30 s cooldown; enemy attacks can break anchors.',
    moves: ['Infernal Circuit', 'Cryostasis Mesh', 'Neural Thunder Grid', 'Hydrostatic Labyrinth', 'Tectonic Triangulation', 'Prismatic Cathedral', 'Jetstream Loom', 'Harmonic Interference', 'Worldroot Network', 'Plague Circuit', 'Helios Array', 'Sanctum Concord', 'Constellation Engine', 'Lagrangian Architecture', 'Penumbra Web', 'Nullspace Topology', 'Hemodynamic Conduit', 'Runic Compiler', 'Impossible Geometry', 'Chronometric Lattice', 'Vector Rail', 'Distributed Combat Network', 'Kinetic Truss']
  },
  stance: {
    family: 'Sovereign Stances',
    rule: 'Temporary combat form: changes locomotion, attack grammar, defence and finisher; 15 s max, one at a time, drains sovereignty.',
    moves: ['Crown of the First Ember', 'The Pale Monarch', 'Thundergod Conduction', "Leviathan's Mantle", 'Titan of the Deep Strata', 'Diamond Sovereign', 'Skybreaker Form', 'Maestro of Ruin', 'The Elderwild Avatar', 'Venom Regent', 'Solar Ascendant', 'Seraphic Judgment', 'Astral Imperator', 'Singularity Sovereign', 'King of the Last Night', 'The Unwritten Form', 'Crimson Archon', 'Archmage Unbound', 'The Thousand-Faced Sovereign', 'Eternal Second', 'Vector Ascendant', 'Warframe Overdrive', 'Aegis Exemplar']
  },
  counter: {
    family: 'Resonant Counters',
    rule: 'Reactive window: perfect timing reverses elementally, partial timing only reduces damage, a whiff costs recovery; never cancels uncounterable effects.',
    moves: ['Backdraft Reprisal', 'Shatterpoint Reversal', 'Feedback Execution', 'Undertow Reversal', 'Faultline Retort', 'Facet Reprisal', 'Vacuum Riposte', 'Dissonance Break', 'Briar Retribution', 'Antivenom Paradox', 'Flashpoint Riposte', 'Divine Intercession', 'Stellar Return', 'Mass Reversal', 'Nocturne Riposte', 'Null Verdict', 'Heartbeat Reversal', 'Sigil Interception', 'False Opening', 'Causality Riposte', 'Trajectory Reversal', 'Adaptive Countermeasure', 'Newtonian Judgment']
  },
  worldshape: {
    family: 'Worldshaping',
    rule: 'Combat-local terrain, collision, navigation and force regions; bounded, reversible, deterministic; illusory terrain never changes collision.',
    moves: ['The Scorched Kingdom', "Glacier's Dominion", 'Stormground', 'The Living Floodplain', 'Continental Uprising', 'The Glass Labyrinth', 'Jetstream Province', 'Resonant Amphitheater', 'Primeval Reclamation', 'Blight Territory', 'Solar Meridian', 'Consecrated Ground', 'Celestial Fracture', 'The Inverted Expanse', 'The Endless Dusk', 'The Hollow Frontier', 'The Crimson Biome', 'Leyline Dominion', 'Unreliable Reality', 'Epoch Overlap', 'Kinetic Landscape', 'Nanoforge Territory', 'Bastion Geometry']
  },
  convergence: {
    family: 'Convergence Casting',
    rule: 'Two or more active elemental contributions resolve into typed reactions with owner attribution, bounded amplification and diminishing returns.',
    moves: ['Promethean Ignition', 'Absolute Crystallization', 'Storm Catalyst', 'Hydrodynamic Synthesis', 'Elemental Lithification', 'Prismatic Multiplication', 'Atmospheric Ascension', 'Harmonic Amplification', 'Symbiotic Bloom', 'Mutagenic Confluence', 'Photonic Transmutation', 'Sacred Concordance', 'Stellar Synthesis', 'Singularity Infusion', 'Umbra Convergence', 'Annihilation Interface', 'Vital Covenant', 'Universal Spellforge', 'Phantasmal Synthesis', 'Chrono Convergence', 'Vector Fusion', 'Cybernetic Integration', 'Kinetic Convergence']
  }
};

export function slugOf(name) {
  return name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function entry(uid, element, name, mechanic, note) {
  const selectable = PLAYABLE_MECHANICS.includes(uid) || (mechanic === 'standard' && EXPANSION_STATUS[uid] === 'live');
  return Object.freeze({ uid, element, name, mechanic, note, status: selectable ? 'live' : 'proposed', selectable });
}

/** The 46 proposed standard castables. */
export const PROPOSED_STANDARD = Object.freeze(
  STANDARD.flatMap(([element, a, b, note]) => {
    const [na, nb] = note.split(' / ');
    return [entry(`matrix-expansion/${slugOf(a)}`, element, a, 'standard', na), entry(`matrix-expansion/${slugOf(b)}`, element, b, 'standard', nb)];
  })
);

/** All 115 design-roster mechanic moves; only implemented entries are selectable. */
export const MECHANIC_REGISTRY = Object.freeze(
  Object.entries(MECHANIC_MOVES).flatMap(([mechanic, { moves, family }]) =>
    moves.map((name, i) => entry(`mechanics/${mechanic}/${slugOf(name)}`, ELEMENT_IDS[i], name, mechanic, family))
  )
);

export const MECHANIC_FAMILIES = Object.freeze(
  Object.fromEntries(Object.entries(MECHANIC_MOVES).map(([id, { family, rule }]) => [id, { family, rule }]))
);

export const PROPOSED_MECHANICS = Object.freeze(MECHANIC_REGISTRY.filter((p) => !p.selectable));
export const IMPLEMENTED_MECHANICS = Object.freeze(MECHANIC_REGISTRY.filter((p) => p.selectable));
export const EXPANSION_REGISTRY = Object.freeze([...PROPOSED_STANDARD, ...MECHANIC_REGISTRY]);
export const PROPOSED = Object.freeze(EXPANSION_REGISTRY.filter((p) => !p.selectable));
