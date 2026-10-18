/**
 * Pearl Tempest — Water — pearls of compressed tide gather round the hand,
 * are flung in high arcs down the line, and burst wet where they land.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 *
 * Every dimension below is resolved per frame by `PearlTempestAbility`, so a
 * slider moves pearls already in the air, wakes already spiralling and crowns
 * already standing.
 */
export default {
  id: 'pearltempest',
  meta: {
    label: 'Pearl Tempest',
    accent: '#e7f8ff',
    key: '',
    element: 'water',
    hint: 'Water — pearls of compressed tide wheel round the hand, arc down the line in a volley and burst into crowns of spray',
    cast: 'line',
    glyph: `<circle cx="22" cy="72" r="7"/><circle cx="46" cy="40" r="6"/><circle cx="72" cy="26" r="5"/><path d="M14 86C30 60 52 30 86 18"/><path d="M64 84L70 72L76 84M78 86L84 76L90 86"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // metres/second each pearl covers along the ground
    lifetime: 1.5, // seconds the crowns, foam and drops take to settle after the last pearl lands
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#bfe6ff',
    lightIntensity: 9, // the light follows the lead pearl, then each landing
    lightRadius: 10,
    lightFlicker: 0.3, // 0..1

    /* ================================================================ */
    /* 1 · THE GATHER                                                    */
    /* ================================================================ */
    pearlCount: 7, // pearls in the volley (max 12)
    gatherTime: 0.32, // seconds they wheel round the hand before the first is thrown
    handForward: 0.55, // metres in front of the caster
    handSide: 0.25, // metres to the right
    handHeight: 1.55, // metres off the floor
    orbitRadius: 0.6, // metres they wheel round the hand at
    orbitSpeed: 7, // radians/second
    orbitTilt: 0.45, // radians the wheel is tipped toward the target

    /* ================================================================ */
    /* 2 · THE VOLLEY                                                    */
    /* ================================================================ */
    launchStagger: 0.075, // seconds between throws
    arcHeight: 3.0, // metres each arc rises over a 14 m throw
    arcJitter: 0.35, // 0..1 how much each arc's height varies
    curve: 1.6, // metres each pearl bows sideways in flight (alternating sides)
    landFrom: 0.5, // landings scatter from this share of the line to its end
    landSpread: 2.6, // metres either side of the line they scatter at the far end
    pearlRadius: 0.22, // metres
    pearlSpin: 6, // radians/second the inner tide turns

    /* ================================================================ */
    /* 3 · THE PEARL                                                     */
    /* ================================================================ */
    nacreGlow: 0.6, // the milky body
    iridescence: 0.9, // thin-film colour at the rim
    filmScale: 1.6, // how many colour bands across the rim
    coreGlow: 1.5, // the compressed tide seen through the middle (bloom > 1)
    swirlScale: 2.2, // inner tide features
    fresnelPower: 2.2,
    specular: 2.2,
    envAmount: 0.3,
    colorPearlA: '#e9f1f6', // nacre
    colorPearlB: '#6f98b8', // shadow
    colorPearlC: '#3aa6ff', // inner tide
    colorPearlD: '#ffffff', // highlight

    /* ================================================================ */
    /* 4 · THE WAKE                                                      */
    /* ================================================================ */
    wakeLength: 0.32, // share of the flight the spiral wake trails behind
    wakeRadius: 0.24, // metres the two strands spiral out at
    wakeTurns: 3.5, // turns of the helix along the wake
    wakeWidth: 0.05, // metres, each strand at the pearl
    wakeGlow: 2.4,
    wakeOpacity: 0.85,
    colorWakeA: '#ffffff',
    colorWakeB: '#7fd0ff',
    wakeDrops: 40, // droplets/second shed off each pearl

    /* ================================================================ */
    /* 5 · THE CROWN                                                     */
    /* ================================================================ */
    crownRadius: 1.0, // metres the splash crown opens to
    crownHeight: 1.15, // metres it stands
    crownTime: 0.75, // seconds it rises, stands and collapses
    crownSpikes: 13, // points round the rim
    crownSpikeDepth: 0.45, // 0..1 how deep the gaps between points are
    crownFlare: 0.5, // how far the rim flares out over the base
    crownOpacity: 0.75,
    crownGlow: 1.6,
    crownFoam: 1.4,
    crownWarp: 0.9, // how hard each crown bends the air
    colorCrownA: '#1f78bf', // body
    colorCrownB: '#a6e2ff', // sheen
    colorCrownC: '#ffffff', // foam

    /* ================================================================ */
    /* 6 · DROPS, BUBBLES & MIST                                         */
    /* ================================================================ */
    burstDrops: 46, // droplets per pearl at the burst
    dropSize: 0.07,
    dropSpeed: 5.5,
    dropGravity: 11,
    dropLife: 0.8,
    burstBubbles: 14, // bubbles per pearl, popping as the crown falls
    bubbleSize: 0.12,
    bubbleLife: 0.7,
    mistSize: 0.6,
    mistLife: 1.1,
    mistOpacity: 0.3,
    colorDropA: '#ffffff',
    colorDropB: '#c9efff',
    colorDropC: '#62b8ee',
    colorDropD: '#1e6aa8',
    colorMistA: '#e6f7ff',
    colorMistB: '#c4e6f8',
    colorMistC: '#98c9e2',
    colorMistD: '#6b9fbc',

    /* ================================================================ */
    /* 7 · EACH BURST                                                    */
    /* ================================================================ */
    burstSize: 0.9, // a small WATER shell per pearl, metres
    rippleRadius: 2.4,
    foamRadius: 1.3,
    burstFlash: 0.12,
    burstShake: 0.18,
    burstLight: 1.2, // light punch per landing, × lightIntensity
    lastScale: 1.6, // the last pearl (the one on the target) bursts this much bigger
    colorRippleA: '#8fd6ff',
    colorRippleB: '#ffffff',
    colorBurstA: '#ffffff',
    colorBurstB: '#9edcff',
    colorBurstC: '#2a7cb8',
    colorFoam: '#eaf8ff',
    colorFlash: '#d8f4ff',

    /* ================================================================ */
    /* 8 · THE BLAST                                                     */
    /* ================================================================ */
    hitRadius: 1.7, // metres round each landing that are knocked flat
    hitImpulse: 7, // m/s thrown out from the burst
    hitLift: 4.5,
    hitSpin: 1.6
  }
};
