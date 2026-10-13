# Kiln ninja V9 — focused eye/socket checkpoint, unapproved

V9 changes the eye/socket construction of frozen V8b after inspection of actual reference090 and the parent's revision04 visual guidance. Two front/profile iterations were inspected. Prior V9 pass1 is preserved locally; no full-body or nineteen-view pose run was performed.

Closed ellipsoidal ocular globes replace floating fan-shaped eye patches. Curved concentric iris/pupil geometry follows each globe. Connected head/socket loops form wrapping upper/lower eyelids, and attached canthal tissue closes most dark corner pockets. A thin upper eyelid margin follows the new aperture. The large circular white badge formerly visible in true profile is removed in the actual CPU views. A tiny bright sliver in profile and imperfect angular canthus edges remain. Front eyes have more socket depth, but neither eye appearance nor facial likeness is approved. There is no independent ocular/facial animation rig or corneal optical certification.

Nose, lips, chin, ear, hair, body, cape, bracer, stance, rig and clip authoring are retained from V8b. The pointed nasal profile, lip/chin contour, polygonal ear rim, patterned hair/cap and sparse nape strips remain open. Geometry changes are contained in face_anatomy; main only additionally enables compressed .blend saves. Preserved-function AST evidence includes both hairstyle functions. Exported bytes may regenerate, especially UV/tangent data and globally decimated LODs; do not infer blanket byte preservation from unchanged authoring logic.

Primary56,234 triangles versus V8b54,212 (+2,022); LOD1 34,301 versus33,068 (+1,233); LOD2 19,118 versus18,432 (+686); collision76 unchanged. Proposed budgets remain unmeasured. Author-side Khronos checks find zero errors and warnings in all four GLBs. Independent import/rig/bounds/pixel evidence is separate; no GPU appearance, gameplay, Unreal, fit or art approval follows from CPU validation.

The packed editable Blender source is compressed using Blender's supported save option; source-compression-evidence.json records actual before/after bytes and hash. Source, four GLBs, four PBR maps, two CPU images and final recipe are frozen by geometry-freeze-receipt.json. The image views use the same geometry/materials as the packed source; compression alone does not edit those data.

Reproduce without overwriting frozen evidence:

```sh
AETHERION_REVIEW_OUT=/tmp/ninja-v9-reproduction blender -b -t 6 --python /tmp/ninja-v9/kiln_ninja.py -- --face-diagnostic
```

The output directory defaults to the recipe's directory in review mode, and all images are packed in the saved source. Append `--export-only` for source/GLB/map export without rendering. RNG seeds remain deterministic; byte-identical Blender/GLB rebuilds are not promised.
