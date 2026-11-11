// Compiles a recipe (plain data) into one skinned costume geometry for a measured wearer.
import { Color, Vector3 } from 'three';
import { faceParams } from '../head.js';
import { profileFor } from '../profiles.js';
import { Bag, rng } from './kernel.js';
import { makeForm } from './form.js';
import { BUILDERS } from './builders.js';

const DENSITY = { low: .6, medium: .8, high: 1 };

/** Head size the groom pass gives a body of this height (kept in step with groom.js). */
export const headSize = (height) => Math.min(.262, Math.max(.205, height * .128));

/**
 * @param recipe { id, palette, build, parts: [{ use, ...params }] }
 * @param rig    { J: bone name -> bind position (Vector3), index: bone name -> skeleton index, H?: head size }
 */
export function buildCostume(recipe, rig, quality = 'high', builders = BUILDERS) {
  const form = makeForm(rig, recipe.build), bag = new Bag(rig.index);
  const H = rig.H ?? headSize(rig.J.head.y + .24);
  const palette = Object.fromEntries(Object.entries({ hollow: '#0b0908', ...recipe.palette }).map(([name, hex]) => [name, new Color(hex)]));
  const context = {
    bag, form, rig, q: DENSITY[quality] ?? 1, rand: rng(recipe.id),
    pal: (name) => { const colour = palette[name]; if (!colour) throw new Error(`recipe ${recipe.id}: unknown palette entry "${name}"`); return colour; },
    head: { H, C: new Vector3(rig.J.head.x, rig.J.head.y + H * .41, rig.J.head.z + H * .05), P: faceParams(profileFor(recipe.id)) },
  };
  for (const { use, ...params } of recipe.parts) {
    const build = builders[use]; if (!build) throw new Error(`recipe ${recipe.id}: unknown builder "${use}"`);
    bag.part = use; build(context, params);
  }
  return { geometry: bag.geometry(), triangles: bag.triangles, parts: bag.parts, form };
}
