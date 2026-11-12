// 05 SORCERER - EARTH & CRYSTAL - Fault Choir. Read from assets/references/reference-083 (layered shale,
// sandstone, leather strap, raw amethyst; frame shoulder clamp, frame base clamp).
import { A } from '../builders-a.js';
import { X } from '../builders-x.js';

const brace = (s) => ({ use: 'strap', color: 'leather', closed: false, width: .034, thick: .006, anchor: { at: .15, size: .02, color: 'iron' }, n: 34, path: [
  { th: s * 24, y: 'belt', dy: .03, off: .024 }, { th: s * 25, y: 'ribs', off: .026 }, { th: s * 30, y: 'armpit', dy: .02, off: .024 }, { th: s * 56, y: 'shoulder', dy: -.02, off: .02 },
  { th: s * 124, y: 'shoulder', dy: -.02, off: .02 }, { th: s * 150, y: 'armpit', dy: .02, off: .024 }, { th: s * 160, y: 'ribs', off: .026 }, { th: s * 164, y: 'belt', dy: .03, off: .024 } ] });
const post = (x, y, sx, sy) => ({ s: 'box', size: [sx, sy, .024], at: [x, y, .03], color: 'frame', mat: 'stone', r: .006 });
const block = (x, y) => [{ s: 'box', size: [.036, .036, .03], at: [x, y, .03], color: 'sand', mat: 'stone', r: .006 }, { s: 'dome', r: .006, at: [x, y, .06], color: 'iron', mat: 'iron' }];
const vein = (x, y, z, r, h, rot) => ({ s: 'gem', r, h, at: [x, y, z], rot, color: 'amethyst', mat: 'crystal' });

