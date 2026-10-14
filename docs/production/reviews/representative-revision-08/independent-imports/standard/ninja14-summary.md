# Independent Ninja V14 material diagnostic

SCOPED CPU/PRESERVATION CHECKS PASS. All19 material-freeze inputs match receipt SHA256 `c3a0db4205619a0663199a5ad92c23921e5708905f939afa2d8770dfb4b01f7c`; all42 final checksum entries also match.

Actual Blender source opening/four GLB reimports, four Godot4.6.3 headless scene instantiations, Three.js CPU checks and four Khronos validations pass with unchanged input bytes. AllGLBs have zero errors/warnings; each visualGLB has three UNUSED_OBJECT informational entries, and collision has one.45 animated world-bound samples agree within0.000000364117m; the1cm translated negative fixture rejects.

Independently compared original binary data and JSON: the original V13 BIN prefix is byte-identical in every GLB; all379 accessor definitions per visualGLB and4 collision accessors are unchanged, along with mesh/node/skin/animation/scene structures. Embedded baseline source and GLBs exactly match frozenV13 originals. All21 embedded-image occurrences in visualGLBs decode successfully, including appended material maps.

Reproduced the author's saved-source comparison using real Blender reopen operations with reports redirected outside the frozen candidate. Source mesh positions/normals/weights/polygons/UV/material indices/smoothing, bone matrices/parents/lengths, action keys/handles/interpolation and object transforms match the V13 baseline exactly. This verifies material-only data changes; it does not certify rendered material quality.

Source SHA256 `195fec1c7b78e975f2b722340971d1eca41338bafcda1ffb4d400efce54b94d1`.
PrimaryGLB SHA256 `9ca1b8dfc6ccc8cafe691ab78563d9abbce133cd88bb78d4ea3c3d1a5db49dae`.

No GPU appearance, visual reference approval, shader parity, Unreal compatibility or production acceptance is established. Three.js CPU tests substitute texture objects. No quota blocker was encountered during these bounded checks.
