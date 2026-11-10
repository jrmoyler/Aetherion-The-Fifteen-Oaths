/**
 * Ashen Doppelganger — settings block (data only, no imports).
 *
 * The cast is a zone that never really "lands": the base front runs out to the
 * aimed point in a blink and the whole spell lives in the fade phase, where an
 * ash copy of the caster walks the caster's own recent path `delay` seconds
 * behind them and scorches whatever stands near it every `pulseInterval` —
 * and, `brandAt` seconds in, repeats your cast: it throws a coal to the aimed
 * point, which tears the floor open and raises a crown of ash-basalt spires.
 *
 * Grouped by layer, in the order the editor shows them. Gameplay keys (the
 * first group) are the ones tests and the combat adapter rely on; every other
 * key is presentation and is read from `settings['ashen-doppelganger']` every
 * frame, so dragging it in the editor changes a cast that is already running.
 */
export const ID = 'ashen-doppelganger';
export const UID = 'matrix-expansion/ashen-doppelganger';

export const CONFIG = Object.freeze({
  id: ID,
  meta: {
    label: 'Ashen Doppelganger',
    accent: '#ff7439',
    element: 'fire',
    key: '',
    cast: 'zone',
    hint: 'An ash echo follows your recent path and periodically scorches nearby foes.',
    glyph: '<circle cx="50" cy="25" r="12"/><path d="M32 78L38 43L62 43L68 78M22 52L37 47M63 47L78 52"/>'
  },
  settings: {
    /* --- the cast ------------------------------------------------------ */
    range: 18, // max aim distance (m) — where the echo's thrown coal lands
    minRange: 0,
    speed: 45, // the base front: effectively instant, the spell is the fade
    lifetime: 5, // nominal; the live length is `duration`
    cooldown: 9,
    castAnim: 'cast2',
    lightColor: '#ff7439', // the light rides the echo, guttering like a coal
    lightIntensity: 5,
    lightRadius: 7,

    /* --- the echo's rules (gameplay) ------------------------------------ */
    delay: 0.8, // seconds the echo walks behind the caster
    duration: 5, // seconds the echo exists after the cast lands
    pulseInterval: 0.8, // seconds between scorching pulses (first at `delay`)
    pulseRadius: 2.4, // metres each pulse reaches from the echo
    pulseForce: 2, // knock-back impulse on a struck body
    pulseLift: 1.2, // upward kick on a struck body
    pulseSpin: 0.4, // tumble on a struck body
    scorchAmount: 0.65, // how far a struck body is charred (0..1, monotonic)
    scorchLook: {
      color: '#38130c', // charred skin
      rimColor: '#ff5b20', // glowing rim of the char
      rimEmissive: 1.2,
      edgeColor: '#ffb04b', // the advancing burn line
      edgeEmissive: 1.6
    },

    /* --- 1 · the echo body (ember-crust shader) -------------------------- */
    echoOpacity: 1, // overall opacity of the echo (1 = solid ash; below 0.99 it blends)
    formTime: 0.45, // condenses out of ash over (s)
    burnOutTime: 0.9, // crumbles top-down over the last (s)
    fissureScale: 21, // density of the glowing cracks
    fissureSpeed: 2, // how fast heat crawls through them
    crustGrain: 18, // char grain size
    fissureGlow: 2, // crack brightness
    rimGlow: 0.55, // silhouette ember rim
    preheat: 0.25, // seconds before a pulse the body starts to flare
    heatFlare: 1, // extra crack glow at the pulse
    wobble: 0.025, // heat-shimmer sway of the fallback figure (m)
    burnEdge: 0.08, // width of the glowing dissolve edge
    colorCharA: '#060201', // coolest char
    colorCharB: '#330902', // warmest char
    colorFissure: '#ff3005', // crack glow
    colorRim: '#ff7a2a', // silhouette rim
    colorBurnEdge: '#ffc070', // forming / crumbling edge
    rigEmissive: 0.3, // base emissive on the cloned caster rig (the cracks and rim glow on top)
    colorRigBody: '#3a2c26', // cloned rig base colour: charcoal ash, lit by the sun
    colorRigEmissive: '#4a0e02', // cloned rig emissive (a low smoulder)
    colorRigAsh: '#6b5d55', // pale cooled-ash flecks on the rig

    /* --- 2 · ground sigil and pulse ring -------------------------------- */
    sigilOpacity: 0.32, // standing ash circle
    sigilGlow: 1, // brightness of the circle and cracks
    sigilRing: 0.74, // radius of the ring, fraction of pulseRadius
    sigilCracks: 12, // radial crack count
    pulseRingTime: 0.4, // seconds a pulse ring takes to run out
    colorSigil: '#ff2e04',
    colorSigilHot: '#ffb04b',

    /* --- 3 · the fuse (path between caster and echo) --------------------- */
    trailWidth: 0.22, // half-width of the smouldering path (m)
    trailGlow: 1.4,
    trailOpacity: 0.7,
    trailFlicker: 1, // how hard the fuse gutters
    colorTrailHot: '#ff6a1a', // just walked on by the caster
    colorTrailAsh: '#2a0d06', // about to be walked on by the echo

    /* --- 4 · ember column (baked points round the body) ------------------ */
    emberOpacity: 0.8,
    emberRate: 2.4, // rise speed of the column
    emberHeight: 2.2, // column height (m)
    emberSize: 18, // point size at 1 m
    colorEmberA: '#ff1f03', // cool ember
    colorEmberB: '#ffb329', // hot ember

    /* --- 5 · heat haze (screen distortion) ------------------------------ */
    hazeStrength: 0.6,
    hazeWidth: 1.4, // billboard half-width (m)
    hazeHeight: 2.6, // billboard height (m)
    hazeScale: 2.2, // noise frequency
    hazeSpeed: 1.4, // rise speed of the shimmer

    /* --- 6 · particles -------------------------------------------------- */
    moteRate: 26, // embers per second shed by the echo
    moteSize: 0.07,
    moteSpeed: 0.9,
    moteLife: 1.2,
    moteLift: 1.6, // buoyancy
    moteGlow: 2.2,
    colorMoteA: '#fff1c0',
    colorMoteB: '#ff9a2e',
    colorMoteC: '#ff3a08',
    colorMoteD: '#2a0602',
    ashRate: 10, // ash flakes per second
    ashSize: 0.22,
    ashLife: 1.8,
    ashLift: 0.5,
    ashOpacity: 0.55,
    colorAshA: '#4a2a1e',
    colorAshB: '#2c1a14',
    colorAshC: '#1b110d',
    colorAshD: '#0b0807',
    pulseSparks: 34, // sparks thrown on every pulse
    sparkSpeed: 6,
    sparkSize: 0.05,
    sparkLife: 0.45,
    sparkGravity: 9,
    sparkStretch: 0.4,
    sparkGlow: 3,
    colorSparkA: '#fff4d0',
    colorSparkB: '#ffb040',
    colorSparkC: '#ff4a0a',
    colorSparkD: '#3a0802',

    /* --- 7 · pulse and hit beats ---------------------------------------- */
    pulseShake: 0.05, // camera knock on every pulse
    hitShake: 0.16, // extra knock when a pulse strikes a body
    shakeDecay: 9, // how fast the knock settles
    pulseLight: 0.6, // light punch per pulse (× lightIntensity)
    hitFlash: 0.12, // screen flash on a strike
    colorFlash: '#ff8a3a',
    scorchDecal: 0.4, // scorch mark radius (× pulseRadius) left by a pulse
    scorchDecalLife: 2.2,
    shockLife: 0.45, // pulse shockwave decal life
    colorShockA: '#ff5a1c',
    colorShockB: '#ffd08a',
    burstSize: 0.9, // fire shell on a struck body (m)
    burstIntensity: 1.2,
    colorBurstA: '#fff0c0',
    colorBurstB: '#ff7a1e',
    colorBurstC: '#3a0a02',
    collapseAsh: 40, // ash thrown when the echo crumbles
    collapseEmbers: 60, // embers thrown when the echo crumbles

    /* --- 8 · the echo stands at your shoulder --------------------------- */
    echoSide: 1, // the ash figure stands this far to the caster's right of its path point (m)
    echoBack: 0.35, // ... and this far behind it (m); pulses centre on the figure

    /* --- 9 · the echo repeats your cast: the brand ---------------------- */
    // `brandAt` seconds after the cast the echo throws what you threw: a coal
    // flies from its hand to the aimed point and tears the floor open there.
    brandAt: 0.5, // seconds after the cast the echo throws (gameplay)
    brandCharge: 0.3, // seconds the coal gathers in the echo's hand before it flies
    brandFlight: 0.5, // seconds in the air (gameplay: the landing is the hit)
    brandArc: 1.8, // height of the throw's arc (m)
    brandSize: 0.55, // coal diameter (m)
    brandSpin: 7, // tumble of the coal (rad/s)
    brandGlow: 2.4, // brightness of its seams
    brandTail: 1.8, // flame tail length (m)
    brandTrailRate: 140, // embers shed per second of flight
    brandSmokeRate: 36, // ash puffs per second of flight
    brandRadius: 2.8, // metres the landing scorches (gameplay)
    brandForce: 3.2, // knock-back on a struck body
    brandLift: 2.4, // upward kick on a struck body
    brandTumble: 1, // tumble on a struck body
    brandShake: 0.32, // camera knock at the landing
    brandFlash: 0.3, // screen flash at the landing
    brandLight: 2.6, // light punch at the landing (× lightIntensity)
    brandBurst: 0.95, // fire shell at the landing (× brandRadius)
    brandSparks: 110, // sparks thrown at the landing

    /* --- 10 · the cinder crown (lit ash-basalt spires) ------------------ */
    spireCount: 10, // spires torn up round the landing (≤ 12)
    spireRing: 0.62, // seat of the ring, × brandRadius
    spireHeight: 3.2, // tallest spire (m)
    spireWidth: 1.35, // girth (× a 0.7 m foot)
    spireLean: 0.3, // outward lean at the eruption (rad)
    spireRise: 0.3, // seconds to tear up out of the floor
    spireSettle: 0.45, // metres they sink over the linger
    spireTilt: 0.22, // extra outward lean over the linger (rad)
    spireSway: 0.035, // heat sway while they stand (rad)
    crownLife: 2.3, // seconds the crown stands after the landing
    crownCrumble: 0.9, // seconds it crumbles crown-down at the end
    spireCool: 1.6, // seconds for the stone's heat to halve
    spireVeinGlow: 2.2, // vein brightness
    spireVeinScale: 5.5, // vein density
    spireRoughness: 0.92,
    colorSpireRock: '#2b211d', // the stone (lit by the sun)
    colorSpireAsh: '#7a6a60', // pale ash settling on it as it cools
    crownEmbers: 46, // embers rising off the crown per second (fades with its heat)
    crownSmoke: 12, // ash puffs off the crown per second
    crownHaze: 0.8, // heat-haze strength over the crown

    /* --- 11 · the cinder field (the torn floor that stays) -------------- */
    fieldScale: 1.25, // radius, × brandRadius
    fieldReveal: 0.28, // seconds the tear runs out from the centre
    fieldOpacity: 0.94,
    fieldGlow: 2.2,
    fieldCool: 2.4, // seconds for the cracks' heat to halve
    fieldCrackScale: 1.6, // plate density

    /* the four-stop cinder ramp every layer of the echo's cast is coloured from */
    colorCinderA: '#fff3cc', // white-hot core
    colorCinderB: '#ffb347', // pale gold
    colorCinderC: '#ff3d0a', // saturated ember
    colorCinderD: '#1c0703' // dark char
  }
});
