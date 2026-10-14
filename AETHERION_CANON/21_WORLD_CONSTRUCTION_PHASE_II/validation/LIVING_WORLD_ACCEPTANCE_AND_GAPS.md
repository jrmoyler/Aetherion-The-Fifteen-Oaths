# Living-world acceptance and gaps

Status: PROPOSED. Sources: P2-SRC-FOUNDATION, P2-SRC-DIRECTIVE, P2-SRC-PROPOSAL. Read-only foundation commit: 5dce9edae0bb3587eb7c72433395e7d5a19857ea. No source repository edits, assets, runtime implementation or production certification are claimed.

## Delivered

- REGIONAL_BIOME_SPECIFICATIONS.md and REGIONAL_ECOLOGY_PROFILES.json: 15 distinct physical habitat, food/work, disturbance, migration and recovery loops anchored in baseline climates and four basins.
- WORLD_ECOLOGY_SYSTEM.md: deterministic aggregate ecology, conservation equations, farming, husbandry, fishing, hunting, migration, offscreen approximation, authority, recovery and prototype budgets.
- DYNAMIC_WEATHER_SYSTEM.md: climate/season clock, six-state weather progression, downhill hydrology, coastal backwater limits, local Oath exceptions, substrate response, accessibility and performance hypotheses.
- NPC_CIVILIZATION_SYSTEM.md: 15 local civic work patterns, daily schedules, markets, trade caravans, merchant travel, construction, maintenance, patrols, conflict, festivals, bounded invasion framework, emergencies and recovery.
- WORLD_EVENT_REGISTRY.json: 15 refined baseline event IDs, each with six ordered phases, unique story/objective predicate, named foundation leader/civilian, public-tool alternatives, source-castable evidence, failure/success/reward/consequence/reset contracts.
- Two strict draft-2020-12 schemas reject unknown object properties. Semantic checks supplement schema for ID pairing, phase order, predicates, fixed thresholds and disabled adapters.

## Evidence and review decisions

Baseline realm, Oath dossier, art direction, character, service/economy/housing, event and source-castable records were read as refinement inputs. Fifteen actual implementation files were statically inspected; LIVING_WORLD_SOURCE_INSPECTION.json records exact repository-relative paths, source lines and SHA256. Observed visual or sandbox behavior is explicitly narrower than proposed civic use. No source behavior is rewritten. All fifteen civic castable interactions are PROPOSED_ADAPTER_DISABLED: they need per-UID phenomenon inspection, approved extension descriptor, authority adapter and tests. This is a deliberate source-integrity gap, not completed gameplay functionality.

Region worker confirmed p2-poi-NN-habitat/resource IDs; hazards remain at poi-NN-event, protected fallback at poi-NN-capital. Geography worker confirmed western moisture, ridge/lee differentiation and four unchanged drainage sequences; tidal backwater is limited to region-04/15 coastal reaches and treatment cells remain separate from potable supply. Streaming worker received monotonic world_tick, fixed ecological buckets and idempotent phase/receipt conventions.

A QA review identified ambiguity between fixed success counts and inherited low-population difficulty adjustment. Resolution: reduce effort or supply NPC assistance at unfinished sockets without changing named success counts; NPC help issues no player reward. Activation now explicitly retains fixed thresholds. Event/civilization prose states stable safety-abort/success/deadline evaluation order and no late-arrival inflation.

## Static acceptance

Run: python validation/validate_living_world.py (requires jsonschema). LIVING_WORLD_STATIC_CHECKS.json records actual results. Schema and semantic passes are evidence of contract consistency only. Final package QA owns broader cross-file reference resolution. Negative fixtures exercise unexpected-property rejection; no engine behavior is tested by these fixtures.

## Open gates and deliberate scope limits

- Calendar length, numeric coefficients, quotas, reward units and CPU/GPU ceilings are unvalidated prototype proposals.
- Fifteen source implementations are statically observed, not GPU/gameplay certified. New civic effects remain disabled; public tools complete every event.
- Named flora variants, crops, fish species, invasion rosters, extra festivals, final migration corridors and encounter assets still need authoring/approval. Existing natural species concepts remain intact.
- No full continent fluid/food-web/NPC/economic simulation. Offline catch-up is bounded and disclosed; private property and inventories remain safe.
- Actual conservation/escrow race tests, deterministic replay, streaming handoff, source adapter tests, solo timer playtests, navmesh reachability, accessible-route sessions and performance profiling remain required.
- Repeatable event results do not mutate personal quest decisions or make refusal of an Oath/rite punishable. No involuntary PvP, home destruction, permanent NPC loss or monopolizable essential service.
