/**
 * Symbiotic Exchange — nature, zone cast. Data only, no imports.
 *
 * The nature "next wave" cast: an *ally regeneration link*. A seed is charged
 * at the hand and lobbed at the circle, paying out a living vine behind it —
 * the **lifeline** — so that when it lands the caster is still tethered to it.
 * The seed bursts into a root mound and a swelling, lobed **symbiont heart**;
 * root tendrils whip out of the mound and coil round every enemy in the zone.
 * Then the heart beats. Each beat draws one share of vitality out of every
 * bound enemy — amber sap beads crawl up the tendrils into the heart — and the
 * heart pays it out again as green beads down the lifeline to its allies. On
 * the last beat the emptied bodies are hauled into the heart.
 *
 * Every key below is a live editor control (see `buildEditor`). Dimensions
 * marked "× R" scale with `zoneRadius` so the choreography follows the slider.
 */
export default {
  id: 'symbioticExchange',
  meta: {
    label: 'Symbiotic Exchange',
    accent: '#9fe36a',
    element: 'nature',
    cast: 'zone',
    hint: 'Nature — a seed on a living lifeline roots a beating heart in the circle; it drains every enemy it coils and pays the sap back to its allies',
    glyph:
      '<path d="M50 30C38 30 33 44 37 56C41 68 50 74 50 74C50 74 59 68 63 56C67 44 62 30 50 30Z"/>' +
      '<path d="M50 30C48 22 44 16 38 13M50 30C52 22 57 17 63 15"/>' +
      '<path d="M37 58C26 60 18 70 12 84M63 58C74 60 82 70 88 84M50 74V92"/>' +
      '<circle cx="12" cy="86" r="4"/><circle cx="88" cy="86" r="4"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 18, // max cast distance (m)
    minRange: 2, // min cast distance (m)
    speed: 13, // the seed's lob travels the line at (m/s)
    cooldown: 5,
    castAnim: 'cast2',
    zoneRadius: 4, // the heart's reach: tendrils bind every enemy inside (m)
    lifetime: 4.2, // nominal screen time for the HUD (s)

    /* --- anticipation: the seed forms at the hand --- */
    chargeTime: 0.35, // the seed gathers before it is thrown (s, × global lifetime)
    chargeHeight: 1.35, // held at this height (m)
    chargeForward: 0.6, // this far in front of the caster (m)
    chargeMotes: 3, // spores drawn into the seed per frame while it gathers

    /* --- travel: the seed and the lifeline --- */
    seedSize: 0.34, // seed pod radius (m)
    seedSpin: 7, // seed tumble (rad/s)
    lobHeight: 1.4, // apex of the lob above the hand line (m)
    lobPerMetre: 0.1, // extra apex per metre of range
    lifelineRest: 0.85, // after landing, the lifeline sags to this arc height (m)
    lifelineRadius: 0.085, // lifeline thickness at its root (m)
    lifelineSettle: 0.6, // seconds the lifeline takes to sag

    /* --- the exchange (gameplay) --- */
    latchTime: 0.35, // tendrils bind their prey this long after impact (s, × lifetime)
    pulses: 4, // heartbeats in the exchange; prey is emptied on the last
    beatInterval: 0.5, // seconds between heartbeats (× lifetime)
    settleTime: 0.6, // the heart lingers after the last beat (s, × lifetime)
    exitTime: 0.9, // the heart withers, roots and lifeline draw back over (s, × lifetime)
    maxLinks: 6, // enemies one heart can bind (≤ 6)
    drainDamage: 0.25, // damage per beat per bound enemy (pulses × this = 1 fells a dummy)
    entangleSeconds: 2.4, // UCSM 'entangled' status put on prey at the latch (s)
    allyRadius: 16, // allies within this of the heart are linked (m); the caster always is
    maxAllies: 3, // ally lines (≤ 3, first is the caster's lifeline)
    regenPerShare: 1, // vitality credited to an ally per delivered bead
    regenCap: 8, // most vitality one ally can bank in one exchange
    hitImpulse: 7, // emptied prey is hauled into the heart (m/s, × explosion intensity)
    hitLift: 3.2,
    hitSpin: 1.4,

    /* --- 1 · the heart (hero) --- */
    heartHeight: 2.8, // height of the heart pod (m)
    heartWidth: 0.22, // pod radius (× R)
    heartRiseTime: 0.45, // it heaves out of the mound over (s)
    beatSquash: 0.16, // how hard a beat squeezes the pod
    beatSharpness: 7, // how fast a beat snaps and relaxes
    heartGlow: 0.85, // flesh glow
    heartVeinGlow: 2.2, // the veins that flush on every beat
    heartVeinScale: 3.2, // vein density
    heartFresnel: 0.9, // translucent rim
    heartAmbient: 0.32,
    witherTime: 0.75, // exit: the heart folds and sinks over this fraction of the fade

    /* --- 2 · the sepals and the mound --- */
    sepalLength: 1.15, // crown sepals round the heart's mouth (m)
    sepalOpen: 1.05, // how far they peel open at the peak (rad)
    sepalFlutter: 0.12, // sepals shiver with each beat (rad)
    moundRadius: 0.42, // root mound (× R)
    moundHeight: 0.55, // (m)
    moundRoughness: 0.92,

    /* --- 3 · the tendrils --- */
    rootRadius: 0.17, // tendril thickness at the mound (m)
    tipRadius: 0.03, // and at the tip (m)
    reachTime: 0.4, // tendrils whip out over (s)
    reachOvershoot: 0.18, // they overshoot and snap back
    tendrilArc: 1.3, // arch of a tendril over the floor (m, + 0.15 × length)
    anchorCount: 8, // extra roots plunging into the rim (≤ 8)
    anchorReach: 1.05, // where they plunge (× R)
    writheAmp: 0.11, // tendrils squirm (m)
    writheFreq: 3.2, // waves along a tendril
    writheSpeed: 2.6,
    wrapRadius: 0.36, // coil round a bound body (m)
    wrapHeight: 1.35, // coil climbs to (m)
    wrapTurns: 2.2,
    wrapPortion: 0.32, // share of the tendril spent coiling
    barkRidges: 9,
    barkBump: 0.6,
    tendrilRim: 0.8, // green fresnel rim
    tendrilDiffuse: 0.95,
    sapGlow: 1.6, // sap flowing in the tendrils
    sapSpeed: 1.6,
    retractTime: 0.7, // exit: tendrils draw back over this fraction of the fade

    /* --- 4 · the sap beads --- */
    beadSize: 0.15, // (m)
    beadTime: 0.4, // a bead climbs from the prey to the heart in (s)
    allyBeadSpeed: 12, // and runs down an ally line at (m/s)
    beadGlow: 3,

    /* --- 5 · the root field (floor) --- */
    fieldScale: 1.18, // field size (× R)
    fieldGlow: 1.5,
    fieldGrowTime: 0.7, // root veins spread to the rim over (s)
    veinDensity: 3.4,
    veinWidth: 0.07,
    stainOpacity: 0.62, // dark moss stain under the veins
    beatRingWidth: 0.09, // the beat runs in along the veins

    /* --- 6 · particles --- */
    sporeRate: 30, // spores drifting off the heart (per s)
    sporeSize: 0.07,
    sporeLife: 1.9,
    sporeSpeed: 0.55,
    sapCount: 8, // sap droplets torn from each bound body per beat
    sapSize: 0.07,
    sapSpeed: 2.6,
    sapLife: 0.55,
    soilCount: 48, // soil and bark chips at impact
    soilSize: 0.12,
    soilSpeed: 5.5,
    soilLife: 1.1,
    ringSize: 1.6, // beat ring particle size (m)
    ringLife: 0.45,
    regenCount: 10, // motes rising round an ally when a bead arrives
    regenSize: 0.1,
    particleGlow: 1.3,

    /* --- 7 · impact and beats --- */
    impactShake: 0.3, // (× explosion intensity, × camera shake)
    beatShake: 0.05,
    shakeDecay: 7,
    shakeFrequency: 15,
    impactFlash: 0.12, // (× explosion intensity)
    impactLight: 7, // light punch at the burst (× explosion intensity)
    beatLight: 2.4, // and on every beat
    burstReach: 0.75, // EARTH shell grows to (× R)
    burstLife: 0.65,
    burstIntensity: 0.75,
    burstOpacity: 0.3,
    decalLife: 3.4, // crack and stain stay (s)
    crackIntensity: 1.1,
    dustIntensity: 0.8,

    /* --- 8 · distortion --- */
    pulseWarp: 0.75, // each beat pushes a pressure ring through the air
    pulseWarpWidth: 0.12,

    /* --- light --- */
    lightColor: '#b8f57a',
    lightIntensity: 6,
    lightRadius: 10,

    /* --- palette: four-stop ramp + sap + bark --- */
    colorCore: '#f4ffd6', // white-hot green
    colorTint: '#b9f07a', // pale leaf
    colorBody: '#3f9a3a', // saturated chlorophyll
    colorDeep: '#0d2914', // dark loam green
    colorSap: '#ffb64a', // drained vitality, amber
    colorSapDeep: '#7a320c',
    colorBark: '#2c2014',
    colorBarkLight: '#6e5434',
    colorSkin: '#2d4a20', // heart pod skin
    colorSepal: '#4f8a2e',
    colorMound: '#3a2c1d',
    colorWither: '#4a3a24', // what everything browns to on exit
  },
};
