/**
 * Redshift Lance — cosmic — a drilling blade riding the line.
 *
 * Cosmic — a lance stretches down the line and redshifts as it goes.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'redshift',
  meta: {
    label: 'Redshift Lance',
    accent: '#d8ccff',
    key: '',
    element: 'cosmic',
    hint: 'Cosmic — a lance stretches down the line and redshifts as it goes',
    cast: 'line',
    glyph: '<path d="M14 50H70"/><path d="M62 38L86 50L62 62"/><path d="M22 40V60"/><circle cx="78" cy="72" r="5"/><path d="M68 72H88"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 26.4, // metres/second the front travels
    lifetime: 1.8, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast1', // which clip the body throws
    impactTime: 1.05, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 0, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#c04a7a',
    lightIntensity: 6, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.3, // 0..1 how much it shimmers
    impactLight: 7, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.22, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 14, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 1.4, // radians/second the body turns
    thickness: 0.22, // width of a single body part, metres
    count: 6, // parts in the body (max 12)
    height: 2.6, // how tall the body stands, metres
    sweep: 1.1, // lateral reach, metres
    lean: 0.45, // how far the body opens on the beat
    bodyOpacity: 0, // the template body (off: the lance carries the read)
    edgeGlow: 2.08,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.42,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 4, // breaths per second (radians)
    colorA: '#7555f1',
    colorB: '#ffffff',
    colorC: '#13044e',
    lensWarp: 0, // off: the body shape it warps is gone

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off: the lance carries the read)
    colorVoiceA: '#7555f1',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 2.4, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0.45, // strength of the field
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.1, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 0.9, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#4a121a',
    colorGroundB: '#12040e',
    colorGroundStain: '#141a3a', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48; off: the lance is the read)
    detailSize: 0.5, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 1.32, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.56, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#d8ccff',
    colorDetailB: '#7555f1',
    colorDetailC: '#13044e',

    /* --- 5 · hero rig --- */
    heroSize: 1.8, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 0.99, // how far the rig rises, drops or arcs, metres
    heroSpin: 1, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.43, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the template rig is (off: the cast-local lance is the hero)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    colorHeroA: '#d8ccff',
    colorHeroB: '#7555f1',
    colorHeroC: '#13044e',

    /* --- 6 · shed --- */
    dustRate: 10, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#d8ccff',
    colorDustB: '#7555f1',
    colorDustC: '#13044e',
    colorDustD: '#1a140e',
    streakRate: 20, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ff9a6a',
    colorStreakB: '#a8301c',
    colorStreakC: '#4a0e0a',
    colorStreakD: '#1a0405',
    chipRate: 6, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#7555f1',
    colorChipB: '#d8ccff',
    colorChipC: '#13044e',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 0, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffb08a',
    colorMoteB: '#c03a1e',
    colorMoteC: '#5a0e0c',
    colorMoteD: '#3a0610',

    /* --- 8 · the beat --- */
    impactShake: 0.55, // camera punch on the beat
    impactFlash: 0.06, // screen flash on the beat
    colorFlash: '#d8ccff',
    burstRadius: 2, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0, // strength of the burst shell (off: the plunge hits with debris and sparks)
    impactChips: 5, // fragments thrown up and out on the beat
    impactDust: 6, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#7555f1',
    colorBurstC: '#13044e',
    shockRadius: 3.2, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#5a0e14',
    colorShockB: '#a8301c',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 2.4, // aftershock ring size, metres
    aftershockShake: 0.22, // camera punch of the aftershock
    aftershockLight: 8.4, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 1.15, // reach of the blow, metres
    hitImpulse: 7.5, // how hard bodies are thrown
    hitLift: 3.52, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.8, // 0..1 how far a felled body is stained
    markTime: 0.4, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#141a3a', // what the body is stained toward
    colorMarkRim: '#7555f1',
    markRimGlow: 2.08, // rim light on a marked body
    colorMarkEdge: '#d8ccff',
    markEdgeGlow: 3.38, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.38, // ribbon width at the head, metres
    trailLife: 1.6, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0, // strength of the ribbon (off: the lance is the beam)
    trailGlow: 1.43, // brightness of the ribbon
    trailCore: 0.8, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 1.0, // width of the scar on the floor, metres
    scarLife: 3.4, // seconds the scar takes to cool and go
    scarOpacity: 0.95, // strength of the scar
    scarGlow: 0.9, // brightness of its hot seam
    colorScarA: '#7a1612',
    colorScarB: '#0e0306',
    wakeSpacing: 1.1, // metres between wake decals along the path (0 = none)
    wakeRadius: 1.0, // size of each wake decal, metres
    wakeLife: 2.8, // seconds each wake decal lingers
    wakeChips: 2, // fragments thrown at each wake

    /* --- 15 · the lance (cast-local hero) --- */
    lanceOpacity: 1, // 0 hides the lance
    lanceTail: 0.14, // shaft radius at the hand, metres
    lanceFront: 0.4, // shaft radius where it meets the head, metres
    lanceHeadWidth: 1.1, // spearhead width across the blades, metres
    lanceHeadLength: 2.4, // spearhead length, metres
    lanceTipHeight: 1.3, // height of the tip as it flies down the line, metres
    lanceStretchStart: 1.5, // lance length as it leaves the hand, metres
    lanceStretch: 6, // lance length when it lands, metres
    lanceLodgeRake: 0.5, // radians the shaft stands up once lodged
    lanceLodgeYaw: 0.75, // radians the shaft swings aside once lodged (so it reads as a slash from behind)
    lanceLodgeTime: 0.35, // seconds it takes to settle, × global lifetime
    lanceStretchLinger: 1.2, // how much further it draws out through the linger, metres
    lanceRake: -0.1, // radians the tail rises above the head; below 0 it trails low along the line (reads down the line from behind)
    lancePlunge: 0.5, // how far the tip is driven into the floor at the end, metres
    lancePlungeTime: 0.12, // seconds the plunge takes, × global lifetime
    lanceShiftTravel: 0.3, // how far toward red it has shifted when it lands
    lanceShiftTime: 1.4, // seconds after the hit it is fully red, × global lifetime
    lanceGradient: 0.35, // how much redder the tip runs than the tail
    lanceCool: 0.7, // how far it cools (dims toward the deep stop) by the end
    lanceGlow: 1.3, // brightness of the glowing core line (the body itself is lit steel)
    lanceLines: 14, // dark absorption lines along the shaft
    lanceLineDark: 0.8, // how dark they are
    lanceSegments: 9, // segments the shaft breaks into
    lanceBreakAt: 0.55, // seconds after the hit it starts to come apart, × global lifetime
    lanceBreakTime: 1.1, // seconds the break-up takes, × global lifetime
    lanceBreak: 0.8, // how wide the gaps open
    lanceDrift: 0.06, // how far the segments drift down the line, × its length
    lanceSettle: 0.9, // how far the segments settle toward the floor, metres
    lanceExit: 0.6, // seconds it takes to be eaten from the tail, × global lifetime
    lanceCoreWidth: 0.2, // width of the glowing core line down each flute and blade edge
    lanceSpecular: 1.1, // sun glint on the steel
    colorLanceSteel: '#06070e', // steel / obsidian, deep
    colorLanceSheen: '#2c3550', // steel, blued sheen
    colorLanceHot: '#f4f0ff', // violet ramp: white-hot
    colorLanceTint: '#b8a8ff', // violet ramp: tint
    colorLanceBody: '#6a48f0', // violet ramp: body
    colorLanceDeep: '#0e0336', // violet ramp: deep
    colorRedHot: '#fff0e8', // red ramp: white-hot
    colorRedTint: '#ff9a7a', // red ramp: tint
    colorRedBody: '#e02a2a', // red ramp: body
    colorRedDeep: '#2a0308', // red ramp: deep
    lanceStream: 70, // light streaks per second running tipward along it in flight
    lanceEmbers: 45, // red embers per second off the cooling segments
    plungeSparks: 70, // red sparks sprayed back up the line by the plunge
    plungeChips: 26, // chips thrown up by the plunge
    plungeDust: 18, // dust thrown up by the plunge
    plungeCrack: 1.6 // crack under the plunge, metres
  }
};
