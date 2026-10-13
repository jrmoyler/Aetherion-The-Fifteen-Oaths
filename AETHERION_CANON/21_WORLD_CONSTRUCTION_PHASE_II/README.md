# Aetherion: The Fifteen Oaths — Phase II

> Every force has a covenant. Every covenant has a price.

Continental architecture review package. New geography, dimensions, construction details and simulation rules are **PROPOSED**, pending founder approval. This is a specification package, not a playable world or production-asset shipment.

## Start here
1. [Source inventory](SOURCE_INVENTORY.md) establishes evidence and authority.
2. [Continent master plan](CONTINENT_MASTER_PLAN.md) explains the connected physical world.
3. [Geography](CONTINENT_GEOGRAPHY.md), [map specification](CONTINENT_MAP_SPECIFICATION.md) and [region graph](WORLD_REGION_GRAPH.json) define the layout.
4. [Fifteen regional blueprints](FIFTEEN_REGION_BLUEPRINTS/) and [capital blueprints](CAPITAL_CITY_BLUEPRINTS/) give location-level construction direction.
5. [Transportation](TRANSPORTATION_NETWORK.md), [exploration](DUNGEON_AND_EXPLORATION_PLAN.md), [settlements](SETTLEMENT_REGISTRY.json) and [POIs](WORLD_POI_REGISTRY.json) connect places and player journeys.
6. [Biomes](REGIONAL_BIOME_SPECIFICATIONS.md), [ecology](WORLD_ECOLOGY_SYSTEM.md), [weather](DYNAMIC_WEATHER_SYSTEM.md), [civilization](NPC_CIVILIZATION_SYSTEM.md) and [events](WORLD_EVENT_REGISTRY.json) describe life before and beyond the main quest.
7. [Architecture kits](ARCHITECTURAL_KIT_REGISTRY.json) and [environment families](ENVIRONMENT_ASSET_REGISTRY.json) distinguish existing visual references from missing production requirements.
8. [Streaming architecture](WORLD_STREAMING_ARCHITECTURE.md), [construction roadmap](WORLD_CONSTRUCTION_ROADMAP.md), [alignment and gaps](CANON_ALIGNMENT_AND_GAP_REPORT.md) and [integration plan](INTEGRATION_PLAN.md) define the implementation handoff.

