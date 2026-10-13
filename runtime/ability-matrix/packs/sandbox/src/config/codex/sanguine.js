/**
 * Sanguine Tide — Blood — a glossy crimson wave that wells up at the feet,
 * rolls down the line carrying what it catches, and breaks over its catch.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so `settings.js`
 * can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `SanguineTideAbility`, so
 * dragging the wave's height or the smear's drying time in the editor reshapes
 * a cast that is already rolling.
 */
export default {
  id: 'sanguine',
  meta: {
    label: "Sanguine Tide",
    accent: '#ff2e4d',
    key: '',
    element: 'blood',
    hint: "Blood — a crimson wave wells up, rolls down the line carrying its catch, and breaks over it",
    cast: 'line',
    glyph: `<path d="M8 74C22 74 26 40 46 30C62 22 80 30 84 46C76 38 62 38 56 48C50 58 60 66 70 62C64 74 46 76 8 74Z"/><path d="M10 86C30 82 58 90 92 84"/><path d="M80 22C82 16 86 14 88 18C88 22 84 24 80 22Z"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 20, // maximum cast distance, metres
    minRange: 3, // closer than this and the cast is refused
    speed: 12, // how fast the crest rolls down the line, metres/second
    lifetime: 3.4, // seconds the smear lingers (dries, cracks, drains) after the break
    cooldown: 0.8, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#ff2e4d',
    lightIntensity: 6, // the wave's own red glow, riding the crest
    lightRadius: 8,
    lightFlicker: 0.2, // 0..1 how much it pulses, like a heartbeat under the surface
    lightHeight: 0.6, // × wave height the light rides at

    /* ================================================================ */
    /* 0 · THE WELL-UP — anticipation at the caster's feet               */
    /* ================================================================ */
    wellTime: 0.38, // seconds the blood pools and climbs before the wave sets off
    wellOffset: 0.9, // metres ahead of the feet the crest is born
    poolRadius: 1.5, // metres the pool at the feet spreads to
    wellBubbles: 70, // droplets that bubble up out of the pool as it climbs
    wellRipple: 0.9, // strength of the ripple ring the pool throws
    riseStart: 0.18, // fraction of full height the wave has when it sets off
    growDistance: 4.5, // metres of travel it takes to reach full height

    /* ================================================================ */
    /* 1 · THE WAVE — the hero mesh                                       */
    /* ================================================================ */

    /* --- silhouette (metres unless noted) --- */
    waveHalfWidth: 2.2, // half the wave's width across the line
    waveHeight: 2.0, // crest height at the middle
    waveBack: 2.8, // length of the back slope trailing behind the crest
    waveFace: 1.2, // how far the face reaches ahead of the crest before it curls
    waveShoulder: 2.4, // >1 = a broad flat crest, ~1 = a pointed ridge
    waveTaper: 0.8, // how fast the crest falls off toward the ends
    waveSweep: 0.22, // ends trailing behind the middle, × half-width
    crestJag: 0.14, // uneven crest height across the wave
    crestJagScale: 1.6, // features of that unevenness across the wave
    curlTravel: 0.32, // 0..1 how far the lip has curled while rolling
    curlLead: 0.3, // fraction of the line, before the end, over which it curls fully
    surfaceNoise: 0.08, // metres the surface heaves along its normal
    surfaceScale: 1.2, // heave features per metre
    surfaceFlow: 1.5, // how fast the surface streams up the back and over

    /* --- shading --- */
    gloss: 110, // specular exponent — blood is a mirror when it is fresh
    specular: 1.4, // sun highlight strength
    envReflect: 0.35, // how much sky the surface reflects
    fresnel: 1.1, // reflection at grazing angles
    ripple: 0.2, // fine surface ripple bent into the normal
    rippleScale: 5, // ripple features per metre
    sss: 1.3, // light glowing through the thin curling lip
    troughDark: 0.8, // how much darker the trough and back slope are than the crest
    froth: 0.6, // the pink froth along the crest
    frothScale: 7, // bubble cells per metre
    frothWidth: 0.05, // width of the froth band, fraction of the profile
    edgeSoft: 0.22, // softness of the wave's two ends
    softFade: 0.3, // soft intersection with the floor, metres
    opacity: 1, // overall opacity of the wave
    colorBlood: '#7a0712', // the body of the wave
    colorDeep: '#2a0207', // the trough
    colorLip: '#ff2e4d', // light through the lip
    colorFroth: '#ff9fb2', // crest froth
    colorSpec: '#ffe6e2', // the highlight

    /* ================================================================ */
    /* 2 · DISTORTION                                                    */
    /* ================================================================ */
    warpStrength: 0.55, // how hard the world bends through the wave's skin
    warpPad: 0.22, // metres the lens stands off the surface
    warpScale: 1.8, // noise features per metre
    warpSpeed: 2.2, // noise speed

    /* ================================================================ */
    /* 3 · THE SMEAR — the ground mesh the wave paints                   */
    /* ================================================================ */
    smearWidth: 1.6, // half-width of the smear, metres
    smearEdgeNoise: 0.32, // how ragged its edges are, × width
    smearEdgeScale: 0.45, // features of that raggedness per metre
    smearStreaks: 1.0, // drag streaks along the direction of travel
    smearStreakScale: 8, // streaks across, per metre
    splatter: 1.0, // beads thrown just past the edges
    splatterScale: 2.6, // bead cells per metre
    smearGloss: 140, // specular exponent of the wet smear
    smearSpecular: 1.3,
    smearEnv: 0.55, // sky in the wet smear
    smearBump: 1.0, // how much the streaks and meniscus bend the light
    dryDelay: 0.5, // seconds after the wave passes before the smear starts to dry
    dryTime: 2.2, // seconds it takes to dry to a matte crust
    crackStart: 0.45, // 0..1 dryness at which cracks open
    crackScale: 2.4, // crack cells per metre
    crackWidth: 0.07, // width of the cracks, × a cell
    drainShare: 0.42, // last share of the linger in which the blood drains into the floor
    drainEdge: 0.6, // dark tide line left at the receding edge
    colorSmearWet: '#62060f', // fresh, thin blood
    colorSmearDeep: '#1e0204', // thick blood in the middle
    colorSmearDry: '#2e0b0a', // dried crust
    colorCrack: '#070101', // the cracks

    /* ================================================================ */
    /* 4 · DROPLETS — thrown off the crest                               */
    /* ================================================================ */
    dropRate: 240, // beads per second off the crest
    dropSize: 0.085,
    dropSpeed: 5.5, // m/s
    dropLift: 0.7, // upward share of their throw
    dropLifetime: 1.0,
    dropGravity: 11, // m/s² — blood is heavy
    dropDrag: 0.3,
    colorDropA: '#d0142a',
    colorDropB: '#8e0a16',
    colorDropC: '#5a050c',
    colorDropD: '#2a0206',

    /* ================================================================ */
    /* 5 · BLOOD MIST — shed off the crest, lingering                    */
    /* ================================================================ */
    mistRate: 70, // puffs per second
    mistSize: 0.6,
    mistLifetime: 1.7,
    mistOpacity: 0.42,
    mistDrag: 1.4,
    mistRise: 0.4, // m/s upward drift
    mistTurbulence: 1.1,
    colorMistA: '#7a0c18',
    colorMistB: '#4f0710',
    colorMistC: '#2e050a',
    colorMistD: '#120204',

    /* ================================================================ */
    /* 6 · FROTH SPRAY — pink spume off the curling lip                  */
    /* ================================================================ */
    sprayRate: 160, // per second
    spraySize: 0.05,
    spraySpeed: 3.2, // m/s
    sprayLifetime: 0.5,
    sprayGlow: 0.9, // how much it catches the light (additive)
    colorSprayA: '#ffc4cf',
    colorSprayB: '#ff7d94',
    colorSprayC: '#c21a34',
    colorSprayD: '#3a0308',

    /* ================================================================ */
    /* 7 · THE BREAK — the wave crests and slams down                    */
    /* ================================================================ */
    breakTime: 1.0, // seconds the break takes (curl → slam → collapse)
    breakDrift: 1.4, // metres the wave rolls on past the target while breaking
    slamAt: 0.4, // 0..1 through the break when the lip hits the floor
    slamReach: 1.3, // metres ahead of the crest the lip lands
    crownRadius: 1.3, // metres — the ring of blood the slam throws up
    crownSpread: 1.8, // metres the crown widens over its life
    crownFlare: 1.45, // × radius at the crown's lip
    crownHeight: 1.5, // metres it climbs
    crownSpikes: 15, // fingers round the rim
    crownSpikeLength: 0.6, // × crown height the fingers reach above the rim
    crownSharp: 2.2, // how narrow the fingers are
    crownTime: 1.1, // seconds the crown stands before it falls back in
    splashRadius: 2.8, // metres the splash pool spreads to
    splashDrops: 280, // droplets in the crown
    splashDropSpeed: 7.5,
    splashMist: 40,
    burstSize: 3.0, // metres — the wet shell of the slam
    burstIntensity: 0.9,
    rippleRadius: 4.5, // metres — the ripple ring
    shockRadius: 6, // metres — the shockwave
    impactShake: 0.6,
    shakeDuration: 0.5,
    impactFlash: 0.3,
    impactLight: 2.2, // light punch, × intensity
    travelRumble: 0.12, // camera rumble while it rolls
    colorBurstA: '#ff4a5e',
    colorBurstB: '#8e0a16',
    colorBurstC: '#2a0206',
    colorRipple: '#9a1020',
    colorRippleHot: '#ff5068',
    colorShock: '#ff2e4d',
    colorShockHot: '#ffd0d6',
    colorFlash: '#ff3048',

    /* ================================================================ */
    /* 8 · THE CATCH — bodies carried in the crest, then slammed         */
    /* ================================================================ */
    catchWidth: 1.0, // × half-width across which the crest catches bodies
    catchAhead: 1.0, // metres ahead of the crest a body is caught
    catchBehind: 1.4, // metres behind it
    catchImpulse: 2.5, // m/s the crest knocks a body forward when it takes it
    catchLift: 4.0, // m/s up
    catchSpin: 0.6, // tumble
    carryHeight: 1.0, // × wave height a carried body rides at
    carryAhead: 0.4, // metres ahead of the crest it rides
    carryMatch: 1.0, // × wave speed it is carried at
    carryPull: 5, // how hard it is pulled onto its riding spot (1/s)
    carryGrab: 7, // how quickly the current takes hold (1/s)
    carryBuoyancy: 0.85, // 0..1 of its weight the blood holds up
    carryCentre: 0.6, // pull toward the middle of the wave (1/s)
    carryRoll: 2.2, // m/s the crest rolls a carried body over itself
    slamDown: 15, // m/s it is thrown down when the wave breaks
    slamForward: 5, // m/s it is thrown on
    slamRadius: 2.4, // metres round the lip's landing a standing body is also struck
    stain: 0.9, // 0..1 how far a carried body is soaked
    stainTime: 0.7, // seconds to soak through
    colorStain: '#3a0208', // the soaked body
    colorStainRim: '#ff2e4d', // its wet rim
    stainRimGlow: 0.7,
    colorStainEdge: '#ff5068', // its burn edge when it finally dissolves
    stainEdgeGlow: 1.4
  }
};
