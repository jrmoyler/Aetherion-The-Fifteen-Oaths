# Existing source engine import probes

Run from repository root with installed Blender and Godot executables:

```sh
python3 tools/production/engine-probes/run.py \
  --repo . \
  --scratch /tmp/aetherion-source-engine-probes \
  --report validation/production/source-engine-imports.final.json
```

Use a new report filename for every run; existing evidence is never overwritten. `--engine blender` or `--engine godot` narrows execution. The scratch directory must be outside the repository. Dependencies are Python 3.9+, Blender with its glTF importer, and Godot 4 with GLTFDocument support. No packages are installed by the probe.

The runner finds runtime GLBs, deduplicates by SHA256, imports temporary copies, captures engine output and importer counts, and verifies original hashes remain unchanged. Blender never saves a scene. Godot creates a temporary project with writable XDG directories and instantiates/frees each generated scene using the headless renderer. No diagnostic assets are added to the repository.

Exit status:

- `0`: every requested import passed without reported error diagnostics.
- `1`: an import failed, timed out, source changed, or completed with importer error diagnostics (`WITH_DEFECT`).
- `2`: a requested executable is unavailable (or CLI arguments invalid).

At the initial source commit, Blender emits `File is invalid: Some vertices are not assigned to bone(s)` for `magical_gyroscope.glb`. The runner deliberately returns **1**, preserving this defect even though Blender finishes importing. Review the structured report instead of interpreting a completed importer as a clean compatibility pass.

These probes verify CPU import/scene instantiation only. They do not certify reference matching, PBR appearance, animation playback, deformation, collisions, LODs, performance, browser gameplay, Unreal compatibility, or cross-engine visual parity. Raw console evidence is embedded in each JSON result. Any later source or toolchain change requires a fresh run.
