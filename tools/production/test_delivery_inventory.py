import json
import hashlib
from pathlib import Path
import tempfile
import unittest
from delivery_inventory import collect_deliveries


class DeliveryInventoryTests(unittest.TestCase):
    def import_evidence(self, root, asset):
        source = root / asset['files']['blend']
        # Synthetic signature fixture exercises receipt binding, not a Blender import claim.
        source.write_bytes(b'\x28\xb5\x2f\xfdcompressed source fixture')
        report = {'schemaVersion': 1, 'tool': {'name': 'Blender', 'version': 'test-fixture'},
                  'reports': [{'module': 'test-module', 'opened': True, 'errors': [],
                               'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest()}]}
        path = root / 'assets/production/test/source-validation.json'
        path.write_text(json.dumps(report))
        asset['sourceValidation'] = {'report': path.relative_to(root).as_posix(),
                                    'reportSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                                    'recordId': 'test-module'}
        return path, report

    def fixture(self, root):
        folder = root / 'assets/production/test'
        folder.mkdir(parents=True)
        files = {}
        for key, extension, content in [('blend', '.blend', b'BLENDER'),
                                        ('glb', '.glb', b'glTF'),
                                        ('lod1', '.glb', b'glTF'),
                                        ('lod2', '.glb', b'glTF'),
                                        ('collision', '.glb', b'glTF'),
                                        ('textures', '.png', b'texture fixture'),
                                        ('renders', '.png', b'render fixture')]:
            path = folder / (key + extension)
            path.write_bytes(content)
            value = path.relative_to(root).as_posix()
            files[key] = [value] if key in ('textures', 'renders') else value
        value = {'familyId': 'family-test', 'assets': [{'id': 'candidate-test',
                 'name': 'Candidate fixture', 'files': files}]}
        manifest = folder / 'manifest.json'
        manifest.write_text(json.dumps(value))
        return manifest, value

    def test_file_presence_never_grants_acceptance(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.fixture(root)
            result = collect_deliveries(root, {'family-test'})
            self.assertEqual(len(result), 1)
            self.assertFalse(result[0]['production_accepted'])
            self.assertEqual(len(result[0]['artifacts']), 7)

    def test_unknown_family_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.fixture(root)
            with self.assertRaisesRegex(ValueError, 'Unknown production family'):
                collect_deliveries(root, {'another-family'})

    def test_missing_export_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.fixture(root)
            (root / 'assets/production/test/lod1.glb').unlink()
            with self.assertRaisesRegex(ValueError, 'Missing production artifact'):
                collect_deliveries(root, {'family-test'})

    def test_path_escape_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path, value = self.fixture(root)
            value['assets'][0]['files']['glb'] = '../../elsewhere.glb'
            path.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError, 'escapes its root'):
                collect_deliveries(root, {'family-test'})

    def test_duplicate_candidate_id_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path, value = self.fixture(root)
            value['assets'].append(value['assets'][0])
            path.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError, 'Duplicate production asset ID'):
                collect_deliveries(root, {'family-test'})

    def test_extra_state_export_signature_checked(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            manifest, value = self.fixture(root)
            extra = root / 'assets/production/test/extra-state.glb'
            extra.write_bytes(b'not actually a glb')
            value['assets'][0]['files']['stowed'] = extra.relative_to(root).as_posix()
            manifest.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError, 'Not a GLB deliverable'):
                collect_deliveries(root, {'family-test'})

    def test_required_collision_stays_required(self):
        for policy in (None, {'mode': 'REQUIRED'}):
            with self.subTest(policy=policy), tempfile.TemporaryDirectory() as folder:
                root = Path(folder); manifest, value = self.fixture(root)
                asset = value['assets'][0]; asset['files'].pop('collision')
                if policy is not None: asset['collisionPolicy'] = policy
                manifest.write_text(json.dumps(value))
                with self.assertRaisesRegex(ValueError, 'Missing collision'):
                    collect_deliveries(root, {'family-test'})

    def test_justified_nonblocking_collision_exemption(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); manifest, value = self.fixture(root)
            asset = value['assets'][0]; asset['files'].pop('collision')
            asset['collisionPolicy'] = {'mode': 'NONE', 'reason': 'Non-solid overhead cloth, not a walking surface'}
            manifest.write_text(json.dumps(value)); row = collect_deliveries(root, {'family-test'})[0]
            self.assertEqual(row['collision_policy'], asset['collisionPolicy'])
            self.assertFalse(row['production_accepted'])

    def test_missing_pending_collision_is_explicitly_incomplete(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); manifest, value = self.fixture(root)
            asset = value['assets'][0]; asset['files'].pop('collision')
            asset['collisionPolicy'] = {'mode': 'PENDING', 'reason': 'Moving-state collider not authored',
                                        'remainingGate': 'Author and test state-specific collision'}
            manifest.write_text(json.dumps(value)); row = collect_deliveries(root, {'family-test'})[0]
            self.assertEqual(row['status'], 'CANDIDATE_INCOMPLETE_MISSING_REQUIRED_COLLISION')
            self.assertIn(asset['collisionPolicy']['remainingGate'], row['remaining_gates'])
            self.assertFalse(row['production_accepted'])

    def test_collision_waivers_cannot_be_empty_or_contradictory(self):
        for policy, keep_file in [({'mode': 'NONE'}, False), ({'mode': 'NONE', 'reason': ' '}, False),
                                  ({'mode': 'PENDING', 'reason': 'Missing collider'}, False),
                                  ({'mode': 'NONE', 'reason': 'Nonblocking'}, True),
                                  ({'mode': 'invented'}, False)]:
            with self.subTest(policy=policy), tempfile.TemporaryDirectory() as folder:
                root = Path(folder); manifest, value = self.fixture(root); asset = value['assets'][0]
                asset['collisionPolicy'] = policy
                if not keep_file: asset['files'].pop('collision')
                manifest.write_text(json.dumps(value))
                with self.assertRaises(ValueError): collect_deliveries(root, {'family-test'})

    def test_compressed_source_requires_hash_bound_successful_actual_open_report(self):
        for mutation in ('none', 'source_changed', 'report_changed', 'errors', 'not_opened',
                         'wrong_source_hash', 'wrong_record', 'duplicate_record', 'wrong_tool', 'missing_report'):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as folder:
                root = Path(folder); manifest, value = self.fixture(root); asset = value['assets'][0]
                path, report = self.import_evidence(root, asset)
                if mutation == 'source_changed': (root / asset['files']['blend']).write_bytes(b'\x28\xb5\x2f\xfddifferent source')
                if mutation == 'report_changed': path.write_text(path.read_text() + ' ')
                if mutation == 'errors': report['reports'][0]['errors'] = ['IMPORT_FAILED']
                if mutation == 'not_opened': report['reports'][0]['opened'] = False
                if mutation == 'wrong_source_hash': report['reports'][0]['source_sha256'] = '0' * 64
                if mutation == 'wrong_record': asset['sourceValidation']['recordId'] = 'another-module'
                if mutation == 'duplicate_record': report['reports'].append(report['reports'][0].copy())
                if mutation == 'wrong_tool': report['tool']['name'] = 'Signature-only fake'
                if mutation in ('errors', 'not_opened', 'wrong_source_hash', 'duplicate_record', 'wrong_tool'):
                    path.write_text(json.dumps(report)); asset['sourceValidation']['reportSha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
                if mutation == 'missing_report': asset.pop('sourceValidation')
                manifest.write_text(json.dumps(value))
                if mutation == 'none':
                    row = collect_deliveries(root, {'family-test'})[0]
                    self.assertIn('source_validation', [a['role'] for a in row['artifacts']])
                    self.assertFalse(row['production_accepted'])
                else:
                    with self.assertRaises(ValueError): collect_deliveries(root, {'family-test'})

    def test_manifest_relative_paths_are_explicit_and_fixtures_do_not_inflate_designs(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); manifest, value = self.fixture(root)
            for key, item in value['assets'][0]['files'].items():
                value['assets'][0]['files'][key] = ([Path(p).name for p in item] if isinstance(item, list) else Path(item).name)
            value['filePathBase'] = 'MANIFEST_DIRECTORY'
            value['assemblyFixtures'] = [{'id': f'fixture-{i}'} for i in range(5)]
            manifest.write_text(json.dumps(value)); rows = collect_deliveries(root, {'family-test'})
            self.assertEqual(len(rows), 1)
            self.assertTrue(all(a['path'].startswith('assets/production/test/') for a in rows[0]['artifacts']))
            value['assets'][0]['files']['glb'] = '../test/glb.glb'
            manifest.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError, 'escapes its root'): collect_deliveries(root, {'family-test'})


if __name__ == '__main__':
    unittest.main()
