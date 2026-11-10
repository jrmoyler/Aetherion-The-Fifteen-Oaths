/**
 * False Victory — illusion, zone cast. Data only, no imports.
 *
 * The enemy's defeat is staged before it happens. A laurel wreath of dark
 * iridescent lacquer is thrown and crowns the circle over a black-and-violet
 * chessboard dais under a stage light. Every enemy standing inside when the
 * crown lands is *marked*: a chess-king effigy of lacquered obsidian rises
 * beside it and topples outward — the gesture of resignation — and confetti
 * rains on a victory nobody has won yet. When the reveal comes the wreath
 * clamps down, its leaves fly out like knives, the kings shatter, and every
 * marked enemy still inside the circle is struck in exactly the direction its
 * king fell. Enemies that walked out of the staged defeat saw through it.
 *
 * Every key below is a live editor control.
 */
export default {
  id: 'falseVictory',
  meta: {
    label: 'False Victory',
    accent: '#c86bff',
    element: 'illusion',
    cast: 'zone',
    hint: 'Illusion — a laurel crowns the circle and every enemy inside is shown its own defeat, then made to fall the way its king did',
    // A laurel wreath (two branches, open at the top) round a toppled king.
    glyph:
      '<path d="M30 20C12 34 12 66 34 82M70 20C88 34 88 66 66 82"/>' +
      '<path d="M22 34l-8-4M18 50l-9 0M22 66l-8 4M78 34l8-4M82 50l9 0M78 66l8 4"/>' +
      '<path d="M38 70h26M44 70l4-26h6l4 26M47 40h8M51 33v10"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 15, // max range (m)
    minRange: 2,
    speed: 26, // the thrown wreath flies at (m/s)
    cooldown: 3.2,
    castAnim: 'cast2',
    zoneRadius: 3.4, // the staged circle (m) — who is marked, who is struck
    lifetime: 3.4, // nominal cast length, for the HUD

    /* --- the rule (gameplay) --- */
    revealDelay: 1.55, // s after the crown lands until the staged defeat is made true
    maxMarked: 7, // at most this many enemies are marked (≤ 8)
    escapeSlack: 0.25, // m beyond zoneRadius a marked enemy may stand and still be struck
    deceiveTicks: 60, // UCSM 'deceived' status length when combat is on (ticks)
    hitDamage: 1,
    hitImpulse: 9, // knockback along the king's fall (m/s, × explosion intensity)
    hitLift: 4.2,
    hitSpin: 2.2,

    /* --- light --- */
    lightColor: '#9a4dff',
    lightIntensity: 4.5,
    lightRadius: 11,
    landLight: 4, // light punch when the crown lands (× explosion intensity)
    revealLight: 9, // and at the reveal

    /* --- palette: the four-stop ramp --- */
    colorCore: '#fff2ff', // white-hot core
    colorTint: '#ff9fe6', // pale magenta tint
    colorBody: '#9b2cff', // saturated violet body
    colorDeep: '#12041f', // dark deep tone — grounds everything on the floor
    colorFilm: '#38e8ff', // thin-film counter hue (cyan) in the lacquer

    /* --- 1 · the wreath (hero, solid lit lacquer) --- */
    wreathSeat: 0.86, // wreath radius × zoneRadius
    crownHeight: 2.3, // hovers this high over the dais (m)
    crownSink: 0.6, // drifts down this much during the linger (m)
    crownTilt: 0.42, // rad, tipped toward the caster so the camera reads the ring
    crownTurn: 0.22, // rad/s it turns while it hovers
    leafCount: 72, // leaves along both branches (≤ 80)
    leafLength: 0.95, // leaf length (× zoneRadius × 0.25 → ~0.8 m at 3.4)
    leafWidth: 0.4, // leaf width (× length)
    leafSplay: 0.75, // rad the leaves fan out of the branch
    leafRows: 2, // alternate leaves out/in of the branch
    gapAngle: 0.55, // rad of open gap where the two branches do not meet
    unfurlTime: 0.5, // s for the leaves to unfurl round both branches from the gap
    flutter: 0.18, // rad of travelling flutter on the leaves during the linger
    flutterRate: 3.2, // rad/s
    stemThickness: 1.6, // branch stem thickness scale
    lacquerRough: 0.28, // lacquer roughness (spec width)
    lacquerSpec: 1.6, // specular strength
    filmStrength: 1.1, // thin-film iridescence at grazing angles
    lacquerGlow: 0.35, // inner emissive glow in the veins
    travelHeight: 1.5, // m: the arbor height it is thrown from
    travelArc: 2.2, // m: extra height at the top of the throw
    travelScale: 0.22, // × size while in flight
    travelSpin: 11, // rad/s it spins in flight

    /* --- 2 · the kings (effigies, solid lit obsidian) --- */
    kingHeight: 2.1, // m
    kingWidth: 0.82, // base radius scale (m)
    kingOffset: 0.55, // m behind the marked enemy, along its fall
    riseTime: 0.32, // s to rise out of the dais
    riseStagger: 0.08, // s between kings, nearest the caster first
    rockTime: 0.38, // s it rocks before tipping
    rockAngle: 0.14, // rad
    toppleAt: 0.5, // s after landing the first king tips over
    toppleTime: 0.42, // s to fall flat
    toppleStagger: 0.05, // s between kings
    toppleBounce: 0.12, // rad of bounce when it lands
    kingGloss: 1.4, // obsidian specular
    crackGlow: 2.6, // seam glow as the reveal approaches
    shatterTime: 0.55, // s for a king's dissolve after the reveal

    /* --- 3 · the dais (floor field) --- */
    tileSize: 0.62, // chessboard tile (m)
    daisGlow: 0.9,
    daisOpacity: 0.92,
    groutGlow: 1.2, // lit grout lines between the tiles
    rimWidth: 0.12, // laurel rim band (× radius)
    flipRate: 1.6, // tiles flipping their colour per second (glitch)
    sheen: 0.8, // thin-film sheen on the dark tiles
    daisDissolve: 0.85, // fraction of the fade spent dissolving

    /* --- 4 · the stage light (volumetric cone) --- */
    spotHeight: 7.5, // m
    spotTopRadius: 0.35, // m
    spotSpread: 1.05, // bottom radius × zoneRadius
    spotGlow: 0.4,
    spotDust: 0.8, // dust in the beam

    /* --- 5 · particles --- */
    confettiRate: 70, // confetti per second during the triumph
    confettiSize: 0.13,
    confettiLife: 2.2,
    confettiFall: 2.6, // gravity on the confetti (m/s²)
    confettiDrift: 0.5,
    colorConfettiA: '#fff2ff',
    colorConfettiB: '#ff7ad9',
    colorConfettiC: '#7a2cd6',
    colorConfettiD: '#1a0630',
    glitterRate: 45, // additive motes rising off the dais
    glitterSize: 0.07,
    glitterLife: 1.4,
    glitterGlow: 1.6,
    shardCount: 14, // shards thrown per king at the reveal
    shardSize: 0.09,
    shardSpeed: 3.2,
    shardLife: 0.9,
    trailCount: 3, // glitter shed every 30 ms in flight
    leafFlight: 1.6, // × radius the leaves are thrown out at the reveal
    leafFlightTime: 0.6, // s

    /* --- 6 · impacts --- */
    landShake: 0.22, // (× explosion intensity, × camera shake)
    landFlash: 0.1,
    revealShake: 0.6,
    revealFlash: 0.22,
    shakeDecay: 6,
    shakeFrequency: 18,
    burstReach: 1.15, // reveal shell grows to (× radius)
    burstLife: 0.6,
    burstOpacity: 0.45,
    decalLife: 2.6, // the shockwave/scorch outlive the cast
    crackDecals: 1, // 1 = a crack decal under every fallen king

    /* --- 7 · the mirage (distortion) --- */
    mirageStrength: 0.45, // shimmer over the dais while the illusion holds (× global distortion)
    revealWarp: 1.1, // pressure ring at the reveal
  },
};
