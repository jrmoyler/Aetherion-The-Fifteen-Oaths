/**
 * Vortex Bell — Wind — a bell of streaming air drops over the circle, rings, and throws a vortex ring off its rim.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `VortexBellAbility`, so
 * dragging any of it re-shapes a bell that is already ringing — its profile,
 * its vibration, the vortex ring rolling away from it, the print on the floor.
 */
export default {
  id: 'vortexbell',
  meta: {
    label: 'Vortex Bell',
    accent: '#d9fff6',
    key: '',
    element: 'wind',
    hint: 'Wind — a great bell of streaming air drops over the circle and rings, and a rolling vortex ring blows off its rim and sweeps everything outward',
    cast: 'zone',
    glyph: `<path d="M50 14C36 14 32 26 32 40C32 56 28 64 18 70H82C72 64 68 56 68 40C68 26 64 14 50 14Z"/><ellipse cx="50" cy="82" rx="38" ry="8"/><circle cx="50" cy="74" r="4"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // how fast the little bell flies to the circle, metres/second
    lifetime: 0.8, // seconds the bell takes to lift away and dissolve at the end
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.6, // the circle the bell covers, metres

    /* --- light --- */
    lightColor: '#e8fff8',
    lightIntensity: 9, // the bell's glow
    lightRadius: 10,
    lightHeight: 3.0, // metres over the heart the light hangs inside the bell
    lightFlicker: 0.25, // 0..1 how much it trembles with the ringing
    impactLight: 30, // light punch on the strike

    /* ================================================================ */
    /* 0 · THE HANDBELL (travel)                                         */
    /* ================================================================ */
    seedHeight: 1.6, // metres off the floor the little bell flies at
    seedScale: 0.35, // metres, its lip radius
    seedSpin: 9, // radians/second it spins
    travelStreaks: 90, // wind lines / second it sheds

    /* ================================================================ */
    /* 1 · THE BELL — shape                                              */
    /* ================================================================ */
    bellRadius: 0.9, // lip radius, × zoneRadius
    bellHeight: 5.2, // metres
    bellWaist: 0.62, // shoulder radius, share of the lip
    bellFlare: 1.4, // how fast the lip flares out of the waist
    lipFlare: 0.06, // extra flare at the very lip
    crownStart: 0.75, // height share where the dome begins

    /* --- timing --- */
    dropHeight: 5, // metres above the floor the bell forms
    dropTime: 0.32, // seconds it takes to drop onto the circle
    throwDelay: 0.12, // seconds after the strike the vortex leaves the rim
    holdTime: 1.0, // seconds the bell stands ringing after the strike
    vortexTime: 1.1, // seconds the vortex takes to roll out to its reach
    liftHeight: 3, // metres the bell rises as it dissolves
    groundFade: 0.5, // seconds the print takes to erode

    /* --- ringing --- */
    modeAmp: 0.1, // the (2,0) mode: how far the lip squeezes into an oval
    modeRate: 11, // radians/second it swaps axes
    modeDecay: 2.2, // how fast the ringing dies (per second)
    humAmp: 0.012, // fine shimmer that lingers

    /* ================================================================ */
    /* 2 · THE BELL — look                                               */
    /* ================================================================ */
    flowSpeed: 1.6, // how fast the spiral streaks pour down
    spiralTwist: 3, // turns of the spiral from lip to crown
    streakLanes: 22, // streak lanes round the bell
    streakGlow: 1.2,
    rimGlow: 1.3, // the silhouette
    bodyGlow: 0.2,
    lipGlow: 1.6, // the lip
    bandGlow: 3, // the brass strike band
    bandSpeed: 1.8, // crown → lip, per second
    bandWidth: 0.08, // share of the height
    dissolveEdge: 0.06,
    bellOpacity: 1.0,
    softFade: 0.4, // metres of soft fade where it meets geometry
    colorBellA: '#ffffff', // streaks, lip
    colorBellB: '#a8f3e6', // the air
    colorBellC: '#21606b', // the air's depth
    colorBand: '#ffd59a', // the strike — a brass glint
    bellWarp: 0.8, // how hard the bell bends the world (distortion)

    /* ================================================================ */
    /* 3 · THE VORTEX RING                                               */
    /* ================================================================ */
    vortexReach: 8.0, // metres, radius it rolls out to
    vortexTube: 0.45, // metres, its tube radius
    vortexGrow: 1.6, // × tube radius by the end of its run
    vortexSquash: 0.8, // flattens the tube vertically
    vortexRise: 0.5, // metres off the floor (centre of the tube) at the rim
    rollBands: 7, // bands round the tube
    rollSpeed: 2.5, // bands / second rolling
    vortexGlow: 1.6,
    vortexRim: 1.2,
    colorVortexA: '#ffffff',
    colorVortexB: '#bff7ee',
    colorVortexC: '#2c7f8a',
    vortexWarp: 1.2, // how hard the ring drags the air (distortion)

    /* ================================================================ */
    /* 4 · THE BELL PRINT                                                */
    /* ================================================================ */
    printRings: 6, // standing pressure rings inside the lip
    printGlow: 1.2,
    nodalGlow: 1.8, // the mode's four nodal diameters
    printDark: 0.5,
    colorPrint: '#c9fff4',
    colorPrintDark: '#061214',

    /* ================================================================ */
    /* 5 · PARTICLES                                                     */
    /* ================================================================ */
    streakRate: 140, // wind lines / second spiralling down the bell
    streakSize: 0.04,
    streakLife: 0.5,
    streakStretch: 1.2,
    colorStreakA: '#ffffff',
    colorStreakB: '#dffff8',
    colorStreakC: '#7fe2d4',
    colorStreakD: '#2c6f78',
    dustRate: 140, // dust / second kicked up under the vortex
    dustSize: 0.7,
    dustLife: 1.0,
    dustOpacity: 0.3,
    colorDustA: '#cbd8d4',
    colorDustB: '#97aaa6',
    colorDustC: '#5f706e',
    colorDustD: '#2c3637',
    strikeRings: 8, // pressure rings thrown off the lip on the strike
    ringSize: 0.22,
    ringLife: 0.6,
    colorRingA: '#ffffff',
    colorRingB: '#fff0d0',
    colorRingC: '#a8f3e6',
    colorRingD: '#2c6f78',

    /* ================================================================ */
    /* 6 · THE STRIKE                                                    */
    /* ================================================================ */
    dropShake: 0.1, // rumble as it falls
    strikeShake: 0.6,
    strikeFlash: 0.4,
    colorFlash: '#fff1d6',
    burstRadius: 4, // AIR shell under the bell, metres
    burstLife: 0.55,
    colorBurstA: '#ffffff',
    colorBurstB: '#bff7ee',
    colorBurstC: '#ffd59a',
    shockRadius: 9, // metres
    shockLife: 0.8,
    colorShockA: '#bff7ee',
    colorShockB: '#ffffff',

    /* ================================================================ */
    /* 7 · BODIES                                                        */
    /* ================================================================ */
    hitBand: 0.8, // metres either side of the ring's tube that it catches
    hitImpulse: 9, // outward
    hitLift: 5,
    hitSpin: 3
  }
};
