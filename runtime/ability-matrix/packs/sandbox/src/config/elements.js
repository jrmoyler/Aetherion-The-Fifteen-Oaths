/**
 * Every castable in the sandbox, sorted by element (or, for the abilities that
 * are not elemental, by what they are: time, arcane, tech).
 *
 * The packs say where an ability came from; this says what it is. The matrix
 * shell groups its spellbook by this and the catalog carries it as `element`.
 * Plain data, no imports.
 *
 * The source packs are vendored byte-for-byte, so their abilities cannot carry
 * the tag themselves — they are listed here by uid. The native groups list
 * theirs here too, so there is one place to read the whole map. A codex
 * ability's own `meta.element` must agree with it (the tests check).
 */

/** Display order and presentation of each element. */
export const ELEMENT_GROUPS = [
  { id: 'fire', label: 'Fire', accent: '#ff7a3d' },
  { id: 'frost', label: 'Frost', accent: '#9fe0ff' },
  { id: 'storm', label: 'Lightning', accent: '#8fb8ff' },
  { id: 'water', label: 'Water', accent: '#3fa9ff' },
  { id: 'earth', label: 'Earth & Crystal', accent: '#d7a062' },
  { id: 'wind', label: 'Wind & Sound', accent: '#cfeee6' },
  { id: 'nature', label: 'Nature', accent: '#7fdc6a' },
  { id: 'poison', label: 'Poison', accent: '#a8f04a' },
  { id: 'light', label: 'Light & Holy', accent: '#ffe39a' },
  { id: 'cosmic', label: 'Cosmic & Gravity', accent: '#b48cff' },
  { id: 'shadow', label: 'Shadow & Void', accent: '#8a6cff' },
  { id: 'blood', label: 'Blood', accent: '#ff3a55' },
  { id: 'arcane', label: 'Arcane & Illusion', accent: '#7c8cff' },
  { id: 'time', label: 'Time & Motion', accent: '#ffd38a' },
  { id: 'tech', label: 'Tech & Force', accent: '#7ff0ff' }
];

