/**
 * Impulse Well — force — a floor that inhales, then a column.
 *
 * Force — impulse collects at the centre and dumps along the floor.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'impulse',
  meta: {
    label: 'Impulse Well',
    accent: '#ffe0c2',
    key: '',
    element: 'force',
    hint: 'Force — impulse collects at the centre and dumps along the floor',
    cast: 'zone',
    glyph: '<circle cx="50" cy="54" r="22"/><path d="M50 54V18"/><path d="M40 28L50 16L60 28"/><path d="M36 36L64 64M64 36L36 64"/><path d="M66 72H90M82 64L90 72L82 80"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 26.4, // metres/second the front travels
    lifetime: 2.2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast3', // which clip the body throws
    impactTime: 1.25, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 4.7, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#f47325',
    lightIntensity: 3.4, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.2, // 0..1 how much it shimmers
    impactLight: 6, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.32, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 22, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 2.7, // radians/second the body turns
    thickness: 0.34, // width of a single body part, metres
    count: 8, // parts in the body (max 12)
    height: 3.5, // how tall the body stands, metres
    sweep: 1.8, // lateral reach, metres
    lean: 0.85, // how far the body opens on the beat
    bodyOpacity: 0.03, // the template sigil: a trace only, the floor and slabs carry the read
    edgeGlow: 1.16,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.32,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 6, // breaths per second (radians)
    colorA: '#f47325',
    colorB: '#fff8f0',
    colorC: '#471e06',
    lensWarp: 0.8, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off)
    colorVoiceA: '#f47325',
    colorVoiceB: '#fff8f0',

    /* --- 3 · the ground --- */
    groundWidth: 9, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0.25, // strength of the field (round the broken floor)
    groundLand: 0.32, // seconds the field takes to land out to the rim after the beat
    groundHeat: 1.1, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.08, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundTelegraph: 0.32, // how strongly the footprint shows before the beat
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 1.05, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#f47325',
    colorGroundB: '#471e06',
    colorGroundStain: '#2a1410', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48) — off: the moth-like flecks read as noise
    detailSize: 0.6, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 3.2, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.2, // rim light on the pieces
    detailOpacity: 1, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    detailRough: 0.5, // roughness of the lit pieces
    detailMetal: 0.3, // metalness of the lit pieces
    detailShadow: 1, // 1 = the pieces cast shadows
    colorDetailA: '#ffe0c2',
    colorDetailB: '#f47325',
    colorDetailC: '#471e06',

    /* --- 5 · hero rig --- */
    heroSize: 2, // scale of the hero rig, metres per authored unit
    heroReach: 0.7, // ring rigs: share of the circle radius they span
    heroLift: 1.5, // how far the rig rises, drops or arcs, metres
    heroSpin: 0.5, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.1, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is — off: the wire funnel had no core
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroFit: 0.72, // mass rigs grow to at least this share of the circle radius (heroSize is the floor)
    heroRough: 0.5, // roughness of the lit rig
    heroMetal: 0.3, // metalness of the lit rig
    heroShadow: 1, // 1 = the rig casts shadows
    colorHeroA: '#ffe0c2',
    colorHeroB: '#f47325',
    colorHeroC: '#471e06',

    /* --- 6 · shed --- */
    dustRate: 72, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#ffe0c2',
    colorDustB: '#f47325',
    colorDustC: '#471e06',
    colorDustD: '#1a140e',
    streakRate: 90, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#fff8f0',
    colorStreakB: '#ffe0c2',
    colorStreakC: '#f47325',
    colorStreakD: '#f47325',
    chipRate: 36, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#f47325',
    colorChipB: '#ffe0c2',
    colorChipC: '#471e06',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#fff8f0',
    colorMoteB: '#ffe0c2',
    colorMoteC: '#f47325',
    colorMoteD: '#f47325',

    /* --- 8 · the beat --- */
    impactShake: 0.72, // camera punch on the beat
    impactFlash: 0.05, // screen flash on the beat
    colorFlash: '#ffe0c2',
    burstRadius: 3.8, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 34, // fragments thrown up and out on the beat
    impactDust: 23, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#fff8f0',
    colorBurstB: '#f47325',
    colorBurstC: '#471e06',
    shockRadius: 6.5, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#f47325',
    colorShockB: '#fff8f0',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 5, // aftershock ring size, metres
    aftershockShake: 0.29, // camera punch of the aftershock
    aftershockLight: 6.3, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 4.4, // reach of the blow, metres
    hitImpulse: 13.3, // how hard bodies are thrown
    hitLift: 9, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.7, // 0..1 how far a felled body is stained
    markTime: 0.3, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 23.4, // motes per second off a freshly marked body
    colorMarkBody: '#2a1410', // what the body is stained toward
    colorMarkRim: '#f47325',
    markRimGlow: 1.6, // rim light on a marked body
    colorMarkEdge: '#ffe0c2',
    markEdgeGlow: 2.6, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the well floor (the signature) --- */
    wellReach: 1.15, // radius of the broken floor disc, × the circle
    wellDepth: 1.5, // metres the floor sinks at the eye while it inhales
    wellFunnel: 0.62, // radius of the funnel, × the disc
    wellInhaleFrom: 0.25, // how far down the funnel is already sunk the instant the cast leaves the hand
    wellCell: 0.75, // size of the broken floor cells, metres
    wellGlow: 1.6, // the cracks where the floor is pulled or bent
    wellPull: 1.1, // crack glow down the funnel while it inhales
    wellCore: 2.4, // the glowing eye at the bottom
    wellEmber: 0.12, // crack glow left in the settled floor
    wellOpacity: 1, // 0 hides the floor
    waveHeight: 1.05, // metres the dumped ring wave heaves the floor
    waveSpeed: 1.25, // how fast the wave runs out, discs per second
    waveWidth: 0.13, // width of the wave, × the disc
    waveDecay: 1.3, // how fast the wave dies, per second
    waveCrest: 1.6, // crack glow along the crest
    rippleHeight: 0.22, // metres of the settling ripples after the wave
    rippleK: 26, // ripples across the disc (radians per disc)
    rippleSpeed: 9, // radians/second the ripples run outward
    rippleDecay: 1, // how fast the ripples settle, per second
    colorWellDeep: '#120b08', // deep: basalt in shadow
    colorWellBody: '#3d2f27', // body: basalt in the sun
    colorWellHot: '#f47325', // tint: force heat in the cracks
    colorWellCore: '#fff0dc', // core: the eye

    /* --- 13 · the slabs --- */
    slabCount: 22, // slabs torn up (max 32)
    slabSize: 1.05, // slab scale, × authored (≈1 m across)
    slabInner: 0.3, // nearest a slab starts to the eye, × the circle
    slabOuter: 0.95, // farthest, × the circle
    slabDrag: 0.45, // share of the way to the eye the inhale drags them
    slabLift: 6, // slowest launch, metres/second up
    slabLiftMax: 9.5, // fastest launch, metres/second up
    slabOut: 2.2, // metres/second they are thrown outward
    slabSwirl: 2.6, // metres/second they are thrown round (the column twists)
    slabStagger: 0.14, // seconds over which the column unspools
    slabGravity: 15, // metres/second² they fall back at
    slabTumble: 5, // radians/second they turn in the air
    slabBounce: 0.28, // metres of the bounce when one lands
    slabHeat: 1.1, // the torn undersides
    slabCool: 0.7, // how fast they cool after landing, per second
    slabSink: 0.6, // metres they sink on the way out
    slabSinkAt: 1.6, // clock (0..2: impact then fade) they start sinking
    slabOpacity: 1, // 0 hides the slabs
    slabShadow: 1, // 1 = slabs cast shadows
    colorSlabBody: '#3a2f29', // lit slab rock

    /* --- 14 · the charge in flight --- */
    orbSize: 0.85, // radius of the compressed charge, metres
    orbStart: 0.45, // its size as it leaves the hand, × full
    orbHeight: 1.1, // flight height, metres
    orbLump: 0.28, // how lumpy it is
    orbSpin: 7, // radians/second it churns
    orbGlow: 1.1, // its seams
    orbTrail: 160, // streaks per second it sheds in flight
    orbOpacity: 1 // 0 hides it
  }
};
