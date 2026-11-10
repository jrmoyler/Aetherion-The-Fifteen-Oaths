/**
 * Mirror Halo — illusion — a ring that walks, then commits.
 *
 * Illusion — three mirror rings walk the rim and disagree about where it is.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'mirrorhalo',
  meta: {
    label: 'Mirror Halo',
    accent: '#ffe0f4',
    key: '',
    element: 'illusion',
    hint: 'Illusion — three mirror rings walk the rim and disagree about where it is',
    cast: 'zone',
    glyph: '<circle cx="50" cy="50" r="28"/><circle cx="50" cy="50" r="10"/><path d="M50 8V18M50 82V92M8 50H18M82 50H92"/><path d="M36 36L64 64M64 36L36 64"/><path d="M66 72Q78 60 90 72Q78 84 66 72Z"/><circle cx="78" cy="72" r="3"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 28.8, // metres/second the front travels
    lifetime: 2.2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast3', // which clip the body throws
    impactTime: 1.25, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 4.7, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#f25fb8',
    lightIntensity: 3.5, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.6, // 0..1 how much it shimmers
    impactLight: 6, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.32, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 24.2, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 3.3, // radians/second the body turns
    thickness: 0.34, // width of a single body part, metres
    count: 8, // parts in the body (max 12)
    height: 3.5, // how tall the body stands, metres
    sweep: 1.8, // lateral reach, metres
    lean: 0.85, // how far the body opens on the beat
    bodyOpacity: 0, // the template braid body; off — the mirrors are the body now
    edgeGlow: 1.27,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.35,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 6, // breaths per second (radians)
    colorA: '#f25fb8',
    colorB: '#ffffff',
    colorC: '#5c0a3c',
    lensWarp: 1.4, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement
    colorVoiceA: '#f25fb8',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 9, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the field (off: the mirror pool is the floor)
    groundLand: 0.32, // seconds the field takes to land out to the rim after the beat
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.25, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundTelegraph: 0.32, // how strongly the footprint shows before the beat
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 1.05, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#f25fb8',
    colorGroundB: '#5c0a3c',
    colorGroundStain: '#3a1a34', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48)
    detailSize: 0.6, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 0.9, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.32, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#ffe0f4',
    colorDetailB: '#f25fb8',
    colorDetailC: '#5c0a3c',

    /* --- 5 · hero rig --- */
    heroSize: 1.4, // scale of the hero rig, metres per authored unit
    heroReach: 0.85, // ring rigs: share of the circle radius they span
    heroLift: 0.6, // how far the rig rises, drops or arcs, metres
    heroSpin: 1.2, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.21, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is (off: the mirror rings replace the flat panels)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroFit: 0.72, // mass rigs grow to at least this share of the circle radius (heroSize is the floor)
    colorHeroA: '#ffe0f4',
    colorHeroB: '#f25fb8',
    colorHeroC: '#5c0a3c',

    /* --- 6 · shed --- */
    dustRate: 32, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#ffe0f4',
    colorDustB: '#f25fb8',
    colorDustC: '#5c0a3c',
    colorDustD: '#1a140e',
    streakRate: 99, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#ffe0f4',
    colorStreakC: '#f25fb8',
    colorStreakD: '#f25fb8',
    chipRate: 10.8, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#f25fb8',
    colorChipB: '#ffe0f4',
    colorChipC: '#5c0a3c',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#ffe0f4',
    colorMoteC: '#f25fb8',
    colorMoteD: '#f25fb8',

    /* --- 8 · the beat --- */
    impactShake: 0.33, // camera punch on the beat
    impactFlash: 0.04, // screen flash on the beat (kept low)
    colorFlash: '#ffe0f4',
    burstRadius: 3.8, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.1, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 40, // fragments thrown up and out on the beat
    impactDust: 16, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#f25fb8',
    colorBurstC: '#5c0a3c',
    shockRadius: 6.5, // decal size, metres
    shockLife: 0.85,
    shockRing: 0.1, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#f25fb8',
    colorShockB: '#ffffff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 5, // aftershock ring size, metres
    aftershockShake: 0.13, // camera punch of the aftershock
    aftershockLight: 7.7, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 4.4, // reach of the blow, metres
    hitImpulse: 7.6, // how hard bodies are thrown
    hitLift: 3.2, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.6, // 0..1 how far a felled body is stained
    markTime: 0.3, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#3a1a34', // what the body is stained toward
    colorMarkRim: '#f25fb8',
    markRimGlow: 1.76, // rim light on a marked body
    colorMarkEdge: '#ffe0f4',
    markEdgeGlow: 2.86, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the mirrors (the cast's own hero) --- */
    shardHeight: 1.7, // the shard in flight, metres tall
    shardSpin: 14, // its spin on its long axis, radians/second
    shardArc: 1.4, // lob of its flight, metres
    centreHeight: 3.3, // the planted centre mirror, metres
    centreWidth: 1.5,
    ringPanels: 11, // mirrors per ring (three rings)
    panelHeight: 2.7, // the true ring's mirrors, metres (inner 0.8×, outer 0.9×)
    panelFill: 0.72, // a panel's width as a share of its arc while the rings disagree
    lockFill: 1.12, // and once they agree (>1 overlaps into a closed wall)
    ringSpread: 0.34, // how far the inner and outer rings disagree with the rim, × the circle
    ringWobble: 0.07, // breathing in and out while they disagree, × the circle
    ringWalk: 1.5, // how fast the rings walk the rim against each other, radians/second
    riseTime: 0.22, // seconds a ring takes to rise, × global lifetime
    riseStagger: 0.08, // seconds between the rings rising, × global lifetime
    convergeFrom: 0.3, // impact progress (0..1) the rings start to agree at
    convergeTo: 0.72, // and have agreed by — one wall on the true rim
    leanIn: 0.1, // how far the mirrors lean their tops in, radians
    lockSpin: 0.22, // the locked wall's slow turn, radians/second
    lockPulse: 1.2, // frame and rim flare when the wall locks
    lockShake: 0.12, // camera thud when it locks
    lockLight: 5, // light punch when it locks
    crackFrom: 0.85, // onFade clock (1 = fade start) the glass starts cracking at
    fallFrom: 1.12, // onFade clock the first mirrors start to fall at
    fallStagger: 0.45, // scatter of the fall across the panels, onFade clock
    fallTime: 0.3, // how long one mirror takes to tip and sink, onFade clock
    fallChips: 7, // lit glass chips a falling mirror sheds
    mirrorRough: 0.16,
    mirrorMetal: 0.85,
    mirrorRim: 0.5, // fresnel rim in the spell hue
    mirrorReflect: 0.95, // strength of the fake reflection
    mirrorSweep: 0.35, // speed of the streak across the glass
    mirrorStreak: 0.7, // brightness of the streak
    mirrorFrame: 0.3, // glow of the cusped frame
    crackGlow: 1.6, // glow of the cracks
    colorMirror: '#121118', // the glass albedo (deep)
    colorMirrorSky: '#6a7290', // what the glass reflects (tint)
    colorMirrorFloor: '#141a2e', // what the glass reflects below the horizon (deep)
    colorMirrorRim: '#8a90b0', // fresnel rim: cold glass, not the spell hue
    colorCrack: '#ff4fb8', // white-hot crack core

    /* --- 13 · the mirror pool --- */
    poolReach: 1.42, // pool radius, × the circle
    poolOpacity: 0.95,
    poolGlow: 0.8, // brightness of its cracks
    poolCracks: 12, // radial cracks
    colorPoolDeep: '#0d030a' // the dark of the pool
  }
};
