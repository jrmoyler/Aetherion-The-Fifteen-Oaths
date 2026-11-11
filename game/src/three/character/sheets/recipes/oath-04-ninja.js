// 04 NINJA - WATER - Tidal Covenant. Read from assets/references/reference-084 (deep petroleum blue 60%, pearly
// shell 30%, sea green 10%; woven diving cloth, nacre shell plate, sealed reservoir, worn brass fittings; right
// shoulder plate mount, reservoir mount on the back).
import { A } from '../builders-a.js';

const shell = (y, r, tilt, spread = 150) => ({ s: 'fan', r, spread, ribs: 9, bulge: .22, curl: .55, rot: [tilt, 0, 180], at: [0, y, .0], color: 'nacre', mat: 'nacre' });

export default {
  id: 'oath-04-ninja', sheet: 'reference-084', title: 'Tidal Ninja',
  palette: {
    suit: '#1a2848', suitDark: '#111a31', green: '#4a877d', brass: '#b28c47', iron: '#b28c47', nacre: '#e9dfcf', visor: '#12333c', glass: '#3c95a0', leather: '#3b2d21', leatherDark: '#241b14',
    boot: '#18243f', sole: '#0f1626', glove: '#16213c',
  },
  build: { hips: 1.16, waist: .98, bust: .03, leg: 1.12, arm: .98 },
  keep: ['weapon'],
  builders: A,
  groom: { hair: false, gear: false },
  parts: [
    { use: 'a/bodysuit', color: 'suit', trunk: ['crotch', 'base'], arms: [-.14, 1.98], legs: [-.155, 1.92], off: .005, zones: [
      { on: 'leg', a: [38, 150], b: [.06, .9], color: 'green' }, { on: 'leg', a: [100, 175], b: [1.12, 1.6], color: 'green' },
      { on: 'trunk', both: true, a: [68, 118], b: ['waist-.02', 'armpit-.01'], color: 'green' }, { on: 'arm', a: [-160, -60], b: [.2, .9], color: 'green' } ] },
    { use: 'a/lines', on: 'leg', paths: [[[36, .04], [30, .45], [38, .9]], [[152, .04], [154, .9]], [[36, .04], [95, -.04], [152, .04]], [[38, .9], [95, .96], [154, .9]], [[98, 1.12], [100, 1.6]], [[20, 1.05], [-10, 1.4], [10, 1.85]]], color: 'brass', mat: 'brass', width: .0035, thick: .0015, off: .006, name: 'piping' },
    { use: 'a/lines', on: 'trunk', both: true, paths: [[[66, 'waist-.02'], [64, 'ribs'], [68, 'armpit-.01']], [[14, 'belt'], [26, 'ribs'], [20, 'chest'], [34, 'shoulder-.04']], [[160, 'belt'], [168, 'chest'], [150, 'shoulder-.04']]], color: 'brass', mat: 'brass', width: .0035, thick: .0015, off: .006, name: 'piping' },
    { use: 'a/collar', color: 'suitDark', height: .085, flare: .004, off: .009 },
    { use: 'a/helm', color: 'suit', visor: 'visor', trim: 'brass', crest: 'nacre', under: 'green', band: 'brass' },
    // Layered shell pauldron on the right shoulder, hung on a brass boss and a strap across the chest.
    { use: 'strap', color: 'leather', width: .018, thick: .004, anchor: { at: .2, size: .012, color: 'brass' }, path: [
      { th: -50, y: 'shoulder', dy: -.03, off: .013 }, { th: 24, y: 'ribs', dy: .02, off: .014 }, { th: 92, y: 'waist', dy: .01, off: .014 },
      { th: 168, y: 'ribs', dy: .0, off: .014 }, { th: 228, y: 'shoulder', dy: -.03, off: .013 }, { th: 270, y: 'shoulder', dy: .004, off: .014 } ] },
    { use: 'a/kit', name: 'pauldron', on: 'arm', side: 'R', t: .06, phi: 86, off: .012, items: [
      shell(-.03, .115, -3, 125), shell(.025, .12, -7, 140), shell(.08, .115, -12, 150),
      { s: 'cyl', r: .019, h: .012, at: [0, .07, .012], rot: [-12, 0, 0], color: 'brass', mat: 'brass' }, { s: 'dome', r: .009, at: [0, .068, .024], rot: [-12, 0, 0], color: 'brass', mat: 'brass' } ] },
    { use: 'band', limb: 'arm', at: .62, width: .014, off: .006, thick: .004, color: 'brass', mat: 'iron' },
    { use: 'band', limb: 'arm', at: 1.22, width: .014, off: .006, thick: .004, color: 'brass', mat: 'iron' },
    { use: 'band', limb: 'arm', at: 1.82, width: .014, off: .006, thick: .004, color: 'brass', mat: 'iron' },
    { use: 'a/plates', on: 'arm', list: [{ at: [95, 1.52], size: [.066, .15] }], color: 'nacre', mat: 'nacre', border: 'brass', borderMat: 'brass', borderWidth: .006, thick: .012, off: .008, r: .018, name: 'vambrace' },
    // Sealed reservoir on the back.
    { use: 'a/kit', name: 'reservoir', on: 'trunk', y: 'ribs+.03', th: 180, off: .012, bone: 'spine1', items: [
      { s: 'ball', size: [.058, .086, .042], at: [0, 0, .03], color: 'glass', mat: 'glass', seg: 16, rows: 9 }, { s: 'ring', rx: .06, ry: .088, r: .0085, at: [0, 0, .03], color: 'brass', mat: 'brass', seg: 24 },
      { s: 'cyl', r: .018, h: .022, rot: [-90, 0, 0], at: [0, .084, .03], color: 'brass', mat: 'brass' }, { s: 'cyl', r: .014, h: .016, rot: [90, 0, 0], at: [0, -.086, .03], color: 'brass', mat: 'brass' },
      { s: 'box', size: [.012, .05, .004], at: [-.03, .13, .006], rot: [0, 0, 24], color: 'leather', mat: 'leather' }, { s: 'box', size: [.012, .05, .004], at: [.03, .13, .006], rot: [0, 0, -24], color: 'leather', mat: 'leather' },
      { s: 'box', size: [.075, .01, .005], at: [0, -.05, .008], color: 'leather', mat: 'leather' } ] },
    { use: 'belt', color: 'leather', buckle: 'brass', height: .022, thick: .005, off: .011, buckleSize: [.016, .014], keepers: [], tilt: -.014 },
    // Swept calf fins, brass anklets, brass-capped boots.
    { use: 'a/kit', name: 'fins', on: 'leg', side: 'both', t: 1.82, phi: 138, off: .0, items: [
      { s: 'leaf', len: .27, width: .085, thick: .012, bend: .1, base: .55, color: 'nacre', mat: 'nacre' }, { s: 'leaf', len: .2, width: .07, thick: .01, bend: .085, base: .55, at: [-.03, -.01, 0], rot: [0, 0, 10], color: 'green', mat: 'nacre' } ] },
    { use: 'band', limb: 'leg', at: 1.84, width: .022, off: .008, thick: .005, color: 'brass', mat: 'iron' },
    { use: 'boots', color: 'boot', sole: 'sole', top: 1.9, toeCap: 'brass', heelPlate: 'brass', plateMat: 'iron', straps: 1, strapColor: 'leather', buckle: 'brass', soleHeight: .03 },
    { use: 'gloveCuff', color: 'glove', from: 1.92, to: 2.05, off: .004 },
    { use: 'hands', glove: 'glove', scale: .95 },
  ],
};
