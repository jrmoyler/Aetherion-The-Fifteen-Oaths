# Stillfolio — capital construction blueprint

Status: PROPOSED. Sources: P2-SRC-FOUNDATION, P2-SRC-DIRECTIVE, P2-SRC-PROPOSAL. Capital ID poi-02-capital; region region-02. [Baseline dossier](https://github.com/jrmoyler/Aetherion-The-Fifteen-Oaths/tree/5dce9edae0bb3587eb7c72433395e7d5a19857ea/AETHERION_CANON/04_OATH_DOSSIERS/02_RIME_ARCHIVE.md). This plan refines the foundation; it is not an implemented city.

## Site and provisional dimensions

Stillfolio terraces into a sheltered glacial valley on rock foundations. Libraries bridge around ice movement instead of assuming glaciers are permanent bedrock; evacuation stacks can be moved before a shelf becomes unsafe.

Plan form: paired rock benches along a glacial valley. Orientation: valley-floor warm street with parallel rock-founded archive bench. Target outer envelope 1200 × 700 m; target maximum internal relief 30 m. All metres are provisional blockout targets. District rectangles overlap in vertical layers; they are envelopes, not cadastral parcels. Final terrain, grades, route lengths, capacity, accessibility and simulation require validation. Relative heights establish a first section for critique, not automatic street grades. Where an adjacency changes height, insert a validated ordinary ramp, conventional lift with evacuation fallback, or contour path; reject infeasible ramps rather than hiding them behind magic.

## District program and adjacency

Districts follow local functions and physical constraints. They are not independent towns, equal-population wards or asset-count quotas. Edges below are undirected public links, separate from optional shortcuts.

### Melt Exchange (p2-district-02-melt-exchange)

Function: cold-chain freight and public lodging. Functional envelope range 250–350 m wide × 200–300 m deep; relative terrain layer -5 to 5 m. This range follows the work, civic or household program and is not a property boundary. Direct neighbors: Warm Index, Rock Stacks. Keep two independently signed public entries. Main thresholds show purpose and service availability before entry; private work yards cannot become a compulsory through-route. Use p2-arch-02-rime-vaults; fixtures follow the district function rather than generic elemental decoration.

### Warm Index (p2-district-02-warm-index)

Function: public records and appeals hall. Functional envelope range 150–250 m wide × 150–250 m deep; relative terrain layer 5 to 15 m. This range follows the work, civic or household program and is not a property boundary. Direct neighbors: Melt Exchange, Binding Row, Rock Stacks. Keep two independently signed public entries. Main thresholds show purpose and service availability before entry; private work yards cannot become a compulsory through-route. Use p2-arch-02-rime-vaults; fixtures follow the district function rather than generic elemental decoration.

### Binding Row (p2-district-02-binding-row)

Function: insulation, copying and heated workshops. Functional envelope range 250–400 m wide × 200–350 m deep; relative terrain layer -5 to 5 m. This range follows the work, civic or household program and is not a property boundary. Direct neighbors: Warm Index, Hearth Shelves. Keep two independently signed public entries. Main thresholds show purpose and service availability before entry; private work yards cannot become a compulsory through-route. Use p2-arch-02-rime-vaults; fixtures follow the district function rather than generic elemental decoration.

### Hearth Shelves (p2-district-02-hearth-shelves)

Function: compact insulated housing and shared kitchens. Functional envelope range 250–400 m wide × 200–350 m deep; relative terrain layer 5 to 15 m. This range follows the work, civic or household program and is not a property boundary. Direct neighbors: Binding Row, Rock Stacks. Keep two independently signed public entries. Main thresholds show purpose and service availability before entry; private work yards cannot become a compulsory through-route. Use p2-arch-02-rime-vaults; fixtures follow the district function rather than generic elemental decoration.

### Rock Stacks (p2-district-02-rock-stacks)

Function: mobile archive storage and supervised preservation wards. Functional envelope range 150–300 m wide × 150–250 m deep; relative terrain layer 25 to 35 m. This range follows the work, civic or household program and is not a property boundary. Direct neighbors: Hearth Shelves, Warm Index, Melt Exchange. Keep two independently signed public entries. Main thresholds show purpose and service availability before entry; private work yards cannot become a compulsory through-route. Use p2-arch-02-rime-vaults; fixtures follow the district function rather than generic elemental decoration.

## Drawn plan and section

![Stillfolio proposed district plan and terrain section](02_PLAN_AND_SECTION.svg)

The diagram shows the actual district graph, separate public/logistics/relief entry points and the proposed terrain layers. Plan positions are diagram units, not map coordinates. The lower section unfolds the district sequence for inspection; it does not imply that every district is collinear. Terrain layer bands need site survey and accessible connecting paths.

## Streets, gates and access

Primary public arrival at Melt Exchange; separate logistics gate serves Binding Row; an independently signed relief approach reaches Hearth Shelves. These are three conceptual connections pending placement. Arrival should reveal one civic landmark and a legible next decision, not every district at once. Public links target 5 m clear width, widened to 8 m at gate connections; test these with the eventual actor, cart and crowd envelopes. Ordinary door and assisted-route clearances must be measured in engine. Alternate paths need contrasting landmarks, not just different colored arrows.

## Service spine and logistics

Melt Exchange decants food into insulated carts; Rock Stacks uses removable storage modules; fuel carts never cross patient rooms. The protected route is Melt Exchange → Warm Index → Rock Stacks → Hearth Shelves. It connects arrival services, civic counters and stable housing. Potable intake, process return and storm overflow cross only through inspectable sealed structures. Waste collection schedules avoid food queues; relief stores can be served with the specialist district closed. Event and territory states may change scenery or throughput but not remove this spine.

## Evacuation and failure paths

Each district has at least two graph exits. Walk outward via the shorter open graph arc to Melt Exchange; if its external approach fails, use the protected housing-side relief exit at Hearth Shelves. Never send residents through poi-02-event, p2-poi-02-worldboss or p2-poi-02-pvp. Dedicated staff move services before hazard closure. Two distinct external receiving points must be mapped before terrain lock. A biconnected district graph is only a paper check: hazard volumes, blocked doors, crowd congestion and external approach failures require independent runtime tests. Outpost warnings activate before gates close; first responders have a separate marked lane. Forced reset returns a visitor to the stable arrival refuge rather than an active hazard.

## Enterable interiors

- p2-poi-02-public-record-room: hearing desk, appeal archive, quiet waiting niche; target clear envelope 18 × 14 m. Public vestibule and independent service door; no key or hostile-state trap on the public route. Staff rotate; closed counters expose a staffed fallback kiosk without opening private storage.
- p2-poi-02-repair-interior: bench, supervised public tool rack, material store, separate waste exit; target clear envelope 24 × 18 m. Public vestibule and independent service door; no key or hostile-state trap on the public route. Staff rotate; closed counters expose a staffed fallback kiosk without opening private storage.
- p2-poi-02-watch-refuge: rotating guard station, civilian refuge, emergency stores, two exit doors; target clear envelope 22 × 16 m. Public vestibule and independent service door; no key or hostile-state trap on the public route. Staff rotate; closed counters expose a staffed fallback kiosk without opening private storage.

Housing: p2-poi-02-housing, entered from Hearth Shelves. Sample 12 × 10 m room and 4 × 3 m entrance/storage vestibule are test envelopes. Preserve safe storage access, permissions, and recovery independent of the external facade. Homes have warm inhabited cores and optional cold storage annexes. Housing progression expands workshops and shared reading access; players are not asked to maintain a fictional medical cryostasis system through punitive daily login fees.

## Vertical cross-section and underground

bedrock anchors → frost-drained undercroft → warm occupied rooms → ventilated cold store; no load-bearing glacial ice. Occupied rooms need inspectable drainage/ventilation appropriate to their layer. Section drawings must show foundations, habitable floors, overhead loading, water and evacuation, not only a skyline.

Dungeon approach: public catalog room → displaced trolley siding → cold specimen hall → contested testimony chamber → rock-side transfer door. The threshold to poi-02-dungeon is a signed, separate admission zone; public utility access does not flag a party into combat. The secret p2-poi-02-secret is optional and never hides the only exit.

## Institutions, livelihoods and defense

Collection councils separate custody, interpretation and public access decisions. Emergency seals expire unless independently renewed; the conflict is who can realistically challenge custodians when challengers lack the sealed evidence. Households share warm reading rooms, preserved food and copying work. Civic duty is care for an entrusted record or vulnerable person; people may serve through translation or cooking without possessing elite magical literacy. The gate watch uses p2-poi-02-watch-refuge with civilian refuge space protected from equipment loading. Specialist schools and care at Rock Stacks have public counters; disputes affect negotiated services instead of magically disabling the whole city. Trade requires food, insulation, heating tools and exports preservation, records, cold-chain services. Regional villages and the exchange settlement supply daily evidence of these dependencies.

## Sacred and commemorative space

Vigil of the Unread Page in Warm Index is a voluntary sacred/commemorative Oath space: a warm remembrance room where families may leave an unrecorded page; silence and declining preservation are respected. It occupies an accessible alcove or court inside the existing civic district, so it adds a distinct purpose without inventing another settlement. The ordinary public entrance remains open to unbound visitors, observers and dissenters; no prayer, ritual, ancestry, faction standing or Oath binding is required for civic services. A quiet side exit and nonparticipatory route preserve choice. Objects left here are authored story props, not automatic transfers of player possessions.

## Day/night, weather and NPC circulation

Morning thaw inspection changes porter routes; midday visitors use Warm Index; night cataloguing continues behind quiet partition doors. Whiteout shuts scenic bridges; sheltered rock walk and refuge beacons retain a physical route.

Anchor existing character-02-leader to scheduled hearings at Warm Index; character-02-civilian moves between specialist work at Binding Row, public testimony and home/rest without being respawned as another identity. New background roles are role slots, not invented named protagonists: village producer → exchange store → home; porter → gate → workshop → break; watch → outpost → relief → rest; custodian → institution → service lane. Morning thaw inspection changes porter routes; midday visitors use Warm Index; night cataloguing continues behind quiet partition doors. During hazards, interrupt into warn/escort/refuge before resuming; bound simulation off-screen and never require a precise real-time appointment for story access.

Snow absorption, long breathing spaces and the creak of loaded ice form the sound bed. Warm reading rooms introduce close human voices, while hazard tones avoid being indistinguishable from decorative chimes. Alarm priority must override ambient masking without requiring hearing. Night lighting preserves route shape, household quiet and silhouette contrast; optional magic does not replace ordinary lamps, signs and staff.

## Event, world-boss and PvP interfaces

poi-02-event retains the baseline event catchment. Relief deployment goes to p2-district-02-melt-exchange before closures; p2-poi-02-worldboss stays outside homes and the service loop. p2-poi-02-pvp has a separate explicit opt-in entry and two withdrawal routes. A public procession can alter traffic through a predeclared loop; no event may consume both external receiving points. Homes retain interior/storage state and safe return.

## Reference and asset handoff

Architecture kit: p2-arch-02-rime-vaults; art guide art-guide-02; recovered reference REF-112. Verified foundation observation: Glacial vault shelves, ice pillars and dark stone archive thresholds. Materials observed in the foundation: quilted felt, dark leather, rime laminate. New layouts translate that language into use-specific load paths and service fixtures; the reference is not proof of exact dimensions, unseen surfaces or individual production approval. Kit substitutions need an explicit compatibility and silhouette review.

## Construction phasing

1. P0: survey foundations, catchments and exclusion volumes; establish ordinary external route and temporary clean-water/refuge services.
2. P1: block out all district graph edges and two external refuge exits; reject any disconnected essential-service layout before visual work.
3. P2: build load-bearing kit, drainage, service separation, residential sample and three enterable service interiors; prove normal day/night paths.
4. P3: add optional vertical/special-Oath paths, bounded dungeon transitions, event closure overlays and habitat/resource margins without replacing public routes.
5. P4: add reference-reviewed material detail, sound and NPC routines; run disaster, accessibility, housing recovery and reduced-effects tests; obtain human signoff.

## Acceptance gates

- Graph remains connected after any one district-link closure; independently test external egress and no-Oath traversal in blockout.
- Deliver food, waste, emergency care and freight without entering optional PvP or a live boss footprint.
- Each occupied interior exposes two distinct exits and a stable safe return point.
- Change day/night, event recovery and territorial presentation without relocating protected service/housing IDs.
- Validate real gradients, sightlines, support, crowd capacity, collision, nav and render costs before claiming production readiness.

No asset count, population, street capacity, engineering safety, travel time or performance target is approved by this document. Validate the lean ordinary city first; only then add spectacle layers.
