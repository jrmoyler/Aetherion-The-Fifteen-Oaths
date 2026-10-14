# Daybreak architecture candidate r04 — incomplete production kit

This isolated Blender-authored candidate covers every **17 named module requirement** in `p2-arch-09-daybreak-arcades`. It refines the existing family `asset-o09-n-architecture-family`; it does not create a new canon family. Exact source module names and JSON pointers are preserved in [work-list.json](work-list.json), [source-kit-record.json](source-kit-record.json) and the additive [runtime manifest](manifest.json). All dimensions and designs remain PROPOSED. **Zero visual or full-production approvals.**

[Comparison gallery](index.html) · [Module contact sheet](module-contact-sheet.png)



## r04 canopy and pier-head refinement

Two module candidates changed: **shade canopy** and **public colonnade**. The original105 environment strip and proposed canopy/kit construction sheets were inspected directly. The former nearly flat canopy now has scalloped hems, four pointed corner seats, two raised diagonal sewn ribs, a small centre rosette and underside pendant. The colonnade now has spreading necks, layered stone abaci, bronze retaining fingers and receiver caps. The low-profile300mm canopy envelope remains proposed. The source ornament is still simplified; underside rib visibility and marble/bronze richness remain weak. No exact visual match or approved art is claimed.

[Before/after and LOD comparison](r04-canopy-comparison.png) · [Pier-head CPU detail](modules/public-colonnade/capital-detail.png) · [Canopy underside CPU view](modules/shade-canopy/underside-detail.png). Civic, residential and work assembly sources/exports/renders were rebuilt with the revised components. The other15module payloads and the stair/ramp fixtures retain exact r03 bytes. Existing guard returns, other architectural details and all event/damage/restoration variants remain unfinished.

The old canopy corner positions(.1/3.9m) did not meet the colonnade positions(.3/3.7m). R04 aligns four actual canopy sockets to the support sockets at worldZ3.78m with opposite normals, maintaining the assembly placementZ3.48m. Head widths remain inside the4m bay. Twelve conservative colonnade proxy meshes separately cover bases, shafts and capitals; coverage checks exclude the overhead decorative arches. The canopy remains explicitly non-solid; baffle state-specific collision remains PENDING. Controller traversal, physics, engineering suitability and full repeated-bay validation are not certified.

Reproduction: Blender `author-canopy-r04.py` authors both complete modules and editable hidden LOD tiers; `fixtures.py -- civic residential work` rebuilds the affected assemblies; `render-r04-details.py` renders focused views without saving source changes. Run `check-source.py`, `check-r04-connections.py` and `check-r04-lod-interfaces.py`, then actual engine checks using `r04-all-request.json`, followed by Python `package.py`. Root the request paths in the current consumer directory. The other reproduction helpers and historical r01/r02/r03 evidence remain in the package; the two earlier `lod-comparison-*.png` sheets describe r03, not these refinements.

## r03 scoped LOD repair — historical evidence

Ten module designs received deliberately simplified lower-tier geometry, eliminating the ten strict descending-LOD failures discovered after r02 import checks. LOD0 meshes, all movement proxies, primary renders, all five derivative fixtures and the other seven module payloads retain exact r02 bytes. Ten source Blender files changed and now retain editable geometry in hidden `LOD1_EDITABLE_HIDDEN` and `LOD2_EDITABLE_HIDDEN` collections, excluded from normal rendering and selected export. The authoring helper explicitly selects the intended tier. Source audits enable hidden collection evaluation only in memory before inspecting transforms.

[LOD comparison sheet 1](lod-comparison-1.png) · [LOD comparison sheet 2](lod-comparison-2.png) contain actual CPU renders. Inspection shows preserved overall silhouette/openings with reduced trim; the baffle LOD2 loses bronze blade rims. This is a topology repair, not the outstanding canopy, pier, inlay, guard-return or surface-art repair. Window LOD2 omits a 3mm decorative face lip; its structural aperture and typed socket positions remain unchanged.

Own checks: 20 lower-tier GLBs loaded with Khronos zero errors/warnings and Three.js CPU geometry/animation checks; actual Godot 4.6.3 imports decoded embedded textures and sampled animation successfully. All 17 Blender source opens pass UV/packed-image checks; 10 changed sources have hidden editable tiers. Nineteen actual source-geometry LOD checks cover bounds, visible aperture raycasts and nine stair treads; eight r02 landing/socket/negative-fixture checks and seven shared-interface checks still pass. These are scoped checks, not GPU fidelity, physics/controller traversal, Unreal compatibility or art approval. Independent publication gate is separate.

Reproduce in this directory: Blender `author-lods.py` (then hidden collection grouping, included by helper); Blender `check-source.py`, `check-lod-interfaces.py`, `check-interfaces.py`, `check-stair-revision.py`; Python `package.py` refreshes metadata/pins after successful source checks. The base authoring/fixture helpers remain available. `lineage/r02-final-FREEZE.json` pins the preceding package, while `GEOMETRY_FREEZE.json` separates changed and unchanged payloads. Historical r01/r02 reports remain explicitly scoped to their revisions.

