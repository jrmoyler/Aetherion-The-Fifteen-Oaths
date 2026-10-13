# Dynamic weather system

Status: PROPOSED Phase II refinement. Sources: P2-SRC-FOUNDATION, P2-SRC-DIRECTIVE, P2-SRC-PROPOSAL. [Read-only foundation](https://github.com/jrmoyler/Aetherion-The-Fifteen-Oaths/tree/5dce9edae0bb3587eb7c72433395e7d5a19857ea/AETHERION_CANON). All numbers are prototype design hypotheses; no profiling, engine implementation, assets, or founder approval is claimed. Existing IDs and source castable behavior are preserved.

## Physical constraints and refinement

Refines foundation weather state machine and climate profiles; WORLD_REGION_GRAPH.json supplies the proposed physical envelope. Prevailing western moisture meets the Rime/Storm/Fault uplands, rain shadows shape sheltered interiors, and eastern coasts retain maritime fog. The four foundation drainage sequences are unchanged. Suggested channel elevations in the geography package are descending conceptual targets, not surveyed heights. Precipitation cannot jump a divide because two capitals trade with each other.

Only region-04 and region-15 coastal channel reaches receive authored tidal backwater in this approximation. Regional rivers, engineered treatment cells and potable water supplies are separate ledgers. A Bitterglass treatment failure is not proof that every river in a basin is poisoned. No world spell creates infinite water, reverses an entire drainage basin or changes continent climate.

## Time, seasons and forecast

Use the server monotonic world_tick convention in WORLD_ECOLOGY_SYSTEM. A proposed prototype day is 120 real minutes with four equal dayparts; a proposed season is seven real days. These are review fixtures, not established lore or a live-service commitment. Epoch configuration maps world_tick to dawn/day/dusk/night and renewal/growth/harvest/cold. In arid regions renewal means a rain/forage pulse; cold does not mean universal snow. Every season has published start/end and catch-up routes for progression. Clock changes are configuration migrations, never client-clock adjustments.

Forecast has horizon, confidence band, next safe-travel window and known hazard notices. It is an authored prediction of the seeded schedule with bounded uncertainty, not an accurate meteorological model. Commit the upcoming major-hazard notice before activation and never retroactively change its announced minimum warning. Local drift can affect cosmetic rain timing; it cannot surprise players with unannounced lethal activation. Server region handoff carries the current forecast revision.

## Data model and finite states

Authoritative coarse fields: condition enum clear/cloud/rain/snow/fog/storm; precipitation band 0–3; wind band 0–3 plus eight-direction heading; temperature enum freezing/cold/mild/warm/hot; visibility band normal/reduced/protected-minimum; wetness, snowpack and runoff in integer units; season_epoch; condition_seed; condition_revision; state and state_started_tick. Do not derive slippery collision or electrical hits from individual client rain particles.

State sequence: stable → forecast → transition → active → easing → stable. Prototype forecast minimum 120 seconds for a consequential change, transition/easing 30–90 seconds, active 3–12 minutes. Ordinary mild cloud shifts may stay cosmetic without event notices. Event warnings use their own registry timers and concurrency arbiter. Conditions can repeat without resampling on boundary crossings.

- stable: sample next eligible condition from region climate, season, upstream weather context and seeded bucket; never enable snow outside an approved temperature/elevation band.
- forecast: publish condition, onset window and alternative route; reserve no disaster automatically.
- transition: interpolate only visual/audio parameters; authoritative surface state changes once at a committed threshold.
- active: apply bounded field coefficients and declared surface tags; emit at most one hazard eligibility message per condition revision.
- easing: retire danger first, then wetness/snow visuals according to substrate; never instantly dry saturated riverbanks because clouds cleared.
- stable: retain hydrological memory and next seed index.

## Hydrology approximation and conservation

At a 60-second bucket, add declared precipitation and incoming channel flow to snowpack, soil moisture and surface storage according to temperature and infiltration coefficients. Melt moves units from snowpack to liquid storage. Evaporation, downstream discharge and explicitly recorded consumption remove units. Soil saturation determines runoff eligibility; ordered directed basin edges transfer discharge once using matching receipts. Carry integer remainders between buckets.

Liquid-water balance: ending liquid storage = beginning liquid storage + liquid precipitation + incoming liquid flow + melt transfer - outgoing liquid flow - evaporation - liquid withdrawals. Snow balance: ending snow storage = beginning snow storage + solid precipitation - melt transfer - sublimation. Total-water balance: ending total storage = beginning total storage + liquid precipitation + solid precipitation + incoming liquid flow - outgoing liquid flow - evaporation - sublimation - liquid withdrawals. Total storage is snow plus liquid; melt is an internal transfer and therefore cancels from the total-water equation. This prototype has no separate transported-ice flux or liquid-to-snow refreezing term; adding either requires an explicit paired transfer. River discharge above authored capacity may qualify a flood event, but graph topology and public routes are never recomputed through unconstrained erosion. Coastal surge changes a bounded backwater buffer at the outlet and consumes a declared ocean-boundary inflow; it cannot propagate uphill beyond the coastal reach. Drainage failures use authored overlay states, not real-time fluid simulation. Potable stocks use treatment input/output receipts, independent of cosmetic water height.

## Fifteen climate responses

1. Kiln: rain on warm rock produces localized steam; ash-laden surfaces and settling ponds need maintenance. Heat effect never grants breathable air in a vent exclusion.
2. Rime: snowpack, thaw pulses and whiteouts distinguish sheltered inhabited valleys from exposed headwaters. Archive humidity stays a building system.
3. Storm: ridge icing and crosswinds qualify relay maintenance; grounded corridors and timed warning windows remain legible.
4. Tidal: upstream discharge, rain and coastal surge combine in the estuary; refuge terraces and freshwater nursery checks precede lock closure.
5. Fault: wet west and dry lee coexist; canyon flash floods and freeze-thaw rockfall are distinct from seismic event triggers.
6. Reed: lee gardens remain calm while exposed shelves are gusty; gliding is optional and nesting windows alter route advice.
7. Graft: canopy rain, fungal pulses and drought produce different tending tasks; maximum biomass is not always healthy habitat.
8. Bitterglass: stagnant air, fog and floodwater alter fictional exposure zones; shape/text names the pathway and safe alternative.
9. Daybreak: fog and summer heat remain despite radiant architecture; night and low-light wildlife refuges persist.
10. Observatory: sea fog and clear dry intervals alternate; gravity volumes are separate from wind and have conventional ground bypasses.
11. Missing Court: fog pockets and damp caves lie beside drier slopes; shadow effects cannot hide actual collision or exits.
12. Sanguine: hot lowlands, flood pulses and cool upland nights require rest/water logistics; magic cannot replace them.
13. Folded Theatre: dry summer, cool night and valley fog are real weather; staged illusion cannot falsify safety information.
14. Escapement: drought and sudden channel floods affect steppe roads; time stutters never change global deadlines or ecology ticks.
15. Impulse: maritime humidity, surge and heat islands require drainage/corrosion work; steam VFX cannot hide pedestrian warnings.

## Local Oath exceptions and interactions

Local anomaly descriptor must declare owner, bounded volume, duration, allowed targets, maximum magnitude, public-route exclusion, resource source and rollback. It composes after ordinary weather without modifying the underlying regional clock or conservation ledger. Event adapters in WORLD_EVENT_REGISTRY are disabled until per-UID review; elemental labels alone never authorize an interaction. Snow/ice visuals from Frost Lance cannot alter regional snowpack. Storm Lance does not decide lightning weather. Blink Step does not advance harvest time. New cooling, rainfall, structural, purification or crop-growth mechanics require explicit separate approval and tests.

## Infrastructure, buildings and mobility

Substrate response tags are authored: stone slab, mud path, metal stair, timber deck, porous terrace, sheltered threshold. Only approved hazards may affect movement, with alternative traction/tool routes. Construction inspection checks drains, storm fasteners, wind baffles, insulation and service clearances before seasonal decoration. Events can temporarily reduce optional freight throughput but never erase the transit graph. Every capital retains a conventional public route and stable housing entry; personal homes use facade overlays rather than destructive flood physics.

## Cross-cell presentation and recovery

A 20-second proposed boundary hysteresis preserves the authoritative condition revision until region handoff commits; visual blending uses a non-authoritative edge volume. No repeated enter/exit farming of weather bonuses. Clients generate particles and sound from seed, with independent accessibility density. On reconnect, send compact current condition, next committed forecast and hazard route revision; skip obsolete flashes rather than replaying storms at high speed. Offline hydrology advances bounded buckets with a documented safe clamp, logged as an approximation; it creates no reward or private-property loss.

## Accessibility and budgets

Persistent text/icon forecast, shape-coded surface warnings, captioned thunder and a static lightning countdown duplicate all safety cues. No essential cue requires color, hearing, strobe, camera shake, volumetric fog or wind-blown animation. Reduced-motion mode disables screen shake, rapid cloud movement and refractive anomaly warping. Fog density cannot obscure minimum attack outlines, nearest exit or service signage. Localized notices include units and remaining duration in readable formats.

Unprofiled prototype targets: one authoritative climate record per region plus up to eight local exception volumes; 60-second weather/hydrology update; weather snapshot no more than 1 KiB per region revision excluding localized strings; one major and two minor events per region; maximum four nearby weather particle emitters on a low-effects client. Weather GPU target 1.5 ms p95 at the selected reference resolution/device, measured separately from gameplay telegraphs. If missed, reduce precipitation particles, volumetric layers and decorative wet reflections before reducing warning contrast. Device, resolution, sample trace and high-concurrency case must be reported; no current benchmark result is claimed.

## Acceptance gates

Test wet-west/dry-lee transitions; no inland surge; stable four-basin downhill flow; conservation across melt and duplicate transfer; delayed packets at a region edge; storm+festival arbitration; lightning in low-effects and muted audio; reconnect during warning; seasonal clock migration; 90-day absence; all-source-castables unable to write weather without approved descriptors. Review actual terrain/navmesh and accessibility playthroughs before enabling hazards. Calendar pacing, weather probabilities, coefficient values, final drainage meshes and performance remain unresolved.
