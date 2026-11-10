/**
 * Existence Tax — void, zone cast. Data only, no imports.
 *
 * The void does not destroy; it *collects*. A black writ-coin is minted in the
 * caster's hand and lobbed at the target; it slots into the floor and the floor
 * answers by tearing up into a solid obsidian gravity-well — a coin funnel the
 * width of the zone, its inner wall falling away into a throat that is simply
 * not there. Four times the ledger on its rim lights another quarter and the
 * whole well ratchets round: every enemy inside pays a tithe (a square-holed
 * coin is struck out of it and rolls the spiral down into the throat), the
 * zone itself pays a ring of coins, and an inverted vortex of smoke is drawn
 * down through the middle. When the assessment closes, the one **eligible
 * construct** — the enemy that paid the most — is consumed: seized, carried
 * round the well and taken by the throat. Then the funnel folds back into the
 * hole it came out of.
 *
 * Every key below is a live editor control. Placement is derived from
 * `zoneRadius`: the rim sits on `rimSeat·R`, the foot on `footSeat·R`, the
 * coins roll from the rim to the throat, so dragging the radius mid-cast
 * reshapes the well, the coin paths and the ledger together.
 */
export default {
  id: 'existenceTax',
  meta: {
    label: 'Existence Tax',
    accent: '#a77bff',
    element: 'void',
    cast: 'zone',
    hint: 'Void — an obsidian well levies a tithe from everything inside, then consumes the construct that paid the most',
    // A funnel seen from the side, its spiral, and the square-holed coin.
    glyph:
      '<path d="M8 30C30 30 44 40 47 70H53C56 40 70 30 92 30"/><path d="M22 38C38 42 50 48 50 70M78 38C62 42 52 52 50 70"/><circle cx="50" cy="16" r="10"/><path d="M46 12H54V20H46Z"/><path d="M40 86H60"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 16, // max cast distance (m)
    minRange: 2,
    speed: 22, // the writ flies at (m/s)
    cooldown: 6,
    castAnim: 'cast2',
    zoneRadius: 3.4, // the assessed circle; the well is built on it (m)
    lifetime: 4, // nominal cast length, for the HUD (s)
    exitTime: 0.8, // the well folds back into its throat over (s, × global lifetime)

    /* --- 0 · the writ (anticipation + travel) --- */
    chargeTime: 0.3, // the coin is minted at the hand before it leaves (s)
    writSize: 0.85, // writ coin diameter (m)
    writHeight: 1.45, // held at (m)
    writArc: 2.2, // lob height over the line (m)
    writFlips: 5, // end-over-end turns during the flight
    writGlow: 2.2, // engraved rim glow

    /* --- 1 · the well (the hero) --- */
    rimSeat: 0.92, // rim radius (× zoneRadius)
    footSeat: 0.7, // outer wall meets the floor at (× zoneRadius)
    rimHeight: 1.15, // lip height (m)
    lipRadius: 0.16, // the rolled lip's thickness (m)
    throatRadius: 0.42, // the hole at the bottom (m)
    throatHeight: 0.1, // where the inner wall meets the throat (m)
    wellCurve: 1.15, // >1 steepens the gravity well near the throat
    riseTime: 0.42, // the well tears up out of the floor over (s)
    riseOvershoot: 0.14, // the lip punches past its height on arrival (× height)
    spinSpeed: 0.22, // slow turn of the well (rad/s)
    ratchetAngle: 0.55, // each assessment snaps the well round by (rad)
    ratchetTime: 0.22, // the snap settles over (s)
    obsidianColor: '#0c0a12',
    obsidianMetalness: 0.35,
    obsidianRoughness: 0.16,
    grooveArms: 3, // spiral grooves cut into the inner wall
    grooveTwist: 2.6, // their winding
    grooveFlow: 0.7, // how fast the light runs down them
    grooveGlow: 1.6,
    ledgerGlow: 2.6, // the rim ledger arcs, lit one per assessment
    throatGlow: 3.2, // the photon lip round the throat
    rimFresnel: 1.1, // violet rim light on the obsidian
    finCount: 12, // ledger fins round the outer wall (≤ 16)
    finHeight: 0.95, // fin height (× rim height)
    finReach: 0.42, // how far a fin stands out from the wall (m)

    /* --- 2 · the tithe coins --- */
    coinSize: 0.42, // coin diameter (m)
    coinsPerTick: 4, // coins the zone itself pays on each assessment
    coinFlight: 0.42, // a levied coin's flight from its payer to the rim (s)
    coinArc: 1.2, // and the height of that flight (m)
    spiralTime: 1.25, // rim → throat (s)
    spiralTurns: 1.6, // turns a coin makes on the way down
    coinLean: 0.45, // coins roll leaning into the well (rad)
    coinGlow: 1.8, // engraved edge glow

    /* --- 3 · the vortex (drawn down into the throat) --- */
    vortexHeight: 4.4, // (m)
    vortexTop: 1.5, // radius at the top (m)
    vortexTwist: 2.4, // turns over its height
    vortexFlow: 1.3, // downward flow speed
    vortexOpacity: 0.78,
    vortexGlow: 1.8, // violet edge light in the smoke

    /* --- 4 · the floor (excision field) --- */
    fieldSeat: 1.32, // field radius (× zoneRadius)
    fieldDarkness: 0.86, // how much the floor is eaten
    fieldGlow: 1.4, // cracks and ledger rings
    crackScale: 2.2, // voronoi cracks per metre-ish
    telegraph: 0.45, // the target ledger shown while the writ is in the air
    dissolveTime: 0.85, // fraction of the exit spent dissolving

    /* --- 5 · the assessment (gameplay) --- */
    assessDelay: 0.3, // first assessment after landing (s)
    taxTicks: 4, // assessments (and ledger arcs)
    taxInterval: 0.36, // between assessments (s)
    eligibleLevies: 3, // a construct must pay at least this many to be eligible
    maxConsume: 1, // eligible constructs consumed per cast (≤ 3)
    taxCorrode: 0.16, // each levy stains a dummy by (0..1)
    taxStatus: 1, // UCSM 'hollowed' intensity per levy (≤ 3)
    taxDuration: 2.5, // and how long it holds (s)
    consumeDelay: 0.28, // the call comes this long after the last assessment (s)
    consumeHold: 1.05, // the seized construct is carried and eaten over (s)
    consumeDamage: 3, // UCSM damage of the consumption (≤ 10)
    hitImpulse: 2.5, // the seizure knocks the body inward, gently (× explosion intensity)
    hitLift: 3.2,
    hitSpin: 2.4,
    pullSpeed: 4.2, // carry speed of the seized body toward the throat (m/s)
    pullSwirl: 3.4, // and round it (m/s)
    devour: 1.6, // how fast the throat eats a body inside it (/s)

    /* --- 6 · particles --- */
    moteRate: 26, // motes drawn spiralling into the well (/s)
    moteSize: 0.09,
    moteLife: 1.3,
    moteSpeed: 0.9,
    sparkCount: 22, // sparks at each assessment and coin mint
    sparkSize: 0.07,
    sparkLife: 0.45,
    sparkSpeed: 4.5,
    ashRate: 14, // dark ash sinking into the throat (/s)
    ashSize: 0.55,
    ashLife: 1.4,
    chipCount: 36, // fragments torn off the consumed construct
    chipSize: 0.12,
    chipLife: 1.1,
    particleGlow: 1.4,
    colorMoteA: '#f3e9ff',
    colorMoteB: '#b58cff',
    colorMoteC: '#5b2bd6',
    colorMoteD: '#0b0618',

    /* --- 7 · impact and consumption --- */
    impactShake: 0.3, // landing knock (× explosion intensity, × camera shake)
    tickShake: 0.06, // each assessment ticks the camera
    consumeShake: 0.42, // the swallow
    shakeDecay: 7,
    shakeFrequency: 16,
    impactFlash: 0.1, // (× explosion intensity) — the void flashes dimly
    consumeFlash: 0.16,
    impactLight: 9, // light punch on landing
    consumeLight: 14, // and when the throat takes the construct
    burstReach: 1.05, // landing shell grows to (× zoneRadius)
    burstLife: 0.5,
    burstOpacity: 0.55,
    decalLife: 6, // the scar outlives the cast (s)
    swallowSquash: 0.16, // the well clenches inward at the swallow (× radius)

    /* --- 8 · the lens --- */
    lensPinch: 0.9, // inward pinch round the throat (× global distortion)
    lensShock: 1.1, // the landing ring

    /* --- palette (core → tint → body → deep) --- */
    colorCore: '#f3e9ff',
    colorTint: '#b58cff',
    colorBody: '#5b2bd6',
    colorDeep: '#0b0618',
    corrodeColor: '#140a26', // stain on a taxed body
    lightColor: '#8f5cff',
    lightIntensity: 6,
    lightRadius: 10,
  },
};
