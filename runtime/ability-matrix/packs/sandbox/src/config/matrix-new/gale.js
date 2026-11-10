/**
 * Gale Sever — Wind — a refractive air blade with a spiral dust wake.
 *
 * Matrix New data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `GaleSeverAbility`, so
 * dragging any of it in the editor re-shapes a blade that is already in flight.
 */
export default {
  id: 'gale',
  meta: {
    label: "Gale Sever",
    accent: '#c8e6ff',
    key: 'Q',
    hint: "Wind — a crescent of compressed air that slices what it crosses and scars the floor",
    cast: 'line',
    glyph: `<path d="M12 70C30 34 64 24 90 30C66 34 42 48 28 76Z"/><path d="M20 84L40 80"/><path d="M34 90L58 84"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 22, // maximum cast distance, metres
    minRange: 1, // closer than this and the cast is refused
    speed: 28, // how fast the blade flies, metres/second
    lifetime: 2.2, // seconds the vortices, scar and wake linger after the blade has torn apart
    cooldown: 0.4, // seconds before the ability can be armed again
    castAnim: "cast1", // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: "#c8e6ff",
    lightIntensity: 6, // the blade's steady glow
    lightRadius: 9,
    lightFlicker: 0.3, // 0..1 how much it gusts

    /* ================================================================ */
    /* 1 · THE BLADE                                                     */
    /* ================================================================ */

    /* --- silhouette (metres unless noted) --- */
    shearRadius: 2.4, // half the blade's width, tip to tip — also the cut's reach
    arc: 2.3, // radians the crescent spans; low = a flat bar, high = a horseshoe
    bladeHeight: 1.3, // height the apex flies at — the rolled blade spans floor to head height
    bodyLength: 1.25, // depth of the crescent behind the edge at its middle
    taper: 0.75, // how quickly the body thins toward the tips
    sweepBack: 0.22, // tips swept behind the apex, × the arc radius
    bow: 0.08, // tips curled upward, × the arc radius
    roll: 0.72, // radians the blade is tilted about its flight line — a diagonal slash
    rollWobble: 0.07, // radians it rocks while flying
    wobbleSpeed: 7, // rocks per second (radians)
    flutter: 0.06, // metres the trailing body shivers
    flutterScale: 3, // features across the blade
    formTime: 0.12, // seconds the blade takes to snap open off the hand

    /* --- shading --- */
    edgeWidth: 0.045, // fraction of the body the cutting line occupies
    edgeGlow: 4.5, // brightness of the cutting line (bloom > 1)
    bodyOpacity: 0.42, // the transparent body behind the edge
    bodyFalloff: 1.6, // how fast the body fades toward its back
    rimGlow: 1.2, // extra glow when the blade is seen edge-on
    tipFade: 0.55, // how soft the tips are
    streakScale: 7, // wind lines across the body
    streakFlow: 3.2, // how fast they stream backward
    fringe: 1.1, // strength of the chromatic fringe behind the edge
    fringeOffset: 0.07, // where the first fringe band sits, fraction of the body
    fringeWidth: 0.035, // width of each band
    softFade: 0.4, // soft intersection with geometry, metres
    colorA: "#bfe6ff", // the body (ramp tint)
    colorB: "#ffffff", // the cutting edge
    colorFringeR: "#ff4f7a",
    colorFringeG: "#6dffb8",
    colorFringeB: "#5a78ff",

    /* --- the pressure sheath: the blade's body (lit, normal-blended) --- */
    sheathThickness: 0.34, // half-height of the cushion at the apex, metres
    sheathWidth: 0.5, // its half-depth, × the body depth
    sheathSeat: 0.4, // where it sits behind the edge, fraction of the body
    sheathTaper: 0.6, // how fast it thins toward the tips
    sheathOpacity: 0.62,
    sheathFresnel: 2.2, // rim power — the rim thins to the pale tint
    sheathNoise: 1, // 0 smooth .. 1 broken into streaming dust
    colorSheathTint: "#d9f2ff", // lit top (ramp: pale tint)
    colorSheathBody: "#4f97c6", // body (ramp: saturated)
    colorSheathDeep: "#0e2234", // underside (ramp: deep)

    /* ================================================================ */
    /* 2 · DISTORTION                                                    */
    /* ================================================================ */
    warpStrength: 1.3, // how hard the world bends through the blade
    warpWidth: 1.8, // depth of the lens, × the blade body
    warpLead: 0.25, // metres the bow wave runs ahead of the edge
    warpScale: 2.4, // noise features per metre
    warpSpeed: 3, // noise speed
    warpSwirl: 0.45, // noise share of the bend (the rest is a clean lens)

    /* ================================================================ */
    /* 3 · SPIRAL DUST WAKE                                              */
    /* ================================================================ */
    wakeRate: 240, // puffs/second shed from the two tip vortices
    wakeSize: 0.3, // puff size
    wakeRadius: 0.35, // radius of the vortex tube the puffs start on, metres
    vortexTurns: 0.9, // turns of the helix per metre the blade flies
    wakeSpeed: 2.4, // how fast they roll round the tube, m/s
    wakeTrail: 1.2, // how fast they fall back behind the blade, m/s
    wakeLift: 0.4, // drift upward, m/s
    wakeLifetime: 1.3,
    wakeOpacity: 0.42,
    wakeSwirl: 2.6, // curl about each puff's anchor, rad/s
    wakeExpand: 1.1, // how far the curl opens over a puff's life
    wakeDrag: 1.6,
    wakeTurbulence: 0.8,
    floorDust: 80, // puffs/second scoured off the floor under the blade
    floorDustSpeed: 3.2, // how hard they are thrown sideways, m/s
    ringSpacing: 2.4, // a dust ring on the floor every this many metres
    ringRadius: 1.5,
    ringLife: 1.1,
    ringIntensity: 0.7,
    colorRingA: "#6f6a62",
    colorRingB: "#b9b2a6",
    colorWakeA: "#e6f0f6",
    colorWakeB: "#a9bccb",
    colorWakeC: "#647b8f",
    colorWakeD: "#1f2c3a",

    /* ================================================================ */
    /* 4 · WIND LINES                                                    */
    /* ================================================================ */
    streakRate: 220, // per second
    streakSize: 0.035, // width
    streakSpeed: 1.0, // × the blade's own speed — <1 trails, >1 outruns it
    streakSpeedJitter: 0.5,
    streakSpiral: 4, // m/s round the flight line, so they corkscrew
    streakReach: 1.25, // radius they are born in, × the blade's half-width
    streakStretch: 0.35,
    streakLifetime: 0.32,
    streakGlow: 2.2,
    colorStreakA: "#ffffff",
    colorStreakB: "#d6f0ff",
    colorStreakC: "#9fd2ff",
    colorStreakD: "#2a5a8a",

    /* ================================================================ */
    /* 5 · THE CUT SCAR                                                  */
    /* ================================================================ */
    scarStart: 0.6, // metres in front of the caster the scar begins
    scarFollowTip: 1, // 0 cut on the centreline .. 1 cut where the low tip meets the floor
    scarCut: 0.1, // half-width of the slit, metres
    scarLips: 0.08, // width of the raised, light-catching lips
    scarScour: 1.5, // half-width of the band the wind scoured, metres
    scarScratches: 3, // parallel hairline cuts either side (max 6)
    scarScratchSpread: 0.45, // how far out they run, metres
    scarWiggle: 0.05, // metres the cut wanders
    scarWiggleScale: 0.6, // wanders per metre
    scarDark: 0.85, // opacity of the slit
    scarLipBright: 0.55, // opacity of the lips
    scarScourOpacity: 0.42,
    scarGlow: 2.4, // how hot the freshly cut floor shines
    scarGlowLength: 2.5, // metres behind the blade the shine dies over
    scarCool: 0.9, // seconds the shine takes to die once the blade has gone
    scarErode: 0.7, // 0..1 how raggedly it fades
    colorScarDeep: "#07080b",
    colorScarLip: "#d2dce8",
    colorScarScour: "#8d9aa5",
    colorScarGlow: "#bfe9ff",

    /* ================================================================ */
    /* 6 · IMPACT — the blade comes apart                                */
    /* ================================================================ */
    dissipateTime: 0.45, // seconds the blade takes to tear into wind
    dissipateGrow: 1.7, // how wide it opens as it goes
    dissipateDrift: 2.2, // metres it carries on past the target
    ribbonCount: 70, // wind ribbons it tears into
    ribbonSpeed: 16, // m/s
    ribbonSize: 0.06, // ribbon width
    ribbonStretch: 0.12, // how long they streak
    ribbonLifetime: 0.5,
    burstSize: 4.5, // the AIR pressure shell, metres
    burstIntensity: 1.3,
    shockRadius: 6,
    dustBurst: 22, // puffs thrown off the floor
    impactShake: 0.32,
    shakeDuration: 0.4,
    impactFlash: 0.22,
    impactLight: 1.2, // light punch on impact, × lightIntensity
    travelRumble: 0.1, // camera rumble while the blade flies
    castGust: 8, // puffs off the caster's feet as it is thrown
    castDraw: 46, // wind lines sucked into the hand as the blade winds up (anticipation)
    castDrawRadius: 1.6, // metres out they are drawn in from
    castDrawTime: 0.22, // seconds they take to arrive
    fanRadius: 3.8, // the blast fan combed into the floor where the blade tore, metres
    fanSpread: 0.3, // seconds it takes to spread to full size
    fanOpacity: 0.78,
    fanStreaks: 9, // how finely it is combed
    colorFan: "#15212b", // fan + scour deep (ramp: deep)
    colorBurstA: "#ffffff",
    colorBurstB: "#c8e6ff",
    colorBurstC: "#3f77a8",
    colorShockA: "#cfe9ff",
    colorShockB: "#ffffff",
    colorFlash: "#dff2ff",

    /* ================================================================ */
    /* 6b · THE SEVERED VORTICES — the linger                            */
    /* ================================================================ */
    vortexHeight: 3.4, // metres each tip vortex stands
    vortexBaseRadius: 0.26, // radius at the foot
    vortexTopRadius: 1.05, // radius at the top
    vortexFlare: 1.7, // how late it flares
    vortexSeat: 0.75, // either side of the line, × shearRadius
    vortexAlong: 0.4, // down the line, × dissipateDrift past the target
    vortexDrift: 0.45, // m/s the two drift apart
    vortexLean: 0.32, // metres the top leans out per metre of height
    vortexLeanForward: 0.5, // share of the lean that goes on down the line
    vortexRiseTime: 0.32, // seconds to rise (with an overshoot)
    vortexExit: 0.75, // seconds the unravel takes, at the end of the linger
    vortexLiftOff: 0.9, // metres the foot lifts off the floor as it unravels
    vortexSpin: 8, // rad/s — the two turn opposite ways
    vortexTwist: 1.4, // streamline twist, radians per metre up
    vortexStreams: 4,
    vortexWobble: 0.4, // metres it snakes
    vortexSwaySpeed: 1.3,
    vortexGlow: 1.6, // the streamline core
    vortexOpacity: 0.85, // the lit dust sheath
    vortexSheathScale: 1.22, // sheath radius × the core
    vortexDust: 120, // puffs/second drawn up the walls
    vortexUpdraft: 2.6, // m/s
    vortexStreakRate: 70, // wind lines/second wound round them
    vortexStreakSpeed: 6,
    footRadius: 1.3, // the spiral scoured under each foot, metres
    footArms: 3,
    footSpin: 0.35, // how fast the footprint turns, × the vortex spin
    colorVortexCore: "#ffffff", // ramp: white-hot core
    colorVortexTint: "#bfe6ff", // ramp: pale tint
    colorVortexBody: "#3f7fae", // ramp: saturated body
    colorVortexDeep: "#0d2033", // ramp: deep

    /* ================================================================ */
    /* 7 · THE SLICE                                                     */
    /* ================================================================ */
    sliceReach: 0.25, // extra metres past the tips that still cut
    sliceImpulse: 7, // m/s the halves leave along the blade's line
    sliceLift: 2.4, // m/s upward
    sliceSpin: 1.2, // tumble
    hitDust: 22 // puffs where a body is cut
  }
};
