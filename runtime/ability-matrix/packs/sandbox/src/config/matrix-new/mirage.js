/**
 * Mirage Construct — Illusion — a spectral copy of the caster that draws fire, then bursts.
 *
 * Matrix New data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * The construct runs on one clock from the moment the projection lands: the
 * mirage pool spreads, the copy assembles from the feet up, stands breathing
 * its own idle for the rest of `lifetime`, charges, and bursts into shards of
 * light. Every number below is read every frame.
 */
export default {
  id: 'mirage',
  meta: {
    label: "Mirage Construct",
    accent: '#d0e8ff',
    key: 'X',
    hint: "Illusion — a spectral copy of you stands in the circle, flickers, then bursts into light",
    cast: 'zone',
    glyph: `<circle cx="34" cy="24" r="8"/><path d="M34 32V60M22 44H46M34 60L25 82M34 60L43 82"/><circle cx="66" cy="24" r="8" stroke-dasharray="3 4"/><path d="M66 32V60M54 44H78M66 60L57 82M66 60L75 82" stroke-dasharray="3 4"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 12, // maximum cast distance, metres
    minRange: 0, // zero: the copy can be stood right beside you
    speed: 14, // how fast the projection runs to the circle, metres/second
    lifetime: 4.0, // seconds from landing to the burst — assembly, standing and charge included
    cooldown: 0.8, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 3, // the circle the aim indicator measures out; also the burst's kill radius
    fadeTime: 1.4, // seconds the shards and motes take to settle after the burst
    colorA: '#d0e8ff', // the copy's spectral core
    colorB: '#ffffff', // the burst flash

    /* --- the projection (travel) --- */
    projectHeight: 1.0, // metres off the floor the stream of light flies at
    projectRate: 220, // motes per second shed by the projection
    projectSize: 0.09,
    projectSpread: 0.35, // metres the stream frays to

    /* ================================================================ */
    /* 1 · THE COPY                                                      */
    /* ================================================================ */
    bodyHeight: 1.78, // metres — normalises the shader bands, the haze and the light
    faceCaster: true, // turn to face the caster (a mirror), or face along the cast
    idleOffset: 0.6, // seconds into the idle clip the copy starts — out of step with you
    idleSpeed: 1.0, // the copy's own playback rate (× the global animation speed)
    formTime: 0.9, // seconds to assemble from the feet up
    formEdge: 0.09, // metres of hot seam at the assembly front
    formNoise: 0.22, // how ragged the assembly front is, metres
    formNoiseScale: 3.5, // features per metre in that front
    formGlow: 4.0, // brightness of the seam
    rimStrength: 2.2, // fresnel rim
    rimPower: 2.4, // rim thinness
    fill: 0.42, // how much of the body itself glows, under the rim
    bandDensity: 9, // interference bands per metre
    bandSpeed: 2.4, // how fast the bands roll up the body
    bandSharpness: 3.0, // higher = thinner bands
    bandStrength: 0.5,
    bandWarp: 0.25, // noise bending the bands
    chromaSplit: 0.16, // phase offset between the red and blue bands — the chromatic fringe
    flicker: 0.2, // depth of the strobe
    flickerRate: 14, // strobe re-rolls per second
    glitch: 0.018, // metres the slice tearing throws a band sideways
    glitchSlices: 26, // slices up the body
    bodyGlow: 2.4,
    bodyOpacity: 0.85,
    colorBodyRim: '#a8d8ff',
    colorBodyBand: '#e8f4ff',
    colorBodyEdge: '#ffffff', // the assembly seam

    /* --- 2 · afterimages: the chromatic ghosts trailing the copy --- */
    afterCount: 2, // 0..2
    afterSplit: 0.06, // metres either side of the copy, across the view
    afterLag: 0.1, // metres they drift behind it
    afterWobble: 0.05, // metres of slow sway
    afterWobbleRate: 1.3, // sways per second
    afterOpacity: 0.25,
    colorAfterA: '#ff5ad0',
    colorAfterB: '#4ff2ff',

    /* --- the charge before the burst --- */
    chargeTime: 0.6, // seconds before the burst it starts to gather
    chargeGlow: 2.5, // extra brightness at the peak of the charge
    chargeGlitch: 0.07, // extra slice tearing at the peak
    chargeShake: 0.12, // a rumble while it gathers

    /* ================================================================ */
    /* 3 · THE MIRAGE POOL                                               */
    /* ================================================================ */
    poolRadius: 0.75, // × zoneRadius
    poolGrowTime: 0.5, // seconds to spread after landing
    poolRings: 7, // interference rings across the radius
    poolRingSpeed: 0.6, // how fast they run outward
    poolRingWidth: 0.05, // ring thickness, fraction of the radius
    poolIridescence: 0.7, // how much the rings shift hue
    poolShimmer: 0.35, // heat shimmer bending the rings
    poolShimmerScale: 2.2,
    poolEdgeGlow: 2.0, // the bright rim at the edge of the pool
    poolGlow: 1.2,
    poolOpacity: 0.8,
    poolFlare: 2.0, // how much it flares on the burst
    colorPoolA: '#bfe4ff',
    colorPoolB: '#7f9cff',
    colorPoolC: '#f0b8ff',

    /* ================================================================ */
    /* 4 · HEAT HAZE (screen-space)                                      */
    /* ================================================================ */
    hazeStrength: 0.35,
    hazeScale: 2.2, // features per screen unit
    hazeSpeed: 1.4, // how fast the shimmer rises
    hazeWidth: 1.5, // metres
    hazeHeight: 2.6, // metres
    shockStrength: 1.2, // the burst's screen-space ring
    shockSize: 6, // metres it reaches
    shockTime: 0.5, // seconds it takes

    /* ================================================================ */
    /* 5 · MOTES                                                         */
    /* ================================================================ */
    moteRate: 40, // per second while the copy stands
    moteRadius: 0.6, // metres round the body they leave from
    moteSize: 0.06,
    moteLifetime: 1.6,
    moteRise: 0.5, // upward drift
    moteGlow: 2.0,
    colorMoteA: '#ffffff',
    colorMoteB: '#cfe8ff',
    colorMoteC: '#a99cff',
    colorMoteD: '#5a4c9a',

    /* ================================================================ */
    /* 6 · THE BURST                                                     */
    /* ================================================================ */
    burstTime: 0.18, // seconds the body takes to come apart
    shardCount: 36, // shards of light (max 48)
    shardSpeed: 7, // metres/second they leave at
    shardSpeedJitter: 0.5,
    shardLift: 0.5, // upward bias of their flight
    shardGravity: -9,
    shardDrag: 1.2,
    shardLife: 1.1, // seconds each one lives
    shardLength: 0.35, // metres
    shardWidth: 0.06,
    shardSpin: 8, // rad/s tumble
    shardGlow: 3.0,
    shardFresnel: 2.2,
    shardOpacity: 0.95,
    colorShardCore: '#ffffff',
    colorShardEdge: '#bfe0ff',
    colorShardDeep: '#5a6cff',
    sparkCount: 120,
    sparkSpeed: 9,
    sparkSize: 0.08,
    sparkLifetime: 0.7,
    sparkStretch: 0.8,
    sparkGlow: 3.0,
    colorSparkA: '#ffffff',
    colorSparkB: '#d6ecff',
    colorSparkC: '#9a8cff',
    colorSparkD: '#3a2c7a',
    burstRadius: 3.2, // the AIR pressure shell, metres
    burstLife: 0.5,
    burstIntensity: 2.0,
    colorBurstA: '#ffffff',
    colorBurstB: '#bcd8ff',
    colorBurstC: '#8a7cff',
    ringRadius: 1.4, // the shock ring decal, × zoneRadius
    ringLife: 0.7,
    colorRingA: '#bfe0ff',
    colorRingB: '#ffffff',
    dustLife: 1.2,
    colorDust: '#9aa6c8',
    killReach: 1.0, // × zoneRadius
    killImpulse: 7, // metres/second bodies are thrown out
    killLift: 4.5, // ... and up
    killSpin: 1.6,
    burstShake: 0.7,
    burstFlash: 0.55,

    /* --- light --- */
    lightColor: '#d0e8ff',
    lightIntensity: 6,
    lightRadius: 9,
    lightHeight: 1.2, // metres over the copy's feet
    lightBoost: 3 // the burst's punch, × intensity
  }
};
