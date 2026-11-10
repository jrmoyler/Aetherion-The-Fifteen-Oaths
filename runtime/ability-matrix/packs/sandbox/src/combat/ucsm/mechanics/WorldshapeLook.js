/**
 * WorldshapeLook — every presentation number of the Worldshape family.
 *
 * Gameplay (radius, ridge layout, height, pulse cadence, damage) lives in
 * `worldshapeVariants.js` and `presets.js`, and the renderer is bound to it:
 * every terrain layer is drawn inside the authoritative field radius and the
 * glacier's ramp matches the collision height. This block only shapes how the
 * reshaped ground *looks*, and like every sandbox settings block it is sampled
 * every frame by the materials' `onBeforeRender` hooks (and at the beat by
 * `WorldshapeBeats`), never copied at spawn, so the editor folder built by
 * `buildWorldshapeEditor` changes a field that is already standing.
 *
 * The six terrains share these dimensions and differ by their four-stop
 * gradients (`<terrain>A..D`: core → mid → edge → tail) and by the `identity`
 * index each shader branches on.
 *
 * Units: metres, seconds, unitless multipliers. Every multiplier is also
 * scaled by the matching `settings.global.*` value.
 */
export const WORLDSHAPE_LOOK = {
  /* --- Arrival, pulses and departure ------------------------------------ */
  riseTime: 0.55, // s the field takes to spread out from its centre
  chargeTime: 0.3, // s before each damage pulse the ground gathers light (the pulse telegraph)
  chargeGlow: 1.1, // extra glow at the peak of a pulse charge
  warnTime: 2.0, // s before expiry the field starts to gutter
  warnFlicker: 0.5, // 0..1 depth of that guttering

  /* --- Field lines (the hero surface) ----------------------------------- */
  lineOpacity: 0.8,
  lineGlow: 1.3,
  lineFlow: 1.0, // × outward flow speed of the line pulses
  lineNoise: 0.5, // 0..1 noise breakup of the lines

  /* --- Ground treatment -------------------------------------------------- */
  groundOpacity: 0.78,
  groundGlow: 1.0,
  groundScale: 1.0, // × feature size of cracks / caustics / facets
  groundFlow: 1.0, // × animation speed of the ground
  groundEdge: 0.12, // fraction of the radius the field feathers over at its rim

  /* --- Boundary veil (the edge telegraph) -------------------------------- */
  veilHeight: 1.3, // m
  veilOpacity: 0.45,
  veilGlow: 1.0,
  veilBands: 9, // vertical bands around the curtain

  /* --- Rising motes ------------------------------------------------------- */
  moteSize: 1.0,
  moteOpacity: 0.65,
  moteRise: 0.75, // m

  /* --- Drifting spray (ash, snow, sparks, bubbles, glints, dust) --------- */
  spraySize: 1.0,
  sprayOpacity: 0.7,
  sprayHeight: 2.2, // m the spray falls from / rises to

  /* --- Pulse shockwave ---------------------------------------------------- */
  shockWidth: 0.16, // 0..1 band width of the ring
  shockGlow: 1.6,
  shockOpacity: 0.85,

  /* --- Shimmer (screen-space distortion proxy) --------------------------- */
  shimmerStrength: 0.45,
  shimmerScale: 1.6,
  shimmerSpeed: 0.9,
  shimmerHeight: 2.4, // m

  /* --- Beats: camera, screen and light when the ground moves ------------ */
  // Shake is trauma handed to `app.shake.add` (which applies
  // settings.global.cameraShake); flash strength is scaled by
  // settings.global.explosionIntensity. A beat at 0 does nothing.
  arriveShake: 0.16, // the field heaving up out of the floor
  arriveFlash: 0.14,
  pulseShake: 0.09, // every damage pulse
  pulseFlash: 0.1,
  expireShake: 0.05, // the field settling back
  lightPunch: 6.0, // peak intensity of the light thrown on arrival / pulse
  lightReach: 9.0, // m (× settings.global.lightRadius)
  decalLife: 1.4, // s the pulse's ground mark lingers
  decalStrength: 0.8,

  /* --- Palettes: core → mid → edge → tail -------------------------------- */
  scorchedA: '#fff0b8', scorchedB: '#ff762c', scorchedC: '#c2240a', scorchedD: '#1e0904',
  glacierA: '#ffffff', glacierB: '#b3e9ff', glacierC: '#4fa3d6', glacierD: '#0b2a45',
  stormgroundA: '#ffffff', stormgroundB: '#b3a7ff', stormgroundC: '#6a4bff', stormgroundD: '#160c3a',
  floodplainA: '#eafcff', floodplainB: '#31c5ef', floodplainC: '#0e74a8', floodplainD: '#03213a',
  glassA: '#ffffff', glassB: '#d6bfff', glassC: '#8e5bff', glassD: '#220b49',
  continentalA: '#fff0cf', continentalB: '#d5a66c', continentalC: '#8a5a2c', continentalD: '#21140a'
};

/** Hero slug → palette prefix, in shader `identity` order. */
export const WORLDSHAPE_TERRAINS = Object.freeze({
  'the-scorched-kingdom': 'scorched',
  'glaciers-dominion': 'glacier',
  stormground: 'stormground',
  'the-living-floodplain': 'floodplain',
  'the-glass-labyrinth': 'glass',
  'continental-uprising': 'continental'
});

