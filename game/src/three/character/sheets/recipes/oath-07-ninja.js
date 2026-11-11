// 07 NINJA - NATURE - Graft Sanctuary. Read from assets/references/reference-079 (front, back, side,
// three-quarter, face, materials: living bark, moss fibre, straw weave, sap plug; shoulder plate graft and
// forearm guard join).
import { B } from '../builders-b.js';

export default {
  id: 'oath-07-ninja', sheet: 'reference-079', title: 'Graft Ninja',
  palette: {
    under: '#2c2621', cloth: '#352c24', trouser: '#3a3027', bark: '#6b4a30', barkDark: '#43301f', barkLight: '#8a6844', green: '#5c6a30', greenDark: '#44502a',
    moss: '#3c4a1e', mossLight: '#6c7830', straw: '#b08c4a', leather: '#3e2f24', leatherDark: '#2a211b', iron: '#4a4541', ember: '#c8700e', glove: '#2a231e', boot: '#3f3022', sole: '#231c16', hair: '#1c1512',
  },
  build: { width: 1.14, depth: 1.12, hips: 1.02, waist: 1.04, arm: 1.3, leg: 1.14, neck: 1.15, shoulder: 1.1 },
  keep: ['weapon'],
  builders: B,
  groom: { hair: false, gear: false },
  parts: [
    { use: 'b.sleeve', from: -.14, to: 1.2, color: 'skin', mat: 'skin', off: 0 },
    { use: 'b.torso', from: ['belt', -.02], to: 'base', color: 'under', off: .006, slack: .002 },
    { use: 'b.neck', color: 'under', mat: 'cloth', off: .005, ribs: 3 },
    { use: 'band', limb: 'arm', at: .8, width: .03, off: .004, thick: .005, color: 'leather', buckle: { phi: 60 } },
    // Bark breastplate with crossing bark straps and the green sash from the left shoulder.
    { use: 'b.torso', from: ['waist', .02], to: ['chest', .03], arc: [-72, 72], color: 'bark', mat: 'bark', off: .013, ribs: 14, ribDepth: .005 },
    { use: 'b.strip', color: 'barkDark', mat: 'bark', width: .034, thick: .009, closed: true, n: 80, border: 'barkLight', path: [
      { th: -66, y: ['shoulder', .01], off: .02 }, { th: -20, y: ['chest', .01], off: .024 }, { th: 62, y: ['waist', .03], off: .022 }, { th: 150, y: ['ribs', .0], off: .02 }, { th: 215, y: ['chest', .03], off: .02 }, { th: 268, y: ['armpit', .05], off: .02 } ] },
    { use: 'b.strip', color: 'green', mat: 'cloth', width: .04, thick: .005, closed: true, n: 80, path: [
      { th: 62, y: ['shoulder', .012], off: .028 }, { th: 18, y: ['chest', .0], off: .032 }, { th: -62, y: ['waist', .05], off: .028 }, { th: -150, y: ['ribs', .0], off: .026 }, { th: -212, y: ['chest', .04], off: .026 }, { th: -264, y: ['armpit', .05], off: .026 } ] },
    { use: 'trousers', color: 'trouser', gather: 1.17, bag: .04, pockets: [], pleats: 11 },
    { use: 'band', limb: 'leg', at: 1.19, width: .04, color: 'leather', trim: 'green' },
    { use: 'wrap', limb: 'leg', from: 1.22, to: 1.8, color: 'barkDark', off: .005, pitch: .05, depth: .005, mat: 'leather' },
    { use: 'b.guard', limb: 'leg', from: 1.26, to: 1.74, phi: 0, arc: 70, off: .012, thick: .009, color: 'bark', mat: 'bark', grooves: 7, point: .06, pointTop: .06 },
    { use: 'boots', top: 1.76, color: 'boot', sole: 'sole', straps: 0, bulk: 1.12 },
    { use: 'b.spikes', limb: 'leg', from: 1.74, to: 2.02, phi: 0, arc: 150, count: 9, length: .05, radius: .011, off: .02, lean: -.95, color: 'bark', tip: 'barkLight' },
    { use: 'b.shag', on: 'leg', side: 'both', from: 1.72, to: 1.95, phi: 0, arc: 170, count: 26, length: .03, width: .011, off: .026 },
    // Waist: wound green and bark-brown sashes, straw tassets bordered in green, bark centre panels.
    { use: 'b.sash', bands: [
      { y: ['belt', .03], h: .05, tilt: .018, phase: 0, off: .012, color: 'green' }, { y: ['belt', -.01], h: .046, tilt: -.02, phase: 30, off: .015, color: 'barkDark', mat: 'leather' }, { y: ['belt', .012], h: .03, tilt: .03, phase: 100, off: .019, color: 'greenDark' } ] },
    { use: 'b.hang', at: 180, top: ['belt', 0], bottom: .64, width: [.07, .075], color: 'cloth', off: .01 },
    { use: 'b.hang', at: 50, top: ['belt', 0], bottom: .7, width: [.075, .09], color: 'straw', mat: 'straw', border: 'green', borderWidth: .016, off: .014, weave: 6, point: .02, skew: -.6 },
    { use: 'b.hang', at: -50, top: ['belt', 0], bottom: .7, width: [.075, .09], color: 'straw', mat: 'straw', border: 'green', borderWidth: .016, off: .014, weave: 6, point: .02, skew: .6 },
    { use: 'b.hang', at: 130, top: ['belt', 0], bottom: .7, width: [.07, .085], color: 'straw', mat: 'straw', border: 'green', borderWidth: .016, off: .014, weave: 6 },
    { use: 'b.hang', at: -130, top: ['belt', 0], bottom: .7, width: [.07, .085], color: 'straw', mat: 'straw', border: 'green', borderWidth: .016, off: .014, weave: 6 },
    { use: 'b.hang', at: 0, top: ['belt', .01], bottom: .72, width: [.05, .038], point: .05, color: 'barkDark', mat: 'bark', border: 'bark', off: .02, thick: .008 },
    // Right shoulder: layered bark shards. Left shoulder and chest: a mantle of moss.
    { use: 'b.guard', limb: 'arm', side: 'R', from: -.42, to: -.02, layers: 3, step: .17, phi: 90, arc: 78, off: .014, thick: .011, point: .12, flareEnd: .012, color: 'bark', mat: 'bark', grooves: 6, trim: 'barkLight', trimWidth: .006, skin: [['shoulder.L', .5], ['upperarm.L', .5]] },
    { use: 'b.studs', on: 'arm', side: 'R', at: [[.02, 60]], r: .016, off: .034, color: 'ember', rim: 'barkDark', rimMat: 'bark', oval: 1.4 },
    { use: 'b.guard', limb: 'arm', side: 'L', from: -.42, to: .5, phi: 90, arc: 105, off: .012, thick: .01, bulge: .016, color: 'moss', mat: 'moss', skin: [['shoulder.L', .5], ['upperarm.L', .5]] },
    { use: 'b.shag', on: 'arm', side: 'L', from: -.42, to: .58, phi: 90, arc: 115, count: 150, length: .06, width: .016, off: .024 },
    { use: 'b.shag', on: 'trunk', y: [['chest', .02], ['shoulder', .0]], th: [18, 165], count: 90, length: .055, width: .016, off: .026 },
    // Forearms: bark guards bristling with branch stubs, set with sap plugs.
    { use: 'b.guard', limb: 'arm', from: 1.12, to: 1.92, arc: 180, off: .012, thick: .01, flare: .012, color: 'bark', mat: 'bark', grooves: 5 },
    { use: 'b.spikes', limb: 'arm', from: 1.14, to: 1.8, phi: 90, arc: 95, count: 12, length: .12, radius: .015, off: .018, lean: .72, color: 'bark', tip: 'barkLight' },
    { use: 'b.studs', on: 'arm', at: [[1.42, 30], [1.68, 20]], r: .014, off: .024, color: 'ember', rim: 'barkDark', rimMat: 'bark', oval: 1.5 },
    { use: 'band', limb: 'arm', at: 1.16, width: .022, off: .024, thick: .005, color: 'leatherDark', buckle: { phi: -40 } },
    { use: 'gloveCuff', color: 'glove', from: 1.9, to: 2.05, off: .007 },
    { use: 'b.hairCap', color: 'hair', front: .3, side: .2, nape: .05, lift: .03, curl: .03, freq: 10 },
    { use: 'b.seedMask', height: .7 },
    { use: 'hands', glove: 'glove', fingerless: true },
  ],
};