## Actual deliverables and counting

- 17 module Blender sources, 51 visual LOD GLBs and 15 separate movement-proxy GLBs. The canopy is non-solid fabric; the baffle has no movement-proxy export and still needs state-specific interaction/collision authority. Static architecture has no artificial rig.
- Five derivative assembly fixtures: residential, civic, work, stair with landing, ramp with landing. These provide five additional Blender files/assembly GLBs and do not count as new module designs or completed buildings. They include 4×1 m circulation and 1.8×1.8 m landing adapters. They are not rendered gameplay tests.
- Twenty authored 512×512 PBR maps: base color (sRGB), roughness, metallic, tangent-space +Y normal (linear) for pale marble, masonry, bronze, woven shade and grip stone. UV0 is unwrapped; used images are packed in the compressed Blender sources and embedded in GLB. No reference image is projected as a material. UV1/lightmap unwrapping and mip-bleed validation are missing.
- Seventeen module CPU renders, five fixture CPU renders, one baffle-open render, a contact sheet and nine exact reference copies. The original REF-105 remains the binding original artwork. Eight supplemental images are PROPOSED construction references, not approved engineering or finished art.
- One actual synchronized three-pivot rigid-node baffle clip (0°→70°→0°), exported on each visual LOD. No skeletal skin is needed for these rigid louvers. Occupancy, safe reservation, hard-stop swept contact, release control and runtime state authority remain unimplemented.

## Geometry and interface decisions

Blender sources use meters, X/right, Y/plan-depth, Z/up. The GLB exporter converts to Y/up once. Grid-module origin is the lower southwest corner at finished floor datum; floor/plinth thickness extends below the datum. Registry extent ordering is width X, depth/run, height/rise. No negative or nonuniform runtime scaling is used to fit interfaces.

All modules have typed socket metadata, intended partners and original requirements. Large planar surfaces are partitioned rather than placing coplanar finish faces over support faces. Floor bronze inlays sit below the marble sectors; side joints remain flush. Door clear aperture is 1.2×2.4 m, window aperture is 1.2×1.2 m with 1 m sill. The ramp movement surface is 0.4/4.8 = 1:12; the stair proxy reaches 1.6 m over 2.7 m, with nine full 0.30 m exposed treads. The receiving landing's 0.16 m front fascia owns the tenth riser at y=2.70 m, z=1.44–1.60 m; the flight has no intrusive terminal body. Railings remain outside the 1.8 m nominal clear circulation width; they expand the total mesh bounds. The ramp's wearing surface adds 20 mm of substructure below its lower datum. Stair grip insets are 0.6 mm proud to avoid coincident surface geometry. These are disclosed candidate construction choices, not approved dimensions.

LOD1/2 omit authored decorative details while retaining structural surfaces and connection transforms. Some simple modules retain the same geometry at more than one LOD; these are not counted as new designs. Performance, screen-space thresholds and transition appearance remain unmeasured.

## Fresh author-side evidence

- [Source checks](source-validation.json): all 17 actual compressed Blender source opens; used images packed, unit scale, finite geometry, zero collapsed UV triangles. Measured triangle texel density is reported; **no claim that the proposed 512 px/m architecture target is met**. Large surfaces need a reviewed trim/tile and lightmap treatment.
- [GLB and Three.js checks](all-glb-validation.json): all 71 module/fixture GLBs imported with GLTFLoader; zero Khronos errors and zero warnings. Embedded texture structure is checked; Three.js CPU texture objects are placeholders, not GPU texture decoding or appearance certification. Animation samples preserve node scales. The report includes exact file hashes and retained validator details.
- [Godot checks](all-godot-validation.json): actual Godot 4.6.3 headless GLTFDocument imports, embedded texture decoding, scene instantiation, clip midpoint seeking and freeing for all 71 GLBs; zero import errors. These checks do not turn separate collider meshes into engine physics bodies.
- [Interface checks](interface-validation.json): seven checks pass. Actual floor collision bounds meet on a 4 m join; a deliberately displaced 15 mm seam is rejected. Door and window each pass 325 sampled clear-aperture rays against actual source colliders. Stair/ramp proxy vertices match rise/run. Three baffle pivots are synchronized without scale shrink. These are scoped geometry checks, not nav/controller traversal, engineering/accessibility certification or full joint acceptance.
- CPU renders use Blender 4.3.2 Cycles CPU, 32 samples, neutral area/environment lighting. This Blender build lacks OpenImageDenoise, so denoising is disabled. Actual pixels were inspected and exposed several overlap, framing, UV and tangent defects that were repaired before this candidate freeze.

No Unreal Editor import, browser WebGL render, gameplay, streaming, event/save-reconnect test or hardware performance measurement is claimed.

## Remaining acceptance work

