# V16 bracer: independent technical review

This is a scoped bracer revision with open character defects and attachment-fit questions. It is not full-asset, GPU, Unreal, gameplay or art certification.

Final author geometry receipt `b10f04f5b3433723b907a78aec4485800d53caed4e61ad77e522b9aa76773a5e` verifies57/57entries. Full manifest `70538e15d9126a48e72ebfbec297c0efd36b46bb0a1aa62b71c8a84faeabc9df` verifies72/72files,171,540,825bytes. All nine asset files remained unchanged throughout these checks.

## Scoped passes

- Four actual GLB imports in Blender4.3.2, Godot4.6.3 headless and Three.js CPU; Khronos zero errors/warnings.45 sampled Blender/Three animated-bound comparisons differ by at most0.423721micrometers; a1cm displacement negative rejects.
- V15 original BIN prefix, original accessor definitions, node/skin/animation JSON, materials and embedded images remain exact. All retained primitive attributes and ordered triangle subsets remain exact. Collision GLB bytes remain exact. The dense V15 walk sampler was preserved, not reconstructed by a normal export.
- Actual saved-source comparison reproduces exact unaffected positions/weights/face-material-UV-smooth semantics, rig, all actions and packed images. The12 removed source groups independently resolve to entire disconnected components. All new bracer vertices are rigidly weighted1.0 to `forearm.L`.
- Whole character triangles strictly decrease60,888/37,288/20,892; new bracer triangles4,332/2,814/1,732. Appended bracer primitives have zero degenerate geometry or collapsed-UV triangles at all LODs. Twelve embedded PNG occurrences were actually decoded.
- Saved source body plus every new bracer piece, Three.js all three visual LODs, and Godot all three visual LODs each evaluated1,089samples:993walk samples at1/32-frame spacing plus48idle and48cast frames. All128integer frames are included. No sampled floor penetration below worldZ/glTFY0.012m−1e-6m. Three minima are identical to V15. Godot was explicitly generated at192fps; its minimum differs from Three by at most0.519304micrometers. Each downward10mm negative rejects all993walk samples per LOD. No continuous-time or blending guarantee is inferred.

## Open inherited mesh defects

Each V16 visual LOD retains1,520 exact zero-area triangles in the original atlas primitive. V15 had1,608; this revision removed88 with the old bracer. Whole-asset nondegenerate triangles with collapsed UVs remain300/199/72 for LOD0/1/2, unchanged from V15. All are outside the appended V16 bracer primitives. `inherited-geometry-defects.json` records exact active triangle rows and asset hashes. These defects remain open and must not be hidden behind Khronos/import passes.

## Attachment-fit limits

Bracer forearm-local coordinates remain stable within0.626micrometers across the sampled actions. This proves sampled rigid attachment, not body clearance. Nearest-body-normal signed-distance diagnostics at cast frames1/13/25/37/48 flag values down to−4.597mm(lower leather band),−1.970mm(hinge),−1.370mm(upper band), and−0.511mm(ceramic plate). They remain essentially static across those cast poses. The body contains open/intersecting geometry, so this signed-nearest-surface method cannot certify volumetric penetration. Treat the readings as unresolved fit/intersection candidates, not a clean collision-fit pass. Pixel review is separate.

Godot's V15 default30fps bake previously produced larger support gaps, up to3.336mm. V16 preserves the exact animation data; this review explicitly uses192fps and does not silently change or certify the production default importer. The final source fit diagnostics arrived after the author freeze and are preserved here separately.

## Reproduction

The original scripts and logs retain the exact tested paths. To relocate the harness without altering frozen inputs, run `prepare-rerun.py --repository <repo> --candidate <author-V16-root> --baseline-v15 <author-V15-root> --output <empty-scratch-directory>`. This prepares scripts and the request only; it does not claim new tests ran. Dependencies are the repository's installed Three.js/gltf-validator, Python NumPy/Pillow, Blender and Godot. Run `python run_checks.py ninja16`, the individual `check-*.py` scripts with Python or Blender as their imports require, `ground-three.mjs`, and `run-godot-192fps.py` from the prepared directory. Full tests remain optional future work; this review did not repeat unrelated production checks.

No repository, publication or frozen-candidate edits were made. Curated evidence excludes assets and caches.
