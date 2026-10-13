import { Group, LatheGeometry, Mesh, Vector2 } from 'three';
import { clone as cloneRigged } from 'three/addons/utils/SkeletonUtils.js';
import { LAYER } from '../../core/Layers.js';

/**
 * The caster's double — a second, independently posed copy of the character
 * rig that an ability can draw with its own shader.
 *
 * Written for the Chrono Recall's frozen echoes and shared with the Parallax
 * Blink (the body that dissolves into, and reassembles out of, the irises) and
 * the Hall of Echoes (the three holograms). All three need the same thing: the
 * caster's real silhouette, articulated, but never the caster's own meshes —
 * those carry the shared PBR material and belong to the depth prepass, the
 * shadow map and the contact-shadow pass, none of which an effect may touch.
 *
 * ## How
 *
 * `SkeletonUtils.clone` (three's own addon, the same one `Dummy` uses) copies
 * the loaded model with a *fresh* skeleton bound to the copied bones. Geometry
 * is shared with the real character by reference, so a double costs one draw
 * and one bone texture, not a second upload of the mesh. Every mesh of the copy
 * is then:
 *
 *   - given the ability's `ShaderMaterial` (which pulls in three's skinning
 *     chunks — see `SKINNING_PARS` / `SKINNING_MAIN`),
 *   - moved to `LAYER.VFX` only — off WORLD (prepass, shadows) and CONTACT,
 *   - excluded from shadows and frustum culling.
 *
 * Posing is either *frozen* (`copyPose` copies every bone's local TRS from the
 * live rig once, which is what an echo is: a moment, kept) or *animated* (the
 * caller binds its own `AnimationMixer` to `model`, as the holograms do).
 * `copyPose` walks two pre-built arrays and allocates nothing.
 *
 * ## The fallback
 *
 * If the rig has not loaded (or failed to), the double is a stylised lathe
 * silhouette — feet, hips, chest, shoulders, head — drawn with the same
 * material (the skinning chunks are `#ifdef`-guarded, so one shader serves
 * both). `bind` upgrades a fallback to the real clone the first time it is
 * called after the rig appears, once, and reports it so mixers can be rebuilt.
 */

/** Pulled into a vertex shader's declarations. */
export const SKINNING_PARS = /* glsl */ `
  #include <skinning_pars_vertex>
`;

/**
 * Pulled into `main()`. Leaves the skinned object-space position in
 * `transformed` and the skinned normal in `objectNormal`.
 */
export const SKINNING_MAIN = /* glsl */ `
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
`;

/** Walk two structurally identical trees side by side. */
function parallel(a, b, visit) {
  visit(a, b);
  const n = Math.min(a.children.length, b.children.length);
  for (let i = 0; i < n; i++) parallel(a.children[i], b.children[i], visit);
}

/**
 * A figure turned on a lathe — the fallback silhouette. Profile in metres for a
 * 1.78 m body; the caller scales it to the rig's measured height.
 */
function createSilhouetteGeometry() {
  const profile = [
    [0.0, 0.0],
    [0.17, 0.0],
    [0.15, 0.08],
    [0.12, 0.45],
    [0.15, 0.82],
    [0.2, 0.95],
    [0.16, 1.1],
    [0.21, 1.3],
    [0.25, 1.42],
    [0.12, 1.5],
    [0.06, 1.53],
    [0.06, 1.57],
    [0.11, 1.62],
    [0.105, 1.72],
    [0.06, 1.77],
    [0.0, 1.78]
  ].map(([x, y]) => new Vector2(x, y));
  return new LatheGeometry(profile, 28);
}

export class CasterDouble {
  /**
   * @param {import('three').ShaderMaterial} material drawn on every mesh of the double
   * @param {string} [name]
   */
  constructor(material, name = 'CasterDouble') {
    this.material = material;

    /** Place, turn and show/hide this; the copied model hangs off it. */
    this.root = new Group();
    this.root.name = name;
    this.root.layers.set(LAYER.VFX);
    this.root.visible = false;

    /** The copied FBX (or the fallback mesh). Bind mixers to this. */
    this.model = null;
    /** The live model it was cloned from — null for the fallback. */
    this.source = null;
    this.skinned = false;
    /** Body height in metres, as `CharacterController` measured it. */
    this.height = 1.78;
    /**
     * Yaw of the rig's own forward in model space. `root.rotation.y = yaw -
     * yawOffset` makes the double face world yaw `yaw` (0 = +Z), exactly as
     * `CharacterController#setFacing` does for the real body.
     */
    this.yawOffset = 0;
    /** The character's colour map, for doubles that want to look like it. */
    this.map = null;

    this._srcBones = [];
    this._dstBones = [];
    this._skeletons = [];
    this._fallback = null;
  }

