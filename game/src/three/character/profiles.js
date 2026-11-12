// Head, hair and face-gear descriptors for the 30 heroes, read from the
// NINJA / SORCERER panels of the per-Oath concept sheets
// (assets/references/reference-099..113; 099 is Oath 14 and 113 is Oath 01).
// Units are normalised to head height (chin to crown = 1).
//
// skin: albedo; age 0..1 (wrinkle depth, skin sag); build: face width factor;
// hair: style + colour; beard; gear: face equipment worn over the head.
const SKIN = {
  deep: '#5a3725', brown: '#7a4a32', tan: '#a8734f', olive: '#b98a62', light: '#d2a184', pale: '#e0bba2', porcelain: '#e8c9b6',
};
const HAIR = {
  black: '#211b19', ink: '#221f27', brown: '#3a2618', gray: '#8e8c8a', silver: '#b9b6b2', white: '#dedbd4', auburn: '#4a2418',
};

export const PROFILES = {
  'oath-01-ninja': { sex: 'm', skin: SKIN.olive, eye: '#3a2414', age: .2, build: 1.04, hair: { style: 'short', color: HAIR.black, length: .55 }, gear: [{ type: 'wrap', color: '#1e1c1b', top: -.02 }] },
  'oath-01-sorcerer': { sex: 'f', skin: SKIN.olive, eye: '#3a2a1c', age: .82, build: 1.12, hair: { style: 'bun', color: '#403b36', bun: [0, .38, -.28] }, gear: [] },
  'oath-02-ninja': { sex: 'f', skin: SKIN.pale, eye: '#5a7088', age: .2, build: .96, hair: { style: 'none' }, gear: [{ type: 'hood', color: '#3b4250', deep: true }, { type: 'faceplate', color: '#eceae6', finish: 'porcelain' }] },
  'oath-02-sorcerer': { sex: 'm', skin: SKIN.light, eye: '#6a7a88', age: .9, build: .98, hair: { style: 'long', color: HAIR.white, knot: true }, beard: { style: 'braided', color: HAIR.white }, gear: [] },
  'oath-03-ninja': { sex: 'm', skin: SKIN.tan, eye: '#2a1a10', age: .25, build: 1.02, hair: { style: 'topknot', color: HAIR.black }, gear: [{ type: 'plate', color: '#a6824a', finish: 'brass' }] },
  'oath-03-sorcerer': { sex: 'f', skin: SKIN.deep, eye: '#24160e', age: .35, build: 1.16, hair: { style: 'bun', color: HAIR.black, bun: [0, .42, -.18], coils: true }, gear: [] },
  'oath-04-ninja': { sex: 'f', skin: SKIN.light, eye: '#2a2018', age: .18, build: .95, hair: { style: 'bun', color: HAIR.black, bun: [0, .44, -.22], strands: 6 }, gear: [{ type: 'wrap', color: '#e6e2d8', top: -.04 }] },
  'oath-04-sorcerer': { sex: 'm', skin: SKIN.brown, eye: '#4a5a6a', age: .85, build: 1.02, hair: { style: 'swept', color: HAIR.white }, beard: { style: 'full', color: HAIR.white, length: .55 }, gear: [{ type: 'hood', color: '#e2ddd0', deep: false }] },
  'oath-05-ninja': { sex: 'm', skin: SKIN.tan, eye: '#2a1a10', age: .3, build: 1.08, hair: { style: 'short', color: HAIR.black, length: .5 }, gear: [{ type: 'wrap', color: '#2e2a26', top: -.03 }] },
  'oath-05-sorcerer': { sex: 'f', skin: SKIN.brown, eye: '#3a2414', age: .4, build: 1.12, hair: { style: 'bun', color: HAIR.black, bun: [0, .4, -.26] }, gear: [] },
  'oath-06-ninja': { sex: 'f', skin: SKIN.tan, eye: '#2a1c12', age: .2, build: .94, hair: { style: 'ponytail', color: HAIR.black }, gear: [{ type: 'beak', color: '#a37a44', finish: 'brass' }] },
  'oath-06-sorcerer': { sex: 'm', skin: SKIN.light, eye: '#3a2a1c', age: .7, build: 1.0, hair: { style: 'topknot', color: HAIR.gray }, beard: { style: 'goatee', color: HAIR.gray, length: .28 }, gear: [] },
  'oath-07-ninja': { sex: 'm', skin: SKIN.brown, eye: '#2a1a10', age: .3, build: 1.04, hair: { style: 'none' }, gear: [{ type: 'hood', color: '#4c5a2c', deep: true, leafy: true }, { type: 'faceplate', color: '#9a7448', finish: 'wood' }] },
  'oath-07-sorcerer': { sex: 'f', skin: SKIN.olive, eye: '#3a2a1c', age: .78, build: 1.0, hair: { style: 'bun', color: HAIR.silver, bun: [0, .42, -.2], twigs: true }, gear: [] },
  'oath-08-ninja': { sex: 'm', skin: SKIN.tan, eye: '#2a1a10', age: .28, build: 1.02, hair: { style: 'none' }, gear: [{ type: 'cap', color: '#2c2630' }, { type: 'respirator', color: '#a8844a', finish: 'brass' }] },
  'oath-08-sorcerer': { sex: 'f', skin: SKIN.light, eye: '#4a3a2a', age: .75, build: 1.0, hair: { style: 'bun', color: HAIR.silver, bun: [0, .44, -.22] }, gear: [{ type: 'goggles', color: '#a8844a', lens: '#c4d65a' }, { type: 'respirator', color: '#a8844a', finish: 'brass', small: true }] },
  'oath-09-ninja': { sex: 'f', skin: SKIN.brown, eye: '#24160e', age: .22, build: .96, hair: { style: 'braid', color: HAIR.black }, gear: [{ type: 'eyemask', color: '#ece4d2', trim: '#c8a050', finish: 'porcelain' }] },
  'oath-09-sorcerer': { sex: 'm', skin: SKIN.light, eye: '#5a6a78', age: .82, build: 1.02, hair: { style: 'swept', color: HAIR.white }, beard: { style: 'full', color: HAIR.white, length: .2 }, gear: [] },
  'oath-10-ninja': { sex: 'm', skin: SKIN.olive, eye: '#2a1a10', age: .25, build: 1.04, hair: { style: 'short', color: HAIR.black, length: .65 }, gear: [{ type: 'wrap', color: '#20253c', top: -.03 }] },
  'oath-10-sorcerer': { sex: 'f', skin: SKIN.olive, eye: '#2a1a10', age: .4, build: 1.2, hair: { style: 'bun', color: HAIR.black, bun: [0, .46, -.16], pins: '#c8a050' }, gear: [] },
  'oath-11-ninja': { sex: 'f', skin: SKIN.porcelain, eye: '#1e1614', age: .2, build: .94, hair: { style: 'bun', color: HAIR.black, bun: [0, .44, -.26], strands: 10 }, gear: [{ type: 'halfmask', color: '#e4dfd6', finish: 'porcelain' }] },
  'oath-11-sorcerer': { sex: 'm', skin: SKIN.pale, eye: '#5a6068', age: .8, build: .94, hair: { style: 'none', color: HAIR.gray }, beard: { style: 'goatee', color: HAIR.gray, length: .1 }, gear: [] },
  'oath-12-ninja': { sex: 'm', skin: SKIN.tan, eye: '#2a1a10', age: .25, build: 1.04, hair: { style: 'short', color: HAIR.black, length: .7 }, gear: [{ type: 'helm', color: '#8a1c22', trim: '#c8a060', finish: 'lacquer' }] },
  'oath-12-sorcerer': { sex: 'f', skin: SKIN.deep, eye: '#24160e', age: .32, build: 1.02, hair: { style: 'bun', color: HAIR.black, bun: [0, .44, -.18], coils: true }, gear: [{ type: 'earrings', color: '#c8a060' }] },
  'oath-13-ninja': { sex: 'm', skin: SKIN.light, eye: '#2a1c14', age: .2, build: .96, hair: { style: 'messy', color: HAIR.ink }, gear: [{ type: 'blademask', color: '#ece6da', trim: '#8a8a90', finish: 'porcelain' }] },
  'oath-13-sorcerer': { sex: 'f', skin: SKIN.light, eye: '#4a3a30', age: .25, build: .97, hair: { style: 'short', color: HAIR.ink, length: .7 }, gear: [] },
  'oath-14-ninja': { sex: 'm', skin: SKIN.deep, eye: '#1e140c', age: .25, build: 1.04, hair: { style: 'short', color: HAIR.black, length: .35, coils: true }, gear: [{ type: 'wrap', color: '#2a2e3a', top: -.02 }] },
  'oath-14-sorcerer': { sex: 'f', skin: SKIN.light, eye: '#3a2a1c', age: .25, build: .96, hair: { style: 'bun', color: HAIR.black, bun: [0, .46, -.2] }, gear: [] },
  'oath-15-ninja': { sex: 'f', skin: SKIN.brown, eye: '#2a1a10', age: .22, build: .97, hair: { style: 'bun', color: HAIR.black, bun: [0, .46, -.24], strands: 5 }, gear: [{ type: 'visor', color: '#4a4c52', lens: '#d8dde4' }] },
  'oath-15-sorcerer': { sex: 'm', skin: SKIN.brown, eye: '#2a1c12', age: .42, build: 1.06, hair: { style: 'none', color: HAIR.black }, beard: { style: 'goatee', color: HAIR.black, length: .08 }, gear: [] },
};

