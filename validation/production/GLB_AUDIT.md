# Existing source GLB structural audit

Generated: 2026-10-13T19:34:55.017Z. Source revision: `8c4b5d0bfc75a98388ea29231b9cf1d304dff550`.

26 paths contain 13 distinct SHA-256 identities. 10 identities have no validator errors; 3 have structural errors. 2169 errors and 69884 warnings across unique identities. All source bytes remained unchanged during this audit.

This is format validation, not Blender/Unreal/Godot/Three.js import, visual review, performance measurement, rig suitability, licensing review or production approval. An error-free file may still be unsuitable for this project. No existing asset is promoted to production-ready by this report.

| File (first path) | Copies | Meshes | Materials | Images | Skins | Animations | Errors | Warnings |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| runtime/ability-matrix/packs/casting/public/models/amethyst_stones.glb | 2 | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| runtime/ability-matrix/packs/casting/public/models/arcane_tome.glb | 2 | 39 | 7 | 3 | 0 | 0 | 0 | 0 |
| runtime/ability-matrix/packs/casting/public/models/dragon.glb | 2 | 4 | 4 | 9 | 1 | 1 | 708 | 44334 |
| runtime/ability-matrix/packs/casting/public/models/duel_hall.glb | 1 | 57 | 17 | 0 | 0 | 0 | 0 | 0 |
| runtime/ability-matrix/packs/casting/public/models/magical_gyroscope.glb | 2 | 1 | 1 | 4 | 1 | 2 | 1197 | 17050 |
| runtime/ability-matrix/packs/casting/public/models/shark.glb | 2 | 5 | 3 | 4 | 1 | 2 | 0 | 2 |
| runtime/ability-matrix/packs/casting/public/models/wildroot_reliquary.glb | 2 | 6 | 0 | 0 | 0 | 0 | 0 | 0 |
| runtime/ability-matrix/packs/casting/public/models/wolf.glb | 2 | 5 | 5 | 9 | 1 | 7 | 0 | 5 |
| runtime/ability-matrix/packs/collective/public/models/snake.glb | 3 | 1 | 1 | 1 | 0 | 0 | 0 | 0 |
| runtime/ability-matrix/packs/handcast/public/models/drone.glb | 2 | 8 | 1 | 3 | 0 | 0 | 0 | 7 |
| runtime/ability-matrix/packs/handcast/public/models/monowheelArmyBot.glb | 2 | 4 | 1 | 1 | 0 | 0 | 0 | 0 |
| runtime/ability-matrix/packs/handcast/public/models/phoenix_bird.glb | 2 | 2 | 2 | 4 | 1 | 1 | 264 | 8482 |
| runtime/ability-matrix/packs/linear-ext/public/textures/textures.glb | 2 | 2 | 2 | 4 | 0 | 0 | 0 | 4 |

Full paths, SHA-256 hashes, GLB chunk bounds, primitive attributes/counts, material parameters, embedded image locations, skins, animation targets/times, accessor and buffer validation, and aggregated Khronos issue counts with up to three examples per code are recorded in [GLB_AUDIT.json](GLB_AUDIT.json). Every unsuppressed issue is preserved losslessly in [GLB_VALIDATOR_DETAILS.json.gz](GLB_VALIDATOR_DETAILS.json.gz); the JSON audit records its checksum. Validation uses no issue limit or severity overrides.

Reproduce from repository root:

```sh
npm --cache /tmp/aetherion-production-npm-cache --prefix tools/production ci --ignore-scripts
npm --prefix tools/production test
npm --prefix tools/production run audit:glb
```

The audit exits with status 1 when any source identity has errors, after writing reports. Historical source errors are reported without modifying immutable source files. The tool uses the pinned official [Khronos validator](https://github.com/KhronosGroup/glTF-Validator/tree/main/node).
