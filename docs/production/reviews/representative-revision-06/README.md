# Focused reference repair review 06 — unapproved

[Open the comparison gallery](index.html). This additive checkpoint contains frozen Ninja V10 face geometry and **two final CPU diagnostic renders**, with selected V9 eye-repair history. The previous [review05](../representative-revision-05/index.html) and production assets remain unchanged. No character or asset family is accepted.

V9 reduced the large exposed profile white eye disk from V8b to a small sliver and added wrapping eyelid depth. V10 reduces the sharp nasal projection and reshapes lip/chin contours while retaining that eye repair. Both remain below original090 likeness: tip/ala and mouth/chin planes are weak, canthi are pinched, eye openings still look cut into the face, and repeated hair strips, cap/nape gaps and the polygonal ear remain conspicuous. These are bounded geometry changes, not exact matching or full character completion.

## Final artifacts and lineage

V10 includes one compressed editable `.blend`, primary/two visual LOD/collision GLBs, four PBR maps, two final rendered views and its authoring recipe/evidence. All 26 frozen authoring files match the unchanged author manifest. Compression reduces source storage size without implying lower runtime geometry cost.

[Historical V9 records](historical-diagnostics/README.md) include actual front/profile comparisons, the original geometry freeze receipt and full original SHA256 list. Complete V9 exports are intentionally not duplicated. Their local receipt paths refer to the original external authoring run and do not claim missing GLBs are bundled. The gallery marks those comparisons as historical.

## Independent evidence

- [V9 pixel review](independent-review/ninja09.md): all 28 original authoring hashes matched during the independent review; eye occlusion improved but likeness remained unaccepted.
- [V10 pixel review](independent-review/ninja10.md): all 26 final authoring hashes matched; specific remaining nose/lip/chin, orbital, hair and ear gaps recorded.
- [V10 imports and preservation](independent-imports/ninja10-summary.md): actual Blender source opening and four GLB reimports, Godot headless instantiation and Three.js CPU checks. Four GLBs have zero Khronos errors/warnings. Forty-five animated bounds samples agree within 3.65e-7 m, and a deliberately displaced 1 cm fixture is rejected.
- Recipe comparison finds only `face_anatomy` changed from V9. Skeleton nodes, inverse bind matrices and animation data remain identical across the three visual GLBs. Unchanged globe/lid helper code does not imply identical outer orbital vertices after the surrounding surface changed; see preservation reports.
- [Publication evidence](evidence.json) hashes every delivered file except itself, including logs. Run `python docs/production/reviews/representative-revision-06/verify_bundle.py` to check bytes, original reference hashes, PNG decoding and local HTML links.

Engine imports are scoped CPU/headless evidence. Three.js uses placeholder texture objects; GPU PBR appearance, exact material parity, Unreal import, wearer/collision fit, gameplay and owner art acceptance remain open. No full nineteen-view character set is claimed.

The standalone recipe supports a scratch output override. Comparison helper paths refer to original090 and V9 local diagnostics; already-generated comparison images are included. Use a new scratch directory rather than overwriting this frozen source. Byte-identical rebuilds are not certified. The [Three.js preview](../../../../app/production-preview/README.md) documents its current opt-in selection separately; this bundle alone does not change production status or preview selection.