export default {
  id: 'oath-05-sorcerer', sheet: 'reference-083', title: 'Fault Sorcerer',
  palette: {
    cloth: '#3c332c', tunic: '#3c332c', tunicDark: '#2a2420', sand: '#b3956c', shale: '#4a4541', frame: '#5a524a', leather: '#6b4a33', leatherDark: '#3e2b1f', iron: '#5b534b', ceramic: '#4a4541',
    amethyst: '#3c1c63', boot: '#3a322c', sole: '#191513', glove: '#2a211c', hair: '#191517', tie: '#191517',
  },
  build: { width: 1.3, depth: 1.22, bust: .034, hips: 1.26, waist: 1.14, arm: 1.5, leg: 1.5, calf: 1.08, shoulder: 1.14, neck: 1.08 },
  keep: ['weapon'],
  builders: { ...A, ...X },
  groom: { hair: false, gear: false, beard: false },
  parts: [
    { use: 'neck' },
    { use: 'x.physique', part: 'arm', from: -.2, to: 2, power: 1.7 },
    { use: 'skinLimb', limb: 'leg', from: 1.0, to: 1.6 },
    { use: 'trousers', color: 'tunicDark', gather: 1.04, bag: .02, pleats: 9, pockets: [], pipingPaths: [], from: .44 },
    { use: 'a/bodysuit', color: 'tunic', trunk: ['belt-.03', 'base'], off: .011, ease: .004, zones: [{ on: 'trunk', both: true, a: [28, 62], b: ['waist-.03', 'armpit+.03'], color: 'sand' }] },
    { use: 'a/lines', on: 'trunk', both: true, paths: [[[52, 'shoulder-.02'], [68, 'armpit+.01'], [90, 'armpit-.04'], [114, 'armpit+.01'], [130, 'shoulder-.02']]], color: 'sand', width: .012, thick: .003, off: .012, name: 'binding' },
    { use: 'a/collar', color: 'tunic', lining: 'tunicDark', height: .045, flare: .006, open: 26, off: .013, trim: 'sand', from: 'base-.014' },
    { use: 'skirt', color: 'tunic', hem: .64, flare: 1.14, off: .02, folds: 9 },
    // Layered leather flaps at the hips, three shale plates down the front and one down the back.
    { use: 'panel', color: 'leatherDark', mat: 'leather', at: 76, from: .86, to: .62, width: [.1, .11], off: .004, thick: .005, border: 'sand', borderWidth: .008, round: .01 },
    { use: 'panel', color: 'leatherDark', mat: 'leather', at: -76, from: .86, to: .62, width: [.1, .11], off: .004, thick: .005, border: 'sand', borderWidth: .008, round: .01 },
    { use: 'panel', color: 'leather', mat: 'leather', at: 76, from: 'belt', to: .76, width: [.09, .1], off: .01, thick: .006, border: 'sand', borderWidth: .008, round: .01 },
    { use: 'panel', color: 'leather', mat: 'leather', at: -76, from: 'belt', to: .76, width: [.09, .1], off: .01, thick: .006, border: 'sand', borderWidth: .008, round: .01 },
    { use: 'x.plate', at: 0, arc: 36, from: .905, to: .985, hangs: true, off: .012, thick: .018, relief: .009, cell: 3, seed: 2, color: 'shale', mat: 'ceramic', rim: 'sand', rimMat: 'ceramic', rimWidth: .013, rivets: 2, rivet: 'iron', n: 1.5 },
    { use: 'x.plate', at: 0, arc: 38, from: .795, to: .89, hangs: true, off: .012, thick: .018, relief: .009, cell: 3, seed: 5, color: 'shale', mat: 'ceramic', rim: 'sand', rimMat: 'ceramic', rimWidth: .013, rivets: 2, rivet: 'iron', n: 1.5 },
    { use: 'x.plate', at: 0, arc: 40, from: .665, to: .78, hangs: true, off: .012, thick: .018, relief: .009, cell: 3, seed: 8, color: 'shale', mat: 'ceramic', rim: 'sand', rimMat: 'ceramic', rimWidth: .013, rivets: 2, rivet: 'iron', n: 1.5 },
    { use: 'x.plate', at: 180, arc: 36, from: .69, to: .93, hangs: true, off: .012, thick: .018, relief: .009, cell: 3, seed: 11, color: 'shale', mat: 'ceramic', rim: 'sand', rimMat: 'ceramic', rimWidth: .013, rivets: 2, rivet: 'iron', n: 1.5 },
    brace(1), brace(-1),
    { use: 'belt', color: 'leather', buckle: 'iron', height: .05, off: .028, buckleSize: [.03, .028], keepers: [40, -40, 140, -140] },
    // Stone bracers on leather.
    { use: 'bracer', from: 1.28, to: 1.9, color: 'leather', strapColor: 'leatherDark', straps: [1.36, 1.84] },
    { use: 'a/plates', on: 'arm', list: [{ at: [95, 1.58], size: [.105, .14] }], color: 'shale', border: 'sand', thick: .018, off: .013, borderWidth: .011, rivet: 'iron', name: 'bracerPlates' },
    { use: 'boots', color: 'boot', sole: 'sole', top: 1.56, toeCap: 'sand', shinPlate: 'shale', heelPlate: 'sand', cuff: 'sand', plateMat: 'ceramic', straps: 3, strapColor: 'leather', bulk: 1.3, soleHeight: .046 },
    { use: 'a/kit', name: 'inlay', on: 'leg', side: 'both', t: 1.7, phi: 60, off: .034, items: [vein(0, 0, 0, .012, .05, [0, 0, 0])] },
    // Carrying frame behind the head with its boulder, clamped at the shoulders and the small of the back.
    { use: 'a/kit', name: 'frame', on: 'trunk', y: 'shoulder-.02', th: 180, off: .03, bone: 'spine2', items: [
      post(-.17, .2, .024, .22), post(.17, .2, .024, .22), post(0, .42, .19, .024), post(0, -.02, .19, .024), post(0, -.12, .022, .1),
      ...block(-.17, .42), ...block(.17, .42), ...block(-.17, -.02), ...block(.17, -.02), ...block(-.17, .2), ...block(.17, .2), ...block(0, .42),
      { s: 'box', size: [.05, .032, .02], at: [0, -.21, .02], color: 'sand', mat: 'stone', r: .006 },
      { s: 'rock', size: [.15, .2, .13], seed: 7, at: [-.31, .26, .06], rot: [0, 0, 14], color: 'shale', mat: 'stone' },
      { s: 'rock', size: [.085, .07, .085], seed: 3, at: [-.29, .45, .06], color: 'sand', mat: 'stone' },
      vein(-.33, .3, .175, .024, .13, [24, 0, 20]), vein(-.27, .2, .17, .019, .1, [30, 0, -30]), vein(-.39, .18, .14, .017, .09, [14, 40, 60]),
      { s: 'box', size: [.05, .014, .014], at: [-.2, .32, .04], color: 'leather', mat: 'leather' }, { s: 'box', size: [.05, .014, .014], at: [-.2, .2, .04], color: 'leather', mat: 'leather' } ] },
    { use: 'hair', style: 'updo', wave: .03, fringe: .33, knot: { at: [0, -.02, -.5], radius: .16, kind: 'coil', tie: 'tie' }, tendrils: [[48, .28, .3, .03, .02], [-48, .28, .32, .03, .02], [72, .15, .22, .025], [-72, .15, .2, .025]] },
    { use: 'hands', glove: 'glove', fingerless: true, scale: 1.08 },
  ],
};
