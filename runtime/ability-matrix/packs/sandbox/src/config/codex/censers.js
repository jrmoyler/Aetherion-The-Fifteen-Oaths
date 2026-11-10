/**
 * Censer March — holy — a ring of standing columns.
 *
 * Holy — censers rise in a ring, swing once, and slam their smoke inward.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'censers',
  meta: {
    label: 'Censer March',
    accent: '#fff6d0',
    key: '',
    element: 'holy',
    hint: 'Holy — censers rise in a ring, swing once, and slam their smoke inward',
    cast: 'zone',
    glyph: '<path d="M32 86V40L40 28V86"/><path d="M46 86V22L54 12L62 22V86"/><path d="M68 86V40L76 30V86"/><path d="M18 86H82"/><path d="M30 50H70"/><path d="M78 60V84M68 70H88"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // metres/second the front travels
    lifetime: 2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast2', // which clip the body throws
    impactTime: 1.15, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 4.45, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#f4b82a',
    lightIntensity: 11.2, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.2, // 0..1 how much it shimmers
    impactLight: 14.3, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.27, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 26.4, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 1.76, // radians/second the body turns
    thickness: 0.28, // width of a single body part, metres
    count: 7, // parts in the body (max 12)
    height: 3.05, // how tall the body stands, metres
    sweep: 1.45, // lateral reach, metres
    lean: 0.65, // how far the body opens on the beat
    bodyOpacity: 0.2,
    edgeGlow: 1.42,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.45,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 5, // breaths per second (radians)
    colorA: '#f4b82a',
    colorB: '#ffffff',
    colorC: '#5c430a',
    lensWarp: 0.6, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0.5, // strength of the second placement
    colorVoiceA: '#f4b82a',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 9, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 1, // strength of the field
    groundLand: 0.32, // seconds the field takes to land out to the rim after the beat
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.4, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundTelegraph: 0.32, // how strongly the footprint shows before the beat
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 1.05, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#f4b82a',
    colorGroundB: '#5c430a',
    colorGroundStain: '#3a2e14', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 14, // pieces thrown (max 48)
    detailSize: 0.6, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 3.36, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.68, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#fff6d0',
    colorDetailB: '#f4b82a',
    colorDetailC: '#5c430a',

    /* --- 5 · hero rig --- */
    heroSize: 2.4, // scale of the hero rig, metres per authored unit
    heroReach: 0.8, // ring rigs: share of the circle radius they span
    heroLift: 2.8, // how far the rig rises, drops or arcs, metres
    heroSpin: 0.35, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.54, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0.9, // how solid the rig is
    heroDeep: 0.5, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroFit: 0.72, // mass rigs grow to at least this share of the circle radius (heroSize is the floor)
    colorHeroA: '#fff6d0',
    colorHeroB: '#f4b82a',
    colorHeroC: '#5c430a',

    /* --- 6 · shed --- */
    dustRate: 48, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#fff6d0',
    colorDustB: '#f4b82a',
    colorDustC: '#5c430a',
    colorDustD: '#1a140e',
    streakRate: 108, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#fff6d0',
    colorStreakC: '#f4b82a',
    colorStreakD: '#f4b82a',
    chipRate: 10.8, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#f4b82a',
    colorChipB: '#fff6d0',
    colorChipC: '#5c430a',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#fff6d0',
    colorMoteC: '#f4b82a',
    colorMoteD: '#f4b82a',

    /* --- 8 · the beat --- */
    impactShake: 0.44, // camera punch on the beat
    impactFlash: 0.21, // screen flash on the beat
    colorFlash: '#fff6d0',
    burstRadius: 3.5, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.3, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 3, // fragments thrown up and out on the beat
    impactDust: 5, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#f4b82a',
    colorBurstC: '#5c430a',
    shockRadius: 6.5, // decal size, metres
    shockLife: 0.85,
    shockRing: 0.3, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#f4b82a',
    colorShockB: '#ffffff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 5, // aftershock ring size, metres
    aftershockShake: 0.18, // camera punch of the aftershock
    aftershockLight: 9.1, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 4.4, // reach of the blow, metres
    hitImpulse: 7.65, // how hard bodies are thrown
    hitLift: 4.48, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.75, // 0..1 how far a felled body is stained
    markTime: 0.4, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#3a2e14', // what the body is stained toward
    colorMarkRim: '#f4b82a',
    markRimGlow: 2.24, // rim light on a marked body
    colorMarkEdge: '#fff6d0',
    markEdgeGlow: 3.64, // brightness of the marked edge
    markEdgeWidth: 0.05 // width of the marked edge
  }
};
