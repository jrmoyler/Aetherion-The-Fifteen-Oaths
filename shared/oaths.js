// Canonical Oath / region data shared by client, server and simulation.
// Names, elements, palettes, materials and architecture motifs are taken from
// AETHERION_CANON/09_ART_DIRECTION/FIFTEEN_OATH_ART_GUIDE.json and the recovered
// reference sheets (assets/references/reference-060 .. reference-113).
// Region positions satisfy every land adjacency in AETHERION_CANON/03_GEOGRAPHY/WORLD_GRAPH.json.
// World units are metres. +X = east, +Z = north, +Y = up.

export const WORLD_SCALE = 900; // metres per layout unit

/** @typedef {{id:string,index:number,name:string,element:string,elementLabel:string,
 *  biome:string, center:[number,number], palette:Record<string,string>, accent:string,
 *  materials:string[], architecture:string, ninja:object, sorcerer:object, refs:object}} Oath */

const P = (x, z) => [Math.round((x - 0.3) * WORLD_SCALE), Math.round(z * WORLD_SCALE)];

/** @type {Oath[]} */
export const OATHS = [
  {
    id: 'oath-01', index: 1, name: 'Kiln Oath', element: 'fire', elementLabel: 'Fire',
    biome: 'volcanic', center: P(-1.9, 0.6),
    palette: { primary: '#1c1a19', secondary: '#9a4a2c', accent: '#ff7a2a', stone: '#3a3634', trim: '#6b3a24', glow: '#ff6a1a' },
    accent: '#ff7a2a',
    materials: ['fired ceramic', 'oxidized iron', 'firecloth'],
    architecture: 'Obsidian basalt terraces, vented foundry towers and lava-lit channels',
    ninja: { title: 'Kiln Ninja', silhouette: 'Short asymmetric dark cape, red ceramic torso slats and vented forearm blocks over black fabric.', weapon: 'ceramic wedge blade', ref: 'reference-090' },
    sorcerer: { title: 'Kiln Sorcerer', silhouette: 'Short broad forge-worker, terracotta apron panels and tall rectangular back kiln.', weapon: 'kiln focus cannon', ref: 'reference-091' },
    refs: { environment: 'reference-113', armor: 'reference-060', weapons: 'reference-061' },
  },
  {
    id: 'oath-02', index: 2, name: 'Rime Archive', element: 'frost', elementLabel: 'Frost',
    biome: 'glacial', center: P(-1.2, 1.6),
    palette: { primary: '#2b2e33', secondary: '#e8e6e0', accent: '#9fd4f0', stone: '#4a5058', trim: '#c9d3da', glow: '#8fdcff' },
    accent: '#8fdcff',
    materials: ['quilted felt', 'dark leather', 'rime laminate'],
    architecture: 'Glacial vault shelves, ice pillars and dark stone archive thresholds',
    ninja: { title: 'Rime Ninja', silhouette: 'Hooded quilted felt jacket, white quilted plates over charcoal, ice-laminate shoulder.', weapon: 'frost saber', ref: 'reference-089' },
    sorcerer: { title: 'Rime Sorcerer', silhouette: 'Tall gaunt archivist, long charcoal robes with chalk-white panels, ledger tomes.', weapon: 'rime repeater', ref: 'reference-088' },
    refs: { environment: 'reference-112', armor: 'reference-058', weapons: 'reference-059' },
  },
  {
    id: 'oath-03', index: 3, name: 'Storm Relay', element: 'storm', elementLabel: 'Lightning',
    biome: 'alpine', center: P(0.2, 1.7),
    palette: { primary: '#1e2a44', secondary: '#b8743a', accent: '#a9b8ff', stone: '#3c4048', trim: '#c58a4a', glow: '#b4a2ff' },
    accent: '#b4a2ff',
    materials: ['insulating cloth', 'copper', 'matte ceramic'],
    architecture: 'Mountain relay pylons, suspended conductive bridges and linked towers',
    ninja: { title: 'Storm Ninja', silhouette: 'Lean navy wrap, copper wire harness, antenna rods on the back.', weapon: 'chain relay whip', ref: 'reference-085' },
    sorcerer: { title: 'Storm Sorcerer', silhouette: 'Broad navy cape-mantle with copper prong collar, ceramic white boots.', weapon: 'conductor staff', ref: 'reference-087' },
    refs: { environment: 'reference-111', armor: 'reference-056', weapons: 'reference-057' },
  },
  {
    id: 'oath-04', index: 4, name: 'Tidal Covenant', element: 'water', elementLabel: 'Water',
    biome: 'coast', center: P(-1.3, -1.8),
    palette: { primary: '#1d3352', secondary: '#e9e1d2', accent: '#4fb6c9', stone: '#d8d0c0', trim: '#b08a4a', glow: '#58d4ff' },
    accent: '#58d4ff',
    materials: ['diving cloth', 'nacre shell', 'brass', 'clear reservoir glass'],
    architecture: 'Pale coastal aqueduct terraces, shell arches and canal gates',
    ninja: { title: 'Tidal Ninja', silhouette: 'Sleek deep-blue diving suit, nacre shell pauldrons and fin helm.', weapon: 'crescent blade', ref: 'reference-084' },
    sorcerer: { title: 'Tidal Sorcerer', silhouette: 'Elder in deep-blue robes, pearl collar ring and glass water reservoirs.', weapon: 'tide grip staff', ref: 'reference-086' },
    refs: { environment: 'reference-110', armor: 'reference-054', weapons: 'reference-055' },
  },
  {
    id: 'oath-05', index: 5, name: 'Fault Choir', element: 'earth', elementLabel: 'Earth & Crystal',
    biome: 'canyon', center: P(-0.6, 0.7),
    palette: { primary: '#4a4440', secondary: '#c8a77a', accent: '#9a5cd6', stone: '#a58a68', trim: '#6e5a44', glow: '#b07cff' },
    accent: '#b07cff',
    materials: ['layered shale', 'sandstone', 'leather', 'raw amethyst'],
    architecture: 'Canyon terraces, broad lintels and crystal-seamed retaining walls',
    ninja: { title: 'Fault Ninja', silhouette: 'Heavy-set, layered shale plates over leather, amethyst knuckle inserts.', weapon: 'amethyst short blade', ref: 'reference-082' },
    sorcerer: { title: 'Fault Sorcerer', silhouette: 'Sturdy stonemason with sandstone tablets carried on a back frame.', weapon: "amethyst seer's mace", ref: 'reference-083' },
    refs: { environment: 'reference-109', armor: 'reference-052', weapons: 'reference-053' },
  },
  {
    id: 'oath-06', index: 6, name: 'Reed Resonance', element: 'wind', elementLabel: 'Wind & Sound',
    biome: 'cliffs', center: P(1.4, 1.4),
    palette: { primary: '#e6dccb', secondary: '#8a6a4a', accent: '#c8402a', stone: '#d2c4aa', trim: '#9a7a52', glow: '#e8f2ff' },
    accent: '#e8f2ff',
    materials: ['woven linen', 'dry bamboo', 'carved resonator wood'],
    architecture: 'Open cliff amphitheaters, curved acoustic fins and tensile walkways',
    ninja: { title: 'Reed Ninja', silhouette: 'Lean dancer, wrapped linen with vermilion sash ribbons, bird-beak mask.', weapon: 'folding battle fan', ref: 'reference-081' },
    sorcerer: { title: 'Reed Sorcerer', silhouette: 'Tall elder in layered ivory linen with reed-pipe quiver.', weapon: 'reed tuning-fork focus', ref: 'reference-080' },
    refs: { environment: 'reference-108', armor: 'reference-051', weapons: 'reference-050' },
  },
  {
    id: 'oath-07', index: 7, name: 'Graft Sanctuary', element: 'nature', elementLabel: 'Nature',
    biome: 'forest', center: P(-1.6, -0.6),
    palette: { primary: '#4a3a28', secondary: '#5f7a3a', accent: '#e0a030', stone: '#6a5a44', trim: '#8a6a3a', glow: '#ffc04a' },
    accent: '#ffc04a',
    materials: ['living bark', 'moss fiber', 'straw weave', 'translucent sap'],
    architecture: 'Root arches, woven living platforms and cultivated tree chambers',
    ninja: { title: 'Graft Ninja', silhouette: 'Bark-plated hunter with moss fiber wraps and a carved wooden mask.', weapon: 'living twig bow', ref: 'reference-079' },
    sorcerer: { title: 'Graft Sorcerer', silhouette: 'Elder gardener with a woven basket of living saplings on her back.', weapon: 'sapling staff', ref: 'reference-078' },
    refs: { environment: 'reference-107', armor: 'reference-048', weapons: 'reference-049' },
  },
  {
    id: 'oath-08', index: 8, name: 'Bitterglass Guild', element: 'poison', elementLabel: 'Poison',
    biome: 'marsh', center: P(-0.5, -0.6),
    palette: { primary: '#1e1c1a', secondary: '#8a7440', accent: '#b8d630', stone: '#4a4a40', trim: '#9a8048', glow: '#c4ff3a' },
    accent: '#c4ff3a',
    materials: ['oilskin', 'leather', 'pitted brass', 'sealed glass'],
    architecture: 'Greenhouse arcades, isolated reaction towers and bounded treatment pools',
    ninja: { title: 'Bitterglass Ninja', silhouette: 'Oilskin fatigues, respirator mask, reagent vial bandolier.', weapon: 'poison sabre', ref: 'reference-077' },
    sorcerer: { title: 'Bitterglass Sorcerer', silhouette: 'Long oilskin coat with tall brass reagent flasks on the shoulders.', weapon: 'alchemical crossbow', ref: 'reference-076' },
    refs: { environment: 'reference-106', armor: 'reference-045', weapons: 'reference-047' },
  },
  {
    id: 'oath-09', index: 9, name: 'Oath of Daybreak', element: 'light', elementLabel: 'Light & Holy',
    biome: 'meadow', center: P(0.6, 0.4),
    palette: { primary: '#ece4d2', secondary: '#8a8a88', accent: '#d8b060', stone: '#e8e2d6', trim: '#c8a050', glow: '#fff0b0' },
    accent: '#ffe08a',
    materials: ['folded enamel', 'woven cloth', 'brushed metal'],
    architecture: 'Marble radiant plazas, lotus dais, colonnades and sun-forged screens',
    ninja: { title: 'Daybreak Ninja', silhouette: 'Folded ivory enamel plates over gray bodysuit, gold visor band.', weapon: 'lotus short sword', ref: 'reference-075' },
    sorcerer: { title: 'Daybreak Sorcerer', silhouette: 'Silver-haired elder in ivory layered robes with gold lotus clasp.', weapon: 'radiant lotus staff', ref: 'reference-074' },
    refs: { environment: 'reference-105', armor: 'reference-044', weapons: 'reference-046' },
  },
  {
    id: 'oath-10', index: 10, name: 'Tidal Observatory', element: 'cosmic', elementLabel: 'Cosmic & Gravity',
    biome: 'highland', center: P(2.4, 0.9),
    palette: { primary: '#1c1f3a', secondary: '#2c2c30', accent: '#8a5ad8', stone: '#4a4c58', trim: '#a8acb8', glow: '#9a7aff' },
    accent: '#9a7aff',
    materials: ['meteor iron', 'wool', 'violet enamel', 'brushed metal'],
    architecture: 'Cliff observatories, orbital monuments and suspended platforms',
    ninja: { title: 'Observatory Ninja', silhouette: 'Massive armored brawler, meteor-iron dome helm, crescent shoulder.', weapon: 'paired gravity flail', ref: 'reference-073' },
    sorcerer: { title: 'Observatory Sorcerer', silhouette: 'Round indigo robe ringed with hanging orbital spheres.', weapon: 'orbital astrolabe staff', ref: 'reference-072' },
    refs: { environment: 'reference-104', armor: 'reference-042', weapons: 'reference-043' },
  },
  {
    id: 'oath-11', index: 11, name: 'The Missing Court', element: 'shadow', elementLabel: 'Shadow & Void',
    biome: 'badlands', center: P(2.5, -0.5),
    palette: { primary: '#121214', secondary: '#2e2e32', accent: '#8a2a30', stone: '#4a4a4c', trim: '#a8a8b0', glow: '#7a5aff' },
    accent: '#a070ff',
    materials: ['matte cloth', 'worn dark metal', 'black velvet'],
    architecture: 'Eroded court blocks, broken thresholds and interrupted monumental walls',
    ninja: { title: 'Court Ninja', silhouette: 'Slim black ninja, high ponytail, face wrap and fitted leather.', weapon: 'notched cleaver', ref: 'reference-071' },
    sorcerer: { title: 'Court Sorcerer', silhouette: 'Gaunt bald magistrate in a floor-length ink-black coat with silver clasps.', weapon: 'void mace', ref: 'reference-070' },
    refs: { environment: 'reference-103', armor: 'reference-040', weapons: 'reference-041' },
  },
  {
    id: 'oath-12', index: 12, name: 'Sanguine Covenant', element: 'blood', elementLabel: 'Blood',
    biome: 'crimson', center: P(0.6, -0.9),
    palette: { primary: '#4a1418', secondary: '#6a1e24', accent: '#c8a060', stone: '#6a4440', trim: '#5a5048', glow: '#ff2a3a' },
    accent: '#ff3a4a',
    materials: ['oxblood leather', 'crimson glass/enamel', 'patinated iron'],
    architecture: 'Crimson fortresses, ritual pillars and bound ceremonial platforms',
    ninja: { title: 'Sanguine Ninja', silhouette: 'Full oxblood hood and wraps, chain-bound forearms.', weapon: 'blood lash', ref: 'reference-069' },
    sorcerer: { title: 'Sanguine Sorcerer', silhouette: 'Burgundy layered robes with flared sleeves and iron ritual rings.', weapon: 'blood gauntlet', ref: 'reference-067' },
    refs: { environment: 'reference-102', armor: 'reference-038', weapons: 'reference-039' },
  },
  {
    id: 'oath-13', index: 13, name: 'Folded Theatre', element: 'arcane', elementLabel: 'Arcane & Illusion',
    biome: 'terraces', center: P(1.6, 0.0),
    palette: { primary: '#3a2a3e', secondary: '#e8e0d4', accent: '#c8a050', stone: '#e0d8cc', trim: '#2a3450', glow: '#e070ff' },
    accent: '#e070ff',
    materials: ['folded lacquer/enamel', 'cloth', 'old silver', 'faceted mirror'],
    architecture: 'Folded screen plazas, optical gates and rearranging mirror corridors',
    ninja: { title: 'Theatre Ninja', silhouette: 'Plum and black folded lacquer coat, white mirror mask.', weapon: 'ceremonial rapier', ref: 'reference-068' },
    sorcerer: { title: 'Theatre Sorcerer', silhouette: 'Mauve folded-collar coat, asymmetric bob, folding mirror codex.', weapon: 'mirror codex', ref: 'reference-066' },
    refs: { environment: 'reference-100', armor: 'reference-035', weapons: 'reference-036' },
  },
  {
    id: 'oath-14', index: 14, name: 'Escapement Road', element: 'time', elementLabel: 'Time & Motion',
    biome: 'plateau', center: P(1.6, -1.2),
    palette: { primary: '#1e3a40', secondary: '#a8844a', accent: '#e8dcc0', stone: '#8a8478', trim: '#b8904a', glow: '#ffd88a' },
    accent: '#ffd88a',
    materials: ['woven cloth', 'leather', 'aged brass', 'smoked glass'],
    architecture: 'Elevated clockwork highways, kinetic arch gates and temporal workshop bays',
    ninja: { title: 'Escapement Ninja', silhouette: 'Petrol teal vest, brass goggles, flywheel hip gear.', weapon: 'chronal scythe', ref: 'reference-065' },
    sorcerer: { title: 'Escapement Sorcerer', silhouette: 'Petrol teal coat with brass wrist escapements and pendulum harness.', weapon: 'pendulum ring', ref: 'reference-064' },
    refs: { environment: 'reference-099', armor: 'reference-033', weapons: 'reference-034' },
  },
  {
    id: 'oath-15', index: 15, name: 'Impulse Foundry', element: 'tech', elementLabel: 'Tech & Force',
    biome: 'industrial', center: P(2.4, -1.7),
    palette: { primary: '#3a3c40', secondary: '#24262a', accent: '#f07a20', stone: '#5a5c60', trim: '#8a8c90', glow: '#ffa040' },
    accent: '#ffa040',
    materials: ['steel', 'ceramic inserts', 'rubber grips', 'heavy cloth'],
    architecture: 'Industrial rail bays, modular gantries and kinetic fortifications',
    ninja: { title: 'Impulse Ninja', silhouette: 'Armored gunmetal harness, white face visor, impulse gauntlets.', weapon: 'impulse hammer', ref: 'reference-063' },
    sorcerer: { title: 'Impulse Sorcerer', silhouette: 'Long gunmetal greatcoat with orange lining and a back power pack.', weapon: 'folding shield', ref: 'reference-062' },
    refs: { environment: 'reference-101', armor: 'reference-031', weapons: 'reference-032' },
  },
];

