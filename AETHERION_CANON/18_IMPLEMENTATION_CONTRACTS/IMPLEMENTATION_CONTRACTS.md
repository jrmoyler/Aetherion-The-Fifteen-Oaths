# Implementation contracts and engineering handoff

Status: PROPOSED implementation design, except explicitly identified user-established foundations. Numerical values are bounded prototype hypotheses, unvalidated by playtests or profiling. These documents do not change imported Ability Matrix behavior.

Sources: SRC-USER-DIRECTIVE; SRC-RECOVERED-LORE; SRC-SYSTEMS-PROPOSAL. The first two establish the fifteen covenants and broad game pillars. SRC-SYSTEMS-PROPOSAL identifies design authorship, not user approval. Source runtime claims cite SRC-ABILITY-MATRIX-4c4a1eb at commit 4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451.

## Boundary and deployment
IMPLEMENTATION_CONTRACTS.json is the canonical machine-readable contract registry. Every interface is PROPOSED_NOT_EXISTING_API. Contract identifiers are responsibilities and message schemas; a first implementation may be a modular monolith. No implied function name, endpoint or service already exists in Ability Matrix. The imported runtime is governed by its source audit and preserved source schema.

Source-backed facts: the pinned README and config/elements.js identify uid-addressed castables and fifteen element ids. Source-native runtime entrypoints and dependencies must be taken from the repository audit; this document does not fabricate a production gameplay server around them. The source adapter accepts real uids and retains original settings separately from proposed extension descriptors.

## Contract summary
| Contract | Inputs → outputs | Authority | Dependencies |
|---|---|---|---|
| contract-content-registry | bundle_id, schema_version, records, expected_revision → accepted_bundle_revision, validation_issues, migration_required | Content release authority | None |
| contract-resource-ledger | owner_id, transaction_id, expected_revision, deltas, authorization → receipt, new_revision, balances | Inventory transaction authority | contract-content-registry |
| contract-source-adapter | source_uid, source_commit, source_preset, extension_descriptor → source_reference, extension_bindings, unsupported | Content integration authority | contract-content-registry |
| contract-targeting | actor_snapshot, aim_intent, technique_descriptor, collision_revision → eligible_targets, resolved_geometry, denial_reason | Encounter simulation authority | contract-content-registry |
| contract-control-ledger | target_id, control_request, window_state, boundary_profile → accepted_control, immunity_state, feedback_code | Encounter simulation authority | contract-content-registry |
| contract-consequence-journal | cause_event, scope, expected_revision, patch, confirmation → consequence_receipt, new_revision, recovery_action | Scope-owning persistence authority | contract-content-registry |
| contract-cast-intent | request_id, actor_id, source_uid, loadout_revision, aim, server_tick_hint → cast_receipt, effect_events, feedback | Encounter simulation authority | contract-source-adapter, contract-targeting, contract-resource-ledger, contract-control-ledger, contract-consequence-journal |
| contract-interaction-resolver | events, material_snapshot, rule_bundle, budgets → transition_receipts, child_events, neutral_reasons | Encounter simulation authority | contract-cast-intent, contract-consequence-journal |
| contract-pact-progression | character_id, pact_terms_version, requested_transition, consent_receipt, expected_revision → pact_snapshot, entitlements, consequence_preview | Character progression authority | contract-resource-ledger, contract-consequence-journal |
| contract-mount-morph | actor_id, form_descriptor, transition_intent, safe_pose → form_state, control_assignment, transition_feedback | Actor simulation authority | contract-cast-intent, contract-consequence-journal |
| contract-world-event | event_definition_id, region_revision, seed, contributions → phase_state, service_changes, reward_receipts | Regional event authority | contract-consequence-journal, contract-resource-ledger |
| contract-climate-ecology | climate_profile, world_time_bucket, seed, event_modifiers → weather_category, habitat_bands, migration_schedule | Regional environment authority | contract-world-event, contract-content-registry |
| contract-trade-crafting | owner_id, recipe_or_order_id, input_instances, destination, transaction_id → escrow_receipt, output_receipt, salvage_or_refund | Economy transaction authority | contract-resource-ledger, contract-consequence-journal |
| contract-housing | plot_id, actor_permission, edit_batch, expected_revision → layout_revision, inventory_receipts, safe_entry | Housing persistence authority | contract-resource-ledger, contract-consequence-journal, contract-content-registry |
| contract-pvp-territory | mode_id, roster, objective_snapshot, supply_receipts, season_id → score_receipts, settlement, reconstruction_plan | Match/territory authority | contract-world-event, contract-cast-intent, contract-consequence-journal |
| contract-streaming-assets | cell_id, bundle_manifest, quality_profile, entry_pose → ready_state, fallback, load_metrics | Client streaming manager for presentation; authority for entry eligibility | contract-content-registry |
| contract-accessibility-localization | semantic_event, locale, input_profile, accessibility_settings → feedback_channels, localized_message, missing_key_report | Client presentation authority only; cannot alter gameplay outcomes | contract-content-registry |
| contract-save-migration | snapshot, journal_tail, target_content_version, migration_plan → recovered_snapshot, reconciliation_report, blocked_dependencies | Persistence recovery authority | contract-content-registry, contract-consequence-journal |
| contract-quest-branch | character_id, quest_id, prerequisite_snapshot, choice_intent, party_context → quest_revision, branch_receipt, shared_event_contribution | Character narrative authority | contract-pact-progression, contract-consequence-journal, contract-world-event |
| contract-event-replication | accepted_events, interest_set, client_ack, priority_budget → snapshot_delta, resync_request, presentation_seed | Simulation/persistence publisher; clients acknowledge only | contract-content-registry, contract-consequence-journal |

