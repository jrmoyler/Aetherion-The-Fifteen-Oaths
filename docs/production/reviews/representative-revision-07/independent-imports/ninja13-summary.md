# Independent Ninja V13 verification

SCOPED CPU CHECKS PASS. All12 frozen inputs match receipt SHA256 `be5ba5026ab5bfdecff14065e0684bc961af5a27cbc270f02a1e1d74ccd3b29e`.

Actual Blender source opening/four GLB reimports, four Godot4.6.3 headless scene instantiations, Three.js CPU checks and four Khronos validations pass. AllGLBs have zero errors/warnings; collision has one UNUSED_OBJECT informational message.45 animated world-bound samples agree within0.000000364117m; the1cm translated negative fixture rejects. Input bytes remain unchanged.

Normalized recipe AST against frozenV11 changes only hair_lock/designed_hair; complete face/ear, body, rig and animation authoring remain unchanged. Exported skeleton nodes/inverse-bind matrices and animation sampler data match V11 exactly for allthree visualLODs. Primary body and skin position/normal/UV/color/joint/weight accessors match V11; tangents regenerate. The original soot material primitive used by small facial features matches exactly; the dedicated hairstyle material is replaced. Lower-LOD simplification can regenerate nonhair geometry, so this is not blanket exported-byte preservation. Actual face COLOR_0 remains active:389/98/44 nonwhite vertices in primary/LOD1/LOD2.

Source SHA256 `5d1fb9fc7042a22dff33939baa3614adbde520c0e77d55d7aa5472e52b14e114`.
PrimaryGLB SHA256 `7793be5b07e696b4529041444e6ba33f15c3642644736e62579be0c021d6391f`.

No GPU appearance, texture-decoded Three.js rendering, exact likeness, Unreal compatibility or production acceptance is established. Three.js CPU tests use placeholder texture objects.
