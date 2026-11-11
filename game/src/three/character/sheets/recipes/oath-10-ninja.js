// 10 NINJA - COSMIC & GRAVITY - Tidal Observatory. Read from assets/references/reference-073 (front, back, side,
// three-quarter, face, materials: meteor iron, deep indigo woven cloth, silver and violet inlay; shoulder
// crescent mount and the removable hip crescent plate).
import { B } from '../builders-b.js';
import { X } from '../builders-x.js';

export default {
  id: 'oath-10-ninja', density: 0.74, sheet: 'reference-073', title: 'Tidal Ninja',
  palette: {
    cloth: '#191c2e', indigo: '#1b1f34', indigoDark: '#12152a', indigoLight: '#262b46', black: '#151416', steel: '#2c2b2d', steelDark: '#1d1c1e', steelLight: '#4a4849', rim: '#7d786f', silver: '#a09b92', bronze: '#5e4a34', brass: '#5e4a34', violet: '#4a2ab0', slit: '#d8d0ff',
    leather: '#33271f', leatherDark: '#211a16', iron: '#454240', glove: '#161517', boot: '#1c1b1c', sole: '#101011', bootPlate: '#2e2d2e',
  },
  build: { width: 1.04, depth: 1.08, hips: 1.02, waist: 1.04, arm: 1.04, leg: 1.1, neck: 1.0, belly: .0 },
  keep: ['weapon'],
  builders: { ...B, ...X },
  groom: { hair: false, gear: false },
  parts: [
    { use: 'b.neck', color: 'black', mat: 'cloth', off: .004 },
    // Black padded trousers under the armour; knee cops, greaves and heavy plated boots.
    { use: 'b.legs', color: 'black', to: 1.3, off: .014, folds: .005, shape: [[-.15, .01], [.3, .022], [.75, .02], [1, .008], [1.3, 0]] },
    { use: 'b.guard', limb: 'leg', from: 1.16, to: 1.86, arc: 180, off: .018, thick: .012, flare: .012, color: 'steel', mat: 'steel', trim: 'rim', trimMat: 'steel', trimWidth: .012 },
    { use: 'b.guard', limb: 'leg', from: 1.22, to: 1.8, phi: 0, arc: 46, off: .034, thick: .012, ridge: .014, point: .05, color: 'steelLight', mat: 'steel', trim: 'rim', trimMat: 'steel', trimWidth: .01, rivets: 3, rivet: 'rim' },
    { use: 'b.guard', limb: 'leg', from: .72, to: 1.24, phi: 0, arc: 100, off: .034, thick: .016, bulge: .04, pointTop: .16, point: .1, ridge: .016, color: 'steel', mat: 'steel', trim: 'rim', trimMat: 'steel', trimWidth: .014, rivets: 2, rivet: 'rim' },
    { use: 'b.guard', limb: 'leg', from: .9, to: 1.1, phi: 0, arc: 60, off: .062, thick: .012, bulge: .028, ridge: .01, color: 'steelLight', mat: 'steel', trim: 'rim', trimMat: 'steel', trimWidth: .008 },
    { use: 'boots', top: 1.74, color: 'boot', sole: 'sole', toeCap: 'bootPlate', shinPlate: 'bootPlate', heelPlate: 'bootPlate', plateMat: 'iron', straps: 3, strapColor: 'leatherDark', buckle: 'bronze', bulk: 1.34, soleHeight: .055 },
    // The cuirass: breast and back plates with a medial ridge, side plates under the arms and three fauld lames.
    { use: 'b.torso', from: ['belt', -.04], to: 'base', color: 'black', off: .01, slack: .002 },
    { use: 'x.plate', at: 0, arc: 78, from: 'waist', to: ['shoulder', -.0], scoop: .07, off: .016, thick: .012, bulge: .022, ridge: .012, color: 'steel', mat: 'steel', rim: 'rim', rimWidth: .014, rimSides: 'tb', n: 1.3 },
    { use: 'x.plate', at: 180, arc: 80, from: 'waist', to: ['shoulder', -.0], scoop: .04, off: .016, thick: .012, bulge: .018, ridge: .008, color: 'steel', mat: 'steel', rim: 'rim', rimWidth: .014, rimSides: 'tb', n: 1.3 },
    { use: 'x.plate', at: 90, arc: 16, from: 'waist', to: ['armpit', -.03], off: .02, thick: .01, color: 'steelLight', mat: 'steel', rim: 'rim', rimWidth: .01, rivets: 3, rivet: 'rim' },
    { use: 'x.plate', at: -90, arc: 16, from: 'waist', to: ['armpit', -.03], off: .02, thick: .01, color: 'steelLight', mat: 'steel', rim: 'rim', rimWidth: .01, rivets: 3, rivet: 'rim' },
    { use: 'x.plate', at: 0, arc: 180, from: ['belt', .0], to: ['waist', .0], off: .014, thick: .008, lames: 2, lap: .25, lameKick: .005, color: 'steel', mat: 'steel', rim: 'rim', rimWidth: .009, rimSides: 'b', n: 1.6 },
    // Indigo cloth only where the sheet has it: the wrap crossing the chest and back, the scarf, the skirts.
    { use: 'b.strip', color: 'indigo', mat: 'cloth', width: .15, thick: .008, closed: true, n: 60, path: [
      { th: 62, y: ['shoulder', .0], off: .034 }, { th: 14, y: ['chest', .04], off: .042 }, { th: -62, y: ['ribs', .0], off: .036 }, { th: -150, y: ['ribs', .03], off: .034 }, { th: -208, y: ['chest', .05], off: .036 }, { th: -262, y: ['armpit', .07], off: .034 } ] },
    { use: 'b.strip', color: 'indigoLight', mat: 'cloth', width: .11, thick: .008, closed: true, n: 60, path: [
      { th: -62, y: ['shoulder', .0], off: .042 }, { th: -14, y: ['chest', .02], off: .05 }, { th: 62, y: ['ribs', -.02], off: .044 }, { th: 150, y: ['ribs', .02], off: .042 }, { th: 208, y: ['chest', .05], off: .044 }, { th: 262, y: ['armpit', .07], off: .042 } ] },
    { use: 'cowl', color: 'indigo', rolls: 3, radius: .056, rise: .055 },
    { use: 'b.coat', color: 'indigo', top: 'belt', hem: .68, flare: 1.1, off: .02, open: 56, folds: 9, lining: 'indigoDark' },
    { use: 'b.hang', at: 0, top: ['belt', 0], bottom: .4, width: [.05, .044], point: .05, lean: .02, color: 'indigoLight', border: 'indigoDark', borderWidth: .008, off: .016, thick: .006, ornaments: [
      { color: 'silver', ring: .045, width: .005, at: [0, .5] }, { color: 'silver', bar: [0, .64, 0, .97], width: .005 }, { color: 'silver', bar: [-.7, .8, 0, .92], width: .004 }, { color: 'silver', bar: [.7, .8, 0, .92], width: .004 } ] },
    { use: 'b.hang', at: 180, top: ['belt', 0], bottom: .44, width: [.075, .062], point: .06, color: 'indigoLight', border: 'indigoDark', borderWidth: .008, off: .016, thick: .006, ornaments: [
      { color: 'silver', ring: .05, width: .005, at: [0, .64] }, { color: 'silver', bar: [0, .08, 0, .5], width: .005 }, { color: 'silver', bar: [-.45, .08, -.45, .9], width: .003 }, { color: 'silver', bar: [.45, .08, .45, .9], width: .003 } ] },
    // Tassets: four flared steel plates edged in pale metal over the skirt.
    { use: 'x.plate', at: 58, arc: 19, from: .76, to: ['belt', -.02], hangs: true, taper: -.2, flare: .03, point: .03, skew: -.5, off: .014, thick: .012, ridge: .008, color: 'steel', mat: 'steel', rim: 'silver', rimMat: 'silver', rimWidth: .014, rimSides: 'blr', rivets: 3, rivet: 'silver' },
    { use: 'x.plate', at: -58, arc: 19, from: .76, to: ['belt', -.02], hangs: true, taper: -.2, flare: .03, point: .03, skew: .5, off: .014, thick: .012, ridge: .008, color: 'steel', mat: 'steel', rim: 'silver', rimMat: 'silver', rimWidth: .014, rimSides: 'blr', rivets: 3, rivet: 'silver' },
    { use: 'x.plate', at: 122, arc: 19, from: .74, to: ['belt', -.02], hangs: true, taper: -.2, flare: .03, point: .03, skew: .5, off: .014, thick: .012, ridge: .008, color: 'steel', mat: 'steel', rim: 'silver', rimMat: 'silver', rimWidth: .014, rimSides: 'blr', rivets: 3, rivet: 'silver' },
    { use: 'x.plate', at: -122, arc: 19, from: .74, to: ['belt', -.02], hangs: true, taper: -.2, flare: .03, point: .03, skew: -.5, off: .014, thick: .012, ridge: .008, color: 'steel', mat: 'steel', rim: 'silver', rimMat: 'silver', rimWidth: .014, rimSides: 'blr', rivets: 3, rivet: 'silver' },
    // Harness strap crossing the back with its boss, the heavy belt and its pouches.
    { use: 'b.strip', color: 'leather', width: .036, thick: .007, closed: true, n: 54, border: 'bronze', path: [
      { th: -62, y: ['shoulder', .01], off: .052 }, { th: -24, y: ['chest', .0], off: .058 }, { th: 58, y: ['waist', .03], off: .05 }, { th: 150, y: ['ribs', .0], off: .05 }, { th: 214, y: ['chest', .04], off: .052 }, { th: 264, y: ['armpit', .06], off: .05 } ] },
    { use: 'b.studs', on: 'trunk', at: [[['chest', .02], 196]], r: .04, height: .018, off: .056, color: 'bronze', mat: 'brass', rim: 'steel', rimMat: 'steel' },
    { use: 'belt', color: 'leather', height: .075, thick: .012, off: .036, buckle: 'iron', buckleSize: [.045, .036], keepers: [26, -26, 150, -150] },
    { use: 'b.pouch', y: ['belt', .0], th: 150, size: [.04, .042, .02], off: .05 },
    { use: 'b.pouch', y: ['belt', .0], th: -150, size: [.04, .042, .02], off: .05 },
    // Silver crescent across the chest from the horned shoulder.
    { use: 'b.strip', color: 'silver', mat: 'silver', width: .13, thick: .014, taper: 'crescent', n: 50, border: 'rim', path: [
      { th: -70, y: ['shoulder', -.01], off: .05 }, { th: -36, y: ['chest', .04], off: .064 }, { th: 6, y: ['chest', -.03], off: .07 }, { th: 44, y: ['ribs', .02], off: .064 }, { th: 78, y: ['ribs', .05], off: .056 } ] },
    // Pauldrons: a domed cap carrying the horn on the right, a squared, three-lame stack on the left.
    { use: 'x.pauldron', side: 'R', size: [.105, .07, .105], shift: [.0, .015, 0], lames: 2, step: .06, color: 'steel', mat: 'steel', rim: 'rim', rimWidth: .014, rivets: 2, rivet: 'rim' },
    { use: 'x.horn', side: 'R', root: [-.05, .04, .0], spine: [[.1, -.07], [.24, .02], [.34, .18], [.36, .4]], inner: [[-.12, .0], [-.01, .08], [.16, .19], [.36, .4]], thick: .04, dish: .035, tilt: 18, lean: -18, color: 'steel', mat: 'steel', edge: 'rim', edgeMat: 'steel', edgeWidth: .1, boss: { r: .045, h: .024, q: .14, e: .5, color: 'bronze', mat: 'brass' } },
    { use: 'x.pauldron', side: 'L', size: [.105, .06, .1], shift: [.0, .015, 0], lames: 3, step: .05, square: 4.5, ridge: .008, color: 'steel', mat: 'steel', rim: 'rim', rimWidth: .014, rivets: 2, rivet: 'rim' },
    // Arms: padded black sleeves, rerebraces, elbow cops, heavy vambraces with violet inlay, gauntlets.
    { use: 'b.sleeve', from: -.14, to: 1.2, off: .014, color: 'black', folds: .004, ribs: 0 },
    { use: 'b.guard', limb: 'arm', from: .42, to: .84, phi: 90, arc: 150, off: .02, thick: .012, bulge: .006, color: 'steel', mat: 'steel', trim: 'rim', trimMat: 'steel', trimWidth: .01 },
    { use: 'b.guard', limb: 'arm', from: .82, to: 1.16, phi: 180, arc: 96, off: .028, thick: .014, bulge: .028, ridge: .008, color: 'steelLight', mat: 'steel', trim: 'rim', trimMat: 'steel', trimWidth: .009 },
    { use: 'b.guard', limb: 'arm', from: 1.1, to: 1.9, arc: 180, off: .02, thick: .016, flare: .03, flareEnd: .006, color: 'steel', mat: 'steel', trim: 'rim', trimMat: 'steel', trimWidth: .013, rivets: 3, rivet: 'rim' },
    { use: 'b.guard', limb: 'arm', from: 1.16, to: 1.84, phi: 90, arc: 52, off: .04, thick: .012, ridge: .01, pointTop: .1, color: 'steelLight', mat: 'steel', trim: 'rim', trimMat: 'steel', trimWidth: .009 },
    { use: 'b.studs', on: 'arm', at: [[1.5, 90]], r: .013, off: .058, color: 'violet', mat: 'glow', rim: 'silver', rimMat: 'silver', oval: 3 },
    { use: 'b.guard', limb: 'arm', from: 1.84, to: 2.1, arc: 180, off: .014, thick: .01, flare: .012, color: 'steel', mat: 'steel', trim: 'rim', trimMat: 'steel', trimWidth: .008 },
    { use: 'b.moon', at: 58, y: ['belt', -.12], r: .13, width: .09, off: .07 },
    { use: 'b.helm', color: 'steel', mat: 'steel' },
    { use: 'hands', glove: 'glove', knuckles: 'steelLight', scale: .82 },
  ],
};
