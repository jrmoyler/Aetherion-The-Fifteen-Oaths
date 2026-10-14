# Kiln ninja revision 05 — proposed geometry repair

This isolated candidate follows direct pixel inspection of original references 090 and 060 and revision04's front/unmasked front/profile diagnostics. It is not promoted to the production asset directory and is not visually accepted.

Repairs authored here:

- Continuous face surface: smaller nasal-tip projection, deeper chin/jaw transition, lip and eyebrow details seated closer to the facial surface, and smaller lateral ear projection.
- Hair ribbons oriented around the local scalp normal, with thinner shells and overlapping shorter side tufts replacing the long, edge-on comb pattern visible in revision04 profile.
- Knee and ankle spacing adjusted from hand-picked reference090 proportions. Lower-leg mesh vertices and corresponding rest bones are adjusted together; original source artwork and repository production files are untouched.

Comparison images contain unchanged source crops alongside actual Blender CPU renders. Framing is for inspection, not a calibrated scan comparison. Reference landmarks have approximately ±5px manual-picking uncertainty. The face panel uses a different scale from the fullbody turnaround.

Remaining mismatches: face likeness and eyelid shaping, hair clump flow, ceramic chest plate silhouette and fastening detail, tailored trouser folds and pockets, boot details/foot yaw, cloth/material weave and wear, shoulder/cape anatomy. The procedural maps are authored candidate PBR maps, not a match certification. Wider rest stance requires gameplay gait/grounding review. Facial expressions, speech rig, cloth simulation, weapon fit, GPU materials, Unreal import and device budgets remain open.

Reproduction (Blender 4.3.2 CPU):

```
blender -b -t 2 --python /tmp/kiln-ninja-revision05/kiln_ninja.py -- --full-review
blender -b -t 2 --python /tmp/kiln-ninja-revision05/kiln_ninja.py -- --preview --verify
python /tmp/kiln-ninja-revision05/make_comparisons.py
```

The recipe intentionally targets this isolated review directory. The source .blend contains packed textures, rest skeleton, sockets and three candidate clips. The collision hull is only a coarse proposed navigation hull, not animated combat hitboxes. Reproduction also uses the preserved revision04 images and original reference090 when generating the comparison sheets.

Technical evidence on frozen geometry:

- Blender 4.3.2 reopened the packed source and imported all four GLBs, with 38-bone rigs and three clips on each visual LOD.
- Independent Godot headless instantiation passed for all four GLBs.
- Independent Khronos checks reported zero errors and zero warnings; the collision export has one informational issue.
- Forty-five sampled animation bounds agreed between Three.js CPU skinning and Blender within 0.000000365 meters. No invalid weights or scale shrink was found. This is sampled bounds evidence, not per-vertex or GPU certification.
- All nine frozen geometry, texture and recipe hashes matched the independent receipt.
- Rest knee/ankle center spacing is now 0.162/0.233 of model height versus approximate source measurements 0.157/0.228. Bone centers and painted garment centers are not identical landmarks; these ratios support review rather than certify an exact match.

Detailed independent results are copied unchanged into `independent-import-receipt.json` and `independent-bounds-comparison.json`. Full independent audit artifacts remain under `/tmp/aetherion-resumed-import-checks/`.

Final inspection: all nineteen rendered views/pose samples and the contact sheet were produced successfully; front, profile, unmasked profile and contact sheet were inspected directly. The upper-neck breakthrough visible in the first local pass is removed. The head remains stylized and the reference's hair flow, facial anatomy, fitted ceramic plates, cloth folds and boot construction are still materially different. This revision is a review checkpoint, not a finished character.

Geometry cost: 64,098 primary triangles, 39,098 LOD1, 21,793 LOD2; 38 bones, 32,850 source vertices, 1,473 vertices with multiple influences and zero unweighted vertices. The increased tuft geometry has not passed a measured device budget and requires further optimization. No performance claim is made.

All 32 protected source/reference/repository-production inputs were hash-checked after authoring and remained unchanged (`protected-input-verification.json`). No repository edits, commits, uploads, merge or deployment were performed by this authoring task.
