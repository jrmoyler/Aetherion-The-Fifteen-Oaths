/**
 * Skyhook Draft — wind, line cast. Data only, no imports.
 *
 * The wind's "navigable draft": a current with a heading and a destination.
 * Air coils at the hand into a small hook of wind, which is thrown and rides
 * the front of a draft laid along the cast line — a braid of streamlines just
 * off the floor. Where the line ends the hook plants and *erupts* into the
 * Skyhook: a four-metre shepherd's crook of storm air, its curl bent back over
 * the lane. Everything caught in the lane is knocked off its feet downstream,
 * and the draft then *navigates* it — draws every downed body to the lane's
 * centreline, conveys it to the hook and hoists it up the stem onto the curl,
 * where it hangs while the hook climbs into the sky. On the exit the hook
 * unravels from the floor up and lets go.
 *
 * Every key below is a live editor control. Every dimension is read every
 * frame: the hook stands at the end of the line however long the line is, its
 * curl radius is derived from the lane width (so the tip always hangs over
 * the lane), and the carried bodies are delivered to the tip the shader draws.
 */
export default {
  id: 'skyhookDraft',
  meta: {
    label: 'Skyhook Draft',
    accent: '#bfe3ff',
    element: 'wind',
    cast: 'line',
    hint: 'Wind — a draft runs down the line, plants a hook of storm air, and hoists everything it carries up onto the curl',
    glyph:
      '<path d="M8 84C30 80 46 74 64 70"/><path d="M8 70C28 68 44 64 60 62"/><path d="M70 90V34A14 14 0 0 0 42 34V44"/><path d="M42 44L36 38M42 44L48 38"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 16, // maximum reach of the draft (m)
    minRange: 3, // closer than this the cast is refused
    speed: 24, // the draft front runs down the line at (m/s)
    cooldown: 6,
    castAnim: 'cast2',
    lifetime: 3.2, // nominal screen time, for the HUD (s)

    /* --- timing (all × global lifetime) --- */
    windup: 0.32, // the hook coils at the hand before it is thrown (s)
    hookRise: 0.28, // the hook erupts out of the floor over (s)
    draftTime: 2.1, // the draft carries for (s) — the linger
    exitTime: 0.75, // the hook unravels over (s)

    /* --- the lane (gameplay) --- */
    laneWidth: 2.6, // full width of the draft lane (m); also sets the hook's curl
    hitImpulse: 7, // knock-down along the lane (m/s, × explosion intensity)
    hitLift: 3, // knock-down lift
    hitSpin: 1.2, // knock-down tumble
    maxCaught: 8, // bodies one draft can catch (≤ 8)
    draftSpeed: 4.2, // the draft conveys bodies downstream at (m/s)
    draftConverge: 2.2, // how hard it draws bodies onto the centreline (1/s)
    draftRise: 1.2, // how high the draft holds a carried body over the lane (m)
    draftGrab: 5, // how firmly the current takes hold (1/s)
    draftBuoyancy: 0.85, // share of a carried body's weight the draft bears
    hoistPull: 3.5, // spring pulling a body onto the hook's curl (1/s)
    hoistSpeed: 7, // fastest a body climbs the stem (m/s)
    catchRadius: 1.6, // a body this close to the hook stem is hoisted (m)

    /* --- 1 · the skyhook (hero) --- */
    hookHeight: 3.0, // stem height to the top of the curl (m)
    hookCurl: 0.36, // curl radius (× lane width) — with hookYaw the barb hangs over the lane's edge
    hookDrop: 0.7, // the barb drops this far below the curl (m)
    hookThickness: 0.5, // tube radius at mid-stem (m)
    hookTaper: 0.45, // tip radius (× thickness)
    hookFlare: 1.1, // the stem flares into the floor this wide (m)
    hookHoist: 0.6, // the whole hook climbs this far into the sky over the linger (m)
    hookYaw: 0.8, // the curl's plane is turned off the lane by (rad), so it reads as a crook from behind the caster
    hookSway: 0.35, // the curl swings across the lane (rad)
    hookSwayRate: 1.6, // swing rate (rad/s)
    seedSize: 0.16, // the hook at the hand (× full size)
    handHeight: 1.25, // where the hook coils at the caster (m)
    streamTwist: 3.5, // streamlines wind round the tube (turns along it)
    streamSpeed: 2.6, // streamlines flow up the tube at
    streamCount: 7, // streamlines round the tube
    coreGlow: 2.2, // brightness of the streamline core
    sheathOpacity: 0.85, // the storm-dust sheath round the core
    sheathScale: 1.45, // sheath radius (× tube radius)
    hookFresnel: 2.2, // rim sharpness

    /* --- 2 · the draft (streamline braid) --- */
    ribbonCount: 9, // streamlines in the braid (≤ 12)
    ribbonWidth: 0.2, // (m)
    ribbonHeight: 0.35, // the braid rides this high (m)
    ribbonLayer: 0.55, // the braid's height spread (m)
    ribbonWave: 0.22, // wave amplitude (m)
    ribbonWaveLength: 3.2, // (m)
    ribbonFlow: 6, // dashes flow downstream at (m/s)
    ribbonDash: 2.4, // dash spacing (m)
    ribbonGlow: 1.6,
    ribbonClimb: 0.75, // how far up the stem the braid climbs (× hook height)

    /* --- 3 · the scour (floor) --- */
    scourGlow: 0.55, // combed streaks
    scourDark: 0.85, // how dark the scoured groove is
    scourStreaks: 1, // streak density
    scourFlow: 1.6, // streaks crawl downstream at (m/s)
    vortexGlow: 1.4, // the swirl at the hook's foot
    vortexTwist: 3, // its arms curl this tightly
    scourDissolve: 0.85, // fraction of the exit spent dissolving

    /* --- 4 · torn plates (solid floor) --- */
    plateCount: 16, // floor plates torn up round the hook (≤ 18)
    plateSize: 0.85, // (m)
    plateRing: 1.7, // ring radius round the stem (× flare)
    plateHeave: 0.55, // heaved up at the eruption (m)
    plateClimb: 1.6, // then drawn up the draft over the linger (m)
    plateOrbit: 0.9, // orbit round the stem (rad/s)
    plateTumble: 1.4, // (rad/s)
    plateColor: '#4b5866',
    plateRoughness: 0.88,
    plateMetalness: 0.05,

    /* --- light --- */
    lightColor: '#bfe3ff',
    lightIntensity: 4,
    lightRadius: 10,
    eruptLight: 7, // light punch at the eruption (× explosion intensity)

    /* --- palette: the four-stop ramp --- */
    coreColor: '#ffffff', // white-hot
    tintColor: '#cfeaff', // pale sky
    bodyColor: '#4f9ae6', // saturated sky blue
    deepColor: '#13233f', // storm navy

    /* --- 5 · particles --- */
    gatherRate: 70, // streaks drawn into the hand while it coils (per s)
    gatherSize: 0.07,
    frontDust: 40, // dust kicked up behind the travelling front (per s)
    dustRate: 34, // dust dragged down the lane during the draft (per s)
    dustSize: 0.8,
    dustLife: 1.3,
    dustOpacity: 0.5,
    colorDustA: '#d9e6f2',
    colorDustB: '#93a6b8',
    colorDustC: '#56687c',
    colorDustD: '#1c2636',
    streakRate: 46, // streaks streaming down the lane and up the stem (per s)
    streakSize: 0.07,
    streakLife: 0.7,
    streakSpeed: 9,
    streakGlow: 1.6,
    colorStreakA: '#ffffff',
    colorStreakB: '#cfeaff',
    colorStreakC: '#4f9ae6',
    colorStreakD: '#13233f',
    debrisCount: 30, // grit thrown up at the eruption
    debrisRate: 14, // grit drawn up the stem during the draft (per s)
    debrisSize: 0.09,
    debrisSpeed: 6,

    /* --- 6 · the eruption --- */
    burstRadius: 1.2, // AIR shell grows to (× flare)
    burstLife: 0.5,
    burstIntensity: 1,
    burstOpacity: 0.6,
    burstFresnel: 2.4,
    burstSquash: 0.7,
    dustRingRadius: 2.4, // DUSTRING decal (× flare)
    shockRadius: 2.2, // SHOCKWAVE decal (× flare)
    decalLife: 1.4,
    eruptShake: 0.3, // (× explosion intensity; the shake system applies global camera shake)
    shakeDecay: 6,
    shakeFrequency: 16,
    eruptFlash: 0.14, // (× explosion intensity)

    /* --- 7 · the lens --- */
    lensStrength: 0.5, // the draft's shimmer streaming downstream (× global distortion)
    lensShock: 1, // pressure ring at the eruption
  },
};
