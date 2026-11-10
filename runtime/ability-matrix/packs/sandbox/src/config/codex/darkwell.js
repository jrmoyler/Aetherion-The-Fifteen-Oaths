/**
 * Dark Matter Well — Cosmic — the floor sags into a gravity well, and dark
 * matter floods it from the rim in.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 *
 * Every dimension below is resolved per frame by `DarkMatterWellAbility`, so
 * dragging the depth, the radius or the front's timing re-shapes a well that
 * is already swallowing.
 */
export default {
  id: 'darkwell',
  meta: {
    label: 'Dark Matter Well',
    accent: '#1c1030',
    key: '',
    element: 'gravity',
    hint: 'Cosmic — the floor sags into a gravity well and a wall of dark matter closes from the rim, swallowing everything inside',
    cast: 'zone',
    glyph: `<circle cx="50" cy="50" r="34"/><ellipse cx="50" cy="50" rx="34" ry="10"/><path d="M16 50C30 52 40 58 46 84M84 50C70 52 60 58 54 84"/><circle cx="50" cy="50" r="5"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // how fast the seed flies, metres/second
    lifetime: 2.0, // seconds the dent relaxes and the ink stain erodes once the well has shut
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.8, // metres — the well's rim

    /* --- light --- */
    lightColor: '#8a60ff',
    lightIntensity: 9,
    lightRadius: 10,
    lightFlicker: 0.3, // 0..1 how much the glow breathes

    /* ================================================================ */
    /* 1 · THE SEED                                                      */
    /* ================================================================ */
    handForward: 0.5, // metres in front of the caster it leaves from
    handHeight: 1.4,
    arcHeight: 1.6, // metres the throw arcs
    seedSize: 0.42, // radius of the bead billboard, metres
    seedGlow: 2.6, // its lensed ring

    /* ================================================================ */
    /* 2 · THE WELL                                                      */
    /* ================================================================ */
    wellDepth: 3.4, // metres the sheet plunges at the eye
    throat: 0.22, // width of the throat, × the radius (smaller = sharper)
    bowl: 0.55, // share of the depth that is a broad bowl (the rest is the throat) — the whole circle sags
    bowlPower: 1.4, // how round the bowl is
    depthFalloff: 0.75, // 1/m — the light dies going down the well
    wallLight: 1.3, // the far wall, turned to the camera, catches the light
    residualSag: 0.38, // share of the depth the dent keeps after it springs shut (the linger)
    relaxWobble: 0.18, // the dent breathes as it relaxes
    relaxRate: 1.6, // breaths per second
    lingerLens: 0.7, // the lens kept on the dent while it relaxes
    openTime: 0.55, // seconds the floor takes to sag into the well
    gridRings: 10, // concentric grid lines
    gridSpokes: 28, // radial grid lines
    gridLine: 0.012, // line width
    gridGlow: 1.6,
    flowSpeed: 0.9, // rings per second flowing inward
    twistSpeed: 0.55, // how fast the spokes wind into a spiral
    rippleAmp: 0.12, // metres of ripple running in on the sheet
    rippleFreq: 20,
    rippleSpeed: 9,
    rimGlow: 1.3, // the lip where floor turns to sheet
    closeTime: 0.5, // seconds the well takes to spring shut at the end
    colorSheet: '#1a0c2c', // deep: the sheet at the lip
    colorBody: '#5e1e94', // saturated body: the lit far wall and the spiral arms in the ink
    colorAbyss: '#000000',
    colorGrid: '#7448f0', // pale-ish tint: grid lines only

    /* ================================================================ */
    /* 3 · THE DARK MATTER                                               */
    /* ================================================================ */
    swallowDelay: 0.35, // seconds after landing the front starts in
    swallowTime: 1.35, // seconds it takes to reach the eye
    frontNoise: 1.0, // how ragged the front is
    frontWidth: 0.035, // width of its bright edge, × the radius
    frontGlow: 3.4,
    veinGlow: 0.7, // violet veins in the ink
    inkStars: 1.0, // cold stars in the ink
    horizonMin: 0.05, // the pit at the eye, × radius, as the ink starts in
    horizonMax: 0.21, // and once the ink has closed on it
    horizonLinger: 0.6, // × the pit kept after it springs shut
    photonGlow: 3.2, // the thin hot ring of bent light round the pit (bloom > 1)
    photonWidth: 0.014, // × radius
    spiralArms: 3, // arms wound in the ink
    spiralTight: 1.3, // how tightly they wind into the eye
    spiralGlow: 0.7,
    inkBody: 0.32, // the ink's violet on the upper wall, going black down the throat
    lingerMotes: 160, // motes/second spiralling into the pit while it lingers
    lingerSmoke: 22, // ink puffs/second breathed out of the pit
    colorInk: '#05020b',
    colorVein: '#3a1c86',
    colorFront: '#a27cff',
    colorPhoton: '#e2d4ff',

    /* ================================================================ */
    /* 4 · THE CURTAIN                                                   */
    /* ================================================================ */
    curtainHeight: 1.7, // metres the wall stands at the rim
    curtainMin: 0.3, // × radius — drawn, the wall closes to a ring round the pit, not a spout
    curtainGrow: 0.6, // extra height, × itself, as it closes on the eye
    curtainLean: 0.35, // share of the radius the crest leans inward
    curtainSway: 0.22, // metres it sways
    curtainFlow: 1.6, // how fast its tongues flow upward
    riseTime: 0.4, // seconds it takes to stand up
    tendrils: 10, // tongues round the wall
    crestLow: 0.35, // the lowest a tongue's crest dips, 0..1
    crestGlow: 2.2, // the bright crests
    curtainRim: 1.0, // fresnel rim
    footGlow: 1.1, // the glowing foot where it meets the sheet
    streakGlow: 0.45, // streaks running up it
    curtainOpacity: 0.95,
    softFade: 0.3, // soft intersection with the floor, metres
    collapseTime: 0.42, // seconds it takes to be pulled down the throat
    colorEdge: '#5422b8',
    colorCrest: '#a684ff',

    /* ================================================================ */
    /* 5 · THE LENS                                                      */
    /* ================================================================ */
    lensStrength: 1.7, // how hard the light is pulled in
    lensHeight: 0.35, // metres off the floor the lens sits

    /* ================================================================ */
    /* 6 · INK & MOTES                                                   */
    /* ================================================================ */
    inkRate: 70, // per second, torn off the crest of the wall
    inkSize: 0.7,
    inkLife: 1.2,
    inkOpacity: 0.55,
    moteRate: 260, // per second, streaming in off the front
    moteSize: 0.06,
    moteSpeed: 2.6, // m/s toward the eye
    moteLife: 0.8,
    moteGlow: 3.2,
    colorInkSmokeA: '#1a1030',
    colorInkSmokeB: '#0e0820',
    colorInkSmokeC: '#080512',
    colorInkSmokeD: '#030208',
    colorMoteA: '#ffffff',
    colorMoteB: '#a07cff',
    colorMoteC: '#7a50ff',
    colorMoteD: '#1a0a40',

    /* ================================================================ */
    /* 7 · LANDING & CLOSING                                             */
    /* ================================================================ */
    landShake: 0.25,
    landFlash: 0.05,
    closeSparks: 160, // sparks spat up the throat as it shuts
    sparkSpeed: 11,
    sparkSize: 0.045,
    sparkLife: 0.7,
    sparkGravity: 9,
    sparkStretch: 0.25,
    sparkGlow: 3.5,
    closeShake: 0.6,
    shakeDuration: 0.45,
    closeFlash: 0.1,
    closeLight: 3.0, // × lightIntensity
    shockRadius: 1.6, // × zoneRadius
    burstSize: 0.55, // × zoneRadius
    burstIntensity: 1.2,
    colorFlash: '#a88cff',
    colorBurstA: '#ffffff',
    colorBurstB: '#9a7aff',
    colorBurstC: '#2a1060',
    colorShockA: '#7a52ff',
    colorShockB: '#b496ff',
    colorSparkA: '#ffffff',
    colorSparkB: '#b496ff',
    colorSparkC: '#8a60ff',
    colorSparkD: '#2a1060',

    /* ================================================================ */
    /* 8 · THE SWALLOW                                                   */
    /* ================================================================ */
    gripImpulse: 2.0, // m/s a standing body is knocked inward as the front takes it
    gripLift: 1.2,
    gripSpin: 0.8,
    pullSpeed: 2.2, // m/s inward
    sinkSpeed: 1.6, // m/s downward
    swirl: 1.4, // rad/s the bodies turn about the eye
    gripGrab: 6, // 1/s how hard the flow holds them
    consumeDepth: 1.4 // metres under the floor at which a body is fully gone
  }
};
