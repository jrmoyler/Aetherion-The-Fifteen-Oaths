/**
 * Hourglass Sunder — Time — a giant ghostly hourglass descends over the
 * circle, turns over, and ages everything under it to dust.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * Every metre, second and colour below is resolved per frame by
 * `HourglassSunderAbility`, so dragging any of it re-shapes an hourglass that
 * is already pouring. The few "(rebuild)" keys reshape the lathe itself and
 * rebuild it on the frame they move.
 */
export default {
  id: 'hourglass',
  meta: {
    label: "Hourglass Sunder",
    accent: '#ffd38a',
    key: '',
    element: 'time',
    hint: "Time — a giant hourglass turns over the circle and ages everything under it to dust",
    cast: 'zone',
    glyph: `<path d="M28 12H72M28 88H72"/><path d="M34 14C34 36 46 42 50 50C54 42 66 36 66 14"/><path d="M34 86C34 64 46 58 50 50C54 58 66 64 66 86"/><path d="M42 80C46 72 54 72 58 80Z"/><path d="M50 50V72"/><circle cx="50" cy="50" r="40" stroke-dasharray="3 6"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 16, // maximum cast distance, metres
    minRange: 0, // closer than this and the cast is refused
    speed: 24, // metres/second the thread of sand runs out to the circle
    lifetime: 2.4, // seconds the sand takes to run out — the pour
    cooldown: 0.8, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4, // metres — the circle the hourglass ages

    /* --- light --- */
    lightColor: '#ffd38a',
    lightIntensity: 6, // the hourglass's steady glow
    lightRadius: 8,
    impactLight: 14, // added to the light when it lands and when it bursts

    /* --- accent pair (the travelling thread) --- */
    colorA: '#ffd38a',
    colorB: '#ffffff',

    /* ================================================================ */
    /* TIMING                                                            */
    /* ================================================================ */
    descendTime: 0.8, // seconds it takes to sink down onto the circle
    turnTime: 0.75, // seconds it takes to turn over
    settleTime: 0.22, // seconds the sand takes to drop to the neck once turned
    crackTime: 0.5, // seconds the glass cracks for once the sand has run out
    shatterTime: 1.5, // seconds from the burst to the last of it gone

    /* ================================================================ */
    /* 1 · THE HOURGLASS                                                 */
    /* ================================================================ */

    /* --- shape (rebuild) --- */
    size: 1.0, // overall scale of the whole rig
    glassHalfHeight: 1.6, // metres, neck to cap (rebuild)
    bulbRadius: 1.05, // metres, the widest the glass gets (rebuild)
    neckRadius: 0.07, // metres (rebuild)
    bulbShape: 0.62, // where the widest point sits, neck → cap (rebuild)
    capRatio: 0.62, // radius at the cap, × the widest (rebuild)
    capThickness: 0.24, // metres, the brass end plates (rebuild)
    capOverhang: 1.22, // end plate radius, × the widest glass (rebuild)
    pillarCount: 4, // turned spindles (rebuild, max 8)
    pillarRadius: 0.055, // metres (rebuild)

    /* --- motion --- */
    hoverHeight: 0.35, // metres between the floor and the bottom plate
    dropHeight: 7, // metres above its rest it starts from
    dropBounce: 0.4, // 0 = settles dead, 1 = big bounce as it lands
    turnLift: 0.45, // metres it rises while it turns over
    spinRate: 0.18, // radians/second it turns about its own axis
    bob: 0.05, // metres it breathes up and down while it pours
    bobSpeed: 1.6,
    tremble: 0.03, // metres it shakes as the glass cracks
    travelGhost: 0.22, // how much of it shows high above during the travel

    /* --- ghost glass --- */
    glassTint: '#ffe9c0',
    glassRim: '#ffd38a',
    glassOpacity: 0.07,
    glassFresnel: 1.5,
    glassFresnelPower: 2.6,
    glassEnv: 0.9, // the sky reflected in it
    glassRefract: 0.3, // the sky seen through it
    glassIOR: 1.3,
    glassRimGlow: 1.4,
    glassShimmer: 0.4, // ghost light climbing the bulbs
    glassShimmerScale: 2.0,
    glassSparkle: 1.0, // pin glints
    ghostFlicker: 0.12,
    distortStrength: 0.55, // how hard the glass bends the world behind it
    revealEdge: 0.12, // width of the gold edge it materialises along
    colorReveal: '#ffcf70',
    /* --- cracks --- */
    crackScale: 3.2, // crack cells across the glass
    crackWidth: 0.05,
    crackGlow: 3.2,
    colorCrack: '#fff2c8',

    /* --- brass frame --- */
    colorBrass: '#a8742a',
    colorBrassDark: '#4a2c10',
    colorGhost: '#ffcf80',
    brassMetal: 0.85,
    brassEnv: 0.8,
    brassSpecular: 2.4,
    brassGloss: 70,
    brassEngrave: 0.5,
    engraveScale: 5,
    brassPatina: 0.45,
    brassGhost: 0.9, // spirit glow at the frame's silhouette

    /* --- clockwork --- */
    gearTeeth: 40, // teeth on the plate gears (rebuild)
    gearRadius: 1.12, // × the end plate radius
    gearSpeed: 0.7, // radians/second the plate gears turn
    gearTick: 0.65, // 0 = smooth, 1 = hard ticking
    orbitRadius: 1.12, // the armillary ring, × the rig's half-height, plate to plate (rebuild)
    orbitSpeed: 0.9, // radians/second it sweeps round
    orbitTilt: 0.35, // radians it is tipped off vertical

    /* --- sand --- */
    colorSand: '#e0a64a',
    colorSandDark: '#7a4c1a',
    colorSandTop: '#ffd88a',
    sandFill: 0.55, // fraction of a bulb the sand fills
    sandGlow: 0.45, // golden glow of the time-sand
    sandGrain: 38, // grain features per metre
    sandSparkle: 2.0,
    dimple: 0.35, // metres the draining surface funnels
    pileCone: 0.4, // metres the pile heaps at its peak
    streamWidth: 0.55, // × neck radius
    streamGlow: 1.2,
    streamSpeed: 7,

    /* ================================================================ */
    /* 2 · THE CLOCK FACE                                                */
    /* ================================================================ */
    dialRadius: 1.0, // × the circle
    colorDial: '#ffc860',
    colorDialHot: '#fff4d6',
    colorDialBase: '#1c1206',
    colorAged: '#6a6258', // the elapsed sector, greyed
    dialGlow: 2.4,
    dialOpacity: 0.95,
    dialBaseOpacity: 0.4,
    dialRipple: 0.35, // rings of time running outward
    ringWidth: 0.05, // metres
    tickLength: 0.07, // × radius
    handGlow: 3.2,
    handWidth: 0.05, // metres at the hub
    hourHandLength: 0.5, // × radius
    minuteHandLength: 0.84,
    handTurns: 3, // minute-hand turns over the pour
    hourRatio: 0.25, // hour hand speed, × the minute hand
    tickRate: 3, // ticks per second
    tickSnap: 0.75, // 0 = sweeping, 1 = hard ticks
    dialSpin: 0.12, // radians/second the dial itself turns
    sectorFill: 0.55, // how strongly the elapsed sector greys
    colorSpill: '#c89048',
    spillRadius: 0.5, // × radius the sand spills out to

    /* ================================================================ */
    /* 3 · THE BODIES — aged to dust                                     */
    /* ================================================================ */
    ageTime: 1.5, // seconds under the sand before a body crumbles
    ageFalloff: 0.45, // 0 = everywhere alike, 1 = barely ages at the rim
    slowMax: 0.9, // how far the body's own motion slows as it ages
    crumbleTime: 1.1, // seconds a crumbling body takes to fall to sand
    crumbleSink: 0.35, // metres it sinks into its own pile as it goes
    crumbleImpulse: 0.5, // it slumps rather than flies
    crumbleLift: 0.2,
    crumbleSpin: 0.3,
    bodyDust: 26, // SMOKE puffs per second off an aging body, at full age
    bodyChips: 70, // sand chips per second off a crumbling body
    look: {
      color: '#5f584e', // the flesh, gone to dust
      rimColor: '#e8c48a', // the silhouette, while it still has one
      rimEmissive: 1.1,
      edgeColor: '#ffd38a', // the line the crumbling runs along
      edgeEmissive: 3.5,
      edgeWidth: 0.2
    },

    /* ================================================================ */
    /* 4 · PARTICLES                                                     */
    /* ================================================================ */

    /* --- falling grains (SOFT, additive) --- */
    grainRate: 150, // per second through the neck
    grainSize: 0.03,
    grainGlow: 2.2,
    grainLifetime: 0.7,
    grainGravity: -7,
    colorGrainA: '#fff4d0',
    colorGrainB: '#ffd88a',
    colorGrainC: '#e0a040',
    colorGrainD: '#5a3010',

    /* --- time motes orbiting it (SOFT, additive, swirl) --- */
    moteRate: 45,
    moteSize: 0.05,
    moteLifetime: 2.2,
    moteSwirl: 1.4, // radians/second round the hourglass
    moteRise: 0.5, // m/s
    moteGlow: 2.4,

    /* --- dust (SMOKE) --- */
    dustSize: 0.7,
    dustLifetime: 1.8,
    dustOpacity: 0.5,
    colorDustA: '#b8a080',
    colorDustB: '#8a7660',
    colorDustC: '#5e5040',
    colorDustD: '#2a241c',

    /* --- sand chips off a crumbling body (CHIP, lit) --- */
    chipSize: 0.05,
    chipSpeed: 1.8,
    chipLifetime: 1.2,
    colorChipA: '#e6c080',
    colorChipB: '#c89650',
    colorChipC: '#8a6430',
    colorChipD: '#4a3418',

    /* --- glints off the burst (STREAK, additive) --- */
    glintCount: 70,
    glintSpeed: 10,
    glintSize: 0.05,
    glintLifetime: 0.45,

    /* --- shards --- */
    shardCount: 60, // max 96
    shardSize: 0.32, // metres
    shardSpeed: 6.5,
    shardLift: 3.5,
    shardSpin: 7, // radians/second
    shardGravity: -13,
    shardBounce: 0.3,
    shardLife: 1.3, // seconds before a shard has faded
    shardGlow: 1.8,
    spillGrains: 220, // grains thrown out when it bursts

    /* ================================================================ */
    /* 5 · THE BEAT                                                      */
    /* ================================================================ */
    landShake: 0.22,
    landFlash: 0.05,
    shatterShake: 0.4,
    shatterFlash: 0.16,
    colorFlash: '#ffe6b0',
    burstRadius: 3.0, // AIR shell when it bursts, metres
    burstLife: 0.45,
    colorBurstA: '#fff6dc',
    colorBurstB: '#ffd38a',
    colorBurstC: '#c07a30',
    shockRadius: 6, // SHOCKWAVE decal, metres
    shockLife: 0.6,
    colorShockA: '#ffd38a',
    colorShockB: '#ffffff',
    dustRingRadius: 4.5, // DUSTRING decal as it lands, metres
    dustRingLife: 1.4,
    travelGlitter: 170 // grains per second shed by the running thread
  }
};
