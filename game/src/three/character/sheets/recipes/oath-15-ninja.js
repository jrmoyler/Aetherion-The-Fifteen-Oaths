// 15 NINJA - TECH & FORCE - Impulse Foundry. Read from assets/references/reference-063 (burnt orange ceramic plate,
// graphite cloth, brushed steel; attachments: hip hose coupling, knee actuator).
import '../builders-c.js';

const strapOver = (s) => ({ use: 'strap', color: 'webbing', closed: false, width: .03, n: 36, anchor: { at: .16, size: .016, color: 'steel' }, path: [
  { th: s * 34, y: 'belt', dy: .05, off: .028 }, { th: s * 36, y: 'chest', dy: 0, off: .028 }, { th: s * 44, y: 'armpit', dy: .03, off: .024 }, { th: s * 66, y: 'shoulder', dy: .012, off: .022 },
  { th: s * 116, y: 'shoulder', dy: .012, off: .022 }, { th: s * 150, y: 'armpit', dy: .02, off: .024 }, { th: s * 158, y: 'chest', dy: 0, off: .028 }, { th: s * 156, y: 'belt', dy: .05, off: .028 } ] });
const lens = (r, z = 0) => [
  { s: 'cyl', d: [r, .008, r, 16], rot: [90, 0, 0], at: [0, 0, z], c: 'steel', m: 'steel' }, { s: 'ring', d: [r * .86, r * .86, r * .16, 18, 6], at: [0, 0, z + .008], c: 'steelDark', m: 'steel' },
  { s: 'cyl', d: [r * .58, .006, r * .5, 12], rot: [90, 0, 0], at: [0, 0, z + .012], c: 'graphiteDark', m: 'steel' }, { s: 'dome', d: [r * .4, r * .16, 10], at: [0, 0, z + .017], c: 'cyan', m: 'glow' },
];
const hoseLoop = (side, a, b, droop, out) => ({ use: 'c:hose', name: 'hose', side, r: .0125, ribs: 26, seg: 14, color: 'rubber', mat: 'rubber', path: [
  { on: { y: 'belt', dy: -.03, th: a, off: .04, skin: 'hips' } }, { on: { limb: 'leg', t: droop * .55, phi: a + 10, off: out } }, { on: { limb: 'leg', t: droop, phi: (a + b) / 2, off: out + .012 } },
  { on: { limb: 'leg', t: droop * .55, phi: b - 10, off: out } }, { on: { y: 'belt', dy: -.03, th: b, off: .04, skin: 'hips' } } ] });
const bracerPlates = { use: 'c:kit', name: 'bracer', side: 'both', on: { limb: 'arm', t: 1.5, phi: 90, off: .014, skin: 'forearm.L' }, parts: [
  { s: 'rbox', d: [.03, .09, .007, .004], at: [0, 0, .005], c: 'graphiteLight', m: 'steel' },
  { s: 'rbox', d: [.012, .078, .005, .003], at: [-.02, 0, .012], c: 'orange', m: 'ceramic' }, { s: 'rbox', d: [.006, .06, .003, .002], at: [.012, 0, .013], c: 'cyan', m: 'glow' },
  { s: 'rbox', d: [.036, .008, .01, .003], at: [0, .09, .006], c: 'steel', m: 'steel' }, { s: 'rbox', d: [.036, .008, .01, .003], at: [0, -.09, .006], c: 'steel', m: 'steel' },
  { s: 'rbox', d: [.018, .03, .006, .003], at: [0, -.06, -.076], c: 'orange', m: 'ceramic' },
] };
const knee = [
  { use: 'c:kit', name: 'actuator', side: 'both', on: { limb: 'leg', t: 1.0, phi: 90, off: .038 }, parts: [...lens(.04), ...[0, 60, 120, 180, 240, 300].map((deg) => ({ s: 'dome', d: [.004, .003, 6], at: [Math.cos(deg * Math.PI / 180) * .033, Math.sin(deg * Math.PI / 180) * .033, .009], c: 'steelDark', m: 'steel' }))] },
  { use: 'c:kit', name: 'actuator', side: 'both', on: { limb: 'leg', t: .74, phi: 90, off: .044 }, parts: [{ s: 'rbox', d: [.011, .075, .005, .003], c: 'steel', m: 'steel' }, { s: 'rbox', d: [.016, .012, .008, .003], at: [0, .07, 0], c: 'steelDark', m: 'steel' }] },
  { use: 'c:kit', name: 'actuator', side: 'both', on: { limb: 'leg', t: 1.36, phi: 90, off: .03 }, parts: [
    { s: 'rbox', d: [.009, .12, .005, .003], at: [-.012, 0, 0], c: 'steel', m: 'steel' }, { s: 'rbox', d: [.006, .12, .004, .002], at: [.014, 0, 0], c: 'steelDark', m: 'steel' },
    { s: 'rbox', d: [.022, .01, .008, .003], at: [0, -.115, 0], c: 'steelDark', m: 'steel' }, { s: 'rbox', d: [.008, .09, .004, .002], at: [0, 0, .004], c: 'orange', m: 'ceramic' } ] },
];
const pouch = { use: 'c:kit', name: 'pouch', side: 'both', on: { limb: 'leg', t: .4, phi: 74, off: .034 }, parts: [
  { s: 'rbox', d: [.042, .058, .014, .006], at: [0, 0, .008], c: 'graphiteLight', m: 'leather' }, { s: 'rbox', d: [.045, .022, .016, .005], at: [0, .04, .009], c: 'graphiteDark', m: 'leather' },
  { s: 'rbox', d: [.01, .014, .004, .002], at: [0, .02, .026], c: 'steel', m: 'steel' }, { s: 'rbox', d: [.012, .07, .004, .002], at: [-.052, .0, .002], c: 'orange', m: 'ceramic' },
] };

