// 05 SORCERER - EARTH & CRYSTAL - Fault Choir. Read from assets/references/reference-083 (layered shale,
// sandstone, leather strap, raw amethyst; frame shoulder clamp, frame base clamp).
import '../builders-a.js';

const brace = (s) => ({ use: 'strap', color: 'leather', closed: false, width: .034, thick: .006, anchor: { at: .15, size: .02, color: 'iron' }, n: 34, path: [
  { th: s * 24, y: 'belt', dy: .03, off: .024 }, { th: s * 25, y: 'ribs', off: .026 }, { th: s * 30, y: 'armpit', dy: .02, off: .024 }, { th: s * 56, y: 'shoulder', dy: -.02, off: .02 },
  { th: s * 124, y: 'shoulder', dy: -.02, off: .02 }, { th: s * 150, y: 'armpit', dy: .02, off: .024 }, { th: s * 160, y: 'ribs', off: .026 }, { th: s * 164, y: 'belt', dy: .03, off: .024 } ] });
const post = (x, y, sx, sy) => ({ s: 'box', size: [sx, sy, .017], at: [x, y, .03], color: 'frame', mat: 'stone', r: .005 });
const block = (x, y) => [{ s: 'box', size: [.03, .03, .024], at: [x, y, .03], color: 'sand', mat: 'stone', r: .006 }, { s: 'dome', r: .006, at: [x, y, .054], color: 'iron', mat: 'iron' }];
const vein = (x, y, z, r, h, rot) => ({ s: 'gem', r, h, at: [x, y, z], rot, color: 'amethyst', mat: 'crystal' });

