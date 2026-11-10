/**
 * Refraction Tribunal — crystal, zone cast. Data only, no imports.
 *
 * Projectile refraction, in the sandbox's terms: the caster fires one
 * *witness* bolt of light into a court of three crystal judges that erupt
 * round the target. The bolt does not stop at the court — each judge it
 * touches **refracts** it, bending the light onto the nearest enemy in the
 * court that has not yet been struck and on to the next judge, `refractions`
 * times. Then the judges bow until their points meet over the centre and the
 * verdict falls as a column of light.
 *
 * Every key below is a live editor control. Gameplay keys (range, radius,
 * refractions, timings, force) are read every frame like the craft keys.
 */
export default {
  id: 'refractionTribunal',
  meta: {
    label: 'Refraction Tribunal',
    accent: '#e7c4ff',
    element: 'crystal',
    cast: 'zone',
    hint: 'Crystal — three judges of quartz bend one bolt of light from enemy to enemy, then bow and pass their verdict',
    glyph:
      '<path d="M50 10L60 34L50 44L40 34Z"/><path d="M14 86L22 60L32 64L28 86Z"/><path d="M86 86L78 60L68 64L72 86Z"/><path d="M50 44L27 72L73 72Z"/><path d="M8 40L50 44"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 20,
    minRange: 5, // the near judge must stand in front of the caster
    speed: 26, // the witness bolt flies at (m/s)
    cooldown: 5,
    castAnim: 'cast1',
    zoneRadius: 3.8, // the court (m) — judges, seal and every hit live inside it
    lifetime: 3.4, // nominal cast length, for the HUD (s)

    /* --- light --- */
    lightColor: '#d9a6ff',
    lightIntensity: 6,
    lightRadius: 10,
    refractLight: 4, // light punch at every refraction (× explosion intensity)
    verdictLight: 9, // light punch at the verdict

    /* --- refraction (gameplay) --- */
    refractions: 3, // legs the bolt is bent through (1–6); each may strike one enemy
    legTime: 0.26, // seconds per leg, judge → enemy → next judge (× global lifetime)
    verdictDelay: 0.22, // after the last leg, the bolt climbs to the apex for (s)
    verdictRadius: 1.7, // the verdict strikes every unjudged enemy this close to the centre (m)
    verdictHold: 1.35, // the court stands, humming, after the verdict (s)
    hitImpulse: 9, // knockback along the bent beam (× explosion intensity)
    hitLift: 5,
    hitSpin: 2.5,

    /* --- the witness bolt --- */
    chargeTime: 0.28, // the bolt condenses at the hand before it flies (s)
    boltHeight: 1.35, // flight height at the hand (m)
    boltSize: 0.8, // gem scale
    boltSpin: 9, // spin about its own axis (rad/s)
    boltGlow: 2.6,
    trailLength: 3.4, // light ribbon behind the bolt in flight (m)

    /* --- the judges (hero) --- */
    judgeRing: 0.72, // judges stand on a triangle at this fraction of the zone radius
    judgeHeight: 4, // judge height (m); grows if the court is too wide for a steep bow
    judgeWidth: 1.3, // girth of the slab (× its authored 1 m)
    riseTime: 0.42, // judges erupt from the floor over (s), from the moment of casting
    leanOut: 0.16, // outward lean while they hear the case (rad)
    refractAt: 0.56, // where on a judge the beam strikes (× height)
    turnTime: 0.16, // a judge turns its face to the next leg over (s)
    turnAmount: 0.9, // how far it turns (× the leg's bearing)
    bowAmount: 0.94, // 1 = tips meet exactly over the centre at the verdict
    bowTime: 0.34, // judges bow over (s), ending on the verdict
    humSpin: 0.55, // judges turn on their axes while the court stands (rad/s)
    humSway: 0.035, // breathing sway of the bowed judges (rad)
    crystalColor: '#2a1048', // the solid quartz body (lit by the sun)
    crystalEmissive: '#7b2cff',
    crystalGlow: 0.35, // emissive at rest (× global glow)
    crystalRoughness: 0.14,
    crystalMetalness: 0.35,

    /* --- the facet light (shader on each judge) --- */
    facetGlow: 1.6,
    facetOpacity: 0.85,
    facetFresnel: 2.4, // rim power — lower spreads the spectral rim over the faces
    dispersion: 1, // how far apart the rim's red and violet split
    bandDensity: 5, // light bands climbing inside the crystal (per judge height)
    bandSpeed: 1.6, // their climb speed
    chargeGlow: 3, // white-hot flash when a judge refracts the bolt
    chargeDecay: 6, // how fast that flash dies (1/s)

    /* --- the beams --- */
    beamWidth: 0.22, // half-width of a refracted leg (m)
    beamGlow: 3,
    beamSplit: 0.55, // chromatic split across the beam
    beamFlow: 7, // speed of the light running along it
    beamLife: 0.55, // a leg lingers this long after the bolt has passed (s)

    /* --- the verdict column --- */
    columnWidth: 0.95, // radius at its foot (m)
    columnGlow: 2.8,
    columnPulse: 5, // pulse rate while the court stands (rad/s)
    columnLife: 0.6, // the column thins to a thread over the hold (fraction)

    /* --- the court seal (floor) --- */
    sealGlow: 1.6,
    sealOpacity: 0.72, // the dark crystal floor inside the court
    sealLine: 1, // brightness of the etched triangle and ring
    causticGlow: 1, // light thrown through the judges onto the floor
    causticScale: 1.4, // caustic / facet frequency
    crackGlow: 1.3, // cracks round each judge's foot
    crackReach: 0.45, // crack length (× zone radius)
    dissolveTime: 0.75, // fraction of the exit spent dissolving the seal

    /* --- the four-stop ramp (every layer is coloured from it) --- */
    colorA: '#fff7ff', // core, white-hot
    colorB: '#f0c4ff', // pale tint
    colorC: '#a74cff', // saturated amethyst body
    colorD: '#1f0838', // the deep that grounds it

    /* --- particles · glints (SOFT) --- */
    glintRate: 70, // per second from the bolt, and from judge tips while the court stands
    glintSize: 0.07,
    glintLife: 0.55,
    glintGlow: 2.2,
    colorGlintA: '#ffffff',
    colorGlintB: '#f3d2ff',
    colorGlintC: '#a35cff',
    colorGlintD: '#2b0c4a',

    /* --- particles · spectral streaks (STREAK) at every refraction --- */
    streakCount: 30,
    streakSpeed: 7.5,
    streakSize: 0.05,
    streakLife: 0.5,
    streakFan: 0.35, // fan spread of the dispersed spectrum
    streakGlow: 2.6,
    colorStreakA: '#ffffff',
    colorStreakB: '#ffe3ff',
    colorStreakC: '#c27bff',
    colorStreakD: '#3a1266',

    /* --- particles · quartz chips (CHIP) at eruption, verdict and exit --- */
    chipCount: 18, // per judge
    chipSize: 0.12,
    chipLife: 1,
    chipSpeed: 4.2,
    chipGlow: 1.2,
    colorChipA: '#ffffff',
    colorChipB: '#e2b8ff',
    colorChipC: '#7a2fd0',
    colorChipD: '#1c0733',

    /* --- the verdict impact --- */
    arrivalShake: 0.08, // when the bolt first strikes the near judge
    arrivalFlash: 0.06,
    verdictShake: 0.3,
    verdictFlash: 0.24,
    shakeDecay: 5,
    shakeFrequency: 20,
    burstReach: 1, // FROST shell grows to (× zone radius)
    burstLife: 0.65,
    burstIntensity: 1,
    burstOpacity: 0.55,
    colorBurstA: '#ffffff',
    colorBurstB: '#d29bff',
    colorBurstC: '#3a1066',
    crackRadius: 1.2, // CRACK decal under each judge (m)
    decalLife: 2.6,
    shockwaveWidth: 0.07,
    frostIntensity: 0.9, // the court floor crystallises (FROST decal)

    /* --- the lens --- */
    lensStrength: 0.55, // inward pull while the judges bow (× global distortion)
    lensShock: 1, // pressure ring at the verdict
  },
};
