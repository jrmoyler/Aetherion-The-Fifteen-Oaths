"""Unreal Editor import adapter. No execution/compatibility claim without Unreal.

Call run(repo, report, destination_root) from Unreal's Python console, or use the
AETHERION_REPO / AETHERION_UNREAL_REPORT / AETHERION_UNREAL_DESTINATION variables.
Only new Content Browser destinations are allowed; source files are read-only.
"""
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import traceback


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def glb_expectations(path):
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError('Truncated GLB: ' + str(path))
    magic, version, size, json_size, json_type = struct.unpack('<5I', data[:20])
    if magic != 0x46546C67 or version != 2 or size != len(data) or json_type != 0x4E4F534A:
        raise ValueError('Invalid GLB header: ' + str(path))
    doc = json.loads(data[20:20 + json_size])
    return {key: len(doc.get(key, [])) for key in ['meshes', 'materials', 'skins', 'animations']}


def glb_references(value, prefix='files'):
    if isinstance(value, dict):
        for key, child in value.items():
            yield from glb_references(child, prefix + '.' + key)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from glb_references(child, prefix + '.' + str(index))
    elif isinstance(value, str) and value.lower().endswith('.glb'):
        yield prefix, value


def build_plan(repo):
    root = (repo / 'assets/production').resolve()
    manifests = sorted(root.rglob('*manifest*.json'))
    if not manifests:
        raise ValueError('No production manifests found')
    inputs = {}
    manifest_evidence = []
    for manifest in manifests:
        doc = json.loads(manifest.read_text())
        if doc.get('schemaVersion') != 1 or not isinstance(doc.get('assets'), list):
            raise ValueError('Unsupported manifest schema: ' + str(manifest))
        manifest_evidence.append({'path': str(manifest.relative_to(repo)), 'sha256': digest(manifest)})
        for asset in doc['assets']:
            if not isinstance(asset.get('files'), dict) or not asset['files'].get('glb'):
                raise ValueError('Asset lacks files.glb in ' + str(manifest))
            for role, relative in glb_references(asset['files']):
                path = (repo / relative).resolve()
                if not path.is_relative_to(root) or not path.is_file():
                    raise ValueError('GLB must exist within assets/production: ' + relative)
                row = inputs.setdefault(str(path), {
                    'path': str(path.relative_to(repo)), 'sha256': digest(path),
                    'source_expectations_not_engine_evidence': glb_expectations(path), 'references': []})
                row['references'].append({'manifest': str(manifest.relative_to(repo)), 'asset_id': asset['id'], 'role': role})
    unlisted = sorted(str(p.relative_to(repo)) for p in root.rglob('*.glb') if str(p.resolve()) not in inputs)
    if unlisted:
        raise ValueError('Production GLBs missing from manifests: ' + ', '.join(unlisted))
    return list(inputs.values()), manifest_evidence


def inspect_object(unreal, obj):
    """Unsupported API/property access raises; no default counts substitute for it."""
    row = {'path': obj.get_path_name(), 'class': obj.get_class().get_name()}
    if isinstance(obj, unreal.StaticMesh):
        row['lod_count'] = int(obj.get_num_lods())
        slots = obj.get_editor_property('static_materials')
        row['material_slot_count'] = len(slots)
        row['lod_triangles'] = [int(obj.get_num_triangles(i)) for i in range(row['lod_count'])]
        bounds = obj.get_bounds()
        row['bounds_extent_unreal_units'] = [float(bounds.box_extent.x), float(bounds.box_extent.y), float(bounds.box_extent.z)]
    elif isinstance(obj, unreal.SkeletalMesh):
        row['lod_count'] = int(unreal.get_editor_subsystem(unreal.SkeletalMeshEditorSubsystem).get_lod_count(obj))
        slots = obj.get_editor_property('materials')
        row['material_slot_count'] = len(slots)
        skeleton = obj.get_editor_property('skeleton')
        row['skeleton_path'] = skeleton.get_path_name() if skeleton else None
    else:
        slots = None
    if slots is not None:
        row['material_paths'] = []
        for slot in slots:
            material = slot.get_editor_property('material_interface')
            row['material_paths'].append(material.get_path_name() if material else None)
    if isinstance(obj, unreal.AnimSequence):
        row['sequence_length_seconds'] = float(obj.get_editor_property('sequence_length'))
        row['playback_status'] = 'NOT_EXECUTED'
    return row


