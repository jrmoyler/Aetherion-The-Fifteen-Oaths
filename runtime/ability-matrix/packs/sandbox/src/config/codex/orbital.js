/**
 * Orbital Strike — Tech — a targeting laser paints the circle, then a beam from
 * orbit burns it out.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so `settings.js`
 * can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `OrbitalStrikeAbility`, so
 * dragging any of it in the editor re-shapes a reticle that is still locking,
 * a beam that is already burning, a crater that is already cooling.
 */
export default {
  id: 'orbital',
  meta: {
    label: "Orbital Strike",
    accent: '#ff5f5f',
    key: '',
    element: 'tech',
    hint: "Tech — a targeting laser locks the circle, then a beam from orbit vaporises everything in it",
    cast: 'zone',
    glyph: `<circle cx="50" cy="62" r="24"/><circle cx="50" cy="62" r="11"/><path d="M50 4V52"/><path d="M26 62H36"/><path d="M64 62H74"/><path d="M50 86V92"/><path d="M42 12L50 4L58 12"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum distance to the circle's centre, metres
    minRange: 0,
    speed: 30, // how fast the laser's spot runs out to the circle, metres/second
    lifetime: 2.6, // seconds the crater glows and cools after the beam cuts out
    cooldown: 1.2,
    castAnim: "cast3", // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4, // radius of the circle that is burnt out, metres

    /* --- light --- */
    lightColor: "#ff5f5f", // the targeting light
    lightIntensity: 6,
    lightRadius: 8,
    beamLightColor: "#fff0d8", // the light once the beam is down
    lightFlicker: 0.3, // 0..1 how much the beam's light gutters
    lockLight: 1.4, // light while locked, × intensity
    strikeLight: 6, // light while the beam burns, × intensity
    lightHeight: 2.5, // metres above the floor the light hangs

    /* accent pair */
    colorA: "#ff5f5f",
    colorB: "#ffffff",

    /* ================================================================ */
    /* 1 · THE TARGETING LASER                                           */
    /* ================================================================ */
    skyHeight: 46, // metres up the laser and the beam come from
    skyLean: 7, // metres the source sits back toward the caster — the beam is not quite vertical
    laserWidth: 0.022, // radius, metres
    laserGlow: 6,
    laserFlicker: 0.35,
    laserPulseScale: 0.35, // pulses per metre racing down it
    laserPulseSpeed: 9, // pulses per second
    laserDot: 0.28, // radius of the hot spot it paints on the floor, metres
    paintTime: 0.45, // seconds the spot takes to circle the edge
    paintLaps: 1, // times round the edge
    colorLaserCore: "#ffd6cf",
    colorLaser: "#ff2a2a",

    /* ================================================================ */
    /* 2 · THE RETICLE                                                   */
    /* ================================================================ */
    lockTime: 1.3, // seconds from the laser landing to the lock
    tightenFrom: 1.7, // the reticle starts this much wider than the circle
    reticleGlow: 2.6,
    reticleOpacity: 0.85,
    ringWidth: 0.05, // metres
    innerRing: 0.6, // inner ring, × the radius
    segments: 8, // segments round the outer ring
    segmentGap: 0.22, // gap between them, fraction of a segment
    spinOuter: 0.7, // rad/s
    spinInner: -1.3, // rad/s
    ticks: 48, // tick marks round the outside
    tickLength: 0.22, // metres
    sweepOpacity: 0.32, // the countdown sweep's wash
    glyphCount: 4, // warning glyphs round the circle (max 8)
    glyphSize: 0.42, // metres
    glyphRadius: 0.8, // where they sit, × the radius
    glyphBlink: 5, // blinks per second
    crossGap: 0.3, // gap in the crosshair at the centre, × the radius
    gridOpacity: 0.12, // the faint hex grid filling the circle
    lockFlash: 1.6, // how bright the reticle flares on lock
    lockBlink: 14, // blinks per second once locked
    lockShake: 0.14, // the lock-on chirp in the camera
    chirpFreq: 42, // its frequency
    colorReticle: "#ff3b3b",
    colorReticleHot: "#ffd8cc",
    colorReticleDeep: "#5a0008",

    /* ================================================================ */
    /* 3 · THE BEAM                                                      */
    /* ================================================================ */
    strikeDelay: 0.2, // seconds between the lock and the beam
    beamDrop: 0.12, // seconds the beam takes to come down from orbit
    strikeTime: 1.6, // seconds the beam burns
    cutTime: 0.4, // seconds it takes to narrow to a thread and cut out
    beamRadius: 1.5, // radius of the outer layer, metres
    coreFrac: 0.3, // the white core, × the radius
    midFrac: 0.62, // the middle layer, × the radius
    beamFlare: 0.65, // how much it flares where it hits the floor, × the radius
    flareHeight: 1.4, // metres the flare reaches up
    beamSweep: 0.22, // how far it wanders inside the circle, × the zone radius
    sweepSpeed: 1.2, // wanders per second
    beamPulse: 0.12, // radius breathing
    pulseSpeed: 24, // breaths per second
    coreGlow: 9,
    midGlow: 3.4,
    outerGlow: 1.3,
    outerOpacity: 0.55,
    energyScale: 1.1, // energy features per metre
    energyFlow: 22, // metres/second the energy pours down
    energyContrast: 0.65,
    threadWidth: 0.04, // radius it narrows to before it cuts, metres
    softFade: 0.6, // soft intersection with the floor, metres
    colorBeamCore: "#ffffff",
    colorBeamMid: "#fff0c4",
    colorBeamOuter: "#ff7a45",
    colorBeamRim: "#ff3322",

    /* --- heat bend round the column (LAYER.DISTORTION) --- */
    warpStrength: 1.3,
    warpWidth: 2.1, // × the beam radius
    warpScale: 1.3,
    warpSpeed: 5,

    /* ================================================================ */
    /* 4 · THE CRATER                                                    */
    /* ================================================================ */
    craterRadius: 0.85, // × the zone radius
    craterGrow: 0.7, // seconds the molten pool takes to spread
    moltenFrac: 0.62, // the molten pool, × the crater
    craterCells: 1.8, // crust cells per metre
    craterGlow: 4.5,
    crackGlow: 2.4, // the seams once it crusts over
    rimWidth: 0.16, // the raised rim, × the crater
    scorchRadius: 1.35, // the scorch around it, × the crater
    scorchOpacity: 0.85,
    coolTime: 1.8, // seconds it takes to crust over once the beam has gone
    colorMoltenHot: "#fff4d2",
    colorMoltenWarm: "#ff9a2a",
    colorMoltenCool: "#9a1606",
    colorCrust: "#0d0807",
    colorScorch: "#140d0a",
    colorRim: "#ff6a30",

    /* ================================================================ */
    /* 5 · SPARKS, EMBERS, SMOKE, DEBRIS                                 */
    /* ================================================================ */
    sparkRate: 420, // per second while the beam burns
    sparkSpeed: 12,
    sparkSize: 0.045,
    sparkLife: 0.6,
    sparkStretch: 0.3,
    sparkGravity: -14,
    sparkGlow: 3.5,
    colorSparkA: "#ffffff",
    colorSparkB: "#ffe2a0",
    colorSparkC: "#ff8a30",
    colorSparkD: "#a02208",
    emberRate: 170, // per second, carried up the updraft
    emberSize: 0.07,
    emberRise: 9, // m/s
    emberLife: 1.5,
    emberGlow: 3,
    colorEmberA: "#fff6d8",
    colorEmberB: "#ffb050",
    colorEmberC: "#ff5a1a",
    colorEmberD: "#5a0a02",
    smokeRate: 55, // per second, rolling off the rim
    smokeSize: 1.1,
    smokeRise: 2.4, // m/s
    smokeSpread: 1.8, // m/s outward
    smokeLife: 2.8,
    smokeOpacity: 0.42,
    colorSmokeA: "#5c4a42",
    colorSmokeB: "#3e3330",
    colorSmokeC: "#2a2422",
    colorSmokeD: "#181514",
    debrisCount: 70,
    debrisSpeed: 11,
    debrisSize: 0.12,
    debrisLife: 1.5,
    colorDebrisA: "#ffb060",
    colorDebrisB: "#5a2a18",
    colorDebrisC: "#2a1a14",
    colorDebrisD: "#141010",

    /* ================================================================ */
    /* 6 · THE HIT                                                       */
    /* ================================================================ */
    burstSize: 4.2, // the fireball shell when it lands, metres
    burstIntensity: 1.3,
    shockRadius: 10, // the ground shockwave, metres
    impactShake: 0.9,
    shakeDuration: 0.7,
    strikeRumble: 0.3, // camera rumble while it burns
    impactFlash: 0.35,
    cutShake: 0.18,
    cutFlash: 0.15,
    colorBurstA: "#ffffff",
    colorBurstB: "#ffd08a",
    colorBurstC: "#ff4a22",
    colorShockA: "#ffd0b0",
    colorShockB: "#ffffff",
    colorFlash: "#fff0dc",

    /* ================================================================ */
    /* 7 · VAPORISE — what happens to the bodies inside                  */
    /* ================================================================ */
    killFrac: 1.0, // reach, × the zone radius
    hitImpulse: 2, // m/s outward when the beam lands
    hitLift: 8, // m/s upward when the beam lands
    hitSpin: 2.2,
    updraft: 10, // m/s the column's updraft carries a body up
    updraftCeiling: 9, // metres up the updraft runs out
    pullIn: 2.2, // m/s drawn toward the axis
    swirl: 1.6, // m/s round it
    grab: 3.5, // how hard the updraft takes hold, per second
    buoyancy: 0.85, // 0..1 how much of a body's weight it carries
    vaporiseTime: 1.1, // seconds a body takes to burn away in the beam
    stainTime: 0.35, // seconds to go white-hot
    look: {
      color: '#1a0a04', // the body, carbonised
      rimColor: '#ffb070',
      rimEmissive: 3.0,
      edgeColor: '#fff2d0',
      edgeEmissive: 6.0,
      edgeWidth: 0.07
    }
  }
};