  /**
   * Build the double for `character`, or upgrade a fallback once the rig has
   * loaded. Allocates only when it actually (re)builds — once per instance in
   * practice, at construction (abilities are prewarmed after the rig loads).
   *
   * @param {import('../../animation/CharacterController.js').CharacterController} character
   * @returns {boolean} true if it (re)built the model this call
   */
  bind(character) {
    const source = character?.model ?? null;
    if (this.model && this.source === source) return false;
    if (this.model && !source) return false;

    this._clear();
    this.height = character?.height ?? 1.78;
    this.yawOffset = character?.root ? character.facing - character.root.rotation.y : 0;

    if (source) {
      const model = cloneRigged(source);
      // `clone` copies `visible`; a body hidden mid-teleport must not make a hidden double.
      model.visible = true;
      parallel(source, model, (a, b) => {
        if (a.isBone && b.isBone) {
          this._srcBones.push(a);
          this._dstBones.push(b);
        }
      });
      model.traverse((node) => {
        node.layers.set(LAYER.VFX);
        if (!node.isMesh && !node.isSkinnedMesh) return;
        if (!this.map) {
          const m = Array.isArray(node.material) ? node.material[0] : node.material;
          this.map = m?.map ?? null;
        }
        node.material = this.material;
        node.castShadow = false;
        node.receiveShadow = false;
        node.frustumCulled = false;
        if (node.isSkinnedMesh && node.skeleton) this._skeletons.push(node.skeleton);
      });
      this.model = model;
      this.source = source;
      this.skinned = this._skeletons.length > 0;
    } else {
      this._fallback = createSilhouetteGeometry();
      const mesh = new Mesh(this._fallback, this.material);
      mesh.layers.set(LAYER.VFX);
      mesh.frustumCulled = false;
      mesh.scale.setScalar(this.height / 1.78);
      this.model = mesh;
      this.source = null;
      this.skinned = false;
    }

    this.root.add(this.model);
    return true;
  }

  /** Freeze the double in the live rig's current pose. No allocation. */
  copyPose() {
    const src = this._srcBones;
    const dst = this._dstBones;
    for (let i = 0; i < src.length; i++) {
      const a = src[i];
      const b = dst[i];
      b.position.copy(a.position);
      b.quaternion.copy(a.quaternion);
      b.scale.copy(a.scale);
    }
  }

  /** Face world yaw `yaw` (radians about +Y, 0 = +Z). */
  setFacing(yaw) {
    this.root.rotation.y = yaw - this.yawOffset;
  }

  /** Bones of the copy, for sampling points on the body. */
  get bones() {
    return this._dstBones;
  }

  _clear() {
    if (this.model) this.root.remove(this.model);
    for (const skeleton of this._skeletons) skeleton.dispose();
    this._fallback?.dispose();
    this._skeletons.length = 0;
    this._srcBones.length = 0;
    this._dstBones.length = 0;
    this._fallback = null;
    this.model = null;
    this.source = null;
    this.map = null;
    this.skinned = false;
  }

  /** Frees the bone textures and the fallback; the shared rig geometry is not ours. */
  dispose() {
    this._clear();
    this.root.parent?.remove(this.root);
  }
}

/**
 * Who currently has their hands on the character, among the atlas abilities
 * that move it (Chrono Recall, Parallax Blink).
 *
 * One token shared by both, because ownership is a property of the *body*, not
 * of a cast: a Parallax Blink fired in the middle of a Recall's dash must make
 * the Recall let go first, or two casts would hide, move and restore the same
 * body in alternation. Whoever takes the body calls `release` on the previous
 * holder (which restores visibility and scale) before saving anything itself.
 * BlinkStep and Voidstep keep their own tokens in files this set cannot touch;
 * see the class comments for what that means in practice.
 *
 * @type {{ owner: { _releaseCharacter(steal: boolean): void } | null }}
 */
export const casterLock = { owner: null };

/** A random point on the double's body — a random bone, in world space. */
CasterDouble.prototype.bodyPoint = function bodyPoint(out, rand = Math.random()) {
  const bones = this._dstBones;
  if (bones.length) {
    const bone = bones[Math.min(bones.length - 1, Math.floor(rand * bones.length))];
    return bone.getWorldPosition(out);
  }
  // Fallback silhouette: a point inside a body-sized capsule.
  const a = rand * Math.PI * 2 * 7.0;
  const h = (rand * 13.7) % 1;
  const r = 0.18 * Math.sqrt((rand * 31.1) % 1);
  out.set(Math.cos(a) * r, h * this.height, Math.sin(a) * r);
  return out.applyMatrix4(this.root.matrixWorld);
};
