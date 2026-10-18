/**
 * Rime Halo — Frost — a crown of ice needles is laid round the rim of the
 * circle by a walking glint, spins up, and closes like a noose, freezing
 * whatever it closes on.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension and time below is resolved per frame by `RimeHaloAbility`,
 * so dragging any of it in the editor re-shapes a halo that is already
 * closing.
 */
export default {
  id: 'rimehalo',
  meta: {
    label: 'Rime Halo',
    accent: '#e7fbff',
    key: '',
    element: 'frost',
    hint: 'Frost — a halo of needles walks the rim, spins up and closes like a noose, freezing whatever it closes on',
    cast: 'zone',
    glyph: `<circle cx="50" cy="50" r="30"/><path d="M50 20V36M50 64V80M20 50H36M64 50H80M29 29L40 40M71 29L60 40M29 71L40 60M71 71L60 60"/><circle cx="50" cy="20" r="4"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // how fast the cold glint skates to the circle, metres/second
    lifetime: 1.2, // seconds the rime takes to sublime away at the end
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.6, // the circle, metres — the halo is laid round its rim

    /* --- light --- */
    lightColor: '#d9f6ff',
    lightIntensity: 6, // the halo's steady glow (the light rides the head, then the heart)
    lightRadius: 10,

    /* ================================================================ */
    /* TIMING                                                            */
    /* ================================================================ */
    walkTime: 0.8, // seconds the head takes to walk once round the rim
    spinTime: 0.45, // seconds the closed halo spins up before it tightens
    closeTime: 0.9, // seconds it takes to close to the middle
    lockTime: 0.55, // seconds the closed knot holds
    shatterTime: 0.7, // seconds the needles take to drop and sublime

    /* ================================================================ */
    /* 1 · THE HALO                                                      */
    /* ================================================================ */
    haloHeight: 1.35, // metres off the floor
    haloBob: 0.08, // metres it breathes up and down
    closeRadius: 0.3, // metres it closes to
    closeDrop: 0.35, // metres it sinks as it closes
    closeEase: 2.2, // how hard it accelerates as it closes (1 = linear)
    spinStart: 0.8, // radians/second as the walk finishes
    spinMax: 7, // radians/second at the moment it closes
    tiers: 2, // rows of needles
    tierGap: 0.32, // metres between rows

    /* ================================================================ */
    /* 2 · THE NEEDLES                                                   */
    /* ================================================================ */
    needleCount: 132, // max 192
    needleLength: 1.15, // metres, longest
    needleWidth: 0.075, // metres at the shoulder
    needleJitter: 0.45, // 0..1 length variety
    needleInward: 0.78, // 1 = pointing straight at the middle, 0 = along the ring
    needleTilt: 0.32, // radians of up/down variety
    needleGrowTime: 0.16, // seconds one needle takes to crystallise
    needleFrost: 0.55, // frost on the upward facets
    needleEnv: 0.55, // sky reflection
    needleCoreGlow: 2.2, // the filament inside
    needleTipGlow: 3.2, // the burning point
    needleRimGlow: 1.2, // fresnel rim
    needleFlashGlow: 7, // the flash it crystallises in
    colorNeedleBody: '#1d4a73',
    colorNeedleCore: '#bff1ff',
    colorNeedleRim: '#8fe0ff',
    colorFrost: '#f2fbff',

    /* ================================================================ */
    /* 3 · THE SPINE & HEAD                                              */
    /* ================================================================ */
    spineThickness: 0.04, // metres
    spineGlow: 3.4,
    spinePulses: 7, // bright beads running round it
    spinePulseSpeed: 9,
    colorSpineA: '#e8fbff',
    colorSpineB: '#59b8ff',
    headSize: 1.1, // metres across the star
    headGlow: 2.6,
    colorHeadA: '#ffffff',
    colorHeadB: '#8fd8ff',
    headSparkRate: 260, // sparks per second off the walking head
    sparkSize: 0.05,
    sparkSpeed: 4.5,
    sparkLifetime: 0.45,
    sparkStretch: 0.5,
    colorSparkA: '#ffffff',
    colorSparkB: '#d6f6ff',
    colorSparkC: '#7fcaff',
    colorSparkD: '#2a6aa8',

    /* ================================================================ */
    /* 4 · THE RIME FLOOR                                                */
    /* ================================================================ */
    trackWidth: 0.14, // metres of glowing track under the ring
    trackGlow: 3.2,
    floorStreak: 1.2, // how stretched the dragged rime is
    starSize: 1.7, // metres, the crystal star where it closes
    colorFrostDeep: '#163a5c',

    /* ================================================================ */
    /* 5 · COLD AIR                                                      */
    /* ================================================================ */
    coldWarp: 0.8, // distortion pouring off the ring
    coldScale: 1.6,
    mistRate: 70, // puffs per second falling off the ring
    mistSize: 0.75,
    mistLifetime: 1.3,
    mistOpacity: 0.4,
    colorMistA: '#ffffff',
    colorMistB: '#d8efff',
    colorMistC: '#93bfe0',
    colorMistD: '#3d6487',

    /* ================================================================ */
    /* 6 · THE CLOSE                                                     */
    /* ================================================================ */
    chipCount: 120, // ice chips when it locks
    chipSpeed: 6,
    chipSize: 0.12,
    chipLifetime: 1.2,
    chipGravity: -13,
    glitterCount: 160,
    glitterSize: 0.05,
    glitterLifetime: 1.5,
    fallGravity: 9, // m/s² the needles drop at as they sublime
    fallSpin: 4, // radians/second they tumble

    /* ================================================================ */
    /* 7 · BODIES                                                        */
    /* ================================================================ */
    hitReach: 0.25, // metres inside the ring a body is caught
    hitImpulse: 3.2, // metres/second pulled toward the middle
    hitLift: 1.4,
    hitSpin: 0.6,
    freezeTime: 0.35, // seconds a caught body takes to go to ice
    frostTint: 1,
    colorBodyFrozen: '#a9dcff',
    colorBodyRim: '#e8f8ff',
    bodyRimGlow: 2,
    colorBodyEdge: '#ffffff',
    bodyEdgeGlow: 3,

    /* ================================================================ */
    /* 8 · THE BEAT                                                      */
    /* ================================================================ */
    walkShake: 0.12,
    closeRumble: 0.25,
    lockShake: 0.55,
    lockFlash: 0.4,
    lockLight: 40,
    colorFlash: '#e2f7ff',
    burstRadius: 2.6,
    burstLife: 0.55,
    shockRadius: 6,
    shockLife: 0.6,
    colorShockA: '#bfeaff',
    colorShockB: '#ffffff',

    /* travel — a cold glint skating to the circle */
    trailRate: 160, // glints per second
    trailSpacing: 1.6, // metres between frost decals
    trailRadius: 0.35,
    trailLife: 1.4,
    colorTrailA: '#e8f7ff',
    colorTrailB: '#7fc6ff'
  }
};
