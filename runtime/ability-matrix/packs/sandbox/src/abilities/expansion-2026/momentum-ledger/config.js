/**
 * Momentum Ledger — motion, zone cast. Data only, no imports.
 *
 * Movement is measured while the ledger is active, then converted into a
 * bounded strike. A cast-iron flywheel is thrown to the target and stands on
 * its rim over an iron ledger plate, winding up for the whole bank — it is
 * the store of momentum made visible. The ledger *banks* the distance
 * the caster actually walks for `chargeDuration` seconds (teleports and
 * velocity spikes above `maxSpeed` are rejected, not banked), capped at
 * `maxDistance`. Then it releases a shockwave whose knockback is
 * `baseImpulse + bonusImpulse × banked fraction`. The whole presentation is a
 * readout of that one number: the teeth lit on the flywheel, the tally and
 * sector on the dial and plate, the gauge glyphs, the coils' compression, the
 * wake you walked. The wheel also shows an idle wind (`idleWind`) so a cast
 * with nothing banked still reads as loading and letting go; that is
 * presentation only and never changes the force. After the release the wheel
 * hops along the banked direction and settles like a spun coin, then sinks.
 *
 * Every key below is a live editor control. Gameplay keys (range, radius,
 * timing, caps, force) keep their original names and defaults; the rest are
 * the craft layer.
 */
