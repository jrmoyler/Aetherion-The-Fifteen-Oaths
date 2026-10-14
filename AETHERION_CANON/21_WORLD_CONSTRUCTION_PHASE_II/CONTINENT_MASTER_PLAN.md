# Aetherion continental master plan — Phase II

**Status: PROPOSED.** This is a planning refinement of the [reviewed foundation](https://github.com/jrmoyler/Aetherion-The-Fifteen-Oaths/pull/1), baseline commit `5dce9edae0bb3587eb7c72433395e7d5a19857ea`. No new terrain, travel system, border, place approval or engine implementation is claimed. Sources: P2-SRC-FOUNDATION, P2-SRC-DIRECTIVE, P2-SRC-PROPOSAL.

## What this phase actually decides

Keep one mainland, exactly fifteen major realms, the foundation's thirty bidirectional land adjacencies, four named drainage sequences, fifteen capital identities and all sixty-three POIs. The graph is not replaced by a wheel, equal-sized wedge map or chessboard. Phase II supplies a reproducible, irregular planar territorial realization, suggested geological continuity, channel elevation targets, route operating contracts and terrain acceptance gates. Conceptual borders and numbers are review candidates, never silently promoted canon.

The visual is [maps/CONTINENT_CONCEPT.svg](maps/CONTINENT_CONCEPT.svg). Machine-readable truth for this proposal is [WORLD_REGION_GRAPH.json](WORLD_REGION_GRAPH.json); transport refinements are in [TRANSPORT_ROUTE_REGISTRY.json](TRANSPORT_ROUTE_REGISTRY.json). A map label marks a capital identity anchor; it does not assert its footprint or surveyed location.

## Mainland composition

The northern highland is an uneven arc, broad in Rime, broken into relay saddles in Storm, then lower and more sharply incised in Reed. A resistant northeast headland reaches seaward around the Observatory. The west bulges around Kiln's volcanic apron before narrowing into the forest and twin-estuary coast. The eastern margin is interrupted by the Court's karst embayment, then broadens into Impulse's sedimentary plain. The southern shore has a shallow inland-facing bend below Bitterglass and Sanguine, without severing either from its inland neighbors.

This is a single outer coastline with no essential islands, detached floatlands or enclave capital. The graphic's angular bays and promontories are a silhouette blockout; a later coastal pass should add rock-controlled indentation, pocket beaches and delta distributaries without altering the thirty shared-border pairs. Do not create a decorative strait that cuts a realm's only overland connection.

## Territorial realization, not just connecting lines

The new anchors produce a non-crossing embedding of the existing graph. Interior graph faces are divided into sector polygons. A continuous outer apron carries perimeter territories to the coast. The resulting fifteen simple, connected polygons share positive-length borders precisely for the thirty intended pairs. Validation checks crossings, closed rings, area coverage and shared-border pairs independently of the road drawing.

This construction demonstrates that the political adjacency contract is geometrically feasible. It does **not** establish that every constructed line follows a credible ridge or river. Terrain production must deform the border network while retaining its incidence relationships. For each border choose a demarcation type in CONTINENT_GEOGRAPHY: watershed ridge, channel midpoint, old survey line, or cooperative wetland zone. Never claim that a capital-to-capital road centerline itself is the border.

## Geographic causal chain

1. Uplift and resistant strata establish the northern ridge and Fault divide.
2. Western maritime moisture meets that relief; north/elevation retain snow while lee basins dry seasonally.
3. Four river networks descend to two coastal sectors. Rivers share terminal regions without becoming the same river upstream.
4. Valley floors, rock-founded terraces and pass benches determine habitation and transport.
5. Oath institutions adapt the terrain with specific bounded infrastructure. Oaths cannot globally replace rainfall, food, structural support or maintenance.
6. Trade, disputed water rights, refuge services and event recovery follow those physical dependencies.

## Approval sequence

| Gate | Evidence required | Current state |
|---|---|---|
| Foundation preservation | IDs, counts, edges and ordered drainage equal baseline | Automated check supplied |
| Concept topology | Simple territory rings, exact shared borders, connected mainland, alternate paths | Automated check supplied |
| Geography review | Geologist/environment review of proposed divides, lithology and channel hierarchy | Human review pending |
| Terrain prototype | Heightfield, actual slopes, flow accumulation, flood extents and road cross sections | Not built |
| Navigation prototype | Ordinary walk/assisted access to every civic anchor in normal and event states | Not built |
| Transport economy | Fare affordability, cargo throughput, wait-time and detour tests | Targets only |
| Canon approval | Founder accepts or edits proposed names, scale, borders and infrastructure | Not implied |

## Protected invariants during conflict

Neutral services do not establish a sixteenth realm. Common Waystation remains `poi-neutral-crossroads` inside region-09. Shared Saddle remains `poi-contested-pass` on the Storm–Reed border. Confluence Chamber remains `poi-endgame-weave-seam` in region-09. Ownership changes can alter freight inspection, tariff beneficiaries and military staging. They cannot remove first-Oath choice, seize stored housing contents, compel binding, block basic care or erase a civilian's safe return path.

A protected lane is not magical immunity from a collapsed mountain. If its local terrain becomes unsafe, evacuate before closure and open the validated regional detour. Multiple correlated closures require an event-state reachability test; the single-edge proof alone is insufficient.

## Scale and ownership handoff

Editorial x/y lives only in the 1120×960 concept canvas. Proposed altitude targets are meters relative to an illustrative sea datum. Neither establishes horizontal meters. The engine team must choose playable scale after traversal tests and use its independently approved world-origin/cell convention. Preserve stable region/POI/route IDs when transforming geometry. Geography owns physical divides and outlets; environment simulation owns weather state; transport owns capacity and closure; level design owns collision/navmesh; narrative owns jurisdiction and permission. Any contradiction is a review issue, not a reason to silently redraw a river or rename a realm.