## Baseline and separation
The existing [Aetherion foundation PR #1](https://github.com/jrmoyler/Aetherion-The-Fifteen-Oaths/pull/1), commit `5dce9edae0bb3587eb7c72433395e7d5a19857ea`, is the reference baseline. Original Ability Matrix source is `4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451`. Neither repository was to be modified during this planning assignment. Baseline IDs and proposal status are preserved; phase-II additions use a separate namespace.

The owner's supplied repository placeholder is resolved to [jrmoyler/Aetherion-The-Fifteen-Oaths](https://github.com/jrmoyler/Aetherion-The-Fifteen-Oaths), already established in the immediately preceding assignment. Integration is a future authorized operation, not performed by this package.

## Reading machine-readable specifications
Registries use stable IDs and strict schemas under [schemas/](schemas/). A matching display name does not establish identity. Baseline references retain their original IDs; new IDs identify proposed refinements or additions. Exact semantic meanings, units and prototype limits are documented alongside each subsystem. JSON validity does not prove terrain, art, performance or multiplayer readiness.

## Validation
See the final validation report and executable checks under [validation/](validation/). Checks requiring implemented terrain, assets, hardware or founder decisions must remain skipped or human-review gates. The deliverable manifest is a navigation/coverage index; presence alone is not completion.

## Repository status observation
Read-only GitHub inspection on 2026-10-13 confirmed PR #1 merged at 18:54:56 UTC (14:54:56 Eastern Daylight Time), merge commit `8c4b5d0bfc75a98388ea29231b9cf1d304dff550`. This package continues to compare against the exact reviewed head `5dce9edae0bb3587eb7c72433395e7d5a19857ea`; a future authorized integration must fetch and reconcile current main. The merge does not approve new Phase II proposals or certify gameplay. No Phase II repository changes were performed.

## Region and capital index

| Region blueprint | Capital blueprint | Plan and section |
|---|---|---|
| [Kiln Oath](FIFTEEN_REGION_BLUEPRINTS/01_KILN_OATH.md) | [Cindervault](CAPITAL_CITY_BLUEPRINTS/01_CINDERVAULT.md) | [Schematic](CAPITAL_CITY_BLUEPRINTS/01_PLAN_AND_SECTION.svg) |
| [Rime Archive](FIFTEEN_REGION_BLUEPRINTS/02_RIME_ARCHIVE.md) | [Stillfolio](CAPITAL_CITY_BLUEPRINTS/02_STILLFOLIO.md) | [Schematic](CAPITAL_CITY_BLUEPRINTS/02_PLAN_AND_SECTION.svg) |
| [Storm Relay](FIFTEEN_REGION_BLUEPRINTS/03_STORM_RELAY.md) | [Crownspan](CAPITAL_CITY_BLUEPRINTS/03_CROWNSPAN.md) | [Schematic](CAPITAL_CITY_BLUEPRINTS/03_PLAN_AND_SECTION.svg) |
| [Tidal Covenant](FIFTEEN_REGION_BLUEPRINTS/04_TIDAL_COVENANT.md) | [Confluence Quay](CAPITAL_CITY_BLUEPRINTS/04_CONFLUENCE_QUAY.md) | [Schematic](CAPITAL_CITY_BLUEPRINTS/04_PLAN_AND_SECTION.svg) |
| [Fault Choir](FIFTEEN_REGION_BLUEPRINTS/05_FAULT_CHOIR.md) | [Keystone Hall](CAPITAL_CITY_BLUEPRINTS/05_KEYSTONE_HALL.md) | [Schematic](CAPITAL_CITY_BLUEPRINTS/05_PLAN_AND_SECTION.svg) |
| [Reed Resonance](FIFTEEN_REGION_BLUEPRINTS/06_REED_RESONANCE.md) | [Cantilever](CAPITAL_CITY_BLUEPRINTS/06_CANTILEVER.md) | [Schematic](CAPITAL_CITY_BLUEPRINTS/06_PLAN_AND_SECTION.svg) |
| [Graft Sanctuary](FIFTEEN_REGION_BLUEPRINTS/07_GRAFT_SANCTUARY.md) | [Rootmeet](CAPITAL_CITY_BLUEPRINTS/07_ROOTMEET.md) | [Schematic](CAPITAL_CITY_BLUEPRINTS/07_PLAN_AND_SECTION.svg) |
| [Bitterglass Guild](FIFTEEN_REGION_BLUEPRINTS/08_BITTERGLASS_GUILD.md) | [Vitrial](CAPITAL_CITY_BLUEPRINTS/08_VITRIAL.md) | [Schematic](CAPITAL_CITY_BLUEPRINTS/08_PLAN_AND_SECTION.svg) |
| [Oath Of Daybreak](FIFTEEN_REGION_BLUEPRINTS/09_OATH_OF_DAYBREAK.md) | [Aureate Steps](CAPITAL_CITY_BLUEPRINTS/09_AUREATE_STEPS.md) | [Schematic](CAPITAL_CITY_BLUEPRINTS/09_PLAN_AND_SECTION.svg) |
| [Tidal Observatory](FIFTEEN_REGION_BLUEPRINTS/10_TIDAL_OBSERVATORY.md) | [Parallax Crown](CAPITAL_CITY_BLUEPRINTS/10_PARALLAX_CROWN.md) | [Schematic](CAPITAL_CITY_BLUEPRINTS/10_PLAN_AND_SECTION.svg) |
| [The Missing Court](FIFTEEN_REGION_BLUEPRINTS/11_THE_MISSING_COURT.md) | [Absent Seat](CAPITAL_CITY_BLUEPRINTS/11_ABSENT_SEAT.md) | [Schematic](CAPITAL_CITY_BLUEPRINTS/11_PLAN_AND_SECTION.svg) |
| [Sanguine Covenant](FIFTEEN_REGION_BLUEPRINTS/12_SANGUINE_COVENANT.md) | [Kinhold](CAPITAL_CITY_BLUEPRINTS/12_KINHOLD.md) | [Schematic](CAPITAL_CITY_BLUEPRINTS/12_PLAN_AND_SECTION.svg) |
| [Folded Theatre](FIFTEEN_REGION_BLUEPRINTS/13_FOLDED_THEATRE.md) | [Manydoor](CAPITAL_CITY_BLUEPRINTS/13_MANYDOOR.md) | [Schematic](CAPITAL_CITY_BLUEPRINTS/13_PLAN_AND_SECTION.svg) |
| [Escapement Road](FIFTEEN_REGION_BLUEPRINTS/14_ESCAPEMENT_ROAD.md) | [Wayclock](CAPITAL_CITY_BLUEPRINTS/14_WAYCLOCK.md) | [Schematic](CAPITAL_CITY_BLUEPRINTS/14_PLAN_AND_SECTION.svg) |
| [Impulse Foundry](FIFTEEN_REGION_BLUEPRINTS/15_IMPULSE_FOUNDRY.md) | [Counterpoise](CAPITAL_CITY_BLUEPRINTS/15_COUNTERPOISE.md) | [Schematic](CAPITAL_CITY_BLUEPRINTS/15_PLAN_AND_SECTION.svg) |

## Concept map

[Open the continental map](maps/CONTINENT_CONCEPT.svg) or its [PNG preview](maps/CONTINENT_CONCEPT.png). The map is a topological proposal with no approved horizontal distance scale. Capital sections unfold district layers for review; they are not surveyed terrain transects.

## Run the static checks

Use Python 3 in an isolated environment and install `validation/requirements-validation.txt`. From the package root:

```
python -m pip install -r validation/requirements-validation.txt
python validation/validate_phase2.py
python validation/run_negative_fixtures.py
```

For original-file comparison, append `--foundation /path/to/pinned/aetherion` and `--source-repo /path/to/pinned/ability-matrix` to the main validator. Without those optional local checkouts, external source verification is explicitly skipped. See [validation report](validation/VALIDATION_REPORT.md) and [requirements coverage](validation/REQUIREMENTS_COVERAGE.json). No command publishes or changes either repository.
