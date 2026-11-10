/**
 * Orbit Pendulum — motion — a blade hinged at the hand.
 *
 * Motion — a mass on a tether orbits the cast and releases at the far end.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'orbitpendulum',
  meta: {
    label: 'Orbit Pendulum',
    accent: '#ffd8bc',
    key: '',
    element: 'motion',
    hint: 'Motion — a mass on a tether orbits the cast and releases at the far end',
    cast: 'line',
    glyph: '<path d="M50 16V28"/><path d="M18 78L50 28L82 70"/><circle cx="50" cy="18" r="5"/><path d="M36 36L64 64M64 36L36 64"/><path d="M66 66H86M70 72H90M66 78H86"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 45, // metres/second the front travels
    lifetime: 2.2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast3', // which clip the body throws
    impactTime: 1.25, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 0, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#fa5238',
    lightIntensity: 3.5, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.3, // 0..1 how much it shimmers
    impactLight: 8.8, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.32, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 37.4, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 4.2, // radians/second the body turns
    thickness: 0.34, // width of a single body part, metres
    count: 8, // parts in the body (max 12)
    height: 3.5, // how tall the body stands, metres
    sweep: 1.8, // lateral reach, metres
    lean: 0.85, // how far the body opens on the beat
    bodyOpacity: 0, // the template body; off — the mass is the body now
    edgeGlow: 2.1,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.32,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 6, // breaths per second (radians)
    colorA: '#fa5238',
    colorB: '#ffffff',
    colorC: '#5e1308',
    lensWarp: 0, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off: it drew a frame-wide ring line)
    colorVoiceA: '#fa5238',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 2.4, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the field (off: the scored disc and the scar carry the floor)
    groundHeat: 1.1, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.1, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 0.9, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#fa5238',
    colorGroundB: '#5e1308',
    colorGroundStain: '#2a2a30', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48)
    detailSize: 0.5, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 1.28, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.2, // rim light on the pieces
    detailOpacity: 1, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    detailRough: 0.38, // roughness of the lit pieces
    detailMetal: 0.62, // metalness of the lit pieces
    detailShadow: 1, // 1 = the pieces cast shadows
    colorDetailA: '#ffd8bc',
    colorDetailB: '#fa5238',
    colorDetailC: '#5e1308',

    /* --- 5 · hero rig --- */
    heroSize: 3, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 0.72, // how far the rig rises, drops or arcs, metres
    heroSpin: 1, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.1, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is (off: the forged bob replaces the drum)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    heroRough: 0.38, // roughness of the lit rig
    heroMetal: 0.62, // metalness of the lit rig
    heroShadow: 1, // 1 = the rig casts shadows
    colorHeroA: '#ffd8bc',
    colorHeroB: '#fa5238',
    colorHeroC: '#5e1308',

    /* --- 6 · shed --- */
    dustRate: 72, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#ffd8bc',
    colorDustB: '#fa5238',
    colorDustC: '#5e1308',
    colorDustD: '#1a140e',
    streakRate: 153, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#ffd8bc',
    colorStreakC: '#fa5238',
    colorStreakD: '#fa5238',
    chipRate: 25.2, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#fa5238',
    colorChipB: '#ffd8bc',
    colorChipC: '#5e1308',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#ffd8bc',
    colorMoteC: '#fa5238',
    colorMoteD: '#fa5238',

    /* --- 8 · the beat --- */
    impactShake: 0.5, // camera punch on the beat
    impactFlash: 0.05, // screen flash on the beat
    colorFlash: '#ffd8bc',
    burstRadius: 2.6, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 50, // fragments thrown up and out on the beat
    impactDust: 23, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#fa5238',
    colorBurstC: '#5e1308',
    shockRadius: 3.2, // decal size, metres
    shockLife: 0.85,
    shockRing: 0.1, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#fa5238',
    colorShockB: '#ffffff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 2.4, // aftershock ring size, metres
    aftershockShake: 0.2, // camera punch of the aftershock
    aftershockLight: 5.6, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 1.15, // reach of the blow, metres
    hitImpulse: 10.45, // how hard bodies are thrown
    hitLift: 2.56, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.5, // 0..1 how far a felled body is stained
    markTime: 0.2, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#2a2a30', // what the body is stained toward
    colorMarkRim: '#fa5238',
    markRimGlow: 1.6, // rim light on a marked body
    colorMarkEdge: '#ffd8bc',
    markEdgeGlow: 2.6, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.34, // ribbon width at the head, metres
    trailLife: 0.9, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0, // strength of the ribbon
    trailGlow: 1.1, // brightness of the ribbon
    trailCore: 0.4, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 0.6, // width of the scar on the floor, metres
    scarLife: 2.6, // seconds the scar takes to cool and go
    scarOpacity: 0, // strength of the scar
    scarGlow: 1.6, // brightness of its hot seam
    colorScarA: '#fa5238',
    colorScarB: '#5e1308',
    wakeSpacing: 0, // metres between wake decals along the path (0 = none)
    wakeRadius: 0.7, // size of each wake decal, metres
    wakeLife: 1.6, // seconds each wake decal lingers
    wakeChips: 2.8, // fragments thrown at each wake

    /* --- 13 · the mass (the cast's own hero) --- */
    massScale: 1.45, // × the authored bob (1.5 m body, 2.1 m over the studs); 0 hides it
    flightTether: 1.4, // chain length while it whirls down the line, metres
    flightHeight: 1.7, // height of the pivot in flight, metres
    flightSpin: 18, // whirl round the front in flight, radians/second
    anchorHeight: 2.6, // height of the anchor post at the far end, metres
    anchorRise: 0.16, // seconds the post takes to punch up
    orbitReach: 2.6, // orbit radius as a multiple of hitRadius (the sweep covers what it hits)
    orbitTilt: -0.25, // tilt of the orbit plane, radians: negative swings low on the near side, so the release slings it through the group
    orbitDrop: 0.9, // how far below the hub the orbit centre sits, metres
    orbitTurns: 2.25, // turns round the post before the release (solved back from it)
    chainLinks: 12,
    chainSag: 0.35, // sag of the whirling chain, metres
    chainLength: 1.6, // length of the broken end left dangling, metres
    releaseSpeed: 10, // speed the bob flies on at, metres/second
    releaseLift: 1.5, // upward speed at release, metres/second
    releaseGravity: 16,
    bounce: 0.32, // share of the landing speed it bounces back with
    rollFriction: 1.1, // how fast the roll bleeds off, 1/seconds
    rollDust: 70, // dust puffs per second while it rolls fast
    rollMarkSpacing: 0.9, // metres between score marks it leaves rolling
    sinkFrom: 1.55, // fade clock (1 = fade start, 2 = end) the post and the bob start sinking at
    sinkOut: 2, // how far the bob sinks by the end, metres
    massGlow: 2, // brightness of the hot seams
    massRim: 0.35, // fresnel rim in the body hue
    massRough: 0.5,
    massMetal: 0.6,
    massHeatSpin: 0.9, // how hot the seams run while it whirls
    massCool: 0.8, // seconds for it to cool by ~63 % after release, × global lifetime
    colorMass: '#2a2624', // bronze-black albedo (deep)
    colorChain: '#26221f',
    colorMassRim: '#7a7570', // fresnel rim: cold iron, not the spell hue
    colorMassHot: '#ff6436', // the hot seam tone

    /* --- 14 · the scored floor --- */
    floorReach: 1.3, // disc radius as a multiple of the orbit radius
    floorOpacity: 0.95,
    floorGlow: 2, // brightness of the wake
    floorArms: 5, // spiral gouges
    colorFloorScore: '#3a322e', // the paler scored stone in the gouges
    colorFloorDeep: '#0c0a0a'
  }
};
