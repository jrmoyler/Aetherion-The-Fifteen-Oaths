/**
 * Prism Lie — Arcane, line cast.
 *
 * Three crystal prisms split out of one in the caster's hand — one cyan, one
 * magenta, one gold — and fly down the same line braided round each other,
 * spinning, glitching, strung together by crackling threads of light and
 * burning three braided streaks into the floor. They disagree about where
 * they are going. At the end two of them are revealed as lies: they veer off,
 * stutter and pop into glitter. The true one is driven into the target and
 * comes up out of a crater of crazed glass as a 3 m monolith of lit crystal,
 * satellites tearing up round it, a rainbow fan sweeping the floor from its
 * foot — then it charges white and shatters into spectral glass.
 *
 * Data only. PrismLieAbility reads every field live.
 */
export default {
  id: 'prismlie',
  meta: {
    label: 'Prism Lie',
    accent: '#d5dbff',
    key: '',
    element: 'illusion',
    hint: 'Arcane — three prisms braid down the line; two are lies, one shatters on the target',
    cast: 'line',
    glyph: '<path d="M50 10L60 26V74L50 90L40 74V26Z"/><path d="M24 30L30 40V66L24 76L18 66V40Z"/><path d="M76 30L82 40V66L76 76L70 66V40Z"/>'
  },
  settings: {
    // ---- the cast ----
    range: 18, // max cast distance (m)
    minRange: 2,
    speed: 18, // the prisms fly at (m/s)
    lifetime: 1.0, // the shattered glass lingers for (s)
    standTime: 1.6, // the planted truth stands for (s) before it breaks
    cooldown: 0.6,
    castAnim: 'cast2',
    colorA: '#d5dbff', // accent
    colorB: '#ffffff', // accent, hot
    truth: -1, // which prism is true: −1 a coin toss, else 0 / 1 / 2

    // ---- 1 · the prisms ----
    colorPrismA: '#3fe6ff', // cyan
    colorPrismB: '#ff4fd8', // magenta
    colorPrismC: '#ffd23f', // gold
    colorCore: '#ffffff',
    prismHeight: 1.5, // body (m)
    prismRadius: 0.4, // circumradius (m)
    prismCap: 0.42, // cap length (× body)
    flightHeight: 1.5, // m
    bob: 0.25, // m
    bobSpeed: 5,
    spinSpeed: 7, // rad/s
    lean: 0.25, // forward lean in flight (rad)
    growTime: 0.18, // the three split out of one over (s)
    bodyGlow: 0.9,
    edgeGlow: 2.4,
    edgeWidth: 0.06, // m
    iridescence: 0.7,
    iridFrequency: 3,
    rimGlow: 1.2,
    glitch: 0.03, // standing slice jitter (m)
    glitchSpike: 0.22, // a stutter (m)
    glitchRate: 3, // stutters per second, per prism

    // ---- 2 · the braid ----
    braidWidth: 1.1, // lateral swing (m)
    braidPitch: 4.5, // one full swap every (m)
    braidRamp: 2.2, // the three fan out of the hand over (m)

    // ---- 3 · tethers ----
    tetherWidth: 0.07,
    tetherJitter: 0.18,
    tetherGlow: 2.2,

    // ---- 4 · trails ----
    trailWidth: 0.16, // m
    trailGlow: 1.6,
    trailDecay: 9, // dims over this many metres behind the front
    trailFade: 0.9, // burns out over (s)

    // ---- 4b · the glass burn (the deep tone on the floor) ----
    scorchWidth: 1.15, // dark band under the braid (× braid swing)
    scorchOpacity: 0.62,
    colorScorch: '#0e0a26', // deep
    craterRadius: 2.2, // crazed-glass crater where the truth went in (m)
    crackGlow: 1.6, // spectral glow in its cracks while the monolith stands

    // ---- 5 · the reveal ----
    revealTime: 0.42, // the lies veer and pop; the truth plants (s)
    veerDistance: 2.6, // the lies swerve this far off the line (m)
    veerForward: 1.6, // and carry on this far past the end (m)
    plantFlash: 2.0, // the truth flares as it drops
    popGlitch: 0.5, // the lies stutter this hard as they go (m)

    // ---- 5b · the plant (impact) ----
    plantShake: 0.38,
    plantScreenFlash: 0.12, // in the truth's hue — restrained
    plantLight: 22, // light punch
    plantShards: 16, // glass chips out of the crater
    plantBurstIntensity: 0.5, // the low dust shell at the plant
    plantBurstOpacity: 0.22,

    // ---- 5c · the monolith (the planted truth, solid lit crystal) ----
    monoHeight: 3.1, // body (m)
    monoRadius: 0.8, // foot circumradius (m)
    monoCap: 0.42, // apex (× body)
    monoTaper: 0.38, // 0 straight .. 1 to a point
    monoTwist: 0.32, // radians foot to top
    monoChamfer: 0.2, // arrises cut away
    monoRise: 0.24, // punches up over (s)
    monoOvershoot: 0.14, // past full height, then springs back
    monoGlow: 0.45, // emissive body in the truth's hue
    monoDeep: 0.12, // albedo = hue × this (the deep tone)
    monoRoughness: 0.12,
    monoMetalness: 0.25,
    monoIrid: 1.1, // spectral sheen
    monoVein: 0.9, // light climbing inside
    monoChargeTime: 0.45, // white charge before it breaks (s)
    monoChargeGlow: 3.0,
    monoShudder: 0.06, // m, while charging
    satCount: 6, // satellite crystals (max 8)
    satRing: 0.95, // m out from the foot
    satHeight: 1.5, // m
    satRadius: 0.3, // m
    satTilt: 0.5, // outward lean (rad)
    satDelay: 0.06, // first one after the plant (s)
    satStagger: 1.0, // the rest spread over (s)
    satGrowTime: 0.28, // each one tears up over (s)
    satGlitter: 26, // puff as each one breaks the floor
    satShake: 0.05,

    // ---- 5d · the spectrum fan ----
    fanLength: 6.5, // m
    fanAngle: 0.42, // half-width of a wedge (rad)
    fanSweep: 0.85, // rad/s round the floor
    fanCount: 2, // wedges (1..3)
    fanGlow: 1.25,
    fanPool: 0.7, // white pool at the foot
    fanRise: 0.3, // comes up over (s)

    // ---- 6 · shards ----
    shardCount: 72, // the truth breaks into
    falseShards: 12, // each lie breaks into
    shardSize: 0.42, // m
    shardSpeed: 7,
    shardLift: 3,
    shardGravity: -9,
    shardSpin: 9,
    shardGlow: 1.6,

    // ---- 7 · glitter & sparks ----
    glitterRate: 90, // shed per prism per second in flight
    glitterSize: 0.06,
    glitterLifetime: 0.7,
    glitterGlow: 2.4,
    glitterBurst: 70, // per pop
    colorGlitterA: '#ffffff',
    colorGlitterB: '#e8ecff',
    colorGlitterC: '#a8b4ff',
    colorGlitterD: '#30387a',
    sparkCount: 50,
    sparkSpeed: 11,
    sparkSize: 0.05,
    sparkLifetime: 0.45,
    sparkStretch: 0.5,
    colorSparkA: '#ffffff',
    colorSparkB: '#dfe4ff',
    colorSparkC: '#ff9ad5',
    colorSparkD: '#3a2a6a',

    // ---- 8 · the shatter ----
    ringRadius: 5.5, // m
    ringWidth: 0.09,
    ringGlow: 2.6,
    ringTime: 0.65, // s
    lensSize: 3.2, // m
    lensStrength: 1.1,
    burstRadius: 2.8,
    burstLife: 0.45,
    burstIntensity: 0.6, // the shell — kept under a whiteout
    burstOpacity: 0.2,
    colorBurstA: '#ffffff',
    colorBurstB: '#d5dbff',
    colorBurstC: '#ff9ad5',
    shockRadius: 6,
    shockLife: 0.6,
    colorShockA: '#d5dbff',
    colorShockB: '#ffffff',
    shatterShake: 0.45,
    shatterFlash: 0.14,
    colorFlash: '#e8ecff',
    shatterLight: 16,

    // ---- light ----
    lightColor: '#ffffff',
    lightIntensity: 9,
    lightRadius: 10,
    lightFlicker: 0.3
  }
};
