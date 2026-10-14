# Actual Godot Daybreak consumer checks

The included receipt pins all eight source files and the exact r03 asset freeze. All 691 headless checks pass, covering 51 visual LODs, 15 unique authored colliders, PBR decoding, animation, resource cleanup, malformed inputs and inspector failed-selection recovery. The inspector also starts headlessly without diagnostics.

A prior inspector bug mislabeled a retained model after a new load failed. The repaired UI commits selection and LOD only after successful import and shows the failed request separately. This is a code/runtime check, not desktop-control or GPU appearance approval.

Use [the project validator](../../../engines/godot/daybreak-preview/README.md) with a new external output directory. Original execution paths in receipts remain unchanged; included source hashes identify the published code and assets. Unreal, rendered material parity and final art approval remain open.
