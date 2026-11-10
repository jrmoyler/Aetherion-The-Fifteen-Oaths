/**
 * Overtone Spiral — Sound, zone cast. A ringing bead of sound flies to the
 * circle; a three-tined tuning fork stands up out of the floor there and is
 * struck three times. Each strike releases a harmonic front that rolls out
 * across the floor and knocks every body it passes — the fundamental first,
 * then the second and third harmonics, each with more lobes and a higher
 * shimmer. A helix of overtones climbs the fork one harmonic per strike, the
 * floor rings into Chladni figures, and notes drift off it.
 *
 * Expansion candidate data block: presentation (`meta`) and the live settings
 * the ability and its editor folder read. Plain data, no imports. Gated by
 * `../status.js` — candidates are never exposed by the production shell.
 *
 * The gameplay keys (`radius`, `pulseInterval`, `waveSpeed`, `impulse`,
 * `lift`) decide who is struck and when; every other key is presentation and
 * is resolved per frame, so it reshapes a fork already ringing.
 */
export default {
  id: 'overtone-spiral',
  meta: {
    label: 'Overtone Spiral',
    accent: '#ecffd5',
    element: 'sound',
    key: '',
    cast: 'zone',
    hint: 'Three expanding harmonic fronts knock enemies away in sequence.',
    glyph: '<circle cx="50" cy="50" r="8"/><circle cx="50" cy="50" r="22"/><circle cx="50" cy="50" r="38"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 1, // closer than this and the cast is refused
    speed: 30, // metres/second the carrier flies
    lifetime: 1, // seconds the fork rings down after the last front (× settings.global.lifetime)
    cooldown: 5, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light (rides the carrier, then the fork) --- */
    lightColor: '#e9ffc4',
    lightIntensity: 4,
    lightRadius: 8,

    /* --- the fronts (gameplay) --- */
    radius: 5, // metres each front rolls out to
    pulseInterval: 0.45, // seconds between the three strikes
    waveSpeed: 8, // metres/second a front travels
    impulse: 3, // outward knockback each front delivers
    lift: 1.4, // upward share of it

    /* --- palette: one tone per harmonic --- */
    toneA: '#a6ff85', // the fundamental
    toneB: '#54ebe6', // the second harmonic
    toneC: '#e6d1ff', // the third harmonic
    resonance: 1, // how hard the fork visibly jumps on each strike

    /* ================================================================ */
    /* 1 · THE CARRIER — the bead of sound in flight                     */
    /* ================================================================ */
    carrierSize: 0.75, // metres — big enough to read at 8 m
    carrierHeight: 1.2, // metres off the floor (hand height, so the wake runs level)
    carrierSpin: 2, // radians/second
    carrierGlow: 1, // emissive gain
    carrierTrail: 60, // motes/second shed behind it

    /* --- the wake: a ribbon of sound from the caster's hand to the fork --- */
    wakeWidth: 0.3, // half-width at the belly, metres
    wakeSwing: 0.35, // standing-wave swing, metres
    wakeWaves: 3, // wavelengths along the wake
    wakeGlow: 1, // emissive gain of its core
    wakeStartHeight: 1.3, // metres — the caster's hand
    wakeStartOffset: 0.5, // metres in front of the caster it starts
    wakeHold: 0.55, // seconds it stays strung to the fork after impact
    wakeReel: 0.35, // seconds it takes to reel into the fork after that

    /* ================================================================ */
    /* 2 · THE RESONATOR — fork and stem                                 */
    /* ================================================================ */
    forkScale: 1.9, // the whole resonator, × — 1.9 stands it ~3 m, over a body
    forkThickness: 2.1, // tine and stem girth, × (on top of forkScale)
    forkHeight: 1, // metres off the floor the tines centre at (× forkScale)
    forkSpread: 0.25, // metres the three tines stand from the axis (× forkScale)
    forkTurn: 0.25, // radians/second the tines slowly turn
    forkBuzz: 0.02, // metres the tines vibrate when struck
    strikeDecay: 0.18, // seconds a strike's jump takes to settle
    resonatorGlow: 1, // nodal-band and rim glow
    metalColor: '#3d5a54', // brushed steel, the lit body tone (deep green-steel)
    metalDeep: '#050f0e', // the steel's deep stop: shadow side and foot
    colorDeep: '#07302b', // the cast's deep stop (wake edges, ring ends, burst shell)

    /* ================================================================ */
    /* 3 · THE FRONTS — the visible pressure ridges                      */
    /* ================================================================ */
    frontWidth: 0.12, // half-width of the ridge, metres
    frontHeight: 0.3, // crest height, metres
    frontLobes: 6, // lobes round the fundamental (+2 per harmonic)
    frontRipple: 0.08, // lobe amplitude, metres
    frontGlow: 1, // emissive gain
    frontFadeOut: 0.65, // how much a front dims by the time it reaches `radius`

    /* ================================================================ */
    /* 4 · THE PLATE — Chladni figures on the floor                      */
    /* ================================================================ */
    plateGlow: 1, // emissive gain
    plateOpacity: 0.5, // strength of the nodal lines
    plateLine: 0.08, // nodal line thickness
    plateSpin: 0.15, // radians/second the figure turns

    /* ================================================================ */
    /* 5 · THE HELIX — the overtone series climbing the fork             */
    /* ================================================================ */
    helixHeight: 1.6, // metres (× forkScale)
    helixRadius: 0.55, // metres at the base (× forkScale)
    helixSpin: 0.6, // radians/second
    helixGlow: 1, // emissive gain

    /* ================================================================ */
    /* 6 · NOTES + PARTICLES                                             */
    /* ================================================================ */
    noteRise: 1.5, // metres a note climbs over its life
    noteSize: 18, // point size (× settings.global.particleSize)
    noteSwirl: 2, // radians a note spirals as it rises
    noteSpeed: 0.4, // note lives per second
    ringBurst: 3, // sound rings thrown off the fork per strike
    ringSize: 0.35, // metres at birth
    ringGrowth: 4, // how much a ring grows over its life
    ringLifetime: 0.6, // seconds
    moteRate: 60, // motes/second shed along the travelling fronts
    moteSize: 0.06, // metres
    moteSpeed: 0.8, // metres/second outward
    moteLifetime: 0.8, // seconds
    colorMoteA: '#f6ffe8', // birth
    colorMoteB: '#b8ff9a', // early
    colorMoteC: '#5fd6cf', // late
    colorMoteD: '#3a2f5c', // death
    dustRate: 30, // dust puffs/second the fronts kick off the floor
    dustSize: 0.35, // metres
    dustLifetime: 1, // seconds
    dustOpacity: 0.25, // dust is subtle: the floor shivering, not a storm
    colorDustA: '#d9dccb',
    colorDustB: '#a8ab98',
    colorDustC: '#7c7f6f',
    colorDustD: '#4b4d43',

    /* ================================================================ */
    /* 7 · THE WARP — rings of bent air riding the fronts                */
    /* ================================================================ */
    warpStrength: 0.6, // refraction (× settings.global.distortion)
    warpWidth: 0.05, // ring width, fraction of `radius`

    /* ================================================================ */
    /* 8 · THE BEATS                                                     */
    /* ================================================================ */
    landShake: 0.06, // trauma as the fork stands up (× explosionIntensity)
    strikeShake: 0.1, // trauma on each strike
    strikeFlash: 0.08, // screen flash on the first strike
    strikeLight: 5, // light punch on each strike
    strikeDecal: 0.6, // shockwave decal per strike, × `radius` (0 = none)
    flashColor: '#efffd8'
  }
};
