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
   * Four beats. **Departure**: light implodes onto the caster, a crown of
   * shards closes on them, a jagged tear splits the air where they stand and
   * the body squeezes to a sliver and is gone into it. **Transit**: a streak of
   * light runs the line at `speed`, burning a slipstream scar into the floor
   * behind it, shedding sparks and leaving flickering afterimages. **Arrival**:
   * a second tear splits at the far end, the body is moved there and reforms
   * out of it with an overshoot, and the landing throws a ring of shards that
   * plant in a skid-spoked crater. **Linger**: an echo of the caster stands at
   * the start, both tears seal with cracks crawling through the air, knots of
   * light drain down the cooling scar, the planted ring hums, then sinks.
   *
   * The character is only ever hidden or squeezed while a blink *owns* it, and
   * every exit path — arrival, clear, retire, a second blink stealing it —
   * hands it back at full size and visible. See `BlinkStepAbility`.
   */
  settings: {
    /* --- the cast --- */
    "range": 18,
    "minRange": 3,
    "speed": 28, // m/s the streak covers the line at
    "lifetime": 1.7, // seconds the arrival + linger play before the fade
    "cooldown": 0.6,
    castAnim: "cast2",
    fadeTime: 0.8, // seconds for the rifts, the scar and the ghosts to go

    /* --- the rifts: the hero (a tear in the air at each end of the line) --- */
    riftHeight: 2.5, // metres, foot to tip
    riftWidth: 1.15, // metres across the lens at its belly, fully open
    riftLift: 0.02, // metres the foot floats off the floor
    riftDepth: 0.22, // metres the open lens bulges toward its normal
    riftJag: 0.42, // how torn the lips are (× global randomness)
    riftJagScale: 7, // jags along its height
    riftHalo: 1.1, // metres of cracked air either side at the belly
    riftVoid: 0.92, // opacity of the void inside
    riftRimGlow: 3.2, // brightness of the white-hot lip
    riftRimWidth: 0.14, // width of the lip, × the lens half-width
    riftFlow: 7, // slipstream streaks racing through the void
    riftStreaks: 1.0,
    riftCrack: 1.4, // cracks crawling out through the air round it
    riftCrackScale: 2.4, // crack features per metre
    riftFlicker: 0.55,
    riftGlow: 1.6,
    riftOpenTime: 0.16, // seconds to split open (departure: with the vanish)
    riftDepartHold: 0.35, // seconds the departure rift gapes once the body is gone
    riftArriveLead: 0.12, // seconds before the landing the arrival rift splits
    riftArriveHold: 0.45, // seconds the arrival rift gapes after the landing
    riftSealTime: 1.0, // seconds a rift takes to seal back to a scar
    riftCrackTime: 1.4, // seconds the cracks take to crawl out to the halo
    riftOffset: 0.3, // metres the arrival rift stands behind the landing point
    colorRiftCore: '#ffffff',
    colorRiftTint: '#b4fff0',
    colorRiftBody: '#2fd8c8',
    colorRiftDeep: '#06202e',

    /* --- the scar: the floor (slipstream lane, departure scorch, landing crater) --- */
    scarWidth: 1.3, // metres across the lane
    scarDepartRadius: 1.5, // departure scorch, metres
    scarArriveRadius: 2.4, // landing crater, metres
    scarSpreadTime: 0.25, // seconds each disc takes to spread
    scarHeatLength: 3.5, // metres of hot seam behind the running head
    scarPulse: 1.0, // knots of light crawling to the landing during the linger
    scarPulseSpeed: 9, // m/s
    scarPulseGap: 3.2, // metres between knots
    scarSpokes: 22, // skid spokes round the landing
    scarBurn: 0.62, // how dark the burnt floor is
    scarSeamGlow: 1.0,
    scarGlow: 2.2,
    scarNoiseScale: 1.0,
    scarCoolTime: 1.6, // seconds the seam takes to cool after the landing
    scarDissolve: 0.85, // share of the fade spent dissolving
    scarDecalLife: 5.0, // the SCORCH decals left under both ends outlive the cast (s)

    /* --- the linger: the echo left standing, planted shards, residue --- */
    echoLife: 1.9, // seconds the afterimage left at the departure point stands
    plantHold: 1.0, // seconds the arrival shards stand planted round the landing
    plantSink: 0.6, // seconds they take to sink into the floor
    plantPulse: 0.45, // how hard a pulse runs round the planted ring
    plantPulseRate: 1.6, // pulses per second
    residueRate: 70, // motes rising off the scar per second during the linger
    residueSpeed: 0.7,

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
    arrivalBurst: 2.0, // pressure shell end radius, metres
    arrivalBurstLife: 0.35,
    arrivalBurstIntensity: 1.1,
    arrivalBurstSquash: 0.45, // vertical squash of the shell (1 = sphere)
    arrivalBurstOpacity: 0.5,
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
