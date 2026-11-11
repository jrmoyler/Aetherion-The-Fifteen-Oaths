// 14 SORCERER - TIME & MOTION - Escapement Road. Read from assets/references/reference-064 (woven petrol teal, ivory
// enamel cloth, brushed aged brass, smoked glass; attachments: wrist cuff escapement, pendulum harness).
import { C } from '../builders-c.js';

const TAU = Math.PI * 2;
const around = (n, fn) => Array.from({ length: n }, (_, i) => fn(i / n * TAU, i / n * 360));
// Escapement cuff: a smoked glass drum around the forearm caged in brass rings and posts, a gear turning inside.
const cuff = { use: 'c:kit', name: 'cuff', side: 'both', on: { limb: 'arm', t: 1.5, phi: 90, off: 0, skin: 'forearm.L' }, parts: (() => {
  const z = -.04, R = .066, ringAt = (y, r = R + .006, h = .009) => ({ s: 'cyl', d: [r, h, r, 18], at: [0, y, z], c: 'brass', m: 'brass' });
  return [
    { s: 'cyl', d: [R, .082, R, 18], at: [0, 0, z], c: 'glass', m: 'glass' },
    ringAt(.088, R + .008, .012), ringAt(-.088, R + .008, .012), ringAt(.03, R + .004, .005), ringAt(-.03, R + .004, .005),
    { s: 'cyl', d: [R - .008, .014, R - .02, 16], at: [0, .108, z], c: 'brassDark', m: 'brass' }, { s: 'cyl', d: [R - .02, .014, R - .008, 16], at: [0, -.108, z], c: 'brassDark', m: 'brass' },
    ...around(8, (a, deg) => ({ s: 'box', d: [.005, .086, .005], at: [Math.cos(a) * (R + .005), 0, z + Math.sin(a) * (R + .005)], rot: [0, -deg, 0], c: 'brass', m: 'brass' })),
    ...around(8, (a) => ({ s: 'dome', d: [.005, .004, 6], at: [Math.cos(a + .39) * (R + .012), .088, z + Math.sin(a + .39) * (R + .012)], rot: [0, 90 - (a + .39) * 180 / Math.PI, 0], c: 'brass', m: 'brass' })),
    // The gear seen through the glass on the outer face.
    { s: 'ring', d: [.03, .03, .005, 16, 5], at: [0, 0, z + R + .002], c: 'brass', m: 'brass' }, { s: 'cyl', d: [.01, .004, .01, 8], rot: [90, 0, 0], at: [0, 0, z + R + .002], c: 'brassDark', m: 'brass' },
    ...around(4, (a, deg) => ({ s: 'box', d: [.003, .026, .003], at: [0, 0, z + R + .002], rot: [0, 0, deg / 2], c: 'brass', m: 'brass' })),
    ...around(10, (a, deg) => ({ s: 'box', d: [.004, .005, .004], at: [Math.cos(a) * .036, Math.sin(a) * .036, z + R + .002], rot: [0, 0, deg], c: 'brass', m: 'brass' })),
  ];
})() };
// Pendulum harness: a hub between the shoulder blades, a jointed arm to the right shoulder and the bob on its rod.
const pendulum = { use: 'c:kit', name: 'pendulum', on: { bone: 'spine2', at: [0, 0, 0] }, parts: [
  { s: 'cyl', d: [.04, .012, .04, 16], rot: [90, 0, 0], at: [0, .07, -.138], c: 'brass', m: 'brass' }, { s: 'cyl', d: [.022, .018, .022, 12], rot: [90, 0, 0], at: [0, .07, -.142], c: 'brassDark', m: 'brass' },
  { s: 'ring', d: [.04, .04, .006, 18, 6], at: [0, .07, -.150], c: 'brass', m: 'brass' },
  ...around(4, (a, deg) => ({ s: 'box', d: [.004, .036, .003], at: [0, .07, -.151], rot: [0, 0, deg / 2], c: 'brassDark', m: 'brass' })),
  { s: 'bar', d: [.008, .075, 8], rot: [0, 0, 48], at: [-.062, .125, -.158], c: 'brass', m: 'brass' },
  { s: 'ball', d: [.019, .019, .019, 10, 6], at: [-.125, .18, -.158], c: 'brass', m: 'brass' },
  { s: 'bar', d: [.007, .05, 8], rot: [0, 0, -14], at: [-.14, .235, -.158], c: 'brass', m: 'brass' },
  { s: 'ball', d: [.017, .017, .017, 10, 6], at: [-.153, .29, -.158], c: 'brass', m: 'brass' },
  { s: 'bar', d: [.0065, .31, 8], rot: [6, 0, 2], at: [-.165, -.02, -.168], c: 'brass', m: 'brass' },
  { s: 'ball', d: [.022, .022, .022, 10, 6], at: [-.158, .12, -.162], c: 'brass', m: 'brass' },
  { s: 'ball', d: [.058, .058, .058, 16, 10], at: [-.176, -.37, -.200], c: 'brass', m: 'brass' },
  { s: 'ring', d: [.059, .059, .006, 20, 6], rot: [90, 0, 0], at: [-.176, -.37, -.200], c: 'brassDark', m: 'brass' }, { s: 'ring', d: [.059, .059, .006, 20, 6], at: [-.176, -.37, -.200], c: 'brassDark', m: 'brass' },
  { s: 'cyl', d: [.002, .03, .016, 10], at: [-.176, -.455, -.200], c: 'brass', m: 'brass' }, { s: 'cyl', d: [.022, .008, .014, 10], at: [-.176, -.42, -.200], c: 'brassDark', m: 'brass' },
] };
const harness = (s) => ({ use: 'strap', color: 'leather', closed: false, width: .024, n: 34, anchor: { at: .5, size: .014, color: 'brass' }, path: [
  { th: s * 28, y: 'belt', dy: .05, off: .03 }, { th: s * 36, y: 'chest', dy: 0, off: .03 }, { th: s * 62, y: 'shoulder', dy: .012, off: .024 }, { th: s * 118, y: 'shoulder', dy: .012, off: .024 },
  { th: s * 160, y: 'chest', dy: .03, off: .028 }, { th: s * 192, y: 'ribs', dy: 0, off: .028 }, { th: s * 208, y: 'belt', dy: .05, off: .03 } ] });

