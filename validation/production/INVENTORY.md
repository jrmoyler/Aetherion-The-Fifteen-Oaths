# Production inventory and acceptance ledger

Generated with `python3 tools/production/inventory.py`; verify without writing using `--check`.

**Status: incomplete production. 63 exported candidate asset entries; zero accepted families. States and LODs do not close a family.**

The combined registered scope is now indexed from actual Phase I registries and the exact imported Phase II package. The ledger includes all fifteen Oaths and every Phase I category, plus concrete Phase II module/variant entries and world-system obligations. This is a work/acceptance inventory, not a completed world or an exact final mesh estimate.

| Measure | Count |
|---|---:|
| phase i master records | 748 |
| production family requirements | 510 |
| family component scope labels | 2865 |
| reference images | 114 |
| source castables | 100 |
| primary source file alias records | 24 |
| all source unique byte identities | 112 |
| all source asset paths | 197 |
| linked detail registry records | 789 |
| linked detail unique ids | 774 |
| runtime implementation contracts | 20 |
| new production asset deliverables | 63 |
| distinct candidate archetypes | 52 |
| candidates missing required collision | 1 |
| candidates declared nonblocking | 1 |
| candidate glb file paths | 270 |
| families with candidate deliveries | 17 |
| families without candidate deliveries | 493 |
| unaccepted production families | 510 |
| accepted production families | 0 |
| fully rendered gameplay certified castables | 0 |
| exact mesh and clip requirement count | UNKNOWN |
| phase ii architecture module entries | 255 |
| phase ii regional environment variants | 272 |
| phase i families refined by phase ii | 210 |
| combined detail unique ids | 1177 |
| phase ii payload documents | 115 |
| candidate texture file paths | 260 |
| production candidate manifest paths | 17 |
| phase i canon document paths | 139 |
| named character ids | 34 |
| baseline poi ids | 63 |

The 748 master records are 510 family requirements + 114 references + 100 castables + 24 primary source-file aliases. The full source inventory groups 197 paths into 112 byte identities; the 24 aliases are already inside it. Existing GLB/FBX files are preserved prototype sources, not newly made or production-approved models.

Phase I contains 2,865 component scope labels within its 510 families, 34 named characters, 90 proposed creature/mount/morph identities plus four source summon visual manifestations, and 63 baseline POIs. These are verified registry counts, not completed deliveries. Character, creature, POI, quest and other detail registry rows link back to their original IDs and JSON pointers. These are distinct identity domains and overlapping refinements, not additional completed meshes. The exact mesh/clip total remains unresolved.

| Work group | Family requirements |
|---|---:|
| concept construction guidance | 45 |
| character creature rig animation | 90 |
| equipment and clothing | 75 |
| static environment architecture terrain props | 105 |
| articulated vehicles and siege | 30 |
| vfx | 45 |
| ui | 15 |
| audio | 15 |
| cinematic | 15 |
| world interactive assets | 60 |
| materials and shaders | 15 |

| Oath | Families | Source castables | Accepted families |
|---|---:|---:|---:|
| oath-01 | 34 | 10 | 0 |
| oath-02 | 34 | 6 | 0 |
| oath-03 | 34 | 9 | 0 |
| oath-04 | 34 | 6 | 0 |
| oath-05 | 34 | 8 | 0 |
| oath-06 | 34 | 5 | 0 |
| oath-07 | 34 | 6 | 0 |
| oath-08 | 34 | 5 | 0 |
| oath-09 | 34 | 8 | 0 |
| oath-10 | 34 | 5 | 0 |
| oath-11 | 34 | 6 | 0 |
| oath-12 | 34 | 4 | 0 |
| oath-13 | 34 | 6 | 0 |
| oath-14 | 34 | 6 | 0 |
| oath-15 | 34 | 10 | 0 |

Every family has per-engine Blender/Unreal/Godot/Three.js obligations and separate design, authoring, UV/PBR, rig, LOD/collision, export, visual match, performance and final approval gates in `inventory.json`. Conditional/non-mesh work is identified: reference construction sheets are not meshes, and static geometry does not need a fabricated rig.

