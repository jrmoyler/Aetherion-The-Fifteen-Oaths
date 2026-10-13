/**
 * Sunfall Prism — Light — a falling prism splits the sun into a spectrum.
 *
 * Collective Originals data block: presentation (`meta`) and the live settings
 * the ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * Timeline, all live: the prism falls through a sun shaft while the front
 * travels (`descentTime`), hovers and charges (`chargeTime`), is struck from
 * above (`strikeLead` later it splits), sweeps its spectrum across the circle
 * for `lifetime`, lingers, then shatters and the scorched lines cool over
 * `scorchFade`.
 */
export default {
  id: 'prism',
  meta: {
    label: "Sunfall Prism",
    accent: '#fff1b0',
    key: 'R',
    hint: "Light — a falling prism splits the sun into a sweeping spectrum",
    cast: 'zone',
    glyph: `<path d="M50 14L80 66H20Z"/><path d="M50 66L34 88M50 66L50 90M50 66L66 88"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 16, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 18, // how fast the cast front reaches the circle, metres/second
    lifetime: 1.6, // seconds the spectrum sweeps the circle
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: "cast2", // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 3.2, // the circle the beams sweep, metres

    /* --- light --- */
    lightColor: "#fff1b0",
    lightIntensity: 7,
    lightRadius: 10,
    lightSpectrum: 0.6, // 0..1 how much the light cycles through the beam hues while they sweep

    /* ================================================================ */
    /* 1 · THE PRISM                                                     */
    /* ================================================================ */
    /* --- the stone (metres) --- */
    prismSides: 3, // facets round the waist — 3 is a true prism
    prismRadius: 0.55, // waist radius
    prismHeight: 1.7, // tip to tip
    prismBand: 0.32, // height of the straight waist, fraction of the height
    prismTwist: 0.35, // radians the upper ring is turned against the lower

    /* --- the fall and the hover --- */
    dropHeight: 16, // where it falls from
    hoverHeight: 2.6, // where it hangs
    descentTime: 0.9, // seconds of the fall — at least this, even on a short cast
    hoverBob: 0.12, // metres of slow bob
    hoverBobSpeed: 1.6,
    spin: 0.35, // turns/second while it hovers
    spinStrike: 1.6, // turns/second once the beam hits it
    tilt: 0.28, // radians the prism leans off vertical as it turns
    chargeTime: 0.45, // seconds it hangs before the strike

    /* --- the glass --- */
    glassOpacity: 0.62,
    fresnel: 1.8,
    fresnelPower: 2.6,
    dispersion: 0.65, // RGB split at the silhouette
    refraction: 0.35, // how far the background bends through the stone
    envIntensity: 1.1, // reflections of the sky probe
    innerFire: 1.6, // spectral flashes caught in the internal facets
    innerScale: 3.2,
    chargeGlow: 3.5, // emissive gain while the beam is in it
    colorGlass: "#e6f4ff",
    colorGlassDeep: "#6c86b8",
    colorGlassRim: "#ffffff",

    /* ================================================================ */
    /* 2 · THE SUN SHAFT + THE STRIKE                                    */
    /* ================================================================ */
    shaftRadius: 1.9, // the falling shaft at the floor
    shaftTopRadius: 3.2, // and at the sky
    shaftHeight: 24,
    shaftIntensity: 1.3,
    shaftOpacity: 0.35,
    shaftSoftness: 2.2, // facing-ratio falloff: bigger = softer edges
    poolIntensity: 1.2, // the sun spot on the floor under it
    poolRadius: 1.25, // × shaft radius
    strikeRadius: 0.22, // the white beam that hits the prism
    strikeIntensity: 6,
    strikeLead: 0.12, // seconds from the strike to the split
    noiseScale: 1.4, // motes of dust drifting in the beams
    noiseSpeed: 1.5,
    colorSun: "#ffe7a6",
    colorStrike: "#ffffff",

    /* ================================================================ */
    /* 3 · THE SPECTRUM                                                  */
    /* ================================================================ */
    beamCount: 6, // spectral beams (max 8)
    beamWidth: 0.11, // radius of one beam, metres
    beamIntensity: 4.5,
    beamCore: 2.6, // >1 tightens the bright core
    hueStart: 0.0, // red
    hueEnd: 0.78, // violet
    saturation: 0.92,
    sweepAngle: 1.9, // radians each beam travels round the circle
    sweepInner: 0.15, // where a beam's contact starts, × radius
    sweepOuter: 1.0, // and where it ends, × radius
    sweepEase: 0.6, // 0 linear, 1 eased in/out
    beamFlicker: 0.15,
    lingerTime: 0.35, // seconds the beams hold at the end before the shatter

    /* ================================================================ */
    /* 4 · THE SCORCH                                                    */
    /* ================================================================ */
    scorchWidth: 0.16, // half-width of a burnt line, metres
    scorchGlow: 3.2, // how hot the fresh end of a line is
    scorchCool: 1.6, // metres behind the contact over which a line cools
    scorchHue: 0.55, // how much of the beam's hue a cooled line keeps
    scorchWobble: 0.05, // line wobble, metres
    scorchOpacity: 0.85,
    scorchFade: 1.4, // seconds the lines take to fade after the shatter
    scorchDecalSpacing: 0.9, // metres of contact travel between SCORCH decals
    scorchDecalSize: 0.45, // their radius, metres
    scorchDecalLife: 3.2,
    colorChar: "#2b1d16",

    /* ================================================================ */
    /* 5 · MOTES + GLINTS                                                */
    /* ================================================================ */
    moteRate: 90, // glittering motes/second in the shaft
    moteSize: 0.06,
    moteSpeed: 0.8,
    moteLifetime: 1.4,
    moteGlow: 2.2,
    sparkRate: 120, // sparks/second off each contact point (shared)
    sparkSize: 0.04,
    sparkSpeed: 4.5,
    sparkLifetime: 0.45,
    sparkGravity: -6,
    glintCount: 160, // glints thrown when the prism shatters
    glintSize: 0.05,
    glintSpeed: 7.5,
    glintLifetime: 0.9,
    glintGlow: 3.5,
    colorMoteA: "#ffffff",
    colorMoteB: "#fff4cc",
    colorMoteC: "#ffe08a",
    colorMoteD: "#b59545",

    /* ================================================================ */
    /* 6 · IMPACT                                                        */
    /* ================================================================ */
    splitFlash: 0.4, // screen flash on the split
    splitShake: 0.28,
    shatterShake: 0.22,
    shakeDuration: 0.4,
    burstSize: 2.4, // the pressure shell round the prism on the split
    burstIntensity: 1.8,
    shockRadius: 4.6,
    colorBurstA: "#ffffff",
    colorBurstB: "#fff1b0",
    colorBurstC: "#9fd8ff",
    colorShockA: "#fff1b0",
    colorShockB: "#ffffff",
    colorFlash: "#fff6d8"
  }
};
