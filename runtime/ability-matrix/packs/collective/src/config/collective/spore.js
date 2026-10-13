/**
 * Spore Bloom — Fungal — a bioluminescent bloom that bursts into spores.
 *
 * Collective Originals data block: presentation (`meta`) and the live settings
 * the ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 */
export default {
  id: 'spore',
  meta: {
    label: "Spore Bloom",
    accent: '#b6ff6a',
    key: 'Y',
    hint: "Fungal — a seed pod roots, glowing mushrooms burst into a corroding spore cloud",
    cast: 'zone',
    glyph: `<path d="M22 56C22 36 78 36 78 56Z"/><path d="M44 56V84M56 56V84"/><circle cx="30" cy="24" r="3"/><circle cx="50" cy="18" r="3"/><circle cx="70" cy="26" r="3"/>`
  },
  /**
   * Four beats: a seed pod is **lobbed** onto the circle, a mycelium network
   * **spreads** out of the impact across the floor, mushrooms **erupt** in
   * clusters wherever the network has reached, and their caps **puff** a spore
   * cloud that eats whatever is standing in it. Then the bloom wilts: caps
   * droop and sink, the veins go dark.
   *
   * Every mushroom record stores only dice (which cluster, where in it, size,
   * stagger). Metres and seconds are resolved from this block every frame, so
   * `zoneRadius`, `stemHeight` and `capRadius` re-shape a bloom already
   * standing — including while paused.
   */
  settings: {
    /* --- the cast --- */
    "range": 16,
    "minRange": 2,
    "speed": 14, // m/s the pod covers along the ground on its lob
    "lifetime": 5.0, // seconds the bloom stands after the pod lands
    "cooldown": 0.6,
    castAnim: "cast2",
    "zoneRadius": 3.4, // metres

    /* --- the seed pod (lob) --- */
    podSize: 0.22, // radius, metres
    podStretch: 1.45, // length ÷ width
    podArc: 3.2, // metres above the straight line at the top of the lob
    podLaunch: 1.4, // metres off the floor it leaves the hand at
    podSpin: 7, // radians/second tumble
    podGlow: 2.6, // emissive in its seams
    podVeinScale: 3.0,
    podPulse: 6, // pulse speed
    colorPodHusk: '#1d2416',
    colorPodVein: '#b6ff6a',
    colorPodHot: '#f4ffd0',
    podTrailRate: 90, // motes per second shed on the way
    landShake: 0.12,
    landFlash: 0.05,
    landBurst: 1.6, // spore shell end radius, metres
    colorLandA: '#d8ff9a',
    colorLandB: '#6fe04a',
    colorLandC: '#1d3a12',

    /* --- the mycelium (ground shader) --- */
    veinSpeed: 3.2, // m/s the network spreads out from the impact
    veinScale: 1.3, // cells per metre in the vein network
    veinWarp: 0.55, // domain warp — straight veins read as a grid
    veinWidth: 0.045, // metres
    veinTaper: 0.55, // how much thinner they are at the rim
    veinRadial: 0.65, // strength of the radial hyphae out of the centre
    veinSpokes: 11, // how many of those
    veinGlow: 3.2,
    veinNodes: 0.8, // glowing knots at the junctions
    veinPulse: 1.4, // brightness of the light pulses running outward
    veinPulseFreq: 0.9, // pulses per metre
    veinPulseSpeed: 1.6, // metres/second
    veinPulseSharp: 5.0,
    veinFront: 1.8, // brightness of the growing edge
    veinMoss: 0.55, // dark fungal stain under the network
    veinOpacity: 1.0,
    veinCore: 1.2, // the glowing heart where the pod rooted
    veinCoreSize: 0.22, // × zone radius
    veinDim: 0.85, // how far the veins dim while the bloom fades
    colorVein: '#7dff5a',
    colorVeinHot: '#e8ffc0',
    colorVeinDeep: '#1c6b3a',
    colorMoss: '#0a120c',

    /* --- the mushrooms --- */
    clusters: 7, // how many clumps (max 12)
    perCluster: 5, // mushrooms per clump (total max 96)
    clusterSpread: 0.85, // clump centres as a fraction of the circle
    clusterRadius: 0.45, // metres a clump spreads over
    clusterCentre: true, // one clump always stands on the impact point
    stemHeight: 0.55, // metres
    stemRadius: 0.05,
    capRadius: 0.24,
    capHeight: 0.15,
    sizeJitter: 0.45,
    heroScale: 1.8, // the middle mushroom of each clump is this much bigger
    growTime: 0.7, // seconds from bud to open cap
    growStagger: 0.45, // seconds of scatter inside a clump
    growOvershoot: 0.12, // cap snaps open past full size, then settles
    capTilt: 0.25, // radians each one leans out of its clump
    sway: 0.035, // metres of sway at the cap
    swaySpeed: 1.6,
    droop: 0.55, // how far the cap rim drops as it wilts, × its radius
    wiltLean: 0.35, // how far the stem bends over as it wilts, × its height
    sinkDepth: 0.6, // metres it sinks into the floor while fading
    roughness: 0.55,

    /* --- mushroom shading --- */
    capGlow: 0.6, // emissive over the cap top
    spotGlow: 2.6, // the luminous spots on the cap
    spotScale: 4.0,
    spotSize: 0.32,
    rimGlow: 2.2, // the bright band round the cap edge
    rimPower: 2.4, // fresnel power on that rim
    gillGlow: 3.6, // the underside
    gillCount: 22,
    stemGlow: 0.6,
    glowPulse: 0.35, // depth of the slow breathing
    glowPulseSpeed: 2.2,
    puffFlash: 2.0, // extra glow on a cap as it puffs
    colorCap: '#1d2a3a',
    colorCapTop: '#2b4a5a',
    colorSpot: '#b6ff6a',
    colorRim: '#6affd2',
    colorGill: '#a6ff4a',
    colorStem: '#cfe6d0',
    colorStemGlow: '#5affb0',

    /* --- the spore cloud --- */
    puffDelay: 0.25, // seconds after a cap opens that it first puffs
    puffJitter: 0.4,
    puffInterval: 1.4, // seconds between puffs while it stands
    puffSmoke: 10, // smoke puffs per cap per puff
    puffMotes: 26, // glowing motes per cap per puff
    puffSpeed: 1.2, // m/s up out of the cap
    driftRate: 40, // motes per second over the whole circle between puffs
    smokeSize: 0.7,
    smokeSpread: 3.2, // end size × start
    smokeLifetime: 2.6,
    smokeRise: 0.18,
    smokeOpacity: 0.42,
    smokeTurbulence: 0.9,
    colorSmokeA: '#a8d890',
    colorSmokeB: '#5c8a5a',
    colorSmokeC: '#2e4a3a',
    colorSmokeD: '#1a2622',
    moteSize: 0.055,
    moteLifetime: 2.4,
    moteRise: 0.25,
    moteTurbulence: 1.4, // curl swirl
    moteGlow: 2.6,
    colorMoteA: '#f2ffc8',
    colorMoteB: '#b6ff6a',
    colorMoteC: '#4affb8',
    colorMoteD: '#0e4a3a',

    /* --- hits --- */
    cloudReach: 1.1, // the cloud's kill radius, × zone radius
    killTime: 0.9, // seconds of exposure before a body drops
    stain: 1.4, // how fast the corrosion takes a whole body, per second
    rot: 0.35, // fraction of a corpse eaten per second once it is fully stained
    hitImpulse: 1.2, // m/s — a body choked by spores folds, it is not thrown
    hitLift: 0.6,
    hitSpin: 0.5,
    look: {
      color: '#0f1a12', // the flesh, rotted
      rimColor: '#7dff5a',
      rimEmissive: 1.6,
      edgeColor: '#d8ff9a',
      edgeEmissive: 3.2,
      edgeWidth: 0.05
    },

    /* --- fade --- */
    wiltTime: 1.6, // seconds for the bloom to wilt away
    wiltStagger: 0.5, // fraction of that spent staggering the wilt

    "lightColor": "#b6ff6a",
    "lightIntensity": 5,
    "lightRadius": 9,
    lightHeight: 1.2, // metres over the bloom the light sits
    lightPulse: 0.35 // how much the light breathes with the veins
  }
};
