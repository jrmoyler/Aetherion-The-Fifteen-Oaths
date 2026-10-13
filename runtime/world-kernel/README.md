# Phase II world kernel — proposed CPU implementation

This additive, dependency-free package implements part of the Phase II world contracts. It reads the actual registry IDs and event predicates. It creates no terrain, asset placement, physical routes, network authority, durable save or production event sockets. It never imports or changes Ability Matrix source or enables its proposed event extensions. All designs remain **PROPOSED** and no engine/gameplay/art approval follows from these tests.

## Run

After integrating this directory at `runtime/world-kernel/`:

```sh
npm --prefix runtime/world-kernel test
npm --prefix runtime/world-kernel run audit
```

Before integration, point to the repository explicitly:

```sh
AETHERION_REPO=/workspace/Aetherion-The-Fifteen-Oaths npm --prefix /tmp/aetherion-world-runtime test
AETHERION_REPO=/workspace/Aetherion-The-Fifteen-Oaths node /tmp/aetherion-world-runtime/audit.mjs /tmp/aetherion-world-runtime/coverage.json
```

Node 22.12+ is required. No npm install, engine install or GPU is needed. `audit.mjs` hashes the exact consumed source files and emits the per-family, per-streaming-contract and per-event implementation/missing ledger. An optional output argument writes only the named report. Tests read canon but never rewrite its historical reports. `test-result.tap` is a local test record, not remote-head certification.

## Interfaces and boundary

- `createWorldIndex(graph, pois)` validates consumed schema versions, stable IDs, continent counts, neighbor/edge agreement, capital ownership, POI Oath references, adjacent regions and preservation of baseline POI identities. It returns defensive copies. The three neutral/border/finale POIs with null Oath remain valid; they do not become a sixteenth Oath. `route(from,to)` gives a deterministic shortest **topological region route**, with sorted-ID tie breaking. It does not claim navmesh clearance, open roads, current event access or shortest physical distance. Full Phase II document schemas are still validated by the canon validators; this package checks its consumed fields and cross-references.
- `normalizePosition(position, config)` normalizes signed cells and horizontal offsets with explicit versioned cell width and right-handed axis convention. No fixed cell size is canon. Tests use the specified 128/256/512 m hypotheses. It never reads editorial map anchors as measured positions, assigns POIs to cells or rebases source effects.
- `CellResidency` owns presentation request generations and resource leases. It separates collision, gameplay and presentation readiness. An opaque manager-local token names cell, content revision and generation; copied or foreign-manager tokens cannot change residency. Stale completion/acquisition/retirement returns `false`; illegal current-generation stage changes throw. Gameplay admission requires caller-attested authority, collision, navigation and mandatory cue readiness under one content revision. Resource keys must identify immutable versions (for example a content hash), and the caller supplies disposal. This is a CPU state manager, not an IO loader, authority check or engine resource cache. Retire the old cell before replacing it; side-by-side atomic revision swapping, pins, budgets and hysteresis are still missing. Disposal is sequential and reentrant-safe: another disposer may retain an as-yet-undisposed shared resource; reacquiring the resource whose disposer is currently executing returns `false`. Load/recreate a disposed resource before leasing it again. A failed disposer reports `AggregateError` after all leases are released and every final disposer is attempted; retrying retirement never double-disposes.
- `EventInstance` consumes each actual contract's typed objective state, exact AND/equality predicate and six ordered phases. A required explicit socket-to-objective allowlist comes from the future authored world. Tests label their fabricated socket IDs `test-only-*`; none are promoted into canon. Only a trusted simulation authority may call `tick` and `contribute`. These methods are not a network endpoint and trusting a browser-supplied boolean is not authorization.

The TypeScript declaration file documents these transport-neutral interfaces. `snapshot()` yields JSON-compatible event state for a later Three.js presentation or Godot adapter. It is **not** a validated save/restore API. Godot cannot execute these JavaScript modules directly; a native port or authority/message bridge and actual runtime tests remain required. Existing Three.js castables stay isolated until an external adapter proves lifecycle and gameplay parity.

## Event policy and unresolved dependencies

The source requires catchment ownership, protected routes and distinct server-validated authored objective sockets. This implementation's **proposed conservative API policy** requires fresh attestations: every tick in forecast/activation/response and every new contribution carries `checkedAtMs === nowMs`, `catchmentLease` and `protectedRoutes`. Missing, mistyped or stale attestations throw before state or clock mutation. An explicit failed route or lost catchment lease transitions a tick to unpenalized reconstruction; an unsafe contribution also enters unpenalized reconstruction, then throws without credit. This timestamp only prevents accidental stale attestation reuse in this process; it cannot establish that physical safety was actually checked. Integration must obtain real results from the authority/nav/arbiter at that simulation boundary.

Tick advances at most one phase, using nonnegative safe-integer milliseconds. Times whose longest authored phase deadline cannot be represented safely are refused. It does not fabricate missed phases or contributions after a large time jump. `recover(nowMs)` skips active/stale danger into reconstruction without changing objectives or issuing receipts. At resolution, the caller must attest `outcomeCommitted` before reconstruction; at the reconstruction deadline, it must attest `servicesRestored` before cooldown. These are explicit missing persistence/physical-service dependencies, not completed subsystems. Repeated cooldown remains nonhazardous; scheduling a new instance, resetting transient state, NPC assistance, catchment arbitration, outcome journaling, bounded civic-credit reward allocation and reward idempotency are not implemented.

A new socket receipt increments only its mapped objective, only in response before its deadline, and never above its exact target. One receipt ID cannot be reused for another socket/account. A completed socket cannot be completed again under a new receipt ID. Retrying an exact existing receipt returns its previous receipt, including after phase change, without incrementing any counter or changing the simulation clock, even when its original timestamp precedes a newer accepted action. These receipts are in-memory objective evidence, not durable reward/item grants. No untrusted client may write objectives, weather, phase time or NPC health through this API.

## Evidence and missing scope

The 50-test suite covers all 15 actual event success predicates, all 318 POIs and all 225 region-pair routes, the 63 baseline POI identities, invalid records/IDs/schema, signed coordinate boundaries, cancellation and stale generations, shared/failing resource disposal, all event phase gates, stale safety inputs, duplicate/conflicting receipts, zero-player deadlines and offline recovery. It uses actual canon registries plus explicit negative fixtures.

`coverage.json` maps all 20 deliverable families, all 10 streaming contracts and all 15 event contracts. Every record retains `productionComplete: false` or partial status. CPU success is not engine import, rendering, multiplayer, persistence, world construction, measured performance or full Phase I/II completion. Unreal/Godot/Three.js import and gameplay gates remain separate from this package.
