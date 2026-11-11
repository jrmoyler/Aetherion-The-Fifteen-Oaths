// 04 SORCERER - WATER - Tidal Covenant. Read from assets/references/reference-086 (woven diving cloth, nacre
// shell plate, worn brass fittings, sealed reservoirs; reservoir belt closure, collar plate join).
import '../builders-a.js';

const tank = (x, r) => [
  { s: 'ball', r, at: [x, 0, 0], color: 'water', mat: 'glass', seg: 16, rows: 9 }, { s: 'ring', R: r * 1.02, r: .0065, at: [x, 0, 0], color: 'brass', mat: 'brass', seg: 22 },
  { s: 'ring', R: r * 1.02, r: .005, at: [x, 0, 0], rot: [90, 0, 0], color: 'brass', mat: 'brass', seg: 22 },
  { s: 'cyl', r: .016, h: .02, rot: [-90, 0, 0], at: [x, r * .96, 0], color: 'brass', mat: 'brass', sides: 10 }, { s: 'box', size: [.009, .022, .004], at: [x, r + .034, -.012], rot: [20, 0, 0], color: 'leather', mat: 'leather' },
  { s: 'ball', size: [r * .5, r * .16, r * .5], at: [x, r * .52, 0], color: 'foam', mat: 'water', seg: 10, rows: 4 },
];
const tasset = [
  { s: 'ball', size: [.092, .175, .013], color: 'nacre', mat: 'nacre', seg: 18, rows: 7 }, { s: 'ring', rx: .094, ry: .177, r: .0065, color: 'brass', mat: 'brass', seg: 28 },
  { s: 'dome', r: .008, at: [0, .15, .012], color: 'brass', mat: 'brass' },
];

export default {
  id: 'oath-04-sorcerer', sheet: 'reference-086', title: 'Tidal Sorcerer',
  palette: {
    robe: '#1e2b4d', cloth: '#1e2b4d', robeDark: '#151f3a', brass: '#a98346', iron: '#a98346', nacre: '#e9e0d1', green: '#3f615d', water: '#3f9cc0', foam: '#12384a', leather: '#3a2b20', leatherDark: '#231a14',
    boot: '#20232a', sole: '#101114', glove: '#2a211b', skin: '#d2a184', hair: '#dedbd4', hairGrey: '#bdb9b1',
  },
  build: { width: 1.28, depth: 1.3, belly: .04, hips: 1.1, waist: 1.16, arm: 1.24, leg: 1.2, neck: 1.1, shoulder: 1.1 },
  keep: ['hands'],
  groom: { hair: false, gear: false },
  parts: [
    { use: 'neck' },
    { use: 'wrap', limb: 'arm', from: 1.25, to: 1.94, color: 'green', off: .006, pitch: .02 },
    { use: 'a/plates', on: 'arm', list: [{ at: [95, 1.6], size: [.085, .12] }], color: 'nacre', mat: 'nacre', border: 'brass', borderMat: 'brass', borderWidth: .007, thick: .012, off: .011, r: .02, name: 'cuffs' },
    { use: 'band', limb: 'arm', at: 1.86, width: .02, off: .009, thick: .005, color: 'brass', mat: 'iron' },
    { use: 'shirt', color: 'robe', sleeve: 1.42, flare: .05, off: .015, slack: .006, cap: .022, trim: 'brass', trimWidth: .016 },
    { use: 'trousers', color: 'green', gather: 1.56, bag: .04, pleats: 9, pockets: [], pipingPaths: [], from: 1.0 },
    { use: 'band', limb: 'leg', at: 1.58, width: .03, color: 'brass', mat: 'iron', off: .008 },
    { use: 'skirt', color: 'robe', hem: .31, flare: 1.3, off: .024, folds: 8, trim: 'brass', trimWidth: .014 },
    // Tabard panels front and back, edged in brass, and the big shell tassets at the hips.
    { use: 'panel', color: 'robe', mat: 'cloth', at: 0, from: 'belt', to: .35, width: [.105, .14], off: .006, thick: .005, border: 'brass', borderWidth: .009, round: .11 },
    { use: 'panel', color: 'robe', mat: 'cloth', at: 180, from: 'belt', to: .35, width: [.1, .135], off: .006, thick: .005, border: 'brass', borderWidth: .009, round: .11 },
    { use: 'a/lines', on: 'coat', paths: [[[0, 'belt-.03'], [0, .37]], [[180, 'belt-.03'], [180, .37]]], color: 'brass', mat: 'brass', width: .004, thick: .002, off: .012, name: 'piping' },
    { use: 'a/lines', on: 'trunk', paths: [[[0, 'belt'], [0, 'chest+.02']], [[180, 'belt'], [180, 'shoulder-.02']]], color: 'brass', mat: 'brass', width: .004, thick: .002, off: .017, name: 'piping' },
    { use: 'a/kit', name: 'tassets', on: 'coat', side: 'both', y: .64, th: 80, off: .03, items: tasset },
    { use: 'belt', color: 'leather', buckle: 'brass', height: .05, off: .03, buckleSize: [.022, .026], keepers: [62, -62, 150, -150] },
    { use: 'a/kit', name: 'reservoirs', on: 'trunk', y: 'belt-.095', th: 0, off: .085, bone: 'hips', items: [...tank(0, .072), ...tank(-.138, .062), ...tank(.138, .062)] },
    // Shell collar: nacre discs linked in brass over a cloth yoke, the hood lying down behind.
    { use: 'a/hoodDown', color: 'robe', lining: 'robeDark', width: .17, drop: .26, depth: .09 },
    { use: 'cowl', color: 'robe', rolls: 2, radius: .036, rise: .034 },
    { use: 'a/yoke', color: 'robe', mat: 'cloth', inner: .1, outer: .215, off: .034, thick: .008, discs: { count: 10, r: .052, at: .66, lift: .01, color: 'nacre', rim: 'brass', phase: 0 } },
    { use: 'boots', color: 'boot', sole: 'sole', top: 1.6, toeCap: 'brass', heelPlate: 'brass', cuff: 'brass', plateMat: 'iron', straps: 3, strapColor: 'leather', buckle: 'brass', bulk: 1.2 },
    { use: 'hair', style: 'spiky', color: 'hair', streak: 'hairGrey', locks: 170, length: .11, lift: .03, fringe: .34 },
  ],
};
