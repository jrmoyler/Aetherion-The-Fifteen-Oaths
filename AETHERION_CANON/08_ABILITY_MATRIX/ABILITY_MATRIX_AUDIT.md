# Ability Matrix architecture audit

**Evidence:** `SRC-ABILITY-MATRIX-4c4a1eb`, commit `4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451`. Destination inspected first and empty. The complete source snapshot now lives under [`runtime/ability-matrix`](../../runtime/ability-matrix).

## Inventory

100 live castables, not 100 generic descriptors: 95 abilities, 3 buffs and 2 summons. The nine runtime groups are linear (6), linear-ext (7 abilities + 3 buffs), linear-extended (10), handcast (7 abilities + 2 summons), casting (9), collective (12), matrix-new (12), atlas (10) and codex (22). Eleven moves and seven archived effects are retained outside the castable count. The portable ten-ability Atlas prototype is also preserved; it is not counted as ten additional castables or substituted for the richer native sandbox implementation.

## Actual architecture

Three.js `0.185.1`, Vite `8.1.5`, and lil-gui appear in the relevant source lockfiles. The root picker embeds `packs/sandbox`. The sandbox has a shared scene, character, dummies, camera, environment and common frame services. Four native groups contribute 56 abilities. Five lazy vendored runtime adapters preserve their original pack-specific settings, managers, pooling, particle, decal, burst and aim implementations. Source snapshot checks verify vendor copies byte-for-byte against original pack implementations.

Important source files: `packs/sandbox/src/core/App.js`; `config/sandbox.js`; `config/elements.js`; `abilities/sandbox.js`; `sandbox/createRuntime.js`; `vendor/runtimes/`; `bridge/MatrixBridge.js`; `sandbox/SandboxCharacter.js`; `sandbox/Locomotion.js`; `combat/DummyField.js`; `config/settings.js`. Their paths are relative to the imported runtime.

Models, cast clips, texture maps, HDR lighting and source rig builders are included. Procedural effects are real code and custom shaders, not placeholder image cards. Two pack-only features (webcam hand tracking and the casting pack's Duel Hall burn) remain in original pack applications; they are not promised in the unified sandbox. No permission to open a webcam is implied.

## Evidence and precise limitations

See the root [migration report](../../CASTABLE_MIGRATION_REPORT.md), [per-castable registry](../../CASTABLE_REGISTRY.json), [full file manifest](../../CASTABLE_SOURCE_MANIFEST.json), [validation report](../../CASTABLE_VALIDATION_REPORT.md), and [integration contract](../../ABILITY_MATRIX_INTEGRATION.md). Each castable has an implementation path, source permalink, unchanged full settings, dependencies, conservative model requirements and scoped validation fields.

Code presence, a passing module import and a successful Vite build are distinct from complete spell execution and rendered correctness. The current cloud browser reports WebGL2 unavailable. The game engine, production networking, audio system, persistent world, crafting and multi-Oath progression are not established by this repository's prototype technology. Source license notices are preserved; model/texture/animation commercial rights remain a review gate.
