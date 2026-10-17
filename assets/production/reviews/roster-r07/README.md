# R07 — three original-reference-guided creature reconstructions (review only)

**PR #5 milestone. Three actual GLB binary files are committed here. Not approved production art.**

## Exact provenance and review evidence

| Identity | Original authoritative PROPOSED image | R07 GLB | SHA-256 | Geometry | Skeleton |
| --- | --- | --- | --- | ---: | ---: |
| `creature-o01-natural` — slag-backed burrower | [Original Kiln reference](../../../references/proposed-expansion-2026-10-13-batch03/generated/batch03_10_kiln_slag_backed_burrower.png) | [GLB](creature-o01-natural.glb) | `4b134d85e1e216709adf206a79391220f1e37c1f4b033623fa9532b74a120e5a` | 12,476 triangles | 14 joints |
| `creature-o03-natural` — copper-wing kite | [Original Storm reference](../../../references/proposed-expansion-2026-10-13-batch03/generated/batch03_11_storm_copper_wing_kite.png) | [GLB](creature-o03-natural.glb) | `ac0fb9f93628e5f3d75424231e1e729cf28deda5c3c12bfa63bf076a24b9c0a4` | 10,044 triangles | 12 joints |
| `creature-o04-natural` — reedback estuary grazer | [Original Tidal reference](../../../references/proposed-expansion-2026-10-13-batch03/generated/batch03_12_tidal_reedback_estuary_grazer.png) | [GLB](creature-o04-natural.glb) | `6c59fe862e271534e140e13eba807e81968822e778e08a7e754733f4527da762` | 14,696 triangles | 12 joints |

The three authoritative reference sheets and associated prompts already exist on main and remain unchanged. Newly generated interpretation sheets do not supersede those original references.

[Original concept vs actual R07 renders](R07_DIRECT_REFERENCE_COMPARISON.jpg) (real VTK offscreen renders). [QA data](R07_VALIDATION_REPORT.json). [Machine-readable model manifest](R07_MODEL_SPECIFIC_MANIFEST.json).

## Implemented

- All three **actual binary GLB files** are present on this PR, not just ZIP/manifest references.
- Independent species-specific geometry: six visible burrower limbs, dorsal slag plates, pointed digging claws, nested feather/talon geometry for kite, and bristle cover/cleft hoof outlines for grazer.
- Burrower skeletal rig now includes left and right middle legs, each targeted by the inherited preview animation clips.
- Embedded glTF PBR textures (color, metallic/roughness, normal) and Y-up mesh/skeleton alignment.
- Reused the 21 preserved R06 skeletal *preview* clips without claiming root-motion, foot-contact, collision, gameplay event, or clip-behavior quality.
- Original `assets/production/oath-*/` and existing Blender sources and 100 castables are untouched.

## Measured independent technical results

All 3 GLBs parsed/imported in Python trimesh and VTK offscreen OpenGL; GLB SHA-256, skins, index bounds, normalized weights, non-degenerate triangles and embedded texture requirements passed. These assertions also exist as Python stdlib [repo regression tests](../../../..//tests/test_r07_creature_review.py).

Isolated 768x576 VTK offscreen, warmed 20-frame render wall times (not GPU timings, no game world):

| Model | Median frame wall time | p95 |
|---|---:|---:|
| Slag-backed burrower | 16.405 ms | 18.825 ms |
| Copper-wing kite | 14.488 ms | 17.032 ms |
| Reedback estuary grazer | 15.808 ms | 20.867 ms |

The VTK renderer's timing cannot be extrapolated to mobile, Three.js, Godot, Unreal or multi-character gameplay. Missing LOD chains and full-engine runtime measurements remain blockers.

## Visual acceptance result — FAILED / OPEN

Rendered candidates still look like relatively smooth, simplified art. The burrower lacks original reference's dense wrinkles, exact armor/scales and accurate limb articulation; the kite lacks accurate raptor proportions and individual feather structure; the grazer's dorsal bristles and silhouette are insufficiently faithful. Procedural normal/color maps are **not** source-painted texture replacements.

These GLBs **must not be promoted to game runtime or described as exact replicas**. Further bespoke sculpting, retopology, layered displacement/normal art, multi-angle side-by-side comparisons, correct rig/skin painting, authored animation with IK/contact, gameplay state transitions and actual Godot/Three.js/Unreal benchmarks are required for visual/performance approval.

## Reproduce

```bash
python3 -m pip install numpy trimesh Pillow
python3 tools/production/rebuild_three_creature_candidates_r07.py \
  Aetherion_Roster_R06_Role_Motion_Preview_2026-10-16.zip \
  /tmp/aetherion-r07-review
python3 -m unittest discover -s tests -p 'test_r07_creature_review.py' -v
```

Unlike a final DCC approval pass, this source script is a constrained, reproducible procedural mesh sculpting method. It is **not Blender authored**; it preserves the existing historical Blender candidates separately and does not fabricate new Blender source files.
