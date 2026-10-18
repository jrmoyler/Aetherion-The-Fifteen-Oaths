# Three.js source review

Checked: 2026-10-18. Repository availability, descriptions, default branches and license metadata were read from GitHub API endpoints. Useful file paths were additionally verified against repository trees. License metadata is not clearance for every bundled model, texture, sound or dependency. `Unspecified` means the API supplied no license; `NOASSERTION` means it did not identify a standard license. Neither means unrestricted reuse.

## Scope and integration decisions

This inventory covers the requested upstream sources. Availability does not imply suitability. No code or assets from the inventory below were copied as part of this review; actual adaptations must be recorded separately with source paths and attribution. Replacing the existing engine with multiple incompatible frameworks would introduce regressions. Prioritize small compatible Three.js techniques and separately cleared assets.

| Requested source | Availability / license metadata | Relevance and decision |
|---|---|---|
| [ClaytonWas/dungeon-crawler](https://github.com/ClaytonWas/dungeon-crawler) | Available; MIT | Review combat/progression systems; MIT code candidate. |
| [Fasani/three-js-resources](https://github.com/Fasani/three-js-resources) | Available; MIT | Reference links only; not a game implementation. |
| [Footprintarts/ThreeJS_FPS_2.0](https://github.com/Footprintarts/ThreeJS_FPS_2.0) | Available; MIT | Review modular controls, physics and world; preserve bundled model credits. |
| [Julian-adv/OpenMMO](https://github.com/Julian-adv/OpenMMO) | Available; NOASSERTION | MMO architecture reference only until license terms reviewed. |
| [NafisRayan/3D-Game-Template-Ultimate](https://github.com/NafisRayan/3D-Game-Template-Ultimate) | Available; unspecified | Reference only; no copying without explicit code and asset license verification. |
| [ToxSam/os3a-gallery](https://github.com/ToxSam/os3a-gallery) | Available; unspecified | Asset discovery only; independently verify each advertised CC0 asset. |
| [aarxa/threeJS-project](https://github.com/aarxa/threeJS-project) | Available; unspecified | Reference only; no copying without explicit code and asset license verification. |
| [adorablemussel/3D-character-creator](https://github.com/adorablemussel/3D-character-creator) | Available; unspecified | Reference only; no copying without explicit code and asset license verification. |
| [aeml/eidolon](https://github.com/aeml/eidolon) | Available; AGPL-3.0 | AGPL architecture reference; no copying in this change. |
| [bandinopla/three-mediapipe-rig](https://github.com/bandinopla/three-mediapipe-rig) | Available; unspecified | Reference only; no copying without explicit code and asset license verification. |
| [cortiz2894/showcase-images](https://github.com/cortiz2894/showcase-images) | Available; unspecified | Reference only; no copying without explicit code and asset license verification. |
| [dgreenheck/threejs-procedural-planets](https://github.com/dgreenheck/threejs-procedural-planets) | Available; MIT | Terrain/atmosphere candidate; spherical planet design is not a drop-in continental world. |
| [doinel1a/vite-three-js](https://github.com/doinel1a/vite-three-js) | Available; MIT | Boilerplate reference; existing game already has build structure. |
| [emineugurlu/3D](https://github.com/emineugurlu/3D) | Available; MIT | GLTF/animation reference; no asset clearance assumed. |
| [hunkim/3D_Archers](https://github.com/hunkim/3D_Archers) | Available; unspecified | Reference only; no copying without explicit code and asset license verification. |
| [icurtis1/character-controller-sample-project](https://github.com/icurtis1/character-controller-sample-project) | Available; unspecified | Reference only; no copying without explicit code and asset license verification. |
| [juniorxsound/THREE.Multiplayer](https://github.com/juniorxsound/THREE.Multiplayer) | Available; MIT | Socket.io reference; no server migration in this change. |
| [kavyasenthamarai/3d-property-f](https://github.com/kavyasenthamarai/3d-property-f) | Available; unspecified | Reference only; no copying without explicit code and asset license verification. |
| [krish4uu/threeJs-monsters-world](https://github.com/krish4uu/threeJs-monsters-world) | Available; unspecified | Reference only; no copying without explicit code and asset license verification. |
| [majidmanzarpour/threejs-procedural-spider](https://github.com/majidmanzarpour/threejs-procedural-spider) | Available; MIT | Strong articulated locomotion and damping reference; inspect small MIT algorithms. |
| [mositron/Aetheria](https://github.com/mositron/Aetheria) | Available; unspecified | Reference only; no copying without explicit code and asset license verification. |
| [n1k02/three-js-projects](https://github.com/n1k02/three-js-projects) | Available; unspecified | Reference only; no copying without explicit code and asset license verification. |
| [nasrrx/ThreeJS_Project](https://github.com/nasrrx/ThreeJS_Project) | Available; unspecified | Reference only; no copying without explicit code and asset license verification. |
| [nirholas/three.ws](https://github.com/nirholas/three.ws) | Available; Apache-2.0 | Avatar pipeline reference; avoid importing agent/wallet platform dependencies. |
| [roomle/threejs-playground](https://github.com/roomle/threejs-playground) | Available; unspecified | Reference only; no copying without explicit code and asset license verification. |
| [tairqaldy/three.js-3d-portfolio-website](https://github.com/tairqaldy/three.js-3d-portfolio-website) | Available; MIT | Presentation reference; portfolio architecture not game engine. |
| [tech-leads-club/nj-mmo](https://github.com/tech-leads-club/nj-mmo) | Available; MIT | Combat/world architecture reference; avoid unplanned Colyseus server migration. |
| [theringsofsaturn/3D-art-gallery-threejs](https://github.com/theringsofsaturn/3D-art-gallery-threejs) | Available; unspecified | Reference only; no copying without explicit code and asset license verification. |
| [thingraph/bp3d-examples](https://github.com/thingraph/bp3d-examples) | Available; unspecified | Reference only; no copying without explicit code and asset license verification. |
| [MavonEngine](https://github.com/MavonEngine) | Organization; [Core](https://github.com/MavonEngine/Core) reports MIT | Review grass, water, environment and chunk management; not a drop-in engine replacement. |
| [aresrpg](https://github.com/aresrpg) | Organization; [aresrpg/aresrpg](https://github.com/aresrpg/aresrpg) reports NOASSERTION | Current project explicitly describes itself as source-available. No copying without reviewing terms; legacy client/world/engine have unspecified metadata. |

| [Ariescar/anyCreature](https://github.com/Ariescar/anyCreature) | Available; MIT license file verified | JSON-to-skinned-GLB compiler, AO and attachment validation; reference only. |
| [NewKrok/three-particles](https://github.com/NewKrok/three-particles) | Available; MIT © 2021 Istvan Krisztian Somoracz | Emitter lifecycle, trails and instancing reference; no copied code in review. |
| [VerseEngine/three-avatar](https://github.com/VerseEngine/three-avatar) | Available; MIT © 2023 Appland Inc | Animation caching, VRM/Mixamo and collision/IK reference. |
| [luis-herasme/instanced-skinned-mesh](https://github.com/luis-herasme/instanced-skinned-mesh) | Available; no license observed in root/package.json | Animation LOD concept reference only; no code copying. |
| [nickyvanurk/everwilds](https://github.com/nickyvanurk/everwilds) | Available; no license observed in root | Networking reference only; no code copying. |
| [obecerra3/OpenWorldJS](https://github.com/obecerra3/OpenWorldJS) | Available; no license observed in root | FBM terrain, heightfield and animation FSM concepts only. |
| [schteppe/cannon.js](https://github.com/schteppe/cannon.js) | Available; MIT © 2015 cannon.js Authors | Rigid-body physics reference; no physics-engine migration. |

| [mrdoob/three.js](https://github.com/mrdoob/three.js) | Available; MIT metadata | Core renderer and official examples; existing dependency, preserve notices for adapted helpers. |
| [jrmoyler/Ability-Matrix](https://github.com/jrmoyler/Ability-Matrix) | Available; unspecified license metadata | User-owned source explicitly authorized for extraction; existing 150 live castables verified below. |

## Concrete source paths inspected

- [Dungeon combat](https://github.com/ClaytonWas/dungeon-crawler/blob/main/server/systems/combatSystem.js), weaponSystem.js and characterUpgrades.js were verified in the repository tree.
- [FPS physics](https://github.com/Footprintarts/ThreeJS_FPS_2.0/blob/main/src/systems/physics.js), controls.js and components/world.js were verified in the repository tree.
- [Spider dynamics](https://github.com/majidmanzarpour/threejs-procedural-spider/blob/main/src/core/dynamics.js), spider/Spider.js and world/terrain.js were verified in the repository tree.
- [Mavon Core](https://github.com/MavonEngine/Core) tree includes packages/core/src/Prefab/Grass/Grass.ts, Prefab/Water/Water.ts, World/Environment.ts and World/BaseChunkManager.ts.

## Actual integrations

- **Three.js 0.180.0 (MIT)**: installed through npm and pinned in game/package-lock.json. The shipped client uses WebGLRenderer, GLTFLoader, SkeletonUtils, AnimationMixer, physical materials, instancing and shader hooks. Third-party license is included in the dependency distribution.
- **Ability-Matrix**: generated palette data for all 150 source identities from CASTABLE_REGISTRY.json and the pinned shared/ability-supplement.json. The previously missing 50 source-specific palettes now drive the Three.js effects. Generator and reproducibility tests are included.
- **Original implementation**: Three actor adapters, world rendering, combat effects, onboarding and UI changes are authored for this project. No code was copied from the other reviewed repositories. Their architectural patterns informed review; no uncertain-license art was imported.

## Ability-Matrix verification

Source review checked `jrmoyler/Ability-Matrix` main commit `c16da3c978a4815f46273fdcda2252ab48977a53`. The target already exposes 150 live castables: 100 base registry plus 50 supplement entries. The supplement matches this source pin; no missing gameplay IDs were found. The source catalog has 168 rows, with 18 archived, movement or demo entries. An older vendored runtime lacks 50 codex presets; `bridge/runtime.js/presets/new` matches source hashes. These observations do not claim new castables were imported in this change.

## Small MIT adaptation candidate

Source commit: `763f814a8e5b584630a70e911236544f2e5b88e3`. The actual [Spider dynamics source](https://github.com/majidmanzarpour/threejs-procedural-spider/blob/main/src/core/dynamics.js) and [LICENSE](https://github.com/majidmanzarpour/threejs-procedural-spider/blob/main/LICENSE) were read. `SO1` implements a scalar second-order spring with a guarded timestep and frequency/damping/response controls, suitable for continuous torso or camera responses. The file also supplies analytic two-bone IK and cylinder alignment helpers. License: MIT, copyright (c) 2026 Majid Manzarpour. If adapted, retain the full permission/warranty notice and identify the adaptation. Candidate review alone does not count as integration.
