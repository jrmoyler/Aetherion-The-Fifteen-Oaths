# MEMORY — Aetherion: The Fifteen Oaths (MMO build)

Project memory for anyone (human or agent) continuing this work. It records what exists, why it is shaped this way, how it was built, and what is still weak. Read this before changing anything under `game/`, `server/`, `shared/` or `tools/blender/`.

## What this is
A browser MMORPG of the Aetherion canon: one continent, fifteen Oath realms, two disciplines (Ninja / Sorcerer) per Oath, 100 canon castables, an authoritative multiplayer server, and an offline mode that runs the same simulation in the browser. It runs on desktop, mobile (touch controls) and as an installable PWA. Engine: **Babylon.js 9.31**, motion/UI timing: **anime.js 4.5**, assets: **Blender 5.2 (bpy) scripts**. No image generation, no downloaded art — every mesh, texture, sound and icon is produced by code.

## Run it
```
npm run mmo:install         # game + server deps
npm run mmo:dev             # Vite client on :5173 (proxies /ws to :8787)
npm run mmo:server          # authoritative server on :8787, serves game/dist
npm run mmo:start           # build client, then serve everything on :8787
npm run mmo:test            # simulation + server tests (21)
```
URL params: `?oath=oath-04&cls=ninja&name=X` (skip character creation), `?offline=1`, `?server=wss://host/ws`, `?q=low|medium|high|ultra`, `?spawn=x,z` (offline only), `?time=18.5`.
Deploy: `vercel.json` builds the static client (offline realm); run `server/` anywhere Node 22 runs (`server/Dockerfile`, `server/README.md`) for real multiplayer.

## Map of the code
| Path | Owner role | What |
|---|---|---|
| `shared/oaths.js` | integrator | 15 Oaths: names, elements, palettes, materials, architecture motifs, region centres (laid out to satisfy every WORLD_GRAPH adjacency), classes, XP curve |
| `shared/abilities.generated.js` | generated | `node tools/generate-mmo-abilities.mjs` from `CASTABLE_REGISTRY.json` → per-Oath ability catalog + Ninja/Sorcerer kits. Never hand-edit; CI checks it is in sync |
| `shared/terrain.js` | world-nature | deterministic heightfield used by client AND server (plazas flat at `SANCTUARY_HEIGHT`, roads ≤22°, coastline, lava, marsh) |
| `shared/creatures.js` | integrator | 12 archetypes, 60 region mobs/bosses, role stats, NPC roles |
| `shared/sanctuary-layout.js` | generated | measured shrine/spawn/NPC spots from the architecture module, consumed by the sim |
| `shared/protocol.js` | integrator + server | wire protocol (read its header: deltas, batching, events) |
| `shared/sim/` | server | authoritative simulation (combat for every shape, element reactions/statuses, mob AI with telegraphs and boss phases, quests, shrines, loot, chat, world events, AI adventurers). Pure JS — runs in Node and in a Web Worker |
| `server/` | server | HTTP static + `/ws`, validation, rate limits, token resume, JSON persistence, `/health` `/stats`, load test |
| `game/src/main.js`, `game/src/core/` | integrator | boot order, frame loop, input, 2.5D collision, quality tiers |
| `game/src/render/` | world-nature | physical sky + moon/stars/clouds, IBL from sky, cascaded shadows, ACES post stack, height fog/aerial perspective, 15 region grades, weather |
| `game/src/world/` | world-nature | worker-built streamed terrain with 18 procedural ground textures, ocean, lava, marsh, 13 vegetation/rock species, grass, horizon mountains |
| `game/src/architecture/`, `game/src/materials/` | architecture | the 15 sanctuary cities (from the reference ENVIRONMENT panels), procedural PBR library baked in workers + IndexedDB cache, ~5.7k colliders, LOD rings |
| `game/src/actors/` | actors | GLB loading + tinting, procedural fallback bodies, controller, orbit camera, animation blending, interpolation, nameplates, weapons |
| `game/src/vfx/`, `game/src/combat/` | combat-vfx | phase-scheduled effect composer; a distinct recipe for each of the 100 castables (`vfx/recipes/<element>.js`); targeting, cast flow, hit feedback |
| `game/src/ui/`, `game/src/audio/` | ui | title, Oath dossier character creation, HUD, minimap, world map + fast travel, inventory, settings, chat, NPC dialogue, touch controls, PWA install; procedural WebAudio |
| `tools/blender/characters/` | character-forge | `forge.py` + `cf/heroes/h01..h15.py` → 30 rigged heroes (`game/public/assets/characters/`) |
| `tools/blender/creatures/` | creature-forge | `forge.py` → 12 archetypes + 11 Oath variants (`game/public/assets/creatures/`); needs `scikit-image` in the Blender venv |
| `tools/qa/` | integrator | headless screenshot / perf probe / scripted play-through scripts |