This is a construction candidate, visibly less detailed than the references. The pier/column silhouettes and facings need closer proportions; bronze needs the reference's richer relief, fasteners and edge detailing; marble veining is too regular; floor solar ornament is too thin/simple. Walls/corners, roof gutters and mechanical fixings remain simplified. Clinic door leaf/sweep and full queue footprint remain unresolved; the nominal 2 m threshold footprint currently includes its 0.4 m frame, so the full 2 m clear queue needs an external reservation. Daylight baffle linkage, hard stops and floor-reachable manual release remain missing. Source low-poly surfaces have no final visual approval.

Residential/civic/work fixtures are incomplete layouts. Inside/outside mixed joins, stacked-floor and cross-family boundaries still require full proof. Actual controller navigation, guard/door contacts, damage/repair/event overlays, restored states and protected routes through every state are missing. The broader Phase I/II project remains incomplete; these 17 module candidates do not complete the family, Oath, region or capital.

## Reproduction

Run in a new writable copy of this candidate folder using Blender 4.3.2 and the project's locked Node dependencies. Do not run authoring over the frozen artifact set.

```sh
blender -b --threads 4 --python author.py
blender -b --threads 4 --python fixtures.py
blender -b --threads 4 --python motion-render.py
blender -b --threads 2 --python check-source.py
blender -b --threads 2 --python check-interfaces.py
AETHERION_REPOSITORY=/path/to/Aetherion-The-Fifteen-Oaths node engine-checks/check-glb.mjs all-glb-request.json all-glb-validation.json
```

The recorded request JSONs contain the tested absolute input paths; regenerate those lists from the new output folder before rerunning import checks. `prepare.py` documents the deterministic texture construction (NumPy/Pillow) and source-record capture; its repository path must be set to the actual checkout if regenerated. `package.py` documents manifest/gallery construction. Independent verification is intentionally separate from these author-side results.

## Revision r02 stair repair and immutable lineage

Independent actual visual raycasts confirmed r01's 30 mm terminal body shortened the ninth tread to 270 mm. This revision removes that body from the stair flight. The separate receiving landing's existing 160 mm front fascia supplies riser ten at the exact 2.70 m join. The stair movement wedge and landing-end socket still reach 1.60 m at that plane. The repair changes real geometry and the assembled fixture; it does not relabel the failed dimensions.

[Eight additional actual-geometry checks](stair-revision-validation.json) pass: downward-ray boundary searches at three across-stair positions measure nine 300 mm exposed treads; the last tread remains 1.44 m high through y=2.69999 m and the landing reaches 1.60 m just after the seam. Actual movement collider bounds meet. Independently displaced 15 mm landing-gap and 20 mm landing-step fixtures are rejected. These remain CPU geometry checks, not controller traversal or final stair visual acceptance. Landing guard returns and richer reference matching are still missing.

[Geometry lineage receipt](GEOMETRY_FREEZE.json) records eleven changed artifact paths: two sources, five GLBs, two renders and two metadata files. The remaining 156 module/fixture/texture/reference payload files are byte-identical to r01. The r01 [freeze receipt](lineage/r01-FREEZE.json), [failed independent stair profile](lineage/r01-independent-stair-profile.json) and [independent visual critique](lineage/r01-independent-visual-review.md) are preserved. No r01 artifact was overwritten. Stable archetype IDs retain the existing family identity; only the stair derivative is revised to candidate-r02. The other sixteen modules retain their r01 derivative IDs and bytes.

### Publication paths and collector compatibility

Copy only the final FREEZE allowlist plus FREEZE.json/SHA256SUMS under `assets/production/oath-09/architecture/`. All `files` paths in the runtime manifest are relative to that directory, explicitly declared with `filePathBase: MANIFEST_DIRECTORY`; do not prepend or rewrite them. `sourceValidation.report` is intentionally repository-relative and SHA-pinned to `assets/production/oath-09/architecture/source-validation.json`. A different destination requires a new metadata manifest and freeze.

Only the runtime entry point is named `manifest.json`. Construction metadata is `modules/*/module.json` and `fixtures/*/fixture.json`, keeping collectors from misreading source metadata as runtime manifests. The geometry lineage receipt maps these filename changes using `r01_path`. Source/GLB/render bytes remain those independently tested before metadata migration.

The canopy explicitly declares `collisionPolicy.mode: NONE` because it is non-solid overhead cloth supported by a separate colonnade. The baffle explicitly declares `PENDING` and `CANDIDATE_INCOMPLETE_MISSING_REQUIRED_COLLISION`; its missing moving-body/interaction collision is a remaining required gate, never a waived requirement. Other modules declare `REQUIRED` and supply their separate proxies. The compressed-source validation report records actual Blender opens, tool/version and exact source hashes; each runtime row pins its report and record.

After regenerating source checks and the gallery in a writable copy, run `python finalize-metadata.py` to restore source-validation pins and explicit collision policies before creating a new freeze. Set `AETHERION_REPOSITORY` to the actual checkout when regenerating texture/source-record inputs or reference copies. Guard returns and all previously listed art gaps remain open.
