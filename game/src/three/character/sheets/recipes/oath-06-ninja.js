// 06 NINJA - WIND & SOUND - Reed Resonance. Read from assets/references/reference-081 (front, back, side,
// three-quarter, face, materials: woven linen, dry bamboo, carved wood; mask cheek hinge and reed pipe mount).
import { B } from '../builders-b.js';

export default {
  id: 'oath-06-ninja', sheet: 'reference-081', title: 'Reed Ninja',
  palette: {
    linen: '#cdc2ab', linenShade: '#b3a78f', red: '#a23426', cord: '#8e2a20', charcoal: '#3b3937', wrapDark: '#454240',
    bone: '#b8a888', bamboo: '#b98f4c', leather: '#4a392c', leatherDark: '#2f2620', brass: '#7b5a34', boot: '#3a322c', sole: '#5a4532', iron: '#4a4541', hair: '#191513', cloth: '#3b3937',
  },
  build: { width: 1.0, depth: 1.0, hips: 1.34, waist: .98, bust: .024, arm: .92, leg: 1.1, neck: .92, shoulder: 1.0 },
  keep: ['weapon'],
  builders: B,
  groom: { hair: false, gear: false },
  parts: [
    // Body: bare shoulders, arms and midriff.
    { use: 'b.torso', from: 'belt', to: 'base', color: 'skin', mat: 'skin', off: .0005 },
    { use: 'b.sleeve', from: -.14, to: 1.3, color: 'skin', mat: 'skin', off: 0 },
    { use: 'b.neck', color: 'linen', mat: 'cloth', off: .004, ribs: 4 },
    // Linen breast band, the wide wrap over the left shoulder and the narrow one crossing it.
    { use: 'b.torso', from: ['waist', 'ribs', .95], to: ['armpit', .012], color: 'linen', off: .007, slack: .003 },
    { use: 'b.strip', color: 'linen', mat: 'cloth', width: .05, thick: .004, closed: true, n: 80, path: [
      { th: -62, y: ['ribs', .02], off: .011 }, { th: 0, y: ['chest', .03], off: .012 }, { th: 48, y: ['armpit', .05], off: .011 }, { th: 78, y: ['shoulder', .012], off: .01 },
      { th: 118, y: ['armpit', .05], off: .011 }, { th: 180, y: ['chest', .0], off: .011 }, { th: 250, y: ['ribs', .02], off: .011 } ] },
    { use: 'b.strip', color: 'linenShade', mat: 'cloth', width: .022, thick: .004, n: 40, path: [
      { th: 62, y: ['ribs', .0], off: .013 }, { th: 0, y: ['chest', .0], off: .016 }, { th: -52, y: ['armpit', .02], off: .013 } ] },
    // Midriff: crossing linen bands and red cords over bare skin, then the waist sash.
    { use: 'b.sash', color: 'linen', bands: [
      { y: ['waist', 'ribs', .5], h: .03, tilt: .02, phase: 0, off: .004 }, { y: ['waist', 'ribs', .42], h: .026, tilt: -.022, phase: 20, off: .006, color: 'linenShade' },
      { y: ['waist', 'ribs', .46], h: .007, tilt: .03, phase: 90, off: .009, color: 'cord', round: 1 }, { y: ['waist', 'ribs', .5], h: .007, tilt: -.03, phase: 70, off: .009, color: 'cord', round: 1 },
      { y: ['belt', .028], h: .05, tilt: .012, phase: 10, off: .012 }, { y: ['belt', -.008], h: .046, tilt: -.014, phase: 40, off: .014, color: 'linenShade' },
      { y: ['belt', .016], h: .008, tilt: .022, phase: 100, off: .019, color: 'cord', round: 1 }, { y: ['belt', .0], h: .008, tilt: -.024, phase: 60, off: .019, color: 'cord', round: 1 } ] },
    { use: 'b.legs', color: 'charcoal', to: 1.9, seam: 'wrapDark', off: .006 },
    // Hip drape open at the front, and the red sash tails.
    { use: 'b.coat', color: 'linen', top: ['belt', -.01], hem: .93, flare: 1.03, off: .012, open: 230, folds: 5 },
    { use: 'b.hang', at: 26, top: ['belt', .0], bottom: .5, width: [.03, .036], point: -.05, skew: .5, color: 'red', off: .008, sway: .006 },
    { use: 'b.hang', at: 40, top: ['belt', .0], bottom: .36, width: [.028, .034], point: -.05, skew: -.5, color: 'red', off: .012, sway: .008 },
    { use: 'b.hang', at: 180, top: ['belt', .0], bottom: .52, width: [.03, .036], point: -.05, skew: .4, color: 'red', off: .006, sway: .006 },
    { use: 'b.guard', limb: 'leg', from: .88, to: 1.13, phi: 0, arc: 78, off: .008, thick: .008, bulge: .014, color: 'leatherDark', mat: 'leather', trim: 'wrapDark' },
    { use: 'wrap', limb: 'leg', from: 1.16, to: 1.76, color: 'wrapDark', off: .004, pitch: .03 },
    { use: 'boots', top: 1.74, color: 'boot', sole: 'sole', straps: 0 },
    { use: 'b.cords', limb: 'leg', from: 1.72, to: 1.99, turns: 1.5, color: 'red', radius: .02 },
    // Arms: dark wraps from below the elbow to the knuckles, bound with red cord.
    { use: 'b.sleeve', from: 1.22, to: 2.04, color: 'wrapDark', off: .004, ribs: 1, hem: false },
    { use: 'b.cords', limb: 'arm', from: 1.3, to: 1.98, turns: 2.5, color: 'red' },
    // Carved, red-painted shoulder plate on the left, strapped to the pipe harness.
    { use: 'b.strip', color: 'leather', width: .024, closed: true, n: 80, path: [
      { th: 70, y: ['shoulder', .014], off: .017 }, { th: 20, y: ['chest', .01], off: .017 }, { th: -60, y: ['ribs', .03], off: .014 }, { th: -150, y: ['ribs', .05], off: .014 }, { th: -215, y: ['chest', .03], off: .016 }, { th: -262, y: ['armpit', .04], off: .016 } ] },
    { use: 'b.guard', limb: 'arm', side: 'L', from: -.34, to: .44, phi: 90, arc: 66, off: .012, thick: .01, bulge: .012, flareEnd: .008, color: 'red', mat: 'wood', trim: 'bone', trimWidth: .01, grooves: 5, skin: [['shoulder.L', .55], ['upperarm.L', .45]] },
    { use: 'b.reedPipes' },
    { use: 'b.beakMask' },
    { use: 'hair', style: 'bun', locks: 120, length: .3, bun: { at: [0, .46, -.27], radius: .09, tie: 'red' } },
    { use: 'b.tail', tie: 'red' },
    { use: 'hands', glove: 'wrapDark', fingerless: true },
  ],
};
