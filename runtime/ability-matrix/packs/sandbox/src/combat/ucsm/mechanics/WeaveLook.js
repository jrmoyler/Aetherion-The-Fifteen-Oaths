/**
 * WeaveLook — every presentation number of the Covenant Weaving family.
 *
 * The weave family's *gameplay* lives in `WeaveVariants.js` / `presets.js`
 * (anchor counts, link widths, damage, pulse timing). None of that is here.
 * This block only shapes what the anchors, links and cues *look* like, and it
 * follows the sandbox's settings rule: it is sampled every frame by the
 * materials' `onBeforeRender` hooks (and at the beat by `WeaveBeats`) and is
 * never copied into a record at spawn time, so mutating any field — from the
 * editor folder built by `buildWeaveEditor`, or from the console — changes an
 * anchor that is already standing.
 *
 * The seven weave identities share one set of dimensions and differ by their
 * four-stop gradients (`<style>A..D`: core → mid → edge → tail) and by the
 * `character` index each shader branches on, so a new identity costs four
 * colours and a geometry profile rather than a new material.
 *
 * Units: metres, seconds, and unitless multipliers where noted. Every
 * multiplier is also scaled by the matching `settings.global.*` value.
 */
export const WEAVE_LOOK = {
  /* --- Arrival and departure ------------------------------------------- */
  revealTime: 0.42, // s an anchor takes to burn up out of its sigil / a link to weave across
  warnTime: 2.0, // s before expiry the anchor starts to gutter (the expiry telegraph)
  warnFlicker: 0.55, // 0..1 how deep the guttering dims the anchor's light
  exitTime: 0.3, // s an anchor / link takes to burn out once its combat record is gone

  /* --- Hero ribbons (anchor helix + link braid, one shared shader) ----- */
  ribbonOpacity: 0.78,
  ribbonGlow: 1.35, // HDR multiplier; > 1 is what bloom picks up
  ribbonFlow: 2.4, // filament scroll speed along the ribbon (1/s)
  ribbonFilaments: 18, // filament count along a unit ribbon
  ribbonNoise: 0.55, // 0..1 how much simplex noise breaks the filaments up
  ribbonNoiseScale: 3.2, // noise frequency along the ribbon
  ribbonSway: 0.04, // m of lateral breathing; capped at 0.04 so links stay inside their capsule
  ribbonEdge: 0.6, // 0..1 softness of the ribbon's long edges

  /* --- Ground sigil under each anchor ---------------------------------- */
  sigilRadius: 0.95, // m, the rosette's outer radius
  sigilOpacity: 0.72,
  sigilGlow: 1.15,
  sigilSpin: 0.22, // turns per second of the rune bands (0 in reduced motion)
  sigilRunes: 14, // rune notches around the band
  sigilCountdown: 0.9, // 0..1 strength of the remaining-life arc around the rim
  sigilDamage: 0.8, // 0..1 how much a wounded anchor's sigil cracks and stutters

  /* --- Anchor motes (GPU points orbiting each pylon) ------------------- */
  moteSize: 1.0, // × base point size
  moteOpacity: 0.75,
  moteRise: 1.6, // m the motes climb before they wrap
  moteSwirl: 1.0, // × orbit speed
  moteRadius: 0.55, // m orbit radius at the pylon foot

  /* --- Link motes (the twenty points scrolling along each braid) ------- */
  linkMoteSize: 1.0, // × base point size
  linkMoteOpacity: 0.75,

  /* --- Link sparks (second point system riding each link) -------------- */
  sparkSize: 1.0,
  sparkOpacity: 0.85,
  sparkSpeed: 1.0, // × travel speed along the link
  sparkScatter: 0.8, // 0..1 how far sparks leave the braid (stays inside the capsule)

  /* --- Link ground strip ------------------------------------------------ */
  scorchOpacity: 0.55,
  scorchGlow: 0.9,
  scorchNoise: 2.6, // noise frequency of the burnt / frosted / wet trail

  /* --- Cue shockwaves (break, expiry, chain, flood, quake, shatter) ---- */
  shockWidth: 0.22, // 0..1 band width of the travelling ring
  shockGlow: 1.6,
  shockOpacity: 0.9,
  shockGrowth: 0.35, // extra radius (× cue radius) the ring travels past its start
  floodOpacity: 0.55, // the flooded triangle's fill

  /* --- Heat / air shimmer (screen-space distortion proxy) -------------- */
  shimmerStrength: 0.5,
  shimmerScale: 2.2,
  shimmerSpeed: 1.1,
  shimmerHeight: 1.9, // m the shimmer column rises over a pylon

  /* --- Beats: camera, screen and light on the cue that lands ---------- */
  // Shake is trauma (0..1) handed to `app.shake.add`, which applies
  // settings.global.cameraShake itself. Flash is the screen-flash strength,
  // scaled by settings.global.explosionIntensity. A beat at 0 does nothing.
  arriveShake: 0.04, // an anchor planting
  breakShake: 0.18, // an anchor shattered by damage — the loudest weave beat
  breakFlash: 0.32,
  chainShake: 0.12, // storm arcs jumping between enemies
  chainFlash: 0.22,
  quakeShake: 0.3, // tectonic triangulation's quake
  quakeFlash: 0.16,
  burstShake: 0.08, // flood, shatter and draft
  burstFlash: 0.12,
  expireShake: 0.05, // an anchor running out of time
  lightPunch: 5.0, // peak intensity of the point light thrown on break / burst
  lightReach: 7.0, // m reach of that light (× settings.global.lightRadius)
  decalLife: 1.6, // s the ground mark of a break / burst lingers
  decalStrength: 0.9, // intensity of that mark

  /* --- Palettes: core → mid → edge → tail ------------------------------ */
  fireA: '#fff1c2', fireB: '#ffa13a', fireC: '#ff4a12', fireD: '#5a0f04',
  frostA: '#f3fdff', frostB: '#a5e8ff', frostC: '#3fa7e6', frostD: '#0c2f55',
  stormA: '#ffffff', stormB: '#c9bcff', stormC: '#7a5cff', stormD: '#241255',
  waterA: '#e9fbff', waterB: '#5fdcff', waterC: '#1a8fd0', waterD: '#062a4a',
  earthA: '#ffe7b0', earthB: '#e0a45e', earthC: '#8f5a2a', earthD: '#2a1709',
  crystalA: '#ffffff', crystalB: '#e6ccff', crystalC: '#a46cff', crystalD: '#2d0f5a',
  windA: '#f5fffb', windB: '#baf5df', windC: '#5fd1b8', windD: '#0f3d3a'
};

