# City reconstruction vs. concept ENVIRONMENT panels

Two comparison sets (left = ENVIRONMENT panel from `assets/references/reference-099..113/original.png`, right = render):

- `oath-XX-compare.jpg`: **the game's real look.** The harness boots `game/src/three/world.js` (terrain tiles,
  sea, vegetation, all 15 sanctuaries) and `atmosphere.js` (Preetham sky; sun and fog by time of day). It renders through
  `postprocessing.js` (HDR UnrealBloom + OutputPass) with main.js renderer settings (ACES at 0.93 exposure,
  RoomEnvironment IBL at 0.32, PCF soft shadows). Per city it picks 08:30 or 15:30, whichever puts the sun behind
  the hall, so shadows rake toward the camera as in the panels.
- `oath-XX-compare-keylight.jpg`: **art-direction preview.** Same stack, but with the panels' lighting ratio: the
  warm sun is ×1.9, the sky fill ×0.55, and an LDR gradient sky dome replaces the Preetham sky. This is a review aid only; no
  game file is changed.

**Finding (since fixed in `game/src/three/atmosphere.js`: the sky dome is scaled and clamped under the bloom threshold; only the sun disk still blooms — the `-compare.jpg` sheets predate this fix):** in the real stack the bloom pass (threshold 1.05, strength 0.38) picks up
the HDR Preetham sky, which is well above 1.0, and spreads it over the whole frame as a milky white veil
(compare any `-compare.jpg` with its `-keylight` twin). With bloom off, or with the sky hidden, the veil disappears
(verified on oath-14). A fix belongs in `atmosphere.js`/`postprocessing.js`, for example by clamping the sky's
output, putting the sky on a non-bloom layer, or raising the threshold.

```
node tools/qa/city-reconstruction.mjs                       # all 15, real game look (Vite on :5173, or starts :4189)
CITY_KEYLIGHT=1 node tools/qa/city-reconstruction.mjs       # art-direction variant
node tools/qa/city-reconstruction.mjs oath-12 --low         # subset / low tier
CITY_NOPOST=1 ... (no bloom)   CITY_RENDERS=1 ... (also bare render)
CITY_VIEW='{"cam":[14,8,-14],"at":[34,8,-30],"fov":55}' node tools/qa/city-reconstruction.mjs oath-12   # close-up
```

`render-stats.json` lists, per city, the sun hour and the number of meshes the city contributes (30–54, merged per material plus
instanced props). It also gives the whole frame's draw calls and triangles (world, terrain and vegetation included).

| Oath | Ref |  | Oath | Ref |  | Oath | Ref |
|---|---|---|---|---|---|---|---|
| 01 Kiln | 113 | | 06 Reed | 108 | | 11 Missing Court | 103 |
| 02 Rime | 112 | | 07 Graft | 107 | | 12 Sanguine | 102 |
| 03 Storm | 111 | | 08 Bitterglass | 106 | | 13 Folded Theatre | 100 |
| 04 Tidal Cov. | 110 | | 09 Daybreak | 105 | | 14 Escapement | 099 |
| 05 Fault Choir | 109 | | 10 Tidal Obs. | 104 | | 15 Impulse Foundry | 101 |

## Pass 2 (blocky/toy-like feedback)

- **Texel scale (surfaces.js), audited in metres.**
  - Ashlar blocks are 0.4–0.95 m long in 0.25–0.42 m courses with 6–10 mm joints, on a 2 m tile. Previously they were 0.7–3.4 m blocks on a 4–8 m tile, which is what made the oath-12 towers read as toy bricks.
  - Marble is 0.7–1.3 m and slate courses are 0.1–0.2 m.
  - Terracotta is real 240×75 mm brick in half-bond with 10 mm joints.
  - Plaza flags are 0.5–1.1 m and ceremonial slabs 0.8–1.6 m, with 8–10 mm grout.
  - Concrete panels are 2×1 m, roof tiles 0.25 m, planks 0.2 m wide.
- **Weathering.** `Builder` now writes a per-vertex `aEdge` attribute: face-local position plus face size, in metres, for boxes, cylinders and prisms.
  `architectureMaterial` uses it in the fragment shader for:
  - lighter, chipped edge wear on every arris;
  - contact grime / AO darkening over the bottom 1.7 m of every vertical face;
  - darkening under caps and eaves;
  - rain streaks fading upward.

  Water, glow and crystal materials are excluded.
- **Set dressing (instanced).** New prototypes: urn on pedestal, flowering planter, robed guardian statue on a stepped
  plinth, crate-and-barrel stack, stone bench, and hanging vine curtain. Braziers and lantern posts are reused.
  - `dressRim` places a per-city rhythm of these just outside the plaza edge, skipping roads and reserved areas.
  - `dressTiers` lines every hall-terrace front edge (recorded by `terraceStairs`) and hangs vines over the terrace faces.

  Each city sets its own mix in `style.dress`, for example crates and urns for Fire, statues and urns for Frost, and freight for Tech.
  Every prop has a collider and a reservation, so NPC and market placement is unchanged.
