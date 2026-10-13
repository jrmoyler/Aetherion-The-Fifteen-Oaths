# Collective Ability Matrix

**100 castable abilities** (95 abilities, 3 buffs, 2 summons) from 9 groups, **sorted into 15 elements**, plus 11 character moves (walk, run and dash among them) and 7 archived effects, all in **one sandbox**: one scene, one character and one set of target dummies.

Open the matrix, pick any ability, cast it, tune it, and copy its settings as a preset for your own Three.js games. Walk the caster around the arena while you do it.

## One sandbox

`packs/sandbox` is the single page that runs everything. The matrix (`index.html`) embeds it and acts as its picker.

| Group | Runs on | Count | Notes |
|-------|---------|-------|-------|
| Collective | sandbox engine (native) | 12 | Collective originals |
| Matrix New | sandbox engine (native) | 12 | New: shaders, rigs and dummy reactions at Collective quality |
| Ability Atlas | sandbox engine (native) | 10 | New: the ten Atlas mechanics, rebuilt on the full engine with the character and dummies |
| Elemental Codex | sandbox engine (native) | 22 | New: 22 abilities filling out the thinner elements, at the same quality bar |
| Linear | vendored `linear` engine | 6 | |
| Linear Ext | vendored `linear-ext` engine | 7 + 3 buffs | Gate, ring and scribe aims; Electric, Magic and Fire boosts on the character |
| Linear Extended | vendored `linear-extended` engine | 10 | Includes the Cyber Serpent model |
| Hand Cast | vendored `handcast` engine | 9 | Includes the drone, monowheel and phoenix rigs; the two summons are drivable |
| Ability Casting | vendored `casting` engine | 9 | The shark, wolf, dragon, gyroscope, amethyst, tome and reliquary rigs, with ragdolls |

### How the source packs run inside it

The five source repos each ship their own copy of the particle, decal, burst, aim and pooling systems, and those copies drifted apart. Their abilities are written against their own copies. So the sandbox does **not** port them; it runs each one verbatim:

- **Vendored code.** `packs/sandbox/src/vendor/<pack>/` is a byte-for-byte copy of `packs/<pack>/src`; the test suite checks this.
- **Own systems.** Each pack keeps its own AbilityManager, ParticleEngine, DecalSystem, BurstSystem, AimController, settings and editor folders. They are hosted by `src/sandbox/createRuntime.js`.
- **Shared scene.** All packs share the scene, camera, lighting, environment, character, camera shake, screen flash and target dummies. The host frame uniforms (clock, depth and light direction) are copied into each pack every frame.
- **Loaded on demand.** A pack's engine loads lazily the first time one of its abilities is picked.

Every ability is addressed by uid: `<pack>/<id>`, for example `casting/dragon` or `atlas/stillpoint`.

### Pack-only features

Two features stay in their original packs and are not in the hosted sandbox:

