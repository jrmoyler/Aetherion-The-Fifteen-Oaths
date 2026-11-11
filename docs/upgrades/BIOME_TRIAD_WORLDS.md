# Biome Triad worlds in the realms

The first integration brought Biome Triad's surface-state layer and nothing a player could see. Every realm
still grew the same tree under the same fog. This pass brings the worlds' flora and air.

## What comes from Biome Triad

`tools/extract-biome-flora.mjs <biome-triad checkout>` copies, character for character, from `index.html`
(three bark-texture expressions are copied verbatim but run on first use, so the module loads without a canvas):

- the procedural tree, palm and spruce generators, leaf-atlas painter and bark textures (20 functions),
- all 36 species definitions, from the Amazon canopy trees to the taiga spruce and the savanna baobab,
- each of the 17 worlds' fog density, fog tint, ground colour and precipitation kind.

Output: `game/src/three/biome-flora.generated.js` and `game/src/three/biome-worlds.generated.js`. Both carry
the source commit. Nothing in them is hand-edited; re-run the tool to update.

## Where it goes

Each realm takes the species, air, ground shapes, bedrock and ground cover of the world it corresponds to.

| Realm biome | Species | Air from |
| --- | --- | --- |
| forest | oak, beech, elder, shrub | Forest |
| meadow | village oak, apple, poplar, willow | Village |
| marsh | bald cypress, willow, alder | Marsh |
| glacial | spruce (two forms), krummholz, birch | Arctic |
| alpine | fir, larch, pine, dwarf pine | Alpine |
| highland | pine, birch, dwarf pine | Taiga |
| coast | coconut palm, island tree, date palm | Sea |
| cliffs | oak, beech, poplar, shrub | Village |
| canyon | cottonwood, juniper, pinyon | Canyon |
| badlands | acacia, bush, juniper | Egypt |
| plateau | acacia, baobab, fever tree, bush | Savanna |
| volcanic | juniper, bush, pinyon (sparse) | Volcanic |
| crimson | blossom, cypress, shrub | Haven |
| terraces | blossom, apple, cypress | Ruins |
| industrial | poplar, shrub (sparse) | Urban |

## How it is drawn

- **Near** (the player's tile and its neighbours): full meshes, wood and alpha-tested leaf cards, swaying.
- **Far**: one pair of crossed cards per tree, textured with a picture of that species baked once on the
  device. A tile swaps between the two as the player moves.
- Trees are scaled to play height (a 39 m source beech stands about 19 m) so the camera stays under the crowns.
- Trunks stay solid: each tile reports trunk positions and radii to movement and camera as before.
- Fog colour and density ease between realms over a few seconds at a border.

## Terrain

`tools/import-biome-terrain.mjs <biome-triad checkout>` runs each world's own ground code in Node. The build body
is cut right after its height function is defined, and anything that code names is pulled from `index.html` on
demand, so nothing is re-implemented. A window of each world is sampled into a 128 x 128 grid and stored in
`shared/biome-relief.generated.js` (0.66 MB), which the simulation and the client both read.

| Realm biome | Ground from | Source relief in the window |
| --- | --- | --- |
| volcanic | Volcanic (cone flank and lava field) | 3 to 848 m |
| glacial | Arctic (islands, peaks, glacier) | -45 to 454 m |
| alpine | Alpine (valley, walls, crags) | 41 to 1796 m |
| coast | Sea (islands, shelves, cliffs) | -27 to 246 m |
| canyon | Canyon (rim, buttes, basin) | -3 to 329 m |
| cliffs, meadow | Village (two different windows) | -3 to 61 m |
| forest | Forest floor | -1 to 15 m |
| marsh | Marsh | -2 to 4 m |
| highland | Taiga | -7 to 94 m |
| badlands | Egypt (dunes and escarpment) | -4 to 58 m |
| crimson, terraces | Ruins (two different windows) | 2 to 56 m |
| plateau | Savanna | -2 to 35 m |
| industrial | Urban ground | -5 to 0 m |

Each realm keeps its own base height and relief budget: the world's shapes are normalised around the window's
median and scaled to the realm, and are never exaggerated (where a world is flatter than the realm's budget, a
metre there is a metre here). Sanctuary plazas, roads and the coastline are applied afterwards exactly as before,
and Aetherion's own noise remains as fine grain. Sampling costs about 2 microseconds.

Because the simulation reads the same grid, this changes the world for everyone: camps, quests and movement all
stand on the new ground. Saved positions are re-seated on load as before.

## Ground, rock and cover

- Steep ground shows the bedrock colour of the realm's world (red sandstone in the canyon, near-black basalt on
  the volcano); glacial, alpine and highland ground carries snow above a height line where it is not too steep.
- Boulders are Biome Triad's `boulderGeo`, tinted to the same bedrock.
- Ground cover uses Biome Triad's clump, fern, broadleaf and papyrus builders with the worlds' recipes: sedge
  and ferns in the forest, papyrus in the marsh, seagrass and dune oats on the coast, dry tufts in the canyon.
  Every realm now has cover; before, only five did.

## Not brought over

- The worlds' water bodies, buildings, creatures, caves and layered features (bridges, ledges, floating
  islands): they are scene objects, not ground.
- Volumetric clouds, aurora and the worlds' ground materials.
- Per-world precipitation kinds are extracted as data but the sky still uses Aetherion's own weather table.

## Evidence

`docs/qa/biome-triad-worlds/six-realms.jpg`: forest (two views), coast, glacial, marsh, plateau (two views) and
crimson (two views), captured in game from a production build in software-rendered Chrome. Alpine was captured
too but the spawn faced a city wall, so it is not in the sheet. The other eight realm biomes use the same code
path with different species lists and were not captured. Frame rate was not measured.

`docs/qa/biome-triad-worlds/terrain-six-realms.jpg`: canyon, alpine, glacial, volcanic (standing in a lava
field), forest and plateau after the terrain, bedrock, boulder and ground-cover import. Same capture method.
