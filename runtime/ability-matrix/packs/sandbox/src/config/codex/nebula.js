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
    cloudRadius: 5.2, // metres
    cloudHeight: 3.8, // metres its heart hangs over the circle
    cloudThickness: 1.1, // half-thickness, metres
    cloudSpin: 0.35, // rad/s it turns while it gathers
    spinUp: 5, // how much faster it turns once it is collapsing (angular momentum)
    cloudShear: 0.55, // 0..1 how much faster the inside turns — spiral shear
    infallLead: 0.7, // how far the inside falls ahead of the rim
    infallWind: 2.2, // radians wound in as a puff falls
    collapseTo: 1.4, // radius it collapses into, × the core radius
    puffCount: 30, // gas billboards (max 40)
    puffSize: 3.6, // metres
    puffSizeJitter: 0.45,
    puffCoreSize: 0.28, // size once collapsed, × size
    puffBlastSize: 1.7, // size once blown out, × size
    gasNoiseScale: 1.3, // churn features across a puff
    gasFlowSpeed: 0.35, // how fast it churns
    gasFilaments: 0.3, // 0..1 filament share of the gas
    gasDensity: 0.7,
    gasGlow: 0.7, // brightness (bloom > 1)
    gasSoftFade: 1.2, // soft intersection, metres
    colorA: '#8a4dff', // violet gas
    colorGasB: '#2fd6c8', // teal gas
    colorGasC: '#ff6fbf', // pink gas
    colorHot: '#fff2d6', // white-gold — compression heat, the star

    /* --- stars sprinkled through it --- */
    starCount: 70, // (max 120)
    starSize: 0.22, // metres
    starFlare: 1.4, // how much they flare as they are swallowed
    starTwinkle: 0.55, // 0..1
    starTwinkleSpeed: 5, // rad/s
    starGlow: 2.2,
    starSpikes: 0.9, // diffraction spikes
    colorStarA: '#e8f4ff',
    colorStarB: '#ffd7f2',

    /* ================================================================ */
    /* 2 · THE PROTOSTAR                                                 */
    /* ================================================================ */
    coreRadius: 0.55, // metres
    coreGranulation: 5, // boiling cells across it
    coreBoilSpeed: 1.6,
    coreLimb: 2.2, // hot rim
    coreGlow: 3.2,
    corePulse: 0.08, // how much it throbs
    implodeShare: 0.3, // share of the hold it spends imploding before it blows
    implodeScale: 0.45, // how small it gets, × radius
    colorCore: '#ffb36b', // the star's body
    colorB: '#d8b4ff', // its rim, the corona's streamers and the disk's middle

    coronaSize: 4.2, // × core radius
    coronaRays: 9, // streamers round it
    coronaRayLength: 0.35, // share of the corona
    coronaFalloff: 0.12, // glow falloff, share of the corona
    coronaGlow: 1.8,

    diskInner: 1.4, // × core radius
    diskOuter: 4.2, // × core radius
    diskTilt: 0.32, // radians, tipped toward the caster
    diskSpin: 2.2, // rad/s
    diskArms: 3,
    diskTwist: 3.2, // how tightly the arms wind
    diskDoppler: 0.55, // brighter on the side turning toward you
    diskGlow: 2.2,

    /* --- the lens (distortion) --- */
    lensPinch: 0.9, // the mass pulling the image in
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
    novaDust: 260, // star-dust motes blasted out
    dustSpeed: 9,
    dustSize: 0.1,
    dustLifetime: 1.6,
    dustDrag: 1.6,
    sprinkleRate: 30, // twinkles/second sifting through the cloud
    colorDustA: '#ffffff',
    colorDustB: '#ffd7f2',
    colorDustC: '#b48cff',
    colorDustD: '#2fd6c8',
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
    colorShockA: '#c18cff',
    colorShockB: '#ffffff',

    /* --- the ground under the circle --- */
    groundGlow: 0.55, // the cloud's light on the floor
    groundRipples: 0.6, // gravity ripples running inward
    groundRippleDensity: 0.75, // rings per metre
    groundRippleSpeed: 0.9, // rings per second
    groundShock: 1.4, // the shock front
    groundShockWidth: 0.28, // metres
    groundChroma: 0.16, // metres the front's colours split by
    groundScorch: 0.8, // the starburst left behind it
    groundRays: 22,
    scorchTime: 1.6, // seconds the starburst takes to cool

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
    colorWispB: '#8a4dff',
    colorWispC: '#2fd6c8',
    colorWispD: '#1a0b3a',

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
