/**
 * Hollow Meridian — Void — a line cast. A dark wake runs out along the chosen
 * line; behind it three staggered breaches tear open in the floor, one after
 * another, each hollowing out the enemies standing over it before it seals.
 *
 * Expansion candidate data block: presentation (`meta`) and the live settings
 * the ability and its editor folder read. Plain data, no imports.
 *
 * Gameplay keys (`windup`, `strikeGap`, `zoneRadius`, `damage`, the `hit*`
 * response) drive the combat bridge and are pinned by tests; everything else
 * is presentation and is resolved every frame, so dragging any slider
 * re-shapes a breach that is already open.
 */
export default {
  id: 'exp-hollow-meridian',
  uid: 'matrix-expansion/hollow-meridian',
  meta: {
    label: 'Hollow Meridian',
    element: 'void',
    accent: '#9889fa',
    cast: 'line',
    key: '',
    hint: 'Void — a dark wake runs down the line and three staggered seams tear open behind it, hollowing out every enemy standing over a breach',
    glyph: '<path d="M15 50H85M25 25L35 75M45 20L55 80M65 25L75 75"/><circle cx="50" cy="50" r="12"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 20, // metres/second the wake runs down the line
    cooldown: 7, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    lifetime: 2.5, // seconds the breaches have to open and hold (× global lifetime)
    fade: 1, // seconds the release takes once the impact phase ends (× global lifetime)

    /* --- the breaches (gameplay; read by the combat bridge) --- */
    zoneRadius: 1.4, // radius of each breach's hit disc, metres
    windup: 0.3, // seconds after arrival before the first breach opens
    strikeGap: 0.45, // seconds between breaches (min 0.15)
    damage: 1, // damage per breach
    hitImpulse: 4, // knockback a breach applies, scaled by global explosion intensity
    hitLift: 2, // upward share of that knockback
    hitSpin: 1.5, // tumble imparted

    /* --- light (rides the wake, then the latest open breach) --- */
    lightColor: '#8e7cff',
    lightIntensity: 5,
    lightRadius: 7,
    lightPunch: 4, // extra intensity punched in as each breach opens

    /* --- palette --- */
    voidColor: '#281b58', // the nebula inside a breach
    coreColor: '#05020f', // the deepest dark at its centre line
    edgeColor: '#b8a8ff', // the burning rim, cracks and glyphs
    starColor: '#ece6ff', // star points, crack cores and wave heads

    /* ================================================================ */
    /* 1 · THE WAKE — travel                                             */
    /* ================================================================ */
    travelLength: 2, // metres of wake trailing the front
    travelWidth: 1, // wake width multiplier
    travelGlow: 1.6, // emissive gain on the torn edges
    headSize: 1, // size of the spindle riding the front
    headFresnel: 1.6, // how hard the spindle's silhouette burns
    wakeFade: 0.18, // seconds the wake and spindle take to collapse after arrival
    particleRate: 22, // wake streaks/second off the front
    particleSize: 0.1, // size of the wake and jet streaks

    /* ================================================================ */
    /* 2 · THE WARNING — anticipation over the next breach               */
    /* ================================================================ */
    warningIntensity: 0.6, // opacity of the ground glyph
    warningGlow: 1.4, // emissive gain of the glyph
    warningSpin: 0.35, // revolutions/second the glyph turns

    /* ================================================================ */
    /* 3 · THE SEAMS — the breaches themselves                           */
    /* ================================================================ */
    seamHold: 1.4, // seconds a breach stays fully open
    seamClose: 0.6, // seconds it takes to seal
    seamOpenTime: 0.18, // seconds it takes to tear open
    seamOvershoot: 0.25, // how far past full width the tear snaps before settling
    seamHeight: 1, // height multiplier (2.8 m at 1)
    seamRagged: 1, // how hard noise tears the rim
    seamSwirl: 1, // how hard the nebula winds into the centre
    seamStars: 1, // brightness of the star points inside
    seamDepth: 0.85, // how much darker the centre line is than the lips
    rimWidth: 0.12, // width of the burning rim, as a fraction of the half-width
    rimGlow: 2.4, // emissive gain of the rim (blooms past 1)
    riftFlow: 1, // speed of everything flowing inside the breach
    softFade: 0.35, // metres over which a seam fades into the floor it cuts

    /* ================================================================ */
    /* 4 · THE FLOOR — fractures and the breach wave                     */
    /* ================================================================ */
    fractureReach: 1, // crack reach, × zoneRadius
    fractureIntensity: 0.65, // crack opacity
    fractureSpeed: 0.24, // seconds the cracks take to run out
    fractureFlicker: 1, // light leaking up through the cracks
    fractureGlow: 1.6, // emissive gain of the cracks
    waveRadius: 2.2, // how far the breach wave runs, × zoneRadius
    waveLife: 0.55, // seconds the wave takes
    waveWidth: 0.35, // band width of the wave, fraction of its radius
    waveGlow: 2, // emissive gain of the wave

    /* ================================================================ */
    /* 5 · THE SHARDS — torn fragments hanging round each breach         */
    /* ================================================================ */
    shardScale: 1, // fragment size multiplier
    shardRise: 1.5, // metres they climb as the breach opens
    shardSpin: 1, // tumble speed
    shardGlow: 2, // edge emissive gain
    shardFresnel: 2, // edge tightness
    releaseScatter: 1, // how far they fly apart on the release

    /* ================================================================ */
    /* 6 · PARTICLES                                                     */
    /* ================================================================ */
    cutJet: 10, // streaks per jet as a breach opens (two jets)
    cutSpeed: 1, // jet speed multiplier
    cutStretch: 0.35, // velocity stretch of the streaks
    cutGlow: 1.5,
    cutColorA: '#b8a8ff', // birth
    cutColorB: '#8175b3', // early
    cutColorC: '#281b58', // late
    cutColorD: '#0e091f', // death
    moteRate: 30, // motes/second falling into a charging or open breach
    moteSize: 0.06,
    moteLife: 1.1,
    moteSwirl: 3, // radians/second the motes orbit
    motePull: 0.85, // 0..1 how far their orbit closes before they die
    moteGlow: 1.4,
    moteColorA: '#ece6ff',
    moteColorB: '#b8a8ff',
    moteColorC: '#6a54c8',
    moteColorD: '#140c30',
    gritCount: 14, // floor chips thrown up per breach
    gritSize: 0.07,
    gritLife: 0.9,
    gritSpeed: 3,
    gritGravity: 7,
    gritColorA: '#5e5872',
    gritColorB: '#3a3548',
    gritColorC: '#221f2c',
    gritColorD: '#100e16',

    /* ================================================================ */
    /* 7 · DISTORTION — the pull of each open breach                     */
    /* ================================================================ */
    warpStrength: 0.6, // screen-space pull
    warpScale: 1.5, // shimmer noise scale
    warpTwist: 1.6, // radians the pull twists toward the centre
    warpWidth: 1.4, // billboard width, × zoneRadius
    warpHeight: 1.2, // billboard height, × the seam's height

    /* ================================================================ */
    /* 8 · THE BEAT — on every accepted breach                           */
    /* ================================================================ */
    impactShake: 0.18, // camera trauma (× global camera shake)
    impactFlash: 0.1 // screen flash (× global explosion intensity)
  }
};
