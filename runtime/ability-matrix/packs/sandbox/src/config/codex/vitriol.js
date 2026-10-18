/**
 * Vitriol Rain — Poison — a sick cloud gathers over the circle and rains acid.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `VitriolRainAbility`: the
 * cloud's size and lumps, the rain's density, slant and streaks, how fast the
 * floor is pitted — dragging any of it changes a storm already falling.
 */
export default {
  id: 'vitriol',
  meta: {
    label: 'Vitriol Rain',
    accent: '#d2ff55',
    key: '',
    element: 'poison',
    hint: 'Poison — a sick cloud gathers over the circle and rains vitriol that pits the ground',
    cast: 'zone',
    glyph: `<path d="M24 40C24 28 36 22 46 26C52 14 72 16 74 30C86 30 88 46 76 48H28C20 48 18 42 24 40Z"/><path d="M32 58L28 70M48 58L44 74M64 58L60 70M40 78L38 84M58 78L56 86"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    zoneRadius: 4.8, // radius of the circle it rains on, metres
    speed: 20, // how fast the seed flies to the sky over the circle, metres/second
    lifetime: 1.8, // seconds the cloud takes to break up and the pits to cool after the rain
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#e4ff7a',
    lightIntensity: 7,
    lightRadius: 12,
    lightFlicker: 0.3, // 0..1 the light pulsing in the cloud

    /* ================================================================ */
    /* 1 · THE SEED — what the caster throws to the sky                  */
    /* ================================================================ */
    seedSize: 0.45, // radius of the glowing glob, metres
    seedArc: 1.5, // metres the arc rises above the cloud height at its peak
    seedGlow: 4.5,
    seedTrail: 140, // motes per second shed along the arc
    colorSeedCore: '#fbffd8',
    colorSeedHalo: '#b8f030',

    /* ================================================================ */
    /* 2 · THE CLOUD                                                     */
    /* ================================================================ */
    cloudHeight: 4.8, // metres off the floor its belly hangs
    cloudRadius: 1.25, // × zoneRadius
    cloudThickness: 1.7, // metres top to bottom
    bloomTime: 0.45, // seconds it takes to boil out of the seed
    lumpAmount: 0.38, // cauliflower lumps, metres
    lumpScale: 0.6, // lumps per metre
    mammaAmount: 0.6, // bulges hanging off its belly, metres
    mammaScale: 1.4, // bulges per metre
    churnSpeed: 0.35, // how fast it roils
    cloudOpacity: 0.92,
    bellyGlow: 1.3, // the sick light in its underside (bloom > 1)
    rimLight: 0.35, // light round its silhouette
    pulseRate: 1.4, // throbs of light inside it per second
    colorCloudTop: '#1a2010',
    colorCloudMid: '#28321a',
    colorCloudBelly: '#b8e83a',
    colorCloudRim: '#e8ff9a',

    /* ================================================================ */
    /* 3 · THE RAIN                                                      */
    /* ================================================================ */
    rainDelay: 0.1, // seconds after the bloom starts before the first drops fall
    rainTime: 2.4, // seconds it rains at full strength
    rainRamp: 0.25, // seconds it takes to reach full strength
    density: 0.85, // 0..1 share of the drops that fall
    fallSpeed: 14, // metres/second
    streakLength: 0.9, // metres each drop streaks
    streakWidth: 0.05, // metres
    slant: 0.18, // metres sideways per metre fallen
    rainGlow: 3.2,
    colorRain: '#e6ff7a',

    /* ================================================================ */
    /* 4 · THE PITTED FLOOR                                              */
    /* ================================================================ */
    pitScale: 1.5, // pit cells per metre
    pitSize: 0.32, // radius of a pit, × a cell
    pitRate: 0.55, // how fast pits appear (share of cells per second of rain)
    pitCool: 0.9, // per second a pit's acid dims
    pitGlow: 3.0,
    splashScale: 3.2, // splash rings per metre
    splashRate: 2.2, // rings per second, each
    splashGlow: 2.2,
    wetGlow: 0.5, // the sheen of acid on the whole circle
    edgeRagged: 0.35, // how ragged the circle is
    erode: 0.7, // 0..1 how raggedly it fades
    colorPitHot: '#f4ffb0',
    colorPitAcid: '#a8e02a',
    colorPitHole: '#080b03',
    colorWet: '#26300c',
    colorEtched: '#121608',

    /* ================================================================ */
    /* 5 · SPLASHES, STEAM & SIZZLE                                      */
    /* ================================================================ */
    splashRate3D: 120, // droplet splashes per second while it pours
    splashSize: 0.045,
    splashSpeed: 2.6,
    splashLife: 0.45,
    steamRate: 26, // steam puffs per second
    steamSize: 0.9,
    steamLife: 2.2,
    steamRise: 0.8,
    steamOpacity: 0.3,
    sizzleRate: 90, // glowing sizzle motes per second
    sizzleSize: 0.04,
    sizzleLife: 0.8,
    sizzleGlow: 3,
    colorSplashA: '#f4ffc0',
    colorSplashB: '#d2ff55',
    colorSplashC: '#88aa22',
    colorSplashD: '#2c3a08',
    colorSteamA: '#9eb46a',
    colorSteamB: '#7a8a50',
    colorSteamC: '#4a5434',
    colorSteamD: '#262b1e',
    colorSizzleA: '#ffffe0',
    colorSizzleB: '#e4ff70',
    colorSizzleC: '#8ccf1e',
    colorSizzleD: '#2a4206',

    /* ================================================================ */
    /* 6 · SHIMMER & THE BLOOM                                           */
    /* ================================================================ */
    shimmerStrength: 0.4, // how hard the air over the circle bends
    shimmerHeight: 2.4, // metres
    shimmerScale: 1.6,
    shimmerSpeed: 1.4,
    bloomFlash: 0.18,
    bloomShake: 0.25,
    bloomLight: 2.2, // light punch as the cloud blooms, × lightIntensity
    rainRumble: 0.05, // camera rumble while it pours
    colorFlash: '#d8ff80',
    colorShock: '#c8f050',

    /* ================================================================ */
    /* 7 · THE MELT                                                      */
    /* ================================================================ */
    exposureToFall: 1.1, // seconds of rain a body stands before it collapses
    corrodeRate: 0.45, // stain per second of exposure
    fallImpulse: 1.2, // m/s it slumps with
    fallLift: 0.6,
    colorMeltBody: '#2a3008',
    colorMeltRim: '#c8f040',
    meltRimGlow: 2.4,
    colorMeltEdge: '#f4ffb0',
    meltEdgeGlow: 3.6,
    meltEdgeWidth: 0.06
  }
};
