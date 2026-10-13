# Consequence, persistence and recovery framework

Status: PROPOSED implementation design, except explicitly identified user-established foundations. Numerical values are bounded prototype hypotheses, unvalidated by playtests or profiling. These documents do not change imported Ability Matrix behavior.

Sources: SRC-USER-DIRECTIVE; SRC-RECOVERED-LORE; SRC-SYSTEMS-PROPOSAL. The first two establish the fifteen covenants and broad game pillars. SRC-SYSTEMS-PROPOSAL identifies design authorship, not user approval. Source runtime claims cite SRC-ABILITY-MATRIX-4c4a1eb at commit 4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451.

## Two axes and an owner
Every consequence declares duration class (immediate, temporary, persistent, personal irreversible), reversal class (automatic, player-repairable, checkpoint-replayable, choice-final) and owner scope (personal, party, instance, region, world aggregate). Region/world consequences always have a lifecycle and recovery; they are never permanently content-destroying. An effect cannot acquire wider scope from a visual radius or by chaining interactions.

Personal: health/resources, contract history, pact state and selected narrative outcomes. Party: instance agreement, shared encounter checkpoint and explicitly consented strategy. Instance: temporary terrain, boss state and local puzzle routes. Region: curated event state, temporary prices and civic repair projects. World aggregate: bounded public counters or season presentation across servers, not synchronous mutable terrain shared by every player.

## Required consequence record
Stable id; cause/actor/target; server sequence; content version; source rule; owner and visibility; before/after values or an approved patch; warning shown; consent where required; maximum scope; expiry; recovery policy; compensation policy; reference to irreversible-choice confirmation; and an idempotency key. Audit information is access-controlled and retained according to the eventual privacy policy. No real-world biometric, health or political inference is required.

## Examples
1. Fire melts authored ice cover. Opportunity: opens a flank. Cost: consumes the thermal budget and removes your own cover. Consequence: temporary instance route change. Recovery: authored ice rebuild or encounter reset; never changes the continent mesh.
2. An eruption event is not contained. Opportunity: miners gain access to a temporary cooled resource pocket after evacuation. Cost: the main trade road enters a repair phase. Consequence: regional detour and bounded supply pressure. Recovery: automatic minimum-service timeline plus optional reconstruction acceleration.
3. A pact is severed. Opportunity: renegotiation and alternative alliances. Cost: loss of specifically previewed future benefits. Consequence: personal historical branch and temporary institutional distrust. Recovery: authored reconciliation; mastery and owned goods retained.
4. A siege changes node control. Opportunity: new contracts and fortification choices. Cost: maintenance supply and a scheduled defense obligation. Consequence: seasonal regional administration. Recovery: contest window, reconstruction and later season reset. No winner deletes dungeons or private homes.
5. A final story choice resolves the fragment. Opportunity and costs differ for restoration, domination and liberation. Consequence: personal story phase and clearly labeled summary; shared world access stays available through an epilogue/travel layer. Replay policy is an open product decision.

## Warning and commitment thresholds
Immediate low-impact combat costs use persistent HUD forecasts. Temporary environment changes use owner-marked telegraphs and expiry. Persistent civic changes require a project preview with resource totals, affected services and fallback routes. Personal irreversible choices receive a dedicated summary naming what changes, what remains accessible and the last checkpoint. A second explicit player action commits; inactivity and disconnect cannot commit.

Party choices with personal consequences require per-player consent or branch individually. A party leader cannot accept a member's pact, spend their private goods or choose their ending. Public events use shared participation for reversible state only.

## Recovery transaction
Validate current version → reserve required resources → append pending intent → apply a bounded state patch → append durable commit → publish revision. Duplicate requests return the same outcome. Crash before commit releases or recovers the reservation; crash after commit replays the published result without paying twice. Reconciliation compares aggregate and ledger versions, quarantining conflicting updates for repair.

A failed region worker resumes from its event checkpoint and deterministic event seed. If missing/corrupt, restore the last valid baseline and refund unconsumed reserved contributions. Never roll back other unrelated player progress. Support tools must preview and log a compensating transaction; direct database edits are not a normal game workflow.

## Scope escalation and time powers
No rule escalates personal → party → region → world automatically. A region event aggregator accepts only signed, validated contribution messages and author-controlled thresholds. Time techniques restore eligible local pose/state within their declared window; they cannot reverse inventory, quest commits, trades, territory ownership, pact confirmations or other players' consent. Shadow/memory fiction cannot erase a real account history or recovery receipt.

## Accessibility and trust
Show cause, duration, affected scope and recovery path through text/icons in addition to color or audio. Warnings persist in an accessible event log and can be replayed. High-impact forecasts can be paused in safe noncombat contexts. Localization must preserve numerical limits, actor ownership and the distinction between reversible and final. A player can inspect why a system rejected an action without revealing hidden opponents or private reports.

## Acceptance tests
A two-player replay cannot duplicate rewards or spend another player's goods; a crash at each transaction boundary recovers to one coherent state; skipped event phases still restore essential routes; no forbidden interaction writes outside its owner; story finale cannot mutate another player's personal state; a disconnect never consents to a pact or deletes a plot.
