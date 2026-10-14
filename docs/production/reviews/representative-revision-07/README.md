# Focused reference repair review 07 — unapproved

[Open the comparison gallery](index.html). Frozen Ninja V13 and Fault V12 contain real editable geometry and **four final CPU diagnostic views, two per candidate**. Both remain below original-reference likeness. No new production acceptance or full character/weapon completion is claimed; prior bundles and production assets remain unchanged.

The [parent review05](../representative-revision-05/PARENT_VISUAL_REVIEW.md) was read before the independent V13 assessment. It is pinned to its historical reviewed head, not a review of these later candidates. Its acceptance priorities remain relevant; the independent reports below identify what changed and what is still open.

| Candidate | Visible repair | Remaining discrepancies |
| --- | --- | --- |
| Ninja V13 | Rounded ear folds replace V10 polygon rim; fuller connected side/back coverage and asymmetric front sweep; V12 horizontal tier break removed | Broad smooth repeated locks, exposed crown/cap areas, thick cord-like ear folds; retained eye, nasal and lower-face likeness gaps |
| Fault V12 | Broader crystal aperture and less uniform profile depth; corrected pointed tip | Continuous flat purple strip, broad tiled/terraced stone, bulky cuff guard, prism pommel and regular grip |

## Final artifacts and selected history

Two editable `.blend` sources and five final GLBs are delivered: Ninja primary/two visual LODs/collision plus one static Fault blade. All **30 Ninja and 63 Fault authoring records** match their frozen manifests. Fault's initial diagnostic/failure files are preserved as explicitly superseded evidence, not additional final assets. [Publication origins](publication-origins.json) records source locations and hashes.

[Selected V11/V12 history](historical-diagnostics/README.md) includes comparison pixels, author notes and actual geometry/full-hash receipts. Complete intermediate sources/GLBs/maps are not duplicated. Historical receipts retain original external paths and do not claim those missing exports are bundled. The V13 comparison's intermediate image is V12; published V10 was also inspected independently. No separate V11 ear bundle is implied.

## Independent checks

- [Ninja V13 pixel review](independent-review/ninja13.md): all 30 frozen authoring files match; concrete ear/hair improvements and remaining defects recorded after reading the parent review.
- [Fault V12 pixel review](independent-review/fault12.md): all 63 frozen authoring files match; broader exposure/depth changes remain insufficient for exact mineral/crystal/hardware construction.
- [Ninja imports/preservation](independent-imports/ninja13-summary.md): real Blender source/four GLB imports, Godot headless instantiation, Three.js CPU and Khronos pass. Four GLBs have zero errors/warnings; 45 animated bounds samples agree within 3.65e-7 m and a displaced 1 cm fixture rejects.
- [Fault imports](independent-imports/fault12-summary.md): real Blender/Godot/Three.js CPU checks, zero Khronos errors/warnings and six unused-tangent infos. Static bounds agree within 2.33e-10 m; displaced 1 cm fixtures reject.
- V13 comparison against frozen V11 finds only the hair-lock/designed-hair recipe functions changed. Exported skeletons, inverse bind matrices and clips match. Primary face/body position, normal, UV, color and skin data match; tangents regenerate. Lower LODs are not claimed byte-identical. Exact preservation details remain in the reports.

These are scoped CPU/headless results. Three.js imports substitute texture objects; GPU PBR appearance, optical parity, texture-decoded browser rendering, Unreal compatibility, character contact/collision fit, full gameplay and owner art acceptance remain open. Static weapons need no artificial deformation rig. No gamma-corruption diagnosis is claimed.

[Evidence](evidence.json) hashes every delivered file except itself, including logs. Run `python docs/production/reviews/representative-revision-07/verify_bundle.py` for exact bytes, original reference hashes, PNG decoding and local HTML links. Recipes/helpers retain historical paths; packed sources are editable, and rebuilds should use a fresh scratch output with dependencies adjusted. Portable or byte-identical reproduction is not certified by this bundle. The [preview README](../../../../app/production-preview/README.md) separately documents its current opt-in selection; this package alone does not change that selection or production status.
