/**
 * Rewind Snare — Time — a strip of amber film unreels to the circle and
 * unspools across it in a spiral; then the reel runs backward, the film winds
 * itself back in — dragging everything on it to the centre — and locks round
 * them there as a cinched cocoon of film.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `RewindSnareAbility`: the
 * film is one strip placed entirely in its vertex stage — along the line, out
 * round the spiral, up into the coil — from how much has been unspooled and
 * how much has been wound back, so every slider moves a cast in progress.
 */
export default {
  id: 'rewindsnare',
  meta: {
    label: 'Rewind Snare',
    accent: '#ffd98a',
    key: '',
    element: 'time',
    hint: 'Time — film unspools across the circle, then rewinds, dragging all of it back to the centre and locking it in a cocoon of film',
    cast: 'zone',
    glyph: `<path d="M50 50m-4 0a4 4 0 1 0 8 0a8 8 0 1 0 -16 0a12 12 0 1 0 24 0a16 16 0 1 0 -32 0a20 20 0 1 0 40 0a24 24 0 1 0 -48 0"/><path d="M84 30L76 38L86 42"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // metres/second the film unreels along the line to the circle
    lifetime: 1.3, // seconds the cocoon takes to burn away after it has held
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.6, // the circle the film covers, metres

    /* --- light --- */
    lightColor: '#ffd08a',
    lightIntensity: 7,
    lightRadius: 10,
    lightFlicker: 0.35, // projector flicker

    /* ================================================================ */
    /* 1 · THE FILM — the strip itself                                   */
    /* ================================================================ */
    filmWidth: 0.5, // metres edge to edge
    frameLength: 0.42, // metres per frame
    sprocketSize: 0.07, // the perforations along both edges, metres
    filmGlow: 2.2, // the exposed frames' light
    edgeGlow: 3.2, // the hot amber edges
    filmOpacity: 0.88,
    imageScale: 2.2, // detail of the ghost images in the frames
    flicker: 0.35, // 0..1 frames strobing as it runs
    colorFilm: '#ffb347',
    colorFilmDark: '#3a1c08',
    colorImage: '#fff1c8',
    colorEdge: '#ffd98a',

    /* ================================================================ */
    /* 2 · THE SPIRAL                                                    */
    /* ================================================================ */
    pitch: 1.0, // metres between turns of the spiral
    innerRadius: 1.25, // the spiral starts this far out (where the coil stands)
    lift: 0.05, // metres the film lies above the floor
    flutter: 0.06, // metres it ripples while it runs
    unspoolTime: 0.75, // seconds the spiral takes to unspool out to the rim
    spinForward: 0.6, // radians/second the spiral turns while it plays
    holdTime: 0.3, // seconds it lies still before the rewind

    /* ================================================================ */
    /* 3 · THE REWIND                                                    */
    /* ================================================================ */
    rewindTime: 1.15, // seconds to wind all of it back in
    rewindCurve: 1.8, // >1: starts slow and whirs faster
    spinBack: 5.5, // radians/second the reel spins backward at full whir
    pullStiffness: 0.32, // how hard bodies are dragged in (0..1)

    /* ================================================================ */
    /* 4 · THE COCOON — the snare                                        */
    /* ================================================================ */
    coilHeight: 2.5, // metres the wound film stands at the centre
    coilRadius: 1.25, // metres, before it cinches
    cinchRadius: 0.62, // metres, after it cinches
    cinchTime: 0.22, // seconds the cinch takes
    cinchOvershoot: 0.25,
    lockHold: 0.9, // seconds it holds them, locked, before it burns away
    claspWidth: 0.16, // the lock rings, metres
    claspGlow: 5,
    colorClasp: '#fff2c8',

    /* ================================================================ */
    /* 5 · THE FLOOR                                                     */
    /* ================================================================ */
    rimWidth: 0.08, // the perforated rim of the circle, metres
    rimGlow: 1.8,
    chevrons: 9, // inward chevrons that run during the rewind
    chevronGlow: 2.4,
    floorOpacity: 0.8,
    colorRim: '#ffc66a',
    colorChevron: '#ffe0a0',

    /* ================================================================ */
    /* 6 · PARTICLES                                                     */
    /* ================================================================ */
    moteRate: 120, // amber motes/second off the running film
    moteSize: 0.06,
    moteLife: 0.9,
    moteGlow: 2.4,
    colorMoteA: '#fff6dc',
    colorMoteB: '#ffd27a',
    colorMoteC: '#ff9a30',
    colorMoteD: '#4a2008',
    streakRate: 160, // rewind streaks/second, racing inward
    streakSpeed: 9,
    streakSize: 0.03,
    streakLife: 0.4,
    streakGlow: 3,
    colorStreakA: '#ffffff',
    colorStreakB: '#ffe6a8',
    colorStreakC: '#ffa23c',
    colorStreakD: '#4a2008',
    flakeCount: 160, // burnt film flakes as the cocoon burns away
    flakeSize: 0.12,
    flakeLife: 1.6,
    flakeGlow: 1.6,
    colorFlakeA: '#ffe2a0',
    colorFlakeB: '#ff9a30',
    colorFlakeC: '#5a2a0c',
    colorFlakeD: '#1a0c04',

    /* ================================================================ */
    /* 7 · THE LOCK                                                      */
    /* ================================================================ */
    rewindWarp: 0.6, // the air wrung round as it rewinds
    lockWarp: 1.2, // the implosion ring as it locks
    lockSparks: 140,
    lockShake: 0.6,
    lockFlash: 0.35,
    lockLight: 3.5,
    burstSize: 2.4,
    burstIntensity: 1,
    shockRadius: 5.5,
    rewindRumble: 0.12,
    colorBurstA: '#fff6dc',
    colorBurstB: '#ffcf7a',
    colorBurstC: '#8a4a14',
    colorShock: '#ffd890',
    colorFlash: '#fff0c8',

    /* ================================================================ */
    /* 8 · THE SNARE                                                     */
    /* ================================================================ */
    tripImpulse: 1.5, // the rewind takes their feet first (m/s)
    tripLift: 1.2,
    holdHeight: 0.9, // metres up the cocoon they are bound at
    markGlow: 0.5, // bodies on the film are stained amber
    colorMark: '#ffb347',
    releaseImpulse: 3, // dropped out of the cocoon as it burns
    releaseLift: 2
  }
};
