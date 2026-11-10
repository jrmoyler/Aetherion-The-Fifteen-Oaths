/**
 * Vector Halo — force — a ring that walks, then commits.
 *
 * Force — vectors ring the rim and release tangent when the ring locks.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'vectorhalo',
  meta: {
    label: 'Vector Halo',
    accent: '#ffe8d2',
    key: '',
    element: 'force',
    hint: 'Force — vectors ring the rim and release tangent when the ring locks',
    cast: 'zone',
    glyph: '<circle cx="50" cy="50" r="28"/><circle cx="50" cy="50" r="10"/><path d="M50 8V18M50 82V92M8 50H18M82 50H92"/><path d="M36 36L64 64M64 36L36 64"/><path d="M66 72H90M82 64L90 72L82 80"/>'
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
    lightColor: '#f46a25',
    lightIntensity: 4.5, // the glow riding the cast
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
    bodyOpacity: 0, // the template body sheet (off: the vectors carry the read)
    edgeGlow: 1.16,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.32,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 6, // breaths per second (radians)
    colorA: '#f46a25',
    colorB: '#ffffff',
    colorC: '#471b06',
    lensWarp: 0, // off: the body shape it warps is gone // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off: the scoured floor carries it)
    colorVoiceA: '#f46a25',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 9, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the field (off: it read as a red disc; the scoured char floor carries it)
    groundLand: 0.32, // seconds the field takes to land out to the rim after the beat
    groundHeat: 1.1, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.08, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundTelegraph: 0.32, // how strongly the footprint shows before the beat
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 1.05, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#8a2c0c',
    colorGroundB: '#471b06',
    colorGroundStain: '#120806', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48; off: the vectors are the pieces)
    detailSize: 0.6, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 0.9, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.2, // rim light on the pieces
    detailOpacity: 1, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    detailRough: 0.5, // roughness of the lit pieces
    detailMetal: 0.3, // metalness of the lit pieces
    detailShadow: 1, // 1 = the pieces cast shadows
    colorDetailA: '#ffe8d2',
    colorDetailB: '#f46a25',
    colorDetailC: '#471b06',

    /* --- 5 · hero rig --- */
    heroSize: 1.4, // scale of the hero rig, metres per authored unit
    heroReach: 0.85, // ring rigs: share of the circle radius they span
    heroLift: 0.6, // how far the rig rises, drops or arcs, metres
    heroSpin: 1.2, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.1, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is (off: the flat template ring; the cast-local vectors are the hero)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroFit: 0.72, // mass rigs grow to at least this share of the circle radius (heroSize is the floor)
    heroRough: 0.5, // roughness of the lit rig
    heroMetal: 0.3, // metalness of the lit rig
    heroShadow: 1, // 1 = the rig casts shadows
    colorHeroA: '#ffe8d2',
    colorHeroB: '#f46a25',
    colorHeroC: '#471b06',

    /* --- 6 · shed --- */
    dustRate: 72, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#ffe8d2',
    colorDustB: '#f46a25',
    colorDustC: '#471b06',
    colorDustD: '#1a140e',
    streakRate: 90, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#ffe8d2',
    colorStreakC: '#f46a25',
    colorStreakD: '#f46a25',
    chipRate: 36, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#f46a25',
    colorChipB: '#ffe8d2',
    colorChipC: '#471b06',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#ffe8d2',
    colorMoteC: '#f46a25',
    colorMoteD: '#f46a25',

    /* --- 8 · the beat --- */
    impactShake: 0.72, // camera punch on the beat
    impactFlash: 0.06, // screen flash on the beat
    colorFlash: '#ffe8d2',
    burstRadius: 3.8, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.06, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 34, // fragments thrown up and out on the beat
    impactDust: 23, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#f46a25',
    colorBurstC: '#471b06',
    shockRadius: 6.5, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#f46a25',
    colorShockB: '#ffffff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 5, // aftershock ring size, metres
    aftershockShake: 0.29, // camera punch of the aftershock
    aftershockLight: 6.3, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 4.4, // reach of the blow, metres
    hitImpulse: 13.3, // how hard bodies are thrown
    hitLift: 3.2, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.7, // 0..1 how far a felled body is stained
    markTime: 0.3, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 23.4, // motes per second off a freshly marked body
    colorMarkBody: '#2a1410', // what the body is stained toward
    colorMarkRim: '#f46a25',
    markRimGlow: 1.6, // rim light on a marked body
    colorMarkEdge: '#ffe8d2',
    markEdgeGlow: 2.6, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 14 · the vectors (cast-local hero) --- */
    vectorCount: 12, // forged arrows in the ring (max 16)
    ringFit: 0.82, // ring radius, × the circle
    ringHeight: 1.1, // height the ring walks at, metres
    ringWalk: 2.4, // how fast the ring walks round while it fills, rad/s
    arrowLength: 1.9, // tail to tip, metres
    arrowSpan: 0.9, // across the barbed head, metres
    arrowThick: 0.14, // blade thickness, metres
    arrowBank: 0.55, // how far each vector banks off vertical in the ring, radians (shows its face to every side)
    streamSpread: 0.45, // share of the travel over which the vectors leave the hand, one after another
    streamTime: 0.5, // share of the travel one vector takes to reach the ring
    streamArc: 1.6, // how high the stream arcs, metres
    streamScale: 0.4, // size of a vector leaving the hand, × full
    lockHold: 0.32, // seconds the locked ring holds, charged, before it releases, × global lifetime
    lockKick: 0.45, // how far each vector snaps forward into its slot on the lock, metres
    lockQuiver: 0.08, // the charged quiver while it holds, radians
    flightTime: 0.38, // seconds a released vector flies, × global lifetime
    flightReach: 4.4, // how far it flies along its tangent, metres
    flightFlare: 0.12, // how far its flight bends outward, × the reach
    flightRise: 0.35, // the small rise before it dips, metres
    flightSparks: 300, // sparks per second streaming off the whole released ring
    embedPitch: 0.62, // how steeply it stabs nose-first into the floor, radians
    embedDepth: 0.35, // how deep the nose goes in, metres
    embedQuiver: 0.16, // how hard it quivers when it lands, radians
    coolRate: 2.4, // how fast a landed vector cools from ember to iron
    vectorExit: 0.45, // seconds the vectors take to shatter on the exit, × global lifetime
    landScorch: 0.75, // scorch under each landed vector, metres
    landChips: 5, // chips thrown off each landing
    landDust: 5, // dust kicked off each landing
    landLight: 5, // light punch of the landings
    landShake: 0.22, // camera punch as the volley lands

    /* --- 15 · forged iron and the floor --- */
    arrowSpecular: 1.4, // sun glint on the bevels
    arrowFresnel: 0.6, // ember rim at grazing angles
    arrowAmbient: 0.28, // how much of the iron shows away from the sun
    arrowEdgeGlow: 0.8, // forge heat in the head, toward the tip
    arrowChargeGlow: 0.7, // the charge flooding the blade on the lock and in flight
    colorArrowCore: '#fff0dc', // white-hot core
    colorArrowTint: '#ffb27a', // pale ember glint
    colorArrowBody: '#f05a1a', // saturated orange
    colorArrowDeep: '#0b0503', // near-black iron
    colorArrowIron: '#2c2522', // forged iron albedo
    sweepOpacity: 0.85, // the scoured floor and the gouges
    gougeWidth: 0.2, // half-width of a gouge at the rim, metres
    gougeGlow: 0.8, // ember in the fresh gouges
    colorGougeChar: '#0e0907' // the char the floor is scoured to
  }
};
