# Biome Triad landmarks

Built and geological scene objects from Biome Triad (commit `6ef756ee5c41e1250264a59103536e9ddeee477d`), stood on Aetherion's terrain.

- `tools/extract-biome-landmarks.mjs <biome-triad checkout>` copies the builders verbatim into `game/src/three/biome-landmarks.generated.js`: top-level functions with their dependencies resolved automatically, plus "recipes" (statement runs cut from each world's `build(k)`).
- `game/src/three/realmLandmarks.js` plans where they stand (seeded search of the shared heightfield, identical on every client), registers solids with `ctx.collision`, and builds a realm's meshes a step a frame when the player comes within 1150 m of its city (hidden beyond 1500 m). Repeated things go through the source's own `instTiled`.
- Rules checked by `game/src/three/realmLandmarks.test.mjs`: nothing within the city ring (150 m + 25 m + footprint), nothing within 30 m + footprint of a road centreline, nothing under water unless it floats or stands in water.

See one in game: `/?offline=1&cinematic=0&spawn=<x>,<z>` with a coordinate from the tables.

## oath-01 · volcanic (Biome Triad: volcano)

| Landmark | Count | Where (x, z) | Solid? |
|---|---|---|---|
| colonnade | 2 | -2347, 701 · -2408, 592 | solid (box) |
| ledge | 3 | -1711, 612 · -2291, 800 · -2338, 233 | walkable shelf: step on from uphill, a wall from below |
| buttress | 1 | -1815, 432 | solid |
| snag | 12 | 12 around -2033, 324 | walk-through |

## oath-02 · glacial (Biome Triad: arctic)

| Landmark | Count | Where (x, z) | Solid? |
|---|---|---|---|
| berg | 5 | -1633, 1857 · -1338, 1926 · -1416, 1899 · -1544, 1881 · -1490, 1894 | solid |
| floe | 20 | 20 around -1479, 1922 | walk-through (swim past) |
| serac | 10 | 10 around -1004, 1144 | solid |
| inukshuk | 3 | -1158, 1949 · -1503, 1858 · -1292, 1924 | solid |
| cabin | 1 | -1675, 1546 | solid, not enterable |

## oath-03 · alpine (Biome Triad: alpine)

| Landmark | Count | Where (x, z) | Solid? |
|---|---|---|---|
| ropebridge | 1 | -2, 1911 | walkable deck (six ramps following the sag) |
| cairn | 5 | -8, 1911 · 40, 1929 · 169, 1558 · 225, 1556 · 278, 1571 | solid |
| cabin | 1 | 351, 1576 | solid, not enterable |
| iceblock | 9 | 9 around 418, 1726 | solid |

## oath-04 · coast (Biome Triad: sea)

| Landmark | Count | Where (x, z) | Solid? |
|---|---|---|---|
| seastack | 6 | -1544, -1809 · -1469, -1846 · -1643, -1782 · -1335, -1809 · -1594, -1789 · -1291, -1806 | solid |
| headland | 1 | -1622, -1930 | solid |
| driftwood | 3 | -1048, -1941 · -1050, -1942 · -1053, -1952 | walk-through |

## oath-05 · canyon (Biome Triad: canyon)

| Landmark | Count | Where (x, z) | Solid? |
|---|---|---|---|
| hoodoo | 16 | 16 around -1154, 657 | solid |
| alcove | 1 | -1170, 752 | walk-in: shell solid, mouth and floor open |
| ledge | 3 | -942, 245 · -1113, 792 · -904, 1113 | walkable shelf: step on from uphill, a wall from below |
| buttress | 1 | -729, 415 | solid |

## oath-06 · cliffs (Biome Triad: village)

| Landmark | Count | Where (x, z) | Solid? |
|---|---|---|---|
| house | 4 | 1202, 1471 · 1234, 1455 · 1256, 1486 · 1214, 1508 | solid, not enterable |
| yard | 5 | 1216, 1467 · 1232, 1469 · 1238, 1483 · 1225, 1494 · 1216, 1482 | woodpiles, cart and stack solid; casks and crates walk-through |

## oath-07 · forest (Biome Triad: forest)

| Landmark | Count | Where (x, z) | Solid? |
|---|---|---|---|
| giantlog | 1 | -1936, -691 | solid |
| hollowlog | 1 | -1983, -650 | walk-through bore, shell walls solid |
| log | 7 | 7 around -1831, -598 | solid |

Not placed: no gully for the log bridge.

## oath-08 · marsh (Biome Triad: marsh)

| Landmark | Count | Where (x, z) | Solid? |
|---|---|---|---|
| stilthut | 1 | -1071, -761 | solid |
| punt | 1 | -1077, -763 | walk-through |
| marshsnag | 3 | -1085, -761 · -1054, -754 · -1046, -758 | solid trunk |
| knee | 8 | 8 around -1070, -767 | walk-through |

## oath-09 · meadow (Biome Triad: village)

| Landmark | Count | Where (x, z) | Solid? |
|---|---|---|---|
| house | 6 | 120, -57 · 132, -30 · 118, -6 · 89, -17 · 82, -39 · 98, -59 | solid, not enterable |
| yard | 6 | 118, -40 · 116, -28 · 105, -23 · 94, -30 · 96, -43 · 108, -47 | woodpiles, cart and stack solid; casks and crates walk-through |

## oath-10 · highland (Biome Triad: taiga)

| Landmark | Count | Where (x, z) | Solid? |
|---|---|---|---|
| cabin | 1 | 1545, 820 | solid, not enterable |
| fallen | 5 | 1526, 801 · 1560, 829 · 1566, 814 · 1531, 814 · 1555, 795 | solid |
| stump | 10 | 10 around 1539, 818 | walk-through |
| inukshuk | 2 | 2317, 989 · 2343, 914 | solid |

## oath-11 · badlands (Biome Triad: egypt)

| Landmark | Count | Where (x, z) | Solid? |
|---|---|---|---|
| pyramid | 6 | 2379, -339 · 2271, -321 · 2177, -321 · 2417, -365 · 2403, -371 · 2389, -377 | solid (three stepped boxes), not climbable |
| sphinx | 1 | 1715, -381 | solid |
| temple | 1 | 2292, -648 | quay platform walkable by its water stair; pylons, colossi, obelisks, side walls and sanctuary solid; hall columns and ram sphinxes walk-through |
| mudhouse | 6 | 2304, -484 · 2276, -516 · 2284, -484 · 2288, -468 · 2284, -500 · 2316, -512 | solid |

## oath-12 · crimson (Biome Triad: haven)

| Landmark | Count | Where (x, z) | Solid? |
|---|---|---|---|
| archipelago | 1 | 215, -1226 | scenery only: out of reach, no collision |

## oath-13 · terraces (Biome Triad: ruins)

| Landmark | Count | Where (x, z) | Solid? |
|---|---|---|---|
| sunkencity | 1 | 814, -108 | platform walkable by its front stair; statue, toppled head and gate piers solid; columns, cella and house walls walk-through |
| head | 3 | 856, -60 · 889, -104 · 878, -50 | solid |

## oath-14 · plateau (Biome Triad: savanna)

| Landmark | Count | Where (x, z) | Solid? |
|---|---|---|---|
| kopje | 2 | 1426, -1449 · 980, -1230 | core solid; outer blocks walk-through |
| mound | 7 | 7 around 1176, -1363 | solid |

## oath-15 · industrial (Biome Triad: urban)

No landmarks. The urban world assembles its buildings inside `build(k)` from its own street grid; nothing was imported.

