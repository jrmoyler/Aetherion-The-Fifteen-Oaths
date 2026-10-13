/**
 * Basalt Columns — Earth — the floor cracks into a honeycomb and hexagonal
 * basalt columns punch up out of it in a ripple from the centre outward.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * A column record holds only dice (a height roll, a timing roll, a tilt). Its
 * place is the hex grid; every metre, second and colour below is resolved
 * from this block every frame, so dragging `heightMax` re-raises columns that
 * are already standing and dragging `cellSize` re-cuts the honeycomb live.
 */
export default {
  id: 'basalt',
  meta: {
    label: "Basalt Columns",
    accent: '#ff7a3d',
    key: '',
    element: 'earth',
    hint: "Earth — the floor cracks into a magma honeycomb and hexagonal basalt columns punch up out of it, hurling bodies skyward",
    cast: 'zone',
    glyph: `<path d="M50 18L62 25V39L50 46L38 39V25Z"/><path d="M30 44L42 51V75L30 82L18 75V51Z"/><path d="M70 40L82 47V77L70 84L58 77V47Z"/><path d="M50 54L58 59V86M42 86V59L50 54"/><path d="M14 88H86"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 16, // maximum cast distance, metres
    minRange: 0, // closer than this and the cast is refused
    speed: 22, // metres/second the fissure runs from the caster to the circle
    lifetime: 1.1, // seconds the columns stand at full height before they sink
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4, // metres — the circle the honeycomb cracks inside

    /* --- light --- */
    lightColor: '#ff7a3d',
    lightIntensity: 6, // the magma's steady glow
    lightRadius: 8,
    lightHeight: 1.1, // metres over the circle the light sits once it has landed
    impactLight: 16, // added to the light when the first columns break the floor

    /* --- accent pair (the travelling fissure's embers) --- */
    colorA: '#ff7a3d',
    colorB: '#ffd27a',

    /* ================================================================ */
    /* TIMING                                                            */
    /* ================================================================ */
    crackTime: 0.55, // seconds for the crack front to reach the rim
    riseLead: 0.75, // fraction of the crack time before the first column moves
    rippleTime: 0.6, // seconds the rise ripples from the centre to the rim
    riseTime: 0.24, // seconds one column takes to punch up to full height
    riseJitter: 0.12, // seconds of random lag per column (× global randomness)
    overshoot: 0.35, // 0 = stops dead, 1 = big spring past its height
    sinkSpread: 0.55, // seconds over which the columns start to sink
    sinkOrder: 0.45, // 0 = sink in the same ripple, 1 = in random order
    sinkTime: 0.7, // seconds one column takes to sink back under the floor
    sinkShudder: 0.04, // metres a column shudders as it starts to sink
    coolTime: 0.9, // seconds after the last column is down for the seams to go black

    /* ================================================================ */
    /* 1 · THE COLUMNS                                                   */
    /* ================================================================ */

    /* --- the grid (re-cuts live) --- */
    cellSize: 0.55, // hexagon circumradius, metres — also the floor's honeycomb
    columnGap: 0.05, // metres of open seam between two neighbours
    rimMargin: 0.4, // × cell size kept clear inside the rim
    /* --- heights --- */
    heightMin: 0.5, // metres, the shortest column
    heightMax: 2.6, // metres, the tallest column
    heightFalloff: 0.55, // 0 = flat field, 1 = tall in the middle, short at the rim
    heightSteps: 0.0, // 0 = smooth, 1 = heights quantised to stepped terraces
    tiltMax: 0.05, // radians a column leans off true
    columnDepth: 0.6, // metres the shaft reaches below the floor at full height
    topBevel: 0.12, // chamfer inset round the cap, × circumradius
    bevelDrop: 0.06, // metres the chamfer drops

    /* --- the rock --- */
    colorRock: '#17151a',
    colorRockLight: '#4a4248',
    colorStrata: '#2c2428',
    strataScale: 2.6, // beds per metre down the shaft
    strataWarp: 0.35, // how much the beds wander
    strataContrast: 0.6,
    rockNoise: 2.2, // features per metre in the rock
    rockBump: 0.55, // fake bump from the rock noise
    rockDiffuse: 0.9,
    rockAmbient: 0.22,
    rockSpecular: 0.35,
    rockGloss: 28,
    rockEnv: 0.35, // the sky in the grazing faces
    edgeWear: 0.45, // pale chipped arrises and chamfer
    capCracks: 0.7, // fractures across the cap
    capCrackScale: 2.4, // fracture cells per circumradius

    /* --- the heat --- */
    colorHotA: '#fff0b0', // white-hot
    colorHotB: '#ff7a1e', // orange
    colorHotC: '#8a1606', // deep red
    colorCold: '#040303', // what it cools to
    undersideGlow: 2.6, // how hot the freshly extruded foot of a column is
    undersideHeight: 0.4, // metres the glow reaches up a column
    emberSpeckle: 0.7, // hot pinholes in the rock
    glowPulse: 0.22, // throb of the heat
    punchGlow: 2.2, // the flash a column gives as it breaks the surface
    columnCool: 1.4, // seconds a risen column takes to cool to its hold heat
    holdHeat: 0.45, // how hot a column stays while it stands

    /* ================================================================ */
    /* 2 · THE HONEYCOMB FLOOR                                           */
    /* ================================================================ */
    colorPlate: '#0d0a0a',
    groundDark: 0.82, // opacity of the scorched plates
    seamWidth: 0.06, // metres, the magma line between plates
    seamSoftness: 0.09, // metres the seam's bloom spreads into a plate
    seamGlow: 4.5,
    seamFlicker: 0.3,
    seamOpen: 1.0, // how much wider the seams gape while the columns are up
    fineCracks: 0.55, // secondary fractures inside each plate
    fineCrackScale: 2.2, // fracture cells per metre
    frontSoftness: 0.55, // metres, how soft the crack front is
    frontNoise: 0.5, // metres the front wanders
    rimRagged: 0.45, // metres the edge of the circle wanders
    rimSoftness: 0.5,
    scorchMargin: 0.8, // metres of darkened floor past the rim
    groundFade: 0.6, // seconds the floor erodes away over, at the very end

    /* --- heat shimmer (LAYER.DISTORTION) --- */
    heatShimmer: 0.55,
    shimmerHeight: 2.4, // metres
    shimmerScale: 1.5,
    shimmerSpeed: 1.6,

    /* ================================================================ */
    /* 3 · THE BODIES                                                    */
    /* ================================================================ */
    hitRadius: 0.95, // × cell size — how much of a column's top counts as standing on it
    launchAt: 0.12, // fraction of a column's rise at which what stands on it is thrown
    liftBase: 6.5, // m/s straight up, whatever the column
    liftPerMetre: 3.4, // m/s more per metre of the column's height
    hitImpulse: 1.6, // m/s outward from the centre of the circle
    hitSpin: 1.6,
    corpseLift: 0.8, // × the lift for a body already lying there

    /* ================================================================ */
    /* 4 · DEBRIS                                                        */
    /* ================================================================ */

    /* --- rock chips (CHIP, lit) --- */
    chipCount: 6, // per column as it breaks the floor
    chipSpeed: 6.5,
    chipSize: 0.08,
    chipLifetime: 1.2,
    chipGravity: -14,
    colorChipA: '#5a4c48',
    colorChipB: '#3a3034',
    colorChipC: '#2a2226',
    colorChipD: '#141012',

    /* --- dust (SMOKE) --- */
    dustCount: 2, // per column as it rises
    sinkDust: 2, // per column as it sinks
    dustSize: 0.6,
    dustSpeed: 1.5,
    dustLifetime: 1.7,
    dustOpacity: 0.4,
    colorDustA: '#6a5a50',
    colorDustB: '#4a3e38',
    colorDustC: '#3a302c',
    colorDustD: '#201a18',

    /* --- embers (SOFT, additive) --- */
    emberRate: 90, // per second off the open seams, scaled by their heat
    emberSize: 0.05,
    emberRise: 2.2, // m/s
    emberLifetime: 1.3,
    emberGlow: 3.2,
    colorEmberA: '#fff2c0',
    colorEmberB: '#ffb040',
    colorEmberC: '#ff5a10',
    colorEmberD: '#400800',

    /* --- sparks (STREAK, additive) --- */
    sparkCount: 3, // per column as it breaks the floor
    sparkSpeed: 9,
    sparkSize: 0.05,
    sparkLifetime: 0.35,
    sparkStretch: 0.35,

    /* ================================================================ */
    /* 5 · THE BEAT                                                      */
    /* ================================================================ */
    crackRumble: 0.06, // shake while the floor cracks
    riseShake: 0.32, // the jolt of the first wave
    riseRumble: 0.16, // rumble while columns are moving, × the share moving
    sinkRumble: 0.09,
    impactFlash: 0.1,
    colorFlash: '#ff9a4a',
    burstRadius: 2.4, // EARTH burst at the centre, metres
    burstLife: 0.75,
    colorBurstA: '#ffb060',
    colorBurstB: '#5a4038',
    colorBurstC: '#2a201c',
    shockRadius: 5.5, // SHOCKWAVE decal, metres
    shockLife: 0.55,
    colorShockA: '#ff8a3a',
    colorShockB: '#ffe0a0',
    dustRingRadius: 5.2, // DUSTRING decal, metres
    dustRingLife: 1.5,

    /* --- the fissure (travel) --- */
    travelCrackSpacing: 1.3, // metres between CRACK decals along the way
    travelCrackRadius: 0.9,
    travelCrackLife: 1.6,
    travelEmbers: 140, // per second off the running front
    travelRumble: 0.04
  }
};
