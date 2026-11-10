/**
 * Trajectory Hijack — motion, zone cast. Data only, no imports.
 *
 * Redirect projectile heading, as a real rule. The caster fans a volley of
 * steel darts at the hand and fires them straight down the aim line. At the
 * target a ring of cambered stator vanes has heaved out of the floor; the
 * moment the lead dart reaches the ring the vanes snap from radial to swirl
 * pitch and *seize* the volley. Every dart is bent into an orbit round a
 * compass-needle hub, circles at least `minTurn` of a turn, and is released
 * on the tangent that points at the target it was assigned — then hooked
 * through a curve onto that body, which is flung along the hijacked heading,
 * not away from the caster. Darts with nobody to hit are thrown off on their
 * tangent and burn out. One dart, one body; never more hits than darts.
 *
 * Every key below is a live editor control. Distances are metres, times are
 * seconds (× `settings.global.lifetime` for the charge, orbit and exit),
 * speeds are m/s (× `settings.global.speed` for the inbound flight).
 */
export default {
  id: 'trajectoryHijack',
  meta: {
    label: 'Trajectory Hijack',
    accent: '#ffb088',
    element: 'motion',
    cast: 'zone',
    hint: 'Motion — a stator ring seizes your volley, swings it round and redirects every dart at a target',
    glyph:
      '<circle cx="56" cy="46" r="20"/><path d="M8 90L36 62M36 62A20 20 0 1 1 72 32L90 14M78 14H90V26"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 16, // max cast distance (m)
    minRange: 2, // min cast distance (m)
    speed: 30, // darts fly the aim line at (m/s, × global speed)
    cooldown: 4, // seconds between casts
    castAnim: 'cast2', // which clip in CAST_ANIMATIONS the body throws
    zoneRadius: 4.2, // the stator ring's radius — everything is seated from it (m)
    lifetime: 3.8, // nominal cast length, for the HUD (s)

    /* --- the hijack (gameplay) --- */
    dartCount: 7, // darts in the volley (≤ 12) — the hit cap
    lockReach: 1, // bodies inside lockReach × zoneRadius are assigned a dart (nearest first)
    minTurn: 0.4, // every seized dart circles at least this much of a turn before release
    orbitSpeed: 13, // seized darts circle at (m/s, ÷ global lifetime) — the brake
    releaseSpeed: 30, // hijacked darts leave the ring at (m/s)
    bendReach: 0.55, // how far the release tangent carries before the hook bends onto the target (× chord)
    hitHeight: 1.05, // darts land on the body this high (m)
    freeReach: 1.1, // a dart with no target flies this far past its release (× zoneRadius)
    freeTurn: 0.6, // extra turn spread for untargeted darts (× half a turn)
    hitImpulse: 15, // knockback along the hijacked heading (× explosion intensity)
    hitLift: 6,
    hitSpin: 3,

    /* --- timing --- */
    chargeTime: 0.28, // the volley fans out at the hand before the first launch
    launchGap: 0.11, // seconds between darts leaving the hand
    trailTime: 0.42, // seconds of flight each ribbon remembers
    exitTime: 0.7, // vanes feather and sink, the field dissolves over (s)

    /* --- light --- */
    lightColor: '#ff9a62',
    lightIntensity: 5,
    lightRadius: 11,
    lightHeight: 1.2, // the light sits this high over the ring (m)
    impactLight: 6, // light punch on the seize (× explosion intensity)
    hitLight: 2.5, // light punch on each hit

    /* --- palette (four-stop ramp) --- */
    colorCore: '#fff2e4', // white-hot
    colorTint: '#ffc39a', // pale peach
    colorBody: '#ff6a2c', // saturated motion orange
    colorDeep: '#2a0c05', // the deep that grounds it

    /* --- 1 · the volley at the hand (anticipation) --- */
    handForward: 0.55, // the fan forms this far ahead of the caster (m)
    handHeight: 1.45, // and this high (m)
    fanRadius: 0.75, // the darts stand on an arc this wide (m)
    fanSpread: 2.2, // the arc spans (rad)
    fanSpin: 14, // darts spin round their own axis while charging (rad/s)

    /* --- 2 · the darts (solid, lit steel) --- */
    dartSize: 1.25, // dart length (m)
    dartGirth: 1.25, // thickness scale
    dartRoll: 18, // spin round the flight axis (rad/s)
    dartColor: '#5a5450', // the steel
    dartMetalness: 0.9,
    dartRoughness: 0.28,
    dartGlow: 0.9, // emissive heat of the steel (× global glow)

    /* --- 3 · the ribbons --- */
    trailWidth: 0.3, // half-width at the head (m)
    trailTaper: 1.3, // how fast it thins toward the tail (power)
    trailGlow: 2.4, // brightness (× global glow)
    trailOpacity: 0.95,
    trailStreak: 0.6, // noise streaking along the ribbon

    /* --- 4 · the orbit --- */
    orbitSeat: 0.55, // orbit radius (× zoneRadius)
    seatJitter: 0.22, // per-dart spread of the orbit radius (fraction)
    orbitHeight: 1.15, // orbit height (m)
    heightJitter: 0.45, // per-dart spread of the orbit height (m)
    orbitClimb: 0.45, // the orbit climbs this much per turn (m) — a helix, not a ring
    entrySide: 1, // ±1: the side the volley swings in on (sets the spin)

    /* --- 5 · the stator vanes (hero, solid) --- */
    vaneCount: 9, // vanes in the ring (≤ 16)
    vaneSeat: 0.9, // ring radius (× zoneRadius)
    vaneHeight: 2.7, // (m)
    vaneChord: 1.25, // (m)
    vaneThickness: 0.16, // airfoil thickness (× chord)
    vaneCamber: 0.12, // airfoil camber (× chord)
    vaneTwist: 0.55, // twist root → tip (rad)
    vaneSweep: 0.3, // the leading edge sweeps back with height (× chord)
    vaneTaper: 0.4, // tip chord shrinks by
    vaneLean: 0.14, // vanes lean out over the floor (rad)
    vaneColor: '#5c524c', // gunmetal
    vaneMetalness: 0.6,
    vaneRoughness: 0.42,
    vaneEmissive: 0.08, // a low ember in the metal (× global glow)
    riseDelay: 0.05, // vanes start to heave up after (s)
    riseTime: 0.42, // each vane rises over (s)
    riseOvershoot: 1.6, // spring past full height (outBack strength)
    sweepTime: 0.3, // the rise runs round from the caster's side over (s)
    seizePitch: 1.05, // pitch the vanes snap to on the seize (rad from radial)
    snapTime: 0.16, // the snap lasts (s)
    ringSpin: 0.35, // the ring turns with the volley (rad/s)
    kickPitch: 0.45, // a vane flicks this much when a dart leaves past it (rad)
    kickDecay: 7, // and settles at (1/s)
    kickRate: 22, // ringing frequency of the flick (rad/s)

    /* --- 6 · the vane edges (light) --- */
    edgeGlow: 2.2, // leading-edge brightness (× global glow)
    edgeWidth: 0.12, // glowing band at the leading edge (× chord)
    edgeFlow: 1.6, // chevrons climb the edge at (rev/s)
    edgeChevrons: 5, // chevrons per vane height

    /* --- 7 · the hub (compass needle) --- */
    hubHeight: 1.7, // the needle floats this high (m)
    needleLength: 0.42, // half-length (× zoneRadius)
    needleGirth: 1.4, // thickness scale
    needleSearch: 5, // spin while it has no heading yet (rad/s)
    needleDip: 0.18, // tips down toward the target (rad)
    gimbalSize: 0.34, // gimbal ring radius (× zoneRadius)
    gimbalSpin: 2.2, // the gimbal turns at (rad/s)
    needleGlow: 2.6, // the north tip's glow (× global glow)

    /* --- 8 · the deflection field (floor) --- */
    fieldScale: 1.12, // field radius (× zoneRadius)
    fieldDeep: 0.72, // opacity of the dark floor under it
    fieldGlow: 1.6, // brightness of the stream lines (× global glow)
    streamArms: 18, // spiral stream lines round the field
    streamFlow: 0.45, // they flow inward at (rev/s)
    streamTwist: 2.4, // how hard the lines bend with the vane pitch
    rimTicks: 36, // compass ticks on the rim
    bandGlow: 1.4, // the orbit band's brightness while darts are held
    fieldNoise: 0.6, // noise warp of the lines
    dissolveEdge: 0.08, // burning edge on the exit dissolve

    /* --- 9 · particles --- */
    sparkCapture: 14, // sparks on each seize of a dart
    sparkRelease: 18, // sparks thrown along the tangent on each release
    sparkHit: 26, // sparks at each hit
    sparkSize: 0.09,
    sparkLife: 0.45,
    sparkSpeed: 7,
    sparkGlow: 2, // (× global glow)
    chargeSparks: 40, // sparks drawn into the fan per second while charging
    chipHit: 14, // steel chips at each hit
    chipSize: 0.08,
    chipLife: 0.8,
    chipSpeed: 4.5,
    dustRate: 30, // dust per second off rising and sinking vanes
    dustSize: 0.55,
    dustLife: 1.1,
    dustColor: '#4a3a33',
    seizeSparks: 60, // sparks on the seize (impact)

    /* --- 10 · the seize (impact) --- */
    impactShake: 0.45, // camera knock (× explosion intensity)
    hitShake: 0.12, // small knock per hit
    shakeDecay: 7,
    shakeFrequency: 22,
    impactFlash: 0.16, // screen flash (× explosion intensity)
    burstReach: 1.05, // pressure shell grows to (× zoneRadius)
    burstLife: 0.5,
    burstOpacity: 0.55,
    burstSquash: 0.35,
    shockReach: 1.25, // SHOCKWAVE decal (× zoneRadius)
    scorchSize: 0.9, // scorch under each hit (m)
    decalLife: 3.2, // marks outlive the cast (s)

    /* --- 11 · the lens --- */
    lensSwirl: 0.55, // the air bent round the orbit band (× global distortion)
    lensShock: 0.9, // pressure ring on the seize
  },
};
