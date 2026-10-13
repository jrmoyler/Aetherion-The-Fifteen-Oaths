/**
 * Chrono Recall — Time — dash a bent arc leaving frozen echoes, then rewind to the start.
 *
 * Ability Atlas data block, rebuilt for the sandbox engine. Plain data, no
 * imports, so `settings.js` can pull it in without a cycle.
 */
export default {
  id: 'recall',
  meta: {
    label: "Chrono Recall",
    accent: '#ffcf76',
    key: '',
    hint: "Time — dash a bent arc leaving frozen echoes of yourself, then rewind back to the start",
    cast: 'line',
    glyph: `<path d="M22 74C22 40 64 26 80 50"/><circle cx="22" cy="74" r="7"/><path d="M22 74V69M22 74L26 76"/><circle cx="44" cy="44" r="4"/><circle cx="66" cy="38" r="4"/><path d="M80 50L72 46M80 50L82 41"/>`
  },
  /**
   * A dash and its undoing.
   *
   * Three beats. **The run**: the caster sprints a bent arc to the target —
   * the real body, on screen — and every `1 / echoCount` of the way a frozen
   * echo of them is left standing over a clock dial, in the exact pose they had
   * at that instant. Bodies on the arc are thrown. **The hold**: for
   * `lifetime` seconds every clock stops. **The rewind**: the caster becomes
   * the last echo, a wringing distortion runs back down the arc, every echo is
   * unthreaded slice by slice as it passes, the clocks spin backward, and the
   * caster snaps back to the origin with a pressure shell and a flash.
   *
   * The character is only ever moved or hidden while a recall owns it; a
   * clear or retire mid-cast puts it back at the origin, visible. See
   * `ChronoRecallAbility`.
   */
  settings: {
    /* --- the cast --- */
    "range": 18,
    "minRange": 3,
    "speed": 16, // m/s the runner covers the arc at
    "lifetime": 0.45, // seconds every clock holds still at the target
    "cooldown": 0.6,
    "castAnim": "cast2",
    dashEaseIn: 0.12, // seconds to reach full dash speed
    bend: 0.32, // how far the arc bows off the chord, × its length
    bendSide: 0, // -1 bows left, 1 right, 0 picks one per cast
    rewindTime: 0.9, // seconds from the far end back to the origin
    rewindEase: 1.6, // >1 the rewind starts slow and accelerates into the snap
    fadeTime: 0.6, // seconds the stream and the snap linger after it
    bodyHeight: 0.95, // metres: where sparks, sand and the warp sit on a body
    tickRate: 2, // the light ticks this many times a second

    /* ================================================================ */
    /* 1 · ECHOES — the caster, frozen                                    */
    /* ================================================================ */
    echoCount: 5, // echoes dropped along the arc (max 8)
    echoAppear: 0.12, // seconds an echo takes to solidify
    echoFlare: 1.6, // extra brightness the instant it is stamped
    echoFlareTime: 0.35, // seconds that flare takes to settle
    echoOpacity: 0.85,
    echoGlow: 1.6,
    echoFill: 0.45, // brightness of the glass interior (rim is separate)
    echoFresnel: 2.2,
    echoFresnelPower: 2.4,
    echoBands: 16, // sand-glass bands over a body height
    echoBandSpeed: 0.06, // bands per second they crawl upward
    echoBandSharp: 9,
    echoMapMix: 0.55, // how much of the skin's own detail reads through
    echoJitter: 0.006, // metres of frozen-time tremor
    colorEchoCore: '#ff9a3c',
    colorEchoRim: '#fff1c4',
    colorEchoBand: '#ffd27a',

    /* --- the rewind collapse --- */
    echoCollapseTime: 0.42, // seconds for one echo to unthread
    echoSlices: 22, // horizontal slices it peels in
    echoTwist: 3.2, // radians a slice twists about the spine
    echoSmear: 1.6, // metres a slice is dragged back along the arc
    echoShrink: 0.75, // 0..1 how far it falls into its heart
    collapseSparks: 40,
    collapseSparkSpeed: 7,
    collapseShake: 0.06,
    collapseLight: 0.6, // light punch, × lightIntensity
    colorRewind: '#7fd8ff', // the rewind's own colour: cold against the amber

    /* ================================================================ */
    /* 2 · CLOCK DIALS                                                    */
    /* ================================================================ */
    dialRadius: 0.7, // metres
    anchorDialScale: 1.5, // the dial at the origin is the master clock
    dialLift: 0.03,
    dialLine: 0.022, // line weight, in dial radii
    dialSpeed: 4, // minute hand while the runner runs, rad/s
    dialRewindSpeed: 22, // and backward on the rewind
    dialTrail: 1.2, // the light wedge behind the minute hand
    dialGlow: 2.2,
    dialOpacity: 0.9,
    stampRadius: 1.4, // the shock ring under a new echo, × dial radius
    stampLife: 0.5,
    stampSparks: 28,
    stampSparkSpeed: 4,
    stampShake: 0.04,
    colorDialRing: '#ffcf76',
    colorDialHand: '#fff8e6',
    colorDialTrail: '#ffb347',

    /* ================================================================ */
    /* 3 · TIME-STREAM — the arc on the floor                             */
    /* ================================================================ */
    pathWidth: 0.42, // half-width at the middle of the arc, metres
    pathLift: 0.025,
    pathTickSpacing: 0.7, // metres between chevrons
    pathFlowSpeed: 3.5, // m/s the chevrons flow (reverses on the rewind)
    pathGrain: 0.5,
    pathHeadGlow: 2.4,
    pathGlow: 1.6,
    pathOpacity: 0.8,
    colorPathCore: '#ffe6a8',
    colorPathEdge: '#ff9f43',

    /* ================================================================ */
    /* 4 · SAND                                                           */
    /* ================================================================ */
    sandRate: 140, // per second off the runner
    sandHoldRate: 60, // per second off the standing echoes
    sandRewindRate: 260, // per second blown back off the rewind head
    sandSize: 0.05,
    sandSpeed: 1.6,
    sandLifetime: 1.2,
    sandRise: 0.35,
    sandTurbulence: 0.8,
    sandGlow: 2,
    colorSandA: '#fff6d8',
    colorSandB: '#ffcf76',
    colorSandC: '#d98a2b',
    colorSandD: '#3a2410',

    /* ================================================================ */
    /* 5 · SPARKS                                                         */
    /* ================================================================ */
    sparkSize: 0.07,
    sparkLifetime: 0.5,
    sparkStretch: 0.6,
    sparkGlow: 3,
    colorSparkA: '#ffffff',
    colorSparkB: '#fff0b8',
    colorSparkC: '#ffb347',
    colorSparkD: '#5a2a0a',

    /* ================================================================ */
    /* 6 · REWIND WARP                                                    */
    /* ================================================================ */
    warpStrength: 1.1,
    warpSize: 3.2, // metres across
    warpWidth: 0.06, // ring thickness, in disc radii²
    warpTwist: 0.7, // 0 a plain push, 1 a pure wring about the head
    rewindFlash: 0.25,
    rewindShake: 0.12,

    /* --- the hold --- */
    holdFlash: 0.18,
    holdFlashTime: 0.5,
    holdShake: 0.08,
    holdLight: 1.2,

    /* ================================================================ */
    /* 7 · THE SNAP — back at the origin                                  */
    /* ================================================================ */
    snapRadius: 3, // metres
    snapDecalLife: 0.8,
    snapBurst: 2.6,
    snapBurstLife: 0.45,
    snapBurstIntensity: 2.2,
    colorBurstA: '#ffffff',
    colorBurstB: '#ffcf76',
    colorBurstC: '#7fd8ff',
    colorDust: '#a08668',
    snapSparks: 110,
    snapSparkSpeed: 9,
    snapSand: 90,
    snapWarpStrength: 1.4,
    snapWarpSize: 4.5,
    snapWarpTime: 0.45,
    snapShake: 0.45,
    snapShakeTime: 0.35,
    snapFlash: 0.45,
    colorFlash: '#ffe9b8',

    /* --- hits on the outbound dash --- */
    hitRadius: 1.1, // metres either side of the arc
    hitImpulse: 7,
    hitLift: 3.6,
    hitSpin: 1.4,
    hitOutward: 0.45, // how much a body is kicked out of the bend
    hitSparks: 40,
    hitShake: 0.12,

    /* --- light --- */
    "lightColor": "#ffcf76",
    "lightIntensity": 6,
    "lightRadius": 9,
    lightBoost: 2.5 // the snap's light punch, × lightIntensity
  }
};
