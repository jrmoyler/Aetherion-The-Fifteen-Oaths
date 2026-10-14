# Reproduce checkpoint verification

`verify_checkpoint.py` checks an explicitly supplied **separate disposable checkout**. It never clones, fetches, switches branches, commits, pushes, merges or deploys. Invoke it from the working repository and supply a checkout prepared independently at the intended commit:

```sh
python3 tools/production/verify_checkpoint.py \
  --checkout /tmp/aetherion-clean-checkpoint \
  --expected-head FULL_40_CHARACTER_COMMIT \
  --report-dir /tmp/aetherion-checkpoint-evidence
```

The checkout must start clean, including non-ignored untracked files. The report directory must be new or empty, outside both the checkout and this tool's working repository. Resolving symlinks cannot bypass these boundaries. A local HEAD match does not prove a remote branch points to that SHA; capture `fetch`/`ls-remote` evidence separately if remote publication is part of the claim.

Python 3.10+, the repository's pinned `jsonschema`, Git, Node 22.12+ and npm are prerequisites. `npm ci` installs all four locked package sets (runtime, sandbox, production tools and preview) into the disposable checkout. Network/package-registry access may therefore be required. Package locations are fixed repository-relative paths; caches and evidence derive from the supplied external report directory. `--jobs` controls independent checks (default 4, maximum 16); `--timeout-seconds` applies per command (default 600). Timed-out command process groups are stopped and recorded as failures.

## What runs

- Exact source snapshot hashes: all 1,896 original files, plus the exact Phase II ZIP checksum/size and byte equality of its 115 unpacked payloads, before and after checks.
- The committed preview evidence's input hashes against the actual checkout; every tracked file and lockfile is also hashed for end-of-run preservation.
- Inventory checks before and after all report-producing validators.
- Fresh locked installs, root/source tests, production Node/Python tests, importer tests, canon/schema checks and negative fixtures, systems/narrative checks, Phase II static checks and 40 negative-fixture tests.
- Ability build/artifact/local HTTP checks, production GLB/manifest validation, and the preview's unit tests, actual Three.js CPU GLTF loading/disposal/animation checks, production build and development/built HTTP checks.

Counts come from the reports at the tested revision; the runner does not assume that an old test count proves current coverage. It does not execute Blender, Godot or Unreal. Run their independent validators against the same SHA, keep the reports external, and add their checksums to the handoff when required.

## Report isolation and failure behavior

Output-capable validators write directly outside the checkout. Phase II static validation uses `write=False`; its negative fixtures run in an external package copy. The few existing tools with fixed report paths run with narrowly scoped capture/restore guards: narrative, preview snapshot, candidate GLB audit, and ability artifact/HTTP reports. Their fresh output is copied under `artifacts/`, then the exact original bytes and modes are restored in the disposable checkout, even if the command fails. The guard does not restore source/assets or arbitrary changed files.

This ordering prevents the narrative report's generated timestamp from making the inventory's recorded document hash stale. Inventory is evaluated before any writer and again after restoration; an initial failure is never silently relabeled as success or automatically retried. Unexpected tracked changes or untracked output, archive/source mismatches, stale committed preview evidence, dependency failures, timeouts and nonzero commands remain failures. If installs fail, Python checks continue and dependent Node work is explicitly blocked. Ignored build/dependency caches can remain in the disposable checkout.

`summary.json` records the exact revision, runner hash, commands, exit codes, timestamps, blocked work and preservation outcomes. `logs/` retains command output, `artifacts/` retains captured fixed-path validator output, and `artifacts/report-captures.jsonl` identifies original and captured hashes. An unchanged report after a failed command is not new passing evidence. `SHA256SUMS` covers evidence outside `scratch/`. Scratch contains npm caches and the copied Phase II negative-fixture package; it is not curated deliverable evidence. The report directory is never reused automatically. Exit 0 means the scoped checkpoint checks passed; exit 1 means checks failed or were blocked; invalid arguments/unsafe locations exit 2 before installs or report creation.

A PASS does not certify GPU rendering, browser image decoding, visual quality, gameplay completeness, engine parity, target-device performance or founder approval. Source CPU tests, static specifications, Three.js CPU/HTTP checks and format validation retain their individual limits.

Guard tests can run without asset builds or dependency installation:

```sh
python3 -m unittest discover -s tools/production -p test_verify_checkpoint.py
```
