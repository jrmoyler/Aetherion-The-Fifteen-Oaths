// 05 NINJA - EARTH & CRYSTAL - Fault Choir. Read from assets/references/reference-082 (fractured shale plate,
// sandstone, leather strap, raw amethyst; back plate support, forearm sling).
import { A } from '../builders-a.js';
import { X } from '../builders-x.js';

const sling = (s) => ({ use: 'strap', color: 'leather', closed: false, width: .034, thick: .006, n: 30, path: [
  { th: s * 30, y: 'chest', dy: .05, off: .03 }, { th: s * 34, y: 'armpit', dy: .03, off: .028 }, { th: s * 58, y: 'shoulder', dy: -.02, off: .022 }, { th: s * 122, y: 'shoulder', dy: -.02, off: .022 },
  { th: s * 148, y: 'armpit', dy: .03, off: .028 }, { th: s * 152, y: 'chest', dy: .05, off: .03 } ] });
const pouch = [{ s: 'box', size: [.032, .04, .02], color: 'leather', mat: 'leather', r: .008 }, { s: 'box', size: [.034, .016, .022], at: [0, .028, 0], color: 'leatherDark', mat: 'leather', r: .006 }, { s: 'box', size: [.007, .012, .004], at: [0, .012, .022], color: 'iron', mat: 'iron' }];
const shard = (x, y, r, h, rz, rx = 0) => ({ s: 'gem', r, h, at: [x, y, .022], rot: [rx, 0, rz], color: 'amethyst', mat: 'crystal' });

