/**
 * Winter's Borrowed Breath — frost, zone cast. Data only, no imports.
 *
 * Velocity-to-armor, as a rule you can watch: the caster exhales a coiling
 * plume of frost breath down the aimed line. It lands as a gust that throws
 * every standing body out of the circle — and then winter *inhales*. The gust
 * curls into a cyclone that spins over the zone and decelerates, and every
 * metre-per-second it loses is paid out as armour: faceted ice lamellae peel
 * off the spinning breath and lock, row by row, into a scaled carapace over the
 * zone. Bodies inside are borrowed too — their flight is braked to a stop,
 * they hang rimed in the air, and the speed taken from them mints extra plates.
 * When the carapace is complete the breath is given back: the armour bursts
 * outward and every enemy inside is struck with a blow scaled by how much
 * armour the velocity bought.
 *
 * Every key below is a live editor control; all dimensions are resolved from
 * these each frame (records hold only dice and timestamps).
 */
export default {
  id: 'wintersBorrowedBreath',
  meta: {
    label: "Winter's Borrowed Breath",
    accent: '#9fd8ff',
    element: 'frost',
    cast: 'zone',
    hint: 'Frost — an exhaled gust becomes a cyclone whose lost speed is minted into an ice carapace, then returned as a blow',
    glyph:
      '<path d="M12 70C26 60 30 44 44 44S62 60 50 66 36 56 46 50"/><path d="M50 86C30 86 22 66 30 52M50 86C70 86 78 66 70 52M30 52L40 30 50 22 60 30 70 52"/><path d="M40 30L50 46 60 30M34 44L50 58 66 44"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 18, // max aim distance (m)
    minRange: 2, // min aim distance (m)
    speed: 16, // the breath's front runs at (m/s)
    cooldown: 6,
    castAnim: 'cast2',
    zoneRadius: 3.4, // the carapace, the cyclone and the floor are all sized from this (m)
    lifetime: 3.6, // nominal cast length, for the HUD (s)
    windup: 0.32, // the breath gathers at the hand before it leaves (s, × lifetime)

    /* --- gameplay: the exhale (impact) --- */
    hitImpulse: 7, // the gust throws standing enemies outward (m/s, × explosion intensity)
    hitLift: 5,
    hitSpin: 1.6,

    /* --- gameplay: velocity → armour (linger) --- */
    inhaleTime: 1.35, // the cyclone decelerates to a stop over (s, × lifetime) — the armour is minted over this
    holdTime: 0.5, // the complete carapace stands this long before it is given back (s, × lifetime)
    exitTime: 0.9, // the armour bursts, falls and dissolves over (s, × lifetime)
    breathArmor: 0.8, // share of the plates the cyclone's own spin pays for (0..1)
    velocityPerPlate: 1.4, // m/s of speed stolen from bodies that mints one more plate
    brake: 0.14, // fraction of a held body's velocity winter takes per 1/60 s
    holdHeight: 1.05, // held bodies are drawn to hang at (m)
    holdSwirl: 0.25, // held bodies orbit at (× the cyclone's tip speed)
    frostStain: 0.9, // how far held bodies are rimed (0..1)

    /* --- gameplay: the return (exit) --- */
    returnImpulse: 9, // base outward blow when the armour is given back (× (0.5 + armour), × explosion intensity)
    returnLift: 4.5,
    returnSpin: 2.6,

    /* --- light --- */
    lightColor: '#9fd8ff',
    lightIntensity: 6,
    lightRadius: 10,
    impactLight: 5, // light punch at the gust (× explosion intensity)
    returnLight: 8, // light punch when the armour bursts

    /* --- palette (four-stop frost ramp) --- */
    coreColor: '#f4fbff', // white-hot core
    tintColor: '#bfe8ff', // pale tint
    bodyColor: '#3f9fe6', // saturated body
    deepColor: '#0a2457', // dark deep

    /* --- 1 · the plume (travel) --- */
    plumeMouth: 0.14, // radius at the caster's hand (m)
    plumeHead: 0.42, // radius at the head of the breath (m)
    plumeHeight: 1.45, // the breath leaves the hand at (m)
    plumeTwist: 3.2, // turns of the coil along the plume
    plumeGlow: 0.95,
    plumeOpacity: 0.7,
    plumeSwallow: 0.45, // after the gust lands its tail is drawn in over (s)

    /* --- 2 · the cyclone --- */
    vortexSpin: 9, // angular speed at the gust (rad/s) — decelerates to 0 over inhaleTime
    vortexTurns: 2.25, // turns of the breath ribbon
    vortexRadius: 1.15, // ribbon starts this wide (× zone radius)…
    vortexDraw: 0.55, // …and is drawn in to this as it slows (× zone radius)
    vortexHeight: 1.25, // ribbon top (× carapace height)
    vortexWidth: 0.65, // ribbon band height (m)
    vortexGlow: 1.7,
    vortexOpacity: 0.85,
    vortexStreaks: 7, // flow streaks along the ribbon
    vortexNoise: 1, // fbm erosion of the breath

    /* --- 3 · the carapace (hero) --- */
    domeHeight: 0.78, // carapace height (× zone radius)
    plateOverlap: 1.32, // plate width over its share of the row (scales overlap above 1)
    plateLength: 1.45, // plate length (× row spacing)
    plateThickness: 0.11, // (m)
    plateFlight: 0.42, // a plate flies from the cyclone to its seat in (s)
    plateBreathe: 0.04, // the seated armour breathes by (× size) while it holds
    plateGlow: 0.5, // inner frost light
    plateFresnel: 2.2, // rim power
    plateSpecular: 1.4, // sun glint
    crackGlow: 2.6, // cracks spreading over the plates before the return
    plateDissolve: 0.65, // fraction of the exit spent dissolving
    plateColor: '#5aaee6', // ice body
    plateDeep: '#0e3166', // ice depth
    plateRim: '#e8f9ff', // rim and glints

    /* --- 4 · the return (shatter) --- */
    shatterSpeed: 6.5, // plates thrown outward (m/s)
    shatterLift: 3.2, // and up (m/s)
    shatterGravity: 9.8,
    shatterSpin: 7, // tumble (rad/s)

    /* --- 5 · the floor --- */
    fieldScale: 1.25, // rime field radius (× zone radius)
    fieldGrowTime: 0.5, // rime runs out to the edge in (s)
    fieldGlow: 1.3,
    fieldOpacity: 0.9,
    fieldCrystals: 1, // size of the frost plates (× noise frequency)
    fieldStreaks: 1, // breath streaks drawn round the floor
    fieldDissolve: 0.8, // fraction of the exit spent dissolving
    frostDecalLife: 3.4, // FROST decal at the gust (s)
    frostDecalIntensity: 1,
    crackDecalLife: 2.2, // CRACK decal when the armour bursts (s)
    crackDecalIntensity: 0.8,
    shockwaveWidth: 0.07,
    shockwaveIntensity: 1,

    /* --- 6 · particles --- */
    moteRate: 55, // frost motes drawn into the hand while it gathers (per s)
    moteSize: 0.07,
    vapourRate: 46, // cold vapour shed by the cyclone (per s, × its speed)
    vapourSize: 0.6,
    vapourLife: 1.1,
    vapourGlow: 0.55,
    needleRate: 70, // ice needles spiralling in (per s, × its speed)
    needleSize: 0.075,
    needleLife: 0.55,
    needleSpeed: 6,
    needleGlow: 1.6,
    chipCount: 72, // ice chips at the gust and the return
    chipSize: 0.13,
    chipLife: 1.3,
    chipSpeed: 6,
    colorBreathA: '#ffffff',
    colorBreathB: '#c6ecff',
    colorBreathC: '#4aa6e6',
    colorBreathD: '#0b2a5c',
    colorIceA: '#f2fbff',
    colorIceB: '#9fd6f5',
    colorIceC: '#3a86c4',
    colorIceD: '#0c2a52',

    /* --- 7 · bursts, shake, flash --- */
    burstReach: 1.05, // FROST shell grows to (× zone radius)
    burstIntensity: 0.9,
    burstLife: 0.6,
    burstOpacity: 0.7,
    burstFresnel: 2.5,
    burstSquash: 0.55,
    colorBurstA: '#ffffff',
    colorBurstB: '#9fd8ff',
    colorBurstC: '#1d4f96',
    impactShake: 0.2, // (× explosion intensity, × camera shake)
    returnShake: 0.34,
    shakeDecay: 6,
    shakeFrequency: 16,
    impactFlash: 0.16, // (× explosion intensity)
    returnFlash: 0.26,

    /* --- 8 · the lens --- */
    lensSwirl: 0.7, // cold swirl while the cyclone spins (× its speed, × global distortion)
    lensShock: 1.1, // pressure ring when the armour bursts
  },
};
