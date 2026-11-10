/**
 * Venom Mimicry — poison, zone cast. Data only, no imports.
 *
 * Infectious status imitation, as a creature: a venom seed is spat into the
 * circle, a hooded serpent rears out of the pool it opens, flares a hood
 * painted with false eyes and **bites** the enemy nearest the centre. The bite
 * copies whatever that enemy is already suffering (its UCSM statuses), and the
 * copy is *infectious*: in waves, venom threads leap from every carrier to
 * its nearest healthy neighbours, and at each one a smaller **mimic** of the
 * serpent rises — it imitates the original's sway a beat late, carries the
 * same copied ailments, and on the last beat every serpent strikes its
 * carrier at once.
 *
 * Every key below is a live editor control. Gameplay keys sit under
 * "contagion"; everything else is craft. Every dimension of the serpent is
 * derived from `zoneRadius` × a ratio, so dragging the radius mid-cast keeps
 * the strikes landing on their carriers.
 */
export default {
  id: 'venomMimicry',
  meta: {
    label: 'Venom Mimicry',
    accent: '#a6ff4d',
    element: 'poison',
    cast: 'zone',
    hint: 'Poison — a hooded serpent bites one enemy; its ailments spread to neighbours, each grows a mimic serpent, and all strike as one',
    glyph:
      '<path d="M50 92C44 80 40 70 42 60C30 56 22 44 26 30C30 18 42 12 50 12C58 12 70 18 74 30C78 44 70 56 58 60C60 70 56 80 50 92Z"/>' +
      '<circle cx="40" cy="36" r="6"/><circle cx="60" cy="36" r="6"/><path d="M14 80L30 70M86 80L70 70"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 18, // furthest the seed can be spat (m)
    minRange: 2,
    speed: 17, // the venom seed flies at (m/s)
    cooldown: 6,
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 3.2, // the bite finds its first host inside this circle (m)
    lifetime: 3.8, // nominal cast length, for the HUD (s)

    /* --- contagion (gameplay) --- */
    contagionRadius: 5.5, // a carrier infects healthy enemies within this (m)
    maxInfected: 6, // carriers in all, the host included (≤ 8)
    fanout: 2, // healthy neighbours each carrier infects per wave
    waves: 3, // infection waves after the bite
    hopInterval: 0.42, // seconds between waves
    maxMimic: 3, // ailments copied from the host (≤ 3); poison is always added
    statusSeconds: 4, // how long the copied ailments last (s, UCSM)
    venomDelay: 0.45, // after the last wave, every serpent strikes (s)
    venomDamage: 1, // damage of the unison strike, per carrier
    hitImpulse: 7, // knockback of the strike (× explosion intensity)
    hitLift: 4.5,
    hitSpin: 2.2,

    /* --- timing (× global lifetime) --- */
    gatherTime: 0.16, // the seed swells at the hand before it leaves (s of travel)
    riseTime: 0.35, // the serpent rears out of the pool (s)
    rearTime: 0.3, // and flares its hood before the bite (s)
    strikeTime: 0.09, // a strike lands this fast (s)
    recoilTime: 0.38, // and pulls back over (s)
    exitTime: 0.7, // serpents sink back into their pools (s)

    /* --- 1 · the seed (travel) --- */
    seedSize: 0.34, // radius of the spat venom seed (m)
    seedArc: 1.7, // arc height of its flight (m)
    seedHeight: 1.3, // leaves the hand at (m)
    seedSpin: 9, // tumble (rad/s)
    seedGlow: 2.4,

    /* --- 2 · the serpent (hero) --- */
    serpentLength: 1.0, // spine length (× zoneRadius)
    girth: 1.7, // body thickness (× authored)
    hoodWidth: 1.35, // flared hood span (× authored) — a flat shield far wider than the neck
    hoodCup: 0.08, // how far the hood edges wrap forward (kept flat)
    hoodFold: 0.18, // hood width while folded (× flared)
    sinkDepth: 0.38, // risen from / sinks to this deep (× length)
    restLean: 0.2, // spine lean when risen (rad / length)
    restCurl: 1.0, // curl toward the head when risen
    rearLean: -0.6, // spine lean when reared back (tall, head drawn back)
    rearCurl: 1.4, // curl when reared back
    strikeLean: 1.7, // spine lean at the strike — a low forward lunge
    strikeCurl: 1.0, // curl at the strike
    lunge: 0.22, // the whole serpent surges forward this far on a strike (× length)
    tailLength: 0.85, // the coil lying on the floor behind it (× length)
    tailAngle: 0.8, // the coil trails back and to the side (rad off straight back)
    tailWave: 0.24, // S-curve of the coil on the floor (× tail length)
    swayAmp: 0.16, // travelling wave down the spine while it weaves
    swayRate: 2.3, // weave speed (rad/s)
    weaveYaw: 0.22, // side-to-side weave of the whole serpent (rad)
    sideWave: 0.07, // sideways S-ripple down the spine (× length)
    approachAngle: 0.3, // serpents come at their carrier this far off the line (rad), so the strike reads in profile
    hoodBreath: 0.12, // the flared hood breathes by this much

    /* --- 3 · serpent skin --- */
    colorScale: '#3c7f1b', // scale body — dark venom green, lit not glowing
    colorDeep: '#140a1f', // back and band shadow — the deep tone
    colorBelly: '#dff8a4', // pale belly
    colorBand: '#a94cff', // aposematic warning bands — the colour it copies
    colorEye: '#f6ffd6', // the false eyes on the hood — white-hot core
    colorEyeRing: '#9dff3d',
    bandCount: 11, // warning bands down the spine
    bandSharp: 0.55, // band edge hardness
    scaleSize: 28, // scale cells round the body
    roughness: 0.36,
    metalness: 0.06,
    skinGlow: 0.7, // emissive in the bands and scale seams
    eyeSize: 0.2, // false eye radius (× hood half-span)
    eyeGlow: 3.2,
    rimGlow: 0.3, // wet fresnel rim
    flashGlow: 1.6, // the whole skin floods on a strike

    /* --- 4 · mimics --- */
    mimicScale: 0.72, // a mimic is this big (× the serpent)
    mimicLag: 0.24, // and imitates the serpent this late (s, per wave)
    mimicGlow: 1.0, // copies glow brighter — they are mostly venom

    /* --- 5 · venom threads --- */
    threadWidth: 0.085, // thread radius (m)
    threadArc: 1.6, // arc height between carriers (m)
    threadTravel: 0.24, // a thread reaches its next carrier in (s)
    threadGlow: 1.3,
    threadFlow: 2.2, // venom pulses flow along it at (cycles/s)
    threadBeads: 6, // pulses along a thread

    /* --- 6 · the pools --- */
    poolGlow: 0.9,
    poolVeins: 0.7, // vein strength in the stain
    poolGrow: 0.45, // pools spread to full size over (s)
    poolOpacity: 0.92,
    mimicPool: 0.55, // a carrier's pool radius (× zoneRadius)
    colorPoolA: '#efffbc', // white-hot veins
    colorPoolB: '#8fe23b', // pale wet tint
    colorPoolC: '#1d4410', // body of the stain
    colorPoolD: '#0b0611', // deep, almost black violet

    /* --- 7 · particles --- */
    miasmaRate: 24, // fume puffs per second over every pool
    miasmaSize: 0.6,
    miasmaLife: 1.6,
    miasmaSpeed: 0.55,
    colorMiasmaA: '#c9ff8a',
    colorMiasmaB: '#5e9c2c',
    colorMiasmaC: '#2b2340',
    colorMiasmaD: '#0e0a14',
    dripCount: 18, // venom drops at each strike
    dripSize: 0.08,
    dripLife: 0.9,
    dripSpeed: 2.4,
    colorDripA: '#f4ffd0',
    colorDripB: '#a6ff4d',
    colorDripC: '#4b8f1f',
    colorDripD: '#160c21',
    spitCount: 34, // streak splatter at the bite and the strike
    spitSize: 0.09,
    spitLife: 0.5,
    spitSpeed: 6.5,
    sparkGlow: 1.5,

    /* --- 8 · impact --- */
    biteShake: 0.2, // (× explosion intensity, × camera shake)
    venomShake: 0.3,
    shakeDecay: 6,
    shakeFrequency: 18,
    biteFlash: 0.1, // (× explosion intensity)
    venomFlash: 0.1,
    biteLight: 6, // light punch (× explosion intensity)
    venomLight: 8,
    burstIntensity: 0.6,
    burstLife: 0.5,
    burstOpacity: 0.32,
    burstReach: 0.55, // venom splash shell (× zoneRadius)
    decalLife: 2.6, // stains and rings stay this long (s)
    stainAmount: 0.85, // how far a carrier's body is stained
    stainTime: 0.6, // over (s)
    stainColor: '#24411a',
    stainRim: '#9cff3d',
    stainRimGlow: 1.6,
    stainEdge: '#dcff86',
    stainEdgeGlow: 2,

    /* --- 9 · haze --- */
    hazeStrength: 0.5, // toxic shimmer over the pool (× global distortion)

    /* --- light --- */
    lightColor: '#9dff4a',
    lightIntensity: 4.5,
    lightRadius: 9,
  },
};
