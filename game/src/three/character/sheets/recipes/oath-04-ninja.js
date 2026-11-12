// 04 NINJA - WATER - Tidal Covenant. Read from assets/references/reference-084 (deep petroleum blue 60%, pearly
// shell 30%, sea green 10%; woven diving cloth, nacre shell plate, sealed reservoir, worn brass fittings; right
// shoulder plate mount, reservoir mount on the back).
import { A } from '../builders-a.js';
import { B } from '../builders-b.js';
import { X } from '../builders-x.js';
import { P } from '../builders-p.js';

const shell = (y, r, tilt, spread = 150) => ({ s: 'fan', r, spread, ribs: 9, bulge: .22, curl: .55, rot: [tilt, 0, 180], at: [0, y, .0], color: 'nacre', mat: 'nacre' });

export default {
  id: 'oath-04-ninja', sheet: 'reference-084', title: 'Tidal Ninja',
  palette: {
    suit: '#111b33', suitDark: '#0b1224', suitLight: '#1b2a4c', green: '#3b6f68', greenDark: '#2a5450', nacreWarm: '#d9c9ae', brass: '#b28c47', iron: '#b28c47', nacre: '#e9dfcf', visor: '#12333c', glass: '#3c95a0', leather: '#3b2d21', leatherDark: '#241b14',
    boot: '#18243f', sole: '#0f1626', glove: '#16213c',
  },
  build: { width: 1.0, depth: .96, hips: 1.06, waist: .86, seat: 1.08, bust: .042, leg: 1.08, thigh: 1.06, calf: 1.04, arm: .94, shoulder: .96, neck: .9 },
  keep: ['weapon'],
  builders: { ...A, ...B, ...X, ...P },
  groom: { hair: false, gear: false },
  parts: [
    { use: 'a/bodysuit', color: 'suit', trunk: ['crotch', 'base'], arms: [-.14, 1.98], legs: [-.155, 1.92], off: .005, zones: [] },
    // The suit's contour panels: sea-green lenses down the flank, the outside of the thigh and the calf, lighter
    // blue over the shoulder blade and upper arm, every one piped in brass as painted.
    { use: 'p.contour', on: 'trunk', from: [84, ['armpit', -.02]], to: [70, ['belt', .0]], width: 22, bow: 10, color: 'green', pipe: 'brass' },
    { use: 'p.contour', on: 'leg', from: [80, .02], to: [112, .9], width: 34, bow: 14, color: 'green', pipe: 'brass' },
    { use: 'p.contour', on: 'leg', from: [-16, .1], to: [-44, .84], width: 30, bow: -10, color: 'green', pipe: 'brass' },
    { use: 'p.contour', on: 'leg', from: [0, .86], to: [0, 1.2], width: 34, color: 'suitLight', mat: 'leather', pipe: 'brass', sharp: .45, off: .012 },
    { use: 'p.contour', on: 'leg', from: [150, 1.12], to: [176, 1.74], width: 30, bow: 10, color: 'suitLight', pipe: 'brass' },
    { use: 'p.contour', on: 'arm', from: [70, .1], to: [100, .86], width: 34, bow: 8, color: 'suitLight', pipe: 'brass' },
    { use: 'p.contour', on: 'trunk', from: [150, ['chest', .06]], to: [166, ['belt', .02]], width: 14, bow: -8, color: 'suitLight', pipe: 'brass' },
    { use: 'a/lines', on: 'trunk', both: true, paths: [[[10, 'base-.02'], [30, 'chest'], [12, 'waist'], [22, 'belt-.03'], [44, 'hip-.02']], [[34, 'shoulder-.03'], [52, 'chest+.02'], [58, 'ribs']]], color: 'brass', mat: 'brass', width: .003, thick: .0014, off: .006, name: 'piping' },
    { use: 'a/lines', on: 'leg', paths: [[[20, .06], [8, .5], [26, .86]], [[20, 1.22], [-6, 1.5], [8, 1.86]], [[180, .1], [172, .5], [180, .86]]], color: 'brass', mat: 'brass', width: .003, thick: .0014, off: .006, name: 'piping' },
    { use: 'a/lines', on: 'arm', paths: [[[10, .14], [-4, .5], [12, .9]], [[150, 1.06], [170, 1.5], [158, 1.9]]], color: 'brass', mat: 'brass', width: .003, thick: .0014, off: .006, name: 'piping' },
    { use: 'b.neck', color: 'suitDark', mat: 'cloth', off: .005 },
    { use: 'a/collar', color: 'suitDark', height: .085, flare: .004, off: .009 },
    { use: 'a/helm', color: 'suit', visor: 'visor', trim: 'brass', crest: null, under: 'green', band: 'brass' },
    // Layered shell crest (head units): a broad bill plate swept from the crown out over the visor to a point, a
    // cheek plate down each side swept back to a tail, a rear plate kicked up behind the crown, and the sea-green
    // fin standing between them.
    { use: 'p.shell', name: 'crest', on: { head: true }, color: 'nacre', dark: 'nacreWarm', mat: 'nacre', edge: 'brass', edgeMat: 'brass', thick: .03, plates: [
      { spine: [[0, .5, -.5], [0, .68, -.12], [0, .66, .3], [0, .5, .66], [0, .34, .92]], width: [[0, .2], [.25, .5], [.55, .56], [.8, .36], [1, .02]], cup: .42, ribs: 5, ribDepth: .03, ridge: .05, nu: 8, nv: 16 },
      { spine: [[0, .66, -.1], [0, .62, -.6], [0, .74, -1.08]], width: [[0, .4], [.5, .36], [1, .02]], cup: .5, ribs: 3, ribDepth: .025, ridge: .04 },
      { spine: [[0, .7, -.42], [0, .8, -.05], [0, .76, .3], [0, .66, .58]], width: [[0, .14], [.35, .34], [.7, .28], [1, .02]], cup: .4, ribs: 3, ribDepth: .025, ridge: .04 },
    ] },
    { use: 'p.shell', name: 'crest', on: { head: true }, side: 'both', color: 'nacre', dark: 'nacreWarm', mat: 'nacre', edge: 'brass', edgeMat: 'brass', thick: .03, plates: [
      { spine: [[.5, .34, .42], [.6, .2, .05], [.58, .1, -.4], [.46, .16, -.86]], across: [0, 1, 0], width: [[0, .1], [.3, .26], [.65, .24], [1, .02]], cup: .3, ribs: 3, ribDepth: .025 },
    ] },
    { use: 'p.shell', name: 'crest', on: { head: true }, color: 'green', dark: 'greenDark', mat: 'nacre', thick: .02, plates: [
      { spine: [[0, .7, .2], [0, .84, -.3], [0, .78, -.9]], across: [0, 1, 0], width: [[0, .02], [.4, .13], [.8, .1], [1, .01]], cup: 0 },
    ] },
    // Layered shell pauldron on the right shoulder, hung on a brass boss and a strap across the chest.
    { use: 'strap', color: 'leather', width: .018, thick: .004, anchor: { at: .2, size: .012, color: 'brass' }, path: [
      { th: -50, y: 'shoulder', dy: -.03, off: .013 }, { th: 24, y: 'ribs', dy: .02, off: .014 }, { th: 92, y: 'waist', dy: .01, off: .014 },
      { th: 168, y: 'ribs', dy: .0, off: .014 }, { th: 228, y: 'shoulder', dy: -.03, off: .013 }, { th: 270, y: 'shoulder', dy: .004, off: .014 } ] },
    { use: 'p.scallops', side: 'R', tiers: 3, size: [.15, .1, .145], shift: [.005, .035, 0], step: .06, out: .034, ribs: 7, ribDepth: .013, scallop: .2, flare: .034, color: 'nacre', dark: 'nacreWarm', mat: 'nacre', rim: 'brass', rimMat: 'brass' },
    { use: 'x.shards', at: -62, arc: 30, from: ['shoulder', .03], to: ['armpit', .01], rows: 2, cols: 2, off: .014, thick: .007, lift: .02, jitter: .2, round: .92, overlap: .7, ridge: .01, color: 'nacre', dark: 'nacreWarm', mat: 'nacre', rim: 'brass', rimMat: 'brass', seed: 9 },
    { use: 'b.studs', on: 'trunk', at: [[['chest', .03], 2]], r: .02, height: .008, off: .016, color: 'brass', mat: 'brass', rim: 'brass', rimMat: 'brass' },
    { use: 'strap', color: 'leather', width: .018, thick: .004, path: [
      { th: 50, y: 'shoulder', dy: -.03, off: .013 }, { th: -24, y: 'ribs', dy: .02, off: .014 }, { th: -92, y: 'waist', dy: .01, off: .014 },
      { th: -168, y: 'ribs', dy: .0, off: .014 }, { th: -228, y: 'shoulder', dy: -.03, off: .013 }, { th: -270, y: 'shoulder', dy: .004, off: .014 } ] },
    { use: 'band', limb: 'arm', at: .62, width: .014, off: .006, thick: .004, color: 'brass', mat: 'iron' },
    { use: 'band', limb: 'arm', at: 1.22, width: .014, off: .006, thick: .004, color: 'brass', mat: 'iron' },
    { use: 'band', limb: 'arm', at: 1.82, width: .014, off: .006, thick: .004, color: 'brass', mat: 'iron' },
    { use: 'b.guard', limb: 'arm', from: 1.24, to: 1.82, phi: 95, arc: 82, off: .008, thick: .008, bulge: .006, ridge: .006, flare: .008, color: 'nacre', mat: 'nacre', trim: 'brass', trimMat: 'brass', trimWidth: .006 },
    // Fin blades: one swept off the back of each forearm past the elbow.
    { use: 'p.shell', name: 'fins', side: 'both', on: { limb: 'arm', t: 1.74, phi: 150, off: .004 }, nu: 4, nv: 9, thick: .012, edge: 'brass', edgeMat: 'brass', plates: [
      { spine: [[0, 0, 0], [0, .1, .035], [0, .2, .1], [0, .27, .19]], width: [[0, .03], [.3, .042], [.7, .03], [1, .003]], cup: .5, ridge: .008, color: 'nacre', dark: 'nacreWarm', mat: 'nacre' },
      { spine: [[.012, .0, 0], [.016, .08, .02], [.02, .15, .065]], width: [[0, .022], [.4, .03], [1, .003]], cup: .4, color: 'green', dark: 'greenDark', mat: 'nacre', edge: null } ] },
    // Knee caps, hip straps.
    { use: 'band', limb: 'leg', at: .2, width: .016, off: .006, thick: .004, color: 'leather', mat: 'leather' },
    // Sealed reservoir on the back.
    { use: 'a/kit', name: 'reservoir', on: 'trunk', y: 'ribs+.03', th: 180, off: .012, bone: 'spine1', items: [
      { s: 'ball', size: [.058, .086, .042], at: [0, 0, .03], color: 'glass', mat: 'glass', seg: 16, rows: 9 }, { s: 'ring', rx: .06, ry: .088, r: .0085, at: [0, 0, .03], color: 'brass', mat: 'brass', seg: 24 },
      { s: 'cyl', r: .018, h: .022, rot: [-90, 0, 0], at: [0, .084, .03], color: 'brass', mat: 'brass' }, { s: 'cyl', r: .014, h: .016, rot: [90, 0, 0], at: [0, -.086, .03], color: 'brass', mat: 'brass' },
      { s: 'box', size: [.012, .05, .004], at: [-.03, .13, .006], rot: [0, 0, 24], color: 'leather', mat: 'leather' }, { s: 'box', size: [.012, .05, .004], at: [.03, .13, .006], rot: [0, 0, -24], color: 'leather', mat: 'leather' },
      { s: 'box', size: [.075, .01, .005], at: [0, -.05, .008], color: 'leather', mat: 'leather' } ] },
    { use: 'belt', color: 'leather', buckle: 'brass', height: .022, thick: .005, off: .011, buckleSize: [.016, .014], keepers: [], tilt: -.014 },
    // Swept calf fins, brass anklets, brass-capped boots.
    { use: 'p.shell', name: 'fins', side: 'both', on: { limb: 'leg', t: 1.88, phi: 128, off: .0 }, nu: 4, nv: 10, thick: .014, edge: 'brass', edgeMat: 'brass', plates: [
      { spine: [[0, 0, 0], [0, .1, .03], [0, .2, .075], [0, .28, .14]], width: [[0, .04], [.3, .058], [.7, .04], [1, .004]], cup: .5, ridge: .01, color: 'nacre', dark: 'nacreWarm', mat: 'nacre' },
      { spine: [[-.03, .0, -.01], [-.04, .08, .02], [-.05, .16, .06], [-.055, .21, .11]], width: [[0, .034], [.35, .046], [1, .004]], cup: .45, ridge: .008, color: 'green', dark: 'greenDark', mat: 'nacre' },
      { spine: [[.03, .0, -.01], [.04, .07, .015], [.05, .13, .05], [.055, .17, .09]], width: [[0, .03], [.35, .04], [1, .004]], cup: .45, color: 'greenDark', dark: 'greenDark', mat: 'nacre', edge: null } ] },
    { use: 'band', limb: 'leg', at: 1.84, width: .022, off: .008, thick: .005, color: 'brass', mat: 'iron' },
    { use: 'boots', color: 'boot', sole: 'sole', top: 1.9, toeCap: 'brass', heelPlate: 'brass', plateMat: 'iron', straps: 1, strapColor: 'leather', buckle: 'brass', soleHeight: .03 },
    { use: 'gloveCuff', color: 'glove', from: 1.92, to: 2.05, off: .004 },
    { use: 'hands', glove: 'glove', scale: .95 },
  ],
};
