/**
 * Rift Pendulum — void — a blade hinged at the hand.
 *
 * Void — a rift swings across the cast and hangs open a beat.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'riftpendulum',
  meta: {
    label: 'Rift Pendulum',
    accent: '#b0a4e8',
    key: '',
    element: 'void',
    hint: 'Void — a rift swings across the cast and hangs open a beat',
    cast: 'line',
    glyph: '<path d="M50 16V28"/><path d="M18 78L50 28L82 70"/><circle cx="50" cy="18" r="5"/><path d="M36 36L64 64M64 36L36 64"/><circle cx="78" cy="72" r="8"/><circle cx="78" cy="72" r="2"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 30, // metres/second the front travels
    lifetime: 2.2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast3', // which clip the body throws
    impactTime: 1.25, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 0, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#583be3',
    lightIntensity: 5.6, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.25, // 0..1 how much it shimmers
    impactLight: 6.6, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.32, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 19.8, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 3.6, // radians/second the body turns
    thickness: 0.34, // width of a single body part, metres
    count: 8, // parts in the body (max 12)
    height: 3.5, // how tall the body stands, metres
    sweep: 1.8, // lateral reach, metres
    lean: 0.85, // how far the body opens on the beat
    bodyOpacity: 0, // the template body sheet (off: the pendulum carries the read)
    edgeGlow: 1.47,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.22,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 6, // breaths per second (radians)
    colorA: '#583be3',
    colorB: '#ffffff',
    colorC: '#070416',
    lensWarp: 0, // off: the body shape it warps is gone // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off: the tear carries the read)
    colorVoiceA: '#583be3',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 2.4, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the field (off: the haze strip fought the wound; the scar, wound and residue carry the floor)
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 0.9, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#583be3',
    colorGroundB: '#070416',
    colorGroundStain: '#050308', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48; off: the blade is the piece)
    detailSize: 0.6, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 1.12, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 0.84, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#b0a4e8',
    colorDetailB: '#583be3',
    colorDetailC: '#070416',

    /* --- 5 · hero rig --- */
    heroSize: 3, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 0.63, // how far the rig rises, drops or arcs, metres
    heroSpin: 1, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 0.77, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is (off: the cast-local pendulum is the hero)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    colorHeroA: '#b0a4e8',
    colorHeroB: '#583be3',
    colorHeroC: '#070416',

    /* --- 6 · shed --- */
    dustRate: 30, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#b0a4e8',
    colorDustB: '#583be3',
    colorDustC: '#070416',
    colorDustD: '#1a140e',
    streakRate: 30, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#b0a4e8',
    colorStreakC: '#583be3',
    colorStreakD: '#583be3',
    chipRate: 14.4, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#583be3',
    colorChipB: '#b0a4e8',
    colorChipC: '#070416',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#b0a4e8',
    colorMoteC: '#583be3',
    colorMoteD: '#583be3',

    /* --- 8 · the beat --- */
    impactShake: 0.55, // camera punch on the beat
    impactFlash: 0.05, // screen flash on the beat
    colorFlash: '#b0a4e8',
    burstRadius: 2.6, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.1, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 4, // fragments thrown up and out on the beat
    impactDust: 10, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#583be3',
    colorBurstC: '#070416',
    shockRadius: 0.05, // decal size, metres (all but off: its thin rim read as an outline ring under the tear)
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#583be3',
    colorShockB: '#ffffff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 2.4, // aftershock ring size, metres
    aftershockShake: 0.22, // camera punch of the aftershock
    aftershockLight: 4.2, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 1.15, // reach of the blow, metres
    hitImpulse: 10.45, // how hard bodies are thrown
    hitLift: 2.24, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.95, // 0..1 how far a felled body is stained
    markTime: 0.5, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 23.4, // motes per second off a freshly marked body
    colorMarkBody: '#050308', // what the body is stained toward
    colorMarkRim: '#583be3',
    markRimGlow: 1.12, // rim light on a marked body
    colorMarkEdge: '#b0a4e8',
    markEdgeGlow: 1.82, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.34, // ribbon width at the head, metres
    trailLife: 0.9, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0, // strength of the ribbon (off: the blade is the travel)
    trailGlow: 0.77, // brightness of the ribbon
    trailCore: 0.4, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 0.6, // width of the scar on the floor, metres
    scarLife: 2.6, // seconds the scar takes to cool and go
    scarOpacity: 0, // strength of the scar (off: its long return arc read as a dark line across the floor)
    scarGlow: 1.12, // brightness of its hot seam
    colorScarA: '#583be3',
    colorScarB: '#070416',
    wakeSpacing: 0, // metres between wake decals along the path (0 = none; off: the return path laid them in a long dark arc across the floor)
    wakeRadius: 0.7, // size of each wake decal, metres
    wakeLife: 1.6, // seconds each wake decal lingers
    wakeChips: 1.6, // fragments thrown at each wake

    /* --- 15 · the pendulum (cast-local hero) --- */
    bladeSpan: 4, // horn-to-horn span of the crescent blade, metres
    pendPivotHeight: 3.7, // the knot the pendulum hangs from, metres above the floor
    pendArm: 2.45, // pivot to blade socket, metres (the belly passes ~1 m off the floor)
    armWidth: 0.08, // radius of the forged arm, metres
    pendAmplitude: 0.95, // swing either side of plumb, radians
    pendPeriod: 1.15, // seconds for one full swing there and back, × global lifetime
    pendDamping: 0.45, // how fast the swing dies, per second
    pendExit: 0.5, // seconds the blade takes to shatter and the knot to collapse, × global lifetime
    bladeTravelScale: 0.45, // size of the thrown blade before it catches, × span
    bladeSpin: 18, // how fast the thrown blade spins in its plane, rad/s
    bladeArc: 0.6, // how high the throw arcs, metres
    bladeSpecular: 0.6, // sun glint on the bevels
    bladeFresnel: 0.7, // violet rim at grazing angles
    bladeAmbient: 0.3, // how much of the albedo shows away from the sun
    bladeEdgeGlow: 1, // the hot cutting edge
    bladeVeins: 0.6, // veins of rift crawling through the iron
    colorBladeCore: '#efe8ff', // white-hot edge
    colorBladeTint: '#a898ff', // pale violet glint
    colorBladeBody: '#4a2fd0', // saturated indigo
    colorBladeDeep: '#06040e', // near-black spine
    pivotSize: 0.42, // radius of the knot of void, metres
    pivotSpikes: 0.35, // how far its spikes churn out
    pivotGlow: 1.3, // its violet horizon
    passShake: 0.16, // camera punch each time the blade sweeps through the bottom
    passLight: 3, // light punch on each pass
    passDust: 8, // dust thrown sideways off the floor on each pass
    swingSparks: 90, // sparks per second off the edge at full swing

    /* --- 16 · the rift --- */
    riftHeight: 3.2, // the tear in the air behind the blade, metres
    riftWidth: 1.05, // its half-width at the widest, metres
    riftDepth: 0.35, // how far behind the blade it hangs, metres along the cast
    riftOpenTime: 0.18, // seconds it takes to part, × global lifetime
    riftHold: 1.2, // seconds it hangs open after the beat, × global lifetime
    riftCloseTime: 0.55, // seconds it takes to zip shut from both ends, × global lifetime
    riftLip: 0.08, // width of its burning lip, metres
    riftJag: 1, // how torn its edge is
    riftSwirl: 1, // how fast the inside drains
    riftGlow: 1.4, // brightness of the lip
    riftMotes: 60, // motes per second drawn into the tear
    colorRiftDeep: '#020107', // the inside of the tear
    colorRiftLip: '#7a5cff', // the lip
    woundLength: 3.2, // the wound torn across the floor under the blade, metres
    woundWidth: 0.6, // its half-width, metres
    woundGlow: 1.1, // brightness of its lip
    woundClose: 0.55 // seconds it takes to zip shut at the very end, × global lifetime
  }
};
