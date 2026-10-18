/**
 * Glacier Calving — Frost — the floor splits, a cliff of glacier heaves up at
 * the far side of the circle, cracks at its foot, and calves forward across
 * the circle, breaking into blocks.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension and time below is resolved per frame by
 * `GlacierCalvingAbility`, so dragging any of it in the editor re-shapes a
 * shelf that is already standing.
 */
export default {
  id: 'calving',
  meta: {
    label: 'Glacier Calving',
    accent: '#c5e4f5',
    key: '',
    element: 'frost',
    hint: 'Frost — a cliff of glacier heaves up behind the circle, cracks at its foot and calves forward across it',
    cast: 'zone',
    glyph: `<path d="M56 86V30L62 22L66 30L72 18L78 28V86"/><path d="M50 86L20 66L26 56L52 70"/><path d="M14 86H90"/><path d="M60 50L66 58L62 66"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // how fast the fault runs to the circle, metres/second
    lifetime: 1.6, // seconds the wreckage takes to sink away at the end
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 5, // the circle, metres — the shelf falls across it

    /* --- light --- */
    lightColor: '#bfe4ff',
    lightIntensity: 6, // the glacial glow
    lightRadius: 12,
    lightHeight: 3, // metres off the floor, in front of the face

    /* ================================================================ */
    /* TIMING                                                            */
    /* ================================================================ */
    crackTime: 0.35, // seconds the crevasses take to open before it rises
    riseTime: 0.95, // seconds the shelf takes to heave up
    teeterTime: 0.5, // seconds it looms, the fissure climbing its foot
    fallTime: 0.6, // seconds it takes to topple to the floor
    settleTime: 0.9, // seconds the wreckage tumbles before it starts to go

    /* ================================================================ */
    /* 1 · THE SHELF                                                     */
    /* ================================================================ */
    shelfWidth: 6.4, // metres across
    shelfHeight: 6.2, // metres tall (it falls this far across the circle)
    shelfDepth: 1.7, // metres thick
    shelfOffset: 0.78, // its foot stands this far behind the centre (× circle)
    serracs: 6, // ice towers along its top
    serracDepth: 0.16, // how deep the notches cut (× height)
    roughness: 0.025, // surface roughness (× size)
    riseOvershoot: 0.15, // how far it heaves past full height
    riseShudder: 0.05, // metres it judders while it rises
    teeterBack: 0.06, // radians it leans back before it goes
    stumpHeight: 0.42, // the part left standing (× height)
    stumpDepth: 1.5, // metres thick

    /* ice */
    strataScale: 1.3, // bands per metre
    strataWarp: 0.6,
    strataDirt: 0.55, // dirty seams in the strata
    grooveScale: 0.9, // crevasse grooves per metre
    grooveDepth: 0.55,
    snowCap: 1, // snow on everything facing up
    subsurface: 0.55, // glacial blue light from within
    iceSpecular: 0.7,
    iceEnv: 0.45, // sky reflection
    iceAmbient: 0.55,
    colorDeep: '#0b3566',
    colorIce: '#4fa6e0',
    colorFirn: '#cfe7f7',
    colorSnow: '#f6fbff',
    colorDirt: '#2c3846',

    /* the calving fissure */
    crackClimb: 4.5, // metres up the face it climbs while it teeters
    crackScale: 0.9, // crack cells per metre
    crackGlow: 5,
    colorCrack: '#c9f3ff',

    /* ================================================================ */
    /* 2 · THE CHUNKS                                                    */
    /* ================================================================ */
    chunkCount: 30, // max 48
    chunkSize: 0.75, // metres, typical radius
    chunkJitter: 0.55, // size variety
    chunkThrow: 5, // metres/second thrown forward
    chunkLift: 4.5, // metres/second thrown up
    chunkSpin: 4, // radians/second tumble
    chunkGravity: -18,
    chunkBounce: 0.28, // restitution
    chunkFriction: 3, // how fast they stop sliding

    /* ================================================================ */
    /* 3 · THE CREVASSE FIELD                                            */
    /* ================================================================ */
    crevasseScale: 0.7, // cells per metre
    crevasseGlow: 3.2,
    powderReach: 1.25, // the powder fan runs out to (× height)
    colorFloorShade: '#1a2c40',

    /* ================================================================ */
    /* 4 · POWDER & ICE                                                  */
    /* ================================================================ */
    sloughRate: 90, // powder pouring off the top while it rises
    powderCount: 90, // the slam's powder cloud
    powderSize: 1.4,
    powderSpeed: 6.5,
    powderLifetime: 2.0,
    powderOpacity: 0.65,
    colorPowderA: '#ffffff',
    colorPowderB: '#e4f1fb',
    colorPowderC: '#a8c6df',
    colorPowderD: '#57799a',
    chipCount: 160, // ice chips at the slam
    chipSpeed: 9,
    chipSize: 0.14,
    chipLifetime: 1.4,
    chipGravity: -16,
    glitterCount: 160,
    glitterSize: 0.05,
    glitterLifetime: 1.6,
    colorChipA: '#ffffff',
    colorChipB: '#cdeaff',
    colorChipC: '#6fb0e6',
    colorChipD: '#1f4f80',

    /* ================================================================ */
    /* 5 · BODIES                                                        */
    /* ================================================================ */
    hitImpulse: 7, // metres/second, the way it falls
    hitLift: 2.5,
    hitSpin: 1.5,
    riseLift: 9, // metres/second — what stands on the shelf's footprint is thrown up
    frostTint: 0.45,
    colorBodyFrozen: '#c3e2f7',
    colorBodyRim: '#e8f8ff',
    bodyRimGlow: 1.2,
    colorBodyEdge: '#ffffff',
    bodyEdgeGlow: 1.6,

    /* ================================================================ */
    /* 6 · THE BEAT                                                      */
    /* ================================================================ */
    crackRumble: 0.25,
    riseRumble: 0.4,
    creakShake: 0.12,
    slamShake: 1.0,
    slamFlash: 0.35,
    slamLight: 50,
    colorFlash: '#e2f4ff',
    burstRadius: 5,
    burstLife: 0.8,
    shockRadius: 9,
    shockLife: 0.7,
    colorShockA: '#bfe4ff',
    colorShockB: '#ffffff',
    dustRingRadius: 7,
    dustRingLife: 1.6,
    slamWarp: 1.6, // the pressure wave's distortion
    slamWarpReach: 9, // metres it runs out to

    /* travel — a fault running to the circle */
    trailSpacing: 1.3,
    trailRadius: 0.6,
    trailLife: 1.6,
    colorTrailA: '#e4f4ff',
    colorTrailB: '#5aa8e6'
  }
};
