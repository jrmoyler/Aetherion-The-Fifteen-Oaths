/**
 * Chain Arc — Lightning — a bolt that leaps from target to target.
 *
 * Collective Originals data block: presentation (`meta`) and the live settings
 * the ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 */
export default {
  id: 'chain',
  meta: {
    label: "Chain Arc",
    accent: '#8fb8ff',
    key: 'F',
    hint: "Lightning — a bolt that leaps from body to body, then grounds",
    cast: 'line',
    glyph: `<path d="M18 30L40 46L30 54L60 72L52 80L82 88"/><circle cx="18" cy="30" r="5"/><circle cx="82" cy="88" r="5"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18.0, // maximum cast distance, metres
    minRange: 3.0, // closer than this and the cast is refused
    speed: 34.0, // how fast the leader runs down the line, metres/second
    lifetime: 0.9, // seconds the last strike hangs in the air before the fade
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws
    fadeTime: 0.7, // seconds the whole web takes to crackle out

    /* --- where the bolt leaves the caster --- */
    handForward: 0.55, // metres in front of the caster
    handSide: 0.25, // metres to the caster's right
    handHeight: 1.35, // metres off the floor
    leaderHeight: 1.0, // height of the leader's head as it runs, metres

    /* ================================================================ */
    /* THE CHAIN                                                         */
    /* ================================================================ */
    captureRadius: 1.6, // a body this close to the running head is struck, metres
    jumpRange: 7.5, // how far a strike can leap to the next body, metres
    maxJumps: 5, // leaps after the first strike (capped at 8)
    jumpDelay: 0.16, // seconds between one strike landing and the next leaving
    strikeHeight: 0.58, // where on the body a bolt lands, × dummy height
    latch: 1.0, // 0..1 — how hard a lingering bolt follows the body it threw
    /** How a struck body flies. Same shape as `settings.dummies.hit`. */
    hit: { impulse: 5.2, lift: 4.6, spin: 2.2 },

    /* ================================================================ */
    /* 1 · BOLTS — the ribbon                                            */
    /* ================================================================ */

    /* --- the shape, rebuilt every crackle --- */
    segments: 34, // points along the main channel (capped at 40)
    jaggedness: 0.13, // wander of the channel, × its length
    jagMax: 1.4, // ...but never more than this many metres off the straight
    kink: 0.35, // high-frequency zig-zag, × one segment length
    branches: 4, // forks off the main channel (capped at 6)
    branchLength: 0.32, // a fork's length, × the channel length
    branchSegments: 10, // points along a fork (capped at 14)
    branchSpread: 0.85, // radians a fork leaves the channel at
    branchJag: 0.22, // a fork wanders more than the channel does
    crackleRate: 22, // re-strikes per second: the shape is re-rolled this often
    groundForks: 3, // extra forks that skate across the floor when it grounds

    /* --- the ribbon itself --- */
    coreWidth: 0.035, // white-hot core, metres either side of the channel
    glowWidth: 0.34, // full width of the glow, metres either side
    glowFalloff: 2.4, // >1 tightens the glow toward the core
    branchWidth: 0.6, // a fork's width at its root, × the channel's
    branchBright: 0.65, // a fork's brightness, × the channel's
    intensity: 4.2, // emissive multiplier — bloom picks this up
    opacity: 1.0,
    growTime: 0.06, // seconds for a strike to race from one end to the other
    headGlow: 2.2, // extra brightness on the racing head
    headLength: 0.12, // how much of the bolt the hot head covers, 0..1
    strikePunch: 1.6, // extra brightness the instant a strike lands
    punchWidth: 1.7, // how much wider the glow is on that instant
    decay: 9.0, // how fast the punch dies back, per second
    lingerLevel: 0.42, // brightness a strike settles at while it hangs
    boltLife: 1.3, // seconds a strike hangs on its own before it starts to go
    boltFade: 0.4, // seconds it takes to go (the fade phase takes the rest)
    flicker: 0.55, // 0..1 strobe on the whole ribbon
    flickerRate: 26, // strobes per second
    crackle: 1.0, // 0..1 how much it tears into pieces as it fades
    crackleScale: 18, // pieces per bolt when it does
    crawl: 0.45, // plasma crawling along the glow, 0..1
    crawlScale: 14, // crawl features per bolt
    crawlSpeed: 9, // and how fast they run
    colorCore: '#ffffff',
    colorGlow: '#8fb8ff',
    colorEdge: '#5a3cff',

    /* ================================================================ */
    /* 2 · SPARKS — streaks thrown off every strike                      */
    /* ================================================================ */
    sparkCount: 46, // per strike
    sparkSpeed: 9.0, // metres/second
    sparkSize: 0.05,
    sparkLife: 0.42, // seconds
    sparkGravity: -9.0,
    sparkDrag: 2.2,
    sparkStretch: 0.09, // how long a streak is per metre/second
    sparkGlow: 3.0,
    lingerSparkRate: 26, // per second, spat off the ends of the hanging bolts
    colorSparkA: '#ffffff',
    colorSparkB: '#cfe0ff',
    colorSparkC: '#8fb8ff',
    colorSparkD: '#3a2a9a',

    /* ================================================================ */
    /* 3 · MOTES — the ionised glow around the leader and the hits       */
    /* ================================================================ */
    moteRate: 140, // per second off the running leader
    moteSize: 0.16,
    moteLife: 0.38,
    moteSpeed: 1.2,
    moteRise: 0.6, // metres/second² upward
    moteGlow: 2.4,
    moteTurbulence: 1.2,
    strikeMotes: 30, // a puff of glow on every strike
    colorMoteA: '#ffffff',
    colorMoteB: '#a8c8ff',
    colorMoteC: '#6a7cff',
    colorMoteD: '#1a1040',

    /* ================================================================ */
    /* 4 · GROUND — burns and the grounding burst                        */
    /* ================================================================ */
    arcRadius: 1.4, // ARC burn under every struck body, metres
    arcLife: 1.6,
    arcWidth: 0.08,
    arcIntensity: 1.1,
    colorArcA: '#cfe0ff',
    colorArcB: '#5a3cff',
    groundArcRadius: 2.6, // the burn where the bolt grounds, metres
    groundBurst: 3.2, // STORM shell it throws, end radius, metres
    groundBurstLife: 0.5,
    groundBurstIntensity: 1.6,
    groundSparks: 90,
    colorBurstA: '#ffffff',
    colorBurstB: '#8fb8ff',
    colorBurstC: '#3a2a9a',

    /* ================================================================ */
    /* 5 · FEEDBACK                                                      */
    /* ================================================================ */
    lightColor: '#8fb8ff',
    lightIntensity: 7.0,
    lightRadius: 10.0,
    lightFlicker: 0.55, // 0..1 how hard the light gutters frame to frame
    strikeLight: 14.0, // light punch per strike
    strikeShake: 0.16,
    strikeFlash: 0.16,
    groundShake: 0.3,
    groundFlash: 0.28,
    castShake: 0.06,
    colorFlash: '#cfe0ff'
  }
};
