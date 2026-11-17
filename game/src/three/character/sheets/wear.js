// Puts a sheet costume on a hero body in the game.
//
// The hero GLBs carry a baked costume fused into one decimated surface. Where a hero has a sheet recipe, that
// baked surface is hidden (only the regions the recipe keeps, normally the hands and the weapon they hold,
// stay) and the code-built costume is bound to the body's own skeleton in its place. So there is one costume,
// one extra draw call, and every authored clip drives it.
import { Matrix4, SkinnedMesh, Vector3 } from 'three';
import { withPrimitiveIndices } from '../primitive-geometry.js';
import { buildCostume } from './costume.js';
import { costumeDepthMaterial, costumeMaterial } from './material.js';
import { heldWeaponIndices } from './weapon-islands.js';
import { applyTailoring } from './tailoring.js';
import { bindDigits, registerDigits } from './digits.js';
import { recipeFor } from './recipes/index.js';

const SIDED = /^(shoulder|upperarm|forearm|hand|thigh|shin|foot|toe)\.?([LR])$/;
const boneName = (name) => name.replace(SIDED, '$1.$2');
const masked = new WeakMap(), built = new WeakMap();

export function sheetRecipe(desc) { return desc && desc.kind !== 'mob' && desc.oath && desc.cls ? recipeFor(`${desc.oath}-${desc.cls}`) : null; }

/** Bind-pose joints of the body's main skinned mesh, in that mesh's geometry space. */
export function rigOf(body) {
  const mesh = body.meshes.filter((m) => m.isSkinnedMesh).sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0];
  if (!mesh) return null;
  // The mesh's bind matrix, not bindMatrixInverse: an attached SkinnedMesh rewrites the latter from its current
  // world matrix every frame, so it only equals the bind inverse while the actor stands at the origin.
  const J = {}, index = {}, toGeometry = new Matrix4().copy(mesh.bindMatrix).invert(), bind = new Matrix4();
  mesh.skeleton.bones.forEach((bone, i) => { const name = boneName(bone.name); index[name] = i; J[name] = new Vector3().setFromMatrixPosition(bind.copy(mesh.skeleton.boneInverses[i]).invert().premultiply(toGeometry)); });
  const need = ['hips', 'spine', 'spine1', 'spine2', 'neck', 'head', 'shoulder.L', 'upperarm.L', 'forearm.L', 'hand.L', 'thigh.L', 'shin.L', 'foot.L', 'toe.L'];
  return need.every((name) => J[name]) ? { mesh, J, index } : null;
}

/** Regions of the baked surface a recipe may keep. Each answers: does this vertex stay? */
const KEEP = {
  // Hands, and whatever is rigidly held in them (the baked weapon), from the wrist outward.
  hands: ({ owner, point, J }) => {
    const side = owner === 'hand.L' ? 'L' : owner === 'hand.R' ? 'R' : null; if (!side) return false;
    const wrist = J[`hand.${side}`], along = new Vector3().subVectors(wrist, J[`forearm.${side}`]).normalize();
    return point.sub(wrist).dot(along) > -.012;
  },

};

/**
 * Drop every baked triangle the recipe does not keep, in every skinned mesh the GLB brought (the main surface and
 * any costume primitives appended to it). Cache the filtered index buffer
 * separately from the source GLB primitive.
 */
