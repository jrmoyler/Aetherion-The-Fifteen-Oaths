/**
 * Pendulum Cleaver — Time — a crescent blade on a pendulum, swinging across the
 * line as its pivot rides down it, each swing slower than the last, until it
 * stalls high at the end of the line and is let go in one cleaving stroke.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `PendulumCleaverAbility`: the
 * blade is built in parameter space and shaped in the vertex stage, so
 * dragging its width, depth or curve reshapes a blade already in mid-swing.
 */
export default {
  id: 'pendulum',
  meta: {
    label: 'Pendulum Cleaver',
    accent: '#ffe7b8',
    key: '',
    element: 'time',
    hint: 'Time — a crescent pendulum swings down the line, slower every pass, stalls, then cleaves',
    cast: 'line',
    glyph: `<path d="M50 8V58"/><circle cx="50" cy="8" r="5"/><path d="M22 60C30 78 70 78 78 60C66 68 34 68 22 60Z"/><path d="M18 40C24 52 30 58 40 62" stroke-dasharray="4 5"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 8.5, // metres/second the pivot rides down the line
    lifetime: 0.9, // seconds the pendulum takes to dissolve after the cleave
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#ffd890',
    lightIntensity: 7, // the steady glow riding the blade
    lightRadius: 9,
    lightFlicker: 0.12, // 0..1 how much the honed edge gutters

    /* ================================================================ */
    /* 1 · THE RIG — pivot, rod and how it travels                       */
    /* ================================================================ */
    pivotStart: 1.6, // metres down the line the pivot appears
    pivotHeight: 6.3, // metres the pivot hangs above the floor
    rodLength: 4.65, // metres from the pivot to where the blade is collared
    rodRadius: 0.055, // the rod's thickness, metres
    collarRadius: 0.17, // the brass collar where rod meets blade
    pivotRadius: 0.5, // the pivot ring, metres
    pivotTube: 0.075, // the pivot ring's thickness
    pivotGlow: 3.2, // the rune core glowing in the pivot ring
    formTime: 0.38, // seconds the rig takes to draw itself out of the air
    revealEdge: 0.09, // the materialise edge, in noise units

    /* ================================================================ */
    /* 2 · THE BLADE — shape                                             */
    /* ================================================================ */
    bladeWidth: 3.3, // tip to tip, metres
    bladeDepth: 1.25, // collar to the bottom of the edge, metres
    bladeInner: 0.42, // where the concave spine sits, × depth (0 a half-moon)
    bladeTipUp: 0.42, // how far the tips sweep up past the collar, metres
    bladeThickness: 0.17, // thickness at the spine, metres (it tapers to the edge)

    /* ================================================================ */
    /* 3 · THE BLADE — metal                                             */
    /* ================================================================ */
    metalEnv: 0.75, // how much of the sky the steel reflects
    metalSpecular: 2.4, // the sun's highlight on it
    metalGloss: 70, // highlight tightness
    engrave: 0.75, // depth of the etched filigree
    engraveScale: 3.2, // filigree features per metre
    edgeGlow: 7.5, // the honed edge, glowing gold (bloom > 1)
    edgeWidth: 0.3, // share of the blade's depth that is honed edge
    rimGlow: 1.2, // a gold fresnel round the silhouette — it is half of another time
    colorSteel: '#8f96a6',
    colorSteelDark: '#24262e',
    colorBrass: '#d9a54c',
    colorEdge: '#fff2cc',
    colorEdgeHot: '#ffb244',
    colorRim: '#ffd27a',
    colorReveal: '#ffe6a6',

    /* ================================================================ */
    /* 4 · THE SWING — slower every pass                                 */
    /* ================================================================ */
    swingAngle: 36, // degrees either side of straight down while it travels
    swingFreq: 0.78, // full swings per second as it sets off
    slowEnd: 0.5, // × that rate by the time the pivot reaches the end
    stallTime: 0.6, // seconds the last swing takes to climb and stop
    cleaveAngle: 74, // degrees it climbs to before it is let go
    holdTime: 0.42, // seconds it hangs there, stopped
    tremble: 0.9, // degrees it trembles while it hangs
    cleaveTime: 0.36, // seconds from the top of the arc to the bottom on the cleave
    followTime: 0.5, // seconds it carries on up the other side as it dissolves

    /* ================================================================ */
    /* 5 · THE SMEAR — the swing's wake in the air                      */
    /* ================================================================ */
    smearTime: 0.3, // seconds of swing the smear trails behind the blade
    smearGlow: 4,
    smearOpacity: 0.8,
    smearStreaks: 22, // streaks across the smear
    smearRod: 0.18, // share of the smear on the rod (it is mostly the blade)
    colorSmearA: '#fff6dc',
    colorSmearB: '#ffb54e',

    /* ================================================================ */
    /* 6 · THE SCARS — gouges the edge leaves on the floor               */
    /* ================================================================ */
    scarHalf: 1.7, // half-length of a gouge across the line, metres
    scarWidth: 0.1, // its width, metres
    scarSkew: 0.22, // the slant the travelling pivot gives it
    scarGlow: 5.5, // fresh gouge brightness
    scarCool: 1.3, // seconds a gouge takes to cool
    grooveOpacity: 0.75, // the dark cut left once it is cold
    lineGlow: 0.55, // the faint gold timeline running under the pivot
    lineWidth: 0.05, // metres
    colorScarHot: '#fff1c4',
    colorScarWarm: '#ff9a2a',
    colorGroove: '#18120d',
    colorLine: '#ffcf7a',

    /* ================================================================ */
    /* 7 · THE STALL — time held at the top of the arc                   */
    /* ================================================================ */
    holdWarp: 0.9, // how hard the air bends round the stopped blade
    holdWarpSize: 2.8, // metres
    holdHalo: 2.2, // the gold halo round the stopped blade
    colorHalo: '#ffd98e',

    /* ================================================================ */
    /* 8 · SPARKS, MOTES, DUST                                           */
    /* ================================================================ */
    grazeHeight: 0.55, // the edge below this height strikes sparks off the floor
    grazeSparks: 170, // sparks/second while it grazes
    sparkSpeed: 9,
    sparkSize: 0.035,
    sparkLife: 0.45,
    sparkGravity: 14,
    sparkStretch: 0.45,
    sparkGlow: 3,
    colorSparkA: '#ffffff',
    colorSparkB: '#ffe6a8',
    colorSparkC: '#ffa23c',
    colorSparkD: '#5a2a10',
    moteRate: 55, // gold motes/second shed off the blade — slowed time, barely drifting
    moteSize: 0.07,
    moteLife: 1.6,
    moteSpeed: 0.35,
    moteGlow: 2.4,
    colorMoteA: '#fff8e2',
    colorMoteB: '#ffe0a0',
    colorMoteC: '#ffb860',
    colorMoteD: '#6a4020',
    dustCount: 26, // dust thrown up by the cleave
    dustSize: 0.75,
    dustLife: 1.4,
    dustOpacity: 0.5,
    colorDustA: '#d8c8a8',
    colorDustB: '#a89478',
    colorDustC: '#6c5e4c',
    colorDustD: '#3a3228',

    /* ================================================================ */
    /* 9 · THE CLEAVE                                                    */
    /* ================================================================ */
    cleaveSparks: 240,
    shockRadius: 6.5,
    crackRadius: 3.4,
    burstSize: 3.2,
    burstIntensity: 1.1,
    ringWarp: 1.2, // the shock ring's bend in the air
    cleaveFlash: 0.4,
    cleaveShake: 0.75,
    shakeDuration: 0.4,
    cleaveLight: 3.5, // light punch, × intensity
    travelRumble: 0.06,
    grazeShake: 0.12,
    colorBurstA: '#fff6dc',
    colorBurstB: '#ffcf7a',
    colorBurstC: '#a8641c',
    colorShock: '#ffd890',
    colorFlash: '#fff0c8',
    colorCrackA: '#ffbf5a',
    colorCrackB: '#fff1c4',

    /* ================================================================ */
    /* 10 · THE CUT                                                      */
    /* ================================================================ */
    hitHeight: 1.7, // the edge lower than this cuts what it passes
    hitReach: 0.55, // metres either side of the edge that count
    hitImpulse: 7, // thrown the way the blade swings (m/s)
    hitLift: 2.4,
    hitSpin: 2,
    cleaveImpulse: 14, // the last stroke throws harder
    cleaveLift: 4.5,
    slice: 1 // 1 cuts bodies in two (when slicing is enabled), 0 just fells them
  }
};
