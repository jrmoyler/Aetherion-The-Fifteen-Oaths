/**
 * Pollen Nova — Nature — a giant flower punches up through the floor, blooms,
 * and bursts into a nova of golden pollen that puts everything in it to sleep.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so `settings.js`
 * can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `PollenNovaAbility`, so
 * dragging any of it in the editor re-shapes a flower that is already open.
 * Times are seconds on the cast's own clock, which starts the moment the seed
 * reaches the circle.
 */
export default {
  id: 'pollen',
  meta: {
    label: "Pollen Nova",
    accent: '#ffe066',
    key: '',
    element: 'nature',
    hint: "Nature — a giant flower blooms in the circle and bursts into a cloud of golden pollen that lulls everything to sleep",
    cast: 'zone',
    glyph: `<circle cx="50" cy="46" r="8"/><path d="M50 38C42 22 50 12 50 12C50 12 58 22 50 38Z"/><path d="M58 46C74 38 84 46 84 46C84 46 74 54 58 46Z"/><path d="M42 46C26 38 16 46 16 46C16 46 26 54 42 46Z"/><path d="M56 52C66 66 60 76 60 76C60 76 50 68 56 52Z"/><path d="M44 52C34 66 40 76 40 76C40 76 50 68 44 52Z"/><path d="M14 88C30 80 70 80 86 88"/><path d="M30 26L28 22"/><path d="M72 28L76 24"/><path d="M78 64L82 66"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 0, // closer than this and the cast is refused
    speed: 24, // how fast the seed runs to the circle, metres/second
    lifetime: 2, // seconds the pollen drifts over the circle after the burst
    cooldown: 0.5, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4, // the circle, metres — the flower and the nova are sized off it
    colorA: '#ffe066', // accent: pollen gold
    colorB: '#ffffff', // accent: the hot core of it

    /* --- light --- */
    lightColor: '#ffe066',
    lightIntensity: 6, // the warm glow of the bloom
    lightRadius: 8,
    lightHeight: 2.2, // metres above the circle the light sits

    /* --- the seed: a mote of gold running along the floor to the circle --- */
    seedRate: 160, // motes per second shed off it
    seedSize: 0.09, // metres

    /* ================================================================ */
    /* TIMING                                                            */
    /* ================================================================ */
    emergeTime: 0.6, // the bud punching up through the floor
    bloomTime: 1.1, // one layer of petals curling open
    bloomStagger: 0.18, // seconds between one layer and the next (outside in)
    pulseTime: 0.9, // the open flower pulsing before it bursts
    wiltDelay: 1.6, // seconds after the burst the petals begin to wilt
    wiltTime: 1.3, // the wilt
    sinkTime: 1.1, // the flower sinking back into the floor
    fadeTime: 1.0, // the ground and the last pollen fading away

    /* ================================================================ */
    /* 1 · THE FLOWER                                                    */
    /* ================================================================ */
    flowerScale: 1.0, // the whole flower
    flowerHeight: 0.55, // metres the receptacle sits above the floor
    budDepth: 3.6, // metres under the floor the bud starts
    budScale: 0.6, // × size of the bud as it breaks the surface
    budPitch: 0.35, // radians from vertical a petal leans in the bud
    budCurl: -0.9, // how hard it curls in over the middle (negative = inward)
    wiltPitch: 2.45, // radians from vertical once wilted — drooping to the floor
    wiltCurl: 1.1,
    petalCup: 0.32, // how much each petal cups upward across its width
    petalJitter: 0.12, // length variation between petals
    petalFlutter: 0.03, // radians the open petals stir
    petalNotch: 0.08, // the notch at the tip
    petalFrill: 0.08, // how frilled the margin is
    pulseAmount: 1.0, // how hard the flower breathes before the burst
    pulseRate: 9, // radians/second of the breathing

    /* --- the layers: green sepals, then three whorls of petals, outside in --- */
    sepalCount: 6,
    sepalLength: 1.7, // metres
    sepalWidth: 0.42, // metres, half-width at the widest
    sepalPitch: 1.85, // radians from vertical when open
    sepalCurl: 0.5,
    sepalBase: 0.5, // metres out from the axis it grows from
    outerCount: 8,
    outerLength: 2.7,
    outerWidth: 1.0,
    outerPitch: 1.42,
    outerCurl: 0.55,
    outerBase: 0.42,
    midCount: 7,
    midLength: 2.15,
    midWidth: 0.88,
    midPitch: 1.05,
    midCurl: 0.5,
    midBase: 0.32,
    innerCount: 6,
    innerLength: 1.5,
    innerWidth: 0.7,
    innerPitch: 0.62,
    innerCurl: 0.4,
    innerBase: 0.22,

    /* --- petal shading --- */
    veinCount: 9, // side veins fanning from the base
    veinWidth: 0.12,
    veinStrength: 0.55,
    ribWidth: 0.06, // the midrib
    petalSSS: 1.3, // light transmitted through from behind
    petalSSSPower: 3, // how tightly that glow follows the sun
    petalRim: 0.6, // soft fresnel
    petalRimPower: 2.5,
    petalAmbient: 0.38,
    petalDiffuse: 0.85,
    chargeGlow: 2.4, // the throat lighting up before the burst
    colorPetalBase: '#ffd23f',
    colorPetalMid: '#ff9fb8',
    colorPetalTip: '#ffe3ec',
    colorPetalVein: '#d9577e',
    colorPetalSSS: '#ffb36b',
    colorPetalRim: '#fff1c4',
    colorSepalA: '#2f6b2a',
    colorSepalB: '#79b54a',
    colorWilt: '#7a5a2e',
    colorWiltEdge: '#3a2814',
    colorCharge: '#ffd84a',

    /* --- the pistil --- */
    stamenCount: 14,
    stamenHeight: 0.85, // metres
    stamenSpread: 0.45, // radians they lean out
    pistilSize: 0.42, // metres, the domed head
    pistilGlow: 3.2,
    pistilGrain: 7, // pollen grains on the head
    pistilSparkle: 2,
    pistilRim: 0.5,
    colorStalk: '#e9f0b0',
    colorAnther: '#ffc93a',
    colorPistil: '#ffb020',

    /* ================================================================ */
    /* 2 · THE FOLIAGE ON THE FLOOR                                      */
    /* ================================================================ */
    foliageReach: 1.25, // × zoneRadius, how far it fans out
    spreadTime: 1.2, // seconds the leaves take to fan out
    leafCount: 9, // leaves in the first ring
    leafInner: 0.9, // metres out the first ring sits
    leafRingGap: 0.85, // metres between rings
    leafLength: 1.7, // metres
    leafWidth: 0.26, // × length, half-width
    grassAmount: 0.75,
    soilRadius: 1.15, // metres of torn earth where the bud came up
    groundDustGlow: 3, // the gold settled on the ground, glinting
    colorLeafA: '#2d6a2a',
    colorLeafB: '#6fae3c',
    colorLeafRib: '#a8d66a',
    colorGrass: '#4c8f34',
    colorSoil: '#3b2a1c',
    colorDust: '#ffd65a',

    /* ================================================================ */
    /* 3 · THE NOVA                                                      */
    /* ================================================================ */
    shellRadius: 1.25, // × zoneRadius, where the shell gets to
    shellTime: 0.9, // seconds it takes to get there
    shellSquash: 0.7, // vertical squash
    shellLumps: 0.08,
    shellGlow: 1.6,
    shellFresnel: 2.2,
    shellGrainScale: 9, // grains of pollen across it
    shellGrain: 0.8, // 0 smooth .. 1 all grain
    shellBody: 0.08, // light across its face, not just the rim
    shellSoftFade: 0.6,
    colorShellCore: '#ffcf40',
    colorShellEdge: '#fff3b0',
    lensStrength: 1.2, // the shell bending the world (distortion)

    novaCount: 900, // pollen motes in the burst
    novaSpeed: 9, // metres/second
    novaSize: 0.07,
    novaLifetime: 2.2,
    novaDrag: 2.4, // how quickly the burst slows to a drift
    moteGlow: 2.4,
    driftRate: 260, // per second of pollen drifting over the circle after
    driftHeight: 2.6, // metres the drift fills to
    chargeMotes: 120, // per second rising off the pistil while it pulses
    colorMoteA: '#fffbe0',
    colorMoteB: '#ffe066',
    colorMoteC: '#ffb52e',
    colorMoteD: '#9a5a10',

    hazeCount: 50, // soft clouds of pollen in the burst
    hazeSize: 1.4, // metres
    hazeLifetime: 2.6,
    hazeOpacity: 0.35,
    colorHazeA: '#ffe98a',
    colorHazeB: '#ffd04a',
    colorHazeC: '#d9962a',
    colorHazeD: '#6a4a18',

    /* --- petals and leaves shed --- */
    petalFallRate: 45, // per second while wilting
    petalFallSize: 0.32, // metres
    petalFallLifetime: 2.4,
    leafBurst: 40, // leaves flung out as the bud breaks the floor
    soilBurst: 70, // clods thrown up as it breaks the floor
    soilSize: 0.12,
    colorSoilChunk: '#4a3524',

    /* ================================================================ */
    /* 4 · THE BEATS                                                     */
    /* ================================================================ */
    emergeShake: 0.35,
    burstShake: 0.25, // a soft burst, not a blast
    burstFlash: 0.25,
    burstLight: 18, // light punch on the burst
    colorFlash: '#fff0b0',
    emergeRingRadius: 1.4, // × zoneRadius, the dust ring as the bud breaks
    emergeRingLife: 1.6,
    burstRingRadius: 1.5, // × zoneRadius, the gold shock ring on the burst
    burstRingLife: 1.1,

    /* --- what it does to bodies --- */
    drowseReach: 1.15, // × zoneRadius, how far the sleep reaches
    swayTime: 1.5, // seconds they sway, drowsing, before they go down
    swayAmount: 0.13, // radians of sway at its deepest
    swayRate: 3.2, // radians/second, slowing as they nod off
    slumpImpulse: 0.7, // metres/second — they fold, they are not thrown
    slumpLift: 0.2,
    slumpSpin: 0.25,
    slumpFloat: 0.45, // 0..1 of their weight the pollen holds as they go down
    slumpSoftTime: 0.9, // seconds the fall is softened for
    stainTime: 2.2, // seconds to be dusted fully gold
    stainAmount: 0.85, // 0..1 how gold they end up
    stainMotes: 30, // per second of pollen settling on each sleeper
    colorStain: '#b08a2a', // the body, dusted
    colorStainRim: '#ffe066', // its rim
    stainRimGlow: 1.6,
    colorStainEdge: '#ffd84a', // the burn edge when it goes
    stainEdgeGlow: 5,
    stainEdgeWidth: 0.12
  }
};