function hideBaked(body, rig, recipe) {
  const rules = (recipe.keep ?? []).map((name) => KEEP[name]).filter(Boolean), point = new Vector3();
  for (const mesh of body.meshes) {
    if (!mesh.isSkinnedMesh || mesh.userData.groomHidden || mesh.userData.sheetCostume) continue;
    const geometry = mesh.geometry;
    if (!geometry.index) continue;
    let variants = masked.get(geometry);
    if (!variants) masked.set(geometry, variants = new Map());
    if (variants.has(recipe.id)) {
      mesh.geometry = variants.get(recipe.id);
      continue;
    }
    const { position, skinIndex, skinWeight } = geometry.attributes, names = mesh.skeleton.bones.map((bone) => boneName(bone.name));
    if (recipe.keep?.length === 1 && recipe.keep[0] === 'weapon') {
      mesh.geometry = withPrimitiveIndices(geometry, heldWeaponIndices(geometry, names, recipe.weaponBone));
      variants.set(recipe.id, mesh.geometry);
      continue;
    }
    const keep = new Uint8Array(position.count);
    for (let i = 0; i < position.count; i++) {
      let owner = 0, best = -1;
      for (let k = 0; k < 4; k++) { const w = skinWeight.getComponent(i, k); if (w > best) { best = w; owner = skinIndex.getComponent(i, k); } }
      for (const rule of rules) if (rule({ owner: names[owner], point: point.fromBufferAttribute(position, i), J: rig.J })) { keep[i] = 1; break; }
    }
    const source = geometry.index.array, kept = [];
    for (let i = 0; i < source.length; i += 3) if (keep[source[i]] && keep[source[i + 1]] && keep[source[i + 2]]) kept.push(source[i], source[i + 1], source[i + 2]);
    mesh.geometry = withPrimitiveIndices(geometry, new (position.count > 65535 ? Uint32Array : Uint16Array)(kept));
    variants.set(recipe.id, mesh.geometry);
  }
}

/** Dress a body from its sheet recipe. Returns a handle, or null when the hero has no recipe or no usable rig. */
export function wearSheet(body, desc, quality = 'high') {
  const recipe = sheetRecipe(desc); if (!recipe) return null;
  const rig = rigOf(body); if (!rig) return null;
  rig.H = body.groom?.H;
  rig.unarmed = Boolean(desc.noWeapon);
  let variants = built.get(rig.mesh.geometry);
  if (!variants) { variants = new Map(); built.set(rig.mesh.geometry, variants); }
  const key = `${recipe.id}|${quality}|${(rig.H ?? 0).toFixed(3)}|${rig.J.head.y.toFixed(3)}|${rig.unarmed}`;
  if (!variants.has(key)) {
    const digits = registerDigits(rig);
    variants.set(key, { ...buildCostume(recipe, rig, quality), digits });
  }
  const costume = variants.get(key);
  hideBaked(body, rig, recipe);
  if (recipe.keep?.length === 1 && recipe.keep[0] === 'weapon') {
    const held = body.meshes.filter(m => m.isSkinnedMesh && m.visible && !m.userData.groomHidden && m.geometry.index?.count);
    body.animator.setHandsFree = free => {
      for (const prop of held) prop.visible = !(free || rig.unarmed);
    };
    body.animator.setHandsFree(false);
  }
  const motion = costume.geometry.userData.motion;
  const cloth = applyTailoring(costumeMaterial(motion), recipe.id, costume.form);
  const mesh = new SkinnedMesh(costume.geometry, cloth);
  mesh.userData.sheetCostume = true;
  mesh.customDepthMaterial = costumeDepthMaterial(motion);
  mesh.name = `sheet-costume-${recipe.id}`; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  mesh.position.copy(rig.mesh.position); mesh.quaternion.copy(rig.mesh.quaternion); mesh.scale.copy(rig.mesh.scale);
  const fingers = costume.digits.length ? bindDigits(rig.mesh, costume.digits) : null;
  rig.mesh.parent.add(mesh); mesh.bind(fingers?.skeleton ?? rig.mesh.skeleton, rig.mesh.bindMatrix);
  if (fingers) body.animator.poseHands = fingers.pose;
  body.meshes.push(mesh);
  body.sheetCostume = { id: recipe.id, sheet: recipe.sheet, mesh, triangles: costume.triangles, parts: costume.parts };
  const dispose = body.dispose.bind(body);
  // The geometry is cached per hero and tier; only this actor's mesh and material go.
  body.dispose = () => {
    delete body.animator.setHandsFree;
    if (fingers) { delete body.animator.poseHands; fingers.dispose(); }
    mesh.removeFromParent(); mesh.customDepthMaterial.dispose(); dispose();
  };
  return body.sheetCostume;
}
