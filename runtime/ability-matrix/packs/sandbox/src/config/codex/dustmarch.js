/**
 * Dust Devil March — Wind — a gust runs out to the circle and splits into a
 * ring of dust devils that crown its rim and march round it, snatching up
 * whatever they pass and flinging it clear.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * A devil holds only dice (a seed, a height roll, a wander roll). Every metre,
 * radian, second and colour below is resolved by `DustDevilMarchAbility`
 * every frame — the march and every spin are integrated phases, so dragging
 * their rates never makes a devil jump.
 */
export default {
  id: 'dustmarch',
  meta: {
    label: 'Dust Devil March',
    accent: '#efe6d4',
    key: '',
    element: 'wind',
    hint: 'Wind — a gust splits into a ring of dust devils that crown the circle and march round its rim, flinging whoever they pass',
    cast: 'zone',
    glyph: `<path d="M22 22H46M24 30H44M27 38H41M30 46H38M32 54H36"/><path d="M56 30H80M58 38H78M61 46H75M64 54H72M66 62H70"/><ellipse cx="50" cy="80" rx="40" ry="10"/><path d="M34 62L34 72M68 70V74"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 18, // metres/second the gust runs to the circle
    lifetime: 2.6, // seconds the devils march once the ring is crowned
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 5, // metres — the circle the devils crown

    /* --- light --- */
    lightColor: '#fffaf0',
    lightIntensity: 2.5, // dust carries little light; a warm fill
    lightRadius: 10,
    lightHeight: 2.5, // metres over the circle

    /* ================================================================ */
    /* 1 · THE MARCH                                                     */
    /* ================================================================ */
    devilCount: 6,
    marchRadius: 0.9, // the rim they walk, × zoneRadius
    marchSpeed: 0.9, // radians/second round the circle
    spreadTime: 0.55, // seconds a devil takes to race out from the middle to the rim
    spawnStagger: 0.07, // seconds between devils splitting off
    wander: 0.45, // metres each devil drifts in and out of the rim
    wanderRate: 1.7,
    lean: 0.55, // how hard a devil leans into the way it walks
    collapseTime: 0.8, // seconds one takes to rope out
    collapseStagger: 0.5, // seconds the roping out spreads over
    ropeStretch: 0.25, // how much taller it stretches as it ropes out
    leadHeight: 2.2, // metres, the devil riding the gust
    leadScale: 0.55, // its girth, × a full devil

    /* ================================================================ */
    /* 2 · THE FUNNEL                                                    */
    /* ================================================================ */
    heightMin: 4.2, // metres
    heightMax: 6.2, // metres
    baseRadius: 0.22, // waist at the floor, metres
    topRadius: 1.35, // crown, metres
    flare: 1.5, // >1 keeps it slim low down and flares it late
    skirt: 0.55, // metres the skirt flares out at the floor
    skirtHeight: 0.35, // metres it reaches up
    wobble: 0.55, // metres the axis snakes at the crown
    wobbleRate: 1.6,
    twist: 3.5, // radians the surface twists from floor to crown
    bulge: 0.18, // how ragged the column's outline is
    veilScale: 1.45, // the outer veil, × the core
    spinRate: 11, // radians/second the core spins
    veilSpin: 0.55, // the veil turns slower

    /* ================================================================ */
    /* 3 · THE DUST                                                      */
    /* ================================================================ */
    density: 1.15,
    dustOpacity: 0.8,
    bandScale: 1.4, // spiral band size
    bandShear: 7, // how steeply the bands spiral up
    dustNoiseScale: 0.55, // noise features per metre up the column
    edgeThickness: 0.7, // 1 dust only at the silhouette, 0 even
    crownFade: 0.45, // share of the top that thins into haze
    softFade: 0.35, // metres over which it meets the floor
    dustLit: 0.9, // how much brighter the sunlit side is
    colorDustDark: '#5a4a38',
    colorDustMid: '#a8916e',
    colorDustLight: '#efe2c4',
    swirlWarp: 0.9, // how hard the air bends round each column

    /* ================================================================ */
    /* 4 · THE TRACK                                                     */
    /* ================================================================ */
    trackWidth: 1.5, // metres
    trackOpacity: 0.7,
    grooves: 34, // rake grooves round the ring
    grooveDepth: 0.65,
    churnRadius: 1.4, // metres of churned floor under each devil
    colorScour: '#b8a07a',
    colorGroove: '#5a4630',
    colorChurn: '#3e3022',

    /* ================================================================ */
    /* 5 · SKIRT, DEBRIS, GRIT                                           */
    /* ================================================================ */
    skirtRate: 22, // per second per devil
    skirtSize: 0.8,
    skirtSpeed: 1.1,
    skirtLife: 1.6,
    skirtRise: 0.5,
    skirtSwirl: 5, // radians/second the skirt turns
    skirtExpand: 1.2,
    skirtOpacity: 0.45,
    colorSkirtA: '#d8c4a0',
    colorSkirtB: '#a8916e',
    colorSkirtC: '#6e5a42',
    colorSkirtD: '#3a2e22',
    debrisRate: 18, // per second per devil
    debrisSize: 0.08,
    debrisRise: 3.4, // metres/second up the column
    debrisLife: 1.4,
    debrisGravity: 1.2,
    debrisSwirl: 9, // radians/second round the column
    debrisExpand: 0.9,
    colorDebrisA: '#8a7458',
    colorDebrisB: '#6a5640',
    colorDebrisC: '#4a3a2a',
    colorDebrisD: '#2a2018',
    gritRate: 60, // per second per devil
    gritSize: 0.03,
    gritSpeed: 7,
    gritLife: 0.35,
    gritStretch: 0.5,
    gritOpacity: 0.6,
    colorGritA: '#fff6e0',
    colorGritB: '#e8d6b0',
    colorGritC: '#b8a07a',
    colorGritD: '#6e5a42',
    gustRate: 70, // dust per second trailing the gust
    collapseDust: 24, // when a devil ropes out
    arriveRing: 1.3, // metres, the dust ring as a devil reaches the rim

    /* ================================================================ */
    /* 6 · THE BREAK                                                     */
    /* ================================================================ */
    breakRing: 1.1, // dust ring where the gust breaks, × zoneRadius
    breakBurst: 3, // AIR shell, metres
    breakDust: 60,
    breakShake: 0.35,
    breakShakeTime: 0.4,
    breakFlash: 0.08,
    breakLight: 1.5, // light punch, × lightIntensity
    marchRumble: 0.12,
    travelRumble: 0.05,
    colorFlash: '#fff6e0',

    /* ================================================================ */
    /* 7 · CARRIED & FLUNG                                               */
    /* ================================================================ */
    catchRadius: 1.1, // metres from a devil a standing body is caught
    catchImpulse: 2.5, // m/s knocked round
    catchLift: 4, // m/s snatched up
    catchSpin: 2.5,
    catchShake: 0.12,
    holdTime: 1.1, // seconds a body is carried before it is flung
    carryGrab: 0.25, // how hard the flow holds it, per frame
    carrySwirl: 7, // m/s round the column
    carryPull: 3, // pull toward the orbit
    carryOrbit: 0.7, // metres from the axis it is whirled round at
    carryLift: 3.2, // m/s up the column
    carryCeiling: 0.55, // share of the devil's height it is lifted to
    carryBuoyancy: 0.6, // share of its weight the wind holds
    flingSpeed: 11, // m/s flung out of the circle
    flingUp: 4 // m/s
  }
};
