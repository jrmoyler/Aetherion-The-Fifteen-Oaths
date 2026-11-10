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
    element: 'illusion',
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
    colorA: '#a868ff', // accent
    colorB: '#f1e2ff', // accent, hot

    // ---- timing (s) ----
    unfoldTime: 0.4, // the point unfolds into the tesseract over
    barDelay: 0.12, // bars start dropping after
    barSpread: 0.4, // the ring of bars drops round over
    barDropTime: 0.16, // one bar drops over
    lifetime: 1.5, // the cage holds for
    foldTime: 0.5, // folds back into a point over
    retractTime: 0.4, // bars withdraw upward over
    floorFade: 0.5,

    // ---- 1 · the tesseract ----
    cubeSize: 1.05, // half-size of the 4D cube (m, before projection)
    projection: 4, // 4D viewing distance — lower is a deeper inner cube
    hoverHeight: 2.35, // centre (m)
    rotXW: 0.8, // rad/s in the XW plane
    rotYW: 0.35, // rad/s in the YW plane
    rotZW: 0.55, // rad/s in the ZW plane
    rotY: 0.4, // ordinary yaw (rad/s)
    foldSpin: 6, // spin-up while folding (×)
    edgeRadius: 0.06, // m — thick enough to read as solid crystal at 8 m
    nodeSize: 0.24, // m

    // ---- 2 · the cage ----
    barCount: 20,
    barHeight: 3.5, // m
    barRadius: 0.09, // m — hexagonal crystal prisms, lit, not light-sabres
    barInset: 0.0, // bars stand this far inside the rim (m)
    ringRadius: 0.07, // m, the top and bottom rings
    // While it holds the cage is never still: the whole ring turns, the top
    // ring twists against the bottom one (the bars lean into a hyperboloid)
    // and the crown cinches inward, closing over what it caught.
    cageSpin: 0.35, // rad/s the ring of bars turns while locked
    cageTwist: 0.75, // rad the top ring twists against the bottom at most
    cageTwistSpeed: 1.6, // rad/s of the twist's sway
    cageCinch: 0.32, // share of the radius the top ring closes in by
    cinchTime: 0.9, // s the cinch takes after the lock

    // ---- 3 · the light ----
    // The four-stop arcane ramp. The body (primary) and the deep tone carry
    // every solid surface; the core is HDR only in the thin heart of a bar.
    colorCore: '#f1e2ff', // white-hot violet: thin cores, packets, flares only
    colorSecondary: '#c48bff', // pale tint: fresnel rims, ring bars
    colorPrimary: '#7426e0', // saturated arcane violet: the crystal body
    colorDeep: '#1a063c', // deep: shadowed facets, the floor wash
    beamGlow: 0.8, // body brightness of the lit crystal (≤ 1 keeps it out of bloom)
    coreGlow: 2.2, // HDR inside the thin core line only
    coreWidth: 16, // core sharpness — higher is a thinner filament
    beamRim: 0.5, // tint on the fresnel rim
    beamAmbient: 0.2, // light on the shadowed facets
    packetGlow: 2.4,
    packetSpeed: 1.4, // packets per second along a bar
    packetSpacing: 1.6, // m between packets
    nodeGlow: 1.0,
    synapseRate: 6, // edges firing per second
    synapseGlow: 5,
    synapseDecay: 7,

    // ---- 4 · the floor ----
    colorWash: '#1a063c',
    gridCell: 0.85, // m
    gridLineWidth: 0.045, // m
    gridGlow: 1.1,
    gridWash: 0.82, // how solid the deep-violet disc under the lattice is
    floorHeart: 0.9, // the disc warms toward the body tone at its heart
    sweepSpeed: 0.35, // turns per second
    floorTime: 0.35, // draws out to the rim over
    pulseSpeed: 9, // synapse rings run at (m/s)

    // ---- 5 · motes & sparks ----
    moteRate: 90,
    moteSize: 0.06,
    moteLifetime: 1.4,
    moteGlow: 2.4,
    colorMoteA: '#f1e2ff',
    colorMoteB: '#c48bff',
    colorMoteC: '#7426e0',
    colorMoteD: '#1a063c',
    sparkCount: 8, // per bar as it lands
    sparkSpeed: 6,
    sparkSize: 0.04,
    sparkLifetime: 0.4,
    sparkStretch: 0.5,
    colorSparkA: '#f1e2ff',
    colorSparkB: '#c48bff',
    colorSparkC: '#7426e0',
    colorSparkD: '#2a0a5c',
    trailRate: 140, // off the travelling thought

    // ---- 6 · the beat ----
    lockShake: 0.4,
    lockFlash: 0.25,
    colorFlash: '#a868ff',
    lockLight: 26,
    shockRadius: 7.5,
    shockLife: 0.6,
    colorShockA: '#7426e0',
    colorShockB: '#e2c8ff',
    burstRadius: 2.2,
    burstLife: 0.4,
    colorBurstA: '#f1e2ff',
    colorBurstB: '#9a52f0',
    colorBurstC: '#2a0a5c',
    foldFlash: 0.3,
    fieldStrength: 0.04, // glass between the bars (kept low: the bars must stay ruled)

    // ---- light ----
    lightColor: '#9a5cff',
    lightIntensity: 9,
    lightRadius: 10,
    lightFlicker: 0.15
  }
};
