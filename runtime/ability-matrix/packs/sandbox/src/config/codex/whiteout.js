/**
 * Whiteout Needle — Frost — a whiteout rolls down the line overhead and rains
 * icicles point-first along it, pinning what it reaches to the floor.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension and time below is resolved per frame by
 * `WhiteoutNeedleAbility`, so dragging any of it in the editor re-shapes a
 * storm that is already falling.
 */
export default {
  id: 'whiteout',
  meta: {
    label: 'Whiteout Needle',
    accent: '#f4fbff',
    key: '',
    element: 'frost',
    hint: 'Frost — a whiteout rolls down the line and rains icicles point-first, pinning what it reaches to the floor',
    cast: 'line',
    glyph: `<path d="M14 26C14 16 30 12 38 18C44 8 64 8 70 18C82 14 92 22 88 32H12Z"/><path d="M26 40L34 82M44 40L52 90M62 40L70 76M80 40L86 66"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 26, // how fast the storm front runs down the line, metres/second
    lifetime: 1.3, // seconds the icicles and the snow take to sublime away
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 0, // a line cast — unused, kept for the shared aim code

    /* --- light --- */
    lightColor: '#9fcaf0',
    lightIntensity: 5, // the storm's glow (the light rides the front)
    lightRadius: 9,

    /* ================================================================ */
    /* TIMING                                                            */
    /* ================================================================ */
    fallTime: 0.3, // seconds an icicle takes to fall from the cloud
    volleyTime: 0.45, // seconds the last volley at the end takes to land
    holdTime: 1.0, // seconds the field of icicles stands before it sublimes

    /* ================================================================ */
    /* 1 · THE ICICLES                                                   */
    /* ================================================================ */
    needleCount: 84, // down the line (max 160)
    laneWidth: 1.5, // metres either side of the line they land in
    laneStart: 2.5, // metres ahead of the caster the storm begins, so it never buries them
    needleLength: 1.7, // metres, longest
    needleWidth: 0.12, // metres at the root
    needleJitter: 0.45, // 0..1 length variety
    embed: 0.3, // share of its length driven into the floor
    slant: 0.42, // radians from vertical — they come down leaning down the line
    slantJitter: 0.3, // radians of variety
    fallStretch: 1.8, // × length while falling (a streak)
    quiverAmp: 0.12, // radians it shudders when it lands
    quiverFreq: 26, // shudders per second (× 2π)
    quiverDamp: 7, // how fast the shudder dies
    iceEnv: 0.15, // sky reflection
    iceRimGlow: 0.5,
    iceCoreGlow: 0.25,
    trailGlow: 1.0, // the burning root while it falls
    landGlow: 1.2, // the flash as it strikes
    colorIce: '#2c5a91', // saturated body of the ice
    colorIceMilk: '#5d8cc2', // pale tint at the milky root
    colorIceGlow: '#7fb6ea', // the hot stop (HDR only in glow terms)

    /* the last volley at the end of the line */
    volleyCount: 18, // max 32
    volleyRadius: 1.5, // metres round the end point
    volleyLength: 2.2, // metres — the big ones

    /* ================================================================ */
    /* 2 · THE CLOUD                                                     */
    /* ================================================================ */
    cloudHeight: 2.3, // metres off the floor (low enough to sit in the 8 m chase shot)
    cloudWidth: 5.5, // metres across
    cloudStart: 6, // metres ahead of the caster it begins (behind them it blocks the camera)
    cloudLead: 3, // metres it runs ahead of the front
    cloudBillow: 1.0, // metres the belly hangs down
    cloudTower: 1.3, // metres the heaped upper shell rises over the belly — the cloud's body in frame
    cloudTowerShade: 0.8, // 0..1 how dark the heaped shell's foot is (only its crests catch light)
    cloudScale: 0.35, // billows per metre
    cloudWind: 1.6, // metres/second the billows roll down the line
    cloudOpacity: 1.0,
    colorCloudBelly: '#14284a', // deep navy belly
    colorCloudLit: '#6a8cb8', // steel-blue lit lobes

    /* ================================================================ */
    /* 3 · THE SNOW                                                      */
    /* ================================================================ */
    snowRate: 700, // streaks per second under the front
    snowSpeed: 16,
    snowSize: 0.04,
    snowLifetime: 0.45,
    snowStretch: 0.7,
    snowSpan: 5, // metres of line behind the front it falls on
    flakeRate: 260, // slow flakes over the whole storm
    flakeSize: 0.05,
    flakeLifetime: 1.6,
    colorSnowA: '#b9d4f0',
    colorSnowB: '#9fc0e2',
    colorSnowC: '#5f8fc0',
    colorSnowD: '#16294a',

    /* ================================================================ */
    /* 4 · THE SNOWED FLOOR                                              */
    /* ================================================================ */
    driftStreak: 1, // how hard the wind combs it
    driftEdgeGlow: 0.8, // the powdery leading edge
    driftSparkle: 1.2,
    driftOpacity: 0.85,
    colorSnow: '#45699a', // the drift's steel-blue body
    colorSnowShade: '#0c1a33', // deep navy troughs
    colorSnowCrest: '#9dbde0', // only the combed crests go pale
    driftWind: 1.6, // metres/second the combed streaks keep running down the line

    /* ================================================================ */
    /* 5 · STRIKES                                                       */
    /* ================================================================ */
    puffCount: 3, // snow puffs per icicle strike
    puffSize: 0.55,
    puffSpeed: 1.6,
    puffLifetime: 1.0,
    puffOpacity: 0.22, // low: seen down the line, the puffs of every strike stack up
    chipCount: 6, // ice chips per strike
    chipSpeed: 4.5,
    chipSize: 0.08,
    chipLifetime: 0.7,
    chipGravity: -14,
    strikeDecalEvery: 3, // a frost decal under every nth strike
    strikeDecalRadius: 0.45,
    frostDecalIntensity: 0.25, // the frost decal under a strike: low, so the lane stays navy
    colorFrostDecal: '#1f3c66', // the frost decal's body (its edge takes the ice colour)
    hazeRate: 18, // ground blizzard rolling with the front
    colorPuffA: '#a9c6e6',
    colorPuffB: '#5a80ad',
    colorPuffC: '#29466f',
    colorPuffD: '#14274a',
    coldWarp: 0.12, // cold air shimmer over the lane (kept low: higher smears the icicles into a white sheet)
    coldScale: 1.2,

    /* ================================================================ */
    /* 6 · BODIES                                                        */
    /* ================================================================ */
    hitRadius: 1.6, // metres either side of the line a body is caught
    hitImpulse: 2.5, // forward, down the line
    hitLift: 0.6,
    hitSpin: 0.4,
    pinJoint: 'Spine1', // the joint nailed to the floor
    pinHeight: 0.3, // metres off the floor it is held at
    pinStiffness: 0.9,
    pinNeedles: 3, // icicles per pinned body
    frostTint: 0.6,
    colorBodyFrozen: '#6f98c8',
    colorBodyRim: '#e8f8ff',
    bodyRimGlow: 1.0,
    colorBodyEdge: '#ffffff',
    bodyEdgeGlow: 1.1,

    /* ================================================================ */
    /* 7 · THE BEAT                                                      */
    /* ================================================================ */
    strikeShake: 0.05, // per strike
    stormRumble: 0.12, // while the front runs
    volleyShake: 0.45,
    volleyFlash: 0.18,
    volleyLight: 18,
    colorFlash: '#8fc4f0',
    burstRadius: 2.4,
    burstLife: 0.6,
    colorShockA: '#4f86c0',
    colorShockB: '#8fb8e6',
    shockRadius: 4,
    shockLife: 0.5,

    /* ================================================================ */
    /* 8 · THE BLIZZARD (the storm's vertical body)                      */
    /* ================================================================ */
    blizzardHeight: 3.6, // metres the blowing snow stands off the floor
    blizzardWidth: 0.6, // metres either side beyond the lane
    blizzardDensity: 2.0, // how thick it blows
    blizzardScale: 0.75, // noise cells per metre
    blizzardWind: 5.5, // metres/second it rides down the line
    blizzardGust: 0.35, // slow thick pulses running down the line
    blizzardStreakGlow: 0.9, // the white driving streaks inside it
    blizzardOpacity: 0.85,
    lingerHazeRate: 26, // puffs/second of ground blizzard over the whole lane while the field stands
    colorBlizzardCore: '#eef7ff', // driving streaks only
    colorBlizzardPale: '#5a81b2', // where it thins
    colorBlizzardBody: '#1e3d6c', // steel-blue body
    colorBlizzardDeep: '#0a1631' // thick and low: deep navy
  }
};
