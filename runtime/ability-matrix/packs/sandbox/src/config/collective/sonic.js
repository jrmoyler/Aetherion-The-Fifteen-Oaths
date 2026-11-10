/**
 * Resonance Pulse — Sound — rings of pressure that ripple the world.
 *
 * Collective Originals data block: presentation (`meta`) and the live settings
 * the ability and its editor folder read. Plain data, no imports, so
 * `settings.js` can pull it in without a cycle.
 */
export default {
  id: 'sonic',
  meta: {
    label: "Resonance Pulse",
    accent: '#ffd1f0',
    key: 'B',
    hint: "Sound — a train of pressure rings that ends in a boom",
    cast: 'line',
    glyph: `<circle cx="26" cy="50" r="6"/><path d="M40 34a22 22 0 0 1 0 32"/><path d="M54 24a36 36 0 0 1 0 52"/><path d="M68 14a50 50 0 0 1 0 72"/>`
  },
  settings: {
    /* --- the cast itself --- */
    range: 18.0, // maximum cast distance, metres
    minRange: 3.0, // closer than this and the cast is refused
    speed: 17.0, // how fast every ring travels, metres/second
    lifetime: 1.9, // seconds the boom (plate, hum) hangs after the last ring lands
    cooldown: 0.6, // seconds before the ability can be armed again
    castAnim: 'cast1', // which clip in `CAST_ANIMATIONS` the body throws
    fadeTime: 0.9, // seconds everything takes to settle out

    /* --- where the train leaves the caster --- */
    handForward: 0.6, // metres in front of the caster
    handSide: 0.0, // metres to the caster's right
    handHeight: 1.3, // metres off the floor

    /* ================================================================ */
    /* 1 · RINGS — the pressure shells                                   */
    /* ================================================================ */

    /* --- the train --- */
    pulseCount: 6, // rings per cast (capped at 12)
    pulseInterval: 0.13, // seconds between one ring leaving and the next
    pulseShrink: 0.08, // each later ring is this much smaller, fraction
    pulseDim: 0.12, // ...and this much dimmer

    /* --- one ring's shape on its way down the line --- */
    ringStart: 0.3, // lateral radius as it leaves the hand, metres
    ringEnd: 2.1, // lateral radius at the end of the line, metres
    ringCurve: 0.65, // <1 opens early, >1 stays tight then flares
    ringHeight: 1.15, // centre height at the end of the line, metres
    spread: 0.85, // half-angle of the shell, radians — how domed it is
    birthTime: 0.07, // seconds a ring takes to fade in at the hand
    arriveGrow: 0.45, // how much more it opens as it dies at the end, fraction
    arriveFade: 0.32, // seconds it takes to die once it lands

    /* --- the shader --- */
    rimWidth: 0.07, // width of the bright rim, fraction of the shell
    rimBright: 0.45, // rim brightness
    chroma: 0.02, // RGB split across the rim, fraction of the shell
    fresnelPower: 2.4,
    fresnelBright: 0.15,
    bodyOpacity: 0.03, // brightness of the interference bands through the body
    bands: 6.0, // interference bands across the shell
    beat: 1.65, // ratio of the second wave — the beat pattern between them
    bandSpeed: 16.0, // how fast the bands run outward
    bandSharp: 3.0, // >1 thins the bands into lines
    lobes: 5.0, // standing-wave lobes around the ring
    lobeDepth: 0.35, // how much the lobes modulate the bands, 0..1
    intensity: 1.3, // emissive multiplier — bloom picks this up
    opacity: 1.0,
    softFade: 0.45, // metres it feathers out where it cuts the floor
    colorRim: '#fff4fb', // white-hot core stop
    colorBody: '#8e1fe0', // saturated body stop
    colorChromaR: '#ff2f8f',
    colorChromaG: '#a8d8ff',
    colorChromaB: '#5a3cff',

    /* --- the body: a filled lens of compressed air with a rolled lip --- */
    bodyFill: 0.9, // opacity of the lens body (normal-blended, it darkens what it crosses)
    bodyCentre: 0.72, // fill at the apex, × the fill at the front
    capSplit: 0.78, // share of the shell grid that is the cap; the rest rolls into the lip
    lipSize: 0.1, // thickness of the vortex lip, × the ring radius
    lipCurl: 4.4, // radians the lip rolls back over itself
    lipSpin: 2.6, // how fast air streaks roll round it
    lipBright: 0.4, // lip brightness
    lipOpacity: 0.92,
    colorTint: '#ff86d2', // pale tint stop
    colorDeep: '#14042a', // the dark deep stop
    bodyGlow: 0.04, // emissive lift of the filled body where it is compressed hardest
    bodyMottle: 0.6, // 0..1 how much the swirling pressure cells shape the fill
    bodyMottleScale: 2.2, // size of those cells (higher = smaller)
    bodyShade: 0.5, // 0..1 how much the sun shades the lens like a volume
    bodyTone: 0.16, // 0..1 how far the filled body climbs from the deep stop toward the body violet
    ringShellOpacity: 0.0, // 0..1 the old per-ring lens shells (end-on they read as a ring stack; the hull carries the train now)
    ringWarp: 0.35, // refraction left at each ring, × warpStrength (the hull bends the frame now)

    /* ================================================================ */
    /* 1b · HULL — one travelling shock body that carries the train      */
    /* ================================================================ */
    /* A single lofted body of shoved air rides the lead ring: a blunt
       bulge front, a long tapering sheath trailing behind it that breaks
       into turbulence, and a bead of compression swelling through it for
       every later ring. It is long along the line, so from the camera
       behind the caster it reads as a volume, not as nested rims. */
    hullOpacity: 1.0, // 0..1 opacity of the body at its front
    hullLength: 5.6, // metres of sheath behind the front (the wake)
    hullWidth: 0.9, // lateral half-width, × the rings' radius at that point
    hullAspect: 0.72, // height / width of the cross-section (it hugs the floor)
    hullSink: 0.42, // how deep the cruising body is buried, × its half-height
    hullNose: 0.55, // length of the blunt front, × its radius
    hullBulge: 0.22, // how much the front swells past the sheath, fraction
    hullTailPow: 0.22, // <1 keeps the sheath fat to the tail, >1 tapers early
    hullWakeSpread: 0.9, // how much wider the wake gets toward its tail — a bow wave opening behind the front
    hullWakeFlat: 0.7, // 0..0.95 how much flatter it gets toward its tail (it lies down on the floor)
    hullWake: 1.0, // 0..1 how much the sheath keeps the front's width instead of narrowing back toward the hand
    hullTurb: 0.32, // turbulent displacement of the sheath, × its radius (grows toward the tail)
    hullTurbScale: 1.1, // size of that turbulence (higher = smaller)
    hullTurbSpeed: 3.2, // how fast it boils
    hullFlow: 0.95, // 0..1 streaks of air running back along the body
    hullFlowSpeed: 2.4, // how fast those streaks run back
    hullLight: 0.7, // how far the sun-lit side lifts from the deep stop toward the hull colour
    hullEdge: 0.04, // violet fresnel glow on the silhouette only
    hullEdgePower: 3.6, // fresnel power of that edge
    hullCrest: 3.5, // brightness of the hot crest round the bulge front
    hullCrestWidth: 0.09, // width of that crest, × the front radius
    hullDissolve: 0.34, // 0..1 how much of the tail breaks into ragged turbulence
    hullBeads: 0.2, // how much each trailing ring swells the sheath as it runs through
    hullBeadWidth: 0.55, // metres — length of one swell
    hullCompress: 0.25, // 0..1 how much the body shortens as the train piles into the target
    hullSwell: 0.15, // how much fatter it gets while it piles up, fraction
    hullCollapse: 0.45, // seconds the body takes to burst outward and tear apart at the boom
    hullBurst: 1.0, // 0..1 how hard it bursts (blows out, lies down, tears into holes)
    hullWarp: 1.2, // refraction strength of the body's edge and front
    hullSoftFade: 0.5, // metres it feathers out where it ploughs into the floor
    colorHull: '#6e6152', // the lit mid tone of the shoved air (dusty, dark)
    colorHullDeep: '#17130f', // the hull's own dark stop (dust-laden air, no violet)
    hullCrestHot: 0.85, // 0..1 how far the crest goes from the tint stop to white-hot

    /* --- dust peeled off the floor under the body --- */
    peelSpacing: 0.45, // metres between peels under the front
    peelCount: 7, // smoke puffs per side per peel
    peelSpeed: 3.0, // metres/second
    peelLift: 1.3, // upward share of the throw
    peelBack: 0.9, // backward share (it streams into the wake)
    peelSize: 0.9,
    gritCount: 3, // grit chips per side per peel
    gritSize: 0.09,
    gritSpeed: 4.2,
    gritLife: 0.9,
    colorGritA: '#8c7a8f',
    colorGritB: '#4f4258',
    colorGritC: '#2b2233',
    colorGritD: '#120c18',

    /* ================================================================ */
    /* 2 · WARP — the screen bends under every ring                      */
    /* ================================================================ */
    warpStrength: 1.4, // refraction strength of a ring
    warpWidth: 0.16, // width of the bent band, fraction of the shell
    warpBody: 0.22, // how much the rest of the shell bends, × the rim
    boomWarp: 1.8, // refraction strength of the boom across the floor

    /* ================================================================ */
    /* 3 · DUST — kicked up under each passing ring                      */
    /* ================================================================ */
    dustSpacing: 1.6, // metres between puffs under one ring
    dustCount: 3, // particles per puff
    dustSize: 0.6,
    dustLife: 1.2,
    dustSpeed: 1.8, // metres/second, outward from the ring's path
    dustRise: 0.45,
    dustDrag: 2.4,
    dustOpacity: 0.55,
    dustTurbulence: 1.0,
    colorDustA: '#a09281',
    colorDustB: '#6e6152',
    colorDustC: '#3d342b',
    colorDustD: '#16120e',

    /* ================================================================ */
    /* 4 · RIPPLES — the floor answering each ring                       */
    /* ================================================================ */
    rippleSpacing: 2.6, // metres between ripple decals under one ring
    rippleEvery: 3, // only every Nth ring lays ripples (1 = all of them)
    rippleRadius: 0.9, // ripple radius, × the ring's radius
    rippleLife: 1.2,
    rippleWidth: 0.07,
    rippleIntensity: 0.0,
    colorRippleA: '#ffe6f6',
    colorRippleB: '#3a2060',

    /* ================================================================ */
    /* 5 · MUZZLE — little rings thrown off the hand per pulse           */
    /* ================================================================ */
    muzzleRings: 1, // RING particles per pulse
    muzzleSize: 0.45,
    muzzleLife: 0.32,
    muzzleSpeed: 2.4,
    muzzleGlow: 0.5,
    colorMuzzleA: '#cbbfd6',
    colorMuzzleB: '#6e6152',
    colorMuzzleC: '#2e2720',
    colorMuzzleD: '#0e0816',

    /* ================================================================ */
    /* 6 · BOOM — the train lands                                        */
    /* ================================================================ */
    boomBurst: 2.6, // dark pressure burst (dense dust ball) end radius, metres
    boomBurstLife: 0.7,
    boomBurstIntensity: 0.45,
    boomBurstOpacity: 0.22,
    colorBurstA: '#6e6152',
    colorBurstB: '#2e2720',
    colorBurstC: '#0e0b08',
    shockRadius: 6.5, // SHOCKWAVE decal radius, metres
    shockLife: 0.75,
    shockIntensity: 0.0, // strength of the bright SHOCKWAVE outline (0 = off; the dust ring carries the boom)
    shockWidth: 0.07,
    colorShockA: '#ffffff',
    colorShockB: '#8e1fe0',
    floorRadius: 9.0, // how far the floor ripple runs, metres
    floorTime: 1.5, // seconds it takes to get there
    floorRings: 1, // wavelets in the ripple train (capped at 6)
    floorWavelength: 0.85, // metres between them
    floorWidth: 0.4, // width of one wavelet, metres
    floorIntensity: 0.2,
    floorChroma: 0.0, // RGB split across a wavelet, metres
    floorWake: 0.9, // 0..1 opacity of the filled dark pressure band behind the crest
    floorWakeLength: 3.4, // metres of that band
    boomDust: 110, // dust thrown out by the boom
    boomDustLow: 0.12, // upward share of that throw — low, so it rolls out as a ring
    boomRingRadius: 6.0, // DUSTRING decal radius, metres
    boomRingLife: 2.2,
    boomRingIntensity: 1.4,
    boomShake: 0.55,
    boomShakeTime: 0.5, // seconds the kick takes to die
    boomFlash: 0.18,
    boomLight: 22, // light punch
    pulseShake: 0.035, // a tick of shake per ring leaving
    colorFlash: '#ffe6f6',

    /* --- the domes: the boom stood on the floor, its echo, and the hum --- */
    boomDomeRadius: 4.4, // metres
    boomDomeTime: 0.32, // seconds it takes to open
    boomDomeLife: 0.55, // seconds it takes to die once open
    boomDomeSpread: 1.2, // half-angle, radians (1.57 = a hemisphere)
    boomEcho: 0.2, // seconds before the echo dome
    boomEchoScale: 0.72, // echo size, × the first
    humRadius: 1.9, // metres — the standing dome left humming over the plate
    humSpread: 1.3,
    humAmp: 0.14, // how far it breathes in and out, fraction
    humRate: 2.6, // breaths per second (the plate's lines pulse with it)
    humDelay: 0.35, // seconds after the boom before it stands
    humBright: 0.85,
    humFill: 0.8, // body fill, × the rings'
    boomDomeFill: 1.0, // body fill of the boom domes, × the rings'
    boomDomeGlow: 3.0, // body glow of the boom domes, × the rings' — the boom's light
    boomDomeShow: 0.0, // 0..1 the old filled domes and hum (the boom is a dark burst + crater now)

    /* ================================================================ */
    /* 7 · CHLADNI PLATE — the floor sorts into the sound's figure       */
    /* ================================================================ */
    plateRadius: 4.6, // metres
    plateModeA: 3, // nodal diameters of the first figure
    plateRingsA: 2.5, // nodal circles of the first figure
    plateModeB: 5, // ...and of the figure it morphs into
    plateRingsB: 3.5,
    plateMorphTime: 1.4, // seconds per morph (it swings back and forth)
    plateLineWidth: 0.16, // width of the sand ridges, in pattern units
    plateGrain: 34, // sand grain frequency
    plateStain: 0.9, // dark stain where the floor shakes
    plateGlow: 0.1, // ridge glow on each beat
    plateBodyMix: 0.05, // 0..1 how far the stain lifts from the deep stop toward the body violet
    plateRimGlow: 0.1, // glow of the pressed crater lip round the plate
    plateRimWidth: 0.06, // width of that lip, × the plate radius
    laneWidth: 0.85, // lane half-width, × the rings' end radius
    laneStripe: 0.9, // lane wavelength along the line, metres
    laneAcross: 0, // nodes across the lane (0 = ripples straight across)
    laneStain: 0.22, // dark stain under the lane
    laneLines: 0.0, // strength of the sorted ridges in the lane, × the plate's

    /* ================================================================ */
    /* 8 · CRATER — the floor heaved into a lip round the plate         */
    /* ================================================================ */
    craterRadius: 0.78, // crest of the lip, × plateRadius
    craterWidth: 0.42, // width of the lip, × plateRadius
    craterHeight: 0.65, // metres the lip stands
    craterRise: 0.16, // seconds it takes to heave up
    craterLump: 0.4, // 0..1 lumpiness of the heaved earth
    craterLight: 0.75, // how far the sun-lit side lifts from the deep stop
    craterGlow: 0.35, // violet in the cracks on each hum beat
    craterBreath: 0.1, // how much the lip rises and falls with the hum, fraction
    craterSink: 1.0, // 0..1 how far it sinks back on the way out
    craterPuffs: 7, // dust puffs a second leaking off the lip through the linger
    colorCrater: '#5e5246', // the lit earth tone of the lip

    /* --- the light --- */
    lightColor: '#ffd1f0',
    lightIntensity: 5.0,
    lightRadius: 9.0,
    lightThrob: 0.45 // 0..1 how much the light beats with the train
  }
};
