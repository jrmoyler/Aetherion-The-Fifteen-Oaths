/**
 * Loess Curtain — earth — a sheet that shears sideways as it travels.
 *
 * Earth — a curtain of loess snaps sideways and buries the line.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'loess',
  meta: {
    label: 'Loess Curtain',
    accent: '#efe0c4',
    key: '',
    element: 'earth',
    hint: 'Earth — a curtain of loess snaps sideways and buries the line',
    cast: 'line',
    glyph: '<path d="M16 62C30 28 48 78 64 36C74 18 80 48 88 30"/><path d="M70 82L78 66L86 82Z"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 20.4, // metres/second the front travels
    lifetime: 1.8, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast1', // which clip the body throws
    impactTime: 1.05, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 0, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#be702d',
    lightIntensity: 6.4, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.12, // 0..1 how much it shimmers
    impactLight: 8.8, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.22, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 13.2, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 0.84, // radians/second the body turns
    thickness: 0.22, // width of a single body part, metres
    count: 6, // parts in the body (max 12)
    height: 2.6, // how tall the body stands, metres
    sweep: 1.1, // lateral reach, metres
    lean: 0.45, // how far the body opens on the beat
    bodyOpacity: 0.5,
    edgeGlow: 1.28,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.26,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 4, // breaths per second (radians)
    colorA: '#be702d',
    colorB: '#fffaf0',
    colorC: '#33200f',
    lensWarp: 0.42, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0.5, // strength of the second placement
    colorVoiceA: '#be702d',
    colorVoiceB: '#fffaf0',

    /* --- 3 · the ground --- */
    groundWidth: 2.4, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 1, // strength of the field
    groundHeat: 1.1, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.12, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 0.9, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#be702d',
    colorGroundB: '#33200f',
    colorGroundStain: '#3a2a1a', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 14, // pieces thrown (max 48)
    detailSize: 0.55, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 1.26, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 0.96, // rim light on the pieces
    detailOpacity: 1, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    detailRough: 0.92, // roughness of the lit pieces
    detailMetal: 0, // metalness of the lit pieces
    detailShadow: 1, // 1 = the pieces cast shadows
    colorDetailA: '#efe0c4',
    colorDetailB: '#be702d',
    colorDetailC: '#33200f',

    /* --- 5 · hero rig --- */
    heroSize: 2, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 0.72, // how far the rig rises, drops or arcs, metres
    heroSpin: 1, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 0.88, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 1, // how solid the rig is
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    heroRough: 0.92, // roughness of the lit rig
    heroMetal: 0, // metalness of the lit rig
    heroShadow: 1, // 1 = the rig casts shadows
    colorHeroA: '#efe0c4',
    colorHeroB: '#be702d',
    colorHeroC: '#33200f',

    /* --- 6 · shed --- */
    dustRate: 104, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#efe0c4',
    colorDustB: '#be702d',
    colorDustC: '#33200f',
    colorDustD: '#1a140e',
    streakRate: 54, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#fffaf0',
    colorStreakB: '#efe0c4',
    colorStreakC: '#be702d',
    colorStreakD: '#be702d',
    chipRate: 54, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#be702d',
    colorChipB: '#efe0c4',
    colorChipC: '#33200f',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#fffaf0',
    colorMoteB: '#efe0c4',
    colorMoteC: '#be702d',
    colorMoteD: '#be702d',

    /* --- 8 · the beat --- */
    impactShake: 0.72, // camera punch on the beat
    impactFlash: 0.13, // screen flash on the beat
    colorFlash: '#efe0c4',
    burstRadius: 2, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.12, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 51, // fragments thrown up and out on the beat
    impactDust: 34, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#fffaf0',
    colorBurstB: '#be702d',
    colorBurstC: '#33200f',
    shockRadius: 3.2, // decal size, metres
    shockLife: 0.85,
    shockRing: 0.3, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#be702d',
    colorShockB: '#fffaf0',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 2.4, // aftershock ring size, metres
    aftershockShake: 0.29, // camera punch of the aftershock
    aftershockLight: 5.6, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 1.15, // reach of the blow, metres
    hitImpulse: 9.38, // how hard bodies are thrown
    hitLift: 2.88, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.7, // 0..1 how far a felled body is stained
    markTime: 0.5, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 23.4, // motes per second off a freshly marked body
    colorMarkBody: '#3a2a1a', // what the body is stained toward
    colorMarkRim: '#be702d',
    markRimGlow: 1.28, // rim light on a marked body
    colorMarkEdge: '#efe0c4',
    markEdgeGlow: 2.08, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.6, // ribbon width at the head, metres
    trailLife: 1.3, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0.85, // strength of the ribbon
    trailGlow: 0.88, // brightness of the ribbon
    trailCore: 0.8, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 1.4, // width of the scar on the floor, metres
    scarLife: 2.6, // seconds the scar takes to cool and go
    scarOpacity: 0.85, // strength of the scar
    scarGlow: 1.28, // brightness of its hot seam
    colorScarA: '#be702d',
    colorScarB: '#33200f',
    wakeSpacing: 2, // metres between wake decals along the path (0 = none)
    wakeRadius: 1, // size of each wake decal, metres
    wakeLife: 1.6, // seconds each wake decal lingers
    wakeChips: 6 // fragments thrown at each wake
  }
};
