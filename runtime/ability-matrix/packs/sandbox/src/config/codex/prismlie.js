/**
 * Prism Lie — Arcane, line cast.
 *
 * Three crystal prisms split out of one in the caster's hand — one cyan, one
 * magenta, one gold — and fly down the same line braided round each other,
 * spinning, glitching, strung together by crackling threads of light and
 * burning three braided streaks into the floor. They disagree about where
 * they are going. At the end two of them are revealed as lies: they veer off,
 * stutter and pop into glitter. The true one plants itself on the target and
 * shatters into a spray of spectral glass and a rainbow shock ring.
 *
 * Data only. PrismLieAbility reads every field live.
 */
export default {
  id: 'prismlie',
  meta: {
    label: 'Prism Lie',
    accent: '#d5dbff',
    key: '',
    element: 'arcane',
    hint: 'Arcane — three prisms braid down the line; two are lies, one shatters on the target',
    cast: 'line',
    glyph: '<path d="M50 10L60 26V74L50 90L40 74V26Z"/><path d="M24 30L30 40V66L24 76L18 66V40Z"/><path d="M76 30L82 40V66L76 76L70 66V40Z"/>'
  },
  settings: {
    // ---- the cast ----
    range: 18, // max cast distance (m)
    minRange: 2,
    speed: 15, // the prisms fly at (m/s)
    lifetime: 1.0, // the shattered glass lingers for (s)
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
    prismHeight: 1.25, // body (m)
    prismRadius: 0.32, // circumradius (m)
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
    trailWidth: 0.07, // m
    trailGlow: 1.4,
    trailDecay: 9, // dims over this many metres behind the front
    trailFade: 0.8, // burns out over (s)

    // ---- 5 · the reveal ----
    revealTime: 0.42, // the lies veer and pop; the truth plants (s)
    veerDistance: 2.6, // the lies swerve this far off the line (m)
    veerForward: 1.6, // and carry on this far past the end (m)
    plantFlash: 2.5, // the truth flares before it breaks
    popGlitch: 0.5, // the lies stutter this hard as they go (m)

    // ---- 6 · shards ----
    shardCount: 54, // the truth breaks into
    falseShards: 12, // each lie breaks into
    shardSize: 0.32, // m
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
    burstRadius: 2.4,
    burstLife: 0.45,
    colorBurstA: '#ffffff',
    colorBurstB: '#d5dbff',
    colorBurstC: '#ff9ad5',
    shockRadius: 6,
    shockLife: 0.6,
    colorShockA: '#d5dbff',
    colorShockB: '#ffffff',
    shatterShake: 0.45,
    shatterFlash: 0.45,
    colorFlash: '#e8ecff',
    shatterLight: 34,

    // ---- light ----
    lightColor: '#ffffff',
    lightIntensity: 9,
    lightRadius: 10,
    lightFlicker: 0.3
  }
};
