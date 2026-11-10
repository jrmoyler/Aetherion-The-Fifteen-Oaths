/**
 * Graviton Collapse — Gravity — a well that drags everything in, then crushes it.
 *
 * Collective Originals data block: presentation (`meta`) and the live settings
 * the ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 *
 * Every metre, second and colour below is read by the ability *every frame*,
 * so dragging any of them while a well is standing re-shapes that well.
 */
export default {
  id: 'graviton',
  meta: {
    label: "Graviton Collapse",
    accent: '#c48bff',
    key: 'V',
    hint: "Gravity — a well that bends the floor, drags everything in, then crushes it",
    cast: 'zone',
    glyph: `<circle cx="50" cy="50" r="8"/><ellipse cx="50" cy="50" rx="36" ry="14"/><ellipse cx="50" cy="50" rx="22" ry="34" transform="rotate(35 50 50)"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 16, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 30, // how fast the seed flies to the circle, metres/second
    lifetime: 2.2, // seconds the well stands and pulls before it collapses
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 3.2, // the circle the aim indicator measures out, metres
    fadeTime: 1.1, // seconds from the collapse until the last of it is gone

    /* --- where the seed is thrown from and hangs --- */
    handForward: 0.6, // metres in front of the caster the seed is gathered
    handSide: 0.25, // metres to the caster's right
    handHeight: 1.45, // metres off the floor at the hand
    coreHeight: 1.7, // metres the open well's core hangs above its funnel

    /* ================================================================ */
    /* 1 · THE CORE                                                      */
    /* ================================================================ */
    coreRadius: 0.42, // radius of the black core once the well is open, metres
    seedSize: 0.45, // the travelling seed, × coreRadius
    openTime: 0.45, // seconds for the well to open to full size
    coreWobble: 0.05, // how much the core's surface boils, × its radius
    coreRimGlow: 3.2, // brightness of the hot limb around the black
    coreRimPower: 3.0, // how thin that limb is — higher is a finer line
    coreSwirl: 2.4, // rad/s the streaks circulate round the limb
    corePulse: 0.06, // breathing of the core's size, × its radius
    corePulseRate: 5.5, // breaths per second

    /* ================================================================ */
    /* 2 · THE ACCRETION DISC                                            */
    /* ================================================================ */
    discRadius: 2.1, // outer radius of the disc, metres
    discInner: 1.35, // inner edge, × coreRadius — the innermost stable orbit
    discTilt: 0.38, // radians the disc is tipped off the floor
    discYaw: 0.6, // radians it is turned about the vertical, off the cast line
    discSpin: 5.5, // rad/s the inner edge turns
    discShear: 1.5, // ω ∝ r^-shear: how much faster inner gas laps outer gas
    discBands: 7.0, // concentric bands across the disc
    discNoise: 0.75, // turbulence breaking the bands up, 0..1
    discNoiseScale: 2.6, // features around one lap
    discHotEdge: 7.0, // how fast the white-hot inner edge falls off into the body
    discBeaming: 0.75, // Doppler asymmetry: how much brighter the approaching side is
    discBrightness: 3.4, // emissive gain into bloom
    discOpacity: 0.95,
    discSoftFade: 0.35, // metres it feathers where it cuts through bodies / floor
    discFling: 1.6, // at the collapse the disc is flung out to × this radius

    /* ================================================================ */
    /* 3 · THE LENS                                                      */
    /* ================================================================ */
    lensReach: 6.0, // half-width of the warp, × coreRadius
    lensStrength: 1.4, // how hard the frame is bent toward the core
    lensPinch: 1.0, // radial share of the bend
    lensSwirl: 0.55, // tangential share — space wound round with the disc
    lensFalloff: 0.32, // how fast the bend dies away from the limb, × the quad
    lensRipple: 0.18, // inward-travelling ripples through the warp

    /* ================================================================ */
    /* 4 · THE FUNNEL — the floor, sunk                                  */
    /* ================================================================ */
    wellReach: 1.45, // lip of the funnel, × zoneRadius
    wellDepth: 1.6, // metres the floor sinks at the axis
    wellThroat: 1.1, // radius at which it is half as deep, metres — narrow is a pit
    wellLift: 0.012, // metres the lip sits above the floor (z-fight guard)
    wellDepthBias: 0.05, // metres above the floor the funnel's depth is written at
    wellTwist: 2.2, // radians the radial grid lines are wound at the axis
    wellSpin: 1.1, // rad/s that winding keeps turning
    wellSpokes: 28, // radial grid lines
    wellRingSpacing: 0.42, // metres between concentric grid lines
    wellLineWidth: 0.035, // grid line half-width, fraction of one cell
    wellFlow: 0.55, // m/s the concentric lines drain into the throat
    wellGridGlow: 0.35, // brightness of the grid
    wellHotGlow: 2.2, // the core's light pooling at the bottom of the throat
    wellShade: 0.75, // how dark the throat gets, 0..1
    wellGrain: 0.55, // stone grain in the funnel's surface
    wellFeather: 0.22, // fraction of the lip feathered into the stage floor
    wellOpacity: 1.0,
    wellBounce: 0.45, // after the collapse the floor overshoots *up* by this, × depth
    wellBounceRate: 13.0, // rad/s of that spring
    wellSettle: 4.5, // how fast it settles flat again
    wellGripDeepen: 0.3, // the funnel sinks this much further (× depth) as the well feeds over the hold
    wellHorizon: 1.25, // the black event horizon at the bottom of the throat, × wellThroat
    wellHorizonGrow: 0.5, // how much it widens over the hold (crushed tight again at the end)
    wellPhotonGlow: 1.5, // the thin hot ring hugging the horizon
    wellPhotonWidth: 0.09, // its width, × horizon radius
    wellArms: 3, // log-spiral arms of matter wound into the funnel
    wellArmTight: 1.8, // how tightly they wind toward the axis
    wellFieldSpin: 1.3, // rad/s the arms turn (faster down the throat)
    wellFieldFlow: 0.7, // how fast the streaks drain down the throat
    wellFieldContrast: 1.7, // arm vs. gap contrast
    wellFieldGlow: 2.3, // brightness of the lensing field (drives the four-stop ramp)
    wellRipple: 0.3, // inward-travelling gravity ripples through the field
    wellOcclude: 0.97, // sunk floor seen past the near lip (× lip) is hidden by the real floor in front

    /* ================================================================ */
    /* 5 · THE INFALL — particles spiralling into the well               */
    /* ================================================================ */
    debrisRate: 70, // stone chips/s torn off the floor at the lip
    debrisSize: 0.11,
    debrisLifetime: 1.5, // seconds for one chip to spiral all the way in
    debrisSwirl: 2.8, // rad/s they orbit at
    debrisInfall: 0.95, // 0..1 how far the orbit collapses over their life
    debrisHeight: 0.12, // metres off the floor they skate at
    moteRate: 160, // glowing dust/s drawn into the core
    moteSize: 0.06,
    moteLifetime: 1.1,
    moteSwirl: 4.2,
    moteInfall: 1.0,
    moteShell: 1.25, // the shell they are born on, × zoneRadius
    hazeRate: 22, // ground haze/s rolling into the lip
    hazeSize: 1.1,
    hazeLifetime: 1.8,
    hazeSwirl: 1.4,
    hazeOpacity: 0.55,
    trailRate: 120, // dust/s shed by the seed in flight

    /* ================================================================ */
    /* 6 · THE GRIP — what happens to the bodies                         */
    /* ================================================================ */
    pullReach: 1.15, // bodies caught within this × zoneRadius
    pullSpeed: 2.2, // m/s a standing body is dragged inward at full grip
    pullSwirl: 1.6, // m/s it is wound round the axis
    pullWindUp: 0.55, // seconds for the grip to take full hold
    pullHuddle: 0.95, // metres from the axis they are dragged no closer than
    bodyLift: 0.55, // metres a held body is levitated off the floor at the huddle
    corpsePull: 3.5, // m/s a body already down is dragged inward
    corpseGrab: 3.0, // how hard a corpse is matched to the current, 1/s
    corpseBuoy: 0.35, // 0..1 of a corpse's weight the well carries
    throwImpulse: 9.5, // m/s bodies leave the collapse at, outward
    throwLift: 6.0, // m/s up
    throwSpin: 1.6, // torque on the throw
    crushTime: 0.35, // seconds before the collapse the core starts to crush

    /* ================================================================ */
    /* 7 · THE COLLAPSE                                                  */
    /* ================================================================ */
    shockRadius: 7.5, // metres the shockwave ring races out to
    shockLife: 0.75,
    burstRadius: 4.2, // the pressure shell's end radius, metres
    burstLife: 0.55,
    burstIntensity: 0.45, // brightness of the air shell — kept low so the collapse never whites out the frame
    ejectaCount: 140, // stone thrown outward
    ejectaSpeed: 11,
    ejectaSize: 0.13,
    ejectaLifetime: 1.4,
    sparkCount: 180, // streaks of light thrown outward
    sparkSpeed: 16,
    sparkSize: 0.07,
    sparkLifetime: 0.6,
    blastDustCount: 70,
    blastDustSpeed: 5.5,
    blastDustSize: 1.3,
    blastDustLifetime: 1.5,
    implodeMotes: 140, // the inrush in the crush window
    collapseFlash: 0.3, // screen flash at the collapse
    openFlash: 0.25, // smaller flash as the well opens
    openShake: 0.25,
    collapseShake: 0.85,
    holdRumble: 0.05, // continuous camera rumble while it stands
    travelRumble: 0.02,
    scorchRadius: 2.4, // the scar left in the floor, metres
    scorchLife: 6.0,

    /* --- light --- */
    lightColor: '#b58aff',
    lightIntensity: 6,
    lightRadius: 9,
    lightPulse: 0.35, // how much the light breathes with the core
    collapseLight: 6, // light punch at the collapse

    /* --- palette --- */
    colorCore: '#000000',
    colorCoreRim: '#b78cff',
    colorDiscHot: '#fff4ec',
    colorDiscMid: '#b874ff',
    colorDiscCool: '#6a3cff',
    colorWellBase: '#14111c',
    colorWellDeep: '#030207',
    colorWellGrid: '#6b3fd0',
    colorWellBody: '#5019b8',
    colorWellTint: '#a983ff',
    colorWellHot: '#f3e0ff',
    colorFlash: '#e7d4ff',
    colorShockHot: '#d8c4ff',
    colorShockBody: '#9d6bff',
    colorScorch: '#0d0a14',
    colorScorchEmber: '#5a2ea8',
    colorDebrisA: '#3a3346',
    colorDebrisB: '#2a2433',
    colorDebrisC: '#1d1825',
    colorDebrisD: '#120f18',
    colorMoteA: '#ffffff',
    colorMoteB: '#d9b8ff',
    colorMoteC: '#8f5cff',
    colorMoteD: '#3a1a7a',
    colorHazeA: '#2a2238',
    colorHazeB: '#1f1a2a',
    colorHazeC: '#17131f',
    colorHazeD: '#0d0b12',
    colorSparkA: '#ffffff',
    colorSparkB: '#ffd6f4',
    colorSparkC: '#b07cff',
    colorSparkD: '#4a20a0'
  }
};