## Implementation order
1. Content registry and immutable source adapter; establish per-castable audit status.
2. Resource ledger, consequence journal, targeting and control ledger with deterministic tests.
3. Cast intent, interaction resolver and event replication in one bounded encounter.
4. Pact progression, quest branches, mount/morph and safe streaming.
5. Regional events, climate/ecology, trade/crafting and housing with crash injection.
6. Territorial conflict only after consent, control, service-floor and reconstruction invariants pass.

Accessibility/localization is cross-cutting from step 1. Save migration is designed before durable state is released, not added after players acquire goods.

## Versioning and governance
Each contract change records version, author/source, approval status, affected data/consumers, migration path, test evidence and rollback plan. Patch: clarification without behavior/schema change. Minor: backward-compatible optional fields or new states with verified tolerant readers. Major: changed meaning, required fields, removed states or incompatible saves. A numerical balance change may still require gameplay approval and regression even if schema remains compatible.

Resolve identifiers against the canonical registries. Detect duplicate IDs, invalid oath/region/element references, missing source IDs, missing asset references and dependency cycles. Contract dependency edges describe build/validation prerequisites; runtime calls and synchronous failure coupling need a separate implementation design. Never silently accept a dependency loop by treating it as documentation-only.

## Schema and fixture limitations
The supplied contract JSON Schema validates structure, types, required fields and interface status. Parent package schemas additionally validate other registries. Static fixture tests prove pair coverage, directional predicate presence, graph routes, schema validity and dependency DAGs. Their PASS means data is well-formed. Acceptance entries remain SPECIFIED_NOT_EXECUTED until a real implementation produces evidence. Neither JSON Schema nor a source unit suite proves the proposed gameplay works.

## Reusable test harness requirements
Arrange an authority-owned initial snapshot and content version; inject an ordered request sequence and deterministic seed; record receipts and final snapshot; replay permutations that should be equivalent; test rejected permissions, invalid revisions, duplicates, resource limits, expiry, disconnect and crash at every commit boundary. Check conservation, ownership and accessible reason codes. Pin fixture inputs and expected outputs as reviewed artifacts. Test real client/server integration separately from pure state transitions.

## Illustrative message, not an existing API
A cast request would carry request_id, actor_id, actual source_uid, current loadout_revision and aim intent. The authority would return a cast_receipt and later accepted effect_events. Do not call a fictional CastService endpoint or map a source VFX uid directly to health changes; implement and review the descriptor first.

## Open production decisions
Target engine and supported hardware; launch concurrency and shard structure; canonical time/season schedule; authoritative network protocol; identity/account privacy and retention; moderation/appeals; final active-Oath cap; monetization (none assumed); exact reward/recipe/price balance; final geography/nav; source licensing and export-right audit; platform accessibility targets; persistence backup/SLO commitments. These block corresponding production claims, not the preservation of the audited castable foundation.

## Reproducing static systems validation
From the repository root, run:

    python AETHERION_CANON/18_IMPLEMENTATION_CONTRACTS/validate_systems.py --repo-root .

The validator requires Python 3 and the jsonschema package; the delivered data was checked with jsonschema 4.26.0 using Draft 2020-12. Pass --output with a writable report path to persist a fresh report. The staged report contains 31 static checks: pair/direction coverage, individual predicate presence, bounds, contract schema/DAG/state references, real geographic trade/detour paths, typed recipe closure, all 100 source uid/asset/implementation references, and all fifteen Oath/event/economy/housing profiles. The report deliberately does not mark gameplay acceptance, visual/GPU testing or human review complete.
