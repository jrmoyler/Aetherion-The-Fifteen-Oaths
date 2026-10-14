# Scoped imported-skin CPU comparison

This checks actual weighted vertex positions after independent Three.js and Godot imports of **three frozen GLBs from published commit `429dc57a1c9748d0e0835504d116bd9112c8dfd7`**. It does not use changing working-tree asset files or modify original/candidate assets. Inputs are extracted with `git show`, hashed, and verified again after the run.

```sh
node tools/production/skin-parity/run.mjs
python3 -m unittest discover -s tools/production/skin-parity -p test_compare.py
```

Prerequisites: existing locked Three.js `0.185.1` under `runtime/ability-matrix`, existing locked Khronos validator under `tools/production`, Python 3, and Godot (`4.6.3` used here). The runner creates an isolated project and XDG directories under `/tmp`; it does not change HOME or security settings. An optional hexadecimal commit argument changes the explicitly identified input revision. Reports go to `validation/production/skin-parity`, separate from the production acceptance audit.

## What is evaluated

- Kiln ninja: rest and midpoint of `cast_release`.
- Tidal staff: rest and midpoint of `Tidal_tassel_sway`.
- Wind fan: rest and midpoint of `Fan_fold_open`.

Three.js uses its real `GLTFLoader`, `AnimationMixer`, and `SkinnedMesh.applyBoneTransform`; each result is then transformed by the mesh's world matrix. Texture decoding alone is replaced with CPU `Texture` objects. Geometry, inverse binds, joint weights, scene transforms and animation channels come from the original GLB bytes.

Godot uses its real `GLTFDocument` import, `AnimationPlayer`, `MeshInstance3D` surface arrays, `Skin` bind mappings and `Skeleton3D` poses. The script explicitly evaluates linear blend skinning for every weighted vertex:

`worldPosition = sum(weight × skeletonWorld × boneGlobalPose × inverseBind × localVertex)`

Godot's bone-global pose is relative to the skeleton, so the skeleton world transform is applied explicitly. Static vertices use the imported mesh's world transform. Imported weights are used unchanged; there is no corrective weight normalization or fitted transformation. Actual moved weighted vertices are counted, rather than merely observing changed bone rotations.

Both imports retain GLB XYZ in meters. **The comparison uses identity coordinate conversion**: no axis reflection, recentering, best-fit registration or rescaling. Correspondence requires identical uniquely normalized mesh names, matching vertex counts, matching vertex order/local positions and matching bone names/weights. Underscores, periods and spaces are removed only for known importer naming differences; minus signs remain significant. Any ambiguous names or untrustworthy local correspondence fail. This matcher does not claim to support arbitrary importer vertex reordering.

World position tolerance is fixed at **0.1 mm**, with local correspondence tolerance 0.02 mm and weight tolerance 0.00005. These are comparison thresholds, not approved gameplay/performance budgets. Every asset also gets an in-memory **+1 cm X translation negative fixture**; all evaluated vertices must be rejected as mismatched. Additional tests reject vertex-order, bone-mapping and ambiguous-name errors.

## Limits and warning interpretation

The installed headless Godot rendering server supplies no valid skeleton RID for native `bake_mesh_from_current_skeleton_pose`. The initial probe returned: “The source mesh must have its skin registered with a valid skeleton.” Waiting for scene frames did not provide one. The final runner checks the RID, records this limitation and avoids repeated failing calls. Thus **the result is imported-data CPU skin agreement, not native renderer/GPU skin parity**. No sandbox configuration or renderer security setting is changed to work around this limit.

This scoped match provides evidence that the sampled non-root skinned-mesh hierarchy produces consistent CPU positions in these imports. It does **not** dismiss the wider `NODE_SKINNED_MESH_NON_ROOT` warning population or certify every animation/time/LOD. `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE` concerns normal-map tangent frames and is not addressed by position-only comparisons. Normals, tangents, shaders, materials, visual quality, morph targets, gameplay attachment, retargeting, runtime nonuniform scaling and Unreal remain separate gates.

Evidence includes source hashes, engine versions, tool hashes, per-pose bounds and maximum error, actual moved-vertex counts, warnings for each source GLB, negative-fixture results, process logs, and complete compressed per-vertex snapshots from both engines. Vertex counts describe imported attribute-array entries, including normal/UV seam duplication, not deduplicated authoring vertices.

Primary API references: [Godot Skeleton3D](https://docs.godotengine.org/en/stable/classes/class_skeleton3d.html), [Godot Skin](https://docs.godotengine.org/en/stable/classes/class_skin.html), [Godot native skeleton baking](https://docs.godotengine.org/en/stable/classes/class_meshinstance3d.html#class-meshinstance3d-method-bake-mesh-from-current-skeleton-pose), and the pinned local Three.js loader/skinning implementation used by the runner.
