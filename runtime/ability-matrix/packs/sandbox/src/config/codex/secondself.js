/**
 * Second Self — Time — a translucent golden double of the caster steps out of
 * them and runs the line a heartbeat behind its own footprints.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `SecondSelfAbility`: the
 * figure is posed procedurally each frame and drawn from per-limb capsules, so
 * its proportions, gait, glow and the braid it leaves are all live.
 */
export default {
  id: 'secondself',
  meta: {
    label: 'Second Self',
    accent: '#ffe2a8',
    key: '',
    element: 'time',
    hint: 'Time — a golden second self steps out of you and runs the line a heartbeat behind its own footprints',
    cast: 'line',
    glyph: `<circle cx="38" cy="22" r="7"/><path d="M38 30L34 52L22 70M34 52L46 66M36 36L24 46M36 36L50 42"/><circle cx="62" cy="26" r="7" stroke-dasharray="3 4"/><path d="M62 34L58 56L46 74M58 56L70 70M60 40L48 50M60 40L74 46" stroke-dasharray="3 4"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 10, // metres/second: the heartbeat runs ahead at this, the double follows at it
    lifetime: 1.2, // seconds the footprints and braid take to fade after the finale
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#ffd9a0',
    lightIntensity: 7, // rides the double's chest
    lightRadius: 8,
    lightFlicker: 0.25, // how hard the light beats with the heart

    /* ================================================================ */
    /* 1 · THE BEAT — the heart the double runs on                       */
    /* ================================================================ */
    lag: 0.42, // seconds the double runs behind its own footprints
    bpm: 112, // heartbeats per minute
    beatGlow: 1.6, // how much brighter everything gets on a beat
    dubDelay: 0.2, // seconds between the lub and the dub
    dubShare: 0.6, // how strong the dub is against the lub

    /* ================================================================ */
    /* 2 · THE FIGURE — proportions                                      */
    /* ================================================================ */
    figureHeight: 1.85, // metres, crown to heel
    figureBulk: 1, // × every limb's thickness
    stepOut: 0.35, // metres to the side it steps out of the caster
    emergeTime: 0.3, // seconds it takes to peel out of the caster
    lean: 0.32, // forward lean while running, radians
    stride: 2.3, // metres per full stride (two steps)
    legSwing: 0.85, // thigh swing, radians
    kneeBend: 1.5, // knee bend at the top of the stride, radians
    armSwing: 0.95, // arm swing, radians
    elbowBend: 1.25, // elbow bend, radians
    bob: 0.07, // vertical bounce per step, metres

    /* ================================================================ */
    /* 3 · THE FIGURE — look                                             */
    /* ================================================================ */
    bodyGlow: 1.2, // the light inside it
    rimGlow: 3.4, // the gold rim of its silhouette (bloom > 1)
    rimPower: 2.2, // how thin that rim is
    bandScale: 9, // time-bands running down the body, per metre
    bandSpeed: 2.2, // metres/second the bands fall
    bandGlow: 0.9,
    flicker: 0.25, // 0..1 how unsteady it is
    opacity: 0.85,
    colorCore: '#fff3d6',
    colorBody: '#ffc65c',
    colorRim: '#fff0c0',
    colorDeep: '#a85a14',

    /* ================================================================ */
    /* 4 · AFTERIMAGES — earlier instants of the double                   */
    /* ================================================================ */
    echoes: 3, // how many trail it (0..3)
    echoGap: 0.07, // seconds apart
    echoFade: 0.55, // each is this × as bright as the one before

    /* ================================================================ */
    /* 5 · THE PATH — and the braid it leaves                            */
    /* ================================================================ */
    braidWidth: 0.5, // metres the run weaves either side of the line
    braidPitch: 5.2, // metres per weave
    braidStrands: 2, // ribbons braided round its path (1..2)
    braidRadius: 0.3, // metres the ribbons twist round it
    braidTwist: 0.75, // twists per metre
    braidHeight: 0.95, // metres up the body they twist at
    braidWidthRibbon: 0.05, // ribbon width, metres
    braidLength: 4.5, // metres of braid behind the double
    braidGlow: 2.2,
    colorBraidA: '#fff2c8',
    colorBraidB: '#ff9e3a',

    /* ================================================================ */
    /* 6 · THE FOOTPRINTS — the heartbeat running ahead                  */
    /* ================================================================ */
    footSize: 0.44, // metres heel to toe
    footSide: 0.17, // metres either side of the path
    footGlow: 4.5, // when the heartbeat lays it down
    footStepGlow: 9, // when the double steps on it
    footCool: 0.9, // seconds a print takes to cool to an ember
    threadGlow: 1.6, // the gold thread the heartbeat runs along
    threadWidth: 0.05,
    colorFootHot: '#fff4d2',
    colorFootWarm: '#ffb04a',
    colorFootCold: '#5a2c0c',
    colorThread: '#ffd27a',

    /* ================================================================ */
    /* 7 · PARTICLES                                                     */
    /* ================================================================ */
    moteRate: 90, // gold motes/second shed off the double
    moteSize: 0.06,
    moteLife: 1.1,
    moteSpeed: 0.5,
    moteGlow: 2.6,
    colorMoteA: '#fff6dc',
    colorMoteB: '#ffd88a',
    colorMoteC: '#ff9e40',
    colorMoteD: '#5a3010',
    stepDust: 4, // puffs per footfall
    dustSize: 0.35,
    dustLife: 0.8,
    dustOpacity: 0.35,
    colorDustA: '#e6d6b8',
    colorDustB: '#b8a080',
    colorDustC: '#7a6650',
    colorDustD: '#3a3026',
    ringSize: 0.5, // the heartbeat ring off its chest
    ringLife: 0.45,
    ringGlow: 1.6,
    colorRingA: '#fff6dc',
    colorRingB: '#ffd27a',
    colorRingC: '#ff9a30',
    colorRingD: '#40200a',

    /* ================================================================ */
    /* 8 · THE FINALE — the present catching up                          */
    /* ================================================================ */
    finaleTime: 0.75, // seconds from arriving to gone
    finaleRadius: 4.2, // metres the last heartbeat throws things
    finaleRise: 1.4, // metres it rises as it comes apart
    shockRadius: 6,
    burstSize: 2.8,
    burstIntensity: 1.1,
    finaleSparks: 160,
    sparkSpeed: 8,
    sparkSize: 0.03,
    sparkLife: 0.6,
    sparkGlow: 3,
    colorSparkA: '#ffffff',
    colorSparkB: '#ffe6a8',
    colorSparkC: '#ffa23c',
    colorSparkD: '#4a2008',
    warp: 0.8, // the air round the double bends
    ringWarp: 1.1, // the finale's shock ring
    finaleFlash: 0.35,
    finaleShake: 0.5,
    finaleLight: 3,
    colorBurstA: '#fff6dc',
    colorBurstB: '#ffcf7a',
    colorBurstC: '#a8641c',
    colorShock: '#ffd890',
    colorFlash: '#fff0c8',

    /* ================================================================ */
    /* 9 · THE HIT                                                       */
    /* ================================================================ */
    markGlow: 0.6, // bodies the heartbeat passes are marked gold, a beat early
    colorMark: '#ffcf6a',
    hitRadius: 0.9, // metres either side of the double that it runs through
    hitImpulse: 8,
    hitLift: 3,
    hitSpin: 2.5,
    finaleImpulse: 11,
    finaleLift: 4
  }
};
