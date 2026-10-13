# Ability Matrix runtime audit

Pinned source: `4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451`.

## Results

- **51/51 inherited Node tests pass.** These cover source snapshots, catalog/presets/bridge contracts and the ten portable prototype presets. They do not exercise all 100 live effects.
- **100/100 live castable module imports succeed.**
- **96/100 raw-source CPU lifecycles pass.** Actual source managers/services execute; geometry/transforms remain finite in sampled checks; casts complete or are explicitly dismissed/recalled, recast, cancel, release lights and dispose without an exception.
- **1 confirmed inherited integration defect:** raw hosted `linear/meteor` throws at impact because the sandbox omits `ctx.fissures`. The standalone Linear App supplies it.
- **That Meteor defect is repaired outside the immutable source snapshot.** The Aetherion integration instantiates the source `FissureSystem`, connects it to the source runtime context, and preserves the standalone update/clear/dispose order. Both direct repaired lifecycle and actual `adapter.cast()` → MatrixBridge → source aim/App → Meteor/fissure regressions pass.
- **97 distinct castables have CPU lifecycle evidence after the destination-only repair without image-decode adaptation.** A supplementary, explicitly adapted test below completes CPU lifecycle coverage for the other three. This is not a claim of full gameplay or visual equivalence.
- **3/100 are blocked in the raw CPU environment:** `linear-extended/quake`, `handcast/toxic`, `casting/shark`. Their stone-texture loader requires the browser `document` API. Their module imports succeed; their raw lifecycle is not counted as passing. **All three pass supplementary CPU tests** using actual source JPEG pixels through the narrow image-decode boundary described below. The raw baseline remains unchanged.
- **Sandbox and Atlas production builds pass.** Sandbox emits a chunk-size warning (main chunk approximately 3.34 MB minified); Atlas emits its own chunk-size warning. These warnings are not shader/runtime validation.

## Source defect and narrow repair

`runtime/ability-matrix/packs/sandbox/src/vendor/linear/abilities/MeteorAbility.js:972` invokes `this.ctx.fissures.spawn(...)`.

The standalone pack's `core/App.js` constructs `FissureSystem`, passes it to the manager, then updates/clears/disposes in the order decals → fissures → bursts. The hosted `sandbox/createRuntime.js` omits that service. The actual original runtime factory reproduces the error after 17 updates at 1/30 second.

`src/abilities/LinearFissuresIntegration.js` adds the missing original service to the destination's loaded Linear runtime. Its scoped instance hooks place the original fissure methods immediately after the private decal service methods. It changes no imported source file, global prototype, ability implementation, shader, balance setting or asset. Attachment is idempotent.

The regression checks actual fissure geometry, natural retirement, pooled reuse, one update per frame, clearing, light release and geometry disposal. The adapter regression also verifies a valid source aim, source cooldown and actual source cast count. Raw failing evidence remains in `meteor-source-defect.json`.

## Runnable destination wrapper

`app/abilities/index.html` and `main.js` boot the original App/LoadingScreen/MatrixBridge and import the original CSS. The destination's runtime-repair hook is installed at `app.loadRuntime` before `app.load()` and before bridge installation, so source UI and URL/bridge casts are covered as well as adapter calls. The page exposes `window.aetherionAbilities`, `window.aetherionReady`, the original `window.app` and `window.matrix`, plus full-catalog element/castable controls that preserve source buff and summon routing.

The final destination root suite passes **215/215**, and post-wrapper migration validation passes **208/208**.

Root `npm run dev:abilities`, `build:abilities` and `preview:abilities` target this wrapper through the pinned runtime's Vite JS API. Production output is `dist/abilities`. Its build passes; all 100 catalog identities are present and all 24 original public assets are byte-identical in the build. Entry/seam checks pass, including actual source Meteor execution via the repaired App loading boundary. See `aetherion-wrapper-build-verification.json` and `wrapper-entry-tests.log`. The wrapper is not counted as browser/GPU-validated.

## Coverage limits

All CPU casts use source default settings, one valid cast direction/distance, and an unloaded real source character controller with an empty real DummyField. No gameplay implementation is replaced, but target-dependent branches are not exercised. In particular:

- No authored FBX character or target rigs, populated-target collisions, damage, crowd control, ragdolls, body-attached effects or cloned-character appearance are certified.
- Eleven authored GLBs are parsed with real Three.js loaders and source rig builders. Embedded image decoding is unavailable in Node; upstream loader texture warnings/fallbacks remain unverified presentation.
- No GPU shader compilation/draw, particle shader motion, depth/post-processing, frame-rate performance, screenshot comparison or visual parity is certified.
- No complete browser bootstrap, URL asset-load flow, arbitrary preset/extreme settings or exhaustive concurrency matrix is certified.
- Persistent `portal`, `aether` and `firePortal` are correctly held then dismissed/replaced, rather than treated as timed effects. The drone and monowheel are steered, fired and recalled on an empty target field.