export default {
  id: 'oath-05-sorcerer', sheet: 'reference-083', title: 'Fault Sorcerer',
  palette: {
    cloth: '#3c332c', tunic: '#3c332c', tunicDark: '#2a2420', sand: '#b3956c', shale: '#4a4541', frame: '#5a524a', leather: '#6b4a33', leatherDark: '#3e2b1f', iron: '#5b534b', ceramic: '#4a4541',
    amethyst: '#3c1c63', boot: '#3a322c', sole: '#191513', glove: '#2a211c', skin: '#a8734f', hair: '#191517', tie: '#191517',
  },
  build: { width: 1.2, depth: 1.2, bust: .03, hips: 1.16, waist: 1.1, arm: 1.34, leg: 1.28, shoulder: 1.12, neck: 1.08 },
  keep: ['hands'],
  groom: { hair: false, gear: false },
  parts: [
    { use: 'neck' },
    { use: 'skinLimb', limb: 'arm', from: -.12, to: 2 },
    { use: 'skinLimb', limb: 'leg', from: .6, to: 1.6 },
    { use: 'trousers', color: 'tunicDark', gather: .84, bag: .05, pleats: 9, pockets: [], pipingPaths: [], from: .2 },
    { use: 'a/bodysuit', color: 'tunic', trunk: ['belt-.03', 'base'], off: .011, ease: .004, zones: [{ on: 'trunk', both: true, a: [28, 62], b: ['waist-.03', 'armpit+.03'], color: 'sand' }] },
    { use: 'a/lines', on: 'trunk', both: true, paths: [[[52, 'shoulder-.02'], [68, 'armpit+.01'], [90, 'armpit-.04'], [114, 'armpit+.01'], [130, 'shoulder-.02']]], color: 'sand', width: .012, thick: .003, off: .012, name: 'binding' },
    { use: 'a/collar', color: 'tunic', lining: 'tunicDark', height: .045, flare: .006, open: 26, off: .013, trim: 'sand', from: 'base-.014' },
    { use: 'skirt', color: 'tunic', hem: .58, flare: 1.22, off: .02, folds: 7 },
    // Layered leather flaps at the hips, three shale plates down the front and one down the back.
    { use: 'panel', color: 'leatherDark', mat: 'leather', at: 76, from: .86, to: .62, width: [.1, .11], off: .004, thick: .005, border: 'sand', borderWidth: .008, round: .01 },
    { use: 'panel', color: 'leatherDark', mat: 'leather', at: -76, from: .86, to: .62, width: [.1, .11], off: .004, thick: .005, border: 'sand', borderWidth: .008, round: .01 },
    { use: 'panel', color: 'leather', mat: 'leather', at: 76, from: 'belt', to: .76, width: [.09, .1], off: .01, thick: .006, border: 'sand', borderWidth: .008, round: .01 },
    { use: 'panel', color: 'leather', mat: 'leather', at: -76, from: 'belt', to: .76, width: [.09, .1], off: .01, thick: .006, border: 'sand', borderWidth: .008, round: .01 },
    { use: 'a/plates', on: 'coat', list: [{ at: [0, .94], size: [.19, .09] }, { at: [0, .8], size: [.21, .1] }, { at: [0, .655], size: [.23, .11] }], color: 'shale', border: 'sand', thick: .02, off: .01, borderWidth: .012, rivet: 'iron', name: 'apron' },
    { use: 'a/plates', on: 'coat', list: [{ at: [180, .8], size: [.2, .26] }], color: 'shale', border: 'sand', thick: .02, off: .01, borderWidth: .013, name: 'apron' },
    brace(1), brace(-1),
    { use: 'belt', color: 'leather', buckle: 'iron', height: .05, off: .028, buckleSize: [.03, .028], keepers: [40, -40, 140, -140] },
    // Stone bracers on leather.
    { use: 'bracer', from: 1.28, to: 1.9, color: 'leather', strapColor: 'leatherDark', straps: [1.36, 1.84] },
    { use: 'a/plates', on: 'arm', list: [{ at: [95, 1.58], size: [.105, .14] }], color: 'shale', border: 'sand', thick: .018, off: .013, borderWidth: .011, rivet: 'iron', name: 'bracerPlates' },
    { use: 'boots', color: 'boot', sole: 'sole', top: 1.56, toeCap: 'sand', shinPlate: 'shale', heelPlate: 'sand', cuff: 'sand', plateMat: 'ceramic', straps: 3, strapColor: 'leather', bulk: 1.3, soleHeight: .046 },
    { use: 'a/kit', name: 'inlay', on: 'leg', side: 'both', t: 1.7, phi: 60, off: .034, items: [vein(0, 0, 0, .012, .05, [0, 0, 0])] },
    // Carrying frame behind the head with its boulder, clamped at the shoulders and the small of the back.
    { use: 'a/kit', name: 'frame', on: 'trunk', y: 'shoulder-.02', th: 180, off: .03, bone: 'spine2', items: [
      post(-.17, .2, .017, .22), post(.17, .2, .017, .22), post(0, .42, .19, .017), post(0, -.02, .19, .017), post(0, -.12, .017, .1),
      ...block(-.17, .42), ...block(.17, .42), ...block(-.17, -.02), ...block(.17, -.02), ...block(-.17, .2), ...block(.17, .2), ...block(0, .42),
      { s: 'box', size: [.05, .032, .02], at: [0, -.21, .02], color: 'sand', mat: 'stone', r: .006 },
      { s: 'rock', size: [.115, .16, .1], seed: 7, at: [-.275, .27, .05], rot: [0, 0, 14], color: 'shale', mat: 'stone' },
      { s: 'rock', size: [.07, .06, .07], seed: 3, at: [-.25, .43, .05], color: 'sand', mat: 'stone' },
      vein(-.3, .3, .135, .02, .11, [20, 0, 20]), vein(-.25, .22, .135, .016, .08, [28, 0, -30]), vein(-.34, .2, .1, .014, .07, [10, 40, 60]),
      { s: 'box', size: [.07, .012, .012], at: [-.2, .3, .04], color: 'leather', mat: 'leather' }, { s: 'box', size: [.07, .012, .012], at: [-.2, .2, .04], color: 'leather', mat: 'leather' } ] },
    { use: 'hair', style: 'bun', color: 'hair', locks: 120, length: .3, bun: { at: [0, .08, -.44], radius: .17, tie: 'tie' } },
    { use: 'a/fringe', color: 'hair', count: 6, span: 1.2, from: .4, to: .1, sideTo: -.3, width: .03, sweep: .5 },
  ],
};
