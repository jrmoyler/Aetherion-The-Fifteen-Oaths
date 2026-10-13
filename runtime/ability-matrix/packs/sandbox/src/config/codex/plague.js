/**
 * Plague Swarm — Poison — a chitinous hive cracks open and its swarm eats the circle.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * The swarm is placed entirely on the GPU from a handful of integrated phases
 * and each insect's own dice, so every value below is live: dragging
 * `swirlRadiusMax` widens a vortex that is already turning, and `cloudRadius`
 * loosens a cloud that is already eating.
 */
export default {
  id: 'plague',
  meta: {
    label: "Plague Swarm",
    accent: '#b6ff3d',
    key: '',
    element: 'poison',
    hint: "Poison — a chitinous hive bursts up and cracks open; its glowing swarm engulfs and corrodes every body in the circle",
    cast: 'zone',
    glyph: `<path d="M50 84C30 84 26 62 32 46C38 30 46 22 50 16C54 22 62 30 68 46C74 62 70 84 50 84Z"/><path d="M50 16V48"/><path d="M38 40L50 52L62 40"/><path d="M20 30L26 26L30 32"/><path d="M76 22L82 26L76 30"/><path d="M14 56L20 52L22 58"/><path d="M84 54L88 60L82 62"/>`
  },
  settings: {
    /* --- the cast --- */
    range: 18, // maximum cast distance, metres
    minRange: 0, // closer than this and the cast is refused
    speed: 24, // how fast the burrow runs to the circle, m/s
    lifetime: 3.0, // seconds the swarm feeds before it turns for home
    cooldown: 0.5, // seconds before the ability can be armed again
    castAnim: "cast3", // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4, // radius of the circle, metres
    fadeTime: 1.6, // seconds the hive takes to dissolve once the swarm is home

    /* --- light --- */
    lightColor: "#b6ff3d",
    lightIntensity: 6, // steady glow over the circle
    lightRadius: 8,
    lightHeight: 1.6, // metres over the hive the light hangs
    lightPulse: 0.3, // how much it throbs with the brood sac

    /* ================================================================ */
    /* 1 · THE BURROW (travel)                                           */
    /* ================================================================ */
    burrowRate: 110, // dust puffs per second thrown up over the burrow
    burrowChips: 50, // soil chips per second
    burrowRingSpacing: 2.2, // a dust ring every this many metres
    burrowRingRadius: 1.0,
    burrowRumble: 0.08, // camera rumble while it tunnels
    burrowSpores: 40, // toxic spores per second leaking out of it

    /* ================================================================ */
    /* 2 · THE HIVE                                                      */
    /* ================================================================ */
    hiveHeight: 1.9, // metres tall
    hiveRadius: 1.1, // girth multiplier
    hivePlates: 6, // shell plates (rebuilds the shape)
    hiveLumps: 0.2, // 0..1 how lumpy the chitin is (rebuilds the shape)
    hiveRiseFrom: 1.9, // metres below the floor it bursts up from
    hiveRiseTime: 0.42, // seconds to burst up
    hiveOvershoot: 0.1, // how far past full height it punches
    crackDelay: 0.8, // seconds after it surfaces that it cracks open
    crackTime: 0.35, // seconds the seams glow before the plates split
    openTime: 0.45, // seconds the plates take to swing open
    openAngle: 1.05, // radians each plate swings out
    openJitter: 0.35, // 0..1 how unevenly they open
    openOvershoot: 0.15, // how far past open they fling
    closeAmount: 0.55, // 0..1 how far they close back once the swarm is home
    hiveHinge: 0.24, // height of the hinge, fraction of the hive
    hivePulse: 0.035, // how much it breathes
    pulseSpeed: 3.4, // breaths (radians) per second
    hiveSink: 0.9, // metres it sinks while it dissolves

    /* --- chitin --- */
    hiveRoughness: 0.32,
    iridescence: 1.0, // thin-film sheen at grazing angles
    iridScale: 2.4, // how fast the hue slides with the angle
    iridHue: 0.22, // where in the spectrum the sheen starts
    veinGlow: 2.6, // toxic veins in the shell
    veinScale: 4.5, // veins per unit
    veinWidth: 0.07, // vein width
    veinSpeed: 1.6, // speed of the pulse running up them
    seamGlow: 5, // seams before they split
    gooGlow: 2.4, // the wet glowing inside
    dissolveGlow: 4.5, // the burning edge as it dissolves
    sacSize: 0.3, // the brood sac inside, × the hive's height
    sacGlow: 3.2,
    sacPulse: 0.45,
    colorChitinA: "#0e120a",
    colorChitinB: "#2a1838",
    colorVein: "#9dff2e",
    colorSeam: "#f0ff9a",
    colorGoo: "#5cff22",
    colorSac: "#c6ff3a",
    colorDissolve: "#e6ff6a",

    /* ================================================================ */
    /* 3 · THE SWARM                                                     */
    /* ================================================================ */
    swarmCount: 520, // insects (max 900)
    pourTime: 1.0, // seconds the swarm takes to pour out of the hive
    emergeTime: 0.7, // seconds one insect takes from the mouth to the vortex
    burstHeight: 2.4, // metres they shoot up out of the mouth
    swirlRadiusMin: 0.25, // inner edge of the vortex, × zone radius
    swirlRadiusMax: 1.05, // outer edge of the vortex, × zone radius
    swirlHeightMin: 0.35, // metres
    swirlHeightMax: 2.7, // metres
    swirlSpeed: 1.7, // radians/second round the circle
    swirlSameWay: 0.85, // 0..1 how much of the swarm turns the same way
    swirlBob: 0.35, // metres they rise and fall
    flowAmp: 0.55, // metres the curl flow throws them about
    flowScale: 0.65, // flow features per metre
    flowSpeed: 0.9, // how fast the flow churns

    /* --- insects --- */
    insectSize: 0.13, // metres, body length
    insectStretch: 0.05, // how much a fast insect smears along its flight
    insectGlow: 3.2, // body brightness (bloom > 1)
    wingGlow: 1.3,
    haloSize: 3.2, // glow halo, × body
    haloGlow: 0.55,
    flapSpeed: 42, // wingbeats (radians) per second
    flapAngle: 0.95, // radians each wing sweeps
    feedFrenzy: 0.8, // how much brighter they burn while feeding
    colorInsectCore: "#f6ffb0",
    colorInsectBody: "#b6ff3d",
    colorWing: "#8dffb0",
    colorHalo: "#7cff2a",

    /* --- buzz (sparks round every feeding cloud) --- */
    buzzRate: 60, // per second, per body
    buzzSize: 0.03,
    buzzLifetime: 0.35,
    buzzSpeed: 3.2,
    buzzStretch: 0.3,
    buzzGlow: 2.6,
    colorBuzzA: "#fbffd2",
    colorBuzzB: "#d4ff6a",
    colorBuzzC: "#7ad62a",
    colorBuzzD: "#2a5a12",

    /* ================================================================ */
    /* 4 · ENGULF                                                        */
    /* ================================================================ */
    lockDelay: 1.5, // seconds after the hive cracks the swarm turns on the bodies
    lockTime: 0.7, // seconds one insect takes to dive onto its body
    lockStagger: 0.7, // seconds over which the whole swarm commits
    engulfReach: 1.05, // who is taken: the zone radius × this
    cloudRadius: 0.75, // metres the feeding cloud spreads round a body
    cloudTall: 1.5, // the cloud is this much taller than it is wide
    cloudSpeed: 4.5, // radians/second they orbit what they eat
    cloudHeight: 0.95, // metres up a standing body the cloud centres
    corrodeTime: 1.5, // seconds of feeding to stain a body through
    collapseAt: 0.55, // 0..1 how stained a body is when it collapses
    collapseImpulse: 1.0, // m/s — it folds, it is not thrown
    collapseLift: 0.3,
    collapseSpin: 0.9,
    writheRate: 6, // twitches per second while it is eaten on the floor
    writheForce: 1.3, // m/s sideways per twitch
    writheLift: 0.9, // m/s upward per twitch
    devour: 0.3, // 0..1 how much of a body the swarm takes with it when it leaves
    look: {
      color: '#0b1207', // the flesh, blackened
      rimColor: '#a8ff3a',
      rimEmissive: 1.8,
      edgeColor: '#e6ff7a',
      edgeEmissive: 4.0,
      edgeWidth: 0.06
    },

    /* ================================================================ */
    /* 5 · RETURN                                                        */
    /* ================================================================ */
    returnTime: 0.85, // seconds one insect takes to fly home
    returnStagger: 0.8, // seconds over which the whole swarm goes home

    /* ================================================================ */
    /* 6 · THE TOXIC POOL (ground treatment)                             */
    /* ================================================================ */
    poolRadius: 0.75, // the main pool, × zone radius
    poolDelay: 0.3, // seconds after the hive surfaces the pool starts to spread
    poolGrowTime: 1.6, // seconds to spread
    bodyPoolRadius: 1.0, // metres of pool welling up under each body eaten
    bodyPoolTime: 1.2, // seconds that takes
    poolEdgeNoise: 0.3, // raggedness of the edge
    poolFlowScale: 0.8, // liquid features per metre
    poolFlowSpeed: 1.0, // how fast it churns
    bubbleScale: 3.0, // bubble cells per metre
    bubbleRate: 0.9, // swell-and-pop cycles per second
    bubbleSize: 0.5, // bubble size, fraction of a cell
    bubbleShare: 0.45, // 0..1 how many cells are bubbling
    poolGlow: 1.6, // liquid and bubble glow
    poolCaustic: 1.2, // caustic veins
    poolEdgeGlow: 2.2, // the bright meniscus
    poolOpacity: 0.86,
    poolErode: 0.7, // 0..1 how raggedly it fades
    markWidth: 0.06, // the marking ring drawn while the cast travels, metres
    markGlow: 2.6,
    stainLife: 4, // seconds a SCORCH stain stays after the cast
    stainIntensity: 0.6,
    colorPoolDeep: "#08100a",
    colorPoolToxic: "#62d61e",
    colorPoolFoam: "#ecff8a",
    colorPoolEdge: "#b6ff3d",
    colorStainA: "#1d2a10",
    colorStainB: "#0a0f06",

    /* --- mist pooling on the floor --- */
    mistRate: 36, // puffs per second over the pool
    mistSize: 1.2,
    mistLifetime: 2.4,
    mistOpacity: 0.26,
    mistRise: 0.12, // m/s
    mistHeight: 0.25, // metres off the floor it is born
    colorMistA: "#a8ff5a",
    colorMistB: "#5fbf2a",
    colorMistC: "#2f6a1a",
    colorMistD: "#142a0c",

    /* --- bubbles rising out of it --- */
    bubbleParticleRate: 16, // per second
    bubbleParticleSize: 0.12,
    bubbleParticleLife: 1.1,
    bubbleRise: 0.8, // m/s
    colorBubbleA: "#eaff9a",
    colorBubbleB: "#a8ff3a",
    colorBubbleC: "#5cc21e",
    colorBubbleD: "#2a5a10",

    /* --- spores (the burrow, the crack, the dissolve) --- */
    sporeSize: 0.05,
    sporeLifetime: 1.3,
    sporeGlow: 2.4,
    colorSporeA: "#f4ffc0",
    colorSporeB: "#c6ff4a",
    colorSporeC: "#6ad022",
    colorSporeD: "#1f4a0c",

    /* ================================================================ */
    /* 7 · ERUPTION & CRACK                                              */
    /* ================================================================ */
    eruptChips: 60, // soil and chitin chips thrown as it surfaces
    chipSpeed: 6,
    chipSize: 0.09,
    chipLifetime: 1.1,
    chipGravity: -14,
    colorChipA: "#4a3a26",
    colorChipB: "#2f2617",
    colorChipC: "#1f2a12",
    colorChipD: "#0e120a",
    eruptShake: 0.32, // camera knock as it surfaces
    eruptFlash: 0.12,
    eruptLight: 1.3, // light punch, × lightIntensity
    burstRadius: 2.8, // EARTH burst as it surfaces, metres
    burstIntensity: 1.0,
    crackShake: 0.22, // camera knock as it cracks open
    crackFlash: 0.2,
    crackLight: 2.0,
    crackMist: 30, // mist puffs blown out of it
    crackSpores: 90, // spores blown out of it
    shockRadius: 5.5, // SHOCKWAVE as it cracks, metres
    colorBurstA: "#d8ff7a",
    colorBurstB: "#4a6a1a",
    colorBurstC: "#1a1408",
    colorShockA: "#b6ff3d",
    colorShockB: "#f2ffb0",
    colorFlash: "#c8ff6a",

    /* --- distortion: the air over the pool --- */
    warpStrength: 0.55,
    warpWidth: 2.2, // × zone radius
    warpHeight: 2.6, // metres
    warpScale: 1.6, // noise features per metre
    warpSpeed: 0.9
  }
};
