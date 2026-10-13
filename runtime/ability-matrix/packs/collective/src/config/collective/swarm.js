/**
 * Meteor Swarm — Fire — a rain of meteors over the whole circle.
 *
 * Collective Originals data block: presentation (`meta`) and the live settings
 * the ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 */
export default {
  id: 'swarm',
  meta: {
    label: "Meteor Swarm",
    accent: '#ff7a2e',
    key: 'N',
    hint: "Fire — a marked circle, then a rain of meteors onto every mark",
    cast: 'zone',
    glyph: `<circle cx="68" cy="72" r="10"/><path d="M60 64L24 28"/><circle cx="40" cy="78" r="6"/><path d="M35 73L14 52"/><circle cx="80" cy="40" r="5"/><path d="M76 36L60 20"/>`
  },
  /**
   * A multi-strike, read in three beats: the circle is *marked* (a ring and a
   * pip on every point a rock will land), the rocks *arrive* along one shared
   * slanted line out of the sky, and each landing is its own small explosion.
   *
   * Every record stores only dice — a landing order, a bearing, a radial
   * fraction, a size jitter, a tumble axis. All the metres, seconds and angles
   * below are resolved each frame, so dragging `fallAngle` re-aims the rocks
   * already in the air and `zoneRadius` re-spreads the marks on the floor.
   */
  settings: {
    /* --- the cast --- */
    "range": 16,
    "minRange": 2,
    "speed": 30, // m/s the call travels from the caster to the circle
    "lifetime": 2.0, // seconds over which the whole volley lands
    "cooldown": 0.6,
    castAnim: "cast2",
    "zoneRadius": 3.6, // metres

    /* --- timing --- */
    telegraph: 0.75, // seconds of marks before the first rock lands
    fallTime: 0.55, // seconds a rock spends in the air on its final approach
    linger: 1.1, // seconds the craters keep glowing after the last landing
    fadeTime: 1.0, // seconds for the marks and the craters to die out
    orderJitter: 0.6, // 0 = an even drum roll, 1 = a ragged one

    /* --- the volley --- */
    meteorCount: 18, // rocks per cast (max 64)
    spread: 0.92, // landing points as a fraction of the circle
    spreadCurve: 0.5, // 0.5 = even over the area, lower crowds the rim, higher the centre
    scatter: 0.75, // how far each point strays from its even placement
    fallAngle: 0.62, // radians off vertical — the shared slant of the rain
    fallYaw: 0.55, // radians the rain comes in off the cast direction
    angleJitter: 0.06, // per-rock variation on that slant, radians
    fallHeight: 22, // metres above the floor a rock starts its approach

    /* --- one rock --- */
    rockSize: 0.42, // radius, metres
    sizeJitter: 0.45,
    tumble: 5.5, // radians/second of spin
    rockDetail: 2, // icosphere subdivisions (rebuilds the mesh)
    rockLumps: 0.3, // large-scale lumpiness (rebuilds the mesh)
    rockCuts: 6, // flat fractured faces (rebuilds the mesh)
    rockCraters: 4, // pits (rebuilds the mesh)

    /* --- the molten crust shader --- */
    crackScale: 2.6, // crack features per unit of rock
    crackWidth: 0.16, // how wide the glowing seams are
    crackGlow: 4.5, // emissive in the seams
    crackFlow: 0.9, // how fast the melt crawls in them
    leadHeat: 2.2, // the face ploughing into the air glows hotter
    leadPower: 2.5, // how tightly that heat hugs the leading face
    rimGlow: 1.4, // fresnel glow on the silhouette
    rimPower: 2.8,
    rockRoughness: 0.85,
    rockGlow: 1.0, // master emissive on the rock
    colorCrust: '#1a1310', // the cooled skin
    colorCrustLit: '#3a2a20', // the cooled skin where it catches light
    colorMagma: '#ff4a12', // the melt in the seams
    colorMagmaHot: '#ffd27a', // the melt where it is hottest
    colorRim: '#ff8a3a',

    /* --- the entry flame (an additive teardrop around each rock) --- */
    sheathScale: 1.9, // × rock radius
    sheathTail: 4.5, // how far the flame streams behind, × its own radius
    sheathIntensity: 3.2,
    sheathOpacity: 0.85,
    sheathFalloff: 1.6, // >1 concentrates it toward the middle
    sheathNoise: 0.55, // how torn the flame is
    sheathNoiseScale: 2.4,
    sheathFlow: 3.5, // how fast the tears stream back
    sheathSoftFade: 0.35, // metres it fades into the floor over
    colorSheathCore: '#fff2c4',
    colorSheathMid: '#ff8a2a',
    colorSheathEdge: '#c2240a',

    /* --- trailing fire (STREAK, additive) --- */
    streakRate: 70, // per rock, per second
    streakSize: 0.11,
    streakSpeed: 3.0, // m/s, back up the path
    streakLifetime: 0.38,
    streakStretch: 0.35,
    streakGlow: 2.2,
    colorStreakA: '#fff3c9',
    colorStreakB: '#ffb04a',
    colorStreakC: '#ff5a1a',
    colorStreakD: '#5a1206',

    /* --- trailing smoke (SMOKE, non-additive) --- */
    smokeRate: 26, // per rock, per second
    smokeSize: 0.8,
    smokeSpread: 2.6, // end size, × start
    smokeLifetime: 1.6,
    smokeRise: 0.6, // m/s² buoyancy
    smokeOpacity: 0.55,
    smokeTurbulence: 0.7,
    colorSmokeA: '#5a3a28',
    colorSmokeB: '#3a2e2a',
    colorSmokeC: '#2a2624',
    colorSmokeD: '#1c1a1a',

    /* --- each landing --- */
    scorchRadius: 1.25, // metres, × rock size factor
    scorchLife: 4.0,
    scorchIntensity: 1.0,
    colorScorch: '#0d0907',
    colorScorchEmber: '#ff5a14',
    burstSize: 1.6, // fire shell end radius, metres
    burstLife: 0.42,
    burstIntensity: 2.4,
    burstOpacity: 0.85,
    burstSquash: 0.7, // < 1 flattens it over the floor
    colorBurstA: '#fff0b8',
    colorBurstB: '#ff7a22',
    colorBurstC: '#4a120a',
    ringRadius: 2.2, // the ground shock ring, metres
    ringLife: 0.45,
    colorRingA: '#ff9a4a',
    colorRingB: '#fff1c8',
    chipCount: 14, // debris per landing
    chipSize: 0.09,
    chipSpeed: 6.5,
    chipGravity: -14,
    chipLifetime: 1.1,
    colorChipA: '#ffb060',
    colorChipB: '#5a3626',
    colorChipC: '#2c221d',
    colorChipD: '#1a1512',
    sparkCount: 22, // fire sparks thrown out of each crater
    sparkSpeed: 8,
    impactShake: 0.22,
    shakeDuration: 0.3, // seconds each landing's shake takes to settle
    impactFlash: 0.08,
    colorFlash: '#ffb070',
    impactLight: 9, // added to the light on every landing
    rumble: 0.05, // continuous shake while the rain falls

    /* --- hits --- */
    blastRadius: 1.3, // metres from a landing a body is caught in
    hitImpulse: 7.5, // m/s, outward from the landing
    hitLift: 5.0,
    hitSpin: 1.6,

    /* --- the crater beds cooling (EMBERS, additive) --- */
    emberRate: 30, // per second over the whole circle, while the craters cool
    emberSize: 0.06,
    emberRise: 1.4,
    emberLifetime: 1.4,
    emberGlow: 2.0,
    colorEmberA: '#fff2c0',
    colorEmberB: '#ffa040',
    colorEmberC: '#ff4a14',
    colorEmberD: '#3a0a04',

    /* --- the telegraph on the floor --- */
    ringWidth: 0.09, // boundary ring, metres
    ringGlow: 2.4,
    ringTicks: 36, // segments in the rotating tick band
    ringTickSpin: 0.12, // revolutions/second
    fieldFill: 0.12, // faint heat wash over the circle
    fieldNoise: 0.6, // how much noise breaks that wash up
    fieldNoiseScale: 1.4,
    fieldRise: 1.5, // how much brighter the wash gets as the volley peaks
    pipSize: 0.55, // radius of a mark at the moment of landing, metres
    pipWidth: 0.05,
    pipTighten: 2.6, // how much wider a mark starts, × pipSize
    pipLead: 1.2, // seconds before its landing a mark appears
    pipGlow: 2.6,
    pipDot: 0.12, // the bright dot at the centre of a mark, metres
    pipBlink: 9, // flicker speed as a mark closes
    craterSize: 0.75, // the molten bed left behind, metres
    craterGlow: 2.6,
    craterCool: 1.4, // seconds for that bed to go dark
    fieldOpacity: 1.0,
    revealTime: 0.25, // seconds for the ring to draw on
    colorRing: '#ff6a24',
    colorRingHot: '#ffd08a',
    colorPip: '#ff8a3a',
    colorField: '#ff3a10',
    colorCrater: '#ff5a18',

    /* --- the call (travel, caster → circle) --- */
    callSparks: 140, // sparks per second shed along the call

    "lightColor": "#ff7a2e",
    "lightIntensity": 6,
    "lightRadius": 11,
    lightHeight: 2.0 // metres over the circle the light hangs
  }
};
