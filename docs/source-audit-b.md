# Source audit B — 2026-10-18

All 19 URLs were inspected through GitHub connector metadata. Commit IDs below were resolved through the commits endpoint. Trees and representative source files were read except where specified. No license means no root license was identified in metadata/tree, not permission to copy. This audit does not assert every repository was imported.

| Repository | Observed commit | Root license | Evidence and decision |
|---|---|---|---|
| https://github.com/juniorxsound/THREE.Multiplayer | `ffcaa806b1add162ada6b03980b7c3f036abf70e` | MIT | `server.js`: Socket.io presence/movement broadcasts; client-trusting prototype, not authoritative combat. |
| https://github.com/kavyasenthamarai/3d-property-f | `0ce04451444ac329d24546a522e005592b056e4b` | None identified | `js/main.js`: Draco GLTF property viewer; low gameplay fit. |
| https://github.com/krish4uu/threeJs-monsters-world | `ac43e54d3bcb3c82736aa38fe089c2e959be2292` | None identified | `app/components/Scene.tsx`: R3F monster showcase and loading percentage; no combat framework. |
| https://github.com/luis-herasme/instanced-skinned-mesh | `1fdb57ba346130c0eff0529b551adb63c6640d4e` | None identified | `src/instanced-animation/view-sensitive-instanced-animator.ts`: distance/frustum animation throttling; useful reference, no copied code. |
| https://github.com/majidmanzarpour/threejs-procedural-spider | `763f814a8e5b584630a70e911236544f2e5b88e3` | MIT | `src/core/dynamics.js`, `src/spider/Spider.js`: spring/analytic two-bone IK and articulated spider; MIT candidate. |
| https://github.com/mositron/Aetheria | `300c1dc91feb0f412e42d05886086224aa685b7b` | None identified | `packages/client/src/scene/ChunkedTerrain.tsx`: chunk eviction and bounded resident terrain; reference only. |
| https://github.com/mrdoob/three.js | `0978e2b62e53654ebe1a2c3032ebee0a4981c701` | MIT | `examples/jsm/objects/Sky.js`: atmosphere shader; use only in Three renderer and compatible package version. |
| https://github.com/n1k02/three-js-projects | `279065e3e4fd94151d5375833ef0711e46e1d427` | None identified | `first-person-camera/src/js/scripts.js`: basic pointer-lock tutorial; limited incremental value. |
| https://github.com/nasrrx/ThreeJS_Project | `ef5b28fc2d08727edb5e4c0df23387db7e9b3053` | None identified | `waves.js`: wave demonstration on old CDN Three; low game fit. |
| https://github.com/nickyvanurk/everwilds | `711fd6d4d5c15d000f30dced80776db7b79b669b` | None identified | `client/src/network-simulator.ts`: latency/jitter/loss presets; QA architecture reference. |
| https://github.com/nirholas/three.ws | `800052ed822a409b6177c61b176a1bd6607fec0f` | Apache-2.0 | README inspected; recursive tree response rejected for size. Avatar/AI service stack, no direct gameplay integration. Separate third-party asset licenses. |
| https://github.com/obecerra3/OpenWorldJS | `4a564a78421a3cbf23ae4d73ed09fd6789ca721f` | None identified | `js/game/world/terrain.js`: legacy AMD, Ammo, GPU terrain; high porting cost. |
| https://github.com/roomle/threejs-playground | `f28d0754196b80feed81db32492912ba16afa254` | None identified | `main.js`: archived GLTF furniture viewer; low fit. |
| https://github.com/schteppe/cannon.js | `569730f94a1d9da47967a24fad0323ef7d5b4119` | MIT | `src/world/World.js`: physics stepping/solver; avoid adding a second physics stack. |
| https://github.com/tairqaldy/three.js-3d-portfolio-website | `635d20527fb68d5ca4f7e325e64a59529060ff50` | MIT | `src/components/HeroCamera.jsx`: R3F/maath damping; cinematic reference, not Babylon-ready. |
| https://github.com/tech-leads-club/nj-mmo | `7bba7272386357b8d5c19dd82906d13bd49f1bb9` | MIT | `client/src/scene/vfx/vfx-lifecycle.ts`, `melee-hit-vfx.ts`, `camera/follow-camera.ts`: bounded pool, short hit effects, yaw following. Pool algorithm engine-neutral; renderer code requires port. |
| https://github.com/theringsofsaturn/3D-art-gallery-threejs | `8be5adddaf60ac7f78f0a7f1fb28adbd84e98592` | None identified | `modules/movement.js`: delta-scaled camera movement with collision rollback; gallery not full controller. |
| https://github.com/thingraph/bp3d-examples | `60dd14dcbb27af4e56510e406c9320de1e0a2c9d` | None identified | README/tree: compiled floorplan editor example; source not available as normal modules in this repo. |
| https://github.com/jrmoyler/Ability-Matrix | `c16da3c978a4815f46273fdcda2252ab48977a53` | None identified | README, `packs/SOURCES.txt`, `bridge/MatrixBridge.js`, `packs/sandbox/src/sandbox/createRuntime.js`: real Three runtimes, not Babylon plug-ins. |

