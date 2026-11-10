/**
 * Venturi Gate — wind — bars that drop in a ring and then move.
 *
 * Wind — a venturi of air bars squeezes the circle, then coughs it out.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'venturi',
  meta: {
    label: 'Venturi Gate',
    accent: '#f4fffd',
    key: '',
    element: 'wind',
    hint: 'Wind — a venturi of air bars squeezes the circle, then coughs it out',
    cast: 'zone',
    glyph: '<path d="M28 22V78M40 16V84M50 12V88M60 16V84M72 22V78"/><path d="M22 28H78M22 72H78"/><path d="M68 70C74 64 82 76 88 70"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 27, // metres/second the front travels
    lifetime: 1.8, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast1', // which clip the body throws
    impactTime: 1.05, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 4.2, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#47e1bd',
    lightIntensity: 7.2, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.3, // 0..1 how much it shimmers
    impactLight: 7.7, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.22, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 35.2, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 2.1, // radians/second the body turns
    thickness: 0.22, // width of a single body part, metres
    count: 6, // parts in the body (max 12)
    height: 2.6, // how tall the body stands, metres
    sweep: 1.1, // lateral reach, metres
    lean: 0.45, // how far the body opens on the beat
    bodyOpacity: 0, // the template bar drum; the gate carries the read now
    edgeGlow: 0.79,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.29,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 4, // breaths per second (radians)
    colorA: '#47e1bd',
    colorB: '#c8fff2',
    colorC: '#0a4335',
    lensWarp: 0, // off: the drum shape it warps is gone

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off: the gate carries the read)
    colorVoiceA: '#47e1bd',
    colorVoiceB: '#c8fff2',

    /* --- 3 · the ground --- */
    groundWidth: 9, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the template field (off: the scour is the floor)
    groundLand: 0.32, // seconds the field takes to land out to the rim after the beat
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.35, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundTelegraph: 0.32, // how strongly the footprint shows before the beat
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 1.05, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#47e1bd',
    colorGroundB: '#0a4335',
    colorGroundStain: '#3a4a46', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48; off: the gate's flutes are the bars)
    detailSize: 0.5, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 3.12, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.08, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#f4fffd',
    colorDetailB: '#47e1bd',
    colorDetailC: '#0a4335',

    /* --- 5 · hero rig --- */
    heroSize: 1.6, // scale of the hero rig, metres per authored unit
    heroReach: 0.85, // ring rigs: share of the circle radius they span
    heroLift: 3.6, // how far the rig rises, drops or arcs, metres
    heroSpin: 0.4, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 0.99, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is (off: the cast-local gate is the hero)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroFit: 0.72, // mass rigs grow to at least this share of the circle radius (heroSize is the floor)
    colorHeroA: '#f4fffd',
    colorHeroB: '#47e1bd',
    colorHeroC: '#0a4335',

    /* --- 6 · shed --- */
    dustRate: 20, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#3f7d6d',
    colorDustB: '#1d5446',
    colorDustC: '#0a4335',
    colorDustD: '#1a140e',
    streakRate: 30, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#c8fff2',
    colorStreakB: '#f4fffd',
    colorStreakC: '#47e1bd',
    colorStreakD: '#47e1bd',
    chipRate: 14.4, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#47e1bd',
    colorChipB: '#f4fffd',
    colorChipC: '#0a4335',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#c8fff2',
    colorMoteB: '#f4fffd',
    colorMoteC: '#47e1bd',
    colorMoteD: '#47e1bd',

    /* --- 8 · the beat --- */
    impactShake: 0.33, // camera punch on the beat
    impactFlash: 0.11, // screen flash on the beat
    colorFlash: '#f4fffd',
    burstRadius: 3.2, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.1, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 4, // fragments thrown up and out on the beat
    impactDust: 8, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#c8fff2',
    colorBurstB: '#47e1bd',
    colorBurstC: '#0a4335',
    shockRadius: 6.5, // decal size, metres
    shockLife: 0.85,
    shockRing: 0.12, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#47e1bd',
    colorShockB: '#c8fff2',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 5, // aftershock ring size, metres
    aftershockShake: 0.13, // camera punch of the aftershock
    aftershockLight: 4.9, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 4.4, // reach of the blow, metres
    hitImpulse: 6, // how hard bodies are thrown
    hitLift: 3.84, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.5, // 0..1 how far a felled body is stained
    markTime: 0.25, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#3a4a46', // what the body is stained toward
    colorMarkRim: '#47e1bd',
    markRimGlow: 1.44, // rim light on a marked body
    colorMarkEdge: '#f4fffd',
    markEdgeGlow: 2.34, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 14 · the gate (cast-local hero) --- */
    gateFit: 1, // foot radius, × the circle
    gateHeight: 2.5, // metres the wall stands
    gateThroatAt: 0.55, // where the throat sits, share of the height
    gateThroatStart: 0.78, // throat radius when the gate stands, × the foot
    gateThroatEnd: 0.24, // throat radius at the end of the squeeze, × the foot
    gateTop: 0.95, // mouth radius, × the foot
    gateAnticipate: 0.28, // how much of the wall whirls up before the beat
    gateRise: 0.16, // seconds the wall takes to slam up, × global lifetime
    gateFlutes: 14, // air bars fluted round the wall
    gateFluteDepth: 0.06, // how deep the flutes run, × the radius
    gateTwist: 0.35, // radians the wall twists foot to mouth
    gateBands: 14, // helical bands of air streaming up the wall
    gateBandTwist: 2.2, // how far each band winds round, turns
    gateFlow: 0.9, // how fast the bands stream up
    gateSpin: 1.4, // radians/second the wall turns
    gateSqueezeSpin: 2.6, // extra spin at the end of the squeeze, × gateSpin
    gateOpacity: 1.05, // how dense the air wall is
    gateLight: 1.35, // sun light on the wall
    gateCrest: 0.75, // glow of the pale crests on the band ridges
    colorGateDeep: '#021410', // air, deep
    colorGateBody: '#135646', // air, body
    colorGateCrest: '#b9f5e4', // crest
    squeezeDust: 70, // dust drawn in across the floor per second during the squeeze
    squeezeStreaks: 110, // streaks spiralling up the wall per second during the squeeze

    /* --- 15 · the cough --- */
    coughFlare: 1, // how far the mouth is blown open
    coughLift: 0.9, // metres the mouth is thrown up
    coughTime: 0.35, // seconds the blow takes, × global lifetime
    coughTear: 0.7, // seconds the wall takes to be torn away, × global lifetime
    coughSpin: 3, // spin burst as it blows, × gateSpin
    coughDust: 70, // dust puffs rolled out across the floor
    coughDustSpeed: 2.6, // dust roll speed, × dustSpeed
    coughStreaks: 170, // streaks fanned out from the throat
    coughChips: 22, // chips thrown up
    coughShake: 0.45, // camera punch of the cough
    coughLight: 8, // light punch of the cough
    coughRing: 0.3, // dark dust ring decal the cough rolls out (0 = none)

    /* --- 16 · the scour --- */
    scourFit: 1.12, // reach, × the circle
    scourArms: 7, // spiral grooves
    scourWind: 1.8, // how tightly they wind toward the centre
    scourTwist: 0.35, // how far they wind with the gate, × its spin
    scourRays: 56, // radial streaks the cough blows out
    scourRayAmount: 0.8, // strength of the cough scour
    scourRidge: 0.75, // pale combed ridges between the grooves
    scourOpacity: 0.9, // strength of the scour
    scourHeat: 0.7, // glow of the fresh scour and its landing lip
    scourLand: 0.3, // seconds the scour takes to land out to the rim, × global lifetime
    scourTelegraph: 0.35, // share of the scour shown before the beat (the footprint)
    scourErodeStart: 0.86, // the scour starts to erode at this share of the life after the beat
    colorScourDeep: '#03120e', // bed
    colorScourRidge: '#5aae96', // ridge

    /* --- 17 · the gust --- */
    gustLength: 1.9, // metres
    gustRadius: 0.55, // girth, metres
    gustSpin: 16, // radians/second it rolls about its axis
    gustArc: 0.7, // metres it arcs above the straight path
    gustOpacity: 0.95, // how dense the gust is
    gustTrail: 120 // wake streaks per second
  }
};
