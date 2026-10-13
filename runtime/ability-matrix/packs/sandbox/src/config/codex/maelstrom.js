/**
 * Maelstrom Vortex — Water — the floor in the circle turns to water and opens
 * into a whirlpool that spins what it catches round its rim, faster and
 * faster, and drags it down the eye.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `MaelstromVortexAbility`, so
 * dragging `zoneRadius`, the funnel's depth or the spin rate while a vortex is
 * standing re-shapes the water, the spray and the pull on the bodies with it.
 */
export default {
  id: 'maelstrom',
  meta: {
    label: "Maelstrom Vortex",
    accent: '#3fa9ff',
    key: '',
    element: 'water',
    hint: "Water — a whirlpool opens in the floor, spins bodies round its rim faster and faster, and drags them under",
    cast: 'zone',
    glyph: `<path d="M50 50C50 44 58 42 61 48C65 56 56 64 47 62C35 59 33 44 42 36C53 27 71 32 75 47C80 64 66 78 49 78C27 78 16 58 22 40"/><path d="M14 84C30 90 70 90 86 84"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 18, // how fast the bead of water flies to the circle, metres/second
    lifetime: 4.8, // seconds the whirlpool stands, from the splash to the closing
    closeTime: 1.8, // seconds it takes to close, throw its geyser and dry to a stain
    cooldown: 0.8, // seconds before the ability can be armed again
    castAnim: "cast3", // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.2, // metres — the circle that turns to water

    /* --- light --- */
    lightColor: "#3fa9ff",
    lightIntensity: 6, // the cold glow welling up from the eye
    lightRadius: 9,
    lightPulse: 0.25, // 0..1 how much it surges with the swell

    /* --- the bead of water in flight --- */
    handHeight: 1.4, // metres the bead leaves the hand at
    orbArc: 2.2, // metres the lob rises above the straight line
    orbSize: 0.3, // radius of the bead, metres
    orbTrailRate: 160, // droplets per second shed behind it
    orbTrailSize: 0.09,
    orbTrailLife: 0.5,

    /* --- beats (seconds after the splash) --- */
    floodTime: 0.55, // the water spreading out to the edge of the circle
    openDelay: 0.25, // before the middle starts to give way
    openTime: 1.1, // the funnel opening to its full depth

    /* ================================================================ */
    /* 1 · THE FUNNEL — the water surface                                */
    /* ================================================================ */

    /* --- shape (metres unless noted) --- */
    poolScale: 1.0, // the water's radius, × zoneRadius
    funnelDepth: 1.5, // how far the surface drops from the rim to the eye
    funnelCurve: 2.4, // how long the outer water stays shallow before it plunges
    eyeRadius: 0.2, // the eye, × the pool radius
    throatDepth: 2.4, // how much further it plunges down the eye
    rimHeight: 0.12, // the raised, turning lip near the edge
    rimAt: 0.86, // where the lip stands, × the pool radius
    rimWidth: 0.07, // its width, × the pool radius
    waveAmp: 0.07, // spiral swell on the funnel wall
    waveArms: 4, // spiral arms of swell
    waveTwist: 3.0, // how tightly the arms wind
    waveSpeed: 3.0, // how fast the swell runs in

    /* --- the flow drawn on it --- */
    swirlSpeed: 1.3, // rad/s the water turns at the rim once fully open
    swirlFalloff: 1.1, // how much faster it turns toward the eye (power)
    flowArms: 5, // spiral bands of flow lines
    flowTwist: 3.6, // how tightly the flow lines wind in
    flowScale: 1.0, // flow line density
    flowSharp: 6, // how thin the flow lines are
    flowStrength: 1.0, // how bright they are

    /* --- shading --- */
    waterOpacity: 0.97,
    reflect: 0.85, // sky mirrored on the surface
    fresnel: 1.3,
    fresnelPower: 4,
    specular: 2.4, // the sun's glints
    specularSharp: 140,
    depthDark: 1.0, // how fast the water darkens toward the eye
    foamRim: 1.0, // foam on the turning lip
    foamRimWidth: 0.08, // × the pool radius
    foamArms: 0.6, // foam riding the crests of the swell
    foamScale: 3.0, // foam breakup per metre
    edgeFoam: 0.9, // foam where the water meets the stone
    rimGlow: 0.5, // a cold glow along the lip
    colorShallow: "#3a9be0",
    colorDeep: "#06264a",
    colorAbyss: "#010711",
    colorFoam: "#eaf8ff",
    colorSky: "#6aa8e0", // reflection tint when there is no sky texture
    colorRimGlow: "#7fd8ff",

    /* ================================================================ */
    /* 2 · DISTORTION — the swirl bending the world                      */
    /* ================================================================ */
    warpStrength: 1.0,
    warpWidth: 0.3, // band round the rim, × the pool radius
    warpScale: 1.8,
    warpSpeed: 2.5,
    warpSwirl: 0.55, // how much of it is the turn rather than noise

    /* ================================================================ */
    /* 3 · SPRAY, FOAM, MIST                                             */
    /* ================================================================ */
    sprayRate: 220, // droplets per second thrown off the rim
    spraySize: 0.07,
    spraySpeed: 4.2, // m/s along the flow
    sprayLift: 3.2, // m/s up
    sprayLifetime: 0.9,
    colorSprayA: "#ffffff",
    colorSprayB: "#bfe6ff",
    colorSprayC: "#5fb1ee",
    colorSprayD: "#21609f",
    foamRate: 130, // flecks per second riding the surface in
    foamSize: 0.16,
    foamLifetime: 2.0,
    foamSwirl: 2.4, // rad/s they are carried round
    foamInward: 0.75, // how far in they spiral over their life (0..1)
    foamSink: 0.35, // m/s they sink as they go in
    foamOpacity: 0.85,
    colorFoamA: "#ffffff",
    colorFoamB: "#e6f6ff",
    colorFoamC: "#a8d6f5",
    colorFoamD: "#5d9ccc",
    mistRate: 36, // spray mist per second over the rim
    mistSize: 1.4,
    mistLifetime: 2.2,
    mistOpacity: 0.18,
    colorMistA: "#eaf6ff",
    colorMistB: "#bcdcf5",
    colorMistC: "#86b6e0",
    colorMistD: "#4f7fb0",

    /* ================================================================ */
    /* 4 · THE GRIP — what it does to bodies                             */
    /* ================================================================ */
    gripImpulse: 0, // a standing body is cut loose with no blow at all...
    gripLift: 1.0, // ... only the water getting under it
    gripSpin: 0.4,
    gripGrab: 6, // how hard the water takes hold (per second)
    gripSpring: 4.5, // how quickly a body is drawn onto its path
    rimDrag: 0.8, // seconds to drag a body onto the rim
    bodyRim: 0.8, // the circle it is spun on first, × the pool radius
    spiralTime: 2.4, // seconds the spiral takes to close to the eye
    spinStart: 1.2, // rad/s it goes round at the rim
    spinEnd: 7.5, // rad/s at the eye
    bodyTumble: 0.9, // turns per second about its own axis
    bodyFloat: 0.22, // metres it rides above the water
    bodyBuoyancy: 0.9, // share of its weight the water carries
    wade: 0.25, // metres the floor gives under a body the moment it is caught
    swallowSpeed: 2.6, // m/s it is pulled down the eye
    swallowDepth: 3.2, // metres down before it is gone

    /* ================================================================ */
    /* 5 · THE GEYSER — the eye closing                                  */
    /* ================================================================ */
    geyserHeight: 6.5, // metres the column stands
    geyserRadius: 0.55, // column radius at its foot
    geyserTime: 1.0, // seconds it stands and falls back
    geyserSpray: 260, // droplets thrown up
    geyserSpeed: 11, // m/s up
    geyserMist: 40,
    geyserThrow: 7, // m/s anything still on the surface is thrown up
    columnOpacity: 0.75,
    columnGlow: 1.1,
    columnStreaks: 7, // streaks running up it
    colorColumnA: "#eaf8ff",
    colorColumnB: "#5fb6f2",

    /* ================================================================ */
    /* 6 · IMPACT AND WHAT IS LEFT                                       */
    /* ================================================================ */
    splashSize: 3.2, // water dome at the splash, metres
    splashIntensity: 1.0,
    rippleRadius: 6.5,
    foamDecal: 1.1, // the foam stain left behind, × the pool radius
    foamDecalLife: 5.5,
    impactShake: 0.45,
    geyserShake: 0.6,
    shakeDuration: 0.6,
    impactFlash: 0.15,
    impactLight: 2.5, // × intensity
    vortexRumble: 0.1, // camera rumble while it turns
    colorSplashA: "#e6f6ff",
    colorSplashB: "#57aef0",
    colorSplashC: "#164e8c",
    colorRippleA: "#9fd4ff",
    colorRippleB: "#ffffff",
    colorWetA: "#0d2a45",
    colorWetB: "#bfe6ff",
    colorFlash: "#bfe6ff"
  }
};
