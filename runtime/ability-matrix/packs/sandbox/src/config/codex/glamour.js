/**
 * Glamour Sweep — illusion — a sheet that shears sideways as it travels.
 *
 * Illusion — a glamour sheet shows the cut early and lands it late.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'glamour',
  meta: {
    label: 'Glamour Sweep',
    accent: '#ffe8f6',
    key: '',
    element: 'illusion',
    hint: 'Illusion — a glamour sheet shows the cut early and lands it late',
    cast: 'line',
    glyph: '<path d="M16 62C30 28 48 78 64 36C74 18 80 48 88 30"/><path d="M30 50H70"/><path d="M66 72Q78 60 90 72Q78 84 66 72Z"/><circle cx="78" cy="72" r="3"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 32.4, // metres/second the front travels
    lifetime: 2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast2', // which clip the body throws
    impactTime: 1.15, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 0, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#f25fb0',
    lightIntensity: 3.2, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.6, // 0..1 how much it shimmers
    impactLight: 5, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.27, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 24.2, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 2.42, // radians/second the body turns
    thickness: 0.28, // width of a single body part, metres
    count: 7, // parts in the body (max 12)
    height: 3.05, // how tall the body stands, metres
    sweep: 1.45, // lateral reach, metres
    lean: 0.65, // how far the body opens on the beat
    bodyOpacity: 0.06, // the template sheet: a trace only, the blade carries the read
    edgeGlow: 2.04,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.35,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 5, // breaths per second (radians)
    colorA: '#f25fb0',
    colorB: '#ffffff',
    colorC: '#5c0a37',
    lensWarp: 0.45, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off)
    colorVoiceA: '#f25fb0',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 2.4, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the field
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.25, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 0.9, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#f25fb0',
    colorGroundB: '#5c0a37',
    colorGroundStain: '#3a1a34', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48) — off: the petal pieces read as noise
    detailSize: 0.6, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 1.4, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.32, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#ffe8f6',
    colorDetailB: '#f25fb0',
    colorDetailC: '#5c0a37',

    /* --- 5 · hero rig --- */
    heroSize: 2, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 0.8, // how far the rig rises, drops or arcs, metres
    heroSpin: 1, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.21, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is — off: the blade is the hero now
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    colorHeroA: '#ffe8f6',
    colorHeroB: '#f25fb0',
    colorHeroC: '#5c0a37',

    /* --- 6 · shed --- */
    dustRate: 32, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#ffe8f6',
    colorDustB: '#f25fb0',
    colorDustC: '#5c0a37',
    colorDustD: '#1a140e',
    streakRate: 99, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#ffe8f6',
    colorStreakC: '#f25fb0',
    colorStreakD: '#f25fb0',
    chipRate: 10.8, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#f25fb0',
    colorChipB: '#ffe8f6',
    colorChipC: '#5c0a37',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#ffe8f6',
    colorMoteC: '#f25fb0',
    colorMoteD: '#f25fb0',

    /* --- 8 · the beat --- */
    impactShake: 0.33, // camera punch on the beat
    impactFlash: 0.05, // screen flash on the beat
    colorFlash: '#ffe8f6',
    burstRadius: 2.3, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 26, // fragments thrown up and out on the beat
    impactDust: 10, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#f25fb0',
    colorBurstC: '#5c0a37',
    shockRadius: 3.2, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#f25fb0',
    colorShockB: '#ffffff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 2.4, // aftershock ring size, metres
    aftershockShake: 0.13, // camera punch of the aftershock
    aftershockLight: 7.7, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 1.15, // reach of the blow, metres
    hitImpulse: 6.8, // how hard bodies are thrown
    hitLift: 3.2, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.6, // 0..1 how far a felled body is stained
    markTime: 0.3, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#3a1a34', // what the body is stained toward
    colorMarkRim: '#f25fb0',
    markRimGlow: 1.76, // rim light on a marked body
    colorMarkEdge: '#ffe8f6',
    markEdgeGlow: 2.86, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.64, // ribbon width at the head, metres
    trailLife: 1.3, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0, // strength of the ribbon
    trailGlow: 1.21, // brightness of the ribbon
    trailCore: 0.8, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 1.4, // width of the scar on the floor, metres
    scarLife: 2.6, // seconds the scar takes to cool and go
    scarOpacity: 0.45, // strength of the scar
    scarGlow: 0.5, // brightness of its hot seam
    colorScarA: '#f25fb0',
    colorScarB: '#5c0a37',
    wakeSpacing: 2, // metres between wake decals along the path (0 = none)
    wakeRadius: 0.55, // size of each wake decal, metres
    wakeLife: 1.6, // seconds each wake decal lingers
    wakeChips: 1.2, // fragments thrown at each wake

    /* --- 13 · the glamour blade (the signature) --- */
    bladeHeight: 3.7, // tip-to-heel height of the blade, metres
    bladeWidth: 2.3, // how broad the crescent is, × its authored width
    bladeThick: 1.6, // spine thickness, × authored
    bladeStart: 0.3, // its size as it leaves the hand, × full
    bladeHover: 0.25, // heel height above the floor in flight, metres
    bladeShear: 1, // how far it draws back sideways in flight, × the cut reach
    bladeLean: 0.32, // radians it leans into its sideways motion
    bladeCutReach: 1.45, // half-width of the swing across the line, × sweep
    bladeCutFrom: 0.72, // share of the travel at which the swing across begins
    bladeCutYaw: 0.3, // radians the blade turns through the swing
    bladeEmbed: 0.2, // metres the tip bites into the floor after the cut
    bladeEmbedTilt: 0.8, // radians it leans over once it has bitten
    bladeOvershoot: 0.18, // the swing's carry past its end, × the reach
    bladeDrag: 0.8, // metres it keeps ploughing sideways through the floor after it bites
    bladeDragTime: 1.5, // seconds that plough takes
    bladeSparks: 90, // sparks per second off the heel while it ploughs
    bladeSway: 0.05, // radians it rocks while it stands in the floor
    bladeSwayRate: 4.2, // radians/second of the rocking
    bladePeelAt: 1.05, // clock (0..2: impact then fade) the glamour starts peeling
    bladePeelEnd: 1.97, // clock it is gone by
    bladeEdgeGlow: 2.8, // the cutting edge
    bladeSeamGlow: 0.14, // the engraved filigree
    bladeRimGlow: 1.1, // a cold steel limb that lifts the edge off the night floor
    colorBladeRim: '#9db3d4', // the limb colour
    bladeLandScale: 1.55, // size once it bites, × full
    bladeRough: 0.34,
    bladeMetal: 0.4,
    bladeOpacity: 1, // 0 hides the blade
    bladeShadow: 1, // 1 = the blade casts shadows
    colorBladeDeep: '#12060e', // deep: lacquer in shadow
    colorBladeBody: '#3e1a38', // body: lacquer in the sun
    colorBladeHot: '#f25fb0', // tint: the glamour
    colorBladeCore: '#ffe8f6', // core: the edge's white line

    /* --- 14 · the false copies (the glamour shown early) --- */
    ghostCount: 2, // 0..2: the copy that runs ahead and the afterimage behind
    ghostLead: 0.38, // how far ahead of the blade the false copy runs, share of the travel
    ghostLag: 0.14, // how far behind the afterimage trails, share of the travel
    ghostHoles: 0.52, // 0..1 how eaten-through a copy is
    ghostGlow: 0.3, // edge glow of a copy, × the blade's
    ghostScale: 0.8, // size of a copy, × the blade's
    ghostBreak: 0.18, // seconds the false copy takes to burn away when the blade lands in it
    ghostOffset: 0.6, // metres the false copy stands off the blade's path

    /* --- 15 · the cut --- */
    cutWidth: 5, // width of the slash on the floor, metres
    cutLength: 1.15, // length of the slash, × the swing
    cutOpacity: 0.95,
    cutGlow: 2.2, // the hot seam
    cutShear: 1, // shear marks along it
    cutPre: 0.5, // how strongly the false copy pre-draws it
    colorCutDeep: '#14040d',
    peelMotes: 140 // motes per second off the peeling front
  }
};
