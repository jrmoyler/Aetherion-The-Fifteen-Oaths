# Kiln ninja V11 — ear geometry checkpoint, unapproved

Original090 front and profile ear pixels were inspected before authoring. The prior octagonal rim is replaced by a closed pinna shell with a rounded helix, recessed concha, bifurcated antihelix, tragus and antitragus folds. The second pass reduces rim projection and draws the lower shell into the cheek. Two actual CPU views were inspected per pass; final comparisons use pass2. Failed first-pass views and recipe remain under diagnostic-pass1 and are not final deliverables.

This improves the angular ear silhouette, but does not match the source's fleshy asymmetry. The helix is still regular and thick, inner folds read somewhat like cords, and small prominences remain in the front silhouette. It is an unapproved diagnostic checkpoint, not accepted art. Hair cap, repeated thick parallel locks and sparse nape coverage remain prominent defects. The broad bridge and weak lower facial planes remain. The V9/V10 seated eyes removed the conspicuous V8b profile white disk; a small bright sliver and canthus defects remain.

Only the ear block inside face_anatomy changed from V10. face-block-preservation.json verifies exact preceding function text, including surface/nose, jaw, eyes, lids, canthi and brows. All other authoring functions, body, cape, stance, hairstyle, rig and animation remain unchanged. UV/tangent regeneration and combined global LOD decimation can still change exported buffers; no blanket exported non-ear equality is claimed.

Measured triangles: primary 57,598 (+1,364 vs V10); LOD1 35,134 (+833); LOD2 19,582 (+464); collision 76 (unchanged). Proposed performance budgets remain unmeasured. All four GLBs pass the author Khronos structural check with zero errors and warnings. This does not certify visual quality, gameplay, GPU appearance, Unreal imports or collision fit. Independent checks are separate.

The compressed source packs four PBR texture maps. geometry-freeze-receipt.json freezes the recipe, source, four exports, four maps and two final renders. Prior frozen candidates and the repo remain untouched.

Reproduce into a new directory:

```sh
AETHERION_REVIEW_OUT=/tmp/ninja-v11-reproduction blender -b -t 6 --python /tmp/ninja-v11/kiln_ninja.py -- --face-diagnostic
```

The recipe is standalone, defaults to its own directory and uses deterministic seeds. Do not rerun into frozen directories. Byte-identical Blender/GLB rebuilds are not promised. --export-only skips the two renders; no nineteen-view pose suite was run.
