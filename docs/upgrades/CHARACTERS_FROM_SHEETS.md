# Characters from sheets

Hero costumes rebuilt in hand-written code from their concept turnaround sheets. No generation services, no
downloaded models: every garment, plate, strap and buckle is geometry emitted by a builder function, and every
surface (firecloth weave, fired ceramic, leather, oxidized iron) is a procedural shader. Code geometry cannot be
a pixel duplicate of a painting; the bar used here is that a side-by-side reads as the same character
(silhouette, colour blocking, every named element present and in the right place), and the differences that
remain are listed per hero below.

## What is in the game

`BodyFactory.createGltf` (game/src/three/models.js) now asks `character/sheets/wear.js` whether the hero has a
sheet recipe. If it does:

1. The groom pass still builds the procedural head, eyes and brows, but leaves hair and face gear to the recipe.
2. The baked costume is hidden. Every skinned mesh the GLB brought (the fused body surface and any appended
   `reconstructed-*` costume primitives) has its index filtered once; only what the recipe keeps stays. Both
   Kiln recipes keep `hands`: the hands and whatever is rigidly held in them (the baked weapon). So there are
   never two costumes on top of each other.
3. The recipe is compiled into ONE skinned mesh (one draw call) bound to the body's own skeleton with the
   body's bind matrix, so all 23 authored clips drive it. Geometry is cached per hero and quality tier and
   shared by every actor of that hero; tessellation scales with `ctx.quality.name` (low 0.6, medium 0.8, high 1).

Heroes without a recipe are untouched and keep their baked costume. `docs/qa/characters/in-game-kiln-ninja.jpg`
is the Kiln Ninja in the running game (offline, medium quality). The character preview dialog
(ui/character-preview.js) now goes through the same BodyFactory path, because the hidden baked surface is shared.

## The system (game/src/three/character/sheets/)

| File | Role |
| --- | --- |
| `form.js` | The tailor's form: a parametric trunk, arm, leg and foot measured from the wearer's bind-pose joints, with per-recipe build (width, depth, belly, limb girth). Garments are offsets of this form, so they fit by construction and take their skin weights from it. |
| `kernel.js` | `Bag` (vertex/skin accumulator, grids with smooth normals, mirrored sides, hard-surface solids placed through any smooth map) and bevelled shapes (round box, slab, bar, ring, dome). |
| `builders.js` | The garment and gear builders: `skinLimb`, `neck`, `shirt`, `trousers` (gathered, pleated, piped), `wrap`, `band`, `capelet` (cloth laid over the shoulders and arms, asymmetric by run length), `cowl`, `chestPlates`, `belt`, `strap` (+ anchor ring), `bracer`, `blockBracer` (real vent slots), `gloveCuff`, `boots` (sole, upper, shaft, toe cap, heel and shin plates, straps), `halfMask` (vented grille), `hair` (spiky, bun), `skirt` (coat), `panel` (apron, tabard), `limbPlate`, `kilnPack`. |
| `material.js` | One procedural material; a per-vertex (roughness, metalness, kind) triple picks cloth, ceramic, leather, iron, skin, hair, hollow or ember detail in rest space. No textures, constructs in Node. |
| `costume.js` | Compiles a recipe into a geometry. |
| `recipes/` | One data file per hero: palette, build, what to keep of the baked mesh, and a list of builder calls. |
| `wear.js` | Runtime: measure the rig, hide the baked costume, bind the costume, hook dispose/fade. |
| `sheets.test.mjs` | Recipes reference shipped heroes and existing builders; every recipe builds in Node with no document on every tier and two body sizes; weights are normalised; builds are deterministic. |

Dev stage: `game/sheet.html?id=oath-01-ninja` renders front, back, side and three-quarter through the game's
BodyFactory (`clip=attack_1&frames=6`, `pose=bind`, `q=low|medium|high`). A new hero is a new file in
`recipes/` plus one line in `recipes/index.js`.

## Sheet to hero mapping

Read from the title printed on each sheet (and consistent with `tools/blender/characters/cf/heroes`).
reference-092..095 are sorcerer line-ups and 096..098 ninja line-ups across elements, not single heroes.

