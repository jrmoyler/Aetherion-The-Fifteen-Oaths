# Character runtime verification

## Scope

Existing canonical GLB models and procedural fallbacks are preserved. This work fixes runtime animation, asset promotion, and shared-resource ownership; it does not claim reconstructed or newly authored character artwork.

- GLB death clips hold their final pose rather than restarting, and revive permits a subsequent death animation.
- Landing state timers reset only on state entry. Jump uses the available takeoff before the airborne loop. Cast release ends channel animation.
- Procedural humanoid and creature death transitions cancel active attacks/cast layers.
- Promoting a procedural body to GLB preserves visibility, fade, locomotion state, direction, channel state, and player shadows. Chronicler NPCs retain the no-weapon contract.
- Disposing one GLB actor preserves the shared materials/textures used by the other actors and cached source. Source containers and tint caches clean up on scene disposal.
- Asset roots are scoped to each library. Manifest polling and fetch probes cancel on disposal. Offline-compatible GET probes and regional-only creature fallback permit cached or specific creature files to load.

## Measured evidence

`node --test game/src/actors/assets.test.js`: **6 passed, 0 failed**, using actual Babylon NullEngine scenes, animation groups, materials, and containers.

`PLAYWRIGHT_EXECUTABLE_PATH=/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell node tools/test-character-runtime.mjs`: **passed**.

The existing actor development harness imported the oath-04 ninja player, oath-04 sorcerer NPC, and oath-01 hound GLBs. Actual W keyboard input moved the player **2.508 world units**; Space entered the airborne `jump` state and returned to grounded `loco`. No page errors were observed. The scene contained **70 meshes**, **16 active** at measurement.

`character-runtime.png` shows the actual imported ninja and sorcerer in the actor harness. The harness uses simple ground/collision test geometry and its HUD refreshes separately from render; it is not a production-world screenshot. `character-runtime.json` contains the exact sampled state and measured values. Software-rendered headless Chromium/ANGLE SwiftShader observed approximately **6.18 fps** in this test; this is **not a physical-device performance benchmark**.

All fifteen Oaths' model fidelity, physical mobile hardware, and full-game performance remain outside this focused runtime test. The six regression tests validate the specific failure modes above.
