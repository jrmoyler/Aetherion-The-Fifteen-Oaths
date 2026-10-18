/**
 * Fault Choir — Earth — a fault splits open down the line, a choir of stone
 * blades rises out of it singing, and the last note is a stone lance driven
 * up through the target.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 *
 * Every dimension below is resolved per frame by `FaultChoirAbility`, so a
 * slider re-shapes a fissure already open and spikes already standing.
 */
export default {
  id: 'faultchoir',
  meta: {
    label: 'Fault Choir',
    accent: '#e6c48a',
    key: '',
    element: 'earth',
    hint: 'Earth — the fault splits down the line, a choir of stone blades rises singing from it, and the last note is a lance through the target',
    cast: 'line',
    glyph: `<path d="M10 88L22 80L18 72L30 66L26 58L40 50L36 42L52 34"/><path d="M30 66L34 50M44 54L48 36M58 46L64 24"/><path d="M70 60L90 10L80 64Z"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 20, // how fast the fault runs down the line, metres/second
    lifetime: 1.6, // seconds the stone takes to crumble and the fault to seal
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#ffc77a',
    lightIntensity: 9, // the light rides the running front, then the lance
    lightRadius: 10,
    lightFlicker: 0.3, // 0..1 the song's tremble on the light

    /* ================================================================ */
    /* 1 · THE FAULT                                                     */
    /* ================================================================ */
    crackStart: 0.8, // metres in front of the caster the fault opens
    crackWidth: 0.2, // half-width of the glowing gap, metres
    crackEdge: 0.95, // half-width of the heaved, broken lip, metres
    crackWander: 0.32, // metres the fault zig-zags
    crackWanderScale: 0.4, // zig-zags per metre
    branchAmount: 0.7, // side fractures off the gap
    crackGlow: 3.4, // the light from deep in the gap (bloom > 1)
    songSpacing: 2.2, // metres between the pulses running down the gap
    songSpeed: 1.6, // pulses per second (run toward the target)
    songGlow: 2.2, // how much brighter a pulse is
    crackOpacity: 0.92,
    colorGap: '#ff9a3c',
    colorHot: '#fff0c4',
    colorLip: '#2e2218',
    colorDustLip: '#6b5338',

    /* ================================================================ */
    /* 2 · THE CHOIR — spikes                                            */
    /* ================================================================ */
    spikeStart: 1.8, // metres along the line the first spike stands
    spikeSpacing: 1.05, // metres between spikes
    spikeHeightMin: 0.9, // metres, the first spike
    spikeHeightMax: 2.5, // metres, the last spike before the lance
    spikeWidth: 0.42, // metres across the root
    spikeLean: 0.42, // radians each leans toward the target
    spikeSplay: 0.32, // radians each leans out to its side, alternating
    spikeOffset: 0.25, // metres each stands off the crack, alternating
    spikeDelay: 0.05, // seconds after the front passes before a spike breaks out
    spikeRise: 0.16, // seconds it takes to rise
    spikeHum: 0.025, // metres it shivers while it sings
    humRate: 34, // shivers per second

    /* ================================================================ */
    /* 3 · THE STONE                                                     */
    /* ================================================================ */
    veinGlow: 3.2, // resonance veins (bloom > 1)
    veinScale: 2.0,
    tipGlow: 2.6, // the singing tip
    strata: 5, // bands up a blade
    singTime: 0.7, // seconds a spike sings loudest after it rises
    colorStoneA: '#3d3024',
    colorStoneB: '#9c8160',
    colorVein: '#ffae48',

    /* ================================================================ */
    /* 4 · THE LANCE                                                     */
    /* ================================================================ */
    lanceLength: 5.6, // metres
    lanceWidth: 0.85, // metres across the root
    lanceAngle: 0.62, // radians it leans toward the target, off upright
    lanceBack: 1.5, // metres short of the target it bursts out of the ground
    lanceRise: 0.11, // seconds it takes to drive up
    lanceHold: 0.55, // seconds it stands singing before the choir crumbles

    /* ================================================================ */
    /* 5 · THE SONG — rings                                              */
    /* ================================================================ */
    ringSize: 2.0, // metres a spike's ring opens to
    ringTime: 0.55, // seconds it takes
    ringWidth: 0.045, // band width, share of the ring
    ringBands: 3, // bands per ring (1..4)
    ringGlow: 2.8,
    ringWarp: 0.8, // how hard each ring pushes the air
    lanceRingSize: 5.5, // metres the lance's ring opens to
    colorRing: '#ffb860',

    /* ================================================================ */
    /* 6 · DEBRIS, DUST & MOTES                                          */
    /* ================================================================ */
    chipCount: 14, // chips thrown by each spike breaking out
    chipSize: 0.1,
    chipSpeed: 4.5,
    chipLife: 1.0,
    chipGravity: 14,
    dustRate: 34, // puffs/second off the opening fault
    dustSize: 0.9,
    dustLife: 1.6,
    dustOpacity: 0.45,
    moteRate: 70, // resonance motes/second rising from the gap
    moteSize: 0.05,
    moteGlow: 3.2,
    colorChipA: '#b39a78',
    colorChipB: '#8a7356',
    colorChipC: '#5e4a36',
    colorChipD: '#3a2c20',
    colorDustA: '#9a8466',
    colorDustB: '#7e6a50',
    colorDustC: '#5f4f3c',
    colorDustD: '#3e3428',
    colorMoteA: '#fff4d0',
    colorMoteB: '#ffcf80',
    colorMoteC: '#ff9a3c',
    colorMoteD: '#7a3a10',

    /* ================================================================ */
    /* 7 · THE LAST NOTE                                                 */
    /* ================================================================ */
    burstSize: 2.2, // the EARTH shell where the lance breaks out, metres
    crackRadius: 3.4, // radial CRACK decal, metres
    shockRadius: 6.5,
    dustRingRadius: 4.2,
    impactFlash: 0.35,
    impactShake: 0.75,
    shakeDuration: 0.45,
    impactLight: 2.6, // light punch, × lightIntensity
    travelRumble: 0.14, // camera rumble while the fault runs
    colorShockA: '#ffb860',
    colorShockB: '#fff0c4',
    colorBurstA: '#d9c09a',
    colorBurstB: '#9c8160',
    colorBurstC: '#4a3a2c',
    colorFlash: '#ffd9a0',

    /* ================================================================ */
    /* 8 · THE SPLIT                                                     */
    /* ================================================================ */
    hitWidth: 1.0, // metres either side of the fault that are split
    hitImpulse: 5, // m/s thrown away from the fault
    hitLift: 3.2,
    hitSpin: 1.4,
    slice: 1, // 1 splits bodies in two, 0 just knocks them down
    lanceZone: 2.4, // metres round the lance that are launched
    lanceImpulse: 11, // m/s forward
    lanceLift: 10 // m/s up
  }
};
