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
| 06 | WIND & SOUND - Reed Resonance | reference-081 | reference-080 | reference-108 | partial (see below) | done (see below) |
| 07 | NATURE - Graft Sanctuary | reference-079 | reference-078 | reference-107 | partial (see below) | done (see below) |
| 08 | POISON - Bitterglass Guild | reference-077 | reference-076 | reference-106 | done (see below) | done (see below) |
| 09 | LIGHT & HOLY - Oath of Daybreak | reference-075 | reference-074 | reference-105 | partial (see below) | done (see below) |
| 10 | COSMIC & GRAVITY - Tidal Observatory | reference-073 | reference-072 | reference-104 | partial (see below) | done (see below) |
| 11 | SHADOW & VOID - The Missing Court | reference-071 | reference-070 | reference-103 | partial (see below) | **done**, with differences |
| 12 | BLOOD - Sanguine Covenant | reference-069 | reference-067 | reference-102 | partial (see below) | **done**, with differences |
| 13 | ARCANE & ILLUSION - Folded Theatre | reference-068 | reference-066 | reference-100 | partial (see below) | partial (see below) |
| 14 | TIME & MOTION - Escapement Road | reference-065 | reference-064 | reference-099 | **done**, with differences | partial (see below) |
| 15 | TECH & FORCE - Impulse Foundry | reference-063 | reference-062 | reference-101 | **done**, with differences | **done**, with differences |

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
### Oaths 06 to 10 (group b): builders in `builders-b.js`, used through each recipe's `builders` field
All ten were rendered through `game/sheet.html` (BodyFactory, high tier, idle pose, four views) and compared
with their sheets; evidence is `docs/qa/characters/oath-NN-<discipline>.jpg`. None is a duplicate of its
painting: each is the same costume rebuilt from simpler shapes. Common to all ten: the face is the procedural
head, not the portrait; the held weapon is the baked one (the sheets show empty hands); hands are the shared
code hands; proportions are the rig's (shorter legs and neck than the paintings); surfaces use the five
existing shader kinds, so wood and bamboo take the leather grain, brass, gold and silver take the iron
pitting with its rust mottling, enamel takes the smooth skin kind, and glass is an unlit glowing colour with
no transparency. Also seen: six of them (06, 07, 08 and 10 sorcerers, 09 and 10 ninjas) mid-run on the
medium tier; costumes follow the stride, the trailing shin shows behind long coats, and on medium the violet
bands of the Tidal Sorcerer's hem weights are lost. Not seen: any of them in the running game, the low tier,
attack or cast clips.
**oath-06-ninja (reference-081): partial.** Present: carved beak mask with painted red bands, eye sockets,
cheek pivots with hanging cords and head strap; high ponytail with red tie; linen neck binding, breast band,
wide wrap over the left shoulder and a narrow crossing wrap; bare midriff with crossed linen bands and red
cords; wound waist sash; three red sash tails; small linen hip drape; red carved shoulder plate on the left
with pale edge; pipe harness and two bamboo reed pipes with nodes, linen wrap and lashings on the back; dark
forearm wraps with red cord; fitted dark trousers with seams, knee pads, shin wraps, ankle boots with red
cord. Differs: the mask is a smooth lofted shell (no weathering, flatter painting, blunter from the front);
the wraps are clean bands rather than torn layered cloth; no fingerless-glove detail beyond the shared hands;
legs are slimmer and straighter; the hip drape is plainer; pipes have no finger holes.
**oath-06-sorcerer (reference-080): done.** Present: tall narrow build; ribbed linen coat body with red side
panels, knife-pleated skirt open at the front over a red under-robe, pleated hem; bell sleeves lined red with
four brass bells each; pointed shoulders; standing collar lined red; wide dark belt with cross lacing; five
reed pipes in a leather frame on the left hip; resonator yoke with two capped horns and a lashed spine board;
slim trousers, red ankle bands, low dark shoes with pale soles; groom top-knot and goatee. Differs: horns are
plain swept tubes without the carved relief and stand straighter; collar sits lower; the coat is paler in
places because of the cloth wear shading; no chest toggles.
**oath-07-ninja (reference-079): partial.** Present: seed-pod bark mask with midrib, grain, two glowing eye
slits, rim scales and moss; cap of tight curls; dark high-necked under-layer, bare upper arms with a buckled
band; ribbed bark breastplate, crossing bark strap and green sash; three layered bark shards on the right
shoulder with a sap plug; moss mantle over the left shoulder and chest; bark forearm guards with branch stubs
and sap plugs; wound green and brown waist sashes; four straw-weave tassets bordered in green, bark centre
panel, dark back cloth; baggy trousers gathered below the knee, knee bands, bark greaves, boots with root
stubs and moss. Differs: the chest is one ribbed plate, not many overlapping shards; moss is flat fronds, not
feathery tufts; branch stubs are plain cones; boots lack the wrapped roots over the toes; he is less massive.
**oath-07-sorcerer (reference-078): done.** Present: short stout stooped build; brown coat with wide sleeves
over cream under-sleeves and collar; dark under-skirt, burlap skirt with straw hem band, coat skirt open at
the front; moss aprons front and back; green breast wrap; root harness over both shoulders with sap plugs;
rope sashes; straw fringes with sap beads on both hips; woven basket with hoops and stakes, moss top and
three leafy saplings; laced ankle boots; grey bun. Differs: the fringe is flat knotted ribbons, not braided
rope with chain links; the basket weave is a colour pattern on a smooth shell; no moss growing on the coat;
the back strap hinge is a single sap boss.
**oath-08-ninja (reference-077): done.** Present: leather skull cap with seams and band; respirator cup with
brass frame, two rimmed canisters and straps; black high neck; oilskin jacket with purple breast, back and
shoulder panels; brass-edged leather shoulder plates with rivets; braces over both shoulders, crossed chest
straps with brass bosses; brass-edged leather vambraces with buckled straps, black gloves; ampoule belt with
ten glowing ampoules in brass caps and leather clips; wide shorts over leggings; strapped thigh pouches;
brass-edged knee pads; strapped boots; pack with flap, pocket, brass corners and three ampoules. Differs: the
shorts read as one skirt from the back; pouches are smaller and fewer; less stitching, buckles and layering
on the harness; brass trims are thin raised lines.
**oath-08-sorcerer (reference-076): done.** Present: dark cap with gold seam over grey hair and a nape knot;
high winged collar lined purple and edged gold; long fitted coat open from the waist, purple lining, gold
edge and hem, gold seam piping front and back; shoulder straps crossing at the back with a brass boss; two
belts; three long vials racked at the left hip; two glass globes half full of glowing liquid with brass
necks, valves, girdles and cradle arms; standpipe with collars and spout behind the left shoulder; flared
brass vambraces, black gloves; tall boots with brass toe caps and heels. Differs: the coat hangs straight
without the pointed, layered tails and back vent; globes are opaque two-tone, not glass; no small buckles on
the harness; the standpipe sits behind the left shoulder in all views (the sheet's views disagree).
**oath-09-ninja (reference-075): partial.** Present: braided-up dark hair with gold band; folded ivory visor
with gold edges over a grey veil, strap and gold clasp; sleeveless grey top with ivory collar; ivory sash
from the left shoulder; wound ivory waist; folded ivory wing on the left shoulder with gold edge and hinge;
gold armlets, grey sleeves from the elbow, ivory vambraces with gold edges, gold wrist rings; four ivory
tassets edged in gold with grey and ivory centre points; grey leggings with gold seams; ivory shin cuffs.
Differs: the wing is a rounded wedge, not the sharp faceted kite; the visor is boxier and hides the brow;
tassets are narrower and longer than the flared skirt; no high heels; leggings lack the diamond seam lines.
**oath-09-sorcerer (reference-074): done.** Present: grey robe with wide gold-cuffed sleeves and gold-edged
collar; ivory scapular front and back piped in gold with pointed shoulders; four ivory coat panels at the
sides and back with gold borders over the grey skirt; belt with gold fittings; lotus boss front and back;
hanging tab; reliquary box on the right hip; baggy grey trousers, boots with gold soles; groom swept hair,
tail and beard. Differs: the lotus is smaller with fewer petals; the reliquary is a plain framed box; the
side panels overlap slightly instead of showing clean grey strips.
**oath-10-ninja (reference-073): partial.** Present: closed dark helm with three glowing slits, brow band and
ear discs; indigo scarf and tunic; silver crescent across the chest; iron horn on the right shoulder with
bronze edge; layered plates on the left shoulder; back harness with a bronze boss; padded sleeves, elbow
cops, heavy vambraces with violet inlay, gauntlet hands; heavy belt with buckle and two pouches; silver hip
crescent with violet inlay; indigo front and back tabards with inlaid ring and bars; four iron tassets edged
in silver; knee cops, greaves, strapped plated boots. Differs: he is narrower and less massive; the horn is
flatter and smaller; armour plates are simple shells without the layered rims, rivets and straps; iron is
mottled rather than brushed; the emblem is simplified; fewer belt pouches.
**oath-10-sorcerer (reference-072): done.** Present: stout build; midnight robe with bell skirt, silver hem
band, wide silver-banded sleeves with gold star studs, pointed shoulders; cream centre panel with inlaid
orbit marks; six silver straps with violet inlay and bosses down the skirt; silver belt with violet line and
the orb in rings with its tag; astrolabe collar with studs, inner ring, jointed arm and orb; eight banded
weights on chains at the hem; baggy trousers, strapped boots; bun with a ring. Differs: the collar is
slimmer and plainer; no embroidered constellations on the cloth; strap bosses are round, not hexagonal; the
weights are smaller.
Two profile skin tones were changed to follow the sheets: oath-06-ninja to tan, oath-07-ninja to brown.
### Oaths 11 to 15 (group c)
Ten recipes, `recipes/oath-11-ninja.js` to `oath-15-sorcerer.js`, and one builder file, `builders-c.js`, whose
builders are named `c:...` and brought by each recipe with `builders: C`: `c:kit` (hard gear assembled from boxes,
bars, rings, cylinders, balls and cut prisms on an anchor: trunk, limb, head, foot or bone), `c:hose` (hoses, tubes
and chains through anchored waypoints), `c:drape` (cloth hanging from the waist between two angles with any hem
line, lining and trim: asymmetric skirts, tabards, tassets, open coats), `c:patch` (panels cut on the trunk:
wrap-over fronts, vests, plates), `c:collar`, `c:bellSleeve`, `c:headShell`, `c:headBand`, `c:crest`, `c:curls`,
`c:locks`, `c:tail`, `c:strands`. Evidence for each hero: `docs/qa/characters/oath-NN-<discipline>.jpg` (sheet on
the left, code in the game runtime on the right, idle pose). All ten hide the baked costume, keep only the baked
weapon and wear code hands. `profiles.js` was edited for four of these heroes so the head matches the sheet
(11 sorcerer bald with grey stubble, 13 sorcerer young with black hair, 15 ninja and 15 sorcerer brown skin,
15 sorcerer short beard).
Differences shared by all ten: joints are the rig's (larger head, shorter legs than the paintings); faces are the
procedural head, not likenesses; hands are the generic code hands; each holds its baked weapon where the sheet
shows empty hands; cloth, leather and metal use the shared procedural shader, so brocade and embroidery patterns
(12 sorcerer robe, 13 sorcerer front panel) are not drawn. Where a sheet's front and back views disagree about
which side an asymmetric piece is on, the front view was followed.
- **oath-11-ninja (071), partial.** Present: short-sleeved black tunic, grey wrap-over front and shoulder strips,
  rolled scarf collar, bound forearms with grey bands, plate on the right forearm, fingerless gloves, two belts,
  asymmetric skirt (short over the left hip, long pointed fall with grey under-layer on the right), slim
  trousers, thigh case on two straps, ankle boots, black half mask with the bone-white cheek panel, high
  ponytail with pale tie, temple locks. Differs: the skirt hangs closer to the leg than the painted wide fall;
  hair is flatter on top and the tail thinner; one grey front layer where the sheet has two; no knee pads; the
  belt buckles are plain frames.
- **oath-11-sorcerer (070), done.** Present: tall open collar edged in silver, velvet coat to the ankle open on a
  charcoal under-robe, placket with four square clasps on straps, shoulder caps, bell sleeves with silver hem,
  side and back points cut in the coat hem over a charcoal layer, plain boots, bald head, grey stubble. Differs:
  shoulder caps are round, not the painted pointed wings; the lower coat is one layer cut to points rather than
  separate overlapping panels; the cuff lining is plain.
- **oath-12-ninja (069), partial.** Present: leather helm with raised faceplate, steel crest and side buckles,
  dark cloth neck, sleeveless oxblood vest with steel-piped V front over a dark undershirt, bare arms, bound
  forearms with buckled bands, wide belt with four enamelled anchor rings, a heavy chain looped at each hip,
  pointed front and back tassets and hip panels, gathered trousers, knee bands, bound shins, strapped boots.
  Differs: arms are smooth tubes with a shoulder ball, not modelled muscle; the helm is rounder than the painted
  almond shape and has no brow facets; tassets are single panels without the painted layering and iron corners;
  the vest is fuller at the waist.
- **oath-12-sorcerer (067), done.** Present: burgundy wrap robe piped in brass, open collar, bell sleeves,
  charcoal shoulder over-vest, shoulder straps with brass buckles, brass-caged blood vials on both shoulders with
  tubes arching to a harness ring on the back, wide belt with crossing straps, brass-bound hip case, long coat
  open over a diagonal apron and charcoal under-skirt, buckled boots with brass caps, hair drawn back to a low
  knot, earrings. Differs: no woven pattern on the robe; vials follow the upper arm, so they tilt with it; hair
  is combed locks, not braids with beads; in a run the under-skirt shows through the back of the coat.
- **oath-13-ninja (068), partial.** Present: charcoal jacket with high plum-lined collar, plum wrap over the right
  shoulder front and back, back clamp, thin belt, short diagonal front skirt and long plum-lined tail on the
  right, steel frame-and-socket bracers on both forearms, gloves, thigh pouch, slim trousers, strapped boots with
  steel caps, folded porcelain blade mask over a black under-mask, head strap with side buckles, spiky black
  hair. Differs: the mask is a single folded plate, narrower than the painted one; the jacket front is longer
  than painted; the back strap is the wrap's edge, not a separate strap.
- **oath-13-sorcerer (066), partial.** Present: aubergine jacket with stand collar, mauve lacquer facing with a
  pearl, folded lacquer wings front and back, belt with hexagonal pearl fastening, silver-bound spell case, layered
  lacquer forearm cuffs with pearls, fingerless gloves, plum front panel and mauve lacquer falls, striped
  trousers with knee straps, boots with silver caps, short black hair. Differs most of the ten: the wings are flat
  triangles, larger and plainer than the painted folded collar; the jacket lacks the painted crossing lapels; the
  skirt panels are simpler and the front panel has no gold arcs; the hair is a rough bob.
- **oath-14-ninja (065), done.** Present: sleeveless graphite body with brass zip, teal chest and back panels
  piped in brass, teal collar, bare upper arms, long gauntlets with a lit brass slot, two belts and a fine chain,
  toothed and spoked hip flywheel with lit hub, teal tabards front right and back, riveted leather hip panel,
  cargo pockets, piped trousers, boots with brass ankle struts and wheels, slatted lit visor with side hinges,
  high-top curls. Differs: the visor's three slats read as one band at distance; the flywheel is flatter than
  painted; trousers are fuller.
- **oath-14-sorcerer (064), partial.** Present: teal jacket with ivory-lined collar, ivory facing under a buttoned
  teal flap, crossed back harness, brass-and-glass escapement cuffs with a gear on both forearms, belt and glass
  case, teal coat skirt over a longer ivory layer, back hub with jointed arm, rod and pendulum bob, knee bands,
  boots with brass caps, top knot. Differs: the skirt is a closed bell rather than the painted open wrap with
  separate ivory panels; cuffs are shorter and brighter than painted; the pendulum is rigid on the upper back and
  does not swing; the knot is small.
- **oath-15-ninja (063), done.** Present: sleeveless zipped suit with high collar, webbing harness with buckles,
  burnt orange chest, collar-bone and spine plates, arm straps, bracers with orange plate and lit slot, gloves,
  hip couplings with lit lenses and two ribbed hose loops a side, thigh straps and pouches, knee pads, knee
  actuators with lit lens and thigh and shin struts, heavy boots with orange caps, faceplate with lit chevron,
  orange cheek plates, ear couplings, rope locks over cropped sides. Differs: the chest plate is two flat panels
  without the painted steel frame; hoses are thinner; boots have fewer plates.
- **oath-15-sorcerer (062), done.** Present: graphite coat open at the front on an orange lining and vented at the
  back, orange piping, collar with orange lining, shoulder caps, placket with four clasps, harness straps, belt
  with case and pouch, power pack with ceramic doors, lit cell and two side canisters, cables to both arms,
  steel drum gauntlets with ceramic shoes and lit cells, steel hands, heavy boots, cropped curls, short beard.
  Differs: the pack and gauntlets are simpler and smaller than painted; the coat has no corner plates; cables
  are single hoses.
Seen on screen (turnaround stage through BodyFactory, high tier): all ten idle from four sides; close views of
11 sorcerer, 12 ninja, 13 sorcerer, 15 ninja; 15 ninja in `attack_1`; 12 sorcerer running. Not seen: these heroes
in the running game, the low and medium tiers on screen (they build and pass the unit test), the other clips.
Triangles on high: 23k (11 sorcerer) to 39k (15 sorcerer), one draw call each.

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
