# Asset taxonomy A–AH

Status: PROPOSED production taxonomy; category coverage is required by SRC-USER-DIRECTIVE. The34 categories below describe families of work. A family record is not a claim that a model, clip, texture or sound exists.

| Code | Category | Required family components | Acceptance focus |
|---|---|---|---|
| A | characters | Ninja; sorcerer; civilian worker; public-service NPC; militia variants | Readable role silhouette, body diversity, face/body customization, sockets, neutral pose, ownership labels |
| B | turnarounds | Front; back; both profiles; three-quarter; neutral pose; scale companion | Align views on a shared grid; resolve asymmetry and hidden geometry; preserve approved reference |
| C | face-expression | Neutral; exertion; concern; concentration; speech shapes; mask off/on | Face topology, eye/teeth separation, facial rig and expressions under consistent lighting |
| D | combat-animation | Idle; walk/run; start/stop; dodge; casts; weapon attacks; hit; recovery; interaction | Clip timing from source or approved design; root motion/in-place choice, socket grip, interruption and foot contact |
| E | weapons | Recovered ninja weapon; sorcerer focus; carried/stowed state; damaged state | Grip geometry, mass direction, readable action edge, safe sockets and independent pickup collision |
| F | weapon-construction | Orthographic views; exploded assembly; mechanism; grip; socket; deployed/stowed | Measured components, pivot axis, tolerances, moving parts and clear attachment diagram |
| G | armor | Ninja kit; sorcerer kit; independent armor; modular body fit variants | Joint clearances, silhouette recognition, cloth/rigid separation, attachment and equip compatibility |
| H | armor-construction | Outer plates; underlayers; fasteners; harness; flex views; joint limits | Test shoulder/elbow/hip/knee ranges, no painted straps mistaken for real connections |
| I | civilian-clothing | Worker; merchant; healer/service; artisan; weather layer | Occupational silhouette, pockets/tools, affordable repair, readable fabric ownership |
| J | ninja-equipment | Mask; belt; pouch; role tool; back rig; optional mobility attachment | Stealth equipment serves physical function; cloth noise and stow states; no generic recolored ninja |
| K | sorcerer-equipment | Focus mount; reagent case; reservoir; collar/back apparatus; casting tool | Hand access, apparatus pivots, maintenance state and cast socket clearance |
| L | items-consumables | Raw material; refined item; consumable; container; quest prop; charged/depleted | Inventory/drop/equip/use states, stack identity and source-approved gameplay label |
| M | crafting-stations | Primary craft bench; gathering tool; processing station; maintenance rack | Input/output locations, operator stance, work cycle, failure-safe animation and repair state |
| N | architecture | Floor; wall; arch; corner; gate; roof; support; landmark | Snap units, compatible seams, load-bearing logic, door clearance, sightlines and traversal |
| O | buildings-interiors | Civic hall; workshop; dwelling; service building; dungeon threshold | Exterior/interior match, entrances, accessible routes, furnishing density and streaming doorway |
| P | environment-props | Signage; storage; utility; seating; light; transit fixture; damaged variant | Scale cues, interaction sockets, collision classification, repair/change-state ownership |
| Q | vegetation-geology | Ground cover; canopy/shrub; rock strata; mineral node; soil/water margin | Biome logic, harvest silhouettes, wind response, seasonal variation and distinct resource cues |
| R | creatures-enemies | Natural fauna; Oath-altered enemy; guardian/construct; rare/elite variant | Anatomy, movement rig, ecology, readable attack states, accessibility and encounter purpose |
| S | bosses | Boss body; arena fixtures; phase states; vulnerable structures; aftermath | Phase silhouettes, attack tells, interruption/recovery, arena escape and reset without permanent loss |
| T | mounts-morphs | Mount body/vehicle; saddle/driver; mounting; locomotion; morph enter/exit | Collision/navigation, rider fit, transformation fallback, safe dismount and server authority |
| U | vehicles | Cargo carrier; service vehicle; driver/passenger positions; idle/active/damaged | Route clearance, chassis/locomotion rig, cargo ownership and safe blocked-route fallback |
| V | siege-equipment | Siege platform; emplacement; supply fixture; damaged/repaired state | Crew access, loading/recoil, counterplay silhouette, bounded destruction and reconstruction |
| W | castable-vfx | Anticipation; initiation; travel/formation; active; impact; sustain; dissipation | Pinned source UID and behavior; independent cosmetic layers, team cues, pooling and overlap tests |
| X | environment-vfx | Residue; contact reaction; ambient hazard; recovery; infrastructure state | State owner, source/target tags, priority, visual versus gameplay scope, cancellable lifetime |
| Y | weather-vfx | Local weather; wind response; visibility envelope; transition; sheltered variant | Readable telegraphs through weather, bounded density, safe flashing, scalable occlusion |
| Z | ui-symbols | Crest; ability glyph; item thumbnail; reticle; hazard; faction standing | Monochrome recognition, color-vision support, localized labels and controller focus states |
| AA | audio-music | Ambient bed; material foley; role exertion; combat cue; profession cue; music stems | Mix hierarchy, subtitles/captions, distance attenuation, concurrency and silence-safe critical cues |
| AB | cinematic | Opening/campaign scene; camera block; acting; prop; lighting; accessible captions | Branch-safe actors/props, skip behavior, continuity, lip sync and player customization |
| AC | world-events | Dormant; warning; active; escalated; resolution; repair; reset | Event lifecycle, crowd readability, owner scope, persistent-state boundaries and reconstruction |
| AD | housing | Plot boundary; exterior; interior; furniture; workshop; social display | Ownership, snap/collision budget, visit permissions, accessibility and non-punitive recovery |
| AE | puzzles | Readable input; mechanism; feedback; hint; solved/reset; fail-safe | Deterministic state, accessible redundant cues, anti-softlock path and multiplayer arbitration |
| AF | terrain-transitions | Blend terrain; shared watercourse; road seam; biome ecotone; landmark vista | No disconnected island logic; adjacency agreement, navigation seam and visual continuity |
| AG | destructible-statechanges | Intact; stressed; damaged; breached; debris; rebuilding; restored | Bounded authored topology, collision/nav swaps, authoritative state and reversible reconstruction |
| AH | decals-materials-shaders | Calibrated material swatches; tileables; trims; decals; effects shaders; wear masks | Consistent light calibration, measured shader cost, UV scale, physical response and licensing |

