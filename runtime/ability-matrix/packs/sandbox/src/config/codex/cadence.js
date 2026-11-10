/**
 * Cadence Volley — sound — a fan of bolts on staggered arcs.
 *
 * Sound — beats arc down the line and detonate on the downbeat.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'cadence',
  meta: {
    label: 'Cadence Volley',
    accent: '#eaffc8',
    key: '',
    element: 'sound',
    hint: 'Sound — beats arc down the line and detonate on the downbeat',
    cast: 'line',
    glyph: '<path d="M18 70Q34 30 50 70"/><path d="M34 70Q50 24 66 70"/><path d="M50 70Q66 30 82 70"/><path d="M30 50H70"/><path d="M70 66C76 70 76 80 70 84M78 62C88 70 88 82 78 88"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 27, // metres/second the front travels
    lifetime: 2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast2', // which clip the body throws
    impactTime: 1.15, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 0, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#a7e33b',
    lightIntensity: 8, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.5, // 0..1 how much it shimmers
    impactLight: 8.8, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.27, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 26.4, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 2.64, // radians/second the body turns
    thickness: 0.28, // width of a single body part, metres
    count: 7, // parts in the body (max 12)
    height: 3.05, // how tall the body stands, metres
    sweep: 1.45, // lateral reach, metres
    lean: 0.65, // how far the body opens on the beat
    bodyOpacity: 0, // the template's white arches (off: the forks carry the read)
    edgeGlow: 1.85,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.32,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 5, // breaths per second (radians)
    colorA: '#a7e33b',
    colorB: '#ffffff',
    colorC: '#2c4007',
    lensWarp: 0, // strength of the distortion it writes (off: the arches it warps are gone)

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off: the forks carry the read)
    colorVoiceA: '#a7e33b',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 2.4, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the template strip (off: the beat pools replace it)
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.2, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 0.9, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#a7e33b',
    colorGroundB: '#2c4007',
    colorGroundStain: '#2c3420', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48; off: the forks are the pieces)
    detailSize: 0.65, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 1, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.2, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#eaffc8',
    colorDetailB: '#a7e33b',
    colorDetailC: '#2c4007',

    /* --- 5 · hero rig --- */
    heroSize: 1.4, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 2.2, // how far the rig rises, drops or arcs, metres
    heroSpin: 1.5, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.1, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is (off: the cast-local forks are the hero)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    colorHeroA: '#eaffc8',
    colorHeroB: '#a7e33b',
    colorHeroC: '#2c4007',

    /* --- 6 · shed --- */
    dustRate: 10, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#5d6a44',
    colorDustB: '#3a4626',
    colorDustC: '#1c2410',
    colorDustD: '#1a140e',
    streakRate: 24, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#eaffc8',
    colorStreakC: '#a7e33b',
    colorStreakD: '#a7e33b',
    chipRate: 3, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#a7e33b',
    colorChipB: '#eaffc8',
    colorChipC: '#2c4007',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 0, // motes per second off the pieces (none: the pieces are off)
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#eaffc8',
    colorMoteC: '#a7e33b',
    colorMoteD: '#a7e33b',

    /* --- 8 · the beat --- */
    impactShake: 0.5, // camera punch on the beat
    impactFlash: 0.05, // screen flash on the beat
    colorFlash: '#eaffc8',
    burstRadius: 2.3, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.1, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 3, // fragments thrown up and out on the beat
    impactDust: 5, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#a7e33b',
    colorBurstC: '#2c4007',
    shockRadius: 3.2, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#a7e33b',
    colorShockB: '#ffffff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 2.4, // aftershock ring size, metres
    aftershockShake: 0.2, // camera punch of the aftershock
    aftershockLight: 5.6, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 1.15, // reach of the blow, metres
    hitImpulse: 8.5, // how hard bodies are thrown
    hitLift: 3.2, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.55, // 0..1 how far a felled body is stained
    markTime: 0.2, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#2c3420', // what the body is stained toward
    colorMarkRim: '#a7e33b',
    markRimGlow: 1.6, // rim light on a marked body
    colorMarkEdge: '#eaffc8',
    markEdgeGlow: 2.6, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.22, // ribbon width at the head, metres
    trailLife: 1.1, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0, // strength of the ribbon (off: the forks' own arcs are the travel)
    trailGlow: 1.1, // brightness of the ribbon
    trailCore: 0.8, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 0.35, // width of the scar on the floor, metres
    scarLife: 2.6, // seconds the scar takes to cool and go
    scarOpacity: 0, // strength of the scar (off: the beat pools mark the floor)
    scarGlow: 1.6, // brightness of its hot seam
    colorScarA: '#a7e33b',
    colorScarB: '#2c4007',
    wakeSpacing: 0, // metres between wake decals along the path (0 = none)
    wakeRadius: 0.6, // size of each wake decal, metres
    wakeLife: 1.6, // seconds each wake decal lingers
    wakeChips: 1.2, // fragments thrown at each wake

    /* --- 15 · the forks (cast-local hero) --- */
    forkSize: 2.3, // height of the last (biggest) fork, metres
    forkSizeFirst: 0.62, // the first fork's height, × the last
    forkBeatFirst: 0.45, // the first landing's punch, × the last
    forkFlight: 0.42, // seconds a fork is in the air (the far ones; near ones less)
    forkArc: 2.4, // apex of the far forks' arc, metres
    forkSpin: 9, // radians/second a fork rolls about its length in flight
    forkPlant: 0.1, // how far the stem is driven into the floor, × height
    forkTilt: 0.12, // radians a planted fork leans at rest
    forkWobble: 0.22, // radians it rocks on the landing
    forkSpread: 0.07, // how far the tines swing while it rings, × height
    forkRingRate: 30, // radians/second the tines swing at
    forkRingDecay: 1.5, // how fast the hum dies, per second
    forkCool: 5, // how fast the strike flash cools, per second
    forkHum: 0.8, // lime hum up the ringing tines
    forkStrikeGlow: 2.2, // white-hot flash at the yoke on a strike
    forkSpecular: 1.2, // sun glint on the steel
    forkRimGlow: 0.3, // rim light on the steel
    colorForkDeep: '#080c04', // steel, deep
    colorForkBody: '#323a26', // olive steel
    colorForkTint: '#c4dc86', // steel rim
    colorForkGlow: '#a7e33b', // the hum
    colorForkHot: '#f4ffe0', // white-hot strike
    landShake: 0.16, // camera punch of the last (hardest) landing
    landLight: 3, // light punch of the last landing
    landBurst: 0, // strength of the low burst at each landing
    landChips: 12, // chips thrown at the last landing
    landPuffs: 8, // dust puffs rolled out at each landing
    landDust: 1.1, // dust ring at each landing, × fork height
    humMotes: 40, // motes per second off the ringing tines
    downbeatAt: 0.42, // seconds after the last fork the bar rings together, × global lifetime
    downRing: 1, // how hard every fork rings on the downbeat
    downShake: 0.3, // camera punch of the downbeat
    downFlash: 0.05, // screen flash of the downbeat
    downLight: 7, // light punch of the downbeat
    downSparks: 10, // sparks off each fork's tines on the downbeat
    toppleStart: 0.6, // forks start to topple at this share of the life after the beat
    toppleStagger: 0.06, // seconds between one fork toppling and the next, × global lifetime
    toppleTime: 0.32, // seconds a fork takes to fall, × global lifetime
    crumbleTime: 0.35, // seconds it takes to crumble once down, × global lifetime

    /* --- 16 · the beat pools --- */
    poolOpacity: 0.92, // strength of the pools
    poolRadius: 0.5, // pan radius, × the fork's height
    poolGrow: 9, // how fast a pan opens, per second
    poolWaveLength: 0.75, // metres between pressure crests
    poolWaveSpeed: 1.6, // metres/second the crests run out
    poolWaveDecay: 0.9, // how fast they die, per second
    poolGlow: 0.2, // lime on the crests
    poolErodeStart: 0.72, // pools fray out from this share of the life after the beat
    colorPoolDeep: '#050803', // pan
    colorPoolBody: '#2c3c12' // crest
  }
};
