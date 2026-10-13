# Castable validation report

## Outcome

**100 actual source castables imported; 0 missing; 0 invented; 0 fully GPU/gameplay-validated.** Each overall record remains **IMPORTED**. Scoped CPU verification is recorded separately so a passing import, a passing lifecycle, or a bundle build cannot be mistaken for production validation.

| Check | Measured result | Scope |
|---|---|---|
| Complete snapshot integrity | PASS: 1,896 files / 331,989,108 bytes | Exact source SHA-256 and original path preservation |
| Catalog and schemas | PASS: 100 unique live UIDs, 15 elements, 95 abilities + 3 buffs + 2 summons | Original catalog/preset fields preserved; JSON Schema Draft 2020-12 validated |
| Source module loading | PASS: 100/100 | Actual castable modules import under Node |
| Raw CPU lifecycle | PASS 96 / source defect 1 / browser API blocked 3 | Default cast, lifecycle, recast/cancel, finite buffers/transforms and light release where applicable |
| Meteor repair | PASS: 1 | Original Linear FissureSystem restored outside source snapshot; actual adapter → original MatrixBridge → App/AimController → Meteor regression |
| Supplementary texture-boundary CPU tests | PASS: 3 | Exact original four stone JPEGs decoded into real Three DataTextures; no gameplay or shader replacement |
| Combined scoped CPU evidence | 100 distinct UIDs | 96 unchanged baseline + 1 repaired host + 3 image-boundary adaptations |
| Upstream tests | PASS: 51 | Inherited source tests, including original snapshot and portable Atlas checks |
| Root migration/adapter tests | PASS: 215/215; migration subset 208/208 | Each UID's raw fields, paths and source dispatch, plus repaired runtime integration |
| Static executable sandbox graph | PASS: 581 reachable modules; 0 missing relative imports / 0 missing literal assets | Literal/static graph only; dynamic and visual behavior separate |
| Original sandbox and Atlas builds | PASS | Production bundling; original sandbox main bundle approx. 3.34 MB warns about size |
| Runnable Aetherion wrapper | PASS: build, 5 entry/seam tests, all 100 catalog entries + 24 byte-identical public assets; local HTTP 200 | Separate destination entry installs actual adapter/repair; no imported-source edits |
| GPU/visual validation | BLOCKED | Current cloud browser's WebGL2 support page reports disabled/unavailable; local Chromium socket launch is also blocked |
| Authored FBX target/character gameplay | NOT VERIFIED | No populated authored target rigs or character clips in CPU harness |
| Audio, networking, persistent world | MISSING / PROPOSED | Not features implemented by Ability-Matrix |
| Clean network install | ENVIRONMENT-LIMITED | Matching local dependency versions reused; registry integrity not freshly revalidated |

## What the CPU evidence means

Tests instantiate the actual Three.js source managers, geometry, materials, particle/decal/burst/light services and source lifecycle code. Real GLB mesh/animation parsing is attempted where needed. Tests use an empty target field and lack authored FBX rigs. They do **not** certify hits, damage, ragdoll outcomes, bone-attached buff appearance, character animation, shader compilation, image upload/sampling, input-driven summon steering, arbitrary preset values, balance or performance.

The raw source failure is `linear/meteor`: the upstream hosted Linear wrapper omits `ctx.fissures` although Meteor's impact uses it. [Baseline failure](validation/meteor-source-defect.json) is retained. [LinearFissuresIntegration.js](src/abilities/LinearFissuresIntegration.js) restores the original source service and standalone update/clear/dispose order. Regression checks cover natural Meteor/fissure retirement, actual geometry, pooling/recast, exactly-once updates, cancellation, light release and disposal. Source files remain unchanged.

Three raw tests (`linear-extended/quake`, `handcast/toxic`, `casting/shark`) require browser image loading. The supplementary harness decodes the four exact source JPEGs with Pillow and supplies SHA-256-verified RGBA8 DataTextures only at those exact TextureLoader URLs. All four callbacks complete. The browser decoder and GPU sampler are not exercised; these passes remain explicitly adapted CPU evidence.

## Evidence and reproduction

