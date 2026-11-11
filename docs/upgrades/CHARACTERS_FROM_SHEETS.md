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
   Kiln recipes keep `weapon`: only what the hand bones carry outside the hand's own volume (the baked weapon); the hands themselves are rebuilt in code. So there are
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
| `hair.js` | The `hair` builder: a dark undercoat plus distinct tapered locks. Styles `spiky`, `long` (+ `tail` to tie it back), `bun` (a small high knot is a topknot), `braid`, `none` (+ `stubble`). |
| `hands.js` | The `hands` builder: palm, jointed fingers and thumb per hand, rigid on the hand bone; gloved, fingerless or bare; the weapon hand is a closed fist. |
| `material.js` | One procedural material; a per-vertex (roughness, metalness, kind) triple picks the detail in rest space: twill weave, soot and wear on cloth; pits, chips and kiln flashing on ceramic; grain, creases and scuffs on leather; pitting and rust on iron. Plates, bands and straps also carry darkened edges in their vertex colours. No textures, constructs in Node. |
| `costume.js` | Compiles a recipe into a geometry. |
| `recipes/` | One data file per hero: palette, build, what to keep of the baked mesh, and a list of builder calls. |
| `wear.js` | Runtime: measure the rig, hide the baked costume, bind the costume, hook dispose/fade. |
| `sheets.test.mjs` | Recipes reference shipped heroes and existing builders; every recipe builds in Node with no document on every tier and two body sizes; weights are normalised; builds are deterministic. |

Dev stage: `game/sheet.html?id=oath-01-ninja` renders front, back, side and three-quarter through the game's
BodyFactory (`clip=attack_1&frames=6`, `pose=bind`, `q=low|medium|high`). A new hero is a new file in
`recipes/` plus one line in `recipes/index.js`.

## Writing a recipe

```js
export default {
  id: 'oath-NN-ninja', sheet: 'reference-0NN', title: '...',
  palette: { cloth: '#...', leather: '#...', iron: '#...', hair: '#...' },   // `skin` defaults to the head's skin tone, `hollow` to near-black
  build: { width: 1, depth: 1, shoulder: 1, waist: 1, hips: 1, belly: 0, bust: 0, arm: 1, leg: 1, neck: 1 },   // multipliers on a lean athletic default
  keep: ['weapon'],                       // what stays of the baked mesh: 'weapon' (held weapon only) or 'hands' (baked hands and weapon)
  groom: { hair: false, gear: false },    // false = this recipe builds the hair / face gear itself
  builders: { myPart },                   // optional: extra builders from the group's own file
  parts: [{ use: 'shirt', sleeve: 2 }, { use: 'hands', glove: 'glove', fingerless: true }, { use: 'hair', style: 'long', tail: { length: .8, tie: 'leather' } }],
};
```

Hair: `{ use: 'hair', style: 'spiky'|'long'|'bun'|'braid'|'none', color, streak, length (head heights), density,
lift, fringe (front hairline height, -.5 chin .. .5 crown), knot: { at: [x, y, z] head space, radius, tie },
tail: { length, width, tie }, braid: { length, width, tie }, stubble }`. Head space: origin at the head's
centre, +y up, +z forward, chin to crown = 1.
Hands: `{ use: 'hands', glove: paletteName|null, fingerless, skin, fist: 'R'|'L'|'both'|'none', scale, knuckles }`.
A builder receives `(context, params)` with `context = { bag, form, rig, q, pal, rand, head }`; see the header of
builders.js. Register a recipe with one import line in `recipes/index.js`.

## Sheet to hero mapping

Read from the title printed on each sheet (and consistent with `tools/blender/characters/cf/heroes`).
reference-092..095 are sorcerer line-ups and 096..098 ninja line-ups across elements, not single heroes.

| Oath | Title on sheet | Ninja turnaround | Sorcerer turnaround | Oath overview | Ninja status | Sorcerer status |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | FIRE - Kiln Oath | reference-090 | reference-091 | reference-113 | **done** (see below) | **done** (see below) |
| 02 | FROST - Rime Archive | reference-089 | reference-088 | reference-112 | **partial** (see below) | **partial** (see below) |
| 03 | LIGHTNING - Storm Relay | reference-085 | reference-087 | reference-111 | **partial** (see below) | **partial** (see below) |
| 04 | WATER - Tidal Covenant | reference-084 | reference-086 | reference-110 | **partial** (see below) | **partial** (see below) |
| 05 | EARTH & CRYSTAL - Fault Choir | reference-082 | reference-083 | reference-109 | **partial** (see below) | **partial** (see below) |
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
short piped sleeves, a band of bare upper arm, dark bindings from above the elbow under leather vambraces with
buckled straps, asymmetric capelet over the right shoulder with terracotta trim, rolled hem and drape folds,
bunched cowl, diagonal strap with square anchor ring at the left shoulder, three stacked ceramic chest plates
front and back with iron clasps, side straps and riveted harness straps, leather belt with iron buckle and a
second thin belt, ceramic block bracer with three vent slots and iron hinge bands on the left forearm, glove
cuffs, trousers with side seams, pocket openings and terracotta piping, pleated into a leather band with
terracotta trim below the knee, ribbed shin wraps, boots with lugged sole, ceramic toe caps, shin and heel
plates and buckled straps, vented iron half mask with terracotta slats and head strap, layered spiky black hair.
Costume volumes are widened at the shoulders, chest, arms and legs toward the sheet's build.

