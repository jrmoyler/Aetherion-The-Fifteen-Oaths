# Environment construction handbook

Status: PROPOSED. This is an implementation-ready authoring contract, not implemented art, an approved engineering design, or validated runtime performance. Source: P2-SRC-FOUNDATION, P2-SRC-DIRECTIVE, P2-SRC-PROPOSAL. The read-only foundation is [commit 5dce9e](https://github.com/jrmoyler/Aetherion-The-Fifteen-Oaths/tree/5dce9edae0bb3587eb7c72433395e7d5a19857ea/AETHERION_CANON). The original Ability-Matrix source is unchanged.

## 1. How to use this package

1. Find the region's `p2-arch-NN-*` record. Its `baseline_asset_id` is the existing production-family identity; the Phase II ID identifies this refinement specification, not a replacement asset.
2. Find applicable shared requirements in ENVIRONMENT_ASSET_REGISTRY.json. The `p2-env-09-shared-*` prefix uses Daybreak as an integration-pilot namespace only. `region_ids` and `oath_ids` establish continent-wide applicability; the prefix does not award ownership or locate every asset in Daybreak.
3. Read `baseline_refinements` and the relevant `regional_variants`. A regional variant is justified by terrain, physical process, structural form or interaction. If only hue changes, use a parameter and do not commission another mesh family. Unlisted local variants reuse common substrate through the local kit.
4. Review the actual original using the record's REF ID, repository-relative path, commit link and SHA-256 in ENVIRONMENT_REFERENCE_EVIDENCE.json. All 114 files decode and match baseline hashes. Only REF-099 through REF-113 were directly inspected this phase; other visual interpretations remain baseline evidence, not new inspection claims.
5. Produce the smallest representative blockout that can prove the functional requirement. A residential, civic and work assembly per kit are acceptance fixtures. They are not a mandate to place a fixed number of houses, towers or shops in each realm. Settlement population, services, topography and travel demand determine quantities later.
6. Submit the exact artifact/revision for art and licensing review, then technical review. An overview panorama supplies neither orthographic consistency nor approved dimensions. Every registry record remains PROPOSED_NOT_BUILT.

## 2. Reference limits and design deltas

The fifteen sheets show strong shared presentation conventions, including monumental courts. A court composition is not evidence that every capital has the same circular arena, nor a instruction to copy identical level plans. Preserve local silhouettes/material hierarchy while making ordinary residential, service, storage and trade spaces physically plausible. In particular:

- Kiln's vented mass and heat channels become isolated work bays and cool courts, not lava through every front door.
- Rime's ice cliffs and crystal-like fixtures become replaceable outer ice treatment around insulated occupied stone rooms; no unsupported thawing archive shell.
- Storm's connected pylons become grounded service structures above protected ordinary paths.
- Tidal's cascades and terraces become managed mainland waterworks with dry refuges, not disconnected essential island services.
- Fault's strata and crystal seams become surveyed inclusions around load-bearing stone joints.
- Reed's sails and ribs require anchors and stow states, and wind-independent ground access.
- Graft's root-like structures need growth envelopes and replaceable infill, with firebreaks and ground routes.
- Bitterglass's vessels and pipework require bounded dirty-process bays, separate clean water and protected markets.
- Daybreak's colonnades and shade support clinics and ordinary shelters as well as civic authority.
- Observatory's floating imagery is bounded Oath infrastructure; normal public paths remain grounded and safe when it shuts down.
- Missing Court's absent surfaces are controlled presentation/state effects around stable thresholds and fallback routes.
- Sanguine's cloisters and drapery support mutual care and private withdrawal; circulation never coerces participation.
- Folded Theatre's reversible panels sit inside a consistent load-bearing frame with a readable backstage route.
- Escapement's viaducts expose maintenance and safe locked states, plus ordinary fixed routes and wildlife crossings.
- Impulse's cranes and vessels separate industrial load/exhaust zones from sheltered human-scale civic space.

These are proposed reconciliations with the baseline dossiers, not additional facts supposedly visible in the sheets.

## 3. Units, coordinate and naming contract

- Author in meters. Propose a right-handed source convention, +Y up and +Z forward, and record it in every source/export manifest. The selected engine's adapter applies axis/unit conversion exactly once; engine selection remains open.
- Freeze applied transforms before export; unit scale 1, no unreviewed negative scale. Mirror geometry explicitly and verify tangent handedness, UV orientation and collider winding.
- Origin is the lower southwest footprint corner on floor datum for grid modules; articulated parts use their actual hinge/axle as local origin. A manifest records the offset between assembly origin and mechanism pivot.
- Structural grid: 0.25 m. Initial 4 m bay and 3.2 m floor-to-floor targets are tunable hypotheses. Monumental shells may use multiples; decorative detail does not move snap interfaces.
- Use stable baseline asset ID plus revision for output identity. Phase II spec IDs belong in `specification_ids`. Never rename baseline entities as part of refinement.
- Proposed module filename: `<baseline_asset_id>__<module_name>__<revision>`. Runtime bundle key: asset ID + revision + content hash. Names are human-readable and descriptive, not engine object identity.

## 4. Modular connection contract

Each socket contains name, semantic type, local position in meters, orientation, compatible partner types, clearance bounds and occupancy rule. Required semantics where applicable:

- `structural_edge`: continuous wall/deck seam; opposing outward normals, same datum.
- `floor_datum`: occupied finished floor, independent of foundation depth.
- `landing_start`, `landing_end`: traverse links with width, height and slope constraints.
- `door_clear`: measured clear opening after trim, handle and open leaf.
- `utility_pass`: pipe/cable/service chase; not a walkable opening.
- `attachment_static`: trim, sign, lamp or furniture; records supported mass class and owner.
- `mechanism_axis`: hinge or translation axis with limits and swept exclusion volume.
- `boarding`, `seat`, `dismount_safe`: transit actor and exit sockets.

Connection pass criteria are proposed numeric QA tolerances, not a statement of existing accuracy: seams within 0.005 m position and 0.1 degree orientation; floor collider steps no greater than 0.01 m at nominal joins; no T-junction opening visible under grazing light. Test straight runs, inside/outside corners, stacked floors and mixed-family boundaries. A skin or trim overlap may hide a visual seam only after collision/nav continuity is proved. Expansion joints may visibly separate structure but must preserve independent traversal cover.

Code validators should compare typed sockets and transformed bounds rather than trust filenames. Reject unmatched socket types, duplicate occupied slots, nonuniform scale or missing axis metadata. Error output names both asset IDs, revision and offending socket. Never silently stretch a door to make incompatible modules fit.

## 5. Door, stair and accessible-route fixtures

These are initial design targets to be calibrated against the selected player/controller and large NPC/vehicle envelopes; they are not legal accessibility certification.

- Occupied public doors: 1.2 m clear width by 2.4 m clear height minimum target. Proposed player clearance fixture: 0.4 m radius, 1.8 m height, tested with carried-item variants. Actual character collision selection remains a dependency.
- Use a 1.8 m clear circulation route and 1.8 m square turnaround fixture in prototype interiors. No door leaf, counter queue, housing prop or particle spectacle consumes this protected space.
- Stairs: initial 0.16 m rise / 0.30 m tread; 20 risers achieve the 3.2 m floor target. Split into two flights with a landing at least as deep as the clear stair width. Provide guardrails and headroom.
- Navigation uses a smooth stair traversal proxy; foot placement may use visible treads. Test walking, running, reverse traversal, stopping, camera collision and companions; no invisible shortcut through a balustrade.
- Ordinary step-free route: target gradient no steeper than 1:12 with landings. A 3.2 m rise therefore needs at least 38.4 m run before landings: do not pretend one 4 m module climbs a whole floor. Use switchbacks or grade-led route design. If local footprint cannot accommodate it, redesign the circulation; a mandatory Oath power is not a substitute.
- Doors must open away from trapped occupants or supply a reliable release. Occupancy cancels automatic closure. A stopped mechanism never blocks all exits.
- Test public road → service counter → shelter/storage → public road at normal, hazard, closed, damaged and restored states. Save/reconnect during each state. Pass requires a stable route without Oath binding.

## 6. Materials, UVs and texel density

- Build material boards from the referenced hierarchy, then review under one neutral lighting setup. Painted colors are not calibrated PBR values. No broad image-projection shortcut turns a reference panel into licensed production textures.
- Separate structure, infill, weathering and interactive surface tags. Steel, brass, wood, porous stone, felt, ceramic, ice, water and glass require distinct response and cost testing; a hue shift does not prove material identity.
- Initial texel targets: 512 px/m for ordinary close-view architecture, 1024 px/m for inspected props/trim, and 128–256 px/m for non-interactive distant masses. These are review hypotheses, not approved memory budgets. Provide the measured density distribution and expected viewing distance.
- UV0 is the documented material coordinate set. UV1 is non-overlapping lightmap space only if the selected pipeline needs it. Texel checker tests must pass before beautification; mirrored/stacked UVs are explicitly marked, prohibited for unique signs and directional writing.
- Pack normal maps with documented tangent basis; mark linear vs sRGB channels and packed-channel semantics. Pad islands for the intended mip chain, then test actual imported texture mips for bleeding. No arbitrary universal gutter value promises correctness for every resolution.
- Prefer reviewed trim/material reuse and instancing. Preserve enough geometry to retain regional construction silhouette. Every extra material slot, translucent layer, displacement or shadowed light must state why it is needed.
- Decals follow traffic, moisture, heat and repair. Blood-like, poisonous or luminous appearance alone does not assign a gameplay hazard. Author hazard tags separately.

## 7. Collision, navigation and mechanism authority

Maintain separate representations for movement/nav, attack/hit, interaction reach, hazards and cosmetic detail. Decorative leaves, pipes and cables are non-colliding by default; trunks, rails, occupied decks and cover use intentional simplified shapes. Test both missing collision and invisible snagging.

A mechanism exports fixed and moving bodies, typed pivots, limits, swept bounds, state IDs, local input affordance and safe fallback. Before movement, reserve the swept area and suspend affected nav links. If occupied, wait or cancel visibly. A stalled system reverts to a safe locked state. Never relocate an actor into overlapping geometry to conceal a bad transition.

For destructibles, author intact, damaged, cleared and rebuilt states. Authority changes state only after validating the proposed route and collision/nav bundle. If validation fails, keep the prior safe state and log a diagnostic. Debris may visually disappear when pooled; the authoritative obstruction and recovery clock are explicit. No arbitrary terrain deformation, irreversible civilian storage destruction, or invisible change to an existing source castable is authorized.

Terrain joins need continuous collision before decoration. Water has explicit shore, depth/hazard and swimming/boat volumes if those mechanics are approved. Rendered water level and gameplay water level must match within a tested tolerance chosen for the mechanic; no tolerance is asserted here without engine tests.

## 8. LOD, occlusion, streaming and environmental effects

Each asset supplies near, gameplay-distance and far silhouette representations where beneficial; very small props may instead cull. LOD is driven by screen-space error, importance and hysteresis, not one distance copied across all hardware. Screen-space thresholds remain unapproved until captures exist. Doors, landing sockets, silhouettes used for navigation, authoritative cover and essential danger cues remain consistent.

Group HLODs only where hierarchy, occlusion and independent state ownership permit it. A changing gate must not be baked into a static distant wall that shows it open when closed. Interactable objects retain identity even when their decorative representation is pooled.

Load shared foundations, collision/nav and low-cost hazard cues before decorative detail. One resource ownership/refcount contract prevents duplicate shared boundary loads and premature disposal. Never let a vehicle or mount outrun collision readiness. On failure, stop at a legible stable boundary, preserve a return point and retry safely.

Ambient VFX exports source/start/active/end lifecycles and pooling reset requirements. Reset transform, emitter age, material overrides, target reference and local lights before reuse. Weather shelter masks and hazard exposure volumes are authoritative inputs; particles are presentation. Reduce transparency overlap, shadow count and cosmetic density before removing essential warnings. Reduced-motion, reduced-flash and caption/shape alternatives preserve meaning.

## 9. Housing and civilian content safeguards

Housing shares shells and technical joints with the local kit but has separate entitlement, object inventory, permission and placement records. Placement rejects blocked exits, storage access, unsupported loads and overlapping mechanisms before commit. Display the exact failure reason. Undo/redo and relocation preserve original identities; missing assets use labeled recoverable placeholders.

Upkeep can pause optional workshop output, never delete possessions or evict an inactive player. Reversible facade/event states do not change ownership. Shared services, accessible streets and private withdrawal spaces survive local emergency closures. Shops, clinics, waste collection, food storage and repair yards are functional civilian infrastructure, not decorative combat arenas.

Wildlife entries refine existing `creature-oNN-natural` records. Species anatomy, size, rig and animation are still missing-production requirements. Natural habitat/feeding/migration behavior is not inferred from fantasy armor or mechanical creature props in the reference sheets. Mount and altered forms remain separately governed baseline records.

## 10. Deliverable and automated-check contract

A proposed bundle manifest must carry:

- baseline asset ID, specification IDs, revision, source content hash and exported content hash;
- source tool/version, units, axes and applied conversion;
- mesh/LOD payload list, triangle/vertex/material counts and bounds;
- material/texture/channel list and measured texel density;
- socket transforms and compatibility types;
- movement/hit/interaction/hazard shapes and state-scoped nav links;
- animation/state names, pivot/axis/limits and event marker contracts where relevant;
- dependencies by stable ID/revision/hash with shared residency ownership;
- licenses/approval evidence, reviewer, date and exact artifact scope;
- acceptance report with pass/fail, captured scene, build, settings and unresolved gaps.

Suggested coding-agent checks: schema validation; unique IDs; referenced IDs resolve; dependency graph acyclic; hashes match; transform and units agree; socket types/clearances compatible; state outputs complete; protected-route graph connected; reference/art/license gates present. A schema pass proves structure only. Screenshot or geometry inspection, actual gameplay traversal, audio/accessibility testing and profiling remain independent tests.

## 11. Work sequence, costs and acceptance gates

P0: shared material/export contracts, terrain/roads, one functional blockout per regional kit, ordinary service/exit circulation, mechanisms and housing safety. P1: local habitat and civil logistics, room/vehicle/dungeon state coverage, lighting and effects. P2: optional occupation clutter and cosmetic polish after readability tests.

Cost planning records unique geometry, material permutations, articulation, state count, animation needs, source gaps, review effort and integration risk. Relative low/medium/high labels are sequencing estimates; no labor hours, money, triangle budget, FPS or residency target has been benchmarked or approved. Reuse technical infrastructure before ordering variants; complex transparent/anomalous structures and moving stateful assets require separate spikes.

Gate A — reference/concept: exact sheet/version reviewed, material hierarchy preserved, licensing resolved for intended use, absent dimensions/hidden faces explicitly designed.

Gate B — blockout: scale fixture, sockets, protected circulation, route connectivity, process separation and regional silhouette comparison pass. Test fixtures prove need; no arbitrary asset quotas.

Gate C — production candidate: source/export manifests, UV/materials, collision, LOD, state variants, animation and audio/caption contracts complete; reproducible build and no broken dependencies.

Gate D — integration: movement, interaction, streaming, save/reconnect, housing recovery, weather/event state changes and Oath-independent access tested in representative scenes.

Gate E — validation: named reviewers accept exact hashes; hardware/resolution/build/settings recorded; CPU/GPU percentiles, memory, load stalls and accessibility/readability evidence pass agreed targets. A failed or changed revision reopens affected gates.

Current result: planning structure, reference identity and proposal coverage only. Zero new production models, textures, rigs, animations, engine scenes or validated benchmarks are included.
