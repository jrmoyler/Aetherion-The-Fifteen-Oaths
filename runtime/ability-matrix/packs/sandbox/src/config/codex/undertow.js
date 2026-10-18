/**
 * Undertow Chains — Water — the circle floods dark, chains of undertow lash
 * in from its rim on spirals, go taut, and drag everything in it under.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 *
 * Every dimension below is resolved per frame by `UndertowChainsAbility`:
 * drag `zoneRadius` while it stands and the water, the chains' spirals and
 * the pull on every body re-scale round it.
 */
export default {
  id: 'undertow',
  meta: {
    label: 'Undertow Chains',
    accent: '#49b4ff',
    key: '',
    element: 'water',
    hint: 'Water — the circle floods dark, chains of undertow spiral in from its rim, pull taut and drag it all under',
    cast: 'zone',
    glyph: `<circle cx="50" cy="50" r="34"/><path d="M84 50C80 72 58 74 50 60"/><path d="M33 21C52 12 66 30 56 44"/><path d="M24 70C16 52 30 40 44 48"/><circle cx="50" cy="52" r="5"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // how fast the cast reaches the circle — the flood gathers meanwhile
    lifetime: 1.5, // seconds the pool takes to drain once everything is under
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.8, // metres — the circle the undertow takes

    /* --- light --- */
    lightColor: '#5ec4ff',
    lightIntensity: 9, // the light hangs over the middle of the circle
    lightRadius: 10,
    lightFlicker: 0.3, // 0..1 caustic shimmer

    /* ================================================================ */
    /* 1 · THE UNDERTOW — the dark water                                 */
    /* ================================================================ */
    gatherFill: 0.35, // share of the circle flooded (rim inward) before the chains come
    floodTime: 0.35, // seconds the rest floods once they do
    poolOpacity: 0.9,
    ringFreq: 0.55, // inward swells per metre
    ringSpeed: 0.7, // swells per second, contracting inward
    ringGlow: 0.6,
    streamGlow: 0.5, // the streams drawn in along the chains
    streamSpeed: 0.8,
    abyss: 0.85, // how black the middle goes as it drags under
    foamWidth: 0.55, // the foam lip at the edge, metres
    foamGlow: 1.0,
    envAmount: 0.35, // sky reflected off the water and the links
    colorAbyss: '#01070f',
    colorDeep: '#041f3a',
    colorShallow: '#14588c',
    colorFoam: '#d8f2ff',
    colorRing: '#5fc2f5',

    /* ================================================================ */
    /* 2 · THE CHAINS — shape                                            */
    /* ================================================================ */
    chainCount: 5, // chains lashing in from the rim (max 8)
    linksPerChain: 24, // links in each (max 36)
    linkLength: 0.56, // metres, one link end to end
    linkWidth: 0.34, // metres across a link
    linkThickness: 0.11, // metres, the bar of a link
    spiralTurns: 0.45, // turns each chain makes rim → centre
    spiralSide: 0, // −1 clockwise, +1 anticlockwise, 0 a coin toss per cast
    knotRadius: 0.35, // metres from the centre the chains end
    chainArc: 1.5, // metres each chain humps up mid-way
    chainWave: 0.3, // metres of the wave running along a slack chain
    chainWaveLength: 2.2, // metres per wave
    chainWaveSpeed: 9, // radians/second
    chainTime: 0.5, // seconds a chain takes to lash in from the rim

    /* ================================================================ */
    /* 3 · THE CHAINS — water made solid                                 */
    /* ================================================================ */
    linkGlow: 1.9, // the bright rim
    linkCore: 1.1, // the body
    linkFresnel: 2.0,
    linkFlow: 2.5, // how fast the veins stream along the chain
    headGlow: 1.6, // flare on a link as it appears at the racing head
    colorLinkA: '#06305a', // deep
    colorLinkB: '#2a8ad4', // body
    colorLinkC: '#8fe0ff', // rim and veins

    /* ================================================================ */
    /* 4 · THE DRAG                                                      */
    /* ================================================================ */
    holdTime: 0.22, // seconds the chains hang taut before they drag
    dragTime: 1.15, // seconds to drag the circle under
    sinkDepth: 2.4, // metres the chains go down
    pullSpeed: 3.0, // m/s bodies are dragged toward the middle
    grip: 0.4, // 0..1 how hard the current holds a body
    bodySink: 3, // metres a body is pulled below the floor
    knockImpulse: 2.2, // m/s a body is yanked inward when a chain takes it
    knockLift: 0.8,
    knockSpin: 0.9,

    /* ================================================================ */
    /* 5 · THE PULL — distortion                                         */
    /* ================================================================ */
    warpStrength: 0.8,

    /* ================================================================ */
    /* 6 · BUBBLES, SPRAY & MIST                                         */
    /* ================================================================ */
    bubbleRate: 70, // per second rising out of the dragging water
    bubbleSize: 0.15,
    bubbleLife: 1.0,
    sprayRate: 140, // per second thrown off the racing chain heads
    spraySize: 0.07,
    spraySpeed: 3.2,
    sprayLife: 0.7,
    mistRate: 18, // per second over the rim
    mistSize: 0.9,
    mistLife: 1.5,
    mistOpacity: 0.28,
    colorBubbleA: '#ffffff',
    colorBubbleB: '#cdeeff',
    colorBubbleC: '#7cc6f2',
    colorBubbleD: '#2f7fbf',
    colorSprayA: '#ffffff',
    colorSprayB: '#bfe8ff',
    colorSprayC: '#5fb2ea',
    colorSprayD: '#1d5f9a',
    colorMistA: '#d2ecfa',
    colorMistB: '#a8d2ea',
    colorMistC: '#7aaccb',
    colorMistD: '#4f7d9c',

    /* ================================================================ */
    /* 7 · THE BEATS                                                     */
    /* ================================================================ */
    anchorRipple: 1.1, // metres, the ripple where each chain leaves the rim
    dragRipple: 1.0, // × zoneRadius, the ripple as it drags under
    dragShake: 0.45,
    dragFlash: 0.18,
    dragLight: 1.8, // light punch, × lightIntensity
    dragRumble: 0.22, // camera rumble while it drags
    travelRumble: 0.04,
    gulpSize: 1.5, // the WATER shell as it closes over, metres
    colorRippleA: '#7fd0ff',
    colorRippleB: '#ffffff',
    colorBurstA: '#ffffff',
    colorBurstB: '#8fd6ff',
    colorBurstC: '#1d5f9a',
    colorFlash: '#9edcff'
  }
};
