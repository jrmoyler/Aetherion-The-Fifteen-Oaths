/**
 * Mycelium Wake — Nature — luminous cords of mycelium race down the line
 * under the floor, and where they arrive a cluster of cordyceps-like
 * stromata erupts, heaving up and overgrowing whoever stands there, then
 * puffs spores.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Cords and stromata hold only dice; every metre, second and colour below is
 * resolved by `MyceliumWakeAbility` every frame, so `cordWander`,
 * `heightMax` or `lean` reshape a network and a cluster already standing.
 */
export default {
  id: 'mycelium',
  meta: {
    label: 'Mycelium Wake',
    accent: '#d6ff9a',
    key: '',
    element: 'nature',
    hint: 'Nature — glowing mycelium races down the line under the floor and fruits where it arrives, a cluster of cordyceps that overgrows and spores',
    cast: 'line',
    glyph: `<path d="M8 82C26 78 40 86 58 80"/><path d="M8 88C28 90 44 82 60 86"/><path d="M24 80L20 72M40 84L44 76"/><path d="M70 86V48C70 40 64 34 66 26"/><path d="M80 86V56C80 50 86 44 84 36"/><path d="M74 60L64 52M82 62L90 54"/><ellipse cx="66" cy="22" rx="4" ry="7"/><ellipse cx="84" cy="32" rx="4" ry="6"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 15, // metres/second the network runs down the line
    lifetime: 2, // seconds the cluster stands once it has risen
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    handForward: 0.8, // metres in front of the caster the hand goes into the floor
    handRing: 1.4, // the dust ring there, metres
    handMotes: 50,
    handShake: 0.15,
    travelRumble: 0.06,

    /* --- light --- */
    lightColor: '#d6ffc8',
    lightIntensity: 5, // the front, then the cluster
    lightRadius: 9,
    lightHeight: 1.4, // metres over the cluster once it fruits

    /* ================================================================ */
    /* 1 · THE HYPHAE                                                    */
    /* ================================================================ */
    cordCount: 5, // main cords down the line
    cordSpread: 0.55, // metres either side of the line they run
    cordRadius: 0.05, // metres
    cordSink: 0.018, // metres the cords' centres sit under the floor
    cordWander: 0.32, // metres each cord wanders
    cordWanderScale: 0.45, // wanders per metre
    cordBraid: 0.14, // metres they braid round each other
    cordTaper: 0.025, // share of a cord its growing tip tapers over
    branchCount: 20, // side branches off the cords
    branchLength: 2.2, // metres
    branchSpread: 1.1, // metres they reach out sideways
    branchGrow: 0.7, // branches grow at this share of the front's speed
    cordCoreGlow: 3.2, // the cream core (bloom > 1)
    cordSheathGlow: 1.2, // the teal sheath
    cordTipGlow: 6, // the growing tips
    pulseLength: 2.6, // metres between pulses
    pulseSpeed: 1.4, // pulses per second running toward the target
    pulseGlow: 3.5,
    cordSoftFade: 0.06, // metres over which a cord fades into the floor
    colorCordCore: '#f4ffe4',
    colorCordSheath: '#4de0b0',
    colorPulse: '#d6ff9a',

    /* ================================================================ */
    /* 2 · THE WAKE & THE ROT                                            */
    /* ================================================================ */
    bandWidth: 1.1, // half-width of the heaved band, metres
    hairAmount: 0.65, // fine hyphal hair through it
    hairScale: 4,
    underGlow: 1.3, // light seeping up through the soil over the cords
    rotScale: 1.25, // the rot round the target, × fruitRadius
    rotGrow: 0.5, // seconds it takes to spread
    sporeDust: 0.7, // orange spore dust settled once the clubs puff
    colorSoil: '#1e160e',
    colorHair: '#d8e8c8',
    colorRot: '#2a2416',
    colorSporeDust: '#d8782a',

    /* ================================================================ */
    /* 3 · THE FRUITING BODIES                                           */
    /* ================================================================ */
    stalkCount: 18,
    fruitRadius: 2.3, // metres round the target the cluster spreads
    stalksPerBody: 3, // of those, come up through each body standing there
    heightMin: 0.9, // metres
    heightMax: 2.6, // metres
    heightFalloff: 0.65, // 1 tallest in the middle, 0 random heights
    girth: 1.6, // × the base mesh
    lean: 0.42, // radians the rim stromata lean out
    leanJitter: 0.35,
    sway: 0.05, // radians
    swayRate: 1.6,
    eruptDelay: 0.12, // seconds after the knot the first breaks the floor
    eruptSpread: 0.5, // seconds out to the rim
    eruptJitter: 0.18,
    riseTime: 0.32, // seconds one takes to rise
    overshoot: 0.35,
    eruptFlash: 1.6, // flash on a stroma as it breaks the floor
    witherTime: 0.9, // seconds one takes to wither
    witherStagger: 0.6, // seconds the withering spreads over
    droop: 0.8, // radians a withering stroma droops
    witherSink: 0.35, // share of its height it sinks back in
    poreScale: 26, // ostioles round the club
    poreGlow: 3.4,
    clubGlow: 1, // how lit the clubs are
    throb: 0.35,
    stromaSpecular: 0.55,
    stromaRim: 0.9,
    striation: 0.6,
    colorStalk: '#e8dcc0',
    colorStalkTop: '#e0a868',
    colorClub: '#e8641e',
    colorClubTip: '#ff3c1e',
    colorPore: '#ffd27a',
    colorStromaRim: '#ffb070',
    colorDead: '#3a2a1a',

    /* ================================================================ */
    /* 4 · THE SPORES                                                    */
    /* ================================================================ */
    puffDelay: 0.4, // seconds after a stroma has risen that it puffs
    puffJitter: 0.6,
    puffTime: 0.5, // seconds a puff keeps the air thick
    puffSpeed: 3.2, // metres/second the jet leaves the club
    puffSmoke: 10,
    puffGlints: 26,
    puffFlash: 0.15, // flash on the first puff
    puffLight: 1.8, // light punch on the first puff, × lightIntensity
    driftRate: 40, // spores per second still drifting off the cluster
    sporeSize: 0.55,
    sporeLife: 2.2,
    sporeRise: 0.35,
    sporeSwirl: 0.6,
    sporeOpacity: 0.5,
    colorSporeA: '#e8a050',
    colorSporeB: '#c07030',
    colorSporeC: '#7a4a24',
    colorSporeD: '#3a2414',
    glintSize: 0.04,
    glintLife: 1.6,
    glintGlow: 3,
    colorGlintA: '#fff4c0',
    colorGlintB: '#ffc860',
    colorGlintC: '#ff7a2a',
    colorGlintD: '#7a2a0a',
    hazeStrength: 0.8, // how thick the air goes over the cluster
    hazeScale: 1.4,
    hazeLinger: 0.35, // the share of the haze left between puffs
    colorFlash: '#ffe8c0',

    /* ================================================================ */
    /* 5 · MOTES & CRUMBS                                                */
    /* ================================================================ */
    frontDebris: 60, // per second off the running front
    cordMotes: 50, // per second rising off the cords behind it
    eruptCrumbs: 14, // per stroma breaking the floor
    eruptShake: 0.05,
    eruptBurst: 2.6, // EARTH burst at the first eruption, metres
    moteSize: 0.05,
    moteSpeed: 0.6,
    moteLife: 1.2,
    moteRise: 0.35,
    moteGlow: 2.8,
    colorMoteA: '#f0fff0',
    colorMoteB: '#b8ffd8',
    colorMoteC: '#4de0b0',
    colorMoteD: '#0a5a4a',
    crumbSize: 0.07,
    crumbSpeed: 4.5,
    crumbLife: 0.9,
    colorCrumbA: '#6a5034',
    colorCrumbB: '#4a3824',
    colorCrumbC: '#2e2216',
    colorCrumbD: '#18120c',

    /* ================================================================ */
    /* 6 · INFESTED                                                      */
    /* ================================================================ */
    hitImpulse: 2.2, // m/s heaved outward
    hitLift: 5.5, // m/s heaved up by the stromata coming through
    hitSpin: 1.4,
    infest: 0.85, // 0..1 how far the body is overgrown
    infestTime: 1.4, // seconds it takes
    infestMotes: 40, // glints per second off an overgrown body
    infestRimGlow: 2.2,
    infestEdgeGlow: 3.5,
    infestEdgeWidth: 0.06,
    colorInfestBody: '#cfc4a8'
  }
};
