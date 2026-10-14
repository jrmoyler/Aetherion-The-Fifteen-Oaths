#!/usr/bin/env python3
"""Import each byte-unique runtime GLB in Blender/Godot; never save source files.

Exit 0 = all imports clean, 1 = defects/failures, 2 = unavailable tool.
Source snapshots are copied to the supplied scratch directory before import.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo', required=True, type=Path)
parser.add_argument('--scratch', required=True, type=Path)
parser.add_argument('--report', required=True, type=Path)
parser.add_argument('--engine', choices=['both', 'blender', 'godot'], default='both')
args = parser.parse_args()
repo, scratch, report = args.repo.resolve(), args.scratch.resolve(), args.report.resolve()
source = repo / 'runtime/ability-matrix'
if scratch.is_relative_to(repo):
    parser.error('--scratch must be outside the repository')
if report.is_relative_to(source) or report.name == 'AGENTS.md':
    parser.error('--report must not overwrite source files or instructions')
if report.exists():
    parser.error('--report must be a new file; existing evidence is preserved')
scratch.mkdir(parents=True, exist_ok=True)
work = Path(tempfile.mkdtemp(prefix='aetherion-import-', dir=scratch))
probe_dir = Path(__file__).resolve().parent
(work / 'project.godot').write_text('config_version=5\n[application]\nconfig/name="Aetherion source import probe"\n')
shutil.copyfile(probe_dir / 'godot_import.gd', work / 'godot_import.gd')
env = dict(os.environ)
for key, name in [('XDG_DATA_HOME', 'data'), ('XDG_CACHE_HOME', 'cache'), ('XDG_CONFIG_HOME', 'config')]:
    (work / name).mkdir()
    env[key] = str(work / name)
engines = ['blender', 'godot'] if args.engine == 'both' else [args.engine]
paths = sorted(source.rglob('*.glb'))
unique = {}
for path in paths:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    unique.setdefault(digest, []).append(path)
results = []
missing = [engine for engine in engines if shutil.which(engine) is None]
for digest, aliases in unique.items():
    original = aliases[0]
    local = work / (digest + '.glb')
    shutil.copyfile(original, local)
    assert hashlib.sha256(local.read_bytes()).hexdigest() == digest
    for engine in engines:
        item = {'engine': engine, 'path': str(original.relative_to(repo)),
                'aliases': [str(p.relative_to(repo)) for p in aliases], 'sha256': digest}
        if engine in missing:
            item.update(status='UNAVAILABLE', error='Executable not found on PATH')
            results.append(item)
            continue
        command = ([engine, '--background', '--factory-startup', '--python',
                    str(probe_dir / 'blender_import.py'), '--', '--input', str(local)]
                   if engine == 'blender' else
                   [engine, '--headless', '--path', str(work), '--script',
                    str(work / 'godot_import.gd'), '--', str(local)])
        try:
            process = subprocess.run(command, env=env, text=True, stdout=subprocess.PIPE,
                                     stderr=subprocess.STDOUT, timeout=120)
            output = process.stdout
            marker = next((line.split('AETHERION_PROBE_JSON ', 1)[1] for line in output.splitlines()
                           if 'AETHERION_PROBE_JSON ' in line), None)
            # Importers can report invalid source data while returning success.
            defects = [line for line in output.splitlines()
                       if re.search(r'\b(?:ERROR|FATAL|Traceback|File is invalid)\b', line)]
            item.update(exit_code=process.returncode, console=output, diagnostics=defects)
            if marker is not None:
                item['counts'] = json.loads(marker)
            item['status'] = ('FAIL' if process.returncode or marker is None else
                              'WITH_DEFECT' if defects else 'PASS')
        except subprocess.TimeoutExpired as exc:
            item.update(status='FAIL', error='120-second timeout',
                        console=str(exc.stdout or ''))
        item['source_unchanged'] = all(hashlib.sha256(p.read_bytes()).hexdigest() == digest for p in aliases)
        if not item['source_unchanged']:
            item['status'] = 'FAIL'
        results.append(item)
head = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip()
data = {'scope': 'Existing source GLB CPU import and scene instantiation only; no rendering, playback or parity certification',
        'timestamp_utc': datetime.now(timezone.utc).isoformat(), 'source_commit': head,
        'runtime_paths': len(paths), 'unique_payloads': len(unique), 'scratch': str(work),
        'results': results, 'summary': {status: sum(r['status'] == status for r in results)
                                    for status in ['PASS', 'WITH_DEFECT', 'FAIL', 'UNAVAILABLE']}}
report.parent.mkdir(parents=True, exist_ok=True)
report.write_text(json.dumps(data, indent=2) + '\n')
print(json.dumps(data['summary']))
print(str(report))
raise SystemExit(2 if missing else 1 if any(r['status'] != 'PASS' for r in results) else 0)
