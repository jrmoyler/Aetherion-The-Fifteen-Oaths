# Aetherion: all-realm terrain validation review

12 November 2026. Baseline: `73e196e452a2755feb8789cd889534a28b86c029` (current main when cloned). PR branch: `validation/all-realm-terrain`.

## Review decision

Automated validation now covers all 15 realms. Visual acceptance remains **pending**: this environment produced **zero new rendered screenshots**. Do not treat the CPU mesh checks as rendered inspection or approval to merge. The user requested publication of these fixes in a new PR. No deployment, merge, production asset replacement, or terrain-grid regeneration is authorized by this report.

The current baseline includes integrations beyond PR #25 (ground shaders, landmarks, wildlife and more). Those completed integrations remain intact. The absence of a scene object from PR #25 is not treated as a terrain regression.

The MMO CI workflow runs the terrain regression suite. `vercel.json` disables automatic deployments specifically for `validation/all-realm-terrain`; other branches retain their existing behavior.

## Proposed consequential changes

1. **Camp/lair suitability:** use the local water surface with 0.4 m clearance (retaining the existing 1.5 m minimum), and check all four directions at 4 m offsets. Baseline world seed 15015 has six camps below the marsh surface and two volcanic camps missed by the old positive-X/positive-Z slope check. Regression tests also expose alpine and coastal slope failures at seed 1. After the fix, all 330 camps and 15 lairs pass the placement checks for each of seeds 15015, 1 and 42.
   - Consequence: at seed 15015, 13 of 330 camp coordinates change (4 volcanic, 9 marsh), partly from deterministic RNG sequencing after rejecting bad sites. No starter camp coordinates or boss lair coordinates change at that seed. This is a placement change to review before merge, not a cosmetic-only patch. Exact removed/added sites are in `placement-changes.json`.
2. **Marsh movement:** centralize the nominal water surface (3.4 m within the existing 630 m pool radius, sea level outside) for ground colouring, landmark planning, world queries and camp placement. The player controller now reads the location-specific surface instead of always using sea level. A regression test puts the actual controller at a formerly submerged camp and verifies it floats at the expected depth. Server anti-cheat tolerance and mob movement were not redesigned.
3. **Terrain LOD skirts:** replace the fixed 6 m skirt depth with a depth calculated from the finest edge samples and all resolutions in the selected quality tier. The baseline audit measures a maximum edge mismatch of 10.584 m, exceeding the old skirt by about 4.584 m. The fix extends only vertical skirts; walkable vertices, source relief, asset geometry and topology counts are unchanged. No uncovered skirt gap remains in the 45 audited low-tier viewpoints. This establishes geometric coverage, not a visual seam-quality verdict. Additional per-tile CPU sampling needs hardware profiling.

## Evidence and limits

| Check | Result | What it establishes |
| --- | --- | --- |
| Dedicated terrain suite | 38 pass, 0 fail | Relief tests, 32 all-realm checks, 2 water regressions, 1 skirt regression |
| New all-realm tests before fixes | 28 pass, 4 fail | Reproduces volcanic/alpine/coast/marsh placement defects |
| Root suite after fixes | 286 pass, 3 fail | Three unchanged source-ability failures; reproduced with production files restored to baseline |
| Server suite | 52 pass, 0 fail | Existing simulation checks remain passing |
| Client suite (recursive `.test.mjs` and `.test.js`) | 119 pass, 0 fail | Includes existing flora, ground, collision and integration tests |
| Production build | Passed, including PWA generation | Buildability; existing large-chunk warning remains |
| Three.js CPU geometry audit | 15 realms / 45 viewpoints / 1,153,018 vertex samples | Terrain vertex heights agree with shared sampling within 0.002 m; finite positions; tree exclusion rules; skirts cover sampled LOD edge gaps |
| Shrine discovery access | 15/15 passed | Actual player controller reaches the 12 m discovery radius from each spawn using generated sanctuary collision |
| Terrain road access | 120/120 passed | First 320 m of all 60 directed realm-road approaches, outward and inward, using actual controller at 30 Hz; architecture/trunks excluded for this terrain-only check |
| Browser screenshots | 0 obtained | Chromium launch blocked; not a visual pass |
| Full gameplay / FPS / GPU / physical device | Not performed | No hardware or play-feel acceptance claim |

The three root failures throw `Cannot read properties of null (reading 'gl')` in the imported Ability Matrix `Environment`. Their unchanged-baseline reproduction is in `baseline-source-failures.txt`. They were not suppressed or reclassified as passes.

A direct off-road shortcut from the alpine spawn stalls around (-404.43, 1482.20), on the road shoulder (road distance ~25.28 m). Every canonical road approach passes. The shortcut and direct architecture exit probes are diagnostic, not pathfinding: failed straight-line routes through structures do not establish inaccessible sanctuaries. All shrine approaches pass using the actual interaction radius, rather than trying to enter the solid shrine centre. See `geometry.json`.

CPU geometry checks do not compile shaders, inspect lighting, prove correct appearance, measure plant canopy penetration, check the interior of every terrain triangle, or establish network gameplay parity. Skirts can hide holes without eliminating visible LOD height changes. Existing flora/ground tests check finite geometry, placement masks, source metadata and environment settings; visual vegetation acceptance still requires renders. Camp checks validate the centre and four support offsets, not every roaming creature or path to every camp. Road checks cover sanctuary approaches, not full inter-realm journeys.

## Realm inspection matrix

