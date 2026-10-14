# Fault V13 — focused geometry diagnostic, NOT APPROVED

Isolated revision from frozen V12. Original reference053 pixels were inspected before authoring and final front/profile pixels were inspected after actual Blender 4.3.2 CPU Cycles renders (256 samples each). V12 and repository production assets were not changed.

The crystal now has unequal station widths, off-axis ridges, alternating shoulder/crest depths and varied triangular facet diagonals. The crystal is one closed mesh, not overlapping transparent primitives. Aperture widths vary with the crystal groups. Twenty thinner secondary stone terraces supplement the primary banks on both sides. The converged point, overall dimensions and warm brown grip remain.

The front render shows distinct uneven crystal facets and broader exposure. The profile shows raised crystal facets between uneven stone terraces. Remaining visual gates: broad adjacent primary stone cells still resemble tiles; profile has long substrate rails; crystal still reads as a continuous longitudinal insert; collar is bulky/simple; pommel and wrap remain simplified. This is not exact reference matching or approval. Two focused views only, no full render set.

## Evidence

- `geometry-freeze-receipt.json`: exact source/export/maps/reference/authoring input hashes.
- `source-inspection.json`: 167 source mesh objects, 11,146 raw source triangles; dimensions 0.1189445555 × 0.0801246092 × 0.7735223472 m (Blender XYZ), unchanged from V12. Export applies modifiers; imported GLB is 12,372 triangles.
- `blender-glb-import.json`: actual Blender reimport, 167 meshes, UV/material presence and bounds.
- `glb-validation.json`: Khronos 0 errors, 0 warnings, 6 unused tangent infos. No issue suppression.
- `uv-audit.json`: zero collapsed UV triangles and zero geometry triangles below 1e-12 m². Does not establish texel density.
- 16 packed/external 512 px PBR maps. Static equipment, no rig requirement. No production LOD/collision delivery or acceptance claimed.
- `comparison-reference-v12-v13.png`: reference crop, preserved V12 front and actual V13 front/profile. It is a comparison sheet, not a new reference.

## Reproduction

Run Blender from this directory: `blender -b -t 2 --python fault_weapons.review.py`, then `export_review_glb.py`, `render_matched.py`, `inspect_source.py`, `import_review_glb.py`, and `audit_uv.py` with the same Blender invocation. Run `node validate_glb.cjs` (validator dependency path configurable with GLTF_VALIDATOR_MODULE), then `python make_comparison.py`. Inspect logs: Blender can return zero when a Python script fails. `modify.py` documents the one-time V12 transformation; the complete final recipe is standalone and does not require running that transformation again.

No Unreal, engine GPU optical parity, gameplay, visual certification or full production completeness is claimed. Independent import and pixel reviews are separate reports requested after this author freeze.
