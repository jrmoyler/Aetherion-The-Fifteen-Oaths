/**
 * Hardpoint Halo — tech — a ring that walks, then commits.
 *
 * Tech — hardpoints lock into a ring, then fire outward together.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'hardpoint',
  meta: {
    label: 'Hardpoint Halo',
    accent: '#e4fcff',
    key: '',
    element: 'tech',
    hint: 'Tech — hardpoints lock into a ring, then fire outward together',
    cast: 'zone',
    glyph: '<circle cx="50" cy="50" r="28"/><circle cx="50" cy="50" r="10"/><path d="M50 8V18M50 82V92M8 50H18M82 50H92"/><path d="M30 50H70"/><path d="M70 64H86V80H70Z"/><path d="M74 68H82V76H74Z"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 26.4, // metres/second the front travels
    lifetime: 2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast2', // which clip the body throws
    impactTime: 1.15, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 4.45, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#25d7f4',
    lightIntensity: 3, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.4, // 0..1 how much it shimmers
    impactLight: 6, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.27, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 28.6, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 2.2, // radians/second the body turns
    thickness: 0.28, // width of a single body part, metres
    count: 7, // parts in the body (max 12)
    height: 3.05, // how tall the body stands, metres
    sweep: 1.45, // lateral reach, metres
    lean: 0.65, // how far the body opens on the beat
    bodyOpacity: 0.03, // the template sigil: a trace only, the turrets carry the read
    edgeGlow: 1.12,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.35,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 5, // breaths per second (radians)
    colorA: '#25d7f4',
    colorB: '#ffffff',
    colorC: '#043b44',
    lensWarp: 0.3, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off)
    colorVoiceA: '#25d7f4',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 9, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0.2, // strength of the field (under the deck)
    groundLand: 0.32, // seconds the field takes to land out to the rim after the beat
    groundHeat: 1.1, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.08, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundTelegraph: 0.32, // how strongly the footprint shows before the beat
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 1.05, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#25d7f4',
    colorGroundB: '#043b44',
    colorGroundStain: '#101820', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48) — off: the deck and turrets replace them
    detailSize: 0.45, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 0.81, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.32, // rim light on the pieces
    detailOpacity: 1, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    detailRough: 0.34, // roughness of the lit pieces
    detailMetal: 0.8, // metalness of the lit pieces
    detailShadow: 1, // 1 = the pieces cast shadows
    colorDetailA: '#e4fcff',
    colorDetailB: '#25d7f4',
    colorDetailC: '#043b44',

    /* --- 5 · hero rig --- */
    heroSize: 1.4, // scale of the hero rig, metres per authored unit
    heroReach: 0.85, // ring rigs: share of the circle radius they span
    heroLift: 0.54, // how far the rig rises, drops or arcs, metres
    heroSpin: 1.2, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.21, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is — off: the pale block ring read as a hologram
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroFit: 0.72, // mass rigs grow to at least this share of the circle radius (heroSize is the floor)
    heroRough: 0.34, // roughness of the lit rig
    heroMetal: 0.8, // metalness of the lit rig
    heroShadow: 1, // 1 = the rig casts shadows
    colorHeroA: '#e4fcff',
    colorHeroB: '#25d7f4',
    colorHeroC: '#043b44',

    /* --- 6 · shed --- */
    dustRate: 40, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#e4fcff',
    colorDustB: '#25d7f4',
    colorDustC: '#043b44',
    colorDustD: '#1a140e',
    streakRate: 117, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#e4fcff',
    colorStreakC: '#25d7f4',
    colorStreakD: '#25d7f4',
    chipRate: 36, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#25d7f4',
    colorChipB: '#e4fcff',
    colorChipC: '#043b44',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#e4fcff',
    colorMoteC: '#25d7f4',
    colorMoteD: '#25d7f4',

    /* --- 8 · the beat --- */
    impactShake: 0.44, // camera punch on the beat
    impactFlash: 0.05, // screen flash on the beat
    colorFlash: '#e4fcff',
    burstRadius: 3.5, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 34, // fragments thrown up and out on the beat
    impactDust: 13, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#25d7f4',
    colorBurstC: '#043b44',
    shockRadius: 6.5, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#25d7f4',
    colorShockB: '#ffffff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 5, // aftershock ring size, metres
    aftershockShake: 0.18, // camera punch of the aftershock
    aftershockLight: 7, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 4.4, // reach of the blow, metres
    hitImpulse: 8.5, // how hard bodies are thrown
    hitLift: 2.88, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.7, // 0..1 how far a felled body is stained
    markTime: 0.15, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#101820', // what the body is stained toward
    colorMarkRim: '#25d7f4',
    markRimGlow: 1.76, // rim light on a marked body
    colorMarkEdge: '#e4fcff',
    markEdgeGlow: 2.86, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the hardpoints (the signature) --- */
    podCount: 8, // turrets in the halo (max 12)
    podSize: 1.25, // turret scale, × authored (≈1 m across at 1)
    podRing: 0.8, // radius of the ring they lock onto, × the circle
    podFlyRadius: 0.7, // radius of the formation in flight, metres
    podFlyHeight: 0.5, // height of the formation's arc in flight, metres
    podFlySize: 0.45, // turret size as it leaves the hand, × full
    podWalk: 2.6, // radians/second the formation turns in flight (the ring walks)
    podLockAt: 0.78, // share of the travel at which the ring spreads and drops to lock
    podDrop: 1.1, // metres above the floor they drop from as they lock
    podTrack: 0.22, // radians each turret sweeps either side while it fires
    podTrackRate: 3.2, // radians/second of that sweep
    podSink: 1.3, // metres they sink into the floor on the way out
    podSinkAt: 1.55, // clock (0..2: impact then fade) they power down and sink
    podEyeGlow: 2.6, // the sensor slit
    podSeamGlow: 0.6, // the plate seam
    podRimGlow: 0.25, // a cyan limb
    podRough: 0.42,
    podMetal: 0.72,
    podOpacity: 1, // 0 hides the turrets
    podShadow: 1, // 1 = they cast shadows
    colorPodDeep: '#0b1014', // deep: gunmetal in shadow
    colorPodBody: '#34414a', // body: gunmetal in the sun
    colorPodHot: '#25d7f4', // tint: power
    colorPodCore: '#e4fcff', // core: muzzle white

    /* --- 13 · the volleys --- */
    volleyCount: 3, // volleys fired outward together (the first on the beat)
    volleyGap: 0.42, // seconds between volleys
    barrelRecoil: 0.32, // metres the barrels kick back
    barrelStow: 1.1, // radians the barrels point up while stowed in flight
    barrelDroop: 0.35, // radians they droop when powered down
    barrelHeat: 1.6, // muzzle glow after a shot
    barrelCool: 1.6, // how fast the muzzles cool, per second
    tracerCount: 6, // tracers per muzzle per volley
    tracerSpeed: 26, // metres/second
    tracerSize: 0.07,
    tracerLife: 0.32,
    tracerStretch: 3,
    muzzleFlash: 5, // flash puffs per muzzle per volley
    muzzleSize: 0.22,
    colorTracerA: '#ffffff',
    colorTracerB: '#e4fcff',
    colorTracerC: '#25d7f4',
    colorTracerD: '#0a4a57',

    /* --- 14 · the deck --- */
    deckReach: 1, // plate radius, × the ring radius + a turret
    deckOpacity: 0.96,
    deckGlow: 1.2, // powered seams and conduits
    deckHex: 0.62, // hex panel size, metres
    deckLand: 0.25, // seconds the plate takes to open out from the hub
    deckScorchLen: 3.2, // metres the muzzle scorch reaches past the ring
    deckArc: 0, // strength of the template's arc-ring decal on the beat (0 = none)
    colorDeckDeep: '#080d11',
    colorDeckBody: '#1f2a31',
    colorDeckBurn: '#06080a'
  }
};
