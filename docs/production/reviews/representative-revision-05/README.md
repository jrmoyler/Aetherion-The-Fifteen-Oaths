# Focused reference repair review 05 — unapproved

[Open the comparison gallery](index.html). This additive checkpoint contains two focused experiments with actual editable Blender geometry and final CPU renders. Neither is an exact reference match. The previous [review 04](../representative-revision-04/index.html) remains intact, including its separately recorded parent review addendum. No asset family is accepted and no candidate is promoted into the production catalog.

| Candidate | Actual changes | Independent scoped checks | Remaining visual gaps |
| --- | --- | --- | --- |
| Kiln ninja V8b | Reduced major crown opening; denser upper-side hair; dedicated hair ORM and legal roughness factor repair failed V8 export | Four GLBs: zero errors/warnings; real Blender/Godot/Three.js CPU imports; 45 animated bounds samples within 3.65e-7 m | Mixed result: flatter repeated fringe, exposed forehead cap, sparse pointed nape strips; V7 eye/nose/lower-face defects remain |
| Fault blade V11 | Real thinner layered depth, contained crystal, browner leather and varied crystal boundary | Final GLB: zero errors/warnings, six unused-tangent infos; Blender/Godot/Three.js CPU imports and static bounds with 1 cm negative fixtures | Broad flat stone cells, narrow zigzag crystal channel, simplified cylindrical guard, prism pommel and regular grip |

There are **four final CPU renders: two per candidate**, not full character or weapon render sets. V8b is the latest explicitly unapproved hair experiment, **not a uniform fidelity upgrade over V7**. The crown coverage gain is offset by a flatter patterned fringe and unresolved scalp gaps. Fault V11 likewise changes actual depth without solving the main source construction differences. The gallery and independent pixel reports make those limits visible.

## Final and historical artifacts

The final delivery has two packed `.blend` sources and five GLBs: ninja primary/two visual LODs/collision, plus the static Fault blade. No failed V8 GLB or full historical V7 export is duplicated. All 31 final ninja authoring files and 57 final Fault authoring files are included unchanged with their original receipts. [Publication origins](publication-origins.json) maps the original local roots to this bundle.

[Selected historical diagnostics](historical-diagnostics/README.md) retain V7/V8 comparisons and original receipts without their full sources/maps/exports. Those historical receipts describe original runs and do not assert that their entire file sets are delivered here. The failed V8 validator report is explicit: roughnessFactor 1.25 was outside the glTF range. V8b repairs that source material with a separate hair ORM map and scalar 1.0; all four final GLBs validate with zero errors and warnings.

## Independent evidence and reproduction

- [V8b pixel review](independent-review/ninja08b.md) and [Fault V11 pixel review](independent-review/fault11.md): final image inspection and matching frozen input hashes, with specific unresolved geometry priorities.
- [V8b imports/preservation](independent-imports/ninja08b-summary.md): actual source opening, four reimports, Godot instantiation and Three.js CPU checks. Skeletons, inverse bind matrices and animation samplers match V7. Primary face/body position, normal, color and skin accessor bytes match, but some UV/index/tangent bytes and lower-LOD nonhair geometry change during regeneration; whole-export identity is not claimed.
- [Fault imports](independent-imports/fault11-summary.md): actual static geometry imports and bounds checks. Measured candidate dimensions do not establish approved canon dimensions.
- [Ninja scratch reproduction](kiln-ninja-v8b/reproduction-evidence.json): output override rebuild ran and four scratch GLBs validated. Maps/collision match, but source and visual accessor bytes vary; a byte-identical rebuild is not certified.
- [Publication evidence](evidence.json) hashes every delivered file except itself, including logs. Run `python docs/production/reviews/representative-revision-05/verify_bundle.py` for bytes, original reference hashes, PNG decoding and local HTML links.

Three.js CPU imports substitute texture objects. Godot tests are headless. Neither verifies GPU PBR appearance, exact material parity, image-decoded browser rendering, Unreal compatibility, gameplay performance, wearer fit or owner art acceptance. The [Three.js preview](../../../../app/production-preview/README.md) documents its current explicitly opt-in review selection; this bundle alone does not change that selection or production status.

Historical recipes/evidence retain authoring paths. The final ninja recipe supports an output override; use a scratch destination. For other recipes, adapt dependency/output roots before rerunning. Packed sources remain editable. This is an in-progress Phase I/II checkpoint, not full-scope production completion.
