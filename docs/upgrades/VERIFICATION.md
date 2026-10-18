# Oathbound production polish

This PR builds on merged PR #8. It preserves the Babylon runtime, canon, existing artwork, and current 150-castable catalog. It is a tested gameplay/runtime upgrade, not certification of AAA art fidelity or a replacement of all models/environments.

## Player-facing changes

- Optional 3D character inspection during character creation: actual gameplay model, orbit controls, idle/walk/attack playback, freeze pose, keyboard-accessible modal, and explicit procedural fallback when a model is unavailable.
- Character death poses no longer restart; landing/takeoff/channel transitions are corrected. Model upgrades preserve visibility, fading, movement and shadows. Disposing one character no longer destroys shared materials.
- Line attacks test the target's position at impact, making sidesteps effective. Cooldown reductions/resets reconcile with the server. All fifteen elemental self abilities have explicit tactical profiles, including working healing-over-time where appropriate.
- Confirmed hits receive victim-anchored elemental feedback, with stronger reaction feedback. Death cancels predicted cast effects.
- Region grading no longer mutates shared palettes. Weather fades between biomes, honors zero quality, and caps CPU particle work. Forest detail uses hysteresis. Shoreline/sky shaders avoid undefined reversed smoothstep behavior. Constant grain/chromatic fringing removed for legibility.
- Offline-ready notices expire instead of blocking mobile character entry or the hotbar; actionable updates remain explicit.
- Cached character catalogs work offline; asset probes use cache-compatible GET requests. Install state and explicit update/restart UI are corrected, with deduplicated resume/reconnect checks.
- Loadout draft descriptions reflect the chosen technique even while the draft temporarily contains duplicates. Generation validates source identity, numeric fields and deterministic output.

## Sources

All 40 supplied links are recorded in `source-review-first.md` and `source-review-second.md`, including the two organization URLs. The existing 150 entries match current Ability-Matrix source data: no missing IDs, no duplicate import. The separately preserved source sandbox still has its original 100 entries by design. No unrelated Three.js engine objects or unlicensed assets were copied into Babylon. Noncommercial/restricted sources were excluded; source reports identify licensing and compatibility constraints.

## Automated evidence

- `npm test`: **243 passed**.
- `node --test game/test/*.mjs game/tests/*.mjs game/src/combat/*.test.js game/src/vfx/*.test.js game/src/actors/*.test.js game/src/render/*.test.js`: **33 passed**.
- `npm --prefix server test`: **50 passed**, including WebSocket/social behavior.
- `node tools/generate-mmo-abilities.mjs --check`: **passed**, catalog matches both pinned sources.
- Production Vite build: **passed**. PWA precache is approximately 6 MiB; large model assets remain fetched on demand.
- `tools/test-character-runtime.mjs`: imported ninja, sorcerer and regional hound; real W movement (2.508 world units), Space jump and landing; no page errors. See `evidence/character-runtime.json` and screenshot.
- `tools/test-character-inspection.mjs`: production desktop (1440×900) and touch/mobile (390×844) flow passed: enter title, inspect real GLB, rotate/walk/freeze, close, name character, enter the world. Both have no page errors and no horizontal overflow. The final mobile rerun also asserts that health bars remain inside the player panel beneath long names. See `evidence/inspection.json` and desktop/mobile screenshots.
- `tools/run-pwa-smoke.mjs`: production service-worker offline reload, title rendering, cached icons, and offline character catalog passed. See `evidence/pwa-offline.json`.

Browser scripts use Playwright. Set `PLAYWRIGHT_EXECUTABLE_PATH` for character tests or `CHROMIUM_PATH` for PWA to an installed Chromium executable. They start Vite and Chromium together so they also work in isolated execution environments.

## Limits and review focus

Physical Android/iOS installation, device GPU performance, every unvisited model offline, and every realm's visual fidelity are not certified. Headless SwiftShader FPS is software rendering evidence only, not a target-device benchmark. Offline model availability depends on prior downloads and browser cache retention. Tactical profiles change balance and should receive player feedback. Existing asset artwork remains unchanged.
