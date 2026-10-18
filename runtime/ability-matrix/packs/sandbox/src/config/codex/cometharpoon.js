/**
 * Comet Harpoon — Cosmic — a barbed harpoon of comet ice thrown down the line
 * on a tether of starlight, coma blazing at its head, an ion tail and a dust
 * tail streaming behind; it drives into the target and the comet *blooms*:
 * petals of ice-light open out of the strike while the tether snaps taut and
 * yanks the impaled body back toward the caster.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 */
export default {
  id: 'cometharpoon',
  meta: {
    label: 'Comet Harpoon',
    accent: '#ffe1a8',
    key: '',
    element: 'cosmic',
    hint: 'Cosmic — a harpoon of comet ice flies the line on a tether of starlight, drives in and blooms into petals of ice',
    cast: 'line',
    glyph: `<path d="M14 86L70 30"/><path d="M70 30L84 16L80 34Z"/><path d="M62 30L72 22"/><path d="M70 38L78 28"/><path d="M14 86C30 90 44 84 52 74"/><circle cx="78" cy="22" r="10"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 30, // metres/second the harpoon flies
    lifetime: 1.6, // seconds the bloom, the tether and the harpoon take to go
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light (rides the coma, then the bloom) --- */
    lightColor: '#cfe8ff',
    lightIntensity: 8,
    lightRadius: 10,

    /* ================================================================ */
    /* 1 · THE THROW                                                     */
    /* ================================================================ */
    handForward: 0.5, // metres in front of the caster the throw leaves
    handSide: 0.25, // metres to the right
    handHeight: 1.6, // metres off the floor
    arcHeight: 1.4, // metres the flight arcs up mid-way
    embedDepth: 0.55, // metres the head drives into the floor
    harpoonScale: 1.0, // the whole harpoon (2.6 m at 1)
    rollRate: 1.6, // revolutions/second it spins in flight
    quiverAmp: 4, // degrees the embedded shaft shudders
    quiverFreq: 26, // shudders per second (radians × 1/2π)
    quiverDecay: 6, // how fast the shudder dies

    /* ================================================================ */
    /* 2 · THE HARPOON                                                   */
    /* ================================================================ */
    harpoonGlow: 1.0, // overall brightness
    headGlow: 5, // the white-hot broadhead (bloom > 1)
    veinGlow: 1.6, // ice seams glowing through the shaft
    veinScale: 6, // seams per metre
    harpoonFresnel: 1.5, // cyan rim
    dissolveEdge: 0.06,
    colorHarpoonBody: '#16233f',
    colorHarpoonIce: '#9fd8ff',
    colorHarpoonHead: '#ffffff',
    colorHarpoonGold: '#ffd27a',

    /* ================================================================ */
    /* 3 · THE COMA                                                      */
    /* ================================================================ */
    comaSize: 1.3, // radius, metres
    comaGlow: 3.2,
    comaHood: 0.5, // 0 round .. 1 strongly hooded forward
    comaJets: 5, // flickering jets
    comaFlare: 2.5, // × brightness at the strike
    colorComaCore: '#ffffff',
    colorComaHalo: '#8fd0ff',

    /* ================================================================ */
    /* 4 · THE TAILS                                                     */
    /* ================================================================ */
    ionLength: 6, // metres of straight blue ion tail
    ionWidth: 0.38, // metres across at its far end
    ionGlow: 2.6,
    ionStreamers: 7, // combed streamers across it
    ionFlow: 10, // how fast the streamers stream away
    colorIonA: '#e8f6ff',
    colorIonB: '#4aa8ff',
    dustLength: 4.5, // metres of curving gold dust tail
    dustWidth: 1.1, // metres across at its far end
    dustBend: 0.55, // how far it curves away, × its length
    dustSide: 1, // −1 curves left, +1 right
    dustDrop: 0.6, // share of the curve that sags down
    dustGlow: 1.6,
    dustOpacity: 0.8,
    colorDustTailA: '#fff2c8',
    colorDustTailB: '#ffb04a',
    tailShrink: 0.25, // seconds the tails take to collapse into the strike

    /* ================================================================ */
    /* 5 · THE TETHER                                                    */
    /* ================================================================ */
    tetherWidth: 0.035, // metres
    tetherGlow: 2.8,
    tetherSag: 0.7, // metres it sags while paying out
    tetherWave: 0.12, // metres of ripple while it flies
    tetherWaveLength: 2.5, // metres per ripple
    tetherBeads: 1.6, // beads of light per metre
    tetherFlow: 6, // beads/second running down it
    tetherSnap: 0.12, // seconds it takes to go taut at the strike
    frayTime: 0.6, // share of the fade it takes to fray away
    colorTether: '#bfe4ff',
    colorTetherBead: '#ffffff',

    /* ================================================================ */
    /* 6 · THE BLOOM                                                     */
    /* ================================================================ */
    petals: 7, // per row (max 12)
    innerPetals: 1, // 1 adds an inner row, half a step round
    petalLength: 2.3, // metres
    petalWidth: 0.6, // metres at the widest
    petalOpenTime: 0.45, // seconds they take to open
    petalHold: 0.35, // seconds they stay open before the fade
    petalClosed: 10, // degrees from vertical, as a bud
    petalOpen: 70, // degrees from vertical, open
    petalCurl: 0.32, // tips curl outward, × length
    petalCup: 0.25, // how cupped each petal is
    petalTwist: 0.35, // radians each petal twists along its length
    petalSpin: 0.25, // radians/second the bloom turns
    petalGlow: 2.4,
    petalVeinGlow: 2.6,
    petalSoftFade: 0.2,
    colorPetalA: '#ffffff',
    colorPetalB: '#9fe0ff',
    colorPetalC: '#3c7cff',
    colorPetalVein: '#ffd27a',

    /* ================================================================ */
    /* 7 · THE CRATER                                                    */
    /* ================================================================ */
    craterRadius: 3.2, // metres
    crackCount: 14, // frost cracks radiating out
    crackGrowTime: 0.3, // seconds they take to race out
    crackGlow: 3,
    craterRingGlow: 2.5,
    coolCurve: 1.2, // >1 holds the glow longer
    colorCrackHot: '#e8f8ff',
    colorCrack: '#56b8ff',
    colorCraterRing: '#ffcf7a',
    colorCraterChar: '#0c1424',

    /* ================================================================ */
    /* 8 · PARTICLES                                                     */
    /* ================================================================ */
    dustRate: 160, // gold grains per second shed off the dust tail
    dustGrainSize: 0.04,
    dustGrainSpeed: 0.6,
    dustGrainLife: 1.0,
    dustGrainGlow: 2.4,
    colorGrainA: '#fffbe8',
    colorGrainB: '#ffd47a',
    colorGrainC: '#ff9a3a',
    colorGrainD: '#5a2a08',
    sparkCount: 170, // ice sparks thrown at the strike
    sparkSpeed: 11,
    sparkSize: 0.03,
    sparkStretch: 0.25,
    sparkLife: 0.6,
    sparkGravity: 9,
    sparkGlow: 3.2,
    colorSparkA: '#ffffff',
    colorSparkB: '#d8f2ff',
    colorSparkC: '#6cc0ff',
    colorSparkD: '#1a3c8a',
    vaporRate: 40, // puffs per second sublimating off the head
    vaporCount: 26, // the plume at the strike
    vaporSize: 0.55,
    vaporLift: 0.8,
    vaporLife: 1.6,
    vaporOpacity: 0.3,
    colorVaporA: '#d8eeff',
    colorVaporB: '#9ab8d8',
    colorVaporC: '#5a7090',
    colorVaporD: '#2a3446',

    /* ================================================================ */
    /* 9 · THE STRIKE                                                    */
    /* ================================================================ */
    burstSize: 2.6, // the FROST shell, metres
    burstIntensity: 1.2,
    shockRadius: 6.5, // the shockwave on the floor, metres
    lensRadius: 1.4, // metres of shimmer round the head in flight
    lensStrength: 0.7,
    ringRadius: 5, // metres the bloom's pressure ring opens to
    ringTime: 0.45,
    impactFlash: 0.45,
    impactShake: 0.5,
    shakeDuration: 0.4,
    impactLight: 3, // light punch, × lightIntensity
    colorBurstA: '#ffffff',
    colorBurstB: '#a8dcff',
    colorBurstC: '#2a5cff',
    colorShockA: '#8fd0ff',
    colorShockB: '#ffffff',
    colorFlash: '#d8eeff',

    /* ================================================================ */
    /* 10 · HITS                                                         */
    /* ================================================================ */
    impaleRadius: 1.1, // metres: the body nearest the strike is harpooned
    yankImpulse: 14, // m/s it is yanked back toward the caster
    yankLift: 3.5,
    bloomRadius: 3.4, // metres the bloom throws everything else
    hitImpulse: 9,
    hitLift: 5,
    hitSpin: 2
  }
};
