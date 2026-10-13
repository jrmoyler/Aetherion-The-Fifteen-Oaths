"""Hash actual production candidate files without granting acceptance."""
from pathlib import Path, PurePosixPath
import hashlib
import json


def collect_deliveries(root, family_ids):
    root = Path(root).resolve()
    deliveries = []
    seen = set()
    for manifest_path in sorted((root / 'assets/production').glob('**/manifest.json')):
        manifest = json.loads(manifest_path.read_text())
        family = manifest['familyId']
        if family not in family_ids:
            raise ValueError(f'Unknown production family: {family}')
        for asset in manifest['assets']:
            if asset['id'] in seen:
                raise ValueError(f'Duplicate production asset ID: {asset["id"]}')
            seen.add(asset['id'])
            files = asset['files']
            for key in ('blend', 'glb', 'lod1', 'lod2', 'collision'):
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
                    relative = PurePosixPath(value)
                    path = (root / relative).resolve()
                    if (relative.is_absolute() or '..' in relative.parts or
                            not path.is_relative_to(root / 'assets/production')):
                        raise ValueError(f'Production artifact escapes its root: {value}')
                    if not path.is_file():
                        raise ValueError(f'Missing production artifact: {value}')
                    data = path.read_bytes()
                    if (role in ('glb', 'lod1', 'lod2', 'collision') or path.suffix.lower() == '.glb') and data[:4] != b'glTF':
                        raise ValueError(f'Not a GLB deliverable: {value}')
                    if role == 'blend' and data[:7] != b'BLENDER':
                        # Compressed Blender sources must be verified by Blender;
                        # current production authoring uses uncompressed .blend.
                        raise ValueError(f'Not an uncompressed Blender source: {value}')
                    evidence.append({'role': role, 'path': value, 'size_bytes': len(data),
                                     'sha256': hashlib.sha256(data).hexdigest()})
            deliveries.append({'id': asset['id'], 'archetype_id': asset.get('archetypeId', asset['id']),
                               'name': asset['name'], 'family_id': family,
                               'manifest_path': manifest_path.relative_to(root).as_posix(),
                               'manifest_sha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
                               'state': asset.get('state', asset.get('variant', 'SEE_ASSET_MANIFEST')),
                               'reference_ids': manifest.get('referenceIds', []),
                               'artifacts': evidence, 'status': 'CANDIDATE_FILES_PRESENT_NOT_ACCEPTED',
                               'production_accepted': False,
                               'declared_type': asset.get('type'),
                               'declared_geometry': asset.get('triangles'),
                               'declared_rig': asset.get('rig'),
                               'declared_animations': asset.get('animations'),
                               'metadata_policy': 'Declaration retained for audit linkage; file presence does not verify these claims.',
                               'remaining_gates': asset.get('remainingGates', [])})
    return deliveries
