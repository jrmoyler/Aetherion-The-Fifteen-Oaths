/**
 * Cinder Crown / Glacier Bell — settings blocks. Data only, no imports.
 *
 * Two zone casts that share one choreography engine (`index.js`) and differ
 * in every authored surface, shader, cadence and palette:
 *
 *  - **Cinder Crown** (fire) — a flame wedge lobbed low to the circle, where a
 *    coal heart and a split crown flare *twice*: once on landing and again at
 *    `secondPulse` through the impact phase. Each flare strikes everything in
 *    `zoneRadius`.
 *  - **Glacier Bell** (frost) — an ice needle lobbed high, where a bell rings
 *    out one expanding frost ring. The ring grows from 0 to `zoneRadius` over
 *    the impact phase and catches each enemy *once* as it passes.
 *
 * Gameplay keys (`zoneRadius`, `lifetime`, `impulse`, `lift`, `secondPulse`)
 * are the attack; everything else is presentation and is read every frame.
 */

/**
 * The settings both casts share. Element-specific values are merged over
 * this by `pulseSettings`.
 */
function pulseSettings(fire, accent) {
  return {
    /* --- the cast itself --- */
    range: 18, // maximum throw distance, metres
    minRange: 0,
    speed: 28, // how fast the delivery flies, metres/second
    cooldown: 6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4, // strike radius, metres
    lifetime: 1.4, // seconds of the impact phase (the crown's two flares / the bell's ring)
    fadeTime: 0.6, // seconds of the linger after it

    /* --- the attack (combat-bound; preserved exactly) --- */
    impulse: 6, // knockback away from the centre, m/s
    lift: 3, // upward kick, m/s
    ...(fire ? { secondPulse: 0.55 } : {}), // fraction of `lifetime` at which the crown flares again

    /* --- light --- */
    lightColor: accent,
    lightIntensity: 4,
    lightRadius: 8,
    pulseLight: 5, // light punch on each strike beat
    releaseLight: 2, // light punch when the effect lets go

    /* --- palette --- */
    accentColor: accent, // telegraph, spears, delivery trail
    coreColor: fire ? '#ffd06b' : '#cdf6ff', // crown/bell detail, contacts, fragments
    groundColor: fire ? '#ff6030' : '#8edcff', // scorch seal / frost rime

    /* ================================================================ */
    /* 1 · DELIVERY (travel)                                             */
    /* ================================================================ */
    deliveryScale: 1, // size of the flying wedge / needle
    deliveryArc: fire ? 0.6 : 1.4, // apex height of its lob is 4 × this × u(1 − u)
    deliveryGlow: 1.6,
    travelRate: 8, // trail bursts per second
    travelParticles: 3, // particles per trail burst
    trailSize: 0.07,
    trailLife: 0.55,
    trailSpeed: fire ? 1.5 : 0.6,
    colorTrailA: fire ? '#fff0a1' : '#ffffff',
    colorTrailB: fire ? '#ff7a24' : '#b2f5ff',
    colorTrailC: fire ? '#a52610' : '#438ec9',
    colorTrailD: fire ? '#321016' : '#173b70',

    /* ================================================================ */
    /* 2 · TELEGRAPH + SCULPTURE                                         */
    /* ================================================================ */
    telegraphOpacity: 0.3, // landing ring brightness during travel
    ringOpacity: 0.8, // strike ring brightness after impact
    ringGlow: 1.5,
    sculptureHeight: 1, // height of the ring of tongues / teeth
    sculptureGlow: 1,
    sculptureOpacity: 0.65,
    detailHeight: 1, // height of the authored crown plates / frost lattice
    detailGlow: 1, // spears + motes brightness

    /* ================================================================ */
    /* 3 · MONUMENT (coal heart / glacier bell)                          */
    /* ================================================================ */
    monumentScale: 1.5,
    monumentGlow: 1, // emissive drive of the solid
    monumentColor: fire ? '#3e160e' : '#477691',
    monumentEmissive: fire ? '#a93108' : '#183e65',
    shellGlow: 1.2, // fresnel shell brightness
    shellPower: fire ? 2.2 : 3, // fresnel falloff

    /* ================================================================ */
    /* 4 · STRIKE BEAT                                                   */
    /* ================================================================ */
    impactShake: 0.1, // camera knock per strike beat
    impactFlash: 0.08, // screen flash per strike beat
    burstShell: 1, // pressure shell size, × zoneRadius
    shockRadius: 1.2, // shockwave decal, × zoneRadius
    decalLife: fire ? 1.6 : 2.2, // scorch / frost decal life, seconds
    particleCount: 32, // burst particles per strike beat
    burstSize: 0.12,
    burstLife: 0.8,
    burstSpeed: fire ? 3 : 1.8,
    colorBurstA: fire ? '#fff2a6' : '#ffffff',
    colorBurstB: fire ? '#ff9b40' : '#a8efff',
    colorBurstC: fire ? '#bd2510' : '#3895c9',
    colorBurstD: fire ? '#341018' : '#203a80',
    fragmentScale: 1, // flying splinters / shards
    fragmentGlow: 1,
    contactScale: 1, // starlet / spike crown at each struck body
    contactLife: fire ? 0.34 : 0.62, // seconds each contact cue lives (fire burns off fast, frost settles)

    /* ================================================================ */
    /* 5 · GROUND SEAL                                                   */
    /* ================================================================ */
    groundGlow: 1,
    groundOpacity: 0.65,

    /* ================================================================ */
    /* 6 · RESONANCE                                                     */
    /* ================================================================ */
    resonanceScale: 1, // ember crown / bell striker
    resonanceMotion: 1, // how far it swings or flexes

    /* ================================================================ */
    /* 7 · AMBIENT + RELEASE                                             */
    /* ================================================================ */
    ambientRate: fire ? 34 : 22, // embers / frost motes per second while it stands
    ambientSize: fire ? 0.08 : 0.06,
    ambientLife: fire ? 1.1 : 1.5,
    ambientRise: fire ? 1.8 : 0.5, // metres/second they climb
    colorAmbientA: fire ? '#fff3b0' : '#ffffff',
    colorAmbientB: fire ? '#ffa341' : '#d6f8ff',
    colorAmbientC: fire ? '#c3381a' : '#7cc6ea',
    colorAmbientD: fire ? '#2a0c0c' : '#1d3d66',
    releaseParticles: 24, // smoke / frost burst when it lets go
    releaseSize: fire ? 0.22 : 0.1,
    releaseLife: fire ? 1.3 : 0.8,
    releaseSpeed: fire ? 0.8 : 1.6,
    colorReleaseA: fire ? '#ffb867' : '#ffffff',
    colorReleaseB: fire ? '#ac4d26' : '#d0f7ff',
    colorReleaseC: fire ? '#4c2b31' : '#76c3e7',
    colorReleaseD: fire ? '#1b171d' : '#315575',

    /* ================================================================ */
    /* 8 · DISTORTION                                                    */
    /* ================================================================ */
    warpStrength: fire ? 0.6 : 0.35, // heat shimmer / cold refraction
    warpPulse: 1.2, // extra warp on each strike beat
    warpHeight: fire ? 3 : 0.6, // metres: fire's column height / frost's floor-band width
    warpScale: 2.2,
    warpSpeed: fire ? 1.6 : 0.6,
  };
}

