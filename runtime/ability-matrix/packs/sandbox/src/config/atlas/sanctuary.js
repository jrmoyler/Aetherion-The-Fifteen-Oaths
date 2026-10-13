/**
 * Dawn Sanctuary — Support — a mechanical lotus unfolds and sends healing waves through its petals.
 *
 * Ability Atlas data block, rebuilt for the sandbox engine. Plain data, no
 * imports, so `settings.js` can pull it in without a cycle.
 *
 * Every dimension below is read by `DawnSanctuaryAbility` every frame, so a
 * slider moved mid-cast reshapes a lotus that is already open.
 */
export default {
  id: 'sanctuary',
  meta: {
    label: "Dawn Sanctuary",
    accent: '#85ffc3',
    key: '',
    hint: "Support — a brass lotus blooms at the circle and pulses green-gold healing waves through a living floor; fallen bodies rise",
    cast: 'zone',
    glyph: `<path d="M50 80C40 68 40 48 50 28C60 48 60 68 50 80Z"/><path d="M50 80C35 78 23 64 20 48C34 50 46 62 50 80Z"/><path d="M50 80C65 78 77 64 80 48C66 50 54 62 50 80Z"/><path d="M22 86H78" stroke-dasharray="4 5"/><circle cx="50" cy="18" r="4"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 16, // maximum cast distance, metres
    minRange: 0, // 0: the sanctuary can bloom at the caster's own feet
    speed: 24, // how fast the bead of dawn light travels to the circle, metres/second
    lifetime: 6.0, // seconds the sanctuary stands open (× global lifetime)
    closeTime: 1.4, // seconds the lotus takes to fold shut and sink when it ends
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 3.2, // radius of the sanctuary floor, metres — what the indicator measures
    handHeight: 1.35, // metres above the floor the bead leaves the hand
    beadArc: 0.9, // metres the bead's path bows upward on its way
    beadSize: 0.32, // radius of the travelling bead's glow, metres

    /* --- what it does to bodies (it never kills) --- */
    revive: 1, // 0/1 — whether a healing wave stands a fallen body back up
    reviveDelay: 0.9, // seconds between a wave touching a body and it rising
    reviveColumn: 120, // light motes in the column over a body that rises

    /* ================================================================ */
    /* 1 · LOTUS — brass-and-light petals on a turning hub               */
    /* ================================================================ */

    /* --- layout --- */
    lotusScale: 0.62, // outer petal length, × zoneRadius
    lotusLift: 0.06, // metres the hinge ring sits off the floor once risen
    riseDepth: 0.9, // metres below the floor the lotus starts
    riseTime: 0.55, // seconds to rise out of the floor
    hubRadius: 0.22, // radius of the hinge ring, × lotus length
    layers: 3, // petal rings (1–3)
    petalsInner: 6, // petals in the inner ring
    petalsMid: 8, // ...the middle ring
    petalsOuter: 10, // ...the outer ring
    layerLength: 0.62, // inner ring's petal length, × the outer's (the middle is halfway)
    layerHeight: 0.08, // metres each inner ring's hinges sit above the next
    petalWidth: 0.34, // petal half-width at its widest, × its length
    petalTaper: 1.6, // how sharply the outline narrows to the tip
    petalThickness: 0.035, // metres thick
    petalCup: 0.22, // how much a petal dishes across its width
    petalCurl: 0.55, // radians a petal curls up along its length

    /* --- unfolding --- */
    openDelay: 0.2, // seconds after it rises before the first ring opens
    openTime: 0.9, // seconds for one ring to unfold
    openStagger: 0.28, // seconds between rings (outer opens first)
    closedPitch: 1.5, // radians above horizontal when shut (with the curl, the tips meet)
    openPitchOuter: 0.18, // radians above horizontal, open — outer ring
    openPitchInner: 0.95, // ...inner ring (the middle is halfway)
    spin: 0.18, // radians/second the whole lotus turns
    layerCounterSpin: 0.6, // fraction of the spin the middle ring turns against the others
    breathe: 0.05, // radians the petals sway while open
    breatheSpeed: 0.9, // sways per second
    waveLift: 0.16, // radians a petal lifts as a healing wave leaves it

    /* --- the metal and the light --- */
    segments: 5, // plates along a petal (whole number)
    segmentGap: 0.07, // gap between plates, fraction of a plate
    lightEvery: 2, // every Nth plate is a pane of light instead of brass
    trimWidth: 0.07, // width of the glowing inlay round each brass plate, × half-width
    ribWidth: 0.07, // width of the light channel down the midrib, × half-width
    metalReflect: 1.1, // how much sky the brass reflects
    metalGloss: 70, // specular tightness
    metalSpecular: 1.6, // specular strength
    filigree: 0.55, // depth of the engraved rings on the brass
    lightGlow: 2.6, // brightness of the light panes and inlays
    pulseGlow: 4.5, // extra glow as a wave passes along a petal
    colorBrass: '#c9953e',
    colorBrassDeep: '#4a2c10',
    colorBrassSpec: '#fff1c8',
    colorLight: '#a9ffd2',
    colorLightHot: '#fff6c4',

    /* --- the hub and the dawn orb above it --- */
    hubHeight: 0.35, // seed-pod height, × hub radius × 4
    podGlow: 3.2, // brightness of the seed pod's light holes
    podHoles: 7.0, // light holes across the pod
    orbHeight: 0.85, // metres above the hub the dawn orb hangs
    orbSize: 0.55, // orb glow radius, metres
    orbGlow: 2.4,
    orbRays: 9, // rays round the orb
    orbRayLength: 1.6, // ray reach, × orb size
    colorOrbCore: '#fffbe6',
    colorOrbRim: '#9dffcf',

    /* ================================================================ */
    /* 2 · FLOOR — the living sanctuary floor                            */
    /* ================================================================ */
    floorScale: 1.0, // floor radius, × zoneRadius
    spreadTime: 1.2, // seconds for the floor to spread to its edge
    spreadEdge: 0.35, // metres of bright, ragged growing edge
    latticeArms: 14, // petal cells round each ring of the lattice
    latticeTwist: 2.4, // how tightly the lattice spirals (log-polar)
    latticeLine: 0.06, // lattice stroke, fraction of a cell
    latticeFill: 0.12, // light inside each petal cell
    latticeGlow: 1.5,
    veinScale: 1.4, // noise frequency of the light veins
    veinSharp: 18.0, // how thin the veins are
    veinFlow: 0.45, // how fast light flows outward along them
    veinGlow: 1.8,
    rimWidth: 0.05, // metres — the boundary circle
    rimGlow: 2.2,
    rimTicks: 48, // ticks round the boundary
    floorOpacity: 0.9,
    floorHeight: 0.02, // metres the quad floats above the stage
    colorFloor: '#1fa86a',
    colorVein: '#e8ff9a',
    colorLattice: '#79ffc0',
    colorRim: '#d7ffb0',

    /* ================================================================ */
    /* 3 · WAVES — rings of green-gold light                              */
    /* ================================================================ */
    waveStart: 0.75, // seconds after it lands before the first wave
    waveInterval: 1.15, // seconds between waves
    waveCount: 5, // waves per cast (max 6)
    waveSpeed: 3.2, // metres/second a wave runs outward
    waveReach: 1.15, // how far a wave runs, × zoneRadius
    waveWidth: 0.45, // metres — the band each wave lights on the floor
    waveHeight: 0.9, // metres — the curtain of light at the front
    waveHeightFalloff: 0.55, // how much the curtain shrinks as it spreads
    waveGlow: 2.4,
    waveStreaks: 40, // vertical light streaks round the curtain
    waveOpacity: 0.8,
    waveShake: 0.06, // camera nudge per wave
    waveLight: 6.0, // light punch per wave
    waveFlash: 0.06, // screen flash per wave
    waveRipple: 1, // 0/1 — a RIPPLE decal under each wave
    colorWaveA: '#9effc6',
    colorWaveB: '#ffe58a',

    /* ================================================================ */
    /* 4 · MOTES, PETALS & SPARKLE                                         */
    /* ================================================================ */
    moteRate: 70, // motes / second rising from the floor while it stands
    moteSize: 0.07,
    moteLife: 2.2,
    moteRise: 0.9, // upward pull
    moteSpeed: 0.5,
    moteGlow: 1.6,
    moteTurbulence: 0.6,
    colorMoteA: '#ffffff',
    colorMoteB: '#c9ffd9',
    colorMoteC: '#ffe27a',
    colorMoteD: '#2a7a4a',
    petalShed: 14, // light petals shed from the lotus per wave
    petalSize: 0.12,
    petalLife: 2.4,
    colorShedA: '#fffbe0',
    colorShedB: '#b8ffd8',
    colorShedC: '#ffd977',
    colorShedD: '#3b7a50',
    sparkleCount: 90, // rising streaks along each wave ring
    sparkleSize: 0.05,
    sparkleLife: 0.9,
    sparkleSpeed: 2.6,
    travelSparkle: 120, // streaks / second off the bead in flight
    colorSparkleA: '#ffffff',
    colorSparkleB: '#fff2a8',
    colorSparkleC: '#8dffb9',
    colorSparkleD: '#1d5a3a',

    /* ================================================================ */
    /* 5 · HAZE & BLOOM — the gentle warp and the landing                  */
    /* ================================================================ */
    hazeStrength: 0.35, // warm shimmer over the lotus
    hazeReach: 1.3, // haze radius, × zoneRadius
    hazeScale: 2.2, // shimmer noise frequency
    hazeSpeed: 0.6,
    hazePulse: 1.2, // extra push as a wave leaves
    bloomShake: 0.12, // camera nudge as it lands
    bloomFlash: 0.12,
    bloomLight: 14,
    bloomDust: 1.0, // dust ring at landing, × zoneRadius
    colorFlash: '#d9ffe6',

    /* --- the light --- */
    lightColor: '#85ffc3',
    lightIntensity: 6,
    lightRadius: 9,
    lightHeight: 1.2, // metres above the floor the light hangs
    lightBreathe: 0.25 // how much it breathes with the waves
  }
};
