/**
 * Penumbra Sheet — shadow — a sheet that shears sideways as it travels.
 *
 * Shadow — a penumbra sheet slides across the line and leaves a dark wake.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'penumbra',
  meta: {
    label: 'Penumbra Sheet',
    accent: '#c4b6ff',
    key: '',
    element: 'shadow',
    hint: 'Shadow — a penumbra sheet slides across the line and leaves a dark wake',
    cast: 'line',
    glyph: '<path d="M16 62C30 28 48 78 64 36C74 18 80 48 88 30"/><path d="M30 50H70"/><path d="M84 62A12 12 0 1 0 84 84A8 10 0 1 1 84 62Z"/>'
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
    lightColor: '#5e40dd',
    lightIntensity: 4.8, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.4, // 0..1 how much it shimmers
    impactLight: 5.5, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.27, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 17.6, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 2.2, // radians/second the body turns
    thickness: 0.28, // width of a single body part, metres
    count: 7, // parts in the body (max 12)
    height: 3.05, // how tall the body stands, metres
    sweep: 1.45, // lateral reach, metres
    lean: 0.65, // how far the body opens on the beat
    bodyOpacity: 0.5,
    edgeGlow: 1.11,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.19,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 5, // breaths per second (radians)
    colorA: '#5e40dd',
    colorB: '#f2ecff',
    colorC: '#0d0821',
    lensWarp: 0.77, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0.5, // strength of the second placement
    colorVoiceA: '#5e40dd',
    colorVoiceB: '#f2ecff',

    /* --- 3 · the ground --- */
    groundWidth: 2.4, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 1, // strength of the field
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 0.9, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#5e40dd',
    colorGroundB: '#0d0821',
    colorGroundStain: '#08080c', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 14, // pieces thrown (max 48)
    detailSize: 0.55, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 1.26, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 0.72, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#c4b6ff',
    colorDetailB: '#5e40dd',
    colorDetailC: '#0d0821',

    /* --- 5 · hero rig --- */
    heroSize: 2, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 0.72, // how far the rig rises, drops or arcs, metres
    heroSpin: 1, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 0.66, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0.9, // how solid the rig is
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    colorHeroA: '#c4b6ff',
    colorHeroB: '#5e40dd',
    colorHeroC: '#0d0821',

    /* --- 6 · shed --- */
    dustRate: 120, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#c4b6ff',
    colorDustB: '#5e40dd',
    colorDustC: '#0d0821',
    colorDustD: '#1a140e',
    streakRate: 72, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#f2ecff',
    colorStreakB: '#c4b6ff',
    colorStreakC: '#5e40dd',
    colorStreakD: '#5e40dd',
    chipRate: 21.6, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#5e40dd',
    colorChipB: '#c4b6ff',
    colorChipC: '#0d0821',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#f2ecff',
    colorMoteB: '#c4b6ff',
    colorMoteC: '#5e40dd',
    colorMoteD: '#5e40dd',

    /* --- 8 · the beat --- */
    impactShake: 0.44, // camera punch on the beat
    impactFlash: 0.08, // screen flash on the beat
    colorFlash: '#c4b6ff',
    burstRadius: 2.3, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.3, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 6, // fragments thrown up and out on the beat
    impactDust: 12, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#f2ecff',
    colorBurstB: '#5e40dd',
    colorBurstC: '#0d0821',
    shockRadius: 3.2, // decal size, metres
    shockLife: 0.85,
    shockRing: 0.3, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#5e40dd',
    colorShockB: '#f2ecff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 2.4, // aftershock ring size, metres
    aftershockShake: 0.18, // camera punch of the aftershock
    aftershockLight: 3.5, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 1.15, // reach of the blow, metres
    hitImpulse: 8.5, // how hard bodies are thrown
    hitLift: 2.88, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.9, // 0..1 how far a felled body is stained
    markTime: 0.6, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 23.4, // motes per second off a freshly marked body
    colorMarkBody: '#08080c', // what the body is stained toward
    colorMarkRim: '#5e40dd',
    markRimGlow: 0.96, // rim light on a marked body
    colorMarkEdge: '#c4b6ff',
    markEdgeGlow: 1.56, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.64, // ribbon width at the head, metres
    trailLife: 1.3, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0.85, // strength of the ribbon
    trailGlow: 0.66, // brightness of the ribbon
    trailCore: 0.8, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 1.4, // width of the scar on the floor, metres
    scarLife: 2.6, // seconds the scar takes to cool and go
    scarOpacity: 0.7, // strength of the scar
    scarGlow: 0.96, // brightness of its hot seam
    colorScarA: '#5e40dd',
    colorScarB: '#0d0821',
    wakeSpacing: 2, // metres between wake decals along the path (0 = none)
    wakeRadius: 1, // size of each wake decal, metres
    wakeLife: 1.6, // seconds each wake decal lingers
    wakeChips: 2.4 // fragments thrown at each wake
  }
};
