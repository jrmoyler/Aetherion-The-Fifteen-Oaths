# V16 — left ceramic bracer construction checkpoint

**PROPOSED / UNAPPROVED.** Isolated successor to frozen V15; no repository changes or publication. Original reference090, frozen V13/V15, and all prior review bundles are untouched. The complete character is not production accepted.

## Scope and deliverables

The character-left bracer (viewer-right in front) now has a continuous curved terracotta shell, substantial closed top/bottom/side margins, three actual rounded horizontal apertures, thickness and beveled edges, a fitted iron side spine, two short latch tabs with separate three-knuckle barrels/through-pins, four small fasteners and two closed leather retention straps. The existing leather underwrap remains behind the apertures. All new parts are rigidly weighted to the existing `forearm.L` bone; this adds no rig or animation count.

`kiln-ninja-ensemble-candidate/` contains the compressed, packed editable Blender source, primary/LOD1/LOD2 GLBs, unchanged collision GLB and four unchanged original PBR atlas maps. New bracer UV islands occupy the original ceramic/iron/leather atlas regions. This checkpoint authors geometry and UVs; it does not claim new texture maps or improved overall skin/hair material quality. Source parts remain separately editable; runtime exports use appended skinned primitives.

Final actual CPU renders: 16 images, matched V15/V16 front/back/side/hero, close front/near/far bracer views, and cast frame25. `render-evidence.json` pins every image, source hash, camera, clip and frame. Eight paired comparisons and `all-views-contact-sheet.png` summarize them. Three earlier diagnostic directories preserve rejected intermediate pixels and recipes but are excluded from final freeze allowlists.

## Preservation and export strategy

The source opens exact V15, removes only 12 identified disconnected old ceramic ladder/hinge/clasp islands, and adds the new bracer. `source-removal.json` lists exact vertex IDs, UV regions, bounds and counts. `source-preservation.json` verifies unchanged positions/weights/face UV-material-smoothing semantics outside those islands, rig and all action curves, including V15's dense walk pelvis correction. Original packed image bytes match.

Exports preserve the original V15 binary prefix, every original accessor definition, nodes/skins/inverse-bind data, all animations (including dense walk sampler), original materials/textures/images and collision. Only the old bracer's triangle indices are removed from active draws. New component primitives and filtered index buffers are appended. `export-preservation.json` records removed triangle rows, semantic bounds, index hashes and new primitive hashes. Old inaccessible geometry remains in the preserved binary prefix; this is intentional evidence preservation, not asset-size optimization. Simplification affects only new bracer components.

| Active rendered triangles | V15 | V16 | Delta |
|---|---:|---:|---:|
| Primary | 57,284 | 60,888 | +3,604 |
| LOD1 | 34,942 | 37,288 | +2,346 |
| LOD2 | 19,476 | 20,892 | +1,416 |
| Collision | 76 | 76 | 0 |

New bracer alone: **4,332 / 2,814 / 1,732** triangles. Removed old bracer: **728 / 468 / 316** triangles. Exported V15 LOD1 actually has 34,942 active triangles; earlier source-based 34,943 is not reused as an export count. Budgets remain proposed and unmeasured in gameplay.

## Validation and open gates

Author source preservation checks pass; all new source components are closed manifold meshes. Four actual final GLBs pass Khronos with **zero errors and zero warnings**. Independent verifier is checking actual Blender/Godot/Three imports, animation preservation, posed attachment fit and dense grounding against fixed **world Z=.012m**, not world Z0. Technical results are maintained separately by the verifier; no GPU or gameplay parity is inferred here.

Expanded independent audit already found **zero degenerate triangles and zero collapsed UV triangles in the new bracer** at all three LODs. It also found inherited whole-character defects: exact zero-area primary triangles **1,608 in V15 → 1,520 in V16** (88 removed with the old bracer); whole-character collapsed UV triangles **300 / 199 / 72** outside the new primitives. Those remain open. A Khronos pass does not negate these stronger checks. No unrelated cleanup was performed.

Independent final pixel review checked all eight pairs and 16 hashes and judged a concrete scoped construction/likeness improvement, unapproved. Broad retention bands and a lower edge proud of the sleeve remain a fit/finish gap. Remaining appearance and behavior limitations are in `DEFECT_LEDGER.md`. In particular: simplified aperture/latch shapes, uniform atlas pitting, forward-biased plate orientation versus some source views, and inherited hair/face/torso/mask/cloth gaps remain. Sampled cast fit and closed mesh topology do not certify collision-free continuous motion or physical latching. V15 walk-to-idle blending, sliding, terrain/contact IK and GPU/gameplay validation remain open.

## Reproduction

Blender 4.3.2 CPU, Python3 with NumPy/Pillow, and the existing glTF validator installation were used. Work in a **new scratch copy**, never overwrite frozen output. `baseline/` contains exact V15 source and four GLBs; `reference090-original.png` is an unchanged copy of the inspected original. No new provider/image generation is involved.

```sh
cp -a /workspace/scratch/ninja-v16 /workspace/scratch/ninja-v16-rebuild
cd /workspace/scratch/ninja-v16-rebuild
blender -b --python inspect_components.py
blender -b --python author_bracer.py
blender -b --python export_components.py
python patch_exports.py
blender -b --python check_source.py
blender -b --python check_components.py
blender -b --python render_compare.py
python make_comparisons.py
```

All authoring/output paths resolve relative to the copied recipe directory. `validate.mjs` uses the current workspace's installed glTF-validator package; set the package import for another environment. Blender rebuilds are reproducible in construction and checks, not asserted byte-identical across saves/platforms. Do not replace this candidate's final receipt with a rebuild's hashes.
