# Candidate production deliverable audit

Generated 2026-10-13T20:08:58.849Z; source revision 4794c8ed0292878cd8d5cefe199824bb6e4db56a.

46 candidate assets across 16 manifests: 46 pass these structural checks; 0 have hard errors. Production approvals: 0. Khronos reports 0 errors and 9516 warnings; warnings remain recorded and are not engine-parity approval.

| Asset | Structural result | Errors | Open gates |
| --- | --- | ---: | ---: |
| kiln-ninja-ensemble-candidate | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 16 |
| kiln-sword-ready | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 14 |
| kiln-sword-stowed | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 14 |
| kiln-sword-damaged | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 14 |
| kiln-focus-ready | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 17 |
| kiln-focus-stowed | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 17 |
| kiln-focus-damaged | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 17 |
| rime-sword-ready | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 12 |
| rime-sword-stowed | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 12 |
| rime-sword-damaged | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 12 |
| rime-focus-ready | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 12 |
| rime-focus-stowed | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 12 |
| rime-focus-damaged | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 12 |
| storm-relay-whip-ready | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 15 |
| storm-relay-whip-stowed | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 15 |
| storm-conductor-staff-ready | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 15 |
| storm-conductor-staff-stowed | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 15 |
| tidal-crescent-blade | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 16 |
| tidal-tide-orb-staff | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 16 |
| prod-o05-amethyst-short-blade | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 13 |
| prod-o05-amethyst-seer-mace | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 13 |
| oath-06-folding-battle-fan | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 15 |
| oath-06-reed-tuning-fork | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 15 |
| oath-07-living-twig-bow | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 16 |
| oath-07-sapseed-staff | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 16 |
| prod-o08-poison-saber | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 14 |
| prod-o08-alchemical-crossbow | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 17 |
| oath-09-lotus-short-sword | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 15 |
| oath-09-radiant-lotus-staff | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 15 |
| oath-10-paired-gravity-flail | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 16 |
| oath-10-orbital-astrolabe-staff | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 15 |
| prod-o11-void-cleaver | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 13 |
| prod-o11-missing-court-lotus-focus | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 13 |
| prod-o12-blood-lash | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 14 |
| prod-o12-blood-gauntlet | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 14 |
| prod-o13-ceremonial-rapier | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 14 |
| prod-o13-mirrored-baton | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 14 |
| prod-o13-mirror-codex | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 14 |
| chronal-scythe-ready | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 13 |
| chronal-ring-ready | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 12 |
| chronal-wrist-tool-ready | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 13 |
| chronal-compact-dart-ready | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 12 |
| impulse-hammer-long-grip | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 13 |
| impulse-hammer-short-grip | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 13 |
| impulse-folding-shield-unfolded | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 15 |
| impulse-belt-module-ready | STRUCTURAL_CHECKS_PASSED_ACCEPTANCE_OPEN | 0 | 12 |

- Input file hashes identify this working-tree snapshot; sourceRevision records HEAD without asserting a clean checkout
- Static structure and manifest integrity only; no visual approval or engine parity
- Open gates are unevaluated by this audit; independent engine evidence must be reviewed separately
- Dimensions compared with axis permutation and 0.5%/2mm tolerance; no unit metadata claim substitutes for vertices
- Blend signature and image headers checked; actual Blender opening and texture decoding require separate engine evidence
- Collision geometry existence/complexity checked, not hull convexity or gameplay fitness

Geometry summaries, file hashes, Khronos counts and example issues: [DELIVERABLE_AUDIT.json](DELIVERABLE_AUDIT.json).

Run `npm --prefix tools/production run validate:deliverables`. All primitive inventories, UV ranges, animation sampler details and unsuppressed Khronos issues are stored losslessly in DELIVERABLE_AUDIT_DETAILS.json.gz with checksum in the JSON report. Hard errors produce exit 1. An empty production inventory produces exit 2; zero files never counts as passing.