- **Roofs and towers.** Square towers get a plinth course, string course, three-step corbel cornice and a pyramid finial.
  Round towers get the same banding with a stepped cornice and finials on cones and domes. Hall masses in 01, 03, 05, 08, 14 and 15 get cornices; hip roofs get finials.
- **Horizons, per city in city code.**
  - `horizonCrags`: tapered, faceted crag frusta on an arc 200–520 m out.
  - `skyline`: distant spires, slabs or stacks.

  Assignments:
  - 01: basalt escarpments.
  - 02: granite peaks plus a snow-tinted tier.
  - 03: dark crags.
  - 04 and 06: limestone sea stacks and headlands.
  - 10: dark crags.
  - 11: pale ruin slabs.
  - 12: a red mesa ring (in addition to the existing mesas).
  - 13 and 14: spire skylines.
  - 15: works blocks and stacks.

  Rock masses are now tapered frusta, not stacked boxes.
- **04 Tidal.** A waterfall now pours from every aqueduct bay, plus four sea-wall terraces with tall falls toward the shore.

## What changed for every city

- **Materials (main cause of the clay look).** `game/src/three/architecture/surfaces.js` generates tileable
  albedo, normal and roughness DataTextures in pure JS, so they also work under the Node tests. The families are:
  - dressed ashlar, with one recipe per stone: limestone, sandstone, granite, basalt, slate, shale, veined marble, and terracotta brick
  - flagstone, large-slab, hex and packed-earth paving
  - concrete panels with seams and bolts
  - brushed and dented metal
  - timber planks with grain and knots
  - barrel roof tiles
  - woven cloth, lime plaster, bark, foliage, stratified cliff and ice
  - lava (crust, plus a glowing crack emissive map)
  - waterfall foam and water ripple maps, which scroll at runtime

  `architectureMaterial` in `worldMaterials.js` adds world-space macro variation to break tiling. It
  also adds a per-material IBL boost, because the scene's environment intensity of 0.32 left gold and brass muddy. Builder UVs are
  already metric, so each family declares its tile size in metres. The low tier uses 256² maps instead of 512².
- **Banners** now carry a woven texture with the oath's field colour, trim border, hem band and the
  rasterised oath emblem (from `emblems.js`), instead of a flat accent colour.
- **Plaza inlays.** The 10.5 m plaza logo is replaced by a compact medallion, or by no emblem where the
  panel shows only rule lines. Each city's custom ring and line pattern follows its panel.
- **Swags** are gathered cloth sheets with folds and hanging tails, not flat ribbons. **Sails** are
  subdivided tensile cloth that sags. **Tree canopies** are broken leaf clumps on twig forks around a
  braided trunk, not lollipop spheres. **Rock masses** are tapered irregular crags with a stratified
  cliff texture, not textured boxes.
- **Districts** are dense, taller townhouse frontage, not scattered cottages. Houses gained eave
  cornices and ridge caps.

## Per city

