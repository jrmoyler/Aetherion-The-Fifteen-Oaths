/**
 * Aetherblade Cascade — Arcane — a staggered cascade of translucent blades.
 *
 * Matrix New data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * Every number below is resolved per frame by `AetherbladeCascadeAbility`: a
 * blade record holds only dice and the moment the front passed its station,
 * so dragging the count, the spacing or any timing regroups a cascade that is
 * already falling.
 */
export default {
  id: 'aetherblade',
  meta: {
    label: "Aetherblade Cascade",
    accent: '#a8f0ff',
    key: 'V',
    hint: "Arcane — spectral swords form above the line and stab down one after another",
    cast: 'line',
    glyph: `<path d="M22 18L30 62"/><path d="M24 58L36 56"/><path d="M48 14L54 66"/><path d="M47 60L60 59"/><path d="M74 20L76 74"/><path d="M68 66L84 66"/><circle cx="76" cy="84" r="6"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 20, // maximum cast distance, metres
    minRange: 2,
    speed: 24, // how fast the invisible front calls the blades down the line, m/s
    lifetime: 1.6, // seconds the blades stand embedded after the last one lands
    cooldown: 0.45,
    castAnim: "cast1",

    /* --- light --- */
    lightColor: "#a8f0ff",
    lightIntensity: 6,
    lightRadius: 9,
    lightHeight: 1.6, // metres above the newest blade the light hangs
    stabLight: 8, // light punch per landing
    lightPulse: 0.25, // 0..1 arcane throb

    /* ================================================================ */
    /* 1 · THE CASCADE                                                   */
    /* ================================================================ */
    bladeCount: 7, // swords along the line (the final blade is extra)
    firstStation: 1.6, // metres in front of the caster the first one forms
    stationJitter: 0.35, // metres each station wanders along the line
    lateralJitter: 0.4, // metres each blade strays off the line
    zigzag: 0.3, // metres they alternate side to side
    formLead: 0.0, // metres ahead of the front a blade starts forming

    /* --- timing (seconds) --- */
    formTime: 0.22, // the blade dissolving in, point first
    hoverTime: 0.16, // hanging, drawn back, before it falls
    windup: 0.3, // metres it is drawn up before the stab
    stabTime: 0.09, // the fall itself
    timeJitter: 0.04, // seconds each blade's timing wanders

    /* --- placement --- */
    hoverHeight: 1.7, // metres the point hangs above the floor (kept low so the hanging swords stay in frame)
    hoverBob: 0.08, // metres it breathes while hanging
    tilt: 0.42, // radians it leans along the line while hanging
    tiltJitter: 0.25, // radians of extra lean
    landTilt: 0.12, // radians of lean it keeps when embedded
    spinJitter: 1, // 0..1 how much each turns about its own axis
    embedDepth: 0.22, // fraction of the sword buried in the floor
    landShudder: 0.05, // radians it quivers on landing
    shudderTime: 0.35,

    /* ================================================================ */
    /* 2 · THE SWORDS                                                    */
    /* ================================================================ */
    bladeLength: 2.8, // metres, point to pommel
    bladeWidth: 0.1, // blade half-width, × length (rebuild)
    bladeThickness: 0.03, // ridge half-thickness, × length (rebuild)
    bladeFraction: 0.74, // share of the sword that is blade (rebuild)
    guardWidth: 2.9, // crossguard half-span, × blade width (rebuild)
    sizeJitter: 0.12, // ± fraction of length per blade

    swordOpacity: 1,
    swordBodyGlow: 0.12, // the faint fill of the glass
    swordFresnel: 0.85, // silhouette glow
    swordFresnelPower: 2.4,
    swordEnv: 0.22, // sky in the facets
    swordSpecular: 2,
    swordGloss: 160,
    swordEdgeGlow: 0.9, // the cutting edges
    hiltDim: 0.55, // crossguard, grip and pommel, × the blade's brightness
    runeLight: 2.2, // the glyphs down the fuller
    runeLightCount: 12, // glyphs down each sword (≈ square cells at the default width)
    runeLightWidth: 0.55, // width of the rune channel, × the blade face
    runeLightStroke: 0.075, // glyph stroke
    runePulseSpeed: 1.4, // pulses per second, guard → point
    runePulseWidth: 0.28,
    formSoft: 0.08, // width of the dissolve front
    formNoise: 0.14, // raggedness of the dissolve front
    formBurnGlow: 4.5, // the burn line it forms behind
    colorSwordBody: "#3a8fb8",
    colorSwordRim: "#3f8cff",
    colorSwordRune: "#e6c8ff",
    colorSwordEdge: "#a8dcff",
    colorSwordBurn: "#c8a8ff",

    /* --- the core: the lit, normal-blended mass under the glass --- */
    coreOpacity: 0.94, // how solid the body under the glass is
    coreLight: 0.85, // how much the sun lifts the body off the deep tone
    coreRim: 0.6, // the ice-pale silhouette
    coreEnv: 0.12, // sky caught in the facets (kept low: the body stays dark)
    coreRuneGlow: 2.6, // the white-hot runes — the only HDR in the body
    coreHiltDark: 0.55, // crossguard, grip and pommel, × the body
    colorCoreDeep: "#120a3c", // deep: indigo in the facets turned from the sun
    colorCoreBody: "#1d40b4", // body: cobalt
    colorCoreTint: "#7cc4ff", // tint: ice at the silhouette
    colorCoreHot: "#f4f8ff", // core: white-hot runes

    /* ================================================================ */
    /* 3 · RUNE CIRCLES                                                  */
    /* ================================================================ */
    circleRadius: 0.95, // metres, per blade
    circleBand: 0.2, // glyph band width, fraction of the radius
    circleLine: 0.012, // stroke, fraction of the radius
    circleGlyphs: 12,
    circleSides: 6, // the inscribed polygon
    circleSpin: 0.9, // rad/s
    circleCoreGlow: 2.0,
    circleHaloGlow: 0.45,
    circleOpacity: 1,
    circleFlare: 1.1, // how hard it flares on the landing
    circleFlareDecay: 5, // per second
    circleLinger: 0.5, // fraction of brightness kept while the blade stands
    colorCircleCore: "#b4e2ff",
    colorCircleGlow: "#3a6cff",
    colorCircleFlare: "#9cc8ff",
    circleContract: 0.62, // × radius the circle draws in to while its blade stands
    circleExitGrow: 1.1, // × radius it flares out by as the blade shatters
    brandRadius: 1.35, // metres: the dark burn each landing leaves under its circle
    brandIntensity: 0.95,
    colorBrandDeep: "#0a0620", // the burnt floor: near-black indigo
    colorBrandEmber: "#5a7cff", // embers cooling in it

    /* ================================================================ */
    /* 4 · FORMING MOTES                                                 */
    /* ================================================================ */
    moteRate: 160, // per second, per forming blade
    moteSize: 0.06,
    moteRadius: 0.9, // metres out they are drawn in from
    moteSpeed: 2.6, // m/s inward
    moteLifetime: 0.4,
    colorMoteA: "#ffffff",
    colorMoteB: "#c8f4ff",
    colorMoteC: "#a890ff",
    colorMoteD: "#3c2a80",

    /* ================================================================ */
    /* 5 · THE STAB — per landing                                        */
    /* ================================================================ */
    trailRate: 900, // afterimage streaks per second while falling
    trailSize: 0.05,
    trailLifetime: 0.18,
    sparkCount: 34, // per landing
    sparkSpeed: 9,
    sparkSize: 0.045,
    sparkLifetime: 0.45,
    sparkGravity: -9,
    sparkStretch: 0.06,
    shockRadius: 2.2, // the ring on the floor, metres
    shockLife: 0.45,
    burstRadius: 1.4, // a small arcane shell per stab
    burstLife: 0.35,
    stabShake: 0.16,
    killRadius: 1.0, // bodies this close to a landing are struck
    killImpulse: 5, // m/s, outward from the blade
    killLift: 4.2, // m/s
    killSpin: 1.4,
    colorSparkA: "#ffffff",
    colorSparkB: "#c8f4ff",
    colorSparkC: "#8f7bff",
    colorSparkD: "#301a6a",
    colorShockA: "#a8f0ff",
    colorShockB: "#a8dcff",
    colorBurstA: "#ffffff",
    colorBurstB: "#a8f0ff",
    colorBurstC: "#6a4cff",

    /* ================================================================ */
    /* 6 · THE FINAL BLADE                                               */
    /* ================================================================ */
    finalScale: 1.5, // × the blade length
    finalHover: 0.32, // extra seconds it hangs
    finalCircle: 2.2, // × the circle radius
    finalKill: 2.6, // kill radius, metres
    finalShake: 0.55,
    finalShakeDuration: 0.45,
    finalFlash: 0.35,
    finalBurst: 4.5, // metres
    finalShock: 6.5, // metres
    finalSparks: 2.4, // × the spark count
    colorFlash: "#d8f4ff",

    /* ================================================================ */
    /* 7 · THE LINGER — the blades settle while they stand               */
    /* ================================================================ */
    lingerSink: 0.12, // extra share of the sword it sinks while standing
    lingerSinkTime: 1.1, // seconds it settles over
    lingerBreath: 0.22, // how hard the runes breathe while it stands
    lingerBreathRate: 1.3, // breaths per second
    wispRate: 28, // aether wisps per second off each standing blade
    wispSize: 0.22,
    wispSpeed: 0.9, // m/s up
    wispLife: 1.3,
    wispBuoyancy: 0.6, // m/s² up
    wispGlow: 1.1,
    colorWispA: "#e8f6ff",
    colorWispB: "#7cc4ff",
    colorWispC: "#4a3cc8",
    colorWispD: "#140c40",
    crackLead: 0.9, // seconds before the shatter that the cracks start to glow
    crackPre: 0.12, // crack strength before the shatter (no cell drops below ~0.16)

    /* ================================================================ */
    /* 8 · THE SHATTER                                                   */
    /* ================================================================ */
    shatterTime: 0.5, // seconds one blade takes to crack and fall apart
    shatterStagger: 0.07, // seconds between blades, caster first
    shatterCells: 6, // crack cells up the sword
    shatterCrackGlow: 2.2,
    glintCount: 46, // glints per blade
    glintSize: 0.06,
    glintSpeed: 2.6,
    glintLifetime: 0.9,
    glintGravity: -3.5,
    colorGlintA: "#ffffff",
    colorGlintB: "#d8f6ff",
    colorGlintC: "#a8a0ff",
    colorGlintD: "#2a2060"
  }
};
