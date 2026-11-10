/**
 * Impact Dividend — settings block. Data only, no imports.
 *
 * Force, zone cast. "Bank blocked impulse": a forged pressure slug is lobbed
 * at the circle; when it lands six lamellar bulwark petals of dark forged
 * bronze heave out of the floor and close round it. The landing blow is
 * *blocked* — its shock ring runs out and is reeled back into the slug — and
 * every enemy inside is *deposited* (held, unharmed). The bank then
 * compounds: `compoundBeats` times, every `compoundInterval` seconds, the
 * petals ratchet tighter, one band of lamellae lights, the slug compresses
 * and the balance grows by `interestRate`. Then the dividend is paid: the
 * petals blow open flat, the slug detonates, and every depositor is thrown
 * with the banked impulse.
 *
 *   balance multiplier = min(maxMultiplier,
 *       (1 + depositBonus · (deposits − 1)) · (1 + interestRate) ^ beats)
 *
 * Gameplay keys are grouped under "the bank"; everything else is
 * presentation. Every key is a live editor slider read every frame.
 */
export default {
  id: 'impactDividend',
  meta: {
    label: 'Impact Dividend',
    accent: '#ffd1a3',
    element: 'force',
    cast: 'zone',
    hint: 'Force — bulwark petals close over the landing and bank its blocked impulse; it compounds, then pays out to everyone caught inside',
    glyph: '<path d="M50 88L22 70Q14 40 30 16Q40 36 50 40Q60 36 70 16Q86 40 78 70Z"/><path d="M50 40V88M36 58H64"/><circle cx="50" cy="56" r="7"/>',
  },
  settings: {
    /* --- the cast itself --- */
    range: 16, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 18, // how fast the slug flies, metres/second
    cooldown: 6, // seconds before the ability can be armed again
    castAnim: 'cast2', // which clip in `CAST_ANIMATIONS` the body throws
    lifetime: 3.8, // nominal screen time; the real clock is the bank below
    zoneRadius: 3.2, // radius of the bank (deposits, petals, crater), metres

    /* --- light --- */
    lightColor: '#ffc792',
    lightIntensity: 6,
    lightRadius: 12,
    landLight: 6, // light punch when the slug lands
    beatLight: 3, // light punch on every compound beat
    payoutLight: 14, // light punch when the dividend is paid

    /* ================================================================ */
    /* THE BANK (gameplay)                                              */
    /* ================================================================ */
    compoundStart: 0.32, // seconds after landing before the first beat
    compoundBeats: 3, // how many times the balance compounds
    compoundInterval: 0.36, // seconds between beats
    payoutDelay: 0.15, // seconds after the last beat before the payout
    afterPayout: 0.85, // seconds the open petals lie before the exit
    interestRate: 0.25, // growth of the balance on every beat
    depositBonus: 0.12, // extra principal per additional depositor
    maxMultiplier: 3, // cap on the banked multiplier
    lateDeposits: true, // bodies entering the circle on a beat are banked too
    hitImpulse: 6, // principal impulse (× multiplier, capped at 24)
    hitLift: 3, // principal lift (× multiplier, capped at 20)
    hitSpin: 1.6, // tumble on the payout
    baseDamage: 1, // UCSM damage before the multiplier

    /* ================================================================ */
    /* 0 · ANTICIPATION + THE SLUG                                      */
    /* ================================================================ */
    handHeight: 1.35, // where the slug leaves the hand, metres
    travelArc: 1.8, // apex of the lob above the line, metres
    slugSize: 0.36, // slug radius in flight, metres
    slugSpin: 9, // tumble in flight, rad/s
    trailRate: 70, // streaks per second off the slug in flight
    chargeTime: 0.18, // seconds the slug swells at the hand before it flies at full size

    /* ================================================================ */
    /* 1 · THE BULWARK PETALS (hero, solid)                             */
    /* ================================================================ */
    petalCount: 6, // petals round the bank (≤ 8)
    petalSeat: 0.86, // hinge radius, × zoneRadius
    petalHeight: 1.2, // petal height, × zoneRadius
    petalWidth: 0.95, // base width, × the arc a petal owns
    petalThick: 0.16, // shell thickness, metres
    riseTime: 0.26, // seconds to heave out of the floor
    riseOvershoot: 0.18, // inward overshoot on closing (rad)
    closedLean: 0.36, // inward lean when closed (rad)
    ratchetStep: 0.07, // extra inward lean per compound beat (rad)
    ratchetDrop: 0.06, // petals are pressed into the floor per beat (× height)
    ratchetSpring: 14, // ring-out frequency of a ratchet click (Hz)
    openTime: 0.32, // seconds to blow open at the payout
    openLean: -1.32, // lean when blown open (rad, negative = outward)
    sinkTime: 0.6, // seconds to sink into the floor on the exit (× fade)
    bronzeColor: '#4a3a33', // forged metal
    bronzeMetalness: 0.82,
    bronzeRoughness: 0.38,
    seamGlow: 3.2, // brightness of the lit lamella seams
    innerGlow: 1.4, // the slug's light on the petals' inner faces
    hammerGrain: 0.6, // hammered-metal grain in the surface

    /* ================================================================ */
    /* 2 · THE CORE (the banked impulse)                                */
    /* ================================================================ */
    coreSize: 0.62, // core radius when banked, metres
    coreHeight: 1.25, // core hovers at, metres
    coreCompress: 0.13, // core shrinks by this fraction per beat
    coreGlow: 2.4, // crack glow
    coreFresnel: 1.6, // rim
    coreCrackScale: 3.2, // crack cells across the core
    coreChurn: 1.5, // how fast the cracks crawl

    /* ================================================================ */
    /* 3 · THE CRATER (floor)                                           */
    /* ================================================================ */
    craterGlow: 1.6,
    craterDark: 0.78, // how strongly the crater darkens the floor
    craterTerraces: 5, // pressure terraces from rim to centre
    craterCracks: 1, // weight of the hot radial cracks
    dissolveTime: 0.7, // fraction of the fade spent dissolving

    /* ================================================================ */
    /* 4 · THE LEDGER RING (shock that runs out, in, out)               */
    /* ================================================================ */
    ringOutTime: 0.14, // seconds the landing ring runs out before it is held
    ringReelTime: 0.26, // seconds to reel it back into the core
    ringBeatTime: 0.24, // seconds an inward deposit ring takes per beat
    ringPayoutTime: 0.45, // seconds the payout ring runs out
    ringPayoutReach: 1.9, // payout ring reaches, × zoneRadius
    ringWidth: 0.09, // ring band width, fraction of radius
    ringGlow: 2.4,

    /* ================================================================ */
    /* 5 · PARTICLES                                                    */
    /* ================================================================ */
    sparkCount: 26, // seam sparks per beat
    sparkSize: 0.07,
    sparkLife: 0.55,
    sparkSpeed: 5.5,
    debrisCount: 46, // chips heaved up at the landing
    debrisSize: 0.16,
    debrisLife: 1.1,
    debrisSpeed: 6,
    payoutDebris: 80, // chips thrown at the payout
    inflowRate: 60, // dust drawn inward per second while banking
    inflowSize: 0.38,
    inflowLife: 0.7,
    particleGravity: -9, // gravity on sparks and chips
    colorSparkA: '#fff6ea', // spark / chip lifetime gradient
    colorSparkB: '#ffd1a3',
    colorSparkC: '#d27a4a',
    colorSparkD: '#24100c',
    colorDustA: '#d9c2ae', // inflow dust gradient
    colorDustB: '#8f7563',
    colorDustC: '#4a372d',
    colorDustD: '#1a0e0a',

    /* ================================================================ */
    /* 6 · IMPACT + PAYOUT (the world answers)                          */
    /* ================================================================ */
    landShake: 0.35, // camera knock at the landing (blocked: short)
    beatShake: 0.12, // knock per compound beat
    payoutShake: 0.75, // knock at the payout
    shakeDecay: 7,
    shakeFrequency: 22,
    landFlash: 0.06,
    payoutFlash: 0.16,
    burstReach: 1.5, // payout shell reaches, × zoneRadius
    burstLife: 0.55,
    burstIntensity: 0.6,
    burstOpacity: 0.35,
    decalLife: 3.5, // crack / scorch decals last, seconds

    /* ================================================================ */
    /* 7 · DISTORTION                                                   */
    /* ================================================================ */
    lensPull: 0.55, // inward pull while banking
    lensShock: 1.2, // outward pressure ring at the payout

    /* --- palette (four-stop ramp) --- */
    coreColor: '#fff6ea', // white-hot core
    tintColor: '#ffd1a3', // pale force peach
    bodyColor: '#d27a4a', // forged copper heat
    deepColor: '#24100c', // scorched deep
  },
};
