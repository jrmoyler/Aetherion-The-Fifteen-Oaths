/**
 * Facet Volley — crystal — a fan of bolts on staggered arcs.
 *
 * Crystal — faceted seeds arc down the line and plant where they strike.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'facetvolley',
  meta: {
    label: 'Facet Volley',
    accent: '#f4e8ff',
    key: '',
    element: 'crystal',
    hint: 'Crystal — faceted seeds arc down the line and plant where they strike',
    cast: 'line',
    glyph: '<path d="M18 70Q34 30 50 70"/><path d="M34 70Q50 24 66 70"/><path d="M50 70Q66 30 82 70"/><path d="M78 62L86 72L78 84L70 72Z"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 24, // metres/second the front travels
    lifetime: 1.8, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast1', // which clip the body throws
    impactTime: 1.05, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 0, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#9268f3',
    lightIntensity: 10.4, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.35, // 0..1 how much it shimmers
    impactLight: 12.1, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.22, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 30.8, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 1.4, // radians/second the body turns
    thickness: 0.22, // width of a single body part, metres
    count: 6, // parts in the body (max 12)
    height: 2.6, // how tall the body stands, metres
    sweep: 1.1, // lateral reach, metres
    lean: 0.45, // how far the body opens on the beat
    bodyOpacity: 0, // the template curtain; off — the crystals are the body now
    edgeGlow: 2.08,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.42,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 4, // breaths per second (radians)
    colorA: '#9268f3',
    colorB: '#ffffff',
    colorC: '#230a5c',
    lensWarp: 0, // strength of the distortion it writes (off with the curtain)

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off)
    colorVoiceA: '#9268f3',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 2.4, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the template strip (off: each planting frosts its own bed)
    groundHeat: 1.1, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.55, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundStain: 0.4, // strength of the residue decal left at the beat
    groundStainReach: 0.9, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#4a2a8e',
    colorGroundB: '#230a5c',
    colorGroundStain: '#2a2440', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48); off — the plantings throw real chips
    detailSize: 0.6, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 1, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.56, // rim light on the pieces
    detailOpacity: 1, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    detailRough: 0.16, // roughness of the lit pieces
    detailMetal: 0.08, // metalness of the lit pieces
    detailShadow: 1, // 1 = the pieces cast shadows
    colorDetailA: '#f4e8ff',
    colorDetailB: '#9268f3',
    colorDetailC: '#230a5c',

    /* --- 5 · hero rig --- */
    heroSize: 1.4, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 2.2, // how far the rig rises, drops or arcs, metres
    heroSpin: 1.5, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.43, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the template rig is (off: the seeds replace it)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    heroRough: 0.16, // roughness of the lit rig
    heroMetal: 0.08, // metalness of the lit rig
    heroShadow: 1, // 1 = the rig casts shadows
    colorHeroA: '#f4e8ff',
    colorHeroB: '#9268f3',
    colorHeroC: '#230a5c',

    /* --- 6 · shed --- */
    dustRate: 20, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#f4e8ff',
    colorDustB: '#9268f3',
    colorDustC: '#230a5c',
    colorDustD: '#1a140e',
    streakRate: 12, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#f4e8ff',
    colorStreakC: '#9268f3',
    colorStreakD: '#9268f3',
    chipRate: 10, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#3a2070',
    colorChipB: '#9268f3',
    colorChipC: '#230a5c',
    colorChipD: '#140a26',

    /* --- 7 · motes --- */
    moteRate: 12, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#f4e8ff',
    colorMoteC: '#9268f3',
    colorMoteD: '#9268f3',

    /* --- 8 · the beat --- */
    impactShake: 0.5, // camera punch on the beat
    impactFlash: 0.05, // screen flash on the beat (kept low)
    colorFlash: '#f4e8ff',
    burstRadius: 2, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 44, // fragments thrown up and out on the beat
    impactDust: 13, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#9268f3',
    colorBurstC: '#230a5c',
    shockRadius: 2, // decal size, metres
    shockLife: 0.85,
    shockRing: 0.1, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#2a1458',
    colorShockB: '#5a3a9e',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 2.4, // aftershock ring size, metres
    aftershockShake: 0.2, // camera punch of the aftershock
    aftershockLight: 7.7, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 1.15, // reach of the blow, metres
    hitImpulse: 7.5, // how hard bodies are thrown
    hitLift: 3.2, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.75, // 0..1 how far a felled body is stained
    markTime: 0.35, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#2a2440', // what the body is stained toward
    colorMarkRim: '#9268f3',
    markRimGlow: 2.08, // rim light on a marked body
    colorMarkEdge: '#f4e8ff',
    markEdgeGlow: 3.38, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.18, // ribbon width at the head, metres
    trailLife: 1.1, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0, // strength of the ribbon (off: the seeds show the travel)
    trailGlow: 1.43, // brightness of the ribbon
    trailCore: 0.8, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 0.35, // width of the scar on the floor, metres
    scarLife: 2.6, // seconds the scar takes to cool and go
    scarOpacity: 0, // strength of the scar (off: it drew a line down the floor)
    scarGlow: 2.08, // brightness of its hot seam
    colorScarA: '#9268f3',
    colorScarB: '#230a5c',
    wakeSpacing: 0, // metres between wake decals along the path (0 = none)
    wakeRadius: 0.6, // size of each wake decal, metres
    wakeLife: 1.6, // seconds each wake decal lingers
    wakeChips: 5.2, // fragments thrown at each wake

    /* --- 15 · the seeds (the cast's own hero) --- */
    seedSize: 1.2, // length of a flying seed, metres
    seedWidth: 1.5, // girth, × the authored 0.34 m
    seedArc: 2.2, // height of a long throw's arc, metres (short throws lob lower)
    seedFlight: 0.35, // share of the line a seed is in the air for
    seedStagger: 1, // 0 = all leave the hand together .. 1 = one after another
    seedSpin: 9, // radians/second a seed turns on its axis in flight
    seedBury: 0.3, // share of a seed's length driven into the floor
    seedTurn: 0.6, // flight share from which a seed swings from broadside to point-first

    /* --- 16 · the planting --- */
    clusterSize: 5, // prisms that burst out round each planted seed (max 7)
    clusterNear: 0.5, // size of the first cluster (at the caster's feet) × the last one at the end of the line
    clusterHeight: 1.9, // tallest prism, metres
    clusterWidth: 1.7, // prism girth, × the authored 0.32 m
    clusterSpread: 0.35, // how far the prisms stand from the seed, metres
    clusterSplay: 0.75, // how far they fan outward, radians
    clusterDelay: 0.04, // seconds after the strike the cluster bursts
    clusterStagger: 0.035, // seconds between one prism and the next
    clusterGrow: 0.22, // seconds a prism takes to burst out
    clusterAccrete: 0.25, // share of its size a cluster still grows through the linger
    accreteTime: 1.6, // seconds that growth takes, × global lifetime
    shatterFrom: 1.5, // fade clock (1 = fade start, 2 = end) the clusters crack and sink from
    shatterChips: 14, // chips each cluster throws when it cracks
    plantFrost: 1.3, // dark frost bed round each planting, metres
    plantCrack: 1.1, // crack round each planting, metres
    plantChips: 14, // chips thrown at each strike
    plantDust: 8, // dust puffs rolled out at each strike
    plantShake: 0.18, // camera punch of each strike
    plantLight: 3, // light punch of each strike
    colorPlantBed: '#140a26', // the deep the floor is scorched toward
    colorPlantEmber: '#3a1d70', // the embers left in that bed

    /* --- 17 · the crystal --- */
    crystalGlow: 1.5, // brightness of the terminations and glint
    crystalCool: 0.7, // seconds for a fresh crystal's tips to cool by ~63 %, × global lifetime
    crystalGlint: 1, // strength of the glint climbing each crystal
    crystalGlintRate: 0.5, // glints per second
    crystalRim: 0.22, // pale fresnel along the facet edges
    crystalRough: 0.16,
    crystalMetal: 0.35,
    colorCrystal: '#1d0e3a'
  }
};
