# Events, ecology, weather and infrastructure

Status: PROPOSED implementation design, except explicitly identified user-established foundations. Numerical values are bounded prototype hypotheses, unvalidated by playtests or profiling. These documents do not change imported Ability Matrix behavior.

Sources: SRC-USER-DIRECTIVE; SRC-RECOVERED-LORE; SRC-SYSTEMS-PROPOSAL. The first two establish the fifteen covenants and broad game pillars. SRC-SYSTEMS-PROPOSAL identifies design authorship, not user approval. Source runtime claims cite SRC-ABILITY-MATRIX-4c4a1eb at commit 4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451.

## World clock and scope
The continent shares an authored calendar vocabulary, while each server region owns its event progression. A deterministic seed, climate profile and world-time bucket choose eligible weather; player actions can change only explicitly bounded event modifiers. Day/night changes light, selected NPC routines and some resource windows without removing core quest access. Seasons are scheduled content states with a publishable start/end and fallback acquisition routes. Their length and relation to real-world time are open decisions.

Climate follows the proposed world graph: western moisture and the Graft lowlands, the Rime/Storm/Fault ridge, rain-shadow eastern lands and distinct central/eastern watersheds. Weather respects adjacency and elevation; no global flip to snow because one player casts Frost. Region-edge blending is visual and forecast-driven; boundary crossings use hysteresis to avoid repeated spawn/despawn and weather bonuses.

## Weather state machine
Clear → forecast → transition → active condition → easing → clear/next condition. Each state has intensity, precipitation, wind vector, visibility floor, lightning eligibility and temperature band. Gameplay uses coarse authoritative categories, not individual rendered particles. The client generates cosmetic precipitation from the seed. The authority owns slippery authored surfaces, route warnings and interaction permissions.

Weather cannot hide minimum attack telegraphs, disable a required color/sound channel, compel a photo-sensitive effect, or trap a character in an inaccessible route. High wind uses alternate ground traversal; severe cold grants nearby shelter and baseline supplies; gravity/time anomalies are authored volumes with readable entries and exits.

## Event scheduling and overlap
WORLD_EVENT_REGISTRY defines fifteen proposed regional events. Each follows forecast, activation, response, resolution, reconstruction and cooldown. Fixture timers are hypotheses, not a live schedule. A regional concurrency limit reserves one major infrastructure event and two minor encounters at a time. Critical paths, housing access and rescue services have protected tags. An overlap arbiter postpones incompatible events instead of allowing cascading road failures.

A source Oath's presence does not imply hostility. Dynamic conflict can concern water distribution, access to knowledge, safety regulation or disputed infrastructure, with multiple legitimate positions. Participation may support evacuation, research, negotiation, craft or fighting. A faction is a society with competing concerns, not a resource dispenser or universally villainous enemy group.

## Ecology and migration
Track habitat capacity, food pressure and population bands, not individual persistent animals continent-wide. Local encounters instantiate creatures from those bands with bounded spawn budgets. Hunting/gathering consumes a replenishing regional allowance and changes short-lived presentation; it cannot exterminate a species or deny another player essential materials. Resource nodes provide personal or contribution-aware yields to avoid last-click theft.

Migration is an authored corridor event tied to seasons, water and disturbance. Herd movement uses server waypoints and client animation; protected crossings offer detours for people and animals. Predation and disease are encounter motifs, not uncontrolled whole-world simulations. Graft restoration, Bitterglass remediation and other Oaths' civic work all have independent value.

## Infrastructure and NPC routines
Each bridge, relay, sluice, shelter or lift has baseline, stressed, degraded, rerouted and reconstructed states with an explicit service floor. Degraded states are authored mesh/collision swaps or overlays. Nav updates apply only after validating a connected rescue path. Named NPCs relocate by stable id to staffed fallback points; personal quest versions follow them. Event failure opens an alternate story beat or temporary opportunity rather than deleting the quest.

Reconstruction consumes confirmed contributions from a project ledger; players may contribute only their own goods or explicitly shared treasury permissions. Low population never prevents eventual recovery. A deadline restores essential services automatically, while participation can unlock appearance variants and earlier optional capacity. Recovery does not mint more goods than the input ledger authorizes.

## Economy and housing links
Events change only clamped regional production/transport modifiers, not arbitrary market confiscation. A damaged primary route activates a verified alternate road/portage/ferry. Private home inventory is outside event damage. Visual flooding, ash or frost can affect an exterior facade within the lease's safe presentation envelope; owners retain a stable entry and recovery menu.

## Verification
Test interrupted phases, failed objectives, no participants, crowded participation, simultaneous region events, cross-region travel, reconnect, version migration and localized warnings. Geography validation proves graph routes, not final-world navmesh traversability. Production validation requires route playthroughs, encounter load tests and accessibility sessions; these are not complete from documentation.
