// 14 NINJA - TIME & MOTION - Escapement Road. Read from assets/references/reference-065 (woven petrol teal,
// graphite leather, aged brass; attachments: hip flywheel axle, ankle strut).
import { C } from '../builders-c.js';

const TAU = Math.PI * 2;
const around = (n, fn) => Array.from({ length: n }, (_, i) => fn(i / n * TAU, i / n * 360));
// Flywheel: a toothed brass wheel on an axle plate, spoked, with a lit hub. Built facing out from the hip (+z).
const flywheel = { use: 'c:kit', name: 'flywheel', on: { y: 'belt', dy: -.085, th: 50, off: .03, skin: 'hips', turn: [0, 0, 0] }, parts: [
  { s: 'rbox', d: [.03, .05, .005, .003], at: [0, .06, 0], c: 'leather', m: 'leather' },
  { s: 'cyl', d: [.078, .006, .078, 24], rot: [90, 0, 0], at: [0, 0, .012], c: 'brassDark', m: 'brass' },
  { s: 'ring', d: [.074, .074, .009, 28, 7], at: [0, 0, .022], c: 'brass', m: 'brass' },
  { s: 'ring', d: [.05, .05, .006, 22, 6], at: [0, 0, .026], c: 'brass', m: 'brass' },
  ...around(14, (a, deg) => ({ s: 'box', d: [.0075, .009, .006], at: [Math.cos(a) * .086, Math.sin(a) * .086, .02], rot: [0, 0, deg - 90], c: 'brass', m: 'brass' })),
  ...around(6, (a, deg) => ({ s: 'box', d: [.004, .024, .004], at: [Math.cos(a) * .05, Math.sin(a) * .05, .024], rot: [0, 0, deg - 90], c: 'brassDark', m: 'brass' })),
  { s: 'cyl', d: [.03, .008, .026, 14], rot: [90, 0, 0], at: [0, 0, .03], c: 'graphite', m: 'steel' },
  { s: 'ring', d: [.02, .02, .0045, 14, 5], at: [0, 0, .04], c: 'brass', m: 'brass' },
  { s: 'dome', d: [.014, .008, 10], at: [0, 0, .038], c: 'amber', m: 'glow' },
  ...around(8, (a) => ({ s: 'dome', d: [.0035, .003, 6], at: [Math.cos(a) * .062, Math.sin(a) * .062, .03], c: 'brass', m: 'brass' })),
] };
// Ankle strut: a brass wheel behind the heel and one at the ankle, tied by a rod, on a clamp around the boot.
const strut = { use: 'c:kit', name: 'strut', side: 'both', on: { foot: [.0, 0, 0], skin: 'foot.L' }, parts: [
  { s: 'cyl', d: [.024, .008, .024, 14], rot: [0, 0, 90], at: [.03, .052, -.112], c: 'brass', m: 'brass' }, { s: 'cyl', d: [.011, .011, .011, 10], rot: [0, 0, 90], at: [.03, .052, -.112], c: 'brassDark', m: 'brass' },
  { s: 'cyl', d: [.019, .008, .019, 14], rot: [0, 0, 90], at: [.052, .15, -.06], c: 'brass', m: 'brass' }, { s: 'cyl', d: [.008, .011, .008, 10], rot: [0, 0, 90], at: [.052, .15, -.06], c: 'brassDark', m: 'brass' },
  { s: 'bar', d: [.006, .05, 8], rot: [-28, 0, -12], at: [.043, .1, -.086], c: 'brass', m: 'brass' },
  { s: 'rbox', d: [.012, .006, .05, .003], at: [.03, .02, -.07], c: 'brass', m: 'brass' },
  { s: 'rbox', d: [.05, .008, .012, .003], at: [.0, .05, -.094], c: 'brassDark', m: 'brass' },
] };
const slot = { use: 'c:kit', name: 'gauntlet', side: 'both', on: { limb: 'arm', t: 1.5, phi: 92, off: .011, skin: 'forearm.L' }, parts: [
  { s: 'rbox', d: [.017, .07, .005, .003], at: [0, 0, .004], c: 'brass', m: 'brass' }, { s: 'rbox', d: [.0075, .056, .003, .002], at: [0, 0, .009], c: 'amber', m: 'glow' },
  { s: 'rbox', d: [.02, .006, .006, .002], at: [0, .074, .004], c: 'brassDark', m: 'brass' }, { s: 'rbox', d: [.02, .006, .006, .002], at: [0, -.074, .004], c: 'brassDark', m: 'brass' },
] };
const vest = (s) => [[s * 12, 'base', -.01], [s * 78, 'shoulder', -.012], [s * 82, 'ribs', -.01], [s * 14, 'ribs', -.01]];

