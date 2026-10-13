/**
 * Ball Lightning — Lightning — a crackling sphere of plasma rolls slowly down
 * the line, scorching a track and throwing branching arcs at the floor and at
 * every body in reach, then swells, destabilises and bursts.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so `settings.js`
 * can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `BallLightningAbility`, so
 * dragging any of it in the editor re-shapes an orb that is already rolling;
 * bolt shapes are re-rolled `boltRate` times a second and re-read the jag,
 * forks and reach every time.
 */
export default {
  id: 'balllightning',
  meta: {
    label: "Ball Lightning",
    accent: '#9fd8ff',
    key: '',
    element: 'storm',
    hint: "Lightning — a crackling plasma orb rolls down the line, scorching the floor and zapping every body in reach, then bursts",
    cast: 'line',
    glyph: `<circle cx="50" cy="44" r="18"/><path d="M44 34L54 42L46 48L56 56"/><path d="M34 58L24 72L30 74L20 90"/><path d="M66 58L74 70L68 72L80 88"/><path d="M50 62V70L46 74"/><path d="M14 92H86"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 20, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 5, // how fast the orb rolls, metres/second — slow, it drifts
    lifetime: 2, // seconds the scorched track and its embers take to cool after the burst
    cooldown: 0.5, // seconds before the ability can be armed again
    castAnim: "cast1", // which clip in `CAST_ANIMATIONS` the body throws
    colorA: "#9fd8ff", // accent: electric blue
    colorB: "#ffffff", // accent: white-hot

    /* --- light --- */
    lightColor: "#9fd8ff",
    lightIntensity: 6, // the orb's steady glare
    lightRadius: 8,
    lightFlicker: 0.55, // 0..1 how hard it gutters with the arcs

    /* ================================================================ */
    /* 1 · THE ORB                                                       */
    /* ================================================================ */
    orbRadius: 0.55, // metres
    orbHeight: 0.9, // metres its centre rolls above the floor
    orbBob: 0.08, // metres it bobs
    orbBobSpeed: 5, // radians / second
    orbSpawnTime: 0.3, // seconds it takes to swell out of the hand
    orbRoll: 1.6, // radians its surface turns per metre rolled
    orbDisplace: 0.14, // noise displacement, × radius
    orbDisplaceScale: 2.3, // features across the sphere
    orbBoil: 1.8, // how fast the surface roils
    orbFresnel: 2.4, // rim tightness
    orbRim: 2.6, // rim glow
    orbCore: 3.2, // inner white glow
    orbCoreSize: 2.2, // how far the white reaches out (lower = wider)
    filamentGlow: 3.2, // the electric filaments in the plasma
    filamentScale: 2.8,
    filamentSharp: 14, // how thin they are
    filamentSpeed: 2.4,
    orbFlicker: 0.35, // strobe on the orb
    orbFlickerRate: 22, // strobes / second
    orbOpacity: 0.9,
    orbIntensity: 1.6,
    colorOrbCore: "#ffffff",
    colorOrbInner: "#bfe6ff",
    colorOrbRim: "#6f7dff",
    colorFilament: "#d2c2ff",

    /* --- the hot core sprite --- */
    coreGlow: 2.2,
    coreSize: 1.5, // metres
    coreSpikes: 0.7, // star spikes

    /* --- orbiting arcs --- */
    orbitArcs: 4, // short jagged arcs circling the orb (max 6)
    orbitRadius: 1.3, // × orb radius
    orbitSpan: 2.4, // radians each arc runs round
    orbitJag: 0.14, // × orb radius
    orbitWidth: 0.5, // × bolt width

    /* ================================================================ */
    /* 2 · BOLTS                                                         */
    /* ================================================================ */
    boltRate: 9, // re-rolls per second
    boltLife: 0.1, // seconds one flash lasts
    boltGrowTime: 0.035, // seconds a strike takes to race out
    floorBolts: 3, // strikes to the floor per re-roll (max 4)
    boltReach: 3.2, // metres to the floor strikes
    bodyReach: 4.2, // metres within which bodies are struck
    boltSegments: 14, // points per bolt
    boltJag: 0.16, // displacement, × bolt length
    boltForks: 2, // forks per strike (max 2)
    forkLength: 0.42, // × the parent bolt
    forkSpread: 0.9, // how far forks leave the parent's line
    boltWidth: 0.16, // glow width, metres
    boltCore: 0.022, // white core width, metres
    boltFalloff: 2.2,
    boltIntensity: 5,
    boltOpacity: 1,
    boltCrawl: 0.45, // plasma crawling along the glow
    boltCrawlScale: 12,
    boltCrawlSpeed: 10,
    boltFlicker: 0.5,
    colorBoltCore: "#ffffff",
    colorBoltGlow: "#8fc8ff",
    colorBoltEdge: "#7a4dff",

    /* --- where they land --- */
    strikeRadius: 0.6, // the floor flare, metres
    strikeGlow: 3,
    strikeSparks: 7,
    strikeSparkSpeed: 6,
    strikeScorchChance: 0.3, // chance a floor strike leaves a scorch decal
    strikeScorchRadius: 0.45,

    /* ================================================================ */
    /* 3 · THE SCORCHED TRACK                                            */
    /* ================================================================ */
    trackWidth: 0.75, // half-width of the char, metres
    trackStart: 0.8, // metres in front of the caster it begins
    trackChar: 0.82, // opacity of the char
    trackEdgeNoise: 0.4, // how ragged its edges are
    trackEdgeScale: 1.6,
    trackHeat: 3, // glow right under the orb
    trackHeatLength: 1.6, // metres behind the orb the heat dies over
    trackCool: 1.1, // seconds the burn lines take to cool once passed
    trackVeins: 2.2, // the branching burn lines
    trackVeinScale: 2.2,
    trackVeinSharp: 12,
    trackEmbers: 1, // glints of embers left in the char
    colorTrackChar: "#0a0910",
    colorTrackHot: "#9fd8ff",
    colorTrackEmber: "#c9a6ff",
    scorchSpacing: 1.3, // a scorch decal every this many metres
    scorchRadius: 0.9,
    scorchLife: 3.5,

    /* ================================================================ */
    /* 4 · PARTICLES                                                     */
    /* ================================================================ */
    plasmaRate: 90, // motes / second shed off the orb
    plasmaSize: 0.08,
    plasmaLifetime: 0.6,
    plasmaSpeed: 1.3,
    plasmaGlow: 3,
    colorPlasmaA: "#ffffff",
    colorPlasmaB: "#bfe6ff",
    colorPlasmaC: "#8f7dff",
    colorPlasmaD: "#2a1c66",
    sparkSize: 0.045,
    sparkLifetime: 0.35,
    sparkStretch: 0.6,
    sparkGlow: 3,
    colorSparkA: "#ffffff",
    colorSparkB: "#d6efff",
    colorSparkC: "#8fc8ff",
    colorSparkD: "#4b3cb0",
    smokeRate: 22, // puffs / second rising off the fresh track
    smokeSize: 0.55,
    smokeLifetime: 2.2,
    smokeRise: 0.5, // metres / second
    smokeOpacity: 0.35,
    colorSmokeA: "#3a3a44",
    colorSmokeB: "#2a2a32",
    colorSmokeC: "#1d1c22",
    colorSmokeD: "#121115",

    /* ================================================================ */
    /* 5 · THE STRUCK — jolted, lifted, knocked down                     */
    /* ================================================================ */
    zapTime: 0.9, // seconds a struck body keeps jolting
    zapImpulse: 1.2, // the first strike's blow
    zapLift: 4.2,
    zapSpin: 2.4,
    zapTwitch: 2.4, // metres / second of each twitch, per re-roll
    zapFloat: 0.55, // 0..1 how much of its weight the current carries while jolting
    charAmount: 0.75, // how far the body is scorched
    charTime: 0.6, // seconds to scorch it
    colorCharBody: "#16131d",
    colorCharRim: "#8fc8ff",
    charRimGlow: 2.4,
    colorCharEdge: "#c9b6ff",
    charEdgeGlow: 4,
    charEdgeWidth: 0.1,

    /* ================================================================ */
    /* 6 · TRAVEL                                                        */
    /* ================================================================ */
    travelRumble: 0.035, // camera rumble while it rolls
    castSparks: 40, // sparks off the hand as it is thrown

    /* ================================================================ */
    /* 7 · THE BURST                                                     */
    /* ================================================================ */
    swellTime: 0.75, // seconds it swells and destabilises before bursting
    swellScale: 1.9, // × radius at the moment it bursts
    swellBoil: 2.5, // × displacement at the moment it bursts
    swellRate: 2.2, // × bolt rate while swelling
    burstLinger: 0.6, // seconds of the impact phase after the burst
    burstRadius: 4.2, // metres — every body inside is thrown
    burstShell: 5, // the STORM shell, metres
    burstLife: 0.7,
    burstRingBolts: 10, // arcs thrown out across the floor (max 12)
    burstRingReach: 4.6, // metres
    burstRingLife: 0.4,
    burstFlash: 0.55,
    burstShake: 0.55,
    burstLight: 32, // light punch
    burstSparks: 130,
    burstSparkSpeed: 14,
    burstImpulse: 9,
    burstLift: 6,
    burstSpin: 3,
    burstScorch: 3.4, // the crater scorch, metres
    burstCrater: 2.6, // the charred crater the track shader burns, metres
    shockRadius: 7.5,
    shockLife: 0.8,
    colorFlash: "#d6ecff",
    colorShockA: "#8fc8ff",
    colorShockB: "#ffffff",
    colorBurstA: "#ffffff",
    colorBurstB: "#9fd8ff",
    colorBurstC: "#5a3cff",

    /* --- distortion: ionised air --- */
    warpStrength: 0.55,
    warpSize: 4.5, // × orb radius
    warpScale: 2.2,
    warpSpeed: 3,
    warpBurst: 1.6, // strength of the burst's pressure ring
    warpRingTime: 0.45 // seconds the ring takes to cross the proxy
  }
};