// Explicit sculpt controls, separate from complexion/costume. These are art-direction
// interpretations of the sheets, not measurements or a claim of reference identity.
// jaw, brow, nose projection, lip volume, chin, cheek, nose width, face depth.
const SCULPTS = [
 [.80,1.15,1.12,.82,1.12,.85,.9,1], [.82,.72,.88,1.02,.82,1.28,1.16,.94],
 [.63,.48,.91,.92,.75,1.12,.9,.95], [.70,1.18,1.3,.68,1.12,.72,.86,1.06],
 [.76,1.25,1.08,.8,1.2,1.12,.92,.98], [.76,.74,.93,1.48,.88,1.22,1.35,1.04],
 [.61,.52,.94,1.04,.72,1.2,.86,.96], [.78,1.05,1.2,.78,1.08,.88,1.08,1.07],
 [.88,1.3,1.12,.88,1.25,1.12,1.1,1.08], [.84,.86,1.04,1.18,1.02,1.25,1.12,1.02],
 [.60,.56,1.04,.94,.78,1.28,.84,.94], [.72,1.18,1.24,.78,1.06,.8,.92,1.02],
 [.82,1.18,1.03,.98,1.12,1.16,1.14,1.05], [.69,.85,1.13,.8,.9,.8,.94,.97],
 [.74,1.2,1.18,.9,1.12,.92,.98,1.02], [.72,.82,1.16,.78,.88,.9,.88,1],
 [.65,.66,.97,1.35,.82,1.22,1.22,.98], [.78,1.12,1.28,.74,1.15,.86,.9,1.08],
 [.82,1.22,1.09,.85,1.18,1.08,1.02,1.02], [.86,.8,1.02,1.2,.95,1.32,1.18,1.06],
 [.59,.48,.88,1.02,.68,1.22,.84,.94], [.65,1.16,1.34,.68,1.04,.7,.82,1.01],
 [.86,1.3,1.18,.94,1.22,1.06,1.08,1.06], [.72,.7,.92,1.42,.85,1.18,1.3,1],
 [.67,.9,1.04,.88,.84,1.14,.88,.95], [.72,.7,1.02,.94,.88,1.1,.94,.97],
 [.82,1.12,.98,1.25,1.12,1.18,1.28,1.02], [.68,.84,1.22,.74,.86,.78,.86,.96],
 [.64,.64,.96,1.08,.8,1.2,.92,.98], [.84,1.2,1.14,.9,1.18,1.02,1.04,1.08],
];
Object.values(PROFILES).forEach((profile, i) => {
  profile.face = Object.fromEntries(['jaw','brow','nose','lip','chin','cheek','noseWidth','depth'].map((name,j)=>[name,SCULPTS[i][j]]));
});

