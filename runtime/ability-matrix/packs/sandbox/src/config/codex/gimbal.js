/**
 * Gimbal Whip — tech — a sheet that shears sideways as it travels.
 *
 * Tech — a gimballed cutter yaws across the cast and keeps the edge.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'gimbal',
  meta: {
    label: 'Gimbal Whip',
    accent: '#c8f6ff',
    key: '',
    element: 'tech',
    hint: 'Tech — a gimballed cutter yaws across the cast and keeps the edge',
    cast: 'line',
    glyph: '<path d="M16 62C30 28 48 78 64 36C74 18 80 48 88 30"/><path d="M36 36L64 64M64 36L36 64"/><path d="M70 64H86V80H70Z"/><path d="M74 68H82V76H74Z"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 36, // metres/second the front travels
    lifetime: 2.2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast3', // which clip the body throws
    impactTime: 1.25, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 0, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#25cbf4',
    lightIntensity: 6, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.4, // 0..1 how much it shimmers
    impactLight: 11, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.32, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 28.6, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 3, // radians/second the body turns
    thickness: 0.34, // width of a single body part, metres
    count: 8, // parts in the body (max 12)
    height: 3.5, // how tall the body stands, metres
    sweep: 1.8, // lateral reach, metres
    lean: 0.85, // how far the body opens on the beat
    bodyOpacity: 0, // the template body sheet (off: the cutter carries the read)
    edgeGlow: 2.31,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.35,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 6, // breaths per second (radians)
    colorA: '#25cbf4',
    colorB: '#ffffff',
    colorC: '#043744',
    lensWarp: 0, // off: the body shape it warps is gone

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off)
    colorVoiceA: '#25cbf4',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 2.4, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the template field (off: the kerf is the ground)
    groundHeat: 1.1, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.08, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundStain: 0.5, // strength of the residue decal left at the beat
    groundStainReach: 0.9, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#25cbf4',
    colorGroundB: '#043744',
    colorGroundStain: '#101820', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48; off: the cutter is the piece)
    detailSize: 0.45, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 1.26, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.32, // rim light on the pieces
    detailOpacity: 1, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    detailRough: 0.34, // roughness of the lit pieces
    detailMetal: 0.8, // metalness of the lit pieces
    detailShadow: 1, // 1 = the pieces cast shadows
    colorDetailA: '#c8f6ff',
    colorDetailB: '#25cbf4',
    colorDetailC: '#043744',

    /* --- 5 · hero rig --- */
    heroSize: 2, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 0.72, // how far the rig rises, drops or arcs, metres
    heroSpin: 1, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.21, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the template rig is (off: the cast-local cutter is the hero)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    heroRough: 0.34, // roughness of the lit rig
    heroMetal: 0.8, // metalness of the lit rig
    heroShadow: 1, // 1 = the rig casts shadows
    colorHeroA: '#c8f6ff',
    colorHeroB: '#25cbf4',
    colorHeroC: '#043744',

    /* --- 6 · shed --- */
    dustRate: 4, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#c8f6ff',
    colorDustB: '#25cbf4',
    colorDustC: '#043744',
    colorDustD: '#1a140e',
    streakRate: 0, // sparks per second (off: the blade throws its own)
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#c8f6ff',
    colorStreakC: '#25cbf4',
    colorStreakD: '#25cbf4',
    chipRate: 0, // fragments per second (off)
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#25cbf4',
    colorChipB: '#c8f6ff',
    colorChipC: '#043744',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 0, // motes per second off the pieces (none: no pieces)
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#c8f6ff',
    colorMoteC: '#25cbf4',
    colorMoteD: '#25cbf4',

    /* --- 8 · the beat --- */
    impactShake: 0.44, // camera punch on the beat
    impactFlash: 0.04, // screen flash on the beat (a tint, never a full-frame flash)
    colorFlash: '#c8f6ff',
    burstRadius: 2.6, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0, // strength of the burst shell (off: the bite hits with sparks and chips)
    impactChips: 34, // fragments thrown up and out on the beat
    impactDust: 13, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#25cbf4',
    colorBurstC: '#043744',
    shockRadius: 3.2, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#25cbf4',
    colorShockB: '#ffffff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 2.4, // aftershock ring size, metres
    aftershockShake: 0.18, // camera punch of the aftershock
    aftershockLight: 7, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 1.15, // reach of the blow, metres
    hitImpulse: 9.5, // how hard bodies are thrown
    hitLift: 2.88, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.7, // 0..1 how far a felled body is stained
    markTime: 0.15, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#101820', // what the body is stained toward
    colorMarkRim: '#25cbf4',
    markRimGlow: 1.76, // rim light on a marked body
    colorMarkEdge: '#c8f6ff',
    markEdgeGlow: 2.86, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.68, // ribbon width at the head, metres
    trailLife: 1.3, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0, // strength of the template ribbon (off: the cutter and kerf carry the travel)
    trailGlow: 1.21, // brightness of the ribbon
    trailCore: 0.8, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 1.4, // width of the scar on the floor, metres
    scarLife: 2.6, // seconds the scar takes to cool and go
    scarOpacity: 0, // strength of the template scar (off: the kerf is the scar)
    scarGlow: 1.76, // brightness of its hot seam
    colorScarA: '#25cbf4',
    colorScarB: '#043744',
    wakeSpacing: 0, // metres between wake decals along the path (0 = none)
    wakeRadius: 1, // size of each wake decal, metres
    wakeLife: 1.6, // seconds each wake decal lingers
    wakeChips: 4, // fragments thrown at each wake

    /* --- 15 · the cutter (cast-local signature) --- */
    cutterSize: 1.5, // yoke radius, metres
    cutterHeight: 1.6, // hub height above the floor in flight, metres
    whipAmp: 0.95, // how far it whips side to side, metres
    whipWavelength: 5.5, // metres per full side-to-side swing
    whipRamp: 1.5, // metres from the hand over which the whip builds
    whipYaw: 0.9, // radians the yoke yaws into each swing
    cradleSpin: 7, // radians/second the cradle tumbles in the yoke
    bladeSpin: 32, // radians/second the saw spins
    biteDepth: 0.42, // how far it drops into the floor at the end, metres
    biteTime: 0.12, // seconds the drop takes
    precessSpin: 2.6, // radians/second it precesses on its gimbals after the bite
    precessDecay: 1.1, // seconds for the spin to run down
    cutterFoldAt: 1.15, // fade progress at which the cradle folds flat
    cutterSinkAt: 1.45, // fade progress at which it sinks into the bite
    cutterSeamGlow: 0.9, // glow of the inset channels
    cutterEdgeGlow: 2, // glow of the teeth and edges
    cutterSpecular: 1.2, // sun highlight on the gunmetal
    cutterRimGlow: 0.15, // fresnel rim in the channel colour
    colorMetalDeep: '#05090c', // gunmetal, deep
    colorMetal: '#2a3a42', // gunmetal, lit
    colorCutterSeam: '#25cbf4', // channels and edges
    colorCutterHot: '#e8fbff', // edges at their hottest
    cutSparks: 160, // contact sparks per second in flight
    biteSparks: 220, // sparks per second at the bite, running down
    biteChips: 40, // chips thrown at the bite
    biteShake: 0.35, // camera punch of the bite
    biteLight: 12, // light punch of the bite

    /* --- 16 · the kerf --- */
    kerfOpacity: 0.95, // strength of the cut floor
    kerfGlow: 1.3, // glow of the kerf seam
    kerfWidth: 0.24, // width of the groove, metres
    kerfBedWidth: 1.6, // width of the scorched bed, metres
    kerfCool: 3.5, // metres behind the cutter over which the seam cools
    kerfHeatLife: 1.4, // seconds the cut stays hot after the bite
    kerfLetGo: 1.6, // fade progress at which the kerf starts to go
    biteRadius: 1.1, // the gouge at the end, metres
    kerfSmoke: 20, // smoke puffs per second off the kerf
    colorKerfDeep: '#03080a', // scorch, deep
    colorKerf: '#13232a' // scorch, lit
  }
};
