/**
 * Hydraulic Marionette — water, zone cast. Data only, no imports.
 *
 * "Liquid movement tether": the caster flings a spool of water that unfolds,
 * high over the target circle, into a puppeteer's control — a cross of
 * pressurised water — and drops a liquid string from it onto every enemy in
 * the circle (up to six). The strings hook, yank the bodies off their feet
 * *inward*, hoist them and make them dance under the control on the beat of
 * pulses pumped down each string, then the control jerks up, the strings
 * snap and the puppets are slammed into the pool that has spread beneath.
 *
 * Every key below is a live editor control. Gameplay keys (range, radius,
 * string count, timings, forces, damage) are read at the moment they act;
 * every dimension is resolved from this block every frame.
 */
export default {
  id: 'hydraulicMarionette',
  meta: {
    label: 'Hydraulic Marionette',
    accent: '#4fc6ff',
    element: 'water',
    cast: 'zone',
    hint: 'Water — a liquid puppeteer’s control hooks up to six foes on water strings, hauls them inward to dance, then cuts them down',
    glyph:
      '<path d="M18 22H82M50 10V34M32 16V28M68 16V28"/><path d="M22 22Q20 52 30 70M50 34Q50 56 50 74M78 22Q80 52 70 70"/><circle cx="30" cy="76" r="5"/><circle cx="50" cy="80" r="5"/><circle cx="70" cy="76" r="5"/><path d="M14 90Q50 82 86 90"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 16, // max cast distance (m)
    minRange: 2, // closer than this and the cast is refused (m)
    speed: 16, // the spool flies to the circle at (m/s)
    cooldown: 5, // seconds before the cast can be armed again
    castAnim: 'cast2', // which clip in CAST_ANIMATIONS the body throws
    zoneRadius: 3.4, // the circle the strings reach (m) — every size below is derived from it
    lifetime: 3.3, // nominal screen time, for the HUD (s)

    /* --- the tether (gameplay) --- */
    stringCount: 6, // strings the control drops (≤ 6) — one enemy per string, nearest first
    gatherTime: 0.28, // the water gathers at the hand before it flies (s, × global lifetime)
    dropTime: 0.16, // strings fall from the control and hook (s) — the hook is the impact frame
    holdTime: 1.7, // the dance: hooked bodies are hoisted and worked (s)
    cutTime: 0.32, // the control jerks up and the strings snap back (s) — the slam lands at its start
    exitTime: 0.75, // the control rains out and the pool drains (s)
    hookDamage: 1, // damage of the hook's yank (UCSM / standalone health)
    cutDamage: 1, // damage of the slam, to tethered targets still standing
    statusSeconds: 3, // the wet tether status the hook leaves (s, combat only)
    hookImpulse: 4, // the yank: knocks a hooked body *toward the centre* (m/s, × explosion intensity)
    hookLift: 5, // and up off its feet
    hookSpin: 1.2,
    slamImpulse: 6, // the cut: thrown on toward the centre (m/s, × explosion intensity)
    slamDown: 9, // and driven down into the pool (m/s)
    slamSpin: 2,
    pinStiffness: 0.55, // how hard a string holds its puppet (0..1; 1 is a rigid hold)
    pinJoint: 'Spine2', // the joint each string hooks

    /* --- the dance (placement derived from zoneRadius) --- */
    puppetHeight: 1.6, // hooked bodies are hoisted to (m)
    gatherRadius: 0.42, // and hauled inward to this ring (× zoneRadius)
    hoistTime: 0.55, // seconds the hoist takes after the hook
    danceRate: 1.5, // tugs per second pumped down each string
    tugStagger: 0.13, // seconds between neighbouring strings' tugs (a rolling wave round the control)
    danceBob: 0.38, // a tug jerks the puppet up by (m)
    danceSway: 0.32, // and swings it round the ring (m)

    /* --- 1 · the control (hero) --- */
    controlHeight: 3.3, // the control hangs this high over the circle (m)
    controlSpan: 0.8, // half-length of the main bar (× zoneRadius)
    crossSpan: 0.56, // half-length of the crossbar (× zoneRadius)
    barThickness: 0.17, // bar radius (m)
    knuckleSize: 0.5, // the reservoir where the bars cross (m)
    bulbSize: 0.3, // the beads of water on the bar ends (m)
    rockAngle: 0.2, // the puppeteer's rock (rad)
    rockRate: 1.1, // rocks per second
    spinRate: 0.22, // slow turn of the whole control (rad/s)
    yankRise: 0.9, // the control jerks up by this at the cut (m)
    arcLift: 1.8, // the spool's flight arcs this high above the straight line (m)
    handHeight: 1.35, // where the water gathers at the hand (m)
    spoolScale: 0.28, // the control's size while it is still a spool at the hand

    /* --- 2 · the strings --- */
    stringRadius: 0.06, // string radius (m)
    stringSag: 0.5, // sag while a string is slack (m)
    stringWave: 0.13, // lateral ripple running down a string (m)
    stringWaveFreq: 2.4, // ripples along a string
    stringWaveSpeed: 7, // ripple speed (rad/s)
    tugBulge: 0.9, // a pumped tug swells the string by (× radius)
    tugGlow: 1.6, // and lights it by
    hookSize: 0.24, // the bead of water each string hooks with (m)
    feedRadius: 0.065, // the feed line from the caster's hand to the control (m)
    feedSag: 0.9, // its sag (m)

    /* --- 3 · the liquid (shared by the control, strings and hooks) --- */
    colorCore: '#f2feff', // white-hot glints and pumped pulses
    colorTint: '#8fe9ff', // rim light and caustics
    colorBody: '#1c8ad4', // the water itself
    colorDeep: '#04223f', // looking through thick water — grounds it on the dark floor
    liquidGloss: 110, // specular tightness
    liquidSpecular: 2, // specular strength (HDR — bloom picks it up)
    liquidEnv: 0.45, // reflection of the room
    liquidFresnel: 2.6, // rim power
    liquidRim: 0.6, // rim brightness
    liquidFlow: 1.6, // speed the surface flows along the bars and strings
    liquidRipple: 0.45, // surface ripple (normal perturbation)
    liquidCaustic: 0.6, // caustic veins inside the water
    liquidGlow: 0.12, // the water's own light
    dissolveEdge: 0.09, // foam edge when the control rains out

    /* --- 4 · the pool (floor) --- */
    poolScale: 1.12, // the pool spreads to (× zoneRadius)
    poolOpacity: 0.82, // how dark and wet the floor goes
    poolSpread: 0.35, // seconds the pool takes to spread after the hook
    poolRipple: 1, // ripple strength from the strings' tugs
    poolRingFreq: 9, // ripple rings per metre-ish
    poolRingSpeed: 3.2, // ripple speed
    poolFoam: 0.5, // foam lace at the rim and on the crests
    poolSpecular: 1.5, // sun glint on the ripples
    poolGlow: 0.8,
    poolDrain: 0.85, // fraction of the exit spent draining

    /* --- 5 · splash crowns --- */
    crownHeight: 0.5, // crown splash height at a hook (m)
    crownWidth: 0.55, // crown radius (m)
    crownLife: 0.55, // (s)
    crownGlow: 0.9,
    crownSlam: 1.6, // crowns at the slam are this much bigger

    /* --- 6 · particles --- */
    dripRate: 24, // drips per second off each string and bar end
    dripSize: 0.07,
    dripLife: 0.85,
    dripSpeed: 0.8,
    dripGravity: -9, // (m/s²)
    gatherRate: 70, // droplets spun into the spool at the hand (per s)
    splashCount: 26, // droplets per hook splash
    splashSize: 0.085,
    splashSpeed: 4.2,
    splashLife: 0.75,
    mistCount: 10, // spray puffs per splash
    mistSize: 0.6,
    mistLife: 1.1,
    mistSpeed: 0.7,
    rainRate: 160, // droplets per second while the control rains out
    dropletGlow: 1.3,
    colorDropA: '#ffffff',
    colorDropB: '#a8efff',
    colorDropC: '#2a9be0',
    colorDropD: '#06325c',
    colorMistA: '#e9fbff',
    colorMistB: '#9fe2ff',
    colorMistC: '#3a8fc4',
    colorMistD: '#0b2b47',

    /* --- 7 · impact (the hook) and the slam --- */
    hookShake: 0.12, // (× explosion intensity, × camera shake)
    hookFlash: 0.08,
    hookLight: 4, // light punch at the hook
    slamShake: 0.3,
    slamFlash: 0.16,
    slamLight: 7,
    shakeDecay: 6,
    shakeFrequency: 16,
    burstReach: 0.8, // the slam's splash dome grows to (× zoneRadius)
    burstLife: 0.6,
    burstIntensity: 0.9,
    burstOpacity: 0.7,
    burstFresnel: 2.2,
    burstSquash: 0.45,
    colorBurstA: '#ffffff',
    colorBurstB: '#7fd8ff',
    colorBurstC: '#0d4f86',
    decalLife: 2.6, // ripple and foam left on the floor (s)
    rippleIntensity: 1,
    foamIntensity: 0.8,
    shockwaveWidth: 0.07,
    shockwaveIntensity: 0.9,

    /* --- 8 · the lens --- */
    lensStrength: 0.7, // refraction of the pool's ripples (× global distortion)
    lensShock: 1, // pressure ring at the slam

    /* --- light --- */
    lightColor: '#59c8ff',
    lightIntensity: 5,
    lightRadius: 9,
  },
};
