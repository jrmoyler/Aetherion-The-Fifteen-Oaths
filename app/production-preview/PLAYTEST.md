# Game Studio preview audit and playtest gate

**Browser playtest and screenshot acceptance: BLOCKED, not waived.** The environment's normal Chromium launch is blocked by sandbox configuration and no `/dev/dri` GPU interface is available, as recorded in [toolchain status](../../docs/production/PHASE_I_II_STATUS.md). This audit does not claim new screenshot, shader, image-decoding, recovered-context GPU, visual-layout or rendered-input passes. No sandbox/security settings were changed.

The applied skills are **three-webgl-game**, **game-ui-frontend**, and **game-playtest**. The last requires: “When the game is canvas or WebGL heavy, screenshots are mandatory because DOM assertions alone miss visual regressions.” Screenshots remain an open gate until a supported browser environment is available.

## Findings and implementation

| Priority | Finding and reproduction | Change | Evidence boundary |
|---|---|---|---|
| High | Original renderer creation threw and left a nonfunctional loading interface when WebGL was unavailable | DOM fallback, disabled inspection controls and a retry action preserve a useful failure screen | Startup branch implemented; actual unsupported-browser screenshot blocked |
| High | A lost context had no explicit pause/recovery policy | Cancel default loss behavior to request recovery; stop loop/camera input; display recovery message; resume after restore; failure/disposal cannot revive | Event/lifecycle tests pass; real GPU context loss/recovery blocked |
| High | Production folders exposed DCC `.blend`, notes and unused assets through the preview server/build | Manifest-derived allowlist includes only viewer GLB states/LODs, manifests and actual external GLB image/buffer dependencies; `.blend` paths return 404 | Positive byte checks, negative HTTP checks and exact build-file-set assertion pass |
| Medium | Keyboard users could not orbit or zoom without a pointer | Focusable canvas; arrow orbit, +/− zoom, F/Home fit; Tab exits; modifier/browser shortcuts stay untouched | Input routing tests pass; browser focus order/screenshot gate blocked |
| Medium | DOM focus and camera-control ownership were implicit | Inspector focus gates OrbitControls; pointer focus on canvas returns ownership; shortcuts apply only to canvas targets | State/input tests pass; real pointer/touch interactions blocked |
| Medium | Default animation and damping ignored reduced motion | Reduced-motion starts paused and disables damping; explicit Play remains possible | Preference-change tests pass; real browser media emulation blocked |
| Medium | Hidden or zero-sized viewport could produce unusable camera aspect; background/BFCache lifecycle was incomplete | Positive finite viewport guard, DPR cap/update, visibility and BFCache pause/resume, clock reset and listener cleanup | Resize/lifecycle tests pass; mobile orientation/BFCache browser pass blocked |
| Low | Expanded secondary controls and scope text competed with the asset | Animation/material controls, camera help and review scope use collapsed DOM disclosure; inspector remains beside/below the view | CSS/DOM change implemented; obstruction/contrast judgments require screenshots |

The preview remains plain Three.js and DOM. Stable element and asset IDs are preserved. No physics or game simulation was added; its existing glTF/material/animation inspection and resource ownership remain distinct from source gameplay. The visual direction remains dark workshop surfaces with brass accents and restrained motion.

## Automated evidence

`npm test` currently executes 21 tests: ten prior ownership/state tests, seven browser lifecycle/input/reduced-motion/resize tests and four runtime shipping-boundary tests. `npm run build`, `npm run test:http` and `npm run test:http:build` pass with 16 manifests and 158 viewer GLBs at the audited snapshot. Both HTTP modes deny every manifested `.blend` path; the built file set must exactly match the runtime allowlist.

At this snapshot, the production source tree contains 703 files / 1,125,283,396 bytes. The preview asset bundle contains 175 files / 708,602,506 bytes (158 GLBs, 16 manifests, one catalog). This removes authoring-only content but is **not** a performance approval; embedded textures and per-state exports still make the full downloadable collection large. Assets load individually on selection. Main bundle size warning is retained (approximately 647 KB minified). Do not infer target-device frame cost or download suitability from a successful build.

These counts describe the current frozen weapon collection and the then-present character export, not acceptance of any subsequent character revision. Rerun `npm run validate:snapshot` after final authoring freezes and use its hashes for a new checkpoint.

## Required supported-browser pass

Run `npm run dev` or build and run `npm run preview` without disabling the browser sandbox. Record the exact commit, browser/GPU, viewport, device-pixel ratio, manifest/GLB hashes, console output, and screenshots for every applicable row below. A blocked row stays BLOCKED; a DOM assertion alone cannot change it to PASS.

| Gate | Steps and expected behavior | Required screenshot |
|---|---|---|
| First actionable desktop view | Open at 1440×900. Select a weapon. Asset visible, no clipping/loading stall; inspector leaves the scene clear | First textured PBR asset |
| Keyboard and UI ownership | Tab to canvas; orbit/zoom/fit. Tab to each select and button. Arrow changes form selection without moving camera; no trapped focus | Focus-visible canvas and focused inspector |
| Pointer and touch | Orbit, pan, zoom; change controls during/after drag; inspect on touch viewport | Representative camera views |
| State/LOD semantics | Switch ready/damaged/stowed and LODs. Optional states have only their own authored export; no stale model from a late load | Each state plus an authored LOD |
| Materials and image decode | Compare PBR textured, untextured, normals and wireframe; return to original PBR | Each mode, with console checked |
| Animation/pause | Select a clip, play, pause, switch assets rapidly, return to rest pose; check bounds and skin behavior | Rest and representative animated pose |
| Reduced motion | Emulate `prefers-reduced-motion: reduce` before boot and during a clip; no automatic clip motion/damping; explicit Play works | Paused reduced-motion state |
| Resize/mobile | Resize through 390×844 and 320×568, rotate, hide/show tab; no invalid aspect, overflow, covered controls or animation time jump | Portrait and landscape |
| Context loss/recovery | In a supported local browser use its WebGL context-loss extension/debug tooling; confirm visible paused state and recovery without duplicate loops or stale GPU assets | Lost and recovered states |
| Unsupported/failure fallback | Use browser-supported WebGL disable/emulation in a test profile; readable error and retry remain usable; no blank loader | Fallback screen |
| Navigation | Navigate away/back with BFCache, then perform a real page unload; scene resumes or cleans up appropriately | Restored view plus console/memory notes |
| Resource/performance | Repeat asset/state/LOD changes and inspect renderer/process memory and frame timings with browser performance tools/SpectorJS when available | Representative scene plus exported diagnostics |

Current status for all real-browser rows: **BLOCKED — screenshots not captured**. GPU material parity, authored animation quality, screenshot-level responsive layout, and target-device performance remain unverified.
