// 08 SORCERER - POISON - Bitterglass Guild. Read from assets/references/reference-076 (front, back, side,
// three-quarter, face, materials: oilskin, pitted brass, sealed glass; tank mount strap and bracket, vial rig).
import { B } from '../builders-b.js';

export default {
  id: 'oath-08-sorcerer', sheet: 'reference-076', title: 'Bitterglass Sorcerer',
  palette: {
    cloth: '#231f24', coat: '#272228', purple: '#3c2a40', gold: '#9a7a3a', leather: '#4a3426', leatherDark: '#2a1f1a', brass: '#8f6e36', brassDark: '#5e4826',
    glass: '#4f7a06', glassPale: '#aeb39a', iron: '#4a4541', glove: '#1a181b', boot: '#201c1d', sole: '#131011', hair: '#55524f', hairGrey: '#96938e', tie: '#3c2a40', cap: '#2e2431',
  },
  build: { width: 1.02, depth: 1.0, bust: .024, hips: 1.14, waist: .87, arm: .9, leg: .96, neck: .92 },
  keep: ['weapon'],
  builders: B,
  groom: { hair: false, gear: false, beard: false },
  parts: [
    { use: 'b.neck' },
    { use: 'b.legs', color: 'cloth', to: 1.4, off: .007 },
    { use: 'boots', top: 1.22, color: 'boot', sole: 'sole', toeCap: 'brass', heelPlate: 'brass', plateMat: 'iron', straps: 2, strapColor: 'leatherDark', buckle: 'brass', soleHeight: .04 },
    // Long fitted oilskin coat, open down the front from the waist, piped in gold and lined in purple.
    { use: 'b.torso', from: ['belt', -.03], to: 'base', color: 'coat', mat: 'oilskin', off: .01 },
    { use: 'b.coat', color: 'coat', mat: 'oilskin', top: 'belt', hem: .075, flare: 1.26, off: .018, open: 24, folds: 8, lining: 'purple', edge: 'gold', edgeWidth: .006, trim: 'gold', trimWidth: .006, trimMat: 'gold' },
    { use: 'b.sleeve', from: -.14, to: 1.3, off: .009, color: 'coat', mat: 'oilskin', folds: .002, shape: [[-.2, .008], [.3, 0], [1.3, 0]] },
    { use: 'b.strip', color: 'gold', mat: 'gold', width: .005, thick: .003, n: 40, path: [{ th: 24, y: ['belt', .03], off: .012 }, { th: 26, y: ['ribs', .0], off: .012 }, { th: 34, y: ['chest', .03], off: .012 }, { th: 56, y: ['shoulder', .0], off: .012 }] },
    { use: 'b.strip', color: 'gold', mat: 'gold', width: .005, thick: .003, n: 40, path: [{ th: -24, y: ['belt', .03], off: .012 }, { th: -26, y: ['ribs', .0], off: .012 }, { th: -34, y: ['chest', .03], off: .012 }, { th: -56, y: ['shoulder', .0], off: .012 }] },
    { use: 'b.strip', color: 'gold', mat: 'gold', width: .004, thick: .003, n: 30, path: [{ th: 0, y: ['belt', .03], off: .012 }, { th: 0, y: ['chest', .04], off: .012 }, { th: 0, y: ['base', -.01], off: .012 }] },
    { use: 'b.strip', color: 'gold', mat: 'gold', width: .004, thick: .003, n: 30, path: [{ th: 180, y: ['belt', .03], off: .012 }, { th: 180, y: ['chest', .04], off: .012 }, { th: 180, y: ['base', -.01], off: .012 }] },
    { use: 'b.collar', color: 'coat', mat: 'oilskin', lining: 'purple', height: .09, flare: .022, gap: 54, off: .01, trim: 'gold', trimMat: 'gold', wing: .016 },
    // Tank harness: shoulder straps, a crossed back with a brass boss, two belts.
    { use: 'b.strip', color: 'leather', width: .028, thick: .005, closed: true, n: 80, border: 'brass', path: [
      { th: 30, y: ['waist', .02], off: .016 }, { th: 36, y: ['chest', .02], off: .018 }, { th: 62, y: ['shoulder', .012], off: .016 }, { th: 118, y: ['shoulder', .01], off: .016 }, { th: 150, y: ['chest', .0], off: .018 }, { th: 186, y: ['waist', .02], off: .018 }, { th: 100, y: ['belt', .05], off: .02 } ] },
    { use: 'b.strip', color: 'leather', width: .028, thick: .005, closed: true, n: 80, border: 'brass', path: [
      { th: -30, y: ['waist', .02], off: .016 }, { th: -36, y: ['chest', .02], off: .018 }, { th: -62, y: ['shoulder', .012], off: .016 }, { th: -118, y: ['shoulder', .01], off: .016 }, { th: -150, y: ['chest', .0], off: .018 }, { th: -186, y: ['waist', .02], off: .02 }, { th: -100, y: ['belt', .05], off: .02 } ] },
    { use: 'b.studs', on: 'trunk', at: [[['ribs', .05], 180]], r: .03, height: .012, off: .022, color: 'brass', mat: 'brass', rim: 'brassDark' },
    { use: 'belt', color: 'leather', height: .036, off: .022, buckle: 'brass', keepers: [30, -30] },
    { use: 'b.sash', color: 'leather', mat: 'leather', bands: [{ y: ['belt', -.045], h: .022, tilt: .016, phase: 90, off: .024, thick: .005, wobble: 0 }] },
    { use: 'b.vials', at: [66, 78, 90], y: ['belt', -.06], length: .2, r: .014, off: .034, drop: .92, bone: [['hips', .7], ['thigh.L', .3]], holder: null, rack: { width: .05 } },
    { use: 'b.tanks', r: .088, spread: 1.14, lift: .045 },
    { use: 'b.guard', limb: 'arm', from: 1.12, to: 1.92, arc: 180, off: .008, thick: .008, flare: .02, color: 'brass', mat: 'brass', trim: 'brassDark', trimMat: 'brass', trimWidth: .008 },
    { use: 'gloveCuff', color: 'glove', from: 1.88, to: 2.05, off: .007 },
    { use: 'hair', style: 'updo', streak: 'hairGrey', grey: .4, fringe: .2, combed: false, edge: 46, knot: { at: [0, -.08, -.5], radius: .16, kind: 'coil' }, tendrils: [[62, .2, .3, .02, .01], [-62, .2, .3, .02, .01], [36, .26, .14, .02, .03], [-82, .1, .2, .02]] },
    { use: 'b.skullCap', color: 'cap', front: .27, side: .1, nape: .02, off: .042, seams: 2, seam: 'gold', band: 'cap' },
    { use: 'hands', glove: 'glove' },
  ],
};
