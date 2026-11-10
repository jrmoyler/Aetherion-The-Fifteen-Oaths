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
    devilHeight: 2.3, // metres
    devilBase: 0.16, // radius where it touches the floor, metres
    devilTop: 0.85, // radius at its lip, metres
    devilSpin: 2.6, // turns/second
    devilSway: 0.18, // how far its top snakes, metres
    devilOpacity: 0.9,
    devilDust: 110, // smoke puffs/second kicked up behind it
    devilChips: 26, // grit/second it throws off
    devilRumble: 0.12, // camera rumble while it runs

    /* ================================================================ */
    /* 2 · THE FUNNEL                                                    */
    /* ================================================================ */
    /* --- silhouette (metres) --- */
    height: 4.3, // full height of the column — kept inside the 8 m capture frame
    baseRadius: 0.85, // radius where it meets the floor
    topRadius: 2.75, // radius at the top of the funnel
    flare: 1.35, // >1 stays thin low and flares late, <1 opens early
    riseTime: 0.55, // seconds for the column to climb to full height
    riseOvershoot: 0.02, // how far past full height it surges on arrival, × height
    sway: 0.7, // how far the top snakes off the axis, metres
    swayFrequency: 1.7, // bends along its height
    swaySpeed: 1.3, // how fast the bends travel
    wobble: 0.14, // noise on the radius, fraction
    wobbleScale: 1.6, // features per metre in that noise

    /* --- the visible funnel (presentation only) ---
       The lift above (height, baseRadius, topRadius, flare) is the gameplay
       profile the bodies are carried along; the shell drawn on screen has its
       own, narrower silhouette: a rope-thin foot that tapers up into a column
       and only opens toward the top, which is kept inside the 8 m frame. */
    funnelHeight: 3.95, // metres the drawn column stands — top stays under 4.3 m
    funnelFoot: 0.32, // radius where the drawn funnel touches the floor, metres
    funnelTop: 2.7, // radius at its lip, metres
    funnelFlare: 2.3, // >1 stays a narrow column low and opens late
    spiralBands: 3, // helical cloud bands wrapping the column
    spiralTurns: 0.7, // turns each band makes from foot to lip
    spiralWidth: 0.5, // 0..1 how much of the wall a band covers
    spiralContrast: 0.85, // 0..1 how hard the bands cut the body
    spiralLight: 0.34, // how far up the ramp a band's sun side climbs
    spiralBulge: 0.08, // how far a band rolls out of the wall, fraction of the radius
    throatDark: 0.6, // 0..1 how dark the inside of the funnel (seen through the lip) goes
    rimLight: 0.75, // backlit edge on the silhouette, so the dark column reads against the night sky
    dustSoftFade: 0.35, // metres — how softly the dust meets the floor (smaller = it sits on the ground)

    /* --- the two shells --- */
    spin: 1.15, // turns/second of the outer dust shell
    innerSpin: -1.7, // turns/second of the inner wind shell (negative = counter)
    innerScale: 0.72, // inner shell radius, × outer
    twist: 2.4, // radians the banding winds per unit of height
    rise: 1.6, // how fast the bands climb, units/second

    /* --- the banded filaments --- */
    bandScale: 2.4, // around-the-column frequency of the noise
    streak: 0.16, // along-the-spiral stretch (smaller = longer filaments)
    bandFrequency: 0.75, // horizontal bands per metre of height
    bandContrast: 0.55, // 0..1 how strongly the bands cut the body
    bandBulge: 0.05, // how far each cloud band rolls out of the wall, fraction of the radius
    filament: 0.5, // 0..1 how much the ridged filaments carve the shell
    filamentSharp: 2.6, // filament tightness
    rimPower: 1.4, // facing ratio exponent — shells are densest edge-on
    rim: 0.35, // 0..1 how much the facing ratio drives alpha

    /* --- fades --- */
    floorFade: 0.35, // metres over which the funnel fades into the floor
    topFade: 0.38, // fraction of the height that feathers out at the lip
    softFade: 0.6, // metres — soft intersection against scene geometry
    collapseTime: 1.1, // seconds the funnel takes to thin out from the bottom up
    collapseSoft: 0.22, // width of the dissolving edge, fraction of the height
    collapseNoise: 0.25, // how ragged that edge is

    /* --- look --- */
    outerOpacity: 0.95,
    outerDensity: 2.6, // dust shell alpha multiplier: a tornado is mostly dirt and has weight
    sunLift: 0.16, // how far the sun-side of each band roll climbs the ramp — form against the night sky
    bodyFloor: 0.86, // 0..1 the least opacity anywhere on the dust shell — a column, not a veil
    innerOpacity: 0.08,
    innerGlow: 0.3, // emissive gain of the additive wind shell
    filamentGlow: 0.7, // how much brighter a filament is than the body
    colorFunnelBase: "#2e251b", // dust-dark where it scours the floor
    colorFunnelMid: "#2c363d", // the body — storm slate
    colorFunnelTop: "#5c6a73", // pale where it thins into cloud
    colorFilament: "#9fb1ba", // filament highlights
    colorWind: "#5f9fb3", // inner wind shell
    colorFunnelDeep: "#06090c", // storm-dark deep stop between filaments and bands
    deepMix: 0.85, // 0..1 how far the gaps between filaments fall to it
    innerDeepMix: 0.5, // the same on the additive wind shell (darker = less glow)
    bandDark: 0.85, // 0..1 how dark the gaps between the cloud bands go

    /* ================================================================ */
    /* 3 · THE DUST SKIRT                                                */
    /* ================================================================ */
    skirtRadius: 2.4, // metres the dust spreads at the base
    skirtRate: 110, // puffs/second
    skirtSize: 1.0,
    skirtSpeed: 2.6, // how hard it is thrown outward
    skirtLifetime: 1.7,
    skirtOpacity: 0.7,
    skirtSwirl: 2.2, // rad/s it is wound round the base
    skirtExpand: 0.9, // how far the swirl spreads over a puff's life
    skirtRise: 0.12, // m/s
    skirtTurbulence: 0.7,
    ringInterval: 0.32, // seconds between dust-ring decals at the base
    ringLife: 1.4,
    ringIntensity: 0.55,
    /* --- the ground-contact cloud: a dark collar of dirt hugging the foot --- */
    footCloudRate: 320, // puffs/second boiling round the foot
    footCloudSize: 1.4, // puff size
    footCloudHeight: 0.7, // metres it hugs the floor to
    footCloudSpread: 3.2, // radius it is thrown to, × the drawn foot radius

    /* --- the scoured floor (a field shader, stays for the linger) --- */
    scourRadius: 1.45, // × skirtRadius
    scourGrowTime: 0.6, // seconds to spread out from the foot
    scourOpacity: 0.96,
    scourWind: 1.7, // log-spiral winding of the grooves
    scourGrooves: 16, // grooves round the disc
    scourGrooveDepth: 0.9, // relief of the grooves under the sun
    scourBowl: 0.32, // the gouged bowl under the foot, × radius
    scourGrit: 0.85, // pale grit flecks
    scourLipGlow: 0.6, // the rim of thrown grit round the bowl
    scourLift: 0.018, // metres off the floor
    telegraphScour: 0.35, // the floor at the circle is already raked this far as the devil arrives
    telegraphDust: 90, // dust/second drawn in and wound up at the circle during travel
    telegraphRadius: 0.9, // × skirtRadius
    scourHold: 0.65, // 0..1 how much of the collapse the scoured floor survives before it fades
    colorScourDeep: "#0d0f12",
    colorScourBody: "#3b3226",
    colorScourTint: "#9c8b70",
    colorScourLip: "#6d6150",
    colorDustA: "#93826a",
    colorDustB: "#5f5546",
    colorDustC: "#463f35",
    colorDustD: "#26221d",
    colorRingA: "#3d362c",
    colorRingB: "#6f6556",

    /* ================================================================ */
    /* 4 · DEBRIS                                                        */
    /* ================================================================ */
    debrisRate: 260, // chips/second fed into the column
    debrisSize: 0.4,
    debrisClimb: 4.2, // m/s the debris climbs
    debrisDrag: 0.7, // how soon it stalls high in the column
    debrisSwirl: 3.4, // rad/s it orbits
    debrisExpand: 1.6, // how far the orbit opens as it climbs
    debrisLifetime: 2.2,
    debrisGravity: -0.6,
    debrisFling: 110, // chips thrown out when the column collapses
    debrisFlingSpeed: 11,
    colorDebrisA: "#8f7d63",
    colorDebrisB: "#6c5d4a",
    colorDebrisC: "#463e35",
    colorDebrisD: "#2a2621",

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
    warpStrength: 0.45,
    warpWidth: 2.4, // × skirt radius
    warpHeight: 0.5, // × column height
    warpScale: 1.6,
    warpSpeed: 2.2,
    warpSwirl: 1.4,

    /* ================================================================ */
    /* 7 · IMPACT + THE LIFT                                             */
    /* ================================================================ */
    burstSize: 4.2, // the pressure shell on touchdown, metres
    burstIntensity: 0.8,
    shockRadius: 5.5,
    impactShake: 0.42,
    shakeDuration: 0.5,
    impactFlash: 0.18,
    colRumble: 0.18, // rumble while the column stands
    colorBurstA: "#cfe6ee",
    colorBurstB: "#5f7f8c",
    colorBurstC: "#1a252c",
    colorShockA: "#1d4a5c",
    colorShockB: "#6fb6cc",
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