export default {
  id: 'oath-15-ninja', sheet: 'reference-063', title: 'Impulse Foundry Ninja',
  palette: {
    cloth: '#2f2e2f', graphite: '#2f2e2f', graphiteLight: '#434244', graphiteDark: '#1f1f21', orange: '#c2571f', orangeDark: '#8e3f17', steel: '#9d9a94', steelDark: '#5c5a57', cyan: '#7fe6f2', white: '#f4f8fa',
    webbing: '#3a3632', leather: '#3a3632', leatherDark: '#262423', iron: '#9d9a94', rubber: '#1b1b1c', boot: '#2a2929', sole: '#1c1c1d', glove: '#1d1d1e', skin: '#7a4a32', hair: '#15110f', plate: '#18181a',
  },
  build: { width: 1.06, depth: 1.04, bust: .016, waist: 1.0, hips: 1.06, arm: 1.16, leg: 1.1, neck: 1.0, shoulder: 1.04 },
  keep: ['hands'],
  groom: { hair: false, gear: false },
  parts: [
    { use: 'skinLimb', limb: 'arm', from: -.15, to: 1.16 },
    { use: 'c:kit', name: 'skinLimb', side: 'both', on: { bone: 'upperarm.L' }, parts: [{ s: 'ball', d: [.069, .066, .069, 14, 9], c: 'skin', m: 'skin' }] },
    // Sleeveless graphite suit zipped to a high collar; webbing harness; burnt orange ceramic over chest and spine.
    { use: 'shirt', color: 'graphite', sleeve: 0, collar: 'neck', off: .007 },
    { use: 'c:collar', color: 'graphite', gap: 0, height: .07, flare: -.016, off: .005, thick: .004 },
    { use: 'c:patch', name: 'zip', color: 'steelDark', mat: 'steel', off: .009, thick: .002, quads: [[[-1.4, 'neck', 0], [1.4, 'neck', 0], [1.4, 'belt', .03], [-1.4, 'belt', .03]]] },
    strapOver(1), strapOver(-1),
    { use: 'c:patch', name: 'plate', color: 'orange', mat: 'ceramic', trim: 'steelDark', trimMat: 'steel', trimWidth: .004, off: .016, thick: .007, n: 6, quads: [
      [[-20, 'armpit', .035], [20, 'armpit', .035], [30, 'chest', .005], [-30, 'chest', .005]], [[-30, 'chest', .0], [30, 'chest', .0], [15, 'ribs', .02], [-15, 'ribs', .02]],
      [[166, 'armpit', .05], [194, 'armpit', .05], [192, 'ribs', .0], [168, 'ribs', .0]],
    ] },
    { use: 'c:patch', name: 'plate', color: 'orange', mat: 'ceramic', off: .014, thick: .005, n: 5, quads: [
      [[26, 'shoulder', -.02], [56, 'shoulder', -.03], [52, 'armpit', .045], [26, 'armpit', .05]], [[-56, 'shoulder', -.03], [-26, 'shoulder', -.02], [-26, 'armpit', .05], [-52, 'armpit', .045]],
    ] },
    { use: 'c:kit', name: 'plate', on: { y: 'chest', dy: .075, th: 180, off: .03, skin: 'spine2' }, parts: [
      { s: 'rbox', d: [.05, .012, .008, .003], c: 'steel', m: 'steel' }, { s: 'rbox', d: [.016, .06, .008, .003], at: [0, -.085, 0], c: 'steel', m: 'steel' }, { s: 'rbox', d: [.03, .014, .01, .003], at: [0, -.15, 0], c: 'steelDark', m: 'steel' } ] },
    { use: 'band', limb: 'arm', at: .5, width: .02, off: .003, thick: .004, color: 'webbing', buckle: { phi: 60, color: 'steel' } },
    { use: 'bracer', from: 1.06, to: 1.92, color: 'graphite', strapColor: 'leatherDark', straps: [1.14, 1.84], buckle: null, off: .012 },
    bracerPlates,
    { use: 'gloveCuff', from: 1.88, to: 2.05, color: 'glove' },
    { use: 'trousers', color: 'graphite', gather: 1.64, bag: .034, pleats: 9, cuff: .01, piping: 'orangeDark', pipingPaths: [[88, 86, .08, 1.5]] },
    { use: 'belt', height: .034, thick: .008, off: .022, color: 'leather', buckle: 'steel', keepers: [22, -22, 160, -160], buckleSize: [.022, .02] },
    // Hose couplings at each hip, with two ribbed hoses looped from front to back.
    { use: 'c:kit', name: 'coupling', side: 'both', on: { y: 'belt', dy: -.03, th: 44, off: .034, skin: 'hips' }, parts: lens(.026) },
    { use: 'c:kit', name: 'coupling', side: 'both', on: { y: 'belt', dy: -.03, th: 128, off: .034, skin: 'hips' }, parts: [{ s: 'ring', d: [.02, .02, .006, 14, 6], c: 'steel', m: 'steel' }] },
    hoseLoop('L', 44, 128, .34, .07), hoseLoop('R', 44, 128, .34, .07), hoseLoop('L', 52, 120, .22, .062), hoseLoop('R', 52, 120, .22, .062),
    { use: 'band', limb: 'leg', at: .4, width: .026, off: .034, thick: .005, color: 'webbing' },
    pouch,
    { use: 'c:kit', name: 'kneepad', side: 'both', on: { limb: 'leg', t: 1.0, phi: 0, off: .04 }, parts: [{ s: 'rbox', d: [.044, .05, .01, .008], c: 'graphiteDark', m: 'leather' }, { s: 'rbox', d: [.03, .014, .006, .003], at: [0, -.03, .008], c: 'graphiteLight', m: 'leather' }] },
    ...knee,
    { use: 'boots', top: 1.62, straps: 3, strapColor: 'leatherDark', buckle: 'steel', toeCap: 'orange', heelPlate: 'orange', cuff: 'orangeDark', plateMat: 'ceramic', soleHeight: .046, bulk: 1.14 },
    // Faceplate with a lit chevron, ear couplings, and locks gathered on the crown above cropped sides.
    { use: 'c:headShell', name: 'faceplate', phi: [-92, 92], top: [[-92, .1], [-40, .2], [0, .23], [40, .2], [92, .1]], bottom: [[-92, -.3], [-50, -.44], [0, -.499], [50, -.44], [92, -.3]], off: .04, color: 'plate', mat: 'lacquer', rim: 'graphiteLight', rimMat: 'steel', n: [26, 16] },
    { use: 'c:kit', name: 'faceplate', on: { head: [0, .02, .455] }, parts: [
      { s: 'prism', pts: [[-.215, .09], [0, -.045], [0, -.125], [-.215, .01]], d: [.012, .0], rot: [0, -26, 0], c: 'white', m: 'glow' },
      { s: 'prism', pts: [[.215, .09], [.215, .01], [0, -.125], [0, -.045]], d: [.012, .0], rot: [0, 26, 0], c: 'white', m: 'glow' },
      { s: 'prism', pts: [[-.1, -.2], [0, -.26], [.1, -.2], [.06, -.42], [0, -.46], [-.06, -.42]], d: [.016, .02], at: [0, 0, -.03], c: 'graphiteDark', m: 'lacquer' },
    ] },
    { use: 'c:kit', name: 'faceplate', side: 'both', on: { head: [.3, -.2, .25], turn: [0, 58, 0] }, parts: [{ s: 'prism', pts: [[-.07, .1], [.07, .06], [.06, -.08], [-.05, -.14]], d: [.014, .008], c: 'orange', m: 'ceramic' }] },
    { use: 'c:kit', name: 'faceplate', side: 'both', on: { head: [.385, -.03, -.03] }, parts: [
      { s: 'cyl', d: [.085, .016, .085, 16], rot: [0, 0, 90], c: 'steelDark', m: 'steel' }, { s: 'cyl', d: [.055, .024, .05, 14], rot: [0, 0, -90], c: 'steel', m: 'steel' }, { s: 'cyl', d: [.024, .03, .024, 10], rot: [0, 0, 90], c: 'graphiteDark', m: 'steel' } ] },
    { use: 'c:headBand', name: 'faceplate', y: -.03, height: .07, phi: [92, 268], off: .03, thick: .012, color: 'leatherDark' },
    { use: 'c:locks', count: 46, length: .56, r: .036, above: .14, back: .42, stand: .28, fringe: .31 },
  ],
};
