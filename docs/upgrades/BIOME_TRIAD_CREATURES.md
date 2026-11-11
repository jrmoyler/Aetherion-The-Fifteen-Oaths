# Biome Triad creatures and ambient wildlife

Source: `jrmoyler/biome-triad` at `6ef756ee5c41e1250264a59103536e9ddeee477d` (`index.html`).

Before this, the only life in the landscape besides gameplay mobs was 14 hand-made birds circling the player. They
are gone. Every realm now carries the wildlife of the Biome Triad world it corresponds to (`REALM_WORLD` in
`game/src/three/realmAir.js`).

## How it is built

| Part | File | What it is |
| --- | --- | --- |
| Extraction tool | `tools/extract-biome-creatures.mjs` | Copies source text character for character. Run `node tools/extract-biome-creatures.mjs <biome-triad checkout>`. |
| Generated module | `game/src/three/biome-creatures.generated.js` | 22 functions and 27 wildlife blocks, stamped with the source commit. Imports in Node with no canvas. Do not edit. |
| Adapter | `game/src/three/realmCreatures.js` | Places the animals in Aetherion. Hand-written. |
| Hook | `game/src/three/world.js` | One import, one `createRealmCreatures(ctx)`, one `creatures.update(dt,target)`, one `creatures.dispose()`. |
| Tests | `game/src/three/realmCreatures.test.mjs` | Node import, a realm entry for every biome, quality caps, ground following, city rings, realm easing. |

Three kinds of source text are copied:

1. Top-level builders and behaviour: `gullGeo`, `fishGeo`, `critterMat` (wing-beat and tail-beat vertex shader),
   `flock` (boids: groups, speed, separation, alignment, cohesion, floor, roof, shy, scare), `whaleGeo`,
   `taigaDeerGeo`, `savannaAnimalGeo`, `savannaBeastGeo`, `savannaBeastMat` (leg, gallop and grazing shader), the
   savanna and village beast tables and paint functions, `marshHeronGeo`, `marshDragonflyGeo`, and the helpers they call.
2. Each world's wildlife statements from inside its `build(k)`.
3. Each world's wildlife statements from inside its `update(dt, env)`.

Kinds 2 and 3 sit inside closures in the source. The tool wraps each copied block in an exported function whose
parameters are the names the block reads from its world (its height function, its random stream, its landmarks).
`LIFTED` in the generated module lists every block with its source line range.

## What the adapter decides

The copied code still does the animating. The adapter supplies what each source world supplied:

- **Ground and water.** `heightAt`, `SEA_LEVEL` and `MARSH_LEVEL` stand in for each world's own height function.
  Flock floors, herd hooves, heron wading depth and the fish roof all follow Aetherion's terrain and water.
- **The viewer.** The source reads its viewer from a global `S.pos`; the adapter sets it to the player. That drives
  the source's own shyness: flocks veer away (`shy`), herds startle and flee, herons lift off within 24 m.
- **Landmarks.** Gull "islands" are shore sites near the player, fish schools sit in the nearest water at least
  1.6 m deep, herds and livestock get level dry sites, the whale gets a 240 m circle of open water.
- **City rings.** Ground animals are never sited within 25 m of a sanctuary's 150 m city ring, and a herd that runs
  toward a city, water or a cliff veers aside.
- **Following the player.** Flock homes glide after the player; circling birds ride a leash; ground animals stay
  on their site until the player is about 430 m away, then shrink away, move and return.
- **Realm borders.** A realm's sets ease in over about 2 s and out over about 1.6 s. One missing set is built per frame.
- **Cost.** Everything that repeats is an `InstancedMesh`. Counts are capped per quality tier
  (`CREATURE_CAPS`: 80 low, 150 medium, 270 high animals per realm; fireflies 300, 600, 900 points). Ground height
  under animals comes from a 2 m bilinear cache.
- **Scenery only.** Client side, no collision, `raycast` disabled on every node, nothing registered with
  targeting, the network or `shared/sim`. The animals use their own random streams and never touch simulation state.

Adaptations that change what the source did, each made in the adapter and not in the copied code:

- Circling birds are compressed to Aetherion's draw distance: orbit centres pulled toward the player, radii capped,
  source altitudes mapped onto a lower band above the highest ground under each orbit. Angular speed, phase, size,
  colour and wing beat are the source's.
- Fish swim just under the surface (roof 0.22 m below it) and carry a little emissive, because Aetherion's water is
  86 % opaque and a school at the source's 3 m depth would not be seen.
- The whale's circle is lifted 29.6 m so that the top of its rise brings its back through the surface.
- The savanna's `conceal` (the viewer hidden in tall grass) is fixed at 0.55: herds startle at about 30 to 47 m.
- Village livestock graze the source's sheep and cattle pens as one open pasture; Aetherion has no pens.
- The lower quality tiers drop whole flock groups, whole herds or trailing rows of a bird list.

## Realm by realm

