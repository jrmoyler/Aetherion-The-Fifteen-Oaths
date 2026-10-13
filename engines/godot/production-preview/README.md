# Godot production asset preview

Open this project in Godot 4.6.3, or run from the repository root:

```sh
godot --path engines/godot/production-preview -- --repo "$PWD"
```

The viewer discovers exported GLBs under `assets/production`, checks production manifests, loads real textures and materials through Godot's glTF importer, frames the mesh bounds, and plays the first animation when present. Drag to orbit, use the wheel to zoom, Left/Right to change asset, and Space to pause/resume animation. It includes LOD, state and collision exports so each real artifact can be inspected. Source assets remain external read-only inputs; the project does not rewrite or import the immutable Ability Matrix source into its filesystem. Collision GLBs are preview geometry; this does not create tested Godot physics bodies.

On executors with read-only home directories use writable XDG locations; the validation wrapper supplies these automatically. For an interactive session, set `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, and `XDG_CACHE_HOME` to user-writable directories without changing sandbox settings.

Run the actual exported asset checks:

```sh
python3 engines/godot/production-preview/validate.py \
  --repo . \
  --report validation/production/GODOT_PRODUCTION.final.json
```

The report path must be new. The wrapper records the commit, probe hashes, complete console, per-GLB hashes and results. A nonzero engine exit, error diagnostic, missing manifest reference or failed check returns exit 1. No dependencies are installed.

Checks cover all production GLBs, not a diagnostic primitive: import and scene instantiation; mesh/triangle counts; UV and material presence for renderable assets; nonempty imported texture slots and dimensions; skeleton counts; declared animation presence; animation advancement with changed node/bone pose; explicit scene destruction with no increase in orphan nodes. Collision geometry is exempt from UV/material/texture requirements. Shader appearance, GPU deformation, collisions/physics, LOD switching, visual similarity and measured rendering performance remain separate acceptance gates. The animation check is designed for the present transform/bone animations; future material-only animation requires extending the pose snapshot check.

Only CPU/headless checks have been executed in this environment. The interactive viewer's startup has been smoke-tested with the dummy renderer; its rendered image and controls require testing in a working desktop/GPU environment. Unreal and cross-engine visual parity are not certified by this project.
