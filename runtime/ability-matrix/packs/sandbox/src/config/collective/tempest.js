/**
 * Tempest Spiral — Wind — a tornado that lifts what it catches.
 *
 * Collective Originals data block: presentation (`meta`) and the live settings
 * the ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `TempestSpiralAbility`, so
 * dragging any of it in the editor re-shapes a column that is already standing.
 */
export default {
  id: 'tempest',
  meta: {
    label: "Tempest Spiral",
    accent: '#9fe8ff',
    key: 'Q',
    hint: "Wind — a tornado that lifts what it catches, then throws it",
    cast: 'zone',
    glyph: `<path d="M22 24H78M28 38H70M36 52H64M42 66H58M47 80H53"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 16, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 14, // how fast the dust devil skims to the circle, metres/second
    lifetime: 3.2, // seconds the column stands before it collapses
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: "cast3", // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 3.2, // the circle the indicator draws — and the reach of the lift, metres

    /* --- light --- */
    lightColor: "#9fe8ff",
    lightIntensity: 6, // the column's steady glow
    lightRadius: 9,
    lightHeight: 0.45, // where the light rides, × column height
    lightFlicker: 0.25, // 0..1 how much it gusts

    /* ================================================================ */
    /* 1 · THE DUST DEVIL (travel)                                       */
    /* ================================================================ */
    devilHeight: 1.5, // metres
    devilBase: 0.12, // radius where it touches the floor, metres
    devilTop: 0.55, // radius at its lip, metres
    devilSpin: 2.6, // turns/second
    devilSway: 0.18, // how far its top snakes, metres
    devilOpacity: 0.75,
    devilDust: 70, // smoke puffs/second kicked up behind it
    devilChips: 26, // grit/second it throws off
    devilRumble: 0.12, // camera rumble while it runs

    /* ================================================================ */
    /* 2 · THE FUNNEL                                                    */
    /* ================================================================ */
    /* --- silhouette (metres) --- */
    height: 8.5, // full height of the column
    baseRadius: 0.55, // radius where it meets the floor
    topRadius: 3.4, // radius at the top of the funnel
    flare: 2.1, // >1 stays thin low and flares late, <1 opens early
    riseTime: 0.55, // seconds for the column to climb to full height
    riseOvershoot: 0.08, // how far past full height it surges on arrival, × height
    sway: 0.9, // how far the top snakes off the axis, metres
    swayFrequency: 1.7, // bends along its height
    swaySpeed: 1.3, // how fast the bends travel
    wobble: 0.14, // noise on the radius, fraction
    wobbleScale: 1.6, // features per metre in that noise

    /* --- the two shells --- */
    spin: 1.15, // turns/second of the outer dust shell
    innerSpin: -1.7, // turns/second of the inner wind shell (negative = counter)
    innerScale: 0.72, // inner shell radius, × outer
    twist: 2.4, // radians the banding winds per unit of height
    rise: 1.6, // how fast the bands climb, units/second

    /* --- the banded filaments --- */
    bandScale: 2.4, // around-the-column frequency of the noise
    streak: 0.16, // along-the-spiral stretch (smaller = longer filaments)
    bandFrequency: 1.7, // horizontal bands per metre of height
    bandContrast: 0.55, // 0..1 how strongly the bands cut the body
    filament: 0.8, // 0..1 how much the ridged filaments carve the shell
    filamentSharp: 2.6, // filament tightness
    rimPower: 1.4, // facing ratio exponent — shells are densest edge-on
    rim: 0.7, // 0..1 how much the facing ratio drives alpha

    /* --- fades --- */
    floorFade: 0.6, // metres over which the funnel fades into the floor
    topFade: 0.22, // fraction of the height that feathers out at the lip
    softFade: 0.6, // metres — soft intersection against scene geometry
    collapseTime: 1.1, // seconds the funnel takes to thin out from the bottom up
    collapseSoft: 0.22, // width of the dissolving edge, fraction of the height
    collapseNoise: 0.25, // how ragged that edge is

    /* --- look --- */
    outerOpacity: 0.62,
    innerOpacity: 0.55,
    innerGlow: 2.2, // emissive gain of the additive wind shell
    filamentGlow: 1.4, // how much brighter a filament is than the body
    colorFunnelBase: "#5d5446", // dust-dark where it scours the floor
    colorFunnelMid: "#8f8b80", // the body
    colorFunnelTop: "#cfe6ee", // pale where it thins into cloud
    colorFilament: "#e4fbff", // filament highlights
    colorWind: "#9fe8ff", // inner wind shell

    /* ================================================================ */
    /* 3 · THE DUST SKIRT                                                */
    /* ================================================================ */
    skirtRadius: 2.4, // metres the dust spreads at the base
    skirtRate: 140, // puffs/second
    skirtSize: 1.1,
    skirtSpeed: 2.6, // how hard it is thrown outward
    skirtLifetime: 1.7,
    skirtOpacity: 0.42,
    skirtSwirl: 2.2, // rad/s it is wound round the base
    skirtExpand: 0.9, // how far the swirl spreads over a puff's life
    skirtRise: 0.35, // m/s
    skirtTurbulence: 0.7,
    ringInterval: 0.32, // seconds between dust-ring decals at the base
    ringLife: 1.4,
    ringIntensity: 0.8,
    colorDustA: "#a0927b",
    colorDustB: "#857a68",
    colorDustC: "#6b6457",
    colorDustD: "#4b4740",
    colorRingA: "#6e6352",
    colorRingB: "#a89a82",

    /* ================================================================ */
    /* 4 · DEBRIS                                                        */
    /* ================================================================ */
    debrisRate: 70, // chips/second fed into the column
    debrisSize: 0.07,
    debrisClimb: 5.5, // m/s the debris climbs
    debrisDrag: 0.45, // how soon it stalls high in the column
    debrisSwirl: 3.4, // rad/s it orbits
    debrisExpand: 1.6, // how far the orbit opens as it climbs
    debrisLifetime: 2.2,
    debrisGravity: -0.6,
    debrisFling: 110, // chips thrown out when the column collapses
    debrisFlingSpeed: 11,
    colorDebrisA: "#8a7b66",
    colorDebrisB: "#6f6352",
    colorDebrisC: "#5a5045",
    colorDebrisD: "#3a352f",

    /* ================================================================ */
    /* 5 · WIND STREAKS                                                  */
    /* ================================================================ */
    streakRate: 90, // per second
    streakSize: 0.05,
    streakSpeed: 14, // tangential, m/s
    streakStretch: 0.22,
    streakLifetime: 0.4,
    streakReach: 1.25, // spawn radius, × local funnel radius
    streakGlow: 1.6,
    colorStreakA: "#ffffff",
    colorStreakB: "#d6f6ff",
    colorStreakC: "#9fe8ff",
    colorStreakD: "#4aa6c8",

    /* ================================================================ */
    /* 6 · DISTORTION                                                    */
    /* ================================================================ */
    warpStrength: 0.9,
    warpWidth: 2.4, // × skirt radius
    warpHeight: 0.5, // × column height
    warpScale: 1.6,
    warpSpeed: 2.2,
    warpSwirl: 1.4,

    /* ================================================================ */
    /* 7 · IMPACT + THE LIFT                                             */
    /* ================================================================ */
    burstSize: 4.2, // the pressure shell on touchdown, metres
    burstIntensity: 1.1,
    shockRadius: 5.5,
    impactShake: 0.42,
    shakeDuration: 0.5,
    impactFlash: 0.18,
    colRumble: 0.18, // rumble while the column stands
    colorBurstA: "#e8fbff",
    colorBurstB: "#9fe8ff",
    colorBurstC: "#4f7c8c",
    colorShockA: "#9fe8ff",
    colorShockB: "#ffffff",
    colorFlash: "#d8f6ff",

    /* --- what it does to the bodies --- */
    liftImpulse: 1.5, // the knock that takes them off their feet, m/s
    liftKick: 3.5, // the upward kick on that knock, m/s
    liftSpin: 1.2,
    liftSpeed: 4.2, // m/s up the column
    liftCeiling: 0.62, // where they hang, × column height
    liftOrbit: 7.0, // tangential m/s round the column
    liftPull: 2.6, // how hard they are held at the funnel radius
    liftRadius: 0.85, // that radius, × the funnel's own at that height
    liftGrab: 5.0, // how quickly the current takes them (per second)
    liftBuoyancy: 0.92, // how much of the body's weight the wind carries
    flingSpeed: 13, // outward, m/s, when the column lets go
    flingLift: 4.0 // upward, m/s, on the throw
  }
};
