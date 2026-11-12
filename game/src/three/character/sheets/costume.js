// Compiles a recipe (plain data) into one skinned costume geometry for a measured wearer.
import { Color, Vector3 } from 'three';
import { faceParams } from '../head.js';
import { profileFor, sheetProfile, sheetHeadSize } from '../profiles.js';
import { Bag, rng } from './kernel.js';
import { makeForm } from './form.js';
import { BUILDERS } from './builders.js';
import { finishMotion, motionAttributes } from './clearance.js';
import { foldAttributes, setFoldAttributes } from './folds.js';

const DENSITY = { low: .6, medium: .8, high: 1 };
/** Builders whose sleeves are loose cloth: what they emit on the forearm hangs toward the ground (clearance.js). */
const LOOSE = /^(shirt|b\.sleeve|c:bellSleeve)$/;

/** Head size the groom pass gives a body of this height (kept in step with groom.js). */
export const headSize = (headY, scale = 1) => sheetHeadSize(headY, scale);

/**
 * @param recipe { id, palette, build, parts: [{ use, ...params }] }
 * @param rig    { J: bone name -> bind position (Vector3), index: bone name -> skeleton index, H?: head size }
 */
export function buildCostume(recipe, rig, quality = 'high', builders = BUILDERS) {
  const form = makeForm(rig, recipe.build), bag = new Bag(rig.index);
  const H = rig.H ?? headSize(rig.J.head.y, recipe.headScale ?? 1);
  const profile = sheetProfile(profileFor(recipe.id));
  // `skin` defaults to the head's own skin tone so arms, hands and face are one person.
  const palette = Object.fromEntries(Object.entries({ hollow: '#0b0908', skin: profile.skin, ...recipe.palette }).map(([name, hex]) => [name, new Color(hex)]));
  const context = {
    // `density` lets a recipe with a great many parts thin its tessellation to stay inside the triangle budget.
    bag, form, rig, q: (DENSITY[quality] ?? 1) * (recipe.density ?? 1), rand: rng(recipe.id),
    pal: (name) => { const colour = palette[name]; if (!colour) throw new Error(`recipe ${recipe.id}: unknown palette entry "${name}"`); return colour; },
    head: { H, C: new Vector3(rig.J.head.x, rig.J.head.y + H * .41, rig.J.head.z + H * .05), P: faceParams(profile) },
  };
  // A recipe may bring its own builders (`builders: { name: fn }`), so a hero group can add parts in its own file.
  const all = recipe.builders ? { ...builders, ...recipe.builders } : builders;
  for (const { use, ...params } of recipe.parts) {
    const build = all[use]; if (!build) throw new Error(`recipe ${recipe.id}: unknown builder "${use}"`);
    bag.part = use; bag.loose = LOOSE.test(use); build(context, params);
  }
  // Hanging cloth and loose sleeves learn how to give way to the body in motion (see clearance.js).
  const geometry = bag.geometry(), motion = finishMotion(bag, form); motionAttributes(geometry, motion);
  // Cloth learns where it rucks and where it falls in folds (see folds.js).
  setFoldAttributes(geometry, foldAttributes(bag, form));
  return { geometry, triangles: bag.triangles, parts: bag.parts, form, hanging: motion.hanging, loose: motion.loose };
}
