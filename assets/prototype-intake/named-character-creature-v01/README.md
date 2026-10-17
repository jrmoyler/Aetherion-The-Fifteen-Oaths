# Aetherion named character/creature technical reconstruction r05

128 GLBs from the proposed roster: 34 named characters and 94 creature/manifestation records.

**NOT 100% reference matched, NOT final playable content, not production approved.**

## Changes from previous archive

- glTF Y-up conversion for all 128 exports through single common mesh/skeleton root transform.
- Removed 3,912 zero-area triangles across 115 GLBs without altering position/skin buffers.
- Re-audited skin inverse-bind rest matrices, weights, indices, animation sampling inputs/quaternions and finite geometry.
- All 128 re-imported successfully with trimesh and VTK offscreen glTF importers.

## Known unresolved blockers

- Source images are not provided inside the GLBs; cannot claim silhouette or face/texture pixel match.
- LOD chains are not authored. 45 assets exceed the provisional 24-draw-call warning threshold.
- Clips are prototype idle/gait/action examples, not complete gameplay state machines or grounded contacts.
- No Three.js WebGL, Godot, Unreal, or physical device GPU measurement in this environment.
- No formal final-art acceptance. Keep these assets in assets/prototype-intake only.

### Evidence

- ROSTER_REBUILD_MANIFEST.json: 128 canon identities, checksums, original art status
- STRICT_ACCEPTANCE_CPU_AUDIT.json: individual bind/weight/anatomy/proxy diagnostics
- ROSTER_STRUCTURAL_AUDIT.json: technical pass record
- THIRD_PARTY_IMPORT_AUDIT.json and VTK_IMPORT_AUDIT.json: independent parser evidence
