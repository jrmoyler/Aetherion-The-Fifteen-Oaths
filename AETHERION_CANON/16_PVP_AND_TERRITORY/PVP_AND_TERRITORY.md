# PvP, sieges and recoverable territorial change

Status: PROPOSED implementation design, except explicitly identified user-established foundations. Numerical values are bounded prototype hypotheses, unvalidated by playtests or profiling. These documents do not change imported Ability Matrix behavior.

Sources: SRC-USER-DIRECTIVE; SRC-RECOVERED-LORE; SRC-SYSTEMS-PROPOSAL. The first two establish the fifteen covenants and broad game pillars. SRC-SYSTEMS-PROPOSAL identifies design authorship, not user approval. Source runtime claims cite SRC-ABILITY-MATRIX-4c4a1eb at commit 4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451.

## Entry and participation
Castle sieges, node wars and three-way conflicts are intended pillars from recovered lore; their rules here are proposed. Combat participation is explicit, scheduled and mode-scoped. Choosing an Oath, wearing its equipment, traveling in its region, owning a home or joining a public event never automatically flags the player. Neutral artisans can supply protected public reconstruction or explicitly accept a risk-bearing competitive contract after seeing its terms.

Team membership is a match-specific allegiance; it does not rewrite personal pacts or institutional reputation without an authored, previewed consequence. Provide a practice mode and spectator privacy rules before ranked/seasonal deployment. No rated ranking system or matchmaking formula is approved yet.

## Objective grammar
Castle: outer supply/approach → whitelisted defensive segments → interior objective → held claim window. Destroyed walls create authored lanes, not arbitrary holes through collision or quest spaces. Siege equipment requires crew, ammunition, traverse limits, warning and exposed repair/disable opportunities.
Node: linked civic services with several simultaneous objectives. Controlling one creates a reversible advantage, never closes all continent travel. Capture requires eligible presence and a contest timer; stealth alone cannot silently flip a node without visible warning.
Three-way: independent objective scoring and multiple fronts, with explicit tie-break and anti-stalemate timers. Design routes so any team has at least two safe exits and more than one useful target. Test collusion, two-team pressure and low-population imbalance before declaring the mode fair.

## Match lifecycle
Announce region/window/eligibility → register and disclose stakes → form teams and validate resources → muster in protected areas → commit match version → contest → determine one outcome → write territory lease → reward exactly once → reconstruct → cooldown. Late join rules preserve declared team identity and score eligibility. Abandoned matches transition to recovery after a deadline; no region waits forever for a winner.

Initial test fixture is 16 players per team, not a claim of MMO capacity. Start a two-team slice before a 48-player three-way test. A future larger siege requires new profiling, network, visibility and encounter readability evidence.

## Supply and repair
Supply points consume versioned ammunition and construction stock reserved from the team's explicitly accessible inventory. Supply is visible and interceptable only in opted-in match lanes. Craftspeople can deliver through a protected lower-reward civic channel or accept a competitive delivery. Repair is capped per phase and needs a vulnerable channel or exposed worker; it cannot instantly undo every attack or indefinitely prolong the match.

A team cannot commit another player's private resources. Guild withdrawals require explicit permission, reason and receipt. Match cancellation refunds unconsumed reserved supplies; consumed legitimate ammunition remains consumed under the previewed rules.

## Respawn, control and combat readability
Server-authoritative team/rally ownership chooses respawn. If a rally is camped or nav-disconnected, select a fallback before spawning. Use exit protection that ends on attack, a limited duration or leaving its zone; it cannot be exploited to damage enemies safely. Players always have a protected withdrawal path that forfeits immediate objective contribution without trapping the character.

Use HYBRID_COMBAT's shared hard-control and displacement ceilings. No siege knockback can throw a player outside recoverable navigation. Audio/visual density budgets reserve space for objective warnings, friendly/enemy identity, hit direction and evacuation cues. Hostile illusion preserves an inspectable tell; reduced-motion and lower-detail modes retain the same competitive information.

## Territorial authority and persistence
A successful match grants a time-limited administration lease over specified services and fortification sockets. It can select a visual banner, funded improvement or bounded service policy. Essential prices, travel, housing entry and main-story services stay at a protected floor. Winning is not permission to change every civilian's allegiance, expel owners, destroy resources permanently or write arbitrary world geometry.

Store season id, node id, current holder, effective interval, contest revision and selected improvements. If the settlement writer fails, replay its single durable receipt; never award two holders. Personal quest/canon branches remain independent from live administrative control.

## Anti-grief and moderation
Reject attacks across protected boundaries, hostile effect laundering through neutral allies, object placement blocking exits, spawn camping without fallback and repeated contribution spam. Log authoritative decisions for investigation. Rate limiting and detection signals do not prove misconduct alone. Provide accessible report/mute/block flows; enforcement policy and appeals need separate approval.

## Destruction and reconstruction
Author asset stages intact → damaged → breached → secured → repaired. Each has validated collision, nav links, cover, VFX, sound and stable socket IDs. Choose a stage atomically; do not deform arbitrary terrain or simulate all debris over the network. Cosmetic debris is pooled and client-local after a server outcome. Public reconstruction can accelerate optional restoration, but a service deadline automatically restores baseline paths and functions.

Acceptance requires all three mode scenarios in PVP_MODE_CONTRACTS plus: rollback at each settlement boundary; late join/rejoin fairness; no neutral flag escalation; no storage loss; every destructible stage navigable; every essential service restored after all participants leave.
