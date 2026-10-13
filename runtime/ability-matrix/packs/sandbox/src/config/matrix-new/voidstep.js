/**
 * Voidstep Rift — Void — paired rifts: step in at the caster, out at the target.
 *
 * Matrix New data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * One clock from the cast: both rifts tear open together, the caster steps
 * into the first and is gone, a thread of void runs between them while the
 * step is "in transit" (`speed` along the line), the caster steps out of the
 * second, and both slam shut with a pulse at the exit. Every number below is
 * read every frame.
 */
export default {
  id: 'voidstep',
  meta: {
    label: "Voidstep Rift",
    accent: '#aa60ff',
    key: 'Y',
    hint: "Void — tear two rifts, step through one and out of the other; the exit snaps shut with a pulse",
    cast: 'line',
    glyph: `<path d="M26 22C20 36 32 46 24 54C18 64 30 72 26 80"/><path d="M74 22C68 36 80 46 72 54C66 64 78 72 74 80"/><path d="M36 51H62M55 44L62 51L55 58" stroke-dasharray="4 3"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 16, // maximum step, metres
    minRange: 3, // closer than this and the cast is refused
    speed: 26, // metres/second the caster is in transit through the void
    lifetime: 0.55, // seconds from emerging until the rifts snap shut
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    fadeTime: 0.7, // seconds the closing pulse and the embers take to settle
    colorA: '#2a1040', // the void
    colorB: '#aa60ff', // the tear

    /* ================================================================ */
    /* THE BODY                                                          */
    /* ================================================================ */
    enterTime: 0.16, // seconds the caster takes to be drawn into the entry rift
    exitTime: 0.22, // seconds to step out of the exit rift
    enterSqueeze: 0.05, // width the body is pinched to as it goes in (× its own)
    enterStretch: 1.15, // ... and its height
    exitOvershoot: 1.6, // spring on the way out

    /* ================================================================ */
    /* 1 · THE RIFTS                                                     */
    /* ================================================================ */
    riftHeight: 2.6, // metres, floor to top of the tear
    riftWidth: 1.05, // metres, fully open at its widest
    riftLift: 0.05, // metres the foot of the tear floats over the floor
    riftOffset: 0.3, // metres the entry rift stands in front of the caster (and the exit behind the landing)
    openTime: 0.14, // seconds to tear fully open
    closeTime: 0.12, // seconds to slam shut
    exitOpenLead: 0.12, // the exit rift opens this long before the caster arrives
    riftPinch: 1.6, // how sharply the slit pinches at top and bottom
    riftJag: 0.18, // how torn the edge is, × width
    riftJagScale: 4.5, // tears per metre
    riftJagSpeed: 1.6,
    edgeWidth: 0.06, // metres of glowing lip
    edgeGlow: 5.0,
    edgeFlicker: 0.35,
    voidDepth: 3.0, // how deep the inside reads — parallax of the star layers
    voidSwirl: 1.4, // rad/s the inside turns
    voidTwist: 2.5, // how hard the swirl winds toward the middle
    starDensity: 34, // stars per unit across a layer
    starSize: 0.08, // fraction of a cell
    starBright: 3.0,
    nebula: 0.75, // how much violet gas swims in the void
    nebulaScale: 1.8,
    voidGlow: 1.0,
    riftOpacity: 1.0,
    colorVoidDeep: '#05010c',
    colorVoidGas: '#3a1470',
    colorStar: '#e8d8ff',
    colorEdgeCore: '#ffffff',
    colorEdgeGlow: '#aa60ff',
    colorEdgeOuter: '#4a1890',

    /* ================================================================ */
    /* 2 · FILAMENTS — crackling arcs off the lips                       */
    /* ================================================================ */
    filamentCount: 5, // per rift (max 8)
    filamentLength: 0.9, // metres they reach out from the lip
    filamentWidth: 0.025, // metres
    filamentJag: 0.18, // how kinked they are, metres
    filamentRate: 9, // re-strikes per second
    filamentGlow: 4.0,
    colorFilament: '#d8b0ff',

    /* ================================================================ */
    /* 3 · THE THREAD between the rifts                                  */
    /* ================================================================ */
    threadHeight: 1.1, // metres off the floor
    threadWidth: 0.07, // metres
    threadGlow: 2.2,
    threadPulse: 1.0, // brightness of the knot that runs along it with the caster
    threadPulseSize: 1.2, // metres
    threadNoise: 0.6, // how torn and flickering
    threadNoiseScale: 1.4,
    threadOpacity: 0.7,
    colorThreadCore: '#f0e0ff',
    colorThreadEdge: '#7a30ff',

    /* ================================================================ */
    /* 4 · LENSES (screen-space)                                         */
    /* ================================================================ */
    lensStrength: 0.7, // the pull toward each open rift
    lensSize: 2.6, // metres across
    lensSwirl: 0.6, // how much of the pull is twist
    pulseStrength: 1.6, // the closing pulse's ring
    pulseSize: 7, // metres it reaches
    pulseTime: 0.45,

    /* ================================================================ */
    /* 5 · PARTICLES                                                     */
    /* ================================================================ */
    emberRate: 90, // embers torn off each open rift, per second
    emberSize: 0.07,
    emberSpeed: 1.2,
    emberLifetime: 0.9,
    emberGlow: 2.5,
    colorEmberA: '#ffffff',
    colorEmberB: '#c890ff',
    colorEmberC: '#7a30ff',
    colorEmberD: '#1a0630',
    suckCount: 70, // motes pulled into the entry as the caster goes in
    suckRadius: 1.6,
    closeSparks: 90, // sparks thrown when the exit slams
    sparkSpeed: 8,
    sparkSize: 0.08,
    sparkLifetime: 0.6,
    sparkGlow: 3.0,
    colorSparkA: '#ffffff',
    colorSparkB: '#d8b0ff',
    colorSparkC: '#8a40ff',
    colorSparkD: '#2a0a50',

    /* ================================================================ */
    /* 6 · THE CLOSING PULSE                                             */
    /* ================================================================ */
    knockRadius: 3.2, // metres round the exit that get thrown
    knockImpulse: 9, // metres/second, outward from the exit
    knockLift: 3.0,
    knockSpin: 1.2,
    burstRadius: 3.0, // the AIR shell, metres
    burstLife: 0.45,
    burstIntensity: 1.8,
    colorBurstA: '#ffffff',
    colorBurstB: '#b070ff',
    colorBurstC: '#3a1070',
    ringRadius: 3.6,
    ringLife: 0.6,
    colorRingA: '#9a50ff',
    colorRingB: '#f0d8ff',
    entryShake: 0.18,
    exitShake: 0.45,
    closeShake: 0.6,
    closeFlash: 0.4,
    colorFlash: '#c890ff',

    /* --- light --- */
    lightColor: '#aa60ff',
    lightIntensity: 6,
    lightRadius: 9,
    lightBoost: 3 // the closing punch, × intensity
  }
};
