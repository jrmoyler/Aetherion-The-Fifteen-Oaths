/**
 * False Floor — illusion — a floor that inhales, then a column.
 *
 * Illusion — the floor agrees to be solid, then drops the circle.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle. Dragging any field re-shapes
 * a cast that is already in the air.
 */
export default {
  id: 'falsefloor',
  meta: {
    label: 'False Floor',
    accent: '#ffd6ef',
    key: '',
    element: 'illusion',
    hint: 'Illusion — the floor agrees to be solid, then drops the circle',
    cast: 'zone',
    glyph: '<circle cx="50" cy="54" r="22"/><path d="M50 54V18"/><path d="M40 28L50 16L60 28"/><path d="M66 72Q78 60 90 72Q78 84 66 72Z"/><circle cx="78" cy="72" r="3"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 24, // metres/second the front travels
    lifetime: 1.8, // seconds the cast is held before it is released
    cooldown: 0.55, // seconds before it can be armed again
    castAnim: 'cast1', // which clip the body throws
    impactTime: 1.05, // impact phase length, × global lifetime
    fadeTime: 1.25, // fade phase length, × global lifetime
    zoneRadius: 4.2, // circle radius for zone casts, metres

    /* --- light --- */
    lightColor: '#9a5a8e',
    lightIntensity: 3.5, // the glow riding the cast
    lightRadius: 11,
    lightFlicker: 0.6, // 0..1 how much it shimmers
    impactLight: 5, // extra light on the beat, decays on its own

    /* --- 0 · the hand --- */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    handFlare: 0.22, // size of the flare round the fist as the cast leaves it, metres
    handSparks: 24.2, // sparks thrown off the hand at release
    handMotes: 12, // motes left hanging at the hand

    /* --- 1 · the body --- */
    spinSpeed: 1.54, // radians/second the body turns
    thickness: 0.22, // width of a single body part, metres
    count: 6, // parts in the body (max 12)
    height: 2.6, // how tall the body stands, metres
    sweep: 1.1, // lateral reach, metres
    lean: 0.45, // how far the body opens on the beat
    bodyOpacity: 0, // the template dome; off — the flagstones are the body now
    edgeGlow: 0.97,
    softFade: 0.4, // soft intersection with the floor and bodies, metres
    bodyGlow: 0.35,
    bodyPulse: 0.12, // breathing in brightness, 0..1
    bodyPulseRate: 4, // breaths per second (radians)
    colorA: '#f25fc6',
    colorB: '#fff6fb',
    colorC: '#5c0a43',
    lensWarp: 0, // strength of the distortion it writes (off with the dome)

    /* --- 2 · the voice --- */
    voiceOpacity: 0, // strength of the second placement (off)
    colorVoiceA: '#f25fc6',
    colorVoiceB: '#fff6fb',

    /* --- 3 · the ground --- */
    groundWidth: 9, // footprint width, metres
    groundGlow: 1.4,
    groundLife: 4.5, // seconds the residue decal stays on the floor after the beat, × global lifetime
    groundOpacity: 0, // strength of the template field (off: the flagstones and the pit replace it)
    groundLand: 0.32, // seconds the field takes to land out to the rim after the beat
    groundHeat: 1.5, // how hot the fresh field and its landing lip glow, cooling through the fade
    groundCoat: 0.25, // 0 dark stain/scorch .. 1 pale coat (rime, glare, scoured sand)
    groundTelegraph: 0.32, // how strongly the footprint shows before the beat
    groundStain: 0.7, // strength of the residue decal left at the beat
    groundStainReach: 1.05, // residue radius, × the circle (zone) or × the ground width (line)
    colorGroundA: '#5a2350',
    colorGroundB: '#5c0a43',
    colorGroundStain: '#120a14', // the dark tone the floor is stained toward

    /* --- 4 · detail pieces --- */
    detailCount: 0, // pieces thrown (max 48); off — the slabs are the pieces
    detailSize: 0.6, // mean piece size, metres
    detailSizeJitter: 0.35, // ± fraction of that
    detailSpread: 0.8, // reach of the pieces, × the cast reach
    detailLift: 3.2, // how high the pieces climb, metres
    detailSpin: 1, // how fast the pieces orbit, × body spin
    detailGlow: 1.32, // rim light on the pieces
    detailOpacity: 0.85, // how solid the pieces are
    detailSwing: 1, // how far each piece folds its parts, × authored swing
    detailEdge: 1, // light along the piece arrises
    detailDeep: 0.7, // 0..1 how far the pieces fall from body to deep tone across their form
    colorDetailA: '#ffd6ef',
    colorDetailB: '#f25fc6',
    colorDetailC: '#5c0a43',

    /* --- 5 · hero rig --- */
    heroSize: 2, // scale of the hero rig, metres per authored unit
    heroReach: 0.7, // ring rigs: share of the circle radius they span
    heroLift: 1.5, // how far the rig rises, drops or arcs, metres
    heroSpin: 0.5, // how fast the rig turns, × body spin
    heroSwing: 1, // how far the rig folds its parts, × authored swing
    heroGlow: 1.21, // rim light on the rig
    heroEdge: 1.2, // light along the rig arrises
    heroOpacity: 0, // how solid the template rig is (off)
    heroDeep: 0.75, // 0..1 how far the rig falls from body to deep tone across its form (colour depth)
    heroMaxHeight: 5, // the rig is scaled and lowered to keep its top under this, metres
    heroFit: 0.72, // mass rigs grow to at least this share of the circle radius (heroSize is the floor)
    colorHeroA: '#ffd6ef',
    colorHeroB: '#f25fc6',
    colorHeroC: '#5c0a43',

    /* --- 6 · shed --- */
    dustRate: 30, // puffs per second
    dustSize: 0.22,
    dustSpeed: 3.5,
    dustLife: 0.8,
    dustOpacity: 0.55,
    colorDustA: '#2b2a36',
    colorDustB: '#1e1a26',
    colorDustC: '#140e1a',
    colorDustD: '#0c0a10',
    streakRate: 20, // sparks per second
    streakSize: 0.045,
    streakSpeed: 8,
    streakLife: 0.35,
    streakStretch: 1.4,
    colorStreakA: '#fff6fb',
    colorStreakB: '#ffd6ef',
    colorStreakC: '#f25fc6',
    colorStreakD: '#f25fc6',
    chipRate: 6, // fragments per second
    chipSize: 0.08,
    chipSpeed: 6,
    chipLife: 0.7,
    colorChipA: '#3a3f50',
    colorChipB: '#2b3040',
    colorChipC: '#1a1d28',
    colorChipD: '#0e0f16',

    /* --- 7 · motes --- */
    moteRate: 26, // motes per second off the pieces
    moteSize: 0.06,
    moteSpeed: 1.6, // metres/second they drift at
    moteLife: 1.1,
    colorMoteA: '#fff6fb',
    colorMoteB: '#ffd6ef',
    colorMoteC: '#f25fc6',
    colorMoteD: '#2a0a20',

    /* --- 8 · the beat --- */
    impactShake: 0.33, // camera punch on the beat
    impactFlash: 0.04, // screen flash on the beat (kept low)
    colorFlash: '#ffd6ef',
    burstRadius: 3.2, // burst size, metres
    burstLife: 0.7,
    burstOpacity: 0, // strength of the burst shell; matter keeps it low and hits with debris instead
    impactChips: 3, // fragments thrown up and out on the beat
    impactDust: 3, // dust puffs rolled out along the floor on the beat
    colorBurstA: '#fff6fb',
    colorBurstB: '#f25fc6',
    colorBurstC: '#5c0a43',
    shockRadius: 6.5, // decal size, metres
    shockLife: 0.85,
    shockRing: 0.08, // strength of the thin shock ring on the beat (0 = none)
    colorShockA: '#f25fc6',
    colorShockB: '#fff6fb',

    /* --- 9 · the aftershock --- */
    aftershockAt: 1.06, // fade progress the aftershock lands at (1 = fade start)
    aftershockRadius: 5, // aftershock ring size, metres
    aftershockShake: 0.13, // camera punch of the aftershock
    aftershockLight: 7.7, // light punch of the aftershock
    aftershockLife: 0.9, // seconds the aftershock ring lingers

    /* --- 10 · bodies --- */
    hitRadius: 4.4, // reach of the blow, metres
    hitImpulse: 6, // how hard bodies are thrown
    hitLift: 9, // how high they are thrown
    hitSpin: 2.4, // how fast they tumble

    /* --- 11 · the mark --- */
    markAmount: 0.6, // 0..1 how far a felled body is stained
    markTime: 0.3, // seconds the stain takes to set in
    markLife: 2.2, // seconds a marked body keeps shedding motes, × global lifetime
    markMotes: 18, // motes per second off a freshly marked body
    colorMarkBody: '#3a1a34', // what the body is stained toward
    colorMarkRim: '#f25fc6',
    markRimGlow: 1.76, // rim light on a marked body
    colorMarkEdge: '#ffd6ef',
    markEdgeGlow: 2.86, // brightness of the marked edge
    markEdgeWidth: 0.05, // width of the marked edge

    /* --- 14 · the false floor (the cast's own hero) --- */
    tileSize: 0.9, // flagstone pitch, metres
    tileFill: 0.97, // share of the pitch a slab covers (the rest is seam)
    tileRaise: 0.03, // how proud of the real floor the slabs stand, metres
    tileAssembleFrom: 0.35, // travel share at which the circle starts paving itself
    tileAssembleSweep: 0.45, // travel share the paving takes from the near edge to the far edge
    tileAssembleTime: 0.18, // travel share one slab takes to rise into place
    tileStrain: 0.7, // how hard the seams flicker as the front closes in (the lie wearing thin)
    tileSeam: 0.3, // seam light while the floor holds
    tileGlow: 0.6, // brightness of seams and moving slabs
    tileSheen: 0.25, // the sheen sweeping the tops
    tileRough: 0.82,
    colorTile: '#2b3040', // the slate albedo (the deep that carries the mass)
    dropDelay: 0, // seconds after the commit the first slab drops
    dropStagger: 0.18, // seconds from the centre slab to the rim slabs
    dropKick: 3, // downward speed a slab starts with, metres/second
    dropGravity: 22, // how hard they fall, metres/second², × explosion intensity
    dropTumble: 3.5, // radians/second a slab tumbles as it falls
    dropInward: 0.6, // metres/second the slabs drift toward the centre as they go
    dropChips: 60, // stone chips off the falling slabs
    rimCrack: 1.1, // each crack torn round the rim, metres
    rimTears: 8, // cracks torn round the rim
    reformFrom: 1.3, // fade clock (1 = fade start, 2 = end) the floor starts to reform at
    reformStagger: 0.25, // fade-clock span from the rim slabs to the centre ones
    reformTime: 0.2, // fade-clock span one slab takes to rise back into place
    reformDepth: 1.4, // how far below the floor a slab rises from, metres
    settleFrom: 1.82, // fade clock the reformed slabs sink into the real floor from

    /* --- 15 · the pit --- */
    pitDepth: 4, // depth of the shaft under the circle, metres
    pitOpacity: 1, // strength of the pit
    pitGlow: 0.9, // brightness of its seams and lip
    pitFall: 1.6, // metres/second the wall slides up past the eye
    pitMotes: 40, // haze motes per second rising out of it
    colorPitDeep: '#07040b', // the near-black of the shaft
    colorPitSeam: '#8a3a6e', // the dusty rose in its mortar, bands and lip
    colorPitHaze: '#2a0c26', // the haze at the bottom

    /* --- 16 · the wave --- */
    pathTile: 0.85, // flagstone size in the travelling wave, metres
    pathStart: 3, // metres past the hand the wave surfaces (clear of the caster)
    pathSpacing: 0.95, // metres between them along the line
    pathWave: 3, // length of the wave behind the front, metres
    pathLift: 0.22 // how high a slab heaves, metres
  }
};
