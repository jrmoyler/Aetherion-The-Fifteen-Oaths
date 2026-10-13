"""Safety tests use synthetic fixtures, never a substitute production archive."""

import hashlib
import importlib.util
import io
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile


MODULE_PATH = Path(__file__).resolve().parents[2] / "tools/production/import_phase_ii.py"
MODULE_SPEC = importlib.util.spec_from_file_location("phase_ii_importer", MODULE_PATH)
importer = importlib.util.module_from_spec(MODULE_SPEC)
sys.modules[MODULE_SPEC.name] = importer
MODULE_SPEC.loader.exec_module(importer)


class PhaseIIImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repository"
        self.repo.mkdir()

    def fixture(self, extras=(), prefix="", docs=True):
        entries = []
        if docs:
            entries.extend([(prefix + "README.md", b"Fixture README"),
                            (prefix + "INTEGRATION_PLAN.md", b"Fixture plan")])
        entries.extend(extras)
        buffer = io.BytesIO()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(buffer, "w") as archive:
                for name, data in entries:
                    archive.writestr(name, data)
        raw = buffer.getvalue()
        path = self.root / "fixture.zip"
        path.write_bytes(raw)
        spec = importer.ArchiveSpec("fixture.zip", len(raw), hashlib.sha256(raw).hexdigest(), len(entries))
        return path, spec

    def inspect(self, **kwargs):
        path, spec = self.fixture(**kwargs)
        return importer.inspect_archive(path, spec=spec)

    def apply(self, inspection):
        return importer.import_archive(inspection, self.repo, inspection.review_token)

    def test_exact_archive_and_payload_bytes_preserved(self):
        inspection = self.inspect(extras=[("blueprints/a.bin", b"\x00\xff\r\n")], prefix="")
        result = self.apply(inspection)
        self.assertEqual(result, {"payload_files": 3, "created_files": 5, "unchanged_files": 0})
        self.assertEqual((self.repo / importer.ARCHIVE_ROOT / "fixture.zip").read_bytes(), inspection.archive)
        self.assertEqual((self.repo / importer.DOCUMENT_ROOT / "blueprints/a.bin").read_bytes(), b"\x00\xff\r\n")
        self.assertEqual((self.repo / importer.ARCHIVE_ROOT / "fixture.zip.sha256").read_text(),
                         f"{inspection.spec.sha256}  fixture.zip\n")

    def test_repeat_import_preserves_existing_files(self):
        inspection = self.inspect()
        self.apply(inspection)
        target = self.repo / importer.DOCUMENT_ROOT / "README.md"
        before = target.stat().st_mtime_ns
        self.assertEqual(self.apply(inspection)["created_files"], 0)
        self.assertEqual(target.stat().st_mtime_ns, before)

    def test_production_pin_rejects_synthetic_fixture_without_writes(self):
        path, _ = self.fixture()
        with self.assertRaisesRegex(importer.ImportRejected, "pinned"):
            importer.inspect_archive(path)
        self.assertEqual(list(self.repo.iterdir()), [])

    def test_size_and_digest_checked_independently(self):
        path, spec = self.fixture()
        for altered in (importer.ArchiveSpec(spec.filename, spec.size + 1, spec.sha256, 2),
                        importer.ArchiveSpec(spec.filename, spec.size, "0" * 64, 2)):
            with self.assertRaises(importer.ImportRejected):
                importer.inspect_archive(path, spec=altered)

    def test_traversal_and_absolute_paths_rejected(self):
        for name in ("../escape", "/escape", "a/../../escape", "a\\escape", "C:/escape", "a//b", "a/./b"):
            with self.subTest(name=name), self.assertRaises(importer.ImportRejected):
                self.inspect(extras=[(name, b"bad")])

    def test_symlink_payload_rejected(self):
        link = zipfile.ZipInfo("symlink")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        with self.assertRaisesRegex(importer.ImportRejected, "Non-regular"):
            self.inspect(extras=[(link, b"outside")])

    def test_duplicate_and_case_colliding_entries_rejected(self):
        for name in ("README.md", "readme.MD"):
            with self.subTest(name=name), self.assertRaisesRegex(importer.ImportRejected, "Duplicate"):
                self.inspect(extras=[(name, b"other")])

    def test_file_directory_collision_rejected(self):
        with self.assertRaisesRegex(importer.ImportRejected, "File/directory"):
            self.inspect(extras=[("assets", b"file"), ("assets/item", b"item")])

    def test_common_folder_discovered(self):
        inspection = self.inspect(prefix="package/")
        self.assertEqual(inspection.prefix, "package/")
        self.assertIn("README.md", inspection.payloads)

    def test_deep_layout_needs_explicit_mapping(self):
        path, spec = self.fixture(prefix="outer/inner/")
        with self.assertRaisesRegex(importer.ImportRejected, "Ambiguous"):
            importer.inspect_archive(path, spec=spec)
        inspection = importer.inspect_archive(path, prefix="outer/inner/", spec=spec)
        self.assertEqual(inspection.prefix, "outer/inner/")

    def test_mapping_cannot_silently_drop_payloads(self):
        path, spec = self.fixture(prefix="package/", extras=[("outside.txt", b"keep")])
        with self.assertRaisesRegex(importer.ImportRejected, "omit"):
            importer.inspect_archive(path, prefix="package/", spec=spec)

    def test_missing_or_ambiguous_review_documents_rejected(self):
        for extras in ([], [("README.md", b"readme")], [("README.txt", b"second")]):
            with self.subTest(extras=extras), self.assertRaises(importer.ImportRejected):
                self.inspect(docs=len(extras) == 1 and extras[0][0] == "README.txt", extras=extras)

    def test_review_token_required_and_bound_to_mapping_and_documents(self):
        first = self.inspect()
        second = self.inspect(prefix="package/")
        self.assertNotEqual(first.review_token, second.review_token)
        with self.assertRaisesRegex(importer.ImportRejected, "Read README"):
            importer.import_archive(first, self.repo, second.review_token)
        self.assertEqual(list(self.repo.iterdir()), [])

    def test_different_existing_file_prevents_entire_import(self):
        inspection = self.inspect()
        target = self.repo / importer.DOCUMENT_ROOT / "INTEGRATION_PLAN.md"
        target.parent.mkdir(parents=True)
        target.write_bytes(b"owner edits")
        with self.assertRaisesRegex(importer.ImportRejected, "differs"):
            self.apply(inspection)
        self.assertEqual(target.read_bytes(), b"owner edits")
        self.assertFalse((target.parent / "README.md").exists())
        self.assertFalse((self.repo / importer.ARCHIVE_ROOT).exists())

    def test_repository_symlink_rejected(self):
        outside = self.root / "outside"
        outside.mkdir()
        (self.repo / "AETHERION_CANON").symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(importer.ImportRejected, "symlink"):
            self.apply(self.inspect())
        self.assertEqual(list(outside.iterdir()), [])

    def test_repository_case_collision_rejected(self):
        (self.repo / "aetherion_canon").mkdir()
        with self.assertRaisesRegex(importer.ImportRejected, "case collision"):
            self.apply(self.inspect())
        self.assertEqual([p.name for p in self.repo.iterdir()], ["aetherion_canon"])

    def test_publish_error_rolls_back_new_files_and_directories(self):
        inspection = self.inspect()
        real_link = importer.os.link
        counter = 0

        def fail_second(source, destination):
            nonlocal counter
            counter += 1
            if counter == 2:
                raise OSError("simulated publish failure")
            return real_link(source, destination)

        with patch.object(importer.os, "link", side_effect=fail_second):
            with self.assertRaisesRegex(OSError, "simulated"):
                self.apply(inspection)
        self.assertEqual(list(self.repo.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
