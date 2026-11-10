/**
 * Bloom Crown — Nature — a circlet of blossoms flies to the circle, opens and
 * orbits over it as a crown, then gathers into one seed and slams it down.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * A blossom holds only dice (a seed, a bloom-timing roll, a size roll). Every
 * metre, radian, second and colour below is resolved by `BloomCrownAbility`
 * every frame — the crown's spin and tilt are integrated, so their rates can
 * be dragged mid-cast without the crown jumping.
 */
export default {
  id: 'bloomcrown',
  meta: {
    label: 'Bloom Crown',
    accent: '#ffd0ea',
    key: '',
    element: 'nature',
    hint: 'Nature — a crown of blossoms orbits over the circle, gathers into one seed and slams it into the floor',
    cast: 'zone',
    glyph: `<ellipse cx="50" cy="34" rx="34" ry="10"/><circle cx="16" cy="34" r="6"/><circle cx="84" cy="34" r="6"/><circle cx="50" cy="24" r="6"/><circle cx="30" cy="43" r="5"/><circle cx="70" cy="43" r="5"/><path d="M50 52V80"/><path d="M42 72L50 84L58 72"/><path d="M26 88H74"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // metres/second the circlet flies to the circle
    lifetime: 0.5, // seconds the open crown turns before it gathers
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.4, // metres — the circle under the crown

    /* --- light --- */
    lightColor: '#fff6e8',
    lightIntensity: 6, // the crown's glow
    lightRadius: 10,
    lightLow: 0.6, // metres over the floor the light sits after the slam

    /* ================================================================ */
    /* TIMING                                                            */
    /* ================================================================ */
    expandTime: 0.35, // seconds the circlet takes to widen into the crown
    bloomDelay: 0.06, // seconds after landing the first bud opens
    bloomStagger: 0.25, // seconds over which the rest follow
    bloomTime: 0.36, // seconds one blossom takes to open
    gatherTime: 0.38, // seconds the crown takes to draw in and fuse
    shutAt: 0.4, // the blossoms are shut by this share of the gather
    slamTime: 0.13, // seconds the seed takes to fall
    slamLinger: 1.3, // seconds after the slam before the fade begins
    fadeTime: 0.9, // seconds the garden takes to wilt and the floor to burn away

    /* ================================================================ */
    /* 1 · THE CROWN                                                     */
    /* ================================================================ */
    blossoms: 7,
    crownRadius: 0.62, // the crown's radius, × zoneRadius
    crownHeight: 2.3, // metres over the floor it turns at
    travelRadius: 1.1, // metres, the circlet in flight
    travelHeight: 1.5, // metres, in flight
    spinTravel: 5, // radians/second in flight
    spinCrown: 2.6, // as it opens
    spinPeak: 6, // just before it gathers
    spinGather: 9, // extra while it draws in
    tilt: 0.45, // metres the ring wobbles up and down as it turns
    tiltSpeed: 1.4, // radians/second the wobble precesses
    crownDescend: 0.7, // metres it sinks onto the circle while it turns
    gatherLift: 0.35, // metres it rises as it draws in, before the drop
    faceOut: 0.75, // how far the blossoms face out from the crown
    blossomRoll: 0.4, // how fast each blossom turns on its own axis, × the spin
    budScale: 0.8, // size of the buds in flight
    sizeJitter: 0.15,

    /* ================================================================ */
    /* 2 · THE PETALS                                                    */
    /* ================================================================ */
    petalsPerWhorl: 6,
    petalLength: 0.78, // metres
    petalWidth: 0.3, // half-width at the widest, metres
    innerScale: 0.68, // the inner whorl, × the outer
    budPitch: 0.12, // radians off the blossom's axis, shut
    openPitch: 1.25, // radians off the axis, open
    budCurl: -0.7, // curl along the petal, shut (negative curls inward)
    openCurl: 0.7, // curl along the petal, open (positive curls back)
    petalCup: 0.45, // how much the edges cup inward
    petalFlutter: 0.12,
    petalVeins: 9,
    veinStrength: 0.55,
    petalSSS: 0.3, // light through the thin petal (tinted by the petal, never white)
    petalRimGlow: 0.45,
    heartGlow: 1.6, // the gold heart of an open blossom
    chargeGlow: 5, // white-hot as the crown gathers (bloom > 1)
    petalAmbient: 0.17,
    petalDeep: 0.75, // the shaded side falls to the deep stop, not to grey
    petalDiffuse: 0.75,
    colorPetalHeart: '#ffd060', // the gold glow tight at the heart only
    colorPetalBase: '#1c020e', // wine-black at the petal's base
    colorPetalMid: '#7c0a3c', // the saturated body of the petal
    colorPetalTip: '#ff5ca6', // pink, only on the tip and the margins
    petalEdgeStart: 0.7, // |across| where the pink margin starts
    petalTipStart: 0.74, // along the petal where the pink tip starts
    petalEdgeTint: 0.8, // how far the margins/tips go to pink
    colorPetalVein: '#3a0420',
    colorPetalRim: '#ff6aae',
    colorPetalDeep: '#14020a',
    colorCharge: '#fff4d6',

    /* ================================================================ */
    /* 3 · HEARTS & THE SEED                                             */
    /* ================================================================ */
    heartSize: 0.12, // metres
    heartLift: 0.05, // metres along the blossom's axis
    heartCoreGlow: 1.5,
    seedSize: 0.36, // metres
    seedElongation: 1.45, // the seed is an almond, longer than wide
    seedStretch: 0.9, // how far it stretches as it falls
    seedSink: 0.35, // seconds it takes to sink into the floor
    seedGlow: 2.4,
    seedRim: 3.5,
    seedVeins: 1.5,
    colorSeedCore: '#d6ff9a',
    colorSeedShell: '#ffe08a',
    colorSeedVein: '#7dffa0',

    /* ================================================================ */
    /* 4 · THE GARLAND                                                   */
    /* ================================================================ */
    garlandThickness: 0.08, // metres
    garlandSag: 0.45, // metres it hangs between blossoms
    garlandGlow: 2.2,
    garlandLeaves: 42, // leaf glints round the ring
    garlandChase: 0.6, // how fast they chase round
    garlandTravel: 0.7, // how much of the garland shows in flight
    colorGarland: '#2f9a48',
    colorGarlandLeaf: '#d6ffa0',

    /* ================================================================ */
    /* 5 · THE SIGIL & THE GREEN WAVE                                    */
    /* ================================================================ */
    sigilLit: 0.9, // how bright the mandala is under the turning crown
    sigilGlow: 2,
    sigilLine: 0.1, // metres
    sigilFill: 0.3, // the rose's petals washed in between its lines
    sigilSpin: 0.3, // turns with the crown, × its spin
    flareDecay: 3, // how fast the slam's flare dies
    waveSpeed: 12, // metres/second the green ring runs out
    waveReach: 1.6, // how far, × zoneRadius
    waveWidth: 0.45, // metres
    greenStrength: 0.8, // the floor greened behind the ring
    slamWarp: 1.4, // the lens ring's strength
    warpSpeed: 11, // metres/second it runs out
    warpWidth: 0.5,
    colorSigil: '#ff4fa8',
    colorSigilHot: '#ff8ac4',
    colorWave: '#4ad84a',
    colorGreen: '#2f8a30',

    /* ================================================================ */
    /* 5b · THE GROUND (normal-blended: the ramp's deep stop)            */
    /* ================================================================ */
    groundOpacity: 0.92,
    poolDepth: 0.9, // the wine-dark pool under the turning crown
    mossStrength: 1, // moss crawling out behind the green ring
    mossReach: 1.25, // × zoneRadius
    mossCreep: 0.6, // metres/second it keeps creeping through the linger
    mossBreathe: 1.2, // lit veins breathing outward through the moss
    stainStrength: 0.8, // fallen-petal stains in the moss
    colorGroundDeep: '#12050d',
    colorGroundSoil: '#4a3020',
    colorGroundMoss: '#1d5a22',
    colorGroundMossLit: '#8af06a',
    colorGroundStain: '#8c1a58',

    /* ================================================================ */
    /* 5c · THE GARDEN — the crown regrown out of the floor              */
    /* ================================================================ */
    gardenCount: 10, // blossoms (the first sits in the crater if gardenHeart)
    gardenHeart: 1, // 1 puts one in the crater
    gardenRadius: 0.66, // ring radius, × zoneRadius
    gardenJitter: 0.16,
    gardenScale: 1.35, // × the petal size
    gardenHeartScale: 1.5, // the crater blossom, × gardenScale
    gardenHeight: 0.06, // metres over the floor it seats at
    gardenRise: 0.5, // metres below the floor it heaves up from (and sinks back to)
    gardenLean: 0.35, // leans out from the strike
    gardenGrow: 0.22, // seconds to heave up
    gardenOpen: 0.3, // seconds to open
    gardenLag: 0.12, // seconds of sprout jitter
    gardenSpin: 0.7, // radians/second each turns on its stem
    gardenTurn: 0.25, // radians/second the whole ring turns
    gardenBreathe: 0.12, // ± open, breathing
    gardenBreatheRate: 3.2,
    gardenFlash: 0.25, // white-hot as it breaks the soil
    gardenFlashDecay: 5,

    /* ================================================================ */
    /* 6 · THE SLAM                                                      */
    /* ================================================================ */
    slamShake: 0.6,
    slamShakeTime: 0.35,
    slamFlash: 0.18,
    slamLight: 3, // light punch, × lightIntensity
    burstRadius: 2.4, // the EARTH burst, metres
    shockScale: 1.5, // the shockwave, × zoneRadius
    craterRadius: 1.4, // the crack the seed leaves, metres
    colorFlash: '#ff7ab8',
    colorBurstA: '#8a6a44',
    colorBurstB: '#6a5236',
    colorBurstC: '#3a2a18',

    /* ================================================================ */
    /* 7 · PETALS, POLLEN, SOIL, GRASS                                   */
    /* ================================================================ */
    shedRate: 30, // petals per second flung off the turning crown
    shedSpeed: 3.2,
    shedSize: 0.14,
    shedLife: 1.8,
    shedFall: 1.2,
    shedGlow: 1.1,
    burstPetals: 160, // petals burst out by the slam
    burstPetalSpeed: 7,
    colorShedA: '#ff6aae',
    colorShedB: '#c8186c',
    colorShedC: '#7a0a3e',
    colorShedD: '#2a0416',
    pollenRate: 160, // per second off the blossoms
    pollenSpeed: 0.35,
    pollenSize: 0.045,
    pollenLife: 1.2,
    pollenFall: 0.4,
    pollenGlow: 3,
    burstPollen: 220,
    colorPollenA: '#fffbe0',
    colorPollenB: '#ffe37a',
    colorPollenC: '#ffb040',
    colorPollenD: '#a05a10',
    soilCount: 70,
    soilSpeed: 7,
    soilSize: 0.09,
    soilLife: 1.1,
    colorSoilA: '#7a6040',
    colorSoilB: '#54402a',
    colorSoilC: '#33261a',
    colorSoilD: '#1a130c',
    grassCount: 160, // blades thrown up across the circle by the slam
    grassSpeed: 3.6,
    grassSize: 0.12,
    grassLife: 1,
    colorGrassA: '#d6ff9a',
    colorGrassB: '#8ad65a',
    colorGrassC: '#4a9a34',
    colorGrassD: '#24501a',

    /* ================================================================ */
    /* 8 · THE BODIES                                                    */
    /* ================================================================ */
    hitReach: 1, // × zoneRadius
    hitImpulse: 10, // m/s thrown outward, at the centre
    hitLift: 6.5, // m/s, at the centre
    hitSpin: 2
  }
};
