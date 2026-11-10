/**
 * Afterimage Swing — illusion — a blade hinged at the hand.
 *
 * Illusion — the swing is the decoy; the blade arrives on the way back.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'afterimage',
  meta: {
    label: 'Afterimage Swing',
    accent: '#ffd4ee',
    key: '',
    element: 'illusion',
    hint: 'Illusion — the swing is the decoy; the blade arrives on the way back',
    cast: 'line',
    glyph: '<path d="M50 16V28"/><path d="M18 78L50 28L82 70"/><circle cx="50" cy="18" r="5"/><path d="M30 50H70"/><path d="M66 72Q78 60 90 72Q78 84 66 72Z"/><circle cx="78" cy="72" r="3"/>'
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
    lightColor: '#f25fad',
    lightIntensity: 8.8, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.6, // 0..1 how much it shimmers
    impactLight: 12.1, // extra light on the beat, decays on its own

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
    bodyOpacity: 0,
    edgeGlow: 2.04,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.35,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 5, // breaths per second (radians)
    colorA: '#f25fad',
    colorB: '#ffffff',
    colorC: '#5c0a36',
    lensWarp: 0.4, // strength of the distortion it writes

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement
    colorVoiceA: '#f25fad',
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
    colorGroundA: '#f25fad',
    colorGroundB: '#5c0a36',
    colorGroundStain: '#3a1a34', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48)
    detailSize: 0.6, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 1.6, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.32, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#ffd4ee',
    colorDetailB: '#f25fad',
    colorDetailC: '#5c0a36',

    /* --- 5 · hero rig --- */
    heroSize: 3, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 0.9, // how far the rig rises, drops or arcs, metres
    heroSpin: 1, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.21, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    colorHeroA: '#ffd4ee',
    colorHeroB: '#f25fad',
    colorHeroC: '#5c0a36',

    /* --- 6 · shed --- */
    dustRate: 12, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#ffd4ee',
    colorDustB: '#f25fad',
    colorDustC: '#5c0a36',
    colorDustD: '#1a140e',
    streakRate: 30, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#ffd4ee',
    colorStreakC: '#f25fad',
    colorStreakD: '#f25fad',
    chipRate: 10.8, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#f25fad',
    colorChipB: '#ffd4ee',
    colorChipC: '#5c0a36',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#ffd4ee',
    colorMoteC: '#f25fad',
    colorMoteD: '#f25fad',

    /* --- 8 · the beat --- */
    impactShake: 0.33, // camera punch on the beat
    impactFlash: 0.18, // screen flash on the beat
    colorFlash: '#ffd4ee',
    burstRadius: 2.3, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.1, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 3, // fragments thrown up and out on the beat
    impactDust: 3, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#f25fad',
    colorBurstC: '#5c0a36',
    shockRadius: 3.2, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#f25fad',
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
    colorMarkRim: '#f25fad',
    markRimGlow: 1.76, // rim light on a marked body
    colorMarkEdge: '#ffd4ee',
    markEdgeGlow: 2.86, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.3, // ribbon width at the head, metres
    trailLife: 0.9, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0, // strength of the ribbon
    trailGlow: 1.21, // brightness of the ribbon
    trailCore: 0.4, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 0.6, // width of the scar on the floor, metres
    scarLife: 2.6, // seconds the scar takes to cool and go
    scarOpacity: 0, // strength of the scar
    scarGlow: 1.76, // brightness of its hot seam
    colorScarA: '#f25fad',
    colorScarB: '#5c0a36',
    wakeSpacing: 0, // metres between wake decals along the path (0 = none)
    wakeRadius: 0.7, // size of each wake decal, metres
    wakeLife: 1.6, // seconds each wake decal lingers
    wakeChips: 1.2, // fragments thrown at each wake

    /* --- 15 · the decoy and its afterimages (upgrade) --- */
    decoyOpacity: 1.2, // strength of the decoy image flying out
    decoyWeave: 0.9, // how far the decoy swings off the line, × reach (sweep)
    decoyStreaks: 90, // streaks per second off the decoy
    ghostCount: 4, // afterimages left down the line (max 8)
    ghostStart: 0.2, // the first is left this far along the line (× length), clear of the caster
    ghostOpacity: 0.85, // strength of the afterimages
    ghostLife: 0.9, // seconds an afterimage takes to dim to a third, × global lifetime
    ghostScan: 34, // scanlines per metre through the images
    ghostBreak: 0.22, // seconds an afterimage takes to break when the blade passes
    ghostShards: 16, // glass shards each broken afterimage throws
    ghostCollapse: 0.15, // seconds after the blade stops that the afterimages it did not reach start to collapse
    ghostStagger: 0.14, // seconds between those collapses

    /* --- 16 · the blade (upgrade) --- */
    bladeSize: 1.55, // crescent radius, metres (tip to tip ≈ 1.9 ×)
    bladeHeight: 1.35, // metres off the floor it flies at
    bladeBank: 0.85, // radians the crescent is tipped off flat
    bladeSpin: 16, // radians/second it spins
    bladeSpinDown: 0.8, // seconds its spin decays over on the way back, × global lifetime
    bladeStop: 0.32, // where it comes back to, × the line (0 = the caster)
    returnArc: 2.6, // metres the way back bows out to the side, like a boomerang
    returnSide: 1.6, // metres off the line it hangs once back (clear of the caster)
    bladeBob: 0.12, // metres it bobs while it hangs there
    bladeBobRate: 3.2, // bob rate (radians/second)
    bladeForm: 0.08, // seconds it takes to form out of panes on the beat
    bladeExitAt: 1.5, // fade progress it starts to shatter at (1 = fade start, 2 = end)
    bladeShards: 40, // glass shards it throws when it breaks
    bladeSpecular: 1.5, // sun glint off its facets
    bladeFresnel: 0.6, // magenta rim
    bladeAmbient: 0.32, // shadow-side light
    bladeEdgeGlow: 2, // brightness of the cutting edge
    bladeSheen: 0.45, // oil-on-glass sheen at grazing angles
    bladeShadow: 1, // 1 = the blade casts a shadow
    colorBladeCore: '#fff3fa', // white-hot edge
    colorBladeTint: '#ffb3dc', // pale pink sheen
    colorBladeBody: '#9c1460', // saturated magenta glass
    colorBladeDeep: '#16020f', // near-black plum spine

    /* --- 17 · the cut (upgrade) --- */
    gashRadius: 2.2, // radius of the arc the blade cuts through the group, metres
    gashSpan: 0.85, // half-angle of that arc, radians
    gashWidth: 0.6, // width of the gash it leaves in the floor, metres
    cutTime: 0.3, // seconds the sweep through the group takes
    cutLife: 0.45, // seconds the light of the cut takes to fade after the sweep
    cutOpacity: 2.2, // strength of the swept light
    cutInner: 0.72, // inner radius of the swept light, × arc radius

    /* --- 18 · the floor (upgrade) --- */
    floorOpacity: 1, // strength of the gash and the pools
    floorGlow: 1.2, // glow of the gash's seam and the pools' fringe
    floorEcho: 0.5, // strength of the mirror pool under each afterimage
    echoSize: 0.75, // pool radius, × blade size
    floorErodeAt: 1.55 // fade progress the floor starts to break up at
  }
};
