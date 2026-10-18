# Aetherion MMO — module contracts

The client is plain ES modules (no TypeScript) built with Vite 6 and **Babylon.js 9.31**
(`@babylonjs/core`, `@babylonjs/loaders`, `@babylonjs/materials`) plus **anime.js 4.5**
(`import { animate, createTimeline, stagger } from 'animejs'`). Import Babylon with deep
ES paths (`@babylonjs/core/Meshes/mesh.js`, etc.) and import side-effect modules you need
(e.g. `@babylonjs/core/Rendering/depthRendererSceneComponent.js`). Shared code is imported
with the `@shared/...` alias (→ `/shared`).

**Visual bar:** the 114 reference sheets in `assets/references/reference-*/original.png`
(AAA painterly-photoreal concept art). Nothing toylike: realistic proportions, PBR
materials, physically plausible lighting, ACES tonemapping, restrained saturation, weathering,
atmospheric depth. **No image generation and no downloaded imagery** — every texture is
produced by code (procedural shaders, DynamicTexture/RawTexture/canvas noise, Blender
procedural bakes).

## Boot order (game/src/main.js — owned by the integrator)

`ui → render → world → architecture → net → vfx → actors → combat`, each
`ctx.<name> = await <Module>.init(ctx)`. Then the frame loop runs
`ctx.input.poll()`, every `ctx.addUpdate(fn, order)` in order, `scene.render()`,
`ctx.input.endFrame()`. Then `ui.chooseCharacter()` → `net.connect(character)` →
`ui.enterGame()` → `bus.emit('game:start', character)`.

Update order convention: 0 input/ui-pre · 10 net · 20 actors (controller, camera) ·
30 combat · 35 vfx · 40 world (streaming, around camera) · 45 architecture · 50 render
(sun/sky) · 60 ui (HUD).

## ctx (shared context)

| field | provided by | notes |
|---|---|---|
| `engine, scene, canvas` | main | Babylon `Engine` (WebGL2) and the single `Scene` |
| `bus` | main | `on(type, fn) → off`, `once`, `emit(type, payload)` |
| `quality` | core/quality.js | `{name:'low'|'medium'|'high'|'ultra', renderScale, shadows, shadowSize, cascades, ssao, bloom, grass, drawDistance, particles, water, fxaa, msaa, shadowFilter:'medium'|'high', softShadows, anisotropy}` |
| `input` | core/input.js | `state {moveX, moveY, lookDX, lookDY, zoom, sprint, jump, mouseLeft, mouseRight, pointerLocked}`, `consume(action)`, `isDown(action)`, `press(action)`, `hold(action,on)`, `setVirtualMove(x,y)`, `addVirtualLook(dx,dy)`, `setVirtualSprint(b)`, `setTyping(b)`, `setEnabled(b)`, `requestPointerLock()`. Actions: `forward back left right jump sprint dodge interact slot0..slot5 target map inventory chat menu quest walkToggle click` |
| `collision` | core/collision.js | `addBox(cx,cz,hw,hd,rot,yMin,yMax,{walkable,tag})`, `addCircle(cx,cz,r,yMin,yMax,opts)`, `addRamp(cx,cz,hw,hd,rot,y0,y1)`, `groundAt(x,z,yHint)`, `resolve(pos,r,h)`, `blocked(ax,az,bx,bz,y)` |
| `clock` | main | `{time, dt, frame}` |
| `params` | main | `URLSearchParams` (`?q=low`, `?offline=1`, `?server=wss://…`, `?oath=oath-04&cls=ninja&name=X` = skip character screen, `?spawn=x,z`) |
| `render` | render/ | see below |
| `world` | world/ | see below |
| `architecture` | architecture/ | see below |
| `net` | net/ | see below |
| `vfx` | vfx/ | see below |
| `actors` | actors/ | see below |
| `combat` | combat/ | see below |
| `ui` | ui/ | see below |
| `character` | main | `{name, oath, cls}` after selection |

