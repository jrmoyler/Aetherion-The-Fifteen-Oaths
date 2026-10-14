# Kiln ninja V6 — focused face and hair checkpoint

V6 is an isolated, unapproved diagnostic repair based on actual reference090 unmasked front/profile pixels and reference060. Frozen V5 remains unchanged. No repository changes were made.

The face now uses a single shaped cheek, bridge, nasal tip, alar, philtrum, lip and chin surface with connected orbital loops. Lip pigmentation is a continuous vertex tint on that same textured face; there are no separate lip-line or nostril-line geometry patches. Hair has a compact crown and stronger lateral flow, with fewer and differently directed clumps. The upper lid covers more of the iris. Body construction, rig, cape direction and bracer asymmetry remain as V5.

Four diagnostic iterations preceded this checkpoint. Early diagnostics and their recipes remain in diagnostic-pass1 through diagnostic-pass4, outside the final checksum manifest. Early overprojected nose, raised eye rims, upright crown loops and hard lip-color boundaries were rejected locally. No full nineteen-view render run was performed after independent pixel review recommended further face work.

## Actual cost and measurements

- Primary: 47,708 triangles; LOD1: 29,100; LOD2: 16,220. V5 primary was 64,098, a 25.6% reduction. Device budgets remain unmeasured.
- Hair geometry: 11,172 triangles across 52 components, including scalp, fringe, crown, temporal, sideburn and nape forms. This is a geometry cost, not 52 asset deliveries.
- Constructed iris centers: X +/-0.031m, Z1.681m. Actual sampled nasal-tip vertex: (0,-0.0675700,1.648)m. Lip cleft: Z1.617m. Actual lowest head vertex: Z1.566m, partly hidden by the production collar.
- Opening width is 0.033m, with upper/lower lid heights 0.0030/0.0041m before corner tilt. These are geometry dimensions, not a source match claim.
- Source face landmarks were manually picked on original090 with approximately +/-4px uncertainty; the annotated source crop is included. Source eye-line-to-visible-chin span is approximately72px, eye-to-nose28px and eye-to-lip48px. The collar-occluded model bottom is not a homologous visible chin point, so no precise ratio-match score is claimed.

## Independent pixel assessment

Review confirms real improvement over V5 in continuous nose/lip volumes and reduced comb-like hair repetition. It still rejects source likeness: eyes remain flat narrow almond cuts with floating-looking whites in profile; nasal bridge/alar transitions are soft and the tip is blunt; the lip mound reads as a pout; jaw/chin remain a broad smooth triangular plane. Hair remains thick swept plates over a large scalp cap rather than the source's irregular finer clumps. Further focused eye/profile/hair repair is needed before the full pose-review run. No art approval is claimed.

## Export correction and limits

Inspection caught a real Blender-to-GLB difference: the face tint rendered in Blender while exported COLOR_0 was white. The final recipe explicitly selects the render color attribute and exports it. Actual primary GLB normalized color minima are [0.8824,0.7060,0.7312,1] for the face; body/hair vertices remain white. The face still uses authored PBR maps. Hair uses KHR_materials_specular to reduce excessive broad reflections. This accessor inspection is not GPU appearance parity.

Editable packed source, primary/two LOD/collision GLBs, three PBR maps and two actual CPU renders are frozen by geometry-freeze-receipt.json. Independent import checks are reported separately when available. Gameplay, facial expressions, collision fit, GPU appearance, Unreal and performance remain open.

Reproduce the focused build with Blender4.3.2:

```
blender -b -t 2 --python /tmp/ninja-v6/kiln_ninja.py -- --face-diagnostic
```

`--export-only` produces the same source/exports without spending another render pass; it was used for the final active-color export correction. The final diagnostic images use identical geometry and Blender shader appearance to the final source. `--full-review` remains available for a later appropriate pose-review run.

## Final independent technical checks

Frozen V6 passed actual Blender source-open plus four GLB imports, Godot import and instantiation of four scenes, Khronos validation with zero errors and zero warnings, and Three.js CPU geometry/skin/animation import. Forty-five sampled bounds agree with Blender within 0.000000365m; the 1cm negative fixture was rejected. COLOR_0 survived all three visual LODs, with 379/119/53 nonwhite vertices and matching tint minima. Hair loads with specularIntensity0.4. All eleven frozen input hashes matched. Three.js textures in that CPU harness are explicit placeholders; GPU material appearance and Godot visual color parity remain unverified. See independent-import-summary.md, independent-import-receipt.json and independent-colors.json.

Normalized Python AST checks confirm the V5/V6 pants, ceramic bands, cape, body/bracer construction, lower-leg stance, rig, animation and sockets functions are unchanged. See body-rig-preservation.json. This verifies preserved authoring logic, not identical bytes of the combined character exports.
