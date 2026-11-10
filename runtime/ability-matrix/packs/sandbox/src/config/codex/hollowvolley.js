/**
 * Hollow Volley — void — a fan of bolts on staggered arcs.
 *
 * Void — hollow seeds arc and implode where they land.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'hollowvolley',
  meta: {
    label: 'Hollow Volley',
    accent: '#8a7fd0',
    key: '',
    element: 'void',
    hint: 'Void — hollow seeds arc and implode where they land',
    cast: 'line',
    glyph: '<path d="M18 70Q34 30 50 70"/><path d="M34 70Q50 24 66 70"/><path d="M50 70Q66 30 82 70"/><circle cx="78" cy="72" r="8"/><circle cx="78" cy="72" r="2"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 24, // metres/second the front travels
    lifetime: 1.8, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast1', // which clip the body throws
    impactTime: 1.05, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 0, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#523be3',
    lightIntensity: 5.6, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.25, // 0..1 how much it shimmers
    impactLight: 6.6, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.22, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 19.8, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 1.68, // radians/second the body turns
    thickness: 0.22, // width of a single body part, metres
    count: 6, // parts in the body (max 12)
    height: 2.6, // how tall the body stands, metres
    sweep: 1.1, // lateral reach, metres
    lean: 0.45, // how far the body opens on the beat
    bodyOpacity: 0, // the template's arc lines: off, the seeds carry the read
    edgeGlow: 0,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 4, // breaths per second (radians)
    colorA: '#523be3',
    colorB: '#f4f0ff',
    colorC: '#060416',
    lensWarp: 1.12, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off: the seeds carry the read)
    colorVoiceA: '#523be3',
    colorVoiceB: '#f4f0ff',

    /* --- 3 · the ground --- */
    groundWidth: 2.4, // footprint width, metres
    groundGlow: 0.5,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 1, // strength of the field
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 0.9, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#523be3',
    colorGroundB: '#060416',
    colorGroundStain: '#050308', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48) — off: the seeds are the pieces now
    detailSize: 0.6, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 0.7, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 0.84, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#8a7fd0',
    colorDetailB: '#523be3',
    colorDetailC: '#060416',

    /* --- 5 · hero rig --- */
    heroSize: 1.4, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 1.54, // how far the rig rises, drops or arcs, metres
    heroSpin: 1.5, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 0.77, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is — off: the wire nest fought the seeds
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    colorHeroA: '#8a7fd0',
    colorHeroB: '#523be3',
    colorHeroC: '#060416',

    /* --- 6 · shed --- */
    dustRate: 96, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#8a7fd0',
    colorDustB: '#523be3',
    colorDustC: '#060416',
    colorDustD: '#1a140e',
    streakRate: 81, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#f4f0ff',
    colorStreakB: '#8a7fd0',
    colorStreakC: '#523be3',
    colorStreakD: '#523be3',
    chipRate: 14.4, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#523be3',
    colorChipB: '#8a7fd0',
    colorChipC: '#060416',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#f4f0ff',
    colorMoteB: '#8a7fd0',
    colorMoteC: '#523be3',
    colorMoteD: '#523be3',

    /* --- 8 · the beat --- */
    impactShake: 0.55, // camera punch on the beat
    impactFlash: 0.096, // screen flash on the beat
    colorFlash: '#8a7fd0',
    burstRadius: 2, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.12, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 4, // fragments thrown up and out on the beat
    impactDust: 10, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#f4f0ff',
    colorBurstB: '#523be3',
    colorBurstC: '#060416',
    shockRadius: 3.2, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#523be3',
    colorShockB: '#f4f0ff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 2.4, // aftershock ring size, metres
    aftershockShake: 0.22, // camera punch of the aftershock
    aftershockLight: 4.2, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 1.15, // reach of the blow, metres
    hitImpulse: 8.25, // how hard bodies are thrown
    hitLift: 2.24, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.95, // 0..1 how far a felled body is stained
    markTime: 0.5, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 23.4, // motes per second off a freshly marked body
    colorMarkBody: '#050308', // what the body is stained toward
    colorMarkRim: '#523be3',
    markRimGlow: 1.12, // rim light on a marked body
    colorMarkEdge: '#8a7fd0',
    markEdgeGlow: 1.82, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.18, // ribbon width at the head, metres
    trailLife: 1.1, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0.3, // strength of the ribbon
    trailGlow: 0.77, // brightness of the ribbon
    trailCore: 0.2, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 0.35, // width of the scar on the floor, metres
    scarLife: 2.6, // seconds the scar takes to cool and go
    scarOpacity: 0.7, // strength of the scar
    scarGlow: 1.12, // brightness of its hot seam
    colorScarA: '#523be3',
    colorScarB: '#060416',
    wakeSpacing: 2.5, // metres between wake decals along the path (0 = none)
    wakeRadius: 0.6, // size of each wake decal, metres
    wakeLife: 1.6, // seconds each wake decal lingers
    wakeChips: 1.6, // fragments thrown at each wake

    /* --- 15 · hollow seeds (the signature) --- */
    seedSize: 1.15, // husk height, metres
    seedHeight: 0.42, // where a landed husk sits, × size (its centre)
    seedArc: 2.6, // how high each seed's arc climbs above the line from hand to landing, metres
    seedLaunch: 0.6, // 0..1 how far down the volley the last seed leaves the hand (0 = all at once)
    seedSpin: 7, // tumble in flight, radians/second; it whirls faster as it implodes
    seedGlow: 1.1, // glow of the slits and the hollow
    seedRim: 0.15, // violet limb on the husk
    seedSlit: 0.7, // how far the lobe valleys split open as it heats
    seedRough: 0.72,
    seedMetal: 0.05,
    colorSeedShell: '#0d0b15', // deep: the obsidian husk in shadow
    colorSeedLit: '#3b3352', // body: the husk where the sun finds it
    colorSeedSeam: '#6a55ff', // tint: the light inside the hollow
    colorSeedCore: '#f4f0ff', // core: white-hot as it collapses
    seedLandShake: 0.16, // camera punch per landing
    seedLandLight: 2.4, // light punch per landing
    seedLandChips: 6, // fragments per landing
    seedLandDust: 6, // dust puffs rolled out per landing

    /* --- 16 · implosion --- */
    implodeDelay: 0.1, // seconds a landed seed sits before it collapses, × global lifetime
    implodeTime: 0.42, // seconds the husk takes to crumple in, × global lifetime
    implodeRadius: 1.0, // the dark shell that closes on it, metres at the start
    implodeOpacity: 0,
    implodeGlow: 1.1, // violet limb of the shell

    /* --- 17 · wells --- */
    wellRadius: 1.2, // the hole each seed leaves, metres
    wellOpen: 0.22, // seconds it takes to open, × global lifetime
    wellCloseAt: 1.3, // fade progress (1 = fade start, 2 = end) the wells start folding shut
    wellArms: 3, // spiral arms drawn down into each well
    wellTwist: 1.1, // how tight the arms wind toward the heart
    wellSwirl: 2.6, // how fast the arms turn, radians/second
    wellOpacity: 0.95,
    wellGlow: 0.7,
    wellLip: 0.3, // height of the thrown-up lip, × well radius
    wellLipGlow: 2.2, // violet cracks on the lip while the well is hot
    wellPullRate: 26, // motes drawn in per second per well
    wellPullSpeed: 2.2, // metres/second they are drawn at
    colorWellDeep: '#020107', // the heart of the hole
    colorWellArm: '#5a3ee8', // the arms
    colorWellRim: '#9d8cff', // the hot band at the rim
    colorWellStone: '#16121f' // the lip's stone
  }
};
