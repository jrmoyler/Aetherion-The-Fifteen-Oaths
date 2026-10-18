/**
 * Event Horizon — Cosmic — a singularity is thrown into the circle and its
 * horizon stands up round the rim as a wall of absolute black; the wall draws
 * closed like a drawstring, winding tighter and dragging everything inside it
 * toward the middle, until the column it has become is sheared through by a
 * plane of light and torn apart.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 */
export default {
  id: 'horizon',
  meta: {
    label: 'Event Horizon',
    accent: '#c9b6ff',
    key: '',
    element: 'cosmic',
    hint: 'Cosmic — a wall of black stands round the circle, draws it closed like a drawstring, and is sheared apart by a plane of light',
    cast: 'zone',
    glyph: `<ellipse cx="50" cy="26" rx="30" ry="8"/><path d="M20 26V74"/><path d="M80 26V74"/><ellipse cx="50" cy="74" rx="30" ry="8"/><path d="M8 52H92"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // metres/second the singularity flies to the circle
    lifetime: 1.4, // seconds the scar takes to fade after the column is torn apart
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 5, // the circle the horizon stands round, metres

    /* --- light (rides the seed, then the middle of the circle) --- */
    lightColor: '#c9b6ff',
    lightIntensity: 8,
    lightRadius: 11,

    /* ================================================================ */
    /* 1 · THE SEED                                                      */
    /* ================================================================ */
    seedSize: 0.55, // radius of the thrown singularity, metres
    seedGlow: 2.5,
    seedArc: 2, // metres it arcs up on its way

    /* ================================================================ */
    /* 2 · THE WALL                                                      */
    /* ================================================================ */
    openTime: 0.35, // seconds the wall takes to stand up round the rim
    drawTime: 0.9, // seconds it takes to draw closed
    minRadius: 0.6, // metres it closes to
    wallHeight: 2.6, // metres tall when it stands up
    wallStretch: 0.9, // × taller it grows as it narrows
    wallOpacity: 0.93,
    spinRate: 0.12, // revolutions/second at the rim (faster as it narrows)
    maxSlant: 2.4, // radians it winds bottom-to-top when fully closed
    bandCount: 18, // streams of light round it
    bandFollow: 1.0, // how closely the bands follow the wind
    bandGlow: 2.2,
    bandFlow: 1.6, // how fast the bands stream round
    ringGlow: 6, // the photon ring on its lip
    ringWidth: 0.035, // its thickness, share of the height
    baseGlow: 3, // the seam where it meets the floor
    wallFresnel: 2, // the violet lensing rim
    colorVoid: '#05030c',
    colorBand: '#b49cff',
    colorRing: '#ffffff',
    colorRingHalo: '#9d7bff',
    colorBase: '#d8c8ff',

    /* ================================================================ */
    /* 3 · THE SHEAR                                                     */
    /* ================================================================ */
    shearTime: 0.3, // seconds the column takes to part
    shredTime: 0.45, // seconds the halves take to tear away
    shearHeight: 1.1, // metres up the cut is
    shearTwist: 1.1, // radians each half turns
    shearSplit: 0.35, // metres each half moves apart
    cutGlow: 5, // the white-hot cut faces
    discRadius: 7.5, // metres the blade of light races out to
    discGlow: 4,
    discEdge: 0.05, // its leading edge, share of its radius
    colorDisc: '#ffffff',
    colorDiscEdge: '#a07cff',

    /* ================================================================ */
    /* 4 · THE FLOOR                                                     */
    /* ================================================================ */
    starDensity: 60, // stars in the void inside the wall
    starGlow: 2.5,
    lensSwirl: 3, // how hard the stars are wound toward the middle
    streakCount: 40, // streaks of light drawn in across the floor outside
    streakGlow: 1.6,
    infallSpeed: 1.2, // how fast they crawl inward
    floorDim: 0.3, // how dark the pulled floor goes
    scarGlow: 2, // the sheared rings left behind
    floorErode: 0.7,
    colorFloorVoid: '#07040f',
    colorStar: '#ffffff',
    colorStreak: '#8e6cff',
    colorScar: '#a48aff',

    /* ================================================================ */
    /* 5 · LENS                                                          */
    /* ================================================================ */
    lensStrength: 1.0,
    lensScale: 1.6, // × the wall's radius

    /* ================================================================ */
    /* 6 · PARTICLES                                                     */
    /* ================================================================ */
    infallRate: 220, // streaks per second spiralling in
    streakSpeed: 6,
    streakSize: 0.03,
    streakStretch: 0.35,
    streakLife: 0.45,
    streakParticleGlow: 3,
    colorInfallA: '#ffffff',
    colorInfallB: '#d4c6ff',
    colorInfallC: '#8a64ff',
    colorInfallD: '#2c1470',
    debrisRate: 45, // chips per second torn off the floor and dragged in
    debrisSize: 0.1,
    debrisSpeed: 4,
    debrisLife: 0.8,
    colorDebrisA: '#3a3448',
    colorDebrisB: '#2a2436',
    colorDebrisC: '#1c1826',
    colorDebrisD: '#100c18',
    shredCount: 260, // motes flung off the torn column
    shredSpeed: 9,
    shredSize: 0.05,
    shredLife: 0.9,
    shredGlow: 3,
    colorShredA: '#ffffff',
    colorShredB: '#e2d8ff',
    colorShredC: '#9a7cff',
    colorShredD: '#3a1fb0',

    /* ================================================================ */
    /* 7 · THE CUT                                                       */
    /* ================================================================ */
    burstSize: 5, // the flat AIR shell along the shear plane, metres
    burstIntensity: 1.1,
    shockRadius: 8, // the shockwave on the floor, metres
    ringTime: 0.5, // seconds the lens's push ring takes
    shearFlash: 0.5,
    shearShake: 0.6,
    drawRumble: 0.15, // camera rumble while it draws closed
    shakeDuration: 0.45,
    shearLight: 3, // light punch, × lightIntensity
    colorBurstA: '#ffffff',
    colorBurstB: '#b8a4ff',
    colorBurstC: '#4a28ff',
    colorShockA: '#9d86ff',
    colorShockB: '#ffffff',
    colorFlash: '#d4c8ff',

    /* ================================================================ */
    /* 8 · HITS                                                          */
    /* ================================================================ */
    drawImpulse: 4, // m/s a body is knocked inward as the wall passes it
    drawLift: 1.5,
    pull: 0.2, // 0..1 how hard held bodies are dragged toward the column
    holdHeight: 1.2, // metres up they are dragged to
    buoyancy: 0.6, // 0..1 how much of their weight the pull carries
    shearImpulse: 13, // m/s they are flung out at the cut
    shearLift: 5,
    shearSpin: 3,
    hitSlice: 1 // 1 the cut slices whatever still stands inside it
  }
};
