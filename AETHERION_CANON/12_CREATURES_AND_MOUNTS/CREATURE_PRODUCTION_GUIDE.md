# Creatures, mounts and morphs

Status: PROPOSED unless a record explicitly identifies recovered source evidence. Sources: SRC-USER-DIRECTIVE, SRC-WORLD-PROPOSAL, SRC-ASSET-PROPOSAL and source references named per record.

## Registry contract

CREATURE_MOUNT_MORPH_REGISTRY.json contains90 proposed production requests: six roles per Oath (natural, altered, guardian, boss, mount, morph). Four additional records preserve existing shark, kraken-tentacle, dragon and phoenix/serpent VFX manifestation references. These four records are neither new approved species nor promises of mounts. Named natural/boss/mount entries match ENTITY_CONTRACT.json. All new body plans, ecological behaviors, encounter mechanics and traversal capabilities require approval.

Taxonomy axes are independent:
- Natural: a species with a habitat, food source, ecological role and noncombat behavior
- Oath-altered: a legible modification to physiology or behavior with ecological consequences
- Construct: maintained equipment or built entity with energy, service and recovery needs
- Summon: a bounded manifestation lifecycle, not automatically a biological species
- Guardian: a responsibility or protected location, not a moral alignment
- Rare: encounter schedule/variant flag; no mandatory exclusive power gate assumed
- Elite: distinct behavior and readable extra cue; not merely increased health
- Boss: staged encounter with arena, counterplay, resolution and reset/reconstruction
- Mount: player traversal or transport with rider/driver attachment and movement authority
- Morph: a temporary player form with entry, exit, interruption and rollback

The registry captures ecology, anatomy, locomotion, habitat, behavior, abilities, encounter, traversal, animation, sound, references, relative complexity and dependencies. It intentionally keeps numerical budgets and final rigs unresolved until body-plan approval and platform profiling.

## Production order

1. Establish one neutral scale/ground-contact test scene and rider mannequin.
2. Select representative body plans after approval: small natural fauna, heavy quadruped, flying/gliding creature, mechanized walker, manifestation and player morph. The selection is a reuse strategy, not an approval of unbuilt creatures.
3. Produce anatomy and movement tests before material polish. Reuse a rig only where limb count, proportions and movement demands actually match.
4. Validate ordinary ecological behaviors: feeding, avoiding traffic, sheltering and recovering. Hostility must have a specific reason. A whole Oath is not inherently hostile.
5. Add telegraphed encounter actions and authoritative reset. Damage, collision, targeting and faction ownership are separate from VFX.
6. Author traversal attachment and safe fallback for approved mounts/morphs.
7. Run large-encounter visual/cost/accessibility checks before multiplying variants.

## Boss encounter acceptance

Each boss packet needs a readable entrance, pre-combat warning, protected observer route where appropriate, distinct phase silhouettes, mechanic discovery, reliable counterplay, recovery after failed mechanics, disconnect/death handling and a repeatable encounter reset. Arena collision/nav changes are authored states. Reconstruction prevents permanent route/content loss. A boss’s name and dossier role do not define its finalized mesh or attacks.

Bind any source castable by exact UID through a new encounter definition. The registry's suggested uses do not change source cooldown/range/duration or prove that boss AI exists. Authority chooses targets and consequences; VFX follows the resolved result. Rare/elite extensions must remain understandable without color recognition.

## Mount and morph safety contract

Use contract-mount-morph. Validate legal attach, rider ownership, movement authority, collision footprint, nav surface, controlled transitions, safe dismount and restored baseline state. Invalid terrain or a canceled transformation returns the player to a legal safe placement. Cosmetics cannot expand hitboxes or conceal hostile intent. Housing interiors, low ceilings, narrow doors, water boundaries and contested zones each need explicit permission rules.

The system team's proposed fixture cap of2 owner summon units, with a large drivable summon costing2, is a test fixture. It is not an approved shipping performance limit. Target hardware and measured scene budgets remain unresolved. No polygon count, bone count, morph duration, traversal speed or flight entitlement is asserted approved here.

## Required gaps

No dedicated approved creature/boss/mount/morph turnaround or production animation set was recovered in the114 reference PNGs. Realm overview props and manifestation sequence shapes are partial inspiration only. The source snapshot includes some actual creature/construct model files; inspect their mesh, textures, clips, license and intended runtime use before reuse. File presence is not production acceptance.

## Full source asset preservation index

SOURCE_ASSET_INDEX.json covers197 original source asset paths grouped into112 exact byte identities. The24 source file records in the master registry are the primary sandbox/public subset, not the full source inventory.88 additional unique source byte identities remain indexed outside that primary subset, including source screenshots, duel_hall.glb and its textures, alternate Idle data, and MediaPipe model/WASM support. No source asset was omitted from the byte-preserved snapshot. These items remain unreviewed for production suitability and commercial licensing (DEC-016); a screenshot is not a texture, and a runtime support file is not game art.

## Design review supplement

DISTINCT_CREATURE_DESIGNS.md supplies15 distinct natural-fauna diet/niche/route designs and15 named encounters with body, movement, phase trigger/action/counterplay and consequential resolution. The registry specifies separate altered/guardian/mount/morph body plans. Five boss entries are living human/ensemble conflicts; three additional revised encounters are living ecological conflicts. Their agency and incompatibility of duties are preserved. All90 proposed entries remain PARTIAL_PRODUCTION_SPEC until measured views, detailed animation/balance, environmental simulation and platform validation are completed.
