/**
 * Vigil of Embers — Holy — a votive of three arches and a lamp flame is
 * carried out to the circle, where it raises a sanctuary: eight pointed arches
 * of light built from their feet up, four lamps burning under four hanging
 * bells, a crown of flame and a column of light over a consecrated floor.
 * Every `pulsePeriod` the bells ring and a curtain of light sweeps the circle:
 * allies inside are consecrated (status), enemies inside are struck (hit).
 *
 * Matrix Expansion data block: presentation (`meta`) and the live settings the
 * ability and its editor folder read. Plain data, no imports.
 *
 * Every presentation key is resolved per frame by `VigilOfEmbersAbility`, so
 * dragging any of it re-shapes a sanctuary already standing.
 */
export default {
  id: 'exp-vigil-of-embers',
  uid: 'matrix-expansion/vigil-of-embers',
  meta: {
    label: 'Vigil of Embers',
    element: 'holy',
    accent: '#fff2c6',
    cast: 'zone',
    key: '',
    hint: 'Consecrate allies in a ringing sanctuary and strike enemies inside its boundary.',
    glyph: '<path d="M20 78H80M28 78V38Q50 10 72 38V78M38 78V44H62V78M50 22V51M38 35H62"/>'
  },
  settings: {
    /* --- the cast itself --- */
    range: 18, // maximum cast distance, metres
    minRange: 2, // closer than this and the cast is refused
    speed: 18, // metres/second the votive is carried to the circle
    cooldown: 8, // seconds before the ability can be armed again
    castAnim: 'cast3', // which clip in `CAST_ANIMATIONS` the body throws
    zoneRadius: 4, // metres: the sanctuary — and every pulse — covers exactly this
    lifetime: 4, // seconds the sanctuary stands (× global lifetime)
    fade: 1, // seconds it takes to sink away (× global lifetime)

    /* --- the vigil (combat) --- */
    pulsePeriod: 1.2, // seconds between pulses (min 0.3); the first rings on arrival
    damage: 0.4, // damage each pulse deals to every enemy inside (up to 8)
    hitImpulse: 3, // knock-back of a pulse, m/s (× global explosion intensity)
    hitLift: 3, // upward kick, m/s (× global explosion intensity)
    hitSpin: 1,

    /* --- light (stands at the sanctuary's heart) --- */
    lightColor: '#fff3bd',
    lightIntensity: 7,
    lightRadius: 10,
    pulseLight: 0.8, // light punch on each pulse, × lightIntensity
    arrivalLight: 1, // light punch as the sanctuary rises, × lightIntensity

    /* --- palette --- */
    holyColor: '#ffc45a', // the light of the sanctuary (tint)
    coreColor: '#fff3d2', // white-gold cores and pulse fronts
    giltColor: '#e8a33a', // bells and crown (body)
    stoneColor: '#c8913f', // the arches' gilded stone, sun side
    deepColor: '#3a2209', // dark bronze: shaded stone, shaded gold, the consecrated ground

    /* ================================================================ */
    /* 1 · THE VOTIVE — carried from the hand to the circle              */
    /* ================================================================ */
    travelScale: 1.7,
    travelHeight: 0.8, // metres off the floor
    travelSpin: 0.8, // radians/second
    runnerWidth: 1.6, // metres: the processional runner laid behind the votive
    runnerGlow: 1, // its gilt lines
    runnerFade: 0.6, // seconds it takes to be taken up after the arrival
    telegraphStart: 0.35, // the sanctuary starts forming when the votive is this far along
    telegraphBuild: 0.4, // how much of the arches is built before the arrival
    telegraphReveal: 0.5, // how much of the sigil and column is drawn before the arrival

    /* ================================================================ */
    /* 2 · THE ARCHES                                                    */
    /* ================================================================ */
    archRadius: 0.86, // where the arches stand, × zoneRadius
    archScale: 1.35, // arch size (1 ≈ 2 m tall)
    archGlow: 1, // emissive strength
    buildTime: 0.55, // seconds the arches take to build from their feet up
    recedeDepth: 1.5, // metres the architecture sinks on the way out
    kindleTime: 2.6, // seconds the veins of light take to climb the arches

    /* ================================================================ */
    /* 3 · BELLS, LAMPS AND CROWN                                        */
    /* ================================================================ */
    bellHeight: 3.1, // metres: where the bells hang from
    bellScale: 1.5, // bell size (1 ≈ 0.6 m)
    bellRadius: 1.5, // metres from the axis
    bellSwing: 0.15, // radians of idle sway
    bellRing: 0.35, // radians of extra swing when a pulse rings them
    bellGlow: 1,
    emberScale: 1, // lamp flame size
    flameHeight: 1.2, // metres: where the lamp flames burn
    flameGlow: 1.4,
    flameSway: 0.07, // metres the flame tips lick sideways
    crownHeight: 3.2, // metres
    crownRadius: 1.6, // metres
    crownSpin: 0.7, // radians/second
    crownGlow: 1.2,
    pulseStrength: 1, // how hard each pulse flares flames, arches and bells

    /* ================================================================ */
    /* 4 · THE CONSECRATED FLOOR AND THE COLUMN OF LIGHT                 */
    /* ================================================================ */
    floorGlow: 1,
    groundDark: 0.6, // the dark bronze consecrated ground under the sigil
    revealTime: 0.6, // seconds the sigil takes to draw itself round
    sigilSpin: 0.2, // radians/second the sigil turns
    shaftGlow: 0.45, // the column from the crown to the floor
    shaftFoot: 1.6, // foot radius of the column, × crownRadius
    warpStrength: 0.35, // heat shimmer over the lamps (distortion layer)

    /* ================================================================ */
    /* 5 · THE PULSE                                                     */
    /* ================================================================ */
    waveHeight: 2.2, // metres: height of the expanding curtain
    waveDuration: 0.7, // seconds the curtain takes to reach the boundary
    curtainGlow: 0.45,
    glyphGlow: 0.75, // the petal glyph and the engine burst / shockwave
    glyphRise: 0.1, // metres the glyph lifts as it burns away
    footprintGlow: 0.8, // the instant full-radius footprint
    footprintDuration: 0.22, // seconds
    pulseShake: 0.12, // camera knock on each pulse (× global camera shake)
    pulseFlash: 0.08, // screen flash on each pulse (× global explosion intensity)
    arrivalShake: 0.15, // camera knock as the sanctuary rises

    /* ================================================================ */
    /* 6 · PARTICLES                                                     */
    /* ================================================================ */
    particleRate: 24, // ambient motes through the sanctuary, per second
    particleSize: 0.1,
    emberRate: 36, // embers rising off the four lamps, per second
    emberSize: 0.06,
    emberLife: 1.6, // seconds
    emberRise: 1.1, // metres/second
    pulseEmbers: 28, // embers thrown off the floor by each pulse
    colorEmberA: '#ffffff',
    colorEmberB: '#fff0b8',
    colorEmberC: '#ff9a2e',
    colorEmberD: '#5a2a0c'
  }
};
