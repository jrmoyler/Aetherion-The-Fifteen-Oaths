# Kiln ninja V8b — unapproved hair diagnostic

V8b is a repaired export of the V8 hair-only revision of frozen V7, using inspected original090 front/profile pixels. Five bounded two-view iterations were inspected. Earlier passes and recipes remain in diagnostic-pass1 through diagnostic-pass4, outside the final artifact manifest. No repository or prior frozen artifacts were changed. No full pose-review render was run.

The hairstyle now uses closed, tapered, six-sided oval clump volumes with UVs following each clump, instead of open ribbons with thick edges. Rooted left/right flows, overlapping crown masses, irregular split tips and posterior nape volumes replace the earlier guide layout. The new hairstyle material retains the PBR maps with a lower broad specular response and mapped roughness adjustment. Face, brows, eyelid materials, body, cape, bracer, stance, rig, animations and sockets retain V7 authoring logic.

## Tradeoffs and remaining defects

V8 is **not uniformly closer to original090**. The broad central open crown gap is reduced and polygon cost is lower, but the front still reads as patterned locks over an exposed cap. The final pass restores a stronger left sweep and varied fringe ends, but those ends are coarse and the part/crown flow remains wrong. New posterior nape volumes extend lower than V7, but form sparse pointed strips with visible gaps rather than the source's layered hair mass. They are not accepted nape coverage. Fine irregular silhouette curls, smaller overlapping source clumps and connected side/nape coverage remain missing.

The unchanged V7 profile eye remains visibly white and artificial; nasal bridge/alar transitions, lips, chin and facial likeness remain below the source. No visual acceptance, overall fidelity improvement, engine appearance parity or production promotion is claimed.

## Cost and preservation

- Primary: 54,212 triangles versus V7 61,556, a decrease of 7,344 (11.93%).
- LOD1: 33,068 versus 37,548, a decrease of 4,480.
- LOD2: 18,432 versus 20,928, a decrease of 2,496.
- Collision: unchanged 76 triangles.
- Actual hairstyle geometry: 14,008 triangles across 106 internal mesh components before joining; these are component counts, not delivered asset counts.

Performance budgets remain proposed until measured. Global LOD decimation may alter nonhair reduced meshes even when the face/body recipe is unchanged; independent preservation evidence must distinguish this from full-resolution behavior. The 38-bone rig and three clips remain. Authoring evaluated finite poses with zero unweighted vertices. Independent Blender, Godot, Three.js CPU, GLB and preservation checks are separate, and do not imply GPU appearance or visual approval.

## Portable reproduction

Review mode defaults to the recipe's directory; set a fresh output directory to preserve frozen evidence:

```sh
AETHERION_REVIEW_OUT=/tmp/ninja-v8b-reproduction-final blender -b -t 6 --python /tmp/ninja-v8b/kiln_ninja.py -- --face-diagnostic
```

For export-only reproduction, append `--export-only`. RNG seeds are deterministic. Packed .blend source is included, but byte-identical Blender rebuilds are not promised. The actual scratch reproduction result is recorded separately. Source/GLBs/maps/two CPU renders are frozen by geometry-freeze-receipt.json. Independent evidence may be added without changing those bytes.

## Corrected invalid V8 material export

Independent validation rejected frozen V8: Blender exported its hair roughness multiplier as roughnessFactor1.25, outside the legal glTF range. V8 remains untouched as rejected technical evidence. V8b bakes that intended adjustment into a dedicated hair-only ORM map and keeps all exported roughness factors at1.0. Existing face/body maps are unchanged. The source and two CPU views were rebuilt. The author-side Khronos check reports zero errors and zero warnings for all four V8b GLBs; independent imports/preservation checks remain separate. Four external maps are now included, not three. No visual approval follows from this repair.

## Independent final import evidence

Final V8b passes actual Blender source-open plus four imports, Godot scene import/instantiation, Three.js CPU geometry/skin/animation checks, and Khronos validation with zero errors and warnings. Twelve frozen input hashes match. Exact V7 skeleton, inverse binds and animation sampler data remain across all three visual LODs. Primary face/body positions, normals, colors and skin weights match V7, while face UV/index/tangent data and body tangents regenerate; global lower-LOD decimation changes nonhair geometry. This is scoped technical evidence, not blanket exported nonhair byte preservation or visual acceptance. Reports are under /tmp/aetherion-revision05-import-checks/ninja08b-*.

The output-override scratch build succeeds and all four scratch GLBs also validate without errors/warnings. All four PNG maps and the collision GLB reproduce byte-identically; visual GLBs retain identical JSON metadata but some accessor bytes differ. Packed .blend bytes differ. No stronger byte-reproducibility claim is made.
