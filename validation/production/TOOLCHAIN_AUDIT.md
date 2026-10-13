# Production toolchain audit

Measured 2026-10-13 UTC in the selected Linux executor against source commit `8c4b5d0bfc75a98388ea29231b9cf1d304dff550`. These are tool availability and importer checks, not full production asset, rendered gameplay, or cross-engine parity certification. No source GLBs were modified, no software installed, and no sandbox/credential settings changed.

| Tool | Observed version | Executed evidence | Limitations |
| --- | --- | --- | --- |
| Blender | 4.3.2, `/usr/bin/blender` | Background Python succeeds; all 13 distinct existing source GLBs instantiate; temporary factory scene saves `.blend`, exports uncompressed GLB and renders 96×96 PNG with Cycles CPU, 4 samples | Gyroscope importer reports invalid unweighted vertices despite completing; Draco library unavailable; build has no OpenImageDenoise; disable denoising for CPU render. Read-only home extension-cache warning. No authored production deliverable or asset beauty render from this probe |
| Godot | 4.6.3.stable.official.7d41c59c4, `/usr/local/bin/godot` | Headless SceneTree mesh/material probe succeeds; GLTFDocument imports all 13 distinct source GLBs, generates scene nodes, adds to root and frees each with zero failed imports | Headless dummy renderer only; animation presence counted, playback and visuals not judged. Default read-only home user-data path crashes; explicit writable XDG directories under `/tmp` resolve this |
| Unreal | Not found | `UnrealEditor`, `UnrealEditor-Cmd`, `UE4Editor`, `UE4Editor-Cmd` absent from PATH; executable-name search in `/opt` and `/workspace` found none | No real import/runtime test possible; requires authorized provisioned Unreal environment. License availability unverified |
| Three.js | Package pins 0.185.1 | Runtime package.json inspected | `runtime/ability-matrix/node_modules/three` absent at audit time, so local module probe cannot load; root regression work may install it separately. No WebGL proof |
| Node/npm | v24.19.0 / 11.9.0 | Version commands succeed | Build/regression evidence belongs in separate test report |
| Chromium | 154.0.8037.57, Debian 13 | Normal headless launch with writable user-data directory attempted | FATAL: SUID sandbox helper incorrectly configured; browser refuses launch. No bypass attempted |
| GPU | No `/dev/dri` | Filesystem probe | Hardware rendering not verified; CPU rendering remains usable |

## Source import results

The 26 runtime GLB paths resolve to 13 unique SHA256 payloads. Deduplication used file bytes, not filenames. Copies under `/tmp/aetherion-toolchain-probe/source` were tested. Every listed source imported in both Blender and Godot. Blender logged an error for `magical_gyroscope.glb`: `File is invalid: Some vertices are not assigned to bone(s)`. Its completed import is therefore **WITH DEFECT**, not a clean compatibility pass. This is a discovered pre-existing source issue and the immutable source was preserved.

| Canonical tested source path | SHA256 |
| --- | --- |
| `runtime/ability-matrix/packs/casting/public/models/amethyst_stones.glb` | `c91ec4ecede0d1c5bd2f4db78da8784587e96cd11565338dd94dca9b2cb19d72` |
| `runtime/ability-matrix/packs/casting/public/models/arcane_tome.glb` | `9071b301202753b4b71aee68b9736bb024d37dc2513250b092c822ca3cfecbc0` |
| `runtime/ability-matrix/packs/casting/public/models/dragon.glb` | `904fc29f889668ef82204feb0d87849060ae2c7cb486769a35081a415beb4db5` |
| `runtime/ability-matrix/packs/casting/public/models/duel_hall.glb` | `0c7344c414e3a3fad7fc2cce38e7f0245dd2eed3969779ef0e3c03867fc58972` |
| `runtime/ability-matrix/packs/casting/public/models/magical_gyroscope.glb` | `715905b8213abcd514ed9b6f7bced500c27f9a6abd0f1297b7b289582004938c` |
| `runtime/ability-matrix/packs/casting/public/models/shark.glb` | `744c9715fce8f7859efbcfccf11178b7d5dca552435e290499331ab129bdc05d` |
| `runtime/ability-matrix/packs/casting/public/models/wildroot_reliquary.glb` | `9fe8b09bdfc4482a28e340a14ec037e7089c7db39615bf35be5df81848a5100d` |
| `runtime/ability-matrix/packs/casting/public/models/wolf.glb` | `d3f970ddfeefd79d2a2f63beafd541ae9a0d4ba6380bc7072dbdfa14d295dac2` |
| `runtime/ability-matrix/packs/collective/public/models/snake.glb` | `2f77f26510efd3ffa03f8ee5cfb779b4ce0697c5343aa635ea3af32f6904989d` |
| `runtime/ability-matrix/packs/handcast/public/models/drone.glb` | `0a76415a6ea716f5b4524828f51d67a89674c3bb95328a10d2b431d3193b1193` |
| `runtime/ability-matrix/packs/handcast/public/models/monowheelArmyBot.glb` | `5f36fc08b97de1e22ddd0588f83deef9529eb55d94aac8ee4d235d512d087324` |
| `runtime/ability-matrix/packs/handcast/public/models/phoenix_bird.glb` | `cb68b7f4827d6f7bee47ca7b8bb882437b9945d00c974338e55a720f53b5d6f0` |
| `runtime/ability-matrix/packs/linear-ext/public/textures/textures.glb` | `9ab9c00e0fd2a06c9d84ab639ec3dfb0ab269d2de4d229c40ca21e153a17a938` |

