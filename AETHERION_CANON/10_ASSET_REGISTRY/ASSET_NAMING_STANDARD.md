# Asset naming and revision standard

Status: PROPOSED technical convention. Sources: SRC-USER-DIRECTIVE, SRC-ASSET-PROPOSAL.

## Stable IDs

- asset-reference-000: a reference-image asset record. It points to reference-000, source alias REF-000, Library identity and immutable hash.
- reference-000: a reference index identity. Preserve it when titles or directories change.
- asset-o01-a-characters-family: a production requirement family. Oath numbers01–15 match the locked entity mapping; category codes a–ah match taxonomy.
- asset-castable-linear-ice: a source-runtime visual record for exact UID linear/ice. The source UID remains unchanged in source_castable_uid; the normalized asset ID is only a technical alias.
- asset-source-models-dragon-glb: an actual source binary record. Do not infer canonical species or approval from this name.
- creature-o01-natural, creature-o01-altered, creature-o01-guardian, creature-o01-boss, creature-o01-mount, creature-o01-morph: proposed production requests. Named natural/boss/mount identities use ENTITY_CONTRACT.
- creature-source-casting-dragon: existing castable manifestation evidence; no independent ecology or traversal approval.

When a family is split, mint an item ID such as asset-o01-g-kiln-forearm-guard-001. Never replace the family ID with the first item. Display names may change without identity changes. Record alias/supersession explicitly; never recycle an ID for a different design.

## File and component names

Proposed authoring filename: AET_o01_G_kiln_forearm_guard_001_v001.ext. Use ASCII snake_case for technical filenames, clear display names in metadata, explicit left/right rather than mirrored assumptions, and version increments for approved exports. Include LOD role only on actual verified LOD exports; “lod0” does not make an unreviewed model production ready.

Proposed scene names: geo_<part>, rig_<role>, jnt_<anatomical_part>, socket_<function>, col_<purpose>, mat_<surface>, anim_<action>_<variant>. These are new production conventions, not claims about source runtime names. Preserve imported source paths and identifiers byte-for-byte unless an approved migration maps them.

Keep meshes, render materials, collision, interaction volumes and navigation blockers distinct. A single arbitrary collision suffix cannot describe all four purposes. Use explicit state names intact/damaged/breached/rebuilding/restored only when those states actually exist.

## Manifest and revision

Every export manifest records stable ID, revision, exact references/hashes, canon/production status, approval evidence, scene units/axes, file hashes, dependencies, sockets/rig/clip information, platform tier, license provenance and validation captures. Reference originals remain immutable. New derivatives never overwrite an original reference.

A revision changing silhouette, mechanics, palette authority, collision, skeleton, timing or persistence opens review of affected dependents. ASSET_DEPENDENCIES contains build prerequisites. Reference links and creature associations are semantic relations and do not create prerequisite cycles. A reverse-dependency review is required before changing a shared rig/material.

## Approval evidence

Record the approver, timestamp, exact artifact hash/version and scope. “Proceed,” “continue,” a model-generated filename, a successful build or assistant completion report is not individual final-art approval. A proposed correction remains unresolved until accepted. Deprecation preserves original bytes and provenance.
