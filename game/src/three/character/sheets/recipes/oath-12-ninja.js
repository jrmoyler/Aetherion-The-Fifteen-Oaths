// 12 NINJA - BLOOD - Sanguine Covenant. Read from assets/references/reference-069 (oxblood leather, woven burgundy
// cloth, patinated iron with red enamel; attachments: hip anchor chain mount, wrist wrap).
import '../builders-c.js';

const hipAnchor = (th) => ({ use: 'c:kit', name: 'anchor', on: { y: 'belt', dy: -.012, th, off: .026, skin: 'hips' }, parts: [
  { s: 'rbox', d: [.016, .026, .004, .002], at: [0, .02, 0], c: 'oxblood', m: 'leather' },
  { s: 'ring', d: [.027, .027, .0085, 18, 7], at: [0, -.012, .008], c: 'enamel', m: 'enamel' },
  { s: 'ring', d: [.027, .027, .0045, 18, 5], at: [0, -.012, .016], c: 'iron' },
  { s: 'ring', d: [.017, .017, .0035, 14, 5], at: [0, -.012, .009], c: 'iron' },
  { s: 'dome', d: [.005, .004, 6], at: [0, .034, .004], c: 'iron' },
] });
const chain = (side) => ({ use: 'c:hose', name: 'chain', side, links: 17, wire: .0078, color: 'iron', mat: 'iron', path: [
  { on: { y: 'belt', dy: -.04, th: 36, off: .034, skin: 'hips' } }, { on: { limb: 'leg', t: .32, phi: 48, off: .075 } }, { on: { limb: 'leg', t: .47, phi: 96, off: .085 } },
  { on: { limb: 'leg', t: .34, phi: 150, off: .075 } }, { on: { y: 'belt', dy: -.04, th: 150, off: .034, skin: 'hips' } },
] });
const tasset = (from, to, hem, extra = {}) => ({ use: 'c:drape', name: 'tasset', from, to, hem, color: 'oxblood', mat: 'leather', trim: 'oxbloodDark', trimMat: 'leather', trimWidth: .012, flare: 1.08, clear: .05, fold: .012, off: .03, ...extra });

export default {
  id: 'oath-12-ninja', sheet: 'reference-069', title: 'Sanguine Ninja',
  palette: {
    cloth: '#2a2221', under: '#231d1d', wrap: '#2b2423', oxblood: '#5e1d1f', oxbloodDark: '#3f1416', oxbloodLight: '#6d2325', enamel: '#9c1c1f', steel: '#aaa59c',
    leather: '#3a2a26', leatherDark: '#2a2120', iron: '#6c6a66', boot: '#2a2221', sole: '#5a1d1c', glove: '#1e1a19', skin: '#a8734f',
  },
  build: { width: 1.14, depth: 1.08, waist: 1.02, arm: 1.3, leg: 1.1, neck: 1.12, shoulder: 1.1 },
  keep: ['hands'],
  groom: { hair: false, gear: false },
  parts: [
    { use: 'skinLimb', limb: 'arm', from: -.15, to: 1.2 },
    { use: 'c:kit', name: 'skinLimb', side: 'both', on: { bone: 'upperarm.L' }, parts: [{ s: 'ball', d: [.078, .074, .078, 14, 9], c: 'skin', m: 'skin' }] },
    // Dark woven undershirt, high in the neck; the oxblood leather vest is cut over it.
    { use: 'shirt', color: 'under', sleeve: 0, collar: 'neck', off: .006 },
    { use: 'c:collar', color: 'under', gap: 0, height: .09, flare: -.022, off: .004, thick: .004 },
    { use: 'c:patch', name: 'vest', color: 'oxblood', mat: 'leather', trim: 'steel', trimMat: 'steel', trimWidth: .0045, edges: [1, 3], off: .011, thick: .005, quads: [
      [[24, 'base', -.03], [74, 'shoulder', -.012], [72, 'ribs', 0], [3, 'ribs', 0]], [[3, 'ribs', 0], [72, 'ribs', 0], [78, 'belt', .03], [3, 'belt', .03]],
      [[-74, 'shoulder', -.012], [-24, 'base', -.03], [-3, 'ribs', 0], [-72, 'ribs', 0]], [[-72, 'ribs', 0], [-3, 'ribs', 0], [-3, 'belt', .03], [-78, 'belt', .03]],
    ] },
    { use: 'c:patch', name: 'vest', color: 'oxblood', mat: 'leather', trim: 'steel', trimMat: 'steel', trimWidth: .0045, edges: [1, 3], off: .011, thick: .005, quads: [
      [[108, 'shoulder', -.012], [180, 'base', -.03], [180, 'belt', .03], [104, 'belt', .03]], [[180, 'base', -.03], [252, 'shoulder', -.012], [256, 'belt', .03], [180, 'belt', .03]],
    ] },
    // Forearm bindings with oxblood bands and iron buckles.
    { use: 'wrap', limb: 'arm', from: 1.14, to: 1.95, color: 'wrap', off: .007, pitch: .022 },
    { use: 'band', limb: 'arm', at: 1.2, width: .024, off: .011, thick: .005, color: 'oxblood' },
    { use: 'band', limb: 'arm', at: 1.46, width: .02, off: .011, thick: .005, color: 'oxblood', buckle: { phi: 70 } },
    { use: 'band', limb: 'arm', at: 1.72, width: .02, off: .011, thick: .005, color: 'oxblood', buckle: { phi: 70 } },
    { use: 'gloveCuff', from: 1.9, to: 2.05 },
    { use: 'trousers', color: 'cloth', gather: 1.16, bag: .042, pleats: 11 },
    // Leather tassets: a long point at front and back, squared panels with iron corners over the hips.
    tasset(-30, 30, [[-30, .68], [-12, .68], [4, .47], [16, .64], [30, .66]]),
    tasset(38, 132, [[38, .74], [132, .74]], { off: .036 }), tasset(-132, -38, [[-132, .74], [-38, .74]], { off: .036 }),
    tasset(146, 214, [[146, .68], [170, .68], [186, .48], [200, .66], [214, .66]]),
    { use: 'belt', height: .058, thick: .009, off: .036, color: 'leatherDark', buckle: null, keepers: [] },
    { use: 'belt', rise: .024, height: .012, thick: .004, off: .046, color: 'oxblood', buckle: null, keepers: [] },
    { use: 'belt', rise: -.024, height: .012, thick: .004, off: .046, color: 'oxblood', buckle: null, keepers: [] },
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
