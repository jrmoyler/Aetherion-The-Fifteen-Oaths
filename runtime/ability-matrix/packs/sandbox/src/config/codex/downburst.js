/**
 * Downburst — Wind — a storm cloud gathers over the circle and drops a column
 * of air onto it.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so `settings.js`
 * can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `DownburstAbility`, so
 * dragging any of it in the editor re-shapes a cast that is already falling.
 * Times are seconds on the cast's own clock, which starts the moment the herald
 * gust arrives over the circle.
 */
export default {
  id: 'downburst',
  meta: {
    label: "Downburst",
    accent: '#cfe3ff',
    key: '',
    element: 'wind',
    hint: "Wind — a storm cloud gathers over the circle and slams a column of air down onto it, flattening everything",
    cast: 'zone',
    glyph: `<path d="M18 30C26 18 44 16 52 24C60 14 80 18 82 32C90 34 90 44 80 46L22 46C12 46 10 34 18 30Z"/><path d="M38 52L38 70"/><path d="M50 52L50 74"/><path d="M62 52L62 70"/><path d="M14 84C26 76 38 78 50 82C62 78 74 76 86 84"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 0, // closer than this and the cast is refused
    speed: 24, // how fast the herald gust runs to the circle, metres/second
    lifetime: 2, // seconds the dust takes to settle after the slam
    cooldown: 0.5, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4, // the circle, metres — everything else is sized off it
    colorA: '#cfe3ff', // accent: the cold wind light
    colorB: '#ffffff', // accent: the hot core of it

    /* --- light --- */
    lightColor: '#cfe3ff',
    lightIntensity: 6, // the steady glow under the cloud
    lightRadius: 8,
    lightHeight: 2.5, // metres above the circle the light sits
    lightFlicker: 0.35, // 0..1 how much it gutters with the lightning

    /* --- the herald: a gust running out to the circle and up into the sky --- */
    heraldRate: 220, // streaks per second shed off it
    heraldClimb: 0.7, // 0..1 how far up toward the cloud it climbs on the way

    /* ================================================================ */
    /* TIMING                                                            */
    /* ================================================================ */
    gatherTime: 1.15, // the cloud swirling together and the pressure building
    dropTime: 0.2, // the column falling from the cloud to the floor
    holdTime: 0.55, // the column keeps pressing after it lands
    columnFadeTime: 0.5, // ... and is lifted off the floor over this
    waveTime: 0.95, // the shock ring running out to its full radius
    cloudFadeTime: 1.1, // the cloud tearing apart after the column is spent
    fadeTime: 1.0, // everything left settling away at the end

    /* ================================================================ */
    /* 1 · THE STORM CLOUD                                               */
    /* ================================================================ */
    cloudHeight: 4.9, // metres its rim hangs at
    cloudRadius: 1.35, // × zoneRadius
    cloudSag: 1.0, // metres the heavy core hangs below the rim when fully gathered
    cloudSagSlam: 0.8, // extra metres it lurches down on the drop
    cloudSagWidth: 0.42, // 0..1 of the radius the sag spans
    cloudBillow: 0.5, // metres of noise on the underside
    cloudBillowScale: 2.2, // billows across the cloud
    cloudSpin: 0.9, // radians/second it turns at once gathered
    cloudSpinUp: 2.6, // extra radians/second at the moment it drops
    cloudSwirl: 3.0, // how hard the arms wind into the core
    cloudArms: 3, // spiral arms
    cloudArmAmount: 0.45, // 0..1 how much the arms show
    cloudScale: 2.6, // noise features across the cloud
    cloudBoil: 0.25, // how fast the cloud churns in place
    cloudCover: 0.45, // density threshold — lower is more cloud
    cloudEdge: 0.7, // where the rim starts to break up, 0..1 of the radius
    cloudEdgeNoise: 0.4, // how ragged the rim is
    cloudOpacity: 0.92,
    cloudDarkCore: 0.55, // how much darker the middle is
    cloudRimGlow: 1.4, // light catching the sun-side of each billow
    cloudChargeGlow: 2.2, // the core lighting up from inside as pressure builds
    cloudFlash: 2.6, // sheet lightning inside it
    cloudFlashRate: 3.5, // flickers per second while gathering
    colorCloudCore: '#141b26',
    colorCloudBody: '#3b4b62',
    colorCloudRim: '#cfe3ff',
    colorCloudFlash: '#e8f3ff',

    /* --- wisps: cloud stuff streaming in to feed it --- */
    wispRate: 70, // per second while gathering
    wispSize: 1.1, // metres
    wispLifetime: 1.1,
    wispInflow: 3.2, // metres/second they are drawn in
    wispOpacity: 0.55,
    colorWispA: '#9fb3cc',
    colorWispB: '#6f8299',
    colorWispC: '#4a5a70',
    colorWispD: '#2a3442',

    /* ================================================================ */
    /* 2 · THE PRESSURE FUNNEL (distortion)                              */
    /* ================================================================ */
    funnelStrength: 0.9, // how hard the world churns behind it
    funnelRadius: 0.55, // × zoneRadius
    funnelTwist: 2.2, // radians of twist per metre of height
    funnelScale: 1.6, // noise features per metre
    funnelSpeed: 3.0, // how fast the churn runs
    funnelPunch: 2.4, // × strength on the frame of the slam, decaying

    /* ================================================================ */
    /* 3 · THE COLUMN                                                    */
    /* ================================================================ */
    columnRadius: 0.78, // × zoneRadius, through the middle of the drop
    columnTopScale: 0.55, // how pinched it is where it leaves the cloud
    columnFlare: 0.6, // how far the foot splays out over the floor
    columnFlareHeight: 1.1, // metres the splay climbs
    columnStreaks: 26, // wind streaks round it
    columnStreakSharp: 0.7, // 0 = soft haze, 1 = hard lines
    columnFlow: 24, // metres/second the streaks fall
    columnOpacity: 0.4,
    columnGlow: 1.5,
    columnRim: 1.6, // the walls, seen edge-on
    columnFront: 2.0, // the hot leading front
    columnFrontWidth: 0.8, // metres
    columnSoftFade: 0.6, // soft intersection with the floor, metres
    colorColumn: '#a9c9f5',
    colorColumnHot: '#ffffff',

    /* ================================================================ */
    /* 4 · THE GROUND BLAST                                              */
    /* ================================================================ */
    blastRadius: 2.3, // × zoneRadius, how far the shock ring runs
    ringWidth: 0.35, // metres
    ringGlow: 3.2,
    ringFadeStart: 0.45, // 0..1 of its run where the ring starts to dim
    scourStreaks: 70, // radial streaks combed into the dust
    scourOpacity: 0.38,
    scourContrast: 1.5,
    imprintOpacity: 0.55, // the pressed, dark middle
    warnGlow: 0.9, // the telegraph while the cloud gathers
    groundErode: 0.7, // 0 = fades evenly, 1 = erodes on noise
    colorRing: '#e6f2ff',
    colorScour: '#6f7986',
    colorImprint: '#161b22',
    colorWarn: '#8fb8ff',

    /* --- the shock lens (distortion) --- */
    lensStrength: 1.4,
    lensWidth: 0.8, // metres

    /* ================================================================ */
    /* 5 · THE ROLLING DUST TORUS                                        */
    /* ================================================================ */
    torusTube: 0.45, // metres, its radius on the frame of the slam
    torusTubeGrow: 1.5, // extra metres of radius by the end of its run
    torusSquash: 0.65, // vertical squash of the tube
    torusRoll: 6.5, // radians/second it rolls outward
    torusBillow: 0.4, // how lumpy it is
    torusScale: 2.4, // lumps round the ring
    torusDetail: 3.0, // dust detail in the tube
    torusOpacity: 0.75,
    torusSoftFade: 0.5, // metres
    torusLight: 0.8, // 0..1 how much the sun shades it
    torusLinger: 0.6, // 0..1 of the settle it keeps showing for
    colorTorusLit: '#d6d0c2',
    colorTorusShade: '#5d5a57',

    /* ================================================================ */
    /* 6 · PARTICLES                                                     */
    /* ================================================================ */
    /* --- radial streaks rushing out along the floor --- */
    streakCount: 260, // on the slam
    streakSpeed: 17, // metres/second
    streakSize: 0.07,
    streakLifetime: 0.55,
    streakStretch: 0.9,
    streakGlow: 2.2,
    colorStreakA: '#ffffff',
    colorStreakB: '#dcebff',
    colorStreakC: '#9cc0f0',
    colorStreakD: '#4f6f9c',

    /* --- streaks falling down the column --- */
    downRate: 900, // per second while the column falls and holds
    downSpeed: 26, // metres/second

    /* --- dust thrown up and settling --- */
    dustCount: 80, // billows on the slam
    dustSpeed: 6, // metres/second outward
    dustSize: 0.9, // metres
    dustLifetime: 2.4,
    dustRise: 0.25, // upward drift (gravity, inverted)
    dustOpacity: 0.7,
    settleRate: 40, // per second of fine dust drifting back down after
    colorDustA: '#cfc8b8',
    colorDustB: '#a49d90',
    colorDustC: '#7a756d',
    colorDustD: '#4c4945',

    /* --- debris skittering out --- */
    debrisCount: 60,
    debrisSpeed: 10,
    debrisLift: 3.5, // metres/second upward on launch
    debrisSize: 0.11,
    debrisLifetime: 1.3,
    colorDebris: '#6c665e',

    /* ================================================================ */
    /* 7 · THE SLAM                                                      */
    /* ================================================================ */
    impactShake: 1.0,
    gatherRumble: 0.25, // camera rumble while the pressure builds
    impactFlash: 0.3,
    impactLight: 30, // light punch on the slam
    colorFlash: '#dfeeff',
    burstSize: 1.1, // × zoneRadius, the squashed shell of air
    burstLife: 0.5,
    burstSquash: 0.22,
    dustRingRadius: 1.7, // × zoneRadius
    dustRingLife: 2.2,
    shockRadius: 2.4, // × zoneRadius
    shockLife: 0.75,

    /* --- what it does to bodies --- */
    pressCore: 0.62, // 0..1 of the circle where bodies are pressed flat
    pressSlam: 8, // metres/second they are driven into the floor
    pressImpulse: 0.6, // metres/second they skid outward as they go down
    pressHold: 0.9, // seconds the column holds them down
    pressDown: 4, // metres/second of the downdraft that holds them
    edgeReach: 1.3, // × zoneRadius, how far out the outflow still knocks bodies over
    blowImpulse: 9, // metres/second the edge bodies are thrown outward
    blowLift: 3.2, // metres/second of lift on them
    blowSpin: 2.2, // the tumble
    blowWind: 8, // metres/second of the outflow carrying them on
    blowTime: 0.8, // seconds the outflow keeps hold of them
    blowGrab: 3.5, // how hard it keeps hold, per second
    corpseShove: 4 // metres/second bodies already lying there are shoved outward
  }
};
