# Unified systems architecture

Status: PROPOSED implementation design, except explicitly identified user-established foundations. Numerical values are bounded prototype hypotheses, unvalidated by playtests or profiling. These documents do not change imported Ability Matrix behavior.

Sources: SRC-USER-DIRECTIVE; SRC-RECOVERED-LORE; SRC-SYSTEMS-PROPOSAL. The first two establish the fifteen covenants and broad game pillars. SRC-SYSTEMS-PROPOSAL identifies design authorship, not user approval. Source runtime claims cite SRC-ABILITY-MATRIX-4c4a1eb at commit 4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451.

## What is established, proposed, or implemented
The current directive locks the continent, exactly fifteen Oaths, their elements and identities, the original Weave fragment, the opening death of the Archivist, and the central stability/freedom conflict. Recovered user-authored lore establishes hybrid combat, multi-classing through fragments, dynamic Oath conflicts, housing and life skills, territorial PvP, and Oath-associated mounts/morphs as intended game pillars. It does not establish their numerical design or confirm implementation.

Ability Matrix is a source-backed single-scene Three.js/Vite ability sandbox with native and vendored ability runtimes, a uid-addressed catalog and presets. It is evidence for the imported castables, not evidence for an authoritative MMO server, persistent continent, economy, quest engine or any systems proposed here. The production audit owns per-castable status and tested claims. A browser scene's use of targets, damage or movement does not establish authoritative multiplayer behavior.

## Play loops
- Moment: read an attack → choose action aim or assisted selection → commit resource/position → resolve a cast and bounded material response → exploit or evade the resulting space.
- Expedition: choose a small active loadout and supplies → travel a continuous route → gather, fight or solve → choose allegiance-sensitive responses → return or establish a recovery point. Discovery never requires binding every Oath.
- Civic: produce a useful good or service → move it across a real neighboring route → repair infrastructure, furnish a home or supply an opted-in conflict → receive transparent compensation and standing.
- Campaign: learn the Oaths → develop compatible practices → bear visible personal and political consequences → reconcile or break pacts → pursue a player-owned ending branch. Ending selection cannot rewrite other players' histories.

## Authority and persistence map
Client: input intent, accessibility settings, predicted movement and cosmetic playback only.
Simulation authority: accepted casts, targeting checks, deterministic interaction records, actor resources, encounter state and bounded terrain overlays.
Persistence authority: inventory transactions, pact versions, plot ownership, quest choices, world event checkpoints and territory seasons. One writer per aggregate; no client-provided economic balance is trusted.
Content authority: versioned registries with approval state, source lineage and migrations. Source uid, element and settings remain immutable imported fields; extension descriptors are separately versioned.

No production engine has been selected. Names of services and messages in this package are proposed responsibilities and schemas, not existing APIs. A monolith may initially implement these responsibilities; splitting services is not a requirement.

## Cross-system invariants
1. Narrative allegiance, reputation and mechanical slots are independent values with explicit links, never synonyms.
2. Every high-impact action has an opportunity, stated cost and foreseeable response; no random punitive roll for playing a mixed-Oath build.
3. Element identity alone never implies susceptibility, moral judgment, faction hostility or a damage multiplier.
4. A deterministic interaction requires authorized targets, material/state tags, sufficient budget and a rule match. Otherwise the two effects coexist.
5. Every mutable world record declares owner scope, lifetime, permitted writers, rollback boundary and recovery behavior.
6. Irreversible story choices are personal, previewed and checkpointed. Shared civic damage is recoverable. Story, accessibility routes and homes cannot be permanently removed through PvP.
7. Known content remains discoverable after a pact break; access alternatives exist for essential travel, narrative and crafting.
8. Server cost ceilings degrade cosmetic density first; they never silently remove a hostile telegraph, a damage event already accepted or an accessibility cue.

## Delivery sequence and dependencies
Prototype: one region junction, three Oaths, one civilian chain, one housing interior and a two-sided objective. Use reference data for all fifteen Oaths but do not promise continent-scale runtime.
Vertical slice: add server authority, transactional persistence, accessibility, reconnect recovery, deterministic replay and a staged siege with reconstruction.
Production: broaden content only after measured concurrency and content costs fit selected platforms. Three-way battles, live seasons and cross-region infrastructure depend on the slice proving fairness, recovery and capacity.

Read MULTI_OATH_PROGRESSION, HYBRID_COMBAT, ELEMENTAL_INTERACTIONS and CONSEQUENCE_FRAMEWORK together. WORLD_EVENT_REGISTRY, ECONOMY_REGISTRY, HOUSING_PROFILES and PVP_MODE_CONTRACTS provide authored content examples. IMPLEMENTATION_CONTRACTS defines engineering acceptance; it is not evidence those systems exist.

## Per-castable world traceability
CASTABLE_WORLD_LINKS.json links all 100 audited source uids to the locked element/Oath mapping, system profile, profession/economy, typed recipe, proposed progression requirements, equipment-family concepts, candidate interaction rules, and actual imported VFX/animation implementation paths. A candidate interaction link is an element-based review index, not an enabled effect. Active interaction lists remain empty until per-uid phenomenon/material review and adapter implementation. Source uid, source element, source label and original presets remain unchanged.
