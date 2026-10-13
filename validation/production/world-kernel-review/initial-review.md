# Independent CPU world-kernel review — initial findings

Reviewed `/tmp/aetherion-world-runtime/index.mjs` SHA256 `a592ccdbcda32bff29f00a879a034249d62a944cf91fc48503087a088f8258ff`. The exact reviewed copy is `audited-index.mjs`. Reproduce all observations using `node repro.mjs`; output is `observations.json`. Existing authored suite independently ran: 44/44 pass. These probes cover implementation behavior, not engine, physical safety, networking or persistence.

## Findings requiring repair

1. **P1 — disposal can destroy a resource with a new live owner.** Lines 237–250 delete every final resource count before invoking callbacks. A disposer for A synchronously requests a replacement cell and acquires B; the queued B callback then runs while `resourceUsers('B') === 1`. The replacement cell still lists B as owned after its disposal. This violates WORLD_STREAMING_ARCHITECTURE.md line52, “disposes only at zero users.” Repro `reentrantDisposal` exercises the documented callback with ordinary public API calls. Guard reentrant mutations or otherwise guarantee ownership is still zero at each actual disposal.

2. **P2 — tokens are not scoped to the issuing manager.** Lines193–199 compare only key/revision/generation. Two independent managers with the same cell/revision each issue generation1. Passing manager A’s real token to B accepts acquisition and retires B’s unrelated cell. Repro `foreignManagerToken` returns `retired:true`. Manager-local object identity or a private owner identity would prevent cross-world/session token collisions.

3. **P2 — exact receipt replay rejects a previously accepted request.** Lines386–394 validate monotonic clock before prior-receipt lookup. Accept r1 at150001, r2 at150002, then retry exact r1: `Clock moved backwards`. No duplicate credit occurs, but the documented promise that an exact receipt returns its prior result is violated. A validated prior receipt should return before advancing/validating a new-operation clock; mismatched socket/account must still reject. Repro `replayedReceipt`.

4. **P2 — accepted clock range can erase authored durations.** Constructor333 and clock373 accept any finite number; snapshot502 adds duration without precision bounds. At finite1e308, forecast deadline equals entry and effective120000ms duration becomes0. Enforce a documented safe time domain and safe deadline addition (including transitions/recovery) rather than accepting values for which phase timing cannot be represented. Repro `hugeClock`.

5. **P2 — baseline-preservation guard counts entries but not unique identities.** Lines38–44 require63 manifest entries;82–87 validate each repeated entry independently. Replacing the manifest with63 copies of its first record passes, so this advertised baseline check does not protect63 distinct identities. Add uniqueness validation; broader canon schema remains separate. Repro `duplicateBaseline`.

## Policy gap to clarify or repair

6. **Failed safety attestation on a contribution does not enter recovery.** A fresh contribution with `protectedRoutes:false` throws `Unsafe contribution`, but phase remains response/outcome null (lines400–401). A later tick can perform the unpenalized safety abort. The README explicitly describes this split behavior, so it is not hidden; however WORLD_EVENT_REGISTRY’s failure predicate says safety validation failure is an unpenalized setback. Treating observed failure as immediate recovery would be safer and align those semantics; at minimum document the required immediate follow-up tick and test that integration behavior. Repro `failedSafetyContribution`.

## Deliberate partial scope, not findings

No engine/GPU/nav/authority/physical-service tests were inferred from CPU passes. `recover()` is an in-memory safe-state hook, not durable restore. Cooldown scheduling/restart, NPC assistance, outcome persistence, reward allocation and guaranteed physical service restoration are explicitly listed as missing. Resolution’s authored transition is committed outcome, so not independently requiring its nominal30000ms duration is consistent with that transition text. Reconstruction’s `servicesRestored` gate is a declared unimplemented caller dependency, not proof that zero-player service recovery was implemented.
