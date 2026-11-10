/**
 * Synaptic Override — storm (lightning), zone cast. Data only, no imports.
 *
 * A lightning cast shaped as a *nerve*, not a bolt: a charged axon crawls
 * from the caster's hand along the floor to the target, and where it lands a
 * neuron fires — a plasma soma heaves up and a crown of insulated dendrites
 * arcs out of it and plants its synaptic terminals on the floor. Every enemy
 * the crown can reach is **seized**: an arm swings off its rest bearing,
 * re-aims, and plants its terminal at that body's feet; a contact arc climbs
 * the body. That is the *interrupt* — through the combat binding it lays the
 * storm status on each seized actor. For `overrideTime` the override listens
 * and re-routes, action potentials running in along one arm and out along the
 * next, and then the signal is **diverted**: each seized body is thrown at the
 * *next* seized body round the soma (its own blow turned on its neighbour).
 * A lone body has nobody to be turned on, so its blow is bent `divertAngle`
 * degrees off the radial instead. Then the crown curls shut, retracts into
 * the soma, and the burnt neural web on the floor dissolves.
 *
 * Every key below is a live editor control. Gameplay keys are grouped first;
 * the rest are craft, resolved from this block every frame.
 */
export default {
  id: 'synapticOverride',
  meta: {
    label: 'Synaptic Override',
    accent: '#8fd8ff',
    element: 'storm',
    cast: 'zone',
    hint: 'Lightning — a neuron fires over the circle, seizes every body its dendrites reach, then diverts each one into the next',
    glyph:
      '<circle cx="50" cy="54" r="11"/><path d="M41 47Q24 30 12 44M59 47Q76 30 88 44M44 63Q30 80 18 82M56 63Q70 80 82 82M50 43V12M24 36L30 22M76 36L70 22"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 18, // maximum cast distance (m)
    minRange: 2, // closer than this and the cast is refused (m)
    speed: 26, // the axon crawls to the target at (m/s)
    cooldown: 6.5, // seconds before it can be cast again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 3.6, // the crown's reach — the seize radius (m)
    lifetime: 3.2, // nominal screen time for the HUD (s); the phases below set it

    /* --- the override (gameplay) --- */
    maxSeized: 6, // most bodies one crown can seize (≤ 8)
    seizeDelay: 0.22, // after landing, the arms re-aim onto their bodies (s)
    seizeTime: 0.16, // the swing onto a body takes (s)
    overrideTime: 1.15, // seconds the override listens before the diversion
    divertAngle: 70, // a lone body's blow is bent this far off the radial (°)
    hitDamage: 1, // damage per diverted hit (combat)
    hitImpulse: 15, // knockback (m/s, × explosion intensity)
    hitLift: 6,
    hitSpin: 2.6,

    /* --- phases --- */
    eruptTime: 0.32, // the crown arcs out and plants over (s)
    dischargeTail: 0.75, // the crown stays curled after the diversion for (s)
    exitTime: 0.7, // retract and dissolve (s)
    axonLinger: 0.55, // the travelled axon is reeled in over (s) after landing

    /* --- light --- */
    lightColor: '#9fd6ff',
    lightIntensity: 6,
    lightRadius: 9,
    lightFlicker: 0.35, // 0..1 how hard the light stutters with the potentials
    plantLight: 5, // punch when the crown plants (× explosion intensity)
    dischargeLight: 12, // punch on the diversion (× explosion intensity)

    /* --- palette: the four-stop ramp --- */
    coreColor: '#f2fbff', // white-hot core
    tintColor: '#a6e9ff', // pale cyan
    bodyColor: '#3b72ff', // saturated electric blue
    deepColor: '#140a3e', // deep indigo that grounds it

    /* --- 1 · the soma --- */
    somaRadius: 0.72, // cell body radius (m)
    somaHeight: 0.8, // its centre above the floor (m)
    somaLumps: 0.2, // fbm swelling of the membrane (× radius)
    somaStretch: 0.35, // hillock pulled out toward the axon (× radius)
    somaGlow: 2.2,
    somaBeat: 7, // membrane beats per second while it listens

    /* --- 2 · the dendrite crown (hero) --- */
    dendriteCount: 7, // primary arms (≤ 10)
    dendriteReach: 1, // rest landing radius (× zoneRadius)
    dendriteThickness: 0.24, // arm radius at the soma (m)
    dendriteTaper: 0.72, // how much thinner the tip is (0..0.95)
    dendriteRise: 0.35, // where the arm leaves the soma (× somaHeight)
    twigAt: 0.42, // first side twig sprouts this far along the arm
    twigAt2: 0.68, // second side twig
    twigSpread: 0.55, // twigs splay off the arm's bearing (rad)
    twigThickness: 0.5, // twig radius (× the arm where it sprouts)
    writhe: 0.24, // sideways writhe of the arms (m)
    writheFrequency: 1.6, // waves along an arm
    writheSpeed: 3.2, // how fast the writhe runs (rad/s)
    listenWrithe: 1.8, // writhe gain while the override listens
    curl: 0.6, // at the diversion the arms curl past planted (× π)
    potentialSpeed: 1.8, // action potentials per second along an arm
    potentialWidth: 0.07, // their length (fraction of an arm)
    potentialSwell: 0.45, // how much an arm swells as one passes
    membraneColor: '#1a2150', // the dark insulating membrane
    membraneSpecular: 0.6,
    dendriteGlow: 0.9, // core showing through the membrane
    potentialGlow: 3.2, // the potentials themselves

    /* --- 3 · the sheath (solid) --- */
    sheathPerArm: 4, // myelin segments along each arm (≤ 5)
    sheathSize: 1, // segment scale
    sheathColor: '#232c58',
    sheathMetalness: 0.55,
    sheathRoughness: 0.32,
    sheathEmissive: '#1f33c8',
    sheathGlow: 0.25,
    boutonSize: 0.28, // the synaptic terminal planted at each tip (m)

    /* --- 4 · the axon (travel) --- */
    axonThickness: 0.075, // (m)
    axonWave: 0.45, // sideways meander (m)
    axonArch: 0.5, // rise mid-line (m)
    axonNodes: 1.3, // nodes of Ranvier per metre
    axonGlow: 2.2,
    chargeGlow: 2.5, // the charge at the hand while the axon leaves

    /* --- 5 · contact and diversion arcs --- */
    arcWidth: 0.1, // ribbon width (m)
    arcJitter: 0.2, // jag of the bolt (m)
    arcFlicker: 22, // re-strikes per second
    arcGlow: 2.6,
    contactHeight: 1.15, // the contact arc climbs the body to (m)
    divertArcTime: 0.4, // the diverted bolt jumps body to body for (s)

    /* --- 6 · the synaptic field (floor) --- */
    fieldRadius: 1.18, // (× zoneRadius)
    fieldGlow: 1.5,
    fieldCells: 2.2, // neural web density (cells per metre)
    fieldTrace: 1.4, // the burnt arm traces
    fieldScorch: 0.85, // deep scorch under the crown (0..1 opacity)
    fieldDissolve: 0.75, // fraction of the fade spent dissolving

    /* --- 7 · particles --- */
    sparkRate: 70, // sparks per second off the arms while listening
    sparkSize: 0.05,
    sparkLife: 0.32,
    sparkSpeed: 4.5,
    sparkGlow: 2,
    colorSparkA: '#ffffff',
    colorSparkB: '#a6e9ff',
    colorSparkC: '#3b72ff',
    colorSparkD: '#140a3e',
    vesicleRate: 36, // transmitter motes drawn in to the soma per second
    vesicleSize: 0.09,
    vesicleLife: 0.75,
    vesicleSpeed: 1.6,
    vesicleGlow: 1.4,
    plantSparks: 48, // sparks thrown when the crown plants
    dischargeSparks: 96, // sparks thrown on the diversion

    /* --- 8 · plant and diversion --- */
    plantBurstReach: 0.55, // storm shell at the plant (× radius)
    dischargeBurstReach: 1.05, // storm shell at the diversion (× radius)
    burstLife: 0.5,
    burstIntensity: 0.9,
    burstOpacity: 0.65,
    burstFresnel: 2.2,
    burstSquash: 0.45,
    colorBurstA: '#ffffff',
    colorBurstB: '#8fd8ff',
    colorBurstC: '#2a2bb8',
    decalLife: 2.6,
    scorchIntensity: 0.85,
    arcDecalIntensity: 1.2,
    shockwaveWidth: 0.07,
    plantShake: 0.12, // (× explosion intensity, × camera shake)
    dischargeShake: 0.32,
    shakeDecay: 7,
    shakeFrequency: 26,
    plantFlash: 0.07, // (× explosion intensity)
    dischargeFlash: 0.2,

    /* --- 9 · the lens --- */
    lensCrackle: 0.45, // ionised shimmer over the crown while listening
    lensShock: 1, // pressure ring at plant and diversion
  },
};