// The person on each sheet's FACE panel (assets/references/reference-062..091): complexion, age, the build of the
// face and what is painted on it. `face` adds to the sculpt above (fat, gaunt, bridge, tip, mouthW); `look` drives
// the painted features in head.js (brows, lashes, lips, freckles, age spots, frown lines, stubble).
const FACES = {
  'oath-01-ninja': { skin: '#c9996f', eye: '#3b2616', age: .2, face: { jaw: .8, chin: 1.08, cheek: 1, nose: 1.02, noseWidth: .9, lip: .95 }, eyeOpen: .017, eyeTilt: .15, look: { browThick: .021, browSlope: .014, crease: .45 } },
  'oath-01-sorcerer': { skin: '#b68b68', eye: '#3a2a1c', age: .8, face: { fat: .75, jaw: .86, cheek: 1.25, nose: .95, noseWidth: 1.2, tip: .7, lip: .95, mouthW: 1.05 }, eyeOpen: .015, eyeTilt: .06, look: { browColor: '#6a625c', browThick: .015, spots: .25, lipAlpha: .45, frown: .3 } },
  'oath-02-ninja': { skin: '#d6ab8b', eye: '#3a2a20', age: .18, face: { fat: .25, jaw: .66, cheek: 1.2, nose: .85, noseWidth: .95, lip: 1.15, chin: .7 }, eyeOpen: .021, eyeTilt: .13, look: { freckles: .5, lipColor: '#b0625a', crease: .5 } },
  'oath-02-sorcerer': { skin: '#d0b9aa', eye: '#8ea3b0', age: .95, face: { gaunt: .95, jaw: .68, cheek: 1.15, nose: 1.3, bridge: 1, noseWidth: .85, lip: .6, chin: 1.1, brow: 1.3 }, eyeOpen: .014, eyeTilt: .04, look: { browColor: '#f2f0ea', browThick: .025, browSlope: .022, browLen: .22, spots: .3, lipAlpha: .2, frown: .7, shadow: .8 } },
  'oath-03-ninja': { skin: '#ab7f5e', eye: '#2e1c10', age: .25, face: { gaunt: .3, jaw: .74, cheek: 1.05, nose: 1.15, noseWidth: .92, lip: .95, chin: 1.1 }, eyeOpen: .016, eyeTilt: .13, look: { browThick: .021, browSlope: .018, stubble: .28, crease: .6 } },
  'oath-03-sorcerer': { skin: '#7c4f38', eye: '#24160e', age: .35, face: { fat: .9, jaw: .9, cheek: 1.25, nose: .9, noseWidth: 1.4, tip: .8, lip: 1.5, mouthW: 1.08 }, eyeOpen: .019, look: { lipColor: '#7a3f3a', lipAlpha: .6, browThick: .015, shadow: .4, blush: .2 } },
  'oath-04-ninja': { skin: '#b27d58', eye: '#2a2018', age: .18, face: { jaw: .66, cheek: 1.2, lip: 1.25, noseWidth: 1.05 }, look: { freckles: .5 } },
  'oath-04-sorcerer': { skin: '#8b5b3c', eye: '#5a4a3c', age: .82, face: { jaw: .86, brow: 1.25, nose: 1.1, noseWidth: 1.3, tip: .6, lip: .9, cheek: 1.05 }, eyeOpen: .016, look: { browColor: '#e4e1da', browThick: .024, browSlope: .014, frown: .5, spots: .2, shadow: .45 } },
  'oath-05-ninja': { skin: '#a56f4a', eye: '#5d6a45', age: .28, face: { jaw: .92, chin: 1.25, brow: 1.3, nose: 1.1, noseWidth: 1.08, cheek: 1.1 }, eyeOpen: .016, look: { browThick: .024, browSlope: .02, frown: .4, stubble: .3 } },
  'oath-05-sorcerer': { skin: '#a3724f', eye: '#3a2414', age: .3, face: { jaw: .74, cheek: 1.2, nose: .95, noseWidth: 1.15, lip: 1.35 }, eyeOpen: .02, look: { freckles: .55, lipColor: '#8a4a40', browThick: .016, shadow: .45 } },
  'oath-06-ninja': { skin: '#96643f', eye: '#2a1c12', age: .22, face: { gaunt: .2, jaw: .68, cheek: 1.25, lip: 1.3 }, look: { freckles: .5, shadow: .45 } },
  'oath-06-sorcerer': { skin: '#c39c78', eye: '#3a2a1c', age: .75, face: { gaunt: .85, jaw: .72, cheek: 1.25, nose: 1.15, noseWidth: .9, lip: .7, chin: 1.05 }, eyeOpen: .014, eyeTilt: .15, look: { crease: .4, browColor: '#77726d', browThick: .016, browSlope: .016, spots: .2, lipAlpha: .25 } },
  'oath-07-ninja': { skin: '#5c3824', eye: '#2a1a10', age: .25, face: { jaw: .82, noseWidth: 1.3, lip: 1.4, cheek: 1.15 }, look: { shadow: .4 } },
  'oath-07-sorcerer': { skin: '#ae8462', eye: '#3a2a1c', age: .93, face: { fat: .3, jaw: .78, cheek: 1.2, nose: 1, noseWidth: 1.25, tip: .6, lip: .8 }, eyeOpen: .013, eyeTilt: .05, look: { crease: .5, browColor: '#9a958f', browThick: .013, spots: .45, lipAlpha: .3 } },
  'oath-08-ninja': { skin: '#c2916c', eye: '#33200f', age: .28, face: { jaw: .86, brow: 1.3, nose: 1.15, cheek: 1.05 }, eyeOpen: .016, look: { browThick: .022, browSlope: .022, frown: .5, stubble: .3 } },
  'oath-08-sorcerer': { skin: '#d2ae96', eye: '#6b6a58', age: .62, face: { gaunt: .45, jaw: .7, cheek: 1.2, nose: 1.1, noseWidth: .88, lip: .85, chin: .9 }, eyeOpen: .017, look: { browColor: '#55504d', browThick: .014, browArch: .028, lipColor: '#a8675f', frown: .3 } },
  'oath-09-ninja': { skin: '#613b29', eye: '#24160e', age: .22, face: { jaw: .68, cheek: 1.25, noseWidth: 1.25, lip: 1.45 }, look: { lipColor: '#6e3833', lipAlpha: .65, shadow: .4, blush: .2 } },
  'oath-09-sorcerer': { skin: '#b88a66', eye: '#6a5a48', age: .78, face: { gaunt: .3, jaw: .8, cheek: 1.1, nose: 1.25, bridge: .6, noseWidth: 1, lip: .8 }, eyeOpen: .016, look: { browColor: '#cfcbc4', browThick: .021, browSlope: .012, spots: .15 } },
  'oath-10-sorcerer': { skin: '#bb8c67', eye: '#2a1a10', age: .55, face: { fat: 1, jaw: .92, cheek: 1.25, nose: .9, noseWidth: 1.25, tip: .5, lip: 1 }, eyeOpen: .014, eyeTilt: .12, look: { crease: .4, browThick: .014, lipAlpha: .5, frown: .25 } },
  'oath-11-ninja': { skin: '#e0c2ac', eye: '#3a2e2a', age: .2, face: { jaw: .62, cheek: 1.2 }, eyeOpen: .017, eyeTilt: .2, look: { crease: .35, liner: 1, browThick: .011, browSlope: .02 } },
  'oath-11-sorcerer': { skin: '#a39286', eye: '#8a6a3a', age: .85, face: { gaunt: 1, jaw: .7, cheek: 1.3, brow: 1.35, nose: 1.3, bridge: .8, noseWidth: .85, lip: .6, chin: 1.05 }, eyeOpen: .014, look: { shadow: .9, browColor: '#77736e', browThick: .018, browSlope: .026, frown: .8, stubble: .7, stubbleColor: '#b5b1aa', lipAlpha: .15 } },
  'oath-12-sorcerer': { skin: '#7a4c33', eye: '#24160e', age: .32, face: { gaunt: .2, jaw: .68, cheek: 1.3, nose: 1, noseWidth: 1.2, lip: 1.4 }, eyeOpen: .019, look: { lipColor: '#7b3c34', lipAlpha: .65, browThick: .014, browArch: .03, shadow: .4, blush: .2 } },
  'oath-13-sorcerer': { skin: '#e4c9b6', eye: '#6a6460', age: .25, face: { gaunt: .15, jaw: .64, cheek: 1.25, nose: .95, noseWidth: .85, lip: 1.1, chin: .8 }, eyeOpen: .017, eyeTilt: .2, look: { liner: 1, shadow: .75, lipColor: '#9c3a3c', lipAlpha: .85, gloss: .7, browThick: .014, browSlope: .018, browArch: .02, crease: .5 } },
  'oath-14-ninja': { skin: '#68412c', eye: '#1e140c', age: .28, face: { jaw: .9, chin: 1.2, noseWidth: 1.35, lip: 1.35, cheek: 1.1 }, look: { stubble: .6, goatee: 1, lipAlpha: .35, shadow: .4 } },
  'oath-14-sorcerer': { skin: '#dab394', eye: '#3a2a1c', age: .22, face: { jaw: .64, cheek: 1.2, nose: .85, noseWidth: .92, lip: 1.15 }, eyeOpen: .02, eyeTilt: .16, look: { crease: .5, freckles: .6, lipColor: '#b9665c', browThick: .014 } },
  'oath-15-sorcerer': { skin: '#84563a', eye: '#2a1c12', age: .45, face: { jaw: .92, chin: 1.2, brow: 1.35, nose: 1.1, noseWidth: 1.3, lip: 1.1, cheek: 1.05 }, eyeOpen: .017, look: { browThick: .022, browSlope: .024, frown: .8, stubble: 1, shadow: .45 } },
};
// Painted skin is less saturated than a lit, tone-mapped albedo of the same hue: pull the sampled tones in.
const soften = (hex) => { const n = parseInt(hex.slice(1), 16), rgb = [n >> 16 & 255, n >> 8 & 255, n & 255], grey = rgb[0] * .3 + rgb[1] * .59 + rgb[2] * .11; return '#' + rgb.map((v) => Math.round(grey + (v - grey) * .68).toString(16).padStart(2, '0')).join(''); };
for (const [id, over] of Object.entries(FACES)) Object.assign(PROFILES[id], { ...over, skin: soften(over.skin), face: { ...PROFILES[id].face, ...over.face } });