export default {
  id: 'oath-14-ninja', sheet: 'reference-065', title: 'Escapement Ninja',
  palette: {
    cloth: '#2a2b2c', graphite: '#2a2b2c', graphiteLight: '#3a3b3c', teal: '#244652', tealDark: '#1a343e', brass: '#b08a44', brassDark: '#7a5f2f', amber: '#ff8a12',
    leather: '#3a2f27', leatherDark: '#262220', iron: '#b08a44', boot: '#252323', sole: '#6f5527', glove: '#232222', hair: '#161312', visor: '#2a2725',
  },
  build: { width: 1.1, depth: 1.06, waist: 1.06, arm: 1.2, leg: 1.1, neck: 1.06, shoulder: 1.06 },
  keep: ['weapon'],
  builders: C,
  groom: { hair: false, gear: false },
  parts: [
    { use: 'neck' },
    { use: 'skinLimb', limb: 'arm', from: -.15, to: 1.0 },
    { use: 'c:kit', name: 'skinLimb', side: 'both', on: { bone: 'upperarm.L' }, parts: [{ s: 'ball', d: [.07, .067, .07, 14, 9], c: 'skin', m: 'skin' }] },
    // Sleeveless graphite leather body with a zip; teal panels with brass piping over the chest and shoulders.
    { use: 'shirt', color: 'graphite', sleeve: 0, off: .007 },
    { use: 'c:patch', name: 'zip', color: 'brassDark', mat: 'brass', off: .009, thick: .002, quads: [[[-1.6, 'base', 0], [1.6, 'base', 0], [1.6, 'belt', .03], [-1.6, 'belt', .03]]] },
    { use: 'c:patch', name: 'vest', color: 'teal', trim: 'brass', trimMat: 'brass', trimWidth: .0045, off: .011, thick: .005, quads: [vest(1), vest(-1).map((_, i, q) => q[[1, 0, 3, 2][i]])] },
    { use: 'c:patch', name: 'vest', color: 'teal', trim: 'brass', trimMat: 'brass', trimWidth: .0045, off: .011, thick: .005, edges: [1, 2, 3], quads: [[[104, 'shoulder', -.012], [256, 'shoulder', -.012], [258, 'ribs', -.01], [102, 'ribs', -.01]]] },
    { use: 'c:collar', color: 'teal', lining: 'graphite', trim: 'brass', trimMat: 'brass', height: .058, back: .01, flare: .024, gap: 26, off: .013 },
    // Leather gauntlets from above the elbow, with a lit brass slot along the forearm.
    { use: 'bracer', from: .88, to: 1.93, color: 'graphiteLight', strapColor: 'leatherDark', straps: [.94, 1.86], buckle: null },
    slot,
    { use: 'gloveCuff', from: 1.88, to: 2.05, color: 'glove', strap: 'leatherDark' },
    { use: 'hands', glove: 'glove', fingerless: true, knuckles: 'leatherDark' },
    { use: 'trousers', color: 'graphite', gather: 1.72, bag: .02, pleats: 6, cuff: .008, piping: 'brassDark', pipingPaths: [[88, 86, .05, 1.6]] },
    { use: 'c:kit', name: 'pocket', side: 'both', on: { limb: 'leg', t: .62, phi: 84, off: .026 }, parts: [
      { s: 'rbox', d: [.04, .05, .01, .005], at: [0, 0, .006], c: 'graphiteLight', m: 'leather' }, { s: 'rbox', d: [.043, .018, .012, .004], at: [0, .036, .008], c: 'graphite', m: 'leather' },
      { s: 'dome', d: [.004, .003, 6], at: [0, .026, .02], c: 'brass', m: 'brass' } ] },
    // Tabards: teal at the right front and down the back, a riveted leather panel over the left hip.
    { use: 'c:drape', from: -62, to: 2, hem: [[-62, .5], [2, .58]], color: 'teal', off: .03, flare: 1.08, clear: .034, fold: .012, trim: 'brass', trimMat: 'brass', trimWidth: .005 },
    { use: 'c:drape', from: 148, to: 212, hem: [[148, .56], [180, .42], [212, .56]], color: 'teal', off: .03, flare: 1.1, clear: .034, fold: .012, trim: 'brass', trimMat: 'brass', trimWidth: .005 },
    { use: 'c:drape', from: 10, to: 96, hem: [[10, .7], [96, .64]], color: 'leatherDark', mat: 'leather', off: .028, flare: 1.06, clear: .032, fold: .008, trim: 'brassDark', trimMat: 'brass', trimWidth: .004 },
    { use: 'belt', rise: .012, height: .04, thick: .008, off: .034, color: 'leather', buckle: 'brass', keepers: [36, -36, 150, -150], buckleSize: [.026, .022], studs: 0 },
    { use: 'belt', rise: -.03, height: .016, thick: .005, off: .04, color: 'leatherDark', buckle: null, keepers: [], tilt: -.02 },
    { use: 'c:hose', name: 'chain', links: 15, wire: .003, color: 'brass', mat: 'brass', path: [{ on: { y: 'belt', dy: -.03, th: -30, off: .042, skin: 'hips' } }, { on: { y: 'belt', dy: -.11, th: -62, off: .06, skin: 'hips' } }, { on: { y: 'belt', dy: -.03, th: -100, off: .042, skin: 'hips' } }] },
    flywheel,
    { use: 'boots', top: 1.68, straps: 2, strapColor: 'leatherDark', buckle: 'brass', toeCap: 'graphiteLight', plateMat: 'iron', soleHeight: .036 },
    { use: 'band', limb: 'leg', at: 1.72, width: .022, off: .02, thick: .005, color: 'brassDark', mat: 'iron' },
    strut,
    // Slatted visor: a dark band over the eyes, three brass slats and the amber light between them.
    { use: 'c:headBand', name: 'visor', y: -.005, height: .17, phi: [-84, 84], off: .03, thick: .03, color: 'visor', mat: 'steel' },
    { use: 'c:headBand', name: 'visor', y: -.005, height: .13, phi: [-70, 70], off: .062, thick: .004, color: 'amber', mat: 'glow' },
    { use: 'c:headBand', name: 'visor', y: .052, height: .034, phi: [-80, 80], off: .058, thick: .016, color: 'brass', mat: 'brass' },
    { use: 'c:headBand', name: 'visor', y: -.005, height: .03, phi: [-80, 80], off: .058, thick: .016, color: 'brass', mat: 'brass' },
    { use: 'c:headBand', name: 'visor', y: -.062, height: .034, phi: [-80, 80], off: .058, thick: .016, color: 'brass', mat: 'brass' },
    { use: 'c:headBand', name: 'visor', y: .0, height: .09, phi: [80, 280], off: .03, thick: .012, color: 'leatherDark' },
    { use: 'c:kit', name: 'visor', side: 'both', on: { head: [.375, 0, .06] }, parts: [{ s: 'cyl', d: [.05, .014, .05, 12], rot: [0, 0, 90], c: 'brass', m: 'brass' }, { s: 'cyl', d: [.022, .02, .022, 8], rot: [0, 0, 90], c: 'brassDark', m: 'brass' }] },
    { use: 'c:curls', lift: .03, top: .075, fade: .2, fringe: .33 },
  ],
};
