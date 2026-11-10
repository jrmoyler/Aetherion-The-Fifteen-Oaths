/**
 * Clangor Cage — sound — bars that drop in a ring and then move.
 *
 * Sound — bars of clangor drop and ring the circle inward.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'clangor',
  meta: {
    label: 'Clangor Cage',
    accent: '#e8ffc4',
    key: '',
    element: 'sound',
    hint: 'Sound — bars of clangor drop and ring the circle inward',
    cast: 'zone',
    glyph: '<path d="M28 22V78M40 16V84M50 12V88M60 16V84M72 22V78"/><path d="M22 28H78M22 72H78"/><path d="M36 36L64 64M64 36L36 64"/><path d="M70 66C76 70 76 80 70 84M78 62C88 70 88 82 78 88"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 24, // metres/second the front travels
    lifetime: 2.2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast3', // which clip the body throws
    impactTime: 1.25, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 4.7, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#9ee33b',
    lightIntensity: 8, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.5, // 0..1 how much it shimmers
    impactLight: 8.8, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.32, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 26.4, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 3.6, // radians/second the body turns
    thickness: 0.34, // width of a single body part, metres
    count: 8, // parts in the body (max 12)
    height: 3.5, // how tall the body stands, metres
    sweep: 1.8, // lateral reach, metres
    lean: 0.85, // how far the body opens on the beat
    bodyOpacity: 0, // the template body sheet (off: the bell cage carries the read)
    edgeGlow: 1.16,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.32,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 6, // breaths per second (radians)
    colorA: '#9ee33b',
    colorB: '#ffffff',
    colorC: '#294007',
    lensWarp: 0, // strength of the distortion it writes (off: the body shape it warps is gone)

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off: the bell cage carries the read)
    colorVoiceA: '#9ee33b',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 9, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the template field (off: the pressure floor replaces it)
    groundLand: 0.32, // seconds the field takes to land out to the rim after the beat
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.2, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundTelegraph: 0.32, // how strongly the footprint shows before the beat
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 1.05, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#4e6a1c',
    colorGroundB: '#294007',
    colorGroundStain: '#2c3420', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48; off: the tubes are the pieces)
    detailSize: 0.65, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 2.6, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.2, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#e8ffc4',
    colorDetailB: '#9ee33b',
    colorDetailC: '#294007',

    /* --- 5 · hero rig --- */
    heroSize: 1.6, // scale of the hero rig, metres per authored unit
    heroReach: 0.85, // ring rigs: share of the circle radius they span
    heroLift: 3, // how far the rig rises, drops or arcs, metres
    heroSpin: 0.4, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.1, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is (off: the cast-local bell cage is the hero)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroFit: 0.72, // mass rigs grow to at least this share of the circle radius (heroSize is the floor)
    colorHeroA: '#e8ffc4',
    colorHeroB: '#9ee33b',
    colorHeroC: '#294007',

    /* --- 6 · shed --- */
    dustRate: 16, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#5d6a44',
    colorDustB: '#3a4626',
    colorDustC: '#1c2410',
    colorDustD: '#1a140e',
    streakRate: 20, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#e8ffc4',
    colorStreakC: '#9ee33b',
    colorStreakD: '#9ee33b',
    chipRate: 4, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#9ee33b',
    colorChipB: '#e8ffc4',
    colorChipC: '#294007',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 0, // motes per second off the pieces (none: the pieces are off)
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#e8ffc4',
    colorMoteC: '#9ee33b',
    colorMoteD: '#9ee33b',

    /* --- 8 · the beat --- */
    impactShake: 0.5, // camera punch on the beat
    impactFlash: 0.06, // screen flash on the beat
    colorFlash: '#e8ffc4',
    burstRadius: 3.8, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 3, // fragments thrown up and out on the beat
    impactDust: 10, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#9ee33b',
    colorBurstC: '#294007',
    shockRadius: 6.5, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#9ee33b',
    colorShockB: '#ffffff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 5, // aftershock ring size, metres
    aftershockShake: 0.2, // camera punch of the aftershock
    aftershockLight: 5.6, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 4.4, // reach of the blow, metres
    hitImpulse: 9.5, // how hard bodies are thrown
    hitLift: 3.2, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.55, // 0..1 how far a felled body is stained
    markTime: 0.2, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#2c3420', // what the body is stained toward
    colorMarkRim: '#9ee33b',
    markRimGlow: 1.6, // rim light on a marked body
    colorMarkEdge: '#e8ffc4',
    markEdgeGlow: 2.6, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 14 · the bell cage (cast-local hero) --- */
    bellTubes: 12, // chime tubes in the ring (max 16)
    bellWidth: 0.44, // tube diameter, metres
    bellHeight: 3.3, // tube height, metres
    bellFit: 0.86, // ring radius, × the circle
    bellHoop: 0.2, // thickness of the iron hoop joining the tops, metres (0 = none)
    bellDropHeight: 7, // metres above the floor the cage falls from
    bellDropSpan: 0.6, // share of the travel the fall takes
    bellSway: 0.22, // radians the tubes swing on the hoop as it falls
    bellBounce: 0.2, // how far the feet punch into the floor on the slam, metres
    bellSlamRing: 0.7, // how hard every tube rings on the slam, 0..1
    bellRounds: 2, // times the clang rolls round the ring
    bellRollStart: 0.12, // seconds after the beat the first tube is struck, × global lifetime
    bellRollStep: 0.055, // seconds from one clang to the next, × global lifetime
    bellSnap: 0.12, // seconds a struck tube takes to snap its step inward, × global lifetime
    bellClose: 0.3, // how far the ring closes over all the rounds, × the ring radius
    bellLean: 0.16, // radians the tops lean in once the ring has closed
    bellKick: 0.06, // radians a struck tube kicks back
    bellRingDecay: 2.2, // how fast a tube's ring dies, per second
    bellCool: 3, // how fast a strike band cools, per second
    bellSinkStart: 0.72, // the cage is driven down from this share of the life after the beat
    bellSinkDepth: 1, // how far it is driven down, × its height
    tubeFlex: 0.2, // metres a ringing tube flexes at its belly
    tubeRingRate: 34, // radians/second it flexes at
    tubeBandAt: 0.78, // height of the strike band, share of the tube
    tubeBandGlow: 2.6, // brightness of a struck band
    tubeRingGlow: 0, // lime hum along a ringing tube (off: only the strike band runs hot) // lime hum along a ringing tube
    tubeSpecular: 1.4, // sun glint on the bronze
    tubeRimGlow: 0.12, // worn-bronze rim light
    colorTubeDeep: '#120a05', // bronze, deep
    colorTubeBody: '#5c3a1c', // bronze patina
    colorTubeTint: '#c8995a', // worn bronze, rim
    colorTubeGlow: '#9ee33b', // the hum
    colorTubeHot: '#f2ffd8', // white-hot strike
    clangShake: 0.07, // camera punch of each clang
    clangLight: 1.6, // light punch of each clang
    clangSparks: 14, // sparks off each struck band
    clangDust: 4, // dust kicked inward off each struck foot
    footScorch: 0.8, // scorch under each foot, metres
    footDust: 5, // dust thrown off each foot on the slam
    footChips: 3, // chips thrown off each foot on the slam
    sinkDust: 60, // dust per second off the feet as the cage is driven down

    /* --- 15 · the pressure floor --- */
    floorOpacity: 0.92, // strength of the pan
    floorGrow: 0.25, // seconds it takes to spread to the ring, × global lifetime
    floorErodeStart: 0.78, // it frays out from this share of the life after the beat
    floorWaveLength: 1.3, // metres between pressure crests
    floorWaveSpeed: 1.6, // metres/second the crests roll inward
    floorSwell: 1.1, // height of each clang's swell
    floorGlow: 0.12, // lime on the crests
    colorFloorDeep: '#060504', // trough
    colorFloorBody: '#1c1a0c' // crest
  }
};
