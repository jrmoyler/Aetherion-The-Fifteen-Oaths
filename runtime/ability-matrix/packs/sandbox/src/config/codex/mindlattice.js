/**
 * Mind Lattice — Arcane, zone cast.
 *
 * A single point of thought flies to the circle and unfolds into a
 * tesseract — a cube inside a cube, turning through the fourth dimension so
 * the inner cube rolls out through the outer — hanging over the circle. Bars
 * of light drop round the rim, ring by ring, and lock it in a cylinder cage;
 * a lattice of light draws itself across the floor. Synapses fire along the
 * edges. Then the whole thing folds back into the point it came from.
 *
 * Data only. MindLatticeAbility reads every field live.
 */
export default {
  id: 'mindlattice',
  meta: {
    label: 'Mind Lattice',
    accent: '#dfe4ff',
    key: '',
    element: 'arcane',
    hint: 'Arcane — a turning tesseract of thought hangs over the circle and cages it in bars of light',
    cast: 'zone',
    glyph: '<path d="M26 30H64V68H26Z"/><path d="M38 20H76V58H38Z"/><path d="M26 30L38 20M64 30L76 20M64 68L76 58M26 68L38 58"/>'
  },
  settings: {
    // ---- the cast ----
    range: 18, // max cast distance (m)
    minRange: 2,
    speed: 22, // the thought flies at (m/s)
    zoneRadius: 4.5, // the circle (m)
    cooldown: 0.6,
    castAnim: 'cast1',
    colorA: '#dfe4ff', // accent
    colorB: '#ffffff', // accent, hot

    // ---- timing (s) ----
    unfoldTime: 0.45, // the point unfolds into the tesseract over
    barDelay: 0.12, // bars start dropping after
    barSpread: 0.4, // the ring of bars drops round over
    barDropTime: 0.16, // one bar drops over
    lifetime: 1.5, // the cage holds for
    foldTime: 0.5, // folds back into a point over
    retractTime: 0.4, // bars withdraw upward over
    floorFade: 0.5,

    // ---- 1 · the tesseract ----
    cubeSize: 1.2, // half-size of the 4D cube (m, before projection)
    projection: 4, // 4D viewing distance — lower is a deeper inner cube
    hoverHeight: 3.0, // centre (m)
    rotXW: 0.8, // rad/s in the XW plane
    rotYW: 0.35, // rad/s in the YW plane
    rotZW: 0.55, // rad/s in the ZW plane
    rotY: 0.4, // ordinary yaw (rad/s)
    foldSpin: 6, // spin-up while folding (×)
    edgeRadius: 0.035, // m
    nodeSize: 0.16, // m

    // ---- 2 · the cage ----
    barCount: 20,
    barHeight: 4.8, // m
    barRadius: 0.03, // m
    barInset: 0.0, // bars stand this far inside the rim (m)
    ringRadius: 0.035, // m, the top and bottom rings

    // ---- 3 · the light ----
    colorPrimary: '#8ea0ff',
    colorSecondary: '#c9b8ff',
    colorCore: '#ffffff',
    beamGlow: 1.6,
    coreGlow: 2.6,
    packetGlow: 3.5,
    packetSpeed: 1.4, // packets per second along a bar
    packetSpacing: 1.6, // m between packets
    nodeGlow: 2.2,
    synapseRate: 6, // edges firing per second
    synapseGlow: 5,
    synapseDecay: 7,

    // ---- 4 · the floor ----
    colorWash: '#0a0f2a',
    gridCell: 0.85, // m
    gridLineWidth: 0.035, // m
    gridGlow: 1.3,
    gridWash: 0.45,
    sweepSpeed: 0.35, // turns per second
    floorTime: 0.35, // draws out to the rim over
    pulseSpeed: 9, // synapse rings run at (m/s)

    // ---- 5 · motes & sparks ----
    moteRate: 60,
    moteSize: 0.06,
    moteLifetime: 1.4,
    moteGlow: 2.4,
    colorMoteA: '#ffffff',
    colorMoteB: '#dfe4ff',
    colorMoteC: '#8ea0ff',
    colorMoteD: '#1a2050',
    sparkCount: 8, // per bar as it lands
    sparkSpeed: 6,
    sparkSize: 0.04,
    sparkLifetime: 0.4,
    sparkStretch: 0.5,
    colorSparkA: '#ffffff',
    colorSparkB: '#dfe4ff',
    colorSparkC: '#8ea0ff',
    colorSparkD: '#202a6a',
    trailRate: 140, // off the travelling thought

    // ---- 6 · the beat ----
    lockShake: 0.4,
    lockFlash: 0.35,
    colorFlash: '#dfe4ff',
    lockLight: 26,
    shockRadius: 7.5,
    shockLife: 0.6,
    colorShockA: '#8ea0ff',
    colorShockB: '#ffffff',
    burstRadius: 2.2,
    burstLife: 0.4,
    colorBurstA: '#ffffff',
    colorBurstB: '#dfe4ff',
    colorBurstC: '#8ea0ff',
    foldFlash: 0.3,
    fieldStrength: 0.5, // glass between the bars

    // ---- light ----
    lightColor: '#dfe4ff',
    lightIntensity: 9,
    lightRadius: 10,
    lightFlicker: 0.15
  }
};
