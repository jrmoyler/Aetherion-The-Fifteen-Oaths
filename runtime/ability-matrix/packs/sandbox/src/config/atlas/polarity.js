/**
 * Polarity Garden — Trap — capsules arc out, tether into a magnetic lattice, then detonate in order.
 *
 * Ability Atlas data block, rebuilt for the sandbox engine. Plain data, no
 * imports, so `settings.js` can pull it in without a cycle.
 *
 * The cast runs on one clock from the moment it leaves the hand: throws →
 * landing → tethers → arming → cascade → linger. Every duration below is a
 * live slider; `PolarityGardenAbility` re-derives the timeline every frame.
 */
export default {
  id: 'polarity',
  meta: {
    label: "Polarity Garden",
    accent: '#ffae69',
    key: '',
    hint: "Trap — red and blue capsule mines arc out, tether into a magnetic lattice, then detonate in an alternating cascade",
    cast: 'zone',
    glyph: `<rect x="14" y="56" width="14" height="24" rx="7"/><rect x="72" y="56" width="14" height="24" rx="7"/><rect x="43" y="14" width="14" height="24" rx="7"/><path d="M28 64C40 50 60 50 72 64"/><path d="M24 56C26 44 36 34 44 30M76 56C74 44 64 34 56 30" stroke-dasharray="5 4"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 16, // maximum cast distance, metres
    minRange: 2, // the garden is never planted on the caster's own feet
    speed: 40, // how fast the targeting spark races to the circle, metres/second
    lifetime: 1.0, // × every phase of the timeline below (on top of global lifetime)
    fadeTime: 1.4, // seconds the scorch, smoke and last light take to clear
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 3.2, // radius of the garden, metres — what the indicator measures
    handHeight: 1.4, // metres above the floor the capsules leave the hand

    /* ================================================================ */
    /* 1 · CAPSULES — thrown, landed, armed                               */
    /* ================================================================ */

    /* --- layout --- */
    mineCount: 7, // capsules in the outer ring (max 12)
    centreMine: 1, // 0/1 — one more planted dead centre (the finale)
    mineRing: 0.74, // ring radius, × zoneRadius
    mineJitter: 0.12, // random scatter of each landing spot, × zoneRadius
    angleJitter: 0.25, // random shuffle round the ring, × one step

    /* --- the throw --- */
    throwStagger: 0.06, // seconds between capsules leaving the hand
    flightTime: 0.62, // seconds each capsule spends in the air
    arcHeight: 2.6, // metres the arc peaks above a straight line
    tumble: 11, // radians/second a capsule tumbles in flight
    landBounce: 0.18, // metres it hops when it lands
    landSettle: 0.35, // seconds to settle upright after landing
    landDust: 1.0, // metres — dust ring under each landing

    /* --- the capsule --- */
    mineSize: 0.95, // capsule height, metres — a knee-high pylon, reads at 8 m
    mineGirth: 0.36, // capsule radius, × its height
    plantDepth: 0.12, // fraction of its height buried in the floor
    finSpread: 0.55, // radians the fins open as it plants
    hullReflect: 0.9, // sky in the gunmetal
    hullGloss: 90,
    hullSpecular: 1.4,
    panelLines: 0.6, // depth of the stencilled panel seams
    bandGlow: 4.5, // brightness of the polarity band round its waist
    beaconGlow: 6.0, // brightness of the blinking beacon on top
    blinkRate: 1.6, // blinks / second when it first lands
    blinkArmed: 9.0, // blinks / second just before it goes
    blinkDuty: 0.35, // fraction of each blink the beacon is lit
    heatGlow: 2.5, // how white-hot the hull flares on its last instant
    colorHull: '#3d4a5c',
    colorHullDeep: '#0b0f15',
    colorHullSpec: '#d9e7ff',
    colorPositive: '#ff4a3a', // the + capsules: red
    colorNegative: '#3a8bff', // the − capsules: blue
    colorHeat: '#fff1d6',

    /* ================================================================ */
    /* 2 · TETHERS — the magnetic lattice                                  */
    /* ================================================================ */
    tetherDelay: 0.08, // seconds after the last capsule lands before the lattice forms
    tetherForm: 0.45, // seconds for the field lines to reach across
    armTime: 0.45, // seconds the lattice holds before the cascade starts
    tetherCross: 1, // 0/1 — lines across the ring (i → i+2) as well as round it
    tetherSpokes: 1, // 0/1 — lines from the centre capsule to every other
    linesPerTether: 2, // field lines per tether (1–3)
    tetherBow: 0.5, // how far a field line bulges, × its span
    tetherLift: 0.35, // ...of which upward, the rest sideways
    tetherHeight: 0.45, // metres off the floor the lines attach (the band)
    tetherWidth: 0.26, // metres — ribbon width
    flowSpeed: 1.6, // how fast the dashes crawl from + to −
    flowDensity: 7.0, // dashes along a line
    flowSharp: 0.55, // dash sharpness
    tetherGlow: 4.2,
    tetherFlicker: 0.35, // electrical stutter
    tetherSnap: 0.18, // seconds a tether takes to whip out when its capsule goes
    crackleRate: 30, // sparks / second crawling along the lattice
    colorTetherCore: '#fff3e8',
    plotGlow: 1.8, // the field drawn on the floor under the lattice (iron filings and contours)
    plotReach: 1.15, // how far the field pattern reaches, × zoneRadius
    plotContour: 0.45, // brightness of the crawling equipotential contours
    plotPlanted: 0.4, // floor field strength from the first planting, before the lattice forms
    poleRing: 0.75, // metres — the halo each pole stamps on the floor
    poleGlow: 1.1,

    /* --- 2b · the flux pillars over each capsule --- */
    pillarHeight: 2.6, // metres
    pillarRadius: 0.7, // base radius, metres
    pillarCentreScale: 1.3, // the centre capsule's pillar, ×
    pillarGlow: 2.0,
    pillarLines: 7, // field lines wound round the tube
    pillarTwist: 1.4, // turns of twist over the height
    pillarFlow: 1.3, // flux packets: up out of +, down into −
    pillarRise: 0.3, // seconds a pillar takes to rise once planted
    pillarBlast: 0.4, // seconds it takes to burn out when its capsule goes
    pillarBlastHeight: 1.6, // how far it shoots up on detonation, × height
    pillarBlastGlow: 0.9, // brightness of the pillar as it shoots up (was 2.2 — blew the ring out)
    pillarCoreMix: 0.25, // how far the pillar base goes toward white (0 = pure pole colour)

    /* ================================================================ */
    /* 3 · CASCADE — the ordered detonations                               */
    /* ================================================================ */
    cascadeMode: 0, // 0 = alternating round the ring from the caster's side, 1 = every + then every −
    cascadeInterval: 0.13, // seconds between detonations
    finaleDelay: 0.25, // extra pause before the centre capsule goes
    finaleScale: 1.6, // centre detonation size, × a ring one
    lingerTime: 0.6, // seconds after the last detonation before the fade

    killRadius: 1.35, // metres — a body this close to a detonation is thrown
    /** How a body is thrown. Same shape as `settings.dummies.hit`. */
    hit: { impulse: 9.0, lift: 6.0, spin: 2.2 },

    flareSize: 1.8, // metres — the detonation star
    flareLife: 0.32, // seconds
    flareSpikes: 6, // spikes on the star
    flareGlow: 1.6, // emissive of the burst ring/spikes in the pole colour
    flareDark: 0.85, // the near-black heart the charge collapses into
    flareHot: 0.5, // white pinpoint in the first instant only
    burstRadius: 1.6, // metres — the burst shell
    burstLife: 0.45,
    burstIntensity: 0.9,
    burstWhite: 0.15, // how far the burst rim leans toward white
    burstDeep: 0.3, // burst body, × the pole colour
    shockIntensity: 0.8,
    shockRadius: 3.0, // metres — shockwave ring per detonation
    shockLife: 0.55,
    scorchRadius: 1.2, // metres
    scorchLife: 5.0,
    detonationShake: 0.22,
    detonationFlash: 0.05,
    detonationLight: 7,
    lensStrength: 0.9, // screen warp of each shock ring
    lensSize: 1.8, // metres
    colorFlareCore: '#fffaf0',
    colorScorchA: '#ff7b2e',
    colorScorchB: '#1a0d08',
    colorFlash: '#ffe2c4',

    /* ================================================================ */
    /* 4 · PARTICLES                                                       */
    /* ================================================================ */
    sparkCount: 70, // sparks per detonation
    sparkSpeed: 11,
    sparkSize: 0.09,
    sparkLife: 0.55,
    sparkGravity: -9,
    colorSparkA: '#ffe2c8',
    colorSparkB: '#ffd7a0',
    colorSparkC: '#ff6a2a',
    colorSparkD: '#3a1208',
    smokeCount: 14, // smoke puffs per detonation
    smokeSize: 0.8,
    smokeLife: 1.8,
    smokeRise: 0.8,
    colorSmokeA: '#4a3a33',
    colorSmokeB: '#2a2422',
    colorSmokeC: '#181514',
    colorSmokeD: '#0b0a0a',
    trailRate: 70, // trail sparks / second off each capsule in flight
    trailSize: 0.07,
    trailLife: 0.35,

    /* --- the light --- */
    lightColor: '#ffae69',
    lightIntensity: 6,
    lightRadius: 9,
    lightHeight: 1.0 // metres above the floor the light hangs
  }
};
