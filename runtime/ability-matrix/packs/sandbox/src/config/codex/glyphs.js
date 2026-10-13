/**
 * Glyph Barrage — Arcane — a chain of sigils stamped down the line that then
 * detonates one after another into pillars of arcane light.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so `settings.js`
 * can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `GlyphBarrageAbility`: the
 * sigils are drawn by one SDF shader that reads its rings, ticks and runes from
 * these values, so dragging a ring or a rotation speed redraws glyphs that are
 * already on the floor.
 */
export default {
  id: 'glyphs',
  meta: {
    label: "Glyph Barrage",
    accent: '#7c8cff',
    key: '',
    element: 'arcane',
    hint: "Arcane — sigils stamp themselves down the line, then detonate one after another",
    cast: 'line',
    glyph: `<circle cx="22" cy="70" r="13"/><circle cx="50" cy="50" r="13"/><circle cx="78" cy="30" r="13"/><path d="M22 61L28 75H16Z"/><path d="M50 41L56 55H44Z"/><path d="M78 21L84 35H72Z"/><path d="M78 8V2"/><path d="M78 52V58"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 20, // maximum cast distance, metres
    minRange: 3, // closer than this and the cast is refused
    speed: 14, // how fast the stamping runs down the line, metres/second
    lifetime: 1.6, // seconds the spent glyphs take to fade out ring by ring
    cooldown: 0.9, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#7c8cff',
    lightIntensity: 6, // the steady glow riding the newest glyph / the detonation
    lightRadius: 8,
    lightFlicker: 0.25, // 0..1 arcane crackle
    lightHeight: 1.4, // metres above the floor

    /* ================================================================ */
    /* 0 · THE CHAIN — how many, where, and in what order                */
    /* ================================================================ */
    glyphCount: 6, // sigils stamped down the line (up to 12)
    firstAt: 2.6, // metres from the caster the first one lands
    minSpacing: 1.6, // closest two may sit — a short cast stamps fewer
    stampTime: 0.2, // seconds each one takes to punch in
    stampOvershoot: 0.35, // how far past full size it punches before settling
    stampRing: 1.55, // × radius the small ring flash runs out to as it lands
    holdTime: 0.4, // seconds the full chain charges before the first detonation
    chainInterval: 0.15, // seconds between one detonation and the next
    chainOrder: 0, // 0 = from the far end back toward the caster, 1 = outward from the caster
    jitter: 0.25, // metres each glyph strays off the line

    /* ================================================================ */
    /* 1 · THE SIGIL — the SDF rune circle on the floor                  */
    /* ================================================================ */
    glyphRadius: 1.1, // metres, outer ring
    lineWidth: 0.022, // metres, the white-hot strokes
    haloWidth: 0.06, // metres, the coloured glow round them
    lineGlow: 2.0, // brightness of the strokes (bloom > 1)
    haloGlow: 0.4, // brightness of the glow
    fillGlow: 0.25, // faint wash inside the circle
    runeCount: 18, // runes round the band
    runeBand: 0.17, // band width, × radius
    tickCount: 72, // radial ticks on the tick ring
    starPoints: 3, // the inner star is two overlapping n-gons
    spokeCount: 8, // dashed spokes between the rings
    spinOuter: 0.25, // rad/s the rune band turns
    spinStar: -0.6, // rad/s the inner star turns
    spinCore: 1.1, // rad/s the inner square turns
    chargePulse: 1.6, // how hard the chain throbs while it charges
    chargeRate: 9, // throbs per second (rad/s)
    spentDim: 0.35, // how bright a detonated glyph stays
    fadeSoftness: 0.18, // how soft each ring's fade is
    glyphLift: 0.016, // metres off the floor
    colorLine: '#f4f2ff', // white-hot strokes
    colorGlyph: '#7c8cff', // blue-violet glow
    colorDeep: '#5a2dff', // the deeper violet of the wash and the runes
    colorRune: '#b49cff', // the rune band

    /* ================================================================ */
    /* 2 · RUNE FRAGMENTS — floating above each glyph                     */
    /* ================================================================ */
    runesPerGlyph: 7, // floating fragments per glyph (up to 10)
    runeSize: 0.26, // metres
    runeHeight: 0.9, // metres they float at
    runeOrbit: 0.6, // rad/s they circle
    runeBob: 0.12, // metres they bob
    runeGlow: 2.4,
    runeRise: 7, // m/s they are flung up the pillar
    colorRuneFrag: '#c9b8ff',

    /* ================================================================ */
    /* 3 · THE PILLAR — arcane light erupting from each glyph            */
    /* ================================================================ */
    pillarRadius: 0.75, // metres
    pillarHeight: 9, // metres
    pillarFlare: 0.9, // how much wider the base flares
    pillarTime: 0.9, // seconds each pillar stands
    pillarRise: 0.1, // seconds it takes to shoot to full height
    pillarGlow: 1.6, // brightness
    pillarCore: 1.25, // white-hot core strength
    pillarStreaks: 10, // light streaks round it
    pillarStreakSpeed: 6, // how fast they race up
    pillarFresnel: 2.2, // edge brightening
    pillarSoftFade: 0.5, // soft contact with the floor, metres
    colorPillarCore: '#ffffff',
    colorPillarA: '#9aa6ff',
    colorPillarB: '#6a3dff',

    /* ================================================================ */
    /* 4 · DISTORTION — the air bent round each pillar                   */
    /* ================================================================ */
    warpStrength: 0.9,
    warpWidth: 1.8, // × pillar radius
    warpScale: 2.2,
    warpSpeed: 5,

    /* ================================================================ */
    /* 5 · THE SHOCKWAVE — a ring that leaves each glyph as it erupts    */
    /* ================================================================ */
    shockReach: 2.4, // × glyph radius the ring travels
    shockTime: 0.45, // seconds it takes
    shockWidth: 0.08, // metres
    shockGlow: 3,
    decalShock: 1, // strength of the engine shockwave decal
    burstSize: 2.2, // metres — the ionised shell at each eruption
    burstIntensity: 1.1,
    colorShock: '#c4b6ff',
    colorBurstA: '#e6e0ff',
    colorBurstB: '#7c8cff',
    colorBurstC: '#3a1aa8',

    /* ================================================================ */
    /* 6 · PARTICLES                                                     */
    /* ================================================================ */
    /* --- rune shards, thrown out of each eruption --- */
    shardCount: 34,
    shardSize: 0.11,
    shardSpeed: 9,
    shardLifetime: 1.1,
    shardGravity: 9,
    shardGlow: 2.2,
    colorShardA: '#ffffff',
    colorShardB: '#b49cff',
    colorShardC: '#7c8cff',
    colorShardD: '#2a1470',
    /* --- motes, rising off charged glyphs --- */
    moteRate: 20, // per second per glyph
    moteSize: 0.06,
    moteRise: 1.4,
    moteLifetime: 1.2,
    moteGlow: 1.8,
    colorMoteA: '#e6e0ff',
    colorMoteB: '#9aa6ff',
    colorMoteC: '#6a3dff',
    colorMoteD: '#1a0c50',
    /* --- streaks racing up each pillar --- */
    streakCount: 40,
    streakSize: 0.05,
    streakSpeed: 16,
    streakLifetime: 0.5,
    streakStretch: 0.6,
    streakGlow: 2.6,
    colorStreakA: '#ffffff',
    colorStreakB: '#c4b6ff',
    colorStreakC: '#7c8cff',
    colorStreakD: '#3a1aa8',
    /* --- halo rings climbing each pillar --- */
    ringCount: 3, // per eruption
    ringSize: 3.2, // × pillar radius
    ringRise: 6, // m/s they climb
    ringLifetime: 0.45,
    ringGlow: 2.2,
    colorRingA: '#ffffff',
    colorRingB: '#9aa6ff',
    colorRingC: '#6a3dff',
    colorRingD: '#1a0c50',

    /* ================================================================ */
    /* 7 · THE LEY LINE — the thread that binds the chain               */
    /* ================================================================ */
    leyWidth: 0.05, // metres
    leyGlow: 1.6,
    leyDash: 2.5, // dashes per metre
    leyPulse: 5, // pulse speed, m/s
    colorLey: '#9aa6ff',

    /* ================================================================ */
    /* 8 · BEATS & THE BODIES                                            */
    /* ================================================================ */
    stampShake: 0.12, // camera knock per glyph stamped
    stampFlash: 0.05,
    stampLight: 0.8, // light punch per stamp, × intensity
    eruptShake: 0.32, // camera knock per detonation
    eruptFlash: 0.14,
    eruptLight: 2.2, // light punch per detonation, × intensity
    colorFlash: '#9aa6ff',
    catchRadius: 1.05, // × glyph radius a body must be inside to be taken
    markTint: 0.55, // 0..1 how far a body standing on a glyph is lit before it erupts
    liftTime: 0.5, // seconds a body is held rising in the pillar
    liftSpeed: 6, // m/s up the pillar
    liftPull: 6, // pull to the pillar's axis (1/s)
    liftSpin: 2.5, // m/s round the axis
    liftGrab: 9, // how fast the pillar takes hold (1/s)
    liftBuoyancy: 0.9, // 0..1 of its weight the light holds
    liftImpulse: 1, // m/s the eruption knocks a standing body off its feet
    liftKick: 6, // m/s up as it does
    throwUp: 9, // m/s up when the pillar lets go
    throwOut: 4, // m/s outward
    colorMark: '#1a1040', // a marked body
    colorMarkRim: '#9aa6ff',
    markRimGlow: 2.2,
    colorMarkEdge: '#c4b6ff',
    markEdgeGlow: 5
  }
};
