/**
 * Hoarfrost Mirror — Frost — a pointed arch of black ice rises in the circle,
 * draws the cold in, and throws it back out as a wall of gale.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension and time below is resolved per frame by
 * `HoarfrostMirrorAbility`, so dragging any of it in the editor re-shapes a
 * mirror that is already standing.
 */
export default {
  id: 'hoarfrost',
  meta: {
    label: 'Hoarfrost Mirror',
    accent: '#d7f4ff',
    key: '',
    element: 'frost',
    hint: 'Frost — a mirror of rime rises in the circle, drinks in the cold and throws it back out as a gale',
    cast: 'zone',
    glyph: `<path d="M30 86V46C30 30 40 20 50 12C60 20 70 30 70 46V86Z"/><path d="M38 80V48C38 38 44 30 50 24C56 30 62 38 62 48V80"/><path d="M22 92H78"/><path d="M18 50L8 46M82 50L92 46M24 30L16 22M76 30L84 22"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // how fast the rime track crawls to the circle, metres/second
    lifetime: 1.1, // seconds the frozen floor takes to thaw once the mirror is gone
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.4, // the circle, metres — the throw reaches past it

    /* --- light --- */
    lightColor: '#cfefff',
    lightIntensity: 7, // the mirror's steady cold glow
    lightRadius: 11,
    lightHeight: 1.8, // metres off the floor the light hangs (at the mirror's heart)

    /* ================================================================ */
    /* TIMING                                                            */
    /* ================================================================ */
    riseTime: 0.5, // seconds the mirror takes to rise out of the floor
    riseOvershoot: 0.25, // how far past full height it springs (0 = none)
    chargeTime: 0.8, // seconds it stands drawing the cold in
    blastTime: 0.45, // seconds the throw takes to reach its full radius
    standTime: 0.55, // seconds the cracked mirror stands after the throw
    shatterTime: 0.55, // seconds the pane takes to come apart

    /* ================================================================ */
    /* 1 · THE MIRROR                                                    */
    /* ================================================================ */
    mirrorWidth: 2.7, // metres, outer edge of the frame
    mirrorHeight: 4.4, // metres, base to apex
    archShoulder: 0.56, // where the straight sides give way to the pointed arch (× height)
    frameWidth: 0.24, // metres of rime frame round the glass
    paneDepth: 0.08, // thickness of the glass, metres
    frameDepth: 0.26, // thickness of the frame, metres
    mirrorSway: 0.035, // radians it rocks while it charges
    sinkDepth: 0.4, // metres it drops as it shatters

    /* glass */
    mirrorReflect: 1.15, // how much sky the polished ice reflects
    mirrorFresnel: 2.6, // fresnel power (lower = more reflective face-on)
    mirrorSheen: 0.55, // the cold sheen sweeping across the glass
    mirrorShimmer: 1, // how much the reflection breathes
    colorGlassDeep: '#06142a', // the black ice itself
    colorGlassSky: '#8fd3ff', // what the ice tints its reflection

    /* hoarfrost on the glass */
    frostScale: 2.4, // fern features per metre
    frostRagged: 0.22, // metres of ragged front
    frostOpacity: 0.95, // how white the frosted glass goes
    frostReach: 0.75, // metres the frost creeps in by the throw
    colorFrost: '#eef9ff',

    /* the charge */
    chargeGlow: 3.2, // the cold heart swelling in the glass
    flashGlow: 7, // the glass at the instant of the throw
    colorGlow: '#a9e6ff',

    /* the cracks */
    crackScale: 1.6, // crack cells per metre
    crackGlow: 4.5,
    crackReach: 2.6, // metres the crack net spreads from the heart
    colorCrack: '#d8f6ff',

    /* ================================================================ */
    /* 2 · THE RIME CRUST — frame and bristles                           */
    /* ================================================================ */
    crustNoise: 3.5, // crust features per metre
    crustGlow: 1.2, // inner light tracking the charge
    crustRim: 1.1, // fresnel rim
    crustSparkle: 2.5, // glints
    crustAmbient: 0.55,
    colorRime: '#f1faff',
    colorRimeShadow: '#5f8db5',
    bristleCount: 56, // hoarfrost spikes round the frame (max 96)
    bristleLength: 0.65, // metres, longest
    bristleWidth: 0.09, // metres at the waist
    bristleJitter: 0.6, // 0..1 length and lean variety
    bristleLean: 0.45, // radians they fan away from the outline normal
    bristleGrow: 0.85, // share of the charge they take to grow

    /* ================================================================ */
    /* 3 · THE MIRROR FLOOR                                              */
    /* ================================================================ */
    floorSpreadTime: 0.35, // seconds the circle takes to freeze over
    floorReflect: 0.85, // how much sky the black ice reflects
    floorRimWidth: 0.9, // metres of hoarfrost feathering in from the rim
    floorRimRagged: 0.35, // metres of rim wander
    ringSpacing: 0.75, // metres between the rings drawn inward
    ringSpeed: 3.2, // metres/second they travel in
    ringGlow: 2.4,
    floorBlastGlow: 3.2, // the throw's front on the floor
    colorFloorIce: '#030c18',

    /* ================================================================ */
    /* 4 · THE INHALE — motes drawn into the glass                        */
    /* ================================================================ */
    inhaleRate: 260, // motes per second
    inhaleSize: 0.07,
    inhaleLifetime: 0.65,
    inhaleHeight: 2.2, // metres they start up to
    inhaleGlow: 2.4,
    colorMoteA: '#ffffff',
    colorMoteB: '#cfefff',
    colorMoteC: '#8fd3ff',
    colorMoteD: '#3d7ab8',

    /* ================================================================ */
    /* 5 · THE THROW                                                     */
    /* ================================================================ */
    blastReach: 1.7, // final radius of the gale wall, × the circle
    blastHeight: 2.2, // metres tall at the mirror
    blastThin: 0.45, // share of its height it keeps at full reach
    blastIntensity: 1.6,
    blastTrail: 0.82, // the second, dimmer wall behind the front (× radius)
    blastStreaks: 36, // streaks round the ring
    blastStreakSpeed: 2.5,
    blastWarp: 1.4, // distortion strength
    colorBlastA: '#ffffff',
    colorBlastB: '#7cc8ff',
    gustCount: 260, // streaks thrown outward
    gustSpeed: 15,
    gustSize: 0.07,
    gustLifetime: 0.55,
    gustStretch: 0.6,
    mistCount: 70, // rolling mist puffs
    mistSize: 1.1,
    mistSpeed: 6,
    mistLifetime: 1.4,
    mistOpacity: 0.5,
    colorMistA: '#ffffff',
    colorMistB: '#dff3ff',
    colorMistC: '#9cc7e6',
    colorMistD: '#4f7799',

    /* ================================================================ */
    /* 6 · THE SHATTER                                                   */
    /* ================================================================ */
    shardCount: 150,
    shardSpeed: 6.5,
    shardSize: 0.16,
    shardLifetime: 1.4,
    shardGravity: -14,
    glitterCount: 140,
    glitterSize: 0.05,
    glitterLifetime: 1.6,
    colorShardA: '#ffffff',
    colorShardB: '#cdeeff',
    colorShardC: '#7fb6e0',
    colorShardD: '#2c5a85',

    /* ================================================================ */
    /* 7 · BODIES                                                        */
    /* ================================================================ */
    hitImpulse: 11, // metres/second outward
    hitLift: 4.2,
    hitSpin: 1.6,
    frostTint: 0.75, // 0..1 how far a thrown body goes to ice
    colorBodyFrozen: '#bfe6ff',
    colorBodyRim: '#e8f8ff',
    bodyRimGlow: 1.6,
    colorBodyEdge: '#ffffff',
    bodyEdgeGlow: 2.5,

    /* ================================================================ */
    /* 8 · THE BEAT                                                      */
    /* ================================================================ */
    riseShake: 0.22, // the knock as the mirror breaks the floor
    blastShake: 0.6,
    blastFlash: 0.45,
    blastLight: 45, // light punch on the throw
    shatterShake: 0.2,
    colorFlash: '#dff6ff',
    burstRadius: 3.2, // FROST shell at the mirror
    burstLife: 0.6,
    shockLife: 0.55, // shockwave decal (radius = the throw's reach)
    colorShockA: '#bfeaff',
    colorShockB: '#ffffff',

    /* travel — the rime track crawling to the circle */
    trailSpacing: 0.9, // metres between frost decals
    trailRadius: 0.42,
    trailLife: 1.8,
    trailGlitter: 140, // glints per second off the front
    colorTrailA: '#e8f7ff',
    colorTrailB: '#7fc6ff'
  }
};
