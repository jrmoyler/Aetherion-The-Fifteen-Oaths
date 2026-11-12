// 09 SORCERER - LIGHT & HOLY - Oath of Daybreak. Read from assets/references/reference-074 (front, back, side,
// three-quarter, face, materials: folded enamel ivory, woven grey cloth, brushed gold; lotus waist dock and the
// reliquary side attachment).
import { B } from '../builders-b.js';

export default {
  id: 'oath-09-sorcerer', sheet: 'reference-074', title: 'Daybreak Sorcerer',
  palette: {
    hairGrey: '#7d7a75',
    hair: '#a3a09a',
    grey: '#6c6a68', greyDark: '#4f4d4c', cloth: '#6c6a68', ivory: '#d8cfba', ivoryShade: '#b5ac98', gold: '#a8843c', leather: '#55524f', leatherDark: '#3a3836',
    iron: '#a8843c', boot: '#55524f', sole: '#8a6e36',
  },
  build: { width: 1.06, depth: 1.06, belly: .008, arm: 1.0, leg: 1.0 },
  keep: ['weapon'],
  builders: B,
  // Swept silver hair, the small tail and the short beard are the groom's.
  groom: { hair: false, gear: false, beard: false },
  parts: [
    { use: 'b.neck' },
    { use: 'trousers', color: 'grey', gather: 1.84, bag: .03, pleats: 7, pockets: [], from: 1.0 },
    { use: 'boots', top: 1.8, color: 'boot', sole: 'sole', straps: 0 },
    // Ivory outer coat hanging open at the sides and back, grey robe over it, wide grey sleeves cuffed in gold.
    { use: 'b.torso', from: ['belt', -.03], to: 'base', color: 'grey', off: .012, slack: .002 },
    { use: 'b.coat', color: 'grey', top: 'belt', hem: .3, flare: 1.3, off: .022, open: 0, folds: 9, trim: 'gold', trimMat: 'gold', trimWidth: .005 },
    { use: 'b.sleeve', from: -.14, to: 1.62, off: .012, color: 'grey', shape: [[0, .014], [.8, .03], [1.62, .062]], droop: .5, lining: 'greyDark', trim: 'gold', trimWidth: .008, folds: .002 },
    { use: 'b.collar', color: 'grey', lining: 'ivory', height: .05, gap: 26, flare: .006, off: .012, trim: 'gold', trimMat: 'gold' },
    // Ivory scapular front and back with its pointed shoulders, piped in gold.
    { use: 'b.hang', at: 0, top: ['base', -.03], bottom: .34, width: [.075, .105], color: 'ivory', border: 'gold', borderWidth: .006, thick: .006, off: .008 },
    { use: 'b.hang', at: 180, top: ['base', -.03], bottom: .3, width: [.085, .11], color: 'ivory', border: 'gold', borderWidth: .006, thick: .006, off: .008 },
    { use: 'b.hang', at: 62, top: ['belt', .0], bottom: .21, width: [.05, .075], point: .03, skew: .9, color: 'ivory', border: 'gold', borderWidth: .006, thick: .005, off: .012 },
    { use: 'b.hang', at: -62, top: ['belt', .0], bottom: .21, width: [.05, .075], point: .03, skew: -.9, color: 'ivory', border: 'gold', borderWidth: .006, thick: .005, off: .012 },
    { use: 'b.hang', at: 128, top: ['belt', .0], bottom: .2, width: [.06, .09], point: .03, skew: -.9, color: 'ivory', border: 'gold', borderWidth: .006, thick: .005, off: .012 },
    { use: 'b.hang', at: -128, top: ['belt', .0], bottom: .2, width: [.06, .09], point: .03, skew: .9, color: 'ivory', border: 'gold', borderWidth: .006, thick: .005, off: .012 },
    { use: 'b.wing', span: .1, depth: .13, tipDepth: .045, rise: -.005, inset: .3, lift: .05, color: 'ivory', trim: 'gold', trimMat: 'gold', trimWidth: .007, thick: .007 },
    // Belt with gold fittings, the lotus dock, its hanging tab and the reliquary at the right hip.
    { use: 'belt', color: 'greyDark', height: .06, off: .05, thick: .007, buckle: null, keepers: [34, -34, 146, -146, 90, -90] },
    { use: 'b.sash', color: 'gold', mat: 'gold', bands: [{ y: ['belt', .03], h: .007, off: .062, thick: .003, wobble: 0 }, { y: ['belt', -.03], h: .007, off: .062, thick: .003, wobble: 0 }] },
    { use: 'b.hang', at: 0, top: ['belt', -.03], bottom: .79, width: [.022, .022], point: .02, color: 'greyDark', border: 'gold', borderWidth: .005, off: .02, thick: .005 },
    { use: 'b.lotus', off: .064, size: .09 },
    { use: 'b.lotus', at: 180, off: .064, size: .07 },
    { use: 'b.pouch', y: ['belt', -.1], th: -84, size: [.034, .055, .016], off: .05, color: 'ivory', dark: 'ivoryShade', trim: 'gold', mat: 'enamel', trimMat: 'gold' },
    { use: 'b.strip', color: 'greyDark', mat: 'leather', width: .012, thick: .004, n: 12, path: [{ th: -84, y: ['belt', -.0], off: .05 }, { th: -84, y: ['belt', -.06], off: .052 }] },
    { use: 'hands' },
    { use: 'hair', style: 'updo', color: 'hair', streak: 'hairGrey', grey: .5, fringe: .38, temple: .08, count: 70, knot: { at: [0, -.04, -.5], radius: .07 }, tail: { length: .24, width: .05, count: 8, rise: .02, back: .05 }, beard: { style: 'full', length: .07, moustache: .07, cheek: -.3 } },
  ],
};
