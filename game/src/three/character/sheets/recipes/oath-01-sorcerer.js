// 01 SORCERER - FIRE - Kiln Oath. Read from assets/references/reference-091 (158 cm; soot black 60%, fired
// terracotta 30%, ember orange 10%; firecloth, fired ceramic, oxidized iron).
export default {
  id: 'oath-01-sorcerer', sheet: 'reference-091', title: 'Kiln Sorcerer',
  palette: {
    cloth: '#292624', collar: '#2f2c2a', terracotta: '#7c3c27', trim: '#a37253', ceramic: '#7f3d27', bootPlate: '#693222', leather: '#3a2b22', leatherDark: '#241c18',
    iron: '#3b3734', boot: '#221c19', sole: '#141110', glove: '#1a1716', hair: '#4b4845', hairGrey: '#9b9792', tie: '#7a4a30', ember: '#ff7a2a', skin: '#b98a62',
  },
  build: { width: 1.36, depth: 1.42, belly: .045, bust: .02, hips: 1.12, waist: 1.14, arm: 1.34, leg: 1.22, neck: 1.1, shoulder: 1.14 },
  keep: ['hands'],
  groom: { hair: false, gear: false },
  parts: [
    { use: 'shirt', sleeve: 1.92, flare: .02, off: .012, slack: .005, cap: .02 },
    { use: 'band', limb: 'arm', at: .34, width: .02, off: .023, thick: .004, color: 'trim', mat: 'cloth' },
    { use: 'band', limb: 'arm', at: .62, width: .02, off: .026, thick: .004, color: 'trim', mat: 'cloth' },
    { use: 'trousers', gather: 1.78, bag: .05, pleats: 11, pockets: [], from: .95 },
    { use: 'skirt', hem: .4, flare: 1.22, trim: 'terracotta' },
    { use: 'panel', at: 180, from: .97, to: .5, width: [.15, .19], color: 'cloth', mat: 'cloth', border: 'terracotta', thick: .004, off: .006 },
    { use: 'panel', at: 0, from: 'armpit', to: 'belt', width: [.105, .13], border: 'trim', round: .01 },
    { use: 'panel', at: 0, from: .98, to: .5, width: [.13, .15], border: 'trim' },
    // Side tool flaps hanging from the belt at each hip.
    { use: 'panel', at: 62, from: .96, to: .74, width: [.045, .05], border: 'trim', round: .015 },
    { use: 'panel', at: -62, from: .96, to: .74, width: [.045, .05], border: 'trim', round: .015 },
    { use: 'belt', color: 'leatherDark', height: .052, off: .034, buckleSize: [.034, .027], keepers: [40, -40, 140, -140], studs: 22 },
    { use: 'strap', color: 'leather', closed: false, width: .03, anchor: { at: .16, size: .02 }, n: 30, path: [
      { th: 28, y: 'chest', dy: .0, off: .03 }, { th: 34, y: 'armpit', dy: .02, off: .026 }, { th: 62, y: 'shoulder', dy: .0, off: .022 }, { th: 118, y: 'shoulder', dy: .0, off: .022 }, { th: 150, y: 'armpit', dy: 0, off: .026 }, { th: 158, y: 'ribs', off: .03 } ] },
    { use: 'strap', color: 'leather', closed: false, width: .03, anchor: { at: .16, size: .02 }, n: 30, path: [
      { th: -28, y: 'chest', dy: .0, off: .03 }, { th: -34, y: 'armpit', dy: .02, off: .026 }, { th: -62, y: 'shoulder', dy: .0, off: .022 }, { th: -118, y: 'shoulder', dy: .0, off: .022 }, { th: -150, y: 'armpit', dy: 0, off: .026 }, { th: -158, y: 'ribs', off: .03 } ] },
    { use: 'cowl', color: 'collar', rolls: 1, radius: .024 },
    { use: 'kilnPack' },
    { use: 'limbPlate', limb: 'arm', at: 1.48, length: .17, arc: .075, color: 'ceramic', border: 'trim', off: .046 },
    { use: 'gloveCuff', from: 1.84, to: 2.05, off: .02, strap: 'leather' },
    { use: 'boots', top: 1.8, toeCap: 'bootPlate', heelPlate: 'bootPlate', cuff: 'bootPlate', straps: 2, bulk: 1.15 },
    { use: 'hair', style: 'bun', streak: 'hairGrey', locks: 110, length: .3, bun: { at: [0, .43, -.2], radius: .16, tie: 'tie' } },
  ],
};