function pulseConfig(id, label, element, accent, hint, glyph) {
  return {
    id,
    meta: { label, element, accent, hint, glyph, cast: 'zone', key: '' },
    settings: pulseSettings(element === 'fire', accent),
  };
}

export const CINDER_CONFIG = pulseConfig(
  'cinder-crown',
  'Cinder Crown',
  'fire',
  '#ff8d43',
  'A crown flares twice, pushing enemies from the impact.',
  '<path d="M12 75L21 29L38 52L50 17L62 52L79 29L88 75Z"/>',
);

export const GLACIER_CONFIG = pulseConfig(
  'glacier-bell',
  'Glacier Bell',
  'frost',
  '#9ceaff',
  'An expanding frost ring catches each enemy once as it passes.',
  '<path d="M12 65Q50 5 88 65M17 65H83M50 20V80M33 47L67 67M67 47L33 67"/>',
);

/*
 * Glacier Bell only: the bell body, its glacier of spikes and the deep ice
 * floor (`GlacierBellBody.js`), plus the shared defaults it re-tunes. None of
 * these touch the strike: `zoneRadius` and `lifetime` still set where and
 * when the frost ring hits; `fadeTime` is the linger after the last hit.
 */
Object.assign(GLACIER_CONFIG.settings, {
  fadeTime: 1.2, // seconds the bell hangs, rimes over and dissolves after the ring has run
  sculptureOpacity: 0.22, // the pale teeth sit under the solid glacier now
  groundOpacity: 0.32, // the rime seal rides on the deep ice floor
  monumentScale: 0.95, // the small bell hangs under the big one as its clapper
  burstShell: 0.35, // a small frost shell: the bell is the impact form, not a white dome
  bellRadius: 0.45, // lip radius, × zoneRadius

  /* ================================================================ */
  /* 3b · THE BELL (zone-scale ice body)                               */
  /* ================================================================ */
  bellHeight: 1.75, // lip-to-crown height, × lip radius
  bellHang: 0.55, // metres between the floor and the lip while it hangs
  bellDrop: 3.5, // metres above its hang it falls from on the landing frame
  bellDropTime: 0.14, // seconds the fall takes
  bellSwing: 0.2, // radians of the first swing
  bellSwingRate: 1.3, // swings per second
  bellSwingDecay: 0.85, // how fast the swing dies away, 1/seconds
  bellQuiver: 0.045, // lip vibration, fraction of its radius
  bellRingBand: 1.3, // brightness of the band of light that runs up it each swing
  bellRimeCrawl: 0.55, // how far rime climbs it over the linger (1 = to the crown)
  bellDissolveStart: 0.6, // the bell starts dissolving once the exit fade drops below this
  bellFacet: 1, // how much each cut face differs in depth
  bellCrackGlow: 0.8, // inner fracture veins
  bellSpecular: 2.4, // sun glints on the facets (HDR)

  /* --- the four-stop ice ramp (bell, spikes, deep floor) --- */
  iceCore: '#f4feff', // white-hot glints and the dissolve edge
  iceTint: '#8fdcff', // pale rim, facet edges, ring band
  iceBody: '#1d63a6', // sun-lit faces
  iceDeep: '#04122b', // faces looking into the ice
  rimeColor: '#8fbcdc', // matte frost crawling up it

  /* --- the glacier: spikes breaking the floor as the front reaches them --- */
  spikeCount: 26, // ice spikes in the zone (capped at 32)
  spikeHeight: 1.5, // metres, before variation
  spikeWidth: 0.22, // base radius, metres
  spikeLean: 0.42, // radians leaning out from the centre
  spikeInner: 0.5, // innermost spike radius, × zoneRadius (just outside the bell)
  spikeGrowTime: 0.16, // seconds a spike takes to break the floor
  spikeCreep: 0.18, // fraction they keep growing through the linger
  spikeSink: 1, // how far they sink on the exit, × spikeHeight

  /* --- the deep ice floor under the rime --- */
  floorOpacity: 0.9,
  floorCracks: 1, // fracture plate borders
  floorRime: 0.35, // drifted rime over the dark ice
});
