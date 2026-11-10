/**
 * Geode Cage — crystal — bars that drop in a ring and then move.
 *
 * Crystal — a geode seals shut and the inner points fire inward.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'geodecage',
  meta: {
    label: 'Geode Cage',
    accent: '#e7d4ff',
    key: '',
    element: 'crystal',
    hint: 'Crystal — a geode seals shut and the inner points fire inward',
    cast: 'zone',
    glyph: '<path d="M28 22V78M40 16V84M50 12V88M60 16V84M72 22V78"/><path d="M22 28H78M22 72H78"/><path d="M78 62L86 72L78 84L70 72Z"/>'
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
    lightColor: '#9a68f3',
    lightIntensity: 6, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.35, // 0..1 how much it shimmers
    impactLight: 12.1, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.22, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 30.8, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 1.4, // radians/second the body turns
    thickness: 0.22, // width of a single body part, metres
    count: 6, // parts in the body (max 12)
    height: 2.6, // how tall the body stands, metres
    sweep: 1.1, // lateral reach, metres
    lean: 0.45, // how far the body opens on the beat
    bodyOpacity: 0, // the template body sheet (off: the geode carries the read)
    edgeGlow: 1.14,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.42,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 4, // breaths per second (radians)
    colorA: '#9a68f3',
    colorB: '#fff8e8',
    colorC: '#270a5c',
    lensWarp: 0, // off: the body shape it warps is gone

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off)
    colorVoiceA: '#9a68f3',
    colorVoiceB: '#fff8e8',

    /* --- 3 · the ground --- */
    groundWidth: 9, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the template field (off: the geode floor is the ground)
    groundLand: 0.32, // seconds the field takes to land out to the rim after the beat
    groundHeat: 1.1, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.55, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundTelegraph: 0.32, // how strongly the footprint shows before the beat
    groundStain: 0.35, // strength of the residue decal left at the beat
    groundStainReach: 1.05, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#9a68f3',
    colorGroundB: '#270a5c',
    colorGroundStain: '#2a2440', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48; off: the shell and points are the pieces)
    detailSize: 0.6, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 2.6, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.56, // rim light on the pieces
    detailOpacity: 1, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    detailRough: 0.16, // roughness of the lit pieces
    detailMetal: 0.08, // metalness of the lit pieces
    detailShadow: 1, // 1 = the pieces cast shadows
    colorDetailA: '#e7d4ff',
    colorDetailB: '#9a68f3',
    colorDetailC: '#270a5c',

    /* --- 5 · hero rig --- */
    heroSize: 1.6, // scale of the hero rig, metres per authored unit
    heroReach: 0.85, // ring rigs: share of the circle radius they span
    heroLift: 3, // how far the rig rises, drops or arcs, metres
    heroSpin: 0.4, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.43, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the template rig is (off: the cast-local geode is the hero)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroFit: 0.72, // mass rigs grow to at least this share of the circle radius (heroSize is the floor)
    heroRough: 0.16, // roughness of the lit rig
    heroMetal: 0.08, // metalness of the lit rig
    heroShadow: 1, // 1 = the rig casts shadows
    colorHeroA: '#e7d4ff',
    colorHeroB: '#9a68f3',
    colorHeroC: '#270a5c',

    /* --- 6 · shed --- */
    dustRate: 5, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#e7d4ff',
    colorDustB: '#9a68f3',
    colorDustC: '#270a5c',
    colorDustD: '#1a140e',
    streakRate: 0, // sparks per second (off)
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#fff8e8',
    colorStreakB: '#e7d4ff',
    colorStreakC: '#9a68f3',
    colorStreakD: '#9a68f3',
    chipRate: 0, // fragments per second (off)
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#9a68f3',
    colorChipB: '#e7d4ff',
    colorChipC: '#270a5c',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 0, // motes per second off the pieces (none: no pieces)
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#fff8e8',
    colorMoteB: '#e7d4ff',
    colorMoteC: '#9a68f3',
    colorMoteD: '#9a68f3',

    /* --- 8 · the beat --- */
    impactShake: 0.5, // camera punch on the beat
    impactFlash: 0.04, // screen flash on the beat (a tint, never a full-frame flash)
    colorFlash: '#e7d4ff',
    burstRadius: 3.2, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0, // strength of the burst shell (off: the nodule bursts in chips)
    impactChips: 30, // fragments thrown up and out on the beat
    impactDust: 8, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#fff8e8',
    colorBurstB: '#9a68f3',
    colorBurstC: '#270a5c',
    shockRadius: 6.5, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring and frost decal on the beat (0 = none)
    colorShockA: '#3a2470',
    colorShockB: '#7a52cf',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 5, // aftershock ring size, metres
    aftershockShake: 0.2, // camera punch of the aftershock
    aftershockLight: 7.7, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 4.4, // reach of the blow, metres
    hitImpulse: 7.5, // how hard bodies are thrown
    hitLift: 3.2, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.75, // 0..1 how far a felled body is stained
    markTime: 0.35, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#2a2440', // what the body is stained toward
    colorMarkRim: '#9a68f3',
    markRimGlow: 2.08, // rim light on a marked body
    colorMarkEdge: '#e7d4ff',
    markEdgeGlow: 3.38, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 14 · the geode (cast-local signature) --- */
    noduleSize: 0.95, // the thrown nodule, metres across
    noduleArc: 2.4, // height of the throw at mid-flight, metres
    noduleSpin: 8, // radians/second it tumbles
    noduleTrail: 50, // glints per second shed behind it
    geodeFit: 0.86, // the shell's ring, x the circle (seven petals)
    geodeSquash: 0.6, // dome height, x its radius (keeps it in frame)
    geodeRise: 0.22, // seconds for the shell to tear up out of the floor
    geodeOpenTilt: 0.95, // radians the petals lean out as they rise
    geodeSealAt: 0.3, // seconds after the beat the shell starts to close
    geodeSealTime: 0.22, // seconds the slam shut takes
    geodeFireAt: 0.55, // impact progress at which the points fire
    geodeFireTime: 0.12, // seconds the points take to cross
    geodeCrackAt: 0.92, // phase progress at which the shell falls open (1 = fade start; below 1 is late in the impact)
    geodeFallTime: 0.38, // seconds the petals take to fall flat
    geodeFallTilt: 1.42, // radians they fall out to (about flat)
    geodeSinkAt: 1.55, // fade progress at which it all starts to sink
    geodeCool: 0.8, // seconds for a flare to cool
    spikeCount: 14, // points fired (max 18)
    spikeLength: 2.6, // length of a point, metres
    spikeWidth: 0.46, // thickness of a point, metres
    spikeHeight: 1.7, // height the points meet at, metres
    spikeOvershoot: 0.55, // how far past the centre the tips run, metres
    spikeGlow: 0.55, // extra glow the fired points keep while they cool, 0..1
    spikeTurn: 0.35, // radians/second the knot turns once the geode is open
    knotGlints: 24, // glints per second off the knot
    geodeSeamGlow: 2.2, // glow of the split seams
    geodeCrystalGlow: 0.85, // glow inside the amethyst
    geodeSpecular: 0.75, // sun highlight (the crystal takes most of it)
    geodeRimGlow: 0.5, // fresnel rim on the crystal
    colorRindDeep: '#0e0b12', // rock rind, deep
    colorRind: '#3b3540', // rock rind, lit
    colorCrystalBed: '#2a0f55', // crystal bed
    colorCrystal: '#5a34b0', // amethyst
    colorCrystalGlow: '#9a68f3', // glow in the seams and crystal
    colorCrystalHot: '#c4a2ff', // the white-hot stop at a flare
    sealShake: 0.4, // camera punch as it slams shut
    sealLight: 9, // light punch as it slams shut
    sealDust: 4, // dust puffs squeezed out under each seam
    fireShake: 0.35, // camera punch as the points fire
    fireLight: 16, // light punch as the points fire
    fireShards: 50, // shards jetted out of the oculus
    crackShake: 0.3, // camera punch as the shell lands flat
    crackDust: 5, // dust puffs off each petal as it lands
    geodeFloorOpacity: 0.95, // strength of the geode floor
    geodeFloorGlow: 1.4, // glow in its cracks
    geodeFloorCell: 0.7, // crystal cell size, metres
    geodeFloorReach: 1.15, // floor radius, x the circle
    geodeFloorLetGo: 1.65, // fade progress at which the floor starts to go
    colorGeodeFloorDeep: '#08060c', // floor, deep
    colorGeodeFloor: '#221b2c' // floor, lit
  }
};
