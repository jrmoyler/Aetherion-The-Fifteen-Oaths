# Aetherion runnable ability entry

From the repository root, after the pinned runtime dependencies are installed:

- `npm run dev:abilities`: serve this destination wrapper on localhost:5173.
- `npm run build:abilities`: build it to `dist/abilities`.
- `npm run preview:abilities`: preview that build locally.

The entry imports the immutable source App, HUD/loading screen, CSS and MatrixBridge. Vite serves/copies the original `runtime/ability-matrix/packs/sandbox/public` directory. It does not substitute procedural proxies for authored assets or change source settings.

A destination-only `app.loadRuntime` hook attaches the original Linear FissureSystem before returning the loaded Linear runtime. That fixes Meteor for source UI, URL/bridge and Aetherion adapter routes alike. The adapter's own safeguard remains idempotent.

The panel enumerates all 100 live castables from the original catalog, filters the original 15 elements, and delegates select/cast/clear to the adapter. Buffs remain source non-slot toggles; summons retain source deploy/recall behavior. Original source hotkeys, editor, movement, aiming and HUD remain available.

Browser console interfaces:

- `window.app`: original source App
- `window.matrix`: original source MatrixBridge
- `window.aetherionAbilities`: Aetherion adapter
- `window.aetherionReady`: promise resolving to `{ app, bridge, adapter }`

No browser/GPU success is inferred from building this wrapper. Current validation verifies entry wiring, real source CPU casting across the repair seam, bundle/catalog inclusion, copied-asset byte identity and, where available, local HTTP serving. See `validation/RUNTIME_AUDIT.md` for explicit GPU, target-rig and texture-decode limitations.
