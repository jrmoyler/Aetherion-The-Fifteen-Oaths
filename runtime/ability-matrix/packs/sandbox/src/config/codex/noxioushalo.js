/**
 * Noxious Halo — Poison — a ring of churning gas hangs over the circle,
 * trailing a curtain of fume, tightens like a noose and pops.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `NoxiousHaloAbility`, so
 * dragging any of it re-shapes a halo that is already hanging there.
 */
export default {
  id: 'noxioushalo',
  meta: {
    label: 'Noxious Halo',
    accent: '#e4ff8a',
    key: '',
    element: 'poison',
    hint: 'Poison — a ring of churning gas hangs over the circle trailing a curtain of fume, tightens like a noose, then pops',
    cast: 'zone',
    glyph: `<ellipse cx="50" cy="34" rx="34" ry="11"/><path d="M20 40L30 82M34 44L38 86M50 46V88M66 44L62 86M80 40L70 82"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    zoneRadius: 4.5, // radius of the circle the halo hangs over, metres
    speed: 18, // how fast the halo is thrown to the circle, metres/second
    lifetime: 1.8, // seconds the stain and the fumes take to clear after the pop
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#eaff9a',
    lightIntensity: 7,
    lightRadius: 12,
    lightFlicker: 0.3,

    /* ================================================================ */
    /* 1 · THE HALO — shape                                              */
    /* ================================================================ */
    throwHeight: 1.4, // metres off the floor it leaves the hand at
    throwRadius: 0.45, // its radius as it leaves the hand, metres
    haloHeight: 2.7, // metres off the floor it hangs at
    haloRadius: 1.0, // × zoneRadius
    tubeRadius: 0.32, // thickness of the gas ring, metres
    lumps: 0.35, // how lumpy the gas is, × the tube radius
    lumpScale: 1.6, // lumps per metre
    wobble: 0.22, // metres the ring rocks up and down
    spinSpeed: 2.2, // radians/second it turns while it hangs
    rollSpeed: 3.5, // radians/second the gas rolls round the tube

    /* ================================================================ */
    /* 2 · THE HALO — gas                                                */
    /* ================================================================ */
    bands: 4, // twisted bands of darker gas round the ring
    bandTwist: 6, // turns the bands make round the ring
    gasOpacity: 0.85,
    gasGlow: 1.6, // the body of the gas
    coreGlow: 5, // the bright filament at its heart (bloom > 1)
    coreWidth: 0.07, // filament radius, metres
    rimGlow: 1.4,
    colorGasA: '#f4ffc0', // hottest
    colorGasB: '#d4f25a',
    colorGasC: '#6e8c1c',
    colorGasD: '#1e2808', // dark bands
    colorCore: '#f8ffd8',

    /* ================================================================ */
    /* 3 · THE CURTAIN — fume hanging from the ring                      */
    /* ================================================================ */
    hoverTime: 0.55, // seconds it hangs at full size, the curtain dripping down
    strands: 34, // fume strands round the curtain
    strandSharp: 5, // how thin they are (higher = thinner)
    curtainGlow: 1.6,
    curtainOpacity: 0.5,
    curtainFlow: 1.2, // metres/second the fume slides down
    curtainFlare: 0.25, // how much wider it is at the floor, × radius
    colorCurtainA: '#e4ff8a',
    colorCurtainB: '#5c7a14',

    /* ================================================================ */
    /* 4 · THE NOOSE — tightening                                        */
    /* ================================================================ */
    tightenTime: 1.35, // seconds it takes to close
    tightenTo: 0.16, // radius it closes to, × its full radius
    thickenTo: 1.9, // tube thickness it swells to, × tubeRadius
    tightenCurve: 2.2, // >1 closes slowly then snaps
    spinUp: 5, // × spinSpeed by the time it is closed
    glowUp: 2.4, // × the glow by the time it is closed
    suckRate: 70, // gas wisps per second drawn in from round the circle
    suckSpeed: 4.5, // m/s they are drawn in at
    tightenRumble: 0.12,

    /* ================================================================ */
    /* 5 · THE GROUND — shadow ring and stain                            */
    /* ================================================================ */
    ringGlow: 2.6, // the toxic ring on the floor under the halo
    ringWidth: 0.16, // metres
    streaks: 26, // suction streaks drawn toward the middle
    streakGlow: 1.4,
    stainOpacity: 0.7,
    erode: 0.7, // 0..1 how raggedly it fades
    colorRing: '#d8ff60',
    colorStain: '#161c08',
    colorStreak: '#a8d830',

    /* ================================================================ */
    /* 6 · THE POP                                                       */
    /* ================================================================ */
    popTime: 0.5, // seconds the blast ring takes to open
    popRadius: 1.7, // × zoneRadius, how far the gas ring blows out
    popWidth: 0.35, // the blast ring's thickness, × its radius
    popGlow: 3.2,
    popWarp: 1.5, // how hard it bends the air
    globules: 160, // gobbets of poison flung out
    globSpeed: 10,
    globSize: 0.09,
    globLife: 0.9,
    popPuffs: 40,
    popShock: 1.6, // × zoneRadius, the shockwave on the floor
    popFlash: 0.35,
    popShake: 0.6,
    shakeDuration: 0.4,
    popLight: 3.2, // light punch, × lightIntensity
    colorPop: '#eaff8a',
    colorFlash: '#e0ff90',
    colorShock: '#c8f050',

    /* ================================================================ */
    /* 7 · WISPS, MOTES & GLOBULES                                       */
    /* ================================================================ */
    wispSize: 0.7,
    wispLife: 1.4,
    wispOpacity: 0.36,
    moteRate: 80, // motes per second shed off the ring
    moteSize: 0.045,
    moteLife: 1,
    moteGlow: 3,
    colorWispA: '#b8cc6a',
    colorWispB: '#8a9e46',
    colorWispC: '#56622a',
    colorWispD: '#262c16',
    colorMoteA: '#ffffe0',
    colorMoteB: '#e8ff7a',
    colorMoteC: '#94d020',
    colorMoteD: '#2e4606',
    colorGlobA: '#f0ffb0',
    colorGlobB: '#c6f25a',
    colorGlobC: '#6e9614',
    colorGlobD: '#26340a',

    /* ================================================================ */
    /* 8 · HAZE                                                          */
    /* ================================================================ */
    hazeStrength: 0.7,
    hazeWidth: 2.4, // × the tube radius
    hazeScale: 2,
    hazeSpeed: 2.5,

    /* ================================================================ */
    /* 9 · THE CHOKED                                                    */
    /* ================================================================ */
    chokeRate: 0.55, // stain per second while the noose closes on a body
    choke: 0.9, // 0..1 the most a body is stained
    hitImpulse: 8, // m/s a body is thrown outward at the pop
    hitLift: 5,
    hitSpin: 2,
    colorChokeBody: '#2c3410',
    colorChokeRim: '#d0f050',
    chokeRimGlow: 2.6,
    colorChokeEdge: '#f4ffb8',
    chokeEdgeGlow: 3.4,
    chokeEdgeWidth: 0.05
  }
};
