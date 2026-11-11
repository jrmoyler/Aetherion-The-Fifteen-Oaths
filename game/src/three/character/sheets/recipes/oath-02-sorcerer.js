// 02 SORCERER - FROST - Rime Archive. Read from assets/references/reference-088 (tall, 202 cm, elderly; quilted
// felt robe, dark leather belts and straps, milky laminated rime pages; folio rack on the right hip).
import '../builders-a.js';

const seam = (a, from = 'belt-.03', to = .1) => [[a, from], [a, to]];
const page = (z) => ({ s: 'box', size: [.066, .112, .0105], at: [0, 0, z], color: 'ice', mat: 'ice', r: .004 });

export default {
  id: 'oath-02-sorcerer', sheet: 'reference-088', title: 'Rime Sorcerer',
  palette: {
    robe: '#2a2f38', robeDark: '#20242b', quilt: '#3b424d', pale: '#b4bcc1', white: '#d3d0c7', ice: '#cbe1ec', frost: '#9cc3d4', leather: '#2c231e', leatherDark: '#1d1714',
    iron: '#5b5d61', boot: '#1b1b1d', sole: '#101011', glove: '#211c19', skin: '#d2a184', beard: '#d8d5ce',
  },
  build: { width: .95, depth: .93, arm: .9, leg: .96, waist: 1.0, hips: .96, shoulder: 1.03, neck: .95 },
  keep: ['hands'],
  groom: { hair: false, gear: false, beard: false },
  parts: [
    { use: 'neck' },
    { use: 'a/bodysuit', color: 'robeDark', trunk: null, legs: [1.15, 1.96], off: .01 },
    { use: 'shirt', color: 'white', sleeve: 1.3, flare: .028, off: .008, slack: .006, cap: .012 },
    { use: 'shirt', color: 'robe', sleeve: 0, off: .019, slack: .002 },
    { use: 'skirt', color: 'robe', hem: .1, flare: 1.2, off: .021, folds: 14, trim: 'pale', trimWidth: .008 },
    // The robe stands open down the front over a white under-robe.
    { use: 'panel', color: 'white', mat: 'cloth', at: 0, from: 'base', to: 'belt', width: [.03, .04], off: .001, thick: .003, round: .004 },
    { use: 'panel', color: 'white', mat: 'cloth', at: 0, from: 'belt', to: .105, width: [.04, .082], off: .001, thick: .003, round: .004 },
    { use: 'a/lines', on: 'trunk', both: true, paths: [[[14, 'belt'], [13, 'chest'], [17, 'shoulder-.035']], [[34, 'belt'], [36, 'chest'], [44, 'shoulder-.03']]], color: 'pale', width: .0045, off: .0235, name: 'piping' },
    { use: 'a/lines', on: 'coat', both: true, paths: [seam(15, 'belt-.03', .105), seam(31), seam(52), seam(82), seam(112), seam(146), seam(170)], color: 'pale', width: .0045, off: .0045, n: 16, name: 'piping' },
    { use: 'a/lines', on: 'trunk', quilt: { a: [138, 222], b: ['ribs-.02', 'shoulder-.04'], pitch: .04 }, color: 'quilt', width: .003, off: .0225, name: 'quilting' },
    { use: 'a/lines', on: 'trunk', both: true, paths: [[[138, 'ribs-.02'], [139, 'chest'], [150, 'shoulder-.03']], [[180, 'ribs-.02'], [180, 'shoulder-.03']]], color: 'pale', width: .004, off: .0235, name: 'piping' },
    // Stiff pointed shoulder caps.
    { use: 'a/kit', name: 'caps', on: 'trunk', side: 'both', y: 'shoulder+.042', th: 90, off: -.07, bone: 'shoulder.L', items: [
      { s: 'leaf', len: .225, width: .235, thick: .012, bend: -.03, base: 1, rot: [103, 0, 0], at: [0, -.005, 0], color: 'pale', mat: 'felt' },
      { s: 'leaf', len: .212, width: .215, thick: .02, bend: -.028, base: 1, rot: [103, 0, 0], color: 'robe', mat: 'felt' } ] },
    { use: 'a/collar', color: 'robe', lining: 'frost', height: .125, flare: .05, open: 64, tilt: .012, points: .028, off: .015, trim: 'pale' },
    { use: 'belt', color: 'leather', height: .05, off: .026, buckleSize: [.03, .026], keepers: [34, -34, 150, -150] },
    { use: 'belt', rise: -.045, height: .022, thick: .005, off: .026, color: 'leatherDark', buckle: null, keepers: [], tilt: .012 },
    // Folio rack on the right hip: rime pages in an iron clamp, hung from the belt on two straps.
    { use: 'a/kit', name: 'folio', on: 'coat', side: 'R', y: .86, th: 84, off: .05, items: [
      page(-.042), page(-.014), page(.014), page(.042),
      { s: 'box', size: [.074, .011, .062], at: [0, .058, 0], color: 'iron', mat: 'iron' }, { s: 'box', size: [.074, .011, .062], at: [0, -.062, 0], color: 'iron', mat: 'iron' },
      { s: 'box', size: [.012, .13, .064], at: [0, 0, 0], color: 'iron', mat: 'iron' }, { s: 'box', size: [.07, .124, .005], at: [0, 0, -.064], color: 'leatherDark', mat: 'leather' },
      { s: 'box', size: [.012, .016, .012], at: [-.03, .058, .066], color: 'iron', mat: 'iron' }, { s: 'box', size: [.012, .016, .012], at: [.03, .058, .066], color: 'iron', mat: 'iron' },
      { s: 'box', size: [.011, .06, .004], at: [-.03, .16, -.045], rot: [-14, 0, 0], color: 'leather', mat: 'leather' }, { s: 'box', size: [.011, .06, .004], at: [.03, .16, -.045], rot: [-14, 0, 0], color: 'leather', mat: 'leather' } ] },
    // Leather bracers with a stiff, rime-edged fin standing off the elbow.
    { use: 'bracer', from: 1.3, to: 1.92, color: 'leather', strapColor: 'leatherDark', straps: [1.45, 1.75] },
    { use: 'a/kit', name: 'fins', on: 'arm', side: 'both', t: 1.62, phi: 105, off: .004, items: [
      { s: 'leaf', len: .2, width: .112, thick: .01, bend: .05, base: .9, at: [0, 0, -.002], color: 'frost', mat: 'ice' },
      { s: 'leaf', len: .188, width: .096, thick: .016, bend: .047, base: .9, color: 'robe', mat: 'felt' } ] },
    { use: 'gloveCuff', color: 'glove', strap: 'leatherDark' },
    { use: 'a/beard', color: 'beard', width: .19, tip: .16, length: 1.3 },
    { use: 'boots', color: 'boot', sole: 'sole', top: 1.86, straps: 1, strapColor: 'leatherDark', soleHeight: .03 },
  ],
};
