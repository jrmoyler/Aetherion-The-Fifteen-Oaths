// 13 NINJA - ARCANE & ILLUSION - Folded Theatre. Read from assets/references/reference-068 (satin deep plum, woven
// charcoal, pearl-white porcelain; attachments: forearm bracer frame and socket, back strap clamp).
import '../builders-c.js';

const frameBracer = { use: 'c:kit', name: 'bracer', side: 'both', on: { limb: 'arm', t: 1.5, phi: 90, off: .012, skin: 'forearm.L' }, parts: [
  // The socket: a dark slab seated on the forearm, inside an open steel frame standing off it.
  { s: 'rbox', d: [.024, .088, .008, .004], at: [0, 0, .008], c: 'socket', m: 'glass' },
  { s: 'rbox', d: [.005, .1, .005, .002], at: [.034, 0, .038], c: 'steel', m: 'steel' }, { s: 'rbox', d: [.005, .1, .005, .002], at: [-.034, 0, .038], c: 'steel', m: 'steel' },
  { s: 'rbox', d: [.039, .006, .006, .002], at: [0, .1, .038], c: 'steel', m: 'steel' }, { s: 'rbox', d: [.039, .006, .006, .002], at: [0, -.1, .038], c: 'steel', m: 'steel' },
  ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sy]) => ({ s: 'rbox', d: [.005, .006, .022, .002], at: [sx * .034, sy * .1, .018], c: 'steel', m: 'steel' })),
  { s: 'rbox', d: [.029, .012, .012, .003], at: [0, .1, .008], c: 'steelDark', m: 'steel' }, { s: 'rbox', d: [.029, .012, .012, .003], at: [0, -.1, .008], c: 'steelDark', m: 'steel' },
  { s: 'rbox', d: [.009, .011, .004, .002], at: [0, -.118, .014], c: 'steel', m: 'steel' },
] };

