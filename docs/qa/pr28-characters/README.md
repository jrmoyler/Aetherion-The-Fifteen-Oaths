# PR #28 playable character review

| What to review | Capture |
| --- | --- |
| Daybreak Ninja’s silhouette and sword grip, and Tidal Sorcerer’s casting pose | [Matched before and after](./before-after.jpg) |
| Kiln, Storm and Daybreak faces alongside their reference art | [Portrait comparison](./portraits.jpg) |
| Daybreak Ninja and Tidal Sorcerer walking, running, sidestepping, attacking and casting | [Six-second motion study](./character-motion.mp4) |
| The Ninja and Sorcerer for every Oath using the production body factory | [30-character combat gallery](./roster-combat.jpg) · [Per-character rig measurements](./roster-validation.json) |
| Daybreak Ninja in the realm with the starter armor and weapon equipped | [Production gameplay frame](./daybreak-in-game.jpg) · [Gameplay assertions](./gameplay.json) |

The first three captures compare the playable character rebuild in commit `90583fd` with the earlier PR branch. The combat gallery and equipment frame exercise the follow-up changes. Each studio capture loads the shipped GLB in the game’s Three.js body factory. Each playable rig carries 23 body joints and 30 articulated finger joints at runtime. The roster check measures skin weights, finger rotation and sampled vertex movement during attacks and casts. The gameplay check exercises keyboard movement, casting, starter armor reach and rapid equipment swaps in the production build.

## Reproduce

Run these commands from the repository root with game dependencies and Playwright Chromium installed.

```sh
node tools/qa/roster-browser.mjs /tmp/aetherion-roster
npm run build --prefix game
AETHERION_SCREENSHOT=/tmp/aetherion-gameplay.jpg node game/test/three-gameplay.browser.mjs
```

Append a hero ID to the roster command for a single character. `PLAYWRIGHT_EXECUTABLE_PATH` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` select a system browser for the roster and gameplay checks respectively. These captures use software WebGL in headless Chromium.