`game/CONTRACTS.md` is the module contract; every module exposes `async init(ctx)` and must never throw from init.

## How it was built (the swarm)
One integrator wrote the shared contracts and scaffold, then eight agents worked in parallel, each owning one directory: world-nature, architecture, actors, combat-vfx, ui, server, character-forge, creature-forge. Each agent iterated against the reference sheets using headless Chromium (SwiftShader WebGL) or Blender Cycles review renders, comparing its output side by side with `assets/references/reference-*/original.png`. The integrator then merged the layouts (sim NPC spots ← architecture), verified the full app online and offline, profiled draw calls and added CI/deploy.

Reference map: 000–030 ability VFX sheets (water, lightning, frost, fire); 031–061 armor/weapon construction; 062–091 Ninja/Sorcerer turnarounds; 092–098 silhouette lineups; 099–113 per-Oath overview sheets (characters, items, assets, ENVIRONMENT panel). The old `assets/production/reviews/roster-r08` GLBs were rejected as toylike and are not used.

## Verified (and how)
- Server/sim: 21 tests pass (`npm run mmo:test`). Load test, 300 WS clients + 1,215 mobs: sim p50 3.9–4.8 ms; p99 11.4 ms on a quiet machine, 16.5 ms over 60 s, worse under CPU contention; ~11–13 KiB/s per client.
- Full client online: join → HUD → movement → casting → cooldowns; offline: worker sim, mobs aggro, kill the player, respawn at the shrine.
- ~250 real GL draw calls per frame on `high` incl. shadows and post (counted by wrapping `gl.draw*`; Babylon's `_drawCalls.current` is cumulative and misleading).
- All 53 GLBs re-import-validated (bones, clips, budgets) in Blender; sample heroes and the hound play in Babylon.
- Production build passes; PWA manifest, icons and service worker are emitted.

## Not verified / known weak spots (be honest about these)
- **Real-GPU frame rate was never measured** — every number here comes from CPU SwiftShader (0.3–3 fps). Profile on real desktop + phone hardware first.
- Fidelity vs. the reference art: compositions, palettes and silhouettes match; surface detail does not. Faces are simple, houses repetitive, metals flat, trees painterly cards, no waterfalls/ice cliffs, some sanctuary pieces lack colliders (rope bridges, Escapement viaduct deck).
- Creature anims: hound/raptor attack poses crumple at the chest; drake wing membranes are stiff; serpent head soft.
- Procedural audio is wired and starts on the first gesture, but nobody has listened to it critically.
- Gameplay gaps: no PvP, parties, trading or gamepad; projectiles are timed hits.
- The 11 failing root tests (`npm test`) predate the MMO work (ability-matrix runtime deps not installed) — identical on the base commit.

## Conventions worth keeping
- Shared code is pure and deterministic; anything the server needs lives in `shared/`.
- Regenerate, don't hand-edit: abilities catalog, sanctuary layout, icons, forge outputs.
- Every visual system reads `ctx.quality` and must degrade to `low` for phones.
- Compare against the reference sheets before calling visual work done.
