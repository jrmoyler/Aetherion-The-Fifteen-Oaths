# Daybreak r01/r02 independent evidence

**R02 repairs the measured stair defect, but still fails ten project LOD checks. No art or production acceptance is granted.** This additive evidence package preserves original failed checks and independent follow-up reports without modifying or duplicating the frozen architecture Blender/GLB assets.

## What passed and what remains

- [Original stair failure](imports/stair-profile.json): r01's terminal body intruded into the upper exposed tread. The original [technical summary](imports/SUMMARY.md) and [visual review](visual/review.md) remain unchanged.
- [R02 stair verification](imports/r02/stair-profile.json) and [technical summary](imports/r02/SUMMARY.md): independent actual-geometry sampling confirms nine full 0.300 m treads, with the receiving landing owning the tenth 0.160 m rise at y=2.70. The final tread stays at 1.44 m through y=2.699. Actual navigation/landing displacement and height-offset negative fixtures reject. This is geometric fit evidence, not building/access-code or character-physics approval.
- All **71 final GLBs** have scoped independent import coverage: 66 module exports plus five derivative assemblies. The initial 66-module run covers unchanged r02 bytes; five changed stair/assembly exports and four remaining assemblies were independently checked in r02. Actual Blender/Godot/Three.js CPU imports and Khronos validation pass for these inputs. Receipts and lineage hashes identify exactly which revision each run tested.
- [Final freeze verification](imports/r02/final-freeze-verification.json): all 208 r02 authoring records match, totaling 366,116,918 bytes; frozen manifest SHA256 `8c2154a96dedb8ff8436c8b1c29e8221f4c278368aa226e8400f6eee841e9465`.
- The actual [project validator report](imports/r02/project-validator-errors.json) contains **10 `LOD_NOT_REDUCED` errors across 10 of 17 module records**. Passing imports do not override those failures. R03 repairs are pending and are not represented by this r02 package.

| Module | Failed reduction |
| --- | --- |
| foundation-plinth | LOD1 not smaller than primary |
| floor-bay | LOD2 not smaller than LOD1 |
| window-wall | LOD1 not smaller than primary |
| inside-corner | LOD1 not smaller than primary |
| door-frame | LOD1 not smaller than primary |
| roof-bay | LOD1 not smaller than primary |
| stair-flight | LOD1 not smaller than primary |
| ramp-run | LOD1 not smaller than primary |
| shade-canopy | LOD1 not smaller than primary |
| daylight-baffle | LOD1 not smaller than primary |

## Independent visual findings

The [r02 visual addendum](visual/r02/review.md) confirms the narrow terminal-tread repair while preserving the broader r01 findings: missing landing guard returns/side panels, simplified canopy and pier silhouettes, sparse trim and inlay, material/detail gaps, and unresolved baffle visibility/clearance. No visual approval is implied. Original REF-105 remains binding; construction sheets remain PROPOSED. The visual reviewer inspected reference/candidate pixels; exact dimensions come from the separate geometry checks.

Selected unchanged images make the repair reviewable without duplicating the asset package:

| View | Original r01 | Repaired r02 |
| --- | --- | --- |
| Stair flight | [r01 render](visual/pixels/r01-stair-flight.png) | [r02 render](visual/pixels/r02-stair-flight.png) |
| Stair with landing | [r01 render](visual/pixels/r01-stairs-with-landing.png) | [r02 render](visual/pixels/r02-stairs-with-landing.png) |

[PNG comparison](visual/r02/png-comparison.json) records all 53 render hashes: only the two stair renders and derivative contact sheet changed; 50 remained identical. Original r01/r02 reports and source identities are retained.

## Scope and verification

[Publication evidence](evidence.json) is an exact allowlist of every delivered file except itself. Run `python validation/production/daybreak-r02/verify_package.py` to reject missing, extra or altered files and verify the curated import-index rows, JSON documents, four PNG decodes and all local README links. [Publication origins](publication-origins.json) records source locations and hashes. Scripts/logs retain original local run paths; these are evidence paths, not claims that external assets are duplicated here.

Physics has its own independent package and is not bundled here. CPU/headless imports do not establish GPU shading, texture-decoded browser parity, Unreal runtime, continuous motion clearance, strength, accessible construction, character traversal or owner acceptance. Known unrelated dirty character-worktree hash failures are not attributed to these frozen architecture inputs; full repository regressions must run on the final clean checkpoint.
