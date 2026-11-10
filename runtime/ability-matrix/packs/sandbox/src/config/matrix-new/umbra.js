/**
 * Umbra Grasp — Shadow — a hand of darkness that drags its target under.
 *
 * Matrix New data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * Every metre, second and colour below is read by the ability *every frame*,
 * so dragging any of them while the hand is standing re-shapes that hand —
 * including its fingers mid-grasp.
 */
export default {
  id: 'umbra',
  meta: {
    label: "Umbra Grasp",
    accent: '#6a30c0',
    key: 'R',
    hint: "Shadow — a pool of living dark; a hand rises out of it, closes, and drags its target under",
    cast: 'zone',
    glyph: `<path d="M30 84V52C30 44 38 44 38 52V36C38 28 46 28 46 36V30C46 22 54 22 54 30V36C54 28 62 28 62 36V58L70 50C76 44 82 50 76 56L60 78C56 82 52 84 46 84Z"/><path d="M18 90C30 84 70 84 82 90"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 14, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 16, // how fast the puddle of shadow races to the circle, metres/second
    lifetime: 2.4, // seconds from landing until the hand has dragged its catch under
    cooldown: 0.5, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 2.2, // the circle the aim indicator measures out, metres
    fadeTime: 1.2, // seconds for the hand to dissolve and the pool to drain
    colorA: '#2a1040', // the travelling puddle's trail, core
    colorB: '#6a30c0', // ... and its glow
    travelPool: 0.45, // radius of the racing puddle, metres
    trailRate: 90, // smoke puffs / second shed by the racing puddle
    trailSize: 0.55, // size of those puffs
    trailLife: 0.9, // seconds they hang over the floor

    /* --- the beats of the grasp, seconds after the puddle lands --- */
    poolTime: 0.45, // the pool spreads to full size over this
    riseDelay: 0.25, // the hand starts to break the surface
    riseTime: 0.55, // ... and is fully risen after this
    riseOvershoot: 0.1, // how far past its height it surges, × the hand
    closeDelay: 1.0, // the fingers start to close
    closeTime: 0.32, // ... and are shut after this
    anticipation: 0.3, // radians the fingers flex *open* just before they close
    dragDelay: 1.4, // the hand starts to sink back into the pool
    dragTime: 0.9, // ... and has gone under after this
    dragDepth: 2.6, // metres the hand sinks by — enough to take the fist under
    dissolveStart: 0.55, // how far into the drag the hand starts to smoke away, 0..1
    dragDissolve: 0.45, // how much of it has gone to smoke by the end of the drag

    /* ================================================================ */
    /* 1 · THE POOL OF LIVING DARK                                       */
    /* ================================================================ */
    poolRadius: 1.2, // radius, × zone radius
    poolEdgeNoise: 0.28, // how ragged the edge is, × the radius
    poolEdgeScale: 2.4, // lobes around the edge
    poolFeather: 0.05, // edge softness, metres
    poolTendrils: 1.0, // tendril strength, 0 = none
    poolTendrilCount: 11, // tendrils around the rim
    poolTendrilLength: 0.65, // how far they reach past the edge, × the radius
    poolTendrilWidth: 0.11, // root width of a tendril, metres
    poolWrithe: 0.7, // how much they squirm
    poolSwirl: 0.45, // radians of twist in the ink, per metre from the middle
    poolSwirlScale: 1.6, // features per metre in the ink
    poolSpin: 0.35, // rad/s the ink turns
    poolRim: 2.6, // violet glow along the edge
    poolRimWidth: 0.09, // metres that glow reaches inward
    poolVeins: 1.1, // faint violet veins in the ink
    poolVeinScale: 2.2, // vein features per metre
    poolDepth: 0.85, // how black the middle goes — the hole the hand comes out of
    poolOpacity: 0.97,
    poolHeight: 0.012, // metres above the floor
    drainTime: 0.85, // the pool drains over this fraction of the fade
    colorPoolInk: '#030106', // the ink itself
    colorPoolDeep: '#140824', // the lighter swirls in it
    colorPoolRim: '#9b5cff', // edge glow
    colorPoolVein: '#5a22b0', // veins

    /* ================================================================ */
    /* 2 · THE HAND                                                      */
    /* ================================================================ */
    handScale: 1.6, // everything below, × this — 1.6 stands the claw ~3.4 m, over the bodies it takes
    wristHeight: 0.5, // metres off the floor the wrist stands once risen
    forearmLength: 2.4, // metres of forearm — most of it below the surface
    forearmRadius: 0.34, // metres
    palmLength: 0.72, // wrist to knuckles, metres
    palmWidth: 0.68, // metres across the knuckles
    palmThickness: 0.24, // metres front to back
    fingerLength: 1.0, // metres, the middle finger
    fingerRadius: 0.1, // metres at the knuckle
    fingerTaper: 0.72, // tip radius × knuckle radius
    fingerSpread: 0.24, // radians the fingers splay when open
    thumbLength: 0.72, // metres
    openReach: 0.32, // radians the fingers bend *back* when open — a claw, not a wave
    curlAmount: 1.0, // 0 = the fingers barely close, 1 = a fist
    curlJoint1: 0.95, // radians at the knuckle when shut
    curlJoint2: 1.2, // radians at the middle joint
    curlJoint3: 1.0, // radians at the last joint
    wristCurl: 0.35, // radians the wrist folds forward as the hand closes
    emergeCurl: 0.4, // how curled the fingers are as they first break the surface, 0..1
    handBack: 0.5, // metres beyond the target the palm stands, so the fingers come *over* it
    handLean: 0.2, // radians the hand leans toward the caster
    handSway: 0.07, // radians it sways while it stands
    handSwayRate: 1.3, // sways per second
    seekTarget: 0.85, // 0 = rise at the circle's middle, 1 = rise right under the body

    /* --- the hand's look --- */
    handOpacity: 1.0, // density of the dark body
    handErode: 0.28, // how much noise eats into the silhouette (low: a solid black mass, torn only at the edge)
    handErodeScale: 2.0, // erosion features per metre
    handFlow: 0.65, // metres/second the smoke texture climbs
    handBillow: 0.05, // metres the surface boils in and out
    handSoftness: 0.45, // how far in from the silhouette the body is solid
    handRim: 1.15, // violet glow along the silhouette — a line, not a wash
    handRimPower: 3.4, // how thin that glow is
    handInnerGlow: 0.45, // embers of violet inside the smoke (few: the hand eats light)
    handVeinScale: 2.6, // ember features per metre
    hazeInflate: 0.09, // metres the soft smoke shell stands off the solid hand
    hazeDensity: 0.7, // opacity of that shell (dark smoke, thickens the mass)
    hazeSoftFade: 0.3, // metres it feathers where it meets the floor or a body
    handDissolveEdge: 0.14, // width of the burning edge as it dissolves
    handEdgeGlow: 4.0, // brightness of that edge
    colorHandBody: '#040207', // the dark
    colorHandDeep: '#0e0519', // the swirl in it
    colorHandGlow: '#8a4dff', // rim and embers
    colorHandEdge: '#d4b4ff', // the dissolving edge

    /* ================================================================ */
    /* 3 · THE GRIP                                                      */
    /* ================================================================ */
    grabReach: 1.0, // bodies inside × zone radius are taken
    gripPull: 9.0, // m/s the fist hauls a body toward itself, per metre of gap
    gripStrength: 7.0, // how hard it is held — the share of the gap closed per second
    gripBuoyancy: 1.0, // 0..1 how much of its weight the hand carries
    consumeDepth: 0.7, // metres under the floor before a body is gone
    stain: 2.0, // how fast the shadow stains a held body, per second
    holdImpulse: 0.8, // m/s — a body seized is folded, not thrown
    holdLift: 0.6,
    holdSpin: 0.4,

    /* --- the ink sleeve: the pool climbs each held body and drags it under (presentation only) --- */
    sleeveRadius: 0.42, // metres round the throat
    sleeveFlare: 1.4, // how far the base spreads into the pool, × radius
    sleeveReach: 1.6, // metres — the most it climbs a held body
    sleeveMin: 0.35, // metres — the collar left as the body goes under
    sleeveOverlap: 0.5, // metres it climbs past the body's hips
    sleeveRise: 0.22, // seconds to surge up once the drag starts (× global lifetime)
    sleeveClose: 0.5, // seconds to close over a body once it is gone (× global lifetime)
    sleeveRagged: 0.35, // how deep the bites in its top edge go, × height
    sleeveTendrils: 5, // tongues of ink round the top
    sleeveWrithe: 0.25, // how much the lip sways, × radius
    sleeveFlow: 0.8, // how fast the ink pours down it
    sleeveRim: 0.9, // violet rim glow
    sleeveLip: 1.8, // violet glow along the ragged top
    colorSleeveInk: '#030106',
    colorSleeveDeep: '#1a0b30',
    colorSleeveRim: '#9b5cff',
    look: {
      color: '#0b0614', // the flesh, gone to shadow
      rimColor: '#9b5cff',
      rimEmissive: 1.8,
      edgeColor: '#d8bcff',
      edgeEmissive: 4.0,
      edgeWidth: 0.06
    },

    /* ================================================================ */
    /* 4 · SMOKE & MOTES                                                 */
    /* ================================================================ */
    smokeRate: 70, // wisps / second off the hand and the pool's rim
    smokeSize: 0.85,
    smokeLifetime: 1.6,
    smokeRise: 0.6, // upward drift
    smokeSpeed: 0.5, // initial speed off the surface
    smokeOpacity: 0.8,
    smokeTurbulence: 0.6,
    dissolveSmoke: 140, // extra wisps / second while the hand dissolves
    colorSmokeA: '#1c0c30',
    colorSmokeB: '#0c0616',
    colorSmokeC: '#06030b',
    colorSmokeD: '#020104',
    moteRate: 55, // violet motes / second
    moteSize: 0.07,
    moteLifetime: 1.4,
    moteSpeed: 0.8,
    moteRise: 0.9,
    colorMoteA: '#f2e2ff',
    colorMoteB: '#b37dff',
    colorMoteC: '#6a30c0',
    colorMoteD: '#1a0838',

    /* ================================================================ */
    /* 5 · THE SINKING WARP                                              */
    /* ================================================================ */
    warpStrength: 0.9, // how hard the frame is pulled down into the pool
    warpScale: 1.5, // warp features per metre
    warpSpeed: 0.7, // how fast it pours downward
    warpSink: 1.0, // downward share of the bend, against the swirl
    warpHeight: 3.4, // metres of air above the pool that are bent
    warpWidth: 1.0, // width, × the pool's diameter

    /* ================================================================ */
    /* 6 · BEATS                                                         */
    /* ================================================================ */
    landShake: 0.2,
    gripShake: 0.45,
    dragShake: 0.35,
    dragRumble: 0.3, // continuous rumble while it drags
    gripFlash: 0.3,
    colorFlash: '#4a1f88',
    burstRadius: 2.0, // metres the grip's pressure shell reaches
    burstLife: 0.6,
    colorBurstA: '#2a0f4a',
    colorBurstB: '#7a40e0',
    colorBurstC: '#e0ccff',
    stainLife: 6, // seconds the shadow stain lingers on the floor
    stainIntensity: 0.8,
    colorStain: '#07030d',

    /* --- light --- */
    lightColor: '#6a30c0',
    lightIntensity: 6,
    lightRadius: 9,
    gripLight: 14 // light punch when the fingers close
  }
};
