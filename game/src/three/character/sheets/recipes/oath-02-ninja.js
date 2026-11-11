// 02 NINJA - FROST - Rime Archive. Read from assets/references/reference-089 (front, back, side, three-quarter,
// face, materials: quilted felt, dark leather, rime laminate; attachments: shoulder strap, bracer mount).
import { A } from '../builders-a.js';

const harness = (s) => ({ use: 'strap', color: 'webbing', closed: false, width: .026, thick: .005, anchor: { at: .2, size: .017, color: 'buckle' }, n: 34, path: [
  { th: s * 21, y: 'belt', dy: .02, off: .03 }, { th: s * 22, y: 'ribs', off: .03 }, { th: s * 25, y: 'armpit', dy: .0, off: .03 }, { th: s * 55, y: 'shoulder', dy: -.02, off: .022 },
  { th: s * 125, y: 'shoulder', dy: -.02, off: .022 }, { th: s * 152, y: 'armpit', off: .03 }, { th: s * 157, y: 'ribs', off: .03 }, { th: s * 158, y: 'belt', dy: .02, off: .03 } ] });

export default {
  id: 'oath-02-ninja', sheet: 'reference-089', title: 'Rime Ninja',
  palette: {
    felt: '#2a2c30', feltDark: '#1d1f22', vest: '#cdc9bf', lining: '#d6d2c8', stitch: '#8f8b83', webbing: '#5f6062', buckle: '#8d8e90', piping: '#7b7d80',
    leather: '#232427', leatherDark: '#18191b', iron: '#77797c', ice: '#cfe3ec', frost: '#eef3f4', boot: '#222326', sole: '#b4b0a7', bumper: '#9d9a92', glove: '#1a1b1d',
    hair: '#16151a',
  },
  build: { width: 1.08, depth: 1.06, hips: 1.24, waist: .98, bust: .028, leg: 1.3, arm: 1.2, shoulder: 1.04 },
  keep: ['weapon'],
  builders: A,
  groom: { hair: false, gear: false },
  parts: [
    { use: 'neck' },
    { use: 'skinLimb', limb: 'arm', from: .6, to: 1.12 },
    { use: 'a/bodysuit', color: 'felt', trunk: ['crotch', 'belt+.03'], legs: [-.155, 1.72], off: .008 },
    { use: 'a/bodysuit', color: 'feltDark', trunk: null, arms: [1.04, 1.96], off: .005 },
    { use: 'band', limb: 'arm', at: 1.05, width: .016, off: .005, thick: .003, color: 'leatherDark' },
    { use: 'shirt', color: 'felt', sleeve: .86, flare: .05, cap: .03, off: .013, slack: .003, trim: 'feltDark', trimWidth: .02 },
    // Quilted vest panels, front and back, and the quilted hip panels below the belt.
    { use: 'panel', color: 'vest', mat: 'cloth', at: 0, from: 'armpit', to: 'belt', width: [.14, .13], off: .009, thick: .008, round: .012 },
    { use: 'panel', color: 'vest', mat: 'cloth', at: 180, from: 'armpit', to: 'belt', width: [.145, .135], off: .009, thick: .008, round: .012 },
    { use: 'a/lines', on: 'trunk', quilt: { a: [-50, 50], b: ['belt+.012', 'armpit-.012'], pitch: .048 }, color: 'stitch', width: .0035, off: .0215, name: 'quilting' },
    { use: 'a/lines', on: 'trunk', quilt: { a: [128, 232], b: ['belt+.012', 'armpit-.012'], pitch: .048 }, color: 'stitch', width: .0035, off: .0215, name: 'quilting' },
    { use: 'panel', color: 'vest', mat: 'cloth', at: 70, from: 'belt', to: .86, width: [.105, .05], off: .011, thick: .006, round: .04, border: 'piping', borderWidth: .005 },
    { use: 'panel', color: 'vest', mat: 'cloth', at: -70, from: 'belt', to: .86, width: [.105, .05], off: .011, thick: .006, round: .04, border: 'piping', borderWidth: .005 },
    harness(1), harness(-1),
    { use: 'a/lines', on: 'trunk', paths: [[[150, 'chest+.03'], [180, 'chest+.03'], [210, 'chest+.03']]], color: 'webbing', mat: 'webbing', width: .026, thick: .005, off: .031, name: 'harness' },
    { use: 'a/kit', name: 'harness', on: 'trunk', y: 'chest+.03', th: 180, off: .036, items: [{ s: 'box', size: [.02, .017, .004], color: 'buckle', mat: 'steel' }, { s: 'box', size: [.012, .009, .005], color: 'feltDark', mat: 'hollow' }] },
    { use: 'belt', color: 'leatherDark', buckle: 'iron', height: .04, off: .019, keepers: [38, -38, 140, -140] },
    { use: 'a/collar', color: 'felt', lining: 'lining', height: .085, flare: .016, off: .016, trim: 'lining' },
    { use: 'a/hood', color: 'felt', lining: 'lining' },
    { use: 'a/fringe', color: 'hair', from: .45, to: .16 },
    // Rime laminate bracers on their strap mounts.
    { use: 'band', limb: 'arm', at: 1.32, width: .022, off: .008, thick: .004, color: 'webbing', buckle: { phi: 20, color: 'buckle' } },
    { use: 'band', limb: 'arm', at: 1.7, width: .022, off: .008, thick: .004, color: 'webbing', buckle: { phi: 20, color: 'buckle' } },
    { use: 'a/plates', on: 'arm', list: [{ at: [95, 1.5], size: [.125, .22] }], color: 'ice', mat: 'ice', border: 'frost', borderMat: 'ice', borderWidth: .009, thick: .02, off: .014, r: .02, name: 'bracer' },
    { use: 'gloveCuff', color: 'glove', strap: 'webbing' },
    // Trouser seams, thigh rig and knee pads.
    { use: 'a/lines', on: 'leg', paths: [[[52, -.02], [30, .3], [22, .62], [50, .93]], [[96, .0], [93, .8], [92, 1.6]], [[150, .1], [135, .5], [120, .9]]], color: 'piping', width: .005, off: .0095 },
    { use: 'band', limb: 'leg', at: .5, width: .026, off: .009, thick: .005, color: 'leatherDark', buckle: { phi: 30, color: 'buckle' } },
    { use: 'a/kit', name: 'holster', on: 'leg', side: 'R', t: .3, phi: 95, off: .012, items: [
      { s: 'box', size: [.026, .05, .014], color: 'leather', mat: 'leather', r: .006 }, { s: 'box', size: [.027, .016, .016], at: [0, .036, 0], color: 'leatherDark', mat: 'leather', r: .005 }, { s: 'dome', r: .005, at: [0, .026, .016], color: 'buckle', mat: 'steel' } ] },
    { use: 'a/kit', name: 'knee', on: 'leg', side: 'both', t: 1.0, phi: 0, off: .004, items: [
      { s: 'ball', size: [.062, .076, .034], at: [0, -.006, 0], color: 'leather', mat: 'leather' }, { s: 'ball', size: [.044, .055, .022], at: [0, -.008, .02], color: 'leatherDark', mat: 'leather' } ] },
    { use: 'band', limb: 'leg', at: 1.16, width: .02, off: .008, thick: .004, color: 'leatherDark' },
    { use: 'boots', color: 'boot', sole: 'sole', top: 1.66, toeCap: 'bumper', heelPlate: 'bumper', cuff: 'bumper', plateMat: 'leather', straps: 3, strapColor: 'leatherDark', buckle: 'buckle', bulk: 1.5, soleHeight: .054 },
    { use: 'hands', glove: 'glove', fingerless: true, scale: .95 },
  ],
};