/** uid → element id. */
export const ELEMENT_OF = {
  /* ---- fire ---- */
  'linear/meteor': 'fire',
  'linear-ext/pyre': 'fire',
  'linear-ext/firePortal': 'fire',
  'linear-ext/fire': 'fire',
  'linear-extended/ward': 'fire',
  'handcast/phoenix': 'fire',
  'casting/dragon': 'fire',
  'collective/swarm': 'fire',
  'matrix-new/emberveil': 'fire',
  'codex/solarlash': 'fire',

  /* ---- frost ---- */
  'linear/ice': 'frost',
  'linear/glacier': 'frost',
  'handcast/glacial': 'frost',
  'handcast/frost': 'frost',
  'codex/permafrost': 'frost',
  'codex/avalanche': 'frost',

  /* ---- lightning ---- */
  'linear/thunder': 'storm',
  'linear/snare': 'storm',
  'linear-ext/electrical': 'storm',
  'linear-ext/boost': 'storm',
  'casting/gyro': 'storm',
  'collective/chain': 'storm',
  'matrix-new/ionstorm': 'storm',
  'atlas/relay': 'storm',
  'codex/balllightning': 'storm',

  /* ---- water ---- */
  'linear-ext/kraken': 'water',
  'linear-ext/aether': 'water',
  'linear-extended/ink': 'water',
  'casting/shark': 'water',
  'codex/maelstrom': 'water',
  'codex/riptide': 'water',

  /* ---- earth & crystal ---- */
  'linear-ext/earth': 'earth',
  'linear-extended/quake': 'earth',
  'casting/amethyst': 'earth',
  'collective/dune': 'earth',
  'matrix-new/geode': 'earth',
  'matrix-new/obsidianwall': 'earth',
  'matrix-new/crystallineheart': 'earth',
  'codex/basalt': 'earth',

  /* ---- wind & sound ---- */
  'collective/tempest': 'wind',
  'collective/sonic': 'wind',
  'matrix-new/gale': 'wind',
  'codex/zephyr': 'wind',
  'codex/downburst': 'wind',

  /* ---- nature ---- */
  'linear-ext/portal': 'nature',
  'linear-extended/growth': 'nature',
  'casting/reliquary': 'nature',
  'collective/spore': 'nature',
  'codex/pollen': 'nature',
  'codex/seedstorm': 'nature',

  /* ---- poison ---- */
  'linear-extended/acid': 'poison',
  'linear-extended/venom': 'poison',
  'handcast/toxic': 'poison',
  'codex/plague': 'poison',
  'codex/miasma': 'poison',

  /* ---- light & holy ---- */
  'linear/beam': 'light',
  'linear-extended/rend': 'light',
  'casting/chains': 'light',
  'casting/lance': 'light',
  'collective/prism': 'light',
  'matrix-new/starfall': 'light',
  'atlas/sanctuary': 'light',
  'codex/seraph': 'light',

  /* ---- cosmic & gravity ---- */
  'linear-extended/astral': 'cosmic',
  'casting/tome': 'cosmic',
  'casting/wolf': 'cosmic',
  'collective/graviton': 'cosmic',
  'codex/nebula': 'cosmic',

  /* ---- shadow & void ---- */
  'handcast/voidslash': 'shadow',
  'handcast/shard': 'shadow',
  'matrix-new/umbra': 'shadow',
  'matrix-new/voidstep': 'shadow',
  'codex/nightfall': 'shadow',
  'codex/wraiths': 'shadow',

  /* ---- blood ---- */
  'handcast/flux': 'blood',
  'collective/crimson': 'blood',
  'matrix-new/bloodroot': 'blood',
  'codex/sanguine': 'blood',

  /* ---- arcane & illusion ---- */
  'linear-ext/magic': 'arcane',
  'linear-extended/cascade': 'arcane',
  'matrix-new/aetherblade': 'arcane',
  'matrix-new/mirage': 'arcane',
  'atlas/echoes': 'arcane',
  'codex/glyphs': 'arcane',

  /* ---- time & motion ---- */
  'collective/chrono': 'time',
  'collective/blink': 'time',
  'atlas/recall': 'time',
  'atlas/parallax': 'time',
  'atlas/stillpoint': 'time',
  'codex/hourglass': 'time',

  /* ---- tech & force ---- */
  'linear-extended/cyber': 'tech',
  'handcast/monowheel': 'tech',
  'handcast/drone': 'tech',
  'collective/aegis': 'tech',
  'atlas/polarity': 'tech',
  'atlas/chakram': 'tech',
  'atlas/reversal': 'tech',
  'atlas/refractor': 'tech',
  'codex/railgun': 'tech',
  'codex/orbital': 'tech',

  /* ---- tenth of every element still short of ten ---- */
  'codex/hoarfrost': 'frost',
  'codex/rimehalo': 'frost',
  'codex/whiteout': 'frost',
  'codex/calving': 'frost',
  'codex/fulgur': 'storm',
  'codex/brine': 'water',
  'codex/glasstide': 'water',
  'codex/undertow': 'water',
  'codex/pearltempest': 'water',
  'codex/faultchoir': 'earth',
  'codex/quartzspire': 'earth',
  'codex/sirennote': 'wind',
  'codex/vortexbell': 'wind',
  'codex/shearwall': 'wind',
  'codex/dustmarch': 'wind',
  'codex/harmonic': 'wind',
  'codex/briar': 'nature',
  'codex/mycelium': 'nature',
  'codex/thornvolley': 'nature',
  'codex/bloomcrown': 'nature',
  'codex/acidchoir': 'poison',
  'codex/bilelance': 'poison',
  'codex/sporecoffin': 'poison',
  'codex/noxioushalo': 'poison',
  'codex/vitriol': 'poison',
  'codex/haloguillotine': 'light',
  'codex/reliquarydawn': 'light',
  'codex/horizon': 'cosmic',
  'codex/pulsar': 'cosmic',
  'codex/darkwell': 'cosmic',
  'codex/cometharpoon': 'cosmic',
  'codex/orbitlock': 'cosmic',
  'codex/umbral': 'shadow',
  'codex/voidbloom': 'shadow',
  'codex/shadepuppet': 'shadow',
  'codex/eclipseneedle': 'shadow',
  'codex/hemorrhage': 'blood',
  'codex/clotarmor': 'blood',
  'codex/arterial': 'blood',
  'codex/baptism': 'blood',
  'codex/heartstake': 'blood',
  'codex/veinlattice': 'blood',
  'codex/sigilgate': 'arcane',
  'codex/prismlie': 'arcane',
  'codex/runemeteor': 'arcane',
  'codex/mindlattice': 'arcane',
  'codex/secondself': 'time',
  'codex/rewindsnare': 'time',
  'codex/pendulum': 'time',
  'codex/stasisbell': 'time',
};

/** The element of a uid, or null for anything not in the map. */
export function elementOf(uid) {
  return ELEMENT_OF[uid] ?? null;
}

/** Position of an element in the display order (unknowns sort last). */
export function elementRank(element) {
  const index = ELEMENT_GROUPS.findIndex((group) => group.id === element);
  return index < 0 ? ELEMENT_GROUPS.length : index;
}
