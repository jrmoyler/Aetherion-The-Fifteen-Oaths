# Fresh Phase II import evidence

The exact public Phase II ZIP is preserved in `docs/archives/`; its 115 payload files are imported byte-for-byte under `AETHERION_CANON/21_WORLD_CONSTRUCTION_PHASE_II/`. The two archive-level administrative files remain inside the unchanged ZIP. `IMPORT_RECEIPT.json` records the complete verified mapping, sizes and hashes. No private provenance archive is included.

All imported files, including historical validation reports, remain byte-identical after these fresh tests. Validators ran in an isolated disposable copy using a fresh Python venv and the archive-pinned `jsonschema==4.26.0`; baseline checks used separate clean clones at the exact historical comparison commits. The source checkout was not modified.

- Standalone static validation: 445 PASS, 0 FAIL, 5 external checks SKIPPED, 5 HUMAN_REVIEW gates.
- Pinned-baseline static validation: 450 PASS, 0 FAIL, 0 SKIPPED, 5 HUMAN_REVIEW gates.
- Negative fixtures: 40 PASS, 0 FAIL.
- Importer safety tests: 22 PASS, including the actual pinned public archive.

The 20-family deliverable manifest is a navigation index; the complete 115-file hash allowlist is the archive's `SHA256SUMS.txt`. Package design remains PROPOSED. Static checks do not certify production assets, terrain, performance, implemented world systems or rendered gameplay.

The foundation validator now resolves `P2-SRC-*` provenance only within the exact Phase II subtree using its declared local inventory. Fresh combined canon validation passed 236 checks (one skipped and two human-review gates); all 12 fixtures passed, including unknown/out-of-scope provenance negatives. See `COMBINED_CANON_VALIDATION.json` and `COMBINED_CANON_FIXTURES.txt`.
