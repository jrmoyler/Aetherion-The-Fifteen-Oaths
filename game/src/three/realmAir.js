// The air of each realm, taken from the Biome Triad world it corresponds to.
import { BIOME_WORLDS } from './biome-worlds.generated.js';

/** Which Biome Triad world each realm takes its air from. */
export const REALM_WORLD = Object.freeze({
  volcanic: 'volcano', glacial: 'arctic', alpine: 'alpine', coast: 'sea', canyon: 'canyon', cliffs: 'village', forest: 'forest', marsh: 'marsh',
  meadow: 'village', highland: 'taiga', badlands: 'egypt', crimson: 'haven', terraces: 'ruins', plateau: 'savanna', industrial: 'urban',
});

/**
 * Fog for a realm: a colour multiplier and a density factor applied to Aetherion's own fog.
 * Aetherion draws to about 1.5 km, so the source densities are compressed rather than copied.
 */
export function realmAir(biome) {
  const world = BIOME_WORLDS[REALM_WORLD[biome]];
  if (!world) return { tint: [1, 1, 1], density: 1, world: null };
  const peak = Math.max(...world.fog.tint, 1);
  return { tint: world.fog.tint.map((value) => value / peak), density: Math.min(1.9, Math.max(.75, Math.sqrt(world.fog.density / .0008))), world: REALM_WORLD[biome] };
}
