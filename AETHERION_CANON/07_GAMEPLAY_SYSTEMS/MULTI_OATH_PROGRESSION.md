# Multi-Oath progression and covenant state

Status: PROPOSED implementation design, except explicitly identified user-established foundations. Numerical values are bounded prototype hypotheses, unvalidated by playtests or profiling. These documents do not change imported Ability Matrix behavior.

Sources: SRC-USER-DIRECTIVE; SRC-RECOVERED-LORE; SRC-SYSTEMS-PROPOSAL. The first two establish the fifteen covenants and broad game pillars. SRC-SYSTEMS-PROPOSAL identifies design authorship, not user approval. Source runtime claims cite SRC-ABILITY-MATRIX-4c4a1eb at commit 4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451.

## Terms and independent state
- Known: an Oath or practice has been discovered; codex access only. The player can eventually know all fifteen.
- Initiated: an initiation milestone is complete; this is historical evidence, not an active pact.
- Bound: a voluntarily accepted personal pact exists. Multiple bindings may be held; binding requires explicit terms and does not automatically equip powers.
- Active: a selected, stabilized subset of bound Oaths supplies mechanical resource channels for the current expedition.
- Equipped: individual techniques placed in the finite action loadout; a technique generally requires an active supporting Oath and weapon proficiency. Passive ownership does not grant an extra active slot.
- Temporary: a clearly timed, encounter-owned loan, transformation or environmental permission. Its expiry behavior is advertised and it cannot bypass forbidden-combination checks.
- Forbidden: a reviewed technique combination or use in a protected context is currently disallowed by mechanics, or an institution politically prohibits it. Those are two distinct flags. An entire Oath or its adherents are never mechanically forbidden.
- Allegiance: personal public commitments, institutional membership and promises; these can change dialogue, contracts and witnesses. They are not a count of active Oaths.

Proposed first balance fixture: 2 active Oaths, 6 equipped techniques plus weapon actions, 1 movement utility and 1 support utility. A late-game test may unlock a third active channel with a clearly stated specialization tradeoff, but it is not promised progression. The maximum number of bound pacts is an open canon decision; the fixture allows a ledger of all fifteen while only two are active. No document assumes fifteen simultaneously usable Oaths.

## State transitions
Unknown → known by observation, study or dialogue.
Known → initiated through a combat, craft, exploration or civic trial of equivalent progression value. No PvP requirement.
Initiated → bound only after a plain-language pact preview identifying boons, obligations, institutional consequences and exit/reconciliation routes.
Bound → active only at safe attunement points or an out-of-combat preparation state; the authority validates slots, dependencies and outstanding transaction state.
Active → dormant by voluntary loadout change. Dormancy pauses channel benefits; it does not erase mastery or break a promise by itself.
Bound → suspended when a declared promise is breached and evidence is recorded; receive the reason, affected privileges and remedy. The player can contest an institutional interpretation through authored content.
Suspended → reconciled through restitution, renegotiation or mediation. Reconciliation restores eligible channels without regrinding their technical mastery.
Bound/suspended → severed through an explicit, previewed pact-breaking choice. Skills remain known; faction-controlled privileges may require a later arrangement. Protected housing ownership and essential route access persist.

A failed initiation resets only the local trial state, with alternatives and readable feedback. Disconnecting during a pact ceremony returns to its last committed checkpoint and never accepts terms on the player's behalf.

## Mastery and horizontal growth
Each Oath tracks knowledge, practice and covenant history separately. Practice comes from meaningful encounter/civic objectives with diminishing credit for exact repetition; idle farming and self-damage loops do not grant mastery. Knowledge unlocks alternative applications and counterplay understanding. Mastery unlocks technique choices, efficiency sidegrades and civilian specialization, not infinite multipliers.

Four proposed authored stages: acquaintance, initiate, practitioner, steward. Stage names are working UI labels. Each stage contains a combat route, a civilian route and a mixed route; their cost and time need playtesting. Account-level tutorials may be skipped after demonstrated proficiency, while character-specific choices remain character-owned.

Weapon proficiency determines animation families, reach, aim mode and available basic actions. It is not locked to a moral identity or a single Oath. A ninja/stealth discipline and a sorcerer discipline are training presentations across all fifteen Oaths, not two universal gender or equipment restrictions.

## Tension and instability
Covenant tension is a transparent ledger of incompatible promises and repeated high-load channel use, not a hidden hostility meter. Political tension is derived from witnessed commitments; mechanical strain is derived from published channel load. The UI explains which is changing and why.

A powerful mixed technique may require a preparation window, extra resource reservation, material, recovery time or a visible anchor. Its costs are paid before commitment or clearly previewed. At a safe threshold the authority refuses an over-cap cast rather than randomly injuring the player, deleting items or betraying allies. A player may intentionally accept a bounded overchannel option only if the exact temporary exposure is shown.

Example: a gravity-supported stone span offers a temporary route; it reserves an anchor and channel capacity. Destroying the anchor ends the span after warning and moves affected players to a safe landing point. The consequence creates counterplay without erasing progress.

## Reputation and social response
Track personal reputation per institution/region, legal incident records, and public allegiance declarations separately. NPCs respond to demonstrated actions and policies. Holding Blood, Poison, Shadow or any mixed Oath is not evidence of villainy. A forbidden action can be opposed through observable behavior rather than an Oath-based kill-on-sight rule.

Rewards include elective plot styles, mount partnerships, service contracts, festival roles, cosmetic recognition and specialized recipes. A standing loss may suspend future subsidized services or faction commissions, never confiscate bought furniture, strand a character, delete an existing mount or remove the main story.

## High-risk combinations and counterplay
Examples requiring review: indefinite stun/stasis chaining; time replay that duplicates loot; hidden unavoidable damage; repeated gravity displacement into no-recovery terrain; summon replication; allied healing converted into compulsory blood sacrifice. These are prohibited because of outcome, independent of which Oaths implement them.

Counterplay is readable preparation, line of sight, breakable anchors, range limits, interrupt windows, defensive resources and global crowd-control recovery. The authority enforces a common control budget and preserves a rescue route. Political prohibitions can still create interesting quests without making a player's chosen identity mechanically second-class.

## Acceptance scenarios
- Know fifteen, bind three, activate two, equip six: inactive techniques cannot execute; codex and dialogue access remain.
- Change allegiance without changing loadout: mechanical state remains unchanged unless a specific pact term says otherwise.
- Break a pact while owning its regional house and mount: ownership persists; new institutional subsidies can pause with notice.
- Repeat a time ability around a reward: the reward transaction commits once; no currency or item rewind.
- Select a noncombat initiation route: reach the same core channel entitlement without forced PvP.
- Disconnect during activation: recover either complete old or complete new loadout, never half of each.
