/**
 * Bile Lance — Poison — a fluted drill of bile screws down the line.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `BileLanceAbility`, so
 * dragging any of it in the editor re-shapes a lance that is already in the
 * air — its flutes, its spin, the corkscrew it leaves, the trench it eats.
 */
export default {
  id: 'bilelance',
  meta: {
    label: 'Bile Lance',
    accent: '#c6f25a',
    key: '',
    element: 'poison',
    hint: 'Poison — a spinning drill of bile screws down the line, bores into the floor and erupts',
    cast: 'line',
    glyph: `<path d="M12 50L70 38L92 50L70 62Z"/><path d="M30 46L36 54M44 43L50 57M58 40L64 60"/><path d="M8 40C14 44 14 56 8 60"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 16, // how fast the lance flies down the line, metres/second
    lifetime: 2.2, // seconds the trench and the bore take to stop eating once the lance is gone
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#d8ff7a',
    lightIntensity: 7, // the lance's steady glow (the light rides the nose)
    lightRadius: 9,
    lightFlicker: 0.25, // 0..1 how much the bile gutters

    /* ================================================================ */
    /* 1 · THE LANCE — shape                                             */
    /* ================================================================ */
    handForward: 1.4, // metres in front of the caster the lance forms
    flightHeight: 1.25, // metres off the floor it flies at
    formTime: 0.14, // seconds the lance takes to swell out of the hand
    lanceLength: 3.2, // nose to tail, metres
    lanceRadius: 0.3, // radius at its fattest, metres
    bellyAt: 0.24, // 0..1 where along it (tail → nose) it is fattest
    flutes: 4, // helical grooves round it
    fluteDepth: 0.28, // how deep, × the radius
    twist: 2.2, // turns the grooves make nose to tail
    spinSpeed: 26, // radians/second it drills
    wobble: 0.12, // surface wobble, × the radius
    wobbleScale: 2.2, // wobble features per metre

    /* ================================================================ */
    /* 2 · THE LANCE — bile                                              */
    /* ================================================================ */
    bodyOpacity: 0.86, // how solid the bile is
    rimGlow: 3.2, // the acid-bright silhouette (bloom > 1)
    grooveGlow: 4.2, // light running down the grooves
    tipGlow: 6, // the white-hot point
    flowSpeed: 3.2, // metres/second the murk streams nose → tail
    flowScale: 1.6, // murk features per metre
    softFade: 0.2, // soft intersection with the floor, metres
    colorBileA: '#f8ffd0', // tip / hottest
    colorBileB: '#d6ff4a', // rim and grooves
    colorBileC: '#7fa61a', // body
    colorBileD: '#1e2a06', // murk

    /* ================================================================ */
    /* 3 · THE CORKSCREW — helix ribbons and wake rings                  */
    /* ================================================================ */
    ribbonLength: 5.5, // metres of helix trailing the lance
    ribbonRadius: 0.38, // helix radius right behind the lance, metres
    ribbonFlare: 0.75, // helix radius at the far end of the trail, metres
    ribbonPitch: 1.5, // metres per full turn
    ribbonThickness: 0.035, // tube radius, metres
    ribbonGlow: 3.8,
    ringSpacing: 1.6, // metres between wake rings
    ringSize: 1.25, // radius a wake ring opens to, metres
    ringLife: 0.55, // seconds a wake ring lasts
    ringWidth: 0.09, // its thickness, × its radius
    ringGlow: 2.6,
    ringArms: 3, // corkscrew arms in each ring
    colorRibbon: '#e8ff8a',
    colorRing: '#c8f060',

    /* ================================================================ */
    /* 4 · THE TRENCH — eaten floor down the line                        */
    /* ================================================================ */
    trenchStart: 1.2, // metres in front of the caster it begins
    trenchWidth: 0.22, // half-width of the wet channel, metres
    trenchEaten: 0.9, // half-width of the etched stone round it, metres
    trenchGlow: 1.0, // brightness of the live acid
    trenchFresh: 3.5, // metres behind the nose the acid stays bright
    bubbleScale: 4.5, // bubbles per metre
    bubbleRate: 1.6, // bubble pops per second, each
    trenchWander: 0.12, // metres it wanders
    trenchErode: 0.75, // 0..1 how raggedly it fades
    colorAcid: '#a8d830',
    colorWet: '#16220a',
    colorEtched: '#141a0a',

    /* ================================================================ */
    /* 5 · THE BORE — drilling into the floor, the eruption              */
    /* ================================================================ */
    drillTime: 0.32, // seconds the lance takes to screw into the floor
    drillDepth: 1.6, // metres it bores on past the end, nose down
    drillSpin: 2.2, // × spin while it drills
    eruptDelay: 0.08, // seconds after it vanishes before the bile erupts
    eruptDrops: 340, // droplets in the eruption
    eruptSpeed: 11, // m/s
    eruptSpread: 0.3, // cone spread
    boreRadius: 1.7, // radius of the bore pit on the floor, metres
    boreSwirl: 2.4, // turns of the drain spiral
    boreGlow: 3.4,
    burstSize: 0.9, // the WATER shell, metres (a wet flash round the geyser's foot)
    burstIntensity: 0.7,
    shockRadius: 5, // the shockwave on the floor, metres
    scorchRadius: 2.2,
    impactFlash: 0.03, // a hint only: the impact is the burst and the local light, not a screen wash
    impactShake: 0.5,
    shakeDuration: 0.35,
    impactLight: 2.6, // light punch, × lightIntensity
    travelRumble: 0.06,
    colorBoreA: '#f2ff9a',
    colorBoreB: '#9ccc1a',
    colorBoreC: '#0e1404',
    colorBurstA: '#f4ffc8',
    colorBurstB: '#b8ec30',
    colorBurstC: '#3e5a0a',
    colorShock: '#c6f25a',
    colorFlash: '#5a7a22',

    /* --- the geyser: the eruption's mass, on the eruption clock --- */
    geyserHeight: 3.3, // metres it bursts up to
    geyserRadius: 0.5, // column radius, metres
    geyserFoot: 0.85, // extra radius where it flares out of the hole, metres
    geyserHead: 0.75, // extra radius of the swollen head, metres
    geyserHeadAt: 0.8, // 0..1 where up the column the head sits
    geyserRise: 0.26, // seconds it takes to burst up
    geyserHold: 0.28, // seconds it boils at full height
    geyserSlump: 0.95, // seconds the head droops and it slumps into a heap
    heapHeight: 0.7, // metres the slumped heap stands
    heapRadius: 1.35, // metres it spreads to
    heapSinkStart: 0.35, // 0..1 through the fade it starts sinking back into the bore
    heapSink: 0.35, // metres it sinks
    geyserLobes: 0.24, // crawling bulges, × radius
    geyserLobeScale: 1.5,
    geyserFlowSpeed: 2.6, // how fast the lobes and murk churn
    geyserFlowScale: 1.3, // murk features per metre
    geyserSway: 0.28, // metres the column sways at the top
    geyserBubbleAmp: 0.14, // metres a bubble dome swells off the surface
    geyserBubbleScale: 2.6, // bubble cells per metre
    geyserBubbleRate: 1.1, // bubble cycles per second
    geyserPopGlow: 1.8, // the flash as one pops
    geyserOpacity: 0.97,
    geyserLight: 0.8, // how much the sun lifts the body off the deep tone
    geyserRimGlow: 0.4,
    geyserVeinGlow: 0.5, // lime veins where the murk thins
    geyserHot: 2.6, // white-hot throat, only while it is still rising
    geyserSpecular: 1.1, // wet highlight
    geyserDripRate: 120, // drips per second off the drooping head
    geyserBubbles: 26, // bubbles per second breaking off the heap
    geyserBubbleSize: 0.16,
    colorGeyserHot: '#f4ffc8', // core
    colorGeyserTint: '#c6f25a', // tint: rim, veins, bubbles
    colorGeyserBody: '#2c4608', // body: olive bile
    colorGeyserDeep: '#0f1604', // deep: near-black bile in the folds

    /* ================================================================ */
    /* 6 · DROPS, MIST & MOTES                                           */
    /* ================================================================ */
    dropRate: 160, // per second flung off the spinning lance
    dropSize: 0.06,
    dropSpeed: 4.5, // m/s thrown off tangentially
    dropLife: 0.75,
    dropGravity: 11, // m/s²
    mistRate: 55, // per second trailing the lance
    mistSize: 0.45,
    mistLife: 1.2,
    mistOpacity: 0.38,
    moteRate: 90, // per second, glowing motes off the trench
    moteSize: 0.045,
    moteLife: 0.9,
    moteGlow: 3,
    colorDropA: '#f0ffb0',
    colorDropB: '#c6f25a',
    colorDropC: '#7aa318',
    colorDropD: '#2c3c08',
    colorMistA: '#5e7424',
    colorMistB: '#3e521c',
    colorMistC: '#3e4c1c',
    colorMistD: '#22281a',
    colorMoteA: '#ffffe0',
    colorMoteB: '#e0ff70',
    colorMoteC: '#8ccf1e',
    colorMoteD: '#2c4a06',

    /* ================================================================ */
    /* 7 · DISTORTION                                                    */
    /* ================================================================ */
    hazeStrength: 0.8, // how hard the air bends round the lance
    hazeWidth: 2.2, // × the lance radius
    hazeScale: 2.4,
    hazeSpeed: 3,

    /* ================================================================ */
    /* 8 · THE PIERCE                                                    */
    /* ================================================================ */
    hitWidth: 1.0, // metres either side of the line the lance catches
    hitImpulse: 9, // m/s a body is thrown along the line
    hitLift: 3.2,
    hitSpin: 2.4, // the drill sets them spinning
    eruptRadius: 2.4, // metres round the bore the eruption throws
    eruptImpulse: 5,
    eruptLift: 9,
    stain: 0.85, // 0..1 how far a pierced body is stained
    stainTime: 0.6, // seconds the stain takes
    colorStainBody: '#26330a',
    colorStainRim: '#b8ec30',
    stainRimGlow: 2.2,
    colorStainEdge: '#eaff9a',
    stainEdgeGlow: 3.5,
    stainEdgeWidth: 0.05
  }
};
