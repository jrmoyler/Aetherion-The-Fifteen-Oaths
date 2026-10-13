# Reference repair comparison — unapproved

[Open the side-by-side gallery](index.html). It displays unchanged original sheets beside Blender CPU renders of actual geometry, with selectable front, profile, detail and fit views. These are editable review candidates, not image billboards or production replacements. No additional asset family is accepted by this bundle.

The Kiln ninja V5, Fault blade V9 and Impulse shield V7 revisions were authored after work resumed. Chronal V6 and Graft pass06 were preserved earlier revisions and are now published with editable sources and independent review. Their differences from the references remain explicit in the gallery and authoring notes.

## Revised geometry and checks

| Candidate | Actual repair | Scoped validation | Remaining material issue |
| --- | --- | --- | --- |
| Kiln ninja V5 | Face/neck/hair geometry and measured lower-leg stance, with corresponding rest-bone changes | Four GLBs: zero errors/warnings; Blender, Godot and Three.js CPU imports; 45 sampled animation bounds agree within 3.65e-7 m | Likeness, hair, armor, tailoring and boots; 64,098 primary triangles, unmeasured performance |
| Fault blade V9 | Layered fractures, wider crystal opening, narrower guard and revised material values | One review GLB: zero errors, 139 generated-tangent warnings; Blender/Godot/Three.js CPU imports | Regular mineral divisions, uniform crystal and simplified guard/pommel |
| Impulse shield V7 | Lift bearings, fork connections, travel slots and folding sequence | 721 quarter-frame intergroup clearance samples; one GLB: zero errors, 312 generated-tangent warnings; Blender/Godot/Three.js CPU imports | Flat casing, uniform surfaces, proposed hidden mechanism and unverified wearer fit |

The shield remains 0.53 × 0.95 m deployed and 0.25 × 0.95 m stowed in width/height. Depth is 0.227 m stowed and up to 0.554 m during movement, including straps. The clearance test samples triangle surfaces; it does not prove continuous swept clearance, containment, strength or body fit. Eight rigid bones use translation/rotation with no scale keys.

[Kiln front comparison](kiln-ninja-v5/front-comparison.png) · [Kiln face comparison](kiln-ninja-v5/face-comparison.png) · [Kiln notes](kiln-ninja-v5/REVIEW.md) · [Shield notes](impulse-shield-v7/README.md)

## Included evidence

- [Independent imports](independent-imports/ninja05-summary.md), [shield import summary](independent-imports/shield07-summary.md), and [Fault import summary](independent-imports/fault09-summary.md). Complete issue lists, input hashes, scripts and logs are retained beside these summaries. Three.js tests substitute textures and do not certify texture appearance. Godot tests import and instantiate; they do not certify GPU rendering.
- [Independent final ninja pixel review](independent-review/ninja05.md) and [shield pixel review](independent-review/shield07.md): 50/50 and 46/46 frozen authoring hashes matched. Both remain visibly below reference fidelity.
- [Manifest](review-manifest.json): original reference hashes, selected views and editable sources.
- [Fault authoring evidence](fault-v9/REVIEW_EVIDENCE.json), [source inspection](fault-v9/source-inspection.json), and [material hypothesis check](fault-v9/non-color-map-audit.json). The proposed gamma-defect explanation was disproved; do not attribute the appearance changes to that hypothesis.
- [Independent Fault V9 review](independent-review/fault09.md): all 31 frozen hashes matched; the saved source reopened with 16 packed maps byte-identical to the external files.
- [Independent Chronal/Graft pixel review](independent-review/preserved-review.md) and [full hash verification](independent-review/preserved-hash-verification.json). All 34 Chronal and 63 Graft authoring-record files matched, including local historical diagnostics not duplicated in this bundle.
- [Actual Blender source reopening](independent-review/preserved-source-open.json): Chronal tool, neutral fit fixture and Graft staff opened in Blender 4.3.2 with their textures packed; input bytes remained unchanged.

## Reproduction and scope

The packed `.blend` files are editable without the original temporary directory. External maps and the executed source recipes are included. Some historical recipes retain absolute authoring-workspace paths; use a scratch copy and adjust their output/dependency roots before rerunning. A portable or byte-identical rebuild is not certified. Original evidence may refer to preserved diagnostics or local logs outside this selected publication bundle; its paths describe the original run, not a claim that every historical file is bundled here.

Source inspection, file hashes, static renders and CPU imports answer different questions. None establishes exact reference fidelity, final character contact, GPU shading, gameplay performance, Unreal compatibility or owner art acceptance. The existing runtime assets and acceptance counts remain unchanged. The six new review GLBs have scoped import checks recorded here, but are excluded from production/runtime delivery. Tangent-space rendering, visual acceptance and full gameplay validation remain required before promotion.
