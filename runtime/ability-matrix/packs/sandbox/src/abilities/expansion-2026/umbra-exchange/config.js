/**
 * Umbra Exchange — shadow, zone cast. Data only, no imports.
 *
 * An anchored shadow position swap. An obsidian ship's anchor is drawn out of
 * the caster's own shadow, hurled on a chain of shade and driven flukes-first
 * into the floor. Its chains hook every enemy within reach; each one sinks
 * into its own shadow, its umbra crawls across the floor *through the anchor*,
 * and it rises at its mirror point on the far side — the anchor turning half
 * a revolution as it trades every body for its own shadow. Whoever surfaces is
 * struck by the shadow they were swapped with.
 *
 * Every key below is a live editor control. Gameplay keys (range, reach,
 * timings, force) are read on the frame they are used; the craft keys are
 * read every frame. Timings are seconds on the unscaled staging clock and
 * are multiplied by `settings.global.lifetime`.
 */
export default {
  id: 'umbraExchange',
  meta: {
    label: 'Umbra Exchange',
    accent: '#a77cff',
    element: 'shadow',
    cast: 'zone',
    hint: 'Shadow — an obsidian anchor plunges in; every foe in reach is dragged through its shadow and surfaces on the far side',
    glyph:
      '<circle cx="50" cy="14" r="7"/><path d="M50 21V86M36 32H64M18 58C20 78 36 88 50 88C64 88 80 78 82 58M18 58L11 66M18 58L26 64M82 58L89 66M82 58L74 64"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 16, // furthest the anchor can be thrown (m)
    minRange: 3,
    speed: 24, // the anchor flies at (m/s)
    cooldown: 6,
    castAnim: 'cast2',
    zoneRadius: 4.4, // the anchor's reach: enemies inside are exchanged (m)
    lifetime: 4, // nominal screen time, for the HUD (s)

    /* --- the exchange (gameplay) --- */
    maxTargets: 4, // most enemies one anchor exchanges (≤ 6)
    chargeTime: 0.34, // the anchor is drawn out of the caster's shadow (s)
    hookDelay: 0.22, // after the plunge, the chains reach their hosts (s)
    sinkTime: 0.42, // hooked enemies sink into their own shadow (s)
    crawlTime: 0.62, // the umbra crawls through the anchor to the mirror point (s)
    riseTime: 0.34, // and the body surfaces there; struck when it is out (s)
    holdTime: 0.75, // the anchor hums in its pool before it is drawn under (s)
    fade: 0.8, // exit: the anchor sinks and the pool drains (s)
    sinkDepth: 2.3, // how far under the floor a body is drawn (m)
    damage: 1, // per exchanged enemy, through the combat binding
    hitImpulse: 7, // thrown away from the anchor on arrival (× explosion intensity)
    hitLift: 5,
    hitSpin: 2.2,

    /* --- light --- */
    lightColor: '#9c6cff',
    lightIntensity: 4.2,
    lightRadius: 10,
    plungeLight: 6, // light punch at the plunge (× explosion intensity)
    arrivalLight: 3, // and at each surfacing

    /* --- palette: white-violet core → lilac → umbral violet → deep --- */
    coreColor: '#f4ecff',
    tintColor: '#b892ff',
    bodyColor: '#5a2bb0',
    deepColor: '#0a0614',
    voidColor: '#030107', // the darkness the pool and the umbrae are made of

    /* --- 1 · the anchor (lit obsidian) --- */
    anchorHeight: 0.85, // anchor height (× zoneRadius)
    anchorBury: 0.16, // how deep the crown bites into the floor (× anchor height)
    handScale: 0.32, // its size while held at the hand (× full size)
    handHeight: 1.45, // where it forms, above the caster's feet (m)
    arcHeight: 2.4, // peak of the throw above the line (m)
    tumble: 1.25, // turns it makes in flight
    plungeDepth: 0.55, // it overshoots this deep, then rebounds (× bury)
    turnAngle: 180, // degrees it turns during the exchange
    obsidianColor: '#120c1c',
    obsidianMetalness: 0.35,
    obsidianRoughness: 0.16,
    veinGlow: 2.2, // the violet veins in the obsidian
    veinScale: 3.2, // vein noise frequency
    rimGlow: 1.4, // fresnel sheen on the vein shell
    humRate: 2.6, // the veins pulse during the linger (Hz)

    /* --- 2 · the chains --- */
    chainWidth: 0.075, // link thickness (m)
    chainLinks: 9, // links per metre
    chainSag: 0.6, // slack while paying out (m)
    chainWhip: 0.45, // lateral whip as a chain strikes (m)
    chainGlow: 1.6,
    chainOpacity: 0.95,
    floorChains: 3, // spare chains that bite the floor when nobody is in reach
    floorChainReach: 0.7, // where they bite (× zoneRadius)
    tetherRetract: 0.3, // the throw's tether reels back after the plunge (s)

    /* --- 3 · the pool (floor) --- */
    poolScale: 1.12, // pool radius (× zoneRadius)
    poolSpread: 0.35, // the pool runs out over (s)
    poolDarkness: 0.86, // how much light it eats (0..1)
    crackGlow: 1.4, // violet fissures radiating from the anchor
    crackCount: 9, // fissure spokes
    puddleSize: 0.9, // shadow puddle under a hooked body (m)
    umbraSize: 0.75, // the crawling umbra (m)
    poolSwirl: 0.6, // inward churn of the darkness
    poolDissolve: 0.85, // fraction of the exit spent draining

    /* --- 4 · the gates (umbral sheaths where bodies sink and rise) --- */
    gateHeight: 2.4, // (m)
    gateRadius: 0.62, // (m)
    gateTwist: 2.2, // tendril twist
    gateGlow: 0.9,
    gateLife: 0.5, // a gate dies away after its body has passed (s)

    /* --- 5 · particles --- */
    smokeRate: 26, // umbral smoke per second off the pool
    smokeSize: 0.55,
    smokeLife: 1.5,
    smokeSpeed: 0.7,
    gatherCount: 3, // motes drawn into the hand per frame of the charge
    moteSize: 0.09,
    moteLife: 0.55,
    plungeShards: 56, // obsidian chips thrown at the plunge
    shardSize: 0.13,
    shardSpeed: 6,
    shardLife: 1.1,
    arrivalShards: 18, // and at each surfacing
    sparkGlow: 1.4,
    colorSmokeA: '#2a1846',
    colorSmokeB: '#140b24',
    colorSmokeC: '#07040d',
    colorSmokeD: '#020104',
    colorMoteA: '#f4ecff',
    colorMoteB: '#c4a2ff',
    colorMoteC: '#6a35c9',
    colorMoteD: '#160a2c',

    /* --- 6 · the plunge (impact) --- */
    burstReach: 0.8, // dark shell grows to (× zoneRadius)
    burstIntensity: 0.9,
    burstLife: 0.6,
    burstOpacity: 0.75,
    burstFresnel: 2.4,
    burstSquash: 0.45,
    decalLife: 2.6,
    crackDecal: 1.1, // CRACK decal size (× zoneRadius)
    scorchDecal: 0.8, // SCORCH decal size (× zoneRadius)
    shockwaveWidth: 0.08,
    shockwaveIntensity: 1,
    impactShake: 0.32, // (× explosion intensity, × camera shake)
    shakeDecay: 6.5,
    shakeFrequency: 16,
    impactFlash: 0.16, // (× explosion intensity)
    arrivalShake: 0.12, // knock at each surfacing

    /* --- 7 · the lens --- */
    lensStrength: 0.45, // the world bends round the anchor during the exchange (× global distortion)
    lensShock: 1.1, // pressure ring at the plunge
  },
};
