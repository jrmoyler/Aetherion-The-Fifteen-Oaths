/**
 * Solar Lash — Fire — a whip of molten plasma cracked down the line.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `SolarLashAbility`, so
 * dragging any of it in the editor re-shapes a lash that is already in the air
 * — its wave, its taper, its heat, the furrow it is burning.
 */
export default {
  id: 'solarlash',
  meta: {
    label: "Solar Lash",
    accent: '#ffb347',
    key: '',
    element: 'fire',
    hint: "Fire — a whip of molten plasma unfurls, cracks at the target and leaves a burning furrow",
    cast: 'line',
    glyph: `<path d="M16 84C26 66 20 50 36 42C52 34 58 60 72 50C80 44 82 32 80 22"/><path d="M80 22L88 12"/><path d="M74 14L76 5"/><path d="M86 24L96 22"/><circle cx="16" cy="84" r="6"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 20, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 24, // how fast the lash unfurls down the line, metres/second
    lifetime: 2.4, // seconds the furrow takes to cool once the lash is gone
    cooldown: 0.5, // seconds before the ability can be armed again
    castAnim: "cast1", // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: "#ffb347",
    lightIntensity: 6, // the lash's steady glow (the light rides the tip)
    lightRadius: 8,
    lightFlicker: 0.35, // 0..1 how much the plasma gutters

    /* ================================================================ */
    /* 1 · THE HAND                                                      */
    /* ================================================================ */
    handForward: 0.55, // metres in front of the caster the hand is
    handSide: 0.22, // metres to the right of the caster
    handHeight: 1.35, // metres off the floor
    flareSize: 0.75, // radius of the flare round the fist, metres
    flareGlow: 4.0, // brightness of the flare (bloom > 1)
    flareRays: 7, // spikes in the corona
    flareRise: 0.1, // seconds the hand takes to flare up
    flareSettle: 0.55, // share of the flare left while the lash is out
    colorFlareCore: "#fff8e0",
    colorFlareHalo: "#ff9a2e",

    /* ================================================================ */
    /* 2 · THE LASH — shape                                              */
    /* ================================================================ */
    rootRadius: 0.085, // thickness at the hand, metres
    tipRadius: 0.016, // thickness at the tip, metres
    taper: 1.15, // how quickly it thins toward the tip
    tipHeight: 0.28, // metres off the floor the tip strikes at
    arch: 0.9, // metres the whip arches up while it still has slack
    sweep: 1.5, // metres the whip bows out to one side before it snaps straight
    sweepSide: 0, // -1 left, +1 right, 0 a coin toss per cast — the side it sweeps *toward*
    waveAmp: 0.5, // metres of the travelling S-wave
    waveLength: 3.4, // metres per wave
    waveSpeed: 16, // radians/second the wave runs down the lash
    waveLift: 0.22, // the wave's vertical share — a little helix, not a flat S
    boil: 0.3, // surface boiling, × the radius
    boilScale: 2.4, // boiling features per metre
    snapTime: 0.12, // seconds the slack takes to vanish at the crack
    snapOvershoot: 0.35, // how far past straight it whips back at the snap

    /* ================================================================ */
    /* 3 · THE LASH — plasma                                             */
    /* ================================================================ */
    coreGlow: 6.0, // the white-hot core seen face-on
    edgeGlow: 2.2, // the orange rim at the silhouette
    coreSharpness: 2.2, // how thin the core is (higher = a thinner wire)
    flowSpeed: 7, // metres/second the plasma streams hand → tip
    flowScale: 1.3, // plasma features per metre
    pulseRate: 2.6, // bright surges per second running down the lash
    pulseGlow: 2.4, // how much brighter a surge is
    tipHeat: 0.6, // extra heat toward the tip — the fastest part burns hottest
    softFade: 0.25, // soft intersection with the floor, metres
    opacity: 1,
    colorPlasmaA: "#ffffff", // core
    colorPlasmaB: "#fff1a8", // hot
    colorPlasmaC: "#ff9a2e", // body
    colorPlasmaD: "#ff3a0c", // rim

    /* ================================================================ */
    /* 4 · THE RECOIL                                                    */
    /* ================================================================ */
    recoilDelay: 0.12, // seconds the lash hangs taut after the crack
    recoilTime: 0.5, // seconds it takes to snake back into the hand
    recoilSlack: 0.55, // how much slack comes back as it recoils
    recoilWave: 1.6, // × the wave speed while it recoils
    dissolveEdge: 0.08, // width of the hot fraying edge as it burns out

    /* ================================================================ */
    /* 5 · THE MOLTEN FURROW                                             */
    /* ================================================================ */
    furrowStart: 0.9, // metres in front of the caster the furrow begins
    furrowWidth: 0.16, // half-width of the molten channel, metres
    furrowCrust: 0.6, // half-width of the cracked crust, metres
    furrowChar: 1.15, // half-width of the scorched floor round it, metres
    crackScale: 3.0, // crust plates per metre
    crackWidth: 0.07, // width of the seams lava seeps through
    seepSpeed: 0.7, // how fast the lava crawls through the seams
    furrowGlow: 3.6, // brightness of the hot lava (bloom > 1)
    freshLength: 3.0, // metres behind the tip the floor stays white-hot
    furrowWiggle: 0.14, // metres the furrow wanders
    furrowWiggleScale: 0.35, // wanders per metre
    coolCurve: 1.3, // >1 holds the heat longer, <1 dulls it sooner
    crustOpacity: 0.92,
    charOpacity: 0.55,
    furrowErode: 0.7, // 0..1 how raggedly it fades
    colorLavaA: "#fff2a0", // yellow-white
    colorLavaB: "#ff8a1c", // orange
    colorLavaC: "#9a1606", // dull red
    colorCrust: "#2a1610",
    colorChar: "#110a07",

    /* ================================================================ */
    /* 6 · HEAT HAZE                                                     */
    /* ================================================================ */
    hazeStrength: 0.9, // how hard the air bends round the lash
    hazeWidth: 4, // radius of the haze, × the lash radius
    hazeScale: 2.2, // noise features per metre
    hazeSpeed: 2.6, // noise speed
    hazeHeight: 1.1, // metres of shimmer standing over the furrow
    furrowHaze: 0.6, // strength of that shimmer

    /* ================================================================ */
    /* 7 · EMBERS & SMOKE                                                */
    /* ================================================================ */
    emberRate: 260, // per second shed off the lash
    furrowEmbers: 110, // per second rising off the hot furrow
    emberSize: 0.05,
    emberSpeed: 1.6, // m/s thrown off
    emberLift: 2.2, // m/s² they rise
    emberLife: 1.1,
    emberGlow: 3.0,
    smokeRate: 45, // per second off the furrow
    smokeSize: 0.55,
    smokeLift: 0.9, // m/s
    smokeLife: 2.2,
    smokeOpacity: 0.32,
    colorEmberA: "#fff4c0",
    colorEmberB: "#ffb040",
    colorEmberC: "#ff5a14",
    colorEmberD: "#5a0c02",
    colorSmokeA: "#4a3a30",
    colorSmokeB: "#2c2420",
    colorSmokeC: "#1e1a18",
    colorSmokeD: "#141210",

    /* ================================================================ */
    /* 8 · THE CRACK                                                     */
    /* ================================================================ */
    dragSparks: 70, // per second, struck off the floor where the tip drags
    crackSparks: 110, // sparks thrown off the tip at the crack
    sparkSpeed: 15, // m/s
    sparkSize: 0.035,
    sparkStretch: 0.22,
    sparkLife: 0.6,
    sparkGravity: 9, // m/s²
    sparkGlow: 3.5,
    ringSize: 2.6, // metres the sonic-boom ring opens to
    ringTime: 0.32, // seconds it takes
    ringWidth: 0.07, // its thickness, × its radius
    ringGlow: 5.0,
    ringWarp: 1.4, // how hard the boom bends the air
    burstSize: 1.6, // the FIRE shell, metres
    burstIntensity: 1.4,
    shockRadius: 5.5, // the shockwave on the floor, metres
    scorchRadius: 1.6, // the scorch the crack leaves, metres
    crackFlash: 0.35,
    crackShake: 0.45,
    shakeDuration: 0.35,
    crackLight: 2.5, // light punch at the crack, × lightIntensity
    travelRumble: 0.08, // camera rumble while the lash unfurls
    colorRing: "#fff2c8",
    colorBurstA: "#fff6d0",
    colorBurstB: "#ffa23a",
    colorBurstC: "#a8260a",
    colorShockA: "#ffb050",
    colorShockB: "#fff4d0",
    colorFlash: "#ffd28a",
    colorSparkA: "#ffffff",
    colorSparkB: "#fff0a0",
    colorSparkC: "#ffa030",
    colorSparkD: "#c03008",

    /* ================================================================ */
    /* 9 · THE THROW                                                     */
    /* ================================================================ */
    hitWidth: 0.95, // metres either side of the lash that it catches
    hitImpulse: 7, // m/s a body is thrown sideways, the way the whip sweeps
    hitLift: 3.6, // m/s upward
    hitSpin: 1.4, // tumble
    hitForward: 0.3, // share of the throw along the line
    tipZone: 2.2, // metres from the end of the line that wait for the crack
    tipImpulse: 15, // the body at the tip is launched hardest
    tipLift: 7.5,
    tipSpin: 2.6,
    burnTime: 2.6, // seconds a hit body keeps burning
    burnEmbers: 45, // embers per second off a burning body
    ignite: 0.9, // 0..1 how far the body is charred
    igniteTime: 0.35, // seconds it takes to catch
    colorBurnBody: "#2a0a02",
    colorBurnRim: "#ff7a1c",
    burnRimGlow: 2.8,
    colorBurnEdge: "#ffd070",
    burnEdgeGlow: 4.5,
    burnEdgeWidth: 0.06
  }
};
