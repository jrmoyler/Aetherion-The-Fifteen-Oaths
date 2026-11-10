/**
 * Press Cage — motion — bars that drop in a ring and then move.
 *
 * Motion — momentum bars squeeze the circle and spit it upward.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'presscage',
  meta: {
    label: 'Press Cage',
    accent: '#ffc8a4',
    key: '',
    element: 'motion',
    hint: 'Motion — momentum bars squeeze the circle and spit it upward',
    cast: 'zone',
    glyph: '<path d="M28 22V78M40 16V84M50 12V88M60 16V84M72 22V78"/><path d="M22 28H78M22 72H78"/><path d="M30 50H70"/><path d="M66 66H86M70 72H90M66 78H86"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 33, // metres/second the front travels
    lifetime: 2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast2', // which clip the body throws
    impactTime: 1.15, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 4.45, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#fa5438',
    lightIntensity: 8, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.3, // 0..1 how much it shimmers
    impactLight: 8.8, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.27, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 37.4, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 3.08, // radians/second the body turns
    thickness: 0.28, // width of a single body part, metres
    count: 7, // parts in the body (max 12)
    height: 3.05, // how tall the body stands, metres
    sweep: 1.45, // lateral reach, metres
    lean: 0.65, // how far the body opens on the beat
    bodyOpacity: 0, // the template body sheet (off: the press carries the read)
    edgeGlow: 1.02,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.32,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 5, // breaths per second (radians)
    colorA: '#fa5438',
    colorB: '#fff4ea',
    colorC: '#5e1408',
    lensWarp: 0, // off: the body shape it warps is gone

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off: the press carries the read)
    colorVoiceA: '#fa5438',
    colorVoiceB: '#fff4ea',

    /* --- 3 · the ground --- */
    groundWidth: 9, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the template field (off: the skid floor is the ground)
    groundLand: 0.32, // seconds the field takes to land out to the rim after the beat
    groundHeat: 1.1, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.1, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundTelegraph: 0.32, // how strongly the footprint shows before the beat
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 1.05, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#fa5438',
    colorGroundB: '#5e1408',
    colorGroundStain: '#120604', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48; off: the bars are the pieces)
    detailSize: 0.5, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 2.08, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.2, // rim light on the pieces
    detailOpacity: 1, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    detailRough: 0.38, // roughness of the lit pieces
    detailMetal: 0.62, // metalness of the lit pieces
    detailShadow: 1, // 1 = the pieces cast shadows
    colorDetailA: '#ffc8a4',
    colorDetailB: '#fa5438',
    colorDetailC: '#5e1408',

    /* --- 5 · hero rig --- */
    heroSize: 1.6, // scale of the hero rig, metres per authored unit
    heroReach: 0.85, // ring rigs: share of the circle radius they span
    heroLift: 2.4, // how far the rig rises, drops or arcs, metres
    heroSpin: 0.4, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.1, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the template rig is (off: the cast-local press is the hero)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroFit: 0.72, // mass rigs grow to at least this share of the circle radius (heroSize is the floor)
    heroRough: 0.38, // roughness of the lit rig
    heroMetal: 0.62, // metalness of the lit rig
    heroShadow: 1, // 1 = the rig casts shadows
    colorHeroA: '#ffc8a4',
    colorHeroB: '#fa5438',
    colorHeroC: '#5e1408',

    /* --- 6 · shed --- */
    dustRate: 12, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#7a5048',
    colorDustB: '#4a2a22',
    colorDustC: '#5e1408',
    colorDustD: '#1a140e',
    streakRate: 10, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#fff4ea',
    colorStreakB: '#ffc8a4',
    colorStreakC: '#fa5438',
    colorStreakD: '#fa5438',
    chipRate: 6, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#6a2a1c',
    colorChipB: '#3a1a14',
    colorChipC: '#5e1408',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 0, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#fff4ea',
    colorMoteB: '#ffc8a4',
    colorMoteC: '#fa5438',
    colorMoteD: '#fa5438',

    /* --- 8 · the beat --- */
    impactShake: 0.5, // camera punch on the beat
    impactFlash: 0.05, // screen flash on the beat
    colorFlash: '#ffc8a4',
    burstRadius: 3.5, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 10, // fragments thrown up and out on the beat
    impactDust: 23, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#fff4ea',
    colorBurstB: '#fa5438',
    colorBurstC: '#5e1408',
    shockRadius: 6.5, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#5e1408',
    colorShockB: '#fa5438',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 5, // aftershock ring size, metres
    aftershockShake: 0.2, // camera punch of the aftershock
    aftershockLight: 5.6, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 4.4, // reach of the blow, metres
    hitImpulse: 9.35, // how hard bodies are thrown
    hitLift: 2.56, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.5, // 0..1 how far a felled body is stained
    markTime: 0.2, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#2a2a30', // what the body is stained toward
    colorMarkRim: '#fa5438',
    markRimGlow: 1.6, // rim light on a marked body
    colorMarkEdge: '#ffc8a4',
    markEdgeGlow: 2.6, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 14 · the press (cast-local hero) --- */
    ramCount: 8, // press bars in the ring (max 12)
    ramWidth: 0.6, // bar width, metres
    ramHeight: 2.5, // bar height, metres
    ramDepth: 0.42, // bar depth, metres (the platen stands proud of it)
    ramFit: 0.95, // ring radius the bars plant on, × the circle
    ramFan: 2.4, // how wide the volley fans out as it leaves the hand, metres
    ramArc: 1.6, // height of the flight arc, metres
    ramStagger: 0.22, // how unevenly the bars leave, share of the travel
    ramDip: 0.22, // how far the bars punch into the floor on the slam, metres
    ramHold: 0.18, // seconds they stand before the squeeze, × global lifetime
    ramSqueeze: 0.3, // how far in they squeeze, × the ring radius
    ramAccel: 2.4, // momentum: the squeeze gathers speed (ease-in power)
    ramLean: 0.14, // radians the tops lean into the push
    ramRecoil: 0.62, // where they recoil to after the spit, × the ring radius
    ramRecoilTime: 0.22, // seconds the recoil takes, × global lifetime
    ramToppleTime: 0.42, // seconds they take to topple flat, × global lifetime
    ramBounce: 0.12, // radians they bounce when they slam flat
    ramExit: 0.55, // seconds they take to be eaten and sink at the end, × global lifetime
    ramSink: 1.2, // how far they sink as they go, × their depth
    ramPressGlow: 1.5, // red heat on the platens under pressure
    ramSkidGlow: 1.6, // friction heat at the shoes as they skid
    ramRimGlow: 0.4, // red rim light round the silhouette
    ramSpecular: 0.6, // sun glint on the steel
    colorRamDeep: '#0a0504', // steel, deep
    colorRamBody: '#2c1612', // steel, body (the oxide)
    colorRamRim: '#fa5438', // red heat
    colorRamHot: '#fff4ea', // white-hot core
    shoeScorch: 0.7, // scorch under each shoe on the slam, metres
    shoeDust: 7, // dust thrown off each shoe on the slam
    shoeChips: 4, // chips thrown off each shoe on the slam
    flightStreaks: 160, // motion lines per second behind the flying bars
    skidSparks: 140, // sparks per second off the skidding shoes
    fallDust: 8, // dust off each bar as it slams flat
    fallShake: 0.3, // camera punch as they slam flat

    /* --- 15 · the spit and the floor --- */
    billetSize: 0.95, // size of the crushed billet that is spat, metres
    billetApex: 2.8, // how high it is spat, metres
    billetRise: 0.45, // seconds it takes to reach the top, × global lifetime
    billetSpin: 7, // how fast it tumbles, radians/second
    spitChips: 70, // chips in the jet
    spitSparks: 90, // sparks in the jet
    spitDust: 36, // dust rolled out from the centre
    spitSpeed: 11, // speed of the jet, metres/second
    spitShake: 0.7, // camera punch of the spit
    spitLight: 12, // light punch of the spit
    crushRadius: 1.2, // the crushed dent at the centre, metres
    skidWidth: 1.2, // gouge width, × bar width
    skidReach: 1.12, // the scoured stain's reach, × the ring
    skidGlow: 1.3, // glow of the fresh gouges and the cracks
    skidOpacity: 0.95,
    skidFade: 0.5, // seconds the floor takes to let go at the end, × global lifetime
    colorSkidDeep: '#0b0403', // floor, deep
    colorSkidBody: '#3a1a12' // floor, body
  }
};
