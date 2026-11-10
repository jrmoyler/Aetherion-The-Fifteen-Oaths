/**
 * Adaptive Fabricator — settings block. Data only, no imports.
 *
 * A zone cast that throws a fabrication seed to the circle, assembles a
 * hexagonal sentry there and lets it scan. Every `shotInterval` the sentry
 * reads the nearest visible enemy's statuses through the combat bridge and
 * answers with the element that counters them (wet → storm, burning → frost,
 * chilled/frozen → fire, otherwise neutral tech). Every number below is a live
 * editor slider and is read every frame, so dragging one mid-deploy reshapes
 * the sentry while it stands.
 *
 * Gameplay keys (`life`, `zoneRadius`, `shotInterval`, `damage`, `hit*`) are
 * the attack; everything else is presentation.
 */
export default {
  id: 'adaptiveFabricator',
  meta: {
    label: 'Adaptive Fabricator',
    accent: '#7ff0ff',
    element: 'tech',
    cast: 'zone',
    hint: 'Tech — deploy a sentry that reads enemy exposure and fires the counter-element; with combat off, it fires neutral tech',
    glyph:
      '<path d="M50 10L84 30V70L50 90L16 70V30Z"/><circle cx="50" cy="50" r="19"/><path d="M50 25V12M50 88V75M25 50H12M88 50H75"/>',
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum throw distance, metres
    minRange: 1, // closer than this and the cast is refused
    speed: 18, // how fast the fabrication seed flies, metres/second — slow enough that the lob reads
    cooldown: 8, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 6, // scan radius around the sentry, metres
    lifetime: 6, // shared-contract lifetime; the deploy itself is timed by `life`
    life: 6, // seconds the sentry stands and fires
    fadeTime: 0.7, // seconds it takes to un-fabricate once `life` is spent

    /* --- the attack (combat-bound; preserved exactly) --- */
    shotInterval: 0.9, // seconds between attributed shots
    damage: 0.35, // damage per shot submitted to the combat bridge
    hitImpulse: 5, // knockback along turret → target, m/s
    hitLift: 2.5, // upward kick on a knockdown, m/s
    hitSpin: 1, // tumble on a knockdown

    /* --- light --- */
    lightColor: '#7ff0ff',
    lightIntensity: 5,
    lightRadius: 9,
    lightHeight: 2.4, // metres above the floor the deploy light sits
    shotLight: 1.5, // light punch per shot
    deployLight: 6, // light punch when the sentry lands

    /* ================================================================ */
    /* 1 · FABRICATION SEED (travel)                                     */
    /* ================================================================ */
    seedSize: 0.5, // half-height of the faceted seed, metres
    seedSpin: 9, // radians/second it tumbles in flight
    seedArc: 2.6, // apex of its flight arc, metres
    seedGlow: 2.6, // emissive strength of the seed shell
    trailRate: 190, // trail streaks per second
    trailSize: 0.13,
    trailLife: 0.5,
    trailSpeed: 1.2,
    trailColor: '#a5efff', // tint over the shared streak gradient

    /* ================================================================ */
    /* 2 · SCAN FLOOR                                                    */
    /* ================================================================ */
    telegraphOpacity: 0.35, // how bright the landing circle is during travel
    floorOpacity: 0.75, // multiplier on the deployed scan disc
    floorGlow: 0.85, // emissive strength of the disc — kept low: the sentry is the read, not the decal
    floorColor: '#1c8fd0', // the scan field's body tone (saturated, not the pale core)
    gridScale: 3.2, // hex cells per metre-ish across the disc
    gridOpacity: 0.14, // weight of the hex grid
    spokes: 6, // radial spokes (one per emitter vane)
    sweepSpeed: 1.8, // radians/second the radar sweep turns
    ringSpeed: 3, // how fast the concentric pulses run outward
    floorNoise: 0.5, // noise breakup of the disc
    /* the pad: a normal-blended deep-tone footing under the sentry — the
       floor it was fabricated on, darkened, with heat seams that stay */
    deepColor: '#04121c', // the deep stop of the ramp
    padReach: 0.55, // pad radius (× scan radius)
    padDarkness: 0.85, // how dark the pad is
    padSeams: 1, // plate seams across the pad (× hex grid)
    padSeamGlow: 1.6, // heat glow in the seams on deploy and each shot
    padScorch: 0.6, // the scan disc darkens by this much past the pad

    /* ================================================================ */
    /* 3 · THE SENTRY (housing)                                          */
    /* ================================================================ */
    housingScale: 1.9, // overall scale of the sentry (1 = 2.25 m to the emitter tips)
    buildTime: 0.55, // seconds from the seed landing to fully assembled
    buildEdge: 0.09, // height of the glowing fabrication edge (× sentry)
    buildNoise: 0.18, // raggedness of that edge
    buildGlow: 3, // how hot the edge burns
    metalColor: '#454a52', // housing plate colour — neutral gunmetal; the cyan lives in the energy, not the steel
    trimColor: '#2a8fd0', // panel seams and rim light (saturated body stop, used sparingly)
    panelScale: 3.2, // panel seams per metre
    panelGlow: 0.14, // how bright the seams glow
    rimPower: 2.5, // fresnel falloff on the housing
    rimStrength: 0.1, // fresnel weight on the housing
    shine: 1.5, // specular strength
    grime: 0.45, // fbm grime darkening the plates

    /* --- the head --- */
    headSpin: 0.6, // radians/second the head turns while scanning
    vaneSway: 0.12, // how far the emitter vanes breathe while scanning
    vaneSpeed: 1.8, // vane breathing rate
    recoilTime: 0.18, // seconds a shot's kick takes to settle
    recoilDepth: 0.1, // how far the head drops on a shot, metres
    coreColor: '#7ff0ff', // the energy core and emitter tips
    coreGlow: 1.6, // core brightness at rest
    coreFlare: 1.5, // extra core brightness on a shot
    haloSpin: 1.4, // radians/second the segmented halo turns
    haloOpacity: 0.8,
    unfoldTime: 0.4, // seconds the vanes take to unfold once the cut has passed them
    unfoldFold: 1.25, // how far folded the vanes start (rad)
    shadows: 1, // 1 = the housing casts shadows on the floor, 0 = none

    /* ================================================================ */
    /* 4 · THE SHOT                                                      */
    /* ================================================================ */
    beamColor: '#d6ffff', // neutral (tech) beam colour
    stormColor: '#c4b7ff', // beam colour when countering a wet target
    frostColor: '#b9f2ff', // … a burning target
    fireColor: '#ffb05c', // … a chilled or frozen target
    beamTime: 0.45, // seconds the beam stays drawn
    beamWidth: 0.26, // beam half-width, metres
    beamArc: 1.6, // the bolt bows up this far at its apex, metres — it arcs over the head, never hidden behind the mast
    beamSwing: 2.2, // … and swings out to one side this far, metres: a body packed against the plinth sits almost under the emitters, so only a sideways bow reads as a trajectory
    beamThrow: 0.6, // … and bows outward (away from the mast) this far, metres
    beamAlternate: 1, // 1 = the swing alternates side every shot, 0 = always the same side
    beamGlow: 3, // beam brightness (white only in the core; edges fall to the deep tone)
    beamNoise: 1, // noise flowing down the beam
    lockColor: '#ff4a2e', // the lock-on sight drawn before each shot (a warm read against the cyan)
    lockTime: 0.4, // seconds the sight is drawn before a shot (≤ 0.8 × shotInterval)
    lockWidth: 0.035, // sight half-width, metres
    lockArc: 1.6, // the sight traces the same arc the bolt will take, metres
    lockOpacity: 0.8, // sight brightness
    impactRadius: 1.4, // arrival ring size at the struck target, metres
    impactDuration: 0.45, // seconds the arrival rings live
    impactShake: 0.12, // camera knock per shot
    impactFlash: 0.08, // screen flash per shot
    sparkCount: 34, // sparks thrown off the struck target
    sparkSize: 0.06,
    sparkLife: 0.35,
    sparkSpeed: 5,
    particleGravity: -3, // gravity on the shared streak system, m/s²
    particleDrag: 1.2, // drag on the shared streak system
    // The one pooled streak system's lifetime gradient. Every particle layer
    // (trail, sparks, landing debris, motes) is tinted over it.
    colorSparkA: '#ffffff',
    colorSparkB: '#a5efff',
    colorSparkC: '#3ab5ec',
    colorSparkD: '#164673',
    hitDecalRadius: 0.9, // scorch-arc decal under the struck target
    hitDecalLife: 0.6,
    muzzleSize: 0.6, // flash shell at the emitter on each shot, metres
    muzzleLife: 0.12,
    muzzleHeight: 0.8, // the bolt leaves from the emitter tips: metres above the head (× housingScale)
    muzzleReach: 1.0, // … and this far out on the side facing the target (× housingScale)
    shotBurst: 1.3, // ionised shell at the struck body, metres
    shotBurstLife: 0.3,
    scorchRadius: 0.85, // scorch left under each struck body, metres (stays)
    scorchLife: 4,

    /* ================================================================ */
    /* 5 · DEPLOY BEAT                                                   */
    /* ================================================================ */
    deployShake: 0.2, // camera knock when the seed lands
    deployFlash: 0.12, // screen flash when the seed lands
    shockRadius: 3.2, // landing shockwave, metres
    debrisCount: 26, // fabrication debris thrown up on landing
    debrisSize: 0.12,
    debrisLife: 0.8,
    debrisSpeed: 4,
    debrisColor: '#9fb6c4', // debris tint; also the dust-ring decal

    /* ================================================================ */
    /* 6 · AMBIENT MOTES                                                 */
    /* ================================================================ */
    moteRate: 14, // data motes per second rising from the scan field
    moteSize: 0.05,
    moteLife: 1.3,
    moteRise: 0.9, // metres/second they climb
    moteColor: '#7ff0ff', // mote tint

    /* ================================================================ */
    /* 7 · DISTORTION                                                    */
    /* ================================================================ */
    warpStrength: 0.35, // heat shimmer above the emitters
    warpShot: 1.2, // extra shimmer on each shot
    warpWidth: 1.6, // metres
    warpHeight: 2.4, // metres
    warpScale: 2.2, // noise scale
    warpSpeed: 1.4, // noise speed
  },
};
