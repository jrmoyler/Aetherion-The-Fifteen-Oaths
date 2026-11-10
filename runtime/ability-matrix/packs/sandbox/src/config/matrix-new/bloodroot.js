/**
 * Bloodroot Thorns — Blood — racing roots that burst into a draining thorn thicket.
 *
 * Matrix New data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * Every metre, second and colour below is read by the ability *every frame*:
 * the roots' paths are evaluated in their vertex shader from these numbers, and
 * the thorns are placed along the very same paths on the CPU, so dragging
 * `rootWander` re-routes a thicket that is already standing.
 */
export default {
  id: 'bloodroot',
  meta: {
    label: "Bloodroot Thorns",
    accent: '#ff4060',
    key: 'B',
    hint: "Blood — roots race out across the floor, a thorn thicket bursts up along them and drains whoever stands in it",
    cast: 'zone',
    glyph: `<path d="M50 86V50L34 30M50 58L68 38M50 70L28 60"/><path d="M34 30l-4-8M68 38l6-6M28 60l-8 2"/><path d="M14 88C30 82 70 82 86 88"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 16, // maximum cast distance, metres
    minRange: 0, // closer than this and the cast is refused
    speed: 17, // how fast the runner crawls to the circle, metres/second
    lifetime: 3.0, // seconds from the seed arriving until the thicket starts to wither
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 6, // the circle the aim indicator measures out, metres
    fadeTime: 1.5, // seconds for the thorns to wither and the roots to darken away
    colorA: '#8b1a3a', // the burrowing seed's soil and droplets
    colorB: '#ff4060', // ... and its glow
    trailRate: 110, // soil and blood kicked up / second as the seed burrows
    trailSize: 0.13, // size of that spray

    /* --- the runner: the root that crawls from the caster to the circle --- */
    runnerThickness: 1.5, // × root thickness
    runnerWander: 0.55, // × root wander (it is pinned to land on the circle)
    runnerThorns: 22, // thorns that burst up in its wake (max 24)
    runnerThornHeight: 1.5, // metres
    runnerThornSpread: 0.7, // metres the wake thorns stand off the runner's line
    runnerThornDelay: 0.05, // seconds after the crawling tip passes
    runnerThornStart: 0.06, // first thorn along the runner, 0..1
    runnerThornEnd: 0.9, // last thorn along the runner, 0..1
    runnerCrackSpacing: 1.4, // metres between the cracks the tip tears in the floor
    runnerCrackRadius: 0.9, // metres — each crack (they stay for the cast)
    launchCrack: 1.1, // metres — the floor cracked at the caster's feet as it sets off
    launchDrops: 26, // blood thrown up there

    /* ================================================================ */
    /* 1 · THE ROOTS                                                     */
    /* ================================================================ */
    rootCount: 9, // primary roots racing out from the impact
    rootBranches: 2, // side branches per root
    rootReach: 1.0, // how far the longest root runs, × zone radius
    rootLengthJitter: 0.35, // how much shorter some roots are, 0..1
    rootGrowTime: 0.65, // seconds for the growth front to reach the end of the longest root
    rootGrowEase: 0.6, // 0 = constant speed, 1 = bursts out and slows
    rootWander: 0.75, // how much a root snakes off its bearing, radians at the tip
    rootWanderFreq: 3.2, // how many wiggles along a root
    rootThickness: 0.17, // radius at the heart, metres
    rootTaper: 0.75, // how thin a root gets at its end, 0..1
    rootEmbed: 0.35, // how far into the floor it lies, × its radius
    rootTipLength: 0.6, // metres behind the growth front over which a root narrows to its tip
    branchStart: 0.35, // where along a root its branches start, 0..1 (jittered)
    branchLength: 0.45, // branch length, × its parent's
    branchAngle: 0.75, // radians a branch splits off its parent
    branchThickness: 0.55, // branch radius, × its parent's
    branchDelay: 0.12, // seconds a branch waits after the front passes its fork

    /* --- the roots' look --- */
    rootBark: 1.0, // strength of the bark grain
    rootBarkScale: 9.0, // grain features per metre along the root
    rootGloss: 40, // sheen on the wet wood
    rootSpecular: 0.6,
    rootVeins: 3.2, // brightness of the crimson veins
    rootVeinWidth: 0.25, // how much of the bark the veins cover, 0..1
    rootPulseRate: 1.6, // heartbeats per second
    rootDrainAfter: 0.9, // seconds after the seed surfaces when the beats turn and flow inward — the drain
    rootPulseSpeed: 6.0, // metres/second each beat travels outward along the roots
    rootPulseWidth: 0.9, // metres a beat is long
    rootFrontGlow: 5.0, // the hot growth front
    rootRim: 1.2, // red rim on the wood
    rootDarken: 0.85, // how dark the wood goes as the thicket withers
    rootSink: 1.0, // how far the roots sink into the floor as they go, × their radius
    colorRootBark: '#1a0b08', // dark wood
    colorRootBarkLight: '#3b1a12', // the grain's highlights
    colorRootVein: '#ff1e3c', // pulsing veins
    colorRootFront: '#ff9aa6', // the growth front
    colorRootRim: '#c0182e',
    colorRootDead: '#070303', // withered

    /* ================================================================ */
    /* 2 · THE THORN THICKET                                             */
    /* ================================================================ */
    thornCount: 110, // vines in the thicket (max 144)
    thornHeart: 9, // of those, how many stand in the heart at the impact
    thornDelay: 0.18, // seconds after the root front passes before a vine bursts up
    thornJitter: 0.25, // random extra delay per vine, seconds
    thornSpacing: 0.12, // keep vines off the first × of a root (it is the heart's)
    thornHeight: 1.9, // metres, a vine at the heart
    thornEdgeHeight: 0.55, // height at a root's end, × thornHeight
    thornHeightJitter: 0.45,
    thornRadius: 0.14, // base radius, metres
    thornRadiusJitter: 0.35,
    thornLean: 0.55, // radians a vine leans out along its root
    thornLeanJitter: 0.35,
    thornSideOffset: 0.35, // metres a vine stands off its root's line, jittered
    thornRise: 0.22, // seconds to burst up
    thornOvershoot: 0.28, // how far past full height it punches
    thornSettle: 0.35, // seconds to settle back
    thornCurl: 0.55, // how much a vine hooks over (rebuild)
    thornBarbs: 7, // barbs down each vine (rebuild)
    thornBarbLength: 2.2, // barb length, × the vine's local radius (rebuild)
    thornWither: 0.6, // how much a vine shrivels as it dies, 0..1
    thornSink: 0.85, // how far it has sunk by the end, × its height
    thornThrob: 0.3, // how hard each vine swells as a drain beat passes through it
    thornSway: 0.07, // radians the vines writhe while they stand
    thornSwaySpeed: 2.4, // how fast they writhe

    /* --- the thorns' look --- */
    thornGloss: 120,
    thornSpecular: 1.2,
    thornEnv: 0.3, // sky reflection
    thornRim: 1.1, // red rim (kept low: thin vines are mostly rim)
    thornRimPower: 3.6,
    thornSap: 0.9, // glow welling in the barbs and the base
    thornBarkHeight: 0.28, // fraction of a vine that is still dark root bark
    thornVeins: 1.0, // darker veins through the glossy red
    thornVeinScale: 4.0,
    thornBacklight: 1.2, // light bleeding through thin parts against the sun
    colorThornBody: '#4a0610', // glossy dark red
    colorThornDeep: '#1c0206', // the clot in it
    colorThornRim: '#e8243f',
    colorThornSap: '#ff5a6e',
    colorThornSpec: '#ffd6dc',
    colorThornDead: '#140806', // withered

    /* ================================================================ */
    /* 3 · DROPLETS, MIST & DRAIN MOTES                                  */
    /* ================================================================ */
    dropPerThorn: 6, // droplets flung as each vine breaks the floor
    dropSpeed: 4.2,
    dropSize: 0.06,
    dropLifetime: 1.0,
    dropGravity: -12,
    dripRate: 35, // drips off standing vines / second
    colorDropA: '#ff5a6e',
    colorDropB: '#c0102a',
    colorDropC: '#6a0414',
    colorDropD: '#2a0208',
    mistRate: 40, // mist / second over the thicket
    mistSize: 1.4,
    mistLifetime: 2.2,
    mistRise: 0.12,
    mistOpacity: 0.32,
    mistHeight: 0.4, // metres
    colorMistA: '#6a0a1c',
    colorMistB: '#3e0610',
    colorMistC: '#22030a',
    colorMistD: '#0a0103',
    moteRate: 80, // motes / second streamed out of each body being drained
    moteSize: 0.2,
    moteLifetime: 0.85, // seconds a mote takes to reach the heart
    moteArc: 1.2, // metres a mote arcs up on its way
    moteJitter: 0.35, // metres of scatter at the body
    colorMoteA: '#ffe0e4',
    colorMoteB: '#ff4060',
    colorMoteC: '#c0102a',
    colorMoteD: '#3a0410',

    /* ================================================================ */
    /* 4 · THE DRAIN                                                     */
    /* ================================================================ */
    drainReach: 0.9, // bodies inside × zone radius are drained
    drainDelay: 0.5, // seconds after the first vines before the drain takes hold
    drainTime: 1.3, // seconds of draining before a body falls
    stain: 1.0, // how fast it is stained, × 1/drainTime
    rot: 0.45, // fraction of a husk eaten per second once it has fallen
    hitImpulse: 0.6, // m/s — a drained body folds, it is not thrown
    hitLift: 0.3,
    hitSpin: 0.4,
    look: {
      color: '#2a0508', // the flesh, drained
      rimColor: '#ff3050',
      rimEmissive: 2.0,
      edgeColor: '#ff8a9a',
      edgeEmissive: 4.0,
      edgeWidth: 0.05
    },

    /* ================================================================ */
    /* 5 · BEATS                                                         */
    /* ================================================================ */
    impactShake: 0.35,
    impactFlash: 0.25,
    thornShake: 0.25, // knock when the thicket bursts up
    drainPulse: 6, // light punch every time a body falls
    colorFlash: '#ff2040',
    burstRadius: 2.6,
    burstLife: 0.6,
    colorBurstA: '#5a0614',
    colorBurstB: '#c0102a',
    colorBurstC: '#ff7080',
    crackRadius: 1.1, // the cracked floor at the impact, × zone radius
    fieldReach: 1.12, // × the longest root: how far the soaked floor can run
    fieldVeins: 0.55, // capillaries in the soak
    fieldSheen: 1.0, // wet highlight on it
    fieldOpacity: 0.85,
    colorFieldDeep: '#160206', // clotted soil
    stainLife: 8,
    stainIntensity: 0.7,
    colorStain: '#1a0306',

    /* --- light --- */
    lightColor: '#ff4060',
    lightIntensity: 6,
    lightRadius: 9,
    lightHeight: 1.4, // metres the light hangs over the heart
    lightTravelHeight: 0.9 // metres the light rides over the crawling tip
  }
};