/** Land routes between regions (from WORLD_GRAPH.json). */
export const ROUTES = [
  [1, 2], [1, 5], [1, 7], [2, 3], [2, 5], [3, 5], [3, 6], [3, 9], [4, 7], [4, 8], [5, 7], [5, 8], [5, 9],
  [6, 9], [6, 10], [6, 13], [7, 8], [8, 9], [8, 12], [9, 12], [9, 13], [10, 13], [10, 11], [11, 13],
  [11, 14], [11, 15], [12, 13], [12, 14], [13, 14], [14, 15],
].map(([a, b]) => [`oath-${String(a).padStart(2, '0')}`, `oath-${String(b).padStart(2, '0')}`]);

export const OATH_BY_ID = Object.fromEntries(OATHS.map((o) => [o.id, o]));
export const OATH_BY_ELEMENT = Object.fromEntries(OATHS.map((o) => [o.element, o]));

/** Sanctuary (arena plaza + city) footprint around each region center. */
export const SANCTUARY = { plazaRadius: 42, cityRadius: 150, influenceRadius: 380 };

/** Classes. Ninja = agile melee/line, Sorcerer = ranged/zone caster. */
export const CLASSES = {
  ninja: { id: 'ninja', label: 'Ninja', hp: 140, mp: 100, hpPerLevel: 18, mpPerLevel: 8, moveSpeed: 6.4, basicRange: 3.2, basicDamage: 14, basicCooldown: 0.75 },
  sorcerer: { id: 'sorcerer', label: 'Sorcerer', hp: 110, mp: 150, hpPerLevel: 13, mpPerLevel: 14, moveSpeed: 5.9, basicRange: 22, basicDamage: 12, basicCooldown: 1.0 },
};

export const MAX_LEVEL = 30;
export const xpForLevel = (lvl) => Math.round(80 * Math.pow(lvl, 1.55));

/** Nearest oath region for a world position. */
export function regionAt(x, z) {
  let best = OATHS[0];
  let bd = Infinity;
  for (const o of OATHS) {
    const d = (o.center[0] - x) ** 2 + (o.center[1] - z) ** 2;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

export function hexToRgb01(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
