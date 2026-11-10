/**
 * Heliostat Verdict — Light — a lens skims out to the circle, a heliostat of
 * twelve mirror panels opens over the nearest enemy it can actually *see*,
 * gathers the sun into a narrowing cone while an iris closes round its hub,
 * and passes judgement with one focused ray.
 *
 * Matrix Expansion data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 *
 * Gameplay keys (`zoneRadius`, `lockTime`, `damage`, `hit*`, `beamDuration`,
 * `releaseDuration`, `lifetime`, `fade`) drive the combat binding and are read
 * on the frame they matter. Every presentation key below is resolved per frame
 * by `HeliostatVerdictAbility`, so dragging any of it re-shapes a heliostat
 * that is already charging.
 */
export default {
  id: 'exp-heliostat-verdict',
  uid: 'matrix-expansion/heliostat-verdict',
  meta: {
    label: 'Heliostat Verdict',
    element: 'light',
    accent: '#ffe0a0',
    cast: 'zone',
    key: '',
    hint: 'A rotating heliostat locks onto a visible enemy and fires a focused ray.',
    glyph: '<circle cx="50" cy="42" r="22"/><path d="M50 8V20M50 64V78M16 42H28M72 42H84M30 22L38 30M62 54L70 62M30 62L38 54M62 30L70 22M50 42L76 82"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 30, // metres/second the travelling lens skims to the circle
    cooldown: 6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4, // metres: the heliostat only judges enemies inside this circle
    lifetime: 2.2, // seconds the heliostat may stand (× global lifetime)
    fade: 1, // seconds of graceful exit after the lifetime (× global lifetime)

    /* --- the verdict (combat) --- */
    lockTime: 0.7, // seconds of charge between the lock and the ray
    damage: 1, // damage carried by the single committed light hit
    hitImpulse: 5, // knock-back of the ray, m/s (× global explosion intensity)
    hitLift: 3, // upward kick of the ray, m/s (× global explosion intensity)
    hitSpin: 1, // tumble the ray imparts

    /* --- light (rides the lens, then the locked target) --- */
    lightColor: '#fff1c1',
    lightIntensity: 9,
    lightRadius: 12,
    impactLight: 1.6, // extra punch on the ray, × lightIntensity

    /* --- palette --- */
    rayColor: '#ffe58b', // the sunlight itself: mirrors, cone, ray body
    coreColor: '#ffffff', // white-hot cores, edges and the contact flash
    skyColor: '#9cc4ff', // what the mirrors reflect when they tilt to the sky
    scorchColor: '#5a3410', // the glassed burn the ray leaves on the floor

    /* ================================================================ */
    /* 1 · THE LENS — skims from the hand to the circle                  */
    /* ================================================================ */
    travelScale: 1, // overall size of the travelling lens
    travelHeight: 1, // metres off the floor it skims at
    travelSpin: 3, // radians/second the lens rolls about its heading

    /* ================================================================ */
    /* 2 · THE HELIOSTAT — twelve concave mirror panels on a hub         */
    /* ================================================================ */
    mirrorHeight: 3.6, // metres above the target the dish hangs
    mirrorScale: 1.8, // dish size (1 = 2.6 m across)
    mirrorSpin: 1.2, // radians/second the dish turns about its axis
    mirrorWobble: 0.12, // radians the dish rocks while it tracks the sun
    mirrorGlow: 1.3, // emissive strength of the panels
    mirrorFresnel: 2.4, // power of the reflective rim
    mirrorShimmer: 0.6, // strength of the caustic shimmer across the glass
    openTime: 0.35, // seconds the dish takes to unfold on arrival

    /* --- orbiting lens facets --- */
    facetRadius: 2.3, // metres from the axis the facets orbit
    facetOrbit: 0.4, // radians/second, alternate facets counter-rotate
    facetScale: 1.1, // facet size before the charge swells them
    facetGlow: 1.2,

    /* --- the iris round the hub --- */
    irisScale: 1.6, // blade size
    irisRadius: 0.7, // metres the blades stand from the hub when open
    irisClose: 0.35, // metres the blades sweep outward as the charge builds
    irisSpin: 0.35, // radians/second the iris turns

    /* ================================================================ */
    /* 3 · THE GATHER — the focus spot and the cone of light             */
    /* ================================================================ */
    focusRadius: 2.6, // metres: the sun-dial disc under the target
    focusTighten: 0.75, // how far the bright spot narrows by the end of the charge
    focusGlow: 0.9,
    coneGlow: 0.8, // the fluted cone from the dish down to the spot
    coneBands: 12, // light flutes round the cone (one per mirror reads best)
    chargeRumble: 0.05, // camera rumble as the charge peaks

    /* ================================================================ */
    /* 4 · THE RAY                                                       */
    /* ================================================================ */
    beamDuration: 0.6, // seconds the committed ray stays lit
    releaseDuration: 0.45, // seconds the heliostat takes to fold away after
    beamWidth: 2.6, // ray ribbons and core column, × authored width
    beamGlow: 2.2, // emissive strength of the ray (bloom picks up > 1)

    /* --- heat shimmer round the ray (distortion layer) --- */
    warpStrength: 0.7,
    warpWidth: 2.4, // metres
    warpScale: 2.2, // noise frequency
    warpSpeed: 2.4, // how fast the shimmer rises

    /* ================================================================ */
    /* 5 · THE CONTACT                                                   */
    /* ================================================================ */
    impactScale: 1.8, // aperture halo and shard spread
    impactFxDuration: 0.8, // seconds the aperture and shards live
    impactGlow: 0.8, // brightness of the burst, shockwave and halo
    impactShake: 0.28, // camera knock (× global camera shake)
    impactFlash: 0.32, // screen flash (× global explosion intensity)
    scorchRadius: 1.6, // metres: the glassed burn mark
    scorchLife: 2.6, // seconds the burn takes to cool

    /* ================================================================ */
    /* 6 · PARTICLES                                                     */
    /* ================================================================ */
    particleRate: 25, // ambient motes round the locked target, per second
    particleSize: 0.1,
    glintRate: 42, // glints shed off the mirrors and the travelling lens, per second
    glintSize: 0.09,
    glintLife: 0.6, // seconds
    glintSpeed: 1.6, // metres/second
    sparkCount: 48, // white-hot sparks thrown by the ray's contact
    sparkSpeed: 4.5,
    sparkSize: 0.05,
    colorGlintA: '#ffffff',
    colorGlintB: '#fff1bd',
    colorGlintC: '#ffcf72',
    colorGlintD: '#a76d24',

    /* ================================================================ */
    /* 7 · THE HELIOSTAT FIELD — mirror pylons round the circle          */
    /* ================================================================ */
    pylonCount: 8, // bronze pylons that rise round the circle (max 12)
    pylonRing: 0.92, // × zoneRadius: where they stand
    pylonPhase: 0.39, // radians: bearing of the first pylon
    postHeight: 2.6, // metres from the floor to the panel's trunnion
    postWidth: 1, // girth of the lathed post
    panelScale: 1.1, // mirror panel size (1 = 1.8 × 1.2 m)
    riseTime: 0.35, // seconds a pylon takes to shoulder out of the floor
    riseStagger: 0.035, // seconds between one pylon and the next
    sinkDepth: 1.4, // metres below the floor they rise from and sink back to
    fieldFocusHeight: 3.2, // metres: where the panels gather light with no target
    sweepRadius: 0.5, // × ring: the sun's circle after the ray, which the panels follow
    sweepSpeed: 0.9, // radians/second that sun crosses the court
    bronzeColor: '#3a2410', // cast bronze of posts, frames and yokes
    bronzeMetal: 0.85,
    bronzeRough: 0.42,
    bronzeHeat: 0.08, // how warm the bronze glows as the charge builds
    glassColor: '#dfe8ff', // mirror glass albedo
    glassGlow: 0.6, // sunlight held in the glass, scaled by the gather
    glassRough: 0.08,
    glassPunch: 2.5, // flash in every panel on the ray
    shaftWidth: 1, // reflected shafts, × panel width
    shaftGlow: 1.3,
    shaftFlow: 2.5, // how fast light runs up the shafts
    shaftLinger: 0.3, // shaft strength while the panels follow the sun afterwards
    shaftMiss: 0.35, // shaft strength when there is nobody to judge

    /* ================================================================ */
    /* 8 · THE SUN-COURT — the floor dial                                */
    /* ================================================================ */
    courtScale: 1.05, // × zoneRadius
    courtOpacity: 0.85,
    courtGlow: 1.3,
    courtLines: 1, // hour lines and seams
    courtDrawTime: 0.4, // seconds the dial takes to draw in from the centre
    courtNoise: 1, // bronze flag scale
    courtScorchRadius: 2.2, // metres of floor the ray glasses
    handSpeed: 0.9, // radians/second the gnomon's hand sweeps
    courtTintColor: '#fff1bd', // pale tint (ramp B)
    courtBodyColor: '#e0a040', // gold body (ramp C)
    courtDeepColor: '#1c0f05' // deep bronze (ramp D)
  }
};
