/**
 * Countermand Sigil — arcane, zone cast. Data only, no imports.
 *
 * A cast-reactive sigil, built as a thing rather than drawn on the floor: a
 * standing seal of black arcane glass is thrown from the hand, bites upright
 * into a slot it tears in the floor, and serves a *writ* — a lit rune-nail —
 * over every enemy inside the circle. While it watches it turns to face each
 * marked body in turn and any other spell that lands inside the circle is
 * **countermanded**: the seal answers it with a writ of its own over the spot,
 * and the verdict comes sooner and harder. Then the veto bar drives through
 * the ring — the order is struck through — and every writ drives down.
 *
 * Every key below is a live editor control. Gameplay keys (range, radius,
 * timings, marks, force) are read every frame; the rest are the craft layer.
 */
export default {
  id: 'countermandSigil',
  meta: {
    label: 'Countermand Sigil',
    accent: '#d77bff',
    element: 'arcane',
    cast: 'zone',
    hint: 'Arcane — a standing seal marks every foe with a writ, answers any spell cast into it, then strikes its order through',
    glyph:
      '<circle cx="50" cy="50" r="33"/><circle cx="50" cy="50" r="19"/><path d="M22 78L78 22M50 6V17M50 83V94M6 50H17M83 50H94"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 16, // max aim distance (m)
    minRange: 2, // min aim distance (m)
    speed: 26, // the thrown seal flies at (m/s)
    cooldown: 4.5,
    castAnim: 'cast2',
    zoneRadius: 3.6, // the sigil's jurisdiction — marks, countermands and the verdict (m)
    lifetime: 3.2, // nominal cast length, for the HUD (the beats set the real timing)

    /* --- the order (gameplay) --- */
    maxMarks: 7, // enemies served a writ when the seal plants (nearest first)
    verdictDelay: 1.05, // seconds from planting to the verdict (× global lifetime)
    maxCountermands: 3, // other spells the seal may answer before the verdict
    countermandRadius: 1.4, // a countermand writ strikes everything this close to where the spell landed (m)
    countermandHaste: 0.18, // each countermand brings the verdict this much sooner (s)
    countermandBonus: 0.35, // and adds this much force to the verdict (× per countermand)
    verdictDamage: 1, // damage per writ through the combat binding
    hitImpulse: 13, // knockback (m/s, × explosion intensity), away from the seal
    hitLift: 6,
    hitSpin: 2.2,

    /* --- timing (× global lifetime) --- */
    windupTime: 0.22, // the seal forms in the hand before it is thrown (s)
    plantTime: 0.32, // it unfolds to full size after landing (s)
    lockTime: 0.16, // the veto bar drives through over the last part of the watch (s)
    afterTime: 0.95, // linger after the verdict: the seal sinks, writs shatter (s)
    exitTime: 0.6, // the exit: everything dissolves (s)

    /* --- the throw --- */
    handHeight: 1.35, // the seal forms this high at the hand (m)
    throwScale: 0.2, // its size in the hand and in flight (× full size)
    throwArc: 1.4, // extra height at the top of the throw (m)
    throwSpin: 16, // it flips like a coin in flight (rad/s)

    /* --- light --- */
    lightColor: '#d77bff',
    lightIntensity: 6,
    lightRadius: 11,
    lightHeight: 2.2, // the light rides the seal this high (m)
    plantLight: 4, // light punch when the seal plants (× explosion intensity)
    verdictLight: 9, // light punch at the verdict (× explosion intensity)

    /* --- palette (four-stop ramp: core → tint → body → deep) --- */
    colorCore: '#fff2fd', // white-hot runes, pupil, verdict
    colorTint: '#f6a6ff', // pale orchid: rims, writ tips, seams
    colorBody: '#a33cff', // saturated arcane violet: rune channels, iris
    colorDeep: '#1a0630', // black-violet: obsidian, char, the floor

    /* --- 1 · the seal (hero, lit obsidian) --- */
    sealSize: 0.6, // outer radius of the standing seal (× zone radius) — ~2.2 m, 4.3 m across
    sealLift: 0.3, // the seal's lowest point sits this far *into* the slot (m)
    sealDepth: 0.26, // thickness of the outer ring (× seal radius)
    sealLean: 0.16, // it leans back from the caster (rad)
    sealSpin: 0.55, // the outer ring turns in its own plane while it watches (rad/s)
    innerSpin: -0.9, // the silver glyph ring counter-turns (rad/s)
    watchTurn: 0.62, // how far the seal yaws to face each marked target (0 = always faces the caster)
    watchRate: 2.2, // targets it turns to look at per second
    obsidianColor: '#1d0b2a', // the glass's body
    obsidianRoughness: 0.16,
    obsidianMetalness: 0.35,
    silverColor: '#b9a7d9', // the inner glyph ring's metal
    silverRoughness: 0.3,
    silverMetalness: 0.9,
    runeGlow: 2.4, // brightness of the engraved rune channels
    runeCells: 16, // glyph cells round the outer ring
    runeWidth: 0.07, // engraved stroke width (fraction of a cell)
    edgeGlow: 0.9, // the bevel seam's glow
    fresnelGlow: 0.8, // orchid rim light on the glass

    /* --- 2 · the veto bar --- */
    barLength: 1.18, // bar length (× seal diameter)
    barAngle: 0.785, // it crosses the ring at this angle (rad, π/4 = the struck-through glyph)
    barHover: 1.6, // before the verdict it hangs this far from the ring along its own axis (× seal radius)
    barDrift: 0.25, // it slides in and out on its axis while waiting (× seal radius)
    barGlow: 2.8, // the bar's channel at the lock

    /* --- 3 · the iris and aura --- */
    irisGlow: 1.6, // the eye membrane inside the ring
    irisSwirl: 0.9, // swirl speed of the membrane
    pupilWidth: 0.22, // slit width at rest (× iris radius) — narrows as the verdict nears
    auraGlow: 0.55, // the N·V aura shell round the seal
    auraScale: 1.25, // aura size (× seal radius)

    /* --- 4 · the writs --- */
    writLength: 1.5, // rune-nail length (m)
    writHeight: 2.7, // hovers this high over its target (m, to the nail's head)
    writFlight: 0.3, // flies from the seal to its target over (s)
    writBob: 0.12, // bob while hovering (m)
    writSpin: 2.4, // turn about its axis while hovering (rad/s)
    writDrive: 0.09, // drives down onto the target over (s)
    writSink: 0.45, // ends this far into the floor (m)
    writGlow: 2.2,

    /* --- 5 · the floor (slot and brand) --- */
    floorGlow: 1.6, // seams and slot brightness
    floorChar: 0.8, // how dark the brand burns the floor (0–1)
    crackScale: 2.2, // voronoi crack density
    slotWidth: 0.34, // the slot the seal stands in (m)
    markRadius: 0.75, // the reticle burned under each writ (m)
    brandFade: 0.7, // fraction of the exit spent dissolving the brand
    plantShake: 0.28, // camera knock when the seal bites (× explosion intensity, × camera shake)
    plantFlash: 0.1,
    crackDecal: 0.65, // CRACK decal at the plant (× zone radius)
    dustDecal: 1.2, // DUSTRING at the plant (× zone radius)
    decalLife: 2.4, // plant/verdict decals last (s)
    scorchLife: 6, // the verdict scorch outlives the cast (s)

    /* --- 6 · particles --- */
    moteRate: 70, // motes drawn up from the seams into the seal while it watches (/s)
    moteSize: 0.09,
    moteLife: 0.9,
    moteSpeed: 2.2,
    handMotes: 16, // motes gathered round the hand per 30 ms of the windup
    sparkCount: 70, // streaks thrown at the plant and the verdict
    sparkSize: 0.07,
    sparkLife: 0.55,
    sparkSpeed: 8,
    trailCount: 3, // streaks shed every 30 ms by the thrown seal and the flying writs
    chipCount: 40, // obsidian chips thrown at the plant and when the writs shatter
    chipSize: 0.11,
    chipLife: 1.1,
    chipSpeed: 4.5,
    particleGlow: 1.6,
    colorMoteA: '#fff2fd',
    colorMoteB: '#f6a6ff',
    colorMoteC: '#a33cff',
    colorMoteD: '#1a0630',
    colorChipA: '#5a3b78',
    colorChipB: '#2d1546',
    colorChipC: '#1a0630',
    colorChipD: '#08020f',

    /* --- 7 · the verdict --- */
    verdictShake: 0.5, // (× explosion intensity, × camera shake)
    shakeDecay: 6,
    shakeFrequency: 20,
    verdictFlash: 0.16, // (× explosion intensity)
    burstReach: 1.25, // STORM shell grows to (× seal radius)
    burstLife: 0.5,
    burstIntensity: 1,
    burstOpacity: 0.65,
    shockReach: 1.7, // SHOCKWAVE decal reaches (× zone radius)
    shockWidth: 0.07,
    arcSize: 0.9, // ARC decal under each struck writ (m)

    /* --- 8 · the lens --- */
    lensPull: 0.55, // inward pull through the ring while it watches (× global distortion)
    lensShock: 1.1, // pressure ring at the verdict
  },
};
