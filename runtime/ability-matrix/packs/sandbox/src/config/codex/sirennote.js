/**
 * Siren Note — Wind — one held note drawn down the line as a vibrating sheet of air.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `SirenNoteAbility`, so
 * dragging any of it re-shapes a note already in the air — its width, its
 * wavelength, its pitch, the pattern it is sorting into the dust.
 */
export default {
  id: 'sirennote',
  meta: {
    label: 'Siren Note',
    accent: '#e9fff8',
    key: '',
    element: 'sound',
    hint: 'Wind — a single held note cuts the line as a shivering sheet of air, sorting the dust into nodal lines, and screams apart at the end',
    cast: 'line',
    glyph: `<path d="M10 50C22 34 34 66 46 50C58 34 70 66 82 50"/><path d="M10 38H34M10 62H34"/><path d="M86 30C94 42 94 58 86 70"/><path d="M78 36C84 44 84 56 78 64"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 30, // how fast the note's front runs down the line, metres/second
    lifetime: 0.8, // seconds the sheet takes to shred away after the ring-down
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#5fe8d4',
    lightIntensity: 9, // the note's glow (the light rides the front)
    lightRadius: 10,
    lightFlicker: 0.3, // 0..1 how much the light warbles with the note
    impactLight: 24, // light punch at the scream

    /* ================================================================ */
    /* 0 · THE MOUTH                                                     */
    /* ================================================================ */
    handForward: 0.55, // metres in front of the caster the note leaves from
    handSide: 0.15, // metres to the right
    handHeight: 1.4, // metres off the floor

    /* ================================================================ */
    /* 1 · THE SHEET — shape                                             */
    /* ================================================================ */
    sheetWidth: 2.8, // metres from edge to edge once it has opened (it stands up, so this is its height)
    sheetPinch: 0.12, // metres across at the mouth
    sheetFlare: 3.0, // metres over which it opens out
    sheetHeight: 1.4, // metres off the floor of the sheet's middle line once open (it cuts at chest height)
    sheetBank: 1.0, // radians of roll off flat: ~1.2 stands it up as a curtain whose sideways swing the camera behind can see
    waveAmp: 0.6, // metres of standing-wave amplitude (sideways, once it stands up)
    waveLength: 4.0, // metres per wavelength (nodes every half)
    noteRate: 3.5, // vibrations / second you can see
    rippleLength: 2.5, // metres of travelling ripple behind the front
    rippleSpeed: 26, // radians / second the ripple runs

    /* ================================================================ */
    /* 2 · THE SHEET — look                                              */
    /* ================================================================ */
    strands: 9, // taut strands across the width
    strandWidth: 0.12, // share of a strand's lane
    strandGlow: 0.7,
    membraneGlow: 0.12, // the thin film between the strands (emissive shimmer)
    membraneFill: 0.85, // the filled, dark-teal body of pressed air (occludes)
    iridescence: 0.25, // 0 flat colour .. 1 full thin-film spectrum
    edgeGlow: 1.25, // the white leading edge
    edgeWidth: 0.25, // metres it trails behind the front
    sideFeather: 0.35, // share of the width that feathers out
    sheetOpacity: 1.0,
    softFade: 0.3, // metres of soft fade where it meets geometry
    shredEdge: 0.06, // width of the bright tear edge
    colorStrand: '#8ff3e2', // ramp 2 · pale tint
    colorMembrane: '#13a596', // ramp 3 · saturated body
    colorAntinode: '#22c7b2', // antinodes, the bright part of the body
    colorEdge: '#eafffb', // ramp 1 · white-hot leading edge
    colorDeep: '#03262a', // ramp 4 · dark deep teal
    lensWarp: 1.0, // how hard the sheet bends the world (distortion)
    lensWidth: 1.4, // the lens is this much wider than the sheet

    /* ================================================================ */
    /* 3 · THE WAVEFRONT                                                 */
    /* ================================================================ */
    frontSize: 1.3, // metres, radius of the pressure disc at the front
    frontBands: 4, // arcs across it
    frontBandWidth: 0.16, // share of an arc's lane
    frontGlow: 1.1,
    frontFill: 0.65, // the dark pressed air inside the wavefront
    frontSplit: 0.25, // chromatic split at the rim
    frontSpeed: 3, // arcs / second racing outward
    screamSize: 2.2, // × size the front blooms to at the end of the line

    /* --- timing --- */
    screamTime: 0.3, // seconds the scream takes to bloom
    holdTime: 1.45, // seconds the note rings on after the scream (the linger)
    ringDown: 0.55, // how hard it keeps vibrating while it rings down
    ringDecay: 1.3, // how fast the ring-down dies
    tremolo: 2.2, // Hz of the swell in the ring-down
    screamAmp: 1.6, // extra amplitude while it screams (× waveAmp)
    groundFade: 0.9, // seconds the dust pattern takes to erode

    /* ================================================================ */
    /* 4 · THE CHLADNI FLOOR                                             */
    /* ================================================================ */
    groundWidth: 4.2, // metres across
    groundModes: 3, // nodal lines across the strip
    groundLineWidth: 0.2, // sharpness of a nodal line
    groundGlow: 0.9, // how much the lines glow
    groundScour: 0.7,
    groundFill: 0.85, // the lobes of piled dust between the ridges, filled
    groundMorph: 0.6, // Hz the pattern crawls between modes while the note rings // darkening of the scoured floor between lines
    colorSand: '#7fe6d4', // the ridges: pale tint
    colorSandBody: '#0f6f68', // the piled lobes: saturated body
    colorGroundLine: '#2fd8c0', // the ridge glow
    colorScour: '#021416', // the scoured floor: deep

    /* ================================================================ */
    /* 5 · PARTICLES                                                     */
    /* ================================================================ */
    streakRate: 160, // wind lines / second off the sheet's edges
    streakSize: 0.04,
    streakSpeed: 0.8, // × the cast speed
    streakLife: 0.35,
    streakStretch: 1.2,
    colorStreakA: '#eafffb',
    colorStreakB: '#8ff3e2',
    colorStreakC: '#13a596',
    colorStreakD: '#03262a',
    ringRate: 5, // node rings / second per node
    ringSize: 0.3,
    ringLife: 0.6,
    ringGlow: 1.2,
    colorRingA: '#eafffb',
    colorRingB: '#8ff3e2',
    colorRingC: '#13a596',
    colorRingD: '#03262a',
    dustRate: 30, // dust / second thrown sideways under the front
    dustSize: 0.35,
    dustSpeed: 2.5,
    dustLife: 1.0,
    dustOpacity: 0.28,
    colorDustA: '#c9d6d2',
    colorDustB: '#93a6a2',
    colorDustC: '#5d6f6e',
    colorDustD: '#2b3637',

    /* ================================================================ */
    /* 6 · THE SCREAM                                                    */
    /* ================================================================ */
    travelRumble: 0.04, // the note hums in the camera
    impactShake: 0.35,
    impactFlash: 0.2,
    colorFlash: '#9ff5e6',
    burstRadius: 2.2, // AIR shell at the end of the line, metres
    burstLife: 0.45,
    burstIntensity: 1.0,
    burstOpacity: 0.16, // kept low: a pressure ripple, not a glass dome
    colorBurstA: '#bff8ee',
    colorBurstB: '#13a596',
    colorBurstC: '#03262a',
    shockRadius: 6, // metres
    shockLife: 0.6,
    colorShockA: '#13a596',
    colorShockB: '#8ff3e2',
    shockIntensity: 0.8,

    /* ================================================================ */
    /* 7 · BODIES                                                        */
    /* ================================================================ */
    hitRadius: 1.2, // metres either side of the line the sheet cuts
    hitImpulse: 5, // forward
    hitLift: 2.5,
    hitSpin: 1.5,
    blastRadius: 2.4, // the scream throws everything this close to the end
    blastImpulse: 7,
    blastLift: 4
  }
};
