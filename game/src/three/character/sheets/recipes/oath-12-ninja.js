// 12 NINJA - BLOOD - Sanguine Covenant. Read from assets/references/reference-069 (oxblood leather, woven burgundy
// cloth, patinated iron with red enamel; attachments: hip anchor chain mount, wrist wrap).
import { C } from '../builders-c.js';
import { X } from '../builders-x.js';

const hipAnchor = (th) => ({ use: 'c:kit', name: 'anchor', on: { y: 'belt', dy: -.012, th, off: .026, skin: 'hips' }, parts: [
  { s: 'rbox', d: [.016, .026, .004, .002], at: [0, .02, 0], c: 'oxblood', m: 'leather' },
  { s: 'ring', d: [.027, .027, .0085, 18, 7], at: [0, -.012, .008], c: 'enamel', m: 'enamel' },
  { s: 'ring', d: [.027, .027, .0045, 18, 5], at: [0, -.012, .016], c: 'iron' },
  { s: 'ring', d: [.017, .017, .0035, 14, 5], at: [0, -.012, .009], c: 'iron' },
  { s: 'dome', d: [.005, .004, 6], at: [0, .034, .004], c: 'iron' },
] });
const chain = (side) => ({ use: 'c:hose', name: 'chain', side, links: 13, wire: .0105, color: 'iron', mat: 'iron', path: [
  { on: { y: 'belt', dy: -.05, th: 36, off: .04, skin: 'hips' } }, { on: { limb: 'leg', t: .2, phi: 34, off: .08 } }, { on: { limb: 'leg', t: .32, phi: 78, off: .095 } },
  { on: { limb: 'leg', t: .22, phi: 122, off: .085 } }, { on: { y: 'belt', dy: -.05, th: 150, off: .04, skin: 'hips' } },
] });
const tasset = (from, to, hem, extra = {}) => ({ use: 'c:drape', name: 'tasset', from, to, hem, color: 'oxblood', mat: 'leather', trim: 'oxbloodDark', trimMat: 'leather', trimWidth: .012, flare: 1.08, clear: .05, fold: .012, off: .03, ...extra });

