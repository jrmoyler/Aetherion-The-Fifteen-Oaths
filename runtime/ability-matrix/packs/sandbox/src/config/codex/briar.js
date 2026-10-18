/**
 * Briar Cathedral — Nature — ribs of briar rise round the circle and close
 * over it into a pointed vault; light falls through it as a rose window.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * A rib holds only dice (a bearing jitter, a timing roll, a seed); a thorn
 * only its place along its strand. Every metre, second and colour below is
 * resolved by `BriarCathedralAbility` every frame, so dragging `apexHeight`
 * re-raises a vault that is already standing and `ribCount` re-cuts it.
 */
export default {
  id: 'briar',
  meta: {
    label: 'Briar Cathedral',
    accent: '#8ee07a',
    key: '',
    element: 'nature',
    hint: 'Nature — ribs of briar rise round the circle and close over it into a thorned vault, light falling through as a rose window',
    cast: 'zone',
    glyph: `<path d="M18 88C18 50 30 24 50 10C70 24 82 50 82 88"/><path d="M34 88C34 56 40 34 50 20C60 34 66 56 66 88"/><circle cx="50" cy="66" r="10"/><path d="M50 56V76M40 66H60"/><path d="M14 88H86"/><path d="M24 48L18 44M76 48L82 44M28 32L23 27M72 32L77 27"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 20, // metres/second the bramble runs from the caster to the circle
    lifetime: 1.8, // seconds the sealed vault stands before it withers
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.8, // metres — the circle the vault closes over

    /* --- light --- */
    lightColor: '#eaffd8',
    lightIntensity: 7, // the light falling through the vault
    lightRadius: 11,
    lightHeight: 0.55, // share of the apex height the light hangs at once sealed

    /* ================================================================ */
    /* TIMING                                                            */
    /* ================================================================ */
    riseStagger: 0.45, // seconds from the first rib breaking the floor to the last
    riseShuffle: 0.35, // 0 a sweep round the ring, 1 a random order
    riseTime: 0.7, // seconds one rib takes to climb to the apex
    closeLead: 0.75, // the sheaf starts to close this share into the last rib's climb
    closeTime: 0.42, // seconds the open sheaf takes to bend over into the arch
    closeOvershoot: 0.35, // how far past shut it slams before it settles
    sealAt: 0.82, // share of the close at which the vault counts as sealed (the beat)
    witherStagger: 0.5, // seconds from the first rib drawing back to the last
    witherTime: 0.9, // seconds one rib takes to draw back into the floor
    witherOpen: 0.7, // how closed the vault stays as it withers (1 shut, 0 the open sheaf)

    /* ================================================================ */
    /* 1 · THE RIBS                                                      */
    /* ================================================================ */
    ribCount: 9, // ribs round the ring
    ribInset: 0.95, // the rim the ribs come up on, × zoneRadius
    ribJitter: 0.25, // how unevenly they are spaced
    springHeight: 2.1, // metres the ribs rise straight before they arch
    apexHeight: 5.8, // metres to the apex of the vault
    apexGap: 0.12, // metres short of the centre each tip stops (negative crosses over)
    archPoint: 0.7, // 0 a round dome, 1 a sharp gothic point
    openLean: 1.2, // metres the open sheaf splays outward before it closes
    ribSway: 0.35, // metres each rib wanders sideways
    strandSpread: 0.13, // metres the two strands stand apart
    strandTwist: 3.5, // turns they make round each other root to apex
    rootRadius: 0.17, // stem radius at the root, metres
    tipRadius: 0.05, // stem radius at the apex, metres
    tipTaper: 0.05, // share of the rib the growing tip tapers over
    knots: 0.35, // how big the knots along the stem swell
    barkBump: 0.6, // bark relief
    barkRidges: 7, // ridges round the stem
    ribAmbient: 0.4,
    ribDiffuse: 0.95,
    ribRimGlow: 0.9, // green rim at the silhouette
    ribRimPower: 2.6,
    sapGlow: 2.6, // the sap veins (bloom > 1)
    sapSpeed: 0.7, // pulses climbing the stem per second
    sapWidth: 0.1,
    growTipGlow: 3, // the lime-hot growing tip
    sealGlow: 1.6, // how hard the veins flare as the vault seals
    colorBark: '#2b3a1c',
    colorBarkLight: '#5d6b33',
    colorRibRim: '#7dd65a',
    colorSap: '#b8ff6a',
    colorGrowTip: '#e8ff9a',
    colorDry: '#5a4127',

    /* ================================================================ */
    /* 2 · THE THORNS                                                    */
    /* ================================================================ */
    thornsPerStrand: 10,
    thornLength: 0.26, // metres
    thornHook: 0.45, // how far the thorns hook back toward the root
    thornShrink: 0.8, // how far they shrink as the briar withers
    thornGloss: 60,
    thornSpecular: 0.6,
    thornGlint: 1.4, // a cold glint on the points (bloom > 1 on the seal)
    colorThornBase: '#4a1e14',
    colorThornMid: '#8a3a22',
    colorThornPoint: '#f0e2c0',
    colorThornGlint: '#ffd6e4',

    /* ================================================================ */
    /* 3 · THE ROSE WINDOW                                               */
    /* ================================================================ */
    windowLight: 1, // how bright the stained light on the floor is
    lightRise: 0.6, // seconds it takes to come up after the seal
    windowScale: 0.9, // the window's radius, × the rim
    glassGlow: 2.6, // the panes (bloom > 1)
    glassDapple: 0.35, // light moving through the leaves
    leadWidth: 0.07, // metres of tracery between panes
    soilWidth: 0.7, // metres of torn soil round the rim
    rootCracks: 1, // root cracks running in from each rib
    rootCrackRadius: 1.1, // the CRACK decal each rib leaves, metres
    colorSoil: '#1c140c',
    colorRootCrack: '#3a5a1e',
    colorLead: '#0b0f08',
    colorGlassA: '#ff5c8a', // rose
    colorGlassB: '#ffc65a', // amber
    colorGlassC: '#5ee08a', // emerald
    colorGlassD: '#8a7aff', // violet

    /* ================================================================ */
    /* 4 · THE SHAFT & THE SEAL                                          */
    /* ================================================================ */
    shaftOpacity: 0.55,
    shaftGlow: 1.4,
    shaftSpread: 0.6, // radius at the floor, × the rim
    shaftTop: 0.35, // radius at the apex, metres
    shaftRays: 16, // streaks round the cone
    shaftDrift: 0.25, // dust drifting down it
    colorShaftLow: '#ffe2a8',
    colorShaftHigh: '#fff6e0',
    sealWarp: 0.3, // how hard the air shudders as it seals
    warpScale: 1.2,
    sealShake: 0.5,
    sealShakeTime: 0.4,
    sealFlash: 0.25,
    sealLight: 2.2, // light punch on the seal, × lightIntensity
    sealBurst: 1.8, // the thin AIR shell off the apex, metres
    sealLeaves: 90, // leaves shaken off the apex as it slams shut
    ribShake: 0.08, // the jolt each rib gives breaking the floor
    riseRumble: 0.18, // camera rumble while the ribs climb
    colorFlash: '#f4ffd8',

    /* ================================================================ */
    /* 5 · THE RUNNER                                                    */
    /* ================================================================ */
    runnerStart: 0.8, // metres in front of the caster it starts
    runnerWidth: 0.55, // half-width of the heaved soil, metres
    runnerWave: 0.13, // metres the two roots twine apart
    runnerWaveLength: 1.5, // metres per twine
    runnerLine: 0.06, // root width, metres
    runnerGlow: 2.2,
    runnerLinger: 1.6, // seconds the runner takes to erode after it arrives
    runnerDebris: 70, // soil and leaves per second off its front
    travelRumble: 0.05,

    /* ================================================================ */
    /* 6 · LEAVES, SOIL, PETALS, MOTES                                   */
    /* ================================================================ */
    tipLeaves: 9, // per second off each climbing tip
    witherLeaves: 120, // dead leaves per second as it withers
    leafSize: 0.16,
    leafSpeed: 2.2,
    leafLife: 1.8,
    leafFall: 1.4, // m/s²
    colorLeafA: '#b8ef6a',
    colorLeafB: '#6cbf3c',
    colorLeafC: '#3c7a26',
    colorLeafD: '#24401a',
    soilPerRib: 22,
    soilSize: 0.09,
    soilSpeed: 5.5,
    soilLife: 1.1,
    colorSoilChipA: '#6a5236',
    colorSoilChipB: '#4a3824',
    colorSoilChipC: '#2e2216',
    colorSoilChipD: '#1a130c',
    petalRate: 26, // rose petals per second drifting down the shaft
    petalSize: 0.13,
    petalLife: 3.2,
    petalFall: 0.5,
    petalGlow: 1.2,
    colorPetalA: '#ffd0de',
    colorPetalB: '#ff7aa2',
    colorPetalC: '#d23a6a',
    colorPetalD: '#7a1a3a',
    moteRate: 70, // gold motes per second hanging in the light
    moteSize: 0.06,
    moteLife: 2.2,
    moteRise: 0.12,
    moteGlow: 2.6,
    colorMoteA: '#fff8e0',
    colorMoteB: '#ffe2a0',
    colorMoteC: '#ffb870',
    colorMoteD: '#804020',

    /* ================================================================ */
    /* 7 · THE BODIES                                                    */
    /* ================================================================ */
    hitReach: 1.05, // reach of the closing vault, × the rim
    hitImpulse: 4.5, // m/s pressed inward toward the centre
    hitLift: 1.8, // m/s
    hitSpin: 1.6
  }
};
