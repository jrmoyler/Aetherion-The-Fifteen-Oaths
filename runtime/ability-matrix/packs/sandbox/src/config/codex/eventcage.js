/**
 * Event Cage — void — bars that drop in a ring and then move.
 *
 * Void — event bars drop and erase inward toward a missing centre.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'eventcage',
  meta: {
    label: 'Event Cage',
    accent: '#7a6cff',
    key: '',
    element: 'void',
    hint: 'Void — event bars drop and erase inward toward a missing centre',
    cast: 'zone',
    glyph: '<path d="M28 22V78M40 16V84M50 12V88M60 16V84M72 22V78"/><path d="M22 28H78M22 72H78"/><circle cx="78" cy="72" r="8"/><circle cx="78" cy="72" r="2"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 20, // metres/second the front travels
    lifetime: 1.8, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast1', // which clip the body throws
    impactTime: 1.05, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 4.2, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#4b3be3',
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
    bodyOpacity: 0, // the template body sheet; the cage carries the read now
    edgeGlow: 0.62,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.22,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 4, // breaths per second (radians)
    colorA: '#4b3be3',
    colorB: '#f0ecff',
    colorC: '#060416',
    lensWarp: 0, // off: the body shape it warps is gone // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off: the cage carries the read)
    colorVoiceA: '#4b3be3',
    colorVoiceB: '#f0ecff',

    /* --- 3 · the ground --- */
    groundWidth: 9, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0.55, // strength of the field
    groundLand: 0.32, // seconds the field takes to land out to the rim after the beat
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundTelegraph: 0.32, // how strongly the footprint shows before the beat
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 1.05, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#4b3be3',
    colorGroundB: '#060416',
    colorGroundStain: '#050308', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48; off: the bars are the pieces)
    detailSize: 0.6, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 1.82, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 0.84, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#7a6cff',
    colorDetailB: '#4b3be3',
    colorDetailC: '#060416',

    /* --- 5 · hero rig --- */
    heroSize: 1.6, // scale of the hero rig, metres per authored unit
    heroReach: 0.85, // ring rigs: share of the circle radius they span
    heroLift: 2.1, // how far the rig rises, drops or arcs, metres
    heroSpin: 0.4, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 0.77, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is (off: the cast-local cage is the hero)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroFit: 0.72, // mass rigs grow to at least this share of the circle radius (heroSize is the floor)
    colorHeroA: '#7a6cff',
    colorHeroB: '#4b3be3',
    colorHeroC: '#060416',

    /* --- 6 · shed --- */
    dustRate: 96, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#7a6cff',
    colorDustB: '#4b3be3',
    colorDustC: '#060416',
    colorDustD: '#1a140e',
    streakRate: 81, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#f0ecff',
    colorStreakB: '#7a6cff',
    colorStreakC: '#4b3be3',
    colorStreakD: '#4b3be3',
    chipRate: 14.4, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#4b3be3',
    colorChipB: '#7a6cff',
    colorChipC: '#060416',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#f0ecff',
    colorMoteB: '#7a6cff',
    colorMoteC: '#4b3be3',
    colorMoteD: '#4b3be3',

    /* --- 8 · the beat --- */
    impactShake: 0.55, // camera punch on the beat
    impactFlash: 0.096, // screen flash on the beat
    colorFlash: '#7a6cff',
    burstRadius: 3.2, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.12, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 4, // fragments thrown up and out on the beat
    impactDust: 10, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#f0ecff',
    colorBurstB: '#4b3be3',
    colorBurstC: '#060416',
    shockRadius: 6.5, // decal size, metres
    shockLife: 0.85,
    shockRing: 0.3, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#4b3be3',
    colorShockB: '#f0ecff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 5, // aftershock ring size, metres
    aftershockShake: 0.22, // camera punch of the aftershock
    aftershockLight: 4.2, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 4.4, // reach of the blow, metres
    hitImpulse: 8.25, // how hard bodies are thrown
    hitLift: 2.24, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.95, // 0..1 how far a felled body is stained
    markTime: 0.5, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 23.4, // motes per second off a freshly marked body
    colorMarkBody: '#050308', // what the body is stained toward
    colorMarkRim: '#4b3be3',
    markRimGlow: 1.12, // rim light on a marked body
    colorMarkEdge: '#7a6cff',
    markEdgeGlow: 1.82, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 14 · the cage (cast-local hero) --- */
    cageBars: 10, // bars in the ring (max 16)
    cageWidth: 0.38, // bar thickness, metres
    cageHeight: 3.4, // bar height, metres
    cageFit: 0.92, // ring radius, × the circle
    cageLintel: 0.24, // thickness of the beam joining the tops, metres (0 = none)
    cageDropHeight: 7, // metres above the floor the bars fall from
    cageDropSpan: 0.55, // share of the travel the fall takes
    cageStagger: 0.12, // how unevenly the bars land, share of the travel
    cageBounce: 0.18, // how far the bars punch into the floor on the slam, metres
    cageLean: 0.2, // radians the tops lean in once the cage closes
    cageSteps: 4, // closing events through the linger
    cageCloseStart: 0.3, // seconds after the beat the first event lands, × global lifetime
    cageCloseEnd: 0.72, // the cage is fully closed by this share of the life after the beat
    cageClose: 0.4, // how far it closes, × the ring radius
    cageStepSnap: 0.14, // seconds each event's snap takes, × global lifetime
    cageStepShake: 0.18, // camera punch of each event
    cageStepLight: 3.5, // light punch of each event
    cageStepDust: 3, // dust kicked off each foot per event
    cageEraseStart: 1.05, // seconds after the beat the erase begins, × global lifetime
    cageEraseStagger: 0.7, // seconds the erase takes to sweep round the ring, × global lifetime
    cageEraseTime: 0.45, // seconds one bar takes to be erased, × global lifetime
    cageSink: 0.3, // how far a bar sinks as it is erased, × its height
    cageCutWidth: 0.07, // width of the white-hot erase edge, share of the bar
    cageNotches: 14, // event notches up each bar
    cageNotchGlow: 2.2, // brightness of the lit notches
    cageRimGlow: 0.45, // violet fresnel rim on the glass
    cageSpecular: 0.8, // sun glint on the glass
    cageHeat: 2.6, // glow at the feet just after the slam
    colorCageDeep: '#06040f', // glass, deep
    colorCageBody: '#1a1248', // glass, body (the veins)
    colorCageRim: '#7a6cff', // horizon rim
    colorCageHot: '#f0ecff', // white-hot core: cuts, notches, lip
    footScorch: 0.75, // scorch under each foot, metres
    footDust: 6, // dust thrown off each foot on the slam
    footChips: 4, // chips thrown off each foot on the slam
    eraseSparks: 70, // sparks per second off the erase cuts

    /* --- 15 · the missing centre --- */
    pitFit: 0.66, // hole radius when the cage is closed, × the ring
    pitGrow: 0.3, // seconds the hole takes to open, × global lifetime
    pitClose: 0.4, // seconds it takes to close at the end, × global lifetime
    pitLip: 0.32, // width of the horizon lip, metres
    pitSkirt: 1.1, // the dark skirt round it, × the hole
    pitSwirl: 1, // how fast it drains
    pitGlow: 1.3, // brightness of the lip
    pitOpacity: 1,
    colorPitDeep: '#010004', // the hole
    colorPitLip: '#9a8cff', // the lip
    pullMotes: 60, // motes per second dragged across the floor into the hole
    pullSpeed: 2.6, // metres/second they are dragged at

    /* --- 16 · the event in flight --- */
    seedSize: 0.42, // radius of the thrown event, metres
    seedArc: 2.2, // height of its arc, metres
    seedSpikes: 0.32, // how far its spikes churn out
    seedGlow: 1.4, // its violet horizon
    seedTrail: 70 // wake motes per second
  }
};
