/**
 * Wraith Host — Shadow — a pool of shadow opens and its shades hunt the circle.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * Every beat below is a time on one clock that starts when the shadow reaches
 * the circle; `WraithHostAbility` resolves every wraith's position from these
 * values every frame, so dragging a timing or a radius re-flies a host that is
 * already in the air.
 */
export default {
  id: 'wraiths',
  meta: {
    label: "Wraith Host",
    accent: '#9fb4ff',
    key: '',
    element: 'shadow',
    hint: "Shadow — shades claw up out of a pool of night, circle wailing overhead, then dive through everyone inside",
    cast: 'zone',
    glyph: `<path d="M50 12C38 12 31 24 31 38L27 86L36 78L43 88L50 79L57 88L64 78L73 86L69 38C69 24 62 12 50 12Z"/><path d="M44 36L46 40"/><path d="M56 36L54 40"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 0, // closer than this and the cast is refused
    speed: 24, // how fast the shadow creeps to the circle, metres/second
    lifetime: 0.45, // seconds the pool holds open after the last shade is gone
    cooldown: 0.5, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4, // radius of the circle, metres — what the host can reach

    /* --- light --- */
    lightColor: '#9fb4ff',
    lightIntensity: 6,
    lightRadius: 8,
    lightHeight: 2.2, // metres above the pool the light hangs once it is open
    lightFlicker: 0.4, // 0..1 how much it gutters

    /* ================================================================ */
    /* 1 · THE POOL OF SHADOW                                            */
    /* ================================================================ */
    poolRadius: 1.05, // × zoneRadius
    poolOpenTime: 0.55, // seconds the pool takes to spread open
    poolCloseTime: 0.8, // seconds it takes to close at the end
    poolEdgeNoise: 0.22, // how fingered its edge is, × its radius
    poolEdgeScale: 3.0, // fingers around the rim
    poolFeather: 0.35, // metres of soft edge
    poolOpacity: 0.95,
    poolRoil: 1.0, // how much the darkness churns
    poolRoilScale: 0.55, // churn features per metre
    poolRoilSpeed: 0.35,
    poolSwirl: 0.6, // radians the darkness twists toward the middle
    poolDepth: 0.75, // how much darker the middle is
    poolRim: 0.12, // width of the pale rim, metres
    poolRimGlow: 1.6,
    poolHeight: 0.016, // metres above the floor (no z-fighting)
    colorPoolDeep: '#020205',
    colorPoolMid: '#0e1226',
    colorPoolSwirl: '#28305a',
    colorPoolRim: '#9fb4ff',

    /* --- runes --- */
    runeRadius: 0.78, // × the pool radius
    runeWidth: 0.34, // metres across the band of runes
    runeCount: 14, // runes round the ring
    runeStroke: 0.05, // stroke width, metres
    runeGlow: 3.0,
    runeIgnite: 0.7, // seconds for the runes to light round the ring
    runeSpin: 0.12, // radians/second the ring turns
    runeFlicker: 0.35, // 0..1 how much they waver
    colorRune: '#cfdcff',

    /* ================================================================ */
    /* 2 · THE WRAITHS                                                   */
    /* ================================================================ */
    wraithCount: 7, // shades in the host (up to 12)
    wraithScale: 1.3, // × a 1.7 m figure
    wraithScaleJitter: 0.18,

    /* --- shading --- */
    bodyOpacity: 0.2, // the translucent body
    fresnelPower: 2.8, // how tight the rim is
    rimGlow: 1.5, // brightness of the rim
    wispScale: 3.0, // wisp features down the cloak
    wispFlow: 1.2, // how fast they stream down it
    tatterDepth: 0.34, // how deep the ragged hem bites, fraction of the figure
    tatterScale: 5.0, // tatters round the hem
    hemFlare: 0.7, // how far the hem flares out
    flutter: 0.06, // metres the cloak billows
    trailPerSpeed: 0.12, // metres the hem trails per m/s of speed
    trailMax: 1.4, // longest trail, metres
    leanSpeed: 10, // m/s at which a shade flies head-first
    maxLean: 0.85, // 0..1 how far over it leans
    eyeGlow: 6, // the two points in the hood
    eyeSize: 0.026,
    eyeSeparation: 0.055,
    eyeHeight: 0.5, // metres above the figure's middle
    faceDark: 0.9, // how dark the hollow of the hood is
    softFade: 0.35,
    colorA: '#9fb4ff', // the rim
    colorB: '#ffffff', // the fray as a shade dissolves
    colorBody: '#2a3870', // the body's haze
    colorEye: '#d9f2ff',

    /* --- the rise --- */
    riseDelay: 0.3, // seconds after the pool opens before the first shade claws up
    riseStagger: 0.14, // seconds between shades
    riseTime: 0.95, // seconds to climb out to the circling height
    riseDepth: 1.6, // metres under the floor they start

    /* --- the circling --- */
    orbitRadius: 0.62, // × zoneRadius
    orbitHeight: 3.1, // metres
    orbitSpeed: 1.5, // radians/second round the circle
    orbitJitter: 0.25, // 0..1 how much each shade's path differs
    spiralTighten: 0.3, // 0..1 how much the circle closes before the dive
    spiralRise: 0.8, // metres the host climbs while it circles
    bobHeight: 0.35, // metres each shade bobs
    bobSpeed: 2.2,

    /* --- the wail --- */
    wailStrength: 1.2, // how hard the screams bend the air
    wailRings: 3, // rings in each scream
    wailSpeed: 1.4, // screams per second
    wailSize: 1.7, // × the orbit radius, how wide the distortion is
    wailEyes: 0.8, // eyes flare this much on each scream

    /* --- the dive --- */
    diveDelay: 2.5, // seconds after the pool opens the first shade dives
    diveStagger: 0.16, // seconds between dives
    diveTime: 0.8, // seconds from the top of the swoop to out the far side
    diveLoft: 1.0, // metres it climbs before it falls
    diveThrough: 1.8, // metres it carries on past the body
    diveExit: 1.6, // metres it swoops back up after
    chestHeight: 1.15, // where on a body a shade strikes, metres
    vanishTime: 0.9, // seconds a shade takes to dissolve upward after its dive
    vanishRise: 2.4, // metres it climbs as it goes

    /* ================================================================ */
    /* 3 · SMOKE                                                         */
    /* ================================================================ */
    smokeRate: 90, // puffs/second off every shade's hem
    smokeSize: 0.6,
    smokeLifetime: 1.4,
    smokeOpacity: 0.7,
    smokeRise: 0.45,
    smokeDrag: 1.6,
    smokeTurbulence: 0.7,
    poolSmoke: 70, // puffs/second boiling off the pool
    vanishSmoke: 70, // puffs each shade becomes as it dissolves
    colorSmokeA: '#2a3260',
    colorSmokeB: '#121630',
    colorSmokeC: '#07081a',
    colorSmokeD: '#020208',

    /* ================================================================ */
    /* 4 · MOTES & DRAINED LIFE                                          */
    /* ================================================================ */
    moteRate: 40, // pale motes/second off every shade
    moteSize: 0.06,
    moteLifetime: 1.2,
    moteSpeed: 0.8,
    moteGlow: 3,
    drainRate: 70, // streaks/second pulled out of a body being drained
    drainSize: 0.05,
    drainSpeed: 4.0,
    drainLifetime: 0.6,
    drainStretch: 0.5,
    drainGlow: 3.5,
    colorMoteA: '#ffffff',
    colorMoteB: '#cfdcff',
    colorMoteC: '#6f84d8',
    colorMoteD: '#151a3a',

    /* ================================================================ */
    /* 5 · THE DRAINING                                                  */
    /* ================================================================ */
    killReach: 1.0, // × zoneRadius — bodies a shade may choose
    hitImpulse: 1.2, // m/s along the dive — passed through, not thrown
    hitLift: 1.6, // m/s up
    hitSpin: 0.5,
    liftHeight: 0.75, // metres the body is lifted while it is drained
    liftGrip: 5.0, // how hard it is held there (per second)
    liftBuoyancy: 0.9, // 0..1 how much of its weight is carried
    drainTime: 1.1, // seconds the body is held and drained
    stain: 1.4, // how fast it darkens, per second
    look: {
      color: '#07080f', // the flesh, drained
      rimColor: '#9fb4ff',
      rimEmissive: 1.6,
      edgeColor: '#dbe6ff',
      edgeEmissive: 3.5,
      edgeWidth: 0.05
    },

    /* ================================================================ */
    /* 6 · BEATS                                                         */
    /* ================================================================ */
    openShock: 6.0, // radius of the shockwave as the pool opens, metres
    openShake: 0.25,
    openFlash: 0.2,
    riseShake: 0.06, // knock as each shade breaks the surface
    hitShake: 0.22, // knock as a shade passes through a body
    hitFlash: 0.14,
    hitBurst: 1.6, // pale shell where a shade passes through, metres
    hitLight: 1.8, // light punch per strike (× intensity)
    travelSmoke: 160, // puffs/second as the shadow creeps to the circle
    colorBurstA: '#e4ecff',
    colorBurstB: '#6f84d8',
    colorBurstC: '#0c1028',
    colorShockA: '#3a4a86',
    colorShockB: '#cfdcff',
    colorStainA: '#05060c', // the residue the pool leaves
    colorStainB: '#3a4a86',
    colorFlash: '#3a4a86'
  }
};
