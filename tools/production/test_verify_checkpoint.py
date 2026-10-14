"""Safety guards and report restoration, without invoking package installs."""
from pathlib import Path
import subprocess
import tempfile
import unittest

import verify_checkpoint as verifier


class CheckpointGuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='aetherion-checkpoint-guard-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / 'checkout'
        self.root.mkdir()
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        (self.root / 'record.txt').write_text('original\n')
        subprocess.run(['git', '-C', str(self.root), 'add', 'record.txt'], check=True)
        subprocess.run(['git', '-C', str(self.root), '-c', 'user.name=Guard Test',
                        '-c', 'user.email=guard@example.invalid', 'commit', '-qm', 'fixture'], check=True)
        self.output = self.base / 'reports'

    def test_inside_checkout_report_path_rejected_before_writes(self):
        inside = self.root / 'new-reports'
        with self.assertRaisesRegex(ValueError, 'outside'):
            verifier.validate_locations(self.root, inside)
        self.assertFalse(inside.exists())

    def test_symlinked_report_path_cannot_escape_location_guard(self):
        link = self.base / 'report-link'
        link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'outside'):
            verifier.validate_locations(self.root, link)

    def test_dirty_tracked_or_untracked_checkout_rejected(self):
        (self.root / 'record.txt').write_text('changed\n')
        with self.assertRaisesRegex(ValueError, 'clean'):
            verifier.validate_locations(self.root, self.output)
        (self.root / 'record.txt').write_text('original\n')
        (self.root / 'untracked.txt').write_text('new\n')
        with self.assertRaisesRegex(ValueError, 'clean'):
            verifier.validate_locations(self.root, self.output)
        self.assertFalse(self.output.exists())

    def test_wrong_commit_and_existing_evidence_rejected(self):
        with self.assertRaisesRegex(ValueError, 'expected commit'):
            verifier.validate_locations(self.root, self.output, '0' * 40)
        self.output.mkdir()
        evidence = self.output / 'previous.json'
        evidence.write_text('preserve me')
        with self.assertRaisesRegex(ValueError, 'never overwritten'):
            verifier.validate_locations(self.root, self.output)
        self.assertEqual(evidence.read_text(), 'preserve me')

    def test_clean_explicit_checkout_accepted_without_mutation(self):
        head = verifier.git(self.root, 'rev-parse', 'HEAD')
        self.assertEqual(verifier.validate_locations(self.root, self.output, head),
                         (self.root.resolve(), self.output.resolve(), head))
        self.assertFalse(self.output.exists())

    def test_failed_report_writer_is_captured_and_restored_exactly(self):
        original = (self.root / 'record.txt').read_bytes()
        with self.assertRaisesRegex(RuntimeError, 'simulated failed check'):
            with verifier.capture_reports(self.root, self.output,
                                          ['record.txt', 'new-report.json']):
                (self.root / 'record.txt').write_text('new result\n')
                (self.root / 'new-report.json').write_text('{"failed":true}\n')
                raise RuntimeError('simulated failed check')
        self.assertEqual((self.root / 'record.txt').read_bytes(), original)
        self.assertFalse((self.root / 'new-report.json').exists())
        self.assertEqual((self.output / 'record.txt').read_text(), 'new result\n')
        self.assertEqual((self.output / 'new-report.json').read_text(), '{"failed":true}\n')
        self.assertEqual(verifier.git(self.root, 'status', '--porcelain'), '')

    def test_registry_relative_paths_cannot_escape(self):
        for name in ['../outside', '/absolute', 'folder\\outside']:
            with self.assertRaises(ValueError):
                verifier.local_file(self.root, name)


if __name__ == '__main__':
    unittest.main()
