#!/usr/bin/env python3
"""Verify an explicitly supplied disposable clean checkout; never clone or publish.

Run this tool from the working repository, targeting a separate checkout. All
fresh evidence goes to a new external directory. Known legacy report writers
are captured and restored before inventory checks; unexpected changes fail.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import subprocess
import sys
import zipfile

SCRIPT_REPOSITORY = Path(__file__).resolve().parents[2]
ARCHIVE = 'docs/archives/Aetherion_Phase_II_Continental_Architecture_2026-10-13.zip'
ARCHIVE_SHA256 = '02306b20f0c070f6fe488d7bf2e4fa25412503010c037860fe3a2a91244be2bc'
ARCHIVE_BYTES = 1011575
PHASE_II = 'AETHERION_CANON/21_WORLD_CONSTRUCTION_PHASE_II'
PACKAGES = {
    'runtime': 'runtime/ability-matrix',
    'sandbox': 'runtime/ability-matrix/packs/sandbox',
    'production': 'tools/production',
    'preview': 'app/production-preview',
}
PREVIEW_REPORTS = [
    'app/production-preview/VALIDATION.md',
    *['app/production-preview/validation/' + name for name in [
        'unit-tests.log', 'asset-import-cpu.json', 'asset-import.log', 'build.log',
        'http-development.log', 'http-built.log', 'snapshot.json',
    ]],
]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def git(root: Path, *args: str) -> str:
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()


def local_file(root: Path, relative: str) -> Path:
    """Reject escaping registry paths, including symlinks outside the checkout."""
    name = PurePosixPath(relative)
    if name.is_absolute() or '..' in name.parts or '\\' in relative:
        raise ValueError(f'Expected a contained relative path: {relative}')
    result = (root / relative).resolve()
    if not result.is_relative_to(root):
        raise ValueError(f'Path escapes checkout: {relative}')
    return result


def validate_locations(checkout: Path, report_dir: Path,
                       expected_head: str | None = None) -> tuple[Path, Path, str]:
    """Validate before creating reports, installing dependencies or running checks."""
    root, output = checkout.resolve(), report_dir.resolve()
    if not root.is_dir():
        raise ValueError('The explicit checkout directory does not exist')
    if root == SCRIPT_REPOSITORY:
        raise ValueError('Use a separate disposable checkout, not this tool\'s working repository')
    if output.is_relative_to(root) or root.is_relative_to(output):
        raise ValueError('Report directory must be outside and not contain the checkout')
    if output.is_relative_to(SCRIPT_REPOSITORY):
        raise ValueError('Report directory must be outside the tool\'s working repository')
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise ValueError('Report directory must be new or empty; existing evidence is never overwritten')
    if Path(git(root, 'rev-parse', '--show-toplevel')).resolve() != root:
        raise ValueError('--checkout must name the repository root')
    head = git(root, 'rev-parse', 'HEAD')
    if expected_head and (not re.fullmatch(r'[0-9a-fA-F]{40}', expected_head)
                          or head != expected_head.lower()):
        raise ValueError(f'Checkout HEAD {head} does not match the full expected commit')
    if git(root, 'status', '--porcelain=v1', '--untracked-files=all'):
        raise ValueError('Checkout must be clean, including non-ignored untracked files')
    return root, output, head


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + '\n')


def tracked_hashes(root: Path) -> dict[str, str]:
    paths = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z']).decode().split('\0')
    return {name: digest(local_file(root, name).read_bytes()) for name in paths if name}


def preservation(root: Path) -> dict:
    manifest = json.loads((root / 'CASTABLE_SOURCE_MANIFEST.json').read_text())
    source_bad = []
    for entry in manifest['files']:
        try:
            content = local_file(root, entry['destinationPath']).read_bytes()
            valid = len(content) == entry['bytes'] and digest(content) == entry['sha256']
        except (OSError, ValueError):
            valid = False
        if not valid:
            source_bad.append(entry['destinationPath'])
    archive = root / ARCHIVE
    blob = archive.read_bytes()
    payload_count, payload_bad = 0, []
    with zipfile.ZipFile(archive) as package:
        for entry in package.infolist():
            if entry.is_dir() or not entry.filename.startswith('AETHERION_PHASE_II/'):
                continue
            name = entry.filename.removeprefix('AETHERION_PHASE_II/')
            payload_count += 1
            try:
                valid = local_file(root / PHASE_II, name).read_bytes() == package.read(entry)
            except (OSError, ValueError):
                valid = False
            if not valid:
                payload_bad.append(name)
    return {
        'sourceFiles': len(manifest['files']), 'sourceBytes': manifest['totalBytes'],
        'sourceMismatches': source_bad, 'phaseIIArchiveBytes': len(blob),
        'phaseIIArchiveSHA256': digest(blob), 'phaseIIPayloadFiles': payload_count,
        'phaseIIPayloadMismatches': payload_bad,
        'pass': (len(manifest['files']) == 1896 and not source_bad
                 and len(blob) == ARCHIVE_BYTES and digest(blob) == ARCHIVE_SHA256
                 and payload_count == 115 and not payload_bad),
    }


def preview_snapshot_match(root: Path) -> dict:
    snapshot = json.loads((root / 'app/production-preview/validation/snapshot.json').read_text())
    mismatches = []
    for entry in snapshot['previewInputs']:
        relative = 'app/production-preview/' + entry['path']
        if digest(local_file(root, relative).read_bytes()) != entry['sha256']:
            mismatches.append(relative)
    for entry in snapshot['testedAssetInputs']:
        if digest(local_file(root, entry['path']).read_bytes()) != entry['sha256']:
            mismatches.append(entry['path'])
    return {'sourceSnapshot': snapshot['generatedAt'], 'mismatches': mismatches}


@contextmanager
def capture_reports(root: Path, output: Path, paths: list[str]):
    """Capture only named report writes; restore exact old bytes even on failure.

    This never restores source/assets or broad directory trees. Unexpected
    tracked changes remain visible and fail the final checkout comparison.
    """
    saved = {}
    for name in paths:
        file = local_file(root, name)
        if (root / name).is_symlink():
            raise ValueError(f'Refusing a symlink report target: {name}')
        saved[name] = (file.read_bytes(), file.stat().st_mode) if file.exists() else None
    try:
        yield
    finally:
        errors = []
        captures = []
        for name, original in saved.items():
            file = root / name
            capture = {'path': name, 'originalSHA256': digest(original[0]) if original else None,
                       'capturedSHA256': None}
            try:
                if file.is_symlink():
                    file.unlink()
                    errors.append(f'Report writer replaced target with symlink: {name}')
                elif file.is_file():
                    target = output / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(file, target)
                    capture['capturedSHA256'] = digest(target.read_bytes())
                if original is None:
                    if file.is_file():
                        file.unlink()
                else:
                    file.parent.mkdir(parents=True, exist_ok=True)
                    file.write_bytes(original[0])
                    file.chmod(original[1])
            except OSError as error:
                errors.append(f'{name}: {error}')
            capture['contentChanged'] = capture['originalSHA256'] != capture['capturedSHA256']
            captures.append(capture)
        output.mkdir(parents=True, exist_ok=True)
        with (output / 'report-captures.jsonl').open('a') as stream:
            stream.write(json.dumps({'capturedAt': utc_now(), 'reports': captures}) + '\n')
        if errors:
            raise RuntimeError('Could not safely capture/restore reports: ' + '; '.join(errors))


class Verification:
    def __init__(self, root: Path, output: Path, head: str, jobs: int, timeout: int):
        self.root, self.output, self.head = root, output, head
        self.jobs, self.timeout = jobs, timeout
        self.results: list[dict] = []
        self.blocked: list[str] = []
        self.failures: list[str] = []

    def command(self, name: str, argv: list[str], cwd: Path | None = None) -> dict:
        start = utc_now()
        log = self.output / 'logs' / (name + '.log')
        log.parent.mkdir(parents=True, exist_ok=True)
        result = {'name': name, 'argv': argv, 'cwd': str(cwd or self.root),
                  'startedAt': start, 'log': str(log.relative_to(self.output))}
        with log.open('w') as stream:
            try:
                process = subprocess.Popen(argv, cwd=cwd or self.root, stdout=stream,
                                           stderr=subprocess.STDOUT, text=True,
                                           start_new_session=True)
                try:
                    result['exitCode'] = process.wait(timeout=self.timeout)
                except subprocess.TimeoutExpired:
                    # Stop npm's child processes too, rather than leaving Vite running.
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait()
                    result.update(exitCode=process.returncode, timedOut=True)
            except OSError as error:
                result.update(exitCode=None, error=str(error))
                stream.write(str(error) + '\n')
        result['finishedAt'] = utc_now()
        result['pass'] = result.get('exitCode') == 0 and not result.get('timedOut')
        print(json.dumps({'check': name, 'pass': result['pass'], 'exitCode': result['exitCode']}), flush=True)
        return result

    def run(self, name: str, argv: list[str], cwd: Path | None = None) -> dict:
        result = self.command(name, argv, cwd)
        self.results.append(result)
        return result

    def batch(self, commands: list[tuple]) -> list[dict]:
        with ThreadPoolExecutor(max_workers=self.jobs) as pool:
            results = list(pool.map(lambda args: self.command(*args), commands))
        self.results.extend(results)
        return results

    def writer(self, name: str, argv: list[str], reports: list[str], cwd: Path | None = None):
        with capture_reports(self.root, self.output / 'artifacts', reports):
            return self.run(name, argv, cwd)

    def execute(self):
        # Inventory is evaluated before any legacy report-producing commands.
        self.run('inventory-before', [sys.executable, 'tools/production/inventory.py', '--check'])
        installs = self.batch([
            ('install-' + name, ['npm', 'ci', '--prefix', relative, '--cache',
                                str(self.output / 'scratch' / ('npm-cache-' + name))])
            for name, relative in PACKAGES.items()
        ])
        packages_ready = all(result['pass'] for result in installs)
        fixture = self.output / 'scratch' / 'phase2-negative-package'
        shutil.copytree(self.root / PHASE_II, fixture)
        phase_code = (
            'import importlib.util,json,pathlib,sys; '
            'p=pathlib.Path(sys.argv[1]);s=importlib.util.spec_from_file_location("phase2",p);'
            'm=importlib.util.module_from_spec(s);s.loader.exec_module(m);r=m.run(write=False);'
            'pathlib.Path(sys.argv[2]).write_text(json.dumps(r,indent=2)+"\\n");'
            'print(json.dumps(r["counts"]));raise SystemExit(bool(r["counts"].get("FAIL")))'
        )
        independent = [
            ('production-python', [sys.executable, '-m', 'unittest', 'discover', '-s', 'tools/production', '-p', 'test_*.py']),
            ('importer', [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests/production']),
            ('canon', [sys.executable, 'AETHERION_CANON/19_VALIDATION/validate_canon.py', '--repo', '.', '--output', str(self.output / 'canon.json')]),
            ('canon-fixtures', [sys.executable, '-m', 'unittest', 'discover', '-s', 'AETHERION_CANON/19_VALIDATION', '-p', 'test_validator.py']),
            ('systems', [sys.executable, 'AETHERION_CANON/18_IMPLEMENTATION_CONTRACTS/validate_systems.py', '--repo-root', '.', '--output', str(self.output / 'systems.json')]),
            ('phase2', [sys.executable, '-c', phase_code, str(self.root / PHASE_II / 'validation/validate_phase2.py'), str(self.output / 'phase2.json')]),
            ('phase2-negative', [sys.executable, str(fixture / 'validation/run_negative_fixtures.py')]),
        ]
        if packages_ready:
            independent += [
                ('root', ['npm', 'test']), ('source', ['npm', 'run', 'test:source']),
                ('world-kernel', ['npm', 'run', 'test:world']),
                ('production-node', ['npm', '--prefix', PACKAGES['production'], 'test']),
            ]
        else:
            self.blocked.append('Node tests, builds and candidate checks: one or more locked dependency installs failed')
        self.batch(independent)
        negative_path = fixture / 'validation/NEGATIVE_FIXTURE_REPORT.json'
        if negative_path.exists():
            negative = json.loads(negative_path.read_text())
            shutil.copyfile(negative_path, self.output / 'phase2-negative.json')
            if negative['counts']['FAIL']:
                self.failures.append('Phase II negative fixtures report failure despite script exit status')
        else:
            self.failures.append('Phase II negative-fixture report missing')
        self.writer('narrative', [sys.executable, 'AETHERION_CANON/06_NARRATIVE/validate_world_narrative.py', 'AETHERION_CANON'],
                    ['AETHERION_CANON/06_NARRATIVE/WORLD_NARRATIVE_VALIDATION.json'])
        if packages_ready:
            built = self.run('ability-build', ['npm', 'run', 'build:abilities'])
            self.writer('preview-snapshot', ['npm', 'run', 'validate:snapshot'],
                        PREVIEW_REPORTS, self.root / PACKAGES['preview'])
            self.writer('deliverables', ['npm', '--prefix', PACKAGES['production'], 'run', 'validate:deliverables'],
                        ['validation/production/' + name for name in [
                            'DELIVERABLE_AUDIT.json', 'DELIVERABLE_AUDIT.md', 'DELIVERABLE_AUDIT_DETAILS.json.gz']])
            if built['pass']:
                self.writer('ability-artifacts', ['node', 'tests/runtime-audit/verify-wrapper-build.mjs'],
                            ['validation/aetherion-wrapper-build-verification.json'])
            else:
                self.blocked.append('Ability artifact checks: ability build failed')
            self.writer('ability-http', ['node', 'tests/runtime-audit/check-wrapper-dev.mjs'],
                        ['validation/aetherion-wrapper-dev-check.json'])
        # Every known report writer above has restored its catalogued input bytes.
        self.run('inventory-after', [sys.executable, 'tools/production/inventory.py', '--check'])


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkout', required=True, type=Path, help='Separate disposable Git checkout; must start clean')
    parser.add_argument('--report-dir', required=True, type=Path, help='New or empty directory outside both repositories')
    parser.add_argument('--expected-head', help='Optional full 40-character commit expected in the supplied checkout')
    parser.add_argument('--jobs', type=int, default=4)
    parser.add_argument('--timeout-seconds', type=int, default=600)
    args = parser.parse_args(argv)
    if not 1 <= args.jobs <= 16 or not 1 <= args.timeout_seconds <= 3600:
        parser.error('jobs must be 1..16 and timeout-seconds must be 1..3600')
    try:
        root, output, head = validate_locations(args.checkout, args.report_dir, args.expected_head)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.error(str(error))
    output.mkdir(parents=True, exist_ok=True)
    verification = Verification(root, output, head, args.jobs, args.timeout_seconds)
    summary = {
        'revision': head, 'startedAt': utc_now(), 'checkout': str(root),
        'initialCheckoutClean': True, 'scope': 'Local supplied checkpoint, fresh locked dependency installs; no fetch, clone, push, merge or deployment performed.',
        'limitations': ['No GPU/browser-render, visual approval, target-device performance, complete gameplay or Unreal/Godot engine execution is certified by this runner. Engine validators must run separately against the same SHA.',
                        'A local HEAD match does not prove a remote branch points to that SHA; capture remote evidence separately.',
                        'Art approvals remain separate from format, CPU, HTTP and static planning checks.'],
        'runnerSHA256': digest(Path(__file__).read_bytes()),
    }
    baseline = None
    try:
        baseline = tracked_hashes(root)
        write_json(output / 'tracked-input-hashes.json', baseline)
        summary['before'] = preservation(root)
        summary['committedPreviewSnapshot'] = preview_snapshot_match(root)
        if not summary['before']['pass']:
            verification.failures.append('Initial source/archive/payload preservation failed; checks not started')
        elif summary['committedPreviewSnapshot']['mismatches']:
            verification.failures.append('Committed preview snapshot does not match checkout; checks not started')
        else:
            verification.execute()
    except (Exception, KeyboardInterrupt) as error:
        verification.failures.append(f'{type(error).__name__}: {error}')
    finally:
        try:
            summary['after'] = preservation(root)
            if not summary['after']['pass']:
                verification.failures.append('Final source/archive/payload preservation failed')
            if baseline is not None:
                changed = [name for name, expected in baseline.items()
                           if not local_file(root, name).is_file()
                           or digest(local_file(root, name).read_bytes()) != expected]
                summary['trackedFileMismatches'] = changed
                summary['lockfileMismatches'] = [name for name in changed if name.endswith('package-lock.json')]
                if changed:
                    verification.failures.append('Tracked files changed after named report restoration')
            status = git(root, 'status', '--porcelain=v1', '--untracked-files=all')
            (output / 'checkout-status.txt').write_text(status + ('\n' if status else ''))
            if status:
                verification.failures.append('Checkout no longer clean after verification')
            if git(root, 'rev-parse', 'HEAD') != head:
                verification.failures.append('Checkout HEAD changed during verification')
        except Exception as error:
            verification.failures.append(f'Final preservation check failed: {error}')
        summary.update(finishedAt=utc_now(), commands=verification.results,
                       failures=verification.failures, blocked=verification.blocked)
        summary['status'] = 'PASS' if not verification.failures and not verification.blocked and all(r['pass'] for r in verification.results) else 'FAIL'
        write_json(output / 'summary.json', summary)
        checksum_rows = []
        for file in sorted(output.rglob('*')):
            relative = file.relative_to(output)
            if file.is_file() and 'scratch' not in relative.parts and file.name != 'SHA256SUMS':
                checksum_rows.append(digest(file.read_bytes()) + '  ' + relative.as_posix())
        (output / 'SHA256SUMS').write_text('\n'.join(checksum_rows) + '\n')
        print(json.dumps({'status': summary['status'], 'revision': head,
                          'commandFailures': [r['name'] for r in verification.results if not r['pass']],
                          'failures': verification.failures, 'reportDirectory': str(output)}), flush=True)
    return 0 if summary['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
