# NPC civilization system

Status: PROPOSED Phase II refinement. Sources: P2-SRC-FOUNDATION, P2-SRC-DIRECTIVE, P2-SRC-PROPOSAL. [Read-only foundation](https://github.com/jrmoyler/Aetherion-The-Fifteen-Oaths/tree/5dce9edae0bb3587eb7c72433395e7d5a19857ea/AETHERION_CANON). All numbers are prototype design hypotheses; no profiling, engine implementation, assets, or founder approval is claimed. Existing IDs and source castable behavior are preserved.

## Intent and authority

Refines foundation character services, civilian economy, living-world and housing contracts. Named characters retain baseline IDs, motivations and personal quest outcomes. A daily schedule is a presentation of work and relationships, not permission to kill, replace, secretly duplicate or make a character unavailable forever. Institutions govern allocation, appeal and emergency response; no civilization is a single elemental temperament.

The server owns activity stage, service location, inventory/escrow and event-role assignment. Clients own crowds, gestures, ambience and distant traffic silhouettes. True individual simulation is reserved for currently observed interactions. Unloaded citizens use aggregate workforce/task slots; loaded actors materialize from stable IDs with no extra salaries, inventory or quest resets. A market crowd is not automatically a set of simulated customer orders.

## Daily schedule and priority

Use the proposed 120-minute day/four-daypart fixture from DYNAMIC_WEATHER_SYSTEM; actual pacing requires approval. Every actor has home anchor, work anchor, social/rest anchor, safe anchor, current activity, activity end tick, interruption reason and service proxy policy. Core quest conversations are available through a staffed counter, message appointment or stable fallback location while the principal rests. Never silently clone a named person at two counters; a clearly identified deputy provides service without impersonating private story dialogue.

Priority order: immediate safe refuge → consented player interaction already in progress → event role → essential service shift → scheduled job → leisure/rest → cosmetic ambient variation. Conversation locks have a bounded timeout and do not stop evacuation; transfer safely with a clear notice. A closed shop shows its next opening and a basic-service deputy. A NPC is not required to work all day just to avoid a quest lock.

Activity state machine: planned → travelling → arrived → working/social/resting → wrapping → next planned. Route invalidation produces waiting at a safe waypoint, then rerouted travel or a signed service relocation; never disappearance. Streaming can materialize a distant completed journey only outside player observation and after the authoritative arrival receipt. A visible journey cannot teleport across the player's view to meet a schedule. On restart, a stale trip resolves at its nearest approved safe anchor, not inside hazards.

## Fifteen local work patterns and civic institutions

1. Kiln workshop assemblies publish furnace shifts. Cool-court communal meals precede hot work; vent inspectors and apprentice repair classes share safer hours. Ashbridge repair markets match imported food and tools to work schedules.
2. Rime collection councils separate custody from access. Warm reading rooms open while vault staff rotate; copying, food preservation and insulation repairs fit brief outdoor thaw windows. A closed vault never closes all knowledge access.
3. Storm tower cooperatives reserve emergency message slots. Dawn cable checks, sheltered listening hours, courier departures and roost-sleeve inspections make communications tangible. Commercial priority cannot consume the emergency queue.
4. Tidal watershed and harbor assemblies share flow records. Fishery crews follow safe tides, canal maintainers use dry windows, and household water distribution continues during lock repair. Market opening shifts are announced before ferry changes.
5. Fault terrace councils publish load maps. Survey quiet hours alternate with quarry vibration; mushroom-room ventilation and stair repair are ordinary jobs. Independent inspectors can challenge extraction plans.
6. Reed performance commons coordinate garden work, weaving and captioned public notices. Exposed flight windows avoid breeding routes; evening performances have ground-level access. Sound expertise does not exclude deaf citizens.
7. Graft tending circles rotate glade grazing, graft inspection, fruit collection and communal meals. Conservation crews distinguish invasive blockage from valuable habitat; imported tools and winter food reserves matter.
8. Bitterglass laboratories share water tests with resident councils. Closed-vessel work, filter changes and independent sampling occur on separate shifts; markets label fictional reagent handling and never mix it silently with food.
9. Daybreak sanctuary councils rotate clinic, meadow and ward-maintenance work. Evening light limits protect residents and wildlife; need-based relief counters remain available irrespective of Oath standing.
10. Observatory research circles require inhabited-platform consent. Dry-weather observations alternate with grounded maintenance, supply receipt and roost monitoring. Prestigious experiments cannot displace conventional public travel.
11. Missing Court benches separate registry, protective custody and adjudication. Fixed-address service shifts coexist with private offices; public counters disclose service status without exposing protected identities.
12. Sanguine kin assemblies publish rest guarantees and pasture rotations. Food, fiber, pack transport and communal cooking support voluntary rites. Anyone can stop ritual participation and retain relief access.
13. Folded Theatre troupes publish a stage charter. Carpentry, rehearsal, costume markets and plain-route inspections precede performance; closing a show preserves fixed exits and ordinary commerce.
14. Escapement route communes schedule rest stops, cargo dispatch, clock checks and wildlife crossings. A delayed departure is preferable to unsafe acceleration; merchants cannot force exhausted crews to work.
15. Impulse worker and settlement councils inspect modular machinery before production. Salvage sorting, drainage cleaning, component markets and manual backup shifts make maintenance visible; emergency authority expires with the job.

## Farming, fishing, hunting and work orders

WORLD_ECOLOGY_SYSTEM owns biological stock/allowance; NPC jobs consume the same authorized ledger resources as player recipes. A farmer's visible hoe animation cannot mint grain. NPC worker output is a bounded authored production budget with stated raw inputs and labor capacity. Fishers respect nursery closures, hunters use quotas, carers use forage and rest. If labor/input is absent, the job waits or produces a declared lower-capacity non-tradable essential fallback. Avoid circular recipes at startup by retaining foundation finite seed stock and fallback-recipe-NN rules.

Construction project: proposed public plan → approved sockets and service detour → reserved materials → staged assembly → safety inspection → commissioned → maintenance. Each stage exposes exact input lots, responsible institution and accessible task alternatives. Project completion is one atomic receipt; duplicate contributions cannot construct twice. Half-built geometry uses validated collision and safe walkways. Players may only contribute owned goods or explicitly permitted shared supplies. There is no implied authority to drain guild storage.

Maintenance tracks a small condition enum good/stressed/degraded/rerouted/recovered. Debris removal, drainage, insulation, cable checks, soil tending and bearing inspection are distinct task verbs. Optional capacity can lapse; essentials recover automatically by posted deadline. Private home upkeep pauses bonuses, never evicts, destroys possessions or accumulates debt. Continent road topology is not dynamically deleted by a work order.

## Markets, merchant travel and trade caravans

Use baseline ECONOMY_REGISTRY, PRODUCTION_RECIPES and WORLD_RESOURCE_FLOWS. Fifteen resource families and 30 recipe-demand routes remain unchanged. A NPC price board is the default prototype; a player order book is a later contract option. Prices use the foundation 0.8–1.2 event reference clamp; this is a tuning bound, not economic validation. Essential stock floor is a finite replenishment budget with provenance and a non-tradable fallback when the standard supply cycle stalls.

Merchant state: restock order → cargo escrow → departure inspection → route reservation → travelling → arrival inspection → inventory release → market shift → rest. A caravan has cargo lot IDs, quantity, current hop, origin/destination, route version, deadline, reserve/delivery/recovery receipt and escort consent. Physical freight follows baseline neighboring hops and approved alternate multi-hop routes; no new river route or teleport exemption is inferred. Animated carts represent that cargo ledger, not additional copies.

Weather or an event can postpone departure or reserve an alternate hop. On a destroyed/invalid optional route, return escrow or move it into insured recovery before releasing replacement stock. Delivery and compensation are mutually exclusive terminal outcomes. Normal PvE essential cargo has insured recovery; PvP raids require an explicitly opted-in competitive cargo contract outside civilian service routes. Caravan visuals cannot be attacked to loot another player's escrow. No player can monopolize the one merchant carrying mandatory quest materials.

Trade transaction identity: request_id + actor + expected_inventory_revision + lot_id + quantity + price_revision. Reserve goods and consideration atomically; commit once, otherwise release. Cancellation, fulfillment and expiry compete for one terminal state. Currency comes only from finite authored rewards or another ledger account; cosmetic market bustle creates none. Audit money sources/sinks, materials, salvage and treatment waste separately. Never equate resource throughput with universal civilian wellbeing: a profitable armament shift can still crowd out repairs.

## Patrols, conflict, festivals and invasions

Patrols: a protected civic circuit watches public infrastructure, signals hazards and escorts consenting crews. Offscreen patrol is a schedule token; local encounters instantiate bounded actors. Patrol alignment is not permission to attack neutral travelers. Public notices distinguish inspection, dispute and actual danger. Requests to leave an optional exclusion have time, distance and accessible text cues; no instant punishment for a streaming delay.

Conflict: water allocation, work quotas, sealed knowledge, testimony and experiment consent generate negotiation or investigation scenes. Shared event outcomes do not rewrite a player's personal faction decisions. Combat is optional unless the player enters a clearly marked combat activity. PvP remains separate at p2-poi-NN-pvp, with visible opt-in and exit; no regional event toggles it automatically.

Festivals: schedule announced preparation, accessible opening, performance/market, cleanup and return-to-work. Reed and Folded Theatre events already attach to distinct public performance failures. Other regions can propose repair fairs, archive reading days or harvest markets, but no additional named canon festival or live schedule is established here. Weather can move a festival to its certified refuge venue; reduced audio/flash and equivalent captioned activities persist. Exclusive attendance cannot gate core power or story access.

Invasions: a proposed bounded event family, not fifteen additional implemented events. Stage warning → optional perimeter defense/evacuation → finite waves or negotiation → ceasefire → reconstruction. Only authored hostile groups with specific goals participate; never portray all residents of an Oath as invaders. Arena/perimeter placement requires the region worker's approved optional combat footprint and cannot occupy a capital's essential service spine. One regional major-event lease means invasion and infrastructure disaster do not run simultaneously. No involuntary PvP, private house destruction, permanent NPC death or loss of home contents. A named invasion roster, enemy assets, timing and political consequences remain explicit OPEN authoring work.

Emergencies: the fifteen registry entries are executable-style design contracts with counted objectives and Boolean safety conditions. Repeatable outcomes offer repair or optional discoveries rather than deciding permanent personal quests. Refuge NPCs keep the same IDs; their public location updates before the original service point closes. The event pool rewards civic, survey and logistics work without requiring combat or Oath binding.

## Event determinism and safety arbitration

One major infrastructure/disaster/invasion event and at most two minor encounters per region are proposed ceilings. The arbiter grants a lease on catchment and optional-route resources only after verifying essential routes, housing access and staffed fallback points. Neighbor events share route reservations so two apparently safe closures cannot jointly disconnect a capital. If no safe lease exists, postpone rather than force a spectacle.

Every WORLD_EVENT_REGISTRY phase has a monotonic phase_revision and reentry key. Guards are evaluated in order: safety abort, objective success, deadline setback. Success and timeout at the same tick choose success only if all objective receipts committed before that tick's evaluation. Counters accept one contribution per distinct socket and clamp to their stated goal. Fixture goals are intentionally fixed; crowd size and late arrivals never inflate them. One player can perform all noncombat goals sequentially, subject to playtest of the ten-minute response. A server population scaling extension must be reviewed separately.

The six phases and bounded timers preserve foundation IDs. On zero participation, fixed deadline moves to setback, then guaranteed reconstruction. Restart replays a committed phase or advances stale danger to recovery, preserving receipts. Cooldown clears transient objectives but not inventory, personal story, cargo or prior reward receipts. Reward budget of 100 civic-credit units per event is a bookkeeping fixture; 10-unit account cap and equal verified task receipts prevent last-hit monopolies. No real currency or final progression values are specified.

## Accessibility, privacy and prototype performance

Readable activity labels, next-opening notices, route maps, text-to-speech-friendly task lists and controller-accessible contribution panels are mandatory. No task requires rapid tapping, pitch discrimination, camera shake or color alone. Player-submitted names/text require moderation and are never used as authoritative IDs. Public NPC actions cannot expose a player's private choices or inventory.

Unprofiled targets per loaded settlement cell: 24 full schedule/interaction NPCs, 96 cheap cosmetic crowd projections, eight simultaneously pathfinding merchants/patrol leaders, four detailed caravans; farther groups use route tokens. Schedule decisions at 1 Hz, expensive path requests capped at eight per second per cell, event objective checks up to 10 Hz only for nearby interactions. Event/NPC simulation target 3 ms p95 server time per active cell under a declared reference hardware trace. No benchmark is claimed. If overloaded, queue cosmetic travel and reduce crowds; preserve services, ledger checks, warning periods and already-accepted tasks. Coordinate with WORLD_STREAMING_ARCHITECTURE.md if that file exists; these subsystem ceilings never override a tighter global budget.

## Tests and unresolved gates

Test schedule interruptions in every daypart; missing nav; merchant disconnected mid-delivery; restart between escrow and receipt; two-event route conflicts; missed season/festival; zero population; duplicate/reordered contributions; leader absent with staffed essential counter; no private-story reset; cargo compensation/delivery race; 10× crowd load with low effects; voluntary ritual withdrawal; Oath-neutral path through every capital. Required human review: pacing, regional institutional nuance, source-adapter semantics, content tone, solo task duration, economic stability and accessible navigation. Source castable inspection is static only; none of these documents declares production gameplay or finished assets.
