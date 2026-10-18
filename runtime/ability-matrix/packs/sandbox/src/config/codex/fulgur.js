/**
 * Fulgur Cage — Lightning — bars of lightning drop out of the sky in a ring
 * round the circle, stand crackling as a cage, then arc inward on whatever
 * is inside and knot together in the middle until it bursts.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension and time below is resolved per frame by
 * `FulgurCageAbility`, so dragging any of it in the editor re-shapes a cage
 * that is already standing.
 */
export default {
  id: 'fulgur',
  meta: {
    label: 'Fulgur Cage',
    accent: '#d6e4ff',
    key: '',
    element: 'storm',
    hint: 'Lightning — bars of fulgur drop from the sky in a ring, stand as a crackling cage, then arc inward and burst',
    cast: 'zone',
    glyph: `<path d="M24 14L28 40L22 58L27 86"/><path d="M50 8L46 34L53 56L48 90"/><path d="M76 14L72 40L78 58L73 86"/><path d="M27 48L38 52L50 46L62 52L74 48"/><circle cx="50" cy="62" r="5"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // how fast the static crawl runs to the circle, metres/second
    lifetime: 1.2, // seconds the bars take to gutter out and the glass to cool
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.4, // the circle, metres — the bars drop round its rim

    /* --- light --- */
    lightColor: '#cfdcff',
    lightIntensity: 8, // the cage's steady glow
    lightRadius: 13,
    lightFlicker: 0.45, // 0..1 how hard the light stutters

    /* ================================================================ */
    /* TIMING                                                            */
    /* ================================================================ */
    dropTime: 0.55, // seconds over which every bar strikes
    strikeTime: 0.07, // seconds one bar takes to reach the floor from the sky
    cageTime: 0.6, // seconds the closed cage stands crackling
    arcTime: 0.55, // seconds over which the arcs leap inward
    knotTime: 0.4, // seconds the knot swells before it bursts

    /* ================================================================ */
    /* 1 · THE BARS                                                      */
    /* ================================================================ */
    barCount: 10, // max 16
    barHeight: 16, // metres up the bars come from
    barWidth: 0.2, // metres, ribbon half-width
    barJag: 0.45, // metres of jag
    barFreq: 7, // jags over its length
    barFlicker: 16, // re-shapes per second
    barHold: 0.65, // brightness while it stands (the strike itself is 1+)
    strikeFlare: 2.2, // brightness of the return stroke
    branches: 2, // side branches per bar
    branchLength: 1.6, // metres
    linkTiers: 2, // rings of crackle joining the bars
    linkLow: 0.8, // metres, the lower ring
    linkHigh: 2.8, // metres, the upper ring
    linkJag: 0.3,
    linkGlow: 0.45, // brightness of the links

    /* lightning look */
    boltCore: 0.28, // core width (× ribbon)
    boltGlow: 4.2,
    boltCrawl: 30, // how fast brightness crawls along a bolt
    colorBoltCore: '#ffffff',
    colorBoltBody: '#8db4ff',
    colorBoltHalo: '#7a52ff',

    /* ================================================================ */
    /* 2 · THE ARCS & THE KNOT                                           */
    /* ================================================================ */
    arcHeight: 1.5, // metres up the bar the arc leaves from
    arcWidth: 0.13,
    arcJag: 0.55,
    arcFreq: 6,
    arcFlicker: 26,
    arcGlow: 1.3,
    knotHeight: 1.4, // metres off the floor
    knotSize: 1.6, // metres across at its fullest
    knotGlow: 2.6,

    /* ================================================================ */
    /* 3 · FULGURITES                                                    */
    /* ================================================================ */
    glassPerBar: 3, // glass tubes left at each foot (max 4)
    glassHeight: 1.0, // metres, tallest
    glassWidth: 0.13, // metres
    glassLean: 0.5, // radians of splay
    glassGrowTime: 0.18, // seconds they take to fuse up
    glassGlow: 3.5,
    glassSheen: 0.7,
    glassCrust: 0.6, // sandy crust
    colorGlass: '#1d2420',
    colorSand: '#6b6152',
    colorGlassHot: '#ffd6a0',

    /* ================================================================ */
    /* 4 · THE SCORCHED FLOOR                                            */
    /* ================================================================ */
    floorGlow: 3,
    colorSoot: '#0d0f16',

    /* ================================================================ */
    /* 5 · SPARKS, MOTES, SMOKE                                          */
    /* ================================================================ */
    sparkCount: 40, // per strike
    sparkSpeed: 9,
    sparkSize: 0.05,
    sparkLifetime: 0.45,
    sparkStretch: 0.7,
    colorSparkA: '#ffffff',
    colorSparkB: '#cfe0ff',
    colorSparkC: '#7f9cff',
    colorSparkD: '#4b2fb0',
    moteRate: 90, // ionised motes rising inside the cage
    moteSize: 0.05,
    moteLifetime: 1.2,
    smokeCount: 6, // per strike
    smokeSize: 0.7,
    smokeLifetime: 1.6,
    smokeOpacity: 0.5,
    colorSmokeA: '#3a3d4a',
    colorSmokeB: '#2a2c36',
    colorSmokeC: '#1c1d24',
    colorSmokeD: '#101116',
    ionWarp: 0.6, // juddering ionised air

    /* ================================================================ */
    /* 6 · BODIES                                                        */
    /* ================================================================ */
    hitImpulse: 3, // metres/second, away from the bar that struck it
    hitLift: 4,
    hitSpin: 2.2,
    burstImpulse: 8, // what is still standing when the knot bursts
    burstLift: 4,
    scorchTint: 0.6, // 0..1 how charred a struck body goes
    colorBodyBurnt: '#202634',
    colorBodyRim: '#9fc0ff',
    bodyRimGlow: 2.5,
    colorBodyEdge: '#e6eeff',
    bodyEdgeGlow: 3,

    /* ================================================================ */
    /* 7 · THE BEAT                                                      */
    /* ================================================================ */
    strikeShake: 0.18,
    strikeFlash: 0.12,
    strikeLight: 22,
    arcShake: 0.1,
    burstShake: 0.7,
    burstFlash: 0.55,
    burstLight: 70,
    colorFlash: '#dfe8ff',
    burstRadius: 4,
    burstLife: 0.5,
    shockRadius: 7,
    shockLife: 0.5,
    colorShockA: '#9db8ff',
    colorShockB: '#ffffff',
    scorchRadius: 1.0, // the scorch decal at each foot

    /* travel — static crawling along the floor */
    crawlSpacing: 1.4,
    crawlRadius: 0.8,
    crawlLife: 1,
    crawlSparks: 160 // sparks per second
  }
};
