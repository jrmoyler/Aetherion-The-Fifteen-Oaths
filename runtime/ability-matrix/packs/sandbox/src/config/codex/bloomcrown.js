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
    speed: 16, // metres/second the circlet flies to the circle
    lifetime: 1.4, // seconds the open crown turns before it gathers
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
    expandTime: 0.45, // seconds the circlet takes to widen into the crown
    bloomDelay: 0.12, // seconds after landing the first bud opens
    bloomStagger: 0.4, // seconds over which the rest follow
    bloomTime: 0.5, // seconds one blossom takes to open
    gatherTime: 0.45, // seconds the crown takes to draw in and fuse
    shutAt: 0.4, // the blossoms are shut by this share of the gather
    slamTime: 0.16, // seconds the seed takes to fall
    slamLinger: 0.7, // seconds after the slam before the fade begins
    fadeTime: 1.2, // seconds the sigil takes to burn down

    /* ================================================================ */
    /* 1 · THE CROWN                                                     */
    /* ================================================================ */
    blossoms: 7,
    crownRadius: 0.62, // the crown's radius, × zoneRadius
    crownHeight: 2.9, // metres over the floor it turns at
    travelRadius: 1.1, // metres, the circlet in flight
    travelHeight: 1.7, // metres, in flight
    spinTravel: 5, // radians/second in flight
    spinCrown: 1.6, // as it opens
    spinPeak: 4.5, // just before it gathers
    spinGather: 9, // extra while it draws in
    tilt: 0.35, // metres the ring wobbles up and down as it turns
    tiltSpeed: 1.4, // radians/second the wobble precesses
    gatherLift: 0.6, // metres it rises as it draws in, before the drop
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
    petalSSS: 0.9, // light through the thin petal
    petalRimGlow: 0.7,
    heartGlow: 1.6, // the gold heart of an open blossom
    chargeGlow: 5, // white-hot as the crown gathers (bloom > 1)
    petalAmbient: 0.45,
    petalDiffuse: 0.85,
    colorPetalHeart: '#ffe37a',
    colorPetalMid: '#ffc2dc',
    colorPetalTip: '#e0569a',
    colorPetalVein: '#b03a78',
    colorPetalRim: '#ffe6f2',
    colorCharge: '#fff4d6',

    /* ================================================================ */
    /* 3 · HEARTS & THE SEED                                             */
    /* ================================================================ */
    heartSize: 0.17, // metres
    heartLift: 0.05, // metres along the blossom's axis
    heartCoreGlow: 2.2,
    seedSize: 0.36, // metres
    seedElongation: 1.45, // the seed is an almond, longer than wide
    seedStretch: 0.9, // how far it stretches as it falls
    seedSink: 0.35, // seconds it takes to sink into the floor
    seedGlow: 3.2,
    seedRim: 3.5,
    seedVeins: 1.5,
    colorSeedCore: '#d6ff9a',
    colorSeedShell: '#fff6c8',
    colorSeedVein: '#7dffa0',

    /* ================================================================ */
    /* 4 · THE GARLAND                                                   */
    /* ================================================================ */
    garlandThickness: 0.055, // metres
    garlandSag: 0.45, // metres it hangs between blossoms
    garlandGlow: 2.2,
    garlandLeaves: 42, // leaf glints round the ring
    garlandChase: 0.6, // how fast they chase round
    garlandTravel: 0.7, // how much of the garland shows in flight
    colorGarland: '#5ccf6a',
    colorGarlandLeaf: '#d6ffa0',

    /* ================================================================ */
    /* 5 · THE SIGIL & THE GREEN WAVE                                    */
    /* ================================================================ */
    sigilLit: 0.6, // how bright the mandala is under the turning crown
    sigilGlow: 2.4,
    sigilLine: 0.06, // metres
    sigilSpin: 0.3, // turns with the crown, × its spin
    flareDecay: 3, // how fast the slam's flare dies
    waveSpeed: 9, // metres/second the green ring runs out
    waveReach: 1.6, // how far, × zoneRadius
    waveWidth: 0.45, // metres
    greenStrength: 0.8, // the floor greened behind the ring
    slamWarp: 1.4, // the lens ring's strength
    warpSpeed: 11, // metres/second it runs out
    warpWidth: 0.5,
    colorSigil: '#ffb8de',
    colorSigilHot: '#fff2c8',
    colorWave: '#9dff7a',
    colorGreen: '#3c9a3a',

    /* ================================================================ */
    /* 6 · THE SLAM                                                      */
    /* ================================================================ */
    slamShake: 0.6,
    slamShakeTime: 0.35,
    slamFlash: 0.35,
    slamLight: 3, // light punch, × lightIntensity
    burstRadius: 2.4, // the EARTH burst, metres
    shockScale: 1.5, // the shockwave, × zoneRadius
    craterRadius: 1.4, // the crack the seed leaves, metres
    colorFlash: '#fff0f8',
    colorBurstA: '#fff2c8',
    colorBurstB: '#a88a5a',
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
    colorShedA: '#fff0f6',
    colorShedB: '#ffb2d4',
    colorShedC: '#e0569a',
    colorShedD: '#7a1a4a',
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
