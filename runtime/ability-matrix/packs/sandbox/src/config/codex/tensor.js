/**
 * Tensor Cage — force — bars that drop in a ring and then move.
 *
 * Force — tensor bars close and hold a pressure the circle cannot leave.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'tensor',
  meta: {
    label: 'Tensor Cage',
    accent: '#ffd2a8',
    key: '',
    element: 'force',
    hint: 'Force — tensor bars close and hold a pressure the circle cannot leave',
    cast: 'zone',
    glyph: '<path d="M28 22V78M40 16V84M50 12V88M60 16V84M72 22V78"/><path d="M22 28H78M22 72H78"/><path d="M66 72H90M82 64L90 72L82 80"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // metres/second the front travels
    lifetime: 1.8, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast1', // which clip the body throws
    impactTime: 1.05, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 4.2, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#f46d25',
    lightIntensity: 8, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.2, // 0..1 how much it shimmers
    impactLight: 9.9, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.22, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 22, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 1.26, // radians/second the body turns
    thickness: 0.22, // width of a single body part, metres
    count: 6, // parts in the body (max 12)
    height: 2.6, // how tall the body stands, metres
    sweep: 1.1, // lateral reach, metres
    lean: 0.45, // how far the body opens on the beat
    bodyOpacity: 0.2,
    edgeGlow: 0.88,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.32,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 4, // breaths per second (radians)
    colorA: '#f46d25',
    colorB: '#ffffff',
    colorC: '#471c06',
    lensWarp: 0.84, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0.5, // strength of the second placement
    colorVoiceA: '#f46d25',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 9, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 1, // strength of the field
    groundLand: 0.32, // seconds the field takes to land out to the rim after the beat
    groundHeat: 1.1, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.08, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundTelegraph: 0.32, // how strongly the footprint shows before the beat
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 1.05, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#f46d25',
    colorGroundB: '#471c06',
    colorGroundStain: '#2a1410', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 12, // pieces thrown (max 48)
    detailSize: 0.6, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 2.6, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.2, // rim light on the pieces
    detailOpacity: 1, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    detailRough: 0.5, // roughness of the lit pieces
    detailMetal: 0.3, // metalness of the lit pieces
    detailShadow: 1, // 1 = the pieces cast shadows
    colorDetailA: '#ffd2a8',
    colorDetailB: '#f46d25',
    colorDetailC: '#471c06',

    /* --- 5 · hero rig --- */
    heroSize: 1.6, // scale of the hero rig, metres per authored unit
    heroReach: 0.85, // ring rigs: share of the circle radius they span
    heroLift: 3, // how far the rig rises, drops or arcs, metres
    heroSpin: 0.4, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.1, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 1, // how solid the rig is
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroFit: 0.72, // mass rigs grow to at least this share of the circle radius (heroSize is the floor)
    heroRough: 0.5, // roughness of the lit rig
    heroMetal: 0.3, // metalness of the lit rig
    heroShadow: 1, // 1 = the rig casts shadows
    colorHeroA: '#ffd2a8',
    colorHeroB: '#f46d25',
    colorHeroC: '#471c06',

    /* --- 6 · shed --- */
    dustRate: 72, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#ffd2a8',
    colorDustB: '#f46d25',
    colorDustC: '#471c06',
    colorDustD: '#1a140e',
    streakRate: 90, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#ffd2a8',
    colorStreakC: '#f46d25',
    colorStreakD: '#f46d25',
    chipRate: 36, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#f46d25',
    colorChipB: '#ffd2a8',
    colorChipC: '#471c06',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#ffd2a8',
    colorMoteC: '#f46d25',
    colorMoteD: '#f46d25',

    /* --- 8 · the beat --- */
    impactShake: 0.72, // camera punch on the beat
    impactFlash: 0.14, // screen flash on the beat
    colorFlash: '#ffd2a8',
    burstRadius: 3.2, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.12, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 34, // fragments thrown up and out on the beat
    impactDust: 23, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#f46d25',
    colorBurstC: '#471c06',
    shockRadius: 6.5, // decal size, metres
    shockLife: 0.85,
    shockRing: 0.3, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#f46d25',
    colorShockB: '#ffffff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 5, // aftershock ring size, metres
    aftershockShake: 0.29, // camera punch of the aftershock
    aftershockLight: 6.3, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 4.4, // reach of the blow, metres
    hitImpulse: 10.5, // how hard bodies are thrown
    hitLift: 3.2, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.7, // 0..1 how far a felled body is stained
    markTime: 0.3, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 23.4, // motes per second off a freshly marked body
    colorMarkBody: '#2a1410', // what the body is stained toward
    colorMarkRim: '#f46d25',
    markRimGlow: 1.6, // rim light on a marked body
    colorMarkEdge: '#ffd2a8',
    markEdgeGlow: 2.6, // brightness of the marked edge
    markEdgeWidth: 0.05 // width of the marked edge
  }
};