/**
 * One top-level folder, a sub-folder per layer, every key of
 * `WORLDSHAPE_LOOK` exposed.
 *
 * Like `buildWeaveEditor`, this only describes the folder; the call site
 * belongs in `PackAdapter#buildEditor(gui)` beside it:
 * `buildWorldshapeEditor(gui, WORLDSHAPE_LOOK, Editor)`.
 */
export function buildWorldshapeEditor(gui, c = WORLDSHAPE_LOOK, Editor) {
  const folder = gui.addFolder('⛰  Worldshape');
  const R = Editor.range;

  const envelope = folder.addFolder('Rise, pulses & expiry');
  R(envelope, c, 'riseTime', 0.05, 3, 0.01, 'rise (s)');
  R(envelope, c, 'chargeTime', 0, 1.5, 0.01, 'pulse charge (s)');
  R(envelope, c, 'chargeGlow', 0, 4, 0.01, 'charge glow');
  R(envelope, c, 'warnTime', 0, 6, 0.05, 'expiry warning (s)');
  R(envelope, c, 'warnFlicker', 0, 1, 0.01, 'warning flicker');

  const lines = folder.addFolder('1 · Field lines');
  R(lines, c, 'lineOpacity', 0, 1, 0.01, 'opacity');
  R(lines, c, 'lineGlow', 0, 4, 0.01, 'glow');
  R(lines, c, 'lineFlow', -4, 4, 0.01, 'flow');
  R(lines, c, 'lineNoise', 0, 1, 0.01, 'noise breakup');

  const ground = folder.addFolder('2 · Ground treatment');
  R(ground, c, 'groundOpacity', 0, 1, 0.01, 'opacity');
  R(ground, c, 'groundGlow', 0, 4, 0.01, 'glow');
  R(ground, c, 'groundScale', 0.2, 4, 0.01, 'feature scale');
  R(ground, c, 'groundFlow', 0, 4, 0.01, 'flow');
  R(ground, c, 'groundEdge', 0.01, 0.5, 0.005, 'rim feather');

  const veil = folder.addFolder('3 · Boundary veil');
  R(veil, c, 'veilHeight', 0, 4, 0.01, 'height (m)');
  R(veil, c, 'veilOpacity', 0, 1, 0.01, 'opacity');
  R(veil, c, 'veilGlow', 0, 4, 0.01, 'glow');
  R(veil, c, 'veilBands', 1, 32, 1, 'bands');

  const motes = folder.addFolder('4 · Rising motes');
  R(motes, c, 'moteSize', 0, 4, 0.01, 'size');
  R(motes, c, 'moteOpacity', 0, 1, 0.01, 'opacity');
  R(motes, c, 'moteRise', 0, 3, 0.01, 'rise (m)');

  const spray = folder.addFolder('5 · Spray');
  R(spray, c, 'spraySize', 0, 4, 0.01, 'size');
  R(spray, c, 'sprayOpacity', 0, 1, 0.01, 'opacity');
  R(spray, c, 'sprayHeight', 0.2, 5, 0.01, 'height (m)');

  const shock = folder.addFolder('6 · Pulse shockwave');
  R(shock, c, 'shockWidth', 0.02, 0.6, 0.005, 'band width');
  R(shock, c, 'shockGlow', 0, 4, 0.01, 'glow');
  R(shock, c, 'shockOpacity', 0, 1, 0.01, 'opacity');

  const shimmer = folder.addFolder('7 · Shimmer (distortion)');
  R(shimmer, c, 'shimmerStrength', 0, 2, 0.01, 'strength');
  R(shimmer, c, 'shimmerScale', 0.2, 6, 0.05, 'scale');
  R(shimmer, c, 'shimmerSpeed', 0, 4, 0.01, 'speed');
  R(shimmer, c, 'shimmerHeight', 0.2, 5, 0.01, 'height (m)');

  const beats = folder.addFolder('8 · Beats (shake · flash · light · mark)');
  R(beats, c, 'arriveShake', 0, 1, 0.005, 'arrival · shake');
  R(beats, c, 'arriveFlash', 0, 1, 0.01, 'arrival · flash');
  R(beats, c, 'pulseShake', 0, 1, 0.005, 'damage pulse · shake');
  R(beats, c, 'pulseFlash', 0, 1, 0.01, 'damage pulse · flash');
  R(beats, c, 'expireShake', 0, 1, 0.005, 'expiry · shake');
  R(beats, c, 'lightPunch', 0, 20, 0.1, 'light punch');
  R(beats, c, 'lightReach', 1, 24, 0.1, 'light reach (m)');
  R(beats, c, 'decalLife', 0.1, 6, 0.05, 'ground mark life (s)');
  R(beats, c, 'decalStrength', 0, 2, 0.01, 'ground mark strength');

  const colours = folder.addFolder('Palettes');
  for (const prefix of Object.values(WORLDSHAPE_TERRAINS)) Editor.gradient(colours, c, prefix, prefix);

  folder.close();
  return folder;
}
