# Reference-to-production handbook

Status: PROPOSED production process. Source facts are separately marked RECOVERED. Sources: SRC-USER-DIRECTIVE, SRC-ASSET-PROPOSAL, SRC-ABILITY-MATRIX-4c4a1eb and the reference IDs in REFERENCE_INDEX.json. Existing approved artwork takes priority over a new proposal. No new images were generated in this production pass.

## 1. What has actually been recovered

114 distinct PNG files have been materialized, decoded, hashed and inspected at contact-sheet/montage level. Their original Library identities are preserved. Portable repository copies are addressed as assets/references/reference-NNN/original.png; verify the recovery manifest and hashes after copying.

- 15 realm overview sheets. Each includes ninja, sorcerer, armor, weapons, items/assets, environment and cast studies.
- 7 silhouette/correction sheets, including a separate Light & Holy correction candidate. The six group sheets and the correction are not seven independent approved character sets.
- 30 character turnarounds, two roles for each Oath. Front/back/side/three-quarter, face detail, material, attachment and rigging-guide sections are visible. REF-091 also has a backpack-removed view.
- 31 weapon/armor construction images: 15 armor assemblies and 16 weapon sheets. The extra Folded Theatre weapon variant is preserved, not silently deleted or selected as final.
- 31 VFX sheets: Fire10, Frost6, Lightning9, Water6. These link to31 actual source UIDs. The audited source catalog contains100 castables, so69 source castables do not have a dedicated VFX reference in this recovered set. This is an inventory-scoped gap, not proof no image exists elsewhere.

A montage is a visual inspection aid, not a texture atlas. A painted sequence is not an aligned spritesheet, clip, particle emitter or material. No panel layout establishes frame count, alpha, timing, exact scale, collision, simulation or runtime cost. No final-art approval is inferred from “continue” or from an image existing.

## 2. Authority and preservation

1. Locate the exact reference ID, hash, source conversation and any exact-scope approval.
2. Preserve the original PNG and metadata without resampling, retouching or overwriting it.
3. Record observations separately from design decisions. “Visible brass collar” is an observation; “this is the final faction emblem” needs approval.
4. If references disagree, open a conflict with both IDs, affected parts and a proposed resolution. Keep both usable until the user resolves it.
5. For source castables, the pinned source implementation/preset governs behavior. A painted label can guide comparison but cannot alter range, duration, effect count, targeting or damage.
6. Do not promote an image record from Referenced to Implemented. A derivative mesh/material/animation gets a new asset ID and retains reference links.
7. Licensing/provenance review DEC-016 precedes commercial distribution claims or production reuse of third-party source models/textures.

Current conflicts include REF-092/094 correction scope, REF-036/037 weapon variants and overview/turnaround palette or silhouette differences. See ART_CONFLICT_LOG.md. Assistant-reported supersession is a candidate, not user approval.

## 3. Character turnaround packet

Required output for a model-ready character:

- Front, rear, left profile, right profile and three-quarter views aligned to a shared baseline and measurement grid. Keep asymmetry explicit. Do not mirror an asymmetric design to invent a hidden side.
- Neutral rigging stance, limb lengths, shoulder/hip breadth and player-relative scale. Use a shared scale prop; final numeric size requires approval.
- Unmasked face front/profile/three-quarter, ears, hairline, hair volume and mask removal/attachment. REF-063,065,068,069,073 do not clearly establish an unmasked face in the reviewed montage.
- Expression and phoneme set with eye, eyelid, jaw and mouth limits. Existing face closeups do not satisfy this requirement.
- Underlayer, intermediate garments, rigid armor, weapons and removable attachments shown separately. State cloth versus rigid treatment and what deforms with the body.
- Hand/foot contact studies, glove grip, heel/toe bend, crouch and seated/rider clearance.
- Palette under neutral calibrated lighting; material roughness/metalness/opacity intent, wear and repair logic. Painted swatches do not constitute exported texture maps.
- Skeleton proposal, attachment sockets, deformation danger zones and collision proxies. A painted rigging diagram is not a rig or valid skin weights.

Review sequence: silhouette comparison -> exact-reference match -> missing-side resolution -> neutral graybox -> joints and grip -> material calibration -> gameplay camera -> crowded scene. Preserve each recovered role's distinct proportions. Sharing a compatible skeleton does not authorize sharing identical armor across15 recolors.

## 4. Weapon and focus construction packet

Show front/back/left/right/top/bottom orthographic views, three-quarter assembly, exploded components and a scale comparison. Mark blade/action edge, protected hand area, grip diameter target, one/two-hand positions and center-of-mass intent. Numeric dimensions remain proposed until approved.

Every moving assembly needs pivot location/axis, mechanical range, hard stops, fasteners, attachment sockets, cables/hoses and contact clearance. Include carried, stowed, drawn, deployed, charging, active, cooldown, damaged and repaired states where applicable. Spellbooks/codices need page, hinge and hand clearances; floating foci need their actual support or suspension rule.

Keep collision volumes separate: pickup, hand attachment, melee hit sweep and movement obstruction have different uses. Do not infer a damaging blade from decoration. Check alignment with the intended cast/attack animation rather than forcing the hand through the painted grip.

Deliver a component manifest, mesh naming/pivots, material assignments, socket map and state-transition diagram. Construction illustration alone does not supply them.

## 5. Armor and equipment construction packet

Show body underlayer first. Then layer pieces in actual dressing order. Each plate/panel needs left/right identity, attachment method, strap routing, fastener, flex boundary, rigid/soft ownership and removable/equipped states.

Test shoulder elevation, elbow flexion, wrist rotation, spine bend, hip lift, knee flexion, crouch, dodge, casting and riding. Review the kiln backpack, relay aerial collar, water reservoirs, resonator collar, gardener basket, poison apparatus, Observatory counterweights, Sanguine hoses, temporal pendulum and Foundry actuators for body/weapon/environment collision.

