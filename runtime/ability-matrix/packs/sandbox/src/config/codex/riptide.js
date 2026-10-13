/**
 * Riptide Lash — Water — a high-pressure jet that folds up into a breaking wave.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so `settings.js`
 * can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `RiptideLashAbility`, so
 * dragging any of it in the editor re-shapes a jet that is already firing or
 * a wave that is already curling.
 */
export default {
  id: 'riptide',
  meta: {
    label: "Riptide Lash",
    accent: '#4fd6ff',
    key: '',
    element: 'water',
    hint: "Water — a high-pressure jet lashes down the line, then folds into a curling wave that crashes over the far end",
    cast: 'line',
    glyph: `<path d="M10 62C26 58 40 56 54 50"/><path d="M10 70C28 66 44 64 58 58"/><path d="M54 74C50 52 62 30 80 28C92 28 94 42 84 46C76 48 72 40 78 36"/><path d="M50 84C62 82 78 82 92 84"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 20, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 24, // how fast the jet's head runs down the line, metres/second
    lifetime: 2, // seconds the soak, puddles and foam linger after the wave has gone
    cooldown: 0.5, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#4fd6ff',
    lightIntensity: 6, // the jet's steady glow
    lightRadius: 8,
    lightShimmer: 0.25, // 0..1 how much the light ripples like light through water

    /* ================================================================ */
    /* 1 · THE JET                                                       */
    /* ================================================================ */

    /* --- path (metres unless noted) --- */
    nozzle: 0.55, // metres in front of the caster the jet leaves the hand
    handHeight: 1.3, // height it leaves the hand at
    jetHeight: 0.75, // height it settles to down the line
    dropLength: 2.2, // metres over which it falls from the hand to that height
    snake: 0.22, // metres the lash whips side to side
    snakeFreq: 0.55, // whips per metre (radians)
    snakeSpeed: 9, // how fast the whip travels down the jet (radians/second)
    snakeRamp: 3, // metres before the whip reaches full swing

    /* --- body --- */
    nozzleRadius: 0.1, // radius at the hand
    jetRadius: 0.32, // radius once it has spread
    spreadLength: 4, // metres it spreads over
    headBulge: 0.6, // the churning head is this much fatter, × the radius
    headLength: 0.9, // metres the bulge reaches back from the head
    tailTaper: 0.6, // metres the tail rounds off over
    headTaper: 0.45, // metres the head rounds off over
    formTime: 0.12, // seconds the jet takes to swell open off the hand
    twist: 1.6, // radians of helical twist per metre
    twistSpeed: 14, // how fast the twist screws down the jet (radians/second)
    wobble: 0.22, // turbulent displacement of the surface, × the radius
    wobbleScale: 1.7, // turbulent features per metre
    flowSpeed: 16, // how fast the surface pattern streams down the jet

    /* --- shading --- */
    opacity: 0.55, // the jet's body seen face-on (it is more opaque at the rim)
    fresnelPower: 2.2,
    fresnelGlow: 0.8, // emissive rim
    gloss: 60, // sun highlight sharpness
    specular: 1.6, // sun highlight strength
    envReflect: 0.6, // how much of the sky the water mirrors
    streakScale: 2.4, // flow streaks per metre
    streakGlow: 1.0, // brightness of the streaks
    foamScale: 2.2, // foam features per metre
    foamThreshold: 0.8, // higher = less foam
    foamAmount: 0.75, // foam strength
    headFoam: 0.45, // extra foam at the churning head
    softFade: 0.35, // soft intersection with geometry, metres
    colorDeep: '#0a4f8c',
    colorShallow: '#1fb8ff',
    colorGlow: '#5fe6ff',
    colorSpec: '#ffffff',
    colorFoam: '#eefbff',

    /* --- pressure core (additive, inside the body) --- */
    coreScale: 0.5, // radius of the core, × the jet
    coreGlow: 1.5,
    colorCore: '#7fe4ff',

    /* ================================================================ */
    /* 2 · REFRACTION                                                    */
    /* ================================================================ */
    warpStrength: 1.2, // how hard the world bends through the jet
    warpScale: 1.45, // radius of the lens, × the jet
    warpNoise: 0.35, // noise share of the bend (the rest is the tube's lens)
    warpNoiseScale: 2.2,

    /* ================================================================ */
    /* 3 · SPRAY + DROPLETS                                              */
    /* ================================================================ */
    mistRate: 90, // mist puffs/second shed along the jet
    mistSize: 0.38,
    mistSpeed: 1.4, // m/s outward off the surface
    mistLift: 0.5, // m/s upward
    mistLifetime: 1.0,
    mistOpacity: 0.2,
    mistDrag: 2.0,
    mistTurbulence: 0.7,
    colorMistA: '#e9fbff',
    colorMistB: '#b9ecff',
    colorMistC: '#7fc6e6',
    colorMistD: '#4c8fb3',
    dropletRate: 260, // droplets/second flung off the jet
    dropletSize: 0.07,
    dropletSpeed: 3.6, // m/s off the surface
    dropletCarry: 0.45, // share of the jet's own speed they keep
    dropletGravity: 9.8,
    dropletLifetime: 0.8,
    dropletDrag: 0.5,
    colorDropletA: '#ffffff',
    colorDropletB: '#bff2ff',
    colorDropletC: '#5fcfff',
    colorDropletD: '#2a7fb8',
    nozzleStreaks: 70, // pressure streaks/second off the hand
    streakSize: 0.03,
    streakSpeed: 9,
    streakStretch: 0.3,
    streakLifetime: 0.25,
    streakGlowP: 2.0,
    gatherCount: 26, // droplets drawn into the hand before the jet fires
    gatherRadius: 0.9,

    /* ================================================================ */
    /* 4 · THE SOAK                                                      */
    /* ================================================================ */
    soakStart: 0.4, // metres in front of the caster the floor starts getting wet
    soakWidth: 1.15, // half-width of the soaked band, metres
    soakEdgeNoise: 0.35, // how ragged its edges are, × the width
    soakEdgeScale: 1.1,
    soakDark: 0.62, // how dark the wet floor goes
    soakSheen: 1.2, // sun glint on the wet floor
    soakEnv: 0.6, // sky in the wet floor
    rippleScale: 2.6, // ripple features per metre
    rippleSpeed: 2.4,
    rippleBump: 0.6, // how much the ripples tilt the glints
    puddleScale: 0.7, // puddle cells per metre
    puddleShare: 0.45, // 0..1 how many cells hold a puddle
    puddleSize: 0.42, // puddle radius, × the cell
    puddleOpacity: 0.75,
    drainStart: 0.15, // 0..1 through the linger when the floor begins to dry
    drainErode: 0.6, // 0..1 how raggedly it dries
    rippleSpacing: 2.2, // a RIPPLE decal on the floor every this many metres
    rippleRadius: 1.1,
    rippleLife: 1.2,
    rippleIntensity: 0.35, // strength of those decals
    colorWet: '#03111d',
    colorPuddle: '#0b3554',
    colorSheen: '#bfefff',
    colorRippleA: '#1a6f9c',
    colorRippleB: '#7fd8ff',

    /* ================================================================ */
    /* 5 · THE BREAKING WAVE                                             */
    /* ================================================================ */
    waveTime: 1.25, // seconds from the jet folding up to the wave gone
    waveWidth: 5.2, // metres across the line
    waveHeight: 4.2, // arc length of the curl's profile, metres (≈ its height)
    waveBack: 0.45, // the base sits this much of the profile behind the end
    waveSlope: 0.85, // radians the back face rises at — low enough that it reads as a slope from behind
    curlStart: 0.2, // radians the lip has curled when the wave stands up
    curlEnd: 2.9, // radians it has curled when it crashes (π = pointing back)
    curlPower: 1.7, // >1 keeps the back straight and the lip tight
    peel: 0.35, // 0..1 one side breaks before the other
    endTaper: 1.8, // how much the two ends of the wave fall away
    waveBend: 0.45, // the ends wrap forward round the far end, × the half-width
    lipNoise: 0.18, // ragged lip, × the profile
    waveNoiseScale: 1.4,
    riseEnd: 0.42, // 0..1 through the wave it has stood up fully
    crashAt: 0.7, // 0..1 through the wave the lip hits the floor
    crashSurge: 1.6, // metres it surges on as it collapses
    waveOpacity: 0.8,
    waveFresnel: 1.6,
    waveTranslucency: 1.4, // sunlight through the thin top of the wave
    waveFoamStart: 0.62, // 0..1 up the profile the crest foam begins
    waveFoam: 1.0,
    waveFoamScale: 3.2,
    waveStreaks: 0.6, // foam streaks running down the face
    colorWaveDeep: '#06467e',
    colorWaveMid: '#1aa6d8',
    colorWaveThin: '#7ff7e6',
    colorWaveFoam: '#f3fdff',

    /* ================================================================ */
    /* 6 · THE CRASH                                                     */
    /* ================================================================ */
    crashRadius: 3.4, // metres of floor the crash floods
    burstSize: 4.2, // the WATER burst, metres
    burstIntensity: 1.2,
    shockRadius: 6.5,
    foamDecals: 5, // FOAM decals strewn round the crash
    foamDecalRadius: 1.8,
    foamDecalLife: 2.6,
    splashCount: 160, // droplets thrown up by the crash
    splashSpeed: 7,
    foamCount: 70, // lingering foam bubbles left behind
    foamSize: 0.12,
    foamLifetime: 2.4,
    impactShake: 0.42,
    shakeDuration: 0.5,
    impactFlash: 0.18,
    impactLight: 1.4, // light punch on the crash, × lightIntensity
    travelRumble: 0.12, // camera rumble while the jet fires
    retractTime: 0.45, // 0..1 through the wave by which the jet's tail has caught its head
    colorBurstA: '#e8fbff',
    colorBurstB: '#4fd6ff',
    colorBurstC: '#0a4f8c',
    colorShockA: '#bdefff',
    colorShockB: '#ffffff',
    colorFoamA: '#ffffff',
    colorFoamB: '#d9f6ff',
    colorFoamC: '#a6e2f5',
    colorFoamD: '#6fb6d6',
    colorFlash: '#c9f3ff',

    /* ================================================================ */
    /* 7 · THE SHOVE + THE WASH                                          */
    /* ================================================================ */
    hitReach: 0.55, // metres past the jet's radius that still catches a body
    jetImpulse: 11, // m/s a body is blasted along the line
    jetLift: 1.6, // m/s upward
    jetSpin: 0.5,
    carrySpeed: 9, // m/s the jet keeps dragging bodies it is still on
    carryGrab: 5, // how hard it holds them to that, per second
    slamDown: 7, // m/s the wave drives a body into the floor
    washSpeed: 6, // m/s the backwash carries bodies toward the caster
    washTime: 0.9, // seconds the backwash keeps hold
    washGrab: 4, // per second
    washReach: 1.0, // metres past the wave's width that the backwash still drags
    hitSpray: 26 // droplets where a body is struck
  }
};
