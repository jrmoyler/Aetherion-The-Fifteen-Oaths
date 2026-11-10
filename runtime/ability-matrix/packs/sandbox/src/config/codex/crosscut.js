/**
 * Crosscut Gust — wind — a blade hinged at the hand.
 *
 * Wind — a gust hinged at the hand cuts across the cast.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'crosscut',
  meta: {
    label: 'Crosscut Gust',
    accent: '#e7fff8',
    key: '',
    element: 'wind',
    hint: 'Wind — a gust hinged at the hand cuts across the cast',
    cast: 'line',
    glyph: '<path d="M50 16V28"/><path d="M18 78L50 28L82 70"/><circle cx="50" cy="18" r="5"/><path d="M30 50H70"/><path d="M68 70C74 64 82 76 88 70"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 36.45, // metres/second the front travels
    lifetime: 2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast2', // which clip the body throws
    impactTime: 1.15, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 0, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#47e1bc',
    lightIntensity: 7.2, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.3, // 0..1 how much it shimmers
    impactLight: 7.7, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.27, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 35.2, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 3.3, // radians/second the body turns
    thickness: 0.28, // width of a single body part, metres
    count: 7, // parts in the body (max 12)
    height: 3.05, // how tall the body stands, metres
    sweep: 1.45, // lateral reach, metres
    lean: 0.65, // how far the body opens on the beat
    bodyOpacity: 0,
    edgeGlow: 1.67,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.29,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 5, // breaths per second (radians)
    colorA: '#47e1bc',
    colorB: '#ffffff',
    colorC: '#0a4335',
    lensWarp: 0.5, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement
    colorVoiceA: '#47e1bc',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 2.4, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the field
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.35, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 0.9, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#47e1bc',
    colorGroundB: '#0a4335',
    colorGroundStain: '#3a4a46', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48)
    detailSize: 0.5, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 1.92, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.08, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#e7fff8',
    colorDetailB: '#47e1bc',
    colorDetailC: '#0a4335',

    /* --- 5 · hero rig --- */
    heroSize: 3, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 1.08, // how far the rig rises, drops or arcs, metres
    heroSpin: 1, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 0.99, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    colorHeroA: '#e7fff8',
    colorHeroB: '#47e1bc',
    colorHeroC: '#0a4335',

    /* --- 6 · shed --- */
    dustRate: 40, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#e7fff8',
    colorDustB: '#47e1bc',
    colorDustC: '#0a4335',
    colorDustD: '#1a140e',
    streakRate: 60, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#e7fff8',
    colorStreakC: '#47e1bc',
    colorStreakD: '#47e1bc',
    chipRate: 14.4, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#47e1bc',
    colorChipB: '#e7fff8',
    colorChipC: '#0a4335',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#e7fff8',
    colorMoteC: '#47e1bc',
    colorMoteD: '#47e1bc',

    /* --- 8 · the beat --- */
    impactShake: 0.33, // camera punch on the beat
    impactFlash: 0.11, // screen flash on the beat
    colorFlash: '#e7fff8',
    burstRadius: 2.3, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.04, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 4, // fragments thrown up and out on the beat
    impactDust: 8, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#47e1bc',
    colorBurstC: '#0a4335',
    shockRadius: 3.2, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#47e1bc',
    colorShockB: '#ffffff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 2.4, // aftershock ring size, metres
    aftershockShake: 0.13, // camera punch of the aftershock
    aftershockLight: 4.9, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 1.15, // reach of the blow, metres
    hitImpulse: 6.8, // how hard bodies are thrown
    hitLift: 3.84, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.5, // 0..1 how far a felled body is stained
    markTime: 0.25, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#3a4a46', // what the body is stained toward
    colorMarkRim: '#47e1bc',
    markRimGlow: 1.44, // rim light on a marked body
    colorMarkEdge: '#e7fff8',
    markEdgeGlow: 2.34, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.3, // ribbon width at the head, metres
    trailLife: 0.9, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0, // strength of the ribbon
    trailGlow: 0.99, // brightness of the ribbon
    trailCore: 0.4, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 0.6, // width of the scar on the floor, metres
    scarLife: 2.6, // seconds the scar takes to cool and go
    scarOpacity: 0, // strength of the scar
    scarGlow: 1.44, // brightness of its hot seam
    colorScarA: '#47e1bc',
    colorScarB: '#0a4335',
    wakeSpacing: 0, // metres between wake decals along the path (0 = none)
    wakeRadius: 0.7, // size of each wake decal, metres
    wakeLife: 1.6, // seconds each wake decal lingers
    wakeChips: 1.6, // fragments thrown at each wake

    /* --- 15 · the shear blades (upgrade) --- */
    frontWidth: 4.6, // span of each scythe blade, horn to horn, metres
    frontHeight: 1.25, // how far its crescent arcs up (the sagitta), metres
    frontDepth: 0.3, // how far its horns trail back, × span
    frontSkew: 0.3, // radians each blade's face swings across as it runs
    frontGrow: 0.12, // seconds a blade takes to open off the fist
    frontOpacity: 0.95, // strength of the dark body of the blades
    frontFlow: 6, // speed of the streaks racing along the blades
    frontFlutter: 0.03, // how much the blades shiver
    crashTime: 0.28, // seconds the blades take to run on past the crossing
    crashPitch: 0.5, // radians the blades pitch forward as they tear apart
    crashLunge: 5.5, // metres the blades run on past the crossing (the X's far arms)

    /* --- 16 · the debris spiral (upgrade) --- */
    rotorLength: 4.6, // length of the spiral of debris rolling over the group, metres
    rotorRadius: 1, // radius of the spiral, metres
    rotorGrow: 0.32, // seconds it takes to wind up
    rotorSpin: 9, // radians/second it rolls
    rotorSpinDown: 1.4, // seconds its roll slows over, × global lifetime
    rotorDrift: 1.6, // metres it drifts on past the group
    rotorSway: 0.45, // metres it sways side to side
    rotorSwayRate: 2.2, // sway rate (radians/second)
    rotorLift: 0.9, // metres it lifts as it unwinds
    rotorExitAt: 1.4, // fade progress it starts to unwind at
    rotorOpacity: 1, // strength of the debris ribbons
    rotorFlow: 4.5, // speed of the debris running round the spiral
    rotorFlutter: 0.04, // how much the ribbons flutter
    coreOpacity: 0, // strength of the old translucent body inside the roll (0 = none: the wind is read by what it carries)
    coreSize: 0.85, // its radius, × the roll's

    /* --- 17 · the wind's look (upgrade) --- */
    windStreaks: 1.2, // brightness of the flow streaks
    windFresnel: 0.7, // rim brightening at grazing angles
    colorWindCore: '#f2fffb', // white cutting edge
    colorWindTint: '#9ff5dc', // pale mint
    colorWindBody: '#1f9e80', // saturated teal
    colorWindDeep: '#04211b', // deep teal, carries the mass
    leafRate: 150, // leaves per second torn up along the blades / flung round the spiral
    leafSize: 0.17, // leaf size
    leafSpeed: 5.5, // metres/second they are flung at
    leafLife: 0.9, // seconds a leaf lives
    leafFall: 2.5, // how hard they fall (gravity)
    colorLeafA: '#3e4a28',
    colorLeafB: '#26301a',
    colorLeafC: '#151c0e',
    colorLeafD: '#0b0f08',

    /* --- 18 · the gash (upgrade) --- */
    scourWidth: 1.5, // width of each gash at the crossing, metres
    scourCross: 0.65, // half-angle the two sweeps cross at over the group, radians (sets how wide they swing out)
    scourOpacity: 0.95, // strength of the gashes
    scourGlow: 1, // fresh dust right behind the blades
    scourErodeAt: 1.6, // fade progress the gashes start to break up at
    eddyRadius: 1.3, // radius of the torn patch where the blades cross, metres
    eddySpin: 2, // how fast its combed arms turn (radians/second, slowing with the spiral)

    /* --- 19 · blades & debris (upgrade) --- */
    bladeReach: 3.2, // most the two sweeps swing out from the line, metres
    bladeRoll: 0.6, // radians each blade is tilted, opposite ways, so the pair crosses as an X
    bladeSweep: 0.5, // radians the tilt swings through over the run (the scythe stroke)
    bladeThickness: 0.16, // thickness at the spine, metres
    bladeEdge: 2.4, // brightness of the cutting edge
    bladeLift: 1.15, // height of the blade's middle, metres
    bladeFade: 0.45, // seconds a blade takes to tear apart after the crossing
    bladeWisp: 0.6, // how far the trailing horn frays into wisps
    debrisCount: 220, // turf clods, grit and stones the blades tear up (max 240)
    debrisSize: 0.34, // mean clod size, metres
    debrisSizeJitter: 0.35, // ± fraction of that
    debrisBand: 1.9, // width of the band of debris each blade drags, metres
    debrisLift: 4.2, // metres/second the clods are thrown up
    debrisCarry: 5, // metres the clods are dragged on after the blade
    debrisGravity: 13, // how hard they fall
    debrisSpin: 9, // radians/second they tumble
    debrisGlow: 0.15, // teal rim light on the clods
    debrisShadow: 1, // 1 = the clods cast shadows
    debrisCaught: 0.3, // share of the clods near the group the spiral catches and rolls round before flinging them down
    colorDebrisA: '#36421f', // turf
    colorDebrisB: '#3f2c1b', // soil
    colorDebrisC: '#33373a', // grit and stone
    gashReach: 6.5, // metres before the crossing the blades bite into the floor (the X's near arms)
    gashTaper: 0.35, // gash width where the bite starts, × its width at the crossing
    gashDepth: 0.9, // how dark the gouged middle of a gash is
    gashLip: 1 // brightness of the torn turf lips

  }
};
