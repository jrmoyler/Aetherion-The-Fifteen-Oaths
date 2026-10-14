# Ninja revision05 independent import checks

Frozen geometry checked on 2026-10-13. Author receipt: `/tmp/kiln-ninja-revision05/geometry-freeze-receipt.json`. All nine listed recipe/source/texture/GLB hashes match. The source and four GLBs were unchanged during this audit.

- Primary GLB SHA256: `d1c63efe4cdeacb6f77769157393ffad7ab529e6b804e1b37c7f90bf6ef926a3`.
- Blender source SHA256: `e7c753945d2c3b841de2c9ed7b0b3cb03c723cd89d810914bd11d33946b12aa4`.
- Khronos validator: four GLBs, zero errors, zero warnings. Collision GLB has one informational `UNUSED_OBJECT` issue. Complete issues retained in `ninja05-glb-validator-details.json`.
- Blender 4.3.2: actual source open and four actual GLB imports succeeded.
- Godot 4.6.3: all four actual imports generated and instantiated scenes. Primary and two LODs each contain one skin, one material and three animations; collision has no skin or animation. Full logs retained.
- Three.js GLTFLoader: real geometry, skin and animation CPU load succeeded for all four. Texture loader uses explicit placeholder textures; no Three.js texture rendering or pixel decode is asserted.
- Three.js versus Blender evaluated animation world bounds: 45 samples (three clips × three LODs × five times), maximum difference 0.0000003641163605 metres against 0.0001 metre tolerance. One-centimetre translated negative fixture rejected. No animation node scale shrink or invalid/zero skin weights observed.

This is scoped CPU/headless evidence. It does not establish per-vertex identity, rendered materials, anatomical quality, reference matching, animation quality, collision fit, gameplay certification or GPU compatibility. Godot was tested for import and instantiation, not pose parity or rendered appearance. No source files were rewritten.
