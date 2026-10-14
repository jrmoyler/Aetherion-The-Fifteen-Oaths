# Continent map specification

**PROPOSED.** The SVG/PNG are original code-generated concept artifacts with no recovered image pixels. Their purpose is continental topology and art handoff, not a final painted world map. Sources P2-SRC-FOUNDATION, P2-SRC-DIRECTIVE, P2-SRC-PROPOSAL; visual basis `AETHERION_CANON/09_ART_DIRECTION/FIFTEEN_OATH_ART_GUIDE.md` and `03_GEOGRAPHY/WORLD_MAP_ART_DIRECTION.md`.

## Coordinate hierarchy

- Level A: graph identity. Stable region-01..15, original route IDs, basin IDs and POI IDs are authoritative references within this proposal.
- Level B: editorial placement. WORLD_REGION_GRAPH uses 1120×960 arbitrary units, x east, y south. Those values control this diagram only. Capital dots are identity anchors; polygons are a topological territory blockout.
- Level C: physical targets. Proposed elevations in meters use sea=0 but do not imply a horizontal scale. No degrees of latitude, kilometers or elapsed time can be derived from Level B.
- Level D: approved terrain. A future heightfield needs independent world scale, datum, georeferencing, cell origin and verified ID mapping. The engine construction specification chooses its meter/cell convention independently.
- Level E: local traversal. Survey road grades, pier height, bridge clearance, cave ventilation and navmesh against actual geometry. Local measurements supersede pacing targets through review, not silent numerical reinterpretation.

## Composition and layers

The viewBox is 1400×1150, with a translated map canvas, a right legend and two bottom status lines. North points up. Show one irregular mainland first; north ridge and Fault divide second; separate basin traces third; public road skeleton fourth; political borders and capital anchors fifth. Earth-toned fills are reading aids, not new approved Oath palettes. The map intentionally avoids fifteen radial sectors or a rectangular region grid.

Layer requirements for a subsequent painting:

1. Coast: retain the current outer-ring incidence, then replace angular shorthand with rock-controlled headlands, pocket beaches, delta mouths and wetland margins. No new essential island.
2. Relief: preserve broad northern mass, southwest Fault continuation, Reed escarpment and lower southern/eastern plains. Remove any mountain symbol from open sea.
3. Water: draw four distinct named trunk systems with directional arrows. Show river widths by hierarchy after discharge design. Separate parallel estuary channels and label designed mixing points.
4. Roads: solid or dashed ochre at this scale, never confused with a border. Thirty registered crossings must remain traceable. Optional transit belongs on a toggle/secondary plate rather than cluttering the base map.
5. Borders: low-contrast line with jurisdiction labels; do not make a border an impassable ridge unless a real pass exists. The topology blockout requires terrain-aware deformation before final art.
6. Settlements: capital symbols with name and number. Regional maps add the preserved settlement/dungeon/event POIs and the three shared sites; they are not deleted because the continent plate omits their labels.
7. Hazard/service overlay: flood refuges, sheltered approaches, relief corridors, contested freight nodes and accessible essential services. An event overlay cannot replace the baseline map with an unusable spectacle.

## Geographic symbol rules

River lines on this plate are connection traces offset from road anchors for readability. A visual crossing with a dashed road represents an unresolved future bridge/culvert location, not a certified structure. Nearby basin lines do not imply hydraulic mixing. Mountain brush bands are relief regions, not individual measured summits. Capital dots need separate district diagrams before footprint or defensive extent can be inferred.

Lake symbols in the next physical pass must include inlet, outlet and spill sill, with the six lake/retention types described in CONTINENT_GEOGRAPHY. Canal lines require locks/gradients and a water source, and must be distinct from natural streams. Tunnels use broken lines and entry/exit markers. Void routes use paired endpoint glyphs, never an entire realm painted as missing ground. Gravity platforms require a tether/dock and bounded operating area.

## Readability and accessibility

Colors supplement labels and line patterns. Every region is identifiable by number/name without color. Use directional arrows plus basin names in print and screen readers. Preserve river/road contrast at reduced size; detailed fifty-percent-scale text can be omitted in a compact thumbnail only if the full-size artifact remains available. Critical service/hazard routes must not rely on pitch, hue, flicker or subtle transparency.

## Validation and honest limits

The geometry check proves simple closed territory rings, one coastline, nonoverlapping sector construction, matching total area, exact thirty shared-border pairs and a planar graph embedding. A separate graph check proves ordinary connectivity and an alternate path after removal of any one edge. Basin checks prove preserved order, neighbor continuity and descending target stations.

None validates real terrain, river cross sections, rain-shadow simulation, catchment area, navigable water, flood extent, final coastal geology, political acceptance, engine rendering or streaming performance. The concept should be reviewed alongside its JSON, not accepted because it is polished. Regional fine maps must eventually overlay true catchment polygons and road grades rather than reproducing the current abstract capital-to-capital segments.
