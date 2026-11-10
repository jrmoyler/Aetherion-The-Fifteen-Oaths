/**
 * Strata Exchange — earth, zone cast. Data only, no imports.
 *
 * Terrain exchange, made literal: a strata-banded lodestone is lobbed onto the
 * target and *keys* two circles of ground — the target socket and a twin
 * socket beside it. Both plugs of earth are torn out whole (banded rock, a
 * torn root of rubble hanging under each), hang for a breath, then **trade
 * places**: one vaults high over the other while the other swings round
 * beneath it, and each slams down into the other's socket. Whatever stood on
 * a plug is knocked down and rides it across. The plugs grind a quarter turn
 * to lock, their strata seams cool, and they sink flush as the kerfs heal.
 *
 * Placement is derived: the twin socket sits `2 · zoneRadius + socketGap`
 * from the target along `exchangeBearing`, and both arcs are built from that
 * span, so every slider keeps both plugs landing exactly in the sockets.
 *
 * Every key below is a live editor control.
 */
export default {
  id: 'strataExchange',
  meta: {
    label: 'Strata Exchange',
    accent: '#e0a24c',
    element: 'earth',
    cast: 'zone',
    hint: 'Earth — two plugs of banded rock tear out of the floor and trade places, carrying whatever stood on them',
    glyph:
      '<path d="M8 74H40M60 74H92M12 74V62H36V74M64 74V62H88V74"/><path d="M24 54C24 22 76 22 76 54M76 54L70 46M76 54L83 47"/><path d="M76 86C76 96 24 96 24 86M24 86L31 92M24 86L18 93"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 18, // max cast distance (m)
    minRange: 3, // closer than this the cast is refused (m)
    speed: 15, // the lodestone flies to the target at (m/s)
    cooldown: 5,
    castAnim: 'cast3',
    zoneRadius: 1.9, // radius of each socket — the plug that is torn out (m)
    lifetime: 3.8, // nominal cast length, for the HUD (s)

    /* --- placement (derived — see the header) --- */
    socketGap: 0.6, // ground left between the two sockets (m)
    exchangeBearing: 0.35, // where the twin socket sits: 0 = beside the target, + toward the caster (rad)

    /* --- the beats (s, × global lifetime) --- */
    heaveTime: 0.4, // plugs tear out of the floor
    holdTime: 0.18, // plugs hang and shudder before the exchange
    swapTime: 0.9, // plugs trade places
    dropTime: 0.22, // plugs fall into the other sockets (the slam ends it)
    settleTime: 1.05, // plugs grind into place and the seams cool
    exitTime: 0.75, // plugs sink flush and the kerfs heal

    /* --- gameplay --- */
    seizeImpulse: 1.2, // the floor tearing out knocks bodies down: sideways (m/s)
    seizeLift: 6, // and up onto the rising plug (m/s)
    carryGrip: 0.35, // 0..1 how hard a carried body is held to its plug per frame
    carryBuoyancy: 0.85, // 0..1 how much of a carried body's weight the plug bears
    hitImpulse: 9, // the slam throws carried bodies out of the new socket (m/s, × explosion)
    hitLift: 5,
    hitSpin: 2.5,
    crushDamage: 1, // UCSM damage per seized or crushed enemy
    terrainIntensity: 1, // intensity of the two terrain-impact imprints at the slam

    /* --- light --- */
    lightColor: '#ffc46e',
    lightIntensity: 4.5,
    lightRadius: 10,
    keyLight: 5, // light punch when the lodestone keys the ground (× explosion)
    slamLight: 7, // light punch at the slam (× explosion)

    /* --- palette: the four-stop exchange ramp (seams, motes, kerf) --- */
    colorCore: '#fff3d6', // white-hot
    colorTint: '#f6c877', // pale gold
    colorBody: '#c26a26', // saturated ochre-rust
    colorDeep: '#26150b', // deep umber

    /* --- 1 · the plugs (lit rock, world layer) --- */
    plugFit: 0.94, // plug radius (× zoneRadius) — a little under the socket
    plugDepth: 2, // depth of the banded body (m); the torn root hangs a further 35 %
    heaveHeight: 3, // plug crown height while it hangs (m) — the root clears the floor
    heaveOvershoot: 0.12, // fraction the heave overshoots before it hangs
    shudder: 0.05, // tremor while it hangs (m)
    vaultHeight: 2.4, // the vaulting plug rises this much above the hang (m)
    swingWidth: 0.85, // the other plug swings out sideways (× half span)
    swapSpin: 1.6, // yaw each plug turns during the exchange (rad)
    swapBank: 0.35, // bank into the turn (rad)
    lockTwist: 0.5, // quarter-turn grind into the lock after the slam (rad)
    slamSink: 0.35, // the slam drives the plug this far below where it comes to rest (m)
    settleProud: 0.75, // the plug rests jammed this far proud of the floor — a stepped mesa (m)
    rockRoughness: 0.88,
    rockMetalness: 0.04,
    rockGrit: 1, // grain strength in the strata
    strataWarp: 1, // how much the bands wander (× noise)
    colorTurf: '#7b6a52', // the crown: the floor's own dusty top
    colorStrataA: '#b98a52', // sandstone band
    colorStrataB: '#8c4a2a', // iron-red band
    colorStrataC: '#3c3037', // slate band
    colorRoot: '#1d140e', // the torn root
    seamGlow: 2.4, // the light between bands (bloom picks up > 1)
    seamWidth: 1, // how open the seams are (× authored groove)
    seamCharge: 1.6, // extra seam light while the plugs are in the air

    /* --- 2 · the sockets (floor) --- */
    kerfGlow: 2.6, // the cut round each socket
    kerfWidth: 0.1, // (m)
    crackReach: 0.9, // radial cracks run out this far beyond the kerf (× radius)
    crackGlow: 1.1,
    pitShade: 1.1, // how dark the pit walls fall with depth
    pitSeams: 1, // glowing strata lines on the pit walls
    scribeTime: 0.85, // fraction of the travel the telegraph circles take to draw
    healTime: 0.7, // fraction of the exit spent closing the kerfs

    /* --- 3 · the lodestone (travel) --- */
    stoneSize: 0.55, // lodestone length (m)
    stoneArc: 0.22, // lob height (× distance)
    stoneSpin: 9, // tumble (rad/s)
    stoneGlow: 2, // its seams' light in flight

    /* --- 4 · the exchange arcs --- */
    arcGlow: 2.2,
    arcWidth: 0.07, // tube radius (m)
    arcFlow: 1.6, // energy runs along the arcs at (× swap)
    arcLead: 0.25, // arcs draw in this long before the swap (s)

    /* --- 5 · particles --- */
    gritRate: 70, // clods/s raining off each hanging root
    gritSize: 0.09,
    gritLife: 1.1,
    gritGravity: 14,
    colorGritA: '#a07a52',
    colorGritB: '#7a4e30',
    colorGritC: '#4a3022',
    colorGritD: '#1f140d',
    dustBurst: 26, // puffs thrown at the key and at the slam (per socket)
    dustSize: 0.9,
    dustLife: 1.7,
    dustRise: 0.5,
    dustOpacity: 0.6,
    colorDustA: '#c9b08a',
    colorDustB: '#957556',
    colorDustC: '#5c4636',
    colorDustD: '#2a1f17',
    moteRate: 60, // gold motes streaming along each arc (per s)
    moteSize: 0.06,
    moteLife: 0.7,
    moteGlow: 2.2,
    chipCount: 40, // rock chips at the key and at the slam (per socket)
    chipSize: 0.11,
    chipSpeed: 5.5,
    chipLife: 1.1,

    /* --- 6 · the beats' world response --- */
    keyShake: 0.12, // camera knock when the lodestone keys the ground (× explosion, × camera shake)
    slamShake: 0.28, // camera knock at the slam
    shakeDecay: 5,
    shakeFrequency: 16,
    keyFlash: 0.06,
    slamFlash: 0.1,
    burstReach: 1.25, // EARTH shell (× radius)
    burstIntensity: 0.9,
    burstLife: 0.6,
    burstOpacity: 0.65,
    decalLife: 2.4, // cracks and dust rings stay this long (s)
    crackIntensity: 1,
    dustRingIntensity: 0.8,
    colorBurstA: '#ffe2a8',
    colorBurstB: '#a8642e',
    colorBurstC: '#2e1c10',

    /* --- 7 · the lens --- */
    lensStrength: 0.7, // ground-pressure ring at the key and slam (× global distortion)
    lensTime: 0.5, // the ring runs out over (s)
  },
};
