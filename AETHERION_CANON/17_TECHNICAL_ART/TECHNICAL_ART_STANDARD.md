# Engine-agnostic technical art and content architecture

Status: PROPOSED implementation design, except explicitly identified user-established foundations. Numerical values are bounded prototype hypotheses, unvalidated by playtests or profiling. These documents do not change imported Ability Matrix behavior.

Sources: SRC-USER-DIRECTIVE; SRC-RECOVERED-LORE; SRC-SYSTEMS-PROPOSAL. The first two establish the fifteen covenants and broad game pillars. SRC-SYSTEMS-PROPOSAL identifies design authorship, not user approval. Source runtime claims cite SRC-ABILITY-MATRIX-4c4a1eb at commit 4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451.

## Maturity gates
Concept: prose, sketches, approved references and design hypotheses. It establishes intent only.
Prototype: an isolated asset or system runs under documented conditions; missing production constraints are listed.
Production candidate: authored topology, materials, rig, collision, LOD, dependencies, licensing and integration tests meet the chosen pipeline, with named review evidence.
Validated: the candidate passes representative runtime, platform, network, visual, accessibility and recovery gates at an identified revision. A later material change invalidates affected gates.

These gates are separate from asset workflow labels (Proposed, Referenced, Approved Concept, In Production, Implemented, Validated, Deprecated). An illustration or contact sheet is not a production texture, mesh, rig, atlas or implemented spell. Source-code presence is not a GPU or visual pass.

## Asset decomposition and naming
Use stable asset IDs from the master registry and human-readable filenames. Separate source art, working files, optimized runtime output, metadata and generated previews. A faction kit contains structural modules, trim/material sets, sockets, representative props, collision/nav profiles and variants. Reuse structural systems while preserving fifteen distinct shape/material/motion/sound identities; recoloring one kit is insufficient.

Units: propose meters and a documented forward/up convention per selected engine; converters must record conversion once. Pivots and bounds support snapping and interaction. Keep physical collision dimensions separate from exaggerated silhouettes. Negative scale and mirrored animation require explicit validation. Every export identifies source revision, tool version, transform convention and dependent assets.

## Geometry, materials and instancing
Author hero, gameplay and distant silhouette LODs. Reduce hidden surfaces, layered transparency, material slots and unnecessary skinning before optimizing by raw polygon count. Use screen-space error and importance thresholds, with hysteresis to prevent popping. Static instances share meshes/materials while retaining per-instance gameplay IDs in the authority layer. Destruction variants share sockets and preserve bounds/route logic.

Materials declare opaque/masked/translucent behavior, texture channels, sampler needs, lighting model, displacement limits and feature fallbacks. Build a small reviewed shader library with parameterized Oath-specific variation. Transparent effects need overdraw measurement. Shader compilation and first-use warming are explicit production tasks; no blanket claim that procedural shaders are cheaper.

## Rigging, animation and sockets
Rigs declare hierarchy, bind pose, scale, deformation budget, animation root and retarget rules. Required semantic sockets: grip_primary, grip_secondary, cast_origin, hit_reference, saddle/seat where applicable, tool_attachment and optional VFX anchors. These are proposed semantic names, not existing source bone names. Source rigs must be mapped through an adapter, never silently renamed.

Animation graphs separate locomotion, upper-body casting, reaction, mounting, traversal and interact states. Each clip has timing markers for anticipation, commitment, contact, cancellation and recovery, plus root-motion policy. Gameplay collision follows authority-authored windows; clients do not declare damage from arbitrary animation events. Morphs preserve actor identity and use validated transition poses and safe collision expansion. Large mounts have turn/stop envelopes and rider exit points.

## VFX lifecycle and pooling
Every effect has anticipation, initiation, active/impact, sustain and dissipation phases as applicable. The registry records material, emitter, mesh, light, decal, sound and shader dependencies; source uid and source settings remain separate. Pool effects by compatible resource class, with explicit acquire/reset/release and expiry. Validate stale state, leaked listeners, target references and transforms after reuse.

Gameplay feedback cannot depend on cosmetic particle count. Reserve a low-cost shape/outline for every dangerous area. A contact sheet illustrates phases; it does not prove frame order, timing, alpha, alignment or atlas packing. Texture atlas conversion requires inspected source dimensions, licensing, alpha checks, padding, frame bounds and engine import tests.

## Streaming and world transitions
Partition by region/cell and load dependency bundles ahead of travel. Shared boundary kits bridge climate, architecture, terrain material and audio rather than a hard loading-wall look. Maintain coarse collision and a safe fallback scene until a cell is ready. Never let a mount outrun collision streaming into an abyss. Entry hysteresis and stable spawn IDs prevent thrashing and duplication.

Nav is built from gameplay collision, not VFX. Destructible changes use validated nav links/stage swaps; a runtime edit checks safe connectivity before becoming authoritative. A nav failure selects a fallback route and recovery state. Runtime deformation of arbitrary continent terrain is out of scope unless separately proposed and proved.

## Network, saves and replication
Replicate compact accepted event/state records, not every particle or bone. Clients synthesize cosmetics from deterministic seeds and reconcile from authority. Quantization, interest management, prioritization and interpolation require measured error budgets. Gameplay objects keep stable IDs across cell unload/reload. Owner-private housing or quest state is not broadcast to every client.

Save durable state as content-versioned records plus idempotent transactions. Save neither raw engine object pointers nor transient GPU state. On content migration, validate required dependencies and provide safe placeholder assets that retain original IDs and inventory. Deprecated content remains resolvable through an alias/migration until all saves are handled.

## Engine adapter boundary
The imported Ability Matrix runtime uses its audited technology and dependencies. This document prescribes no target engine. Candidate adapters should isolate asset loading, transforms, animation, materials, sound, physics queries and event playback behind proposed contracts. A target-engine port is a new implementation requiring source parity tests and approval; the migration must preserve the existing source rather than pretending a port already exists.

## Production acceptance
For each gameplay asset: provenance/licensing; readable silhouette; orthographic/scale agreement; mesh/rig deformation; material fallback; LOD behavior; collision/nav; animation contact timing; network ownership; save/load; pool cleanup; platform captures; accessible cues; localization-safe labels; and dependency version coverage. Pass/fail/blocked/human-review evidence must name artifact revision and test scene. Screenshots cannot establish animation correctness, runtime performance or multiplayer authority.