## Overlap and counting rules

- A recovered image has one primary category plus contextual category tags. A turnaround can depict armor and a material without becoming a finished armor model and material set.
- A production family is a scoping container. Split it into new item IDs after scope/approval; never report its component list as a completed item count.
- Source code castables and source binary files are separate records.100 source castables do not imply100 unique texture/mesh packages. Dependencies may be shared.
- Construction/reference categories B, F and H contain authoring guidance; runtime render/collision assets belong to their actual domain category.
- A creature may have several taxonomy roles; a mount vehicle is not thereby a natural species.
- Use ASSET_COVERAGE.json to compare requirement, reference, source implementation and approved/validated production coverage independently.

## Record completeness

Each master record includes identity/Oath/element/category; description/lore/gameplay; shape/material/palette/scale; animation/VFX/audio/environment interaction; reference provenance; model construction/LOD/collision/platform needs; dependencies/status/approval/canon and validation. Explicit unresolved values are required where evidence is missing. Empty approval is not approval.

## Status separation

Production: Proposed -> Referenced or Approved Concept -> In Production -> Implemented -> Validated. This is not an automatic linear promotion: an imported source file can be Implemented at prototype tier while final-art acceptance is unresolved. Deprecated preserves history and requires an explicit scoped decision.

Canon: LOCKED, RECOVERED, PROPOSED, UNRESOLVED, DEPRECATED. RECOVERED records report verified source facts; they do not automatically lock a new design. Reference records remain UNRESOLVED for final design authority even though file existence and observed pixels are verified.

Delivery tiers: concept, prototype, production_candidate, validated. Migration statuses VERIFIED/IMPORTED/BLOCKED/MISSING are owned by the castable audit and must not be substituted for art approval.
