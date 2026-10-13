"""Inventory integrity tests: ensure bad evidence fails closed without source edits."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('inventory', Path(__file__).with_name('inventory.py'))
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


class InventoryIntegrity(unittest.TestCase):
    def test_duplicate_ids_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate id'):
            inventory.require_unique([{'id': 'same'}, {'id': 'same'}], 'id', 'fixture')

    def test_duplicate_source_hashes_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate sha256'):
            inventory.require_unique([{'sha256': 'same'}, {'sha256': 'same'}], 'sha256', 'fixture')

    def test_file_hash_mismatch_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, 'artifact.glb').write_bytes(b'not-a-certified-model')
            with patch.object(inventory, 'ROOT', Path(tmp)):
                with self.assertRaisesRegex(ValueError, 'Hash mismatch'):
                    inventory.file_evidence('artifact.glb', '0' * 64)

    def test_missing_artifact_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(inventory, 'ROOT', Path(tmp)):
                with self.assertRaisesRegex(ValueError, 'Missing source artifact'):
                    inventory.file_evidence('missing.glb', '0' * 64)

    def test_unknown_category_requires_explicit_classification(self):
        groups = {k: v for k, v in inventory.GROUPS.items() if k != 'audio'}
        with patch.object(inventory, 'GROUPS', groups):
            with self.assertRaisesRegex(ValueError, 'Taxonomy categories changed'):
                inventory.build()

    def test_dangling_family_dependency_rejected(self):
        original_read = inventory.read
        def fixture_read(path):
            data = original_read(path)
            if path == inventory.MASTER:
                family = next(r for r in data['records'] if r['record_kind'] == 'production_family_requirement')
                family['dependencies'].append('missing-family-id')
            return data
        with patch.object(inventory, 'read', fixture_read):
            with self.assertRaisesRegex(ValueError, 'Unresolved family dependency'):
                inventory.build()

    def test_detail_identity_and_source_alias_deduplication(self):
        import json
        manifest = json.loads(inventory.build()['inventory.json'])
        detail = manifest['detail_scope_links']
        self.assertEqual(len(detail), len({r['id'] for r in detail}))
        assets = manifest['preserved_source_asset_ledger']
        self.assertEqual(len(assets), len({r['sha256'] for r in assets}))
        aliases = [a for r in assets for a in r['master_alias_ids']]
        self.assertEqual(len(aliases), manifest['counts']['primary_source_file_alias_records'])
        self.assertEqual(len(aliases), len(set(aliases)))
        self.assertIsNone(manifest['counts']['exact_mesh_and_clip_requirement_count'])
        self.assertIsNone(manifest['phase_ii']['item_level_inventory'])
        self.assertEqual(manifest['counts']['new_production_asset_deliverables'], 0)
        self.assertTrue(all(not r['approved'] for r in manifest['production_requirements']))


if __name__ == '__main__':
    unittest.main()
