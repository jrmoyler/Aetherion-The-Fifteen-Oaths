/**
 * Doppel Lance — illusion — a drilling blade riding the line.
 *
 * Illusion — the lance you see is late; the cut is a body-width to the side.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'doppel',
  meta: {
    label: 'Doppel Lance',
    accent: '#ffd0ea',
    key: '',
    element: 'illusion',
    hint: 'Illusion — the lance you see is late; the cut is a body-width to the side',
    cast: 'line',
    glyph: '<path d="M14 50H70"/><path d="M62 38L86 50L62 62"/><path d="M22 40V60"/><path d="M30 50H70"/><path d="M66 72Q78 60 90 72Q78 84 66 72Z"/><circle cx="78" cy="72" r="3"/>'
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
    lightColor: '#f25fb5',
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
    bodyOpacity: 0, // the template's pink fan (off: the two lances carry the read)
    edgeGlow: 2.04,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.35,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 5, // breaths per second (radians)
    colorA: '#f25fb5',
    colorB: '#ffffff',
    colorC: '#5c0a3a',
    lensWarp: 0, // strength of the distortion it writes (off: the fan it warps is gone)

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off: the decoy is the second placement now)
    colorVoiceA: '#f25fb5',
    colorVoiceB: '#ffffff',

    /* --- 3 · the ground --- */
    groundWidth: 2.4, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the template field (off: it drew the old pink fan)
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.25, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundStain: 0.9, // strength of the residue decal left at the beat
    groundStainReach: 0.9, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#c2347f',
    colorGroundB: '#26041a',
    colorGroundStain: '#3a1a34', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48; off: the decoy's shards are the pieces)
    detailSize: 0.6, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 1.2, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.32, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#ffd0ea',
    colorDetailB: '#f25fb5',
    colorDetailC: '#5c0a3a',

    /* --- 5 · hero rig --- */
    heroSize: 1.8, // scale of the hero rig, metres per authored unit
    heroReach: 1, // ring rigs: share of the circle radius they span
    heroLift: 0.9, // how far the rig rises, drops or arcs, metres
    heroSpin: 1, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.21, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the rig is (off: the cast-local lance is the hero)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroMinSpan: 1.5, // line rigs grow to at least this cross-section, metres (heroSize is the floor)
    colorHeroA: '#ffd0ea',
    colorHeroB: '#f25fb5',
    colorHeroC: '#5c0a3a',

    /* --- 6 · shed --- */
    dustRate: 8, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#ffd0ea',
    colorDustB: '#f25fb5',
    colorDustC: '#5c0a3a',
    colorDustD: '#1a140e',
    streakRate: 30, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#ffffff',
    colorStreakB: '#ffd0ea',
    colorStreakC: '#f25fb5',
    colorStreakD: '#f25fb5',
    chipRate: 3, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#f25fb5',
    colorChipB: '#ffd0ea',
    colorChipC: '#5c0a3a',
    colorChipD: '#2a241c',

    /* --- 7 · motes --- */
    moteRate: 0, // motes per second off the pieces (none: the pieces are off)
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#ffffff',
    colorMoteB: '#ffd0ea',
    colorMoteC: '#f25fb5',
    colorMoteD: '#f25fb5',

    /* --- 8 · the beat --- */
    impactShake: 0.33, // camera punch on the beat
    impactFlash: 0.06, // screen flash on the beat
    colorFlash: '#ffd0ea',
    burstRadius: 2.3, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0.1, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 3, // fragments thrown up and out on the beat
    impactDust: 3, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#ffffff',
    colorBurstB: '#f25fb5',
    colorBurstC: '#5c0a3a',
    shockRadius: 3.2, // decal size, metres
    shockLife: 0.85,
    shockRing: 0, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#f25fb5',
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
    colorMarkRim: '#f25fb5',
    markRimGlow: 1.76, // rim light on a marked body
    colorMarkEdge: '#ffd0ea',
    markEdgeGlow: 2.86, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 12 · the trail --- */
    trailWidth: 0.42, // ribbon width at the head, metres
    trailLife: 1.6, // seconds a point of ribbon lasts after the head crosses it
    trailOpacity: 0, // strength of the ribbon (off: the lances are the travel)
    trailGlow: 1.21, // brightness of the ribbon
    trailCore: 0.8, // 0..1 how white the fresh middle of the ribbon runs
    trailBreakup: 1.25, // how hard the ribbon breaks up as it ages
    scarWidth: 0.7, // width of the scar on the floor, metres
    scarLife: 2.6, // seconds the scar takes to cool and go
    scarOpacity: 0.7, // strength of the scar
    scarGlow: 1.2, // brightness of its hot seam
    colorScarA: '#b02a6e',
    colorScarB: '#240414',
    wakeSpacing: 1.6, // metres between wake decals along the path (0 = none)
    wakeRadius: 0.9, // size of each wake decal, metres
    wakeLife: 1.6, // seconds each wake decal lingers
    wakeChips: 1.2, // fragments thrown at each wake

    /* --- 15 · the real lance (cast-local hero) --- */
    lanceLength: 4.6, // length of the lance, metres
    lanceGirth: 1.15, // thickness of the drill, × authored
    lanceHeight: 1.35, // height it flies at, metres
    lanceFlightPitch: 0.4, // radians the flying lances dip their tips
    lanceFlightYaw: 0.8, // radians the flying lances lean across the line, crabbed (decoy one way, real the other), so their length reads from behind
    lanceTwist: 2.5, // turns of the drill flutes along the blade
    lanceSpin: 26, // radians/second it drills about its length in flight
    lanceCloak: 0.45, // how much of the real lance shows while it is unseen (rim only)
    lanceReveal: 0.14, // seconds the cloak takes to burn off on the beat, × global lifetime
    lancePlantPitch: 0.95, // radians from level it is slammed in at
    lancePlantLean: 0.8, // 0 leaning back toward the caster .. 1 leaning out to the side (so its length reads from behind)
    lanceSlam: 0.16, // seconds the slam down takes, × global lifetime
    lancePlantDepth: 0.55, // metres the tip is buried on the slam
    lanceDrill: 0.7, // metres it drills down through the linger
    lanceDrillSpin: 14, // radians/second it drills at once planted (dies away)
    lanceDrillDecay: 1.4, // how fast the drilling slows, per second
    lanceExitAt: 0.62, // it dissolves from this share of the life after the beat
    lanceSpecular: 1.1, // sun glint on the lance
    lanceRimGlow: 0.12, // pink rim light
    lanceFluteGlow: 0.9, // glow along the flute ridges
    lanceHeat: 2.4, // white-hot burn front of the reveal
    colorLanceDeep: '#060208', // lance, deep
    colorLanceBody: '#231020', // lance body
    colorLanceTint: '#e0408e', // ridge / rim
    colorLanceHot: '#fff0f8', // white-hot
    plantCrack: 1.6, // radius of the cracked floor where it is driven in, metres
    plantChips: 24, // chips thrown when it is driven in
    plantDust: 14, // dust puffs when it is driven in
    plantShake: 0.3, // camera punch of the slam
    plantLight: 8, // light punch of the slam
    drillChips: 30, // chips per second sprayed while it drills
    drillSparks: 40, // sparks per second off the flutes while it drills
    exitMotes: 160, // glamour motes per second as it dissolves

    /* --- 16 · the decoy --- */
    decoyLate: 0.3, // how far the decoy lags the real cut (0 = level)
    decoyOpacity: 0.8, // how solid the decoy looks
    decoyScan: 26, // scanline bands along the decoy
    decoyStutter: 0.08, // metres the decoy's slices jitter
    decoyGlow: 0.85, // its pink edge
    shardCount: 22, // panes it shatters into (max 32)
    shardSize: 0.85, // pane size, metres
    shardSpeed: 4.2, // metres/second they burst out at
    shardLift: 3.2, // metres/second they are thrown up
    shardSpin: 9, // radians/second they tumble
    shardLife: 1.5, // seconds a pane lingers before it winks out, × global lifetime
    colorDecoyBody: '#2a0620', // decoy, body
    colorDecoyEdge: '#ff6cb8' // decoy, edge
  }
};
