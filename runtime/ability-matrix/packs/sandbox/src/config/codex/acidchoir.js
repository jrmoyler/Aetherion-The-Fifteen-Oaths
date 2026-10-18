/**
 * Acid Choir — Poison — a font of acid sings walls of acid out across the
 * circle, one voice after another, and each one eats the stone it crosses.
 *
 * Elemental Codex data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports, so the settings
 * module can pull it in without a cycle.
 *
 * Every dimension below is resolved per frame by `AcidChoirAbility`, so
 * dragging any of it re-pitches a choir that is already singing.
 */
export default {
  id: 'acidchoir',
  meta: {
    label: 'Acid Choir',
    accent: '#d6ff4a',
    key: '',
    element: 'poison',
    hint: 'Poison — a font of acid sings rings of acid out across the circle, one voice after another, eating the stone',
    cast: 'zone',
    glyph: `<circle cx="50" cy="50" r="8"/><path d="M50 30C61 30 70 39 70 50C70 61 61 70 50 70C39 70 30 61 30 50C30 39 39 30 50 30Z" stroke-dasharray="6 4"/><path d="M50 14C70 14 86 30 86 50C86 70 70 86 50 86C30 86 14 70 14 50C14 30 30 14 50 14Z"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    zoneRadius: 4.6, // radius of the circle the choir sings over, metres
    speed: 20, // how fast the note runs along the floor to the circle, metres/second
    lifetime: 2, // seconds the etched floor takes to cool once the last voice dies
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws

    /* --- light --- */
    lightColor: '#e8ff80',
    lightIntensity: 7,
    lightRadius: 11,
    lightFlicker: 0.2,

    /* ================================================================ */
    /* 1 · THE FONT — the cantor in the middle                           */
    /* ================================================================ */
    fontSize: 0.75, // radius of the acid bulb, metres
    fontRise: 0.3, // seconds it takes to well up out of the floor
    fontHeave: 0.55, // how far it jumps on each note, × its size
    fontWobble: 0.22, // surface wobble, × its size
    fontGlow: 3.2,
    colorFontA: '#fbffd8',
    colorFontB: '#d6ff4a',
    colorFontC: '#4a6a0e',

    /* ================================================================ */
    /* 2 · THE VOICES — the walls of acid                                */
    /* ================================================================ */
    voices: 5, // walls sung, one after another
    interval: 0.3, // seconds between voices
    walkTime: 1.15, // seconds a voice takes to walk out to the edge
    walkCurve: 1.35, // >1 starts fast and slows as it spreads
    startRadius: 0.5, // metres from the middle a voice is born at
    reach: 1.05, // × zoneRadius, where it dies
    wallHeight: 1.25, // metres, the first voice
    heightStep: -0.12, // added per voice, × wallHeight (choir: high → low)
    harmonics: 3, // crest ripples on the first voice
    harmonicStep: 2, // added per voice
    crestAmp: 0.35, // ripple of the crest, × height
    curl: 0.35, // metres the crest curls outward
    crashAt: 0.72, // 0..1 of its walk when it starts to break
    wallOpacity: 0.72,
    wallGlow: 2,
    crestGlow: 4.5, // the foaming lip (bloom > 1)
    flowSpeed: 1.6, // streaks running down the face
    colorWallA: '#f4ffc8', // crest
    colorWallB: '#c8f040',
    colorWallC: '#5c8410',
    colorWallD: '#1c2806', // deep

    /* ================================================================ */
    /* 3 · THE EATEN STONE                                               */
    /* ================================================================ */
    grooveScale: 5, // etched grooves per metre
    freshBand: 0.9, // metres of live acid behind each front
    acidGlow: 2.8,
    etchDepth: 0.75, // how dark the floor goes with every pass
    pitScale: 3.5,
    erode: 0.7, // 0..1 how raggedly it fades
    colorAcid: '#d6ff4a',
    colorEtched: '#141a08',
    colorGroove: '#060802',

    /* ================================================================ */
    /* 4 · CHIPS, STEAM & BUBBLES                                        */
    /* ================================================================ */
    chipRate: 60, // stone chips per second off each walking front
    chipSize: 0.08,
    chipSpeed: 4.5,
    chipLife: 0.9,
    steamRate: 36, // steam puffs per second off the eaten floor
    steamSize: 0.8,
    steamLife: 1.8,
    steamOpacity: 0.3,
    bubbleRate: 40, // bubbles per second off the font
    bubbleSize: 0.12,
    bubbleLife: 1,
    colorChipA: '#8a8f78',
    colorChipB: '#6a6e58',
    colorChipC: '#44473a',
    colorChipD: '#24261e',
    colorSteamA: '#a8bc72',
    colorSteamB: '#7e8e52',
    colorSteamC: '#4c5634',
    colorSteamD: '#24281c',
    colorBubbleA: '#f4ffc8',
    colorBubbleB: '#d6ff4a',
    colorBubbleC: '#88b020',
    colorBubbleD: '#304a08',

    /* ================================================================ */
    /* 5 · THE NOTE — travel, and the beat of each voice                 */
    /* ================================================================ */
    noteSize: 0.35, // the glowing bead running along the floor, metres
    noteGlow: 4,
    voiceShake: 0.12, // knock on every voice
    voiceLight: 1.2, // light punch on every voice, × lightIntensity
    firstFlash: 0.2,
    warpStrength: 0.9, // how hard each wall bends the air
    colorNote: '#f0ff9a',
    colorFlash: '#d8ff80',
    colorShock: '#c8f050',

    /* ================================================================ */
    /* 6 · THE SCOURED                                                   */
    /* ================================================================ */
    hitImpulse: 4.5, // m/s the first voice knocks a body outward
    hitLift: 2.4,
    hitSpin: 1.2,
    passStain: 0.22, // stain each voice adds as it washes over a body
    colorScourBody: '#2a3208',
    colorScourRim: '#d6ff4a',
    scourRimGlow: 2.6,
    colorScourEdge: '#f4ffc8',
    scourEdgeGlow: 3.6,
    scourEdgeWidth: 0.06
  }
};
