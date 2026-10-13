/**
 * Seraphic Descent — Light — a halo opens over the circle, two great wings of
 * light unfold out of it, beat once, and loose a rain of feather blades.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so `settings.js`
 * can pull it in without a cycle.
 *
 * Every dimension, time and colour below is resolved per frame by
 * `SeraphicDescentAbility`, so dragging any of it in the editor re-shapes a
 * descent that is already over the circle — the wings re-pose, the halo
 * re-sizes, the feather darts in flight re-aim at their landing points.
 */
export default {
  id: 'seraph',
  meta: {
    label: "Seraphic Descent",
    accent: '#fff1b0',
    key: '',
    element: 'light',
    hint: "Light — a halo opens over the circle, great wings of light unfold, beat once and rain feather blades that lift the struck into the light",
    cast: 'zone',
    glyph: `<ellipse cx="50" cy="22" rx="14" ry="5"/><path d="M50 34C40 30 22 24 8 30C18 36 22 46 20 58C30 52 40 46 48 44"/><path d="M50 34C60 30 78 24 92 30C82 36 78 46 80 58C70 52 60 46 52 44"/><path d="M42 62L38 78"/><path d="M50 60V82"/><path d="M58 62L62 78"/><path d="M28 90H72"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 0, // the circle may be dropped at the caster's feet
    speed: 24, // how fast the herald light climbs to the halo, metres/second
    lifetime: 2, // seconds the struck hang in the light before they are dropped
    cooldown: 0.5, // seconds before the ability can be armed again
    castAnim: "cast3", // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4, // radius of the circle the descent covers, metres
    colorA: "#fff1b0", // accent: pale gold
    colorB: "#ffffff", // accent: white

    /* --- light --- */
    lightColor: "#fff1b0",
    lightIntensity: 6, // the steady radiance under the wings
    lightRadius: 8,
    lightHeight: 4, // metres above the floor the light hangs

    /* --- the herald (travel) --- */
    heraldSize: 0.28, // the climbing mote, metres
    heraldGlitter: 90, // motes / second shed on the way up

    /* ================================================================ */
    /* Timing — one clock, started when the herald reaches the halo      */
    /* ================================================================ */
    haloTime: 0.45, // seconds the halo takes to draw itself round
    unfoldDelay: 0.2, // seconds after the halo starts before the wings move
    unfoldTime: 1.0, // seconds the wings take to open
    hoverTime: 0.5, // seconds they hang open, breathing, before the beat
    beatWindup: 0.42, // seconds they rise for the stroke (anticipation)
    beatStroke: 0.16, // seconds of the down-stroke; the volley is loosed at its end
    volleyTime: 0.45, // seconds the darts are loosed over
    dartFlight: 0.42, // seconds one dart takes to reach the floor
    foldTime: 1.1, // seconds the wings fold and the halo leaves (the fade)

    /* ================================================================ */
    /* 1 · THE HALO                                                      */
    /* ================================================================ */
    haloHeight: 6.4, // metres above the floor
    haloOffset: 0.6, // metres it is set back from the circle's centre, away from the caster
    haloRadius: 1.15, // metres
    haloWidth: 0.16, // glow width of the band, metres
    haloCore: 0.025, // white core width, metres
    haloTilt: 0.32, // radians it is tipped toward the caster
    haloGlow: 4.5,
    haloOpacity: 1,
    haloFalloff: 2.2, // how quickly the glow dies off the core
    haloBeads: 28, // the beaded studs set round the band
    haloBeadGlow: 1.4,
    haloBeadSharp: 6, // how pointed each bead is
    haloSpin: 0.35, // radians / second the beads turn
    haloShimmer: 0.35, // noise flicker along the band
    haloShimmerScale: 5,
    haloShimmerSpeed: 1.6,
    haloRise: 2.6, // metres it lifts away on the exit
    haloBloom: 0.55, // the soft glow disc behind it
    haloBloomSize: 2.6, // metres
    colorHaloCore: "#ffffff",
    colorHalo: "#ffe6a3",
    colorHaloEdge: "#ffae45",

    /* ================================================================ */
    /* 2 · THE WINGS — pose                                              */
    /* ================================================================ */
    wingDrop: 1.15, // metres the shoulders hang below the halo
    wingShoulder: 0.32, // metres between the axis and each shoulder
    wingSpan: 5.4, // metres from shoulder to wing tip, fully open
    wingLift: 0.72, // how high the arm arches, × span
    wingSweep: 0.9, // metres the tips are swept back, away from the caster
    wingFoldSpan: 0.22, // span when folded, × wingSpan
    wingFoldAngle: 1.95, // radians the folded arm is turned down
    wingCurl: 0.28, // metres each feather's tip curls back
    flapAmp: 0.09, // radians of the gentle breathing flap
    flapSpeed: 2.4, // radians / second of that flap
    beatRaise: 0.55, // radians the wings rise in the wind-up
    beatDown: 0.62, // radians below rest the stroke drives them
    beatSweep: 1.4, // metres the tips swing forward on the stroke
    featherLag: 0.12, // how far the feathers trail the flap (bend)

    /* --- feathers --- */
    featherCount: 30, // flight feathers along the trailing edge
    featherLength: 2.9, // metres, the longest primaries at the hand
    featherInnerLength: 1.95, // metres, the secondaries at the shoulder
    featherWidth: 0.27, // half-width of a flight feather's vane, metres
    covertRows: 3, // rows of covert feathers layered over the flight feathers (max 4)
    covertCount: 22, // feathers in the first covert row (later rows have fewer)
    covertLength: 0.52, // each covert row's length, × the row under it
    covertWidth: 0.85, // covert width, × the flight-feather width (scaled by length)
    covertReach: 0.9, // how far out along the arm the coverts run, 0..1
    fanInner: 1.85, // radians the inner feathers hang off the arm
    fanOuter: 0.1, // radians the tip feathers are turned off the arm
    fanJitter: 0.05, // radians of per-feather jitter
    layerDepth: 0.05, // metres each covert row sits in front of the last

    /* --- feather shading --- */
    featherGlow: 1.25, // overall brightness (bloom > 1)
    featherOpacity: 0.5,
    rachisGlow: 3.2, // the glowing shaft
    rachisWidth: 0.07, // fraction of the vane
    barbScale: 34, // barbs per feather
    barbSlant: 1.4, // how steeply the barbs rake back
    barbContrast: 0.55,
    vaneTear: 0.35, // splits torn into the vanes
    vaneTearScale: 7,
    tipGlow: 1.3, // extra light at the feather tips
    featherShimmer: 0.35, // light moving across the wing
    featherShimmerSpeed: 1.3,
    revealSoft: 0.28, // how soft the shoulder→tip unfold reveal is
    dissolveEdge: 0.08, // width of the burning edge as the wings go
    dissolveGlow: 3, // brightness of that edge
    colorFeatherRoot: "#ffbf55",
    colorFeather: "#ffe9b5",
    colorFeatherTip: "#fffaf0",
    colorRachis: "#ffffff",

    /* ================================================================ */
    /* 3 · GOD RAYS                                                      */
    /* ================================================================ */
    rayCount: 5, // slanting shafts from the halo (max 6)
    rayTopRadius: 0.22, // metres at the halo
    rayBottomRadius: 0.85, // metres at the floor
    raySlant: 1.6, // metres the shafts lean away from the caster as they fall
    rayScatter: 0.95, // where their feet land, × the circle radius
    rayGlow: 0.85,
    rayOpacity: 0.32,
    rayEdge: 2.4, // how soft their edges are (higher = thinner core)
    rayStreakScale: 3, // light streaks inside
    rayStreakSpeed: 1.1, // how fast they run down
    rayStreaks: 0.6, // how strong the streaks are
    rayTopFade: 0.18, // fraction of the shaft faded in at the top
    raySoftFade: 0.7, // soft intersection with the floor, metres
    bodyRayRadius: 0.5, // a shaft round each body held in the light, metres
    bodyRayGlow: 1.3,
    colorRay: "#ffe7a8",
    colorRayCore: "#fffdf2",

    /* ================================================================ */
    /* 4 · FLOOR SIGIL                                                   */
    /* ================================================================ */
    sigilRadius: 1.0, // × the circle radius
    sigilGlow: 2.0,
    sigilOpacity: 0.85,
    sigilRingWidth: 0.045, // metres
    sigilRays: 12, // radiant rays of the inner star
    sigilRaySharp: 26, // how thin they are
    sigilRunes: 40, // rune cells round the outer band
    sigilRuneGlow: 1.2,
    sigilSpin: 0.12, // radians / second the rune band turns
    sigilDraw: 0.85, // seconds it takes to draw itself
    sigilPulse: 2.2, // flare on the beat
    sigilFlicker: 0.25,
    colorSigil: "#ffcf73",
    colorSigilHot: "#fffaf0",

    /* ================================================================ */
    /* 5 · FEATHER DARTS                                                 */
    /* ================================================================ */
    dartsPerBody: 3, // darts aimed at each body in the circle
    dartsGround: 28, // darts loosed into the floor (max total 72)
    dartScatter: 0.95, // where they land, × the circle radius
    dartArc: 0.7, // metres they bow sideways in flight
    dartLength: 0.85, // metres of blade
    dartWidth: 0.1, // half-width of the blade, metres
    dartTrail: 2.4, // metres of light trail behind it
    dartTrailWidth: 0.045, // metres
    dartGlow: 4,
    dartSoftFade: 0.12,
    dartBury: 0.3, // fraction of the blade sunk into what it hits
    dartStickTime: 1.2, // seconds a landed dart stays, glowing, before it dissolves
    colorDart: "#fffbe9",
    colorDartTrail: "#ffcd70",

    /* --- landing --- */
    landFlareSize: 0.75, // the star of light where a dart lands, metres
    landFlareLife: 0.32,
    landSparks: 9,
    landSparkSpeed: 4.5,
    landDecalRadius: 0.65,
    landDecalLife: 0.8,
    landShake: 0.035,
    sparkSize: 0.06,
    sparkLifetime: 0.42,
    sparkStretch: 0.5,
    colorSparkA: "#ffffff",
    colorSparkB: "#fff0b8",
    colorSparkC: "#ffbe55",
    colorSparkD: "#b8641c",

    /* ================================================================ */
    /* 6 · MOTES & LOOSE FEATHERS                                        */
    /* ================================================================ */
    moteRate: 70, // motes / second sifting off the wings
    moteSize: 0.08,
    moteLifetime: 2.2,
    moteFall: 0.45, // metres / second
    moteGlow: 2.4,
    colorMoteA: "#ffffff",
    colorMoteB: "#fff2c0",
    colorMoteC: "#ffd27a",
    colorMoteD: "#c07a2a",
    downRate: 9, // loose feathers / second drifting off the wings
    downBeat: 42, // loose feathers shaken off by the beat
    downSize: 0.2,
    downLifetime: 2.8,
    downGravity: -0.55,
    downSpin: 2.2,
    downGlow: 1.4,
    colorDownA: "#ffffff",
    colorDownB: "#fff4d2",
    colorDownC: "#ffd88e",
    colorDownD: "#d08a3a",

    /* ================================================================ */
    /* 7 · THE BEAT                                                      */
    /* ================================================================ */
    beatShake: 0.22,
    beatFlash: 0.22,
    beatLight: 14, // light punch on the stroke
    beatBurst: 3.6, // the AIR shell thrown off the wings, metres
    beatRing: 6.5, // the shock ring printed on the floor, metres
    beatRingLife: 0.9,
    colorFlash: "#fff4d6",
    colorRingA: "#ffd27a",
    colorRingB: "#ffffff",
    colorBurstA: "#ffffff",
    colorBurstB: "#ffe7a8",
    colorBurstC: "#d89a4a",

    /* --- distortion: the down-wash --- */
    warpStrength: 0.7,
    warpSize: 12, // metres across the proxy
    warpRingWidth: 0.12, // fraction of the proxy
    warpRingTime: 0.55, // seconds the pressure ring takes to cross it
    warpShimmer: 0.18, // the steady shimmer round the wings
    warpScale: 1.4,
    warpSpeed: 1.2,

    /* ================================================================ */
    /* 8 · THE STRUCK — pinned, lifted, dropped                          */
    /* ================================================================ */
    pinHeight: 1.25, // metres up the body the chest is caught at
    liftHeight: 1.5, // metres the light raises it
    liftTime: 1.2, // seconds the rise takes
    pinStiffness: 0.14, // 1 = rigid, low = it hangs and swings on the light
    liftSway: 0.12, // metres of slow sway while it hangs
    hitImpulse: 0.6, // the dart's own blow
    hitLift: 1.4,
    hitSpin: 0.4,
    dropShove: 3, // metres / second it is thrown down when dropped
    dropFlash: 0.12
  }
};