| Realm (biome) | Biome Triad world | Ambient life in game |
| --- | --- | --- |
| volcanic | volcano (no animals in the source) | Bats, borrowed from Caverns: out at dusk, wheeling at night, absent by day |
| glacial | arctic | Petrel flocks; the whale skeleton; a whale offshore, borrowed from Underwater |
| alpine | alpine | 2 eagles soaring, choughs circling |
| coast | sea | Gull flocks over the shore, fish schools in the water beside it |
| canyon | canyon | 6 condors high, ravens lower |
| cliffs | village | Rooks and swallows; gull flocks and fish, borrowed from Sea |
| forest | forest | Rooks wheeling over the canopy |
| marsh | marsh | Herons and egrets, dragonflies by day, fireflies and will-o'-wisps at night |
| meadow | village | Rooks and swallows; sheep and cattle at pasture |
| highland | taiga | Caribou grazing, a moose by the water, ravens |
| badlands | egypt (no animals in the source) | Vultures on a thermal, borrowed from Savanna |
| crimson | haven | Dove flocks |
| terraces | ruins | Macaws by day; at dusk the same flock turns to bats over a summit |
| plateau | savanna | Impala, zebra, wildebeest and giraffe herds; vultures on a thermal |
| industrial | urban (no animals in the source) | Rooks, borrowed from Village |

## Full inventory

Counts are the source's; the game shows that many on the high tier unless noted.

| Creature | Source world | Realm it lives in | In game | Notes |
| --- | --- | --- | --- | --- |
| Gull flocks (5 groups of 8, boids) | sea | coast, cliffs | Yes | Homes follow the shore near the player |
| Fish schools (5 schools of 30, boids) | sea | coast, cliffs | Yes | Only where water at least 1.6 m deep lies within 120 m; swim near the surface |
| Petrel flocks (4 groups of 9, boids) | arctic | glacial | Yes | |
| Whale skeleton (`whaleGeo`) | arctic | glacial | Yes | One fixed site. The glacial coast is cliff with no beach, so the bones lie on the lowest level ground within 120 m of the sea. Untextured: the source's ground texture was not imported |
| Dove flocks (6 groups of 8, boids) | haven | crimson | Yes | |
| Rooks over the canopy (16 + 10, boids) | forest | forest | Yes | |
| Falling leaves (1800 points) | forest | - | No | A seasonal particle effect, not an animal; Aetherion has no seasons |
| Moose | taiga | highland | Yes | Stands at the water's edge when one is within 320 m, else on open ground |
| Caribou (9, walking and grazing) | taiga | highland | Yes | Turned back toward their site before water, cities or steep ground |
| Ravens (12, circling) | taiga | highland | Yes | |
| Animal tracks and footprints in snow | taiga | - | No | Part of the source's snow surface system, not an animal |
| Impala (26), zebra (16 + 12), wildebeest (24 + 44), giraffe (6) | savanna | plateau | Yes | Graze, startle, flee and regroup with the source's logic. Medium drops the far column, low keeps impala, zebra and giraffe |
| Vultures on a thermal (11) | savanna | plateau, badlands | Yes | |
| Stampede dust, dust devils | savanna | - | No | `puffField` particle systems, outside this import |
| Herds fleeing fire and strikes | savanna | - | No | Needs the source's fire and impact systems; `flee` is lifted but only the player triggers it |
| Condors (6) and ravens (24) | canyon | canyon | Yes | |
| Eagles (2) and choughs (24) | alpine | alpine | Yes | |
| Herons and egrets (7) | marsh | marsh | Yes | Stand in the shallows, lift off and fly to other shallows when approached. Their take-off ripple and splash are not drawn |
| Dragonflies (28) | marsh | marsh | Yes | By day, within 22 m of the player |
| Fireflies (900 points) | marsh | marsh | Yes | At night |
| Will-o'-wisps (6) | marsh | marsh | Yes | At night, over water, drifting away from the player |
| Fish rises (ripple rings) | marsh | - | No | Needs the source's water ripple and splash systems, which Aetherion's water does not have |
| Rooks round the tower (14), swallows over the fields (16) | village | meadow, cliffs, industrial (rooks only) | Yes | |
| Sheep (22), cattle (9 pied, 9 brown) | village | meadow | Yes | One open pasture |
| Pigs (6) | village | - | No | They belong in a sty; there is none |
| Hens (26) | village | - | No | They peck in cottage yards; Aetherion has no cottages to put them by |
| Villagers (64) | village | - | No | People, not wildlife; the game has its own characters |
| Macaws by day, bats at dusk (40) | ruins | terraces | Yes | |
| Bats (54) | caverns | volcanic | Yes, borrowed | Caverns maps to no realm. Roost is under ground by day |
| Whale | underwater | glacial | Yes, borrowed | Underwater maps to no realm |
| Reef fish schools (280), lanternfish (80), manta rays (4), jellyfish (60) | underwater | - | No | They live tens of metres down; Aetherion has no underwater view and its water is nearly opaque |
| Macaw pairs along the river (14), fireflies along the banks (900) | amazon | - | No | Amazon maps to no realm; both follow the source river's centreline |
| (none) | egypt, volcano, urban | badlands, volcanic, industrial | - | These three source worlds have no animals; their realms borrow as listed above |
| `flock.scare()` (strikes scatter a flock) | all flocks | - | No | Lifted and callable, but not wired to abilities: that would touch combat |

## Verifying

- `node --test game/src/three/realmCreatures.test.mjs`
- Evidence: `docs/qa/biome-triad-creatures/`. Creatures are small in the play camera, so most frames were taken with
  a free camera placed beside the animals in the running game scene (same scene, same lighting, no post-processing).
