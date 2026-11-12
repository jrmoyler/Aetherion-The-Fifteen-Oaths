// 10 SORCERER - COSMIC & GRAVITY - Tidal Observatory. Read from assets/references/reference-072 (front, back,
// side, three-quarter, face, materials: midnight blue wool, violet enamel, antique brushed silver; astrolabe
// collar pivot and the belt centrepiece).
import { B } from '../builders-b.js';

export default {
  id: 'oath-10-sorcerer', sheet: 'reference-072', title: 'Tidal Sorcerer',
  palette: {
    cloth: '#1a1f38', navy: '#1a1f38', navyDark: '#12162a', cream: '#cfc5ae', silver: '#9a968c', silverDark: '#6e6a62', gold: '#a88a48', violet: '#4a2c8e',
    black: '#1c1b1e', leather: '#3a2c22', leatherDark: '#261d18', iron: '#9a968c', boot: '#262224', bootCap: '#6e6a62', sole: '#151314', hair: '#1d1917', hairGrey: '#4a4644', tie: '#9a968c',
  },
  build: { width: 1.3, depth: 1.36, belly: .04, bust: .03, hips: 1.2, waist: 1.22, arm: 1.22, leg: 1.16, neck: 1.1, shoulder: 1.06 },
  keep: ['weapon'],
  builders: B,
  groom: { hair: false, gear: false, beard: false },
  parts: [
    { use: 'b.neck' },
    { use: 'trousers', color: 'black', gather: 1.76, bag: .04, pleats: 9, pockets: [], from: 1.0 },
    { use: 'boots', top: 1.7, color: 'boot', sole: 'sole', toeCap: 'bootCap', plateMat: 'iron', straps: 3, strapColor: 'leatherDark', buckle: 'gold', bulk: 1.2, cuff: 'bootCap', soleHeight: .042 },
    // Midnight wool robe: bell skirt banded in silver, wide banded sleeves, pointed shoulders.
    { use: 'b.torso', from: ['belt', -.03], to: 'base', color: 'navy', off: .016, slack: .002 },
    { use: 'b.coat', color: 'navy', top: 'belt', hem: .44, flare: 1.72, off: .028, folds: 6, lining: 'navyDark', trim: 'silver', trimMat: 'silver', trimWidth: .02 },
    { use: 'b.sleeve', from: -.14, to: 1.52, off: .014, color: 'navy', shape: [[0, .02], [.7, .045], [1.52, .085]], droop: .4, lining: 'navyDark', trim: 'silver', trimWidth: .02, folds: .002 },
    { use: 'b.studs', on: 'arm', at: [[.7, 40], [.95, 80], [1.2, 30], [1.05, 120], [1.35, 70], [.85, 150], [1.3, 130]], r: .0055, off: .05, color: 'gold', mat: 'gold' },
    { use: 'b.wing', span: .06, depth: .13, tipDepth: .05, rise: -.0, inset: .4, lift: .04, color: 'navy', trim: 'silver', trimMat: 'silver', trimWidth: .012, thick: .008 },
    // Cream centre panel inlaid with orbit marks; silver straps with violet inlay down the skirt.
    { use: 'b.hang', at: 0, top: ['base', -.05], bottom: .47, width: [.04, .062], color: 'cream', border: 'silver', borderWidth: .008, thick: .005, off: .006, ornaments: [
      { color: 'silver', ring: .024, width: .003, at: [0, .7] }, { color: 'silver', ring: .012, width: .003, at: [0, .7] }, { color: 'silver', bar: [0, .5, 0, .96], width: .003 }, { color: 'silver', disc: .008, at: [0, .88] }, { color: 'silver', bar: [-.55, .7, .55, .7], width: .003 }, { color: 'silver', disc: .007, at: [0, .2] } ] },
    { use: 'b.hang', at: 180, top: ['belt', .0], bottom: .47, width: [.03, .05], color: 'navyDark', border: 'silver', borderWidth: .006, thick: .004, off: .006, ornaments: [
      { color: 'gold', mat: 'gold', ring: .03, width: .003, at: [0, .62] }, { color: 'gold', mat: 'gold', ring: .015, width: .003, at: [0, .62] }, { color: 'gold', mat: 'gold', bar: [0, .2, 0, .95], width: .003 }, { color: 'gold', mat: 'gold', disc: .007, at: [0, .62] } ] },
    ...[38, -38, 96, -96, 146, -146].map((at) => ({ use: 'b.hang', at, top: ['belt', -.02], bottom: .47, width: [.012, .014], color: 'silver', mat: 'silver', thick: .006, off: .008, ornaments: [
      { color: 'violet', mat: 'enamel', bar: [0, .08, 0, .5], width: .005 }, { color: 'silverDark', mat: 'silver', disc: .02, at: [0, .62] }, { color: 'violet', mat: 'enamel', bar: [0, .72, 0, .95], width: .005 } ] })),
    // Silver belt with the orb centrepiece, the astrolabe collar, the weights on the hem.
    { use: 'b.sash', color: 'silver', mat: 'silver', bands: [{ y: 'belt', h: .05, off: .034, thick: .008, wobble: 0 }, { y: ['belt', .028], h: .008, off: .044, thick: .004, wobble: 0, color: 'silverDark' }, { y: ['belt', -.028], h: .008, off: .044, thick: .004, wobble: 0, color: 'silverDark' }, { y: 'belt', h: .014, off: .0435, thick: .002, wobble: 0, color: 'violet', mat: 'enamel' }] },
    { use: 'b.orb', off: .046, r: .052 },
    { use: 'b.orb', at: 180, off: .046, r: .03, tag: false },
    { use: 'b.astrolabe', reach: .36, radius: .165 },
    { use: 'b.hemOrbs', r: .06, drop: .03 },
    { use: 'hair', style: 'updo', streak: 'hairGrey', grey: .45, fringe: .34, count: 70, knot: { at: [0, .55, -.12], radius: .17, kind: 'coil', tie: 'tie' }, tendrils: [[72, .15, .14], [-72, .15, .14]] },
    { use: 'hands' },
  ],
};
