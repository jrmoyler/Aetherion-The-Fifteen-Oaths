/**
 * Aegis Reversal — Defense — a segmented shield catches a bolt, stores it, and fires back a counter-wave.
 *
 * Ability Atlas data block, rebuilt for the sandbox engine. Plain data, no
 * imports, so `settings.js` can pull it in without a cycle.
 *
 * The shield stands upright at the circle with its face turned down the aim
 * line, away from the caster. A hostile bolt comes in from beyond the circle,
 * the shield drinks it, and the counter-wave goes back out the way it came.
 */
export default {
  id: 'reversal',
  meta: {
    label: "Aegis Reversal",
    accent: '#92d5ff',
    key: '',
    hint: "Defense — a shield of turning plates catches an incoming bolt, stores the blow, then fires it back as a widening cone",
    cast: 'zone',
    glyph: `<circle cx="34" cy="50" r="22"/><path d="M34 28V72M12 50H56" opacity=".6"/><path d="M62 38L90 24M62 50H92M62 62L90 76"/><path d="M96 50L84 44V56Z"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 16, // maximum cast distance, metres
    minRange: 0, // 0: the shield can stand at the caster's own feet
    speed: 34, // how fast the anchor spark races to the circle, metres/second
    lifetime: 1.0, // × every phase of the timeline below (on top of global lifetime)
    fadeTime: 0.9, // seconds the plates take to scatter and burn out at the end
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 3.2, // radius of the circle the shield stands in, metres — what the indicator measures

    /* ================================================================ */
    /* 1 · SHIELD — rings of turning plates                              */
    /* ================================================================ */

    /* --- shape --- */
    shieldRadius: 1.25, // metres, outer edge of the outer ring
    shieldHeight: 1.35, // metres off the floor to the shield's centre
    shieldDish: 0.22, // how convex the face is (metres the rim sits back)
    shieldTilt: 0.12, // radians the shield leans back
    bossPlates: 6, // plates in the central boss (max 8)
    innerPlates: 8, // plates in the inner ring (max 12)
    outerPlates: 12, // plates in the outer ring (max 16)
    bossRadius: 0.26, // boss outer radius, × shieldRadius
    innerRadius: 0.62, // inner ring outer radius, × shieldRadius
    ringGap: 0.035, // radial gap between rings, × shieldRadius
    plateGap: 0.05, // gap between neighbouring plates, radians
    plateThickness: 0.07, // metres
    plateBevel: 0.25, // how much of a plate's edge is bevelled, 0..1

    /* --- assembly --- */
    assembleTime: 0.75, // seconds for the plates to fly in and lock
    assembleStagger: 0.35, // fraction of that the last plate lags the first
    scatter: 2.2, // metres the plates fly in from
    assembleTumble: 5.0, // radians of tumble on the way in

    /* --- spin --- */
    spinIdle: 0.45, // radians/second the rings turn while waiting
    spinCharged: 6.0, // ...once the blow is stored in them
    spinSpread: 0.6, // inner rings turn this much faster (alternating direction)
    spinRamp: 0.25, // seconds to spin up after the hit

    /* --- the metal --- */
    metalReflect: 1.2,
    metalGloss: 120,
    metalSpecular: 2.0,
    engrave: 0.6, // depth of the engraved channel lines
    rimGlow: 1.4, // glowing edge of each plate
    chargeGlow: 6.0, // how bright the channels burn when fully charged
    chargeCrawl: 2.4, // how fast the charge crawls round the channels
    impactRing: 4.0, // brightness of the ripple running out from the hit
    colorSteel: '#8fa6bd',
    colorSteelDeep: '#1a2433',
    colorSteelSpec: '#eef7ff',
    colorRimLight: '#92d5ff',
    colorCharge: '#c8f0ff',
    colorChargeHot: '#ffffff',

    /* ================================================================ */
    /* 2 · BOLT — the hostile shot                                       */
    /* ================================================================ */
    boltDelay: 0.35, // seconds after the shield locks before the bolt appears
    boltDistance: 9.0, // metres beyond the shield it is fired from
    boltSpeed: 22, // metres/second
    boltHeight: 1.45, // metres off the floor it flies at
    boltLength: 1.6, // metres of tail
    boltWidth: 0.22, // metres
    boltGlow: 4.0,
    boltWobble: 0.12, // metres of corkscrew
    boltTrail: 160, // sparks / second off its tail
    boltWarn: 0.3, // seconds of muzzle flare before it fires
    colorBoltCore: '#fff2e0',
    colorBolt: '#ff5a3c',

    /* --- the catch --- */
    catchShake: 0.35,
    catchFlash: 0.2,
    catchLight: 18,
    catchSparks: 90, // sparks spraying off the face
    catchRecoil: 0.18, // metres the shield is pushed back
    catchRecoilTime: 0.35, // seconds to recover

    /* ================================================================ */
    /* 3 · STORE — the blow held in the plates                           */
    /* ================================================================ */
    storeTime: 1.1, // seconds it holds the blow before firing it back
    storeShiver: 0.025, // metres the shield shivers while full
    storeArcs: 50, // sparks / second crackling round the rim while full
    storeHum: 0.12, // camera rumble while full

    /* ================================================================ */
    /* 4 · COUNTER-WAVE — the cone                                        */
    /* ================================================================ */
    coneAngle: 0.62, // half-angle at full width, radians
    coneStartAngle: 0.12, // half-angle as it leaves the face
    coneReach: 2.2, // how far it sweeps out from the shield, × zoneRadius
    sweepTime: 0.55, // seconds for the front to reach the end
    frontWidth: 0.5, // metres — the bright front band on the floor
    rayCount: 18, // light rays streaking out inside the cone
    chevrons: 5.0, // chevrons racing out per cone length
    floorGlow: 2.6,
    edgeGlow: 2.2, // the cone's two bounding edges
    lingerTime: 0.5, // seconds the scorched cone glows after the front passes
    wallHeight: 1.8, // metres — the standing wavefront
    wallGlow: 2.4,
    wallBands: 6.0, // horizontal bands in the wavefront
    distortion: 1.2, // screen warp of the wavefront
    releaseShake: 0.6,
    releaseFlash: 0.25,
    releaseLight: 30,
    colorConeA: '#9fe2ff',
    colorConeB: '#ffffff',
    colorFlash: '#d7f2ff',
    /** How a body in the cone is thrown. Same shape as `settings.dummies.hit`. */
    hit: { impulse: 11.0, lift: 4.5, spin: 1.8 },

    /* ================================================================ */
    /* 5 · PARTICLES                                                      */
    /* ================================================================ */
    sparkSize: 0.06,
    sparkLife: 0.5,
    sparkSpeed: 9,
    colorSparkA: '#ffffff',
    colorSparkB: '#cdeeff',
    colorSparkC: '#ff9a6a',
    colorSparkD: '#2a1a28',
    shardCount: 120, // chips thrown along the cone
    shardSize: 0.06,
    shardLife: 0.8,
    shardSpeed: 14,
    dustCount: 40, // dust kicked up along the front
    dustSize: 0.5,
    dustLife: 1.2,
    colorDustA: '#c9d6e3',
    colorDustB: '#7d8b99',
    colorDustC: '#3d454f',
    colorDustD: '#15181c',

    /* --- the light --- */
    lightColor: '#92d5ff',
    lightIntensity: 6,
    lightRadius: 9
  }
};
