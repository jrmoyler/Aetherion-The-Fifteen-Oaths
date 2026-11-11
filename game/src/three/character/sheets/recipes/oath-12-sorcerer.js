// 12 SORCERER - BLOOD - Sanguine Covenant. Read from assets/references/reference-067 (burgundy brocade, charcoal
// wool, aged brass, blood glass; attachments: shoulder vial, belt case).
import { C } from '../builders-c.js';

const bars = (n, r, h, y) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return { s: 'box', d: [.0035, h, .0035], at: [Math.cos(a) * r, y, Math.sin(a) * r], rot: [0, -a * 180 / Math.PI, 0], c: 'brass', m: 'brass' }; });
const shoulderStrap = (s) => ({ use: 'strap', color: 'leather', closed: false, width: .026, n: 30, anchor: { at: .2, size: .016, color: 'brass' }, path: [
  { th: s * 30, y: 'belt', dy: .05, off: .03 }, { th: s * 30, y: 'chest', dy: 0, off: .03 }, { th: s * 40, y: 'armpit', dy: .03, off: .026 }, { th: s * 66, y: 'shoulder', dy: .012, off: .024 },
  { th: s * 116, y: 'shoulder', dy: .012, off: .024 }, { th: s * 150, y: 'armpit', dy: .02, off: .026 }, { th: s * 172, y: 'chest', dy: 0, off: .03 } ] });

