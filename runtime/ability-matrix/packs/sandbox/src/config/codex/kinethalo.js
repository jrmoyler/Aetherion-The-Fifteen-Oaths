/**
 * Kinetic Halo — motion — a ring that walks, then commits.
 *
 * Motion — a ring of stored momentum orbits, then dumps it tangent.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'kinethalo',
  meta: {
    label: 'Kinetic Halo',
    accent: '#ffe6d4',
    key: '',
    element: 'motion',
    hint: 'Motion — a ring of stored momentum orbits, then dumps it tangent',
    cast: 'zone',
    glyph: '<circle cx="50" cy="50" r="28"/><circle cx="50" cy="50" r="10"/><path d="M50 8V18M50 82V92M8 50H18M82 50H92"/><path d="M36 36L64 64M64 36L36 64"/><path d="M66 66H86M70 72H90M66 78H86"/>'
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
    zoneRadius: 4.7, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#fa5b38',
    lightIntensity: 2.6, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.3, // 0..1 how much it shimmers
    impactLight: 4, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.32, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 37.4, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 4.2, // radians/second the body turns
    thickness: 0.34, // width of a single body part, metres
    count: 8, // parts in the body (max 12)
    height: 3.5, // how tall the body stands, metres
    sweep: 1.8, // lateral reach, metres
    lean: 0.85, // how far the body opens on the beat
    bodyOpacity: 0.05, // the template sigil: a trace only, the flywheel carries the read
    edgeGlow: 1.16,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.32,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 6, // breaths per second (radians)
    colorA: '#fa5b38',
    colorB: '#ffffff',
    colorC: '#5e1708',
    lensWarp: 1.1, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off)
    colorVoiceA: '#fa5b38',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 9, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0.25, // strength of the field (under the scraped floor)
    groundLand: 0.32, // seconds the field takes to land out to the rim after the beat
    groundHeat: 1.1, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.1, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundTelegraph: 0.32, // how strongly the footprint shows before the beat
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 1.05, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#fa5b38',
    colorGroundB: '#5e1708',
    colorGroundStain: '#2a2a30', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48) — off: they sat on the disc as clutter
    detailSize: 0.5, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 0.72, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.2, // rim light on the pieces
    detailOpacity: 1, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    detailRough: 0.38, // roughness of the lit pieces
    detailMetal: 0.62, // metalness of the lit pieces
    detailShadow: 1, // 1 = the pieces cast shadows
    colorDetailA: '#ffe6d4',
    colorDetailB: '#fa5b38',
    colorDetailC: '#5e1708',

    /* --- 5 · hero rig --- */
    heroSize: 1.4, // scale of the hero rig, metres per authored unit
    heroReach: 0.85, // ring rigs: share of the circle radius they span
    heroLift: 0.48, // how far the rig rises, drops or arcs, metres
    heroSpin: 1.2, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.1, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is — off: the flywheel is the hero now
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroFit: 0.72, // mass rigs grow to at least this share of the circle radius (heroSize is the floor)
    heroRough: 0.38, // roughness of the lit rig
    heroMetal: 0.62, // metalness of the lit rig
    heroShadow: 1, // 1 = the rig casts shadows
    colorHeroA: '#ffe6d4',
    colorHeroB: '#fa5b38',
    colorHeroC: '#5e1708',

    /* --- 6 · shed --- */
    dustRate: 72, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#ffe6d4',
    colorDustB: '#fa5b38',
    colorDustC: '#5e1708',
    colorDustD: '#1a140e',
    streakRate: 153, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#ffe6d4',
    colorStreakC: '#fa5b38',
    colorStreakD: '#fa5b38',
    chipRate: 25.2, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#fa5b38',
    colorChipB: '#ffe6d4',
    colorChipC: '#5e1708',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#ffe6d4',
    colorMoteC: '#fa5b38',
    colorMoteD: '#fa5b38',

    /* --- 8 · the beat --- */
    impactShake: 0.5, // camera punch on the beat
    impactFlash: 0.13, // screen flash on the beat
    colorFlash: '#ffe6d4',
    burstRadius: 3.8, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 24, // fragments thrown up and out on the beat
    impactDust: 23, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#fa5b38',
    colorBurstC: '#5e1708',
    shockRadius: 6.5, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#fa5b38',
    colorShockB: '#ffffff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 5, // aftershock ring size, metres
    aftershockShake: 0.2, // camera punch of the aftershock
    aftershockLight: 5.6, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 4.4, // reach of the blow, metres
    hitImpulse: 10.45, // how hard bodies are thrown
    hitLift: 2.56, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.5, // 0..1 how far a felled body is stained
    markTime: 0.2, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#2a2a30', // what the body is stained toward
    colorMarkRim: '#fa5b38',
    markRimGlow: 1.6, // rim light on a marked body
    colorMarkEdge: '#ffe6d4',
    markEdgeGlow: 2.6, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 14 · the flywheel (the signature) --- */
    wheelFit: 0.78, // landed radius of the rim's centre line, × the circle
    wheelRim: 0.3, // radial half-width of the rim, metres
    wheelHeight: 0.28, // half-height of the rim, metres
    wheelTooth: 0.26, // how far a ratchet tooth stands proud, metres
    wheelThrowRadius: 0.75, // radius while it rolls down the line, metres
    wheelThrowEase: 1.8, // >1: the wheel spends more of the throw near the hand (presentation only)
    wheelThrowArc: 0.6, // extra height at the middle of the throw, metres
    wheelHover: 0.9, // height it drops from on the beat, metres
    wheelBounce: 0.22, // the bounce after the slam, metres
    wheelSpin: 9, // radians/second it turns on landing
    wheelSpinKeep: 0.25, // share of the spin left at the end
    wheelWobble: 0.34, // radians it tilts off the floor after the slam
    wheelWobbleRate: 3.2, // radians/second the tilt rolls round at first
    wheelChirp: 3.2, // how many times faster the roll gets as it lies down
    wheelSettleAt: 1.45, // clock (0..2: impact then fade) it slaps flat at
    wheelSink: 0.7, // metres it sinks into the floor after it settles
    wheelHeat: 0.9, // friction glow on the teeth
    wheelFlowGlow: 0, // the momentum dashes in the top channel
    wheelFlowRate: 0.35, // dash speed, × spin
    wheelRimGlow: 0, // hot limb
    wheelRough: 0.42,
    wheelMetal: 0.6,
    wheelOpacity: 1, // 0 hides the wheel
    wheelShadow: 1, // 1 = the wheel casts shadows
    colorWheelDeep: '#111216', // deep: the steel in shadow
    colorWheelBody: '#3b3d44', // body: the steel in the sun
    colorWheelHot: '#fa5b38', // tint: friction
    colorWheelCore: '#ffe6d4', // core: white-hot dashes
    smearOpacity: 0.3, // the speed smear in the wheel's plane

    /* --- 15 · the scraped floor --- */
    scrapeOpacity: 0.9,
    scrapeGlow: 1.6, // the hot groove behind the contact
    scrapeScore: 1, // tangential score marks
    scrapeReach: 0.9, // metres the scorch reaches past the rim
    colorScrapeDeep: '#0e0302',
    sparkRate: 160, // sparks per second off the contact point at full wobble
    sparkSpeed: 9,
    sparkSize: 0.05,
    sparkLife: 0.4,
    sparkLift: 0.35, // how much they climb as they fly off tangent
    sparkStretch: 1.6,
    colorSparkA: '#ffe6d4',
    colorSparkB: '#fa5b38',
    colorSparkC: '#a3200f',
    colorSparkD: '#2a0603'
  }
};
