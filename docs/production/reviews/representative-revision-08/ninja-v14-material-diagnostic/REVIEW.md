# Kiln ninja V14 — material-only diagnostic, unapproved

V14 opens frozen V13 directly. Existing wrapped root-to-tip clump UVs are reused, not newly authored. Blender CPU bakes three actual 2048×1024 PNGs from an editable procedural material: unequal fine longitudinal color variation, roughness, and tangent-space normals from directional bump. Roughness is packed into ORM green with occlusion1 and metallic0. The procedural graph is retained in the packed source. Original scalp/root-shell UVs remain unchanged; they are not a newly certified continuous directional unwrap.

Two material passes were inspected in actual front/profile CPU renders. Final comparisons show pass2. The first pass was extremely faint; pass2 modestly increases baked relief and roughness. Actual tangent-normal RGB extrema are116–139,128,254–255. The result is deliberately subtle and remains dominated by broad plastic-looking locks. It does not repair scalp patches, excessive strand width, folded curls, pointed nape forms, facial proportions or ear anatomy. No source-likeness acceptance or appearance parity is claimed. V13 remains the geometry checkpoint for the upcoming bundle; V14 is a separate material experiment.

No geometry is regenerated. The packed V13 source is opened and its dedicated hair material updated. Saved-source verification reopens both sources and confirms exact mesh positions/normals/weights/polygons/UVs/material indices/smooth flags, bone matrices/parents/lengths, animation keyframes/handles/interpolation, and object transforms. The rig retains38bones and three clips.

GLBs are derived by updating only hair material/image resources in the frozen V13 exports. Every original binary byte is retained; added PNGs are appended. All379accessors per visual GLB,4collisionaccessors, mesh/node/skin/animation JSON and original bufferView data are exact. Collision file is byte-identical. Three newly embedded PNGs per visual export match external files. This is deliberate preservation, not a fresh Blender mesh re-export. Four author Khronos checks pass with zero errors/warnings. Unused retained prior texture resources may produce informational notices; they are retained to avoid destructive rewriting.

Triangles remain57,284/34,943/19,476, collision76. Budgets remain unmeasured. No new Unreal/Godot/Three runtime, GPU appearance, gameplay, collision-fit or full-pose claim follows from these checks. Independent import/pixel review is pending.

Final source, four GLBs, six current PNG maps and two diagnostic renders accompany the recipe. The baseline subdirectory contains the exact frozen V13 source and four exports needed for portable reproduction. Earlier candidates and repo files are untouched. Failed first-pass maps/renders/recipe remain archived outside the final artifact manifest.

Reproduce in a fresh output directory using the included baseline:

```sh
AETHERION_REVIEW_OUT=/tmp/ninja-v14-reproduction blender -b -t 6 --python /tmp/ninja-v14/material_diagnostic.py
```

Override AETHERION_BASELINE_DIR only to point to another exact copy of the included baseline. --export-only bakes maps and writes source/GLBs without renders. Do not rerun into frozen directories. A byte-identical Blender save or bake is not promised; geometric preservation is separately asserted and measured.
