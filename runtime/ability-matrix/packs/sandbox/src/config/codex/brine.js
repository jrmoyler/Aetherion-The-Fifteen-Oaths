/**
 * Brine Geyser — Water — the ground cracks into a salt pan seeping brine,
 * a column of it punches up through the middle, rains back down, and the
 * circle crusts over in white salt crystals.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 *
 * Every dimension below is resolved per frame by `BrineGeyserAbility`, so a
 * slider re-shapes a column already standing and crystals already growing.
 */
export default {
  id: 'brine',
  meta: {
    label: 'Brine Geyser',
    accent: '#7ecbff',
    key: '',
    element: 'water',
    hint: 'Water — the ground cracks and seeps, a brine column punches up through it, rains down, and the circle crusts over in salt',
    cast: 'zone',
    glyph: `<path d="M40 86V34C40 26 32 22 24 24M60 86V34C60 26 68 22 76 24"/><path d="M50 30V8"/><path d="M18 86H82"/><path d="M26 86L30 76L34 86M66 86L70 74L74 86"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 22, // how fast the cast reaches the circle — the pan cracks meanwhile
    lifetime: 2.4, // seconds the salt crystals stand before they crumble
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4.2, // metres — the circle that is salted

    /* --- light --- */
    lightColor: '#bff3ea',
    lightIntensity: 9, // the light rides up the column
    lightRadius: 11,
    lightFlicker: 0.3, // 0..1

    /* ================================================================ */
    /* 1 · THE SALT PAN                                                  */
    /* ================================================================ */
    panCells: 0.9, // salt-pan polygons per metre
    ridgeAmount: 1, // how bright the raised ridges are
    seepGlow: 2.2, // brine glowing in the seams before the punch
    seepSpeed: 0.8,
    crustOpacity: 0.9,
    saltTime: 1.0, // seconds the pan takes to whiten once the brine rains on it
    colorWet: '#173b3c', // wet plates
    colorSalt: '#eef6f2', // the crust
    colorRidge: '#ffffff',

    /* ================================================================ */
    /* 2 · THE COLUMN — shape                                            */
    /* ================================================================ */
    columnHeight: 9, // metres it punches up to
    columnRadius: 1.05, // metres at the foot
    columnTaper: 0.72, // top radius as a share of the foot
    riseTime: 0.22, // seconds it takes to punch up
    holdTime: 0.9, // seconds it roars at full height
    collapseTime: 0.65, // seconds it takes to fall back
    surgeAmp: 0.13, // swell of the surges racing up it
    surgeCount: 3.5, // surges up the trunk at once
    surgeSpeed: 2.6, // surges per second
    twist: 0.08, // radians per metre of twist
    churn: 0.12, // noise on the surface
    crownRadius: 2.4, // metres the crown bursts out
    crownLift: 1.0, // metres it rises before it droops
    crownDrop: 2.2, // metres the rim droops
    crownOpen: 0.35, // seconds it takes to burst open

    /* ================================================================ */
    /* 3 · THE COLUMN — brine                                            */
    /* ================================================================ */
    columnOpacity: 0.62,
    fresnelPower: 2.2,
    columnGlow: 1.1,
    coreGlow: 1.8, // the churning heart seen through the middle
    foamAmount: 1.0, // white salt-foam bands racing up
    foamScale: 1.0,
    envAmount: 0.7,
    refractStrength: 0.8,
    colorBrineDeep: '#0d4f57',
    colorBrine: '#45c7bf',
    colorFoam: '#f2fbf6',

    /* ================================================================ */
    /* 4 · SALT CRYSTALS                                                 */
    /* ================================================================ */
    crystalCount: 46, // clusters across the circle (max 80)
    crystalSize: 0.75, // metres tall, the biggest
    crystalGrow: 0.5, // seconds a cluster takes to grow
    crystalSpread: 0.6, // seconds the growth takes to spread rim-ward
    crystalSparkle: 1.2,
    crystalHeart: 0.9,
    crystalSink: 0.5, // share of the lifetime spent crumbling at the end

    /* ================================================================ */
    /* 5 · RAIN, SPRAY, STEAM & GLITTER                                  */
    /* ================================================================ */
    rainRate: 420, // drops/second falling out of the crown
    rainSize: 0.08,
    rainLife: 1.3,
    rainGravity: 13,
    sprayCount: 140, // drops thrown at the punch
    spraySpeed: 9,
    steamRate: 30, // puffs/second
    steamSize: 1.0,
    steamLife: 1.6,
    steamOpacity: 0.3,
    bubbleRate: 40, // bubbling in the seams before the punch
    bubbleSize: 0.12,
    glitterRate: 80, // salt glitter off the crust
    glitterSize: 0.05,
    glitterGlow: 4,
    colorRainA: '#ffffff',
    colorRainB: '#d4f6ee',
    colorRainC: '#68c9bd',
    colorRainD: '#1f6e6a',
    colorSteamA: '#f0faf7',
    colorSteamB: '#cfe7e1',
    colorSteamC: '#a2c6bf',
    colorSteamD: '#6f9690',
    colorGlitterA: '#ffffff',
    colorGlitterB: '#f4fffb',
    colorGlitterC: '#bdf0e6',
    colorGlitterD: '#6fcfc3',

    /* ================================================================ */
    /* 6 · THE PUNCH                                                     */
    /* ================================================================ */
    burstSize: 2.2, // the WATER shell at the foot, metres
    shockRadius: 6.5,
    rippleRadius: 4.5,
    punchFlash: 0.35,
    punchShake: 0.7,
    shakeDuration: 0.5,
    punchLight: 2.6, // light punch, × lightIntensity
    buildRumble: 0.18, // camera rumble while the pan cracks
    colorShockA: '#9ff0e2',
    colorShockB: '#ffffff',
    colorBurstA: '#ffffff',
    colorBurstB: '#8fe6da',
    colorBurstC: '#1f6e6a',
    colorFlash: '#d8fff6',

    /* ================================================================ */
    /* 7 · THE LAUNCH & THE SALTING                                      */
    /* ================================================================ */
    launchRadius: 1.8, // metres from the vent that ride the column up
    launchLift: 16, // m/s straight up
    launchImpulse: 2.5,
    knockImpulse: 7, // the rest of the circle is blown outward
    knockLift: 3.5,
    hitSpin: 1.6,
    saltBody: 0.85, // 0..1 how far a hit body is crusted white
    saltBodyTime: 1.2, // seconds it takes
    colorSaltBody: '#dfe9e5',
    colorSaltRim: '#9ff0e2',
    saltRimGlow: 1.2,
    colorSaltEdge: '#ffffff',
    saltEdgeGlow: 2.5,
    saltEdgeWidth: 0.05
  }
};