## render/ — Render & atmosphere (agent: world-nature)
`init(ctx) → { sun: DirectionalLight, hemi: HemisphericLight, shadows: CascadedShadowGenerator|null,
addShadowCaster(mesh, includeChildren=true), removeShadowCaster(mesh), pipeline: DefaultRenderingPipeline,
timeOfDay (0..24, read), setTimeOfDay(h), setTimeScale(s), envTexture (scene.environmentTexture), setWeather(kind, intensity),
setRegionGrade(oathId, weight) /* per-region colour grade + fog tint */, camera hook: render.attachCamera(camera) }`.
The **actors** module creates the gameplay camera and calls `ctx.render.attachCamera(cam)`
(the pipeline must be (re)bound to it). Until then render may create a temporary camera.

## world/ — Terrain, water, vegetation (agent: world-nature)
`init(ctx) → { heightAt(x,z), normalAt(x,z), groundAt(x,z,yHint) /* = collision.groundAt */, isWater(x,z),
waterLevel, update(dt) /* streams chunks around scene.activeCamera */, regionAt(x,z) → oath, focus(x,z) /* force-load around a point before spawn */,
ready(x,z) → Promise /* resolves once terrain around point is built */ }`.
Terrain heights **must** come from `@shared/terrain.js` (server uses the same function).

## architecture/ — Fifteen sanctuaries (agent: architecture)
`init(ctx) → { sanctuaries: [{oathId, center:[x,z], y, shrine:{x,y,z}, spawn:{x,y,z}, npcSpots:[{x,y,z,ry,role}]}],
update(dt) /* LOD / visibility */, shrineAt(x,z) }`. Registers colliders into `ctx.collision`
and shadow casters via `ctx.render.addShadowCaster`. Shared procedural PBR material library in
`game/src/materials/` (owned by architecture) — other modules may import it:
`getMaterial(scene, key, opts)` with keys like `stone.basalt`, `stone.marble`, `stone.sandstone`, `metal.brass`, `metal.copper`, `metal.iron`, `wood.weathered`, `cloth.banner` + palette tint.
Flat geometry resting on another surface (inlays, emblems, glow discs, rims, the plaza paving over the
terrain plateau) must use `overlayOf(matId)` from `architecture/kit.js` (= the same recipe with a negative
`zOffset` polygon offset) rather than a few centimetres of lift, so it never z-fights at distance.
Gameplay cameras keep `minZ >= NEAR_PLANE` (0.3 m, `actors/camera.js` / `render.attachCamera`).

## net/ — Networking (agent: server)
`init(ctx) → { mode:'online'|'offline', selfId, connect(character) → Promise<welcome>, send(msg), rtt, serverTime() }`.
Emits on the bus: `net:welcome`, `net:snap`, `net:ev` (payload = GameEvent), `net:you`, `net:status`
(`{mode, connected}`). Protocol in `shared/protocol.js`. Offline mode runs `shared/sim` in-browser
(`net/localServer.js`) with identical messages, populated with AI adventurers so the world feels alive.

## vfx/ — Effect library (agent: combat-vfx)
`init(ctx) → { play(effectId, {pos, dir, target, color, scale, duration, attachTo}) → handle, castEffect(ability, opts),
impact(element, pos, scale), trail(mesh, element), stopAll() }`. GPU particles where supported, CPU fallback,
scaled by `ctx.quality.particles`. Effect ids per element/ability shape.

## actors/ — Characters, controller, camera, mobs (agent: actors)
`init(ctx) → { camera, player /* local Actor */, entities: Map<id, Actor>, get(id), pick(screenX, screenY) → Actor|null,
nearestHostile(maxDist), forEach(fn) }`. Actor: `{ id, kind:'player'|'mob'|'npc', name, oath, cls, level, root: TransformNode,
position (Vector3, read), hp, mhp, alive, playAnim(name, {loop, speed, blend}), socket(name) → TransformNode /* 'hand.R','hand.L','back','chest','head' */,
headY }`. Listens to `net:welcome/net:snap/net:ev`. Sends `{t:'move'}` at `MOVE_HZ`.
Bus events emitted: `actor:spawn`, `actor:despawn`, `player:moved {x,y,z}`, `player:region {oath}`.

