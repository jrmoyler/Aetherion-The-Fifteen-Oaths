/**
 * Rune Meteor — Arcane — a crystal star wrapped in rune-stone petals falls
 * straight down into the circle, unfolds into a ring of standing stones, and
 * detonates from the middle of its own henge.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `RuneMeteorAbility`: the
 * stones are instanced and re-placed every frame, the sigil and the rune bands
 * are drawn from uniforms, so sizes, counts and times all move a cast in
 * progress.
 */
export default {
  id: 'runemeteor',
  meta: {
    label: 'Rune Meteor',
    accent: '#b7c3ff',
    key: '',
    element: 'arcane',
    hint: 'Arcane — a rune-wrapped star drops into the circle, unfolds into a ring of standing stones, and detonates',
    cast: 'zone',
    glyph: `<path d="M50 6V30"/><path d="M50 30L58 40L50 50L42 40Z"/><circle cx="50" cy="66" r="26"/><path d="M50 40V92M24 66H76"/><path d="M28 50L34 44M72 50L66 44M28 82L34 88M72 82L66 88"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // metres/second the sigil's call runs out to the circle
    lifetime: 1.1, // seconds the henge takes to crumble after the nova
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.2, // the circle, metres
    frameHeight: 2.4, // m: the camera frames the star no higher than this
    cameraHold: 1, // 0..1 the cast keeps the camera's pitch (the rig would ratchet it top-down)
    cameraSettle: 2, // s the hold outlasts the cast while the frame eases home

    /* --- light --- */
    lightColor: '#d8deff',
    lightIntensity: 8,
    lightRadius: 11,
    lightFlicker: 0.2,

    /* ================================================================ */
    /* 1 · THE FALL                                                      */
    /* ================================================================ */
    dropHeight: 5.5, // metres above the circle the star kindles (in frame at 8 m)
    fallTime: 1.15, // seconds from kindling to landing (at least the travel)
    fallCurve: 2.2, // >1: hangs, then plummets
    orbRadius: 0.75, // the crystal star, metres
    orbSpin: 2.4, // radians/second
    trailLength: 4.5, // metres of light column above it as it falls
    trailWidth: 0.55,
    trailGlow: 1.4,

    /* ================================================================ */
    /* 2 · THE CRYSTAL                                                   */
    /* ================================================================ */
    coreGlow: 3, // the star's inner light
    facetGlow: 1.6, // the cut facets catching it
    rimGlow: 3, // the fresnel rim
    swirlScale: 2.5, // the arcane swirl inside it
    swirlSpeed: 1.6,
    colorCore: '#ffffff',
    colorCrystal: '#9fb0ff',
    colorDeep: '#3a3d9a',
    colorRim: '#e8ecff',

    /* ================================================================ */
    /* 3 · THE STONES — rune-stone petals that become a henge           */
    /* ================================================================ */
    stones: 7, // petals round the star (up to 10)
    stoneHeight: 2.2, // standing, metres
    stoneWidth: 0.95,
    stoneDepth: 0.38,
    budScale: 0.42, // × their standing size while wrapped round the star
    budRadius: 0.75, // metres from the star's centre while wrapped
    ringRadius: 0.82, // × the circle: where they plant
    plantDepth: 0.35, // metres they bury themselves on landing
    unfoldTime: 0.55, // seconds from bursting open to planted
    unfoldStagger: 0.16, // seconds between the first and last landing
    arcHeight: 3.2, // metres they arc up on the way out
    tumble: 2.2, // extra turns they tumble on the way
    glyphGlow: 1.7, // their carved runes
    glyphScale: 5, // rune cells per metre
    stoneRim: 0.55, // an arcane rim round each stone
    crumbleEdge: 0.08, // the crumbling edge
    colorStone: '#3b3f52',
    colorStoneLight: '#6d728c',
    colorGlyph: '#7f8cff',
    colorGlyphHot: '#fff6d8',

    /* ================================================================ */
    /* 4 · THE BANDS — runes wound round the star                        */
    /* ================================================================ */
    bandRadius: 1.05, // round the star, metres
    bandWidth: 0.22,
    bandSpin: 3.2, // radians/second
    bandGlow: 2.8,
    bandHoverRadius: 1.7, // they open out to this round the hovering star
    colorBand: '#c8d0ff',

    /* ================================================================ */
    /* 5 · THE HENGE — the star hovers, the stones charge                */
    /* ================================================================ */
    hoverHeight: 2.3, // metres the star rises to in the middle of its henge
    chargeTime: 0.75, // seconds the henge charges before the nova
    tetherWidth: 0.09, // beams from the star to each stone
    tetherGlow: 2,
    chaseRate: 6, // stones lit per second in the chase round the ring
    colorTether: '#8f9cff',

    /* ================================================================ */
    /* 6 · THE SIGIL — on the floor                                      */
    /* ================================================================ */
    sigilWidth: 0.55, // the glyph band, metres
    sigilGlow: 1.8,
    starGlow: 1.6, // the star polygon joining the stones
    floorOpacity: 0.9,

    /* --- 6b · the ground: the star's shadow, then the crater --- */
    groundOpacity: 0.95,
    groundShadow: 1, // how dark the circle gathers under the falling star
    crackCount: 9, // fissures out of the bowl
    crackReach: 2.1, // × craterRadius they run
    crackCool: 1.1, // seconds a fissure takes to cool
    colorGroundDeep: '#080920', // deep stop
    colorGroundBody: '#2b2f5c', // the lip
    colorCrackHot: '#9aa8ff', // fissure glow
    colorSigil: '#a8b6ff',
    colorSigilHot: '#fff6d8',

    /* ================================================================ */
    /* 7 · PARTICLES                                                     */
    /* ================================================================ */
    moteRate: 90, // arcane motes/second swirling round the star
    moteSize: 0.07,
    moteLife: 1.2,
    moteGlow: 2.6,
    colorMoteA: '#ffffff',
    colorMoteB: '#d4dbff',
    colorMoteC: '#8c9cff',
    colorMoteD: '#2a2c70',
    sparkCount: 160, // sparks on landing and on the nova
    sparkSpeed: 11,
    sparkSize: 0.035,
    sparkLife: 0.55,
    sparkGlow: 3,
    colorSparkA: '#ffffff',
    colorSparkB: '#e0e6ff',
    colorSparkC: '#9fb0ff',
    colorSparkD: '#30307a',
    dustCount: 30,
    dustSize: 0.8,
    dustLife: 1.4,
    dustOpacity: 0.42,
    colorDustA: '#7d84b8',
    colorDustB: '#5d6290',
    colorDustC: '#2f3258',
    colorDustD: '#11132a',
    chipCount: 14, // stone chips off each crumbling stone
    chipSize: 0.14,
    chipLife: 1.3,
    colorChipA: '#7a7f9a',
    colorChipB: '#5a5e76',
    colorChipC: '#3b3f52',
    colorChipD: '#20222e',

    /* ================================================================ */
    /* 8 · THE IMPACTS                                                   */
    /* ================================================================ */
    landRadius: 1.6, // bodies this close to where it lands are thrown
    landShake: 0.55,
    landFlash: 0.2,
    craterRadius: 2.2,
    novaSize: 6, // the nova's shell, metres
    novaIntensity: 1.2,
    novaShake: 0.8,
    novaFlash: 0.32,
    novaLight: 4,
    shockRadius: 9,
    ringWarp: 1.2,
    colorBurstA: '#f4f6ff',
    colorBurstB: '#7f8cff',
    colorBurstC: '#1d1e5e',
    colorShock: '#8f9cff',
    colorCrackA: '#8c9cff',
    colorCrackB: '#fff6d8',
    colorFlash: '#aab6ff',

    /* ================================================================ */
    /* 9 · THE HIT                                                       */
    /* ================================================================ */
    landImpulse: 5,
    landLift: 6,
    novaImpulse: 13,
    novaLift: 5,
    hitSpin: 2.5
  }
};
