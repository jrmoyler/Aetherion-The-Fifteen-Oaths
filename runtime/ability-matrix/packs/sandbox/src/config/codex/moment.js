/**
 * Moment Swing — force — a blade hinged at the hand.
 *
 * Force — a moment arm swings and delivers its load at the stop.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'moment',
  meta: {
    label: 'Moment Swing',
    accent: '#ffe4cc',
    key: '',
    element: 'force',
    hint: 'Force — a moment arm swings and delivers its load at the stop',
    cast: 'line',
    glyph: '<path d="M50 16V28"/><path d="M18 78L50 28L82 70"/><circle cx="50" cy="18" r="5"/><path d="M30 50H70"/><path d="M66 72H90M82 64L90 72L82 80"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 29.7, // metres/second the front travels
    lifetime: 2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast2', // which clip the body throws
    impactTime: 1.15, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 0, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#f46b25',
    lightIntensity: 8, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.2, // 0..1 how much it shimmers
    impactLight: 9.9, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.27, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 22, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 1.98, // radians/second the body turns
    thickness: 0.28, // width of a single body part, metres
    count: 7, // parts in the body (max 12)
    height: 3.05, // how tall the body stands, metres
    sweep: 1.45, // lateral reach, metres
    lean: 0.65, // how far the body opens on the beat
    bodyOpacity: 0, // the template's hinge body; off — the maul is the body now
    edgeGlow: 1.85,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.32,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 5, // breaths per second (radians)
    colorA: '#f46b25',
    colorB: '#ffffff',
    colorC: '#471c06',
    lensWarp: 0, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off: it drew a frame-wide arc line)
    colorVoiceA: '#f46b25',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 2.4, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the field
    groundHeat: 1.1, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.08, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 0.9, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#f46b25',
    colorGroundB: '#471c06',
    colorGroundStain: '#2a1410', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48); off — the crater throws real chips
    detailSize: 0.6, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 1.6, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.2, // rim light on the pieces
    detailOpacity: 1, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    detailRough: 0.5, // roughness of the lit pieces
    detailMetal: 0.3, // metalness of the lit pieces
    detailShadow: 1, // 1 = the pieces cast shadows
    colorDetailA: '#ffe4cc',
    colorDetailB: '#f46b25',
    colorDetailC: '#471c06',

    /* --- 5 · hero rig --- */
    heroSize: 3, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 0.9, // how far the rig rises, drops or arcs, metres
    heroSpin: 1, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.1, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is (off: the maul replaces the template hammer)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    heroRough: 0.5, // roughness of the lit rig
    heroMetal: 0.3, // metalness of the lit rig
    heroShadow: 1, // 1 = the rig casts shadows
    colorHeroA: '#ffe4cc',
    colorHeroB: '#f46b25',
    colorHeroC: '#471c06',

    /* --- 6 · shed --- */
    dustRate: 72, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#ffe4cc',
    colorDustB: '#f46b25',
    colorDustC: '#471c06',
    colorDustD: '#1a140e',
    streakRate: 90, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#ffe4cc',
    colorStreakC: '#f46b25',
    colorStreakD: '#f46b25',
    chipRate: 36, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#f46b25',
    colorChipB: '#ffe4cc',
    colorChipC: '#471c06',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#ffe4cc',
    colorMoteC: '#f46b25',
    colorMoteD: '#f46b25',

    /* --- 8 · the beat --- */
    impactShake: 0.72, // camera punch on the beat
    impactFlash: 0.05, // screen flash on the beat (kept low: the light punch carries it)
    colorFlash: '#ffe4cc',
    burstRadius: 2.3, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 70, // fragments thrown up and out on the beat
    impactDust: 30, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#f46b25',
    colorBurstC: '#471c06',
    shockRadius: 3.2, // decal size, metres
    shockLife: 0.85,
    shockRing: 0.12, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#f46b25',
    colorShockB: '#ffffff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 2.4, // aftershock ring size, metres
    aftershockShake: 0.29, // camera punch of the aftershock
    aftershockLight: 6.3, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 1.15, // reach of the blow, metres
    hitImpulse: 11.9, // how hard bodies are thrown
    hitLift: 3.2, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.7, // 0..1 how far a felled body is stained
    markTime: 0.3, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 23.4, // motes per second off a freshly marked body
    colorMarkBody: '#2a1410', // what the body is stained toward
    colorMarkRim: '#f46b25',
    markRimGlow: 1.6, // rim light on a marked body
    colorMarkEdge: '#ffe4cc',
    markEdgeGlow: 2.6, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.3, // ribbon width at the head, metres
    trailLife: 0.9, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0, // strength of the ribbon
    trailGlow: 1.1, // brightness of the ribbon
    trailCore: 0.4, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 0.6, // width of the scar on the floor, metres
    scarLife: 2.6, // seconds the scar takes to cool and go
    scarOpacity: 0, // strength of the scar
    scarGlow: 1.6, // brightness of its hot seam
    colorScarA: '#f46b25',
    colorScarB: '#471c06',
    wakeSpacing: 0, // metres between wake decals along the path (0 = none)
    wakeRadius: 0.7, // size of each wake decal, metres
    wakeLife: 1.6, // seconds each wake decal lingers
    wakeChips: 4, // fragments thrown at each wake

    /* --- 13 · the maul (the cast's own hero) --- */
    maulScale: 1.35, // × the authored maul (3.5 m long, 1.8 m head); 0 hides it
    flightHeight: 1.3, // height of its centre of mass leaving the hand, metres
    flightArc: 0.5, // extra height at the top of the lob, metres
    flightTurns: 1.25, // end-over-end turns down the line; the last quarter always lands head-down
    plantTilt: 0.2, // lean of the planted haft back toward the caster, radians
    plantSink: 0.32, // how deep the head buries, metres
    rockAmp: 0.5, // swing of the planted maul right after the slam, radians
    rockRate: 7.5, // rocking frequency, radians/second
    rockDamp: 1.5, // how fast the rocking dies, 1/seconds
    rockDust: 90, // dust puffs per second off the buried head at full swing speed
    sinkFrom: 1.4, // fade clock (1 = fade start, 2 = end) the maul starts sinking at
    sinkOut: 2.2, // how far it sinks by the end, metres
    maulGlow: 2, // brightness of the hot seams
    maulRim: 0.45, // fresnel rim in the body hue
    maulRough: 0.42,
    maulMetal: 0.75,
    maulHeatFlight: 0.3, // how hot the seams run in flight
    maulHeatSlam: 1.3, // how hot the faces flash on the slam (>1 white-hot)
    maulCool: 0.9, // seconds for the faces to cool by ~63 %, × global lifetime
    colorMaulIron: '#2b1e18', // the iron albedo (deep)
    colorMaulHot: '#ff8a35', // the hot seam / fissure tone

    /* --- 14 · the crater --- */
    craterRadius: 2.6, // metres (× √explosionIntensity)
    craterOpen: 0.22, // seconds for the fissures to run out
    craterOpacity: 0.95,
    craterGlow: 2.4, // fissure brightness
    craterCracks: 9, // radial fissures
    colorCraterDeep: '#100503' // the dark of the bowl
  }
};
