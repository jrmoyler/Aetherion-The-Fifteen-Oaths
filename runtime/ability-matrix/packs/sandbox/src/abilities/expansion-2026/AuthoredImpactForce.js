import { settings } from '../../config/settings.js';
import { impactForce as scaleImpactForce } from './ImpactForce.js';

/** Read the live sandbox multiplier when each authored hit is emitted. */
export function impactForce(config) {
  return scaleImpactForce(config, settings.global.explosionIntensity);
}
