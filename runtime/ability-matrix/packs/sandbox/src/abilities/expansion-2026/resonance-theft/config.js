/**
 * Resonance Theft — sound, zone cast. Data only, no imports.
 *
 * A sound cast that *takes* before it gives. A coiled horn — a cochlea of
 * dark lacquered bronze — winds itself together at the caster's hand, is
 * thrown on a low arc and unfurls over the circle, mouth down. Then it
 * **listens**: every enemy inside the circle is tapped by a corkscrew
 * waveform that drains its frequency up into the bell, and any attack another
 * cast lands inside the circle while it listens is swallowed too. Each stolen
 * frequency lights a band on the horn and a groove on the floor. When the
 * listening ends the horn **plays it all back**: a cone of pressure drops out
 * of the bell and every tapped enemy is struck once — harder for every
 * frequency the horn caught. Then it rings down, coils up and is gone.
 *
 * Every key below is a live editor control. The gameplay keys (`zoneRadius`,
 * `listenTime`, the damage and force keys, `hit*`) decide who is struck, when
 * and how hard; everything else is presentation, resolved every frame.
 */
export default {
  id: 'resonanceTheft',
  meta: {
    label: 'Resonance Theft',
    accent: '#ff7a9c',
    element: 'sound',
    cast: 'zone',
    hint: 'Sound — a coiled horn listens over the circle, steals every frequency in it, then plays them back as one blow',
    glyph:
      '<path d="M50 50m-6 0a6 6 0 1 0 12 0a12 12 0 1 0-24 0a20 20 0 1 0 40 0a28 28 0 1 0-56 0"/><path d="M14 88q10-14 20-2t20-2t20-2t14-2"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 18, // maximum cast distance (m)
    minRange: 1.5, // closer than this and the cast is refused (m)
    speed: 24, // the coiled shell flies to the circle at (m/s)
    cooldown: 6, // seconds before it can be cast again
    castAnim: 'cast3', // which clip in CAST_ANIMATIONS the body throws
    lifetime: 3.4, // nominal cast length, for the HUD (s)
    zoneRadius: 3.8, // the circle the horn listens to and plays back over (m)

    /* --- light --- */
    lightColor: '#ff8fae',
    lightIntensity: 5,
    lightRadius: 10,
    landLight: 3, // light punch as the horn unfurls (× explosion intensity)
    playLight: 8, // light punch at the playback (× explosion intensity)

    /* --- the theft (gameplay) --- */
    listenTime: 1.35, // the horn listens this long after it lands (s); the playback lands at its end
    scanInterval: 0.1, // seconds between scans for new enemies to tap
    maxTaps: 6, // enemies one horn can tap (≤ 6)
    stealAttacks: 1, // 1 = attacks other casts land in the circle while it listens are captured too
    maxStolen: 4, // foreign attacks one horn can capture (≤ 4)
    baseDamage: 1, // playback damage with one captured frequency
    damagePerFrequency: 0.5, // + this per extra captured frequency
    maxDamage: 4, // playback damage never exceeds this
    amplifyPerFrequency: 0.25, // knockback × (1 + this per extra captured frequency)
    maxAmplify: 2.5, // knockback multiplier ceiling
    hitImpulse: 7, // knockback with one captured frequency (× explosion intensity)
    hitLift: 4,
    hitSpin: 2.2,
    tapStatusTime: 1.8, // a tapped enemy is 'resonating' for this long (s, combat only)

    /* --- palette: the four-stop ramp (core → tint → body → deep) --- */
    colorCore: '#fff4ea', // white-hot core
    colorTint: '#ffb39a', // pale coral
    colorBody: '#e8326f', // saturated crimson-magenta
    colorDeep: '#26092f', // dark plum, grounds it on the floor

    /* --- timing (× settings.global.lifetime) --- */
    chargeTime: 0.32, // the shell winds itself together at the hand (s)
    unfurlTime: 0.32, // the horn unfurls over the circle (s)
    ringTime: 0.9, // ring-down after the playback (s)
    exitTime: 0.6, // the horn coils up and dissolves (s)

    /* --- 1 · the horn (hero, lit, solid) --- */
    hornScale: 1.35, // horn size (× zoneRadius)
    hornLift: 0.15, // extra height of the whole horn (m)
    shellSize: 0.55, // the coiled shell at the hand and in flight (m)
    arcHeight: 1.6, // the throw's arc height (m)
    spinRate: 0.35, // the horn turns at (rev/s) while it listens
    flightSpin: 2.5, // the shell turns at (rev/s) in flight
    hornMetalness: 0.75, // specular share of the lacquer
    hornGloss: 48, // specular tightness
    hornRim: 1.2, // fresnel rim light
    grooveGlow: 2.4, // brightness of a lit groove band
    grooveCount: 14, // bands round the tube from apex to bell
    rippleAmp: 0.035, // standing-wave swell of the tube (× tube radius)
    rippleFreq: 26, // waves along the tube
    rippleSpeed: 6, // how fast they run (toward the apex while listening)
    playbackKick: 0.18, // the horn jumps by this share at the playback
    dissolveEdge: 0.08, // width of the burning edge as it dissolves

    /* --- 2 · the taps (waveform tethers) --- */
    tapWidth: 0.2, // ribbon width (m)
    tapAmplitude: 0.3, // corkscrew radius at mid-span (m)
    tapWaves: 5, // turns of the corkscrew on the first tap (+1 per harmonic)
    tapFlow: 2.4, // packets per second running into the horn
    tapGlow: 3,
    tapSag: 0.6, // the tether arcs up by this share of its rise
    tapReach: 0.35, // seconds for a new tap to reach the horn
    chestHeight: 1.15, // where on a body the tap is taken (m)
    wakeWidth: 0.08, // the flight wake tether (m)

    /* --- 3 · the floor (spectrogram) --- */
    floorGlow: 1.4,
    floorStain: 0.55, // opacity of the dark plum stain
    grooveRings: 46, // record grooves across the circle
    spectrumBins: 56, // spectrum bars round the rim
    spectrumHeight: 0.28, // bar reach (× radius)
    floorWaveSpeed: 1.6, // playback interference rings run out at (× radius/s)
    floorDissolve: 0.85, // share of the exit spent dissolving

    /* --- 4 · the spectrum ring (instanced reeds) --- */
    reedCount: 40, // reeds round the rim (≤ 48)
    reedHeight: 0.9, // tallest reed (m)
    reedWidth: 0.2, // reed width (m)
    reedPump: 1, // how hard the reeds pump with the spectrum
    reedGlow: 1.8,
    reedLean: 0.35, // reeds lean in toward the horn while it listens (rad)

    /* --- 5 · the playback cone --- */
    coneLife: 0.5, // the pressure cone lasts (s)
    coneGlow: 2.6,
    coneRings: 7, // pressure rings running down it
    coneSpread: 1.05, // its foot spreads to (× radius)

    /* --- 6 · particles --- */
    ringRate: 10, // rings per second drawn up each tap
    ringSize: 0.32,
    ringLife: 0.5,
    moteRate: 40, // motes per second drawn in from the rim while listening
    moteSize: 0.07,
    moteLife: 0.8,
    moteSpeed: 2.2,
    sparkCount: 26, // sparks per struck enemy at the playback
    sparkSize: 0.07,
    sparkLife: 0.55,
    sparkSpeed: 7,
    playRingCount: 18, // rings thrown out of the bell at the playback
    gatherRate: 26, // rings per second converging on the hand during the charge
    particleGlow: 1.6,

    /* --- 7 · the beats --- */
    landShake: 0.08, // camera knock as the horn unfurls (× camera shake)
    playShake: 0.32, // camera knock at the playback
    shakeDecay: 6,
    shakeFrequency: 22,
    playFlash: 0.16, // screen flash at the playback (× explosion intensity)
    burstReach: 1.05, // AIR shell grows to (× radius)
    burstLife: 0.5,
    burstIntensity: 0.9,
    burstOpacity: 0.55,
    burstFresnel: 2.2,
    burstSquash: 0.45,
    decalLife: 2.2, // the RIPPLE ground ring lasts (s)
    shockwaveWidth: 0.07,
    shockwaveIntensity: 1.1,
    rippleIntensity: 0.5,

    /* --- 8 · the lens (distortion) --- */
    lensDraw: 0.7, // inward suck under the bell while listening (× global distortion)
    lensShock: 1.1, // pressure ring at the playback
  },
};
