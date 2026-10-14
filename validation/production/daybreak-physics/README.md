# Daybreak r02 — scoped Godot physics traversal

This harness actually imports authored collision meshes, makes Godot `StaticBody3D` triangle collision shapes, and moves a `CharacterBody3D` capsule across the stair/ramp and landing at fixed 60 Hz. It does not use GPU rendering or alter sandbox/security settings. All character dimensions, controller limits and architectural dimensions remain **PROPOSED**.

## Reproduce

Godot 4.6.3 and Python 3 are the tested prerequisites. From this directory:

```sh
python3 run.py --output /tmp/daybreak-physics-check
```

The output directory is required; reports, logs and engine cache/data are written there. `--godot /path/to/godot` selects an existing executable. No engine is installed by the harness. `run.py` verifies input GLB hashes, invokes actual headless Godot, checks the eight expected outcomes and validates every recorded physics delta against 1/60 second. It also checks the actual imported shape counts and unique landing identity. No Python dependencies are required.

The included derivative GLBs are reusable, so Blender is not needed to rerun physics. To reproduce extraction from the exact candidate sources:

```sh
blender --background --python export_collision.py -- /path/to/daybreak-r02 /tmp/daybreak-extracted-inputs
```

Only `COL_*` objects from the two actual fixture `.blend` files are selected. Their geometry and transforms are exported to physics-only GLBs; no proxy is replaced by a guessed box. Sources are hashed before and after read-only extraction and never saved. The starting apron is an exact copy of the author's `modules/floor-bay/collision.glb`, translated only during each test. `inputs/source-receipt.json` pins source-relative paths, original local source paths, source hashes, candidate freeze and derivative GLB hashes. These are derivative test inputs, not additional production designs.

## What was tested

Each fixture contains four authored collision meshes: smooth movement wedge, two side guard proxies and the landing floor. The test creates one `StaticBody3D` and `CollisionShape3D` per actual mesh using its imported transform and `create_trimesh_shape()`. A fifth actual floor proxy provides the start/end apron. Scene bodies are freed between cases.

The proposed capsule has height 1.8 m and radius 0.25 m. It moves at 1.2 m/s with gravity 9.8 m/s², 45° maximum floor angle, 0.25 m floor snap and 0.001 m safe margin. There is no jumping, teleportation, scripted height correction or automatic step climbing. It settles for 30 ticks before movement.

Eight cases run:

- Stair ascent and descent across its landing seam.
- Ramp ascent and descent across its landing seam.
- Stair and ramp ascent with **only the imported landing moved horizontally by 1.0 m**, creating a large gap.
- Stair and ramp ascent with **only the imported landing raised vertically by 0.65 m**, creating an impassable step for this controller.

These physics negatives are **1.0 m and 0.65 m** mutations. They are distinct from the author's separate 15 mm seam and 20 mm static-interface probes. **No small-gap physics sensitivity is claimed.** The in-memory mutations never change authored input files.

Success requires reaching the far target while grounded, final foot height within 0.08 m of its expected surface, no more than three consecutive airborne ticks after settling, and centerline deviation below 0.02 m. Baselines passed with zero airborne ticks. Gap negatives fell; step negatives stopped short. Both failures are detected rather than called traversable. Each result contains five-tick position/grounding/collision traces and exact imported shape names/transforms.

## Evidence and limits

The recorded run passes all eight expectations: four traversable baselines and four negative refusals. A prior independently launched repeat produced an identical full physics result. `evidence/results.json`, `evidence/godot.log` and `evidence/run-receipt.json` contain the final recorded run. Source extraction log is `export.log`.

This closes a narrow **actual headless physics** test, not merely an import test. It does not approve the entire kit or world:

- Stair collision is an authored **smooth wedge**, while visible art has discrete treads. Foot placement, per-step contacts and animation matching are untested.
- Only a single capsule on the centerline, walking straight in each direction, was tested. Lateral routes, turning, edge falls, multiple actors, player input and different capsules remain open.
- These collision guard proxies do not establish complete landing guard geometry. The visual review still identifies unguarded landing edges and missing side panels.
- No navigation mesh, accessibility certification, production controller, multiplayer authority, persistence, sound, render, material or final visual approval is claimed.
- Negative tests detect substantial broken joins; they do not measure tolerances for small gaps, small steps or dynamic loads.