| Oath | Title on sheet | Ninja turnaround | Sorcerer turnaround | Oath overview | Ninja status | Sorcerer status |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | FIRE - Kiln Oath | reference-090 | reference-091 | reference-113 | **done** (see below) | **done** (see below) |
| 02 | FROST - Rime Archive | reference-089 | reference-088 | reference-112 | not started | not started |
| 03 | LIGHTNING - Storm Relay | reference-085 | reference-087 | reference-111 | not started | not started |
| 04 | WATER - Tidal Covenant | reference-084 | reference-086 | reference-110 | not started | not started |
| 05 | EARTH & CRYSTAL - Fault Choir | reference-082 | reference-083 | reference-109 | not started | not started |
| 06 | WIND & SOUND - Reed Resonance | reference-081 | reference-080 | reference-108 | not started | not started |
| 07 | NATURE - Graft Sanctuary | reference-079 | reference-078 | reference-107 | not started | not started |
| 08 | POISON - Bitterglass Guild | reference-077 | reference-076 | reference-106 | not started | not started |
| 09 | LIGHT & HOLY - Oath of Daybreak | reference-075 | reference-074 | reference-105 | not started | not started |
| 10 | COSMIC & GRAVITY - Tidal Observatory | reference-073 | reference-072 | reference-104 | not started | not started |
| 11 | SHADOW & VOID - The Missing Court | reference-071 | reference-070 | reference-103 | not started | not started |
| 12 | BLOOD - Sanguine Covenant | reference-069 | reference-067 | reference-102 | not started | not started |
| 13 | ARCANE & ILLUSION - Folded Theatre | reference-068 | reference-066 | reference-100 | not started | not started |
| 14 | TIME & MOTION - Escapement Road | reference-065 | reference-064 | reference-099 | not started | not started |
| 15 | TECH & FORCE - Impulse Foundry | reference-063 | reference-062 | reference-101 | not started | not started |

## Per-hero status

### oath-01-ninja (reference-090): done

Evidence: `docs/qa/characters/oath-01-ninja.jpg`. Present and placed as on the sheet: soot firecloth shirt with
short piped sleeves, bare upper arms, asymmetric capelet over the right shoulder with terracotta trim, rolled
cowl, diagonal strap with square anchor ring at the left shoulder, three stacked ceramic chest plates front and
back with iron clasps, side straps and riveted harness straps, leather belt with iron buckle and a second thin
belt, leather vambraces with buckled straps, ceramic block bracer with three vent slots and iron hinge bands
on the left forearm, glove cuffs, baggy trousers with terracotta piping gathered below the knee into a leather
band with terracotta trim, ribbed shin wraps, boots with ceramic toe caps, shin and heel plates and straps,
vented iron half mask with terracotta slats and head strap, short spiky black hair.

Differs from the sheet:
- Hands are the baked GLB hands (dark glove texture); the fingerless glove fingers are not rebuilt.
- Hair is a dense cap of short spikes; the painted hair has longer, looser strands and a parted fringe.
- Chest plates and boot plates are cleaner and brighter than the painted, soot-worn ceramic; trousers are
  smoother and fuller at the knee than the painted folds.
- He holds his baked blade; the sheet shows him unarmed.
- Body proportions are the rig's (narrower shoulders and a longer A-pose arm angle than the painting).
- The capelet is a stiff laid cloth, without the painted wrinkles; the back of it follows the front's diagonal
  (the sheet's own back and side views disagree with its front view about the capelet and strap side).
- No belt pouches or hanging strap ends; the mask is simpler than the painted one (no nose bridge plate).
- The face is the existing procedural head, not a likeness of the face panel.

### oath-01-sorcerer (reference-091): done, with more differences than the ninja

Evidence: `docs/qa/characters/oath-01-sorcerer.jpg`. Present: stocky build, long-sleeved firecloth coat to
mid-shin with terracotta hem trim, piped sleeve bands, terracotta apron bib and apron skirt with pale trim,
shoulder straps with iron buckles running over to the pack, wide belt with iron buckle, ceramic forearm guards,
heavy cuffs, baggy trousers gathered at the ankle, short heavy boots with ceramic toe caps, kiln pack with
iron binding, a vented door glowing ember orange and the square chimney, grey hair combed back into a bun.

Differs from the sheet:
- Hands are the baked hands and she holds her baked focus; gauntlet fingers are not rebuilt.
- The pack is one firebox with a chimney; the painted pack has a second stepped stage and side latches.
- Shoulders are plain sleeves with two piped bands, not the painted layered shoulder pads.
- The apron is smooth ceramic-leather; the painted one is mottled, with riveted strap ends.
- Hair is a combed cap, locks and a bun; no loose curls at the temples. The face is the procedural head.

### All other heroes: not started

They keep their baked costume. Each needs a recipe file; hoods, long robes with open fronts, beards and the
other face-gear families would need a few more builders (the existing groom gear still serves them meanwhile).

## Verification

Seen on screen: both heroes in the turnaround stage (idle pose, plus `attack_1` for the ninja and
`cast_release` for the sorcerer), and the ninja as the player in the running game. Not seen on screen: the
low tier, the sorcerer in the running game, NPCs wearing these bodies, and the character preview dialog.
In `cast_release` the sorcerer's raised knee pushed through the coat front; the skirt weights were then moved
toward the thighs, and that change has only been built and unit-tested, not re-rendered.

## Cost

Kiln Ninja: about 32,100 triangles on high, 1 draw call; Kiln Sorcerer: about 26,500. The baked surface
(24k) is no longer drawn apart from the hands and weapon, so the net per-hero triangle count is close to before.
Build time is a few hundred milliseconds once per hero and tier, cached.