export default {
  id: 'oath-05-ninja', sheet: 'reference-082', title: 'Fault Ninja',
  palette: {
    cloth: '#2f2826', tunic: '#2f2826', tunicDark: '#211c1a', trouser: '#40312a', hem: '#5d4636', shale: '#4b4541', sand: '#b3956c', leather: '#6b4631', leatherDark: '#3c291d', iron: '#5c5249', ceramic: '#4b4541',
    amethyst: '#3c1c63', boot: '#2d2521', sole: '#191513', glove: '#1f1a18', hair: '#2b1d15',
  },
  build: { width: 1.24, depth: 1.14, arm: 1.36, upperArm: 1.1, leg: 1.2, shoulder: 1.3, waist: 1.04, hips: 1.04, neck: 1.2 },
  keep: ['weapon'],
  builders: { ...A, ...X },
  groom: { hair: false, gear: false, beard: false },
  parts: [
    { use: 'neck' },
    { use: 'x.physique', part: 'arm', from: .7, to: 1.2, power: 1.6 },
    { use: 'shirt', color: 'tunic', sleeve: .66, flare: .03, bell: true, cap: .034, off: .013, trim: 'hem', trimWidth: .024 },
    { use: 'wrap', limb: 'arm', from: 1.08, to: 1.95, color: 'tunicDark', off: .006, pitch: .02 },
    { use: 'trousers', color: 'trouser', gather: 1.1, bag: .056, low: 1, pleats: 9, pipingPaths: [] },
    { use: 'band', limb: 'leg', at: 1.15, width: .04, color: 'leatherDark', trim: 'sand' },
    { use: 'wrap', limb: 'leg', from: 1.18, to: 1.66, color: 'tunicDark', off: .008, pitch: .022 },
    // Shale breast and back plates framed in sandstone, slung on leather over the shoulders, with the sandstone
    // spine blocks that carry the back plates.
    { use: 'x.plate', at: 27, arc: 24, from: ['chest', -.035], to: ['shoulder', -.04], off: .02, thick: .026, bulge: .006, relief: .011, cell: 3, seed: 4, color: 'shale', mat: 'ceramic', rim: 'sand', rimMat: 'ceramic', rimWidth: .017, rivets: 2, rivet: 'iron', n: 1.5 },
    { use: 'x.plate', at: 26, arc: 23, from: ['waist', .0], to: ['chest', -.05], off: .02, thick: .026, bulge: .006, relief: .011, cell: 3, seed: 7, color: 'shale', mat: 'ceramic', rim: 'sand', rimMat: 'ceramic', rimWidth: .017, rivets: 2, rivet: 'iron', n: 1.5 },
    { use: 'x.plate', at: 152, arc: 23, from: ['chest', -.04], to: ['shoulder', -.05], off: .02, thick: .026, bulge: .006, relief: .011, cell: 3, seed: 10, color: 'shale', mat: 'ceramic', rim: 'sand', rimMat: 'ceramic', rimWidth: .017, rivets: 2, rivet: 'iron', n: 1.5 },
    { use: 'x.plate', at: 153, arc: 21, from: ['waist', .01], to: ['chest', -.055], off: .02, thick: .026, bulge: .006, relief: .011, cell: 3, seed: 13, color: 'shale', mat: 'ceramic', rim: 'sand', rimMat: 'ceramic', rimWidth: .017, rivets: 2, rivet: 'iron', n: 1.5 },
    { use: 'x.plate', at: -27, arc: 24, from: ['chest', -.035], to: ['shoulder', -.04], off: .02, thick: .026, bulge: .006, relief: .011, cell: 3, seed: 5, color: 'shale', mat: 'ceramic', rim: 'sand', rimMat: 'ceramic', rimWidth: .017, rivets: 2, rivet: 'iron', n: 1.5 },
    { use: 'x.plate', at: -26, arc: 23, from: ['waist', .0], to: ['chest', -.05], off: .02, thick: .026, bulge: .006, relief: .011, cell: 3, seed: 8, color: 'shale', mat: 'ceramic', rim: 'sand', rimMat: 'ceramic', rimWidth: .017, rivets: 2, rivet: 'iron', n: 1.5 },
    { use: 'x.plate', at: -152, arc: 23, from: ['chest', -.04], to: ['shoulder', -.05], off: .02, thick: .026, bulge: .006, relief: .011, cell: 3, seed: 11, color: 'shale', mat: 'ceramic', rim: 'sand', rimMat: 'ceramic', rimWidth: .017, rivets: 2, rivet: 'iron', n: 1.5 },
    { use: 'x.plate', at: -153, arc: 21, from: ['waist', .01], to: ['chest', -.055], off: .02, thick: .026, bulge: .006, relief: .011, cell: 3, seed: 14, color: 'shale', mat: 'ceramic', rim: 'sand', rimMat: 'ceramic', rimWidth: .017, rivets: 2, rivet: 'iron', n: 1.5 },
    { use: 'a/plates', on: 'trunk', list: [{ at: [180, 'chest+.06'], size: [.04, .044] }, { at: [180, 'chest+.0'], size: [.04, .044] }, { at: [180, 'ribs+.0'], size: [.04, .044] }, { at: [180, 'ribs-.06'], size: [.04, .044] }, { at: [180, 'waist-.02'], size: [.04, .044] }], color: 'sand', thick: .036, off: .012, name: 'spine' },
    sling(1), sling(-1),
    { use: 'a/lines', on: 'trunk', both: true, paths: [[[52, 'ribs'], [90, 'ribs+.01'], [128, 'ribs']], [[50, 'waist+.03'], [90, 'waist+.03'], [130, 'waist+.03']]], color: 'leather', mat: 'leather', width: .026, thick: .005, off: .016, name: 'sideStraps' },
    { use: 'a/collar', color: 'shale', mat: 'stone', lining: 'tunicDark', height: .125, flare: .05, off: .034, thick: .02, tilt: .03, trim: 'sand', from: 'base-.02' },
    { use: 'halfMask', color: 'iron', slat: 'sand', vents: 4, strap: 'leatherDark' },
    { use: 'hair', style: 'tousled', top: .2, side: .04, back: .05, bang: .1, lift: .03, flick: .55, mess: .5, fringe: .37, fade: { to: .02, from: .24, min: .3 }, count: 190 },
    // Belt with pouches and the amethyst in its sandstone frame on the left hip.
    { use: 'belt', color: 'leather', buckle: 'iron', height: .05, off: .022, keepers: [30, -30, 150, -150] },
    { use: 'a/kit', name: 'pouches', on: 'trunk', side: 'R', y: 'belt-.03', th: 50, off: .032, items: pouch },
    { use: 'a/kit', name: 'pouches', on: 'trunk', side: 'R', y: 'belt-.03', th: 96, off: .032, items: pouch },
    { use: 'a/kit', name: 'pouches', on: 'trunk', side: 'L', y: 'belt-.03', th: 100, off: .032, items: pouch },
    { use: 'a/kit', name: 'amethyst', on: 'trunk', side: 'L', y: 'belt-.09', th: 38, off: .04, bone: 'hips', items: [
      { s: 'cyl', r: .074, h: .02, sides: 6, color: 'sand', mat: 'stone' }, { s: 'cyl', r: .058, h: .024, sides: 6, color: 'tunicDark', mat: 'stone' },
      shard(0, .0, .024, .085, 0, 62), shard(-.024, -.008, .017, .06, 28, 58), shard(.024, -.012, .018, .064, -24, 60), shard(.004, .03, .015, .05, 8, 66), shard(-.008, -.034, .014, .045, 170, 60),
      { s: 'box', size: [.012, .05, .005], at: [0, .1, -.004], color: 'leather', mat: 'leather' } ] },
    // Stone slabs slung on the forearms.
    { use: 'band', limb: 'arm', at: 1.3, width: .028, off: .01, thick: .006, color: 'leather', buckle: { phi: 20 } },
    { use: 'band', limb: 'arm', at: 1.72, width: .028, off: .01, thick: .006, color: 'leather', buckle: { phi: 20 } },
    { use: 'a/plates', on: 'arm', flat: true, list: [{ at: [95, 1.5], size: [.16, .27] }], color: 'shale', border: 'sand', thick: .05, off: .018, borderWidth: .013, name: 'slabs' },
    { use: 'gloveCuff', color: 'glove', strap: 'leather' },
    { use: 'boots', color: 'boot', sole: 'sole', top: 1.62, toeCap: 'shale', heelPlate: 'sand', cuff: 'sand', plateMat: 'ceramic', straps: 3, strapColor: 'leather', bulk: 1.5, soleHeight: .05 },
    { use: 'a/plates', on: 'leg', flat: true, list: [{ at: [0, 1.8], size: [.11, .14] }], color: 'shale', border: 'sand', thick: .028, off: .04, borderWidth: .011, name: 'greaves' },
    { use: 'hands', glove: 'glove', fingerless: true, scale: 1.12 },
  ],
};
