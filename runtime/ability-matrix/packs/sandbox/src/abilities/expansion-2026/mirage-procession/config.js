/**
 * Mirage Procession — illusion, line cast. Data only, no imports.
 *
 * Three identical masks process down three parallel lanes; only one of them
 * (`trueLane`) carries a hit volume. Everything the player can *see* — masks,
 * veils, wakes, shards, glitter, particles, decals — is emitted identically in
 * all three lanes, so the presentation can never give the real lane away.
 * `laneGap` and `hitWidth` are shared with the aim reticle (`ExpansionAim`
 * draws the three lanes from them) and are gameplay numbers.
 *
 * Every key below is a live editor control. Gameplay keys keep their original
 * names and defaults; the rest are the craft layer.
 */
export default {
  id: 'mirageProcession',
  meta: {
    label: 'Mirage Procession',
    accent: '#ff9ad8',
    element: 'illusion',
    cast: 'line',
    hint: 'Illusion — three masks process down three lanes; only the chosen lane strikes',
    glyph:
      '<path d="M18 25Q50 5 82 25L75 66L50 85L25 66Z M29 42L43 39 M57 39L71 42"/>',
  },
  settings: {
    /* --- the cast --- */
    aimStyle: 'lanes', // reticle style read by ExpansionAim
    range: 20,
    minRange: 1,
    speed: 12, // the procession advances at (m/s)
    cooldown: 4,
    castAnim: 'cast1',
    lifetime: 2, // nominal cast length, for the HUD

    /* --- the feint (gameplay) --- */
    laneGap: 1.8, // distance between lanes (m)
    trueLane: 0, // -1 left, 0 centre, 1 right — the only lane that strikes
    hitWidth: 0.7, // half-width of the true lane's sweep (m)
    impulse: 12,
    lift: 5,
    spin: 2,

    /* --- light --- */
    lightColor: '#d8a8cc', // a dusky tint: the faces stay dark lacquer, magenta lives in eyes and gilding
    lightIntensity: 2.5,
    lightRadius: 9,
    finaleLight: 3, // light punch when the masks shatter (× explosion intensity)
    contactLight: 4, // light punch on a committed hit

    /* --- palette: one four-stop ramp on the illusion hue ---
     * core (white-hot, only in scan bands / burn edges / glints)
     *  → pale tint (rims, engraving) → saturated body (lit lacquer)
     *  → dark deep (the lacquer in shadow, the pools, the lane haze).
     * The deep stop carries the body so the masks sit on the dark floor. */
    coreColor: '#fff4fb', // white-hot core
    edgeColor: '#ffb3e6', // pale tint: rims, engraving, shards
    maskColor: '#cf2a92', // saturated body of the lacquer
    deepColor: '#24062f', // dark deep: shadowed lacquer, pools, lane haze
    trailColor: '#7a2fc4', // wakes and veils (saturated violet)

    /* --- 1 · the masks --- */
    maskSize: 1.55, // mask scale — a body-height carved face (≈1.5 × 2.2 m) that reads at 8 m
    maskHeight: 1.45, // floats at (m)
    maskBob: 0.14, // bob height (m)
    maskSway: 0.16, // sway (rad)
    appearTime: 0.25, // fades in over (s)
    maskGlow: 1.0, // lacquer brightness (multiplies the whole ramp)
    maskShade: 1.0, // how much the key light models the lacquer (0 flat, 1 full)
    maskSpecular: 0.8, // white-hot glint off the lacquer
    maskDeep: 0.0, // pushes the lacquer toward the deep stop (ramp units)
    maskHold: 0.55, // fraction of the linger the fallen masks hold before they burn away
    maskRear: 0.35, // the masks rear up before they fall (m)
    /* the carved face: dark lit lacquer; magenta lives only in the eyes and the gilding */
    maskLacquer: '#181116', // lacquer albedo (lit by the scene sun; dark plum-black)
    maskRoughness: 0.55, // lacquer roughness
    maskMetalness: 0.12, // lacquer metalness
    maskClearcoat: 0.5, // the varnish coat over the lacquer (sharp sun glints)
    maskKeyFill: 0.8, // camera-side key that models brow, nose and cheekbones on the night stage
    maskRimLight: 0.35, // pale grazing rim that cuts the silhouette off the floor
    maskTurn: 0.32, // outer masks turned three-quarter toward the centre (rad)
    gildWidth: 0.045, // gilded border round the face (local units, × size)
    gildGlow: 1.1, // emissive magenta in the gilding
    gildMetal: 0.85, // metalness of the gilded border
    eyeGlow: 3.2, // magenta fire in the eye holes (HDR at the inner rim)
    eyeSpread: 0.018, // how far the eye glow bleeds onto the socket (local units)
    mouthGlow: 1.0, // ember in the mouth slit
    maskRestHeight: 0.5, // fallen mask's centre rests at (m, × size)
    fallTilt: 0.6, // the fallen mask leans back this far (rad; π/2 lies flat)
    maskSink: 0.22, // fallen mask sinks into its pool over the linger (m, × size)
    maskLieSpin: 0.7, // fallen mask turns in its pool over the linger (rad)
    fallStart: 0.3, // fraction of the impact beat spent rearing before the fall
    fallTime: 0.45, // fraction of the impact beat the fall takes
    maskOpacity: 1,
    filmStrength: 0.8, // thin-film iridescence on the rims
    glitch: 0.5, // slice glitches across the face
    scanSpeed: 7, // holographic scan bands run at
    engravingGlow: 0.9, // filigree brightness
    dissolveEdge: 0.08, // burn edge width of the dissolve

    /* --- 2 · the veils --- */
    veilLength: 1.6, // trails behind each mask (m)
    veilWidth: 0.8, // (m)
    veilFlutter: 1, // flutter amplitude
    veilDroop: 0.35, // sag toward the floor (m)
    veilGlow: 1.2,
    veilOpacity: 0.55,

    /* --- 3 · the wakes --- */
    wakeGlow: 0.8,
    wakeOpacity: 0.9,
    wakeShimmer: 1, // heat-shimmer bands
    wakeScale: 1, // band frequency
    wakeDeep: 1, // weight of the deep haze that darkens each lane
    wakeFill: 0.72, // opacity of the filled lacquer runner down each lane
    wakeVeins: 1, // weight of the flowing veins in it

    /* --- 4 · the shards --- */
    shardSize: 0.12, // mirror shard scale
    shardSpread: 1.2, // how far they peel out when the masks depart (m)
    shardOrbit: 0.55, // orbit radius round a mask (m)
    shardSpin: 1.8, // orbit speed (rad/s)
    shardGlow: 1.6,
    shardOpacity: 0.7,
    shardRest: 0.06, // fallen shards lie at (m)

    /* --- 4b · the pools (linger) --- */
    lingerTime: 2.0, // presentation linger after the masks fall (s); no gameplay effect
    poolRadius: 1.5, // pool under each fallen mask (m, × size, capped by lane spacing)
    poolGrow: 0.45, // pool spreads over (s)
    poolOpacity: 0.85,
    poolGlow: 1.2,
    poolSwirl: 1.2, // swirl speed of the lacquer in the pool
    poolVeins: 1.4, // weight of the saturated veins
    poolRipple: 0.6, // weight of the slow ripple fronts

    /* --- 5 · particles --- */
    trailInterval: 0.12, // seconds between identical trail puffs in all lanes
    trailCount: 4, // per lane per puff
    finaleCount: 12, // per lane when the masks shatter
    contactCount: 24, // at a committed hit
    trailSize: 0.11, // trail puff size (m)
    trailLife: 0.48, // (s)
    trailSpeed: 0.6, // drift (m/s)
    trailSpread: 0.5, // cone spread (0 = straight up, 1 = hemisphere)
    trailRadius: 0.25, // emitter radius round the mask (m)
    finaleSize: 0.16, // finale puff size (m)
    finaleLife: 0.65, // (s)
    finaleSpeed: 1.4, // (m/s)
    finaleSpread: 0.8,
    finaleRadius: 0.35, // (m)
    contactSize: 0.14, // committed-hit burst size (m)
    contactLife: 0.6, // (s)
    contactSpeed: 2, // (m/s)
    contactSpread: 0.8,
    contactEmitRadius: 0.3, // emitter radius of the hit burst (m)
    sparkGlow: 1.4,
    colorSparkA: '#fff4fb',
    colorSparkB: '#ff8fd6',
    colorSparkC: '#b0207e',
    colorSparkD: '#2a0838',
    glitterCount: 150, // GPU glitter along the three lanes (≤ 180)
    glitterSize: 0.05,
    glitterGlow: 2,
    glitterRise: 1.2, // drift upward over one life (m)
    glitterColor: '#ffe6fb',

    /* --- 6 · the finale & contacts --- */
    finaleBurst: 0.9, // AIR shell per mask (m)
    finaleIntensity: 0.5,
    shellLife: 0.4, // AIR shell per mask lives (s)
    shellOpacity: 0.22,
    shellFresnel: 2.2, // rim sharpness of the shell
    rippleRadius: 1.6, // ripple decal per lane (m)
    contactRadius: 2.6, // shockwave at a committed hit (m)
    decalLife: 0.8,
    rippleIntensity: 0.7, // RIPPLE decal brightness at the endpoints
    contactIntensity: 1.4, // SHOCKWAVE decal brightness at a hit
    contactWidth: 0.12, // its ring width
    colorBurstA: '#ffd6f1',
    colorBurstB: '#d42a96',
    colorBurstC: '#2a0838',
    landShake: 0.08, // knock as the three masks hit the floor (× explosion intensity)

    /* --- 6b · the true strike (honest feedback on a committed hit) --- */
    strikeSize: 1.3, // the real mask lunging out of the struck body (× mask size)
    strikeLife: 0.7, // (s)
    strikeLunge: 0.9, // how far it lunges down the line (m)
    strikeRise: 0.6, // it looms this far above the procession (m)
    strikeHeat: 0.7, // saturated glow of the strike mask
    strikeFlash: 0.16, // screen flash in the body colour (× explosion intensity)
    strikeShake: 0.22, // camera knock (× explosion intensity)
    strikeBurst: 1.9, // the pressure shell the strike drives into the body (m)
    strikeBurstLife: 0.45, // (s)
    strikeBurstOpacity: 0.55,
    strikeBurstIntensity: 1.3,
    strikeStain: 1.6, // a dark lacquer splash left on the floor under the struck body (m)
    strikeStainLife: 2.2, // (s)
    impactShake: 0.12, // (× explosion intensity, × camera shake)
    shakeDecay: 7,
    shakeFrequency: 20,
    impactFlash: 0.08, // (× explosion intensity)

    /* --- 7 · the shimmer --- */
    shimmerStrength: 0.5, // heat shimmer at the mask front (× global distortion)
    shimmerHeight: 2.4, // (m)
    shimmerScale: 1, // noise frequency
  },
};
