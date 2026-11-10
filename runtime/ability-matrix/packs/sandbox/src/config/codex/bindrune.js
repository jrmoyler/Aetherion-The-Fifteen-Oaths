/**
 * Bind Rune — arcane — bars that drop in a ring and then move.
 *
 * Arcane — runes stand as bars, hold, then break outward in a brand.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'bindrune',
  meta: {
    label: 'Bind Rune',
    accent: '#c9d2ff',
    key: '',
    element: 'arcane',
    hint: 'Arcane — runes stand as bars, hold, then break outward in a brand',
    cast: 'zone',
    glyph: '<path d="M28 22V78M40 16V84M50 12V88M60 16V84M72 22V78"/><path d="M22 28H78M22 72H78"/><path d="M30 50H70"/><path d="M78 62L86 78H70Z"/><path d="M78 84L70 68H86Z"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 23.1, // metres/second the front travels
    lifetime: 2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast2', // which clip the body throws
    impactTime: 1.15, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 4.45, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#5f71f2',
    lightIntensity: 10.4, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.45, // 0..1 how much it shimmers
    impactLight: 11, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.27, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 28.6, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 2.86, // radians/second the body turns
    thickness: 0.28, // width of a single body part, metres
    count: 7, // parts in the body (max 12)
    height: 3.05, // how tall the body stands, metres
    sweep: 1.45, // lateral reach, metres
    lean: 0.65, // how far the body opens on the beat
    bodyOpacity: 0.2,
    edgeGlow: 1.32,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.42,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 5, // breaths per second (radians)
    colorA: '#5f71f2',
    colorB: '#ffffff',
    colorC: '#071055',
    lensWarp: 0.77, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0.5, // strength of the second placement
    colorVoiceA: '#5f71f2',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 9, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 1, // strength of the field
    groundLand: 0.32, // seconds the field takes to land out to the rim after the beat
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.12, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundTelegraph: 0.32, // how strongly the footprint shows before the beat
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 1.05, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#5f71f2',
    colorGroundB: '#071055',
    colorGroundStain: '#24143a', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 12, // pieces thrown (max 48)
    detailSize: 0.55, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 2.86, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.56, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#c9d2ff',
    colorDetailB: '#5f71f2',
    colorDetailC: '#071055',

    /* --- 5 · hero rig --- */
    heroSize: 1.6, // scale of the hero rig, metres per authored unit
    heroReach: 0.85, // ring rigs: share of the circle radius they span
    heroLift: 3.3, // how far the rig rises, drops or arcs, metres
    heroSpin: 0.4, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.43, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0.9, // how solid the rig is
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroFit: 0.72, // mass rigs grow to at least this share of the circle radius (heroSize is the floor)
    colorHeroA: '#c9d2ff',
    colorHeroB: '#5f71f2',
    colorHeroC: '#071055',

    /* --- 6 · shed --- */
    dustRate: 40, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#c9d2ff',
    colorDustB: '#5f71f2',
    colorDustC: '#071055',
    colorDustD: '#1a140e',
    streakRate: 117, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#c9d2ff',
    colorStreakC: '#5f71f2',
    colorStreakD: '#5f71f2',
    chipRate: 14.4, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#5f71f2',
    colorChipB: '#c9d2ff',
    colorChipC: '#071055',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#c9d2ff',
    colorMoteC: '#5f71f2',
    colorMoteD: '#5f71f2',

    /* --- 8 · the beat --- */
    impactShake: 0.44, // camera punch on the beat
    impactFlash: 0.16, // screen flash on the beat
    colorFlash: '#c9d2ff',
    burstRadius: 3.5, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.3, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 4, // fragments thrown up and out on the beat
    impactDust: 4, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#5f71f2',
    colorBurstC: '#071055',
    shockRadius: 6.5, // decal size, metres
    shockLife: 0.85,
    shockRing: 0.3, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#5f71f2',
    colorShockB: '#ffffff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 5, // aftershock ring size, metres
    aftershockShake: 0.18, // camera punch of the aftershock
    aftershockLight: 7, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 4.4, // reach of the blow, metres
    hitImpulse: 8.07, // how hard bodies are thrown
    hitLift: 3.52, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.75, // 0..1 how far a felled body is stained
    markTime: 0.35, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#24143a', // what the body is stained toward
    colorMarkRim: '#5f71f2',
    markRimGlow: 2.08, // rim light on a marked body
    colorMarkEdge: '#c9d2ff',
    markEdgeGlow: 3.38, // brightness of the marked edge
    markEdgeWidth: 0.05 // width of the marked edge
  }
};
