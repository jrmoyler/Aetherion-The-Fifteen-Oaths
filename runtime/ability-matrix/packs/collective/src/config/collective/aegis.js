/**
 * Aegis Bulwark — Shield — a hex-lattice dome that throws back what it touches.
 *
 * Collective Originals data block: presentation (`meta`) and the live settings
 * the ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 */
export default {
  id: 'aegis',
  meta: {
    label: "Aegis Bulwark",
    accent: '#6fd8ff',
    key: 'K',
    hint: "Shield — a hex-lattice dome that throws back what it touches",
    cast: 'zone',
    glyph: `<path d="M50 12L82 26V52C82 70 68 82 50 90C32 82 18 70 18 52V26Z"/><path d="M50 34l12 7v14l-12 7l-12-7V41Z"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 16.0, // maximum cast distance, metres
    minRange: 0.0, // 0 so the dome can be dropped on the caster
    speed: 30.0, // how fast the anchor races out to the target, metres/second
    lifetime: 4.5, // seconds the dome stands
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 3.2, // radius of the dome, metres — what the indicator measures
    dissolveTime: 1.2, // seconds it takes to come apart cell by cell

    /* --- what the dome does to bodies --- */
    repel: 1.0, // 0..1 — whether it keeps throwing out anything that steps in
    /** How a body inside is thrown. Same shape as `settings.dummies.hit`. */
    hit: { impulse: 7.5, lift: 4.2, spin: 1.6 },

    /* ================================================================ */
    /* 1 · DOME — the lattice                                            */
    /* ================================================================ */

    /* --- the shape and the slam --- */
    heightScale: 0.82, // dome height, × its radius (1 = a true hemisphere)
    riseTime: 0.32, // seconds from the floor to full height
    riseOvershoot: 0.12, // how far past full height the slam carries
    wobble: 0.06, // metres of pressure wobble on the slam
    wobbleDecay: 4.0, // how fast it settles, per second
    wobbleFreq: 7.0, // ripples of it up the wall

    /* --- the lattice --- */
    cellsAround: 18, // hex cells round the circumference (whole number)
    cellRows: 6.5, // hex cell rows from the floor to the crown
    edgeWidth: 0.07, // width of the bright seams, fraction of a cell
    edgeBright: 2.4, // seam brightness
    cellFill: 0.14, // how much light fills a cell's face
    cellVariance: 0.55, // per-cell brightness dice, 0..1
    crown: 0.86, // height (0..1) above which the lattice melts into one plate
    pulseSpeed: 1.4, // cells breathe at this rate
    pulseDepth: 0.35, // ...and this much

    /* --- forming: cells light up from the floor --- */
    formTime: 0.65, // seconds for the wave to reach the crown
    formJitter: 0.18, // per-cell lag, fraction of the climb
    formFlash: 3.0, // how bright a cell flares as it lights

    /* --- surface --- */
    fresnelPower: 2.6,
    fresnelBright: 1.3,
    backFace: 0.45, // brightness of the far wall seen through the near one
    scanCount: 2.0, // scan lines on the dome at once
    scanSpeed: 0.45, // dome-heights per second they climb
    scanWidth: 0.035,
    scanBright: 1.8,
    intensity: 1.6, // emissive multiplier — bloom picks this up
    opacity: 1.0,
    softFade: 0.35, // metres it feathers out where it meets the floor

    /* --- where it is struck --- */
    impactRate: 0.8, // stray hits per second while it stands
    impactSpeed: 1.7, // radians per second the ripple runs across the dome
    impactWidth: 0.12, // radians
    impactLife: 0.9, // seconds
    impactBright: 3.2,
    impactRings: 2.0, // rings in one ripple

    /* --- dissolve --- */
    dissolveEdge: 0.12, // fraction of cells burning at the edge of the dissolve
    dissolveGlow: 4.0, // how bright they burn on the way out

    colorEdge: '#bff4ff',
    colorCell: '#2fa8ff',
    colorRim: '#6fd8ff',
    colorScan: '#e6fbff',
    colorImpact: '#ffffff',
    colorForm: '#ffffff',

    /* ================================================================ */
    /* 2 · SIGIL — the ring on the floor                                 */
    /* ================================================================ */
    sigilScale: 1.12, // outer radius, × the dome's
    sigilBand: 0.2, // width of the rune band, × the dome's radius
    sigilRunes: 14, // runes around the band (whole number)
    sigilRuneSize: 0.75, // how much of its cell a rune fills
    sigilLine: 0.03, // stroke width, metres
    sigilSpin: 0.25, // radians per second the rune band turns
    sigilInnerSpin: -0.4, // and the inner star, the other way
    sigilStar: 1.0, // 0..1 — the hexagram inside
    sigilGlow: 2.2, // emissive multiplier
    sigilOpacity: 0.9,
    sigilFlicker: 0.25, // runes catching and dropping, 0..1
    colorSigil: '#6fd8ff',
    colorSigilHot: '#e6fbff',

    /* ================================================================ */
    /* 3 · MOTES — energy rising inside                                  */
    /* ================================================================ */
    moteRate: 60, // per second while the dome stands
    moteSize: 0.12,
    moteLife: 1.5,
    moteSpeed: 0.9,
    moteRise: 1.2,
    moteGlow: 2.6,
    moteTurbulence: 0.8,
    travelMotes: 120, // per second off the anchor as it races out
    dissolveMotes: 4, // per cell-ish when it comes apart, × 40 per second
    colorMoteA: '#ffffff',
    colorMoteB: '#bff4ff',
    colorMoteC: '#2fa8ff',
    colorMoteD: '#0a1a40',

    /* ================================================================ */
    /* 4 · SLAM — what happens when it goes up                           */
    /* ================================================================ */
    slamBurst: 1.25, // AIR shell end radius, × the dome's
    slamBurstLife: 0.45,
    slamBurstIntensity: 1.4,
    colorBurstA: '#ffffff',
    colorBurstB: '#6fd8ff',
    colorBurstC: '#1a4aa0',
    shockRadius: 1.8, // SHOCKWAVE decal, × the dome's radius
    shockLife: 0.6,
    colorShockA: '#e6fbff',
    colorShockB: '#2fa8ff',
    dustRadius: 1.4, // DUSTRING decal, × the dome's radius
    dustLife: 1.1,
    colorDustA: '#c9dce6',
    colorDustB: '#7a8c99',
    slamSparks: 80,
    slamShake: 0.4,
    slamFlash: 0.22,
    colorFlash: '#bff4ff',

    /* --- the light --- */
    lightColor: '#6fd8ff',
    lightIntensity: 6.0,
    lightRadius: 9.0,
    lightHeight: 1.6, // metres above the floor it stands at
    slamLight: 18.0, // light punch on the slam
    lightHum: 0.2 // 0..1 how much the light hums with the cells
  }
};
