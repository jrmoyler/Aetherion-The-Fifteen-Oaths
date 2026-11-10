/**
 * Arc Relay — Chain — a branching lightning network that overloads each relay, then discharges the lattice.
 *
 * Ability Atlas data block, rebuilt for the sandbox engine. Plain data, no
 * imports, so `settings.js` can pull it in without a cycle.
 */
export default {
  id: 'relay',
  meta: {
    label: "Arc Relay",
    accent: '#82e9ff',
    key: '',
    hint: "Chain — the bolt turns every body it reaches into a relay, branches the lattice outward, then discharges it all at once",
    cast: 'line',
    glyph: `<circle cx="22" cy="72" r="6"/><circle cx="50" cy="30" r="6"/><circle cx="78" cy="66" r="6"/><circle cx="50" cy="30" r="12" stroke-dasharray="3 4"/><path d="M27 66L45 36M55 34L74 60M28 72H72"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18.0, // maximum cast distance, metres
    minRange: 3.0, // closer than this and the cast is refused
    speed: 30.0, // how fast the seeking leader runs down the line, metres/second
    lifetime: 1.1, // seconds the snapped lattice lingers after the discharge
    fadeTime: 0.6, // seconds the last of it takes to go out
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- where the feed line leaves the caster --- */
    handForward: 0.5, // metres in front of the caster
    handSide: 0.22, // metres to the caster's right
    handHeight: 1.35, // metres off the floor
    leaderHeight: 1.05, // height of the seeking head, metres

    /* ================================================================ */
    /* THE NETWORK                                                       */
    /* ================================================================ */
    captureRadius: 1.7, // a body this close to the seeking head becomes the first relay, metres
    linkRange: 7.0, // how far a relay can reach to claim the next body, metres
    maxNodes: 6, // relays in the lattice before it overloads (capped at 8)
    branchFactor: 2, // new relays each relay may claim per wave (1 = a chain, 2+ = a tree)
    linkDelay: 0.32, // seconds between one wave of relays and the next
    nodeHeight: 0.62, // where on a body the relay core sits, × dummy height
    overloadTime: 0.85, // seconds the full lattice strains before it discharges
    groundRadius: 2.2, // grounding with no relay: bodies this close to the strike die too, metres
    /** How a discharged relay flies. Same shape as `settings.dummies.hit`. */
    hit: { impulse: 6.5, lift: 6.0, spin: 2.0 },

    /* ================================================================ */
    /* 1 · TETHERS — braided camera-facing arcs between relays           */
    /* ================================================================ */
    tetherSegments: 48, // points along a tether actually drawn (capped at 64)
    growTime: 0.09, // seconds a new tether takes to race to its relay
    bow: 0.08, // arc of the tether, × its length (negative sags)
    braidRadius: 0.11, // the two strands' orbit around the line, metres
    braidTwists: 3.5, // turns of the braid along one tether
    braidSpeed: 5.0, // radians/second the braid rolls
    jag: 0.05, // crackle displacement, × tether length
    jagMax: 0.6, // ...capped at this many metres
    jagFrequency: 7.0, // kinks along a tether
    crackleRate: 18, // re-strikes per second (the jag pattern snaps this often)
    coreWidth: 0.025, // hard white core, metres either side
    glowWidth: 0.22, // full glow, metres either side
    glowFalloff: 2.2, // >1 tightens the glow
    strandBalance: 0.55, // second strand's brightness, × the first
    tetherIntensity: 3.6, // emissive multiplier
    tetherOpacity: 1.0,
    pulseCount: 3, // energy packets riding each tether toward its relay
    pulseSpeed: 1.6, // packets per second
    pulseGlow: 2.2, // extra brightness in a packet
    tetherFlicker: 0.35, // 0..1 strobe
    overloadWidth: 1.8, // tether width at the top of the overload, × normal
    snapScale: 14, // pieces a tether tears into when it snaps
    colorTetherCore: '#ffffff',
    colorTetherGlow: '#82e9ff',
    colorTetherEdge: '#2f6bff',
    colorTetherAlt: '#b98cff', // the second strand

    /* ================================================================ */
    /* 2 · RELAY CORES — the overload node over each claimed body        */
    /* ================================================================ */
    coreSize: 0.8, // billboard half-size, metres
    coreBall: 0.32, // the plasma ball's radius, × half-size
    coreBoil: 0.55, // turbulence on the ball's surface
    coreBoilScale: 3.2,
    coreFilaments: 9, // crackling filaments reaching out of the ball
    filamentReach: 0.85, // how far they reach at full charge, × half-size
    filamentSharp: 18, // >1 thins the filaments
    ringRadius: 0.78, // the containment ring, × half-size
    ringWidth: 0.035,
    ringGaps: 6, // breaks in the ring
    ringSpin: 1.8, // radians/second
    coreIntensity: 3.2, // emissive multiplier
    coreFlicker: 0.3, // 0..1
    chargeTime: 0.35, // seconds a new relay takes to come to full charge
    idleCharge: 0.55, // charge a relay holds while the lattice grows, 0..1
    overloadSwell: 1.55, // core size at the top of the overload, × normal
    nodeBob: 0.06, // hover of the core, metres
    nodeLift: 0.45, // pushes the core toward the camera so a body does not cut it, metres
    colorCoreHot: '#ffffff',
    colorCoreMid: '#7fe6ff',
    colorCoreEdge: '#3a5cff',
    colorCoreRing: '#c6a2ff',

    /* ================================================================ */
    /* 2b · CONDUCTOR CAGE — the hero solid: lit steel lightning rods     */
    /* ================================================================ */
    /* The claim tears a ring of rods up out of the floor round the body;
       they crown its head, hum, heat from the points down, open under the
       overload, are blown outward white-hot on the discharge, then cool and
       sink back into the floor. Lit, shadow-casting, LAYER.WORLD. */
    prongCount: 5, // rods per relay (capped at 7)
    cageRadius: 0.85, // metres from the body to each rod's foot
    cageTipRadius: 0.22, // metres from the body's axis to each point
    cageHeight: 2.25, // metres the points reach (over a 1.8 m body)
    prongWidth: 0.09, // half-width of a rod's foot, metres
    cageJitter: 0.35, // 0..1 irregularity of bearing, reach and height
    cageDelay: 0.03, // seconds after the claim the first rod breaks the floor
    cageRiseTime: 0.24, // seconds each rod takes to tear up (overshoots)
    cageStagger: 0.035, // seconds between one rod and the next round the ring
    cageHum: 0.02, // radians of hum while held (more under overload)
    cageSplay: 0.22, // radians the cage opens at the top of the overload
    cageBlowAngle: 0.95, // radians outward the discharge throws the rods
    cageBlowPush: 0.35, // metres the feet are shoved outward
    cageBlowTime: 0.16, // seconds the throw takes
    cageSinkDelay: 0.5, // seconds after the discharge they start to sink
    cageSinkTime: 1.05, // seconds to sink away
    cageSink: 1.05, // how far they sink, × their length
    cageIdleHeat: 0.55, // heat a held rod carries, 0..1
    cageIdleReach: 0.35, // ...over this much of its length from the point
    cageDischargeHeat: 1.3, // the white-hot spike on the discharge
    cageCoolTime: 0.45, // seconds it takes to cool down the ramp
    cageCrackle: 0.6, // 0..1 how much the heat stutters
    prongGlow: 2.6, // emissive multiplier of the heat
    prongGroove: 0.9, // the insulator grooves' share of the heat
    prongRoughness: 0.3,
    prongMetalness: 0.78,
    colorProng: '#1c2440', // blued steel
    colorProngHot: '#ffffff', // core (the only stop above 1)
    colorProngTint: '#9fe9ff', // pale tint
    colorProngBody: '#2f6bff', // saturated body
    colorProngDeep: '#0b1030', // deep

    /* ================================================================ */
    /* 3 · GROUND SIGILS — the relay seal under each claimed body        */
    /* ================================================================ */
    sigilRadius: 1.15, // metres
    sigilSpokes: 6, // radial ticks
    sigilSpin: 0.9, // radians/second
    sigilLine: 0.022, // line width, × radius
    sigilIntensity: 1.25,
    sigilOpacity: 0.9,
    sigilFill: 0.82, // how dark the plate under the lines is, 0..1 (the deep stop)
    sigilField: 0.45, // brightness of the plasma field in the plate
    sigilFieldScale: 3.2, // features across the plate
    sigilVeins: 0.55, // crawling veins of current
    colorSigil: '#6fdcff', // the lines (tint)
    colorSigilHot: '#ffffff', // overload / wipe (core)
    colorSigilBody: '#2a58e8', // the plasma field (body)
    colorSigilDeep: '#050818', // the plate (deep)

    /* --- 3b · conduction scars: the floor remembers the lattice --- */
    scarSpacing: 0.9, // one burn mark every this many metres along a new link's ground track
    scarRadius: 0.75, // radius of each mark, metres
    scarLife: 4.5, // seconds the marks stay (they outlive the cast)
    scorchRadius: 1.7, // dark scorch left under every relay by the discharge, metres
    scorchLife: 5.5,
    colorScorch: '#070b1c', // the deep tone: burnt floor

    /* ================================================================ */
    /* 4 · SPARKS + MOTES                                                */
    /* ================================================================ */
    sparkCount: 50, // per relay claimed
    lingerSparkRate: 70, // spat off live relays, per second
    dischargeSparks: 120, // per relay when the lattice discharges
    sparkSpeed: 9.5,
    sparkSize: 0.045,
    sparkLife: 0.45,
    sparkGravity: -9.0,
    sparkDrag: 1.6,
    sparkStretch: 0.12,
    sparkGlow: 2.4,
    colorSparkA: '#ffffff',
    colorSparkB: '#a9f1ff',
    colorSparkC: '#4f8dff',
    colorSparkD: '#2a1f66',
    moteRate: 160, // off the seeking leader, per second
    nodeMoteRate: 26, // off each relay, per second
    moteSize: 0.2,
    moteLife: 0.7,
    moteSpeed: 0.9,
    moteRise: 1.1,
    moteGlow: 1.7,
    moteTurbulence: 1.2,
    colorMoteA: '#e6fbff',
    colorMoteB: '#82e9ff',
    colorMoteC: '#5a6dff',
    colorMoteD: '#1a1440',

    /* ================================================================ */
    /* 5 · DISCHARGE — the simultaneous burst                            */
    /* ================================================================ */
    burstSize: 2.6, // STORM shell at every relay, metres
    burstLife: 0.42,
    burstIntensity: 2.6,
    shockRadius: 2.6, // shockwave ring under every relay, metres
    shockLife: 0.5,
    shockIntensity: 0.75, // so six rings at once read as one blast, not a target board
    arcRadius: 1.4, // ARC burn under each relay as it is claimed, metres
    arcLife: 4,
    arcWidth: 0.07,
    arcIntensity: 1.5,
    groundArcRadius: 2.6, // ARC burn where it grounds, metres
    colorArcA: '#8fdcff',
    colorArcB: '#4a5dff',
    colorBurstA: '#ffffff',
    colorBurstB: '#82e9ff',
    colorBurstC: '#5b3cff',
    colorShockA: '#4f9dff',
    colorShockB: '#bfefff',

    /* ================================================================ */
    /* 6 · HEAT WARP — screen-space strain round each relay              */
    /* ================================================================ */
    warpSize: 1.4, // half-size of the warp billboard, metres
    warpStrength: 0.2, // while the lattice holds (kept low so the cages read through it)
    warpOverload: 0.65, // extra at the top of the overload
    warpScale: 2.4,
    warpSpeed: 2.2,

    /* ================================================================ */
    /* 7 · LIGHT & FEEDBACK                                              */
    /* ================================================================ */
    lightColor: '#82e9ff',
    lightIntensity: 6,
    lightRadius: 10,
    lightFlicker: 0.45, // 0..1 how much the light gutters
    relayLight: 10, // light punch per relay claimed
    dischargeLight: 45, // light punch on the discharge
    relayShake: 0.12,
    relayFlash: 0.12,
    overloadRumble: 0.18, // continuous shake while the lattice strains
    dischargeShake: 0.65,
    dischargeFlash: 0.55,
    castShake: 0.05,
    colorFlash: '#bdf4ff'
  }
};
