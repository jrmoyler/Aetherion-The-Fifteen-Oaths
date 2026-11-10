/**
 * Perigee Halo — gravity — a ring that walks, then commits.
 *
 * Gravity — a perigee ring dips, scrapes the rim, and tightens.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'perigee',
  meta: {
    label: 'Perigee Halo',
    accent: '#e4d8cc',
    key: '',
    element: 'gravity',
    hint: 'Gravity — a perigee ring dips, scrapes the rim, and tightens',
    cast: 'zone',
    glyph: '<circle cx="50" cy="50" r="28"/><circle cx="50" cy="50" r="10"/><path d="M50 8V18M50 82V92M8 50H18M82 50H92"/><circle cx="78" cy="72" r="3"/><path d="M78 60V66M78 78V84M66 72H72M84 72H90"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 16, // metres/second the front travels
    lifetime: 1.8, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast1', // which clip the body throws
    impactTime: 1.05, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 4.2, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#e08a3a',
    lightIntensity: 7.2, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.1, // 0..1 how much it shimmers
    impactLight: 8.8, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.22, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 11, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 0.98, // radians/second the body turns
    thickness: 0.22, // width of a single body part, metres
    count: 6, // parts in the body (max 12)
    height: 2.6, // how tall the body stands, metres
    sweep: 1.1, // lateral reach, metres
    lean: 0.45, // how far the body opens on the beat
    bodyOpacity: 0, // the template body sheet (off: the halo carries the read)
    edgeGlow: 0.79,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.29,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 4, // breaths per second (radians)
    colorA: '#a87a57',
    colorB: '#ffffff',
    colorC: '#24180f',
    lensWarp: 0, // off: the body shape it warps is gone

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off: the halo carries the read)
    colorVoiceA: '#a87a57',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 9, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the template field (off: the well is the floor)
    groundLand: 0.32, // seconds the field takes to land out to the rim after the beat
    groundHeat: 1.1, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.05, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundTelegraph: 0.32, // how strongly the footprint shows before the beat
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 1.05, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#a87a57',
    colorGroundB: '#24180f',
    colorGroundStain: '#0e0905', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48; off: the halo's blocks are the pieces)
    detailSize: 0.7, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 0.54, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.08, // rim light on the pieces
    detailOpacity: 1, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    detailRough: 0.55, // roughness of the lit pieces
    detailMetal: 0.45, // metalness of the lit pieces
    detailShadow: 1, // 1 = the pieces cast shadows
    colorDetailA: '#e4d8cc',
    colorDetailB: '#a87a57',
    colorDetailC: '#24180f',

    /* --- 5 · hero rig --- */
    heroSize: 1.4, // scale of the hero rig, metres per authored unit
    heroReach: 0.85, // ring rigs: share of the circle radius they span
    heroLift: 0.36, // how far the rig rises, drops or arcs, metres
    heroSpin: 1.2, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 0.99, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the template rig is (off: the cast-local halo is the hero)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 4.2, // the rig is scaled and lowered to keep its top under this, metres
    heroFit: 0.72, // mass rigs grow to at least this share of the circle radius (heroSize is the floor)
    heroRough: 0.55, // roughness of the lit rig
    heroMetal: 0.45, // metalness of the lit rig
    heroShadow: 1, // 1 = the rig casts shadows
    colorHeroA: '#e4d8cc',
    colorHeroB: '#a87a57',
    colorHeroC: '#24180f',

    /* --- 6 · shed --- */
    dustRate: 20, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#8a6a50',
    colorDustB: '#5a4232',
    colorDustC: '#24180f',
    colorDustD: '#1a140e',
    streakRate: 10, // sparks per second
    streakSize: 0.05,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#fff1dc',
    colorStreakB: '#ffc27a',
    colorStreakC: '#e08a3a',
    colorStreakD: '#7a3a12',
    chipRate: 10, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#a87a57',
    colorChipB: '#e4d8cc',
    colorChipC: '#24180f',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 0, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#fff1dc',
    colorMoteB: '#e08a3a',
    colorMoteC: '#a87a57',
    colorMoteD: '#3a2414',

    /* --- 8 · the beat --- */
    impactShake: 0.77, // camera punch on the beat
    impactFlash: 0.05, // screen flash on the beat
    colorFlash: '#e4d8cc',
    burstRadius: 3.2, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.08, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 41, // fragments thrown up and out on the beat
    impactDust: 26, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#a87a57',
    colorBurstC: '#24180f',
    shockRadius: 6.5, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#a87a57',
    colorShockB: '#e08a3a',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 5, // aftershock ring size, metres
    aftershockShake: 0.31, // camera punch of the aftershock
    aftershockLight: 5.6, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 4.4, // reach of the blow, metres
    hitImpulse: 9.75, // how hard bodies are thrown
    hitLift: 1.92, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.85, // 0..1 how far a felled body is stained
    markTime: 0.5, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 23.4, // motes per second off a freshly marked body
    colorMarkBody: '#1a1a20', // what the body is stained toward
    colorMarkRim: '#a87a57',
    markRimGlow: 1.44, // rim light on a marked body
    colorMarkEdge: '#e4d8cc',
    markEdgeGlow: 2.34, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 14 · the halo (cast-local hero) --- */
    haloFit: 0.88, // ring radius, × the circle
    haloWidth: 0.78, // radial width of the band, metres
    haloDepth: 0.5, // height of the band, metres
    haloBlocks: 13, // fused blocks round the ring
    haloLump: 1, // how rough and uneven the blocks are
    haloOpacity: 1, // 0 hides the halo
    haloThrowStart: 0.12, // ring size as it leaves the hand, × full
    haloThrowArc: 1.0, // extra height of the throw arc, metres
    haloThrowTilt: 0.8, // tilt in flight, radians (edge-on as it leaves the hand)
    haloThrowSpin: 9, // spin about its own axis as it leaves the hand, radians/second
    haloTilt: 0.42, // tilt on the beat, radians: the low side scrapes the rim
    haloPrecess: 3.4, // how fast the contact walks round the rim on the beat, radians/second
    haloPrecessMax: 13, // the walk speeds up as the tilt falls, up to this
    haloRoll: 0.5, // how fast the ring turns on its own axis, radians/second
    haloTighten: 0.22, // how much the ring tightens through the linger, × its radius
    haloSink: 1.6, // how far it sinks into the well at the end, × its depth
    haloDissolve: 0.55, // share of the exit it is eaten over
    haloHeat: 1.6, // glow of the friction burn on the underside
    haloHeatSpread: 1.1, // radians the burn trails behind the contact
    haloSeamGlow: 0.55, // ochre glow in the seams between the blocks
    haloSpecular: 0.45, // dull sun glint on the stone
    haloRimGlow: 0.3, // warm rim light round the silhouette
    colorHaloDeep: '#120b07', // stone, deep
    colorHaloBody: '#5a4130', // stone, body
    colorHaloRim: '#a87a57', // rim light
    colorHaloHeat: '#e0782e', // friction heat
    colorHaloHot: '#fff1dc', // white-hot core of the scrape
    landChips: 40, // chips thrown off the contact as it lands
    landDust: 26, // dust thrown off the contact as it lands
    scrapeSparks: 120, // sparks per second off the grinding contact
    scrapeDust: 40, // grit per second off the contact
    scrapeChips: 18, // chips per second off the contact
    grooveEvery: 0.42, // radians of walk between scorches in the groove (0 = none)
    grooveSize: 0.6, // size of each groove scorch, metres
    grooveLife: 3.4, // seconds the groove stays, × global lifetime
    slamDust: 70, // dust rolled out from under the rim when it falls flat
    slamShake: 0.45, // camera punch when it falls flat

    /* --- 15 · the well --- */
    wellFit: 1.15, // well radius, × the ring
    wellDepth: 0.55, // how deep the bowl reads (its shading)
    wellPress: 0.25, // seconds it takes to press in after the beat, × global lifetime
    wellFade: 0.6, // seconds it takes to let go at the end, × global lifetime
    wellPull: 1, // how fast the grit is drawn inward
    wellGlow: 0.8, // glow of the groove where the ring is touching
    wellOpacity: 0.95,
    colorWellDeep: '#070403', // the bottom of the well
    colorWellBody: '#3c2a1c' // the lip of the well
  }
};