- [Complete per-castable raw CPU results](validation/cpu-lifecycle-audit.json)
- [Supplementary real-image CPU results](validation/texture-fixture-cpu-audit.json)
- [Combined results](validation/runtime-validation-results.json)
- [Runtime audit methodology](validation/RUNTIME_AUDIT.md) and [reproducible harness commands](tests/runtime-audit/README.md)
- [Dependency provenance](validation/dependency-reuse.json)
- [Static import/asset/license audit](validation/static-reference-audit.json)
- [Current cloud browser GPU diagnostic](validation/browser-gpu-check.json)
- [Source manifest](CASTABLE_SOURCE_MANIFEST.json) and [registry](CASTABLE_REGISTRY.json)

Run `npm test`, `npm run test:source`, and the harness commands above. Run `npm run test:canon` after installing `AETHERION_CANON/19_VALIDATION/requirements-validation.txt`; negative canon fixtures use `npm run test:canon-fixtures`. Preserved build/test logs are evidence, not successful reruns on every machine. Generated bundles and node_modules are excluded from version control.

## Per-castable ledger

All rows retain original source names and IDs. “Raw CPU” means unadapted source lifecycle. “Repaired CPU” names the destination-only Meteor dependency repair. “Image-boundary CPU” names the exact-source-image decode fixture. All rows still require GPU/rig/interactive validation.

