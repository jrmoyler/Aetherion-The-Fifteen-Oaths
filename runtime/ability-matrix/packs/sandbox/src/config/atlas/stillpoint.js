/**
 * Stillpoint — Control — a time-dilation lattice freezes debris mid-air, turns it, then lets go.
 *
 * Ability Atlas data block, rebuilt for the sandbox engine. Plain data, no
 * imports, so `settings.js` can pull it in without a cycle.
 *
 * Read against Chrono Fracture, which is the other time spell in the pack:
 * that one is a clockwork sphere of gold and glass. This one has no clock and
 * no metal — it is a cold violet geodesic cage, the floor itself torn up and
 * held, and the release is the stone thrown, not the cage shattering.
 */
export default {
  id: 'stillpoint',
  meta: {
    label: "Stillpoint",
    accent: '#c2a6ff',
    key: '',
    hint: "Control — a geodesic lattice stops time: torn-up rock and glass hang frozen and turn, bodies inside are held, then the stored momentum lets go",
    cast: 'zone',
    glyph: `<path d="M50 14L82 32V68L50 86L18 68V32Z"/><path d="M50 14V50M82 32L50 50M18 32L50 50M50 86V50" opacity=".55"/><path d="M30 76l-6 8M70 76l6 8M50 50l0 0"/><circle cx="36" cy="40" r="3"/><circle cx="62" cy="58" r="2.5"/><circle cx="58" cy="34" r="2"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 16, // maximum cast distance, metres
    minRange: 2, // the stillpoint is never set on the caster's own feet
    speed: 30, // how fast the seed of stillness travels to the circle, metres/second
    lifetime: 1.0, // × every phase of the timeline below (on top of global lifetime)
    fadeTime: 1.2, // seconds the lattice takes to dissolve after the release
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 3.2, // radius of the lattice, metres — what the indicator measures
    handHeight: 1.4, // metres above the floor the seed leaves the hand

    /* ================================================================ */
    /* 1 · LATTICE — the time-dilation shell                              */
    /* ================================================================ */
    shellScale: 1.0, // radius, × zoneRadius
    shellSquash: 0.72, // height, × radius (a low dome, not a ball)
    shellSink: 0.18, // fraction of the radius below the floor
    formTime: 0.7, // seconds for the lattice to draw itself from the floor up
    latticeFreq: 3.0, // geodesic subdivision of the cage (triangles per face edge)
    edgeWidth: 0.035, // lattice stroke width, fraction of a cell
    edgeGlow: 2.2,
    nodeGlow: 3.2, // the vertices where edges meet
    fillGlow: 0.12, // faint film across each face
    fresnelPower: 2.4,
    fresnelGlow: 1.0,
    shimmerSpeed: 0.35, // the slowed shimmer crawling over the cage
    shimmerScale: 2.2,
    shimmerAmount: 0.6,
    backFace: 0.4, // brightness of the far side, seen through the near
    shellOpacity: 0.9,
    dissolveEdge: 0.08, // burning edge as it dissolves
    turnRate: 0.06, // radians/second the cage itself turns (barely)
    colorEdge: '#d6c4ff',
    colorNode: '#ffffff',
    colorFill: '#6a4dd8',
    colorRim: '#a98bff',
    colorBurn: '#f2e9ff',

    /* --- the floor under it --- */
    floorGlow: 1.6,
    floorRings: 7, // concentric dilation rings, crowding toward the middle
    floorRingSpeed: 0.12, // how slowly they creep inward
    floorSpokes: 12,
    floorOpacity: 0.85,
    colorFloor: '#7a5cff',
    colorFloorHot: '#e7dcff',

    /* ================================================================ */
    /* 2 · DEBRIS — torn up, caught, turned                               */
    /* ================================================================ */
    rockCount: 26, // rock chunks (max 40)
    glassCount: 18, // glass shards (max 32)
    rockSize: 0.32, // metres, mean
    glassSize: 0.26,
    sizeJitter: 0.55,
    tearStagger: 0.45, // seconds over which pieces tear free of the floor
    tearSpeed: 7.0, // metres/second they are flung upward
    catchTime: 0.5, // seconds from leaving the floor to hanging frozen
    hangMin: 0.35, // lowest a piece hangs, × shell height
    hangMax: 0.92, // highest
    hangReach: 0.85, // how far out it hangs, × radius
    holdTime: 2.2, // seconds the constellation is held and turned
    constellationSpin: 0.32, // radians/second the frozen constellation turns about the centre
    pieceDrift: 0.04, // metres of slow bob while frozen
    pieceTurn: 0.15, // radians/second each piece turns on its own while frozen
    tremble: 0.03, // metres of tremble in the instant before release
    trembleTime: 0.35, // seconds of it
    rockRoughness: 0.75, // how lumpy the stone is
    rockGlow: 1.6, // the stored-momentum glow in the stone's cracks
    glassFresnel: 2.0,
    glassGlow: 1.4,
    glassOpacity: 0.45,
    colorRock: '#5a5260',
    colorRockDeep: '#211d27',
    colorCrack: '#b598ff',
    colorGlass: '#cbb8ff',
    colorGlassRim: '#ffffff',

    /* --- the release --- */
    releaseSpeed: 16, // metres/second the fragments fly outward
    releaseLift: 0.25, // upward share of the throw
    releaseGravity: -14,
    releaseTumble: 14, // radians/second
    releaseLife: 1.1, // seconds before a fragment has burned out
    killReach: 9.0, // metres from the centre a fragment can still kill
    fragmentHitRadius: 0.55, // metres — a fragment this close to a body kills it
    /** How a body is thrown. Same shape as `settings.dummies.hit`. */
    hit: { impulse: 10.0, lift: 3.5, spin: 2.6 },

    /* ================================================================ */
    /* 3 · HELD BODIES                                                     */
    /* ================================================================ */
    holdBodies: 1, // 0/1 — freeze bodies inside while time is stopped
    holdReach: 1.0, // × radius
    holdTint: 0.8, // how violet a held body turns
    holdTintTime: 0.4, // seconds for the tint to take
    holdRimGlow: 3.0,
    colorHeld: '#3a2d63',
    colorHeldRim: '#d6c4ff',

    /* ================================================================ */
    /* 4 · PARTICLES & IMPACTS                                             */
    /* ================================================================ */
    dustCount: 50, // dust torn up with the debris
    dustSize: 0.45,
    dustLife: 1.6,
    colorDustA: '#8a8296',
    colorDustB: '#5a5463',
    colorDustC: '#2d2a33',
    colorDustD: '#121015',
    moteRate: 60, // frozen motes hanging in the lattice / second
    moteSize: 0.05,
    moteLife: 2.4,
    colorMoteA: '#ffffff',
    colorMoteB: '#d8c8ff',
    colorMoteC: '#8f6dff',
    colorMoteD: '#2a1a55',
    streakCount: 140, // streaks thrown out on release
    streakSize: 0.07,
    streakLife: 0.55,
    streakSpeed: 18,
    colorStreakA: '#ffffff',
    colorStreakB: '#e1d4ff',
    colorStreakC: '#9c7bff',
    colorStreakD: '#1c1033',
    tearShake: 0.18,
    releaseShake: 0.7,
    releaseFlash: 0.25,
    releaseLight: 30,
    shockRadius: 7.0, // metres
    shockLife: 0.6,
    burstRadius: 3.5,
    burstLife: 0.45,
    crackRadius: 1.2, // × zoneRadius, the crack decal left where the floor was torn
    crackLife: 4.0,
    colorShockA: '#ffffff',
    colorShockB: '#a98bff',
    colorFlash: '#e5dbff',

    /* ================================================================ */
    /* 5 · DILATION — the screen warp                                      */
    /* ================================================================ */
    lensStrength: 0.5, // the slow drag of the frozen region
    lensSwirl: 0.25,
    lensReach: 1.25, // × radius
    lensShock: 2.2, // the release's outward ring

    /* --- the light --- */
    lightColor: '#c2a6ff',
    lightIntensity: 6,
    lightRadius: 9,
    lightHeight: 1.4
  }
};
