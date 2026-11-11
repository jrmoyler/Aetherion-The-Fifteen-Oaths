# Arsenal armor on character bodies

Equipped armor now shows on the player. Before this, forged armor existed only as an icon.

## Pipeline

`tools/import-arsenal-armor.mjs <arsenal-forge checkout>` reads the 50 pieces the gear slots can roll
(helmet, mask, chest, robe, glove, arm, legs, belt, boot, accessory; five tiers each) and writes a wearable
level of detail for each:

| | Source | Wearable |
| --- | --- | --- |
| Triangles per piece | 12,320 to 195,960 | 1,090 to 6,399 |
| Textures per piece | 9 | 0 (base colour baked to vertex colour) |
| Surfaces per piece | 5 to 9 | 2 (metal, everything else) |
| Total size | 149 MB | 3.0 MB, fetched per piece when worn |

Output: `game/public/assets/arsenal/armor/<family>/<nn>.glb` and `shared/arsenal-armor.generated.js`.
Cloak and shoulder pieces are not imported: no gear slot rolls them yet.

## Fit

Forged pieces are unskinned and each sits in its own frame. `game/src/three/arsenal-armor.js` fits them to the
wearer at runtime:

1. **Measure.** Joint positions come from the body's bind pose. Crown height, face depth, chest and waist
   extents, foot length and hand reach come from the body's own vertices.
2. **Place.** Trunk and head pieces are scaled and seated on those measurements. Limb pieces are wrapped along
   the bones: a height in the piece maps to a joint on the body, so an elbow cop lands on the elbow whatever the
   arm's length or angle. Pieces authored for one side are mirrored for the other; the legs piece is split and
   each half wrapped on its own leg.
3. **Clear.** Piece and body are compared as rings around the piece's axis. Where the body (including its
   baked costume) reaches past the piece's inner surface, that ring is widened just enough. A cap per ring stops
   a baked spike or prop from ballooning the armor.
4. **Skin.** Every vertex gets bone weights from where it landed, blended across joints, and the result is
   bound to the body's own skeleton. Armor bends at elbows and knees and follows every animation.

Everything worn is merged into two skinned meshes: two draw calls per dressed character.

## Names

A piece wears what its name says: a Robe, Coat or Vestment is the robe family; a Cuirass or Harness is plate;
Tassets are the belt family; Bracers and Wraps are arm pieces; a Visor or Mask is a mask. Only when the name does
not say does the discipline decide. Gear already in a save keeps the piece it was created with.

## Limits

- Only the local player is dressed. Other adventurers do not send their equipment to the client yet.
- Heroes keep their baked costume under the armor, so skirts, capes and shoulder spikes still show.
- Robe sleeves follow the upper arm only; a fully raised arm can pass through the sleeve.
- Fit was reviewed on four heroes in software-rendered Chrome (see `docs/qa/arsenal-armor/`), not on all thirty.
