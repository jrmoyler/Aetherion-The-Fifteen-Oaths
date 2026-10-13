/**
 * Dune Scourge — Sand — a scouring dune wave rolls down the line.
 *
 * Collective Originals data block: presentation (`meta`) and the live settings
 * the ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `DuneScourgeAbility` and its
 * two shaders — the wave and the ripple bed are drawn from parameter space, so
 * dragging any of these re-shapes a wave that is already running.
 */
export default {
  id: 'dune',
  meta: {
    label: "Dune Scourge",
    accent: '#e8b46a',
    key: 'E',
    hint: "Sand — a scouring dune wave rolls down the line and breaks",
    cast: 'line',
    glyph: `<path d="M12 70C28 52 40 52 52 64S76 74 88 52"/><path d="M12 82H88"/><path d="M30 40l4-4M54 30l4-4M70 42l4-4"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 3, // closer than this and the cast is refused
    speed: 15, // how fast the wave front runs, metres/second
    lifetime: 2.6, // seconds the ripples lie there after the crash
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: "cast1", // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: "#e8b46a",
    lightIntensity: 5, // warm bounce off the sand riding the crest
    lightRadius: 8,

    /* ================================================================ */
    /* 1 · THE WAVE                                                      */
    /* ================================================================ */
    /* --- silhouette (metres) --- */
    waveHeight: 1.9, // crest height once the wave has built
    heightNear: 0.35, // crest height as it leaves the caster
    buildDistance: 4.5, // metres it takes to build to full height
    widthNear: 0.9, // half-width at the caster
    width: 2.6, // half-width at the far end
    lead: 0.9, // metres from the crest down the steep front face
    tail: 3.6, // metres from the crest down the long back slope
    curl: 0.55, // how far the lip overhangs the face, × crest height
    curlSharp: 3.0, // how high up the face the curl starts (bigger = only the very top)
    bow: 0.9, // metres the flanks trail the centre — the crescent of a barchan dune
    edgeTaper: 0.45, // fraction of the half-width over which the flanks slope away
    crestNoise: 0.22, // crest height wobble across the width, fraction
    crestNoiseScale: 0.55, // features per metre in that wobble
    grain: 0.08, // surface grain displacement, metres
    grainScale: 2.6, // features per metre in the grain

    /* --- shading --- */
    colorSandLight: "#e9c58a", // sunlit sand
    colorSandDark: "#9a6a3a", // sand in its own shade
    colorUnderside: "#4b2e18", // the shadowed hollow under the lip
    colorStreak: "#fff0cf", // wind-blown streaks along the back
    undersideDarkness: 0.85, // 0..1 how dark the face under the lip goes
    ambient: 0.42, // light that reaches the shade side
    streakStrength: 0.55, // wind streak brightness
    streakScale: 1.4, // streak frequency across the wave
    streakFlow: 3.2, // how fast the streaks blow back off the crest
    crestGlow: 0.35, // the backlit spray edge along the top of the crest
    waveOpacity: 1.0,
    floorFade: 0.08, // metres of height over which the wave fades into the floor
    softFade: 0.25, // metres — soft intersection against scene geometry

    /* --- the crash --- */
    crashTime: 0.55, // seconds the wave takes to break and fall
    crashRun: 1.6, // metres the wave rolls on past the end as it breaks
    crashCurl: 1.4, // how far the lip throws forward as it falls, × curl

    /* --- the trail it scours behind it --- */
    rumble: 0.22, // camera rumble while the wave runs
    trailInterval: 1.1, // metres between dust-ring decals laid behind the front
    trailLife: 1.8,
    trailRadius: 1.15, // × the local half-width
    trailIntensity: 0.75,
    colorTrailA: "#6e4f30",
    colorTrailB: "#c6955c",

    /* ================================================================ */
    /* 2 · GRIT + DUST OFF THE CREST                                     */
    /* ================================================================ */
    gritRate: 150, // chips/second off the crest
    gritSize: 0.06,
    gritSpeed: 5.5,
    gritLifetime: 0.9,
    gritGravity: -14,
    colorGritA: "#d8ae72",
    colorGritB: "#b88850",
    colorGritC: "#8d6338",
    colorGritD: "#5a3d22",

    sprayRate: 220, // fine sand/second blown back off the lip
    spraySize: 0.09,
    spraySpeed: 3.4,
    sprayLifetime: 0.85,
    sprayOpacity: 0.55,
    sprayGravity: -3.2,
    colorSprayA: "#f6dcaa",
    colorSprayB: "#e2b878",
    colorSprayC: "#c18e55",
    colorSprayD: "#8d6440",

    dustRate: 60, // smoke puffs/second rolling off behind the wave
    dustSize: 1.1,
    dustSpeed: 1.6,
    dustLifetime: 1.9,
    dustOpacity: 0.32,
    dustRise: 0.3,
    dustTurbulence: 0.8,
    dustSpread: 2.6, // how far a puff billows out over its life
    colorDustA: "#d1a46c",
    colorDustB: "#b48a5c",
    colorDustC: "#8f7259",
    colorDustD: "#5e5248",

    /* ================================================================ */
    /* 3 · THE CRASH                                                     */
    /* ================================================================ */
    burstSize: 3.6, // EARTH burst end radius, metres
    burstIntensity: 1.0,
    burstSquash: 0.45, // flattening of that burst
    shockRadius: 5.2,
    impactShake: 0.5,
    shakeDuration: 0.55,
    impactFlash: 0.12,
    burstGrit: 160, // chips thrown up by the break
    burstDust: 70, // smoke puffs in the cloud
    burstSpray: 220,
    colorBurstA: "#f2d29a",
    colorBurstB: "#c08a50",
    colorBurstC: "#6d4a2c",
    colorShockA: "#c9975c",
    colorShockB: "#fff1d2",
    colorFlash: "#ffdca3",

    /* ================================================================ */
    /* 4 · RIPPLE BED                                                    */
    /* ================================================================ */
    rippleFrequency: 2.4, // ridges per metre
    rippleSharp: 2.2, // >1 makes ridges crisp with wide troughs
    rippleAsymmetry: 0.55, // 0 = symmetric, 1 = gentle stoss / steep lee
    rippleWarp: 0.9, // noise bending the ridges, radians
    rippleWarpScale: 0.6, // features per metre in that bend
    rippleDepth: 0.9, // apparent relief (normal strength)
    rippleRadius: 3.4, // the fan of ripples at the crash point, metres
    rippleLag: 1.2, // metres behind the crest before ripples show
    rippleOpacity: 0.75,
    rippleEdge: 0.35, // ragged edge noise, fraction of the width
    rippleFadeIn: 0.25, // seconds for a patch of ripples to settle in
    rippleFade: 1.3, // seconds the bed takes to blow away at the end
    colorRippleLight: "#d8b07a",
    colorRippleDark: "#7a5532"
  }
};