## Renderer and ability boundary

Aetherion's main game uses Babylon. Ability-Matrix's source runtimes use Three. The engines cannot share render meshes/materials by passing a scene. The existing Babylon catalog is a gameplay adaptation, not the original 150 runtime implementations. A future full port must translate meshes, shaders, particles, model animation and target-hit behavior, or run the original Three sandbox separately.

The inspected Matrix createRuntime expects camera, scene, environment, character, frame uniforms, lights, shake, flash and a `dummies.applyHitsWith` target adapter. Its renderer-specific objects cannot be passed to Babylon.

## Catalog comparison and safe corrections

Pinned canon registry: 100 castables. Upstream at inspected commit: 150. The 50 additions below are now preserved in shared/ability-supplement.json with full source presets and commit provenance, and exposed in the Babylon gameplay catalog. They are selectable through authoritative loadouts and execute the existing line/zone combat mechanics. This is a portable-data gameplay adaptation; it does not reproduce the original Three shaders, rigs, or every bespoke source mechanic. The canonical 100-entry registry and original Three snapshot remain unchanged.

Generator fixes in this PR: self buffs now have zero target range and radius; original source shape is retained as sourceShape even when Babylon uses a simplified zone shape; duplicate IDs and unmapped elements fail generation. Existing default kit selection remains stable. hotbarFor accepts five unique same-oath UIDs and preserves authoritative slot tuning; tests cover all 150 choices across both classes and reject cross-oath/duplicate selections.

| Upstream-only UID | Element | Name |
|---|---|---|
| `codex/hoarfrost` | frost | Hoarfrost Mirror |
| `codex/rimehalo` | frost | Rime Halo |
| `codex/whiteout` | frost | Whiteout Needle |
| `codex/calving` | frost | Glacier Calving |
| `codex/fulgur` | storm | Fulgur Cage |
| `codex/brine` | water | Brine Geyser |
| `codex/glasstide` | water | Glass Tide |
| `codex/undertow` | water | Undertow Chains |
| `codex/pearltempest` | water | Pearl Tempest |
| `codex/faultchoir` | earth | Fault Choir |
| `codex/quartzspire` | earth | Quartz Spire |
| `codex/sirennote` | wind | Siren Note |
| `codex/vortexbell` | wind | Vortex Bell |
| `codex/shearwall` | wind | Shear Wall |
| `codex/dustmarch` | wind | Dust Devil March |
| `codex/harmonic` | wind | Harmonic Reed |
| `codex/briar` | nature | Briar Cathedral |
| `codex/mycelium` | nature | Mycelium Wake |
| `codex/thornvolley` | nature | Thorn Volley |
| `codex/bloomcrown` | nature | Bloom Crown |
| `codex/acidchoir` | poison | Acid Choir |
| `codex/bilelance` | poison | Bile Lance |
| `codex/sporecoffin` | poison | Spore Coffin |
| `codex/noxioushalo` | poison | Noxious Halo |
| `codex/vitriol` | poison | Vitriol Rain |
| `codex/haloguillotine` | light | Halo Guillotine |
| `codex/reliquarydawn` | light | Reliquary Dawn |
| `codex/horizon` | cosmic | Event Horizon |
| `codex/pulsar` | cosmic | Pulsar Lash |
| `codex/darkwell` | cosmic | Dark Matter Well |
| `codex/cometharpoon` | cosmic | Comet Harpoon |
| `codex/orbitlock` | cosmic | Orbit Lock |
| `codex/umbral` | shadow | Umbral Guillotine |
| `codex/voidbloom` | shadow | Void Bloom |
| `codex/shadepuppet` | shadow | Shade Puppets |
| `codex/eclipseneedle` | shadow | Eclipse Needle |
| `codex/hemorrhage` | blood | Hemorrhage Ring |
| `codex/clotarmor` | blood | Clot Armor |
| `codex/arterial` | blood | Arterial Whip |
| `codex/baptism` | blood | Crimson Baptism |
| `codex/heartstake` | blood | Heartstake |
| `codex/veinlattice` | blood | Vein Lattice |
| `codex/sigilgate` | arcane | Sigil Gate |
| `codex/prismlie` | arcane | Prism Lie |
| `codex/runemeteor` | arcane | Rune Meteor |
| `codex/mindlattice` | arcane | Mind Lattice |
| `codex/secondself` | time | Second Self |
| `codex/rewindsnare` | time | Rewind Snare |
| `codex/pendulum` | time | Pendulum Cleaver |
| `codex/stasisbell` | time | Stasis Bell |
