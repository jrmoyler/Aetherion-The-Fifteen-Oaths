# Three.js source restoration — 18 October 2026

## Implemented

- All 150 catalog IDs dispatch to original Ability Matrix classes. Generic elemental effects remain only for basic attacks, status feedback and cosmetic impacts.
- The missing codex source, original procedural geometry, GLSL, particle pools, summon models and cathedral textures are included with pinned provenance.
- Original boost body GLSL uses isolated per-actor uniforms and restores original materials on cancellation/completion.
- Packed opaque scene depth, the original refraction shader, HDR environment input, bloom and output conversion are integrated with the game renderer. Low quality omits bloom/refraction but retains soft depth intersections.
- Source effect targets have visible carry, pinning, clipping, corrosion, consumption and knockdown presentation. Server position, health and collision authority are preserved.
- All 15 measured sanctuary city generators are native Three.js; merged geometry and instancing replace the repeated pavilion approximation. Canonical spawn/NPC/shrine coordinates and collision surfaces remain aligned with the server.
- Tree branching, root flares, conifers, bent grass clumps and flock geometry are present in the world.
- All 30 shipped character GLBs have real vertex-buffer changes, physical eye details and scalp corrections. Original animations, skins and inverse bind matrices are preserved. The supplied closeups are CPU triangle rasterizations, not WebGL evidence.
- `review.html` provides the actual source runtime with all 150 selectable effects, automatic playback, render-error display and diagnostic export.

## Checks actually performed

- Production Vite/PWA build: passed, including the review entry.
- Combined root/native Three/client regression: 267 tests passed (source provenance, model contract, actor-isolated boost shaders, source target restoration, source effect lifecycle, geometry, all-city spawn/collision checks).
- Character binary validation: all 30 rigs and animation/bind accessors preserved; finite geometry and normals; deterministic regeneration byte-identical.
- Extended source simulation: 147 of 150 effects execute through 12 simulated seconds with real Three scene objects and target callbacks. Shark, Quake and Toxic require browser image/texture APIs and are not counted as CPU passes.
- All 34 uploaded character/evidence blobs were independently matched against local Git SHA-1 values.
- Vercel built the initial PR snapshot successfully. Browser gameplay was not validated there: the available cloud browser cannot create a WebGL context.

## Render verification blockers

Local Chromium aborts before page launch with `socket() failed: Operation not permitted`. The GitHub Actions evidence job did not start: its run annotation states the account is locked due to a billing issue. The cloud preview browser reports `GL_RENDERER = Disabled` and `Error creating WebGL context`. These are distinct from a successful build or a tested game render. The repeatable browser harness and workflow are committed; no fabricated screenshot or rendered-pass claim is supplied.

## Acceptance still open

The character closeups remain visibly below the reference artwork: this is a bounded geometry correction, not a completed face/hair reconstruction. City source-layout restoration is not exact concept-image reconstruction. Full 150-effect on-screen appearance, target choreography, frame-rate and mobile visual approval require a WebGL-capable run. The PR remains a draft while those acceptance items are open.

The original dragon source model embeds CC-BY-NC-4.0; its commercial-use restriction is preserved in the served attribution and source import record. Other source model credits are also retained. Source-code MIT licensing does not override individual model licenses.
