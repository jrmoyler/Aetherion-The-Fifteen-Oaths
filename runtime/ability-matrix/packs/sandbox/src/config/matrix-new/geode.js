/**
 * Geode Eruption — Crystal — a hexagonal geode that grows, then slowly shatters.
 *
 * Matrix New data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * Every number below is read by the ability *every frame*. The few marked
 * "(rebuild)" reshape the shell's plates, which are real geometry: the plates
 * are rebuilt the frame such a slider moves, and the cast carries on.
 */
export default {
  id: 'geode',
  meta: {
    label: "Geode Eruption",
    accent: '#c4a0ff',
    key: 'F',
    hint: "Crystal — a stone geode grows out of the floor, cracks open on an amethyst heart, then slowly shatters outward",
    cast: 'zone',
    glyph: `<path d="M50 14L80 31V69L50 86L20 69V31Z"/><path d="M50 32L64 50L50 68L36 50Z"/><path d="M50 14V32M80 31L64 50M80 69L64 50M50 86V68M20 69L36 50M20 31L36 50"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 16, // maximum cast distance, metres
    minRange: 0, // closer than this and the cast is refused
    speed: 12, // how fast the seed crystal skips to the circle, metres/second
    lifetime: 3.5, // seconds from the seed landing until the shell has burst and flown
    cooldown: 0.7, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.5, // the circle the aim indicator measures out, metres
    fadeTime: 2.0, // seconds for the fallen plates to settle and sink away
    colorA: '#c4a0ff', // the seed crystal's glints
    colorB: '#ffe0ff', // ... and its core
    seedHeight: 0.6, // metres off the floor the seed skips at
    seedTrailRate: 90, // glints / second off the travelling seed
    seedSize: 0.07, // their size

    /* --- the beats, seconds after the seed lands --- */
    growTime: 0.7, // the shell rises out of the floor over this
    growOvershoot: 0.06, // how far past its height it heaves, × the height
    crackDelay: 0.85, // seams start to glow
    crackTime: 0.9, // ... and are fully open after this
    crackTicks: 4, // audible cracks (shake + chips) while it opens
    crackGap: 0.14, // metres each plate parts from its neighbours as it cracks
    peelLower: 0.06, // radians the lower plates lean out as it cracks
    peelUpper: 0.26, // ... the upper plates
    peelCap: 0.75, // ... the cap wedges, opening like petals
    burstDelay: 2.45, // the shell bursts
    shatterSlow: 0.35, // the flight starts at × this speed — the slow-motion shatter
    shatterRamp: 0.9, // seconds of flight before it is back to full speed

    /* ================================================================ */
    /* 1 · THE STONE SHELL                                               */
    /* ================================================================ */
    shellRadius: 0.62, // radius across the hexagon's corners, × zone radius (rebuild)
    shellHeight: 0.62, // height, × zone radius (rebuild)
    shellBulge: 1.08, // how far the walls bow out, × radius (rebuild)
    shellShoulder: 0.82, // shoulder ring, × radius (rebuild)
    shellThickness: 0.22, // metres of stone (rebuild)
    shellFacets: 4, // facets across a plate (rebuild)
    shellRoughness: 0.12, // how lumpy the stone is, metres (rebuild)
    shellTwist: 0.0, // radians the hexagon is turned, on top of a random turn

    /* --- the stone's look --- */
    stoneScale: 1.4, // features per metre in the rock
    stoneBump: 0.9, // fake bump from the rock noise
    stoneSpecular: 0.25,
    stoneLichen: 0.35, // pale crust in the hollows
    agateBands: 9, // bands per metre in the agate lining
    agateWarp: 0.6, // how much the bands wander
    agateGlow: 0.6, // light the lining gives off once it is open
    drusy: 2.4, // sparkle of the tiny crystals lining the inside
    seamWidth: 0.12, // metres the crack light spreads from a seam
    seamGlow: 7.0, // brightness of the open seams
    seamFlicker: 0.35, // light flickering in the seams
    plateEmber: 0.35, // how much of the seam light the flying plates keep
    plateDissolve: 0.08, // edge width of the dissolve as fallen plates go
    colorStone: '#4a4048', // grey-violet stone
    colorStoneDark: '#211b22', // the hollows
    colorLichen: '#8f8578', // pale crust
    colorAgateA: '#e8dcff', // the lining's bands, outer
    colorAgateB: '#8a6acc',
    colorAgateC: '#3a2466', // inner
    colorSeam: '#d9b8ff', // light in the cracks
    colorSeamHot: '#ffffff', // the hottest part of a seam

    /* ================================================================ */
    /* 2 · THE AMETHYST                                                  */
    /* ================================================================ */
    crystalCount: 140, // crystals lining the shell (max 168)
    crystalHeart: 14, // of those, how many stand in the floor in the middle
    crystalDelay: 0.75, // they start to grow
    crystalGrow: 1.1, // seconds for a crystal to grow
    crystalStagger: 0.6, // seconds of spread between the first and the last
    crystalLength: 0.75, // metres, a lining crystal
    crystalHeartLength: 1.7, // metres, the tallest in the heart
    crystalRadius: 0.11, // metres
    crystalJitter: 0.45, // size variation
    crystalSplay: 0.45, // radians they fan away from the shell's normal
    crystalShatter: 0.35, // seconds for a crystal to fracture at the burst

    /* --- the crystals' look --- */
    crystalIOR: 1.45, // refraction of the fake see-through
    crystalRefract: 1.1, // how much of the world shows through
    crystalInner: 2.6, // light inside the crystal
    crystalTipGlow: 1.6, // brighter toward the point
    crystalRim: 2.2, // fresnel rim
    crystalSparkle: 4.0, // glints off the facets
    crystalSparkleSharp: 60, // how tight those glints are
    crystalPulse: 0.25, // light breathing inside them
    crystalFractureGlow: 6, // the fracture lines as they break
    colorCrystalDeep: '#2e0c5c', // at the root
    colorCrystalBody: '#8a4de0',
    colorCrystalTip: '#e9d6ff', // at the point
    colorCrystalInner: '#b98aff',
    colorCrystalRim: '#f0e0ff',

    /* --- the inner light --- */
    innerLight: 2.4, // brightness of the light at the heart
    innerLightSize: 1.1, // × the shell radius
    innerLightRays: 0.6, // how much it breaks into rays
    colorInnerLight: '#c79bff',

    /* ================================================================ */
    /* 3 · THE SHATTER                                                   */
    /* ================================================================ */
    burstSpeed: 6.5, // m/s the plates leave at
    burstLift: 5.5, // m/s upward
    burstSpeedJitter: 0.4,
    plateGravity: 14, // m/s²
    plateSpin: 3.2, // rad/s tumble
    plateSlide: 0.35, // how far a plate skids after it lands, × its speed
    plateSink: 0.6, // metres the fallen plates sink by the end
    shardCount: 4, // glinting shards per crystal as it fractures
    shardSpeed: 6.5,
    shardSize: 0.11,
    shardLifetime: 1.4,
    shardGravity: -9,
    colorShardA: '#ffffff',
    colorShardB: '#d6b8ff',
    colorShardC: '#8a4de0',
    colorShardD: '#2e0c5c',
    glintCount: 70, // streaks of light at the burst
    glintSpeed: 11,
    glintSize: 0.08,
    glintLifetime: 0.55,
    chipCount: 60, // stone chips at the burst (and a few per crack)
    chipSpeed: 6,
    chipSize: 0.14,
    chipLifetime: 1.3,
    colorChipA: '#6c626a',
    colorChipB: '#4a4048',
    colorChipC: '#2a2228',
    colorChipD: '#171216',

    /* ================================================================ */
    /* 4 · DUST, MOTES & RING                                            */
    /* ================================================================ */
    dustRate: 60, // dust / second while the shell grows
    dustCount: 70, // dust thrown out by the burst
    dustSpeed: 4.5,
    dustSize: 1.5,
    dustLifetime: 2.0,
    dustOpacity: 0.55,
    colorDustA: '#9a8f96',
    colorDustB: '#6e6470',
    colorDustC: '#463d48',
    colorDustD: '#221d24',
    moteRate: 45, // violet motes / second rising out of the seams
    moteSize: 0.06,
    moteLifetime: 1.6,
    moteRise: 0.9,
    colorMoteA: '#ffffff',
    colorMoteB: '#d6b8ff',
    colorMoteC: '#8a4de0',
    colorMoteD: '#2e0c5c',
    ringRadius: 2.2, // the shock ring, × the shell radius
    ringLife: 0.9,
    rimeLife: 6, // crystal rime left on the floor, seconds
    rimeRadius: 1.2, // × the shell radius

    /* ================================================================ */
    /* 5 · THE BODIES                                                    */
    /* ================================================================ */
    encaseReach: 1.0, // bodies inside × the shell radius are encased
    encaseStain: 0.8, // how crystallised they go while encased, 0..1
    killImpulse: 9, // m/s they are thrown outward at the burst
    killLift: 6.5, // m/s upward
    killSpin: 1.6,
    look: {
      color: '#2a1a40', // the flesh, crystallising
      rimColor: '#c4a0ff',
      rimEmissive: 2.2,
      edgeColor: '#ffe0ff',
      edgeEmissive: 4.0,
      edgeWidth: 0.05
    },

    /* ================================================================ */
    /* 6 · BEATS                                                         */
    /* ================================================================ */
    growShake: 0.3, // continuous rumble as it rises
    crackShake: 0.18, // per crack
    burstShake: 0.8,
    burstFlash: 0.5,
    colorFlash: '#d9b8ff',
    burstRadius: 3.6, // the frost shell at the burst, metres
    burstLife: 0.7,
    colorBurstA: '#3a2466',
    colorBurstB: '#a87cff',
    colorBurstC: '#ffffff',

    /* --- light --- */
    lightColor: '#c4a0ff',
    lightIntensity: 6,
    lightRadius: 9,
    crackLight: 4, // light punch per crack
    burstLight: 26 // light punch at the burst
  }
};
