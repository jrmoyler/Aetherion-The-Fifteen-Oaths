/**
 * Every castable in the sandbox, sorted by element (or, for the abilities that
 * are not elemental, by what they are: time, arcane, tech).
 *
 * The packs say where an ability came from; this says what it is. Combined labels (Earth & Crystal, Wind & Sound, and the rest) are split into pure elements. Combined labels (Earth & Crystal, Wind & Sound, and the rest) are split into pure elements. The matrix
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
  { id: 'earth', label: 'Earth', accent: '#d7a062' },
  { id: 'crystal', label: 'Crystal', accent: '#e7d4ff' },
  { id: 'wind', label: 'Wind', accent: '#cfeee6' },
  { id: 'sound', label: 'Sound', accent: '#f3ffe0' },
  { id: 'nature', label: 'Nature', accent: '#7fdc6a' },
  { id: 'poison', label: 'Poison', accent: '#a8f04a' },
  { id: 'light', label: 'Light', accent: '#ffe39a' },
  { id: 'holy', label: 'Holy', accent: '#fff6d0' },
  { id: 'cosmic', label: 'Cosmic', accent: '#b48cff' },
  { id: 'gravity', label: 'Gravity', accent: '#d9cfc2' },
  { id: 'shadow', label: 'Shadow', accent: '#8a6cff' },
  { id: 'void', label: 'Void', accent: '#6a5cff' },
  { id: 'blood', label: 'Blood', accent: '#ff3a55' },
  { id: 'arcane', label: 'Arcane', accent: '#7c8cff' },
  { id: 'illusion', label: 'Illusion', accent: '#ff9ad8' },
  { id: 'time', label: 'Time', accent: '#ffd38a' },
  { id: 'motion', label: 'Motion', accent: '#ffb088' },
  { id: 'tech', label: 'Tech', accent: '#7ff0ff' },
  { id: 'force', label: 'Force', accent: '#ffd1a3' }
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
  'casting/amethyst': 'crystal',
  'collective/dune': 'earth',
  'matrix-new/geode': 'crystal',
  'matrix-new/obsidianwall': 'earth',
  'matrix-new/crystallineheart': 'crystal',
  'codex/basalt': 'earth',

  /* ---- wind & sound ---- */
  'collective/tempest': 'wind',
  'collective/sonic': 'sound',
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
  'linear-extended/rend': 'holy',
  'casting/chains': 'holy',
  'casting/lance': 'light',
  'collective/prism': 'light',
  'matrix-new/starfall': 'light',
  'atlas/sanctuary': 'holy',
  'codex/seraph': 'holy',

  /* ---- cosmic & gravity ---- */
  'linear-extended/astral': 'cosmic',
  'casting/tome': 'cosmic',
  'casting/wolf': 'cosmic',
  'collective/graviton': 'gravity',
  'codex/nebula': 'cosmic',

  /* ---- shadow & void ---- */
  'handcast/voidslash': 'void',
  'handcast/shard': 'shadow',
  'matrix-new/umbra': 'shadow',
  'matrix-new/voidstep': 'void',
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
  'matrix-new/mirage': 'illusion',
  'atlas/echoes': 'illusion',
  'codex/glyphs': 'arcane',

  /* ---- time & motion ---- */
  'collective/chrono': 'time',
  'collective/blink': 'motion',
  'atlas/recall': 'time',
  'atlas/parallax': 'motion',
  'atlas/stillpoint': 'time',
  'codex/hourglass': 'time',

  /* ---- tech & force ---- */
  'linear-extended/cyber': 'tech',
  'handcast/monowheel': 'tech',
  'handcast/drone': 'tech',
  'collective/aegis': 'force',
  'atlas/polarity': 'force',
  'atlas/chakram': 'force',
  'atlas/reversal': 'force',
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
  'codex/quartzspire': 'crystal',
  'codex/sirennote': 'sound',
  'codex/vortexbell': 'sound',
  'codex/shearwall': 'wind',
  'codex/dustmarch': 'wind',
  'codex/harmonic': 'sound',
  'codex/briar': 'nature',
  'codex/mycelium': 'nature',
  'codex/thornvolley': 'nature',
  'codex/bloomcrown': 'nature',
  'codex/acidchoir': 'poison',
  'codex/bilelance': 'poison',
  'codex/sporecoffin': 'poison',
  'codex/noxioushalo': 'poison',
  'codex/vitriol': 'poison',
  'codex/haloguillotine': 'holy',
  'codex/reliquarydawn': 'holy',
  'codex/horizon': 'gravity',
  'codex/pulsar': 'cosmic',
  'codex/darkwell': 'gravity',
  'codex/cometharpoon': 'cosmic',
  'codex/orbitlock': 'gravity',
  'codex/umbral': 'shadow',
  'codex/voidbloom': 'void',
  'codex/shadepuppet': 'shadow',
  'codex/eclipseneedle': 'shadow',
  'codex/hemorrhage': 'blood',
  'codex/clotarmor': 'blood',
  'codex/arterial': 'blood',
  'codex/baptism': 'blood',
  'codex/heartstake': 'blood',
  'codex/veinlattice': 'blood',
  'codex/sigilgate': 'arcane',
  'codex/prismlie': 'illusion',
  'codex/runemeteor': 'arcane',
  'codex/mindlattice': 'illusion',
  'codex/secondself': 'time',
  'codex/rewindsnare': 'time',
  'codex/pendulum': 'motion',
  'codex/stasisbell': 'time',

  /* ---- pure split: one element, ten castables ---- */
  'codex/scarp': 'earth',
  'codex/sinter': 'earth',
  'codex/loess': 'earth',
  'codex/keystone': 'earth',
  'codex/prismfault': 'crystal',
  'codex/geodecage': 'crystal',
  'codex/shardchoir': 'crystal',
  'codex/lensewell': 'crystal',
  'codex/facetvolley': 'crystal',
  'codex/needleglass': 'crystal',
  'codex/katabatic': 'wind',
  'codex/rotor': 'wind',
  'codex/venturi': 'wind',
  'codex/crosscut': 'wind',
  'codex/subtone': 'sound',
  'codex/clangor': 'sound',
  'codex/overtone': 'sound',
  'codex/whisperwell': 'sound',
  'codex/cadence': 'sound',
  'codex/glissando': 'sound',
  'codex/caustic': 'light',
  'codex/aureole': 'light',
  'codex/photonwell': 'light',
  'codex/filament': 'light',
  'codex/noonblade': 'light',
  'codex/latticeflare': 'light',
  'codex/censers': 'holy',
  'codex/reliclash': 'holy',
  'codex/vowcage': 'holy',
  'codex/hymnwell': 'holy',
  'codex/redshift': 'cosmic',
  'codex/magnetar': 'cosmic',
  'codex/zodiac': 'cosmic',
  'codex/quarkspire': 'cosmic',
  'codex/slingwell': 'gravity',
  'codex/tidebar': 'gravity',
  'codex/perigee': 'gravity',
  'codex/masslance': 'gravity',
  'codex/shearorbit': 'gravity',
  'codex/plumbswing': 'gravity',
  'codex/penumbra': 'shadow',
  'codex/duskspire': 'shadow',
  'codex/mournhalo': 'shadow',
  'codex/nullwell': 'void',
  'codex/eventcage': 'void',
  'codex/absence': 'void',
  'codex/hollowvolley': 'void',
  'codex/riftpendulum': 'void',
  'codex/quietus': 'void',
  'codex/unspire': 'void',
  'codex/bindrune': 'arcane',
  'codex/leywhip': 'arcane',
  'codex/manawell': 'arcane',
  'codex/sigilvolley': 'arcane',
  'codex/doppel': 'illusion',
  'codex/falsefloor': 'illusion',
  'codex/mirrorhalo': 'illusion',
  'codex/feintcage': 'illusion',
  'codex/glamour': 'illusion',
  'codex/afterimage': 'illusion',
  'codex/latebolt': 'time',
  'codex/chronowell': 'time',
  'codex/tickcage': 'time',
  'codex/vectorlance': 'motion',
  'codex/slingvolley': 'motion',
  'codex/shearstep': 'motion',
  'codex/orbitpendulum': 'motion',
  'codex/kinethalo': 'motion',
  'codex/presscage': 'motion',
  'codex/surgewell': 'motion',
  'codex/servopylon': 'tech',
  'codex/raster': 'tech',
  'codex/gimbal': 'tech',
  'codex/hardpoint': 'tech',
  'codex/impulse': 'force',
  'codex/tensor': 'force',
  'codex/vectorhalo': 'force',
  'codex/shearforce': 'force',
  'codex/moment': 'force',
  'codex/presslance': 'force',
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
