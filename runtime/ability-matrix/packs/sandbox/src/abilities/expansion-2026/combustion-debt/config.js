/**
 * Combustion Debt — fire, zone cast. Data only, no imports.
 *
 * Heat is not dealt, it is *lent*. A molten slug is lobbed onto the target
 * and an iron heating coil screws up out of the floor round it — a conical
 * spring of forged iron whose outer turn lies on the rim of the zone and
 * whose tip stands over the centre. Every `tickInterval` the coil takes on
 * one more turn of heat, crawling inward from the floor end, the spring winds
 * tighter, and every enemy standing inside is *branded* with one more stack
 * of heat debt (a tally ring under its feet, and its body charred a little
 * more). When the coil is hot to the tip — or the total debt in the zone
 * reaches `debtCap`, whichever comes first — the debt is called in: the
 * spring lets go, a combustion plume erupts from the tip, and every debtor
 * carrying `igniteThreshold` stacks or more is hit for what it owes.
 *
 * Every key below is a live editor control, read from
 * `settings.combustionDebt` every frame.
 */
export default {
  id: 'combustionDebt',
  meta: {
    label: 'Combustion Debt',
    accent: '#ff6a1f',
    element: 'fire',
    cast: 'zone',
    hint: 'Fire — a heating coil brands everyone inside with heat debt each tick, then calls it in as one eruption',
    glyph:
      '<path d="M10 82C10 62 90 62 90 82C90 96 18 96 22 78C26 58 78 58 80 74C82 88 32 88 34 72C36 56 68 56 68 68C68 78 44 78 46 66C48 54 58 50 50 30"/><path d="M50 30C44 20 52 12 50 4M50 30C58 22 62 16 60 8"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 18, // max aim distance (m)
    minRange: 2,
    speed: 24, // the molten slug flies at (m/s) once charged
    cooldown: 7,
    castAnim: 'cast2',
    zoneRadius: 3.2, // the coil's outer turn lies on this circle (m); every dimension below is derived from it
    lifetime: 4.2, // nominal cast length, for the HUD

    /* --- the debt (gameplay) --- */
    ticks: 4, // heat ticks before the debt is called in (one coil segment each)
    tickInterval: 0.32, // seconds between ticks (× global lifetime)
    tickPhase: 0.35, // the first tick lands this fraction of an interval after the coil is up
    igniteThreshold: 2, // stacks a debtor must carry to be hit when the debt is called in
    debtCap: 12, // foreclosure: total stacks in the zone that call the debt in early
    foreclosureDelay: 0.15, // the call beat after a foreclosing tick (s)
    damagePerStack: 1, // UCSM damage per stack owed
    maxDamage: 4, // UCSM damage cap per debtor
    burnIntensity: 0.5, // UCSM 'burning' intensity added per stack, per tick
    groundBurn: 2.5, // the burning region left on the floor at the call (s, UCSM only)
    hitImpulse: 9, // knockback at full debt (m/s, × explosion intensity)
    hitLift: 6,
    hitSpin: 2.4,
    stackForce: 0.6, // how much of the blow scales with stacks owed (0 = flat)
    charPerStack: 0.22, // how far each stack chars a sandbox dummy (0..1)
    charRimGlow: 1.3, // a charred dummy's rim glow (its colour is colorBody)
    charEdgeGlow: 1.8, // its burn-edge glow (colorTint)

    /* --- the beats (× global lifetime) --- */
    chargeTime: 0.28, // the slug gathers at the hand before it is thrown (s)
    handHeight: 1.7, // where it gathers (m)
    arcHeight: 1.6, // height of the lob (m)
    riseTime: 0.36, // the coil screws up out of the floor over (s)
    payLinger: 1.15, // after the call the coil rings and cools for (s)
    coolTime: 1.0, // white-hot to black iron over (s)
    exitTime: 0.7, // the coil sinks back into the floor over (s)

    /* --- light --- */
    lightColor: '#ff7a2e',
    lightIntensity: 6,
    lightRadius: 9,
    tickLight: 2.5, // light punch on each tick
    payLight: 14, // light punch at the call (× explosion intensity)

    /* --- palette: the four-stop ramp and the iron --- */
    colorCore: '#fff3d6', // white-hot
    colorTint: '#ffb347', // yellow-orange
    colorBody: '#ff4a0c', // saturated flame
    colorDeep: '#3a0703', // dull red-black
    ironColor: '#2a2220', // cold forged iron
    charColor: '#0d0806', // scorched floor

    /* --- 1 · the coil (lit iron, world layer) --- */
    coilOuter: 0.92, // outer turn radius (× zone radius)
    coilInner: 0.1, // inner tip radius (× zone radius)
    coilHeight: 0.85, // dome height (× zone radius)
    coilTurns: 3.25, // turns from floor to tip
    coilProfile: 1.8, // dome curvature (1 = cone)
    coilThickness: 0.055, // tube radius (× zone radius)
    beadFreq: 70, // forged beads along the tube (the tally of the debt)
    beadDepth: 0.16, // bead swell (× tube radius)
    ironMetalness: 0.6,
    ironRoughness: 0.52,
    heatGlow: 1.5, // emissive of the hot length
    frontGlow: 2.4, // the white-hot leading edge
    heatCrawl: 1.4, // speed of the hot spots crawling along the iron
    heatGrain: 5, // hot-spot density
    tickFlash: 0.8, // the whole coil flares on a tick
    compress: 0.55, // the spring winds down to this height at full debt (× height)
    windTurn: 0.7, // and twists this far as it does (rad)
    spinSpeed: 0.22, // slow turn of the coil while it lives (rad/s)
    springOvershoot: 0.6, // the spring overshoots by this at the call (× height)
    springFreq: 11, // ringing rate after the call (rad/s)
    springDamp: 3.6, // ringing decay (1/s)
    whip: 0.45, // the tip whips sideways at the call (m)
    sinkDepth: 1.2, // it sinks this far below the floor on exit (× height)

    /* --- 2 · the hob (floor) --- */
    hobScale: 1.15, // floor disc radius (× zone radius)
    hobOpacity: 0.86, // scorch darkness
    hobGlow: 1.5, // glow pooled under the coil
    hobSpiralWidth: 0.32, // width of the heat pooled under the coil (m)
    hobCracks: 2.2, // crack density (per m)
    hobCrackGlow: 2.2, // crack brightness at full heat
    hobRevealTime: 0.25, // scorch spreads from the slug's landing over (s)
    hobReleaseTime: 0.45, // fire ring runs out across the floor at the call over (s)

    /* --- 3 · the plume (the call) --- */
    plumeHeight: 5.6, // (m)
    plumeWidth: 0.42, // (× zone radius)
    plumeGlow: 2.2,
    plumeLife: 1.05, // (s)
    plumeRise: 0.16, // reaches full height after (s)
    plumeNoise: 0.35, // turbulent swelling of the column
    plumeScroll: 2.4, // speed the flame climbs
    plumeOpacity: 0.95,

    /* --- 4 · the slug (travel) --- */
    slugSize: 0.5, // (m)
    slugGlow: 2.8,

    /* --- 5 · debt brands --- */
    brandSize: 0.75, // tally ring radius under a debtor (m)
    brandGlow: 1.8,
    brandOpacity: 0.95,

    /* --- 6 · particles --- */
    emberRate: 80, // embers per second off the hot length
    emberSize: 0.07,
    emberLife: 1.1,
    emberSpeed: 1.3,
    emberGlow: 1.6,
    tickSparks: 16, // sparks off the leading edge on each tick
    paySparks: 90, // sparks at the call
    sparkSize: 0.05,
    sparkLife: 0.6,
    sparkSpeed: 7.5,
    sparkGlow: 2.4,
    smokeCount: 26, // smoke puffs at the call
    smokeSize: 1.1,
    smokeLife: 2.2,
    smokeSpeed: 1.3,
    smokeOpacity: 0.5,
    smokeColorA: '#5a4339', // lit underside
    smokeColorB: '#120d0b', // soot
    slagCount: 34, // molten slag chips thrown at the call
    slagSize: 0.13,
    slagLife: 1.3,
    slagSpeed: 6,

    /* --- 7 · the impact --- */
    burstScale: 0.85, // fire shell grows to (× zone radius)
    burstLife: 0.45,
    burstIntensity: 1.2,
    burstOpacity: 0.5,
    decalLife: 3.2, // scorch and crack decals last (s)
    shockwaveWidth: 0.07,
    landShake: 0.08, // knock when the slug lands (× camera shake)
    tickShake: 0.04, // knock on each tick
    payShake: 0.42, // the call (× explosion intensity, × camera shake)
    shakeDecay: 5,
    shakeFrequency: 22,
    payFlash: 0.3, // screen flash at the call (× explosion intensity)

    /* --- 8 · the haze --- */
    hazeStrength: 0.7, // heat shimmer over the coil, grows with the debt (× global distortion)
    hazeShock: 1.2, // pressure ring at the call
    hazeHeight: 0.6, // the shimmer proxy sits this high (× coil height)
  },
};