Differs from the sheet:
- Hands are code-built and rigid (the rig has one bone per hand): fingerless gloves, open left hand, closed
  right fist around the baked blade. Fingers do not animate.
- He holds his baked blade; the sheet shows him unarmed.
- Joints are the rig's: the neck is shorter and the legs less long than the painting, and the head reads larger.
- Trousers are fuller and rounder at the knee than the painted, slimmer cut; their folds are regular.
- Boot toes are rounder and redder than the painted dark boots with small plates.
- Hair is a cap of short layered spikes; the painted hair is longer on top with a looser parted fringe.
- The capelet's back follows the front's diagonal (the sheet's own back and side views disagree with its
  front about the capelet and strap side). No belt pouches or hanging strap ends; no stitching on leather.
- The face is the existing procedural head, not a likeness of the face panel.

### oath-01-sorcerer (reference-091): done, with more differences than the ninja

Evidence: `docs/qa/characters/oath-01-sorcerer.jpg`. Present: stocky build, long-sleeved firecloth coat to
mid-shin with terracotta hem trim, piped sleeve bands, terracotta apron bib and apron skirt with pale trim,
hip flaps, shoulder straps with iron buckles running over to the pack, wide studded belt with iron buckle,
ceramic forearm guards, heavy cuffs, baggy trousers gathered at the ankle, short heavy boots with ceramic toe
caps, kiln pack with iron binding, a vented door glowing ember orange and the square chimney, grey hair combed
back into a bun.

Differs from the sheet:
- Hands are code-built gloves, rigid; she holds her baked focus.
- The pack is one firebox with a chimney; the painted pack has a second stepped stage and side latches, and
  its vent door is dark, not glowing.
- Shoulders are plain sleeves with two piped bands, not the painted layered shoulder pads.
- The apron is wider and brighter than the painted one, without its riveted strap ends.
- Hair is a combed cap, locks and a bun; no loose curls at the temples. The face is the procedural head and
  does not resemble the portrait.

### Oaths 02 to 05 (group A): all eight built, all partial

