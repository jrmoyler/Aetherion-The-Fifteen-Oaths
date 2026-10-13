# Production inventory and acceptance ledger

Generated with `python3 tools/production/inventory.py`; verify without writing using `--check`.

**Status: blocked, incomplete production. Zero new production assets and zero accepted families.**

The known Phase I scope is fully indexed at family/registry granularity with a complete canon document catalog. Phase II item scope is unknown because the exact archive is not available locally. This is not a complete Phase I + II production inventory or a completed world.

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
| new production asset deliverables | 0 |
| accepted production families | 0 |
| fully rendered gameplay certified castables | 0 |
| exact mesh and clip requirement count | UNKNOWN |
| phase ii item level requirements | UNKNOWN |
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

## Blocked Phase II input

Required archive: `Aetherion_Phase_II_Continental_Architecture_2026-10-13.zip` (1,011,575 bytes). SHA256: `02306b20f0c070f6fe488d7bf2e4fa25412503010c037860fe3a2a91244be2bc`.

Phase II summary figures retained in the JSON are owner/parent-reported, explicitly not locally verified; they describe overlaps such as 255 architecture module entries and 272 regional variants refining 210 existing Phase I family IDs. No Phase II item IDs, diagrams or item requirements have been invented from those figures. Import the unchanged ZIP and unpacked documents through the supported intake, then reconcile IDs and regenerate an extended inventory.
