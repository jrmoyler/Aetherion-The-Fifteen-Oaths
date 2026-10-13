/**
 * Blink Step — Movement — dissolve, streak and reform at the target.
 *
 * Collective Originals data block: presentation (`meta`) and the live settings
 * the ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 */
export default {
  id: 'blink',
  meta: {
    label: "Blink Step",
    accent: '#7affd9',
    key: 'X',
    hint: "Movement — dissolve, streak and reform at the target",
    cast: 'line',
    glyph: `<path d="M16 70L44 42"/><path d="M28 78L56 50"/><path d="M60 30h22v22"/><path d="M82 30L52 60"/>`
  },
  /**
   * A teleport-dash, and the only ability in the pack that moves the caster.
   *
   * Three beats. **Departure**: light implodes onto the caster, a crown of
   * shards closes on them, and the body squeezes to a sliver and is gone.
   * **Transit**: a streak of light runs the line at `speed`, shedding sparks
   * and leaving flickering afterimages of the body behind it. **Arrival**: the
   * body is moved to the end of the line, reforms with an overshoot, and the
   * landing throws a ring of shards, a pressure shell and a shock ring.
   *
   * The character is only ever hidden or squeezed while a blink *owns* it, and
   * every exit path — arrival, clear, retire, a second blink stealing it —
   * hands it back at full size and visible. See `BlinkStepAbility`.
   */
  settings: {
    /* --- the cast --- */
    "range": 18,
    "minRange": 3,
    "speed": 34, // m/s the streak covers the line at
    "lifetime": 0.75, // seconds the arrival plays before the fade
    "cooldown": 0.6,
    castAnim: "cast2",
    fadeTime: 0.55, // seconds for the trail and the ghosts to go

    /* --- the body --- */
    vanishTime: 0.12, // seconds to squeeze to nothing at the start
    reformTime: 0.28, // seconds to come back at the end
    squeeze: 0.08, // width at the vanishing point, × normal
    stretch: 1.35, // height at the vanishing point, × normal
    reformOvershoot: 1.0, // outBack amount on the way back (0 = none)
    bodyHeight: 1.0, // metres off the floor the streak and the rings run at

    /* --- departure: the implosion --- */
    implodeCount: 90, // streaks converging on the caster
    implodeRadius: 1.8, // metres they start out at
    implodeTime: 0.2, // seconds they take to arrive
    implodeSize: 0.09,
    implodeStretch: 0.25,
    implodeGlow: 2.6,
    colorImplodeA: '#ffffff',
    colorImplodeB: '#b4fff0',
    colorImplodeC: '#3affd0',
    colorImplodeD: '#0a4a5a',
    pinchStrength: 0.9, // screen-space pinch as the body goes (distortion)
    pinchSize: 2.4, // metres across
    pinchTime: 0.25,

    /* --- the shard crowns (departure and arrival) --- */
    shardCount: 14, // per crown (max 24)
    shardLength: 0.55, // metres
    shardWidth: 0.11, // metres
    shardJitter: 0.35, // size and angle jitter
    crownRadius: 0.95, // metres — the departure crown starts here
    crownClose: 0.25, // ... and closes to this, × crownRadius
    crownBurst: 3.2, // metres the departure crown flies out to once the body is gone
    crownLife: 0.45, // seconds a crown lives once it bursts
    crownSpin: 2.5, // radians/second about the caster
    arrivalRadius: 2.6, // metres the arrival crown bursts out to
    arrivalTilt: 0.55, // radians the arrival shards point up out of the floor
    shardGlow: 3.0,
    shardFresnel: 2.2,
    shardFresnelPower: 2.2,
    shardOpacity: 0.95,
    colorShardCore: '#f2fffb',
    colorShardEdge: '#46ffd2',
    colorShardDeep: '#1a6a8a',

    /* --- the streak (camera-facing ribbon) --- */
    trailWidth: 0.16, // metres, at the head
    trailTailWidth: 0.25, // width at the tail, × head width
    trailLength: 9, // metres of tail behind the head while it runs
    trailTaper: 1.2, // how the width runs from tail to head
    trailFalloff: 1.6, // >1 keeps the tail dim and the head hot
    trailHeadGlow: 3.5, // the bright knot at the head
    trailHeadSize: 0.8, // metres the head knot spans
    trailGlow: 3.0,
    trailNoise: 0.7, // how torn the tail is
    trailNoiseScale: 1.2, // features per metre
    trailNoiseSpeed: 3.5,
    trailCore: 0.35, // the white core's share of the width
    trailStrands: 3, // filaments spiralling round the core (max 5)
    trailSpiral: 0.18, // metres they spiral out
    trailTwist: 1.4, // turns per metre
    trailStrandWidth: 0.35, // × trail width
    trailRetract: 0.35, // seconds for the tail to run into the head on arrival
    trailOpacity: 1.0,
    colorTrailCore: '#ffffff',
    colorTrailMid: '#7affd9',
    colorTrailEdge: '#1fa8ff',
    colorTrailTail: '#2a3aa8',

    /* --- afterimages --- */
    ghostSpacing: 2.2, // metres between afterimages along the path
    ghostLife: 0.55, // seconds one lasts
    ghostHeight: 1.78, // metres
    ghostWidth: 0.75, // × height
    ghostGlow: 2.2,
    ghostOpacity: 0.85,
    ghostEdge: 0.6, // brightness of the outline
    ghostFill: 0.35, // brightness of the body
    ghostFlicker: 0.65, // how hard it strobes
    ghostFlickerRate: 28, // strobes per second
    ghostGlitch: 0.05, // horizontal slice tearing, × height
    ghostSlices: 18, // tear bands
    ghostScan: 70, // scanlines over the height
    ghostDissolve: 1.0, // how much the noise eats it as it ages
    colorGhostCore: '#c8fff2',
    colorGhostEdge: '#3affd0',

    /* --- sparks shed on the way (STREAK) --- */
    sparkRate: 260, // per second at the head
    sparkSize: 0.07,
    sparkSpeed: 3.5,
    sparkSpread: 0.6,
    sparkLifetime: 0.4,
    sparkStretch: 0.3,
    sparkGlow: 2.4,
    colorSparkA: '#ffffff',
    colorSparkB: '#a6fff0',
    colorSparkC: '#2fd0ff',
    colorSparkD: '#14306a',

    /* --- arrival --- */
    arrivalBurst: 2.4, // pressure shell end radius, metres
    arrivalBurstLife: 0.45,
    arrivalBurstIntensity: 1.8,
    colorBurstA: '#f2fffb',
    colorBurstB: '#46ffd2',
    colorBurstC: '#1a3a8a',
    decalRadius: 2.8, // shock ring, metres
    decalLife: 0.6,
    colorDecalA: '#46ffd2',
    colorDecalB: '#f2fffb',
    dustRadius: 2.0, // dust ring kicked up, metres
    dustLife: 1.0,
    colorDust: '#2a4a52',
    arrivalSparks: 70,
    arrivalSparkSpeed: 7,
    arrivalMotes: 50,
    moteSize: 0.06,
    moteLifetime: 1.1,
    moteRise: 0.6,
    moteGlow: 2.2,
    colorMoteA: '#ffffff',
    colorMoteB: '#7affd9',
    colorMoteC: '#2fa8ff',
    colorMoteD: '#0a1a4a',
    bulgeStrength: 1.1, // screen-space push on arrival (distortion)
    bulgeSize: 4.0, // metres across
    bulgeTime: 0.35,
    impactShake: 0.28,
    shakeDuration: 0.25,
    impactFlash: 0.12,
    colorFlash: '#b4fff0',
    departShake: 0.08,

    "lightColor": "#7affd9",
    "lightIntensity": 6,
    "lightRadius": 9,
    lightBoost: 1.8 // arrival light punch, × lightIntensity
  }
};
