# Geography and transport acceptance evidence

Status: **PROPOSED package; conceptual checks PASS; human/terrain/runtime approval OPEN.**

## Evidence recovered and retained

Read the foundation geography narrative, realm registry, graph, POIs, trade routes, map-art brief, all fifteen dossier geography/climate/mount sections and the art differentiation guide. Compared against baseline commit `5dce9edae0bb3587eb7c72433395e7d5a19857ea`:

- Exact thirty original edge IDs and endpoint pairs: PASS.
- Exact four original basin IDs and ordered region sequences: PASS.
- All sixty-three POI IDs, names and owning region IDs: PASS.
- All fifteen capital mappings: PASS.

Results are recorded in GEOGRAPHY_BASELINE_COMPARISON.json. This captured comparison uses repository-relative provenance only; neither repository was edited.

## Reproducible current-package checks

Run `python validation/validate_geography.py` from any working directory with Python and jsonschema available. The supplied GEOGRAPHY_VALIDATION.json contains fifty passing checks:

- Closed structural schemas for both registries.
- Count, unique-ID, capital and reciprocal-neighbor checks.
- Connected ordinary travel and all thirty single-edge removals.
- Crossing-free straight-line graph embedding.
- Fifteen simple, positive-area dissolved territory rings.
- Exactly thirty positive-length shared-border pairs; no extra or missing pair.
- No inter-territory edge crossing, no triple-owned positive-length edge.
- One simple coastline equal to the full unshared territorial perimeter.
- Sum of territorial areas equals coastal enclosed area.
- Four preserved, neighbor-continuous, strictly descending station sequences.
- Each of thirty explicit detours excludes its failed edge and uses real edges.
- All seventeen requested transport categories represented; supplementary modes also specified.

The area/perimeter/no-crossing checks complement one another. A matching area total by itself would not prove non-overlap. The fifteen polygons are dissolved boundaries; internal construction sectors are not drawn. A shared border may bend several times, which can make the plate look more segmented than fifteen equal tiles.

## Visual review

Rendered maps/CONTINENT_CONCEPT.svg to maps/CONTINENT_CONCEPT.png using Inkscape and inspected the PNG. Labels, legend, caveats and directional river arrows are readable. Corrected the initial relief band that protruded beyond the northern shore. Added an irregular coast blockout and separated paired estuary/outlet traces. Kept the Dawnrun outlet west of the Veilwater outlet to avoid an unintended crossing in the southeast. Map remains a schematic connection/territory plate, not a terrain painting.

## Explicit gaps and human decisions

No terrain heightfield, mesh, catchment polygons, hydraulic simulation, true road grade, geospatial travel distance, ecological carrying-capacity model, engine navmesh, runtime performance test or playable transport exists. Proposed channel stations descend numerically; no terrain-derived profile has been sampled. Rivers in the SVG are logical traces, not surveyed beds or measured flood extents. The border realization is topologically feasible but must be deformed to actual ridges/channels through geography and political review.

No new canon currency is established by abstract fare credits. Greybox travel minutes and service capacities need balancing and measurement. No basin area or rainfall budget is invented. Multiple correlated closures need event-specific reachability validation beyond the single-edge guarantee. Region-04/15 coastal service is optional transport and never a new land adjacency.

Founder review must accept or change geography, borders, proposed geology and scale. Terrain review then checks real gradients, lake outlets, drainage divides, flood/surge refuges and ordinary service access. No successful document check is a production or canon approval.
