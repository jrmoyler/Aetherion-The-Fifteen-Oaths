# Reference repair comparison 04 — unapproved

[Open the side-by-side gallery](index.html). This additive checkpoint contains actual editable Blender geometry, exported GLBs, PBR maps, CPU renders and independent evidence. Original reference sheets remain unchanged. **None of these candidates exactly matches its reference or is accepted for production.** The previous [review 03](../representative-revision-03/index.html) remains intact; the default production catalog and acceptance counts are unchanged. The [Three.js preview](../../../../app/production-preview/README.md) can opt into these SHA-pinned review models with `AETHERION_INCLUDE_REVIEWS=1`; review loading does not promote them into production.

| Candidate | Actual change | Scoped evidence | Remaining visual gap |
| --- | --- | --- | --- |
| Kiln ninja V6 | Connected face volumes, eyelid and hair changes; corrected vertex-color export | Two final face views only; four GLBs imported in Blender/Godot/Three.js CPU; zero Khronos errors/warnings; 45 animation bounds samples agree within 3.65e-7 m | Eyes, profile whites, nose, lip projection, jaw and plate-like hair; further focused repair required |
| Fault blade V10 | Staggered cleavage, uneven mineral overlaps, transmissive closed crystal with internal solids, layered guard; actual topology/UV repair retains tangents | Six final renders; final GLB imported in Blender/Godot/Three.js CPU; zero Khronos errors/warnings, six informational unused tangents | Cracked-cell shell, continuous crystal slit and simplified guard/pommel/grip |
| Impulse shield V8b | Restored separate broad reverse armor after V8 regression; paired casings and segmented hub retained | Eight final CPU views; zero GLB errors, 413 generated-tangent warnings; 721 quarter-frame samples with zero intergroup surface contacts; Blender/Godot/Three.js CPU imports | Plain stowed hardware, rear frame/straps, uniform finish and wearer fit |

Ninja V6 is a **focused two-view diagnostic**, not a completed 19-view character revision. Its body, cape, bracer, stance, rig, animations and sockets were preserved from V5. Primary geometry is 47,708 triangles; performance has not been measured. [Front comparison](kiln-ninja-v6/front-comparison.png) and [profile comparison](kiln-ninja-v6/profile-comparison.png) show the remaining mismatch directly.

Fault's final GLB is `fault-v10/amethyst-short-blade/review.glb`. The separate `fault-v10/diagnostic-before-uv-repair/review-with-omitted-tangents.glb` is a preserved **superseded diagnostic, not the final export**. The final repair triangulated and unwrapped four affected meshes and retains every tangent attribute. It does not use tangent omission as its solution. Historical diagnostic files are included because the frozen authoring receipt names them; they are not additional produced assets.

Shield V8b remains 0.53 × 0.95 m deployed and 0.25 × 0.95 m stowed in width/height. The source’s horizontal 25 cm annotation is stowed width. Height stays 95 cm throughout the action. Eight rigid bones use translation/rotation with no scale animation. The carriage moves normal to the face to clear the lateral fold; it does not telescope in height. Sampled triangle-surface clearance does not prove continuous swept clearance, containment, strength or forearm fit. See the [reverse regression/repair comparison](impulse-shield-v8b/reverse-coverage-comparison.png) and [authoring notes](impulse-shield-v8b/README.md).

There are **six final GLBs**: three ninja visual LODs, one ninja collision mesh, one Fault blade and one shield. The seventh GLB is the superseded Fault diagnostic described above. Three editable `.blend` files are included.

## Independent evidence

- [Ninja pixel review](independent-review/ninja06.md), [Fault pixel review](independent-review/fault10.md): all 28 and 47 frozen authoring hashes respectively matched. Both reviews require further repair.
- [Ninja imports](independent-imports/ninja06-summary.md), [Fault imports](independent-imports/fault10-summary.md): actual Blender source opening and GLB import, Godot import/instantiation and Three.js geometry/material/skin/animation CPU checks. Input bytes remained unchanged.
- [Ninja vertex colors](independent-imports/ninja06-colors.json): nonwhite colors survive all three visual LOD exports. Godot/Three.js rendered color parity remains unverified.
- [Shield imports](independent-imports/shield08b-summary.md): 82 animated bounds samples agree with Blender within 1.58e-6 m; a 1 cm negative fixture is rejected. Generated-tangent warnings remain unresolved.
- [Shield pixel review](independent-review/shield08b.md): restored reverse coverage resolves the V8 regression; exact source fidelity remains open.
- [Manifest](review-manifest.json) records original reference hashes, gallery views and sources. [Evidence](evidence.json) hashes every delivered file except itself, including retained logs and authoring receipts.

Three.js import checks substitute textures explicitly and therefore do not certify image decoding or rendered PBR appearance. Godot checks run headless and do not certify GPU shading. No Unreal import, browser GPU pass, gameplay performance, exact likeness, wearer fit or owner art acceptance is claimed.

## Reproduction and scope

Packed `.blend` files, external maps and executed recipes are included. Historical recipes and evidence retain their original temporary/workspace paths. Use a scratch copy and adjust output/dependency roots to rerun; portable or byte-identical rebuilds are not certified. Frozen source records are copied unchanged. The publication manifest maps their local paths to bundled destinations, and all frozen authoring files are included.

This checkpoint does not complete Phase I or II. It accepts no new asset family and does not promote these candidates into the production catalog. Full asset, world-system and engine obligations remain tracked by the main production ledger.
