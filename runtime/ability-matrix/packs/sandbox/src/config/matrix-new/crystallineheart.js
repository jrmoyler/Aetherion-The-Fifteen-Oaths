/**
 * Crystalline Heart — Crystal — a beating crystal heart whose pulses ripple outward.
 *
 * Matrix New data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * One clock from the moment the mote of light reaches the circle: the heart
 * descends into it, settles to float, and beats `beats` times in a lub-dub
 * rhythm, each beat a little sooner than the last. The final beat shatters it.
 * Every number below is read every frame — drag `beats` or `beatAccel` while
 * it is beating and the rhythm re-times around the beat it is on.
 */
export default {
  id: 'crystallineheart',
  meta: {
    label: "Crystalline Heart",
    accent: '#ffb0d8',
    key: 'U',
    hint: "Crystal — a crystal heart descends and beats ever faster; each pulse ripples out, the last one shatters it",
    cast: 'zone',
    glyph: `<path d="M50 84L18 50C8 38 16 18 32 18C42 18 48 26 50 32C52 26 58 18 68 18C84 18 92 38 82 50Z"/><path d="M32 18L42 40L50 32L58 40L68 18M18 50L42 40L50 84L58 40L82 50"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 14, // maximum cast distance, metres
    minRange: 0, // zero: it can be called down right in front of you
    speed: 18, // how fast the mote of light flies to the circle, metres/second
    lifetime: 4.2, // seconds the heart is there for, descent through the final beat (its rhythm is fitted to this)
    cooldown: 0.9, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 5, // the circle the aim indicator measures out; the shatter kills inside it
    fadeTime: 1.8, // seconds the shards fall and the rings fade after the shatter
    colorA: '#ffe0f0', // the heart's light
    colorB: '#ffffff', // the shatter flash

    /* --- the mote (travel) --- */
    handHeight: 1.4, // metres off the floor the mote leaves the hand at; it arcs up to where the heart descends from
    moteRate: 160, // glints per second it trails
    moteSize: 0.08,

    /* ================================================================ */
    /* 1 · THE HEART                                                     */
    /* ================================================================ */
    heartSize: 1.15, // metres across the lobes
    heartDepth: 0.55, // front-to-back thickness, × size
    heartFacets: 1.0, // how hard the facets are cut (rebuild)
    heartHeight: 1.7, // metres of floor under its centre while it floats
    descendFrom: 3.2, // metres above that it starts
    descendTime: 0.9, // seconds to come down
    bobAmount: 0.08, // metres of float
    bobRate: 0.6, // bobs per second
    swayAngle: 0.6, // rad it turns either way about its axis — it always comes back to face the camera
    swayRate: 0.25, // sways per second
    tilt: 0.12, // rad it leans toward the caster

    /* --- the beat --- */
    beats: 6, // beats including the shattering one (max 16)
    firstBeat: 0.35, // seconds after it has settled
    beatAccel: 0.72, // each gap is this × the last (1 = steady)
    dubGap: 0.22, // seconds from lub to dub, × the current gap (shrinks with the rhythm)
    dubStrength: 0.6, // the dub's swell, × the lub's
    beatSwell: 0.16, // how much the heart grows on a beat, × size
    beatAttack: 0.06, // seconds to swell
    beatRelease: 0.35, // seconds to relax
    beatShake: 0.12,
    beatLight: 6, // light punch per beat
    beatFlash: 0.08,

    /* --- the crystal --- */
    crystalIOR: 0.55, // how far the inside appears shifted — the refraction
    crystalDispersion: 0.12, // R/G/B refracted differently
    crystalEnv: 0.9, // sky reflected in the facets
    crystalFresnel: 1.6,
    crystalFresnelPower: 3.0,
    crystalTint: 0.9, // how pink the body is
    crystalFacetLines: 1.2, // brightness of the cut edges
    crystalSpecular: 3.0,
    crystalGloss: 90,
    innerGlow: 0.75, // the light in the core at rest
    innerBeat: 2.6, // how much a beat punches it
    innerSize: 0.34, // fraction of the heart the core light fills
    innerNoise: 0.5, // how much the inner light swims
    crystalOpacity: 0.92,
    colorCrystal: '#ff7ab8',
    colorCrystalDeep: '#7a1048',
    colorInner: '#ff9ccb',
    colorFacet: '#ffaed4',
    colorSpec: '#ffd2e8',

    /* ================================================================ */
    /* 2 · RIPPLE RINGS on the floor                                     */
    /* ================================================================ */
    ringSpeed: 6, // metres/second a beat's ring runs out
    ringReach: 1.25, // × zoneRadius it travels before dying
    ringWidth: 0.22, // metres
    ringGlow: 2.4,
    ringCaustic: 0.6, // caustic sparkle in the wake
    ringOpacity: 0.9,
    sigilGlow: 0.6, // the faint faceted sigil under the heart
    colorRingCore: '#ffffff',
    colorRingGlow: '#ff8cc6',
    colorRingWake: '#a0306a',

    /* ================================================================ */
    /* 3 · SHOCKWAVES (screen-space)                                     */
    /* ================================================================ */
    shockStrength: 0.9, // per beat
    shockSize: 7, // metres
    shockTime: 0.45,
    shatterShock: 2.0, // × on the final beat

    /* ================================================================ */
    /* 4 · GLINTS                                                        */
    /* ================================================================ */
    glintPerBeat: 40,
    glintSpeed: 3.2,
    glintSize: 0.07,
    glintLifetime: 1.1,
    glintGravity: -2.5,
    glintGlow: 3.0,
    idleGlints: 14, // per second while it floats
    colorGlintA: '#ffffff',
    colorGlintB: '#ffd0ea',
    colorGlintC: '#ff7ab8',
    colorGlintD: '#5a0a30',

    /* ================================================================ */
    /* 5 · THE SHATTER                                                   */
    /* ================================================================ */
    shardCount: 56, // (max 72)
    shardSpeed: 6.5,
    shardSpeedJitter: 0.5,
    shardLift: 0.35,
    shardGravity: -14,
    shardDrag: 0.6,
    shardLife: 1.6,
    shardSize: 0.22, // metres
    shardSpin: 9,
    shardBounce: 0.35, // fraction of speed kept off the floor
    burstRadius: 4.5,
    burstLife: 0.6,
    burstIntensity: 2.2,
    colorBurstA: '#ffffff',
    colorBurstB: '#ffb0d8',
    colorBurstC: '#c03a80',
    killReach: 1.0, // × zoneRadius
    killImpulse: 8,
    killLift: 5,
    killSpin: 1.8,
    shatterShake: 0.8,
    shatterFlash: 0.6,
    shatterLight: 4, // × intensity
    decalLife: 1.0,
    colorDecalA: '#ff8cc6',
    colorDecalB: '#ffffff',

    /* --- light --- */
    lightColor: '#ffb0d8',
    lightIntensity: 6,
    lightRadius: 9
  }
};
