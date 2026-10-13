/**
 * Nightfall Scythe — Shadow — a spinning scythe blade of night reaps the line.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `NightfallScytheAbility`, so
 * dragging any of it in the editor re-shapes a blade that is already spinning.
 */
export default {
  id: 'nightfall',
  meta: {
    label: "Nightfall Scythe",
    accent: '#8a6cff',
    key: '',
    element: 'shadow',
    hint: "Shadow — a scythe blade of night spins down the line, reaps what it passes and draws their souls home",
    cast: 'line',
    glyph: `<path d="M20 88L56 30"/><path d="M56 30C64 14 82 12 92 22C80 20 68 26 62 38Z"/><path d="M30 24C26 32 28 42 36 46"/><circle cx="36" cy="22" r="1.5"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 20, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 17, // how fast the blade's hub runs the line, metres/second
    lifetime: 2.2, // seconds the stain and smoke linger after the blade is gone
    cooldown: 0.5, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#8a6cff',
    lightIntensity: 6, // the blade's steady violet glow
    lightRadius: 8,
    lightFlicker: 0.35, // 0..1 how much it gutters as the blade turns

    /* ================================================================ */
    /* 1 · THE BLADE                                                     */
    /* ================================================================ */

    /* --- silhouette (metres unless noted) --- */
    bladeHeight: 1.05, // height of the spin plane — waist height reaps a body
    bladeInner: 0.45, // radius of the heel, from the hub it turns about
    bladeReach: 2.7, // radius of the tip — also how wide the reaping is
    bladeCurve: 1.15, // radians the blade hooks forward from heel to tip
    bladeWidth: 0.95, // depth of the blade behind its cutting edge, at the heel
    bladeTaper: 0.85, // how fast it thins toward the point
    bladeHeel: 0.12, // fraction of the length over which the heel rounds off
    bladeDroop: 0.18, // metres the tip sags below the spin plane
    bladeTilt: 0.22, // radians the spin plane banks about the line
    spinSpeed: 2.3, // revolutions per second in flight
    spinDir: 1, // 1 or -1 — which way it turns
    formTime: 0.42, // seconds it takes to form behind the caster before it flies
    formBehind: 1.4, // metres behind the caster it forms
    formRise: 1.1, // metres it rises up out of the floor while forming
    windupSpin: 0.45, // revolutions per second while it is forming

    /* --- shading --- */
    edgeWidth: 0.055, // metres of the bright cutting line
    edgeGlow: 5.5, // brightness of that line (bloom > 1)
    edgeHalo: 0.9, // the soft glow just behind it
    bodyOpacity: 0.94, // the inky body
    nebula: 0.75, // violet swirls inside the black
    nebulaScale: 2.2, // swirl features per metre
    starDensity: 7, // star cells per metre
    starSize: 0.11, // radius of a star, in cells
    starChance: 0.55, // fraction of cells that hold a star
    starGlow: 3.2, // how bright the flecks are
    starTwinkle: 4, // twinkle speed
    smokeEdge: 0.42, // fraction of the blade's depth that is smoke at the back
    smokeScale: 2.6, // smoke features across the blade
    smokeFlow: 1.4, // how fast the smoke streams off the back
    rimGlow: 1.2, // extra glow when the blade is seen edge-on
    softFade: 0.35, // soft intersection with geometry, metres
    colorA: '#b48cff', // the cutting edge
    colorB: '#f4ecff', // the edge's white-hot core
    colorBody: '#06030d', // the blade's black
    colorNebula: '#2a1460', // the swirls in it
    colorStar: '#e9ddff', // the flecks

    /* ================================================================ */
    /* 2 · THE SWEEP                                                     */
    /* ================================================================ */
    trailArc: 2.6, // radians of arc the sweep trails behind the blade
    trailOpacity: 0.8,
    trailGlow: 2.0,
    trailEdge: 0.12, // width of the bright tip-path band, fraction of the radius
    trailFalloff: 1.7, // how fast the sweep fades behind the blade
    trailNoise: 0.7, // how smoky the sweep is
    trailScale: 2.4, // smoke features in the sweep
    colorTrail: '#4a2bb8', // the body of the sweep
    colorTrailEdge: '#c9adff', // the tip's path

    /* --- distortion --- */
    warpStrength: 0.9, // how hard the world bends through the sweep
    warpScale: 2.0, // noise features per metre
    warpSpeed: 2.2, // noise speed

    /* ================================================================ */
    /* 3 · BLACK SMOKE                                                   */
    /* ================================================================ */
    smokeRate: 200, // puffs/second off the blade's smoky back
    smokeSize: 0.75,
    smokeLifetime: 1.7,
    smokeOpacity: 0.68,
    smokeShed: 1.1, // m/s thrown off the back of the blade
    smokeRise: 0.35, // upward drift
    smokeDrag: 1.5,
    smokeTurbulence: 0.8,
    smokeWake: 55, // puffs/second left on the floor along the line
    colorSmokeA: '#2a1648',
    colorSmokeB: '#120a22',
    colorSmokeC: '#08050f',
    colorSmokeD: '#030206',

    /* ================================================================ */
    /* 4 · VIOLET MOTES                                                  */
    /* ================================================================ */
    moteRate: 170, // motes/second off the cutting edge
    moteSize: 0.075,
    moteLifetime: 1.3,
    moteSpeed: 1.3,
    moteRise: 0.55,
    moteGlow: 3.2,
    colorMoteA: '#f4ecff',
    colorMoteB: '#b48cff',
    colorMoteC: '#6a3fe0',
    colorMoteD: '#1a0d3a',

    /* ================================================================ */
    /* 5 · SHADOW STAIN                                                  */
    /* ================================================================ */
    stainStart: 0.5, // metres after the caster the stain begins
    stainWidth: 1.5, // half-width of the stain, metres
    stainEdgeNoise: 0.55, // how ragged its edge is
    stainEdgeScale: 0.7, // ragged features per metre
    stainOpacity: 0.86,
    stainRim: 0.14, // width of the violet rim, metres
    stainRimGlow: 2.0,
    stainStars: 3.5, // star cells per metre in the stain
    stainStarGlow: 2.2,
    stainHot: 3.0, // violet glow fresh behind the blade
    stainHotLength: 3.0, // metres that glow runs behind the blade
    stainCool: 1.1, // seconds the glow takes to die once the blade has gone
    stainErode: 0.7, // ragged fade at the end
    colorStainDeep: '#040208',
    colorStainMid: '#1a0d33',
    colorStainRim: '#8a6cff',
    colorStainStar: '#d9c8ff',

    /* ================================================================ */
    /* 6 · SOULS                                                         */
    /* ================================================================ */
    soulTime: 0.95, // seconds a soul takes to stream back to the hand
    soulArc: 1.8, // metres the stream arcs up on its way
    soulSway: 0.6, // metres it weaves side to side
    soulSize: 0.26, // the soul's head
    soulTrailRate: 110, // trail puffs/second per soul
    soulTrailSize: 0.11,
    soulTrailLife: 0.55,
    soulGlow: 3.6,
    soulBurst: 26, // motes when a soul is pulled out and when it arrives
    handHeight: 1.35, // where on the caster the souls go, metres
    soulLight: 0.6, // light punch when one arrives (× intensity)
    colorSoulA: '#ffffff',
    colorSoulB: '#d8ccff',
    colorSoulC: '#8f6cff',
    colorSoulD: '#2a1660',

    /* ================================================================ */
    /* 7 · THE REAPING                                                   */
    /* ================================================================ */
    sliceReach: 0.3, // metres past the tip a body is still reaped
    sliceImpulse: 3.6, // m/s the halves are thrown along the sweep
    sliceLift: 1.6, // m/s up
    sliceSpin: 1.2, // tumble
    hitSmoke: 32, // smoke puffs per body reaped
    hitShake: 0.22, // camera knock per body
    hitFlash: 0.12,

    /* ================================================================ */
    /* 8 · THE DISSOLVE                                                  */
    /* ================================================================ */
    dissolveTime: 0.75, // seconds the blade takes to come apart into smoke
    dissolveDrift: 2.4, // metres it drifts on past the target
    dissolveSpinDown: 0.65, // 0..1 how much it slows while dissolving
    dissolveSmoke: 160, // puffs thrown as it goes
    burstSize: 3.2, // the shell of night at the end, metres
    burstIntensity: 1.0,
    shockRadius: 5.5,
    impactShake: 0.34,
    shakeDuration: 0.45,
    impactFlash: 0.3,
    impactLight: 2.4, // light punch (× intensity)
    travelRumble: 0.1,
    castSmoke: 30, // smoke where the blade forms
    colorBurstA: '#d8c4ff',
    colorBurstB: '#6a3fe0',
    colorBurstC: '#120822',
    colorShockA: '#6a3fe0',
    colorShockB: '#e2d4ff',
    colorFlash: '#5a3aa8'
  }
};
