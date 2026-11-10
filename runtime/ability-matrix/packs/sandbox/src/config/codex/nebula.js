/**
 * Nebula Collapse — Cosmic — a nebula gathers over the circle, collapses into
 * a blazing protostar, and goes supernova.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so `settings.js`
 * can pull it in without a cycle.
 *
 * Every dimension and time below is resolved per frame by
 * `NebulaCollapseAbility`, so dragging any of it in the editor re-shapes a
 * cloud already in the sky or a shell already on its way out.
 */
export default {
  id: 'nebula',
  meta: {
    label: "Nebula Collapse",
    accent: '#c18cff',
    key: '',
    element: 'cosmic',
    hint: "Cosmic — a nebula gathers over the circle, drags what stands beneath into a newborn star, and goes supernova",
    cast: 'zone',
    glyph: `<path d="M50 14C70 14 86 30 84 48C82 62 68 70 56 66C46 63 44 52 52 48C58 45 64 50 61 55"/><path d="M50 86C30 86 14 70 16 52C18 38 32 30 44 34C54 37 56 48 48 52C42 55 36 50 39 45"/><circle cx="50" cy="50" r="4"/><path d="M50 4L50 10"/><path d="M50 90L50 96"/><path d="M4 50L10 50"/><path d="M90 50L96 50"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 16, // maximum cast distance, metres
    minRange: 0, // closer than this and the cast is refused
    speed: 22, // how fast the seed of light flies out to the circle, metres/second
    lifetime: 1.8, // seconds the remnant ring lingers after the supernova
    cooldown: 0.5, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4, // the circle: what the nebula forms over and drags in, metres

    /* --- light --- */
    lightColor: '#c18cff',
    lightIntensity: 6, // the cloud's glow; the protostar multiplies it
    lightRadius: 10,
    lightHeat: 2.2, // how much brighter the light burns as the star is born

    /* --- the beats (seconds, × global lifetime) --- */
    gatherTime: 1.0, // the cloud gathers and turns
    collapseTime: 1.3, // it contracts into the core
    holdTime: 0.7, // the protostar blazes (and implodes at the end)
    novaTime: 0.9, // the shell flies out

    /* ================================================================ */
    /* 1 · THE NEBULA                                                    */
    /* ================================================================ */
    // Derived from the circle so the cloud always reads in an 8 m frame:
    // heart height = zoneRadius × cloudHeightPerZone + cloudHeight,
    // radius       = zoneRadius × cloudRadiusPerZone + cloudRadius.
    cloudHeightPerZone: 0.58, // × zoneRadius
    cloudRadiusPerZone: 1.1, // × zoneRadius
    cloudRadius: 0, // extra metres on the derived radius
    cloudHeight: 0.15, // extra metres on the derived height
    cloudThickness: 0.85, // half-thickness, metres — a flattened disc
    collapseThickKeep: 0.55, // share of that half-thickness the cloud keeps as it falls in (a fat globule, not a sliver)
    cloudSpin: 0.35, // rad/s it turns while it gathers
    spinUp: 5, // how much faster it turns once it is collapsing (angular momentum)
    cloudShear: 0.55, // 0..1 how much faster the inside turns — spiral shear
    infallLead: 0.7, // how far the inside falls ahead of the rim
    infallWind: 2.2, // radians wound in as a puff falls
    collapseTo: 1.4, // radius it collapses into, × the core radius
    puffCount: 30, // gas billboards (max 40)
    puffSize: 2.7, // metres
    puffSizeJitter: 0.45,
    puffCoreSize: 0.28, // size once collapsed, × size
    puffBlastSize: 1.7, // size once blown out, × size
    gasNoiseScale: 1.3, // churn features across a puff
    gasFlowSpeed: 0.35, // how fast it churns
    gasFilaments: 0.3, // 0..1 filament share of the gas
    gasDensity: 0.65,
    gasGlow: 0.55, // brightness (bloom > 1) — the deep lanes carry the body
    gasAccent: 0.35,
    collapseThin: 0.93, // 0..1 how much fully collapsed gas thins away into the star // share of puffs tinted teal / magenta; the rest are violet
    gasSoftFade: 1.2, // soft intersection, metres
    // Four-stop cosmic ramp: white-gold heat → pale lilac tint → violet body → deep.
    colorA: '#6f2ee6', // violet gas — the body
    colorGasB: '#1f9f9c', // teal accent
    colorGasC: '#c23a95', // magenta accent
    colorHot: '#fff0d2', // white-gold — compression heat, the star
    colorDeep: '#14062e', // the dark dust lanes and the gravity well

    /* --- dark dust lanes: the cloud's body against the floor --- */
    laneDensity: 0.82, // how much the lanes darken what is behind them
    laneSize: 1.25, // × puff size
    laneCoreSize: 0.8, // the dust lanes' size once collapsed, × size — the dark body round the forming star
    laneLift: 0.5, // the lanes' own violet glow, so they read as dust not holes

    /* --- stars sprinkled through it --- */
    starCount: 70, // (max 120)
    starSize: 0.22, // metres
    starFlare: 0.6, // how much they flare as they are swallowed
    starTwinkle: 0.55, // 0..1
    starTwinkleSpeed: 5, // rad/s
    starGlow: 1.2,
    starSpikes: 0.9, // diffraction spikes
    colorStarA: '#f3eaff',
    colorStarB: '#ffd7f2',

    /* ================================================================ */
    /* 2 · THE PROTOSTAR                                                 */
    /* ================================================================ */
    coreRadius: 0.55, // metres
    coreGranulation: 5, // boiling cells across it
    coreBoilSpeed: 1.6,
    coreLimb: 2.2, // hot rim
    coreGlow: 0.65,
    coreHeatCap: 0.4, // 0..1 most of the way to white-gold the star's body goes
    coreBloomCap: 0.8, // brightest the star may get (caps the bloom)
    corePulse: 0.08, // how much it throbs
    implodeShare: 0.3, // share of the hold it spends imploding before it blows
    implodeScale: 0.45, // how small it gets, × radius
    colorCore: '#ffb36b', // the star's body
    colorB: '#d8b4ff', // its rim, the corona's streamers and the disk's middle

    coronaSize: 3.2, // × core radius
    coronaRays: 9, // streamers round it
    coronaRayLength: 0.35, // share of the corona
    coronaFalloff: 0.12, // glow falloff, share of the corona
    coronaGlow: 0.45,
    coronaBloomCap: 0.45, // brightest the corona may get

    diskInner: 1.4, // × core radius
    diskOuter: 3.6, // × core radius
    diskTilt: 0.32, // radians, tipped toward the caster
    diskSpin: 2.2, // rad/s
    diskArms: 3,
    diskTwist: 3.2, // how tightly the arms wind
    diskDoppler: 0.55, // brighter on the side turning toward you
    diskGlow: 0.65,

    /* --- the lens (distortion) --- */
    lensPinch: 0.4, // the mass pulling the image in
    lensShock: 1.4, // the shell pushing it out
    lensSize: 2.4, // × the cloud radius

    /* ================================================================ */
    /* 3 · THE SUPERNOVA                                                 */
    /* ================================================================ */
    novaRadius: 7.5, // metres the shell expands to
    shellThin: 2.6, // fresnel power — how thin the shell reads
    shellFilaments: 1.1,
    shellFilamentScale: 2.6,
    shellGlow: 2.6,
    novaDust: 200, // star-dust motes blasted out
    dustSpeed: 9,
    dustSize: 0.1,
    dustLifetime: 1.6,
    dustDrag: 1.6,
    sprinkleRate: 30, // twinkles/second sifting through the cloud
    colorDustA: '#fff0d2',
    colorDustB: '#c48bff',
    colorDustC: '#6f2ee6',
    colorDustD: '#3a1890',
    novaSparks: 120, // streaks
    sparkSpeed: 22,
    sparkSize: 0.06,
    sparkStretch: 0.12,
    sparkLifetime: 0.6,
    colorSparkA: '#ffffff',
    colorSparkB: '#fff2d6',
    colorSparkC: '#ff6fbf',
    colorSparkD: '#8a4dff',
    novaShockRadius: 9, // ground shockwave decal, metres
    burstSize: 6, // AIR pressure shell at the floor, metres
    novaShake: 0.75,
    novaShakeDuration: 0.8,
    novaFlash: 0.55,
    novaLight: 4, // light punch, × lightIntensity
    collapseRumble: 0.25, // camera rumble while it collapses
    colorFlash: '#f3e6ff',
    colorShockA: '#7a3ae8',
    colorShockB: '#ffffff',

    /* --- the ground under the circle --- */
    groundGlow: 0.45, // the cloud's light on the floor
    groundRipples: 0.08, // gravity ripples running inward
    groundRippleDensity: 0.75, // rings per metre
    groundRippleSpeed: 0.9, // rings per second
    groundShock: 1.4, // the shock front
    groundShockWidth: 0.28, // metres
    groundChroma: 0.16, // metres the front's colours split by
    groundScorch: 0.8, // the starburst left behind it
    groundRays: 22,
    scorchTime: 1.6, // seconds the starburst takes to cool

    /* --- the gravity well: the floor pulled in under the collapse --- */
    wellRadius: 1.15, // × zoneRadius
    wellDepth: 0.85, // 0..1 how dark the well's heart goes
    wellArms: 4, // spiral arms of dust dragged in
    wellTwist: 2.6, // how tightly the arms wind
    wellSpeed: 1.4, // rad/s the arms turn inward (× the collapse)
    wellRim: 0.35,
    wellArmLight: 0.8, // 0..1 how lit the dragged dust arms are against the deep well // the violet lip at the well's edge
    wellScar: 0.45, // how much of the well stays as a scar after the blast
    debrisRate: 70, // floor chips dragged in per second while it collapses
    debrisSize: 0.09,
    debrisLifetime: 0.9,
    colorDebrisA: '#6a4a8a',
    colorDebrisB: '#3a2456',
    colorDebrisC: '#21123a',
    colorDebrisD: '#0e0620',

    /* --- the remnant --- */
    remnantRadius: 3.2, // metres when it forms
    remnantGrow: 0.6, // metres/second it keeps widening
    remnantWidth: 0.35, // metres
    remnantGlow: 1.3,

    /* --- gas drawn in --- */
    gasRate: 70, // wisps/second drawn in off the rim
    gasSize: 0.9,
    gasLifetime: 1.4,
    gasInflow: 0.9, // how much of the way to the core they get
    colorWispA: '#d8b4ff',
    colorWispB: '#6f2ee6',
    colorWispC: '#3a1890',
    colorWispD: '#14062e',

    /* --- the seed of light it is cast with --- */
    heraldSize: 0.16, // metres
    heraldTrail: 60, // wisps/second it sheds

    /* ================================================================ */
    /* 4 · WHAT HAPPENS TO A BODY                                        */
    /* ================================================================ */
    grabReach: 1.15, // × zoneRadius — caught when the collapse starts
    grabDelay: 0.15, // share of the collapse before it takes hold
    grabImpulse: 1.6, // m/s a body is tipped toward the middle
    grabLift: 2.4, // m/s up off its feet
    grabSpin: 0.5,
    orbitRadius: 1.6, // metres from the core they are held at
    orbitDrop: 0.6, // metres below the core
    orbitSpin: 1.6, // rad/s they swing round it
    carryPull: 2.4, // how hard they are hauled to the orbit
    carryGrip: 4, // share of the gap closed per second
    carryBuoyancy: 1, // 0..1 how much of their weight the collapse carries
    throwImpulse: 14, // m/s they are thrown out by the blast
    throwLift: 5, // m/s up
    throwSpin: 1.6,
    throwReach: 1, // × novaRadius — standing bodies the blast also throws
    corpseCatch: 1 // 0/1 — whether bodies already down are dragged in too
  }
};
