# Source runtime audit

These tests execute the unchanged Ability Matrix code, not a replacement ability implementation. The imported snapshot must remain byte-identical to source commit `4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451`.

## Commands

From the Aetherion repository root:

- `npm run test:source`: the 51 inherited source tests.
- `node tests/runtime-audit/cpu-lifecycle.mjs`: all 100 catalogued live castables, isolated processes and a per-castable JSON report.
- `AUDIT_RETRY=1 node tests/runtime-audit/cpu-lifecycle.mjs`: retry non-passing entries without replacing earlier successful evidence.
- `node tests/runtime-audit/reproduce-meteor-defect.mjs`: demonstrate the unmodified hosted Meteor failure using the original runtime factory. Exit status 1 is intentional while the source omission remains.
- `node --test tests/linear-fissures-integration.test.mjs tests/adapter-meteor-runtime.test.mjs`: the Aetherion-only repair and actual adapter/source-bridge regression.
- `AUDIT_TEXTURE_FIXTURES=1 node tests/runtime-audit/cpu-lifecycle.mjs`: supplementary runs for the three browser-API blockers using real source JPEG decode (requires Python Pillow); produces a separate report and preserves the raw baseline.
- `python tests/runtime-audit/static-references.py`: literal source-import/asset audit and license inventory.

The raw CPU audit exits nonzero for failures and browser-dependent entries. A successful import is not a lifecycle pass. The authoritative final result is `validation/cpu-lifecycle-audit.json`, not an intermediate progress log.

## What is real

The CPU harness constructs the source Environment, character controller, empty DummyField, AbilityManager, particle/decal/burst/light/shake/flash services, and real Three.js geometry/materials. It uses each source pack's own manager and services, source defaults, and source GLB rig builders. The two summons are steered, fired, and recalled. Persistent gates/rings are held, dismissed, replaced and cleared using their source contract. Ordinary effects run until source retirement, then recast and cancel. Finite geometry/transforms, pooling, light release, and disposal without exception are checked.

Authored GLB meshes and animation clips are actually parsed. Node cannot decode their embedded textures, and Three's own image-load fallback/warnings are retained. No gameplay service is stubbed to manufacture a pass.

## What is not verified

No WebGL draw or shader compilation, visual comparison, authored FBX character/target loading, bone-specific presentation, populated-target collisions/damage/ragdolls, arbitrary presets, all concurrency combinations, or gameplay balance. Source particle motion is shader-evaluated; CPU buffer checks do not verify that motion. Browser App boot and URL asset fetching are not covered by the Node tests.

The adapter regression executes the original MatrixBridge, App select/arm/cast methods, AimController and Meteor/FissureSystem on a CPU-hosted App instance. Only browser event transport and frame scheduling are supplied by the test host. The renderer/editor constructor is deliberately not invoked.

Clean `npm ci` was blocked in this environment. Tests/builds reused locally available dependency files at lockfile-matching versions; see `validation/dependency-reuse.json`.

## Optional stone-image boundary

The supplementary run decodes only the four exact source stone JPEGs with Pillow, verifies source/decoded SHA-256 hashes, and creates real Three DataTextures with normal TextureLoader sampling/orientation defaults. The test-only hook leaves other texture URLs and all source gameplay/material/shader logic untouched, runs source onLoad callbacks asynchronously, and is restored after the process. It does not verify browser decoding or GPU upload/sampling. The generated RGBA files live in an allowed temporary directory; no source files are modified.
