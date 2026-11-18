# Story first-play verification

The 390 × 844 captures use the production Three.js client in Chromium with software WebGL at low quality. The player enters local story from a fresh browser profile, keeps the suggested hero name, and chooses the Daybreak Sorcerer.

| State | Capture |
| --- | --- |
| Story title and entry choices | [Title](touch-title.jpg) |
| Fighting style and optional hero name | [Hero selection](touch-character.jpg) |
| One objective and space to play | [First objective](touch-first-objective.jpg) |
| Live gameplay at 844 × 390 after meeting Sorin | [Landscape](touch-landscape.jpg) |
| Live gameplay at 320 × 568 after meeting Sorin | [Compact portrait](touch-compact.jpg) |
| Previous mobile task panels and action layout | [Merged PR #28 baseline](previous-touch-hud.jpg) |

The live touch run opened and closed the journal, checked the portrait hit targets and used touch movement and camera controls to reach Sorin Kes. Speaking with him advanced the campaign to the evacuation road objective. All 14 controls were reachable at each viewport size. The run used reduced motion to bypass the arrival film. The final stylesheet reduced the Ultimate and Interact captions after capture to fit compact buttons.

The simulation completed all seven story objectives and verified that completed encounters stay cleared after a save reload. A controller probe followed each of the 15 starting routes through the city collision geometry to both encounters, the Oathkeeper, the neighboring shrine and the second witness.

Run the browser regression after building the game.

```sh
npm --prefix game run build
node game/test/story-first-play.browser.mjs
```

The browser runs use software WebGL. Physical iOS and Android performance remains unmeasured.
