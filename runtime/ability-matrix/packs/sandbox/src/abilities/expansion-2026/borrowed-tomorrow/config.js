/**
 * Borrowed Tomorrow — time, zone cast. Data only, no imports.
 *
 * A time cast whose impact is deliberately deferred, rather than a renamed
 * instant strike: a brass clock unfolds over the target and the strike is
 * *borrowed* — it lands `delay` seconds later, all at once. The whole
 * presentation is a countdown to that one moment: the debt arc fills round
 * the face, sand is drawn in, tomorrow's ring descends out of the air, the
 * pendulum settles — and at the instant the pendulum stops, the debt is paid.
 *
 * Every key below is a live editor control. Gameplay keys (range, radius,
 * delay, force) keep their original names and defaults; the rest are craft.
 */
export default {
  id: 'borrowedTomorrow',
  meta: {
    label: 'Borrowed Tomorrow',
    accent: '#ffd38a',
    element: 'time',
    cast: 'zone',
    hint: 'Time — a suspended clock gathers the future into one delayed, heavier strike',
    glyph:
      '<circle cx="50" cy="50" r="34"/><path d="M50 19V50L70 61M37 7L29 18M63 93L71 82"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 20,
    minRange: 1,
    speed: 30, // the clock flies to the target at (m/s)
    cooldown: 3.5,
    castAnim: 'cast3',
    zoneRadius: 3.6, // strike radius (m)
    lifetime: 2.6, // nominal cast length, for the HUD

    /* --- the debt (gameplay) --- */
    delay: 1.25, // the strike lands this long after the clock arrives (s)
    hitImpulse: 18, // knockback (m/s, × explosion intensity)
    hitLift: 8,
    hitSpin: 3,

    /* --- the clockwork motion --- */
    pulseSpeed: 3.4, // the face's ripples run at (× age)
    rotationSpeed: 0.8, // bezels and hands turn at (rad/s)
    pendulumArc: 0.55, // pendulum swing at arrival (rad) — settles to 0 at the strike
    pendulumRate: 3, // pendulum swing rate (rad/s)

    /* --- light --- */
    lightColor: '#ffd38a',
    lightIntensity: 5.5,
    lightRadius: 9,
    releaseLight: 5, // light punch when the debt is paid (× explosion intensity)

    /* --- palette --- */
    ringColor: '#d5a052', // brass
    coreColor: '#fff0c4', // clock light
    shadowColor: '#342351', // tomorrow's violet shadow
    glassColor: '#493a6d', // the cut-glass fragments

    /* --- 1 · the face (floor) --- */
    faceGlow: 2, // face brightness
    faceRipple: 1, // fbm time ripples
    debtGlow: 1.4, // the filling debt arc
    dissolveTime: 0.8, // fraction of the fade spent dissolving

    /* --- 2 · the clockwork (solid brass) --- */
    clockSize: 0.55, // whole clock scale (× the circle): ~3.6 m across standing
    clockTilt: 1.22, // rad the suspended clock stands up from the floor (π/2 = upright), facing the caster
    clockLift: 2.5, // m: the arbor hovers this high while the debt accrues
    unfoldTime: 0.35, // s: the thrown clock opens out to full size over the circle
    slamTime: 0.16, // s: it drops flat onto its face this long before the strike
    dialDepth: 0.33, // the enamel dial and case, × its radius (thickness)
    dialColor: '#1b1430', // enamel: the ramp's deep stop
    dialGlow: 0.6, // violet glow in the enamel, rising with the debt
    dialRoughness: 0.32,
    travelHeight: 1.4, // m: the arbor height it is thrown from / lands at
    travelArc: 1.6, // m: extra height at the top of the throw
    travelScale: 0.3, // × size while in flight
    travelSpin: 9, // rad/s it spins in flight
    trailCount: 2, // chips shed every 30 ms of the flight
    trailLife: 0.5, // s
    brassMetalness: 0.86,
    brassRoughness: 0.24,
    brassEmissive: '#472000',
    brassGlow: 0.8, // emissive intensity of the brass
    gearSpeed: 1, // gear train turns at (× rotation speed)
    gearScale: 1,
    chronoGlow: 1.6, // the lit bezel, minute hand and bob

    /* --- 3 · the pendulum --- */
    pendulumHeight: -0.05, // pivot height above the clock's arbor (m)
    pendulumLength: 1.9, // rod length (m): the bob swings below the dial
    pendulumBack: 0.35, // m behind the dial
    pendulumThick: 1.6, // rod thickness scale
    bobScale: 2.2, // the bob's size

    /* --- 4 · tomorrow's ring --- */
    futureHeight: 2.6, // starts this high (m) and descends with the debt
    futureGlow: 1.8,
    futureOpacity: 0.7,
    futureSplit: 0.6, // chromatic double image while it descends
    futureVanish: 0.2, // tomorrow's ring fades out this long after the strike (s)

    /* --- 5 · the glass --- */
    glassSize: 1, // fragment scale
    glassGlow: 1.2,
    glassOpacity: 0.8,
    shatterLift: 1.1, // fragments thrown upward at the strike (m)
    shatterSpread: 0.25, // and outward (× radius)
    shatterTime: 0.8, // fragments reach the end of their throw after (s)

    /* --- 6 · particles --- */
    moteInterval: 0.14, // seconds between orbiting chip puffs while the debt accrues
    moteCount: 3, // chips per puff
    moteSize: 0.07, // chip size in an orbiting puff (m)
    moteLife: 0.55, // and how long it lives (s)
    moteSpeed: 0.55, // drift speed (m/s)
    moteSpread: 0.4, // cone spread (0 = straight up, 1 = hemisphere)
    strikeCount: 64, // chips thrown at the strike
    strikeSize: 0.12, // chip size at the strike (m)
    strikeLife: 0.9, // (s)
    strikeSpeed: 3.5, // (m/s)
    sparkGlow: 1.3,
    colorSparkA: '#fff2cf',
    colorSparkB: '#edbd73',
    colorSparkC: '#a073bd',
    colorSparkD: '#302451',
    sandCount: 160, // GPU sand drawn into the clock (≤ 200)
    sandSize: 0.045,
    sandGlow: 1.8,
    sandSwirl: 1.4, // spiral speed
    sandThrowTime: 0.9, // sand is thrown out over (s) at the strike

    /* --- 7 · the strike --- */
    releaseTime: 0.55, // shock ring runs out over (s)
    releaseGlow: 2.4,
    pillarHeight: 5, // column of light at the strike (m)
    pillarWidth: 0.7,
    pillarLife: 0.45,
    burstReach: 1, // time shell grows to (× radius)
    burstIntensity: 0.8,
    burstLife: 0.55, // time shell lives (s)
    burstOpacity: 0.6,
    burstFresnel: 2, // rim sharpness of the shell
    burstSquash: 0.4, // vertical squash of the shell (1 = sphere)
    decalLife: 1,
    shockwaveWidth: 0.06, // SHOCKWAVE decal ring width
    shockwaveIntensity: 1,
    rippleIntensity: 0.7, // RIPPLE decal brightness
    colorBurstA: '#ffffff',
    colorBurstB: '#ffd38a',
    colorBurstC: '#5b3d8f',
    impactShake: 0.18, // (× explosion intensity, × camera shake)
    shakeDecay: 6,
    shakeFrequency: 18,
    impactFlash: 0.12, // (× explosion intensity)

    /* --- 8 · the lens --- */
    lensStrength: 0.6, // time-warp swirl while the debt accrues (× global distortion)
    lensShock: 1, // pressure ring at the strike
  },
};
