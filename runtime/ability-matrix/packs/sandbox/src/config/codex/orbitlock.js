/**
 * Orbit Lock — Cosmic — a thrown star bursts into planets on tilted orbits
 * over the circle; the orbits lock into one ring, and the ring falls.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 *
 * Every dimension below is resolved per frame by `OrbitLockAbility`, so a
 * slider re-shapes an orrery that is already turning over the target.
 */
export default {
  id: 'orbitlock',
  meta: {
    label: 'Orbit Lock',
    accent: '#e7deff',
    key: '',
    element: 'gravity',
    hint: 'Cosmic — a star bursts into planets on tilted orbits above the circle; the orbits lock into one ring and it slams down',
    cast: 'zone',
    glyph: `<circle cx="50" cy="50" r="30"/><ellipse cx="50" cy="50" rx="34" ry="12" transform="rotate(-25 50 50)"/><circle cx="80" cy="50" r="5"/><circle cx="26" cy="64" r="4"/><circle cx="50" cy="50" r="4"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // how fast the seed star flies, metres/second
    lifetime: 1.5, // seconds the embedded planets and the dial take to burn out
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.6, // metres — the ring the planets lock to and land on

    /* --- light --- */
    lightColor: '#d8ccff',
    lightIntensity: 9, // steady glow, riding the star and then the orrery
    lightRadius: 10,
    lightFlicker: 0.3, // 0..1 how much it twinkles

    /* ================================================================ */
    /* 1 · THE SEED STAR                                                 */
    /* ================================================================ */
    handForward: 0.5, // metres in front of the caster it leaves from
    handHeight: 1.5, // metres off the floor it leaves from
    arcHeight: 2.2, // metres the throw arcs above the straight line
    hangHeight: 3.4, // metres above the circle the orrery forms at
    starSize: 0.6, // radius of the star billboard, metres
    starGlow: 4.5, // brightness (bloom > 1)
    colorStarCore: '#ffffff',
    colorStarHalo: '#b49cff',

    /* ================================================================ */
    /* 2 · THE ORBITS                                                    */
    /* ================================================================ */
    orbits: 3, // tilted orbits the planets start on (1..5)
    planets: 9, // planets in the orrery (3..16)
    orbitRadius: 1.9, // metres, before they lock
    orbitTilt: 1.0, // radians the steepest orbit is tilted
    orbitSpin: 6.5, // radians/second the free orbits turn
    lockSpin: 1.6, // radians/second the locked ring turns
    formTime: 0.35, // seconds the star takes to burst into its orbits
    lockTime: 0.7, // seconds the orbits take to flatten into one ring
    lockHold: 0.2, // seconds the locked ring hangs before it drops
    lockLean: 0.42, // radians the locked ring leans toward the caster (comes out as it falls)
    ringWidth: 0.06, // tube radius of an orbit track, metres
    ringGlow: 1.1, // the faint track
    trailLength: 0.32, // share of the gap between planets the comet trail fills
    trailGlow: 4.0, // brightness of the trails
    colorRingA: '#e2d6ff', // trail, hot
    colorRingB: '#5a34e8', // track

    /* ================================================================ */
    /* 3 · THE PLANETS                                                   */
    /* ================================================================ */
    planetSize: 0.55, // radius, metres — dense moons, not specks
    planetGlow: 0.8, // the molten seams
    planetRim: 1.4, // the violet limb
    planetRimPower: 2.2,
    bandScale: 3.0, // latitude bands per planet
    bandSpeed: 2.0, // how fast the bands turn
    planetTumble: 3.0, // radians/second each planet spins on its own axis
    colorPlanetCore: '#f2e8ff', // seams, white-hot
    colorPlanetBand: '#6a3cff', // seams, saturated
    colorPlanetRim: '#8a66ff',
    colorPlanetRock: '#3a3050', // the rock body, lit by the sun
    planetCrag: 0.9, // 0..2 how lumpy and cratered
    planetFissure: 0.55, // 0..1 how wide the molten seams run

    /* ================================================================ */
    /* 3b · THE SINGULARITY & THE WELL                                   */
    /* ================================================================ */
    coreSize: 1.0, // metres — the black core the orrery turns round
    coreRimGlow: 2.6, // its photon ring (bloom > 1)
    coreRimPower: 4.5,
    lensSize: 3.2, // the bent light round it, × the core
    lensStrength: 1.4,
    lensSwirl: 0.9, // radians the bend is twisted by the spin
    vortexReach: 0.95, // the accretion vortex at full size, × zoneRadius
    vortexHeight: 0.55, // metres its ridges stand at the lip
    vortexArms: 3,
    vortexTwist: 3.2, // how tightly the arms wind in
    vortexSpin: 2.2, // radians/second (it speeds up as it locks and swallows)
    vortexHotGlow: 1.6, // the white-hot lip at the horizon
    vortexStreaks: 0.6, // pale streaks of shredded matter
    vortexOpacity: 0.95,
    wellSag: 1.1, // metres the hanging vortex sags into a well
    swallowDelay: 0.25, // seconds after the slam before the moons are dragged in
    swallowTime: 1.6, // seconds the drag-in takes
    swallowTo: 0.12, // × zoneRadius, how far in they are dragged before they go under
    swallowSpin: 2.4, // radians/second round the well at the rim (faster as they close)
    swallowRumble: 0.06, // the floor rumbling as they go
    colorWellHot: '#f6eeff',
    colorWellPale: '#b49cff',
    colorWellBody: '#3a1aa8',
    colorWellDeep: '#07031a',

    /* ================================================================ */
    /* 4 · THE DROP                                                      */
    /* ================================================================ */
    dropTime: 0.24, // seconds the locked ring takes to fall
    slamHold: 0.6, // seconds after the slam before the burn-out begins
    sinkDepth: 0.22, // metres the planets bury themselves
    dropStreaks: 140, // streaks per second off the falling planets

    /* ================================================================ */
    /* 5 · THE DIAL                                                      */
    /* ================================================================ */
    sigilTicks: 36, // ticks round the dial
    sigilWidth: 0.05, // ring line width, metres
    sigilGlow: 1.8,
    sigilOpacity: 0.9,
    sigilSpin: 0.5, // tick band turns, revolutions/second × ticks
    colorSigilA: '#b9a2ff',
    colorSigilB: '#5a34e8',

    /* ================================================================ */
    /* 6 · STAR DUST, SPARKS & DUST                                      */
    /* ================================================================ */
    dustRate: 220, // per second, shed off the planets and the star
    dustSize: 0.07,
    dustLife: 0.6,
    dustLift: 0.6, // m/s² they drift up
    dustGlow: 3.0,
    sparkCount: 22, // per planet at the slam
    sparkSpeed: 9,
    sparkSize: 0.04,
    sparkLife: 0.55,
    sparkGravity: 12,
    sparkStretch: 0.22,
    sparkGlow: 3.5,
    smokeCount: 6, // dust puffs per planet at the slam
    smokeSize: 0.7,
    smokeLife: 1.4,
    smokeOpacity: 0.32,
    colorDustA: '#efe6ff',
    colorDustB: '#d6c8ff',
    colorDustC: '#8a6cff',
    colorDustD: '#2a1a66',
    colorSparkA: '#ffffff',
    colorSparkB: '#e8deff',
    colorSparkC: '#a080ff',
    colorSparkD: '#40208a',
    colorSmokeA: '#3a3350',
    colorSmokeB: '#2a2540',
    colorSmokeC: '#1c1a2a',
    colorSmokeD: '#121018',

    /* ================================================================ */
    /* 7 · THE LOCK & THE SLAM                                           */
    /* ================================================================ */
    lockFlash: 0.12, // screen flash at the lock
    lockLight: 1.2, // light punch at the lock, × lightIntensity
    lockSparks: 8, // sparks per planet at the lock
    slamFlash: 0.35,
    slamShake: 0.6,
    shakeDuration: 0.4,
    slamLight: 3.0, // light punch at the slam, × lightIntensity
    shockRadius: 1.5, // × zoneRadius
    craterRadius: 0.8, // the scorch under each planet, metres
    burstSize: 1.0, // the AIR shell, × zoneRadius
    burstIntensity: 1.1,
    warpStrength: 1.3, // the slam's ripple through the air
    warpReach: 1.4, // × zoneRadius
    warpTime: 0.5, // seconds it takes to run out
    colorFlash: '#cbb8ff',
    colorBurstA: '#d8c8ff',
    colorBurstB: '#7a52ff',
    colorBurstC: '#1a0c48',
    colorShockA: '#9a80ff',
    colorShockB: '#c4b0ff',
    colorCrater: '#120a24',
    colorCraterHot: '#a58cff',

    /* ================================================================ */
    /* 8 · THE HIT                                                       */
    /* ================================================================ */
    hitScale: 1.08, // × zoneRadius, what the slam catches
    hitImpulse: 5, // m/s outward
    hitLift: 7.5, // m/s upward
    hitSpin: 1.6
  }
};