/** Style order is the `character` index every weave shader branches on. */
export const WEAVE_STYLES = Object.freeze(['fire', 'frost', 'storm', 'water', 'earth', 'crystal', 'wind']);

/**
 * One top-level folder in the house style: glyph + label, a sub-folder per
 * layer, every key of `WEAVE_LOOK` exposed — palettes through
 * `Editor.gradient`, everything else through `Editor.range`.
 *
 * This module only describes the folder; it does not mount itself. The call
 * site belongs with the other combat folders in `PackAdapter#buildEditor(gui)`:
 * `buildWeaveEditor(gui, WEAVE_LOOK, Editor)`, passing the real `ui/Editor.js`
 * class. Nothing is captured at build time, so every control is live on an
 * anchor that is already standing.
 */
export function buildWeaveEditor(gui, c = WEAVE_LOOK, Editor) {
  const folder = gui.addFolder('⌘  Covenant Weaving');
  const R = Editor.range;

  const envelope = folder.addFolder('Arrival, expiry & exit');
  R(envelope, c, 'revealTime', 0.05, 2, 0.01, 'reveal (s)');
  R(envelope, c, 'warnTime', 0, 6, 0.05, 'expiry warning (s)');
  R(envelope, c, 'warnFlicker', 0, 1, 0.01, 'warning flicker');
  R(envelope, c, 'exitTime', 0.05, 1.5, 0.01, 'burn-out (s)');

  const ribbon = folder.addFolder('1 · Hero ribbons');
  R(ribbon, c, 'ribbonOpacity', 0, 1, 0.01, 'opacity');
  R(ribbon, c, 'ribbonGlow', 0, 4, 0.01, 'glow');
  R(ribbon, c, 'ribbonFlow', -8, 8, 0.05, 'filament flow');
  R(ribbon, c, 'ribbonFilaments', 2, 48, 1, 'filaments');
  R(ribbon, c, 'ribbonNoise', 0, 1, 0.01, 'noise breakup');
  R(ribbon, c, 'ribbonNoiseScale', 0.2, 12, 0.05, 'noise scale');
  R(ribbon, c, 'ribbonSway', 0, 0.04, 0.001, 'sway (m, capsule-capped)');
  R(ribbon, c, 'ribbonEdge', 0, 1, 0.01, 'edge softness');

  const sigil = folder.addFolder('2 · Ground sigil');
  R(sigil, c, 'sigilRadius', 0.2, 2, 0.01, 'radius (m)');
  R(sigil, c, 'sigilOpacity', 0, 1, 0.01, 'opacity');
  R(sigil, c, 'sigilGlow', 0, 4, 0.01, 'glow');
  R(sigil, c, 'sigilSpin', -2, 2, 0.01, 'rune spin (turns/s)');
  R(sigil, c, 'sigilRunes', 3, 40, 1, 'rune notches');
  R(sigil, c, 'sigilCountdown', 0, 1, 0.01, 'life arc');
  R(sigil, c, 'sigilDamage', 0, 1, 0.01, 'damage cracking');

  const motes = folder.addFolder('3 · Anchor motes');
  R(motes, c, 'moteSize', 0, 4, 0.01, 'size');
  R(motes, c, 'moteOpacity', 0, 1, 0.01, 'opacity');
  R(motes, c, 'moteRise', 0, 4, 0.01, 'rise (m)');
  R(motes, c, 'moteSwirl', -4, 4, 0.01, 'swirl');
  R(motes, c, 'moteRadius', 0.05, 1.5, 0.01, 'orbit radius (m)');

  const sparks = folder.addFolder('4 · Link motes & sparks');
  R(sparks, c, 'linkMoteSize', 0, 4, 0.01, 'mote size');
  R(sparks, c, 'linkMoteOpacity', 0, 1, 0.01, 'mote opacity');
  R(sparks, c, 'sparkSize', 0, 4, 0.01, 'spark size');
  R(sparks, c, 'sparkOpacity', 0, 1, 0.01, 'spark opacity');
  R(sparks, c, 'sparkSpeed', -4, 4, 0.01, 'spark speed');
  R(sparks, c, 'sparkScatter', 0, 1, 0.01, 'spark scatter');

  const strip = folder.addFolder('5 · Link ground trail');
  R(strip, c, 'scorchOpacity', 0, 1, 0.01, 'opacity');
  R(strip, c, 'scorchGlow', 0, 4, 0.01, 'glow');
  R(strip, c, 'scorchNoise', 0.2, 10, 0.05, 'noise scale');

  const shock = folder.addFolder('6 · Cue shockwaves');
  R(shock, c, 'shockWidth', 0.02, 0.8, 0.01, 'band width');
  R(shock, c, 'shockGlow', 0, 4, 0.01, 'glow');
  R(shock, c, 'shockOpacity', 0, 1, 0.01, 'opacity');
  R(shock, c, 'shockGrowth', 0, 1.5, 0.01, 'overshoot');
  R(shock, c, 'floodOpacity', 0, 1, 0.01, 'flood fill');

  const shimmer = folder.addFolder('7 · Shimmer (distortion)');
  R(shimmer, c, 'shimmerStrength', 0, 2, 0.01, 'strength');
  R(shimmer, c, 'shimmerScale', 0.2, 8, 0.05, 'scale');
  R(shimmer, c, 'shimmerSpeed', 0, 4, 0.01, 'speed');
  R(shimmer, c, 'shimmerHeight', 0.2, 4, 0.01, 'height (m)');

  const beats = folder.addFolder('8 · Beats (shake · flash · light · mark)');
  R(beats, c, 'arriveShake', 0, 1, 0.005, 'anchor planted · shake');
  R(beats, c, 'breakShake', 0, 1, 0.005, 'anchor broken · shake');
  R(beats, c, 'breakFlash', 0, 1, 0.01, 'anchor broken · flash');
  R(beats, c, 'chainShake', 0, 1, 0.005, 'chain · shake');
  R(beats, c, 'chainFlash', 0, 1, 0.01, 'chain · flash');
  R(beats, c, 'quakeShake', 0, 1, 0.005, 'quake · shake');
  R(beats, c, 'quakeFlash', 0, 1, 0.01, 'quake · flash');
  R(beats, c, 'burstShake', 0, 1, 0.005, 'flood / shatter / draft · shake');
  R(beats, c, 'burstFlash', 0, 1, 0.01, 'flood / shatter / draft · flash');
  R(beats, c, 'expireShake', 0, 1, 0.005, 'anchor expired · shake');
  R(beats, c, 'lightPunch', 0, 20, 0.1, 'light punch');
  R(beats, c, 'lightReach', 1, 20, 0.1, 'light reach (m)');
  R(beats, c, 'decalLife', 0.1, 6, 0.05, 'ground mark life (s)');
  R(beats, c, 'decalStrength', 0, 2, 0.01, 'ground mark strength');

  const colours = folder.addFolder('Palettes');
  for (const style of WEAVE_STYLES) Editor.gradient(colours, c, style, style);

  folder.close();
  return folder;
}
