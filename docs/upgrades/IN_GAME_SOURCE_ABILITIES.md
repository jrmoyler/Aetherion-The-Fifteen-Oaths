# In-game source ability integration

The game's `castEffect` now dispatches registered catalog IDs to the imported Three.js source classes. Previously it selected one of fifteen generic point clouds and varied colours from a preset. Registered abilities no longer use that fallback. Basic attacks, damage impact accents, and status markers remain lightweight gameplay cosmetics.

| Catalog | Castables | Runtime source |
| --- | ---: | --- |
| linear | 6 | Original linear AbilityManager |
| linear-ext | 10 | Original manager plus ElectricBoost, MagicBoost, FireBoost |
| linear-extended | 10 | Original extended manager |
| casting | 9 | Original casting manager and authored summon rig builders |
| handcast | 9 | Original handcast manager and authored summon rig builders |
| collective | 12 | Original collective manager |
| matrix-new | 12 | Native sandbox manager |
| atlas | 10 | Native sandbox manager |
| codex | 72 | Native sandbox manager |
| Total | 150 | Seven source module bundles |

## Preserved systems

The adapter preserves original procedural geometries, shader patches, GPU particle systems, decals, burst shells, fissures, animation mixers, instance pools, preset parameters, and effect phase machines. Source WORLD, VFX, and SHAPED layers render through the game's camera; its packed scene depth and HDR probe feed the original shared uniforms. A shared six-light pool bounds transient illumination. Per-elevation scene groups keep floor-space effects on raised terrain. Cast cancellation releases a pooled instance, and stale handles cannot cancel an instance reused by a newer cast.

Authored rigs: Drone, Monowheel, Phoenix, Shark, Wolf, Dragon, Gyroscope, Amethyst, Tome, Reliquary, Serpent. These are loaded through their original rig builders rather than replaced with primitives. See attribution and source-import manifest for their individual provenance and license terms.

The imported Prism Lie material had a named-colour defect: `s.color` contains a settings key (`colorPrismA`), not a CSS colour. The integration resolves that key through its original configuration before passing the value to Three.Color.

## Validation and limits

- Lifecycle regression tests cover source IceAbility instanced crystals, source pooling, stale handle cancellation, anticipation cancellation, 150 unique dispatch IDs, actor-coordinate preservation, render layers, and distinct shader program cache keys.
- CPU scene sweep exercises each cast and target interactions for 12 simulated seconds. 147/150 complete without nonfinite geometry or actor-position mutation. Shark, Quake and Toxic Shield call browser TextureLoader and require browser execution; this is not a rendered appearance test.
- Production Vite build bundles the original source dependencies successfully.
- Browser CI exercises every ability with the actual WebGL renderer and captures representative evidence. Rendered source-reference parity must be assessed from those results; CPU checks do not establish visual parity.
- Damage and authoritative movement remain in the existing combat simulation. Imported target choreography uses a visual adapter, not the sandbox's independent dummy damage simulation.
