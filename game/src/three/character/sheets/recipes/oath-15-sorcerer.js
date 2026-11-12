// 15 SORCERER - TECH & FORCE - Impulse Foundry. Read from assets/references/reference-062 (graphite cloth with
// burnt orange lining, oxidized steel alloy, burnt orange ceramic inserts; attachments: power pack, gauntlet actuator).
import { C } from '../builders-c.js';

const TAU = Math.PI * 2;
const around = (n, fn) => Array.from({ length: n }, (_, i) => fn(i / n * TAU, i / n * 360));
const clasp = (y, dy) => ({ use: 'c:kit', name: 'clasp', on: { y, dy, th: 0, off: .02 }, parts: [
  { s: 'rbox', d: [.04, .008, .003, .002], c: 'leatherDark', m: 'leather' },
  { s: 'rbox', d: [.013, .015, .005, .002], at: [-.012, 0, .004], c: 'steel', m: 'steel' }, { s: 'rbox', d: [.013, .015, .005, .002], at: [.016, 0, .004], c: 'brass', m: 'brass' },
] });
const harness = (s) => ({ use: 'strap', color: 'leather', closed: false, width: .03, n: 34, anchor: { at: .3, size: .017, color: 'steel' }, path: [
  { th: s * 30, y: 'belt', dy: .05, off: .032 }, { th: s * 32, y: 'chest', dy: 0, off: .032 }, { th: s * 40, y: 'armpit', dy: .03, off: .028 }, { th: s * 64, y: 'shoulder', dy: .014, off: .026 },
  { th: s * 118, y: 'shoulder', dy: .014, off: .026 }, { th: s * 150, y: 'armpit', dy: .02, off: .03 }, { th: s * 160, y: 'ribs', dy: 0, off: .032 } ] });
// Power pack: a steel-framed block on the upper back with ceramic doors, a lit cell and two side canisters.
const pack = { use: 'c:kit', name: 'pack', on: { bone: 'spine2', at: [0, .1, -.205] }, parts: [
  { s: 'rbox', d: [.1, .165, .056, .008], c: 'steelDark', m: 'iron' },
  { s: 'rbox', d: [.062, .1, .008, .004], at: [0, -.01, -.056], c: 'orange', m: 'ceramic' }, { s: 'rbox', d: [.072, .022, .012, .004], at: [0, .12, -.052], c: 'steel', m: 'steel' },
  { s: 'rbox', d: [.012, .07, .004, .002], at: [0, .0, -.066], c: 'cyan', m: 'glow' }, { s: 'rbox', d: [.02, .08, .006, .003], at: [0, .0, -.062], c: 'steelDark', m: 'steel' },
  ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sy]) => ({ s: 'rbox', d: [.014, .014, .056, .003], at: [sx * .09, sy * .138, 0], c: 'brass', m: 'brass' })),
  ...[1, -1].flatMap((sx) => [
    { s: 'rbox', d: [.04, .13, .046, .008], at: [sx * .142, .05, .006], c: 'steelDark', m: 'iron' }, { s: 'rbox', d: [.03, .08, .006, .003], at: [sx * .142, .05, -.046], c: 'orange', m: 'ceramic' },
    { s: 'rbox', d: [.038, .012, .044, .003], at: [sx * .142, .17, .006], c: 'steel', m: 'steel' }, { s: 'rbox', d: [.038, .012, .044, .003], at: [sx * .142, -.07, .006], c: 'steel', m: 'steel' },
    { s: 'rbox', d: [.004, .05, .008, .002], at: [sx * .186, .05, .006], c: 'cyan', m: 'glow' },
    { s: 'cyl', d: [.016, .02, .013, 10], at: [sx * .142, .2, .0], c: 'steelDark', m: 'steel' },
  ]),
  { s: 'rbox', d: [.05, .01, .03, .003], at: [0, .158, .0], c: 'steel', m: 'steel' }, { s: 'rbox', d: [.03, .012, .012, .003], at: [0, -.156, -.03], c: 'brass', m: 'brass' },
] };
// Gauntlet actuator: a steel drum around the forearm with ceramic shoes, lit cells and collars at both ends.
const gauntlet = { use: 'c:kit', name: 'gauntlet', side: 'both', on: { limb: 'arm', t: 1.5, phi: 90, off: 0, skin: 'forearm.L' }, parts: (() => {
  const z = -.046, R = .078;
  return [
    { s: 'cyl', d: [R, .115, R * .94, 16], at: [0, 0, z], c: 'steel', m: 'iron' },
    { s: 'cyl', d: [R + .012, .014, R + .012, 16], at: [0, .1, z], c: 'steel', m: 'steel' }, { s: 'cyl', d: [R + .008, .012, R + .008, 16], at: [0, -.1, z], c: 'steel', m: 'steel' },
    { s: 'cyl', d: [R + .005, .006, R + .005, 16], at: [0, .03, z], c: 'brass', m: 'brass' }, { s: 'cyl', d: [R - .006, .018, R - .02, 14], at: [0, -.126, z], c: 'steelDark', m: 'steel' },
    ...around(4, (a, deg) => ({ s: 'rbox', d: [.026, .05, .008, .004], at: [Math.cos(a + .785) * (R + .006), -.034, z + Math.sin(a + .785) * (R + .006)], rot: [0, 90 - deg - 45, 0], c: 'orange', m: 'ceramic' })),
    ...around(4, (a, deg) => ({ s: 'rbox', d: [.007, .05, .004, .002], at: [Math.cos(a) * (R + .004), -.034, z + Math.sin(a) * (R + .004)], rot: [0, 90 - deg, 0], c: 'cyan', m: 'glow' })),
    { s: 'rbox', d: [.026, .03, .012, .004], at: [0, .07, z + R + .008], c: 'steel', m: 'steel' }, { s: 'cyl', d: [.016, .016, .016, 10], at: [0, .104, z + R + .012], c: 'steelDark', m: 'steel' },
  ];
})() };

