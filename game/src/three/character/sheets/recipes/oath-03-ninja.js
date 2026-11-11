// 03 NINJA - LIGHTNING - Storm Relay. Read from assets/references/reference-085 (196 cm; navy 60%, copper 30%,
// lemon 10%; insulating cloth, oxidized copper, ceramic coupler; right arm bracer and antenna mount, spine relay
// mount and cable loop).
import '../builders-a.js';

export default {
  id: 'oath-03-ninja', sheet: 'reference-085', title: 'Storm Ninja',
  palette: {
    navy: '#1b2133', navyDark: '#131826', copper: '#a65f36', leather: '#5b3b27', leatherDark: '#38261a', ceramic: '#d6d2c6', iron: '#a65f36', steel: '#3d3e42', cable: '#151517',
    boot: '#181d2c', sole: '#33251c', skin: '#b98a62', hair: '#17141a',
  },
  build: { width: 1.0, depth: .98, arm: 1.1, leg: 1.0, waist: .95, hips: .97, shoulder: 1.06 },
  keep: ['hands'],
  groom: { hair: false, gear: false },
  parts: [
    { use: 'neck' },
    { use: 'skinLimb', limb: 'arm', from: -.12, to: 2 },
    { use: 'a/bodysuit', color: 'navy', trunk: ['crotch', 'belt+.03'], legs: [-.155, 1.74], off: .011 },
    { use: 'a/bodysuit', color: 'navy', trunk: ['belt-.02', 'base'], off: .008, ease: .004 },
    { use: 'a/collar', color: 'navy', height: .062, flare: .003, off: .01, from: 'base-.014' },
    // Arm-hole binding and the copper-piped seams of the top.
    { use: 'a/lines', on: 'trunk', both: true, paths: [[[52, 'shoulder-.02'], [66, 'armpit+.01'], [90, 'armpit-.035'], [116, 'armpit+.01'], [130, 'shoulder-.02']]], color: 'navyDark', width: .014, thick: .003, off: .009, name: 'binding' },
    { use: 'a/lines', on: 'trunk', paths: [[[24, 'belt+.02'], [14, 'ribs'], [-6, 'chest'], [-22, 'shoulder-.04']], [[-30, 'belt+.02'], [-34, 'ribs'], [-40, 'chest']], [[160, 'belt+.02'], [170, 'chest'], [176, 'shoulder-.03']], [[200, 'belt+.02'], [190, 'chest'], [184, 'shoulder-.03']]], color: 'copper', width: .0035, off: .0098, name: 'piping' },
    // Bandolier from the right shoulder to the left hip; it carries the relay mount on the back.
    { use: 'strap', color: 'leather', width: .032, path: [
      { th: -48, y: 'shoulder', dy: -.03, off: .016 }, { th: 28, y: 'ribs', dy: .02, off: .02 }, { th: 92, y: 'waist', dy: -.01, off: .02 },
      { th: 168, y: 'ribs', dy: .0, off: .02 }, { th: 228, y: 'shoulder', dy: -.03, off: .016 }, { th: 270, y: 'shoulder', dy: .004, off: .018 } ] },
    { use: 'a/kit', name: 'relay', on: 'trunk', side: 'R', y: 'chest-.03', th: 152, off: .026, bone: 'spine2', items: [
      { s: 'ring', rx: .05, ry: .066, r: .0115, at: [0, -.035, .016], color: 'cable', mat: 'leather' },
      { s: 'box', size: [.017, .034, .016], at: [.0, -.04, .03], color: 'ceramic', mat: 'glazed', r: .005 },
      { s: 'box', size: [.02, .009, .019], at: [0, -.002, .03], color: 'copper', mat: 'copper' }, { s: 'box', size: [.02, .009, .019], at: [0, -.078, .03], color: 'copper', mat: 'copper' },
      { s: 'bar', r: .0075, h: .014, at: [0, .018, .03], color: 'copper', mat: 'copper' }, { s: 'box', size: [.03, .02, .008], at: [0, .03, .006], color: 'leatherDark', mat: 'leather' },
      { s: 'dome', r: .005, at: [-.018, .03, .014], color: 'copper', mat: 'copper' }, { s: 'dome', r: .005, at: [.018, .03, .014], color: 'copper', mat: 'copper' } ] },
    { use: 'belt', color: 'leather', buckle: 'copper', height: .04, off: .017, keepers: [34, -34, 150, -150] },
    { use: 'belt', rise: .034, height: .012, thick: .004, off: .016, color: 'leatherDark', buckle: null, keepers: [] },
    // Hip slings hanging from the belt, crossed knee straps, trouser piping.
    { use: 'a/lines', on: 'leg', paths: [[[38, -.12], [72, .12], [100, .3], [128, .12], [160, -.1]]], color: 'leather', mat: 'leather', width: .02, thick: .004, off: .013, name: 'slings' },
    { use: 'a/lines', on: 'leg', paths: [[[-100, .84], [-40, .9], [20, 1.02], [80, 1.14], [140, 1.18]], [[-100, 1.16], [-40, 1.1], [20, .98], [80, .88], [140, .84]]], color: 'leather', mat: 'leather', width: .017, thick: .0035, off: .0125, name: 'kneeStraps' },
    { use: 'a/lines', on: 'leg', paths: [[[58, -.06], [30, .3], [12, .62], [4, .84]], [[4, 1.18], [20, 1.4], [62, 1.72]], [[95, .0], [92, .8], [90, 1.7]], [[-60, .3], [-70, .8], [-80, 1.7]]], color: 'copper', width: .0035, off: .0128, name: 'piping' },
    // Right arm: bracer in a copper frame with its ceramic coupler and two antenna rods.
    { use: 'bracer', side: 'R', from: 1.16, to: 1.86, color: 'navyDark', strapColor: 'leather', straps: [1.3, 1.72], buckle: 'copper' },
    { use: 'a/lines', on: 'arm', side: 'R', paths: [[[52, 1.16], [52, 1.86]], [[128, 1.16], [128, 1.86]]], color: 'copper', mat: 'copper', width: .008, thick: .004, off: .012, name: 'frame' },
    { use: 'band', limb: 'arm', side: 'R', at: 1.16, width: .016, off: .011, thick: .004, color: 'copper', mat: 'iron' },
    { use: 'band', limb: 'arm', side: 'R', at: 1.86, width: .016, off: .009, thick: .004, color: 'copper', mat: 'iron' },
    { use: 'a/kit', name: 'antenna', on: 'arm', side: 'R', t: 1.3, phi: 96, off: .016, items: [
      { s: 'box', size: [.017, .04, .013], at: [0, -.03, .01], color: 'ceramic', mat: 'glazed', r: .005 }, { s: 'box', size: [.02, .008, .016], at: [0, .014, .01], color: 'copper', mat: 'copper' }, { s: 'box', size: [.02, .008, .016], at: [0, -.074, .01], color: 'copper', mat: 'copper' },
      { s: 'bar', r: .0042, h: .23, at: [-.007, .25, .014], color: 'steel', mat: 'steel' }, { s: 'ball', r: .0085, at: [-.007, .49, .014], color: 'copper', mat: 'copper', seg: 8, rows: 5 },
      { s: 'bar', r: .0034, h: .15, at: [.01, .17, .016], color: 'steel', mat: 'steel' }, { s: 'ball', r: .007, at: [.01, .33, .016], color: 'copper', mat: 'copper', seg: 8, rows: 5 },
      { s: 'box', size: [.012, .05, .01], at: [0, -.14, .008], color: 'ceramic', mat: 'glazed', r: .004 } ] },
    { use: 'wrap', limb: 'arm', side: 'L', from: 1.72, to: 1.93, color: 'navy', off: .004, pitch: .014 },
    { use: 'boots', color: 'boot', sole: 'sole', top: 1.64, heelPlate: 'copper', shinPlate: 'ceramic', cuff: 'ceramic', straps: 3, strapColor: 'leather', buckle: 'copper', bulk: 1.08 },
    { use: 'a/lines', on: 'leg', paths: [[[-80, 1.8], [0, 1.83], [80, 1.8]]], color: 'copper', mat: 'copper', width: .006, thick: .003, off: .03, name: 'bootTrim' },
    { use: 'hair', style: 'bun', color: 'hair', locks: 120, length: .3, bun: { at: [0, .57, -.2], radius: .12, tie: 'copper' } },
    { use: 'a/fringe', color: 'hair', count: 8, span: 1.1, from: .4, to: .16, sideTo: -.12, width: .05, sweep: .5 },
  ],
};
