/**
 * Clot Armor — Blood, zone cast.
 *
 * Blood runs down the line to the circle and floods it; out of the pool a
 * carapace of coagulated plates stands up round the rim — the outer ring, then
 * a taller inner ring leaning further in — and locks shut with a clank. It
 * hardens from wet red to dried maroon, throbs, then cracks and crumbles.
 *
 * Data only. ClotArmorAbility reads every field live.
 */
export default {
  id: 'clotarmor',
  meta: {
    label: 'Clot Armor',
    accent: '#ff3355',
    key: '',
    element: 'blood',
    hint: 'Blood — a carapace of clotted plates stands up round the circle and locks shut',
    cast: 'zone',
    glyph: '<path d="M30 84C26 60 30 38 42 20"/><path d="M70 84C74 60 70 38 58 20"/><path d="M42 84C40 62 44 42 50 28C56 42 60 62 58 84"/><path d="M24 86H76"/>'
  },
  settings: {
    // ---- the cast ----
    range: 18, // max cast distance (m)
    minRange: 2,
    speed: 22, // how fast the blood runs down the line (m/s)
    zoneRadius: 4.2, // the circle (m)
    cooldown: 0.6,
    castAnim: 'cast2',
    colorA: '#ff3355', // accent
    colorB: '#ffb3c0', // accent, pale

    // ---- timing (s) ----
    floodTime: 0.35, // the pool floods out to the rim over
    riseLead: 0.25, // first plate starts after (× floodTime)
    riseSpread: 0.38, // the ring of plates runs round the circle over
    riseTime: 0.26, // one plate stands up over
    innerDelay: 0.12, // the inner ring follows the outer by
    overshoot: 0.45, // springs past its lean and settles
    lifetime: 1.1, // the carapace stands for
    hardenTime: 0.8, // wet → dried over
    crumbleSpread: 0.45, // plates start to fail over
    crumbleTime: 0.75, // one plate cracks and crumbles over
    poolFade: 0.7, // the dried pool erodes over

    // ---- 1 · the plates ----
    outerCount: 12, // plates in the outer ring
    innerCount: 8, // plates in the inner ring
    plateWidth: 1.75, // at the base (m)
    plateHeight: 2.4, // outer plates (m)
    innerHeight: 2.9, // inner plates (m)
    innerRadius: 0.6, // inner ring radius (× circle)
    rimInset: 0.12, // outer ring sits this far inside the rim (m)
    outerLean: 0.4, // inward lean (rad)
    innerLean: 0.82, // inward lean of the inner ring (rad)
    plateCurve: 0.35, // edges curl back
    plateBulge: 0.1, // belly along the height
    plateTaper: 0.62, // 0 straight, 1 closes to a point
    plateThickness: 0.16, // m
    sizeJitter: 0.18, // per-plate height roll
    angleJitter: 0.25, // per-plate angle roll (× slot)
    beatAmp: 0.035, // heartbeat swell
    beatRate: 1.6, // beats per second while standing
    crumbleSink: 0.6, // plates sink this far as they fail (× height)
    crumbleTilt: 0.35, // and fall outward this far (rad)

    // ---- 1b · plate look ----
    colorCrust: '#2e0409',
    colorClot: '#5a0814',
    colorWet: '#a00c22',
    colorInner: '#c8102c',
    colorRim: '#ff3a52',
    colorCrack: '#ff4a5a',
    lames: 4.5, // overlapping bands per plate
    lameDepth: 0.8,
    lumpScale: 2.6,
    lumpBump: 0.7,
    wetGloss: 70,
    wetSpecular: 0.9,
    envSheen: 0.45,
    plateDiffuse: 0.8,
    plateAmbient: 0.28,
    rimGlow: 0.55,
    innerGlow: 0.35,
    crackScale: 3.2,
    crackGlow: 5,
    crumbleGlow: 6,

    // ---- 2 · the pool and the rivulet ----
    colorPoolDeep: '#3c0009',
    colorPoolFresh: '#8a0c22',
    colorPoolDried: '#2a0d0c',
    poolMargin: 0.35, // floods past the rim (m)
    poolRagged: 0.45,
    poolFingers: 0.55,
    poolGloss: 90,
    poolSpecular: 1.3,
    poolSheen: 0.7,
    poolOpacity: 0.95,
    tideLine: 0.8,
    rimRunGlow: 0.7, // the ring of blood glows as the plates rise from it
    rivuletWidth: 0.32, // m
    rivuletMeander: 0.35, // m

    // ---- 3 · droplets, mist, flakes ----
    dropCount: 14, // per plate as it breaks the surface
    dropSpeed: 5.5,
    dropSize: 0.09,
    dropLifetime: 0.9,
    dropGravity: -14,
    dripRate: 40, // drips off the standing carapace per second
    trailDrops: 120, // flung off the running head per second
    colorDropA: '#ff4b60',
    colorDropB: '#c8122c',
    colorDropC: '#7a0716',
    colorDropD: '#3a0008',
    mistRate: 26,
    mistSize: 1.1,
    mistLifetime: 1.6,
    mistOpacity: 0.45,
    colorMistA: '#7a0a18',
    colorMistB: '#5a0612',
    colorMistC: '#34040b',
    colorMistD: '#160204',
    flakeCount: 26, // per plate as it crumbles
    flakeSize: 0.12,
    flakeSpeed: 2.6,
    flakeLifetime: 1.2,
    colorFlakeA: '#6c0a18',
    colorFlakeB: '#4a0610',
    colorFlakeC: '#2e0409',
    colorFlakeD: '#1a0204',

    // ---- 4 · the beat ----
    arriveShake: 0.25, // the flood
    clankShake: 0.6, // the carapace locks
    clankFlash: 0.35,
    colorFlash: '#ff6070',
    clankLight: 30, // light punch
    splashRadius: 2.6,
    splashLife: 0.55,
    colorBurstA: '#ff5068',
    colorBurstB: '#a0102a',
    colorBurstC: '#2a0006',
    shockRadius: 7.5,
    shockLife: 0.7,
    colorShockA: '#ff3a52',
    colorShockB: '#ffd0d8',
    warpStrength: 0.9,
    warpRadius: 6.5,
    warpWidth: 0.12,
    warpTime: 0.55,

    // ---- light ----
    lightColor: '#ff4058',
    lightIntensity: 9,
    lightRadius: 10,
    lightHeight: 1.8,
    lightFlicker: 0.25
  }
};
