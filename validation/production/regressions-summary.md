# Foundation regression evidence

Tested revision: `8c4b5d0bfc75a98388ea29231b9cf1d304dff550` (merged foundation base). This report does not certify subsequent production changes or a final remote head.

An isolated `git archive` checkout used fresh locked `npm ci` installs for runtime and sandbox. Node 24.19.0, npm 11.9.0, Python 3.12.14 and jsonschema 4.26.0. Commands, lock hashes and structured outcomes are in [regressions-summary.json](regressions-summary.json).

| Check | Outcome |
|---|---|
| Immutable source snapshot | 1,896 files / 331,989,108 bytes; zero hash mismatches after checks |
| Root regression tests | 215 pass, zero fail |
| Inherited source tests | 51 pass, zero fail |
| Canon checks | 197 pass, one skipped, two human review |
| Canon negative fixtures | Seven tests pass |
| System static checks | 31 pass |
| Narrative static checks | 49 pass, five skipped |
| Coverage reproduction | 390 cells, no production certification inferred |
| Ability build | Pass; largest minified chunk 3.427 MB / 973 KB gzip warning |
| Build artifact checks | 24 source public files byte-identical; all 100 castable IDs present |
| Local HTTP smoke | Entry, module and source texture HTTP 200; texture byte-identical |
| Raw source CPU lifecycle | 100 imports; 96 CPU passes; known original Meteor omission; three browser API blocks |
| Supplementary texture fixture | Three browser API blocks with fresh separate dependency installs |

The known Meteor source omission remains preserved. Destination-only repair tests pass. The supplementary texture hook patches the root Three module while sandbox code resolves its separately installed Three module (both version 0.185.1), leaving the browser `document` requirement unsatisfied. This is a harness boundary issue, not a hidden pass. The report records the real fresh-install result.

No GPU rendering, shader compilation, browser boot, visual approval, populated-target gameplay, authored-rig interaction, multiplayer, world streaming or target-device performance is certified. Source CPU and static planning checks retain their limited scopes. Existing canon/source reports were not overwritten in the shared checkout.
