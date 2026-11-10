/**
 * Dusk Spire — shadow — a ring of standing columns.
 *
 * Shadow — dusk columns drink the circle inward as they rise.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'duskspire',
  meta: {
    label: 'Dusk Spire',
    accent: '#b7a6ff',
    key: '',
    element: 'shadow',
    hint: 'Shadow — dusk columns drink the circle inward as they rise',
    cast: 'zone',
    glyph: '<path d="M32 86V40L40 28V86"/><path d="M46 86V22L54 12L62 22V86"/><path d="M68 86V40L76 30V86"/><path d="M18 86H82"/><path d="M30 50H70"/><path d="M84 62A12 12 0 1 0 84 84A8 10 0 1 1 84 62Z"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 24.2, // metres/second the front travels
    lifetime: 2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast2', // which clip the body throws
    impactTime: 1.15, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 4.45, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#5e40dd',
    lightIntensity: 4.8, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.4, // 0..1 how much it shimmers
    impactLight: 5.5, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.27, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 17.6, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 2.2, // radians/second the body turns
    thickness: 0.28, // width of a single body part, metres
    count: 7, // parts in the body (max 12)
    height: 3.05, // how tall the body stands, metres
    sweep: 1.45, // lateral reach, metres
    lean: 0.65, // how far the body opens on the beat
    bodyOpacity: 0, // the template body; off — the stone is the body now
    edgeGlow: 0.61,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.19,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 5, // breaths per second (radians)
    colorA: '#5e40dd',
    colorB: '#ffffff',
    colorC: '#0d0821',
    lensWarp: 0, // strength of the distortion it writes (off with the body)

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off: it drew a crown of lines)
    colorVoiceA: '#5e40dd',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 9, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the template field (off: the pool replaces it)
    groundLand: 0.32, // seconds the field takes to land out to the rim after the beat
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundTelegraph: 0.32, // how strongly the footprint shows before the beat
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 1.05, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#3a2580',
    colorGroundB: '#0d0821',
    colorGroundStain: '#08080c', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48); off — the columns throw real chips
    detailSize: 0.55, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 2.16, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 0.72, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#b7a6ff',
    colorDetailB: '#5e40dd',
    colorDetailC: '#0d0821',

    /* --- 5 · hero rig --- */
    heroSize: 2.4, // scale of the hero rig, metres per authored unit
    heroReach: 0.8, // ring rigs: share of the circle radius they span
    heroLift: 1.8, // how far the rig rises, drops or arcs, metres
    heroSpin: 0.35, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 0.66, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the template rig is (off: the spire replaces it)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroFit: 0.72, // mass rigs grow to at least this share of the circle radius (heroSize is the floor)
    colorHeroA: '#b7a6ff',
    colorHeroB: '#5e40dd',
    colorHeroC: '#0d0821',

    /* --- 6 · shed --- */
    dustRate: 40, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#2a2140',
    colorDustB: '#1a1430',
    colorDustC: '#0d0821',
    colorDustD: '#08060c',
    streakRate: 24, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#b7a6ff',
    colorStreakC: '#5e40dd',
    colorStreakD: '#5e40dd',
    chipRate: 8, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#2b2238',
    colorChipB: '#5e40dd',
    colorChipC: '#120d1a',
    colorChipD: '#0a0810',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#b7a6ff',
    colorMoteC: '#5e40dd',
    colorMoteD: '#5e40dd',

    /* --- 8 · the beat --- */
    impactShake: 0.44, // camera punch on the beat
    impactFlash: 0.04, // screen flash on the beat (kept low: the light punch carries it)
    colorFlash: '#b7a6ff',
    burstRadius: 3.5, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.1, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 24, // fragments thrown up and out on the beat
    impactDust: 12, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#5e40dd',
    colorBurstC: '#0d0821',
    shockRadius: 6.5, // decal size, metres
    shockLife: 0.85,
    shockRing: 0.1, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#2a1a5a',
    colorShockB: '#6a4ac8',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 5, // aftershock ring size, metres
    aftershockShake: 0.18, // camera punch of the aftershock
    aftershockLight: 3.5, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 4.4, // reach of the blow, metres
    hitImpulse: 8.5, // how hard bodies are thrown
    hitLift: 2.88, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.9, // 0..1 how far a felled body is stained
    markTime: 0.6, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 23.4, // motes per second off a freshly marked body
    colorMarkBody: '#08080c', // what the body is stained toward
    colorMarkRim: '#5e40dd',
    markRimGlow: 0.96, // rim light on a marked body
    colorMarkEdge: '#b7a6ff',
    markEdgeGlow: 1.56, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 14 · the spire (the cast's own hero) --- */
    spireColumns: 7, // obsidian columns round the circle (max 12)
    columnRing: 0.78, // where they stand, × the circle radius
    columnHeight: 2.7, // column height, metres
    columnVary: 0.35, // 0..1 height jitter between columns
    columnWidth: 2.4, // column girth, × the authored 0.4 m
    columnTease: 0.18, // share of a column through the floor before the beat
    columnRise: 0.22, // seconds a column takes to erupt on the beat
    columnStagger: 0.03, // seconds between one column and the next
    columnKick: 0.18, // radians a column throws outward as it erupts
    columnLean: 0.5, // radians a column leans in toward the spire, fully drunk
    columnDrain: 0.35, // share of its height a column loses as it is drunk
    columnDrainLight: 0.85, // share of its light that drains out of it, tip first
    columnCrack: 1.6, // crack decal at each foot, × the girth, metres
    columnChips: 10, // stone chips thrown by each column on the beat
    spireHeight: 3.8, // the centre spire, fully drunk, metres (kept under heroMaxHeight)
    spireWidth: 3.2, // spire girth, × the authored 0.48 m
    spireStart: 0.7, // share of its height the spire stands at before it drinks
    spireDelay: 0.05, // seconds after the beat the spire starts up
    spireRise: 0.35, // seconds it takes to drive up
    spireTurn: 0.12, // radians/second the spire turns
    drinkTime: 1.7, // seconds the drink takes, × global lifetime
    drinkMotes: 120, // motes per second drawn off the column tips into the spire
    sinkFrom: 1.45, // fade clock (1 = fade start, 2 = end) the stone starts sinking at
    stoneGlow: 1.5, // brightness of the seams and veins
    stoneVeins: 0.09, // width of the vein network, 0..1 of the noise
    stoneFlow: 0.7, // how fast the veins crawl up
    stoneFlash: 0.5, // extra seam light on the beat, decays in 0.25 s
    stoneRim: 0.35, // violet fresnel rim on the dark stone
    stoneRough: 0.38,
    stoneMetal: 0.2,
    colorStone: '#15101f', // the obsidian albedo (the deep that carries the mass)

    /* --- 15 · the pool and the runner --- */
    poolOpacity: 0.95, // strength of the dark pool on the circle
    poolReach: 1.05, // pool radius, × the circle
    poolTelegraph: 0.3, // share of the pool open before the beat
    poolEnd: 0.45, // share of the pool left when the drink is done
    poolGlow: 0.8, // brightness of its filaments and lip
    poolArms: 5, // spiral filaments
    poolFlow: 1.6, // how fast they crawl inward
    colorPoolVoid: '#050309', // the near-black of the pool and the cracks
    runnerOpacity: 1, // strength of the shadow crawling from the hand
    runnerWidth: 2.2, // its width, metres
    runnerStart: 1.6, // metres past the hand it surfaces (clear of the caster)
    runnerRetract: 0.35, // seconds it takes to be drawn into the circle after the beat
    runnerSmoke: 90 // dark smoke puffs per second churned at its head (sparks are 0.6 of it)
  }
};
