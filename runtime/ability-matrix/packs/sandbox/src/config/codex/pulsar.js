/**
 * Pulsar Lash — Cosmic — a neutron star spun up in the hand and flung down the
 * line, its twin beams sweeping round like a lighthouse turned on its side and
 * lashing the floor crosswise; at the target it over-spins, quakes, and pins
 * one beam straight down through whatever stands there.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `PulsarLashAbility`, so
 * dragging any of it in the editor re-shapes a star that is already in flight —
 * its spin, its beams' reach and curl, the scars it is burning.
 */
export default {
  id: 'pulsar',
  meta: {
    label: 'Pulsar Lash',
    accent: '#d8ccff',
    key: '',
    element: 'cosmic',
    hint: 'Cosmic — a spinning neutron star rides the line, its twin beams lashing the floor, then quakes and pins the target',
    cast: 'line',
    glyph: `<circle cx="50" cy="50" r="7"/><path d="M50 50C40 34 22 26 10 30"/><path d="M50 50C60 66 78 74 90 70"/><path d="M38 62C30 56 30 44 38 38"/><path d="M62 38C70 44 70 56 62 62"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 10, // metres/second the star travels down the line once flung
    lifetime: 1.6, // seconds the scars take to cool and erode after the star is gone
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light (rides the star) --- */
    lightColor: '#d8ccff',
    lightIntensity: 7,
    lightRadius: 10,
    lightStrobe: 0.55, // 0..1 how much the light blinks with the beams

    /* ================================================================ */
    /* 1 · SPIN-UP — the star forms in the hand                          */
    /* ================================================================ */
    handForward: 0.8, // metres in front of the caster it forms
    handSide: 0.15, // metres to the right
    handHeight: 1.5, // metres off the floor
    spinUpTime: 0.42, // seconds it spins up in the hand before it is flung
    flightHeight: 1.75, // metres off the floor it rides the line at
    starBob: 0.12, // metres it wobbles up and down in flight

    /* ================================================================ */
    /* 2 · THE STAR                                                      */
    /* ================================================================ */
    starRadius: 0.3, // metres
    starGlow: 6.5, // crust brightness (bloom > 1)
    hotspotGlow: 3.5, // the two magnetic poles
    surfaceScale: 3.5, // crust features per unit of surface
    surfaceSpeed: 1.4, // how fast the crust crawls
    colorStarA: '#ffffff', // white-hot
    colorStarB: '#efe8ff',
    colorStarC: '#a990ff', // violet limb
    colorStarD: '#4b2cd8',

    /* ================================================================ */
    /* 3 · SPIN & BEAMS                                                  */
    /* ================================================================ */
    spinRate: 1.7, // revolutions per second in flight
    inclination: 78, // degrees between the spin axis and the beams
    axisTilt: 4, // degrees the spin axis is tipped up off the line
    beamLength: 7.5, // metres each beam reaches
    beamRootRadius: 0.05, // thickness where it leaves the star
    beamTipRadius: 0.42, // thickness at its far end — a cone of light
    beamLag: 1.0, // radians the beam curls back against the spin over its length
    beamGlow: 5.5, // white core seen face-on
    beamEdgeGlow: 1.4, // violet rim at its silhouette
    beamCore: 2.6, // core thinness
    beamFalloff: 1.1, // how fast it dims toward its end
    beamFlow: 10, // metres/second the light streams outward
    beamFlowScale: 1.1, // flow features per metre
    pulseRate: 5, // radio pulses per second racing out along the beams
    pulseSpacing: 1.5, // metres between pulses
    pulseGlow: 2.6, // how much brighter a pulse is
    beamOpacity: 0.95,
    softFade: 0.35, // soft intersection with the floor, metres
    colorBeamA: '#ffffff',
    colorBeamB: '#e4dcff',
    colorBeamC: '#9b80ff',
    colorBeamD: '#4a28ff',

    /* ================================================================ */
    /* 4 · MAGNETOSPHERE                                                 */
    /* ================================================================ */
    fieldLines: 6, // dipole loops round the magnetic axis (max 10)
    fieldShell: 1.0, // metres the loops reach out at the equator
    fieldRadius: 0.012, // loop thickness, metres
    fieldTwist: 0.8, // radians each loop is wound round the axis
    fieldGlow: 1.8,
    fieldFlow: 9, // how fast charge streams along the loops
    colorField: '#7f63ff',
    colorFieldHot: '#e9e2ff',

    /* ================================================================ */
    /* 5 · STROBE & LENS                                                 */
    /* ================================================================ */
    flareSize: 1.3, // radius of the corona round the star, metres
    flareGlow: 1.6, // its steady brightness
    strobeGlow: 4.5, // the blink when a beam swings toward you
    strobeSharpness: 8, // how brief the blink is
    flareRays: 4, // diffraction spikes
    colorFlareCore: '#ffffff',
    colorFlareHalo: '#b39dff',
    lensRadius: 1.8, // metres of warped air round the star
    lensStrength: 0.7,

    /* ================================================================ */
    /* 6 · THE SCARS — lash marks on the floor                           */
    /* ================================================================ */
    scarWidth: 0.09, // half-width of the white slit, metres
    scarGlowWidth: 0.45, // the glow bleeding round it, metres
    scarGlow: 4.5,
    scarCool: 0.9, // seconds a scar takes to cool from white to violet
    scarJitter: 0.05, // metres the burnt line wanders
    scarCharOpacity: 0.6, // how dark the burn left behind is
    scarMinStep: 0.15, // metres the footprint moves before a new segment is laid
    colorScarA: '#ffffff',
    colorScarB: '#c8b4ff',
    colorScarC: '#5a3cff',
    colorScarChar: '#120a22',

    /* ================================================================ */
    /* 7 · PARTICLES                                                     */
    /* ================================================================ */
    sparkRate: 240, // per second per beam, where it drags across the floor
    sparkSpeed: 7, // m/s
    sparkSize: 0.03,
    sparkStretch: 0.25,
    sparkLife: 0.45,
    sparkGravity: 9,
    sparkGlow: 3.5,
    colorSparkA: '#ffffff',
    colorSparkB: '#e2d8ff',
    colorSparkC: '#9a7cff',
    colorSparkD: '#3b1fb0',
    moteRate: 110, // per second shed off the star and the beams
    moteSize: 0.045,
    moteSpeed: 0.8,
    moteLife: 1.0,
    moteGlow: 2.6,
    colorMoteA: '#ffffff',
    colorMoteB: '#d6caff',
    colorMoteC: '#8466ff',
    colorMoteD: '#2a1470',
    dustRate: 50, // per second of burnt dust off the scars
    dustSize: 0.45,
    dustLift: 0.6,
    dustLife: 1.4,
    dustOpacity: 0.28,
    colorDustA: '#3a2c5c',
    colorDustB: '#241a3c',
    colorDustC: '#18122a',
    colorDustD: '#0e0a18',

    /* ================================================================ */
    /* 8 · OVER-SPIN, QUAKE & PIN                                        */
    /* ================================================================ */
    overspinTime: 0.5, // seconds the star spins up at the target
    overspinRate: 4.5, // × spin it reaches
    glitchSnap: 0.07, // seconds the beams take to lock vertical at the quake
    pinTime: 0.45, // seconds one beam stays driven into the floor
    pinWidth: 1.8, // × beam thickness while pinned
    collapseTime: 0.35, // seconds the star takes to wink out
    quakeScars: 7, // radial burns cracked out round the pin
    quakeScarLength: 2.4, // metres
    quakeSparks: 160,
    glitchRadius: 3.2, // metres round the pin that are thrown
    burstSize: 2.4, // the STORM shell, metres
    burstIntensity: 1.3,
    shockRadius: 6.5, // the shockwave on the floor, metres
    glitchFlash: 0.45,
    glitchShake: 0.5,
    shakeDuration: 0.4,
    glitchLight: 3, // light punch, × lightIntensity
    travelRumble: 0.05, // camera rumble while the beams lash
    colorBurstA: '#ffffff',
    colorBurstB: '#b8a4ff',
    colorBurstC: '#4a28ff',
    colorShockA: '#9d86ff',
    colorShockB: '#ffffff',
    colorFlash: '#d4c8ff',

    /* ================================================================ */
    /* 9 · HITS                                                          */
    /* ================================================================ */
    hitWidth: 0.7, // metres either side of a lash mark that it catches
    hitImpulse: 8, // m/s thrown the way the beam swept
    hitLift: 3.2,
    hitSpin: 2,
    hitSlice: 1, // 1 the lash cuts bodies in two, 0 it only knocks them down
    glitchImpulse: 12, // m/s thrown out from the pin
    glitchLift: 7,
    glitchSpin: 2.6
  }
};
