# World ecology system

Status: PROPOSED Phase II refinement. Sources: P2-SRC-FOUNDATION, P2-SRC-DIRECTIVE, P2-SRC-PROPOSAL. [Read-only foundation](https://github.com/jrmoyler/Aetherion-The-Fifteen-Oaths/tree/5dce9edae0bb3587eb7c72433395e7d5a19857ea/AETHERION_CANON). All numbers are prototype design hypotheses; no profiling, engine implementation, assets, or founder approval is claimed. Existing IDs and source castable behavior are preserved.

## Scope: understandable feedback, bounded simulation

Refines foundation 13_WORLD_EVENTS/LIVING_WORLD.md, 14_LIFE_SKILLS_AND_ECONOMY/LIFE_SKILLS_AND_ECONOMY.md and contract-climate-ecology. REGIONAL_ECOLOGY_PROFILES.json owns fifteen proposed habitat deltas. Existing creature IDs and their natural/mount/boss distinctions remain authoritative references; this package does not create completed creature assets or turn ordinary species into magical monsters.

Use deterministic aggregate habitat state plus authored local encounters, not a full food web, fluid dynamics, continuous animal genealogy, worldwide individual AI, disease epidemiology or emergent economic equilibrium. Weather, food pressure and human disturbance select bounded bands. Players should observe consequences through changed nest occupancy, forage strips, water gauges and work orders. A population-band change is not proof that every visible animal was individually simulated.

## State and update contract

Authority key: world_version + shard_id + region_id + habitat_id + season_epoch. Record seed, last_committed_world_tick, moisture_units, forage_units, habitat_capacity, population_units by approved species band, disturbance_units, harvest_allowance, migration_reservations and version. All units are integer abstract accounting quantities; carrying capacity and conversion coefficients remain tuning data, not measured ecology.

Proposed world_tick is a monotonic server second. Recompute aggregate ecology at 60-second boundaries; local AI may react faster but cannot write aggregate stocks directly. Stable sorted IDs resolve ties. Randomness is keyed by seed, epoch, habitat and decision kind so adding a cosmetic actor never shifts economic outcomes. Versioned coefficients and seed must reproduce the same state from the same ordered command journal. A region transfer uses paired debit/credit receipts committed once, never an independent spawn at each end.

Prototype equation order:
1. Read committed weather/routed-water inputs and infrastructure accessibility.
2. Apply authorized migration debit/credit, then reserved harvest receipts.
3. Apply bounded forage renewal from moisture and season; debit consumed forage.
4. Compute births/recruitment and natural mortality as declared ledger sources/sinks within capacity. No negative stocks; excess births are not silently recycled into loot.
5. Update disturbance and habitat recovery; classify observable bands.
6. Commit state plus explanation codes; clients select approved visual variants.

Conservation identity: next stock = prior stock + declared regeneration + incoming transfer - consumed - harvested - outgoing transfer - declared losses. A band is a compressed indicator, while stock arithmetic remains separate. Quantization remainder is retained in a region accumulator so repeated rounding cannot manufacture material. Natural reproduction is a named source, not an unexplained balance mismatch. Harvest quota replenishment does not itself create inventory: a successful receipt debits allowance and mints exactly the approved recipe/raw-resource yield once.

## Food webs and migration

Each habitat has producer, browser/filter-feeder, predator/scavenger and decomposer roles where locally credible. Absent roles are allowed; do not force four decorative species into every room. Natural species stay within baseline creature concepts until approved variants exist. Predation changes aggregate pressure at scheduled updates; no runaway predator spawning or permanent local extinction from players. Wildlife hostility requires disturbance/defense/explicit encounter context rather than elemental allegiance.

Migration scheduler: eligible seasonal window → reserve source population → confirm passable authored corridor → travelling group → destination accepted → release reservation. Failed route check returns the same reserved population to source or a certified refuge band. Visible herd actors are projections of that reservation, not lootable duplicate stock. Crossing closures reroute people through a conventional path; wildlife is never forced into boss/PvP arenas. If player activity interrupts a scene, finish the transfer offscreen and preserve its receipt rather than restarting at the origin. REGIONAL_BIOME_SPECIFICATIONS lists fifteen distinct local movements.

## Farming and husbandry

Plot state: seeded → tending → growing → ready → harvested; caretaker dormancy is an orthogonal safety flag. Seed/input reservation occurs at confirmed planting. Moisture and temperature bands alter completion within declared limits; severe weather pauses rather than destroys an absent player's garden. Crop health is readable through text, shape and soil-state icons, not leaf color alone. At most one capped harvest lot accrues during absence; no unlimited offline farm, surprise debt or animal death. Reconnection previews elapsed progress and the remaining inputs. Harvest and crop replant cannot both consume the same lot.

Husbandry uses forage, rest, shelter and transport-load bands. Animal care grants skill receipts for meaningful inspection, feeding and route planning, not repetitive button spam. Mount entitlement is separate from ecology population and cannot be confiscated by an event. Breeding, slaughter or permanent individual animal loss require a separate approved design; they are not assumed here. Region 12 packhorn workload and region 07 rootpath hart forage have practical differences rather than palette swaps.

## Fishing, hunting and gathering

Fishing: inspect nursery/season notice → choose open pool → accessibility-equivalent timing or planning interaction → verify personal allowance → issue catch receipt. Closed nurseries still provide observation/conservation tasks and equivalent staple recipes elsewhere. Region 04 brackish nurseries differ from region 08 filter pools; hazardous fictional reagent water is not a food fishery by default.

Hunting: authored legal target and quota → track without forcing combat → optional hunt or nonlethal survey alternative → server receipt → population/allowance debit. Reward conservation and trail knowledge at comparable effort; no mass-killing requirement to unlock ecology. No last-hit or carcass ownership race. Gathering distinguishes renewing shoots, mature harvest and seed reserve. Necessary quest materials have a personal allowance and ordinary NPC fallback, protecting them from organized depletion.

## Disasters, emergencies and recovery

Natural weather can qualify a hazard window but never directly execute a major disaster. WORLD_EVENT_REGISTRY owns warning, activation safety gate, response, resolution, reconstruction and cooldown. Regions 01/04/05 carry different volcanic, tidal and ground-instability stories; regions 07/08 separate overgrowth from spill response. Physical hazards remain distinct from bounded Oath exceptions. A continent-wide cascading catastrophe is out of scope.

Recovery first restores essential passage, NPC access and water/food service; cosmetic repair and optional capacity follow. Habitat recovery must clear the cause before increasing the visible band: dumping removal before burrow occupancy, nursery cover before fish abundance, clean circulation before crawler recovery. A public progress panel says which job changes which state. Recovery is guaranteed at a deadline even with zero players; contributions can accelerate optional benefits but cannot hold essentials hostage.

## Offline, streaming and restart

Unloaded cells do not run individual wildlife AI. Aggregate state advances from the durable tick in bounded batches: at most 24 one-hour catch-up steps in one load transaction, then converge only non-economic presentation to the scheduled seasonal baseline. This is an approximation, explicitly not exact replay of months of animal activity. Player-owned crops retain their single capped harvest and caretaker safety. No reward, harvest or cargo arrival is inferred merely because a scene streamed twice.

Persist journal receipts before materializing actor changes. A server restart resumes the last committed aggregate revision; stale dangerous event phases advance to reconstruction. Doubtful transfers remain reserved and unavailable until reconciled. Content migration records old/new coefficients and does not reinterpret already-issued receipts. Corrupt habitat state restores an approved safe baseline without deleting inventory; the reconstruction adjustment is a named non-tradable system source/sink in the audit ledger.

## Abuse and privacy boundaries

Players submit intents for local approved tasks only. Reject arbitrary stock writes, forged time, harvest outside radius, duplicate socket use and cross-region receipts. Spectators and repeated actions cannot raise event objectives. Cross-player damage and player construction cannot obstruct protected wildlife crossings or public refuges. Contribution limits apply per economic account while preserving accessible input methods; input speed alone is not an abuse verdict. World presentation never exposes another player's inventory or private story branch.

## Prototype budgets and proof obligations

Unprofiled targets: maximum eight aggregate habitat cells per region, eight species/role bands per cell, 60-second aggregate tick, 64 active local ecological actors per loaded cell, and eight simultaneous detailed migration leaders; distant herd members are non-authoritative visual instances. Terrain/streaming budgets may lower these ceilings. Aggregate ecology work target is 2 ms p95 per region update on declared reference server hardware; not a measured result. Degrade cosmetic density first, then queue nonessential AI; never omit ledger validation, hazard signs or refuge routing.

Acceptance: deterministic replay hash matches; stock equation balances across births/deaths/harvest/migration; duplicate/reordered intents mint nothing; day/season transition never strands a herd or traveler; zero-player recovery completes; 90-day offline load preserves possessions without economic windfall; two-region handoff cannot double a herd; all fifteen habitat closures have accessible alternatives; 10× load retains authority checks. Actual profiling, conservation simulation and player accessibility sessions remain OPEN.
