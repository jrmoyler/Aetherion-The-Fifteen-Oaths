/**
 * Equivalence Engine — gravity, zone cast. Data only, no imports.
 *
 * A balance of two counterweights whose masses are *inversely linked*: the
 * engine holds exactly one unit of mass, so whatever one weight gains the
 * other loses (mA + mB = 1, always). A bound binary pair flies to the target
 * while a turned fulcrum rises out of the floor; the pair docks, all the mass
 * pours into one end and that end **slams** its half of the zone. Then the
 * mass streams back across the beam, the balance swings, turns and slams the
 * other half — `tips` times — until the two masses are made equal, the beam
 * levels, and the engine sinks back into its own well.
 *
 * Every key below is a live editor control. Gameplay keys are `range`,
 * `zoneRadius`, `tips`, `tipPeriod`, `swingFraction`, `tipTurn`,
 * `strikeReach`, `hitDamage` and `hit*`; the rest is craft.
 */
export default {
  id: 'equivalenceEngine',
  meta: {
    label: 'Equivalence Engine',
    accent: '#b9a6ff',
    element: 'gravity',
    cast: 'zone',
    hint: 'Gravity — two inversely linked counterweights pour mass back and forth and slam alternate halves of the circle',
    glyph:
      '<path d="M50 30V86M36 86H64M14 44L86 24"/><circle cx="18" cy="52" r="11"/><circle cx="84" cy="28" r="5"/><path d="M28 40Q50 22 76 28"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 17, // max cast distance (m)
    minRange: 2,
    speed: 24, // the bound pair flies to the target at (m/s)
    cooldown: 4,
    castAnim: 'cast2',
    zoneRadius: 3.8, // the engine's circle (m) — every placement below derives from it
    lifetime: 3.4, // nominal cast length, for the HUD

    /* --- the rule (gameplay) --- */
    tips: 3, // how many times the balance slams (1 at the impact frame, then one per period)
    tipPeriod: 0.7, // seconds between slams (× global lifetime)
    swingFraction: 0.32, // last part of each period spent swinging over (the rest pours mass)
    tipTurn: 0.62, // the beam turns this far round the fulcrum on each swing (rad)
    strikeReach: 1, // a slam strikes the heavy half-disc out to (× zoneRadius)
    hitDamage: 1, // damage per slam through the combat binding
    hitImpulse: 14, // knockback at full mass (m/s, × explosion intensity)
    hitLift: 6,
    hitSpin: 2.5,
    settleTime: 0.6, // linger after the last slam before the masses equalize (s)

    /* --- light --- */
    lightColor: '#b9a6ff',
    lightIntensity: 6,
    lightRadius: 10,
    slamLight: 6, // light punch on each slam (× explosion intensity)

    /* --- palette (four-stop ramp) --- */
    colorA: '#f6f1ff', // white-hot core
    colorB: '#c4b2ff', // pale tint
    colorC: '#6a3fd6', // saturated body
    colorD: '#150a2c', // dark deep

    /* --- 1 · the engine (solid, lit) --- */
    pivotHeight: 2.0, // fulcrum height (m); the slam tilt is derived from it
    armReach: 0.64, // beam half-length (× zoneRadius) — the weights land on this circle
    beamThickness: 0.32, // beam section at the fulcrum (m)
    beamArch: 0.16, // the beam bows upward by (m)
    fulcrumWidth: 0.75, // fulcrum base radius (m)
    riseTime: 0.5, // fraction of the flight over which the fulcrum rises from the floor
    stoneColor: '#2a2236', // dark iron-stone
    stoneMetalness: 0.55,
    stoneRoughness: 0.42,
    stoneEmissive: '#1c0d3a',
    stoneGlow: 0.6, // emissive of the fulcrum and beam

    /* --- 2 · the counterweights (bespoke lit shader) --- */
    weightSize: 0.8, // weight radius at half the mass (m)
    massSwell: 0.85, // how much the heavy weight swells (and the light one shrinks)
    seamGlow: 1.7, // brightness of the hot seams (× mass)
    seamScale: 2.6, // seam noise frequency
    rimGlow: 1.3, // fresnel rim
    weightGloss: 0.55, // specular of the dark shell
    lightLift: 0.5, // the light weight rises off its socket by (m)
    trembleAmount: 0.05, // the balance shudders as the masses near equality (rad)

    /* --- 3 · the mass stream (beam flow) --- */
    streamGlow: 1.8,
    streamSpeed: 3.2, // pulses run toward the heavy end at (× age)
    streamWidth: 1.5, // flow sheath around the beam (× beamThickness)

    /* --- 4 · the motes (GPU mass grains) --- */
    moteCount: 180, // grains (≤ 256); each belongs to whichever weight holds its share of the mass
    moteSize: 0.06,
    moteGlow: 1.3,
    moteOrbit: 1.6, // grain orbit round its weight (× weight radius)
    moteArc: 1.3, // grains in transit arc over the beam this high (m)
    moteSpin: 1.8, // orbit speed

    /* --- 5 · the floor (two-body potential) --- */
    fieldGlow: 0.95,
    contourCount: 7, // equipotential lines of the two masses
    contourWidth: 0.07,
    wellDepth: 0.95, // how dark the well under the heavy weight goes
    fieldNoise: 1, // noise wobble of the contours
    dissolveTime: 0.7, // fraction of the exit spent dissolving the floor

    /* --- 6 · the slam --- */
    chipCount: 42, // rock chips thrown per slam
    chipSize: 0.12,
    chipLife: 0.95,
    chipSpeed: 4.6,
    dustCount: 14, // dust puffs per slam
    dustSize: 0.9,
    dustLife: 1.5,
    dustSpeed: 1.1,
    burstReach: 0.55, // dust ball grows to (× zoneRadius)
    burstIntensity: 0.9,
    burstLife: 0.55,
    burstOpacity: 0.7,
    crackRadius: 0.55, // the crater torn under each slam (× zoneRadius)
    crackLife: 2.4,
    shockwaveWidth: 0.07,
    shockwaveLife: 0.7,
    slamShake: 0.24, // (× explosion intensity, × camera shake)
    shakeDecay: 7,
    shakeFrequency: 15,
    slamFlash: 0.1, // (× explosion intensity)

    /* --- 7 · the flight --- */
    pairOrbit: 0.42, // the bound pair circles each other at (m)
    pairSpin: 10, // (rad/s)
    pairSize: 0.42, // pair orbs (× weightSize)
    flightHeight: 1.3, // they fly at (m)
    trailRate: 70, // trail grains per second
    trailSize: 0.08,
    trailLife: 0.45,

    /* --- 8 · the exit --- */
    equalizeFraction: 0.45, // fraction of the exit spent pouring the masses equal
    sinkDepth: 2.2, // the engine sinks this far into its well (m)

    /* --- 9 · the lens --- */
    lensStrength: 0.8, // gravitational pinch round the heavy weight (× global distortion)
    lensShock: 1, // pressure ring on each slam
  },
};
