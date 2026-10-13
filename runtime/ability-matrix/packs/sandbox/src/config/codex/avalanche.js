/**
 * Avalanche Wake — Frost — a rolling front of powder snow and tumbling ice
 * boulders that ploughs down the line, engulfs what it meets and buries it
 * where it breaks.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `AvalancheWakeAbility`, so
 * dragging any of it in the editor re-shapes a wave that is already rolling:
 * the front, the boulders inside it, the drift it lays and the grip it has on
 * the bodies it is carrying.
 */
export default {
  id: 'avalanche',
  meta: {
    label: "Avalanche Wake",
    accent: '#e6f6ff',
    key: '',
    element: 'frost',
    hint: "Frost — a rolling wave of powder and tumbling ice boulders ploughs down the line, carries off what it meets and buries it where it breaks",
    cast: 'line',
    glyph: `<path d="M10 78C18 50 34 34 52 32C70 30 84 42 86 56C78 48 66 46 58 52C70 52 78 62 76 74"/><path d="M8 84H92"/><path d="M30 66L36 58L44 62L40 70Z"/><path d="M54 70L60 64L66 70L60 76Z"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 22, // maximum cast distance, metres
    minRange: 3, // closer than this and the cast is refused
    speed: 11, // how fast the front rolls, metres/second — heavy, not a blade
    lifetime: 3.4, // seconds the drift lingers and melts after the wave has broken
    cooldown: 0.8, // seconds before the ability can be armed again
    castAnim: "cast2", // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: "#cfe8ff",
    lightIntensity: 5, // the cold glow riding inside the front
    lightRadius: 10,
    lightFlicker: 0.15, // 0..1 how much it churns with the powder

    /* ================================================================ */
    /* 1 · THE FRONT — a billowing shell of powder                       */
    /* ================================================================ */

    /* --- silhouette (metres unless noted) --- */
    frontWidth: 3.0, // half-width of the wall, centre to either flank
    frontHeight: 2.5, // height of the crest at the centre
    frontDepth: 2.6, // how far the shell reaches back from its leading face
    frontCurl: 0.45, // how far the crest leans out over its own foot, × the depth
    frontTaper: 0.45, // how quickly the flanks drop away from the centre
    frontGrowth: 0.35, // how much bigger it has grown by the end of the line, × size
    frontRise: 0.3, // seconds the wall takes to heave up off the caster's feet
    frontBob: 0.12, // metres the crest heaves while it rolls
    frontBobSpeed: 5, // heaves per second (radians)
    frontBillow: 0.55, // metres the billows bulge out of the shell
    frontBillowScale: 1.1, // billows per metre
    rollSpeed: 1.0, // how fast the billows roll over the crest, × true rolling
    tipFade: 0.4, // how soft the flanks are

    /* --- shading --- */
    shellOpacity: 0.92, // how solid the powder is at its densest
    shellDensity: 1.4, // how quickly it thins toward the silhouette (power)
    shellLight: 1.0, // key-light strength on the lit side of the billows
    shellAmbient: 0.55, // how much the shadowed side is still lit by the sky
    shellScatter: 0.6, // light glowing through the thin edges from behind
    shellErode: 0.55, // how ragged and wispy the silhouette is
    shellErodeScale: 2.4, // wisps per metre
    shellSoftFade: 0.7, // soft intersection with the floor and bodies, metres
    colorShellLit: "#f2f8ff", // powder in the light
    colorShellShadow: "#8aa6cc", // powder in its own shade
    colorShellDeep: "#4f6d9c", // the deep folds between billows
    colorShellRim: "#ffffff", // the backlit fringe

    /* ================================================================ */
    /* 2 · DISTORTION — the air the wave shoves ahead of it              */
    /* ================================================================ */
    warpStrength: 0.7, // how hard the world wobbles round the front
    warpGrow: 1.18, // size of the warp shell, × the front
    warpScale: 1.4, // noise features per metre
    warpSpeed: 2.2, // how fast it churns

    /* ================================================================ */
    /* 3 · POWDER — smoke-shaped snow off the crest and in its wake      */
    /* ================================================================ */
    powderRate: 150, // puffs per second thrown off the front
    powderSize: 0.85, // puff size, metres
    powderEndSize: 1.9, // how much a puff has grown by the end of its life
    powderLifetime: 1.1,
    powderSpeed: 4.2, // metres/second a puff leaves the shell at
    powderLift: 2.0, // upward share of that
    powderCurl: 2.8, // how hard the puffs curl forward over the crest, m/s
    powderDrag: 0.6,
    powderOpacity: 0.62,
    powderTurbulence: 0.9,
    trailRate: 40, // settling haze per second left behind the wave
    trailSize: 1.0,
    trailLifetime: 1.6,
    trailOpacity: 0.16,
    colorPowderA: "#ffffff",
    colorPowderB: "#e2eefc",
    colorPowderC: "#a9c2e2",
    colorPowderD: "#6e88b2",

    /* --- diamond dust: glittering ice crystals hanging in the wake --- */
    sparkleRate: 160, // per second
    sparkleSize: 0.05,
    sparkleLifetime: 1.4,
    sparkleGlow: 2.4,
    colorSparkleA: "#ffffff",
    colorSparkleB: "#dff3ff",
    colorSparkleC: "#9fd2ff",
    colorSparkleD: "#5a8fd0",

    /* ================================================================ */
    /* 4 · ICE BOULDERS — tumbling inside the front                      */
    /* ================================================================ */
    boulderCount: 16, // how many ride the wave (max 32)
    boulderSize: 0.42, // mean radius, metres
    boulderSizeJitter: 0.5, // ± fraction of that
    boulderSpread: 0.85, // how far toward the flanks they ride, × half-width
    boulderBack: 1.4, // metres of the shell's depth they are scattered through
    boulderBounce: 0.6, // metres a boulder hops at the top of a bounce
    boulderBounceRate: 0.9, // bounces per metre rolled
    boulderSpin: 1.0, // roll rate, × true rolling for its size
    boulderWobble: 0.7, // how far its spin axis tips off the lateral
    chipsPerBounce: 3, // ice chips thrown off each landing
    chipSize: 0.08,
    chipLifetime: 1.0,
    chipSpeed: 4,
    colorChipA: "#ffffff",
    colorChipB: "#cfeaff",
    colorChipC: "#7fb4e6",
    colorChipD: "#3d6ca8",

    /* --- ice shading --- */
    iceIOR: 1.31, // index of refraction the env map is bent by
    iceRefract: 0.9, // how much of the world shows through
    iceReflect: 0.55, // how much of the sky is mirrored on the facets
    iceFresnel: 2.0, // rim strength
    iceFresnelPower: 3.0,
    iceFrost: 0.7, // snow crust on the upward facets
    iceFrostScale: 3.0, // crust patches per metre
    iceCracks: 0.6, // internal fracture planes catching light
    iceCrackScale: 2.6,
    iceSparkle: 3.0, // hard glints off the facets
    iceSparkleSharp: 90,
    iceInner: 0.45, // cold light trapped inside
    colorIceDeep: "#123a66",
    colorIceBody: "#5c9fd6",
    colorIceRim: "#d8f4ff",
    colorIceFrost: "#eef6ff",
    colorIceInner: "#7fd4ff",

    /* ================================================================ */
    /* 5 · THE DRIFT — packed snow laid down the line                    */
    /* ================================================================ */
    driftWidth: 2.7, // half-width of the drift, metres
    driftHeight: 0.3, // how deep the snow is packed at the middle
    driftEdge: 0.55, // fraction of the half-width the banks slope over
    driftStart: 1.2, // metres from the caster before the drift begins
    driftLag: 0.6, // metres behind the leading face the snow is laid
    driftNoise: 0.1, // metres of lumpiness
    driftNoiseScale: 0.9, // lumps per metre
    rutDepth: 0.12, // how deep the boulders gouge their tracks
    rutWidth: 0.24, // half-width of a rut, metres
    heapHeight: 0.8, // the heap piled where the wave breaks
    heapRadius: 2.6,
    driftLight: 0.85,
    driftAmbient: 0.5,
    driftSparkle: 2.4, // brightness of the glints in the snow
    driftSparkleDensity: 38, // glint cells per metre
    driftSparkleCut: 0.9, // fraction of cells that never glint
    meltDelay: 0.25, // fraction of the linger before it starts to go
    meltErode: 0.7, // how patchy the melt is
    meltWet: 0.65, // how dark the wet snow goes
    colorDriftLit: "#c6d6ec",
    colorDriftShadow: "#56709a",
    colorDriftWet: "#2a3c58",
    colorDriftSparkle: "#ffffff",

    /* ================================================================ */
    /* 6 · ENGULF — what the wave does to bodies                         */
    /* ================================================================ */
    engulfReach: 0.5, // metres past the flank a body is still caught
    engulfLead: 0.4, // metres ahead of the face it reaches
    engulfImpulse: 1.5, // the shove a standing body is cut loose with, m/s
    engulfLift: 2.4,
    engulfSpin: 0.6,
    carryBack: 1.0, // metres behind the face a body is held in the churn
    carryHeight: 0.9, // metres up the wall it is carried at
    carrySpread: 0.65, // how much of its lateral offset it keeps, × 1
    carryGrab: 7, // how hard the snow takes hold (per second)
    carrySpring: 5, // how quickly a body is drawn to its place in the front
    carryBuoyancy: 0.85, // share of its weight the snow carries
    carryTumble: 0.9, // turns per second it rolls with the wave
    dumpThrow: 5, // m/s forward it is flung when the wave breaks
    dumpDown: 2.5, // m/s down into the heap
    buryDepth: 0.55, // metres the floor gives under a buried body

    /* ================================================================ */
    /* 7 · THE BREAK — the wave collapses at the end of the line         */
    /* ================================================================ */
    breakTime: 1.0, // seconds the front takes to collapse
    breakDrift: 2.4, // metres it rolls on while collapsing
    breakSurge: 0.35, // how much it heaves up before it falls, × height
    burstSize: 6, // frost shell, metres
    burstIntensity: 1.1,
    shockRadius: 9,
    frostRadius: 4.6, // rime decal under the heap
    frostLife: 4.5,
    powderBurst: 150, // puffs thrown up when it breaks
    sparkleBurst: 220, // diamond dust thrown up
    scatterSpeed: 6.5, // m/s the boulders are thrown at
    scatterLift: 5, // m/s up
    scatterSpin: 7, // rad/s tumble once thrown
    boulderRestitution: 0.35, // bounce kept on landing
    boulderFriction: 0.55, // slide lost on landing
    boulderSink: 1.2, // seconds a settled boulder takes to settle into the snow
    impactShake: 0.7,
    shakeDuration: 0.6,
    impactFlash: 0.3,
    impactLight: 3, // × intensity
    rollRumble: 0.32, // camera rumble while it rolls
    castPuff: 12, // powder off the caster's feet as the wall heaves up
    colorBurstA: "#ffffff",
    colorBurstB: "#bfe2ff",
    colorBurstC: "#5d8fd0",
    colorShockA: "#cfe8ff",
    colorShockB: "#ffffff",
    colorFrostA: "#9fd4ff",
    colorFrostB: "#ffffff",
    colorFlash: "#dff1ff"
  }
};
