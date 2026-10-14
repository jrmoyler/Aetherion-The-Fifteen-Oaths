#!/usr/bin/env python3
"""Run the production Godot checks with writable temporary data directories."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
from types import SimpleNamespace
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[3])
parser.add_argument('--report', type=Path, required=True)
args = parser.parse_args()
repo = args.repo.resolve()
report = args.report.resolve()
if report.exists():
    parser.error('Choose a new report path; previous evidence must be preserved')
project = repo / 'engines/godot/production-preview'
with tempfile.TemporaryDirectory(prefix='aetherion-godot-production-') as directory:
    scratch = Path(directory)
    env = dict(os.environ)
    for key in ['XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME']:
        location = scratch / key.lower()
        location.mkdir()
        env[key] = str(location)
    raw = scratch / 'report.json'
    command = ['godot', '--headless', '--path', str(project), '--', '--repo', str(repo),
               '--validate', '--report', str(raw)]
    try:
        process = subprocess.run(command, env=env, text=True, stdout=subprocess.PIPE,
                                 stderr=subprocess.STDOUT, timeout=180)
    except subprocess.TimeoutExpired as error:
        console = error.stdout or ""
        if isinstance(console, bytes):
            console = console.decode("utf-8", errors="replace")
        process = SimpleNamespace(returncode=124, stdout=console + "\nERROR: validation timed out after 180 seconds\n")
    result = json.loads(raw.read_text()) if raw.exists() else {'failed': 1, 'error': 'Godot did not write its report'}
    diagnostics = [line for line in process.stdout.splitlines()
                   if re.search(r'\b(?:ERROR|FATAL|SCRIPT ERROR)\b', line)]
    result.update(source_commit=subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip(),
                  captured_at_utc=datetime.now(timezone.utc).isoformat(), console=process.stdout,
                  process_exit_code=process.returncode, engine_error_diagnostics=diagnostics,
                  probe_sha256={p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                                for p in sorted(project.iterdir()) if p.is_file()})
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(result, indent=2) + '\n')
    print(process.stdout, end='')
    print(report)
    raise SystemExit(1 if process.returncode or diagnostics or result.get('failed') or result.get('manifest_errors') else 0)
