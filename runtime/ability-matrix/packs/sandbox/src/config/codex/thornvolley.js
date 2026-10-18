/**
 * Thorn Volley — Nature — a fan of great thorns is drawn over the caster's
 * shoulders, loosed in a ripple on high arcs, and driven into the floor round
 * the target, pinning whoever they come down by.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * A thorn holds only dice until it strikes. Its fan slot, its mark and its arc
 * are resolved by `ThornVolleyAbility` every frame from the values below, so
 * dragging `clusterWidth` or `arcHeight` re-aims a volley already in the air.
 */
export default {
  id: 'thornvolley',
  meta: {
    label: 'Thorn Volley',
    accent: '#b6f29a',
    key: '',
    element: 'nature',
    hint: 'Nature — a fan of great thorns arcs down the line and drives into the floor, pinning whoever they land by',
    cast: 'line',
    glyph: `<path d="M12 70C30 30 60 18 88 22"/><path d="M14 84C36 52 62 44 88 44"/><path d="M88 22L80 16M88 22L82 30"/><path d="M88 44L80 38M88 44L80 50"/><path d="M40 36L36 30M58 26L56 20M44 56L40 50M64 48L62 42"/><path d="M8 94H92"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // metres/second each thorn flies along its arc
    lifetime: 1.6, // seconds the thorns stand after the last one strikes
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#f3ffe8',
    lightIntensity: 5, // rides the lead thorn, then sits over the landings
    lightRadius: 9,
    lightHeight: 1.2, // metres over the landings once they have struck

    /* ================================================================ */
    /* 1 · THE DRAW                                                      */
    /* ================================================================ */
    count: 7, // thorns in the volley
    drawTime: 0.4, // seconds before the first is loosed
    drawStagger: 0.035, // seconds between thorns appearing in the fan
    materialize: 0.22, // seconds one takes to grow out of the air
    fanForward: -0.35, // metres in front of the caster the fan hangs (negative: behind)
    fanWidth: 1.5, // half-width of the fan, metres
    fanHeight: 2.0, // metres over the floor at its ends
    fanArc: 0.7, // metres higher in its middle
    hover: 0.06, // metres each thorn bobs while it waits
    hoverRate: 7, // radians/second
    drawBack: 0.35, // metres it is drawn back the instant before it goes
    drawMotes: 40, // green motes per second gathering into each drawn thorn

    /* ================================================================ */
    /* 2 · THE VOLLEY                                                    */
    /* ================================================================ */
    stagger: 0.065, // seconds between thorns being loosed
    staggerJitter: 0.04,
    arcHeight: 3.0, // metres the arc climbs (scaled with distance)
    spinRate: 9, // radians/second each thorn rolls in flight
    clusterWidth: 2.2, // metres either side of the line the thorns come down
    clusterDepth: 2.4, // metres along the line the cluster spreads
    embedDepth: 0.45, // metres the point drives in under the floor
    trailRate: 70, // sap sparks per second off each flying thorn
    trailLife: 0.45,
    scrapShare: 0.25, // share of the trail that is torn leaf
    travelRumble: 0.04,

    /* ================================================================ */
    /* 3 · THE THORN                                                     */
    /* ================================================================ */
    thornLength: 1.7, // metres
    thornWidth: 1.5, // girth, × the base mesh
    thornSpecular: 0.7,
    thornGloss: 55,
    thornRim: 0.9,
    sapGlow: 3.2, // the sap vein (bloom > 1)
    sapTurns: 1.6,
    sapWidth: 0.16,
    flyGlow: 1.4, // glow while drawn and flying
    restGlow: 0.45, // glow once it is stuck
    colorHeartwood: '#2a120a',
    colorBark: '#6e2a1a',
    colorPoint: '#efe4c8',
    colorVane: '#5aa83a',
    colorSap: '#b6f29a',

    /* ================================================================ */
    /* 4 · THE STRIKE                                                    */
    /* ================================================================ */
    quiver: 0.22, // how far it shudders where it stands
    quiverRate: 7, // Hz
    quiverDamp: 4,
    strikeChips: 18,
    strikeSparks: 22,
    strikeDust: 5,
    crackRadius: 0.9, // metres
    dustRingRadius: 1.2, // metres
    strikeShake: 0.14,
    strikeShakeTime: 0.25,
    strikeLight: 1.2, // light punch per strike, × lightIntensity
    lastFlash: 0.2, // flash when the last one strikes
    lastBurst: 2.2, // thin AIR shell at the last strike, metres
    strikeWarp: 0.9, // lens ring strength
    warpRadius: 1.8, // metres it runs out to
    warpWidth: 0.1, // its width, × that reach
    warpTime: 0.45, // seconds
    colorFlash: '#eaffd8',

    /* ================================================================ */
    /* 5 · THE ROOT WEB                                                  */
    /* ================================================================ */
    rootReach: 2.2, // metres the roots crawl from each thorn
    rootSpeed: 4, // metres/second
    rootCount: 6, // roots per thorn
    rootWidth: 0.09,
    rootGlow: 2.4,
    stainOpacity: 0.65, // the churned stain round each landing
    colorRoot: '#4a8a2a',
    colorStain: '#1a1209',

    /* ================================================================ */
    /* 6 · THE SPLINTER                                                  */
    /* ================================================================ */
    splinterTime: 0.6, // seconds one thorn takes to break up
    splinterStagger: 0.5, // seconds the breaking spreads over
    splinterEdge: 0.08,
    splinterGlow: 3.5,
    splinterChips: 20,
    colorBreak: '#d6ff9a',

    /* ================================================================ */
    /* 7 · PARTICLES                                                     */
    /* ================================================================ */
    sparkSpeed: 9,
    sparkSize: 0.04,
    sparkLife: 0.5,
    sparkStretch: 0.25,
    sparkGravity: 4,
    sparkGlow: 3,
    colorSparkA: '#f8ffe0',
    colorSparkB: '#d6ff9a',
    colorSparkC: '#7ad64a',
    colorSparkD: '#2a6a1a',
    moteSize: 0.05,
    moteLife: 0.6,
    moteGlow: 2.6,
    scrapSize: 0.11,
    scrapLife: 1.4,
    colorScrapA: '#c6f58a',
    colorScrapB: '#7ac44a',
    colorScrapC: '#3e7a2a',
    colorScrapD: '#22401a',
    chipSpeed: 6,
    chipSize: 0.08,
    chipLife: 1,
    colorChipA: '#7a5c3c',
    colorChipB: '#54402a',
    colorChipC: '#33261a',
    colorChipD: '#1a130c',
    dustSpeed: 1.2,
    dustSize: 0.6,
    dustLife: 1.4,
    dustOpacity: 0.35,
    colorDustA: '#8a7458',
    colorDustB: '#5e4e3a',
    colorDustC: '#3a3024',
    colorDustD: '#201a14',

    /* ================================================================ */
    /* 8 · PINNED                                                        */
    /* ================================================================ */
    pinRadius: 1.15, // metres from a landing a body is caught
    hitImpulse: 3.5, // m/s, along the thorn's flight
    hitLift: 1.2, // m/s
    hitSpin: 1,
    pinAlong: 0.62, // where on the shaft the body is held, share of its length from the point
    pinStiffness: 0.85, // 1 a hard hold, less a leash
    pinJoint: 'Spine1' // the joint held to the shaft
  }
};
