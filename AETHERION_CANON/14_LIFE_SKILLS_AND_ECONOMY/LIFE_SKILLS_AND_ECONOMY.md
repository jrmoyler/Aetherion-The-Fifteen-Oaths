# Civilian professions and cross-realm economy

Status: PROPOSED implementation design, except explicitly identified user-established foundations. Numerical values are bounded prototype hypotheses, unvalidated by playtests or profiling. These documents do not change imported Ability Matrix behavior.

Sources: SRC-USER-DIRECTIVE; SRC-RECOVERED-LORE; SRC-SYSTEMS-PROPOSAL. The first two establish the fifteen covenants and broad game pillars. SRC-SYSTEMS-PROPOSAL identifies design authorship, not user approval. Source runtime claims cite SRC-ABILITY-MATRIX-4c4a1eb at commit 4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451.

## Principles
Every Oath provides a livelihood, public service and production expertise in ECONOMY_REGISTRY. Fifteen regional profiles specify thirty civilian professions and fifteen export families. None exists only as an ingredient for another faction. Resource names are proposed commodity families, not claims of implemented items. Specialization creates useful trade without forcing a single region to monopolize basic food, shelter, healing or travel.

## Progression and craft
Gather → inspect → prepare → assemble/tend → quality-check → deliver or use. Each recipe declares inputs, station capabilities, skill threshold, time, output quantity, byproducts, salvage and failure floor. Early crafts teach one decision; advanced crafts trade weight, durability, efficiency, appearance or resource efficiency. Failure returns a declared salvage floor and feedback; never an unexplained full wipe. Repeated automated actions give diminishing mastery, while meaningful commissions and repair provide alternatives.

Farming/husbandry use weather and seasonal bands with crop/animal welfare ranges. Missed sessions put gardens and animals in a safe dormant/caretaker state rather than killing them. Fishing and harvesting use renewable quotas and habitat cues; accessibility modes replace rapid reaction inputs with equivalent decisions. Cooking supports expedition preparation and hospitality. Music, surveying, conservation, chemistry, engineering and transport each produce accountable service receipts as well as objects.

## Supply graph
WORLD_RESOURCE_FLOWS enumerates neighbor-to-neighbor trade and an alternate multi-hop route for every directed edge. All routes reference proposed geographic adjacency. A hop's road/ferry/portage asset and capacity remain to be validated against the final map. Farther markets consume/transship through these hops; teleport travel cannot silently make freight weight irrelevant. Personal catch-up delivery may abstract a journey without creating goods.

Inputs have origin and lot identifiers; finished items carry recipe version and material provenance sufficient for rollback and exploit investigation, without exposing another player's private identity. Logistics contracts declare cargo, source, destination, deadline, fee and loss/recovery policy before acceptance. Ordinary PvE freight has insured recovery of essential quest goods. Cargo raids occur only under an explicit competitive contract; a player cannot involuntarily lose home storage.

## Market and ledger
Prototype market: regional order books or an NPC price board, with atomic escrow for listings and two-party trades. Products are gameplay items only; no real-money trading, financial instrument or blockchain is implied. A listing holds item instances in escrow; cancellation, fulfillment and expiry are mutually exclusive terminal transitions. Fees and delivered quantities are previewed. Duplicate network messages use the original receipt.

Money sources: finite authored commissions, encounter rewards and legitimate trades. Sinks: consumed components, optional cosmetics, transparent station services and elective convenience. Core housing ownership and essential recovery are never dependent on perpetual payments. No premium currency, subscription, auction fee rate or monetization has been approved.

Event supply shocks use a proposed 0.8–1.2 reference-price clamp and short, announced recovery. This is an initial simulation bound, not a final economic balance. Price and inventory histories need offline simulation under low/high population, coordinated hoarding and new-player entry. Essential NPC supply floors and alternative recipes protect playability. Do not promise a self-balancing economy.

## Ownership and abuse prevention
Transactions use server-issued item ids, account/character ownership, inventory revision, bounded quantities and idempotency keys. Reject negative/overflow amounts, duplicate instances, stale revisions and impossible recipe inputs. Detect rapid circular trades and duplicate rewards for investigation without automatically punishing shared households or accessibility users. Rate limiting must publish a retry condition and retain escrow safely.

Crafting services require an explicit customer contract or local NPC interaction. A workshop guest cannot spend an owner's goods unless granted bounded access. Guild treasury permissions separate view, contribute, craft and withdraw, with owner-visible receipts. Trade disputes resolve through compensating transactions; no silent deletion of player assets.

## Public-good production
Reconstruction, sanitation, rescue, archival access and habitat stewardship pay transparently from authored event budgets. A civic job has alternative tasks for combat and noncombat specialists, but does not require an allegiance oath. Local institutions may subsidize trusted members while neutral travelers retain baseline services.

## Required tests
Closed-economy simulation: resources and currency obey ledger conservation; no zero-input profitable recipe cycles except explicitly budgeted reward sources. Test all recipe dependency cycles, shortage fallback, alternate-route reachability, listing races, partial delivery, crash/reconnect, maintenance downtime and localization of quantities. Human review must assess tedium, fair solo progression, market manipulation and meaningful civilian play.

## Typed production closure
PRODUCTION_RECIPES provides fifteen explicit recipes, one per region, each with a local raw input, two imported refined resources, named supplier/route, output quantity, actual civic use, downstream consumers, craft station and shortage fallback. Thirty route records represent actual recipe-input demand; other neighbor routes are optional transshipment capacity rather than invented buyers.

Refined resources intentionally form an interdependent economic network, not a dependency-free tree. Every normal cycle consumes local raw allotment and labor; initial finite NPC stock seeds circulation. A lower-yield, non-tradable essential-service fallback uses additional local raw/labor and cannot enter standard recipes. This prevents a startup deadlock and total service denial without removing the value of normal trade. All bundle quantities and opening stock remain unbalanced fixtures. A resource-flow simulator must establish stability, pricing and low-population behavior before production approval.
