/**
 * Miasma Spit — Poison — a lobbed glob of corrosive bile that splashes into a
 * bubbling, floor-eating sludge pool.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so `settings.js`
 * can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `MiasmaSpitAbility`, so
 * dragging any of it in the editor re-shapes a glob already in the air or a
 * pool already on the floor.
 */
export default {
  id: 'miasma',
  meta: {
    label: "Miasma Spit",
    accent: '#9dff5a',
    key: '',
    element: 'poison',
    hint: "Poison — a gob of corrosive bile arcs down the line and splashes into a bubbling sludge that melts what it catches",
    cast: 'line',
    glyph: `<path d="M22 70C30 40 52 26 70 30"/><path d="M62 22C74 18 84 26 82 38C80 48 68 50 62 44C56 38 54 26 62 22Z"/><path d="M48 46L46 54"/><path d="M38 56L36 62"/><path d="M14 82C26 74 40 76 50 82C60 88 76 88 88 80"/><path d="M30 88C40 92 58 93 70 89"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 17, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 20, // how fast the glob flies down the line, metres/second
    lifetime: 2.6, // seconds the pool lies bubbling before it starts to evaporate
    cooldown: 0.5, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#9dff5a',
    lightIntensity: 6, // the bile's steady glow
    lightRadius: 8,
    lightBubble: 0.35, // 0..1 how much it gutters as the bubbles pop
    lightHeight: 0.8, // metres over the pool the light sits once it has landed

    /* ================================================================ */
    /* 1 · THE GLOB                                                      */
    /* ================================================================ */

    /* --- the throw (metres / seconds) --- */
    windup: 0.22, // seconds the glob swells at the hand before it is spat
    handForward: 0.55, // metres in front of the caster it forms
    handHeight: 1.45, // metres up
    handSide: 0.15, // metres to the right
    arcHeight: 2.4, // metres the lob rises above the straight line, at its top
    landHeight: 0.25, // metres the glob's centre is over the floor when it lands

    /* --- silhouette --- */
    globRadius: 0.34, // metres
    globWobble: 0.12, // surface noise, × radius
    globWobbleScale: 1.8, // noise features round the blob
    globWobbleSpeed: 6, // how fast it churns
    globLobes: 0.22, // crawling fused lobes, × radius — the metaball look
    globStretch: 0.45, // elongation along its flight at full speed
    globDrip: 0.9, // how far the hanging drip is pulled out of its tail, × radius
    dripNeck: 0.7, // 0..1 how thin the drip's neck pinches
    blobCount: 3, // smaller blobs strung out behind it (max 5)
    blobSize: 0.5, // the first one's size, × the glob's radius
    blobGap: 0.42, // metres between them along the arc
    blobWobble: 0.6, // how much of the glob's wobble they keep

    /* --- shading --- */
    globOpacity: 0.86, // body opacity at its thickest
    globMurk: 0.92, // 0..1 dark bile swirled through it
    globSwirlScale: 1.9, // swirl bands across it
    globFlowSpeed: 1.4, // how fast they turn
    globInnerGlow: 0.55, // the glow from inside, where it is thick (bloom > 1)
    globRimGlow: 0.85, // the toxic rim
    globRimPower: 2.4, // how tight the rim is
    globSpecular: 1.1, // the wet highlight
    globGloss: 70, // how tight it is
    globBubbles: 0.9, // gas caught inside it
    globBubbleScale: 4.5, // how many
    colorA: '#4f9a14', // body: saturated bile
    colorB: '#d4f590', // tint: the rim
    colorDeep: '#0b1a03', // deep: near-black bile swirling through it
    colorGlow: '#a6f03a', // core: the toxic glow shared by every layer

    /* --- drips shed in flight (they hiss where they land) --- */
    dripRate: 26, // per second while it flies
    dripSize: 0.09, // droplet size
    dripGravity: 14, // m/s² they fall under (drops are ballistic, no drag)
    dripInherit: 0.35, // share of the glob's velocity they keep
    dripSpread: 1.2, // m/s of random kick
    colorDropA: '#d9ff8a',
    colorDropB: '#9dff5a',
    colorDropC: '#5fbf2a',
    colorDropD: '#2f6a12',

    /* --- hiss marks --- */
    hissSize: 0.22, // metres, a drip's burn on the floor
    hissLife: 2.6, // seconds a mark lasts
    hissFlare: 0.25, // share of its life it glows hot
    hissGlow: 2.0, // how hot
    hissStain: 0.55, // opacity of the burn it leaves
    hissFumes: 3, // puffs of acrid steam where a drip lands
    hissMotes: 2, // sparks where a drip lands

    /* ================================================================ */
    /* 2 · THE SLUDGE POOL                                               */
    /* ================================================================ */
    poolRadius: 2.6, // metres it spreads to
    poolSpreadTime: 0.55, // seconds it takes
    poolCreep: 0.08, // metres per second it keeps creeping while it lies
    poolShrink: 0.35, // share of its radius it loses as it evaporates
    poolRagged: 0.16, // how ragged its edge is, × radius
    poolRaggedScale: 2.4, // features round the edge
    poolRunnels: 0.32, // splash runnels thrown out of it, × radius
    poolRunnelCount: 9, // roughly how many
    poolFlowScale: 1.1, // surface flow features per metre
    poolFlowSpeed: 0.5, // how fast the surface crawls
    poolBumps: 0.35, // relief of the surface (lighting)
    poolBubbleScale: 2.6, // bubble cells per metre
    poolBubbleSize: 0.28, // a bubble's radius, in cells
    poolBubbleDensity: 0.5, // 0..1 share of cells with a bubble in them
    poolBubbleSpeed: 0.9, // bubble cycles per second
    poolPopGlow: 1.9, // the ring flash as one pops
    poolSheen: 0.04, // oily thin-film sheen
    poolSheenScale: 1.6, // sheen bands
    poolSpecular: 0.6, // wet highlight
    poolDepthFalloff: 0.3, // metres from the edge to full depth
    poolEdgeGlow: 1.2, // the seam where the acid eats the floor
    poolEdgeWidth: 0.05, // metres
    poolOpacity: 1,
    rippleTime: 0.7, // seconds the impact ripple takes to reach the rim
    corrodeBand: 0.55, // metres of eaten floor outside the liquid
    corrodeDark: 0.82, // opacity of the stain
    corrodePitScale: 7, // corroded pits per metre
    corrodePits: 1, // 0..1 how pitted
    stainLinger: 0.55, // share of the evaporation the stain survives into
    evaporateTime: 1.8, // seconds the pool takes to evaporate
    colorPoolBody: '#22400a', // body: thin sludge at the edge
    colorPoolDeep: '#050c01', // deep: the dark middle
    colorPoolFoam: '#4e7a1e', // bubble domes
    colorStain: '#10140a', // the eaten floor

    /* ================================================================ */
    /* 3 · THE SPLASH                                                    */
    /* ================================================================ */
    splashRadius: 2.4, // metres — bodies in here are caught
    crownRadius: 0.7, // metres, the crown's foot
    crownHeight: 2.0, // metres at its tallest
    crownFlare: 0.9, // how far its lip leans out
    crownFingers: 11, // fingers round the lip
    crownFingerLength: 0.7, // × height
    crownTime: 1.3, // seconds it rises and falls back (presentation only)
    crownOpacity: 0.92,
    crownTear: 0.9, // how hard it tears apart from the top
    crownDrops: 26, // drops thrown off the fingers (they hiss too)
    crownDropSpeed: 6.5, // m/s
    burstSize: 3.2, // the WATER splash shell, metres
    burstIntensity: 0.8,
    shockRadius: 4.2, // ground shockwave, metres
    splashMotes: 60, // toxic sparks thrown up
    splashFumes: 26, // acrid puffs thrown up
    impactShake: 0.3,
    shakeDuration: 0.45,
    impactFlash: 0.2,
    impactLight: 1.6, // light punch, × lightIntensity
    colorBurstA: '#e6ffb0',
    colorBurstB: '#9dff5a',
    colorBurstC: '#2f6a12',
    colorShockA: '#7fd23a',
    colorShockB: '#e6ffb0',
    colorFlash: '#c8ff7a',

    /* ================================================================ */
    /* 4 · FUMES, BUBBLES & MOTES                                        */
    /* ================================================================ */
    fumeRate: 64, // acrid puffs/second off the pool
    fumeSize: 1.25,
    fumeLifetime: 2.8,
    fumeRise: 0.9, // m/s
    fumeBuoyancy: 0.25, // m/s² upward
    fumeOpacity: 0.8,
    fumeTurbulence: 0.6,
    plumeEvery: 0.32, // seconds between thick plumes boiling off the pool
    plumePuffs: 10, // puffs stacked in a plume
    plumeSize: 1.8,
    plumeRise: 1.2, // m/s
    plumeHeight: 1.1, // metres of column a plume starts as
    colorFumeA: '#4a5e22',
    colorFumeB: '#2e3a16',
    colorFumeC: '#1e2410',
    colorFumeD: '#101408',
    bubbleRate: 22, // bubbles/second breaking the surface
    bubbleSize: 0.22,
    bubbleLifetime: 0.7,
    bubbleRise: 0.35,
    colorBubbleA: '#7a9a40',
    colorBubbleB: '#4e7420',
    colorBubbleC: '#3f6a14',
    colorBubbleD: '#1a3008',
    moteRate: 18, // toxic sparks/second rising off the pool
    moteSize: 0.06,
    moteLifetime: 1.6,
    moteRise: 1.1,
    moteGlow: 2.4,
    trailMotes: 40, // per second shed by the glob in flight
    colorMoteA: '#f2ffc8',
    colorMoteB: '#b8ff3c',
    colorMoteC: '#5fbf2a',
    colorMoteD: '#1e3a08',

    /* --- the fumes' shimmer (distortion) --- */
    fumeWarp: 0.9, // strength
    fumeWarpHeight: 3.2, // metres it rises
    fumeWarpScale: 1.6, // noise features per metre
    fumeWarpSpeed: 1.1,
    fumeWarpFalloff: 1.3, // how fast it thins with height

    /* ================================================================ */
    /* 5 · THE MELT — what happens to a body                             */
    /* ================================================================ */
    splashImpulse: 2.2, // m/s a body is knocked back by the splash
    splashLift: 1.2, // m/s up
    splashSpin: 0.6,
    corrodeTime: 0.9, // seconds the stain takes to cover a caught body
    meltDelay: 0.6, // seconds it lies corroding before it melts down
    meltSpeed: 0.55, // metres/second it sinks into the pool
    meltPull: 1.4, // how hard it is drawn toward the pool's middle
    meltGrip: 5, // share of the gap closed per second
    meltBuoyancy: 0.85, // 0..1 of its weight the sludge holds up (slower = higher)
    consumeDepth: 0.75, // metres under the floor before a body is gone
    meltFumes: 14, // puffs/second boiling off a melting body
    look: {
      color: '#2d4a12', // the flesh, gone to rot
      rimColor: '#9dff5a',
      rimEmissive: 1.6,
      edgeColor: '#e6ffb0',
      edgeEmissive: 4.0,
      edgeWidth: 0.06
    }
  }
};
