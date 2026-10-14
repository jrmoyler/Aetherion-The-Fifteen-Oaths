# Daybreak practice courtyard

A separate browser entry for a small flat Daybreak practice area. It reuses the imported sandbox character/controller, four resettable practice targets, and the existing Daybreak floor-bay and public-colonnade LOD2 exports. No new art or source Ability-Matrix changes are required.

All **100 imported castables** are available: **95 abilities, 3 buffs, 2 summons**, across 15 source elements. Search by name, source ID, element or category; select a result and optionally assign it to one of four loadout slots. Filtering does not change the active selection. The source's 11 movement/presentation records remain preserved; they are not relabeled as additional castables.

## Run locally

From the repository root with Node 24 (tested with 24.19.0):

```sh
npm ci --prefix runtime/ability-matrix
npm ci --prefix runtime/ability-matrix/packs/sandbox
npm run dev:daybreak
```

Open the printed local URL (normally `http://127.0.0.1:5174/`). This is a local address, not a public play link.

```sh
npm run test:daybreak
npm run build:daybreak
npm run preview:daybreak -- --port 4184
```

## Controls

- Desktop: WASD/arrows move, Shift runs, Space dashes; mouse aims and left-click casts; right-drag orbits, wheel zooms. Number keys 1–4 select loadout slots. The Cast button also uses the current pointer aim.
- Touch: left movement pad walks, dragging the world aims without casting, Cast fires, Dash / Space holds the source Space action. Two fingers on the world orbit the camera. Controls release on pointer cancellation, lost capture, blur or hidden page.
- Buffs use Toggle buff. Summons use Deploy / recall, then held Fire, movement and Space according to the source summon. Recall before returning to ordinary movement/casts. The wrapper does not invent replacement summon mechanics.
- Reset targets + player clears source effects, returns the player to the origin and resets all four targets. Clear effects invokes the source clear behavior. Source cooldown rules are retained.

Normal abilities use the current world aim, not the bridge's automated cast direction. Action failures and source refusals are shown in the status line. Source hit behavior is a one-hit practice dummy simulation, not a full enemy combat system.

## Owner-operated Vercel deployment

No deployment has been performed. In the Vercel project build settings, use:

| Setting | Value |
| --- | --- |
| Git branch for this draft | `production/phase-i-ii-assets` |
| Root directory | Repository root (`.`), not `app/daybreak` |
| Framework preset | Other |
| Install command | `npm ci --prefix runtime/ability-matrix && npm ci --prefix runtime/ability-matrix/packs/sandbox` |
| Build command | `npm run build:daybreak` |
| Output directory | `dist/daybreak` |
| Node version | 24.x |
| Environment variables | None needed by this static entry |

These are custom build/output settings supported by [Vercel's build configuration documentation](https://vercel.com/docs/builds/configure-a-build). Only the output directory is served. Do not select the repository root as the output directory. There are no server functions or SPA routes to rewrite; the entry is at `/`. The asset URLs are relative. The repository remains large because it contains source art and review history; those files are not copied wholesale into this web build.

The asset allowlist in `assets.json` verifies the two source GLBs by SHA-256 before serving or copying them. The build adds their 5,211,452 bytes to the original sandbox public assets and compiled runtime. It excludes other production assets, Blender files, reference sheets and review packages. The browser still loads substantial original runtime content; pixel ratio is capped at 1 for this entry, but there is no measured phone performance claim.

## Validation and limits

Focused CPU tests check all 100 catalog selections/action routes using a mock runtime, loadout behavior, user-aim preservation, touch release/reset/error handling, and the actual allowlisted GLB bytes/materials/UVs/floor bounds. These are **not** 100 rendered gameplay certifications. The existing source-integrity regression checks the immutable 1,896-file import. Build and HTTP checks do not establish visual approval.

A normal Chromium launch in this executor aborts because `/usr/lib/chromium/chrome-sandbox` has invalid SUID-helper ownership/configuration. No sandbox bypass or security setting change was used. GPU gameplay, actual touch hardware, frame rate, and visual acceptance remain unverified. Vite reports a large runtime chunk warning. See [the scoped evidence](../../validation/daybreak/README.md).

The flat floor spans 24 × 24 metres; normal player locomotion uses the source's 9-metre arena radius. Columns are scenery outside the ordinary movement circle, not new physics obstacles. Body-owning teleport/movement abilities and summons retain their source behavior and may travel beyond the courtyard; Reset returns the practice session to its origin. There is no navigation mesh, wall collision simulation, multiplayer, persistence, quest system, or full continental world in this entry. The reused architecture remains PROPOSED, not visually approved. The broader Phase I/II production work remains incomplete.
