# Unreal production import adapter

**Status: NOT_EXECUTED_UNREAL_UNAVAILABLE.** Unreal Editor is absent in the selected executor. The adapter has Python syntax/preflight checks only; no Unreal API call, import, material, animation, or gameplay pass is claimed. No engine was installed, license accepted, plugin enabled, or security setting changed.

## Run in an existing authorized Unreal project

Use an isolated review project with Python Editor Script Plugin, Editor Scripting Utilities, and the appropriate installed glTF/Interchange importer already available. Review the project's default import pipeline; this adapter intentionally uses the installed importer and logs unsupported APIs rather than inventing a factory or pipeline path. Epic documents editor Python execution and its plugin prerequisites in [Scripting the Unreal Editor Using Python](https://dev.epicgames.com/documentation/en-us/unreal-engine/scripting-the-unreal-editor-using-python). The [Interchange documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/importing-assets-using-interchange-in-unreal-engine) explains pipeline selection and glTF routing.

In Unreal's **Python** Output Log console, substitute absolute paths and a new review run name:

```python
import runpy; result = runpy.run_path("/absolute/Aetherion-The-Fifteen-Oaths/engines/unreal/production-import/import_production.py")["run"]("/absolute/Aetherion-The-Fifteen-Oaths", "/absolute/evidence/unreal-import-001.json", "/Game/AetherionProductionReview/Run001")
```

Alternatively, in a POSIX shell with an existing Unreal installation and project:

```sh
export AETHERION_REPO="/absolute/Aetherion-The-Fifteen-Oaths"
export AETHERION_UNREAL_REPORT="/absolute/evidence/unreal-import-001.json"
export AETHERION_UNREAL_DESTINATION="/Game/AetherionProductionReview/Run001"
UnrealEditor-Cmd "/absolute/ReviewProject.uproject" \
  -ExecutePythonScript="$AETHERION_REPO/engines/unreal/production-import/import_production.py"
```

The report path and Content Browser destination must be new. Imports save new assets in the review project and may retain partial imports on failure. They do not overwrite existing destinations, rewrite source files, alter project settings, or delete assets. Keep the Unreal Output Log beside the JSON report: importer warnings outside Python exceptions are not automatically captured by this script. The JSON status is authoritative for the scripted checks; a command process exiting alone is not a pass.

## Import scope and evidence

The adapter discovers all `*manifest*.json` files recursively below `assets/production`, including additional Oaths as they arrive. It validates schema version 1 and all repository-relative GLB references, refuses missing/unlisted exports, then batches imports into unique subdirectories. Wait for authors to finish exporting manifests before running.

Every GLB—including state variants, LODs and collision geometry—is imported as a separate asset set. **LODs are not attached to the base mesh; collision geometry is not assigned as collision.** Automatic importer-generated collision, if any, is not proof that the supplied collision mesh was used. Complete those native editor steps and test them separately; [standards.json](standards.json) records proposed acceptance settings, not applied or verified configuration.

Evidence records actual engine version, imported object paths/classes, material slots/references, native LOD counts, static mesh triangle counts and bounds, skeletal mesh skeleton paths, and observed AnimSequence counts/durations. Source GLB JSON counts are explicitly labeled expectations and never substituted for engine counts. Missing expected mesh/skin/animation objects or unsupported property access produces `FAILED_OR_UNSUPPORTED`. A successful inspection ends as `IMPORT_INSPECTED_NOT_GAMEPLAY_CERTIFIED`, not full compatibility certification. Material appearance, texture channels, native LOD/collision integration, animation playback, GPU behavior and gameplay remain untested.

## API references

The implementation uses the documented Unreal Python **5.6** API surface; other versions must run and report their own API support:

- [AssetImportTask](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/AssetImportTask?application_version=5.6): synchronous automated tasks and `get_objects()`.
- [AssetTools](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/AssetTools?application_version=5.6): `import_asset_tasks()`.
- [StaticMesh](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/StaticMesh?application_version=5.6): LOD, triangle, bounds and material queries.
- [SkeletalMesh](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/SkeletalMesh?application_version=5.6) and [SkeletalMeshEditorSubsystem](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/SkeletalMeshEditorSubsystem?application_version=5.6): material/skeleton properties and LOD counts.
- [AnimSequenceBase](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/AnimSequenceBase?application_version=5.6): sequence duration.
- [EditorAssetLibrary](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/EditorAssetLibrary?application_version=5.6): refuse existing destination directories.
- [SystemLibrary](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/SystemLibrary?application_version=5.6): actual engine version.
