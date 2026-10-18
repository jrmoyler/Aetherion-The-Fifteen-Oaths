/**
 * Spore Coffin — Poison — fungal ribs sprout round the circle, close over it
 * like a coffin of bars, fill with spores and burst.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `SporeCoffinAbility`, so
 * dragging any of it re-grows a cage that is already standing.
 */
export default {
  id: 'sporecoffin',
  meta: {
    label: 'Spore Coffin',
    accent: '#b6e24a',
    key: '',
    element: 'poison',
    hint: 'Poison — fungal ribs sprout round the circle, close over it like a cage, fill with spores and burst',
    cast: 'zone',
    glyph: `<path d="M20 86C20 50 34 22 50 12C66 22 80 50 80 86"/><path d="M34 86C34 56 42 30 50 12C58 30 66 56 66 86"/><path d="M50 12V86"/><path d="M14 86H86"/><circle cx="34" cy="62" r="4"/><circle cx="64" cy="48" r="4"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    zoneRadius: 4.2, // radius of the circle the coffin closes over, metres
    speed: 22, // how fast the mycelium runs out to the circle, metres/second
    lifetime: 2.2, // seconds the spore haze takes to settle after the burst
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#d8ff7a',
    lightIntensity: 6,
    lightRadius: 11,
    lightFlicker: 0.25,

    /* ================================================================ */
    /* 1 · THE RIBS — shape                                              */
    /* ================================================================ */
    ribCount: 14, // ribs round the circle
    cageHeight: 4.2, // metres to the crown where they meet
    cageRadius: 0.95, // × zoneRadius at the floor
    ribBulge: 0.32, // how far they bow out at the shoulder, × radius
    ribTwist: 0.55, // radians each rib winds round the cage, base to crown
    ribRadius: 0.13, // thickness at the root, metres
    ribTipRadius: 0.035, // at the crown, metres
    knots: 6, // knuckles along each rib
    knotSize: 0.45, // how proud they stand, × the rib radius
    growTime: 0.55, // seconds a rib takes to sprout to the crown
    growStagger: 0.3, // seconds between the first rib and the last
    crownOvershoot: 0.08, // how far past the crown they reach before settling

    /* ================================================================ */
    /* 2 · THE RIBS — flesh                                              */
    /* ================================================================ */
    gillScale: 14, // gill lines per metre along the rib
    spotScale: 3.2, // glowing spots per metre
    spotGlow: 3.4, // bioluminescent spots (bloom > 1)
    veinGlow: 1.6, // light running up the gills while it holds
    fleshShade: 0.75, // how much the sun shades it
    colorFleshA: '#d8dcae', // pale cap flesh
    colorFleshB: '#6c7438', // gill dark
    colorSpot: '#d6ff4a',
    colorDissolve: '#f4ffb0',

    /* ================================================================ */
    /* 3 · SPORE PODS                                                    */
    /* ================================================================ */
    podCount: 34, // puffballs clinging to the ribs
    podSize: 0.26, // full radius, metres
    podSwell: 0.35, // how much they throb, × size
    podRate: 2.6, // throbs per second
    podGlow: 2.8,
    colorPodSkin: '#9eb83a',
    colorPodGlow: '#f0ff9a',

    /* ================================================================ */
    /* 4 · THE SPORE FOG — inside the coffin                             */
    /* ================================================================ */
    holdTime: 1.5, // seconds the coffin stands full before it bursts
    fogFill: 0.9, // seconds the fog takes to fill it
    fogOpacity: 0.55,
    fogGlow: 1.6,
    fogScale: 0.8, // swirl features per metre
    fogSwirl: 0.6, // how fast it churns
    colorFogA: '#e8ff8a',
    colorFogB: '#6e8a1e',

    /* ================================================================ */
    /* 5 · THE MYCELIUM MAT                                              */
    /* ================================================================ */
    matRadius: 1.25, // × zoneRadius
    hyphaeScale: 5, // threads per metre round the circle
    hyphaeGlow: 2.2,
    matSpread: 0.6, // seconds the mat takes to grow in from the ring
    matErode: 0.7, // 0..1 how raggedly it fades
    colorHyphae: '#d6ff6a',
    colorMat: '#1c2210',
    colorNodes: '#f4ffc0',

    /* ================================================================ */
    /* 6 · THE BURST                                                     */
    /* ================================================================ */
    burstTime: 0.55, // seconds the ribs take to fling open and rot away
    burstFling: 1.25, // radians the ribs swing outward
    burstPush: 1.2, // metres they are thrown outward
    burstSpores: 420, // spores in the blast
    sporeSpeed: 9, // m/s
    sporePuffs: 34, // smoke puffs in the blast
    puffSpeed: 4.5,
    chunkCount: 60, // flesh chunks
    chunkSpeed: 8,
    burstDust: 1.3, // × zoneRadius, the dust ring
    burstShock: 1.8, // × zoneRadius, the shockwave
    warpStrength: 1.4, // how hard the blast bends the air
    burstFlash: 0.32,
    burstShake: 0.6,
    shakeDuration: 0.45,
    burstLight: 3, // light punch, × lightIntensity
    sproutShake: 0.18, // knock as the ribs break the floor
    colorFlash: '#e0ff90',
    colorShock: '#c8f060',
    colorDust: '#5a6a2a',

    /* ================================================================ */
    /* 7 · SPORES, PUFFS & CHUNKS                                        */
    /* ================================================================ */
    sporeRate: 120, // spores per second leaking while it holds
    sporeSize: 0.05,
    sporeLife: 1.8,
    sporeGlow: 3,
    puffSize: 1.1,
    puffLife: 2.6,
    puffOpacity: 0.42,
    chunkSize: 0.12,
    chunkLife: 1.2,
    colorSporeA: '#ffffe0',
    colorSporeB: '#e4ff6a',
    colorSporeC: '#9ccc1e',
    colorSporeD: '#2e4206',
    colorPuffA: '#c8d870',
    colorPuffB: '#94a648',
    colorPuffC: '#5e6a2e',
    colorPuffD: '#2c3018',
    colorChunkA: '#d8dcae',
    colorChunkB: '#a4ac70',
    colorChunkC: '#6c7438',
    colorChunkD: '#30341a',

    /* ================================================================ */
    /* 8 · THE CAGED                                                     */
    /* ================================================================ */
    infest: 0.9, // 0..1 how far a caged body is overgrown
    infestTime: 1.4, // seconds it takes
    hitImpulse: 7, // m/s a body is blown outward at the burst
    hitLift: 6,
    hitSpin: 1.8,
    colorInfestBody: '#3a4218',
    colorInfestRim: '#c8f040',
    infestRimGlow: 2.4,
    colorInfestEdge: '#f4ffb0',
    infestEdgeGlow: 3.4,
    infestEdgeWidth: 0.06
  }
};
