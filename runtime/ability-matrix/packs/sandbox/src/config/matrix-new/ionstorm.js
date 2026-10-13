/**
 * Ion Storm Pillar — Plasma — a pillar of ionised light ringed by rotating bolts.
 *
 * Matrix New data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 */
export default {
  id: 'ionstorm',
  meta: {
    label: "Ion Storm Pillar",
    accent: '#7af0ff',
    key: 'Z',
    hint: "Plasma — a column of ionised light slams down; its bolts strike the floor around it",
    cast: 'zone',
    glyph: `<path d="M44 10H56V90H44Z"/><path d="M30 30L18 44L30 50L20 64"/><path d="M70 30L82 44L70 50L80 64"/><path d="M16 88H84"/>`
  },
  /**
   * A storm in three beats. The column **slams** down out of the sky onto the
   * circle; it **stands** with bolts crawling round its skin and lashing out to
   * strike the floor around it — every strike kills what it lands near; then
   * it **implodes**, pinched to a thread and gone in one flash.
   *
   * The pillar is an open cylinder shaped entirely in its vertex stage, and
   * every bolt lives in one pre-allocated ribbon buffer, so every number below
   * is live while the column stands.
   */
  settings: {
    /* --- the cast --- */
    "range": 18,
    "minRange": 0,
    "speed": 15, // m/s the charge runs along the floor to the circle
    "lifetime": 3.4, // seconds the pillar stands
    "cooldown": 0.55,
    "castAnim": "cast2",
    "zoneRadius": 5, // metres — the circle the bolts strike inside

    /* --- timing --- */
    slamTime: 0.22, // seconds for the column to come down from the sky
    implodeTime: 0.45, // seconds for it to pinch to nothing
    fadeTime: 1.0, // seconds for the floor and the sparks to die

    /* --- the column --- */
    pillarRadius: 0.75, // metres
    pillarHeight: 16, // metres
    footFlare: 0.7, // how much wider the foot is than the trunk
    writhe: 0.12, // how much the wall bulges with noise, × radius
    writheScale: 1.4,
    writheSpeed: 3.0,
    kink: 0.25, // metres the axis wanders
    topFade: 0.45, // fraction of the column the top fades over
    pillarSoftFade: 0.3,

    /* --- the plasma shader --- */
    pillarIntensity: 2.6,
    pillarOpacity: 0.95,
    coreSharpness: 3.0, // higher = a narrower white core
    coreGlow: 2.0,
    bandDensity: 0.55, // plasma bands per metre
    bandSpeed: 9, // metres/second they race upward
    bandSharpness: 5, // higher = thinner, harder bands
    bandGlow: 1.8,
    plasmaNoise: 0.7, // how much turbulence tears the bands
    plasmaNoiseScale: 1.3,
    plasmaNoiseSpeed: 3.0,
    fresnel: 1.6,
    fresnelPower: 2.4,
    colorCore: '#ffffff',
    colorBand: '#9ff6ff',
    colorEdge: '#2a7cff',

    /* --- the corona sheath --- */
    shellScale: 1.8, // × pillar radius
    shellIntensity: 1.6,
    shellOpacity: 0.6,

    /* --- orbiting arcs (crawling round the skin) --- */
    orbitCount: 4, // arcs (max 6)
    orbitSpeed: 2.4, // radians/second they wheel round the column
    orbitSpan: 1.6, // radians each arc covers round the column
    orbitBulge: 0.9, // metres the arc bows out from the skin
    orbitLow: 0.08, // lowest point, × column height
    orbitHigh: 0.55, // highest point, × column height
    orbitReroll: 0.07, // seconds between re-rolls of an arc's shape
    orbitLevel: 0.85, // brightness of an arc

    /* --- strikes (lashing out to the floor) --- */
    strikeRate: 3.2, // strikes per second
    strikeInner: 0.3, // nearest a strike lands, × circle radius
    strikeOuter: 1.0, // farthest, × circle radius
    strikeLaunchLow: 0.15, // where on the column a strike leaves, × height
    strikeLaunchHigh: 0.45,
    strikeArch: 0.12, // how much a strike bows upward, × its length
    strikeGrowTime: 0.06, // seconds for a strike to race to the floor
    strikeLife: 0.32, // seconds a strike hangs
    strikeReroll: 0.05, // seconds between re-rolls while it hangs
    seekChance: 0.6, // chance a strike seeks a body in the circle
    lifeJitter: 0.35,

    /* --- bolt shape --- */
    boltSegments: 22, // points on a channel (max 26)
    boltJag: 0.14, // excursion, × length
    boltJagMax: 1.2, // metres, cap on that
    boltKink: 0.25, // fine per-point kink, × segment
    boltForks: 2, // forks per bolt (max 2)
    boltForkLength: 0.35, // × bolt length
    boltForkSpread: 0.7, // radians
    boltForkWidth: 0.55, // × main width
    boltForkBright: 0.7,

    /* --- bolt shader --- */
    boltWidth: 0.32, // glow half-width, metres
    boltCoreWidth: 0.035, // white core half-width, metres
    boltFalloff: 2.4,
    boltHeadLength: 0.12, // hot head on the growth front, along 0..1
    boltHeadGlow: 2.5,
    boltIntensity: 4.5,
    boltOpacity: 1.0,
    boltFlicker: 0.55,
    boltFlickerRate: 28,
    boltCrackle: 18, // pieces a dying bolt tears into
    boltCrawl: 0.45,
    boltCrawlScale: 14,
    boltCrawlSpeed: 9,
    colorBoltCore: '#ffffff',
    colorBoltGlow: '#8ff3ff',
    colorBoltEdge: '#3a6cff',

    /* --- each strike landing --- */
    strikeKillRadius: 1.1, // metres from a strike a body dies
    arcDecalRadius: 1.3,
    arcDecalLife: 1.4,
    colorArcDecalA: '#7af0ff',
    colorArcDecalB: '#ffffff',
    strikeSparks: 26,
    strikeSparkSpeed: 7,
    strikeFlare: 1.2, // radius of the floor flare round a strike, metres
    strikeFlareLife: 0.5, // seconds it cools over
    strikeShake: 0.08,
    strikeLight: 8, // added to the light per strike
    hitImpulse: 6.5,
    hitLift: 4.5,
    hitSpin: 2.0,

    /* --- sparks (STREAK, additive) --- */
    sparkSize: 0.06,
    sparkLifetime: 0.35,
    sparkGravity: -9,
    sparkStretch: 0.3,
    sparkGlow: 2.6,
    colorSparkA: '#ffffff',
    colorSparkB: '#a8f8ff',
    colorSparkC: '#4aa8ff',
    colorSparkD: '#1a2a8a',

    /* --- ionised motes spiralling up the column (SOFT, swirl) --- */
    moteRate: 70,
    moteSize: 0.06,
    moteRise: 2.4,
    moteSwirl: 2.8, // radians/second they orbit
    moteLifetime: 1.4,
    moteGlow: 2.2,
    colorMoteA: '#ffffff',
    colorMoteB: '#9ff6ff',
    colorMoteC: '#4a8cff',
    colorMoteD: '#101a5a',

    /* --- the ionised floor --- */
    groundOpacity: 1.0,
    poolRadius: 1.4, // hot pool round the base, metres
    poolGlow: 1.8,
    ringWidth: 0.06,
    ringGlow: 2.2,
    arcGlow: 2.2, // crawling arcs over the circle
    arcScale: 1.8,
    arcSharpness: 12, // higher = thinner filaments
    arcSpeed: 0.7, // how fast they race round
    arcDensity: 0.65, // fraction of the circle crawling at once
    strikeGlow: 3.0,
    revealTime: 0.3, // seconds for the ring to draw on
    colorRing: '#7af0ff',
    colorArc: '#6fd8ff',

    /* --- the slam --- */
    slamBurstSize: 3.2,
    slamBurstLife: 0.45,
    slamRingRadius: 6.5,
    slamShake: 0.4,
    slamFlash: 0.25,
    slamLight: 24,
    dustCount: 30, // dust kicked off the floor
    dustSize: 1.0,
    dustLifetime: 1.2,
    colorDustA: '#9aa8b8',
    colorDustB: '#6a7280',
    colorDustC: '#4a4e56',
    colorDustD: '#2a2c30',
    standRumble: 0.03, // continuous shake while it stands

    /* --- the implosion --- */
    implodeBurstSize: 4.0,
    implodeBurstLife: 0.5,
    implodeBurstIntensity: 3.2,
    implodeRingRadius: 8,
    implodeSparks: 140,
    implodeSparkSpeed: 12,
    implodeShake: 0.5,
    implodeFlash: 0.45,
    implodeLight: 40,
    colorBurstA: '#ffffff',
    colorBurstB: '#7af0ff',
    colorBurstC: '#2a4aff',
    colorFlash: '#c8faff',

    /* --- the warp (LAYER.DISTORTION) --- */
    warpStrength: 0.7,
    warpWidth: 3.2, // × pillar radius
    warpHeight: 0.6, // × column height
    warpSkin: 0.35, // where across the quad it bends hardest, 0..1
    warpScale: 1.6,
    warpSpeed: 2.5,

    /* --- the charge (travel) --- */
    callSparks: 220, // sparks per second along the floor

    "colorA": "#7af0ff",
    "colorB": "#ffffff",
    "lightColor": "#7af0ff",
    "lightIntensity": 6,
    "lightRadius": 9,
    lightHeight: 2.2, // metres up the column the light sits
    lightStrobe: 0.35 // how hard the light strobes
  }
};
