/**
 * Glass Tide — Water — a curtain of tide whips down the line, turns to glass
 * at the end of it and shatters.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 *
 * Every dimension below is resolved per frame by `GlassTideAbility`, so
 * dragging any of it in the editor re-shapes a sheet that is already running —
 * its height, its whip, its glass, the shards it breaks into.
 */
export default {
  id: 'glasstide',
  meta: {
    label: 'Glass Tide',
    accent: '#b7e6ff',
    key: '',
    element: 'water',
    hint: 'Water — a glass-hard sheet of tide whips down the line, freezes into glass at the end and shatters',
    cast: 'line',
    glyph: `<path d="M12 80C24 74 30 52 44 50C58 48 62 66 74 58C82 52 84 34 88 18"/><path d="M12 80H88"/><path d="M66 30L74 22M78 40L90 36M60 20L62 10"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 28, // how fast the head of the sheet runs down the line, metres/second
    lifetime: 1.5, // seconds the shards and the wet trail last after the shatter
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#cfefff',
    lightIntensity: 9, // the light rides the crest of the head
    lightRadius: 10,
    lightFlicker: 0.3, // 0..1 caustic shimmer on the light

    /* ================================================================ */
    /* 1 · THE SHEET — shape                                             */
    /* ================================================================ */
    tailStart: 0.8, // metres in front of the caster the sheet starts
    sheetLength: 7.5, // metres of sheet trailing behind the head
    headHeight: 2.7, // metres tall at the head
    tailHeight: 0.45, // metres tall at the tail
    heightCurve: 1.5, // >1 keeps it low until near the head
    crestLean: 0.7, // metres the crest leans forward at the head
    riseTime: 0.14, // seconds the sheet takes to stand up out of the floor
    whipAmp: 1.1, // metres the sheet snakes either side of the line
    whipLength: 6.5, // metres per whip wave
    whipSpeed: 8, // radians/second the whip runs down the sheet
    crestRoll: 0.2, // metres the crest rolls sideways on noise
    crestScale: 1.4, // crest rolls per metre
    crestTear: 1, // 0..1 how toothed the flowing crest is

    /* ================================================================ */
    /* 2 · THE SHEET — water and glass                                   */
    /* ================================================================ */
    glassOpacity: 0.5, // base opacity looking straight through
    fresnelPower: 2.4,
    fresnelGlow: 1.6, // bright edge where it turns away
    envAmount: 0.9, // how much of the sky it reflects
    causticScale: 1.3, // caustic cells per metre
    causticGlow: 2.4,
    streakScale: 1, // flow streak density
    flowSpeed: 7, // metres/second the water streams toward the head
    crestGlow: 4.5, // the white crest line (bloom > 1)
    crestWidth: 0.09, // metres
    baseFoam: 1.2, // foam where the sheet meets the floor
    softFade: 0.3, // soft intersection with the floor, metres
    colorDeep: '#14619c',
    colorShallow: '#8ad6ff',
    colorCrest: '#ffffff',
    colorCaustic: '#d4f4ff',

    /* ================================================================ */
    /* 3 · HARDEN & SHATTER                                              */
    /* ================================================================ */
    hardenTime: 0.16, // seconds the sheet locks still and turns to glass
    crackTime: 0.2, // seconds the cracks take to race head → tail
    shatterTime: 0.42, // seconds the glass takes to fall out cell by cell
    crackScale: 1.5, // glass cells per metre
    crackGlow: 6, // the seams as they crack
    glintFlare: 3.5, // the star glint at the head as it hardens
    glintSize: 1.8, // metres
    shardCount: 80, // shards thrown (max 120)
    shardSize: 0.36, // metres
    shardThickness: 0.08, // metres
    shardSpeed: 4.5, // m/s thrown off the sheet
    shardLift: 2.6, // m/s upward
    shardSpin: 9, // radians/second tumble
    shardGravity: 14, // m/s²
    shardBounce: 0.3, // 0..1 how much they bounce off the floor
    shardLife: 1.2, // seconds before they melt
    shardOpacity: 0.95,
    shardGlow: 2.2, // the bright glass rims

    /* ================================================================ */
    /* 4 · REFRACTION                                                    */
    /* ================================================================ */
    refractStrength: 0.9, // how hard the world bends through the sheet
    refractScale: 1.4, // ripple features per metre

    /* ================================================================ */
    /* 5 · THE WET TRAIL                                                 */
    /* ================================================================ */
    trailWidth: 1.5, // half-width of the soaked floor, metres
    trailDarken: 0.55,
    trailGlint: 1.4,
    trailFoam: 0.7, // the foam line where the foot of the sheet dragged
    colorWet: '#0b2433',
    colorFoam: '#e6f7ff',

    /* ================================================================ */
    /* 6 · SPRAY, MIST & GLINTS                                          */
    /* ================================================================ */
    sprayRate: 180, // droplets/second off the crest
    spraySize: 0.065,
    spraySpeed: 3.4,
    sprayGravity: 9,
    sprayLife: 0.75,
    mistRate: 38, // puffs/second off the foot
    mistSize: 0.55,
    mistLife: 1.1,
    mistOpacity: 0.32,
    glintRate: 70, // sparkles/second along the crest
    glintSize: 0.06,
    glintGlow: 4,
    colorSprayA: '#ffffff',
    colorSprayB: '#c8eeff',
    colorSprayC: '#6cc2f2',
    colorSprayD: '#2a7cb8',
    colorMistA: '#e4f6ff',
    colorMistB: '#bfe4f7',
    colorMistC: '#93c6e0',
    colorMistD: '#6d9fbd',
    colorGlintA: '#ffffff',
    colorGlintB: '#e8faff',
    colorGlintC: '#9edcff',
    colorGlintD: '#3c94d0',

    /* ================================================================ */
    /* 7 · THE SHATTER BEAT                                              */
    /* ================================================================ */
    shockRadius: 5, // the ring on the floor, metres
    rippleRadius: 3.6,
    foamRadius: 2.2,
    burstSize: 1.3, // a small WATER shell at the head, metres
    impactFlash: 0.3,
    impactShake: 0.45,
    shakeDuration: 0.35,
    impactLight: 2.2, // light punch at the shatter, × lightIntensity
    travelRumble: 0.05,
    colorShockA: '#9edcff',
    colorShockB: '#ffffff',
    colorBurstA: '#ffffff',
    colorBurstB: '#9edcff',
    colorBurstC: '#2a7cb8',
    colorFlash: '#d8f4ff',

    /* ================================================================ */
    /* 8 · THE CUT                                                       */
    /* ================================================================ */
    hitWidth: 1.0, // metres either side of the sheet that it catches
    hitImpulse: 6, // m/s thrown sideways, the way the sheet is whipping
    hitLift: 2.4,
    hitSpin: 1.2,
    hitForward: 0.6, // share of the throw along the line
    slice: 1 // 1 cuts bodies in two (glass-hard), 0 just knocks them down
  }
};
