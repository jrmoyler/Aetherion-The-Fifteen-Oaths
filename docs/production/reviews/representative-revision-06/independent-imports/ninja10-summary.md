# Independent Ninja V10 verification

SCOPED CPU CHECKS PASS. All12 frozen inputs match receipt SHA256 `c101cfea323cc84651253e9b9910c0ed0d3c8b3a62601917c88aa3d943f46a8c`.

Actual Blender source opening/four GLB reimports, four Godot4.6.3 headless instantiations, Three.js CPU checks and four Khronos validations pass. AllGLBs have zero errors/warnings; collision has one UNUSED_OBJECT informational message.45 animated world-bound samples agree within0.000000364117m; the1cm translated negative fixture rejects. No input bytes changed.

Against frozenV9, normalized recipe AST changes only face_anatomy. Hair functions, body construction, rig and clip authoring functions remain unchanged. Exported skeleton nodes/inverse-bind matrices and animation sampler data remain identical across all three visualLODs. Nested eye helper ASTs globe_front and lid_edge_y are unchanged; surface() changes, so outer orbital transition vertices must not be claimed identical merely because those helpers match. Material/primitive comparisons are recorded in the preservation JSON; no blanket unchanged non-face accessor claim is made.

Source SHA256 `da69c9b72acdc699fbf5961a344939874ff634d576993242d6860f737015fff8`.
PrimaryGLB SHA256 `3be23b8cb9188fad78980ae3b7a1c74960ce829b68bfa44141e0735ad713dd01`.

No GPU appearance, texture-decoded Three.js rendering, exact likeness, Unreal compatibility or production acceptance is established. Three.js CPU tests use placeholder texture objects.