The 20 runtime contracts preserve their original acceptance-test specifications. Their existence is not implementation. Castable validation snapshots retain scoped source CPU claims and incomplete GPU/audio/world integration gates without upgrading them.

This generator verifies local hashes for all 197 preserved source paths and 114 reference images, unique IDs, taxonomy classification, family dependencies and contract dependencies. It does not inspect image pixels or certify renders, import compatibility, runtime gameplay, licenses or performance.

The ledger intentionally does not auto-close gates based on file existence. Future accepted deliveries must attach their exact paths/hashes and test/review evidence to requirement IDs; rerunning an inventory must not silently promote art.

## Verified Phase II requirements and overlap

Required archive: `Aetherion_Phase_II_Continental_Architecture_2026-10-13.zip` (1,011,575 bytes). SHA256: `02306b20f0c070f6fe488d7bf2e4fa25412503010c037860fe3a2a91244be2bc`.

All 115 imported payload files match their exact archive bytes; the two administrative files remain inside the unchanged ZIP. Counts below are derived from those local files. New designs remain PROPOSED. Static specification checks are not implemented-world evidence.

| Phase II registered scope | Count |
|---|---:|
| payload files | 115 |
| archive admin files | 2 |
| deliverable families | 20 |
| regions | 15 |
| capital layouts | 15 |
| architecture kits | 15 |
| architecture module entries | 255 |
| shared environment families | 24 |
| regional environment variants | 272 |
| existing phase i family ids refined | 210 |
| settlements | 60 |
| city districts | 90 |
| enterable service interiors | 45 |
| pois | 318 |
| preserved baseline pois | 63 |
| new poi ids | 255 |
| event refinements | 15 |
| streaming contract refinements | 10 |
| ecology profiles | 15 |
| transport route refinements | 30 |
| transport modes | 20 |
| root registry views | 532 |
| unique registered identity ids | 526 |
| registered ids already in phase i detail | 123 |
| registered ids new to phase i detail | 403 |
| accepted production assets | 0 |

The 15 architecture kits and 24 shared environment families refine **210 existing Phase I family IDs**, rather than adding 39 independent families. Their 255 module entries and 272 regional variants preserve exact source specifications and JSON-pointer locators. These are not 527 guaranteed unique meshes: reuse, terrain decomposition, state meshes and clip counts remain authoring work.

The 318 POIs already include the 90 districts, 45 interiors and settlement locations. All 63 baseline POI records are retained exactly; 255 POI IDs are new. Region and event IDs retain baseline identity. Repeated views of these subjects are merged into combined_detail_scope_links, with every source pointer preserved.

Ten streaming contracts refine named baseline contracts. Fifteen event refinements, fifteen ecology profiles, fifteen capital-layout runtime obligations and complete ecology/weather/civilization/streaming/transport/exploration documents remain implementation work. Their declarations and static tests never close runtime gates.

| Oath | Candidate entries | Families without candidates | Phase II refined families | Module entries | Regional variants |
|---|---:|---:|---:|---:|---:|
| oath-01 | 7 | 32 | 14 | 17 | 21 |
| oath-02 | 6 | 33 | 14 | 17 | 19 |
| oath-03 | 4 | 33 | 14 | 17 | 16 |
| oath-04 | 2 | 33 | 14 | 17 | 24 |
| oath-05 | 2 | 33 | 14 | 17 | 14 |
| oath-06 | 2 | 33 | 14 | 17 | 18 |
| oath-07 | 2 | 33 | 14 | 17 | 17 |
| oath-08 | 2 | 33 | 14 | 17 | 19 |
| oath-09 | 19 | 32 | 14 | 17 | 15 |
| oath-10 | 2 | 33 | 14 | 17 | 17 |
| oath-11 | 2 | 33 | 14 | 17 | 17 |
| oath-12 | 2 | 33 | 14 | 17 | 16 |
| oath-13 | 3 | 33 | 14 | 17 | 17 |
| oath-14 | 4 | 33 | 14 | 17 | 22 |
| oath-15 | 4 | 33 | 14 | 17 | 20 |

All 510 families remain unaccepted. A family with candidate files can still lack most of its components. Exact missing mesh/clip totals therefore remain unknown, while every known category, refined requirement, source entry and acceptance gate is visible.
