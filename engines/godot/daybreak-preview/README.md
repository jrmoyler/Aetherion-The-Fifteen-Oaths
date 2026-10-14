# Daybreak manifest inspection in Godot

This additive Godot 4.6.3 project imports the actual Daybreak manifest and its exported GLBs. It supports all 17 modules, three visual LODs per module, embedded PBR textures, authored movement colliders and the rigid baffle clip. It does not change source files or promote the proposed kit to approved production art.

## Run the inspector

From the repository root, provide the exact manifest to inspect:

```sh
godot --path engines/godot/daybreak-preview -- \
  --manifest /absolute/path/to/daybreak/manifest.json
```

For an explicit `REPOSITORY_ROOT` manifest, also pass `--repo /absolute/path/to/repository`. `MANIFEST_DIRECTORY` resolves paths beside the manifest. There is no guessed fallback between these meanings. Use writable `XDG_CONFIG_HOME`, `XDG_DATA_HOME` and `XDG_CACHE_HOME` directories where required; do not alter security or sandbox settings.

Left/Right selects a module; 1/2/3 selects LOD0/1/2; dragging orbits and the wheel zooms. Space starts/resets the first clip; brackets seek to its start/midpoint. The overlay distinguishes collision `REQUIRED`, `NONE` and `PENDING` and identifies the baffle animation as presentation only. Failed module or LOD requests retain the loaded selection, framing and collision report; the overlay labels the actual retained ID/LOD and shows the request error. Successful LOD and module changes reset the animation deliberately; cross-LOD pose continuity is not certified.

The interactive scene has been startup-smoke-tested headlessly. Its desktop controls, rendered lighting, material appearance and GPU behavior still require a working desktop/GPU review. Headless material decoding is not visual parity.

## Reproduce headless validation

```sh
python3 engines/godot/daybreak-preview/validate.py \
  --manifest /absolute/path/to/daybreak/manifest.json \
  --output /tmp/daybreak-godot-runtime-check
```

Choose a new output directory. The wrapper records results, the full console, exact input/project hashes and isolated test fixtures there. It supplies writable engine config/cache/data paths and installs no dependencies. Python 3 and an existing Godot executable are required; `--godot /path/to/godot` selects it. Source bytes are hashed before/after the run. Unexpected engine diagnostics, failing checks, a nonzero engine exit or changed input bytes fail validation.

The tests cover all 51 actual visual exports and 15 unique collider exports. Repeated loads additionally exercise LOD replacement and ownership; they are not counted as new assets. Tests inspect decoded embedded images, actual imported PBR material texture slots/UVs, real `StaticBody3D`/triangle-shape creation, three-LOD animation seek/advance with changing poses and unchanged scale, freed prior instances, empty scene ownership after unload, weak-resource release (meshes/materials/textures/shapes/animations), and no orphan-node increase.

Isolated negative fixtures cover traversal, absolute/URI/encoded/backslash paths, symlinks, missing assets, duplicate/blank IDs, missing/blank module names, boolean schema versions, unsupported path bases, missing/contradictory collision metadata, blank reasons/gates, malformed GLB bytes, external dependencies, malformed buffer/image arrays and valid-but-meshless imports. Failed imports preserve a previously usable sibling scene without partial children or leaked resources. Unknown IDs, invalid LODs, invalid seeks, post-unload operations and repeated unloads are also checked. Inspector regression tests exercise failed keyboard selection, failed LOD requests, retained labels/framing, visible errors, successful recovery and resource cleanup. Fixture mutations occur only under the output directory.

## Import and ownership rules

`daybreak_importer.gd` is reusable without the inspection UI:

1. `open_manifest(path, repository_root)` validates the explicit path base, schema, unique IDs, all three LOD references and collision policy. Invalid catalogs leave the prior catalog and scene intact.
2. `load_asset(id, lod)` or `switch_lod(lod)` captures and validates the embedded-only GLB bytes before importing those same bytes through `GLTFDocument.append_from_buffer`. Absolute/URI/dot/traversal/symlink references are rejected. This avoids external glTF texture/buffer fetches and subsequent asset-path rereads during import.
3. Visual PBR/UV and declared-animation checks must pass. Required collision geometry is imported separately, transformed from its actual node hierarchy and converted to `StaticBody3D` triangle shapes. The replacement is staged before releasing the prior selection.
4. `seek_clip`, `advance_animation`, `clip_length` and `pose_snapshot` support actual rigid clip inspection. These methods confer no gameplay authority or moving-body collision state.
5. `unload()` stops clips, clears references and destroys owned visual/physics nodes. It is safe to call repeatedly. `resource_weakrefs()` supports lifecycle tests without retaining the probed resources.

Only `REQUIRED` with an exported collider creates physics. `NONE` explicitly means no collider. `PENDING` requires a nonblank remaining gate and creates no collider; the baffle is therefore not made into a fake collision-ready mechanism. The supporting colonnade and non-solid shade remain separate modules. Arbitrary visual meshes are never silently substituted for missing movement proxies.

## Remaining gates

This is an engine consumer and inspection project, not a constructed world, authority server or completed building. It does not implement sockets/placement tools, navigation, event states, saves, player permissions, safe baffle reservations, streamed content or networking. Actual stair/ramp controller traversal is recorded in the separate physics harness; this project's collider construction does not replace those movement tests. Wedge proxies, landing guards, visual joints, damaged/restored states, texture fidelity, LOD transitions, performance, Unreal imports and final visual approval remain separate gates.

No Godot GPU parity, rendered reference match, engineering/accessibility certification or production approval follows from these CPU/headless checks.
