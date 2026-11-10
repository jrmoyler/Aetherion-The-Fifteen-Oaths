/**
 * Vein Lattice — Blood, zone cast.
 *
 * A vein burrows down the line under the floor's skin; where it reaches the
 * circle a bruise spreads, capillaries web out, and a living lattice of veins
 * climbs out of the rim — trunks forking and re-joining up the wall into a
 * diamond net that curls inward at the top. It beats: every heartbeat the
 * whole lattice constricts and swells, blood surges up it, and the floor
 * flashes. Then it drains and withers from the tendrils down.
 *
 * Data only. VeinLatticeAbility reads every field live.
 */
export default {
  id: 'veinlattice',
  meta: {
    label: 'Vein Lattice',
    accent: '#ff3b58',
    key: '',
    element: 'blood',
    hint: 'Blood — a living lattice of veins climbs out of the circle and beats',
    cast: 'zone',
    glyph: '<path d="M30 86C30 64 38 52 50 40C62 52 70 64 70 86"/><path d="M50 40C44 30 38 22 30 16"/><path d="M50 40C56 30 62 22 70 16"/><path d="M38 64C46 58 54 58 62 64"/>'
  },
  settings: {
    // ---- the cast ----
    range: 18, // max cast distance (m)
    minRange: 2,
    speed: 22, // the feeder vein burrows at (m/s)
    zoneRadius: 4.6, // the circle (m)
    cooldown: 0.6,
    castAnim: 'cast3',
    colorA: '#ff3b58', // accent
    colorB: '#ffd6de', // accent, pale

    // ---- timing (s) ----
    webTime: 0.35, // the capillary web spreads over
    growDelay: 0.08, // veins start climbing after
    growTime: 0.75, // the lattice climbs to its tips over
    lifetime: 1.5, // it stands and beats for
    witherTime: 0.9, // drains from the tips down over
    floorFade: 0.6, // the bruise fades over

    // ---- 1 · the lattice ----
    veinCount: 11, // trunks round the rim
    levels: 4, // forks up the wall
    wallHeight: 4.2, // m
    netJitter: 0.45, // node wander
    netGaps: 0.22, // share of links dropped
    veinBow: 0.35, // veins bow sideways between knots
    topCurl: 0.38, // the top row leans in (× radius)
    veinThickness: 0.16, // m, at the trunks
    sway: 0.04, // a living sway (rad)
    netSeed: 3, // re-rolls the net's shape

    // ---- 1b · tissue ----
    // four-stop ramp: deep (the mottled skin) → body → tint (blood) → hot
    colorSkin: '#2a040c', // deep, light
    colorSkinDark: '#0c0104', // deep, dark — carries the shadowed side
    colorVeinBody: '#3e0612', // saturated body, sunlit
    colorBlood: '#e8213c', // tint — blood through the skin, the pulses
    colorVeinHot: '#ffc4cc', // hot — pulse crests on the beat (HDR)
    colorCapillary: '#a0102a',
    colorRim: '#901024', // light through the silhouette
    rampBody: 0.42, // how far sunlight alone carries the ramp
    hotBoost: 1.6, // HDR on the hot stop only (bloom)
    tissueBump: 0.32, // knotted tissue — normal wander
    specularPower: 70, // wet highlight tightness
    mottle: 0.7,
    capillaries: 0.55,
    skinDiffuse: 0.9,
    skinAmbient: 0.12,
    skinSpecular: 0.9,
    coreGlow: 0.3, // blood glowing through the skin
    rimGlow: 0.4,
    pulseGlow: 3, // the pulses running up
    pulseFreq: 2.2, // pulses on a vein at once
    pulseSpeed: 1.6, // pulses per second
    pulseBulge: 0.55, // a pulse swells the tube
    beatGlow: 3.6,

    // ---- 2 · the heartbeat ----
    beatRate: 1.5, // beats per second
    beatSwell: 0.55, // tubes swell on a beat
    beatSqueeze: 0.16, // the lattice constricts on a beat (× radius)
    beatShake: 0.18,
    beatLight: 14, // light punch per beat
    throbStrength: 0.6, // air bend per beat

    // ---- 3 · the feeder vein ----
    feederThickness: 0.11, // m
    feederMeander: 0.3, // m

    // ---- 4 · the floor ----
    colorBruise: '#1a0410',
    colorWebLine: '#4a0818',
    colorWebGlow: '#ff2440',
    bruise: 0.75,
    webScale: 0.9,
    webWarp: 1.2,
    webWidth: 0.06,
    webGlow: 1.3,
    beatRingSpeed: 9, // m/s

    // ---- 5 · drops, mist, motes ----
    dropCount: 14, // per knot per beat
    dropSpeed: 3.5,
    dropSize: 0.14,
    dropLifetime: 0.9,
    dropGravity: -12,
    dripRate: 70,
    colorDropA: '#ff6a7c',
    colorDropB: '#d0142e',
    colorDropC: '#7a0716',
    colorDropD: '#3a0008',
    mistRate: 18,
    mistSize: 1.0,
    mistLifetime: 1.6,
    mistOpacity: 0.4,
    colorMistA: '#5a0614',
    colorMistB: '#3e0410',
    colorMistC: '#22030a',
    colorMistD: '#0e0104',
    moteRate: 140,
    moteSize: 0.11,
    moteRise: 1.2,
    moteLifetime: 1.2,
    moteGlow: 2.2,
    colorMoteA: '#ffd0d8',
    colorMoteB: '#ff4060',
    colorMoteC: '#b0102a',
    colorMoteD: '#400008',

    // ---- 6 · the beat on arrival ----
    arriveShake: 0.3,
    crackRadius: 3.2,
    crackLife: 2.5,
    colorCrackA: '#ff3048',
    colorCrackB: '#600010',
    shockRadius: 6.5,
    shockLife: 0.6,
    colorShockA: '#ff3a52',
    colorShockB: '#ffd0d8',
    flash: 0.25,
    colorFlash: '#ff5068',

    // ---- light ----
    lightColor: '#ff3a52',
    lightIntensity: 9,
    lightRadius: 10,
    lightHeight: 2,
    lightFlicker: 0.3
  }
};
