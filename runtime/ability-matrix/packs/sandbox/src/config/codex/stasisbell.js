/**
 * Stasis Bell — Time — a clockwork brass bell turns itself into being over the
 * circle, a fence of tuning tines rises round the rim, and each toll strings
 * the tines with standing waves that hold everything inside still. The last
 * toll snaps the strings and lets time go.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `StasisBellAbility`: the bell
 * is a unit lathe scaled live, its vibration is a vertex-stage mode shape, and
 * the strings between the tines are placed in their shader from uniforms.
 */
export default {
  id: 'stasisbell',
  meta: {
    label: 'Stasis Bell',
    accent: '#fff0cc',
    key: '',
    element: 'time',
    hint: 'Time — a brass bell tolls over the circle; tines round the rim ring with it and hold everything inside still',
    cast: 'zone',
    glyph: `<path d="M34 64C34 40 38 26 50 26C62 26 66 40 66 64Z"/><path d="M28 66H72"/><circle cx="50" cy="72" r="4"/><path d="M50 18V26"/><path d="M14 80V62M20 80V62M80 80V62M86 80V62"/><path d="M20 70C34 74 66 74 80 70" stroke-dasharray="3 3"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 20, // metres/second the resonance band runs out to the circle
    lifetime: 1.1, // seconds the bell takes to unmake itself after the release
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.4, // the circle the bell holds, metres

    /* --- light --- */
    lightColor: '#ffe2a6',
    lightIntensity: 7, // hangs in the bell's mouth
    lightRadius: 11,
    lightFlicker: 0.1,

    /* ================================================================ */
    /* 1 · THE BELL — shape and how it hangs                             */
    /* ================================================================ */
    hangHeight: 6.4, // metres the crown hangs above the floor
    bellHeight: 2.3, // crown to lip, metres
    bellRadius: 1.35, // radius at the lip, metres
    formTime: 0.55, // seconds the bell takes to turn itself into being
    formEdge: 0.06, // the glowing edge of the turning, share of a turn
    clapperSize: 0.26, // radius of the clapper's ball, metres
    gearSize: 1.0, // the escapement wheel round the shoulder, × the shoulder
    gearTickRate: 4, // teeth/second it steps round while it holds

    /* ================================================================ */
    /* 2 · THE BELL — brass                                              */
    /* ================================================================ */
    brassEnv: 1.2, // reflection of the sky
    brassSpecular: 2.4,
    brassGloss: 55,
    engrave: 0.55, // the inscription bands round the waist and sound-bow
    patina: 0.35, // verdigris in the crevices
    rimGlow: 0.6, // a warm fresnel so it never goes black against the night
    tollGlow: 3.2, // the lip blazes when it is struck
    colorBrass: '#d6a046',
    colorBrassDark: '#6a4a1c',
    colorPatina: '#4f7a62',
    colorGlow: '#ffdc8a',
    colorForm: '#fff2c4',

    /* ================================================================ */
    /* 3 · THE TOLL                                                      */
    /* ================================================================ */
    tolls: 3, // tolls that hold — the release is one more
    tollInterval: 0.62, // seconds between tolls
    swing: 0.32, // radians the bell swings to strike
    finalSwing: 0.55, // radians on the last, releasing toll
    ringAmp: 0.06, // how far the rim flexes when struck, × the radius
    ringFreq: 26, // the flex's wobble, radians/second
    ringDecay: 0.45, // seconds the flex rings for

    /* ================================================================ */
    /* 4 · SOUND — the fronts each toll sends down to the rim            */
    /* ================================================================ */
    frontTime: 0.42, // seconds a front takes to reach the tines
    frontWidth: 0.55, // its band, metres
    frontGlow: 2.6,
    frontOpacity: 0.55,
    frontRipples: 5, // ripples across the band
    colorFrontA: '#fff6dc',
    colorFrontB: '#ffbe5a',

    /* ================================================================ */
    /* 5 · THE TINES — the fence round the rim                           */
    /* ================================================================ */
    tines: 14, // tuning tines round the rim (up to 20)
    tineHeight: 2.4, // metres
    tineWidth: 0.26, // gap between the prongs, metres
    tineThickness: 0.045, // prong radius, metres
    riseTime: 0.45, // seconds they take to rise out of the floor
    riseStagger: 0.3, // seconds from the first to the last
    tineQuiver: 0.05, // how hard they shiver when a front reaches them (radians)
    tineGlow: 2.2, // they flare when a front arrives

    /* ================================================================ */
    /* 6 · THE STRINGS — standing waves between the tines                */
    /* ================================================================ */
    strings: 3, // rows of strings, low to high (up to 3)
    stringLow: 0.6, // height of the lowest row, × tine height
    stringHigh: 0.95, // height of the highest row
    stringAmp: 0.14, // how far they swing, metres
    stringFreq: 18, // radians/second
    stringModes: 2, // antinodes along each string
    stringWidth: 0.035, // metres
    stringGlow: 3.4,
    stringSnap: 0.28, // seconds a string takes to snap and recoil on the release
    colorStringA: '#fffbe8',
    colorStringB: '#ffc65e',

    /* ================================================================ */
    /* 7 · THE FLOOR                                                     */
    /* ================================================================ */
    bandWidth: 0.42, // the brass resonance band round the rim, metres
    bandGlow: 1.6,
    waveScale: 3.2, // standing-wave rings per metre inside the circle
    waveGlow: 1.2,
    floorOpacity: 0.85,
    colorBand: '#d6a046',
    colorWave: '#ffcf7a',
    colorHeld: '#ffe6a8',

    /* ================================================================ */
    /* 8 · MOTES, SPARKS, DUST                                           */
    /* ================================================================ */
    moteCount: 70, // motes hung in the air on each toll — they stop dead
    moteSize: 0.06,
    moteLife: 2.6,
    moteGlow: 2.4,
    colorMoteA: '#fff8e0',
    colorMoteB: '#ffe2a0',
    colorMoteC: '#ffb860',
    colorMoteD: '#6a4020',
    sparkCount: 10, // sparks off each tine when a front reaches it
    sparkSpeed: 5,
    sparkSize: 0.025,
    sparkLife: 0.4,
    sparkGlow: 3,
    colorSparkA: '#ffffff',
    colorSparkB: '#ffe6a8',
    colorSparkC: '#ffa23c',
    colorSparkD: '#4a2008',
    dustCount: 36, // dust blown off the floor by the release
    dustSize: 0.8,
    dustLife: 1.5,
    dustOpacity: 0.45,
    colorDustA: '#e2d2b4',
    colorDustB: '#b09a7c',
    colorDustC: '#74624e',
    colorDustD: '#3a3026',

    /* ================================================================ */
    /* 9 · THE BEAT                                                      */
    /* ================================================================ */
    tollWarp: 0.8, // each toll's ring bends the air
    tollShake: 0.18,
    tollLight: 1.4, // light punch per toll, × intensity
    releaseShake: 0.7,
    releaseFlash: 0.35,
    releaseLight: 3.5,
    burstSize: 5, // the pressure shell on the release
    burstIntensity: 1,
    shockRadius: 8,
    colorBurstA: '#fff6dc',
    colorBurstB: '#ffcf7a',
    colorBurstC: '#8a5a1c',
    colorShock: '#ffd890',
    colorFlash: '#fff0c8',

    /* ================================================================ */
    /* 10 · THE HOLD                                                     */
    /* ================================================================ */
    holdStrength: 1, // 1 stops a held body dead, less only slows it
    holdTint: 0.75, // how far held bodies are stained brass
    colorHeldBody: '#c89a52',
    colorHeldRim: '#ffe2a0',
    releaseImpulse: 6, // thrown out from the centre when time comes back (m/s)
    releaseLift: 3.5,
    releaseSpin: 2
  }
};
