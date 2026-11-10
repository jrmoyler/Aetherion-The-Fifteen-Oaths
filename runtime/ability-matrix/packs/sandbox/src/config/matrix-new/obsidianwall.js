/**
 * Obsidian Wall — Earth — a black-glass wall rises down the line, then fans its shards.
 *
 * Matrix New data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * Every number below is resolved per frame by `ObsidianWallAbility`: a slab
 * or shard record holds only dice and the moment it erupted or broke, so
 * dragging the spacing, the height or the fan reshapes a wall already standing
 * and a volley already in the air.
 */
export default {
  id: 'obsidianwall',
  meta: {
    label: "Obsidian Wall",
    accent: '#9a8cff',
    key: 'N',
    hint: "Earth — a black-glass wall erupts down the line, stands, then fans out as spinning shards",
    cast: 'line',
    glyph: `<path d="M14 84L24 40L36 52L46 22L58 46L68 30L86 84Z"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2,
    speed: 16, // how fast the eruption front runs down the line, m/s
    lifetime: 1.0, // seconds the wall stands once the front has arrived (the aftershocks run through it)
    cooldown: 0.5,
    castAnim: "cast1",

    /* --- light --- */
    lightColor: "#9a8cff",
    lightIntensity: 6,
    lightRadius: 9,
    lightHeight: 1.4, // metres above the wall
    eruptLight: 3, // punch per slab as it breaks the floor
    breakLight: 22, // punch when the wall comes apart

    /* ================================================================ */
    /* 1 · THE WALL                                                      */
    /* ================================================================ */
    wallStart: 1.4, // metres in front of the caster the wall begins
    slabSpacing: 1.05, // metres between slabs in one row (count follows the length)
    slabHeight: 2.4, // metres (at the caster's end — see wallRamp)
    slabWidth: 1.45, // metres along the wall
    slabThickness: 0.7, // metres across it
    heightJitter: 0.28, // ± fraction
    widthJitter: 0.2,
    lateralJitter: 0.18, // metres off the line
    leanJitter: 0.14, // radians each leans
    yawJitter: 0.35, // radians each turns off the run of the wall
    crestShape: 0.2, // 0 flat crest .. 1 tallest in the middle
    slabJag: 0.35, // how ragged each top is (rebuild)
    slabLumps: 0.12, // facet wander (rebuild)
    slabTaper: 0.35, // narrower at the top (rebuild)

    /* --- two rows and a crown (the mass seen from behind) --- */
    wallRows: 2, // 1 a single file, 2 staggered rows either side of the rift
    rowSplitNear: 0.7, // metres between the rows at the caster's end
    rowSplit: 2.4, // metres between the rows where the wall meets the crown
    rowLean: 0.24, // radians each row leans out off the rift
    wallRamp: 1.35, // height at the far end, × slabHeight (the wall builds to the crown)
    crownCount: 7, // slabs heaved up round the landing point (0 = none)
    crownRadius: 1.9, // metres
    crownHeight: 3.6, // metres
    crownWidth: 1.5, // metres along the ring
    crownLean: 0.32, // radians they lean outward
    crownSweep: 0.18, // seconds the ring takes to close round from the near side

    /* --- standing: the aftershocks --- */
    heaveAmp: 0.16, // a slab jolts this much taller as the aftershock passes
    heaveSpeed: 14, // m/s the aftershock runs from the caster to the crown
    heaveWidth: 1.6, // metres of wall it lifts at once
    heaveDelay: 0.25, // seconds after the landing the first aftershock sets off
    heaveGlow: 0.9, // crack flare as it passes (added to the heat)
    heaveDust: 12, // dust puffs/second per jolting slab
    heaveRumble: 0.18,
    creep: 0.12, // the wall creeps this much taller over its stand

    /* --- the landing (impact beat) --- */
    landBurst: 3.4, // EARTH shell end radius, metres
    landShock: 6.5, // shockwave radius, metres
    landShake: 0.55,
    landFlash: 0.3,
    landLight: 26,
    landGrit: 110,
    landDust: 36,

    /* --- the eruption (seconds) --- */
    eruptDelay: 0.04, // behind the front
    riseTime: 0.22,
    overshoot: 0.12, // fraction it punches past full height
    settleTime: 0.25,
    eruptShake: 0.08, // knock per slab
    eruptKnock: 6, // m/s up — a body standing where a slab comes up is thrown off it (0 = off)
    travelRumble: 0.35, // camera rumble while the front runs

    /* ================================================================ */
    /* 2 · VOLCANIC GLASS                                                */
    /* ================================================================ */
    glassEnv: 1.3, // sharp sky reflection
    glassFresnel: 1, // how mirror-like at grazing angles
    glassSpecular: 5, // the sun glint
    glassGloss: 260,
    glassDiffuse: 0.18,
    ridgeStrength: 0.2, // conchoidal ripples in the facets
    ridgeFrequency: 3.2, // shells per metre
    ridgeReach: 0.65, // metres they spread from their origin
    crackScale: 2.2, // crack features per metre
    crackWidth: 0.06,
    crackGlow: 1.6, // violet in the surface cracks
    deepGlow: 0.7, // the glow trapped inside the glass
    deepDepth: 0.12, // metres behind the surface it sits
    rootGlow: 0.7, // 0 even .. 1 hottest at the root
    crackPulse: 0.3, // throb of the cracks
    rimGlow: 0.25,
    heatDecay: 1.6, // per second the fresh-erupted glow cools
    colorGlass: "#07060b",
    colorSheen: "#d8dcff",
    colorCrack: "#9a6bff",
    colorDeep: "#5a2fd0",
    colorRim: "#6a5ad8",

    /* ================================================================ */
    /* 3 · FISSURE                                                       */
    /* ================================================================ */
    fissureWidth: 0.2, // half-width of the rift, metres
    fissureMargin: 1.5, // half-width of the scorched margin
    fissureBranch: 1.3, // how far side cracks reach, metres
    fissureBranchScale: 2.2,
    fissureWander: 0.22, // metres the rift zigzags
    fissureGlow: 4,
    fissureDark: 0.9,
    fissureCool: 2.4, // seconds the rift takes to cool
    fissureErode: 0.7,
    colorFissure: "#050409",
    colorFissureGlow: "#a070ff",
    colorScorch: "#1a1620",
    ringIntensity: 0.6, // dust ring per slab
    ringRadius: 1.3,
    ringLife: 1.2,
    colorRingA: "#3c3646",
    colorRingB: "#7c7484",

    /* ================================================================ */
    /* 4 · DUST + GRIT                                                   */
    /* ================================================================ */
    dustPerSlab: 13,
    dustSize: 0.7,
    dustSpeed: 2.2,
    dustLifetime: 1.4,
    dustOpacity: 0.55,
    dustRise: 0.35,
    dustTurbulence: 0.7,
    gritPerSlab: 18,
    gritSize: 0.06,
    gritSpeed: 5.5,
    gritLifetime: 1.1,
    gritGravity: -14,
    standDust: 50, // puffs/second sifting off the standing wall
    colorDustA: "#5a5462",
    colorDustB: "#433d4a",
    colorDustC: "#2e2a34",
    colorDustD: "#1c1a20",
    colorGritA: "#2a2633",
    colorGritB: "#18151e",
    colorGritC: "#0c0a10",
    colorGritD: "#060508",

    /* ================================================================ */
    /* 5 · THE CHARGE — the wall about to break                          */
    /* ================================================================ */
    chargeTime: 0.6, // seconds before the break the cracks light up
    chargeShiver: 0.025, // metres the slabs shiver
    chargeRumble: 0.4,
    emberRate: 120, // violet sparks rising off the cracks, per second
    emberSize: 0.05,
    emberSpeed: 1.6,
    emberLifetime: 0.8,
    colorEmberA: "#ffffff",
    colorEmberB: "#c8a8ff",
    colorEmberC: "#7a4cff",
    colorEmberD: "#2a1460",

    /* ================================================================ */
    /* 6 · THE SHARDS                                                    */
    /* ================================================================ */
    shardsPerSlab: 6, // (max 10)
    shardSize: 0.42, // metres, longest axis
    shardSizeJitter: 0.4,
    shardSpeed: 13, // m/s outward
    shardSpeedJitter: 0.35,
    shardLift: 4.5, // m/s upward
    shardFan: 1.3, // radians the volley fans across
    shardForward: 0.25, // bias down the line, −1..1
    shardSides: 1, // single file only: 0 one side (the side away from the caster's right), 1 both
    shardCross: 0.15, // two rows: fraction of a row's shards thrown back over the rift
    shardGravity: -16,
    shardSpin: 14, // rad/s
    shardStagger: 0.035, // seconds between slabs breaking, caster first
    shardFlightTime: 1.4, // seconds the volley lasts
    shardShrink: 0.3, // fraction of the flight they spend shrinking away at the end
    shardSkid: 0.25, // fraction of speed kept sliding after landing
    shardHitRadius: 0.55, // a shard this close to a body kills it
    shardImpulse: 7, // m/s, along the shard's flight
    shardKillLift: 3.4,
    shardKillSpin: 2,
    breakShake: 0.5,
    breakShakeDuration: 0.5,
    breakFlash: 0.25,
    breakBurst: 1.8, // metres, a shell at a few points down the wall
    breakBursts: 3,
    breakShellFrom: 0.35, // shells only from this fraction of the wall on (not at the camera)
    breakGrit: 1.6, // × grit per slab
    trailRate: 260, // dust trailing the shards, per second
    colorFlash: "#c8b8ff",
    colorBurstA: "#b8a0ff",
    colorBurstB: "#3a2478",
    colorBurstC: "#1a1428"
  }
};
