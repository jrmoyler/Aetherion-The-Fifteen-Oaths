/**
 * Aureole Ring — light — a ring that walks, then commits.
 *
 * Light — an aureole tightens on the circle and flares when it meets.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'aureole',
  meta: {
    label: 'Aureole Ring',
    accent: '#ffe9a8',
    key: '',
    element: 'light',
    hint: 'Light — an aureole tightens on the circle and flares when it meets',
    cast: 'zone',
    glyph: '<circle cx="50" cy="50" r="28"/><circle cx="50" cy="50" r="10"/><path d="M50 8V18M50 82V92M8 50H18M82 50H92"/><path d="M78 62V74M72 68H84M73 63L83 73M83 63L73 73"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 28, // metres/second the front travels
    lifetime: 1.8, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast1', // which clip the body throws
    impactTime: 1.05, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 4.2, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#ffd53d',
    lightIntensity: 12, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.5, // 0..1 how much it shimmers
    impactLight: 9, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.22, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 39.6, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 1.4, // radians/second the body turns
    thickness: 0.22, // width of a single body part, metres
    count: 6, // parts in the body (max 12)
    height: 2.6, // how tall the body stands, metres
    sweep: 1.1, // lateral reach, metres
    lean: 0.45, // how far the body opens on the beat
    bodyOpacity: 0, // the template ring; the crown carries the read now
    edgeGlow: 1.32,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.48,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 4, // breaths per second (radians)
    colorA: '#ffd53d',
    colorB: '#fffdf4',
    colorC: '#957504',
    lensWarp: 0, // off: the ring shape it warps is gone

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off: the crown carries the read)
    colorVoiceA: '#ffd53d',
    colorVoiceB: '#fffdf4',

    /* --- 3 · the ground --- */
    groundWidth: 9, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the template field (off: the sunburst is the floor)
    groundLand: 0.32, // seconds the field takes to land out to the rim after the beat
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.42, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundTelegraph: 0.32, // how strongly the footprint shows before the beat
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 1.05, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#ffd53d',
    colorGroundB: '#957504',
    colorGroundStain: '#3a3020', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48; off: the rays are the pieces)
    detailSize: 0.45, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 0.9, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.8, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#ffe9a8',
    colorDetailB: '#ffd53d',
    colorDetailC: '#957504',

    /* --- 5 · hero rig --- */
    heroSize: 1.4, // scale of the hero rig, metres per authored unit
    heroReach: 0.85, // ring rigs: share of the circle radius they span
    heroLift: 0.6, // how far the rig rises, drops or arcs, metres
    heroSpin: 1.2, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.65, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is (off: the cast-local crown is the hero)
    heroDeep: 0.5, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroFit: 0.72, // mass rigs grow to at least this share of the circle radius (heroSize is the floor)
    colorHeroA: '#ffe9a8',
    colorHeroB: '#ffd53d',
    colorHeroC: '#957504',

    /* --- 6 · shed --- */
    dustRate: 8, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#ffe9a8',
    colorDustB: '#ffd53d',
    colorDustC: '#957504',
    colorDustD: '#1a140e',
    streakRate: 50, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#fffdf4',
    colorStreakB: '#ffe9a8',
    colorStreakC: '#ffd53d',
    colorStreakD: '#ffd53d',
    chipRate: 10.8, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#ffd53d',
    colorChipB: '#ffe9a8',
    colorChipC: '#957504',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#fffdf4',
    colorMoteB: '#ffe9a8',
    colorMoteC: '#ffd53d',
    colorMoteD: '#ffd53d',

    /* --- 8 · the beat --- */
    impactShake: 0.39, // camera punch on the beat
    impactFlash: 0.06, // screen flash on the beat
    colorFlash: '#ffe9a8',
    burstRadius: 3.2, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.06, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 3, // fragments thrown up and out on the beat
    impactDust: 3, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#fffdf4',
    colorBurstB: '#ffd53d',
    colorBurstC: '#957504',
    shockRadius: 6.5, // decal size, metres
    shockLife: 0.85,
    shockRing: 0.12, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#ffd53d',
    colorShockB: '#fffdf4',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 5, // aftershock ring size, metres
    aftershockShake: 0.15, // camera punch of the aftershock
    aftershockLight: 9.8, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 4.4, // reach of the blow, metres
    hitImpulse: 6.75, // how hard bodies are thrown
    hitLift: 3.2, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.8, // 0..1 how far a felled body is stained
    markTime: 0.2, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#3a3020', // what the body is stained toward
    colorMarkRim: '#ffd53d',
    markRimGlow: 2.4, // rim light on a marked body
    colorMarkEdge: '#ffe9a8',
    markEdgeGlow: 3.9, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 14 · the crown (cast-local hero) --- */
    rayCount: 16, // rays in the crown (max 24), alternating tall and short
    rayHeight: 2.7, // metres a tall ray stands
    rayShort: 0.62, // short rays, × the tall height
    rayWidth: 1.9, // blade width scale (an authored ray is ~0.44 m wide at 1)
    rayStart: 1.55, // where the rays rise while the star flies, × the circle
    rayFit: 0.95, // where they meet on the beat, × the circle
    raySnap: 0.12, // how far they snap in past the rim on the beat, × the ring
    raySnapTime: 0.16, // seconds the snap takes, × global lifetime
    rayLeanOut: 0.35, // radians they lean out before the beat
    rayLean: 0.32, // radians the tips lean in toward the star after the beat
    rayBreathe: 0.03, // radians each ray sways through the linger
    raySpin: 0.25, // radians/second the crown turns through the linger
    rayFlareTime: 0.38, // seconds the flare band takes to run foot → tip, × global lifetime
    rayCool: 1.4, // how fast the heat cools to bronze
    raySinkStart: 0.66, // the rays start to sink at this share of the life after the beat
    raySinkStagger: 0.45, // seconds the sinking takes to sweep round the ring, × global lifetime
    raySinkTime: 0.35, // seconds one ray takes to sink, × global lifetime
    giltRimGlow: 0.3, // pale fresnel rim on the gold
    giltSpecular: 1.4, // sun glint on the gold
    giltEdgeGlow: 0.5, // light along the blade edges
    giltFlareGlow: 1.4, // brightness of the flare band
    giltHeatGlow: 0.15, // body glow while hot
    colorGiltDeep: '#1e1002', // bronze, deep
    colorGiltBody: '#a86e10', // gold, body
    colorGiltPale: '#ffe7a0', // gold, pale
    colorGiltHot: '#fff2c4', // white-gold
    flareSparks: 8, // sparks shot up each ray on the flare
    flareLight: 6, // light punch of the flare

    /* --- 15 · the sun-star --- */
    starSize: 0.85, // radius, metres
    starDepth: 1.4, // thickness scale
    starHeight: 2.3, // metres it hangs at over the centre
    starRise: 0.35, // metres it lifts after the beat
    starArc: 1.4, // metres it arcs above the straight path in flight
    starSpinFlight: 14, // radians/second it spins in flight
    starSpin: 0.9, // radians/second it turns after the beat
    starPop: 0.35, // how much it swells on the beat
    starBob: 0.08, // metres it bobs through the linger
    starExit: 0.78, // it drops into the boss from this share of the life after the beat
    starTrail: 60, // wake motes per second in flight

    /* --- 16 · the sunburst --- */
    sunFit: 1.12, // reach, × the circle
    sunTurn: 0.3, // how far the rays on the floor turn with the crown
    sunOpacity: 0.9, // strength of the sunburst
    sunHeat: 0.55, // glow of the fresh sunburst, cooling
    sunLand: 0.28, // seconds it takes to land out to the rim, × global lifetime
    sunErodeStart: 0.72, // it starts to erode at this share of the life after the beat
    sunMotes: 40, // motes of light rising off it per second
    colorSunBed: '#160d02', // bed
    colorSunRay: '#8a5c10' // rays
  }
};
