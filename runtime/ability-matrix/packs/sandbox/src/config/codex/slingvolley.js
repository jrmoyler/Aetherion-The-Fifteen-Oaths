/**
 * Sling Volley — motion — a fan of bolts on staggered arcs.
 *
 * Motion — stones leave on flat slings and arrive still spinning.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'slingvolley',
  meta: {
    label: 'Sling Volley',
    accent: '#ffc49a',
    key: '',
    element: 'motion',
    hint: 'Motion — stones leave on flat slings and arrive still spinning',
    cast: 'line',
    glyph: '<path d="M18 70Q34 30 50 70"/><path d="M34 70Q50 24 66 70"/><path d="M50 70Q66 30 82 70"/><path d="M66 66H86M70 72H90M66 78H86"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 36, // metres/second the front travels
    lifetime: 1.8, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast1', // which clip the body throws
    impactTime: 1.05, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 0, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#fa5838',
    lightIntensity: 8, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.3, // 0..1 how much it shimmers
    impactLight: 8.8, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.22, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 14, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 1.96, // radians/second the body turns
    thickness: 0.22, // width of a single body part, metres
    count: 6, // parts in the body (max 12)
    height: 2.6, // how tall the body stands, metres
    sweep: 1.1, // lateral reach, metres
    lean: 0.45, // how far the body opens on the beat
    bodyOpacity: 0,
    edgeGlow: 1.6,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.32,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 4, // breaths per second (radians)
    colorA: '#fa5838',
    colorB: '#fff1e4',
    colorC: '#5e1608',
    lensWarp: 0.35, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement
    colorVoiceA: '#fa5838',
    colorVoiceB: '#fff1e4',

    /* --- 3 · the ground --- */
    groundWidth: 2.4, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the field
    groundHeat: 1.1, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.1, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 0.9, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#fa5838',
    colorGroundB: '#5e1608',
    colorGroundStain: '#2a2a30', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48)
    detailSize: 0.5, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 0.8, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.2, // rim light on the pieces
    detailOpacity: 1, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    detailRough: 0.38, // roughness of the lit pieces
    detailMetal: 0.62, // metalness of the lit pieces
    detailShadow: 1, // 1 = the pieces cast shadows
    colorDetailA: '#ffc49a',
    colorDetailB: '#fa5838',
    colorDetailC: '#5e1608',

    /* --- 5 · hero rig --- */
    heroSize: 1.4, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 1.76, // how far the rig rises, drops or arcs, metres
    heroSpin: 1.5, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.1, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    heroRough: 0.38, // roughness of the lit rig
    heroMetal: 0.62, // metalness of the lit rig
    heroShadow: 1, // 1 = the rig casts shadows
    colorHeroA: '#ffc49a',
    colorHeroB: '#fa5838',
    colorHeroC: '#5e1608',

    /* --- 6 · shed --- */
    dustRate: 30, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.45,
    colorDustA: '#ffc49a',
    colorDustB: '#fa5838',
    colorDustC: '#5e1608',
    colorDustD: '#1a140e',
    streakRate: 8, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#fff1e4',
    colorStreakB: '#ffc49a',
    colorStreakC: '#fa5838',
    colorStreakD: '#fa5838',
    chipRate: 10, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#fa5838',
    colorChipB: '#ffc49a',
    colorChipC: '#5e1608',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#fff1e4',
    colorMoteB: '#ffc49a',
    colorMoteC: '#fa5838',
    colorMoteD: '#fa5838',

    /* --- 8 · the beat --- */
    impactShake: 0.5, // camera punch on the beat
    impactFlash: 0.08, // screen flash on the beat
    colorFlash: '#ffc49a',
    burstRadius: 2, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.1, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 24, // fragments thrown up and out on the beat
    impactDust: 23, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#fff1e4',
    colorBurstB: '#fa5838',
    colorBurstC: '#5e1608',
    shockRadius: 3.2, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#5e1608',
    colorShockB: '#fff1e4',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 2.4, // aftershock ring size, metres
    aftershockShake: 0.2, // camera punch of the aftershock
    aftershockLight: 5.6, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 1.15, // reach of the blow, metres
    hitImpulse: 8.25, // how hard bodies are thrown
    hitLift: 2.56, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.5, // 0..1 how far a felled body is stained
    markTime: 0.2, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#2a2a30', // what the body is stained toward
    colorMarkRim: '#fa5838',
    markRimGlow: 1.6, // rim light on a marked body
    colorMarkEdge: '#ffc49a',
    markEdgeGlow: 2.6, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.18, // ribbon width at the head, metres
    trailLife: 1.1, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0, // strength of the ribbon
    trailGlow: 1.1, // brightness of the ribbon
    trailCore: 0.8, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 0.35, // width of the scar on the floor, metres
    scarLife: 2.6, // seconds the scar takes to cool and go
    scarOpacity: 0, // strength of the scar
    scarGlow: 1.6, // brightness of its hot seam
    colorScarA: '#fa5838',
    colorScarB: '#5e1608',
    wakeSpacing: 0, // metres between wake decals along the path (0 = none)
    wakeRadius: 0.6, // size of each wake decal, metres
    wakeLife: 1.6, // seconds each wake decal lingers
    wakeChips: 2.8, // fragments thrown at each wake

    /* --- 15 · the sling (upgrade) --- */
    slingRadius: 1.05, // radius the cord whirls at over the fist, metres
    slingSpin: 26, // radians/second the cord whirls
    slingLift: 0.75, // metres above the fist the whirl turns
    slingTime: 0.4, // seconds it whirls before folding away, × global lifetime
    slingBlur: 1.6, // strength of the whirl's smear disc
    slingOut: 0.75, // metres out to the caster's side the whirl turns (clear of the body, seen from behind)
    slingTilt: 0.55, // radians the whirl is tipped toward the side and the camera
    slingCord: 3, // cord thickness, × (so it reads at 8 m)
    colorCord: '#3a2216', // the leather cord

    /* --- 16 · the stones (upgrade) --- */
    stoneSize: 0.5, // half-length of a stone (it is a pointed glans), metres
    stoneJitter: 0.22, // ± fraction each stone differs in size
    stoneFlight: 0.34, // seconds the farthest stone is in the air (nearer ones less); solved back from its strike
    stoneArc: 1.6, // apex of the farthest stone's flat arc above the straight line, metres
    stoneSpin: 30, // radians/second a stone spins flat about the vertical
    stoneSpinDown: 1.5, // seconds a landed stone's spin decays over, × global lifetime
    stoneWobble: 0.42, // radians it rocks about its long axis as it slows
    stoneSkid: 0.9, // metres a stone skids from touchdown to rest (centred on its strike point)
    stoneSkidRate: 7, // how fast the skid stops, 1/s
    stoneBounce: 0.35, // hop on touchdown, × stone half-length
    stoneSink: 0.75, // how far it beds into the floor on the exit, × its height
    stoneExitAt: 1.45, // fade progress the stones start to crumble at (1 = fade start, 2 = end)
    stoneHeat: 1, // how hot the cracks and tips run
    stoneCool: 0.75, // seconds the heat takes to leave a landed stone, × global lifetime
    stoneCrackScale: 2.2, // density of the glowing cracks
    stoneCrackGlow: 1.3, // brightness of the cracks while hot
    stoneAmbient: 0.32, // shadow-side light on the stone
    stoneSpecular: 0.7, // sun glint off the facets
    stoneFresnel: 0.55, // rust rim light
    stoneShadow: 1, // 1 = the stones cast shadows
    stoneTrail: 12, // grit streaks per second off each stone in flight
    stoneSpinDust: 26, // dust puffs per second kicked by each stone still spinning
    colorStoneCore: '#fff1e4', // white-hot, only in the cracks
    colorStoneTint: '#ffc49a', // pale ochre glint
    colorStoneBody: '#6e2c1a', // rust-red stone
    colorStoneDeep: '#110705', // basalt deep

    /* --- 17 · the spin blur (upgrade) --- */
    blurOpacity: 0.22, // strength of the smear discs
    blurSize: 1.25, // disc radius, × stone half-length
    blurTrail: 0.45, // radians of smear behind each tip

    /* --- 18 · the landings (upgrade) --- */
    craterSize: 1.7, // crater radius, × stone half-length
    craterCracks: 2.3, // how far the cracks run, × crater radius
    craterGouge: 0.55, // width of the skid gouge, × stone half-length
    craterOpacity: 0.9, // strength of the crater floor
    craterGlow: 1.1, // glow of the cracks while the stone is hot
    craterErodeAt: 1.5, // fade progress the crater floor starts to break up (the crack decals outlive it)
    craterDecal: 0.15, // strength of the engine crack decal left at each landing
    landChips: 14, // fragments thrown up at each landing
    landPuffs: 10, // dust puffs rolled out at each landing
    landDust: 3.2, // dust ring at each landing, × stone half-length
    landShake: 0.16, // camera punch per landing
    landLight: 2.2 // light punch per landing
  }
};
