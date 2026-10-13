# Ability Atlas additions

Compared against `main` at `cd56390fbc7f22ddae71e42b0bb2611d2072fce2`:
56 castable abilities/buffs, 34 moves and 7 archived entries across six packs.
The ten previously authored Atlas IDs and their source implementations were absent.
All ten are imported from the existing Ability Atlas source package; none was
invented for this integration. The runtime and four factory/helper/catalog files
are byte-for-byte copies. No existing ability, asset, settings block or pack is changed.

## Duplicate and variant review

| Atlas ability | Existing comparison | Reason to add |
| --- | --- | --- |
| Arc Relay (`chain-relay`) | Collective Chain Arc | Ordered persistent relay network with a final stacked conductive-status hook; Chain Arc dynamically acquires nearest live bodies and grounds/lingers. Closest family overlap, but a separate variant. |
| Chrono Recall (`temporal-rewind`) | Collective Chrono Fracture | Records and reverses a curved movement path, returning sampled-path teleport data; existing ability freezes bodies in a zone. |
| Parallax Blink (`blink-corridor`) | Collective Blink Step | Paired iris-gate transport, phased interval and exit-only impulse; existing blink damages its transit line. |
| Dawn Sanctuary (`restorative-sanctuary`) | Arborist's Growth / Spore Bloom | Four healing pulses; existing plant-themed effects attack or corrode. |
| Polarity Garden (`magnetic-minefield`) | Snare / Graviton / meteor fields | Seven deployed devices arm, tether and detonate separately with inward impulses. |
| Hall of Echoes (`mirror-decoys`) | Blink Step afterimages | Three decoy lifetimes and two swap teleports; existing afterimages are movement traces. |
| Vector Chakram (`ricochet-chakram`) | Existing linear projectiles | One disc follows successive bank points and a separate curved recovery route. |
| Aegis Reversal (`kinetic-parry`) | Aegis Bulwark / Toxic Shield / Volcanic Ward | Catch/absorb/reflect sequence with a parry window and counter-impact hooks; existing shields are area defenses. |
| Stillpoint (`stasis-bubble`) | Collective Chrono Fracture | Captured fragments slow to 1/40 speed; non-damaging time-dilated and upward-release hooks. Existing sphere fully pauses bodies then kills/throws them outward. |
| Prism Refractor (`prismatic-splitshot`) | Collective Sunfall Prism | Aimed input lance becomes three separately timed curved projectiles; existing prism continuously sweeps zone beams then shatters. |

These are distinct implementations and behavior variants, not ten previously
unknown mechanic families. Arc Relay's final network overload is visual; its hooks
are per-node damage and conductive status, not an extra overload-damage pulse.

## Integration

- `presets/runtime.js` and `presets/new/*.js`: asset-free runtime, importable by a Three.js host.
- `packs/atlas/`: isolated preview and adapter for the existing matrix commands.
- `presets/atlas/*.json`: the ten settings blocks; generated into the normal catalog and library.
- Existing matrix gains one pack entry; build/staging include its production bundle.
- No new models, upstream imports, copied legacy engine, deployments or existing-pack refactors.

The Atlas runtime emits semantic gameplay hooks. Its preview demonstrates health,
healing, teleport and impulses; it is not a production collision, navigation,
projectile-interception, target-discovery or networking system. See
[the runtime contract](new-presets.md) before integrating with game rules.

## Verification

Run `npm ci`, `npm test`, and `npm run build:atlas`. `npm run build` also builds all
six original packs and regenerates the catalog. `sh tools/stage-site.sh` assembles
the complete site after those builds.

Tests cover all ten lifecycles, deterministic geometry/events, finite geometry,
pause and skipped frames, capacity and cleanup, bridge commands and settings,
catalog consistency, and byte-for-byte preservation of every existing pack file.
The baseline inventory fixture records the compared commit and SHA-256 digests.

WebGL rendering and visual quality remain unverified in this environment: the
available cloud browser has graphics rendering disabled. Node simulation tests
and successful bundling are not GPU shader-compilation or visual checks.
