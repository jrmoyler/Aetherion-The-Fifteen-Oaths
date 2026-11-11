# Biome Triad ground shader and water

Every realm's ground is now drawn by Biome Triad's terrain shader with the settings of the world that realm maps to
(`REALM_WORLD` in `game/src/three/realmAir.js`), and the sea and the marsh pool are made by Biome Triad's `makeWater`.

## What is copied, and how

`tools/extract-biome-ground.mjs <biome-triad checkout>` (run from `game/`) writes
`game/src/three/biome-ground.generated.js`, stamped with the source commit. Copied character for character from
`index.html`:

- `terrainMaterial(d)` with the GLSL it concatenates (`NOISE2D`, `SURF_GLSL`) and the uniform tables it reads (`WIND`, `VU`, `SU`);
- `makeWater(...)`, `canvasTex`, and the painting expressions of `tex.ground` and `tex.waterNormals` (run on first use, not at import, so the module loads without a canvas);
- for each of the 17 worlds: the `detail` object, the `color` and `kind` functions given to `makeTerrain`, and the look (colour, distortion, wave scale, alpha) of every `makeWater` call.

A colour function closes over names defined earlier in its world's `build(k)`. That part of `build()` is copied in front
of it, and top-level definitions it names (`canyonShape`, `vilHeight`, `savannaPoolD`, ...) are pulled in on demand, the
way `tools/import-biome-terrain.mjs` resolves height code. Engine objects the ground does not need are an inert stand-in.
Urban's colour function needs nothing from `build()`, so the city in front of it is left behind. Haven and Caverns have
no `makeTerrain` call: only their `terrainMaterial` settings are taken.

## The adapter (`game/src/three/realmGround.js`)

- **One material for the continent.** `realmTerrainMaterial(quality)` calls the copied `terrainMaterial` and wraps its
  `onBeforeCompile`. The copied shader text is not edited; the wrapper adds lines around it:
  - each world's settings sit in uniform arrays and a `flat` per-vertex realm index picks them
    (`#define uRock uBtRock[int(vBtRealm + 0.5)]` and so on, placed after the source's own uniform line);
  - the source's `SURF_GLSL` block is swapped for a bridge with the same `surfAt()` signature that reads Aetherion's
    surface-state window (`surfaceUniforms` in `surfaceState.js`): rain-dark gloss, snow, char and embers are then drawn
    by the source's own surface code;
  - Aetherion's `terrainMask` (road, plaza, lava) is kept: roads and plazas stay trodden earth over rock and shore
    bands, and lava channels keep their molten core; the crust beside them gets the source's glowing cracks (`kind` 1.2 to 2);
  - the marsh pool stands 3.4 m above the sea, so its level is taken off the height the shore effects read.
- **Vertex colour.** `paintGround` runs the world's colour function for each terrain vertex at the world position its
  relief was baked from (`RELIEF_WINDOW`), with Aetherion's slope, and a height that is metres above the local water at
  the shore and rises to the height the same landform has in the source world where that world is taller.
  The world's `kind` supplies crop rows (1) and ice (3); its own lava lobes are ignored, since lava in Aetherion is where `lavaAt` says.
- **Water.** `createRealmWater` builds the sea and the pool with `makeWater`. The sea takes the look of the realm the
  player stands in and eases between looks. Worlds without open water borrow one: volcano, taiga and alpine use Arctic's,
  canyon uses Egypt's, haven uses Ruins'.

## Quality

| | low | medium | high |
|---|---|---|---|
| Ground detail normals (the source's `tbump` block, about a dozen noise lookups per pixel) | off | on | on |
| Water | cheap path | cheap path | reflective three.js `Water`, 512 px, only while open water is within 300 m; cheap path otherwise |

The cheap path is the source's own (`Q.water = 0`): a scrolling normal map on a standard material, no extra pass. The
reflective path renders the scene a second time, which is why it is limited to high quality and to the shore.

## Not carried over

- Crimson maps to Haven, which has floating islands and no terrain colour function: that realm keeps its own colour and
  bedrock, with Haven's shader settings (banded rock).
- Canyon's `detail` has `ripple: 0`; its dune ripples come from a per-world shader extension that is not imported.
  The same goes for the other per-world extensions (Amazon mud banks, Forest leaf litter, Village roads).
- `lavaMaterial` (the source's flowing lava surface) is not imported; lava channels keep Aetherion's molten core.
- The water has no depth-based shore foam of its own (neither does the source): foam and caustics are drawn on the
  ground by the terrain shader where a world asks for them (Sea, Arctic).

## Tests

`node --test game/src/three/realmGround.test.mjs`: every realm resolves to a world detail set, relief windows match the
baked relief, 14 of 15 realms are coloured by their world's function over real terrain samples, the shader wiring is
present on low and high, and water builds without a canvas.

## Evidence

`docs/qa/biome-triad-ground-water/` (medium quality, software renderer).
