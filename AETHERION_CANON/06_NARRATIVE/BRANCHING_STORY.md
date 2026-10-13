# Branching story

Status: PROPOSED structure under SRC-WORLD-PROPOSAL, preserving LOCKED opening and ending directions from SRC-USER-DIRECTIVE and recovered conceptual direction from SRC-RECOVERED-LORE.

## Act I: a succession without a mandate

[LOCKED] The Archivist dies on Daybreak's great-plaza steps, names the player successor and entrusts the original Weave fragment. [PROPOSED] The scene establishes multiple witnesses, immediate civilian danger and incomplete evidence. The player can help different people first, but cannot prevent or reverse the locked death. No opening dialogue chooses a secret lifelong faction allegiance.

[PROPOSED] Daybreak offers protection, Rime requests custody of records and other powers seek access through verified local representatives. Their requests are not equivalent: one may offer shelter, another technical help, another a political bargain. The player reaches a protected road hub and sees all fifteen initiation options. Any may be first; deferring binding remains a viable narrative choice using common tools and civic assistance.

## Act II: institutions under pressure

[PROPOSED] Each regional arc begins after orientation and has no prerequisite regional arc or bound Oath. The player observes a useful service, hears a concrete civic dispute, investigates independent evidence and confronts an encounter whose resolution changes an institution. Optional initiation and civilian side stories can occur before or after the main regional settlement.

[PROPOSED] Regional choices are not interchangeable good/neutral/evil buttons. Kiln allocates production; Rime negotiates valid consent under preservation risk; Storm chooses routing governance; Tidal funds water and harbor duties after debt reform; Fault compares reinforcement with relocation; Reed defines emergency command; Graft pays for voluntary separation; Bitterglass funds reliable open remedies; Daybreak makes protection challengeable; Observatory acts under honest uncertainty; the Court balances refuge and accountability; Sanguine distinguishes chosen duty from inherited coercion; Theatre sustains art after profitable myth; Escapement distributes urgent delay; Impulse shares control of productivity.

[PROPOSED] Main-story evidence is categorical rather than tied to a fixed realm order. Interface behavior, civilian consequence and an independent record establish enough to question exclusive covenant claims. A local witness and a copy of that witness's statement are not independent sources. A public archive, protected testimony or verified cross-realm record can supply corroboration through accessible alternate routes.

## Act III: promises become incompatible

[PROPOSED] Once the player makes consequential commitments, a sponsor may demand custody, exclusive access or protection of a threatened service. A betrayal requires an earlier motive, a visible warning and a real conflict with the player's promises. If those conditions are absent, the sponsor negotiates or withdraws openly; the script does not invent treachery because every act needs a twist.

[PROPOSED] The player can preserve an alliance by accepting limits, renegotiate it through evidence, or refuse and face a bounded conflict. No route makes an entire realm permanently inaccessible. Civic dissent survives both friendship and hostility, and a leader's removal does not erase institutional expertise or residents' needs.

## Act IV: a plan that can work

[PROPOSED] The final preparation asks how each foundational service will continue under the chosen order. All fifteen interfaces need representation, but representation can come from a completed regional settlement or an independent civic review. The player need not bind, equip or defeat every Oath. The story checks service continuity and affected people, not collection completion for its own sake.

[PROPOSED] Restoration coordinates revised covenants under a negotiated charter. Dominion chooses any one of the fifteen as dominant, with explicit minority-service and succession terms. Liberation withdraws compulsory claims through a staged replacement plan. Each ending has advantages and costs that follow from its governance choice; none is a hidden failure ending for disagreeing with the writer.

## Irreversible choices and scope

[PROPOSED] Regional settlements and the final covenant decision receive a plain-language preview, affected characters, material costs and a clear confirmation point. Investigation, travel and failed combat remain recoverable. Time, memory and illusion cannot silently undo a confirmed decision or rewrite another player's timeline.

[PROPOSED] Story consequences are personal or belong to a party instance whose members explicitly accept the shared decision. Shared-world weather, trade and territory use separate bounded recoverable states. A player's Liberation ending does not remove a stranger's housing services; Dominion does not delete fourteen castable catalogs; Restoration does not make every NPC agree.

## Aftermath

[PROPOSED] The final chapter revisits civic characters and shows the work required by the settlement. A relieved household may still fear lost services; an institutional leader may accept reform while grieving an old identity; a critic may remain unconvinced. Follow-on quests address reconstruction, oversight and care without pretending the ending was meaningless or reversing its declared political consequence.

## Production gate

[PROPOSED] QUEST_REGISTRY.json defines dependencies, evidence, objectives, branches and scope. ENDING_PREREQUISITES.json defines the semantic final predicates. NARRATIVE_STATE_CONTRACT.md defines authority and recovery. The accompanying validation checks referential and logical properties only; dialogue quality, emotional coherence, quest pacing and playability require human and runtime review.

## Alternate civic-review route

[PROPOSED; SRC-WORLD-PROPOSAL] The independent-review option is implemented in the proposed quest data as quest-civic-review-01 through quest-civic-review-15, with explicit service-attestation outputs. A separate independent-record quest supplies corroboration without requiring an Archive or Court boss. A player can therefore reach a final settlement while leaving a regional government's climax unresolved, and even complete the civic-review route without completing any regional climax. The resulting ending still carries a viable plan for every foundational service and preserves recorded civic dissent.

## Concrete optional alliance: Helia's warded sponsorship

[PROPOSED; SRC-WORLD-PROPOSAL] After the first commitment, quest-alliance-daybreak-offer lets the player accept or decline Helia Mar's optional warded transport. The player promises minimal notice before moving the fragment out of an active ward zone. Helia promises not to seize it without an independent hearing. Passenger identities and confidential route details are outside the notice duty. Declining preserves ordinary public travel and care.

[PROPOSED] After corroboration, quest-alliance-daybreak-warning presents a real conflict: Sorin Kes verifies that an evacuation has overloaded the sanctuary wards, while Rell An has a short private ferry window for a threatened witness. Helia warns that an unannounced crossing could prompt an emergency custody order; Sorin explicitly identifies that threat as contrary to the hearing promise.

[PROPOSED] quest-alliance-daybreak-crossing offers three concrete responses. Minimal notice preserves the safety agreement but loses the safest immediate ferry window. A witnessed exception protects secrecy but delays movement and diverts Sorin from other care planning. A secret crossing preserves the urgent private window but breaks the player's notice promise and leaves ward crews unprepared.

[PROPOSED] In quest-main-06, only the accepted, warned secret-crossing route triggers Helia's attempted seizure without a hearing. That is Helia's distinct breach, not a moral entitlement created by the player's first breach. Sorin refuses to use the clinic for detention; Rell confirms the witness's safe arrival while acknowledging the ward-relief cost. A nonlethal standoff or independent mediation secures the fragment and resolves custody. Optional escort is suspended, both broken promises remain recorded, and public services and all ending routes stay open.

[PROPOSED] quest-alliance-daybreak-recovery can establish a narrower independently witnessed agreement or end the sponsorship. Neither deletes the betrayal history or forces forgiveness. Without any accepted alliance, quest-main-06 uses an ordinary independent safety hearing and attributes no unmade promise to the player. The relationship graph links these exact quests and consequence flags to Helia, the player, Sorin and Rell.