export default {
  id: 'oath-13-ninja', sheet: 'reference-068', title: 'Folded Theatre Ninja',
  palette: {
    cloth: '#28262a', charcoal: '#2f2d31', charcoalLight: '#3b393d', plum: '#4a1f47', plumDark: '#33162f', silver: '#b3b0aa', steel: '#8f8b84', steelDark: '#55524e', socket: '#17161c',
    porcelain: '#e9e3d6', porcelainShade: '#c9c2b4', leather: '#2b2828', leatherDark: '#1f1d1e', iron: '#8f8b84', boot: '#1f1d1e', sole: '#141314', glove: '#1a191b', skin: '#d2a184', hair: '#16141a', hairSheen: '#2a2731',
  },
  build: { width: .98, depth: .97, waist: .94, arm: .9, leg: .93, neck: .95 },
  keep: ['hands'],
  groom: { hair: false, gear: false },
  parts: [
    { use: 'shirt', color: 'charcoal', sleeve: 1.95, flare: .004, off: .009, cap: .012, slack: .003, collar: 'neck' },
    // Plum satin wrap from the right shoulder across the chest and over the back, piped in silver.
    { use: 'c:patch', color: 'plum', mat: 'velvet', trim: 'silver', trimMat: 'silver', trimWidth: .004, edges: [1, 2], off: .012, quads: [[[-80, 'shoulder', -.01], [-22, 'base', -.01], [38, 'belt', .06], [-74, 'belt', .14]]] },
    { use: 'c:patch', color: 'plum', mat: 'velvet', trim: 'silver', trimMat: 'silver', trimWidth: .004, edges: [1, 3], off: .012, quads: [[[-152, 'base', -.01], [-100, 'shoulder', -.01], [-160, 'belt', .05], [-218, 'belt', .05]]] },
    { use: 'c:patch', color: 'charcoalLight', trim: 'silver', trimMat: 'silver', trimWidth: .004, edges: [3], off: .014, quads: [[[22, 'base', -.01], [80, 'shoulder', -.01], [84, 'ribs', 0], [16, 'chest', -.02]]] },
    { use: 'c:kit', name: 'clamp', on: { y: 'ribs', dy: .0, th: 184, off: .022, skin: 'spine1' }, parts: [
      { s: 'prism', pts: [[-.016, .0], [0, .034], [.016, 0]], d: [.008, .004], c: 'steel', m: 'steel' }, { s: 'prism', pts: [[-.012, -.006], [0, -.034], [.012, -.006]], d: [.008, .004], c: 'steel', m: 'steel' },
      { s: 'rbox', d: [.02, .004, .004, .002], at: [0, -.003, .004], c: 'steelDark', m: 'steel' } ] },
    { use: 'trousers', color: 'cloth', gather: 1.76, bag: .004, pleats: 4, pockets: [], cuff: .005 },
    // Jacket skirt: a short charcoal front cut on the diagonal, and the long plum-lined tail down the right side.
    { use: 'c:drape', from: -20, to: 150, hem: [[-20, .82], [40, .7], [90, .8], [150, .82]], color: 'charcoal', flare: 1.05, clear: .01, off: .02, trim: 'silver', trimMat: 'silver', trimWidth: .004 },
    { use: 'c:drape', from: -210, to: -14, off: .019, hem: [[-210, .68], [-150, .34], [-96, .28], [-40, .52], [-14, .72]], color: 'plum', mat: 'velvet', flare: 1.1, clear: .008 },
    { use: 'c:drape', from: -210, to: -14, off: .026, hem: [[-210, .72], [-150, .44], [-96, .36], [-40, .6], [-14, .76]], color: 'charcoal', flare: 1.1, clear: .012, trim: 'silver', trimMat: 'silver', trimWidth: .004 },
    { use: 'belt', height: .024, thick: .006, off: .027, color: 'leather', buckle: 'steel', at: 20, keepers: [-40, 150], buckleSize: [.016, .015] },
    { use: 'c:collar', color: 'charcoal', lining: 'plum', trim: 'silver', trimMat: 'silver', height: .068, back: .01, tip: .008, flare: .036, gap: 32, off: .014 },
    frameBracer,
    { use: 'band', limb: 'arm', at: 1.22, width: .02, off: .012, thick: .005, color: 'steelDark', mat: 'iron' },
    { use: 'band', limb: 'arm', at: 1.78, width: .02, off: .012, thick: .005, color: 'steelDark', mat: 'iron' },
    { use: 'gloveCuff', from: 1.86, to: 2.05, color: 'glove' },
    // Pouch strapped to the left thigh.
    { use: 'band', limb: 'leg', side: 'L', at: .3, width: .018, off: .011, thick: .004, color: 'leather', buckle: { phi: 20 } },
    { use: 'c:kit', name: 'pouch', on: { limb: 'leg', t: .42, phi: 80, off: .012 }, parts: [
      { s: 'rbox', d: [.034, .052, .012, .006], at: [0, 0, .01], c: 'charcoalLight', m: 'leather' }, { s: 'rbox', d: [.036, .02, .014, .005], at: [0, .034, .011], c: 'leather', m: 'leather' },
      { s: 'rbox', d: [.006, .008, .003, .001], at: [0, .018, .026], c: 'steel', m: 'steel' } ] },
    { use: 'boots', top: 1.74, straps: 3, strapColor: 'leatherDark', buckle: 'steel', toeCap: 'steelDark', heelPlate: 'steelDark', plateMat: 'iron', soleHeight: .032 },
    // Under-mask in black cloth, the folded porcelain blade over it, and the strap with its side buckles.
    { use: 'c:headShell', top: .16, bottom: -.495, phi: [-96, 96], off: .02, color: 'leatherDark' },
    { use: 'c:kit', name: 'mask', on: { head: [0, 0, .455], turn: [-5, 0, 0] }, parts: [
      { s: 'prism', pts: [[0, .7], [.245, .13], [.09, -.48], [0, -.56], [-.09, -.48], [-.245, .13]], d: [.02, .075, 0, .12], c: 'porcelain', m: 'porcelain', e: .86 },
      { s: 'prism', pts: [[0, .1], [.2, .0], [.1, -.5], [0, -.57], [-.1, -.5], [-.2, 0]], d: [.012, .03], at: [0, 0, -.03], c: 'leatherDark', m: 'leather' },
    ] },
    { use: 'c:headBand', y: .09, height: .07, phi: [62, 298], off: .03, thick: .012, color: 'leather' },
    { use: 'c:kit', name: 'mask', side: 'both', on: { head: [.2, .1, .36], turn: [0, 40, 0] }, parts: [{ s: 'rbox', d: [.05, .04, .012, .006], c: 'steel', m: 'steel' }, { s: 'rbox', d: [.026, .02, .006, .003], at: [0, 0, .01], c: 'steelDark', m: 'steel' }] },
    { use: 'c:kit', name: 'mask', on: { head: [0, .09, -.5] }, parts: [{ s: 'ring', d: [.04, .04, .013, 12, 5], c: 'steel', m: 'steel' }] },
    { use: 'hair', style: 'spiky', streak: 'hairSheen', locks: 150, length: .27, lift: .03, fringe: .34 },
  ],
};
