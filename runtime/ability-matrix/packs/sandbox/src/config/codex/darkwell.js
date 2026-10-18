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
    element: 'cosmic',
    hint: 'Cosmic — the floor sags into a gravity well and a wall of dark matter closes from the rim, swallowing everything inside',
    cast: 'zone',
    glyph: `<circle cx="50" cy="50" r="34"/><ellipse cx="50" cy="50" rx="34" ry="10"/><path d="M16 50C30 52 40 58 46 84M84 50C70 52 60 58 54 84"/><circle cx="50" cy="50" r="5"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // how fast the seed flies, metres/second
    lifetime: 1.6, // seconds the ink stain takes to erode once the well has shut
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.8, // metres — the well's rim

    /* --- light --- */
    lightColor: '#b9a0ff',
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
    openTime: 0.55, // seconds the floor takes to sag into the well
    gridRings: 10, // concentric grid lines
    gridSpokes: 28, // radial grid lines
    gridLine: 0.012, // line width
    gridGlow: 2.4,
    flowSpeed: 0.9, // rings per second flowing inward
    twistSpeed: 0.55, // how fast the spokes wind into a spiral
    rippleAmp: 0.12, // metres of ripple running in on the sheet
    rippleFreq: 20,
    rippleSpeed: 9,
    rimGlow: 2.2, // the lip where floor turns to sheet
    closeTime: 0.5, // seconds the well takes to spring shut at the end
    colorSheet: '#0b0718',
    colorAbyss: '#000000',
    colorGrid: '#9f7bff',

    /* ================================================================ */
    /* 3 · THE DARK MATTER                                               */
    /* ================================================================ */
    swallowDelay: 0.35, // seconds after landing the front starts in
    swallowTime: 1.35, // seconds it takes to reach the eye
    frontNoise: 1.0, // how ragged the front is
    frontWidth: 0.035, // width of its bright edge, × the radius
    frontGlow: 4.5,
    veinGlow: 0.7, // violet veins in the ink
    inkStars: 1.0, // cold stars in the ink
    colorInk: '#05020b',
    colorVein: '#4a2a9a',
    colorFront: '#d8c6ff',

    /* ================================================================ */
    /* 4 · THE CURTAIN                                                   */
    /* ================================================================ */
    curtainHeight: 1.7, // metres the wall stands at the rim
    curtainGrow: 0.6, // extra height, × itself, as it closes on the eye
    curtainLean: 0.35, // share of the radius the crest leans inward
    curtainSway: 0.22, // metres it sways
    curtainFlow: 1.6, // how fast its tongues flow upward
    riseTime: 0.4, // seconds it takes to stand up
    tendrils: 10, // tongues round the wall
    crestLow: 0.35, // the lowest a tongue's crest dips, 0..1
    crestGlow: 3.6, // the bright crests
    curtainRim: 1.0, // fresnel rim
    footGlow: 1.4, // the glowing foot where it meets the sheet
    streakGlow: 0.45, // streaks running up it
    curtainOpacity: 0.95,
    softFade: 0.3, // soft intersection with the floor, metres
    collapseTime: 0.42, // seconds it takes to be pulled down the throat
    colorEdge: '#6236f0',
    colorCrest: '#eee6ff',

    /* ================================================================ */
    /* 5 · THE LENS                                                      */
    /* ================================================================ */
    lensStrength: 1.1, // how hard the light is pulled in
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
    colorMoteB: '#cbb6ff',
    colorMoteC: '#7a50ff',
    colorMoteD: '#1a0a40',

    /* ================================================================ */
    /* 7 · LANDING & CLOSING                                             */
    /* ================================================================ */
    landShake: 0.25,
    landFlash: 0.12,
    closeSparks: 160, // sparks spat up the throat as it shuts
    sparkSpeed: 11,
    sparkSize: 0.045,
    sparkLife: 0.7,
    sparkGravity: 9,
    sparkStretch: 0.25,
    sparkGlow: 3.5,
    closeShake: 0.6,
    shakeDuration: 0.45,
    closeFlash: 0.3,
    closeLight: 3.0, // × lightIntensity
    shockRadius: 1.6, // × zoneRadius
    burstSize: 0.55, // × zoneRadius
    burstIntensity: 1.2,
    colorFlash: '#a88cff',
    colorBurstA: '#ffffff',
    colorBurstB: '#9a7aff',
    colorBurstC: '#2a1060',
    colorShockA: '#7a52ff',
    colorShockB: '#e8dcff',
    colorSparkA: '#ffffff',
    colorSparkB: '#d8c6ff',
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
