// 04 NINJA - WATER - Tidal Covenant. Read from assets/references/reference-084 (deep petroleum blue 60%, pearly
// shell 30%, sea green 10%; woven diving cloth, nacre shell plate, sealed reservoir, worn brass fittings; right
// shoulder plate mount, reservoir mount on the back).
import { A } from '../builders-a.js';
import { B } from '../builders-b.js';
import { X } from '../builders-x.js';

const shell = (y, r, tilt, spread = 150) => ({ s: 'fan', r, spread, ribs: 9, bulge: .22, curl: .55, rot: [tilt, 0, 180], at: [0, y, .0], color: 'nacre', mat: 'nacre' });

export default {
  id: 'oath-04-ninja', sheet: 'reference-084', title: 'Tidal Ninja',
  palette: {
    suit: '#111b33', suitDark: '#0b1224', suitLight: '#1b2a4c', green: '#3b6f68', greenDark: '#2a5450', nacreWarm: '#d9c9ae', brass: '#b28c47', iron: '#b28c47', nacre: '#e9dfcf', visor: '#12333c', glass: '#3c95a0', leather: '#3b2d21', leatherDark: '#241b14',
    boot: '#18243f', sole: '#0f1626', glove: '#16213c',
  },
  build: { width: 1.0, depth: .96, hips: 1.1, waist: .86, seat: 1.12, bust: .042, leg: 1.1, thigh: 1.14, calf: 1.04, arm: .94, shoulder: .96, neck: .9 },
  keep: ['weapon'],
  builders: { ...A, ...B, ...X },
  groom: { hair: false, gear: false },
  parts: [
    { use: 'a/bodysuit', color: 'suit', trunk: ['crotch', 'base'], arms: [-.14, 1.98], legs: [-.155, 1.92], off: .005, zones: [
      { on: 'leg', a: [52, 132], b: [.06, .9], color: 'green' }, { on: 'leg', a: [150, 210], b: [1.2, 1.7], color: 'suitLight' }, { on: 'arm', a: [50, 130], b: [.3, .8], color: 'suitLight' }, { on: 'trunk', both: true, a: [68, 118], b: ['waist-.02', 'armpit-.01'], color: 'green' } ] },
    { use: 'a/lines', on: 'leg', paths: [[[46, .08], [40, .45], [48, .84]], [[142, .08], [144, .84]], [[46, .08], [95, .0], [142, .08]], [[48, .84], [95, .92], [144, .84]], [[20, 1.05], [-10, 1.4], [10, 1.85]], [[95, .92], [100, 1.3], [96, 1.8]]], color: 'brass', mat: 'brass', width: .0035, thick: .0015, off: .006, name: 'piping' },
    { use: 'a/lines', on: 'trunk', both: true, paths: [[[66, 'waist-.02'], [64, 'ribs'], [68, 'armpit-.01']], [[14, 'belt'], [26, 'ribs'], [20, 'chest'], [34, 'shoulder-.04']], [[160, 'belt'], [168, 'chest'], [150, 'shoulder-.04']]], color: 'brass', mat: 'brass', width: .0035, thick: .0015, off: .006, name: 'piping' },
    { use: 'b.neck', color: 'suitDark', mat: 'cloth', off: .005 },
    { use: 'a/collar', color: 'suitDark', height: .085, flare: .004, off: .009 },
    { use: 'a/helm', color: 'suit', visor: 'visor', trim: 'brass', crest: null, under: 'green', band: 'brass' },
    // Layered shell crest: four nacre plates lapped from a bill over the brow back to a swept tail.
    { use: 'x.crest', tiers: 4, start: 30, end: 110, reach: 62, width: 1.2, off: .12, lift: .06, tail: .24, bill: .2, ridge: .07, shrink: .1, color: 'nacre', dark: 'nacreWarm', edge: 'brass', edgeMat: 'brass' },
    // Layered shell pauldron on the right shoulder, hung on a brass boss and a strap across the chest.
    { use: 'strap', color: 'leather', width: .018, thick: .004, anchor: { at: .2, size: .012, color: 'brass' }, path: [
      { th: -50, y: 'shoulder', dy: -.03, off: .013 }, { th: 24, y: 'ribs', dy: .02, off: .014 }, { th: 92, y: 'waist', dy: .01, off: .014 },
      { th: 168, y: 'ribs', dy: .0, off: .014 }, { th: 228, y: 'shoulder', dy: -.03, off: .013 }, { th: 270, y: 'shoulder', dy: .004, off: .014 } ] },
    { use: 'x.shards', limb: 'arm', side: 'R', from: -.34, to: .62, phi: 90, arc: 112, rows: 5, cols: 3, off: .012, thick: .008, lift: .03, jitter: .25, round: .92, overlap: .8, ridge: .012, grow: .0, color: 'nacre', dark: 'nacreWarm', mat: 'nacre', rim: 'brass', rimMat: 'brass', seed: 4, skin: [['shoulder.L', .45], ['upperarm.L', .55]] },
    { use: 'x.shards', at: -62, arc: 34, from: ['shoulder', .03], to: ['armpit', -.0], rows: 2, cols: 2, off: .014, thick: .007, lift: .022, jitter: .2, round: .92, overlap: .7, ridge: .01, color: 'nacre', dark: 'nacreWarm', mat: 'nacre', rim: 'brass', rimMat: 'brass', seed: 9 },
    { use: 'b.studs', on: 'trunk', at: [[['chest', .03], 2]], r: .02, height: .008, off: .016, color: 'brass', mat: 'brass', rim: 'brass', rimMat: 'brass' },
    { use: 'strap', color: 'leather', width: .018, thick: .004, path: [
      { th: 50, y: 'shoulder', dy: -.03, off: .013 }, { th: -24, y: 'ribs', dy: .02, off: .014 }, { th: -92, y: 'waist', dy: .01, off: .014 },
      { th: -168, y: 'ribs', dy: .0, off: .014 }, { th: -228, y: 'shoulder', dy: -.03, off: .013 }, { th: -270, y: 'shoulder', dy: .004, off: .014 } ] },
    { use: 'band', limb: 'arm', at: .62, width: .014, off: .006, thick: .004, color: 'brass', mat: 'iron' },
    { use: 'band', limb: 'arm', at: 1.22, width: .014, off: .006, thick: .004, color: 'brass', mat: 'iron' },
    { use: 'band', limb: 'arm', at: 1.82, width: .014, off: .006, thick: .004, color: 'brass', mat: 'iron' },
    { use: 'b.guard', limb: 'arm', from: 1.24, to: 1.82, phi: 95, arc: 82, off: .008, thick: .008, bulge: .006, ridge: .006, flare: .008, color: 'nacre', mat: 'nacre', trim: 'brass', trimMat: 'brass', trimWidth: .006 },
    { use: 'a/kit', name: 'fins', on: 'arm', side: 'both', t: 1.8, phi: 150, off: .0, items: [
      { s: 'leaf', len: .2, width: .07, thick: .01, bend: .08, base: .5, color: 'nacre', mat: 'nacre' }, { s: 'leaf', len: .14, width: .055, thick: .009, bend: .06, base: .55, at: [-.02, -.006, 0], rot: [0, 0, 12], color: 'green', mat: 'nacre' } ] },
    // Knee caps, hip straps.
    { use: 'b.guard', limb: 'leg', from: .88, to: 1.14, phi: 0, arc: 64, off: .008, thick: .007, bulge: .016, ridge: .006, pointTop: .06, point: .08, color: 'suitLight', mat: 'leather', trim: 'brass', trimMat: 'brass', trimWidth: .005 },
    { use: 'band', limb: 'leg', at: .2, width: .016, off: .006, thick: .004, color: 'leather', mat: 'leather' },
    // Sealed reservoir on the back.
    { use: 'a/kit', name: 'reservoir', on: 'trunk', y: 'ribs+.03', th: 180, off: .012, bone: 'spine1', items: [
      { s: 'ball', size: [.058, .086, .042], at: [0, 0, .03], color: 'glass', mat: 'glass', seg: 16, rows: 9 }, { s: 'ring', rx: .06, ry: .088, r: .0085, at: [0, 0, .03], color: 'brass', mat: 'brass', seg: 24 },
      { s: 'cyl', r: .018, h: .022, rot: [-90, 0, 0], at: [0, .084, .03], color: 'brass', mat: 'brass' }, { s: 'cyl', r: .014, h: .016, rot: [90, 0, 0], at: [0, -.086, .03], color: 'brass', mat: 'brass' },
      { s: 'box', size: [.012, .05, .004], at: [-.03, .13, .006], rot: [0, 0, 24], color: 'leather', mat: 'leather' }, { s: 'box', size: [.012, .05, .004], at: [.03, .13, .006], rot: [0, 0, -24], color: 'leather', mat: 'leather' },
      { s: 'box', size: [.075, .01, .005], at: [0, -.05, .008], color: 'leather', mat: 'leather' } ] },
    { use: 'belt', color: 'leather', buckle: 'brass', height: .022, thick: .005, off: .011, buckleSize: [.016, .014], keepers: [], tilt: -.014 },
    // Swept calf fins, brass anklets, brass-capped boots.
    { use: 'a/kit', name: 'fins', on: 'leg', side: 'both', t: 1.84, phi: 138, off: .0, items: [
      { s: 'leaf', len: .36, width: .12, thick: .016, bend: .14, base: .5, color: 'nacre', mat: 'nacre' }, { s: 'leaf', len: .27, width: .1, thick: .013, bend: .1, base: .55, at: [-.035, -.01, 0], rot: [0, 0, 12], color: 'green', mat: 'nacre' },
      { s: 'leaf', len: .2, width: .08, thick: .012, bend: .08, base: .55, at: [.03, -.01, 0], rot: [0, 0, -14], color: 'greenDark', mat: 'nacre' } ] },
    { use: 'band', limb: 'leg', at: 1.84, width: .022, off: .008, thick: .005, color: 'brass', mat: 'iron' },
    { use: 'boots', color: 'boot', sole: 'sole', top: 1.9, toeCap: 'brass', heelPlate: 'brass', plateMat: 'iron', straps: 1, strapColor: 'leather', buckle: 'brass', soleHeight: .03 },
    { use: 'gloveCuff', color: 'glove', from: 1.92, to: 2.05, off: .004 },
    { use: 'hands', glove: 'glove', scale: .95 },
  ],
};