def run(repo, report, destination_root):
    repo = Path(repo).resolve()
    report = Path(report).resolve()
    if report.exists():
        raise ValueError('Report already exists; use a new evidence path')
    if report.is_relative_to(repo / 'assets') or report.is_relative_to(repo / 'runtime'):
        raise ValueError('Report cannot overwrite asset/runtime sources')
    if not re.fullmatch(r'/Game/AetherionProductionReview/[A-Za-z0-9_]+', destination_root):
        raise ValueError('Use a new /Game/AetherionProductionReview/RunName destination')
    result = {
        'status': 'NOT_EXECUTED', 'engine_version': None,
        'timestamp_utc': datetime.now(timezone.utc).isoformat(),
        'destination_root': destination_root, 'results': [], 'errors': [],
        'lod_attachment_status': 'NOT_INTEGRATED_SEPARATE_IMPORTS_ONLY',
        'collision_assignment_status': 'NOT_INTEGRATED_SEPARATE_IMPORTS_ONLY',
        'rendered_visual_gameplay_parity_status': 'NOT_EXECUTED',
        'pipeline_policy': 'Installed editor default glTF pipeline; no guessed factory or pipeline paths; settings require review',
    }
    unreal = None
    try:
        try:
            import unreal
        except ImportError:
            result['status'] = 'NOT_EXECUTED_UNREAL_UNAVAILABLE'
            result['errors'].append('Unreal Python API unavailable; no editor imports attempted')
            return result
        plan, manifests = build_plan(repo)
        result['source_plan'] = plan
        result['manifests'] = manifests
        result['engine_version'] = unreal.SystemLibrary.get_engine_version()
        if unreal.EditorAssetLibrary.does_directory_exist(destination_root):
            raise ValueError('Destination already exists; existing content will not be changed')
        tasks = []
        for row in plan:
            token = hashlib.sha256(row['path'].encode()).hexdigest()[:12]
            name = re.sub(r'[^A-Za-z0-9_]', '_', Path(row['path']).stem)
            task = unreal.AssetImportTask()
            for key, value in {
                'filename': str(repo / row['path']),
                'destination_path': destination_root + '/' + name + '_' + token,
                'automated': True, 'async_': False, 'replace_existing': False,
                'replace_existing_settings': False, 'save': True,
            }.items():
                task.set_editor_property(key, value)
            tasks.append(task)
        unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks(tasks)
        for source, task in zip(plan, tasks):
            row = {'source': source['path'], 'source_sha256': source['sha256'], 'status': 'IMPORT_INSPECTED',
                   'objects': [], 'errors': [], 'lod_attachment_status': result['lod_attachment_status'],
                   'collision_assignment_status': result['collision_assignment_status']}
            try:
                objects = {obj.get_path_name(): obj for obj in task.get_objects()}
                # Include reported dependencies when task objects omit them.
                for object_path in task.get_editor_property('imported_object_paths'):
                    loaded = unreal.load_asset(object_path)
                    if loaded is None:
                        raise RuntimeError('Reported imported object cannot load: ' + object_path)
                    objects[loaded.get_path_name()] = loaded
                if not objects:
                    raise RuntimeError('No imported objects returned; importer/pipeline support unverified')
                for obj in objects.values():
                    try:
                        row['objects'].append(inspect_object(unreal, obj))
                    except Exception as exc:
                        message = 'UNSUPPORTED_OR_FAILED_API_ACCESS ' + obj.get_path_name() + ': ' + repr(exc)
                        row['errors'].append(message)
                        unreal.log_error(message)
                row['observed_imported_class_counts'] = dict(Counter(obj.get_class().get_name() for obj in objects.values()))
                row['observed_animation_sequence_count'] = sum(isinstance(obj, unreal.AnimSequence) for obj in objects.values())
                row['observed_material_asset_count'] = sum(isinstance(obj, unreal.MaterialInterface) for obj in objects.values())
                row['observed_static_mesh_count'] = sum(isinstance(obj, unreal.StaticMesh) for obj in objects.values())
                row['observed_skeletal_mesh_count'] = sum(isinstance(obj, unreal.SkeletalMesh) for obj in objects.values())
                expectations = source['source_expectations_not_engine_evidence']
                if expectations['meshes'] and not row['observed_static_mesh_count'] + row['observed_skeletal_mesh_count']:
                    row['errors'].append('Source meshes present but no imported mesh objects observed')
                if expectations['skins'] and not row['observed_skeletal_mesh_count']:
                    row['errors'].append('Source skin present but no SkeletalMesh observed')
                if row['observed_animation_sequence_count'] < expectations['animations']:
                    row['errors'].append('Fewer imported animation sequences than source clips; unsupported/lost animation requires review')
            except Exception as exc:
                row['errors'].append(repr(exc))
            row['source_unchanged'] = digest(repo / source['path']) == source['sha256']
            if not row['source_unchanged']:
                row['errors'].append('Source hash changed during import')
            if row['errors']:
                row['status'] = 'FAILED_OR_UNSUPPORTED'
            result['results'].append(row)
        result['status'] = ('FAILED_OR_UNSUPPORTED' if any(row['errors'] for row in result['results'])
                            else 'IMPORT_INSPECTED_NOT_GAMEPLAY_CERTIFIED')
    except Exception:
        result['status'] = 'FAILED_OR_UNSUPPORTED'
        result['errors'].append(traceback.format_exc())
        if unreal is not None:
            unreal.log_error(result['errors'][-1])
    finally:
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps(result, indent=2) + '\n')
        print('AETHERION_UNREAL_IMPORT ' + result['status'] + ' report=' + str(report))
    return result


if __name__ == '__main__':
    outcome = run(os.environ['AETHERION_REPO'], os.environ['AETHERION_UNREAL_REPORT'],
                  os.environ['AETHERION_UNREAL_DESTINATION'])
    if outcome['status'] != 'IMPORT_INSPECTED_NOT_GAMEPLAY_CERTIFIED':
        raise RuntimeError(outcome['status'] + '; inspect the JSON report and Unreal Output Log')
