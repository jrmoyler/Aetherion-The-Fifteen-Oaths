/**
 * Sigil Gate — Arcane, zone cast.
 *
 * A ley line of runes races to the circle. At its far rim two obelisks punch
 * up and between them a ring of dark stone rises out of the floor — a gate,
 * standing face-on to the caster, its seal inscribing itself ring by ring and
 * turning. Then the gate falls: it tips toward the caster like a felled door
 * and slams flat onto the circle, stamping the seal into the floor white-hot.
 * Everything under it is crushed outward. The gate lifts away into motes and
 * the brand cools to a violet scar.
 *
 * Data only. SigilGateAbility reads every field live.
 */
export default {
  id: 'sigilgate',
  meta: {
    label: 'Sigil Gate',
    accent: '#c9d2ff',
    key: '',
    element: 'arcane',
    hint: 'Arcane — a sigil gate rises, falls flat on the circle and brands it',
    cast: 'zone',
    glyph: '<circle cx="50" cy="44" r="26"/><circle cx="50" cy="44" r="9"/><path d="M18 88V30M82 88V30"/><path d="M12 88H88"/>'
  },
  settings: {
    // ---- the cast ----
    range: 18, // max cast distance (m)
    minRange: 2,
    speed: 22, // the ley line runs at (m/s)
    zoneRadius: 4.4, // the circle (m)
    cooldown: 0.6,
    castAnim: 'cast1',
    colorA: '#c9d2ff', // accent
    colorB: '#ffffff', // accent, hot

    // ---- timing (s) ----
    riseTime: 0.38, // the gate and posts rise over
    standTime: 0.32, // it stands, seal turning, for
    fallTime: 0.36, // it falls flat over (accelerating)
    bounce: 0.06, // rebounds this far off the floor (rad)
    lifetime: 1.1, // lies branding the circle for
    liftTime: 0.6, // the gate lifts away into motes over
    brandFade: 1.3, // the scar cools and fades over

    // ---- 1 · the gate ----
    gateScale: 0.9, // ring radius (× circle)
    frameThickness: 0.17, // m
    innerRing: 0.88, // the inner ring (× ring radius)
    spikeCount: 12,
    spikeLength: 0.75, // m
    spikeWidth: 0.2, // m
    postHeight: 5.2, // m
    postWidth: 0.7, // m
    postGap: 0.7, // posts stand this far outside the ring (m)
    colorStone: '#14121f',
    colorStoneVein: '#3a3658',
    colorRune: '#8ea0ff',
    colorHot: '#ffffff',
    runeGlow: 2.2,
    runeScale: 54, // runes round the ring
    stoneSheen: 0.8,
    stoneSpecular: 0.6,

    // ---- 2 · the seal ----
    colorSeal: '#a8b8ff',
    colorFilm: '#3a2a8a',
    sealGlow: 2.6,
    sealLineWidth: 0.013, // × ring radius
    filmGlow: 0.35,
    spinSpeed: 0.7, // rad/s, rings turning against each other
    flare: 2.2, // the seal blazes as the gate falls

    // ---- 3 · the brand ----
    colorBrand: '#b088ff',
    colorScar: '#5a3aa8',
    colorChar: '#07060c',
    brandGlow: 2.2,
    burnCool: 0.9, // white-hot cools over (s)
    charDarkness: 0.75,
    charMargin: 0.9, // scorched past the rim (m)

    // ---- 4 · the crush ----
    slamImpulse: 7,
    slamLift: 2,
    slamSpin: 2,

    // ---- 5 · motes, sparks, dust ----
    moteRate: 120, // drawn into the seal while it stands
    moteSize: 0.07,
    moteSpeed: 3,
    moteLifetime: 0.8,
    moteGlow: 2.6,
    brandMotes: 90, // rising off the brand per second
    colorMoteA: '#ffffff',
    colorMoteB: '#c9d2ff',
    colorMoteC: '#7c8cff',
    colorMoteD: '#241a5a',
    sparkCount: 110,
    sparkSpeed: 12,
    sparkSize: 0.05,
    sparkLifetime: 0.5,
    sparkStretch: 0.45,
    colorSparkA: '#ffffff',
    colorSparkB: '#c9d2ff',
    colorSparkC: '#8a6cff',
    colorSparkD: '#2a1a60',
    dustCount: 60,
    dustSize: 1.0,
    dustSpeed: 6,
    dustLifetime: 1.2,
    dustOpacity: 0.55,
    colorDustA: '#6a6488',
    colorDustB: '#4a4466',
    colorDustC: '#2a2640',
    colorDustD: '#141220',

    // ---- 6 · the beat ----
    riseShake: 0.2,
    slamShake: 0.85,
    slamFlash: 0.5,
    colorFlash: '#d8dcff',
    slamLight: 45,
    burstRadius: 4.5,
    burstLife: 0.5,
    colorBurstA: '#ffffff',
    colorBurstB: '#a8b8ff',
    colorBurstC: '#4a3aa8',
    shockRadius: 10,
    shockLife: 0.8,
    colorShockA: '#a8b8ff',
    colorShockB: '#ffffff',
    dustRingRadius: 7,
    dustRingLife: 1.4,
    slamWarp: 1.2,
    slamWarpRadius: 9,
    slamWarpTime: 0.6,
    leyArcSpacing: 1.6, // m between rune burns on the ley line
    leyArcLife: 1.0,

    // ---- light ----
    lightColor: '#c9d2ff',
    lightIntensity: 9,
    lightRadius: 10,
    lightFlicker: 0.2
  }
};
