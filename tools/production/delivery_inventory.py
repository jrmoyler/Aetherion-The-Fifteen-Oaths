"""Hash actual production candidate files without granting acceptance."""
from pathlib import Path, PurePosixPath
import hashlib
import json


def artifact_path(root, value, base=None):
    if not isinstance(value, str) or not value or '\\' in value:
        raise ValueError(f'Invalid artifact path: {value}')
    relative = PurePosixPath(value)
    path = ((base or root) / relative).resolve()
    if (relative.is_absolute() or '..' in relative.parts or
            not path.is_relative_to(root / 'assets/production')):
        raise ValueError(f'Production artifact escapes its root: {value}')
    if not path.is_file():
        raise ValueError(f'Missing production artifact: {value}')
    return path


def collision_policy(asset):
    policy = asset.get('collisionPolicy', {'mode': 'REQUIRED'})
    if not isinstance(policy, dict) or policy.get('mode') not in ('REQUIRED', 'NONE', 'PENDING'):
        raise ValueError(f'Invalid collision policy: {asset["id"]}')
    mode = policy['mode']
    collision = asset['files'].get('collision')
    if mode == 'REQUIRED' and not isinstance(collision, str):
        raise ValueError(f'Missing collision deliverable: {asset["id"]}')
    if mode != 'REQUIRED':
        if not isinstance(policy.get('reason'), str) or not policy['reason'].strip():
            raise ValueError(f'Collision exemption/gap requires reason: {asset["id"]}')
        if 'collision' in asset['files']:
            raise ValueError(f'Contradictory collision policy: {asset["id"]}')
        if mode == 'PENDING' and (not isinstance(policy.get('remainingGate'), str) or
                                  not policy['remainingGate'].strip()):
            raise ValueError(f'Pending collision requires remaining gate: {asset["id"]}')
    return policy


def validate_compressed_source(root, asset, data):
    # Blender saves gzip or Zstandard compressed files. A magic header alone is
    # not import evidence: require a pinned actual-open report for these bytes.
    if not (data.startswith(b'\x1f\x8b') or data.startswith(b'\x28\xb5\x2f\xfd')):
        raise ValueError(f'Not a Blender source: {asset["id"]}')
    metadata = asset.get('sourceValidation')
    if not isinstance(metadata, dict):
        raise ValueError(f'Compressed Blender source requires import evidence: {asset["id"]}')
    report_path = artifact_path(root, metadata.get('report'))
    report_bytes = report_path.read_bytes()
    digest = hashlib.sha256(report_bytes).hexdigest()
    if metadata.get('reportSha256') != digest:
        raise ValueError(f'Blender import report hash mismatch: {asset["id"]}')
    report = json.loads(report_bytes)
    tool = report.get('tool', {})
    if (type(report.get('schemaVersion')) not in (int, float) or report['schemaVersion'] != 1 or
            tool.get('name') != 'Blender' or
            not isinstance(tool.get('version'), str) or not tool['version'].strip()):
        raise ValueError(f'Invalid Blender import report tool/schema: {asset["id"]}')
    records = report.get('reports')
    if not isinstance(records, list) or any(not isinstance(r, dict) for r in records):
        raise ValueError(f'Invalid Blender import report records: {asset["id"]}')
    matches = [r for r in records if r.get('module') == metadata.get('recordId')]
    if (not isinstance(metadata.get('recordId'), str) or not metadata['recordId'] or
            len(matches) != 1 or matches[0].get('opened') is not True or
            matches[0].get('errors') != [] or
            matches[0].get('source_sha256') != hashlib.sha256(data).hexdigest()):
        raise ValueError(f'Blender source import evidence mismatch/failure: {asset["id"]}')
    return {'role': 'source_validation', 'path': report_path.relative_to(root).as_posix(),
            'size_bytes': len(report_bytes), 'sha256': digest}


def collect_deliveries(root, family_ids):
    root = Path(root).resolve()
    deliveries = []
    seen = set()
    for manifest_path in sorted((root / 'assets/production').glob('**/manifest.json')):
        manifest = json.loads(manifest_path.read_text())
        path_base = manifest.get('filePathBase', 'REPOSITORY_ROOT')
        if path_base not in ('REPOSITORY_ROOT', 'MANIFEST_DIRECTORY'):
            raise ValueError(f'Invalid filePathBase: {manifest_path}')
        base = root if path_base == 'REPOSITORY_ROOT' else manifest_path.parent
        family = manifest['familyId']
        if family not in family_ids:
            raise ValueError(f'Unknown production family: {family}')
        for asset in manifest['assets']:
            if asset['id'] in seen:
                raise ValueError(f'Duplicate production asset ID: {asset["id"]}')
            seen.add(asset['id'])
            files = asset['files']
            policy = collision_policy(asset)
            for key in ('blend', 'glb', 'lod1', 'lod2'):
                if not isinstance(files.get(key), str):
                    raise ValueError(f'Missing {key} deliverable: {asset["id"]}')
            for key in ('textures', 'renders'):
                if not isinstance(files.get(key), list) or not files[key]:
                    raise ValueError(f'Missing {key} deliverables: {asset["id"]}')
            evidence = []
            for role, values in files.items():
                for value in values if isinstance(values, list) else [values]:
                    if not isinstance(value, str):
                        raise ValueError(f'Invalid artifact path for {asset["id"]}')
                    path = artifact_path(root, value, base)
                    data = path.read_bytes()
                    if (role in ('glb', 'lod1', 'lod2', 'collision') or path.suffix.lower() == '.glb') and data[:4] != b'glTF':
                        raise ValueError(f'Not a GLB deliverable: {value}')
                    if role == 'blend' and data[:7] != b'BLENDER':
                        evidence.append(validate_compressed_source(root, asset, data))
                    evidence.append({'role': role, 'path': path.relative_to(root).as_posix(), 'size_bytes': len(data),
                                     'sha256': hashlib.sha256(data).hexdigest()})
            deliveries.append({'id': asset['id'], 'archetype_id': asset.get('archetypeId', asset['id']),
                               'name': asset['name'], 'family_id': family,
                               'manifest_path': manifest_path.relative_to(root).as_posix(),
                               'manifest_sha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
                               'state': asset.get('state', asset.get('variant', 'SEE_ASSET_MANIFEST')),
                               'reference_ids': manifest.get('referenceIds', []),
                               'artifacts': evidence,
                               'status': ('CANDIDATE_INCOMPLETE_MISSING_REQUIRED_COLLISION' if policy['mode'] == 'PENDING'
                                          else 'CANDIDATE_FILES_PRESENT_NOT_ACCEPTED'),
                               'collision_policy': policy,
                               'production_accepted': False,
                               'declared_type': asset.get('type'),
                               'declared_geometry': asset.get('triangles'),
                               'declared_rig': asset.get('rig'),
                               'declared_animations': asset.get('animations'),
                               'metadata_policy': 'Declaration retained for audit linkage; file presence does not verify these claims.',
                               'remaining_gates': list(dict.fromkeys(asset.get('remainingGates', []) +
                                   ([policy['remainingGate']] if policy['mode'] == 'PENDING' else [])))})
    return deliveries
