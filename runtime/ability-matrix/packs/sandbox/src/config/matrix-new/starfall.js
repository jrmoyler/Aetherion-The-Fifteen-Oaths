/**
 * Starfall Rite — Light — a constellation that drops its stars one by one.
 *
 * Matrix New data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 */
export default {
  id: 'starfall',
  meta: {
    label: "Starfall Rite",
    accent: '#fff4c0',
    key: 'K',
    hint: "Light — a constellation draws itself over the circle, then drops its stars one by one",
    cast: 'zone',
    glyph: `<path d="M22 22L50 32L78 20M50 32L40 52"/><circle cx="22" cy="22" r="3"/><circle cx="78" cy="20" r="3"/><circle cx="40" cy="52" r="3"/><path d="M58 60L66 84M66 84L60 78M66 84L72 78"/>`
  },
  /**
   * A rite in three movements. A herald star rises from the caster's hand to
   * the sky over the circle; there a **constellation draws itself**, star by
   * star, line by line, as one figure; then its stars **fall**, one at a
   * time — each announced by a soft gathering of light on the floor where it
   * will land — and every landing prints a radiant star on the ground and kills
   * what stands within its blast. When the last has fallen the figure that is
   * left **dims and closes**.
   *
   * A star record holds only dice (a bearing and radius in the sky, a landing
   * point, an order). Every metre and second below is resolved from this
   * block every frame.
   */
  settings: {
    /* --- the cast --- */
    "range": 20,
    "minRange": 0,
    "speed": 20, // m/s the herald star travels to the circle
    "lifetime": 1.8, // seconds over which the stars fall, first launch to last
    "cooldown": 0.7,
    "castAnim": "cast3",
    "zoneRadius": 5.5, // metres — the circle the stars land in

    /* --- timing --- */
    drawTime: 0.45, // seconds for the constellation to draw itself
    holdTime: 0.08, // seconds it hangs complete before the first star falls
    fallTime: 0.3, // seconds a star spends falling
    telegraphLead: 0.45, // seconds before a star leaves the sky that its mark appears
    chargeTime: 0.18, // seconds a star swells before it drops
    orderJitter: 0.55, // 0 = falls in drawing order, 1 = in random order
    linger: 1.2, // seconds after the last landing before the figure closes
    fadeTime: 1.0, // seconds for the figure to dim and close

    /* --- the constellation --- */
    starCount: 8, // stars (max 16)
    skyHeight: 3.4, // metres over the circle
    skyRadius: 3.6, // radius of the figure, metres
    skyDepth: 1.0, // metres of height jitter between stars
    skyTilt: 0.5, // radians the figure is tilted toward the caster
    skyOffset: 0.6, // metres the figure sits back toward the caster
    skyDrift: 0.05, // radians/second the whole figure turns
    extraLinks: 2, // lines that close loops in the figure (max 4)

    /* --- star points (billboard, diffraction spikes) --- */
    starSize: 0.3, // core radius, metres
    sizeJitter: 0.45,
    starIntensity: 4.0,
    starHalo: 0.8,
    starHaloSize: 1.4, // × core radius
    spikeLength: 9, // × core radius
    spikeSharpness: 7, // higher = thinner spikes
    spikeGlow: 1.2,
    spikeTurn: 0.04, // radians/second the spikes turn
    twinkle: 0.35,
    twinkleSpeed: 3.5,
    lightUpFlare: 1.0, // flare when a star first lights
    ghostLevel: 0.22, // brightness of a fallen star's ghost in the figure
    colorStarCore: '#ffffff',
    colorStarHalo: '#ffe6a0',
    colorStarSpike: '#fff2c8',

    /* --- the lines between them --- */
    lineWidth: 0.12, // glow half-width, metres
    lineCore: 0.22, // core width, fraction of the glow
    lineIntensity: 2.6,
    lineOpacity: 0.9,
    lineGap: 0.35, // metres left clear at each star
    lineShimmer: 0.6,
    lineShimmerScale: 1.2,
    lineShimmerSpeed: 2.2,
    fallenLineLevel: 0.35, // brightness of a line once one of its stars has fallen
    colorLineCore: '#fffaf0',
    colorLineGlow: '#ffd890',

    /* --- the falling star --- */
    landSpread: 0.9, // landing points as a fraction of the circle
    landBias: 0.55, // 0 = anywhere, 1 = straight down under its own star
    scatter: 0.6,
    trailLength: 5, // metres
    trailWidth: 0.3, // metres, at the head end
    trailTaper: 1.3, // > 1 thins it faster toward the tip
    trailFalloff: 1.4, // > 1 fades it faster toward the tip
    trailSparkle: 0.55,
    trailSparkleScale: 2.2,
    headSize: 0.5, // metres
    headGlow: 2.4,
    meteorIntensity: 4.2,
    meteorSoftFade: 0.25,
    fallCurve: 1.6, // > 1 accelerates into the floor
    colorHead: '#ffffff',
    colorTrail: '#ffe08a',
    colorTrailTip: '#ff9a3a',

    /* --- the floor telegraph --- */
    telegraphRadius: 1.6, // metres
    telegraphGlow: 1.6,
    telegraphOpacity: 1.0,
    telegraphSoftness: 1.0, // how wide the gathered light is
    telegraphArms: 1.4, // the faint four-pointed star on the floor
    telegraphBreath: 0.45,
    afterglow: 2.2, // the warm spot a landing leaves
    afterglowTime: 2.6, // seconds it cools over
    colorTelegraph: '#ffd27a',
    colorTelegraphHot: '#fff6dc',

    /* --- each impact --- */
    burstRadius: 2.6, // the radiant star printed on the floor, metres
    burstLife: 1.4,
    burstGlow: 3.0,
    burstRays: 12,
    burstRaySharpness: 48, // higher = thinner rays
    burstRayJitter: 0.55,
    burstCore: 2.0,
    burstRing: 1.2,
    colorBurstHot: '#ffffff',
    colorBurstBody: '#ffd26a',
    colorBurstCool: '#ff8a3a',
    ringRadius: 2.6, // SHOCKWAVE decal, metres
    ringLife: 0.45,
    colorRingA: '#ffd890',
    colorRingB: '#ffffff',
    shellSize: 1.2, // small AIR shell of light, metres
    shellLife: 0.3,
    impactShake: 0.22,
    impactFlash: 0.14,
    colorFlash: '#fff0c0',
    impactLight: 12, // added to the light per landing

    /* --- hits --- */
    blastRadius: 1.25, // metres from a landing a body dies
    hitImpulse: 6.5,
    hitLift: 6.0,
    hitSpin: 1.4,

    /* --- glitter (SOFT, additive) --- */
    glitterCount: 70, // per impact
    glitterSpeed: 4.5,
    glitterSize: 0.05,
    glitterLifetime: 1.3,
    glitterGravity: -1.2,
    glitterGlow: 2.8,
    trailGlitter: 70, // per second, shed by each falling star
    colorGlitterA: '#ffffff',
    colorGlitterB: '#fff0b0',
    colorGlitterC: '#ffc060',
    colorGlitterD: '#6a3a10',

    /* --- sparks (STREAK, additive) --- */
    sparkCount: 24, // per impact
    sparkSpeed: 9,
    sparkSize: 0.06,
    sparkLifetime: 0.35,
    sparkStretch: 0.3,

    /* --- star dust drifting down from the figure (SOFT, additive) --- */
    dustRate: 40,
    dustSize: 0.04,
    dustFall: 0.8, // m/s
    dustLifetime: 2.4,
    dustGlow: 1.6,

    /* --- the herald (travel) --- */
    heraldSize: 0.45,
    heraldGlitter: 120, // per second
    heraldTrail: 3, // metres of meteor trail the herald draws behind it

    /* --- the hero: cut crystal stars (lit, shadow-casting) --- */
    crystalSize: 0.55, // radius, metres
    crystalEmbed: 0.35, // centre height when landed, × size (lower = buried deeper)
    crystalLean: 0.45, // radians a landed star leans off upright
    crystalSpin: 0.8, // radians/second a landed star turns about its face
    crystalTumble: 6, // radians/second it tumbles while falling
    crystalCool: 1.6, // seconds it cools from white-hot to ember
    crystalGlow: 1.2, // emissive gain of the facets
    crystalPulse: 2.2, // ember pulse speed
    crystalRim: 0.8, // rim light
    crystalMetalness: 0.15,
    crystalRoughness: 0.22,
    colorCrystal: '#ffe2a0',

    /* --- the floor: craters and the figure re-drawn on the ground --- */
    fieldRadius: 1.1, // × zone radius
    fieldOpacity: 0.55, // how dark the circle goes (deep stop)
    craterRadius: 1.1, // metres
    craterCool: 2.2, // seconds the crater's cracks cool over
    floorLineWidth: 0.09, // metres
    floorLineGlow: 2.2,
    floorLineTime: 0.35, // seconds a floor line takes to draw between two landed stars
    colorDeep: '#2a1606',

    "colorA": "#fff4c0",
    "colorB": "#ffaa40",
    "lightColor": "#fff4c0",
    "lightIntensity": 6,
    "lightRadius": 9,
    lightHeight: 2.6 // metres over the circle the light sits
  }
};
