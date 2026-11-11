// 08 NINJA - POISON - Bitterglass Guild. Read from assets/references/reference-077 (front, back, side,
// three-quarter, face, materials: oilskin, pitted brass, dark leather, sealed glass; ampoule locking clip and
// backpack top mount).
import { B } from '../builders-b.js';

export default {
  id: 'oath-08-ninja', sheet: 'reference-077', title: 'Bitterglass Ninja',
  palette: {
    under: '#1d1b1c', cloth: '#242123', oilskin: '#262225', purple: '#3a2a3c', leather: '#3c2c24', leatherDark: '#261d19', brass: '#8a6a34', brassDark: '#5e4826',
    glass: '#4f7a06', iron: '#4a4541', glove: '#19171a', boot: '#221c1a', bootCap: '#2c2420', sole: '#141110', hair: '#1c1714',
  },
  build: { width: 1.08, depth: 1.06, arm: 1.12, leg: 1.06, shoulder: 1.08 },
  keep: ['weapon'],
  builders: B,
  groom: { hair: false, gear: false },
  parts: [
    { use: 'b.neck', color: 'under', mat: 'cloth', off: .004 },
    { use: 'b.legs', color: 'under', to: 1.7, off: .006 },
    { use: 'b.legs', color: 'oilskin', mat: 'oilskin', from: -.155, to: .84, off: .014, shape: [[-.2, .012], [.2, .026], [.84, .046]], hem: true, folds: .004, seam: 'leatherDark' },
    { use: 'b.guard', limb: 'leg', from: .9, to: 1.15, phi: 0, arc: 76, off: .009, thick: .009, bulge: .016, color: 'leather', mat: 'leather', trim: 'brass', trimMat: 'brass', trimWidth: .007 },
    { use: 'band', limb: 'leg', at: 1.17, width: .022, off: .006, thick: .005, color: 'leatherDark' },
    { use: 'boots', top: 1.6, color: 'boot', sole: 'sole', toeCap: 'bootCap', plateMat: 'leather', straps: 3, strapColor: 'leather', buckle: 'brass', bulk: 1.14, cuff: 'brass', soleHeight: .042 },
    // Oilskin jacket with purple breast and shoulder panels.
    { use: 'b.torso', from: ['belt', -.05], to: 'base', color: 'oilskin', mat: 'oilskin', off: .011, slack: .002 },
    { use: 'b.torso', from: ['waist', .0], to: ['armpit', .03], arc: [-64, 64], color: 'purple', mat: 'oilskin', off: .014 },
    { use: 'b.torso', from: ['ribs', .0], to: ['armpit', .03], arc: [118, 242], color: 'purple', mat: 'oilskin', off: .014 },
    { use: 'b.sleeve', from: -.14, to: 1.2, off: .01, color: 'oilskin', mat: 'oilskin', folds: .0025 },
    { use: 'b.sleeve', from: -.14, to: .36, off: .014, color: 'purple', mat: 'oilskin', hem: false, trim: 'leatherDark' },
    // Harness: braces over both shoulders, crossed chest straps, a waist strap.
    { use: 'b.strip', color: 'leather', width: .03, thick: .006, closed: true, n: 80, border: 'brass', studs: 0, path: [
      { th: 34, y: ['waist', .0], off: .02 }, { th: 36, y: ['chest', .02], off: .024 }, { th: 62, y: ['shoulder', .012], off: .02 }, { th: 118, y: ['shoulder', .01], off: .02 }, { th: 146, y: ['chest', .0], off: .022 }, { th: 148, y: ['waist', .0], off: .02 }, { th: 90, y: ['belt', .05], off: .02 } ] },
    { use: 'b.strip', color: 'leather', width: .03, thick: .006, closed: true, n: 80, border: 'brass', path: [
      { th: -34, y: ['waist', .0], off: .02 }, { th: -36, y: ['chest', .02], off: .024 }, { th: -62, y: ['shoulder', .012], off: .02 }, { th: -118, y: ['shoulder', .01], off: .02 }, { th: -146, y: ['chest', .0], off: .022 }, { th: -148, y: ['waist', .0], off: .02 }, { th: -90, y: ['belt', .05], off: .02 } ] },
    { use: 'b.strip', color: 'leatherDark', width: .022, thick: .005, n: 40, path: [{ th: -40, y: ['chest', .04], off: .03 }, { th: 0, y: ['ribs', .03], off: .03 }, { th: 40, y: ['waist', .05], off: .028 }] },
    { use: 'b.strip', color: 'leatherDark', width: .022, thick: .005, n: 40, path: [{ th: 40, y: ['chest', .04], off: .032 }, { th: 0, y: ['ribs', .03], off: .034 }, { th: -40, y: ['waist', .05], off: .03 }] },
    { use: 'b.studs', on: 'trunk', at: [[['chest', .05], 36], [['chest', .05], -36], [['ribs', .03], 0]], r: .011, off: .034, color: 'brass', mat: 'brass' },
    { use: 'b.sash', color: 'purple', mat: 'oilskin', bands: [{ y: ['waist', .0], h: .05, off: .017, wobble: 0 }] },
    { use: 'b.guard', limb: 'arm', from: -.34, to: .26, phi: 90, arc: 68, off: .014, thick: .009, bulge: .01, flareEnd: .008, color: 'leather', mat: 'leather', trim: 'brass', trimMat: 'brass', rivets: 2, rivet: 'brass', skin: [['shoulder.L', .5], ['upperarm.L', .5]] },
    { use: 'b.guard', limb: 'arm', from: 1.1, to: 1.9, arc: 180, off: .01, thick: .009, flare: .016, color: 'leather', mat: 'leather', trim: 'brass', trimMat: 'brass', trimWidth: .009 },
    { use: 'band', limb: 'arm', at: 1.35, width: .02, off: .02, thick: .004, color: 'leatherDark', buckle: { phi: 70, color: 'brass' } },
    { use: 'band', limb: 'arm', at: 1.68, width: .02, off: .019, thick: .004, color: 'leatherDark', buckle: { phi: 70, color: 'brass' } },
    { use: 'gloveCuff', color: 'glove', from: 1.88, to: 2.05, off: .008 },
    // Ampoule belt, thigh pouches and the pack.
    { use: 'belt', color: 'leatherDark', height: .05, off: .018, buckle: 'brass', keepers: [] },
    { use: 'b.vials', at: [22, 38, 54, -22, -38, -54, 152, 168, -152, -168], y: ['belt', .0], length: .066, r: .015, off: .028 },
    { use: 'b.pouch', limb: 'leg', at: .4, phi: 80, size: [.05, .07, .02], off: .058 },
    { use: 'b.backpack' },
    { use: 'b.hairCap', color: 'hair', front: .3, side: .12, nape: -.3, lift: .008 },
    { use: 'b.skullCap', color: 'leather', front: .2, side: .06, nape: -.08, off: .03, seams: 4, band: 'leatherDark' },
    { use: 'b.respirator', canister: .14 },
    { use: 'hands', glove: 'glove' },
  ],
};
