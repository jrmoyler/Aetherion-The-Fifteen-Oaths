# Independent shield08b import checks

SCOPED CPU CHECKS PASS. Actual Blender source opening and GLB reimport, Godot 4.6.3 headless scene instantiation, Three.js GLTFLoader CPU geometry/skin/animation evaluation, and Khronos validation ran against the same unchanged frozen bytes.

- Source SHA256: `0c3cebfe28a6aa8f1488ffe10aafdcebe52f4d26a995fe20f2d865047406dac3`.
- GLB SHA256: `27a08329146d305df4bee61e642c4fff3f0ed716f8f5e7ee7d9433b652ca8f34`.
- Khronos: zero errors; 413 `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE` warnings remain.
- Godot instantiated 385 meshes, 8 materials, one skin, and one animation.
- All 57,402 weighted vertices have valid rigid weights and joint indices; no weight-sum error or scale shrink detected.
- 82 evaluated animated world-bound samples agreed between Blender GLB reimport and Three.js within 0.000001571 meters (0.0001 m tolerance). The deliberately translated 1 cm negative fixture was rejected.
- No source bytes changed during checks.

These tests do not establish GPU appearance, texture decoding in Three.js (CPU placeholder textures are used), exact per-vertex identity, collision clearance, physical engineering, Unreal compatibility, gameplay, or visual acceptance. The source author’s separate sampled clearance evidence and independent pixel report remain distinct.
