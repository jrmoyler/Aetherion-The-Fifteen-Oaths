/**
 * Signal Jack — tech, zone cast. Data only, no imports.
 *
 * Hostile deployable takeover, in the sandbox's terms: the caster throws a
 * machined jack spike that drills into the floor, bites with four claw legs,
 * raises a jammer dish and strings armoured data cables onto the nearest
 * enemies. A jacked enemy is no longer the enemy's deployable — it is ours:
 * each one, on its own clock, turns and fires a turncoat bolt into the
 * nearest enemy that is *not* jacked. When the signal overloads, every jacked
 * body is blown off its feet away from the spike and the cables reel home.
 *
 * Every key below is a live editor control and is read every frame, so a
 * slider dragged mid-cast reshapes the standing rig on the next frame.
 * Gameplay keys: range, zoneRadius, maxJacks, jackAt, turn*, overload*, hit*.
 */
export default {
  id: 'signalJack',
  meta: {
    label: 'Signal Jack',
    accent: '#ff4fb4',
    element: 'tech',
    cast: 'zone',
    hint: 'Tech — drive a jack spike into the circle, cable the nearest enemies and turn them on their own side before the signal overloads',
    glyph:
      '<path d="M50 92L42 58H58Z"/><path d="M50 58V22"/><path d="M32 14Q50 30 68 14"/><path d="M42 66L20 80M58 66L80 80"/><path d="M50 26Q30 40 16 54M50 26Q70 40 84 54"/><circle cx="16" cy="56" r="5"/><circle cx="84" cy="56" r="5"/>',
  },
  settings: {
    /* --- the cast --- */
    range: 16, // maximum throw (m)
    minRange: 2, // closer than this the cast is refused (m)
    speed: 30, // the spike flies at (m/s)
    cooldown: 7, // seconds before it can be thrown again
    castAnim: 'cast2',
    zoneRadius: 4.5, // the jack's reach: who can be cabled (m)
    lifetime: 4.3, // nominal screen time, for the HUD (s)

    /* --- the takeover (gameplay) --- */
    maxJacks: 3, // enemies cabled at once (≤ 4)
    jackAt: 0.6, // s after the plant the cables fire
    cableStagger: 0.1, // s between successive cables
    cableTime: 0.26, // s a cable takes to reach its body
    turnAt: 1.2, // s after the plant the first jacked body fires
    turnStagger: 0.38, // s between turncoat shots
    turnRange: 7, // a jacked body fires at the nearest enemy within (m)
    turnDamage: 1, // damage per turncoat bolt (combat bridge)
    overloadAt: 2.45, // s after the plant the signal overloads
    overloadHold: 0.55, // s the rig stands after the overload, before the exit
    overloadDamage: 1, // damage to each jacked body at the overload
    hitImpulse: 9, // turncoat knockback (m/s, × explosion intensity)
    hitLift: 3.5,
    hitSpin: 2,
    overloadImpulse: 6, // overload throw, away from the spike
    overloadLift: 6.5,
    overloadSpin: 3,

    /* --- light --- */
    lightColor: '#ff4fb4',
    lightIntensity: 9,
    lightRadius: 11,
    plantLight: 6, // punch on the plant (× explosion intensity)
    turnLight: 3, // punch per turncoat bolt
    overloadLight: 10, // punch at the overload

    /* --- palette: one four-stop ramp, plus the metal --- */
    colorCore: '#fff0fb', // white-hot signal
    colorTint: '#ff8ad8', // pale magenta
    colorBody: '#e0177f', // saturated hijack magenta
    colorDeep: '#1c0614', // burnt-in deep
    metalColor: '#8a929e', // machined gunmetal
    metalDark: '#1b1d22', // anodised dark parts
    metalness: 0.88,
    roughness: 0.3,
    seamGlow: 2.2, // emissive seam strength on the metal (× glow)
    seamWidth: 0.06, // seam band width (fraction of its spacing)
    seamSpacing: 3.2, // seams per metre up the spike

    /* --- 1 · the spike (travel + plant) --- */
    spikeHeight: 2.7, // m from the floor to the mast socket
    spikeGirth: 1.9, // radius scale
    threadPitch: 0.16, // drill thread pitch (m)
    throwHeight: 1.5, // m: thrown from this height at the hand
    throwArc: 2.2, // m: extra height at the top of the throw
    throwScale: 0.55, // × size in flight
    drillSpin: 22, // rad/s it spins about its axis in flight
    driveDepth: 0.7, // m it overshoots above the floor and drives down from
    driveTime: 0.09, // s the final drive takes
    trailRate: 90, // sparks per second shed in flight

    /* --- 2 · the claws --- */
    legCount: 4,
    legShare: 0.36, // claw reach as a share of zoneRadius
    legThick: 2.4, // claw plate thickness scale
    legDeploy: 0.22, // s the claws take to spring out
    legFlex: 0.05, // rad the claws flex with each bolt (piston kick)

    /* --- 3 · the mast and dish --- */
    mastLift: 1.0, // m the mast telescopes up
    mastTime: 0.3, // s it takes
    dishSize: 1.0, // dish radius (m)
    dishPitch: 0.95, // rad it tips toward its target
    scanSpin: 9, // rad/s it sweeps before the jack
    slewRate: 9, // how fast it slews between targets (1/s)

    /* --- 4 · the cables --- */
    cableRadius: 0.1, // m
    cableSag: 0.3, // m of hang at mid-span
    cableWhip: 0.9, // m lateral lash while it flies
    cableSway: 0.12, // m idle sway during the linger
    swayRate: 2.4, // rad/s
    pulseRate: 3.2, // data pulses per second down each cable
    pulseGlow: 5, // emissive strength of the pulses
    reelTime: 0.35, // s the cables take to reel home in the exit
    jackHeight: 1.3, // m up the body the plug bites

    /* --- 5 · possession (on the jacked) --- */
    sheathRadius: 0.55, // m: scan sheath round the jacked body
    sheathHeight: 2.1, // m
    sheathGlow: 0.7,
    scanRate: 1.6, // sweeps per second down the body
    haloHeight: 2.25, // m: the takeover halo over the head
    haloSize: 0.55, // m radius
    haloSpin: 2.2, // rad/s

    /* --- 6 · turncoat bolt --- */
    boltWidth: 0.11, // m
    boltLife: 0.32, // s
    boltGlow: 3.2,

    /* --- 7 · the floor (intrusion field) --- */
    fieldReach: 1.08, // field radius × zoneRadius
    fieldSpread: 0.75, // s for the circuit traces to race out to the rim
    traceCell: 0.42, // m per circuit cell
    traceGlow: 1.6,
    deepOpacity: 0.78, // how dark the burnt-in footprint is
    reticleGlow: 1.8, // the landing reticle during the throw
    routeGlow: 2.4, // the bus routes to the jacked bodies

    /* --- 8 · particles --- */
    sparkCount: 70, // sparks at the plant
    sparkSize: 0.09,
    sparkLife: 0.45,
    sparkSpeed: 7,
    chipCount: 40, // floor and metal chips at the plant
    chipSize: 0.12,
    chipLife: 1.1,
    chipSpeed: 5,
    dustCount: 26, // grey dust puffed off the plant
    dustSize: 0.9,
    dustLife: 1.2,
    moteRate: 26, // data motes rising off the cables per second
    moteSize: 0.06,
    moteLife: 0.9,
    colorChipA: '#9aa2ad',
    colorChipB: '#5a616c',
    colorChipC: '#2a2d33',
    colorChipD: '#0d0e10',

    /* --- 9 · plant and overload --- */
    plantShake: 0.45, // (× explosion intensity × camera shake)
    plantFlash: 0.1,
    overloadShake: 0.6,
    overloadFlash: 0.08,
    shakeDecay: 6,
    shakeFrequency: 22,
    crackRadius: 1.5, // m CRACK decal round the spike
    decalLife: 5, // s the plant scars stay
    burstReach: 0.9, // overload STORM shell × zoneRadius
    burstLife: 0.55,
    burstOpacity: 0.55,
    lensStrength: 0.7, // EMP pressure ring (× global distortion)
    lensHum: 0.25, // heat shimmer round the spike while it runs

    /* --- 10 · exit --- */
    foldTime: 0.35, // s the claws fold back up
    sinkTime: 0.5, // s the spike takes to sink into the floor
    exitTime: 0.9, // s, whole exit
  },
};
