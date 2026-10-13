/**
 * Prism Refractor — Projectile — a charged lance strikes a spinning prism and splits into three timed paths.
 *
 * Ability Atlas data block, rebuilt for the sandbox engine. Plain data, no
 * imports, so `settings.js` can pull it in without a cycle.
 */
export default {
  id: 'refractor',
  meta: {
    label: "Prism Refractor",
    accent: '#a3f6ff',
    key: '',
    hint: "Projectile — a charged lance strikes a prism at the end of the line, which refracts it into three timed beams that seek the nearest bodies",
    cast: 'line',
    glyph: `<path d="M12 50H40"/><path d="M40 34L58 50L40 66Z"/><path d="M58 50L88 26M58 50H88M58 50L88 74"/><circle cx="88" cy="26" r="4"/><circle cx="88" cy="50" r="4"/><circle cx="88" cy="74" r="4"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18.0, // maximum cast distance, metres
    minRange: 3.0, // closer than this and the cast is refused
    speed: 34.0, // how fast the lance flies, metres/second
    lifetime: 0.6, // seconds the prism holds after the last beam lands
    fadeTime: 1.1, // seconds the cracked prism and the sigils take to go
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- where the lance is drawn and charged --- */
    handForward: 0.6, // metres in front of the caster
    handSide: 0.2, // metres to the caster's right
    handHeight: 1.4, // metres off the floor
    chargeTime: 0.32, // seconds the lance builds in the hand before it flies

    /* ================================================================ */
    /* THE SPLIT                                                         */
    /* ================================================================ */
    beamCount: 3, // refracted beams (capped at 3)
    splitDelay: 0.12, // seconds from the lance striking to the first beam
    beamStagger: 0.2, // seconds between one beam and the next
    beamRange: 10.0, // a beam prefers a live body within this of the prism, metres
    fanAngle: 0.62, // with no body: the beams fan this far either side, radians
    fanReach: 6.5, // ...and land this far from the prism, metres
    aimHeight: 0.55, // where on a body a beam lands, × dummy height
    impactRadius: 1.0, // a landing kills any body this close to it, metres
    /** How a struck body flies. Same shape as `settings.dummies.hit`. */
    hit: { impulse: 6.0, lift: 4.6, spin: 1.6 },

    /* ================================================================ */
    /* 1 · LANCE — the charged projectile                                */
    /* ================================================================ */
    lanceLength: 2.4, // in flight, metres
    lanceChargeLength: 0.7, // in the hand at full charge, metres
    lanceWidth: 0.16, // half-width of the glow, metres
    lanceCore: 0.22, // white core, × width
    lanceIntensity: 4.5,
    lanceRings: 6, // charge rings along the shaft
    lanceRingSpeed: 9.0, // how fast the rings run toward the head
    lanceCrackle: 0.4, // 0..1 noise on the glow
    lanceFlicker: 0.25,
    colorLanceCore: '#ffffff',
    colorLanceGlow: '#a3f6ff',
    colorLanceEdge: '#3f6dff',

    /* ================================================================ */
    /* 2 · PRISM — the crystal                                           */
    /* ================================================================ */
    prismSides: 3, // 3 is a true prism; more is a crystal column
    prismRadius: 0.55, // metres
    prismHeight: 1.5, // the faceted body, metres
    prismCap: 0.45, // the points top and bottom, metres
    prismHover: 1.7, // the centre's height off the floor, metres
    prismLead: 0.35, // the prism starts to form this many seconds before the lance arrives
    formTime: 0.4, // seconds the materialise scan takes
    prismSpin: 0.35, // turns/second idle
    prismSpinStruck: 1.6, // turns/second after the lance hits
    prismBob: 0.08, // metres
    prismTilt: 0.12, // radians
    glassOpacity: 0.35,
    fresnel: 2.2,
    fresnelPower: 2.6,
    envIntensity: 1.0,
    innerBands: 3.0, // caustic bands inside the crystal
    bandSpeed: 1.2,
    edgeGlow: 2.4, // facet edges
    chargeGlow: 6.0, // the flood when the lance hits
    crackScale: 3.6, // crack cells per metre
    crackWidth: 0.05,
    crackGlow: 5.0,
    colorGlass: '#bff8ff',
    colorGlassDeep: '#14324a',
    colorGlassEdge: '#e6fdff',
    colorCrack: '#ffffff',

    /* ================================================================ */
    /* 3 · BEAMS — the three refracted paths                             */
    /* ================================================================ */
    beamWidth: 0.2, // half-width of the glow, metres
    beamCore: 0.18, // white core, × width
    beamIntensity: 5.0,
    beamGrow: 0.08, // seconds a beam takes to reach its target
    beamHold: 0.32, // seconds it holds at full
    beamPinch: 0.22, // seconds it takes to pinch out
    beamPackets: 5, // photon packets riding the beam per metre
    beamPacketSpeed: 22, // metres/second
    beamBands: 0.4, // refraction bands along the beam
    beamFlicker: 0.2,
    colorBeamCore: '#ffffff',
    colorBeamA: '#7ff3ff', // first beam
    colorBeamB: '#c9b6ff', // second beam
    colorBeamC: '#8fffcf', // third beam

    /* ================================================================ */
    /* 4 · IMPACT SIGILS + SHOCK RINGS                                   */
    /* ================================================================ */
    sigilSize: 1.6, // half-size, metres
    sigilLife: 2.2, // seconds a mark stays
    sigilLine: 0.03,
    sigilIntensity: 2.6,
    sigilSpin: 0.6, // radians/second
    ringSpeed: 6.0, // shock ring, metres/second
    ringLife: 0.45, // seconds
    ringWidth: 0.12, // × sigil size
    colorSigil: '#9ff4ff',
    colorSigilHot: '#ffffff',
    shockRadius: 2.8, // SHOCKWAVE decal per landing, metres
    scorchRadius: 0.9, // SCORCH decal per landing, metres
    scorchLife: 2.4,
    impactBurst: 1.5, // AIR shell per landing, metres
    colorBurstA: '#ffffff',
    colorBurstB: '#a3f6ff',
    colorBurstC: '#4c63ff',
    colorScorch: '#13202a',

    /* ================================================================ */
    /* 5 · PARTICLES                                                     */
    /* ================================================================ */
    chargeMotes: 140, // drawn into the lance while it charges, per second
    lanceMotes: 120, // shed in flight, per second
    moteSize: 0.12,
    moteLife: 0.45,
    moteGlow: 2.0,
    colorMoteA: '#ffffff',
    colorMoteB: '#a3f6ff',
    colorMoteC: '#5a7bff',
    colorMoteD: '#120a30',
    impactSparks: 80, // per landing
    sparkSpeed: 10,
    sparkSize: 0.045,
    sparkLife: 0.42,
    sparkGravity: -11,
    sparkGlow: 2.6,
    shardCount: 60, // crystal shards when the prism goes
    shardSize: 0.09,
    shardSpeed: 5.5,
    shardLife: 1.0,
    shardGlow: 2.2,

    /* ================================================================ */
    /* 6 · HEAT WARP                                                     */
    /* ================================================================ */
    warpWidth: 0.45, // half-width of the lance's wake, metres
    warpLength: 3.4, // length of the wake, metres
    warpStrength: 0.7,
    warpPrism: 0.6, // round the prism when it is struck
    warpScale: 3.5,
    warpSpeed: 5.0,

    /* ================================================================ */
    /* 7 · LIGHT & FEEDBACK                                              */
    /* ================================================================ */
    lightColor: '#a3f6ff',
    lightIntensity: 6,
    lightRadius: 10,
    strikeLight: 30, // light punch when the lance hits the prism
    beamLight: 14, // light punch per landing
    strikeShake: 0.3,
    strikeFlash: 0.3,
    beamShake: 0.18,
    beamFlash: 0.16,
    shatterShake: 0.1,
    castShake: 0.04,
    colorFlash: '#d2fbff'
  }
};