Character assets (Blender forge output, **may be absent** → actors must fall back gracefully):
`game/public/assets/characters/oath-XX-ninja.glb`, `oath-XX-sorcerer.glb` (XX = 01..15),
creatures in `game/public/assets/creatures/<id>.glb`, a manifest at
`game/public/assets/characters/manifest.json`. Rig contract (all humanoids):
bones `root, hips, spine, spine1, spine2, neck, head, shoulder.L/R, upperarm.L/R, forearm.L/R, hand.L/R,
thigh.L/R, shin.L/R, foot.L/R, toe.L/R` (+ optional finger bones); empty nodes `socket.hand.R`, `socket.hand.L`,
`socket.back`, `socket.head`. Clip names: `idle, idle_combat, walk, run, sprint, strafe_l, strafe_r, backpedal,
jump_start, jump_loop, land, dodge, attack_1, attack_2, attack_3, cast_channel, cast_release, cast_aoe, hit, death,
interact, emote_bow, sit`. Y-up, metres, character height ≈ 1.8 m, faces +Z (glTF forward), origin at feet.
Creature clips: `idle, walk, run, attack, hit, death` (+ optional `roar`).

## combat/ — Targeting, casting, feedback (agent: combat-vfx)
`init(ctx) → { hotbar /* hotbarFor(oath, cls) */, target, setTarget(id), cast(slot), cooldowns, castBar }`.
Reads `ctx.input.consume('slot0'..'slot5'|'target'|'click')`. Sends `{t:'cast', slot, target, aim, dir}`, plays local
anticipation immediately, resolves visuals on `net:ev` `cast`/`hit`/`death`. Floating damage numbers via `bus.emit('combat:floater', {x,y,z,text,kind:'damage'|'crit'|'heal'|'xp'|'miss'|'status', element})` (the UI renders them as DOM), hit flashes,
camera shake (`bus.emit('camera:shake', {strength, duration})` — actors' camera listens).
Bus events emitted: `combat:target {id}`, `combat:cooldown {slot, until}`, `combat:cast {slot}`.

## ui/ — HUD, menus, PWA, mobile (agent: ui)
`init(ctx) → { chooseCharacter() → Promise<{name, oath, cls}>, enterGame(), toast(text, kind), log(text), showDialog({title, text, options}) }`.
Listens to `loading`, `net:*`, `combat:*`, `actor:*`, `player:*`, `fatal`. Writes touch controls into `ctx.input`.
Visual language: the reference sheets' graphic design — warm parchment / slate panels, thin rule lines,
small-caps serif headers (e.g. "Cormorant Garamond"-style via system serif stack — no web font downloads required),
navy title bars, numbered section tabs. Elegant, readable, not cartoony.

## Shared rosters
`shared/creatures.js` — 12 creature archetypes and 60 region mobs/bosses (ids, names, roles, tints). `shared/oaths.js` — 15 Oaths, palettes, regions, classes. `shared/abilities.js` — `hotbarFor(oath, cls)`.

## audio/ (agent: ui)
Procedural WebAudio only (no sample files): generative ambience per region/biome, music, UI sounds, spell/hit/footstep sounds driven by bus events.

## Ownership (one agent per directory — never edit another agent's files; ask the integrator)
- `shared/oaths.js`, `shared/abilities*.js`, `shared/protocol.js`, `game/src/main.js`, `game/src/core/*`, `game/index.html`, `game/vite.config.js`, `game/package.json`: **integrator**
- `shared/terrain.js`, `game/src/render/`, `game/src/world/`: **world-nature**
- `game/src/architecture/`, `game/src/materials/`: **architecture**
- `game/src/actors/`: **actors**
- `game/src/combat/`, `game/src/vfx/`: **combat-vfx**
- `game/src/ui/`, `game/src/audio/`, `game/public/manifest.webmanifest`, `game/public/icons/`, `tools/ui/`: **ui**
- `server/`, `shared/sim/`, `game/src/net/`: **server**
- `tools/blender/characters/`, `game/public/assets/characters/`: **character-forge**
- `tools/blender/creatures/`, `game/public/assets/creatures/`: **creature-forge**

Dependencies are installed by the integrator; ask instead of running `npm install` in `game/`.
Do not commit; the integrator commits.
