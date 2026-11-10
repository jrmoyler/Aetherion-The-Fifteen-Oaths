/**
 * Predatory Canopy — Nature, zone cast. A seed pod flies to the circle and
 * bursts into a carnivorous canopy hung over it: branches, leaves, hanging
 * vines and a root snare drawn on the floor. It waits. The first living body
 * to step inside the snare wakes it — the warning ring races in, thorns stab
 * up, the vines lash down — and the nearest target is struck once.
 *
 * Expansion candidate data block: presentation (`meta`) and the live settings
 * the ability and its editor folder read. Plain data, no imports. Gated by
 * `../status.js` — candidates are never exposed by the production shell.
 *
 * Every dimension, time and colour below is resolved per frame by
 * `PredatoryCanopyAbility`, so dragging any of it reshapes a canopy already
 * hanging. The gameplay keys (`zoneRadius`, `armDelay`, `triggerWindup`,
 * `lifetime`, `hit*`) decide who is struck and when.
 */
export default {
  id: 'exp-predatory-canopy',
  uid: 'matrix-expansion/predatory-canopy',
  meta: {
    label: 'Predatory Canopy', element: 'nature', accent: '#86dc62', cast: 'zone', key: '',
    hint: 'An overhead canopy watches the ground, then lashes the first target that enters its roots.',
    glyph: '<path d="M12 35Q50 0 88 35M18 35Q20 76 34 82M82 35Q80 76 66 82M50 25V72M35 50Q50 62 65 50"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 18, // metres/second the seed pod flies
    cooldown: 8, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4, // radius of the root snare, metres — the strike reach

    /* --- light (rides the pod, then hangs under the canopy) --- */
    lightColor: '#b7ff8a',
    lightIntensity: 5,
    lightRadius: 9,

    /* --- particles (pooled, shared systems) --- */
    leafRate: 12, // leaves/second drifting down from the canopy (×3.5 while it wakes)
    moteRate: 22, // pollen motes/second
    leafSize: 0.13, // leaf particle size, metres

    /* ================================================================ */
    /* 1 · THE CANOPY — crown, branches, leaves, vines                   */
    /* ================================================================ */
    canopyHeight: 2.9, // metres the crown stands over the floor (reads whole at the 8 m camera)
    canopySpread: 4, // metres the branches reach (4 = authored size)
    trunkScale: 1.2, // girth of the braided trunk; its root flare reaches ≈ 0.6 × this
    seedScale: 2, // size of the travelling seed pod
    retreatStrength: 0.8, // how far the canopy draws in as it withers, 0..1
    dropDistance: 1.5, // metres it sinks as it withers

    /* --- timing --- */
    armDelay: 0.55, // seconds after landing before the snare can trigger
    triggerWindup: 0.32, // seconds from a body entering to the lash
    thornLength: 1.5, // metres the floor thorns stab up
    thornRing: 0.75, // metres from the snared body the thorn cage stands
    thornGlow: 1.6, // sap burning in the thorn points
    strikeReach: 0.7, // the lashing vines whip in from this far out on the canopy, × canopySpread
    bindHold: 0.45, // seconds the vines stay coiled round the body after the lash
    bindRadius: 0.38, // metres the bind coil wraps out from the body's centre
    bindHeight: 1.3, // metres the coil climbs
    strikeWidth: 0.2, // radius of each lashing vine at the canopy, metres (tapers to the tip)
    strikeDuration: 0.6, // seconds the vines take to withdraw after the hit

    lifetime: 6, // seconds the canopy hangs (× settings.global.lifetime)
    fade: 1.1, // seconds it takes to wither (× settings.global.lifetime)

    /* --- the hit --- */
    hitImpulse: 5, // knockback
    hitLift: 2, // upward share
    hitSpin: 1, // tumble

    /* --- palette --- */
    barkColor: '#365423', // wood, pod husk, lashing vines
    leafColor: '#18440f', // leaves (lit body), falling leaves
    leafRim: '#d1ff82', // leaf rim and veins, pod glow, pollen
    rootColor: '#a9eb6a', // root snare, sap, vine veins

    /* --- leaves --- */
    leafFlutter: 1, // how much the leaves flutter
    leafVariegation: 0.5, // blotching across each leaf
    leafDeep: '#061104', // near-black green: undersides and the stem end of each leaf
    leafDeepFloor: 0.7, // even the lit face keeps this much of the deep stop
    leafDeepAmount: 0.85, // how far the underside / stem fall to the deep stop
    leafEdgeStart: 0.86, // |across| where the lit margin starts
    leafEdgeGlow: 1, // the lit margin (leafRim)
    leafBristle: 1, // how hard they curl when the trap wakes
    leafSpeed: 0.55, // metres/second the falling leaves drift
    leafLifetime: 1.7, // seconds a falling leaf lives
    moteSize: 0.07, // pollen size
    moteSpeed: 0.2, // pollen drift
    moteLifetime: 1.2, // seconds

    /* --- bark --- */
    barkRidge: 1, // bark furrow scale
    barkMoss: 0.6, // moss on the upward faces
    mossColor: '#5f8a2e',
    crownSpin: 0.12, // radians/second the crown slowly turns
    tendrilCurl: 0.42, // radians the vines swing in as the trap wakes

    /* --- the seed pod --- */
    seedHeight: 1.2, // metres off the floor it flies
    seedSpin: 3, // radians/second it turns
    seedGlow: 1.4, // light leaking from its seams
    runnerWidth: 0.07, // radius of the runner vine trailing the pod back to the hand, metres
    runnerArc: 0.5, // metres it sags/bows between hand and pod
    runnerHeight: 1.2, // metres off the floor it leaves the caster
    runnerFade: 0.6, // seconds it takes to wither once the pod lands

    /* ================================================================ */
    /* 0 · THE MAW — the pitcher that hangs under the crown and bites    */
    /* ================================================================ */
    mawScale: 1.15, // metres of bulb; the jaws hang about as far again
    mawOffset: 1.3, // metres out from the trunk it hangs, on the caster's side
    stalkLength: 0.3, // metres it hangs below the crown
    stalkWidth: 0.11, // stalk radius, metres
    mawOpen: 1.15, // radians the jaws gape through the windup
    mawBite: 0.5, // metres off the floor the jaw tips close at
    mawLunge: 0.14, // seconds the lunge onto the body takes
    mawRetract: 0.8, // seconds it takes to haul itself back up after the bind
    mawLean: 0.55, // radians it leans into the lunge
    mawWindReach: 0.12, // how far it swings toward the body during the windup (the lunge covers the rest)
    mawRear: 1.1, // metres it rears back toward the caster (and up) through the windup, so the lunge is a long plunge
    mawRearLift: 0.25, // × mawRear, how far up it rears
    mawPop: 0.3, // swells this much as the jaws slam shut (visual only)
    mawPopTime: 0.25, // seconds the swell takes to settle after the lunge
    mawGlow: 1.5, // gullet glow
    mawColor: '#5a7a22', // waxy outer skin (veins and shade fall to the deep stop)
    mawGullet: '#d8304e', // the blood-red gullet and the fresnel rim of the maw
    mawCore: '#ffc070', // hot core of the gullet ramp

    /* ================================================================ */
    /* 2 · THE SNARE — the root sigil and the dappled shade              */
    /* ================================================================ */
    rootGlow: 0.55, // emissive gain of the snare
    rootCount: 12, // root lobes round the snare
    shadeOpacity: 0.45, // how dark the leaf shadow is
    shadeScale: 1, // leaf-shadow fleck size
    shadeColor: '#0d1608',

    /* ================================================================ */
    /* 3 · THE LASH — vines, splinters, snap                             */
    /* ================================================================ */
    strikeArc: -0.7, // metres the lashing vines bow (negative = they swoop low across the snare, under the leaves)
    strikeGlow: 1.8, // vein glow along the vines
    splinterBurst: 26, // wood splinters thrown from the struck body
    splinterSize: 0.07, // metres
    splinterSpeed: 4, // metres/second
    splinterLifetime: 0.9, // seconds
    colorSplinterA: '#e7f5b0', // birth
    colorSplinterB: '#7aa043', // early
    colorSplinterC: '#3d5524', // late
    colorSplinterD: '#1a2410', // death
    strikeLeaves: 18, // leaves torn loose at the hit
    shedLeaves: 40, // leaves shed as the canopy withers
    snapWarp: 0.8, // strength of the air-snap distortion (× global distortion)
    snapRadius: 2.4, // metres it runs out to
    snapDuration: 0.45, // seconds

    /* ================================================================ */
    /* 4 · THE BEATS                                                     */
    /* ================================================================ */
    unfurlShake: 0.1, // trauma as the canopy bursts open (× explosionIntensity)
    landFlash: 0.06, // screen flash as the pod hits the floor
    landBurst: 0.6, // AIR burst radius at landing, × zoneRadius
    landDecal: 1, // dust ring at landing, × zoneRadius
    windupRumble: 0.35, // rumble while the trap winds up
    strikeShake: 0.3, // trauma on the lash
    strikeFlash: 0.18, // screen flash on the lash
    strikeLight: 9, // light punch on the lash
    flashColor: '#d8ffb0'
  }
};
