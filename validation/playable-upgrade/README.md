# Playable Oaths upgrade — verification

Base: `2ef994fce32cfdefeafb4d20b3a1fbd17f076bf9` (main). Six specialist agents implemented gameplay, controls, UI, world detail, effects/audio, and character playback; the integrator added genuine offline pause and ran production checks.

## Player-facing changes

- Pointer-locked left click/hold and held basic attacks now work. R3 selects the nearest hostile. Menu/chat capture clears all device state and cancels buffered combat.
- First movement cancels the introduction camera. Repeated attacks restart their authored clip, animation durations are respected, death interrupts actions, and fades retain authored material transparency.
- Every initiation step exposes a real destination. The HUD shows its direction and distance. Desktop command buttons and mobile touch utilities expose common actions; first-session guidance is visible.
- Offline windows and hidden tabs pause the authoritative simulation. Cooldowns and presentation time freeze with it. Returning to the world resumes control without catch-up. Online worlds continue running.
- Terrain gains slope strata, worn roads, volcanic emission, and seeded instanced biome plants/minerals. Roads, city footprints, terrain authority and collision remain intact.
- Confirmed impacts gain expanding shockwaves and flashes; fallback projectiles gain bounded directional trails. Original source ability implementations remain integrated. Audio voices are bounded and cleaned up, and reverb follows the SFX slider.

## Verification

- Production Vite/PWA build: passed (`build.txt`).
- Client/model/input/camera/world/VFX/audio/quest/pause checks: **65 passed** (`client-tests.txt`).
- Authoritative server regression: **52 passed**, including every hotbar castable, quest progression, enemy kill/loot, persistence, networking and social rules (`server-tests.txt`).
- Production browser smoke: actual keyboard movement and ability cast, loaded skinned GLB, zero page/console errors or HTTP failures, no SVG or horizontal overflow (`gameplay-smoke.json`, `desktop.png`).
- Production pause: actual menu click freezes player position and authoritative/presentation clocks; keyboard input cannot move the player; Return to world resumes movement with zero console errors (`pause.json`, `pause.png`).
- Desktop 1440×900 and touch 390×844 UI reviewed visually: no overflow or uncaught page errors; menu/resume works; touch utility targets measure about 53×53 px (`ui-verification.md`, screenshots).

## Review limits

Browser tests use Chromium software rendering at low quality. They prove execution and visible integration, not target-device FPS or a certification of AAA visual fidelity. Existing character GLBs are retained; this change repairs playback/material handling rather than claiming reference-exact mesh reconstruction. Full manual combat balance and listening review remain worthwhile. Browser combat details are recorded separately in `combat-results.json`.

## Reproduce

```sh
npm ci --prefix game
npm ci --prefix server
npm run build --prefix game
npm test --prefix server
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium node game/test/three-gameplay.browser.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium node game/test/pause-upgrade.browser.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium node game/test/combat-upgrade.browser.mjs
```

The browser scripts start their own local server. No production deployment or main-branch merge is performed by this PR.
