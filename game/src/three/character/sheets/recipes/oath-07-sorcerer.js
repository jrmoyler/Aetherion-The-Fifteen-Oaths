// 07 SORCERER - NATURE - Graft Sanctuary. Read from assets/references/reference-078 (front, back, side,
// three-quarter, face, materials: living bark, moss fibre, straw weave and sap plug; back strap hinge and side
// weave detail).
import { B } from '../builders-b.js';

export default {
  id: 'oath-07-sorcerer', sheet: 'reference-078', title: 'Graft Sorcerer',
  palette: {
    cloth: '#4e3a28', brown: '#553f2b', brownDark: '#35281d', cream: '#c9b996', burlap: '#a08458', moss: '#333c1e', mossLight: '#56612c', green: '#55652c',
    straw: '#b39763', wicker: '#9c7c52', bark: '#6a4b31', barkDark: '#48331f', leaf: '#3c6422', leafLight: '#66883a', ember: '#a04e06', leather: '#4a3626', leatherDark: '#2f241b', iron: '#4a4541',
    boot: '#46321f', sole: '#2a2018', hair: '#75726e', hairGrey: '#96938e', tie: '#6a4b31',
  },
  build: { width: 1.34, depth: 1.4, belly: .04, bust: .02, hips: 1.16, waist: 1.2, arm: 1.3, leg: 1.2, neck: 1.1, shoulder: 1.1 },
  keep: ['weapon'],
  builders: B,
  groom: { hair: false, gear: false, beard: false },
  parts: [
    { use: 'b.neck' },
    { use: 'trousers', color: 'brownDark', gather: 1.8, bag: .045, pleats: 9, pockets: [], from: 1.0 },
    { use: 'boots', top: 1.74, color: 'boot', sole: 'sole', straps: 0, bulk: 1.12 },
    { use: 'b.cords', limb: 'leg', from: 1.72, to: 1.99, turns: 1.5, color: 'bark', radius: .022, r: .005, mat: 'leather' },
    // Layers from the inside out: dark under-skirt, burlap skirt, the brown coat open at the front.
    { use: 'b.coat', color: 'brownDark', top: 'belt', hem: .27, flare: 1.42, off: .012, folds: 8 },
    { use: 'b.coat', color: 'burlap', mat: 'straw', top: 'belt', hem: .33, flare: 1.46, off: .02, folds: 6, trim: 'straw', trimWidth: .014 },
    { use: 'b.sleeve', from: 1.2, to: 1.82, off: .012, color: 'cream', shape: [[1.2, .02], [1.82, .028]], lining: 'cream' },
    { use: 'b.torso', from: ['belt', -.03], to: 'base', color: 'brown', off: .017, slack: .004 },
    { use: 'b.coat', color: 'brown', top: 'belt', hem: .4, flare: 1.5, off: .03, open: 70, folds: 7, lining: 'brownDark' },
    { use: 'b.sleeve', from: -.14, to: 1.56, off: .014, color: 'brown', shape: [[0, .014], [.8, .034], [1.56, .07]], droop: .5, lining: 'brownDark', folds: .003 },
    { use: 'b.collar', color: 'cream', height: .034, gap: 60, flare: .006, off: .012 },
    // Moss aprons front and back, the green breast wrap.
    { use: 'b.hang', at: 0, top: ['chest', .0], bottom: .35, width: [.07, .058], color: 'moss', mat: 'moss', off: .01, thick: .007, sway: .004 },
    { use: 'b.hang', at: 180, top: ['belt', .0], bottom: .46, width: [.095, .075], color: 'moss', mat: 'moss', off: .008, thick: .007 },
    { use: 'b.strip', color: 'green', mat: 'cloth', width: .05, thick: .006, n: 50, path: [
      { th: 70, y: ['shoulder', .0], off: .024 }, { th: 30, y: ['chest', .02], off: .03 }, { th: -20, y: ['ribs', .02], off: .03 }, { th: -70, y: ['waist', .04], off: .026 } ] },
    // Root-and-bark harness over both shoulders, rope sashes at the waist, straw fringes with sap beads.
    { use: 'b.strip', color: 'bark', mat: 'bark', width: .02, thick: .014, closed: true, n: 80, path: [
      { th: 30, y: ['waist', .02], off: .03 }, { th: 38, y: ['chest', .02], off: .034 }, { th: 62, y: ['shoulder', .01], off: .03 }, { th: 120, y: ['shoulder', .0], off: .03 }, { th: 150, y: ['chest', .0], off: .03 }, { th: 160, y: ['waist', .0], off: .03 }, { th: 90, y: ['belt', .04], off: .034 } ] },
    { use: 'b.strip', color: 'barkDark', mat: 'bark', width: .02, thick: .014, closed: true, n: 80, path: [
      { th: -30, y: ['waist', .02], off: .03 }, { th: -38, y: ['chest', .02], off: .034 }, { th: -62, y: ['shoulder', .01], off: .03 }, { th: -120, y: ['shoulder', .0], off: .03 }, { th: -150, y: ['chest', .0], off: .03 }, { th: -160, y: ['waist', .0], off: .03 }, { th: -90, y: ['belt', .04], off: .034 } ] },
    { use: 'b.sash', mat: 'straw', bands: [
      { y: ['belt', .03], h: .02, tilt: .012, off: .034, thick: .008, color: 'straw', round: 1 }, { y: ['belt', .0], h: .02, tilt: -.014, phase: 40, off: .036, thick: .008, color: 'bark', round: 1, mat: 'bark' }, { y: ['belt', -.03], h: .018, tilt: .01, phase: 90, off: .036, thick: .008, color: 'straw', round: 1 },
      { y: ['waist', .0], h: .014, tilt: -.03, phase: 0, off: .03, thick: .007, color: 'straw', round: 1 } ] },
    { use: 'b.fringe', from: 28, to: 112, top: ['belt', -.03], bottom: .36, count: 10, bead: 'ember', off: .012 },
    { use: 'b.studs', on: 'trunk', at: [[['belt', .02], 180], [['chest', .0], 44], [['chest', .0], -44]], r: .016, off: .04, color: 'ember', rim: 'bark', rimMat: 'bark', oval: 1.3 },
    { use: 'band', limb: 'arm', at: 1.9, width: .016, off: .004, thick: .005, color: 'straw', mat: 'cloth' },
    { use: 'b.basket', at: ['chest', .03], height: .46, top: .22, bottom: .13, out: .17 },
    { use: 'hair', style: 'updo', streak: 'hairGrey', grey: .5, fringe: .35, temple: .03, count: 70, knot: { at: [0, .02, -.5], radius: .14, kind: 'coil', tie: 'tie' }, tendrils: [[72, .15, .16], [-72, .15, .16]] },
    { use: 'hands' },
  ],
};
