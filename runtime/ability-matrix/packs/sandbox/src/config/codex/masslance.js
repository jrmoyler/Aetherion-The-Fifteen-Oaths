/**
 * Mass Lance — gravity — a drilling blade riding the line.
 *
 * Gravity — a dense lance pins the line and drags it forward.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'masslance',
  meta: {
    label: 'Mass Lance',
    accent: '#d7c6b2',
    key: '',
    element: 'gravity',
    hint: 'Gravity — a dense lance pins the line and drags it forward',
    cast: 'line',
    glyph: '<path d="M14 50H70"/><path d="M62 38L86 50L62 62"/><path d="M22 40V60"/><path d="M30 50H70"/><circle cx="78" cy="72" r="3"/><path d="M78 60V66M78 78V84M66 72H72M84 72H90"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 21.6, // metres/second the front travels
    lifetime: 2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast2', // which clip the body throws
    impactTime: 1.15, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 0, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#a87857',
    lightIntensity: 7.2, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.1, // 0..1 how much it shimmers
    impactLight: 8.8, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.27, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 11, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 1.54, // radians/second the body turns
    thickness: 0.28, // width of a single body part, metres
    count: 7, // parts in the body (max 12)
    height: 3.05, // how tall the body stands, metres
    sweep: 1.45, // lateral reach, metres
    lean: 0.65, // how far the body opens on the beat
    bodyOpacity: 0, // the template's ring placements: off, the lance carries the read
    edgeGlow: 0,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.29,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 5, // breaths per second (radians)
    colorA: '#a87857',
    colorB: '#fff8ee',
    colorC: '#24180f',
    lensWarp: 1.27, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off)
    colorVoiceA: '#a87857',
    colorVoiceB: '#fff8ee',

    /* --- 3 · the ground --- */
    groundWidth: 2.4, // footprint width, metres
    groundGlow: 0.8,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0.6, // strength of the field (the trench sits on it)
    groundHeat: 1.1, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.05, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 0.9, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#a87857',
    colorGroundB: '#24180f',
    colorGroundStain: '#1a1a20', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48) — off: the cream spheres crowded the caster
    detailSize: 0.7, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 0.72, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.08, // rim light on the pieces
    detailOpacity: 1, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    detailRough: 0.55, // roughness of the lit pieces
    detailMetal: 0.45, // metalness of the lit pieces
    detailShadow: 1, // 1 = the pieces cast shadows
    colorDetailA: '#d7c6b2',
    colorDetailB: '#a87857',
    colorDetailC: '#24180f',

    /* --- 5 · hero rig --- */
    heroSize: 1.8, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 0.54, // how far the rig rises, drops or arcs, metres
    heroSpin: 1, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 0.99, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is — off: the lance is the hero now
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    heroRough: 0.55, // roughness of the lit rig
    heroMetal: 0.45, // metalness of the lit rig
    heroShadow: 1, // 1 = the rig casts shadows
    colorHeroA: '#d7c6b2',
    colorHeroB: '#a87857',
    colorHeroC: '#24180f',

    /* --- 6 · shed --- */
    dustRate: 80, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#d7c6b2',
    colorDustB: '#a87857',
    colorDustC: '#24180f',
    colorDustD: '#1a140e',
    streakRate: 45, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#fff8ee',
    colorStreakB: '#d7c6b2',
    colorStreakC: '#a87857',
    colorStreakD: '#a87857',
    chipRate: 43.2, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#a87857',
    colorChipB: '#d7c6b2',
    colorChipC: '#24180f',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#fff8ee',
    colorMoteB: '#d7c6b2',
    colorMoteC: '#a87857',
    colorMoteD: '#a87857',

    /* --- 8 · the beat --- */
    impactShake: 0.77, // camera punch on the beat
    impactFlash: 0.13, // screen flash on the beat
    colorFlash: '#d7c6b2',
    burstRadius: 2.3, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 41, // fragments thrown up and out on the beat
    impactDust: 26, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#fff8ee',
    colorBurstB: '#a87857',
    colorBurstC: '#24180f',
    shockRadius: 0, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#a87857',
    colorShockB: '#c47a3e',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 0, // aftershock ring size, metres
    aftershockShake: 0.31, // camera punch of the aftershock
    aftershockLight: 5.6, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 1.15, // reach of the blow, metres
    hitImpulse: 11.05, // how hard bodies are thrown
    hitLift: 1.92, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.85, // 0..1 how far a felled body is stained
    markTime: 0.5, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 23.4, // motes per second off a freshly marked body
    colorMarkBody: '#1a1a20', // what the body is stained toward
    colorMarkRim: '#a87857',
    markRimGlow: 1.44, // rim light on a marked body
    colorMarkEdge: '#d7c6b2',
    markEdgeGlow: 2.34, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.42, // ribbon width at the head, metres
    trailLife: 1.6, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0.35, // strength of the ribbon
    trailGlow: 0.99, // brightness of the ribbon
    trailCore: 0.2, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 0.9, // width of the scar on the floor, metres
    scarLife: 2.6, // seconds the scar takes to cool and go
    scarOpacity: 0.85, // strength of the scar
    scarGlow: 1.44, // brightness of its hot seam
    colorScarA: '#a87857',
    colorScarB: '#24180f',
    wakeSpacing: 0, // metres between wake decals along the path (0 = none)
    wakeRadius: 0.9, // size of each wake decal, metres
    wakeLife: 1.6, // seconds each wake decal lingers
    wakeChips: 4.8, // fragments thrown at each wake

    /* --- 15 · the lance (the signature) --- */
    lanceLength: 4.8, // metres, pommel to point
    lanceRadius: 0.5, // the vamplate (guard disc) radius, metres; shaft, head and pommel scale with it
    lanceHover: 1.5, // height of its middle as it rides the line, metres
    lancePitch: 0.05, // head down while it rides, radians
    lanceLead: 0.6, // metres its middle runs ahead of the head of the line
    lanceLob: 1.6, // extra height at the middle of its flight: a visible lob down the line, metres
    lanceLobTilt: 1.0, // how far its pitch follows the lob (head up leaving, head down arriving)
    lanceRoll: 0, // radians/second it rolls about its own axis (0 keeps the blade face to the caster)
    lanceYaw: 1.2, // radians it is turned across the line in flight, so its length shows side-on from behind
    lancePlantYaw: 0.95, // radians the planted lean is turned across the line, so the diagonal reads on screen
    lanceTurnAt: 0.55, // share of the flight after which the counterweight swings down to plant pommel-first
    lanceDriveTime: 0.14, // seconds it takes to drive into the floor on the beat, × global lifetime
    lanceStab: 0.92, // planted lean: head up from the floor, radians (steep diagonal)
    lanceBury: 0.45, // metres the pommel goes under on the beat
    lanceSlide: 0.4, // metres its momentum carries it on as it drives in
    lanceSink: 0.75, // metres it sinks further over the linger
    lanceSeamGlow: 2.4, // copper seams
    lanceNoseGlow: 1.8, // the hot leaf head: its edges and point
    lanceRimGlow: 0.15, // pale limb
    lancePulseRate: 1.1, // pulses of weight tail to nose per second
    lanceRough: 0.42,
    lanceMetal: 0.45,
    lanceOpacity: 1, // 0 hides the lance
    lanceShadow: 1, // 1 = the lance casts shadows
    colorLanceDeep: '#0a0706', // deep: lead in shadow
    colorLanceBody: '#3a2c22', // body: lead in the sun
    colorLanceSeam: '#c47a3e', // tint: copper heat
    colorLanceCore: '#fff3dc', // core: the nose

    /* --- 16 · the trench --- */
    trenchWidth: 1.7, // metres, lip to lip
    trenchLip: 0.2, // lip height, metres
    trenchStart: 2.2, // metres from the caster the trench begins
    trenchLag: 0.02, // how far short of the pommel it ends, × lance length
    trenchGlow: 1.8, // the copper seam down the bed
    trenchCool: 4.5, // metres back from the lance the seam cools over
    trenchPulseSpeed: 7, // pulses drawn along the bed toward the lance
    trenchSettle: 0.6, // the lips slump to this share of their height over the linger
    trenchCloseAt: 1.72, // clock (0..2) it starts closing
    trenchDustRate: 40, // dust sliding down the walls per second
    colorTrenchStone: '#2b2420',
    collarRadius: 1.35, // the crush ring where it goes in, metres
    collarHeight: 0.42, // metres
    collarGlow: 1.6, // hot cracks on its inner face
    crushRadius: 2.6, // the crush field round the buried lance, metres
    crushOpacity: 0.85,
    crushGlow: 1.2,
    crushPull: 0.9 // how fast the striations are dragged in
  }
};
