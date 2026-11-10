import { settings } from '../../../config/settings.js';
import { sharedUniforms } from '../../../core/FrameUniforms.js';

/**
 * The `settings.global` multipliers every dual-pulse material reads.
 *
 * `FrameUniforms` already mirrors glow and shader intensity. These four boxes
 * add the rest of the global sliders the pulse layers respond to, shared *by
 * identity* across every pulse material (both casts, every pooled instance),
 * so one `syncPulseGlobals()` per frame updates all of them:
 *
 *  - `uGlobalOpacity` — `global.opacity`, multiplied into every alpha (and
 *    into the dissolve of the opaque monument solid);
 *  - `uNoiseScale`    — `global.noiseFrequency`, multiplied into every noise
 *    coordinate (flames, cracks, rime, char, facets);
 *  - `uNoiseStrength` — `global.noiseStrength`, scales how far each noise term
 *    pulls its pattern away from the flat base;
 *  - `uFresnel`       — `global.fresnel`, the weight of every rim term.
 *
 * The values are global, so sharing them between Cinder and Glacier is exact:
 * both would write the same numbers anyway.
 */
export const pulseGlobals = Object.freeze({
  uGlobalOpacity: { value: 1 },
  uNoiseScale: { value: 1 },
  uNoiseStrength: { value: 1 },
  uFresnel: { value: 1 },
});

/** GLSL declarations for the boxes above; prepend to a pulse fragment shader. */
export const PULSE_GLOBALS_GLSL = /* glsl */ `
  uniform float uGlobalOpacity;
  uniform float uNoiseScale;
  uniform float uNoiseStrength;
  uniform float uFresnel;
`;

/** `sharedUniforms` plus the pulse globals, by identity. */
export function pulseUniforms(extra = {}) {
  return sharedUniforms({ ...pulseGlobals, ...extra });
}

/** Mirror `settings.global` into the shared boxes. Four writes, no allocation. */
export function syncPulseGlobals() {
  const g = settings.global;
  pulseGlobals.uGlobalOpacity.value = g.opacity;
  pulseGlobals.uNoiseScale.value = g.noiseFrequency;
  pulseGlobals.uNoiseStrength.value = g.noiseStrength;
  pulseGlobals.uFresnel.value = g.fresnel;
}