export default {
  id: 'oath-15-sorcerer', density: 0.93, sheet: 'reference-062', title: 'Impulse Foundry Sorcerer',
  palette: {
    cloth: '#39383a', graphite: '#39383a', graphiteDark: '#29282a', graphiteLight: '#4a494b', orange: '#c2571f', orangeDark: '#93421a', lining: '#b9551f', steel: '#96928b', steelDark: '#55524f', brass: '#9a7c46', cyan: '#1fb8d6',
    leather: '#4a3a2c', leatherDark: '#2c2420', iron: '#96928b', rubber: '#1c1c1d', boot: '#2c2a29', sole: '#1e1d1d', hair: '#15110f',
  },
  build: { width: 1.12, depth: 1.1, waist: 1.12, hips: 1.06, arm: 1.14, leg: 1.12, neck: 1.06, shoulder: 1.08 },
  keep: ['weapon'],
  builders: C,
  groom: { hair: false, gear: false, beard: false },
  parts: [
    { use: 'neck' },
    { use: 'shirt', color: 'graphite', sleeve: 1.16, flare: .014, off: .013, cap: .02, slack: .004 },
    // Layered shoulder caps and the sleeve's hem, piped in orange.
    { use: 'c:bellSleeve', name: 'shoulder', color: 'graphite', trim: 'orange', trimWidth: .006, from: -.13, to: .34, wide: .024, drop: 0, off: .024, power: 1 },
    { use: 'band', limb: 'arm', at: 1.12, width: .018, off: .03, thick: .004, color: 'orangeDark', mat: 'cloth' },
    { use: 'c:patch', color: 'graphiteDark', off: .014, thick: .003, trim: 'brass', trimMat: 'brass', trimWidth: .004, edges: [1, 3], quads: [[[-9, 'base', -.02], [9, 'base', -.02], [8, 'belt', .03], [-8, 'belt', .03]]] },
    clasp('armpit', .03), clasp('chest', -.014), clasp('ribs', -.012), clasp('waist', -.012),
    harness(1), harness(-1),
    { use: 'trousers', color: 'graphiteDark', gather: 1.62, bag: .022, pleats: 7, pockets: [], cuff: .01 },
    // Long coat, open at the front on its burnt orange lining; a shorter tunic skirt shows inside it.
    { use: 'c:drape', from: -40, to: 40, hem: [[-40, .56], [0, .5], [40, .56]], off: .02, color: 'graphiteDark', flare: 1.06, clear: .03, trim: 'brass', trimMat: 'brass', trimWidth: .004 },
    { use: 'c:drape', from: 30, to: 177, hem: [[30, .27], [70, .2], [130, .24], [177, .22]], off: .032, color: 'graphite', lining: 'lining', flare: 1.34, clear: .042, kick: .04, trim: 'orange', trimWidth: .007 },
    { use: 'c:drape', from: 183, to: 330, hem: [[183, .22], [230, .24], [290, .2], [330, .27]], off: .032, color: 'graphite', lining: 'lining', flare: 1.34, clear: .042, kick: .04, trim: 'orange', trimWidth: .007 },
    { use: 'belt', height: .04, thick: .008, off: .038, color: 'leather', buckle: 'steel', keepers: [34, -34, 150, -150], buckleSize: [.024, .022] },
    { use: 'c:kit', name: 'case', on: { y: 'belt', dy: -.07, th: 56, off: .05, skin: 'hips' }, parts: [
      { s: 'rbox', d: [.034, .05, .02, .005], c: 'graphiteLight', m: 'leather' }, { s: 'rbox', d: [.037, .008, .023, .003], at: [0, .044, 0], c: 'steel', m: 'steel' }, { s: 'rbox', d: [.037, .008, .023, .003], at: [0, -.044, 0], c: 'steel', m: 'steel' },
      { s: 'rbox', d: [.006, .034, .003, .001], at: [0, 0, .021], c: 'brass', m: 'brass' }, { s: 'rbox', d: [.012, .03, .004, .002], at: [0, .072, -.008], c: 'leather', m: 'leather' } ] },
    { use: 'c:kit', name: 'case', on: { y: 'belt', dy: -.05, th: -52, off: .046, skin: 'hips' }, parts: [
      { s: 'rbox', d: [.028, .034, .016, .006], c: 'leather', m: 'leather' }, { s: 'rbox', d: [.03, .014, .018, .005], at: [0, .024, .001], c: 'leatherDark', m: 'leather' }, { s: 'dome', d: [.004, .003, 6], at: [0, .014, .018], c: 'brass', m: 'brass' } ] },
    { use: 'c:collar', color: 'graphite', lining: 'lining', trim: 'orange', height: .08, back: .012, tip: .01, flare: .04, gap: 30, off: .016 },
    pack,
    { use: 'c:hose', name: 'cable', side: 'both', r: .011, ribs: 0, seg: 9, color: 'rubber', mat: 'rubber', path: [
      { on: { bone: 'spine2', at: [.16, .2, -.19] } }, { on: { bone: 'spine2', at: [.26, .26, -.13] } }, { on: { limb: 'arm', t: .34, phi: 150, off: .09 } }, { on: { limb: 'arm', t: .9, phi: 130, off: .085 } }, { on: { limb: 'arm', t: 1.26, phi: 96, off: .075, skin: 'forearm.L' } } ] },
    gauntlet,
    { use: 'gloveCuff', from: 1.9, to: 2.06, color: 'steelDark', off: .012 },
    { use: 'hands', glove: 'steelDark', knuckles: 'steel', scale: 1.12 },
    { use: 'boots', top: 1.56, straps: 3, strapColor: 'leatherDark', buckle: 'steel', toeCap: 'graphiteLight', heelPlate: 'orangeDark', cuff: 'orangeDark', plateMat: 'ceramic', soleHeight: .044, bulk: 1.14 },
    { use: 'hair', style: 'coils', top: .035, curl: .024, fade: { to: .05, from: .22, min: .35 }, fringe: .35, count: 300, beard: { style: 'goatee', length: .035, moustache: .04, width: .1, coat: false, count: 150 } },
  ],
};
