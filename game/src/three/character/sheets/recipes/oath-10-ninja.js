// 10 NINJA - COSMIC & GRAVITY - Tidal Observatory. Read from assets/references/reference-073 (front, back, side,
// three-quarter, face, materials: meteor iron, deep indigo woven cloth, silver and violet inlay; shoulder
// crescent mount and the removable hip crescent plate).
import '../builders-b.js';

export default {
  id: 'oath-10-ninja', sheet: 'reference-073', title: 'Tidal Ninja',
  palette: {
    cloth: '#232842', indigo: '#262b48', indigoDark: '#1a1e33', black: '#1c1b1e', meteor: '#33312f', meteorDark: '#252423', silver: '#8e8a84', bronze: '#6a5238', brass: '#6a5238', violet: '#3a1e96', slit: '#d8d0ff',
    leather: '#3a2c22', leatherDark: '#261d18', iron: '#4a4744', glove: '#1b1a1c', boot: '#232122', sole: '#141314', bootPlate: '#33312f',
  },
  build: { width: 1.0, depth: 1.06, hips: .92, waist: 1.0, arm: 1.02, leg: .98, neck: 1.0, belly: .01 },
  keep: ['hands'],
  groom: { hair: false, gear: false },
  parts: [
    { use: 'b.neck', color: 'black', mat: 'cloth', off: .004 },
    { use: 'trousers', color: 'black', gather: 1.02, bag: .03, pleats: 7, pockets: [] },
    // Leg harness: knee cops, greaves, heavy strapped boots.
    { use: 'b.guard', limb: 'leg', from: 1.2, to: 1.82, arc: 180, off: .016, thick: .012, color: 'meteor', mat: 'meteor', trim: 'bronze', trimMat: 'brass', trimWidth: .01 },
    { use: 'b.guard', limb: 'leg', from: .8, to: 1.2, phi: 0, arc: 88, off: .03, thick: .014, bulge: .03, pointTop: .12, point: .06, ridge: .012, color: 'meteor', mat: 'meteor', trim: 'bronze', trimMat: 'brass', trimWidth: .012, rivets: 2, rivet: 'bronze' },
    { use: 'boots', top: 1.7, color: 'boot', sole: 'sole', toeCap: 'bootPlate', shinPlate: 'bootPlate', heelPlate: 'bootPlate', plateMat: 'iron', straps: 3, strapColor: 'leatherDark', buckle: 'bronze', bulk: 1.3, soleHeight: .05 },
    // Indigo tunic and its skirts, padded black sleeves, the wound scarf.
    { use: 'b.torso', from: ['belt', -.04], to: 'base', color: 'indigo', off: .012, slack: .003 },
    { use: 'b.sleeve', from: -.14, to: 1.2, off: .014, color: 'black', folds: .004, ribs: 0 },
    { use: 'b.coat', color: 'indigo', top: 'belt', hem: .6, flare: 1.08, off: .02, open: 50, folds: 7, lining: 'indigoDark' },
    { use: 'b.hang', at: 0, top: ['belt', 0], bottom: .5, width: [.058, .05], point: .05, color: 'indigo', border: 'indigoDark', borderWidth: .008, off: .016, thick: .006, ornaments: [
      { color: 'silver', ring: .045, width: .005, at: [0, .5] }, { color: 'silver', bar: [0, .64, 0, .97], width: .005 }, { color: 'silver', bar: [-.7, .8, 0, .92], width: .004 }, { color: 'silver', bar: [.7, .8, 0, .92], width: .004 } ] },
    { use: 'b.hang', at: 180, top: ['belt', 0], bottom: .44, width: [.075, .062], point: .06, color: 'indigo', border: 'indigoDark', borderWidth: .008, off: .016, thick: .006, ornaments: [
      { color: 'silver', ring: .05, width: .005, at: [0, .64] }, { color: 'silver', bar: [0, .08, 0, .5], width: .005 }, { color: 'silver', bar: [-.45, .08, -.45, .9], width: .003 }, { color: 'silver', bar: [.45, .08, .45, .9], width: .003 } ] },
    { use: 'b.hang', at: 62, top: ['belt', 0], bottom: .64, width: [.055, .062], point: .03, skew: -.6, color: 'meteor', mat: 'meteor', border: 'silver', borderWidth: .008, thick: .01, off: .02 },
    { use: 'b.hang', at: -62, top: ['belt', 0], bottom: .64, width: [.055, .062], point: .03, skew: .6, color: 'meteor', mat: 'meteor', border: 'silver', borderWidth: .008, thick: .01, off: .02 },
    { use: 'b.hang', at: 122, top: ['belt', 0], bottom: .6, width: [.05, .06], point: .03, skew: .6, color: 'meteor', mat: 'meteor', border: 'silver', borderWidth: .008, thick: .01, off: .02 },
    { use: 'b.hang', at: -122, top: ['belt', 0], bottom: .6, width: [.05, .06], point: .03, skew: -.6, color: 'meteor', mat: 'meteor', border: 'silver', borderWidth: .008, thick: .01, off: .02 },
    { use: 'cowl', color: 'indigo', rolls: 2, radius: .052, rise: .05 },
    { use: 'b.strip', color: 'indigoDark', mat: 'cloth', width: .06, thick: .008, closed: true, n: 54, path: [
      { th: 60, y: ['shoulder', .0], off: .022 }, { th: 10, y: ['chest', .03], off: .028 }, { th: -60, y: ['ribs', .03], off: .024 }, { th: -150, y: ['ribs', .05], off: .022 }, { th: -212, y: ['chest', .04], off: .022 }, { th: -262, y: ['armpit', .06], off: .022 } ] },
    // Harness straps crossing the back, the heavy belt and its pouches.
    { use: 'b.strip', color: 'leather', width: .034, thick: .007, closed: true, n: 54, border: 'bronze', path: [
      { th: -62, y: ['shoulder', .01], off: .03 }, { th: -24, y: ['chest', .0], off: .03 }, { th: 58, y: ['waist', .03], off: .028 }, { th: 150, y: ['ribs', .0], off: .03 }, { th: 214, y: ['chest', .04], off: .03 }, { th: 264, y: ['armpit', .06], off: .03 } ] },
    { use: 'b.studs', on: 'trunk', at: [[['chest', .02], 196]], r: .04, height: .018, off: .034, color: 'bronze', mat: 'brass', rim: 'meteor', rimMat: 'meteor' },
    { use: 'belt', color: 'leather', height: .075, thick: .012, off: .03, buckle: 'iron', buckleSize: [.045, .036], keepers: [26, -26, 150, -150] },
    { use: 'b.pouch', y: ['belt', .0], th: 150, size: [.04, .042, .02], off: .044 },
    { use: 'b.pouch', y: ['belt', .0], th: -150, size: [.04, .042, .02], off: .044 },
    { use: 'b.pouch', y: ['belt', .0], th: 112, size: [.034, .04, .018], off: .044 },
    { use: 'b.pouch', y: ['belt', .0], th: -112, size: [.034, .04, .018], off: .044 },
    // Silver crescent across the chest, the iron horn on the right shoulder, layered plates on the left.
    { use: 'b.strip', color: 'silver', mat: 'silver', width: .1, thick: .012, taper: 'crescent', n: 50, border: 'bronze', path: [
      { th: -66, y: ['shoulder', -.02], off: .034 }, { th: -34, y: ['chest', .03], off: .044 }, { th: 6, y: ['chest', -.03], off: .05 }, { th: 44, y: ['ribs', .02], off: .046 }, { th: 76, y: ['ribs', .05], off: .04 } ] },
    { use: 'b.fin', side: 'R', spine: [[0, 0], [.16, .07], [.3, .22], [.34, .42]], width: .24 },
    { use: 'b.guard', limb: 'arm', side: 'R', from: -.36, to: .2, phi: 90, arc: 84, off: .022, thick: .014, bulge: .016, color: 'meteor', mat: 'meteor', trim: 'bronze', trimMat: 'brass', trimWidth: .01, skin: [['shoulder.L', .5], ['upperarm.L', .5]] },
    { use: 'b.guard', limb: 'arm', side: 'L', from: -.4, to: -.02, layers: 3, step: .17, phi: 90, arc: 86, off: .02, thick: .014, flareEnd: .012, bulge: .008, color: 'meteor', mat: 'meteor', trim: 'bronze', trimMat: 'brass', trimWidth: .01, skin: [['shoulder.L', .5], ['upperarm.L', .5]] },
    // Arms: elbow cops, heavy vambraces with violet inlay, gauntlet cuffs.
    { use: 'b.guard', limb: 'arm', from: .84, to: 1.14, phi: 180, arc: 80, off: .022, thick: .012, bulge: .02, color: 'meteor', mat: 'meteor', trim: 'bronze', trimMat: 'brass', trimWidth: .009 },
    { use: 'b.guard', limb: 'arm', from: 1.1, to: 1.92, arc: 180, off: .018, thick: .014, flare: .02, color: 'meteor', mat: 'meteor', trim: 'bronze', trimMat: 'brass', trimWidth: .012, rivets: 3, rivet: 'bronze' },
    { use: 'b.studs', on: 'arm', at: [[1.5, 90]], r: .012, off: .036, color: 'violet', mat: 'glow', rim: 'silver', rimMat: 'silver', oval: 3 },
    { use: 'gloveCuff', color: 'glove', from: 1.86, to: 2.06, off: .016 },
    { use: 'b.moon', at: 58, y: ['belt', -.11], r: .12, width: .08, off: .05 },
    { use: 'b.helm' },
  ],
};
