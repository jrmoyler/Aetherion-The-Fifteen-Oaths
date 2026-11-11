// 03 SORCERER - LIGHTNING - Storm Relay. Read from assets/references/reference-087 (insulating navy cloth,
// oxidized copper, matte white ceramic; insulated antenna joints on the collar, strap-and-clasp belt mount).
import { A } from '../builders-a.js';

const antenna = (pts, r = .028) => [
  { s: 'tube', pts, r: .0125, color: 'tube', mat: 'steel', sides: 8, per: 6 },
  { s: 'cyl', r: .017, h: .03, rot: [-90, 0, 0], at: [pts[4][0], pts[4][1] - .012, pts[4][2]], color: 'copper', mat: 'copper', sides: 10 },
  { s: 'ball', r, at: [pts[4][0], pts[4][1] + .04, pts[4][2]], color: 'ceramic', mat: 'glazed' },
  { s: 'cyl', r: .019, h: .022, rot: [0, 90, 0], at: [pts[0][0] - .004, pts[0][1], pts[0][2]], color: 'copper', mat: 'copper', sides: 10 },
];
const pocket = [
  { s: 'box', size: [.052, .062, .016], color: 'navy', mat: 'cloth', r: .007 }, { s: 'box', size: [.055, .022, .019], at: [0, .046, 0], color: 'navyDark', mat: 'cloth', r: .006 },
  { s: 'box', size: [.055, .0045, .0205], at: [0, .026, 0], color: 'copper', mat: 'copper', r: .002 }, { s: 'dome', r: .006, at: [0, .04, .019], color: 'copper', mat: 'copper' },
];
const pouch = [{ s: 'box', size: [.03, .036, .017], color: 'leather', mat: 'leather', r: .007 }, { s: 'box', size: [.032, .014, .019], at: [0, .026, 0], color: 'webbing', mat: 'leather', r: .005 }, { s: 'dome', r: .005, at: [0, .016, .019], color: 'copper', mat: 'copper' }];

export default {
  id: 'oath-03-sorcerer', sheet: 'reference-087', title: 'Storm Sorcerer',
  palette: {
    navy: '#1c2236', navyDark: '#131829', cloth: '#1c2236', copper: '#aa663b', iron: '#aa663b', tube: '#2b2a2c', ceramic: '#dbd7cb', webbing: '#19191b', leather: '#241f1c', leatherDark: '#161312',
    glove: '#1c1c1f', boot: '#d6d2c6', sole: '#151515', hair: '#17141a', tie: '#17141a',
  },
  build: { width: 1.36, depth: 1.5, belly: .055, bust: .035, hips: 1.3, waist: 1.36, arm: 1.32, leg: 1.4, neck: 1.15, shoulder: 1.1 },
  keep: ['weapon'],
  builders: A,
  groom: { hair: false, gear: false },
  parts: [
    { use: 'neck' },
    { use: 'shirt', color: 'navyDark', sleeve: 1.32, flare: .012, off: .01, slack: .004, cap: .014 },
    { use: 'trousers', color: 'navy', gather: 1.6, bag: .046, pleats: 9, pipingPaths: [] },
    { use: 'a/kit', name: 'pockets', on: 'leg', side: 'both', t: .62, phi: 92, off: .043, items: pocket },
    { use: 'a/lines', on: 'leg', paths: [[[30, .0], [26, .7], [24, 1.5]]], color: 'copper', width: .003, off: .05, name: 'stitching' },
    { use: 'belt', color: 'webbing', buckle: 'copper', height: .052, off: .03, buckleSize: [.026, .03], keepers: [26, -26, 154, -154] },
    { use: 'a/kit', name: 'pouches', on: 'trunk', side: 'both', y: 'belt-.012', th: 58, off: .04, items: pouch },
    { use: 'a/kit', name: 'pouches', on: 'trunk', side: 'both', y: 'belt-.012', th: 128, off: .04, items: pouch },
    // Insulating cape under the riveted copper collar, with four antennae standing off its back.
    { use: 'capelet', color: 'navy', trim: 'copper', long: .44, short: .44, toward: 0, trimWidth: .014, ripple: .012 },
    { use: 'a/collar', color: 'navyDark', height: .06, flare: .004, off: .012 },
    { use: 'a/yoke', color: 'copper', mat: 'copper', inner: .082, outer: .2, off: .034, thick: .014, drop: .8, rivets: 14, rivetColor: 'tube' },
    { use: 'a/kit', name: 'antennae', on: 'trunk', side: 'both', y: 'shoulder+.03', th: 180, off: .03, bone: 'spine2', items: [
      ...antenna([[.06, .0, .0], [.13, -.02, .045], [.185, .03, .06], [.2, .16, .055], [.2, .27, .05]]),
      ...antenna([[.1, -.03, -.01], [.2, -.06, .03], [.29, -.03, .045], [.325, .07, .04], [.33, .16, .035]]) ] },
    // White ceramic forearm guards banded in copper.
    { use: 'band', limb: 'arm', at: 1.56, width: .15, off: .012, thick: .012, color: 'ceramic', mat: 'ceramic' },
    { use: 'band', limb: 'arm', at: 1.33, width: .024, off: .017, thick: .01, color: 'copper', mat: 'iron' },
    { use: 'band', limb: 'arm', at: 1.8, width: .024, off: .014, thick: .01, color: 'copper', mat: 'iron' },
    { use: 'band', limb: 'arm', at: 1.2, width: .05, off: .011, thick: .008, color: 'leather', mat: 'leather' },
    { use: 'gloveCuff', color: 'glove', from: 1.86, to: 2.05, off: .012, strap: 'leatherDark' },
    // Ceramic-shafted boots on heavy black soles, copper banded, with a copper boss at the ankle.
    { use: 'boots', color: 'boot', sole: 'sole', top: 1.44, toeCap: 'ceramic', heelPlate: 'webbing', cuff: 'copper', plateMat: 'ceramic', straps: 3, strapColor: 'copper', buckle: 'copper', bulk: 1.42, soleHeight: .052 },
    { use: 'a/kit', name: 'ankle', on: 'foot', side: 'both', at: [.058, .105, -.012], items: [
      { s: 'cyl', r: .03, h: .014, rot: [0, 90, 0], color: 'copper', mat: 'copper' }, { s: 'cyl', r: .016, h: .02, rot: [0, 90, 0], color: 'tube', mat: 'steel', sides: 10 } ] },
    { use: 'hair', style: 'bun', color: 'hair', knot: { at: [0, .5, -.1], radius: .2, tie: 'tie' } },
    { use: 'hands', glove: 'glove', fingerless: true, scale: 1.1 },
  ],
};
