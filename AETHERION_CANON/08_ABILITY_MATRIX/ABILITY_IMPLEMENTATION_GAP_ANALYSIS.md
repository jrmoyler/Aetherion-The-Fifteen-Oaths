# Ability implementation gap analysis

Status vocabulary: VERIFIED only names exercised behavior; IMPORTED means actual source is present but full applicable behavior is unvalidated; BLOCKED names a concrete failed dependency or gate; MISSING means no source implementation. Document proposals are not runtime implementations.

| Gap | Source evidence | Required work and gate | Current classification |
|---|---|---|---|
| Complete rendered spell validation | Real source copied, GLSL and models retained | Per-UID WebGL2 execution, shader logs, representative frames, real targets and animations | GPU gate BLOCKED in current cloud browser |
| Production combat/stat authority | Source owns local dummies, settings and cooldown maps | Specify damage, resources, target eligibility, authority and reconciliation; preserve source until approved adapter exists | PROPOSED |
| Audio | No source audio files/service identified | Oath-distinct cue assets, routing, concurrency, attenuation, accessibility alternatives, rights | MISSING |
| Full-game engine | Source prototype uses Three.js | Compare target engine/platform with measured budgets and integration cost | OPEN DECISION |
| Multiplayer/network | Window API/postMessage only | Server-authoritative commands, validation, ownership, replay/replication and budgets | PROPOSED |
| Secure embedding | Original bridge accepts broad postMessage commands | Origin/source checks, command permissions, same-origin policy, lifecycle teardown tests | OPEN SECURITY GATE |
| Concurrent requests | Source bridge reads mutable active slot across awaits | Serialize caller commands; prove cancellation/clear and stale-request behavior before concurrent use | OPEN INTEGRATION GATE |
| Buff result semantics | Source action returns true for any toast including Not ready | Preserve raw source result; introduce explicit observed-state wrapper only with tests | DOCUMENTED SOURCE LIMIT |
| Model/texture rights | MIT notices plus third-party model/animation provenance hints | Per-asset license/redistribution review, evidence and attribution | RIGHTS REVIEW REQUIRED |
| Environmental interactions | No persisted world-state contract | Approved bounded effects, ownership, cascade depth, rollback/recovery and anti-grief tests | PROPOSED |
| Crafting, housing, ecology | No production transaction/lifecycle implementation | Explicit durable-state authority, saves, reconciliation, costs and recovery | PROPOSED |
| Oath progression/loadout | Source element tags only | Known/bound/equipped permissions, capacity/tension decisions, pact state | PROPOSED |
| Performance/accessibility | Source effects have extensive tuneable settings | Target hardware budgets, flash/motion controls, readability and non-color cues, measured tests | NOT VALIDATED |
| Full source install reproducibility | Lockfiles retained; current tests use verified locally available packages | Clean npm ci in network-enabled supported environment and CI | ENVIRONMENT-LIMITED |

Do not resolve these gaps by replacing any of the 100 source castables with cheaper substitutes or by silently changing balance to fit lore. See [root validation](../../CASTABLE_VALIDATION_REPORT.md) for actual measured scope and [integration](../../ABILITY_MATRIX_INTEGRATION.md) for the implemented adapter.
