// 06 SORCERER - WIND & SOUND - Reed Resonance. Read from assets/references/reference-080 (front, back, side,
// three-quarter, face, materials: woven linen, dry bamboo, carved wood; resonator collar and back brace, reed
// pipe carrier on the left flank).
import '../builders-b.js';

export default {
  id: 'oath-06-sorcerer', sheet: 'reference-080', title: 'Reed Sorcerer',
  palette: {
    skin: '#d2a184', linen: '#8f8168', linenShade: '#776a55', red: '#8e2e24', cord: '#7a2a20', trouser: '#4a403a', wood: '#5c3a22', woodDark: '#3c2616',
    bamboo: '#b98f4c', leather: '#4a392c', leatherDark: '#2e2621', brass: '#9a7a3c', iron: '#4a4541', boot: '#2c2724', sole: '#b08a5c', cloth: '#8f8168',
  },
  build: { width: .9, depth: .88, hips: .98, waist: .96, arm: .84, leg: .84, neck: .86, shoulder: .98 },
  keep: ['hands'],
  // His grey top-knot and goatee are the groom's; the costume adds no hair of its own.
  groom: { hair: true, gear: false },
  parts: [
    { use: 'b.neck' },
    { use: 'b.legs', color: 'trouser', to: 1.93, off: .009, folds: .002 },
    { use: 'band', limb: 'leg', at: 1.9, width: .034, off: .01, thick: .004, color: 'red', mat: 'cloth' },
    { use: 'boots', top: 1.95, color: 'boot', sole: 'sole', toeCap: 'boot', plateMat: 'leather', straps: 0 },
    // Red under-robe showing at the hem, the front opening and inside the sleeves.
    { use: 'b.coat', color: 'red', top: 'belt', hem: .455, flare: 1.2, off: .012, folds: 9 },
    { use: 'b.torso', from: ['belt', -.03], to: 'base', color: 'linen', off: .011, ribs: 30, ribDepth: .003, stripes: { color: 'red', at: 96, half: 13 } },
    { use: 'b.coat', color: 'linen', top: 'belt', hem: .49, flare: 1.34, off: .022, pleats: 26, pleatDepth: .016, open: 16, lining: 'red', trim: 'linenShade', trimWidth: .012 },
    { use: 'b.sleeve', from: -.14, to: 1.84, off: .008, color: 'linen', shape: [[0, .004], [.85, .006], [1.15, .03], [1.84, .1]], droop: .55, lining: 'red', trim: 'linenShade', folds: .002 },
    { use: 'b.bells', at: 1.84, out: .1, count: 4 },
    { use: 'b.wing', span: .03, depth: .1, tipDepth: .05, rise: .012, color: 'linen', trim: 'linenShade', inset: .5 },
    { use: 'b.collar', color: 'linen', lining: 'red', height: .085, gap: 34, flare: .012, trim: 'linenShade' },
    // Wide laced belt and the pipe carrier on the left flank.
    { use: 'belt', color: 'leatherDark', height: .074, off: .027, buckle: null, keepers: [] },
    { use: 'b.sash', color: 'leather', mat: 'leather', bands: [
      { y: ['belt', .03], h: .012, off: .036, thick: .004, wobble: 0 }, { y: ['belt', -.03], h: .012, off: .036, thick: .004, wobble: 0 },
      { y: 'belt', h: .006, tilt: .03, phase: 0, off: .037, color: 'cord', round: 1 }, { y: 'belt', h: .006, tilt: -.03, phase: 0, off: .037, color: 'cord', round: 1 } ] },
    { use: 'b.pipeCarrier', at: 64, length: .25 },
    { use: 'b.resonator', height: .17 },
  ],
};
