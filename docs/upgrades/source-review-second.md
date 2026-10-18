# External source review: second half

Reviewed 2026-10-18 using GitHub repository metadata and README files. This is an evaluation record, not a claim that any source was imported. License labels below are metadata unless explicitly marked LICENSE read; absence of detected license does not prove no license exists. Asset rights require separate verification.

| Repository | Evidence and integration decision |
|---|---|
| [icurtis1/character-controller-sample-project](https://github.com/icurtis1/character-controller-sample-project) | React Three Fiber/Rapier controller; inspect capsule/grounding design. No detected repository license; do not copy until explicit terms verified. |
| [juniorxsound/THREE.Multiplayer](https://github.com/juniorxsound/THREE.Multiplayer) | MIT metadata. Socket.io movement boilerplate, Node 8-era tooling; no production authority guarantees. Reference only for existing custom network stack. |
| [kavyasenthamarai/3d-property-f](https://github.com/kavyasenthamarai/3d-property-f) | No detected license. GLB/HDR architecture viewer; asset provenance unverified. Reference only. |
| [krish4uu/threeJs-monsters-world](https://github.com/krish4uu/threeJs-monsters-world) | No detected license. README explicitly uses Godzilla; do not import branded model/sounds into Aetherion. |
| [luis-herasme/instanced-skinned-mesh](https://github.com/luis-herasme/instanced-skinned-mesh) | No detected license. Useful GLTF instancing and distance/frustum animation throttling; shader monkey-patching needs version validation. Reference only pending terms. |
| [majidmanzarpour/threejs-procedural-spider](https://github.com/majidmanzarpour/threejs-procedural-spider) | MIT LICENSE read. Strong procedural creature/analytic IK reference; Three.js vectors/meshes need porting to Babylon active game, not drop-in. |
| [mositron/Aetheria](https://github.com/mositron/Aetheria) | README advertises MIT, metadata lacks license and root LICENSE absent. Procedural biome/MMO concepts useful; obtain actual licensing text before copying. |
| [mrdoob/three.js](https://github.com/mrdoob/three.js) | MIT metadata; existing source engine dependency. Use pinned compatible package/addons rather than replace engine during polish. |
| [n1k02/three-js-projects](https://github.com/n1k02/three-js-projects) | No detected license. Mostly solar/car/stack demos; little relevant RPG content. |
| [nasrrx/ThreeJS_Project](https://github.com/nasrrx/ThreeJS_Project) | No detected license. Physics/FPS/wave educational suite; mechanics reference only. |
| [nickyvanurk/everwilds](https://github.com/nickyvanurk/everwilds) | No detected license. Networking prototype with walk/combat/leveling; conceptual movement replication reference. |
| [nirholas/three.ws](https://github.com/nirholas/three.ws) | Apache-2.0 metadata. AI-avatar platform with LLM/wallet/MCP integrations; unnecessary backend scope for game polish. Asset-generated outputs need individual terms. |
| [obecerra3/OpenWorldJS](https://github.com/obecerra3/OpenWorldJS) | No detected license. Ammo terrain/controller/GPGPU architecture; incompatible engine stack for direct imports. |
| [roomle/threejs-playground](https://github.com/roomle/threejs-playground) | Archived repository, no detected license. Lighting benchmark scene and furniture; no verified asset rights. |
| [schteppe/cannon.js](https://github.com/schteppe/cannon.js) | MIT metadata. Standalone physics engine; avoid second physics implementation unless a concrete physics need is established. |
| [tairqaldy/three.js-3d-portfolio-website](https://github.com/tairqaldy/three.js-3d-portfolio-website) | MIT metadata. R3F/GSAP portfolio; responsive presentation concepts, not combat/gameplay content. |
| [tech-leads-club/nj-mmo](https://github.com/tech-leads-club/nj-mmo) | MIT LICENSE read. Authoritative Colyseus/Three.js reference; data sourced from L2J Classic and named Lineage settings—exclude branded content/data. Network replacement is substantial work. |
| [theringsofsaturn/3D-art-gallery-threejs](https://github.com/theringsofsaturn/3D-art-gallery-threejs) | No detected license. Gallery tutorial warns broken LFS texture availability; external statue/textures require individual provenance. |
| [thingraph/bp3d-examples](https://github.com/thingraph/bp3d-examples) | No detected license. Interior-editor library examples, not runtime game world implementation; package and asset licenses unresolved. |
| [jrmoyler/Ability-Matrix](https://github.com/jrmoyler/Ability-Matrix) | Sandbox MIT LICENSE read. Source README now 150 castables, 10/element; existing snapshot claims 100. Prioritize version-aware integration; preserve runtime/pack/asset boundaries. |

## Ability Matrix boundary

The current upstream README states 150 castables (145 abilities, three buffs, two summons), ten per element, plus 11 moves and seven archived effects. Aetherion's checked-in ABILITY_MATRIX_INTEGRATION.md describes 100. A count change alone is not runtime migration. Upstream native groups and five vendored engines share a sandbox scene but retain their own managers, pools, shader uniforms and assets. Pack-only webcam casting and Duel Hall remain outside hosted sandbox.

The upstream sandbox package uses Three.js ^0.185.1 and Vite ^8.1.5. Aetherion's active game/package.json instead uses Babylon 9.31.0 with Vite 6.4.4. Three.js render objects cannot be added directly to a Babylon scene. Keep the existing sandbox adapter isolated or explicitly port presentation and gameplay events; do not claim bridge.cast returning true proves target damage. Preserve the existing Linear FissureSystem repair and serialization of async select/cast calls.

Upstream packs/sandbox/LICENSE is MIT with mohamedachrefelouafi (2026) and Collective AI Inc. attribution. Existing Aetherion snapshot retains seven pack LICENSE files. Preserve them during updates. The README documents .wasm-renamed model/HDR staging and bridge URL rewriting: a refresh must retain tested asset routing.

## Most useful candidates

1. Ability-Matrix: canonical ability IDs/settings/source behavior, with explicit source revision and regression coverage.
2. Procedural-spider: small MIT code source for analytic IK and terrain-conforming locomotion; active Babylon runtime requires a deliberate port.
3. Three.js: use the existing pinned source runtime; avoid broad renderer upgrades during bug fixes.
4. NJ MMO: server-authority/testing architecture reference; exclude its L2J/Lineage-derived data and assets.

Other sources remain references or unresolved-license candidates, not silently imported code. No new multiplayer backend, payment/wallet integration, or unrelated portfolio/editor framework is justified by this review.


## Implementation verification follow-up

The default-branch clone at `c16da3c978a4815f46273fdcda2252ab48977a53` exactly matches all 150 local source catalog records. The active game already had 100 registry entries plus 50 supplement entries before this PR; the missing upstream ID count is **zero**. The 100 count in the older integration document referred to the separately preserved sandbox, not the active Babylon catalog. No source snapshot replacement was performed.

This upgrade adds generator source/preset identity and finite numeric validation, a non-mutating `--check` mode, and per-entry source commit/minimum-range metadata. It fixes loadout draft previews to show the actual selected technique even while duplicate slots temporarily make the draft invalid. The original default kits, source licenses and sandbox adapter remain intact. After installing the pinned runtime and sandbox dependencies, all 116 targeted tests pass across generation, expansion, adapter dispatch, Linear fissure integration and Meteor runtime execution. The non-mutating generator check also passes. All 50 supplemental presets exactly match upstream JSON.
