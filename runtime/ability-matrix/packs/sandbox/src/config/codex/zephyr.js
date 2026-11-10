/**
 * Zephyr Shuriken — Wind — three discs of compressed air braid down the line.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so `settings.js`
 * can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `ZephyrShurikenAbility`, so
 * dragging any of it in the editor re-shapes discs already in flight.
 */
export default {
  id: 'zephyr',
  meta: {
    label: "Zephyr Shuriken",
    accent: '#d9fff2',
    key: '',
    element: 'wind',
    hint: "Wind — three spinning discs of air braid down the line, cut what they cross, and burst into a cyclone",
    cast: 'line',
    glyph: `<path d="M50 50L50 14C62 26 62 40 50 50Z"/><path d="M50 50L86 50C74 62 60 62 50 50Z"/><path d="M50 50L50 86C38 74 38 60 50 50Z"/><path d="M50 50L14 50C26 38 40 38 50 50Z"/><circle cx="50" cy="50" r="6"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 20, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 24, // how fast the discs fly the line, metres/second
    lifetime: 1.3, // seconds the scuffs, eye and dust linger after the cyclone has gone
    cooldown: 0.5, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#d9fff2',
    lightIntensity: 6, // the discs' steady glow
    lightRadius: 8,
    lightFlicker: 0.35, // 0..1 how much it gusts

    /* ================================================================ */
    /* 1 · THE DISCS                                                     */
    /* ================================================================ */

    /* --- flight (metres unless noted) --- */
    discRadius: 1.15, // radius of each shuriken, tip to centre
    flightHeight: 1.2, // height the braid is centred on — waist height cuts a body
    launchHeight: 1.35, // height they leave the hand at
    launchDrop: 1.2, // metres over which they settle from the hand to the braid
    braidWidth: 1.45, // how far either side of the line the discs swing
    braidLift: 0.35, // how far above/below the centre height they pass
    braidPitch: 4.2, // metres for one full turn of the braid
    spreadIn: 2.2, // metres after the hand before they reach full swing
    convergeLength: 3.2, // metres before the end over which they close in
    stagger: 0.25, // metres each disc trails the one before
    bank: 0.55, // how hard they lean into the braid
    faceTilt: 0.55, // radians each disc is tipped back toward the thrower, so it shows its face
    wobble: 0.08, // radians they rock in flight
    wobbleSpeed: 11,
    spinSpeed: 34, // radians/second each disc spins
    formTime: 0.12, // seconds a disc takes to snap open off the hand

    /* --- silhouette --- */
    blades: 4, // blades per disc (2..8)
    bladeWidth: 0.42, // angular width of a blade at the hub, × the gap between blades
    bladeTaper: 1.4, // how sharply a blade narrows to its tip
    bladeCurve: 1.8, // how far each blade sweeps back (radians at the tip)
    hubRadius: 0.24, // the solid hub, × the disc
    holeRadius: 0.09, // the hole through it, × the disc

    /* --- shading --- */
    edgeWidth: 0.05, // width of the bright cutting edge, × the disc
    edgeGlow: 1.8, // brightness of the cutting edge (bloom > 1)
    bodyOpacity: 0.2, // the translucent blade body (additive)
    blurAmount: 0.28, // the faint full disc of the spin blur
    swirlLines: 6, // wind lines streaming round each disc
    swirlGlow: 0.5,
    fringe: 0.7, // chromatic fringe trailing the edges
    fringeSpread: 0.11, // radians between the three fringe bands
    rimGlow: 1.1, // extra glow when a disc is seen edge-on
    softFade: 0.3,
    colorA: '#b6f7e2', // the blade body (ramp: pale tint)
    colorB: '#ffffff', // the cutting edge
    colorFringeR: '#ff5c8a',
    colorFringeG: '#7affc4',
    colorFringeB: '#5a7cff',
    bodyFill: 0.9, // opacity of the lit, normal-blended blade mass under the bright pass
    bodyBevel: 0.14, // how far in from the edge the bevel catches the light (× disc)
    colorDiscBody: '#3cc39e', // ramp: saturated jade body
    colorDiscDeep: '#0a3530', // ramp: deep

    /* ================================================================ */
    /* 2 · DISTORTION                                                    */
    /* ================================================================ */
    warpStrength: 1.4, // how hard the world bends round each disc
    warpRadius: 1.6, // radius of the lens, × the disc
    warpSwirl: 0.7, // 0 a plain lens .. 1 a twisting vortex
    warpNoise: 0.25,

    /* ================================================================ */
    /* 3 · SPIRAL SCUFFS                                                 */
    /* ================================================================ */
    scuffStart: 0.8, // metres after the hand the floor starts to mark
    scuffLoop: 0.32, // radius of the scuff's loops, metres
    scuffPitch: 0.42, // metres between loops
    scuffWidth: 0.022, // width of the scratched line, metres
    scuffArc: 0.65, // 0..1 how much of each loop is drawn (lower = open spirals)
    scuffDust: 0.3, // half-width of the dust band the disc swept, metres
    scuffOpacity: 0.16,
    scuffDustOpacity: 0.18,
    scuffGlow: 0.7, // how bright the fresh mark glows behind the disc
    scuffGlowLength: 2.2, // metres it cools over behind each disc
    scuffErode: 0.7, // how raggedly it fades
    scuffFurrow: 0.42, // half-width of the filled furrow each strand cuts, metres
    scuffFurrowOpacity: 0.8,
    eyeRadius: 1.15, // the spiral eye the cyclone scours, × its top radius
    eyeArms: 3,
    eyeSpin: 0.25, // how fast the eye turns, × the cyclone's spin
    eyeOpacity: 0.8,
    colorScuffDeep: '#10302b', // furrow + eye (ramp: deep)
    colorScuff: '#e9f2ea',
    colorScuffDust: '#93a39b',
    colorScuffGlow: '#bffff0',

    /* ================================================================ */
    /* 4 · WIND STREAKS                                                  */
    /* ================================================================ */
    streakRate: 160, // per second, per disc
    streakSize: 0.03,
    streakFling: 6, // m/s flung off the rim, tangent to the spin
    streakTrail: 0.55, // × the disc's own speed they keep
    streakStretch: 0.3,
    streakLifetime: 0.28,
    streakGlow: 2.2,
    colorStreakA: '#ffffff',
    colorStreakB: '#e2fff6',
    colorStreakC: '#a6f0dc',
    colorStreakD: '#1f6b5c',

    /* ================================================================ */
    /* 5 · LEAVES + DUST                                                 */
    /* ================================================================ */
    leafRate: 26, // leaves/second sucked up in each disc's wake
    leafSize: 0.13,
    leafSpeed: 3.4,
    leafLift: 2.4,
    leafSpin: 6, // how fast they tumble
    leafSwirl: 3, // curl about their anchor (rad/s)
    leafLifetime: 1.4,
    colorLeafA: '#cfe07a',
    colorLeafB: '#9cbf4a',
    colorLeafC: '#7c8f36',
    colorLeafD: '#5b5a2a',
    dustRate: 60, // puffs/second kicked off the floor under each disc
    dustSize: 0.32,
    dustSpeed: 2.2,
    dustLifetime: 1.1,
    dustOpacity: 0.38,
    dustSwirl: 2.2,
    colorDustA: '#e2e8df',
    colorDustB: '#a9b6aa',
    colorDustC: '#6a7b70',
    colorDustD: '#22302a',

    /* ================================================================ */
    /* 6 · THE CYCLONE PUFF                                              */
    /* ================================================================ */
    puffTime: 2.2, // seconds the cyclone lives
    mergeTime: 0.18, // 0..1 through the puff the discs take to fold into it
    puffRadius: 0.5, // radius at its base, metres — a narrow foot
    puffTopRadius: 2.3, // radius at its top
    puffHeight: 4.6,
    puffFlare: 1.9, // how late it flares out toward the top
    puffSpin: 9, // radians/second it turns
    puffTwist: 1.4, // twist of its bands, radians per metre up
    puffBands: 5, // wind bands round it
    puffRise: 1.6, // metres it lifts off the floor as it unravels
    puffOpacity: 0.6,
    puffGlow: 1.8,
    puffNoise: 0.6,
    puffFormTime: 0.35, // seconds it takes to stand up (with an overshoot)
    puffUnravelStart: 0.72, // fraction of its life at which it starts to unravel from the foot
    puffLean: 0.16, // metres the top leans per metre of height
    puffPrecess: 1.6, // rad/s the lean swings round the foot — the silhouette never settles
    puffWobble: 0.55, // metres the funnel snakes
    puffSheathOpacity: 0.62, // the lit dust sheath — the cyclone's mass
    puffSheathScale: 1.15, // sheath radius × the core
    puffFresnel: 2.2,
    burstSize: 3.6, // the AIR pressure shell, metres
    burstIntensity: 1.1,
    shockRadius: 5,
    puffLeaves: 80, // leaves thrown up the funnel
    puffDust: 70,
    puffStreaks: 80,
    impactShake: 0.3,
    shakeDuration: 0.4,
    impactFlash: 0.16,
    impactLight: 1.3, // light punch, × lightIntensity
    travelRumble: 0.08,
    castGust: 14, // puffs off the caster's feet as they are thrown
    colorPuffA: '#ffffff',
    colorPuffB: '#c9fff0',
    colorPuffC: '#3aa88c',
    colorPuffTint: '#d6fff2', // sheath: lit (ramp: pale tint)
    colorPuffBody: '#3d8f7b', // sheath: body
    colorPuffDeep: '#0a2b26', // sheath: deep
    colorShockA: '#d9fff2',
    colorShockB: '#ffffff',
    colorRingA: '#7a7366',
    colorRingB: '#c7c0b2',
    colorFlash: '#e6fff8',

    /* ================================================================ */
    /* 7 · THE SLICE + THE SPIN                                          */
    /* ================================================================ */
    sliceReach: 0.25, // extra metres past the rim that still cut
    sliceImpulse: 6.5, // m/s the halves leave along the disc's flight
    sliceLift: 2.2,
    sliceSpin: 1.8, // tumble
    spinSpeed2: 7, // m/s round the cut point the halves are whirled
    spinTime: 0.45, // seconds the vortex keeps hold of them
    spinGrab: 6, // how hard it holds them, per second
    puffPull: 5, // m/s the cyclone whirls bodies round it
    puffLift: 3, // m/s it lifts them
    hitDust: 20 // puffs where a body is cut
  }
};
