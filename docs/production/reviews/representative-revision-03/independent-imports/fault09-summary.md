# fault09 independent import checks

GLB SHA256: `e0b1af08e141df5f3885a1340c4d5d69fb834d7e121182bf3d69ee2d452f4bbb`. All tested source/GLB bytes remained unchanged. Author freeze/export receipt hashes checked; see `fault09-receipt.json`.

- Full Khronos validation: 0 errors, 139 warnings. All warnings are `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE`; preserved in `fault09-glb-validator-details.json`. GPU tangent/material parity remains unverified.
- Actual Blender 4.3.2 source open and GLB import succeeded.
- Actual Godot 4.6.3 GLB import generated and instantiated the scene. Full console log retained.
- Three.js GLTFLoader loaded actual geometry and available skins/animations. Texture loader uses explicit CPU placeholders; Three.js image decode/rendering is not tested.
- Static asset has no skin or animations; no rig expected. No LOD or collision asset was supplied in this review export.

This is scoped CPU/headless import evidence, not GPU, rendered-material, appearance, reference-matching, collision-fit or gameplay approval. Godot pose parity was not tested. No source files were rewritten.
