/**
 * Permafrost Bloom — Frost — fractal rime races across the circle, freezes
 * what stands in it, and a ring of ice spikes shatters it all.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension and time below is resolved per frame by
 * `PermafrostBloomAbility`, so dragging any of it in the editor re-shapes a
 * bloom that is already spreading.
 */
export default {
  id: 'permafrost',
  meta: {
    label: "Permafrost Bloom",
    accent: '#bfefff',
    key: '',
    element: 'frost',
    hint: "Frost — fractal rime races across the circle, freezes what stands in it, then ice spikes shatter it",
    cast: 'zone',
    glyph: `<path d="M50 50L50 14M50 50L81 32M50 50L81 68M50 50L50 86M50 50L19 68M50 50L19 32"/><path d="M50 26L42 20M50 26L58 20M68 40L70 30M68 40L78 44M68 60L78 56M68 60L70 70M50 74L42 80M50 74L58 80M32 60L22 56M32 60L30 70M32 40L22 44M32 40L30 30"/><circle cx="50" cy="50" r="40"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 0, // closer than this and the cast is refused
    speed: 24, // how fast the frost seed flies to the circle, metres/second
    lifetime: 2.2, // seconds the rime takes to sublimate away at the end
    cooldown: 0.5, // seconds before the ability can be armed again
    castAnim: "cast3", // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4, // metres — the circle the rime fills

    /* --- light --- */
    lightColor: "#bfefff",
    lightIntensity: 6, // the bloom's steady cold glow
    lightRadius: 8,

    /* ================================================================ */
    /* 1 · THE FROST SEED                                                */
    /* ================================================================ */
    handForward: 0.5, // metres in front of the caster it leaves from
    handHeight: 1.45, // metres off the floor
    seedArc: 2.2, // metres the seed's flight arcs up at its apex
    seedSize: 0.22, // radius of the seed crystal, metres
    seedSpin: 9, // radians/second it tumbles
    seedGlow: 2.6, // its inner glow
    seedTrail: 150, // glints per second it sheds
    landBurst: 1.6, // the FROST shell where it lands, metres
    landFlash: 0.22,
    landShake: 0.2,
    colorSeed: "#eafcff",

    /* ================================================================ */
    /* 2 · THE RIME                                                      */
    /* ================================================================ */
    growTime: 0.9, // seconds the front takes to race out to the edge
    growCurve: 0.65, // <1 races out then slows; 1 even; >1 starts slow
    armCount: 9, // main frost-fern arms leading the front
    armLead: 0.24, // how far ahead of the fill the arms run, × the radius
    armWidth: 0.05, // half-width of an arm's spine, metres
    armWobble: 0.4, // how much the arms wander
    fernScale: 1.7, // dendrite cells per metre
    fernBranch: 0.55, // branch spacing along a dendrite, × the cell
    fernWidth: 0.03, // line width of the dendrites, × the cell
    frostDensity: 0.75, // the base frosting under the ferns
    edgeFeather: 0.3, // softness of the front, metres
    rimeGlow: 1.3, // how bright the frost reads (bloom > 1 on the ferns)
    frontGlow: 2.6, // the bright band riding the front
    frontWidth: 0.35, // metres
    sparkle: 2.4, // glints in the frost
    sparkleScale: 24, // glints per metre
    sparkleSpeed: 2.5, // how fast they twinkle
    rimeOpacity: 0.9,
    colorRimeA: "#ffffff", // fern white
    colorRimeB: "#bfe6ff", // frost blue
    colorRimeDeep: "#3a74ae", // the ice showing through between ferns
    colorFront: "#e2f9ff",
    colorSparkle: "#ffffff",

    /* ================================================================ */
    /* 3 · COLD MIST                                                     */
    /* ================================================================ */
    frontMist: 140, // puffs/second rolled off the front while it spreads
    mistRate: 60, // puffs/second off the frost while it holds
    mistSize: 0.9,
    mistSpeed: 0.8, // m/s outward along the floor
    mistLife: 2.4,
    mistOpacity: 0.26,
    colorMistA: "#f2fbff",
    colorMistB: "#d6efff",
    colorMistC: "#b4d8f2",
    colorMistD: "#8fb6d6",

    /* ================================================================ */
    /* 4 · ENCASING                                                      */
    /* ================================================================ */
    encaseTime: 0.45, // seconds the shell takes to grow once the front reaches a body
    encaseReach: 1.0, // × the zone radius that the freeze reaches
    shellCrystals: 12, // crystals in each shell (max 14)
    shellHeight: 1.95, // metres the tallest crystal stands
    shellRadius: 0.36, // metres from the body the crystals stand
    shellThickness: 0.2, // crystal radius, metres
    shellJitter: 0.5, // 0..1 how irregular the shell is
    shellTilt: 0.32, // radians the crystals lean out
    frostTint: 1, // 0..1 how far the body inside goes to ice
    colorBodyFrozen: "#9cc8e8",
    colorBodyRim: "#e6f8ff",
    bodyRimGlow: 2.2,
    colorBodyEdge: "#ffffff",
    bodyEdgeGlow: 3,
    bodyEdgeWidth: 0.05,

    /* ================================================================ */
    /* 5 · ICE                                                           */
    /* ================================================================ */
    iceGlow: 0.9, // light glowing up inside the ice
    iceFresnel: 2.4, // the bright rim
    iceEnv: 1.2, // the sky in its faces
    iceOpacity: 0.86,
    iceCracks: 0.7, // internal fractures
    iceCrackScale: 4, // per metre
    iceSoftFade: 0.15, // soft intersection with the floor, metres
    colorIceA: "#effcff", // the faces
    colorIceB: "#86c8f2", // the body
    colorIceDeep: "#1d4a80", // deep inside

    /* ================================================================ */
    /* 6 · THE SPIKES                                                    */
    /* ================================================================ */
    holdTime: 0.4, // seconds the frozen circle holds before the spikes come
    spikeTime: 0.5, // seconds the eruption takes to sweep from the edge to the middle
    spikeRise: 0.14, // seconds one spike takes to burst up
    spikeCount: 56, // total spikes (max 96)
    spikeRings: 3, // rings they stand in
    spikeInner: 0.3, // radius of the innermost ring, × the zone radius
    spikeHeight: 1.5, // metres
    spikeHeightJitter: 0.45, // 0..1
    spikeRadius: 0.17, // metres at the base
    spikeLean: 0.42, // radians they lean in toward the middle
    spikeChips: 4, // chips thrown off each spike as it bursts up
    spikeShake: 0.35,
    linger: 0.5, // seconds the spikes stand before the bloom fades
    shockRadius: 6, // the shockwave on the floor at the eruption, metres
    colorShockA: "#bfefff",
    colorShockB: "#ffffff",

    /* ================================================================ */
    /* 7 · THE SHATTER                                                   */
    /* ================================================================ */
    shatterDelay: 0.04, // seconds after the eruption wave passes a body
    shatterImpulse: 9, // m/s the pieces fly out from the middle
    shatterLift: 4.5, // m/s upward
    shatterSpin: 2.2, // tumble
    chipCount: 70, // ice chips per shattered body
    chipSpeed: 7, // m/s
    chipSize: 0.09,
    chipLife: 1.4,
    chipGravity: 14, // m/s²
    burstSize: 2, // the FROST shell round a shattering body, metres
    burstIntensity: 1.2,
    shatterFlash: 0.25,
    shatterShake: 0.4,
    shatterLight: 1.5, // light punch, × lightIntensity
    colorChipA: "#ffffff",
    colorChipB: "#d8f4ff",
    colorChipC: "#8fc8ee",
    colorChipD: "#4a86b8",
    colorBurstA: "#ffffff",
    colorBurstB: "#bfe9ff",
    colorBurstC: "#5f9fd4",
    colorFlash: "#dff6ff",

    /* ================================================================ */
    /* 8 · SUBLIMATION & COLD AIR                                        */
    /* ================================================================ */
    sublimateEdge: 0.08, // width of the glittering edge as the rime goes
    sublimateGlitter: 180, // glints released per second as it sublimates
    spikeCrumble: 0.55, // share of the fade the spikes take to crumble
    glintSize: 0.05,
    glintLife: 0.9,
    glintGlow: 3,
    hazeStrength: 0.35, // the cold air shimmering over the frost
    hazeScale: 1.6,
    hazeSpeed: 0.7
  }
};
