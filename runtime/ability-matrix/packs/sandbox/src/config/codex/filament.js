/**
 * Filament Volley — light — a fan of bolts on staggered arcs.
 *
 * Light — filaments arc and stitch whatever they land on.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'filament',
  meta: {
    label: 'Filament Volley',
    accent: '#fff8dc',
    key: '',
    element: 'light',
    hint: 'Light — filaments arc and stitch whatever they land on',
    cast: 'line',
    glyph: '<path d="M18 70Q34 30 50 70"/><path d="M34 70Q50 24 66 70"/><path d="M50 70Q66 30 82 70"/><path d="M36 36L64 64M64 36L36 64"/><path d="M78 62V74M72 68H84M73 63L83 73M83 63L73 73"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 42, // metres/second the front travels
    lifetime: 2.2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast3', // which clip the body throws
    impactTime: 1.25, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 0, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#ffcd3d',
    lightIntensity: 12, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.5, // 0..1 how much it shimmers
    impactLight: 15.4, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.32, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 39.6, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 3, // radians/second the body turns
    thickness: 0.34, // width of a single body part, metres
    count: 8, // parts in the body (max 12)
    height: 3.5, // how tall the body stands, metres
    sweep: 1.8, // lateral reach, metres
    lean: 0.85, // how far the body opens on the beat
    bodyOpacity: 0, // the template sheet (off: the stitch carries the read)
    edgeGlow: 3.15,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.48,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 6, // breaths per second (radians)
    colorA: '#ffcd3d',
    colorB: '#ffffff',
    colorC: '#957004',
    lensWarp: 0, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off)
    colorVoiceA: '#ffcd3d',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 2.4, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // off: its lane rays fought the stitch // strength of the field
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.42, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 0.9, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#ffcd3d',
    colorGroundB: '#957004',
    colorGroundStain: '#3a3020', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48; off: the barbs are the pieces)
    detailSize: 0.45, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 1, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.8, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#fff8dc',
    colorDetailB: '#ffcd3d',
    colorDetailC: '#957004',

    /* --- 5 · hero rig --- */
    heroSize: 1.4, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 2.2, // how far the rig rises, drops or arcs, metres
    heroSpin: 1.5, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.65, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is (off: the cast-local stitch is the hero)
    heroDeep: 0.5, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    colorHeroA: '#fff8dc',
    colorHeroB: '#ffcd3d',
    colorHeroC: '#957004',

    /* --- 6 · shed --- */
    dustRate: 32, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#fff8dc',
    colorDustB: '#ffcd3d',
    colorDustC: '#957004',
    colorDustD: '#1a140e',
    streakRate: 162, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffe08a',
    colorStreakB: '#fff8dc',
    colorStreakC: '#ffcd3d',
    colorStreakD: '#ffcd3d',
    chipRate: 10.8, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#ffcd3d',
    colorChipB: '#fff8dc',
    colorChipC: '#957004',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffe08a',
    colorMoteB: '#fff8dc',
    colorMoteC: '#ffcd3d',
    colorMoteD: '#ffcd3d',

    /* --- 8 · the beat --- */
    impactShake: 0.39, // camera punch on the beat
    impactFlash: 0.22, // screen flash on the beat
    colorFlash: '#fff8dc',
    burstRadius: 2.6, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.15, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 3, // fragments thrown up and out on the beat
    impactDust: 3, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#ffcd3d',
    colorBurstC: '#957004',
    shockRadius: 3.2, // decal size, metres
    shockLife: 0.85,
    shockRing: 0.3, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#ffcd3d',
    colorShockB: '#ffffff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 2.4, // aftershock ring size, metres
    aftershockShake: 0.15, // camera punch of the aftershock
    aftershockLight: 9.8, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 1.15, // reach of the blow, metres
    hitImpulse: 8.55, // how hard bodies are thrown
    hitLift: 3.2, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.8, // 0..1 how far a felled body is stained
    markTime: 0.2, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#3a3020', // what the body is stained toward
    colorMarkRim: '#ffcd3d',
    markRimGlow: 2.4, // rim light on a marked body
    colorMarkEdge: '#fff8dc',
    markEdgeGlow: 3.9, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.26, // ribbon width at the head, metres
    trailLife: 1.1, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0, // the template ribbon arched the whole line into a curtain; the stitch is the wake now // strength of the ribbon
    trailGlow: 1.65, // brightness of the ribbon
    trailCore: 0.8, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 0.35, // width of the scar on the floor, metres
    scarLife: 2.6, // seconds the scar takes to cool and go
    scarOpacity: 0, // off: the template scar drew thin lane lines; the barb scorches and seam mark the floor // strength of the scar
    scarGlow: 2.4, // brightness of its hot seam
    colorScarA: '#ffcd3d',
    colorScarB: '#957004',
    wakeSpacing: 2.5, // metres between wake decals along the path (0 = none)
    wakeRadius: 0.6, // size of each wake decal, metres
    wakeLife: 1.6, // seconds each wake decal lingers
    wakeChips: 1.2, // fragments thrown at each wake

    /* --- 15 · the filaments (cast-local hero) --- */
    filStrands: 3, // strands braided into one bolt
    filRadius: 0.05, // radius of one strand, metres
    filBraid: 0.1, // how far the strands wind round the arc, metres
    filBraidTurns: 3.5, // turns of the braid along one arc
    filArc: 1, // arc height multiplier
    filArcMin: 0.55, // arc height for a zero span, metres
    filArcPerMetre: 0.4, // extra arc height per metre of span
    filGlow: 1, // overall brightness
    filCore: 1.7, // HDR gain of the white-hot core
    filHeadGlow: 2.6, // the bolt head while it is drawn
    filTwang: 0.14, // sideways twang, metres
    filTwangFreq: 24, // twang rate, radians/second
    filTwangDecay: 2.2, // how fast the twang dies after the beat
    colorFilCore: '#ffffff', // white-hot core
    colorFilTint: '#ffd36a', // pale tint
    colorFilBody: '#c9800a', // saturated body
    colorFilDeep: '#1e0f02', // dark deep at the silhouette
    seamRadius: 0.035, // radius of the seam pulled along the floor between barbs (0 = none)
    stitchTime: 0.45, // seconds the arcs take to cinch tight after the beat, × global lifetime
    stitchCinch: 0.5, // how much of their height they lose cinching
    pulseSpeed: 7, // stitches per second the current runs down the chain
    pulseWidth: 0.45, // width of the current, in stitches
    pulseGlow: 1.4, // brightness of the current
    pulseMotes: 40, // motes per second off the stitched barbs
    headSparks: 160, // sparks per second off the bolt head in flight
    unravelStart: 1.2, // seconds after the beat the stitch starts to unravel, × global lifetime
    unravelStagger: 0.08, // seconds between one stitch and the next unravelling, × global lifetime
    unravelTime: 0.4, // seconds one stitch takes to burn away, × global lifetime

    /* --- 16 · the barbs --- */
    barbLength: 1.5, // metres
    barbWidth: 0.24, // metres
    barbBury: 0.3, // share of the barb driven under the floor
    barbLean: 0.38, // radians it leans back toward where its bolt came from
    barbDrive: 0.08, // seconds it takes to drive in
    barbDriveHeight: 1.4, // metres above its rest it is driven from
    barbCool: 0.8, // seconds its strike heat takes to cool, × global lifetime
    barbSink: 0.4, // seconds it takes to sink away at the end, × global lifetime
    barbGlow: 1, // brightness of its heat
    barbSpecular: 1.1, // sun glint on the gilt
    colorBarbGold: '#b88412', // gilt
    colorBarbDeep: '#1c1003', // bronze in the grooves
    colorBarbHot: '#ff9a1a', // heat
    barbScorch: 0.7, // scorch under each barb, metres
    barbSparks: 16, // sparks off each landing
    barbChips: 4, // chips off each landing
    barbShake: 0.07, // camera punch of each landing
    barbLight: 2.5 // light punch of each landing
  }
};