Coordinates are world X, Z in metres; full X/Y/Z, shrine locations and all 60 transition records are in `locations.json`. Viewpoints are spawn, starter camp and the first connected road midpoint. Priority realms are first; the browser capture runner uses the same order.

| Realm / terrain | Priority | Spawn X,Z | Starter camp X,Z | Transition X,Z | CPU checks | New render |
| --- | --- | --- | --- | --- | --- | --- |
| oath-04 / coast | Priority | -1437.95, -1608.18 | -1437.36, -1413.48 | -1575.00, -1080.00 | Pass | Pending |
| oath-06 / cliffs | Priority | 985.84, 1248.75 | 1140.31, 1133.72 | 450.00, 1395.00 | Pass | Pending |
| oath-08 / marsh | Priority | -724.21, -528.76 | -730.19, -729.97 | -1080.00, -1080.00 | Pass | Pending |
| oath-09 / meadow | Priority | 258.40, 356.94 | 271.42, 564.62 | 90.00, 945.00 | Pass | Pending |
| oath-10 / highland | Priority | 1880.02, 803.33 | 2088.17, 794.99 | 1440.00, 1035.00 | Pass | Pending |
| oath-11 / badlands | Priority | 1968.00, -449.93 | 2175.64, -464.66 | 1935.00, 180.00 | Pass | Pending |
| oath-12 / crimson | Priority | 273.30, -798.46 | 309.23, -615.94 | -225.00, -675.00 | Pass | Pending |
| oath-13 / terraces | Priority | 1158.17, -2.01 | 1094.39, -179.69 | 1080.00, 630.00 | Pass | Pending |
| oath-15 / industrial | Priority | 1884.62, -1519.27 | 2032.46, -1403.77 | 1935.00, -990.00 | Pass | Pending |
| oath-01 / volcanic | Previously inspected | -1968.20, 537.82 | -1810.01, 644.62 | -1665.00, 990.00 | Pass | Pending |
| oath-02 / glacial | Previously inspected | -1344.08, 1429.56 | -1166.52, 1492.25 | -1665.00, 990.00 | Pass | Pending |
| oath-03 / alpine | Previously inspected | -91.04, 1518.05 | -274.02, 1644.80 | -720.00, 1485.00 | Pass | Pending |
| oath-05 / canyon | Previously inspected | -810.52, 618.01 | -653.39, 520.82 | -1395.00, 585.00 | Pass | Pending |
| oath-07 / forest | Previously inspected | -1698.36, -537.09 | -1474.78, -485.78 | -1845.00, 0.00 | Pass | Pending |
| oath-14 / plateau | Previously inspected | 1174.95, -1069.07 | 982.37, -1121.18 | 1575.00, -765.00 | Pass | Pending |

## Reproduce

Use Node >=22.12 (this run used v24.22.1). Install the checked-in dependencies:

```sh
npm ci --prefix game
npm ci --prefix server
npm ci --prefix runtime/ability-matrix
npm ci --prefix runtime/ability-matrix/packs/sandbox
npm run test:terrain
npm run qa:terrain
npm test
npm --prefix server test
node --test $(rg --files game/src -g '*.test.mjs' -g '*.test.js')
npm run mmo:build
```

`qa:terrain` creates the real Three.js world in Node, streams tiles to each viewpoint, checks geometry and tree positions, then drives the real controller. It has no GPU renderer. All material/asset builders are the production ones; no placeholder assets are introduced.

For the staged visual capture on a browser-capable machine, start the game and run:

```sh
npm --prefix game run dev -- --host 127.0.0.1 --port 5173
# separate terminal, use an installed Chromium or Playwright's browser
CHROMIUM_PATH=/path/to/chromium npm run qa:terrain:browser -- http://127.0.0.1:5173 docs/qa/all-realms/rendered
# Explicit software-rendered variant (never label it hardware validation)
CHROMIUM_PATH=/path/to/chromium SOFTWARE_RENDER=1 npm run qa:terrain:browser -- http://127.0.0.1:5173 docs/qa/all-realms/rendered-software
```

The browser runner stages the real game, pauses the simulation, finishes terrain streaming and captures three views per realm. It records source commit, dirty-worktree flag, camera coordinates, quality tier, renderer string, draw counts and errors. It does not measure FPS. **The runner is syntax-checked but its capture path could not be executed end to end here.** The blocked run is retained in `rendered/report.json` with zero captures.

Local Chromium aborted before creating a page: `socket() failed: Operation not permitted` in `process_singleton_posix.cc`. The available cloud browser also returned `ERR_CONNECTION_REFUSED` for the local development server. No render was substituted with generated art or inferred from a CPU mesh.

## Remaining acceptance procedure

For each of the 45 views, inspect ground continuity, LOD skirt visibility, floating/buried vegetation, road/plaza clearance, camp footing, water/shore intersections, bedrock/snow and neighbouring-realm consistency. Capture extra angles for any defect; record accepted/rejected plus reviewer and filename. Repeat at medium/high tiers and a phone viewport. Use the full transition list to inspect remaining road boundaries, not just the first midpoint per realm.

On real target hardware, record device/GPU/driver/browser, viewport, tier, internal resolution, source commit and renderer string. Warm up streaming, then record a fixed 60-second route in each priority realm, frame-time percentiles and hitches; separately play spawn-to-shrine-to-camp and return, checking movement, tree/camera collision, combat and environmental consistency. A software-rendered run or viewport emulation is not a Galaxy A15/Steam Deck validation. No performance threshold is marked passed by this proposal.

Review and explicitly approve the consequential changes before merging or deploying. Keep production assets unchanged.
