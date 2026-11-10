/**
 * Toxin Evolution — Poison — a zone cast. A seed vessel arcs out to the
 * circle and infects the nearest enemy in it; the infection then evolves
 * through three generations — each a separate, escalating poison strike —
 * for as long as the host stays within reach.
 *
 * Expansion candidate data block: presentation (`meta`) and the live settings
 * the ability and its editor folder read. Plain data, no imports.
 *
 * Gameplay keys (`zoneRadius`, `stagePeriod`, `stageDamage`, `maxStages`,
 * `tetherRange`, the `hit*` response) drive the combat bridge and are pinned
 * by tests; everything else is presentation, resolved every frame, so any
 * slider re-shapes an infection already growing.
 */
export default {
  id: 'exp-toxin-evolution',
  uid: 'matrix-expansion/toxin-evolution',
  meta: {
    label: 'Toxin Evolution',
    element: 'poison',
    accent: '#b5f15a',
    cast: 'zone',
    key: '',
    hint: 'Poison — infect the nearest enemy in the circle; the toxin evolves through three escalating strikes while the host stays within reach',
    glyph: '<path d="M50 12C34 31 22 42 22 60A28 28 0 0 0 78 60C78 42 66 31 50 12Z"/><path d="M32 59Q50 38 68 59M35 68Q50 52 65 68"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 18, // metres/second the seed vessel flies
    cooldown: 8, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    lifetime: 5.5, // seconds the infection lives (× global lifetime)
    fade: 1, // seconds the withdrawal takes after that (× global lifetime)

    /* --- the infection (gameplay; read by the combat bridge) --- */
    zoneRadius: 3.5, // radius searched for the nearest host, metres
    stagePeriod: 1.2, // seconds between generations (min 0.3)
    stageDamage: 0.25, // first strike's damage; each later stage × (1 + 0.4 × stage)
    maxStages: 3, // generations (1..3)
    tetherRange: 8, // the host escapes if it gets this far from the circle
    hitImpulse: 2.5, // knockback per strike, scaled by global explosion intensity
    hitLift: 1.2, // upward share of that knockback
    hitSpin: 0.6, // tumble imparted

    /* --- light (rides the vessel, then the host) --- */
    lightColor: '#a6dc55',
    lightIntensity: 3.5,
    lightRadius: 8,
    lightPunch: 3, // extra intensity punched in per stage (× stage)

    /* --- palette --- */
    toxinColor: '#9be641', // the body of the toxin
    coreColor: '#e4ff93', // its hot core, veins and growing tips
    stainColor: '#0e1a08', // the dark wet stain it leaves on the floor
    deepColor: '#0b1806', // the deep stop: flesh in shadow, roots, the rind of the vessel

    /* ================================================================ */
    /* 1 · THE SEED VESSEL — travel                                      */
    /* ================================================================ */
    travelScale: 1.8, // size of the flying pod (≈ 0.9 m tall at 1.8, so it reads at 8 m)
    travelHeight: 0.7, // metres it flies off the floor
    travelSpin: 2, // radians/second it turns as it flies
    travelDensity: 1.2, // spore bubbles shed while it flies, × particleRate
    travelArc: 1, // metres the lob rises at mid-flight
    travelDrips: 1.5, // venom drips shed in flight, × dripRate
    vesselScale: 1, // size of the per-stage satellite vessels
    vesselGlow: 1.4, // emissive gain of every vessel
    trailRadius: 0.07, // metres, the venom stream drawn behind the vessel
    trailGlow: 1.0, // its hot thread
    trailFlow: 1.5, // beads running down it toward the host
    trailSag: 0.35, // seconds it takes to fall to the floor once the vessel bursts
    trailLinger: 1.8, // seconds it takes to dry away from the caster's end

    /* ================================================================ */
    /* 2 · THE MEMBRANE — grown over the host                            */
    /* ================================================================ */
    formTime: 0.35, // seconds the membrane takes to rise out of the floor on arrival
    membraneScale: 1.35, // girth of the membrane, × the host (the mass grown over it)
    membraneStageGrowth: 0.16, // extra girth per accepted generation
    dormantTime: 1.4, // no host in the circle: seconds the dormant colony gropes before it withers
    membraneGlow: 0.25, // emissive gain
    membraneFresnel: 1.6, // density at the silhouette
    veinScale: 1, // vein noise scale
    veinSharp: 16, // vein sharpness (threads vs wash)
    cystGrowth: 1, // how far the cysts swell out at later stages
    bloomStrength: 0.3, // how hard each accepted stage throbs everything
    bloomTime: 0.55, // seconds that throb lasts
    releaseDuration: 0.55, // seconds the infection takes to wither when the host escapes
    softFade: 0.25, // metres over which it fades where it meets the host/floor
    membraneOpacity: 0.62, // how dense the dark sac is (the host shows through as a shadow)
    membraneBodyTone: 0.08, // how far its lit flesh climbs from the deep stop toward the body colour

    /* ================================================================ */
    /* 2b · THE BLIGHT TENDRILS — the hero, at zone scale                */
    /* ================================================================ */
    tendrilCount: 6, // tendrils that erupt on arrival
    tendrilPerStage: 2, // more erupt with every accepted generation (max 14 total)
    tendrilRing: 0.4, // root ring radius, × zoneRadius (1.4 m at the default circle)
    tendrilHeight: 2.6, // arc length, metres
    tendrilStageGrowth: 0.1, // extra length per generation (× height)
    tendrilThick: 0.21, // root radius, metres
    tendrilCurl: 1.9, // radians each arc turns back over the host at full growth
    tendrilClose: 0.3, // extra closing of the claw across the linger (× curl)
    tendrilLean: 0.4, // radians the roots lean outward before curling in
    tendrilGrowTime: 0.45, // seconds a tendril takes to erupt
    tendrilStagger: 0.05, // seconds between neighbours erupting
    tendrilWrithe: 1, // writhing through the linger (× global turbulence)
    tendrilVeinGlow: 0.75, // emissive gain of the veins and their running pulses
    tendrilVeinSpeed: 0.8, // pulses per second running up the veins
    tendrilPustuleGlow: 1.6, // emissive gain of the ripening pustules and tips
    tendrilSpecular: 0.3, // wet highlight
    tendrilRim: 0.35, // thin bile rim light at the silhouette
    tendrilBodyTone: 0.03, // lit flesh, × body colour, over the deep stop (low = near-black bile)
    tendrilVeinBase: 0.04, // veins' resting glow between the pulses running up them

    /* ================================================================ */
    /* 3 · THE COILS — one per generation                                */
    /* ================================================================ */
    coilGrowTime: 0.45, // seconds a coil takes to wind up the host
    coilSpread: 1, // radius multiplier
    coilTwistSpeed: 1, // how fast they turn
    coilTaper: 1, // 0 blunt → 1 pointed ends
    coilGlow: 1.0,

    /* ================================================================ */
    /* 4 · THE CROWNS — the contact beat of each generation              */
    /* ================================================================ */
    stageCueScale: 1.15, // crown size (0.25..3)
    stageCueDuration: 0.8, // seconds each crown takes to unfurl and decay
    stageCueGlow: 0.6, // crown brightness and burst/decal intensity (0..2)

    /* ================================================================ */
    /* 5 · THE POOL — the stain on the floor                             */
    /* ================================================================ */
    poolRadius: 1.3, // stain radius before any stage (× 1.25), metres
    poolGrowth: 0.2, // extra metres per stage
    poolSpreadTime: 0.6, // seconds it takes to creep out after arrival
    poolCells: 4, // cell density of the wet toxin
    poolGlow: 1.1, // emissive gain of the cell seams
    poolDarken: 0.9, // how much it darkens the floor between seams
    poolEdgeGlow: 0.2, // glow riding the stain's creeping front

    /* ================================================================ */
    /* 5b · THE BLIGHT — the search circle rotting (telegraph + floor)   */
    /* ================================================================ */
    blightScale: 1, // radius, × zoneRadius (the circle a host is searched in)
    blightTelegraph: 0.6, // how far the veins have crept in from the rim when the vessel lands, 0..1
    blightVeins: 9, // veins round the rim
    blightSharp: 7, // vein thinness (higher = finer threads)
    blightGlow: 1.2, // emissive gain of the veins and their pulses
    blightDarken: 0.88, // how dark the rot stains the floor between veins
    blightFill: 0.8, // how solidly the rot fills the grown circle (not just its rim)
    blightRimGlow: 0.15, // the search circle's lit edge

    /* ================================================================ */
    /* 6 · THE SPORES — orbiting the host                                */
    /* ================================================================ */
    sporeOrbit: 0.7, // orbit radius, metres
    sporeSpeed: 0.8, // radians/second round the host
    sporeRise: 0.45, // metres/second they climb before wrapping
    sporeSize: 1, // size multiplier
    sporeGlow: 1.0,

    /* ================================================================ */
    /* 7 · PARTICLES                                                     */
    /* ================================================================ */
    particleRate: 22, // ambient spore bubbles/second round the host
    particleSize: 0.1, // their size
    dripRate: 10, // venom drips/second off the vessel and the membrane
    dripSize: 0.06,
    dripLife: 0.9,
    dripGravity: 6,
    dripColorA: '#f2ffc0', // birth
    dripColorB: '#b5f15a', // early
    dripColorC: '#4f8a25', // late
    dripColorD: '#1d3510', // death
    miasmaRate: 8, // low fumes/second crawling off the pool
    miasmaSize: 0.7,
    miasmaLife: 2.2,
    miasmaOpacity: 0.35,
    miasmaRise: 0.25, // metres/second the fumes lift
    miasmaColorA: '#6f9a3a',
    miasmaColorB: '#3f6326',
    miasmaColorC: '#253d17',
    miasmaColorD: '#0f190a',

    /* ================================================================ */
    /* 8 · DISTORTION — fumes over the host                              */
    /* ================================================================ */
    hazeStrength: 0.5, // screen-space warp (grows with stage)
    hazeScale: 1.6, // noise scale
    hazeSpeed: 0.9, // how fast the fumes rise
    hazeWidth: 1.6, // billboard width, metres
    hazeHeight: 2.6, // billboard height, metres

    /* ================================================================ */
    /* 9 · THE BEAT — on every accepted stage                            */
    /* ================================================================ */
    impactShake: 0.08, // camera trauma at the first stage, more each stage
    impactFlash: 0.05 // screen flash, more each stage (× global explosion intensity)
  }
};
