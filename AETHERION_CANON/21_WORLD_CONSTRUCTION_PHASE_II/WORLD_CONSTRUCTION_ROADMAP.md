# World construction roadmap

Status: **PROPOSED planning**, not a staffed schedule, funding commitment, playable build or asset production claim. Sources: P2-SRC-FOUNDATION, P2-SRC-DIRECTIVE, P2-SRC-PROPOSAL. Baseline is [reviewed foundation PR #1, now merged](https://github.com/jrmoyler/Aetherion-The-Fifteen-Oaths/pull/1) at `5dce9edae0bb3587eb7c72433395e7d5a19857ea`.

Read-only GitHub status observed during Phase II reports PR #1 merged on 2026-10-13 at 18:54:56 UTC, merge commit `8c4b5d0bfc75a98388ea29231b9cf1d304dff550`. The reviewed head `5dce9edae0bb3587eb7c72433395e7d5a19857ea` remains the planning comparison pin. The observation does not identify who merged it and does not authorize any Phase II repository change.

This is a world-construction refinement of baseline `AETHERION_CANON/20_PRODUCTION_ROADMAP/PRODUCTION_ROADMAP.md`, not a second competing product roadmap. All fifteen regions remain full-scope obligations. A vertical slice validates methods before replication; it neither reduces the world to one region nor makes Daybreak the mandatory first Oath. Ordinary travel and civilian access remain available without Oath binding.

## Phase II completion versus future execution

**This package can complete now:** evidence-linked geographic/urban/ecological/asset/streaming specifications; retained foundation IDs; conceptual continent map; strict data validation; conflict and gap records; a proposed integration plan. Static passes certify only the data conditions actually checked. Review still needs founder decisions on proposals, art and design conflicts.

**Not part of Phase II delivery:** selecting/implementing the world engine, generating production terrain, authoring production meshes/rigs/materials, world streaming code, server deployment, save service, actual NPC/nav simulation, commercial asset clearance, runtime profiling or published playable world. Code, funding, hires, procurement, repository publication and deployment require their own authorized work. No calendar dates or budgets are committed by this roadmap.

## Dependency and exit gates

| Gate | Work package and dependencies | Exit evidence required | Stop / fallback |
|---|---|---|---|
| G0 — Reconcile planning | Review baseline delta, preserved IDs/capitals/POIs/edges/basins; resolve conflicting proposal ownership. Depends on the complete Phase II manifest and static validator. | Reviewed delta log, all JSON/schema/reference checks passing, conceptual map labeled, no private source locators, open decisions assigned. | Conflicting canon stays proposed and isolated; do not overwrite foundation. |
| G1 — Select platform and engine experiment | Founder nominates device/input tiers and engine candidates. Compare same terrain corridor, interior, civilian crowd, mount and imported castables. Depends on G0 and license/provenance assessment for sample content. | Documented decision with measured cold/warm sustained CPU/GPU/memory/stream data, tool/export fit, source parity cost, licensing review and explicit unsupported cases. | Keep Three source harness independent; no engine switch by assumption. If candidates fail, reduce prototype load or revise hardware targets for review. |
| G2 — Build measured geography skeleton | Survey one approved sample; version units, cell config, river/channel constraints, boundary nav and service anchors. Depends on G1 and approved geographic sample. | Seam-free neighboring cells, downhill catchment flow, real walking/pack/detour traversal, safe slope/clearance, conceptual-to-measured transform documented without inventing continent scale. | Reject terrain that violates basin/route invariants; repair authored constraints before dressing. |
| G3 — Prove streaming and persistence core | Implement readiness generations, reference ownership, rebase, interior portal, journal/save migration and authority snapshot. Depends on G2; schema and durable transaction design precede valuable inventory. | STREAMING_PROTOTYPE_CONTRACTS tests executed, crash/reconnect/duplicate/out-of-order cases clean, no collision outrun or lost service/ownership; recorded target-device evidence. | Safe staging/coarse collision; prior revision retained. No breadth expansion to hide systemic defects. |
| G4 — Approve art/construction benchmark | Produce representative distinct architecture, roads, foliage, water, street props, NPC/mount and source-VFX comparison. Depends on G1–G3; representative concept and license clearance. | Approved silhouettes/material calibration; snapping/collision/nav/LOD/lighting/export/rig tests; environmental and Oath identities readable without recolor dependence; measured density costs. | Rework kit modules rather than clone fifteen recolors; preserve source references. |
| G5 — Playable cross-Oath civic loop | Bind streaming, population, weather, infrastructure event, reversible consequence, craft/trade and one public interior. Depends on G3–G4 and existing gameplay/narrative contracts. | One complete loop with combat and noncombat alternatives, refusal/failure/reconnect paths, save restore, named NPC relocation and protected service access; independent playtest and accessibility review. | Feature stays prototype; retain explicit missing cases. No claim that a scenery walk constitutes the game. |
| G6 — Multi-region systemic stress | Add three connected contrasting regions, event overlap, caravans/migration, large mount routing, housing permissions and authority interest. Depends on repeated stable G5 sessions. | Cross-region state/reward conservation, service floor under simultaneous events, party travel and reconnect, no pop-in exploit; sustained target-tier profiles and server metrics. | Use one authority until handover is proved; postpone conflicting events; downgrade only cosmetics. |
| G7 — Fifteen-realm construction batches | Expand approved methods through all regions and all 30 border connections; review each capital, settlements, routes, dungeons and ecological niches. Depends on G6; each batch only begins after its dependency kits/route data are ready. | Per-region completed acceptance packet, all 63 baseline POIs accounted for, all 30 measured border routes plus safe alternatives, four terrain-derived basins, no extra realm, every capital/service/first-Oath choice accessible. | A failed realm remains unfinished; do not label narrative/asset headings as completion. |
| G8 — Whole-world and release readiness | Integrate territory/reconstruction/endgame states, localization, long-session travel, recovery and cross-platform content migrations. Depends on G7 and corresponding gameplay gates. | Full regression matrix, rights review, durable restore rehearsal, operational/load tests, player choice/accessibility reviews, approved support matrix and known-issue disposition. | Block release on lost state, inaccessible essential content, unsafe authority or unresolved commercial rights. |

Dependencies are design/verification prerequisites, not necessarily serialized staffing. Geographic planning and asset concept work may run together; they cannot promote unmeasured terrain or unapproved art to production. Estimates are made after G1–G4 with measured throughput, rework rate and actual staffing. Do not convert these rows into dates without those inputs.

## Recommended sample, alternatives and scope protection

**Preferred test proposal:** Daybreak's public aid/service plaza in region-09, a grounded Fault–Daybreak boundary corridor (regions 05–09), a short road with an ordinary pack route and protected detour, and one public interior. The baseline geography explicitly identifies Fault–Daybreak as a strategic pass; Daybreak is the previously proposed opening benchmark. Final placement remains subject to geography and narrative approval. Do not claim this corridor spans a drainage connection: inspect catchment boundaries separately.

Include: one named service NPC plus cosmetic crowd; one natural fauna corridor; one approved mount proxy; a bridge/retaining element with authored degradation/reconstruction; rain/fog/day-night transitions; a private-room permission test using a non-production fixture; one castable routed through unchanged source behavior and representative selected imported effects. Full all-100 castable GPU parity remains a separate obligation, not satisfied by this sample.

Suggested loop: reach the service anchor unbound → receive a civic repair/aid objective → traverse an ordinary route → respond through craft/transport, negotiation or an authored encounter → observe a bounded environmental/service change → re-enter public interior → save, reconnect and return. Do not invent a canon quest or decide the Archivist narrative through a technical fixture. Narrative owners supply any story integration.

**Alternative A:** Rime–Kiln for snow-to-volcanic foothills, melt drainage, warm interior and terrain seams. Good hydrology/material stress; less useful alone for dense urban life.

**Alternative B:** Escapement–Impulse for fast ground travel, braking/nav clearance, industrial silhouettes and freight reconstruction. Good streaming stress; does not validate northern snow or canopy performance.

Use the preferred sample for initial systemic proof, then both alternatives and a Graft–Tidal wet/canopy segment before continent-wide cost claims. These are test selections, not additional territories or approvals to build them.

## Proposed expansion batches and distinguishing proof

Order within a batch follows dependencies, not narrative rank. Each row's exit supplements the common G7 packet. Region and Oath identities remain baseline-owned.

| Proposed batch | Regions | Distinguishing construction proof |
|---|---|---|
| Civic/divide benchmark | region-09 Daybreak, region-05 Fault, region-01 Kiln | Aid/service plaza and colonnades; load-bearing canyon routes; vented ceramic/industrial terraces; shared geology, independent jurisdiction, visible infrastructure repair. |
| Northern uplands | region-02 Rime, region-03 Storm, region-06 Reed | Movable glacial archive interfaces; grounded lightning relay access; cliff acoustic structures and accessible alternate paths; snow, exposure and pass closure recovery. |
| Western living lowlands | region-07 Graft, region-08 Bitterglass, region-04 Tidal | Managed canopy/root supports; contained treatment beds and reaction towers; mainland estuary civic routes; ecological corridors, water quality and flood refuge. |
| Eastern thresholds | region-10 Observatory, region-13 Theatre, region-11 Court | Ballasted/suspended observatory with grounded anchor; authored optical/screen routes with true collision cues; karst/absent-edge architecture with persistent public approach; no disconnected major realm. |
| Southern movement | region-12 Sanguine, region-14 Escapement, region-15 Impulse | Kin/pact service spaces; temporal-road mechanics bounded from world clock; heavy freight/actuator clearances; coexistence of civilian life, access and reconstruction. |

All cross-batch borders are still owned work: maintain a 30-edge acceptance matrix, not just fifteen isolated capital demos. Likewise each of the 63 existing POIs must map to a reviewed production packet or explicit deferred production status; this plan does not silently drop them. Four drainage basins require end-to-end checks across batch boundaries.

## Common realm completion packet

Each realm needs a signed-off proposal-to-production delta; preserved stable IDs and source provenance; measured terrain/river/nav survey; capital exterior/interior and civic-service plan; villages/outposts and authored POI coverage; settlement/transport/fauna clearance; distinct kit and border variants; ecology/season/event fixtures; NPC relocation and protected access; bounds/LOD/collision/dependencies/licensing; per-tier performance/visibility/accessibility captures; save/reconnect/state migration; and named reviewer acceptance. Review sign-off is future evidence, not assumed by this checklist.

## Risks to retire early

1. Engine port fidelity: isolate source runtime, document unsupported coordinate/physics/VFX seams, measure representative comparisons before commitment.
2. Content scale: fifteen distinct cultures require different production modules, civilian objects and material construction; shared tools cannot replace these.
3. World scale ambiguity: conceptual canvas gives relative layout only; approve measured extent and travel goals after real traversal prototypes.
4. Streaming latency: worst-case speed, decode/upload/shader work and nav readiness may force earlier prefetch or staged traversal. Measure under constrained storage/network.
5. State explosion: keep destruction, weather and territory states bounded; test conflicting changes and protected access before adding variants.
6. Persistent economy: journal/reward conservation precede durable goods; recovery and migration are blockers, not release polish.
7. Platform uncertainty: no shipping support claim until nominated sustained device tests pass; quality tiers may differ visually but preserve semantic parity.
8. Rights and consent: source presence is not commercial clearance, approval of a new concept, or authorization for spending/publication.

## Review decisions needed

Approve/refine geography and capital deltas; choose measured-world/travel goals; nominate target device/input tiers and candidate engines; select benchmark and representative licensed assets; decide authority/offline/save policy; set measured budgets; assign per-discipline reviewers; authorize future implementation separately. Integration remains a proposed, additive review branch as described in INTEGRATION_PLAN.md.
