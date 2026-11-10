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
    edgeWidth: 0.06, // width of the bright seams, fraction of a cell
    edgeBright: 0.62, // seam brightness
    seamCore: 0.35, // the white-hot centre line of a seam, fraction of its width
    cellFill: 0.08, // how much light fills a cell's face
    cellVariance: 0.55, // per-cell brightness dice, 0..1
    crown: 0.86, // height (0..1) above which the lattice melts into one plate
    pulseSpeed: 1.4, // cells breathe at this rate
    pulseDepth: 0.35, // ...and this much

    /* --- the body: deep glass the light sits in (four-stop ramp) --- */
    bodyOpacity: 0.88, // how much the deep body occludes what is behind it
    bodyGrad: 1.3, // how fast the body climbs from deep to saturated toward the rim

    /* --- standing life: what the lattice does after the slam --- */
    latticeSpin: 0.035, // turns per second the cells slide round the dome
    sweepSpeed: 0.42, // turns per second the radar arm of lit cells runs round
    sweepWidth: 0.06, // its comet tail, in turns
    sweepBright: 1.1,
    beatPeriod: 0.62, // seconds between heartbeat bands climbing the wall
    beatWidth: 0.09, // band height, fraction of the dome
    beatBright: 1.1,
    breath: 0.025, // the dome swells this much (× radius) on each beat
    sparkRate: 2.2, // ticks per second of the cells' own clocks
    sparkChance: 0.07, // fraction of cells that flare on a tick
    sparkBright: 2.2,

    /* --- forming: cells light up from the floor --- */
    formTime: 0.65, // seconds for the wave to reach the crown
    formJitter: 0.18, // per-cell lag, fraction of the climb
    formFlash: 1.1, // how bright a cell flares as it lights

    /* --- surface --- */
    fresnelPower: 2.6,
    fresnelBright: 0.8,
    backFace: 0.35, // brightness of the far wall seen through the near one
    scanCount: 2.0, // scan lines on the dome at once
    scanSpeed: 0.45, // dome-heights per second they climb
    scanWidth: 0.035,
    scanBright: 1.4,
    intensity: 0.72, // emissive multiplier — bloom picks this up
    opacity: 1.0,
    softFade: 0.35, // metres it feathers out where it meets the floor

    /* --- where it is struck --- */
    impactRate: 2.4, // stray hits per second while it stands
    impactSpeed: 1.7, // radians per second the ripple runs across the dome
    impactWidth: 0.12, // radians
    impactLife: 0.9, // seconds
    impactBright: 2.6,
    impactRings: 2.0, // rings in one ripple

    /* --- dissolve --- */
    dissolveEdge: 0.12, // fraction of cells burning at the edge of the dissolve
    dissolveGlow: 4.0, // how bright they burn on the way out

    colorCore: '#e8fbff', // white-hot: seam centre lines, impact hot spots
    colorEdge: '#2a86f0', // saturated: the seams at rest
    colorCell: '#2a8cff', // saturated: lit cell faces, sweep, heartbeat
    colorBody: '#0c3a96', // saturated body of the glass toward the rim
    colorDeep: '#030c26', // dark deep: the glass facing the eye
    colorRim: '#2f8cff',
    colorScan: '#7fd4ff', // pale tint: scan lines and the heads of the sweep
    colorImpact: '#bfeeff',
    colorForm: '#7fd4ff',

    /* ================================================================ */
    /* 2 · SIGIL — the ring on the floor                                 */
    /* ================================================================ */
    sigilScale: 1.12, // outer radius, × the dome's
    sigilBand: 0.2, // width of the rune band, × the dome's radius
    sigilRunes: 14, // runes around the band (whole number)
    sigilRuneSize: 0.75, // how much of its cell a rune fills
    sigilLine: 0.05, // stroke width, metres
    sigilSpin: 0.25, // radians per second the rune band turns
    sigilInnerSpin: -0.4, // and the inner star, the other way
    sigilStar: 1.0, // 0..1 — the hexagram inside
    sigilGlow: 1.3, // emissive multiplier
    sigilOpacity: 0.9,
    sigilFlicker: 0.25, // runes catching and dropping, 0..1
    colorSigil: '#2f9cff',
    colorSigilHot: '#bff0ff',

    /* --- the field inside the sigil --- */
    floorFill: 0.72, // opacity of the deep floor field
    floorHexSize: 0.16, // floor hex cell, × the dome's radius
    floorHexBright: 0.55,
    floorContact: 1.2, // the hot foot where the wall meets the floor
    floorRingBright: 1.3, // ripple running out across the field on each beat
    colorFloorDeep: '#020818',
    colorFloorBody: '#0b2e78',

    /* ================================================================ */
    /* 3 · MOTES — energy rising inside                                  */
    /* ================================================================ */
    moteRate: 80, // per second while the dome stands
    moteSize: 0.12,
    moteLife: 1.5,
    moteSpeed: 0.9,
    moteRise: 1.2,
    moteGlow: 2.6,
    moteTurbulence: 0.8,
    travelMotes: 220, // per second off the anchor as it races out
    dissolveMotes: 4, // per cell-ish when it comes apart, × 40 per second
    colorMoteA: '#d8f6ff',
    colorMoteB: '#5cc8ff',
    colorMoteC: '#1e78e6',
    colorMoteD: '#030c26',

    /* --- sparks skimming up the wall, and shards of the lattice --- */
    sparkCrawl: 50, // per second, skimming up the wall while it stands
    sparkSpeed: 3.2,
    sparkSize: 0.1,
    sparkLife: 0.45,
    sparkGlow: 2.8,
    slamStreaks: 70, // shot up the wall on the slam
    impactSparks: 10, // spat off each ripple
    beatSparks: 18, // off the foot on each heartbeat
    colorSparkA: '#e8fbff',
    colorSparkB: '#5cc8ff',
    colorSparkC: '#1e78e6',
    colorSparkD: '#061a48',
    slamShards: 36, // plates of glass kicked off the rim on the slam
    dissolveShards: 14, // per second, falling off as it comes apart
    shardSize: 0.2,
    shardSpeed: 4.0,
    shardLife: 1.1,
    shardGravity: -9.0,
    colorShardA: '#9fe6ff',
    colorShardB: '#2f86e6',
    colorShardC: '#0d2f7a',
    colorShardD: '#030c26',

    /* ================================================================ */
    /* 4 · SLAM — what happens when it goes up                           */
    /* ================================================================ */
    slamBurst: 1.25, // AIR shell end radius, × the dome's
    slamBurstLife: 0.45,
    slamBurstIntensity: 1.0,
    colorBurstA: '#9fe2ff',
    colorBurstB: '#1e78e6',
    colorBurstC: '#06205a',
    shockRadius: 1.8, // SHOCKWAVE decal, × the dome's radius
    shockLife: 0.6,
    colorShockA: '#7fd4ff',
    colorShockB: '#1450c0',
    dustRadius: 1.4, // DUSTRING decal, × the dome's radius
    dustLife: 1.1,
    colorDustA: '#c9dce6',
    colorDustB: '#7a8c99',
    slamSparks: 80,
    slamShake: 0.4,
    slamFlash: 0.12,
    colorFlash: '#2f86e6',

    /* --- the light --- */
    lightColor: '#3a9cff',
    lightIntensity: 6.0,
    lightRadius: 9.0,
    lightHeight: 1.6, // metres above the floor it stands at
    slamLight: 18.0, // light punch on the slam
    lightHum: 0.2 // 0..1 how much the light hums with the cells
  }
};
