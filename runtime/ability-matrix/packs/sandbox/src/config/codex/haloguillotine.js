/**
 * Halo Guillotine — Light — a halo forms over the caster's head and hinges
 * down to stand beside them; a blade of light grows out of it and rises up the
 * line like the arm of a paper guillotine, then swings down on the hinge and
 * cuts the whole line from the caster to the target.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 *
 * Every dimension below is resolved per frame by `HaloGuillotineAbility`, so
 * dragging any of it re-shapes a blade already raised — its reach, its
 * crescent, the angle it swings from, the cut it leaves.
 */
export default {
  id: 'haloguillotine',
  meta: {
    label: 'Halo Guillotine',
    accent: '#fff4c8',
    key: '',
    element: 'light',
    hint: 'Light — a halo hinges down beside you, grows a blade of light up the line and swings it shut like a guillotine',
    cast: 'line',
    glyph: `<circle cx="20" cy="78" r="9"/><path d="M26 72L86 22"/><path d="M28 80C50 74 72 54 86 22"/><path d="M8 92H94"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 26, // metres/second the blade grows up the line
    lifetime: 1.4, // seconds the cut takes to cool and the blade to dissolve
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light (rides the blade, then the point of contact) --- */
    lightColor: '#fff1c4',
    lightIntensity: 7,
    lightRadius: 10,

    /* ================================================================ */
    /* 1 · THE HALO — forms overhead, hinges down beside the caster      */
    /* ================================================================ */
    haloAbove: 2.35, // metres off the floor it forms at, over the head
    haloRadius: 0.72, // metres
    haloTube: 0.055, // ring thickness, metres
    haloRunes: 18, // rune cells round the ring
    haloGlow: 2.2,
    runeGlow: 3.0,
    haloSpin: 0.35, // revolutions/second the rune band turns
    formTime: 0.22, // seconds it takes to draw itself round
    hingeTime: 0.3, // seconds it takes to tip down and stand beside the caster
    hingeForward: 0.9, // metres in front of the caster the hinge stands
    hingeSide: 0.0, // metres to the right
    hingeHeight: 0.8, // metres off the floor (must clear the blade's root)
    haloRise: 1.6, // metres it lifts away on the exit
    colorHaloGold: '#ffcf6a',
    colorHaloCore: '#fff8e6',
    colorRune: '#ffffff',

    /* ================================================================ */
    /* 2 · THE BLADE                                                     */
    /* ================================================================ */
    raiseAngle: 30, // degrees the blade stands open while it grows
    armLean: 38, // degrees the swing plane leans out to the right, so the blade is seen face-on
    windup: 9, // extra degrees it lifts just before it falls
    quiver: 0.6, // degrees it trembles while raised
    bladeWidth: 1.15, // metres from spine to the deepest point of the edge
    bladeRoot: 0.55, // share of that depth at the hinge
    bladeBelly: 0.75, // where the crescent bellies (<1 toward the hinge)
    bladeTipTaper: 0.14, // share of the length the tip narrows over
    bladeSpine: 0.12, // metres of blade behind the spine
    bladeOverhang: 0.4, // metres the blade reaches past the target
    bladeGlow: 1.6, // body brightness
    edgeGlow: 4.5, // the cutting edge (bloom > 1)
    edgeWidth: 0.14, // share of the blade the bright edge takes
    filigree: 1.0, // brightness of the engraved band
    sheenGlow: 1.6, // the band of light running along it
    sheenSpeed: 1.2, // sheen passes per second
    bladeFresnel: 1.2, // brightening at grazing angles
    bladeOpacity: 0.9,
    softFade: 0.15, // soft intersection with the floor, metres
    colorBladeBody: '#ffb63c',
    colorBladeHot: '#fff0b8',
    colorBladeEdge: '#ffffff',
    colorEngrave: '#fff6d8',

    /* ================================================================ */
    /* 3 · THE SWING                                                     */
    /* ================================================================ */
    holdTime: 0.22, // seconds it hangs at the top of the wind-up
    swingTime: 0.2, // seconds the fall takes (accelerating, like a dropped arm)
    lingerTime: 0.55, // seconds it stays buried in the cut
    smearArc: 26, // degrees of light dragged behind the edge
    smearGlow: 2.6,
    smearWarp: 1.2, // how hard the swing bends the air
    colorSmearA: '#ffffff',
    colorSmearB: '#ffb84a',

    /* ================================================================ */
    /* 4 · THE CUT                                                       */
    /* ================================================================ */
    telegraph: 1.0, // brightness of the guide line before the swing
    cutWidth: 0.07, // half-width of the white slit, metres
    cutGlowWidth: 0.5, // metres the glow bleeds either side
    shardDensity: 1.6, // light shards per metre radiating off the cut
    shardLength: 0.9, // metres
    freshLength: 4, // metres behind the contact the cut stays white-hot
    cutGlow: 3.6,
    cutJitter: 0.04, // metres the cut wanders
    coolCurve: 1.4, // >1 holds the heat longer
    colorCutHot: '#ffffff',
    colorCutGold: '#ffc24a',
    colorCutCool: '#a8551a',
    colorScorch: '#1a1208',

    /* ================================================================ */
    /* 5 · GLINT                                                         */
    /* ================================================================ */
    glintSize: 0.9, // metres
    glintGlow: 2.5,
    colorGlintCore: '#ffffff',
    colorGlintHalo: '#ffd27a',

    /* ================================================================ */
    /* 6 · PARTICLES                                                     */
    /* ================================================================ */
    moteRate: 120, // motes per second off the raised blade and the halo
    moteSize: 0.045,
    moteSpeed: 0.6,
    moteLife: 1.2,
    moteLift: 0.5, // m/s² they rise
    moteGlow: 2.4,
    colorMoteA: '#ffffff',
    colorMoteB: '#fff0b0',
    colorMoteC: '#ffbe48',
    colorMoteD: '#7a3a08',
    sparkRate: 320, // sparks per second off the point of contact
    sparkSpeed: 9,
    sparkSize: 0.03,
    sparkStretch: 0.25,
    sparkLife: 0.5,
    sparkGravity: 10,
    sparkGlow: 3.5,
    colorSparkA: '#ffffff',
    colorSparkB: '#fff2b8',
    colorSparkC: '#ffb040',
    colorSparkD: '#8a3a06',
    dustCount: 30, // dust puffs thrown up along the cut at the slam
    dustSize: 0.6,
    dustLift: 0.7,
    dustLife: 1.8,
    dustOpacity: 0.3,
    colorDustA: '#d8c8a0',
    colorDustB: '#9c8c70',
    colorDustC: '#6a5e4c',
    colorDustD: '#3a342c',

    /* ================================================================ */
    /* 7 · THE SLAM                                                      */
    /* ================================================================ */
    slamSparks: 140, // sparks off the tip as it buries itself
    burstSize: 1.8, // the AIR shell at the tip, metres
    burstIntensity: 1.1,
    shockRadius: 6, // the shockwave on the floor, metres
    dustRingRadius: 3.5,
    slamFlash: 0.4,
    slamShake: 0.55,
    shakeDuration: 0.4,
    slamLight: 3, // light punch, × lightIntensity
    colorBurstA: '#fffbe8',
    colorBurstB: '#ffd27a',
    colorBurstC: '#b8761e',
    colorShockA: '#ffcf6a',
    colorShockB: '#ffffff',
    colorFlash: '#fff0c8',

    /* ================================================================ */
    /* 8 · HITS                                                          */
    /* ================================================================ */
    hitWidth: 0.8, // metres either side of the cut that it catches
    hitImpulse: 5, // m/s each half is thrown away from the cut
    hitLift: 2.5,
    hitSpin: 1.2,
    hitSlice: 1 // 1 the blade cuts bodies in two, 0 it only knocks them down
  }
};
