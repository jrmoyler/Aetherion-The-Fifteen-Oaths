/**
 * Railgun Lance — Tech — three hard-light coils charge in front of the hand and
 * fire a slug straight down the line.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so `settings.js`
 * can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `RailgunLanceAbility`, so
 * dragging any of it in the editor re-shapes coils that are already spinning
 * and a trail that is already burning.
 */
export default {
  id: 'railgun',
  meta: {
    label: "Railgun Lance",
    accent: '#7ff0ff',
    key: '',
    element: 'tech',
    hint: "Tech — hard-light coils spin up round the hand and fire a slug that pierces everything on the line",
    cast: 'line',
    glyph: `<ellipse cx="30" cy="50" rx="7" ry="20"/><ellipse cx="46" cy="50" rx="7" ry="20"/><ellipse cx="62" cy="50" rx="7" ry="20"/><path d="M10 50H92"/><path d="M80 42L92 50L80 58"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 26, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 160, // how fast the slug flies once fired, metres/second
    lifetime: 2.2, // seconds the trail, the shock rings and the slag linger after the impact
    cooldown: 0.8, // seconds before the ability can be armed again
    castAnim: "cast1", // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: "#7ff0ff",
    lightIntensity: 6, // the steady glow riding the coils, then the slug
    lightRadius: 8,
    lightFlicker: 0.25, // 0..1 how much the hard light stutters
    chargeLight: 2.2, // extra light at full charge, × intensity
    fireLight: 3.5, // the punch when the slug leaves, × intensity

    /* accent pair — the hologram and its hot core */
    colorA: "#7ff0ff",
    colorB: "#ffffff",

    /* ================================================================ */
    /* 1 · THE COILS                                                     */
    /* ================================================================ */

    /* --- placement (metres) --- */
    ringCount: 3, // coils on the line (max 5)
    ringStart: 0.9, // metres in front of the caster the first coil sits
    ringSpacing: 0.55, // metres between coils
    ringHeight: 1.35, // height of the firing axis — the whole line flies at this
    ringRadius: 0.42, // radius of the first coil
    ringTaper: -0.06, // radius added per coil down the line (negative = a funnel)
    ringTube: 0.06, // radial thickness of the band
    ringDepth: 4, // axial depth of the band, × the tube — the coils nearly close into one barrel
    ringSegments: 6, // segments round each coil
    segmentGap: 0.05, // gap between segments, fraction of a segment

    /* --- spin --- */
    ringSpin: 1.5, // rad/s while idle
    ringSpinCharged: 26, // rad/s at full charge
    ringAlternate: -1, // odd coils spin × this (−1 = counter-rotating)
    ringAppear: 0.16, // seconds each coil takes to draw itself in
    ringStagger: 0.08, // seconds between one coil and the next
    ringRecoil: 0.22, // metres the coils are kicked back when the slug leaves
    ringPulse: 0.08, // how much they swell on the shot

    /* --- the hard-light hologram --- */
    hexScale: 26, // hex cells per metre on the band
    hexScroll: 1.2, // cells per second the hex flows round the coil
    hexEdge: 0.08, // width of the hex lines (cell fraction)
    scanlines: 34, // scanlines per metre, in world height
    scanSpeed: 2.5, // metres/second the scanlines climb
    scanDepth: 0.5, // 0..1 how dark the gaps between scanlines are
    holoGlow: 1.1, // brightness of the windings' glow (bloom > 1)
    holoOpacity: 0.8,
    rimGlow: 1.1, // edge-on glow
    chargeGlow: 1.3, // extra glow at full charge
    arcCrawl: 1.4, // sparks of light crawling the band at full charge
    arcSpeed: 9, // how fast they crawl
    flicker: 0.18, // 0..1 dropout flicker of the hologram
    glitch: 0.35, // 0..1 slice glitches across the band
    softFade: 0.15, // soft intersection with geometry, metres
    colorRingDeep: "#155cff", // the dark of the band between the hex lines
    /* --- the solid body + its windings (the only lit part) --- */
    coilBodyOpacity: 0.94, // the dark lit sleeve under the glow
    colorCoilBody: "#16203a", // steel-navy, lit from above
    coilWindings: 36, // wires wound round each coil
    coilWindingWidth: 0.07, // width of a wire, fraction of a winding
    coilWindingGlow: 0.8, // how hot the windings run (× the charge)

    /* --- derez — the coils come apart into pixels after the shot --- */
    derezDelay: 0.12, // seconds after the shot before they start to go
    derezTime: 0.55, // seconds they take to come apart
    pixelSize: 0.03, // metres per pixel cell of the derez
    pixelCount: 24, // pixel particles shed per coil
    pixelSize3d: 0.05, // size of those particles
    pixelSpeed: 1.1, // m/s they drift off
    pixelLife: 0.8,
    colorPixelA: "#ffffff",
    colorPixelB: "#9ff6ff",
    colorPixelC: "#36b8ff",
    colorPixelD: "#1640a0",

    /* ================================================================ */
    /* 2 · THE CHARGE                                                    */
    /* ================================================================ */
    chargeTime: 0.5, // seconds from the first coil to the shot
    chargeCurve: 1.7, // >1 = the charge builds late
    humShake: 0.12, // camera hum at full charge
    sparkRate: 170, // sparks crawling the coils, per second, at full charge
    sparkSize: 0.028,
    sparkSpeed: 3.2, // m/s, tangential to the coil
    sparkLife: 0.22,
    sparkStretch: 0.3,
    sparkGlow: 3.2,
    moteRate: 140, // light drawn inward onto the axis, per second
    moteSize: 0.05,
    moteLife: 0.35,
    colorSparkA: "#ffffff",
    colorSparkB: "#c8fbff",
    colorSparkC: "#5fd8ff",
    colorSparkD: "#1d4fd0",

    /* ================================================================ */
    /* 3 · THE SLUG                                                      */
    /* ================================================================ */
    slugLength: 1.5, // metres, nose to tail, in flight
    slugWidth: 0.11, // radius at its widest
    slugCharge: 0.16, // radius of the orb it is while charging
    slugGlow: 7, // core brightness
    slugRim: 2.4, // hard-light rim
    slugStreaks: 900, // streaks shed off it per second in flight
    streakSpeed: 0.3, // × the slug's speed — how far they are carried
    streakSize: 0.03,
    streakLife: 0.16,
    streakStretch: 0.5,
    colorSlugCore: "#ffffff",
    colorSlugRim: "#7ff0ff",

    /* ================================================================ */
    /* 4 · THE BEAM TRAIL                                                */
    /* ================================================================ */
    beamWidth: 0.11, // radius of the bright core, metres
    beamHalo: 0.85, // radius of the outer glow, metres
    beamGlow: 6, // core brightness
    haloGlow: 0.08, // halo brightness
    beamCoreSharp: 3.2, // how tight the core of the tube is
    beamLife: 1.7, // seconds the trail takes to thin to nothing
    beamThinCurve: 2.4, // >1 = it holds, then thins late
    sheathRadius: 0.5, // the rim-weighted sheath between core and halo, metres
    sheathGlow: 0.4, // sheath brightness
    beamFlare: 0.7, // the bell at the far end opens to (1 + this) × the radius
    beamFlareLength: 2.2, // metres of line the bell opens over
    beamWobble: 0.05, // 0..1 the column breathes along its length
    beamWobbleSpeed: 9, // how fast the breathing runs down the line
    beamPulseScale: 0.9, // energy pulses per metre
    beamPulseSpeed: 26, // pulses per second running down the line
    beamFlicker: 0.15,
    beamBreak: 0.7, // 0..1 how much it breaks into dashes as it dies
    beamBreakScale: 1.4, // dashes per metre
    beamSoftFade: 0.25,
    colorBeamCore: "#ffffff",
    colorBeamEdge: "#4fd8ff",
    colorBeamHalo: "#1458ff",
    colorBeamDeep: "#0a1f8f", // the deep stop: the sheath's skin and the ion haze

    /* --- the rifling: hard-light strands braided round the beam --- */
    helixStrands: 2, // strands (max 4); neighbours wind opposite ways
    helixRadius: 0.36, // metres from the axis at birth
    helixSpread: 0.8, // how far they unwind outward over their life (× radius)
    helixTurns: 0.28, // turns per metre
    helixRoll: 5, // rad/s the braid rolls
    helixTube: 0.032, // strand thickness, metres
    helixGlow: 0.1,
    helixLife: 2.1, // seconds from the shot until the strands are gone
    helixHold: 0.4, // fraction of that life they stay whole before unwinding to light
    helixBreakScale: 1.3, // noise cells per metre they break up on
    helixPulseScale: 0.45, // pulses per metre running down the strands
    helixPulseSpeed: 9, // pulses per second
    helixShed: 260, // motes/s shed off the strands while they come apart
    colorHelixCore: "#ffffff",
    colorHelixTint: "#7fe6ff",
    colorHelixBody: "#1a8cff",
    colorHelixDeep: "#0b2a9e",

    /* --- ionised haze hanging along the line (normal-blended, dark) --- */
    ionRate: 150, // haze puffs/second along the beam while it burns
    ionSize: 0.75,
    ionLife: 1.8,
    ionRise: 0.35, // m/s
    ionOpacity: 0.8,
    colorIonA: "#3c5f8c",
    colorIonB: "#1d3156",
    colorIonC: "#0f1a33",
    colorIonD: "#070b16",
    /* --- the heat bend along the trail (LAYER.DISTORTION) --- */
    warpStrength: 0.9,
    warpWidth: 0.42, // radius, metres
    warpScale: 3, // noise features per metre
    warpSpeed: 7,
    warpLife: 0.6, // seconds the bend lasts after the shot

    /* ================================================================ */
    /* 5 · SHOCK RINGS                                                   */
    /* ================================================================ */
    shockSpacing: 2.4, // a ring punched out every this many metres
    shockRadius: 0.45, // starting radius
    shockGrow: 1.7, // end radius, × start
    shockWidth: 0.03, // line width, metres
    shockLife: 0.22,
    shockGlow: 0.5,
    shockBody: 0.3, // dark compressed-air disc behind the front
    shockRim: 0.15, // the thin hot line at the front
    shockTicks: 0, // tick marks round each ring
    colorShockA: "#6fe8ff", // the ring
    colorShockB: "#2f8dff", // the haze inside it

    /* ================================================================ */
    /* 6 · THE SLAG TRENCH                                               */
    /* ================================================================ */
    trenchStart: 1.4, // metres in front of the caster the trench begins
    trenchCore: 0.24, // half-width of the molten line, metres
    trenchScorch: 1.15, // half-width of the scorched band, metres
    trenchGlow: 4.5, // molten brightness
    trenchCool: 1.1, // seconds for a point to cool from white-hot to slag
    trenchEmber: 0.6, // how much the cracks keep glowing once it has cooled
    trenchCells: 6, // crust cells per metre
    trenchCrawl: 1.1, // the heat wave crawling down the cooling seams, cycles/s
    trenchGlass: 0.8, // the thin cyan seam of fused hard light down the middle
    emberRate: 160, // embers/second lifting off the hot slag (fades as it cools)
    emberSize: 0.05,
    emberLife: 1.1,
    emberRise: 1.4, // m/s
    colorEmberA: "#fff3c4",
    colorEmberB: "#ffb04a",
    colorEmberC: "#e2480e",
    colorEmberD: "#3a0b02",
    trenchWander: 0.035, // metres the line wanders
    trenchDark: 0.75, // opacity of the scorch
    trenchErode: 0.7, // 0..1 how raggedly it fades
    colorSlagHot: "#eaffff",
    colorSlagWarm: "#ff9a3a",
    colorSlagCool: "#7a1806",
    colorScorch: "#07090c",
    smokeRate: 150, // smoke off the slag, per second
    smokeSize: 0.7,
    smokeRise: 0.9, // m/s
    smokeLife: 1.6,
    smokeOpacity: 0.5,
    colorSmokeA: "#7d8890",
    colorSmokeB: "#5b646b",
    colorSmokeC: "#3c4247",
    colorSmokeD: "#24282b",

    /* ================================================================ */
    /* 7 · THE SHOT AND THE IMPACT                                       */
    /* ================================================================ */
    fireShake: 0.32, // the kick at the hand
    muzzleFlash: 0.18,
    muzzleSparks: 50,
    burstSize: 3.6, // the hard-light flash shell at the end, metres
    burstIntensity: 0.85,
    burstLife: 0.7, // seconds the shell takes to open and go
    burstFilament: 0.15, // the STORM filaments over the dark shell, × burstIntensity
    shellOpacity: 0.9, // the dark body of the impact shell
    shellRimGlow: 2.2, // its thin hot rim
    shellRimSharp: 7, // higher = thinner rim
    shellDisplace: 0.18, // how much it billows
    colorShellBody: "#14244a",
    colorShellDeep: "#050a18",
    floorRingGlow: 0.3, // brightness of the floor shock rings
    shockRadius3d: 5.5, // the ground shockwave at the end, metres
    scorchRadius: 2.4,
    debrisCount: 70,
    debrisSpeed: 9,
    debrisSize: 0.08,
    debrisLife: 1.2,
    debrisGravity: -14,
    impactSparks: 220,
    /* --- the end of the line keeps taking the beam while it burns --- */
    endHold: 0.75, // fraction of the beam's life the end keeps pulsing
    endPulseRate: 3.2, // pressure shells + floor rings per second at the end
    endPulseSize: 1.4, // metres, each pressure shell
    endRingRadius: 3.2, // metres, each floor ring
    endSparkRate: 260, // sparks/s splashing back off the end
    impactShake: 0.45,
    shakeDuration: 0.35,
    impactFlash: 0.16,
    colorBurstA: "#d8fdff",
    colorBurstB: "#7ff0ff",
    colorBurstC: "#1d5cff",
    colorFlash: "#c8fbff",
    colorDebrisA: "#3a3f45",
    colorDebrisB: "#2a2e33",
    colorDebrisC: "#1d2024",
    colorDebrisD: "#121416",

    /* ================================================================ */
    /* 8 · THE PIERCE                                                    */
    /* ================================================================ */
    hitRadius: 0.8, // metres either side of the line that are hit
    hitImpulse: 17, // m/s bodies are thrown down the line
    hitLift: 2.2,
    hitSpin: 1.2,
    hitSlice: 0, // 1 = the slug cuts the body in two
    hitBurn: 0.7, // 0..1 how far the hard light stains what it passes through
    hitSparks: 40, // sparks where a body is pierced
    look: {
      color: '#0a1a22', // the body, burnt through
      rimColor: '#7ff0ff',
      rimEmissive: 2.2,
      edgeColor: '#e8ffff',
      edgeEmissive: 5,
      edgeWidth: 0.05
    }
  }
};