export default {
  id: 'oath-12-sorcerer', sheet: 'reference-067', title: 'Sanguine Sorcerer',
  palette: {
    cloth: '#5a1f24', burgundy: '#5a1f24', burgundyDark: '#3e1519', brocade: '#6b252a', charcoal: '#322d2c', charcoalDark: '#262222', brass: '#a8844a', brassDark: '#6f5730',
    blood: '#8f1218', bloodGlow: '#c2161d', leather: '#3a2c26', leatherDark: '#2a211e', iron: '#a8844a', boot: '#2b2320', sole: '#3a2d24', hair: '#1b1614', hairWarm: '#3a2a20', bead: '#b08c4c',
  },
  build: { width: 1.06, depth: 1.06, bust: .022, waist: 1.04, hips: 1.14, arm: 1.0, leg: 1.04, neck: .95 },
  keep: ['weapon'],
  builders: C,
  groom: { hair: false, gear: false },
  parts: [
    { use: 'neck' },
    { use: 'skinLimb', limb: 'arm', from: 1.6, to: 2.03 },
    { use: 'shirt', color: 'burgundy', sleeve: .7, flare: .012, off: .011, cap: .012, slack: .003 },
    { use: 'c:bellSleeve', color: 'burgundy', lining: 'burgundyDark', trim: 'brass', trimMat: 'brass', trimWidth: .006, from: .5, to: 1.8, wide: .075, drop: .09 },
    // Charcoal over-vest showing at the shoulders.
    { use: 'c:bellSleeve', name: 'shoulder', color: 'charcoal', trim: 'brassDark', trimMat: 'brass', trimWidth: .005, from: -.13, to: .26, wide: .014, drop: 0, off: .02, power: 1 },
    // Wrap-over robe front, left over right, piped in brass.
    { use: 'c:patch', color: 'burgundyDark', trim: 'brass', trimMat: 'brass', trimWidth: .004, edges: [1], off: .012, quads: [[[-64, 'shoulder', -.012], [-13, 'base', -.012], [-16, 'ribs', 0], [-72, 'belt', .06]]] },
    { use: 'c:patch', color: 'brocade', trim: 'brass', trimMat: 'brass', trimWidth: .004, edges: [3], off: .016, quads: [[[13, 'base', -.012], [64, 'shoulder', -.012], [72, 'belt', .06], [-34, 'belt', .06]]] },
    shoulderStrap(1), shoulderStrap(-1),
    // Long robe: charcoal under-skirt, burgundy coat open at the front, and the brocade apron cut on the diagonal.
    { use: 'c:drape', color: 'charcoalDark', hem: .16, flare: 1.14, off: .01, clear: .016, folds: 11 },
    { use: 'c:drape', from: -30, to: 12, hem: .3, off: .018, color: 'charcoal', flare: 1.08, clear: .02, trim: 'brassDark', trimMat: 'brass', trimWidth: .005 },
    { use: 'c:drape', from: 20, to: 340, hem: [[20, .1], [90, .13], [180, .09], [270, .13], [340, .1]], off: .028, color: 'burgundy', lining: 'burgundyDark', flare: 1.3, clear: .034, trim: 'brass', trimMat: 'brass', trimWidth: .006 },
    { use: 'c:drape', from: -40, to: 34, hem: [[-40, .28], [34, .46]], off: .036, color: 'brocade', flare: 1.1, clear: .04, fold: .01, trim: 'brass', trimMat: 'brass', trimWidth: .006 },
    { use: 'c:drape', from: 150, to: 210, hem: .2, off: .035, color: 'brocade', flare: 1.24, clear: .04, fold: .01, trim: 'brass', trimMat: 'brass', trimWidth: .006 },
    // Wide belt, two crossing straps and the brass-bound case on the left hip.
    { use: 'belt', rise: .01, height: .058, thick: .009, off: .04, color: 'leather', buckle: 'brass', keepers: [40, -40, 140, -140], buckleSize: [.028, .026] },
    { use: 'belt', rise: -.035, height: .018, thick: .005, off: .046, color: 'leatherDark', buckle: null, keepers: [], tilt: .028 },
    { use: 'belt', rise: .048, height: .014, thick: .005, off: .044, color: 'leatherDark', buckle: null, keepers: [] },
    { use: 'c:kit', name: 'case', on: { y: 'belt', dy: -.085, th: 58, off: .05, skin: 'hips' }, parts: [
      { s: 'rbox', d: [.034, .058, .02, .005], c: 'leatherDark', m: 'leather' },
      { s: 'rbox', d: [.037, .008, .023, .003], at: [0, .05, 0], c: 'brass', m: 'brass' }, { s: 'rbox', d: [.037, .008, .023, .003], at: [0, -.05, 0], c: 'brass', m: 'brass' },
      { s: 'rbox', d: [.006, .06, .023, .003], at: [.032, 0, 0], c: 'brass', m: 'brass' }, { s: 'rbox', d: [.006, .06, .023, .003], at: [-.032, 0, 0], c: 'brass', m: 'brass' },
      { s: 'rbox', d: [.011, .014, .004, .002], at: [0, .012, .022], c: 'brass', m: 'brass' },
      { s: 'rbox', d: [.009, .04, .004, .002], at: [.016, .09, -.006], c: 'leather', m: 'leather' }, { s: 'rbox', d: [.009, .04, .004, .002], at: [-.016, .09, -.006], c: 'leather', m: 'leather' },
    ] },
    // Blood vials caged in brass on each shoulder, fed by tubes that arch over to the harness ring on the back.
    { use: 'c:kit', name: 'vial', side: 'both', on: { limb: 'arm', t: .3, phi: 96, off: .05, skin: 'upperarm.L' }, parts: [
      { s: 'cyl', d: [.031, .052, .031, 14], c: 'blood', m: 'glass' },
      { s: 'cyl', d: [.036, .009, .036, 14], at: [0, .055, 0], c: 'brass', m: 'brass' }, { s: 'cyl', d: [.036, .009, .036, 14], at: [0, -.055, 0], c: 'brass', m: 'brass' },
      { s: 'cyl', d: [.034, .005, .034, 14], at: [0, .012, 0], c: 'brass', m: 'brass' },
      { s: 'cyl', d: [.024, .008, .016, 10], at: [0, .07, 0], c: 'brassDark', m: 'brass' }, { s: 'cyl', d: [.016, .008, .024, 10], at: [0, -.07, 0], c: 'brassDark', m: 'brass' },
      ...bars(6, .034, .05, 0),
    ] },
    { use: 'c:hose', name: 'tube', side: 'both', r: .011, color: 'bloodGlow', mat: 'enamel', seg: 8, path: [
      { on: { limb: 'arm', t: .3, phi: 96, off: .05, skin: 'upperarm.L' }, at: [0, .075, 0] }, { on: { bone: 'spine2', at: [.245, .2, -.0] } }, { on: { bone: 'spine2', at: [.19, .3, -.03] } },
      { on: { bone: 'spine2', at: [.115, .25, -.08] } }, { on: { bone: 'spine2', at: [.085, .14, -.125] } },
    ] },
    { use: 'c:kit', name: 'harness', on: { y: 'chest', dy: .06, th: 180, off: .03, skin: 'spine2' }, parts: [
      { s: 'ring', d: [.03, .03, .0055, 18, 6], c: 'brass', m: 'brass' }, { s: 'rbox', d: [.012, .07, .004, .002], at: [0, -.1, -.004], c: 'leather', m: 'leather' },
      { s: 'rbox', d: [.014, .012, .006, .002], at: [0, -.05, 0], c: 'brass', m: 'brass' },
      { s: 'ring', d: [.014, .014, .004, 12, 5], at: [.07, .035, 0], c: 'brass', m: 'brass' }, { s: 'ring', d: [.014, .014, .004, 12, 5], at: [-.07, .035, 0], c: 'brass', m: 'brass' },
    ] },
    { use: 'c:collar', color: 'burgundy', lining: 'brocade', trim: 'brass', trimMat: 'brass', height: .07, back: .012, tip: .01, flare: .04, gap: 34, off: .014 },
    { use: 'hands' },
    { use: 'boots', top: 1.56, straps: 3, strapColor: 'leather', buckle: 'brass', toeCap: 'brassDark', heelPlate: 'brassDark', plateMat: 'iron', soleHeight: .034 },
    // Braids drawn back into a low knot, with brass beads and earrings.
    { use: 'hair', style: 'bun', streak: 'hairWarm', fringe: .34, knot: { at: [0, -.04, -.5], radius: .15, tie: 'bead' } },
    { use: 'c:kit', name: 'earring', side: 'both', on: { head: [.35, -.2, -.02] }, parts: [{ s: 'ring', d: [.022, .022, .006, 10, 5], rot: [0, 90, 0], c: 'bead', m: 'brass' }] },
  ],
};
