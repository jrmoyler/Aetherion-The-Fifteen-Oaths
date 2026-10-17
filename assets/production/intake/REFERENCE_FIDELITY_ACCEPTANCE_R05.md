# Reference-Fidelity & Engine Acceptance Matrix — roster r05

**Status: PROTOTYPE ONLY. All 128 individual approvals remain OPEN.**

A 2D concept can establish a *visible* silhouette, palette, materials and depicted details. It cannot fully determine unseen geometry, physically correct skin deformations, unstated game animations or performance on an engine/device. Those require separate authored references, runtime tests and deliberate acceptance. A claim of "100% matched" is invalid without those independent evidence sets.

## Verified r05 technical repairs

- 128/128 GLBs reoriented from Z-up to glTF-conformant Y-up with one shared parent of the original mesh and bones. This preserves unbaked animation and skin data. Verified upright character bounds after conversion.
- 3,912 degenerate triangles removed from 115 files; no primitive is left empty. Independent CPU QA now reports 128/128 passes for indexed geometry, normalized weights, inverse bind-matrix rest pose, finite animation quaternions, basic motion and coordinate convention.
- Independently parsed/imported in trimesh and VTK offscreen import: **128/128 each**. These are not raster/deformation or game-engine certification.
- 0/128 final model appearance approvals; 0/128 certified gameplay animation sets; 0/128 certified GPU engine/device performance.
- 128/128 lack authored LOD chains; 45 exceed provisional 24-draw-call warning threshold; 30 show limited two-joint soft skinning. Every model has only 3–4 prototype clips, not the full required combat/traversal collection.

Detailed summary and full package checksum: [ROSTER_R05_TECHNICAL_QA.json](ROSTER_R05_TECHNICAL_QA.json).

### Strict acceptance table

| Dimension | Acceptance evidence required for **each** identity | Current state |
| --- | --- | --- |
| **Original artwork likeness** | Original/source image hashes; individual front/side/rear/3Q turnaround; matched projection and silhouette contour overlays; named feature/material checks; artist signed artifact-specific review | **NOT RUN / NOT APPROVED**. The character registry often shares region-wide references among multiple people, not individually approved portraits. |
| **Character deformation** | Blender edit source, bone orientation, skinning paint review, shoulder/hip/face articulation extremes, hidden geometry, garment intersections, animation deform captures and joint/contact regression | **CPU structural gate only**; real pose deformation/render review missing |
| **Creature biomechanics** | Per-species anatomical rig, quadruped/hexapod/avian/aquatic/human/vehicle ontologies, contact poses and physically authored locomotion; composite bosses modeled as separate actors/scene objects | **NOT CERTIFIED**; skeleton categories are prototypes and cannot confer species fidelity |
| **Gameplay animation** | State-machine mapping, move timing, root-motion decisions, stop/turn/contact, attack/cast hit windows, transitions, cancel/interruption and hit reaction, engine tests | **NOT CERTIFIED**; 3–4 example keyframe clips per asset |
| **PBR fidelity** | Verified UV layout, source-painted textures for each material, channel packing/color spaces, glancing light probes, identical camera/lighting/renderer captures vs each reference | **NOT CERTIFIED**; embedded procedural PBR maps exist, but are not source-painted |
| **Runtime/device performance** | Real Three.js WebGL and/or Godot/Unreal frame captures, measured median/p95/p99 frame time, CPU/GPU times, draw calls, peak memory, texture residency, stutter and shader compilation, hardware/device details | **NOT CERTIFIED**; local Python parse time and mesh complexity are proxies, not frame budget results |
| **Delivery** | All accepted GLB binaries, editable Blender sources, PBR textures, LOD/collision and QA evidence committed and hash verified in this PR | **INCOMPLETE**; ZIP is user-facing, not an uploaded GitHub binary payload |

### Important gameplay semantics

Do not mark all named characters playable. The canon includes civilians, the player, the Archivist and supporting roles with different gameplay contracts. Do not convert every boss into a monster: e.g. **The Unthawing Custodian** and **The First Creditor** are people; **The Perfect Chorus** is a performer ensemble; **The Unending Orchard** is distributed flora; **The Final Schedule** is a human transport marshal with separate world hardware. Mounts may be vehicles, not animals; the four recovered manifestations are effects, not generic creature enemies.

### Validation and staging (local, requires the ZIP)

```sh
sha256sum Aetherion_Roster_R05_YUp_Mesh_Correction_2026-10-16.zip
# Expected:
# eb7e8f9322390138ff79c52604cce08146478b2ba9ebbb81e3cb17ef3d704c74
python3 tools/production/ingest_named_roster.py \
  Aetherion_Roster_R05_YUp_Mesh_Correction_2026-10-16.zip \
  --repo . --dry-run
python3 tools/production/ingest_named_roster.py \
  Aetherion_Roster_R05_YUp_Mesh_Correction_2026-10-16.zip \
  --repo .
python3 -m unittest discover -s tests -p test_named_roster_repair.py -v
node --test tests/identity-catalog.test.mjs
```

The importer **rejects older sideways or degenerate exports**. Staging is quarantined under `assets/prototype-intake/`, never `assets/production/`, so a correct structural import cannot accidentally promote unfinished models.

No automatic claim of 100% likeness or runtime certification may be made from a structural report, a ZIP count, a name/asset-ID match, successful imports, or zero GitHub lint errors. GitHub CI has been reporting an initialization/job failure with no accessible step logs. The PR must remain **Draft**.