Weights must be validated on the exported skeleton. Rigid pieces may use rigid attachment or constrained bones; skirts, ribbons, hair, pipes and hoses need explicit simulation/animation fallback choices. Preserve the silhouette if simulation is disabled. Attachments must not hide critical combat tells.

No universal plate mesh with fifteen colors. Reuse hinges, straps or technical subcomponents where appropriate; retain each Oath's material construction, volume distribution, joints and equipment function.

## 6. Environment and architecture packet

A realm panorama establishes motifs and mood. It does not define traversable topology, exact entrances, interior depth, roof coverage or navigable collision.

Required packet:
- Exterior module kit with floor/wall/arch/corner/roof/door/stair/railing variants, snap grid, seams, player scale and structural logic
- Interior plan/section with entrances, usable door swing, circulation, ceiling clearance, service/storage/work areas and accessible route
- Landmark elevations, silhouette/vista studies and measured approach path
- Traversal and encounter blockout: sightlines, cover, target visibility, choke points, escape/recovery and safe spawn
- Weather/day/night response, sheltered variant, wet/dry/frozen/heat exposure and material transitions
- Intact/damaged/breached/debris/rebuilding/restored versions, collision/nav swaps and authoritative event ownership
- Realm-border ecotone, road/watercourse continuity and neighboring material blend consistent with WORLD_GRAPH
- Ambient and interactive prop placement, audio emitters, profession stations and housing modules

Build graybox/nav tests before finish art. Architectural material identity cannot make every surface reflective or emissive. Budget a neutral background behind crowded fights. Destruction stays bounded to authored state changes with reconstruction; no permanent player-caused loss of essential routes.

## 7. Creature, mount and morph packet

The94 registry entries are90 proposed production requests and4 recovered manifestation references. They are not94 built creatures. The named natural, boss and mount requests align with the world entity contract. A spell-shaped dragon/shark/tentacle/bird does not prove an ecological species or rideable mount.

For each approved body plan: front/rear/both profiles/three-quarter/underside where needed; skeleton and joint range; mouth/feet/tail/wing or mechanical articulation; scale; habitat posture; locomotion contacts; attacks; warnings; hit/recovery; damage/repair; dismissal/reset. Include sound/caption cues and ordinary noncombat behavior.

Mounts require rider/driver positions, tack, grip, leg/weapon clearances, mounting/dismounting, turning, braking, uneven ground, crowd collision and invalid-surface fallback. Gliders/hover platforms follow authored route envelopes and must not bypass access or nav constraints. Morphs require enter/active/exit/interrupted-exit/rollback plus retained player identity and safe placement. Visual skeletal LOD must not change authoritative collision.

## 8. VFX production packet

For each exact source UID, compare reference and running source before changing visuals. Capture evidence of:
1. Anticipation: player decision and hostile warning, readable shape without color
2. Initiation: emitter hand/socket or ground anchor, orientation and ownership
3. Travel/formation: trajectory, altitude, footprint and occlusion
4. Active/impact: actual contact boundary and target reaction
5. Sustain: authoritative duration, repeated-hit semantics and interruption
6. Dissipation: emitter stop, particle finish, decal lifetime and cleanup
7. Interactions: wet/heat/frost/etc. responses through the bounded system contract
8. Accessibility and budget: no mandatory recognition by color, sound or flashing alone; camera shake/flash controls; actual profiling

Document effect layers separately: mesh, particles, ribbons, decals, shader, light, camera response and audio. A painted “isolated layer” is not an exported alpha asset. Frame extraction requires explicit crop rectangles, alignment, padding, frame count, framerate, premultiplied/straight alpha and import test. These have not been verified for the recovered sheets and must not be guessed.

Keep friendly/enemy/neutral distinctions in border shape and iconography. Maintain danger geometry beneath cosmetic foam, smoke, sparkle and weather. Use limited cosmetic response cascades; authoritative interactions follow contract-interaction-resolver. Pool particles and sounds separately from gameplay state. Source unchanged lifecycle and balance tests precede a cosmetic refactor; visual similarity never substitutes for behavior equivalence.

## 9. Handoff and acceptance checklist

Each derivative deliverable carries: new stable asset ID, exact source references/hashes, version, authoring file, export files, scene units/axes, dependencies, license provenance, intended platform/tier, status, approval evidence, review captures and reproducible tests. Asset status is separate from canon status and runtime migration status.

Gate A reference: identity/approval/conflicts understood.
Gate B concept: exact silhouette/material/function acceptance, missing views resolved.
Gate C build: topology/UVs/rig/pivots/sockets/source files exported and reproducible.
Gate D integration: animation, collision, nav, interaction, persistence and source behavior checked.
Gate E visual: gameplay-camera readability, all relevant Oath comparisons, lighting/weather and accessibility.
Gate F platform: representative device/scene measurements, LOD/streaming/memory/overdraw, rollback and recovery.
Gate G production: legal/provenance review, final approval and traceable packaging.

Only move to Validated after the applicable gates have evidence and reviewers. A concept approval, code import, screenshot, successful build or file count alone is insufficient.

## Full source asset preservation index

SOURCE_ASSET_INDEX.json covers197 original source asset paths grouped into112 exact byte identities. The24 source file records in the master registry are the primary sandbox/public subset, not the full source inventory.88 additional unique source byte identities remain indexed outside that primary subset, including source screenshots, duel_hall.glb and its textures, alternate Idle data, and MediaPipe model/WASM support. No source asset was omitted from the byte-preserved snapshot. These items remain unreviewed for production suitability and commercial licensing (DEC-016); a screenshot is not a texture, and a runtime support file is not game art.
