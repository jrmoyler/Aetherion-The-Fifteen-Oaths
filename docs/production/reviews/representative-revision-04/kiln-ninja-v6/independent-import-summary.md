# Ninja V6 independent focused diagnostic checks

All11 author freeze hashes match. Source and four GLBs unchanged during audit. Full hash receipt in ninja06-receipt.json.

- Actual Blender4.3.2 source-open and four GLB imports succeeded.
- Actual Godot4.6.3 import and scene instantiation succeeded for allfour GLBs.
- Khronos: zero errors and warnings across four GLBs; collision has informational UNUSED_OBJECT.
- Three.js actual geometry/skin/animation import succeeded. 45 animated bounds samples agree with Blender within 3.64116360521e-07m (tolerance0.0001m); 1cm negative fixture rejected. No scale shrink or invalid skin weights.
- Three.js COLOR_0 retained across allthree visual LODs: minimum RGBA [.8823987,.7060044,.7311971,1], nonwhite vertices379/119/53 respectively; material vertexColors enabled. Body/hair color values remainwhite; hair loads MeshPhysicalMaterial with specularIntensity0.400000006. Full evidence ninja06-colors.json.

CPU/headless checks only. Three textures are explicit placeholders; no GPU/material-render, image decode, reference fidelity or gameplay approval. This revision is a focused diagnostic with two renders; fullview completion is not claimed. Godot color/material visual parity not established. No source files rewritten.
