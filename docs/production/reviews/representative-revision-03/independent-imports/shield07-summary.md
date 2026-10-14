# shield07 independent import checks

GLB SHA256: `24a99b69791acda8574d0dff9758d2dfe235c98c5d85083e2687e89b91d881f2`. All tested source/GLB bytes remained unchanged. Author freeze/export receipt hashes checked; see `shield07-receipt.json`.

- Full Khronos validation: 0 errors, 312 warnings. All warnings are `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE`; preserved in `shield07-glb-validator-details.json`. GPU tangent/material parity remains unverified.
- Actual Blender 4.3.2 source open and GLB import succeeded.
- Actual Godot 4.6.3 GLB import generated and instantiated the scene. Full console log retained.
- Three.js GLTFLoader loaded actual geometry and available skins/animations. Texture loader uses explicit CPU placeholders; Three.js image decode/rendering is not tested.
- Animated world-bounds comparison: 82 samples, maximum Three.js/Blender difference 1.52830367106e-06 metres; tolerance 0.0001 metre. One-centimetre negative fixture rejected. No animation node scale shrink, invalid joints or invalid/zero skin weights.

This is scoped CPU/headless import evidence, not GPU, rendered-material, appearance, reference-matching, collision-fit or gameplay approval. Godot pose parity was not tested. No source files were rewritten.