export default {
  id: 'oath-12-ninja', sheet: 'reference-069', title: 'Sanguine Ninja',
  palette: {
    cloth: '#2a2221', under: '#231d1d', wrap: '#2b2423', oxblood: '#4a1719', oxbloodDark: '#33100f', oxbloodLight: '#571c1d', enamel: '#8c1a1c', skin: '#8a5a3c', steel: '#aaa59c',
    leather: '#3a2a26', leatherDark: '#2a2120', iron: '#6c6a66', boot: '#2a2221', sole: '#5a1d1c', glove: '#1e1a19',
  },
  build: { width: 1.14, depth: 1.04, waist: .94, hips: .98, arm: 1.2, upperArm: 1.12, leg: 1.1, neck: 1.12, shoulder: 1.1 },
  keep: ['weapon'],
  builders: { ...C, ...X },
  groom: { hair: false, gear: false },
  parts: [
    // Bare arms from the shoulder: modelled deltoid, biceps, triceps and forearm.
    { use: 'x.physique', part: 'arm', from: -.2, to: 1.2, power: 2.1 },
    // Dark woven undershirt, high in the neck; the oxblood leather vest is cut over it.
    { use: 'shirt', color: 'under', sleeve: 0, collar: 'neck', off: .006 },
    { use: 'neck', color: 'under' },
    { use: 'c:collar', color: 'under', gap: 0, height: .092, flare: -.014, off: .004, thick: .004 },
    { use: 'c:patch', name: 'vest', color: 'oxblood', mat: 'leather', trim: 'steel', trimMat: 'steel', trimWidth: .0045, edges: [1, 3], off: .011, thick: .005, quads: [
      [[24, 'base', -.03], [72, 'shoulder', -.012], [62, 'ribs', 0], [3, 'ribs', 0]], [[3, 'ribs', 0], [62, 'ribs', 0], [58, 'belt', .03], [3, 'belt', .03]],
      [[-72, 'shoulder', -.012], [-24, 'base', -.03], [-3, 'ribs', 0], [-62, 'ribs', 0]], [[-62, 'ribs', 0], [-3, 'ribs', 0], [-3, 'belt', .03], [-58, 'belt', .03]],
    ] },
    { use: 'c:patch', name: 'vest', color: 'oxblood', mat: 'leather', trim: 'steel', trimMat: 'steel', trimWidth: .0045, edges: [1, 3], off: .011, thick: .005, quads: [
      [[110, 'shoulder', -.012], [180, 'base', -.03], [180, 'belt', .03], [122, 'belt', .03]], [[180, 'base', -.03], [250, 'shoulder', -.012], [238, 'belt', .03], [180, 'belt', .03]],
    ] },
    // The wrap-over front: the right edge tucked under, the left edge folded across it down to the belt.
    { use: 'x.lapel', from: [-30, ['base', -.02]], to: [6, ['waist', .0]], width: .05, widthEnd: .03, off: .014, thick: .005, roll: .006, color: 'oxbloodLight', mat: 'leather', trim: 'steel', trimMat: 'steel' },
    { use: 'x.lapel', from: [30, ['base', -.02]], to: [-14, ['belt', .03]], width: .055, widthEnd: .035, off: .019, thick: .006, roll: .008, color: 'oxbloodLight', mat: 'leather', trim: 'steel', trimMat: 'steel' },
    // Forearm bindings with oxblood bands and iron buckles.
    { use: 'wrap', limb: 'arm', from: 1.14, to: 1.95, color: 'wrap', off: .007, pitch: .022 },
    { use: 'band', limb: 'arm', at: 1.2, width: .024, off: .011, thick: .005, color: 'oxblood' },
    { use: 'band', limb: 'arm', at: 1.46, width: .02, off: .011, thick: .005, color: 'oxblood', buckle: { phi: 70 } },
    { use: 'band', limb: 'arm', at: 1.72, width: .02, off: .011, thick: .005, color: 'oxblood', buckle: { phi: 70 } },
    { use: 'gloveCuff', from: 1.9, to: 2.05 },
    { use: 'hands', glove: 'glove', fingerless: true },
    { use: 'trousers', color: 'cloth', gather: 1.16, bag: .02, pleats: 11 },
    // Leather tassets: a long point at front and back, squared panels with iron corners over the hips.
    tasset(-22, 22, [[-22, .7], [-8, .66], [3, .45], [12, .62], [22, .7]]),
    tasset(30, 128, [[30, .6], [60, .74], [128, .72]], { off: .036 }), tasset(-128, -30, [[-128, .72], [-60, .74], [-30, .6]], { off: .036 }),
    tasset(150, 210, [[150, .7], [172, .66], [184, .46], [196, .62], [210, .7]]),
    { use: 'belt', rise: .02, height: .058, thick: .009, off: .036, color: 'leatherDark', buckle: null, keepers: [] },
    { use: 'belt', rise: .044, height: .012, thick: .004, off: .046, color: 'oxblood', buckle: null, keepers: [] },
    { use: 'belt', rise: -.004, height: .012, thick: .004, off: .046, color: 'oxblood', buckle: null, keepers: [] },
    hipAnchor(36), hipAnchor(-36), hipAnchor(150), hipAnchor(-150),
    chain('L'), chain('R'),
    // Knee bands, crossed shin bindings and strapped boots.
    { use: 'band', limb: 'leg', at: 1.18, width: .04, color: 'oxblood', buckle: { phi: 60 } },
    { use: 'wrap', limb: 'leg', from: 1.21, to: 1.62, color: 'wrap', pitch: .03 },
    { use: 'band', limb: 'leg', at: 1.36, width: .016, off: .009, thick: .004, color: 'oxbloodDark' },
    { use: 'band', limb: 'leg', at: 1.5, width: .016, off: .009, thick: .004, color: 'oxbloodDark' },
    { use: 'boots', top: 1.6, straps: 3, strapColor: 'oxblood', toeCap: 'oxbloodDark', plateMat: 'leather' },
    // Helm: a leather shell over the whole head, a raised faceplate pointed at the chin, and a steel crest.
    { use: 'c:headShell', name: 'helm', surface: 'helm', phi: [0, 360], top: .499, bottom: [[0, -.499], [62, -.44], [105, -.36], [255, -.36], [298, -.44], [360, -.499]], off: .05, color: 'oxbloodDark', mat: 'leather', n: [40, 22] },
    { use: 'c:headShell', name: 'helm', surface: 'helm', phi: [-64, 64], top: [[-64, .17], [0, .44], [64, .17]], bottom: [[-64, -.2], [-30, -.4], [0, -.499], [30, -.4], [64, -.2]], off: .068, color: 'oxblood', mat: 'leather', rim: 'steel', rimMat: 'steel', n: [22, 16] },
    { use: 'c:crest', front: -.499, rear: -.3, width: .013, lift: .022, off: .07 },
    { use: 'c:headBand', y: -.2, height: .06, phi: [70, 290], off: .052, thick: .01, color: 'oxblood', mat: 'leather' },
    { use: 'c:kit', name: 'helm', side: 'both', on: { head: [.385, -.2, .02] }, parts: [{ s: 'rbox', d: [.006, .04, .032, .004], c: 'steel', m: 'steel' }, { s: 'rbox', d: [.004, .02, .016, .002], at: [.005, 0, 0], c: 'oxbloodDark', m: 'leather' }] },
  ],
};