export default {
  id: 'momentumLedger',
  meta: {
    label: 'Momentum Ledger',
    accent: '#ffb088',
    element: 'motion',
    cast: 'zone',
    hint: 'Motion — walk to bank distance on the ledger, then release it as a shockwave',
    glyph: '<path d="M12 65L68 15L68 35L90 35L43 82L43 62Z"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 10,
    minRange: 0.5,
    speed: 16, // the flywheel is thrown to the target at (m/s) — slow enough to see
    cooldown: 5,
    castAnim: 'cast2',
    zoneRadius: 4.5, // release radius (m)
    lifetime: 3.6, // nominal cast length, for the HUD

    /* --- the ledger (gameplay) --- */
    chargeDuration: 1.6, // banks movement for (s) after landing
    maxDistance: 12, // distance cap (m)
    maxSpeed: 10, // faster than this is a teleport, not banked (m/s)
    baseImpulse: 6, // knockback with nothing banked
    bonusImpulse: 12, // extra knockback at a full bank
    lift: 5,
    spin: 2,

    lingerTime: 1.3, // seconds after the release before the exit (the wheel winds down)
    fadeTime: 0.75, // seconds of exit (× global lifetime)

    /* --- light --- */
    lightColor: '#ffb088',
    lightIntensity: 4,
    lightRadius: 9,
    releaseLight: 4, // light punch at the release (× explosion intensity, × (0.5 + bank))

    /* --- palette --- */
    accentColor: '#ff9a50', // velocity
    coreColor: '#fff1d3', // hot core of glyphs and waves
    trailColor: '#a8383d', // the walked wake
    springColor: '#d98966', // charge coils
    metalColor: '#8c4945', // ledger wheels

    /* --- 0 · the flywheel (hero) --- */
    // A 2.7 m cast-iron flywheel that is thrown to the target, stands on its
    // rim and winds up for the whole bank — faster with every metre banked,
    // and on its own idle wind even when nobody walks — then dumps its
    // momentum and settles like a spun coin (Euler's disk) before sinking.
    flywheelSize: 0.3, // wheel radius, × zoneRadius (0.3 × 4.5 = 1.35 m)
    flywheelYaw: 0.55, // radians the wheel's face is turned off the aim (3/4 view)
    flywheelSpin: 2.2, // rad/s at rest
    flywheelChargeSpin: 16, // extra rad/s at a full wind
    idleWind: 0.55, // the wind-up the wheel shows with nothing banked (visual only)
    windCurve: 1.4, // how late the idle wind builds (>1 = late)
    flywheelLunge: 1.2, // metres the wheel hops along the banked direction at the release (× (0.5 + bank))
    flywheelHop: 0.5, // metres it leaves the floor in that hop
    settleTilt: 1.42, // radians it falls through as it settles (π/2 = flat)
    settlePrecession: 7, // rad/s the wobble precesses at its fastest
    sinkDepth: 0.9, // × wheel radius it sinks into the plate on the exit
    flywheelMetalness: 0.85,
    flywheelRoughness: 0.32,
    flywheelGlow: 1.0, // inner glow as it winds
    throwHeight: 1.3, // metres the throw arcs up
    throwScale: 0.45, // size in the hand, × full
    landKnock: 0.12, // camera knock when it lands (× camera shake)
    haloGlow: 2.0, // the spin halo
    haloStreaks: 1.0, // rotational streaks pulled off the rim
    haloSpan: 1.35, // halo radius, × wheel radius
    rimSparkRate: 26, // sparks thrown off the rim per second at a full wind
    ironColor: '#3a2a28',
    colorWheelA: '#fff1d3', // core
    colorWheelB: '#ffb088', // tint
    colorWheelC: '#d6503a', // body
    colorWheelD: '#2a0f14', // deep

    /* --- the ledger plate (floor) --- */
    plateOpacity: 0.88, // how solid the iron plate is on the floor
    plateEngrave: 1.0, // engraved ledger columns and ticks
    plateGlow: 1.6,
    scorchCool: 1.4, // seconds the released wedge takes to cool

    /* --- 1 · the dial (floor) --- */
    landTime: 0.25, // the dial and wheels ease in over (s) on landing
    dialGlow: 2,
    flowLines: 1, // flow lines aligned to the banked direction
    tallyGlow: 1.4, // the bank tally round the rim
    dissolveTime: 0.8, // fraction of the fade spent dissolving

    /* --- 2 · the ledger wheels --- */
    wheelMetalness: 0.78,
    wheelRoughness: 0.24,
    wheelEmissive: '#4b1b0d',
    wheelSpin: 0.65, // turn rate (rad/s), faster with the bank
    ringGlow: 1.6, // the lit wheel and release rings

    /* --- 3 · the coils --- */
    springSize: 1, // × the tether length (1 = the coil reaches the axle)
    coilThickness: 2.4, // girth of the tether coils
    coilGlow: 0.5, // emissive at rest; rises with the bank
    coilCharge: 0.8, // extra emissive at a full bank

    /* --- 4 · glyphs --- */
    glyphGlow: 1.8, // orbiting velocity glyphs and gauge
    glyphOrbit: 0.4, // orbit speed at rest (rad/s); rises with the bank
    glyphSize: 1,

    /* --- 5 · the wake --- */
    wakeWidth: 0.35, // ribbon width (m)
    wakeGlow: 1.6,
    wakeOpacity: 0.8,
    wakeFlow: 2.5, // chevrons flow toward you at

    /* --- 6 · particles --- */
    trailInterval: 0.14, // seconds between streak puffs while you move
    trailCount: 3,
    trailSize: 0.055, // streak size while you move (m)
    trailLife: 0.45, // (s)
    trailSpeed: 1.2, // thrown along your step at (m/s)
    trailSpread: 0.3, // cone spread round your step direction
    releaseCount: 56, // streaks thrown at the release
    releaseSize: 0.08, // (m)
    releaseLife: 0.65, // (s)
    releaseSpeed: 6, // (m/s)
    sparkGlow: 1.4,
    colorSparkA: '#fff4df',
    colorSparkB: '#ffb088',
    colorSparkC: '#d65d52',
    colorSparkD: '#4e203b',
    speedLineCount: 120, // GPU speed motes orbiting the dial (≤ 160)
    speedLineSize: 0.05,
    speedLineGlow: 1.8,

    /* --- 7 · the release --- */
    releaseWaveLife: 0.6, // release rings and fan run out over (s)
    fanSpread: 0.9, // half-angle of the directional wave (rad)
    fanReach: 1.5, // the directional wave runs out to (× radius)
    fanGlow: 2.2,
    burstReach: 0.9, // AIR shell (× radius)
    burstIntensity: 0.7,
    burstLife: 0.45, // AIR shell lives (s)
    burstOpacity: 0.55,
    burstFresnel: 2, // rim sharpness of the shell
    burstSquash: 0.3, // vertical squash of the shell (1 = sphere)
    decalLife: 0.9,
    shockwaveWidth: 0.06, // SHOCKWAVE decal ring width
    shockwaveIntensity: 1,
    dustIntensity: 0.6, // DUSTRING decal brightness
    colorBurstA: '#ffffff',
    colorBurstB: '#ffb088',
    colorBurstC: '#7a2a3a',
    impactShake: 0.12, // (× explosion intensity × (0.5 + bank), × camera shake)
    shakeDecay: 7,
    shakeFrequency: 20,
    impactFlash: 0.08, // (× explosion intensity)

    /* --- 8 · the compression lens --- */
    lensStrength: 0.5, // pinch while banking (× global distortion)
    lensShock: 1, // pressure ring at the release
  },
};
