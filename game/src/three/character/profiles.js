// Head, hair and face-gear descriptors for the 30 heroes, read from the
// NINJA / SORCERER panels of the per-Oath concept sheets
// (assets/references/reference-099..113; 099 is Oath 14 and 113 is Oath 01).
// Units are normalised to head height (chin to crown = 1).
//
// skin: albedo; age 0..1 (wrinkle depth, skin sag); build: face width factor;
// hair: style + colour; beard; gear: face equipment worn over the head.
const SKIN = {
  deep: '#4a2c1e', brown: '#7a4a32', tan: '#a8734f', olive: '#b98a62', light: '#d2a184', pale: '#e0bba2', porcelain: '#e8c9b6',
};
const HAIR = {
  black: '#211b19', ink: '#221f27', brown: '#3a2618', gray: '#8e8c8a', silver: '#b9b6b2', white: '#dedbd4', auburn: '#4a2418',
};

export const PROFILES = {
  'oath-01-ninja': { sex: 'm', skin: SKIN.olive, eye: '#3a2414', age: .2, build: 1.04, hair: { style: 'short', color: HAIR.black, length: .55 }, gear: [{ type: 'wrap', color: '#1e1c1b', top: -.02 }] },
  'oath-01-sorcerer': { sex: 'f', skin: SKIN.olive, eye: '#3a2a1c', age: .62, build: 1.08, hair: { style: 'bun', color: HAIR.gray, bun: [0, .38, -.28] }, gear: [] },
  'oath-02-ninja': { sex: 'f', skin: SKIN.pale, eye: '#5a7088', age: .2, build: .96, hair: { style: 'none' }, gear: [{ type: 'hood', color: '#3b4250', deep: true }, { type: 'faceplate', color: '#eceae6', finish: 'porcelain' }] },
  'oath-02-sorcerer': { sex: 'm', skin: SKIN.light, eye: '#6a7a88', age: .9, build: .98, hair: { style: 'long', color: HAIR.white, knot: true }, beard: { style: 'braided', color: HAIR.white }, gear: [] },
  'oath-03-ninja': { sex: 'm', skin: SKIN.olive, eye: '#2a1a10', age: .25, build: 1.02, hair: { style: 'topknot', color: HAIR.black }, gear: [{ type: 'plate', color: '#a6824a', finish: 'brass' }] },
  'oath-03-sorcerer': { sex: 'f', skin: SKIN.deep, eye: '#24160e', age: .35, build: 1.16, hair: { style: 'bun', color: HAIR.black, bun: [0, .42, -.18], coils: true }, gear: [] },
  'oath-04-ninja': { sex: 'f', skin: SKIN.light, eye: '#2a2018', age: .18, build: .95, hair: { style: 'bun', color: HAIR.black, bun: [0, .44, -.22], strands: 6 }, gear: [{ type: 'wrap', color: '#e6e2d8', top: -.04 }] },
  'oath-04-sorcerer': { sex: 'm', skin: SKIN.light, eye: '#4a5a6a', age: .85, build: 1.02, hair: { style: 'swept', color: HAIR.white }, beard: { style: 'full', color: HAIR.white, length: .55 }, gear: [{ type: 'hood', color: '#e2ddd0', deep: false }] },
  'oath-05-ninja': { sex: 'm', skin: SKIN.tan, eye: '#2a1a10', age: .3, build: 1.08, hair: { style: 'short', color: HAIR.black, length: .5 }, gear: [{ type: 'wrap', color: '#2e2a26', top: -.03 }] },
  'oath-05-sorcerer': { sex: 'f', skin: SKIN.tan, eye: '#3a2414', age: .4, build: 1.12, hair: { style: 'bun', color: HAIR.brown, bun: [0, .4, -.26] }, gear: [] },
  'oath-06-ninja': { sex: 'f', skin: SKIN.light, eye: '#2a1c12', age: .2, build: .94, hair: { style: 'ponytail', color: HAIR.black }, gear: [{ type: 'beak', color: '#a37a44', finish: 'brass' }] },
  'oath-06-sorcerer': { sex: 'm', skin: SKIN.light, eye: '#3a2a1c', age: .7, build: 1.0, hair: { style: 'topknot', color: HAIR.gray }, beard: { style: 'goatee', color: HAIR.gray, length: .28 }, gear: [] },
  'oath-07-ninja': { sex: 'm', skin: SKIN.tan, eye: '#2a1a10', age: .3, build: 1.04, hair: { style: 'none' }, gear: [{ type: 'hood', color: '#4c5a2c', deep: true, leafy: true }, { type: 'faceplate', color: '#9a7448', finish: 'wood' }] },
  'oath-07-sorcerer': { sex: 'f', skin: SKIN.olive, eye: '#3a2a1c', age: .78, build: 1.0, hair: { style: 'bun', color: HAIR.silver, bun: [0, .42, -.2], twigs: true }, gear: [] },
  'oath-08-ninja': { sex: 'm', skin: SKIN.tan, eye: '#2a1a10', age: .28, build: 1.02, hair: { style: 'none' }, gear: [{ type: 'cap', color: '#2c2630' }, { type: 'respirator', color: '#a8844a', finish: 'brass' }] },
  'oath-08-sorcerer': { sex: 'f', skin: SKIN.light, eye: '#4a3a2a', age: .75, build: 1.0, hair: { style: 'bun', color: HAIR.silver, bun: [0, .44, -.22] }, gear: [{ type: 'goggles', color: '#a8844a', lens: '#c4d65a' }, { type: 'respirator', color: '#a8844a', finish: 'brass', small: true }] },
  'oath-09-ninja': { sex: 'f', skin: SKIN.brown, eye: '#24160e', age: .22, build: .96, hair: { style: 'braid', color: HAIR.black }, gear: [{ type: 'eyemask', color: '#ece4d2', trim: '#c8a050', finish: 'porcelain' }] },
  'oath-09-sorcerer': { sex: 'm', skin: SKIN.light, eye: '#5a6a78', age: .82, build: 1.02, hair: { style: 'swept', color: HAIR.white }, beard: { style: 'full', color: HAIR.white, length: .2 }, gear: [] },
  'oath-10-ninja': { sex: 'm', skin: SKIN.olive, eye: '#2a1a10', age: .25, build: 1.04, hair: { style: 'short', color: HAIR.black, length: .65 }, gear: [{ type: 'wrap', color: '#20253c', top: -.03 }] },
  'oath-10-sorcerer': { sex: 'f', skin: SKIN.olive, eye: '#2a1a10', age: .4, build: 1.2, hair: { style: 'bun', color: HAIR.black, bun: [0, .46, -.16], pins: '#c8a050' }, gear: [] },
  'oath-11-ninja': { sex: 'f', skin: SKIN.porcelain, eye: '#1e1614', age: .2, build: .94, hair: { style: 'bun', color: HAIR.black, bun: [0, .44, -.26], strands: 10 }, gear: [{ type: 'halfmask', color: '#e4dfd6', finish: 'porcelain' }] },
  'oath-11-sorcerer': { sex: 'm', skin: SKIN.pale, eye: '#5a6068', age: .92, build: .96, hair: { style: 'topknot', color: HAIR.white }, beard: { style: 'goatee', color: HAIR.white, length: .55 }, gear: [] },
  'oath-12-ninja': { sex: 'm', skin: SKIN.tan, eye: '#2a1a10', age: .25, build: 1.04, hair: { style: 'short', color: HAIR.black, length: .7 }, gear: [{ type: 'helm', color: '#8a1c22', trim: '#c8a060', finish: 'lacquer' }] },
  'oath-12-sorcerer': { sex: 'f', skin: SKIN.deep, eye: '#24160e', age: .32, build: 1.02, hair: { style: 'bun', color: HAIR.black, bun: [0, .44, -.18], coils: true }, gear: [{ type: 'earrings', color: '#c8a060' }] },
  'oath-13-ninja': { sex: 'm', skin: SKIN.light, eye: '#2a1c14', age: .2, build: .96, hair: { style: 'messy', color: HAIR.ink }, gear: [{ type: 'blademask', color: '#ece6da', trim: '#8a8a90', finish: 'porcelain' }] },
  'oath-13-sorcerer': { sex: 'f', skin: SKIN.light, eye: '#4a3a30', age: .5, build: 1.0, hair: { style: 'bun', color: HAIR.silver, bun: [0, .36, -.3], strands: 4 }, gear: [] },
  'oath-14-ninja': { sex: 'm', skin: SKIN.deep, eye: '#1e140c', age: .25, build: 1.04, hair: { style: 'short', color: HAIR.black, length: .35, coils: true }, gear: [{ type: 'wrap', color: '#2a2e3a', top: -.02 }] },
  'oath-14-sorcerer': { sex: 'f', skin: SKIN.light, eye: '#3a2a1c', age: .8, build: 1.0, hair: { style: 'bun', color: HAIR.silver, bun: [0, .46, -.2] }, gear: [{ type: 'glasses', color: '#a8844a' }] },
  'oath-15-ninja': { sex: 'f', skin: SKIN.olive, eye: '#2a1a10', age: .22, build: .97, hair: { style: 'bun', color: HAIR.black, bun: [0, .46, -.24], strands: 5 }, gear: [{ type: 'visor', color: '#4a4c52', lens: '#d8dde4' }] },
  'oath-15-sorcerer': { sex: 'm', skin: SKIN.light, eye: '#3a2a1c', age: .4, build: 1.06, hair: { style: 'swept', color: HAIR.brown }, beard: { style: 'full', color: HAIR.brown, length: .12 }, gear: [] },
};

export function profileFor(key) {
  return PROFILES[key] ?? { sex: 'm', skin: SKIN.tan, eye: '#2a1a10', age: .3, build: 1, hair: { style: 'short', color: HAIR.black, length: .5 }, gear: [] };
}
