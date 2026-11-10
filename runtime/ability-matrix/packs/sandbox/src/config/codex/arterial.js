/**
 * Arterial Whip — Blood — a beaded artery pays out of the caster's wrist,
 * arches overhead and is slammed down the line.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 *
 * Every dimension below is resolved per frame by `ArterialWhipAbility`, so
 * dragging any of it in the editor re-shapes a vessel already in the air.
 */
export default {
  id: 'arterial',
  meta: {
    label: 'Arterial Whip',
    accent: '#ff2a4a',
    key: '',
    element: 'blood',
    hint: 'Blood — an artery pays out of the wrist, arches overhead and slams down the line, spraying blood',
    cast: 'line',
    glyph: `<path d="M18 78C20 40 40 18 60 22C76 26 82 44 88 82"/><circle cx="30" cy="40" r="4"/><circle cx="46" cy="25" r="4"/><circle cx="64" cy="24" r="4"/><circle cx="78" cy="38" r="4"/><path d="M84 86L90 74M88 88L96 82M80 88L78 96"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 27, // how fast the vessel pays out down the line, metres/second
    lifetime: 1.5, // seconds the spatter takes to dry and fade
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#ff3a4e',
    lightIntensity: 8, // the light rides the tip
    lightRadius: 9,
    lightFlicker: 0.4, // 0..1 how much it pulses with the blood

    /* ================================================================ */
    /* 1 · THE WOUND                                                     */
    /* ================================================================ */
    handForward: 0.5, // metres in front of the caster the wrist is
    handSide: 0.25, // metres to the right
    handHeight: 1.5, // metres off the floor
    woundSize: 0.5, // radius of the bloom round the wrist, metres
    woundGlow: 0.8,
    woundOpen: 0.12, // seconds the wrist takes to open
    colorWoundCore: '#ffd8dc',
    colorWoundHalo: '#e0102c',

    /* ================================================================ */
    /* 2 · THE VESSEL — shape                                            */
    /* ================================================================ */
    rootRadius: 0.26, // thickness at the wrist, metres
    tipRadius: 0.09, // thickness at the tip, metres
    taper: 0.9,
    segmentLength: 0.34, // metres per bead
    pinch: 0.2, // how hard the joints between beads pinch in
    tipHeight: 1.1, // metres off the floor the tip runs at while it pays out
    arch: 3.2, // metres the vessel arches up over the caster's head
    waveAmp: 0.45, // metres of the vertical wave rolling down it
    waveLength: 3.6,
    waveSpeed: 13, // radians/second
    sway: 0.35, // a little sideways sway, metres

    /* ================================================================ */
    /* 3 · PULSE & FLESH                                                 */
    /* ================================================================ */
    pulseRate: 2.6, // pulses per second pumped hand → tip
    pulseSpacing: 2.4, // metres between pulses
    pulseSwell: 0.4, // how far a pulse swells the beads
    pulseGlow: 0.85, // blood glowing through the wall as a pulse passes (bloom > 1)
    wallGlow: 0.06, // resting glow through the wall
    capillaryScale: 3.2,
    capillaries: 0.7,
    wetness: 1.6, // wet specular
    rimGlow: 0.18,
    dissolveEdge: 0.06,
    colorVesselDeep: '#140105',
    colorVesselBody: '#460712',
    colorVesselHot: '#e8182e',
    colorVesselRim: '#c8182c',
    colorCapillary: '#3a0410',

    /* ================================================================ */
    /* 4 · THE SLAM                                                      */
    /* ================================================================ */
    snapTime: 0.16, // seconds the arch takes to come over and down
    slamDepth: 0.6, // how far past straight it is driven (lays it flat)
    slamSweep: 0.12, // seconds it takes to land hand → tip
    holdTime: 1.55, // seconds it lies on the floor, writhing, pulsing, the head striking
    recoilTime: 0.65, // seconds it takes to reel back into the wrist
    recoilSlack: 0.8,
    recoilWave: 1.8,
    travelRumble: 0.06,
    slamShake: 0.55,
    shakeDuration: 0.4,
    slamFlash: 0.04, // kept tiny: the punch is the local tip glow + light, not a red screen
    slamLight: 2.6, // light punch, × lightIntensity
    colorFlash: '#ff3a50',

    /* --- the linger: it lies there alive --- */
    writheAmp: 0.3, // metres of sideways serpentine while it lies
    writheLength: 3.4, // metres per serpentine wave
    writheSpeed: 6.5, // radians/second the serpentine crawls hand -> tip
    writheIn: 0.22, // seconds after the slam it comes alive
    lieThicken: 1.45, // × its radius while it lies, swollen with pooled blood
    rearHeight: 2.1, // metres the torn head rears off the floor
    rearFrom: 0.5, // share of the length from which the head rears
    rearRate: 0.95, // strikes per second
    restrikeDrops: 55, // blood thrown by each strike of the head
    restrikeRing: 1.7, // metres, the ring each strike throws (0 = none)
    restrikeShake: 0.1,

    /* ================================================================ */
    /* 5 · RUPTURE                                                       */
    /* ================================================================ */
    ruptureDrops: 220, // the fan of blood thrown off the tip
    ruptureSpeed: 9, // m/s
    ruptureSize: 3.6, // the ring of bent air, metres
    ruptureTime: 0.35,
    ruptureWarp: 1.3,
    splashSize: 2, // the splash dome, metres
    shockRadius: 5,
    colorSplashA: '#ff3a4c',
    colorSplashB: '#d01a30',
    colorSplashC: '#4a0410',
    colorShockA: '#ff2a44',
    colorShockB: '#ff6a7a',

    /* ================================================================ */
    /* 6 · SPLATTER                                                      */
    /* ================================================================ */
    strokeWidth: 0.7, // half-width of the smear the vessel leaves, metres
    spatterSpread: 1.6, // metres the spatter is flung either side
    spatterScale: 0.32, // spatter cell size, metres
    spatterDensity: 0.42,
    spatterFling: 2.2, // how stretched the far drops are
    splatterGloss: 1.2,
    splatterSheen: 0.3,
    splatterOpacity: 0.95,
    splatterMist: 18, // mist puffs per second off the drying spatter
    poolGrow: 1.5, // the smear spreads to × (1 + this) its width while wet
    poolTime: 1.1, // seconds the pool takes to spread
    poolFlow: 0.45, // m/s the wet sheen runs down the line
    poolPulse: 0.35, // fresh blood welling in the pool with each beat
    colorSplatterFresh: '#7a0816',
    colorSplatterDark: '#2a0208',
    colorSplatterDry: '#2e1610',

    /* ================================================================ */
    /* 7 · BLOOD                                                         */
    /* ================================================================ */
    spurtRate: 180, // droplets per second off the joints as it pays out
    lieSpurts: 220, // per second while it lies on the floor
    slamDrops: 160, // kicked up all along the line by the slam
    dropSize: 0.055,
    dropSpeed: 5,
    dropLife: 0.85,
    dropGravity: 14,
    dropStretch: 0.3,
    dropGlow: 0.9,
    sprayStretch: 0.2,
    sprayGlow: 2.6,
    mistSize: 0.5,
    mistLift: 0.7,
    mistLife: 1.5,
    mistOpacity: 0.35,
    colorDropA: '#e0283c',
    colorDropB: '#c8142c',
    colorDropC: '#760614',
    colorDropD: '#36020a',
    colorSprayA: '#ffd4da',
    colorSprayB: '#ff4c60',
    colorSprayC: '#c0102a',
    colorSprayD: '#400208',
    colorMistA: '#8a1020',
    colorMistB: '#5e0a16',
    colorMistC: '#3a060e',
    colorMistD: '#1e0306',

    /* ================================================================ */
    /* 8 · HITS                                                          */
    /* ================================================================ */
    hitWidth: 1.0, // metres either side of the line the slam catches
    hitImpulse: 4.5, // m/s shoved off the line
    hitLift: 8, // m/s slammed up
    hitSpin: 1.8,
    tipZone: 2.2, // metres from the end that the rupture launches
    tipImpulse: 14,
    tipLift: 7,
    wounded: 0.6, // 0..1 how stained a hit body is
    bleedTime: 1.6,
    bleedDrops: 40,
    woundedRimGlow: 2,
    colorWoundedBody: '#3a0c10',
    colorWoundedRim: '#ff2a40'
  }
};