| Source UID | Original name | Element | Oath | Overall | Scoped CPU evidence |
|---|---|---|---|---|---|
| `linear/ice` | Frost Lance | frost | oath-02 | IMPORTED | Raw CPU PASS |
| `linear/thunder` | Storm Lance | storm | oath-03 | IMPORTED | Raw CPU PASS |
| `linear/meteor` | Cinder Fall | fire | oath-01 | IMPORTED | Repaired CPU PASS |
| `linear/beam` | Nova Beam | light | oath-09 | IMPORTED | Raw CPU PASS |
| `linear/snare` | Voltaic Snare | storm | oath-03 | IMPORTED | Raw CPU PASS |
| `linear/glacier` | Glacial Crown | frost | oath-02 | IMPORTED | Raw CPU PASS |
| `linear-ext/pyre` | Pyre Crown | fire | oath-01 | IMPORTED | Raw CPU PASS |
| `linear-ext/kraken` | Kraken Crown | water | oath-04 | IMPORTED | Raw CPU PASS |
| `linear-ext/electrical` | Electrical Sphere | storm | oath-03 | IMPORTED | Raw CPU PASS |
| `linear-ext/earth` | Earthen Spire | earth | oath-05 | IMPORTED | Raw CPU PASS |
| `linear-ext/portal` | Verdant Gate | nature | oath-07 | IMPORTED | Raw CPU PASS |
| `linear-ext/aether` | Tidewrought Ring | water | oath-04 | IMPORTED | Raw CPU PASS |
| `linear-ext/firePortal` | Fire Portal | fire | oath-01 | IMPORTED | Raw CPU PASS |
| `linear-ext/boost` | Electric Boost | storm | oath-03 | IMPORTED | Raw CPU PASS |
| `linear-ext/magic` | Magic Boost | arcane | oath-13 | IMPORTED | Raw CPU PASS |
| `linear-ext/fire` | Fire Boost | fire | oath-01 | IMPORTED | Raw CPU PASS |
| `linear-extended/ward` | Volcanic Ward | fire | oath-01 | IMPORTED | Raw CPU PASS |
| `linear-extended/acid` | Caustic Bloom | poison | oath-08 | IMPORTED | Raw CPU PASS |
| `linear-extended/growth` | Arborist's Growth | nature | oath-07 | IMPORTED | Raw CPU PASS |
| `linear-extended/cyber` | Cyber Serpent | tech | oath-15 | IMPORTED | Raw CPU PASS |
| `linear-extended/venom` | Venom Surge | poison | oath-08 | IMPORTED | Raw CPU PASS |
| `linear-extended/quake` | Monolith Rift | earth | oath-05 | IMPORTED | Image-boundary CPU PASS |
| `linear-extended/ink` | Sumi Tide | water | oath-04 | IMPORTED | Raw CPU PASS |
| `linear-extended/astral` | Astral Void Blast | cosmic | oath-10 | IMPORTED | Raw CPU PASS |
| `linear-extended/cascade` | Baleful Cascade | arcane | oath-13 | IMPORTED | Raw CPU PASS |
| `linear-extended/rend` | Celestial Rend | light | oath-09 | IMPORTED | Raw CPU PASS |
| `handcast/flux` | Shimmering Flux | blood | oath-12 | IMPORTED | Raw CPU PASS |
| `handcast/voidslash` | Void Slash | shadow | oath-11 | IMPORTED | Raw CPU PASS |
| `handcast/glacial` | Glacial Shard Storm | frost | oath-02 | IMPORTED | Raw CPU PASS |
| `handcast/shard` | Corrupted Shard | shadow | oath-11 | IMPORTED | Raw CPU PASS |
| `handcast/frost` | Glacial Prison | frost | oath-02 | IMPORTED | Raw CPU PASS |
| `handcast/toxic` | Toxic Shield | poison | oath-08 | IMPORTED | Image-boundary CPU PASS |
| `handcast/phoenix` | Serpent Tide Field | fire | oath-01 | IMPORTED | Raw CPU PASS |
| `handcast/monowheel` | Monowheel Bot | tech | oath-15 | IMPORTED | Raw CPU PASS |
| `handcast/drone` | Sentinel Drone | tech | oath-15 | IMPORTED | Raw CPU PASS |
| `casting/shark` | Abyssal Maw | water | oath-04 | IMPORTED | Image-boundary CPU PASS |
| `casting/chains` | Chains of Penance | light | oath-09 | IMPORTED | Raw CPU PASS |
| `casting/dragon` | Dragonfire Circle | fire | oath-01 | IMPORTED | Raw CPU PASS |
| `casting/gyro` | Stormheart Gyroscope | storm | oath-03 | IMPORTED | Raw CPU PASS |
| `casting/amethyst` | Amethyst Verdict | earth | oath-05 | IMPORTED | Raw CPU PASS |
| `casting/tome` | Astral Tome | cosmic | oath-10 | IMPORTED | Raw CPU PASS |
| `casting/reliquary` | Wildroot Reliquary | nature | oath-07 | IMPORTED | Raw CPU PASS |
| `casting/lance` | Starbreaker Lance | light | oath-09 | IMPORTED | Raw CPU PASS |
| `casting/wolf` | Astral Fang | cosmic | oath-10 | IMPORTED | Raw CPU PASS |
| `collective/tempest` | Tempest Spiral | wind | oath-06 | IMPORTED | Raw CPU PASS |
| `collective/dune` | Dune Scourge | earth | oath-05 | IMPORTED | Raw CPU PASS |
| `collective/prism` | Sunfall Prism | light | oath-09 | IMPORTED | Raw CPU PASS |
| `collective/chain` | Chain Arc | storm | oath-03 | IMPORTED | Raw CPU PASS |
| `collective/graviton` | Graviton Collapse | cosmic | oath-10 | IMPORTED | Raw CPU PASS |
| `collective/blink` | Blink Step | time | oath-14 | IMPORTED | Raw CPU PASS |
| `collective/sonic` | Resonance Pulse | wind | oath-06 | IMPORTED | Raw CPU PASS |
| `collective/crimson` | Crimson Rite | blood | oath-12 | IMPORTED | Raw CPU PASS |
| `collective/swarm` | Meteor Swarm | fire | oath-01 | IMPORTED | Raw CPU PASS |
| `collective/aegis` | Aegis Bulwark | tech | oath-15 | IMPORTED | Raw CPU PASS |
| `collective/spore` | Spore Bloom | nature | oath-07 | IMPORTED | Raw CPU PASS |
| `collective/chrono` | Chrono Fracture | time | oath-14 | IMPORTED | Raw CPU PASS |
| `matrix-new/gale` | Gale Sever | wind | oath-06 | IMPORTED | Raw CPU PASS |
| `matrix-new/emberveil` | Emberveil Lattice | fire | oath-01 | IMPORTED | Raw CPU PASS |
| `matrix-new/umbra` | Umbra Grasp | shadow | oath-11 | IMPORTED | Raw CPU PASS |
| `matrix-new/geode` | Geode Eruption | earth | oath-05 | IMPORTED | Raw CPU PASS |
| `matrix-new/aetherblade` | Aetherblade Cascade | arcane | oath-13 | IMPORTED | Raw CPU PASS |
| `matrix-new/mirage` | Mirage Construct | arcane | oath-13 | IMPORTED | Raw CPU PASS |
| `matrix-new/bloodroot` | Bloodroot Thorns | blood | oath-12 | IMPORTED | Raw CPU PASS |
| `matrix-new/ionstorm` | Ion Storm Pillar | storm | oath-03 | IMPORTED | Raw CPU PASS |
| `matrix-new/obsidianwall` | Obsidian Wall | earth | oath-05 | IMPORTED | Raw CPU PASS |
| `matrix-new/starfall` | Starfall Rite | light | oath-09 | IMPORTED | Raw CPU PASS |
| `matrix-new/voidstep` | Voidstep Rift | shadow | oath-11 | IMPORTED | Raw CPU PASS |
| `matrix-new/crystallineheart` | Crystalline Heart | earth | oath-05 | IMPORTED | Raw CPU PASS |
| `atlas/relay` | Arc Relay | storm | oath-03 | IMPORTED | Raw CPU PASS |
| `atlas/recall` | Chrono Recall | time | oath-14 | IMPORTED | Raw CPU PASS |
| `atlas/parallax` | Parallax Blink | time | oath-14 | IMPORTED | Raw CPU PASS |
| `atlas/sanctuary` | Dawn Sanctuary | light | oath-09 | IMPORTED | Raw CPU PASS |
| `atlas/polarity` | Polarity Garden | tech | oath-15 | IMPORTED | Raw CPU PASS |
| `atlas/echoes` | Hall of Echoes | arcane | oath-13 | IMPORTED | Raw CPU PASS |
| `atlas/chakram` | Vector Chakram | tech | oath-15 | IMPORTED | Raw CPU PASS |
| `atlas/reversal` | Aegis Reversal | tech | oath-15 | IMPORTED | Raw CPU PASS |
| `atlas/stillpoint` | Stillpoint | time | oath-14 | IMPORTED | Raw CPU PASS |
| `atlas/refractor` | Prism Refractor | tech | oath-15 | IMPORTED | Raw CPU PASS |
| `codex/solarlash` | Solar Lash | fire | oath-01 | IMPORTED | Raw CPU PASS |
| `codex/permafrost` | Permafrost Bloom | frost | oath-02 | IMPORTED | Raw CPU PASS |
| `codex/avalanche` | Avalanche Wake | frost | oath-02 | IMPORTED | Raw CPU PASS |
| `codex/maelstrom` | Maelstrom Vortex | water | oath-04 | IMPORTED | Raw CPU PASS |
| `codex/riptide` | Riptide Lash | water | oath-04 | IMPORTED | Raw CPU PASS |
| `codex/zephyr` | Zephyr Shuriken | wind | oath-06 | IMPORTED | Raw CPU PASS |
| `codex/downburst` | Downburst | wind | oath-06 | IMPORTED | Raw CPU PASS |
| `codex/pollen` | Pollen Nova | nature | oath-07 | IMPORTED | Raw CPU PASS |
| `codex/seedstorm` | Seedstorm Volley | nature | oath-07 | IMPORTED | Raw CPU PASS |
| `codex/plague` | Plague Swarm | poison | oath-08 | IMPORTED | Raw CPU PASS |
| `codex/miasma` | Miasma Spit | poison | oath-08 | IMPORTED | Raw CPU PASS |
| `codex/nebula` | Nebula Collapse | cosmic | oath-10 | IMPORTED | Raw CPU PASS |
| `codex/nightfall` | Nightfall Scythe | shadow | oath-11 | IMPORTED | Raw CPU PASS |
| `codex/wraiths` | Wraith Host | shadow | oath-11 | IMPORTED | Raw CPU PASS |
| `codex/sanguine` | Sanguine Tide | blood | oath-12 | IMPORTED | Raw CPU PASS |
| `codex/glyphs` | Glyph Barrage | arcane | oath-13 | IMPORTED | Raw CPU PASS |
| `codex/hourglass` | Hourglass Sunder | time | oath-14 | IMPORTED | Raw CPU PASS |
| `codex/basalt` | Basalt Columns | earth | oath-05 | IMPORTED | Raw CPU PASS |
| `codex/seraph` | Seraphic Descent | light | oath-09 | IMPORTED | Raw CPU PASS |
| `codex/balllightning` | Ball Lightning | storm | oath-03 | IMPORTED | Raw CPU PASS |
| `codex/railgun` | Railgun Lance | tech | oath-15 | IMPORTED | Raw CPU PASS |
| `codex/orbital` | Orbital Strike | tech | oath-15 | IMPORTED | Raw CPU PASS |

## Promotion gate

A reviewer may promote only the specific verified dimension backed by executable evidence. Overall production validation requires every applicable source path through a real WebGL2 renderer, authored models/clips and populated targets, plus rendering, animation, interaction, cleanup, performance and licensing review. Environmental/crafting/progression behavior needs a separately implemented and approved Aetherion system. No castable is marked MISSING merely because a test environment lacks a browser API.
