# Fault Choir amethyst blade — revision 10 review

REVIEW ONLY. Original reference 053 remains the visual target. V9 is preserved. No production repository files, runtime assets, original reference images or proposed-reference upload folders were changed by this authoring task.

## Actual changes

Retained the measured source outline and corrected a fracture offset that briefly extended past the tip. The stone shell now uses uneven chipped perimeter edges shared with its continuous substrate, staggered broken cleavage intersections, thinner fracture bevels, split mineral layers and unequal overhanging tongues around the crystal opening. These are actual mesh surfaces. Added fitted layered bronze guard flanges and broader opposing leather wraps. Adjusted stone, aged bronze and dark brown leather albedo under the same neutral V9 area lights.

The amethyst is closed faceted geometry with varying section widths, 0.94 physical transmission, IOR 1.54, and two small internal cleavage solids. No emission/glow or added coat is used. The comparison retains the same three neutral area lights as V9; brighter albedo, changed shapes and higher transmission are material/geometry changes, not a changed lighting rig.

## Final UV and tangent repair

Applying export triangulation exposed zero tangent vectors in four primitives: two curved pommel frames and two thin tip flakes. Their geometry and UV areas were nonzero; the evidence did not support a collapsed-bevel explanation. Re-unwrapping those four meshes after applying their final triangulation produced zero invalid tangent loops, verified separately and now asserted in the author recipe. The final source contains the repaired topology/UVs. Full tangent attributes are exported in the final GLB; no optional tangent omission is used.

`diagnostic-before-uv-repair/` preserves the intermediate omission experiment and its receipts. It is superseded, not the final solution. `tangent-root-cause.json` and `uv-repair-test.json` document the before/after investigation. No gamma-corruption claim is made: the V9 investigation disproved that earlier hypothesis.

## Validation scope

Blender 4.3.2 reopened the source and independently imported the final GLB. The imported GLB contains 136 mesh objects, 11,648 triangles and dimensions 0.122584 × 0.085600 × 0.773522 metres in Blender XYZ. These are authored proposal dimensions, not established canon measurements. Every mesh has UVs and assigned materials. The source packs 16 512×512 PBR images, also supplied externally: four sRGB base-color maps and twelve Non-Color maps.

Khronos validation of the final GLB: **0 errors, 0 warnings, 6 informational unused-tangent entries** on optical crystal materials that have no normal texture. The source SHA is unchanged by export. See source-inspection.json, glb-export-receipt.json, glb-validation.json and blender-glb-import.json. This is structural validation and a scoped Blender import, not rendered engine parity.

Cycles CPU renders use two threads and 192 samples for front/profile/hero/detail, 256 for comparison views. The comparison camera roll approximates the original main-view direction; it is not a calibrated perspective match. The profile is supplied to reveal real depth rather than judge from one favorable angle.

## Visible deficiencies and open acceptance

The original still has more intricate natural chips, brighter complex optical facets and more characterful guard/pommel ornament. V10 improves layering, exterior breakup and actual glass depth, but the amethyst opening still reads too continuous; transparent surfaces show sampling noise. The mineral arrangement retains some regular panel-like divisions, and the leather/bronze wear remains simplified. No exact visual match or final art approval is claimed.

New LOD/collision outputs, character grip/stow fit, full engine imports, real-time transmission behavior, GPU renders and performance remain open. This static blade does not require a deformation rig. The final GLB is a review export, not a runtime replacement.

## Reproduce

Run from this folder with Blender 4.3.2:

```
blender -b -t 2 --python fault_weapons.review.py
blender -b -t 2 --python render_matched.py
blender -b -t 2 --python inspect_source.py
blender -b -t 2 --python export_review_glb.py
node validate_glb.cjs
blender -b -t 2 --python import_review_glb.py
```

Set GLTF_VALIDATOR_MODULE to an installed gltf-validator module path if needed. The final recipe defaults to its own folder and supports AETHERION_REVIEW_OUT. Do not run the diagnostic omission script as part of final reproduction. Final files and hashes are in REVIEW_EVIDENCE.json and SHA256SUMS.