- **Hand-tracking cast** (Hand Cast and Ability Casting, `M`). It needs a webcam.
- **Duel Hall burn** (Ability Casting, `` ` ``). It needs that pack's gothic hall scene.

## What's here

```
index.html                 the matrix: picker + the embedded sandbox
packs/sandbox/             the one sandbox (Vite app)
  src/config/{collective,matrix-new,atlas,codex}/   native ability settings
  src/abilities/{collective,matrix-new,atlas,codex}/ native ability code
  src/config/elements.js   every castable's element
  src/sandbox/Locomotion.js walking, running, dashing
  src/vendor/<pack>/       the five source packs, verbatim
  src/vendor/runtimes/     how each pack is hosted (models, summons, buffs)
packs/<pack>/              each source pack and the collective, still runnable on its own
packs/atlas/               the asset-free Atlas prototype (presets/runtime.js)
presets/catalog.json       every ability, buff, summon, move and archived effect, with its element
presets/<group>/<id>.json  one preset per ability (full default settings block)
presets/library.json       every preset in one file
tools/                     build-all.sh · stage-site.sh · extract-presets.mjs
tests/                     npm test
```

## Run it

```sh
sh tools/build-all.sh
sh tools/stage-site.sh
npx serve site
```

To work on the sandbox alone: `cd packs/sandbox && npm i && npm run dev`.

Sandbox keys:

| Key | Action |
|-----|--------|
| `W A S D` / arrows | Walk (relative to the camera) |
| `Shift` | Run |
| `Space` | Dash |
| `[` / `]` | Previous / next ability, across every pack |
| `Q E R F V X B Z N K Y U` | The twelve Collective originals |
| `G` | VFX editor |
| `P` | Pause |
| `C` | Clear |
| `T` | Reset targets |
| `H` | Help |

While a summon is out: `WASD` / arrows steer it instead of the caster, `Space` or hold-click fires, and the same ability recalls it.

## Moving the caster

The caster walks, runs and dashes around the arena:

- **W A S D** (or the arrows) walk relative to the camera, **Shift** runs, **Space** dashes the way you are moving (or facing).
- **Cast on the move.** The aim arrow and the zone circle ride with the caster. While an ability is armed, the body keeps facing the aim and strafes, at `aimSpeed` of its pace.
- **A procedural gait.** The rig ships only an idle and three cast clips, so `SandboxCharacter` builds the walk itself, over the idle: thigh swing, knee fold, arms against the legs, shoulder twist, pelvis roll and bob, and lean, blending into a longer, deeper run. A cast clip plays on top: the legs keep walking and the arm swing gets out of its way.
- The caster walks round the dummies rather than through them, and stays inside `arenaRadius`. The dummies re-form round wherever you stand.
- Steering stands down while a summon is out, and while Blink Step, Voidstep Rift, Parallax Blink or Chrono Recall is moving the body.
- Every value (speeds, dash, every gait angle) is in `settings.move` and the editor's **Movement** folder, and ships in each group's `_shared.json`. The bridge takes `move('dash')`.

## Using an ability as a preset

Each preset is the ability's complete settings block:

```json
{ "format": "collective-ability-preset@1", "uid": "matrix-new/starfall", "pack": "matrix-new", "id": "starfall",
  "cast": "zone", "castAnim": "cast3", "settings": { "range": 20, "zoneRadius": 5.5 } }
```

1. Copy the engine that owns the ability: `packs/sandbox/src` for the native groups, or `packs/<pack>/src` for a source pack.
2. Load the preset and merge it: `applySettings({ [preset.id]: preset.settings })`.
3. Cast it: `abilityManager.cast(origin, direction, distance, preset.id)`.

## Bridge API

The sandbox exposes the same API by URL, JavaScript and postMessage.

- **URL:** `?ability=<uid>` selects it, `&cast=1` casts it on load, `&auto=<s>` recasts on a loop, and `&hud=0` runs it embedded.
- **JS:** `window.matrix.list()`, `select(uid)`, `arm(uid)`, `cast(uid)`, `auto(uid, s)`, `clear()`, `runAction(pack, action)`, `move(name)`, `preset(uid)`, `applyPreset(uid, json)`, `resetPreset(uid)`.
- **postMessage:** `{ matrix: 'cast', uid: 'casting/dragon' }`.

## Abilities, by element

Every castable has one element, set in `packs/sandbox/src/config/elements.js` and carried in the catalog as `element`. The matrix groups its spellbook by element by default; switch to **By pack** to see where each one came from. The keys each source pack uses on its own are in that pack's README.

### Fire · 10

| Ability | uid | Group | Kind / aim | Range (m) | Circle (m) |
|---------|-----|-------|------------|-----------|------------|
| Cinder Fall | `linear/meteor` | Linear Ability Casting | line | 3–20 |  |
| Pyre Crown | `linear-ext/pyre` | Linear Ability Ext | zone | 0–18 | 4.2 |
| Fire Portal | `linear-ext/firePortal` | Linear Ability Ext | scribe | 3–18 |  |
| Fire Boost | `linear-ext/fire` | Linear Ability Ext | buff |  |  |
| Volcanic Ward | `linear-extended/ward` | Linear Ability Casting Extended | zone | 0–20 | 5 |
| Serpent Tide Field | `handcast/phoenix` | Hand Cast Ability | zone | 0–22 | 5 |
| Dragonfire Circle | `casting/dragon` | Ability Casting (Elemental Sandbox) | zone | 0–22 | 5.5 |
| Meteor Swarm | `collective/swarm` | Collective Originals | zone | 2–16 | 3.6 |
| Emberveil Lattice | `matrix-new/emberveil` | Matrix New | zone | 0–16 | 5.5 |
| Solar Lash **new** | `codex/solarlash` | Elemental Codex | line | 2–20 |  |

### Frost · 6

| Ability | uid | Group | Kind / aim | Range (m) | Circle (m) |
|---------|-----|-------|------------|-----------|------------|
| Frost Lance | `linear/ice` | Linear Ability Casting | line | 2.5–15 |  |
| Glacial Crown | `linear/glacier` | Linear Ability Casting | zone | 0–18 | 4.6 |
| Glacial Shard Storm | `handcast/glacial` | Hand Cast Ability | line | 4–30 |  |
| Glacial Prison | `handcast/frost` | Hand Cast Ability | zone | 3–20 | 3.2 |
| Permafrost Bloom **new** | `codex/permafrost` | Elemental Codex | zone | 0–18 | 4 |
| Avalanche Wake **new** | `codex/avalanche` | Elemental Codex | line | 3–22 |  |

### Lightning · 9

| Ability | uid | Group | Kind / aim | Range (m) | Circle (m) |
|---------|-----|-------|------------|-----------|------------|
| Storm Lance | `linear/thunder` | Linear Ability Casting | line | 2–24 |  |
| Voltaic Snare | `linear/snare` | Linear Ability Casting | zone | 0–20 | 4.4 |
| Electrical Sphere | `linear-ext/electrical` | Linear Ability Ext | zone | 0–18 | 4.5 |
| Electric Boost | `linear-ext/boost` | Linear Ability Ext | buff |  |  |
| Stormheart Gyroscope | `casting/gyro` | Ability Casting (Elemental Sandbox) | zone | 0–20 | 6 |
| Chain Arc | `collective/chain` | Collective Originals | line | 3–18 |  |
| Ion Storm Pillar | `matrix-new/ionstorm` | Matrix New | zone | 0–18 | 5 |
| Arc Relay | `atlas/relay` | Ability Atlas | line | 3–18 |  |
| Ball Lightning **new** | `codex/balllightning` | Elemental Codex | line | 2–20 |  |

### Water · 6

| Ability | uid | Group | Kind / aim | Range (m) | Circle (m) |
|---------|-----|-------|------------|-----------|------------|
| Kraken Crown | `linear-ext/kraken` | Linear Ability Ext | zone | 0–18 | 4.6 |
| Tidewrought Ring | `linear-ext/aether` | Linear Ability Ext | ring | 3.5–18 |  |
| Sumi Tide | `linear-extended/ink` | Linear Ability Casting Extended | zone | 0–22 | 5 |
| Abyssal Maw | `casting/shark` | Ability Casting (Elemental Sandbox) | zone | 0–20 | 1.1 |
| Maelstrom Vortex **new** | `codex/maelstrom` | Elemental Codex | zone | 2–18 | 4.2 |
| Riptide Lash **new** | `codex/riptide` | Elemental Codex | line | 2–20 |  |

### Earth & Crystal · 8

| Ability | uid | Group | Kind / aim | Range (m) | Circle (m) |
|---------|-----|-------|------------|-----------|------------|
| Earthen Spire | `linear-ext/earth` | Linear Ability Ext | line | 0–18 |  |
| Monolith Rift | `linear-extended/quake` | Linear Ability Casting Extended | line | 3–17 |  |
| Amethyst Verdict | `casting/amethyst` | Ability Casting (Elemental Sandbox) | zone | 0–18 | 3.2 |
| Dune Scourge | `collective/dune` | Collective Originals | line | 3–18 |  |
| Geode Eruption | `matrix-new/geode` | Matrix New | zone | 0–16 | 4.5 |
| Obsidian Wall | `matrix-new/obsidianwall` | Matrix New | line | 2–18 |  |
| Crystalline Heart | `matrix-new/crystallineheart` | Matrix New | zone | 0–14 | 5 |
| Basalt Columns **new** | `codex/basalt` | Elemental Codex | zone | 0–16 | 4 |

### Wind & Sound · 5

| Ability | uid | Group | Kind / aim | Range (m) | Circle (m) |
|---------|-----|-------|------------|-----------|------------|
| Tempest Spiral | `collective/tempest` | Collective Originals | zone | 2–16 | 3.2 |
| Resonance Pulse | `collective/sonic` | Collective Originals | line | 3–18 |  |
| Gale Sever | `matrix-new/gale` | Matrix New | line | 1–22 |  |
| Zephyr Shuriken **new** | `codex/zephyr` | Elemental Codex | line | 2–20 |  |
| Downburst **new** | `codex/downburst` | Elemental Codex | zone | 0–18 | 4 |

### Nature · 6

| Ability | uid | Group | Kind / aim | Range (m) | Circle (m) |
|---------|-----|-------|------------|-----------|------------|
| Verdant Gate | `linear-ext/portal` | Linear Ability Ext | gate | 3–17 |  |
| Arborist's Growth | `linear-extended/growth` | Linear Ability Casting Extended | zone | 0–22 | 4.2 |
| Wildroot Reliquary | `casting/reliquary` | Ability Casting (Elemental Sandbox) | zone | 0–18 | 3 |
| Spore Bloom | `collective/spore` | Collective Originals | zone | 2–16 | 3.4 |
| Pollen Nova **new** | `codex/pollen` | Elemental Codex | zone | 0–18 | 4 |
| Seedstorm Volley **new** | `codex/seedstorm` | Elemental Codex | line | 2–20 |  |

### Poison · 5

| Ability | uid | Group | Kind / aim | Range (m) | Circle (m) |
|---------|-----|-------|------------|-----------|------------|
| Caustic Bloom | `linear-extended/acid` | Linear Ability Casting Extended | zone | 0–20 | 4.4 |
| Venom Surge | `linear-extended/venom` | Linear Ability Casting Extended | line | 2.5–16 |  |
| Toxic Shield | `handcast/toxic` | Hand Cast Ability | zone | 3–20 | 3.4 |
| Plague Swarm **new** | `codex/plague` | Elemental Codex | zone | 0–18 | 4 |
| Miasma Spit **new** | `codex/miasma` | Elemental Codex | line | 2–17 |  |

### Light & Holy · 8

| Ability | uid | Group | Kind / aim | Range (m) | Circle (m) |
|---------|-----|-------|------------|-----------|------------|
| Nova Beam | `linear/beam` | Linear Ability Casting | line | 3–26 |  |
| Celestial Rend | `linear-extended/rend` | Linear Ability Casting Extended | zone | 0–24 | 5 |
| Chains of Penance | `casting/chains` | Ability Casting (Elemental Sandbox) | zone | 0–18 | 1.1 |
| Starbreaker Lance | `casting/lance` | Ability Casting (Elemental Sandbox) | zone | 0–22 | 1.2 |
| Sunfall Prism | `collective/prism` | Collective Originals | zone | 2–16 | 3.2 |
| Starfall Rite | `matrix-new/starfall` | Matrix New | zone | 0–20 | 5.5 |
| Dawn Sanctuary | `atlas/sanctuary` | Ability Atlas | zone | 0–16 | 3.2 |
| Seraphic Descent **new** | `codex/seraph` | Elemental Codex | zone | 0–18 | 4 |

### Cosmic & Gravity · 5

| Ability | uid | Group | Kind / aim | Range (m) | Circle (m) |
|---------|-----|-------|------------|-----------|------------|
| Astral Void Blast | `linear-extended/astral` | Linear Ability Casting Extended | zone | 0–24 | 5.5 |
| Astral Tome | `casting/tome` | Ability Casting (Elemental Sandbox) | zone | 0–20 | 6 |
| Astral Fang | `casting/wolf` | Ability Casting (Elemental Sandbox) | zone | 0–20 | 1.1 |
| Graviton Collapse | `collective/graviton` | Collective Originals | zone | 2–16 | 3.2 |
| Nebula Collapse **new** | `codex/nebula` | Elemental Codex | zone | 0–16 | 4 |

### Shadow & Void · 6

| Ability | uid | Group | Kind / aim | Range (m) | Circle (m) |
|---------|-----|-------|------------|-----------|------------|
| Void Slash | `handcast/voidslash` | Hand Cast Ability | line | 4–30 |  |
| Corrupted Shard | `handcast/shard` | Hand Cast Ability | zone | 0–22 | 3.6 |
| Umbra Grasp | `matrix-new/umbra` | Matrix New | zone | 2–14 | 2.2 |
| Voidstep Rift | `matrix-new/voidstep` | Matrix New | line | 3–16 |  |
| Nightfall Scythe **new** | `codex/nightfall` | Elemental Codex | line | 2–20 |  |
| Wraith Host **new** | `codex/wraiths` | Elemental Codex | zone | 0–18 | 4 |

### Blood · 4

| Ability | uid | Group | Kind / aim | Range (m) | Circle (m) |
|---------|-----|-------|------------|-----------|------------|
| Shimmering Flux | `handcast/flux` | Hand Cast Ability | line | 3.5–28 |  |
| Crimson Rite | `collective/crimson` | Collective Originals | zone | 2–16 | 3.2 |
| Bloodroot Thorns | `matrix-new/bloodroot` | Matrix New | zone | 0–16 | 6 |
| Sanguine Tide **new** | `codex/sanguine` | Elemental Codex | line | 3–20 |  |

### Arcane & Illusion · 6

| Ability | uid | Group | Kind / aim | Range (m) | Circle (m) |
|---------|-----|-------|------------|-----------|------------|
| Magic Boost | `linear-ext/magic` | Linear Ability Ext | buff |  |  |
| Baleful Cascade | `linear-extended/cascade` | Linear Ability Casting Extended | zone | 0–24 | 4 |
| Aetherblade Cascade | `matrix-new/aetherblade` | Matrix New | line | 2–20 |  |
| Mirage Construct | `matrix-new/mirage` | Matrix New | zone | 0–12 | 3 |
| Hall of Echoes | `atlas/echoes` | Ability Atlas | zone | 0–16 | 3.2 |
| Glyph Barrage **new** | `codex/glyphs` | Elemental Codex | line | 3–20 |  |

### Time & Motion · 6

| Ability | uid | Group | Kind / aim | Range (m) | Circle (m) |
|---------|-----|-------|------------|-----------|------------|
| Blink Step | `collective/blink` | Collective Originals | line | 3–18 |  |
| Chrono Fracture | `collective/chrono` | Collective Originals | zone | 2–16 | 3.2 |
| Chrono Recall | `atlas/recall` | Ability Atlas | line | 3–18 |  |
| Parallax Blink | `atlas/parallax` | Ability Atlas | line | 4–18 |  |
| Stillpoint | `atlas/stillpoint` | Ability Atlas | zone | 2–16 | 3.2 |
| Hourglass Sunder **new** | `codex/hourglass` | Elemental Codex | zone | 0–16 | 4 |

### Tech & Force · 10

| Ability | uid | Group | Kind / aim | Range (m) | Circle (m) |
|---------|-----|-------|------------|-----------|------------|
| Cyber Serpent | `linear-extended/cyber` | Linear Ability Casting Extended | line | 3.5–26 |  |
| Monowheel Bot | `handcast/monowheel` | Hand Cast Ability | summon | 0–7 |  |
| Sentinel Drone | `handcast/drone` | Hand Cast Ability | summon | 0–7 |  |
| Aegis Bulwark | `collective/aegis` | Collective Originals | zone | 0–16 | 3.2 |
| Polarity Garden | `atlas/polarity` | Ability Atlas | zone | 2–16 | 3.2 |
| Vector Chakram | `atlas/chakram` | Ability Atlas | line | 3–18 |  |
| Aegis Reversal | `atlas/reversal` | Ability Atlas | zone | 0–16 | 3.2 |
| Prism Refractor | `atlas/refractor` | Ability Atlas | line | 3–18 |  |
| Railgun Lance **new** | `codex/railgun` | Elemental Codex | line | 2–26 |  |
| Orbital Strike **new** | `codex/orbital` | Elemental Codex | zone | 0–18 | 4 |

## Moves

- Walk, run and dash (procedural, see above)
- Idle (Idle.fbx), shared by every pack
- Cast gesture I, II and III (cast1–3.fbx), each thrown with the cast lunge
- Cast lunge
- Summon drive (Sentinel Drone and Monowheel Bot)
- Hand-tracking cast: pack-only
- Duel Hall burn: pack-only

## Archived

Kept in `packs/<pack>/src/archive/`. Built for freehand path input and not reachable from the live apps.

- linear · Fire (path cast)
- linear · Water (path cast)
- linear · Earth (path cast)
- linear · Wind (path cast)
- linear · Air Scooter (walk mode)
- linear-ext · Water (path cast)
- linear-ext · Air Scooter (walk mode)

## Licence

MIT. See each pack's LICENSE file.
