/**
 * Crimson Baptism — Blood — blood races under the floor to the circle, bursts
 * up as a fountain and falls back over it as rain.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 *
 * Every dimension below is resolved per frame by `CrimsonBaptismAbility`, so
 * dragging any of it in the editor re-shapes a fountain that is already
 * pouring.
 */
export default {
  id: 'baptism',
  meta: {
    label: 'Crimson Baptism',
    accent: '#ff5a72',
    key: '',
    element: 'blood',
    hint: 'Blood — a crimson fountain bursts up out of the circle and falls back over it as rain',
    cast: 'zone',
    glyph: `<path d="M50 88V30"/><path d="M50 30C40 18 22 22 16 44"/><path d="M50 30C60 18 78 22 84 44"/><path d="M14 54V60M26 60V66M74 60V66M86 54V60M38 66V72M62 66V72"/><path d="M20 88H80"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    zoneRadius: 4.4, // the circle the fountain fills, metres
    speed: 22, // how fast the seam races under the floor, metres/second
    lifetime: 1.8, // seconds the pool takes to drain once the rain stops
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#ff4058',
    lightIntensity: 9, // the light rides the top of the column
    lightRadius: 11,

    /* ================================================================ */
    /* 1 · THE SEAM                                                      */
    /* ================================================================ */
    seamStart: 0.8, // metres in front of the caster the crack begins
    seamWidth: 0.06, // metres
    seamWander: 0.3, // metres it wanders off the line
    seamGlow: 2.6,
    seamHeadGlow: 3, // the hot head, where the blood is forcing its way
    seamCool: 3.5, // metres behind the head that still glow
    seamDrops: 90, // droplets bubbling up at the head, per second
    seamRumble: 0.07,
    colorSeamHot: '#ff2a42',
    colorSeamWet: '#2a0208',

    /* ================================================================ */
    /* 2 · THE FOUNTAIN                                                  */
    /* ================================================================ */
    height: 4.6, // metres the column punches up
    columnRadius: 0.5, // metres
    columnShare: 0.42, // 0..1 share of the flow that is column (the rest is crown)
    crownReach: 3.6, // metres from the centre the crown lands
    crownLoft: 0.7, // metres the crown rises over the top of the column
    wobble: 0.1,
    twist: 0.4,
    flowSpeed: 9, // how fast the streaks race up and over
    eruptTime: 0.32, // seconds the column takes to punch up
    pourTime: 0.9, // seconds it stands, pouring
    pourSurge: 0.08, // how much it surges while it pours
    pourPulse: 2.4, // surges per second
    collapseTime: 0.55, // seconds it takes to drop and tear apart

    /* ================================================================ */
    /* 3 · BLOOD SHEET                                                   */
    /* ================================================================ */
    streakScale: 3.2,
    coreGlow: 2.6, // the column lit from inside (bloom > 1)
    sheen: 1.4, // pale sheen where the sheet turns edge-on
    gloss: 1.4,
    fountainOpacity: 0.92,
    crownOpacity: 0.5, // the falling sheet is thinner than the column
    lipTear: 0.7, // how raggedly the crown's lip tears
    shimmer: 0.7, // how hard the fountain bends the air
    shimmerWidth: 1.8,
    crownGlowSize: 2.2, // metres
    crownGlow: 1.6,
    colorFountainDeep: '#2a020a',
    colorFountainBody: '#a0101e',
    colorFountainHot: '#ff3048',
    colorFountainSheen: '#ffb0bc',
    colorCrownCore: '#ffe0e4',
    colorCrownHalo: '#ff2a44',

    /* ================================================================ */
    /* 4 · THE FONT                                                      */
    /* ================================================================ */
    poolOpacity: 0.95,
    poolGloss: 1.6,
    poolEdgeGlow: 1.2,
    rippleCell: 0.45, // metres between rain rings
    rippleRate: 1.8, // rings per second per cell
    rippleGlow: 1.6,
    poolMist: 22, // mist per second off the draining pool
    colorPool: '#3a020c',
    colorPoolLit: '#8a1022',
    colorRipple: '#ff4a5e',
    colorDry: '#2e1410',

    /* ================================================================ */
    /* 5 · THE RAIN                                                      */
    /* ================================================================ */
    rainTime: 1.4, // seconds it rains back
    rainRate: 900, // streaks per second over the circle
    rainHeight: 7, // metres they fall from
    rainSpeed: 14, // m/s
    rainGravity: 6,
    rainSize: 0.035,
    rainStretch: 0.6,
    rainGlow: 1.2,
    rainOpacity: 0.9,
    colorRainA: '#ff7080',
    colorRainB: '#d81a32',
    colorRainC: '#8a0a1a',
    colorRainD: '#3a020a',

    /* ================================================================ */
    /* 6 · DROPLETS & MIST                                               */
    /* ================================================================ */
    eruptDrops: 220, // the gout straight up the middle
    crownDrops: 260, // per second torn off the crown
    dropSize: 0.07,
    dropSpeed: 6,
    dropLife: 1.1,
    dropGravity: 13,
    dropStretch: 0.25,
    dropGlow: 1.2,
    sprayGlow: 2.6,
    mistSize: 0.6,
    mistLift: 0.8,
    mistLife: 1.8,
    mistOpacity: 0.4,
    colorDropA: '#ff5a6a',
    colorDropB: '#c8142c',
    colorDropC: '#760614',
    colorDropD: '#36020a',
    colorSprayA: '#ffd8dc',
    colorSprayB: '#ff5064',
    colorSprayC: '#c0102a',
    colorSprayD: '#400208',
    colorMistA: '#8a1020',
    colorMistB: '#5e0a16',
    colorMistC: '#3a060e',
    colorMistD: '#1e0306',

    /* ================================================================ */
    /* 7 · ERUPTION & HITS                                               */
    /* ================================================================ */
    burstSize: 2.6, // the splash dome at the source, metres
    eruptShake: 0.5,
    shakeDuration: 0.45,
    eruptFlash: 0.3,
    eruptLight: 2.6, // × lightIntensity
    eruptRadius: 1.8, // metres round the source that are thrown straight up
    eruptImpulse: 3, // m/s outward
    eruptLift: 15, // m/s up
    rainImpulse: 2.5, // m/s the rain knocks the rest down
    rainLift: 0.8,
    hitSpin: 2,
    anoint: 0.75, // 0..1 how red a hit body is stained
    anointTime: 0.8,
    anointedRimGlow: 2.2,
    colorBurstA: '#ff8a96',
    colorBurstB: '#d01a30',
    colorBurstC: '#4a0410',
    colorShockA: '#ff2a44',
    colorShockB: '#ffc4cc',
    colorFlash: '#ff4a5e',
    colorAnointedBody: '#5a0612',
    colorAnointedRim: '#ff3a50'
  }
};
