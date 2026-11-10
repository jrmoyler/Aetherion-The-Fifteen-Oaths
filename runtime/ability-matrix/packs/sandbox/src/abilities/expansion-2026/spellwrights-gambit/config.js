/**
 * Spellwright's Gambit — arcane, zone cast. Data only, no imports.
 *
 * An armillary descends over the target and inks a sigil; the caster has
 * composed two attack shapes (ring, line or burst) and the armillary releases
 * them one beat apart. The footprint of the *next* beat is drawn on the floor
 * the whole time — it is the hit test, drawn — so `zoneRadius`, `lineWidth`
 * and `ringWidth` are gameplay numbers as well as visual ones.
 *
 * Every key below is a live editor control. Gameplay keys (range, timing,
 * shapes, widths, force) keep their original names and defaults; the rest
 * are the craft layer.
 */
export default {
  id: 'spellwrightsGambit',
  meta: {
    label: "Spellwright's Gambit",
    accent: '#7c8cff',
    element: 'arcane',
    cast: 'zone',
    hint: 'Arcane — compose two runic shapes; the armillary releases them one beat apart',
    glyph:
      '<circle cx="50" cy="50" r="34"/><path d="M50 12L78 68H22Z M23 32H77L50 82Z"/><circle cx="50" cy="50" r="6"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 18, // max aim distance (m)
    minRange: 1, // min aim distance (m)
    speed: 30, // the armillary flies to the target at (m/s)
    cooldown: 4,
    castAnim: 'cast2',
    zoneRadius: 4, // reach of both shapes (m) — the hit radius
    lifetime: 2.4, // nominal cast length, for the HUD (the beats set the real timing)
    lingerTime: 0.9, // seconds the last shape stays planted after the second beat (presentation only)
    exitTime: 0.8, // seconds the exit takes (blades pulled, armillary lifts, sigil dissolves)

    /* --- the gambit (gameplay) --- */
    firstShape: 'ring', // 'ring' | 'line' | 'burst'
    secondShape: 'line',
    beatInterval: 0.65, // seconds from landing to the first shape, and between shapes
    lineWidth: 0.8, // half-width of the line stripe (m)
    ringWidth: 0.8, // depth of the ring band, measured in from the rim (m)
    impulse: 12, // knockback per struck body (m/s, × explosion intensity)
    lift: 5,
    spin: 2,

    /* --- light --- */
    lightColor: '#aab4ff',
    lightIntensity: 6,
    lightRadius: 9,
    beatLight: 2, // light punch on each release (added intensity, × explosion intensity)

    /* --- palette (four-stop ramp: edge → core/tint → ink/body → deep) --- */
    deepColor: '#150b3a', // the deep tone: the ink pool, scars, blade steel shadows
    inkColor: '#646cff', // the sigil's ink
    edgeColor: '#eef0ff', // white-hot rims, nibs and footprints
    etchColor: '#9a65ee', // the written linework and motes
    coreColor: '#c2bbff', // the armillary core, releases and beam body
    bandColor: '#8f86ff', // the brass-of-light armillary bands
    beamColor: '#ffffff', // the beam's hot foot

    /* --- 1 · the sigil (floor) --- */
    fieldGlow: 1.3, // ink disc brightness
    inkBleed: 1, // how much the brushed ink wanders (fbm)
    inkWash: 0.22, // ink wash that deepens as a beat charges
    etchGlow: 1, // linework brightness
    sigilSpin: 0.25, // linework turns at (rad/s)
    drawTime: 0.45, // inked round over (s)
    scriptSpeed: 0.8, // scan wedge and ripples run at (× clock)
    dissolveTime: 0.7, // fraction of the fade spent dissolving (0..1)
    inkDarkness: 0.62, // how dark the ink pool under the sigil is (normal-blended deep tone)
    inkPoolReach: 0.97, // ink pool radius (× reach, ≤ 1)
    scarDarkness: 0.85, // how dark a struck shape is burnt into the floor
    scarGlow: 2.4, // hot crack glow of a fresh scar
    scarCool: 0.9, // seconds a scar takes to cool from white to deep
    scarRest: 0.18, // glow a cooled scar keeps for the rest of the linger
    scarCrack: 1, // crack density of the scars (× noise frequency)

    /* --- 2 · the footprints (telegraph) --- */
    footprintGlow: 1.6,
    footprintOpacity: 1,

    /* --- 3 · the armillary (hero) --- */
    coreSize: 1, // whole armillary scale (multiplies everything below)
    armillaryReach: 0.5, // band radius (× reach) — the armillary is sized from the zone
    gemSize: 1.7, // focus gem scale (1 = 0.84 m tall)
    orbitSpeed: 1, // blades and rings turn at (× clock)
    heroHeight: 2.7, // hovers at (m) — the armillary's centre
    heroDrop: 0.9, // arrives this much higher and settles down (m)
    descendTime: 0.45, // settle lasts (s)
    heroRise: 1.6, // lifts away on the exit (m)
    metalColor: '#3a3150', // blackened-bronze armillary bands and blade steel
    metalEmissive: '#2a1a66', // faint arcane heat in the metal
    metalness: 0.85,
    metalRoughness: 0.32,
    metalGlow: 0.35, // emissive in the metal at rest (× charge and flare)
    coreGlow: 1.1, // core emissive intensity at rest
    coreFlare: 1.6, // extra emissive on a release
    coreEmissive: '#5743ab',
    coreMetalness: 0.65,
    coreRoughness: 0.28,
    bandGlow: 0.75, // armillary band brightness
    bandRunes: 24, // rune cells round each band
    bladeCount: 8, // orbiting runic blades (≤ 8)
    bladeSize: 2.6, // blade scale (1 = 0.64 m long)
    bladeRadius: 1.12, // blade orbit radius (× armillary radius)
    bladeSpread: 0.1, // the orbit widens this much per released beat (m)
    bladeCinch: 0.3, // the orbit tightens this much as a beat comes due (m)
    bladeBob: 0.18, // vertical bob of the blades (m)
    bladeGlow: 0.55, // blade rune emissive when driven into the floor
    /* the blades ARE the release: they dive out of orbit and are driven into
       the floor in the shape that strikes, landing on the beat frame */
    bladeDive: 0.2, // seconds a blade takes to dive from the orbit to the floor
    bladeDiveScatter: 0.35, // extra departure spread (× dive) so they leave one by one but land together
    bladeHold: 0.35, // fraction of the beat interval a blade stays driven in before it is pulled back
    bladeDepth: 0.3, // how deep the tip bites (m)
    bladeLean: 0.32, // how far a planted blade leans off vertical (radians-ish)
    bladeShiver: 0.09, // ring-out of a planted blade on landing (rad)
    bladeLineReach: 0.86, // a line's blades span this much of the reach either side
    bladeBurstSeat: 0.55, // a burst's blades are planted at this fraction of the reach
    biteCrack: 0.75, // crack decal radius under each blade (m)
    biteLife: 2.4, // crack decal life (s)
    chipCount: 6, // stone chips thrown per blade bite
    chipSize: 0.09,
    chipSpeed: 3.2,
    chipLife: 0.8,
    colorChipA: '#e9e4ff',
    colorChipB: '#8b7fd6',
    colorChipC: '#3b2f6e',
    colorChipD: '#120a2a',
    ringGlow: 0.5, // floor ring brightness (× band glow)

    /* --- 4 · the release --- */
    releaseLife: 0.5, // each flare lasts (s)
    releaseGrow: 0.2, // a ring flare grows by (× reach)
    releaseGlow: 2.2,
    releaseOpacity: 0.65,
    beamHeight: 4, // column of light (m)
    beamWidth: 0.42, // column radius (m)
    beamLife: 0.35, // column fades over (s)
    beamGlow: 3,
    /* the glyph wall: a curtain of runes rising out of the floor in the
       struck shape (an open ring, a straight wall, an expanding ring) */
    wallHeight: 1.9, // metres
    wallLife: 0.7, // seconds it stands
    wallGlow: 1.6,
    wallOpacity: 0.8,
    wallColumns: 28, // rune columns per 2π (ring) or per wall
    wallRise: 0.18, // seconds it takes to rise

    /* --- travel: the armillary is thrown from the hand to the target --- */
    travelScale: 0.5, // armillary size in flight (× rest size)
    travelArc: 1.4, // apex of the flight arc (m)
    travelSpin: 6, // extra band spin in flight (rad/s)
    handHeight: 1.45, // it leaves the hand at (m)
    trailRate: 90, // streaks per second shed in flight
    trailSize: 0.07,
    trailLife: 0.45,

    /* --- 5 · particles --- */
    strikeCount: 42, // streaks thrown per release
    strikeSize: 0.075,
    strikeLife: 0.7,
    strikeSpeed: 3,
    ambientRate: 14, // streaks/second rising off the sigil while charging
    ambientSize: 0.05,
    ambientLife: 0.9,
    ambientSpeed: 1.1,
    sparkGlow: 1.6,
    colorSparkA: '#ffffff', // birth
    colorSparkB: '#c9cbff',
    colorSparkC: '#7c8cff',
    colorSparkD: '#372275', // death
    moteCount: 140, // GPU motes (≤ 160)
    moteSize: 0.06,
    moteRise: 1.6, // climb over one life (m)
    moteSwirl: 1.2, // orbit speed (rad/s)
    moteGlow: 2,
    moteColor: '#f2f0ff', // hot core of a mote

    /* --- 6 · the strike (burst, decals, camera) --- */
    burstReach: 0.9, // arcane shell grows to (× reach)
    burstIntensity: 0.7,
    burstLife: 0.5,
    burstOpacity: 0.55,
    burstFresnel: 2, // rim sharpness of the shell
    burstSquash: 0.35, // vertical squash of the shell (1 = sphere)
    decalLife: 0.8,
    decalWidth: 0.06, // shockwave / arc scar width for the burst and line shapes
    decalIntensity: 0.8,
    colorBurstA: '#ffffff',
    colorBurstB: '#9aa4ff',
    colorBurstC: '#3a2a8a',
    impactShake: 0.12, // camera knock per release (× explosion intensity, × camera shake)
    shakeDecay: 7,
    shakeFrequency: 20,
    impactFlash: 0.08, // screen flash per release (× explosion intensity)

    /* --- 7 · the warp --- */
    warpStrength: 0.6, // release pressure ring strength (× global distortion)
    warpWidth: 0.12, // ring thickness (fraction of reach)
    warpLife: 0.45, // ring runs out over (s)
    warpSwirl: 0.25, // slow swirl while a beat charges
  },
};