| City | Now matches the panel | Still differs (honest) |
|---|---|---|
| 01 Kiln | Dark basalt slab court; broad fired-clay ring inlay with fine rings; terracotta brick arcades and gatehouse with glowing slits; lava channels with animated crust and glowing cracks (verified in a close-up via CITY_VIEW). | The panel's lava sits in sunken pits right at the plaza lip and the curved viaduct ramp is close. Ours sit behind the solid rim and the viaducts are ~66 m out. Rim bollards/crates are sparse. |
| 02 Rime | Pale frosted slab floor with gold rule lines (roundel, cross axes, rings); lighter blue-grey archive stone; textured scrolling falls. | The panel's huge overhanging slab and wall of waterfalls fill the frame. Ours are narrower falls in block walls, and there are no ice-crusted blocks in the foreground (they sit at r≈47, behind the camera). |
| 03 Storm | Wet dark slab plaza with copper ring inlays; relay pylons with copper bands and lantern caps; cables; new jagged forked discharge bolts between pylons. | No rocky crags hugging the plaza; townhouses visible behind; bolts are thin, without glow halo (no bloom in harness). |
| 04 Tidal Covenant | White limestone, channel ring, two-tier aqueducts with a fall from every bay, sea-wall falls, urn/planter/statue terrace dressing with vines. | **Still not a sea fortress.** The world terrain around this plaza is land at 2–7 m above the plaza out to 600 m, except a seaward sector beyond ~350 m, and world.js's own tree band fills the horizon. The sea-stack crags sit behind it and barely read. Making the panel's open sea needs a terrain or world change (outside city code). Palms are simple. |
| 05 Fault Choir | Stratified canyon walls (crag prisms + cliff texture) now close the view behind the hall with crystal veins; trilithon gates with banners; fractured block lip with glowing seams in front. | Plaza joints are more regular than the panel's large cracked slabs; crystal clusters still read toy-like at distance; veins are thin. |
| 06 Reed | Light stone plaza with thin broken red/timber arc inlays (no logo); acoustic rib fins and linen now sag as tensile sails; timber rail rim. | No bentwood rib arcade along the left stands, no grass/cliff edge; sails are lit from behind in this view and read grey. |
| 07 Graft | Packed-earth plaza with faint ring grooves; giant trees pulled in to the plaza rim (r=57) with braided trunks, platforms, rope bridges, banners, lanterns. | No overhead vine lattice; canopies still read as clumps, not lush layered foliage; thatched huts visible beyond. |
| 08 Bitterglass | Brass roundel seals with spokes; purple tile roofs; reagent pools with ripple/glow; distillery stacks and brass pipe runs on the guildhall. | Panel is enclosed by multi-storey brass-and-stone halls right at the plaza edge; ours is open with buildings set back. No green smoke (VFX). |
| 09 Daybreak | Marble court with gold sun-ray inlays, colonnades with folded canopies, lotus dais, cypress planters, sunken pools. | Pools are not deep wells as in the panel; colonnades smaller; marble reads matte (no sun-glint grade). |
| 10 Tidal Observatory | Lighter steel-grey stone; wet dark slab floor with spoke/ring inlays; orrery with horns and rings; leaning monoliths with portholes; water channel. | Panel's monoliths are huge and close and the plaza is a raised disc over water; ours are set back with an arcade ring between. |
| 11 Missing Court | Pale limestone court with a single hairline ring and cross axis; broken block walls moved in to x=±50; void-sphere sanctum with banners. | Panel's ruin walls are taller, closer and more fragmented on all sides (roads at ±94° cut ours). |
| 12 Sanguine | Redesigned shrine towers at the court's inner corners: stepped plinth, banded piers, open cage with faceted glowing red crystal column, gold collars, ring medallions, banner strips, stepped crown. Gathered red swags between towers and to the hall; rose planters; sandstone arcades closing both flanks; carved ritual-court inlay (centre circle + cross, axial runs, rectangular keys); stratified red mesas. | Towers are simpler than the panel's carved ones; the hall facade is still a crenellated keep rather than the panel's pilastered sanctum (pilasters/banners added but massing unchanged); some townhouses visible above the arcades. |
| 13 Folded Theatre | Polished mirror lozenge in a navy frame at the court centre plus side mirror panes; navy rule grid on cream marble; optical gate rings. | Panel has tall mirror screens, red drapes and raised walkways all around the court; ours has fewer and smaller screens and gabled houses behind. |
| 14 Escapement | Large brass hourglass cages (ribbed bars, domed crowns, floating stone cubes); brass arc inlays; clock-face towers; gears. | The panel's two-tier viaduct ring wraps the plaza in front of the camera; ours is interrupted by the hall terrace and roads, so the view is more open. |
| 15 Impulse Foundry | Concrete panel plaza with orange ring/strip inlays, gantries with pistons, banded tanks, freight crates. | Panel's tank hall and concrete walls are close and tall; tanks/gantries here are smaller relative to the plaza. |

## Pass 2 remaining gaps (honest)

- **Real-game look:** the bloom/sky veil described above dominates every `-compare.jpg`. The `-keylight` set shows the
  city work without it.
- **04 sea, 06 coast, 07 forest canopy:** these horizons depend on world terrain and vegetation. City crags help (01, 02, 03,
  05, 10, 12) but cannot replace an ocean or a forest.
- Hall façades are still box-massed with cornices. There are no modelled pilaster capitals, window tracery or carved
  reliefs, and the props are low-poly at close range.

## Constraints kept

- Spawn, shrine, NPC spots and gate wardens are unchanged; they match `shared/sanctuary-layout.js` exactly
  (checked for all 15). New structures are added in `signature()` (after market placement) or placed
  clear of stalls, so market and NPC placement is unaffected.
- `node --test src/three/*.test.mjs`: 8/8 pass. `tools/qa/collision-audit.mjs`: 0.0 m² uncovered.
  (That audit runs the legacy `game/src/architecture` module, so it does not cover this Three.js city code.
  The Three.js colliders are covered by `worldArchitecture.test.mjs`.)

## Known global gaps

- The harness has no bloom or colour grade, and the Preetham sky reads pale, so the renders look flatter
  and less contrasty than the painted panels.
- The plaza is larger in real terms than the painted courts (fixed 42 m walkable radius / ±38 m square).
  Enclosure is achieved by moving signature structures inward where gameplay allows, not by shrinking
  the plaza.
- The geometry is still primitive-built (boxes, lathes, tubes). The fine carved ornament in the panels
  (pilaster capitals, filigree, chipped edges) is approximated by texture and bevels, not modelled.
