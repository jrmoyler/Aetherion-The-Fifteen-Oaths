/**
 * Vector Chakram — Projectile — a toothed disc ricochets through three banks, then flies home.
 *
 * Ability Atlas data block, rebuilt for the sandbox engine. Plain data, no
 * imports, so `settings.js` can pull it in without a cycle.
 */
export default {
  id: 'chakram',
  meta: {
    label: "Vector Chakram",
    accent: '#ffdf79',
    key: '',
    hint: "Projectile — a toothed disc ricochets through three banks, cutting what it hits, then curves home to the hand",
    cast: 'line',
    glyph: `<circle cx="34" cy="62" r="12"/><path d="M34 46V42M34 82V78M18 62H14M54 62H50"/><path d="M44 52L66 24L86 50L62 80"/><path d="M62 80Q30 96 22 74" stroke-dasharray="3 4"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18.0, // maximum cast distance, metres
    minRange: 3.0, // closer than this and the cast is refused
    speed: 26.0, // outbound flight speed, metres/second
    returnSpeed: 22.0, // recovery-arc flight speed, metres/second
    lifetime: 0.18, // seconds the catch flash holds
    fadeTime: 0.45, // seconds the trail takes to die after the catch
    catchHold: 0.7, // seconds the caught disc keeps spinning down in the hand before it is stowed
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws
    windupTime: 0.16, // seconds the disc spins up in the hand before it flies

    /* --- where it leaves and is caught --- */
    handForward: 0.9, // metres in front of the caster
    handSide: 0.45, // metres to the caster's right
    handHeight: 1.6, // metres off the floor (the blade is big: held high)
    flightHeight: 1.25, // cruising height between banks, metres

    /* ================================================================ */
    /* THE FLIGHT                                                        */
    /* ================================================================ */
    bankCount: 3, // ricochets before it turns for home (capped at 3)
    seekRange: 8.0, // a bank prefers a live body this close to the disc, metres
    seekAhead: 1.0, // ...that is no further back along the aim than this, metres
    zigWidth: 2.6, // with no body: how far each bank swings off the line, metres
    zigStart: 0.4, // first fallback bank, × cast length
    bankHeight: 0.55, // where on a body a bank strikes, × dummy height
    hitRadius: 0.75, // the disc kills any body this close to it in flight, metres
    returnBow: 0.55, // sideways swing of the recovery arc, × its chord
    returnLift: 1.6, // height of the recovery arc above a straight line, metres
    bankPause: 0.03, // seconds the disc bites on a bank before it leaves
    slice: 1.0, // 0..1 chance a cut body comes apart in two
    /** How a struck body flies. Same shape as `settings.dummies.hit`. */
    hit: { impulse: 7.0, lift: 3.2, spin: 1.8 },

    /* ================================================================ */
    /* 1 · DISC — the toothed blade                                       */
    /* ================================================================ */
    discRadius: 0.8, // outer radius at the tooth roots, metres (≈ 2.2 m across the tips)
    teeth: 6, // teeth round the rim
    innerRadius: 0.4, // open hub, × radius
    toothDepth: 0.34, // how far a tooth stands proud, × radius
    toothSharp: 3.0, // >1 hardens the hook behind each tooth
    thickness: 0.09, // blade thickness at the hub, × radius
    bladeBevel: 0.38, // the bevelled knife edge, × radius
    spinRate: 2.6, // turns per second in flight (slow enough that the teeth read)
    tilt: 0.32, // bank angle into each leg, radians
    wobble: 0.12, // wobble on the recovery arc, radians
    metalColor: '#c9b384',
    metalDark: '#1a140c',
    roughness: 0.32, // 0 = mirror
    envIntensity: 1.2, // reflection of the sky probe
    brushed: 0.55, // radial brushed streaks
    rimEnergy: 2.4, // energy on the cutting edge
    rimWidth: 0.09, // how much of the rim glows, 0..1 of the radius
    channelEnergy: 2.0, // the energy groove round the hub
    channelSpeed: 3.0, // how fast energy runs round the groove
    tipHeat: 2.6, // hot tooth tips
    hitFlare: 2.0, // the whole blade flares on every bank
    fresnel: 1.4,
    colorEnergy: '#ffdf79',
    colorEnergyHot: '#fffbe8',

    /* ================================================================ */
    /* 2 · SMEAR + TRAIL                                                 */
    /* ================================================================ */
    smearScale: 1.1, // smear disc, × blade size
    smearStrength: 0.8, // spin-blur brightness
    smearStreaks: 12, // angular streaks in the spin blur
    smearOpacity: 0.28,
    trailLife: 0.75, // seconds a point of the trail lasts
    trailWidth: 0.55, // half-width at the disc, metres
    trailCore: 0.18, // hot core, × width
    trailIntensity: 2.6,
    trailOpacity: 0.9,
    trailStreaks: 8, // speed lines along the ribbon
    trailTwist: 0.0, // 0..1 how much the ribbon narrows into a blade-edge line
    colorTrailHead: '#fff3c4',
    colorTrailTail: '#ff9a3c',
    colorTrailEdge: '#7a3cff',

    /* ================================================================ */
    /* 3 · BANK SIGILS                                                   */
    /* ================================================================ */
    sigilSize: 1.2, // half-size, metres
    sigilLife: 2.4, // seconds a mark stays
    sigilBurn: 0.12, // seconds it takes to burn in
    sigilLine: 0.035, // line width
    sigilIntensity: 2.6,
    sigilCool: 0.55, // seconds the white-hot edge takes to cool to colour
    colorSigil: '#ffcf5a',
    colorSigilHot: '#ffffff',
    colorSigilChar: '#3a2410',
    scorchRadius: 0.75, // SCORCH decal under each bank, metres
    scorchLife: 2.2,

    /* --- 3b · the floor path --- */
    pathStep: 0.3, // metres of flight between samples of the scored path
    pathLife: 2.8, // seconds the path stays before it has eroded
    pathWidth: 0.42, // half-width of the scored line, metres
    pathCool: 0.25, // share of its life the cut takes to cool from white to gold
    pathIntensity: 1.8,
    pathOpacity: 0.85,
    pathNicks: 1.2, // tooth nicks per metre along the cut
    pathHighFade: 1.6, // above 1.4 m the mark fades over this many metres (the return arc)

    /* ================================================================ */
    /* 4 · SPARKS, SHARDS, MOTES                                         */
    /* ================================================================ */
    sparkCount: 70, // per bank
    sparkSpeed: 12.0,
    sparkSize: 0.04,
    sparkLife: 0.38,
    sparkGravity: -14.0,
    sparkDrag: 1.2,
    sparkStretch: 0.14,
    sparkGlow: 2.8,
    colorSparkA: '#ffffff',
    colorSparkB: '#ffe28a',
    colorSparkC: '#ff8a2a',
    colorSparkD: '#4a1a08',
    shardCount: 14, // metal chips knocked off each bank
    shardSize: 0.07,
    shardSpeed: 6.0,
    shardLife: 0.9,
    moteRate: 90, // shed off the disc in flight, per second
    moteSize: 0.12,
    moteLife: 0.5,
    moteGlow: 1.6,
    colorMoteA: '#fff6d6',
    colorMoteB: '#ffd36a',
    colorMoteC: '#ff8f3a',
    colorMoteD: '#301030',

    /* ================================================================ */
    /* 5 · IMPACT + CATCH                                                */
    /* ================================================================ */
    bankBurst: 0.7, // AIR shell on each bank, metres
    bankBurstLife: 0.2,
    bankBurstOpacity: 0.22, // kept faint: the blade and the floor carry the bank
    shockRadius: 1.8, // SHOCKWAVE under each bank, metres
    catchBurst: 0.6, // AIR shell at the hand on the catch, metres
    catchSparks: 30,
    colorBurstA: '#fffbe8',
    colorBurstB: '#ffd36a',
    colorBurstC: '#ff7a2a',
    colorShockA: '#ffcf5a',
    colorShockB: '#ffffff',

    /* ================================================================ */
    /* 6 · WAKE WARP                                                     */
    /* ================================================================ */
    warpSize: 1.7, // half-size of the warp round the disc, metres
    warpStrength: 0.5,
    warpScale: 3.0,
    warpSpeed: 4.0,

    /* ================================================================ */
    /* 7 · LIGHT & FEEDBACK                                              */
    /* ================================================================ */
    lightColor: '#ffdf79',
    lightIntensity: 5,
    lightRadius: 8,
    bankLight: 16, // light punch per bank
    catchLight: 8, // light punch on the catch
    bankShake: 0.16,
    bankFlash: 0.1,
    catchShake: 0.06,
    catchFlash: 0.06,
    throwShake: 0.05,
    colorFlash: '#ffe7a8'
  }
};
