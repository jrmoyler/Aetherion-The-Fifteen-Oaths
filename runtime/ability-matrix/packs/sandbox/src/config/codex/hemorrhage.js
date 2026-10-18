/**
 * Hemorrhage Ring — Blood — blood races round the rim of the circle, stands up
 * into a spinning wall and falls inward on everything in it.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 *
 * Every dimension below is resolved per frame by `HemorrhageRingAbility`, so
 * dragging any of it in the editor re-shapes a ring already racing.
 */
export default {
  id: 'hemorrhage',
  meta: {
    label: 'Hemorrhage Ring',
    accent: '#ff4d68',
    key: '',
    element: 'blood',
    hint: 'Blood — a hemorrhage races the rim, stands up into a spinning wall and bursts inward',
    cast: 'zone',
    glyph: `<circle cx="50" cy="54" r="32"/><path d="M82 54C82 40 74 28 62 24"/><circle cx="60" cy="23" r="5"/><path d="M50 30V44M26 54H38M74 54H62M50 78V64"/><path d="M50 54V36"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    zoneRadius: 4.5, // the circle, metres
    speed: 22, // how fast the bead is thrown and first runs the rim, metres/second
    lifetime: 1.8, // seconds the stains take to dry and fade
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#ff3550',
    lightIntensity: 9, // the light rides the racing head, then the centre
    lightRadius: 10,
    lightFlicker: 0.3,

    /* ================================================================ */
    /* 1 · THE THROW                                                     */
    /* ================================================================ */
    handForward: 0.55,
    handSide: 0.2,
    handHeight: 1.3,
    throwArc: 0.6, // metres the bead arcs up on its way to the rim
    circulation: 0, // -1 clockwise, +1 counter-clockwise, 0 a coin toss per cast

    /* ================================================================ */
    /* 2 · THE RACE                                                      */
    /* ================================================================ */
    raceTime: 0.85, // seconds it races the rim after the throw lands
    raceSpeedUp: 2.6, // how much faster it is running by the end, ×
    raceThickness: 0.2, // radius of the rope of blood, metres
    raceSquash: 0.65, // its height, × its radius (it runs in a channel)
    raceLift: 0, // metres off the floor
    headBulb: 1.2, // how much the racing head swells
    raceWobble: 0.18,
    flowSpeed: 16, // how fast the streaks rush round
    streakScale: 1.4,
    raceGlow: 1.6, // streak crests (bloom > 1)
    headGlow: 4,
    headBloomSize: 0.7, // metres
    headBloom: 2,
    headSpray: 260, // droplets per second flung off the head
    raceShake: 0.18, // knock when the bead hits the rim

    /* ================================================================ */
    /* 3 · THE WALL                                                      */
    /* ================================================================ */
    riseTime: 0.3, // seconds the ring takes to stand up into a wall
    wallHeight: 2.3, // metres
    crestTear: 0.6, // how torn the crest is
    crestFoam: 0.8, // pale foam along the crest
    wallStreakScale: 3,
    wallGlow: 2,
    wallOpacity: 0.92,
    crestSpray: 380, // droplets per second off the crest

    /* ================================================================ */
    /* 4 · THE FALL                                                      */
    /* ================================================================ */
    fallTime: 0.45, // seconds the wall takes to fall in to the centre
    wallLean: 1.2, // metres the crest leans inward as it falls
    wallClimb: 1.2, // how much it climbs as the circle narrows
    implodeWarp: 1.4, // how hard the air rushes in with it
    lingerTime: 0.6, // seconds the geyser keeps spouting
    geyserSpeed: 11, // m/s
    geyserRate: 260, // droplets per second
    burstDrops: 280,
    burstSize: 2.4, // metres
    shockRadius: 6,
    burstShake: 0.6,
    shakeDuration: 0.45,
    burstFlash: 0.35,
    burstLight: 3, // × lightIntensity
    colorBurstA: '#ff8a96',
    colorBurstB: '#d01a30',
    colorBurstC: '#4a0410',
    colorShockA: '#ff2a44',
    colorShockB: '#ffc4cc',
    colorFlash: '#ff4058',

    /* ================================================================ */
    /* 5 · CHANNEL & STAINS                                              */
    /* ================================================================ */
    grooveWidth: 0.24, // half-width of the groove cut round the rim, metres
    dragMarks: 18, // smears dragged in toward the centre
    splatRadius: 1.6, // the splat where the wall met itself, metres
    channelGlow: 1.8,
    channelOpacity: 0.95,
    colorGroove: '#120406',
    colorChannelBlood: '#5a0614',
    colorDry: '#2e1410',

    /* ================================================================ */
    /* 6 · BLOOD                                                         */
    /* ================================================================ */
    gloss: 1.5,
    rimGlow: 1.3,
    dropSize: 0.065,
    dropSpeed: 6,
    dropLife: 0.95,
    dropGravity: 13,
    dropStretch: 0.3,
    dropGlow: 1.2,
    sprayStretch: 0.22,
    sprayGlow: 2.6,
    mistSize: 0.6,
    mistLift: 0.8,
    mistLife: 1.6,
    mistOpacity: 0.4,
    colorBloodDeep: '#24020a',
    colorBloodBody: '#9a1222',
    colorBloodHot: '#ff2e46',
    colorBloodRim: '#ff6a78',
    colorFoam: '#ffc0c8',
    colorBloomCore: '#ffdce0',
    colorBloomHalo: '#ff2440',
    colorDropA: '#ff5a6a',
    colorDropB: '#c8142c',
    colorDropC: '#760614',
    colorDropD: '#36020a',
    colorSprayA: '#ffd8dc',
    colorSprayB: '#ff5064',
    colorSprayC: '#c0102a',
    colorSprayD: '#400208',
    colorMistA: '#8a1020',
    colorMistB: '#5e0a16',
    colorMistC: '#3a060e',
    colorMistD: '#1e0306',

    /* ================================================================ */
    /* 7 · HITS                                                          */
    /* ================================================================ */
    rimHitWidth: 1.0, // metres round the racing head that it clips
    rimImpulse: 8, // m/s thrown along the way it runs
    rimLift: 3,
    dragImpulse: 7, // m/s dragged in toward the centre by the falling wall
    dragLift: 2.5,
    burstImpulse: 3, // m/s out from the centre at the burst
    burstLift: 14, // m/s up
    hitSpin: 2,
    bledStain: 0.6,
    bleedTime: 1.5,
    bleedDrops: 35,
    bledRimGlow: 2,
    colorBledBody: '#4a0810',
    colorBledRim: '#ff3048'
  }
};
