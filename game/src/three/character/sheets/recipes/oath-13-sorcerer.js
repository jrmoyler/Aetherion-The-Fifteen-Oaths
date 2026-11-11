// 13 SORCERER - ARCANE & ILLUSION - Folded Theatre. Read from assets/references/reference-066 (folded lacquer mauve,
// woven aubergine, old silver and pearl; attachments: belt fastening, spell case hinge).
import { C } from '../builders-c.js';

const pearl = (at, r = .007) => [{ s: 'cyl', d: [r * 1.5, .0025, r * 1.5, 8], rot: [90, 0, 0], at, c: 'silver', m: 'silver' }, { s: 'ball', d: [r, r, r, 8, 5], at: [at[0], at[1], at[2] + .004], c: 'pearl', m: 'porcelain' }];
// Folded lacquer wings: one triangular plate rising from the collar bone to a point beyond the shoulder, front
// and back, sharing an edge along the top of the shoulder.
const wing = { use: 'c:kit', name: 'wing', side: 'both', on: { bone: 'spine2', at: [0, 0, 0] }, parts: [
  { s: 'prism', pts: [[.03, .15], [.3, .27], [.085, -.02]], d: [.006, .012], rot: [8, 24, 0], at: [0, 0, .112], c: 'mauve', m: 'lacquer', e: .8 },
  { s: 'prism', pts: [[-.03, .15], [-.3, .27], [-.02, -.11]], d: [.006, .012], rot: [-6, 156, 0], at: [0, 0, -.135], c: 'mauveDark', m: 'lacquer', e: .8 },
] };
const cuff = { use: 'c:kit', name: 'cuff', side: 'both', on: { limb: 'arm', t: 1.56, phi: 90, off: .012, skin: 'forearm.L' }, parts: [
  { s: 'rbox', d: [.036, .06, .007, .004], at: [0, 0, .006], c: 'mauve', m: 'lacquer' }, { s: 'rbox', d: [.03, .04, .007, .004], at: [0, .03, .015], c: 'aubergineLight', m: 'lacquer' },
  { s: 'rbox', d: [.04, .007, .009, .003], at: [0, .062, .008], c: 'silver', m: 'silver' }, { s: 'rbox', d: [.04, .007, .009, .003], at: [0, -.062, .008], c: 'silver', m: 'silver' },
  { s: 'prism', pts: [[-.026, .02], [0, .06], [.026, .02], [.02, -.02], [-.02, -.02]], d: [.006, .006], at: [0, .055, .02], c: 'silver', m: 'silver' },
  ...pearl([0, .06, .028], .006), ...pearl([.03, -.05, .014], .0045), ...pearl([-.03, -.05, .014], .0045),
] };

