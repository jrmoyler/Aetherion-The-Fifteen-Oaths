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
    shieldRadius: 1.5, // metres, outer edge of the outer ring
    shieldHeight: 1.6, // metres off the floor to the shield's centre
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
    assembleTime: 0.34, // seconds for the plates to fly in and lock
    assembleStagger: 0.35, // fraction of that the last plate lags the first
    scatter: 2.8, // metres the plates fly in from
    assembleTumble: 5.0, // radians of tumble on the way in

    /* --- spin --- */
    spinIdle: 0.45, // radians/second the rings turn while waiting
    spinCharged: 6.0, // ...once the blow is stored in them
    spinSpread: 0.6, // inner rings turn this much faster (alternating direction)
    spinRamp: 0.25, // seconds to spin up after the hit

    /* --- the metal --- */
    metalReflect: 0.6,
    metalGloss: 90,
    metalSpecular: 1.6,
    engrave: 0.75, // depth of the engraved channel lines
    rimGlow: 0.9, // glowing edge of each plate
    rimWidth: 0.05, // how much of a plate the lit chamfer covers, 0..0.5
    chargeGlow: 2.4, // how bright the channels burn when fully charged
    chargeCrawl: 2.4, // how fast the charge crawls round the channels
    impactRing: 2.0, // brightness of the ripple running out from the hit
    colorSteel: '#335a8a',
    colorSteelDeep: '#040912',
    colorSteelSpec: '#dff2ff',
    colorRimLight: '#3d9bff',
    colorCharge: '#2f9bff',
    colorChargeHot: '#cdeeff',

    /* ================================================================ */
    /* 2 · BOLT — the hostile shot                                       */
    /* ================================================================ */
    boltDelay: 0.0, // seconds after the shield locks before the bolt appears
    boltDistance: 7.5, // metres beyond the shield it is fired from
    boltSpeed: 13, // metres/second
    boltHeight: 2.6, // metres off the floor it flies at
    boltLength: 3.4, // metres of tail
    boltWidth: 0.5, // metres
    boltGlow: 2.6,
    boltWobble: 0.12, // metres of corkscrew
    boltTrail: 160, // sparks / second off its tail
    boltWarn: 0.3, // seconds of muzzle flare before it fires
    colorBoltCore: '#fff4e6',
    colorBolt: '#ff4a1c', // saturated body of the four-stop bolt ramp
    colorBoltPale: '#ffc890', // pale inner sheath
    colorBoltDeep: '#3c0703', // deep ember tail — most of the bolt's length
    boltYaw: 0.62, // radians the muzzle is swung off the aim line, so the shot crosses the frame
    muzzleSparks: 160, // embers drawn into the muzzle while it gathers, per second

    /* --- the catch --- */
    catchShake: 0.35,
    catchFlash: 0.2,
    catchLight: 18,
    catchSparks: 140, // sparks spraying off the face
    catchRecoil: 0.18, // metres the shield is pushed back
    catchRecoilTime: 0.35, // seconds to recover

    /* ================================================================ */
    /* 3 · STORE — the blow held in the plates                           */
    /* ================================================================ */
    storeTime: 0.42, // seconds it holds the blow before firing it back
    storeShiver: 0.025, // metres the shield shivers while full
    storeArcs: 90, // sparks / second crackling round the rim while full
    storeHum: 0.12, // camera rumble while full

    /* ================================================================ */
    /* 4 · COUNTER-WAVE — the cone                                        */
    /* ================================================================ */
    coneAngle: 0.62, // half-angle at full width, radians
    coneStartAngle: 0.12, // half-angle as it leaves the face
    coneReach: 2.2, // how far it sweeps out from the shield, × zoneRadius
    sweepTime: 0.6, // seconds for the front to reach the end
    frontWidth: 0.5, // metres — the bright front band on the floor
    rayCount: 18, // light rays streaking out inside the cone
    chevrons: 5.0, // chevrons racing out per cone length
    floorGlow: 2.2,
    edgeGlow: 2.2, // the cone's two bounding edges
    lingerTime: 0.8, // seconds the scorched cone glows after the front passes
    wallHeight: 3.7, // metres — the standing wavefront
    wallGlow: 2.0,
    wallBands: 4.0, // horizontal bands in the wavefront
    wallDeep: 0.8, // dark body of the wavefront under its bands, 0..1
    wallCrest: 2.0, // the torn bright crest along the wavefront's top
    wallGrow: 0.3, // the wavefront grows by this much (×) as it runs out
    wallLinger: 0.45, // seconds the wavefront rolls on after the front (and its hits) is done — presentation only
    scarGlow: 1.1, // burnt rays, veins and edges left glowing on the swept floor, cooling over the linger
    distortion: 1.2, // screen warp of the wavefront
    releaseBurst: 1.6, // air burst off the face, × shieldRadius
    releaseShake: 0.6,
    releaseFlash: 0.25,
    releaseLight: 30,
    colorConeA: '#2a86ff',
    colorConeB: '#dff2ff',
    colorConeDeep: '#020814', // the scorched path the wave leaves — the cone's mass
    coneDeep: 0.62, // how dark that path is, 0..1
    colorFlash: '#bfe2ff',
    /** How a body in the cone is thrown. Same shape as `settings.dummies.hit`. */
    hit: { impulse: 11.0, lift: 4.5, spin: 1.8 },

    /* ================================================================ */
    /* 5 · PARTICLES                                                      */
    /* ================================================================ */
    sparkSize: 0.06,
    sparkLife: 0.5,
    sparkSpeed: 9,
    colorSparkA: '#ffffff',
    colorSparkB: '#ffd6ae',
    colorSparkC: '#ff5a2a',
    colorSparkD: '#2a0a06',
    shardCount: 160, // chips thrown along the cone
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

    /* ================================================================ */
    /* 6 · SEAL — the engraved disc the shield stands on                  */
    /* ================================================================ */
    sealRadius: 1.35, // × shieldRadius
    sealGlow: 1.5,
    sealDeep: 0.7, // how dark the disc is under its engraving, 0..1
    sealRunes: 14, // rune bars round the outer band
    sealSpin: 0.35, // radians/second (×5 while the blow is held)
    sealTelegraph: 1, // 0..1 — the rings closing on the mark while the anchor flies
    colorSealDeep: '#030914',
    colorSeal: '#1f6fe0',
    colorSealHot: '#bfe6ff',

    /* --- the light --- */
    lightColor: '#3d9bff',
    lightIntensity: 6,
    lightRadius: 9
  }
};
