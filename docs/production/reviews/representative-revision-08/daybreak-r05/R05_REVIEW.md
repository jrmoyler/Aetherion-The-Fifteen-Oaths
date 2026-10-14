# R05 exported socket repair — unapproved candidate

This revision changes socket identity, fixture export membership and adapter-anchor transforms. It adds no module designs and makes no visual refinement. The package remains17modules,51visual module GLBs,15movement-proxy GLBs and5derivative fixture GLBs:71GLBs and22Blender sources total. Baffle collision remains explicitly PENDING. All prior art, physics/controller, Unreal, GPU and performance gaps remain open.

Three distinct defects were repaired:

- Editable LOD socket copies leaked into civic/residential/work exports, including pier base/route sockets as well as canopy/receiver seats. The source fixtures now omit hidden LOD construction meshes and duplicate typed anchors. The generator filters declared source-library socket names before Blender instance renaming.
- Blender's numeric suffix handling damaged decimal coordinate tails in four lower-LOD module exports. Canonical identity now lives in `canonical_socket_name`; hidden editable anchors have distinct construction names, and each exported module tier uses the exact declared canonical names. Fixture instances retain globally unique Blender node names when necessary, with explicit canonical identity in extras and ownership provided by their INSTANCE root. No blind numeric-suffix stripping is used to establish socket identity.
- Adapter floor geometry was translated without its newly created socket empties. Five adapter anchors in each of civic, residential, stairs-with-landing and ramp-with-landing are now placed with the actual adapter. Their dimensions, translation, rotation and adapter identifier are explicit in fixture.json. Work has no separate floor adapter. Allfive fixture exports are now checked, including the previously inherited stair/ramp files.

The earlier r04 static pair tests did not cover exported canonical names, total cardinality or adapter offsets. `lineage/r04-exported-socket-defects.json` and `lineage/r05-pre-adapter-repair-export-failures.json` preserve those failures. Frozen r04 remains intact.

## Scoped evidence

- `r05-all-socket-validation.json`: all51actual visual module GLBs and all5fixture exports checked against declared sockets, per instance. Checks cover canonical identity/cardinality/type/normal/world position. Duplicate-anchor and5cm-displacement negatives are rejected in all5fixtures. Legitimate matching seam locations on different instances are preserved.
- `r05-fixture-validation.json`: all9changed GLBs preserve every visible mesh attribute/index buffer, world matrix, material definition, embedded image and animation fingerprint relative to r04. Three canopy-bearing fixtures also reject duplicate anchors,15mm displacement and reversed normals in the actual loaded Three.js scene.
- `r05-source-preservation.json`: all7changed source files opened in Blender; primary visual and collision mesh topology/vertices/UV/material slots/world matrices match r04 exactly. Editable LOD construction meshes intentionally removed from assembly sources are excluded from this delivered-geometry comparison.
- `source-validation.json`:17module sources actually reopened; UV, material packing and hidden editable-tier checks pass. Every source hash and manifest report hash was reconciled to the final source bytes.
- `r05-import-validation.json`:9changed exports passed Khronos validation with zero errors/warnings and actual Three.js CPU geometry loading. `r05-godot-validation.json` records9actual Godot4.6.3 imports, image decode and scene instantiate/free checks.
- `r05-render-preservation.json`: civic/residential/work were re-rendered after removing LOD construction objects; allRGBpixels match r04 exactly. Their new PNG containers are retained under evidence/. Original primary PNG bytes are shipped unchanged. Later non-renderable anchor identity/transform edits were validated by the final visible-geometry fingerprints. Stair/ramp primary renders were retained, not re-rendered.

The frozen inherited-payload comparison has22changed and169unchanged files:7Blender sources,9GLBs,2module metadata records and4fixture metadata records changed. AllmoduleLOD0 files, allmovement-proxy GLBs, textures and primary renders retain r04 bytes. The changed exports are canopy/public-colonnadeLOD1/2 plus all5fixture assembly GLBs. The other15module payloads are unchanged.

## Reproduction and limits

For a fresh isolated copy of r04, apply the r05 helper code and run Blender `fix-module-socket-identity-r05.py`, `repair-fixture-membership-r05.py`, `fix-adapter-sockets-r05.py` and `tag-fixture-canonical-identities-r05.py`. For future assembly authoring, the revised fixtures.py filters hidden LOD members and transforms adapter anchors with their geometry. Re-exporting the canopy/public-colonnade from the earlier aesthetic author helper requires rerunning the canonical module-identity helper.

Run the supplied checks in a mutable review copy; they write reports beside the scripts. Set `AETHERION_REPOSITORY` to the checkout with installed locked Three.js/glTF-validator dependencies and `AETHERION_R04` to the preserved r04 baseline. Re-root the absolute paths in r05-import-request.json for another executor. Python socket audits require NumPy; Blender source checks use Blender4.3.2. Regenerate source-validation before package.py so compressed-source hashes remain truthful.

Independent r05 review is running separately at this author freeze. Own checks are scoped evidence, not independent approval. No visual acceptance, rendered-gameplay certification or production-completeness promotion is made.
