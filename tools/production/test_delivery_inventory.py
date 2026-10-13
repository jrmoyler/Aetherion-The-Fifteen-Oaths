import json
from pathlib import Path
import tempfile
import unittest
from delivery_inventory import collect_deliveries


class DeliveryInventoryTests(unittest.TestCase):
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


if __name__ == '__main__':
    unittest.main()
