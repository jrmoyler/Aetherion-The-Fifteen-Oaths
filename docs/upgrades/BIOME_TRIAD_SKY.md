# Biome Triad sky: volumetric clouds, stars, aurora, precipitation

Source: `jrmoyler/biome-triad` `index.html` at commit `6ef756ee5c41e1250264a59103536e9ddeee477d`.

## What is in the game

Every realm now has the sky of the Biome Triad world it corresponds to (`REALM_WORLD` in `game/src/three/realmAir.js`):

- A raymarched cumulus slab with sun-marched self shadowing, plus the streaky cirrus deck. Cover, base, top, cirrus and
  darkness come from the world's `clouds:{}` block and ease over about four seconds when the player crosses a realm border.
- The Preetham dome's turbidity, rayleigh, mie and mieG come from the world's `sky:{}` block.
- Stars and a moon at night. Aurora curtains at night in the glacial realm (arctic world).
- Each world's precipitation: snow in glacial and highland, ash in volcanic, dust in canyon, golden motes in crimson.
  Rain streaks and lightning come from the same source code when Aetherion's weather is `rain` or `storm`.
- Aetherion's weather feeds the source's rain factor, so the source's own rules apply: a storm adds up to 0.5 cover,
  raises the deck top 600 m, thickens it 1.7 times, darkens it, removes the cirrus and pushes the dome to turbidity 18.
- Time of day: the clouds are lit by the source's light model (warm sun, golden hour tint, dim blue moon), driven by
  Aetherion's sun direction.

## Files

| File | Role |
| --- | --- |
| `tools/extract-biome-sky.mjs` | Extraction. `node tools/extract-biome-sky.mjs <biome-triad checkout>` |
| `game/src/three/biome-sky.generated.js` | Generated, do not edit. Verbatim engine code inside `createBiomeSky()`, and `BIOME_SKY` data for all 17 worlds |
| `game/src/three/realmSky.js` | Hand-written adapter |
| `game/src/three/realmSky.test.mjs` | Tests for the data and the adapter's mappings |
| `game/src/three/atmosphere.js` | Hook: one import, one init, one update call, one dispose; exported API unchanged (adds `realmSky`) |

Copied verbatim (each chunk is labelled with its `index.html` line in the generated file): the "Sky dressing" block
(cloud uniforms, cloud shader, dome, stars, moon, rain, flake texture, flakes), `auroraMesh()`, and from
`updateAtmosphere()` the day/night factors, Preetham parameter lines, the light block and the clouds/stars/moon/flakes/rain/
lightning block. Data: `clouds`, `sky`, `precip` per world, the named precipitation variants each world's `build()`
switches between, `CLOUD_DEFAULT`, and the cloud step count of each source quality preset.

## What the adapter changes, and why

- **Bloom guard.** Sunlit cloud tops reach a radiance of 4 or more; Aetherion's bloom starts at 1.05. The adapter inserts
  one line where the shader writes its colour: a gain of 0.8 and a soft shoulder that tops out at 0.98. It throws if the
  source line it patches ever changes.
- **Sky dome gain.** `skyGain` in `atmosphere.js` went from 0.62 to 0.5 so the dome keeps some blue behind white clouds.
- **Cloud lighting** uses the source's sun, moon and sky-bounce model computed into stand-in light objects. The game's
  own sun and hemisphere lights are not changed, apart from the source's brief lightning lift on the hemisphere light.
- **Camera range.** The source places stars and moon 8 to 9 km out; Aetherion's far plane is 4 km, so both are scaled in.
- **Crimson realm.** Haven's deck is a cloud sea below its floating islands (-950 to -330 m). On Aetherion's ground that
  would be under the terrain, so the same slab is raised to start at 1500 m. All other worlds use their numbers as declared.
- **Weather mapping** (`weatherInputs`): storm = rain factor 1 x intensity, rain 0.65, snow 0.5, ash 0.3; fog and mist
  raise the source's fog factor, which fades the clouds out. When Aetherion asks for snow or ash in a realm whose world
  has none, the alpine world's `P_SNOW` or the volcano world's ash is used.
- **Flake size** is multiplied by 2.4 because Aetherion's camera sits behind the hero rather than at the eye.
- The old point-sprite precipitation in `atmosphere.js` is hidden while the realm sky is active. It remains the fallback
  where there is no document.
- `?time=` now pins the clock. Before, the offline simulation's hour overwrote it on every snapshot.

## Performance

- Cloud march steps by `ctx.quality.name`: low 18 (source "Fast", the cheapest path the source has), medium 28
  ("Balanced"), high and ultra 40 ("Ultra"). Low also draws half the stars and 45 % of the flakes, and low already renders
  at 0.6 scale.
- The dome is drawn at the far plane with depth test, so pixels covered by terrain are not marched.
- The aurora is built the first time the player enters the glacial realm.
- Flakes and rain are updated on the CPU as in the source (at most 7000 points and 4500 line segments).
- Not measured on a GPU: the capture machine renders in software at about one frame per second. The cloud shader is the
  most expensive full-screen effect in the sky and should be profiled on a phone at `q=low`.

## Evidence

`docs/qa/biome-triad-sky/`, captured in game with the HUD hidden and the camera tilted up (`actors.orbit.pitch = -0.42`;
negative pitch looks up).

## Known limits

- Flakes are sparse by day against a pale snow scene; the density is the source's.
- At 28 steps the march shows some grain at cloud edges, as it does in the source at "Balanced".
- Dust (canyon) has a standing amount of 0.03 in the source, so only a few motes show outside a dust storm.
