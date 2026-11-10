/**
 * Quartz Spire — Earth — a choir of rock-crystal points rings up through the circle.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `QuartzSpireAbility`, so
 * dragging any of it re-shapes a choir that is already standing — its ring,
 * its lean, its song, the veins in the floor.
 */
export default {
  id: 'quartzspire',
  meta: {
    label: 'Quartz Spire',
    accent: '#f3e2ff',
    key: '',
    element: 'crystal',
    hint: 'Earth — a ring of clear quartz points spirals up through the circle, leaning in to a towering master crystal that sings gold',
    cast: 'zone',
    glyph: `<path d="M50 8L60 26V86H40V26Z"/><path d="M24 86V50L30 40L36 50V86"/><path d="M64 86V50L70 40L76 50V86"/><path d="M14 86H86"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // how fast the seed vein races to the circle, metres/second
    lifetime: 1.8, // seconds the full choir stands singing
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.5, // the circle the choir stands in, metres

    /* --- light --- */
    lightColor: '#ffe7bf',
    lightIntensity: 9, // the choir's steady glow
    lightRadius: 10,
    lightHeight: 2.6, // metres over the heart the light hangs once the choir stands
    lightFlicker: 0.15, // 0..1 how much the light chimes with the song
    impactLight: 28, // light punch as the master crystal breaks the floor

    /* ================================================================ */
    /* 0 · THE SEED VEIN (travel)                                        */
    /* ================================================================ */
    trailSpacing: 0.55, // metres between the little points that jut up behind the front
    trailHeight: 0.6, // metres tall
    trailRadius: 0.11, // metres
    trailSide: 0.35, // metres they scatter either side of the line
    trailLife: 0.6, // seconds each stands before it sinks back
    trailGlints: 50, // glints / second shed by the front

    /* ================================================================ */
    /* 1 · THE CHOIR — shape                                             */
    /* ================================================================ */
    spireCount: 7, // points in the ring (≤ 12)
    ringFrac: 0.62, // ring radius as a share of `zoneRadius`
    ringHeightMin: 2.0, // shortest ring point, metres
    ringHeightMax: 3.4, // tallest ring point, metres
    spireRadius: 0.32, // ring point thickness, metres
    spireLean: 0.24, // radians every ring point leans in toward the heart
    leanJitter: 0.12, // radians of random lean on top
    masterHeight: 5.4, // the central crystal, metres
    masterRadius: 0.55, // its thickness, metres
    satellites: 3, // small points clustered round every foot (≤ 4)
    satScale: 0.38, // their size, × their parent
    satSpread: 0.6, // metres out from the parent's foot
    satLean: 0.55, // radians they splay outward
    tipLength: 0.3, // share of a point that is termination (rebuilds the mesh)
    asymmetry: 0.4, // broad/narrow alternating faces (rebuilds the mesh)

    /* --- timing --- */
    riseDelay: 0.08, // seconds after landing the first ring point breaks the floor
    spiralTime: 0.7, // seconds for the rise to spiral once round the ring
    riseTime: 0.2, // seconds one point takes to shoot up
    overshoot: 0.35, // how far past full height it springs
    riseJitter: 0.06, // seconds of random lag per point
    masterDelay: 0.9, // seconds after landing the master crystal rises
    masterRiseTime: 0.32, // seconds it takes
    shatterSpread: 0.45, // seconds over which the ring shatters (master last)
    shatterTime: 0.5, // seconds one point takes to shatter away
    shatterSink: 0.4, // share of its height it sinks while shattering
    groundFade: 0.6, // seconds the veins take to erode

    /* ================================================================ */
    /* 2 · THE CHOIR — crystal                                           */
    /* ================================================================ */
    colorBody: '#f3e2ff', // clear crystal, lit
    colorDeep: '#241a45', // the crystal's depth
    colorCore: '#fff2dc', // the light seen down its long axis
    colorSong: '#ffc46b', // the harmonic climbing it
    colorEdge: '#ffffff', // arrises and fracture edges
    coreGlow: 0.55, // brightness of the inner core
    coreSharpness: 3.0, // how narrow the core is
    phantoms: 6, // ghost terminations stacked down the shaft
    phantomGlow: 0.3,
    veils: 0.6, // milky inclusions
    veilScale: 2.2, // inclusion features per unit
    rimGlow: 0.9, // the dispersive rim
    dispersion: 0.85, // 0 white rim .. 1 full rainbow
    edgeGlow: 1.3, // facet lines
    edgeWidth: 0.07, // share of a face
    envReflect: 0.5, // sky reflection
    specular: 2, // sun glint
    songRate: 1.4, // harmonics / second climbing each point
    songWidth: 0.1, // thickness of a harmonic band, share of the height
    songGlow: 2.6, // brightness of the harmonic
    idleGlow: 0.3, // glow of a standing point
    punchGlow: 1.0, // extra glow the instant a point breaks the floor
    shatterEdge: 0.1, // width of the white fracture edge

    /* ================================================================ */
    /* 3 · THE CHOIR FLOOR                                               */
    /* ================================================================ */
    colorFloor: '#120d20', // the cut floor
    colorVein: '#d9c4ff', // veins at rest
    veinWidth: 0.05, // metres
    veinGlow: 3.0,
    frost: 0.5, // frosted plates between the veins
    frostScale: 1.4, // plates per metre
    floorDark: 0.55, // how much the circle is darkened
    starSkip: 2, // star polygon step (spire k → k + skip)
    revealTime: 0.35, // seconds the veins take to grow out to the rim

    /* ================================================================ */
    /* 4 · TIP FLARE & RESONANCE                                         */
    /* ================================================================ */
    flareSize: 1.7, // metres
    flareGlow: 2.2,
    flareRays: 6,
    resonanceWarp: 0.45, // strength of the ringing air (distortion)
    resonanceBands: 4, // rings of compression up the column
    resonanceHeight: 6.5, // metres
    resonanceSpeed: 1.2, // rings / second

    /* ================================================================ */
    /* 5 · PARTICLES                                                     */
    /* ================================================================ */
    glintRate: 90, // glints / second off a standing choir
    glintSize: 0.06,
    glintLife: 0.8,
    glintGlow: 3,
    colorGlintA: '#ffffff',
    colorGlintB: '#fff0d0',
    colorGlintC: '#e6d2ff',
    colorGlintD: '#9f86ff',
    shardCount: 14, // crystal shards per point breaking the floor
    shardSpeed: 6,
    shardSize: 0.09,
    shardLife: 1.1,
    shardGravity: -14,
    colorShardA: '#ffffff',
    colorShardB: '#f1e6ff',
    colorShardC: '#c9b2ff',
    colorShardD: '#6c5aa8',
    dustCount: 6, // dust puffs per point
    dustSize: 0.6,
    dustSpeed: 1.4,
    dustLife: 1.4,
    dustOpacity: 0.45,
    colorDustA: '#d8cfe6',
    colorDustB: '#a99cbd',
    colorDustC: '#6e6584',
    colorDustD: '#3a3448',
    sparkCount: 10, // streak sparks per point
    sparkSpeed: 9,
    sparkSize: 0.05,
    sparkLife: 0.4,
    sparkStretch: 0.6,

    /* ================================================================ */
    /* 6 · THE BEAT                                                      */
    /* ================================================================ */
    spireShake: 0.12, // knock per ring point
    masterShake: 0.55, // the master crystal's jolt
    impactFlash: 0.45,
    colorFlash: '#ffe9c2',
    burstRadius: 3.4, // FROST shell off the master crystal, metres
    burstLife: 0.6,
    colorBurstA: '#ffffff',
    colorBurstB: '#e3d0ff',
    colorBurstC: '#8a72d6',
    shockRadius: 7, // metres
    shockLife: 0.7,
    colorShockA: '#ffe7bf',
    colorShockB: '#ffffff',
    pointRingRadius: 1.2, // a little shock ring under every ring point
    crackRadius: 2.6, // CRACK decal at the heart, metres

    /* ================================================================ */
    /* 7 · BODIES                                                        */
    /* ================================================================ */
    hitRadius: 1.1, // metres round a rising ring point that it impales
    hitImpulse: 3.5, // outward
    hitLift: 9, // up
    hitSpin: 2,
    masterImpulse: 6, // the master throws everything left in the circle
    masterLift: 7
  }
};
