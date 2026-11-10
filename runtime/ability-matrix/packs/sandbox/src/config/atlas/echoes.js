/**
 * Hall of Echoes — Illusion — three holograms assemble in orbit, swap places, and shatter like mirrors.
 *
 * Ability Atlas data block, rebuilt for the sandbox engine. Plain data, no
 * imports, so `settings.js` can pull it in without a cycle.
 */
export default {
  id: 'echoes',
  meta: {
    label: "Hall of Echoes",
    accent: '#ef9dff',
    key: '',
    hint: "Illusion — three holograms of you print in orbit, swap places through the centre, then shatter into killing mirror",
    cast: 'zone',
    glyph: `<circle cx="50" cy="52" r="34" stroke-dasharray="5 6"/><path d="M50 18V34M47 22H53"/><path d="M21 69L33 61M23 62L29 70"/><path d="M79 69L67 61M77 62L71 70"/><path d="M44 46L56 58M56 46L44 58"/><path d="M50 40L52 48L60 52L52 54L50 62L48 54L40 52L48 48Z"/>`
  },
  /**
   * An illusion that turns into shrapnel.
   *
   * Four beats. **Print**: a disc of black glass and a projector circle
   * unfurl in the zone, a hall of arched mirror panes comes up out of the floor
   * round its far side, and three
   * holographic copies of the caster are printed over its nodes, slice by
   * slice from the feet up, and breathe on the caster's idle while they orbit.
   * **Swap**: at `swapAt` each copy cuts through the middle to the opposite
   * side of the ring, staggered and bowed so they thread past each other.
   * **Break**: at `lifetime` the copies shatter, one after another, into
   * faceted mirror that flies outward, the panes craze, burst and sink, and
   * the black glass cracks from the centre. **Cut**: any body a copy's shard
   * reaches goes down. The zone itself never hurts anyone.
   */
  settings: {
    /* --- the cast --- */
    "range": 16,
    "minRange": 0,
    "speed": 28, // m/s the projection thread runs to the zone
    "lifetime": 2.05, // seconds from arrival to the first copy breaking
    "cooldown": 0.6,
    "castAnim": "cast2",
    "zoneRadius": 3.2,
    travelHeight: 1.0, // metres off the floor the thread runs at
    travelPixels: 160, // per second off the thread

    /* --- orbit & swap --- */
    orbitScale: 0.62, // orbit radius, × zone radius
    orbitSpeed: 0.55, // rad/s
    faceTurn: 0, // radians off facing straight out of the circle
    swapAt: 0.95, // seconds after arrival the swap starts
    swapTime: 0.6, // seconds one copy takes to cross
    swapStagger: 0.12, // seconds between one copy's crossing and the next
    swapBow: 0.45, // metres each crossing bows off the diameter
    swapPixels: 60, // burst as a copy passes the middle

    /* ================================================================ */
    /* 1 · HOLOGRAMS                                                      */
    /* ================================================================ */
    copyScale: 1.45, // the copies stand this × the caster's height
    assembleDelay: 0.12, // seconds after arrival the first copy starts printing
    assembleStagger: 0.14,
    assembleTime: 0.55,
    holoSlices: 26,
    holoSlideIn: 0.7, // metres a slice slides in from
    buildGlow: 3.5,
    assembleFlashTime: 0.35,
    assembleShake: 0.04,
    assembleLight: 0.8, // light punch per copy printed, × lightIntensity
    holoOpacity: 0.9,
    holoGlow: 2.1,
    holoFill: 0.62,
    holoFresnel: 2.0,
    holoFresnelPower: 2.2,
    holoFringe: 0.35,
    scanDensity: 70, // scanlines per metre
    scanSpeed: 3.5,
    scanStrength: 0.6,
    holoDropout: 0.08,
    holoFlicker: 0.25,
    colorHoloLow: '#7a3cff',
    colorHoloHigh: '#ef9dff',
    colorHoloRim: '#ffd2ff',
    colorBuild: '#ffffff',

    /* --- glitch --- */
    glitchIdle: 0.08,
    glitchSwap: 0.75,
    glitchShatter: 1.0,
    preShatter: 0.4, // seconds the tearing ramps up before a copy breaks
    glitchBands: 20,
    glitchRate: 14, // re-rolls per second
    glitchShift: 0.09, // metres a torn band jumps

    /* ================================================================ */
    /* 2 · DAIS                                                           */
    /* ================================================================ */
    daisScale: 1.0, // radius, × zone radius
    daisLift: 0.03,
    daisTime: 0.4, // seconds to unfurl from the centre
    daisGlow: 1.4,
    daisOpacity: 0.7,
    daisNodeGlow: 2.6,
    daisSpin: -0.6,
    daisHex: 0.6,
    daisSweep: 1.2,
    daisRingLife: 0.6,
    daisShake: 0.06,
    colorDais: '#ef9dff',

    /* ================================================================ */
    /* 9 · THE HALL — arched mirror panes, solid and lit (the hero shape) */
    /* ================================================================ */
    paneCount: 7, // panes (max 9)
    paneArc: 3.9, // radians of the far side they stand across (open toward you)
    paneSeat: 1.0, // × zone radius
    paneWidth: 1.3, // metres
    paneHeight: 3.3, // metres to the crown of the arch
    paneDepth: 0.09, // metres thick
    paneLean: 0.08, // radians leaning back
    paneSway: 0.03, // radians of slow sway while the hall stands
    paneSwayRate: 1.3,
    paneDelay: 0.05, // seconds after arrival the back pane starts to rise
    paneStagger: 0.35, // seconds the wings follow by
    paneRiseTime: 0.4,
    paneCrackLead: 0.45, // seconds the panes craze before the break
    paneSinkTime: 0.5, // seconds a broken pane takes to sink
    paneShards: 8, // cosmetic shards per pane (max 8)
    paneRoughness: 0.05,
    paneMetalness: 1.0,
    paneRimGlow: 1.3,
    paneRimWidth: 0.07,
    paneScan: 0.12,
    paneScanDensity: 14,
    paneCrackCells: 2.6,
    paneCrackGlow: 4,
    colorPane: '#d9ccf2',

    /* --- 10 · black glass floor (the deep tone) --- */
    floorScale: 1.08, // × zone radius
    floorOpacity: 0.82,
    floorSky: 0.55,
    floorCrackTime: 0.5,
    floorCrackGlow: 2.5,
    colorFloorDeep: '#0c0618',

    /* ================================================================ */
    /* 3 · PROJECTOR BEAMS                                                */
    /* ================================================================ */
    beamRadius: 0.45, // metres at the top
    beamHeight: 1.05, // × body height
    beamIdle: 0.18,
    beamBands: 34,
    beamSpeed: 6,
    beamGlow: 1.6,
    beamOpacity: 0.5,
    colorBeam: '#d68cff',

    /* ================================================================ */
    /* 4 · MIRROR SHARDS                                                  */
    /* ================================================================ */
    shatterStagger: 0.1,
    shardCount: 36, // per copy (max 48), × global particle count
    shardSize: 0.22, // metres
    shardLife: 1.5,
    shardSpeed: 11,
    shardLift: 4,
    shardSpread: 0.55,
    shardGravity: 14,
    shardDrag: 0.6,
    shardBounce: 0.3,
    shardFriction: 0.7,
    shardTumble: 1.4,
    mirrorReflect: 1.3,
    mirrorFresnel: 1.4,
    mirrorTint: 0.5,
    mirrorEdgeGlow: 2.2,
    mirrorGlint: 1.6,
    mirrorGlow: 1.2,
    mirrorOpacity: 0.95,
    colorMirror: '#f2ecff',
    colorMirrorEdge: '#ffe8ff',

    /* --- hits --- */
    shardReach: 14, // metres from the centre beyond which shards are spent
    shardHitRadius: 0.35, // metres a shard reaches either side
    shardLethalTime: 0.9, // seconds a shard is fast enough to kill
    hitImpulse: 7.5,
    hitLift: 3.2,
    hitSpin: 1.6,
    hitGlitter: 36,
    hitShake: 0.1,

    /* ================================================================ */
    /* 5 · PIXELS                                                         */
    /* ================================================================ */
    pixelRate: 220,
    pixelSize: 0.05,
    pixelSpeed: 1.4,
    pixelLifetime: 0.8,
    pixelRise: 0.6,
    pixelGlow: 2.4,
    colorPixelA: '#ffffff',
    colorPixelB: '#ffc6ff',
    colorPixelC: '#b45cff',
    colorPixelD: '#2a0f4a',

    /* ================================================================ */
    /* 6 · GLITTER                                                        */
    /* ================================================================ */
    shatterGlitter: 70,
    shatterPixels: 60,
    glitterSize: 0.06,
    glitterSpeed: 9,
    glitterLifetime: 0.55,
    glitterStretch: 0.6,
    glitterGlow: 3,
    colorGlitterA: '#ffffff',
    colorGlitterB: '#fff0ff',
    colorGlitterC: '#ef9dff',
    colorGlitterD: '#3a1250',

    /* ================================================================ */
    /* 7 · CRACKED LENS                                                   */
    /* ================================================================ */
    warpStrength: 1.2,
    warpScale: 1.4, // × zone radius
    warpHeight: 1.0,
    warpTime: 0.6,
    warpWidth: 0.09,
    warpCells: 4.5,

    /* ================================================================ */
    /* 8 · THE BREAK                                                      */
    /* ================================================================ */
    burstRadius: 2.0,
    burstLife: 0.4,
    burstIntensity: 1.8,
    colorBurstA: '#ffffff',
    colorBurstB: '#ef9dff',
    colorBurstC: '#7a3cff',
    shatterRingScale: 1.6,
    shatterRingLife: 0.7,
    shatterShake: 0.35,
    shakeDuration: 0.35,
    shatterFlash: 0.3,
    colorFlash: '#ffd9ff',

    /* --- light --- */
    "lightColor": "#ef9dff",
    "lightIntensity": 6,
    "lightRadius": 9,
    lightBoost: 2 // the break's light punch, × lightIntensity
  }
};
