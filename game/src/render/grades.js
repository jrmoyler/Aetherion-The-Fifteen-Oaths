// Per-region colour grades: fog/sky tint, fog density multiplier, colour-curve hue/density/
// saturation, exposure and contrast offsets, ambient tint. Blended by camera region weights.
const G = (tint, fogMul, sat, hue, density, exposure = 0, contrast = 1.08, amb = [1, 1, 1], shadowsHue = 220, shadowsDensity = 8) =>
  ({ tint, fogMul, sat, hue, density, exposure, contrast, amb, shadowsHue, shadowsDensity });

export const NEUTRAL_GRADE = G([1, 1, 1], 1, 0, 40, 6);

export const GRADES = {
  neutral: NEUTRAL_GRADE,
  'oath-01': G([1.12, 0.92, 0.76], 1.35, -8, 28, 28, -0.05, 1.12, [1.05, 0.92, 0.85], 15, 12),   // Kiln: warm ash haze
  'oath-02': G([0.86, 0.96, 1.12], 1.35, -14, 205, 24, 0.05, 1.06, [0.9, 0.97, 1.1], 215, 18), // Rime: cold blue
  'oath-03': G([0.8, 0.85, 0.96], 1.7, -34, 225, 16, -0.2, 1.14, [0.85, 0.88, 1.0], 230, 20),  // Storm: slate desaturated
  'oath-04': G([0.92, 1.03, 1.08], 0.65, 12, 185, 10, 0.12, 1.06, [0.95, 1.02, 1.06], 200, 6), // Tidal: bright turquoise
  'oath-05': G([1.08, 0.98, 0.86], 1.15, -2, 34, 16, 0.02, 1.1, [1.06, 0.98, 0.88], 260, 8),   // Fault: dusty sandstone
  'oath-06': G([1.0, 1.0, 1.04], 0.8, 4, 45, 6, 0.08, 1.06, [1, 1, 1.03], 215, 6),            // Reed: airy coastal light
  'oath-07': G([1.0, 1.04, 0.85], 1.3, 8, 58, 16, 0.0, 1.08, [0.98, 1.04, 0.86], 120, 10),     // Graft: golden canopy haze
  'oath-08': G([0.9, 1.08, 0.7], 1.9, -12, 78, 30, -0.05, 1.08, [0.92, 1.06, 0.78], 95, 18),   // Bitterglass: sickly green haze
  'oath-09': G([1.06, 1.02, 0.94], 0.7, 6, 44, 12, 0.14, 1.06, [1.05, 1.02, 0.95], 220, 5),   // Daybreak: radiant warm
  'oath-10': G([0.82, 0.82, 1.12], 1.35, -10, 250, 26, -0.12, 1.1, [0.86, 0.85, 1.1], 255, 22), // Observatory: indigo
  'oath-11': G([0.94, 0.94, 0.97], 1.45, -55, 240, 4, -0.1, 1.12, [0.95, 0.95, 0.98], 260, 10), // Missing Court: desaturated
  'oath-12': G([1.16, 0.82, 0.78], 1.55, -6, 6, 26, -0.04, 1.1, [1.1, 0.88, 0.85], 350, 14),  // Sanguine: red haze
  'oath-13': G([1.02, 0.94, 1.06], 1.0, -6, 300, 12, 0.03, 1.08, [1.02, 0.95, 1.05], 280, 10), // Folded Theatre: mauve
  'oath-14': G([0.98, 1.0, 0.98], 0.95, -6, 42, 9, 0.02, 1.08, [1, 1, 0.98], 190, 10),         // Escapement: teal & brass
  'oath-15': G([1.0, 0.95, 0.88], 1.7, -26, 30, 10, -0.06, 1.12, [1, 0.96, 0.9], 210, 10),    // Impulse: industrial smog
};

/** Ambient weather per region: [kind, intensity] (used when no explicit setWeather is active). */
export const REGION_WEATHER = {
  'oath-01': ['ash', 0.7],
  'oath-02': ['snow', 0.6],
  'oath-03': ['storm', 0.8],
  'oath-08': ['mist', 0.7],
  'oath-11': ['mist', 0.35],
};
