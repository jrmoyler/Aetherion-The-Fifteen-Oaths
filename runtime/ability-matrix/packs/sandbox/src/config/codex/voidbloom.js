/**
 * Void Bloom — Shadow — a black flower bursts out of the floor, opens, and
 * draws everything in the circle into its throat before it snaps shut.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 *
 * Every dimension below is resolved per frame by `VoidBloomAbility`, so a
 * slider re-shapes a bloom that is already open.
 */
export default {
  id: 'voidbloom',
  meta: {
    label: 'Void Bloom',
    accent: '#6a5cff',
    key: '',
    element: 'shadow',
    hint: 'Shadow — a black flower bursts from the floor and opens; its throat pulls the circle in, then the petals snap shut and sink',
    cast: 'zone',
    glyph: `<path d="M50 82C34 64 30 40 50 18C70 40 66 64 50 82Z"/><path d="M50 82C30 76 14 58 16 40C34 44 46 60 50 82Z"/><path d="M50 82C70 76 86 58 84 40C66 44 54 60 50 82Z"/><circle cx="50" cy="82" r="4"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // how fast the seed flies, metres/second
    lifetime: 1.4, // seconds the vein stain takes to fade once the bloom has sunk
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.6, // metres — what the bloom pulls in

    /* --- light --- */
    lightColor: '#b8a8ff',
    lightIntensity: 9, // from the throat
    lightRadius: 10,
    lightFlicker: 0.3,

    /* ================================================================ */
    /* 1 · THE SEED                                                      */
    /* ================================================================ */
    handForward: 0.5,
    handHeight: 1.4,
    arcHeight: 2.0, // metres the throw arcs
    seedSize: 0.4, // radius of the seed billboard, metres

    /* ================================================================ */
    /* 2 · THE PETALS                                                    */
    /* ================================================================ */
    petals: 7, // petals round the bloom (3..10)
    petalReach: 0.72, // petal length, × zoneRadius
    petalWidth: 0.95, // half-width at the widest, metres
    petalCup: 0.35, // how much each petal cups
    petalBase: 0.35, // metres out from the centre the petals root
    budAngle: 1.5, // radians a closed petal stands at (π/2 = upright)
    budCurl: 1.1, // radians a closed petal curls in over its length
    openAngle: 0.55, // radians an open petal leans at
    openCurl: -0.85, // radians an open petal curls (negative = out and down)
    clench: -0.12, // how far past closed they snap (negative open)
    breath: 0.06, // radians the open petals breathe
    sproutTime: 0.32, // seconds the bud takes to burst out of the floor
    openTime: 0.5, // seconds it takes to open
    pullTime: 1.25, // seconds it stays open, pulling
    closeTime: 0.16, // seconds it takes to snap shut
    holdClosed: 0.25, // seconds it stands shut
    sinkTime: 0.5, // seconds it takes to sink into the floor
    veinCount: 7, // side veins along a petal
    veinGlow: 2.6,
    edgeGlow: 3.2, // the bright rim and tip
    petalRim: 1.2, // fresnel
    pulseSpeed: 1.6, // vein pulses per second, tip → throat
    colorPetal: '#0b0616',
    colorPetalDeep: '#1a0c34',
    colorVein: '#7a4cff',
    colorRim: '#e4d8ff',

    /* ================================================================ */
    /* 3 · THE THROAT                                                    */
    /* ================================================================ */
    throatRadius: 1.35, // metres
    throatArms: 5, // spiral arms
    throatTwist: 1.6, // how tightly they wind
    throatSpin: 0.9, // turns per second
    throatGlow: 3.0,
    swirlStrength: 1.0, // how hard the light turns round it
    colorThroatCore: '#010004',

    /* ================================================================ */
    /* 4 · THE VEINS ON THE FLOOR                                        */
    /* ================================================================ */
    groundVeinGlow: 2.2,
    stainOpacity: 0.55,
    colorStain: '#06030c',

    /* ================================================================ */
    /* 5 · MOTES & SMOKE                                                 */
    /* ================================================================ */
    moteRate: 320, // per second, drawn in to the throat
    moteSize: 0.06,
    moteLife: 1.0,
    moteGlow: 3.2,
    smokeRate: 40, // per second, black smoke curling into the throat
    smokeSize: 0.7,
    smokeLife: 1.2,
    smokeOpacity: 0.5,
    colorMoteA: '#ffffff',
    colorMoteB: '#d4c4ff',
    colorMoteC: '#7a4cff',
    colorMoteD: '#1a0a40',
    colorSmokeA: '#1a1030',
    colorSmokeB: '#100a20',
    colorSmokeC: '#080512',
    colorSmokeD: '#030208',

    /* ================================================================ */
    /* 6 · BURST, SNAP & SINK                                            */
    /* ================================================================ */
    sproutShake: 0.35,
    sproutDebris: 60, // sparks thrown as it bursts out of the floor
    snapFlash: 0.3,
    snapShake: 0.6,
    shakeDuration: 0.4,
    snapLight: 3.0, // × lightIntensity
    snapSparks: 150,
    sparkSpeed: 9,
    sparkSize: 0.04,
    sparkLife: 0.6,
    sparkGravity: 8,
    sparkStretch: 0.22,
    sparkGlow: 3.4,
    shockRadius: 1.4, // × zoneRadius
    burstSize: 0.5, // × zoneRadius
    burstIntensity: 1.1,
    colorFlash: '#a890ff',
    colorBurstA: '#ffffff',
    colorBurstB: '#9a7aff',
    colorBurstC: '#2a1060',
    colorShockA: '#7a52ff',
    colorShockB: '#ece4ff',
    colorSparkA: '#ffffff',
    colorSparkB: '#d8c6ff',
    colorSparkC: '#8a60ff',
    colorSparkD: '#2a1060',

    /* ================================================================ */
    /* 7 · THE PULL                                                      */
    /* ================================================================ */
    gripImpulse: 2.5, // m/s a standing body is knocked toward the throat
    gripLift: 2.0,
    gripSpin: 1.0,
    pullSpeed: 3.0, // m/s inward
    pullSwirl: 1.6, // rad/s round the throat
    pullLift: 0.6, // m/s held up as it is dragged
    gripGrab: 6, // 1/s how hard it is held
    swallowSpeed: 2.5, // m/s down the throat
    consumeDepth: 1.2 // metres under the floor at which a body is gone
  }
};
