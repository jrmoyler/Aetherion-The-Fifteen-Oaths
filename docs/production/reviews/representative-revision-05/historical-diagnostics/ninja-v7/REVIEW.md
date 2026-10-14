# Kiln ninja V7 — focused diagnostic, not accepted

V7 was built from actual original reference090 front/profile pixels and frozen V6. Five focused iterations were inspected; the first four recipes and diagnostic views remain in diagnostic-pass1 through diagnostic-pass4. No repository files or prior frozen bundles were changed. No full nineteen-view render was run.

## Geometry changes

- Continuous cubic Hermite head sections replace linear cross-sections, removing the broad horizontal cheek slope break visible in V6 and early V7 passes.
- Orbital loops now form wider openings and carry an actual thin upper lid margin. Eye/iris geometry uses smooth shading and asymmetric depth. Brows sit lower. The profile eye still does not match the source.
- Nasal bridge/alar vertices are reshaped. Twenty selected nose faces are extruded inward to form closed nostril recesses, with a fresh skin UV unwrap. These are genuine geometry cavities rather than painted or floating nostril lines.
- Lips project less and the chin/jaw cross-sections narrow. The result remains a soft, generic face below the original likeness and profile fidelity.
- Hair uses individually authored split-crown guides, overlapping clumps, thinner offshoots, and backward-flowing temporal clumps. The crown still exposes a plain cap/gap; thick ribbon-like clumps and sparse side coverage remain unacceptable against the source.

## Actual artifacts and cost

The final packed editable Blender source, primary/two LOD/collision GLBs, three PBR maps and two actual Cycles CPU renders are identified by geometry-freeze-receipt.json. Primary 61,556 triangles; LOD1 37,548; LOD2 20,928; collision 76. These are candidates, not measured device budgets or accepted production assets. Hair-cost.json is a name-filtered subset and does not represent every hair polygon/component.

The existing 38-bone body rig, three clips (idle_breath, walk_in_place, cast_release), sockets, body, cape, bracer asymmetry and stance functions retain their normalized V6 Python AST. See body-rig-preservation.json. The mesh helper only extends smooth shading to eye and iris regions; this is not a claim of identical combined export bytes.

Blender authoring verifies zero unweighted vertices, maximum weight-sum error approximately 2.98e-8, and finite evaluated clip poses. This is scoped CPU authoring evidence. Independent import, vertex-color and bounds checks are separate. GPU material appearance, full gameplay, collision fit, facial expressions, Unreal import and exact likeness remain open. Nothing here is visually approved.

Reproduce in Blender4.3.2 using `blender -b -t 6 --python /tmp/ninja-v7/kiln_ninja.py -- --face-diagnostic`. Do not run this against the frozen directory without first changing OUT to a new revision path.
