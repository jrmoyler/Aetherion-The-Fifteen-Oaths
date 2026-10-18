/**
 * Heartstake — Blood — a barbed stake of coagulated blood with a heart in it,
 * thrown down the line to root in the target and beat.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 *
 * Every dimension below is resolved per frame by `HeartstakeAbility`, so
 * dragging any of it in the editor re-shapes a stake that is already in the
 * air or already beating in the floor.
 */
export default {
  id: 'heartstake',
  meta: {
    label: 'Heartstake',
    accent: '#ff2244',
    key: '',
    element: 'blood',
    hint: 'Blood — a barbed heartstake flies the line, drives into the target and roots there, beating',
    cast: 'line',
    glyph: `<path d="M14 86L70 30"/><path d="M70 30L88 12L80 36Z"/><path d="M52 48L60 40M44 56L52 48"/><path d="M26 66C18 60 20 50 28 52C30 44 40 46 36 56C34 62 28 66 26 66Z"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 32, // flight speed, metres/second
    lifetime: 1.6, // seconds the stake takes to wither once the heart has stopped
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#ff2a3a',
    lightIntensity: 9, // the heart's steady glow (the light rides the heart)
    lightRadius: 10,
    lightFlicker: 0.45, // 0..1 how hard the light thumps with the beat

    /* ================================================================ */
    /* 1 · FORMING & FLIGHT                                              */
    /* ================================================================ */
    handForward: 0.6, // metres in front of the caster the stake forms
    handSide: 0.2, // metres to the right
    handHeight: 1.45, // metres off the floor
    formTime: 0.14, // seconds the blood takes to set into a stake
    gatherDrops: 60, // droplets drawn out of the air into the hand
    gatherRadius: 1.1, // metres they are drawn in from
    flightHeight: 1.3, // metres off the floor it cruises at
    flightArc: 0.35, // metres it arcs up over the flight
    diveDistance: 3.2, // metres before the target it pitches down
    plungeDepth: 0.75, // metres the point drives into the floor
    flightPulse: 2.2, // heartbeats per second while it flies
    plantLean: 0.4, // once rooted it rights itself to stand, point down, leaning this far (0 upright)
    plantTime: 0.2, // seconds it takes to right itself

    /* ================================================================ */
    /* 2 · THE STAKE — shape                                             */
    /* ================================================================ */
    stakeLength: 3.0, // tail to point, metres
    stakeRadius: 0.15, // shaft radius, metres
    taper: 0.85, // how the shaft narrows to its point
    twist: 0.9, // how far the facets twist along it
    heartSize: 2.1, // the heart knot's radius, × the shaft
    heartAt: 0.16, // 0..1 tail → point, where the heart sits
    heartWidth: 0.075, // its half-length, 0..1 of the stake
    throb: 0.45, // how far the heart swells on a beat
    throbDecay: 7, // how fast the swell goes down
    barbRows: 6, // rows of barbs up the shaft
    barbsAround: 3, // barbs in a row
    barbLength: 1.5, // how far a barb juts, × the shaft radius
    finFlare: 1.6, // the three tail fins, × the shaft radius

    /* ================================================================ */
    /* 3 · BLOOD GLASS                                                   */
    /* ================================================================ */
    veinScale: 2.2, // vein features per metre
    veinFlow: 5, // how fast the veins stream toward the point
    veinGlow: 1.4,
    heartGlow: 3.2, // the knot lit from inside (bloom > 1)
    surgeGlow: 4.5, // the beat's surge running up the shaft
    surgeTime: 0.28, // seconds a surge takes knot → point
    rimGlow: 1.6, // fresnel rim
    gloss: 1.4, // specular glint off the facets
    glowSize: 0.8, // radius of the bloom on the heart, metres
    glowStrength: 1.8,
    colorStakeDeep: '#1a0206',
    colorStakeBody: '#7a0a18',
    colorStakeHot: '#ff3b4e',
    colorStakeRim: '#ff4a5e',
    colorGlowCore: '#ffd6dc',
    colorGlowHalo: '#ff1f3a',

    /* ================================================================ */
    /* 4 · THE TRAIL                                                     */
    /* ================================================================ */
    trailLength: 4.5, // metres of blood streaming behind it
    trailWidth: 0.5, // metres across, at the stake
    trailFlow: 9, // how fast the streaks run back
    trailGlow: 2.2, // the hot core of the trail
    trailOpacity: 0.9,
    trailDrops: 140, // droplets per second raining off it
    colorTrailDeep: '#3a0410',
    colorTrailHot: '#ff2d44',

    /* ================================================================ */
    /* 5 · THE HEARTBEATS                                                */
    /* ================================================================ */
    beats: 3, // heartbeats once it has rooted
    beatDelay: 0.22, // seconds from the plunge to the first beat
    beatInterval: 0.42, // seconds between beats
    beatJet: 1.2, // how hard each beat jets blood out of the heart, × drop speed
    beatDrops: 60, // droplets per beat
    seepDrops: 30, // per second seeping down the shaft
    ringTime: 0.42, // seconds a beat's pressure ring takes to run out
    ringWidth: 0.35, // metres
    ringGlow: 2.6,
    beatWarp: 1.1, // how hard each beat bends the air
    beatShake: 0.22, // camera thump per beat
    beatLight: 1.6, // light punch per beat, × lightIntensity

    /* ================================================================ */
    /* 6 · STAIN & ROOTS                                                 */
    /* ================================================================ */
    stainRadius: 1.4, // metres the stain soaks out to by the last beat
    stainFingers: 0.7, // how far its fingers reach, × the radius
    stainFingerFreq: 2.6,
    stainOpacity: 0.95,
    stainGloss: 1.3, // wet glint
    rootCount: 11, // capillaries reaching out of the stain
    rootReach: 4.6, // metres they reach by the last beat
    rootWidth: 0.11, // metres at the stain
    rootWander: 0.3,
    rootGlow: 2.2, // brightness of the capillaries (bloom > 1)
    colorStain: '#2a0208',
    colorStainWet: '#6a0816',
    colorRoots: '#ff2440',
    colorDry: '#2b1410',

    /* ================================================================ */
    /* 7 · BLOOD & FLAKES                                                */
    /* ================================================================ */
    dropSize: 0.06,
    dropSpeed: 5.5, // m/s
    dropLife: 0.9,
    dropGravity: 13, // m/s²
    dropStretch: 0.25,
    dropGlow: 1.2,
    sprayGlow: 2.6,
    mistSize: 0.55,
    mistLift: 0.8, // m/s
    mistLife: 1.6,
    mistOpacity: 0.4,
    flakeRate: 90, // per second off the crumbling stake
    flakeSize: 0.05,
    flakeLife: 1.1,
    flakeGravity: 7,
    colorDropA: '#ff5466',
    colorDropB: '#c4142a',
    colorDropC: '#7a0614',
    colorDropD: '#3a020a',
    colorSprayA: '#ffd0d6',
    colorSprayB: '#ff4a5c',
    colorSprayC: '#c0102a',
    colorSprayD: '#400208',
    colorMistA: '#8a1020',
    colorMistB: '#5e0a16',
    colorMistC: '#3a060e',
    colorMistD: '#1e0306',
    colorFlakeA: '#5a1c16',
    colorFlakeB: '#3e140e',
    colorFlakeC: '#2a0c08',
    colorFlakeD: '#180604',

    /* ================================================================ */
    /* 8 · THE PLUNGE                                                    */
    /* ================================================================ */
    plungeDrops: 160, // the crown of droplets thrown up
    splashSize: 1.4, // the splash dome, metres
    shockRadius: 5, // the shockwave on the floor, metres
    plungeFlash: 0.3,
    plungeShake: 0.5,
    plungeLight: 2.4, // light punch, × lightIntensity
    colorSplashA: '#ff8090',
    colorSplashB: '#d0182e',
    colorSplashC: '#4a0410',
    colorShockA: '#ff3048',
    colorShockB: '#ffc0c8',
    colorFlash: '#ff4058',

    /* ================================================================ */
    /* 9 · HITS                                                          */
    /* ================================================================ */
    hitWidth: 0.9, // metres either side of the flight that it runs through
    pierceImpulse: 11, // m/s a body is thrown forward, along the flight
    pierceLift: 3, // m/s upward
    pierceSpin: 1.6, // tumble
    impactRadius: 2.2, // metres round the plunge that are thrown clear
    plungeImpulse: 12,
    plungeLift: 7,
    beatImpulse: 4, // m/s a beat drags a body toward the heart
    beatLift: 3.5,
    bleedTime: 1.4, // seconds a hit body takes to bleed pale
    bleedPale: 0.85, // 0..1 how pale
    bleedDrops: 40, // drips per second off a bleeding body
    bledRimGlow: 2.2,
    colorBledBody: '#b8a8a4',
    colorBledRim: '#ff2a40'
  }
};
