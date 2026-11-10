// What the ground of Aetherion is made of, and the climate above it, in Biome Triad's terms.
// Pure and deterministic (reads only the shared heightfield), so client and server would agree.
import { sampleTerrain, SEA_LEVEL } from './terrain.js';
import { regionAt } from './oaths.js';

// Oath realm -> Biome Triad base material for open ground.
export const BIOME_GROUND = Object.freeze({
  volcanic: 'basalt', glacial: 'snow', alpine: 'stone', coast: 'sand', canyon: 'sand', cliffs: 'vegetation', forest: 'vegetation',
  marsh: 'organic', meadow: 'vegetation', highland: 'stone', badlands: 'sand', crimson: 'soil', terraces: 'soil', plateau: 'soil', industrial: 'masonry',
});
// Air temperature (deg C) and humidity each realm settles toward. Below zero, wet ground freezes and rain falls as snow.
export const BIOME_CLIMATE = Object.freeze({
  volcanic: { temperature: 34, humidity: .25 }, glacial: { temperature: -12, humidity: .6 }, alpine: { temperature: 2, humidity: .5 },
  coast: { temperature: 20, humidity: .75 }, canyon: { temperature: 30, humidity: .2 }, cliffs: { temperature: 14, humidity: .55 },
  forest: { temperature: 17, humidity: .7 }, marsh: { temperature: 19, humidity: .9 }, meadow: { temperature: 18, humidity: .5 },
  highland: { temperature: 6, humidity: .5 }, badlands: { temperature: 27, humidity: .2 }, crimson: { temperature: 22, humidity: .4 },
  terraces: { temperature: 19, humidity: .5 }, plateau: { temperature: 21, humidity: .35 }, industrial: { temperature: 20, humidity: .4 },
});
const scratch = {};
/** Biome Triad material id for the ground at a world position. */
export function groundMaterialAt(x, z) {
  const s = sampleTerrain(x, z, scratch);
  if (s.lava > .12) return 'basalt';
  if (s.plaza > .02) return 'marble';
  if (s.roadW > .5) return 'stone';
  if (s.h < SEA_LEVEL + .6) return 'sand';
  return BIOME_GROUND[regionAt(x, z).biome] ?? 'soil';
}
export const climateAt = (x, z) => BIOME_CLIMATE[regionAt(x, z).biome] ?? BIOME_CLIMATE.meadow;

/** Short reading of a surface sample for the HUD, or '' when the ground is unremarkable. */
export function describeGround(sample) {
  if (!sample) return '';
  if (sample.burn > .25) return 'Burning ground';
  if (sample.ice > .35) return 'Iced ground · slick';
  if (sample.snow > .35) return 'Snow cover';
  if (sample.charge > .3) return 'Charged ground';
  if (sample.scorch > .3) return 'Scorched ground';
  if (sample.contamination > .3) return 'Tainted ground';
  if (sample.wetness > .45) return sample.conductivity > .3 ? 'Soaked ground · conductive' : 'Soaked ground';
  return '';
}
