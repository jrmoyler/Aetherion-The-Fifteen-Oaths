/**
 * Reliquary Dawn — Light — a seed of dawn is thrown into the circle and a
 * gilded hexagonal reliquary stands up out of the floor around it; the relic
 * inside kindles into a small sun, the stained-glass windows burn, the six
 * panels fall open like a flower and dawn washes across the circle, throwing
 * everything it reaches; then the shrine sinks back into the stone.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 */
export default {
  id: 'reliquarydawn',
  meta: {
    label: 'Reliquary Dawn',
    accent: '#ffe9a8',
    key: '',
    element: 'holy',
    hint: 'Light — a gilded reliquary rises out of the circle, its sun-relic kindles, the windows fall open and dawn washes the circle',
    cast: 'zone',
    glyph: `<path d="M50 6L64 24H36Z"/><path d="M32 30H68V78H32Z"/><path d="M42 78V52C42 44 58 44 58 52V78"/><path d="M24 84H76"/><circle cx="50" cy="38" r="4"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // metres/second the seed of dawn flies to the circle
    lifetime: 1.6, // seconds the shrine takes to sink and the light to fade
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.6, // the circle dawn washes, metres

    /* --- light (rides the seed, then the relic) --- */
    lightColor: '#ffe6a8',
    lightIntensity: 9,
    lightRadius: 12,

    /* ================================================================ */
    /* 1 · THE SEED — thrown into the circle                             */
    /* ================================================================ */
    heraldArc: 2.4, // metres the seed arcs up on its way
    heraldSize: 0.7, // radius of its glow, metres
    heraldGlow: 1.6,
    heraldTrail: 150, // motes per second it sheds

    /* ================================================================ */
    /* 2 · THE RISE — the shrine stands up out of the floor              */
    /* ================================================================ */
    riseTime: 0.6, // seconds it takes to come up
    riseOvershoot: 0.08, // metres it overshoots before it settles
    shrineScale: 1.0, // the whole shrine (4.3 m tall at 1)
    emergeGlow: 4, // the molten seam where it breaks through
    debrisCount: 46, // stone chips thrown as it breaks the floor
    dustCount: 18, // dust puffs round its foot

    /* ================================================================ */
    /* 3 · THE SHRINE                                                    */
    /* ================================================================ */
    giltGlow: 1.0, // overall brightness
    giltSpec: 1.6, // gold highlights
    giltFresnel: 1.2, // warm rim
    relicLight: 2.6, // how hard the relic lights the inside of the frame
    finialGlow: 4, // the sun on the spire
    colorGilt: '#e8b04a',
    colorGiltHot: '#fff1c4',
    colorStone: '#efe3c8',
    colorShadow: '#3a2a14',

    /* ================================================================ */
    /* 4 · THE RELIC                                                     */
    /* ================================================================ */
    kindleTime: 0.4, // seconds the relic takes to kindle
    relicRadius: 0.32, // metres
    relicGlow: 6,
    relicBoil: 1.2, // how fast its surface churns
    coronaSize: 2.2, // radius of the corona, metres
    coronaGlow: 2.4,
    coronaRays: 12,
    colorRelicA: '#ffffff',
    colorRelicB: '#fff0b8',
    colorRelicC: '#ffb347',
    colorRelicD: '#ff6a3a',
    colorCoronaCore: '#ffffff',
    colorCoronaHalo: '#ffc46a',

    /* ================================================================ */
    /* 5 · THE WINDOWS                                                   */
    /* ================================================================ */
    panelOpenTime: 0.32, // seconds the panels take to fall open
    panelOpenAngle: 100, // degrees they fall outward
    panelBounce: 0.12, // share of a bounce as they land
    glassGlow: 3, // backlit brightness
    glassCells: 7, // panes per metre
    leadWidth: 0.05, // lead lines, metres
    glassOpacity: 0.9,
    colorGlassA: '#ffd36a',
    colorGlassB: '#ff8a5c',
    colorGlassC: '#ffe9b0',
    colorGlassD: '#8fb8ff',
    colorLead: '#2a1a08',

    /* ================================================================ */
    /* 6 · THE WASH                                                      */
    /* ================================================================ */
    washTime: 0.7, // seconds dawn takes to cross the circle
    washHold: 0.6, // seconds it holds at full light
    washFrontWidth: 0.4, // metres of bright front
    washGlow: 2.4,
    washStreaks: 28, // sunrise streaks round the circle
    duskOpacity: 0.45, // how dark the circle is before dawn
    groundErode: 0.7, // 0..1 how raggedly the light fades
    colorDusk: '#141c3c',
    colorWashA: '#fff3cc',
    colorWashB: '#ffc061',
    colorWashC: '#d0702e',

    /* ================================================================ */
    /* 7 · THE RAYS                                                      */
    /* ================================================================ */
    rays: 6, // shafts out of the open sides (max 12)
    rayHeight: 1.5, // metres off the floor where they leave the shrine
    rayEndHeight: 0.1, // metres off the floor at full reach
    rayWidth: 0.55, // metres at the shrine
    rayEndWidth: 2.4, // metres at full reach
    rayGlow: 1.8,
    rayStreaks: 6, // streaks across each shaft
    raySpin: 0.15, // radians/second the shafts turn
    colorRayA: '#fff6dc',
    colorRayB: '#ffb84a',

    /* ================================================================ */
    /* 8 · PARTICLES                                                     */
    /* ================================================================ */
    moteRate: 160, // motes per second drifting in the light
    moteSize: 0.045,
    moteSpeed: 0.5,
    moteLife: 1.6,
    moteLift: 0.4,
    moteGlow: 2.4,
    colorMoteA: '#ffffff',
    colorMoteB: '#fff0b8',
    colorMoteC: '#ffbe48',
    colorMoteD: '#7a3a08',
    chipSize: 0.12,
    chipSpeed: 5.5,
    chipLife: 1.4,
    colorChipA: '#d8ccb0',
    colorChipB: '#b0a080',
    colorChipC: '#80705a',
    colorChipD: '#4a4030',
    dustSize: 0.6,
    dustLift: 0.7,
    dustLife: 1.8,
    dustOpacity: 0.3,
    colorDustA: '#e8dcc0',
    colorDustB: '#b8a888',
    colorDustC: '#7a6e5a',
    colorDustD: '#3a342c',

    /* ================================================================ */
    /* 9 · THE OPENING                                                   */
    /* ================================================================ */
    burstSize: 3.2, // the AIR shell as the panels fall, metres
    burstIntensity: 1.0,
    shockRadius: 7, // the shockwave on the floor, metres
    openFlash: 0.45,
    openShake: 0.35,
    riseShake: 0.25,
    shakeDuration: 0.5,
    openLight: 2.5, // light punch, × lightIntensity
    warpStrength: 0.8, // heat riding the wash front
    colorBurstA: '#fffbe8',
    colorBurstB: '#ffd27a',
    colorBurstC: '#c8761e',
    colorShockA: '#ffcf6a',
    colorShockB: '#ffffff',
    colorFlash: '#fff0c8',

    /* ================================================================ */
    /* 10 · HITS                                                         */
    /* ================================================================ */
    hitImpulse: 7, // m/s thrown outward by the wash
    hitLift: 6,
    hitSpin: 1.5
  }
};
