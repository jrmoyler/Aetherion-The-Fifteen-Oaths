/**
 * Crimson Rite — Blood — a moon-lit rite that impales the circle.
 *
 * Collective Originals data block: presentation (`meta`) and the live settings
 * the ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * The rite runs on one clock from the moment the seal lands: the moon rises,
 * the circle is drawn, the blood spreads, the spikes erupt in waves, and then
 * the whole thing sinks and dries. Every number below is read every frame.
 */
export default {
  id: 'crimson',
  meta: {
    label: "Crimson Rite",
    accent: '#ff2f4f',
    key: 'Z',
    hint: "Blood — a moon-lit rite that impales the circle",
    cast: 'zone',
    glyph: `<circle cx="50" cy="30" r="16"/><path d="M26 86L34 56L40 86M46 86L52 50L58 86M62 86L68 60L74 86"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 16, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 30, // how fast the blood seal flies to the circle, metres/second
    lifetime: 2.2, // seconds from the seal landing until the spikes start to sink
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 3.2, // the circle the aim indicator measures out, metres
    fadeTime: 1.6, // seconds for the spikes to sink and the pool to dry
    handHeight: 1.4, // metres off the floor the seal leaves the hand at
    sealArc: 1.1, // metres the seal's flight arcs above a straight line
    sealSize: 0.12, // droplet size of the seal's own trail

    /* --- the beats of the rite, seconds after the seal lands --- */
    drawTime: 0.55, // the ritual circle is drawn on over this
    poolDelay: 0.25, // blood starts welling up this long after landing
    poolTime: 0.6, // ... and has spread across the circle after this
    eruptDelay: 0.75, // the first wave of spikes breaks the surface

    /* ================================================================ */
    /* 1 · THE BLOOD MOON                                                */
    /* ================================================================ */
    moonRadius: 1.5, // metres — it is close, and enormous for it
    moonHeight: 3.9, // metres above the circle at the top of its rise — kept
    // low so the default chase camera (pitched down at the cast) frames it
    moonBehind: 4.2, // metres beyond the circle, along the cast
    moonRiseFrom: 2.4, // metres below its final height it rises from
    moonRiseTime: 0.8, // seconds to rise
    moonSpin: 0.12, // rad/s the face turns
    moonMaria: 0.45, // depth of the dark seas, 0..1
    moonMariaScale: 1.7,
    moonCraters: 0.65,
    moonCraterScale: 3.6,
    moonLimb: 0.55, // limb darkening exponent
    moonSurface: 0.25, // fine speckle
    moonRimWidth: 0.035, // the bright rim, in moon radii
    moonRimGlow: 2.6,
    moonHalo: 0.85, // the soft red halo
    moonHaloFalloff: 2.4, // how fast the halo fades, per moon radius
    moonHaloReach: 2.6, // the halo quad's half-width, in moon radii
    moonFlicker: 0.05,
    moonBrightness: 1.0,
    moonPulse: 0.45, // how much the moon flares when the spikes erupt

    /* ================================================================ */
    /* 2 · THE RITUAL CIRCLE                                             */
    /* ================================================================ */
    circleRadius: 1.08, // × zoneRadius
    circleRuneInner: 0.8, // inner edge of the rune band, × radius
    circleInnerRing: 0.36, // inner circle, × radius
    circleStarRadius: 0.8, // star vertices, × radius
    circleStarPoints: 7, // points of the star
    circleStarSkip: 3, // vertices skipped per stroke (7 / 3 is a heptagram)
    circleRunes: 16, // runes in the band
    circleRuneSize: 0.82, // rune height, × band width
    circleLine: 0.022, // stroke half-width, metres
    circleGlowWidth: 0.09, // glow around strokes, metres
    circleCoreGlow: 3.2,
    circleHaloGlow: 0.9,
    circleSpin: 0.25, // rad/s the rune band turns
    circleStarSpin: -0.12, // rad/s the star turns
    circlePulse: 0.25,
    circlePulseRate: 3.2,
    circleOpacity: 1.0,
    circleFadeEarly: 0.5, // fraction of the fade the circle is gone by

    /* ================================================================ */
    /* 3 · THE BLOOD POOL                                                */
    /* ================================================================ */
    poolRadius: 0.95, // × zoneRadius
    poolEdgeNoise: 0.22, // fingering of the edge, × the radius
    poolEdgeScale: 2.4,
    poolFeather: 0.03, // metres of soft edge
    poolSplatter: 1.0, // size of the beads thrown past the edge
    poolSplatterScale: 3.2, // beads per metre
    poolMeniscus: 0.035, // the raised lip at the edge
    poolRipple: 0.012,
    poolRippleScale: 2.2,
    poolBump: 1.0, // how much the height field bends the highlight
    poolGloss: 160, // highlight tightness
    poolSpecular: 3.5,
    poolEnv: 0.7, // sky reflected in it
    poolFresnel: 1.0,
    poolOpacity: 0.96,
    poolTideLine: 0.75, // dark ring left at the edge as it dries
    poolHeight: 0.014, // metres above the floor it is drawn at
    stainLife: 7.0, // seconds the dried stain (a decal) stays on the floor afterwards
    stainIntensity: 0.75,

    /* ================================================================ */
    /* 4 · THE SPIKES                                                    */
    /* ================================================================ */
    spikeCount: 46, // spikes per cast (max 96)
    spikeWaves: 3, // waves the eruption comes in
    spikeWaveGap: 0.16, // seconds between waves
    spikeJitter: 0.05, // random delay within a wave, seconds
    spikeSpread: 0.92, // how far out the spikes stand, × pool radius
    spikeHeight: 2.0, // metres, at the middle
    spikeEdgeHeight: 0.55, // height at the rim, × spikeHeight
    spikeHeightJitter: 0.35,
    spikeRadius: 0.16, // base radius, metres
    spikeRadiusJitter: 0.35,
    spikeLean: 0.32, // radians they lean outward at the rim
    spikeLeanJitter: 0.22,
    spikeRise: 0.13, // seconds to break the surface and reach the top
    spikeOvershoot: 0.22, // how far past full height the punch carries
    spikeSettle: 0.22, // seconds to settle back to full height
    spikeSink: 0.8, // fraction of the fade they take to sink
    spikeTwist: 0.9, // radians of twist root to tip (rebuilds geometry)
    spikeBend: 0.12, // sideways bend of the tip (rebuilds geometry)
    spikeLumps: 0.12, // surface lumpiness (rebuilds geometry)
    spikeGloss: 90,
    spikeSpecular: 2.2,
    spikeEnv: 0.9,
    spikeRim: 2.2,
    spikeRimPower: 3.0,
    spikeInnerGlow: 1.6, // light glowing up out of the pool at the base
    spikeVeins: 0.8,
    spikeVeinScale: 3.2,
    spikeDrip: 0.6,
    spikeShake: 0.22, // camera knock per wave

    /* ================================================================ */
    /* 5 · DROPLETS & MIST                                               */
    /* ================================================================ */
    dropPerSpike: 9, // droplets flung off each spike as it erupts
    dropSpeed: 5.5,
    dropSize: 0.07,
    dropLifetime: 0.9,
    dropGravity: -14,
    dripRate: 20, // drips/s running off the spike tips while they stand
    wellRate: 50, // droplets/s welling up as the pool spreads
    mistRate: 26, // low red mist puffs/s
    mistSize: 1.4,
    mistLifetime: 2.2,
    mistRise: 0.12, // m/s²; positive rises
    mistOpacity: 0.32,
    mistHeight: 0.25, // metres off the floor it is born at
    trailRate: 90, // droplets/s shed by the seal in flight

    /* ================================================================ */
    /* 6 · THE IMPALING                                                  */
    /* ================================================================ */
    killReach: 1.0, // bodies within this × zoneRadius are taken
    killImpulse: 3.0, // m/s outward — a spike lifts more than it throws
    killLift: 7.5, // m/s up
    killSpin: 1.0,
    eruptFlash: 0.35,
    eruptShake: 0.45,
    sealShake: 0.18,
    burstRadius: 2.6, // the blood-water burst at the eruption
    burstLife: 0.5,

    /* --- light --- */
    lightColor: '#ff2f4f',
    lightIntensity: 6,
    lightRadius: 9,
    eruptLight: 9, // light punch at the eruption

    /* --- palette --- */
    colorMoonLight: '#ff6a3d',
    colorMoonDark: '#4a0606',
    colorMoonRim: '#ffb08a',
    colorMoonHalo: '#c3101e',
    colorCircleCore: '#ff6a6a',
    colorCircleGlow: '#d0001c',
    colorPoolWet: '#6e0610',
    colorPoolDeep: '#250104',
    colorPoolSpec: '#ffd8d0',
    colorPoolStain: '#2a0a0a',
    colorSpikeBody: '#8a0a18',
    colorSpikeDeep: '#1a0204',
    colorSpikeRim: '#ff2a3a',
    colorSpikeInner: '#ff1a2e',
    colorSpikeSpec: '#ffe2dc',
    colorFlash: '#ff3048',
    colorBurstA: '#ff3a4a',
    colorBurstB: '#8a0a18',
    colorBurstC: '#2a0206',
    colorDropA: '#c0101e',
    colorDropB: '#8a0a14',
    colorDropC: '#5a050c',
    colorDropD: '#2a0206',
    colorMistA: '#5a0a12',
    colorMistB: '#40070d',
    colorMistC: '#2a0509',
    colorMistD: '#120204'
  }
};
