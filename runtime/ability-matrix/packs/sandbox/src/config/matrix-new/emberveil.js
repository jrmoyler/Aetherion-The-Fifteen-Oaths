/**
 * Emberveil Lattice — Fire — an interlocking cage of burning strands.
 *
 * Matrix New data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 */
export default {
  id: 'emberveil',
  meta: {
    label: "Emberveil Lattice",
    accent: '#ff6a2a',
    key: 'E',
    hint: "Fire — a woven cage of burning strands traps the circle, then collapses inward",
    cast: 'zone',
    glyph: `<path d="M14 84C14 40 40 16 50 16C60 16 86 40 86 84"/><path d="M14 84C30 70 44 40 74 24M86 84C70 70 56 40 26 24"/><path d="M50 16V84"/><path d="M10 86H90"/>`
  },
  /**
   * A cage in four beats, on one clock that starts when the ember lands:
   * the strands **weave** up out of the floor and meet over the crown, the
   * cage **burns** with everything inside it held, then it **contracts** —
   * tightening, turning faster and burning whiter — and **collapses** inward
   * in one flame burst that throws the bodies out of it.
   *
   * The strands are tubes drawn from a parameter buffer: every dimension of the
   * dome below — its radius, height, sweep, weave, the contraction — is a
   * uniform, resolved from this block every frame, so the cage reshapes under
   * the slider while it burns.
   */
  settings: {
    /* --- the cast --- */
    "range": 16,
    "minRange": 0,
    "speed": 14, // m/s the thrown ember travels to the circle
    "lifetime": 3.2, // seconds the closed cage burns before it contracts
    "cooldown": 0.6,
    "castAnim": "cast2",
    "zoneRadius": 5.5, // metres — the floor circle the cage stands on

    /* --- timing --- */
    weaveTime: 0.9, // seconds for the strands to climb from the floor to the crown
    contractTime: 0.75, // seconds the cage takes to pull in before it bursts
    fadeTime: 1.4, // seconds for the burnt-out strands and the floor to die

    /* --- the cage shape --- */
    strandCount: 16, // live strands (max 24), half sweep each way
    cageRadius: 0.92, // floor radius of the dome, × zone radius
    cageHeight: 3.6, // metres
    cageApex: 1.35, // highest elevation a strand climbs to, radians (π/2 = over the pole)
    cageArch: 0.75, // < 1 steep walls and a flat crown, > 1 a pointed crown
    sweep: 2.1, // radians each strand travels round the circle as it arches over
    crossings: 7, // over/under alternations along a strand
    weave: 0.05, // how far the over/under pushes in and out, × radius
    spin: 0.22, // radians/second the whole cage turns while it burns
    sway: 0.06, // radians of lazy writhing
    swaySpeed: 1.6,
    weaveStagger: 0.45, // 0 = every strand climbs together, 1 = one after another
    weaveHeadGlow: 2.5, // the hot tip on each climbing strand
    breathAmount: 0.06, // the burning cage heaves, × height (presentation only)
    breathSpeed: 2.4, // radians/second of that heave
    burnOrbit: 1.0, // a hot side that chases itself round the burning cage
    burnOrbitSpeed: 2.2, // radians/second it chases round
    cageCreep: 0.08, // the visible cage draws in over the burn, × radius (the trap reach does not)

    /* --- the burning strand: a charred cord split by molten cracks --- */
    strandWidth: 0.1, // tube radius, metres
    strandTaper: 0.35, // how much thinner the crown is than the roots
    strandIntensity: 2.6, // HDR on the hottest crack centres only
    strandOpacity: 1.0,
    coreSharpness: 5.0, // higher = a narrower white line down the middle
    pulseAmount: 0.55, // heat pulses running from the roots to the crown
    pulseScale: 3.5,
    pulseSpeed: 2.6,
    floorFade: 0.35, // metres the strands fade out over at the floor
    strandSoftFade: 0.15,
    crackScale: 1.6, // molten crack pattern scale
    crackWidth: 0.21, // how much of the cord is open crack (widens as it burns)
    colorStrandCore: '#fff0c4', // white-hot crack centre
    colorStrandBody: '#ffa040', // pale tint
    colorStrandEdge: '#e0400c', // saturated body
    colorStrandDeep: '#4a0c04', // dark ember
    colorStrandChar: '#170a07', // the charred cord itself

    /* --- the flames licking off every strand --- */
    flameWidth: 2.6, // × strand width
    flameLick: 0.55, // metres the flame tongues reach up off a strand
    flameLickScale: 1.6,
    flameNoise: 0.75, // how torn the flame is
    flameNoiseScale: 2.4,
    flameSpeed: 2.4, // how fast the tongues stream upward
    flameIntensity: 1.25,
    flameOpacity: 0.6,
    flameSoftFade: 0.35,
    flameClimb: 0.6, // the tongues climb this much higher by the end of the burn
    colorFlameCore: '#ffc070',
    colorFlameBody: '#f04a0c',
    colorFlameTip: '#5a0e04',

    /* --- dripping embers (SOFT, additive) --- */
    dripRate: 90, // per second over the whole cage
    dripSize: 0.07,
    dripSpeed: 0.6,
    dripGravity: -7,
    dripLifetime: 0.9,
    dripGlow: 2.6,
    colorDripA: '#fff1c0',
    colorDripB: '#ffa040',
    colorDripC: '#ff4a10',
    colorDripD: '#3a0a04',

    /* --- sparks rising off the cage (SOFT, additive, curl) --- */
    sparkRate: 60,
    sparkSize: 0.05,
    sparkRise: 2.2,
    sparkLifetime: 1.3,
    sparkGlow: 2.2,
    colorSparkA: '#fff6d0',
    colorSparkB: '#ffb050',
    colorSparkC: '#ff5a18',
    colorSparkD: '#2a0804',

    /* --- smoke off the crown (SMOKE, non-additive) --- */
    smokeRate: 26,
    smokeSize: 1.0,
    smokeSpread: 2.4, // end size, × start
    smokeRise: 1.0,
    smokeLifetime: 2.0,
    smokeOpacity: 0.55,
    smokeTurbulence: 0.6,
    colorSmokeA: '#4a3226',
    colorSmokeB: '#2e2622',
    colorSmokeC: '#221e1c',
    colorSmokeD: '#141212',

    /* --- the scorched floor ring --- */
    floorOpacity: 1.0,
    charWidth: 0.55, // metres either side of the circle
    charCreep: 0.9, // metres the char creeps inward while it burns
    charDarkness: 0.85,
    seamWidth: 0.07, // the ember seam along the circle, metres
    seamGlow: 3.0,
    seamCrawl: 0.7,
    poolSize: 0.38, // molten pool under each anchor, metres
    poolGlow: 3.2,
    washGlow: 0.1, // faint heat wash inside the circle
    floorNoiseScale: 1.3,
    floorCool: 0.6, // how much heat the floor keeps after the collapse, 0..1
    colorChar: '#0c0806',
    colorSeam: '#ff5a14',
    colorSeamHot: '#ffd890',
    colorWash: '#ff3a0c',

    /* --- the heat haze (LAYER.DISTORTION) --- */
    hazeStrength: 0.55,
    hazeWidth: 1.15, // × cage diameter
    hazeHeight: 1.4, // × cage height
    hazeScale: 2.2,
    hazeSpeed: 2.2,
    hazeFalloff: 1.1,

    /* --- the trapped --- */
    trapReach: 0.95, // × cage radius — who counts as inside
    trapStain: 0.9, // how far the heat stains a trapped body (0..1)
    trapStainTime: 1.6, // seconds to reach that stain
    trapRumble: 0.02, // continuous shake while it burns
    look: {
      color: '#1a0c06', // the body, scorched
      rimColor: '#ff6a1a',
      rimEmissive: 2.2,
      edgeColor: '#ffd080',
      edgeEmissive: 3.0,
      edgeWidth: 0.06
    },

    /* --- the contraction --- */
    contractScale: 0.12, // radius the cage pulls in to, × its own
    contractSquash: 0.35, // height it slumps to, × its own
    contractSpin: 6, // how much faster it turns as it tightens, ×
    contractSurge: 0.7, // how much whiter it burns as it tightens
    contractRumble: 0.18,

    /* --- the collapse burst --- */
    burstSize: 3.4, // FIRE shell end radius, metres
    burstLife: 0.6,
    burstIntensity: 3.0,
    burstOpacity: 0.9,
    burstSquash: 0.75,
    colorBurstA: '#fff2c0',
    colorBurstB: '#ff7a22',
    colorBurstC: '#4a120a',
    ringRadius: 7.5, // the ground shock ring, metres
    ringLife: 0.6,
    ringWidth: 0.08,
    colorRingA: '#ff8a3a',
    colorRingB: '#fff0c0',
    scorchRadius: 3.2,
    scorchLife: 5.0,
    colorScorch: '#0d0907',
    colorScorchEmber: '#ff5a14',
    collapseSparks: 160, // sparks thrown out of the burst
    collapseSparkSpeed: 11,
    collapseShake: 0.55,
    collapseFlash: 0.35,
    colorFlash: '#ffb070',
    collapseLight: 30, // added to the light at the burst

    /* --- hits --- */
    hitImpulse: 9.0, // m/s, outward from the centre
    hitLift: 5.5,
    hitSpin: 1.8,

    /* --- the thrown ember (anticipation + travel) --- */
    callSparks: 200, // sparks per second shed along the throw
    callFlameSize: 1.4, // FIRE puff where the ember lands, metres
    handFlare: 0.8, // FIRE flare at the hand on the cast, metres
    throwHeight: 1.2, // metres the ember leaves the hand at
    throwLob: 1.4, // metres the lob rises at its middle
    ballRadius: 0.55, // the wound ember ball, metres
    ballStrands: 10, // burning threads wound into it
    ballStrandWidth: 0.05, // their tube radius, metres
    ballSpin: 7, // radians/second it tumbles in flight
    ballFlameGlow: 0.45, // the ball's flames, × the cage's flame intensity
    ballHeat: 0.18, // how open its cracks are (0 charred … 1 incandescent)
    ballWindTime: 0.16, // seconds it takes to wind up at the hand
    threadWidth: 0.06, // the burning thread it spools behind it, metres
    threadWrithe: 0.07, // metres the thread writhes
    threadBurnTime: 0.45, // seconds the thread takes to burn back after the landing
    trailSmoke: 40, // dark smoke puffs per second off the ball
    trailSmokeSize: 0.45,
    telegraphStart: 0.35, // the circle starts to catch when the ember is this far along
    telegraphReveal: 0.55, // how strongly the circle is marked before the landing

    "colorA": "#ff6a2a",
    "colorB": "#ffcc80",
    "lightColor": "#ff6a2a",
    "lightIntensity": 6,
    "lightRadius": 9,
    lightHeight: 1.6, // metres over the circle the light sits
    lightFlicker: 0.25 // how hard the light gutters
  }
};
