# Independent Ninja V8b imports and preservation

SCOPED CPU CHECKS PASS. All 12 frozen inputs match receipt SHA256 `2ae1e787275780e25f429b2dd38a25362a567ac4a303ca79d51047816aee4b10`.

- Actual Blender source opening/four GLB reimports, Godot 4.6.3 headless scene instantiation, and Three.js CPU checks pass. Inputs remain unchanged.
- Four GLBs have zero Khronos errors and warnings; collision GLB retains one UNUSED_OBJECT informational message.
- 45 animated world-bound comparisons agree within 0.000000364117 m; the deliberately translated 1 cm negative fixture rejects.
- Source SHA256 `34ed4dbeb3a3b7d6598525b4c1f2072deef1059103b4e35fc6006e3af9162153`; primary GLB SHA256 `187afb5cca521618932237ea11914f5bfad9617c7f2fe8c4cc6749fce05c50f6`.

## Preservation against frozen V7

Normalized recipe AST comparison finds only hair_lock/designed_hair function changes, plus an os import and portable output-path assignment. Face/body/rig authoring functions remain unchanged. Exact semantic export comparisons show all skeleton nodes, inverse bind matrices and animation sampler data unchanged in all three visual GLBs; collision geometry is identical.

Primary body and face POSITION/NORMAL/COLOR_0/JOINTS_0/WEIGHTS_0 accessor bytes match V7 exactly. Body tangents and face UV/index/tangent data differ after regeneration. Both lower LODs also change nonhair geometry under whole-mesh simplification. Therefore this is a hair-focused recipe revision, not a byte-identical preservation of all exported nonhair data. Exported face tint remains active, as recorded in ninja08b-colors.json.

## Preserved failure and limits

Initial V8 failed Khronos because its new hair material roughnessFactor was 1.25. Those failed reports remain in ninja08-initial-invalid. V8b corrects the source material using a dedicated hair ORM map and a legal scalar; validation confirms that specific export error is gone.

No GPU appearance, texture-decoded Three.js rendering, exact material parity, visual fidelity, Unreal compatibility or production acceptance is established. Three.js CPU imports use placeholder texture objects.
