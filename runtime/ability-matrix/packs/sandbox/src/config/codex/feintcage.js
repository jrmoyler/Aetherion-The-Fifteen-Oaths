/**
 * Feint Cage — illusion — bars that drop in a ring and then move.
 *
 * Illusion — a cage and its feint spin opposite ways, and only one of them cuts.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'feintcage',
  meta: {
    label: 'Feint Cage',
    accent: '#ffc6e6',
    key: '',
    element: 'illusion',
    hint: 'Illusion — a cage and its feint spin opposite ways, and only one of them cuts',
    cast: 'zone',
    glyph: '<path d="M28 22V78M40 16V84M50 12V88M60 16V84M72 22V78"/><path d="M22 28H78M22 72H78"/><path d="M36 36L64 64M64 36L36 64"/><path d="M66 72Q78 60 90 72Q78 84 66 72Z"/><circle cx="78" cy="72" r="3"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 28.8, // metres/second the front travels
    lifetime: 2.2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast3', // which clip the body throws
    impactTime: 1.25, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 4.7, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#f25faa',
    lightIntensity: 5.5, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.6, // 0..1 how much it shimmers
    impactLight: 12.1, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.32, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 24.2, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 3.3, // radians/second the body turns
    thickness: 0.34, // width of a single body part, metres
    count: 8, // parts in the body (max 12)
    height: 3.5, // how tall the body stands, metres
    sweep: 1.8, // lateral reach, metres
    lean: 0.85, // how far the body opens on the beat
    bodyOpacity: 0, // the template body sheet (off: the cage carries the read)
    edgeGlow: 1.27,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.35,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 6, // breaths per second (radians)
    colorA: '#f25faa',
    colorB: '#ffffff',
    colorC: '#5c0a34',
    lensWarp: 0, // off: the body shape it warps is gone

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off: the feint cage is the second voice)
    colorVoiceA: '#f25faa',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 9, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the template field (off: the cage floor is the ground)
    groundLand: 0.32, // seconds the field takes to land out to the rim after the beat
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.25, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundTelegraph: 0.32, // how strongly the footprint shows before the beat
    groundStain: 0.55, // strength of the residue decal left at the beat
    groundStainReach: 1.05, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#4a1430',
    colorGroundB: '#5c0a34',
    colorGroundStain: '#3a1a34', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48; off: the bars are the pieces)
    detailSize: 0.6, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 2.6, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.32, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#ffc6e6',
    colorDetailB: '#f25faa',
    colorDetailC: '#5c0a34',

    /* --- 5 · hero rig --- */
    heroSize: 1.6, // scale of the hero rig, metres per authored unit
    heroReach: 0.85, // ring rigs: share of the circle radius they span
    heroLift: 3, // how far the rig rises, drops or arcs, metres
    heroSpin: 0.4, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.21, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the template rig is (off: the cast-local cage is the hero)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroFit: 0.72, // mass rigs grow to at least this share of the circle radius (heroSize is the floor)
    colorHeroA: '#ffc6e6',
    colorHeroB: '#f25faa',
    colorHeroC: '#5c0a34',

    /* --- 6 · shed --- */
    dustRate: 4, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#ffc6e6',
    colorDustB: '#f25faa',
    colorDustC: '#5c0a34',
    colorDustD: '#1a140e',
    streakRate: 0, // sparks per second (off: the feet throw their own)
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#ffc6e6',
    colorStreakC: '#f25faa',
    colorStreakD: '#f25faa',
    chipRate: 0, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#f25faa',
    colorChipB: '#ffc6e6',
    colorChipC: '#5c0a34',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 0, // motes per second off the pieces (none: no pieces)
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#ffc6e6',
    colorMoteC: '#f25faa',
    colorMoteD: '#f25faa',

    /* --- 8 · the beat --- */
    impactShake: 0.33, // camera punch on the beat
    impactFlash: 0.04, // screen flash on the beat (a tint, never a full-frame flash)
    colorFlash: '#ffc6e6',
    burstRadius: 3.8, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0, // strength of the burst shell (off: the plant hits with dust and chips)
    impactChips: 14, // fragments thrown up and out on the beat
    impactDust: 8, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#f25faa',
    colorBurstC: '#5c0a34',
    shockRadius: 6.5, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#5c1a3a',
    colorShockB: '#a0406e',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 5, // aftershock ring size, metres
    aftershockShake: 0.13, // camera punch of the aftershock
    aftershockLight: 7.7, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 4.4, // reach of the blow, metres
    hitImpulse: 7.6, // how hard bodies are thrown
    hitLift: 3.2, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.6, // 0..1 how far a felled body is stained
    markTime: 0.3, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#3a1a34', // what the body is stained toward
    colorMarkRim: '#f25faa',
    markRimGlow: 1.76, // rim light on a marked body
    colorMarkEdge: '#ffc6e6',
    markEdgeGlow: 2.86, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 14 · the cage (cast-local signature) --- */
    cageCount: 9, // bars in each cage (max 14)
    cageHeight: 3.3, // bar height, metres
    cageWidth: 0.34, // bar thickness, metres (the spearhead is ~2.3x this)
    cageFit: 0.8, // real cage ring, x the circle
    feintFit: 1.02, // feint cage ring, x the circle
    cageDrop: 1.5, // height the sheaves arrive at over the circle, metres
    cageArc: 0.45, // extra height of the throw at mid-flight, metres
    cageRoll: 7, // radians/second the sheaves tumble in flight
    cageBundle: 1.3, // radius of a sheaf in flight, metres
    cageFlightScale: 0.45, // bar length in flight, x cageHeight
    cageFeintGap: 2.3, // the feint sheaf flies this far beside the real one, metres
    cageOpen: 0.24, // seconds from the beat for the bars to burst out and stab in
    cageDig: 0.15, // how deep a planted foot sits, metres
    cageSpin: 1.4, // radians/second the real cage turns before the cut
    feintSpin: 1.9, // radians/second the feint turns, the other way
    cageCutAt: 0.62, // impact progress at which the real cage cuts
    cageCutTime: 0.2, // seconds the clench takes
    cageLean: 0.62, // radians each bar leans in when it cuts
    cageGrind: 0.3, // radians/second the clenched cage keeps grinding round
    cageCool: 0.7, // seconds for the blades to cool from white
    cageSinkAt: 1.5, // fade progress at which the bars start to sink (1 = fade start)
    feintDissolve: 0.35, // seconds the feint takes to glitch apart
    cageSeamGlow: 1.1, // glow in the collars and twist groove
    cageEdgeGlow: 1.0, // glow along the spearhead arrises
    cageRimGlow: 0.12, // fresnel rim in the seam colour
    cageSpecular: 0.5, // sun highlight on the lacquer
    feintGlow: 0.6, // seam glow of the feint (its rim is stronger)
    feintOpacity: 0.4, // how solid the feint afterimage is (translucent)
    cageLit: 0.55, // how strongly the sun lights the lacquer
    colorCageDeep: '#040102', // lacquer, deep
    colorCageBody: '#12040b', // lacquer, lit
    colorCageSeam: '#f25faa', // seams and blades
    colorCageHot: '#ffd2ea', // the blades at the cut
    colorFeintBody: '#140c24', // the feint's afterimage body (dim violet)
    colorFeintSeam: '#8a6ad8', // the feint's seams, rim and floor dash (violet)
    plantDust: 3, // dust puffs off each foot as it stabs in
    plantChips: 4, // chips off each foot
    plantShake: 0.3, // camera punch of the plant
    plantLight: 6, // light punch of the plant
    cutShake: 0.4, // camera punch of the cut
    cutLight: 14, // light punch of the cut
    cutSparks: 90, // sparks off the blades at the cut
    feintMotes: 120, // motes the feint breaks into
    footSparks: 70, // sparks per second off the ploughing feet
    gashSmoke: 18, // smoke puffs per second off the gashes
    floorOpacity: 0.95, // strength of the cage floor
    floorGlow: 0.8, // glow of the groove and gashes
    floorGroove: 0.5, // width of the plough groove, metres
    floorReach: 1.12, // floor stain radius, x the circle
    floorLetGo: 1.6, // fade progress at which the floor starts to go
    colorFloorDeep: '#0a0306', // floor stain, deep
    colorFloorBody: '#1c0814' // floor stain, lit
  }
};
