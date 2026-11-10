/**
 * Vacuum Genesis — cosmic, zone cast. Data only, no imports.
 *
 * A pocket of true vacuum. A dark seed is lobbed at the circle; where it lands
 * a bubble of *nothing* inflates over the floor — an iridescent skin with a
 * starless hole behind it — and the air is thrown out of it in one ring of
 * dust. Everything standing inside loses its footing and floats, weightless,
 * turning slowly round the middle. Then the vacuum *makes* something: a cosmic
 * web crawls up the skin from the floor, knots of new rock condense where its
 * threads meet, and when the web closes over the crown the shell is born and
 * cracks outward — the plates and the floating bodies are thrown clear.
 *
 * Every key below is a live editor control. Dimensions are resolved from
 * `zoneRadius` every frame, so dragging it mid-cast keeps the pocket, the web,
 * the plates and the held bodies on the same circle.
 */
export default {
  id: 'vacuumGenesis',
  meta: {
    label: 'Vacuum Genesis',
    accent: '#a77bff',
    element: 'cosmic',
    cast: 'zone',
    hint: 'Cosmic — a bubble of true vacuum swallows the circle, floats what stands in it, then crystallises into new rock and bursts',
    glyph:
      '<path d="M12 78C12 40 30 16 50 16S88 40 88 78"/><path d="M8 80Q50 92 92 80"/><path d="M30 66L41 42L58 36L71 58L52 70Z"/><path d="M41 42L52 70M58 36L52 70"/><circle cx="50" cy="16" r="4"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 17, // max cast distance (m) — a mid-range zone
    minRange: 2,
    speed: 22, // the seed flies at (m/s, × global speed)
    cooldown: 6,
    castAnim: 'cast2',
    lifetime: 3, // nominal cast length for the HUD (s)
    zoneRadius: 3.4, // the pocket's radius on the floor (m) — everything is sized from it

    /* --- timing (× global lifetime) --- */
    inflateTime: 0.32, // the bubble blows out to full size over (s)
    holdTime: 1.75, // bodies float and the web grows for (s) — then the shell is born
    exitTime: 0.85, // the shell cracks outward and the skin dissolves over (s)

    /* --- gameplay --- */
    maxTargets: 8, // bodies one pocket can hold
    birthDamage: 1, // UCSM damage when the air leaves
    ruptureDamage: 1, // UCSM damage when the shell is born
    holdLift: 3.2, // lift that takes a body off its feet at the birth (m/s)
    holdImpulse: 1.2, // and the small outward shove with it
    floatHeight: 1.25, // held bodies drift up to this height (m)
    floatGrab: 0.12, // how hard the pocket steers a held body each frame (0..1)
    floatOrbit: 0.45, // held bodies turn round the middle at (rad/s)
    floatBuoyancy: 1, // share of a held body's weight the vacuum carries (0..1)
    hitImpulse: 14, // outward throw at the birth of the shell (× explosion intensity)
    hitLift: 6,
    hitSpin: 3,

    /* --- light --- */
    lightColor: '#b48cff',
    lightIntensity: 4.5,
    lightRadius: 10,
    birthLight: 7, // light punch when the pocket opens (× explosion intensity)
    ruptureLight: 9, // and when the shell is born

    /* --- the four-stop ramp (every layer is coloured from it) --- */
    colorCore: '#f6efff', // white-hot core (HDR only here)
    colorTint: '#c9a9ff', // pale tint
    colorBody: '#7b3dff', // saturated body
    colorDeep: '#12082c', // dark deep — the vacuum itself
    colorFilm: '#6fe6ff', // thin-film sheen that slides across the skin

    /* --- 1 · the seed (travel) --- */
    seedSize: 0.34, // seed radius (m)
    seedArc: 2.2, // the lob's apex above the floor (m)
    seedSpin: 7, // seed tumble (rad/s)
    seedGlow: 2.2,
    seedHalo: 1.4, // accretion halo radius (× seed size × 3)
    seedTrailRate: 90, // trail streaks per second
    seedTrailSize: 0.08,

    /* --- 2 · the skin (hero) --- */
    domeHeight: 0.92, // dome height (× zoneRadius)
    lipCurl: 0.16, // the floor lip curls out this far (× zoneRadius)
    skinGlow: 1.6,
    skinOpacity: 0.85,
    skinFresnel: 2.6, // rim falloff power
    filmStrength: 0.8, // thin-film iridescence
    filmScale: 2.2, // thickness noise frequency
    inflateOvershoot: 1.6, // the bubble overshoots and rings back (outBack strength)
    wobble: 0.08, // standing-wave ripple on the skin (× radius)
    wobbleModes: 5, // ripple lobes round the dome
    wobbleSpeed: 3.2,
    wobbleDecay: 1.4, // the ripple rings down over the hold (1/s)
    breath: 0.025, // slow breathing of the bubble through the hold (× radius)
    dissolveEdge: 0.08, // width of the burning edge as the skin dissolves

    /* --- 3 · the void (interior) --- */
    voidDarkness: 0.62, // how much light the pocket swallows (0..1)
    voidStars: 1.4, // newborn stars inside the void
    voidStarDensity: 26, // star grid frequency
    nebulaStrength: 0.7, // violet nebula drifting inside

    /* --- 4 · the cosmic web --- */
    webReach: 1, // share of the threads that grow (0..1; the rest stay dark)
    webThickness: 1, // thread thickness (× base 3.5 cm × radius)
    webGlow: 2.4,
    webGrowSpan: 0.35, // how long one thread takes to cross (× hold)
    webTipHeat: 2.2, // white-hot growing tip
    webPulse: 1.6, // pulses running along finished threads
    knotSize: 0.08, // knot radius (× radius)
    knotGlow: 2.6,

    /* --- 5 · the new rock --- */
    plateCount: 30, // shell plates condensed at the knots (≤ 40)
    plateSize: 0.32, // plate size (× radius)
    plateThrow: 9, // outward speed when the shell is born (m/s)
    plateLift: 5, // upward speed (m/s)
    plateGravity: 14, // fall (m/s²)
    plateSpin: 6, // tumble (rad/s)
    rockColor: '#2a2140',
    rockRoughness: 0.55,
    rockMetalness: 0.35,
    rockVeinGlow: 0.45, // violet glow in the plates' seams

    /* --- 6 · the floor --- */
    floorRadius: 1.3, // stripped floor reaches (× zoneRadius)
    floorGlow: 1.4,
    floorDarkness: 0.7, // how dark the stripped floor goes
    floorStreaks: 1, // radial streaks where the air was dragged out
    floorRim: 1.6, // the bright tear at the lip
    decalLife: 2.6, // crack and scorch decals last (s)
    crackIntensity: 1.1,
    shockwaveWidth: 0.07,
    shockwaveIntensity: 1.2,
    dustRingIntensity: 0.9,

    /* --- 7 · particles --- */
    dustCount: 54, // dust thrown out of the pocket at the birth
    dustSize: 0.55,
    dustLife: 1.2,
    dustSpeed: 4,
    moteRate: 40, // newborn star motes rising inside the pocket (per second)
    moteSize: 0.09,
    moteLife: 1.4,
    sparkRate: 60, // sparks shed by the growing threads (per second)
    sparkSize: 0.06,
    sparkLife: 0.6,
    chipCount: 90, // rock chips thrown at the birth of the shell
    chipSize: 0.13,
    chipLife: 1.1,
    chipSpeed: 8,
    particleGlow: 1.6,

    /* --- 8 · the bursts --- */
    birthBurstReach: 1.25, // air shell thrown out at the birth (× radius)
    birthBurstLife: 0.55,
    ruptureBurstReach: 1.3, // shell at the rupture (× radius)
    ruptureBurstLife: 0.7,
    burstIntensity: 1,
    burstOpacity: 0.45,
    burstFresnel: 2.4,

    /* --- 9 · the lens (distortion) --- */
    lensStrength: 0.7, // the skin bends the world behind it (× global distortion)
    lensShock: 1.2, // pressure ring at the birth and the rupture

    /* --- 10 · the world answers --- */
    birthShake: 0.22, // (× explosion intensity, × camera shake)
    ruptureShake: 0.35,
    shakeDecay: 6,
    shakeFrequency: 16,
    birthFlash: 0.14, // (× explosion intensity)
    ruptureFlash: 0.2,
  },
};
