/**
 * Parallax Blink — Mobility — paired irises open a corridor; dissolve at the entry, rebuild at the exit.
 *
 * Ability Atlas data block, rebuilt for the sandbox engine. Plain data, no
 * imports, so `settings.js` can pull it in without a cycle.
 */
export default {
  id: 'parallax',
  meta: {
    label: "Parallax Blink",
    accent: '#aab1ff',
    key: '',
    hint: "Mobility — two chrome irises open a ring corridor; you dissolve into one and reassemble out of the other",
    cast: 'line',
    glyph: `<circle cx="22" cy="50" r="15"/><circle cx="78" cy="50" r="15"/><path d="M22 35L28 50L22 65M22 35L16 50L22 65"/><path d="M78 35L84 50L78 65M78 35L72 50L78 65"/><circle cx="42" cy="50" r="5"/><circle cx="58" cy="50" r="5"/>`
  },
  /**
   * A teleport through apparatus.
   *
   * Four beats. **Gates**: two mechanical irises — chrome aperture blades in a
   * toothed housing — iris open in front of the caster and just short of the
   * target, and floating light rings assemble between them. **Entry**: the
   * caster is taken apart into the near iris, nearest voxels first, fragments
   * spiralling into the aperture. **Transit**: after `transitDelay` a pulse
   * runs the corridor at `speed`. **Exit**: the body is moved to the target and
   * reassembled out of the far iris; anything standing within `exitRadius` is
   * blown away; the gates hold for `lifetime`, then close.
   *
   * The character is only hidden while its double plays the dissolve; every
   * exit path shows it again where it stands. See `ParallaxBlinkAbility`.
   */
  settings: {
    /* --- the cast --- */
    "range": 18,
    "minRange": 4,
    "speed": 30, // m/s the transit pulse runs the corridor at
    "lifetime": 0.35, // seconds the gates stay open after the reassembly
    "cooldown": 0.6,
    "castAnim": "cast2",
    transitDelay: 0.15, // seconds the body is "inside" before the pulse leaves
    closeTime: 0.55, // seconds for both irises to shut and fold away

    /* ================================================================ */
    /* 1 · IRISES                                                         */
    /* ================================================================ */
    irisRadius: 1.15, // metres
    gateHeight: 1.05, // metres off the floor, centre
    gateOffset: 0.9, // metres the gates stand in from either end of the line
    openTime: 0.32, // seconds to iris open
    exitLag: 0.12, // the far gate opens this much later
    irisBlades: 9,
    irisBladeCurve: 1.4, // how far the seams spiral
    irisAperture: 0.82, // aperture when fully open, × radius
    irisDrive: 1.6, // radians the blade ring turns as it opens
    irisChrome: 0.8, // 0 painted metal .. 1 pure mirror
    irisBrush: 0.35,
    irisSeam: 1,
    irisFresnel: 1.2,
    irisLip: 2.4, // blue light on the aperture edge
    irisLipWidth: 0.05,
    colorChrome: '#d9e2ff',
    colorChromeDark: '#2a3048',
    colorLip: '#5b8cff',
    gateRingScale: 1.4, // floor ring when a gate opens, × iris radius
    gateRingLife: 0.5,
    openShake: 0.05,

    /* --- through the aperture --- */
    portalDepth: 0.55, // how far each tunnel layer sinks with view angle
    portalRings: 10,
    portalSpeed: 5,
    portalSwirl: 0.7,
    portalGlow: 1.8,
    portalOpacity: 0.92,
    colorPortalA: '#9fb6ff',
    colorPortalB: '#2b2f9e',
    colorPortalCore: '#f0f4ff',

    /* ================================================================ */
    /* 2 · HOUSING                                                        */
    /* ================================================================ */
    bezelSpin: 0.35, // rad/s the housing idles round at
    bezelLights: 1.4,
    bezelLightCount: 24,
    bezelChase: 0.8, // turns per second the chase runs
    bezelGroove: 1,

    /* ================================================================ */
    /* 3 · CORRIDOR                                                       */
    /* ================================================================ */
    ringCount: 9,
    ringRadius: 0.82, // metres
    ringSizeJitter: 0.15,
    ringThickness: 0.6, // extra depth along the corridor, × radius
    ringDelay: 0.15, // seconds after the cast the first ring appears
    ringStagger: 0.35, // seconds from first ring to last
    ringAssemble: 0.3, // seconds one ring takes to settle
    ringStartScale: 1.8, // rings shrink into place from this size
    ringBob: 0.08, // metres they float
    ringBobSpeed: 1.6,
    ringTilt: 0.18, // radians of wobble
    ringSpin: 0.8,
    ringDashes: 6,
    ringDashSpeed: 0.6,
    ringFresnel: 1.2,
    ringGlow: 1.8,
    ringOpacity: 0.85,
    ringPulseWidth: 1.4, // metres the transit pulse lights at once
    ringPulseScale: 0.18,
    ringPulseGlow: 4,
    colorRing: '#aab1ff',
    colorRingPulse: '#ffffff',

    /* ================================================================ */
    /* 4 · DISSOLVE / REASSEMBLY                                          */
    /* ================================================================ */
    dissolveDelay: 0.3, // seconds before the body starts to go (gate first)
    dissolveTime: 0.55,
    reassembleTime: 0.5,
    bodyDepth: 0.4, // metres of slack either side when ordering the body
    dissolveBand: 0.22, // width of the front, in order units
    dissolveVoxel: 16, // fragments per metre
    dissolveNoise: 0.35,
    dissolvePull: 0.92, // how far a taken fragment travels toward the iris
    dissolveSpin: 2.6, // radians it spirals on the way
    dissolveEdgeGlow: 5,
    dissolveEdgeWidth: 0.4,
    dissolveRim: 1.2,
    dissolveTint: 0.35,
    colorSkin: '#ffffff',
    colorDissolveEdge: '#8fb0ff',

    /* ================================================================ */
    /* 5 · FRAGMENTS                                                      */
    /* ================================================================ */
    fragmentRate: 520, // per second, at the height of the dissolve
    fragmentLife: 0.32, // seconds from body to aperture
    fragmentSize: 0.05,
    fragmentEndSize: 0.35,
    fragmentGlow: 3,
    colorFragA: '#ffffff',
    colorFragB: '#c8d4ff',
    colorFragC: '#6f86ff',
    colorFragD: '#1d2370',

    /* ================================================================ */
    /* 6 · TRANSIT                                                        */
    /* ================================================================ */
    transitRate: 380,
    transitSpeed: 0.6, // × the pulse speed
    transitLife: 0.4,
    transitSize: 0.06,
    transitStretch: 0.8,
    transitGlow: 3,
    transitRumble: 0.04,
    colorTransitA: '#ffffff',
    colorTransitB: '#dfe5ff',
    colorTransitC: '#7b8cff',
    colorTransitD: '#1a1f5c',

    /* ================================================================ */
    /* 7 · WARP                                                           */
    /* ================================================================ */
    warpSize: 3.2, // metres across
    pullStrength: 1.0,
    pushStrength: 1.3,
    pushTime: 0.5,

    /* ================================================================ */
    /* 8 · ARRIVAL                                                        */
    /* ================================================================ */
    exitRadius: 2.2, // bodies this close to the target are blown away
    hitImpulse: 7.5,
    hitLift: 3.8,
    hitSpin: 1.5,
    hitForward: 0.5, // how much of the throw follows the corridor
    burstRadius: 2.8,
    burstLife: 0.45,
    burstIntensity: 2.4,
    colorBurstA: '#ffffff',
    colorBurstB: '#aab1ff',
    colorBurstC: '#3b4dff',
    decalScale: 1.4,
    decalLife: 0.75,
    colorDust: '#8a8fa6',
    arrivalSparks: 120,
    arrivalSparkSpeed: 9,
    impactShake: 0.5,
    shakeDuration: 0.35,
    impactFlash: 0.4,
    colorFlash: '#d6dcff',

    /* --- light --- */
    "lightColor": "#aab1ff",
    "lightIntensity": 6,
    "lightRadius": 9,
    lightBoost: 2.4 // the arrival's light punch, × lightIntensity
  }
};