Local Chromium was present, but an allowed temporary profile still aborted with `socket() failed: Operation not permitted` in its process-singleton setup. See `chromium-capability-check.log`. Separate browser WebGL evidence, when present, is in `browser-gpu-check.json`. No attempt is counted as visual validation.

## Supplementary image-decode boundary (three castables)

`AUDIT_TEXTURE_FIXTURES=1 node tests/runtime-audit/cpu-lifecycle.mjs` runs only the three raw browser-API blockers and writes `texture-fixture-cpu-audit.json`, leaving `cpu-lifecycle-audit.json` unchanged.

Pillow 12.3.0 decodes the four actual source stone JPEGs (`color`, `normal`, `roughness`, `ao`, all 1024×1024) into RGBA8 bytes without resizing or synthetic pixels. The files carry no ICC profile. Source JPEG bytes and decoded RGBA bytes are recorded/verified with SHA-256. A test-process-only `TextureLoader.load` hook recognizes exactly those four relative URLs, creates real Three `DataTexture` objects from the bytes, copies the ordinary `Texture` sampling/orientation/mipmap defaults, and invokes the source load callbacks asynchronously. Other texture URLs still use the unmodified loader, including embedded GLB textures. No production adapter, source module, geometry, material/shader code, setting, particle system, hit logic or lifecycle implementation is changed.

Each supplementary cast requested exactly those four textures, completed all four callbacks, and reached the source texture state's loaded amount of 1. Each then passed full CPU lifecycle, finite-buffer/transform, recast, cancel, light-release and disposal checks. Shark uses its actual parsed GLB and source rig builder; embedded GLB image decoding is still unverified.

**Combined evidence exercises all 100 live castables' default empty-target CPU lifecycles:** 96 unadapted raw source, 1 destination-only Meteor service repair, and 3 explicit image-decode adaptations. This is not a 100/100 browser/GPU/gameplay validation result. DataTexture substitutes image transport only; browser image/color decoding, GPU upload/mipmaps, shader sampling and final appearance remain unverified. Decoded temporary files are generated under `/tmp` and do not change the source snapshot.

## Assets, dependency and licensing findings

Static literal-reference scanning covers 6,593 relative module references and 157 quoted model/texture/HDR references. The 581-module graph reachable from the sandbox entry has **zero missing relative module references and zero missing literal asset references**. This does not resolve dynamic template URLs or embedded binary references.

The broad inventory retains 664 missing import references: 658 in archived code, five unused vendored standalone entry points whose bridges are intentionally excluded, and the root bridge template's relative config path. The two missing broad-scan asset paths are the hosted vendor's unused Duel Hall model/texture directory; the README explicitly keeps Duel Hall in the standalone casting pack. They are not missing assets in the active sandbox import graph.

Dependencies were reused from an already-installed local Ability Matrix workspace at versions matching the destination lockfiles: Three.js 0.185.1, Vite 8.1.5, lil-gui 0.21.0. Clean `npm ci` was blocked by cache/network-approval constraints. This is a local execution result, not proof of a fresh reproducible registry install; tarball integrity was not freshly revalidated.

Source packs retain their MIT notices. `presets/new/LICENSE` explicitly does not relicense upstream code or third-party assets. README descriptions identify character FBX files as Mixamo exports and the ambientCG Rock030 scan as CC0, but a complete per-model, probe and texture provenance/license manifest was not found. Asset redistribution clearance is unresolved by this audit.

## Evidence

- `cpu-lifecycle-audit.json`: all 100 identities and exact per-castable stages, phases, assets, warnings and errors
- `meteor-source-defect.json`: actual unmodified-host failure
- `upstream-node-tests.log`: 51 passing inherited tests
- `linear-fissures-integration.log`: destination repair regression
- `adapter-meteor-runtime.log`: actual adapter and original source-bridge regression
- `sandbox-build.log`, `atlas-build.log`: production builds
- `static-reference-audit.json`: literal reference and license inventory
- `dependency-reuse.json`: local dependency method/version provenance
- `texture-fixture-cpu-audit.json`: three supplementary image-boundary lifecycle passes, source/decoded hashes and exact limitations
- `runtime-validation-results.json`: compact combined result summary
- `../tests/runtime-audit/README.md`: reproducible commands and methodology

The final JSON supersedes exploratory progress logs. Earlier harness-only assumptions about prewarm contracts and persistent lifetimes were corrected and rerun; no unexplained audit-process failure remains in the final results.

## Evidence path normalization

Published evidence trims trailing log whitespace and replaces machine-specific checkout prefixes with repository-relative paths, labels prior dependency installations generically, and omits ephemeral decoded-image fixture locations. Original source paths, SHA-256 values, measured results and failure messages are retained. Generated bundles, dependency directories and temporary RGBA files are excluded.
