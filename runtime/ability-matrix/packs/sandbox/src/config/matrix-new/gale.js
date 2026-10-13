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
    lifetime: 1.8, // seconds the scar and wake linger after the blade has gone
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
    shearRadius: 1.8, // half the blade's width, tip to tip — also the cut's reach
    arc: 2.3, // radians the crescent spans; low = a flat bar, high = a horseshoe
    bladeHeight: 1.0, // height the edge flies at — waist height slices a body
    bodyLength: 0.85, // depth of the crescent behind the edge at its middle
    taper: 0.75, // how quickly the body thins toward the tips
    sweepBack: 0.22, // tips swept behind the apex, × the arc radius
    bow: 0.08, // tips curled upward, × the arc radius
    roll: 0.12, // radians the blade is tilted about its flight line
    rollWobble: 0.07, // radians it rocks while flying
    wobbleSpeed: 7, // rocks per second (radians)
    flutter: 0.06, // metres the trailing body shivers
    flutterScale: 3, // features across the blade
    formTime: 0.12, // seconds the blade takes to snap open off the hand

    /* --- shading --- */
    edgeWidth: 0.045, // fraction of the body the cutting line occupies
    edgeGlow: 4.5, // brightness of the cutting line (bloom > 1)
    bodyOpacity: 0.32, // the transparent body behind the edge
    bodyFalloff: 1.6, // how fast the body fades toward its back
    rimGlow: 1.2, // extra glow when the blade is seen edge-on
    tipFade: 0.55, // how soft the tips are
    streakScale: 7, // wind lines across the body
    streakFlow: 3.2, // how fast they stream backward
    fringe: 1.1, // strength of the chromatic fringe behind the edge
    fringeOffset: 0.07, // where the first fringe band sits, fraction of the body
    fringeWidth: 0.035, // width of each band
    softFade: 0.4, // soft intersection with geometry, metres
    colorA: "#c8e6ff", // the body
    colorB: "#ffffff", // the cutting edge
    colorFringeR: "#ff4f7a",
    colorFringeG: "#6dffb8",
    colorFringeB: "#5a78ff",

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
    wakeOpacity: 0.28,
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
    colorWakeA: "#d8d4cc",
    colorWakeB: "#bdb6aa",
    colorWakeC: "#9a9184",
    colorWakeD: "#7c766c",

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
    colorStreakD: "#4f7fb0",

    /* ================================================================ */
    /* 5 · THE CUT SCAR                                                  */
    /* ================================================================ */
    scarStart: 0.6, // metres in front of the caster the scar begins
    scarCut: 0.07, // half-width of the slit, metres
    scarLips: 0.06, // width of the raised, light-catching lips
    scarScour: 0.9, // half-width of the band the wind scoured, metres
    scarScratches: 3, // parallel hairline cuts either side (max 6)
    scarScratchSpread: 0.45, // how far out they run, metres
    scarWiggle: 0.05, // metres the cut wanders
    scarWiggleScale: 0.6, // wanders per metre
    scarDark: 0.85, // opacity of the slit
    scarLipBright: 0.55, // opacity of the lips
    scarScourOpacity: 0.22,
    scarGlow: 2.4, // how hot the freshly cut floor shines
    scarGlowLength: 2.5, // metres behind the blade the shine dies over
    scarCool: 0.9, // seconds the shine takes to die once the blade has gone
    scarErode: 0.7, // 0..1 how raggedly it fades
    colorScarDeep: "#07080b",
    colorScarLip: "#d2dce8",
    colorScarScour: "#9c958a",
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
    colorBurstA: "#ffffff",
    colorBurstB: "#c8e6ff",
    colorBurstC: "#6d9cc8",
    colorShockA: "#cfe9ff",
    colorShockB: "#ffffff",
    colorFlash: "#dff2ff",

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
