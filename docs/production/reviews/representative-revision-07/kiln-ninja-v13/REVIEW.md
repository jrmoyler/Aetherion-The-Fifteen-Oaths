# Kiln ninja V13 — bounded ear and hair checkpoint, unapproved

Original090 hair/ear pixels informed this isolated revision. V11's ear work and complete V10/V9 face/eye work remain. V12 was frozen as a mixed experiment and was not promoted. V13 changes the construction: one scalp-to-nape envelope replaces the separate rear/nape rows; roots start at independently varied scalp latitudes and diagonal guides overlap across the old tier. Front part direction is retained. Final pass shortens only the longest nape ends and reduces an oversized crown curl. Both final actual CPU views were inspected; comparisons show pass2, not archived pass1.

The parent identified removal of the profile tier as a concrete improvement. This is still far from an exact match: broad black locks look plastic, several upper curves still look like folded ribbons, exposed smooth patches remain, and lower locks remain too pointed/regular. Ear is rounder but has an over-regular rim and cord-like inner folds. Broad bridge, weak lower facial planes and tiny bright profile eye sliver/canthus defects remain. No art acceptance, overall matching-quality claim or preview promotion is implied.

Only designed_hair changes versus V12. Full face/ear, body/cape/bracer/stance, hair_lock topology, 38-bone rig, three clips and sockets authoring are unchanged. Compared with V11 both hair_lock and designed_hair differ. Combined UV/tangent generation and global LOD decimation can alter unrelated output buffers; independent exported preservation checks are separate.

Measured triangles: primary57,284; LOD1 34,943; LOD2 19,476; collision76. Versus V11 these are −314,−191,−106,0. Versus V12 they are +1,682,+1,027,+572,0. Hair13,694tri versus V11 14,008 and V12 12,012. Internal101 components are not101 assets. Performance budgets remain proposed and unmeasured.

Four author Khronos validations pass with zero errors/warnings. Independent Blender/Godot/Three import checks and pixel review are requested, not yet claimed here. No Unreal/GPU/gameplay appearance or collision-fit acceptance follows. No full pose suite was run.

The geometry receipt freezes the compressed packed Blender source, recipe, four GLBs, four PBR maps and two renders. Previous versions and repository files are unchanged. Existing clump UVs already encode root-to-tip length with wrapped cross-section coordinates; separate future material work can improve directional detail. This geometry checkpoint does not add a new hair material bake.

Reproduce into a fresh directory:

```sh
AETHERION_REVIEW_OUT=/tmp/ninja-v13-reproduction blender -b -t 6 --python /tmp/ninja-v13/kiln_ninja.py -- --face-diagnostic
```

Review output defaults to the recipe directory. Do not rerun into frozen folders. Seeds remain deterministic; byte-identical Blender/GLB builds are not promised. --export-only skips rendering.
