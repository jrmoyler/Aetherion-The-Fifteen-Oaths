/**
 * Umbral Guillotine — Shadow — a crescent executioner's blade of shadow,
 * hung from a knot of darkness, swings across the line as it advances and
 * ends in one chop into the floor.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 *
 * Every dimension below is resolved per frame by `UmbralGuillotineAbility`,
 * so a slider re-shapes a blade that is already swinging.
 */
export default {
  id: 'umbral',
  meta: {
    label: 'Umbral Guillotine',
    accent: '#c4b6ff',
    key: '',
    element: 'shadow',
    hint: 'Shadow — a crescent headsman\'s blade of shadow swings side to side across the line, then chops down into the target',
    cast: 'line',
    glyph: `<path d="M50 8V46"/><circle cx="50" cy="8" r="5"/><path d="M18 52C24 86 76 86 82 52C72 70 28 70 18 52Z"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 10, // how fast the pivot advances down the line, metres/second
    lifetime: 1.4, // seconds the buried blade takes to go to smoke
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#c4b6ff',
    lightIntensity: 8, // rides the blade
    lightRadius: 9,
    lightFlicker: 0.25,

    /* ================================================================ */
    /* 1 · THE BLADE                                                     */
    /* ================================================================ */
    bladeSize: 1.55, // radius of the crescent's circles, metres (≈ width / 2)
    bladeThickness: 1.0, // × the size, how thick the blade is
    edgeWidth: 0.035, // width of the glowing edge, × the size
    edgeGlow: 6.0, // brightness of the razor edge (bloom > 1)
    hamonGlow: 1.6, // the temper line a finger's width in
    bladeRim: 1.4, // fresnel rim on the black body
    bruise: 0.8, // the violet moving in the obsidian
    dissolveEdge: 0.08, // width of the burning lip as it forms and goes
    colorBlade: '#06040c',
    colorBruise: '#2a1660',
    colorEdge: '#f2ecff',
    colorRim: '#9a7aff',

    /* ================================================================ */
    /* 2 · THE SWING                                                     */
    /* ================================================================ */
    startForward: 1.4, // metres ahead of the caster the pivot starts
    pivotHeight: 6.4, // metres the pivot rides above the line
    armLength: 5.75, // metres from the pivot to the edge's lowest point
    swingAmp: 0.95, // radians either side of hanging straight
    swingRate: 6.6, // radians/second of swing phase (period = 2π / rate)
    formTime: 0.45, // seconds the blade takes to form, drawn back, before it swings
    tetherWidth: 0.05, // radius of the shadow it hangs from, metres
    tetherGlow: 2.2,
    tetherFlow: 2.4, // pulses per second down the tether
    anchorSize: 0.55, // radius of the knot at the pivot, metres

    /* ================================================================ */
    /* 3 · THE SMEAR                                                     */
    /* ================================================================ */
    smearTime: 0.16, // seconds of swing the smear remembers
    smearMax: 1.6, // radians it can span at most
    smearDepth: 0.8, // how far in from the edge it reaches, × the size
    smearGlow: 3.6,
    warpStrength: 0.9, // how hard the swing shoves the air
    colorSmearA: '#ffffff', // the edge's track
    colorSmearB: '#6a40ff', // the body of the smear

    /* ================================================================ */
    /* 4 · THE CHOP                                                      */
    /* ================================================================ */
    raiseTime: 0.3, // seconds it takes to rear up at the end of the line
    raiseAngle: 1.9, // radians it rears to
    dropTime: 0.14, // seconds the chop takes to come down
    embed: 0.4, // metres it buries itself in the floor
    embedHold: 0.6, // seconds it stands buried before it goes
    chopRadius: 2.3, // metres round the target the chop takes
    chopSparks: 170,
    chopShake: 0.75,
    shakeDuration: 0.4,
    chopFlash: 0.35,
    chopLight: 3.0, // × lightIntensity
    shockRadius: 6.5, // the shockwave on the floor, metres
    burstSize: 2.2, // the AIR shell, metres
    burstIntensity: 1.2,
    colorFlash: '#b49cff',
    colorBurstA: '#ffffff',
    colorBurstB: '#9a7aff',
    colorBurstC: '#2a1060',
    colorShockA: '#7a52ff',
    colorShockB: '#efe8ff',

    /* ================================================================ */
    /* 5 · THE CLEFT                                                     */
    /* ================================================================ */
    cleftLength: 3.8, // metres the chop splits the floor
    cleftWidth: 0.2, // half-width of the gash, metres
    cleftGlow: 3.5, // the burning lips
    cleftOpenTime: 0.16, // seconds it takes to tear open
    colorCleft: '#020105',

    /* ================================================================ */
    /* 6 · SMOKE & SPARKS                                                */
    /* ================================================================ */
    smokeRate: 55, // per second, shed off the spine
    smokeSize: 0.55,
    smokeLife: 1.1,
    smokeOpacity: 0.55,
    sparkRate: 120, // per second, off the edge
    sparkSize: 0.04,
    sparkSpeed: 8,
    sparkLife: 0.45,
    sparkGravity: 7,
    sparkStretch: 0.22,
    sparkGlow: 3.2,
    crossSparks: 45, // thrown each time the edge passes the bottom of its swing
    slashRadius: 1.4, // the scorch it leaves there, metres
    colorSmokeA: '#1c1430',
    colorSmokeB: '#110c20',
    colorSmokeC: '#0a0714',
    colorSmokeD: '#04030a',
    colorSparkA: '#ffffff',
    colorSparkB: '#e2d6ff',
    colorSparkC: '#8a60ff',
    colorSparkD: '#2a1060',

    /* ================================================================ */
    /* 7 · THE CUT                                                       */
    /* ================================================================ */
    hitReach: 1.5, // metres either side of the edge's low point it cuts
    hitDepth: 1.3, // metres along the line either side of the pivot
    hitHeight: 2.0, // the edge must be lower than this to cut, metres
    laneWidth: 1.0, // nothing on the line within this slips past the pivot
    hitImpulse: 7, // m/s thrown the way the blade swings
    hitLift: 3.5,
    hitSpin: 1.6,
    chopImpulse: 9, // the chop at the end throws harder
    chopLift: 5
  }
};
