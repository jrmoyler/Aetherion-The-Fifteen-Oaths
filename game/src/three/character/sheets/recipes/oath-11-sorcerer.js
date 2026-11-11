// 11 SORCERER - SHADOW & VOID - The Missing Court. Read from assets/references/reference-070 (ink velvet black, wool
// cloth charcoal, silver clasps; attachments: inside collar support, front clasps).
import { C } from '../builders-c.js';

const clasp = (y, dy) => ({ use: 'c:kit', name: 'clasp', on: { y, dy, th: 0, off: .019 }, parts: [
  { s: 'rbox', d: [.046, .0085, .003, .002], c: 'strap', m: 'leather' },
  { s: 'rbox', d: [.0165, .0165, .005, .003], at: [0, 0, .004], c: 'silver', m: 'silver' },
  { s: 'rbox', d: [.0105, .0105, .0015, .001], at: [0, 0, .0092], c: 'silverDark', m: 'silver' },
  { s: 'dome', d: [.003, .002, 6], at: [.04, 0, .003], c: 'silver', m: 'silver' }, { s: 'dome', d: [.003, .002, 6], at: [-.04, 0, .003], c: 'silver', m: 'silver' },
] });

export default {
  id: 'oath-11-sorcerer', sheet: 'reference-070', title: 'Missing Court Sorcerer',
  palette: {
    cloth: '#1b1a1d', velvet: '#1b1a1d', wool: '#434247', woolDark: '#343337', silver: '#b4b1a8', silverDark: '#77756f', strap: '#232124', leather: '#2a2725', leatherDark: '#1e1c1b',
    iron: '#aaa79f', boot: '#211e1c', sole: '#4a3b2e',
  },
  build: { width: 1.0, depth: 1.0, arm: .9, leg: 1.0, neck: .9 },
  keep: ['weapon'],
  builders: C,
  groom: { hair: false, gear: false },
  parts: [
    { use: 'neck' },
    { use: 'skinLimb', limb: 'arm', from: 1.5, to: 2.02 },
    // Coat body in ink velvet with fitted upper sleeves; the bell sleeves open from above the elbow.
    { use: 'shirt', color: 'velvet', sleeve: .7, flare: .012, off: .012, cap: .014, slack: .003 },
    { use: 'c:bellSleeve', color: 'velvet', lining: 'woolDark', trim: 'silver', trimMat: 'silver', trimWidth: .007, from: .5, to: 1.82, wide: .085, drop: .1 },
    // Pointed shoulder caps edged in silver.
    { use: 'c:bellSleeve', name: 'shoulder', color: 'velvet', trim: 'silver', trimMat: 'silver', trimWidth: .006, from: -.13, to: .3, wide: .022, drop: .0, off: .022, power: 1 },
    // Charcoal placket down the chest carrying four square clasps.
    { use: 'c:patch', color: 'wool', quads: [[[-9, 'base', -.02], [9, 'base', -.02], [8, 'belt', .03], [-8, 'belt', .03]]], off: .013, thick: .003, trim: 'silver', trimMat: 'silver', trimWidth: .0045, edges: [1, 3] },
    clasp('armpit', .035), clasp('chest', -.012), clasp('ribs', -.01), clasp('waist', -.01),
    // Wool under-robe to the ankle, then the velvet coat over it: open at the front, cut to points at the sides.
    { use: 'c:drape', color: 'woolDark', hem: .12, flare: 1.12, off: .01, clear: .016, folds: 13 },
    { use: 'c:drape', from: -24, to: 24, hem: .2, off: .016, color: 'wool', flare: 1.06, clear: .02, trim: 'silver', trimMat: 'silver', trimWidth: .005 },
    { use: 'c:drape', from: 16, to: 344, hem: .075, off: .024, color: 'wool', flare: 1.2, clear: .03, fold: 0 },
    { use: 'c:drape', from: 13, to: 347, off: .031, color: 'velvet', flare: 1.22, clear: .034, folds: 9, trim: 'silver', trimMat: 'silver', trimWidth: .0065,
      hem: [[13, .085], [52, .085], [90, .36], [128, .2], [152, .085], [172, .085], [180, .2], [188, .085], [208, .085], [232, .2], [270, .36], [308, .085], [347, .085]] },
    { use: 'belt', height: .026, thick: .006, off: .014, color: 'strap', buckle: 'silver', keepers: [], buckleSize: [.02, .018] },
    { use: 'c:collar', color: 'velvet', lining: 'woolDark', trim: 'silver', trimMat: 'silver', height: .095, back: 0, tip: .02, flare: .045, gap: 30, off: .016 },
    { use: 'hands' },
    { use: 'boots', top: 1.62, straps: 0, soleHeight: .03 },
  ],
};