Godot console evidence (CPU import/scene instantiation only):

```text
Godot Engine v4.6.3.stable.official.7d41c59c4 - https://godotengine.org

IMPORT_OK runtime/ability-matrix/packs/casting/public/models/amethyst_stones.glb meshes=5 materials=0 skins=0 animations=0
IMPORT_OK runtime/ability-matrix/packs/casting/public/models/arcane_tome.glb meshes=39 materials=7 skins=0 animations=0
IMPORT_OK runtime/ability-matrix/packs/casting/public/models/dragon.glb meshes=4 materials=4 skins=1 animations=1
IMPORT_OK runtime/ability-matrix/packs/casting/public/models/duel_hall.glb meshes=57 materials=17 skins=0 animations=0
IMPORT_OK runtime/ability-matrix/packs/casting/public/models/magical_gyroscope.glb meshes=1 materials=1 skins=1 animations=2
IMPORT_OK runtime/ability-matrix/packs/casting/public/models/shark.glb meshes=5 materials=3 skins=1 animations=2
IMPORT_OK runtime/ability-matrix/packs/casting/public/models/wildroot_reliquary.glb meshes=6 materials=0 skins=0 animations=0
IMPORT_OK runtime/ability-matrix/packs/casting/public/models/wolf.glb meshes=5 materials=5 skins=1 animations=7
IMPORT_OK runtime/ability-matrix/packs/collective/public/models/snake.glb meshes=1 materials=1 skins=0 animations=0
IMPORT_OK runtime/ability-matrix/packs/handcast/public/models/drone.glb meshes=8 materials=1 skins=0 animations=0
IMPORT_OK runtime/ability-matrix/packs/handcast/public/models/monowheelArmyBot.glb meshes=4 materials=1 skins=0 animations=0
IMPORT_OK runtime/ability-matrix/packs/handcast/public/models/phoenix_bird.glb meshes=2 materials=2 skins=1 animations=1
IMPORT_OK runtime/ability-matrix/packs/linear-ext/public/textures/textures.glb meshes=2 materials=2 skins=0 animations=0
IMPORT_TOTAL 13 failures=0
```

## Reproduction and interpretation

For Blender, use `blender --background --factory-startup --python <probe.py>`; for each unique GLB reset with `bpy.ops.wm.read_factory_settings(use_empty=True)` then `bpy.ops.import_scene.gltf(filepath=<local-copy>)`. Count datablocks and inspect the complete console, since an importer can complete while emitting an error. Blender counts include generated armature display meshes and actions split by imported object; they are not directly comparable to GLB/Godot mesh/animation counts.

For Godot, create a temporary `project.godot` with `config_version=5` and run a script extending `SceneTree`. For each source create `GLTFDocument.new()` and `GLTFState.new()`, check `append_from_file(path, state) == OK`, call `generate_scene(state)`, add the resulting node to `root`, then free it. The tested command used:

```sh
XDG_DATA_HOME=/tmp/aetherion-toolchain-probe/data \
XDG_CACHE_HOME=/tmp/aetherion-toolchain-probe/cache \
XDG_CONFIG_HOME=/tmp/aetherion-toolchain-probe/config \
godot --headless --path /tmp/aetherion-toolchain-probe \
  --script /tmp/aetherion-toolchain-probe/import.gd
```

The temporary Blender render needed `scene.render.engine='CYCLES'`, `scene.cycles.device='CPU'`, and `scene.cycles.use_denoising=False`. Saving `.blend`, GLB export and CPU rendering then succeeded. The cube is a disposable diagnostic, not a production asset and is not included in the repository. Uncompressed GLB export succeeds despite the missing Draco-library warning.

The attempted browser command was `chromium --headless --user-data-dir=/tmp/aetherion-toolchain-probe/chromium --dump-dom about:blank`. It failed with `The SUID sandbox helper binary was found, but is not configured correctly`. This audit does not recommend or use disabling sandboxing, changing its owner/mode, or claiming a GPU pass.

## Remaining acceptance work

- Real Unreal import and runtime verification requires the engine to be available in an authorized environment.
- Browser gameplay and visual checks require a correctly provisioned browser sandbox; this task did not alter security settings.
- Blender/Godot import success does not validate textures visually, reference similarity, UV quality, collision behavior, LODs, deformation, animation playback, scale/pivots or art approval.
- Gyroscope bone weights require an additive production repair and regression evidence without rewriting immutable source.
- Hardware performance budgets remain proposed until measured. No hardware GPU, Unreal, browser gameplay, or full engine parity certification is established here.

## Repeatable probes

Executable probes now live in [`tools/production/engine-probes`](../../tools/production/engine-probes/README.md). Run the documented command at the final remote head with a new report filename. The initial structured report is `source-engine-imports.initial.json`; it captures per-asset SHA256, all source aliases, engine counts, full console output, source-preservation checks and tested commit. `WITH_DEFECT` causes a nonzero runner exit instead of being silently accepted.
