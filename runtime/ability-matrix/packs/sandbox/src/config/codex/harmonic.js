/**
 * Harmonic Reed — Wind — a stand of reeds made of air sprouts in the circle and rings a chord.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `HarmonicReedAbility`, so
 * dragging any of it re-shapes a stand that is already ringing — the reeds'
 * heights and harmonics, the sound shells they shed, the interference on the
 * floor.
 */
export default {
  id: 'harmonic',
  meta: {
    label: 'Harmonic Reed',
    accent: '#e7fff8',
    key: '',
    element: 'sound',
    hint: 'Wind — reeds of streaming air sprout in a spiral and ring, shedding rings of sound until the chord lifts everything in the circle',
    cast: 'zone',
    glyph: `<path d="M30 86V40M42 86V22M54 86V30M66 86V48"/><path d="M22 40H38M34 22H50M46 30H62M58 48H74"/><path d="M14 86H86"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // how fast the sprouting hum races to the circle, metres/second
    lifetime: 1.4, // seconds the stand rings after the chord
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.2, // the circle the reeds stand in, metres

    /* --- light --- */
    lightColor: '#bdf8ea',
    lightIntensity: 9, // the stand's glow
    lightRadius: 10,
    lightHeight: 2.2, // metres over the heart once the reeds stand
    lightFlicker: 0.3, // 0..1 how much it throbs with the chord
    impactLight: 24, // light punch on the chord

    /* ================================================================ */
    /* 0 · THE HUM (travel)                                              */
    /* ================================================================ */
    sproutHeight: 1.0, // metres, the little reed that skims the line
    sproutRadius: 0.1, // metres
    travelRippleSpacing: 1.4, // metres between ripples it leaves on the floor
    travelRippleRadius: 0.9, // metres
    travelMotes: 80, // motes / second shed by it

    /* ================================================================ */
    /* 1 · THE STAND — shape                                             */
    /* ================================================================ */
    reedCount: 15, // reeds in the stand (≤ 16)
    reedSpread: 0.85, // share of the circle the stand fills
    heightCentre: 4.6, // metres, the reeds at the heart
    heightRim: 1.5, // metres, the reeds at the edge
    heightJitter: 0.15, // ± share of a reed's height
    radiusMin: 0.1, // metres, the thinnest reed
    radiusMax: 0.2, // metres, the thickest (the tallest)
    harmonicMin: 2, // node bands on the shortest reed
    harmonicMax: 6, // node bands on the tallest
    swayAmp: 0.18, // how far the reeds sway
    swayRate: 1.3, // sways / second

    /* --- timing --- */
    sproutDelay: 0.05, // seconds after landing the first reed sprouts
    sproutSpread: 0.6, // seconds for the spiral to sprout heart → rim
    growTime: 0.35, // seconds one reed takes to grow
    growOvershoot: 0.35, // how far past full height it springs
    chordTime: 1.05, // seconds after landing the chord sounds
    unravelSpread: 0.5, // seconds over which the stand unravels, rim first
    unravelTime: 0.5, // seconds one reed takes to unravel
    groundFade: 0.5, // seconds the floor pattern takes to erode

    /* ================================================================ */
    /* 2 · THE STAND — look                                              */
    /* ================================================================ */
    flowSpeed: 2.5, // metres/second the air streams up a reed
    flowScale: 3.0, // flow features per metre
    rimGlow: 2.2, // the tube's walls
    coreGlow: 0.3, // its body
    nodeGlow: 3.0, // the harmonic's node bands
    nodeWidth: 0.06, // share of the gap between nodes
    lipGlow: 3.0, // the glowing lip at the top
    idleRing: 0.35, // how hard a reed rings on its own
    ringPulse: 1.6, // how hard it rings as it sheds a shell
    chordRing: 2.5, // how hard every reed rings on the chord
    unravelEdge: 0.06, // width of the bright fraying edge
    reedOpacity: 1.0,
    softFade: 0.3, // metres of soft fade where it meets geometry
    colorReedA: '#ffffff', // streaks, nodes, lips
    colorReedB: '#9ff5e4', // low reeds
    colorReedC: '#5cc6dc', // middle
    colorReedD: '#9a86ff', // high reeds
    lensWarp: 0.9, // how hard a reed bends the world (distortion)
    lensScale: 1.8, // the lens is this much fatter than the reed

    /* ================================================================ */
    /* 3 · SOUND SHELLS                                                  */
    /* ================================================================ */
    shellRate: 1.6, // shells / second each reed sheds
    shellSize: 1.8, // metres, radius a shell opens to
    shellLife: 0.9, // seconds
    shellWidth: 0.07, // rim sharpness
    shellFringes: 3, // fringes inside the rim
    shellGlow: 2.2,
    chordShellSize: 6.5, // metres, the big ring the chord throws

    /* ================================================================ */
    /* 4 · THE INTERFERENCE FLOOR                                        */
    /* ================================================================ */
    rippleWavelength: 0.9, // metres
    rippleSpeed: 6, // radians/second the ripples run out
    rippleGlow: 1.4,
    rippleDark: 0.5, // how much the troughs darken the floor
    colorGroundA: '#c9fff3',
    colorGroundB: '#081416',

    /* ================================================================ */
    /* 5 · PARTICLES                                                     */
    /* ================================================================ */
    moteRate: 120, // motes / second streaming up the reeds
    moteSize: 0.05,
    moteSpeed: 3,
    moteLife: 0.8,
    colorMoteA: '#ffffff',
    colorMoteB: '#cffff4',
    colorMoteC: '#7fdcea',
    colorMoteD: '#7a6cff',
    dustCount: 6, // dust puffs per reed sprouting
    dustSize: 0.5,
    dustLife: 1.1,
    dustOpacity: 0.4,
    colorDustA: '#cbd8d4',
    colorDustB: '#97aaa6',
    colorDustC: '#5f706e',
    colorDustD: '#2c3637',
    leafCount: 40, // reed fluff thrown up on the chord
    leafSize: 0.12,
    leafSpeed: 5,
    leafLife: 1.6,
    colorLeafA: '#f2fff9',
    colorLeafB: '#bfeedd',
    colorLeafC: '#7fbfae',
    colorLeafD: '#3f6f66',

    /* ================================================================ */
    /* 6 · THE CHORD                                                     */
    /* ================================================================ */
    sproutShake: 0.06, // knock per reed sprouting
    chordShake: 0.45,
    chordFlash: 0.35,
    colorFlash: '#e2fff8',
    burstRadius: 4.5, // AIR shell on the chord, metres
    burstLife: 0.6,
    colorBurstA: '#ffffff',
    colorBurstB: '#9ff5e4',
    colorBurstC: '#9a86ff',
    shockRadius: 7, // metres
    shockLife: 0.7,
    colorShockA: '#bdf8ea',
    colorShockB: '#ffffff',

    /* ================================================================ */
    /* 7 · BODIES                                                        */
    /* ================================================================ */
    hitLift: 11, // the chord lifts everything in the circle
    hitImpulse: 2.5, // outward
    hitSpin: 3
  }
};
