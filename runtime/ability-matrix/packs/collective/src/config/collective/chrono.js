/**
 * Chrono Fracture — Time — a clockwork sphere that freezes, then shatters time.
 *
 * Collective Originals data block: presentation (`meta`) and the live settings
 * the ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * A gyroscope of gold rings is thrown to the circle and opens into a sphere of
 * stopped time. Everything inside is held for `lifetime`; then cracks race
 * across the shell, it shatters, and time comes back all at once.
 */
export default {
  id: 'chrono',
  meta: {
    label: "Chrono Fracture",
    accent: '#f5d27a',
    key: 'U',
    hint: "Time — a clockwork sphere that freezes, then shatters time",
    cast: 'zone',
    glyph: `<circle cx="50" cy="50" r="34"/><path d="M50 26V50L66 60"/><path d="M50 10V16M50 84V90M10 50H16M84 50H90"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 16, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 30, // how fast the gyroscope flies to the circle, metres/second
    lifetime: 2.2, // seconds time stays frozen before the sphere fractures
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 3.2, // the circle the aim indicator measures out, metres
    fadeTime: 1.4, // seconds from the shatter until the last shard has gone
    handHeight: 1.45, // metres off the floor the gyroscope leaves the hand at
    seedSize: 0.16, // the flying gyroscope, × sphere radius

    /* --- the sphere --- */
    sphereScale: 1.0, // sphere radius, × zoneRadius
    sphereLift: 1.1, // metres its centre sits above the floor
    openTime: 0.55, // seconds for the rings to unfold to full size
    openStagger: 0.08, // seconds between one ring unfolding and the next

    /* ================================================================ */
    /* 1 · THE RINGS                                                     */
    /* ================================================================ */
    ringCount: 4, // concentric rings (max 5)
    ringInner: 0.52, // innermost ring radius, × sphere radius
    ringOuter: 0.98, // outermost, × sphere radius
    ringTube: 0.045, // tube radius, metres (rebuilds the rings)
    ringBand: 2.6, // band width along the ring's axis, × the tube
    ringTilt: 0.62, // radians each ring's axis is tipped from the last
    ringSpin: 0.9, // rad/s the outer ring turns
    ringSpinSpread: 0.55, // each ring inward turns this much faster, and alternates direction
    ringFreeze: 0.2, // the rings grind down to this fraction of their speed as the shell cracks
    ringScatter: 2.2, // at the shatter the rings fly out to × their radius
    ringTicks: 60, // engraved tick marks round each ring
    ringTickDepth: 0.55, // how dark an engraving is
    ringTickWidth: 0.12, // tick width, fraction of one tick cell
    ringNumerals: 12, // numeral groups round each ring
    ringEngraveGlow: 2.4, // light trapped in the engravings
    ringMetal: 1.0, // how much of the sky the gold reflects
    ringGloss: 70, // highlight tightness
    ringSpecular: 2.2,
    ringFresnel: 1.2,
    ringPulse: 0.6, // the engravings brighten with each tick of the second hand

    /* ================================================================ */
    /* 2 · THE CLOCK FACE (floor)                                        */
    /* ================================================================ */
    clockRadius: 1.05, // × sphere radius
    clockLine: 0.02, // stroke half-width, metres
    clockGlowWidth: 0.08, // glow round strokes, metres
    clockTicks: 60,
    clockGear: 0.42, // the inner gear ring, × radius
    clockGearTeeth: 24,
    clockHourSpeed: 0.35, // rad/s of the hour hand
    clockMinuteSpeed: 2.2, // rad/s of the minute hand
    clockSecondSpeed: 2.1, // rad/s of the second hand
    clockHandSteps: 12, // jumps per revolution of the second hand
    clockTickStep: 1.0, // 1 = the second hand ticks in jumps, 0 = smooth sweep
    clockSweep: 0.9, // radians of glowing wedge behind the second hand
    clockSweepGlow: 0.6,
    clockCoreGlow: 2.6,
    clockHaloGlow: 0.8,
    clockOpacity: 1.0,
    clockHeight: 0.015, // metres above the floor

    /* ================================================================ */
    /* 3 · THE GLASS                                                     */
    /* ================================================================ */
    shardCount: 26, // glass shards suspended inside (max 40)
    shardSize: 0.32, // metres
    shardSizeJitter: 0.45,
    shardFill: 0.78, // how far out they hang, × sphere radius
    shardDrift: 0.12, // metres they bob while suspended
    shardTurn: 0.25, // rad/s they turn while suspended (time is slow)
    fragCount: 64, // shell fragments at the shatter (max 96)
    fragSize: 0.42,
    fragSpeed: 7.5, // m/s the shell is blown out at
    fragGravity: -9.5,
    fragTumble: 7.0, // rad/s they tumble once free
    fragLife: 1.2, // seconds a fragment lives (× the fade)
    glassOpacity: 0.45,
    glassFresnel: 2.2,
    glassEnv: 1.2,
    glassIridescence: 0.7, // thin-film colour in the rims
    glassCaustic: 0.8, // bright lines through the body
    glassGlow: 1.0,

    /* ================================================================ */
    /* 4 · THE SHELL                                                     */
    /* ================================================================ */
    shellOpacity: 0.32,
    shellFresnel: 2.4, // rim power
    shellGlow: 1.4,
    shellHex: 0.35, // the faint lattice over it
    shellHexScale: 7.0,
    crackTime: 0.65, // seconds before the shatter the cracks start
    crackScale: 4.5, // cells across the shell
    crackWidth: 0.04,
    crackGlow: 5.0,
    crackJag: 0.25, // how jagged the crack lines are

    /* ================================================================ */
    /* 5 · MOTES & LENS                                                  */
    /* ================================================================ */
    moteRate: 45, // slow drifting motes/s inside the sphere
    moteSize: 0.06,
    moteLifetime: 2.6,
    moteDrift: 0.25, // m/s
    lensStrength: 0.9, // the time eddy bending the frame
    lensReach: 1.15, // × sphere radius
    lensSwirl: 0.6,
    lensRipple: 0.5, // ripples running through the warp
    lensShock: 2.0, // the outward pulse at the shatter

    /* ================================================================ */
    /* 6 · THE HOLD & THE SHATTER                                        */
    /* ================================================================ */
    holdReach: 1.0, // bodies inside this × sphere radius are held
    holdStain: 0.55, // how far a held body is tinted by stopped time, 0..1
    holdStainTime: 0.5, // seconds for that tint to take
    holdRimGlow: 2.5, // a held body's rim, burning gold
    killImpulse: 9.0, // m/s bodies are thrown out at
    killLift: 4.5,
    killSpin: 1.4,
    shockRadius: 7.5, // the shockwave ring at the shatter, metres
    shockLife: 0.7,
    burstRadius: 4.0,
    burstLife: 0.45,
    sparkCount: 160,
    sparkSpeed: 14,
    sparkSize: 0.06,
    sparkLifetime: 0.55,
    glitterCount: 220, // glints of glass hanging in the air after
    glitterSize: 0.05,
    glitterLifetime: 1.3,
    shatterFlash: 0.95,
    shatterShake: 0.7,
    openShake: 0.15,
    tickShake: 0.03, // a tiny knock on every tick of the second hand
    shatterLight: 9,

    /* --- light --- */
    lightColor: '#f5d27a',
    lightIntensity: 6,
    lightRadius: 9,

    /* --- palette --- */
    colorGold: '#e8b54a',
    colorGoldDeep: '#6a4310',
    colorEngrave: '#ffd27a',
    colorGoldSpec: '#fff4d6',
    colorClockCore: '#ffe3a0',
    colorClockGlow: '#e0a030',
    colorClockSweep: '#7ad8ff',
    colorGlass: '#bfe8ff',
    colorGlassRim: '#ffffff',
    colorShell: '#ffd98a',
    colorShellRim: '#9fdcff',
    colorCrack: '#ffffff',
    colorCrackHot: '#ffcf6a',
    colorStain: '#3a3324',
    colorStainRim: '#ffd27a',
    colorFlash: '#fff0c8',
    colorShockHot: '#ffffff',
    colorShockBody: '#f5d27a',
    colorMoteA: '#ffffff',
    colorMoteB: '#ffe6a8',
    colorMoteC: '#9fdcff',
    colorMoteD: '#40608a',
    colorSparkA: '#ffffff',
    colorSparkB: '#fff0c0',
    colorSparkC: '#f5c050',
    colorSparkD: '#80501a'
  }
};
