/**
 * Shade Puppets — Shadow — a puppeteer's crown is flung over the circle;
 * shadow marionettes are hauled up round its rim on glowing strings, made to
 * dance, and yanked inward to collapse in a heap.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 *
 * Every dimension below is resolved per frame by `ShadePuppetsAbility`, so
 * dragging any of it in the editor re-poses a show already under way.
 */
export default {
  id: 'shadepuppet',
  meta: {
    label: 'Shade Puppets',
    accent: '#b7a6ff',
    key: '',
    element: 'shadow',
    hint: 'Shadow — shade marionettes are hauled up round the circle on glowing strings, dance, and are yanked inward to fall',
    cast: 'zone',
    glyph: `<path d="M26 14H74"/><path d="M34 14L30 6M50 14V4M66 14L70 6"/><path d="M34 14L38 44M50 14V36M66 14L62 44"/><circle cx="50" cy="40" r="5"/><path d="M50 45V66M38 50L50 48L62 50M44 84L50 66L56 84"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    zoneRadius: 4.4, // the circle the show plays in, metres
    speed: 22, // how fast the crown is thrown, metres/second
    lifetime: 1.2, // seconds the stage takes to fade after the show
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#c8b8ff',
    lightIntensity: 9, // the light hangs under the crown, then over the heap
    lightRadius: 11,
    lightFlicker: 0.2,

    /* ================================================================ */
    /* 1 · THE CROWN                                                     */
    /* ================================================================ */
    handForward: 0.5, // metres in front of the caster it is thrown from
    handSide: 0.2,
    handHeight: 1.7,
    throwArc: 2.5, // metres it arcs up on its way
    throwSpin: 12, // radians/second it spins as it flies
    crownRadius: 1.15, // metres
    crownHeight: 5.0, // metres over the circle it hovers
    crownSpin: 0.5, // radians/second it turns while it hovers
    crownBob: 0.15, // metres it bobs
    yankSpin: 14, // radians/second it whirls at the yank
    crownDrop: 2.2, // metres it drops as the puppets are flung
    crownPulse: 2.5, // how fast light pulses up its veins
    crownRimGlow: 1.8,
    crownVeinGlow: 2.2,
    crownTipGlow: 4,
    crownMotes: 70, // motes per second off the crown and strings
    crownShards: 90, // shards when it shatters
    arriveShake: 0.12,
    colorCrownBody: '#0e0a18',
    colorCrownRim: '#a890ff',
    colorCrownVein: '#c8b0ff',

    /* ================================================================ */
    /* 2 · THE STRINGS                                                   */
    /* ================================================================ */
    handSpread: 0.2, // radians either side of a puppet the hand strings tie on
    stringWidth: 0.022, // metres
    stringSag: 0.5, // metres a slack string sags
    stringHum: 0.04, // metres a taut string hums
    stringGlow: 3.4,
    stringPulseGlow: 2.2,
    stringPulseRate: 9,
    snapTime: 0.4, // seconds a snapped string takes to whip back and go
    colorStringCore: '#f2ecff',
    colorStringHalo: '#9a7cff',

    /* ================================================================ */
    /* 3 · THE PUPPETS                                                   */
    /* ================================================================ */
    count: 6, // marionettes round the circle
    puppetRing: 0.82, // where they stand, × the circle's radius
    puppetScale: 1.3, // the sizes below are for a 1.75 m figure
    torsoLength: 0.62,
    headLength: 0.34,
    shoulderWidth: 0.21,
    upperArm: 0.33,
    forearm: 0.31,
    hipWidth: 0.11,
    thighLength: 0.43,
    shinLength: 0.43,
    torsoRadius: 0.14,
    headRadius: 0.13,
    armRadius: 0.05,
    legRadius: 0.065,
    hang: 0.14, // metres their feet dangle off the floor
    puppetRimGlow: 0.8,
    jointGlow: 2.4, // the burning pivots (bloom > 1)
    grain: 0.45,
    lacquer: 0.7,
    crumbleEdge: 0.08,
    colorPuppetBody: '#120c1c',
    colorPuppetRim: '#6c52d8',
    colorJoint: '#d8c8ff',
    colorCrumbleEdge: '#b49cff',

    /* ================================================================ */
    /* 4 · THE SHOW                                                      */
    /* ================================================================ */
    settleTime: 0.22, // seconds the crown takes to brake and settle
    dropTime: 0.25, // seconds the strings take to pay down to the floor
    riseTime: 0.45, // seconds a puppet takes to be hauled up
    riseStagger: 0.08, // seconds between one puppet and the next
    danceTime: 1.0, // seconds they dance
    danceRate: 1.6, // steps per second
    armFling: 2.0, // radians the hands are yanked up
    kneeKick: 0.9, // radians the knees kick
    hopHeight: 0.22, // metres
    yankTime: 0.16, // seconds they are snatched up at the end
    yankLift: 1.1, // metres
    flingTime: 0.42, // seconds they take to be flung in to the middle
    flingArc: 1.4, // metres they arc up as they go
    heapRadius: 0.9, // metres the heap spreads
    heapHeight: 0.42, // metres off the floor a fallen puppet's hips lie
    crumbleTime: 0.8, // seconds the heap takes to crumble into ink

    /* ================================================================ */
    /* 5 · STAGE & SPOTLIGHT                                             */
    /* ================================================================ */
    stageShade: 0.55, // how dark the floor inside the ring goes
    ringGlow: 2.4,
    footlights: 18,
    footlightGlow: 3.4,
    poolRadius: 0.75, // metres
    splatRadius: 1.8, // the ink splat where they fall, metres
    spotIntensity: 0.32,
    spotSpread: 0.95, // × the circle's radius at the floor
    spotDust: 0.6,
    colorStageShade: '#06040c',
    colorRing: '#a48aff',
    colorInk: '#05030a',
    colorPoolRim: '#7a5cff',
    colorSpot: '#d8ccff',

    /* ================================================================ */
    /* 6 · INK, MOTES, SPARKS                                            */
    /* ================================================================ */
    riseInk: 40, // ink per second off a puppet hauled out of its pool
    crumbleInk: 70, // per second off a crumbling puppet
    landInk: 50, // thrown out of the heap
    inkSize: 0.6,
    inkLift: 0.7,
    inkLife: 1.6,
    inkOpacity: 0.55,
    moteSize: 0.05,
    moteLife: 1.1,
    moteLift: 0.5,
    moteGlow: 2.6,
    sparkSpeed: 7,
    sparkSize: 0.03,
    sparkLife: 0.5,
    sparkGravity: 6,
    sparkStretch: 0.2,
    sparkGlow: 3.4,
    colorInkA: '#2a1e44',
    colorInkB: '#1a1230',
    colorInkC: '#100a1e',
    colorInkD: '#06040c',
    colorMoteA: '#ffffff',
    colorMoteB: '#d6c8ff',
    colorMoteC: '#9a7cff',
    colorMoteD: '#3a2a70',
    colorSparkA: '#ffffff',
    colorSparkB: '#e6dcff',
    colorSparkC: '#a88cff',
    colorSparkD: '#4a3490',

    /* ================================================================ */
    /* 7 · THE FALL                                                      */
    /* ================================================================ */
    burstSize: 3, // the shell thrown off the heap, metres
    slumpWarp: 1.2, // how hard the landing thumps the air
    slumpTime: 0.45,
    landShake: 0.5,
    shakeDuration: 0.4,
    landFlash: 0.25,
    landLight: 2.4, // × lightIntensity
    slumpImpulse: 6, // m/s everything in the circle is dragged in
    slumpLift: 2.5,
    slumpSpin: 1.6,
    colorBurstA: '#e8deff',
    colorBurstB: '#8a6cff',
    colorBurstC: '#1a1030',
    colorFlash: '#b8a4ff'
  }
};