export default {
  id: 'oath-14-sorcerer', sheet: 'reference-064', title: 'Escapement Sorcerer',
  palette: {
    cloth: '#28444e', teal: '#28444e', tealDark: '#1c333b', ivory: '#d8cfba', ivoryShade: '#b9b09b', brass: '#96773a', brassDark: '#6a5329', glass: '#2c2b28', charcoal: '#2c2927',
    leather: '#3b2d24', leatherDark: '#27201c', iron: '#b28c46', boot: '#2a2421', sole: '#70562a', glove: '#221f1e', hair: '#1c1817', hairWarm: '#34292a', tie: '#1c1817',
  },
  build: { width: .98, depth: 1.0, bust: .024, waist: .88, hips: 1.1, arm: .94, leg: 1.02, neck: .92 },
  keep: ['weapon'],
  builders: C,
  groom: { hair: false, gear: false },
  parts: [
    { use: 'neck' },
    { use: 'shirt', color: 'teal', sleeve: 1.06, flare: .01, off: .01, cap: .016, slack: .003 },
    { use: 'wrap', limb: 'arm', from: 1.02, to: 1.96, color: 'charcoal', off: .004, pitch: .03 },
    // Wrap front: ivory facing under a teal flap that crosses from the left shoulder, buttoned along its edge.
    { use: 'c:patch', color: 'ivory', trim: 'brass', trimMat: 'brass', trimWidth: .004, edges: [1, 2], off: .011, quads: [[[-58, 'shoulder', -.02], [-14, 'base', -.012], [-4, 'ribs', -.02], [-56, 'ribs', 0]]] },
    { use: 'c:patch', color: 'tealDark', trim: 'brass', trimMat: 'brass', trimWidth: .004, edges: [3, 2], off: .015, quads: [[[14, 'base', -.012], [66, 'shoulder', -.012], [72, 'waist', 0], [-42, 'waist', .0]]] },
    ...[.2, .5, .8].map((f) => ({ use: 'c:kit', name: 'button', on: { y: 'chest', dy: .075 - f * .19, th: 12 - f * 48, off: .022, skin: 'spine2' }, parts: [{ s: 'dome', d: [.007, .005, 8], c: 'brass', m: 'brass' }] })),
    harness(1), harness(-1),
    { use: 'c:collar', color: 'teal', lining: 'ivory', trim: 'brass', trimMat: 'brass', height: .07, back: .012, tip: .012, flare: .04, gap: 30, off: .014 },
    { use: 'trousers', color: 'charcoal', gather: 1.62, bag: .018, pleats: 7, pockets: [], cuff: .008 },
    { use: 'band', limb: 'leg', at: 1.16, width: .026, off: .014, thick: .005, color: 'leather', trim: null, buckle: { phi: 60, color: 'brass' } },
    // Coat skirt: ivory enamel-cloth under-layer hanging long at the back, teal over it cut to a point at the front.
    { use: 'c:drape', from: -150, to: 210, hem: [[-150, .6], [-90, .66], [-30, .58], [20, .7], [90, .64], [150, .56], [180, .4], [210, .56]], color: 'ivory', off: .02, flare: 1.3, clear: .03, fold: .03, kick: .03, trim: 'brass', trimMat: 'brass', trimWidth: .004 },
    { use: 'c:drape', from: -160, to: 200, hem: [[-160, .72], [-100, .78], [-40, .7], [14, .56], [50, .78], [110, .76], [160, .6], [200, .72]], color: 'teal', off: .028, flare: 1.3, clear: .036, fold: .024, kick: .03, trim: 'brass', trimMat: 'brass', trimWidth: .005 },
    { use: 'belt', height: .04, thick: .008, off: .034, color: 'leather', buckle: 'brass', keepers: [40, -40, 150, -150], buckleSize: [.024, .022] },
    { use: 'belt', rise: -.03, height: .014, thick: .004, off: .04, color: 'leatherDark', buckle: null, keepers: [], tilt: .018 },
    // Glass and brass instrument case on the left hip.
    { use: 'c:kit', name: 'case', on: { y: 'belt', dy: -.07, th: 60, off: .048, skin: 'hips' }, parts: [
      { s: 'rbox', d: [.032, .046, .018, .004], c: 'glass', m: 'glass' },
      { s: 'rbox', d: [.035, .006, .021, .002], at: [0, .042, 0], c: 'brass', m: 'brass' }, { s: 'rbox', d: [.035, .006, .021, .002], at: [0, -.042, 0], c: 'brass', m: 'brass' },
      { s: 'rbox', d: [.005, .046, .021, .002], at: [.031, 0, 0], c: 'brass', m: 'brass' }, { s: 'rbox', d: [.005, .046, .021, .002], at: [-.031, 0, 0], c: 'brass', m: 'brass' },
      { s: 'rbox', d: [.004, .044, .003, .001], at: [0, 0, .019], c: 'brass', m: 'brass' }, { s: 'rbox', d: [.012, .03, .004, .002], at: [0, .07, -.008], c: 'leather', m: 'leather' },
    ] },
    cuff,
    { use: 'gloveCuff', from: 1.9, to: 2.05, color: 'glove' },
    { use: 'hands', glove: 'glove', fingerless: true },
    pendulum,
    { use: 'boots', top: 1.56, straps: 3, strapColor: 'leather', buckle: 'brass', toeCap: 'brassDark', heelPlate: 'brassDark', plateMat: 'iron', soleHeight: .04 },
    // Hair twisted up into a loose knot on the crown, strands left free at the temples and nape.
    { use: 'hair', style: 'bun', streak: 'hairWarm', fringe: .34, knot: { at: [0, .6, -.1], radius: .15, tie: 'tie' } },
    { use: 'c:strands', width: .05, list: [[150, -.05, .2, .02, 0], [-150, -.05, .22, .02, 0], [78, .12, .3, .02, 0], [-78, .12, .32, .02, 0]] },
  ],
};