Recipes `recipes/oath-02..05-{ninja,sorcerer}.js`; their extra builders are in `builders-a.js` (`a/kit` rigid gear
from primitive shapes on any anchor, `a/bodysuit` fitted cloth with colour zones, `a/lines` piping, quilting and
flat straps, `a/plates` bordered slabs on trunk, coat or limb, `a/collar`, `a/hood`, `a/hoodDown`, `a/fringe`,
`a/beard`, `a/helm`, `a/yoke` collar plate and disc collar). Evidence, one side-by-side per hero from the
turnaround stage: `docs/qa/characters/oath-0N-<discipline>.jpg`. Each was seen on screen idle from four sides on
the high tier only. Not seen: any of them in the running game, in motion, or on the low and medium tiers (those
tiers are unit-tested to build). They are NOT in `recipes/index.js` yet (see the group's report for the lines).

Common to all eight: the body is slimmer and less sculpted than the paintings (no muscle or bust modelling, bare
arms are plain tubes), skin tone is the head profile's and is paler than several sheets, surfaces use the existing
shader kinds (ice, nacre and glass are opaque gloss, not translucent; quilting is stitched lines, not padded),
hands are the rigid code hands, faces are the procedural head.

- **oath-02-ninja (089)**: hood up with pale lined rim, fringe, high collar, short-sleeved felt jacket, quilted
  pale vest front and back, webbing braces with buckles and back strap, belt, quilted hip panels, arm warmers,
  rime bracer plates on strap mounts, piped trousers, thigh straps and holster, knee pads, heavy pale-soled boots.
  Differs: sleeves are boxy at the shoulder, hood is smaller and less draped, hip panels do not sweep to the
  back, boots are not split-toed, no trouser pockets.
- **oath-02-sorcerer (088)**: floor-length piped robe open over a white under-robe, winged ice-lined collar,
  quilted back yoke, white sleeves, leather bracers with rime-edged elbow fins, double belt, folio rack of rime
  pages on the right hip, long beard and moustache. Differs: the groom pass still adds its own short beard and
  white hair at the back of the head (the sheet is bald; needs a `beard: false` switch in groom.js, which this
  group may not edit); shoulder caps are barely visible; too much white shows down the front; robe has no
  lighter slate panels.
- **oath-03-ninja (085)**: sleeveless navy top with high neck and copper piping, bandolier, spine relay mount with
  cable loop and ceramic coupler, belt, hip slings, crossed knee straps, right bracer in a copper frame with
  coupler and two antenna rods, left wrist wrap, boots with ceramic cuff plate, spiky hair with topknot.
  Differs: arms are unmuscled tubes, antennae are thinner, trousers lack the looser thigh cut, hair is shorter.
- **oath-03-sorcerer (087)**: heavy build, navy cape with copper hem, riveted copper collar plate, four curved
  antennae with ceramic balls, ceramic forearm guards banded in copper, webbing belt with pouches and copper
  clasp, cargo trousers with copper-trimmed pockets, ceramic boots with copper bands and ankle boss, top bun.
  Differs: cape hangs closer and less stiffly, collar plate is narrower, boots are shorter and less armoured,
  trousers end higher.
- **oath-04-ninja (084)**: blue diving suit with sea-green panels and brass piping, sealed helmet with dark visor,
  brass frame and nacre crest, four-tier shell pauldron on the right shoulder with strap, brass arm bands, nacre
  vambraces, glass reservoir in a brass frame on the back, thin belt, calf fins, brass-capped boots.
  Differs: the least close of the eight. Helmet crest is one swept plate rather than layered shells, suit has no
  body contouring, green panels are simple blocks, no hip straps or knee detailing.
- **oath-04-sorcerer (086)**: navy robe to mid-shin with brass hem, wide sleeves over green wraps and nacre
  cuffs, shell-disc collar in brass rims, hood down, belt with three glass reservoirs, brass-edged tabards front
  and back, nacre hip tassets, green trousers, brass-capped boots, white hair. Differs: robe reads brighter blue,
  reservoirs are opaque, discs are fewer and smaller at the back, the groom pass adds its own beard.
- **oath-05-ninja (082)**: stone collar, half mask, short-sleeved tunic, four sandstone-framed shale breast plates,
  back plates with sandstone spine blocks, shoulder slings and side straps, belt with pouches, amethyst cluster
  in a hexagonal sandstone frame on the left hip, forearm slabs on straps, baggy knee trousers, shin wraps, plated
  boots with greaves. Differs: plates are flat rectangles without fracture relief, trousers balloon more, collar
  is narrower and taller, shoulders narrower.
- **oath-05-sorcerer (083)**: sleeveless tunic with sandstone side panels and mandarin collar, braces with buckles,
  belt, three shale apron plates in front and one behind, layered leather hip flaps, stone bracers, plated boots
  with amethyst inlay, carrying frame behind the head with boulder and amethyst veins, low bun. Differs: arms and
  legs are slimmer and unmuscled, frame and boulder are smaller, shorts barely show under the skirt, hair has no
  loose curls.

### All other heroes: not started

They keep their baked costume. Each needs a recipe file; hoods, long robes with open fronts, beards and the
other face-gear families would need a few more builders (the existing groom gear still serves them meanwhile).

## Verification

Seen on screen after the lean build, new hair and code hands: both heroes idle from four sides in the
turnaround stage (through BodyFactory) and a close-up of the ninja's chest, arm and hand; the ninja as the
player in the running game, standing, moving forward and in an attack (`in-game-kiln-ninja.jpg`; camera behind
him, legs hidden by the HUD). Seen before that pass and not re-rendered since: ninja `attack_1` and run,
sorcerer `cast_release` and run in the turnaround stage. Not seen on screen: the low tier, the sorcerer in the
running game, NPCs wearing these bodies, the character preview dialog, and the hair styles `long` and `braid`
(built and unit-tested only).
Sorcerer coat: in `cast_release` the raised knee no longer comes through. In the run her trousers now start
below the coat (`from: 1.06`); rendered with `.95` the thigh was clean with a small notch at the apron's lower
edge, and the `1.06` value has not been re-rendered in a run.

## Cost

Kiln Ninja: about 35,000 triangles on high, 1 draw call; Kiln Sorcerer: about 29,000. The baked surface
(24k) is no longer drawn apart from the hands and weapon, so the net per-hero triangle count is close to before.
Build time is a few hundred milliseconds once per hero and tier, cached.
