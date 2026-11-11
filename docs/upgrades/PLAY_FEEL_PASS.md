# Play-feel pass: HUD, controls, combat, VFX

10 November 2026. Stacked on the Ability Matrix / Biome Triad / Arsenal Forge integration. Each item below was found by
using the game in headless Chromium and reading state out, not by restyling what already worked.

## Combat

- **A first fight you can win.** No camp in the world was below level 3, and Daybreak's weakest was level 4 with a veteran:
  camp level was measured from the sanctuary wall, but camps cannot stand within 40 m of it. Level 1 now starts at the camp
  ring, and each realm's nearest camp is always two common creatures at levels 1 and 2 (`shared/sim/world.js`).
- **Soft targeting.** A technique thrown with nothing selected takes the enemy you are looking at, if one is in reach.
  Under pointer lock only an enemy near the reticle is taken, so deliberate aim is left alone.
- **Party adventurers keep up.** An AI party member no longer starts a fight of its own while its leader is walking away.
- **Readable numbers.** Hits on one body fan into lanes instead of piling up; other people's fights shrink with distance
  and vanish past 48 m; passive regeneration no longer prints a stream of +1.

## Controls

- **Draught on Q, ether on X**, with slots beside the hotbar showing stock and the shared cooldown. They work by click and
  tap too, and refuse to pour onto a full bar. Before this, potions could not be drunk at all (see the integration PR).
- **Trees are solid.** You could walk through every trunk, and a trunk between camera and character filled the screen.
  Trunks now stop the body and pull the camera in front of them. They are kept per streamed tile, outside the collision
  world, so nothing leaks as tiles unload.

## HUD

- In a fight the guidance panel keeps its instruction and drops its timeline, and the task tracker dims until hovered.
- Narrow windows: the realm line stays inside the compass, the minimap no longer shows a clipped one-letter realm name,
  and the target frame sits below the compass rather than across it. Short windows: guidance ends above the hotbar.
- Touch, short landscape phones: a smaller minimap frees the utility row, the belt drops its key caps, and the chat button
  no longer sits on the action bar.

## Rendering and VFX

- **Tier without shadow maps** (phones, software GPUs): exposure drops from .93 to .74 so pale paving stops clipping to
  white, and every body gets a soft contact shadow so characters stop floating. `before-low-tier-plaza.png` against
  `hud-desktop-and-narrow-low-tier.png`.

## Evidence

- Server 52 pass (new: starter camp per realm; follow test measures closing distance). Client 87 pass, 3 fail; root 240 pass,
  3 fail. The six failures are the ones that fail on `main`. `mobile-hud-layout.browser.mjs` passes.
- New tests: trunk push-out and camera ray (`game/src/three/trunks.test.mjs`), paused-world menu messages, grimoire swap.
- Headless runs: Q pressed at full health leaves stock at 3 (guard), and at the earlier build 3 to 2 with the cooldown sweep
  showing; soft targeting acquired a creature and set the in-combat state; no page errors in any run.

## What I could not judge

Software rendering runs this game at about one frame a second while the offline simulation runs in real time, so the
character acts once a second against creatures acting at full speed. Fights cannot be won or timed there. The starter
fight is argued from the numbers (two creatures, 224 health, about 7.6 damage a second against a 120-health sorcerer
dealing about 22), not from a recorded win. Camera pull-in near trees, the feel of soft targeting, and the touch layout on
a real phone all need a pass on real hardware. The touch utility row still crowds Interact and Dodge at 844x390.
