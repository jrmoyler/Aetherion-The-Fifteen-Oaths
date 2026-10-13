# Housing, workshops and social space

Status: PROPOSED implementation design, except explicitly identified user-established foundations. Numerical values are bounded prototype hypotheses, unvalidated by playtests or profiling. These documents do not change imported Ability Matrix behavior.

Sources: SRC-USER-DIRECTIVE; SRC-RECOVERED-LORE; SRC-SYSTEMS-PROPOSAL. The first two establish the fifteen covenants and broad game pillars. SRC-SYSTEMS-PROPOSAL identifies design authorship, not user approval. Source runtime claims cite SRC-ABILITY-MATRIX-4c4a1eb at commit 4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451.

## Forms and entitlements
Use an accessible civic apartment as a reliable baseline, elective regional exterior plots, and explicitly shared social rooms. Region/Oath standing can unlock additional architecture and customization, as in recovered lore, while an existing purchased/earned entitlement and its contents remain recoverable after standing loss. Scarce exterior locations require transparent allocation; instanced interiors prevent permanent exclusion from housing. The final ownership/lease model is an open product decision, not a promised land-sale system.

Store the entitlement, parcel location, interior layout, object inventory and guest permissions separately. Moving home transfers contents through an atomic relocation transaction. Region conquest changes exterior civic presentation and services, not the ownership ledger. No real-property legal rights or real-money value are implied.

## Building and interiors
Place modules on authored sockets or a validated free-placement grid. Each object declares footprint, collision, doorway clearance, nav impact, support, light/audio budget and network ownership. Preview invalid placements and the exact reason before commitment. A safe entrance, exit and accessible route to storage/workstations cannot be blocked. Decor supports snapping, undo/redo, copy within ownership, symmetrical placement and controller-friendly editing.

Fifteen HOUSING_PROFILES provide region-specific form, ambient response and workshop identity. Their differences include insulation, drainage, grounding, anchor design, wind baffling, living growth envelopes and private ritual/stage space. These are functional architectural differences, not fifteen recolors.

## Social permissions
Owner can set visitor access, approved decorators and bounded workshop use. Permissions are deny-by-default for modifying layouts, opening storage and consuming materials. A guest preview states whether a workshop uses the guest's or a shared supply. Public open-house discovery exposes only the information the owner opts to show. Block/remove guest controls preserve a safe return point. Voice/chat tools, if added, require their own moderation/privacy design; they are not implied existing systems.

## Workshops and upkeep
Workshops add service capacity, recipes, training or hospitality, not mandatory combat stat inflation. Upkeep represents optional productive inputs such as fuel, filter media, nutrients or calibration stock. Missing inputs pauses that workshop's bonus and explains how to resume. It never deletes decorations, kills animals, evicts an inactive player or accrues surprise debt. A caretaker mode preserves gardens and husbandry with bounded yields while absent.

## World events and siege
External ash, frost, flood or phase effects use reversible authored facade overlays. Interior storage, permission state and safe access are protected. A siege can damage designated public fortifications on a plot's perimeter only where the plot contract explicitly marks them; it cannot destroy player furniture. Reconstruction is automatic at a service deadline, with optional player-driven early repair. Access a stable housing recovery menu if world streaming or nav is unavailable.

## Save and recovery
Every accepted edit uses plot id, object id, expected revision, owner permission and idempotency key. Append reversible edit commands plus periodic compact snapshots. Validate dependencies before applying; missing/deprecated assets use a labeled fallback and retain the original reference for later restoration. If a module is removed by a content migration, quarantine its contents into owner-only recovery storage, never delete them. Restore snapshots with a preview and preserve later unrelated inventory transactions.

## Prototype budgets and accessibility
Initial fixture per interior: 150 placed objects, 8 dynamic interactive objects, 4 shadow-casting local lights and 2 ambient audio loops; all unprofiled and subject to measured platform budgets. Instanced static decoration can render more cheaply than physics objects, but must still pass draw/streaming measurement. Budget UI reports cost before placement.

Offer step-free templates, navigable menus, large placement outlines, shape/icon-coded validity, reduced motion, text labels for sound controls and independent audio levels. Save localized player-authored text as moderated content with language metadata and length limits; translation never changes identifiers or permissions.

## Acceptance tests
Region control change retains all ownership and contents; guest cannot withdraw ungranted goods; a failed relocation preserves either old or new home intact; lost connection cannot duplicate furniture; snapshot recovery does not revert unrelated trades; expired upkeep cannot evict; every regional profile has a stable accessible exit and baseline storage path.
