/**
 * Seedstorm Volley — Nature — a fan of glowing seeds that sprout into lashing saplings.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * Every seed record stores only dice (where along the line, how far out in the
 * fan, how high its arc). Every metre, second and colour below is resolved by
 * `SeedstormVolleyAbility` each frame, so dragging `fanWidth` re-aims seeds
 * already in the air and dragging `lashAngle` changes a whip mid-swing.
 */
export default {
  id: 'seedstorm',
  meta: {
    label: "Seedstorm Volley",
    accent: '#8fe36b',
    key: '',
    element: 'nature',
    hint: "Nature — a fan of glowing seeds peppers the line; each one bursts into a sapling that whips whatever stands near it",
    cast: 'line',
    glyph: `<path d="M14 82C30 50 52 30 86 18"/><path d="M14 82C36 62 58 52 88 46"/><path d="M14 82C40 74 62 72 86 76"/><path d="M50 88V64"/><path d="M50 72C42 66 40 58 42 52C48 56 52 64 50 72Z"/><path d="M50 66C58 60 62 54 60 46C54 50 50 58 50 66Z"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 20, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 24, // how fast the volley's front runs down the line, m/s
    lifetime: 1.4, // seconds each sapling stands after it has lashed, before it withers
    cooldown: 0.5, // seconds before the ability can be armed again
    castAnim: "cast1", // which clip in `CAST_ANIMATIONS` the body throws
    handHeight: 1.35, // metres off the floor the seeds leave the hand at

    /* --- light --- */
    lightColor: "#8fe36b",
    lightIntensity: 6, // steady glow over the volley / the grove
    lightRadius: 8,
    lightFlicker: 0.2, // 0..1 how much it breathes
    lightHeight: 1.3, // metres off the floor the light rides once the grove stands

    /* ================================================================ */
    /* 1 · THE VOLLEY                                                    */
    /* ================================================================ */
    seedCount: 9, // seeds thrown (max 16), one sapling each
    firstLand: 0.16, // fraction of the line the nearest seed lands at
    landJitter: 0.45, // 0..1 how irregular the spacing down the line is
    fanWidth: 1.7, // metres either side of the line the fan reaches at its far end
    fanCurve: 0.7, // how the fan opens: <1 wide early, >1 wide late
    volleyStagger: 0.04, // seconds between one seed leaving the hand and the next
    arcHeight: 1.9, // metres the arc rises over a 10 m throw
    arcJitter: 0.35, // 0..1 variation in arc height
    minFlight: 0.22, // shortest time in the air, seconds
    seedSize: 0.17, // seed length, metres
    seedWidth: 1.0, // girth multiplier
    seedSpin: 16, // radians/second the seeds roll as they fly
    seedGlow: 3.6, // brightness of the core (bloom > 1)
    seedRim: 2.4, // fresnel rim brightness
    seedPulse: 0.45, // 0..1 how hard the core throbs
    seedVeinScale: 6, // vein features over the husk
    embedDepth: 0.06, // metres a landed seed sinks before it bursts
    embedGlow: 2.2, // how much brighter it flares just before it sprouts
    colorSeedCore: "#f2ffc4",
    colorSeedBody: "#7fdc4a",
    colorSeedRim: "#d9ff86",

    /* --- streak trails and motes --- */
    trailRate: 90, // streaks per second, per seed in the air
    trailSize: 0.05, // streak width
    trailLifetime: 0.3,
    trailStretch: 0.35, // how long the streaks smear
    trailGlow: 2.6,
    trailDrift: 0.5, // m/s they fall back along the path
    colorTrailA: "#f4ffd0",
    colorTrailB: "#b6f56a",
    colorTrailC: "#5fbf3a",
    colorTrailD: "#1f5a1c",
    moteRate: 24, // glowing pollen shed per second, per seed
    moteSize: 0.045,
    moteLifetime: 0.9,
    moteRise: 0.5, // m/s upward drift
    colorMoteA: "#f6ffd8",
    colorMoteB: "#c9ff7a",
    colorMoteC: "#7ad64c",
    colorMoteD: "#2b6a24",

    /* ================================================================ */
    /* 2 · LANDING                                                       */
    /* ================================================================ */
    sproutDelay: 0.13, // seconds a seed sits in the floor before it bursts
    landChips: 8, // soil chips popped up where a seed lands
    landDust: 4, // dust puffs where a seed lands
    landRingRadius: 0.6, // dust ring on the floor, metres
    landRingLife: 0.55,
    landShake: 0.04, // camera tap per landing

    /* ================================================================ */
    /* 3 · THE SAPLING — shape                                           */
    /* ================================================================ */
    saplingHeight: 2.2, // metres at full height
    heightJitter: 0.25, // 0..1 variation between saplings
    girth: 1.15, // trunk thickness multiplier
    leafSize: 1.15, // leaf size multiplier
    branchCount: 5, // branches off the trunk (rebuilds the shape)
    twigCount: 3, // twigs off each branch (rebuilds the shape)
    leafDensity: 1.1, // 0..2 leaves on the young wood (rebuilds the shape)
    woodCurve: 0.38, // 0..1 how much the wood wanders (rebuilds the shape)
    branchSpread: 0.55, // 0..1 how far branches splay (rebuilds the shape)
    growTime: 0.3, // seconds to burst to full height
    growOvershoot: 0.16, // how far past full height the burst punches
    growSettle: 0.25, // seconds to settle back after the punch
    growFeather: 0.12, // softness of the grow front, fraction of the tree
    bendCurve: 1.7, // how much of a bend lives in the crown (higher = whippier)
    sway: 0.05, // radians of idle sway
    swaySpeed: 1.5,

    /* --- shading --- */
    barkRoughness: 0.78,
    barkScale: 9, // streaks along the bark
    frontGlow: 4.5, // the band of light that rides up the wood as it grows
    veinGlow: 0.9, // sap veins in the bark and leaf veins
    leafGlow: 0.55, // backlit translucency of the leaves
    rimGlow: 0.9, // fresnel rim on the young wood
    flashGlow: 3.2, // the whole tree flares as it strikes
    colorBarkDark: "#2a1c12",
    colorBarkLight: "#6b4d32",
    colorYoung: "#5f9a3a",
    colorLeafBase: "#2f7d2a",
    colorLeafTip: "#9be05a",
    colorLeafVein: "#d6ff9a",
    colorGlow: "#9dff5c",

    /* ================================================================ */
    /* 4 · THE LASH                                                      */
    /* ================================================================ */
    lashDelay: 0.04, // seconds after full height before it winds up
    windupTime: 0.16, // seconds it coils back
    windupAngle: 0.55, // radians it coils back by
    snapTime: 0.085, // seconds the whip takes to come over
    lashAngle: 1.3, // radians it lashes forward
    recoilTime: 0.8, // seconds to swing back to rest
    recoilWobble: 2.5, // oscillations while it settles
    restLean: 0.1, // radians it is left leaning toward what it hit
    aimReach: 1.7, // looks for a body within strikeRadius × this to lash at

    /* --- what the lash throws --- */
    lashLeaves: 26, // leaves torn off the crown
    leafSpeed: 5.5, // m/s
    leafParticleSize: 0.13,
    leafLifetime: 1.7,
    leafSpin: 7,
    leafGravity: -2.0, // m/s² — leaves flutter, they do not drop
    colorLeafA: "#b7f06a",
    colorLeafB: "#5fb83a",
    colorLeafC: "#3d7a26",
    colorLeafD: "#7a6a2a",
    lashChips: 14, // soil chips kicked up at the root
    chipSpeed: 4.5,
    chipSize: 0.07,
    chipLifetime: 1.0,
    chipGravity: -13,
    colorChipA: "#5b412b",
    colorChipB: "#463220",
    colorChipC: "#30231a",
    colorChipD: "#1d1610",
    lashDust: 6, // dust puffs at the root
    dustSize: 0.55,
    dustLifetime: 1.3,
    dustOpacity: 0.32,
    colorDustA: "#9b8466",
    colorDustB: "#7b6650",
    colorDustC: "#5a4a3b",
    colorDustD: "#3a3129",

    /* ================================================================ */
    /* 5 · THE STRIKE                                                    */
    /* ================================================================ */
    strikeRadius: 1.9, // metres round a sapling its lash reaches
    strikeImpulse: 9, // m/s a body is flung away from the sapling
    strikeLift: 4.2, // m/s upward
    strikeSpin: 1.6, // tumble
    corpseShove: 4, // m/s a body already down is batted on
    strikeShake: 0.16, // camera knock per strike that connects
    strikeLight: 0.9, // light punch per strike, × lightIntensity
    hitLeaves: 14, // extra leaves burst where a body is struck

    /* ================================================================ */
    /* 6 · ERUPTION                                                      */
    /* ================================================================ */
    sproutShake: 0.1, // camera knock per sapling bursting out
    sproutLight: 0.6, // light punch per sprout, × lightIntensity
    burstRadius: 1.2, // the EARTH burst at the root, metres
    burstIntensity: 0.9,
    crackRadius: 1.1, // CRACK decal at the root, metres
    crackLife: 1.6,
    shockRadius: 2.6, // green SHOCKWAVE on the floor when it lashes, metres
    impactFlash: 0.12, // flash as the first sapling erupts
    colorBurstA: "#d9ff8a",
    colorBurstB: "#6a8f3a",
    colorBurstC: "#3a2a1a",
    colorCrackA: "#1a120c",
    colorCrackB: "#7ee04a",
    colorShockA: "#b6ff7a",
    colorShockB: "#ffffff",
    colorFlash: "#d8ffb0",

    /* --- distortion --- */
    warpStrength: 0.9, // how hard the lens ring bends the world
    warpSize: 2.8, // metres across the ring grows to
    warpTime: 0.45, // seconds a ring lives
    warpWidth: 0.2, // ring thickness, fraction of its size
    warpNoise: 0.3, // turbulence in the ring
    warpHeight: 1.1, // metres off the floor the ring sits

    /* ================================================================ */
    /* 7 · SOIL SCATTER (the ground treatment)                           */
    /* ================================================================ */
    soilRadius: 0.95, // metres of churned earth round each sapling
    soilOpen: 0.25, // seconds the scatter takes to throw open
    soilDark: 0.82, // opacity of the churned earth
    soilClods: 0.85, // opacity of the scattered clods
    soilClodScale: 7, // clods per metre
    soilCracks: 7, // cracks running out of each hole
    soilEdgeNoise: 0.3, // raggedness of the disc
    soilRootGlow: 1.5, // brightness of the roots of light
    soilRootScale: 3.4, // root features per metre
    soilRootCool: 1.4, // seconds the roots take to cool
    soilErode: 0.7, // 0..1 how raggedly it fades
    soilLinger: 3.2, // seconds a SCORCH-decal soil stain stays after the cast
    soilStain: 0.55, // that stain's strength
    colorSoilDeep: "#120c08",
    colorSoil: "#3c2a1c",
    colorSoilLight: "#6e5438",
    colorRootGlow: "#7dff4a",

    /* ================================================================ */
    /* 8 · WITHER                                                        */
    /* ================================================================ */
    witherTime: 1.3, // seconds a sapling takes to wither and retract
    witherStagger: 0.08, // extra seconds between one sapling and the next
    witherDroop: 0.7, // how far the withered leaves hang
    witherSlump: 0.55, // radians the tree slumps over as it dies
    sinkDepth: 1.05, // how far it sinks back into the floor, × its height
    leafFall: 22, // brown leaves shed per sapling as it withers
    colorLeafWither: "#9a7a2c",
    colorBarkWither: "#3b3026"
  }
};
