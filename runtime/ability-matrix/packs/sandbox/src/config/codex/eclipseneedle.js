/**
 * Eclipse Needle — Shadow — a black needle with an eclipse at its point
 * drills down the line and leaves a wake of darkness hanging behind it.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 *
 * Every dimension below is resolved per frame by `EclipseNeedleAbility`, so a
 * slider re-shapes a needle that is already in flight.
 */
export default {
  id: 'eclipseneedle',
  meta: {
    label: 'Eclipse Needle',
    accent: '#d9d0ff',
    key: '',
    element: 'shadow',
    hint: 'Shadow — a needle tipped with an eclipse drills down the line, leaving a hanging wake of darkness; at the target it flares to totality',
    cast: 'line',
    glyph: `<circle cx="72" cy="28" r="12"/><circle cx="72" cy="28" r="19"/><path d="M64 36L14 86"/><path d="M58 30L24 64M70 42L36 76"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 30, // how fast the needle drills down the line, metres/second
    lifetime: 1.5, // seconds the wake takes to collapse after the impact
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#e6dcff',
    lightIntensity: 8, // rides the eclipse
    lightRadius: 9,
    lightFlicker: 0.2,

    /* ================================================================ */
    /* 1 · THE CHARGE                                                    */
    /* ================================================================ */
    handForward: 0.7, // metres in front of the caster it forms
    handHeight: 1.45, // metres off the floor it forms at
    chargeTime: 0.32, // seconds it takes to form before it flies
    flightHeight: 1.15, // metres off the floor it drills at

    /* ================================================================ */
    /* 2 · THE NEEDLE                                                    */
    /* ================================================================ */
    needleLength: 2.6, // metres from point to tail
    needleRadius: 0.075, // metres at its belly
    grooves: 3, // rifling grooves
    grooveTwist: 5, // turns of rifling along it
    spinRate: 3.5, // turns per second it drills
    grooveGlow: 3.5,
    needleRim: 1.6, // fresnel rim
    pointGlow: 2.5, // heat at the point
    colorNeedle: '#05030a',
    colorGroove: '#a582ff',

    /* ================================================================ */
    /* 3 · THE ECLIPSE                                                   */
    /* ================================================================ */
    moonRadius: 0.3, // metres, the black body at the point
    limbGlow: 3.5, // the hair of light round it
    coronaSize: 1.15, // metres, the corona billboard's radius in flight
    coronaGlow: 2.4,
    coronaReach: 0.38, // how far the streamers reach, share of the billboard
    streamers: 14, // streamers round the corona
    beadGlow: 1.0, // the diamond ring's brightness in flight
    beadSpin: 1.2, // turns per second the bead runs round the limb
    lensStrength: 0.9, // light bent round the moon
    colorMoon: '#000000',
    colorLimb: '#f4efff',
    colorCorona: '#9a76ff',
    colorBead: '#ffffff',

    /* ================================================================ */
    /* 4 · THE DRILL STRANDS                                             */
    /* ================================================================ */
    strandLength: 4.5, // metres behind the point they wind
    strandRadius: 0.42, // metres out from the needle at their widest
    strandTurns: 3.2, // turns along their length
    strandWidth: 0.028, // metres
    strandGlow: 3.2,
    colorStrandA: '#ffffff',
    colorStrandB: '#7a4cff',

    /* ================================================================ */
    /* 5 · THE WAKE                                                      */
    /* ================================================================ */
    wakeRadius: 0.42, // metres, the tube of darkness behind the needle
    wakeChurn: 0.35, // how much its skin churns
    wakeFlow: 2.5, // how fast the churn runs
    wakeOpacity: 0.85,
    wakeRim: 1.6, // the violet skin
    stainWidth: 0.55, // half-width of its shadow on the floor, metres
    stainGlow: 2.2, // the violet fringe
    stainOpacity: 0.85,
    colorWake: '#06030e',
    colorWakeRim: '#7e56ff',
    colorStain: '#030108',

    /* ================================================================ */
    /* 6 · SMOKE & SPARKS                                                */
    /* ================================================================ */
    smokeRate: 90, // per second, shed along the wake
    smokeSize: 0.5,
    smokeLife: 1.4,
    smokeOpacity: 0.5,
    sparkRate: 200, // per second, thrown off the point in a spiral
    sparkSize: 0.035,
    sparkSpeed: 5,
    sparkLife: 0.4,
    sparkGravity: 2,
    sparkStretch: 0.25,
    sparkGlow: 3.4,
    colorSmokeA: '#191030',
    colorSmokeB: '#100a20',
    colorSmokeC: '#090612',
    colorSmokeD: '#030208',
    colorSparkA: '#ffffff',
    colorSparkB: '#e0d2ff',
    colorSparkC: '#8a5cff',
    colorSparkD: '#2a1060',

    /* ================================================================ */
    /* 7 · TOTALITY                                                      */
    /* ================================================================ */
    totalityTime: 0.75, // seconds the impact holds before the wake collapses
    coronaFlare: 3.6, // metres the corona flares to
    flareGlow: 2.6, // × the corona's glow at the peak
    impactSparks: 160,
    impactShake: 0.6,
    shakeDuration: 0.4,
    impactFlash: 0.4,
    impactLight: 3.2, // × lightIntensity
    shockRadius: 5.5,
    burstSize: 1.8,
    burstIntensity: 1.2,
    colorFlash: '#d8ccff',
    colorBurstA: '#ffffff',
    colorBurstB: '#a080ff',
    colorBurstC: '#2a1060',
    colorShockA: '#8a60ff',
    colorShockB: '#f4efff'
  }
};
