# Validation and consistency report

Snapshot: 2026-10-13 UTC. Scope: final local foundation integration. **Remote publication remains incomplete.** The final local tree is not yet verified on the remote branch; the original model transfers are verified on the feature branch, while publication of the final authored tree and intended draft PR is still pending. No final draft PR URL, remote-completion claim, merge or deployment is asserted.

## Result and evidence boundary

The local package contains all 28 requested artifact families, fifteen dossiers and the complete byte-preserved 100-castable source foundation. Authored proposals, recovered references, imported runtime behavior and production validation remain separate. The independent content review resolved its twelve material findings; founder approval and the production gates below remain open.

| Executed check | Result | What it establishes |
|---|---|---|
| Aggregate canon validator | 197 PASS; 0 FAIL; 1 SKIPPED; 2 HUMAN_REVIEW | Strict schemas, identity, references, topology, source evidence, hashes, dependency DAGs, deliverable paths and local link targets |
| Systems data validator | 31 PASS; 0 FAIL | 120 pairs, 225 directed predicates, 100 source/world/asset links, contract DAG, 15 recipes and valid trade detours |
| World/narrative validator | 49 PASS; 0 FAIL; 5 SKIPPED | Connected conceptual continent and 135 empty-state ending traversals, plus 48 rejected negative route cases; 93 alliance/no-alliance traversals and six missing-offer/warning negatives;90 additional supporting-arc traversals |
| Strict world schema suite | 13 valid registries; 65 malformed-record fixtures rejected | Field types, IDs, required keys and closed object shapes; no narrative/gameplay approval |
| Canon negative fixtures | 7 PASS; 0 FAIL | Rejects concept/reference implementation promotion, source screenshot promotion, private provenance leakage, unknown evidence, duplicate pairs and one-way borders |
| Destination engineering suite | 215 PASS; 0 FAIL | Imported UID/data/dispatch, migration and repair/wrapper assertions |
| Inherited source suite | 51 PASS | Original source tests; reported separately from destination suite |
| Wrapper/App-seam regression | 5 PASS | Source-loading seam and destination-only Meteor repair; overlaps destination coverage, not an additive total |
| Combined scoped CPU lifecycle | 100 distinct UIDs | 96 unchanged raw-source passes + 1 destination Meteor repair + 3 exact-source-image loader-boundary fixtures |
| Complete GPU / authored-rig gameplay validation | 0 established | WebGL2 unavailable in the tested browser; CPU fixtures do not establish rendering, authored target hits, character clips or full summon/buff interaction |
| Coverage dashboard | 390 cells, 0 missing documentation-evidence cells | Fifteen Oaths × 26 criteria; authored evidence is not semantic completeness or production approval |

The aggregate validator ran against the integrated local tree. The engineering counts above are backed by retained engineering reports and independent reruns; they are not claimed to be fresh GPU tests. Clean registry-backed dependency installation remains environment-limited; exact-lock local dependencies were reused for engineering execution.

## Structural inventory

- Exactly 15 Oaths/realms, one connected conceptual mainland, 30 reciprocal land edges, 63 POIs and four directed watershed networks.
- 15 dossiers × 40 requested topics = 600 authored topic sections. Human review evaluated substance and required corrections despite initial structural passes.
- 34 characters, 15 factions, 43 relationship records, 83 quests and three working ending directions. Independent civic-review routes produce all fifteen service attestations without requiring every regional climax or Oath binding.
- 120 unordered interaction pairs (15 self + 105 cross), 225 direction-specific material/phenomenon/state predicates, neutral defaults and bounded authority/cascade rules.
- 15 Oath system profiles, 15 world events, 15 economy profiles, 15 typed production recipes, 15 housing profiles and three PvP modes. The 60 directed resource routes distinguish 30 actual recipe-input demands from 30 optional transshipment capacities.
- 20 proposed implementation contracts with typed input/output descriptions, explicit states/transitions/authority/dependencies/risks/recovery and acceptance tests marked SPECIFIED_NOT_EXECUTED.
- 748 master asset records: 510 proposed production families, 114 original references, 100 source castables and 24 primary-sandbox binary assets. These are distinct evidence classes.
- Full source asset index: 197 paths / 112 byte identities; 73 screenshot/reference identities remain Referenced and 39 runtime/UI/support identities retain source-prototype scope with static use evidence. The 24 primary-sandbox assets are a subset, not the exhaustive asset total.
- Source snapshot: 1,896 original files / 331,989,108 bytes. Original reference artwork: 114 distinct PNGs / 284,796,896 bytes. Source/reference bytes remain preserved; no replacement images are substituted.
- Production backlog: 17 work items, with resolvable dependency targets and an acyclic prerequisite graph.

