/**
 * Vector Breakwater — settings block. Data only, no imports.
 *
 * A line cast: three curved shield fronts launched `spacing` seconds apart
 * sweep the corridor. Each front strikes every enemy it passes once, so a
 * body in the lane takes three consecutive impacts. When a front reaches the
 * end of the line it breaks like a wave on a sea wall — a wake ring, fins
 * peeling away — and the last one leaves the corridor scoured.
 *
 * Gameplay keys (`speed`, `width`, `spacing`, `impulse`, `lift`, `spin`) are
 * the attack; everything else is presentation. Every value is a live editor
 * slider read every frame.
 */
export default {
  id: 'vectorBreakwater',
  meta: {
    label: 'Vector Breakwater',
    accent: '#ffd1a3',
    element: 'force',
    cast: 'line',
    hint: 'Force — three shield fronts sweep the lane in succession; anything in it takes three consecutive impacts',
    glyph: '<path d="M15 15L45 50L15 85M38 15L68 50L38 85M60 15L90 50L60 85"/>',
  },
  settings: {
    /* --- the cast itself --- */
    aimStyle: 'wide', // aim reticle: a single wide swept front
    range: 20, // maximum cast distance, metres
    minRange: 1, // closer than this and the cast is refused
    speed: 15, // how fast each front travels, metres/second
    cooldown: 4, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    lifetime: 2.5, // shared-contract lifetime; fronts are timed by speed + spacing

    /* --- the attack (combat-bound; preserved exactly) --- */
    width: 2.2, // half-width of the swept corridor, metres
    spacing: 0.22, // seconds between consecutive fronts
    impulse: 13, // knockback along the lane, m/s
    lift: 4, // upward kick, m/s
    spin: 2, // tumble on a knockdown

    /* --- light --- */
    lightColor: '#ff9a4a',
    lightIntensity: 5,
    lightRadius: 9,

    /* ================================================================ */
    /* 1 · BRACE (anticipation at the caster)                           */
    /* ================================================================ */
    braceSize: 1.2, // span of the chevron brace at the caster's feet, metres
    braceGlow: 2.5, // how hot a chevron flares as its front launches
    braceTime: 0.35, // seconds a chevron takes to cool after launch
    launchShake: 0.04, // camera knock as each front leaves
    launchLight: 2, // light punch as each front leaves

    /* ================================================================ */
    /* 2 · SHIELD FRONTS                                                */
    /* ================================================================ */
    // The four-stop ramp: core → pale (edge) → saturated (body) → deep.
    coreColor: '#fff3df', // white-hot: the crest line and burning edges only
    edgeColor: '#ffc27a', // pale amber rims and sides
    bodyColor: '#e2571c', // saturated orange pressure cells
    deepColor: '#2b0d06', // dark umber that carries the sheet and the scour
    frontDensity: 0.62, // base opacity of the dark body: how solid the wall reads
    frontClear: 1.6, // the sheet rises out of the floor over this many metres past the brace
    frontHeight: 1.8, // metres
    frontGlow: 1.0, // brightness of the ramp on the shield
    frontOpacity: 1, // multiplier on the shield's alpha
    frontNoise: 0.6, // weight of the pressure cells in the body
    frontNoiseScale: 3, // pressure cells per metre-ish
    shimmerSpeed: 7, // how fast the slash lines run across it
    frontRim: 0.8, // weight of the leading rim
    spentFade: 0.15, // fraction of the line over which a front tears apart at the end
    ribGlow: 1.4, // brightness of the internal splines
    ribOpacity: 0.7,

    /* --- pressure fins behind each front --- */
    finSize: 0.22, // fin scale, metres
    finSpread: 0.9, // how far fins are flung sideways as a front breaks
    finGlow: 1.6,

    /* ================================================================ */
    /* 3 · GROUND SCOUR                                                 */
    /* ================================================================ */
    groundColor: '#e2571c', // saturated seams in the scour
    groundOpacity: 1, // multiplier on the corridor scour
    groundGlow: 1.0,
    groundDeep: 1, // weight of the dark scorched base
    groundSeams: 1, // weight of the pressure seams
    coolTime: 0.9, // seconds the seams take to cool after the last break
    aftershock: 0.8, // aftershock ripples rolling down the scour
    aftershockSpeed: 3.5, // metres/second
    lingerTime: 1.4, // presentation-only linger after the last break (s)
    scourWidth: 0.45, // how far behind a front the fresh scour reaches, metres × width
    dustRate: 40, // grit streaks per second kicked off each front's foot
    dustSize: 0.09,
    dustLife: 0.6,
    dustColor: '#9a5a36', // grit tint; also the break's dust-ring decal

    /* ================================================================ */
    /* 4 · SPRAY + CONTACT                                              */
    /* ================================================================ */
    sprayCount: 20, // streaks thrown off a front every `sprayEvery` metres
    sprayEvery: 2, // metres between spray bursts along the lane
    spraySize: 0.07,
    sprayLife: 0.5,
    spraySpeed: 4,
    particleGravity: -4, // gravity on the shared streak system, m/s²
    particleDrag: 1.1, // drag on the shared streak system
    // The one pooled streak system's lifetime gradient; spray, grit and
    // shards are all tinted over it.
    colorSprayA: '#fff3df',
    colorSprayB: '#ffb062',
    colorSprayC: '#d9501a',
    colorSprayD: '#2b0d06',
    contactSize: 1, // pressure-petal size at a struck target
    contactLife: 0.4, // seconds a contact petal lives
    chipCount: 12, // shards off a struck target
    chipSize: 0.09,
    chipLife: 0.38,
    chipSpeed: 3,
    chipColor: '#ff9a4a', // shard tint
    contactLight: 1.5, // light punch on a confirmed contact

    /* ================================================================ */
    /* 5 · BREAK (arrival at the end of the line)                       */
    /* ================================================================ */
    wakeTime: 0.8, // seconds a wake ring lives after a front breaks
    wakeGrowth: 1.15, // how far a wake spreads, × width
    wakeOpacity: 0.65,
    impactShake: 0.12, // camera knock when the first front breaks
    impactFlash: 0.08, // screen flash when the first front breaks
    arrivalShake: 0.05, // smaller knock for the following fronts
    arrivalLight: 3, // light punch per break
    shockRadius: 3, // shockwave decal on each break, metres
    burstSize: 2.2, // pressure shell on the first break, metres
    burstOpacity: 0.4, // its opacity

    /* ================================================================ */
    /* 6 · DISTORTION                                                   */
    /* ================================================================ */
    warpStrength: 0.5, // refraction riding each front
    warpHeight: 2.2, // metres
    warpScale: 2.5, // noise scale
    warpSpeed: 2, // noise speed
  },
};
