/**
 * Absence Lance — void — a drilling blade riding the line.
 *
 * Void — a lance of absence unmakes the line as it passes.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'absence',
  meta: {
    label: 'Absence Lance',
    accent: '#9a90e0',
    key: '',
    element: 'void',
    hint: 'Void — a lance of absence unmakes the line as it passes',
    cast: 'line',
    glyph: '<path d="M14 50H70"/><path d="M62 38L86 50L62 62"/><path d="M22 40V60"/><path d="M36 36L64 64M64 36L36 64"/><circle cx="78" cy="72" r="8"/><circle cx="78" cy="72" r="2"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 30, // metres/second the front travels
    lifetime: 2.2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast3', // which clip the body throws
    impactTime: 1.25, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 0, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#503be3',
    lightIntensity: 5.6, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.25, // 0..1 how much it shimmers
    impactLight: 6.6, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.32, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 19.8, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 3.6, // radians/second the body turns
    thickness: 0.34, // width of a single body part, metres
    count: 8, // parts in the body (max 12)
    height: 3.5, // how tall the body stands, metres
    sweep: 1.8, // lateral reach, metres
    lean: 0.85, // how far the body opens on the beat
    bodyOpacity: 0, // the template erase sheet; the lance carries the read now
    edgeGlow: 1.47,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.22,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 6, // breaths per second (radians)
    colorA: '#503be3',
    colorB: '#ffffff',
    colorC: '#060416',
    lensWarp: 0, // off: the body shape it warps is gone

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off: the lance carries the read)
    colorVoiceA: '#503be3',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 2.4, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the template field (off: the unmade line is the floor)
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 0.9, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#503be3',
    colorGroundB: '#060416',
    colorGroundStain: '#050308', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48; off: no scattered glyph slivers)
    detailSize: 0.6, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 0.84, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 0.84, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#9a90e0',
    colorDetailB: '#503be3',
    colorDetailC: '#060416',

    /* --- 5 · hero rig --- */
    heroSize: 1.8, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 0.63, // how far the rig rises, drops or arcs, metres
    heroSpin: 1, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 0.77, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is (off: the cast-local lance is the hero)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    colorHeroA: '#9a90e0',
    colorHeroB: '#503be3',
    colorHeroC: '#060416',

    /* --- 6 · shed --- */
    dustRate: 24, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#9a90e0',
    colorDustB: '#503be3',
    colorDustC: '#060416',
    colorDustD: '#1a140e',
    streakRate: 24, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#9a90e0',
    colorStreakC: '#503be3',
    colorStreakD: '#503be3',
    chipRate: 14.4, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#1a1530',
    colorChipB: '#3a2f6e',
    colorChipC: '#060416',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#9a90e0',
    colorMoteC: '#503be3',
    colorMoteD: '#503be3',

    /* --- 8 · the beat --- */
    impactShake: 0.55, // camera punch on the beat
    impactFlash: 0.04, // screen flash on the beat
    colorFlash: '#9a90e0',
    burstRadius: 2.6, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0, // off: no dome at the plant // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 4, // fragments thrown up and out on the beat
    impactDust: 10, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#503be3',
    colorBurstC: '#060416',
    shockRadius: 3.2, // decal size, metres
    shockLife: 0.85,
    shockRing: 0.1, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#503be3',
    colorShockB: '#ffffff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 2.4, // aftershock ring size, metres
    aftershockShake: 0.22, // camera punch of the aftershock
    aftershockLight: 4.2, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 1.15, // reach of the blow, metres
    hitImpulse: 10.45, // how hard bodies are thrown
    hitLift: 2.24, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.95, // 0..1 how far a felled body is stained
    markTime: 0.5, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 23.4, // motes per second off a freshly marked body
    colorMarkBody: '#050308', // what the body is stained toward
    colorMarkRim: '#503be3',
    markRimGlow: 1.12, // rim light on a marked body
    colorMarkEdge: '#9a90e0',
    markEdgeGlow: 1.82, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.46, // ribbon width at the head, metres
    trailLife: 1.6, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0, // strength of the ribbon (off: the lance and the unmade line carry the travel)
    trailGlow: 0.77, // brightness of the ribbon
    trailCore: 0.8, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 0.9, // width of the scar on the floor, metres
    scarLife: 2.6, // seconds the scar takes to cool and go
    scarOpacity: 0, // strength of the scar (off: the unmade line is the scar)
    scarGlow: 1.12, // brightness of its hot seam
    colorScarA: '#503be3',
    colorScarB: '#060416',
    wakeSpacing: 1.6, // metres between wake decals along the path (0 = none)
    wakeRadius: 0.7, // size of each wake decal, metres
    wakeLife: 1.6, // seconds each wake decal lingers
    wakeChips: 1.6, // fragments thrown at each wake

    /* --- 15 · the lance (cast-local hero) --- */
    lanceLength: 6.2, // metres
    lanceForm: 0.14, // seconds it takes to form at the hand, × global lifetime
    lanceStartAhead: 0.45, // how far ahead of the hand the tip starts, × length
    lanceHeight: 1.5, // metres off the floor it flies at
    lanceDiveSpan: 0.22, // share of the line over which it dives at the end
    lanceDivePitch: 0.3, // radians it tips down in the dive
    lancePlant: 0.62, // radians below level it stands planted at
    lancePlantTime: 0.12, // seconds the plant takes, × global lifetime
    lanceBury: 0.1, // metres of the tip buried in the floor
    lanceQuiver: 0.08, // radians it quivers after the plant
    lanceEraseStart: 1.25, // seconds after the beat the unmaking starts, × global lifetime
    lanceEraseTime: 0.95, // seconds it takes to unmake butt to tip, × global lifetime
    lanceCutWidth: 0.05, // width of the white-hot unmaking edge, share of the lance
    lanceRimGlow: 0.5, // violet fresnel rim
    lanceSpecular: 0.8, // sun glint on the obsidian
    lanceSeam: 2.0, // light up each blade edge
    lanceHeat: 1.6, // glow at the buried tip just after the plant
    colorLanceDeep: '#05030c', // obsidian, deep
    colorLanceBody: '#1c1636', // obsidian, body
    colorLanceRim: '#6a55f0', // rim / seam
    colorLanceHot: '#e6e0ff', // white-hot
    colorLanceCold: '#a8c8ff', // cold rim light that lifts it off the night floor
    lanceColdRim: 0.9, // strength of the cold rim
    lancePlantYaw: 0.55, // radians the planted lance is turned across the aim, so its length shows
    lanceFlightYaw: 0.4, // radians it flies turned across the aim, so its length shows from behind
    lanceFlightPitch: 0.18, // radians nose-up in flight
    plantChips: 40, // black chips thrown up at the plant
    plantDust: 18, // dust rolled out at the plant
    plantCrater: 1.6, // dark crater decal round the plant, metres
    plantShake: 0.35, // camera punch of the plant
    plantLight: 6, // light punch of the plant
    eraseFlakes: 90, // flakes per second off the unmaking cut

    /* --- 16 · the unmade line --- */
    trenchWidth: 1.15, // metres
    trenchOpacity: 0.95, // how completely the floor is gone
    trenchSeam: 1.1, // violet seam along the lips
    trenchCloseStart: 0.35, // seconds after the beat the line starts to close, × global lifetime
    trenchCloseTime: 1.8, // seconds it takes to close up to the lance, × global lifetime
    trenchCloseSpan: 2.5, // metres over which the closing lips draw together
    colorTrenchVoid: '#010003', // void
    colorTrenchLip: '#140f26', // lip
    tearFlakes: 70 // flakes torn out of the lips per second near the head
  }
};
