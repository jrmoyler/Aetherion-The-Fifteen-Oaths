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

Aetherion's terrain stays as it is: the simulation's height field decides where everything stands, so camps,
roads, towns and combat are untouched. Each realm takes the species and air of the world it corresponds to.

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

## Not brought over

- The worlds' own terrain, water bodies, buildings, creatures and caves. They are built around their own height
  functions, which would replace the simulation's world.
- Volumetric clouds, aurora and the worlds' ground materials.
- Per-world precipitation kinds are extracted as data but the sky still uses Aetherion's own weather table.

## Evidence

`docs/qa/biome-triad-worlds/six-realms.jpg`: forest (two views), coast, glacial, marsh, plateau (two views) and
crimson (two views), captured in game from a production build in software-rendered Chrome. Alpine was captured
too but the spawn faced a city wall, so it is not in the sheet. The other eight realm biomes use the same code
path with different species lists and were not captured. Frame rate was not measured.