export default {
  id: 'oath-13-sorcerer', sheet: 'reference-066', title: 'Folded Theatre Sorcerer',
  palette: {
    cloth: '#3a1f2c', aubergine: '#3a1f2c', aubergineLight: '#4d2a3d', aubergineDark: '#2a1620', plum: '#4b2146', mauve: '#b497a6', mauveDark: '#9a7f8e', silver: '#b6ad9c', silverDark: '#7d7566', pearl: '#ece6da',
    gold: '#a98e62', leather: '#2c1c22', leatherDark: '#22161b', iron: '#b6ad9c', boot: '#2a1a1f', sole: '#1c1215', glove: '#3b2030', hair: '#17151a', hairSheen: '#2c2932',
  },
  build: { width: .97, depth: .98, bust: .018, waist: .96, hips: 1.06, arm: .9, leg: 1.0, neck: .9 },
  keep: ['weapon'],
  builders: C,
  groom: { hair: false, gear: false },
  parts: [
    { use: 'neck' },
    { use: 'shirt', color: 'aubergine', sleeve: 1.95, flare: .004, off: .009, cap: .014, slack: .003 },
    // Wrap front: the mauve lacquer facing runs from the left shoulder down to the belt, pinned with a pearl.
    { use: 'c:patch', color: 'aubergineLight', trim: 'silver', trimMat: 'silver', trimWidth: .004, edges: [1], off: .011, quads: [[[-70, 'shoulder', -.012], [-12, 'base', -.012], [20, 'belt', .05], [-76, 'belt', .05]]] },
    { use: 'c:patch', color: 'mauve', mat: 'lacquer', trim: 'silver', trimMat: 'silver', trimWidth: .004, edges: [1, 3], off: .016, quads: [[[10, 'base', -.012], [44, 'shoulder', -.02], [34, 'belt', .06], [-6, 'belt', .06]]] },
    { use: 'c:kit', name: 'pearl', on: { y: 'armpit', dy: .03, th: 30, off: .024, skin: 'spine2' }, parts: pearl([0, 0, 0], .009) },
    wing,
    { use: 'c:collar', color: 'aubergineDark', lining: 'aubergine', trim: 'silver', trimMat: 'silver', height: .06, back: .006, flare: .012, gap: 20, off: .01 },
    { use: 'trousers', color: 'aubergineDark', gather: 1.6, bag: .008, pleats: 4, pockets: [], cuff: .006, piping: 'silverDark', pipingPaths: [[90, 90, .1, 1.5]] },
    { use: 'band', limb: 'leg', at: 1.12, width: .018, off: .012, thick: .004, color: 'leather', buckle: { phi: 80, color: 'silver' } },
    // Skirt panels: the embroidered aubergine front, and folded mauve lacquer falling long at the right and back.
    { use: 'c:drape', from: 40, to: 200, hem: .78, color: 'aubergine', flare: 1.04, clear: .024, off: .018 },
    { use: 'c:drape', from: -160, to: -8, off: .02, hem: [[-160, .34], [-120, .5], [-90, .36], [-50, .62], [-8, .74]], color: 'mauve', mat: 'lacquer', flare: 1.14, clear: .034, fold: .012, trim: 'silver', trimMat: 'silver', trimWidth: .0045 },
    { use: 'c:drape', from: 150, to: 216, off: .026, hem: [[150, .56], [186, .36], [216, .5]], color: 'mauveDark', mat: 'lacquer', flare: 1.16, clear: .038, fold: .012, trim: 'silver', trimMat: 'silver', trimWidth: .0045 },
    { use: 'c:drape', from: -12, to: 64, off: .027, hem: [[-12, .6], [20, .5], [64, .62]], color: 'plum', flare: 1.08, clear: .036, fold: .012, trim: 'gold', trimMat: 'brass', trimWidth: .0045 },
    // Belt with the hexagonal silver fastening, and the spell case hung at the left hip.
    { use: 'belt', height: .034, thick: .007, off: .03, color: 'leather', buckle: null, keepers: [60, -60, 150, -150], studs: 0 },
    { use: 'belt', rise: -.03, height: .012, thick: .004, off: .034, color: 'silverDark', buckle: null, keepers: [], tilt: .014 },
    { use: 'c:kit', name: 'buckle', on: { y: 'belt', th: 0, off: .038, skin: 'hips' }, parts: [
      { s: 'prism', pts: [[0, .03], [.027, .015], [.027, -.015], [0, -.03], [-.027, -.015], [-.027, .015]], d: [.007, .004], c: 'silver', m: 'silver' },
      { s: 'prism', pts: [[0, .017], [.015, .0085], [.015, -.0085], [0, -.017], [-.015, -.0085], [-.015, .0085]], d: [.004, .005], at: [0, 0, .007], c: 'pearl', m: 'porcelain' } ] },
    { use: 'c:kit', name: 'case', on: { y: 'belt', dy: -.075, th: 66, off: .046, skin: 'hips' }, parts: [
      { s: 'rbox', d: [.04, .056, .02, .004], c: 'plum', m: 'leather' },
      { s: 'rbox', d: [.043, .007, .023, .003], at: [0, .051, 0], c: 'silver', m: 'silver' }, { s: 'rbox', d: [.043, .007, .023, .003], at: [0, -.051, 0], c: 'silver', m: 'silver' },
      { s: 'rbox', d: [.008, .058, .024, .004], at: [-.037, 0, 0], c: 'silver', m: 'silver' }, { s: 'rbox', d: [.005, .058, .023, .003], at: [.039, 0, 0], c: 'silverDark', m: 'silver' },
      ...pearl([-.037, .02, .024], .006), ...pearl([-.037, -.02, .024], .006),
      { s: 'rbox', d: [.008, .034, .004, .002], at: [0, .084, -.008], c: 'leather', m: 'leather' },
    ] },
    cuff,
    { use: 'band', limb: 'arm', at: 1.24, width: .022, off: .01, thick: .005, color: 'silverDark', mat: 'iron' },
    { use: 'gloveCuff', from: 1.84, to: 2.05, color: 'glove' },
    { use: 'hands', glove: 'glove', fingerless: true },
    { use: 'boots', top: 1.5, straps: 3, strapColor: 'leatherDark', buckle: 'silver', toeCap: 'silverDark', heelPlate: 'silverDark', plateMat: 'iron', soleHeight: .034 },
    // Short black hair swept across the brow, longer on the right.
    { use: 'hair', style: 'long', streak: 'hairSheen', length: .4, density: 1, lift: .02, fringe: .36 },
    { use: 'c:strands', width: .09, list: [[-40, .3, .44, .06, -.04], [-20, .34, .32, .07, -.09], [24, .34, .2, .06, .1]] },
  ],
};
