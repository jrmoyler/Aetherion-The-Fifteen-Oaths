// 11 NINJA - SHADOW & VOID - The Missing Court. Read from assets/references/reference-071 (front, back, side,
// three-quarter, face, materials: matte cloth black/grey, woven grey, gunmetal; attachments: thigh case, half mask).
import { C } from '../builders-c.js';

export default {
  id: 'oath-11-ninja', sheet: 'reference-071', title: 'Missing Court Ninja',
  palette: {
    cloth: '#252427', scarf: '#2a292c', grey: '#5d5c61', greyDark: '#47464b', wrap: '#222124', leather: '#34302e', leatherDark: '#262322', iron: '#5a5852',
    caseFace: '#2b2b2f', bone: '#d8d1c3', boot: '#1a1818', sole: '#3a2e24', glove: '#1b1a1b', hair: '#17151a', hairSheen: '#2b2830', tie: '#d9d3c8',
  },
  build: { width: .95, depth: .97, bust: .016, waist: .96, hips: 1.04, arm: .9, leg: .98, neck: .92 },
  keep: ['weapon'],
  builders: C,
  groom: { hair: false, gear: false },
  parts: [
    { use: 'skinLimb', limb: 'arm', from: .3, to: 1.05 },
    { use: 'shirt', sleeve: .5, flare: .014, cap: .008, slack: .003 },
    // Grey woven wrap-over front from the right shoulder to the left of the waist, and its strip over the shoulder.
    { use: 'c:patch', color: 'grey', trim: 'greyDark', trimWidth: .008, edges: [1], quads: [
      [[-78, 'armpit', .0], [-26, 'shoulder', .0], [34, 'belt', .05], [-84, 'belt', .05]],
      [[-112, 'shoulder', .012], [-58, 'shoulder', .012], [-52, 'armpit', .03], [-118, 'armpit', .03]],
      [[112, 'shoulder', .012], [150, 'shoulder', .0], [158, 'armpit', .0], [118, 'armpit', .03]],
    ] },
    { use: 'trousers', gather: 1.76, bag: .004, pleats: 4, pockets: [], cuff: .005 },
    // Bindings from above the elbow to the wrist with grey crossing bands.
    { use: 'wrap', limb: 'arm', from: .9, to: 1.94, color: 'wrap', off: .005, pitch: .024 },
    { use: 'band', limb: 'arm', at: 1.2, width: .016, off: .008, thick: .003, color: 'greyDark', mat: 'cloth' },
    { use: 'band', limb: 'arm', at: 1.48, width: .016, off: .008, thick: .003, color: 'greyDark', mat: 'cloth' },
    { use: 'band', limb: 'arm', at: 1.74, width: .016, off: .008, thick: .003, color: 'greyDark', mat: 'cloth' },
    { use: 'limbPlate', side: 'R', at: 1.5, length: .15, arc: .03, off: .014, color: 'iron', mat: 'iron', strapColor: 'leatherDark', straps: 3 },
    { use: 'gloveCuff', from: 1.9, to: 2.05 },
    { use: 'hands', glove: 'glove', fingerless: true },
    // Asymmetric tunic skirt: short over the left hip, a long pointed fall with a grey under-layer on the right.
    { use: 'c:drape', from: 20, to: 160, hem: .79, color: 'cloth', flare: 1.04, clear: .01 },
    { use: 'c:drape', from: -200, to: 20, off: .016, hem: [[-200, .76], [-160, .44], [-112, .5], [-56, .31], [-8, .58], [20, .76]], color: 'grey', flare: 1.26, clear: .02, kick: .03 },
    { use: 'c:drape', from: -200, to: 20, off: .023, hem: [[-200, .79], [-160, .5], [-112, .56], [-56, .38], [-8, .64], [20, .79]], color: 'cloth', flare: 1.26, clear: .026, kick: .03, trim: 'greyDark', trimWidth: .007, edges: false },
    { use: 'belt', rise: .03, height: .03, color: 'leather', buckle: 'iron', at: 24, keepers: [60, -40, 150], buckleSize: [.022, .02] },
    { use: 'belt', rise: -.012, height: .03, color: 'leatherDark', buckle: 'iron', at: 180, keepers: [-60, 40, -150], buckleSize: [.022, .02], tilt: -.006 },
    { use: 'cowl', color: 'scarf', rolls: 3, radius: .022, rise: .026 },
    // Thigh case on the left leg: gunmetal frame around a dark woven face, hung on two straps.
    { use: 'band', limb: 'leg', side: 'L', at: .3, width: .022, off: .012, thick: .005, color: 'leather', buckle: { phi: 30 } },
    { use: 'band', limb: 'leg', side: 'L', at: .56, width: .022, off: .012, thick: .005, color: 'leather', buckle: { phi: 30 } },
    { use: 'c:kit', on: { limb: 'leg', t: .43, phi: 92, off: .02 }, parts: [
      { s: 'rbox', d: [.03, .092, .015, .006], at: [0, 0, .012], c: 'iron', m: 'iron' },
      { s: 'rbox', d: [.019, .078, .004, .002], at: [0, 0, .028], c: 'caseFace', m: 'cloth' },
      { s: 'rbox', d: [.034, .008, .018, .003], at: [0, .06, .012], c: 'iron', m: 'iron' }, { s: 'rbox', d: [.034, .008, .018, .003], at: [0, -.06, .012], c: 'iron', m: 'iron' },
      { s: 'dome', d: [.004, .003], at: [.024, .084, .027], c: 'iron' }, { s: 'dome', d: [.004, .003], at: [-.024, .084, .027], c: 'iron' }, { s: 'dome', d: [.004, .003], at: [.024, -.084, .027], c: 'iron' }, { s: 'dome', d: [.004, .003], at: [-.024, -.084, .027], c: 'iron' },
    ] },
    { use: 'boots', top: 1.74, straps: 2, strapColor: 'leather', soleHeight: .03 },
    // Half mask: black cloth with the bone-white panel over the right cheek.
    { use: 'c:headShell', top: [[-104, -.01], [-45, -.085], [0, -.07], [45, -.085], [104, -.01]], off: .024, color: 'cloth' },
    { use: 'c:headShell', phi: [-104, 5], top: [[-104, -.01], [-45, -.085], [0, -.07], [5, -.07]], bottom: [[-104, -.46], [-60, -.44], [-20, -.3], [5, -.14]], off: .032, color: 'bone', n: [16, 8] },
    // High ponytail tied in pale cloth, with loose locks left at the temples.
    { use: 'hair', style: 'long', streak: 'hairSheen', length: .9, fringe: .33, knot: { at: [0, .38, -.43] }, tail: { length: 1.6, width: .15, tie: 'tie' } },
    { use: 'c:strands', width: .075, list: [[38, .31, .46, .05, .03], [-38, .31, .46, .05, -.03], [62, .2, .4, .03, 0], [-62, .2, .4, .03, 0], [16, .345, .2, .05, .05], [-18, .345, .22, .05, -.05]] },
  ],
};
