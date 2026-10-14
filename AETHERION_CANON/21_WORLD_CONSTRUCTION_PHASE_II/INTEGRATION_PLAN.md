# Proposed Phase II repository integration plan

Status: **PROPOSED; NO REPOSITORY MUTATION AUTHORIZED OR PERFORMED BY THIS PLAN.** Sources: P2-SRC-FOUNDATION, P2-SRC-DIRECTIVE, P2-SRC-PROPOSAL. Official destination: [jrmoyler/Aetherion-The-Fifteen-Oaths](https://github.com/jrmoyler/Aetherion-The-Fifteen-Oaths). Comparison base: [reviewed foundation PR #1, now merged](https://github.com/jrmoyler/Aetherion-The-Fifteen-Oaths/pull/1), commit `5dce9edae0bb3587eb7c72433395e7d5a19857ea`.

Read-only GitHub status observed during Phase II reports PR #1 merged on 2026-10-13 at 18:54:56 UTC, merge commit `8c4b5d0bfc75a98388ea29231b9cf1d304dff550`. The reviewed head `5dce9edae0bb3587eb7c72433395e7d5a19857ea` remains the planning comparison pin. The observation does not identify who merged it and does not authorize any Phase II repository change.

This package stands alone for review. The mapping below describes a future additive integration, not instructions to run now. Neither the official repository, original Ability-Matrix source nor Phase I canon staging is to be edited by Phase II preparation. Branch creation, commits, PR creation/publication, pushes, merges and deployment are separate authorized actions. A plan or approval to review documents is not approval to publish them. No funds, company resources or legal agreements are committed here.

## 1. Non-destructive destination mapping

Proposed destination prefix **P = `AETHERION_CANON/21_WORLD_CONSTRUCTION_PHASE_II/`**. For every package artifact `r` in the verified deliverable manifest, destination is exactly `P + r`, preserving case, filename and subdirectory. Reject absolute paths, `..`, symlinks escaping the package, control characters and paths colliding after case-fold/Unicode normalization. This rule is a precise mapping, not a license to copy unlisted temporary files.

| Package artifact | Proposed destination | Relationship to baseline |
|---|---|---|
| README.md | P/README.md | New entry to planning package; baseline root README unchanged initially. |
| CONTINENT_MASTER_PLAN.md | P/CONTINENT_MASTER_PLAN.md | Refines `03_GEOGRAPHY/WORLD_GEOGRAPHY.md`; does not replace continent canon. |
| CONTINENT_GEOGRAPHY.md | P/CONTINENT_GEOGRAPHY.md | Detailed proposed physical-geography delta. |
| CONTINENT_MAP_SPECIFICATION.md | P/CONTINENT_MAP_SPECIFICATION.md | Conceptual map legend/projection limits; no approved world coordinates. |
| WORLD_REGION_GRAPH.json | P/WORLD_REGION_GRAPH.json | Sidecar refinement of `03_GEOGRAPHY/WORLD_GRAPH.json`; preserve 15 region IDs / 30 land edges. |
| FIFTEEN_REGION_BLUEPRINTS/* | P/FIFTEEN_REGION_BLUEPRINTS/* | Preserve relative filenames; refinements linked to existing region/Oath dossiers, not new regions. |
| CAPITAL_CITY_BLUEPRINTS/* | P/CAPITAL_CITY_BLUEPRINTS/* | Preserve relative filenames; existing named capitals retained. |
| SETTLEMENT_REGISTRY.json | P/SETTLEMENT_REGISTRY.json | New proposed detail with explicit source/baseline links; no second canonical owner of existing settlements. |
| WORLD_POI_REGISTRY.json | P/WORLD_POI_REGISTRY.json | Existing 63 POI identities retained; same filename separated by directory. |
| TRANSPORTATION_NETWORK.md | P/TRANSPORTATION_NETWORK.md | Refines ordinary and special traversal; does not overwrite baseline TRADE_ROUTES. |
| TRANSPORT_ROUTE_REGISTRY.json | P/TRANSPORT_ROUTE_REGISTRY.json | New route-detail sidecar referencing existing geographic edges. |
| REGIONAL_BIOME_SPECIFICATIONS.md | P/REGIONAL_BIOME_SPECIFICATIONS.md | Detailed biome proposal tied to physical geography. |
| WORLD_ECOLOGY_SYSTEM.md | P/WORLD_ECOLOGY_SYSTEM.md | Refinement of baseline `13_WORLD_EVENTS/LIVING_WORLD.md`. |
| REGIONAL_ECOLOGY_PROFILES.json | P/REGIONAL_ECOLOGY_PROFILES.json | Proposed ecological profile sidecar. |
| DYNAMIC_WEATHER_SYSTEM.md | P/DYNAMIC_WEATHER_SYSTEM.md | Refines bounded weather/season responsibilities. |
| NPC_CIVILIZATION_SYSTEM.md | P/NPC_CIVILIZATION_SYSTEM.md | Refines schedules, services, markets, maintenance and aggregation. |
| WORLD_EVENT_REGISTRY.json | P/WORLD_EVENT_REGISTRY.json | Proposed event detail; baseline `13_WORLD_EVENTS/WORLD_EVENT_REGISTRY.json` remains separate and authoritative within its status. |
| DUNGEON_AND_EXPLORATION_PLAN.md | P/DUNGEON_AND_EXPLORATION_PLAN.md | Proposed exploration/access construction detail. |
| ARCHITECTURAL_KIT_REGISTRY.json | P/ARCHITECTURAL_KIT_REGISTRY.json | New kit-detail records cross-linked to existing assets. |
| ENVIRONMENT_ASSET_REGISTRY.json | P/ENVIRONMENT_ASSET_REGISTRY.json | Refines baseline MASTER_ASSET_REGISTRY with explicit baseline_asset_id; does not promote references to production. |
| ENVIRONMENT_REFERENCE_EVIDENCE.json | P/ENVIRONMENT_REFERENCE_EVIDENCE.json | Source/reference verification evidence, not new images or asset rights. |
| ASSET_CONSTRUCTION_HANDBOOK.md | P/ASSET_CONSTRUCTION_HANDBOOK.md | Proposed export/bundle/construction workflow. |
| WORLD_STREAMING_ARCHITECTURE.md | P/WORLD_STREAMING_ARCHITECTURE.md | Refines baseline technical-art and streaming contracts; engine stays undecided. |
| STREAMING_PROTOTYPE_CONTRACTS.json | P/STREAMING_PROTOTYPE_CONTRACTS.json | Proposed acceptance contracts linked to existing contract-* IDs. |
| WORLD_CONSTRUCTION_ROADMAP.md | P/WORLD_CONSTRUCTION_ROADMAP.md | Refinement of baseline production roadmap; no staffing/resource commitment. |
| CANON_ALIGNMENT_AND_GAP_REPORT.md | P/CANON_ALIGNMENT_AND_GAP_REPORT.md | Review delta/open issues, not approval to rewrite canon. |
| SOURCE_INVENTORY.json and SOURCE_INVENTORY.md | P/SOURCE_INVENTORY.json and P/SOURCE_INVENTORY.md | Source provenance retained without private locators. |
| DELIVERABLE_MANIFEST.json | P/DELIVERABLE_MANIFEST.json | Package inventory; hash coverage rules explicit, avoid self-hash recursion. |
| INTEGRATION_PLAN.md | P/INTEGRATION_PLAN.md | This proposed plan. |
| maps/* | P/maps/* | Conceptual artifacts copied with their legends and relative links. |
| schemas/* | P/schemas/* | Strict schemas retain exact names and relative references. |
| validation/* | P/validation/* | Static validation and review evidence; never relabeled runtime evidence. |
| ARCHIVE_SCOPE.md or final administrative integrity files, if present in manifest | P/<exact-relative-name> | Packaging scope/integrity evidence only; no generated archive embedded recursively. |

`P/` above is explanatory shorthand for the prefix, not a literal directory named P. The executable copy plan must expand it once and produce a dry-run source→destination list with bytes and SHA-256 for every actual manifest entry. Wildcard rows above mean all manifested files under that directory, not an uncontrolled filesystem glob. Exclude caches, scratch scripts, local paths, credentials, dependencies, generated app bundles and unlisted artifacts. No symlink targets or executable scripts run during copying.

## 2. Baseline identity and refinement semantics

Maintain an explicit review table per changed subject: baseline path + stable ID; existing value/status; Phase II path + record ID; added/refined field; reason/source; conflict flag; disposition and reviewer. The semantic key is subject identity, not filename. New `p2-*` IDs represent proposed refinements, assets or details; they never rename an existing region, Oath, capital, POI, source UID or reference. Where Phase II retains a baseline ID, record its baseline source rather than treating it as a newly invented entity.

Foundation proposals remain proposals. A hash or schema pass cannot turn them into LOCKED/APPROVED. Overlap must have one proposed owner: e.g., an event sidecar supplies detailed phases while baseline retains original event identity; the root lookup must not concatenate both as separate events. New reader logic, if later authorized, joins by explicit baseline ID and carries the overlay status. No implicit last-file-wins merge.

Before any future integration branch is created, fetch or read the current official main branch and reconcile the reviewed head, the observed merge commit, and all subsequent changes. PR #1 is already merged; do not attempt to reuse it as an open draft or assume main equals the comparison pin. Compare reviewed head→merge result→current main against reviewed head→package intent, including merge-resolution differences; pause any overlapping semantic change for review. If the reported merge is not reachable from current main, report the divergence and require a target-base decision. Nonoverlapping additive files may be proposed anew, but never silently rebase an already-reviewed canon delta. Record all actual base SHAs in future evidence. Phase II preparation itself remains read-only with respect to both repositories.

## 3. Idempotent staging algorithm (specification only)

1. Read the finalized manifest and validate all package files/schemas/references. Compute a stable sorted payload digest over path + byte hash + size, explicitly excluding a self-referential digest field or self-file according to the manifest's stated rule. Verify archive contents match that list if integrating from an archive.
2. Check the destination base equals the approved commit; detect whether the payload digest already exists in a verified prior integration receipt. A matching committed payload is a no-op, not another copied directory.
3. Construct the exact allowlisted mapping above. For each destination: absent = proposed ADD; present with identical bytes = NO_OP; present with different bytes = CONFLICT. Also detect case/Unicode and file-vs-directory collisions. Never auto-overwrite a conflict or suffix filenames to make it disappear.
4. Prepare a proposed branch from the approved current base, for example `phase-ii/world-construction-review-<payload-digest-prefix>`. The exact branch name is checked for collision; an existing branch with the same digest/base is reusable only after contents verify. A different digest or base requires a distinct reviewed branch or explicit update decision. This planning step creates no branch.
5. Copy only ADD entries, preserve source bytes and relative names, then recompute all hashes. Treat every original source file and every baseline file as protected. A retry repeats the same comparison; already matching outputs remain no-ops. Interrupted stages are not success until the entire allowlist verifies.
6. Review staged diff: only the approved prefix may be added for initial integration; no deletion, mode change, dependency update, script execution, binary rewriting, source uid change or incidental formatter output. Future index links are a separate tiny diff after the payload passes.
7. Run static validation and available baseline tests in an authorized environment without rewriting baseline evidence files. Record fresh results separately; preserve historical evidence. A test requiring unavailable GPU/network/tooling is BLOCKED, not PASS.
8. Human review the baseline delta, new proposal scope, gaps and licenses. Seek specific authorization before publication actions. If explicitly authorized later, create/update a review PR with exact base/head/payload hash and no implementation or approval claims.
9. After authorized commit/PR creation, read back the remote tree and every manifested content hash, confirm source tree unchanged and links resolve. Record verification result; uncertain upload is resolved by read-only comparison before retry. A repeated operation must converge on the same tree, not duplicate canon records or PRs.

This is an idempotence contract for future integration, not a claim that these steps were run. User instructions permitting retries in a previously approved migration do not broaden Phase II planning into permission to publish this new package.

## 4. Schema migration and collision handling

Phase II `schema_version: 1.0.0` describes its sidecars; it is not a declaration that baseline JSON schemas are compatible. Validate each file against its own explicit schema mapping. Reject unknown required fields/states and dangling references. Validate ID uniqueness in namespace, baseline references, region coverage, 30-edge preservation, 63-POI preservation, drainage ordering and dependency cycles with semantic checks beyond JSON Schema.

Initial additive integration requires **no mutation of existing save data or runtime schemas**. If future promotion folds sidecar fields into baseline registries, propose a versioned migration separately with sample old/new records, explicit alias map, conflict resolutions, consumer inventory, compatibility tests and reverse/recovery strategy. Changed required fields/meaning or removed states require a major version; optional additive fields require verified tolerant readers before being called compatible. Do not change baseline validation rules merely to make new records pass.

Collision outcomes:
- Same ID / same bytes / same provenance: reference existing subject, no duplicate.
- Same ID / additive nonconflicting detail: retain sidecar and explicit delta pending review.
- Same ID / changed identity, capital, region/Oath association, event ownership, route or basin: block promotion; obtain subject-specific canon decision.
- New ID duplicates an existing subject under a new name: merge/reference proposal, retain both source records until reviewed; do not invent a replacement identity.
- Destination file differs: produce semantic/text diff and stop that file. Never delete/rewrite to resolve automatically.
- Source reference missing/private/unverifiable: label gap and exclude unsupported factual claim; do not synthesize evidence.

A reviewed rollback of a future integration must preserve source and user data. Since deletion of repositories/files/records is user-handled under current instructions, do not autonomously delete a failed branch, copied artifact or record. Prefer halt and report; the user chooses any cleanup/revert. Save migration rollback likewise preserves original snapshots and receipts.

## 5. Required verification and approvals

Static package acceptance: valid strict schemas; required files and navigation; no unintended private locators; baseline and Phase II ID/reference closure; preserved foundational counts/identities; conceptual map labels; no runtime/asset-completion claims; complete manifest hash verification. Check all path links after relocation; baseline references in prose are explicitly repository-relative, while machine source references may need a repository-root resolver. Never blindly rewrite source evidence paths as though they were package-relative.

Read-only source protection: compare byte manifest and full diff for `runtime/ability-matrix/`, source manifests/catalog/presets, ability adapter/repair files and existing canon registries. Expected difference for initial integration is zero. Preserve existing licenses and source attribution. Imported runtime observations are historical audit results unless freshly rerun and labeled.

Future regression suite includes root `npm test`, inherited source suite and migration validator as authorized/available, plus canon/schema/reference validation; exact commands and dependencies must be checked against the future base. Avoid validators that overwrite historical reports: direct output to a new authorized evidence directory when supported, or inspect behavior first. A clean build does not certify GPU, world streaming, terrain, multiplayer or new gameplay.

Approval branches:
1. **Review package only:** user can review current standalone artifacts; no publication.
2. **Additive planning PR:** requires explicit authorization for repository branch/commit/push/PR as applicable; PR remains review-only, all new canon PROPOSED.
3. **Canonical promotion:** separate subject-specific design approval and reviewed schema/consumer migration; do not conflate this with PR publication.
4. **Engine/world implementation:** separate selection and scoped coding authorization following roadmap gates.
5. **Merge/deploy/release:** requires explicit instruction under current user rules; deployment, payments, legal/resource commitments are not implied by any planning approval.

Success for a later additive integration means exact intended files present, no protected source/baseline changes, no duplicates, current links and validation, and a readable review PR at verified revisions. It does not mean founder approval, a merged PR, implementation, asset production, gameplay acceptance or launch readiness.
