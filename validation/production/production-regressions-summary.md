# Production working-tree regressions

Isolated working-tree copy based on `ef349c3804b2e29aca96a396eaa2fd6aefb40229` plus uncommitted production changes. This is **not final remote-head certification**. Candidate assets were copied before two later authoring corrections; their final acceptance belongs to the separate deliverable validation.

Fresh locked runtime and sandbox npm installs passed. Node 24.19.0, npm 11.9.0, Python 3.12.14, jsonschema 4.26.0.

| Check | Result |
|---|---|
| Immutable source snapshot | 1,896 files / 331,989,108 bytes; no mismatches |
| Root tests including equipment attachment tests | 223 pass, zero fail |
| Inherited source tests | 51 pass, zero fail |
| Canon checks | 197 PASS, one SKIPPED, two HUMAN_REVIEW |
| Canon fixture tests | Seven pass |
| Static system checks | 31 pass |
| Static narrative checks | 49 pass, five skipped |
| Ability build | Pass; bundle warning retained |
| Build artifacts | 24 source public files byte-identical; 100 castable IDs present |

[Structured results and code/lockfile hashes](production-regressions-summary.json) identify the working inputs. Detailed logs and reports use the `production-regressions-` prefix. Existing source and historical canon reports were not overwritten in the shared checkout.

Equipment tests parse actual FBX bone transforms and candidate GLB geometry/animation, with explicit test-only texture placeholders. They do not establish image decoding, GPU rendering, visual fit, art approval or complete gameplay. No browser security settings changed.
