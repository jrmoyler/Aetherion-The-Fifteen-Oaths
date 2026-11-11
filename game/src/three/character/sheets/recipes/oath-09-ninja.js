// 09 NINJA - LIGHT & HOLY - Oath of Daybreak. Read from assets/references/reference-075 (front, back, side,
// three-quarter, face, materials: folded enamel, grey cloth, brushed gold; shoulder wing hinge and visor rear
// fastener).
import '../builders-b.js';

export default {
  id: 'oath-09-ninja', sheet: 'reference-075', title: 'Daybreak Ninja',
  palette: {
    skin: '#7a4a32', grey: '#6f6d6c', greyDark: '#545252', cloth: '#6f6d6c', ivory: '#d9d0bc', ivoryShade: '#b9b09c', gold: '#b08a3e', leather: '#4a4644', leatherDark: '#343231',
    iron: '#b08a3e', boot: '#5a5857', sole: '#3a3838', hair: '#1a1513', hairLight: '#2c231e',
  },
  build: { width: 1.0, depth: 1.0, hips: 1.2, waist: .93, bust: .024, arm: .9, leg: 1.0, neck: .92 },
  keep: ['hands'],
  groom: { hair: false, gear: false },
  parts: [
    { use: 'b.sleeve', from: -.14, to: 1.0, color: 'skin', mat: 'skin', off: 0 },
    { use: 'b.neck', color: 'grey', mat: 'cloth', off: .003 },
    { use: 'b.legs', color: 'grey', to: 1.9, off: .006, seam: 'gold' },
    { use: 'boots', top: 1.74, color: 'boot', sole: 'sole', straps: 0 },
    { use: 'b.guard', limb: 'leg', from: 1.62, to: 1.97, phi: 0, arc: 74, off: .02, thick: .008, flare: .014, pointTop: .16, ridge: .008, color: 'ivory', mat: 'enamel', trim: 'gold', trimMat: 'gold', trimWidth: .007 },
    // Sleeveless grey top, high ivory collar, the ivory sash from the left shoulder, wound waist.
    { use: 'b.torso', from: ['belt', -.03], to: 'base', color: 'grey', off: .006 },
    { use: 'b.collar', color: 'ivory', lining: 'ivoryShade', height: .05, gap: 44, flare: .008, off: .008 },
    { use: 'b.strip', color: 'ivory', mat: 'cloth', width: .056, thick: .005, closed: true, n: 80, path: [
      { th: 62, y: ['shoulder', .01], off: .01 }, { th: 20, y: ['chest', .01], off: .012 }, { th: -58, y: ['ribs', -.01], off: .011 }, { th: -150, y: ['ribs', .02], off: .011 }, { th: -214, y: ['chest', .03], off: .011 }, { th: -262, y: ['armpit', .05], off: .01 } ] },
    { use: 'b.sash', color: 'ivory', bands: [
      { y: ['waist', .035], h: .034, tilt: .016, phase: 0, off: .01 }, { y: ['waist', -.005], h: .034, tilt: -.018, phase: 20, off: .012, color: 'ivoryShade' }, { y: ['belt', .025], h: .04, tilt: .01, phase: 60, off: .011, color: 'greyDark' } ] },
    // Enamel tassets edged in gold, grey loincloth points between them.
    { use: 'b.hang', at: 0, top: ['belt', .0], bottom: .8, width: [.04, .02], point: .08, color: 'greyDark', off: .008 },
    { use: 'b.hang', at: 180, top: ['belt', .0], bottom: .84, width: [.05, .03], point: .05, color: 'ivoryShade', off: .008 },
    { use: 'b.hang', at: 46, top: ['belt', .01], bottom: .885, width: [.07, .06], point: .085, skew: -.55, color: 'ivory', mat: 'enamel', border: 'gold', borderWidth: .007, thick: .007, off: .014, flare: 1.12 },
    { use: 'b.hang', at: -46, top: ['belt', .01], bottom: .885, width: [.07, .06], point: .085, skew: .55, color: 'ivory', mat: 'enamel', border: 'gold', borderWidth: .007, thick: .007, off: .014, flare: 1.12 },
    { use: 'b.hang', at: 134, top: ['belt', .01], bottom: .885, width: [.065, .055], point: .085, skew: .55, color: 'ivory', mat: 'enamel', border: 'gold', borderWidth: .007, thick: .007, off: .014, flare: 1.12 },
    { use: 'b.hang', at: -134, top: ['belt', .01], bottom: .885, width: [.065, .055], point: .085, skew: -.55, color: 'ivory', mat: 'enamel', border: 'gold', borderWidth: .007, thick: .007, off: .014, flare: 1.12 },
    // Folded enamel wing on the left shoulder with its gold hinge.
    { use: 'b.wing', side: 'L', span: .15, depth: .1, tipDepth: .004, rise: .07, wedge: .085, inset: .7, lift: .012, color: 'ivory', mat: 'enamel', trim: 'gold', trimMat: 'gold', trimWidth: .008, thick: .009 },
    { use: 'b.studs', on: 'arm', side: 'L', at: [[-.12, 150]], r: .018, off: .016, color: 'gold', mat: 'gold' },
    // Arms: gold armlets, grey sleeves from the elbow, enamel vambraces, gold wrist rings.
    { use: 'band', limb: 'arm', at: .78, width: .022, off: .002, thick: .004, color: 'gold', mat: 'iron', trim: 'ivory' },
    { use: 'b.sleeve', from: .92, to: 2.04, color: 'grey', off: .004, hem: false },
    { use: 'b.guard', limb: 'arm', from: 1.2, to: 1.86, phi: 90, arc: 80, off: .008, thick: .008, pointTop: .16, point: .04, ridge: .006, flare: .008, color: 'ivory', mat: 'enamel', trim: 'gold', trimMat: 'gold', trimWidth: .007 },
    { use: 'band', limb: 'arm', at: 1.93, width: .016, off: .006, thick: .004, color: 'gold', mat: 'iron' },
    { use: 'hair', style: 'bun', streak: 'hairLight', locks: 120, length: .3, bun: { at: [0, .5, -.1], radius: .19 } },
    { use: 'b.headBand', y: .33, from: 0, to: 360, width: .03, off: .03, thick: .008, color: 'gold', mat: 'gold' },
    { use: 'b.visor', top: .27, eye: -.07, half: 56 },
  ],
};
