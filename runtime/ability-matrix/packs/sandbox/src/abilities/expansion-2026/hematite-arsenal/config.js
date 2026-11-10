/**
 * Hematite Arsenal — Blood, zone cast. Data only, no imports.
 *
 * Bounded vitality weapons. The caster bleeds a fixed measure of vitality
 * into a knot of blood at the hand, and it congeals into an *arsenal* — a
 * greatsword, a spear and a falx-glaive, twice over, in polished hematite
 * with blood running in their fullers. They fly tip-first to the target and
 * slam into the floor in a ring. Then they fight on their own: one at a time
 * a weapon rips itself out, turns on an enemy, lunges through it and comes
 * back to its socket. Every strike spends a fixed share of the vitality the
 * weapon was forged with — the blood drains out of its fuller as it does —
 * and a weapon with nothing left rusts and crumbles where it struck. Whatever
 * vitality is not spent melts back into the pool when the arsenal leaves.
 *
 * Gameplay keys (`zoneRadius`, `vitality`, `weaponCount`, `strikeDamage`,
 * `strikeStart`, `strikeGap`, the strike motion times and the hit force) are
 * read when a strike is launched or lands and are pinned by tests; every
 * other key is presentation, resolved every frame.
 */
export default {
  id: 'hematiteArsenal',
  meta: {
    label: 'Hematite Arsenal',
    accent: '#d0283c',
    element: 'blood',
    cast: 'zone',
    hint: 'Blood — forge a bounded arsenal of hematite weapons from your vitality; they plant round the target and lunge on their own until the blood in them is spent',
    glyph:
      '<path d="M50 8L56 22V62H44V22Z"/><path d="M34 62H66M50 62V84M44 90A6 6 0 0 0 56 90"/><path d="M20 30L28 70M80 30L72 70M16 28L24 24L28 32M84 28L76 24L72 32"/>',
  },
  settings: {
    /* --- the cast itself --- */
    range: 14, // max range (m) — the capture lands at minRange + 0.7·(range − minRange)
    minRange: 2,
    speed: 22, // the arsenal flies to the target at (m/s)
    cooldown: 6,
    castAnim: 'cast3',
    zoneRadius: 3.2, // radius the weapons guard and strike inside (m)
    lifetime: 4, // nominal cast length, for the HUD (s)

    /* --- the vitality (gameplay) --- */
    vitality: 6, // total damage the whole arsenal may ever deal — the bound
    weaponCount: 6, // weapons forged from it (≤ 8); each carries vitality / weaponCount
    strikeDamage: 0.5, // damage one strike deals — and the vitality it spends
    strikeStart: 0.3, // first weapon rips out this long after landing (s)
    strikeGap: 0.13, // the next weapon follows this much later (s)
    ripTime: 0.14, // a weapon tears out of the floor and turns on its target over (s)
    lungeTime: 0.1, // and drives through it over (s) — the hit lands at the end
    holdTime: 0.1, // stays run through the body (s)
    returnTime: 0.24, // flies back to its socket over (s)
    hitImpulse: 9, // knockback along the lunge (× explosion intensity)
    hitLift: 4.5,
    hitSpin: 2.4,

    /* --- light --- */
    lightColor: '#ff3446',
    lightIntensity: 5,
    lightRadius: 10,
    impactLight: 6, // light punch when the arsenal lands (× explosion intensity)
    strikeLight: 2.2, // light punch on every strike

    /* --- palette: the four-stop blood ramp --- */
    coreColor: '#ffe3dc', // white-hot core of living blood
    tintColor: '#ff5a62', // pale tint
    bodyColor: '#c0102a', // saturated body
    deepColor: '#2a0309', // dark deep — clotted, grounds it on the floor

    /* --- 1 · the forge (anticipation at the hand) --- */
    forgeTime: 0.32, // weapons congeal over the caster before they fly (s)
    forgeHeight: 1.45, // height of the blood knot at the hand (m)
    forgeReach: 0.45, // and how far ahead of the caster (m)
    knotSize: 0.22, // radius of the blood knot (m)
    knotGlow: 2.4,
    knotChurn: 1.2, // how hard its surface boils
    fanRadius: 1.25, // weapons hang in a fan this wide over the caster (m)
    fanHeight: 2.35, // centre height of the fan (m)
    fanSpread: 2.3, // angular spread of the fan (rad)
    fanBack: 0.5, // fan sits this far behind the caster (m)

    /* --- 2 · the flight (travel) --- */
    flightArc: 2.6, // apex of each weapon's arc above the straight line (m)
    flightStagger: 0.28, // fraction of the travel the last weapon waits before leaving
    flightSpin: 0.6, // turns about its own axis on the way (rev)

    /* --- 3 · the weapons (hero, solid hematite) --- */
    weaponScale: 1.6, // whole weapon size
    ringSeat: 0.8, // sockets sit at this fraction of zoneRadius
    plantDepth: 0.4, // how deep a tip is driven into the floor (m)
    lean: 0.24, // pommels lean outward by (rad)
    seatJitter: 0.18, // angular jitter of the sockets (rad, × randomness)
    quiver: 0.07, // sway a planted weapon settles with (rad)
    quiverRate: 19, // its frequency (rad/s)
    metalColor: '#5d5a63', // polished hematite
    metalSheen: '#5a1218', // the red under-sheen of the iron oxide
    metalness: 0.78,
    roughness: 0.3,
    rustColor: '#6b2a14', // spent weapons oxidise to
    rustRoughness: 0.9,
    fullerGlow: 3.6, // blood in the fuller — its level is the weapon's vitality
    fullerFlow: 1.4, // how fast it runs along the channel
    edgeGlow: 1.4, // hot rim on the cutting edges while vitality remains
    rimGlow: 1.1, // wet red fresnel rim of the polished iron (reads it against the dark floor)
    formGlow: 3, // molten glow while a weapon congeals and on landing

    /* --- 4 · the strike --- */
    hoverHeight: 1.9, // a weapon rears this high before it lunges (m)
    hoverInset: 0.25, // and this far toward the centre (× zoneRadius)
    strikeHeight: 1.05, // it drives through the body at this height (m)
    pierce: 0.55, // and passes through it by (m)
    returnArc: 0.9, // arc of the flight back to the socket (m)
    crumbleTime: 0.55, // a spent weapon rusts away over (s)
    streakWidth: 0.42, // the lunge streak (m)
    streakGlow: 2.2,
    streakLife: 0.32, // the streak lingers after the hit (s)
    woundColor: '#5c0612', // stain on a body that took a strike
    woundRim: '#ff2a3a',
    woundEmissive: 0.8,

    /* --- 5 · the pool (floor) --- */
    poolReach: 1.08, // the blood pool spreads to (× zoneRadius)
    poolGrow: 0.45, // and takes this long to spread (s)
    poolGlow: 1.2,
    poolSheen: 1.6, // wet specular on the blood
    poolVeins: 1, // rivulets from each socket to the centre
    poolRipple: 1, // ring a striking weapon throws into the pool
    dryTime: 0.7, // the pool crusts over to dried hematite over (× fade)
    crustColor: '#3a1410',

    /* --- 6 · particles --- */
    sprayCount: 26, // blood droplets per strike
    spraySize: 0.09,
    sprayLife: 0.7,
    spraySpeed: 3.4,
    sprayGravity: 7,
    landSpray: 14, // droplets thrown up at each socket on landing
    rustCount: 30, // rust flakes when a weapon crumbles
    rustSize: 0.08,
    rustLife: 1.1,
    rustSpeed: 1.6,
    mistRate: 26, // blood mist motes drawn into the knot / rising off the pool (per s)
    mistSize: 0.16,
    mistLife: 0.9,
    sparkGlow: 1.4,
    colorSprayA: '#ffd9d2',
    colorSprayB: '#ff4553',
    colorSprayC: '#9a0a20',
    colorSprayD: '#24030a',
    colorRustA: '#c4683a',
    colorRustB: '#7a2e16',
    colorRustC: '#3e170c',
    colorRustD: '#140605',

    /* --- 7 · the landing --- */
    impactShake: 0.22, // (× explosion intensity; camera-shake global applies)
    shakeDecay: 7,
    shakeFrequency: 20,
    impactFlash: 0.1,
    strikeShake: 0.05, // small knock on every strike
    crackRadius: 0.75, // crack decal at each socket (m)
    decalLife: 3.2,
    shockwaveWidth: 0.07,
    burstReach: 0.75, // blood splash shell grows to (× zoneRadius)
    burstLife: 0.5,
    burstIntensity: 0.9,
    burstOpacity: 0.65,
    colorBurstA: '#ffb3b0',
    colorBurstB: '#c0102a',
    colorBurstC: '#2a0309',

    /* --- 8 · the lens --- */
    lensShock: 1, // pressure ring on landing (× global distortion)
    lensHaze: 0.25, // shimmer over the pool while the arsenal fights
    lensStrike: 0.6, // puff of pressure on every strike
  },
};
