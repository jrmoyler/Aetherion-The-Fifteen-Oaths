# Fault Choir blade V11 — focused, unapproved geometry review

This is a focused two-view diagnostic, not a production replacement or exact-reference acceptance. Original reference053 and frozen V10 remain unchanged. No repository, bundle04, runtime or proposed-reference upload files were edited.

## Actual authored changes

Replaced the tessellated broad stone-cell shell with separately outlined upper/lower overlapping slabs, thin underlying shards and occluding mineral tongues on both faces. Each layer has real side depth, UVs and assigned PBR material. A thin traced backing preserves the coherent long leaf silhouette; it is not divided into regular crack cells. Amethyst section widths vary irregularly. Its closed transmitting geometry is thinned to fit within the stone envelope rather than protruding over the new stone tongues.

Three scalloped bronze collars with pointed clasps replace the previous broad guard shell; a narrower curved inner cuff closes the collar windows. Leather base-color texture is warmer brown. Existing pommel remains simplified. All 16 actual 512px PBR maps are supplied externally and packed into the source and GLB.

## Diagnostic corrections

`diagnostic-first-pass/` preserves the initial excessive serration/chunky layering and open collar windows. `diagnostic-second-pass/` preserves the coherent-outline/cuff correction before the profile revealed that the crystal was deeper than the thinned plates. Final `amethyst-short-blade/matched-*-review.png` images use the corrected crystal depth. These are two Cycles CPU renders, 256 samples, unchanged neutral lighting and approximate source-oriented camera roll. They are not calibrated source-camera matches or engine/GPU renders.

Initial GLB validation exposed a zero tangent on one occluding tongue after export triangulation. Final topology triangulation followed by UV re-unwrap on that mesh fixes the actual tangent calculation; full tangent attributes remain exported. The final recipe includes this repair. Final Khronos result: zero errors, zero warnings, six informational unused-tangent entries on optical materials without normal textures. Source inspection and actual Blender GLB reimport receipts accompany the artifact.

## Open visual and production gates

The perimeter and collar-window regressions are corrected, but the placement of some plates still reads in rows, the exposed crystal remains a connected band in places, and guard/pommel ornament and material age are simpler than reference053. No exact art match is claimed. LOD/collision packages, grip/stow fit, engine-rendered material parity, GPU/performance checks and gameplay acceptance remain open. This is static equipment; no deformation rig is needed.

## Reproduction

Run Blender 4.3.2 from this directory:

```
blender -b -t 2 --python fault_weapons.review.py
blender -b -t 2 --python render_matched.py
blender -b -t 2 --python export_review_glb.py
blender -b -t 2 --python inspect_source.py
node validate_glb.cjs
blender -b -t 2 --python import_review_glb.py
```

The author recipe is standalone and defaults to this directory; `AETHERION_REVIEW_OUT` can select another output directory. `GLTF_VALIDATOR_MODULE` can select an installed validator module. `REVIEW_EVIDENCE.json` and `SHA256SUMS` record final deliverables and preserved diagnostics. Geometry inputs are independently hash-pinned by `geometry-freeze-receipt.json`.
