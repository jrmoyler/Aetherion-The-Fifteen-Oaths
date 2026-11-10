/**
 * Photon Doppel — light, zone cast. Data only, no imports.
 *
 * An *absorbing light decoy*. A photon packet is wound up at the caster's
 * hand and thrown to the circle, where it stands up as a hooded figure of
 * light — a doppelgänger with its arms open. For `absorbTime` seconds it
 * **drinks light**: every enemy inside `lureRadius` is exposed by it (a
 * tether of their light is pulled into the figure and, under combat, a light
 * status is laid on them), hits other casts land inside its circle are soaked
 * up, corpses on the floor are drawn toward it, and the scene's own light
 * dims as its core goes dark. Then it is **overexposed**: it whites out and
 * bursts, striking every enemy inside `zoneRadius` once, harder for every
 * exposure it absorbed, and leaves a sun-print burned into the floor.
 *
 * Every key below is a live editor control, read every frame.
 */
export default {
  id: 'photonDoppel',
  meta: {
    label: 'Photon Doppel',
    accent: '#ffe6a8',
    element: 'light',
    cast: 'zone',
    hint: 'Light — a decoy of light drinks every exposure around it, then overexposes in one blinding strike',
    glyph:
      '<path d="M50 10C42 10 38 18 38 26C38 32 41 36 44 38L30 46L14 40L30 52L36 90H64L70 52L86 40L70 46L56 38C59 36 62 32 62 26C62 18 58 10 50 10Z"/><path d="M50 52V74M40 62H60"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 18, // max cast distance (m)
    minRange: 2, // min cast distance (m)
    speed: 26, // the photon packet flies to the circle at (m/s)
    cooldown: 4, // (s)
    castAnim: 'cast2',
    lifetime: 3.6, // nominal cast length, for the HUD (s)
    zoneRadius: 3.2, // overexposure strike radius (m)
    lureRadius: 5.2, // the decoy exposes enemies this far out (m, never below zoneRadius)

    /* --- the decoy's rule (gameplay) --- */
    absorbTime: 1.35, // the decoy drinks light this long before it overexposes (s × global lifetime)
    markInterval: 0.1, // how often it looks for new enemies to expose (s)
    maxMarks: 6, // most enemies one decoy can expose (≤ 8)
    chargePerMark: 0.25, // charge gained per exposed enemy (0..1 total)
    chargePerHit: 0.2, // charge gained per other cast's hit soaked up inside the circle
    maxSoaked: 4, // most foreign hits one decoy can soak up
    baseDamage: 1, // overexposure damage with nothing absorbed
    bonusDamage: 2, // extra damage at full charge (rounded)
    hitImpulse: 9, // knockback at zero charge (× explosion intensity)
    hitLift: 5, // lift at zero charge
    hitSpin: 2.2, // tumble
    chargeForce: 0.8, // extra knockback and lift at full charge (× base)
    statusSeconds: 2, // the light status an exposure lays (combat only, s)
    bodyPull: 0.3, // how hard corpses on the floor are drawn to the decoy (0..1 per frame)
    bodyBuoyancy: 0.25, // how much of a drawn corpse's weight the light carries (0..1)
    bodyThrow: 6, // drawn corpses are thrown outward at overexposure (m/s)

    /* --- timing (× global lifetime) --- */
    chargeTime: 0.22, // the packet winds up at the hand before it flies (s)
    formTime: 0.3, // the decoy rises out of the floor over (s)
    exposureLinger: 1.05, // the burn, shards and afterimage play out for (s)
    shatterTime: 0.55, // the figure burns away over (s)
    fadeTime: 0.7, // the floor print dissolves over (s)

    /* --- light --- */
    lightColor: '#fff1cf',
    lightIntensity: 6,
    lightRadius: 9,
    formLight: 4, // light punch when the decoy forms (× explosion intensity)
    exposureLight: 14, // light punch at the overexposure (× explosion intensity)
    absorbDim: 0.65, // how far the light sinks as the decoy drinks it (0..1 at full charge)

    /* --- palette: the four-stop ramp --- */
    coreColor: '#ffffff', // white-hot core
    tintColor: '#fff0c8', // pale tint
    bodyColor: '#ffb93f', // saturated sun-gold body
    deepColor: '#24150a', // the dark the decoy drinks the light into

    /* --- 1 · the figure (hero) --- */
    figureHeight: 0.95, // figure height (× zoneRadius)
    figureWidth: 1, // shoulder width (× height)
    bodyGlow: 0.85, // body brightness
    bodyOpacity: 0.72, // body opacity away from the rim
    rimGlow: 3.2, // white-hot rim (HDR)
    rimPower: 2.2, // rim sharpness
    prismSplit: 0.8, // prismatic fringe on the rim
    umbraStrength: 0.95, // how dark the core goes as it drinks
    flowBands: 3.2, // bands of light flowing into the heart
    flowSpeed: 1.2, // their speed
    breathDepth: 0.05, // chest swell
    breathRate: 2.4, // breaths (rad/s), quickening with charge
    swayAmount: 0.05, // lean from the hem
    robeRipple: 0.08, // hem ripple
    armRaise: 0.75, // the arms lift this far by full charge (rad)
    turnSpeed: 0.35, // the figure turns slowly as it drinks (rad/s)
    whiteOut: 0.18, // the white-out before it burns away (s)

    /* --- 2 · the halo and shards (solid crystallised light) --- */
    haloCount: 12, // shards hovering behind the head before the overexposure
    haloRadius: 0.24, // halo radius (× figure height)
    haloSpin: 0.9, // halo turn (rad/s)
    shardSize: 0.45, // shard length (m)
    shardSpeed: 5, // thrown outward at (m/s)
    shardLift: 4.5, // thrown upward at (m/s)
    shardGravity: 14, // fall (m/s²)
    shardSpin: 7, // tumble (rad/s)
    shardGlow: 2.4, // emissive while hot
    shardMetalness: 0.15,
    shardRoughness: 0.12,

    /* --- 3 · the streamers (light drawn in) --- */
    streamerGlow: 1.6,
    streamerWidth: 0.12, // ribbon height (m)
    streamerSpeed: 1.3, // dashes run inward at
    streamerDashes: 4, // dashes per ribbon
    streamerSpin: 0.6, // the spiral turns at (rad/s)
    streamerOpacity: 0.9,

    /* --- 4 · the tethers (each exposed enemy) --- */
    tetherGlow: 2.6,
    tetherWidth: 0.24, // (m)
    tetherArc: 0.8, // how high the tether arcs (× its length × 0.25)
    tetherSpeed: 2.2, // pulses run into the decoy at

    /* --- 5 · the floor --- */
    fieldGlow: 1.3, // rays, rings, feet glow
    fieldOpacity: 0.95,
    telegraphGlow: 1.6, // the strike circle
    rayCount: 26, // converging rays
    raySpeed: 0.8, // they run inward at
    umbraRadius: 0.55, // the dark under the decoy (× zoneRadius)
    burnGlow: 1.8, // the sun-print at the overexposure
    burnCool: 1.4, // the print cools over (s)
    dissolveTime: 0.85, // fraction of the fade spent dissolving

    /* --- 6 · the photon packet (travel) --- */
    packetSize: 0.8, // (m)
    packetHeight: 1.15, // flies at this height (m)
    packetGlow: 2.6,
    trailRate: 110, // trail sparks per second
    trailSize: 0.07,
    trailLife: 0.32,

    /* --- 7 · the flare --- */
    flareSize: 2.6, // starburst size (m)
    flareStretch: 3.2, // anamorphic streak (× size)
    flareGlow: 2.4,
    flareTime: 0.45, // decays over (s)

    /* --- 8 · particles --- */
    moteRate: 80, // motes drawn in per second while it drinks
    moteSize: 0.09,
    moteLife: 0.85,
    moteGlow: 1.6,
    sparkCount: 90, // sparks at the overexposure
    sparkSize: 0.07,
    sparkLife: 0.55,
    sparkSpeed: 10,
    glintCount: 44, // glints thrown off the figure
    glintSize: 0.13,
    glintLife: 1.1,
    glintSpeed: 4,
    colorSparkA: '#ffffff',
    colorSparkB: '#fff0c8',
    colorSparkC: '#ffb93f',
    colorSparkD: '#3a2208',

    /* --- 9 · impacts --- */
    formShake: 0.08, // camera knock when the decoy forms (× explosion intensity)
    exposureShake: 0.32, // at the overexposure
    shakeDecay: 6,
    shakeFrequency: 22,
    formFlash: 0.08,
    exposureFlash: 0.35,
    burstReach: 1.1, // overexposure shell grows to (× zoneRadius)
    burstLife: 0.5,
    burstIntensity: 1,
    burstOpacity: 0.7,
    burstFresnel: 2.5,
    burstSquash: 0.6,
    colorBurstA: '#ffffff',
    colorBurstB: '#ffe6a8',
    colorBurstC: '#c77a1c',
    decalLife: 2.4, // scorch and shockwave decals last (s)
    scorchIntensity: 0.9,
    shockwaveWidth: 0.07,
    shockwaveIntensity: 1.2,

    /* --- 10 · the warp --- */
    warpPull: 0.5, // inward pull while it drinks (× global distortion)
    warpShock: 1, // pressure ring at the overexposure
  },
};
