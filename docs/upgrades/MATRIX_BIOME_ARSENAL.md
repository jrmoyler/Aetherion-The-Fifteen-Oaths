# Ability Matrix, Biome Triad and Arsenal Forge in Aetherion

10 November 2026. This change ties the current state of three sibling libraries into the shipped Three.js game.

| Library | Pinned commit | What the game now uses |
|---|---|---|
| Ability Matrix | `6c0f22f480033aef5cc6077a73e44bf02c36e2a6` | 279 castables: the 230-cast Elemental Codex (23 elements, ten each) and the 49 Matrix Expansion casts |
| Biome Triad | `6ef756ee5c41e1250264a59103536e9ddeee477d` | The Dynamic Surface & Environmental State Layer (`extensions/surface-state`) |
| Arsenal Forge | `651e3802d7f3c8004c0efefece3d25d80ef1ff9b` | 75 weapons (LOD 1 and 2), and preview stills for those and 60 armor pieces |

## Ability Matrix: 150 to 279 castables

- `runtime/ability-matrix/packs/sandbox/src` is synced to the pin (350 new files, 218 changed). The eight local patches were
  three-way merged; upstream had already fixed the Glyph Barrage brightness, so that patch is dropped. `tools/record-ability-source-import.mjs`
  rewrites `ability-source-import.json` and refuses any vendored file that differs from upstream without a recorded reason.
- Canon stays at fifteen Oaths. Ability Matrix now has 23 elements; the eight newer ones join the Oath whose name already
  carries them: crystal to Fault Choir, sound to Reed Resonance, holy to Daybreak, gravity to Tidal Observatory, void to the
  Missing Court, illusion to Folded Theatre, motion to Escapement Road, force to Impulse Foundry.
- Each castable keeps two fields: `element` (the Oath's own force, which the simulation uses for reactions and statuses,
  unchanged) and `school` (its element in the current matrix, used for grouping, wording and ground impacts).
- Matrix Expansion casts register on the sandbox engine the way the source app installs them, minus editor folders.
- The preserved 100-castable sandbox (`runtime/ability-matrix/presets`, `CASTABLE_REGISTRY.json`) is untouched.
- The loadout screen is now a grimoire: five slots on one row, every technique of the Oath below, grouped by school.
  The 150 painted icons keep their cells (`game/src/ui/painted-tiles.js`); the 129 newer casts show the glyph their source authored.
- Fixed on the way: offline, the character window pauses the world and the paused world dropped every loadout
  message, so techniques could never be changed in the offline realm. Loadout, equip and unequip are now answered while paused.

Rebuild: `node tools/build-ability-supplement.mjs <Ability-Matrix> --expansion && npm run mmo:abilities && node tools/generate-ability-palettes.mjs && node tools/record-ability-source-import.mjs <Ability-Matrix>`.

## Biome Triad: living ground

- `shared/biome-surface/` is a byte-identical copy (hashes in `SOURCE.json`, checked by a test).
- `shared/biome-ground.js` maps each realm to a Biome Triad material and climate.
- `game/src/three/surfaceState.js` runs one layer under the continent. Casts strike the ground with their school; the realm's
  climate and the weather act on it. Terrain and paving read a 288 m window: wet ground darkens and turns glossy, snow and ice
  whiten it, fire leaves char. Live fire spreads with the wind and is drawn as flames, embers and one light.
- The HUD's realm line names notable ground under you (burning, iced, soaked and conductive, and so on).

## Arsenal Forge: forged gear

- `tools/import-arsenal.mjs` copies the weapons and stills, checking each file against the pack manifest's SHA-256 (33 MB).
- Every generated gear piece now names a forged piece (`item.arsenal`). Common and uncommon weapons are the discipline's canon
  piece; rare and better take a kindred variant, chosen from the item id so the look is stable.
- The equipped weapon is slung on the back socket (`game/src/three/arsenal.js`). The hand keeps the canon weapon that is
  part of each hero's skinned mesh. Other adventurers carry their canon piece at LOD 2.
- Gear icons are the forged render; tooltips name the piece and its measured length. The character panel used slot keys the
  simulation never fills (`mainhand`, `offhand`, `shoulders`, `ring`); it now reads the real ones, and items can be equipped,
  unequipped and used by click or Enter.

## Evidence

- `npm test` 240 pass, 3 fail (the same three that fail on `main`); `npm --prefix server test` 52 pass; client suites 86 pass, 3 fail (same as `main`).
- CPU scene sweep, all 279 casts through the game adapter for 240 frames: 276 clean, 3 need a browser (`TextureLoader`), the same three as before. `docs/qa/matrix-biome-arsenal/cpu-sweep-279.json`.
- Headless Chromium (SwiftShader) play-through, Fault Choir sorcerer: grimoire lists Earth 10, Crystal 10, Matrix Expansion 4;
  a Crystal cast and an Expansion cast were equipped offline and confirmed; both cast with no page errors. Screenshots alongside.

## Not done, and not claimed

- Rendered review of each new cast. The sweep proves they construct and run; only two of the 129 were looked at in the game.
- Simulation effects from the ground (slick ice, conductive water). The layer is presentation and a HUD reading; damage stays authoritative.
- Biome Triad's seventeen worlds themselves. Its terrain, vegetation and weather shaders live in one 1.2 MB page; only the packaged surface layer was built to be reused.
- Arsenal armor on bodies. The 60 pieces are not fitted to these rigs upstream (2 to 3 MB each, no LODs), so they appear as gear identity and icons only.
- Arsenal Forge marks 0 of 595 records as approved shipping art. These are review assets.
- Frame rate. Everything here was run under software rendering, which says nothing about real GPUs. PWA precache grew from 24.6 MB to about 32 MB with the larger sandbox bundle.