export function profileFor(key, identity = '') {
  const base = PROFILES[key] ?? PROFILES['oath-01-ninja'];
  if (!identity) return base;
  // NPC identity is stable across reloads and independent of spawn order. Eight
  // bounded sculpt variants per costume keep the shared geometry cache finite.
  let hash = 2166136261;
  for (const c of identity) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const variant = (hash >>> 0) % 8, t = (variant - 3.5) / 3.5;
  return {...base, build:base.build*(1+t*.065), age:Math.max(.18,Math.min(.95,base.age+t*.18)),
    face:{...base.face,jaw:base.face.jaw+t*.055,nose:base.face.nose-t*.09,cheek:base.face.cheek+t*.12}, variant};
}

// Sheet heroes (code-built costumes) get a head tuned to be read at full-body distance beside a painted sheet:
// stronger relief and painted shading (see head.js), wider eye aperture, and per-sex eye tilt.
export function sheetProfile(profile) {
  return profile.sheet ? profile : { ...profile, sheet: true, eyeW: profile.eyeW ?? .068, eyeOpen: (profile.eyeOpen ?? (profile.sex === 'f' ? .021 : .018)) * 1.35, eyeTilt: profile.eyeTilt ?? (profile.sex === 'f' ? .14 : .08) };
}
// Head height (chin to crown) for a sheet hero whose head joint is at `headY` in bind pose: the figure stands
// about eight heads tall, measured from its joints so a tall hat or a pack on the back cannot inflate the head.
export const sheetHeadSize = (headY, scale = 1) => Math.min(.25, Math.max(.165, (headY + .24) * .128 * .94 * scale));
