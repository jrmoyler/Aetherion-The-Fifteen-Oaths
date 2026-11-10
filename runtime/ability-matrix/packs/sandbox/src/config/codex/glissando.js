/**
 * Glissando Sweep — sound — a sheet that shears sideways as it travels.
 *
 * Sound — a glissando sheet slides sideways and arrives late.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'glissando',
  meta: {
    label: 'Glissando Sweep',
    accent: '#f4ffd4',
    key: '',
    element: 'sound',
    hint: 'Sound — a glissando sheet slides sideways and arrives late',
    cast: 'line',
    glyph: '<path d="M16 62C30 28 48 78 64 36C74 18 80 48 88 30"/><path d="M36 36L64 64M64 36L36 64"/><path d="M70 66C76 70 76 80 70 84M78 62C88 70 88 82 78 88"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 30, // metres/second the front travels
    lifetime: 2.2, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast3', // which clip the body throws
    impactTime: 1.25, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 0, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#b6e33b',
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
    bodyOpacity: 0, // the template body (off: the glissando sheet carries the read)
    edgeGlow: 2.1,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.32,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 6, // breaths per second (radians)
    colorA: '#b6e33b',
    colorB: '#ffffff',
    colorC: '#314007',
    lensWarp: 0, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off)
    colorVoiceA: '#b6e33b',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 2.4, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // off: the template ring field read as outline rings // strength of the field
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.2, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 0.9, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#b6e33b',
    colorGroundB: '#314007',
    colorGroundStain: '#2c3420', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48; off: the slats fought the read)
    detailSize: 0.65, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 1.4, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.2, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#f4ffd4',
    colorDetailB: '#b6e33b',
    colorDetailC: '#314007',

    /* --- 5 · hero rig --- */
    heroSize: 2, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 0.8, // how far the rig rises, drops or arcs, metres
    heroSpin: 1, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.1, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is (off: the cast-local sheet is the hero)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    colorHeroA: '#f4ffd4',
    colorHeroB: '#b6e33b',
    colorHeroC: '#314007',

    /* --- 6 · shed --- */
    dustRate: 48, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#f4ffd4',
    colorDustB: '#b6e33b',
    colorDustC: '#314007',
    colorDustD: '#1a140e',
    streakRate: 108, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#f4ffd4',
    colorStreakC: '#b6e33b',
    colorStreakD: '#b6e33b',
    chipRate: 10.8, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#b6e33b',
    colorChipB: '#f4ffd4',
    colorChipC: '#314007',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#f4ffd4',
    colorMoteC: '#b6e33b',
    colorMoteD: '#b6e33b',

    /* --- 8 · the beat --- */
    impactShake: 0.5, // camera punch on the beat
    impactFlash: 0.13, // screen flash on the beat
    colorFlash: '#f4ffd4',
    burstRadius: 2.6, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.04, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 3, // fragments thrown up and out on the beat
    impactDust: 5, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#b6e33b',
    colorBurstC: '#314007',
    shockRadius: 3.2, // decal size, metres
    shockLife: 0.85,
    shockRing: 0.3, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#b6e33b',
    colorShockB: '#ffffff',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 2.4, // aftershock ring size, metres
    aftershockShake: 0.2, // camera punch of the aftershock
    aftershockLight: 5.6, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 1.15, // reach of the blow, metres
    hitImpulse: 9.5, // how hard bodies are thrown
    hitLift: 3.2, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.55, // 0..1 how far a felled body is stained
    markTime: 0.2, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#2c3420', // what the body is stained toward
    colorMarkRim: '#b6e33b',
    markRimGlow: 1.6, // rim light on a marked body
    colorMarkEdge: '#f4ffd4',
    markEdgeGlow: 2.6, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.68, // ribbon width at the head, metres
    trailLife: 1.3, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0.06, // strength of the ribbon
    trailGlow: 1.1, // brightness of the ribbon
    trailCore: 0.8, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 1.4, // width of the scar on the floor, metres
    scarLife: 2.6, // seconds the scar takes to cool and go
    scarOpacity: 0.7, // strength of the scar
    scarGlow: 0.5, // brightness of its hot seam
    colorScarA: '#b6e33b',
    colorScarB: '#314007',
    wakeSpacing: 2, // metres between wake decals along the path (0 = none)
    wakeRadius: 1, // size of each wake decal, metres
    wakeLife: 1.6, // seconds each wake decal lingers
    wakeChips: 1.2, // fragments thrown at each wake

    /* --- 15 · the glissando (cast-local hero) --- */
    sheetWidth: 6, // metres across the line
    sheetHeight: 3, // metres tall
    sheetBow: 0.9, // how far its middle bows forward, metres
    sheetCrest: 0.16, // how far the waveform top swings, × height
    sheetStart: 2.6, // metres ahead of the caster it rises
    sheetLag: 0.3, // share of the travel it waits before moving (it arrives late)
    sheetSlide: 2.4, // metres to one side it slides in from
    sheetShear: 1.1, // metres its top is sheared sideways in flight
    rippleAmp: 0.28, // ridge depth, metres
    rippleSpeed: 14, // how fast the ridges run across it
    chirpStart: 1.6, // ridges across the sheet at its low side
    chirpEnd: 7, // ridges across the sheet at its high side
    chirpClimb: 1.2, // how far the pitch climbs over the cast
    lateGlide: 1.6, // metres it keeps gliding on after the beat
    lateSlide: 1.2, // metres it keeps sliding sideways after the beat
    lateShear: -0.6, // metres of shear it settles to after the beat
    glideTime: 0.9, // seconds the glide takes, × global lifetime
    ringDecay: 1.6, // how fast the ringing dies after the beat
    ringFloor: 0.25, // share of the ringing that holds to the end
    tearStart: 1.45, // seconds after the beat it tears into strips, × global lifetime
    tearTime: 0.8, // seconds the tear takes, × global lifetime
    echoes: 2, // dimmer sheets following it
    echoSpacing: 1.3, // metres between echoes
    echoAlpha: 0.5, // strength of each echo, × the one before
    echoScale: 0.8, // size of each echo, × the one before
    sheetGlow: 1, // overall brightness
    sheetCore: 2, // HDR gain of the white-hot crests
    sheetOpacity: 0, // the old lime wall (off: the pipe rank and its pressure ripples carry the read)
    sheetFoot: 1, // glow where it scours the floor
    footDust: 50, // dust and sparks per second scoured off its foot
    grooveSpacing: 1.1, // metres between the scoured patches it leaves on the floor (0 = none)
    grooveRadius: 1.1, // size of each scoured patch, metres
    grooveLife: 3.2, // seconds the scouring stays, × global lifetime
    colorGroove: '#0d1600', // the dark the floor is scoured to
    colorSheetCore: '#ffffff', // white-hot crest
    colorSheetTint: '#b6e33b', // pale tint
    colorSheetBody: '#1c3008', // saturated body (also tints the scoured floor)
    colorSheetDeep: '#04110e', // dark deep in the troughs

    /* --- 16 · the pipe rank (the instrument the sound comes from) --- */
    pipeCount: 11, // pipes in the rank (max 16)
    pipeTall: 3.1, // the longest, lowest pipe, metres
    pipeShort: 0.95, // the shortest, highest pipe, metres
    pipeRadius: 0.24, // radius of the longest pipe, metres (shorter pipes are narrower)
    pipeSpan: 0.92, // share of the sheet width the pipes stand across
    rankBow: 0.6, // how far the middle of the rank bows toward the targets, metres
    chestHeight: 0.5, // height of the wind chest the pipes stand on, metres
    chestDepth: 0.75, // depth of the wind chest, metres
    rankLean: 0.6, // how far the pipes lean with the shear, × the sheet shear
    rankSink: 1.05, // how deep the rank sinks into the floor as it goes, × its height
    speakRate: 1.3, // runs up the rank per second (the glissando), before the pitch climbs
    speakWidth: 1.1, // pipes speaking at once around the run
    speakHum: 0.18, // how much every pipe keeps sounding under the run
    speakChord: 1, // all pipes speak together on the beat
    vibAmp: 0.09, // how far a speaking pipe swells and shivers, × its radius
    vibFreq: 26, // shiver rate of the longest pipe, radians/second (shorter pipes shiver faster)
    vibNodes: 4, // standing-wave loops along a pipe
    mouthGlow: 2, // lime light in a speaking pipe's mouth
    pipeRim: 0.35, // lime fresnel on a speaking pipe
    pipeSpecular: 1.1, // polish on the bronze
    pipeFlash: 0.35, // the bronze flares on the beat
    colorPipe: '#4f3f20', // cast bronze
    colorPipeShine: '#c08f4c', // polished bronze (bands, rims, mouldings)
    colorPipeDeep: '#0d0805', // bronze in shadow
    colorPipeMouth: '#b6e33b', // the lime of a speaking mouth
    colorPipeHot: '#f4ffd4', // the hottest mouth

    /* --- 17 · pressure ripples (thrown off each speaking pipe) --- */
    pressLife: 0.65, // seconds a ripple lives, × global lifetime
    pressSpeed: 3.2, // metres/second a ripple rolls out
    pressStart: 0.35, // radius a ripple leaves the pipe at, metres
    pressArc: 2.5, // radians of arc each ripple spans, centred on the caster side
    pressHeight: 0.85, // ripple height, × its pipe
    pressBody: 0.55, // opacity of the dark pressure body
    pressCrest: 2.2, // brightness of the thin lime crest
    pressCrestWidth: 0.05, // crest width, share of the ripple height
    pressWobble: 0.05, // heat-haze warp of the ripple, × its radius
    pressWarp: 0.05, // screen distortion the ripple writes
    pressMax: 28, // ripples alive at once (max 48)
    colorPressBody: '#111906', // the dark of the pressure band
    colorPressCrest: '#b6e33b' // the lime of its crest
  }
};