## Integrity checks and corrections

The strict source-asset schema prohibits screenshot identities from claiming implementation and requires real static use evidence for source-prototype Implemented records. The screenshot negative fixture proves that guard rejects a promoted screenshot. It does not turn a matching code literal into a GPU or production-quality pass.

Thirteen strict world schemas cover entity mapping, chronology, realms, world graph, POIs, trade routes, factions, characters, relationships, quests, endings, explicit role coverage and character services. Cross-registry checks also compare capitals/borders, civic actors, settlement outcomes, encounter concepts, event locations and actual ending-flag producers. World traversal tests start from declared initial state rather than pre-seeding required evidence.

Asset and production-backlog dependency targets/DAGs are tested separately. Every required manifest path exists. Local Markdown link integrity: 251 local Markdown link targets exist; remote URLs and anchor spelling are outside this file-integrity gate

The [independent review](INDEPENDENT_REVIEW.md) records substantive corrections including creature/boss differentiation, individualized character outcomes, typed recipe demand, alternate civic attestations, source screenshot status and the runnable Meteor-repaired wrapper. Its frozen content review reserves final package acceptance for this integration report.

## Public-safe evidence projection

Private-source locators and retrieval identifiers are withheld from the public package. Complete owner-side originals remain private; local SRC/REF identifiers, titles/dates, repository-relative paths, hashes and scoped approval facts preserve public traceability. A dedicated negative fixture rejects reintroduced private ChatGPT/Library locator data. See [public provenance policy](../00_GOVERNANCE/PUBLIC_PROVENANCE_POLICY.md).

## Reproduce the local checks

From the full repository checkout, install the Python validator dependency from [requirements-validation.txt](requirements-validation.txt), then run:

    python3 AETHERION_CANON/19_VALIDATION/validate_canon.py --repo .
    python3 -m unittest discover -s AETHERION_CANON/19_VALIDATION -p test_validator.py -v
    python3 AETHERION_CANON/18_IMPLEMENTATION_CONTRACTS/validate_systems.py --repo-root .
    python3 AETHERION_CANON/06_NARRATIVE/validate_world_narrative.py AETHERION_CANON
    python3 AETHERION_CANON/19_VALIDATION/build_coverage.py --repo .

For source/runtime checks follow the root [README](../../README.md), [migration validation](../../CASTABLE_VALIDATION_REPORT.md) and [runtime audit](../../validation/RUNTIME_AUDIT.md). The docs-only ZIP lacks runtime binaries and originals, so full file-hash/runtime checks require the complete local checkout or a subsequently completed remote import.

## Reports

- [Aggregate static checks](CANON_VALIDATION_REPORT.json)
- [Negative fixture evidence](NEGATIVE_FIXTURE_VALIDATION.json) and [execution log](NEGATIVE_FIXTURE_EXECUTION.txt)
- [Systems static checks](../18_IMPLEMENTATION_CONTRACTS/SYSTEMS_STATIC_VALIDATION.json)
- [World/narrative checks](../06_NARRATIVE/WORLD_NARRATIVE_VALIDATION.json)
- [World schema fixtures](../06_NARRATIVE/WORLD_SCHEMA_VALIDATION.json)
- [390-cell evidence dashboard](CANON_COVERAGE_DASHBOARD.json)
- [Source/runtime scoped results](../../validation/runtime-validation-results.json)

## Open gates and delivery limitations

1. New lore, history, geography, characters, endings, mechanics, numeric budgets and production scope remain PROPOSED until approved.
2. Reference sharing permission is not individual final-concept approval; missing views, rigs, meshes, clips, audio and production variants remain real work.
3. Full per-UID GPU/source-equivalent visuals, authored FBX/target behavior, shader logs, input-driven summons and performance remain unverified. All 100 overall source migration records remain IMPORTED.
4. Target engine/devices, network authority, persistence/recovery implementation, streaming, accessible/localized playtests, economic balance and real large-battle capacity remain proposed or unmeasured.
5. Commercial provenance/licensing clearance remains open. Byte preservation does not grant missing rights.
6. All requested character-role categories have authored records and explicit service/quest connections; portrayal, art and playable implementation still require approval and production.
7. Remote publication and the intended draft PR remain pending. The local foundation and documentation archive are useful review deliverables, not evidence the final remote tree is complete.

No heading count, schema pass, illustration, file presence or local source lifecycle result overrides these gates.
